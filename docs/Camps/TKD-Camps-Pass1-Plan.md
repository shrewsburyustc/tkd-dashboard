# Camps — plan for the design review's pass 1 fixes

**What this is:** the plan for `docs/Design Review/Rolling check/Pass 1/Fix-Camps.md`, written 2026-11-05 on `camps` after `git merge main` (40660d8). Each item keeps its finding id. Nothing is built before Jeffrey OKs its picture.

**How each step runs:** picture (one PNG per screen, amber outlines, 1280 / 820 touch / 390 touch / 320) → Jeffrey's OK → rulebook row from 0.700–0.799 if he decides something new (next free **0.740**; 0.739 = a Blank camp starts with Early drop-off and Late pick-up) → a subagent builds → a separate design reviewer and code reviewer (plus a security reviewer for step 3) → fixes → status file → commit on `camps`. No push.

---

## Step 1 — small screen fixes (no database change)

One picture: **20-small-fixes**.

| Id | What changes | Files |
|---|---|---|
| S-8 | The camp ⋯ order: Close / Open sign-up, **Edit camp**, Save as template, Print roster, Delete camp (Edit moves down one) | `CampRowMenu.jsx` |
| R2-07 (words) | The Undo of Close sign-up says "Undone. Sign-up is open again." (the Undo of Open sign-up stays "Undone") | `CampRowMenu.jsx`, `camps/text.js` |
| R2-03 | Restoring a "Duplicate copy" says "[Name] restored" with **no Undo**; other restores keep Undo | `CampPage.jsx` |
| S-2 | Retry on five failed reads: Edit camp, before Undo payment, Edit payment, Delete permanently, Delete camp. The words stay. For the check: a "fail the next read" helper in the fake Camps store | `CampDialog.jsx`, `CampPage.jsx`, `CampRowMenu.jsx`, `mockCamps.js`, **`mockClient.js` (shared file)** |
| R4-06 | The family page's week title goes from weight 600 to 500 (the printed roster keeps 600) | `camp.css` |
| Smaller | Straight apostrophes in the Undo payment box; the staff empty line becomes "No camps yet. An admin adds them." | `camps/text.js` |
| Comment | `camperHistoryWords.js` lines 26–27: reword the comment now that v1.122 (R4-07) is on main (7511656). Comment only | `camperHistoryWords.js` |
| Records | Status file: fix line 142 (C10 is no longer waiting); record the four checks (⋯ placement on PC, Finance after Edit payment + its Undo, focus after a Camps-list dialog on touch, the "$140 due" tag measuring 67×22) | `TKD-Camps-Status.md` |

## Step 2 — the area above the roster (no database change)

One picture: **21-roster-top**. These four items all change the same strip of screen, so they share one picture.

| Id | What changes | Files |
|---|---|---|
| R3-10 | New order: duplicate box → count cards (with "Updated …" and the count line) → "Showing … only" → Find a camper → week switch → roster | `CampRoster.jsx` |
| R3-02 | A "Possible duplicate" row leaves **To collect** (count, amount and its filter list) until the pair is resolved; Campers and Coming don't change; Payments recorded keeps its money. One gray line says so | `campRules.js`, `checks.mjs`, `CampRoster.jsx`, `camps/text.js` |
| R5-04 | Payments recorded gets the gray line "includes $X from removed campers" when removed campers paid something | `campRules.js`, `checks.mjs`, `CampRoster.jsx`, `camps/text.js` |
| R3-09 | No match: 'No campers match "zz". · Clear search' (search text wins over a card's words); the box gets the shared ✕ button with the "Clear search" tooltip | `CampRoster.jsx`, `camps/text.js` |
| Smaller | The picture also shows "Showing coming Mon, Apr 19 only · Show all" (missing from picture 18) | — |

**One decision comes with this picture:** the shared count-card row takes **one** gray line under it, and the count line (Early / Late / Pizza) already uses it. A camp with a possible duplicate needs a second line. The picture will draw each option (for example: both lines in that one spot, the shared part taking two lines, or the line on the To collect card itself), with pros, cons and a recommendation. A change to the shared part needs your OK first.

At the next rulebook edit: add "also Camps' Coming card (v0.737)" to §2.4's `ti-calendar-event` row.

## Step 3 — R1-05 Record refund (database change)

One picture: **22-record-refund** (⋯ → Record refund, the box, the toast with Undo, the history line, the receipt's minus line, Edit / Undo payment grayed with "Undo the refund first.").

- **Migration 0039** (reserved by Main 2026-11-05, main c769a66; file `0039_<what>.sql`, SETUP "## Migration 0039: …", `step0039`):
  - `camp_payments` gets a new kind `refund`: its own negative row with the date, the way (cash or check), the desk's school, and no `reverses_payment_id`. Copies Star's `star_record_refund` (0006).
  - `camp_payments_kind_check` widens. It was last redefined in **0022**, not 0013.
  - The refund function is for admins only. It refuses:
    - an amount above what was overpaid;
    - anything that takes the camper's net paid below zero.
  - Every refund is logged.
  - Undo reverses the refund row.
  - Every Camps reader that adds up a camper's payments gets checked so a refund counts.
  - Follows handoff §6: a SETUP section "## Migration 00NN", `step00NN` in the PGlite runner, a tests file and a fingerprints file. Security review before you paste.
- **Fake store:** the same refund in `mockCamps.js`, so the preview check passes.
- **App:**
  - "Record refund" shows in ⋯ and in touch "More", only while the camper is overpaid.
  - Words, box and receipt line are copied from Star's.
- **Order:**
  1. You paste the migration, then the after-apply checks run.
  2. Finance does its own R1-05 (camp refunds in its Refunds group). Finance's readers already carry each camp row's kind, so it may need little.
  3. The app push that offers Record refund waits for both.

## Later — each waits on another session's fix reaching main

| Id | Waits on | What Camps does then |
|---|---|---|
| R2-05 | Dashboard core's R2-05 | Undo during a save uses the shared queue helper |
| R1-08 | Dashboard core's R1-08 | "$X due" tags gray while Mark paid saves (maybe nothing to build) |
| R3-13 | Dashboard core's R3-13 | Edit payment's Date paid shows "Days after today can't be chosen." |
| R1-06 | Dashboard core's R1-06 | Undo payment box takes the shared words |
| R1-07 | Dashboard core's R1-07 | Payment line and history words take the shared set |
| R2-07 (words) | Dashboard core's R2-07 | "Someone else changed [Name] just now…" set |
| R3-06 | Dashboard core's R3-06 | Camp page's back link switches to the shared one |
| R5-03 | New students' R5-03 | Family page's Remove becomes the trash icon button (picture first) |
| Paying by "(chosen on the form / at the desk)" | Star's R1-02 | Camper detail adds it (picture first) |
| Tag target size | Dashboard core's R4-09 | Measure the tag again |
| C19 | Dashboard core's M12 | Refresh warning folds into the shared offline bar (picture first) |
| S-10 | next time that screen is worked on | Browser dropdowns become the shared Select |

## Rough size

Step 1: about one working session. Step 2: one session plus your decision on the gray line. Step 3: the biggest, two to three sessions of build and review, then your paste and Finance's part. The "Later" items are each small once their shared part lands.
