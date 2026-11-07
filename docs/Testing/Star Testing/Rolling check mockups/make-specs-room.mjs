// make-specs-room.mjs — writes the compose.mjs spec (C1-roster-room.json) for Star's pass 2 L-02 review
// picture: the candidate roster follows the room beside the panel (rulebook v1.053, built per v1.130).
// It reads the raw preview screenshots in shots/ (c-*.png) and, for the amber outlines, the boxes
// mock-room.js 'measure' saved next to each one (c-*.json: text over text, and text sticking out of
// its column). Then:  node "../../../Design Review/tools/compose.mjs" C1-roster-room.json
// Why a script: ten shots plus a strip is many numbers; keeping them here makes a re-shoot a one-line
// rerun. Same method as make-specs-stepA.mjs.
import { readFileSync, writeFileSync } from 'node:fs';

const here = (f) => new URL(f, import.meta.url);
// mock-room.js answers JSON, which cdp.mjs prints as a JSON string: parse twice.
const measured = (name) => {
  const raw = readFileSync(here(`shots/c-${name}.json`), 'utf8').replace(/^﻿/, '').trim();
  const once = JSON.parse(raw);
  return typeof once === 'string' ? JSON.parse(once) : once;
};
const s = (name) => `shots/c-${name}.png`;
const inCrop = (crop) => ([x, y, w, h]) => x >= crop[0] && y >= crop[1] && x + w <= crop[0] + crop[2] && y + h <= crop[1] + crop[3];
const it = (name, crop, scale, caption, marks, shotWidth) => ({ src: s(name), crop, scale, caption, marks: marks.filter(inCrop(crop)), shotWidth });
const row = (...items) => ({ row: items });

const TALL = (w) => [0, 0, w, 760]; // the top of a 1000-tall touch window: Dan switch + the first rows
const overlaps = (name) => measured(name).marks;
// Text sticking out of its column: the first line of the gray second line ("Shrewsbury"), the
// part that runs into the 12 px gap before "Testing for".
const sticking = (name) => measured(name).sticking.filter((x) => /^(Shrewsbury|Worcester) ·/.test(x.text))
  .map((x) => [x.box[0], x.box[1], x.box[2], 18]);

const n = (name) => measured(name).count;
const room = (name) => measured(name).room;
const cap = (name, words) => `<b>${measured(name).window} wide, touch, ${measured(name).rail === 96 ? 'Largest' : 'Standard'}</b> (room beside the panel ${room(name)} px). ${words}`;

const SCALE = 0.8;
const spec = {
  width: 2400,
  title: 'Star · L-02 (pass 2) — the candidate roster follows the room beside the panel',
  subtitle: 'Fall Star Testing, Candidates tab, both schools shown (the widest case: the second line carries the school). Today the roster picks its tablet columns from the window’s width, so with the side panel taking 72 px (Standard) or 96 px (Largest) the Candidate and Testing for columns get squeezed to 40–60 px and text runs into text. After (v1.053, built per v1.130): <code>const narrowRoom = usePageRoomBelow(640); const stacked = isPhone || narrowRoom;</code> for the roster only. <b>Limit: 640 px of room.</b> Below it the roster draws the phone’s stacked rows (the ones phones already show); at 640 and above nothing changes. Dialogs, ⋯ menus and the rest of the page keep following the window.',
  columns: [
    { label: 'Today', tone: 'today', items: [
      row(it('683S-today', TALL(683), SCALE, cap('683S-today', `${n('683S-today')} pairs of text over text (outlined): “Shrewsbury” runs into “0 stars”. Most second lines also stick out of a 56–61 px column.`), overlaps('683S-today'), 683),
          it('683L-today', TALL(683), SCALE, cap('683L-today', `${n('683L-today')} overlapping pairs, headers included (“Candidate” / “Testing for” / “Paying by”).`), overlaps('683L-today'), 683)),
      row(it('700S-today', TALL(700), SCALE, cap('700S-today', 'No text over text, but “Shrewsbury” sticks out of its 61 px column into the gap before “0 stars” (outlined), and names break to 2–6 lines.'), sticking('700S-today'), 700),
          it('700L-today', TALL(700), SCALE, cap('700L-today', `${n('700L-today')} overlapping pairs: “Registered Oct 30” runs into “0 stars → 1 star”; the headers overlap.`), overlaps('700L-today'), 700)),
      it('667L-today', [0, 0, 667, 375], 1.2, cap('667L-today', `A phone turned sideways (667 × 375). ${n('667L-today')} overlapping pairs on the roster (“Mi / a / Pat / el”), headers on top of each other.`), overlaps('667L-today'), 667),
    ] },
    { label: 'After', tone: 'after', items: [
      row(it('683S-after', TALL(683), SCALE, cap('683S-after', 'Room 611 &lt; 640: stacked rows. Name + Registered, stars · school, paying by · paid on, tag + Mark paid, ⋯ on the right.'), [], 683),
          it('683L-after', TALL(683), SCALE, cap('683L-after', 'Room 587: stacked rows.'), [], 683)),
      row(it('700S-after', TALL(700), SCALE, cap('700S-after', 'Room 628 &lt; 640: stacked rows. (Today this size has no text over text, but the columns are too narrow to read — see the Today shot.)'), [], 700),
          it('700L-after', TALL(700), SCALE, cap('700L-after', 'Room 604: stacked rows.'), [], 700)),
      it('667L-after', [0, 0, 667, 375], 1.2, cap('667L-after', 'Room 571: stacked rows; the panel stays on the left (the window is still a tablet’s width).'), [], 667),
    ], note: '<b>How the limit was measured.</b> The real roster in preview, touch, admin, details shown, both schools (the widest case), Panel size Largest, window 640–1024 px in 1–8 px steps; for each width: the room (the page area’s own <code>data-page-room</code>), text boxes of two cells of one row that overlap, and cells whose text is wider than the cell. <b>Text over text</b> stops at room 617; <b>text sticking out of its column</b> stops at 636 (632 still has 6); 640 is the first clean round number above both and the same as Dashboard core’s sample (<code>parts.html#L02/room</code>). Standard gives the same results at the same room (the room is what counts). With a mouse the actions column is 24 px narrower, so the roster is clean from about 616: 640 covers both. One school selected and Hide private details need less room. PC columns (1024+) are clean at 1024 with Largest (room 928). <b>Your call if you want more:</b> at room 640–695 the tablet columns are clean but tight (names on 4–5 lines, “Testing for” header on 2 lines); from <b>696</b> they look exactly as at 820 (the approved tablet). A limit of 696 would also stack 700 / 720 / 760-wide windows with Largest.' },
  ],
  footer: '',
};

// The strip under both columns: the four approved sizes, unchanged (each room ≥ 640, or already a phone).
// compose.mjs has no full-width row, so it is written here with compose's own figure markup.
const stripItem = (name, w, h, scale, caption) => `<figure style="width:${w * scale}px"><div class="shot" style="width:${w * scale}px;height:${h * scale}px"><img src="shots/c-${name}.png" style="left:0;top:0;width:${w * scale}px"></div><figcaption>${caption}</figcaption></figure>`;
const strip = `<div class="label" style="background:#ECECE8;color:#3A3A3A">Unchanged</div>
<div class="row">
${stripItem('1280-today', 1280, 800, 0.6, `<b>PC 1280×800, mouse</b> (room ${room('1280-today')}): PC columns, as today.`)}
${stripItem('820S-today', 820, 1180, 0.45, `<b>820×1180 touch, Standard</b> (room ${room('820S-today')}): tablet columns, as today.`)}
${stripItem('820L-today', 820, 1180, 0.45, `<b>820 touch, Largest</b> (room ${room('820L-today')} ≥ 640): tablet columns, as today.`)}
${stripItem('390-today', 390, 844, 0.6, '<b>390×844 touch</b>: phone rows, as today.')}
${stripItem('320-today', 320, 700, 0.6, '<b>320 wide, touch</b>: phone rows, as today.')}
</div>`;

spec.footer = `${strip}<p style="margin-top:16px"><b>How the pictures were made.</b> Star testing · rolling check pass 2, L-02. Preview screenshots (fake database, admin, Fall Star Testing, “Show both schools”), Panel size set through the Account menu. <b>Today</b> = the app as it is. <b>After</b> = drawn on the real page by mock-room.js: the phone roster’s own markup was copied from the app at a 600 px phone window (same event, same rows) and put in place of the tablet roster at each target size. Its styles (<code>.st-crow-c.is-phone</code>, <code>.ev-srow-main</code> …) are not behind a phone-width rule, so they draw as they will once the roster follows a class. So the rows are exactly the phone’s; what a copy can’t show: buttons don’t work in the drawn roster, and the tablet page around it (summary cards, Dan switch, top bar) is today’s — which is also what the change keeps. Nothing in the app was changed. Amber = text over text, or text sticking out of its column.</p>`;

writeFileSync(here('C1-roster-room.json'), JSON.stringify(spec, null, 1));
console.log('spec written');
