# Fingerprint clock-in — what to buy, and why the phone can't do it

## The constraint (why I did not use the phone's fingerprint sensor)

Android's biometric API (`BiometricPrompt`) answers exactly one question:
**"did the phone's owner just authenticate?"** It returns yes/no.

It cannot:
- tell you WHICH of several employees is standing at the counter,
- enrol a second, third or fourth person's finger,
- return a fingerprint template you could match a name against.

Every employee's finger would have to be enrolled in the phone's own Android
settings, and even then the app is told only "the owner authenticated" — the
same answer for all of them. So multi-employee punch in/out is **impossible**
with the phone's built-in sensor. This is a platform restriction, not a
limitation of the app.

Face scan on the phone has the same problem, plus worse accuracy in a shop
doorway and a paid SDK for real per-person recognition.

## What I built instead (working tonight, no hardware)

Each employee gets a **4-digit PIN**. They tap their name and enter the PIN to
punch in or out. The database records a `method` on every punch, so adding a
reader later does not require re-writing the timesheet, the flags, the manager
fixes, or the audit log — only the identification step changes.

## What to buy for real fingerprints (recommended)

Buy a **standalone ZKTeco-family fingerprint time clock**, not a USB sensor.

Why standalone beats a USB reader plugged into the phone:
- It does its own enrolment and matching — no phone SDK, no rooting, no OTG
  cable dangling off the till.
- It keeps working if the POS phone is busy, dead, or being used for a sale.
- It stores its own records, so nothing is lost if WiFi drops.
- Staff use a dedicated box by the door, which is how real shops run it.

**Model class to look for** (search Amazon for these terms):
- "ZKTeco fingerprint time attendance TCP/IP" — typical models: **K40 / K50 /
  MB460 / uFace / iClock**, roughly **$110–$180**.
- Must-have specs:
  - **TCP/IP or WiFi** (NOT USB-only, NOT "software CD required")
  - stores 1000+ fingerprint templates
  - "attendance / time clock" (not a door access-control panel)

Avoid: cheap "USB fingerprint time clock" boxes that only export an Excel file
from bundled Windows software — those cannot be automated.

## How it would connect to this app

There is a mature open-source Python library, **`pyzk`**
(https://github.com/fananimi/pyzk), that speaks the ZKTeco protocol over
**UDP port 4370**. The backend would:

1. Connect to the device on the shop LAN.
2. Pull new attendance records on a schedule.
3. Map each device user-id to an `employees` row.
4. Insert them as punches — reusing the exact same 14-hour rule, MISSING_IN /
   MISSING_OUT flagging, manager fixes and audit log that are already built
   and tested.

Estimated work once the device is on the shop WiFi: a few hours, mostly
mapping device user-ids to employee records. No UI changes.

**One caveat to know before buying:** the device and the backend must be able
to reach each other. The backend runs on Render (cloud), the device sits on the
shop LAN, so either the shop needs a small always-on machine polling the device
and pushing to the API, or the device needs to use ZKTeco's "push" mode to post
to a public URL. Confirm the model supports **ADMS / push protocol** if you
want it to talk to the cloud directly with no PC in the shop.

## Bottom line

- Tonight: PIN-based punching, fully working and tested.
- When you're ready: ~$150 for a WiFi ZKTeco clock, and the punch records flow
  into the same timesheets without redesigning anything.
