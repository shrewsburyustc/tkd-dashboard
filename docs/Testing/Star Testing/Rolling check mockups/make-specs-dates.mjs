// make-specs-dates.mjs — writes the two compose.mjs specs for the "Date signed" review pictures
// (rulebook v0.638): B1 = the Star family form's Check step, B2 = the staff candidate detail.
// Crops and outline boxes are in screenshot pixels, measured with `node cdp.mjs rects …` on the raw
// shots in shots/ (b-… files; the form shots are full-page, the staff shots are the screen).
// Then:  node "../../../Design Review/tools/compose.mjs" B1-date-signed-form.json  (and B2-…)
// Why a script: two pictures × up to four sizes is many numbers; keeping them here makes a re-shoot
// a one-line rerun.
import { writeFileSync } from 'node:fs';

const s = (name) => `shots/${name}.png`;
const it = (src, crop, scale, caption, marks = [], shotWidth = 1280) => ({ src: s(src), crop, scale, caption, marks, shotWidth });
const row = (...items) => ({ row: items });
const write = (file, spec) => writeFileSync(new URL(file, import.meta.url), JSON.stringify(spec, null, 1));
const FOOT = 'Rulebook v0.638 (Jeffrey, 2026-11-04): every family form shows “Date signed” under the signature, filled in automatically with the day the form is sent, gray, can’t be changed; wherever staff see a signature, its date signed shows with it. Preview screenshots (fake database, today = Fri, Nov 6, 2026). The “After” column is drawn over the real page by a small script (mock-dates.js) — nothing in the app was changed. No database change: the day the form is sent is already saved (star_candidate_signatures.signed_at).';

// ---------- B1 Family form, Check step ----------
const F_PC = [380, 600, 520, 350];
const F_TAB = [150, 600, 520, 350];
const F_PH = [0, 670, 390, 430];
const F_320 = [0, 842, 320, 450];
write('B1-date-signed-form.json', {
  title: 'Date signed · B1 — Star family form, “Check and send” step',
  subtitle: 'Under the signature pad (after its hint line) a new box: label “Date signed”, a gray box that can’t be changed with today’s date (“Fri, Nov 6, 2026”), and the hint “Filled in automatically with today’s date.” — the same box New students’ forms already have. Amber = where the box goes; green = the new box.',
  columns: [
    { label: 'Today', tone: 'today', items: [
      row(it('b-form-today-pc', F_PC, 0.82, '<b>PC 1280×800.</b> The signature ends with its hint line; nothing shows the date.', [[393, 761, 494, 18]]),
          it('b-form-today-tab', F_TAB, 0.82, '<b>Tablet 820×1180, touch.</b>', [[163, 761, 494, 18]], 820)),
      row(it('b-form-today-ph', F_PH, 0.95, '<b>Phone 390×844, touch.</b>', [[33, 834, 324, 36]], 390),
          it('b-form-today-p320', F_320, 0.95, '<b>320 wide, touch.</b>', [[33, 1024, 254, 36]], 320)),
    ] },
    { label: 'After', tone: 'after', items: [
      row(it('b-form-after-pc', F_PC, 0.82, '<b>PC 1280×800.</b> “Date signed · Fri, Nov 6, 2026”, gray box, hint under it.', [[393, 791, 494, 76]]),
          it('b-form-after-tab', F_TAB, 0.82, '<b>Tablet 820×1180, touch.</b> Box 40 px tall, 16 px text (like the form’s other boxes on touch). Label 12 px, the same as “Signature” above it.', [[163, 791, 494, 84]], 820)),
      row(it('b-form-after-ph', F_PH, 0.95, '<b>Phone 390×844, touch.</b> Full width of the card; both labels 12 px.', [[33, 882, 324, 84]], 390),
          it('b-form-after-p320', F_320, 0.95, '<b>320 wide, touch.</b> The date fits on one line.', [[33, 1072, 254, 84]], 320)),
      row(it('b-newstudents-ref-pc', [380, 1128, 520, 104], 1, '<b>Reference — New students’ form today</b> (Walk-in, PC): the box being copied. Same gray box, words and hint; its label is 13 px on PC, the Star form’s labels are 12 px on PC (13 px on touch), so the Star box uses the Star form’s own label size.')),
    ], note: 'Label size on touch: the Signature label is held at 12 px on every size (.reg-field--sign .reg-label), while other Star labels grow to 13 px on touch. The “Date signed” label is drawn at 12 px everywhere so the two labels under each other match; the build does the same (e.g. puts the box inside .reg-field--sign, or gives its label 12 px). The date is the day in Massachusetts time, written like the rest of the forms (“Fri, Nov 6, 2026”). The box is read-only: families can’t type in it. It is not saved from the box — the database already stores the moment the form is sent, and staff see that date (picture B2).' },
  ],
  footer: FOOT,
});

// ---------- B2 Staff: candidate detail — a choice between two layouts ----------
// Shots: b2-<on|rm>-<today|a|b>-<pc|ph|p320>.png (on = Noah Chen, signature on file; rm = Morgan Hale,
// signature removed). Boxes are whole rows (label + value), from staff2's measurements.
const C = {
  on: { pc: [420, 355, 440, 230], ph: [0, 300, 390, 230], p320: [0, 238, 320, 240] },
  rm: { pc: [420, 335, 440, 250], ph: [0, 300, 390, 250], p320: [0, 228, 320, 270] },
};
const W = { pc: 1280, ph: 390, p320: 320 };
const SC = { pc: 1.2, ph: 0.75, p320: 0.75 };
const NAME = { pc: 'PC 1280×800', ph: 'Phone 390×844, touch', p320: '320 wide, touch' };
const sh = (who, v, size, cap, marks) => it(`b2-${who}-${v}-${size}`, C[who][size], SC[size], cap, marks, W[size]);
const MARKS = {
  today: { on: { pc: [444, 467, 392, 37], ph: [16, 408, 358, 37], p320: [16, 346, 288, 56] },
           rm: { pc: [444, 447, 392, 56], ph: [16, 408, 358, 76], p320: [16, 336, 288, 76] } },
  a: { on: { pc: [444, 504, 392, 37], ph: [16, 445, 358, 37], p320: [16, 402, 288, 37] },
       rm: { pc: [444, 503, 392, 37], ph: [16, 484, 358, 37], p320: [16, 412, 288, 37] } },
  b: { on: { pc: [444, 467, 392, 56], ph: [16, 408, 358, 56], p320: [16, 346, 288, 56] },
       rm: { pc: [444, 447, 392, 76], ph: [16, 408, 358, 76], p320: [16, 336, 288, 95] } },
};
const col = (v, caps) => [
  sh('on', v, 'pc', `<b>${NAME.pc} · signature on file.</b> ${caps.on}`, [MARKS[v].on.pc]),
  sh('rm', v, 'pc', `<b>${NAME.pc} · signature removed</b> (90 days after testing). ${caps.rm}`, [MARKS[v].rm.pc]),
  row(sh('on', v, 'ph', `<b>${NAME.ph}.</b>`, [MARKS[v].on.ph]), sh('on', v, 'p320', `<b>${NAME.p320}.</b> ${caps.on320 ?? ''}`, [MARKS[v].on.p320])),
  row(sh('rm', v, 'ph', `<b>Phone · removed.</b>`, [MARKS[v].rm.ph]), sh('rm', v, 'p320', `<b>320 · removed.</b>`, [MARKS[v].rm.p320])),
];
write('B2-date-signed-staff.json', {
  title: 'Date signed · B2 — staff: candidate detail (a choice: option a or b)',
  subtitle: 'Opened from a Star candidate row (Testing → Star testing → event → candidate). The date the family signed must show with the signature — also after the drawing is deleted 90 days after testing (v0.635, as Color Belt, Black Belt and Prospects do). Two ways to show it; each drawn at PC, phone and 320, for a signature on file (Noah Chen) and a removed one (Morgan Hale). Amber = the row today; green = what changes. Tablet is left out: there the detail is the same centred dialog as on PC and looks the same.',
  width: 1840,
  columns: [
    { label: 'Today', tone: 'today', items: [
      ...col('today', {
        on: '“Ticked and signed · View signature” — no date.',
        rm: '“Ticked and signed · signature removed Oct 31, 2026 (deleted 90 days after the testing day)” — the date signed is gone.',
        on320: 'Already wraps, leaving “·” at the end of line 1.',
      }),
      it('b-staff-sigdialog-pc', [420, 80, 440, 367], 0.9, '<b>“View signature” — no change in either option.</b> It already says “Signed Sat, Oct 31, 2026, 1:19 PM on the family form, after ticking the acknowledgment.”'),
    ] },
    { label: 'Option (a) — recommended', tone: 'after', items: [
      ...col('a', {
        on: 'New row “Date signed · Sat, Oct 31, 2026” under Acknowledgment, which stays “Ticked and signed · View signature”.',
        rm: 'The Date signed row stays; Acknowledgment keeps its “signature removed …” text.',
      }),
    ], note: '<b>Pros:</b> copies Prospects’ approved “Date signed” row and the family form’s box word for word; the date has the weekday like the Registered row; the Acknowledgment line doesn’t change or wrap more than today. <b>Cons:</b> one more row in the dialog.' },
    { label: 'Option (b)', tone: 'after', items: [
      ...col('b', {
        on: '“Ticked and signed Sat, Oct 31, 2026” then “· View signature” kept together on line 2.',
        rm: '“Ticked and signed Sat, Jul 4, 2026 · signature removed Oct 31, 2026 (…)”: three lines.',
      }),
    ], note: '<b>Pros:</b> no new row; the date sits right next to the signature it belongs to. <b>Cons:</b> the line wraps at every size (2 lines with the link, 3 when removed), and two dates sit in one line in the removed state, which is harder to read.' },
  ],
  footer: FOOT + ' For a family-form registration the date signed is the same day as “Registered” (the signature is saved when the form is sent) — by design; v0.638 still asks for it.',
});
console.log('specs written');
