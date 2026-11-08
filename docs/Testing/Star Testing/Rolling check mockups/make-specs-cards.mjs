// make-specs-cards.mjs — writes the compose.mjs specs (B3-count-cards.json, B4-withdrawn-receipt.json) for Star's
// rolling-check Step B review pictures (B3 = R5-05, R3-02, S-1 cards, C-05 (b); B4 = M-03), from the raw preview
// screenshots in shots/ (d-*.png) and the outline boxes shoot-cards.ps1 measured into shots/d-marks.json.
// Then:  node "../../../Design Review/tools/compose.mjs" B3-count-cards.json   (and B4-withdrawn-receipt.json)
// Why a script: two pictures x four sizes x Today/After is many crops and boxes; keeping them here makes a
// re-shoot a one-line rerun. Same method as make-specs-stepA.mjs.
import { readFileSync, writeFileSync } from 'node:fs';

const marksAll = JSON.parse(readFileSync(new URL('shots/d-marks.json', import.meta.url), 'utf8').replace(/^﻿/, ''));
// PowerShell wrote one box as [x,y,w,h] and several as [[...],[...]]; nothing as {}. Make it a list of boxes.
const boxes = (v) => (Array.isArray(v) ? (typeof v[0] === 'number' ? [v] : v) : []);
const M = (key, field) => boxes(marksAll[key]?.[field]);
const one = (key, field, i = 0) => M(key, field)[i];
// the right-hand end of a roster row (where Mark paid sits), as a box
const rowEnd = (b, w = 150) => [b[0] + b[2] - w, b[1], w, b[3]];

const s = (name) => `shots/d-${name}.png`;
const it = (src, crop, scale, caption, marks = [], shotWidth = 1280) => ({ src: s(src), crop, scale, caption, marks: marks.filter(Boolean), shotWidth });
const row = (...items) => ({ row: items });
const write = (file, spec) => writeFileSync(new URL(file, import.meta.url), JSON.stringify({ width: 1920, ...spec }, null, 1));
const SIZES = [['pc', 1280], ['tab', 820], ['ph', 390], ['p320', 320]];
const WORDS = { pc: 'PC 1280×800', tab: 'Tablet 820×1180, touch', ph: 'Phone 390×844, touch', p320: '320 wide, touch' };
const FOOT_B3 = 'Star testing · rolling check pass 1 Step B (R5-05, R3-02, S-1 cards part) and pass 2 (C-05 (b)). Preview screenshots (fake database, admin, Fall Star Testing, with Noah Chen — who paid $140 — removed, and the Ava Reed duplicate pair flagged; “Both” schools unless a caption says Worcester). The “After” column is the real page with the changes DRAWN OVER it by a small script (mock-cards.js: card numbers, gray lines, empty-line words, Mark paid removed from the flagged rows) — nothing in the app was changed, and the numbers in the After are the ones the new rules would give. On phone and 320 the window was made taller so the whole list fits in one picture; the widths are the real sizes. Amber = what changes; green = the change.';
const FOOT_B4 = 'Star testing · rolling check pass 2 M-03 (rulebook v1.055; Jeffrey’s “fine”, 2026-11-06, to follow Color Belt’s v0.428). Preview screenshots (fake database, Fall Star Testing, Both schools; Noah Chen paid $140 and is removed; Owen Hart is removed with nothing paid). The “After” column is the real page with the new menu items DRAWN OVER it by a small script (mock-cards.js) — nothing in the app was changed. The staff ⋯ is the app’s own button copied into the row; an open staff menu can’t be opened in the app today, so it is drawn by trimming the admin’s open menu to Print receipt (the Print receipt item itself is the app’s own, copied from an active row’s menu). Amber = what changes; green = the change.';

// ---------- B3 · count cards ----------
const cardsToday = (k) => [one(k, 'cards', 0), one(k, 'cards', 2), one(k, 'cards', 3)];
const cardsAfter = (k) => [one(k, 'cards', 0), one(k, 'cards', 2), one(k, 'cards', 3), one(k, 'note')];

// crops: [x, y, w, h] per size, shared by a Today/After pair (the After is taller, so the crop fits it)
const CROP_M = { pc: [60, 230, 1210, 430], tab: [90, 315, 710, 470], ph: [0, 415, 390, 330], p320: [0, 480, 320, 340] };
const CROP_F = { pc: [60, 285, 1210, 420] };
const CROP_P = { pc: [60, 285, 1210, 360], tab: [90, 315, 710, 400], ph: [0, 415, 390, 490], p320: [0, 480, 320, 525] };
const CROP_N = { pc: [60, 285, 1210, 360], tab: [90, 315, 710, 385], ph: [0, 415, 390, 485], p320: [0, 480, 320, 500] };
const SC = { pc: 0.72, tab: 0.55, ph: 0.55, p320: 0.55 };
const SC_M = { pc: 0.72, tab: 0.55, ph: 0.62, p320: 0.62 };

function b3Column(tone) {
  const t = tone === 'today';
  const when = t ? 'today' : 'after';
  const key = (sc, k) => `${sc}-${when}-${k}`;
  const items = [];
  // (1) the cards and the duplicate rows, no filter
  items.push(
    it(`B3m-${when}-pc`, CROP_M.pc, SC_M.pc,
      t
        ? '<b>PC 1280×800, Both schools.</b> Candidates lists Shrewsbury first. Not paid says 4: it counts both Ava Reed rows (the possible duplicate). Payments recorded says $790: Noah Chen’s $140 dropped out when he was removed. The flagged Ava Reed rows offer Mark paid.'
        : '<b>PC 1280×800, Both schools.</b> Candidates lists Worcester, then Shrewsbury. Not paid says 2: the flagged Ava Reed rows are left out until they are reviewed, and say so in one gray line under the cards; they no longer offer Mark paid (their ⋯ keeps Review possible duplicate). Payments recorded says $930, with “includes $140 from removed candidates” (Noah Chen’s money counts again).',
      t
        ? [...cardsToday(key('B3m', 'pc')), ...M(key('B3m', 'pc'), 'markPaid')]
        : [...cardsAfter(key('B3m', 'pc')), ...M(key('B3m', 'pc'), 'avaRows').map((b) => rowEnd(b))]),
    row(
      ...['tab', 'ph', 'p320'].map((k) =>
        it(`B3m-${when}-${k}`, CROP_M[k], SC_M[k], `<b>${WORDS[k]}.</b>${k === 'tab' ? (t ? '' : ' Same changes.') : ''}`,
          t
            ? [...cardsToday(key('B3m', k)), ...(k === 'tab' ? M(key('B3m', k), 'markPaid') : [])]
            : [...cardsAfter(key('B3m', k)), ...(k === 'tab' ? M(key('B3m', k), 'avaRows').map((b) => rowEnd(b)) : [])],
          SIZES.find((x) => x[0] === k)[1])),
    ),
  );
  // (2) a card's filter is on: the flagged rows are not in Not paid's list either
  items.push(
    it(`B3f-${when}-pc`, CROP_F.pc, 0.72,
      t
        ? '<b>PC, Not paid card on.</b> The list holds 4: both Ava Reed rows, Sam Ortiz and Ethan Lopez — the card says 4, so card and list agree, but the flagged rows are in both.'
        : '<b>PC, Not paid card on.</b> The list holds exactly what the card counts: Sam Ortiz and Ethan Lopez (2). The gray duplicate line sits above “Showing not paid only · Show all”. The Paid filter works the same way.',
      t
        ? [one('B3f-today-pc', 'cards', 2), ...M('B3f-today-pc', 'markPaid')]
        : [one('B3f-after-pc', 'cards', 2), one('B3f-after-pc', 'note')]),
  );
  // (3) the empty lines, Paid (Worcester only, so Paid is really empty) and Not paid (2nd Dan)
  items.push(
    it(`B3p-${when}-pc`, CROP_P.pc, SC.pc,
      t
        ? '<b>PC, Worcester only, Paid card on, 1st Dan.</b> Nobody at Worcester has paid (Noah Chen is removed): the line says “No candidates match.” The cards also show Payments recorded $0, though $140 is on record.'
        : '<b>PC, Worcester only, Paid card on, 1st Dan.</b> The empty line says what is true: “No paid candidates in this Dan.” Payments recorded shows $140 with “includes $140 from removed candidates” (R5-05).',
      t
        ? [one('B3p-today-pc', 'empty'), one('B3p-today-pc', 'cards', 3)]
        : [one('B3p-after-pc', 'empty'), one('B3p-after-pc', 'cards', 3), one('B3p-after-pc', 'note')]),
    row(
      ...['tab', 'ph', 'p320'].map((k) =>
        it(`B3p-${when}-${k}`, CROP_P[k], SC[k], `<b>${WORDS[k]}.</b>`,
          t ? [one(`B3p-today-${k}`, 'empty')] : [one(`B3p-after-${k}`, 'empty'), one(`B3p-after-${k}`, 'note')],
          SIZES.find((x) => x[0] === k)[1])),
    ),
    it(`B3n-${when}-pc`, CROP_N.pc, SC.pc,
      t
        ? '<b>PC, Both schools, Not paid card on, 2nd Dan.</b> Everyone in this Dan has paid, so the list is empty: “No candidates match.”'
        : '<b>PC, Both schools, Not paid card on, 2nd Dan.</b> “Every candidate in this Dan has paid.”',
      [one(`B3n-${when}-pc`, 'empty')]),
    row(
      ...['tab', 'ph', 'p320'].map((k) =>
        it(`B3n-${when}-${k}`, CROP_N[k], SC[k], `<b>${WORDS[k]}.</b>`, [one(`B3n-${when}-${k}`, 'empty')], SIZES.find((x) => x[0] === k)[1])),
    ),
  );
  return items;
}

write('B3-count-cards.json', {
  title: 'Star · Step B — the count cards: removed candidates’ money, possible duplicates, school order, and what an empty card says',
  subtitle: 'Candidates tab of an event (Fall Star Testing). <b>R5-05 (v1.038):</b> Payments recorded also counts the money of removed candidates (same school filter), with a gray line “includes $X from removed candidates” when some of it is theirs. <b>R3-02 (v1.046):</b> a possible-duplicate row is left out of Paid and Not paid, and of their lists, until it is reviewed; it offers no Mark paid; one gray line under the cards says so. <b>S-1 (v1.047):</b> on Both, the Candidates card lists Worcester, then Shrewsbury. <b>C-05 (b) (v1.055):</b> when a card’s list is empty, the line says what is true, in Color Belt’s pattern.',
  columns: [
    { label: 'Today', tone: 'today', items: b3Column('today') },
    {
      label: 'After',
      tone: 'after',
      items: b3Column('after'),
      note: '<b>The words drawn (new text is a proposal until you OK it):</b><br>• Payments recorded, gray line under the number: “includes $140 from removed candidates” (Color Belt’s line with “students” → “candidates”); no line when nothing is theirs.<br>• Possible duplicate, one gray line under the cards: “1 possible duplicate isn’t counted in Paid or Not paid until it’s reviewed.” Plural: “2 possible duplicates aren’t counted in Paid or Not paid until they’re reviewed.” It counts pairs, like the orange box above (“1 possible duplicate”), but each pair leaves <b>both</b> of its rows out. Same words at every size (it wraps on a phone).<br>• Empty line by card: <b>Paid</b> → “No paid candidates in this Dan.” · <b>Not paid</b> → “Every candidate in this Dan has paid.” · <b>Candidates</b> (not a filter) → unchanged: “No candidates for this Dan.” / “No candidates yet. Families register with the registration links, or staff add them with Add candidate.” · <b>Payments recorded</b> is a total, not a filter, so it has no empty line · “No past events yet.” stays.<br>• Why “in this Dan”: the list below the cards is one Dan at a time (the cards count the whole event), as Color Belt says “in this class”. When the chosen Dan has no candidates at all, “No candidates for this Dan.” wins even with a card on (so “Every candidate … has paid” is never said about an empty Dan).',
    },
  ],
  footer: FOOT_B3,
});

// ---------- B4 · Print receipt on a removed candidate who paid ----------
const C4 = {
  menu: { pc: [60, 570, 1210, 215], tab: [90, 880, 710, 260], ph: [0, 440, 390, 404], p320: [0, 240, 320, 460] },
  list: { pc: [60, 585, 1210, 130], tab: [90, 890, 710, 215], ph: [0, 440, 390, 290], p320: [0, 240, 320, 340] },
  smenu: { pc: [60, 590, 1210, 110], tab: [90, 890, 710, 145], ph: [0, 440, 390, 404], p320: [0, 240, 320, 460] },
  same: { pc: [60, 585, 1210, 195] },
};
const SC4 = { pc: 0.72, tab: 0.55, ph: 0.55, p320: 0.55 };
const w4 = (k) => SIZES.find((x) => x[0] === k)[1];

write('B4-withdrawn-receipt.json', {
  title: 'Star · Step B — Print receipt on a removed candidate who paid (M-03)',
  subtitle: 'Event → Candidates → the Removed group. Today a removed candidate’s ⋯ holds Restore · Delete permanently and only admins have it, so a candidate who paid and was removed (their money still counts in Payments recorded) has no way to print the receipt. After, as Color Belt does (v0.428): a removed candidate with a payment or refund that still stands gets <b>Print receipt</b> first, in its own group; <b>admins</b> see Print receipt · line · Restore · line · Delete permanently; <b>staff</b> see a ⋯ holding only Print receipt (they still get no Restore or Delete). With nothing paid there is no Print receipt (admins: Restore · Delete permanently, as today; staff: no ⋯). Never while Hide private details is on.',
  columns: [
    {
      label: 'Today',
      tone: 'today',
      items: [
        it('B4a-today-pc', C4.menu.pc, SC4.pc, '<b>Admin, PC 1280×800.</b> Noah Chen (removed, paid $140): ⋯ → Restore · Delete permanently. No Print receipt.', [one('B4a-today-pc', 'menu')]),
        row(...['tab', 'ph', 'p320'].map((k) => it(`B4a-today-${k}`, C4.menu[k], SC4[k], `<b>Admin, ${WORDS[k]}.</b>`, [one(`B4a-today-${k}`, 'menu')], w4(k)))),
        it('B4b-today-pc', C4.list.pc, SC4.pc, '<b>Staff, PC.</b> The three removed rows have no ⋯ at all (a blank space where it would be), so a staff member can’t print Noah Chen’s receipt.', [(() => { const r = one('B4b-today-pc', 'rows', 0); return r && rowEnd(r, 60); })()]),
        row(...['tab', 'ph', 'p320'].map((k) => it(`B4b-today-${k}`, C4.list[k], SC4[k], `<b>Staff, ${WORDS[k]}.</b>`, [(() => { const r = one(`B4b-today-${k}`, 'rows', 0); return r && rowEnd(r, k === 'tab' ? 80 : 70); })()], w4(k)))),
      ],
    },
    {
      label: 'After',
      tone: 'after',
      items: [
        it('B4a-after-pc', C4.menu.pc, SC4.pc, '<b>Admin, PC.</b> Noah Chen: Print receipt · line · Restore · line · Delete permanently.', [one('B4a-after-pc', 'menu')]),
        row(...['tab', 'ph', 'p320'].map((k) => it(`B4a-after-${k}`, C4.menu[k], SC4[k], `<b>Admin, ${WORDS[k]}.</b>`, [one(`B4a-after-${k}`, 'menu')], w4(k)))),
        it('B4b-after-pc', C4.list.pc, SC4.pc, '<b>Staff, PC.</b> Noah Chen (paid) now has a ⋯; Owen Hart and Lily Brooks (nothing paid) still have none.', [one('B4b-after-pc', 'noah')]),
        row(...['tab', 'ph', 'p320'].map((k) => it(`B4b-after-${k}`, C4.list[k], SC4[k], `<b>Staff, ${WORDS[k]}.</b>`, [one(`B4b-after-${k}`, 'noah')], w4(k)))),
        it('B4c-after-pc', C4.smenu.pc, SC4.pc, '<b>Staff, PC, Noah Chen’s ⋯ open.</b> Print receipt only.', [one('B4c-after-pc', 'menu')]),
        row(...['tab', 'ph', 'p320'].map((k) => it(`B4c-after-${k}`, C4.smenu[k], SC4[k], `<b>Staff, ${WORDS[k]}.</b>${k === 'ph' ? ' (The phone sheet also has its usual Cancel.)' : ''}`, [one(`B4c-after-${k}`, 'menu')], w4(k)))),
        it('B4d-same-pc', C4.same.pc, SC4.pc, '<b>Admin, PC, a removed candidate with nothing paid</b> (Owen Hart): Restore · Delete permanently, exactly as today — no Print receipt. Unchanged at every size.', []),
      ],
      note: 'Print receipt prints the same receipt an active row prints, with the payments that still stand. The receipt shown inside a candidate’s summary follows the same one rule (the app shares it with the ⋯ menu). Restore and Delete permanently work as today.',
    },
  ],
  footer: FOOT_B4,
});
