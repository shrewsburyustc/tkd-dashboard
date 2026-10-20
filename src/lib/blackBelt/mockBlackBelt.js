// mockBlackBelt.js — the PREVIEW (fake) database for Black Belt testing, phase B1.
// Why it exists: preview mode (npm run dev:preview-mode) runs without Supabase. This file pretends
// to be what migration 0016 adds for B1 (contract 0016-B1 §2): the tables, the staff functions
// behind the Cycles and Rubric and prices screens, and the two public functions the family form
// uses (through publicApi.preview.js) — with the SAME order of checks, the same status codes, the
// same staff/admin splits, the purge and the 24-hour waiver rule. What you see in preview is what
// the real dashboard will do.
//
// It is a "pure core": it never touches the browser by itself.
//   const bb = createBlackBeltBackend({ loadStore, saveStore, now, today, newId, getLocations });
//     loadStore()    → the saved store object (mockClient: localStorage 'tkd.preview.blackBelt'),
//                      or null / anything damaged → the seed below
//     saveStore(s)   → saves the whole store
//     now()          → milliseconds (the real clock)
//     today()        → 'YYYY-MM-DD' in school time (setToday can pretend another date)
//     newId()        → a new uuid
//     getLocations() → the schools (code, name, address_*) — optional; the Color Belt store's
//                      locations in preview, else just the two names
//   bb.rpc(name, args, ctx, options)  ctx = { signedIn, hasDataAccess, isAdmin, actorName, userId }
//   bb.select(table, columns, filters, orders, ctx)   filters: [{ col, value, op:'eq'|'in'|'lte'|'gte' }]
//   bb.publicCycle(code) / bb.publicRegister({...})   — what bb_registrar may call (the stand-in)
//   bb.snapshot(), reset(), loadSample(), failNextSave(), simulateOtherAdminEdit(),
//   waiverChanged(), links()                          — test and console helpers
//
// The store (snake_case columns exactly as 0016, so phase B2 adds candidates and payments here
// without a rewrite): bb_settings, bb_waiver_versions, bb_starting_point, bb_cycles,
// bb_cycle_days, bb_cycle_day_parts, bb_cycle_plans, bb_cycle_plan_amounts,
// bb_cycle_kukkiwon_fees, bb_cycle_plan_payments, bb_candidates, bb_candidate_waivers,
// bb_payments (empty in B1), public_attempts, and ref_counter (the next BB- reference, 5001).
// Times of day are stored as the database sends them ('12:30:00'); timestamps as ISO text.
//
// The store's clock: when __tkdPreview.setToday pretends another date, every timestamp the store
// writes (registered_at, superseded_at …) is moved by the same number of days, so "the school
// date of registered_at" and "24 hours ago" follow the pretend date like they would for real.
//
// Privacy (as the real database): the date of birth, the email, the signature and the signer's
// name are never readable through select(), never in any answer to the staff screens, and never
// logged. The public ok answer has exactly bb_public_answer's keys.
import { normalizeName, nameProblem, nameKey } from '../testing/names.js';
import { isIsoDate, signatureIsValid, normalizeNote, noteIsValid, todayInSchoolTime } from '../testing/eventRules.js';
import {
  cycleState, ageOn, firstDayOf, emailIsValid, trimSpaces, purgeDueOn, waiverVersionOk, PARTS, CODE_PATTERN,
  WAIVER_BODY_MAX, KEEP_YEARS_MIN, KEEP_YEARS_MAX, MAX_DAYS, MAX_PLANS, MAX_PAYMENTS, PLACE_OTHER_MAX,
} from './rules.js';
import {
  STARTING_POINT_SCHEDULE, STARTING_POINT_REQUIREMENTS, STARTING_POINT_NAME, SEED_WAIVER_BODY, SEED_WAIVER_VERSION_NAME,
} from './startingPoint.js';

// Its own browser-storage key, apart from Color Belt's 'tkd.preview.testing' and Star's.
export const BB_STORE_KEY = 'tkd.preview.blackBelt';
const STORE_SCHEMA = 'bb-1'; // bump when the store's shape changes (an old store → the seed)

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const RATE_LIMIT_PER_HOUR = 20; // 20 or more tries per connection in the last hour → rate_limited
const ATTEMPT_KEEP_MS = 2 * DAY_MS; // rate-limit rows older than 2 days are removed
const REFERENCE_START = 5001; // BB-5001 is the first reference (S14)
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // testing_new_public_code
const CODE_LENGTH = 8;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INT_MAX = 2147483647;
const SEED_ACTOR = 'Database admin';
const FORM_ACTOR = 'Family form';

// ----- The tables the app may read, and their columns (contract 0016 §4.1, §4.2) -----
// GRANTED = readable by a signed-in staff member; HIDDEN = exists but never granted (asking for
// it, or for '*', is "permission denied", like the real column grants).
const GRANTED = {
  bb_settings: ['id', 'keep_years_after_last_day', 'keep_years_after_18', 'version', 'created_at', 'updated_at', 'created_by_name', 'updated_by_name'],
  bb_waiver_versions: ['id', 'version_name', 'body', 'is_placeholder', 'superseded_at', 'created_at', 'created_by_name'],
  bb_starting_point: [],
  bb_cycles: ['id', 'name', 'application_due', 'submissions_due', 'auto_close', 'registration_open', 'first_opened_at',
    'public_code_worcester', 'public_code_shrewsbury', 'requirements', 'prices_from', 'version', 'created_at', 'updated_at',
    'created_by_name', 'updated_by_name'],
  bb_cycle_days: ['id', 'cycle_id', 'name', 'day_date', 'start_time', 'end_time', 'place_code', 'place_other', 'second_start',
    'second_end', 'second_place_code', 'second_place_other', 'version', 'created_at', 'updated_at', 'created_by_name', 'updated_by_name'],
  bb_cycle_day_parts: ['id', 'day_id', 'part'],
  bb_cycle_plans: ['id', 'cycle_id', 'name', 'payments_count', 'position', 'created_at', 'created_by_name'],
  bb_cycle_plan_amounts: ['id', 'cycle_plan_id', 'dan', 'payment_no', 'amount_cents'],
  bb_cycle_kukkiwon_fees: ['id', 'cycle_id', 'dan', 'amount_cents'],
  bb_cycle_plan_payments: ['id', 'cycle_plan_id', 'payment_no', 'due_on', 'follows_application_due', 'version', 'updated_at', 'updated_by_name'],
  bb_candidates: ['id', 'cycle_id', 'first_name', 'last_name', 'personal_removed_at', 'location_code', 'dan', 'cycle_plan_id',
    'kukkiwon', 'kukkiwon_added_on', 'source', 'reference', 'registered_at', 'status', 'withdrawn_reason', 'withdrawn_at',
    'withdrawn_by_name', 'duplicate_state', 'duplicate_of', 'version', 'created_at', 'updated_at', 'created_by_name', 'updated_by_name'],
  bb_candidate_waivers: [],
  bb_payments: ['id', 'candidate_id', 'cycle_id', 'kind', 'amount_cents', 'method', 'paid_on', 'for_items', 'note', 'reason',
    'location_code', 'cycle_name', 'recorded_at', 'recorded_by_name', 'reverses_payment_id'],
};
const HIDDEN = {
  bb_settings: ['singleton', 'created_by', 'updated_by'],
  bb_waiver_versions: ['created_by'],
  bb_starting_point: ['id', 'singleton', 'schedule', 'requirements', 'created_at', 'created_by_name'],
  bb_cycles: ['created_by', 'updated_by'],
  bb_cycle_days: ['created_by', 'updated_by'],
  bb_cycle_day_parts: ['created_at', 'created_by', 'created_by_name'],
  bb_cycle_plans: [],
  bb_cycle_plan_amounts: [],
  bb_cycle_kukkiwon_fees: [],
  bb_cycle_plan_payments: ['created_at', 'created_by', 'updated_by', 'created_by_name'],
  bb_candidates: ['date_of_birth', 'email_for_results', 'withdrawn_by', 'created_by', 'updated_by'],
  bb_candidate_waivers: ['id', 'candidate_id', 'waiver_version_id', 'how', 'submission_id', 'acknowledged', 'signed_as_minor',
    'signer_name', 'signature', 'ticked_by_name', 'signed_at', 'removed_at', 'version', 'created_at', 'updated_at', 'created_by',
    'updated_by', 'created_by_name', 'updated_by_name'],
  bb_payments: ['recorded_by'],
};
// Every Black Belt table (mockClient routes supabase.from(<one of these>) here).
// The /* @__PURE__ */ marks tell the bundler (Vite) "this call has no side effects", so when
// nothing uses the result — the live build, where mockClient.js is never used — it drops the call
// AND the lists it reads. Without them the table, column and function names below ended up in the
// live dashboard's JavaScript (security review B1, item 14).
export const BB_TABLES = /* @__PURE__ */ Object.keys(GRANTED);
const STORE_LISTS = /* @__PURE__ */ BB_TABLES.concat(['public_attempts']);

// ----- The staff functions' argument lists (name, type) — exactly 0016's names -----
const ID = (name) => [name, 'uuid'];
const RPC_ARGS = {
  bb_cycles_list: [],
  bb_cycle_defaults: [],
  bb_add_cycle: [['p_payload', 'jsonb'], ID('p_source_cycle_id')],
  bb_update_cycle: [ID('p_cycle_id'), ['p_expected_version', 'int'], ['p_payload', 'jsonb']],
  bb_set_registration: [ID('p_cycle_id'), ['p_expected_version', 'int'], ['p_open', 'bool']],
  bb_delete_cycle: [ID('p_cycle_id'), ['p_expected_version', 'int'], ['p_expected_candidate_count', 'int']],
  bb_save_waiver: [ID('p_expected_current_id'), ['p_body', 'text']],
  bb_set_keep_years: [['p_expected_version', 'int'], ['p_after_last_day', 'int'], ['p_after_18', 'int'], ['p_confirm_count', 'int']],
};
// A = admins only (checked right after has_data_access). bb_cycles_list and bb_set_registration
// are S (staff and admins); set_registration's admin-only case is inside it.
const ADMIN_ONLY = /* @__PURE__ */ new Set(['bb_cycle_defaults', 'bb_add_cycle', 'bb_update_cycle', 'bb_delete_cycle', 'bb_save_waiver', 'bb_set_keep_years']);
// Functions that exist but that a signed-in staff member may NOT call (only bb_registrar, or
// nobody): the app gets "permission denied", like the real database.
const RESTRICTED = ['bb_public_cycle', 'bb_public_register', 'bb_public_register_core', 'bb_cycle_state', 'bb_purge_due',
  'bb_candidate_items', 'bb_candidate_money', 'bb_public_answer', 'bb_waiver_version_ok'];
// The writes (failNextSave fails the next one of these). B2 adds its functions here and above.
export const BB_WRITE_RPC_NAMES = ['bb_add_cycle', 'bb_update_cycle', 'bb_set_registration', 'bb_delete_cycle', 'bb_save_waiver', 'bb_set_keep_years'];
// "volatile" functions: they write (bb_cycles_list runs the purge), so a read-only GET call is
// refused, as PostgREST does.
const VOLATILE = /* @__PURE__ */ new Set(/* @__PURE__ */ ['bb_cycles_list'].concat(BB_WRITE_RPC_NAMES));
// Every function name mockClient routes here (one list B2 extends).
export const BB_RPC_NAMES = /* @__PURE__ */ Object.keys(RPC_ARGS).concat(RESTRICTED);

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
    case 'int': {
      let n = value;
      if (typeof value === 'string' && /^\s*[+-]?\d+\s*$/.test(value)) n = Number(value);
      if (typeof n !== 'number' || !Number.isInteger(n)) throw new DbError('22P02', `invalid input syntax for type integer: "${value}"`);
      if (Math.abs(n) > INT_MAX) throw new DbError('22003', `value "${value}" is out of range for type integer`);
      return n;
    }
    case 'bool':
      if (typeof value === 'boolean') return value;
      if (value === 'true' || value === 't') return true;
      if (value === 'false' || value === 'f') return false;
      throw new DbError('22P02', `invalid input syntax for type boolean: "${value}"`);
    case 'jsonb':
      return JSON.parse(JSON.stringify(value)); // any JSON value; the function checks it itself
    default:
      throw new Error(`unknown type ${type}`);
  }
}

// Matches the call's argument names to the function (all required — no defaults) and converts them.
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

const clone = (value) => JSON.parse(JSON.stringify(value));
const st = (status) => ({ status });
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const onlyKeys = (obj, allowed) => Object.keys(obj).every((k) => allowed.includes(k));
const nameOk = (v) => typeof v === 'string' && nameProblem(v) === null; // testing_name_is_valid
const noteOk = (v) => typeof v === 'string' && normalizeNote(v) !== null && noteIsValid(v); // testing_note_is_valid
const charCount = (text) => [...text].length;
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// '12:30' / '12:30:00' / '9:00' → { db: '12:30:00', minutes, seconds }; not a time → null.
function parseTime(text) {
  const m = typeof text === 'string' ? /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text) : null;
  if (!m) return null;
  const [h, min, s] = [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
  if (h > 23 || min > 59 || s > 59) return null;
  return { db: `${String(h).padStart(2, '0')}:${m[2]}:${String(s).padStart(2, '0')}`, minutes: h * 60 + min, seconds: s };
}
// bb_time_is_valid: 06:00–22:00 on a 15-minute step, no seconds.
const bbTimeOk = (t) => t !== null && t.seconds === 0 && t.minutes >= 360 && t.minutes <= 1320 && t.minutes % 15 === 0;
// The database's time → 'HH:MM' (bb_cycle_defaults / bb_public_cycle use left(time, 5)).
const short = (dbTime) => (typeof dbTime === 'string' ? dbTime.slice(0, 5) : null);

// Whole days from date a to date b ('YYYY-MM-DD').
function daysBetween(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DAY_MS);
}

// A real-looking PNG "signature" for the sample (a 1×1 picture; never a real person's).
const SAMPLE_SIGNATURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// ----- The backend -----

export function createBlackBeltBackend({ loadStore, saveStore, now = () => Date.now(), today, newId, getLocations = null }) {
  let failNext = false; // set by failNextSave()

  // The store's clock: the real time, moved by as many days as setToday pretends (see the top).
  const clock = () => {
    const real = now();
    const shift = daysBetween(todayInSchoolTime(real), today());
    return real + shift * DAY_MS;
  };
  const stamp = (ms = clock()) => new Date(ms).toISOString();
  // The school date of a stored timestamp (testing_school_date).
  const schoolDateOf = (iso) => todayInSchoolTime(Date.parse(iso));

  // The schools: from the Color Belt preview store when there is one, else the two names.
  function locations() {
    let rows = null;
    try {
      rows = typeof getLocations === 'function' ? getLocations() : null;
    } catch {
      rows = null;
    }
    const fallback = [{ code: 'worcester', name: 'Worcester' }, { code: 'shrewsbury', name: 'Shrewsbury' }];
    return Array.isArray(rows) && rows.some((l) => l?.code === 'worcester') && rows.some((l) => l?.code === 'shrewsbury') ? rows : fallback;
  }
  const locationCodes = () => locations().map((l) => l.code);
  const location = (code) => locations().find((l) => l.code === code) ?? null;
  // testing_location_address: { street, city, state, zip } or null when not entered.
  const addressOf = (code) => {
    const l = location(code);
    return l?.address_street ? { street: l.address_street, city: l.address_city ?? null, state: l.address_state ?? null, zip: l.address_zip ?? null } : null;
  };

  // ----- The seed: exactly migration 0016's (section 11n) -----

  function seedStore() {
    const at = stamp();
    return {
      schema: STORE_SCHEMA,
      bb_settings: [{
        id: newId(), singleton: true, keep_years_after_last_day: null, keep_years_after_18: null, version: 1,
        created_at: at, updated_at: at, created_by: null, updated_by: null, created_by_name: SEED_ACTOR, updated_by_name: SEED_ACTOR,
      }],
      bb_waiver_versions: [{
        id: newId(), version_name: SEED_WAIVER_VERSION_NAME, body: SEED_WAIVER_BODY, is_placeholder: true, superseded_at: null,
        created_at: at, created_by: null, created_by_name: SEED_ACTOR,
      }],
      bb_starting_point: [{
        id: newId(), singleton: true, schedule: clone(STARTING_POINT_SCHEDULE), requirements: clone(STARTING_POINT_REQUIREMENTS),
        created_at: at, created_by_name: SEED_ACTOR,
      }],
      bb_cycles: [], bb_cycle_days: [], bb_cycle_day_parts: [], bb_cycle_plans: [], bb_cycle_plan_amounts: [],
      bb_cycle_kukkiwon_fees: [], bb_cycle_plan_payments: [], bb_candidates: [], bb_candidate_waivers: [], bb_payments: [],
      public_attempts: [],
      ref_counter: REFERENCE_START,
    };
  }

  // Is a saved store whole enough to use? (Damaged or from another build → the seed.)
  function usable(store) {
    if (!isObj(store) || store.schema !== STORE_SCHEMA) return false;
    if (!STORE_LISTS.every((list) => Array.isArray(store[list]))) return false;
    if (!Number.isInteger(store.ref_counter) || store.ref_counter < REFERENCE_START) return false;
    if (store.bb_settings.length !== 1 || store.bb_starting_point.length !== 1) return false;
    return store.bb_waiver_versions.filter((v) => v?.superseded_at === null).length === 1;
  }

  // The current data (a private copy each time: a function's changes are saved only at the end).
  function read() {
    let store = null;
    try {
      store = clone(loadStore());
    } catch {
      store = null;
    }
    return usable(store) ? store : seedStore();
  }
  const write = (db) => saveStore?.(db);

  // ----- What the before-write triggers do (bb_before_write) -----

  function house(actor, at = stamp()) {
    return { version: 1, created_at: at, updated_at: at, created_by: null, updated_by: null, created_by_name: actor, updated_by_name: actor };
  }
  // Changes a row: a real change bumps the version and the "last changed" stamp; changing nothing
  // leaves them alone. force = bump anyway (a function writing version + 1 on purpose).
  // Returns true when something changed.
  function updateRow(row, changes, actor, force = false) {
    const changed = Object.keys(changes).some((col) => JSON.stringify(changes[col]) !== JSON.stringify(row[col]));
    Object.assign(row, changes);
    if (changed || force) {
      row.version += 1;
      row.updated_at = stamp();
      row.updated_by_name = actor;
    }
    return changed;
  }

  // ----- Lookups -----

  const findCycle = (db, id) => db.bb_cycles.find((c) => c.id === id) ?? null;
  const daysOf = (db, cycleId) => db.bb_cycle_days.filter((d) => d.cycle_id === cycleId)
    .sort((a, b) => cmp(a.day_date, b.day_date) || cmp(a.start_time, b.start_time) || byId(a, b));
  const partsOf = (db, dayId) => PARTS.filter((p) => db.bb_cycle_day_parts.some((x) => x.day_id === dayId && x.part === p));
  const plansOf = (db, cycleId) => db.bb_cycle_plans.filter((p) => p.cycle_id === cycleId).sort((a, b) => a.position - b.position);
  const planPaymentsOf = (db, planId) => db.bb_cycle_plan_payments.filter((p) => p.cycle_plan_id === planId).sort((a, b) => a.payment_no - b.payment_no);
  const amountsOf = (db, planId) => Object.fromEntries([1, 2, 3, 4].map((dan) => [String(dan), db.bb_cycle_plan_amounts
    .filter((a) => a.cycle_plan_id === planId && a.dan === dan).sort((a, b) => a.payment_no - b.payment_no).map((a) => a.amount_cents)]));
  const feesOf = (db, cycleId) => Object.fromEntries(db.bb_cycle_kukkiwon_fees.filter((f) => f.cycle_id === cycleId)
    .sort((a, b) => a.dan - b.dan).map((f) => [String(f.dan), f.amount_cents]));
  const candidatesOf = (db, cycleId) => db.bb_candidates.filter((c) => c.cycle_id === cycleId);
  const currentWaiver = (db) => db.bb_waiver_versions.find((v) => v.superseded_at === null) ?? null;
  const settings = (db) => db.bb_settings[0];

  // bb_cycle_state as the database answers it (snake_case keys).
  function stateOf(db, cycle, onDay = today()) {
    const s = cycleState(cycle, daysOf(db, cycle.id), onDay);
    return {
      state: s.state, registration: s.registration, past: s.past, testing_today: s.testingToday, first_day: s.firstDay,
      last_day: s.lastDay, next_day: s.nextDay, public_status: s.publicStatus, closed_on: s.closedOn,
    };
  }

  // A new family-link code, unused in either column of any cycle (testing_new_public_code).
  function newCode(db, also = []) {
    for (;;) {
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i += 1) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      const used = also.includes(code) || db.bb_cycles.some((c) => c.public_code_worcester === code || c.public_code_shrewsbury === code);
      if (!used) return code;
    }
  }

  // ----- The purge (SQL 13f bb_purge_due) -----
  // While either keep-years setting is empty: nothing. Otherwise every not-yet-purged candidate
  // whose purge day is today or earlier loses DOB and email (personal_removed_at set), and their
  // drawn waivers lose the signature and signer's name (removed_at set). No version bump.
  function purge(db) {
    const s = settings(db);
    if (s.keep_years_after_last_day === null || s.keep_years_after_18 === null) return 0;
    const onDay = today();
    const at = stamp();
    let n = 0;
    for (const c of [...db.bb_candidates].sort(byId)) {
      if (c.personal_removed_at !== null) continue;
      const days = daysOf(db, c.cycle_id);
      const due = purgeDueOn({
        dateOfBirth: c.date_of_birth, lastDay: days.length ? days[days.length - 1].day_date : null,
        afterLastDay: s.keep_years_after_last_day, after18: s.keep_years_after_18,
      });
      if (due === null || due > onDay) continue;
      c.date_of_birth = null;
      c.email_for_results = null;
      c.personal_removed_at = at;
      for (const w of db.bb_candidate_waivers) {
        if (w.candidate_id === c.id && w.how === 'drawn' && w.removed_at === null) {
          w.signature = null;
          w.signer_name = null;
          w.removed_at = at;
        }
      }
      n += 1;
    }
    return n;
  }

  // ----- Reading a cycle payload (SQL 15c / 15d input checks). null = 'invalid'. -----

  // One place: { code } of a school, or { other } text up to 100 characters → stored columns.
  function readPlace(x) {
    if (!isObj(x) || Object.keys(x).length !== 1) return null;
    if (typeof x.code === 'string' && locationCodes().includes(x.code)) return { code: x.code, other: null };
    if (typeof x.other === 'string' && noteOk(x.other) && charCount(normalizeNote(x.other)) <= PLACE_OTHER_MAX) {
      return { code: null, other: normalizeNote(x.other) };
    }
    return null;
  }

  // One day of the payload. mode 'add': no id; 'update': an id may name a saved day.
  function readDay(v, mode, onDay) {
    if (!isObj(v) || !onlyKeys(v, ['id', 'name', 'day_date', 'start_time', 'end_time', 'place', 'second', 'parts'])) return null;
    let id = null;
    if (v.id !== undefined && v.id !== null) {
      if (mode === 'add' || typeof v.id !== 'string' || !UUID_PATTERN.test(v.id)) return null;
      id = v.id.toLowerCase();
    }
    if (!nameOk(v.name) || typeof v.day_date !== 'string' || !isIsoDate(v.day_date)) return null;
    const start = parseTime(v.start_time);
    const end = parseTime(v.end_time);
    if (typeof v.start_time !== 'string' || typeof v.end_time !== 'string' || !start || !end) return null;
    if (mode === 'add' && v.day_date < onDay) return null;
    if (!bbTimeOk(start) || !bbTimeOk(end) || end.minutes <= start.minutes) return null;
    const place = readPlace(v.place);
    if (!place) return null;
    let second = null;
    if (v.second !== undefined && v.second !== null) {
      const s = v.second;
      if (!isObj(s) || !onlyKeys(s, ['start', 'end', 'place'])) return null;
      const s1 = parseTime(s.start);
      const s2 = parseTime(s.end);
      if (typeof s.start !== 'string' || typeof s.end !== 'string' || !s1 || !s2) return null;
      if (!bbTimeOk(s1) || !bbTimeOk(s2) || s2.minutes <= s1.minutes || s1.minutes < end.minutes) return null;
      const sp = readPlace(s.place);
      if (!sp) return null;
      second = { start: s1.db, end: s2.db, place: sp };
    }
    const parts = v.parts;
    if (!Array.isArray(parts) || parts.length < 1 || parts.length > 3) return null;
    if (parts.some((p) => typeof p !== 'string' || !PARTS.includes(p)) || new Set(parts).size !== parts.length) return null;
    return { id, name: normalizeName(v.name), date: v.day_date, start: start.db, end: end.db, place, second, parts: [...parts] };
  }

  // The fields both Add and Update share. Returns { name, app, sub, auto, days, lastDay } or null.
  function readCommon(payload, mode, onDay) {
    if (!nameOk(payload.name)) return null;
    for (const key of ['application_due', 'submissions_due']) {
      if (typeof payload[key] !== 'string' || !isIsoDate(payload[key])) return null;
    }
    if (typeof payload.auto_close !== 'boolean') return null;
    if (!Array.isArray(payload.days) || payload.days.length < 1 || payload.days.length > MAX_DAYS) return null;
    const days = [];
    const ids = new Set();
    for (const v of payload.days) {
      const day = readDay(v, mode, onDay);
      if (!day) return null;
      if (day.id) {
        if (ids.has(day.id)) return null; // the same day twice
        ids.add(day.id);
      }
      days.push(day);
    }
    const lastDay = days.map((d) => d.date).sort().pop();
    if (payload.application_due > lastDay || payload.submissions_due > lastDay) return null;
    return { name: normalizeName(payload.name), app: payload.application_due, sub: payload.submissions_due, auto: payload.auto_close, days, lastDay };
  }

  // A price in the payload: a JSON number of whole dollars from $1 to $5,000 (in cents).
  const priceOk = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 100 && v <= 500000 && v % 100 === 0;

  function readAddPayload(payload, onDay) {
    if (!isObj(payload) || !onlyKeys(payload, ['name', 'application_due', 'submissions_due', 'auto_close', 'days', 'plans', 'kukkiwon', 'prices_from'])) return null;
    if (payload.prices_from !== undefined && payload.prices_from !== null && !nameOk(payload.prices_from)) return null;
    if (!Array.isArray(payload.plans) || payload.plans.length < 1 || payload.plans.length > MAX_PLANS) return null;
    if (!isObj(payload.kukkiwon)) return null;
    const common = readCommon(payload, 'add', onDay);
    if (!common) return null;
    const plans = [];
    const names = new Set();
    for (const v of payload.plans) {
      if (!isObj(v) || !onlyKeys(v, ['name', 'payments', 'amounts']) || !nameOk(v.name)) return null;
      const key = nameKey(v.name);
      if (names.has(key)) return null;
      names.add(key);
      if (!Array.isArray(v.payments) || v.payments.length < 1 || v.payments.length > MAX_PAYMENTS) return null;
      if (!isObj(v.amounts) || Object.keys(v.amounts).length !== 4 || !onlyKeys(v.amounts, ['1', '2', '3', '4'])) return null;
      const payments = [];
      for (const [i, p] of v.payments.entries()) {
        if (!isObj(p) || !onlyKeys(p, ['due_on', 'follows_application_due'])) return null;
        if (typeof p.due_on !== 'string' || !isIsoDate(p.due_on) || typeof p.follows_application_due !== 'boolean') return null;
        if (p.due_on < onDay) return null;
        if (p.follows_application_due && (i !== 0 || p.due_on !== common.app)) return null;
        payments.push({ dueOn: p.due_on, follows: p.follows_application_due });
      }
      const amounts = {};
      for (const dan of ['1', '2', '3', '4']) {
        const list = v.amounts[dan];
        if (!Array.isArray(list) || list.length !== payments.length || !list.every(priceOk)) return null;
        amounts[dan] = list.map((x) => Math.round(x));
      }
      plans.push({ name: normalizeName(v.name), payments, amounts });
    }
    const k = payload.kukkiwon;
    if (Object.keys(k).length !== 4 || !onlyKeys(k, ['1', '2', '3', '4']) || !Object.values(k).every(priceOk)) return null;
    const fees = Object.fromEntries(['1', '2', '3', '4'].map((dan) => [dan, Math.round(k[dan])]));
    const pricesFrom = typeof payload.prices_from === 'string' ? normalizeName(payload.prices_from) : null;
    return { ...common, plans, fees, pricesFrom };
  }

  function readUpdatePayload(payload, onDay) {
    if (!isObj(payload) || !onlyKeys(payload, ['name', 'application_due', 'submissions_due', 'auto_close', 'days', 'due_dates'])) return null;
    if (!Array.isArray(payload.due_dates)) return null;
    const common = readCommon(payload, 'update', onDay);
    if (!common) return null;
    const dueDates = [];
    for (const x of payload.due_dates) {
      if (!isObj(x) || !onlyKeys(x, ['cycle_plan_id', 'payment_no', 'due_on', 'follows_application_due'])) return null;
      if (typeof x.cycle_plan_id !== 'string' || !UUID_PATTERN.test(x.cycle_plan_id)) return null;
      if (typeof x.payment_no !== 'number' || !Number.isInteger(x.payment_no) || Math.abs(x.payment_no) > 32767) return null;
      if (typeof x.due_on !== 'string' || !isIsoDate(x.due_on) || typeof x.follows_application_due !== 'boolean') return null;
      dueDates.push({ planId: x.cycle_plan_id.toLowerCase(), paymentNo: x.payment_no, dueOn: x.due_on, follows: x.follows_application_due });
    }
    return { ...common, dueDates };
  }

  // The parts graded on no day, in the order physical, technical, curriculum.
  const missingParts = (days) => PARTS.filter((p) => !days.some((d) => d.parts.includes(p)));
  const nameTaken = (db, name, exceptId = null) => db.bb_cycles.some((c) => c.id !== exceptId && nameKey(c.name) === nameKey(name));

  // Writes a cycle with its days, parts, plans, amounts, due dates and fees (bb_add_cycle's
  // step 8; also used to build the sample). spec = readAddPayload's result + codes, requirements.
  function writeCycle(db, spec, actor, at = stamp()) {
    const cycle = {
      id: newId(), name: spec.name, application_due: spec.app, submissions_due: spec.sub, auto_close: spec.auto,
      registration_open: false, first_opened_at: null, public_code_worcester: spec.codeW, public_code_shrewsbury: spec.codeS,
      requirements: clone(spec.requirements), prices_from: spec.pricesFrom ?? null, ...house(actor, at),
    };
    db.bb_cycles.push(cycle);
    for (const d of spec.days) insertDay(db, cycle.id, d, actor, at);
    spec.plans.forEach((p, position) => {
      const plan = { id: newId(), cycle_id: cycle.id, name: p.name, payments_count: p.payments.length, position, created_at: at, created_by_name: actor };
      db.bb_cycle_plans.push(plan);
      p.payments.forEach((pay, i) => {
        db.bb_cycle_plan_payments.push({
          id: newId(), cycle_plan_id: plan.id, payment_no: i + 1, due_on: pay.dueOn, follows_application_due: pay.follows, ...house(actor, at),
        });
      });
      for (const dan of [1, 2, 3, 4]) {
        p.amounts[String(dan)].forEach((cents, i) => {
          db.bb_cycle_plan_amounts.push({ id: newId(), cycle_plan_id: plan.id, dan, payment_no: i + 1, amount_cents: cents });
        });
      }
    });
    for (const dan of [1, 2, 3, 4]) {
      db.bb_cycle_kukkiwon_fees.push({ id: newId(), cycle_id: cycle.id, dan, amount_cents: spec.fees[String(dan)] });
    }
    return cycle;
  }

  function insertDay(db, cycleId, d, actor, at = stamp()) {
    const row = {
      id: newId(), cycle_id: cycleId, name: d.name, day_date: d.date, start_time: d.start, end_time: d.end,
      place_code: d.place.code, place_other: d.place.other,
      second_start: d.second?.start ?? null, second_end: d.second?.end ?? null,
      second_place_code: d.second?.place.code ?? null, second_place_other: d.second?.place.other ?? null, ...house(actor, at),
    };
    db.bb_cycle_days.push(row);
    for (const part of d.parts) db.bb_cycle_day_parts.push({ id: newId(), day_id: row.id, part, created_at: at, created_by: null, created_by_name: actor });
    return row;
  }

  // Removes a cycle and everything under it (the "on delete cascade" of 0016).
  function cascadeDeleteCycle(db, cycleId) {
    const dayIds = new Set(db.bb_cycle_days.filter((d) => d.cycle_id === cycleId).map((d) => d.id));
    const planIds = new Set(db.bb_cycle_plans.filter((p) => p.cycle_id === cycleId).map((p) => p.id));
    const candIds = new Set(db.bb_candidates.filter((c) => c.cycle_id === cycleId).map((c) => c.id));
    db.bb_cycle_day_parts = db.bb_cycle_day_parts.filter((x) => !dayIds.has(x.day_id));
    db.bb_cycle_days = db.bb_cycle_days.filter((d) => d.cycle_id !== cycleId);
    db.bb_cycle_plan_amounts = db.bb_cycle_plan_amounts.filter((a) => !planIds.has(a.cycle_plan_id));
    db.bb_cycle_plan_payments = db.bb_cycle_plan_payments.filter((p) => !planIds.has(p.cycle_plan_id));
    db.bb_cycle_plans = db.bb_cycle_plans.filter((p) => p.cycle_id !== cycleId);
    db.bb_cycle_kukkiwon_fees = db.bb_cycle_kukkiwon_fees.filter((f) => f.cycle_id !== cycleId);
    db.bb_candidate_waivers = db.bb_candidate_waivers.filter((w) => !candIds.has(w.candidate_id));
    for (const c of db.bb_candidates) if (c.duplicate_of && candIds.has(c.duplicate_of)) c.duplicate_of = null; // "set null"
    db.bb_candidates = db.bb_candidates.filter((c) => c.cycle_id !== cycleId);
    db.bb_cycles = db.bb_cycles.filter((c) => c.id !== cycleId);
  }

  // ----- The staff functions (contract 0016 §6–§7). Each gets a private copy of the store and
  // returns { answer, save } — save = true when the copy should be kept. They run AFTER the
  // generic steps 1–2 in rpc() (has_data_access, then the admin-only role). -----

  const handlers = {
    // 16b. The Cycles page: every cycle with its state; then the purge.
    bb_cycles_list(db) {
      const onDay = today();
      const rows = db.bb_cycles.map((c) => {
        const s = stateOf(db, c, onDay);
        const candidates = candidatesOf(db, c.id);
        const candIds = new Set(candidates.map((x) => x.id));
        return {
          id: c.id, name: c.name, state: s, first_day: s.first_day, last_day: s.last_day, next_day: s.next_day,
          day_count: daysOf(db, c.id).length, application_due: c.application_due, registration_open: c.registration_open,
          auto_close: c.auto_close, candidate_count: candidates.filter((x) => x.status === 'active').length,
          has_payments: db.bb_payments.some((p) => p.cycle_id === c.id),
          has_form_waivers: db.bb_candidate_waivers.some((w) => candIds.has(w.candidate_id) && w.how === 'drawn'),
          version: c.version,
        };
      });
      // newest first testing day first (no days last), then id
      rows.sort((a, b) => {
        if (a.first_day !== b.first_day) {
          if (a.first_day === null) return 1;
          if (b.first_day === null) return -1;
          return a.first_day < b.first_day ? 1 : -1;
        }
        return byId(a, b);
      });
      const purged = purge(db);
      return { answer: { status: 'ok', today: onDay, cycles: rows }, save: purged > 0 };
    },

    // 16a. What Add cycle is filled in from: the most recently created cycle, or the starting point.
    bb_cycle_defaults(db) {
      const latest = [...db.bb_cycles].sort((a, b) => cmp(b.created_at, a.created_at) || -byId(a, b))[0] ?? null;
      if (!latest) {
        const sp = db.bb_starting_point[0];
        if (!sp) return { answer: st('not_found') };
        return { answer: { status: 'ok', source_cycle_id: null, payload: { ...clone(sp.schedule), prices_from: STARTING_POINT_NAME } } };
      }
      const place = (code, other) => (code !== null ? { code } : { other });
      const payload = {
        application_due: latest.application_due,
        submissions_due: latest.submissions_due,
        auto_close: latest.auto_close,
        days: daysOf(db, latest.id).map((d) => ({
          name: d.name, day_date: d.day_date, start_time: short(d.start_time), end_time: short(d.end_time),
          place: place(d.place_code, d.place_other),
          second: d.second_start === null ? null : { start: short(d.second_start), end: short(d.second_end), place: place(d.second_place_code, d.second_place_other) },
          parts: partsOf(db, d.id),
        })),
        plans: plansOf(db, latest.id).map((p) => ({
          name: p.name,
          payments: planPaymentsOf(db, p.id).map((x) => ({ due_on: x.due_on, follows_application_due: x.follows_application_due })),
          amounts: amountsOf(db, p.id),
        })),
        kukkiwon: feesOf(db, latest.id),
        prices_from: latest.name,
      };
      return { answer: { status: 'ok', source_cycle_id: latest.id, payload } };
    },

    // 15c. Add cycle (A). Starts Closed with two new link codes; then the purge.
    bb_add_cycle(db, a, ctx) {
      const onDay = today();
      const spec = readAddPayload(a.p_payload, onDay);
      if (!spec) return { answer: st('invalid') };
      let requirements;
      if (a.p_source_cycle_id !== null) {
        const source = findCycle(db, a.p_source_cycle_id);
        if (!source) return { answer: st('invalid') };
        requirements = source.requirements;
      } else {
        requirements = db.bb_starting_point[0]?.requirements;
        if (!requirements) return { answer: st('invalid') };
      }
      const missing = missingParts(spec.days);
      if (missing.length > 0) return { answer: { status: 'part_without_day', parts: missing } };
      if (nameTaken(db, spec.name)) return { answer: st('duplicate_name') };
      const codeW = newCode(db);
      const codeS = newCode(db, [codeW]);
      const cycle = writeCycle(db, { ...spec, codeW, codeS, requirements }, ctx.actorName);
      purge(db);
      return {
        answer: { status: 'ok', id: cycle.id, version: 1, public_code_worcester: codeW, public_code_shrewsbury: codeS },
        save: true,
      };
    },

    // 15d. Edit cycle (A). Prices never change; due dates may.
    bb_update_cycle(db, a, ctx) {
      const onDay = today();
      if (a.p_cycle_id === null || a.p_expected_version === null) return { answer: st('invalid') };
      const spec = readUpdatePayload(a.p_payload, onDay);
      if (!spec) return { answer: st('invalid') };
      const cycle = findCycle(db, a.p_cycle_id);
      if (!cycle) return { answer: st('not_found') };
      if (cycle.version !== a.p_expected_version) return { answer: st('stale') };
      const saved = daysOf(db, cycle.id);
      const savedById = new Map(saved.map((d) => [d.id, d]));
      // every day id given is a day of THIS cycle
      if (spec.days.some((d) => d.id && !savedById.has(d.id))) return { answer: st('invalid') };
      // a changed (or new) day date can't be in the past
      if (spec.days.some((d) => d.date !== (d.id ? savedById.get(d.id).day_date : null) && d.date < onDay)) return { answer: st('invalid') };
      // due_dates names every (plan, payment) of this cycle exactly once
      const planIds = new Set(plansOf(db, cycle.id).map((p) => p.id));
      const rows = db.bb_cycle_plan_payments.filter((p) => planIds.has(p.cycle_plan_id));
      const pairs = new Set(spec.dueDates.map((x) => `${x.planId}|${x.paymentNo}`));
      const rowOf = (x) => rows.find((r) => r.cycle_plan_id === x.planId && r.payment_no === x.paymentNo) ?? null;
      if (spec.dueDates.length !== rows.length || pairs.size !== spec.dueDates.length || spec.dueDates.some((x) => !rowOf(x))) {
        return { answer: st('invalid') };
      }
      // "follows" only on payment 1; a changed due date can't be in the past
      const effective = (x) => (x.follows ? spec.app : x.dueOn);
      if (spec.dueDates.some((x) => (x.follows && x.paymentNo !== 1) || (effective(x) !== rowOf(x).due_on && effective(x) < onDay))) {
        return { answer: st('invalid') };
      }
      const missing = missingParts(spec.days);
      if (missing.length > 0) return { answer: { status: 'part_without_day', parts: missing } };
      if (nameTaken(db, spec.name, cycle.id)) return { answer: st('duplicate_name') };

      const actor = ctx.actorName;
      const cycleChanged = updateRow(cycle, { name: spec.name, application_due: spec.app, submissions_due: spec.sub, auto_close: spec.auto }, actor);
      let changed = false;
      // days no longer in the list go, with their parts
      const keep = new Set(spec.days.filter((d) => d.id).map((d) => d.id));
      const gone = saved.filter((d) => !keep.has(d.id)).map((d) => d.id);
      if (gone.length > 0) {
        changed = true;
        db.bb_cycle_day_parts = db.bb_cycle_day_parts.filter((x) => !gone.includes(x.day_id));
        db.bb_cycle_days = db.bb_cycle_days.filter((d) => !gone.includes(d.id));
      }
      for (const d of spec.days) {
        if (d.id) {
          const row = db.bb_cycle_days.find((x) => x.id === d.id);
          if (updateRow(row, {
            name: d.name, day_date: d.date, start_time: d.start, end_time: d.end, place_code: d.place.code, place_other: d.place.other,
            second_start: d.second?.start ?? null, second_end: d.second?.end ?? null,
            second_place_code: d.second?.place.code ?? null, second_place_other: d.second?.place.other ?? null,
          }, actor)) changed = true;
          // the parts, by difference
          const before = db.bb_cycle_day_parts.length;
          db.bb_cycle_day_parts = db.bb_cycle_day_parts.filter((x) => x.day_id !== d.id || d.parts.includes(x.part));
          if (db.bb_cycle_day_parts.length !== before) changed = true;
          for (const part of d.parts) {
            if (!db.bb_cycle_day_parts.some((x) => x.day_id === d.id && x.part === part)) {
              db.bb_cycle_day_parts.push({ id: newId(), day_id: d.id, part, created_at: stamp(), created_by: null, created_by_name: actor });
              changed = true;
            }
          }
        } else {
          insertDay(db, cycle.id, d, actor);
          changed = true;
        }
      }
      // the due dates ("follows" keeps payment 1 on Application due)
      for (const x of spec.dueDates) {
        const row = db.bb_cycle_plan_payments.find((r) => r.cycle_plan_id === x.planId && r.payment_no === x.paymentNo);
        if (updateRow(row, { due_on: effective(x), follows_application_due: x.follows }, actor)) changed = true;
      }
      // one version bump for the whole save
      if (changed && !cycleChanged) updateRow(cycle, {}, actor, true);
      return { answer: { status: 'ok', version: cycle.version }, save: true };
    },

    // 15e. The Open / Closed switch (S; opening after Application due with auto close on: A).
    bb_set_registration(db, a, ctx) {
      if (a.p_cycle_id === null || a.p_expected_version === null || a.p_open === null) return { answer: st('invalid') };
      const cycle = findCycle(db, a.p_cycle_id);
      if (!cycle) return { answer: st('not_found') };
      if (cycle.version !== a.p_expected_version) return { answer: st('stale') };
      const onDay = today();
      if (stateOf(db, cycle, onDay).past) return { answer: st('finished') };
      if (a.p_open && currentWaiver(db)?.is_placeholder) return { answer: st('waiver_needed') };
      let clear = false;
      if (a.p_open && cycle.auto_close && onDay > cycle.application_due) {
        if (!ctx.isAdmin) return { answer: st('not_allowed') };
        clear = true;
      }
      if (cycle.registration_open !== a.p_open || clear) {
        updateRow(cycle, {
          registration_open: a.p_open,
          first_opened_at: a.p_open ? cycle.first_opened_at ?? stamp() : cycle.first_opened_at,
          auto_close: clear ? false : cycle.auto_close,
        }, ctx.actorName);
      }
      return { answer: { status: 'ok', version: cycle.version, state: stateOf(db, cycle, onDay) }, save: true };
    },

    // 15f. Delete cycle (A): refused with any payment row or any form-signed waiver.
    bb_delete_cycle(db, a) {
      if (a.p_cycle_id === null || a.p_expected_version === null || a.p_expected_candidate_count === null) return { answer: st('invalid') };
      const cycle = findCycle(db, a.p_cycle_id);
      if (!cycle) return { answer: st('not_found') };
      if (cycle.version !== a.p_expected_version) return { answer: st('stale') };
      const candidates = candidatesOf(db, cycle.id);
      if (candidates.length !== a.p_expected_candidate_count) return { answer: st('stale') };
      if (db.bb_payments.some((p) => p.cycle_id === cycle.id)) return { answer: st('has_payments') };
      const ids = new Set(candidates.map((c) => c.id));
      if (db.bb_candidate_waivers.some((w) => ids.has(w.candidate_id) && w.how === 'drawn')) return { answer: st('has_waivers') };
      cascadeDeleteCycle(db, cycle.id);
      return { answer: st('ok'), save: true };
    },

    // 15a. Save the waiver text (A): always a new version; the same text writes nothing.
    bb_save_waiver(db, a, ctx) {
      const body = typeof a.p_body === 'string' ? trimSpaces(a.p_body) : null;
      if (a.p_expected_current_id === null || body === null || charCount(body) < 1 || charCount(body) > WAIVER_BODY_MAX) return { answer: st('invalid') };
      const current = currentWaiver(db);
      if (!current) return { answer: st('not_found') };
      if (current.id !== a.p_expected_current_id) return { answer: st('stale') };
      if (trimSpaces(current.body) === body) return { answer: { status: 'ok', id: current.id, version_name: current.version_name } };
      const year = today().slice(0, 4);
      const name = `${year}-${db.bb_waiver_versions.filter((v) => v.version_name.startsWith(`${year}-`)).length + 1}`;
      const at = stamp();
      current.superseded_at = at;
      const row = { id: newId(), version_name: name, body, is_placeholder: false, superseded_at: null, created_at: at, created_by: null, created_by_name: ctx.actorName };
      db.bb_waiver_versions.push(row);
      return { answer: { status: 'ok', id: row.id, version_name: name }, save: true };
    },

    // 15b. The two keep-years numbers (A), in two steps: confirm_needed, then save + purge.
    bb_set_keep_years(db, a, ctx) {
      const n1 = a.p_after_last_day;
      const n2 = a.p_after_18;
      const inRange = (v) => v === null || (v >= KEEP_YEARS_MIN && v <= KEEP_YEARS_MAX);
      if (a.p_expected_version === null || (n1 === null) !== (n2 === null) || !inRange(n1) || !inRange(n2)
        || (a.p_confirm_count !== null && a.p_confirm_count < 0)) return { answer: st('invalid') };
      const s = settings(db);
      if (!s) return { answer: st('not_found') };
      if (s.version !== a.p_expected_version) return { answer: st('stale') };
      const onDay = today();
      let count = 0;
      if (n1 !== null) {
        for (const c of db.bb_candidates) {
          if (c.personal_removed_at !== null) continue;
          const days = daysOf(db, c.cycle_id);
          const due = purgeDueOn({ dateOfBirth: c.date_of_birth, lastDay: days.length ? days[days.length - 1].day_date : null, afterLastDay: n1, after18: n2 });
          if (due !== null && due <= onDay) count += 1;
        }
      }
      if (a.p_confirm_count === null) return { answer: { status: 'confirm_needed', remove_count: count } };
      if (a.p_confirm_count !== count) return { answer: st('stale') };
      updateRow(s, { keep_years_after_last_day: n1, keep_years_after_18: n2 }, ctx.actorName);
      const removed = purge(db);
      return { answer: { status: 'ok', version: s.version, removed_count: removed }, save: true };
    },
  };

  // ----- The public path (SQL 17a–17c; the stand-in publicApi.preview.js calls these) -----

  function cycleByCode(db, code) {
    if (typeof code !== 'string' || !CODE_PATTERN.test(code)) return null;
    const matches = db.bb_cycles.filter((c) => c.public_code_worcester === code || c.public_code_shrewsbury === code);
    return matches.length === 1 ? matches[0] : null;
  }

  const placeAnswer = (code, other) => (code !== null
    ? { name: location(code)?.name ?? code, address: addressOf(code) }
    : { name: other, address: null });

  // 17a. bb_public_cycle(code) → what the family page shows first.
  function publicCycle(code) {
    const db = read();
    const cycle = cycleByCode(db, code);
    if (!cycle) return st('not_found');
    const school = cycle.public_code_worcester === code ? 'worcester' : 'shrewsbury';
    const s = stateOf(db, cycle);
    const waiver = currentWaiver(db);
    return {
      status: 'ok',
      state: s.public_status,
      closed_on: s.closed_on,
      school: { code: school, name: location(school)?.name ?? school, address: addressOf(school) },
      cycle: {
        name: cycle.name,
        application_due: cycle.application_due,
        submissions_due: cycle.submissions_due,
        days: daysOf(db, cycle.id).map((d) => ({
          name: d.name, day_date: d.day_date, start_time: short(d.start_time), end_time: short(d.end_time),
          place: placeAnswer(d.place_code, d.place_other),
          second: d.second_start === null ? null : {
            start_time: short(d.second_start), end_time: short(d.second_end), place: placeAnswer(d.second_place_code, d.second_place_other),
          },
          parts: partsOf(db, d.id),
        })),
        plans: plansOf(db, cycle.id).map((p) => ({
          id: p.id, name: p.name, position: p.position,
          payments: planPaymentsOf(db, p.id).map((x) => ({ payment_no: x.payment_no, due_on: x.due_on })),
          amounts: amountsOf(db, p.id),
        })),
        kukkiwon: feesOf(db, cycle.id),
        requirements: clone(cycle.requirements),
      },
      waiver: waiver ? { version_name: waiver.version_name, body: waiver.body } : null,
    };
  }

  // 10c. What a candidate owes, item by item (the S4 floor: a passed date counts from the day
  // they registered; Kukkiwon is due with payment 1, or the day it was chosen if later).
  function candidateItems(db, c) {
    const registeredOn = schoolDateOf(c.registered_at);
    const amounts = amountsOf(db, c.cycle_plan_id)[String(c.dan)] ?? [];
    const items = planPaymentsOf(db, c.cycle_plan_id).map((pp) => ({
      item: `p${pp.payment_no}`, due_on: pp.due_on > registeredOn ? pp.due_on : registeredOn,
      amount_cents: amounts[pp.payment_no - 1], tie: pp.payment_no * 10,
    }));
    if (c.kukkiwon) {
      const p1 = items.find((x) => x.item === 'p1')?.due_on ?? null;
      const added = c.kukkiwon_added_on;
      const fee = db.bb_cycle_kukkiwon_fees.find((f) => f.cycle_id === c.cycle_id && f.dan === c.dan);
      if (fee) items.push({ item: 'kukkiwon', due_on: p1 === null || added > p1 ? added : p1, amount_cents: fee.amount_cents, tie: 15 });
    }
    return items.sort((x, y) => cmp(x.due_on, y.due_on) || x.tie - y.tie);
  }

  // 13g. The "You're registered" answer: only what that family sent plus the cycle facts. Never
  // the date of birth, the email, the signer's name or the signature.
  function publicAnswer(db, c) {
    const items = candidateItems(db, c);
    return {
      status: 'ok',
      reference: c.reference,
      first_name: c.first_name,
      last_name: c.last_name,
      dan: c.dan,
      kukkiwon: c.kukkiwon,
      plan_name: db.bb_cycle_plans.find((p) => p.id === c.cycle_plan_id)?.name ?? null,
      items: items.map((x) => ({ item: x.item, due_on: x.due_on, amount_cents: x.amount_cents })),
      total_cents: items.reduce((sum, x) => sum + x.amount_cents, 0),
      cycle_name: findCycle(db, c.cycle_id)?.name ?? null,
      school: { code: c.location_code, name: location(c.location_code)?.name ?? c.location_code },
    };
  }

  // 13c / 13d. Another ACTIVE candidate in the same cycle with the same names and date of birth.
  function findDuplicate(db, cycleId, excludeId, first, last, dob) {
    if (!dob) return null;
    const matches = db.bb_candidates.filter((m) => m.cycle_id === cycleId && m.status === 'active' && m.id !== excludeId
      && nameKey(m.first_name) === nameKey(first) && nameKey(m.last_name) === nameKey(last) && m.date_of_birth === dob
      && !(excludeId && m.duplicate_state === 'kept_both' && m.duplicate_of === excludeId));
    matches.sort((a, b) => cmp(a.registered_at, b.registered_at) || byId(a, b));
    return matches[0]?.id ?? null;
  }
  function recheckDuplicate(db, id) {
    const c = db.bb_candidates.find((x) => x.id === id);
    if (!c) return;
    let state = 'none';
    let of = null;
    if (c.status === 'active') {
      if (c.duplicate_state === 'kept_both' && c.duplicate_of) {
        const m = db.bb_candidates.find((x) => x.id === c.duplicate_of);
        if (m && m.status === 'active' && m.cycle_id === c.cycle_id && nameKey(m.first_name) === nameKey(c.first_name)
          && nameKey(m.last_name) === nameKey(c.last_name) && m.date_of_birth === c.date_of_birth) return; // both real
      }
      of = findDuplicate(db, c.cycle_id, c.id, c.first_name, c.last_name, c.date_of_birth);
      state = of ? 'possible' : 'none';
    }
    if (c.duplicate_state !== state || c.duplicate_of !== of) {
      // A real change, so the before-write trigger bumps the version (like any other update).
      c.duplicate_state = state;
      c.duplicate_of = of;
      c.version += 1;
      c.updated_at = stamp();
    }
  }

  // 17b. The core of the family form's Send, in Star's exact order (contract 0016 §8.3).
  // input: { code, clientKey, submissionId, first, last, dateOfBirth, email, dan, cyclePlanId,
  //          kukkiwon, acknowledged, waiverVersion, signerName, signature } (already the right
  //          JavaScript types — the stand-in checks the field types first, like the Function).
  function registerCore(db, input, { forceRateLimited }) {
    // 1. the cycle by its code
    const cycle = cycleByCode(db, input.code);
    if (!cycle) return { answer: st('not_found'), cycleId: null };
    const school = cycle.public_code_worcester === input.code ? 'worcester' : 'shrewsbury';
    const cycleId = cycle.id;
    // 2 (and 4, under the lock — one tab, so once is the same). Already registered?
    const submissionId = typeof input.submissionId === 'string' ? input.submissionId.toLowerCase() : null;
    if (submissionId) {
      const w = db.bb_candidate_waivers.find((x) => x.submission_id === submissionId);
      if (w) {
        const c = db.bb_candidates.find((x) => x.id === w.candidate_id);
        if (c.cycle_id !== cycleId) return { answer: st('invalid'), cycleId };
        return { answer: publicAnswer(db, c), cycleId };
      }
    }
    // 5. open right now?
    const onDay = today();
    const s = stateOf(db, cycle, onDay);
    if (s.public_status === 'finished') return { answer: st('finished'), cycleId };
    if (s.public_status === 'not_open') return { answer: st('not_open'), cycleId };
    if (s.public_status === 'closed') return { answer: { status: 'closed', closed_on: s.closed_on }, cycleId };
    // 6. the input
    const email = typeof input.email === 'string' ? trimSpaces(input.email) : null;
    const ck = input.clientKey;
    const plan = db.bb_cycle_plans.find((p) => p.id === (typeof input.cyclePlanId === 'string' ? input.cyclePlanId.toLowerCase() : null));
    if (typeof ck !== 'string' || charCount(ck) < 1 || charCount(ck) > 200
      || !submissionId || !UUID_PATTERN.test(submissionId)
      || !nameOk(input.first) || !nameOk(input.last)
      || typeof input.dateOfBirth !== 'string' || !isIsoDate(input.dateOfBirth) || input.dateOfBirth > onDay || input.dateOfBirth < '1900-01-01'
      || !emailIsValid(email)
      || !Number.isInteger(input.dan) || input.dan < 1 || input.dan > 4
      || !plan || plan.cycle_id !== cycleId
      || typeof input.kukkiwon !== 'boolean'
      || input.acknowledged !== true
      || !nameOk(input.signerName)
      || !signatureIsValid(input.signature)
      || typeof input.waiverVersion !== 'string' || !/^[0-9]{4}-[1-9][0-9]*$/.test(input.waiverVersion)) {
      return { answer: st('invalid'), cycleId };
    }
    const version = db.bb_waiver_versions.find((v) => v.version_name === input.waiverVersion);
    if (!version) return { answer: st('invalid'), cycleId };
    // 7. the waiver version they read (not the placeholder; current or replaced < 24 h ago)
    if (!waiverVersionOk(version, clock())) return { answer: st('waiver_changed'), cycleId };
    // 8. rate limit: 20 or more tries from this client key in the last hour
    const since = clock() - HOUR_MS;
    const tries = db.public_attempts.filter((x) => x.client_key === ck && Date.parse(x.at) > since).length;
    if (forceRateLimited || tries >= RATE_LIMIT_PER_HOUR) return { answer: st('rate_limited'), cycleId };
    // 9. write, by "Family form"
    const dup = findDuplicate(db, cycleId, null, input.first, input.last, input.dateOfBirth);
    const at = stamp();
    const candidate = {
      id: newId(), cycle_id: cycleId, first_name: normalizeName(input.first), last_name: normalizeName(input.last),
      date_of_birth: input.dateOfBirth, email_for_results: email, personal_removed_at: null, location_code: school,
      dan: input.dan, cycle_plan_id: plan.id, kukkiwon: input.kukkiwon, kukkiwon_added_on: input.kukkiwon ? onDay : null,
      source: 'form', reference: `BB-${db.ref_counter}`, registered_at: at, status: 'active', withdrawn_reason: null,
      withdrawn_at: null, withdrawn_by_name: null, withdrawn_by: null, duplicate_state: dup ? 'possible' : 'none', duplicate_of: dup,
      ...house(FORM_ACTOR, at),
    };
    db.ref_counter += 1;
    db.bb_candidates.push(candidate);
    const age = ageOn(input.dateOfBirth, s.first_day);
    db.bb_candidate_waivers.push({
      id: newId(), candidate_id: candidate.id, waiver_version_id: version.id, how: 'drawn', submission_id: submissionId,
      acknowledged: true, signed_as_minor: age !== null && age < 18, signer_name: normalizeName(input.signerName),
      signature: input.signature, ticked_by_name: null, signed_at: at, removed_at: null, ...house(FORM_ACTOR, at),
    });
    if (dup) recheckDuplicate(db, dup); // both rows show the pair (accepted silently)
    return { answer: publicAnswer(db, candidate), cycleId };
  }

  // 17c. The wrapper: removes rate-limit rows older than 2 days, runs the core, THEN writes this
  // call's attempts row ('bb:<status>') — whatever the answer, so every call counts. No purge.
  function publicRegister(input = {}, { forceRateLimited = false } = {}) {
    const db = read();
    const cutoff = clock() - ATTEMPT_KEEP_MS;
    db.public_attempts = db.public_attempts.filter((x) => Date.parse(x.at) >= cutoff);
    const work = clone(db); // the core's own changes are kept only if it finished
    const { answer, cycleId } = registerCore(work, input, { forceRateLimited });
    const keep = answer.status === 'ok' ? work : db;
    keep.public_attempts.push({
      id: newId(), client_key: typeof input.clientKey === 'string' ? input.clientKey.slice(0, 200) : '',
      event_id: cycleId ?? null, outcome: `bb:${answer.status ?? 'invalid'}`, at: stamp(),
    });
    write(keep);
    return answer;
  }

  // ----- Answers in the Supabase client's shape -----

  const ok = (data) => ({ data, error: null, count: null, status: 200, statusText: 'OK' });
  const fail = (code, message, status = 403) => ({
    data: null, error: { code, message, details: null, hint: null }, count: null, status,
    statusText: status === 404 ? 'Not Found' : status === 403 ? 'Forbidden' : status === 405 ? 'Method Not Allowed' : 'Bad Request',
  });
  const denied = (what) => fail('42501', `permission denied for ${what}`, 403);

  // supabase.from(table).select(columns).eq(…).in(…).gte(…).order(…)
  function select(table, columns, filters = [], orders = [], ctx = {}) {
    if (!(table in GRANTED)) return fail('PGRST205', `Could not find the table 'public.${table}' in the schema cache`, 404);
    if (!ctx.signedIn) return denied(`table ${table}`);
    const existing = [...GRANTED[table], ...HIDDEN[table]];
    const wanted = String(columns ?? '*').split(',').map((col) => col.trim()).filter(Boolean);
    if (wanted.length === 0) wanted.push('*');
    const used = [...wanted, ...filters.map((f) => f.col), ...orders.map((o) => o.col)];
    for (const col of used) {
      if (col === '*' || HIDDEN[table].includes(col)) return denied(`table ${table}`);
      if (!existing.includes(col)) return fail('42703', `column ${table}.${col} does not exist`, 400);
    }
    if (!ctx.hasDataAccess) return ok([]); // row-level security hides every row
    let rows = read()[table];
    // Filters compare as text, like the real API (the filter travels in the web address).
    rows = rows.filter((row) => filters.every((f) => {
      const v = row[f.col];
      if (f.op === 'in') return (f.value ?? []).map(String).includes(String(v));
      if (f.op === 'gte') return v !== null && String(v) >= String(f.value);
      if (f.op === 'lte') return v !== null && String(v) <= String(f.value);
      return String(v) === String(f.value);
    }));
    rows = [...rows].sort((x, y) => {
      for (const { col, ascending = true } of orders) {
        if (x[col] === y[col]) continue;
        const less = x[col] === null ? false : y[col] === null ? true : x[col] < y[col]; // nulls last
        return (less ? -1 : 1) * (ascending ? 1 : -1);
      }
      return 0;
    });
    return ok(rows.map((row) => Object.fromEntries(wanted.map((col) => [col, row[col] === undefined ? null : clone(row[col])]))));
  }

  // supabase.rpc(name, args, options) for the staff functions.
  function rpc(name, args = {}, ctx = {}, options = {}) {
    if (RESTRICTED.includes(name)) return denied(`function ${name}`); // only bb_registrar (or nobody)
    if (!(name in handlers)) return fail('PGRST202', `Could not find the function public.${name} in the schema cache`, 404);
    if (failNext && BB_WRITE_RPC_NAMES.includes(name)) {
      failNext = false; // pretend the connection dropped: nothing changes (failNextSave helper)
      return { data: null, error: { message: 'Failed to fetch (preview: failNextSave)' }, count: null, status: 0, statusText: '' };
    }
    if (!ctx.signedIn) return denied(`function ${name}`);
    if (options?.get === true && VOLATILE.has(name)) {
      // A read-only GET can't run a function that writes (the purge, or a save).
      return fail('25006', `cannot execute UPDATE in a read-only transaction`, 405);
    }
    let parsed;
    try {
      parsed = readArgs(name, args);
    } catch (error) {
      if (error instanceof DbError) return fail(error.code, error.message, error.httpStatus);
      throw error;
    }
    // 1. has_data_access FIRST, then 2. the role (§1.1). Nothing is looked up before these.
    if (!ctx.hasDataAccess) return ok(st('no_access'));
    if (ADMIN_ONLY.has(name) && !ctx.isAdmin) return ok(st('not_allowed'));
    const db = read(); // a private copy = a transaction: kept only when the function says so
    const result = handlers[name](db, parsed, { actorName: ctx.actorName ?? SEED_ACTOR, userId: ctx.userId ?? null, isAdmin: Boolean(ctx.isAdmin) });
    if (result.save) write(db);
    return ok(result.answer);
  }

  // ----- Test and console helpers (mockClient.js, publicApi.preview.js, checks.mjs) -----

  function failNextSave() {
    failNext = true;
  }

  // "Another admin" changes every cycle and the settings, and saves a new waiver version: open
  // dialogs get 'stale'.
  function simulateOtherAdminEdit() {
    const db = read();
    const at = stamp();
    for (const row of [...db.bb_cycles, ...db.bb_settings]) {
      row.version += 1;
      row.updated_at = at;
      row.updated_by_name = 'Other Admin';
    }
    const current = currentWaiver(db);
    const year = today().slice(0, 4);
    current.superseded_at = at;
    db.bb_waiver_versions.push({
      id: newId(), version_name: `${year}-${db.bb_waiver_versions.filter((v) => v.version_name.startsWith(`${year}-`)).length + 1}`,
      body: `${current.body}\n\n(Changed by another admin in preview.)`, is_placeholder: false, superseded_at: null,
      created_at: at, created_by: null, created_by_name: 'Other Admin',
    });
    write(db);
  }

  // The current waiver is marked replaced 25 hours ago and a new version saved then, so the
  // family form's next Send (which still shows the old version) answers waiver_changed.
  function waiverChanged() {
    const db = read();
    const at = stamp(clock() - 25 * HOUR_MS);
    const current = currentWaiver(db);
    const year = today().slice(0, 4);
    current.superseded_at = at;
    const name = `${year}-${db.bb_waiver_versions.filter((v) => v.version_name.startsWith(`${year}-`)).length + 1}`;
    db.bb_waiver_versions.push({
      id: newId(), version_name: name, body: `${current.body}\n\n(Updated in preview.)`, is_placeholder: false, superseded_at: null,
      created_at: at, created_by: null, created_by_name: 'Jeffrey Berg',
    });
    write(db);
    return { from: current.version_name, to: name };
  }

  // Both links of every cycle: [{ name, worcester, shrewsbury }] (codes).
  function links() {
    return read().bb_cycles.map((c) => ({ name: c.name, worcester: c.public_code_worcester, shrewsbury: c.public_code_shrewsbury }));
  }

  // Back to 0016's seed: no cycles, the placeholder waiver, empty keep-years.
  function reset() {
    write(seedStore());
  }

  // The mockups' example (contract 0016-B1 §2.1), for walkthroughs and the design review's
  // screenshots — meant for "today" = Mon, Feb 15, 2027.
  function loadSample() {
    const db = seedStore();
    const t = (date, hhmm = '10:00') => new Date(`${date}T${hhmm}:00-05:00`).toISOString(); // Massachusetts winter time
    const jeffrey = 'Jeffrey Berg';
    // settings: keep 3 years / until 3 years after 18 (as the Rubric mockup shows)
    Object.assign(db.bb_settings[0], {
      keep_years_after_last_day: 3, keep_years_after_18: 3, version: 2, updated_at: t('2027-01-10', '10:05'), updated_by_name: jeffrey,
    });
    // the school's waiver, version 2027-1, replacing the placeholder
    db.bb_waiver_versions[0].superseded_at = t('2027-01-10');
    db.bb_waiver_versions.push({
      id: newId(), version_name: '2027-1', is_placeholder: false, superseded_at: null, created_at: t('2027-01-10'), created_by: null,
      created_by_name: jeffrey,
      body: 'Every subject must be passed; subjects not passed are made up at a later testing. Testing fees are non-refundable and are applied to the next testing if not passed. I understand Taekwondo testing involves physical activity and a risk of injury, and I release the school, its owners, instructors and staff from claims for injuries that happen during training or testing.\n\nBy signing below I agree to the above.',
    });
    const horgan = { code: null, other: 'Horgan Arena, 403 Oxford St N, Auburn MA 01501' };
    const worcester = { code: 'worcester', other: null };
    const shrewsbury = { code: 'shrewsbury', other: null };
    const plans = (d1, d2, d3) => [
      { name: 'In full', payments: [{ dueOn: d1, follows: true }], amounts: { 1: [87000], 2: [99000], 3: [150000], 4: [270000] } },
      { name: '3 payments', payments: [{ dueOn: d1, follows: true }, { dueOn: d2, follows: false }, { dueOn: d3, follows: false }],
        amounts: { 1: [29000, 29000, 29000], 2: [33000, 33000, 33000], 3: [50000, 50000, 50000], 4: [90000, 90000, 90000] } },
      { name: '2 payments', payments: [{ dueOn: d1, follows: true }, { dueOn: d3, follows: false }],
        amounts: { 1: [43500, 43500], 2: [49500, 49500], 3: [75000, 75000], 4: [135000, 135000] } },
    ];
    const fees = { 1: 10000, 2: 11000, 3: 14000, 4: 17000 };
    const days = (d1, d2, d3) => [
      { name: 'Physical', date: d1, start: '12:30:00', end: '14:30:00', place: worcester, second: { start: '14:30:00', end: '15:30:00', place: horgan }, parts: ['physical'] },
      { name: 'Technical', date: d2, start: '12:30:00', end: '15:30:00', place: shrewsbury, second: null, parts: ['technical'] },
      { name: 'Curriculum', date: d3, start: '14:00:00', end: '17:00:00', place: shrewsbury, second: null, parts: ['curriculum'] },
    ];
    const spring = writeCycle(db, {
      name: 'Spring 2027', app: '2027-03-27', sub: '2027-05-29', auto: true, days: days('2027-04-03', '2027-05-01', '2027-06-05'),
      plans: plans('2027-03-27', '2027-04-24', '2027-05-29'), fees, pricesFrom: STARTING_POINT_NAME,
      requirements: STARTING_POINT_REQUIREMENTS, codeW: newCode(db), codeS: null,
    }, jeffrey, t('2027-01-12'));
    spring.public_code_shrewsbury = newCode(db, [spring.public_code_worcester]);
    Object.assign(spring, { registration_open: true, first_opened_at: t('2027-02-01'), version: 2, updated_at: t('2027-02-01') });
    const fall = writeCycle(db, {
      name: 'Fall 2027', app: '2027-09-25', sub: '2027-11-13', auto: true, days: days('2027-10-02', '2027-10-30', '2027-11-20'),
      plans: plans('2027-09-25', '2027-10-23', '2027-11-13'), fees, pricesFrom: 'Spring 2027',
      requirements: STARTING_POINT_REQUIREMENTS, codeW: newCode(db), codeS: null,
    }, jeffrey, t('2027-02-10'));
    fall.public_code_shrewsbury = newCode(db, [fall.public_code_worcester]);
    // 6 form candidates of Spring 2027, each with a drawn waiver; Daniel is under 18 on Apr 3.
    const planId = (name) => db.bb_cycle_plans.find((p) => p.cycle_id === spring.id && p.name === name).id;
    const people = [
      ['Alex', 'Kim', '1990-06-12', 'alex.kim@example.com', 'shrewsbury', 1, '3 payments', true, 'Alex Kim', '2027-02-02'],
      ['Priya', 'Shah', '1985-11-03', 'priya.shah@example.com', 'worcester', 2, 'In full', false, 'Priya Shah', '2027-02-03'],
      ['Omar', 'Haddad', '1979-01-21', 'omar.haddad@example.com', 'worcester', 1, '3 payments', true, 'Omar Haddad', '2027-02-05'],
      ['Grace', 'Lee', '1992-08-30', 'grace.lee@example.com', 'shrewsbury', 3, '2 payments', false, 'Grace Lee', '2027-02-08'],
      ['Daniel', 'Ortiz', '2012-03-04', 'ortiz.family@example.com', 'shrewsbury', 1, 'In full', false, 'Maria Ortiz', '2027-02-10'],
      ['Hannah', 'Brooks', '1970-04-17', 'hannah.brooks@example.com', 'worcester', 4, 'In full', true, 'Hannah Brooks', '2027-02-12'],
    ];
    const waiverId = db.bb_waiver_versions.find((v) => v.version_name === '2027-1').id;
    for (const [first, last, dob, email, school, dan, plan, kukkiwon, signer, on] of people) {
      const at = t(on, '19:15');
      const c = {
        id: newId(), cycle_id: spring.id, first_name: first, last_name: last, date_of_birth: dob, email_for_results: email,
        personal_removed_at: null, location_code: school, dan, cycle_plan_id: planId(plan), kukkiwon, kukkiwon_added_on: kukkiwon ? on : null,
        source: 'form', reference: `BB-${db.ref_counter}`, registered_at: at, status: 'active', withdrawn_reason: null, withdrawn_at: null,
        withdrawn_by_name: null, withdrawn_by: null, duplicate_state: 'none', duplicate_of: null, ...house(FORM_ACTOR, at),
      };
      db.ref_counter += 1;
      db.bb_candidates.push(c);
      const age = ageOn(dob, firstDayOf(db.bb_cycle_days.filter((d) => d.cycle_id === spring.id)));
      db.bb_candidate_waivers.push({
        id: newId(), candidate_id: c.id, waiver_version_id: waiverId, how: 'drawn', submission_id: newId(), acknowledged: true,
        signed_as_minor: age < 18, signer_name: signer, signature: SAMPLE_SIGNATURE, ticked_by_name: null, signed_at: at,
        removed_at: null, ...house(FORM_ACTOR, at),
      });
    }
    write(db);
  }

  return {
    rpc, select, publicCycle, publicRegister, snapshot: read, reset, loadSample, failNextSave, simulateOtherAdminEdit,
    waiverChanged, links,
  };
}
