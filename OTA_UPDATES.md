# Over-the-air updates — pushing a new version without reinstalling the APK

You asked for a way to "deploy new app version over the air on my limited
amount of devices". `expo-updates` is already a dependency, so this is a
configuration + workflow task, not new code.

## What OTA can and cannot update

| Change | OTA? | Why |
|---|---|---|
| Screens, layout, colours, labels | ✅ | It's JavaScript |
| Business rules in the app (discount UI, cart) | ✅ | JavaScript |
| Backend / API changes | ✅ n/a | Server-side already; no app update needed at all |
| New native library (fingerprint SDK, camera) | ❌ | Needs a fresh APK |
| App icon, name, permissions, version code | ❌ | Baked into the APK |

Practically: **almost everything I built tonight would have been OTA-able.**
Only a native addition (e.g. a fingerprint reader SDK) forces a new APK.

## One-time setup (needs your login — I can't do this part)

EAS requires an Expo account login, which is interactive.

```bash
cd ~/git/kcpaan-inventory/app
npx eas login          # your Expo account
npx eas init           # links this project, writes the project id
npx eas update:configure
```

Then rebuild the APK **once** so it contains the update URL and channel:

```bash
npx eas build --platform android --profile production
```

Install that APK on the shop devices. From then on they check for updates.

## Pushing an update afterwards (the everyday workflow)

```bash
cd ~/git/kcpaan-inventory/app
npx eas update --branch production --message "bigger buttons on confirm screen"
```

Devices pick it up on the next app launch (expo-updates checks on start by
default). No reinstall, no USB cable, no visiting the shop.

## Rollback

```bash
npx eas update:rollback --branch production
```

## Free tier

EAS Update's free tier covers a small number of devices comfortably — you have
"a limited amount of devices", which is well inside it. Builds on EAS free are
queued (slow); that's why I build the APK **locally** with the release
keystore instead. OTA updates themselves are not affected by build queues.

## Why I did NOT enable this tonight

`eas login` is interactive and needs your credentials. Everything else is
ready: `expo-updates` is installed, and `eas.json` already has a `production`
profile. The three commands above are all that remain, and they take ~5 minutes
once you're logged in.

## Important caveat

The OTA-enabled APK must be built AFTER `eas update:configure`, because the
update URL and channel are compiled into it. The v1.5.0 APK I built tonight
does **not** have OTA wired up — it is a plain signed release. So the sequence
is: log in → configure → build once → install once → OTA forever after.
