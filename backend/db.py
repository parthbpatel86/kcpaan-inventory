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
# The shop's wall-clock timezone. The business day must roll over at local
# midnight, not at UTC midnight (which is 5pm the previous day in California).
SHOP_TZ = os.environ.get("SHOP_TZ", "America/Los_Angeles")
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
    # 'localtime' means the SHOP's local day, not the server's UTC day. Render/Neon
    # run in UTC, so mapping these to current_date/::date would roll the business
    # day over at 5pm Pacific and mis-attribute evening sales to the next day.
    s = s.replace("date('now','localtime')", _pg_today())
    s = s.replace("date('now', 'localtime')", _pg_today())
    # date(<expr>,'localtime') -> that expression's date in shop-local time.
    # <expr> may itself contain commas and nested parens, e.g.
    # date(COALESCE(a, b, c),'localtime'), so match parens by depth rather than
    # with a naive [^,]+ (which left such calls untranslated and 500'd on PG).
    s = _sub_local_date(s)
    # date(?) / date(%s) -> (%s)::date
    s = re.sub(r"date\((%s)\)", r"(\1)::date", s)
    # date(<col>) where col already a date string param -> ::date
    # bare strftime / PRAGMA never reach here (handled in init separately)
    return s


def _pg_today():
    """Today's date in the shop's timezone (not the UTC server's)."""
    return f"((now() AT TIME ZONE '{SHOP_TZ}')::date)"


def _pg_local_date(col):
    """A timestamptz column rendered as its date in the shop's timezone."""
    return f"(({col.strip()} AT TIME ZONE '{SHOP_TZ}')::date)"


def _sub_local_date(s):
    """Rewrite every date(<expr>,'localtime') using paren-depth matching.

    <expr> can contain commas and nested calls (COALESCE(a, b, c)), which a
    plain regex cannot handle — and a missed rewrite leaves a SQLite-only
    date(x, 'localtime') that Postgres rejects at runtime.
    """
    needle = "date("
    out = []
    i = 0
    while True:
        j = s.find(needle, i)
        if j == -1:
            out.append(s[i:])
            return "".join(out)
        # Walk to the matching close paren, tracking depth.
        k = j + len(needle)
        depth = 1
        while k < len(s) and depth:
            if s[k] == "(":
                depth += 1
            elif s[k] == ")":
                depth -= 1
            k += 1
        if depth:  # unbalanced — leave the rest untouched
            out.append(s[i:])
            return "".join(out)
        inner = s[j + len(needle):k - 1]
        marker = ",'localtime'"
        stripped = inner.replace(", 'localtime'", marker)
        if stripped.endswith(marker):
            expr = stripped[: -len(marker)]
            out.append(s[i:j])
            out.append(_pg_local_date(expr))
        else:
            out.append(s[i:k])
        i = k


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
    -- Client-generated key; a retried POST returns the original sale instead
    -- of creating a duplicate (prevents double-charging on flaky networks).
    client_ref   TEXT UNIQUE,
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
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS employees (
    id         {pk},
    name       TEXT NOT NULL,
    pin        TEXT NOT NULL,
    -- Reserved for a future USB/BT fingerprint reader: the phone's own
    -- biometric API cannot identify *which* employee, only the device owner.
    finger_id  TEXT,
    -- NFC tag (NTAG215) UID, uppercase hex, no separators. A tag is a physical
    -- token: it identifies WHICH employee, which the phone's own biometric API
    -- cannot. Tapping is the primary clock-in; the PIN stays as the fallback.
    nfc_uid    TEXT,
    -- Face recognition: JSON array of ArcFace embeddings (one per enrolment
    -- photo). These are numeric vectors, NOT photographs — a face cannot be
    -- reconstructed from them. Matching happens on the device; the server only
    -- stores them so a re-installed app still recognises staff.
    face_data  TEXT,
    active     INTEGER NOT NULL DEFAULT 1,
    created_at {ts_type} NOT NULL {ts_default}
);
CREATE TABLE IF NOT EXISTS punches (
    id          {pk},
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    punch_in    {ts_type},
    punch_out   {ts_type},
    -- NULL when clean; 'MISSING_OUT' (>14h open) or 'MISSING_IN' (out with no in)
    flag        TEXT,
    -- How the employee was identified: 'pin' | 'face' | 'manager'
    method      TEXT NOT NULL DEFAULT 'pin',
    note        TEXT,
    created_at  {ts_type} NOT NULL {ts_default}
);
CREATE TABLE IF NOT EXISTS punch_audit (
    id         {pk},
    punch_id   INTEGER NOT NULL,
    field      TEXT NOT NULL,
    old_value  TEXT,
    new_value  TEXT,
    changed_by TEXT NOT NULL DEFAULT 'manager',
    changed_at {ts_type} NOT NULL {ts_default}
);
CREATE TABLE IF NOT EXISTS shift_closes (
    id            {pk},
    business_date TEXT NOT NULL UNIQUE,
    paan_cash     REAL NOT NULL DEFAULT 0,
    tobacco_cash  REAL NOT NULL DEFAULT 0,
    expected_cash REAL NOT NULL DEFAULT 0,
    cc_total      REAL NOT NULL DEFAULT 0,
    shop_total    REAL NOT NULL DEFAULT 0,
    note          TEXT,
    created_at    {ts_type} NOT NULL {ts_default}
);
CREATE INDEX IF NOT EXISTS idx_punches_emp ON punches(employee_id);
CREATE INDEX IF NOT EXISTS idx_punches_in ON punches(punch_in);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
"""


DEFAULT_SETTINGS = {
    "employee_discount_pct": "8",   # EMPLOYEE button discount
    "max_discount_pct": "8",        # cap on the manual discount (% of cart)
    "punch_max_hours": "14",        # open punch older than this is flagged
}


def init_db():
    default_pin = os.environ.get("KC_STOCK_PIN", "0000")
    if USE_PG:
        import psycopg
        conn = psycopg.connect(DATABASE_URL, autocommit=True)
        with conn.cursor() as cur:
            cur.execute(_schema(True))
            # Deny-all via Supabase's anon-key REST path; the app's password
            # login bypasses RLS so the API is unaffected.
            cur.execute("ALTER TABLE settings ENABLE ROW LEVEL SECURITY")
            # Migrations for DBs created before these columns existed.
            cur.execute("ALTER TABLE sales ADD COLUMN IF NOT EXISTS client_ref TEXT")
            cur.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_client_ref ON sales(client_ref)"
            )
            cur.execute("ALTER TABLE employees ADD COLUMN IF NOT EXISTS face_data TEXT")
            cur.execute("ALTER TABLE employees ADD COLUMN IF NOT EXISTS nfc_uid TEXT")
            cur.execute(
                "ALTER TABLE punches ADD COLUMN IF NOT EXISTS method TEXT NOT NULL DEFAULT 'pin'"
            )
            cur.execute(
                "INSERT INTO settings (key, value) VALUES ('stock_pin', %s) ON CONFLICT (key) DO NOTHING",
                (default_pin,),
            )
            for k, v in DEFAULT_SETTINGS.items():
                cur.execute(
                    "INSERT INTO settings (key, value) VALUES (%s, %s) ON CONFLICT (key) DO NOTHING",
                    (k, v),
                )
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
        if "client_ref" not in scols:
            conn.execute("ALTER TABLE sales ADD COLUMN client_ref TEXT")
        ecols = {r[1] for r in conn.execute("PRAGMA table_info(employees)")}
        if "nfc_uid" not in ecols:
            conn.execute("ALTER TABLE employees ADD COLUMN nfc_uid TEXT")
        conn.execute(
            "INSERT OR IGNORE INTO settings (key, value) VALUES ('stock_pin', ?)",
            (default_pin,),
        )
        for k, v in DEFAULT_SETTINGS.items():
            conn.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (k, v))
        conn.commit()
        conn.close()
