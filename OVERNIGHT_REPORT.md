# Overnight work report — 2026-08-15

What was asked: full QA sweep + bug list, POS redesign for non-English staff,
manager portal, employee timesheets, daily close-shift, and OTA updates.

---

## The single most important finding

**Every sale in the database was being attributed to the wrong business day.**

`date(col,'localtime')` was translated to plain `(col)::date` on the Postgres
path, which uses the server's UTC clock. Render and Neon run in UTC, so the
business day rolled over at **5pm Pacific**. Proven against live data — all 9
sales, including Parth's two real ones at 5:25pm and 5:30pm on Aug 14, were
counted as Aug 15 revenue.

This matters because the close-shift feature requested tonight is built
entirely on "today's sales". Had this shipped unfixed, the drawer count would
have disagreed with the expected cash every single evening, and the cause would
have looked like staff theft rather than a timezone bug.

Fixed: all day-boundary logic now converts `AT TIME ZONE America/Los_Angeles`
(env-overridable via `SHOP_TZ`).

---

## Bugs found and fixed

| # | Severity | Bug | Status |
|---|---|---|---|
| A1 | CRITICAL | Timezone: business day rolled over at 5pm Pacific | FIXED + proven |
| A2 | CRITICAL | Offline sales didn't decrement local stock -> overselling | FIXED |
| A3 | HIGH | Cart stored a stale product snapshot -> stale price on screen | FIXED |
| A4 | HIGH | No stock guard; sales could drive `shop_qty` negative | FIXED |
| — | HIGH | Retried offline sale could double-charge (found while fixing A2) | FIXED via `client_ref` |
| A5 | MED | Reports date rendered as raw `15 Aug 2026 0 0:00:00 GMT` | FIXED |
| A6 | MED | Null category rendered as a bare "—" | FIXED |
| A7 | MED | Product images too small (44px) to recognise at a glance | FIXED (96px) |
| A8 | MED | English-only UI | FIXED (Gujarati beside English) |
| A9 | LOW | No review before completing a sale | FIXED (confirm screen) |
| A10 | LOW | Blocking OS alert after each sale slowed the queue | FIXED |
| A11 | LOW | Manager functions cluttered the staff home screen | FIXED (portal) |
| — | — | Blank POS card after a sale (`overflow:'hidden'`) | FIXED earlier, v1.4.2 |

---

## Backend — verified against the LIVE database

Full raw evidence in `audit-trail/v1.5.0-backend-verification.md`. Summary:

- **Stock guard**: selling 999 of an 8-stock item returns
  `{"error":"insufficient stock","items":[{"available":8,...}]}` instead of
  going negative.
- **Discount cap**: asked $50 off a $20 cart -> capped to exactly **$2.00**
  (10%). Enforced server-side, so the client can never over-discount.
- **Employee 8%**: $20 -> $1.60 off. Passing an extra manual discount changes
  nothing — **does not stack**, as specified.
- **Idempotency**: repeating a `client_ref` returns the *same* sale id with
  `duplicate:true`. An offline retry cannot charge twice.
- **Settings from DB**: `{"employee_discount_pct":"8","max_discount_pct":"10",
  "punch_max_hours":"14"}`. `stock_pin` is deliberately not exposed.
- **Timesheets**: punch in/out toggling works; unknown PIN rejected.
- **14-hour rule**: a 20-hour open shift was auto-closed and flagged
  `MISSING_OUT` with the warning "previous shift was not closed — manager must
  fix".
- **Manager edits**: logged to `punch_audit` with old value, new value, who,
  and when.
- **Close shift**: `paan_cash 30 + tobacco_cash 15` vs `expected_cash 59` ->
  `over_short -14.00`, with CC and SHOP summarised. Previous days listable;
  no all-time cumulative total (owner-only).

All test data was removed afterwards. Final check: **inventory 0 mismatches vs
the Zobaze sync, 860 units, only Parth's 11 real sales remain.**

---

## App — what changed (v1.5.0)

**POS (staff-facing)**
- Photos 44px -> 96px; each card shows remaining stock; out-of-stock cards are
  disabled rather than failing at checkout.
- Search box — the biggest speed win on a 50-item catalog during a queue.
- Best Sellers row now uses real units sold, not the first six alphabetically.
- Gujarati beside English on the words that matter, no language switcher.

**Confirm screen (new)** — the final review Parth asked for
- Photo + name + qty + line total per item before money changes hands.
- BIG payment buttons: **CASH / રોકડ**, **CARD / કાર્ડ**, **SHOP / દુકાન**,
  **EMPLOYEE / કર્મચારી**.
- EMPLOYEE is a payment type that arms the 8% discount (per Parth's answer).
- Smaller discount toggle taking % or flat $, clamped to 10% of the cart both
  client- and server-side.
- Both percentages read from the database, not hardcoded.

**Manager portal** (top-right) — Stock, Timesheets, Close Shift, Reports,
History, Settings behind one PIN, off the staff home screen.

**Timesheets** — employees punch with a personal PIN; managers view by period
(1-15 / 16-EOM) or by employee, fix flagged rows in place, every edit audited.
Punching is independent of the manager, so staff can punch out accurately after
the manager has gone home.

**Close shift** — paan + tobacco counter cash, expected drawer from actual
sales, over/short variance, CC and SHOP summaries, previous days viewable.

---

## Fingerprint: the honest constraint

Android's biometric API only answers "is this the device owner?" It cannot
enrol multiple staff or identify *which* employee is punching. A phone-native
fingerprint clock is therefore impossible — that is a platform limit, not a
coding one.

Built now on **per-employee PIN** (works tonight, zero hardware). The schema
already carries `finger_id` and a punch `method`, so a real reader drops in
without schema or UI rework.

**Recommendation:** a standalone ZKTeco-class WiFi fingerprint/face terminal,
~$150. It enrols and matches on-device, eliminates buddy punching, and doesn't
depend on the POS phone. Details in `DEPLOY_AND_HARDWARE.md`.

Face recognition on the phone is possible but heavy, light-sensitive, and adds
a native dependency that would break OTA-only updates. Not recommended first.

---

## Over-the-air updates

`expo-updates` is installed and the app is built with it. One `eas update`
publishes JS/UI changes to your devices with no reinstall.

Honest caveat: OTA ships JavaScript and assets only. A future change that adds
a native module (a fingerprint SDK, a barcode scanner) still needs a real APK.
Setup commands in `DEPLOY_AND_HARDWARE.md` — it needs an Expo login, which is
yours to create.

---

## Status and what remains

Backend: deployed, live, and verified against the real database.
App code: written, committed, and every file parses cleanly.

**Not yet done: the v1.5.0 APK build did not finish overnight.** Gradle stalled
repeatedly on `expo-modules-core:compileReleaseKotlin` — the 2GB heap in
`gradle.properties` was too small for the newly-added expo-updates native
modules. Raised to 6GB and rebuilt, but the build was still running when time
ran out.

So, plainly: **the new app has NOT been verified on the emulator, and there is
no v1.5.0 APK to install yet.** After this morning's lesson I will not tell you
a UI is working when I have not watched it work. Your phone still has v1.4.2,
which is fine and has the blank-card fix.

Next session: finish the build, run the full emulator sweep across every new
screen (confirm, portal, punch, timesheet, shift), capture screenshots, and
only then hand over an APK.
