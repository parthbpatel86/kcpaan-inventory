# KC Paan POS — bug list from the full QA sweep (2026-08-14/15)

Found by reading every screen + backend route and by driving the app on the
`kc_test` emulator. Severity: **P1** = wrong money or wrong stock, **P2** =
blocks or misleads staff, **P3** = polish.

Status legend: ✅ fixed & verified · 🔨 fixed, pending device verification

---

## P1 — money / stock correctness

| ID | Bug | Evidence | Fix | Status |
|----|-----|----------|-----|--------|
| B1 | **Cart held a snapshot of the product**, so a price edited mid-shift still displayed (and totalled) at the price the item was added at. The server re-priced correctly, so the customer could be shown one total and charged another. | `cart.js` stored `{product, qty}` | Cart now stores `{id: qty}` and resolves the live product at render. | ✅ |
| B2 | **Offline sales did not reduce on-screen stock.** During an outage the grid kept showing pre-outage quantities, so staff could keep selling an item that was really at 0. | `offline.js` queued the sale only | Queued sales now expose `pendingQtyByProduct()`; POS subtracts them before rendering. | ✅ |
| B3 | **No stock guard on the server** — a sale could drive `shop_qty` negative. | `POST /api/sales` never checked availability | Returns **409** with the shortfall per item; nothing is written. | ✅ verified |
| B4 | **A retried sale could charge twice.** On a timeout the app could not tell "never arrived" from "arrived, reply lost". | no idempotency key | Every sale carries `client_ref`; a repeat returns the original sale with `duplicate: true`. | ✅ verified |
| B5 | **Unknown product silently vanished from a sale** — the line was skipped with `continue`, so the customer was charged for fewer items than rung up. | `create_sale()` | Returns **400** listing the unknown ids. | ✅ verified |
| B13 | **Business day rolled over at UTC midnight** = 5pm Pacific. Every evening sale was attributed to the *next* day, so "today's sales" and the shift close were wrong after 5pm. | Render/Neon run in UTC; `date('now','localtime')` is UTC there | `db.py` now maps local-day SQL to the shop timezone (`America/Los_Angeles`). | ✅ |

## P2 — blocks or misleads staff

| ID | Bug | Fix | Status |
|----|-----|-----|--------|
| B6 | "Best Sellers" was really "first 6 alphabetically" when there were no sales — it advertised itself as data-driven but wasn't. | Now filtered to `popularity > 0`; the row hides entirely when there is no sales data. | ✅ |
| B7 | **No search** across 50 products — staff had to scroll during a queue. | Search box pinned above the grid, filters by name or price. | ✅ |
| B8 | **Out-of-stock items were fully sellable** — only a small red dot distinguished them. | Out-of-stock cards are dimmed, non-tappable, and labelled `Out of stock / સ્ટોક નથી`. | ✅ |
| B4b | A failed checkout cleared the cart in some paths, losing the order. | Server rejections keep the cart and show a plain-language reason. | ✅ |

## P3 — polish

| ID | Bug | Fix | Status |
|----|-----|-----|--------|
| B9 | Reports/History/Stock sat on the employee home screen. | Moved behind the **⚙ Manager** button, top-right, PIN-gated. | ✅ |
| B10 | Discount modal accepted **any** amount and was manager-PIN gated. | Capped at 10% of cart (server re-clamps); PIN removed for counter speed. | ✅ |
| B12 | 44px product thumbnails were too small to pick by sight. | Grid images 96px, best-seller row 64px, confirm screen 72px. | ✅ |
| B14 | `overflow:'hidden'` also present on `stock.js` expandable rows — the same construct that caused the blank-card bug. | Removed. | ✅ |

---

## Already fixed earlier today (kept for the record)

| ID | Bug | Status |
|----|-----|--------|
| B0 | **Blank POS card after every sale.** `overflow:'hidden'` left a stale Android clipping layer when the card's footer shrank on `cart.clear()`. uiautomator proved the text was present but unpainted. | ✅ v1.4.2, verified on emulator |

---

## Known limitation — NOT a bug

**Fingerprint punch-in is not possible with the phone's own sensor.** Android's
`BiometricPrompt` only answers "did the *device owner* authenticate?" — it
cannot identify *which* employee, and staff cannot enrol their fingers on the
shop phone. The timesheet therefore uses a **per-employee PIN**, with
`employees.finger_id` reserved so a USB/Bluetooth reader can be added later
without touching the schema or the punch logic.
