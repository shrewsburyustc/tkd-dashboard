// mockBreaking.js — the PREVIEW (fake) database for Board breaking (contract CONTRACT-0051, signatures SIGNATURES-0051).
// Why it exists: preview mode (npm run dev:preview-mode) runs without Supabase. This file pretends to be what
// migration 0051 adds for the STAFF screens: the settings row, the board chart, events with their class times,
// registrations, append-only payments, the Square "need a look" list and every staff function of the sheet — with
// the same order of checks, the same status words, the same staff / admin split, the version (`stale`) check, the
// 10-second Undo window for staff, the price maths (cash / check discount, event-day extra, override) and the delete rules.
// What you see in preview is what the real dashboard will do. (The PUBLIC functions — brk_public_*,
// brk_square_payment — belong to the family page and the Square Function and are built later; here they answer
// "permission denied", as they do for a signed-in person on the real database.)
//
// Like mockCamps.js it is a "pure core": it never touches the browser by itself.
//   const brk = createBreakingBackend({ loadStore, saveStore, now, today, newId });
//     loadStore()  → the saved store object (mockClient: localStorage 'tkd.preview.breaking'), or null / damaged → seed
//     saveStore()  → saves the whole store
//     now()        → milliseconds (timestamps, the Undo window)
//     today()      → 'YYYY-MM-DD' in school time (setToday can pretend another date)
//     newId()      → a new uuid
//   brk.rpc(name, args, ctx)   ctx = { signedIn, hasDataAccess, isAdmin, actorName, userId }
//   brk.failNextSave()   the next save fails like a dropped connection (mockClient: failNextSave helper)
//   brk.simulateOtherAdminEdit()  every event / student / the settings row gets a newer version (open dialogs go stale)
//   brk.reset()          back to the seed;  brk.snapshot()  the saved data (for Finance's later reader)
//   brk.addNeedsLook()   adds one Square payment "that needs a look" for the first upcoming event (a preview helper)
//
// The store is RE-READ ON EVERY CALL (no copy is kept in memory), so two tabs always see each other's changes.
// Every function works on a private copy and saves it only when the answer is 'ok' (= a database transaction).
//
// Store (schema 2), column names are the database's (snake_case):
//   settings (one object, with version), chart [], events [], classes [], registrations [], payments [],
//   square_events [], cleared_links [] (brk_cleared_links: an order id whose Square link was cleared), change_log []
//   (what the triggers log for registrations and payments: History reads it)
//
// This file follows the FINAL migration (supabase/migrations/0051_board_breaking.sql) and SIGNATURES-0051.md: the migration's rank names
// and sort, its price lookup (brk_price: a rank must exist in the student's age group), the Square link rules (set override, Edit student,
// Mark paid by another way and Edit payment clear the link; brk_cleared_links remembers the order), the roster's needs_look rows (with the
// student's name on link_cleared rows), the date window of Add / Edit event, and the chart / class / name rules. Choices the migration
// makes that are easy to miss: a new event starts with registration closed; Edit student keeps the student's own same-day rule;
// brk_set_override answers what is owed now; a refund is at most what is overpaid; Mark paid by a different way does NOT re-price.
import { addDays, isIsoDate, todayInSchoolTime } from './testing/eventRules.js';
import { nameProblem, normalizeName } from './testing/names.js';

const SCHEMA_VERSION = 2; // 2: the migration's final rank names (no " belt"), cleared links, needs-look names
const LOCATION_CODES = ['worcester', 'shrewsbury'];
const PAYING_BY = ['cash', 'check', 'card'];
const BANDS = ['tiger', 'child', 'teen', 'black'];
const UNDO_WINDOW_MS = 10 * 1000;
const MAX_PAYMENT_CENTS = 1000000;
const MAX_REFUND_CENTS = 1000000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no i, l, o, 0, 1 (look-alikes), as Camps
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;
const ADMIN_USER_ID = '00000000-0000-4000-8000-000000000001'; // Jeffrey (mockClient's FAKE_STAFF)
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const clone = (value) => JSON.parse(JSON.stringify(value));
const sum = (list) => list.reduce((total, n) => total + n, 0);
const st = (status) => ({ status });
const inRange = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;

// ----- The board chart's starting numbers: the migration's own seed (0051, section 12), rank names and sort (from 0) exactly -----
// [band, rank_name, technique, tech, adult]
const TEEN_ORANGE = 'Front Snap Kick'; // Teen / Adult's Orange technique differs from Child's (Flying Side Kick)
const BELTS = [
  ['White', 'Hammer Fist'], ['Yellow', 'Elbow Strike'], ['Orange', 'Flying Side Kick'], ['Green', 'Axe Kick'], ['High Green', 'Round House Kick'],
  ['Blue', 'Punch'], ['High Blue', 'Jumping Front Snap Kick'], ['Purple', 'Back Kick'], ['Red', 'Spinning Round House'],
  ['High Red', 'Skipping Hook Kick'], ['Brown', 'Back Hook Kick'], ['High Brown', 'Back Kick (Adult Board)'],
  ['Red / Black', 'Back Kick / Axe (Adult Board)'], ['Bo-Dan / Deputy', 'Back Hook + Spinning Round House + 3 Power Breaking'],
];
const CHILD_BOARDS = { Blue: [4, 0], 'High Blue': [4, 0], Purple: [4, 0], Red: [4, 0], 'High Red': [4, 0], Brown: [4, 0], 'High Brown': [3, 1], 'Red / Black': [2, 2], 'Bo-Dan / Deputy': [2, 3] };
const TEEN_BOARDS = { Blue: [1, 3], 'High Blue': [1, 3], Purple: [1, 3], Red: [1, 3], 'High Red': [1, 3], Brown: [1, 3], 'High Brown': [1, 3], 'Red / Black': [1, 4], 'Bo-Dan / Deputy': [2, 3] };
const SEED_ROWS = [
  ...['Little Tiger White', 'Little Tiger Yellow', 'Little Tiger Green', 'Little Tiger Blue', 'Little Tiger Red', 'Little Tiger Black'].map((name, i) => (
    ['tiger', name, ['Hammer Fist', 'Hammer Fist', 'Elbow Strike', 'Elbow Strike', 'Axe Kick', 'Axe Kick'][i], 3, 0])),
  ...BELTS.map(([name, technique]) => ['child', name, technique, ...(CHILD_BOARDS[name] ?? [3, 0])]),
  ...BELTS.map(([name, technique]) => ['teen', name, name === 'Orange' ? TEEN_ORANGE : technique, ...(TEEN_BOARDS[name] ?? [0, 3])]),
  ...[
    ['1st Dan', 'Back Hook + Spinning Round House + Power Breaking', 4], ['1st Dan 1 Star', 'Side Kick Punch', 4], ['1st Dan 2 Star', 'Eagle', 4],
    ['1st Dan 3 Star', 'Side Kick / Back Kick', 4], ['1st Dan 4 Star', '7 Station + Power Breaking', 7], ['2nd Dan', '7 Station + Power Breaking', 7],
    ['2nd Dan 1 Star', '3 Kicks in Air', 6], ['2nd Dan 2 Star', '3 Kicks in Air', 6], ['2nd Dan 3 Star', '3 Kicks in Air', 6], ['3rd Dan', '3 Kicks in Air', 6],
    ['3rd Dan 1 Star', '3 Kicks in Air', 6], ['3rd Dan 2 Star', '3 Kicks in Air', 6], ['3rd Dan 3 Star', '3 Kicks in Air', 6],
    ['3rd Dan 4 Star', '3 Kicks in Air', 6], ['3rd Dan 5 Star', '4 Adult Board Back Kick', 6],
  ].map(([name, technique, tech]) => ['black', name, technique, tech, 3]),
];
function seedChart(makeId) {
  const sorts = {};
  return SEED_ROWS.map(([band, rank_name, technique, tech_boards, adult_boards]) => {
    sorts[band] = sorts[band] === undefined ? 0 : sorts[band] + 1; // sort counts from 0 inside each group, as the migration's seed does
    return { id: makeId(), band, rank_name, sort: sorts[band], technique, tech_boards, adult_boards };
  });
}

// ----- The sample events (made-up names only) -----
const CLASSES = [
  ['Group D', '16:20', '17:00'], ['White / Little Tiger', '17:10', '17:50'], ['Group A', '18:00', '18:40'],
  ['Group B+C', '18:50', '19:30'], ['Teen / Adult', '19:40', '20:20'],
];
// [first, last, age, rank, class index, tech, adult, paying_by, state ('paid' | 'unpaid' | 'link' | 'desk_card'), broke, same_day]
// 'paid' by card = a Square payment (no staff login); 'desk_card' = a card payment staff took at the desk (Finance's preview shows both).
const NOVEMBER_STUDENTS = [
  ['Ava', 'Reed', 8, 'Orange', 0, 4, 0, 'cash', 'paid', true, false],
  ['Mia', 'Santos', 9, 'Green', 0, 4, 0, 'cash', 'paid', true, true],
  ['Owen', 'Reed', 8, 'High Green', 0, 4, 0, 'cash', 'unpaid', false, false],
  ['Eli', 'Park', 6, 'Little Tiger Yellow', 1, 3, 0, 'card', 'link', false, false],
  ['Ben', 'Torres', 7, 'White', 1, 4, 0, 'check', 'unpaid', false, false],
  ['Zoe', 'Park', 10, 'Red', 2, 3, 1, 'check', 'paid', false, false],
  ['Noah', 'Kim', 12, 'Red / Black', 2, 2, 2, 'cash', 'unpaid', false, false],
  ['Cara', 'Lin', 14, 'High Blue', 4, 1, 3, 'card', 'paid', false, false],
  ['Gia', 'Chen', 13, 'Purple', 4, 2, 1, 'cash', 'paid', false, false],
  ['Leo', 'Brooks', 16, '1st Dan', 4, 4, 3, 'cash', 'unpaid', false, false],
];
const OTHER_NAMES = [
  ['Ivy', 'Nolan', 7, 'Yellow', 0, 4, 0], ['Max', 'Ortiz', 11, 'Blue', 3, 4, 0], ['Lena', 'Hart', 9, 'Orange', 0, 3, 0],
  ['Theo', 'Vega', 15, 'Brown', 4, 1, 3], ['Nina', 'Cole', 10, 'Red', 2, 4, 0], ['Jack', 'Wells', 6, 'Little Tiger Green', 1, 3, 0],
  ['Ruby', 'Shaw', 12, 'Green', 0, 3, 0], ['Finn', 'Dunn', 8, 'White', 1, 3, 0],
];

function defaultBreakingData({ today, makeId, nowIso }) {
  const settings = { id: 1, tech_cents: 300, adult_cents: 400, card_extra_cents: 25, same_day_extra_cents: 100, child_max_age: 12, version: 1 };
  const db = { schema: SCHEMA_VERSION, settings, chart: seedChart(makeId), events: [], classes: [], registrations: [], payments: [], square_events: [], cleared_links: [], change_log: [] };
  const cfg = {
    price: (tech, adult, card, same) => tech * (300 + (card ? 25 : 0) + (same ? 100 : 0)) + adult * (400 + (card ? 25 : 0) + (same ? 100 : 0)),
  };
  const used = new Set();
  const newCode = () => {
    let code;
    do code = Array.from({ length: 8 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
    while (used.has(code));
    used.add(code);
    return code;
  };
  const nameFor = (date) => `${MONTHS[Number(date.slice(5, 7)) - 1]} Board Breaking`;
  function addEvent(location_code, date, open, name = nameFor(date)) {
    const event = { id: makeId(), name, location_code, event_date: date, registration_open: open, public_code: newCode(), version: 1, created_at: nowIso, created_by_name: 'Jeffrey Berg', updated_at: nowIso, updated_by_name: 'Jeffrey Berg' };
    db.events.push(event);
    CLASSES.forEach(([cname, start, end], index) => db.classes.push({ id: makeId(), event_id: event.id, name: cname, start_time: start, end_time: end, sort: index + 1 }));
    return event;
  }
  function addStudent(event, [first, last, age, rank, classIndex, tech, adult, paying_by, state, broke, same], paidOn) {
    const cls = db.classes.filter((c) => c.event_id === event.id).sort((a, b) => a.sort - b.sort)[classIndex];
    const amount = cfg.price(tech, adult, paying_by === 'card', same);
    const row = {
      id: makeId(), event_id: event.id, class_id: cls.id, first_name: first, last_name: last, age, rank_name: rank,
      band_used: /^Little Tiger/.test(rank) ? 'tiger' : db.chart.some((c) => c.band === 'black' && c.rank_name === rank) ? 'black' : age <= 12 ? 'child' : 'teen',
      tech_boards: tech, adult_boards: adult, paying_by, paying_by_on_form: paying_by, same_day: same, amount_cents: amount, override_cents: null,
      square_order_id: state === 'link' ? `ord_${first.toLowerCase()}` : null, square_link_url: state === 'link' ? `https://square.example.invalid/pay/${first.toLowerCase()}` : null,
      source: same ? 'desk' : 'form', broke: Boolean(broke), broke_on: broke ? paidOn : null, entered_by_name: same ? 'Jeffrey Berg' : null,
      version: 1, created_at: nowIso, created_by_name: same ? 'Jeffrey Berg' : 'Family form', updated_at: nowIso, updated_by_name: same ? 'Jeffrey Berg' : 'Family form',
    };
    db.registrations.push(row);
    if (state === 'paid' || state === 'desk_card') {
      const bySquare = paying_by === 'card' && state === 'paid';
      db.payments.push({
        id: makeId(), registration_id: row.id, kind: 'payment', amount_cents: amount, method: paying_by, paid_on: paidOn, school: event.location_code,
        recorded_at: nowIso, recorded_by: bySquare ? null : ADMIN_USER_ID, recorded_by_name: bySquare ? 'Square' : 'Jeffrey Berg', reverses_payment_id: null, paying_by_before: null,
      });
    }
    return row;
  }
  const upcoming = addEvent('shrewsbury', addDays(today, 8), true);
  NOVEMBER_STUDENTS.forEach((s) => addStudent(upcoming, s, today));
  addEvent('shrewsbury', addDays(today, 36), false);
  const worcester = addEvent('worcester', addDays(today, 8), true);
  // Worcester: two cash payments, one card payment taken at the desk (the third), one still unpaid.
  OTHER_NAMES.slice(0, 4).forEach((s, i) => addStudent(worcester, [...s, i === 2 ? 'card' : 'cash', i < 2 ? 'paid' : i === 2 ? 'desk_card' : 'unpaid', false, false], today));
  const past = addEvent('shrewsbury', addDays(today, -20), false);
  OTHER_NAMES.forEach((s) => addStudent(past, [...s, 'cash', 'paid', true, false], addDays(today, -20)));
  const older = addEvent('shrewsbury', addDays(today, -55), false);
  OTHER_NAMES.slice(0, 5).forEach((s) => addStudent(older, [...s, 'check', 'paid', true, false], addDays(today, -55)));
  // A refund for Finance's preview: Zoe Park's price was lowered to $9.00 (an admin's override) after her family paid $13.00 by check, so
  // $4.00 was handed back by check today at the event's school.
  const zoe = db.registrations.find((r) => r.first_name === 'Zoe' && r.event_id === upcoming.id);
  zoe.override_cents = 900;
  db.payments.push({
    id: makeId(), registration_id: zoe.id, kind: 'refund', amount_cents: -400, method: 'check', paid_on: today, school: upcoming.location_code,
    recorded_at: nowIso, recorded_by: ADMIN_USER_ID, recorded_by_name: 'Jeffrey Berg', reverses_payment_id: null, paying_by_before: null,
  });
  // Two Square payments an admin should look at (for the upcoming Shrewsbury event's school).
  db.square_events.push(
    { square_event_id: 'sqe_demo_1', school: 'shrewsbury', received_at: nowIso, type: 'payment.updated', payment_id: 'pay_demo_1', order_id: 'ord_eli', amount_cents: 1000, outcome: 'amount_mismatch', registration_id: null, reviewed: false },
    { square_event_id: 'sqe_demo_2', school: 'shrewsbury', received_at: nowIso, type: 'payment.updated', payment_id: 'pay_demo_2', order_id: 'ord_unknown', amount_cents: 1600, outcome: 'unknown_order', registration_id: null, reviewed: false },
  );
  return db;
}

const LISTS = ['chart', 'events', 'classes', 'registrations', 'payments', 'square_events', 'cleared_links', 'change_log'];
function storeIsUsable(store) {
  return Boolean(store) && typeof store === 'object' && store.schema === SCHEMA_VERSION && store.settings && typeof store.settings === 'object'
    && LISTS.every((k) => Array.isArray(store[k]));
}

// ----- The functions and who may call them -----
const ID = (name) => [name, 'uuid'];
const RPC_ARGS = {
  brk_settings_get: [],
  brk_events_list: [['p_location_code', 'text']],
  brk_event_roster: [ID('p_event_id')],
  brk_registration_history: [ID('p_registration_id')],
  brk_add_event: [['p_name', 'text'], ['p_location_code', 'text'], ['p_event_date', 'date'], ['p_copy_classes_from', 'uuid']],
  brk_update_event: [ID('p_event_id'), ['p_expected_version', 'int'], ['p_name', 'text'], ['p_event_date', 'date'], ['p_registration_open', 'bool']],
  brk_delete_event: [ID('p_event_id'), ['p_expected_version', 'int']],
  brk_save_classes: [ID('p_event_id'), ['p_expected_version', 'int'], ['p_classes', 'jsonb']],
  brk_add_student: [ID('p_event_id'), ['p_first_name', 'text'], ['p_last_name', 'text'], ['p_age', 'int'], ['p_rank_name', 'text'], ID('p_class_id'),
    ['p_tech', 'int'], ['p_adult', 'int'], ['p_paying_by', 'text']],
  brk_edit_registration: [ID('p_registration_id'), ['p_expected_version', 'int'], ['p_first_name', 'text'], ['p_last_name', 'text'], ['p_age', 'int'],
    ['p_rank_name', 'text'], ID('p_class_id'), ['p_tech', 'int'], ['p_adult', 'int'], ['p_paying_by', 'text']],
  brk_set_override: [ID('p_registration_id'), ['p_expected_version', 'int'], ['p_override_cents', 'int']],
  brk_set_broke: [ID('p_registration_id'), ['p_expected_version', 'int'], ['p_broke', 'bool']],
  brk_mark_paid: [ID('p_registration_id'), ['p_expected_version', 'int'], ['p_school', 'text'], ['p_method', 'text']],
  brk_undo_payment: [ID('p_payment_id')],
  brk_edit_payment: [ID('p_payment_id'), ['p_method', 'text'], ['p_amount_cents', 'int'], ['p_paid_on', 'date'], ['p_school', 'text']],
  brk_record_refund: [ID('p_registration_id'), ['p_expected_version', 'int'], ['p_method', 'text'], ['p_amount_cents', 'int'], ['p_refunded_on', 'date'], ['p_school', 'text']],
  brk_undo_refund: [ID('p_payment_id')],
  brk_delete_registration: [ID('p_registration_id'), ['p_expected_version', 'int']],
  brk_save_settings: [['p_expected_version', 'int'], ['p_tech_cents', 'int'], ['p_adult_cents', 'int'], ['p_card_extra_cents', 'int'], ['p_same_day_extra_cents', 'int'], ['p_child_max_age', 'int']],
  brk_save_chart: [['p_expected_version', 'int'], ['p_rows', 'jsonb']],
  brk_dismiss_square_event: [['p_square_event_id', 'text']],
};
// Admin-only functions (the database checks has_data_access() first, then is_admin()).
const ADMIN_ONLY = new Set(['brk_add_event', 'brk_update_event', 'brk_delete_event', 'brk_save_classes', 'brk_set_override', 'brk_edit_payment',
  'brk_record_refund', 'brk_undo_refund', 'brk_delete_registration', 'brk_save_settings', 'brk_save_chart', 'brk_dismiss_square_event']);
export const BRK_RPC_NAMES = Object.keys(RPC_ARGS);
export const BRK_READ_RPC_NAMES = ['brk_settings_get', 'brk_events_list', 'brk_event_roster', 'brk_registration_history'];
export const BRK_WRITE_RPC_NAMES = BRK_RPC_NAMES.filter((n) => !BRK_READ_RPC_NAMES.includes(n));
// Only the family page's login or the Square Function's login may call these: for anyone else, "permission denied".
export const BRK_RESTRICTED_RPC_NAMES = ['brk_public_event', 'brk_public_signup', 'brk_public_registration', 'brk_public_set_link', 'brk_square_payment'];
export const BRK_STORE_KEY = 'tkd.preview.breaking';

// A value sent as an argument → the type the database function wants, or the 'invalid' marker (a missing
// argument is null, as SQL passes it).
const BAD = Symbol('bad');
function toDbType(value, type) {
  if (value === undefined || value === null) return null;
  switch (type) {
    case 'uuid': return typeof value === 'string' && UUID_PATTERN.test(value) ? value : BAD;
    case 'text': return typeof value === 'string' ? value : BAD;
    case 'int': return Number.isInteger(value) ? value : BAD;
    case 'bool': return typeof value === 'boolean' ? value : BAD;
    case 'date': return typeof value === 'string' && isIsoDate(value) ? value : BAD;
    case 'jsonb': return typeof value === 'object' ? value : BAD;
    default: return BAD;
  }
}

const DB_ERROR_STATUS = { 22: 400, 23: 409 };
function fail(code, message, status = 400) {
  return { data: null, error: { code, message, details: null, hint: null }, count: null, status, statusText: '' };
}
const ok = (data) => ({ data, error: null, count: null, status: 200, statusText: 'OK' });

export function createBreakingBackend({ loadStore, saveStore, now = () => Date.now(), today, newId }) {
  let failNext = false;
  const stamp = () => new Date(now()).toISOString();

  function read() {
    let store = null;
    try {
      store = clone(loadStore());
    } catch {
      store = null;
    }
    if (storeIsUsable(store)) return store;
    // Nothing saved yet (or it was damaged): make the sample data and KEEP it, because its ids are random — a second
    // read must see the same events the first read listed.
    const fresh = defaultBreakingData({ today: today(), makeId: newId, nowIso: stamp() });
    saveStore?.(fresh);
    return clone(fresh);
  }
  const write = (db) => saveStore?.(db);

  // ----- Lookups and money -----
  const findEvent = (db, id) => db.events.find((e) => e.id === id) ?? null;
  const findReg = (db, id) => db.registrations.find((r) => r.id === id) ?? null;
  const classesOf = (db, eventId) => db.classes.filter((c) => c.event_id === eventId).sort((a, b) => a.sort - b.sort);
  const paymentsOf = (db, regId) => db.payments.filter((p) => p.registration_id === regId);
  const isReversed = (db, paymentId) => db.payments.some((p) => p.reverses_payment_id === paymentId);
  const paidOf = (db, reg) => sum(paymentsOf(db, reg.id).map((p) => p.amount_cents));
  const owedOf = (reg) => (Number.isInteger(reg.override_cents) ? reg.override_cents : reg.amount_cents);
  const standingRefunds = (db, regId) => paymentsOf(db, regId).filter((p) => p.kind === 'refund' && !isReversed(db, p.id));

  // The amount: tech × (tech price + card? + same day?) + adult × (adult price + …) — contract §4.
  function amountFor(db, tech, adult, card, sameDay) {
    const s = db.settings;
    const extra = (card ? s.card_extra_cents : 0) + (sameDay ? s.same_day_extra_cents : 0);
    return tech * (s.tech_cents + extra) + adult * (s.adult_cents + extra);
  }
  // Which chart group the student uses, and whether the rank is in it: the migration's brk_price. A Black Belt rank → black (any
  // age); a "Little Tiger …" name (or a rank in the tiger group) → tiger; else child when age <= the age line, otherwise teen. The
  // rank must be a row of THAT group (a rank deleted from the student's group is refused, even if another group still has it).
  // → { band, chart row } or null.
  function groupOf(db, rank, age) {
    const inBand = (band) => db.chart.find((c) => c.band === band && c.rank_name === rank) ?? null;
    let band;
    if (inBand('black')) band = 'black';
    else if (/^little tiger( |$)/i.test(rank) || inBand('tiger')) band = 'tiger';
    else band = age <= db.settings.child_max_age ? 'child' : 'teen';
    const row = inBand(band);
    return row ? { band, row } : null;
  }
  // The Square link rules: a registration's link is cleared (order id and address emptied) and its order id is remembered in
  // cleared_links, as the migration's trigger does (so a late payment on an old link can be named: outcome link_cleared).
  function clearLink(db, reg) {
    if (reg.square_order_id === null) return false;
    if (!db.cleared_links.some((c) => c.order_id === reg.square_order_id)) db.cleared_links.push({ order_id: reg.square_order_id, registration_id: reg.id, cleared_at: stamp() });
    reg.square_order_id = null;
    reg.square_link_url = null;
    return true;
  }
  const schoolDateOf = (iso) => todayInSchoolTime(new Date(iso)); // the school-time day a row was made

  function touch(row, ctx, changes = {}, force = false) {
    const changed = Object.keys(changes).some((k) => JSON.stringify(changes[k]) !== JSON.stringify(row[k]));
    Object.assign(row, changes);
    if (changed || force) {
      row.version += 1;
      row.updated_at = stamp();
      row.updated_by_name = ctx.actorName;
    }
  }
  const withinUndo = (iso, ctx, byId) => ctx.userId !== null && byId === ctx.userId && now() - Date.parse(iso) >= 0 && now() - Date.parse(iso) < UNDO_WINDOW_MS;

  // ----- What the database's CHECK rules and the payments guard say about a new brk_payments row -----
  // → null when fine, else 'invalid' (a payment 1…10,000.00; a refund minus, cash or check; a reversal exactly minus
  // the row it undoes, at its school; and a student's rows never add up below $0).
  function paymentRowProblem(db, row) {
    const good = (row.kind === 'payment' && row.amount_cents >= 1 && row.amount_cents <= MAX_PAYMENT_CENTS && row.reverses_payment_id === null)
      || (row.kind === 'refund' && row.amount_cents <= -1 && row.amount_cents >= -MAX_REFUND_CENTS && row.reverses_payment_id === null && ['cash', 'check'].includes(row.method))
      || (row.kind === 'reversal' && row.amount_cents !== 0 && Math.abs(row.amount_cents) <= MAX_PAYMENT_CENTS && row.reverses_payment_id !== null);
    if (!good || !PAYING_BY.includes(row.method)) return 'invalid';
    if (row.kind === 'reversal') {
      const target = db.payments.find((p) => p.id === row.reverses_payment_id);
      const fits = target && ['payment', 'refund'].includes(target.kind) && target.registration_id === row.registration_id
        && row.amount_cents === -target.amount_cents && row.school === target.school;
      if (!fits) return 'invalid';
    }
    if (sum(paymentsOf(db, row.registration_id).map((p) => p.amount_cents)) + row.amount_cents < 0) return 'invalid';
    return null;
  }
  function addPaymentRow(db, row) {
    if (paymentRowProblem(db, row)) return 'invalid';
    db.payments.push(row);
    return null;
  }

  // ----- Views: what the read functions send -----
  function regView(db, r) {
    const payments = paymentsOf(db, r.id).sort((a, b) => (a.recorded_at < b.recorded_at ? -1 : a.recorded_at > b.recorded_at ? 1 : 0))
      .map((p) => ({ id: p.id, kind: p.kind, amount_cents: p.amount_cents, method: p.method, paid_on: p.paid_on, school: p.school, recorded_at: p.recorded_at, recorded_by_name: p.recorded_by_name, reverses_payment_id: p.reverses_payment_id }));
    return {
      id: r.id, class_id: r.class_id, first_name: r.first_name, last_name: r.last_name, age: r.age, rank_name: r.rank_name, band_used: r.band_used,
      tech_boards: r.tech_boards, adult_boards: r.adult_boards, paying_by: r.paying_by, paying_by_on_form: r.paying_by_on_form, same_day: r.same_day,
      amount_cents: r.amount_cents, override_cents: r.override_cents, owed_cents: owedOf(r), paid_cents: paidOf(db, r), broke: r.broke, broke_on: r.broke_on,
      has_link: r.square_link_url !== null, source: r.source, version: r.version, created_at: r.created_at, payments,
    };
  }
  const isPaid = (db, r) => paidOf(db, r) >= owedOf(r);

  // The columns the change log keeps (no Square order / link, no login ids).
  const LOG_COLS = {
    brk_registrations: ['id', 'event_id', 'class_id', 'first_name', 'last_name', 'age', 'rank_name', 'band_used', 'tech_boards', 'adult_boards', 'paying_by', 'paying_by_on_form', 'same_day', 'amount_cents', 'override_cents', 'source', 'broke', 'broke_on', 'version'],
    brk_payments: ['id', 'registration_id', 'kind', 'amount_cents', 'method', 'paid_on', 'school', 'recorded_by_name', 'reverses_payment_id'],
  };
  const logShape = (table, row) => Object.fromEntries(LOG_COLS[table].map((c) => [c, row[c] ?? null]));
  const logLists = (db) => ({ brk_registrations: db.registrations, brk_payments: db.payments });
  function snapshotLogged(db) {
    return Object.fromEntries(Object.entries(logLists(db)).map(([t, list]) => [t, new Map(list.map((r) => [r.id, JSON.stringify(logShape(t, r))]))]));
  }
  function writeLog(db, snap, action, ctx) {
    const at = stamp();
    const batchId = newId();
    const add = (table, op, recordId, before, after) => db.change_log.push({
      occurred_at: at, actor_name: ctx.actorName, batch_id: batchId, action, table_name: table, record_id: recordId, op, before, after,
    });
    for (const [table, list] of Object.entries(logLists(db))) {
      const was = snap[table];
      const seen = new Set();
      for (const row of list) {
        seen.add(row.id);
        const nowShape = logShape(table, row);
        const old = was.get(row.id);
        if (old === undefined) add(table, 'insert', row.id, null, clone(nowShape));
        else if (old !== JSON.stringify(nowShape)) {
          const prev = JSON.parse(old);
          const keys = Object.keys(nowShape).filter((k) => k !== 'version' && JSON.stringify(prev[k] ?? null) !== JSON.stringify(nowShape[k] ?? null));
          if (keys.length > 0) add(table, 'update', row.id, Object.fromEntries(keys.map((k) => [k, prev[k] ?? null])), clone(Object.fromEntries(keys.map((k) => [k, nowShape[k] ?? null]))));
        }
      }
      for (const [rowId, text] of was) if (!seen.has(rowId)) add(table, 'delete', rowId, JSON.parse(text), null);
    }
  }

  // ----- Validation shared by add / edit student -----
  // The migration's brk_student_field_error: the NAME of the first bad field, or null. Pure input rules, checked before anything is
  // looked up. (Whether the class belongs to the event and the rank is in the student's chart group come after, from the rows.)
  const nameOk = (text) => typeof text === 'string' && nameProblem(text) === null;
  function fieldError(a) {
    if (!nameOk(a.p_first_name)) return 'first_name';
    if (!nameOk(a.p_last_name)) return 'last_name';
    if (!inRange(a.p_age, 1, 99)) return 'age';
    if (!nameOk(a.p_rank_name)) return 'rank_name';
    if (a.p_class_id === null) return 'class_id';
    if (!inRange(a.p_tech, 0, 12) || !inRange(a.p_adult, 0, 12) || a.p_tech + a.p_adult < 1) return 'boards';
    if (!PAYING_BY.includes(a.p_paying_by)) return 'paying_by';
    return null;
  }
  // Class in this event, then the price for the rank in the student's group (the brk_price lookup).
  // → { error: { status:'invalid', field } } or { band, amount }.
  function priceStudent(db, eventId, a, sameDay) {
    if (!classesOf(db, eventId).some((c) => c.id === a.p_class_id)) return { error: { status: 'invalid', field: 'class_id' } };
    const rank = normalizeName(a.p_rank_name);
    const group = groupOf(db, rank, a.p_age);
    if (!group) return { error: { status: 'invalid', field: 'rank_name' } };
    return { band: group.band, rank, amount: amountFor(db, a.p_tech, a.p_adult, a.p_paying_by === 'card', sameDay) };
  }

  // ----- The staff functions -----
  const handlers = {
    brk_settings_get(db) {
      const s = db.settings;
      return {
        status: 'ok',
        settings: { tech_cents: s.tech_cents, adult_cents: s.adult_cents, card_extra_cents: s.card_extra_cents, same_day_extra_cents: s.same_day_extra_cents, child_max_age: s.child_max_age, version: s.version },
        chart: db.chart.map(({ id, band, rank_name, sort, technique, tech_boards, adult_boards }) => ({ id, band, rank_name, sort, technique, tech_boards, adult_boards })),
      };
    },

    brk_events_list(db, a) {
      const code = a.p_location_code;
      if (code === null || ![...LOCATION_CODES, 'both'].includes(code)) return { status: 'invalid', field: 'location_code' };
      const events = db.events.filter((e) => code === 'both' || e.location_code === code).map((e) => {
        const regs = db.registrations.filter((r) => r.event_id === e.id);
        return {
          id: e.id, name: e.name, location_code: e.location_code, event_date: e.event_date, registration_open: e.registration_open, public_code: e.public_code,
          registered: regs.length, paid: regs.filter((r) => isPaid(db, r)).length, version: e.version,
        };
      }).sort((x, y) => (x.event_date < y.event_date ? -1 : x.event_date > y.event_date ? 1 : 0));
      return { status: 'ok', events };
    },

    brk_event_roster(db, a, ctx) {
      const event = a.p_event_id === null ? null : findEvent(db, a.p_event_id);
      if (!event) return st('not_found');
      // Admins only: unreviewed Square messages that were NOT recorded as a payment, for the event's school, newest first, at most 50.
      // Only a link_cleared row names the student (someone paid an old, cleared link); every other row has the three empty.
      const nameOf = (id) => findReg(db, id);
      const needs = ctx.isAdmin
        ? db.square_events.filter((x) => x.school === event.location_code && !x.reviewed && ['unknown_order', 'amount_mismatch', 'wrong_school', 'already_paid', 'not_card', 'link_cleared'].includes(x.outcome))
          .sort((x, y) => (x.received_at < y.received_at ? 1 : x.received_at > y.received_at ? -1 : x.square_event_id < y.square_event_id ? -1 : 1)).slice(0, 50)
          .map((x) => {
            const who = x.outcome === 'link_cleared' ? nameOf(x.registration_id) : null;
            return {
              square_event_id: x.square_event_id, received_at: x.received_at, outcome: x.outcome, amount_cents: x.amount_cents, order_id: x.order_id,
              registration_id: who ? who.id : null, first_name: who ? who.first_name : null, last_name: who ? who.last_name : null,
            };
          })
        : [];
      return {
        status: 'ok',
        event: {
          id: event.id, name: event.name, location_code: event.location_code, event_date: event.event_date, registration_open: event.registration_open,
          public_code: event.public_code, version: event.version,
          classes: classesOf(db, event.id).map(({ id, name, start_time, end_time, sort }) => ({ id, name, start_time, end_time, sort })),
        },
        registrations: db.registrations.filter((r) => r.event_id === event.id).map((r) => regView(db, r)),
        needs_look: needs,
      };
    },

    // The change log of the student and their payments, newest first, at most 500 rows, no login ids.
    brk_registration_history(db, a) {
      const reg = a.p_registration_id === null ? null : findReg(db, a.p_registration_id);
      if (!reg) return st('not_found');
      const mine = (r) => (r.table_name === 'brk_registrations' && r.record_id === reg.id)
        || (r.table_name === 'brk_payments' && (r.after?.registration_id ?? r.before?.registration_id) === reg.id);
      const rows = db.change_log.map((r, seq) => ({ r, seq })).filter(({ r }) => mine(r))
        .sort((x, y) => (x.r.occurred_at < y.r.occurred_at ? 1 : x.r.occurred_at > y.r.occurred_at ? -1 : y.seq - x.seq)).slice(0, 500)
        .map(({ r }) => ({ occurred_at: r.occurred_at, actor_name: r.actor_name, table_name: r.table_name, op: r.op, batch_id: r.batch_id, action: r.action, before: r.before, after: r.after }));
      return { status: 'ok', rows };
    },

    brk_add_event(db, a, ctx) {
      if (!nameOk(a.p_name)) return { status: 'invalid', field: 'name' };
      const name = normalizeName(a.p_name);
      if (a.p_location_code === null || !LOCATION_CODES.includes(a.p_location_code)) return { status: 'invalid', field: 'location_code' };
      // The date window: a year back to two years ahead (always checked when an event is ADDED).
      if (a.p_event_date === null || a.p_event_date < addDays(today(), -365) || a.p_event_date > addDays(today(), 730)) return { status: 'invalid', field: 'event_date' };
      // Classes: from the event named, else from the school's latest EARLIER event, else none.
      let source = null;
      if (a.p_copy_classes_from !== null) {
        source = findEvent(db, a.p_copy_classes_from);
        if (!source) return st('not_found');
      } else {
        source = db.events.filter((e) => e.location_code === a.p_location_code && e.event_date < a.p_event_date).sort((x, y) => (x.event_date < y.event_date ? 1 : -1))[0] ?? null;
      }
      let code;
      do code = Array.from({ length: 8 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
      while (db.events.some((e) => e.public_code === code));
      const at = stamp();
      const event = {
        id: newId(), name, location_code: a.p_location_code, event_date: a.p_event_date, registration_open: false, public_code: code, version: 1,
        created_at: at, created_by_name: ctx.actorName, updated_at: at, updated_by_name: ctx.actorName,
      };
      db.events.push(event);
      if (source) classesOf(db, source.id).forEach((c, index) => db.classes.push({ id: newId(), event_id: event.id, name: c.name, start_time: c.start_time, end_time: c.end_time, sort: index }));
      return { status: 'ok', event_id: event.id, public_code: code, version: 1 };
    },

    brk_update_event(db, a, ctx) {
      if (a.p_event_id === null || a.p_expected_version === null || a.p_registration_open === null) return st('invalid');
      if (!nameOk(a.p_name)) return { status: 'invalid', field: 'name' };
      const name = normalizeName(a.p_name);
      if (a.p_event_date === null) return { status: 'invalid', field: 'event_date' };
      const event = findEvent(db, a.p_event_id);
      if (!event) return st('not_found');
      if (event.version !== a.p_expected_version) return st('stale');
      // The date window (a year back to two years ahead) applies only when the date is CHANGED, so an old event can still be
      // renamed or closed.
      if (a.p_event_date !== event.event_date && (a.p_event_date < addDays(today(), -365) || a.p_event_date > addDays(today(), 730))) return { status: 'invalid', field: 'event_date' };
      touch(event, ctx, { name, event_date: a.p_event_date, registration_open: a.p_registration_open }, true);
      return { status: 'ok', version: event.version };
    },

    brk_delete_event(db, a) {
      if (a.p_event_id === null || a.p_expected_version === null) return st('invalid');
      const event = findEvent(db, a.p_event_id);
      if (!event) return st('not_found');
      if (event.version !== a.p_expected_version) return st('stale');
      const regIds = new Set(db.registrations.filter((r) => r.event_id === event.id).map((r) => r.id));
      if (db.payments.some((p) => regIds.has(p.registration_id))) return st('has_payments');
      db.registrations = db.registrations.filter((r) => !regIds.has(r.id));
      db.classes = db.classes.filter((c) => c.event_id !== event.id);
      db.events = db.events.filter((e) => e.id !== event.id);
      return st('ok');
    },

    // The whole class list in order: an id that is sent is kept, no id adds a class, a class left out is removed
    // (refused while it has students).
    brk_save_classes(db, a, ctx) {
      if (a.p_event_id === null || a.p_expected_version === null || !Array.isArray(a.p_classes)) return st('invalid');
      const event = findEvent(db, a.p_event_id);
      if (!event) return st('not_found');
      if (event.version !== a.p_expected_version) return st('stale');
      const existing = classesOf(db, event.id);
      const seen = new Set();
      const next = [];
      if (a.p_classes.length > 20) return { status: 'invalid', field: 'classes' };
      const names = new Set();
      for (const [index, c] of a.p_classes.entries()) {
        if (!nameOk(c?.name)) return { status: 'invalid', field: 'name' };
        const name = normalizeName(c.name);
        if (names.has(name.toLowerCase())) return { status: 'invalid', field: 'name' }; // two classes with the same name
        names.add(name.toLowerCase());
        if (typeof c.start_time !== 'string' || typeof c.end_time !== 'string' || !TIME_PATTERN.test(c.start_time) || !TIME_PATTERN.test(c.end_time)) return { status: 'invalid', field: 'time' };
        if (c.end_time.slice(0, 5) <= c.start_time.slice(0, 5)) return { status: 'invalid', field: 'time' };
        if (Number(c.start_time.slice(3, 5)) % 5 !== 0 || Number(c.end_time.slice(3, 5)) % 5 !== 0) return { status: 'invalid', field: 'time' }; // a 5-minute step
        if (c.id !== undefined && c.id !== null) {
          if (!existing.some((e) => e.id === c.id) || seen.has(c.id)) return { status: 'invalid', field: 'id' };
          seen.add(c.id);
        }
        next.push({ id: c.id ?? newId(), event_id: event.id, name, start_time: c.start_time.slice(0, 5), end_time: c.end_time.slice(0, 5), sort: index });
      }
      for (const old of existing) {
        if (!seen.has(old.id) && db.registrations.some((r) => r.class_id === old.id)) return { status: 'class_in_use', class_id: old.id };
      }
      db.classes = [...db.classes.filter((c) => c.event_id !== event.id), ...next];
      touch(event, ctx, {}, true);
      return { status: 'ok', version: event.version };
    },

    // A walk-in at the desk. Works while registration is closed. The database prices it: the event-day price from the event date on.
    brk_add_student(db, a, ctx) {
      if (a.p_event_id === null) return st('invalid');
      const bad = fieldError(a);
      if (bad) return { status: 'invalid', field: bad };
      const event = findEvent(db, a.p_event_id);
      if (!event) return st('not_found');
      const sameDay = today() >= event.event_date;
      const priced = priceStudent(db, event.id, a, sameDay);
      if (priced.error) return priced.error;
      const amount = priced.amount;
      const at = stamp();
      const reg = {
        id: newId(), event_id: event.id, class_id: a.p_class_id, first_name: normalizeName(a.p_first_name), last_name: normalizeName(a.p_last_name), age: a.p_age,
        rank_name: priced.rank, band_used: priced.band, tech_boards: a.p_tech, adult_boards: a.p_adult, paying_by: a.p_paying_by,
        paying_by_on_form: a.p_paying_by, same_day: sameDay, amount_cents: amount, override_cents: null, square_order_id: null, square_link_url: null,
        source: 'desk', broke: false, broke_on: null, entered_by_name: ctx.actorName, version: 1,
        created_at: at, created_by_name: ctx.actorName, updated_at: at, updated_by_name: ctx.actorName,
      };
      db.registrations.push(reg);
      return { status: 'ok', registration_id: reg.id, amount_cents: amount, version: 1 };
    },

    // Editing is allowed after payment; the amount is worked out again (with the student's own same-day rule). It is refused with
    // amount_below_paid when the new amount OWED (the override if one is set, else the new price) would be below what is already
    // paid. A Square link is cleared when the registration HAS an order (square_order_id) and Paying by leaves Card, or the amount
    // owed changes while the old owed amount was still unpaid (v1.303). A set override stays.
    brk_edit_registration(db, a, ctx) {
      if (a.p_registration_id === null || a.p_expected_version === null) return st('invalid');
      const bad = fieldError(a);
      if (bad) return { status: 'invalid', field: bad };
      const reg = findReg(db, a.p_registration_id);
      if (!reg) return st('not_found');
      if (reg.version !== a.p_expected_version) return st('stale');
      const priced = priceStudent(db, reg.event_id, a, reg.same_day);
      if (priced.error) return priced.error;
      const oldOwed = owedOf(reg);
      const newOwed = Number.isInteger(reg.override_cents) ? reg.override_cents : priced.amount;
      const paid = paidOf(db, reg);
      if (newOwed < paid) return { status: 'amount_below_paid', paid_cents: paid };
      const clear = reg.square_order_id !== null && (a.p_paying_by !== 'card' || (newOwed !== oldOwed && paid < oldOwed));
      if (clear) clearLink(db, reg);
      touch(reg, ctx, {
        first_name: normalizeName(a.p_first_name), last_name: normalizeName(a.p_last_name), age: a.p_age, rank_name: priced.rank, class_id: a.p_class_id,
        band_used: priced.band, tech_boards: a.p_tech, adult_boards: a.p_adult, paying_by: a.p_paying_by, amount_cents: priced.amount,
      }, true);
      return { status: 'ok', amount_cents: priced.amount, version: reg.version, link_cleared: clear };
    },

    // An admin's price for one student. When the amount owed changes while the old owed amount is still unpaid and a Square order
    // exists, the link is cleared (as Edit). The new amount may be below what was paid (the difference can be refunded).
    brk_set_override(db, a, ctx) {
      if (a.p_registration_id === null || a.p_expected_version === null) return st('invalid');
      if (a.p_override_cents !== null && !inRange(a.p_override_cents, 0, 1000000)) return st('invalid');
      const reg = findReg(db, a.p_registration_id);
      if (!reg) return st('not_found');
      if (reg.version !== a.p_expected_version) return st('stale');
      const oldOwed = owedOf(reg);
      const newOwed = a.p_override_cents ?? reg.amount_cents;
      const clear = reg.square_order_id !== null && newOwed !== oldOwed && paidOf(db, reg) < oldOwed;
      if (clear) clearLink(db, reg);
      touch(reg, ctx, { override_cents: a.p_override_cents }, true);
      return { status: 'ok', amount_cents: newOwed, version: reg.version, link_cleared: clear };
    },

    brk_set_broke(db, a, ctx) {
      if (a.p_registration_id === null || a.p_expected_version === null || a.p_broke === null) return st('invalid');
      const reg = findReg(db, a.p_registration_id);
      if (!reg) return st('not_found');
      if (reg.version !== a.p_expected_version) return st('stale');
      touch(reg, ctx, { broke: a.p_broke, broke_on: a.p_broke ? today() : null }, true);
      return { status: 'ok', version: reg.version, broke_on: reg.broke_on };
    },

    // Mark paid: the amount is what is still owed. A different way than Paying by also changes Paying by (logged); Undo puts it back.
    brk_mark_paid(db, a, ctx) {
      if (a.p_registration_id === null || a.p_expected_version === null) return st('invalid');
      if (a.p_school === null || !LOCATION_CODES.includes(a.p_school)) return { status: 'invalid', field: 'school' };
      const reg = findReg(db, a.p_registration_id);
      if (!reg) return st('not_found');
      const method = a.p_method === null || a.p_method === '' ? reg.paying_by : a.p_method;
      if (!PAYING_BY.includes(method)) return { status: 'invalid', field: 'method' };
      if (reg.version !== a.p_expected_version) return st('stale');
      const owes = owedOf(reg) - paidOf(db, reg);
      if (owes <= 0) return st('already_paid');
      const payment = {
        id: newId(), registration_id: reg.id, kind: 'payment', amount_cents: owes, method, paid_on: today(), school: a.p_school, recorded_at: stamp(),
        recorded_by: ctx.userId ?? null, recorded_by_name: ctx.actorName, reverses_payment_id: null, paying_by_before: method !== reg.paying_by ? reg.paying_by : null,
      };
      if (addPaymentRow(db, payment)) return st('invalid');
      // Paying by moves away from Card: the Square link goes (the table rule: a link needs Paying by = Card). It does NOT re-price.
      if (method !== 'card') clearLink(db, reg);
      touch(reg, ctx, { paying_by: method }, true); // a double click with the old version now gets 'stale'
      return { status: 'ok', payment_id: payment.id, amount_cents: owes, method, school: payment.school, paying_by: reg.paying_by, version: reg.version };
    },

    brk_undo_payment(db, a, ctx) {
      if (a.p_payment_id === null) return st('invalid');
      const payment = db.payments.find((p) => p.id === a.p_payment_id);
      if (!payment) return st('not_found');
      if (!ctx.isAdmin && !withinUndo(payment.recorded_at, ctx, payment.recorded_by)) return st('not_allowed'); // staff: their own, ≤ 10 s
      if (payment.kind !== 'payment' || isReversed(db, payment.id)) return st('stale');
      if (standingRefunds(db, payment.registration_id).length > 0) return st('refund_stands');
      const reg = findReg(db, payment.registration_id);
      if (addPaymentRow(db, {
        id: newId(), registration_id: reg.id, kind: 'reversal', amount_cents: -payment.amount_cents, method: payment.method, paid_on: today(), school: payment.school,
        recorded_at: stamp(), recorded_by: ctx.userId ?? null, recorded_by_name: ctx.actorName, reverses_payment_id: payment.id, paying_by_before: null,
      })) return st('invalid');
      // The payment changed Paying by and nobody changed it since: it goes back.
      const back = payment.paying_by_before && reg.paying_by === payment.method ? { paying_by: payment.paying_by_before } : {};
      touch(reg, ctx, back, true);
      return { status: 'ok', version: reg.version };
    },

    brk_edit_payment(db, a, ctx) {
      if (a.p_payment_id === null || !PAYING_BY.includes(a.p_method) || a.p_paid_on === null || a.p_paid_on > today()) return st('invalid');
      if (a.p_amount_cents === null || a.p_amount_cents < 1 || a.p_amount_cents > MAX_PAYMENT_CENTS) return st('invalid');
      if (a.p_school === null || !LOCATION_CODES.includes(a.p_school)) return { status: 'invalid', field: 'school' };
      const payment = db.payments.find((p) => p.id === a.p_payment_id);
      if (!payment) return st('not_found');
      if (payment.kind !== 'payment') return st('invalid');
      if (isReversed(db, payment.id)) return st('stale');
      if (standingRefunds(db, payment.registration_id).length > 0) return st('refund_stands');
      const reg = findReg(db, payment.registration_id);
      if (a.p_paid_on < schoolDateOf(reg.created_at)) return { status: 'invalid', field: 'date' }; // never before the day the student was added
      const common = { registration_id: reg.id, recorded_at: stamp(), recorded_by: ctx.userId ?? null, recorded_by_name: ctx.actorName };
      if (addPaymentRow(db, { id: newId(), ...common, kind: 'reversal', amount_cents: -payment.amount_cents, method: payment.method, paid_on: today(), school: payment.school, reverses_payment_id: payment.id, paying_by_before: null })) return st('invalid');
      const familyChoice = payment.paying_by_before && reg.paying_by === payment.method ? payment.paying_by_before : reg.paying_by;
      const payingBy = a.p_method !== payment.method ? a.p_method : reg.paying_by;
      const replacement = {
        id: newId(), ...common, kind: 'payment', amount_cents: a.p_amount_cents, method: a.p_method, paid_on: a.p_paid_on, school: a.p_school, reverses_payment_id: null,
        paying_by_before: payingBy === a.p_method && familyChoice !== a.p_method ? familyChoice : null,
      };
      if (addPaymentRow(db, replacement)) return st('invalid');
      if (payingBy !== 'card') clearLink(db, reg); // Paying by moved away from Card: the Square link is cleared
      touch(reg, ctx, { paying_by: payingBy }, true);
      return { status: 'ok', payment_id: replacement.id, version: reg.version };
    },

    // Money handed back: never more than what is overpaid (paid − owed).
    brk_record_refund(db, a, ctx) {
      if (a.p_registration_id === null || a.p_expected_version === null || a.p_refunded_on === null || a.p_refunded_on > today()) return st('invalid');
      if (!['cash', 'check'].includes(a.p_method)) return st('invalid');
      if (a.p_amount_cents === null || a.p_amount_cents < 1 || a.p_amount_cents > MAX_REFUND_CENTS) return st('invalid');
      if (a.p_school === null || !LOCATION_CODES.includes(a.p_school)) return { status: 'invalid', field: 'school' };
      const reg = findReg(db, a.p_registration_id);
      if (!reg) return st('not_found');
      if (reg.version !== a.p_expected_version) return st('stale');
      if (a.p_refunded_on < schoolDateOf(reg.created_at)) return { status: 'invalid', field: 'date' };
      const overpaid = Math.max(0, paidOf(db, reg) - owedOf(reg));
      if (overpaid === 0 || a.p_amount_cents > overpaid) return { status: 'refund_too_large', overpaid_cents: overpaid };
      const refund = {
        id: newId(), registration_id: reg.id, kind: 'refund', amount_cents: -a.p_amount_cents, method: a.p_method, paid_on: a.p_refunded_on, school: a.p_school,
        recorded_at: stamp(), recorded_by: ctx.userId ?? null, recorded_by_name: ctx.actorName, reverses_payment_id: null, paying_by_before: null,
      };
      if (addPaymentRow(db, refund)) return st('invalid');
      touch(reg, ctx, {}, true);
      return { status: 'ok', payment_id: refund.id, version: reg.version };
    },

    brk_undo_refund(db, a, ctx) {
      if (a.p_payment_id === null) return st('invalid');
      const refund = db.payments.find((p) => p.id === a.p_payment_id);
      if (!refund) return st('not_found');
      if (refund.kind !== 'refund') return st('invalid');
      if (isReversed(db, refund.id)) return st('stale');
      const reg = findReg(db, refund.registration_id);
      if (addPaymentRow(db, {
        id: newId(), registration_id: reg.id, kind: 'reversal', amount_cents: -refund.amount_cents, method: refund.method, paid_on: today(), school: refund.school,
        recorded_at: stamp(), recorded_by: ctx.userId ?? null, recorded_by_name: ctx.actorName, reverses_payment_id: refund.id, paying_by_before: null,
      })) return st('invalid');
      touch(reg, ctx, {}, true);
      return { status: 'ok', version: reg.version };
    },

    brk_delete_registration(db, a) {
      if (a.p_registration_id === null || a.p_expected_version === null) return st('invalid');
      const reg = findReg(db, a.p_registration_id);
      if (!reg) return st('not_found');
      if (reg.version !== a.p_expected_version) return st('stale');
      if (paymentsOf(db, reg.id).length > 0) return st('has_payments');
      db.registrations = db.registrations.filter((r) => r.id !== reg.id);
      return st('ok');
    },

    brk_save_settings(db, a, ctx) {
      if (a.p_expected_version === null) return st('invalid');
      const cents = [['tech_cents', a.p_tech_cents], ['adult_cents', a.p_adult_cents], ['card_extra_cents', a.p_card_extra_cents], ['same_day_extra_cents', a.p_same_day_extra_cents]];
      for (const [field, value] of cents) if (!inRange(value, 0, 100000)) return { status: 'invalid', field };
      if (!inRange(a.p_child_max_age, 1, 99)) return { status: 'invalid', field: 'child_max_age' };
      if (db.settings.version !== a.p_expected_version) return st('stale');
      db.settings = { ...db.settings, tech_cents: a.p_tech_cents, adult_cents: a.p_adult_cents, card_extra_cents: a.p_card_extra_cents,
        same_day_extra_cents: a.p_same_day_extra_cents, child_max_age: a.p_child_max_age, version: db.settings.version + 1, updated_at: stamp(), updated_by_name: ctx.actorName };
      return { status: 'ok', version: db.settings.version };
    },

    // Replaces the whole chart. The version is the settings row's (one version guards prices, age line and chart).
    // The migration's brk_chart_arg_is_valid: 4 to 300 objects with exactly the six keys; band; rank name already tidied (one space between
    // words, none at the ends) and 1-60 characters; technique tidied, at most 120 characters; sort 0-999; boards 0-12; no (band, rank)
    // twice ignoring capitals; at least one rank in every group. Anything else: invalid {field:'rows'}.
    brk_save_chart(db, a, ctx) {
      if (a.p_expected_version === null || !Array.isArray(a.p_rows)) return { status: 'invalid', field: 'rows' };
      const bad = { status: 'invalid', field: 'rows' };
      if (a.p_rows.length < 4 || a.p_rows.length > 300) return bad;
      const SIX = ['band', 'rank_name', 'sort', 'technique', 'tech_boards', 'adult_boards'];
      const keys = new Set();
      const rows = [];
      for (const r of a.p_rows) {
        if (!r || typeof r !== 'object' || Object.keys(r).length !== 6 || !SIX.every((k) => k in r)) return bad;
        if (!BANDS.includes(r.band) || typeof r.rank_name !== 'string' || typeof r.technique !== 'string') return bad;
        if (!nameOk(r.rank_name) || r.rank_name !== normalizeName(r.rank_name)) return bad;
        if (r.technique !== normalizeName(r.technique) || [...r.technique].length > 120 || nameProblem(r.technique) === 'badCharacter') return bad;
        if (!inRange(r.sort, 0, 999) || !inRange(r.tech_boards, 0, 12) || !inRange(r.adult_boards, 0, 12)) return bad;
        const key = `${r.band}|${r.rank_name.toLowerCase()}`;
        if (keys.has(key)) return bad;
        keys.add(key);
        rows.push({ id: newId(), band: r.band, rank_name: r.rank_name, sort: r.sort, technique: r.technique, tech_boards: r.tech_boards, adult_boards: r.adult_boards });
      }
      for (const band of BANDS) if (!rows.some((r) => r.band === band)) return bad;
      if (db.settings.version !== a.p_expected_version) return st('stale');
      db.chart = rows;
      db.settings = { ...db.settings, version: db.settings.version + 1, updated_at: stamp(), updated_by_name: ctx.actorName };
      return { status: 'ok', version: db.settings.version };
    },

    brk_dismiss_square_event(db, a) {
      if (a.p_square_event_id === null || !/^[A-Za-z0-9_.:-]{1,200}$/.test(a.p_square_event_id)) return st('invalid');
      const row = db.square_events.find((s) => s.square_event_id === a.p_square_event_id);
      if (!row) return st('not_found');
      row.reviewed = true;
      return st('ok');
    },
  };

  // Reads the arguments the way the database function's signature does (a wrong type is a database error).
  function readArgs(name, args) {
    const parsed = {};
    for (const [arg, type] of RPC_ARGS[name]) {
      const value = toDbType(args?.[arg], type);
      if (value === BAD) throw Object.assign(new Error(`invalid input for ${arg}`), { code: '22P02' });
      parsed[arg] = value;
    }
    return parsed;
  }

  // supabase.rpc(name, args) for the staff functions.
  function rpc(name, args = {}, ctx = {}) {
    if (BRK_RESTRICTED_RPC_NAMES.includes(name)) return fail('42501', `permission denied for function ${name}`, 403); // only brk_registrar / brk_square
    if (!(name in handlers)) return fail('PGRST202', `Could not find the function public.${name} in the schema cache`, 404);
    const writes = !BRK_READ_RPC_NAMES.includes(name);
    if (failNext && writes) {
      failNext = false; // pretend the connection dropped: nothing changes
      return { data: null, error: { message: 'Failed to fetch (preview: failNextSave)' }, count: null, status: 0, statusText: '' };
    }
    if (!ctx.signedIn) return fail('42501', `permission denied for function ${name}`, 403);
    let parsed;
    try {
      parsed = readArgs(name, args);
    } catch (error) {
      return fail(error.code ?? '22P02', error.message, DB_ERROR_STATUS[22]);
    }
    // has_data_access FIRST, then the role.
    if (!ctx.hasDataAccess) return ok(st('no_access'));
    if (ADMIN_ONLY.has(name) && !ctx.isAdmin) return ok(st('not_allowed'));
    const db = read(); // a private copy = a transaction: only an 'ok' is saved
    const snap = writes ? snapshotLogged(db) : null;
    const who = { actorName: ctx.actorName ?? 'Database admin', userId: ctx.userId ?? null, isAdmin: Boolean(ctx.isAdmin) };
    const answer = handlers[name](db, parsed, who);
    if (answer.status === 'ok' && writes) {
      writeLog(db, snap, name, who);
      write(db);
    }
    return ok(answer);
  }

  // ----- Preview helpers (console helpers in mockClient.js) -----
  const failNextSave = () => { failNext = true; };

  // "Another admin" changes every event, student and the settings row: open dialogs go stale.
  function simulateOtherAdminEdit() {
    const db = read();
    const at = stamp();
    for (const row of [...db.events, ...db.registrations, db.settings]) {
      row.version += 1;
      row.updated_by_name = 'Other Admin';
      row.updated_at = at;
    }
    write(db);
  }
  const reset = () => write(defaultBreakingData({ today: today(), makeId: newId, nowIso: stamp() }));

  // One more Square payment that needs a look, for the first upcoming event's school (so the amber box can be seen again): someone
  // paid an OLD link for the first student who still owes (outcome link_cleared, which names the student) — or, when everyone has
  // paid, a payment that matched no student.
  function addNeedsLook() {
    const db = read();
    const event = db.events.filter((e) => e.event_date >= today()).sort((x, y) => (x.event_date < y.event_date ? -1 : 1))[0];
    if (!event) return false;
    const owing = db.registrations.find((r) => r.event_id === event.id && paidOf(db, r) < owedOf(r));
    const id = `sqe_demo_${db.square_events.length + 1}`;
    db.square_events.push({
      square_event_id: id, school: event.location_code, received_at: stamp(), type: 'payment.updated', payment_id: `pay_${id}`, order_id: `ord_old_${id}`,
      amount_cents: owing ? owedOf(owing) : 1200, outcome: owing ? 'link_cleared' : 'unknown_order', registration_id: owing ? owing.id : null, reviewed: false,
    });
    write(db);
    return true;
  }

  return { rpc, failNextSave, simulateOtherAdminEdit, reset, snapshot: read, addNeedsLook };
}

// Today's date helper kept for the checks and for mockClient's fallback.
export const breakingToday = (now = new Date()) => todayInSchoolTime(now);
