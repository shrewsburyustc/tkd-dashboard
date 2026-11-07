// make-specs-stepA.mjs — writes the compose.mjs specs (A1, A2, A3, A3b .json) for Star's rolling-check
// Step A review pictures (R4-10 menu icons, R4-08 grayed Email result, R2-08 Undo toasts, A3b = the make-up Undo choice after the design review), from the raw
// preview screenshots in shots/ (crops and outline boxes in screen pixels, measured with mock-stepA.js
// 'rects'). Then:  node "../../../Design Review/tools/compose.mjs" A1-menu-icons.json  (etc.)
// Why a script: three pictures × four sizes is many numbers; keeping them here makes a re-shoot a
// one-line rerun. Same method as ../End time mockups/make-specs.mjs.
import { writeFileSync } from 'node:fs';

const s = (name) => `shots/${name}.png`;
const it = (src, crop, scale, caption, marks = [], shotWidth = 1280) => ({ src: s(src), crop, scale, caption, marks, shotWidth });
const row = (...items) => ({ row: items });
const write = (file, spec) => writeFileSync(new URL(file, import.meta.url), JSON.stringify({ width: 1920, ...spec }, null, 1));
const FOOT = 'Star testing · rolling check pass 1, Step A (plan OK’d 2026-11-06). Preview screenshots (fake database, admin, Fall Star Testing). The “After” column is drawn over the real page by a small script (mock-stepA.js) — nothing in the app was changed. Amber = what changes; green = the change.';

// ---------- A1 · R4-10 ⋯ menu icons ----------
const PC_M = [700, 370, 570, 380];
const TAB_M = [440, 560, 370, 490];
const PH_M = [0, 280, 390, 564];
const P320_M = [0, 140, 320, 560];
write('A1-menu-icons.json', {
  title: 'Star · R4-10 — ⋯ menu icons for the private-testing items',
  subtitle: 'A candidate with a private testing (Alex Kim). “Change private day or time” gets the calendar icon (ti-calendar, as Color Belt’s “Change day or time” and Star’s own “Set private testing”); “Back to the testing day” gets the calendar-with-a-day icon (ti-calendar-event), so the Undo arrow means only Undo and Restore again (v1.048 (13)). Words, order and everything else in the menu stay the same.',
  columns: [
    { label: 'Today', tone: 'today', items: [
      it('A1-today-pc', PC_M, 1.3, '<b>PC 1280×800, Alex Kim’s ⋯.</b> Change private day or time uses Edit’s pencil; Back to the testing day uses Undo’s arrow (same as Undo payment below it).', [[990, 457, 256, 64]]),
      row(it('A1-today-tab', TAB_M, 0.85, '<b>Tablet 820×1180, touch.</b>', [[530, 662, 256, 88]], 820),
          it('A1-today-ph', PH_M, 0.75, '<b>Phone 390×844, touch</b> (bottom sheet).', [[0, 405, 390, 88]], 390),
          it('A1-today-p320', P320_M, 0.75, '<b>320 wide, touch.</b>', [[0, 261, 320, 88]], 320)),
    ] },
    { label: 'After', tone: 'after', items: [
      it('A1-after-pc', PC_M, 1.3, '<b>PC 1280×800.</b> ti-calendar on Change private day or time; ti-calendar-event on Back to the testing day.', [[990, 457, 256, 64]]),
      row(it('A1-after-tab', TAB_M, 0.85, '<b>Tablet 820×1180, touch.</b>', [[530, 662, 256, 88]], 820),
          it('A1-after-ph', PH_M, 0.75, '<b>Phone 390×844, touch.</b>', [[0, 405, 390, 88]], 390),
          it('A1-after-p320', P320_M, 0.75, '<b>320 wide, touch.</b>', [[0, 261, 320, 88]], 320)),
    ], note: 'Both icons exist in @tabler/icons-react (IconCalendar, IconCalendarEvent). A candidate without a private testing keeps “Set private testing” with ti-calendar, as today. The menu looks the same at every size; only the row height changes on touch.' },
  ],
  footer: FOOT,
});


// ---------- A2 · R4-08 grayed Email result ----------
const LINE_SAME = 'The “Email result is off …” line itself doesn’t change; it is outlined because the button now points at it.';
write('A2-email-grayed.json', {
  title: 'Star · R4-08 — the grayed Email result (Hide private details on)',
  subtitle: 'Results tab with the account menu’s Hide private details switch on. The grayed Email result takes the approved “unavailable” look (v1.103, as Prospects’ grayed Email): a stronger border (--color-border-strong, rgb 207 207 202, was the hairline --color-border, rgb 229 229 226) and the not-allowed mouse pointer (a circle with a line through it) instead of the plain arrow. It stays focusable, and screen readers now hear the line above the list after the button’s name (aria-describedby points the button at that line). ' + LINE_SAME,
  columns: [
    { label: 'Today', tone: 'today', items: [
      it('A2-today-pc', [60, 300, 1210, 230], 0.72, '<b>PC 1280×800.</b> Hairline border; the pointer is a plain arrow; a screen reader hears only “Email result for Noah Chen, dimmed” — the line (outlined) isn’t linked to the button.', [[1099, 481, 116, 28], [100, 311, 432, 20]]),
      row(it('A2-today-pc', [1090, 474, 134, 42], 2.6, '<b>PC, zoomed 2.6×</b> (no outline, so the border shows). Border rgb(229, 229, 226).'),
          it('A2-today-tab', [86, 330, 720, 240], 0.6, '<b>Tablet 820×1180, touch.</b>', [[623, 504, 116, 36], [120, 339, 432, 20]], 820)),
      row(it('A2-today-ph', [0, 190, 390, 250], 1, '<b>Phone 390×844, touch.</b>', [[29, 384, 116, 36], [16, 202, 358, 39]], 390),
          it('A2-today-p320', [0, 190, 320, 250], 1, '<b>320 wide, touch.</b>', [[29, 383, 116, 36], [16, 202, 288, 39]], 320)),
    ] },
    { label: 'After', tone: 'after', items: [
      it('A2-after-pc', [60, 300, 1210, 230], 0.72, '<b>PC 1280×800.</b> Stronger gray border, not-allowed pointer on hover; the button is now described by the line “Email result is off while private details are hidden. Email results at the desk.” (the line looks the same as today).', [[1099, 481, 116, 28], [100, 311, 432, 20]]),
      row(it('A2-after-pc', [1090, 474, 134, 42], 2.6, '<b>PC, zoomed 2.6×.</b> Border rgb(207, 207, 202): a clearer edge.'),
          it('A2-after-tab', [86, 330, 720, 240], 0.6, '<b>Tablet 820×1180, touch.</b> (No pointer on touch; the border and the description still apply.)', [[623, 504, 116, 36], [120, 339, 432, 20]], 820)),
      row(it('A2-after-ph', [0, 190, 390, 250], 1, '<b>Phone 390×844, touch.</b>', [[29, 384, 116, 36], [16, 202, 358, 39]], 390),
          it('A2-after-p320', [0, 190, 320, 250], 1, '<b>320 wide, touch.</b>', [[29, 383, 116, 36], [16, 202, 288, 39]], 320)),
    ], note: 'A screenshot can’t show the mouse pointer or what a screen reader says; both were checked on the drawn page: cursor “not-allowed”, aria-describedby → the line. <b>In the build, aria-describedby points at the line only while private details are hidden</b> — not while the button is only busy (reading the family’s address), because the line isn’t on the page then. With the switch off, Email result looks and works as today. Black Belt copies this in its own Part 2.' },
  ],
  footer: FOOT,
});

// ---------- A3 · R2-08 Undo on "Private testing set" ----------
const WORDS = 'Both toast texts (“Private testing set”, “Drew Park added”) are still marked PROPOSAL in the code: these pictures are the first time they are shown for approval, and an OK here removes the PROPOSAL tags.';
write('A3-undo-toasts.json', {
  title: 'Star · R2-08 (1 of 2) — 5-second Undo on “Private testing set”',
  subtitle: 'The toast gets the same Undo button as Star’s other Undo toasts (e.g. “Alex Kim moved back to the testing day · fee $140 · Undo”, bottom of the Today column): text · thin divider · ↶ Undo. Undo puts the old private day and time back, or clears a newly set one, then the toast says “Undone”. The Set / Change private testing dialog has already closed when the toast shows, so Undo can be reached by mouse and keyboard like any other toast. The make-up toast is a separate choice: picture A3b. ' + WORDS,
  columns: [
    { label: 'Today', tone: 'today', items: [
      it('A3p-today-pc', [76, 380, 1194, 410], 0.72, '<b>PC 1280×800.</b> Alex Kim set to Sat, Nov 14, 4:00 PM. No Undo.', [[1130, 741, 126, 35]]),
      row(it('A3p-today-tab', [300, 860, 510, 310], 0.68, '<b>Tablet 820×1180, touch.</b>', [[670, 1121, 126, 36]], 820),
          it('A3p-today-ph', [0, 370, 390, 474], 0.7, '<b>Phone 390×844, touch.</b>', [[132, 741, 126, 36]], 390),
          it('A3p-today-p320', [0, 300, 320, 400], 0.7, '<b>320 wide, touch.</b>', [[97, 597, 126, 36]], 320)),
      row(it('A3-model-pc', [560, 580, 710, 210], 0.7, '<b>For comparison, PC:</b> Star’s existing Undo toast after Back to the testing day — the After copies this button exactly (the app’s own markup).', []),
          it('A3-model-ph', [0, 560, 390, 284], 0.85, '<b>For comparison, phone.</b>', [], 390)),
    ] },
    { label: 'After', tone: 'after', items: [
      it('A3p-after-pc', [76, 380, 1194, 410], 0.72, '<b>PC 1280×800.</b> “Private testing set · ↶ Undo”: Undo puts Alex back on the testing day (he had no private testing before).', [[1061, 736, 195, 40]]),
      row(it('A3p-after-tab', [300, 860, 510, 310], 0.68, '<b>Tablet, touch.</b> 44-px tall, as other touch toasts.', [[601, 1112, 195, 44]], 820),
          it('A3p-after-ph', [0, 370, 390, 474], 0.7, '<b>Phone, touch.</b> Centered above the bottom bar.', [[97, 732, 195, 44]], 390),
          it('A3p-after-p320', [0, 300, 320, 400], 0.7, '<b>320 wide, touch.</b> Fits on one line.', [[62, 588, 195, 44]], 320)),
    ], note: 'Undo works for 5 seconds; hovering or focusing the toast pauses the time, as on every toast. Build check: on the tablet the wider toast covers more of the bottom row; when the edited candidate is the bottom row, its ⋯ (where focus returns) must not sit under the toast.' },
  ],
  footer: FOOT,
});

// ---------- A3b · R2-08 make-up "… added": a choice ----------
const MK_PC = [400, 60, 870, 740];
const PG_PC = [60, 90, 1210, 710];
write('A3b-makeup-options.json', {
  width: 1960,
  title: 'Star · R2-08 (2 of 2) — Undo after adding a make-up: which way? (choice for Jeffrey)',
  subtitle: 'Today Star’s Add a make-up list stays open after Add, and the “Drew Park added” toast shows outside it. A dialog keeps the keyboard (Tab) inside itself, so a toast Undo there could be reached by mouse only — not by keyboard until the list is closed, and by then the 5 seconds are usually over. Three ways out. Undo (admins only; staff can’t delete a candidate, v0.110, so staff get no Undo in any option) deletes the new make-up row, as Add candidate’s Undo does, then says “Undone”. ' + WORDS + ' Possible wording, Black Belt’s form: “Drew Park added · make-up from Summer” (“… added · make-up from &lt;earlier testing&gt;”), so it doesn’t read like Add candidate’s toast.',
  columns: [
    { label: 'Today', tone: 'today', items: [
      it('A3m-today-pc', MK_PC, 0.48, '<b>PC 1280×800.</b> Add on Drew Park: the list stays open (“Already added”), toast “Drew Park added”, no Undo.', [[1134, 741, 122, 36]]),
      it('A3m-today-ph', [0, 0, 390, 844], 0.62, '<b>Phone 390×844, touch</b> (full-screen list).', [[134, 741, 122, 36]], 390),
    ] },
    { label: '(a) Recommended — close the list after Add', tone: 'after', items: [
      it('A3b-a-pc', PG_PC, 0.345, '<b>PC.</b> The list closes (as Black Belt’s does), focus goes back to Add candidate, and “Drew Park added · ↶ Undo” shows over the event page, where Drew’s row is now first. <b>After Undo,</b> focus goes back to Add candidate.', [[1065, 736, 191, 40], [77, 499, 1178, 48]]),
      it('A3b-a-ph', [0, 0, 390, 844], 0.62, '<b>Phone.</b> Same: list closed, toast above the bottom bar.', [[99, 732, 191, 44], [17, 683, 356, 92]], 390),
    ], note: '<b>Pros:</b> Undo works by keyboard like every other toast; copies Black Belt (useMakeupPicker), so both sections behave the same. <b>Cons:</b> adding a second make-up means opening Add candidate → Make-up again.' },
    { label: '(b) Keep the list open, Undo in the row', tone: 'after', items: [
      it('A3b-b-pc', MK_PC, 0.48, '<b>PC.</b> Drew’s row says “Added” with an Undo button where “Already added” was; the toast stays “Drew Park added” without Undo. <b>After Undo,</b> focus stays on Drew’s row, whose button turns back into “Add”.', [[698, 236, 125, 28]]),
      it('A3b-b-ph', [0, 0, 390, 844], 0.62, '<b>Phone.</b>', [[236, 142, 125, 36]], 390),
    ], note: '<b>Pros:</b> several make-ups in a row without reopening; Undo is inside the dialog, so the keyboard reaches it, with no 5-second timer. <b>Cons:</b> a new look no other section has (Undo as a row button); how long the row Undo stays offered (until the list closes?) needs deciding.' },
    { label: '(c) Keep it as it is today', tone: 'today', items: [
      it('A3m-after-pc', MK_PC, 0.48, '<b>PC.</b> “Drew Park added · ↶ Undo” over the open list (as first drawn).', [[1065, 736, 191, 40]]),
      it('A3m-after-ph', [0, 0, 390, 844], 0.62, '<b>Phone.</b>', [[99, 732, 191, 44]], 390),
    ], note: '<b>Pros:</b> smallest change; the list stays open. <b>Cons: breaks the rulebook’s keyboard-only rule</b> (§4 “Everything works with keyboard only”, WCAG 2.1.1): while the list is open, Undo can be clicked with a mouse but not reached with Tab.' },
  ],
  footer: FOOT + ' Tablet and 320 look like PC and phone here, so they aren’t repeated (A3 shows the toast at all four sizes).',
});
console.log('specs written');
