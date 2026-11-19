// eventReportChecks.mjs — automatic checks for an event's Money report (migration 0054, contract CONTRACT-0054-0055).
// Run: node src/lib/finance/eventReportChecks.mjs   (also picked up by docs/Dashboard Core/tools/run-checks.mjs)
// Why it exists: the report's numbers must equal Finance's own (Daily report) for the same event, the rules
// (admins only, five sources, not_found / invalid, the download log) must match the database, the CSV file
// must be written with csv.js's rules plus the extra Event column, the page address must round-trip, and the
// answer's shape helpers must accept both the nested and the flat figures. These plain `assert` checks run
// without a browser or a database and print ALL EVENT REPORT CHECKS PASSED.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { toCsv } from './csv.js';
import { downloadCsvFile, eventReportCsv, eventReportFileName, EVENT_CSV_HEADERS } from './eventReportCsv.js';
import { dayRange, netOf, normalizeEntry, normalizeEventReport } from './eventReportModel.js';
import { createFinanceBackend, FINANCE_RPC_NAMES, FINANCE_WRITE_RPC_NAMES } from '../mockFinance.js';
import * as FT from '../../screens/finance/text.js';

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

// ----- A made-up Finance world: two camps, one with money at both schools, an undo, an edit and a refund -----
const T = '2026-11-18';
const NOW = Date.parse('2026-11-18T20:00:00.000Z');
const at = (day, hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.parse(`${day}T00:00:00Z`) + ((h + 5) * 60 + m) * 60000).toISOString(); // EST (UTC−5)
};
const ADMIN = { signedIn: true, hasDataAccess: true, isAdmin: true, actorName: 'Jeffrey Berg', userId: 'admin-1' };
const STAFF = { ...ADMIN, isAdmin: false, actorName: 'Staff', userId: 'desk-1' };
const NO_ACCESS = { ...ADMIN, hasDataAccess: false };
const UUID = (n) => `0000a000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const CAMP = UUID(1);
const OTHER_CAMP = UUID(2);
const pay = (n, camper, kind, cents, method, day, hhmm, school, extra = {}) => ({
  id: UUID(100 + n), camper_id: camper, kind, amount_cents: cents, method, paid_on: day, recorded_at: at(day, hhmm),
  recorded_by: 'desk-1', recorded_by_name: 'Staff', reverses_payment_id: null, school, ...extra,
});
const campStore = {
  camps: [
    { id: CAMP, name: '=Thanksgiving Camp', location_code: 'worcester', both_schools: true },
    { id: OTHER_CAMP, name: 'Winter Camp', location_code: 'worcester', both_schools: false },
  ],
  camp_days: [{ id: UUID(11), camp_id: CAMP, day: '2026-11-25' }, { id: UUID(12), camp_id: OTHER_CAMP, day: '2026-12-28' }],
  camp_campers: [
    { id: UUID(21), camp_id: CAMP, first_name: 'Ava', last_name: 'Cole' },
    { id: UUID(22), camp_id: CAMP, first_name: 'Ben', last_name: 'Diaz' },
    { id: UUID(23), camp_id: CAMP, first_name: 'Cy', last_name: 'Eng' },
    { id: UUID(24), camp_id: OTHER_CAMP, first_name: 'Di', last_name: 'Fox' },
  ],
  camp_camper_days: [],
  camp_payments: [
    pay(1, UUID(21), 'payment', 16600, 'cash', '2026-11-10', '09:00', 'worcester'),
    pay(2, UUID(22), 'payment', 20000, 'check', '2026-11-10', '09:30', 'shrewsbury'),
    // Cy: a card payment that is then undone (a reversal row only)
    pay(3, UUID(23), 'payment', 9900, 'card', '2026-11-12', '10:00', 'worcester'),
    pay(4, UUID(23), 'reversal', -9900, 'card', '2026-11-12', '10:30', 'worcester', { reverses_payment_id: UUID(103), recorded_by: 'admin-1', recorded_by_name: 'Jeffrey Berg' }),
    // Ben: a second payment, edited the same minute by the same login (a reversal + the new amount)
    pay(5, UUID(22), 'payment', 5000, 'cash', '2026-11-12', '11:00', 'shrewsbury'),
    pay(6, UUID(22), 'reversal', -5000, 'cash', '2026-11-12', '11:30', 'shrewsbury', { reverses_payment_id: UUID(105), recorded_by: 'admin-1', recorded_by_name: 'Jeffrey Berg' }),
    pay(7, UUID(22), 'payment', 6000, 'cash', '2026-11-12', '11:30', 'shrewsbury', { recorded_by: 'admin-1', recorded_by_name: 'Jeffrey Berg' }),
    // Ava: a cash refund, handed back at Worcester
    pay(8, UUID(21), 'refund', -3000, 'cash', '2026-11-16', '14:00', 'worcester', { recorded_by: 'admin-1', recorded_by_name: 'Jeffrey Berg' }),
    // the other camp's money must never show up in the first camp's report
    pay(9, UUID(24), 'payment', 12300, 'card', '2026-11-12', '12:00', 'worcester'),
  ],
};
let store = null;
const finance = () => createFinanceBackend({
  loadStore: () => store,
  saveStore: (s) => { store = JSON.parse(JSON.stringify(s)); },
  readColorBelt: () => ({ events: [], registrations: [], payments: [] }),
  readCamps: () => JSON.parse(JSON.stringify(campStore)),
  now: () => NOW,
  today: () => T,
  newId: (() => { let n = 0; return () => UUID(900 + ++n); })(),
});
const ask = (backend, name, args, ctx = ADMIN) => backend.rpc(name, args, ctx).data;
const report = (backend, school = null, event = CAMP, ctx = ADMIN) =>
  ask(backend, 'finance_event_report', { p_source: 'camp', p_event_id: event, p_location_code: school }, ctx);

check('the two functions are in the preview database; only the export writes (and logs)', () => {
  assert.ok(FINANCE_RPC_NAMES.includes('finance_event_report'));
  assert.ok(FINANCE_RPC_NAMES.includes('finance_event_export'));
  assert.ok(FINANCE_WRITE_RPC_NAMES.includes('finance_event_export'));
  assert.ok(!FINANCE_WRITE_RPC_NAMES.includes('finance_event_report'));
});

check('who may ask, and the answers for a bad question (in the contract\'s order)', () => {
  const b = finance();
  assert.equal(report(b, null, CAMP, NO_ACCESS).status, 'no_access');
  assert.equal(report(b, null, CAMP, STAFF).status, 'not_allowed'); // staff never see it
  assert.equal(ask(b, 'finance_event_report', { p_source: 'nonsense', p_event_id: CAMP, p_location_code: null }).status, 'invalid');
  assert.equal(ask(b, 'finance_event_report', { p_source: 'camp', p_event_id: null, p_location_code: null }).status, 'invalid');
  assert.equal(report(b, 'springfield').status, 'not_found'); // a school that doesn't exist
  assert.equal(report(b, null, UUID(77)).status, 'not_found'); // an event that doesn't exist
  assert.equal(ask(b, 'finance_event_report', { p_source: 'star', p_event_id: CAMP, p_location_code: null }).status, 'not_found'); // right id, wrong section
  assert.equal(ask(b, 'finance_event_export', { p_source: 'camp', p_event_id: CAMP, p_location_code: null }, STAFF).status, 'not_allowed');
});

check('one event only, Both schools: totals, refunds, per-school boxes (Worcester first), days newest first', () => {
  const r = report(finance());
  assert.equal(r.status, 'ok');
  assert.equal(r.source, 'camp');
  assert.equal(r.school, null);
  assert.deepEqual(r.event, { id: CAMP, name: '=Thanksgiving Camp' });
  // counted payments: Ava 166 cash, Ben 200 check, Ben 60 cash (the edit; his 50 was replaced), nothing for Cy (undone)
  assert.equal(r.totals.count, 3);
  assert.equal(r.totals.in_cents, 16600 + 20000 + 6000);
  assert.equal(r.totals.cash.cents, 16600 + 6000);
  assert.equal(r.totals.check.cents, 20000);
  assert.equal(r.totals.card.cents, 0);
  assert.equal(r.refunds.count, 1);
  assert.equal(r.refunds.cents, -3000);
  assert.equal(r.refunds.cash_cents, -3000);
  assert.equal(r.totals.net_cents, 16600 + 20000 + 6000 - 3000);
  assert.equal(r.totals.total_cents, r.totals.net_cents);
  assert.deepEqual(r.by_school.map((s) => s.school), ['worcester', 'shrewsbury']);
  assert.equal(r.by_school[0].totals.net_cents, 16600 - 3000); // Worcester: Ava's payment less the refund (and Cy's undone payment counts nothing)
  assert.equal(r.by_school[1].totals.net_cents, 20000 + 6000); // Shrewsbury: Ben's two
  assert.deepEqual(r.days.map((d) => d.day), ['2026-11-16', '2026-11-12', '2026-11-10']);
  // the other camp's $123 card payment is not here
  assert.ok(r.days.every((d) => d.items.every((i) => i.event_name === undefined || i.event_name === '=Thanksgiving Camp')));
  assert.equal(r.days.flatMap((d) => d.items).some((i) => i.amount_cents === 12300), false);
});

check('rows carry Finance\'s own states, the school stored on each payment and the day\'s own figures', () => {
  const r = report(finance());
  const items = r.days.flatMap((d) => d.items);
  const states = Object.fromEntries(items.map((i) => [`${i.first_name}|${i.kind}|${i.state}`, i]));
  assert.ok(states['Cy|payment|undone'], 'the undone payment is a row, not counted');
  assert.equal(states['Cy|payment|undone'].changed_by_name, 'Jeffrey Berg');
  assert.ok(states['Ben|payment|edited'], 'the edited payment shows once, as edited');
  assert.equal(states['Ben|payment|edited'].was_amount_cents, 5000);
  assert.equal(states['Ben|payment|edited'].amount_cents, 6000);
  assert.equal(states['Ava|refund|counted'].amount_cents, -3000);
  for (const i of items) assert.ok(['worcester', 'shrewsbury'].includes(i.school));
  const day12 = r.days.find((d) => d.day === '2026-11-12');
  assert.equal(day12.totals.count, 1); // Ben's edited payment only: Cy's undone one counts nothing
  assert.equal(day12.totals.net_cents, 6000);
  // items are ordered by recorded time, then last name
  assert.deepEqual(day12.items.map((i) => i.last_name), ['Eng', 'Diaz']);
});

check('the report equals the sum of Finance\'s own Daily reports for the same event days and schools', () => {
  const b = finance();
  const r = report(b);
  let count = 0;
  let net = 0;
  for (const school of ['worcester', 'shrewsbury']) {
    for (const day of r.days.map((d) => d.day)) {
      const d = ask(b, 'finance_day', { p_location_code: school, p_day: day });
      // (this camp is the only one with money on these days, except the other camp on 11-12)
      const mine = d.items.filter((i) => i.event_name === '=Thanksgiving Camp' && ['counted', 'edited', 'moved_in'].includes(i.state));
      count += mine.filter((i) => i.kind === 'payment').length;
      net += mine.reduce((sum, i) => sum + i.amount_cents, 0);
    }
  }
  assert.equal(count, r.totals.count);
  assert.equal(net, r.totals.net_cents);
});

check('one school only: just its money, one box', () => {
  const b = finance();
  const w = report(b, 'worcester');
  assert.equal(w.school, 'worcester');
  assert.deepEqual(w.by_school.map((s) => s.school), ['worcester']);
  assert.equal(w.totals.count, 1);
  assert.equal(w.totals.net_cents, 16600 - 3000);
  assert.equal(w.days.flatMap((d) => d.items).every((i) => i.school === 'worcester'), true);
  const s = report(b, 'shrewsbury');
  assert.equal(s.totals.count, 2);
  assert.equal(s.refunds.count, 0);
  assert.equal(w.totals.net_cents + s.totals.net_cents, report(b).totals.net_cents);
});

check('an event with no money answers ok with nothing in it', () => {
  const b = createFinanceBackend({
    loadStore: () => null, saveStore: () => {}, readColorBelt: () => ({ events: [], registrations: [], payments: [] }),
    readCamps: () => ({ ...JSON.parse(JSON.stringify(campStore)), camp_payments: [] }), now: () => NOW, today: () => T, newId: () => UUID(950),
  });
  const r = report(b);
  assert.equal(r.status, 'ok');
  assert.equal(r.totals.count, 0);
  assert.deepEqual(r.days, []);
  assert.deepEqual(r.by_school, []);
});

check('a download is logged once per call, with names and counts but nothing private; the report itself logs nothing', () => {
  const b = finance();
  report(b);
  assert.equal(store?.event_exports?.length ?? 0, 0);
  const a = ask(b, 'finance_event_export', { p_source: 'camp', p_event_id: CAMP, p_location_code: null });
  assert.equal(a.status, 'ok');
  assert.equal(a.event_name, '=Thanksgiving Camp');
  assert.equal(a.rows.length, 5); // Ava's payment, Ben's check, Cy's undone payment, Ben's edited payment, Ava's refund
  assert.equal(store.event_exports.length, 1);
  const log = store.event_exports[0];
  assert.deepEqual(Object.keys(log).sort(), ['downloaded_at', 'downloaded_by', 'downloaded_by_name', 'event_id', 'event_name', 'id', 'location_code', 'row_count', 'source']);
  assert.equal(log.row_count, a.rows.length);
  ask(b, 'finance_event_export', { p_source: 'camp', p_event_id: CAMP, p_location_code: 'worcester' });
  assert.equal(store.event_exports.length, 2);
  assert.equal(store.event_exports[1].location_code, 'worcester');
  // a refused export logs nothing
  ask(b, 'finance_event_export', { p_source: 'camp', p_event_id: UUID(77), p_location_code: null });
  assert.equal(store.event_exports.length, 2);
});

check('export rows: finance_export\'s keys + event_name, ordered by day then time', () => {
  const rows = ask(finance(), 'finance_event_export', { p_source: 'camp', p_event_id: CAMP, p_location_code: null }).rows;
  for (const key of ['day', 'school', 'time', 'first_name', 'last_name', 'what', 'event_date', 'is_private', 'was_school', 'kind', 'method', 'amount_cents', 'counted_cents', 'recorded_by_name', 'state', 'note', 'event_name']) {
    assert.ok(key in rows[0], `row has ${key}`);
  }
  assert.deepEqual(rows.map((r) => r.day), [...rows.map((r) => r.day)].sort());
  const undone = rows.find((r) => r.state === 'undone');
  assert.equal(undone.counted_cents, 0); // summing "Counted in total" always gives the right total
  assert.equal(rows.reduce((s, r) => s + r.counted_cents, 0), 16600 + 20000 + 6000 - 3000);
});

check('the CSV: BOM, CRLF, an Event column first, the formula guard on the event\'s name, same rules as Export…', () => {
  const rows = ask(finance(), 'finance_event_export', { p_source: 'camp', p_event_id: CAMP, p_location_code: null }).rows;
  const text = eventReportCsv(rows);
  assert.ok(text.startsWith('﻿Event,Date,School,Time,First name,Last name,For,Event date,Kind,Paid by,Amount,Counted in total,Recorded by,Status,Note\r\n'));
  const lines = text.slice(1).split('\r\n');
  assert.equal(lines.length, rows.length + 2); // header + rows + the closing line break
  assert.equal(lines.at(-1), '');
  // "=Thanksgiving Camp" starts with = : written as '=Thanksgiving Camp (the file can't run it as a formula)
  assert.ok(lines[1].startsWith("'=Thanksgiving Camp,"));
  // the same file without the extra column is exactly Finance's Export file
  const plain = toCsv(rows, { headers: EVENT_CSV_HEADERS });
  assert.ok(plain.startsWith('﻿Date,School,'));
});

check('the file name is safe and says the event and the school', () => {
  assert.equal(eventReportFileName('April Vacation Camp', 'Both'), 'April-Vacation-Camp-Both-schools-money-report.csv');
  assert.equal(eventReportFileName('Fall Star Test', 'Worcester'), 'Fall-Star-Test-Worcester-money-report.csv');
  assert.equal(eventReportFileName('../../x:"y"', 'Shrewsbury'), 'x-y-Shrewsbury-money-report.csv');
  assert.equal(eventReportFileName('', 'Both'), 'Event-Both-schools-money-report.csv');
  assert.equal(typeof downloadCsvFile, 'function');
});

check('answer helpers: nested and flat figures both work; the first and last day; the net', () => {
  const flat = normalizeEntry({ day: '2026-11-10', count: 2, total_cents: 500, in_cents: 700, net_cents: 500, cash: { count: 1, cents: 700 } });
  assert.equal(flat.totals.count, 2);
  assert.equal(flat.totals.cash.cents, 700);
  assert.equal(flat.totals.check.cents, 0);
  assert.equal(flat.refunds.count, 0);
  assert.equal(netOf(flat), 500);
  const nested = normalizeEntry({ day: 'x', totals: { count: 1, total_cents: 90 }, refunds: { count: 1, cents: -10 } });
  assert.equal(netOf(nested), 90); // net_cents missing → the total
  assert.equal(nested.refunds.cents, -10);
  assert.deepEqual(dayRange([{ day: '2026-11-12' }, { day: '2026-11-10' }]), { first: '2026-11-10', last: '2026-11-12' });
  assert.deepEqual(dayRange([]), { first: null, last: null });
  const whole = normalizeEventReport(report(finance()));
  assert.equal(whole.days.length, 3);
  assert.equal(netOf(whole.by_school[0]), 13600);
  assert.equal(normalizeEventReport(null), null);
});

check('the words: the net line, a day\'s sentence, the heading range', () => {
  assert.equal(FT.MONEY_REPORT, 'Money report');
  assert.equal(FT.netLine({ count: 0, cents: 0 }, { count: 0, cents: 0 }, 5000), '');
  assert.equal(FT.netLine({ count: 1, cents: -10000 }, { count: 0, cents: 0 }, 224500), 'Refunded −⁠$100.00 · 1 refund · Net $2,245.00');
  assert.match(FT.netLine({ count: 0, cents: 0 }, { count: 2, cents: -156000 }, 100), /Returned checks −⁠\$1,560\.00 · Net \$1\.00$/);
  assert.equal(FT.daySummary({ totals: { count: 0 }, refunds: { count: 0 }, returned: { count: 0 } }), 'No payments');
  assert.equal(
    FT.daySummary({ totals: { count: 2, cash: { cents: 33500 }, check: { cents: 0 }, card: { cents: 33500 } }, refunds: { count: 1, cents: -10000 }, returned: { count: 0 } }),
    '2 payments · Cash $335.00 · Card $335.00 · Refunded −⁠$100.00',
  );
  assert.equal(FT.eventReportSub('April Vacation Camp', '2027-03-25', '2027-04-19', 'Both schools'), 'April Vacation Camp · Money taken Mar 25 – Apr 19, 2027 · Both schools');
  assert.equal(FT.eventReportSub('X', '2026-12-30', '2027-01-02', 'Worcester'), 'X · Money taken Dec 30, 2026 – Jan 2, 2027 · Worcester');
  assert.equal(FT.eventReportSub('X', null, null, 'Worcester'), 'X · Worcester');
});

// ----- The page address (pageAddress.js reads window.location; features.js is a Vite file, so it is stood in for) -----
globalThis.window = { location: { pathname: '/', search: '', hash: '' } };
const source = readFileSync(new URL('../pageAddress.js', import.meta.url), 'utf8')
  .replace(/import \{[^}]*\} from '\.\/features\.js';/, 'const BOARD_BREAKING_ON = false; const STAR_TESTING_ON = true;');
const dir = mkdtempSync(join(tmpdir(), 'pageaddress-er-'));
writeFileSync(join(dir, 'pageAddress.mjs'), source);
const P = await import(pathToFileURL(join(dir, 'pageAddress.mjs')).href);
const at2 = (hash) => { window.location.hash = hash; };

check('page address: #finance/event-report/<source>/<id> opens a route and writes the same address back', () => {
  for (const sourceName of P.EVENT_REPORT_SOURCES) {
    at2(`#finance/event-report/${sourceName}/${CAMP}`);
    assert.deepEqual(P.routeFromAddress(), { section: 'finance', testingPage: sourceName, eventId: CAMP, eventTab: 'event-report', privateId: null });
    assert.equal(P.routeIsUnknown(), false);
    assert.equal(P.correctedAddress(), null);
    assert.equal(P.addressForRoute(P.routeFromAddress()), `/#finance/event-report/${sourceName}/${CAMP}`);
  }
});

check('page address: an unknown source or no id is not an event report; the other Finance addresses are unchanged', () => {
  at2('#finance/event-report/nonsense/abc');
  assert.equal(P.routeIsUnknown(), true);
  at2('#finance/event-report/camp');
  assert.equal(P.routeIsUnknown(), true);
  at2('#finance/history');
  assert.equal(P.routeFromAddress().eventTab, 'history');
  at2('#finance');
  assert.equal(P.routeFromAddress().eventTab, 'report');
  // a route asking for the report without an event is just the Daily report
  assert.equal(P.routeTab('finance', 'camp', null, 'event-report'), 'report');
  assert.equal(P.routeTab('finance', 'bogus', CAMP, 'event-report'), 'report');
  assert.equal(P.routeTab('finance', 'camp', CAMP, 'event-report'), 'event-report');
});

check('page address: two reports are the same page only for the same event; a report is not the Daily report', () => {
  const r = (src, id) => ({ section: 'finance', testingPage: src, eventId: id, eventTab: 'event-report', privateId: null });
  assert.equal(P.samePage(r('camp', CAMP), r('camp', CAMP)), true);
  assert.equal(P.samePage(r('camp', CAMP), r('camp', OTHER_CAMP)), false);
  assert.equal(P.samePage(r('camp', CAMP), r('star', CAMP)), false);
  assert.equal(P.samePage(r('camp', CAMP), { section: 'finance', testingPage: null, eventId: null, eventTab: 'report', privateId: null }), false);
  assert.equal(P.samePage({ section: 'finance', testingPage: null, eventId: null, eventTab: 'report', privateId: null }, { section: 'finance', testingPage: null, eventId: null, eventTab: 'history', privateId: null }), false);
});

check('page address: the event pages\' own addresses (where Back goes) are the ones the section already uses', () => {
  const hashOf = (route) => P.addressForRoute(route).slice(1);
  assert.equal(hashOf({ section: 'camps', testingPage: null, eventId: CAMP, eventTab: 'default' }), `#camps/camp/${CAMP}`);
  assert.equal(hashOf({ section: 'testing', testingPage: 'star', eventId: CAMP, eventTab: 'students' }), `#testing/star/event/${CAMP}`);
  assert.equal(hashOf({ section: 'testing', testingPage: 'blackBelt', eventId: CAMP, eventTab: 'candidates' }), `#testing/black-belt/cycle/${CAMP}`);
  assert.equal(hashOf({ section: 'testing', testingPage: 'colorBelt', eventId: CAMP, eventTab: 'students' }), `#testing/color-belt/event/${CAMP}`);
});

console.log(`ALL EVENT REPORT CHECKS PASSED (${count})`);
