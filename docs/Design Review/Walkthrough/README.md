# Phase 1 walkthrough — one item at a time

Jeffrey asked (2026-10-21) to go through the phase 1 findings one by one, each with a picture: **today's screens** (real preview screenshots, amber outlines on the problem) next to **the improved version** (green outlines on what changes). Phase 2 waits until the walkthrough is done.

**How the pictures are made:** `../tools/cdp.mjs` drives a hidden Chrome against the preview app (fake database only); `../tools/compose.mjs` lays the screenshots out from the item's `.json` file into one `.png`. "After" pictures are drawn over the real page in that hidden tab (for example `../tools/mock-item01-finance.js`) — nothing in the app changes. Raw screenshots are in `shots/`; files marked `MOCKUP` are drawn, not built.

## Order (most important for the Grandmaster first)

| # | Item | Phase 1 groups | Picture | Status |
|---|---|---|---|---|
| 1 | Black Belt money is missing from Finance | early warning 1 | `01-blackbelt-money-in-finance.png` | Shown 2026-10-21 |
| 2 | Camps shows money while "Hide private details" is on | early warning 2, G16 | — | Next |
| 3 | Taking a payment: four different ways, and receipts | G1, early warning 3 | — | |
| 4 | Fixing a payment: undo, edit, refund | G2 | — | |
| 5 | Errors that vanish, and Wi-Fi drops | G13, early warnings 5–6 | — | |
| 6 | Undo after a change | G13 | — | |
| 7 | Removing a person: Withdraw, Remove, Cancel | G3, early warning 7 | — | |
| 8 | "Are you sure?" boxes: "Keep …" or "Cancel" | G4 | — | |
| 9 | Opening a person, and the change history | G6 | — | |
| 10 | The ⋯ menu: order and admin-only items | G5 | — | |
| 11 | Count cards above a roster | G11 | — | |
| 12 | Registration link, and opening / closing sign-up | G8, G9 | — | |
| 13 | The five family sign-up pages | G10 | — | |
| 14 | Dates and times | G12 | — | |
| 15 | Page frame: back links, "view only", Both schools, where settings live | G15 | — | |
| 16 | Icons: one meaning, one icon | G17 | — | |
| 17 | Words: money, names, "Paying by"; empty lists | G18, G14 | — | |
| 18 | Results after testing, and CSV | G20 | — | |
| 19 | Behind the scenes: duplicates and copied code | G7, G19 | — | |

Group numbers (G1–G20) point to `../Phase 1 inventory/TKD-DesignReview-Inventory.md` §3.
