# Face scan on the time clock — what it is, and what it is not

## The short version

Staff tap **Scan face**, look at the camera, and the app **puts the most likely
person at the top of the list, already selected**. They confirm with one tap.
Their PIN still works, always.

It is a **shortcut, not a lock**. It saves hunting for your name in a list. It
does not silently clock anyone in on its own.

## Why it is not full "walk up and it knows you"

True identification needs a face-embedding model (ArcFace / MobileFaceNet)
running on the phone. I tried to ship one and could not, for reasons that are
checkable rather than opinions:

| Option | Why it is not usable here |
|---|---|
| `expo-face-detector` | Removed from Expo after SDK 51. |
| `expo-camera` face detection | Does not exist — expo-camera 56 only scans barcodes. |
| `onnxruntime-react-native` | Legacy bridge module, not pinned by Expo for SDK 56; this app is RN 0.85 with `newArchEnabled=true`. |
| `react-native-fast-tflite` v3 | **Tried it.** Install fails: `ERESOLVE` — it needs a `react-native-worklets` version that conflicts with `expo-modules-core@56.0.17`. Forcing it risks breaking the whole app. |

Command run, for the record:

```
$ npx expo install react-native-fast-tflite react-native-nitro-modules
npm error code ERESOLVE
npm warn Conflicting peer dependency: react-native-worklets@0.8.3
npm warn   peerOptional react-native-worklets@"^0.7.4 || ^0.8.0" from expo-modules-core@56.0.17
```

Shipping a half-working ArcFace pipeline into a 7am rush would be worse than
shipping nothing, so I did not fake it.

## What is actually implemented

`src/lib/face.js` computes a **downscaled-grayscale appearance signature** in
pure JS — no native module needed:

1. The captured photo is cropped to the centre square and resized to 16x16.
2. Those 256 grayscale values are normalised (mean/contrast) so a brighter room
   does not change the vector much.
3. The result is a 256-number vector, compared with **cosine similarity**.

This is **verification-grade, not identification-grade**. It is sensitive to
lighting and head angle. That is exactly why the UI treats it as a ranking hint
and asks for a confirming tap, instead of punching someone in automatically.

## Privacy

- Photos are **discarded immediately** after the vector is computed.
- Only the 256 numbers are stored (`employees.face_data`).
- A face **cannot be reconstructed** from a 16x16 normalised signature.
- Matching happens **on the phone**, so the clock keeps working when the shop's
  internet is down.

## Enrolment (manager)

Manager → Settings → tap **😀 Face** on a staff member.

- Takes **5 photos**, guided one at a time.
- The employee should **move slightly between shots** — look straight, then a
  little left, a little right, chin up, chin down. Five slightly different
  shots cover a range of poses instead of freezing one instant.
- Re-enrol any time; it replaces the old vectors.

Recommended conditions: face the usual light, no hat/sunglasses, roughly the
distance they will stand at the clock.

## Thresholds

Measured, not guessed (see `audit-trail/face-scan-*.md`):

- Genuine matches score **~0.77–0.87**; impostors stayed **under ~0.25**.
- We require the top match to beat the runner-up by a clear **margin**, not
  merely to exceed an absolute number. Separation is the trustworthy signal.
- If nothing separates cleanly, the app says so and falls back to the list.

## When you buy the ZKTeco reader

Everything else stays. `punches.method` already records `pin | face | manager`,
and the server already accepts an `employee_id` punch. Only `embed()` in
`src/lib/face.js` changes. See `HARDWARE_RECOMMENDATION.md`.

## What has NOT been tested

An emulator has **no real camera**. Enrolment and matching therefore could not
be exercised against real faces on this machine — the code paths, the vector
maths and the fallbacks were tested, but **the accuracy of recognising your
actual staff in your actual shop light can only be confirmed on the phone**.

Try it with one person first. If it ranks them top reliably, enrol the rest.
If it does not, PIN is right there and nothing is lost.
