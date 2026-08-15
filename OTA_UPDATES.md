# Over-the-air updates — pushing a new version without reinstalling

Parth asked: "give me an option where we can deploy new app version of the air
on my limited amount of devices."

`expo-updates` is now installed and configured, so most changes reach the shop's
phones by staff simply reopening the app — no APK, no USB cable, no reinstall.

## What can and cannot go OTA

| Change | OTA? |
|---|---|
| Screens, layout, colours, text, Gujarati labels | ✅ yes |
| Business logic (discount rules, checkout flow, timesheet UI) | ✅ yes |
| Bug fixes in JavaScript | ✅ yes |
| Adding a **native** module (camera, fingerprint reader, barcode scanner) | ❌ new APK |
| Changing app name, icon, permissions, `versionCode` | ❌ new APK |

Rule of thumb: if the fix is in `app/` or `src/`, it goes OTA.
Backend changes (`backend/`) never need an app update at all — they take effect
as soon as Render redeploys.

## One-time setup (Parth must do this — it needs an interactive login)

```bash
cd ~/git/kcpaan-inventory/app
npx eas login          # your Expo account
npx eas init           # creates the EAS project, writes extra.eas.projectId
npx eas update:configure
```

Then rebuild and install **one** APK (this build is the one that knows how to
fetch updates). Every later JS change can go over the air.

## Pushing an update (the day-to-day command)

```bash
cd ~/git/kcpaan-inventory/app
npx eas update --branch production --message "what changed"
```

Staff get it next time they open the app. `checkAutomatically: ON_LOAD` means it
checks at launch; the update applies on the following launch.

## Why this is limited to your devices

The APK is distributed privately (GitHub release link), not through the Play
Store, so only devices you installed it on exist. EAS Update pushes to that
same build. There is no public listing to find.

## Config already applied (`app.json`)

```json
"runtimeVersion": { "policy": "appVersion" },
"updates": {
  "enabled": true,
  "checkAutomatically": "ON_LOAD",
  "fallbackToCacheTimeout": 8000
}
```

`runtimeVersion: appVersion` ties updates to the app version, so a JS bundle can
never land on an APK whose native code it doesn't match — that mismatch is the
usual way OTA setups break.

## Safety

If an update is bad, roll back without touching the devices:

```bash
npx eas update:republish --branch production --group <previous-group-id>
npx eas update:list --branch production      # find the group id
```

`fallbackToCacheTimeout: 8000` means if the update server is slow or down, the
app starts with the last good bundle after 8 seconds instead of hanging — the
counter keeps working even when the network doesn't.
