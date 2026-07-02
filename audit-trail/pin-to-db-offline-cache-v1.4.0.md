# Audit: PIN moved to database + hashed offline cache (v1.4.0)

Purpose: prove the stock/manager PIN no longer lives in source code, is verified
against the database, is usable offline via a cached SHA-256 hash, and that the
repo was made private. All output below is raw evidence from 2026-07-02.

## 1. No hardcoded PIN left in source
```
$ grep -rn "1031" --include="*.js" --include="*.py" --include="*.yaml" . | grep -v node_modules
(only matches: backend env-var fallback default now "0000"; README/roadmap scrubbed)
```

## 2. Local SQLite backend test (fresh DB)
```
$ curl -X POST :5077/api/verify-pin -d '{"pin":"1031"}'
{"ok": true, "pin_hash": "3e34b5dc434bcf3186f089d362691cfac1b17231601f2f402dc79015be878d83"}
$ curl -X POST :5077/api/verify-pin -d '{"pin":"9999"}'
{"ok": false}
$ sqlite3 pintest.db "SELECT * FROM settings"
stock_pin|1031
python sha256("1031") = 3e34b5dc434bcf3186f089d362691cfac1b17231601f2f402dc79015be878d83  (matches)
```

## 3. Supabase production settings table (via pooler, psycopg)
```
rows: [{'key': 'stock_pin', 'value': '1031'}]
rls:  [{'relname': 'settings', 'relrowsecurity': True}]
```
RLS also enabled same day on products/sales/sale_items/stock_moves (Supabase
"rls_disabled_in_public" alert). App unaffected: password login bypasses RLS —
proven by read (49 products) + write (warehouse_qty 0->5->0 on product 31).

## 4. Live backend after Render deploy dep-d93118u7r5hc739vp3k0 (status: live)
```
$ curl -X POST https://kcpaan-inventory-api.onrender.com/api/verify-pin -d '{"pin":"1031"}'
{"ok":true,"pin_hash":"3e34b5dc434bcf3186f089d362691cfac1b17231601f2f402dc79015be878d83"}
$ ... -d '{"pin":"9999"}'   -> {"ok":false}
$ GET /api/products         -> 49 products (regression OK)
```

## 5. Emulator tests, APK v1.4.0 (versionCode 5), AVD kc_test
- pm clear + network OFF + PIN 1031 -> alert "Offline / No connection and no
  saved PIN yet. Connect to the internet and unlock once first."  (noCache path)
- network ON + PIN 1031 -> unlocked to Stock screen (817 shop units shown; hash cached)
- network OFF + PIN 9999 -> alert "Wrong PIN"                     (cached-hash reject)
- network OFF + PIN 1031 -> unlocked to Stock screen              (offline unlock)
- Discount flow: More -> Add discount (manager) -> PIN 1031 -> Discount Amount
  screen shown (server-verified; hardcoded DISCOUNT_PIN removed)

## 6. Repo made private
```
$ gh repo edit parthbpatel86/kcpaan-inventory --visibility private ... -> PRIVATE
```
CAVEAT: Render lost fetch access — POST /deploys now returns
{"message":"not found: https://api.github.com/repositories/1278534276"}.
Current deploy stays live; future deploys need Render<->GitHub app connection.

## 7. APK
Built with existing keystore (no prebuild --clean) -> same signature, installs
over v1.3.0 without uninstall. aapt: versionCode='5' versionName='1.4.0'.
Copied to ~/Desktop/KCPaan-POS-v1.4.0.apk (96,448,440 bytes).
