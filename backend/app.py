"""KC Paan Inventory + POS backend API.

Two app sections share this one backend:
  - POS (open): list products by popularity, record sales.
  - Stock (PIN-gated client side): add/remove/modify/move inventory.

Demand color coding: weekly demand = units sold over last 28 days / 4.
  healthy  -> shop_qty >= 1 week of demand
  low      -> shop_qty >= ~0.4 week of demand
  order    -> below that (reorder ASAP)
"""
import hashlib
import os
from flask import Flask, jsonify, request
from flask_cors import CORS

from db import get_conn, init_db, USE_PG
import seed as seed_module

app = Flask(__name__)
CORS(app)


def _get_pin(conn):
    """PIN lives in the settings table (seeded by init_db); env is a fallback."""
    row = conn.execute("SELECT value FROM settings WHERE key = 'stock_pin'").fetchone()
    return row["value"] if row else os.environ.get("KC_STOCK_PIN", "0000")


def _setting(conn, key, default):
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    try:
        return float(row["value"]) if row else float(default)
    except (TypeError, ValueError):
        return float(default)


def _open_hours(conn, punch_in):
    """Hours a punch has been open. Postgres returns datetimes, SQLite strings."""
    if punch_in is None:
        return None
    row = conn.execute(
        "SELECT EXTRACT(EPOCH FROM (now() - ?))/3600.0 AS h" if USE_PG
        else "SELECT (julianday('now') - julianday(?)) * 24.0 AS h",
        (punch_in,),
    ).fetchone()
    try:
        return float(row["h"]) if row and row["h"] is not None else None
    except (TypeError, ValueError):
        return None


def _resolve_discount(conn, d, subtotal):
    """Compute the discount server-side so the client can never over-discount.

    payment_type 'employee' -> employee_discount_pct of subtotal (never stacks)
    otherwise               -> discount / discount_pct, capped at max_discount_pct

    The employee rate is driven by the payment type itself, not by a client
    flag: EMPLOYEE is a payment button, so staff can never be charged full
    price because the client forgot to send the flag.
    """
    if subtotal <= 0:
        return 0.0
    is_employee = (
        str(d.get("payment_type") or "").lower() == "employee"
        or bool(d.get("employee_discount"))
    )
    if is_employee:
        pct = _setting(conn, "employee_discount_pct", 8)
        return round(subtotal * pct / 100.0, 2)

    cap = round(subtotal * _setting(conn, "max_discount_pct", 10) / 100.0, 2)
    if d.get("discount_pct") is not None:
        try:
            pct = max(0.0, float(d.get("discount_pct") or 0))
        except (TypeError, ValueError):
            pct = 0.0
        amount = round(subtotal * pct / 100.0, 2)
    else:
        try:
            amount = max(0.0, float(d.get("discount", 0) or 0))
        except (TypeError, ValueError):
            amount = 0.0
    return round(min(amount, cap, subtotal), 2)


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
    """Record a sale. Body: {payment_type, items:[{product_id, qty}],
    discount, employee_discount, client_ref}.

    Prices always come from the DB, never the client. Stock is guarded so a
    sale cannot drive shop_qty negative, and client_ref makes a retried POST
    return the original sale instead of charging twice.
    """
    d = request.get_json(force=True)
    payment_type = d.get("payment_type", "cash")
    items = d.get("items", [])
    client_ref = (d.get("client_ref") or "").strip() or None
    if not items:
        return jsonify({"error": "no items"}), 400

    with get_conn() as conn:
        # Idempotency: this exact sale was already recorded — return it as-is.
        if client_ref:
            prev = conn.execute("SELECT * FROM sales WHERE client_ref = ?", (client_ref,)).fetchone()
            if prev:
                return jsonify({"id": prev["id"], "subtotal": round(prev["subtotal"], 2),
                                "discount": round(prev["discount"], 2), "total": round(prev["total"], 2),
                                "payment_type": prev["payment_type"], "duplicate": True}), 200

        subtotal = 0.0
        resolved = []
        missing, short = [], []
        for it in items:
            row = conn.execute("SELECT * FROM products WHERE id = ?", (it["product_id"],)).fetchone()
            if not row:
                missing.append(it.get("product_id"))
                continue
            qty = int(it["qty"])
            if qty <= 0:
                continue
            if row["shop_qty"] < qty:
                short.append({"id": row["id"], "name": row["name"],
                              "requested": qty, "available": row["shop_qty"]})
                continue
            subtotal += row["price"] * qty
            resolved.append((row, qty))

        # Fail loudly instead of silently dropping lines from the sale.
        if missing:
            return jsonify({"error": "unknown products", "product_ids": missing}), 400
        if short:
            return jsonify({"error": "insufficient stock", "items": short}), 409
        if not resolved:
            return jsonify({"error": "no sellable items"}), 400

        discount = _resolve_discount(conn, d, subtotal)
        total = round(subtotal - discount, 2)

        cur = conn.execute(
            "INSERT INTO sales (payment_type, subtotal, discount, total, client_ref) VALUES (?,?,?,?,?)",
            (payment_type, subtotal, discount, total, client_ref),
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
    # default: last 7 days through today (computed in Python — dialect-neutral)
    from datetime import date, timedelta
    if not to:
        to = date.today().isoformat()
    if not frm:
        frm = (date.today() - timedelta(days=6)).isoformat()
    with get_conn() as conn:

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
    with get_conn() as conn:
        pin = _get_pin(conn)
    ok = str(d.get("pin", "")) == pin
    resp = {"ok": ok}
    if ok:
        # Client caches this to verify the PIN offline when the server is down.
        resp["pin_hash"] = hashlib.sha256(pin.encode()).hexdigest()
    return jsonify(resp)


@app.get("/api/settings")
def get_settings():
    """Tunables the app reads at startup (employee %, discount cap, punch hours)."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT key, value FROM settings WHERE key <> 'stock_pin'"
        ).fetchall()
    return jsonify({r["key"]: r["value"] for r in rows})


@app.put("/api/settings")
def update_settings():
    """Manager-editable tunables. stock_pin is settable here too (manager UI)."""
    d = request.get_json(force=True)
    allowed = {"employee_discount_pct", "max_discount_pct", "punch_max_hours", "stock_pin"}
    with get_conn() as conn:
        for k, v in d.items():
            if k not in allowed:
                continue
            row = conn.execute("SELECT 1 FROM settings WHERE key = ?", (k,)).fetchone()
            if row:
                conn.execute("UPDATE settings SET value = ? WHERE key = ?", (str(v), k))
            else:
                conn.execute("INSERT INTO settings (key, value) VALUES (?,?)", (k, str(v)))
        rows = conn.execute("SELECT key, value FROM settings WHERE key <> 'stock_pin'").fetchall()
    return jsonify({r["key"]: r["value"] for r in rows})


# --------------------------------------------------------------------------
# Employees + time clock
#
# Identity is a per-employee PIN. The phone's biometric API only proves the
# DEVICE OWNER authenticated -- it cannot say WHICH employee -- so a real
# fingerprint reader would populate employees.finger_id and call the same
# /api/punch endpoint. Nothing else would change.
# --------------------------------------------------------------------------
@app.get("/api/employees")
def list_employees():
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, name, active FROM employees WHERE active = 1 ORDER BY name"
        ).fetchall()
        open_rows = conn.execute(
            "SELECT employee_id FROM punches WHERE punch_out IS NULL"
        ).fetchall()
    open_ids = {r["employee_id"] for r in open_rows}
    return jsonify([
        {"id": r["id"], "name": r["name"], "on_clock": r["id"] in open_ids} for r in rows
    ])


@app.post("/api/employees")
def create_employee():
    d = request.get_json(force=True)
    name = (d.get("name") or "").strip()
    pin = str(d.get("pin") or "").strip()
    if not name or not pin:
        return jsonify({"error": "name and pin required"}), 400
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO employees (name, pin, finger_id) VALUES (?,?,?)",
            (name, pin, d.get("finger_id")),
        )
        eid = cur.lastrowid
    return jsonify({"id": eid, "name": name}), 201


@app.put("/api/employees/<int:eid>")
def update_employee(eid):
    d = request.get_json(force=True)
    sets, vals = [], []
    for f in ("name", "pin", "active", "finger_id"):
        if f in d:
            sets.append(f"{f} = ?")
            vals.append(d[f])
    if not sets:
        return jsonify({"error": "no fields"}), 400
    vals.append(eid)
    with get_conn() as conn:
        conn.execute(f"UPDATE employees SET {', '.join(sets)} WHERE id = ?", vals)
    return jsonify({"ok": True})


@app.post("/api/punch")
def punch():
    """Toggle punch in/out for the employee matching this PIN.

    Rules Parth asked for:
      - open punch older than punch_max_hours (14) -> flag MISSING_OUT, needs a
        manager fix; a new punch-in is started so the employee is not blocked.
      - punch-out with no open punch -> record a flagged MISSING_IN row.
    """
    d = request.get_json(force=True)
    pin = str(d.get("pin") or "").strip()
    if not pin:
        return jsonify({"error": "pin required"}), 400

    with get_conn() as conn:
        emp = conn.execute(
            "SELECT * FROM employees WHERE pin = ? AND active = 1", (pin,)
        ).fetchone()
        if not emp:
            return jsonify({"error": "unknown pin"}), 404

        max_h = _setting(conn, "punch_max_hours", 14)
        open_p = conn.execute(
            "SELECT * FROM punches WHERE employee_id = ? AND punch_out IS NULL ORDER BY punch_in DESC",
            (emp["id"],),
        ).fetchone()

        if open_p:
            hours = _open_hours(conn, open_p["punch_in"])
            if hours is not None and hours > max_h:
                # Forgot to punch out: flag the stale row, start a fresh one.
                conn.execute(
                    "UPDATE punches SET flag = 'MISSING_OUT' WHERE id = ?", (open_p["id"],)
                )
                conn.execute(
                    "INSERT INTO punches (employee_id, punch_in) VALUES (?, datetime('now'))",
                    (emp["id"],),
                )
                return jsonify({"action": "in", "employee": emp["name"],
                                "warning": "previous shift was not closed — manager must fix"}), 201
            conn.execute(
                "UPDATE punches SET punch_out = datetime('now') WHERE id = ?", (open_p["id"],)
            )
            return jsonify({"action": "out", "employee": emp["name"]}), 200

        # No open punch. If the employee explicitly meant to clock OUT, they
        # forgot to clock in — record it flagged so a manager fixes the time.
        if d.get("intent") == "out":
            conn.execute(
                "INSERT INTO punches (employee_id, punch_out, flag) VALUES (?, datetime('now'), 'MISSING_IN')",
                (emp["id"],),
            )
            return jsonify({"action": "out", "employee": emp["name"], "flag": "MISSING_IN",
                            "warning": "no punch-in found — manager must set the start time"}), 201

        conn.execute(
            "INSERT INTO punches (employee_id, punch_in) VALUES (?, datetime('now'))",
            (emp["id"],),
        )
    return jsonify({"action": "in", "employee": emp["name"]}), 201


@app.get("/api/timesheet")
def timesheet():
    """?employee_id=&start=YYYY-MM-DD&end=YYYY-MM-DD  (half-month windows)."""
    eid = request.args.get("employee_id")
    start = request.args.get("start")
    end = request.args.get("end")
    q = ["SELECT p.*, e.name AS employee_name FROM punches p JOIN employees e ON e.id = p.employee_id WHERE 1=1"]
    vals = []
    if eid:
        q.append("AND p.employee_id = ?")
        vals.append(int(eid))
    if start:
        q.append("AND date(p.punch_in) >= date(?)")
        vals.append(start)
    if end:
        q.append("AND date(p.punch_in) <= date(?)")
        vals.append(end)
    q.append("ORDER BY p.punch_in DESC")
    with get_conn() as conn:
        rows = conn.execute(" ".join(q), vals).fetchall()
    out = []
    for r in rows:
        out.append({
            "id": r["id"], "employee_id": r["employee_id"], "employee_name": r["employee_name"],
            "punch_in": str(r["punch_in"]) if r["punch_in"] else None,
            "punch_out": str(r["punch_out"]) if r["punch_out"] else None,
            "flag": r["flag"], "note": r["note"],
        })
    return jsonify(out)


@app.put("/api/punches/<int:pid>")
def fix_punch(pid):
    """Manager correction. Every change is written to punch_audit."""
    d = request.get_json(force=True)
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM punches WHERE id = ?", (pid,)).fetchone()
        if not row:
            return jsonify({"error": "not found"}), 404
        for field in ("punch_in", "punch_out", "flag", "note"):
            if field not in d:
                continue
            old = row[field]
            new = d[field]
            if str(old) == str(new):
                continue
            conn.execute(f"UPDATE punches SET {field} = ? WHERE id = ?", (new, pid))
            conn.execute(
                "INSERT INTO punch_audit (punch_id, field, old_value, new_value, changed_by) VALUES (?,?,?,?,?)",
                (pid, field, str(old), str(new), d.get("changed_by", "manager")),
            )
        # Retention: manager edit log is kept for 3 months.
        conn.execute("DELETE FROM punch_audit WHERE changed_at < datetime('now','-90 days')")
    return jsonify({"ok": True})


@app.get("/api/punch-audit")
def punch_audit():
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM punch_audit ORDER BY changed_at DESC LIMIT 200"
        ).fetchall()
    return jsonify([{ "id": r["id"], "punch_id": r["punch_id"], "field": r["field"],
                      "old_value": r["old_value"], "new_value": r["new_value"],
                      "changed_by": r["changed_by"], "changed_at": str(r["changed_at"]) }
                    for r in rows])


# --------------------------------------------------------------------------
# Shift close
# --------------------------------------------------------------------------
@app.get("/api/shift/summary")
def shift_summary():
    """Expected drawer + CC/SHOP breakdown for a business date (default today)."""
    date = request.args.get("date")
    with get_conn() as conn:
        if date:
            rows = conn.execute(
                """SELECT payment_type, COALESCE(SUM(total),0) AS total, COUNT(*) AS cnt
                   FROM sales WHERE voided = 0 AND date(created_at,'localtime') = date(?)
                   GROUP BY payment_type""", (date,)).fetchall()
        else:
            rows = conn.execute(
                """SELECT payment_type, COALESCE(SUM(total),0) AS total, COUNT(*) AS cnt
                   FROM sales WHERE voided = 0 AND created_at >= date('now','localtime')
                   GROUP BY payment_type""").fetchall()
        existing = conn.execute(
            "SELECT * FROM shift_closes WHERE business_date = date(?)",
            (date or "now",),
        ).fetchone() if date else conn.execute(
            "SELECT * FROM shift_closes WHERE business_date = date('now','localtime')"
        ).fetchone()

    by_type = {r["payment_type"]: round(r["total"], 2) for r in rows}
    counts = {r["payment_type"]: r["cnt"] for r in rows}
    return jsonify({
        "by_type": by_type,
        "counts": counts,
        "expected_cash": round(by_type.get("cash", 0), 2),
        "cc_total": round(by_type.get("card", 0), 2),
        "shop_total": round(by_type.get("instore", 0) + by_type.get("shop", 0), 2),
        "employee_total": round(by_type.get("employee", 0), 2),
        "sales_total": round(sum(by_type.values()), 2),
        "closed": bool(existing),
    })


@app.post("/api/shift/close")
def close_shift():
    """Manager end-of-day. Punches stay independent so staff can clock out later."""
    d = request.get_json(force=True)
    date = d.get("business_date")
    paan = float(d.get("paan_cash", 0) or 0)
    tob = float(d.get("tobacco_cash", 0) or 0)
    with get_conn() as conn:
        if date:
            rows = conn.execute(
                """SELECT payment_type, COALESCE(SUM(total),0) AS total FROM sales
                   WHERE voided = 0 AND date(created_at,'localtime') = date(?) GROUP BY payment_type""",
                (date,)).fetchall()
            bdate = date
        else:
            rows = conn.execute(
                """SELECT payment_type, COALESCE(SUM(total),0) AS total FROM sales
                   WHERE voided = 0 AND created_at >= date('now','localtime') GROUP BY payment_type""").fetchall()
            bdate = conn.execute("SELECT date('now','localtime') AS d").fetchone()["d"]
        by = {r["payment_type"]: r["total"] for r in rows}
        expected = round(by.get("cash", 0), 2)
        cc = round(by.get("card", 0), 2)
        shop = round(by.get("instore", 0) + by.get("shop", 0), 2)

        prev = conn.execute(
            "SELECT id FROM shift_closes WHERE business_date = ?", (str(bdate),)
        ).fetchone()
        if prev:
            conn.execute(
                """UPDATE shift_closes SET paan_cash=?, tobacco_cash=?, expected_cash=?,
                   cc_total=?, shop_total=?, note=? WHERE id = ?""",
                (paan, tob, expected, cc, shop, d.get("note"), prev["id"]),
            )
            sid = prev["id"]
        else:
            cur = conn.execute(
                """INSERT INTO shift_closes (business_date, paan_cash, tobacco_cash,
                   expected_cash, cc_total, shop_total, note) VALUES (?,?,?,?,?,?,?)""",
                (str(bdate), paan, tob, expected, cc, shop, d.get("note")),
            )
            sid = cur.lastrowid
    counted = round(paan + tob, 2)
    return jsonify({"id": sid, "business_date": str(bdate), "expected_cash": expected,
                    "counted_cash": counted, "over_short": round(counted - expected, 2),
                    "cc_total": cc, "shop_total": shop}), 201


@app.get("/api/shift/closes")
def list_closes():
    """Previous days, individually. No all-time sum — that stays owner-only."""
    limit = int(request.args.get("limit", 30))
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM shift_closes ORDER BY business_date DESC LIMIT ?", (limit,)
        ).fetchall()
    return jsonify([{ "id": r["id"], "business_date": str(r["business_date"]),
                      "paan_cash": r["paan_cash"], "tobacco_cash": r["tobacco_cash"],
                      "expected_cash": r["expected_cash"], "cc_total": r["cc_total"],
                      "shop_total": r["shop_total"],
                      "over_short": round((r["paan_cash"] + r["tobacco_cash"]) - r["expected_cash"], 2),
                      "note": r["note"] } for r in rows])


# Initialise DB on import so gunicorn workers are ready.
init_db()
# Only auto-seed sample products on local SQLite dev. In production (Postgres),
# never seed — the real catalog lives there and an empty table is not a cue to
# overwrite it with samples.
if not os.environ.get("DATABASE_URL"):
    seed_module.seed_if_empty()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5005)), debug=True)
