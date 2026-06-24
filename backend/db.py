"""Database layer for KC Paan inventory + POS backend.

Supports two backends transparently:
  - SQLite (local dev) — default when DATABASE_URL is not set.
  - PostgreSQL (production) — used when DATABASE_URL is set (e.g. Supabase).

app.py is written against a SQLite-style API (conn.execute(sql, params) with
'?' placeholders, cursor.lastrowid, row.keys(), and a few SQLite SQL functions).
The Postgres path wraps psycopg to present that same API, translating
placeholders and the handful of SQLite-isms we use to Postgres equivalents.
"""
import os
import re
import sqlite3
from contextlib import contextmanager

DATABASE_URL = os.environ.get("DATABASE_URL")
USE_PG = bool(DATABASE_URL)
DB_PATH = os.environ.get("KC_DB_PATH", os.path.join(os.path.dirname(__file__), "data", "kcpaan.db"))


# --------------------------------------------------------------------------
# SQL translation: SQLite dialect -> Postgres dialect
# --------------------------------------------------------------------------
def _to_pg_sql(sql):
    s = sql
    # placeholders ? -> %s  (our SQL never contains literal '?' otherwise)
    s = s.replace("?", "%s")
    # datetime('now', <mod>) / datetime('now')
    s = re.sub(r"datetime\('now',\s*'([^']*)'\)", lambda m: _pg_now_interval(m.group(1)), s)
    s = s.replace("datetime('now')", "now()")
    # date('now','localtime', '-6 days') and similar -> handled below generically
    s = re.sub(r"date\('now',\s*'localtime',\s*'([^']*)'\)", lambda m: _pg_date_interval(m.group(1)), s)
    s = s.replace("date('now','localtime')", "current_date")
    s = s.replace("date('now', 'localtime')", "current_date")
    # date(<col>,'localtime') -> (<col>)::date    (we only use it on timestamp cols)
    s = re.sub(r"date\(([^,]+),\s*'localtime'\)", r"(\1)::date", s)
    # date(?) / date(%s) -> (%s)::date
    s = re.sub(r"date\((%s)\)", r"(\1)::date", s)
    # date(<col>) where col already a date string param -> ::date
    # bare strftime / PRAGMA never reach here (handled in init separately)
    return s


def _pg_now_interval(mod):
    # mod like "-28 days" or "+1 day"
    mod = mod.strip()
    sign = "-" if mod.startswith("-") else "+"
    body = mod.lstrip("+-").strip()
    return f"(now() {sign} interval '{body}')"


def _pg_date_interval(mod):
    mod = mod.strip()
    sign = "-" if mod.startswith("-") else "+"
    body = mod.lstrip("+-").strip()
    return f"(current_date {sign} interval '{body}')"


# --------------------------------------------------------------------------
# Postgres wrappers presenting a SQLite-like API
# --------------------------------------------------------------------------
class _PgCursorWrapper:
    """Wraps a psycopg cursor: translates SQL, exposes lastrowid & dict rows."""

    def __init__(self, cur):
        self._cur = cur
        self.lastrowid = None

    def execute(self, sql, params=()):
        pg = _to_pg_sql(sql)
        # emulate lastrowid for INSERTs by appending RETURNING id
        is_insert = pg.lstrip().lower().startswith("insert into")
        if is_insert and "returning" not in pg.lower():
            pg = pg.rstrip().rstrip(";") + " RETURNING id"
            self._cur.execute(pg, params)
            row = self._cur.fetchone()
            self.lastrowid = row["id"] if row else None
        else:
            self._cur.execute(pg, params)
        return self

    def fetchone(self):
        return self._cur.fetchone()

    def fetchall(self):
        return self._cur.fetchall()

    def __iter__(self):
        return iter(self._cur.fetchall())


class _PgConnWrapper:
    def __init__(self, conn):
        self._conn = conn

    def execute(self, sql, params=()):
        cur = _PgCursorWrapper(self._conn.cursor())
        return cur.execute(sql, params)

    def commit(self):
        self._conn.commit()

    def close(self):
        self._conn.close()


@contextmanager
def get_conn():
    if USE_PG:
        import psycopg
        from psycopg.rows import dict_row
        conn = psycopg.connect(DATABASE_URL, row_factory=dict_row, autocommit=False)
        wrapper = _PgConnWrapper(conn)
        try:
            yield wrapper
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
    else:
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()


# --------------------------------------------------------------------------
# Schema (per-dialect: SQLite uses AUTOINCREMENT, Postgres uses SERIAL)
# --------------------------------------------------------------------------
def _schema(pg):
    pk = "SERIAL PRIMARY KEY" if pg else "INTEGER PRIMARY KEY AUTOINCREMENT"
    ts_default = "DEFAULT now()" if pg else "DEFAULT (datetime('now'))"
    ts_type = "TIMESTAMPTZ" if pg else "TEXT"
    return f"""
CREATE TABLE IF NOT EXISTS products (
    id            {pk},
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
    created_at    {ts_type} NOT NULL {ts_default},
    updated_at    {ts_type} NOT NULL {ts_default}
);
CREATE TABLE IF NOT EXISTS sales (
    id           {pk},
    payment_type TEXT NOT NULL,
    subtotal     REAL NOT NULL DEFAULT 0,
    discount     REAL NOT NULL DEFAULT 0,
    total        REAL NOT NULL DEFAULT 0,
    voided       INTEGER NOT NULL DEFAULT 0,
    created_at   {ts_type} NOT NULL {ts_default}
);
CREATE TABLE IF NOT EXISTS sale_items (
    id         {pk},
    sale_id    INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    name       TEXT NOT NULL,
    qty        INTEGER NOT NULL,
    price      REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS stock_moves (
    id         {pk},
    product_id INTEGER NOT NULL REFERENCES products(id),
    kind       TEXT NOT NULL,
    location   TEXT NOT NULL,
    delta      INTEGER NOT NULL,
    note       TEXT,
    created_at {ts_type} NOT NULL {ts_default}
);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
"""


def init_db():
    if USE_PG:
        import psycopg
        conn = psycopg.connect(DATABASE_URL, autocommit=True)
        with conn.cursor() as cur:
            cur.execute(_schema(True))
        conn.close()
    else:
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        conn = sqlite3.connect(DB_PATH)
        conn.executescript(_schema(False))
        # SQLite-only migrations for pre-existing local DBs.
        cols = {r[1] for r in conn.execute("PRAGMA table_info(products)")}
        if "image_url" not in cols:
            conn.execute("ALTER TABLE products ADD COLUMN image_url TEXT")
        scols = {r[1] for r in conn.execute("PRAGMA table_info(sales)")}
        for col, ddl in [
            ("subtotal", "ALTER TABLE sales ADD COLUMN subtotal REAL NOT NULL DEFAULT 0"),
            ("discount", "ALTER TABLE sales ADD COLUMN discount REAL NOT NULL DEFAULT 0"),
            ("voided", "ALTER TABLE sales ADD COLUMN voided INTEGER NOT NULL DEFAULT 0"),
        ]:
            if col not in scols:
                conn.execute(ddl)
        conn.commit()
        conn.close()
