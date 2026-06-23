"""KC Paan Inventory + POS backend API.

Two app sections share this one backend:
  - POS (open): list products by popularity, record sales.
  - Stock (PIN-gated client side): add/remove/modify/move inventory.

Demand color coding: weekly demand = units sold over last 28 days / 4.
  healthy  -> shop_qty >= 1 week of demand
  low      -> shop_qty >= ~0.4 week of demand
  order    -> below that (reorder ASAP)
"""
import os
from flask import Flask, jsonify, request
from flask_cors import CORS

from db import get_conn, init_db
import seed as seed_module

app = Flask(__name__)
CORS(app)

STOCK_PIN = os.environ.get("KC_STOCK_PIN", "1031")


def _weekly_demand_map(conn):
    """Units sold per product over the last 28 days, expressed per week."""
    rows = conn.execute(
        """
        SELECT si.product_id AS pid, COALESCE(SUM(si.qty), 0) AS sold
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        WHERE s.created_at >= datetime('now', '-28 days')
        GROUP BY si.product_id
        """
    ).fetchall()
    return {r["pid"]: r["sold"] / 4.0 for r in rows}


def _popularity_map(conn):
    """Total units ever sold per product (for ordering POS cards)."""
    rows = conn.execute(
        "SELECT product_id AS pid, COALESCE(SUM(qty),0) AS total FROM sale_items GROUP BY product_id"
    ).fetchall()
    return {r["pid"]: r["total"] for r in rows}


def _health(shop_qty, weekly_demand, reorder_level):
    """Return 'healthy' | 'low' | 'order'."""
    if weekly_demand <= 0:
        # No recent sales — fall back to the reorder level.
        if shop_qty <= 0:
            return "order"
        if shop_qty <= reorder_level:
            return "low"
        return "healthy"
    if shop_qty >= weekly_demand:
        return "healthy"
    if shop_qty >= weekly_demand * 0.4:
        return "low"
    return "order"


def _serialize_product(row, demand_map, pop_map):
    pid = row["id"]
    demand = demand_map.get(pid, 0.0)
    pop = pop_map.get(pid, 0)
    return {
        "id": pid,
        "name": row["name"],
        "sku": row["sku"],
        "category": row["category"],
        "price": row["price"],
        "shop_qty": row["shop_qty"],
        "warehouse_qty": row["warehouse_qty"],
        "reorder_level": row["reorder_level"],
        "emoji": row["emoji"],
        "weekly_demand": round(demand, 1),
        "popularity": pop,
        "health": _health(row["shop_qty"], demand, row["reorder_level"]),
    }


@app.get("/api/health")
def health_check():
    return jsonify({"ok": True, "service": "kcpaan-inventory"})


@app.get("/api/products")
def list_products():
    """All active products, ordered by popularity (most sold first)."""
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM products WHERE archived = 0").fetchall()
        demand_map = _weekly_demand_map(conn)
        pop_map = _popularity_map(conn)
    products = [_serialize_product(r, demand_map, pop_map) for r in rows]
    products.sort(key=lambda p: (-p["popularity"], p["name"].lower()))
    return jsonify(products)


@app.post("/api/products")
def create_product():
    d = request.get_json(force=True)
    with get_conn() as conn:
        cur = conn.execute(
            """INSERT INTO products (name, sku, category, price, shop_qty, warehouse_qty, reorder_level, emoji)
               VALUES (?,?,?,?,?,?,?,?)""",
            (
                d.get("name", "").strip(),
                d.get("sku"),
                d.get("category"),
                float(d.get("price", 0)),
                int(d.get("shop_qty", 0)),
                int(d.get("warehouse_qty", 0)),
                int(d.get("reorder_level", 5)),
                d.get("emoji"),
            ),
        )
        pid = cur.lastrowid
        row = conn.execute("SELECT * FROM products WHERE id = ?", (pid,)).fetchone()
        demand_map = _weekly_demand_map(conn)
        pop_map = _popularity_map(conn)
    return jsonify(_serialize_product(row, demand_map, pop_map)), 201


@app.put("/api/products/<int:pid>")
def update_product(pid):
    d = request.get_json(force=True)
    fields = ["name", "sku", "category", "price", "reorder_level", "emoji"]
    sets, vals = [], []
    for f in fields:
        if f in d:
            sets.append(f"{f} = ?")
            vals.append(d[f])
    if not sets:
        return jsonify({"error": "no fields"}), 400
    sets.append("updated_at = datetime('now')")
    vals.append(pid)
    with get_conn() as conn:
        conn.execute(f"UPDATE products SET {', '.join(sets)} WHERE id = ?", vals)
        row = conn.execute("SELECT * FROM products WHERE id = ?", (pid,)).fetchone()
        demand_map = _weekly_demand_map(conn)
        pop_map = _popularity_map(conn)
    if not row:
        return jsonify({"error": "not found"}), 404
    return jsonify(_serialize_product(row, demand_map, pop_map))


@app.delete("/api/products/<int:pid>")
def archive_product(pid):
    with get_conn() as conn:
        conn.execute("UPDATE products SET archived = 1 WHERE id = ?", (pid,))
    return jsonify({"ok": True})


@app.post("/api/products/<int:pid>/stock")
def adjust_stock(pid):
    """Add/remove/adjust stock at a location, or move warehouse<->shop.

    Body: {kind, location, delta, note}
      kind 'move' uses delta>0 = warehouse->shop, delta<0 = shop->warehouse.
    """
    d = request.get_json(force=True)
    kind = d.get("kind", "adjust")
    location = d.get("location", "shop")
    delta = int(d.get("delta", 0))
    note = d.get("note")

    with get_conn() as conn:
        row = conn.execute("SELECT * FROM products WHERE id = ?", (pid,)).fetchone()
        if not row:
            return jsonify({"error": "not found"}), 404

        if kind == "move":
            # delta>0: warehouse -> shop ; delta<0: shop -> warehouse
            n = abs(delta)
            if delta >= 0:
                conn.execute(
                    "UPDATE products SET shop_qty = shop_qty + ?, warehouse_qty = warehouse_qty - ?, updated_at=datetime('now') WHERE id = ?",
                    (n, n, pid),
                )
                conn.execute(
                    "INSERT INTO stock_moves (product_id, kind, location, delta, note) VALUES (?,?,?,?,?)",
                    (pid, "move", "warehouse", -n, note or "warehouse->shop"),
                )
                conn.execute(
                    "INSERT INTO stock_moves (product_id, kind, location, delta, note) VALUES (?,?,?,?,?)",
                    (pid, "move", "shop", n, note or "warehouse->shop"),
                )
            else:
                conn.execute(
                    "UPDATE products SET shop_qty = shop_qty - ?, warehouse_qty = warehouse_qty + ?, updated_at=datetime('now') WHERE id = ?",
                    (n, n, pid),
                )
                conn.execute(
                    "INSERT INTO stock_moves (product_id, kind, location, delta, note) VALUES (?,?,?,?,?)",
                    (pid, "move", "shop", -n, note or "shop->warehouse"),
                )
                conn.execute(
                    "INSERT INTO stock_moves (product_id, kind, location, delta, note) VALUES (?,?,?,?,?)",
                    (pid, "move", "warehouse", n, note or "shop->warehouse"),
                )
        else:
            col = "warehouse_qty" if location == "warehouse" else "shop_qty"
            conn.execute(
                f"UPDATE products SET {col} = {col} + ?, updated_at=datetime('now') WHERE id = ?",
                (delta, pid),
            )
            conn.execute(
                "INSERT INTO stock_moves (product_id, kind, location, delta, note) VALUES (?,?,?,?,?)",
                (pid, kind, location, delta, note),
            )

        row = conn.execute("SELECT * FROM products WHERE id = ?", (pid,)).fetchone()
        demand_map = _weekly_demand_map(conn)
        pop_map = _popularity_map(conn)
    return jsonify(_serialize_product(row, demand_map, pop_map))


@app.post("/api/sales")
def create_sale():
    """Record a sale. Body: {payment_type, items:[{product_id, qty}]}.
    Decrements shop_qty for each item."""
    d = request.get_json(force=True)
    payment_type = d.get("payment_type", "cash")
    items = d.get("items", [])
    if not items:
        return jsonify({"error": "no items"}), 400

    with get_conn() as conn:
        total = 0.0
        resolved = []
        for it in items:
            row = conn.execute("SELECT * FROM products WHERE id = ?", (it["product_id"],)).fetchone()
            if not row:
                continue
            qty = int(it["qty"])
            line = row["price"] * qty
            total += line
            resolved.append((row, qty))

        cur = conn.execute(
            "INSERT INTO sales (payment_type, total) VALUES (?,?)", (payment_type, total)
        )
        sale_id = cur.lastrowid

        for row, qty in resolved:
            conn.execute(
                "INSERT INTO sale_items (sale_id, product_id, name, qty, price) VALUES (?,?,?,?,?)",
                (sale_id, row["id"], row["name"], qty, row["price"]),
            )
            conn.execute(
                "UPDATE products SET shop_qty = shop_qty - ?, updated_at=datetime('now') WHERE id = ?",
                (qty, row["id"]),
            )
            conn.execute(
                "INSERT INTO stock_moves (product_id, kind, location, delta, note) VALUES (?,?,?,?,?)",
                (row["id"], "sale", "shop", -qty, f"sale #{sale_id}"),
            )

    return jsonify({"id": sale_id, "total": round(total, 2), "payment_type": payment_type}), 201


@app.get("/api/sales/summary")
def sales_summary():
    """Quick totals for today (used by POS header)."""
    with get_conn() as conn:
        row = conn.execute(
            """SELECT COUNT(*) AS cnt, COALESCE(SUM(total),0) AS total
               FROM sales WHERE created_at >= date('now','localtime')"""
        ).fetchone()
        by_type = conn.execute(
            """SELECT payment_type, COUNT(*) AS cnt, COALESCE(SUM(total),0) AS total
               FROM sales WHERE created_at >= date('now','localtime') GROUP BY payment_type"""
        ).fetchall()
    return jsonify({
        "count": row["cnt"],
        "total": round(row["total"], 2),
        "by_type": {r["payment_type"]: {"count": r["cnt"], "total": round(r["total"], 2)} for r in by_type},
    })


@app.post("/api/verify-pin")
def verify_pin():
    d = request.get_json(force=True)
    return jsonify({"ok": str(d.get("pin", "")) == STOCK_PIN})


# Initialise DB + seed on import (safe/idempotent), so gunicorn workers are ready.
init_db()
seed_module.seed_if_empty()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5005)), debug=True)
