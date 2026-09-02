# Product image audit — all 50 products

**Purpose.** Parth: "Can you do a deep check on if the photo matches the
products? ... I dont want wrong one in there." Every image was downloaded and
LOOKED AT as a picture, not inferred from its filename or URL. This file records
the verdict per product and the evidence for each defect.

Method: fetched /api/products, downloaded all 48 images that had a URL,
normalised to 520px, built labelled contact sheets (/tmp/s_baba.png, /tmp/s2..s8.png)
and viewed each one.

Totals: 50 products. 47 images downloaded and inspected. 2 had no image at all,
1 URL is dead.

---

## A. NOT THE PRODUCT AT ALL — must be replaced

| # | Product | What the image actually shows |
|---|---------|-------------------------------|
| 45 | Tulsi 00 Tin | A **"TRADEX" corporate logo banner**. No product in frame. |
| 47 | Udta Panchi | The **Hookah1 website logo** with "UDTA PANCHI (ARCHIT) KHAINI" typed under it. A placeholder. |
| 37 | Rajnigandha Red Mazaa | A pink **"Classic Premium Mouth Freshener — Meethe ka Mazaa"** tin. Different brand entirely. |
| 23 | Kashmiri Qiwam | A sheet of printed **warning/ingredient labels**, not the tin. |
| 15 | Budhalal | Blurry photo of a **cancer-warning panel**; brand name not legible anywhere. |
| 13 | Baghban ULTRA 138 NEW | **Byte-identical URL to #12 Baghban 138** — plain tin, no ULTRA branding. |

## B. WRONG FORMAT OR AMBIGUOUS — needs Parth's call

| # | Product | Problem |
|---|---------|---------|
| 2 | 600 Pouch | Image is a **TIN**, product is named POUCH. Also Hookah1 watermark. |
| 1 | 120 Plus | Shows a 10gm **"Baba with Silver"** tin — overlaps #7 (Baba 120 Silver) and #8 (Baba 120 Small). Unclear which SKU "120 Plus" is. |
| 19 | Gold Plus Sopari | Box reads "Tasty **Gold** Sweet Supari" — no "Plus". Possibly a different variant. |
| 20 | Gulab Powder | Three jars (chocolate / gulab / pineapple); only the middle one is Gulab. |
| 26 | Meenakshi Khus | Generic 3-pouch Meenakshi shot; nothing identifies Khus. |
| 30 | Pan Parag Gutka | A marketing graphic captioned "NEW PACKAGING vs OLD PACKAGING". |

## C. RIGHT PRODUCT, POOR TILE — cosmetic

| # | Product | Problem |
|---|---------|---------|
| 9 | Baba 160 | Hookah1 watermark across a composite of two tins + warning boards. |
| 4 | 90 Nauratan Qiwam Small | Watermark + a warning panel filling the top third. Also see duplicate note. |
| 33 | Panderpuri Hanuman Chhap | Mostly a yellow warning label, Hookah1 watermark. |
| 28 | Mirag | Lower half is a warning panel. |
| 31 | Pan Parag Pouch | Blurry. |
| 46 | Tulsi Pouch | Warning panel fills the lower half. |
| 43 | Shahi Deluxe Sopari | Faint "dailycart" watermarks. |
| 38 | Rajnigandha Saffron | "SET OF 1" retailer sticker overlaid. |

## D. NO USABLE IMAGE

| # | Product | State |
|---|---------|-------|
| 24 | Madhuri Katha | image_url empty |
| 50 | Small Rajnighandha 4gm Pouch | image_url empty |
| 36 | Big Rajnigandha Pouch | URL present but download failed (dead link) |

## E. POSSIBLE DUPLICATE SKU

**#4 "90 Nauratan Qiwam Small"** and **#5 "90 Qiwam Baba Nauratan"** show the
same physical jar (Baba Nauratan Qiwam Saffron 90). #5 has the clean image, #4
is watermarked. These may be two entries for one product — Parth to confirm
before either is merged.

## F. CONFIRMED CORRECT (no action)

3, 5, 11, 12, 14, 16, 17, 18, 21, 22, 25, 27, 29, 32, 34, 35, 39, 40, 41, 42,
44, 48, 49 — and 6, 7, 8, 10 in the Baba 120/160 family, which was the group
Parth specifically asked about:

- #6 Baba 120 No Silver — tin reads "Without Silver Leaves" ✓
- #7 Baba 120 Silver — gold/black premium tin ✓
- #8 Baba 120 Small — 10g pouch ✓
- #10 Baba 160 Small — small tin reading "160 Saffron" ✓
