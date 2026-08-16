# v1.6.0 — what must be verified on the emulator before Parth installs

Purpose: a checklist I hold myself to, so "done" means "I watched it work",
not "the code looks right". Written before the run; results appended after.

## Parth's 8 items

| # | Requirement | How I verify it |
|---|---|---|
| 1 | Keyboard must not cover the field being typed in | Open Settings, Close Shift, Timesheet edit. Tap the LAST field on each. Screenshot: the field and what I typed must both be visible above the keyboard. |
| 2 | Rules hidden from manager (owner-only) | Settings must NOT show discount/punch rules until "Owner settings" is tapped. |
| 3 | Register staff moved up | "Add staff" must be the FIRST section in Settings. |
| 4 | Duplicate PIN must not clock in the wrong person | Try to add two staff with the same PIN -> refused. Time Clock must require tapping a name before IN/OUT enable. |
| 5 | Paan must not count toward expected | Close Shift: enter tobacco only -> balanced. Add a large paan figure -> over/short must NOT change. Also "Who worked today" must list staff. |
| 6 | No typing timestamps | Timesheet edit -> date button opens a calendar, time button opens a clock. No seconds anywhere. |
| 7 | Timesheet not wordy | Tabs per staff, table Date/In/Out/Hrs, per-staff total, no "all staff" figure. |
| 8 | Stock editable inline | Stock list rows show [-] n [+] for Shop and for WH; tapping changes the number and persists after refresh. |

## Face scan

- Manager -> Settings -> 😀 Face opens the enrolment screen.
- Time Clock shows "Scan face" AND the PIN path still works.
- NOTE: an emulator has no real camera. I can prove the screens open, the
  permission prompt appears and the fallbacks work; I CANNOT prove recognition
  accuracy. That must be said plainly, not glossed over.

## Regressions to re-check (previously fixed, must stay fixed)

- No blank product card after completing a sale (v1.4.2 bug).
- Currency is $ everywhere, never ₹.
- One header per screen, never two.
- EMPLOYEE button applies 8% and disables the manual discount.
- Discount capped at 10% of cart.

## Data hygiene

Backend is LIVE with Parth's real inventory. Every sale created during testing
must be voided, every test employee removed, every shift close deleted. Final
check must show **860 units, 0 mismatches** against /tmp/zobaze_read.json.

---

# RESULTS

(appended after the run)
