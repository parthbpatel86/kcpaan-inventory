# KC Paan POS — Bug list (QA sweep 2026-08-14)

Found by code audit + emulator testing on v1.4.2. Severity: P1 = money/data
wrong, P2 = user-visible defect, P3 = polish.

## P1 — correctness / money / data

**B1. Cart holds stale product objects (wrong price possible)**
`cart.js addItem` stores the whole `product` object at tap time. If the catalog
refreshes (or a price changes) while items sit in the cart, the cart keeps the
OLD price and the on-screen total is wrong.
MITIGATION ALREADY PRESENT: the backend re-prices from the DB on POST /api/sales,
so the RECORDED sale is correct — but the customer is quoted a wrong number.
FIX: store product_id + qty in the cart; resolve price from the live catalog.

**B2. Offline sale does not decrement local stock -> overselling**
`createSaleResilient` queues the sale offline, but stock only decrements
server-side. While offline, the grid keeps showing the old quantity, so staff
can keep selling an item that is really at 0.
FIX: optimistic local decrement while queued; reconcile on sync.

**B3. No guard against selling more than shop_qty**
Nothing stops adding 10 units of an item with 3 in stock. Backend will happily
drive shop_qty negative.
FIX: clamp add-to-cart at available qty; backend refuses to go below 0.

**B4. Voided sale does not restore `popularity`/demand correctly**
Void reverses stock (verified working) but sale_items rows remain, so voided
sales still count toward popularity ordering and weekly demand.
FIX: exclude voided sales from popularity + demand maps.

## P2 — user-visible defects

**B5. Reports: raw date string**
Daily Sales row renders `15 Aug 2026 00:00:00 GMT` wrapped over 4 lines instead
of `15 Aug`. Confirmed on emulator.
FIX: format date client-side.

**B6. Blank card after sale (FIXED in v1.4.2)**
`overflow:'hidden'` on the card left a stale clipping layer when the footer
shrank after checkout. Already fixed and verified; recorded here for
completeness.

**B7. No empty-state when a category/search has no results**
Filtering to a category with no items shows a blank screen with no explanation.

**B8. Category chips render even when every product has category=null**
All 50 products currently have `category: null`, so the chip row shows only
"All" and wastes vertical space at the counter.

## P3 — polish / employee-friendliness (drives the redesign)

**B9. Product images far too small (44px)** — hard to identify a product at a
glance during a rush. Non-English staff rely on the photo.

**B10. English-only UI** — "Tap to add", "Checkout", "Choose payment",
"Add discount (manager)", "In-store" are all English-only.

**B11. Stock rows show "—" for null category** — looks like a bug to staff.

**B12. No final confirm screen** — checkout goes straight from cart bar to
payment. Parth wants a confirm screen with photo + name + qty per line.

**B13. Manager functions scattered on the home screen** — Stock, Reports and
History are all top-level. Parth wants them behind one manager portal in the
top-right corner.

**B14. Discount requires manager PIN** — slows the counter. Parth chose to
remove the PIN requirement for the (capped) discount.

**B15. No cap on discount** — the discount modal accepts any amount up to the
cart total. Parth wants max 10% of cart total, DB-configurable.
