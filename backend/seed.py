"""Seed sample KC Paan products + a little sales history (for demand colors)."""
from db import get_conn

# Sample products — swap for the real Zobaze export later.
# Shop quantities are set to give a realistic mix of healthy/low/order colors
# relative to the weekly demand defined below.
# (name, sku, category, price, shop_qty, warehouse_qty, reorder_level, emoji)
PRODUCTS = [
    ("Meetha Paan",        "PAAN-MTH", "Paan",      3.00, 110, 240, 30, "🍃"),  # healthy
    ("Banarasi Paan",      "PAAN-BNR", "Paan",      4.00,  40, 120, 20, "🍃"),  # low
    ("Chocolate Paan",     "PAAN-CHC", "Paan",      5.00,  60, 100, 15, "🍫"),  # healthy
    ("Saada Paan",         "PAAN-SAD", "Paan",      2.50,  35, 140, 25, "🍃"),  # low
    ("Gulkand Paan",       "PAAN-GLK", "Paan",      4.50,   8,  60, 12, "🌹"),  # order
    ("Fire Paan",          "PAAN-FIRE","Paan",      6.00,  26,  40,  8, "🔥"),  # healthy
    ("Masala Soda",        "DRNK-MSD", "Drinks",    2.00,  55, 120, 18, "🥤"),  # healthy
    ("Thums Up",           "DRNK-TUP", "Drinks",    2.00,  18,  60, 15, "🥤"),  # low
    ("Mango Lassi",        "DRNK-MLS", "Drinks",    4.00,   5,  30,  8, "🥭"),  # order
    ("Paan Masala Pack",   "PCK-PMS",  "Packaged",  1.50,  95, 250, 30, "📦"),  # healthy
    ("Mouth Freshener",    "PCK-MFR",  "Packaged",  1.00,  30, 220, 25, "🌿"),  # low
    ("Rajnigandha",        "PCK-RJG",  "Packaged",  2.50,  48, 130, 18, "📦"),  # healthy
    ("Silver Coated Paan", "PAAN-SLV", "Premium",   8.00,  12,  20,  5, "🥈"),  # healthy
    ("Dry Fruit Paan",     "PAAN-DFR", "Premium",   7.00,   4,  24,  6, "🥜"),  # order
    ("Ice Paan",           "PAAN-ICE", "Paan",      5.00,  20,  40,  8, "🧊"),  # healthy
]

# Relative weekly popularity weights -> used to fabricate 4 weeks of sales
# so the demand color coding has something to work with on first run.
WEEKLY_UNITS = {
    "Meetha Paan": 90, "Banarasi Paan": 60, "Chocolate Paan": 45, "Saada Paan": 70,
    "Gulkand Paan": 30, "Fire Paan": 20, "Masala Soda": 50, "Thums Up": 40,
    "Mango Lassi": 18, "Paan Masala Pack": 80, "Mouth Freshener": 65,
    "Rajnigandha": 35, "Silver Coated Paan": 8, "Dry Fruit Paan": 14, "Ice Paan": 22,
}


def seed_if_empty():
    with get_conn() as conn:
        n = conn.execute("SELECT COUNT(*) AS c FROM products").fetchone()["c"]
        if n > 0:
            return

        name_to_id = {}
        for p in PRODUCTS:
            cur = conn.execute(
                """INSERT INTO products (name, sku, category, price, shop_qty, warehouse_qty, reorder_level, emoji)
                   VALUES (?,?,?,?,?,?,?,?)""",
                p,
            )
            name_to_id[p[0]] = cur.lastrowid

        # Fabricate ~4 weeks of sales history spread across the last 28 days so
        # weekly_demand is realistic. We don't decrement stock for seed history.
        for name, weekly in WEEKLY_UNITS.items():
            pid = name_to_id[name]
            price = next(p[3] for p in PRODUCTS if p[0] == name)
            # 4 weekly buckets, one sale row per bucket at staggered days.
            for week in range(4):
                day_offset = week * 7 + 1  # 1, 8, 15, 22 days ago
                cur = conn.execute(
                    "INSERT INTO sales (payment_type, total, created_at) VALUES (?,?, datetime('now', ?))",
                    ("cash", price * weekly, f"-{day_offset} days"),
                )
                sid = cur.lastrowid
                conn.execute(
                    "INSERT INTO sale_items (sale_id, product_id, name, qty, price) VALUES (?,?,?,?,?)",
                    (sid, pid, name, weekly, price),
                )

        print(f"Seeded {len(PRODUCTS)} products with 4 weeks of sales history.")


if __name__ == "__main__":
    from db import init_db
    init_db()
    seed_if_empty()
