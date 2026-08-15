# Overnight build — what changed, what to check, what needs you

Read this first. Detail lives in `BUG_LIST.md`, `MEGA_PLAN.md`, `OTA_UPDATES.md`
and `audit-trail/`.

---

## 1. The one thing you must decide: fingerprints

You asked for fingerprint punch in/out. **The phone's own sensor cannot do
this.** Android's biometric API answers only "did the *device owner*
authenticate?" — it cannot tell *which* employee is standing there, and staff
cannot enrol their fingers on the shop phone. This is an OS limitation, not a
missing library.

So the time clock ships on a **per-employee 4-digit PIN**. Everything else you
asked for (14-hour rule, flags, manager fixes, audit log, half-month reports)
works exactly as specified.

The database column `employees.finger_id` is already there. If you buy a
**USB or Bluetooth fingerprint reader** (~$40–120), it maps a scan to an
employee and calls the same `/api/punch` endpoint — no schema or logic change.
Say the word and I'll wire it up.

---

## 2. Money-safety bugs found and fixed (these were live)

These were all real, in production, before tonight:

- **Sales could drive stock negative** — no availability check at all.
  Now rejected with a 409 and the exact shortfall. *Verified on production.*
- **The business day rolled over at 5pm Pacific**, not midnight. Render and
  Neon run in UTC, so every evening sale was counted on the *next* day —
  which would have made your shift-close totals wrong every single evening.
  Now pinned to `America/Los_Angeles`.
- **A retried sale could charge twice** on a flaky connection. Every sale now
  carries an idempotency key; a repeat returns the original sale.
- **An unknown product silently vanished from a sale** — the customer was
  charged for fewer items than were rung up. Now a hard 400.
- **Offline sales didn't reduce on-screen stock**, so staff could oversell
  during an outage.
- **Cart held stale prices** — a price edited mid-shift showed one total and
  charged another.

Full list with evidence: `BUG_LIST.md` (13 issues, 6 of them money/stock).

---

## 3. What the app looks like now

**Home** — employee-first. Two big tiles: **Shop Sales** and **Time Clock**.
Everything managerial is behind the **⚙ Manager** button, top-right, PIN-gated
(still `1031`).

**Shop Sales** — 96px photos (was 44px), a search box (the biggest speed win on
a 50-item catalog), out-of-stock items dimmed and non-tappable, real best
sellers only.

**Review order** (new full screen) — every line shows **photo + name + qty +
line total** with inline −/+, then four big buttons:

> **CASH / રોકડ** · **CARD / કાર્ડ** · **SHOP / દુકાન** · **EMPLOYEE / કર્મચારી −8%**

EMPLOYEE is a **toggle**: tap it to arm the 8%, then tap a payment button. The
discount button is deliberately small, capped at **10% of the cart** (enter %
or $ — both clamped, and the server clamps again so a tampered app still can't
over-discount). No PIN on discounts, as you asked.

**Language** — English with the Gujarati word beside it only where a word is
unavoidable. No switcher.

**Manager portal** — Stock · Timesheets · Close Shift · Reports · History ·
Settings.

**Timesheets** — employees punch in/out with their PIN. Open punch over 14h is
auto-flagged `MISSING_OUT` and a fresh punch starts so nobody is blocked;
punching out with no punch-in records `MISSING_IN`. Manager picks an employee
and **1–15** or **16–end**, fixes flagged rows inline, and every edit is logged
(old → new, who, when) and kept 3 months.

**Close shift** — enter Paan counter and Tobacco counter cash; the app tells
you what the drawer *should* hold from that day's sales and shows over/short,
plus brief CC and SHOP totals. Previous days are viewable individually.
**No all-time total anywhere in the app** — that stays yours.
Closing the shift does **not** touch punches, so you can go home and staff
still clock out at the right time.

**Settings** — employee % (8), max discount % (10), punch hours (14) and staff
management. All DB-driven, changeable without a new APK.

---

## 4. What needs you (5 minutes, when convenient)

1. **`eas login` once** to switch on over-the-air updates:
   ```bash
   cd ~/git/kcpaan-inventory/app
   npx eas login && npx eas init && npx eas update:configure
   ```
   After that I can push JS/UI changes to your devices with one command and no
   reinstall. See `OTA_UPDATES.md`.
2. **Add your staff** in Manager → Settings (name + 4-digit PIN each).
3. **Decide on the fingerprint reader** (section 1).

---

## 5. Honest status

- Backend: **verified against production** — settings, shift summary, stock
  guard, discount clamp, idempotency, punch rules, audit log all exercised with
  real requests.
- App screens: code complete; the POS and confirm flow are the parts I care
  most about seeing on a device before you rely on them at the counter.
- Anything I have not seen render on the emulator is called out in the final
  report rather than claimed as done.
