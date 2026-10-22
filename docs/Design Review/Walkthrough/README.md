# Phase 1 walkthrough — one item at a time

Jeffrey asked (2026-10-21) to go through the phase 1 findings one by one, each with a picture: **today's screens** (real preview screenshots, amber outlines on the problem) next to **the improved version** (green outlines on what changes). Phase 2 waits until the walkthrough is done.

**Rules (Jeffrey, 2026-10-22):** no changes during the walkthrough — decisions are recorded in `Decisions.md`, and at the end we go over everything that will be changed. **Planned is not missing:** each finding is labelled *planned — not built yet* · *approved this way* · *drift* · *missing — not planned* · *unclear*, after checking the owning session's status file, plans, rulebook rows and unmerged branches (`../Phase 1 inventory/Planned-vs-missing-A.md`, `-B.md`).

**How the pictures are made:** `../tools/cdp.mjs` drives a hidden Chrome against the preview app (fake database only); `../tools/compose.mjs` lays the screenshots out from the item's `.json` file into one `.png`. "After" pictures are drawn over the real page in that hidden tab (`../tools/mock-item*.js`) — nothing in the app changes. Raw screenshots are in `shots/`; files marked `MOCKUP` are drawn, not built.

## Order (most important for the Grandmaster first)

"Approved in each section" means every section's version was signed off separately, so the item asks **whether to make them match** — it isn't a mistake.

| # | Item | What the re-check found | Phase 1 groups | Picture | Status |
|---|---|---|---|---|---|
| 1 | Black Belt money in Finance | **Planned — not built yet** (Finance, v0.808) | early warning 1 | `01-blackbelt-money-in-finance.png` | Shown 2026-10-21; relabelled 2026-10-22 — no decision needed |
| 2 | Camps shows money while "Hide private details" is on | **Missing — not planned** (+ Prospects email; one question) | early warning 2, G16 | `02-camps-hide-private-details.png` | **Decided 2026-10-22: yes** — Camps hides money as drawn |
| 3 | Taking a payment: four different ways, and receipts | Approved in each section; receipts: question | G1, early warning 3 | `03-taking-a-payment.png`, `03b-receipts.png` | **Decided 2026-10-22: C** — one small Mark paid box everywhere. **3b decided 2026-10-22: B** — Black Belt's Print receipt in every section |
| 4 | Fixing a payment: undo, edit, refund | Mixed: undo-at-once is drift; asking first and each refund rule approved | G2 | `04-fixing-a-payment.png` | **Decided 2026-10-22: B**, Color Belt's ⋯ menu as the model, Undo payment always confirmed |
| 5 | Errors that vanish, and Wi-Fi drops | Black Belt toasts: drift; offline bar: missing — not planned | G13, early warnings 5–6 | `05-errors-that-vanish.png` | 5a shown 2026-10-22 — waiting for Jeffrey (A / B / C); then 5b Wi-Fi drops |
| 6 | Undo after a change | Mostly drift | G13 | — | |
| 7 | Removing a person: Withdraw, Remove, Cancel | Question (rule says red, mockups plain); Black Belt plain "Remove": drift | G3, early warning 7 | — | |
| 8 | "Are you sure?" boxes: "Keep …" or "Cancel" | Approved in each section; some drift; one question | G4 | — | |
| 9 | Opening a person, and the change history | Color Belt private detail and Color Belt/Camps history: missing — not planned | G6 | — | |
| 10 | The ⋯ menu: order and admin-only items | Approved in each section | G5 | — | |
| 11 | Count cards above a roster | Approved; Color Belt private cards: drift | G11 | — | |
| 12 | Registration link, and opening / closing sign-up | Approved; Forms wording and icons: drift; one question | G8, G9 | — | |
| 13 | The five family sign-up pages | Approved in each section | G10 | — | |
| 14 | Dates and times | Mixed: approved, planned (Black Belt), drift | G12 | — | |
| 15 | Page frame: back links, "view only", Both schools, where settings live | Approved; temporary until Star go-live; school-wide Settings planned, not decided | G15 | — | |
| 16 | Icons: one meaning, one icon | 7 approved icons missing from the map; Forms icons and missing tooltips: drift | G17 | — | |
| 17 | Words: money, names, "Paying by"; empty lists | Approved in each section; unsaved-changes gaps: drift / planned | G18, G14 | — | |
| 18 | Results after testing, and CSV | Approved / planned; one question | G20 | — | |
| 19 | Behind the scenes: duplicates and copied code | Drift | G7, G19 | — | |
| 20 | Rules no section has built: top-bar search, offline bar and offline check-ins, WCAG 2.2 target | Missing — not planned; one question | §3.2, §3.5, §4 | — | |

Group numbers (G1–G20) point to `../Phase 1 inventory/TKD-DesignReview-Inventory.md` §3.
