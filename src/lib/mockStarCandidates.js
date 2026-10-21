// mockStarCandidates.js — the PREVIEW (fake) database for Star testing candidates and payments
// (build phase 3).
// Why it exists: preview mode (npm run dev:preview-mode) runs without Supabase. This file pretends to
// be the part of migration 0006 that the Candidates tab uses:
//   tables   star_candidates (§2.4), star_candidate_signatures (§2.5), star_makeup_subjects (§2.6),
//            star_payments (§2.7, append-only), star_grades (§2.8; written by the grading functions),
//            star_result_emails (§2.9), and the change log (History)
//   view     star_roster (§2.12) — fee, paid and overpaid worked out like the database
//   writes   the 13 functions of §6.3–§6.4 (add, make-up, edit, paying by, duplicates, private,
//            withdraw, restore, delete, record / undo / edit payment, refund)
//   reads    star_candidate_detail, star_candidate_history, star_view_signature, star_makeup_list (§7)
//   grading  star_set_grade, star_set_count, star_set_makeup_subjects, star_event_results,
//            star_age_groups (§6.5, §7 — phase 5): written in mockStarGrading.js and plugged in here
//            (handlerFor), so they share this store and its change log
//   results  star_mark_result_sent, star_undo_result_sent, star_results_csv (§6.6) and
//            star_set_result_text (migration 0023) — phase 6: written in mockStarResults.js and
//            plugged in the same way; the tables star_grades, star_result_emails and
//            star_result_texts can be read (granted columns only) for the late-grade note, the CSV
//            and the result email texts
//   public   star_public_event, star_public_register (§8.2, §8.3 — the family form, phase 4; called
//            only by src/lib/star/publicApi.preview.js, as publicEvent() / publicRegister())
// It follows the SAME rules as the SQL: the same order of checks (§1.1), the same answers, the same
// staff / admin split (S7, S8, the 10-second Undo windows), the same table rules (one active make-up
// per earlier candidate, a payment total that never goes below zero). The fee and result rules come
// from star/feeRules.js and star/resultRules.js (pure, checked by candidatesChecks.mjs).
//
// Like the other Star fakes it is a "pure core": it never touches the browser by itself.
//   const starCandidates = createStarCandidatesBackend({ readBase, saveStore, now, today, newId });
//     readBase()  → the whole Star preview store (mockStarEvents' snapshot(): rubric template, events
//                   and everything below); this file's seed when the candidates part is missing
//     saveStore() → saves the whole store (mockClient: localStorage 'tkd.preview.star')
//   starCandidates.select(table, columns, filters, orders, ctx)          star_roster, star_makeup_subjects
//   starCandidates.rpc(name, args, ctx, options)   ctx = { signedIn, hasDataAccess, isAdmin, actorName, userId }
//     options.get = true (a read-only GET request) makes every function that WRITES fail like
//     PostgREST does (star_makeup_list included: it runs the signature clean-up, contract §7).
//
// The store lists (snake_case database columns), next to the events part of mockStarEvents.js:
//   candidates, payments, signatures, makeup_subjects, candidate_grades, result_emails, change_log,
//   next_reference, next_log_seq, candidates_schema
// mockStarEvents.js's Delete event removes the same lists' rows (by candidate_id).
//
// THE SEED (made-up names only; dates worked out from "today"; it replaces mockStarEvents' simple
// phase 2 seed — the app passes defaultStarCandidatesData to mockStarEvents as its seed):
//   Summer Star Testing — PAST (100 days ago), results finished: Morgan Hale passed; Taylor Quinn owes a
//       make-up (D in Breaking); Grace Liu owes one (D) and was ADDED to Fall as a make-up; Drew Park
//       scored below 245 and an admin chose his subjects; Avery Lin scored below 245 with no subjects
//       chosen yet ("Can't add yet", OPEN-11); Casey Lund withdrew before the day. Their family-form
//       signatures were removed 90 days after the testing day.
//   Fall Star Testing — UPCOMING (in 26 days), registration open: paid (Mia Patel, Noah Chen, Jordan
//       Kim), not paid (Lily Brooks, Ethan Lopez, Sam Ortiz — a walk-in with no date of birth),
//       OVERPAID (Chris Kim: paid the private fee, then Back to the testing day → $20 overpaid), a
//       possible DUPLICATE (Ava Reed twice), PRIVATE (Ruby Diaz, paid the private fee), WITHDRAWN (Owen
//       Hart) and a MAKE-UP (Grace Liu, kept grades + retest Two Step Sparring).
//       Phase 5 added grading states (appended at the end of the seed, so earlier ids stay the same):
//       Sofia Reyes (Summer: D in Breaking and Korean Terminology; in Fall a make-up retesting those
//       two, Breaking graded → "1 of 2 left"), Alex Kim testing privately (half graded), and on Fall's
//       1st Dan grid: Chris Kim Passed, Noah Chen D in Breaking, Ethan Lopez below 245 (choice
//       needed), Sam Ortiz below 245 with Breaking and Knowledge chosen, Ava Reed "7 of 11 left";
//       Mia Patel, Lily Brooks, the desk's Ava Reed and Jordan Kim (2nd Dan) not started. Fall's
//       make-ups now also show on Spring's make-up list (Fall is earlier than Spring).
//   Spring Star Testing — UPCOMING (in 180 days), not open yet, no candidates: its make-up list shows
//       Taylor, Drew and Avery (Grace is already a make-up in Fall, so she is left out).
//   Phase 6 added Results states to Summer (appended at the end, so earlier ids stay the same): Morgan
//       Hale sent by Staff then re-sent by Jeffrey ("Sent … · Jeffrey"; an admin's Undo falls back to
//       "Sent … · Staff"), Lucas Grant Passed and not sent, Nina Ford Passed with Korean Terminology
//       graded 3 days late, Ben Ward Not finished (Korean Terminology not graded yet), Zoe Bell
//       testing privately in 5 days (partly graded), Ivy Cole graded on her private day 2 days after
//       the testing day, Taylor Quinn's make-up sent ("Sent … · Staff"), Ella Moss's make-up sent and
//       then corrected to Passed ("Not sent yet · an earlier Make-up result was sent …"). With Grace Liu / Sofia Reyes (D, Sofia also below 245), Drew Park
//       (below, chosen) and Avery Lin (below, an admin chooses), every Results state is on Summer.
//       Plus the three result email texts (migration 0023's seed) and an empty download log.
// The seed is made by running this file's own functions at past times (so its History, versions and
// signatures are exactly what the functions would have written).
import { normalizeName, nameProblem, nameKey } from './testing/names.js';
import { eventState, isIsoDate, addDays, todayInSchoolTime, publicStateFor, signatureIsValid, FORM_PAYING_BY } from './testing/eventRules.js';
import { startTimeIsValid, STAR_ACK_VERSION, STAR_CODE_PATTERN } from './star/starEventRules.js';
import { STAR_EVENTS_SCHEMA, SEED_EVENT_IDS, copyStarTemplateInto } from './mockStarEvents.js';
import { paymentSummary, netPaidCents, reversedIds, hasUnreversedRefund } from './star/feeRules.js';
import { candidateResult, ageOn } from './star/resultRules.js';
import { starEmailIsValid, trimEmail } from './star/emailRule.js';
import {
  createGradingHandlers, GRADING_RPC_ARGS, STAR_GRADING_RPC_NAMES, STAR_GRADING_READ_RPC_NAMES, STAR_GRADING_ADMIN_ONLY,
} from './mockStarGrading.js';
import {
  createResultsHandlers, RESULTS_RPC_ARGS, STAR_RESULTS_RPC_NAMES, STAR_RESULTS_ADMIN_ONLY, seedResultTexts,
} from './mockStarResults.js';

// Raised whenever the stored shape of the candidates part changes (older data → the seed).
export const STAR_CANDIDATES_SCHEMA = 1;
const UNDO_WINDOW_MS = 10 * 1000; // staff's own payment / "keep one" Undo (§6.3, §6.4)
const SIGNATURE_KEEP_DAYS = 90; // signatures are removed 90 days after the testing day (§5.7)
const ACK_VERSION = STAR_ACK_VERSION; // the acknowledgment wording's label (OPEN-3, starEventRules.js)
const DAY_MS = 24 * 60 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INT_MAX = 2147483647;
const SCHOOLS = ['worcester', 'shrewsbury'];
const METHODS = ['cash', 'check', 'card'];
const REFUND_METHODS = ['cash', 'check'];
// A made-up drawn signature (a small PNG squiggle) for the seeded family-form rows.
const SEED_SIGNATURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHgAAAAkCAAAAABnQ6GCAAAAuElEQVR42u3WQQ7EIAgF0H+Sf/9bdhaTiY2CQgu6GNzVqs8StOA61FBwwX8L89f2wry3jXDz4mQYXfkhF+6oIBleN0qG2w2S4Xe/vcmw9nEL2XDw1rBrQ/ZDj0fuRG7gnEab4AuosiaHQ88lzMuVvVRmcNEzhHoYQEMGCVE2bh8vbqjOoSn6UnL57+Tu7+HJRMgDrH8h2s6O8BbqOqEVwjgC2ZWGlnlIuYinsTlQ7B2Dq64uuOCU9gFrVrejc2xR7AAAAABJRU5ErkJggg==';

// ----- Table permissions (contract 0006 §4.1 / §4.2) -----
const HOUSE = ['version', 'created_at', 'updated_at', 'created_by_name', 'updated_by_name'];
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
// /*#__PURE__*/ (() => …)(): "this has no side effects", so the live build (which never makes the fake
// client) can drop these lines — the same trick as mockStarTesting.js.
const GRANTED = /*#__PURE__*/ (() => ({
  star_roster: ROSTER_COLUMNS,
  star_makeup_subjects: ['id', 'candidate_id', 'event_category_id', 'kind', ...HOUSE],
  // Phase 6 (Results): the grade rows' dates (the late-grade note), the sends (the CSV's result
  // words) and the result email texts (migration 0023) — granted columns only (§4.1, 0023 §3).
  star_grades: ['id', 'candidate_id', 'event_category_id', 'grade', 'kept', 'kept_from_event_id', 'kept_from_event_name', ...HOUSE],
  star_result_emails: [
    'id', 'candidate_id', 'marked_at', 'marked_by_name', 'result_status', 'result_total', 'result_needs', 'result_key',
    'sent_via', 'undone_at', 'undone_by_name',
  ],
  star_result_texts: ['id', 'kind', 'body', ...HOUSE],
}))();
// Columns that exist but are never granted (login ids). The roster view has no DOB / email at all.
const HIDDEN = {
  star_roster: [], star_makeup_subjects: ['created_by', 'updated_by'], star_grades: ['created_by', 'updated_by'],
  star_result_emails: ['marked_by', 'undone_by'], star_result_texts: ['created_by', 'updated_by'],
};
// Which store list answers each table (the roster view is worked out per candidate instead).
const SELECT_LIST = { star_makeup_subjects: 'makeup_subjects', star_grades: 'candidate_grades', star_result_emails: 'result_emails', star_result_texts: 'result_texts' };
export const STAR_CANDIDATE_TABLES = /*#__PURE__*/ Object.keys(GRANTED);

// ----- The functions' argument lists (name, type) — the same names as migration 0006 -----
// The real API finds a function by its argument NAMES: a missing or extra one = "no such function".
const RPC_ARGS = /*#__PURE__*/ (() => ({
  star_add_candidate: [
    ['p_event_id', 'uuid'], ['p_first', 'text'], ['p_last', 'text'], ['p_date_of_birth', 'date'], ['p_email', 'text'],
    ['p_location_code', 'text'], ['p_dan', 'int'], ['p_stars_from', 'int'], ['p_paying_by', 'text'],
  ],
  star_add_makeup: [['p_event_id', 'uuid'], ['p_earlier_candidate_id', 'uuid']],
  star_update_candidate: [
    ['p_candidate_id', 'uuid'], ['p_expected_version', 'int'], ['p_first', 'text'], ['p_last', 'text'],
    ['p_date_of_birth', 'date'], ['p_email', 'text'], ['p_location_code', 'text'], ['p_dan', 'int'],
    ['p_stars_from', 'int'], ['p_clear_grade_count', 'int'],
  ],
  star_change_paying_by: [['p_candidate_id', 'uuid'], ['p_expected_version', 'int'], ['p_paying_by', 'text']],
  star_resolve_duplicate: [
    ['p_keep_id', 'uuid'], ['p_keep_version', 'int'], ['p_other_id', 'uuid'], ['p_other_version', 'int'], ['p_keep_both', 'bool'],
  ],
  star_set_private: [['p_candidate_id', 'uuid'], ['p_expected_version', 'int'], ['p_private_on', 'date'], ['p_private_time', 'time']],
  star_withdraw_candidate: [['p_candidate_id', 'uuid'], ['p_expected_version', 'int']],
  star_restore_candidate: [['p_candidate_id', 'uuid'], ['p_expected_version', 'int']],
  star_delete_candidate: [['p_candidate_id', 'uuid'], ['p_expected_version', 'int'], ['p_expected_payment_ids', 'uuid[]']],
  star_record_payment: [
    ['p_candidate_id', 'uuid'], ['p_expected_version', 'int'], ['p_method', 'text'], ['p_amount_cents', 'int'], ['p_paid_on', 'date'],
  ],
  star_undo_payment: [['p_payment_id', 'uuid']],
  star_edit_payment: [['p_payment_id', 'uuid'], ['p_method', 'text'], ['p_amount_cents', 'int'], ['p_paid_on', 'date']],
  star_record_refund: [
    ['p_candidate_id', 'uuid'], ['p_expected_version', 'int'], ['p_method', 'text'], ['p_amount_cents', 'int'], ['p_refunded_on', 'date'],
  ],
  star_candidate_detail: [['p_candidate_id', 'uuid']],
  star_candidate_history: [['p_candidate_id', 'uuid']],
  star_view_signature: [['p_candidate_id', 'uuid']],
  star_makeup_list: [['p_event_id', 'uuid']],
  // Phase 5: the grading functions (§6.5) and the grading reads (§7) — mockStarGrading.js.
  ...GRADING_RPC_ARGS,
  // Phase 6: Mark as sent, its Undo, the CSV (§6.6) and the result email texts (0023) — mockStarResults.js.
  ...RESULTS_RPC_ARGS,
}))();
export const STAR_CANDIDATE_RPC_NAMES = /*#__PURE__*/ Object.keys(RPC_ARGS);
// The 13 write functions (§6.3–§6.4) — failNextSave('star') targets these, not the reads. (The three
// grading writes are listed apart, as mockStarGrading.js's STAR_GRADING_WRITE_RPC_NAMES, and the four
// results writes as mockStarResults.js's STAR_RESULTS_RPC_NAMES.)
const READS = ['star_candidate_detail', 'star_candidate_history', 'star_view_signature', 'star_makeup_list'];
export const STAR_CANDIDATE_WRITE_RPC_NAMES = /*#__PURE__*/ Object.keys(RPC_ARGS)
  .filter((n) => !READS.includes(n) && !STAR_GRADING_RPC_NAMES.includes(n) && !STAR_RESULTS_RPC_NAMES.includes(n));
// Functions that run read-only and so also work as a GET request (§7: "stable"). Every other one
// writes something (star_makeup_list: the signature clean-up).
const STABLE = /*#__PURE__*/ (() => new Set(['star_candidate_detail', 'star_candidate_history', 'star_view_signature', ...STAR_GRADING_READ_RPC_NAMES]))();
// Admin only from the start ("A" in §6.3–§6.4). star_restore_candidate and star_undo_payment have
// mixed rules (admins, or the same staff member within 10 seconds) checked inside; star_update_candidate
// checks "a Dan change on a paid row" inside (S8).
const ADMIN_ONLY = /*#__PURE__*/ (() => new Set(['star_withdraw_candidate', 'star_delete_candidate', 'star_edit_payment', 'star_record_refund', ...STAR_GRADING_ADMIN_ONLY, ...STAR_RESULTS_ADMIN_ONLY]))();

// Thrown inside this file only, turned into a { data:null, error } answer.
class DbError extends Error {
  constructor(code, message, httpStatus = 400) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}
// A table rule saying no (a unique index, a check). The functions turn it into a status (§1.4), and
// everything the call did is undone (it worked on a private copy).
class TableRule extends Error {
  constructor(kind, constraint) {
    super(`${kind} violation: ${constraint}`);
    this.kind = kind; // 'unique' | 'check'
    this.constraint = constraint;
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
      const m = typeof value === 'string' ? TIME_TEXT.exec(value) : null;
      if (!m) throw new DbError('22007', `invalid input syntax for type time: "${value}"`);
      return `${m[1]}:${m[2]}:${m[3] ?? '00'}`;
    }
    case 'uuid[]':
      if (!Array.isArray(value)) throw new DbError('22P02', `malformed array literal: "${value}"`);
      return value.map((item) => toDbType(item, 'uuid'));
    default:
      throw new Error(`unknown type ${type}`);
  }
}

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
const iso = (ms) => new Date(ms).toISOString();
const nameIsValid = (name) => name !== null && nameProblem(name) === null;
const between = (n, low, high) => n !== null && n >= low && n <= high;
// star_ids_are_valid: not null, no null entry, no id twice (an empty list is fine).
const idsAreValid = (ids) => Array.isArray(ids) && ids.every((x) => x !== null) && new Set(ids).size === ids.length;
// The Massachusetts date of a moment (testing_school_date) — "the day the candidate registered".
const schoolDateOf = (stamp) => todayInSchoolTime(Date.parse(stamp));

// The store lists, by table name. Tables with house columns (version, created_* / updated_*) and the
// columns whose change never raises the version (§2.11: class counts, the signature clean-up).
const LISTS = {
  star_candidates: 'candidates', star_payments: 'payments', star_candidate_signatures: 'signatures',
  star_makeup_subjects: 'makeup_subjects', star_grades: 'candidate_grades', star_result_emails: 'result_emails',
  star_result_texts: 'result_texts',
};
const HOUSE_TABLES = new Set(['star_candidates', 'star_candidate_signatures', 'star_makeup_subjects', 'star_grades', 'star_result_texts']);
const NO_BUMP = { star_candidates: ['classes_attended', 'assistant_classes'], star_candidate_signatures: ['signature', 'signature_deleted_at'] };
const BOOKKEEPING = ['version', 'created_at', 'updated_at', 'created_by', 'updated_by', 'created_by_name', 'updated_by_name'];
// The child tables History finds through their insert rows (§7).
const CHILD_TABLES = ['star_payments', 'star_grades', 'star_makeup_subjects', 'star_result_emails', 'star_candidate_signatures'];
// Login-id keys History never shows (star_history_strip).
const LOGIN_ID_KEYS = ['created_by', 'updated_by', 'withdrawn_by', 'recorded_by', 'marked_by', 'undone_by'];

// ===== The table layer: inserts, updates and deletes that run the "triggers" =====
// env = { today(): 'YYYY-MM-DD', now(): ms, newId() } · meta = { at, actor, userId, action, batch }
// (who and when, the action tag and the batch id — like tkd.action / tkd.batch_id, §1.1).

function newMeta(env, ctx, action) {
  return { at: iso(env.now()), actor: ctx.actorName, userId: ctx.userId ?? null, action, batch: env.newId() };
}

// What the change log stores for a row: the signatures table's own log trigger writes the signature
// as "on file" / null and leaves the submission id out (§2.5).
function logShape(table, values) {
  if (!values || table !== 'star_candidate_signatures') return values;
  const shaped = { ...values };
  delete shaped.submission_id;
  if ('signature' in shaped) shaped.signature = shaped.signature === null ? null : 'on file';
  return shaped;
}

function writeLog(db, env, meta, table, op, before, after, row) {
  // copies, so a later change to the row in the same call can't change what was logged
  const b = logShape(table, before && { ...before });
  const a = logShape(table, after && { ...after });
  if (op === 'update') {
    // keep only what still differs after shaping; nothing visible → no row (as the SQL)
    for (const key of Object.keys(a ?? {})) if (JSON.stringify(a[key]) === JSON.stringify(b?.[key])) { delete a[key]; delete b[key]; }
    if (Object.keys(a ?? {}).length === 0) return;
  }
  db.next_log_seq = (db.next_log_seq ?? 0) + 1;
  db.change_log.push({
    seq: db.next_log_seq, id: env.newId(), occurred_at: meta.at, actor_id: meta.userId, actor_name: meta.actor,
    session_id: null, batch_id: meta.batch, action: meta.action, table_name: table, record_id: row.id,
    location_code: row.location_code ?? null, op, before: b, after: a,
  });
}

// The table rules that can say no (contract §2.4, §2.7) — run after every insert / update.
function checkTableRules(db, table, row) {
  if (table === 'star_candidates' && row.is_makeup && row.status === 'active' && row.makeup_of_candidate_id) {
    const other = db.candidates.some((c) => c.id !== row.id && c.is_makeup && c.status === 'active'
      && c.makeup_of_candidate_id === row.makeup_of_candidate_id);
    if (other) throw new TableRule('unique', 'star_candidates_one_active_makeup_idx');
  }
}

// The payments guard (star_payments_guard): a reversal undoes a payment or refund of the SAME
// candidate for exactly minus its amount, once; the net total never goes below zero.
function checkPaymentInsert(db, row) {
  if (row.kind === 'reversal') {
    const target = db.payments.find((p) => p.id === row.reverses_payment_id);
    if (!target || target.kind === 'reversal' || target.candidate_id !== row.candidate_id || row.amount_cents !== -target.amount_cents) {
      throw new TableRule('check', 'star_payments_reversal_check');
    }
    if (db.payments.some((p) => p.reverses_payment_id === row.reverses_payment_id)) throw new TableRule('unique', 'star_payments_reverses_payment_id_key');
  }
  const net = netPaidCents(db.payments.filter((p) => p.candidate_id === row.candidate_id)) + row.amount_cents;
  if (net < 0) throw new TableRule('check', 'star_payments_net_check');
}

function insertRow(db, env, table, row, meta) {
  const full = HOUSE_TABLES.has(table)
    ? {
      ...row, version: 1, created_at: meta.at, updated_at: meta.at, created_by: meta.userId, updated_by: meta.userId,
      created_by_name: meta.actor, updated_by_name: meta.actor,
    }
    : { ...row };
  if (table === 'star_payments') checkPaymentInsert(db, full);
  db[LISTS[table]].push(full);
  checkTableRules(db, table, full);
  writeLog(db, env, meta, table, 'insert', null, full, full);
  return full;
}

// Changes a row like the before-write trigger (§2.11): a change to anything but the no-bump and
// bookkeeping columns — or bump: true ("version + 1 on purpose") — raises the version and stamps
// "last changed". The same values write nothing (returns false).
function updateRow(db, env, table, row, changes, meta, { bump = false } = {}) {
  const keys = Object.keys(changes).filter((k) => changes[k] !== row[k]);
  if (keys.length === 0 && !bump) return false;
  const old = { ...row };
  Object.assign(row, changes);
  const noBump = NO_BUMP[table] ?? [];
  if (HOUSE_TABLES.has(table) && (bump || keys.some((k) => !noBump.includes(k) && !BOOKKEEPING.includes(k)))) {
    row.version = old.version + 1;
    row.updated_at = meta.at;
    row.updated_by = meta.userId;
    row.updated_by_name = meta.actor;
  }
  checkTableRules(db, table, row);
  const before = {};
  const after = {};
  for (const key of Object.keys(row)) {
    if (row[key] !== old[key]) {
      before[key] = old[key];
      after[key] = row[key];
    }
  }
  writeLog(db, env, meta, table, 'update', before, after, row);
  return true;
}

function deleteRow(db, env, table, row, meta) {
  const list = LISTS[table];
  db[list] = db[list].filter((r) => r.id !== row.id);
  writeLog(db, env, meta, table, 'delete', row, null, row);
}

// ===== Reading helpers (what the SQL helpers of §5 and §16 do) =====

const findEvent = (db, id) => db.events.find((e) => e.id === id) ?? null;
const findCandidate = (db, id) => db.candidates.find((c) => c.id === id) ?? null;
const danCopy = (db, eventId, dan) => db.event_dans.find((d) => d.event_id === eventId && d.dan === dan) ?? null;
const paymentsOf = (db, candidateId) => db.payments.filter((p) => p.candidate_id === candidateId);

function summaryOf(db, env, c) {
  const e = findEvent(db, c.event_id);
  return paymentSummary({
    candidate: c, payments: paymentsOf(db, c.id), dan: danCopy(db, c.event_id, c.dan), testingDate: e.testing_date, today: env.today(),
  });
}

// star_candidate_result (§5.5) through resultRules.js. null when the candidate is gone.
function resultOf(db, c) {
  if (!c) return null;
  const e = findEvent(db, c.event_id);
  return candidateResult({
    candidate: c,
    testingDate: e.testing_date,
    dan: danCopy(db, c.event_id, c.dan),
    categories: db.event_categories.filter((k) => k.event_id === c.event_id),
    gradeValues: db.event_grades.filter((g) => g.event_id === c.event_id),
    assistant: db.event_assistant.find((a) => a.event_id === c.event_id) ?? null,
    grades: db.candidate_grades.filter((g) => g.candidate_id === c.id),
    makeupSubjects: db.makeup_subjects.filter((m) => m.candidate_id === c.id),
  });
}

// star_sent_state (§5.5): the latest Mark as sent that wasn't undone, and does it still match?
function sentStateOf(db, c, result) {
  const sent = db.result_emails
    .filter((r) => r.candidate_id === c.id && r.undone_at === null)
    .sort((a, b) => (a.marked_at < b.marked_at ? 1 : a.marked_at > b.marked_at ? -1 : a.id < b.id ? 1 : -1))[0] ?? null;
  return {
    sent: sent ? { id: sent.id, marked_at: sent.marked_at, marked_by_name: sent.marked_by_name, result_status: sent.result_status } : null,
    matches: sent ? sent.result_key === result?.result_key : false,
  };
}

// star_find_duplicate (§5.6): another ACTIVE candidate of the event with the same names (ignoring
// capitals and extra spaces) and the same DOB — or the names alone when either has no DOB. The
// oldest wins. A row "kept both" together with excludeId doesn't count.
function findDuplicate(db, eventId, excludeId, first, last, dob) {
  return db.candidates
    .filter((m) => m.event_id === eventId && m.status === 'active' && (excludeId === null || m.id !== excludeId)
      && nameKey(m.first_name) === nameKey(first) && nameKey(m.last_name) === nameKey(last)
      && (m.date_of_birth === null || dob === null || m.date_of_birth === dob)
      && !(excludeId !== null && m.duplicate_state === 'kept_both' && m.duplicate_of === excludeId))
    .sort((a, b) => (a.registered_at < b.registered_at ? -1 : a.registered_at > b.registered_at ? 1 : a.id < b.id ? -1 : 1))[0]?.id ?? null;
}

// star_recheck_duplicate: one candidate's "possible duplicate" mark worked out again.
function recheckDuplicate(db, env, id, meta) {
  const c = findCandidate(db, id);
  if (!c) return;
  let state;
  let of;
  if (c.status !== 'active') {
    state = 'none';
    of = null;
  } else if (c.duplicate_state === 'kept_both' && c.duplicate_of !== null && db.candidates.some((m) => m.id === c.duplicate_of
    && m.status === 'active' && m.event_id === c.event_id && nameKey(m.first_name) === nameKey(c.first_name)
    && nameKey(m.last_name) === nameKey(c.last_name)
    && (m.date_of_birth === null || c.date_of_birth === null || m.date_of_birth === c.date_of_birth))) {
    return; // staff said these two are both real
  } else {
    of = findDuplicate(db, c.event_id, c.id, c.first_name, c.last_name, c.date_of_birth);
    state = of === null ? 'none' : 'possible';
  }
  updateRow(db, env, 'star_candidates', c, { duplicate_state: state, duplicate_of: of }, meta);
}

function recheckPointingAt(db, env, id, meta) {
  const ids = db.candidates.filter((c) => c.duplicate_of === id).map((c) => c.id).sort();
  for (const other of ids) recheckDuplicate(db, env, other, meta);
}

// star_purge_old_signatures (§5.7): signatures of events whose testing day is more than 90 days ago
// are removed (the row stays: "signature removed"). No version change; History shows "on file" → null.
function purgeOldSignatures(db, env, ctx) {
  const meta = newMeta(env, ctx, 'star_purge_old_signatures');
  const cutoff = addDays(env.today(), -SIGNATURE_KEEP_DAYS);
  let n = 0;
  for (const s of db.signatures) {
    if (s.signature === null) continue;
    const c = findCandidate(db, s.candidate_id);
    const e = c ? findEvent(db, c.event_id) : null;
    if (e && e.testing_date < cutoff) {
      updateRow(db, env, 'star_candidate_signatures', s, { signature: null, signature_deleted_at: meta.at }, meta);
      n += 1;
    }
  }
  return n;
}

// The star_roster view's row for one candidate (§2.12), or null when its event or Dan copy is gone.
function rosterRow(db, env, c) {
  const e = findEvent(db, c.event_id);
  const d = danCopy(db, c.event_id, c.dan);
  if (!e || !d) return null; // the view joins both
  const s = summaryOf(db, env, c);
  const row = Object.fromEntries(ROSTER_COLUMNS.slice(0, 29).map((col) => [col, c[col] ?? null]));
  return Object.assign(row, {
    testing_date: e.testing_date, dan_label: d.label, star_limit: d.star_limit, standard_cents: d.standard_cents,
    same_day_cents: d.same_day_cents, private_cents: d.private_cents, paid_cents: s.paidCents, paid: s.paid,
    last_payment_id: s.lastPayment?.id ?? null, paid_on: s.lastPayment?.paid_on ?? null, paid_method: s.lastPayment?.method ?? null,
    last_payment_recorded_at: s.lastPayment?.recorded_at ?? null, last_payment_recorded_by_name: s.lastPayment?.recorded_by_name ?? null,
    refunded_cents: s.refundedCents, fee_kind: s.feeKind, expected_fee_cents: s.expectedFeeCents, overpaid_cents: s.overpaidCents,
  });
}

// A new candidate row with every column (the defaults of §2.4).
function candidateRow(fields) {
  return {
    id: null, event_id: null, first_name: null, last_name: null, date_of_birth: null, email_for_results: null, location_code: null,
    dan: null, stars_from: null, paying_by: null, source: 'desk', reference: null, registered_at: null, status: 'active',
    withdrawn_reason: null, withdrawn_at: null, withdrawn_by_name: null, withdrawn_by: null, duplicate_state: 'none',
    duplicate_of: null, is_makeup: false, makeup_of_candidate_id: null, makeup_of_event_name: null, private_on: null,
    private_time: null, classes_attended: null, assistant_classes: null, ...fields,
  };
}

// Adds a payment row (any kind) and raises the candidate's version (§6.4: a double click gets 'stale').
function addPayment(db, env, c, fields, meta) {
  const p = insertRow(db, env, 'star_payments', {
    id: env.newId(), candidate_id: c.id, reverses_payment_id: null, recorded_at: meta.at, recorded_by: meta.userId,
    recorded_by_name: meta.actor, ...fields,
  }, meta);
  return p;
}
const bumpCandidate = (db, env, c, meta) => updateRow(db, env, 'star_candidates', c, {}, meta, { bump: true });
const unreversedRefund = (db, candidateId) => hasUnreversedRefund(paymentsOf(db, candidateId));

// ===== The functions (contract §6.3, §6.4, §7). Each returns the jsonb answer. =====
// Already checked by rpc() before these run (§1.1 steps 1–2): no_access, then not_allowed for the
// admin-only ones. Then, as in the SQL: invalid → not_found → stale → data rules → write.
// x = { ctx, env } (who is asking; the clock and ids).
const HANDLERS = {
  star_add_candidate(db, a, { ctx, env }) {
    const t = env.today();
    const email = trimEmail(a.p_email);
    if (a.p_event_id === null || !nameIsValid(a.p_first) || !nameIsValid(a.p_last)
      || (a.p_date_of_birth !== null && (a.p_date_of_birth > t || a.p_date_of_birth < '1900-01-01'))
      || !starEmailIsValid(email) || !SCHOOLS.includes(a.p_location_code)
      || a.p_dan === null || a.p_stars_from === null || a.p_stars_from < 0 || !METHODS.includes(a.p_paying_by)) return st('invalid');
    const e = findEvent(db, a.p_event_id);
    if (!e) return st('not_found');
    if (eventState(e, t) === 'finished') return st('finished');
    const d = danCopy(db, e.id, a.p_dan);
    if (!d || a.p_stars_from >= d.star_limit) return st('invalid');
    const meta = newMeta(env, ctx, 'star_add_candidate');
    const first = normalizeName(a.p_first);
    const last = normalizeName(a.p_last);
    const dup = findDuplicate(db, e.id, null, first, last, a.p_date_of_birth);
    const row = insertRow(db, env, 'star_candidates', candidateRow({
      id: env.newId(), event_id: e.id, first_name: first, last_name: last, date_of_birth: a.p_date_of_birth,
      email_for_results: email, location_code: a.p_location_code, dan: a.p_dan, stars_from: a.p_stars_from,
      paying_by: a.p_paying_by, source: 'desk', registered_at: meta.at,
      duplicate_state: dup === null ? 'none' : 'possible', duplicate_of: dup,
    }), meta);
    if (dup !== null) recheckDuplicate(db, env, dup, meta); // both rows show the pair
    purgeOldSignatures(db, env, ctx);
    return { status: 'ok', id: row.id, version: 1 };
  },

  star_add_makeup(db, a, { ctx, env }) {
    if (a.p_event_id === null || a.p_earlier_candidate_id === null) return st('invalid');
    const e = findEvent(db, a.p_event_id);
    if (!e) return st('not_found');
    const ec = findCandidate(db, a.p_earlier_candidate_id);
    if (!ec) return st('not_found');
    const ee = findEvent(db, ec.event_id);
    if (eventState(e, env.today()) === 'finished') return st('finished');
    if (ee.testing_date >= e.testing_date || ec.status !== 'active') return st('invalid');
    if (db.candidates.some((m) => m.makeup_of_candidate_id === ec.id && m.is_makeup && m.status === 'active')) return st('already_added');
    const res = resultOf(db, ec);
    if (res.status !== 'makeup') return st('stale');
    if (res.choice_needed) return st('choice_needed');
    const d = danCopy(db, e.id, ec.dan);
    if (!d || ec.stars_from >= d.star_limit) return st('invalid');
    const needs = res.needs_ids;
    const subjectNamed = (name) => res.subjects.find((s) => s.name.toLowerCase() === name.toLowerCase()) ?? null;
    const mine = db.event_categories.filter((k) => k.event_id === e.id && k.dan === ec.dan).sort((x, y) => x.position - y.position);
    // Is Assistant Instructor retested? Only when this event's AI subject matches an earlier subject
    // by name that is NOT to be retested are the class counts carried over (OPEN-10).
    const aiHere = mine.find((k) => k.from_class_count);
    const aiEarlier = aiHere ? subjectNamed(aiHere.name) : null;
    const aiRetest = !(aiEarlier && !needs.includes(aiEarlier.event_category_id));
    const meta = newMeta(env, ctx, 'star_add_makeup');
    const dup = findDuplicate(db, e.id, null, ec.first_name, ec.last_name, ec.date_of_birth);
    const row = insertRow(db, env, 'star_candidates', candidateRow({
      id: env.newId(), event_id: e.id, first_name: ec.first_name, last_name: ec.last_name, date_of_birth: ec.date_of_birth,
      email_for_results: ec.email_for_results, location_code: ec.location_code, dan: ec.dan, stars_from: ec.stars_from,
      paying_by: null, source: 'desk', registered_at: meta.at, is_makeup: true, makeup_of_candidate_id: ec.id,
      makeup_of_event_name: ee.name, classes_attended: aiRetest ? null : ec.classes_attended,
      assistant_classes: aiRetest ? null : ec.assistant_classes, duplicate_state: dup === null ? 'none' : 'possible', duplicate_of: dup,
    }), meta);
    if (dup !== null) recheckDuplicate(db, env, dup, meta);
    let kept = 0;
    let retest = 0;
    const addRetest = (k) => {
      insertRow(db, env, 'star_makeup_subjects', { id: env.newId(), candidate_id: row.id, event_category_id: k.id, kind: 'retest' }, meta);
      retest += 1;
    };
    for (const k of mine) {
      const es = subjectNamed(k.name);
      if (k.from_class_count) {
        if (aiRetest) addRetest(k);
      } else if (es && !es.from_class_count && es.grade !== null && !needs.includes(es.event_category_id)) {
        // a KEPT grade (v0.163): the earlier letter, noting the earlier event (OPEN-8: exact name match)
        insertRow(db, env, 'star_grades', {
          id: env.newId(), candidate_id: row.id, event_category_id: k.id, grade: es.grade, kept: true,
          kept_from_event_id: ee.id, kept_from_event_name: ee.name,
        }, meta);
        kept += 1;
      } else {
        addRetest(k); // to retest, or no subject of that name earlier
      }
    }
    return { status: 'ok', id: row.id, version: 1, kept_count: kept, retest_count: retest };
  },

  star_update_candidate(db, a, { ctx, env }) {
    const t = env.today();
    const first = normalizeName(a.p_first);
    const last = normalizeName(a.p_last);
    const email = trimEmail(a.p_email);
    if (a.p_candidate_id === null || a.p_expected_version === null || !nameIsValid(a.p_first) || !nameIsValid(a.p_last)
      || (a.p_date_of_birth !== null && (a.p_date_of_birth > t || a.p_date_of_birth < '1900-01-01'))
      || !starEmailIsValid(email) || !SCHOOLS.includes(a.p_location_code)
      || a.p_dan === null || a.p_stars_from === null || a.p_stars_from < 0
      || (a.p_clear_grade_count !== null && a.p_clear_grade_count < 0)) return st('invalid');
    const c = findCandidate(db, a.p_candidate_id);
    if (!c) return st('not_found');
    if (c.version !== a.p_expected_version) return st('stale');
    // 6. rules that depend on the saved row
    if (c.source === 'form' && a.p_date_of_birth === null) return st('invalid');
    const danChanged = a.p_dan !== c.dan;
    if (danChanged && netPaidCents(paymentsOf(db, c.id)) > 0 && !ctx.isAdmin) return st('not_allowed'); // S8
    const d = danCopy(db, c.event_id, a.p_dan);
    if (!d || a.p_stars_from >= d.star_limit) return st('invalid');
    const grades = db.candidate_grades.filter((g) => g.candidate_id === c.id);
    if (danChanged) {
      if (grades.length > 0 && a.p_clear_grade_count === null) return { status: 'grades_exist', grade_count: grades.length };
      if (a.p_clear_grade_count !== null && a.p_clear_grade_count !== grades.length) return st('stale');
    }
    const meta = newMeta(env, ctx, 'star_update_candidate');
    let cleared = 0;
    if (danChanged) {
      for (const g of grades) deleteRow(db, env, 'star_grades', g, meta); // kept ones too (OPEN-7)
      cleared = grades.length;
      for (const m of db.makeup_subjects.filter((x) => x.candidate_id === c.id)) deleteRow(db, env, 'star_makeup_subjects', m, meta);
    }
    const old = { first: c.first_name, last: c.last_name, dob: c.date_of_birth };
    const changed = updateRow(db, env, 'star_candidates', c, {
      first_name: first, last_name: last, date_of_birth: a.p_date_of_birth, email_for_results: email,
      location_code: a.p_location_code, dan: a.p_dan, stars_from: a.p_stars_from,
    }, meta);
    if (changed && (first !== old.first || last !== old.last || a.p_date_of_birth !== old.dob)) {
      recheckDuplicate(db, env, c.id, meta);
      if (c.duplicate_of !== null) recheckDuplicate(db, env, c.duplicate_of, meta);
      recheckPointingAt(db, env, c.id, meta);
    }
    return { status: 'ok', version: c.version, cleared_grade_count: cleared };
  },

  star_change_paying_by(db, a, { ctx, env }) {
    if (a.p_candidate_id === null || a.p_expected_version === null || !METHODS.includes(a.p_paying_by)) return st('invalid');
    const c = findCandidate(db, a.p_candidate_id);
    if (!c) return st('not_found');
    if (c.version !== a.p_expected_version) return st('stale');
    if (c.status === 'withdrawn') return st('withdrawn');
    if (c.is_makeup) return st('no_fee');
    if (netPaidCents(paymentsOf(db, c.id)) > 0) return st('already_paid');
    updateRow(db, env, 'star_candidates', c, { paying_by: a.p_paying_by }, newMeta(env, ctx, 'star_change_paying_by'));
    return { status: 'ok', version: c.version };
  },

  star_resolve_duplicate(db, a, { ctx, env }) {
    if ([a.p_keep_id, a.p_keep_version, a.p_other_id, a.p_other_version, a.p_keep_both].includes(null) || a.p_keep_id === a.p_other_id) return st('invalid');
    const keep = findCandidate(db, a.p_keep_id);
    if (!keep) return st('not_found');
    const other = findCandidate(db, a.p_other_id);
    if (!other) return st('not_found');
    if (keep.event_id !== other.event_id) return st('invalid');
    if (keep.version !== a.p_keep_version || other.version !== a.p_other_version) return st('stale');
    if (keep.status !== 'active' || other.status !== 'active') return st('withdrawn');
    if (!((keep.duplicate_state === 'possible' && keep.duplicate_of === other.id)
      || (other.duplicate_state === 'possible' && other.duplicate_of === keep.id))) return st('stale');
    const meta = newMeta(env, ctx, 'star_resolve_duplicate');
    if (a.p_keep_both) {
      for (const [row, partner] of [[keep, other], [other, keep]].sort((x, y) => (x[0].id < y[0].id ? -1 : 1))) {
        updateRow(db, env, 'star_candidates', row, { duplicate_state: 'kept_both', duplicate_of: partner.id }, meta);
      }
    } else {
      // keep one: the other goes to Removed as a duplicate copy (the one withdrawal staff may do, S2)
      updateRow(db, env, 'star_candidates', other, {
        status: 'withdrawn', withdrawn_reason: 'duplicate_copy', withdrawn_at: meta.at, withdrawn_by_name: meta.actor,
        withdrawn_by: meta.userId, duplicate_state: 'none', duplicate_of: null,
      }, meta);
      recheckDuplicate(db, env, keep.id, meta);
      recheckPointingAt(db, env, other.id, meta);
    }
    return { status: 'ok', keep_version: keep.version, other_version: other.version };
  },

  star_set_private(db, a, { ctx, env }) {
    if (a.p_candidate_id === null || a.p_expected_version === null || (a.p_private_on === null) !== (a.p_private_time === null)
      || (a.p_private_time !== null && !startTimeIsValid(a.p_private_time))) return st('invalid');
    const c = findCandidate(db, a.p_candidate_id);
    if (!c) return st('not_found');
    if (c.version !== a.p_expected_version) return st('stale');
    if (c.status === 'withdrawn') return st('withdrawn');
    const meta = newMeta(env, ctx, a.p_private_on === null ? 'star_clear_private' : 'star_set_private');
    updateRow(db, env, 'star_candidates', c, { private_on: a.p_private_on, private_time: a.p_private_time }, meta);
    return { status: 'ok', version: c.version, expected_fee_cents: summaryOf(db, env, c).expectedFeeCents };
  },

  star_withdraw_candidate(db, a, { ctx, env }) {
    if (a.p_candidate_id === null || a.p_expected_version === null) return st('invalid');
    const c = findCandidate(db, a.p_candidate_id);
    if (!c) return st('not_found');
    if (c.version !== a.p_expected_version) return st('stale');
    if (c.status === 'withdrawn') return st('withdrawn');
    const meta = newMeta(env, ctx, 'star_withdraw_candidate');
    updateRow(db, env, 'star_candidates', c, {
      status: 'withdrawn', withdrawn_reason: 'withdrawn', withdrawn_at: meta.at, withdrawn_by_name: meta.actor,
      withdrawn_by: meta.userId, duplicate_state: 'none', duplicate_of: null,
    }, meta);
    recheckPointingAt(db, env, c.id, meta);
    return { status: 'ok', version: c.version };
  },

  star_restore_candidate(db, a, { ctx, env }) {
    if (a.p_candidate_id === null || a.p_expected_version === null) return st('invalid');
    const c = findCandidate(db, a.p_candidate_id);
    if (!c) return st('not_found');
    if (c.version !== a.p_expected_version) return st('stale');
    // admins any time; staff only their own "keep one" less than 10 seconds ago (the toast's Undo)
    const ownUndo = c.status === 'withdrawn' && c.withdrawn_reason === 'duplicate_copy' && c.withdrawn_by === (ctx.userId ?? null)
      && ctx.userId && Date.parse(c.withdrawn_at) > env.now() - UNDO_WINDOW_MS;
    if (!ctx.isAdmin && !ownUndo) return st('not_allowed');
    if (c.status !== 'withdrawn') return st('stale');
    const meta = newMeta(env, ctx, 'star_restore_candidate');
    updateRow(db, env, 'star_candidates', c, {
      status: 'active', withdrawn_reason: null, withdrawn_at: null, withdrawn_by_name: null, withdrawn_by: null,
    }, meta); // a second active make-up of the same earlier candidate → unique rule → 'stale'
    recheckDuplicate(db, env, c.id, meta);
    if (c.duplicate_of !== null) recheckDuplicate(db, env, c.duplicate_of, meta);
    recheckPointingAt(db, env, c.id, meta);
    return { status: 'ok', version: c.version };
  },

  star_delete_candidate(db, a, { ctx, env }) {
    if (a.p_candidate_id === null || a.p_expected_version === null || !idsAreValid(a.p_expected_payment_ids)) return st('invalid');
    const c = findCandidate(db, a.p_candidate_id);
    if (!c) return st('not_found');
    if (c.version !== a.p_expected_version) return st('stale');
    const ids = paymentsOf(db, c.id).map((p) => p.id).sort();
    const expected = [...a.p_expected_payment_ids].sort();
    if (ids.length !== expected.length || ids.some((id, i) => id !== expected[i])) return st('stale');
    const pointing = db.candidates.filter((x) => x.duplicate_of === c.id).map((x) => x.id).sort();
    const meta = newMeta(env, ctx, 'star_delete_candidate');
    // The cascade: signature, grades, make-up subjects, payments, result emails (each logged).
    for (const table of ['star_candidate_signatures', 'star_grades', 'star_makeup_subjects', 'star_payments', 'star_result_emails']) {
      for (const row of db[LISTS[table]].filter((r) => r.candidate_id === c.id)) deleteRow(db, env, table, row, meta);
    }
    // "on delete set null": a later make-up row keeps its row, without the link; duplicate links too.
    for (const x of db.candidates) {
      if (x.id === c.id) continue;
      const changes = {};
      if (x.makeup_of_candidate_id === c.id) changes.makeup_of_candidate_id = null;
      if (x.duplicate_of === c.id) changes.duplicate_of = null;
      if (Object.keys(changes).length) updateRow(db, env, 'star_candidates', x, changes, meta);
    }
    deleteRow(db, env, 'star_candidates', c, meta); // DOB and email stay in the change log (S10)
    for (const id of pointing) recheckDuplicate(db, env, id, meta);
    return { status: 'ok' };
  },

  star_record_payment(db, a, { ctx, env }) {
    if (a.p_candidate_id === null || a.p_expected_version === null || !METHODS.includes(a.p_method)
      || !between(a.p_amount_cents, 1, 100000) || a.p_paid_on === null || a.p_paid_on > env.today()) return st('invalid');
    const c = findCandidate(db, a.p_candidate_id);
    if (!c) return st('not_found');
    if (c.version !== a.p_expected_version) return st('stale');
    if (c.status === 'withdrawn') return st('withdrawn');
    if (c.is_makeup) return st('no_fee');
    if (netPaidCents(paymentsOf(db, c.id)) > 0) return st('already_paid');
    if (a.p_paid_on < schoolDateOf(c.registered_at)) return st('invalid'); // v0.175
    const meta = newMeta(env, ctx, 'star_record_payment');
    const p = addPayment(db, env, c, { kind: 'payment', amount_cents: a.p_amount_cents, method: a.p_method, paid_on: a.p_paid_on }, meta);
    bumpCandidate(db, env, c, meta);
    purgeOldSignatures(db, env, ctx);
    return { status: 'ok', payment_id: p.id, version: c.version };
  },

  star_undo_payment(db, a, { ctx, env }) {
    if (a.p_payment_id === null) return st('invalid');
    const p = db.payments.find((x) => x.id === a.p_payment_id);
    if (!p) return st('not_found');
    const own = ctx.userId && p.recorded_by === ctx.userId && Date.parse(p.recorded_at) > env.now() - UNDO_WINDOW_MS;
    if (!own && !ctx.isAdmin) return st('not_allowed');
    if (p.kind === 'reversal') return st('invalid');
    if (reversedIds(db.payments).has(p.id)) return st('stale');
    if (p.kind === 'payment' && unreversedRefund(db, p.candidate_id)) return st('invalid'); // undo the refund first
    const c = findCandidate(db, p.candidate_id);
    const meta = newMeta(env, ctx, 'star_undo_payment');
    addPayment(db, env, c, {
      kind: 'reversal', amount_cents: -p.amount_cents, method: p.method, paid_on: env.today(), reverses_payment_id: p.id,
    }, meta);
    bumpCandidate(db, env, c, meta);
    return { status: 'ok', version: c.version };
  },

  star_edit_payment(db, a, { ctx, env }) {
    if (a.p_payment_id === null || !METHODS.includes(a.p_method) || !between(a.p_amount_cents, 1, 100000)
      || a.p_paid_on === null || a.p_paid_on > env.today()) return st('invalid');
    const p = db.payments.find((x) => x.id === a.p_payment_id);
    if (!p) return st('not_found');
    if (p.kind !== 'payment') return st('invalid');
    if (reversedIds(db.payments).has(p.id)) return st('stale');
    if (unreversedRefund(db, p.candidate_id)) return st('invalid'); // undo the refund first
    const c = findCandidate(db, p.candidate_id);
    if (a.p_paid_on < schoolDateOf(c.registered_at)) return st('invalid');
    const meta = newMeta(env, ctx, 'star_edit_payment');
    addPayment(db, env, c, {
      kind: 'reversal', amount_cents: -p.amount_cents, method: p.method, paid_on: env.today(), reverses_payment_id: p.id,
    }, meta);
    const fresh = addPayment(db, env, c, { kind: 'payment', amount_cents: a.p_amount_cents, method: a.p_method, paid_on: a.p_paid_on }, meta);
    bumpCandidate(db, env, c, meta);
    return { status: 'ok', payment_id: fresh.id, version: c.version };
  },

  star_record_refund(db, a, { ctx, env }) {
    if (a.p_candidate_id === null || a.p_expected_version === null || !REFUND_METHODS.includes(a.p_method)
      || !between(a.p_amount_cents, 1, 100000) || a.p_refunded_on === null || a.p_refunded_on > env.today()) return st('invalid');
    const c = findCandidate(db, a.p_candidate_id);
    if (!c) return st('not_found');
    if (c.version !== a.p_expected_version) return st('stale');
    if (c.status === 'withdrawn') return st('withdrawn');
    if (a.p_refunded_on < schoolDateOf(c.registered_at)) return st('invalid');
    const { overpaidCents } = summaryOf(db, env, c);
    if (overpaidCents === 0 || a.p_amount_cents > overpaidCents) return { status: 'refund_too_large', overpaid_cents: overpaidCents }; // S7
    const meta = newMeta(env, ctx, 'star_record_refund');
    const p = addPayment(db, env, c, { kind: 'refund', amount_cents: -a.p_amount_cents, method: a.p_method, paid_on: a.p_refunded_on }, meta);
    bumpCandidate(db, env, c, meta);
    return { status: 'ok', payment_id: p.id, version: c.version };
  },

  // ----- Reads (§7) -----

  star_candidate_detail(db, a, { env }) {
    if (a.p_candidate_id === null) return st('invalid');
    const c = findCandidate(db, a.p_candidate_id);
    if (!c) return st('not_found');
    const e = findEvent(db, c.event_id);
    const d = danCopy(db, c.event_id, c.dan);
    const s = db.signatures.find((x) => x.candidate_id === c.id) ?? null;
    const result = resultOf(db, c);
    const sum = summaryOf(db, env, c);
    const candidate = { ...c };
    for (const key of ['created_by', 'updated_by', 'withdrawn_by']) delete candidate[key];
    const categoryOf = (id) => db.event_categories.find((k) => k.id === id);
    return {
      status: 'ok',
      candidate: Object.assign(candidate, {
        age_on_testing_day: c.date_of_birth === null ? null : ageOn(c.date_of_birth, e.testing_date),
        dan_label: d.label, stars_to: c.stars_from + 1, testing_date: e.testing_date,
      }),
      signature: {
        state: s === null ? 'none' : s.signature !== null ? 'on_file' : 'removed',
        signed_at: s?.signed_at ?? null, signature_deleted_at: s?.signature_deleted_at ?? null, ack_version: s?.ack_version ?? null,
      },
      payments: paymentsOf(db, c.id)
        .sort((x, y) => (x.recorded_at < y.recorded_at ? -1 : x.recorded_at > y.recorded_at ? 1 : x.id < y.id ? -1 : 1))
        .map((p) => ({
          id: p.id, candidate_id: p.candidate_id, kind: p.kind, amount_cents: p.amount_cents, method: p.method, paid_on: p.paid_on,
          recorded_at: p.recorded_at, recorded_by_name: p.recorded_by_name, reverses_payment_id: p.reverses_payment_id,
        })),
      paid_cents: sum.paidCents,
      expected_fee_cents: sum.expectedFeeCents,
      fee_kind: sum.feeKind,
      overpaid_cents: sum.overpaidCents,
      makeup_subjects: db.makeup_subjects.filter((m) => m.candidate_id === c.id)
        .map((m) => ({ event_category_id: m.event_category_id, name: categoryOf(m.event_category_id)?.name ?? '', kind: m.kind,
          position: categoryOf(m.event_category_id)?.position ?? 0 }))
        .sort((x, y) => x.position - y.position || (x.kind < y.kind ? -1 : 1))
        .map(({ position, ...m }) => m),
      result,
      sent: sentStateOf(db, c, result),
    };
  },

  star_candidate_history(db, a) {
    if (a.p_candidate_id === null) return st('invalid');
    if (!findCandidate(db, a.p_candidate_id)) return st('not_found');
    // The child rows are found through their INSERT rows, then matched by (table, record id).
    const pairs = new Set(db.change_log
      .filter((l) => l.op === 'insert' && CHILD_TABLES.includes(l.table_name) && l.after?.candidate_id === a.p_candidate_id)
      .map((l) => `${l.table_name}|${l.record_id}`));
    const strip = (values) => {
      if (!values) return values ?? null;
      const out = { ...values };
      for (const key of LOGIN_ID_KEYS) delete out[key];
      return out;
    };
    const rows = db.change_log
      .filter((l) => (l.table_name === 'star_candidates' && l.record_id === a.p_candidate_id) || pairs.has(`${l.table_name}|${l.record_id}`))
      .sort((x, y) => (x.occurred_at < y.occurred_at ? 1 : x.occurred_at > y.occurred_at ? -1 : y.seq - x.seq))
      .slice(0, 500)
      .map((l) => ({
        occurred_at: l.occurred_at, actor_name: l.actor_name, action: l.action, table_name: l.table_name, op: l.op,
        before: strip(l.before), after: strip(l.after),
      }));
    return { status: 'ok', rows };
  },

  star_view_signature(db, a) {
    if (a.p_candidate_id === null) return st('invalid');
    if (!findCandidate(db, a.p_candidate_id)) return st('not_found');
    const s = db.signatures.find((x) => x.candidate_id === a.p_candidate_id) ?? null;
    return { status: 'ok', signature: s?.signature ?? null, signed_at: s?.signed_at ?? null, signature_deleted_at: s?.signature_deleted_at ?? null };
  },

  star_makeup_list(db, a, { ctx, env }) {
    if (a.p_event_id === null) return st('invalid');
    const e = findEvent(db, a.p_event_id);
    if (!e) return st('not_found');
    const activeMakeupOf = (id, here) => db.candidates.some((m) => m.makeup_of_candidate_id === id && m.is_makeup
      && m.status === 'active' && (here ? m.event_id === e.id : m.event_id !== e.id));
    const rows = [];
    for (const c of db.candidates) {
      const ce = findEvent(db, c.event_id);
      if (c.event_id === e.id || !ce || !(ce.testing_date < e.testing_date) || c.status !== 'active') continue;
      if (activeMakeupOf(c.id, false)) continue; // already a make-up in ANOTHER event: left out
      const res = resultOf(db, c);
      if (res.status !== 'makeup') continue;
      rows.push({
        candidate_id: c.id, first_name: c.first_name, last_name: c.last_name, location_code: c.location_code, dan: c.dan,
        stars_from: c.stars_from, stars_to: c.stars_from + 1, earlier_event_id: ce.id, earlier_event_name: ce.name,
        earlier_testing_date: ce.testing_date, needs: res.needs, choice_needed: res.choice_needed,
        already_added: activeMakeupOf(c.id, true),
      });
    }
    const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
    rows.sort((x, y) => cmp(y.earlier_testing_date, x.earlier_testing_date) || cmp(x.earlier_event_id, y.earlier_event_id)
      || x.dan - y.dan || x.stars_from - y.stars_from || cmp(x.last_name.toLowerCase(), y.last_name.toLowerCase())
      || cmp(x.first_name.toLowerCase(), y.first_name.toLowerCase()) || cmp(x.candidate_id, y.candidate_id));
    purgeOldSignatures(db, env, ctx); // the last step (§5.7) — why this read is a POST
    return { status: 'ok', rows };
  },
};

// Phase 5: the grading functions (mockStarGrading.js), working on this same store with these same
// table helpers, so every grade, count and choice is logged like the other writes.
// (Made on first use, not at load time, so the live build — which never makes the fake — drops it.)
// Phase 6: the results functions (mockStarResults.js), plugged in the same way.
let gradingHandlers = null;
let resultsHandlers = null;
function handlerFor(name) {
  if (name in HANDLERS) return HANDLERS[name];
  const helpers = { findCandidate, findEvent, danCopy, resultOf, sentStateOf, newMeta, insertRow, updateRow, deleteRow };
  gradingHandlers ??= createGradingHandlers(helpers);
  if (name in gradingHandlers) return gradingHandlers[name];
  resultsHandlers ??= createResultsHandlers(helpers);
  return resultsHandlers[name];
}

// Runs one function on a private copy of the data, turning a table rule into a status (§1.4).
function runHandler(name, db, args, x) {
  try {
    return handlerFor(name)(db, args, x);
  } catch (error) {
    if (!(error instanceof TableRule)) throw error;
    if (error.kind === 'unique') {
      return st(name === 'star_add_makeup' && error.constraint === 'star_candidates_one_active_makeup_idx' ? 'already_added' : 'stale');
    }
    return st('invalid');
  }
}

// ===== The family form's functions (contract 0006 §8.2, §8.3) =====

const PUBLIC_ATTEMPT_KEEP_MS = 2 * DAY_MS; // rate-limit rows older than 2 days are removed (§8.3)
const PUBLIC_RATE_LIMIT_PER_HOUR = 20; // per client key; the real limit is shared with Color Belt's form
const HOUR_MS = 60 * 60 * 1000;
const SCHOOL_NAMES = { worcester: 'Worcester', shrewsbury: 'Shrewsbury' }; // locations.name
const isWhole = (v) => Number.isInteger(v) && v >= 0 && v <= INT_MAX;

// The event and the school of a code: { event, schoolCode } or null. A code that matches more than
// one column or event is refused rather than guessed (§8.2).
function eventByCode(db, code) {
  if (typeof code !== 'string' || !STAR_CODE_PATTERN.test(code)) return null;
  const hits = [];
  for (const e of db.events) {
    if (e.public_code_worcester === code) hits.push({ event: e, schoolCode: 'worcester' });
    if (e.public_code_shrewsbury === code) hits.push({ event: e, schoolCode: 'shrewsbury' });
  }
  return hits.length === 1 ? hits[0] : null;
}

// "where": the place of the testing and its address (testing_location_address: an object or null).
const whereOf = (e, schoolAddress) => ({ name: SCHOOL_NAMES[e.where_code] ?? null, address: schoolAddress(e.where_code) ?? null });

// star_public_event (§8.2): only what the form shows — no counts, candidates, ids or private fee.
function publicEventAnswer(db, env, code, schoolAddress) {
  const hit = eventByCode(db, code);
  if (!hit) return st('not_found');
  const { event: e, schoolCode } = hit;
  const pub = publicStateFor(eventState(e, env.today()), e);
  const aPlus = db.event_grades.find((g) => g.event_id === e.id && g.grade === 'A+')?.value ?? 0;
  const dans = db.event_dans.filter((d) => d.event_id === e.id).sort((a, b) => a.dan - b.dan).map((d) => {
    const categories = db.event_categories.filter((k) => k.event_id === e.id && k.dan === d.dan).sort((a, b) => a.position - b.position);
    const max = categories.reduce((sum, k) => sum + k.credits * Number(aPlus), 0);
    return {
      dan: d.dan, label: d.label, star_limit: d.star_limit, standard_cents: d.standard_cents, same_day_cents: d.same_day_cents,
      pass_mark: Number(d.pass_mark), max_score: Math.round(max * 10) / 10,
      categories: categories.map((k) => ({ name: k.name, credits: k.credits })),
    };
  });
  return {
    status: 'ok', state: pub.state, closed_on: pub.closedOn,
    school: { code: schoolCode, name: SCHOOL_NAMES[schoolCode] },
    event: {
      name: e.name, testing_date: e.testing_date, start_time: String(e.start_time).slice(0, 5), note: e.note ?? null,
      auto_close_on: e.auto_close_on ?? null, where: whereOf(e, schoolAddress),
    },
    dans,
  };
}

// star_public_answer (§8.3): the same answer for a new registration and for a repeated send —
// whether or not it looks like a duplicate. No DOB, email or signature.
function publicAnswer(db, c, schoolAddress) {
  const e = findEvent(db, c.event_id);
  const d = danCopy(db, c.event_id, c.dan);
  return {
    status: 'ok', reference: c.reference, first_name: c.first_name, last_name: c.last_name, dan: c.dan, dan_label: d.label,
    stars_from: c.stars_from, stars_to: c.stars_from + 1, standard_cents: d.standard_cents, same_day_cents: d.same_day_cents,
    paying_by: c.paying_by, event_name: e.name, testing_date: e.testing_date, start_time: String(e.start_time).slice(0, 5),
    school_name: SCHOOL_NAMES[c.location_code] ?? null, where: whereOf(e, schoolAddress),
  };
}

// star_public_register_core (§8.3), steps 1–9 in the contract's order. Writes into `db` (a copy).
function publicRegisterCore(db, env, a, clientKey, nowMs, forceRateLimited, schoolAddress, noteEvent) {
  // 1. the event by code
  const hit = eventByCode(db, typeof a.code === 'string' ? a.code : null);
  if (!hit) return st('not_found');
  const { event: e, schoolCode } = hit;
  noteEvent(e.id);
  // 2. the same form sent again (double tap, retry after a timeout): the same answer
  const submissionId = typeof a.submissionId === 'string' && UUID_PATTERN.test(a.submissionId) ? a.submissionId.toLowerCase() : null;
  if (submissionId !== null) {
    const earlier = db.signatures.find((s) => s.submission_id === submissionId);
    if (earlier) {
      const c = findCandidate(db, earlier.candidate_id);
      return c && c.event_id === e.id ? publicAnswer(db, c, schoolAddress) : st('invalid');
    }
  }
  // 3–4. (the lock) and the state
  const pub = publicStateFor(eventState(e, env.today()), e);
  if (pub.state === 'closed') return { status: 'closed', closed_on: pub.closedOn };
  if (pub.state !== 'open') return st(pub.state);
  // 5. the input
  const today = env.today();
  const text = (v) => (typeof v === 'string' ? v : null);
  const ok = clientKey.length >= 1 && clientKey.length <= 200 && submissionId !== null
    && nameIsValid(text(a.first)) && nameIsValid(text(a.last))
    && isIsoDate(a.dateOfBirth) && a.dateOfBirth <= today && a.dateOfBirth >= '1900-01-01'
    && starEmailIsValid(a.email) && isWhole(a.dan) && isWhole(a.starsFrom)
    && FORM_PAYING_BY.includes(a.payingBy) && a.acknowledged === true && signatureIsValid(a.signature)
    && a.ackVersion === ACK_VERSION;
  if (!ok) return st('invalid');
  // 6. a Dan of this event, and a star below its limit
  const d = danCopy(db, e.id, a.dan);
  if (!d || a.starsFrom >= d.star_limit) return st('invalid');
  // 7. the rate limit: 20 tries an hour per client key
  const recent = db.public_attempts.filter((row) => row.client_key === clientKey && nowMs - Date.parse(row.at) < HOUR_MS).length;
  if (forceRateLimited || recent >= PUBLIC_RATE_LIMIT_PER_HOUR) return st('rate_limited');
  // 8. the candidate and its signatures row, as "Family form"
  const meta = newMeta(env, FAMILY_FORM, 'star_public_register');
  const first = normalizeName(a.first);
  const last = normalizeName(a.last);
  const dup = findDuplicate(db, e.id, null, first, last, a.dateOfBirth); // accepted silently (v0.97)
  const row = insertRow(db, env, 'star_candidates', candidateRow({
    id: env.newId(), event_id: e.id, first_name: first, last_name: last, date_of_birth: a.dateOfBirth,
    email_for_results: trimEmail(a.email), location_code: schoolCode, dan: a.dan, stars_from: a.starsFrom,
    paying_by: a.payingBy, source: 'form', reference: `ST-${db.next_reference}`, registered_at: meta.at,
    duplicate_state: dup === null ? 'none' : 'possible', duplicate_of: dup,
  }), meta);
  db.next_reference += 1;
  if (dup !== null) recheckDuplicate(db, env, dup, meta);
  insertRow(db, env, 'star_candidate_signatures', {
    id: env.newId(), candidate_id: row.id, submission_id: submissionId, acknowledged: true, ack_version: a.ackVersion,
    signature: a.signature, signed_at: meta.at, signature_deleted_at: null,
  }, meta);
  // 9. the ok answer
  return publicAnswer(db, row, schoolAddress);
}

// ===== The seed =====

// Fixed, valid uuids for the seed rows, so "Reset" always brings back the same ids.
const pad12 = (n) => String(n).padStart(12, '0');
const fixedId = (kind, n) => `000004${kind}-0000-4000-8000-${pad12(n)}`;
export const SEED_CANDIDATE_EVENT_IDS = { summer: fixedId('e0', 1), fall: SEED_EVENT_IDS.fall, spring: fixedId('e0', 3) };
// Who did what in the seed (the preview's own account is the admin; Staff = the shared desk).
const SEED_ADMIN = { isAdmin: true, actorName: 'Jeffrey Berg', userId: '00000000-0000-4000-8000-000000000001' };
const SEED_DESK = { isAdmin: false, actorName: 'Staff', userId: '00000000-0000-4000-8000-0000000000d1' };
const FAMILY_FORM = { isAdmin: false, actorName: 'Family form', userId: null };

// [key, name, testing date (days from today), start, where, open, closing date (days before
//  testing), first opened (days from today) or null, [Worcester code, Shrewsbury code], note, added (days)]
const SEED_EVENTS = [
  ['summer', 'Summer Star Testing', -100, '10:00:00', 'worcester', false, 7, -130, ['h3mt8wqa', 'p5zd2kxe'], null, -140],
  ['fall', 'Fall Star Testing', 26, '10:00:00', 'shrewsbury', true, 7, -12, ['fa2kxm7p', 'r9ectw3h'],
    'Please arrive 30 minutes early in a clean uniform.', -14],
  ['spring', 'Spring Star Testing', 180, '11:00:00', 'shrewsbury', false, 7, null, ['q8vn3jtb', 'm2wy6rfd'], null, -3],
];

// Is the stored candidates part this file's? (mockStarEvents asks it too: seedIsCurrent.)
export function starCandidatesSeedIsCurrent(store) {
  if (!store || store.candidates_schema !== STAR_CANDIDATES_SCHEMA || store.events_schema !== STAR_EVENTS_SCHEMA) return false;
  const lists = ['candidates', 'payments', 'signatures', 'makeup_subjects', 'candidate_grades', 'result_emails', 'change_log'];
  return lists.every((k) => Array.isArray(store[k])) && Number.isInteger(store.next_reference)
    && store.candidates.every((c) => c && typeof c.id === 'string' && Array.isArray(store.events) && store.events.some((e) => e.id === c.event_id));
}

// The seeded events AND candidates part, added to a copy of the rubric template store `base`.
// today: 'YYYY-MM-DD'. Every seeded moment is at noon in school time on its day (16:00 UTC), so its
// date is the same in Massachusetts whatever the clock says.
export function defaultStarCandidatesData(base, { today }) {
  const db = {
    events_schema: STAR_EVENTS_SCHEMA, events: [], event_dans: [], event_categories: [], event_grades: [], event_assistant: [],
    candidates: [], payments: [], next_reference: 4001, candidates_schema: STAR_CANDIDATES_SCHEMA, signatures: [],
    makeup_subjects: [], candidate_grades: [], result_emails: [], change_log: [], next_log_seq: 0,
    result_texts: [], downloads: [],
  };
  const work = { ...clone(base), ...db };
  const noon = Date.parse(`${today}T16:00:00Z`);
  let idN = 0;
  let minute = 0;
  let clock = noon;
  // env for one seeded step on `day` (days from today): its own date and a clock that moves on by a
  // minute per step, so History keeps the order the steps ran in.
  const env = {
    today: () => todayInSchoolTime(clock),
    now: () => clock,
    newId: () => fixedId('a0', (idN += 1)),
  };
  const on = (day) => {
    minute += 1;
    clock = noon + day * DAY_MS + minute * 60 * 1000;
  };
  const call = (day, who, name, args) => {
    on(day);
    const answer = runHandler(name, work, readArgs(name, args), { ctx: who, env });
    if (answer.status !== 'ok') throw new Error(`Star candidates seed: ${name} answered ${answer.status}`);
    return answer;
  };

  // The events and their copy of the rubrics and prices (copied when each was added).
  for (const [key, name, days, start, where, open, closeBefore, openedDay, [codeW, codeS], note, addedDay] of SEED_EVENTS) {
    const testingDate = addDays(today, days);
    const at = iso(noon + addedDay * DAY_MS);
    work.events.push({
      id: SEED_CANDIDATE_EVENT_IDS[key], name, testing_date: testingDate, start_time: start, where_code: where,
      registration_open: open, auto_close_on: addDays(testingDate, -closeBefore),
      first_opened_at: openedDay === null ? null : iso(noon + openedDay * DAY_MS),
      public_code_worcester: codeW, public_code_shrewsbury: codeS, note,
      version: 1, created_at: at, updated_at: at, created_by: SEED_ADMIN.userId, updated_by: SEED_ADMIN.userId,
      created_by_name: SEED_ADMIN.actorName, updated_by_name: SEED_ADMIN.actorName,
    });
    copyStarTemplateInto(work, SEED_CANDIDATE_EVENT_IDS[key], () => fixedId('c0', (idN += 1)));
  }
  const ids = {}; // first name → candidate id (the seed's names are all different)

  // A family-form registration, as star_public_register writes it (phase 4): source 'form', the next
  // ST- reference, the possible-duplicate mark, and the signatures row.
  const form = (day, eventKey, first, last, dob, school, dan, stars, payingBy) => {
    on(day);
    const meta = newMeta(env, FAMILY_FORM, 'star_public_register');
    const eventId = SEED_CANDIDATE_EVENT_IDS[eventKey];
    const dup = findDuplicate(work, eventId, null, first, last, dob);
    const row = insertRow(work, env, 'star_candidates', candidateRow({
      id: env.newId(), event_id: eventId, first_name: first, last_name: last, date_of_birth: dob,
      email_for_results: `${last.toLowerCase()}.family@example.com`, location_code: school, dan, stars_from: stars,
      paying_by: payingBy, source: 'form', reference: `ST-${work.next_reference}`, registered_at: meta.at,
      duplicate_state: dup === null ? 'none' : 'possible', duplicate_of: dup,
    }), meta);
    work.next_reference += 1;
    if (dup !== null) recheckDuplicate(work, env, dup, meta);
    insertRow(work, env, 'star_candidate_signatures', {
      id: env.newId(), candidate_id: row.id, submission_id: env.newId(), acknowledged: true, ack_version: ACK_VERSION,
      signature: SEED_SIGNATURE, signed_at: meta.at, signature_deleted_at: null,
    }, meta);
    ids[first] = row.id;
    return row;
  };
  const desk = (day, eventKey, first, last, dob, school, dan, stars, payingBy) => {
    const r = call(day, SEED_DESK, 'star_add_candidate', {
      p_event_id: SEED_CANDIDATE_EVENT_IDS[eventKey], p_first: first, p_last: last, p_date_of_birth: dob,
      p_email: `${last.toLowerCase()}.desk@example.com`, p_location_code: school, p_dan: dan, p_stars_from: stars, p_paying_by: payingBy,
    });
    ids[first] = r.id;
    return r;
  };
  const versionOf = (first) => findCandidate(work, ids[first]).version;
  const pay = (day, who, first, cents, method) => call(day, who, 'star_record_payment', {
    p_candidate_id: ids[first], p_expected_version: versionOf(first), p_method: method, p_amount_cents: cents,
    p_paid_on: addDays(today, day),
  });

  // ----- Summer Star Testing (100 days ago): registrations, payments, grades, results -----
  const summer = SEED_CANDIDATE_EVENT_IDS.summer;
  form(-125, 'summer', 'Morgan', 'Hale', '2011-03-04', 'worcester', 1, 1, 'cash');
  form(-122, 'summer', 'Grace', 'Liu', '2010-09-12', 'worcester', 1, 2, 'check');
  form(-120, 'summer', 'Drew', 'Park', '2012-01-20', 'shrewsbury', 1, 0, 'cash');
  form(-118, 'summer', 'Casey', 'Lund', '2011-06-30', 'shrewsbury', 1, 0, 'cash');
  desk(-115, 'summer', 'Taylor', 'Quinn', '2009-11-02', 'shrewsbury', 2, 0, 'check');
  desk(-112, 'summer', 'Avery', 'Lin', '1988-04-15', 'worcester', 3, 1, 'cash');
  pay(-121, SEED_DESK, 'Morgan', 14000, 'cash');
  pay(-119, SEED_DESK, 'Grace', 14000, 'check');
  pay(-117, SEED_DESK, 'Drew', 14000, 'cash');
  pay(-110, SEED_ADMIN, 'Avery', 16000, 'cash');
  call(-104, SEED_ADMIN, 'star_withdraw_candidate', { p_candidate_id: ids.Casey, p_expected_version: versionOf('Casey') });
  pay(-100, SEED_DESK, 'Taylor', 16000, 'check'); // paid on the testing day: the same-day fee

  // Grades on the testing day, through the grading functions themselves (star_set_grade,
  // star_set_count, star_set_makeup_subjects — mockStarGrading.js), so History shows exactly what they log.
  // letter: every judged subject's grade; d: subject names graded D instead; counts: [classes attended,
  // assistant classes] (adult minimums 20 / 18 / 16 / 14 → A+ / A / B+ / B; null = not entered);
  // only: grade just these subject names (a half-graded row).
  const grade = (day, idKey, letter, d, counts, only = null) => {
    const c = findCandidate(work, ids[idKey]);
    const subjects = work.event_categories
      .filter((k) => k.event_id === c.event_id && k.dan === c.dan && !k.from_class_count)
      .sort((x, y) => x.position - y.position);
    // the D subject: by name when the template still has it, else the last judged subject
    const dNames = d.map((name) => (subjects.some((k) => k.name === name) ? name : subjects.at(-1).name));
    for (const k of subjects) {
      if (only && !only.includes(k.name)) continue;
      call(day, SEED_ADMIN, 'star_set_grade', {
        p_candidate_id: c.id, p_event_category_id: k.id, p_grade: dNames.includes(k.name) ? 'D' : letter,
      });
    }
    if (counts) {
      call(day, SEED_ADMIN, 'star_set_count', { p_candidate_id: c.id, p_field: 'classes_attended', p_value: counts[0] });
      call(day, SEED_ADMIN, 'star_set_count', { p_candidate_id: c.id, p_field: 'assistant_classes', p_value: counts[1] });
    }
  };
  // An admin chooses the subjects to retest for a result below the pass mark (v0.130).
  const choose = (day, idKey, names) => {
    const c = findCandidate(work, ids[idKey]);
    const subjects = work.event_categories.filter((k) => k.event_id === c.event_id && k.dan === c.dan && !k.from_class_count);
    const chosen = [...new Set(names.map((name) => (subjects.find((k) => k.name === name) ?? subjects.at(-1)).id))];
    call(day, SEED_ADMIN, 'star_set_makeup_subjects', { p_candidate_id: c.id, p_expected_category_ids: [], p_category_ids: chosen });
  };
  grade(-100, 'Morgan', 'A', [], [24, 18]); // 280.0 → passed
  grade(-100, 'Grace', 'A+', ['Two Step Sparring'], [24, 20]); // 292.5, D → make-up (retests Two Step Sparring)
  grade(-100, 'Taylor', 'A', ['Breaking'], [24, 18]); // 260.0, D → make-up (retests Breaking)
  grade(-100, 'Drew', 'B', [], [24, 14]); // 210.0, below 245 → make-up, subjects chosen below
  grade(-100, 'Avery', 'B', [], [24, 14]); // 210.0, below 245 → make-up, NO subjects chosen yet (choice_needed)
  choose(-99, 'Drew', ['Breaking', 'Knowledge']);

  // ----- Fall Star Testing (in 26 days) -----
  form(-9, 'fall', 'Owen', 'Hart', '2012-02-14', 'worcester', 1, 0, 'cash');
  form(-8, 'fall', 'Ruby', 'Diaz', '1995-07-21', 'shrewsbury', 3, 2, 'cash');
  call(-8, SEED_DESK, 'star_set_private', {
    p_candidate_id: ids.Ruby, p_expected_version: versionOf('Ruby'), p_private_on: addDays(today, 26 + 17), p_private_time: '16:00',
  });
  form(-7, 'fall', 'Mia', 'Patel', '2013-04-02', 'shrewsbury', 1, 0, 'cash');
  form(-6, 'fall', 'Noah', 'Chen', '2012-10-30', 'worcester', 1, 0, 'check');
  form(-6, 'fall', 'Ava', 'Reed', '2013-05-09', 'worcester', 1, 0, 'cash');
  pay(-6, SEED_DESK, 'Noah', 14000, 'check'); // also removes Summer's signatures (more than 90 days after its testing day)
  form(-5, 'fall', 'Chris', 'Kim', '2011-12-01', 'shrewsbury', 1, 1, 'check');
  call(-5, SEED_DESK, 'star_set_private', {
    p_candidate_id: ids.Chris, p_expected_version: versionOf('Chris'), p_private_on: addDays(today, 26 + 10), p_private_time: '14:00',
  });
  form(-5, 'fall', 'Lily', 'Brooks', '2016-08-01', 'worcester', 1, 1, 'cash');
  desk(-4, 'fall', 'Jordan', 'Kim', '2010-03-18', 'shrewsbury', 2, 0, 'cash');
  pay(-4, SEED_DESK, 'Mia', 14000, 'cash');
  pay(-4, SEED_DESK, 'Jordan', 15000, 'cash');
  pay(-4, SEED_DESK, 'Chris', 16000, 'check'); // the private fee
  form(-3, 'fall', 'Ethan', 'Lopez', '2012-07-07', 'worcester', 1, 2, 'check');
  pay(-3, SEED_DESK, 'Ruby', 18000, 'cash'); // 3rd Dan private fee
  {
    // Ava Reed again, at the desk, the same date of birth → "Possible duplicate" on both rows.
    const r = call(-2, SEED_DESK, 'star_add_candidate', {
      p_event_id: SEED_CANDIDATE_EVENT_IDS.fall, p_first: 'Ava', p_last: 'Reed', p_date_of_birth: '2013-05-09',
      p_email: 'reed.family@example.com', p_location_code: 'worcester', p_dan: 1, p_stars_from: 0, p_paying_by: 'cash',
    });
    ids.Ava2 = r.id;
  }
  call(-2, SEED_ADMIN, 'star_withdraw_candidate', { p_candidate_id: ids.Owen, p_expected_version: versionOf('Owen') });
  call(-1, SEED_DESK, 'star_set_private', { p_candidate_id: ids.Chris, p_expected_version: versionOf('Chris'), p_private_on: null, p_private_time: null }); // Back to the testing day → $20 overpaid
  call(-1, SEED_DESK, 'star_add_makeup', { p_event_id: SEED_CANDIDATE_EVENT_IDS.fall, p_earlier_candidate_id: ids.Grace });
  {
    // Sam Ortiz: a walk-in whose family didn't give a date of birth (S3).
    const r = call(-1, SEED_DESK, 'star_add_candidate', {
      p_event_id: SEED_CANDIDATE_EVENT_IDS.fall, p_first: 'Sam', p_last: 'Ortiz', p_date_of_birth: null,
      p_email: 'ortiz.family@example.com', p_location_code: 'worcester', p_dan: 1, p_stars_from: 1, p_paying_by: 'cash',
    });
    ids.Sam = r.id;
  }

  // ----- Phase 5: grading states for the Grading tab and the private grading page -----
  // (Added after everything above, so the earlier rows keep their ids and references.)
  // Sofia Reyes: a desk row at Summer (no family form, so no signature), D in Breaking and Korean
  // Terminology, then added to Fall as a make-up: kept grades + retests Breaking and Korean Terminology.
  on(-113);
  {
    const meta = newMeta(env, SEED_DESK, 'star_add_candidate');
    const row = insertRow(work, env, 'star_candidates', candidateRow({
      id: env.newId(), event_id: summer, first_name: 'Sofia', last_name: 'Reyes', date_of_birth: '2012-04-20',
      email_for_results: 'reyes.desk@example.com', location_code: 'worcester', dan: 1, stars_from: 1, paying_by: 'cash',
      source: 'desk', registered_at: meta.at,
    }), meta);
    ids.Sofia = row.id;
  }
  pay(-111, SEED_DESK, 'Sofia', 14000, 'cash');
  grade(-100, 'Sofia', 'A', ['Breaking', 'Korean Terminology'], [22, 16]); // 237.5, two D's → make-up
  ids.SofiaFall = call(-1, SEED_DESK, 'star_add_makeup', { p_event_id: SEED_CANDIDATE_EVENT_IDS.fall, p_earlier_candidate_id: ids.Sofia }).id;
  grade(0, 'SofiaFall', 'A', [], null, ['Breaking']); // 1 of 2 retests graded → "1 of 2 left", "257.5 so far"
  // Alex Kim: testing privately (1st Dan, 1 → 2, Shrewsbury), paid the private fee, half graded.
  form(-2, 'fall', 'Alex', 'Kim', '2012-09-15', 'shrewsbury', 1, 1, 'card');
  call(-2, SEED_DESK, 'star_set_private', {
    p_candidate_id: ids.Alex, p_expected_version: versionOf('Alex'), p_private_on: addDays(today, 26 + 17), p_private_time: '16:00',
  });
  pay(-2, SEED_DESK, 'Alex', 16000, 'card');
  grade(0, 'Alex', 'A', [], null, ['White–Deputy Curriculum', 'Go-Ryo Poomse', 'Advanced Motion']);
  // The Fall grid's other states (graded ahead of the day so the preview shows them):
  grade(0, 'Chris', 'A', [], [22, 18]); // 280 → Passed
  grade(0, 'Noah', 'A', ['Breaking'], [22, 12]); // D in Breaking → "⚠ Make-up · D in Breaking"
  grade(0, 'Ethan', 'B', [], [19, 14]); // 210, no D → "⚠ Make-up · below 245" (an admin chooses)
  grade(0, 'Sam', 'B', [], [20, 14]); // 210, no D…
  choose(0, 'Sam', ['Breaking', 'Knowledge']); // …chosen → "⚠ Make-up · retests Breaking, Knowledge"
  // The family-form Ava Reed: 4 subjects → "7 of 11 left". Mia Patel, Lily Brooks, the desk's Ava Reed
  // and Jordan Kim (2nd Dan) stay "Not started".
  grade(0, 'Ava', 'B+', [], null, ['White–Deputy Curriculum', 'Go-Ryo Poomse', 'Advanced Motion', 'Advance Sa-Bang Chuck']);

  // ----- Phase 6: Results states on the finished Summer event (appended, so earlier ids stay) -----
  // The three result email texts, as migration 0023 seeds them (version 1, "Database admin").
  work.result_texts = seedResultTexts(iso(noon - 140 * DAY_MS), () => fixedId('t0', (idN += 1)));
  // Summer's testing day is day -100. New desk rows (added before the day; none is a make-up, so the
  // make-up lists of Fall and Spring stay as they were):
  desk(-106, 'summer', 'Lucas', 'Grant', '2012-05-05', 'worcester', 1, 0, 'cash'); // Passed, not sent
  desk(-106, 'summer', 'Nina', 'Ford', '2011-08-19', 'shrewsbury', 1, 1, 'check'); // Passed with a LATE grade
  desk(-106, 'summer', 'Ben', 'Ward', '2012-11-23', 'worcester', 1, 2, 'cash'); // Not finished
  desk(-106, 'summer', 'Zoe', 'Bell', '2013-02-14', 'shrewsbury', 1, 0, 'card'); // Testing privately, day still to come
  desk(-106, 'summer', 'Ivy', 'Cole', '2012-06-30', 'worcester', 1, 1, 'cash'); // private testing after the day, graded then
  pay(-105, SEED_DESK, 'Lucas', 14000, 'cash');
  pay(-105, SEED_DESK, 'Nina', 14000, 'check');
  call(-104, SEED_DESK, 'star_set_private', {
    p_candidate_id: ids.Zoe, p_expected_version: versionOf('Zoe'), p_private_on: addDays(today, 5), p_private_time: '16:00',
  });
  call(-104, SEED_DESK, 'star_set_private', {
    p_candidate_id: ids.Ivy, p_expected_version: versionOf('Ivy'), p_private_on: addDays(today, -98), p_private_time: '15:30',
  });
  pay(-104, SEED_DESK, 'Zoe', 16000, 'card');
  grade(-100, 'Lucas', 'A', [], [24, 18]); // 280 → Passed, "Not sent yet"
  grade(-100, 'Nina', 'A', [], [24, 18], ['White–Deputy Curriculum', 'Go-Ryo Poomse', 'Advanced Motion', 'Advance Sa-Bang Chuck',
    'Step Sa-Bang Chuck', 'Two Step Sparring', 'Breaking', 'Appreciation Letters', 'Knowledge']); // Korean Terminology waits…
  {
    // …and is graded 3 days AFTER the testing day → "Earns 2nd star · Korean Terminology graded <date>"
    const c = findCandidate(work, ids.Nina);
    const k = work.event_categories.find((x) => x.event_id === c.event_id && x.dan === c.dan && x.name === 'Korean Terminology');
    call(-97, SEED_ADMIN, 'star_set_grade', { p_candidate_id: c.id, p_event_category_id: k.id, p_grade: 'A' });
  }
  grade(-100, 'Ben', 'B+', [], [20, 16], ['White–Deputy Curriculum', 'Go-Ryo Poomse', 'Advanced Motion', 'Advance Sa-Bang Chuck',
    'Step Sa-Bang Chuck', 'Two Step Sparring', 'Breaking', 'Appreciation Letters', 'Knowledge']); // "Korean Terminology not graded yet"
  grade(-100, 'Zoe', 'A', [], null, ['White–Deputy Curriculum', 'Go-Ryo Poomse']); // partly graded: still "Testing privately"
  grade(-98, 'Ivy', 'A+', [], [26, 21]); // graded on her private day → "Earns 2nd star · private testing <date>"
  // Ella Moss: a D in Breaking on the day (a make-up), emailed and marked as sent; 4 days later an
  // admin corrected Breaking to B+ → now Passed: "Earns 1 star · Breaking graded <date>" and "Not sent
  // yet · an earlier Make-up result was sent <date>" (the approved R6 drawing).
  desk(-106, 'summer', 'Ella', 'Moss', '2013-01-09', 'shrewsbury', 1, 0, 'cash');
  pay(-105, SEED_DESK, 'Ella', 14000, 'cash');
  grade(-100, 'Ella', 'A', ['Breaking'], [24, 18]);
  // Mark as sent (star_mark_result_sent, as the desk would): Morgan sent by Staff, then re-sent by
  // Jeffrey (an admin's Undo of the newer send falls back to "Sent … · Staff"); Taylor's make-up sent
  // by Staff (still the same result: "Sent … · Staff" on a Make-up row); Ella's make-up sent.
  const markSent = (day, who, first) => {
    const c = findCandidate(work, ids[first]);
    call(day, who, 'star_mark_result_sent', { p_candidate_id: c.id, p_expected_result_key: resultOf(work, c).result_key });
  };
  markSent(-99, SEED_DESK, 'Morgan');
  markSent(-95, SEED_ADMIN, 'Morgan');
  markSent(-99, SEED_DESK, 'Taylor');
  markSent(-99, SEED_DESK, 'Ella');
  {
    const c = findCandidate(work, ids.Ella);
    const k = work.event_categories.find((x) => x.event_id === c.event_id && x.dan === c.dan && x.name === 'Breaking');
    call(-96, SEED_ADMIN, 'star_set_grade', { p_candidate_id: c.id, p_event_category_id: k.id, p_grade: 'B+' }); // → Passed
  }

  return Object.fromEntries(Object.keys(db).map((k) => [k, work[k]]));
}

// ===== The backend =====

export function createStarCandidatesBackend({ readBase, saveStore, now = () => Date.now(), today, newId }) {
  let failNext = false; // set by failNextSave()
  const env = { today, now, newId };

  function write(db) {
    saveStore?.(db);
  }

  // The current data (always a private copy: changes only count once saved). A missing or older
  // candidates part is replaced by the seed and saved at once.
  function read() {
    const base = clone(readBase());
    if (starCandidatesSeedIsCurrent(base)) {
      // A store saved before phase 6 has no result email texts or download log yet: add them (as
      // migration 0023 adds its table) without touching anything else. resetTesting() brings the
      // whole phase 6 seed (the Summer results states).
      if (Array.isArray(base.result_texts) && Array.isArray(base.downloads)) return base;
      if (!Array.isArray(base.result_texts)) base.result_texts = seedResultTexts(iso(now()), newId);
      if (!Array.isArray(base.downloads)) base.downloads = [];
      write(base);
      return clone(base);
    }
    Object.assign(base, defaultStarCandidatesData(base, { today: today() }));
    write(base);
    return clone(base);
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
    const used = [...wanted, ...filters.map((f) => f.col), ...orders.map((o) => o.col)];
    for (const col of used) {
      if (col === '*' || HIDDEN[table].includes(col)) return denied(`table ${table}`);
      if (!existing.includes(col)) return fail('42703', `column ${table}.${col} does not exist`, 400); // e.g. date_of_birth on the view
    }
    if (!ctx.hasDataAccess) return ok([]); // row-level security hides every row
    const db = read();
    let rows = table === 'star_roster' ? db.candidates.map((c) => rosterRow(db, env, c)).filter(Boolean) : db[SELECT_LIST[table]] ?? [];
    rows = rows.filter((row) => filters.every((f) => (f.op === 'in'
      ? (f.value ?? []).map(String).includes(String(row[f.col]))
      : String(row[f.col]) === String(f.value))));
    rows = [...rows].sort((x, y) => {
      for (const { col, ascending = true } of orders) {
        if (x[col] === y[col]) continue;
        const less = x[col] === null ? false : y[col] === null ? true : x[col] < y[col];
        return (less ? -1 : 1) * (ascending ? 1 : -1);
      }
      return 0;
    });
    return ok(rows.map((row) => Object.fromEntries(wanted.map((col) => [col, row[col] ?? null]))));
  }

  // supabase.rpc(name, args, options) for the candidate functions.
  function rpc(name, args = {}, ctx = {}, options = {}) {
    if (!(name in RPC_ARGS)) return fail('PGRST202', `Could not find the function public.${name} in the schema cache`, 404);
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
    // A GET request runs read-only: a function that writes fails (contract §7 — use a POST).
    if (options?.get && !STABLE.has(name)) return fail('25006', 'cannot execute UPDATE in a read-only transaction', 400);
    // §1.1: has_data_access FIRST, then the role (admin-only functions).
    if (!ctx.hasDataAccess) return ok(st('no_access'));
    if (ADMIN_ONLY.has(name) && !ctx.isAdmin) return ok(st('not_allowed'));
    const db = read(); // a private copy = a transaction: only an 'ok' is saved
    const who = { ...ctx, actorName: ctx.actorName || (ctx.isAdmin ? 'Admin' : 'Staff'), isAdmin: Boolean(ctx.isAdmin) };
    const answer = runHandler(name, db, parsed, { ctx: who, env });
    if (answer.status === 'ok' && !STABLE.has(name)) write(db);
    return ok(answer);
  }

  // ----- The family form's two functions (contract 0006 §8.2, §8.3; Star phase 4) -----
  // Only the star_registrar login may call these in the real database, through the Pages Function;
  // in preview, src/lib/star/publicApi.preview.js calls them (never mockClient's rpc, so a signed-in
  // staff page can't reach them either). `schoolAddress(code)` gives a school's address for the
  // "Location:" line ({ street, city, state, zip } or null) — preview keeps the addresses in
  // Color Belt's store (Settings → Schools), so publicApi.preview.js reads them from there.

  // star_public_event(p_code)
  function publicEvent(code, { schoolAddress = () => null } = {}) {
    return publicEventAnswer(read(), env, code, schoolAddress);
  }

  // star_public_register(...). args use the database's names without "p_":
  //   { code, clientKey, submissionId, first, last, dateOfBirth, email, dan, starsFrom, payingBy,
  //     acknowledged, signature, ackVersion }
  // forceRateLimited: preview helper — the rate-limit check fails at its normal place (step 7).
  // Every call writes one rate-limit row (outcome 'star:' + the status), refusals too — after the
  // registration part, so it counts even when that part is undone (§8.3).
  function publicRegister(args = {}, { forceRateLimited = false, schoolAddress = () => null } = {}) {
    const db = read();
    const nowMs = env.now();
    db.public_attempts = (Array.isArray(db.public_attempts) ? db.public_attempts : [])
      .filter((row) => nowMs - Date.parse(row.at) <= PUBLIC_ATTEMPT_KEEP_MS); // rows older than 2 days go
    const clientKey = typeof args.clientKey === 'string' ? args.clientKey : '';
    let eventId = null;
    let answer;
    const work = clone(db); // the "core": only kept when it answers ok
    try {
      answer = publicRegisterCore(work, env, args, clientKey, nowMs, forceRateLimited, schoolAddress, (id) => {
        eventId = id;
      });
    } catch (error) {
      if (!(error instanceof TableRule)) throw error;
      answer = st('invalid'); // the wrapper turns table-rule errors into 'invalid' (all undone)
    }
    const kept = answer.status === 'ok' ? work : db;
    kept.public_attempts = [...(kept.public_attempts ?? []), {
      client_key: clientKey.slice(0, 200), event_id: eventId, outcome: `star:${answer.status}`, at: iso(nowMs),
    }];
    write(kept);
    return answer;
  }


  function failNextSave() {
    failNext = true;
  }

  // Preview helper (phase 5, __tkdPreview.simulateStarDanChange): "another device" moves the first
  // ACTIVE candidate called firstName in the upcoming Fall seed event (or eventId) to another Dan, the
  // way Edit details does after its confirmation (grades cleared, v0.164). A grid still showing the
  // old Dan then gets `stale` for its next grade save. Returns a sentence for the console.
  function simulateDanChange(firstName = 'Noah', dan = 2, eventId = SEED_CANDIDATE_EVENT_IDS.fall) {
    const db = read();
    const c = db.candidates.find((x) => x.event_id === eventId && x.status === 'active' && x.first_name === firstName);
    if (!c) return `No active candidate called ${firstName} in that event.`;
    const d = danCopy(db, c.event_id, Number(dan));
    if (!d || c.dan === d.dan) return `Pick a Dan the event has, other than ${c.dan}.`;
    const ctx = { isAdmin: true, actorName: 'Other Admin', userId: '00000000-0000-4000-8000-0000000000aa' };
    const answer = runHandler('star_update_candidate', db, {
      p_candidate_id: c.id, p_expected_version: c.version, p_first: c.first_name, p_last: c.last_name,
      p_date_of_birth: c.date_of_birth, p_email: c.email_for_results, p_location_code: c.location_code, p_dan: d.dan,
      p_stars_from: Math.min(c.stars_from, d.star_limit - 1),
      p_clear_grade_count: db.candidate_grades.filter((g) => g.candidate_id === c.id).length,
    }, { ctx, env });
    if (answer.status !== 'ok') return `Couldn't move ${firstName}: ${answer.status}.`;
    write(db);
    return `${c.first_name} ${c.last_name} was moved to ${d.label} on "another device" (${answer.cleared_grade_count} grades cleared). The next grade saved for them on the old grid answers stale.`;
  }

  // Preview helper (phase 6, __tkdPreview.simulateStarResultChange): "another device" changes one
  // grade of the first ACTIVE candidate called firstName (the Fall seed event first, then any event),
  // so their result_key changes — the next Mark as sent from a screen still showing the old result
  // answers `stale`. Returns a sentence for the console.
  function simulateResultChange(firstName = 'Noah') {
    const db = read();
    const named = (eventId) => db.candidates.find((x) => x.status === 'active' && x.first_name === firstName && (!eventId || x.event_id === eventId));
    const c = named(SEED_CANDIDATE_EVENT_IDS.fall) ?? named(null);
    if (!c) return `No active candidate called ${firstName}.`;
    const subjects = db.event_categories
      .filter((k) => k.event_id === c.event_id && k.dan === c.dan && !k.from_class_count)
      .sort((x, y) => x.position - y.position);
    const graded = subjects.find((k) => db.candidate_grades.some((g) => g.candidate_id === c.id && g.event_category_id === k.id && !g.kept));
    const k = graded ?? subjects[0];
    if (!k) return `${firstName} has no subjects to change.`;
    const now = db.candidate_grades.find((g) => g.candidate_id === c.id && g.event_category_id === k.id)?.grade ?? null;
    const grade = now === 'A' ? 'A+' : 'A';
    const ctx = { isAdmin: true, actorName: 'Other Admin', userId: '00000000-0000-4000-8000-0000000000aa' };
    const answer = runHandler('star_set_grade', db, { p_candidate_id: c.id, p_event_category_id: k.id, p_grade: grade }, { ctx, env });
    if (answer.status !== 'ok') return `Couldn't change ${firstName}'s grade: ${answer.status}.`;
    write(db);
    return `${c.first_name} ${c.last_name}'s ${k.name} is now ${grade} (changed on "another device"). A Mark as sent for the old result now answers stale.`;
  }

  // Preview helper (phase 6, __tkdPreview.starDownloads): the CSV download log (star_downloads —
  // the real one is read only in the SQL Editor). Newest last.
  function downloads() {
    return (read().downloads ?? []).map((d) => ({ ...d }));
  }

  // Back to the seed (events and candidates; the rubric template is kept).
  function reset() {
    const base = clone(readBase());
    Object.assign(base, defaultStarCandidatesData(base, { today: today() }));
    write(base);
  }

  return { select, rpc, publicEvent, publicRegister, failNextSave, simulateDanChange, simulateResultChange, downloads, reset, snapshot: read };
}
