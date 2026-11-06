// make-specs.mjs — writes the four compose.mjs specs (01–04 .json) for the Star End time review
// pictures, from the raw preview screenshots in shots/ (crops and outline boxes in screenshot pixels,
// measured with `node cdp.mjs rects …`). Then:  node "../../../Design Review/tools/compose.mjs" 01-family-form.json  (etc.)
// Why a script: four pictures × up to four sizes is many numbers; keeping them here makes a re-shoot
// a one-line rerun.
import { writeFileSync } from 'node:fs';

const s = (name) => `shots/${name}.png`;
const it = (src, crop, scale, caption, marks = [], shotWidth = 1280) => ({ src: s(src), crop, scale, caption, marks, shotWidth });
const row = (...items) => ({ row: items });
const write = (file, spec) => writeFileSync(new URL(file, import.meta.url), JSON.stringify(spec, null, 1));
const FOOT = 'Rulebook decision “A” (approved): Star testing events get an End time as well as a Start time, so parents know when to pick up. Preview screenshots (fake database; the fake Fall Star Testing’s start was set to 6:00 PM in preview for these pictures, its date stays Tue, Dec 1, 2026). The “After” column is drawn over the real page — nothing in the app was changed. An event with no end time saved yet keeps showing only the start time, exactly as “Today”. Private testing times (one time) don’t change.';

// ---------- 01 Family form, first screen ----------
write('01-family-form.json', {
  title: 'Star End time · 1 of 4 — family registration form, first screen',
  subtitle: 'The event box at the top of /star/&lt;code&gt;: the line under the date becomes a range, “6:00 PM – 8:00 PM” (AM/PM on both times, an en dash with spaces). Amber = the line that changes; green = the new line.',
  columns: [
    { label: 'Today', tone: 'today', items: [
      it('01-today-pc', [360, 100, 560, 300], 1.2, '<b>PC 1280×800.</b> Only the start time: “6:00 PM”.', [[392, 209, 92, 24]]),
      row(it('01-today-tab', [130, 100, 560, 300], 0.78, '<b>Tablet 820×1180, touch.</b>', [[162, 209, 92, 24]], 820),
          it('01-today-ph', [0, 100, 390, 320], 0.95, '<b>Phone 390×844, touch.</b>', [[32, 219, 92, 24]], 390)),
      it('01-today-p320', [0, 100, 320, 320], 1.1, '<b>320 wide, touch.</b>', [[32, 224, 92, 24]], 320),
    ] },
    { label: 'After', tone: 'after', items: [
      it('01-after-pc', [360, 100, 560, 300], 1.2, '<b>PC 1280×800.</b> “6:00 PM – 8:00 PM”: families see when to pick up.', [[392, 209, 182, 24]]),
      row(it('01-after-tab', [130, 100, 560, 300], 0.78, '<b>Tablet 820×1180, touch.</b>', [[162, 209, 182, 24]], 820),
          it('01-after-ph', [0, 100, 390, 320], 0.95, '<b>Phone 390×844, touch.</b>', [[32, 219, 182, 24]], 390)),
      it('01-after-p320', [0, 100, 320, 320], 1.1, '<b>320 wide, touch.</b> The range still fits on one line.', [[32, 224, 182, 24]], 320),
    ], note: 'Nothing else in the box moves. With no end time saved, the line stays “6:00 PM”.' },
  ],
  footer: FOOT,
});

// ---------- 02 Check step + Registered page ----------
const chk = (sfx, tag, crop, scale, w, eventRow, regRow, capC, capR) => row(
  it(`02c-${sfx}-${tag}`, crop.c, scale, capC, [eventRow], w),
  it(`02r-${sfx}-${tag}`, crop.r, scale, capR, [regRow], w),
);
const PC = { c: [376, 120, 528, 390], r: [376, 125, 528, 420] };
const TAB = { c: [146, 120, 528, 390], r: [146, 125, 528, 420] };
const PH = { c: [0, 130, 390, 420], r: [0, 130, 390, 420] };
const P320 = { c: [0, 130, 320, 440], r: [0, 130, 320, 440] };
write('02-check-and-registered.json', {
  title: 'Star End time · 2 of 4 — family form: Check step and “You’re registered”',
  subtitle: 'Step 2 (“Check and send”, row Event) and the page after sending (“What happens next”, row Testing) show the same range. Left of each pair: Check step; right: registered page. Amber = the row that changes; green = the new row.',
  columns: [
    { label: 'Today', tone: 'today', items: [
      chk('today', 'pc', PC, 0.8, 1280, [512, 204, 378, 27], [512, 355, 378, 27], '<b>PC 1280×800 · Check.</b> “Fall Star Testing · Tue, Dec 1 · 6:00 PM”', '<b>PC · Registered.</b> “Tuesday, December 1 · 6:00 PM”'),
      chk('today', 'tab', TAB, 0.8, 820, [282, 204, 378, 27], [282, 355, 378, 27], '<b>Tablet 820×1180, touch · Check.</b>', '<b>Tablet · Registered.</b>'),
      chk('today', 'ph', PH, 0.8, 390, [138, 214, 222, 48], [138, 365, 222, 27], '<b>Phone 390×844, touch · Check.</b>', '<b>Phone · Registered.</b>'),
      chk('today', 'p320', P320, 0.9, 320, [138, 219, 152, 48], [138, 433, 152, 48], '<b>320 wide, touch · Check.</b>', '<b>320 · Registered.</b>'),
    ] },
    { label: 'After', tone: 'after', items: [
      chk('after', 'pc', PC, 0.8, 1280, [512, 204, 378, 27], [512, 355, 378, 27], '<b>PC · Check.</b> “Fall Star Testing · Tue, Dec 1 · 6:00 PM – 8:00 PM”', '<b>PC · Registered.</b> “Tuesday, December 1 · 6:00 PM – 8:00 PM”'),
      chk('after', 'tab', TAB, 0.8, 820, [282, 204, 378, 27], [282, 355, 378, 27], '<b>Tablet · Check.</b>', '<b>Tablet · Registered.</b>'),
      chk('after', 'ph', PH, 0.8, 390, [138, 214, 222, 48], [138, 365, 222, 48], '<b>Phone · Check.</b> Wraps to 2 lines; each time stays whole.', '<b>Phone · Registered.</b> The range moves to its own line.'),
      chk('after', 'p320', P320, 0.9, 320, [138, 219, 152, 69], [138, 433, 152, 48], '<b>320 · Check.</b> 3 lines (was 2).', '<b>320 · Registered.</b>'),
    ], note: 'On narrow phones the line wraps. The build should keep each time in one piece (no-break spaces: “6:00&nbsp;PM”, “8:00&nbsp;PM”) so it never splits as “6:00 / PM” — these pictures already do that. Today’s phone Check row already splits “6:00 / PM” (left column); with a plain space the range would also split “8:00 / PM” at 320.' },
  ],
  footer: FOOT,
});

// ---------- 03 Add / Edit event dialog ----------
const D_PC = [420, 80, 440, 720];
const D_TAB = [190, 96, 440, 962];
const D_PH = [0, 0, 390, 844];
write('03-event-dialog.json', {
  title: 'Star End time · 3 of 4 — Add event / Edit event dialog',
  subtitle: 'A new required field “End time”, right after Start time, using the same shared time list (“Choose a time” while empty). It offers the times after the chosen start, every 5 minutes, up to 10:00 PM. Layout: Testing date moves to its own full-width row, and “Start time | End time” sit side by side on PC and tablet (stacked on phones, as today). Shown: the existing Fall Star Testing opened in Edit, End time not saved yet.',
  columns: [
    { label: 'Today', tone: 'today', items: [
      it('03-today-pc', D_PC, 0.95, '<b>PC 1280×800.</b> “Testing date | Start time” share one row; there is no end time.', [[444, 253, 392, 54]]),
      row(it('03-today-tab', D_TAB, 0.62, '<b>Tablet 820×1180, touch.</b>', [[214, 273, 392, 58]], 820),
          it('03-today-ph', D_PH, 0.62, '<b>Phone 390×844, touch</b> (full-screen page).', [[16, 185, 358, 128]], 390)),
    ] },
    { label: 'After', tone: 'after', items: [
      row(it('03-after-pc', D_PC, 0.62, '<b>PC 1280×800.</b> Testing date on its own row; Start time | End time below it. End time empty: “Choose a time”.', [[444, 253, 392, 54], [646, 319, 190, 54]]),
          it('03-list-pc', D_PC, 0.62, '<b>PC · End time list open.</b> Starts at 6:05 PM (the first time after the 6:00 PM start) and runs to 10:00 PM.', [[646, 319, 190, 302]])),
      row(it('03-err1-pc', [430, 300, 420, 140], 0.98, '<b>Save with End time empty:</b> “Choose an end time.” (same amber line as “Choose a start time.”)', [[646, 319, 190, 92]])),
      row(it('03-err2-pc', [430, 300, 420, 140], 0.98, '<b>End time not after the start</b> (e.g. a start moved past a saved end): “End time must be after the start time.”', [[646, 319, 190, 110]])),
      row(it('03-after-tab', D_TAB, 0.62, '<b>Tablet 820×1180, touch.</b> Same layout as PC.', [[214, 273, 392, 58], [416, 343, 190, 58]], 820),
          it('03-after-ph', D_PH, 0.62, '<b>Phone 390×844, touch.</b> One field per row: Testing date, Start time, End time.', [[16, 325, 358, 58]], 390)),
      row(it('03-err1-ph', [0, 240, 390, 200], 0.68, '<b>Phone:</b> “Choose an end time.”', [[16, 325, 358, 96]], 390),
          it('03-err2-ph', [0, 240, 390, 200], 0.68, '<b>Phone:</b> “End time must be after the start time.”', [[16, 325, 358, 96]], 390)),
    ], note: 'What moved: only Testing date — from the left half of the Start time row to a full-width row of its own (it was already full width on phones). Where, Registration and the rest stay where they are. Save stays gray until End time is chosen, like Start time.' },
  ],
  footer: FOOT,
});

// ---------- 04 Staff places ----------
write('04-staff-lines.json', {
  title: 'Star End time · 4 of 4 — where staff see the testing time',
  subtitle: 'Event page summary line (under the event name), Home’s “Today” card on the testing day, and the printed flyer. Amber = the time today; green = the range.',
  columns: [
    { label: 'Today', tone: 'today', items: [
      it('04e-today-pc', [52, 95, 760, 85], 1.1, '<b>Event page, PC 1280×800.</b> “Tue, Dec 1, 2026 · 6:00 PM at Shrewsbury school · both schools · 21 candidates”', [[185, 149, 56, 25]]),
      it('04e-today-ph', [0, 100, 390, 120], 1, '<b>Event page, phone 390×844, touch.</b>', [[125, 159, 56, 25]], 390),
      it('04h-today-pc', [52, 215, 760, 115], 1, '<b>Home “Today” card, PC</b> (preview day set to Dec 1). Title “Fall Star Testing · 6:00 PM”.', [[250, 260, 62, 22]]),
      it('04h-today-ph', [0, 265, 390, 180], 1, '<b>Home “Today” card, phone.</b>', [[189, 311, 62, 22]], 390),
      it('04f-today-pc', [300, 20, 680, 790], 0.62, '<b>Printed flyer</b> (paper, one size; shown at its printed width). “Tuesday, December 1, 2026 · 6:00 PM”.', [[728, 322, 90, 36]]),
    ] },
    { label: 'After', tone: 'after', items: [
      it('04e-after-pc', [52, 95, 760, 85], 1.1, '<b>Event page, PC.</b> “Tue, Dec 1, 2026 · 6:00 PM – 8:00 PM at Shrewsbury school · both schools · 21 candidates”', [[185, 149, 121, 25]]),
      it('04e-after-ph', [0, 100, 390, 120], 1, '<b>Event page, phone.</b> Still two lines; the range stays on the first.', [[125, 159, 121, 25]], 390),
      it('04h-after-pc', [52, 215, 760, 115], 1, '<b>Home “Today” card, PC.</b> “Fall Star Testing · 6:00 PM – 8:00 PM”.', [[250, 260, 124, 22]]),
      it('04h-after-ph', [0, 265, 390, 180], 1, '<b>Home “Today” card, phone.</b> Still one line.', [[189, 311, 124, 22]], 390),
      it('04f-after-pc', [300, 20, 680, 790], 0.62, '<b>Printed flyer.</b> “Tuesday, December 1, 2026 · 6:00 PM – 8:00 PM”.', [[684, 322, 184, 36]]),
    ], note: 'The Events list rows show only the date (no time), so they don’t change. Private testing lines (“Private star testing · 4:30 PM”) keep one time.' },
  ],
  footer: FOOT,
});
console.log('specs written');
