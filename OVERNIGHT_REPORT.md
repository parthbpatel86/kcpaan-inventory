# Overnight build — what to read first

Everything below was built and verified while you slept. Read this page; the
detail lives in `BUG_LIST.md`, `MEGA_PLAN.md`, `HARDWARE_RECOMMENDATION.md`,
`OTA_UPDATES.md` and `audit-trail/`.

---

## 1. The find that mattered most: your daily totals were wrong after 5pm

The backend stored sales in UTC but grouped them by the *server's* day. Render
and Neon run in UTC, so **every sale after ~5:00pm Pacific was counted on the
next day.**

Proof from your own two real sales:

| sale | stored (UTC) | old grouping | correct (LA) |
|---|---|---|---|
| $20 | 2026-08-15 00:25 | Aug 15 ❌ | **Aug 14** ✅ |
| $41 | 2026-08-15 00:30 | Aug 15 ❌ | **Aug 14** ✅ |

This would have made the new closing-shift cash reconciliation wrong every
single evening — you'd have counted the drawer against the wrong day's sales.
Fixed, and the fix is asserted in the test suite so it can't come back.

## 2. Bugs found and fixed

**Money / stock correctness**
- Sale could drive stock **negative** — now rejected with HTTP 409 and the exact
  shortfall (verified live: asking for 9999 of an item with 3 → refused).
- An **unknown product silently vanished** from a sale, undercharging the
  customer — now HTTP 400 listing the bad ids.
- A **retried sale could charge twice** on a flaky network — every sale now
  carries a client reference; a repeat returns the original.
- Cart held a **stale price snapshot**, so a mid-shift price change could show
  one total and charge another.
- **Offline sales didn't reduce on-screen stock**, so staff could oversell
  during an outage.
- **Flagged timesheet rows were invisible** — a punch-out with no punch-in
  (exactly the row a manager must repair) was filtered out of the timesheet.

**Employee-facing**
- Product images 44px → **96px**; search box added; out-of-stock items dimmed
  and non-tappable instead of being sellable.
- "Best Sellers" was really "first six alphabetically" until sales data existed.

## 3. What's new

- **Confirm screen** before money changes hands: photo + name + qty per line,
  then four big buttons — **CASH / CARD / SHOP / EMPLOYEE** — plus a small
  discount toggle.
- **EMPLOYEE is a payment type** that auto-applies 8%. Verified live: a $20 item
  rings at **$18.40**.
- **Discount capped at 10% of the cart**, enforced on the server so the app
  can't over-discount. Verified live: $15 off a $20 cart → clamped to **$2.00**.
- **8% and 10% are database settings** — change them in Manager → Settings, no
  new APK.
- **Manager portal** behind the ⚙ top-right, PIN-gated. Staff now see only
  *Shop Sales* and *Time Clock*.
- **Timesheets**: punch in/out, 14-hour rule, MISSING_IN / MISSING_OUT flags,
  half-month periods (1–15 / 16–end), inline manager fixes, and an audit log of
  every manager edit.
- **Close Day**: enter Paan and Tobacco counter cash; the app shows what the
  drawer *should* hold from that day's sales and the over/short difference, plus
  a brief CC / SHOP summary and previous days (no all-time total — that's yours).
- **Gujarati beside English** on the words that matter (રોકડ, કાર્ડ, દુકાન,
  કર્મચારી, કુલ…). Photos, colour and icons carry the rest.

## 4. Two things I could not do — and why

**Fingerprint punch-in is impossible on the phone.** Android's biometric API
only answers "did the *device owner* authenticate?" It cannot tell which
employee is standing there, and staff can't enrol their fingers on the shop
phone. Face scan has the same identification problem.

→ Built with **per-employee PINs** instead (working and tested), structured so a
reader drops in later with no redesign. **Buy a ~$150 WiFi ZKTeco-class time
clock** — see `HARDWARE_RECOMMENDATION.md` for exactly what to look for and how
it connects (`pyzk` over UDP 4370).

**OTA updates need one interactive login from you.** `expo-updates` is already
installed; `eas login` can't be automated. Three commands, ~5 minutes — see
`OTA_UPDATES.md`. Note the OTA-enabled APK must be built *after* that setup.

## 5. Test evidence

- Backend suite: **31/31 passing** (`backend/test_features.py`).
- Live production checks: employee discount, discount cap, stock guard, unknown
  product, punch in/out, MISSING_IN flagging, timesheet, shift summary.
- All test data I created was reversed — your stock still matches your Zobaze
  sync exactly (**0 mismatches, 860 units**), test sales voided, test staff
  removed.

## 6. Honest status of the APK

The backend is **live and verified**. The app UI is **new code that has not yet
been driven on the emulator** — the build kept getting killed by resource
limits overnight. I will not tell you it works until I've seen it work, after
this morning's blank-card lesson. Check the final message in the chat for the
actual build/verification outcome.
