// checks.mjs — automatic checks for the dashboard's shared helpers. Run:  node src/lib/shared/checks.mjs
// Why it exists: Dashboard core step 1 (rulebook v1.030) builds the shared parts once, and the rule
// of that step is that nothing on screen changes. These plain `assert` checks prove the parts with
// no look keep that promise — the money helper (M9), the shared words (M11) and the moved helpers
// (M10) — without a browser or a database, in about a second, and print
// ALL SHARED PARTS CHECKS PASSED (or stop at the first check that fails, with a non-zero exit).
// The second build step added its groups at the end (the marked place): the time list's choices
// (M8, src/lib/times.js), the history line's words and dates (M7, src/lib/historyDates.js) and the
// QR helper (M5, src/lib/qr.js) — the QR picture is compared with the four sections' own copies, to
// prove it is the same QR code as today.
import assert from 'node:assert/strict';
import { formatMoney, formatMoneyWithCents } from '../money.js';
import { formatCents } from '../blackBelt/money.js';
import * as SHARED from '../../components/text.js';
import * as TESTING from '../../screens/testing/text.js';
import * as STAFF from '../../screens/staff/text.js';
import * as SETTINGS from '../../screens/settings/text.js';
import * as LIVE_NEW from '../useLiveLoad.js';
import * as LIVE_OLD from '../../screens/testing/events/useLiveLoad.js';
import * as TIMES from '../times.js';
import * as QR from '../qr.js';
import * as HISTORY from '../historyDates.js';
// The four sections' own QR helpers, read only, to compare with the shared one (M5).
import { qrSvgDataUrl as cbQrSvgDataUrl, registrationLink } from '../testing/qr.js';
import { starQrSvgDataUrl, starRegistrationLink } from '../star/links.js';
import { campLink, campQrSvgDataUrl } from '../camps/qr.js';
import { blackBeltLink, qrSvgDataUrl as bbQrSvgDataUrl } from '../blackBelt/qr.js';

let count = 0;
// A check runs its function; a function that waits for something (async) is waited for.
// ("await" at the top of a module works in Node's ES modules, which this .mjs file is.)
async function check(label, fn) {
  try {
    await fn();
    count += 1;
  } catch (error) {
    console.error(`FAILED: ${label}`);
    throw error;
  }
}

const MINUS = '\u2212'; // − (U+2212), the real minus sign

// ======================= M9 — money (rulebook v1.026, v1.101) =======================

await check('M9 money: the brief\'s examples (plan §3, M9 table)', () => {
  assert.equal(formatMoney(6500), '$65');
  assert.equal(formatMoney(29050), '$290.50');
  assert.equal(formatMoney(112000), '$1,120');
  assert.equal(formatMoney(-19000), `${MINUS}$190`);
  assert.equal(formatMoneyWithCents(-19000), `${MINUS}$190.00`);
  assert.equal(formatMoney(3250), '$32.50');
  assert.equal(formatMoney(0), '$0');
  assert.equal(formatMoney(null), '');
});

await check('M9 money: cents only when there are some; always cents in the WithCents form', () => {
  assert.equal(formatMoney(1), '$0.01');
  assert.equal(formatMoney(5), '$0.05');
  assert.equal(formatMoney(14050), '$140.50'); // never "$140.5" (Star's old helper, plan §10)
  assert.equal(formatMoney(100000), '$1,000');
  assert.equal(formatMoney(270000), '$2,700');
  assert.equal(formatMoney(123456789), '$1,234,567.89');
  assert.equal(formatMoney(2200000000), '$22,000,000'); // big sums arrive as plain numbers
  assert.equal(formatMoneyWithCents(6500), '$65.00');
  assert.equal(formatMoneyWithCents(29050), '$290.50');
  assert.equal(formatMoneyWithCents(112000), '$1,120.00');
  assert.equal(formatMoneyWithCents(1), '$0.01');
  assert.equal(formatMoneyWithCents(0), '$0.00');
  assert.equal(formatMoneyWithCents(123456789), '$1,234,567.89');
});

await check('M9 money: a minus is the real minus sign (U+2212) before the dollar sign', () => {
  assert.equal(formatMoney(-33500), `${MINUS}$335`); // Camps' "$-335" becomes this when it switches
  assert.equal(formatMoney(-5005), `${MINUS}$50.05`);
  assert.equal(formatMoney(-1), `${MINUS}$0.01`);
  assert.equal(formatMoneyWithCents(-1), `${MINUS}$0.01`);
  assert.equal(formatMoney(-19000).codePointAt(0), 0x2212);
  assert.ok(!formatMoney(-19000).includes('-'), 'no keyboard hyphen');
  assert.ok(!formatMoneyWithCents(-19000).includes('-'), 'no keyboard hyphen');
  // -0 is zero: no sign
  assert.equal(formatMoney(-0), '$0');
  assert.equal(formatMoneyWithCents(-0), '$0.00');
});

await check('M9 money: anything but whole cents gives an empty text', () => {
  for (const bad of [null, undefined, '', '6500', '$65', 6500.5, -0.5, 0.1, NaN, Infinity, -Infinity, true, false, {}, [], [6500], 6500n]) {
    assert.equal(formatMoney(bad), '', `formatMoney(${String(bad)})`);
    assert.equal(formatMoneyWithCents(bad), '', `formatMoneyWithCents(${String(bad)})`);
  }
});

// Black Belt's formatCents exactly as it was before step 1 (git 712e3a6,
// src/lib/blackBelt/money.js). Kept here so this check proves that making it a thin wrapper
// around formatMoney changed nothing.
function formatCentsBeforeStep1(cents) {
  if (!Number.isInteger(cents)) return '';
  const sign = cents < 0 ? '\u2212' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString('en-US'); // "2,700"
  const rest = abs % 100;
  return `${sign}$${dollars}${rest === 0 ? '' : `.${String(rest).padStart(2, '0')}`}`;
}

await check('M9 money: formatCents (now a wrapper) = formatMoney = the old formatCents, for every value', () => {
  // Every whole number of cents from −$5,000 to $5,000 (Black Belt's largest amount), one by one.
  for (let cents = -500000; cents <= 500000; cents += 1) {
    const before = formatCentsBeforeStep1(cents);
    if (formatMoney(cents) !== before || formatCents(cents) !== before) {
      assert.fail(`${cents}: before ${before}, formatMoney ${formatMoney(cents)}, formatCents ${formatCents(cents)}`);
    }
  }
  // Big and odd values, and everything that isn't whole cents.
  const more = [Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER, 1e15, -1e15, 1e21, -1e21, 2200000000, -0,
    null, undefined, '', '6500', 6500.5, NaN, Infinity, -Infinity, true, {}, [], 6500n];
  for (let i = 0; i < 2000; i += 1) more.push(Math.round((i * 7919 - 7000000) * 104729)); // spread over ±10^12
  for (const value of more) {
    assert.equal(formatMoney(value), formatCentsBeforeStep1(value), `formatMoney(${String(value)})`);
    assert.equal(formatCents(value), formatCentsBeforeStep1(value), `formatCents(${String(value)})`);
  }
});

// ======================= M11 — the shared words keep today's values =======================

await check('M11 words: the shared words, and every old name still gives the same word', () => {
  assert.deepEqual(
    { BACK: SHARED.BACK, CANCEL: SHARED.CANCEL, RETRY: SHARED.RETRY, DISMISS: SHARED.DISMISS, GRIP_TOOLTIP: SHARED.GRIP_TOOLTIP },
    { BACK: 'Back', CANCEL: 'Cancel', RETRY: 'Retry', DISMISS: 'Dismiss', GRIP_TOOLTIP: 'Drag to reorder' },
  );
  // Testing's words file re-exports them (its importers, and Camps' CB.… re-exports, keep working).
  for (const name of ['BACK', 'CANCEL', 'RETRY', 'DISMISS', 'GRIP_TOOLTIP']) assert.equal(TESTING[name], SHARED[name], `testing/text.js ${name}`);
  // Main's own screens.
  assert.equal(STAFF.BACK, 'Back');
  assert.equal(STAFF.CANCEL, 'Cancel');
  assert.equal(SETTINGS.CANCEL, 'Cancel');
});

// ======================= M10 — the moved helpers =======================

await check('M10 moves: the old useLiveLoad path gives the very same hook and refresh time', () => {
  assert.equal(LIVE_OLD.useLiveLoad, LIVE_NEW.useLiveLoad);
  assert.equal(LIVE_OLD.LIVE_REFRESH_MS, LIVE_NEW.LIVE_REFRESH_MS);
  assert.equal(LIVE_NEW.LIVE_REFRESH_MS, 15000); // every 15 seconds (rulebook v0.157)
  assert.deepEqual(Object.keys(LIVE_OLD).sort(), Object.keys(LIVE_NEW).sort());
});

// ======================= The next build step adds its groups below =======================
// M8 — the time list's choices (6:00 AM–10:00 PM every 5 minutes = 193; Finance's Off + 11 AM–11 PM
// every 5 minutes = 146; labels with AM/PM; a saved time not on the list is kept) — src/lib/times.js
// M5 — the QR helper (src/lib/qr.js)

// ======================= M8 — the time list (rulebook v1.019, v1.109) =======================

await check('M8 times: 6:00 AM–10:00 PM every 5 minutes is 193 choices, in order, with AM/PM', () => {
  const list = TIMES.timeOptions();
  assert.equal(list.length, 193);
  assert.deepEqual(list[0], { value: '06:00', label: '6:00 AM' });
  assert.deepEqual(list[1], { value: '06:05', label: '6:05 AM' });
  assert.deepEqual(list[192], { value: '22:00', label: '10:00 PM' });
  assert.equal(list.find((o) => o.value === '16:40').label, '4:40 PM');
  assert.equal(list.find((o) => o.value === '12:00').label, '12:00 PM'); // noon
  assert.equal(list.find((o) => o.value === '11:55').label, '11:55 AM');
  for (let i = 1; i < list.length; i += 1) assert.ok(list[i - 1].value < list[i].value, 'in time order');
  for (const option of list) assert.match(option.label, /^(1[0-2]|[1-9]):[0-5][05] (AM|PM)$/, `every label has AM/PM: ${option.label}`);
  // The same list with the defaults written out
  assert.deepEqual(TIMES.timeOptions({ from: '06:00', to: '22:00', step: 5 }), list);
});

await check("M8 times: Finance's Off + 11:00 AM–11:00 PM every 5 minutes is 146 choices, Off first", () => {
  const list = TIMES.timeOptions({ from: '11:00', to: '23:00', offLabel: 'Off' });
  assert.equal(list.length, 146);
  assert.deepEqual(list[0], { value: TIMES.OFF_VALUE, label: 'Off' });
  assert.deepEqual(list[1], { value: '11:00', label: '11:00 AM' });
  assert.deepEqual(list[145], { value: '23:00', label: '11:00 PM' });
  // Off is chosen when nothing is saved; a saved time stays itself
  assert.equal(TIMES.selectValue(null, 'Off'), TIMES.OFF_VALUE);
  assert.equal(TIMES.selectValue('16:00', 'Off'), '16:00');
  assert.equal(TIMES.selectValue(null), null); // no Off: nothing chosen (the gray "Choose a time")
});

await check('M8 times: the labels', () => {
  const cases = { '00:00': '12:00 AM', '00:30': '12:30 AM', '06:00': '6:00 AM', '09:05': '9:05 AM', '12:00': '12:00 PM', '12:45': '12:45 PM', '13:00': '1:00 PM', '16:40': '4:40 PM', '22:00': '10:00 PM', '23:55': '11:55 PM' };
  for (const [time, label] of Object.entries(cases)) assert.equal(TIMES.timeLabel(time), label, time);
  assert.equal(TIMES.timeLabel('16:40:00'), '4:40 PM'); // the database's 'HH:MM:SS'
  for (const bad of [null, undefined, '', '24:00', '7:00', '16:60', '16:40 PM', 1640, 'noon']) assert.equal(TIMES.timeLabel(bad), '', String(bad));
});

await check('M8 times: a saved time that is not on the list is kept and shown, in its place', () => {
  // Off the 5-minute step
  const odd = TIMES.timeOptions({ value: '16:42' });
  assert.equal(odd.length, 194);
  const at = odd.findIndex((o) => o.value === '16:42');
  assert.deepEqual(odd[at], { value: '16:42', label: '4:42 PM' });
  assert.equal(odd[at - 1].value, '16:40');
  assert.equal(odd[at + 1].value, '16:45');
  // Before and after the range
  const early = TIMES.timeOptions({ value: '05:30' });
  assert.deepEqual(early[0], { value: '05:30', label: '5:30 AM' });
  const late = TIMES.timeOptions({ value: '23:15' });
  assert.deepEqual(late[late.length - 1], { value: '23:15', label: '11:15 PM' });
  // After Finance's Off, never before it
  const finance = TIMES.timeOptions({ from: '11:00', to: '23:00', offLabel: 'Off', value: '09:00' });
  assert.equal(finance[0].value, TIMES.OFF_VALUE);
  assert.deepEqual(finance[1], { value: '09:00', label: '9:00 AM' });
  // The database's 'HH:MM:SS' is the same time (not added twice)
  assert.equal(TIMES.timeOptions({ value: '16:40:00' }).length, 193);
  assert.equal(TIMES.selectValue('16:40:00'), '16:40');
  // A time already on the list isn't added again
  assert.equal(TIMES.timeOptions({ value: '06:00' }).length, 193);
});

await check('M8 times: typing a number jumps to that hour ("6" → 6:00 AM, "6" again → 6:00 PM)', () => {
  const list = TIMES.timeOptions();
  const index = (time) => list.findIndex((o) => o.value === time);
  const from440 = index('16:40');
  assert.equal(TIMES.hourJump('6', from440, list), index('06:00')); // the first press: the earlier one
  assert.equal(TIMES.hourJump('6', index('06:00'), list), index('18:00')); // again: the other one
  assert.equal(TIMES.hourJump('6', index('18:00'), list), index('06:00')); // and round again
  assert.equal(TIMES.hourJump('66', index('06:00'), list), index('18:00')); // typed quickly twice
  assert.equal(TIMES.hourJump('6', index('06:20'), list), index('18:00')); // already in that hour
  assert.equal(TIMES.hourJump('1', from440, list), index('13:00')); // 1 AM isn't on the list
  assert.equal(TIMES.hourJump('10', index('13:00'), list), index('10:00')); // "1" then "0"
  assert.equal(TIMES.hourJump('12', from440, list), index('12:00'));
  assert.equal(TIMES.hourJump('9', -1, list), index('09:00')); // nothing chosen yet
  assert.equal(TIMES.hourJump('0', from440, list), null);
  assert.equal(TIMES.hourJump('13', from440, list), null);
  assert.equal(TIMES.hourJump('x', from440, list), null);
  // Finance's list: "o" → Off; "1" → 11:00 AM? No — 1:00 PM (the hour 1); "11" → 11:00 AM
  const finance = TIMES.timeOptions({ from: '11:00', to: '23:00', offLabel: 'Off' });
  assert.equal(TIMES.hourJump('o', 5, finance), 0);
  assert.equal(finance[TIMES.hourJump('1', 0, finance)].value, '13:00');
  assert.equal(finance[TIMES.hourJump('11', 0, finance)].value, '11:00');
  assert.equal(finance[TIMES.hourJump('11', TIMES.hourJump('11', 0, finance), finance)].value, '23:00');
});

await check('M8 times: a two-digit hour typed again reaches the other half of the day ("10", "10" → 10:00 PM)', () => {
  // The list (Select.jsx) passes where it was when the number STARTED; the "1" of "10" has already
  // moved it to 1:00 PM by the time "10" is complete. (Design review fix D1.)
  const list = TIMES.timeOptions();
  const index = (time) => list.findIndex((o) => o.value === time);
  // "10" the first time, from 4:40 PM: "1" → 1:00 PM, then "10" (started at 4:40 PM) → 10:00 AM
  assert.equal(TIMES.hourJump('1', index('16:40'), list, index('16:40')), index('13:00'));
  assert.equal(TIMES.hourJump('10', index('13:00'), list, index('16:40')), index('10:00'));
  // "10" again (a new number, started on 10:00 AM): "1" → 1:00 PM, then "10" → 10:00 PM
  assert.equal(TIMES.hourJump('1', index('10:00'), list, index('10:00')), index('13:00'));
  assert.equal(TIMES.hourJump('10', index('13:00'), list, index('10:00')), index('22:00'));
  // and a third time, round to 10:00 AM
  assert.equal(TIMES.hourJump('10', index('13:00'), list, index('22:00')), index('10:00'));
  // "12" twice: only noon is on 6 AM–10 PM, so it stays on 12:00 PM (never stuck on 1:00 PM)
  assert.equal(TIMES.hourJump('12', index('13:00'), list, index('16:40')), index('12:00'));
  assert.equal(TIMES.hourJump('12', index('13:00'), list, index('12:00')), index('12:00'));
  // "66" is unchanged: judged from where the first "6" moved the list
  assert.equal(TIMES.hourJump('6', index('16:40'), list, index('16:40')), index('06:00'));
  assert.equal(TIMES.hourJump('66', index('06:00'), list, index('16:40')), index('18:00'));
  // Finance: "11" twice from Off → 11:00 AM, then 11:00 PM
  const finance = TIMES.timeOptions({ from: '11:00', to: '23:00', offLabel: 'Off' });
  const at = (time) => finance.findIndex((o) => o.value === time);
  assert.equal(TIMES.hourJump('1', 0, finance, 0), at('13:00'));
  assert.equal(TIMES.hourJump('11', at('13:00'), finance, 0), at('11:00'));
  assert.equal(TIMES.hourJump('1', at('11:00'), finance, at('11:00')), at('13:00'));
  assert.equal(TIMES.hourJump('11', at('13:00'), finance, at('11:00')), at('23:00'));
  // Finance "12" twice: 12:00 PM both times
  assert.equal(TIMES.hourJump('12', at('13:00'), finance, 0), at('12:00'));
  assert.equal(TIMES.hourJump('12', at('13:00'), finance, at('12:00')), at('12:00'));
});

await check('M7 words: "when · who" — the dot only between two parts (code review N4)', () => {
  assert.equal(SHARED.historyWhen('Oct 22', 'Jeffrey Berg'), 'Oct 22 · Jeffrey Berg');
  assert.equal(SHARED.historyWhen('', 'Staff'), 'Staff'); // no date (missing or unreadable)
  assert.equal(SHARED.historyWhen('Oct 13', null), 'Oct 13'); // no name
  assert.equal(SHARED.historyWhen('', ''), '');
  assert.equal(SHARED.historyCount(1), 'History · 1 change');
  assert.equal(SHARED.historyCount(3), 'History · 3 changes');
});

await check('M7 dates: one reading for showing and sorting — milliseconds and Dates to the millisecond, a school date at local midnight, missing dates last (code re-check)', () => {
  const t = Date.UTC(2026, 9, 22, 16, 5, 0); // Oct 22, 2026, 12:05 PM in Massachusetts
  // Milliseconds and a Date show the same date as the same moment written as text …
  assert.equal(HISTORY.historyDate(t), 'Oct 22');
  assert.equal(HISTORY.historyDate(new Date(t)), 'Oct 22');
  assert.equal(HISTORY.historyDate('2026-10-22T16:05:00Z'), 'Oct 22');
  // … and sort by their real time: milliseconds as they are, a Date to the millisecond
  assert.equal(HISTORY.momentOf(t).getTime(), t);
  assert.equal(HISTORY.momentOf(new Date(t + 500)).getTime(), t + 500);
  const order = (rows) => [...rows].sort(HISTORY.newestFirst).map((row) => row.id);
  assert.deepEqual(order([{ id: 'a', at: new Date(t) }, { id: 'b', at: new Date(t + 500) }]), ['b', 'a']);
  // Every kind together, newest first; missing and unreadable last, in the section's order
  assert.deepEqual(
    order([
      { id: 'missing', at: null },
      { id: 'school date Oct 21', at: '2026-10-21' },
      { id: 'ms Oct 22 12:05', at: t },
      { id: 'unreadable', at: 'not a date' },
      { id: 'text Oct 23', at: '2026-10-23T13:00:00Z' },
      { id: 'Date Oct 22 12:06', at: new Date(t + 60000) },
      { id: 'blank', at: '' },
    ]),
    ['text Oct 23', 'Date Oct 22 12:06', 'ms Oct 22 12:05', 'school date Oct 21', 'missing', 'unreadable', 'blank'],
  );
  // A school date is midnight on this computer's calendar, and shows its own day
  assert.equal(HISTORY.momentOf('2026-10-22').getTime(), new Date(2026, 9, 22).getTime());
  assert.equal(HISTORY.historyDate('2026-10-22'), 'Oct 22');
  assert.equal(HISTORY.historyDate('2026-10-01'), 'Oct 1');
  // Missing or unreadable: no date shown (the line then says only who), never a 1970 date
  for (const at of [null, undefined, '', 'not a date']) {
    assert.equal(HISTORY.momentOf(at), null);
    assert.equal(HISTORY.historyDate(at), '');
  }
  assert.equal(SHARED.historyWhen(HISTORY.historyDate(null), 'Staff'), 'Staff');
});

// ======================= M5 — the QR helper (rulebook v1.015, v1.106) =======================

await check('M5 QR: the same QR picture as the four copies today, for each section\'s link', () => {
  const pairs = [
    [registrationLink('p4w9tdkm'), cbQrSvgDataUrl('p4w9tdkm')], // Color Belt
    [starRegistrationLink('fa2kxm7p'), starQrSvgDataUrl('fa2kxm7p')], // Star
    [campLink('k7m2qp4x'), campQrSvgDataUrl('k7m2qp4x')], // Camps
    [blackBeltLink('w6em58ap'), bbQrSvgDataUrl('w6em58ap')], // Black Belt
  ];
  for (const [link, today] of pairs) {
    assert.ok(link.startsWith('https://tkd-dashboard.pages.dev/'), link);
    assert.ok(today.startsWith('data:image/svg+xml;charset=utf-8,'), 'today\'s picture exists');
    assert.equal(QR.qrSvgDataUrl(link), today, link);
  }
});

await check('M5 QR: only a finished web link gets a picture', () => {
  for (const bad of [null, undefined, '', 'p4w9tdkm', 'tkd-dashboard.pages.dev/register/p4w9tdkm', 'javascript:alert(1)', 'https://a b', 42, {}]) {
    assert.equal(QR.qrSvgDataUrl(bad), '', String(bad));
  }
  assert.ok(QR.qrSvgDataUrl('http://localhost:5190/register/p4w9tdkm').startsWith('data:image/svg+xml'));
});

await check('M5 QR: the PNG is exactly 1024 × 1024 pixels, whole pixels per square, the code in the middle', () => {
  // Every QR size the links can have (the library makes 21 to 177 squares per side)
  for (let modules = 21; modules <= 177; modules += 4) {
    const { size, cell, offset } = QR.qrPngLayout(modules);
    assert.equal(size, 1024);
    assert.ok(Number.isInteger(cell) && cell >= 1, `whole pixels per square (${modules})`);
    assert.ok(offset >= 4 * cell, `at least the 4-square quiet zone (${modules})`);
    assert.ok(offset + modules * cell <= size - 4 * cell, `the quiet zone on the far side too (${modules})`);
    assert.ok(Math.abs(size - (offset + modules * cell) - offset) <= 1, `in the middle (${modules})`);
  }
  // A registration link's code (33 squares): 24 pixels per square
  assert.deepEqual(QR.qrPngLayout(33), { size: 1024, cell: 24, offset: 116 });
  assert.equal(QR.QR_PNG_SIZE, 1024);
});

await check('M5 QR: the file name is "[event] - [school] QR code.png" with a plain hyphen', () => {
  assert.equal(QR.qrFileName('November Children Testing', 'Worcester'), 'November Children Testing - Worcester QR code.png');
  assert.equal(QR.qrFileName('Fall Star Testing', 'Shrewsbury'), 'Fall Star Testing - Shrewsbury QR code.png');
  assert.equal(QR.qrFileName('April Vacation Camp', null), 'April Vacation Camp QR code.png'); // one link, both schools
  assert.equal(QR.qrFileName('April Vacation Camp'), 'April Vacation Camp QR code.png');
  assert.ok(!QR.qrFileName('A', 'B').includes('–') && !QR.qrFileName('A', 'B').includes('—'), 'no dash, a plain hyphen');
  // Characters a file name can't hold are dropped; runs of spaces become one
  assert.equal(QR.qrFileName('Spring: 2027 / "Black Belt"?', '  Worcester  '), 'Spring 2027 Black Belt - Worcester QR code.png');
  assert.equal(QR.qrFileName('', ''), 'QR code.png');
  assert.equal(QR.qrFileName(null, null), 'QR code.png');
});

await check('M5 QR: outside a browser the PNG answers null (no canvas), never throws', async () => {
  assert.equal(await QR.qrPngBlob('https://tkd-dashboard.pages.dev/register/p4w9tdkm'), null);
  assert.equal(await QR.qrPngBlob('not a link'), null);
});

// ======================= M5 — the two-school Download name (rulebook v1.111) =======================
// What screen readers say and voice control listens for must hold the button's own words, in order
// (WCAG 2.5.3, "label in name"), so Download keeps its words and adds the school after them.
await check('M5 words: with two schools, Download\'s name starts with its own words ("Download QR code, Worcester")', () => {
  assert.equal(SHARED.downloadSchoolQr('Worcester'), 'Download QR code, Worcester');
  assert.equal(SHARED.downloadSchoolQr('Shrewsbury'), 'Download QR code, Shrewsbury');
  assert.ok(SHARED.downloadSchoolQr('Worcester').startsWith(SHARED.DOWNLOAD_QR));
});

console.log(`${count} groups of checks ran.`);
console.log('ALL SHARED PARTS CHECKS PASSED');
