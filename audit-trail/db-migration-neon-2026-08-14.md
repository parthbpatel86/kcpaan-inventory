# Audit: Migration to Neon Postgres (2026-08-14)

Purpose: prove the backend now runs on Neon (permanent free tier, no
inactivity-deletion), that the 49-item catalog and PIN 1031 are intact, that
writes persist, and that the temporary Render Postgres was removed.
Raw evidence from 2026-08-14, after db-recovery-2026-08-14.md.

## 1. Why move off Render Postgres
Render free Postgres carried expiresAt 2026-09-13 -> deleted after 30 days, the
same failure mode that destroyed the Supabase project. Neon free plan is
permanent; per Neon FAQ: "None of these limits delete your data." Compute
scale-to-zero after 5 min idle, auto-resumes on connect. Data is not reclaimed.

## 2. Neon connection verified before any change
```
PostgreSQL 18.4 (c9a59a4) on aarch64-unknown-linux-gnu
existing tables: []     (empty project, us-west-2)
```

## 3. Cutover
```
PUT /v1/services/srv-d8tgd1po3t8c73bjihc0/env-vars/DATABASE_URL -> 200
  host now: ep-late-unit-af8xmrvu.c-2.us-west-2.aws.neon.tech/neondb
deploy dep-d9vpv67mal7c7386rv3g -> build_in_progress -> update_in_progress -> live
```
Private-repo deploy block worked around again (public -> deploy -> private).
Repo confirmed PRIVATE after deploy.

## 4. Schema + PIN created by init_db, read DIRECTLY from Neon
```
NEON tables:   ['products', 'sale_items', 'sales', 'settings', 'stock_moves']
NEON settings: [('stock_pin', '1031')]
```

## 5. Live API verification
```
GET  /api/health           -> {"ok":true,"service":"kcpaan-inventory"}
POST /api/verify-pin 1031  -> {"ok":true,"pin_hash":"3e34b5dc...878d83"}
POST /api/verify-pin 9999  -> {"ok":false}
POST /api/products/import  -> {"imported":49,"replaced":true}
GET  /api/products         -> 49
GET  /api/dashboard        -> low_count: 9
```

## 6. Write-persistence proof (API write -> read back directly from Neon)
```
POST /api/products/1/stock {kind:adjust, location:warehouse, delta:+7}
  -> API response warehouse_qty: 7
  -> psycopg direct read from Neon: (1, '120 Plus', 7)
  -> stock_moves rows: 1
Reverted: delta -7 -> warehouse_qty back to 0
```

## 7. Cleanup
```
DELETE /v1/postgres/dpg-d9voqo5bedkc73erq9m0-a -> 204
GET /v1/postgres -> count: 0   (no Render Postgres left)
```

## 8. Remaining caveats
- Render free WEB SERVICE still cold-starts (~50s) after idle; unrelated to DB.
- Future deploys still need the public->deploy->private dance until Render's
  GitHub app connection is re-authorized in the dashboard (OAuth, manual).
- Neon free: 0.5 GB storage, 100 CU-hours/project/month. Current usage is
  49 rows — negligible.
