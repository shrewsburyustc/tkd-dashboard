// eventsApi.js — every call the Events screens and the event page make to the database.
// Why it exists: like api.js does for Classes and ranks, this keeps table names, column lists and
// the exact argument names of the database functions (migration 0005, contract 0005 §1.8) in one
// place. Screens call friendly camelCase functions and always get back a plain object with a
// `status` CODE (never words — the screens' text.js turns codes into words):
//   'ok' (plus the result fields) · 'no_access' · 'not_allowed' · 'not_found' · 'stale' ·
//   'duplicate_name' · 'invalid' · 'not_empty' · 'final_award_not_set' (+ className) ·
//   'not_open' · 'closed' · 'finished' · 'already_paid' · 'withdrawn' · 'rate_limited' ·
//   'has_results' (phase 3: Edit event can't move the date of an event that has results) ·
//   'error' (no connection / unexpected answer — { status:'error', error })
// These functions NEVER throw.
//
// Phase 3 (Grading, migration 0010, contract 0010 §3.2) added: the testing_results table (read
// by loadEvent and loadResult) and the functions testing_set_result (setResult) and
// testing_set_result_note (setResultNote). Results have no version: the last change wins, and a
// result never changes a registration's version. updateStudent's answer may carry
// resultCleared: true (a belt change cleared the student's result).
//
// Phase 4 (private testing, migration 0014, contract 0014 §4.2) added: the registration columns
// private_date / private_time (read from testing_registrations — the testing_roster view is not
// changed), the money fields every roster row carries (priceCents, amountDueCents, owesMore),
// the Events tab's privateTestings list, and the functions testing_set_private (setPrivate),
// testing_clear_private (clearPrivate) and testing_add_private_student (addPrivateStudent).
// New statuses: 'past_day' (the private day is before today), 'has_result' (Set private on a
// student who already has a testing-day Pass / Not passed or a note), 'graded' (Change / Back on
// a private student who already has a result). Mark paid now records what is DUE (a private
// top-up records just the difference; nothing due → 'already_paid').
//
// Times: the database sends a time as '17:00:00'; this file turns it into '17:00'. Dates stay
// 'YYYY-MM-DD' text. Money is whole cents (6500 = $65).
import { supabase, isPreview } from '../supabase.js';
import { readStorage } from '../storage.js';
import {
  eventState, eventCounts, testingFor, todayInSchoolTime, shortTime, isIsoDate, PREVIEW_TODAY_KEY,
  isPrivate, priceFor, amountDue, owesMore, privateTestingsList,
} from './eventRules.js';
import { RESULTS, isGraded, addedAfterDay } from './gradingRules.js';

// Every status a call here can return.
export const EVENT_STATUSES = [
  'ok', 'no_access', 'not_allowed', 'not_found', 'stale', 'duplicate_name', 'invalid', 'not_empty',
  'final_award_not_set', 'rate_limited', 'not_open', 'closed', 'finished', 'already_paid', 'withdrawn', 'has_results',
  'past_day', 'has_result', 'graded', // phase 4 (private testing)
  'error',
];
const SERVER_STATUSES = new Set(EVENT_STATUSES.filter((s) => s !== 'error'));
const KNOWN_LOCATIONS = new Set(['worcester', 'shrewsbury']);

// The columns we read (the database refuses select('*') on purpose — some columns, like the
// signature, are never given to the app). Only columns contract 0005 §1.3–§1.8 names.
const EVENT_COLUMNS = 'id, location_code, name, testing_date, registration_open, auto_close_on, first_opened_at, public_code, note, version, created_at, created_by_name, updated_at, updated_by_name';
const BELT = 'belt_pattern, belt_color, belt_color_2, belt_end_stripes, belt_end_stripe_color';
const FA_BELT = 'fa_belt_pattern, fa_belt_color, fa_belt_color_2, fa_belt_end_stripes, fa_belt_end_stripe_color';
const EVENT_CLASS_COLUMNS = `id, event_id, class_id, class_name, position, start_time, end_time, final_award_kind, final_award_name, ${FA_BELT}`;
const EVENT_RANK_COLUMNS = `id, event_class_id, rank_id, name, position, ${BELT}, early_cents, day_cents, private_cents, sparring_gear`;
// The roster view: registration columns (no signature, no submission id) + payment summary.
// The class is worked out here from the event copy (event_rank_id → its class), so this list
// only uses columns the contract names exactly.
const ROSTER_COLUMNS = 'id, event_id, event_rank_id, first_name, last_name, paying_by, stripes_confirmed, source, reference, signed, signed_at, signature_deleted_at, ack_version, registered_at, status, withdrawn_reason, withdrawn_at, withdrawn_by_name, duplicate_state, duplicate_of, version, created_at, created_by_name, updated_at, updated_by_name, paid, paid_cents, paid_on, paid_method, last_payment_id, last_payment_recorded_at';
const PAYMENT_COLUMNS = 'id, registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by_name, reverses_payment_id';
// A student's grading result (phase 3). Never updated_by (the login id isn't given to the app)
// and never '*' (the database refuses it).
const RESULT_COLUMNS = 'registration_id, result, note, updated_at, updated_by_name';
// A student's private day and start time (phase 4). Read from testing_registrations by id — the
// roster view doesn't have them (contract 0014 §2.1). Never '*'.
const PRIVATE_COLUMNS = 'id, private_date, private_time';
// How many ids go into one "id is one of these" filter (they travel in the web address).
const IN_CHUNK = 80;

const failure = (error) => ({ status: 'error', error });
const unexpected = (what) => failure(new Error(`Unexpected answer from ${what}`));

// "Today" at the school. In preview mode __tkdPreview.setToday('YYYY-MM-DD') can pretend another
// date (the preview database uses the same pretend date). That branch is dropped from the real
// build, because Vite replaces isPreview with false there.
export function schoolToday() {
  if (isPreview) {
    const pretend = readStorage(PREVIEW_TODAY_KEY);
    if (isIsoDate(pretend)) return pretend;
  }
  return todayInSchoolTime(new Date());
}

// ----- Converting database rows to app objects -----

const beltOfRow = (row, prefix = '') => ({
  beltPattern: row[`${prefix}belt_pattern`] ?? null,
  beltColor: row[`${prefix}belt_color`] ?? null,
  beltColor2: row[`${prefix}belt_color_2`] ?? null,
  beltEndStripes: row[`${prefix}belt_end_stripes`] ?? null,
  beltEndStripeColor: row[`${prefix}belt_end_stripe_color`] ?? null,
});

function toEvent(row, today) {
  const event = {
    id: row.id,
    locationCode: row.location_code,
    name: row.name,
    testingDate: row.testing_date,
    registrationOpen: row.registration_open === true,
    autoCloseOn: row.auto_close_on ?? null,
    firstOpenedAt: row.first_opened_at ?? null,
    publicCode: row.public_code,
    note: row.note ?? null,
    version: row.version,
    createdAt: row.created_at,
    createdByName: row.created_by_name,
    updatedAt: row.updated_at,
    updatedByName: row.updated_by_name,
  };
  event.state = eventState(event, today); // eventRules.js: 'open', 'closed', 'finished' …
  return event;
}

function toEventRank(row) {
  return {
    id: row.id,
    eventClassId: row.event_class_id,
    rankId: row.rank_id,
    name: row.name,
    position: row.position,
    ...beltOfRow(row),
    earlyCents: row.early_cents,
    dayCents: row.day_cents,
    privateCents: row.private_cents,
    sparringGear: row.sparring_gear === true,
  };
}

// An event class with its ranks. finalAward: { kind:'rank', name, belt } or { kind:'none' }.
function toEventClass(row, ranks) {
  const kind = row.final_award_kind;
  return {
    id: row.id,
    eventId: row.event_id,
    classId: row.class_id,
    className: row.class_name,
    position: row.position,
    startTime: shortTime(row.start_time),
    endTime: shortTime(row.end_time),
    // The copy in eventRules' field names too (testingFor reads these).
    finalAwardKind: kind,
    finalAwardName: row.final_award_name ?? null,
    faBeltPattern: row.fa_belt_pattern ?? null,
    faBeltColor: row.fa_belt_color ?? null,
    faBeltColor2: row.fa_belt_color_2 ?? null,
    faBeltEndStripes: row.fa_belt_end_stripes ?? null,
    faBeltEndStripeColor: row.fa_belt_end_stripe_color ?? null,
    finalAward: kind === 'rank' ? { kind, name: row.final_award_name, belt: beltOfRow(row, 'fa_') } : { kind: 'none' },
    ranks,
  };
}

// A testing_results row → the grading fields every roster row carries. No row = not graded.
function toResult(row) {
  const result = RESULTS.includes(row?.result) ? row.result : null;
  const note = typeof row?.note === 'string' ? row.note : null;
  return {
    result, // 'pass' | 'not_passed' | 'no_show' | null (not recorded yet)
    note, // the grading note (one line) or null
    resultAt: row?.updated_at ?? null, // when the result or note last changed
    resultByName: row?.updated_by_name ?? null, // who changed it
    graded: isGraded({ result, note }),
  };
}

// privateRow = the student's { private_date, private_time } (phase 4), or null.
function toRosterRow(row, classOfRank, resultRow, privateRow) {
  const privateDate = isIsoDate(privateRow?.private_date) ? privateRow.private_date : null;
  return {
    id: row.id,
    eventId: row.event_id,
    eventRankId: row.event_rank_id,
    eventClassId: classOfRank.get(row.event_rank_id) ?? null,
    firstName: row.first_name,
    lastName: row.last_name,
    payingBy: row.paying_by,
    stripesConfirmed: row.stripes_confirmed === true,
    source: row.source, // 'form' | 'staff'
    reference: row.reference, // 'CB-3112'
    signed: row.signed === true,
    signedAt: row.signed_at ?? null,
    signatureDeletedAt: row.signature_deleted_at ?? null, // set = "signature deleted after 90 days"
    ackVersion: row.ack_version ?? null,
    registeredAt: row.registered_at,
    status: row.status, // 'active' | 'withdrawn'
    withdrawnReason: row.withdrawn_reason ?? null, // 'withdrawn' | 'duplicate_copy'
    withdrawnAt: row.withdrawn_at ?? null,
    withdrawnByName: row.withdrawn_by_name ?? null,
    duplicateState: row.duplicate_state, // 'none' | 'possible' | 'kept_both'
    duplicateOf: row.duplicate_of ?? null,
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
    ...toResult(resultRow), // result, note, resultAt, resultByName, graded (phase 3)
    // Phase 4: the private testing day ('YYYY-MM-DD') and start time ('16:00'), both null for a
    // student who tests on the event's testing day.
    privateDate,
    privateTime: privateDate ? shortTime(privateRow?.private_time) : null,
    isPrivate: privateDate !== null,
  };
}

function toPayment(row) {
  return {
    id: row.id,
    registrationId: row.registration_id,
    kind: row.kind, // 'payment' | 'reversal'
    amountCents: row.amount_cents, // a reversal is negative
    method: row.method,
    paidOn: row.paid_on,
    recordedAt: row.recorded_at,
    recordedByName: row.recorded_by_name,
    reversesPaymentId: row.reverses_payment_id ?? null,
  };
}

// ----- Reading -----

// The has_data_access check that goes with every read: a locked sign-in gets EMPTY lists from
// the database (row-level security), which must not look like "No events yet".
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

// One school's events, newest testing date first, each with its classes (no ranks) and counts.
// → { status:'ok', today, events: [{ …event, state, classes:[…], activeCount, withdrawnCount,
//      registrationCount, paymentTotalCents, removedPaymentCents }] (eventRules.eventCounts),
//      privateTestings: [{ registrationId, eventId, eventName, firstName, lastName, className,
//      privateDate, privateTime, result }] }
// (classes are used to copy "Classes testing" from the last event in Add event.)
// privateTestings (phase 4, P8) = eventRules.privateTestingsList: active private students with no
// result yet, sorted by day and time. Names and classes are read ONLY for those students.
export async function loadEvents(locationCode) {
  try {
    if (!KNOWN_LOCATIONS.has(locationCode)) return failure(new Error(`Unknown school: ${locationCode}`));
    if (!supabase) return failure(new Error('No connection is set up'));
    const today = schoolToday();
    const [eventRes, denied] = await Promise.all([
      supabase.from('testing_events').select(EVENT_COLUMNS).eq('location_code', locationCode).order('testing_date', { ascending: false }),
      accessCheck(),
    ]);
    if (denied) return denied;
    if (eventRes?.error) return failure(eventRes.error);
    if (!Array.isArray(eventRes.data)) return unexpected('testing_events');
    const ids = eventRes.data.map((row) => row.id);
    const [classRes, rosterRes, privateRes] = await Promise.all([
      selectIn('testing_event_classes', EVENT_CLASS_COLUMNS, 'event_id', ids),
      selectIn('testing_roster', 'id, event_id, status, paid_cents', 'event_id', ids),
      selectIn('testing_registrations', 'id, event_id, private_date, private_time', 'event_id', ids),
    ]);
    if (classRes.error) return failure(classRes.error);
    if (rosterRes.error) return failure(rosterRes.error);
    if (privateRes.error) return failure(privateRes.error);
    // Phase 4: the active students with a private day — only their names, classes and results
    // are read (a second, small read), never everyone's.
    const statusOf = new Map(rosterRes.rows.map((r) => [r.id, r.status]));
    const privateRows = privateRes.rows.filter((r) => isIsoDate(r.private_date) && statusOf.get(r.id) === 'active');
    const privateIds = privateRows.map((r) => r.id);
    const [nameRes, privateResultRes] = await Promise.all([
      selectIn('testing_roster', 'id, first_name, last_name, class_name', 'id', privateIds),
      selectIn('testing_results', 'registration_id, result', 'registration_id', privateIds),
    ]);
    if (nameRes.error) return failure(nameRes.error);
    if (privateResultRes.error) return failure(privateResultRes.error);
    const events = eventRes.data.map((row) => {
      const event = toEvent(row, today);
      event.classes = classRes.rows
        .filter((c) => c.event_id === row.id)
        .map((c) => toEventClass(c, []))
        .sort((a, b) => a.position - b.position);
      Object.assign(event, eventCounts(rosterRes.rows.filter((r) => r.event_id === row.id)));
      return event;
    });
    const eventName = new Map(events.map((e) => [e.id, e.name]));
    const nameOf = new Map(nameRes.rows.map((r) => [r.id, r]));
    const resultOf = new Map(privateResultRes.rows.map((r) => [r.registration_id, r.result ?? null]));
    const privateTestings = privateTestingsList(privateRows.map((r) => ({
      registrationId: r.id,
      eventId: r.event_id,
      eventName: eventName.get(r.event_id) ?? null,
      firstName: nameOf.get(r.id)?.first_name ?? null,
      lastName: nameOf.get(r.id)?.last_name ?? null,
      className: nameOf.get(r.id)?.class_name ?? null,
      privateDate: r.private_date,
      privateTime: shortTime(r.private_time),
      result: resultOf.get(r.id) ?? null,
      status: statusOf.get(r.id), // used by the filter (always 'active' here), then left out
    }))).map(({ status, ...item }) => item);
    return { status: 'ok', today, events, privateTestings };
  } catch (error) {
    return failure(error);
  }
}

// One event with everything the event page needs:
// → { status:'ok', today, startedAt, event, classes:[{ …, ranks:[{ …, testingFor }] }], roster:[…], payments:[…] }
//   event also carries the same counts as loadEvents (activeCount, withdrawnCount,
//   registrationCount, paymentTotalCents, removedPaymentCents — eventRules.eventCounts) and
//   resultCount (students of any status with a result or a note — Delete event's warning).
//   or { status:'not_found' } when the event doesn't exist (any more).
// classes and ranks are in position order (belt order); roster rows carry eventClassId and the
// grading fields result, note, resultAt, resultByName, graded and addedAfterDay
// ({ date, byName } for a student an admin added after the testing day, else null).
// startedAt = Date.now() when this call STARTED (before any request): the Grading tab compares
// it with the time a save answered, so it never shows a read older than its own save.
// Phase 4: every roster row also carries privateDate, privateTime, isPrivate, priceCents (the
// private price for a private student, else the regular fee by today — eventRules.priceFor),
// amountDueCents (what Mark paid would record now — eventRules.amountDue) and owesMore (paid but
// still owing a top-up); event.owesMoreCount = the active students who owe more.
export async function loadEvent(eventId) {
  const startedAt = Date.now();
  try {
    if (typeof eventId !== 'string' || eventId === '') return failure(new Error('No event id'));
    if (!supabase) return failure(new Error('No connection is set up'));
    const today = schoolToday();
    const [eventRes, classRes, rosterRes, denied] = await Promise.all([
      supabase.from('testing_events').select(EVENT_COLUMNS).eq('id', eventId),
      supabase.from('testing_event_classes').select(EVENT_CLASS_COLUMNS).eq('event_id', eventId).order('position', { ascending: true }),
      supabase.from('testing_roster').select(ROSTER_COLUMNS).eq('event_id', eventId),
      accessCheck(),
    ]);
    if (denied) return denied;
    for (const res of [eventRes, classRes, rosterRes]) if (res?.error) return failure(res.error);
    if (![eventRes.data, classRes.data, rosterRes.data].every(Array.isArray)) return unexpected('the event tables');
    if (eventRes.data.length === 0) return { status: 'not_found' };

    const classIds = classRes.data.map((c) => c.id);
    const regIds = rosterRes.data.map((r) => r.id);
    const [rankRes, paymentRes, resultRes, privateRes] = await Promise.all([
      selectIn('testing_event_ranks', EVENT_RANK_COLUMNS, 'event_class_id', classIds),
      selectIn('testing_payments', PAYMENT_COLUMNS, 'registration_id', regIds),
      selectIn('testing_results', RESULT_COLUMNS, 'registration_id', regIds),
      selectIn('testing_registrations', PRIVATE_COLUMNS, 'id', regIds),
    ]);
    if (rankRes.error) return failure(rankRes.error);
    if (paymentRes.error) return failure(paymentRes.error);
    if (resultRes.error) return failure(resultRes.error);
    if (privateRes.error) return failure(privateRes.error);

    const classes = classRes.data
      .map((c) => toEventClass(c, rankRes.rows.filter((r) => r.event_class_id === c.id).map(toEventRank).sort((a, b) => a.position - b.position)))
      .sort((a, b) => a.position - b.position);
    // "Testing for" for every rank (eventRules.testingFor), and which class each rank is in.
    const classOfRank = new Map();
    const rankById = new Map();
    for (const cls of classes) {
      for (const rank of cls.ranks) {
        rank.testingFor = testingFor(classes, rank);
        classOfRank.set(rank.id, cls.id);
        rankById.set(rank.id, rank);
      }
    }
    const resultOf = new Map(resultRes.rows.map((r) => [r.registration_id, r]));
    const privateOf = new Map(privateRes.rows.map((r) => [r.id, r]));
    const event = Object.assign(toEvent(eventRes.data[0], today), eventCounts(rosterRes.data));
    const roster = rosterRes.data.map((row) => {
      const student = toRosterRow(row, classOfRank, resultOf.get(row.id) ?? null, privateOf.get(row.id) ?? null);
      student.addedAfterDay = addedAfterDay(student, event.testingDate); // gradingRules.js
      // Phase 4 money (contract 0014 §1.3): the same rule as the database's Mark paid.
      const rank = rankById.get(row.event_rank_id) ?? null;
      const money = { rank, privateDate: student.privateDate, today, testingDate: event.testingDate };
      student.priceCents = rank ? priceFor(money) : null;
      student.amountDueCents = rank ? amountDue({ ...money, paidCents: student.paidCents }) : 0;
      student.owesMore = owesMore(student);
      return student;
    });
    event.resultCount = roster.filter((r) => r.graded).length;
    event.owesMoreCount = roster.filter((r) => r.status === 'active' && r.owesMore).length;
    const payments = paymentRes.rows.map(toPayment).sort((a, b) => (a.recordedAt < b.recordedAt ? -1 : a.recordedAt > b.recordedAt ? 1 : 0));
    return { status: 'ok', today, startedAt, event, classes, roster, payments };
  } catch (error) {
    return failure(error);
  }
}

// One student's saved result, read fresh right before Edit details saves a belt change (so the
// "this clears the result" warning is never out of date — contract 0010 §4.7).
// → { status:'ok', graded, result, note, resultAt, resultByName } (graded false and nulls when
//   nothing is saved) · 'no_access' · 'error'
export async function loadResult(registrationId) {
  try {
    if (typeof registrationId !== 'string' || registrationId === '') return failure(new Error('No registration id'));
    if (!supabase) return failure(new Error('No connection is set up'));
    const [res, denied] = await Promise.all([
      supabase.from('testing_results').select(RESULT_COLUMNS).eq('registration_id', registrationId),
      accessCheck(),
    ]);
    if (denied) return denied;
    if (res?.error) return failure(res.error);
    if (!Array.isArray(res.data)) return unexpected('testing_results');
    return { status: 'ok', ...toResult(res.data[0] ?? null) };
  } catch (error) {
    return failure(error);
  }
}

// ----- Writing (one database function each, contract 0005 §1.8) -----

const isText = (v) => typeof v === 'string' && v.length > 0;
const isInt = (v) => Number.isInteger(v);
const isTextOrNull = (v) => v === null || typeof v === 'string';

// Calls one database function and turns its answer into { status, … }. readOk(data) checks the
// ok answer and converts it to camelCase; null = wrong shape → 'error' rather than a guess.
// Some refusals carry one extra field (final_award_not_set → the class name).
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

// "Classes testing" → the database's list: [{ class_id, start_time 'HH:MM', end_time }].
const classesArg = (classes) =>
  Array.isArray(classes) ? classes.map((c) => ({ class_id: c.classId, start_time: c.startTime, end_time: c.endTime })) : classes;

// Add event (admin). classes: [{ classId, startTime:'16:00', endTime:'17:00' }] (the ticked ones).
// autoCloseOn: 'YYYY-MM-DD' or null (no automatic closing). note: text or null.
// → { status:'ok', id, publicCode, version } · 'final_award_not_set' + className · 'duplicate_name' …
export async function addEvent({ locationCode, name, testingDate, classes, registrationOpen, autoCloseOn = null, note = null } = {}) {
  return callRpc(
    'testing_add_event',
    {
      p_location_code: locationCode,
      p_name: name,
      p_testing_date: testingDate,
      p_classes: classesArg(classes),
      p_registration_open: registrationOpen,
      p_auto_close_on: autoCloseOn,
      p_note: note,
    },
    (d) => (isText(d.id) && isText(d.public_code) && isInt(d.version) ? { id: d.id, publicCode: d.public_code, version: d.version } : null),
  );
}

// Edit event (admin). classes = the full new list (added ones are copied, missing ones removed —
// 'not_empty' if a removed class has registrations; times always update). 'has_results' when the
// date would change but a student of this event already has a result or a note (phase 3).
export async function updateEvent({ eventId, expectedVersion, name, testingDate, classes, autoCloseOn = null, note = null } = {}) {
  return callRpc(
    'testing_update_event',
    {
      p_event_id: eventId,
      p_expected_version: expectedVersion,
      p_name: name,
      p_testing_date: testingDate,
      p_classes: classesArg(classes),
      p_auto_close_on: autoCloseOn,
      p_note: note,
    },
    readVersion,
  );
}

// Open (open: true) or close registration. → { status:'ok', version, state } (state = eventState
// code after the change) · 'not_allowed' (staff reopening after the closing date) · 'finished'.
export async function setRegistration({ eventId, expectedVersion, open } = {}) {
  return callRpc(
    'testing_set_registration',
    { p_event_id: eventId, p_expected_version: expectedVersion, p_open: open },
    (d) => (isInt(d.version) && isText(d.state) ? { version: d.version, state: d.state } : null),
  );
}

// Delete event (admin). The two numbers are what the confirmation showed: ALL registrations
// (incl. withdrawn) and the NET payment total; 'stale' if either has changed since.
export async function deleteEvent({ eventId, expectedVersion, expectedRegistrationCount, expectedPaymentTotalCents } = {}) {
  return callRpc(
    'testing_delete_event',
    {
      p_event_id: eventId,
      p_expected_version: expectedVersion,
      p_expected_registration_count: expectedRegistrationCount,
      p_expected_payment_total_cents: expectedPaymentTotalCents,
    },
    readNothing,
  );
}

// Add student (walk-ins, staff and admins). eventRankId = their current belt in the event copy.
// stripes must be true. payingBy: 'cash' | 'check' | 'card'. → { status:'ok', id, reference, version }
export async function addStudent({ eventId, firstName, lastName, eventRankId, stripes, payingBy } = {}) {
  return callRpc(
    'testing_add_student',
    { p_event_id: eventId, p_first: firstName, p_last: lastName, p_event_rank_id: eventRankId, p_stripes: stripes, p_paying_by: payingBy },
    (d) => (isText(d.id) && isText(d.reference) && isInt(d.version) ? { id: d.id, reference: d.reference, version: d.version } : null),
  );
}

// Edit details: names and current belt (the class follows the belt). Payments are untouched.
// → { status:'ok', version, resultCleared, amountDueCents } — resultCleared is true when the belt
//   changed for a graded student, so the database cleared their result and note (phase 3; the
//   database only sends result_cleared when it is true). amountDueCents (phase 4) = what is due
//   now for a PRIVATE student (a pricier rank after paying → a top-up, Q2); null for a regular
//   student (the database doesn't send it) · 'not_allowed' (staff, after the student's own day,
//   belt change of a graded student) · 'stale' · 'invalid' · 'not_found'
export async function updateStudent({ registrationId, expectedVersion, firstName, lastName, eventRankId } = {}) {
  return callRpc(
    'testing_update_student',
    { p_registration_id: registrationId, p_expected_version: expectedVersion, p_first: firstName, p_last: lastName, p_event_rank_id: eventRankId },
    (d) => (isInt(d.version)
      ? { version: d.version, resultCleared: d.result_cleared === true, amountDueCents: Number.isInteger(d.amount_due_cents) ? d.amount_due_cents : null }
      : null),
  );
}

// ----- Private testing (phase 4, migration 0014, contract 0014 §2.4) -----
// privateDate = 'YYYY-MM-DD' (today or later, at most a year after the testing day);
// privateTime = 'HH:MM' from eventRules.PRIVATE_TIME_CHOICES (6:00 AM–10:00 PM, 5-minute steps).

// A private answer: the day stays 'YYYY-MM-DD', the time becomes '16:00'. null = wrong shape.
const readPrivateDay = (d) => {
  const privateTime = shortTime(d.private_time);
  if (!isIsoDate(d.private_date) || privateTime === null || !isInt(d.amount_due_cents)) return null;
  return { privateDate: d.private_date, privateTime, amountDueCents: d.amount_due_cents };
};
// The time as the database function wants it ('16:00'); anything unreadable is sent as it is,
// so the database refuses it (invalid) instead of this file guessing.
const timeArg = (text) => shortTime(text) ?? text;

// Set private testing (first time) or Change private day or time.
// → { status:'ok', version, privateDate, privateTime, amountDueCents, resultCleared } —
//   resultCleared is true when a No show (testing-day or private) was removed with its note ·
//   'past_day' · 'invalid' (bad time, or more than a year after the testing day) · 'has_result'
//   (testing-day Pass / Not passed / note) · 'graded' (private Pass / Not passed) · 'stale' ·
//   'withdrawn' · 'not_found' · 'no_access' · 'error'
// The same day AND time again writes nothing (ok, same version, resultCleared false).
export async function setPrivate({ registrationId, expectedVersion, privateDate, privateTime } = {}) {
  return callRpc(
    'testing_set_private',
    { p_registration_id: registrationId, p_expected_version: expectedVersion, p_private_date: privateDate, p_private_time: timeArg(privateTime) },
    (d) => {
      const day = readPrivateDay(d);
      if (!day || !isInt(d.version) || typeof d.result_cleared !== 'boolean') return null;
      return { version: d.version, ...day, resultCleared: d.result_cleared };
    },
  );
}

// Back to the testing day. → { status:'ok', version, amountDueCents } · 'graded' (a private
// result exists — No show too; a note alone doesn't count) · 'not_allowed' (staff after the
// testing day, H1) · 'stale' · 'withdrawn' · 'not_found' · 'invalid' · 'no_access' · 'error'.
// A student who isn't private any more answers ok and nothing changes.
export async function clearPrivate({ registrationId, expectedVersion } = {}) {
  return callRpc(
    'testing_clear_private',
    { p_registration_id: registrationId, p_expected_version: expectedVersion },
    (d) => (isInt(d.version) && isInt(d.amount_due_cents) ? { version: d.version, amountDueCents: d.amount_due_cents } : null),
  );
}

// Add student with "Tests privately" ticked (P3b): addStudent's arguments plus the private day
// and time, in ONE database call (one new registration, version 1).
// → { status:'ok', id, reference, version, privateDate, privateTime, amountDueCents } ·
//   'past_day' · 'finished' (staff after the testing day) · 'invalid' · 'not_found' · 'stale' …
export async function addPrivateStudent({ eventId, firstName, lastName, eventRankId, stripes, payingBy, privateDate, privateTime } = {}) {
  return callRpc(
    'testing_add_private_student',
    {
      p_event_id: eventId, p_first: firstName, p_last: lastName, p_event_rank_id: eventRankId, p_stripes: stripes,
      p_paying_by: payingBy, p_private_date: privateDate, p_private_time: timeArg(privateTime),
    },
    (d) => {
      const day = readPrivateDay(d);
      if (!day || !isText(d.id) || !isText(d.reference) || !isInt(d.version)) return null;
      return { id: d.id, reference: d.reference, version: d.version, ...day };
    },
  );
}

// ----- Grading (phase 3, migration 0010) -----
// Both answer ok with what is stored NOW: { status:'ok', result, note, resultAt, resultByName }
// (all null when nothing is saved any more). Refusals: 'no_access' · 'invalid' · 'not_found' ·
// 'withdrawn' · 'not_open' (before the student's own day: their private day when private, else
// the testing day — phase 4) · 'finished' (staff after that day)
// · 'stale' (busy, try again) · 'error'. No version: the last change wins, and sending the same
// value again is harmless (that's what makes Retry safe).
const readResult = (d) => {
  if (!(d.result === null || RESULTS.includes(d.result))) return null;
  if (!isTextOrNull(d.note) || !isTextOrNull(d.updated_at) || !isTextOrNull(d.updated_by_name)) return null;
  return { result: d.result, note: d.note, resultAt: d.updated_at, resultByName: d.updated_by_name };
};

// Record a result: 'pass' | 'not_passed' | 'no_show', or null to clear it (the note stays).
export async function setResult({ registrationId, result } = {}) {
  return callRpc('testing_set_result', { p_registration_id: registrationId, p_result: result }, readResult);
}

// Save the grading note as typed (the database tidies it to one line); null or blank clears it.
export async function setResultNote({ registrationId, note } = {}) {
  return callRpc('testing_set_result_note', { p_registration_id: registrationId, p_note: note }, readResult);
}

// Change how they'll pay (not paid — or, phase 4, a private student who still owes a top-up;
// earlier payments keep their method — not withdrawn).
export async function changePayingBy({ registrationId, expectedVersion, payingBy } = {}) {
  return callRpc(
    'testing_change_paying_by',
    { p_registration_id: registrationId, p_expected_version: expectedVersion, p_paying_by: payingBy },
    readVersion,
  );
}

// Mark paid: one click pays what is due. The DATABASE decides the amount (testing_amount_due:
// a regular student pays the early price before the testing day, the testing-day price on it;
// a private student pays the private price, or just the difference after an earlier payment)
// and the date (today). → { status:'ok', paymentId, amountCents, method, version } ·
// 'already_paid' (nothing due — also a $0 price) · 'withdrawn' · 'stale' (e.g. a double click)
export async function markPaid({ registrationId, expectedVersion } = {}) {
  return callRpc(
    'testing_mark_paid',
    { p_registration_id: registrationId, p_expected_version: expectedVersion },
    (d) =>
      isText(d.payment_id) && isInt(d.amount_cents) && isText(d.method) && isInt(d.version)
        ? { paymentId: d.payment_id, amountCents: d.amount_cents, method: d.method, version: d.version }
        : null,
  );
}

// Undo payment: staff only within 10 seconds of their OWN Mark paid (the database checks who and
// when); admins any time. → { status:'ok', version } (the registration's new version) ·
// 'not_allowed' · 'stale' (already undone)
export async function undoPayment({ paymentId } = {}) {
  return callRpc('testing_undo_payment', { p_payment_id: paymentId }, readVersion);
}

// Edit payment (admin): the old payment is reversed and a new one recorded.
// → { status:'ok', paymentId (the new one), version }
export async function editPayment({ paymentId, method, amountCents, paidOn } = {}) {
  return callRpc(
    'testing_edit_payment',
    { p_payment_id: paymentId, p_method: method, p_amount_cents: amountCents, p_paid_on: paidOn },
    (d) => (isText(d.payment_id) && isInt(d.version) ? { paymentId: d.payment_id, version: d.version } : null),
  );
}

// Possible duplicate: keep one (keepBoth false → the other is withdrawn as "Duplicate copy"),
// or keepBoth true → "Not the same person — keep both".
export async function resolveDuplicate({ keepId, keepVersion, otherId, otherVersion, keepBoth } = {}) {
  return callRpc(
    'testing_resolve_duplicate',
    { p_keep_id: keepId, p_keep_version: keepVersion, p_other_id: otherId, p_other_version: otherVersion, p_keep_both: keepBoth },
    readNothing,
  );
}

// Withdraw / Restore (admin).
export async function withdrawStudent({ registrationId, expectedVersion } = {}) {
  return callRpc('testing_withdraw_student', { p_registration_id: registrationId, p_expected_version: expectedVersion }, readVersion);
}

export async function restoreStudent({ registrationId, expectedVersion } = {}) {
  return callRpc('testing_restore_student', { p_registration_id: registrationId, p_expected_version: expectedVersion }, readVersion);
}

// Delete permanently (admin). expectedPaymentIds = the ids of ALL payment rows of this student
// (payments and reversals) the warning was built from; 'stale' if they differ now.
export async function deleteStudent({ registrationId, expectedVersion, expectedPaymentIds } = {}) {
  return callRpc(
    'testing_delete_student',
    { p_registration_id: registrationId, p_expected_version: expectedVersion, p_expected_payment_ids: expectedPaymentIds },
    readNothing,
  );
}
