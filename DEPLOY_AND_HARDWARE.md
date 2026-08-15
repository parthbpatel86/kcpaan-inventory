# Over-the-air updates + fingerprint hardware

Two things Parth asked for that need a decision or a purchase, written up so
they can be actioned without re-deriving the research.

---

## 1. Over-the-air (OTA) updates to a few devices

`expo-updates` is already installed (`~56.0.24`). It lets you publish a new JS
bundle that devices pull on next launch — no APK, no reinstall, no Play Store.

### What OTA CAN ship
- Any JavaScript/UI change: screens, layout, labels, prices logic, bug fixes.
  This covers the large majority of future changes to this app.

### What OTA CANNOT ship (still needs a real APK)
- New native modules (e.g. adding a fingerprint SDK, a barcode scanner lib)
- Expo SDK upgrades, permission changes, app icon/name changes
Be aware of this: if a future change adds a native dependency, devices need a
fresh APK regardless of OTA.

### Setup (requires an Expo account — one-time, free)
```
cd app
eas login                 # Expo account
eas update:configure      # writes the updates config + channel
eas update --branch production --message "what changed"
```
Devices on that channel pick the update up on next cold start.

### Cost
Expo's free tier covers a handful of devices comfortably. This shop has ~2-4
devices, far below any paid threshold.

### If you'd rather not use Expo's servers
`expo-updates` supports a **self-hosted** manifest — the update bundle can be
served from any static host (even a folder on the existing Render service).
More setup, no third party. Worth doing only if you specifically want that.

### Recommendation
Use EAS Update on the free tier. Keep publishing signed APKs via GitHub
Releases for the occasional native change.

---

## 2. Fingerprint hardware for employee timesheets

### Why the phone's own fingerprint sensor cannot do this
Android's `BiometricPrompt` answers exactly one question: "is this the device
owner?" It cannot:
- enrol multiple employees,
- tell you WHICH employee just authenticated,
- store per-employee templates.

So a phone-native fingerprint punch clock is not possible, no matter how it's
coded. This is an Android platform limitation, not an app limitation.

### The three real options

**A. Per-employee PIN — BUILT AND WORKING NOW**
Each employee gets a 4-digit PIN; one tap toggles in/out. Zero hardware, works
tonight. Weakness: a staff member could punch in for an absent colleague
("buddy punching").

**B. Face recognition on the phone**
Possible but heavy: needs a face-embedding model bundled in the app, enrolment
photos per employee, and it degrades badly with changing shop-door lighting.
Also a native dependency, so it breaks OTA-only updates. Not recommended as a
first step.

**C. Dedicated biometric terminal — RECOMMENDED**
A standalone WiFi fingerprint/face time clock (ZKTeco-class, ~$150). It handles
enrolment and matching itself, stores thousands of templates, and exposes the
punch records over the network for this app to pull. This is what real shops
use, and it eliminates buddy punching. It also does not depend on the POS phone
being present or charged.

Representative options found (2026-08, prices vary — verify at purchase):
- ZKTeco WiFi fingerprint + face attendance terminal — approx **$147**
- ZKTeco ultra-slim fingerprint attendance terminal (Amazon) — similar range
- GK-GD101E 10" Android biometric time clock with SDK — higher end, OEM SDK

### How the code is prepared for it
The `employees` table already carries a `finger_id` column, and `punches`
records the method used. When a terminal is bought, the integration is:
map each employee's terminal user-id into `finger_id`, poll or receive the
terminal's punch records, and write them through the SAME `/api/punch` path
that the PIN flow uses. No schema change, no UI rework.

### Recommendation
Run on PINs now (it works and costs nothing). If buddy punching turns out to be
a real problem in practice, buy a ~$150 ZKTeco terminal and wire it in — the
data model is already shaped for it.
