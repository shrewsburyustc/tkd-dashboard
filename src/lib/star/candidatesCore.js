// candidatesCore.js — the real work behind candidatesApi.js: every database call the Star testing
// Candidates tab makes (the roster, the detail view, History, View signature, the make-up list, and
// every candidate and payment change), written against ANY Supabase-shaped client.
// Why it exists: candidatesApi.js imports the app's one connection (supabase.js), and supabase.js
// reads Vite settings (import.meta.env) that don't exist when Node runs the checks. Keeping the
// logic here, with the client and "today" passed in, lets star/candidatesChecks.mjs run the exact
// same code against the preview database (mockStarCandidates.js) without a browser. The screens never
// import this file; they import candidatesApi.js (its header comment is the API for the screens).
//
// Every function returns a Promise of a plain object with a `status` CODE and NEVER throws. The
// codes (contract 0006 §1.3) and their words are in candidatesText.js.
//
// The database answers in snake_case (first_name); this file converts to the app's camelCase
// (firstName). Contract 0006: §2.4–§2.8 (the tables), §2.12 (the star_roster view), §4.1 (the only
// columns the app may read — every read below lists its columns, never '*'), §6.3–§6.4 (the 13 write
// functions), §7 (the read functions).
//
// PRIVACY (v0.160, contract §4.2): a candidate's date of birth and email come ONLY from
// loadCandidateDetail (star_candidate_detail, one candidate by id). They are not in the roster's
// column list — the database doesn't even let the app read them there — and not in the make-up list.
import { isIsoDate } from '../testing/eventRules.js';
import { startTimeMinutes, shortStartTime } from './starEventRules.js';
import { trimEmail, starEmailIsValid } from './emailRule.js';

// Every status a Star candidates call can return.
export const STAR_CANDIDATE_STATUSES = [
  'ok', 'no_access', 'not_allowed', 'invalid', 'not_found', 'stale', 'finished', 'withdrawn', 'already_paid',
  'already_added', 'choice_needed', 'grades_exist', 'no_fee', 'refund_too_large', 'duplicate_name', 'error',
];
// ('duplicate_name' is in 0006's shared answer list; no candidate function is expected to send it,
// but if one ever does it gets words instead of looking like a dropped connection.)
// /*#__PURE__*/ (() => …)(): "this has no side effects". mockStarCandidates.js (the preview fake,
// which the live site never creates) imports two helpers from this file; without the mark the live
// build would keep these top-level lines (the same trick as mockStarTesting.js).
const SERVER_STATUSES = /*#__PURE__*/ (() => new Set(STAR_CANDIDATE_STATUSES.filter((s) => s !== 'error')))();

// ----- The columns we read (exactly contract 0006 §4.1; the database refuses '*') -----
// star_roster (§2.12): the candidate's granted columns + the Dan copy + the payment state the
// database works out. NO date_of_birth, NO email_for_results, no login ids.
const ROSTER_COLUMNS = /*#__PURE__*/ (() => [
  'id', 'event_id', 'first_name', 'last_name', 'location_code', 'dan', 'stars_from', 'paying_by', 'source', 'reference',
  'registered_at', 'status', 'withdrawn_reason', 'withdrawn_at', 'withdrawn_by_name', 'duplicate_state', 'duplicate_of',
  'is_makeup', 'makeup_of_candidate_id', 'makeup_of_event_name', 'private_on', 'private_time', 'classes_attended',
  'assistant_classes', 'version', 'created_at', 'updated_at', 'created_by_name', 'updated_by_name',
  'testing_date', 'dan_label', 'star_limit', 'standard_cents', 'same_day_cents', 'private_cents',
  'paid_cents', 'paid', 'last_payment_id', 'paid_on', 'paid_method', 'last_payment_recorded_at',
  'last_payment_recorded_by_name', 'refunded_cents', 'fee_kind', 'expected_fee_cents', 'overpaid_cents',
].join(', '))();
// star_makeup_subjects (§2.6): which subjects a make-up candidate retests ('retest') or an admin
// chose for a result below the pass mark ('chosen').
const MAKEUP_SUBJECT_COLUMNS = 'id, candidate_id, event_category_id, kind, version, created_at, updated_at, created_by_name, updated_by_name';
// Every list read, by table — candidatesChecks.mjs scans these for date_of_birth / email.
export const STAR_CANDIDATE_LIST_COLUMNS = { star_roster: ROSTER_COLUMNS, star_makeup_subjects: MAKEUP_SUBJECT_COLUMNS };

// The `error` in { status:'error', error } is for the browser console and the Node checks ONLY:
// screens must never show result.error (it can hold database or network details). They show the
// words from candidatesText.js for the 'error' status instead.
const failure = (error) => ({ status: 'error', error });
const unexpected = (what) => failure(new Error(`Unexpected answer from ${what}`));

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuidText = (v) => typeof v === 'string' && UUID_PATTERN.test(v);
const isInt = (v) => Number.isInteger(v);
const toNumber = (v) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

// ----- Converting what the screens give us into what the database expects -----
// A value the database would answer with a hard error (not a friendly 'invalid') — "abc" as a date,
// 5.5 as a version — is caught here and answered 'invalid' without calling the server.
const BAD = Symbol('bad value');
const isBad = (values) => values.some((v) => v === BAD);
function asInteger(v) {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' && /^\s*[+-]?\d+\s*$/.test(v) ? Number(v) : v;
  return Number.isInteger(n) ? n : BAD;
}
const asDate = (v) => (v === null || v === undefined || v === '' ? null : isIsoDate(v) ? v : BAD);
// '16:00' or '16:00:00' → '16:00:00', or null. The time rule (6:00 AM–10:00 PM every 5 minutes,
// 0028) is the database's job.
const asTime = (v) => {
  if (v === null || v === undefined || v === '') return null;
  return startTimeMinutes(v) === null ? BAD : `${shortStartTime(v)}:00`;
};
const asText = (v) => (v === null || v === undefined ? null : typeof v === 'string' ? v : BAD);
const asBoolean = (v) => (v === null || v === undefined ? null : typeof v === 'boolean' ? v : BAD);
// An id: a uuid, or null. Anything else can't exist → the caller answers 'not_found'.
const asId = (v) => (v === null || v === undefined ? null : typeof v === 'string' ? v : BAD);
const notAnId = (v) => v !== null && !isUuidText(v);
// A list of ids (Delete permanently's payment ids): an array of uuid text, else BAD.
const asIdList = (v) => (v === null || v === undefined ? null : Array.isArray(v) && v.every(isUuidText) ? v : BAD);

// ----- Small pure helpers (the screens may use them too) -----

// The email rule (star_email_is_valid) lives in emailRule.js, shared with the public family form.
export { trimEmail, starEmailIsValid };

// Belt order (v0.117): Dan, stars from, school (Shrewsbury before Worcester), last name, first name.
// Returns a new array. Works on app candidates (camelCase).
export function sortBeltOrder(candidates) {
  const school = (c) => (c.locationCode === 'shrewsbury' ? 0 : 1);
  const text = (a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' });
  return [...(candidates ?? [])].sort((a, b) => a.dan - b.dan || a.starsFrom - b.starsFrom || school(a) - school(b)
    || text(a.lastName, b.lastName) || text(a.firstName, b.firstName) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// May this person change the Dan of this candidate? (S8: on a PAID row only admins may.) The screen
// grays the Dan field instead of letting staff try and get 'not_allowed' (G2).
export const danChangeNeedsAdmin = (candidate, isAdmin) => Boolean(candidate?.paid) && !isAdmin;

// What a History row touches, so the screens can hide it while "Hide private details" is on (G6):
//   payment        a payment / refund / undo row, or a CHANGE of "Paying by" (an update). The row
//                  that adds the candidate sets paying_by too, but its line ("Registered on the
//                  family form" / "Added at the desk") shows no money, so it stays (Q4 A, v0.518).
//   privateFields  the date of birth / email columns this row changes ([] when none)
export function historyPrivacy(row) {
  const keys = new Set([...Object.keys(row?.before ?? {}), ...Object.keys(row?.after ?? {})]);
  return {
    payment: row?.tableName === 'star_payments' || (row?.tableName === 'star_candidates' && row?.op === 'update' && keys.has('paying_by')),
    privateFields: ['date_of_birth', 'email_for_results'].filter((k) => row?.tableName === 'star_candidates' && keys.has(k)),
  };
}

// ----- Converting database rows to app objects -----

// One roster row (star_roster) → a Candidate.
function toCandidate(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    firstName: row.first_name,
    lastName: row.last_name,
    locationCode: row.location_code, // the candidate's school: 'worcester' | 'shrewsbury'
    dan: row.dan,
    danLabel: row.dan_label,
    starsFrom: row.stars_from,
    starsTo: row.stars_from + 1, // never stored (§2.4)
    starLimit: row.star_limit,
    payingBy: row.paying_by ?? null, // 'cash' | 'check' | 'card' | null (make-ups)
    source: row.source, // 'form' | 'desk'
    reference: row.reference ?? null, // 'ST-4001' on family-form rows
    registeredAt: row.registered_at,
    status: row.status, // 'active' | 'withdrawn'
    withdrawnReason: row.withdrawn_reason ?? null, // 'withdrawn' | 'duplicate_copy'
    withdrawnAt: row.withdrawn_at ?? null,
    withdrawnByName: row.withdrawn_by_name ?? null,
    duplicateState: row.duplicate_state, // 'none' | 'possible' | 'kept_both'
    duplicateOf: row.duplicate_of ?? null,
    isMakeup: row.is_makeup === true,
    makeupOfCandidateId: row.makeup_of_candidate_id ?? null,
    makeupOfEventName: row.makeup_of_event_name ?? null,
    privateOn: row.private_on ?? null,
    privateTime: row.private_time ? shortStartTime(row.private_time) : null, // '16:00'
    classesAttended: row.classes_attended ?? null,
    assistantClasses: row.assistant_classes ?? null,
    version: row.version,
    createdAt: row.created_at,
    createdByName: row.created_by_name,
    updatedAt: row.updated_at,
    updatedByName: row.updated_by_name,
    testingDate: row.testing_date,
    standardCents: row.standard_cents,
    sameDayCents: row.same_day_cents,
    privateCents: row.private_cents,
    // The payment state, worked out by the DATABASE (§2.12 / §5.2–§5.3). Screens never work out fees.
    paidCents: row.paid_cents,
    paid: row.paid === true,
    lastPaymentId: row.last_payment_id ?? null, // the toast's / admin's Undo and Edit payment use it
    paidOn: row.paid_on ?? null,
    paidMethod: row.paid_method ?? null,
    lastPaymentRecordedAt: row.last_payment_recorded_at ?? null,
    lastPaymentRecordedByName: row.last_payment_recorded_by_name ?? null,
    refundedCents: row.refunded_cents ?? 0, // refunds not undone (positive)
    feeKind: row.fee_kind, // 'none' | 'private' | 'standard' | 'same_day'
    expectedFeeCents: row.expected_fee_cents, // what Record payment fills in
    overpaidCents: row.overpaid_cents ?? 0,
    makeupSubjects: [], // filled in by loadCandidates for make-up rows
  };
}

const toMakeupSubject = (row) => ({ id: row.id, candidateId: row.candidate_id, eventCategoryId: row.event_category_id, kind: row.kind });

function toPayment(row, reversed) {
  return {
    id: row.id,
    candidateId: row.candidate_id,
    kind: row.kind, // 'payment' | 'refund' | 'reversal'
    amountCents: row.amount_cents, // refunds negative; a reversal is minus the row it undoes
    method: row.method,
    paidOn: row.paid_on, // a payment's "Date paid", a refund's date; a reversal's day
    recordedAt: row.recorded_at,
    recordedByName: row.recorded_by_name,
    reversesPaymentId: row.reverses_payment_id ?? null,
    reversed: reversed.has(row.id), // worked out here: a reversal row undoes it
  };
}

// The result (§5.5) in camelCase. null stays null.
export function toResult(r) {
  if (!r) return null;
  return {
    candidateId: r.candidate_id,
    eventId: r.event_id,
    dan: r.dan,
    starsFrom: r.stars_from,
    starsTo: r.stars_to,
    status: r.status, // 'withdrawn' | 'testing_privately' | 'not_finished' | 'passed' | 'makeup'
    total: toNumber(r.total),
    maxScore: toNumber(r.max_score),
    passMark: toNumber(r.pass_mark),
    complete: r.complete === true,
    gradedCount: r.graded_count,
    subjectCount: r.subject_count,
    subjects: (r.subjects ?? []).map((s) => ({
      eventCategoryId: s.event_category_id,
      name: s.name,
      credits: s.credits,
      position: s.position,
      fromClassCount: s.from_class_count === true,
      grade: s.grade ?? null,
      points: toNumber(s.points),
      kept: s.kept === true,
      keptFromEventName: s.kept_from_event_name ?? null,
      retest: s.retest === true,
    })),
    ai: { ageGroup: r.ai?.age_group ?? 'adult', count: r.ai?.count ?? null, grade: r.ai?.grade ?? null },
    dSubjects: r.d_subjects ?? [],
    makeupReasons: r.makeup_reasons ?? [], // ⊆ ['d', 'below']
    needs: r.needs ?? [], // subject names to retest
    needsIds: r.needs_ids ?? [],
    choiceNeeded: r.choice_needed === true,
    missing: r.missing ?? [],
    private: r.private ? { on: r.private.on, time: shortStartTime(r.private.time) } : null,
    resultKey: r.result_key,
  };
}

export const toSent = (s) => ({
  sent: s?.sent ? { id: s.sent.id, markedAt: s.sent.marked_at, markedByName: s.sent.marked_by_name, resultStatus: s.sent.result_status } : null,
  matches: s?.matches === true,
});

// star_candidate_detail's ok answer → the detail object (the ONLY place DOB and email appear).
function toDetail(d) {
  const c = d.candidate;
  if (!c || !isUuidText(c.id)) return null;
  const rows = Array.isArray(d.payments) ? d.payments : [];
  const reversed = new Set(rows.map((p) => p.reverses_payment_id).filter(Boolean));
  return {
    candidate: {
      id: c.id,
      eventId: c.event_id,
      firstName: c.first_name,
      lastName: c.last_name,
      dateOfBirth: c.date_of_birth ?? null, // PRIVATE — hide while "Hide private details" is on
      emailForResults: c.email_for_results ?? null, // PRIVATE — idem
      ageOnTestingDay: c.age_on_testing_day ?? null,
      locationCode: c.location_code,
      dan: c.dan,
      danLabel: c.dan_label,
      starsFrom: c.stars_from,
      starsTo: c.stars_to,
      payingBy: c.paying_by ?? null,
      source: c.source,
      reference: c.reference ?? null,
      registeredAt: c.registered_at,
      status: c.status,
      withdrawnReason: c.withdrawn_reason ?? null,
      withdrawnAt: c.withdrawn_at ?? null,
      withdrawnByName: c.withdrawn_by_name ?? null,
      duplicateState: c.duplicate_state,
      duplicateOf: c.duplicate_of ?? null,
      isMakeup: c.is_makeup === true,
      makeupOfCandidateId: c.makeup_of_candidate_id ?? null,
      makeupOfEventName: c.makeup_of_event_name ?? null,
      privateOn: c.private_on ?? null,
      privateTime: c.private_time ? shortStartTime(c.private_time) : null,
      classesAttended: c.classes_attended ?? null,
      assistantClasses: c.assistant_classes ?? null,
      testingDate: c.testing_date,
      version: c.version,
      createdAt: c.created_at,
      createdByName: c.created_by_name,
      updatedAt: c.updated_at,
      updatedByName: c.updated_by_name,
    },
    signature: {
      state: d.signature?.state ?? 'none', // 'on_file' | 'removed' | 'none' (desk rows)
      signedAt: d.signature?.signed_at ?? null,
      signatureDeletedAt: d.signature?.signature_deleted_at ?? null,
      ackVersion: d.signature?.ack_version ?? null,
    },
    payments: rows.map((p) => toPayment(p, reversed)), // oldest first
    paidCents: d.paid_cents,
    expectedFeeCents: d.expected_fee_cents,
    feeKind: d.fee_kind,
    overpaidCents: d.overpaid_cents,
    makeupSubjects: (d.makeup_subjects ?? []).map((m) => ({ eventCategoryId: m.event_category_id, name: m.name, kind: m.kind })),
    result: toResult(d.result),
    sent: toSent(d.sent),
  };
}

const toHistoryRow = (r) => ({
  occurredAt: r.occurred_at,
  actorName: r.actor_name, // "Family form" for the family form
  action: r.action, // the function's name, e.g. 'star_record_payment'
  tableName: r.table_name,
  op: r.op, // 'insert' | 'update' | 'delete'
  before: r.before ?? null, // the changed columns, database names (snake_case)
  after: r.after ?? null,
});

const toMakeupRow = (r) => ({
  candidateId: r.candidate_id, // the EARLIER candidate — what addMakeup sends
  firstName: r.first_name,
  lastName: r.last_name,
  locationCode: r.location_code,
  dan: r.dan,
  starsFrom: r.stars_from,
  starsTo: r.stars_to,
  earlierEventId: r.earlier_event_id,
  earlierEventName: r.earlier_event_name,
  earlierTestingDate: r.earlier_testing_date,
  needs: Array.isArray(r.needs) ? r.needs : [],
  choiceNeeded: r.choice_needed === true, // "Can't add yet" (OPEN-11)
  alreadyAdded: r.already_added === true, // "Already added"
});

// Builds the API functions around a client. getClient() returns the Supabase client (or a
// look-alike) — or null when no connection is set up. getToday() returns 'YYYY-MM-DD' in school time.
export function createStarCandidatesApi(getClient, getToday) {
  // The has_data_access check that goes with every TABLE read: a locked sign-in gets EMPTY lists
  // from the database (row-level security), which must not look like "No candidates yet".
  async function accessCheck(client) {
    const res = await client.rpc('has_data_access');
    if (res?.error) return failure(res.error);
    if (res?.data === false) return { status: 'no_access' };
    if (res?.data !== true) return unexpected('has_data_access');
    return null; // fine
  }

  // Calls one database function and turns its answer into { status, … }. readOk(data) checks the
  // ok answer and converts it; null = wrong shape → 'error' rather than a guess. Two refusals carry
  // an extra number (§1.3): grades_exist → gradeCount, refund_too_large → overpaidCents.
  // Every call is a normal POST (never { get: true }): star_makeup_list WRITES (it runs the
  // signature clean-up), and a GET request runs read-only, so it would fail (contract §7).
  async function callRpc(name, args, readOk) {
    try {
      const client = getClient();
      if (!client) return failure(new Error('No connection is set up'));
      const { data, error } = await client.rpc(name, args);
      if (error) return failure(error);
      const status = data?.status;
      if (typeof status !== 'string' || !SERVER_STATUSES.has(status)) return unexpected(name);
      if (status === 'grades_exist') return isInt(data.grade_count) ? { status, gradeCount: data.grade_count } : unexpected(name);
      if (status === 'refund_too_large') return isInt(data.overpaid_cents) ? { status, overpaidCents: data.overpaid_cents } : unexpected(name);
      if (status !== 'ok') return { status }; // other non-ok answers carry only the status
      const result = readOk(data);
      return result ? { status: 'ok', ...result } : unexpected(name);
    } catch (error) {
      return failure(error);
    }
  }

  // Shared start of every call taking one id: a value that isn't a uuid can't exist → 'not_found'.
  const idCall = (name, id, readOk) => {
    const value = asId(id);
    if (value === BAD) return Promise.resolve({ status: 'invalid' });
    if (notAnId(value)) return Promise.resolve({ status: 'not_found' });
    return callRpc(name, { [name === 'star_makeup_list' ? 'p_event_id' : 'p_candidate_id']: value }, readOk);
  };

  // ----- Reading -----

  // The Candidates tab: every candidate of one event (active AND withdrawn — the screen groups the
  // Removed ones), in belt order, each with its payment state; make-up rows carry their retest
  // subjects (names come from the event copy, loadStarEvent's copy.dans[].categories).
  async function loadCandidates(eventId) {
    try {
      if (!isUuidText(eventId)) return { status: 'not_found' };
      const client = getClient();
      if (!client) return failure(new Error('No connection is set up'));
      const today = getToday();
      const [rosterRes, denied] = await Promise.all([
        client.from('star_roster').select(ROSTER_COLUMNS).eq('event_id', eventId),
        accessCheck(client),
      ]);
      if (denied) return denied;
      if (rosterRes?.error) return failure(rosterRes.error);
      if (!Array.isArray(rosterRes?.data)) return unexpected('star_roster');
      const candidates = rosterRes.data.map(toCandidate);
      const makeupIds = candidates.filter((c) => c.isMakeup).map((c) => c.id);
      if (makeupIds.length > 0) {
        const subjectRes = await client.from('star_makeup_subjects').select(MAKEUP_SUBJECT_COLUMNS).in('candidate_id', makeupIds);
        if (subjectRes?.error) return failure(subjectRes.error);
        if (!Array.isArray(subjectRes?.data)) return unexpected('star_makeup_subjects');
        const byCandidate = new Map(candidates.map((c) => [c.id, c]));
        for (const row of subjectRes.data) byCandidate.get(row.candidate_id)?.makeupSubjects.push(toMakeupSubject(row));
      }
      return { status: 'ok', today, candidates: sortBeltOrder(candidates) };
    } catch (error) {
      return failure(error);
    }
  }

  // One candidate's detail view (also: the compare dialog calls it once per column, Delete
  // permanently reads its payment ids here). The ONLY read with date of birth and email.
  const loadCandidateDetail = (candidateId) => idCall('star_candidate_detail', candidateId, toDetail);

  // History (v0.169): newest first, at most 500 rows.
  const loadCandidateHistory = (candidateId) => idCall('star_candidate_history', candidateId,
    (d) => (Array.isArray(d.rows) ? { rows: d.rows.map(toHistoryRow) } : null));

  // View signature: the drawing (a PNG data URL) or null (desk row, or removed after 90 days).
  // Only a PNG data URL is passed on (the screen draws it as an <img>); anything else counts as none.
  const viewSignature = (candidateId) => idCall('star_view_signature', candidateId, (d) => ({
    signature: typeof d.signature === 'string' && d.signature.startsWith('data:image/png;base64,') ? d.signature : null,
    signedAt: d.signed_at ?? null,
    signatureDeletedAt: d.signature_deleted_at ?? null,
  }));

  // "Make-up from an earlier testing" (v0.111): the people who owe a make-up from an EARLIER event,
  // newest earlier event first. The name search is the screen's. A POST (it writes: the clean-up).
  const loadMakeupList = (eventId) => idCall('star_makeup_list', eventId,
    (d) => (Array.isArray(d.rows) ? { rows: d.rows.map(toMakeupRow) } : null));

  // ----- Writing (one database function each, contract 0006 §6.3–§6.4) -----

  const readVersion = (d) => (isInt(d.version) ? { version: d.version } : null);
  const readNothing = () => ({});
  const readPayment = (d) => (isUuidText(d.payment_id) && isInt(d.version) ? { paymentId: d.payment_id, version: d.version } : null);

  // Sends args after the shared checks: BAD values → 'invalid'; ids that aren't uuids → 'not_found'.
  function send(name, args, idKeys, readOk) {
    if (isBad(Object.values(args))) return Promise.resolve({ status: 'invalid' });
    if (idKeys.some((k) => notAnId(args[k]))) return Promise.resolve({ status: 'not_found' });
    return callRpc(name, args, readOk);
  }

  // New candidate at the desk (staff and admins). dateOfBirth may be null (S3); email is required.
  function addCandidate({ eventId, firstName, lastName, dateOfBirth = null, email, locationCode, dan, starsFrom, payingBy } = {}) {
    return send('star_add_candidate', {
      p_event_id: asId(eventId), p_first: asText(firstName), p_last: asText(lastName), p_date_of_birth: asDate(dateOfBirth),
      p_email: asText(email), p_location_code: asText(locationCode), p_dan: asInteger(dan), p_stars_from: asInteger(starsFrom),
      p_paying_by: asText(payingBy),
    }, ['p_event_id'], (d) => (isUuidText(d.id) && isInt(d.version) ? { id: d.id, version: d.version } : null));
  }

  // Make-up from an earlier testing: earlierCandidateId = a make-up list row's candidateId.
  function addMakeup({ eventId, earlierCandidateId } = {}) {
    return send('star_add_makeup', { p_event_id: asId(eventId), p_earlier_candidate_id: asId(earlierCandidateId) },
      ['p_event_id', 'p_earlier_candidate_id'],
      (d) => (isUuidText(d.id) && isInt(d.version) && isInt(d.kept_count) && isInt(d.retest_count)
        ? { id: d.id, version: d.version, keptCount: d.kept_count, retestCount: d.retest_count } : null));
  }

  // Edit details. A Dan change that would clear grades answers { status:'grades_exist', gradeCount };
  // the confirmation then calls again with clearGradeCount = that number.
  function updateCandidate({
    candidateId, expectedVersion, firstName, lastName, dateOfBirth = null, email, locationCode, dan, starsFrom, clearGradeCount = null,
  } = {}) {
    return send('star_update_candidate', {
      p_candidate_id: asId(candidateId), p_expected_version: asInteger(expectedVersion), p_first: asText(firstName),
      p_last: asText(lastName), p_date_of_birth: asDate(dateOfBirth), p_email: asText(email), p_location_code: asText(locationCode),
      p_dan: asInteger(dan), p_stars_from: asInteger(starsFrom), p_clear_grade_count: asInteger(clearGradeCount),
    }, ['p_candidate_id'], (d) => (isInt(d.version) && isInt(d.cleared_grade_count)
      ? { version: d.version, clearedGradeCount: d.cleared_grade_count } : null));
  }

  function changePayingBy({ candidateId, expectedVersion, payingBy } = {}) {
    return send('star_change_paying_by', {
      p_candidate_id: asId(candidateId), p_expected_version: asInteger(expectedVersion), p_paying_by: asText(payingBy),
    }, ['p_candidate_id'], readVersion);
  }

  // The Possible duplicate box: keepBoth true = "Not the same person — keep both"; false = keep
  // keepId and move otherId to Removed as a duplicate copy (staff may Undo it for 10 s, restoreCandidate).
  function resolveDuplicate({ keepId, keepVersion, otherId, otherVersion, keepBoth } = {}) {
    return send('star_resolve_duplicate', {
      p_keep_id: asId(keepId), p_keep_version: asInteger(keepVersion), p_other_id: asId(otherId),
      p_other_version: asInteger(otherVersion), p_keep_both: asBoolean(keepBoth),
    }, ['p_keep_id', 'p_other_id'], (d) => (isInt(d.keep_version) && isInt(d.other_version)
      ? { keepVersion: d.keep_version, otherVersion: d.other_version } : null));
  }

  // Set / change private testing (privateOn 'YYYY-MM-DD', privateTime '16:00'); clearPrivate = Back to
  // the testing day. expectedFeeCents = the fee owed afterwards (worked out by the database).
  function setPrivate({ candidateId, expectedVersion, privateOn, privateTime } = {}) {
    return send('star_set_private', {
      p_candidate_id: asId(candidateId), p_expected_version: asInteger(expectedVersion), p_private_on: asDate(privateOn),
      p_private_time: asTime(privateTime),
    }, ['p_candidate_id'], (d) => (isInt(d.version) && isInt(d.expected_fee_cents)
      ? { version: d.version, expectedFeeCents: d.expected_fee_cents } : null));
  }
  const clearPrivate = ({ candidateId, expectedVersion } = {}) => setPrivate({ candidateId, expectedVersion, privateOn: null, privateTime: null });

  const withdrawCandidate = ({ candidateId, expectedVersion } = {}) => send('star_withdraw_candidate',
    { p_candidate_id: asId(candidateId), p_expected_version: asInteger(expectedVersion) }, ['p_candidate_id'], readVersion);

  const restoreCandidate = ({ candidateId, expectedVersion } = {}) => send('star_restore_candidate',
    { p_candidate_id: asId(candidateId), p_expected_version: asInteger(expectedVersion) }, ['p_candidate_id'], readVersion);

  // Delete permanently (admin). expectedPaymentIds = the ids of EVERY payment row the warning was
  // built from (loadCandidateDetail(…).payments.map((p) => p.id)); 'stale' if they changed since.
  const deleteCandidate = ({ candidateId, expectedVersion, expectedPaymentIds } = {}) => send('star_delete_candidate', {
    p_candidate_id: asId(candidateId), p_expected_version: asInteger(expectedVersion), p_expected_payment_ids: asIdList(expectedPaymentIds),
  }, ['p_candidate_id'], readNothing);

  // Record payment: amountCents pre-filled from candidate.expectedFeeCents (staff may change it).
  const recordPayment = ({ candidateId, expectedVersion, method, amountCents, paidOn } = {}) => send('star_record_payment', {
    p_candidate_id: asId(candidateId), p_expected_version: asInteger(expectedVersion), p_method: asText(method),
    p_amount_cents: asInteger(amountCents), p_paid_on: asDate(paidOn),
  }, ['p_candidate_id'], readPayment);

  // Undo payment / Undo refund (a reversal row). Staff: their own payment within 10 seconds (the
  // toast); admins any time. paymentId = candidate.lastPaymentId, or a refund's id from the detail.
  const undoPayment = ({ paymentId } = {}) => send('star_undo_payment', { p_payment_id: asId(paymentId) }, ['p_payment_id'], readVersion);

  // Edit payment (admin): a reversal + a new payment. paymentId = the new payment's id.
  const editPayment = ({ paymentId, method, amountCents, paidOn } = {}) => send('star_edit_payment', {
    p_payment_id: asId(paymentId), p_method: asText(method), p_amount_cents: asInteger(amountCents), p_paid_on: asDate(paidOn),
  }, ['p_payment_id'], readPayment);

  // Record refund (admin, S7): at most the overpaid amount; method 'cash' | 'check'.
  const recordRefund = ({ candidateId, expectedVersion, method, amountCents, refundedOn } = {}) => send('star_record_refund', {
    p_candidate_id: asId(candidateId), p_expected_version: asInteger(expectedVersion), p_method: asText(method),
    p_amount_cents: asInteger(amountCents), p_refunded_on: asDate(refundedOn),
  }, ['p_candidate_id'], readPayment);

  return {
    loadCandidates, loadCandidateDetail, loadCandidateHistory, viewSignature, loadMakeupList,
    addCandidate, addMakeup, updateCandidate, changePayingBy, resolveDuplicate, setPrivate, clearPrivate,
    withdrawCandidate, restoreCandidate, deleteCandidate, recordPayment, undoPayment, editPayment, recordRefund,
  };
}
