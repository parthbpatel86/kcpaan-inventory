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
        "image_url": row["image_url"] if "image_url" in row.keys() else None,
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
            """INSERT INTO products (name, sku, category, price, shop_qty, warehouse_qty, reorder_level, emoji, image_url)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (
                d.get("name", "").strip(),
                d.get("sku"),
                d.get("category"),
                float(d.get("price", 0)),
                int(d.get("shop_qty", 0)),
                int(d.get("warehouse_qty", 0)),
                int(d.get("reorder_level", 5)),
                d.get("emoji"),
                d.get("image_url"),
            ),
        )
        pid = cur.lastrowid
        row = conn.execute("SELECT * FROM products WHERE id = ?", (pid,)).fetchone()
        demand_map = _weekly_demand_map(conn)
        pop_map = _popularity_map(conn)
    return jsonify(_serialize_product(row, demand_map, pop_map)), 201


@app.post("/api/products/import")
def import_products():
    """Bulk import. Body: {items:[{name,price,shop_qty,...}], replace:bool}.
    If replace=true, archives all existing products first (clean catalog swap)."""
    d = request.get_json(force=True)
    items = d.get("items", [])
    replace = bool(d.get("replace", False))
    created = 0
    with get_conn() as conn:
        if replace:
            conn.execute("UPDATE products SET archived = 1")
        for it in items:
            name = (it.get("name") or "").strip()
            if not name:
                continue
            conn.execute(
                """INSERT INTO products (name, sku, category, price, shop_qty, warehouse_qty, reorder_level, emoji, image_url)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                (
                    name,
                    it.get("sku"),
                    it.get("category"),
                    float(it.get("price", 0)),
                    int(it.get("shop_qty", 0)),
                    int(it.get("warehouse_qty", 0)),
                    int(it.get("reorder_level", 5)),
                    it.get("emoji"),
                    it.get("image_url"),
                ),
            )
            created += 1
    return jsonify({"imported": created, "replaced": replace}), 201


@app.put("/api/products/<int:pid>")
def update_product(pid):
    d = request.get_json(force=True)
    fields = ["name", "sku", "category", "price", "reorder_level", "emoji", "image_url"]
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
    discount = max(0.0, float(d.get("discount", 0) or 0))
    if not items:
        return jsonify({"error": "no items"}), 400

    with get_conn() as conn:
        subtotal = 0.0
        resolved = []
        for it in items:
            row = conn.execute("SELECT * FROM products WHERE id = ?", (it["product_id"],)).fetchone()
            if not row:
                continue
            qty = int(it["qty"])
            line = row["price"] * qty
            subtotal += line
            resolved.append((row, qty))

        discount = min(discount, subtotal)  # never below zero
        total = subtotal - discount

        cur = conn.execute(
            "INSERT INTO sales (payment_type, subtotal, discount, total) VALUES (?,?,?,?)",
            (payment_type, subtotal, discount, total),
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

    return jsonify({"id": sale_id, "subtotal": round(subtotal, 2), "discount": round(discount, 2),
                    "total": round(total, 2), "payment_type": payment_type}), 201


@app.get("/api/sales")
def list_sales():
    """Sale history. Query: ?date=YYYY-MM-DD (default today), ?limit, ?all=1 (all dates)."""
    date = request.args.get("date")
    limit = int(request.args.get("limit", 100))
    show_all = request.args.get("all") == "1"
    with get_conn() as conn:
        if show_all:
            rows = conn.execute(
                "SELECT * FROM sales ORDER BY created_at DESC LIMIT ?", (limit,)
            ).fetchall()
        else:
            day = date or "now"
            arg = "now" if day == "now" else day
            rows = conn.execute(
                "SELECT * FROM sales WHERE date(created_at,'localtime') = date(?, 'localtime') ORDER BY created_at DESC LIMIT ?",
                (arg, limit),
            ).fetchall()
    return jsonify([_serialize_sale(r) for r in rows])


def _serialize_sale(row, items=None):
    keys = row.keys()
    return {
        "id": row["id"],
        "payment_type": row["payment_type"],
        "subtotal": round(row["subtotal"] if "subtotal" in keys else row["total"], 2),
        "discount": round(row["discount"] if "discount" in keys else 0, 2),
        "total": round(row["total"], 2),
        "voided": bool(row["voided"]) if "voided" in keys else False,
        "created_at": row["created_at"],
        "items": items,
    }


@app.get("/api/sales/<int:sale_id>")
def get_sale(sale_id):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM sales WHERE id = ?", (sale_id,)).fetchone()
        if not row:
            return jsonify({"error": "not found"}), 404
        items = conn.execute(
            "SELECT name, qty, price FROM sale_items WHERE sale_id = ?", (sale_id,)
        ).fetchall()
    return jsonify(_serialize_sale(row, [dict(i) for i in items]))


@app.post("/api/sales/<int:sale_id>/void")
def void_sale(sale_id):
    """Void a sale and return its items to shop stock."""
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM sales WHERE id = ?", (sale_id,)).fetchone()
        if not row:
            return jsonify({"error": "not found"}), 404
        if "voided" in row.keys() and row["voided"]:
            return jsonify({"error": "already voided"}), 400
        items = conn.execute("SELECT * FROM sale_items WHERE sale_id = ?", (sale_id,)).fetchall()
        for it in items:
            conn.execute(
                "UPDATE products SET shop_qty = shop_qty + ?, updated_at=datetime('now') WHERE id = ?",
                (it["qty"], it["product_id"]),
            )
            conn.execute(
                "INSERT INTO stock_moves (product_id, kind, location, delta, note) VALUES (?,?,?,?,?)",
                (it["product_id"], "void", "shop", it["qty"], f"void sale #{sale_id}"),
            )
        conn.execute("UPDATE sales SET voided = 1 WHERE id = ?", (sale_id,))
    return jsonify({"ok": True, "voided": sale_id})


@app.get("/api/reports")
def reports():
    """Sales analytics over a date range. Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD (default last 7 days)."""
    frm = request.args.get("from")
    to = request.args.get("to")
    with get_conn() as conn:
        # default: last 7 days through today
        if not frm:
            frm = conn.execute("SELECT date('now','localtime','-6 days')").fetchone()[0]
        if not to:
            to = conn.execute("SELECT date('now','localtime')").fetchone()[0]

        where = "voided = 0 AND date(created_at,'localtime') BETWEEN date(?) AND date(?)"
        totals = conn.execute(
            f"SELECT COUNT(*) AS cnt, COALESCE(SUM(total),0) AS total, COALESCE(SUM(discount),0) AS discount FROM sales WHERE {where}",
            (frm, to),
        ).fetchone()
        by_type = conn.execute(
            f"SELECT payment_type, COUNT(*) AS cnt, COALESCE(SUM(total),0) AS total FROM sales WHERE {where} GROUP BY payment_type",
            (frm, to),
        ).fetchall()
        by_day = conn.execute(
            f"SELECT date(created_at,'localtime') AS day, COUNT(*) AS cnt, COALESCE(SUM(total),0) AS total FROM sales WHERE {where} GROUP BY day ORDER BY day",
            (frm, to),
        ).fetchall()
        top_items = conn.execute(
            f"""SELECT si.name AS name, SUM(si.qty) AS qty, SUM(si.qty*si.price) AS revenue
                FROM sale_items si JOIN sales s ON s.id = si.sale_id
                WHERE s.voided = 0 AND date(s.created_at,'localtime') BETWEEN date(?) AND date(?)
                GROUP BY si.name ORDER BY qty DESC LIMIT 10""",
            (frm, to),
        ).fetchall()
    return jsonify({
        "from": frm, "to": to,
        "total": round(totals["total"], 2),
        "count": totals["cnt"],
        "discount": round(totals["discount"], 2),
        "by_type": {r["payment_type"]: {"count": r["cnt"], "total": round(r["total"], 2)} for r in by_type},
        "by_day": [{"day": r["day"], "count": r["cnt"], "total": round(r["total"], 2)} for r in by_day],
        "top_items": [{"name": r["name"], "qty": r["qty"], "revenue": round(r["revenue"], 2)} for r in top_items],
    })


@app.get("/api/sales/summary")
def sales_summary():
    """Quick totals for today (used by POS header)."""
    with get_conn() as conn:
        row = conn.execute(
            """SELECT COUNT(*) AS cnt, COALESCE(SUM(total),0) AS total
               FROM sales WHERE voided = 0 AND created_at >= date('now','localtime')"""
        ).fetchone()
        by_type = conn.execute(
            """SELECT payment_type, COUNT(*) AS cnt, COALESCE(SUM(total),0) AS total
               FROM sales WHERE voided = 0 AND created_at >= date('now','localtime') GROUP BY payment_type"""
        ).fetchall()
    return jsonify({
        "count": row["cnt"],
        "total": round(row["total"], 2),
        "by_type": {r["payment_type"]: {"count": r["cnt"], "total": round(r["total"], 2)} for r in by_type},
    })


@app.get("/api/dashboard")
def dashboard():
    """One call for the home screen: today's sales + items needing reorder."""
    with get_conn() as conn:
        today = conn.execute(
            """SELECT COUNT(*) AS cnt, COALESCE(SUM(total),0) AS total
               FROM sales WHERE voided = 0 AND created_at >= date('now','localtime')"""
        ).fetchone()
        by_type = conn.execute(
            """SELECT payment_type, COALESCE(SUM(total),0) AS total
               FROM sales WHERE voided = 0 AND created_at >= date('now','localtime') GROUP BY payment_type"""
        ).fetchall()

        rows = conn.execute("SELECT * FROM products WHERE archived = 0").fetchall()
        demand_map = _weekly_demand_map(conn)
        pop_map = _popularity_map(conn)

    products = [_serialize_product(r, demand_map, pop_map) for r in rows]
    reorder = [p for p in products if p["health"] == "order"]
    low = [p for p in products if p["health"] == "low"]
    reorder.sort(key=lambda p: p["shop_qty"])

    return jsonify({
        "today": {
            "count": today["cnt"],
            "total": round(today["total"], 2),
            "by_type": {r["payment_type"]: round(r["total"], 2) for r in by_type},
        },
        "reorder_count": len(reorder),
        "low_count": len(low),
        "reorder": reorder,  # full product objects, sorted most-urgent first
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
