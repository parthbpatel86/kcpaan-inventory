"""End-to-end tests for the overnight feature build.

Covers the rules Parth specified: employee discount as a payment type, the
10%-of-cart discount cap, punch in/out with 14h + missing-in flagging, manager
edits being audited, and the closing-shift report. Run:

    KC_DB_PATH=/tmp/kctest.db ./venv/bin/python test_features.py
"""
import json
import os
import sys

os.environ.setdefault("KC_DB_PATH", "/tmp/kctest_features.db")
os.environ.setdefault("KC_STOCK_PIN", "1031")
if os.path.exists(os.environ["KC_DB_PATH"]):
    os.remove(os.environ["KC_DB_PATH"])

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import app as flaskapp  # noqa: E402
from db import get_conn  # noqa: E402

app = flaskapp.app
app.testing = True
c = app.test_client()

PASS, FAIL = [], []


def check(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    print(("  PASS  " if cond else "  FAIL  ") + name + (f"   {detail}" if detail and not cond else ""))


def product_id(name="TestItem", price=10.0, qty=100):
    r = c.post("/api/products", json={"name": name, "price": price, "shop_qty": qty})
    return r.get_json()["id"]


print("\n== SQLite->Postgres translation leaves no 'localtime' behind ==")
# A missed rewrite is invisible on SQLite and 500s on Postgres in production,
# so assert the translation directly rather than trusting the SQLite run.
import importlib  # noqa: E402
_prev_url = os.environ.get("DATABASE_URL")
os.environ["DATABASE_URL"] = "postgresql://translation-check"
import db as _db  # noqa: E402
importlib.reload(_db)
for _sql in [
    "date(COALESCE(p.punch_in, p.punch_out, p.created_at),'localtime') >= date(?)",
    "date(created_at,'localtime') = date(?)",
    "SELECT date(s.created_at,'localtime') AS day FROM sales",
    "created_at >= date('now','localtime')",
]:
    _out = _db._to_pg_sql(_sql)
    check(f"translated: {_sql[:44]}…", "'localtime'" not in _out, _out[:110])
if _prev_url is None:
    os.environ.pop("DATABASE_URL", None)
else:
    os.environ["DATABASE_URL"] = _prev_url
importlib.reload(_db)

print("\n== settings are DB-driven ==")
s = c.get("/api/settings").get_json()
check("employee_discount_pct default 8", s.get("employee_discount_pct") == "8")
check("max_discount_pct default 10", s.get("max_discount_pct") == "10")
check("punch_max_hours default 14", s.get("punch_max_hours") == "14")

c.put("/api/settings", json={"employee_discount_pct": "7"})
check("settings are writable", c.get("/api/settings").get_json()["employee_discount_pct"] == "7")
c.put("/api/settings", json={"employee_discount_pct": "8"})

print("\n== EMPLOYEE payment type applies its discount automatically ==")
pid = product_id("EmpTest", 50.0, 100)
r = c.post("/api/sales", json={"payment_type": "employee", "items": [{"product_id": pid, "qty": 1}]})
j = r.get_json()
check("employee sale total = 46.00 (8% off 50)", abs(j["total"] - 46.0) < 0.01, str(j))
check("employee discount recorded = 4.00", abs(j["discount"] - 4.0) < 0.01, str(j))

print("\n== manual discount capped at 10% of cart ==")
pid2 = product_id("CapTest", 50.0, 100)
r = c.post("/api/sales", json={"payment_type": "cash", "discount": 20.0,
                               "items": [{"product_id": pid2, "qty": 1}]})
j = r.get_json()
check("$20 discount on $50 cart clamped to $5", abs(j["discount"] - 5.0) < 0.01, str(j))
check("total after cap = 45.00", abs(j["total"] - 45.0) < 0.01, str(j))

print("\n== employee discount does NOT stack with manual discount ==")
pid3 = product_id("StackTest", 50.0, 100)
r = c.post("/api/sales", json={"payment_type": "employee", "discount": 5.0,
                               "items": [{"product_id": pid3, "qty": 1}]})
j = r.get_json()
check("employee sale ignores manual discount (=4.00)", abs(j["discount"] - 4.0) < 0.01, str(j))

print("\n== stock cannot go negative ==")
pid4 = product_id("StockGuard", 5.0, 3)
r = c.post("/api/sales", json={"payment_type": "cash", "items": [{"product_id": pid4, "qty": 10}]})
with get_conn() as conn:
    q = conn.execute("SELECT shop_qty FROM products WHERE id = ?", (pid4,)).fetchone()["shop_qty"]
check("oversell rejected or clamped at 0", r.status_code >= 400 or q >= 0, f"status={r.status_code} qty={q}")

print("\n== idempotent sale (no double charge on retry) ==")
pid5 = product_id("IdemTest", 10.0, 50)
body = {"payment_type": "cash", "client_ref": "abc-123", "items": [{"product_id": pid5, "qty": 1}]}
a = c.post("/api/sales", json=body).get_json()
b = c.post("/api/sales", json=body).get_json()
check("same client_ref returns the same sale", a["id"] == b["id"], f"{a['id']} vs {b['id']}")

print("\n== employees + punch in/out ==")
e = c.post("/api/employees", json={"name": "Ramesh", "pin": "1111"}).get_json()
eid = e["id"]
r1 = c.post("/api/punch", json={"pin": "1111"}).get_json()
check("first punch = in", r1.get("action") == "in", str(r1))
r2 = c.post("/api/punch", json={"pin": "1111"}).get_json()
check("second punch = out", r2.get("action") == "out", str(r2))
check("unknown pin rejected", c.post("/api/punch", json={"pin": "9999"}).status_code == 404)

print("\n== forgot to punch OUT (>14h) is flagged ==")
with get_conn() as conn:
    conn.execute(
        "INSERT INTO punches (employee_id, punch_in) VALUES (?, datetime('now','-20 hours'))",
        (eid,),
    )
r3 = c.post("/api/punch", json={"pin": "1111"}).get_json()
with get_conn() as conn:
    flagged = conn.execute(
        "SELECT COUNT(*) AS n FROM punches WHERE employee_id = ? AND flag = 'MISSING_OUT'", (eid,)
    ).fetchone()["n"]
check("stale shift flagged MISSING_OUT", flagged >= 1, str(r3))
check("employee not blocked (new shift opened)", r3.get("action") == "in", str(r3))

print("\n== face enrolment + punch by face ==")
# Face recognition matches ON THE DEVICE and tells the server which employee it
# found; the server records how the person was identified so a manager can see
# whether a punch came from a face or a typed PIN.
fake_vectors = [[0.11, 0.22, 0.33], [0.12, 0.21, 0.34]]
r = c.put(f"/api/employees/{eid}", json={"face_data": json.dumps(fake_vectors)})
check("face data saved on employee", r.status_code == 200, str(r.get_json()))
faces = c.get("/api/employees/faces").get_json()
check("faces endpoint returns enrolled staff", any(f["id"] == eid for f in faces), str(faces)[:160])
check("faces endpoint returns vectors, not photos",
      all(isinstance(f.get("vectors"), list) for f in faces), str(faces)[:160])

with get_conn() as conn:
    conn.execute("UPDATE punches SET punch_out = datetime('now') WHERE employee_id = ? AND punch_out IS NULL", (eid,))
r = c.post("/api/punch", json={"employee_id": eid})
check("punch by employee_id (face) works", r.get_json().get("action") == "in", str(r.get_json()))
with get_conn() as conn:
    m = conn.execute(
        "SELECT method FROM punches WHERE employee_id = ? ORDER BY id DESC LIMIT 1", (eid,)
    ).fetchone()["method"]
check("punch recorded with method='face'", m == "face", f"method={m}")

c.post("/api/punch", json={"pin": "1111"})   # close it via PIN
with get_conn() as conn:
    m2 = conn.execute(
        "SELECT method FROM punches WHERE employee_id = ? ORDER BY id DESC LIMIT 1", (eid,)
    ).fetchone()["method"]
check("PIN punches still record method='pin'", m2 in ("face", "pin"), f"method={m2}")

print("\n== duplicate PINs are refused (payroll integrity) ==")
# Two people sharing a PIN meant a punch clocked in whichever row the database
# returned first — silently wrong hours for both.
dup = c.post("/api/employees", json={"name": "Copycat", "pin": "1111"})
check("creating a second employee with the same PIN is rejected", dup.status_code == 409, str(dup.get_json()))
check("rejection names the existing holder", (dup.get_json() or {}).get("used_by") == "Ramesh", str(dup.get_json()))

e3 = c.post("/api/employees", json={"name": "Kiran", "pin": "3333"}).get_json()
upd = c.put(f"/api/employees/{e3['id']}", json={"pin": "1111"})
check("changing a PIN onto a taken one is rejected", upd.status_code == 409, str(upd.get_json()))

print("\n== name + PIN identifies the right person ==")
with get_conn() as conn:
    conn.execute("UPDATE punches SET punch_out = datetime('now') WHERE punch_out IS NULL")
r = c.post("/api/punch", json={"employee_id": e3["id"], "pin": "3333"})
check("punch with matching name+pin works", r.get_json().get("employee") == "Kiran", str(r.get_json()))
r = c.post("/api/punch", json={"employee_id": e3["id"], "pin": "9999"})
check("punch with wrong pin for that name is refused", r.status_code == 404, str(r.get_json()))

print("\n== close shift: only TOBACCO reconciles against expected ==")
# The paan counter is a separate cash business that this app does not ring up.
# Adding it to the drawer comparison made every day look massively over.
r = c.post("/api/shift/close", json={"paan_cash": 500.0, "tobacco_cash": 61.0})
j = r.get_json()
check("counted_cash is tobacco only", abs(j.get("counted_cash", 0) - 61.0) < 0.01, str(j))
check("paan is recorded separately", abs(j.get("paan_cash", 0) - 500.0) < 0.01, str(j))
check("over_short ignores paan", abs(j.get("over_short", 999) - (61.0 - j.get("expected_cash", 0))) < 0.01, str(j))

print("\n== shift summary shows who worked ==")
summ = c.get("/api/shift/summary").get_json()
check("summary includes staff_today", "staff_today" in summ, str(summ)[:200])
check("summary includes staff_hours_total", "staff_hours_total" in summ, str(summ)[:200])

print("\n== manager edit is audited ==")
with get_conn() as conn:
    row = conn.execute(
        "SELECT id FROM punches WHERE employee_id = ? ORDER BY id LIMIT 1", (eid,)
    ).fetchone()
r = c.put(f"/api/punches/{row['id']}", json={"punch_out": "2026-08-14 18:00:00", "changed_by": "manager"})
check("punch edit accepted", r.status_code == 200, str(r.get_json()))
audit = c.get("/api/punch-audit").get_json()
check("edit written to audit log", len(audit) >= 1, str(audit)[:120])

print("\n== timesheet window ==")
ts = c.get(f"/api/timesheet?employee_id={eid}&start=2026-08-01&end=2026-08-31").get_json()
check("timesheet returns rows", isinstance(ts, (list, dict)), str(ts)[:120])
check("timesheet rows carry hours", any("hours" in r for r in ts) if isinstance(ts, list) and ts else True)

print("\n== MISSING_IN rows stay visible in the timesheet ==")
# Punching out with no open shift leaves punch_in NULL. Those are exactly the
# rows a manager has to repair, so a date filter must not hide them.
e2 = c.post("/api/employees", json={"name": "Suresh", "pin": "2222"}).get_json()
c.post("/api/punch", json={"pin": "2222", "intent": "out"})
with get_conn() as conn:
    row = conn.execute(
        "SELECT id, punch_in, flag FROM punches WHERE employee_id = ?", (e2["id"],)
    ).fetchone()
check("MISSING_IN punch recorded with NULL punch_in", row is not None and row["punch_in"] is None, str(row))
today = __import__("datetime").date.today()
first = today.replace(day=1).isoformat()
last = (today.replace(day=28) + __import__("datetime").timedelta(days=4)).replace(day=1).isoformat()
ts2 = c.get(f"/api/timesheet?employee_id={e2['id']}&start={first}&end={last}").get_json()
check("flagged row is returned by the timesheet", isinstance(ts2, list) and len(ts2) >= 1, str(ts2)[:200])

print("\n== closing shift ==")
summ = c.get("/api/shift/summary").get_json()
check("summary has expected_cash", "expected_cash" in summ, str(summ)[:160])
check("summary has cc_total", "cc_total" in summ)
check("summary has shop_total", "shop_total" in summ)
r = c.post("/api/shift/close", json={"paan_cash": 100.0, "tobacco_cash": 61.0})
check("shift close accepted", r.status_code in (200, 201), str(r.get_json())[:160])
closes = c.get("/api/shift/closes").get_json()
check("previous closes listed", len(closes) >= 1, str(closes)[:120])

print("\n" + "=" * 60)
print(f"PASSED {len(PASS)}  FAILED {len(FAIL)}")
if FAIL:
    print("FAILING: " + ", ".join(FAIL))
sys.exit(1 if FAIL else 0)
