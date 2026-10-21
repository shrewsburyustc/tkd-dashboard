// privateApi.js — every call the Private testing tab, its grading page and the event page's
// "Move to private testing" make to the database (Color Belt phase 4, migration 0014).
// Why it exists: like eventsApi.js does for events, this keeps the table and view names, the
// column lists and the exact argument names of the database functions (contract 0014 §2.5, §4.2)
// in one place. Screens call friendly camelCase functions and always get back a plain object with
// a `status` CODE (never words — the screens' text.js turns codes into words):
//   'ok' (plus the result fields) · 'no_access' · 'not_allowed' · 'not_found' · 'stale' ·
//   'invalid' · 'withdrawn' · 'past_day' · 'has_result' · 'graded' · 'cancelled' ·
//   'already_paid' · 'not_open' · 'finished' · 'final_award_not_set' (+ className) · 'moved' ·
//   'error' (no connection / unexpected answer — { status:'error', error })
// These functions NEVER throw.
//
// A private testing is its own record (not part of any event): the student's name, the class,
// rank, belt and testing-for COPIED from Classes and ranks (or from the event, for a move), its
// private price, day and time, payments and result. Times: the database sends '16:00:00'; this
// file turns it into '16:00'. Dates stay 'YYYY-MM-DD'. Money is whole cents (8500 = $85).
import { supabase } from '../supabase.js';
import { schoolToday } from './eventsApi.js';
import { shortTime, isIsoDate } from './eventRules.js';
import { RESULTS } from './gradingRules.js';
import { owesMore, privateSide } from './privateRules.js';

// Every status a call here can return (contract 0014 §1.4 + 'error').
export const PRIVATE_STATUSES = [
  'ok', 'no_access', 'not_allowed', 'not_found', 'stale', 'invalid', 'withdrawn', 'past_day', 'has_result', 'graded',
  'cancelled', 'already_paid', 'not_open', 'finished', 'final_award_not_set', 'moved', 'error',
];
const SERVER_STATUSES = new Set(PRIVATE_STATUSES.filter((s) => s !== 'error'));
const KNOWN_LOCATIONS = new Set(['worcester', 'shrewsbury']);

// The columns we read — never '*' (the database refuses it: login ids are never given out).
const BELT = 'belt_pattern, belt_color, belt_color_2, belt_end_stripes, belt_end_stripe_color';
const TO_BELT = 'to_belt_pattern, to_belt_color, to_belt_color_2, to_belt_end_stripes, to_belt_end_stripe_color';
// The view testing_private_list: the private testing + its payment summary + what is owed.
const LIST_COLUMNS = `id, location_code, first_name, last_name, class_id, class_name, rank_id, rank_name, ${BELT}, to_kind, to_name, ${TO_BELT}, private_cents, paying_by, stripes_confirmed, private_date, private_time, status, cancelled_at, cancelled_by_name, moved_from_event_id, moved_from_registration_id, moved_from_event_name, version, created_at, created_by_name, updated_at, updated_by_name, paid, paid_cents, paid_on, paid_method, last_payment_id, last_payment_recorded_at, amount_due_cents`;
const PAYMENT_COLUMNS = 'id, private_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by_name, reverses_payment_id, moved_from_payment_id';
const RESULT_COLUMNS = 'private_id, result, note, updated_at, updated_by_name';
// How many ids go into one "id is one of these" filter (they travel in the web address).
const IN_CHUNK = 80;

const failure = (error) => ({ status: 'error', error });
const unexpected = (what) => failure(new Error(`Unexpected answer from ${what}`));

// ----- Converting database rows to app objects -----

const beltOf = (row, prefix = '') => ({
  beltPattern: row[`${prefix}belt_pattern`] ?? null,
  beltColor: row[`${prefix}belt_color`] ?? null,
  beltColor2: row[`${prefix}belt_color_2`] ?? null,
  beltEndStripes: row[`${prefix}belt_end_stripes`] ?? null,
  beltEndStripeColor: row[`${prefix}belt_end_stripe_color`] ?? null,
});

// A results row → the grading fields of a private testing. No row = nothing recorded.
function toResult(row) {
  const result = RESULTS.includes(row?.result) ? row.result : null;
  const note = typeof row?.note === 'string' ? row.note : null;
  return {
    result, // 'pass' | 'not_passed' | 'no_show' | null
    note,
    resultAt: row?.updated_at ?? null,
    resultByName: row?.updated_by_name ?? null,
    graded: Boolean(row), // a results row exists (result or note) — the Edit details lock
  };
}

// A row of testing_private_list (+ its results row) → the app's private testing.
function toPrivateRow(row, resultRow, today) {
  const testingFor = row.to_kind === 'rank'
    ? { kind: 'rank', name: row.to_name, belt: beltOf(row, 'to_') }
    : { kind: 'none', name: null, belt: null };
  const out = {
    id: row.id,
    locationCode: row.location_code,
    firstName: row.first_name,
    lastName: row.last_name,
    classId: row.class_id ?? null,
    className: row.class_name,
    rankId: row.rank_id ?? null,
    rankName: row.rank_name,
    belt: beltOf(row),
    testingFor,
    privateCents: row.private_cents,
    payingBy: row.paying_by,
    stripesConfirmed: row.stripes_confirmed === true,
    privateDate: row.private_date,
    privateTime: shortTime(row.private_time),
    status: row.status, // 'active' | 'cancelled'
    cancelledAt: row.cancelled_at ?? null,
    cancelledByName: row.cancelled_by_name ?? null,
    movedFromEventId: row.moved_from_event_id ?? null,
    movedFromRegistrationId: row.moved_from_registration_id ?? null,
    movedFromEventName: row.moved_from_event_name ?? null,
    version: row.version,
    createdAt: row.created_at,
    createdByName: row.created_by_name,
    updatedAt: row.updated_at,
    updatedByName: row.updated_by_name,
    paid: row.paid === true,
    paidCents: row.paid_cents ?? 0,
    paidOn: row.paid_on ?? null,
    paidMethod: row.paid_method ?? null,
    lastPaymentId: row.last_payment_id ?? null,
    lastPaymentRecordedAt: row.last_payment_recorded_at ?? null,
    amountDueCents: row.amount_due_cents ?? 0,
    ...toResult(resultRow),
  };
  out.owesMore = owesMore(out); // privateRules.js
  out.side = privateSide(out, today); // 'upcoming' | 'past'
  return out;
}

function toPayment(row) {
  return {
    id: row.id,
    privateId: row.private_id,
    kind: row.kind, // 'payment' | 'reversal'
    amountCents: row.amount_cents, // a reversal is negative
    method: row.method,
    paidOn: row.paid_on,
    recordedAt: row.recorded_at,
    recordedByName: row.recorded_by_name,
    reversesPaymentId: row.reverses_payment_id ?? null,
    movedFromPaymentId: row.moved_from_payment_id ?? null, // set = it arrived with a move
  };
}
// Oldest first; the same moment → by id, so the last one is the database's "most recent payment"
// (order by recorded_at desc, id desc).
const byRecordedAt = (a, b) => (a.recordedAt < b.recordedAt ? -1 : a.recordedAt > b.recordedAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// ----- Reading -----

// The has_data_access check that goes with every read: a locked sign-in gets EMPTY lists from
// the database (row-level security), which must not look like "No private testings yet".
async function accessCheck() {
  const res = await supabase.rpc('has_data_access');
  if (res?.error) return failure(res.error);
  if (res?.data === false) return { status: 'no_access' };
  if (res?.data !== true) return unexpected('has_data_access');
  return null; // fine
}

// Reads rows whose `column` is one of `ids`, a few dozen ids per request.
async function selectIn(table, columns, column, ids) {
  const rows = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error } = await supabase.from(table).select(columns).in(column, ids.slice(i, i + IN_CHUNK));
    if (error) return { error };
    if (!Array.isArray(data)) return { error: new Error(`Unexpected answer from ${table}`) };
    rows.push(...data);
  }
  return { rows };
}

// One school's private testings (both sides — the screen splits them with
// privateRules.splitPrivate). → { status:'ok', today, rows:[…], payments:[…] } (payments oldest
// first) · 'no_access' · 'error'
export async function loadPrivateTestings(locationCode) {
  try {
    if (!KNOWN_LOCATIONS.has(locationCode)) return failure(new Error(`Unknown school: ${locationCode}`));
    if (!supabase) return failure(new Error('No connection is set up'));
    const today = schoolToday();
    const [listRes, denied] = await Promise.all([
      supabase.from('testing_private_list').select(LIST_COLUMNS).eq('location_code', locationCode),
      accessCheck(),
    ]);
    if (denied) return denied;
    if (listRes?.error) return failure(listRes.error);
    if (!Array.isArray(listRes.data)) return unexpected('testing_private_list');
    const ids = listRes.data.map((r) => r.id);
    const [resultRes, paymentRes] = await Promise.all([
      selectIn('testing_private_results', RESULT_COLUMNS, 'private_id', ids),
      selectIn('testing_private_payments', PAYMENT_COLUMNS, 'private_id', ids),
    ]);
    if (resultRes.error) return failure(resultRes.error);
    if (paymentRes.error) return failure(paymentRes.error);
    const resultOf = new Map(resultRes.rows.map((r) => [r.private_id, r]));
    const rows = listRes.data.map((row) => toPrivateRow(row, resultOf.get(row.id) ?? null, today));
    return { status: 'ok', today, rows, payments: paymentRes.rows.map(toPayment).sort(byRecordedAt) };
  } catch (error) {
    return failure(error);
  }
}

// One private testing (its grading page). → { status:'ok', today, startedAt, row, payments } ·
// 'not_found' (deleted, or a wrong link) · 'no_access' · 'error'. startedAt = Date.now() when
// this call STARTED (as eventsApi.loadEvent): the grading engine compares it with the time a
// save answered, so it never shows a read older than its own save.
export async function loadPrivateTesting(privateId) {
  const startedAt = Date.now();
  try {
    if (typeof privateId !== 'string' || privateId === '') return failure(new Error('No private testing id'));
    if (!supabase) return failure(new Error('No connection is set up'));
    const today = schoolToday();
    const [listRes, resultRes, paymentRes, denied] = await Promise.all([
      supabase.from('testing_private_list').select(LIST_COLUMNS).eq('id', privateId),
      supabase.from('testing_private_results').select(RESULT_COLUMNS).eq('private_id', privateId),
      supabase.from('testing_private_payments').select(PAYMENT_COLUMNS).eq('private_id', privateId),
      accessCheck(),
    ]);
    if (denied) return denied;
    for (const res of [listRes, resultRes, paymentRes]) if (res?.error) return failure(res.error);
    if (![listRes.data, resultRes.data, paymentRes.data].every(Array.isArray)) return unexpected('the private testing tables');
    if (listRes.data.length === 0) return { status: 'not_found' };
    const row = toPrivateRow(listRes.data[0], resultRes.data[0] ?? null, today);
    return { status: 'ok', today, startedAt, row, payments: paymentRes.data.map(toPayment).sort(byRecordedAt) };
  } catch (error) {
    return failure(error);
  }
}

// ----- Writing (one database function each, contract 0014 §2.5) -----

const isText = (v) => typeof v === 'string' && v.length > 0;
const isInt = (v) => Number.isInteger(v);
const isTextOrNull = (v) => v === null || typeof v === 'string';
const isBool = (v) => typeof v === 'boolean';
// The time as the database wants it ('16:00'); anything unreadable is sent as it is, so the
// database refuses it (invalid) instead of this file guessing.
const timeArg = (text) => shortTime(text) ?? text;

// Calls one database function and turns its answer into { status, … }. readOk(data) checks the
// ok answer and converts it to camelCase; null = wrong shape → 'error' rather than a guess.
async function callRpc(name, args, readOk) {
  try {
    if (!supabase) return failure(new Error('No connection is set up'));
    const { data, error } = await supabase.rpc(name, args);
    if (error) return failure(error);
    const status = data?.status;
    if (typeof status !== 'string' || !SERVER_STATUSES.has(status)) return unexpected(name);
    if (status === 'final_award_not_set') return { status, className: typeof data.class_name === 'string' ? data.class_name : null };
    if (status !== 'ok') return { status };
    const result = readOk(data);
    return result ? { status: 'ok', ...result } : unexpected(name);
  } catch (error) {
    return failure(error);
  }
}

const readNothing = () => ({});
const readVersion = (d) => (isInt(d.version) ? { version: d.version } : null);
const readResult = (d) => {
  if (!(d.result === null || RESULTS.includes(d.result))) return null;
  if (!isTextOrNull(d.note) || !isTextOrNull(d.updated_at) || !isTextOrNull(d.updated_by_name)) return null;
  return { result: d.result, note: d.note, resultAt: d.updated_at, resultByName: d.updated_by_name };
};

// Add private testing (P2). rankId = a rank of Classes and ranks of that school (its class,
// belt, testing-for and private price are copied). → { status:'ok', id, version, amountDueCents }
// · 'past_day' · 'invalid' (also more than a year ahead, another school's rank) · 'stale' (the
// rank was removed meanwhile) · 'final_award_not_set' + className
export async function addPrivate({ locationCode, firstName, lastName, rankId, stripes, payingBy, privateDate, privateTime } = {}) {
  return callRpc(
    'testing_private_add',
    {
      p_location_code: locationCode, p_first: firstName, p_last: lastName, p_rank_id: rankId, p_stripes: stripes,
      p_paying_by: payingBy, p_private_date: privateDate, p_private_time: timeArg(privateTime),
    },
    (d) => (isText(d.id) && isInt(d.version) && isInt(d.amount_due_cents) ? { id: d.id, version: d.version, amountDueCents: d.amount_due_cents } : null),
  );
}

// Edit details: names and belt. Send the STORED rankId back to keep the belt (it is never looked
// up — it may no longer be in Classes and ranks). A new rank re-copies everything incl. today's
// private price. → { status:'ok', version, amountDueCents, resultCleared } · 'not_allowed'
// (staff, after the day, belt change of a graded one) · 'cancelled' · 'stale' · 'invalid' …
export async function updatePrivate({ privateId, expectedVersion, firstName, lastName, rankId } = {}) {
  return callRpc(
    'testing_private_update',
    { p_private_id: privateId, p_expected_version: expectedVersion, p_first: firstName, p_last: lastName, p_rank_id: rankId },
    (d) => (isInt(d.version) && isInt(d.amount_due_cents) && isBool(d.result_cleared)
      ? { version: d.version, amountDueCents: d.amount_due_cents, resultCleared: d.result_cleared }
      : null),
  );
}

// Change day or time (P4). A No show is cleared with its note (resultCleared true); the same day
// and time writes nothing. → { status:'ok', version, privateDate, privateTime, resultCleared } ·
// 'past_day' · 'invalid' · 'graded' (Pass / Not passed) · 'cancelled' · 'stale' …
export async function changePrivateDay({ privateId, expectedVersion, privateDate, privateTime } = {}) {
  return callRpc(
    'testing_private_change_day',
    { p_private_id: privateId, p_expected_version: expectedVersion, p_private_date: privateDate, p_private_time: timeArg(privateTime) },
    (d) => {
      const time = shortTime(d.private_time);
      if (!isInt(d.version) || !isIsoDate(d.private_date) || time === null || !isBool(d.result_cleared)) return null;
      return { version: d.version, privateDate: d.private_date, privateTime: time, resultCleared: d.result_cleared };
    },
  );
}

// Change how they'll pay: while not paid, or while money is still owed. → { status:'ok', version }
// · 'already_paid' · 'cancelled' · 'stale' …
export async function changePrivatePayingBy({ privateId, expectedVersion, payingBy } = {}) {
  return callRpc(
    'testing_private_change_paying_by',
    { p_private_id: privateId, p_expected_version: expectedVersion, p_paying_by: payingBy },
    readVersion,
  );
}

// Mark paid: the DATABASE records what is owed (the private price, or just the difference) by
// today's date and the current paying-by. → { status:'ok', paymentId, amountCents, method,
// version } · 'already_paid' (nothing owed — also a $0 price) · 'cancelled' · 'stale' …
export async function markPrivatePaid({ privateId, expectedVersion } = {}) {
  return callRpc(
    'testing_private_mark_paid',
    { p_private_id: privateId, p_expected_version: expectedVersion },
    (d) => (isText(d.payment_id) && isInt(d.amount_cents) && isText(d.method) && isInt(d.version)
      ? { paymentId: d.payment_id, amountCents: d.amount_cents, method: d.method, version: d.version }
      : null),
  );
}

// Undo payment: staff only within 10 seconds of their OWN Mark paid (never a payment that came
// with a move); admins any time. → { status:'ok', version } · 'not_allowed' · 'stale' (already
// undone) · 'cancelled' · 'invalid'
export async function undoPrivatePayment({ paymentId } = {}) {
  return callRpc('testing_private_undo_payment', { p_payment_id: paymentId }, readVersion);
}

// Edit payment (admins): the old payment is reversed and a new one recorded.
// → { status:'ok', paymentId (the new one), version }
export async function editPrivatePayment({ paymentId, method, amountCents, paidOn } = {}) {
  return callRpc(
    'testing_private_edit_payment',
    { p_payment_id: paymentId, p_method: method, p_amount_cents: amountCents, p_paid_on: paidOn },
    (d) => (isText(d.payment_id) && isInt(d.version) ? { paymentId: d.payment_id, version: d.version } : null),
  );
}

// Cancel private testing (payments stay). → { status:'ok', version } · 'graded' · 'cancelled' …
export async function cancelPrivate({ privateId, expectedVersion } = {}) {
  return callRpc('testing_private_cancel', { p_private_id: privateId, p_expected_version: expectedVersion }, readVersion);
}

// Restore (admins), while its day is today or later. → { status:'ok', version } · 'past_day' ·
// 'invalid' (not cancelled) · 'stale' …
export async function restorePrivate({ privateId, expectedVersion } = {}) {
  return callRpc('testing_private_restore', { p_private_id: privateId, p_expected_version: expectedVersion }, readVersion);
}

// Delete permanently (admins). expectedPaymentIds = the ids of ALL its payment rows (payments and
// reversals) the warning was built from; 'stale' if they differ now. → { status:'ok' }
export async function deletePrivate({ privateId, expectedVersion, expectedPaymentIds } = {}) {
  return callRpc(
    'testing_private_delete',
    { p_private_id: privateId, p_expected_version: expectedVersion, p_expected_payment_ids: expectedPaymentIds },
    readNothing,
  );
}

// Grading on the private testing's page. Both answer ok with what is stored NOW:
// { status:'ok', result, note, resultAt, resultByName } (nulls when nothing is saved). Refusals:
// 'not_open' (before the private day) · 'finished' (staff after it) · 'cancelled' · 'invalid' ·
// 'not_found' · 'stale' · 'error'. No version: the last change wins (Retry is safe).
export async function setPrivateResult({ privateId, result } = {}) {
  return callRpc('testing_private_set_result', { p_private_id: privateId, p_result: result }, readResult);
}

export async function setPrivateResultNote({ privateId, note } = {}) {
  return callRpc('testing_private_set_result_note', { p_private_id: privateId, p_note: note }, readResult);
}

// Move to private testing (the event page, P5): the registration leaves its event (listed under
// Removed) and its live payments move to the new private testing. → { status:'ok', privateId,
// version (1), registrationVersion, amountDueCents, resultCleared (a testing-day No show was
// removed — then there is no Undo) } · 'has_result' · 'withdrawn' · 'past_day' · 'stale' …
export async function moveToPrivate({ registrationId, expectedVersion, privateDate, privateTime } = {}) {
  return callRpc(
    'testing_move_to_private',
    { p_registration_id: registrationId, p_expected_version: expectedVersion, p_private_date: privateDate, p_private_time: timeArg(privateTime) },
    (d) => (isText(d.private_id) && isInt(d.version) && isInt(d.registration_version) && isInt(d.amount_due_cents) && isBool(d.result_cleared)
      ? { privateId: d.private_id, version: d.version, registrationVersion: d.registration_version, amountDueCents: d.amount_due_cents, resultCleared: d.result_cleared }
      : null),
  );
}

// Undo move (the toast's Undo): only the mover, within 10 seconds, while nothing changed.
// → { status:'ok', registrationId, registrationVersion } · 'not_allowed' (too late / not the
// mover / a No show was cleared) · 'stale' (something changed since) · 'not_found'
export async function undoMoveToPrivate({ privateId, expectedVersion } = {}) {
  return callRpc(
    'testing_private_undo_move',
    { p_private_id: privateId, p_expected_version: expectedVersion },
    (d) => (isText(d.registration_id) && isInt(d.registration_version) ? { registrationId: d.registration_id, registrationVersion: d.registration_version } : null),
  );
}
