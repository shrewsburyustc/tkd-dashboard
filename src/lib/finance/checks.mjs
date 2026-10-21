// checks.mjs — automatic checks for the Finance data layer. Run:  node src/lib/finance/checks.mjs
// Why it exists: financeRules.js, csv.js and the preview database (mockFinance.js) carry rules
// that must match the real database (migration 0011, contract 0011 §1.3–§1.4, §2) exactly:
// the correction "chains", Matches / Short / Over, CSV quoting and the formula guard, the refund
// cards, school time and the reminder, and every function's statuses. These plain `assert`
// checks run in well under a second without a browser or a database and print
// ALL FINANCE LIB CHECKS PASSED.
// The chain CASE TABLE below is the one the SQL tests (0011_tests.sql §2) replay on both sources.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  chainItems, buildChains, summarize, expectedCash, expectedValues, cardsFor, groupItems, compareCount, closeResults,
  anyDifference, countsInTotals, schoolNow, schoolToday, weekdayOf, timeToMinutes, isReminderTime, isReminderDue,
  REMINDER_TIME_CHOICES, monthOf, daysOfMonth, daysBetweenInclusive, fingerprintOf, toCsv as toCsvFromRules,
} from './financeRules.js';
import { toCsv, guardFormula, quoteCell, centsToCsvNumber, csvFileName, CSV_COLUMNS, CSV_BOM } from './csv.js';
import { createFinanceBackend, FINANCE_RPC_NAMES, FINANCE_WRITE_RPC_NAMES } from '../mockFinance.js';
import { addDays } from '../testing/eventRules.js';
import { newDays, unclosedPairsFrom, monthsToLoad, keepRecent, createSeenStore, pairKey, SEEN_KEY } from './reminderAck.js';

let count = 0;
function check(label, fn) {
  try {
    fn();
    count += 1;
  } catch (error) {
    console.error(`FAILED: ${label}`);
    throw error;
  }
}

// ======================= The chain case table (§1.3) =======================
// Rows are written short: [id, kind, cents, method, paid_on, recorded_at (seconds into the day,
// UTC — only differences matter), recorded_by, reverses id]. Every case runs on BOTH sources.
// expect: one line per item — [day, state, row shown, { other fields to compare }] (order free).
const A = 'login-a';
const B = 'login-b';
const D1 = '2026-10-01';
const D2 = '2026-10-02';
const D3 = '2026-10-03';
const D20 = '2026-10-20';

const CASES = [
  {
    name: 'plain payment → counted',
    rows: [['p1', 'payment', 6500, 'cash', D1, 100, A, null]],
    expect: [[D1, 'counted', 'p1', { amount_cents: 6500, changed_by_name: null }]],
  },
  {
    name: 'undone by another person → undone on its day',
    rows: [['p1', 'payment', 6500, 'cash', D1, 100, A, null], ['r1', 'reversal', -6500, 'cash', D2, 105, B, 'p1']],
    expect: [[D1, 'undone', 'p1', { changed_by_name: 'name-login-b', changed_on: D2 }]],
  },
  {
    name: 'undone by the same person within 10 s → hidden',
    rows: [['p1', 'payment', 6500, 'card', D1, 100, A, null], ['r1', 'reversal', -6500, 'card', D1, 110, A, 'p1']],
    expect: [[D1, 'hidden', 'p1', {}]],
  },
  {
    name: 'undone by the same person after 11 s → undone',
    rows: [['p1', 'payment', 6500, 'card', D1, 100, A, null], ['r1', 'reversal', -6500, 'card', D1, 111, A, 'p1']],
    expect: [[D1, 'undone', 'p1', {}]],
  },
  {
    name: 'undone by another person within 5 s → undone (not hidden)',
    rows: [['p1', 'payment', 6500, 'card', D1, 100, A, null], ['r1', 'reversal', -6500, 'card', D1, 105, B, 'p1']],
    expect: [[D1, 'undone', 'p1', {}]],
  },
  {
    name: 'edited once (amount) → edited with was',
    rows: [['p1', 'payment', 7000, 'check', D1, 100, A, null], ['r1', 'reversal', -7000, 'check', D3, 900, B, 'p1'], ['n1', 'payment', 6500, 'check', D1, 900, B, null]],
    expect: [[D1, 'edited', 'n1', { amount_cents: 6500, was_amount_cents: 7000, was_method: 'check', changed_by_name: 'name-login-b', changed_on: D3, moved_from: null }]],
  },
  {
    name: 'edited twice → shown once, was = the first row',
    rows: [
      ['p1', 'payment', 7000, 'cash', D1, 100, A, null],
      ['r1', 'reversal', -7000, 'cash', D2, 200, B, 'p1'], ['n1', 'payment', 6800, 'cash', D1, 200, B, null],
      ['r2', 'reversal', -6800, 'cash', D3, 300, B, 'n1'], ['n2', 'payment', 6500, 'cash', D1, 300, B, null],
    ],
    expect: [[D1, 'edited', 'n2', { amount_cents: 6500, was_amount_cents: 7000, changed_on: D3 }]],
  },
  {
    name: 'method-only edit → edited',
    rows: [['p1', 'payment', 6500, 'cash', D1, 100, A, null], ['r1', 'reversal', -6500, 'cash', D1, 150, B, 'p1'], ['n1', 'payment', 6500, 'card', D1, 150, B, null]],
    expect: [[D1, 'edited', 'n1', { method: 'card', was_method: 'cash', was_amount_cents: 6500 }]],
  },
  {
    name: 'edited to another date → moved_out + moved_in',
    rows: [['p1', 'payment', 6500, 'cash', D1, 100, A, null], ['r1', 'reversal', -6500, 'cash', D3, 900, B, 'p1'], ['n1', 'payment', 6500, 'cash', D2, 900, B, null]],
    expect: [
      [D1, 'moved_out', 'p1', { moved_to: D2, amount_cents: 6500 }],
      [D2, 'moved_in', 'n1', { moved_from: D1, was_amount_cents: 6500 }],
    ],
  },
  {
    name: 'edited across three dates → the middle day gets moved_out too',
    rows: [
      ['p1', 'payment', 6500, 'cash', D1, 100, A, null],
      ['r1', 'reversal', -6500, 'cash', D2, 200, B, 'p1'], ['n1', 'payment', 6500, 'cash', D2, 200, B, null],
      ['r2', 'reversal', -6500, 'cash', D3, 300, B, 'n1'], ['n2', 'payment', 6500, 'check', D3, 300, B, null],
    ],
    expect: [
      [D1, 'moved_out', 'p1', { moved_to: D3 }],
      [D2, 'moved_out', 'n1', { moved_to: D3 }],
      [D3, 'moved_in', 'n2', { moved_from: D1, was_method: 'cash' }],
    ],
  },
  {
    name: 'moved then undone → both days show undone',
    rows: [
      ['p1', 'payment', 6500, 'cash', D1, 100, A, null],
      ['r1', 'reversal', -6500, 'cash', D2, 200, B, 'p1'], ['n1', 'payment', 6500, 'cash', D2, 200, B, null],
      ['r2', 'reversal', -6500, 'cash', D3, 205, B, 'n1'],
    ],
    expect: [[D1, 'undone', 'p1', { changed_on: D3 }], [D2, 'undone', 'n1', { changed_on: D3 }]],
  },
  {
    name: 'undo right after an edit by the same person → undone, never hidden (the chain has an edit)',
    rows: [
      ['p1', 'payment', 6500, 'cash', D1, 100, A, null],
      ['r1', 'reversal', -6500, 'cash', D1, 101, A, 'p1'], ['n1', 'payment', 6000, 'cash', D1, 101, A, null],
      ['r2', 'reversal', -6000, 'cash', D1, 102, A, 'n1'],
    ],
    expect: [[D1, 'undone', 'p1', {}]],
  },
  {
    name: 'same time but another login → not an edit (undone + a separate payment)',
    rows: [['p1', 'payment', 6500, 'cash', D1, 100, A, null], ['r1', 'reversal', -6500, 'cash', D1, 300, A, 'p1'], ['n1', 'payment', 6500, 'card', D1, 300, B, null]],
    expect: [[D1, 'undone', 'p1', {}], [D1, 'counted', 'n1', { payment_id: 'n1' }]],
  },
  {
    name: 'no login on either row → not an edit (SQL null = null is not true)',
    rows: [['p1', 'payment', 6500, 'cash', D1, 100, null, null], ['r1', 'reversal', -6500, 'cash', D1, 300, null, 'p1'], ['n1', 'payment', 6500, 'card', D1, 300, null, null]],
    expect: [[D1, 'undone', 'p1', {}], [D1, 'counted', 'n1', { payment_id: 'n1' }]],
  },
  {
    name: 'range building: paid Oct 1, undone Oct 20 → undone on Oct 1',
    rows: [['p1', 'payment', 6500, 'cash', D1, 100, A, null], ['r1', 'reversal', -6500, 'cash', D20, 99999, B, 'p1']],
    expect: [[D1, 'undone', 'p1', { changed_on: D20 }]],
  },
  {
    name: 'Star refund → counted, kind refund, negative',
    starOnly: true,
    rows: [['p1', 'payment', 14000, 'cash', D1, 100, A, null], ['f1', 'refund', -3500, 'cash', D2, 500, B, null]],
    expect: [[D1, 'counted', 'p1', { kind: 'payment' }], [D2, 'counted', 'f1', { kind: 'refund', amount_cents: -3500, payment_id: 'f1' }]],
  },
  {
    name: 'Star refund undone by another person → refund undone',
    starOnly: true,
    rows: [['f1', 'refund', -3500, 'check', D2, 500, B, null], ['r1', 'reversal', 3500, 'check', D3, 900, A, 'f1']],
    expect: [[D2, 'undone', 'f1', { kind: 'refund' }]],
  },
  {
    name: 'Star refund undone by the same person within 10 s → hidden',
    starOnly: true,
    rows: [['f1', 'refund', -3500, 'cash', D2, 500, B, null], ['r1', 'reversal', 3500, 'cash', D2, 503, B, 'f1']],
    expect: [[D2, 'hidden', 'f1', {}]],
  },
];

// Expands a short row for one source.
function rowFor(source, [id, kind, cents, method, paidOn, seconds, by, reverses]) {
  return {
    id, [source === 'star' ? 'candidate_id' : 'registration_id']: 'owner-1', kind, amount_cents: cents, method, paid_on: paidOn,
    recorded_at: new Date(Date.UTC(2026, 9, 1) + seconds * 1000).toISOString(), recorded_by: by,
    recorded_by_name: by ? `name-${by}` : 'Desk', reverses_payment_id: reverses, source,
  };
}

for (const c of CASES) {
  for (const source of c.starOnly ? ['star'] : ['color_belt', 'star']) {
    check(`chain (${source}): ${c.name}`, () => {
      // Shuffle the rows: the result must not depend on their order.
      const rows = c.rows.map((r) => rowFor(source, r)).reverse();
      const items = chainItems(rows);
      assert.equal(items.length, c.expect.length, `item count for ${c.name}`);
      for (const [day, state, rowId, fields] of c.expect) {
        const item = items.find((i) => i.day === day && i.state === state && i.row_id === rowId);
        assert.ok(item, `${c.name}: expected ${state} on ${day} showing ${rowId}; got ${JSON.stringify(items.map((i) => [i.day, i.state, i.row_id]))}`);
        assert.equal(item.source, source);
        // payment_id is always the chain's first row (the case's first row unless the case says otherwise).
        assert.equal(item.payment_id, fields.payment_id ?? c.rows[0][0], 'payment_id');
        for (const [k, v] of Object.entries(fields)) assert.deepEqual(item[k], v, `${c.name}: ${k}`);
      }
    });
  }
}

check('chain: rule 5 — only counted / edited / moved_in add to totals', () => {
  assert.deepEqual(['counted', 'edited', 'moved_in', 'moved_out', 'undone', 'hidden'].map(countsInTotals), [true, true, true, false, false, false]);
});

check('chain: buildChains follows edits and ignores orphans', () => {
  const rows = CASES[6].rows.map((r) => rowFor('star', r));
  const [chain] = buildChains(rows);
  assert.equal(chain.first.id, 'p1');
  assert.equal(chain.final.id, 'n2');
  assert.equal(chain.edits.length, 2);
  assert.equal(chain.undo, null);
  assert.deepEqual(buildChains([rowFor('star', ['r9', 'reversal', 100, 'cash', D1, 1, A, 'missing'])]), []);
});

// ======================= Totals, expected, cards, groups =======================

const item = (kind, method, cents, state = 'counted') => ({ kind, method, amount_cents: cents, state });
const DAY = [
  item('payment', 'cash', 6500), item('payment', 'cash', 14000), item('payment', 'check', 7000), item('payment', 'card', 6500),
  item('refund', 'cash', -3500), item('refund', 'check', -14000), item('payment', 'cash', 5000, 'undone'), item('payment', 'cash', 5000, 'moved_out'),
  item('payment', 'check', 6500, 'edited'),
];

check('summarize: payments by method, refunds apart, net = in + refunds', () => {
  const { totals, refunds } = summarize(DAY);
  assert.deepEqual(totals.cash, { count: 2, cents: 20500 });
  assert.deepEqual(totals.check, { count: 2, cents: 13500 });
  assert.deepEqual(totals.card, { count: 1, cents: 6500 });
  assert.equal(totals.count, 5);
  assert.equal(totals.in_cents, 40500);
  assert.deepEqual(refunds, { count: 2, cents: -17500, cash_cents: -3500, check_cents: -14000 });
  assert.equal(totals.net_cents, 23000);
  assert.equal(totals.total_cents, 23000);
});

check('expected: cash in − cash refunded; checks = check PAYMENTS only; may be negative', () => {
  const { totals, refunds } = summarize(DAY);
  assert.equal(expectedCash(totals, refunds), 17000);
  assert.deepEqual(expectedValues(totals, refunds), { count: 7, cashCents: 17000, checksCount: 2, checksCents: 13500, cardCents: 6500 });
  const onlyRefunds = summarize([item('refund', 'cash', -5000), item('refund', 'check', -14000)]);
  assert.equal(expectedCash(onlyRefunds.totals, onlyRefunds.refunds), -5000); // "Cash taken out of the drawer"
  assert.equal(expectedValues(onlyRefunds.totals, onlyRefunds.refunds).checksCount, 0);
});

check('cardsFor: own = money in, total net; in = net per method', () => {
  const { totals, refunds } = summarize(DAY);
  const own = cardsFor(totals, refunds, 'own');
  assert.deepEqual(own.total, { cents: 23000, count: 5, sub: 'after_refunds', refundCents: 17500 });
  assert.deepEqual(own.cash, { cents: 20500, count: 2, refundCents: 3500 });
  assert.deepEqual(own.check, { cents: 13500, count: 2, refundCents: 14000 });
  assert.deepEqual(own.card, { cents: 6500, count: 1, refundCents: 0 });
  const inside = cardsFor(totals, refunds, 'in');
  assert.equal(inside.total.cents, 23000);
  assert.equal(inside.cash.cents, 17000);
  assert.equal(inside.check.cents, -500);
  assert.equal(inside.card.cents, 6500);
  const plain = summarize([item('payment', 'cash', 6500)]);
  assert.equal(cardsFor(plain.totals, plain.refunds).total.sub, 'payments');
});

check('groupItems: drawer order, refunds at the end or inside, empty groups dropped', () => {
  const own = groupItems(DAY, 'own');
  assert.deepEqual(own.map((g) => g.key), ['cash', 'check', 'card', 'refunds']);
  assert.deepEqual([own[0].count, own[0].cents, own[0].items.length], [2, 20500, 4]); // undone + moved_out listed, not counted
  assert.deepEqual([own[3].refundCount, own[3].cents], [2, -17500]);
  const inside = groupItems(DAY, 'in');
  assert.deepEqual(inside.map((g) => g.key), ['cash', 'check', 'card']);
  assert.deepEqual([inside[0].count, inside[0].refundCount, inside[0].cents], [2, 1, 17000]);
  assert.deepEqual(groupItems([item('payment', 'card', 100), item('payment', 'cash', 5, 'hidden')]).map((g) => g.key), ['card']);
  assert.deepEqual(groupItems([item('payment', 'check', 100, 'undone')]).map((g) => [g.key, g.count, g.cents]), [['check', 0, 0]]);
});

// ======================= Counting =======================

check('compareCount: matches / short / over to the cent', () => {
  assert.deepEqual(compareCount(32000, 32000), { result: 'matches', diffCents: 0 });
  assert.deepEqual(compareCount(32000, 30000), { result: 'short', diffCents: 2000 });
  assert.deepEqual(compareCount(32000, 32001), { result: 'over', diffCents: 1 });
  assert.deepEqual(compareCount(-5000, -5000), { result: 'matches', diffCents: 0 });
  assert.deepEqual(compareCount(-5000, -4000), { result: 'over', diffCents: 1000 }); // less taken out than expected
  assert.deepEqual(compareCount(0, 0), { result: 'matches', diffCents: 0 });
});

check('closeResults: checks have two parts; anyDifference', () => {
  const expected = { cashCents: 32000, checksCount: 2, checksCents: 21000, cardCents: 13500 };
  const same = closeResults(expected, { cashCents: 32000, checksCount: 2, checksCents: 21000, cardCents: 13500 });
  assert.equal(anyDifference(same), false);
  const r = closeResults(expected, { cashCents: 30000, checksCount: 2, checksCents: 20500, cardCents: 13500 });
  assert.deepEqual(r.cash, { result: 'short', diffCents: 2000 });
  assert.deepEqual(r.checks, { result: 'short', diffCents: 500, countResult: 'matches', countDiff: 0 });
  assert.equal(r.card.result, 'matches');
  assert.equal(anyDifference(r), true);
  const countOnly = closeResults(expected, { cashCents: 32000, checksCount: 3, checksCents: 21000, cardCents: 13500 });
  assert.deepEqual(countOnly.checks, { result: 'over', diffCents: 0, countResult: 'over', countDiff: 1 });
});

// ======================= CSV =======================

check('csv: quoting (RFC 4180), CRLF, formula guard on text only, plain amounts', () => {
  assert.equal(quoteCell('plain'), 'plain');
  assert.equal(quoteCell('a,b'), '"a,b"');
  assert.equal(quoteCell('say "hi"'), '"say ""hi"""');
  assert.equal(quoteCell('two\nlines'), '"two\nlines"');
  assert.equal(quoteCell('cr\rhere'), '"cr\rhere"');
  // Formula starts: = + - @ (also after spaces, also full-width), a tab or a carriage return.
  const bads = ['=SUM(A1)', '+1', '-2', '@cmd', '\tx', '\rx', '  =1+1', ' @x', '\u3000=x', '\uFF1DSUM(A1)', '\uFF0B1', '\uFF0D2', '\uFF20cmd', '  \uFF1Dx', ' \t=x'];
  for (const bad of bads) assert.equal(guardFormula(bad), `'${bad}`, JSON.stringify(bad));
  for (const fine of ['Mia', ' Mia', 'O\'Neil', 'Ann-Marie', 'a=b', '', ' ']) assert.equal(guardFormula(fine), fine, JSON.stringify(fine));
  assert.equal(centsToCsvNumber(-3500), '-35.00');
  assert.equal(centsToCsvNumber(6505), '65.05');
  assert.equal(centsToCsvNumber(0), '0.00');
  assert.equal(centsToCsvNumber(123456789), '1234567.89');
  const rows = [
    { day: D1, school: 'shrewsbury', time: '10:04', first_name: '=HYPERLINK("x")', last_name: 'O"Neil, Jr', what: 'star', event_date: '2026-11-14', kind: 'refund', method: 'cash', amount_cents: -3500, counted_cents: -3500, recorded_by_name: '-Staff', state: 'counted', note: null },
    { day: D2, school: 'shrewsbury', time: '11:00', first_name: 'Line\nBreak', last_name: '@x', what: 'color_belt', event_date: '2026-10-29', kind: 'payment', method: 'check', amount_cents: 6500, counted_cents: 0, recorded_by_name: 'Jeffrey', state: 'undone', note: 'undone by Jeffrey on 2026-10-26' },
  ];
  const text = toCsv(rows);
  assert.equal(toCsvFromRules, toCsv);
  assert.ok(text.startsWith(CSV_BOM), 'the file starts with the UTF-8 byte-order mark');
  assert.equal(CSV_BOM, '\uFEFF');
  assert.equal((text.match(/\uFEFF/g) ?? []).length, 1);
  const lines = text.slice(1).split('\r\n');
  assert.equal(lines.at(-1), ''); // ends with CRLF
  assert.equal(lines[0], 'Date,School,Time,First name,Last name,For,Testing date,Kind,Paid by,Amount,Counted in total,Recorded by,Status,Note');
  assert.equal(lines[1], `${D1},Shrewsbury,10:04,"'=HYPERLINK(""x"")","O""Neil, Jr",Star testing,2026-11-14,Refund,Cash,-35.00,-35.00,'-Staff,Counted,`);
  assert.ok(text.includes(`"Line\nBreak",'@x,Color belt testing`));
  assert.ok(text.includes(',65.00,0.00,Jeffrey,Undone,undone by Jeffrey on 2026-10-26\r\n'));
  assert.equal(text.split('\r\n').length, 4); // header + 2 rows + the empty end (the \n inside quotes isn't a line end)
  const custom = toCsv(rows.slice(0, 1), { headers: { day: 'Day' }, labels: { state: { counted: 'OK' } } });
  assert.ok(custom.startsWith(`${CSV_BOM}Day,School`));
  assert.ok(toCsv([{ amount_cents: -3500, counted_cents: 0, first_name: 'Jos\u00e9' }]).includes(',Jos\u00e9,,,,,,-35.00,0.00,'), 'amounts stay plain numbers');
  assert.ok(custom.includes(',OK,'));
  assert.equal(CSV_COLUMNS.length, 14);
  assert.equal(csvFileName('Shrewsbury', '2026-10-01', '2026-10-31'), 'Shrewsbury-2026-10-01-to-2026-10-31.csv');
});

// ======================= School time and the reminder =======================

check('school time: America/New_York, DST, ISO weekday', () => {
  // 04:59:59 UTC on Nov 14 is still Nov 13, 11:59 PM in Massachusetts (winter, UTC−5).
  assert.deepEqual(schoolNow(Date.UTC(2026, 10, 14, 4, 59, 59)), { day: '2026-11-13', time: '23:59', minutes: 1439, weekday: 5 });
  // Summer (UTC−4): 23:30 UTC on Jul 4 is 7:30 PM.
  assert.equal(schoolNow(new Date(Date.UTC(2026, 6, 4, 23, 30))).time, '19:30');
  assert.equal(schoolToday(Date.UTC(2026, 9, 24, 3, 0)), '2026-10-23');
  assert.equal(weekdayOf('2026-10-24'), 6); // Saturday
  assert.equal(weekdayOf('2026-10-25'), 7); // Sunday
  assert.equal(weekdayOf('2026-10-26'), 1); // Monday
  assert.equal(weekdayOf('nope'), null);
  assert.equal(timeToMinutes('19:30'), 1170);
  assert.equal(timeToMinutes('19:30:00'), 1170);
  assert.equal(timeToMinutes('24:00'), null);
});

check('reminder times: 11:00–23:00 in 15-minute steps', () => {
  assert.equal(REMINDER_TIME_CHOICES[0], '11:00');
  assert.equal(REMINDER_TIME_CHOICES.at(-1), '23:00');
  assert.equal(REMINDER_TIME_CHOICES.length, 49);
  assert.ok(isReminderTime('19:45'));
  assert.ok(!isReminderTime('19:40'));
  assert.ok(!isReminderTime('10:45'));
  assert.ok(!isReminderTime('23:15'));
});

check('isReminderDue: weekday times, Off, minute boundary, payments, closed, switch', () => {
  const times = [{ school: 'shrewsbury', weekday: 6, remind_at: '13:00' }, { school: 'worcester', weekday: 6, remind_at: '13:30' }, { school: 'shrewsbury', weekday: 7, remind_at: null }];
  const sat = (minutes) => ({ day: '2026-10-24', weekday: 6, minutes });
  assert.equal(isReminderDue(times, sat(12 * 60 + 59), { school: 'shrewsbury' }), false);
  assert.equal(isReminderDue(times, sat(13 * 60), { school: 'shrewsbury' }), true);
  assert.equal(isReminderDue(times, sat(13 * 60), { school: 'worcester' }), false);
  assert.equal(isReminderDue(times, { weekday: 7, minutes: 1400 }, { school: 'shrewsbury' }), false); // Off
  assert.equal(isReminderDue(times, sat(1000), { school: 'shrewsbury', hasPayments: false }), false);
  assert.equal(isReminderDue(times, sat(1000), { school: 'shrewsbury', closed: true }), false);
  assert.equal(isReminderDue(times, sat(1000), { school: 'shrewsbury', reminderOn: false }), false);
  // 7:29:59 PM vs 7:30:00 PM New York (winter): a real Date works too.
  const t2 = [{ school: 'x', weekday: 5, remind_at: '19:30' }]; // Fri Nov 6 2026, EST (UTC−5)
  assert.equal(isReminderDue(t2, new Date(Date.UTC(2026, 10, 7, 0, 29, 59)), { school: 'x' }), false);
  assert.equal(isReminderDue(t2, new Date(Date.UTC(2026, 10, 7, 0, 30, 0)), { school: 'x' }), true);
});

check('months and ranges', () => {
  assert.equal(monthOf('2026-10-24'), '2026-10-01');
  assert.equal(daysOfMonth('2026-02-10').length, 28);
  assert.deepEqual(daysOfMonth('2026-10-01', '2026-10-03'), ['2026-10-01', '2026-10-02', '2026-10-03']);
  assert.equal(daysBetweenInclusive('2026-10-01', '2026-10-31'), 31);
  assert.equal(daysBetweenInclusive('2025-10-19', '2026-10-19'), 366);
});

check('fingerprint: order-free, changes on a method-only edit, ignores hidden', () => {
  const a = { row_id: 'r1', amount_cents: 6500, method: 'cash', state: 'counted' };
  const b = { row_id: 'r2', amount_cents: 7000, method: 'check', state: 'undone' };
  assert.equal(fingerprintOf([a, b]), fingerprintOf([b, a]));
  assert.notEqual(fingerprintOf([a, b]), fingerprintOf([{ ...a, method: 'card' }, b]));
  assert.equal(fingerprintOf([a]), fingerprintOf([a, { ...b, state: 'hidden' }]));
  assert.match(fingerprintOf([]), /^[0-9a-f]{16}$/);
});

// ======================= The preview database (mockFinance.js) =======================
// A fixed clock: Saturday Oct 24 2026, 2:00 PM in Massachusetts (18:00 UTC, summer time).
const T = '2026-10-24';
let clock = Date.parse('2026-10-24T18:00:00.000Z');
let fakeToday = T;
let financeStore = null;
const at = (day, hhmm) => {
  // EDT (UTC−4) until Nov 1 2026.
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.parse(`${day}T00:00:00Z`) + ((h + 4) * 60 + m) * 60000).toISOString();
};
const cbStore = {
  events: [{ id: 'e1', location_code: 'shrewsbury', name: 'October Testing', testing_date: '2026-10-29' }, { id: 'e2', location_code: 'worcester', name: 'Worcester Testing', testing_date: '2026-11-20' }],
  registrations: [
    { id: 'g1', event_id: 'e1', first_name: 'Mia', last_name: 'Chen', date_of_birth: '2015-01-01', email: 'x@y.z' },
    { id: 'g2', event_id: 'e1', first_name: 'Lucas', last_name: 'Patel' },
    { id: 'g3', event_id: 'e2', first_name: 'Noah', last_name: 'Kim' },
  ],
  payments: [
    { id: 'c1', registration_id: 'g1', kind: 'payment', amount_cents: 6500, method: 'cash', paid_on: T, recorded_at: at(T, '10:04'), recorded_by: 'desk', recorded_by_name: 'Staff', reverses_payment_id: null },
    { id: 'c2', registration_id: 'g2', kind: 'payment', amount_cents: 7000, method: 'check', paid_on: T, recorded_at: at(T, '10:21'), recorded_by: 'desk', recorded_by_name: 'Staff', reverses_payment_id: null },
    { id: 'c3', registration_id: 'g3', kind: 'payment', amount_cents: 6500, method: 'card', paid_on: addDays(T, -1), recorded_at: at(addDays(T, -1), '18:00'), recorded_by: 'desk', recorded_by_name: 'Staff', reverses_payment_id: null },
  ],
};
let idN = 0;
const finance = createFinanceBackend({
  loadStore: () => financeStore,
  saveStore: (s) => { financeStore = JSON.parse(JSON.stringify(s)); },
  readColorBelt: () => JSON.parse(JSON.stringify(cbStore)),
  now: () => clock,
  today: () => fakeToday,
  newId: () => { idN += 1; return randomUUID(); },
});
const ADMIN_CTX = { signedIn: true, hasDataAccess: true, isAdmin: true, actorName: 'Jeffrey Berg', userId: 'admin-1' };
const STAFF_CTX = { signedIn: true, hasDataAccess: true, isAdmin: false, actorName: 'Staff', userId: 'desk-1' };
const call = (name, args, ctx = ADMIN_CTX) => {
  const res = finance.rpc(name, args, ctx);
  assert.equal(res.error, null, `${name}: ${res.error?.message}`);
  return res.data;
};
const dayArgs = (school, day = T) => ({ p_location_code: school, p_day: day });

// No answer may ever contain a login id, a date of birth or an email (contract §1.1, §2 test 10).
const FORBIDDEN_KEYS = new Set(['recorded_by', 'downloaded_by', 'withdrawn_by', 'created_by', 'updated_by', 'date_of_birth', 'email', 'email_for_results', 'signature', 'row_id', 'owner_id', 'chain_started_at', 'event_name_internal']);
function assertClean(value, where) {
  if (Array.isArray(value)) return value.forEach((v) => assertClean(v, where));
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      assert.ok(!FORBIDDEN_KEYS.has(k), `${where}: key ${k} must never be returned`);
      assertClean(v, where);
    }
  }
  if (typeof value === 'string') assert.ok(!/x@y\.z|2015-01-01/.test(value), `${where}: private data leaked`);
}

check('mock: every §1.4 function is there; signed out / no access / staff gates', () => {
  assert.equal(FINANCE_RPC_NAMES.length, 14); // the 13 of §1.4 + finance_export_preview
  assert.ok(FINANCE_WRITE_RPC_NAMES.every((n) => FINANCE_RPC_NAMES.includes(n)));
  assert.equal(finance.rpc('finance_day', dayArgs('shrewsbury'), { signedIn: false }).error.code, '42501');
  assert.equal(finance.rpc('finance_day', { p_day: T }, ADMIN_CTX).error.code, 'PGRST202'); // missing argument
  assert.deepEqual(call('finance_day', dayArgs('shrewsbury'), { ...ADMIN_CTX, hasDataAccess: false }), { status: 'no_access' });
  for (const name of ['finance_history', 'finance_export', 'finance_export_preview', 'finance_settings_get', 'finance_reopen_day', 'finance_set_reminder_on', 'finance_set_reminder_time', 'finance_copy_monday']) {
    const args = Object.fromEntries({
      finance_history: [['p_location_code', null], ['p_month', T]], finance_export: [['p_location_code', 'shrewsbury'], ['p_from', T], ['p_to', T]], finance_export_preview: [['p_location_code', 'shrewsbury'], ['p_from', T], ['p_to', T]],
      finance_settings_get: [], finance_reopen_day: [['p_location_code', 'shrewsbury'], ['p_day', T], ['p_expected_closing_id', randomUUID()]],
      finance_set_reminder_on: [['p_on', true], ['p_expected_version', 1]], finance_set_reminder_time: [['p_location_code', 'shrewsbury'], ['p_weekday', 1], ['p_time', null], ['p_expected_version', 1]],
      finance_copy_monday: [['p_expected_version', 1]],
    }[name]);
    assert.deepEqual(call(name, args, STAFF_CTX), { status: 'not_allowed' }, name);
  }
  assert.deepEqual(call('finance_day', dayArgs('shrewsbury', addDays(T, -1)), STAFF_CTX), { status: 'not_allowed' }); // staff: today only
  assert.deepEqual(call('finance_day_both', { p_day: addDays(T, -1) }, STAFF_CTX), { status: 'not_allowed' });
  assert.deepEqual(call('finance_day', dayArgs('shrewsbury', addDays(T, 1))), { status: 'invalid' }); // future
  assert.deepEqual(call('finance_day', dayArgs('boston')), { status: 'not_found' });
  // Endless or pre-2020 dates → invalid, in every function that takes a date.
  for (const bad of ['infinity', '-infinity', '2019-12-31']) {
    assert.deepEqual(call('finance_day', dayArgs('shrewsbury', bad)), { status: 'invalid' }, bad);
    assert.deepEqual(call('finance_day_both', { p_day: bad }), { status: 'invalid' }, bad);
    assert.deepEqual(call('finance_history', { p_location_code: null, p_month: bad }), { status: 'invalid' }, bad);
    assert.deepEqual(call('finance_close_day', { p_location_code: 'shrewsbury', p_day: bad, p_expected_fingerprint: 'x', p_cash_cents: 0, p_checks_count: 0, p_checks_cents: 0, p_card_cents: 0, p_note: null }), { status: 'invalid' }, bad);
    assert.deepEqual(call('finance_reopen_day', { p_location_code: 'shrewsbury', p_day: bad, p_expected_closing_id: randomUUID() }), { status: 'invalid' }, bad);
    for (const name of ['finance_export', 'finance_export_preview']) {
      assert.deepEqual(call(name, { p_location_code: 'shrewsbury', p_from: bad, p_to: T }), { status: 'invalid' }, `${name} ${bad}`);
      assert.deepEqual(call(name, { p_location_code: 'shrewsbury', p_from: '2020-01-01', p_to: bad }), { status: 'invalid' }, `${name} to ${bad}`);
    }
  }
  assert.equal(call('finance_day', dayArgs('shrewsbury', '2020-01-01')).status, 'ok'); // 2020-01-01 itself is fine
  assert.equal(finance.rpc('finance_day', dayArgs('shrewsbury', 'not a date'), ADMIN_CTX).error.code, '22007'); // like PostgreSQL
});

check('mock: the sample day — totals, refunds, corrections, hidden mis-click, no private data', () => {
  const d = call('finance_day', dayArgs('shrewsbury'), STAFF_CTX);
  assert.equal(d.status, 'ok');
  assertClean(d, 'finance_day');
  // Color Belt: Mia cash 65, Lucas check 70. Star: Ava check 140, Liam cash 140, Mason cash refund −35.
  assert.deepEqual(d.totals.cash, { count: 2, cents: 20500 });
  assert.deepEqual(d.totals.check, { count: 2, cents: 21000 });
  assert.deepEqual(d.refunds, { count: 1, cents: -3500, cash_cents: -3500, check_cents: 0 });
  assert.equal(d.totals.net_cents, 41500 - 3500);
  assert.ok(!d.items.some((i) => i.last_name === 'Park'), 'the 10-second mis-click is hidden');
  assert.equal(d.items.find((i) => i.last_name === 'Rossi').what, 'star');
  assert.equal(d.items.find((i) => i.last_name === 'Chen' && i.source === 'color_belt').time, '10:04');
  assert.equal(d.closing, null);
  assert.equal(d.can_close, true);
  assert.equal(d.can_undo_until, null);
  // Yesterday (admin): the method-only edit, the moved edit coming in, the undone payment.
  const y = call('finance_day', dayArgs('shrewsbury', addDays(T, -1)));
  const state = (last) => y.items.find((i) => i.last_name === last).state;
  assert.deepEqual([state('Adams'), state('Cruz'), state('Bell')], ['edited', 'moved_in', 'undone']);
  assert.equal(y.items.find((i) => i.last_name === 'Cruz').moved_from, addDays(T, -3));
  // T−2: refunds only → closable, cash expected below zero.
  const r = call('finance_day', dayArgs('shrewsbury', addDays(T, -2)));
  assert.equal(r.totals.count, 0);
  assert.equal(r.refunds.count, 2);
  assert.equal(r.can_close, true);
  assert.equal(expectedCash(r.totals, r.refunds), -5000);
  // The private Star candidate counts at their own school (Worcester).
  const w = call('finance_day', dayArgs('worcester', addDays(T, -2)));
  assert.equal(w.items.find((i) => i.last_name === 'Moreno').is_private, true);
});

check('mock: sample closings → History tags and Changed after closing', () => {
  const h = call('finance_history', { p_location_code: 'shrewsbury', p_month: T });
  assert.equal(h.status, 'ok');
  assertClean(h, 'finance_history');
  const tag = (n) => h.days.find((x) => x.day === addDays(T, n));
  assert.equal(h.days[0].day, T); // newest first
  assert.equal(tag(0).tag, 'today_open');
  assert.equal(tag(-1).tag, 'not_closed');
  assert.equal(tag(-2).tag, 'not_closed'); // refund-only day, not closed
  assert.equal(tag(-3).tag, 'changed_after_closing');
  assert.deepEqual([tag(-4).tag, tag(-4).diff_cents, tag(-4).diff_part], ['short', 2000, 'cash']);
  assert.equal(tag(-5).tag, 'closed');
  assert.deepEqual([tag(-6).tag, tag(-6).diff_cents, tag(-6).diff_part], ['over', 500, 'card']);
  assert.equal(tag(-8).tag, 'no_payments');
  const both = call('finance_history', { p_location_code: null, p_month: T });
  assert.equal(both.days.length, h.days.length * 2);
  assert.deepEqual(both.days.slice(0, 2).map((x) => x.school), ['worcester', 'shrewsbury']);
  const moved = call('finance_day', dayArgs('shrewsbury', addDays(T, -3)));
  assert.equal(moved.closing.changed_after, true);
  assert.equal(moved.closing.changed_count, 1);
  assert.equal(moved.items[0].state, 'moved_out');
  assert.deepEqual(call('finance_history', { p_location_code: null, p_month: '2026-11-01' }), { status: 'invalid' });
});

check('mock: close the day — stale, note_required, ok, already_closed, undo, reopen', () => {
  const d = call('finance_day', dayArgs('shrewsbury'), STAFF_CTX);
  const close = (extra, ctx = STAFF_CTX) => call('finance_close_day', {
    p_location_code: 'shrewsbury', p_day: T, p_expected_fingerprint: d.fingerprint,
    p_cash_cents: 17000, p_checks_count: 2, p_checks_cents: 21000, p_card_cents: 0, p_note: null, ...extra,
  }, ctx);
  assert.deepEqual(close({ p_expected_fingerprint: 'nope' }), { status: 'stale' });
  assert.deepEqual(close({ p_checks_count: 501 }), { status: 'invalid' });
  assert.deepEqual(close({ p_cash_cents: -1 }), { status: 'invalid' }); // cash expected ≥ 0 here
  assert.deepEqual(close({ p_day: addDays(T, -1) }), { status: 'not_allowed' }); // staff: today only
  const short = close({ p_cash_cents: 15000 });
  assert.equal(short.status, 'note_required');
  assert.deepEqual(short.results.cash, { result: 'short', diff_cents: 2000 });
  assert.equal(close({ p_cash_cents: 15000, p_note: '   ' }).status, 'note_required'); // blank note
  // Notes follow 0005's testing_note_is_valid: no control / invisible characters (tab and line break are fine).
  for (const bad of ['Gave \u0007 change', 'zero\u200bwidth', 'bom\ufeff', 'del\u007f', 'x\u000by', 'x'.repeat(501)]) {
    assert.deepEqual(close({ p_cash_cents: 15000, p_note: bad }), { status: 'invalid' }, JSON.stringify(bad));
  }
  assert.equal(close({ p_cash_cents: 15000, p_note: 'x'.repeat(500), p_expected_fingerprint: 'nope' }).status, 'stale'); // 500 is allowed (then stale)
  assert.equal(close({ p_cash_cents: 15000, p_note: 'Line one\r\n\tLine two', p_expected_fingerprint: 'nope' }).status, 'stale'); // tab + line break fine
  const done = close({});
  assert.equal(done.status, 'ok');
  assert.equal(done.results.cash.result, 'matches');
  assert.deepEqual(close({}), { status: 'already_closed' }); // double click
  const after = call('finance_day', dayArgs('shrewsbury'), STAFF_CTX);
  assert.equal(after.closing.id, done.closing_id);
  assert.equal(after.closing.changed_after, false);
  assert.equal(after.can_close, false);
  assert.ok(after.can_undo_until);
  assert.equal(after.fingerprint, d.fingerprint); // closing doesn't change the items
  // Undo: another login → too_late; the closer within 10 s → ok; again → stale.
  assert.deepEqual(call('finance_undo_close', { p_closing_id: done.closing_id }, ADMIN_CTX), { status: 'too_late' });
  clock += 9000;
  assert.deepEqual(call('finance_undo_close', { p_closing_id: done.closing_id }, STAFF_CTX), { status: 'ok' });
  assert.deepEqual(call('finance_undo_close', { p_closing_id: done.closing_id }, STAFF_CTX), { status: 'stale' });
  // Close again, wait 10 s → too_late; reopen (admin): stale id, ok, then not_closed.
  const again = close({});
  assert.equal(again.status, 'ok');
  clock += 10000;
  assert.deepEqual(call('finance_undo_close', { p_closing_id: again.closing_id }, STAFF_CTX), { status: 'too_late' });
  assert.equal(call('finance_day', dayArgs('shrewsbury'), STAFF_CTX).can_undo_until, null);
  assert.deepEqual(call('finance_reopen_day', { p_location_code: 'shrewsbury', p_day: T, p_expected_closing_id: done.closing_id }), { status: 'stale' });
  assert.deepEqual(call('finance_reopen_day', { p_location_code: 'shrewsbury', p_day: T, p_expected_closing_id: again.closing_id }), { status: 'ok' });
  assert.deepEqual(call('finance_reopen_day', { p_location_code: 'shrewsbury', p_day: T, p_expected_closing_id: again.closing_id }), { status: 'not_closed' });
  // Close once more, then a late payment arrives → Changed after closing + Added after closing.
  assert.equal(close({}).status, 'ok');
  cbStore.payments.push({ id: 'c4', registration_id: 'g2', kind: 'payment', amount_cents: 6500, method: 'cash', paid_on: T, recorded_at: new Date(clock + 60000).toISOString(), recorded_by: 'desk', recorded_by_name: 'Staff', reverses_payment_id: null });
  const changed = call('finance_day', dayArgs('shrewsbury'), STAFF_CTX);
  assert.equal(changed.closing.changed_after, true);
  assert.equal(changed.closing.changed_count, 1);
  assert.equal(changed.items.filter((i) => i.added_after_closing).length, 1);
  assert.equal(call('finance_history', { p_location_code: 'shrewsbury', p_month: T }).days[0].tag, 'changed_after_closing');
});

check('mock: a method-only edit between loading and closing → stale; nothing_to_close; negative cash', () => {
  const day = addDays(T, -1);
  const w = call('finance_day', dayArgs('worcester', day));
  cbStore.payments.push(
    { id: 'c5', registration_id: 'g3', kind: 'reversal', amount_cents: -6500, method: 'card', paid_on: T, recorded_at: new Date(clock).toISOString(), recorded_by: 'admin-1', recorded_by_name: 'Jeffrey Berg', reverses_payment_id: 'c3' },
    { id: 'c6', registration_id: 'g3', kind: 'payment', amount_cents: 6500, method: 'cash', paid_on: day, recorded_at: new Date(clock).toISOString(), recorded_by: 'admin-1', recorded_by_name: 'Jeffrey Berg', reverses_payment_id: null },
  );
  const args = { p_location_code: 'worcester', p_day: day, p_expected_fingerprint: w.fingerprint, p_cash_cents: 0, p_checks_count: 0, p_checks_cents: 0, p_card_cents: 6500, p_note: null };
  assert.deepEqual(call('finance_close_day', args), { status: 'stale' });
  // A day with no counted item at all → nothing_to_close.
  const empty = call('finance_day', dayArgs('worcester', addDays(T, -9)));
  assert.equal(empty.can_close, false);
  assert.deepEqual(call('finance_close_day', { ...args, p_day: addDays(T, -9), p_expected_fingerprint: empty.fingerprint }), { status: 'nothing_to_close' });
  // The refund-only day: "Cash taken out of the drawer" is sent as a negative cash count.
  const r = call('finance_day', dayArgs('shrewsbury', addDays(T, -2)));
  const ok = call('finance_close_day', { ...args, p_location_code: 'shrewsbury', p_day: addDays(T, -2), p_expected_fingerprint: r.fingerprint, p_cash_cents: -5000, p_card_cents: 0 });
  assert.equal(ok.status, 'ok');
  assert.equal(ok.results.cash.result, 'matches');
});

check('mock: payment detail — history, staff today only, hidden → not_found', () => {
  const y = call('finance_day', dayArgs('shrewsbury', addDays(T, -1)));
  const cruz = y.items.find((i) => i.last_name === 'Cruz');
  const det = call('finance_payment_detail', { p_source: 'star', p_payment_id: cruz.payment_id });
  assert.equal(det.status, 'ok');
  assertClean(det, 'finance_payment_detail');
  assert.equal(det.item.state, 'moved_in');
  assert.equal(det.item.school, 'shrewsbury');
  assert.equal(det.event_name, 'Fall Star Testing');
  assert.equal(det.event_id, '00000f10-0000-4000-8000-000000000001'); // for Open in Testing
  assert.deepEqual(det.history.map((x) => x.what), ['edited', 'recorded']);
  assert.deepEqual(call('finance_payment_detail', { p_source: 'star', p_payment_id: cruz.payment_id }, STAFF_CTX), { status: 'not_allowed' });
  const bell = y.items.find((i) => i.last_name === 'Bell');
  // Undone today, but its only item is on T−1 (the day it was paid) → staff may not open it.
  assert.deepEqual(call('finance_payment_detail', { p_source: 'star', p_payment_id: bell.payment_id }, STAFF_CTX), { status: 'not_allowed' });
  assert.deepEqual(call('finance_payment_detail', { p_source: 'star', p_payment_id: bell.payment_id }).history.map((x) => x.what), ['undone', 'recorded']);
  const today = call('finance_day', dayArgs('shrewsbury'), STAFF_CTX);
  const hill = today.items.find((i) => i.last_name === 'Hill');
  assert.equal(call('finance_payment_detail', { p_source: 'star', p_payment_id: hill.payment_id }, STAFF_CTX).history[0].what, 'refunded');
  const hiddenId = '00000f12-0000-4000-8000-000000000015'; // Leo Park's mis-click
  assert.deepEqual(call('finance_payment_detail', { p_source: 'star', p_payment_id: hiddenId }), { status: 'not_found' });
  assert.deepEqual(call('finance_payment_detail', { p_source: 'cash', p_payment_id: hiddenId }), { status: 'invalid' });
});

check('mock: export — range rules, counted_cents sums to the total, one log row per call', () => {
  const before = financeStore.exports.length;
  assert.deepEqual(call('finance_export', { p_location_code: 'shrewsbury', p_from: T, p_to: addDays(T, 1) }), { status: 'invalid' });
  assert.deepEqual(call('finance_export', { p_location_code: 'shrewsbury', p_from: T, p_to: addDays(T, -1) }), { status: 'invalid' });
  assert.deepEqual(call('finance_export', { p_location_code: 'shrewsbury', p_from: addDays(T, -366), p_to: T }), { status: 'invalid' });
  assert.equal(call('finance_export', { p_location_code: 'shrewsbury', p_from: addDays(T, -365), p_to: T }).status, 'ok');
  assert.deepEqual(call('finance_export', { p_location_code: null, p_from: T, p_to: T }), { status: 'invalid' });
  const e = call('finance_export', { p_location_code: 'shrewsbury', p_from: addDays(T, -6), p_to: T });
  assertClean(e, 'finance_export');
  assert.equal(financeStore.exports.length, before + 2);
  // The Export dialog's count line: same range rules, counted payments + net total, nothing logged.
  const preview = call('finance_export_preview', { p_location_code: 'shrewsbury', p_from: addDays(T, -6), p_to: T });
  assert.deepEqual(Object.keys(preview).sort(), ['count', 'status', 'total_cents']);
  assert.equal(preview.count, e.rows.filter((r) => r.counted_cents !== 0 && r.kind === 'payment').length);
  assert.equal(preview.total_cents, e.rows.reduce((sum, r) => sum + r.counted_cents, 0));
  assert.equal(financeStore.exports.length, before + 2, 'a preview is not logged');
  assert.deepEqual(call('finance_export_preview', { p_location_code: 'shrewsbury', p_from: T, p_to: addDays(T, 1) }), { status: 'invalid' });
  assert.deepEqual(call('finance_export_preview', { p_location_code: 'shrewsbury', p_from: addDays(T, -366), p_to: T }), { status: 'invalid' });
  assert.deepEqual(call('finance_export_preview', { p_location_code: 'boston', p_from: T, p_to: T }), { status: 'not_found' });
  assert.deepEqual(call('finance_export_preview', { p_location_code: null, p_from: T, p_to: T }), { status: 'invalid' });
  assert.ok(!('downloaded_by' in financeStore.exports.at(-1)) || financeStore.exports.at(-1).downloaded_by === 'admin-1');
  for (let n = -6; n <= 0; n += 1) {
    const day = addDays(T, n);
    const d = call('finance_day', dayArgs('shrewsbury', day));
    const sum = e.rows.filter((r) => r.day === day).reduce((s, r) => s + r.counted_cents, 0);
    assert.equal(sum, d.totals.net_cents, `export total on ${day}`);
    assert.equal(e.rows.filter((r) => r.day === day).length, d.items.length, `export rows on ${day}`);
  }
  assert.equal(e.rows.find((r) => r.last_name === 'Cruz' && r.state === 'moved_out').note, `moved to ${addDays(T, -1)}`);
  assert.equal(e.rows.find((r) => r.last_name === 'Adams').note, 'was $140.00 cash');
  assert.ok(toCsv(e.rows).includes('Star testing'));
});

check('mock: Home reminder (Off by default), admin earlier days, settings versions', () => {
  const s = call('finance_settings_get', {});
  assert.equal(s.reminder_on, false);
  assert.equal(s.times.length, 14);
  assert.ok(s.times.every((t) => t.remind_at === null)); // seeded Off (Q3)
  assert.deepEqual(call('finance_home', {}, STAFF_CTX), { status: 'ok', today: [], earlier: null });
  let v = s.version;
  assert.deepEqual(call('finance_set_reminder_on', { p_on: true, p_expected_version: v + 5 }), { status: 'stale' });
  v = call('finance_set_reminder_on', { p_on: true, p_expected_version: v }).version;
  assert.deepEqual(call('finance_set_reminder_time', { p_location_code: 'worcester', p_weekday: 1, p_time: '10:45', p_expected_version: v }), { status: 'invalid' });
  assert.deepEqual(call('finance_set_reminder_time', { p_location_code: 'worcester', p_weekday: 8, p_time: '19:30', p_expected_version: v }), { status: 'invalid' });
  v = call('finance_set_reminder_time', { p_location_code: 'worcester', p_weekday: 1, p_time: '19:30', p_expected_version: v }).version;
  v = call('finance_copy_monday', { p_expected_version: v }).version;
  // Nothing changed → the same version (no bump), for all three setters.
  assert.deepEqual(call('finance_copy_monday', { p_expected_version: v }), { status: 'ok', version: v });
  assert.deepEqual(call('finance_set_reminder_on', { p_on: true, p_expected_version: v }), { status: 'ok', version: v });
  assert.deepEqual(call('finance_set_reminder_time', { p_location_code: 'worcester', p_weekday: 1, p_time: '19:30:00', p_expected_version: v }), { status: 'ok', version: v });
  assert.deepEqual(call('finance_set_reminder_time', { p_location_code: 'worcester', p_weekday: 7, p_time: null, p_expected_version: v }), { status: 'ok', version: v });
  assert.deepEqual(call('finance_copy_monday', { p_expected_version: v - 1 }), { status: 'stale' }); // still checked first
  const times = call('finance_settings_get', {}).times;
  assert.deepEqual(times.filter((t) => t.school === 'worcester').map((t) => t.remind_at), ['19:30', '19:30', '19:30', '19:30', '19:30', null, null]);
  // Saturday at Worcester: payments today? None at Worcester on T → no reminder even when due.
  v = call('finance_set_reminder_time', { p_location_code: 'worcester', p_weekday: 6, p_time: '13:00', p_expected_version: v }).version;
  call('finance_set_reminder_time', { p_location_code: 'shrewsbury', p_weekday: 6, p_time: '13:00', p_expected_version: v });
  finance.setNow('12:59');
  assert.deepEqual(call('finance_home', {}, STAFF_CTX).today, []);
  finance.setNow('13:00');
  // Shrewsbury today was closed in an earlier check → no reminder there either; reopen it.
  const closed = call('finance_day', dayArgs('shrewsbury'));
  call('finance_reopen_day', { p_location_code: 'shrewsbury', p_day: T, p_expected_closing_id: closed.closing.id });
  assert.deepEqual(call('finance_home', {}, STAFF_CTX).today, ['shrewsbury']);
  const home = call('finance_home', {});
  // Open earlier days now: Worcester T−8 (the refund-heavy day), T−2 (Kai) and T−1 (the edited
  // card payment); Shrewsbury T−7 (the refund-heavy day) and T−1 (T−2's refunds were closed above;
  // T−3…T−6 are the sample closings).
  assert.deepEqual(home.earlier, {
    count: 5, first_day: addDays(T, -8),
    by_school: { worcester: { count: 3, first_day: addDays(T, -8) }, shrewsbury: { count: 2, first_day: addDays(T, -7) } },
  });
  assert.equal(finance.setNow('nope'), false);
  finance.setNow(null);
});

check('mock: earlier = by_school {} when nothing is open; never in the future at 6 AM', () => {
  // A fresh preview database opened at 6:00 AM school time on T (10:00 UTC, summer time).
  let store = null;
  const early = Date.parse(`${T}T10:00:00.000Z`);
  const fresh = createFinanceBackend({
    loadStore: () => store, saveStore: (s) => { store = JSON.parse(JSON.stringify(s)); },
    readColorBelt: () => null, now: () => early, today: () => T, newId: () => randomUUID(),
  });
  const db = fresh.snapshot();
  assert.ok(db.star.payments.every((p) => Date.parse(p.recorded_at) <= early), 'no sample payment is recorded after now');
  const d = fresh.rpc('finance_day', dayArgs('shrewsbury'), ADMIN_CTX).data;
  // Today's rows moved together: the order and the rules still hold.
  assert.deepEqual(d.items.map((i) => i.last_name), ['Rossi', 'Hill', 'Walsh']);
  assert.ok(!d.items.some((i) => i.last_name === 'Park'), 'the 6-second mis-click is still hidden');
  assert.equal(d.items.at(-1).time, '05:59'); // the latest (12:05 PM) now ends a minute before 6:00 AM
  const y = fresh.rpc('finance_day', dayArgs('shrewsbury', addDays(T, -1)), ADMIN_CTX).data;
  assert.equal(y.items.find((i) => i.last_name === 'Adams').state, 'edited'); // the edit pair kept the same moment
  // Closing today now: nothing is "Added after closing".
  const closed = fresh.rpc('finance_close_day', {
    p_location_code: 'shrewsbury', p_day: T, p_expected_fingerprint: d.fingerprint,
    p_cash_cents: 10500, p_checks_count: 1, p_checks_cents: 14000, p_card_cents: 0, p_note: null,
  }, STAFF_CTX).data;
  assert.equal(closed.status, 'ok');
  const after = fresh.rpc('finance_day', dayArgs('shrewsbury'), ADMIN_CTX).data;
  assert.equal(after.items.filter((i) => i.added_after_closing).length, 0);
  assert.equal(after.closing.changed_after, false);
  // Staff get no `earlier`; an admin with every earlier day closed or empty gets the empty shape.
  assert.equal(fresh.rpc('finance_home', {}, STAFF_CTX).data.earlier, null);
  for (const n of [-1, -2, -7]) { // −7: the refund-heavy Shrewsbury day
    const day = fresh.rpc('finance_day', dayArgs('shrewsbury', addDays(T, n)), ADMIN_CTX).data;
    const ex = expectedValues(day.totals, day.refunds);
    assert.equal(fresh.rpc('finance_close_day', {
      p_location_code: 'shrewsbury', p_day: addDays(T, n), p_expected_fingerprint: day.fingerprint,
      p_cash_cents: ex.cashCents, p_checks_count: ex.checksCount, p_checks_cents: ex.checksCents, p_card_cents: ex.cardCents, p_note: null,
    }, ADMIN_CTX).data.status, 'ok');
  }
  const partial = fresh.rpc('finance_home', {}, ADMIN_CTX).data.earlier; // Worcester T−8 (refunds) and T−2 (Kai) are still open
  assert.deepEqual(partial, { count: 2, first_day: addDays(T, -8), by_school: { worcester: { count: 2, first_day: addDays(T, -8) } } });
  // Close Worcester's refund-heavy day T−8 with exactly what's expected (cash in − cash refunded).
  const t8 = fresh.rpc('finance_day', dayArgs('worcester', addDays(T, -8)), ADMIN_CTX).data;
  const ex8 = expectedValues(t8.totals, t8.refunds);
  assert.equal(ex8.cashCents, 42000 - 13500); // 3 cash payments − 3 counted cash refunds (the $30 one was undone)
  assert.equal(fresh.rpc('finance_close_day', {
    p_location_code: 'worcester', p_day: addDays(T, -8), p_expected_fingerprint: t8.fingerprint,
    p_cash_cents: ex8.cashCents, p_checks_count: ex8.checksCount, p_checks_cents: ex8.checksCents, p_card_cents: ex8.cardCents, p_note: null,
  }, ADMIN_CTX).data.status, 'ok');
  const kai = fresh.rpc('finance_day', dayArgs('worcester', addDays(T, -2)), ADMIN_CTX).data;
  fresh.rpc('finance_close_day', {
    p_location_code: 'worcester', p_day: addDays(T, -2), p_expected_fingerprint: kai.fingerprint,
    p_cash_cents: 0, p_checks_count: 1, p_checks_cents: 14000, p_card_cents: 0, p_note: null,
  }, ADMIN_CTX);
  assert.deepEqual(fresh.rpc('finance_home', {}, ADMIN_CTX).data.earlier, { count: 0, first_day: null, by_school: {} });
});

check('mock: failNextSave makes the next write fail and change nothing; reset', () => {
  finance.failNextSave();
  assert.equal(call('finance_settings_get', {}).status, 'ok'); // reads still work
  const res = finance.rpc('finance_copy_monday', { p_expected_version: 1 }, ADMIN_CTX);
  assert.ok(res.error);
  finance.reset();
  assert.equal(call('finance_settings_get', {}).version, 1);
  assert.equal(financeStore.closings.length, 4);
});

// ======================= Home reminder "OK" (reminderAck.js, v0.811) =======================

check('reminderAck: newDays, the unclosed pairs from History, the months to read', () => {
  assert.deepEqual(newDays(['worcester|2026-10-01', 'worcester|2026-10-19'], ['worcester|2026-10-01']), ['worcester|2026-10-19']);
  assert.deepEqual(newDays(['worcester|2026-10-01'], new Set(['worcester|2026-10-01'])), []);
  assert.deepEqual(newDays(['shrewsbury|2026-10-01'], ['worcester|2026-10-01']), ['shrewsbury|2026-10-01']); // the school counts
  assert.deepEqual(newDays(['worcester|2026-10-01'], undefined), ['worcester|2026-10-01']);
  // Only 'not_closed', only today − 30 … today − 1, oldest first, no duplicates.
  const today = '2026-10-20';
  const days = [
    { day: '2026-10-20', school: 'worcester', tag: 'today_open' },
    { day: '2026-10-20', school: 'shrewsbury', tag: 'not_closed' }, // today itself never counts
    { day: '2026-10-19', school: 'worcester', tag: 'not_closed' },
    { day: '2026-10-18', school: 'worcester', tag: 'closed' },
    { day: '2026-10-17', school: 'worcester', tag: 'no_payments' },
    { day: '2026-09-20', school: 'shrewsbury', tag: 'not_closed' }, // today − 30: inside
    { day: '2026-09-20', school: 'worcester', tag: 'not_closed' },
    { day: '2026-09-19', school: 'worcester', tag: 'not_closed' }, // today − 31: outside
    { day: '2026-10-19', school: 'worcester', tag: 'not_closed' },
  ];
  assert.deepEqual(unclosedPairsFrom(days, today), ['shrewsbury|2026-09-20', 'worcester|2026-09-20', 'worcester|2026-10-19']);
  assert.deepEqual(monthsToLoad('2026-10-20'), ['2026-09-01', '2026-10-01']);
  assert.deepEqual(monthsToLoad('2026-10-01'), ['2026-09-01']); // Sep 1 … Sep 30
  assert.deepEqual(monthsToLoad('2026-10-31'), ['2026-10-01']); // Oct 1 … Oct 30
  assert.deepEqual(monthsToLoad('2027-03-01'), ['2027-01-01', '2027-02-01']); // Jan 30 … Feb 28
  assert.deepEqual(monthsToLoad('2027-01-15'), ['2026-12-01', '2027-01-01']); // across the year
});

check('reminderAck: prune at the 30-day edge; storage that fails or is damaged never crashes', () => {
  const fakeStorage = () => {
    const data = new Map();
    return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), data };
  };
  // Saved, merged, and pruned: today − 30 stays, today − 31 goes.
  const mem = fakeStorage();
  const store = createSeenStore(() => mem);
  assert.deepEqual(store.getSeen(), []);
  assert.equal(store.markSeen([pairKey('worcester', '2026-09-19'), pairKey('worcester', '2026-09-20')]), true);
  assert.equal(store.markSeen([pairKey('worcester', '2026-09-20'), pairKey('shrewsbury', '2026-10-19')]), true);
  assert.deepEqual(store.getSeen(), ['worcester|2026-09-19', 'worcester|2026-09-20', 'shrewsbury|2026-10-19']);
  assert.deepEqual(store.pruneSeen('2026-10-20'), ['worcester|2026-09-20', 'shrewsbury|2026-10-19']);
  assert.deepEqual(JSON.parse(mem.data.get(SEEN_KEY)), ['worcester|2026-09-20', 'shrewsbury|2026-10-19']);
  assert.deepEqual(keepRecent(['junk', 42, 'worcester|2026-10-19', 'worcester|2026-10-19'], '2026-10-20'), ['worcester|2026-10-19']);
  // Damaged JSON / not a list → nothing seen.
  mem.data.set(SEEN_KEY, '{not json');
  assert.deepEqual(store.getSeen(), []);
  mem.data.set(SEEN_KEY, '{"a":1}');
  assert.deepEqual(store.getSeen(), []);
  // Storage blocked (every call throws, like some private windows): nothing seen, OK kept in memory.
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  const off = createSeenStore(() => blocked);
  assert.deepEqual(off.getSeen(), []);
  assert.equal(off.markSeen(['worcester|2026-10-19']), false);
  assert.deepEqual(off.getSeen(), ['worcester|2026-10-19']); // the line still goes away until reload
  assert.deepEqual(off.pruneSeen('2026-12-31'), []);
  // No storage at all (the getter itself throws).
  const none = createSeenStore(() => { throw new Error('no localStorage'); });
  assert.deepEqual(none.getSeen(), []);
  assert.equal(none.markSeen(['worcester|2026-10-19']), false);
});

check('reminderAck + mock: History lists exactly the days finance_home counts', () => {
  const home = call('finance_home', {}).earlier;
  assert.ok(home.count > 0, 'the sample has unclosed earlier days');
  for (const code of [null, 'worcester', 'shrewsbury']) {
    const days = monthsToLoad(T).flatMap((month) => call('finance_history', { p_location_code: code, p_month: month }).days);
    const pairs = unclosedPairsFrom(days, T);
    const want = code === null ? home : home.by_school[code] ?? { count: 0, first_day: null };
    assert.equal(pairs.length, want.count, `count for ${code}`);
    assert.equal(pairs[0]?.split('|')[1] ?? null, want.first_day, `first day for ${code}`);
  }
});

console.log(`${count} groups of checks ran.`);
console.log('ALL FINANCE LIB CHECKS PASSED');
