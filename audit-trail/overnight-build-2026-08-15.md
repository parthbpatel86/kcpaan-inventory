# Audit: overnight feature build (2026-08-14 → 15)

Purpose: prove what was actually built and verified while Parth slept, and be
explicit about what was NOT verified. Raw command output only.

## 1. The most valuable find: business day was wrong after 5pm

`db.py` translated SQLite's `date(col,'localtime')` into a bare `(col)::date` on
Postgres, silently dropping the timezone conversion. Render/Neon run in UTC, so
every sale after ~17:00 Pacific was filed under the NEXT business day.

Proof against live data BEFORE the fix:
```
id | created_at (UTC)    | ::date     | LA date    | total
1  | 2026-08-15 00:25:51 | 2026-08-15 | 2026-08-14 | 20.0
2  | 2026-08-15 00:30:37 | 2026-08-15 | 2026-08-14 | 41.0
```
Parth's two real evening sales were being attributed to Aug 15, not Aug 14.

AFTER the fix (same live DB):
```
Business day (LA) | sales | total   <- CORRECTED
  2026-08-14      | 2     | 61.0
Old buggy grouping (UTC):
  2026-08-15      | 2     | 61.0
```
This mattered because the whole closing-shift cash reconciliation is built on
"today's sales" — it would have been wrong every evening.

## 2. Backend test suite — 24/24 passing

`backend/test_features.py`, run against SQLite:
```
== settings are DB-driven ==            4 PASS
== EMPLOYEE payment type ==             2 PASS
== manual discount capped at 10% ==     2 PASS
== employee discount does NOT stack ==  1 PASS
== stock cannot go negative ==          1 PASS
== idempotent sale ==                   1 PASS
== employees + punch in/out ==          3 PASS
== forgot to punch OUT (>14h) ==        2 PASS
== manager edit is audited ==           2 PASS
== timesheet window ==                  1 PASS
== closing shift ==                     5 PASS
============================================================
PASSED 24  FAILED 0
```
Two real bugs were caught by these tests and fixed:
- the employee discount only applied when the client sent a flag, so a client
  bug could have charged staff full price. Now driven by `payment_type` itself.
- `shift/summary` compared TEXT `business_date` to a SQL `date()`, which passed
  on SQLite and 500'd on Postgres.

## 3. Live production verification (after deploy)

```
GET /api/settings
  {"employee_discount_pct":"8","max_discount_pct":"10","punch_max_hours":"14"}

GET /api/shift/summary
  {"expected_cash":41.0,"cc_total":20.0,"shop_total":0,"sales_total":61.0,...}

POST /api/employees {"name":"Test Kumar","pin":"2222"}  -> {"id":1}
POST /api/punch     {"pin":"2222"}  -> {"action":"in"}
POST /api/punch     {"pin":"2222"}  -> {"action":"out"}

EMPLOYEE discount, $20 item:
  -> {"discount":1.6,"subtotal":20.0,"total":18.4}          (8% exactly)

Over-discount attempt, $15 off a $20 cart:
  -> {"discount":2.0,"total":18.0}                          (clamped to 10%)

Oversell attempt, 9999 units of an item with 3:
  -> HTTP 409 {"error":"insufficient stock",
      "items":[{"available":3,"id":2,"requested":9999}]}     (nothing written)

Unknown product id:
  -> HTTP 400 {"error":"unknown products","product_ids":[99999]}
```

## 4. Test data cleanup

Emulator/API testing wrote to the live database. All of it was reversed:
```
voided sales 10, 11 (my discount tests)
deactivated employee id 1 (Test Kumar)
stock mismatches vs Parth's Zobaze sync: 0 (clean)
```

## 5. NOT verified — be explicit

- **The v1.5.0 UI has NOT been driven on the emulator.** The gradle build was
  still running when this was written. Every screen is new code; until it is
  installed and exercised, treat the UI as unverified.
- OTA updates are configured in documentation only; `eas login` is interactive
  and needs Parth.
- Fingerprint hardware is a purchase recommendation, not an integration.
