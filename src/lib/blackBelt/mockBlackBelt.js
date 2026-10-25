// mockBlackBelt.js — the PREVIEW (fake) database for Black Belt testing, phases B1 and B2.
// Why it exists: preview mode (npm run dev:preview-mode) runs without Supabase. This file pretends
// to be what migration 0016 adds (contracts 0016-B1 §2 and 0016-B2 §2): the tables, the staff
// functions behind the Cycles, Rubric and prices, and Candidates screens (candidates, payments,
// refunds, returned checks, the receipt), and the two public functions the family form
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
//   bb.snapshot(), reset(), loadSample(), loadSampleRoster(), loadSampleEdge(), failNextSave(),
//   simulateOtherAdminEdit(), waiverChanged(), links(), expireUndo(), addDuplicate()
//                                                     — test and console helpers
//
// The store (snake_case columns exactly as 0016, so phase B2 adds candidates and payments here
// without a rewrite): bb_settings, bb_waiver_versions, bb_starting_point, bb_cycles,
// bb_cycle_days, bb_cycle_day_parts, bb_cycle_plans, bb_cycle_plan_amounts,
// bb_cycle_kukkiwon_fees, bb_cycle_plan_payments, bb_candidates, bb_candidate_waivers,
// bb_payments, public_attempts, and ref_counter (the next BB- reference, 5001).
// bb_payments is APPEND-ONLY here too: insertPayment() is the only way in (it checks every rule
// of 0016's bb_payments_guard), and nothing in this file changes or removes a payment row.
// The money picture (what is paid, owed, late) comes from rules.js (candidateItems,
// candidateMoney), the same code the screens use, written to match SQL 10c / 10d exactly.
// Times of day are stored as the database sends them ('12:30:00'); timestamps as ISO text.
//
// The store's clock: when __tkdPreview.setToday pretends another date, every timestamp the store
// writes (registered_at, superseded_at …) is moved by the same number of days, so "the school
// date of registered_at" and "24 hours ago" follow the pretend date like they would for real.
//
// Privacy (as the real database): the date of birth, the email, the signature and the signer's
// name are never readable through select(), never in any answer to the staff screens, and never
// logged. The public ok answer has exactly bb_public_answer's keys.
//
// The rubric editor (migration 0024, contract 0024 §10.2) adds:
//   bb_default_rubric   one row: the default rubric every new cycle copies (seed = rubricDefault.js)
//   bb_rubric_undo      the undo slots (what one save / first opening replaced), never readable
//   bb_register_log     a stand-in for change_log's "bb_public_register" rows: which cycles a
//                       family registered in through the form (a deleted candidate still counts)
// and the five admin functions bb_save_default_dan, bb_undo_default_dan, bb_save_cycle_dan,
// bb_undo_cycle_dan and bb_undo_first_open, with 0024's checks in 0024's order (the validator
// is rubric.js danProblems, the JS twin of the SQL one). Changed as 0024 changes them:
// bb_add_cycle copies the default rubric (always closed), bb_set_registration's first opening is
// admin-only and remembers what it replaced for 15 seconds, and bb_public_cycle shows the
// rubric's public view — or null while the cycle has never been opened.
// Grading and results (migration 0025, contract 0025 §13.3) live in mockGrading.js: its new tables,
// its sixteen staff functions and the helpers below call it (createGradingPart, built at the end
// of createBlackBeltBackend with this file's own helpers). This file's 0016 / 0024 functions are
// changed as 0025 replaces them: the roster lists make-ups (no plan) with four new keys and so
// does the detail; Edit details refuses a Dan change while the old Dan has grades (has_grades +
// the counts; bb_update_candidate_clear does the confirmed change); Change plan refuses a make-up;
// Restore refuses a second active make-up (already_added); Delete permanently and Delete cycle
// refuse real grades (has_grades); Edit cycle keeps past graded days and, once grading started,
// the first day (S2); a cycle's rubric save / undo answers has_grades once grading started (for
// good); a make-up never gets a payment of any kind; the purge keeps the age (age_kept) and a
// candidate's purge day is the latest of their make-up chain.
// An older preview store (schema 'bb-1', v1 requirements sheets) is upgraded when it is read:
// the default rubric is added and every v1 sheet is converted with rubricFromV1, like the
// migration's bb_rubric_upgrade step.
import { normalizeName, nameProblem, nameKey } from '../testing/names.js';
import { isIsoDate, signatureIsValid, normalizeNote, noteIsValid, todayInSchoolTime } from '../testing/eventRules.js';
import {
  cycleState, ageOn, firstDayOf, emailIsValid, trimSpaces, purgeDueOn, waiverVersionOk, PARTS, CODE_PATTERN,
  WAIVER_BODY_MAX, KEEP_YEARS_MIN, KEEP_YEARS_MAX, MAX_DAYS, MAX_PLANS, MAX_PAYMENTS, PLACE_OTHER_MAX,
  candidateItems as itemsRule, candidateMoney, liveLines, hasLivePayment, ITEM_PATTERN, METHODS, PAYMENT_MAX_CENTS,
  MAX_FOR_ITEMS, UNDO_WINDOW_MS,
} from './rules.js';
import {
  STARTING_POINT_SCHEDULE, STARTING_POINT_REQUIREMENTS, STARTING_POINT_NAME, SEED_WAIVER_BODY, SEED_WAIVER_VERSION_NAME,
} from './startingPoint.js';
import {
  danProblems, stripStamps, sameDanContent, putDan, freshCopy, rubricPublic, rubricFromV1, rubricNameOk, normalizeDan,
  intOk, REV_MAX, RUBRIC_UNDO_WINDOW_MS, CREDITS_MAX,
} from './rubric.js';
import { DEFAULT_RUBRIC } from './rubricDefault.js';
import {
  createGradingPart, GRADING_RPC_ARGS, GRADING_ADMIN_ONLY, GRADING_WRITE_RPC_NAMES, GRADING_RESTRICTED, GRADING_GRANTED, GRADING_HIDDEN,
} from './mockGrading.js';

// Its own browser-storage key, apart from Color Belt's 'tkd.preview.testing' and Star's.
export const BB_STORE_KEY = 'tkd.preview.blackBelt';
const STORE_SCHEMA = 'bb-2'; // bump when the store's shape changes (an unknown store → the seed)
const OLD_STORE_SCHEMA = 'bb-1'; // before 0024: upgraded on read (see the top)

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
// (0025's tables come from mockGrading.js: only bb_result_texts has readable columns.)
const GRANTED = /* @__PURE__ */ Object.assign({
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
  // 0024 §8: the default rubric (staff and admins read it); the undo slots are never granted
  bb_default_rubric: ['id', 'sheet', 'version', 'updated_at', 'updated_by_name'],
  bb_rubric_undo: [],
}, GRADING_GRANTED);
const HIDDEN = /* @__PURE__ */ Object.assign({
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
  // (0025: the make-up columns are never granted either)
  bb_candidates: ['date_of_birth', 'email_for_results', 'withdrawn_by', 'created_by', 'updated_by', 'makeup_of_candidate_id', 'makeup_of_cycle_name',
    'age_kept'],
  bb_candidate_waivers: ['id', 'candidate_id', 'waiver_version_id', 'how', 'submission_id', 'acknowledged', 'signed_as_minor',
    'signer_name', 'signature', 'ticked_by_name', 'signed_at', 'removed_at', 'version', 'created_at', 'updated_at', 'created_by',
    'updated_by', 'created_by_name', 'updated_by_name'],
  bb_payments: ['recorded_by'],
  bb_default_rubric: ['singleton', 'created_at', 'created_by', 'updated_by', 'created_by_name'],
  bb_rubric_undo: ['id', 'kind', 'cycle_id', 'dan', 'previous', 'after_version', 'saved_by', 'saved_at'],
}, GRADING_HIDDEN);
// Every Black Belt table (mockClient routes supabase.from(<one of these>) here).
// The /* @__PURE__ */ marks tell the bundler (Vite) "this call has no side effects", so when
// nothing uses the result — the live build, where mockClient.js is never used — it drops the call
// AND the lists it reads. Without them the table, column and function names below ended up in the
// live dashboard's JavaScript (security review B1, item 14).
export const BB_TABLES = /* @__PURE__ */ Object.keys(GRANTED);
const STORE_LISTS = /* @__PURE__ */ BB_TABLES.concat(['public_attempts', 'bb_register_log']);

// ----- The staff functions' argument lists (name, type) — exactly 0016's names -----
const ID = (name) => [name, 'uuid'];
// (0025's functions come from mockGrading.js, contract §17.)
const RPC_ARGS = /* @__PURE__ */ Object.assign({
  bb_cycles_list: [],
  bb_cycle_defaults: [],
  bb_add_cycle: [['p_payload', 'jsonb'], ID('p_source_cycle_id')],
  bb_update_cycle: [ID('p_cycle_id'), ['p_expected_version', 'int'], ['p_payload', 'jsonb']],
  bb_set_registration: [ID('p_cycle_id'), ['p_expected_version', 'int'], ['p_open', 'bool']],
  bb_delete_cycle: [ID('p_cycle_id'), ['p_expected_version', 'int'], ['p_expected_candidate_count', 'int']],
  bb_save_waiver: [ID('p_expected_current_id'), ['p_body', 'text']],
  bb_set_keep_years: [['p_expected_version', 'int'], ['p_after_last_day', 'int'], ['p_after_18', 'int'], ['p_confirm_count', 'int']],
  // phase B2: candidates and payments (0016 §15g–§15s, §16c–§16f)
  bb_cycle_roster: [ID('p_cycle_id')],
  bb_candidate_detail: [ID('p_candidate_id')],
  bb_view_signature: [ID('p_candidate_id')],
  bb_receipt: [ID('p_candidate_id')],
  bb_add_candidate: [ID('p_cycle_id'), ['p_first', 'text'], ['p_last', 'text'], ['p_date_of_birth', 'date'], ['p_email', 'text'],
    ['p_location_code', 'text'], ['p_dan', 'int'], ID('p_cycle_plan_id'), ['p_kukkiwon', 'bool'], ['p_paper_waiver', 'bool']],
  bb_update_candidate: [ID('p_candidate_id'), ['p_expected_version', 'int'], ['p_first', 'text'], ['p_last', 'text'],
    ['p_date_of_birth', 'date'], ['p_email', 'text'], ['p_location_code', 'text'], ['p_dan', 'int']],
  bb_change_plan: [ID('p_candidate_id'), ['p_expected_version', 'int'], ID('p_cycle_plan_id'), ['p_kukkiwon', 'bool']],
  bb_resolve_duplicate: [ID('p_keep_id'), ['p_keep_version', 'int'], ID('p_other_id'), ['p_other_version', 'int'], ['p_keep_both', 'bool']],
  bb_withdraw_candidate: [ID('p_candidate_id'), ['p_expected_version', 'int']],
  bb_restore_candidate: [ID('p_candidate_id'), ['p_expected_version', 'int']],
  bb_delete_candidate: [ID('p_candidate_id'), ['p_expected_version', 'int']],
  bb_record_paper_waiver: [ID('p_candidate_id'), ['p_expected_version', 'int']],
  bb_record_payment: [ID('p_candidate_id'), ['p_expected_version', 'int'], ['p_amount_cents', 'int'], ['p_method', 'text'],
    ['p_for_items', 'text[]'], ['p_note', 'text']],
  bb_undo_payment: [ID('p_payment_id')],
  bb_edit_payment: [ID('p_payment_id'), ['p_amount_cents', 'int'], ['p_method', 'text'], ['p_for_items', 'text[]'], ['p_note', 'text'],
    ['p_reason', 'text']],
  bb_record_refund: [ID('p_candidate_id'), ['p_expected_version', 'int'], ['p_amount_cents', 'int'], ['p_method', 'text'], ['p_note', 'text']],
  bb_mark_check_returned: [ID('p_payment_id'), ['p_note', 'text']],
  // the rubric editor (0024 §6, all admins only)
  bb_save_default_dan: [['p_dan', 'int'], ['p_expected_rev', 'int'], ['p_sheet', 'jsonb']],
  bb_undo_default_dan: [['p_dan', 'int'], ['p_expected_rev', 'int']],
  bb_save_cycle_dan: [ID('p_cycle_id'), ['p_dan', 'int'], ['p_expected_rev', 'int'], ['p_sheet', 'jsonb']],
  bb_undo_cycle_dan: [ID('p_cycle_id'), ['p_dan', 'int'], ['p_expected_rev', 'int']],
  bb_undo_first_open: [ID('p_cycle_id'), ['p_expected_version', 'int']],
}, GRADING_RPC_ARGS);
// A = admins only (checked right after has_data_access). bb_cycles_list and bb_set_registration
// are S (staff and admins); set_registration's admin-only case is inside it. Of B2's: withdraw,
// delete, edit payment, refund, mark returned and view signature are A; undo (own row < 10 s),
// restore (own "keep one" < 10 s), Edit details' Dan and Change plan after a payment have their
// admin case inside the function.
const ADMIN_ONLY = /* @__PURE__ */ new Set(/* @__PURE__ */ ['bb_cycle_defaults', 'bb_add_cycle', 'bb_update_cycle', 'bb_delete_cycle', 'bb_save_waiver', 'bb_set_keep_years',
  'bb_withdraw_candidate', 'bb_delete_candidate', 'bb_edit_payment', 'bb_record_refund', 'bb_mark_check_returned', 'bb_view_signature',
  'bb_save_default_dan', 'bb_undo_default_dan', 'bb_save_cycle_dan', 'bb_undo_cycle_dan', 'bb_undo_first_open'].concat(GRADING_ADMIN_ONLY));
// Functions that exist but that a signed-in staff member may NOT call (only bb_registrar, or
// nobody): the app gets "permission denied", like the real database.
const RESTRICTED = /* @__PURE__ */ ['bb_public_cycle', 'bb_public_register', 'bb_public_register_core', 'bb_cycle_state', 'bb_purge_due',
  'bb_candidate_items', 'bb_candidate_money', 'bb_public_answer', 'bb_waiver_version_ok', 'bb_age_on', 'bb_purge_due_on', 'bb_purge_is_due',
  'bb_lock_candidate', 'bb_lock_payment', 'bb_find_duplicate', 'bb_recheck_duplicate', 'bb_recheck_pointing_at',
  // 0024's internal helpers and trigger functions (§15: executable by nobody)
  'bb_rubric_num_ok', 'bb_rubric_int_ok', 'bb_rubric_letters', 'bb_rubric_brackets_problems', 'bb_rubric_dan_problems',
  'bb_rubric_is_valid', 'bb_rubric_part_max', 'bb_rubric_most_points', 'bb_rubric_from_v1', 'bb_rubric_fresh_copy',
  'bb_rubric_public', 'bb_rubric_put_dan', 'bb_default_rubric_guard', 'bb_rubric_undo_guard'].concat(GRADING_RESTRICTED);
// The writes (failNextSave fails the next one of these).
export const BB_WRITE_RPC_NAMES = /* @__PURE__ */ ['bb_add_cycle', 'bb_update_cycle', 'bb_set_registration', 'bb_delete_cycle', 'bb_save_waiver', 'bb_set_keep_years',
  'bb_add_candidate', 'bb_update_candidate', 'bb_change_plan', 'bb_resolve_duplicate', 'bb_withdraw_candidate', 'bb_restore_candidate',
  'bb_delete_candidate', 'bb_record_paper_waiver', 'bb_record_payment', 'bb_undo_payment', 'bb_edit_payment', 'bb_record_refund',
  'bb_mark_check_returned', 'bb_save_default_dan', 'bb_undo_default_dan', 'bb_save_cycle_dan', 'bb_undo_cycle_dan', 'bb_undo_first_open',
].concat(GRADING_WRITE_RPC_NAMES);
// "volatile" functions: they write (bb_cycles_list and bb_cycle_roster run the purge), so a
// read-only GET call is refused, as PostgREST does.
const VOLATILE = /* @__PURE__ */ new Set(/* @__PURE__ */ ['bb_cycles_list', 'bb_cycle_roster'].concat(BB_WRITE_RPC_NAMES));
// Every function name mockClient routes here (one list B2 extends).
export const BB_RPC_NAMES = /* @__PURE__ */ Object.keys(RPC_ARGS).concat(RESTRICTED);

class DbError extends Error {
  constructor(code, message, httpStatus = 400) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

// A table rule said no INSIDE a function (a check rule → 'invalid', an "at most once" index →
// 'stale'): the function's changes are dropped and it answers that status, like the SQL
// functions' "exception when check_violation / unique_violation" blocks.
class RuleError extends Error {
  constructor(status, rule) {
    super(`rule ${rule}`);
    this.status = status;
    this.rule = rule;
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
    case 'numeric': { // a number (0025's measured values); a numeric text is read like PostgreSQL does
      let n = value;
      if (typeof value === 'string' && /^\s*[+-]?(\d+(\.\d*)?|\.\d+)\s*$/.test(value)) n = Number(value);
      if (typeof n !== 'number' || !Number.isFinite(n)) throw new DbError('22P02', `invalid input syntax for type numeric: "${value}"`);
      return n;
    }
    case 'jsonb':
      return JSON.parse(JSON.stringify(value)); // any JSON value; the function checks it itself
    case 'date': // 'YYYY-MM-DD' (a real calendar date)
      if (typeof value === 'string' && isIsoDate(value)) return value;
      throw new DbError('22007', `invalid input syntax for type date: "${value}"`);
    case 'text[]': // a flat list of texts; a null entry is allowed here (the function refuses it)
      if (Array.isArray(value) && value.every((x) => x === null || typeof x === 'string')) return [...value];
      throw new DbError('22P02', `malformed array literal: "${JSON.stringify(value)}"`);
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

// A PNG "signature" for the sample: a small made-up scribble (240×72, about 2 KB; never a real
// person's), so View signature shows a visible drawing in the preview.
const SAMPLE_SIGNATURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAPAAAABICAQAAABixbABAAAJW0lEQVR42u2cDXRUxRXHl6JirIDkCKbK+RmgAQUJBU7aEiiFpG1UKpzwGYFQgyRt+AhfBWICcUsQg9HACYgk2KQcKrREOKaKpp4grZooCBQ4PUVQTAUB05pIi1qp1pSdnZ28TTb79ZZNdp3/HMLbfTN37r3/eXfuzHtvLRYNDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ2NEAMeytfcAWFl2XX0YQix9OG6rwnNrVxwE1HcFB7GOxGbQhknaDKUtylnOjeEMcVOJMZTQA2XpPGXeINCxoQuyQbNY9jIp07UGstltjA4LEk2uOB+3mjD/L+SGYrGK50785jBmrfYSg5zmUcuW3nLcGYzkWFGsXLBQF5SZtZRQSFWCtnFafXtcX4aWiQrbcfyN2nDATK5pdV01JMMXpc1LjAtjChWJs7ksjRwE3EtzI9lHf+WZ4vag2K8KG5a/VxFoSluZYxT8Ss/TChWpv1SGraTfm0Y351CWeel5tSrHcj9FonMYh5zmcGolkmgy3bLpd6FHmvaSrasXdqWjYTOYkuptEQataC1mk6qj+FtUe8gUcExxan3H1LMyVa5wWHyucuN3gtkvZ+5J8Ag4cd8KFqUtK7fisyuQD96E9FhaHYx4qZLFyS3rZxh6bRXUtzt6pvhpOOBNrNfW3mOHzhrL4/vk+cneON2JWEQ74pWq11ItJdECvgTHxk0OM/LrCGh3UluRe8gPhcKTnSvlKHFs6L+C17X9zOQqZrfZ79y4zE2MIvRxDKEBDIopU6dK+HGFn1EyWvxfp/7vIt/iJat5+xe/IozbobaeZ5gUDtSLLqdzSFmSxWqhVpZnhUyGFllTLc8kvsN7mQs95J4JVmL8I5kQ50VynUbGepyqPyIClnjXef1Os+Ib1f64mzV9icyo450krhKXg62cpY/sJ5clpPHJqrkYLKX7QxsJ5JFl4do4oxhhvqtjyM8Us6FUzwkLHeSRw3/cxrhf6GQkZ5IVme3yVZl3O42HoyhVtacqb4bLz6/7KubVfsc0f4p9Xm4mibeYaXzvK9WGzkcVZbmtwvFBtVT+Cb/pImLjnWhD+aPFhLOtZyJDcaOptJNIHuTGR5n/M68IOo2MNWr/HedlD1LfrYveYb57mIlsUZIGC6OJ/Nf8el9HvQw+dzDH5WV3wk6xXKpYeu+kjzx/yJfVFBm5Mqw6Spz7cHThjlpByuYzgSmsZhfc0qd+XPzleyyh+dFrUP09zr/nSsl342FCeLoSf/cK+UlyXBr2+FzzPMRXgw1C1NkmvZ58+AMbpK1R3RvSyRO+x3C7AErztHaMHu9L91RQZKLER7HJkXyyjaXN2Xi/KverblbbGlc4FYZP2L8da6UZ78Wx0htl3gKugYru7BVtspoD4pTlYuX+h3C7hbtn21B34NS7quMdhPGUOY/43J5s0ycO0IPn/Nfqxxatr+7/XesuhJtcuxRZ753uhisXCxtnBNUiuXeq4PgHiZC2HNCwvcMJmVKqWtcz5pOJCdTL+pWOe7IWprvZzWJ3GCgX/nvXmXbNDNuldIuSlmPea+LwcZZsvV9wSbYIu+g/N7UHGVPtcqVOSnSnNle7RBb6MubcvPTmfpaIz0+Tx6DFMFdzThVSquQ+2X+TmRpMlHsF2yKnxQdp5oMYfuElJ7ieBhfiE8zfFhT38gros02A70LxTdb/Alrss0TcrfNpEsNuXmyiVw8xziIg0fwBtHtSJMEzxBSFhqSriwfZ6quMpasUMmJLXA3OjYY/NIqWkjcY9ahQpZ9xZ9kIs45osD8oFEsOrJv/00PyBz1OhZWt7VB79H8ATSKtvGGnaslprJfe4bxBdeYJrincQ7120e3iZutH5mbMnzt9ozj2jM5R9mXM3fIrcIufq2pp4rWNeL471eyzg/8zzpFu1slLfGmCf62lPRdk5fBIiHFGqRrWHTzH9HlctNz1CQh5zf+Za2K4hLRfp5cluSazH4jJC1TAxCi1V6ByZs7to2P+mASfNlxB9iknG4qZ602MWvezL/E9v1uIek209nvESHnngAQPIq19g1Hk5FuafN9reAQ/I55FzgtuJocz2v5KSVbzpvqRqQprSZznucDkmQF4IaBaH+LsO93wSN4udgNDoQLtsgH8sxtCnaRqVYTvwiAOwNyHyegBFvEgrA+eARb/FuIuJBkv+WYY3pb0PFYa0xHIfiq7DxEB4/gQI3xtc1bAabkDJF3n8Lw3QJhk31jdhQhp/grzRvqJofcWfEaSRi+OiK2Ze3xKSH0CP6weZ/GlJxO0gVRYUlwrLRuYKgR3Fkqnm462HeXkhLDkmALH4hnPCyhSvA40wR3lZJSw5TgO5jLzaFHsIXD4s28bgFI1y45HlEPS4JD8b1FofBQNtk3OUxLUg8QaITdyBQSbudp+yOAGiFFMCFXNAJL3vXi5yKiGUAscYwkgSTGM4kUUkkjnUwWsJClLCObHHJZRR4P8zBW8TePVeSSQzbLWMpCFpBJOmmkksIkxpNEAiOJI5YBRIufpbheDwKzBF5LJNEMJp4kJvMA83mINWyglB1UUk0tRznFWRr4xO1LZVevfEIDZznFUWqpppIdlLKBNTzEfB5gMknEM5hoIrk25AeAH+r3oA9DGUsyaVdmTStFlLGbag5ykgtufgfDdfmMjzlHHSc4xgFeYx8vUkkFO9lGGSVsppgiHqeAR3mEfFZjFVev/Z+V1eTzCI9SwOMUUcxmSihjGzupoJIX2cdrHOAYJ6jjHB/zmY/6fcoFTnKQanZTRhFWFpFGMmMZSp/mR3s7LPltvPAdzTASmUIG2ayjlAqqOcxpGvnKo0su08B7HKeGKiooZyNrySWLOaQwnkRGMIQYehPp6s3aoJQIIulNDEMYQSLjSWEOWeSylo2UU0EVNRznPRrULx+0Xb6ikdMcppoKSllHNhlMIZFhRNO9YxDcCyvFbGcvtZykni89mNRIHUfYzx7KWY+VxaQxkUTi6E+U8QeJwqLcQBT9iSORiaSxGCvrKWcP+zlCnbrN2Vb5knpOUstetlN8Jea0C8HWVmpdpE6MyV2UUsAK0sWYHE5fIukUjqmJiQHQiUj6MlzEu3RWUEApu0S8q1MPzjeXie11BWcxk3GMYAC9bM8j6qVFgIbBNfRiACMYx0yyyO4oc7BeHWpPamhoaGhoaGhoaGhoaGhoaFwt/B/GSSD4uQsR0gAAAABJRU5ErkJggg==';

// ----- The backend -----

export function createBlackBeltBackend({ loadStore, saveStore, now = () => Date.now(), today, newId, getLocations = null }) {
  let failNext = false; // set by failNextSave()
  // Compares names like the database's en-US collation (the roster's order).
  const collator = new Intl.Collator('en-US');

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
      bb_default_rubric: [defaultRubricRow(at)], bb_rubric_undo: [], bb_register_log: [],
      // 0025: the grading tables, and the three result texts as the migration seeds them
      bb_grades: [], bb_extra_counts: [], bb_makeup_subjects: [], bb_result_sends: [], bb_downloads: [], bb_cycle_grading_started: [],
      bb_result_texts: grading.seedTexts(at),
      public_attempts: [],
      ref_counter: REFERENCE_START,
    };
  }

  // 0024's seed of bb_default_rubric (tag bb_seed, actor "Database admin").
  function defaultRubricRow(at = stamp()) {
    return { id: newId(), singleton: true, sheet: clone(DEFAULT_RUBRIC), ...house(SEED_ACTOR, at) };
  }

  // A store from before 0024 → the same data with 0024's additions (the migration's own steps:
  // the default seeded, every v1 sheet converted in place, no version bump). Anything that can't
  // be converted is left as it is, and usable() then sends the store back to the seed.
  function upgrade(store) {
    if (!isObj(store)) return store;
    if (store.schema === OLD_STORE_SCHEMA) {
      store.schema = STORE_SCHEMA;
      store.bb_default_rubric = [defaultRubricRow()];
      store.bb_rubric_undo = [];
      // the form registrations so far (the stand-in for change_log's bb_public_register rows)
      store.bb_register_log = (Array.isArray(store.bb_candidates) ? store.bb_candidates : [])
        .filter((c) => c?.source === 'form').map((c) => ({ cycle_id: c.cycle_id, at: c.registered_at }));
    }
    grading.upgradeStore(store); // 0025's lists and columns, for a store saved before 0025
    for (const c of Array.isArray(store.bb_cycles) ? store.bb_cycles : []) {
      if (c?.requirements?.schema_version === 1) {
        try {
          c.requirements = rubricFromV1(c.requirements);
        } catch {
          // left as it is: usable() refuses the store
        }
      }
    }
    return store;
  }

  // Is a saved store whole enough to use? (Damaged or from another build → the seed.)
  function usable(store) {
    if (!isObj(store) || store.schema !== STORE_SCHEMA) return false;
    if (!STORE_LISTS.every((list) => Array.isArray(store[list]))) return false;
    if (!Number.isInteger(store.ref_counter) || store.ref_counter < REFERENCE_START) return false;
    if (store.bb_settings.length !== 1 || store.bb_starting_point.length !== 1 || store.bb_default_rubric.length !== 1) return false;
    if (!store.bb_cycles.every((c) => c?.requirements?.schema_version === 2)) return false;
    return store.bb_waiver_versions.filter((v) => v?.superseded_at === null).length === 1;
  }

  // The current data (a private copy each time: a function's changes are saved only at the end).
  function read() {
    let store = null;
    try {
      store = upgrade(clone(loadStore()));
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
  // 0025 (§6.2): the purge day is the latest over the candidate's make-up chain (mockGrading's
  // purgeDueChain), and the age on the first testing day is kept (age_kept, once) as the DOB goes,
  // so the result stays exact. Grades, counts, make-up subjects and sends stay.
  function purge(db) {
    const s = settings(db);
    if (s.keep_years_after_last_day === null || s.keep_years_after_18 === null) return 0;
    const onDay = today();
    const at = stamp();
    let n = 0;
    for (const c of [...db.bb_candidates].sort(byId)) {
      if (c.personal_removed_at !== null) continue;
      const due = grading.purgeDueChain(db, c);
      if (due === null || due > onDay) continue;
      if (c.age_kept === null || c.age_kept === undefined) c.age_kept = grading.ageToKeep(db, c);
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
    grading.cascadeCandidates(db, candIds); // 0025: grading rows and sends go; make-ups elsewhere lose the link
    grading.cascadeCycle(db, cycleId); // …and the cycle's "grading started" row (the only way it goes)
    db.bb_candidates = db.bb_candidates.filter((c) => c.cycle_id !== cycleId);
    db.bb_rubric_undo = db.bb_rubric_undo.filter((s) => s.cycle_id !== cycleId); // 0024: the cycle's undo slots
    db.bb_register_log = db.bb_register_log.filter((x) => x.cycle_id !== cycleId);
    db.bb_cycles = db.bb_cycles.filter((c) => c.id !== cycleId);
  }

  // ----- The rubric's undo slots and saves (0024 §5–§6) -----
  // A slot remembers what ONE save (of a Dan) or ONE first opening replaced: kind 'default_dan'
  // (dan 1–4), 'cycle_dan' (cycle + dan) or 'first_open' (cycle). One slot per Dan / per cycle:
  // a new save replaces it. Undo only works for the same admin, within 15 seconds, and only if
  // nothing changed since (after_version = the rev / version that save produced).

  const slotOf = (db, kind, cycleId, dan) => db.bb_rubric_undo
    .find((s) => s.kind === kind && (s.cycle_id ?? null) === (cycleId ?? null) && (s.dan ?? null) === (dan ?? null)) ?? null;
  function dropSlot(db, kind, cycleId, dan, onlyUser = undefined) {
    db.bb_rubric_undo = db.bb_rubric_undo.filter((s) => !(s.kind === kind && (s.cycle_id ?? null) === (cycleId ?? null)
      && (s.dan ?? null) === (dan ?? null) && (onlyUser === undefined || s.saved_by === onlyUser)));
  }
  function putSlot(db, kind, cycleId, dan, previous, afterVersion, userId) {
    dropSlot(db, kind, cycleId, dan);
    db.bb_rubric_undo.push({
      id: newId(), kind, cycle_id: cycleId ?? null, dan: dan ?? null, previous: clone(previous), after_version: afterVersion,
      saved_by: userId ?? null, saved_at: stamp(),
    });
  }
  // Not older than 15 seconds (the SQL: saved_at < now() − 15 seconds → stale).
  const slotFresh = (slot) => !(Date.parse(slot.saved_at) < clock() - RUBRIC_UNDO_WINDOW_MS);
  // A Dan's saved_at: 'YYYY-MM-DDTHH:MM:SSZ' in UTC, without the milliseconds.
  const danStamp = () => `${stamp().slice(0, 19)}Z`;
  // A Dan's saved_by_name: the actor's name tidied and cut to 60 characters, or null when that
  // isn't a valid name (so an admin with an odd display name can always save; §2.2).
  function stampName(actor) {
    const cut = normalizeName([...normalizeName(actor ?? '')].slice(0, 60).join(''));
    return rubricNameOk(cut) ? cut : null;
  }

  // Step 3 of a save: the arguments, then the sheet with its stamps stripped (rev = expected + 1
  // as a placeholder), then the validator. → { sheet } or { answer } (invalid, with problems).
  function readDanSheet(a) {
    if (!intOk(a.p_dan, 1, 4) || !intOk(a.p_expected_rev, 1, REV_MAX) || !isObj(a.p_sheet) || a.p_sheet.dan !== a.p_dan) {
      return { answer: st('invalid') };
    }
    const sheet = stripStamps(a.p_sheet, a.p_expected_rev + 1);
    const problems = danProblems(sheet, a.p_dan);
    if (problems.length > 0) return { answer: { status: 'invalid', problems } };
    return { sheet };
  }
  const undoArgsOk = (a) => intOk(a.p_dan, 1, 4) && intOk(a.p_expected_rev, 1, REV_MAX);

  // Steps 5–8 of a save. target: { kind, cycleId, doc, dan, expectedRev, sheet, store(newDoc) }.
  function saveDan(db, ctx, t) {
    const current = t.doc.dans[t.dan - 1];
    if (current.rev !== t.expectedRev) return { answer: st('stale') };
    if (sameDanContent(current, t.sheet)) {
      // nothing to save; the caller's own older Undo can't point at it any more
      dropSlot(db, t.kind, t.cycleId, t.dan, ctx.userId ?? null);
      return {
        answer: {
          status: 'ok', rev: current.rev, saved_at: current.saved_at, saved_by_name: current.saved_by_name,
          changed: false, undo_available: false, previous_rev: null, // nothing was replaced
        },
        save: true,
      };
    }
    const rev = t.expectedRev + 1;
    putSlot(db, t.kind, t.cycleId, t.dan, current, rev, ctx.userId);
    const stamped = { ...t.sheet, rev, saved_at: danStamp(), saved_by_name: stampName(ctx.actorName) };
    t.store(putDan(t.doc, t.dan, stamped));
    return {
      answer: {
        status: 'ok', rev, saved_at: stamped.saved_at, saved_by_name: stamped.saved_by_name,
        changed: true, undo_available: true, previous_rev: t.expectedRev,
      },
      save: true,
    };
  }

  // Steps 5–8 of an undo: the previous Dan comes back with a NEW rev (one more history entry).
  function undoDan(db, ctx, t) {
    const current = t.doc.dans[t.dan - 1];
    const slot = slotOf(db, t.kind, t.cycleId, t.dan);
    if (current.rev !== t.expectedRev || !slot || slot.after_version !== t.expectedRev
      || slot.saved_by !== (ctx.userId ?? null) || !slotFresh(slot)) {
      return { answer: st('stale') };
    }
    const back = { ...clone(slot.previous), rev: current.rev + 1, saved_at: danStamp(), saved_by_name: stampName(ctx.actorName) };
    t.store(putDan(t.doc, t.dan, back));
    dropSlot(db, t.kind, t.cycleId, t.dan);
    return { answer: { status: 'ok', rev: back.rev, saved_at: back.saved_at, saved_by_name: back.saved_by_name }, save: true };
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
    // 0024 §6.4: the rubric is a fresh copy of the DEFAULT rubric (source "Default rubric", every
    // Dan rev 1, no stamps); the source cycle is still checked (null or an existing cycle) but no
    // longer gives the sheet.
    bb_add_cycle(db, a, ctx) {
      const onDay = today();
      const spec = readAddPayload(a.p_payload, onDay);
      if (!spec) return { answer: st('invalid') };
      if (a.p_source_cycle_id !== null && !findCycle(db, a.p_source_cycle_id)) return { answer: st('invalid') };
      const defaultRow = db.bb_default_rubric[0];
      if (!defaultRow) return { answer: st('invalid') };
      const requirements = freshCopy(defaultRow.sheet);
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
      // 0025 (S2): the day guards refuse the write → has_grades
      if (grading.editCycleRefused(db, cycle, spec.days)) return { answer: st('has_grades') };

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
    // 0024 §6.3: the FIRST opening (first_opened_at still empty) is admin-only, because it locks
    // the cycle's rubric; it remembers what it replaced in a 'first_open' undo slot (15 seconds,
    // bb_undo_first_open). Any other write (a close, a later reopen) clears that slot.
    bb_set_registration(db, a, ctx) {
      if (a.p_cycle_id === null || a.p_expected_version === null || a.p_open === null) return { answer: st('invalid') };
      const cycle = findCycle(db, a.p_cycle_id);
      if (!cycle) return { answer: st('not_found') };
      if (cycle.version !== a.p_expected_version) return { answer: st('stale') };
      const onDay = today();
      if (stateOf(db, cycle, onDay).past) return { answer: st('finished') };
      if (a.p_open && cycle.first_opened_at === null && !ctx.isAdmin) return { answer: st('not_allowed') };
      if (a.p_open && currentWaiver(db)?.is_placeholder) return { answer: st('waiver_needed') };
      let clear = false;
      if (a.p_open && cycle.auto_close && onDay > cycle.application_due) {
        if (!ctx.isAdmin) return { answer: st('not_allowed') };
        clear = true;
      }
      const autoCloseBefore = cycle.auto_close;
      const firstOpen = a.p_open && cycle.first_opened_at === null;
      if (cycle.registration_open !== a.p_open || clear) {
        updateRow(cycle, {
          registration_open: a.p_open,
          first_opened_at: a.p_open ? cycle.first_opened_at ?? stamp() : cycle.first_opened_at,
          auto_close: clear ? false : cycle.auto_close,
        }, ctx.actorName);
        if (firstOpen) {
          putSlot(db, 'first_open', cycle.id, null,
            { registration_open: false, first_opened_at: null, auto_close: autoCloseBefore }, cycle.version, ctx.userId);
        } else {
          dropSlot(db, 'first_open', cycle.id, null);
        }
      }
      return { answer: { status: 'ok', version: cycle.version, state: stateOf(db, cycle, onDay), first_open: firstOpen }, save: true };
    },

    // 0024 §6.3. Undo of a first opening (A): back to never opened (registration closed,
    // first_opened_at empty, the automatic close as it was), so the rubric is editable again.
    // Only the admin who opened, within 15 seconds, with nothing changed since, and only if no
    // family has registered through the form (has_registrations — the lock then stays).
    bb_undo_first_open(db, a, ctx) {
      if (a.p_cycle_id === null || a.p_expected_version === null) return { answer: st('invalid') };
      const cycle = findCycle(db, a.p_cycle_id);
      if (!cycle) return { answer: st('not_found') };
      const slot = slotOf(db, 'first_open', cycle.id, null);
      if (cycle.version !== a.p_expected_version || !slot || slot.after_version !== cycle.version
        || slot.saved_by !== ctx.userId || !slotFresh(slot) || cycle.registration_open !== true) {
        return { answer: st('stale') };
      }
      const registered = candidatesOf(db, cycle.id).some((c) => c.source === 'form')
        || db.bb_register_log.some((x) => x.cycle_id === cycle.id);
      if (registered) return { answer: st('has_registrations') };
      updateRow(cycle, { registration_open: false, first_opened_at: null, auto_close: slot.previous.auto_close }, ctx.actorName, true);
      dropSlot(db, 'first_open', cycle.id, null);
      return { answer: { status: 'ok', version: cycle.version, state: stateOf(db, cycle) }, save: true };
    },

    // 0024 §6.1. Save one Dan of the default rubric (A).
    bb_save_default_dan(db, a, ctx) {
      const input = readDanSheet(a);
      if (input.answer) return input;
      const row = db.bb_default_rubric[0];
      if (!row) return { answer: st('invalid') }; // it is seeded; never 'not_found'
      return saveDan(db, ctx, {
        kind: 'default_dan', cycleId: null, doc: row.sheet, dan: a.p_dan, expectedRev: a.p_expected_rev, sheet: input.sheet,
        store: (doc) => updateRow(row, { sheet: doc }, ctx.actorName),
      });
    },

    // 0024 §6.1. Undo of the last save of one default Dan (A; the saver, within 15 seconds).
    bb_undo_default_dan(db, a, ctx) {
      if (!undoArgsOk(a)) return { answer: st('invalid') };
      const row = db.bb_default_rubric[0];
      if (!row) return { answer: st('invalid') };
      return undoDan(db, ctx, {
        kind: 'default_dan', cycleId: null, doc: row.sheet, dan: a.p_dan, expectedRev: a.p_expected_rev,
        store: (doc) => updateRow(row, { sheet: doc }, ctx.actorName),
      });
    },

    // 0024 §6.2. Save one Dan of a cycle's copy (A): only while the cycle has never been opened.
    // requirements is a "no-bump" column: the cycle's version (and Edit cycle) stay as they are.
    bb_save_cycle_dan(db, a, ctx) {
      if (a.p_cycle_id === null) return { answer: st('invalid') };
      const input = readDanSheet(a);
      if (input.answer) return input;
      const cycle = findCycle(db, a.p_cycle_id);
      if (!cycle) return { answer: st('not_found') };
      if (cycle.first_opened_at !== null) return { answer: { status: 'locked', first_opened_at: cycle.first_opened_at } };
      if (grading.gradingStartedAt(db, cycle.id) !== null) return { answer: { status: 'has_grades', grading_started_at: grading.gradingStartedAt(db, cycle.id) } };
      return saveDan(db, ctx, {
        kind: 'cycle_dan', cycleId: cycle.id, doc: cycle.requirements, dan: a.p_dan, expectedRev: a.p_expected_rev, sheet: input.sheet,
        store: (doc) => { cycle.requirements = doc; },
      });
    },

    // 0024 §6.2. Undo of the last save of one Dan of a cycle's copy (A).
    bb_undo_cycle_dan(db, a, ctx) {
      if (a.p_cycle_id === null || !undoArgsOk(a)) return { answer: st('invalid') };
      const cycle = findCycle(db, a.p_cycle_id);
      if (!cycle) return { answer: st('not_found') };
      if (cycle.first_opened_at !== null) return { answer: { status: 'locked', first_opened_at: cycle.first_opened_at } };
      if (grading.gradingStartedAt(db, cycle.id) !== null) return { answer: { status: 'has_grades', grading_started_at: grading.gradingStartedAt(db, cycle.id) } };
      return undoDan(db, ctx, {
        kind: 'cycle_dan', cycleId: cycle.id, doc: cycle.requirements, dan: a.p_dan, expectedRev: a.p_expected_rev,
        store: (doc) => { cycle.requirements = doc; },
      });
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
      if (candidates.some((c) => grading.candidateHasGrades(db, c.id))) return { answer: st('has_grades') }; // 0025, Q-G3
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
          const due = grading.purgeDueChain(db, c, n1, n2); // 0025: the latest of the make-up chain
          if (due !== null && due <= onDay) count += 1;
        }
      }
      if (a.p_confirm_count === null) return { answer: { status: 'confirm_needed', remove_count: count } };
      if (a.p_confirm_count !== count) return { answer: st('stale') };
      updateRow(s, { keep_years_after_last_day: n1, keep_years_after_18: n2 }, ctx.actorName);
      const removed = purge(db);
      return { answer: { status: 'ok', version: s.version, removed_count: removed }, save: true };
    },
    // ===== Phase B2: candidates and payments (0016 §15g–§15s, §16c–§16f), the SQL's check order =====

    // 16c. The Candidates tab: every candidate (withdrawn too) with the money picture (without the
    // item list); NO date of birth, email, waiver data or login id. Then the purge (it writes).
    bb_cycle_roster(db, a) {
      if (a.p_cycle_id === null) return { answer: st('invalid') };
      const cycle = findCycle(db, a.p_cycle_id);
      if (!cycle) return { answer: st('not_found') };
      const onDay = today();
      const rows = candidatesOf(db, cycle.id)
        .sort(rosterOrder)
        .map((c) => ({
          id: c.id, first_name: c.first_name, last_name: c.last_name, location_code: c.location_code, dan: c.dan,
          // 0025: a LEFT join — a make-up row has no plan (plan_id / plan_name null)
          plan_id: c.cycle_plan_id, plan_name: db.bb_cycle_plans.find((p) => p.id === c.cycle_plan_id)?.name ?? null, kukkiwon: c.kukkiwon,
          source: c.source, reference: c.reference, registered_at: c.registered_at, status: c.status,
          withdrawn_reason: c.withdrawn_reason, duplicate_state: c.duplicate_state, duplicate_of: c.duplicate_of, version: c.version,
          has_payment_rows: db.bb_payments.some((p) => p.candidate_id === c.id),
          money: moneyOf(db, c, onDay, false),
          ...grading.candidateExtras(db, c), // is_makeup, makeup_of_cycle_name, retest_names, has_grades
        }));
      const purged = purge(db); // after the rows are built, as the SQL
      return { answer: { status: 'ok', state: stateOf(db, cycle, onDay), rows }, save: purged > 0 };
    },

    // 16d. One candidate: every column except the login ids (WITH the date of birth and email),
    // the newest waiver's state (never the picture), the warning, the live payment lines and the
    // money with its items. Once the purge day has passed, DOB, email, age and signer's name are
    // answered as null even if the purge hasn't run yet.
    bb_candidate_detail(db, a) {
      if (a.p_candidate_id === null) return { answer: st('invalid') };
      const c = findCandidate(db, a.p_candidate_id);
      if (!c) return { answer: st('not_found') };
      const onDay = today();
      const plan = db.bb_cycle_plans.find((p) => p.id === c.cycle_plan_id) ?? null;
      const w = newestWaiver(db, c.id);
      const due = purgeIsDue(db, c, onDay);
      const dob = due ? null : c.date_of_birth;
      const age = ageOn(dob, firstDayOfCycle(db, c.cycle_id));
      const candidate = {
        id: c.id, cycle_id: c.cycle_id, first_name: c.first_name, last_name: c.last_name, date_of_birth: dob,
        email_for_results: due ? null : c.email_for_results, personal_removed_at: c.personal_removed_at, location_code: c.location_code,
        dan: c.dan, cycle_plan_id: c.cycle_plan_id, kukkiwon: c.kukkiwon, kukkiwon_added_on: c.kukkiwon_added_on, source: c.source,
        reference: c.reference, registered_at: c.registered_at, status: c.status, withdrawn_reason: c.withdrawn_reason,
        withdrawn_at: c.withdrawn_at, withdrawn_by_name: c.withdrawn_by_name, duplicate_state: c.duplicate_state,
        duplicate_of: c.duplicate_of, version: c.version, created_at: c.created_at, updated_at: c.updated_at,
        created_by_name: c.created_by_name, updated_by_name: c.updated_by_name,
        age_on_first_day: age, under_18_on_first_day: age === null ? null : age < 18,
        // 0025: a make-up row has no plan (null); the earlier cycle's NAME only — never its row id or a kept age
        plan: c.source === 'makeup' ? null : { name: plan?.name ?? null, payments_count: plan?.payments_count ?? null },
        ...grading.candidateExtras(db, c),
      };
      const waiver = w === null ? null : {
        how: w.how,
        version_name: db.bb_waiver_versions.find((v) => v.id === w.waiver_version_id)?.version_name ?? null,
        signed_at: w.signed_at,
        signer_name: due ? null : w.signer_name,
        signed_as_minor: w.signed_as_minor,
        ticked_by_name: w.ticked_by_name,
        signature_on_file: w.signature !== null,
        removed_at: w.removed_at,
      };
      const payments = liveRowsOf(db, c.id).map((p) => ({
        id: p.id, kind: p.kind, amount_cents: p.amount_cents, method: p.method, paid_on: p.paid_on, for_items: clone(p.for_items),
        note: p.note, reason: p.reason, recorded_at: p.recorded_at, recorded_by_name: p.recorded_by_name,
        reverses_payment_id: p.reverses_payment_id, returned: p.returned,
      }));
      return {
        answer: {
          status: 'ok', candidate, waiver, needs_parent_signature: needsParentSignature(db, c, dob), payments, money: moneyOf(db, c, onDay),
        },
      };
    },

    // 16e. The drawn signature itself (A): the newest DRAWN waiver's; null for paper only or once
    // the purge day has passed. Not logged.
    bb_view_signature(db, a) {
      if (a.p_candidate_id === null) return { answer: st('invalid') };
      const c = findCandidate(db, a.p_candidate_id);
      if (!c) return { answer: st('not_found') };
      const w = newestWaiver(db, c.id, 'drawn');
      const due = purgeIsDue(db, c);
      return {
        answer: {
          status: 'ok', signature: due || !w ? null : w.signature, signer_name: due || !w ? null : w.signer_name,
          signed_at: w?.signed_at ?? null, removed_at: w?.removed_at ?? null,
        },
      };
    },

    // 16f. The printed receipt: NO date of birth, email, notes, reasons or "recorded by".
    bb_receipt(db, a, ctx) {
      if (a.p_candidate_id === null) return { answer: st('invalid') };
      const c = findCandidate(db, a.p_candidate_id);
      if (!c) return { answer: st('not_found') };
      const onDay = today();
      const money = moneyOf(db, c, onDay);
      const schools = [...locations()].sort((x, y) => (x.code === 'worcester' ? 0 : 1) - (y.code === 'worcester' ? 0 : 1));
      return {
        answer: {
          status: 'ok',
          candidate: { first_name: c.first_name, last_name: c.last_name, dan: c.dan, reference: c.reference, location_code: c.location_code },
          cycle: { name: findCycle(db, c.cycle_id)?.name ?? null },
          plan: { name: db.bb_cycle_plans.find((p) => p.id === c.cycle_plan_id)?.name ?? null },
          kukkiwon: c.kukkiwon,
          lines: liveRowsOf(db, c.id).map((p) => ({
            paid_on: p.paid_on, for_items: clone(p.for_items), kind: p.kind, method: p.method, amount_cents: p.amount_cents, returned: p.returned,
          })),
          money: {
            total_due_cents: money.total_due_cents, paid_cents: money.paid_cents, balance_cents: money.balance_cents,
            next_on: money.next_on, next_cents: money.next_cents,
          },
          schools: schools.map((l) => ({ code: l.code, name: l.name, address: addressOf(l.code) })),
          printed_on: onDay,
          printed_by_name: ctx.actorName,
        },
      };
    },

    // 15g. Add candidate at the desk (S): works while registration is closed, not once Past.
    // A paper waiver row is written with it; a same-name + same-DOB match marks both. Then the purge.
    bb_add_candidate(db, a, ctx) {
      const onDay = today();
      const email = a.p_email === null ? null : trimSpaces(a.p_email);
      if (a.p_cycle_id === null || !nameOk(a.p_first) || !nameOk(a.p_last)
        || a.p_date_of_birth === null || a.p_date_of_birth > onDay || a.p_date_of_birth < '1900-01-01'
        || !emailIsValid(email)
        || a.p_location_code === null || !locationCodes().includes(a.p_location_code)
        || a.p_dan === null || a.p_dan < 1 || a.p_dan > 4
        || a.p_cycle_plan_id === null || a.p_kukkiwon === null || a.p_paper_waiver !== true) return { answer: st('invalid') };
      const cycle = findCycle(db, a.p_cycle_id);
      if (!cycle) return { answer: st('not_found') };
      const s = stateOf(db, cycle, onDay);
      if (s.past) return { answer: st('finished') };
      if (!db.bb_cycle_plans.some((p) => p.id === a.p_cycle_plan_id && p.cycle_id === cycle.id)) return { answer: st('invalid') };
      const version = currentWaiver(db);
      if (!version) return { answer: st('invalid') };
      const dup = findDuplicate(db, cycle.id, null, a.p_first, a.p_last, a.p_date_of_birth);
      const at = stamp();
      const candidate = {
        id: newId(), cycle_id: cycle.id, first_name: normalizeName(a.p_first), last_name: normalizeName(a.p_last),
        date_of_birth: a.p_date_of_birth, email_for_results: email, personal_removed_at: null, location_code: a.p_location_code,
        dan: a.p_dan, cycle_plan_id: a.p_cycle_plan_id, kukkiwon: a.p_kukkiwon, kukkiwon_added_on: a.p_kukkiwon ? onDay : null,
        source: 'desk', reference: `BB-${db.ref_counter}`, registered_at: at, status: 'active', withdrawn_reason: null,
        withdrawn_at: null, withdrawn_by_name: null, withdrawn_by: null, duplicate_state: dup ? 'possible' : 'none', duplicate_of: dup,
        makeup_of_candidate_id: null, makeup_of_cycle_name: null, age_kept: null, ...house(ctx.actorName, at),
      };
      db.ref_counter += 1;
      db.bb_candidates.push(candidate);
      const age = ageOn(a.p_date_of_birth, s.first_day);
      db.bb_candidate_waivers.push({
        id: newId(), candidate_id: candidate.id, waiver_version_id: version.id, how: 'paper', submission_id: null, acknowledged: true,
        signed_as_minor: age !== null && age < 18, signer_name: null, signature: null, ticked_by_name: ctx.actorName, signed_at: at,
        removed_at: null, ...house(ctx.actorName, at),
      });
      if (dup) recheckDuplicate(db, dup); // both rows show the pair
      purge(db);
      return { answer: { status: 'ok', id: candidate.id, reference: candidate.reference, version: candidate.version }, save: true };
    },

    // 15h. Edit details (S; a Dan change once there is a payment: A). DOB and email are both
    // required — or both stay empty after the purge. version + 1 on purpose when anything changed.
    bb_update_candidate(db, a, ctx) {
      // 0025 (OI-1): 0016's checks and write (updateCandidate016), then 0025's Dan-change rules
      return grading.updateCandidateCore(db, a, ctx, updateCandidate016, null);
    },

    // 0025 §7.1: the confirmed Dan change — the same checks, plus the three counts the dialog showed;
    // the old Dan's real grading rows are cleared in the same step.
    bb_update_candidate_clear(db, a, ctx) {
      const n = [a.p_expected_grade_count, a.p_expected_count_count, a.p_expected_chosen_count];
      if (n.some((x) => x === null || x < 0)) return { answer: st('invalid') }; // step 3 (review S9)
      return grading.updateCandidateCore(db, a, ctx, updateCandidate016, { grades: n[0], counts: n[1], chosen: n[2] });
    },
  };

  // 15h's checks and write (0016), shared by bb_update_candidate and bb_update_candidate_clear
  // (contract 0025 OI-1). → { answer } (a refusal) or { c, apply } — apply() writes and answers.
  function updateCandidate016(db, a, ctx) {
    {
      const onDay = today();
      const email = a.p_email === null ? null : trimSpaces(a.p_email);
      if (a.p_candidate_id === null || a.p_expected_version === null || !nameOk(a.p_first) || !nameOk(a.p_last)
        || ((a.p_date_of_birth === null) !== (a.p_email === null))
        || (a.p_date_of_birth !== null && (a.p_date_of_birth > onDay || a.p_date_of_birth < '1900-01-01' || !emailIsValid(email)))
        || a.p_location_code === null || !locationCodes().includes(a.p_location_code)
        || a.p_dan === null || a.p_dan < 1 || a.p_dan > 4) return { answer: st('invalid') };
      const c = findCandidate(db, a.p_candidate_id);
      if (!c) return { answer: st('not_found') };
      if (c.version !== a.p_expected_version) return { answer: st('stale') };
      // purged: must stay empty; not purged: required
      if ((c.personal_removed_at !== null) !== (a.p_date_of_birth === null)) return { answer: st('invalid') };
      if (a.p_dan !== c.dan && !ctx.isAdmin && hasLivePaymentRow(db, c.id)) return { answer: st('not_allowed') };
      const changes = {
        first_name: normalizeName(a.p_first), last_name: normalizeName(a.p_last), date_of_birth: a.p_date_of_birth,
        email_for_results: email, location_code: a.p_location_code, dan: a.p_dan,
      };
      const apply = () => {
        const changed = Object.keys(changes).some((col) => changes[col] !== c[col]);
        if (changed) {
          const before = { first: c.first_name, last: c.last_name, dob: c.date_of_birth };
          updateRow(c, changes, ctx.actorName, true);
          if (changes.first_name !== before.first || changes.last_name !== before.last || changes.date_of_birth !== before.dob) {
            recheckDuplicate(db, c.id);
            if (c.duplicate_of) recheckDuplicate(db, c.duplicate_of);
            recheckPointingAt(db, c.id);
          }
        }
        return { answer: { status: 'ok', version: c.version, needs_parent_signature: needsParentSignature(db, c) }, save: changed };
      };
      return { c, apply };
    }
  }

  const handlers2 = {

    // 15i. Change plan or Kukkiwon (S before a payment; A after). Same values write nothing.
    bb_change_plan(db, a, ctx) {
      if (a.p_candidate_id === null || a.p_expected_version === null || a.p_cycle_plan_id === null || a.p_kukkiwon === null) {
        return { answer: st('invalid') };
      }
      const c = findCandidate(db, a.p_candidate_id);
      if (!c) return { answer: st('not_found') };
      if (c.source === 'makeup') return { answer: st('invalid') }; // 0025: a make-up has no plan and no fee, ever
      if (c.version !== a.p_expected_version) return { answer: st('stale') };
      if (c.status === 'withdrawn') return { answer: st('withdrawn') };
      if (c.personal_removed_at !== null) return { answer: st('invalid') };
      if (!db.bb_cycle_plans.some((p) => p.id === a.p_cycle_plan_id && p.cycle_id === c.cycle_id)) return { answer: st('invalid') };
      if (!ctx.isAdmin && hasLivePaymentRow(db, c.id)) return { answer: st('not_allowed') };
      const onDay = today();
      const changed = c.cycle_plan_id !== a.p_cycle_plan_id || c.kukkiwon !== a.p_kukkiwon;
      if (changed) {
        updateRow(c, {
          cycle_plan_id: a.p_cycle_plan_id,
          kukkiwon: a.p_kukkiwon,
          // taken off → cleared; kept → unchanged; newly chosen → due today
          kukkiwon_added_on: !a.p_kukkiwon ? null : c.kukkiwon ? c.kukkiwon_added_on : onDay,
        }, ctx.actorName);
      }
      return { answer: { status: 'ok', version: c.version, money: moneyOf(db, c, onDay) }, save: changed };
    },

    // 15j. The "Possible duplicate" choice (S): keep both, or keep this one (the other is
    // withdrawn as a duplicate copy).
    bb_resolve_duplicate(db, a, ctx) {
      if (a.p_keep_id === null || a.p_keep_version === null || a.p_other_id === null || a.p_other_version === null
        || a.p_keep_both === null || a.p_keep_id === a.p_other_id) return { answer: st('invalid') };
      const keep = findCandidate(db, a.p_keep_id);
      if (!keep) return { answer: st('not_found') };
      const other = findCandidate(db, a.p_other_id);
      if (!other) return { answer: st('not_found') };
      if (other.cycle_id !== keep.cycle_id) return { answer: st('invalid') };
      if (keep.version !== a.p_keep_version || other.version !== a.p_other_version) return { answer: st('stale') };
      if (keep.personal_removed_at !== null || other.personal_removed_at !== null) return { answer: st('invalid') };
      if (keep.status !== 'active' || other.status !== 'active') return { answer: st('withdrawn') };
      if (!((keep.duplicate_state === 'possible' && keep.duplicate_of === other.id)
        || (other.duplicate_state === 'possible' && other.duplicate_of === keep.id))) return { answer: st('stale') };
      if (a.p_keep_both) {
        updateRow(keep, { duplicate_state: 'kept_both', duplicate_of: other.id }, ctx.actorName);
        updateRow(other, { duplicate_state: 'kept_both', duplicate_of: keep.id }, ctx.actorName);
      } else {
        updateRow(other, {
          status: 'withdrawn', withdrawn_reason: 'duplicate_copy', withdrawn_at: stamp(), withdrawn_by_name: ctx.actorName,
          withdrawn_by: ctx.userId, duplicate_state: 'none', duplicate_of: null,
        }, ctx.actorName);
        recheckDuplicate(db, keep.id);
        recheckPointingAt(db, other.id);
      }
      return { answer: { status: 'ok', keep_version: keep.version, other_version: other.version }, save: true };
    },

    // 15k. Withdraw (A): to the Removed group; payments and the waiver stay.
    bb_withdraw_candidate(db, a, ctx) {
      if (a.p_candidate_id === null || a.p_expected_version === null) return { answer: st('invalid') };
      const c = findCandidate(db, a.p_candidate_id);
      if (!c) return { answer: st('not_found') };
      if (c.version !== a.p_expected_version) return { answer: st('stale') };
      if (c.status === 'withdrawn') return { answer: st('withdrawn') };
      updateRow(c, {
        status: 'withdrawn', withdrawn_reason: 'withdrawn', withdrawn_at: stamp(), withdrawn_by_name: ctx.actorName,
        withdrawn_by: ctx.userId, duplicate_state: 'none', duplicate_of: null,
      }, ctx.actorName);
      recheckPointingAt(db, c.id);
      return { answer: { status: 'ok', version: c.version }, save: true };
    },

    // 15l. Restore (A; or the staff member who chose "keep one" less than 10 seconds ago).
    // The role rule comes AFTER the version; "not withdrawn" → stale.
    bb_restore_candidate(db, a, ctx) {
      if (a.p_candidate_id === null || a.p_expected_version === null) return { answer: st('invalid') };
      const c = findCandidate(db, a.p_candidate_id);
      if (!c) return { answer: st('not_found') };
      if (c.version !== a.p_expected_version) return { answer: st('stale') };
      const ownKeepOne = c.status === 'withdrawn' && c.withdrawn_reason === 'duplicate_copy'
        && c.withdrawn_by !== null && c.withdrawn_by === (ctx.userId ?? null)
        && Date.parse(c.withdrawn_at) > clock() - UNDO_WINDOW_MS;
      if (!ctx.isAdmin && !ownKeepOne) return { answer: st('not_allowed') };
      if (c.status !== 'withdrawn') return { answer: st('stale') };
      // 0025: one active make-up per earlier candidate, anywhere
      if (c.makeup_of_candidate_id && grading.activeMakeupsOf(db, c.makeup_of_candidate_id).some((x) => x.id !== c.id)) return { answer: st('already_added') };
      updateRow(c, { status: 'active', withdrawn_reason: null, withdrawn_at: null, withdrawn_by_name: null, withdrawn_by: null }, ctx.actorName);
      recheckDuplicate(db, c.id);
      if (c.duplicate_of) recheckDuplicate(db, c.duplicate_of);
      recheckPointingAt(db, c.id);
      return { answer: { status: 'ok', version: c.version }, save: true };
    },

    // 15m. Delete permanently (A): refused once there is ANY payment row (even an undone one).
    // Its waivers go with it; whoever pointed at it is checked again.
    bb_delete_candidate(db, a, ctx) {
      if (a.p_candidate_id === null || a.p_expected_version === null) return { answer: st('invalid') };
      const c = findCandidate(db, a.p_candidate_id);
      if (!c) return { answer: st('not_found') };
      if (c.version !== a.p_expected_version) return { answer: st('stale') };
      if (db.bb_payments.some((p) => p.candidate_id === c.id)) return { answer: st('has_payments') };
      if (grading.candidateHasGrades(db, c.id)) return { answer: st('has_grades') }; // 0025, Q-G3 (kept / retest rows don't count)
      const pointing = db.bb_candidates.filter((x) => x.duplicate_of === c.id).sort(byId);
      grading.cascadeCandidates(db, new Set([c.id])); // its kept / retest rows and sends; a make-up of it loses the link
      db.bb_candidate_waivers = db.bb_candidate_waivers.filter((w) => w.candidate_id !== c.id); // "on delete cascade"
      db.bb_candidates = db.bb_candidates.filter((x) => x.id !== c.id);
      for (const r of pointing) {
        updateRow(r, { duplicate_of: null }, ctx.actorName); // "on delete set null"
        recheckDuplicate(db, r.id);
      }
      return { answer: st('ok'), save: true };
    },

    // 15n. "Waiver signed on paper" in the parent-signature warning (S): a NEW paper waiver row;
    // the candidate's version goes up. Purged → invalid; Past → finished.
    bb_record_paper_waiver(db, a, ctx) {
      if (a.p_candidate_id === null || a.p_expected_version === null) return { answer: st('invalid') };
      const c = findCandidate(db, a.p_candidate_id);
      if (!c) return { answer: st('not_found') };
      if (c.version !== a.p_expected_version) return { answer: st('stale') };
      if (c.personal_removed_at !== null) return { answer: st('invalid') };
      const s = stateOf(db, findCycle(db, c.cycle_id));
      if (s.past) return { answer: st('finished') };
      const version = currentWaiver(db);
      if (!version) return { answer: st('invalid') };
      const at = stamp();
      const age = ageOn(c.date_of_birth, s.first_day);
      db.bb_candidate_waivers.push({
        id: newId(), candidate_id: c.id, waiver_version_id: version.id, how: 'paper', submission_id: null, acknowledged: true,
        signed_as_minor: age !== null && age < 18, signer_name: null, signature: null, ticked_by_name: ctx.actorName, signed_at: at,
        removed_at: null, ...house(ctx.actorName, at),
      });
      updateRow(c, {}, ctx.actorName, true);
      return { answer: { status: 'ok', version: c.version, needs_parent_signature: needsParentSignature(db, c) }, save: true };
    },

    // 15o. Record payment (S): 1 cent to $5,000, for items of the CURRENT plan, counted today,
    // with the school and cycle name of now. Withdrawn → withdrawn. Then the purge.
    bb_record_payment(db, a, ctx) {
      const note = normalizeNote(a.p_note);
      if (a.p_candidate_id === null || a.p_expected_version === null || !paymentInputOk(a.p_amount_cents, a.p_method, a.p_for_items)
        || !tidyNoteOk(note)) return { answer: st('invalid') };
      const c = findCandidate(db, a.p_candidate_id);
      if (!c) return { answer: st('not_found') };
      if (c.version !== a.p_expected_version) return { answer: st('stale') };
      if (c.status === 'withdrawn') return { answer: st('withdrawn') };
      if (!itemsInPlan(db, c, a.p_for_items)) return { answer: st('invalid') };
      const row = insertPayment(db, paymentRow({
        candidate_id: c.id, cycle_id: c.cycle_id, kind: 'payment', amount_cents: a.p_amount_cents, method: a.p_method,
        paid_on: today(), for_items: [...a.p_for_items], note, location_code: c.location_code,
        cycle_name: findCycle(db, c.cycle_id).name, recorded_by: ctx.userId, recorded_by_name: ctx.actorName,
      }));
      updateRow(c, {}, ctx.actorName, true);
      purge(db);
      return { answer: moneyAnswer(db, c, { payment_id: row.id }), save: true };
    },

    // 15p. Undo a payment, refund or returned mark (S: own row within 10 s; A any time): a
    // reversal row with the SAME method, school and cycle name, dated today. Works on withdrawn.
    bb_undo_payment(db, a, ctx) {
      if (a.p_payment_id === null) return { answer: st('invalid') };
      const p = findPayment(db, a.p_payment_id);
      const c = p ? findCandidate(db, p.candidate_id) : null;
      if (!p || !c) return { answer: st('not_found') };
      const own = (p.recorded_by ?? null) === (ctx.userId ?? null) && Date.parse(p.recorded_at) > clock() - UNDO_WINDOW_MS;
      if (!own && !ctx.isAdmin) return { answer: st('not_allowed') };
      if (p.kind === 'reversal') return { answer: st('invalid') };
      if (isReversed(db, p.id)) return { answer: st('stale') };
      if (p.kind === 'payment' && hasLiveReturned(db, p.id)) return { answer: st('invalid') }; // undo the returned mark first
      if (-p.amount_cents < 0 && netOf(db, c.id) - p.amount_cents < 0) return { answer: st('invalid') }; // the net floor
      insertPayment(db, paymentRow({
        candidate_id: c.id, cycle_id: p.cycle_id, kind: 'reversal', amount_cents: -p.amount_cents, method: p.method, paid_on: today(),
        location_code: p.location_code, cycle_name: p.cycle_name, recorded_by: ctx.userId, recorded_by_name: ctx.actorName,
        reverses_payment_id: p.id,
      }));
      updateRow(c, {}, ctx.actorName, true);
      return { answer: moneyAnswer(db, c), save: true };
    },

    // 15q. Edit payment (A) = a reversal of the old payment + a NEW payment, both with the SAME
    // recorded_at, the editing admin as recorder and the reason; the new row keeps the old date,
    // school and cycle name.
    bb_edit_payment(db, a, ctx) {
      const note = normalizeNote(a.p_note);
      const reason = normalizeNote(a.p_reason);
      if (a.p_payment_id === null || !paymentInputOk(a.p_amount_cents, a.p_method, a.p_for_items) || !tidyNoteOk(note)
        || reason === null || !noteIsValid(reason)) return { answer: st('invalid') };
      const p = findPayment(db, a.p_payment_id);
      const c = p ? findCandidate(db, p.candidate_id) : null;
      if (!p || !c) return { answer: st('not_found') };
      if (p.kind !== 'payment') return { answer: st('invalid') };
      if (isReversed(db, p.id) || hasLiveReturned(db, p.id)) return { answer: st('stale') };
      if (c.status === 'withdrawn') return { answer: st('withdrawn') };
      if (paymentRowsOf(db, c.id).some((r) => r.kind === 'refund' && !isReversed(db, r.id))) return { answer: st('invalid') };
      if (!itemsInPlan(db, c, a.p_for_items)) return { answer: st('invalid') };
      const at = stamp(); // one moment for both rows (Finance pairs them by it)
      insertPayment(db, paymentRow({
        candidate_id: c.id, cycle_id: p.cycle_id, kind: 'reversal', amount_cents: -p.amount_cents, method: p.method, paid_on: today(),
        reason, location_code: p.location_code, cycle_name: p.cycle_name, recorded_at: at, recorded_by: ctx.userId,
        recorded_by_name: ctx.actorName, reverses_payment_id: p.id,
      }));
      const row = insertPayment(db, paymentRow({
        candidate_id: c.id, cycle_id: p.cycle_id, kind: 'payment', amount_cents: a.p_amount_cents, method: a.p_method, paid_on: p.paid_on,
        for_items: [...a.p_for_items], note, reason, location_code: p.location_code, cycle_name: p.cycle_name, recorded_at: at,
        recorded_by: ctx.userId, recorded_by_name: ctx.actorName,
      }));
      updateRow(c, {}, ctx.actorName, true);
      return { answer: moneyAnswer(db, c, { payment_id: row.id }), save: true };
    },

    // 15r. Record refund (A): its own negative row, counted today, never more than the net paid;
    // the school and cycle name of the latest live, not-returned payment (else the candidate's).
    // Allowed on withdrawn candidates.
    bb_record_refund(db, a, ctx) {
      const note = normalizeNote(a.p_note);
      if (a.p_candidate_id === null || a.p_expected_version === null
        || a.p_amount_cents === null || a.p_amount_cents < 1 || a.p_amount_cents > PAYMENT_MAX_CENTS
        || a.p_method === null || !METHODS.includes(a.p_method) || !tidyNoteOk(note)) return { answer: st('invalid') };
      const c = findCandidate(db, a.p_candidate_id);
      if (!c) return { answer: st('not_found') };
      if (c.version !== a.p_expected_version) return { answer: st('stale') };
      const net = netOf(db, c.id);
      if (a.p_amount_cents > net) return { answer: { status: 'refund_too_large', paid_cents: net } };
      const latest = liveRowsOf(db, c.id).filter((p) => p.kind === 'payment' && !p.returned)
        .sort((x, y) => cmp(y.recorded_at, x.recorded_at) || -byId(x, y))[0] ?? null;
      const row = insertPayment(db, paymentRow({
        candidate_id: c.id, cycle_id: c.cycle_id, kind: 'refund', amount_cents: -a.p_amount_cents, method: a.p_method, paid_on: today(),
        note, location_code: latest ? latest.location_code : c.location_code,
        cycle_name: latest ? latest.cycle_name : findCycle(db, c.cycle_id).name, recorded_by: ctx.userId, recorded_by_name: ctx.actorName,
      }));
      updateRow(c, {}, ctx.actorName, true);
      return { answer: moneyAnswer(db, c, { payment_id: row.id }), save: true };
    },

    // 15s. Mark check returned (A): a 'returned' row (NEVER a reversal, Finance v0.809) of minus
    // the check, dated today, copying its school and cycle name. Marked once ever (even if that
    // mark was undone) → stale. The net may go below zero.
    bb_mark_check_returned(db, a, ctx) {
      const note = normalizeNote(a.p_note);
      if (a.p_payment_id === null || !tidyNoteOk(note)) return { answer: st('invalid') };
      const p = findPayment(db, a.p_payment_id);
      const c = p ? findCandidate(db, p.candidate_id) : null;
      if (!p || !c) return { answer: st('not_found') };
      if (p.kind !== 'payment' || p.method !== 'check') return { answer: st('invalid') };
      if (isReversed(db, p.id) || db.bb_payments.some((t) => t.reverses_payment_id === p.id && t.kind === 'returned')) {
        return { answer: st('stale') };
      }
      const row = insertPayment(db, paymentRow({
        candidate_id: c.id, cycle_id: p.cycle_id, kind: 'returned', amount_cents: -p.amount_cents, method: 'check', paid_on: today(),
        note, location_code: p.location_code, cycle_name: p.cycle_name, recorded_by: ctx.userId, recorded_by_name: ctx.actorName,
        reverses_payment_id: p.id,
      }));
      updateRow(c, {}, ctx.actorName, true);
      return { answer: moneyAnswer(db, c, { payment_id: row.id }), save: true };
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
        // 0024 §7: the rubric's public view (no revs, stamps or source) — and null while the
        // cycle has never been opened (its rubric is still a draft), whatever the status says
        requirements: cycle.first_opened_at === null ? null : rubricPublic(cycle.requirements),
      },
      waiver: waiver ? { version_name: waiver.version_name, body: waiver.body } : null,
    };
  }

  // 10c. What a candidate owes, item by item (the S4 floor: a passed date counts from the day
  // they registered; Kukkiwon is due with payment 1, or the day it was chosen if later) — the
  // shared rule in rules.js (candidateItems), fed from the store.
  function itemSpec(db, c) {
    const fee = db.bb_cycle_kukkiwon_fees.find((f) => f.cycle_id === c.cycle_id && f.dan === c.dan);
    return {
      planPayments: planPaymentsOf(db, c.cycle_plan_id),
      amounts: amountsOf(db, c.cycle_plan_id)[String(c.dan)] ?? [],
      kukkiwon: c.kukkiwon,
      kukkiwonAddedOn: c.kukkiwon_added_on,
      kukkiwonFee: fee?.amount_cents ?? null,
      registeredOn: schoolDateOf(c.registered_at),
    };
  }
  // The same items in the database's snake_case: [{ item, label, due_on, amount_cents }].
  function candidateItems(db, c) {
    return itemsRule(itemSpec(db, c)).map((x) => ({ item: x.item, label: x.label, due_on: x.dueOn, amount_cents: x.amountCents }));
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

  // ----- Candidates and payments (phase B2): lookups and the money rules -----

  const findCandidate = (db, id) => db.bb_candidates.find((c) => c.id === id) ?? null;
  const findPayment = (db, id) => db.bb_payments.find((p) => p.id === id) ?? null;
  const paymentRowsOf = (db, candidateId) => db.bb_payments.filter((p) => p.candidate_id === candidateId);
  // The candidate's net total: every row added up (the database's sum, incl. reversals).
  const netOf = (db, candidateId) => paymentRowsOf(db, candidateId).reduce((sum, p) => sum + p.amount_cents, 0);
  // Has an undo (reversal) row pointing at this row?
  const isReversed = (db, id) => db.bb_payments.some((x) => x.reverses_payment_id === id && x.kind === 'reversal');
  // Is this payment's check marked returned by a mark that wasn't undone?
  const hasLiveReturned = (db, id) => db.bb_payments.some((t) => t.reverses_payment_id === id && t.kind === 'returned' && !isReversed(db, t.id));
  // "Has a payment": a payment row that wasn't undone (a bounced check still counts).
  const hasLivePaymentRow = (db, candidateId) => hasLivePayment(liveLines(paymentRowsOf(db, candidateId)));
  // The newest signed waiver of a candidate (signed_at, then id, newest first); how = 'drawn'
  // looks at drawn ones only.
  const newestWaiver = (db, candidateId, how = null) => db.bb_candidate_waivers
    .filter((w) => w.candidate_id === candidateId && (how === null || w.how === how))
    .sort((a, b) => cmp(b.signed_at, a.signed_at) || -byId(a, b))[0] ?? null;
  // Rechecks every candidate whose possible-duplicate mark points at this one (13e), in id order.
  function recheckPointingAt(db, id) {
    for (const c of db.bb_candidates.filter((x) => x.duplicate_of === id).sort(byId)) recheckDuplicate(db, c.id);
  }
  // 10f. Has the candidate's purge day come (today or earlier)? false when there is none.
  // (0025: the latest day of the make-up chain.)
  function purgeIsDue(db, c, onDay = today()) {
    return grading.purgeIsDue(db, c, onDay);
  }
  // 0016's own date of ONE row (bb_purge_due_on before 0025), with the given keep-years numbers.
  function purgeDueOnOwn(db, c, afterLastDay, after18) {
    const days = daysOf(db, c.cycle_id);
    return purgeDueOn({ dateOfBirth: c.date_of_birth, lastDay: days.length ? days[days.length - 1].day_date : null, afterLastDay, after18 });
  }
  // The parent-signature warning (15h / 15n / 16d): under 18 on the cycle's first testing day,
  // and the newest waiver was signed as an adult. dob = the value to use (the detail masks it).
  function needsParentSignature(db, c, dob = c.date_of_birth) {
    const age = ageOn(dob, firstDayOf(daysOf(db, c.cycle_id)));
    const w = newestWaiver(db, c.id);
    return age !== null && age < 18 && w !== null && w.signed_as_minor === false;
  }
  // The money picture of a candidate in the database's snake_case (10d), from the shared rules
  // (rules.js candidateItems + candidateMoney). withItems false = the roster's (no item list).
  function moneyOf(db, c, onDay = today(), withItems = true) {
    const m = candidateMoney({ items: itemsRule(itemSpec(db, c)), lines: liveLines(paymentRowsOf(db, c.id)), today: onDay });
    const out = {
      total_due_cents: m.totalDueCents, paid_cents: m.paidCents, balance_cents: m.balanceCents, overpaid_cents: m.overpaidCents,
      tag: m.tag, next_on: m.nextOn, next_cents: m.nextCents, late_since: m.lateSince, late_cents: m.lateCents,
      late_kukkiwon_only: m.lateKukkiwonOnly,
    };
    if (!withItems) return out;
    return {
      items: m.items.map((x) => ({
        item: x.item, label: x.label, due_on: x.dueOn, amount_cents: x.amountCents, paid_cents: x.paidCents, remaining_cents: x.remainingCents,
      })),
      ...out,
    };
  }
  // The live rows of a candidate as the detail and the receipt list them (oldest first), each
  // the stored row + returned (a payment whose check has a live returned mark).
  function liveRowsOf(db, candidateId) {
    return liveLines(paymentRowsOf(db, candidateId)).map((line) => ({ ...findPayment(db, line.id), returned: line.returned }));
  }

  // A bb_payments row with every column (the ones a function doesn't set are null).
  const paymentRow = (fields) => ({
    id: newId(), candidate_id: null, cycle_id: null, kind: null, amount_cents: null, method: null, paid_on: today(), for_items: null,
    note: null, reason: null, location_code: null, cycle_name: null, recorded_at: stamp(), recorded_by: null, recorded_by_name: null,
    reverses_payment_id: null, ...fields,
  });

  // The ONE way a row gets into bb_payments: the table's rules and bb_payments_guard (11l), in
  // the database's order — the guard (a BEFORE trigger) first, then the check rules, then the two
  // "at most once" indexes, then the school must exist. A broken rule throws RuleError: 'invalid'
  // (a check rule) or 'stale' (an "at most once" index), like the functions' exception blocks.
  // There is NO function anywhere in this file that changes or removes a bb_payments row.
  function insertPayment(db, row) {
    const refuse = (rule) => { throw new RuleError('invalid', rule); };
    const c = findCandidate(db, row.candidate_id);
    // --- 0025's bb_payments_makeup_guard: money for a make-up row is never right (any kind) ---
    if (c && c.source === 'makeup') refuse('bb_payments_makeup');
    // --- the guard (11l) ---
    if (!c || c.cycle_id !== row.cycle_id) refuse('bb_payments_cycle_check');
    if (Array.isArray(row.for_items) && new Set(row.for_items).size !== row.for_items.length) refuse('bb_payments_for_items_check');
    if (row.kind === 'reversal') {
      const t = findPayment(db, row.reverses_payment_id);
      if (!t || !['payment', 'refund', 'returned'].includes(t.kind) || t.candidate_id !== row.candidate_id
        || row.amount_cents !== -t.amount_cents || row.method !== t.method || row.location_code !== t.location_code
        || row.cycle_name !== t.cycle_name) refuse('bb_payments_reversal_check');
      if (t.kind === 'payment' && hasLiveReturned(db, t.id)) refuse('bb_payments_reversal_returned_check');
    } else if (row.kind === 'returned') {
      const t = findPayment(db, row.reverses_payment_id);
      if (!t || t.kind !== 'payment' || t.method !== 'check' || row.method !== 'check' || row.paid_on !== today()
        || t.candidate_id !== row.candidate_id || row.amount_cents !== -t.amount_cents || row.location_code !== t.location_code
        || row.cycle_name !== t.cycle_name || isReversed(db, t.id)) refuse('bb_payments_returned_check');
    }
    // the net floor: a row that LOWERS the net below zero is refused, except a returned check
    if (row.amount_cents < 0 && netOf(db, row.candidate_id) + row.amount_cents < 0 && row.kind !== 'returned') refuse('bb_payments_net_check');
    // --- the check rules of the table (section 9) ---
    const a = row.amount_cents;
    const items = row.for_items;
    const inRange = (lo, hi) => Number.isInteger(a) && a >= lo && a <= hi;
    const kindOk = (row.kind === 'payment' && inRange(1, 500000) && row.reverses_payment_id === null && Array.isArray(items) && items.length >= 1)
      || (row.kind === 'refund' && inRange(-500000, -1) && row.reverses_payment_id === null && items === null)
      || (row.kind === 'reversal' && inRange(-500000, 500000) && a !== 0 && row.reverses_payment_id !== null && items === null)
      || (row.kind === 'returned' && inRange(-500000, -1) && row.method === 'check' && row.reverses_payment_id !== null && items === null);
    if (!kindOk) refuse('bb_payments_kind_check');
    if (!METHODS.includes(row.method)) refuse('bb_payments_method_check');
    if (items !== null && (!Array.isArray(items) || items.length < 1 || items.length > MAX_FOR_ITEMS
      || items.some((x) => typeof x !== 'string' || !ITEM_PATTERN.test(x)))) refuse('bb_payments_for_items_check');
    for (const col of ['note', 'reason']) {
      if (row[col] !== null && !(noteOk(row[col]) && row[col] === normalizeNote(row[col]))) refuse(`bb_payments_${col}_check`);
    }
    if (!(nameOk(row.cycle_name) && row.cycle_name === normalizeName(row.cycle_name))) refuse('bb_payments_cycle_name_check');
    if (!isIsoDate(row.paid_on) || typeof row.recorded_by_name !== 'string') refuse('bb_payments_not_null');
    // --- "at most once": one undo per row, one returned mark per check (even an undone one) ---
    if (row.kind === 'reversal' && db.bb_payments.some((p) => p.kind === 'reversal' && p.reverses_payment_id === row.reverses_payment_id)) {
      throw new RuleError('stale', 'bb_payments_one_reversal_idx');
    }
    if (row.kind === 'returned' && db.bb_payments.some((p) => p.kind === 'returned' && p.reverses_payment_id === row.reverses_payment_id)) {
      throw new RuleError('stale', 'bb_payments_one_returned_idx');
    }
    // --- the school must exist (foreign key) ---
    if (!locationCodes().includes(row.location_code)) refuse('bb_payments_location_fk');
    db.bb_payments.push(clone(row));
    return row;
  }

  // The checks every payment function makes on its input (15o / 15q): an amount of 1 cent to
  // $5,000, cash / check / card, 1–13 items without a null or a repeat, each p1…p12 / kukkiwon.
  function paymentInputOk(amount, method, forItems) {
    return amount !== null && amount >= 1 && amount <= PAYMENT_MAX_CENTS
      && method !== null && METHODS.includes(method)
      && Array.isArray(forItems) && forItems.length >= 1 && forItems.length <= MAX_FOR_ITEMS
      && forItems.every((x) => typeof x === 'string' && ITEM_PATTERN.test(x))
      && new Set(forItems).size === forItems.length;
  }
  // A note / reason after the database's tidying is fine (null = no note).
  const tidyNoteOk = (note) => note === null || noteIsValid(note);
  // Every ticked item is one the candidate owes under the CURRENT plan (kukkiwon only when chosen).
  const itemsInPlan = (db, c, forItems) => {
    const codes = new Set(itemsRule(itemSpec(db, c)).map((x) => x.item));
    return forItems.every((x) => codes.has(x));
  };
  // A payment function's ok answer: the candidate's new version and money (+ the row's id).
  const moneyAnswer = (db, c, extra = {}) => ({ status: 'ok', ...extra, version: c.version, money: moneyOf(db, c) });

  // The roster's order (16c): Dan, Shrewsbury then Worcester, last name, first name (lower
  // case, compared like the database's en-US collation), then id.
  const collate = (a, b) => collator.compare(String(a ?? '').toLowerCase(), String(b ?? '').toLowerCase());
  const rosterOrder = (x, y) => x.dan - y.dan
    || (x.location_code === 'shrewsbury' ? 0 : 1) - (y.location_code === 'shrewsbury' ? 0 : 1)
    || collate(x.last_name, y.last_name) || collate(x.first_name, y.first_name) || byId(x, y);

  // The first testing day of a candidate's cycle (for "under 18 on the first testing day").
  const firstDayOfCycle = (db, cycleId) => firstDayOf(daysOf(db, cycleId));

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
      makeup_of_candidate_id: null, makeup_of_cycle_name: null, age_kept: null, ...house(FORM_ACTOR, at),
    };
    db.ref_counter += 1;
    db.bb_candidates.push(candidate);
    db.bb_register_log.push({ cycle_id: cycleId, at }); // change_log's bb_public_register row (0024 §6.3)
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
    let result;
    try {
      result = handlers[name](db, parsed, { actorName: ctx.actorName ?? SEED_ACTOR, userId: ctx.userId ?? null, isAdmin: Boolean(ctx.isAdmin) });
    } catch (error) {
      // a table rule said no: nothing this call did is kept (the private copy is dropped)
      if (error instanceof RuleError) return ok(st(error.status));
      throw error;
    }
    if (result.save) write(db);
    return ok(result.answer);
  }

  // ----- Test and console helpers (mockClient.js, publicApi.preview.js, checks.mjs) -----

  function failNextSave() {
    failNext = true;
  }

  // "Another admin" changes every cycle, every candidate and the settings, and saves a new
  // waiver version: open dialogs get 'stale'. 0024: "Sam P." also saves 1st Dan of the default
  // rubric and of every never-opened cycle (Long jump credits 2 → 3, R11), so an open editor
  // gets 'stale' on Save and the toast's Undo of an earlier save gets 'stale' too.
  function simulateOtherAdminEdit() {
    const db = read();
    const at = stamp();
    for (const row of [...db.bb_cycles, ...db.bb_candidates, ...db.bb_settings]) {
      row.version += 1;
      row.updated_at = at;
      row.updated_by_name = 'Other Admin';
    }
    const otherAdmin = { actorName: 'Sam P.', userId: 'preview-other-admin' };
    const edited = otherAdminDanEdit(db.bb_default_rubric[0].sheet.dans[0]);
    if (edited) {
      const row = db.bb_default_rubric[0];
      saveDan(db, otherAdmin, {
        kind: 'default_dan', cycleId: null, doc: row.sheet, dan: 1, expectedRev: row.sheet.dans[0].rev, sheet: edited,
        store: (doc) => updateRow(row, { sheet: doc }, otherAdmin.actorName),
      });
    }
    // (0025: a cycle whose grading started is locked for good, so it isn't edited)
    for (const cycle of db.bb_cycles.filter((c) => c.first_opened_at === null && grading.gradingStartedAt(db, c.id) === null)) {
      const sheet = otherAdminDanEdit(cycle.requirements.dans[0]);
      if (!sheet) continue;
      saveDan(db, otherAdmin, {
        kind: 'cycle_dan', cycleId: cycle.id, doc: cycle.requirements, dan: 1, expectedRev: cycle.requirements.dans[0].rev, sheet,
        store: (doc) => { cycle.requirements = doc; },
      });
    }
    grading.otherAdminGradeEdit(db); // 0025: "Sam P." also changes one grade (the 15-second refresh shows it)
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

  // The other admin's edit of a 1st Dan: Long jump (or the first Physical subject) gets one more
  // credit (2 → 3; 20 goes back to 1), worked-out points follow. null if the result wouldn't be
  // valid (then nothing is saved).
  function otherAdminDanEdit(dan) {
    const d = stripStamps(dan, (dan?.rev ?? 0) + 1);
    const subjects = d?.parts?.[0]?.subjects ?? [];
    const target = subjects.find((s) => s.name === 'Long jump') ?? subjects[0];
    if (!target) return null;
    target.credits = target.credits >= CREDITS_MAX ? 1 : target.credits + 1;
    const out = normalizeDan(d);
    return danProblems(out, 1).length === 0 ? out : null;
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

  // The samples' common start (contract 0016-B1 §2.1): keep-years 3 / 3, the school's waiver
  // 2027-1, Spring 2027 (open, auto close after Mar 27) and Fall 2027 — no candidates yet.
  function sampleBase() {
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
      requirements: freshCopy(DEFAULT_RUBRIC), codeW: newCode(db), codeS: null,
    }, jeffrey, t('2027-01-12'));
    spring.public_code_shrewsbury = newCode(db, [spring.public_code_worcester]);
    Object.assign(spring, { registration_open: true, first_opened_at: t('2027-02-01'), version: 2, updated_at: t('2027-02-01') });
    const fall = writeCycle(db, {
      name: 'Fall 2027', app: '2027-09-25', sub: '2027-11-13', auto: true, days: days('2027-10-02', '2027-10-30', '2027-11-20'),
      plans: plans('2027-09-25', '2027-10-23', '2027-11-13'), fees, pricesFrom: 'Spring 2027',
      requirements: freshCopy(DEFAULT_RUBRIC), codeW: newCode(db), codeS: null,
    }, jeffrey, t('2027-02-10'));
    fall.public_code_shrewsbury = newCode(db, [fall.public_code_worcester]);
    const planId = (name) => db.bb_cycle_plans.find((p) => p.cycle_id === spring.id && p.name === name).id;
    const waiverId = db.bb_waiver_versions.find((v) => v.version_name === '2027-1').id;
    return { db, spring, fall, t, planId, waiverId };
  }

  // The mockups' example (contract 0016-B1 §2.1), for walkthroughs and the design review's
  // screenshots — meant for "today" = Mon, Feb 15, 2027.
  function loadSample() {
    const { db, spring, t, planId, waiverId } = sampleBase();
    // 6 form candidates of Spring 2027, each with a drawn waiver; Daniel is under 18 on Apr 3.
    const people = [
      ['Alex', 'Kim', '1990-06-12', 'alex.kim@example.com', 'shrewsbury', 1, '3 payments', true, 'Alex Kim', '2027-02-02'],
      ['Priya', 'Shah', '1985-11-03', 'priya.shah@example.com', 'worcester', 2, 'In full', false, 'Priya Shah', '2027-02-03'],
      ['Omar', 'Haddad', '1979-01-21', 'omar.haddad@example.com', 'worcester', 1, '3 payments', true, 'Omar Haddad', '2027-02-05'],
      ['Grace', 'Lee', '1992-08-30', 'grace.lee@example.com', 'shrewsbury', 3, '2 payments', false, 'Grace Lee', '2027-02-08'],
      ['Daniel', 'Ortiz', '2012-03-04', 'ortiz.family@example.com', 'shrewsbury', 1, 'In full', false, 'Maria Ortiz', '2027-02-10'],
      ['Hannah', 'Brooks', '1970-04-17', 'hannah.brooks@example.com', 'worcester', 4, 'In full', true, 'Hannah Brooks', '2027-02-12'],
    ];
    for (const [first, last, dob, email, school, dan, plan, kukkiwon, signer, on] of people) {
      const at = t(on, '19:15');
      const c = {
        id: newId(), cycle_id: spring.id, first_name: first, last_name: last, date_of_birth: dob, email_for_results: email,
        personal_removed_at: null, location_code: school, dan, cycle_plan_id: planId(plan), kukkiwon, kukkiwon_added_on: kukkiwon ? on : null,
        source: 'form', reference: `BB-${db.ref_counter}`, registered_at: at, status: 'active', withdrawn_reason: null, withdrawn_at: null,
        withdrawn_by_name: null, withdrawn_by: null, duplicate_state: 'none', duplicate_of: null, makeup_of_candidate_id: null,
        makeup_of_cycle_name: null, age_kept: null, ...house(FORM_ACTOR, at),
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

  // ----- Phase B2 samples and console helpers (contract 0016-B2 §2.3–§2.4) -----
  // Made-up people only. Every timestamp is fixed (t()), so the samples look the same on any
  // day; they are meant for "today" = Mon, Apr 26, 2027 (setToday('2027-04-26')).

  // Adds one sample candidate to a sample store (sampleBase's), with their waiver and payments.
  // p: { first, last, dob, email, school, dan, plan, kukkiwon, on (registered), source ('form' |
  //      'desk'), signer (drawn waivers), signedAsMinor (only to force the "signed as an adult"
  //      case), payments: [[date, method, cents, items, note?]], withdrawn: { on, by } }
  //      0025: cycle (another sample cycle than Spring 2027, e.g. Fall 2027)
  function addSampleCandidate(base, p) {
    const { db, t, waiverId } = base;
    const spring = p.cycle ?? base.spring; // (the cycle this row goes on)
    const planId = (name) => db.bb_cycle_plans.find((x) => x.cycle_id === spring.id && x.name === name).id;
    const at = t(p.on, '19:15');
    const dup = findDuplicate(db, spring.id, null, p.first, p.last, p.dob);
    const c = {
      id: newId(), cycle_id: spring.id, first_name: p.first, last_name: p.last, date_of_birth: p.dob, email_for_results: p.email,
      personal_removed_at: null, location_code: p.school, dan: p.dan, cycle_plan_id: planId(p.plan), kukkiwon: p.kukkiwon,
      kukkiwon_added_on: p.kukkiwon ? p.on : null, source: p.source ?? 'form', reference: `BB-${db.ref_counter}`, registered_at: at,
      status: 'active', withdrawn_reason: null, withdrawn_at: null, withdrawn_by_name: null, withdrawn_by: null,
      duplicate_state: dup ? 'possible' : 'none', duplicate_of: dup, makeup_of_candidate_id: null, makeup_of_cycle_name: null, age_kept: null,
      ...house(p.source === 'desk' ? 'Staff' : FORM_ACTOR, at),
    };
    db.ref_counter += 1;
    db.bb_candidates.push(c);
    const age = ageOn(p.dob, firstDayOfCycle(db, spring.id));
    const drawn = (p.source ?? 'form') === 'form';
    db.bb_candidate_waivers.push({
      id: newId(), candidate_id: c.id, waiver_version_id: waiverId, how: drawn ? 'drawn' : 'paper', submission_id: drawn ? newId() : null,
      acknowledged: true, signed_as_minor: p.signedAsMinor ?? (age !== null && age < 18), signer_name: drawn ? p.signer ?? `${p.first} ${p.last}` : null,
      signature: drawn ? SAMPLE_SIGNATURE : null, ticked_by_name: drawn ? null : 'Staff', signed_at: at, removed_at: null,
      ...house(drawn ? FORM_ACTOR : 'Staff', at),
    });
    if (dup) recheckDuplicate(db, dup);
    // payments, through the same rules as the functions (insertPayment), "recorded by Staff"
    (p.payments ?? []).forEach(([date, method, cents, items, note = null], i) => {
      insertPayment(db, paymentRow({
        candidate_id: c.id, cycle_id: spring.id, kind: 'payment', amount_cents: cents, method, paid_on: date, for_items: items, note,
        location_code: c.location_code, cycle_name: spring.name, recorded_at: t(date, `17:${String(30 + i).padStart(2, '0')}`),
        recorded_by: null, recorded_by_name: 'Staff',
      }));
      c.version += 1; // each payment raises the candidate's version, as bb_record_payment does
    });
    if (p.withdrawn) {
      Object.assign(c, {
        status: 'withdrawn', withdrawn_reason: 'withdrawn', withdrawn_at: t(p.withdrawn.on, '11:00'), withdrawn_by_name: p.withdrawn.by,
        withdrawn_by: null, version: c.version + 1, updated_at: t(p.withdrawn.on, '11:00'), updated_by_name: p.withdrawn.by,
      });
      recheckPointingAt(db, c.id);
    }
    return c;
  }

  // Candidates 1 (the mockups): 9 rows. On Apr 26: cards 2 · 2 · 2 · 1 + 2 duplicates left out.
  const ROSTER_PEOPLE = [
    { first: 'Bao', last: 'Nguyen', dob: '1988-07-19', email: 'bao.nguyen@example.com', school: 'shrewsbury', dan: 3, plan: '3 payments', kukkiwon: true, on: '2027-03-01',
      payments: [['2027-03-27', 'check', 64000, ['p1', 'kukkiwon']]] },
    { first: 'Mia', last: 'Chen', dob: '1995-02-11', email: 'mia.chen@example.com', school: 'worcester', dan: 1, plan: '3 payments', kukkiwon: false, on: '2027-03-04',
      payments: [['2027-03-20', 'card', 87000, ['p1', 'p2', 'p3']]] },
    { first: 'Sam', last: 'Lee', dob: '1983-10-02', email: 'sam.lee@example.com', school: 'worcester', dan: 2, plan: '3 payments', kukkiwon: false, on: '2027-03-08',
      payments: [['2027-03-27', 'check', 33000, ['p1']]] },
    { first: 'Alex', last: 'Kim', dob: '2012-03-04', email: 'kim.family@example.com', school: 'shrewsbury', dan: 1, plan: '3 payments', kukkiwon: true, on: '2027-03-10',
      signer: 'Jordan Kim',
      payments: [
        ['2027-03-27', 'check', 39000, ['p1', 'kukkiwon']],
        ['2027-03-27', 'check', 29000, ['p2'], 'post-dated Apr 24'],
        ['2027-03-27', 'check', 29000, ['p3'], 'post-dated May 29'],
      ] },
    { first: 'Ava', last: 'Brooks', dob: '1991-05-23', email: 'ava.brooks@example.com', school: 'shrewsbury', dan: 2, plan: '3 payments', kukkiwon: false, on: '2027-03-12',
      payments: [['2027-03-27', 'cash', 33000, ['p1']], ['2027-04-24', 'cash', 33000, ['p2']]] },
    { first: 'Leo', last: 'Garcia', dob: '1976-12-08', email: 'leo.garcia@example.com', school: 'shrewsbury', dan: 4, plan: '2 payments', kukkiwon: false, on: '2027-03-15',
      payments: [['2027-03-27', 'check', 135000, ['p1']]] },
    { first: 'Noah', last: 'Silva', dob: '1999-09-14', email: 'noah.silva@example.com', school: 'worcester', dan: 2, plan: '3 payments', kukkiwon: false, on: '2027-03-25' },
    { first: 'Noah', last: 'Silva', dob: '1999-09-14', email: 'noah.silva@example.com', school: 'worcester', dan: 2, plan: '3 payments', kukkiwon: true, on: '2027-03-25' },
    { first: 'Rina', last: 'Patel', dob: '1997-04-30', email: 'rina.patel@example.com', school: 'worcester', dan: 1, plan: 'In full', kukkiwon: false, on: '2027-03-26' },
  ];
  // Candidates 9 and the cases the mockups don't draw (bbSampleEdge).
  const EDGE_PEOPLE = [
    { first: 'Omar', last: 'Haddad', dob: '1979-01-21', email: 'omar.haddad@example.com', school: 'shrewsbury', dan: 2, plan: '3 payments', kukkiwon: true, on: '2027-03-05',
      payments: [['2027-03-27', 'check', 33000, ['p1']], ['2027-03-27', 'check', 33000, ['p2']], ['2027-03-27', 'check', 33000, ['p3']]] },
    { first: 'Owen', last: 'Price', dob: '1986-03-17', email: 'owen.price@example.com', school: 'worcester', dan: 1, plan: 'In full', kukkiwon: false, on: '2027-03-06',
      payments: [['2027-03-20', 'cash', 20000, ['p1']]], withdrawn: { on: '2027-04-02', by: 'Jeffrey Berg' } },
    { first: 'Lily', last: 'Tran', dob: '1993-06-28', email: 'lily.tran@example.com', school: 'shrewsbury', dan: 1, plan: '3 payments', kukkiwon: true, on: '2027-03-18',
      payments: [['2027-03-27', 'card', 39000, ['p1', 'kukkiwon']], ['2027-04-24', 'card', 29000, ['p2']]] },
    { first: 'Grace', last: 'Owens', dob: '1990-11-09', email: 'grace.owens@example.com', school: 'worcester', dan: 1, plan: 'In full', kukkiwon: false, on: '2027-03-19',
      payments: [['2027-03-20', 'check', 92000, ['p1'], 'check written for $920']] },
    // under 18 on Apr 3, but the form's waiver was signed as an adult (a DOB fixed later) →
    // "needs a parent's signature"
    { first: 'Zoe', last: 'Martin', dob: '2010-08-15', email: 'martin.family@example.com', school: 'shrewsbury', dan: 1, plan: '3 payments', kukkiwon: false, on: '2027-03-22',
      signedAsMinor: false, payments: [['2027-03-27', 'card', 29000, ['p1']]] },
    // added at the desk with a paper waiver
    { first: 'Tom', last: 'Reyes', dob: '1981-02-14', email: 'tom.reyes@example.com', school: 'worcester', dan: 3, plan: 'In full', kukkiwon: false, on: '2027-04-20',
      source: 'desk', payments: [['2027-04-20', 'card', 150000, ['p1']]] },
  ];

  // Writes a sample: B1's base (settings, waiver 2027-1, Spring + Fall 2027 — registration is
  // closed by its date on Apr 26) and the given people, in registration order (so the BB-
  // references count up the way they would have).
  function loadPeopleSample(people) {
    const base = sampleBase();
    for (const p of [...people].sort((x, y) => cmp(x.on, y.on))) addSampleCandidate(base, p);
    write(base.db);
  }
  function loadSampleRoster() {
    loadPeopleSample(ROSTER_PEOPLE);
  }
  function loadSampleEdge() {
    loadPeopleSample([...ROSTER_PEOPLE, ...EDGE_PEOPLE]);
  }

  // bbExpireUndo: moves the newest payment row's recorded_at 11 seconds back (with any row
  // written in the same moment, so an Edit's pair stays a pair), so a staff Undo now answers
  // not_allowed. A TEST helper, like the SQL test writing an 11-second-old row by hand — no
  // database function can change a payment row. → { kind, amountCents } or null (no rows).
  // 0024: it also makes the newest rubric undo slot (a Dan save or a first opening) 16 seconds
  // old, so that toast's Undo answers stale ("too late").
  // 0025: it also makes the newest Mark as sent 11 seconds old, so a staff Undo of it answers not_allowed.
  function expireUndo() {
    const db = read();
    const slot = [...db.bb_rubric_undo].sort((a, b) => cmp(b.saved_at, a.saved_at) || -byId(a, b))[0];
    if (slot) slot.saved_at = stamp(clock() - 16 * 1000);
    const sendMoved = grading.expireNewestSend(db);
    if (slot || sendMoved) write(db);
    const newest = db.bb_payments.filter((p) => p.kind !== 'reversal').sort((a, b) => cmp(b.recorded_at, a.recorded_at) || -byId(a, b))[0];
    if (!newest) return null;
    const at = newest.recorded_at;
    const moved = stamp(Date.parse(at) - 11 * 1000);
    for (const p of db.bb_payments) if (p.recorded_at === at) p.recorded_at = moved;
    write(db);
    return { kind: newest.kind, amountCents: newest.amount_cents };
  }

  // bbAddDuplicate: a family-form registration with the same names and date of birth as the
  // first active candidate (roster order) of the newest cycle → both show "Possible duplicate".
  // → { name, reference } (never the date of birth) or null (no candidate to copy).
  function addDuplicate() {
    const db = read();
    const cycle = [...db.bb_cycles].sort((a, b) => cmp(b.created_at, a.created_at) || -byId(a, b))[0];
    if (!cycle) return null;
    const source = candidatesOf(db, cycle.id).filter((c) => c.status === 'active' && c.date_of_birth !== null).sort(rosterOrder)[0];
    if (!source) return null;
    const at = stamp();
    const dup = findDuplicate(db, cycle.id, null, source.first_name, source.last_name, source.date_of_birth);
    const copy = {
      ...clone(source), id: newId(), email_for_results: 'second.copy@example.com', kukkiwon: false, kukkiwon_added_on: null,
      source: 'form', reference: `BB-${db.ref_counter}`, registered_at: at, duplicate_state: dup ? 'possible' : 'none', duplicate_of: dup,
      ...house(FORM_ACTOR, at),
    };
    db.ref_counter += 1;
    db.bb_candidates.push(copy);
    const age = ageOn(copy.date_of_birth, firstDayOfCycle(db, cycle.id));
    const minor = age !== null && age < 18;
    db.bb_candidate_waivers.push({
      id: newId(), candidate_id: copy.id, waiver_version_id: currentWaiver(db).id, how: 'drawn', submission_id: newId(), acknowledged: true,
      signed_as_minor: minor, signer_name: minor ? 'Sample Parent' : `${copy.first_name} ${copy.last_name}`, signature: SAMPLE_SIGNATURE,
      ticked_by_name: null, signed_at: at, removed_at: null, ...house(FORM_ACTOR, at),
    });
    if (dup) recheckDuplicate(db, dup);
    write(db);
    return { name: `${copy.first_name} ${copy.last_name}`, reference: copy.reference };
  }

  // 0025: the Grading and Results mockups' shared cast (docs/Testing/Black Belt Testing/
  // TKD-BlackBelt-Mockup-Cast.json — passed in, so this file reads no files): Spring 2027 graded as
  // of Wed, Jun 9, 2027, and Fall 2027 with Mia Chen's make-up (contract §13.3). Made-up people only.
  // The rows' DOBs give the cast's ages on Apr 3, 2027; payments as the Candidates sample.
  const GRADING_PEOPLE = {
    'Lucas Ferreira': { dob: '2015-09-12', email: 'ferreira.family@example.com', plan: '3 payments', kukkiwon: false, on: '2027-03-21', signer: 'Ana Ferreira',
      payments: [['2027-03-27', 'card', 29000, ['p1']], ['2027-04-24', 'card', 29000, ['p2']]] },
    'Chloe Bennett': { dob: '2015-05-20', email: 'bennett.family@example.com', plan: '3 payments', kukkiwon: false, on: '2027-09-12', signer: 'Kate Bennett' },
    'Marcus Hall': { dob: '1986-01-30', email: 'marcus.hall@example.com', plan: 'In full', kukkiwon: false, on: '2027-09-15' },
  };
  function loadGradingSample(cast) {
    if (!isObj(cast) || !Array.isArray(cast.candidates)) throw new Error('loadGradingSample: no cast');
    const base = sampleBase();
    const people = { ...GRADING_PEOPLE };
    for (const p of [...ROSTER_PEOPLE, ...EDGE_PEOPLE]) {
      const name = `${p.first} ${p.last}`;
      if (!people[name]) people[name] = { dob: p.dob, email: p.email, plan: p.plan, kukkiwon: p.kukkiwon, on: p.on, signer: p.signer, payments: p.payments, signedAsMinor: p.signedAsMinor };
    }
    grading.writeGradingSample(base, cast, people, addSampleCandidate);
    write(base.db);
  }

  // ----- 0025: grading and results (mockGrading.js), sharing this file's store and helpers -----
  const grading = createGradingPart({
    newId, stamp, clock, today, house, updateRow, findCycle, findCandidate, daysOf, partsOf, stateOf, rosterOrder, collate,
    recheckDuplicate, recheckPointingAt, findDuplicate, purge, moneyOf, settings, purgeDueOnOwn, SEED_ACTOR,
  });
  Object.assign(handlers, handlers2, grading.handlers);

  return {
    rpc, select, publicCycle, publicRegister, snapshot: read, reset, loadSample, failNextSave, simulateOtherAdminEdit,
    waiverChanged, links, loadSampleRoster, loadSampleEdge, expireUndo, addDuplicate, loadGradingSample,
  };
}
