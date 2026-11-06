# New students — rolling check pass 2: plan

Source: `docs/Design Review/Rolling check/Pass 2/Fix-NewStudents.md` (relayed by Main 2026-11-05). Branch `claude/prospect-form-system-cd893d`, main 1751e82 merged in (fast-forward). Each item keeps its finding id. **Nothing is built before Jeffrey OKs it. No push.** No database change: every item is screen-only.

Each step goes as in pass 1: pictures (PC 1280, tablet 820 touch, phone 390 touch, 320 wide; amber = what changes) → Jeffrey's OK → build in preview mode → design review + code review → Jeffrey tries it → commit → report to Main.

Jeffrey's pass 2 answers that touch this branch are v1.055 (d) M-05 and (h) P-05, both approved as written. The design review already added the "(See v1.055 …)" notes, so we need no rulebook row of our own.

## Order (Jeffrey 2026-11-06: "Focus fix first", then "Yes, Mediums next")
1. ~~Pass 1 step 1b, focus when a dialog changes step~~: **done**, 8f4a04b.
2. **Step A: the three Mediums** (U-01 with U-08, P-01, P-02). This step.
3. Calendar: every section's events (`STATUS-Calendar.md`).
4. Pass 1 step 2 (R2-01 Retry), now with **X-1** and **U-04**.
5. **Step B: small fixes.** M-05, P-05, P-03, U-02 + U-07, U-03, U-05, L-09.
6. Pass 1 steps 3, 4, 5 (step 5 gains **L-10**), 6, 7.
7. After Dashboard core: L-06, U-06, L-03.

## Step A: the three Mediums

### U-01 (Medium) + U-08: Delete prospect, Came, Joined and Book a free class stay open when the save fails
- **Today:** `confirmDelete`, `saveCame`, `saveJoined` and `saveBook` (`Prospects.jsx`) close the box before they look at the answer. A failure becomes the window's bar, the picked date or time is lost, and Came's check-in path closes before "Saving…" can show.
- **Change:** the box stays open until the answer comes back.
  - **ok:** it closes, as today.
  - **A connection failure:** it stays open with its amber note, and pressing the button again tries again. Joined keeps its date, Book its time.
    - Confirm boxes (Delete prospect, Came) show the note under their buttons (N3).
    - Joined and Book show it where Book's "time taken" note already shows.
  - **No access, someone else changed it, or it's gone:** it closes, and the page's bar says so, as today.
  - **Came's check-in path** runs inside the box like its status path, so "Saving…" shows.
- **Words (U-08):**
  - Delete prospect, Delete status and Calendar's Delete type: "Couldn't delete. Check the connection, then try again."
  - Came, Joined and Book: "Couldn't save. Check the connection, then try again."
- **Picture:** `RollingCheck-P2-U01-boxes.png`.
- **Files:** `Prospects.jsx`, `prospects/text.js`, `calendar/text.js`, maybe `prospects/Dialogs.jsx`.

### P-02 (Medium): the profile window says when it couldn't load
- **Today:** a failed read leaves the window on "Loading…" for good. The same happens for a brother or sister opened inside it.
- **Change:** the shared amber bar with Retry, as in Black Belt's candidate window: "Couldn't load [first name]'s details. Check the connection, then retry." Retry reads again. This line joins S-2's load lines later.
- **Picture:** `RollingCheck-P2-P02-load.png`.
- **Files:** `Prospects.jsx` (`loadDetail` returns the failure), `prospects/ProspectPanel.jsx`, `prospects/text.js`.

### P-01 (Medium): the printed sheet says when the free class was cancelled
- **Today:** the sheet checks only the booking, so a class a closure cancelled prints as if it will happen.
- **Change:** one small helper in `src/lib/prospects/child.js` gives the free class's state (booked · class cancelled · booking cancelled · none). The profile, the List and the sheet all use it.
- **Words on paper:** "Class cancelled — call the family (Mon, Nov 9, 2026 · 5:00 pm · Group A)".
- **Picture:** `RollingCheck-P2-P01-sheet.png`.
- **Files:** `src/lib/prospects/child.js` (+ its checks), `prospects/PrintSheet.jsx`, `prospects/ProspectPanel.jsx`, `prospects/progress.js`, `prospects/text.js`.

## Step B: small fixes (Low; pictures and words when the step comes)
| Item | Change |
|---|---|
| M-05 | The two desk-only lines name dates of birth (approved, v1.055 (d)) |
| P-05 | A date of birth reads "Apr 19, 2017", with no weekday, on the forms and in the profile (approved, v1.055 (h)) |
| P-03 | Deleted-signature line: "… 90 days after signing." when no class was booked |
| U-02 + U-07 | The builder's refused Undo of Delete field goes in the amber bar, not a toast; after Undo, focus goes to the restored field |
| U-03 | Delete form closes on "someone else changed it" and uses the page's bar; Delete status names the status |
| U-05 | Copy number and Share's Copy say when copying fails (Copy number's words for Jeffrey) |
| L-09 | One date-of-birth hint and one ZIP line in the shared word file (question: the words, and who adds them) |

## Corrections to pass 1 (copied into `TKD-RollingCheck-Pass1-Plan.md` when step 2 comes)
- R2-01: the bar is cleared when another child's window opens (X-1). U-01's four boxes keep their own note.
- S-2 gains P-02's line.
- Pass 1's note on U-02 is now U-02 above.

## Shared files
None expected. L-09's lines and U-05's words would go in `src/components/text.js` only if Jeffrey says so.
