# KC Paan — POS & Inventory

Android app for shop staff: a simple Point-of-Sale plus PIN-gated stock management,
backed by one shared cloud database so multiple installs stay in sync.

## Download the APK

**Latest:** https://github.com/parthbpatel86/kcpaan-inventory/releases/download/v1.0.0/KCPaan-POS-v1.0.0.apk

Install: download on the Android device → allow "install from unknown sources" → tap to install.

## Two sections

### 🛒 Shop Sales (POS) — open
- Product cards ordered by **best sellers** (most units sold first)
- **Tap** a card to add to cart · **long-press** to remove
- Right-side cart panel on tablets; bottom cart bar on phones
- **Checkout**: Credit Card / Cash / In-store use (recorded, no real card processing)
- Each card shows a **demand color dot** based on stock vs weekly sales:
  - 🟢 healthy · 🟡 getting low · 🔴 order ASAP

### 📦 Stock Management — PIN-gated
- Shop floor **and** warehouse quantities per product
- Add / remove / modify stock at either location
- **Move** stock warehouse → shop
- Add new products, edit price/category/reorder level, remove products
- Stat strip: total shop stock, warehouse stock, items needing reorder

## Architecture

```
Android app (Expo SDK 56 / React Native)  ──HTTPS──▶  Flask + SQLite API (Render)
   app/                                                  backend/
   - POS + Stock screens                                 - products, sales, stock moves
   - shared cart + API client                            - demand calc for color coding
                                                          - PIN verification
```

- **Backend:** https://kcpaan-inventory-api.onrender.com (Render free tier, Docker)
- **Shared DB:** all app installs read/write the same backend, so stock and sales are consistent across devices.
- **Stock PIN:** stored in the database (`settings` table); verified server-side, cached as a SHA-256 hash on device for offline unlock.

## Backend API

| Method | Path | Purpose |
|--------|------|---------|
| GET  | `/api/health` | health check |
| GET  | `/api/products` | products, sorted by popularity, with demand color |
| POST | `/api/products` | create product |
| PUT  | `/api/products/:id` | update details |
| DELETE | `/api/products/:id` | archive product |
| POST | `/api/products/:id/stock` | add/remove/adjust/move stock |
| POST | `/api/sales` | record a sale (decrements shop stock) |
| GET  | `/api/sales/summary` | today's totals by payment type |
| POST | `/api/verify-pin` | verify the stock PIN |

## Local development

Backend:
```bash
cd backend
python3 -m venv venv && ./venv/bin/pip install -r requirements.txt
./venv/bin/python app.py        # http://localhost:5005, auto-seeds sample products
```

App:
```bash
cd app
npm install --legacy-peer-deps
npx expo start                  # dev; point API at your machine in app.json -> extra.apiUrl
```

Build the APK locally (no Expo account needed):
```bash
cd app
npx expo prebuild --platform android --no-install
cd android && ./gradlew assembleRelease
# → app/build/outputs/apk/release/app-release.apk
```

## Notes / next steps
- Render free tier is **ephemeral**: the SQLite DB reseeds on cold start. For durable
  data across restarts, attach a Render disk (paid) or switch the DB layer to Postgres.
- Seed data is sample paan products. Import the real Zobaze export to replace them.
- Payments are recorded only (no Stripe/Square integration).
