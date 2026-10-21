// mockFinance.js — the PREVIEW (fake) database for Finance: the Daily report, Close the day,
// History, Export and the reminder settings.
// Why it exists: preview mode (npm run dev:preview-mode) runs without Supabase. This file
// pretends to be migration 0011 (contract 0011 §1): the same 14 functions (13 + finance_export_preview), the same order of
// checks, the same status codes, the same staff / admin split and the same correction rules
// (financeRules.js — the exact code checks.mjs tests). What you see in preview is what the real
// dashboard will do.
//
// Where the money comes from:
//   - Color Belt payments: READ from the Testing preview store ('tkd.preview.testing'), the same
//     rows the roster's Mark paid / Undo / Edit payment write. Finance never changes them.
//   - Camp payments (v0.707): READ from the Camps preview store ('tkd.preview.camps', mockCamps.js),
//     a third source 'camp' exactly like the database's camp rows: what = 'camp', the event = the
//     camp's name, event_date = the camp's first day, school = the school whose desk took the
//     payment (each row's own school), the same edit / undo / mis-click chain rules.
//   - Star payments: Star testing has no preview database in this branch, so this file keeps a
//     few sample Star candidates and payments of its own (shown in the list below), including a
//     cash refund, a check refund, a refund-only day, an edit, a moved edit, an undone payment
//     and a 10-second mis-click undo (hidden).
// Its own store, 'tkd.preview.finance', keeps the closings (+ their counted-items snapshots),
// the reminder settings (times start Off, Q3), the export log, the Star sample and the pretend
// clock time. A few earlier Shrewsbury days start closed so History shows every tag.
//
// Like mockTestingEvents.js it is a "pure core": it never touches the browser by itself.
//   const finance = createFinanceBackend({ loadStore, saveStore, readColorBelt, readCamps, now, today, newId });
//     loadStore()     → the saved finance store (missing / damaged → the default sample)
//     saveStore(s)    → saves it
//     readColorBelt() → the Testing preview store (events, registrations, payments)
//     readCamps()     → the Camps preview store (camps, camp_days, camp_campers, camp_payments); optional
//     now()           → milliseconds (timestamps, the 10-second windows)
//     today()         → 'YYYY-MM-DD' in school time (setToday can pretend another date)
//   finance.rpc(name, args, ctx)   ctx = { signedIn, hasDataAccess, isAdmin, actorName, userId }
import {
  chainItems, summarize, expectedValues, closeResults, anyDifference, countsInTotals, fingerprintOf, schoolNow,
  weekdayOf, timeToMinutes, isReminderTime, isReminderDue, monthOf, daysOfMonth, daysBetweenInclusive,
  UNDO_CLOSE_WINDOW_MS, MAX_COUNT_CENTS, MAX_CHECKS, NOTE_MAX,
} from './finance/financeRules.js';
import { centsToCsvNumber } from './finance/csv.js';
import { addDays, isIsoDate, normalizeNote, SCHOOL_TIME_ZONE } from './testing/eventRules.js';

const STORE_FORMAT = 2; // bump when the store's shape changes (old stores are then replaced)
const SCHOOLS = ['worcester', 'shrewsbury']; // switcher order: Worcester, Shrewsbury
const SCHOOL_NAMES = { worcester: 'Worcester', shrewsbury: 'Shrewsbury' };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INT_MAX = 2147483647;
const HOUR_MS = 60 * 60 * 1000;
const SETTINGS_ID = '00000f00-0000-4000-8000-000000000001'; // finance_settings has exactly one row
const DESK = { id: '00000000-0000-4000-8000-0000000000d1', name: 'Staff' }; // the shared front-desk login
const ADMIN = { id: '00000000-0000-4000-8000-000000000001', name: 'Jeffrey Berg' }; // mockClient's FAKE_STAFF

// ----- The functions (contract 0011 §1.4): argument names and types, who may call -----

const RPC_ARGS = {
  finance_day: [['p_location_code', 'text'], ['p_day', 'date']],
  finance_day_both: [['p_day', 'date']],
  finance_history: [['p_location_code', 'text'], ['p_month', 'date']],
  finance_payment_detail: [['p_source', 'text'], ['p_payment_id', 'uuid']],
  finance_home: [],
  finance_close_day: [['p_location_code', 'text'], ['p_day', 'date'], ['p_expected_fingerprint', 'text'], ['p_cash_cents', 'int'],
    ['p_checks_count', 'int'], ['p_checks_cents', 'int'], ['p_card_cents', 'int'], ['p_note', 'text']],
  finance_undo_close: [['p_closing_id', 'uuid']],
  finance_reopen_day: [['p_location_code', 'text'], ['p_day', 'date'], ['p_expected_closing_id', 'uuid']],
  finance_export: [['p_location_code', 'text'], ['p_from', 'date'], ['p_to', 'date']],
  finance_export_preview: [['p_location_code', 'text'], ['p_from', 'date'], ['p_to', 'date']],
  finance_settings_get: [],
  finance_set_reminder_on: [['p_on', 'bool'], ['p_expected_version', 'int']],
  finance_set_reminder_time: [['p_location_code', 'text'], ['p_weekday', 'smallint'], ['p_time', 'time'], ['p_expected_version', 'int']],
  finance_copy_monday: [['p_expected_version', 'int']],
};
export const FINANCE_RPC_NAMES = Object.keys(RPC_ARGS);
// The functions that write (the failNextSave helper makes the next one of these fail).
export const FINANCE_WRITE_RPC_NAMES = [
  'finance_close_day', 'finance_undo_close', 'finance_reopen_day', 'finance_export', // export writes its log row
  'finance_set_reminder_on', 'finance_set_reminder_time', 'finance_copy_monday',
];
const ADMIN_ONLY = new Set([
  'finance_history', 'finance_reopen_day', 'finance_export', 'finance_export_preview', 'finance_settings_get',
  'finance_set_reminder_on', 'finance_set_reminder_time', 'finance_copy_monday',
]);

class DbError extends Error {
  constructor(code, message, httpStatus = 400) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

// Converts one JSON value to the database type, or throws like PostgreSQL would.
function toDbType(value, type) {
  if (value === null) return null;
  switch (type) {
    case 'text':
      if (typeof value === 'string') return value;
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      throw new DbError('22P02', `invalid input syntax for type text: ${JSON.stringify(value)}`);
    case 'uuid':
      if (typeof value === 'string' && UUID_PATTERN.test(value)) return value.toLowerCase();
      throw new DbError('22P02', `invalid input syntax for type uuid: "${value}"`);
    case 'int':
    case 'smallint': {
      let n = value;
      if (typeof value === 'string' && /^\s*[+-]?\d+\s*$/.test(value)) n = Number(value);
      if (typeof n !== 'number' || !Number.isInteger(n)) throw new DbError('22P02', `invalid input syntax for type integer: "${value}"`);
      if (Math.abs(n) > (type === 'smallint' ? 32767 : INT_MAX)) throw new DbError('22003', `value "${value}" is out of range for type ${type === 'smallint' ? 'smallint' : 'integer'}`);
      return n;
    }
    case 'bool':
      if (typeof value === 'boolean') return value;
      if (value === 'true' || value === 't') return true;
      if (value === 'false' || value === 'f') return false;
      throw new DbError('22P02', `invalid input syntax for type boolean: "${value}"`);
    case 'date':
      if (isIsoDate(value)) return value;
      // PostgreSQL also accepts the endless dates 'infinity' and '-infinity' (the functions then answer 'invalid').
      if (typeof value === 'string' && /^\s*[+-]?infinity\s*$/i.test(value)) return value.trim().startsWith('-') ? '-infinity' : 'infinity';
      throw new DbError('22007', `invalid input syntax for type date: "${value}"`);
    case 'time': {
      // 'HH:MM' or 'HH:MM:SS' → stored as 'HH:MM' (reminder times have no seconds).
      const minutes = timeToMinutes(value);
      if (minutes === null) throw new DbError('22007', `invalid input syntax for type time: "${value}"`);
      return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    }
    default:
      throw new Error(`unknown type ${type}`);
  }
}

// Matches the call's argument names to the function (all required) and converts them.
function readArgs(name, args) {
  const spec = RPC_ARGS[name];
  const sent = Object.keys(args ?? {}).filter((key) => args[key] !== undefined);
  const known = new Set(spec.map(([key]) => key));
  if (spec.some(([key]) => !sent.includes(key)) || sent.some((key) => !known.has(key))) {
    throw new DbError('PGRST202', `Could not find the function public.${name}(${[...sent].sort().join(', ')}) in the schema cache`, 404);
  }
  return Object.fromEntries(spec.map(([key, type]) => [key, toDbType(args[key], type)]));
}

// ----- Small helpers -----

// The earliest date any Finance function accepts (no school payments exist before it).
const MIN_DATE = '2020-01-01';
// true when any given date is endless or before 2020 -> the function answers 'invalid'.
const badDate = (...dates) => dates.some((d) => d !== null && (d === 'infinity' || d === '-infinity' || d < MIN_DATE));
// Invisible characters a note may not contain (tab and line break are fine): the same list as the
// database's testing_note_is_valid (migration 0005, 1c).
const NOTE_BAD_CHARACTER = /[\u0001-\u0008\u000b-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/;

const clone = (value) => JSON.parse(JSON.stringify(value));
const st = (status) => ({ status });
const pad12 = (n) => String(n).padStart(12, '0');
const fixedId = (kind, n) => `00000${kind}-0000-4000-8000-${pad12(n)}`; // e.g. 00000f20-0000-4000-8000-000000000001
const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const isoPlus = (iso, ms) => new Date(Date.parse(iso) + ms).toISOString();

// A clock time at the school ('2026-10-24', '17:10:00') → an ISO timestamp. Massachusetts is
// UTC−5 in winter and UTC−4 in summer; this tries both and keeps the one that reads back right.
const SCHOOL_CLOCK = new Intl.DateTimeFormat('en-CA', {
  timeZone: SCHOOL_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
function schoolClockToIso(dateIso, hhmmss) {
  const asUtc = Date.parse(`${dateIso}T${hhmmss}Z`);
  for (const hours of [5, 4]) {
    const ms = asUtc + hours * HOUR_MS;
    const p = Object.fromEntries(SCHOOL_CLOCK.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    if (`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}` === `${dateIso}T${hhmmss}`) return new Date(ms).toISOString();
  }
  return new Date(asUtc + 5 * HOUR_MS).toISOString();
}

// ----- Default preview data -----
// Sample Star testing (all dates count back from "today" T when the store is made):
// "Fall Star Testing" on T+21. Shrewsbury unless noted. $140 each.
const STAR_CANDIDATES = [
  // [n, first, last, school, private (days after T) or null]
  [1, 'Ava', 'Rossi', 'shrewsbury', null],
  [2, 'Liam', 'Walsh', 'shrewsbury', null],
  [3, 'Mason', 'Hill', 'shrewsbury', null],
  [4, 'Grace', 'Lee', 'shrewsbury', null],
  [5, 'Henry', 'Diaz', 'shrewsbury', null],
  [6, 'Zoe', 'Adams', 'shrewsbury', null],
  [7, 'Ella', 'Cruz', 'shrewsbury', null],
  [8, 'Leo', 'Park', 'shrewsbury', null],
  [9, 'Nora', 'Bell', 'shrewsbury', null],
  [10, 'Kai', 'Moreno', 'worcester', 10], // a private testing day → "Star testing · private <date>"
  [11, 'Ivy', 'Chen', 'shrewsbury', null],
  // More families for the two refund-heavy days (T−7 Shrewsbury, T−8 Worcester), added for the
  // CP1 walkthrough (Jeffrey asked for several days with lots of refunds).
  [12, 'Owen', 'Brooks', 'shrewsbury', null],
  [13, 'Maya', 'Singh', 'shrewsbury', null],
  [14, 'Lucas', 'Grant', 'shrewsbury', null],
  [15, 'Chloe', 'Ward', 'shrewsbury', null],
  [16, 'Ethan', 'Nguyen', 'shrewsbury', null],
  [17, 'Ruby', 'Hart', 'shrewsbury', null],
  [18, 'Jonah', 'Price', 'shrewsbury', null],
  [19, 'Ava', 'Kowalski', 'shrewsbury', null],
  [20, 'Sam', 'Ortiz', 'worcester', null],
  [21, 'Lily', 'Novak', 'worcester', null],
  [22, 'Theo', 'Baker', 'worcester', null],
  [23, 'Emma', 'Russo', 'worcester', null],
  [24, 'Noah', 'Fischer', 'worcester', null],
];
// [n, candidate n, kind, cents, method, paid_on (days from T), recorded [days from T, school clock], who, reverses n]
const STAR_PAYMENTS = [
  [1, 1, 'payment', 14000, 'check', 0, [0, '10:40:00'], DESK, null],
  [2, 2, 'payment', 14000, 'cash', 0, [0, '12:05:00'], DESK, null],
  [3, 3, 'payment', 14000, 'cash', -4, [-4, '18:00:00'], DESK, null],
  [4, 3, 'refund', -3500, 'cash', 0, [0, '11:50:00'], ADMIN, null], // a cash refund today
  [5, 4, 'payment', 14000, 'cash', -5, [-5, '17:30:00'], DESK, null],
  [6, 5, 'payment', 14000, 'check', -5, [-5, '17:45:00'], DESK, null],
  [7, 4, 'refund', -5000, 'cash', -2, [-2, '18:10:00'], ADMIN, null], // T−2 has refunds only:
  [8, 5, 'refund', -14000, 'check', -2, [-2, '18:20:00'], ADMIN, null], //   cash out + a check refund
  [9, 6, 'payment', 14000, 'cash', -1, [-1, '17:10:00'], DESK, null],
  [10, 6, 'reversal', -14000, 'cash', 0, [0, '09:30:00'], ADMIN, 9], // an edit (method only):
  [11, 6, 'payment', 14000, 'check', -1, [0, '09:30:00'], ADMIN, null], //   cash → check, same day
  [12, 7, 'payment', 14000, 'cash', -3, [-3, '18:30:00'], DESK, null],
  [13, 7, 'reversal', -14000, 'cash', -1, [-1, '10:00:00'], ADMIN, 12], // a moved edit: T−3 → T−1,
  [14, 7, 'payment', 14000, 'card', -1, [-1, '10:00:00'], ADMIN, null], //   cash → card (after T−3 closed)
  [15, 8, 'payment', 14000, 'card', 0, [0, '11:00:00'], DESK, null],
  [16, 8, 'reversal', -14000, 'card', 0, [0, '11:00:06'], DESK, 15], // undone 6 s later by the same login: hidden
  [17, 9, 'payment', 14000, 'cash', -1, [-1, '18:00:00'], DESK, null],
  [18, 9, 'reversal', -14000, 'cash', 0, [0, '10:15:00'], ADMIN, 17], // undone today by an admin
  [19, 10, 'payment', 14000, 'check', -2, [-2, '17:00:00'], DESK, null], // Worcester (candidate's school)
  [20, 11, 'payment', 14000, 'card', -6, [-6, '18:00:00'], DESK, null],
  // T−7, Shrewsbury: a busy day with LOTS of refunds — 8 payments ($1,120) and 6 refunds
  // ($445: cash $20, $35, $50, $140 and two by check, $140 and $60).
  [21, 12, 'payment', 14000, 'cash', -7, [-7, '10:05:00'], DESK, null],
  [22, 13, 'payment', 14000, 'cash', -7, [-7, '10:20:00'], DESK, null],
  [23, 14, 'payment', 14000, 'cash', -7, [-7, '10:45:00'], DESK, null],
  [24, 15, 'payment', 14000, 'cash', -7, [-7, '11:10:00'], DESK, null],
  [25, 16, 'payment', 14000, 'check', -7, [-7, '11:30:00'], DESK, null],
  [26, 17, 'payment', 14000, 'check', -7, [-7, '12:15:00'], DESK, null],
  [27, 18, 'payment', 14000, 'card', -7, [-7, '13:00:00'], DESK, null],
  [28, 19, 'payment', 14000, 'card', -7, [-7, '13:40:00'], DESK, null],
  [29, 12, 'refund', -2000, 'cash', -7, [-7, '15:05:00'], ADMIN, null], // overpaid $20
  [30, 13, 'refund', -3500, 'cash', -7, [-7, '15:20:00'], ADMIN, null],
  [31, 14, 'refund', -5000, 'cash', -7, [-7, '15:40:00'], ADMIN, null],
  [32, 15, 'refund', -14000, 'cash', -7, [-7, '16:10:00'], ADMIN, null], // full refund, cash
  [33, 16, 'refund', -14000, 'check', -7, [-7, '16:30:00'], ADMIN, null], // full refund by the school's check
  [34, 17, 'refund', -6000, 'check', -7, [-7, '17:00:00'], ADMIN, null],
  // T−8, Worcester: 5 payments ($700) and 5 refunds, one of them undone later the same day
  // (shows struck through as "Undone"); counted refunds $275.
  [35, 20, 'payment', 14000, 'cash', -8, [-8, '09:50:00'], DESK, null],
  [36, 21, 'payment', 14000, 'cash', -8, [-8, '10:30:00'], DESK, null],
  [37, 22, 'payment', 14000, 'check', -8, [-8, '11:15:00'], DESK, null],
  [38, 23, 'payment', 14000, 'cash', -8, [-8, '12:00:00'], DESK, null],
  [39, 24, 'payment', 14000, 'card', -8, [-8, '12:45:00'], DESK, null],
  [40, 20, 'refund', -2500, 'cash', -8, [-8, '14:00:00'], ADMIN, null],
  [41, 21, 'refund', -4000, 'cash', -8, [-8, '14:20:00'], ADMIN, null],
  [42, 22, 'refund', -14000, 'check', -8, [-8, '14:45:00'], ADMIN, null],
  [43, 23, 'refund', -7000, 'cash', -8, [-8, '15:30:00'], ADMIN, null],
  [44, 24, 'refund', -3000, 'cash', -8, [-8, '15:50:00'], ADMIN, null], // recorded by mistake …
  [45, 24, 'reversal', 3000, 'cash', -8, [-8, '16:30:00'], ADMIN, 44], //   … and undone 40 minutes later
];
// Earlier Shrewsbury days that start closed (History shows Over, Closed, Short, Changed after closing):
// [days from T, closed at, counted { cash, checks, checksCents, card } or 'expected', note]
const SAMPLE_CLOSINGS = [
  [-6, '20:30:00', { cash: 0, checks: 0, checksCents: 0, card: 14500 }, 'Card machine total included a $5 tip.'],
  [-5, '20:40:00', 'expected', null],
  [-4, '20:51:00', { cash: 12000, checks: 0, checksCents: 0, card: 0 }, 'Gave $20 change from the drawer to a parent.'],
  [-3, '21:00:00', 'expected', null],
];

// nowMs = the real clock. No sample row may be recorded later than that: otherwise, in an early-
// morning walkthrough, closing today would mark the samples "Added after closing". So when the
// latest of today's rows (12:05 PM) is still ahead, ALL of today's rows move earlier by the same
// amount (to end a minute before now). Moving them together keeps the edit pair at the same
// moment and the mis-click undo 6 seconds after its payment. (Very early, before about 2:40 AM,
// that means "recorded" late the evening before — harmless sample data.)
function defaultStar(t, nowMs) {
  const event = { id: fixedId('f10', 1), name: 'Fall Star Testing', testing_date: addDays(t, 21) };
  const candidates = STAR_CANDIDATES.map(([n, first, last, school, privateIn]) => ({
    id: fixedId('f11', n), event_id: event.id, first_name: first, last_name: last, location_code: school,
    private_on: privateIn === null ? null : addDays(t, privateIn), status: 'active',
  }));
  const planned = (atDays, at) => Date.parse(schoolClockToIso(addDays(t, atDays), at));
  const latestToday = Math.max(...STAR_PAYMENTS.filter((p) => p[6][0] === 0).map((p) => planned(0, p[6][1])));
  const shiftMs = Math.max(0, latestToday - (nowMs - 60 * 1000));
  const payments = STAR_PAYMENTS.map(([n, c, kind, cents, method, paidIn, [atDays, at], who, reverses]) => ({
    id: fixedId('f12', n), candidate_id: fixedId('f11', c), kind, amount_cents: cents, method,
    paid_on: addDays(t, paidIn), recorded_at: new Date(planned(atDays, at) - (atDays === 0 ? shiftMs : 0)).toISOString(),
    recorded_by: who.id, recorded_by_name: who.name, reverses_payment_id: reverses === null ? null : fixedId('f12', reverses),
  }));
  return { events: [event], candidates, payments };
}

// The whole default finance store, counting back from t.
function defaultStore(t, nowIso) {
  const store = {
    format: STORE_FORMAT,
    star: defaultStar(t, Date.parse(nowIso)),
    closings: [],
    closing_items: [],
    settings: { id: SETTINGS_ID, location_code: null, reminder_on: false, version: 1, updated_at: nowIso, updated_by_name: null },
    // Seeded Off for both schools (Q3): an admin sets the times after launch.
    reminder_times: SCHOOLS.flatMap((school) => [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
      id: fixedId('f13', SCHOOLS.indexOf(school) * 10 + weekday), location_code: school, weekday, remind_at: null,
    }))),
    exports: [],
    pretend_time: null, // setNow('HH:MM') — the school clock time the reminder uses
  };
  // The sample closings, each with the snapshot of what was counted AT THAT TIME (only Star
  // rows recorded before the close, so the later moved edit makes T−3 "Changed after closing").
  SAMPLE_CLOSINGS.forEach(([dayIn, at, counted, note], i) => {
    const day = addDays(t, dayIn);
    const closedAt = schoolClockToIso(day, at);
    const asOf = store.star.payments.filter((p) => Date.parse(p.recorded_at) <= Date.parse(closedAt));
    const items = chainItems(asOf.map((p) => ({ ...p, source: 'star' })))
      .filter((it) => it.day === day && countsInTotals(it.state));
    const { totals, refunds } = summarize(items);
    const expected = expectedValues(totals, refunds);
    const c = counted === 'expected'
      ? { cash: expected.cashCents, checks: expected.checksCount, checksCents: expected.checksCents, card: expected.cardCents }
      : counted;
    const closing = closeRow({
      id: fixedId('f14', i + 1), school: 'shrewsbury', day, at: closedAt, by: DESK, expected,
      counted: { cashCents: c.cash, checksCount: c.checks, checksCents: c.checksCents, cardCents: c.card }, note,
    });
    store.closings.push(closing);
    store.closing_items.push(...snapshotRows(closing, items, (n) => fixedId('f15', (i + 1) * 100 + n)));
  });
  return store;
}

// One finance_day_closings row of kind 'close'.
function closeRow({ id, school, day, at, by, expected, counted, note }) {
  return {
    id, location_code: school, day, kind: 'close', reverses_closing_id: null,
    cash_counted_cents: counted.cashCents, checks_counted: counted.checksCount,
    checks_counted_cents: counted.checksCents, card_counted_cents: counted.cardCents,
    expected_count: expected.count, expected_cash_cents: expected.cashCents, expected_checks: expected.checksCount,
    expected_checks_cents: expected.checksCents, expected_card_cents: expected.cardCents,
    note, recorded_at: at, recorded_by: by.id, recorded_by_name: by.name,
  };
}

// The finance_day_closing_items rows for a close: what was counted.
function snapshotRows(closing, countedItems, idOf) {
  return countedItems.map((it, n) => ({
    id: idOf(n + 1), closing_id: closing.id, location_code: closing.location_code, source: it.source,
    chain_id: it.payment_id, row_id: it.row_id, kind: it.kind, method: it.method, amount_cents: it.amount_cents,
  }));
}

// Is a loaded store usable? (Missing, damaged or an older shape → the default sample.)
function storeIsUsable(s) {
  if (!s || s.format !== STORE_FORMAT || !s.star || !s.settings) return false;
  const lists = [s.closings, s.closing_items, s.reminder_times, s.exports, s.star.events, s.star.candidates, s.star.payments];
  return lists.every(Array.isArray) && Number.isInteger(s.settings.version) && typeof s.settings.reminder_on === 'boolean';
}

// ----- The backend -----

export function createFinanceBackend({ loadStore, saveStore, readColorBelt, readCamps, now = () => Date.now(), today, newId }) {
  let failNext = false; // set by failNextSave()
  const stamp = () => new Date(now()).toISOString();
  // The day the sample counts back from: the pretend date, but never later than the real date
  // (so no sample payment is "recorded" in the future).
  const dataToday = () => {
    const clockDate = schoolNow(now()).day;
    const t = today();
    return t < clockDate ? t : clockDate;
  };

  function read() {
    let store = null;
    try {
      store = loadStore();
    } catch {
      store = null; // damaged → the default sample
    }
    return storeIsUsable(store) ? clone(store) : defaultStore(dataToday(), stamp());
  }
  const write = (db) => saveStore?.(db);

  // The school clock: today's (maybe pretend) date, and the pretend time from setNow if set.
  function schoolClock(db) {
    const day = today();
    const minutes = timeToMinutes(db.pretend_time) ?? schoolNow(now()).minutes;
    return { day, minutes, weekday: weekdayOf(day) };
  }

  // ----- The money items (§1.3), built from WHOLE histories, then filtered -----

  // The Camps preview store, or null when there is none (or it can't be read).
  function campsStore() {
    let cp = null;
    try {
      cp = readCamps?.() ?? null;
    } catch {
      cp = null;
    }
    const ok = cp && ['camps', 'camp_days', 'camp_campers', 'camp_payments'].every((k) => Array.isArray(cp[k]));
    return ok ? cp : null;
  }

  // Every item of all three sources, with the owner's name, school and event. Owners that no longer
  // exist (a deleted student or event) take their rows with them, like the database's cascades.
  function allItems(db) {
    let cb = null;
    try {
      cb = readColorBelt?.() ?? null;
    } catch {
      cb = null;
    }
    const out = [];
    if (cb && Array.isArray(cb.payments) && Array.isArray(cb.registrations) && Array.isArray(cb.events)) {
      const regs = new Map(cb.registrations.map((r) => [r.id, r]));
      const events = new Map(cb.events.map((e) => [e.id, e]));
      for (const it of chainItems(cb.payments.map((p) => ({ ...p, source: 'color_belt' })))) {
        const reg = regs.get(it.owner_id);
        const event = reg ? events.get(reg.event_id) : null;
        if (!event) continue;
        out.push({
          ...it, school: event.location_code, first_name: reg.first_name, last_name: reg.last_name,
          what: 'color_belt', event_date: event.testing_date, is_private: false, event_name: event.name, event_id: event.id,
        });
      }
    }
    // Camps (v0.707): the school is the shown row's own school (the desk that took the money).
    const cp = campsStore();
    if (cp) {
      const campers = new Map(cp.camp_campers.map((c) => [c.id, c]));
      const camps = new Map(cp.camps.map((c) => [c.id, c]));
      const rowsById = new Map(cp.camp_payments.map((p) => [p.id, p]));
      const firstDay = new Map();
      for (const d of cp.camp_days) if (!firstDay.has(d.camp_id) || d.day < firstDay.get(d.camp_id)) firstDay.set(d.camp_id, d.day);
      for (const it of chainItems(cp.camp_payments.map((p) => ({ ...p, source: 'camp' })))) {
        const camper = campers.get(it.owner_id);
        const camp = camper ? camps.get(camper.camp_id) : null;
        if (!camp) continue;
        out.push({
          ...it, school: rowsById.get(it.row_id)?.school ?? camp.location_code, first_name: camper.first_name, last_name: camper.last_name,
          what: 'camp', event_date: firstDay.get(camp.id) ?? null, is_private: false, event_name: camp.name, event_id: camp.id,
        });
      }
    }
    const cands = new Map(db.star.candidates.map((c) => [c.id, c]));
    const starEvents = new Map(db.star.events.map((e) => [e.id, e]));
    for (const it of chainItems(db.star.payments.map((p) => ({ ...p, source: 'star' })))) {
      const cand = cands.get(it.owner_id);
      const event = cand ? starEvents.get(cand.event_id) : null;
      if (!event) continue;
      out.push({
        ...it, school: cand.location_code, first_name: cand.first_name, last_name: cand.last_name,
        // A private Star testing shows its private date ("Star testing · private <date>").
        what: 'star', event_date: cand.private_on ?? event.testing_date, is_private: cand.private_on !== null, event_name: event.name, event_id: event.id,
      });
    }
    return out;
  }

  // The raw rows of one chain (for the payment detail's history).
  function chainRows(db, source) {
    let rows = [];
    if (source === 'star') rows = db.star.payments;
    else if (source === 'camp') rows = campsStore()?.camp_payments ?? [];
    else {
      try {
        rows = readColorBelt?.()?.payments ?? [];
      } catch {
        rows = [];
      }
    }
    return rows;
  }

  // ----- Closings -----

  // A close is "ended" when an undo or reopen points at it.
  const isEnded = (db, closingId) => db.closings.some((c) => c.reverses_closing_id === closingId);
  // The close that makes (school, day) closed now, or null.
  const currentClose = (db, school, day) => db.closings.find((c) => c.kind === 'close' && c.location_code === school && c.day === day && !isEnded(db, c.id)) ?? null;

  // Everything about one school's day that several functions need.
  function dayCore(db, items, school, day) {
    const shown = items
      .filter((it) => it.school === school && it.day === day && it.state !== 'hidden')
      .sort((a, b) => byText(a.recorded_at, b.recorded_at) || byText(a.last_name, b.last_name) || byText(a.payment_id, b.payment_id));
    const counted = shown.filter((it) => countsInTotals(it.state));
    const { totals, refunds } = summarize(shown);
    const expected = expectedValues(totals, refunds);
    const close = currentClose(db, school, day);
    let changedAfter = false;
    let changedCount = 0;
    if (close) {
      // Compare what is counted now with what was counted at the close, chain by chain.
      const key = (x) => `${x.source}|${x.chain_id ?? x.payment_id}`;
      const then = new Map(db.closing_items.filter((ci) => ci.closing_id === close.id).map((ci) => [key(ci), ci]));
      const nowMap = new Map(counted.map((it) => [key(it), it]));
      for (const [k, a] of nowMap) {
        const b = then.get(k);
        if (!b || b.row_id !== a.row_id || b.amount_cents !== a.amount_cents || b.method !== a.method || b.kind !== a.kind) changedCount += 1;
      }
      for (const k of then.keys()) if (!nowMap.has(k)) changedCount += 1;
      const expectedDiffers = close.expected_count !== expected.count || close.expected_cash_cents !== expected.cashCents
        || close.expected_checks !== expected.checksCount || close.expected_checks_cents !== expected.checksCents
        || close.expected_card_cents !== expected.cardCents;
      changedAfter = changedCount > 0 || expectedDiffers;
    }
    return { shown, counted, totals, refunds, expected, close, changedAfter, changedCount };
  }

  // A close's results in the database's shape (snake_case).
  function resultsOf(r) {
    return {
      cash: { result: r.cash.result, diff_cents: r.cash.diffCents },
      checks: { result: r.checks.result, diff_cents: r.checks.diffCents, count_result: r.checks.countResult, count_diff: r.checks.countDiff },
      card: { result: r.card.result, diff_cents: r.card.diffCents },
    };
  }
  const storedResults = (close) => closeResults(
    { cashCents: close.expected_cash_cents, checksCount: close.expected_checks, checksCents: close.expected_checks_cents, cardCents: close.expected_card_cents },
    { cashCents: close.cash_counted_cents, checksCount: close.checks_counted, checksCents: close.checks_counted_cents, cardCents: close.card_counted_cents },
  );

  // One item as the screens get it (§1.3 fields; `school` only where asked for).
  function itemOut(it, { withSchool = false, close = null } = {}) {
    const out = {
      source: it.source, payment_id: it.payment_id, day: it.day, time: schoolNow(it.recorded_at).time,
      first_name: it.first_name, last_name: it.last_name, what: it.what, event_date: it.event_date, is_private: it.is_private,
      kind: it.kind, method: it.method, amount_cents: it.amount_cents, state: it.state,
      was_amount_cents: it.was_amount_cents, was_method: it.was_method, moved_to: it.moved_to, moved_from: it.moved_from,
      changed_by_name: it.changed_by_name, changed_on: it.changed_on, recorded_by_name: it.recorded_by_name,
      // "Added after closing": counted on a closed day, and its chain began after the close.
      added_after_closing: Boolean(close) && countsInTotals(it.state) && Date.parse(it.chain_started_at) > Date.parse(close.recorded_at),
    };
    // Camp rows also carry the camp's name ('Camp · April Vacation Camp', v0.707). Color Belt and
    // Star rows are unchanged (their screens show the event date).
    if (it.source === 'camp') out.event_name = it.event_name;
    return withSchool ? { ...out, school: it.school } : out;
  }

  // The tag of one History row (most important first).
  function historyTag(core, day, t) {
    const { close } = core;
    if (day === t && !close) return { tag: 'today_open' };
    if (close && core.changedAfter) return { tag: 'changed_after_closing' };
    if (close) {
      const r = storedResults(close);
      for (const kind of ['short', 'over']) {
        const parts = ['cash', 'checks', 'card'].filter((p) => r[p].result === kind);
        if (parts.length) {
          // The largest difference of that kind (a checks count-only difference counts as 0 cents).
          const part = parts.reduce((best, p) => (r[p].diffCents > r[best].diffCents ? p : best), parts[0]);
          return { tag: kind, diff_cents: r[part].diffCents, diff_part: part };
        }
      }
      return { tag: 'closed' };
    }
    return { tag: core.counted.length > 0 ? 'not_closed' : 'no_payments' };
  }

  // ----- The functions -----

  const handlers = {
    finance_day(db, a, ctx) {
      const t = today();
      if (!ctx.isAdmin && a.p_day !== t) return st('not_allowed'); // staff: today only
      if (a.p_location_code === null || a.p_day === null || a.p_day > t || badDate(a.p_day)) return st('invalid');
      if (!SCHOOLS.includes(a.p_location_code)) return st('not_found');
      const core = dayCore(db, allItems(db), a.p_location_code, a.p_day);
      const { close } = core;
      const mine = close && close.recorded_by === ctx.userId && now() - Date.parse(close.recorded_at) < UNDO_CLOSE_WINDOW_MS;
      return {
        status: 'ok', day: a.p_day, school: a.p_location_code, fingerprint: fingerprintOf(core.shown),
        totals: core.totals, refunds: core.refunds,
        items: core.shown.map((it) => itemOut(it, { close })),
        closing: close ? {
          id: close.id, kind: close.kind, by_name: close.recorded_by_name, at: close.recorded_at,
          cash_counted_cents: close.cash_counted_cents, checks_counted: close.checks_counted,
          checks_counted_cents: close.checks_counted_cents, card_counted_cents: close.card_counted_cents,
          expected_count: close.expected_count, expected_cash_cents: close.expected_cash_cents, expected_checks: close.expected_checks,
          expected_checks_cents: close.expected_checks_cents, expected_card_cents: close.expected_card_cents,
          note: close.note, results: resultsOf(storedResults(close)),
          changed_after: core.changedAfter, changed_count: core.changedCount,
        } : null,
        can_close: !close && core.counted.length > 0,
        can_undo_until: mine ? isoPlus(close.recorded_at, UNDO_CLOSE_WINDOW_MS) : null,
      };
    },

    finance_day_both(db, a, ctx) {
      const t = today();
      if (!ctx.isAdmin && a.p_day !== t) return st('not_allowed');
      if (a.p_day === null || a.p_day > t || badDate(a.p_day)) return st('invalid');
      const items = allItems(db);
      const schools = SCHOOLS.map((code) => {
        const core = dayCore(db, items, code, a.p_day);
        return {
          code, name: SCHOOL_NAMES[code], count: core.totals.count, total_cents: core.totals.total_cents,
          cash_cents: core.totals.cash.cents, check_cents: core.totals.check.cents, card_cents: core.totals.card.cents,
          closed: Boolean(core.close),
        };
      });
      return {
        status: 'ok', day: a.p_day, schools,
        total_cents: schools.reduce((s, x) => s + x.total_cents, 0), count: schools.reduce((s, x) => s + x.count, 0),
      };
    },

    finance_history(db, a) {
      const t = today();
      if (a.p_month === null || badDate(a.p_month) || monthOf(a.p_month) > monthOf(t)) return st('invalid');
      if (a.p_location_code !== null && !SCHOOLS.includes(a.p_location_code)) return st('not_found');
      const schools = a.p_location_code === null ? SCHOOLS : [a.p_location_code];
      const items = allItems(db);
      const days = [];
      for (const day of daysOfMonth(a.p_month, t).reverse()) { // newest first
        for (const school of schools) {
          const core = dayCore(db, items, school, day);
          const { tag, diff_cents = null, diff_part = null } = historyTag(core, day, t);
          days.push({
            day, school, total_cents: core.totals.total_cents, count: core.totals.count, tag, diff_cents, diff_part,
            closed_by_name: core.close?.recorded_by_name ?? null, closed_at: core.close?.recorded_at ?? null,
          });
        }
      }
      return { status: 'ok', month: monthOf(a.p_month), unclosed_count: days.filter((d) => d.tag === 'not_closed').length, days };
    },

    finance_payment_detail(db, a, ctx) {
      if (a.p_source === null || a.p_payment_id === null || !['color_belt', 'star', 'camp'].includes(a.p_source)) return st('invalid');
      const items = allItems(db).filter((it) => it.source === a.p_source && it.payment_id === a.p_payment_id && it.state !== 'hidden');
      if (items.length === 0) return st('not_found'); // not a chain's first row (or a hidden mis-click)
      if (!ctx.isAdmin && !items.some((it) => it.day === today())) return st('not_allowed');
      // The chain's main item: where it counts now, or its original day when undone.
      const main = items.find((it) => ['counted', 'edited', 'moved_in'].includes(it.state))
        ?? items.find((it) => it.state === 'undone' && it.row_id === it.payment_id) ?? items[0];
      // Its history, newest first: recorded / refunded, each edit, the undo.
      const rows = chainRows(db, a.p_source).map((r) => ({ ...r, owner_id: r.registration_id ?? r.candidate_id ?? r.camper_id }));
      const ids = new Set();
      const history = [];
      const first = rows.find((r) => r.id === a.p_payment_id);
      if (first) {
        history.push({ at: first.recorded_at, by_name: first.recorded_by_name, what: first.kind === 'refund' ? 'refunded' : 'recorded', amount_cents: first.amount_cents, method: first.method, paid_on: first.paid_on });
        ids.add(first.id);
        let current = first;
        for (;;) {
          const reversal = rows.find((r) => r.kind === 'reversal' && r.reverses_payment_id === current.id);
          if (!reversal) break;
          const next = rows.find((r) => r.kind === 'payment' && !ids.has(r.id) && r.id !== current.id && r.owner_id === reversal.owner_id
            && Date.parse(r.recorded_at) === Date.parse(reversal.recorded_at) && r.recorded_by !== null && r.recorded_by === reversal.recorded_by);
          if (!next) {
            history.push({ at: reversal.recorded_at, by_name: reversal.recorded_by_name, what: 'undone', amount_cents: current.amount_cents, method: current.method, paid_on: reversal.paid_on });
            break;
          }
          history.push({ at: reversal.recorded_at, by_name: reversal.recorded_by_name, what: 'edited', amount_cents: next.amount_cents, method: next.method, paid_on: next.paid_on });
          ids.add(next.id);
          current = next;
        }
      }
      history.sort((x, y) => byText(y.at, x.at));
      const answer = { status: 'ok', item: itemOut(main, { withSchool: true, close: currentClose(db, main.school, main.day) }), event_name: main.event_name, event_id: main.event_id, history };
      if (a.p_source === 'camp') {
        // A camp payment's detail also lists the camper's camp days (v0.707: camper, camp, days).
        const cp = campsStore();
        const dayOf = new Map((cp?.camp_days ?? []).map((d) => [d.id, d.day]));
        answer.camp_days = (cp?.camp_camper_days ?? []).filter((r) => r.camper_id === main.owner_id).map((r) => dayOf.get(r.day_id)).filter(Boolean).sort();
      }
      return answer;
    },

    finance_home(db, a, ctx) {
      const clock = schoolClock(db);
      const items = allItems(db);
      const times = db.reminder_times.map((r) => ({ school: r.location_code, weekday: r.weekday, remind_at: r.remind_at }));
      const todayList = SCHOOLS.filter((school) => {
        const core = dayCore(db, items, school, clock.day);
        return isReminderDue(times, clock, { school, reminderOn: db.settings.reminder_on, hasPayments: core.counted.length > 0, closed: Boolean(core.close) });
      });
      let earlier = null;
      if (ctx.isAdmin) {
        // Days in the last 30 (not today) with payments that aren't closed, both schools, oldest
        // first — in all, and per school (only schools that have some; Home shows one line each on Both).
        earlier = { count: 0, first_day: null, by_school: {} };
        for (let n = 30; n >= 1; n -= 1) {
          const day = addDays(clock.day, -n);
          for (const school of SCHOOLS) {
            const core = dayCore(db, items, school, day);
            if (core.counted.length === 0 || core.close) continue;
            earlier.count += 1;
            earlier.first_day ??= day;
            earlier.by_school[school] ??= { count: 0, first_day: day };
            earlier.by_school[school].count += 1;
          }
        }
      }
      return { status: 'ok', today: todayList, earlier };
    },

    finance_close_day(db, a, ctx) {
      const t = today();
      if (!ctx.isAdmin && a.p_day !== t) return st('not_allowed'); // staff: today only
      // The arguments' shape.
      const counts = [a.p_cash_cents, a.p_checks_count, a.p_checks_cents, a.p_card_cents];
      if (a.p_location_code === null || a.p_day === null || a.p_day > t || badDate(a.p_day) || a.p_expected_fingerprint === null || counts.includes(null)) return st('invalid');
      if (a.p_cash_cents < -MAX_COUNT_CENTS || a.p_cash_cents > MAX_COUNT_CENTS) return st('invalid');
      if (a.p_checks_count < 0 || a.p_checks_count > MAX_CHECKS) return st('invalid');
      for (const cents of [a.p_checks_cents, a.p_card_cents]) if (cents < 0 || cents > MAX_COUNT_CENTS) return st('invalid');
      // The note is tidied like 0005's notes (line ends -> \n, blank ends trimmed); then at most
      // 500 characters and no invisible / control characters (tab and line break are fine).
      const note = normalizeNote(a.p_note) ?? '';
      if ([...note].length > NOTE_MAX || NOTE_BAD_CHARACTER.test(note)) return st('invalid');
      if (!SCHOOLS.includes(a.p_location_code)) return st('not_found');
      // Recompute the day now and compare.
      const core = dayCore(db, allItems(db), a.p_location_code, a.p_day);
      if (fingerprintOf(core.shown) !== a.p_expected_fingerprint) return st('stale');
      if (core.counted.length === 0) return st('nothing_to_close');
      if (core.close) return st('already_closed');
      // A negative cash count only when the drawer is expected to have paid money out (v0.209).
      if (a.p_cash_cents < 0 && core.expected.cashCents >= 0) return st('invalid');
      const counted = { cashCents: a.p_cash_cents, checksCount: a.p_checks_count, checksCents: a.p_checks_cents, cardCents: a.p_card_cents };
      const results = closeResults(core.expected, counted);
      if (anyDifference(results) && note === '') return { status: 'note_required', results: resultsOf(results) };
      const closing = closeRow({
        id: newId(), school: a.p_location_code, day: a.p_day, at: stamp(), by: { id: ctx.userId ?? null, name: ctx.actorName },
        expected: core.expected, counted, note: note === '' ? null : note,
      });
      db.closings.push(closing);
      db.closing_items.push(...snapshotRows(closing, core.counted, () => newId()));
      return { status: 'ok', closing_id: closing.id, results: resultsOf(results) };
    },

    finance_undo_close(db, a, ctx) {
      if (a.p_closing_id === null) return st('invalid');
      const close = db.closings.find((c) => c.id === a.p_closing_id && c.kind === 'close');
      if (!close) return st('not_found');
      if (isEnded(db, close.id)) return st('stale'); // already undone or reopened
      // Only the person who closed it, within 10 seconds (admins reopen instead).
      if (close.recorded_by !== ctx.userId || now() - Date.parse(close.recorded_at) >= UNDO_CLOSE_WINDOW_MS) return st('too_late');
      db.closings.push(endRow(close, 'undo', ctx));
      return st('ok');
    },

    finance_reopen_day(db, a, ctx) {
      if (a.p_location_code === null || a.p_day === null || a.p_expected_closing_id === null || a.p_day > today() || badDate(a.p_day)) return st('invalid');
      if (!SCHOOLS.includes(a.p_location_code)) return st('not_found');
      const close = currentClose(db, a.p_location_code, a.p_day);
      if (!close) return st('not_closed');
      if (close.id !== a.p_expected_closing_id) return st('stale');
      db.closings.push(endRow(close, 'reopen', ctx));
      return st('ok');
    },

    finance_export(db, a, ctx) {
      const refused = exportRangeProblem(a);
      if (refused) return st(refused);
      const rows = rangeItems(db, a)
        .map((it) => ({
          day: it.day, school: it.school, time: schoolNow(it.recorded_at).time, first_name: it.first_name, last_name: it.last_name,
          what: it.what, event_date: it.event_date, kind: it.kind, method: it.method, amount_cents: it.amount_cents,
          counted_cents: countsInTotals(it.state) ? it.amount_cents : 0, recorded_by_name: it.recorded_by_name, state: it.state,
          note: exportNote(it),
          ...(it.source === 'camp' ? { event_name: it.event_name } : {}), // camp rows: the camp's name (not a CSV column)
        }));
      db.exports.push({
        id: newId(), location_code: a.p_location_code, from_day: a.p_from, to_day: a.p_to, row_count: rows.length,
        downloaded_at: stamp(), downloaded_by: ctx.userId ?? null, downloaded_by_name: ctx.actorName,
      });
      return { status: 'ok', school: a.p_location_code, from: a.p_from, to: a.p_to, rows };
    },

    // The Export dialog's count line: counted payments in the range and the total that adds up
    // (net of refunds). Same rules as finance_export; reads only, nothing is logged.
    finance_export_preview(db, a) {
      const refused = exportRangeProblem(a);
      if (refused) return st(refused);
      const counted = rangeItems(db, a).filter((it) => countsInTotals(it.state));
      return {
        status: 'ok',
        count: counted.filter((it) => it.kind === 'payment').length,
        total_cents: counted.reduce((sum, it) => sum + it.amount_cents, 0),
      };
    },

    finance_settings_get(db) {
      const times = [...db.reminder_times]
        .sort((x, y) => SCHOOLS.indexOf(x.location_code) - SCHOOLS.indexOf(y.location_code) || x.weekday - y.weekday)
        .map((r) => ({ school: r.location_code, weekday: r.weekday, remind_at: r.remind_at }));
      return { status: 'ok', reminder_on: db.settings.reminder_on, version: db.settings.version, times };
    },

    finance_set_reminder_on(db, a, ctx) {
      if (a.p_on === null || a.p_expected_version === null) return st('invalid');
      if (a.p_expected_version !== db.settings.version) return st('stale');
      if (db.settings.reminder_on === a.p_on) return { status: 'ok', version: db.settings.version }; // nothing changed
      db.settings.reminder_on = a.p_on;
      return bumpSettings(db, ctx);
    },

    finance_set_reminder_time(db, a, ctx) {
      if (a.p_location_code === null || a.p_weekday === null || a.p_expected_version === null) return st('invalid');
      if (a.p_weekday < 1 || a.p_weekday > 7 || (a.p_time !== null && !isReminderTime(a.p_time))) return st('invalid');
      if (!SCHOOLS.includes(a.p_location_code)) return st('not_found');
      if (a.p_expected_version !== db.settings.version) return st('stale');
      const row = db.reminder_times.find((r) => r.location_code === a.p_location_code && r.weekday === a.p_weekday);
      if (row.remind_at === a.p_time) return { status: 'ok', version: db.settings.version }; // nothing changed
      row.remind_at = a.p_time;
      return bumpSettings(db, ctx);
    },

    finance_copy_monday(db, a, ctx) {
      if (a.p_expected_version === null) return st('invalid');
      if (a.p_expected_version !== db.settings.version) return st('stale');
      let changed = false;
      for (const school of SCHOOLS) {
        const monday = db.reminder_times.find((r) => r.location_code === school && r.weekday === 1).remind_at;
        for (const r of db.reminder_times) {
          if (r.location_code === school && r.weekday >= 2 && r.weekday <= 5 && r.remind_at !== monday) {
            r.remind_at = monday;
            changed = true;
          }
        }
      }
      // Nothing to copy -> the same version (a second click doesn't make other Settings screens stale).
      return changed ? bumpSettings(db, ctx) : { status: 'ok', version: db.settings.version };
    },
  };

  // Why an export range is refused ('invalid' / 'not_found'), or null when it is fine: one school,
  // real dates from 2020 on, from <= to <= today, at most 366 days.
  function exportRangeProblem(a) {
    if (a.p_location_code === null || a.p_from === null || a.p_to === null || badDate(a.p_from, a.p_to)) return 'invalid';
    if (a.p_from > a.p_to || a.p_to > today() || daysBetweenInclusive(a.p_from, a.p_to) > 366) return 'invalid';
    if (!SCHOOLS.includes(a.p_location_code)) return 'not_found';
    return null;
  }

  // The shown (non-hidden) items of one school in a date range, oldest first.
  function rangeItems(db, a) {
    return allItems(db)
      .filter((it) => it.school === a.p_location_code && it.day >= a.p_from && it.day <= a.p_to && it.state !== 'hidden')
      .sort((x, y) => byText(x.day, y.day) || byText(x.recorded_at, y.recorded_at) || byText(x.last_name, y.last_name));
  }

  // An 'undo' or 'reopen' row ending a close.
  function endRow(close, kind, ctx) {
    return {
      id: newId(), location_code: close.location_code, day: close.day, kind, reverses_closing_id: close.id,
      cash_counted_cents: null, checks_counted: null, checks_counted_cents: null, card_counted_cents: null,
      expected_count: null, expected_cash_cents: null, expected_checks: null, expected_checks_cents: null, expected_card_cents: null,
      note: null, recorded_at: stamp(), recorded_by: ctx.userId ?? null, recorded_by_name: ctx.actorName,
    };
  }

  // Every settings change raises the version (open Settings screens then get 'stale').
  function bumpSettings(db, ctx) {
    db.settings.version += 1;
    db.settings.updated_at = stamp();
    db.settings.updated_by_name = ctx.actorName;
    return { status: 'ok', version: db.settings.version };
  }

  // ----- Answers in the Supabase client's shape -----

  const ok = (data) => ({ data, error: null, count: null, status: 200, statusText: 'OK' });
  const fail = (code, message, status = 403) => ({
    data: null, error: { code, message, details: null, hint: null }, count: null, status,
    statusText: status === 404 ? 'Not Found' : status === 403 ? 'Forbidden' : 'Bad Request',
  });

  // supabase.rpc(name, args) for the 14 Finance functions.
  function rpc(name, args = {}, ctx = {}) {
    if (!(name in handlers)) return fail('PGRST202', `Could not find the function public.${name} in the schema cache`, 404);
    if (failNext && FINANCE_WRITE_RPC_NAMES.includes(name)) {
      failNext = false; // pretend the connection dropped: nothing changes (failNextSave helper)
      return { data: null, error: { message: 'Failed to fetch (preview: failNextSave)' }, count: null, status: 0, statusText: '' };
    }
    if (!ctx.signedIn) return fail('42501', `permission denied for function ${name}`);
    let parsed;
    try {
      parsed = readArgs(name, args);
    } catch (error) {
      if (error instanceof DbError) return fail(error.code, error.message, error.httpStatus);
      throw error;
    }
    // has_data_access FIRST, then the role (§1.1).
    if (!ctx.hasDataAccess) return ok(st('no_access'));
    if (ADMIN_ONLY.has(name) && !ctx.isAdmin) return ok(st('not_allowed'));
    const db = read(); // a private copy = a transaction: only an 'ok' write is saved
    const answer = handlers[name](db, parsed, {
      actorName: ctx.actorName ?? 'Database admin', userId: ctx.userId ?? null, isAdmin: Boolean(ctx.isAdmin),
    });
    if (answer.status === 'ok' && FINANCE_WRITE_RPC_NAMES.includes(name)) write(db);
    return ok(answer);
  }

  // ----- Test helpers (console helpers in mockClient.js, and checks.mjs) -----

  function failNextSave() {
    failNext = true;
  }

  // setNow('19:30'): pretend the school clock says 7:30 PM (for the Home reminder). null = real time.
  function setNow(hhmm) {
    if (hhmm !== null && timeToMinutes(hhmm) === null) return false;
    const db = read();
    db.pretend_time = hhmm === null ? null : toDbType(hhmm, 'time');
    write(db);
    return true;
  }

  // Back to the default sample: no closings but the sample ones, reminder times Off, no exports.
  function reset() {
    write(defaultStore(dataToday(), stamp()));
  }

  return { rpc, failNextSave, setNow, reset, snapshot: read };
}

// The export's note for a corrected line (plain words in the file, like the database writes them).
function exportNote(it) {
  if (it.state === 'edited' || it.state === 'moved_in') return `was $${centsToCsvNumber(it.was_amount_cents)} ${it.was_method}`;
  if (it.state === 'moved_out') return `moved to ${it.moved_to}`;
  if (it.state === 'undone') return `undone by ${it.changed_by_name} on ${it.changed_on}`;
  return null;
}
