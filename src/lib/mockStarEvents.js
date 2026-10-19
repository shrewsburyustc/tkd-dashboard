// mockStarEvents.js — the PREVIEW (fake) database for Star testing events (build phase 2).
// Why it exists: preview mode (npm run dev:preview-mode) runs without Supabase. This file pretends
// to be the part of migration 0006 that the Events tab and the event page use: the star_events
// table (contract 0006 §2.2), the event's own copy of the rubrics and prices (§2.3, copied when the
// event is added and never changed after), the candidate counts (read from the star_roster view,
// §2.12) and the four event functions (§6.2: star_add_event, star_update_event,
// star_set_registration, star_delete_event). It follows the SAME rules: the same order of checks
// (§1.1), the same answers, the same staff / admin split (v0.86), the same state rule (§5.1 —
// Color Belt's eventRules.js, shared, not copied). What you see in preview is what the real
// dashboard will do.
//
// Like mockStarTesting.js it is a "pure core": it never touches the browser by itself.
//   const starEvents = createStarEventsBackend({ readBase, saveStore, now, today, newId });
//     readBase()  → the whole Star preview store (mockStarTesting's snapshot(): the rubric template
//                   + whatever else is saved, e.g. these events); its seed when missing or too old
//     saveStore() → saves the whole store (mockClient: localStorage 'tkd.preview.star')
//     now()       → milliseconds (timestamps)
//     today()     → 'YYYY-MM-DD' in school time (__tkdPreview.setToday can pretend another date)
//   starEvents.select(table, columns, filters, orders, ctx)   filters: [{ col, value, op:'eq'|'in' }]
//   starEvents.rpc(name, args, ctx)   ctx = { signedIn, hasDataAccess, isAdmin, actorName }
//
// The event lists live in the SAME store as the rubric template (so Add event can copy it), next to
// `dans`, `categories`, `grades` and `assistant`:
//   events_schema, events, event_dans, event_categories, event_grades, event_assistant,
//   candidates, payments, next_reference
// Column names are the database's (snake_case). When that part is missing or damaged it is replaced
// by the seed below (three made-up events) and saved; the rubric template is kept.
// Candidates and payments are only SEEDED here (so the list shows counts and Delete event has
// something to count): adding, editing and paying candidates is build phase 3 (mockStarCandidates).
//
// Seed (made-up names only; dates worked out from "today" when the seed is made):
//   Fall Star Testing    — upcoming, registration OPEN, closing date 7 days before, 3 candidates
//                          (+1 withdrawn), one paid
//   Winter Star Testing  — upcoming, NOT OPEN YET (saved, never opened), no candidates; the most
//                          recently added event, so Add event copies its Start time and Where
//   Spring Star Testing  — PAST (finished), 2 candidates, both paid
// With __tkdPreview.setToday(…) the same events can be seen before, on and after a testing day
// (the states and tags follow "today"; the stored data doesn't move).
import { normalizeName, nameProblem, nameKey } from './testing/names.js';
import { eventState, registrationSwitch, isIsoDate, addDays, noteIsValid, normalizeNote } from './testing/eventRules.js';
import { startTimeIsValid, WHERE_CODES, STAR_CODE_ALPHABET, STAR_CODE_PATTERN } from './star/starEventRules.js';

// Raised whenever the stored shape of the events part changes (older data → the seed).
export const STAR_EVENTS_SCHEMA = 1;
const CODE_LENGTH = 8;
const REFERENCE_START = 4001; // ST-4001 is the first family-form reference (contract §2.4)
const DAY_MS = 24 * 60 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INT_MAX = 2147483647;
const MIN_SUFFIXES = ['a_plus', 'a', 'b_plus', 'b', 'c_plus', 'c'];

// ----- Table permissions (contract 0006 §4.1 / §4.2) -----
const HOUSE = ['version', 'created_at', 'updated_at', 'created_by_name', 'updated_by_name'];
// /*#__PURE__*/ (() => …)(): "this has no side effects", so the live build (which never makes the
// fake client) can drop these lines — the same trick as mockStarTesting.js.
const ASSISTANT_MIN_COLUMNS = /*#__PURE__*/ (() => [...MIN_SUFFIXES.map((s) => `child_${s}`), ...MIN_SUFFIXES.map((s) => `adult_${s}`)])();
// The star_roster view's columns, in the migration's order (§2.12). DOB and email are NOT in it.
const ROSTER_COLUMNS = [
  'id', 'event_id', 'first_name', 'last_name', 'location_code', 'dan', 'stars_from', 'paying_by', 'source', 'reference',
  'registered_at', 'status', 'withdrawn_reason', 'withdrawn_at', 'withdrawn_by_name', 'duplicate_state', 'duplicate_of',
  'is_makeup', 'makeup_of_candidate_id', 'makeup_of_event_name', 'private_on', 'private_time', 'classes_attended',
  'assistant_classes', 'version', 'created_at', 'updated_at', 'created_by_name', 'updated_by_name',
  'testing_date', 'dan_label', 'star_limit', 'standard_cents', 'same_day_cents', 'private_cents',
  'paid_cents', 'paid', 'last_payment_id', 'paid_on', 'paid_method', 'last_payment_recorded_at',
  'last_payment_recorded_by_name', 'refunded_cents', 'fee_kind', 'expected_fee_cents', 'overpaid_cents',
];
const GRANTED = /*#__PURE__*/ (() => ({
  star_events: [
    'id', 'name', 'testing_date', 'start_time', 'where_code', 'registration_open', 'auto_close_on', 'first_opened_at',
    'public_code_worcester', 'public_code_shrewsbury', 'note', ...HOUSE,
  ],
  star_event_dans: ['id', 'event_id', 'dan', 'label', 'pass_mark', 'star_limit', 'standard_cents', 'same_day_cents', 'private_cents'],
  star_event_categories: ['id', 'event_id', 'dan', 'template_category_id', 'name', 'credits', 'position', 'from_class_count'],
  star_event_grades: ['id', 'event_id', 'grade', 'position', 'value'],
  star_event_assistant: ['id', 'event_id', 'child_max_age', ...ASSISTANT_MIN_COLUMNS],
  star_roster: ROSTER_COLUMNS,
}))();
// Columns that exist but are never granted (login ids).
const HIDDEN = {
  star_events: ['created_by', 'updated_by'],
  star_event_dans: [],
  star_event_categories: [],
  star_event_grades: [],
  star_event_assistant: [],
  star_roster: [],
};
export const STAR_EVENT_TABLES = /*#__PURE__*/ Object.keys(GRANTED);

// "Content" columns of an event: changing one raises the version (house trigger, §1.8).
const EVENT_CONTENT = ['name', 'testing_date', 'start_time', 'where_code', 'registration_open', 'auto_close_on', 'first_opened_at', 'note'];

// ----- The four functions' argument lists (name, type) — the same names as migration 0006 -----
// The real API finds a function by its argument NAMES: a missing or extra one = "no such function".
const RPC_ARGS = {
  star_add_event: [
    ['p_name', 'text'], ['p_testing_date', 'date'], ['p_start_time', 'time'], ['p_where_code', 'text'],
    ['p_registration_open', 'bool'], ['p_auto_close_on', 'date'], ['p_note', 'text'],
  ],
  star_update_event: [
    ['p_event_id', 'uuid'], ['p_expected_version', 'int'], ['p_name', 'text'], ['p_testing_date', 'date'],
    ['p_start_time', 'time'], ['p_where_code', 'text'], ['p_auto_close_on', 'date'], ['p_note', 'text'],
  ],
  star_set_registration: [['p_event_id', 'uuid'], ['p_expected_version', 'int'], ['p_open', 'bool']],
  star_delete_event: [
    ['p_event_id', 'uuid'], ['p_expected_version', 'int'], ['p_expected_candidate_count', 'int'],
    ['p_expected_payment_total_cents', 'int'],
  ],
};
export const STAR_EVENT_RPC_NAMES = /*#__PURE__*/ Object.keys(RPC_ARGS);
// Admin only ("A" in §6.2). star_set_registration is staff and admins (the date rule is inside).
const ADMIN_ONLY = new Set(['star_add_event', 'star_update_event', 'star_delete_event']);

// Thrown inside this file only, turned into a { data:null, error } answer.
class DbError extends Error {
  constructor(code, message, httpStatus = 400) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

const TIME_TEXT = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

// Converts one JSON value to the database type (or throws like PostgreSQL would).
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
    case 'int': {
      let n = value;
      if (typeof value === 'string' && /^\s*[+-]?\d+\s*$/.test(value)) n = Number(value);
      if (typeof n !== 'number' || !Number.isInteger(n)) throw new DbError('22P02', `invalid input syntax for type integer: "${value}"`);
      if (Math.abs(n) > INT_MAX) throw new DbError('22003', `value "${value}" is out of range for type integer`);
      return n;
    }
    case 'bool':
      if (typeof value === 'boolean') return value;
      if (value === 'true' || value === 'false') return value === 'true';
      throw new DbError('22P02', `invalid input syntax for type boolean: "${value}"`);
    case 'date':
      if (isIsoDate(value)) return value;
      throw new DbError('22007', `invalid input syntax for type date: "${value}"`);
    case 'time': {
      // '10:00' and '10:00:30' are both times; stored as 'HH:MM:SS' (how the database sends them).
      const m = typeof value === 'string' ? TIME_TEXT.exec(value) : null;
      if (!m) throw new DbError('22007', `invalid input syntax for type time: "${value}"`);
      return `${m[1]}:${m[2]}:${m[3] ?? '00'}`;
    }
    default:
      throw new Error(`unknown type ${type}`);
  }
}

// Matches the call's argument names to the function and converts every value.
function readArgs(name, args) {
  const spec = RPC_ARGS[name];
  const sent = Object.keys(args ?? {}).filter((key) => args[key] !== undefined); // JSON drops undefined
  const known = new Set(spec.map(([key]) => key));
  if (spec.some(([key]) => !sent.includes(key)) || sent.some((key) => !known.has(key))) {
    throw new DbError('PGRST202', `Could not find the function public.${name}(${[...sent].sort().join(', ')}) in the schema cache`, 404);
  }
  return Object.fromEntries(spec.map(([key, type]) => [key, toDbType(args[key], type)]));
}

// ----- Small helpers -----
const clone = (value) => JSON.parse(JSON.stringify(value));
const st = (status) => ({ status });
const nameIsValid = (name) => name !== null && nameProblem(name) === null;
const byPosition = (a, b) => a.position - b.position;
const sum = (list) => list.reduce((total, n) => total + n, 0);

// Fixed, valid uuids for the seed rows, so "Reset" always brings back the same ids.
const pad12 = (n) => String(n).padStart(12, '0');
const fixedId = (kind, n) => `000003${kind}-0000-4000-8000-${pad12(n)}`;
export const SEED_EVENT_IDS = { fall: fixedId('e0', 1), winter: fixedId('e0', 2), spring: fixedId('e0', 3) };

// ----- The copy rule (§2.3): the template as it is NOW, copied into one event -----
// template: the store's dans / categories / grades / assistant. makeId(): a new id per copied row.
function copyTemplateInto(db, eventId, makeId) {
  for (const d of [...db.dans].sort((a, b) => a.dan - b.dan)) {
    db.event_dans.push({
      id: makeId(), event_id: eventId, dan: d.dan, label: d.label, pass_mark: d.pass_mark, star_limit: d.star_limit,
      standard_cents: d.standard_cents, same_day_cents: d.same_day_cents, private_cents: d.private_cents,
    });
  }
  const categories = [...db.categories].sort((a, b) => a.dan - b.dan || a.position - b.position);
  for (const k of categories) {
    db.event_categories.push({
      id: makeId(), event_id: eventId, dan: k.dan, template_category_id: k.id, name: k.name, credits: k.credits,
      position: k.position, from_class_count: k.from_class_count,
    });
  }
  for (const g of [...db.grades].sort(byPosition)) {
    db.event_grades.push({ id: makeId(), event_id: eventId, grade: g.grade, position: g.position, value: g.value });
  }
  const a = db.assistant;
  const assistant = { id: makeId(), event_id: eventId, child_max_age: a.child_max_age };
  for (const col of ASSISTANT_MIN_COLUMNS) assistant[col] = a[col];
  db.event_assistant.push(assistant);
}

// Is the rubric template complete enough to copy? (star_add_event step 6.) Every Dan needs at
// least one subject and exactly one "from class count" subject (Assistant Instructor); 7 grade
// values and the assistant row must exist.
function templateIsComplete(db) {
  if (!Array.isArray(db.dans) || db.dans.length === 0) return false;
  if (!Array.isArray(db.grades) || db.grades.length !== 7 || !db.assistant) return false;
  return db.dans.every((d) => {
    const subjects = db.categories.filter((k) => k.dan === d.dan);
    return subjects.length > 0 && subjects.filter((k) => k.from_class_count).length === 1;
  });
}

// ----- The seed (made-up events and candidates) -----
// [key, name, days from today, start, where, open, closing date (days before testing) or null,
//  first opened (days ago) or null, [Worcester code, Shrewsbury code], note, added (days ago)]
const SEED_EVENTS = [
  ['fall', 'Fall Star Testing', 26, '10:00:00', 'shrewsbury', true, 7, 5, ['fa2kxm7p', 'r9ectw3h'],
    'Please arrive 30 minutes early in a clean uniform.', 12],
  ['winter', 'Winter Star Testing', 110, '10:00:00', 'worcester', false, 7, null, ['w7nd4hqe', 's3vb8tcr'], null, 3],
  ['spring', 'Spring Star Testing', -150, '11:00:00', 'worcester', false, 7, 160, ['b6pyzg2u', 'k4hv7das'], null, 200],
];
// [event key, first, last, school, dan, stars from, paying by, source, registered (days ago),
//  paid { cents, daysAgo } or null, withdrawn (days ago) or null]
const SEED_CANDIDATES = [
  ['spring', 'Morgan', 'Hale', 'worcester', 1, 1, 'cash', 'form', 158, { cents: 14000, daysAgo: 155 }, null],
  ['spring', 'Taylor', 'Quinn', 'shrewsbury', 2, 0, 'check', 'desk', 150, { cents: 16000, daysAgo: 150 }, null],
  ['fall', 'Alex', 'Rowe', 'worcester', 1, 0, 'cash', 'form', 4, { cents: 14000, daysAgo: 2 }, null],
  ['fall', 'Jordan', 'Pike', 'shrewsbury', 2, 1, 'check', 'form', 4, null, null],
  ['fall', 'Casey', 'Lund', 'worcester', 1, 2, 'card', 'desk', 2, null, null],
  ['fall', 'Riley', 'Moss', 'shrewsbury', 1, 0, 'cash', 'form', 3, null, 1],
];
const SEED_ACTOR = 'Jeffrey Berg';

// The seeded events part, added to a copy of the rubric template store `base`.
export function defaultStarEventsData(base, { today, now }) {
  const db = {
    events_schema: STAR_EVENTS_SCHEMA, events: [], event_dans: [], event_categories: [], event_grades: [],
    event_assistant: [], candidates: [], payments: [], next_reference: REFERENCE_START,
  };
  const at = (daysAgo) => new Date(now - daysAgo * DAY_MS).toISOString();
  const dayOf = (iso) => iso.slice(0, 10); // close enough for the seed (UTC date of a past moment)
  const house = (daysAgo) => ({
    version: 1, created_at: at(daysAgo), updated_at: at(daysAgo), created_by: null, updated_by: null,
    created_by_name: SEED_ACTOR, updated_by_name: SEED_ACTOR,
  });
  let copyN = 0;
  const work = { ...base, ...db };
  SEED_EVENTS.forEach(([key, name, days, start, where, open, closeBefore, openedAgo, [codeW, codeS], note, addedAgo]) => {
    const testingDate = addDays(today, days);
    const id = SEED_EVENT_IDS[key];
    work.events.push({
      id, name, testing_date: testingDate, start_time: start, where_code: where, registration_open: open,
      auto_close_on: closeBefore === null ? null : addDays(testingDate, -closeBefore),
      first_opened_at: openedAgo === null ? null : at(openedAgo),
      public_code_worcester: codeW, public_code_shrewsbury: codeS, note, ...house(addedAgo),
    });
    copyTemplateInto(work, id, () => fixedId('c1', (copyN += 1)));
  });
  // Family-form references in registration order (oldest first), like the database's counter.
  const ordered = [...SEED_CANDIDATES].sort((a, b) => b[8] - a[8]);
  ordered.forEach(([key, first, last, school, dan, starsFrom, payingBy, source, regAgo, paid, withdrawnAgo], i) => {
    const id = fixedId('f0', i + 1);
    const reference = source === 'form' ? `ST-${work.next_reference++}` : null;
    work.candidates.push({
      id, event_id: SEED_EVENT_IDS[key], first_name: first, last_name: last,
      date_of_birth: '2012-03-04', email_for_results: 'family@example.com', // never granted (§4.2)
      location_code: school, dan, stars_from: starsFrom, paying_by: payingBy, source, reference,
      registered_at: at(regAgo), status: withdrawnAgo === null ? 'active' : 'withdrawn',
      withdrawn_reason: withdrawnAgo === null ? null : 'withdrawn', withdrawn_at: withdrawnAgo === null ? null : at(withdrawnAgo),
      withdrawn_by: null, withdrawn_by_name: withdrawnAgo === null ? null : SEED_ACTOR,
      duplicate_state: 'none', duplicate_of: null, is_makeup: false, makeup_of_candidate_id: null, makeup_of_event_name: null,
      private_on: null, private_time: null, classes_attended: null, assistant_classes: null, ...house(regAgo),
    });
    if (paid) {
      work.payments.push({
        id: fixedId('90', i + 1), candidate_id: id, kind: 'payment', amount_cents: paid.cents, method: payingBy === 'card' ? 'card' : payingBy,
        paid_on: dayOf(at(paid.daysAgo)), recorded_at: at(paid.daysAgo), recorded_by: null, recorded_by_name: 'Staff',
        reverses_payment_id: null,
      });
    }
  });
  return Object.fromEntries(Object.keys(db).map((k) => [k, work[k]]));
}

// Is the stored events part usable? (Missing or damaged → the seed.)
function eventsPartIsUsable(store) {
  if (!store || store.events_schema !== STAR_EVENTS_SCHEMA) return false;
  const lists = ['events', 'event_dans', 'event_categories', 'event_grades', 'event_assistant', 'candidates', 'payments'];
  if (!lists.every((k) => Array.isArray(store[k])) || !Number.isInteger(store.next_reference)) return false;
  return store.events.every((e) => e && typeof e.id === 'string' && typeof e.name === 'string' && isIsoDate(e.testing_date)
    && typeof e.start_time === 'string' && WHERE_CODES.includes(e.where_code) && typeof e.registration_open === 'boolean'
    && Number.isInteger(e.version) && STAR_CODE_PATTERN.test(e.public_code_worcester) && STAR_CODE_PATTERN.test(e.public_code_shrewsbury));
}

// ----- The backend -----

export function createStarEventsBackend({ readBase, saveStore, now = () => Date.now(), today, newId }) {
  let failNext = false; // set by failNextSave()

  function write(db) {
    saveStore?.(db);
  }

  // The current data (always a private copy: changes only count once saved). A missing or damaged
  // events part is replaced by the seed and saved at once, so its dates and ids stay put.
  function read() {
    const base = clone(readBase());
    if (eventsPartIsUsable(base)) return base;
    Object.assign(base, defaultStarEventsData(base, { today: today(), now: now() }));
    write(base);
    return clone(base);
  }

  const stamp = () => new Date(now()).toISOString();

  // Like the house trigger (§1.8): a change to a content column raises the version and sets the
  // "last changed" stamp; the same values write nothing.
  function updateEvent(row, changes, ctx) {
    const changed = EVENT_CONTENT.some((col) => col in changes && changes[col] !== row[col]);
    if (!changed) return false;
    Object.assign(row, changes);
    row.version += 1;
    row.updated_at = stamp();
    row.updated_by_name = ctx.actorName;
    return true;
  }

  const findEvent = (db, id) => db.events.find((e) => e.id === id) ?? null;
  const sameName = (a, b) => nameKey(a) === nameKey(b);

  // A new public code like the database's testing_new_public_code: 8 characters from a random
  // uuid's bytes. Re-drawn until it is used by NO event in EITHER column and not by `also`.
  function newPublicCode(db, also = null) {
    for (;;) {
      const hex = newId().replace(/-/g, '');
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i += 1) code += STAR_CODE_ALPHABET[parseInt(hex.slice(i * 2, i * 2 + 2), 16) % STAR_CODE_ALPHABET.length];
      const used = db.events.some((e) => e.public_code_worcester === code || e.public_code_shrewsbury === code);
      if (!used && code !== also) return code;
    }
  }

  // ----- The four functions (contract §6.2). Each returns the jsonb answer. -----
  // Already checked by rpc() before these run (§1.1 steps 1–2): no_access, then not_allowed for
  // the admin-only three. Then, as in the SQL: invalid → not_found → stale → data rules →
  // duplicate_name → write.
  const handlers = {
    star_add_event(db, a, ctx) {
      const t = today();
      const note = normalizeNote(a.p_note);
      if (!nameIsValid(a.p_name)
        || a.p_testing_date === null || a.p_testing_date < t
        || !startTimeIsValid(a.p_start_time)
        || a.p_where_code === null || !WHERE_CODES.includes(a.p_where_code)
        || a.p_registration_open === null
        || (a.p_auto_close_on !== null && (a.p_auto_close_on < t || a.p_auto_close_on > a.p_testing_date))
        || (note !== null && !noteIsValid(note))) return st('invalid');
      if (!templateIsComplete(db)) return st('invalid'); // step 6
      const name = normalizeName(a.p_name);
      if (db.events.some((e) => sameName(e.name, name))) return st('duplicate_name');
      const codeW = newPublicCode(db);
      const codeS = newPublicCode(db, codeW);
      const at = stamp();
      const id = newId();
      db.events.push({
        id, name, testing_date: a.p_testing_date, start_time: a.p_start_time, where_code: a.p_where_code,
        registration_open: a.p_registration_open, auto_close_on: a.p_auto_close_on,
        first_opened_at: a.p_registration_open ? at : null, // new events start Closed unless opened here
        public_code_worcester: codeW, public_code_shrewsbury: codeS, note,
        version: 1, created_at: at, updated_at: at, created_by: null, updated_by: null,
        created_by_name: ctx.actorName, updated_by_name: ctx.actorName,
      });
      copyTemplateInto(db, id, newId); // the template AT THIS MOMENT (v0.61)
      return { status: 'ok', id, public_code_worcester: codeW, public_code_shrewsbury: codeS, version: 1 };
    },

    star_update_event(db, a, ctx) {
      const t = today();
      const note = normalizeNote(a.p_note);
      if (a.p_event_id === null || a.p_expected_version === null || !nameIsValid(a.p_name)
        || a.p_testing_date === null
        || !startTimeIsValid(a.p_start_time)
        || a.p_where_code === null || !WHERE_CODES.includes(a.p_where_code)
        || (note !== null && !noteIsValid(note))) return st('invalid');
      const event = findEvent(db, a.p_event_id);
      if (!event) return st('not_found');
      if (event.version !== a.p_expected_version) return st('stale');
      // A past event may keep its date; a CHANGED date must be today or later (v0.92).
      if (a.p_testing_date !== event.testing_date && a.p_testing_date < t) return st('invalid');
      // A CHANGED closing date can't be in the past; any closing date must be on or before the testing date.
      if (a.p_auto_close_on !== event.auto_close_on && a.p_auto_close_on !== null && a.p_auto_close_on < t) return st('invalid');
      if (a.p_auto_close_on !== null && a.p_auto_close_on > a.p_testing_date) return st('invalid');
      const name = normalizeName(a.p_name);
      if (db.events.some((e) => e.id !== event.id && sameName(e.name, name))) return st('duplicate_name');
      // The event's copy is never touched. The Registration switch is not an argument (§11 item 7).
      updateEvent(event, {
        name, testing_date: a.p_testing_date, start_time: a.p_start_time, where_code: a.p_where_code,
        auto_close_on: a.p_auto_close_on, note,
      }, ctx);
      return { status: 'ok', version: event.version };
    },

    // Exactly 0005's testing_set_registration (v0.85, v0.86) — staff may call it too.
    star_set_registration(db, a, ctx) {
      if (a.p_event_id === null || a.p_expected_version === null || a.p_open === null) return st('invalid');
      const event = findEvent(db, a.p_event_id);
      if (!event) return st('not_found');
      if (event.version !== a.p_expected_version) return st('stale');
      const t = today();
      // eventRules.registrationSwitch: 'finished' once the testing day has passed; staff reopening
      // after the closing date → 'not_allowed'; an admin reopening then → the date is removed.
      const rule = registrationSwitch({ event, open: a.p_open, isAdmin: ctx.isAdmin, today: t });
      if (rule.status !== 'ok') return st(rule.status);
      const changes = { registration_open: a.p_open };
      if (a.p_open && event.first_opened_at === null) changes.first_opened_at = stamp();
      if (rule.clearsAutoClose) changes.auto_close_on = null;
      updateEvent(event, changes, ctx); // same value → nothing written, version kept
      return { status: 'ok', version: event.version, state: eventState(event, t) };
    },

    star_delete_event(db, a) {
      if ([a.p_event_id, a.p_expected_version, a.p_expected_candidate_count, a.p_expected_payment_total_cents].includes(null)) return st('invalid');
      const event = findEvent(db, a.p_event_id);
      if (!event) return st('not_found');
      if (event.version !== a.p_expected_version) return st('stale');
      // ALL candidates (withdrawn too) and the NET payment total (payments, refunds, reversals).
      const ids = new Set(db.candidates.filter((c) => c.event_id === event.id).map((c) => c.id));
      const total = sum(db.payments.filter((p) => ids.has(p.candidate_id)).map((p) => p.amount_cents));
      if (ids.size !== a.p_expected_candidate_count || total !== a.p_expected_payment_total_cents) return st('stale');
      // Cascades: the candidates' rows in every candidate list (later phases add more lists), then
      // the event's copy and the event.
      for (const list of ['payments', 'signatures', 'makeup_subjects', 'candidate_grades', 'result_emails']) {
        if (Array.isArray(db[list])) db[list] = db[list].filter((row) => !ids.has(row.candidate_id));
      }
      db.candidates = db.candidates.filter((c) => !ids.has(c.id));
      // A make-up row in a LATER event that pointed at a removed candidate keeps its row, with the
      // link set to null (the foreign key's "on delete set null", contract §1.5 side effect a).
      for (const c of db.candidates) {
        if (ids.has(c.makeup_of_candidate_id)) {
          c.makeup_of_candidate_id = null;
          c.version += 1;
          c.updated_at = stamp();
        }
        if (ids.has(c.duplicate_of)) c.duplicate_of = null;
      }
      for (const list of ['event_dans', 'event_categories', 'event_grades', 'event_assistant']) {
        db[list] = db[list].filter((row) => row.event_id !== event.id);
      }
      db.events = db.events.filter((e) => e.id !== event.id);
      return { status: 'ok' };
    },
  };

  // ----- The star_roster view (§2.12), worked out from the stored candidates and payments -----
  function rosterRows(db) {
    const t = today();
    return db.candidates.map((c) => {
      const e = findEvent(db, c.event_id);
      const d = db.event_dans.find((x) => x.event_id === c.event_id && x.dan === c.dan);
      if (!e || !d) return null; // the view joins both: a row without them doesn't show
      const mine = db.payments.filter((p) => p.candidate_id === c.id);
      const reversed = new Set(mine.filter((p) => p.reverses_payment_id).map((p) => p.reverses_payment_id));
      const paidCents = sum(mine.map((p) => p.amount_cents));
      const last = mine
        .filter((p) => p.kind === 'payment' && !reversed.has(p.id))
        .sort((x, y) => (x.recorded_at < y.recorded_at ? 1 : x.recorded_at > y.recorded_at ? -1 : x.id < y.id ? 1 : -1))[0] ?? null;
      const refunded = -sum(mine.filter((p) => p.kind === 'refund' && !reversed.has(p.id)).map((p) => p.amount_cents));
      const paid = paidCents > 0;
      let feeKind;
      if (c.is_makeup) feeKind = 'none';
      else if (c.private_on !== null) feeKind = 'private';
      else if (paid) feeKind = last && last.paid_on < e.testing_date ? 'standard' : 'same_day';
      else feeKind = t < e.testing_date ? 'standard' : 'same_day';
      const fee = { none: 0, private: d.private_cents, standard: d.standard_cents, same_day: d.same_day_cents }[feeKind];
      const row = Object.fromEntries(ROSTER_COLUMNS.slice(0, 29).map((col) => [col, c[col] ?? null]));
      return Object.assign(row, {
        testing_date: e.testing_date, dan_label: d.label, star_limit: d.star_limit, standard_cents: d.standard_cents,
        same_day_cents: d.same_day_cents, private_cents: d.private_cents, paid_cents: paidCents, paid,
        last_payment_id: last?.id ?? null, paid_on: last?.paid_on ?? null, paid_method: last?.method ?? null,
        last_payment_recorded_at: last?.recorded_at ?? null, last_payment_recorded_by_name: last?.recorded_by_name ?? null,
        refunded_cents: refunded, fee_kind: feeKind, expected_fee_cents: fee, overpaid_cents: paid ? Math.max(paidCents - fee, 0) : 0,
      });
    }).filter(Boolean);
  }

  function rowsOf(db, table) {
    switch (table) {
      case 'star_events': return db.events;
      case 'star_event_dans': return db.event_dans;
      case 'star_event_categories': return db.event_categories;
      case 'star_event_grades': return db.event_grades;
      case 'star_event_assistant': return db.event_assistant;
      default: return rosterRows(db);
    }
  }

  // ----- Answers in the Supabase client's shape -----
  const ok = (data) => ({ data, error: null, count: null, status: 200, statusText: 'OK' });
  const fail = (code, message, status = 403) => ({
    data: null,
    error: { code, message, details: null, hint: null },
    count: null,
    status,
    statusText: status === 404 ? 'Not Found' : status === 403 ? 'Forbidden' : 'Bad Request',
  });
  const denied = (what) => fail('42501', `permission denied for ${what}`, 403);

  // supabase.from(table).select(columns).eq(…).in(…).order(…)
  function select(table, columns, filters = [], orders = [], ctx = {}) {
    if (!(table in GRANTED)) return fail('PGRST205', `Could not find the table 'public.${table}' in the schema cache`, 404);
    if (!ctx.signedIn) return denied(`table ${table}`);
    const existing = [...GRANTED[table], ...HIDDEN[table]];
    const wanted = String(columns ?? '*').split(',').map((col) => col.trim()).filter(Boolean);
    if (wanted.length === 0) wanted.push('*');
    // Every column used (selected, filtered, sorted) must be readable — like PostgreSQL.
    const used = [...wanted, ...filters.map((f) => f.col), ...orders.map((o) => o.col)];
    for (const col of used) {
      if (col === '*' || HIDDEN[table].includes(col)) return denied(`table ${table}`);
      if (!existing.includes(col)) return fail('42703', `column ${table}.${col} does not exist`, 400);
    }
    if (!ctx.hasDataAccess) return ok([]); // row-level security hides every row
    let rows = rowsOf(read(), table);
    // Filters compare as text, like the real API (the filter travels in the web address).
    rows = rows.filter((row) => filters.every((f) => (f.op === 'in'
      ? (f.value ?? []).map(String).includes(String(row[f.col]))
      : String(row[f.col]) === String(f.value))));
    rows = [...rows].sort((x, y) => {
      for (const { col, ascending = true } of orders) {
        if (x[col] === y[col]) continue;
        const less = x[col] === null ? false : y[col] === null ? true : x[col] < y[col]; // nulls last
        return (less ? -1 : 1) * (ascending ? 1 : -1);
      }
      return 0;
    });
    return ok(rows.map((row) => Object.fromEntries(wanted.map((col) => [col, row[col] ?? null]))));
  }

  // supabase.rpc(name, args) for the four event functions.
  function rpc(name, args = {}, ctx = {}) {
    if (!(name in handlers)) return fail('PGRST202', `Could not find the function public.${name} in the schema cache`, 404);
    if (failNext) {
      failNext = false; // pretend the connection dropped: nothing changes (failNextSave helper)
      return { data: null, error: { message: 'Failed to fetch (preview: failNextSave)' }, count: null, status: 0, statusText: '' };
    }
    if (!ctx.signedIn) return denied(`function ${name}`);
    let parsed;
    try {
      parsed = readArgs(name, args);
    } catch (error) {
      if (error instanceof DbError) return fail(error.code, error.message, error.httpStatus);
      throw error;
    }
    // §1.1: has_data_access FIRST, then the role (admin-only functions).
    if (!ctx.hasDataAccess) return ok(st('no_access'));
    if (ADMIN_ONLY.has(name) && !ctx.isAdmin) return ok(st('not_allowed'));
    const db = read(); // a private copy = a transaction: only an 'ok' is saved
    const actorName = ctx.actorName || (ctx.isAdmin ? 'Admin' : 'Staff');
    const answer = handlers[name](db, parsed, { actorName, isAdmin: Boolean(ctx.isAdmin) });
    if (answer.status === 'ok') write(db);
    return ok(answer);
  }

  // ----- Test helpers (console helpers in mockClient.js, and star/eventsChecks.mjs) -----

  // The next Star event function call fails like a dropped connection (nothing changes).
  function failNextSave() {
    failNext = true;
  }

  // "Another admin" changes every event and candidate: open dialogs, menus and Undo go stale.
  function simulateOtherAdminEdit() {
    const db = read();
    const at = stamp();
    for (const row of [...db.events, ...db.candidates]) {
      row.version += 1;
      row.updated_by_name = 'Other Admin';
      row.updated_at = at;
    }
    write(db);
  }

  // Back to the seeded events (their dates worked out from today); the rubric template is kept.
  function reset() {
    const base = clone(readBase());
    Object.assign(base, defaultStarEventsData(base, { today: today(), now: now() }));
    write(base);
  }

  return { select, rpc, failNextSave, simulateOtherAdminEdit, reset, snapshot: read };
}
