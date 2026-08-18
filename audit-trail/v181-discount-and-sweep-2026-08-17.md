# v1.8.1 — discount cap change + visual sweep

**Purpose.** Prove two things with evidence rather than assertion:

1. The discount rules Parth specified on 2026-08-17 are actually in effect
   (max 8%, employee 8%, no preset percentage option, flat/percentage entry).
2. The screens that were never re-checked after the global font-size increase
   were looked at, and every layout defect found was fixed.

Anything below that is not backed by raw output is explicitly marked UNVERIFIED.

---

## 1. Discount change

Parth, verbatim:

> dont make 10% as a option in discount button but if they enter that as editable
> field in flat or percentage, then we give that otherwise only selectable
> discount is employee 8% inside discount. Lets also change the value of 10% to
> 8% maximum.

Finding: there was never a preset 10% option. The only thing displaying "10%"
was `max_discount_pct`, shown in the discount button label and the modal header.

### Files changed (cap 10 -> 8)

- `backend/db.py`            DEFAULT_SETTINGS max_discount_pct "10" -> "8"
- `backend/app.py`           `_resolve_discount` fallback 10 -> 8
- `backend/test_features.py` cap assertions updated to 8%
- `app/app/confirm.js`       initial state + API fallback 10 -> 8

### Live setting changed

```
$ curl -s "$API/api/settings"
{"employee_discount_pct":"8","max_discount_pct":"10","punch_max_hours":"14"}

$ curl -s -X PUT "$API/api/settings" -H "Content-Type: application/json" \
       -d '{"max_discount_pct":"8"}'
{"employee_discount_pct":"8","max_discount_pct":"8","punch_max_hours":"14"}

$ curl -s "$API/api/settings"
{"employee_discount_pct":"8","max_discount_pct":"8","punch_max_hours":"14"}
```

### Verified on device (emulator-5554, v1.8.0 installed)

The app reads the cap from the API at runtime, so this took effect on the
already-installed build with no rebuild. uiautomator dump of the confirm screen:

```
＋ Discount / ડિસ્કાઉન્ટ (max 8%) | 68,1419 775,1492
```

Screenshot of the opened modal — `/tmp/d6_discount.png` — shows:

- title "Discount / ડિસ્કાઉન્ટ"
- "Max 8% = $1.60"  (cart was $20.00)
- a "%" / "$" toggle (percentage or flat)
- input placeholder "0 – 8"
- no preset percentage buttons anywhere
- EMPLOYEE payment tile showing "−8%"

No sale was completed. Confirmed afterwards that the ledger was unchanged
(highest sale id still 20).

### Backend suite

Before: `PASSED 44  FAILED 3`

```
FAIL  $20 discount on $50 cart clamped to $5   {'discount': 4.0, ... 'total': 46.0}
FAIL  total after cap = 45.00                  {'discount': 4.0, ... 'total': 46.0}
FAIL  rejection names the existing holder      {'error': 'pin already used'}
```

The first two were stale assertions of the old 10% cap; the backend was
correct. The third was a genuine stale test: Parth asked that the duplicate-PIN
error NOT name the holder, `app.py:655` was changed to omit `used_by`, but the
test asserting `used_by == "Ramesh"` was never updated. An earlier claim in this
project that the suite was "47 assertions, all passing" was therefore stale.

After updating all three assertions to the correct behaviour:

```
$ ./venv/bin/python test_features.py
...
PASSED 47  FAILED 0
```

Re-run after the `_iso_day` change: `PASSED 47  FAILED 0`.

---

## 2. Live data integrity check

```
products=50  shop=875  warehouse=455
expected:    shop=875  warehouse=455
MATCH

sales (all=1): 17 rows
  id= 20 $  41.00 voided=True    <- emulator test sale, already reversed
  ... 15 voided test rows ...
  id=  2 $  41.00 voided=False   <- real
  id=  1 $  20.00 voided=False   <- real

staff: 3 rows, no duplicate PINs, face_data cleared (re-enrolment pending)
```

---

## 3. Visual sweep (v1.8.0, emulator-5554)

Screens opened and looked at as images, not inferred from source.

| # | Screen | Shot | Result |
|---|--------|------|--------|
| 1 | Home | /tmp/d1_home.png | PASS |
| 2 | POS (top) | /tmp/d2_cart.png | ISSUE — "+ Tap" not tappable |
| 3 | Confirm | /tmp/d5_confirm.png | PASS |
| 4 | Discount modal | /tmp/d6_discount.png | PASS |
| 5 | Manager portal | /tmp/s2_manager.png | PASS |
| 6 | Stock | /tmp/s3_stock.png | ISSUE — "Shop" wraps to "Sho/p" |
| 7 | Timesheet | /tmp/s4_timesheet.png | PASS |
| 8 | Close Shift (top) | /tmp/s5_shift.png | PASS |
| 9 | Close Shift (bottom) | /tmp/s7_shift_bottom.png | ISSUE — misleading Counted |
| 10 | Reports | /tmp/s8_reports.png | ISSUE — raw date over 7 lines |
| 11 | Sale History | — | NOT REACHED |
| 12 | Settings | — | NOT REACHED |

Sale History and Settings were not reached before Parth redirected the work to
the time-clock bugs. They remain UNCHECKED.

### Defects found and fixed

**P1 — Reports, raw date label.** `reports.js:86` does `d.day.slice(5)`, which
assumes an ISO `2026-08-14`. On Postgres `date(created_at,'localtime')` returns
a date object, which Flask serializes as `Fri, 14 Aug 2026 00:00:00 GMT`; the
slice left `14 Aug 2026 00:00:00 GMT`, wrapping over seven lines.

```
$ curl -s "$API/api/reports?days=7"
"by_day": [{"count": 2, "day": "Fri, 14 Aug 2026 00:00:00 GMT", "total": 61.0}]
```

Fixed at the source: `_iso_day()` in `backend/app.py` normalises to
`YYYY-MM-DD` for both Postgres and SQLite. NOTE: requires a backend deploy.

Incidentally confirms the timezone fix is correct — the two real sales at
00:25 and 00:30 GMT are 17:25 / 17:30 Los Angeles on the 14th, and the report
groups them under the 14th.

**P2 — Stock, "Shop" wrapping.** `counterLabel` had `width: 34`, too narrow for
"Shop" at 18pt bold after the type-scale increase, so every row rendered
"Sho" / "p". Widened to 52 and added `numberOfLines={1}`.

**P2 — POS, dead "+ Tap" strip.** The card's `<Pressable>` wrapped only the
image/name/price; the `+ Tap` hint was a sibling `<View>` outside it. Tapping
the centre of the strip twice did nothing; only the card body registered. For
staff who read the "+" rather than the English, this was the worst possible
dead target. Made the hint a `Pressable` with the same `addItem` handler.

**P2 — Close Shift, contradictory row.** A previous-day row read
"Expected $0.00 · Counted $100.00 — ✓ Balanced". `shift.js:214` summed
`paan_cash + tobacco_cash` into "Counted", but only tobacco reconciles against
expected, so the figure shown was not the figure being judged. Now shows
"Tobacco X · Expected Y" with Paan on its own line, and the null-`over_short`
fallback compares tobacco only.

---

## 4. Time-clock rework (Parth, 2026-08-17)

> retry is happening too fast. Face logout dont not work from outside using time
> clock button. It worked from inside. Try again button is not working, it
> launches the face screen but does not start capturing or actual trying. Scan
> face in the time clock should be also auto in/out. Move the scan face to the
> top before 1. Tap your name. When you tap on the name it should auto ask for
> pin and auto in or out.

**"Try again" does nothing — CONFIRMED by code reading.** The auto-scan effect
in `face-punch.js` had deps `[permission?.granted, enrolled, scanOnce, punch]`.
`retry()` sets `status` back to `'starting'`, but `status` was not a dependency,
so the effect never re-ran: the camera re-appeared and no photo was ever taken.
`status` added to the dependency array; the `running` ref still prevents
re-entry when the loop sets `'scanning'`.

**Retry too fast.** Settle delay 900/700ms -> 1200/1800ms, plus a 1600ms pause
holding the failure reason on screen before the next attempt. Also, the reason
for a failed attempt 1 was never displayed (gated on `attempt > 1`, then
overwritten); it now shows whenever present.

**Flow rework.** `punch.js`: Scan Face moved to the top above "Tap your name";
tapping a name opens a PIN sheet immediately (autoFocus) which fires on the 4th
digit — PINs are exactly 4 digits, enforced at `settings.js:68`. No IN/OUT
choice anywhere; the server toggles. `index.js` Time Clock tile now opens
`/punch` instead of dropping straight into the camera.

**Punch-out from the Time Clock button — NOT REPRODUCED.** The backend toggle
at `app.py:790-793` closes any open punch and returns `action: "out"`, so the
server is not at fault. The routing change is a plausible fix but the root
cause is UNCONFIRMED.

**FACE MATCHING IS UNVERIFIABLE HERE.** The emulator has no camera. Nothing in
this file claims face recognition accuracy was tested. Only a real phone can
validate it.

---

## 5. Build

First attempt failed:

```
* What went wrong:
Gradle requires JVM 17 or later to run. Your build is currently configured to use JVM 11.
```

The shell profile sets `JAVA_HOME` to Amazon Corretto 11; JDK 17.0.9 is present
at `/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home`. Note the
wrapping shell command returned exit 0 because the compound command ended in
`tail`, so the task notification reported success for a failed build — the APK
on disk was the previous v1.8.0 artifact from 00:48.

Emulator was shut down before building (`adb emu kill`); swap was 1.4G/3G at
build time, versus 11.1G/12G during the earlier OOM kills.

Version: `app.json` 1.8.1 / versionCode 15. `app/android/` is gitignored
(Expo prebuild output), so `app.json` is the source of truth.
