# KC Paan POS — Mega Plan (2026-08-14/15)

Scope: full QA bug list, POS redesign for non-English staff, manager portal,
employee timesheets, daily closing/shift report, and over-the-air updates.
Built autonomously overnight. Every item must be emulator-verified before it
ships to Parth's device — no untested releases (see
audit-trail/blank-pos-card-2026-08-14.md for why).

---

## PART A — BUG LIST (from code review + emulator QA)

### A1. CRITICAL — Timezone corrupts daily totals
`backend/app.py` uses SQLite-isms `date(created_at,'localtime')`, but the
Postgres translator in `db.py` rewrites `date(col,'localtime')` -> `(col)::date`,
silently DROPPING the timezone conversion. Render/Neon run in UTC, so every sale
after ~17:00 Pacific is attributed to the NEXT day.
Impact: "Today's Sales", Reports day-grouping, and the new closing-shift report
would all be wrong. Must fix before closing-shift is trustworthy.
Fix: store/compare in an explicit shop timezone (America/Los_Angeles) on the
Postgres path; add a `shop_timezone` setting.

### A2. CRITICAL — Offline sales do not decrement local stock
`offline.js: createSaleResilient()` queues the sale when offline, but stock is
only decremented server-side in `POST /api/sales`. While offline the grid keeps
showing pre-sale quantities, so staff can oversell an item that is really at 0.
Fix: optimistic local decrement + reconcile on sync.

### A3. HIGH — Cart holds a stale product snapshot (price drift)
`cart.js: addItem(product)` stores the whole product object. If prices change
(or another device sells stock) mid-session, the cart displays the OLD price.
The server re-prices authoritatively at checkout (good), so the customer is
charged correctly — but the on-screen total can disagree with the receipt.
Fix: store product_id + qty; resolve price from the latest product list.

### A4. HIGH — No stock guard at checkout
Nothing prevents selling more units than exist. `shop_qty` goes negative.
Fix: block/warn when qty exceeds available stock; server-side clamp too.

### A5. MEDIUM — Reports date renders as raw GMT string
Reports "Daily Sales" shows `15 Aug 2026 0 0:00:00 GMT` wrapped over 4 lines.
Fix: format as short local date ("Fri 15 Aug").

### A6. MEDIUM — Blank category renders as "—"
Stock rows show a bare em-dash where category is null (all 50 products have
category=null). Looks like a rendering fault.
Fix: hide the field when empty.

### A7. MEDIUM — Product images are tiny (44px POS / 36px stock)
Parth's requirement: bigger images. At 44px the photo is unreadable at a
glance, which is the whole point for non-English staff.

### A8. MEDIUM — English-only UI
Every label is English. Staff speak Gujarati.
Fix: Gujarati word beside English on the words that matter (per Parth: no
language switcher, side-by-side only where truly needed).

### A9. LOW — No confirmation before completing a sale
Tapping Cash completes instantly. Parth wants a final review screen with
photos, names, quantities before completing.

### A10. LOW — Sale success is a blocking OS alert
`Alert.alert('Sale complete')` must be dismissed before the next customer.
Slows a rush. Fix: brief non-blocking toast/banner.

### A11. LOW — Manager functions scattered on the home screen
Stock / Reports / History all sit on the main screen with PIN prompts.
Parth wants them consolidated into a Manager Portal (top-right).

### A12. LOW — `key={numColumns}` remounts the whole grid on rotation
Loses scroll position. Minor, but easy to fix.

### FIXED EARLIER TODAY
- Blank POS card after a sale (`overflow:'hidden'`) -> v1.4.2, verified.

---

## PART B — POS REDESIGN (employee-friendly, language-agnostic)

Goal: a non-English-speaking employee can ring up a sale fast and accurately.

B1. **Big product images** — grid cards ~2x current size, photo-first layout.
B2. **Gujarati beside English** on essential words only:
    - Cash / રોકડ · Card / કાર્ડ · Shop / દુકાન · Employee / કર્મચારી
    - Total / કુલ · Discount / છૂટ · Done / થઈ ગયું · Cancel / રદ
B3. **Icon + colour coding everywhere** (green/amber/red stock dots already
    exist; keep and enlarge).
B4. **Final review screen before completing** (A9): photo + name + qty + line
    total per item, big running total.
B5. **Big payment buttons on that screen**: CASH, CC, SHOP, EMPLOYEE (8%).
    EMPLOYEE is a PAYMENT TYPE (Parth confirmed) that auto-applies 8%.
B6. **Smaller discount button** — toggle button (Parth: "a button to press to
    toggle the discount"). Accepts % or flat $, capped at 10% of cart total
    (e.g. $50 cart -> max $5 or 10%). No manager PIN (Parth: drop the gate).
B7. **Employee 8% does NOT stack** with the manual discount (Parth confirmed).
B8. Quantity steppers stay large and thumb-friendly.

### Settings to add (DB-customizable, per requirement)
| key | default | meaning |
|---|---|---|
| `employee_discount_pct` | 8 | Employee payment-type discount |
| `max_discount_pct` | 10 | Cap for the manual discount |
| `shop_timezone` | America/Los_Angeles | Fixes A1 |

---

## PART C — MANAGER PORTAL (top-right)

One entry point, PIN-gated once, containing: Stock, Reports, History,
Timesheets, Close Shift, Settings. Removes manager clutter from the staff-facing
home screen (A11).

---

## PART D — EMPLOYEE TIMESHEETS

### D0. Biometric reality check (IMPORTANT)
Android's built-in fingerprint API only authenticates the DEVICE OWNER. It
cannot identify which of several employees is present, and cannot enrol staff.
So phone-native fingerprint CANNOT do multi-employee punch-in.

Three viable paths:
1. **Per-employee PIN** — works today, zero hardware. BUILDING THIS NOW.
2. **Face recognition** — on-device face match per employee. Doable but heavy,
   and error-prone in a shop doorway with changing light.
3. **External reader (RECOMMENDED)** — a standalone ZKTeco-style WiFi
   fingerprint/face terminal (~$150). It handles enrolment and matching itself
   and exposes records over the network; the app pulls them. This is what real
   shops use, and it does not depend on the POS phone at all.

Design decision: build the timesheet DATA MODEL and UI now against per-employee
PIN, with a `method` column ('pin'|'fingerprint'|'face') so a reader can be
dropped in later WITHOUT schema or UI rework.

### D1. Schema
```
employees(id, name, pin_hash, active, created_at)
punches(id, employee_id, punch_in, punch_out, method, flagged, flag_reason,
        edited_by, edited_at, created_at)
punch_edits(id, punch_id, field, old_value, new_value, edited_by, edited_at)  -- 3-month manager audit log
```

### D2. Rules (per Parth)
- Punch in, punch out. Max **14 hours** per shift.
- Forgot to punch OUT (>14h open) -> auto-close + `flagged='missing_out'`,
  manager fixes manually.
- Punch OUT with no open punch-in -> record + `flagged='missing_in'`.
- Employee side: punch in/out ONLY. No reports, no edits.
- Manager side: view + modify, every edit written to `punch_edits`.

### D3. Timesheet views
- **By period**: 1st-15th or 16th-EOM, all employees, flagged rows editable.
- **By employee**: pick a name -> last 15 days, fix flagged rows in place.
- Manager edit log retained **3 months**.

### D4. Manager-leaves-early requirement
Punching is independent of manager presence — employees can punch out at their
real time after the manager has gone home. Closing a shift does NOT close open
punches.

---

## PART E — CLOSE SHIFT (daily)

E1. Manager enters **Paan counter cash total**.
E2. Manager enters **Tobacco counter cash total**.
E3. App shows **expected cash** from that day's recorded sales
    ("drawer should be $X"), plus brief **CC** and **SHOP** summaries.
E4. Variance (entered vs expected) shown per counter.
E5. Employee hours for the day shown and modifiable.
E6. **Previous days' reports viewable — but no all-time cumulative total**
    (owner-only, per Parth).
E7. Manager can close before employees leave; open punches stay open (D4).

Schema:
```
shift_closes(id, business_date, paan_cash, tobacco_cash, expected_cash,
             cc_total, shop_total, employee_total, variance, closed_by,
             closed_at, notes)
```

---

## PART F — OVER-THE-AIR UPDATES

Requirement: push new versions to a few devices without rebuilding/reinstalling
an APK each time.

**expo-updates** is the right tool: JS/UI changes publish over the air and
devices pull them on next launch. Free tier covers a handful of devices.
Caveat to be honest about: OTA only ships JS/asset changes. Native changes
(new native modules, SDK bumps) still need a real APK.

Plan: add `expo-updates`, point at an update channel, ship one APK that then
self-updates. Fallback if EAS auth is unavailable overnight: self-hosted update
manifest, or continue with signed APKs via GitHub Releases.

---

## EXECUTION ORDER
1. Backend: settings, timezone fix (A1), stock guard (A4), employees/punches/
   shift_closes schema + endpoints.
2. App: cart refactor (A3), offline stock (A2), review screen + payment buttons
   (B4-B7), bigger images + Gujarati (B1-B2).
3. Manager portal (C) + timesheets (D) + close shift (E).
4. OTA (F).
5. Emulator-verify EVERY item; screenshots into audit-trail/.
6. Build APK, verify on emulator, publish, report.
