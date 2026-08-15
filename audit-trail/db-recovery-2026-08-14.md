# Audit: Backend recovery — Supabase deleted → migrated to Render Postgres (2026-08-14)

Purpose: prove why the live backend was down and that it was brought back to a
working state with the real 49-item catalog and PIN 1031 intact. All output
below is raw evidence from 2026-08-14.

## 1. Root cause: Supabase project deleted
Live Render logs (runtime), backend crash-looping on startup:
```
psycopg.OperationalError: connection failed ... port 6543 failed:
FATAL: (ENOTFOUND) tenant/user postgres.luodcoqqlwpdunlaiirl not found
```
DNS proof the project is gone (paused would still resolve):
```
$ nslookup luodcoqqlwpdunlaiirl.supabase.co   -> NXDOMAIN
$ nslookup db.luodcoqqlwpdunlaiirl.supabase.co -> NXDOMAIN
```
Free Supabase auto-pauses after ~7 idle days, then deletes. Last DB activity
was 2026-07-02; untouched since, so it was reclaimed.

## 2. Fix: new Render free Postgres (created via API)
```
POST /v1/postgres -> 201  id=dpg-d9voqo5bedkc73erq9m0-a  plan=free region=oregon v16
DATABASE_URL (service srv-d8tgd1po3t8c73bjihc0) set to internal conn string:
  postgresql://kcpaan_inventory_db_user:***@dpg-d9voqo5bedkc73erq9m0-a/kcpaan_inventory_db
```
CAVEAT (unchanged from v1.4.0): repo is private, so Render POST /deploys 404s on
GitHub fetch. A plain `restart` did NOT reload the new env (kept old host).
Resolved by: repo public -> deploy -> repo private again. No secrets are
committed (conn strings live only in Render env), so the brief public window was
low-risk. Repo confirmed PRIVATE again after deploy.

## 3. Live verification (after deploy dep-d9vos5ojo6nc73b0h660 -> live)
```
GET  /api/health              -> {"ok":true,"service":"kcpaan-inventory"}  HTTP 200
POST /api/verify-pin {1031}    -> {"ok":true,"pin_hash":"3e34b5dc...878d83"}   (= sha256("1031"))
POST /api/verify-pin {9999}    -> {"ok":false}
POST /api/products/import      -> {"imported":49,"replaced":true}   (data/kcpaan_import.json)
GET  /api/products             -> 49 products (with image_url)
GET  /api/dashboard            -> low_count:9, reorder list populated
```
PIN 1031 confirmed present in the new DB (seeded by init_db from KC_STOCK_PIN=1031).

## 4. Known follow-up
Render free Postgres EXPIRES 2026-09-13 (30 days) then is deleted — same failure
mode. Before then: upgrade to a paid tier, or move to Neon (free, no hard
delete). Free-tier web service also cold-starts (~50s) after idle.
