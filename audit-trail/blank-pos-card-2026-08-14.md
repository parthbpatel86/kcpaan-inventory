# Audit: blank POS card after a sale — wrong fix, then real fix (2026-08-14)

Purpose: record how the blank-card bug was actually diagnosed, why the first
fix (v1.4.1) was wrong, and the evidence that v1.4.2 genuinely fixes it.
Process note: v1.4.1 was shipped to Parth's phone WITHOUT device testing. That
was the process failure — an emulator (AVD kc_test) was available the whole
time. v1.4.2 was verified on-device before release.

## 1. Symptom (reported)
A product card in the Shop Sales grid renders completely blank after a sale.
Recovers on leaving/returning to the screen, and on tapping the blank cell.
Does NOT recover on pull-to-refresh.

## 2. First diagnosis — WRONG (v1.4.1)
Theory: a sale bumps the sold item's `popularity`, re-sorting the grid; FlatList
reused the recycled cell without re-rendering because `renderCard` reads
`cart.items` through a closure FlatList cannot see. Fix applied:
`extraData={cart.items}`.

Supporting-but-misleading evidence: `120 Plus` was the only product with
popularity>0, and it was the card going blank.

Result: shipped as v1.4.1 — **did not fix it**. User still saw the blank card.

## 3. Reproduction on emulator (what should have happened first)
```
$ emulator -avd kc_test ...            -> booted
$ adb install -r KCPaan-POS-v1.4.1.apk -> Success (versionName=1.4.1)
tap Shop Sales -> all cards render fine
tap "120 Plus" -> qty controls appear, cart bar $20.00
tap Cash -> "Sale complete $20.00 — Cash" -> OK
RESULT: "120 Plus" card is BLANK on v1.4.1  (extraData did not fix it)
```
Second test, selling a DIFFERENT item (600 Pouch, position 1):
```
RESULT: BOTH "120 Plus" and "600 Pouch" cards blank
```
This killed the popularity/position theory outright: the bug hits ANY card that
was in the cart at checkout, regardless of position or sort order.

## 4. Root cause — proven with uiautomator
The card's children were present and correctly laid out the entire time:
```
[80,1116][492,1169] TextView text='120 Plus'
[80,1180][492,1239] TextView text='$20.00'
[212,1288][358,1330] TextView text='Tap to add'
[604,1116] '600 Pouch'   [604,1180] '$21.00'   [736,1288] 'Tap to add'
```
Valid non-zero bounds, correct positions — the views existed and were simply
NOT PAINTED. So this was never a data or re-render bug; it is an Android
compositing/invalidation bug.

Mechanism: `styles.card` had `overflow: 'hidden'`, which forces a clipping
layer. On checkout `cart.clear()` flips `inCart` 1 -> 0, swapping the footer
from the taller `cardQtyRow` (34px buttons) back to the shorter `cardAddHint`.
That height shrink left the clipping layer stale, painting empty pixels.

## 5. The fix (v1.4.2)
```diff
-  card: { ..., minHeight: 130, ...shadow.card, overflow: 'hidden' },
+  card: { ..., minHeight: 130, ...shadow.card },
```
`extraData={cart.items}` was KEPT — it is correct practice for a FlatList whose
renderItem reads external state — but it was not the fix.

## 6. Verification on device BEFORE release
```
$ adb install -r <v1.4.2 apk>   -> Success, versionName=1.4.2
single-item sale (120 Plus, Cash) -> card renders fully: image, name, $20.00, "Tap to add"
two-item sale (120 Plus + 600 Pouch) -> BOTH cards render correctly
health dots update live (120 Plus -> amber, 600 Pouch -> red at 0)
```
APK: versionCode='7' versionName='1.4.2', signed with the existing
kcpaan-release.keystore (installs over previous versions).
Public download verified: HTTP 200, 96,448,440 bytes.

## 7. Test-data cleanup (live DB was used for testing)
Emulator sales hit the production Neon DB. Sales id 3-9 (03:49-04:02 UTC) were
mine and were voided (which reverses stock). Sales 1-2 were Parth's real sales
and were left intact. Because Parth's own sales had also decremented stock
below the Zobaze-synced numbers, `120 Plus` (6->8) and `600 Pouch` (2->3) were
adjusted back to the Zobaze source-of-truth counts.
```
final check: mismatches vs Zobaze sync = 0 (all 49 match), total units = 860
```

## 8. Lesson
An emulator was available from the start. Shipping an unverified UI fix to the
user's production phone — and asking the user to be the test device — was the
error, not the wrong theory. Wrong theories are fine; shipping them untested is
not.
