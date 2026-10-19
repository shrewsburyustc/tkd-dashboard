# Prospects — status

Branch `claude/prospect-form-system-cd893d`. Plan: `TKD-Prospects-Build-Plan.md` (approved 2026-10-18). Rulebook v0.236 (design) and v0.244 (plan answers). Mockup: `TKD-Prospects-Mockups.html` rev 3.

**Database live, app not yet.** Migration 0012 is applied to the live Supabase database (2026-10-19), with the 7 starting statuses per school and 0 prospects. Jeffrey pasted it into the Supabase SQL Editor on 2026-10-19 (order 0007 → 0008 → 0009 → 0012, after 0001–0006 and Color Belt's 0010). For each: the live fingerprints equal the PGlite live-order copy exactly (row count + one hash over every row), the security advisor showed only the expected entries (signed-in users may run the checked write functions; internal tables have RLS on and no read rule on purpose), and the tests file passed (run with the real admin and front-desk IDs, rolled back). Nothing has been pushed. 0012 goes live after 0007 → 0008 → 0009, and Prospects goes live together with the Forms public page (v0.241 answer 1).

| Step | State |
|---|---|
| P0 Plan + questions Q1–Q7 | Done 2026-10-18 (v0.244) |
| P1 Merge main (with Forms F1) | Waiting — the Main session merges when Jeffrey asks |
| P2 Migration 0012 + tests + security review | Done 2026-10-18; PGlite 93/93 |
| P3 Screens + preview database + design review | Done 2026-10-18 (preview only); 8 differences wait for Jeffrey in P4 |
| P4 Jeffrey tries the preview (and decides the P3 differences below) | Differences decided 2026-10-18 (v0.245); 2, 3, 5 and 8 built |
| P4b Board view + drag + progress track (mockup screens 11–13) | Decided 2026-10-18 (v0.246). Built in preview + design review (no High; plain bugs fixed); 5 differences decided (v0.247) and built. Committed locally 2026-10-18, not pushed |
| P5 Live setup (0007–0012, then Forms F3) | 0007, 0008, 0009, 0012 applied and checked 2026-10-19 (fingerprints exact, advisor expected-only, all four tests files passed). Still to do: Forms F3 (public page) and F6 |
| P6 Go live with Forms | Needs a separate OK |
| — 0003 history exception | **Proposal only** (`PROPOSAL-0003-history-cleanup.md`), for the Color Belt session; Prospects must not go live before it's decided |

## What P2 added

`supabase/migrations/0012_prospects.sql` (0009 unchanged):
- **Tables:** `prospect_statuses` (per school; 6 built-in + Contacted, colors without red), `prospects` (one per child), `prospect_notes` and `prospect_activity` (never changed), `prospect_opens` (badge per person). Nothing granted except the status columns; everything else read through functions.
- **Automatic prospects:** a trigger on `form_submissions` (one per child, New) and on `class_bookings` (New ↔ Booked, never over a status staff chose). Backfill for sign-ups saved before 0012.
- **Functions (staff and admins):** list (list columns only), search (names, or 4+ phone digits — ids only), panel, badge, prospects for Calendar bookings, status (Joined needs a date), note + follow-up, follow-up, opened, check in / "did they come?" (not for a cancelled class, not for Joined / Not interested) with Undo, open times / book / change / cancel a free class (0009's shared limit and slot locks), statuses add / rename / reorder.
- **Admins only:** delete a prospect (the family's sign-up goes with its last child), delete a custom status (moves its people).
- **2-year clean-up:** every family with no Joined child and no activity for 2 years; runs inside the list, one at a time. Its history copies stay until the 0003 exception is decided.

`supabase/tests/0012_tests.sql`, `0012_fingerprints.sql`; `pglite/run.mjs` runs 0012 before and after seed, after re-runs (0009 re-run doesn't undo it; rows, history and fingerprints unchanged; statuses seeded once) and on the upgrade path (a sign-up saved before 0012 gets its prospects).

## Security review (2026-10-18)

No High. Fixed: **M2** check-in on a Joined / Not interested child refused, Undo can't restore Joined; **L3** the clean-up takes turns and deletes in id order, and never breaks the list; **L5** two first sign-ups at once can't fail on seeding; **L8** booking only on forms that still have a booking field; **L9** opening a just-deleted prospect answers not_found; **L10** fingerprints header. **M1** (deleting writes fresh full copies into the history), L4, L6, L7 are written into the 0003 proposal. Test gaps noted for P3/P5: a two-form shared limit from the panel, TKD01 undo with prospects, history rows.

## What P3 added (2026-10-18, preview only — nothing live, nothing pushed)

- **Prospects section** (rail `ti-address-book` after Forms, address `#prospects`, dark badge = new sign-ups **you** haven't opened). Stage bar + "Follow up today" chip (follow-ups due or overdue, new sign-ups, "Did … come?", cancelled classes) + side-exit chips + search (names or 4+ phone digits). One row per child (Child · Parent · Free class · Follow up · Status); on Both, Worcester then Shrewsbury, each with its own bar, one search for both.
- **Panel** (PC beside the list with ×/Esc to close; tablet below; phone full screen): Call / Text / Email (PC: number large + Copy), Check in / "Did … come?" Came / No-show with Undo, status (Joined asks the date), follow-up, free class with amber "Class cancelled — call the family", Book / Change time / Cancel booking (Undo), siblings, notes with one-tap follow-up (a typed note is never lost silently), timeline, answers and the signature picture (each look recorded), Delete (admins).
- **+ Add prospect** → which Live form → the same Fill in as Forms (now shared: `src/screens/forms/useFillIn.js`). **Edit statuses** (page ⋯): per school; drag or Move up/down; add, rename, recolor; delete custom ones (admins).
- **Phone bar:** Home, Calendar, Prospects, More (Testing, Schedule, Forms). **Calendar:** Check in on today's free classes in the day panel, with Undo.
- **Code:** `src/lib/prospects/` (api, useProspects, checks — 7 groups pass), `src/lib/mockProspects.js` (fake 0012 inside the fake Forms store, schema 2), `src/screens/Prospects.jsx`, `src/screens/prospects/*`, `src/styles/prospects.css`. Builds pass; all 5 check sets pass.
- **Shared files touched:** `src/App.jsx`, `src/components/navItems.js`, `src/lib/mockClient.js`; also `BottomBar.jsx`, `Rail.jsx`, `Shell.jsx`, `pageAddress.js`, `main.jsx`, Calendar (`Calendar.jsx`, `calendar/DayPanel.jsx`, `calendar/text.js`), Forms (`Forms.jsx` now uses the shared Fill in).
- **Design review (separate agent, screenshots at 1280 / 820 touch / 390 touch / 320):** no High; 7 Medium fixed (panel close + Esc, unsaved-note guard, follow-up warning with icon + words, phone cancelled-class icon, dot = what the badge counts, whole row clickable, tablet panel scrolled into view); Low fixed: Check in plain button, tablet warning wraps, Today tile icon, 16px warning icons, Edit icon, search clear tap area, 4px grid, one search on Both + school pins, dead CSS.

## Differences from the approved mockup — decided in P4 (Jeffrey, 2026-10-18, rulebook v0.245)

Answers: 1 A (no age in the list), **2 B (status tag + menu — built)**, **3 B (follow-up as words + quick choices — built)**, 4 A (one-tap Add prospect), **5 B (plain Book button — built)**, 6 A (dot = badge), 7 A (Edit statuses under ⋯), **8 B (`ti-clock-edit` — built)**.

The list as it was asked:

1. The list shows **"Ava R."** but never the child's **age** (the plan says lists never show age; the mockup showed "Ava R., 10").
2. **Status** is a plain dropdown (the mockup shows a colored tag with a chevron).
3. **Follow up** is a date field with "No follow-up" (the mockup shows the date text with a clock icon).
4. **+ Add prospect** opens the form in one tap (the mockup had a list + "Open form").
5. **Check in** is a plain button (the mockup's style); Book a free class stays blue (rev 3).
6. The blue **dot** marks new sign-ups you haven't opened (the same ones the badge counts).
7. **Edit statuses** is under the page's ⋯ menu.
8. **Change time** uses the calendar-event icon (rev 3), which elsewhere means "event"; and the rail's hover bubble says "Prospects" while a screen reader hears "Prospects, 3 new".

## Board build (P4b, 2026-10-18, preview only — not committed yet)

- New: `src/screens/prospects/Board.jsx`, `useCardDrag.js`, `Progress.jsx`, `progress.js`, `progress.checks.mjs` (passes). Changed: `Prospects.jsx`, `ProspectList.jsx` (Progress column replaces Free class), `ProspectPanel.jsx` (big track), `PipelineBar.jsx` (List / Board switch, drop spots), `Dialogs.jsx` (CameDialog), `text.js`, `prospects.css`, `mockProspects.js` (prospect date = sign-up date), shared `src/App.jsx` (passes `staffId` so the view is remembered per person).
- No database change. The List / Board choice is in localStorage `tkd.prospects.view.<staff id>`.
- Design review fixes: Massachusetts date for sign-ups, a Came drop before the class only says when to check in, per-person view memory, 44px switch taps, no countdown for a cancelled class, drag vs swipe, Undo busy guard, Esc click, school switch mid-drag, Board columns as groups, words in text.js, tablet "Scroll sideways" hint.
- Fixed 2026-10-18 (Jeffrey's OK; 0012 still not live): a backfilled prospect's own `created_at` is the day 0012 runs (the bookkeeping trigger sets it), so the sign-up date now always comes from `form_submissions.created_at` — `prospects_list` returns `signed_up_at` and sorts by it, `prospects_search` sorts by it, the Joined-date floor uses it, and the backfill writes each child's "Signed up" timeline line at the real time. PGlite 94/94 (new: list 3g, upgrade check); security review: no High / Medium.
- Differences decided (Jeffrey, 2026-10-18, v0.247): B gray switch; C the Board always shows everyone (Follow up today only in the List; search shows a "Showing n of m" line); D phone follow-up line only when the track's line isn't amber; E stay on the column + green flash on the new stage; F phones hide empty side-exit chips. All built.

## main merged in; Prospects is migration 0012 (2026-10-18, local only)

- `main` (Color Belt phases 2-3, Star testing; live database has 0001-0006 and Color Belt's 0010 grading results) was merged into this branch. Conflicts were resolved by keeping both sides (App.jsx, mockClient.js, the test runner, the rulebook).
- Prospects' migration is now **`0012_prospects.sql`** (Color Belt took 0010, Finance 0011), with `0012_tests.sql` and `0012_fingerprints.sql`.
- Rulebook: this branch's rows were renumbered **v0.233-v0.247** (Jeffrey chose B: renumber now, past the highest on any branch, 0.232). See the 0.247 changelog line for the old to new list.
- PGlite 210/210, including step 14: 0007 -> 0008 -> 0009 -> 0012 on a database built in the live order (0001-0006 + 0010), re-run safety, and the same fingerprints as a minimal database.
- **Paste order for the live database:** 0007, 0008, 0009, 0012 — each followed by its fingerprints file, the security advisor and its tests file.

- 2026-10-19 (v0.255, Jeffrey option A): the panel keeps typed notes visible and puts the automatic changes in a closed "History · n changes" dropdown. Built in preview, checked at 1280 / 820 touch / 390 / 320. **Rulebook numbers clash again:** the camps branch took v0.230–v0.237 after this branch was renumbered to v0.233–v0.247 (overlap v0.233–v0.237).
