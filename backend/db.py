"""SQLite database layer for KC Paan inventory + POS backend."""
import os
import sqlite3
from contextlib import contextmanager

DB_PATH = os.environ.get("KC_DB_PATH", os.path.join(os.path.dirname(__file__), "data", "kcpaan.db"))


def _ensure_dir():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)


@contextmanager
def get_conn():
    _ensure_dir()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


SCHEMA = """
CREATE TABLE IF NOT EXISTS products (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    sku           TEXT,
    category      TEXT,
    price         REAL NOT NULL DEFAULT 0,
    shop_qty      INTEGER NOT NULL DEFAULT 0,
    warehouse_qty INTEGER NOT NULL DEFAULT 0,
    reorder_level INTEGER NOT NULL DEFAULT 5,
    emoji         TEXT,
    image_url     TEXT,
    archived      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sales (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_type TEXT NOT NULL,           -- 'card' | 'cash' | 'instore'
    total        REAL NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sale_items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id    INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    name       TEXT NOT NULL,
    qty        INTEGER NOT NULL,
    price      REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_moves (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id),
    kind       TEXT NOT NULL,             -- 'add' | 'remove' | 'adjust' | 'move' | 'sale'
    location   TEXT NOT NULL,             -- 'shop' | 'warehouse'
    delta      INTEGER NOT NULL,
    note       TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
"""


def init_db():
    with get_conn() as conn:
        conn.executescript(SCHEMA)
        # Lightweight migrations for existing DBs.
        cols = {r["name"] for r in conn.execute("PRAGMA table_info(products)")}
        if "image_url" not in cols:
            conn.execute("ALTER TABLE products ADD COLUMN image_url TEXT")
