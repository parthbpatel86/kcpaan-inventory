# Zobaze → KC Paan: Feature Research & Roadmap

Deep research on Zobaze POS, mapped to the KC Paan app, with a prioritized build plan.

## Overview

Zobaze POS is a popular mobile-first point-of-sale and inventory app for small retail and food shops (heavily used by Indian kirana/paan/tea stalls). Core feature set: (1) Billing/Counter — build a cart by tapping products or scanning barcodes, apply discounts/taxes/charges, take Cash/Card/UPI/Credit payments, and print or share a receipt; (2) Catalog & Inventory — products with price, cost price, barcode, category, image, variants, units, opening stock, low-stock alerts, stock in/out adjustments; (3) Customers & Khata — customer directory with credit/udhaar (due) tracking and payment reminders; (4) Reports — daily/period sales, profit (using cost price), top items, payment-mode and tax summaries, exportable to CSV/PDF; (5) Staff — multiple logins with role permissions and activity tracking; (6) Settings — receipt/business profile, tax rates, multiple stores. Premium (Zobaze "Premium"/subscription) unlocks unlimited products, advanced reports, profit reports, multiple staff/stores, barcode label printing, and removing branding. The KC Paan app already covers tap-to-cart POS, best-seller sorting, favorites, category chips, stock with shop/warehouse split, reorder logic, and a simple manager dashboard — so it is roughly a free-tier Zobaze for billing+stock but is missing receipts, sale history, profit/cost, customers/khata, taxes/discounts, staff accounts, real reports, barcode, and CSV import.

## Top Gaps (ranked)

1. Receipts: no way to print or share (WhatsApp/PDF) a bill — biggest credibility gap vs Zobaze for a real counter.
2. Sale history: no screen to look up past transactions, re-open or void a sale — owner can't audit the day.
3. Reports & profit: only today's total exists; no date-range sales, top-items, payment-mode split, and no cost price so no margin/profit at all.
4. Customers & Khata (udhaar): no credit-ledger for regulars who run a tab — a core paan-shop need Zobaze covers.
5. CSV import: no bulk product load, so migrating the existing Zobaze catalog means re-typing everything by hand.
6. Offline mode: app is online-only against Render; flaky shop internet can block billing.
7. Staff accounts: only a single shared PIN — no per-staff login, roles, or 'who sold what'.
8. Discounts at billing: can't apply a quick discount to an item or bill.
9. UPI payment option + QR: India's dominant payment mode isn't a first-class option at checkout.
10. Barcode scanning: no scan-to-add for packaged goods (cigarettes, chips, cold drinks).

## Feature Catalog

| Priority | KC Status | Effort | Tier | Feature | How we'd build it |
|----------|-----------|--------|------|---------|-------------------|
| P0 | have | S | free | Tap-to-cart billing (Counter) | Already present in POS screen (product cards, inline +/- qty, cart). No work needed. |
| P0 | have | S | free | Quick-add favorites / best-seller sort | Already implemented (best-seller sort + favorites row). Keep. |
| P0 | have | S | free | Category chips / filtering | Already implemented (category chips). Keep. |
| P0 | have | S | free | Low-stock / reorder alerts | Already implemented (demand color dots, reorder filter, dashboard 'need reorder'). Keep. |
| P0 | missing | M | free | Sale history / transactions list | Flask: GET /sales (paginated, date filter) + GET /sales/:id with line items; ensure sale_items table stores qty/price/name snapshot. Expo: list screen + detail. Add a 'void sale' that reverses stock. |
| P0 | missing | L | free | Receipt generation + print/share | Phase 1: expo-print to make a PDF/HTML receipt + expo-sharing for WhatsApp (works on any phone, good enough for a paan shop). Phase 2 (optional): Bluetooth 58mm thermal printer via react-native-bluetooth-escpos-printer — needs a dev/bare build, ejecting managed workflow, flag before doing. |
| P0 | missing | M | premium | Cost price + profit tracking | Add cost_price column to products; capture cost at product add/edit (PIN-gated). Compute profit = sum(sell - cost) in reports. Snapshot cost into sale_items at sale time so historical profit stays accurate. |
| P0 | missing | M | free | CSV import of products | Flask: POST /products/import accepting CSV/XLSX (pandas/csv module), upsert by name or barcode, validate, return row errors. Needed to migrate the existing Zobaze catalog without re-typing every item. |
| P0 | partial | S | free | Payment modes (Cash/Card/UPI) | We record Cash/Card/In-store. Add a UPI option (record-only, optional static QR image of the shop VPA shown at checkout). Add payment_mode column to sales; no gateway needed. |
| P0 | partial | M | premium | Sales reports (day/period, top items, payment mode) | We only have today's total+count on Home. Add /reports endpoint: aggregate by date range, by item, by payment_mode, plus profit (needs cost_price). Expo: a Reports tab with date picker + simple bar/list. Single shop = light queries on SQLite. |
| P1 | have | S | premium | Warehouse + shop stock split | Already implemented (shop + warehouse qty, move warehouse->shop). This is beyond base Zobaze; keep as a differentiator. |
| P1 | missing | M | free | Discounts (line + cart level) | Add discount fields to cart state + sale/sale_items. UI: long-press item or a 'discount' button on cart. Keep simple: flat amount or %, store the resolved amount. |
| P1 | missing | L | free | Customers directory + Khata/Udhaar (credit) | New customers table + customer_id on sales + a ledger table (debit on credit-sale, credit on repayment). Expo: customer list, balance, 'add payment'. Common need for paan shops (regulars run a tab). |
| P1 | missing | S | premium | Export reports/data to CSV/PDF | Flask: stream CSV from query; expo-print for PDF. Reuse the Sheets/Drive pattern already used elsewhere for KC Paan if cloud export is wanted. |
| P1 | missing | S | free | Business profile / receipt settings | Single settings row/JSON in Flask + a Settings screen. Feeds the receipt template. Needed before receipts look real. |
| P1 | missing | L | free | Offline mode / sync | Currently all calls hit Render (online-only). Add a local SQLite/AsyncStorage queue: write sales locally, push to Flask when connected. Important because shop wifi/mobile data is flaky and billing must never block. |
| P1 | partial | M | free | Stock in/out adjustments + audit | We have add/remove/modify + warehouse->shop move + quick restock. Add a stock_movements log (reason, qty, timestamp, who) so adjustments are auditable and feed a stock report. |
| P1 | partial | M | premium | Staff accounts + roles/permissions | We only have a single PIN (1031) gating stock. Add a staff table with name + PIN + role; attach staff_id to sales and stock_movements; gate stock/reports by role. Lightweight for a 1-5 person shop. |
| P2 | missing | M | free | Taxes (GST) | Most single paan shops are below GST threshold / unregistered, so this is low priority. If needed: tax_rate on product, compute CGST/SGST split on receipt. Make it a settings toggle, off by default. |
| P2 | missing | M | free | Barcode scanning at billing | expo-camera/expo-barcode-scanner; add barcode column to products and lookup-by-barcode. Low value for loose paan/tea but useful for packaged goods (cigarettes, chips, cold drinks). Optional. |
| P2 | missing | M | premium | Product variants / units | Most paan items are single-unit. If needed, add a unit field and simple variant rows. Defer. |
| P2 | missing | L | premium | Multi-store | Out of scope for a single paan shop. Skip unless KC Paan expands to multiple stalls. |
| P2 | missing | L | premium | Barcode label printing | Niche for a paan shop. Defer; depends on barcode + thermal printer support first. |
| P2 | missing | S | free | Held / parked bills | Client-side only: store named held carts in local state/AsyncStorage. Handy at a busy paan counter but not blocking. |

## Roadmap

### Phase 1 — Real receipts + transaction record (table stakes)
- Business profile / receipt settings
- Receipt generation + print/share (PDF/WhatsApp via expo-print)
- Sale history / transactions list
- Void sale (reverses stock)
- UPI payment option + static QR

> A POS that can't produce a receipt or show past sales isn't a Zobaze replacement. expo-print + expo-sharing avoids the thermal-printer/native-build detour and works on the shop's existing phone immediately.

### Phase 2 — Migration + money visibility
- CSV import of products
- Cost price + profit tracking
- Sales reports (day/period, top items, payment mode, profit)
- Export reports/data to CSV/PDF

> CSV import lets us move the live Zobaze catalog over without re-typing. Cost price unlocks profit, which is the main reason owners pay for Zobaze Premium — delivering it makes the switch worth it.

### Phase 3 — Counter conveniences + credit
- Discounts (line + cart)
- Customers directory + Khata/Udhaar
- Stock in/out adjustments + audit log
- Staff accounts + roles

> Khata (udhaar) and quick discounts are daily realities at a paan counter; staff accounts + stock audit give the owner control once more than one person runs the till.

### Phase 4 — Resilience + extras
- Offline mode / sync
- Barcode scanning at billing
- Held / parked bills
- Taxes (GST, optional toggle)

> Offline makes billing robust against flaky internet; barcode/held-bills/GST are nice-to-haves that round out parity but aren't blockers for a single unregistered paan shop. Multi-store, variants, and label printing stay out of scope.

## Product Import (CSV) — target format

Best-guess Zobaze product export columns (header row, comma-separated; map flexibly since Zobaze versions vary). Likely columns: "Item Name, Category, Sale Price, Purchase Price (Cost Price), Barcode/SKU, Unit, Opening Stock/Quantity, Low Stock/Reorder Level, Tax Rate/GST %, Description, Image URL". Our importer should: (1) treat the first row as headers and case/space-insensitively map synonyms — Item Name|Name|Product -> name; Sale Price|Price|MRP|Selling Price -> price; Purchase Price|Cost Price|Cost -> cost_price; Barcode|SKU|Code -> barcode; Quantity|Stock|Opening Stock|Qty -> stock (assign to shop qty, warehouse 0); Low Stock|Reorder Level|Min Stock -> reorder_level; Category -> category; Tax|GST|Tax Rate -> tax_rate; Unit -> unit. (2) Default missing emoji from category, missing reorder_level to a sane number, missing cost_price to null. (3) Upsert by barcode if present else by name. (4) Accept both .csv and .xlsx, skip blank rows, and return a per-row error report. Example header we target: name,category,price,cost_price,barcode,unit,stock,reorder_level,tax_rate,emoji
