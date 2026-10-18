# Prospects — build plan (approved 2026-10-18)

Branch `claude/prospect-form-system-cd893d` · 2026-10-18 · step 4 of the new-students work (rulebook v0.137: Schedule → Calendar → Forms → **Prospects**) · implements the Prospects decisions (rulebook v0.140, the "Prospects" row) with the Forms decisions that touch it (v0.145 answers 1 and 6, v0.146, v0.172) · approved mockup `docs/Prospects/TKD-Prospects-Mockups.html` rev 2, plus **rev 3 additions** (screen 10) for what Forms changed · **nothing is built until Jeffrey says OK.**

## 0. What gets built

A new **Prospects** section (rail icon `ti-address-book`, after Forms, address `#prospects`). Every sign-up from a form becomes prospects here — **one per child** — and staff work them until they join or drop out.

- **Pipeline bar** of stage counts (New, Contacted, Booked, Came, Joined — Joined green) above the **list**. Click a stage to filter, click again for all. **No-show** and **Not interested** are chips beside the bar (side exits).
- Opens on the amber **"Follow up today"** chip: follow-ups due today or overdue (overdue dates amber), new sign-ups, and "Did … come?" questions (see 0c).
- **Search** by child, parent or phone. Columns **Child · Parent · Free class · Follow up · Status**. Siblings (same sign-up) are linked. **Each school stays separate:** on Both, Worcester's section then Shrewsbury's, each with its own bar.
- **Rail badge:** a dark count of sign-ups nobody has opened yet (see **Q3**).
- **Side panel** (tablet upright: under the list; phone: full screen):
  - **Call / Text / Email** open the device's own apps (`tel:`, `sms:`, `mailto:`); on a PC Call shows the number large with Copy. The dashboard sends nothing.
  - **Status** menu (stages, then side exits). Joined asks the date joined (default today).
  - **Follow-up date** (`ti-clock-hour-4`).
  - **Free class:** date, time, class; amber **"Class cancelled — call the family"** when the class no longer runs (v0.145 answer 6); booking or changing a time here — see **Q2**.
  - **Check in** (`ti-user-check`) on the class day → Came, with Undo. After the class has ended without a check-in: **"Did … come?" Came / No-show** (`ti-user-x`); No-show sets a call-back for tomorrow.
  - **Siblings** (tap to switch).
  - **Notes and calls:** a note + one-tap follow-up (Tomorrow, In 3 days, Next week, Pick a date, No follow-up), saved with who and when; notes can't be edited. Status changes, check-ins and bookings show in the same timeline.
  - **Form and answers:** the source form, every answer (as the form was when they signed up), "Entered by …" for staff entries, and the **waiver**: the signature picture while it is kept, then **"Signed on <date>"** (v0.146: deleted 90 days after the free class). Every look at a signature is recorded.
- **"+ Add prospect"** asks which Live form (of this school) and opens **Fill in** (already built in Forms).
- **Edit statuses** (admins **and staff**, v0.140): rename, reorder (drag grip or ⋯ Move up / down), add (stage or side exit). **Deleting** a custom status asks where its people move; who may delete is **Q5**. Statuses are shared by both schools or per school: **Q7**. The built-in six (New, Booked, Came, Joined, No-show, Not interested) can be renamed but not deleted — the app uses them. "Contacted" is an ordinary status that starts in the list.
- **Delete a prospect:** admins only, with a confirmation.
- **Calendar:** the day panel's free classes get the **Check in** button and link to the prospect.
- **Phone bottom bar** (six sections): Home, Calendar, Prospects, **More** (`ti-menu-2`: Testing, Schedule, Forms). PC and tablet rails show all six.

**Not in this step:** sending texts or emails from the dashboard, a Students section, attendance beyond the free class, merging duplicate families (see **Q4**), the public form page (Forms F3).

### 0a. Status rules the app keeps
- A sign-up with a booked free class starts **Booked**, without one **New** — per child.
- **Check in** → Came. "Did they come?" No-show → No-show + follow-up tomorrow.
- **Joined** is never deleted automatically. **Not interested** is deleted after 2 years (v0.140; the wider rule is **Q1**).
- Every status change, note, check-in, booking change and delete is logged (`change_log`, with who and when).

### 0b. Privacy (handoff §6, rulebook §5)
- Records are about minors. The **list** shows only the child's first name (+ the parent's last initial when two children share a first name), the parent's name, the free class, the follow-up date and the status — never the phone, email, age, answers or waiver.
- The **panel** shows contact details and answers to signed-in, unlocked staff (`has_data_access()`), like every other screen.
- The list comes from **one security-definer function** that returns only the list columns — the screen never reads `form_submissions` directly for the list. **Search by phone** matches digits only, needs at least 4 digits, and never returns the number.
- Whether staff (not only admins) see the answers and the waiver picture in the panel is **Q6**.
- Deleting after 2 years removes the prospect, its notes and timeline; the **sign-up** (answers, bookings, signature views) goes when the family's **last** child is removed, so siblings never lose their data (see **Q1**). Their **copies in the history** (`change_log`) are removed too — see 2c.

### 0c. "Did … come?"
No scheduler. The question is worked out when the list loads: a free class that is still **booked**, whose class **still ran** (not cancelled by a closure or the Schedule), whose end time has passed (Massachusetts time), with no check-in → the prospect shows in **Follow up today** with the question, in the list and in the Calendar's day panel. Check in is refused for a cancelled class.

## 1. Order, dependencies, numbers

- **Migration number: `0010`** (checked 2026-10-18 on main, color-belt, color-belt-phase3, star-testing: main has 0001–0005; 0006 is reserved for Star testing; 0007–0009 are this branch).
- **0010 needs** 0001–0004 and 0007–0009 (prospects are made from Forms sign-ups and bookings).
- **Rulebook numbers:** main uses up to v0.157 and the Star branch up to v0.171; this branch's next is **v0.173**.
- **0009 is not changed.** Prospects are made by a trigger in 0010 (2a), so re-running 0009 never undoes 0010.
- **One shared-file change:** 0003's `change_log` refuses every UPDATE and DELETE today. The 2-year clean-up needs a narrow exception there (2c). 0003 belongs to Color Belt phase 1 and is fingerprinted, so this change is listed as a shared-file change, gets its own security review, and is agreed with the Color Belt session before it's written.
- **Going live:** 0007 → 0008 → 0009 → 0010, then the public page (Forms F3) — **Forms and Prospects go live together** (v0.145 answer 1).

## 2. Database — migration `0010_prospects.sql`

| Table | Holds |
|---|---|
| `prospect_statuses` | name (1–40), kind `stage` / `exit`, position, color (the 8 class colors — never red), `builtin` key (`new`, `booked`, `came`, `joined`, `no_show`, `not_interested`, or null). Seeded once with the 7 starting statuses. Shared or per school: **Q7**. |
| `prospects` | one per child: school, sign-up id + child number (unique), child first name and age (copied from the sign-up), status, follow-up date, joined date, `first_opened_at` / by (badge), last activity time, version. |
| `prospect_notes` | note text (1–1000), follow-up chosen, who and when. Never changed. |
| `prospect_activity` | the panel timeline: status changes, check-ins, booking changes — kind, from/to, who, when. No personal details beyond the prospect id. |

### 2a. How a prospect is made
- **Automatically** (already implied by v0.140: "a sign-up without a booking starts New"): an **AFTER INSERT trigger on `form_submissions`** makes one prospect per child (New); a trigger on `class_bookings` sets Booked when a child's free class is booked and back to New when it is cancelled (only from New / Booked — never over a status staff chose). Public Send, kiosk and staff Fill in all work this way, without changing 0009.
- **Backfill:** 0010 makes prospects for sign-ups saved before it ran (0009 may be live first).

### 2b. Free-class bookings from the panel (if Q2 = yes)
- 0009 allows **one booking row per child** (`unique (submission_id, child_index)`). Change time and Book again **update that row in place**: lock the old and the new class time in a fixed order, re-count the shared spot limit (0009 `forms_times`), then update; "Cancel booking" sets it to cancelled (spot freed). No second row, no change to 0009's rule.
- Check-ins are stored on the **prospect** (`checked_in_at`, by) with the booking they were for. `forms_bookings_between` (Calendar) gets a companion `prospects_bookings_between` that also returns the prospect id, status and checked-in state. Undo puts the previous status back only if nothing changed since (version check).

### 2c. Deleting (2 years, or an admin)
- `prospect_notes` and `prospect_activity` cascade from the prospect. When the family's last prospect goes, the sign-up goes too (bookings and signature views already cascade from it).
- **History copies:** a narrow exception in 0003's `change_log_refuse_change()`: deleting is allowed only while a transaction-local setting is on that **only** `prospects_purge_old()` / `prospects_delete()` set, and only for rows whose record is one of the rows being removed. The clean-up's own log row stores counts, never names.

### 2d. Functions
- **Functions** (security definer, `search_path = ''`, gate order access → (admin) → input → lock → version → write, `{status}` answers, every write logged):
  `prospects_list(school, filter)` (list columns only), `prospects_set_status`, `prospects_add_note`, `prospects_set_follow_up`, `prospects_check_in` / `prospects_undo_check_in`, `prospects_answer_came` (Came / No-show), `prospects_mark_opened`, `prospects_book_time` / `prospects_cancel_time` (Q3; same shared spot limits and locks as 0009), `prospects_search(school, text)`, `prospect_statuses_add` / `_update` / `_reorder` / `_delete(move_to)`, `prospects_delete` (admins only), `prospects_purge_old()` (2-year rule; runs inside functions that are already called, like the 90-day signature clean-up — no scheduler).
- **Locking:** status edits use the version number; deleting a status locks the status rows in a fixed order and moves its people and deletes in one transaction; a status change racing with it answers "stale". Reordering statuses sends the order it saw (like Calendar event types).
- **Grants:** RLS `has_data_access()` on every table; column grants for the panel; nothing to `anon`; the list only through `prospects_list`.
- **Tests:** `supabase/tests/0010_tests.sql` + fingerprints, run by the PGlite runner before and after seed, re-run and upgrade path. A separate **security review** before it's called done.

## 3. Screens

- `src/screens/Prospects.jsx` + `src/screens/prospects/` (PipelineBar, ProspectList, ProspectPanel, NotesLog, StatusMenu, FollowUpPicker, CheckIn, AddProspectDialog, StatusesDialog, DeleteDialog, text.js), `src/styles/prospects.css`.
- `src/lib/prospects/` (rules, api, useProspects, checks.mjs) and `src/lib/mockProspects.js` (fake 0010, same answers), plugged into `mockClient.js`; the fake Forms Send also makes prospects.
- Shared files touched: `App.jsx`, `navItems.js` (six sections + phone More), `mockClient.js`, Calendar day panel (Check in).
- Reused: Fill in (Forms), RowMenu, Dialog, drag grips (Testing), toasts with Undo.

## 4. Steps and checkpoints

| Step | What | Done when |
|---|---|---|
| P0 | This plan + questions Q1–Q5, mockup rev 3 additions | Jeffrey approves; answers in the rulebook |
| P1 | Merge main into this branch (with Forms F1) | The Main session merges when Jeffrey asks |
| P2 | Migration 0010 + tests + security review | PGlite passes; review findings fixed |
| P3 | Screens + preview database + design review | Builds pass; review at 1280 / 820 touch / 390 touch / 320 |
| P4 | Jeffrey tries the preview | His OK; differences decided one at a time |
| P5 | Live setup: 0007–0010 pasted by Jeffrey, checks, then Forms F3 | Each with Jeffrey's OK |
| P6 | Go live: Forms + Prospects together | Separate OK; push only when Jeffrey says |

## 5. Questions for Jeffrey (one at a time)

- **Q1.** The 2-year clean-up: only "Not interested" (as decided), or **every family that isn't Joined, 2 years after the family's last activity** (a note, a status change, a booking or check-in — not just opening the panel)? Recommended: the second; Joined is kept with no end date. Either way a family's sign-up goes only with its last child.
- **Q2.** Can staff **book, change or cancel the free-class time** from the prospect panel (same open times and spot limits as the form)? Recommended: yes.
- **Q3.** The rail badge "new sign-ups nobody has opened": **shared** — the first staff member who opens one clears it for everyone (recommended) — or counted per person?
- **Q4.** The same family signs up twice (e.g. Instagram, then a walk-in): **show "Same phone as …" with a link** to the other prospect (recommended), or show nothing?
- **Q5.** Who may **delete** a custom status: admins and staff (like adding and renaming), or admins only (recommended — people get moved)?
- **Q6.** In the panel, may **staff** see the form answers and the waiver picture, or only admins? Recommended: staff see both (they work the front desk); every look at a signature is recorded.
- **Q7.** Are statuses **shared by both schools** (recommended — one list to keep tidy) or kept per school?

## 6. Progress log
- 2026-10-18 — Plan drafted (P0). Reviewed by a separate agent: 4 High (history can't be deleted without a 0003 exception; per-child prospects vs per-family sign-ups; the one-booking-per-child rule; changing 0009) and 6 Medium findings — all written into sections 0–2; questions now Q1–Q7.
- 2026-10-18 — **Jeffrey approved the plan and mockup revision 3 (screen 10).** Next: questions Q1–Q7, one at a time.
