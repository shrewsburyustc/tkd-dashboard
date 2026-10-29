// eventsCore.js — the real work behind eventsApi.js: every database call the Star testing Events
// tab and the event page make, written against ANY Supabase-shaped client.
// Why it exists: eventsApi.js imports the app's one connection (supabase.js), and supabase.js reads
// Vite settings (import.meta.env) that don't exist when Node runs the checks. Keeping the logic here,
// with the client and "today" passed in, lets star/eventsChecks.mjs run the exact same code against
// the preview database (mockStarEvents.js) without a browser. The screens never import this file;
// they import eventsApi.js (its header comment is the API description for the screens).
//
// Every function returns a Promise of a plain object with a `status` CODE and NEVER throws:
//   'ok'             it worked (plus the result fields)
//   'no_access'      this sign-in can't see data right now (locked, password too old …)
//   'not_allowed'    only an admin may do that (or: staff reopening after the closing date)
//   'invalid'        the values were refused (a past date, a start time off the 5-minute steps …)
//   'not_found'      the event no longer exists
//   'stale'          someone else changed it since this screen loaded it
//   'duplicate_name' another Star event already has that name
//   'finished'       the testing day has passed, so the Registration switch can't change
//   'error'          anything else (no connection, unexpected answer) — { status:'error', error }
// The words for each code live in eventsText.js.
//
// The database answers in snake_case (testing_date); this file converts to the app's camelCase
// (testingDate). Contract 0006: §2.2 (star_events), §2.3 (the event's own copy), §4.1 (the only
// columns the app may read — every read below lists its columns, never '*'), §5.1 (the state rule —
// Color Belt's eventRules.js, imported, not changed), §6.2 (the four write functions).
import {
  eventState, stateTag, eventCounts, isIsoDate, EVENT_STATES,
} from '../testing/eventRules.js';
import { startTimeMinutes, shortStartTime, STAR_CODE_PATTERN, editWouldReopen } from './starEventRules.js';

// Every status a Star events call can return.
export const STAR_EVENT_STATUSES = [
  'ok', 'no_access', 'not_allowed', 'invalid', 'not_found', 'stale', 'duplicate_name', 'finished', 'error',
];
const SERVER_STATUSES = new Set(STAR_EVENT_STATUSES.filter((s) => s !== 'error'));

// ----- The columns we read (exactly contract 0006 §4.1; the database refuses '*') -----
const EVENT_COLUMNS = 'id, name, testing_date, start_time, where_code, registration_open, auto_close_on, first_opened_at, public_code_worcester, public_code_shrewsbury, note, version, created_at, updated_at, created_by_name, updated_by_name';
const EVENT_DAN_COLUMNS = 'id, event_id, dan, label, pass_mark, star_limit, standard_cents, same_day_cents, private_cents';
const EVENT_CATEGORY_COLUMNS = 'id, event_id, dan, template_category_id, name, credits, position, from_class_count';
const EVENT_GRADE_COLUMNS = 'id, event_id, grade, position, value';
const MIN_SUFFIXES = ['a_plus', 'a', 'b_plus', 'b', 'c_plus', 'c']; // A+ … C (D = below the C minimum)
const EVENT_ASSISTANT_COLUMNS = [
  'id', 'event_id', 'child_max_age',
  ...MIN_SUFFIXES.map((s) => `child_${s}`),
  ...MIN_SUFFIXES.map((s) => `adult_${s}`),
].join(', ');
// Candidate COUNTS only: from the roster view, the event, the candidate's status and their net paid
// amount — no names, no dates of birth, nothing about a person. eventRules.eventCounts adds them up.
const COUNT_COLUMNS = 'event_id, status, paid_cents';

// The `error` in { status:'error', error } is for the browser console and the Node checks ONLY:
// screens must never show result.error (it can hold database or network details). They show the
// words from eventsText.js for the 'error' status instead.
const failure = (error) => ({ status: 'error', error });
const unexpected = (what) => failure(new Error(`Unexpected answer from ${what}`));

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuidText = (v) => typeof v === 'string' && UUID_PATTERN.test(v);
const isInt = (v) => Number.isInteger(v);
const isStarCode = (v) => typeof v === 'string' && STAR_CODE_PATTERN.test(v);
// numeric columns (pass mark, grade values) arrive as JSON numbers; text that is a number is fine too.
const toNumber = (v) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

// ----- Converting what the screens give us into what the database expects -----
// A value the database would answer with a hard error (not a friendly 'invalid') — "abc" as a
// date, 5.5 as a version — is caught here and answered 'invalid' without calling the server.
const BAD = Symbol('bad value');
const isBad = (values) => values.some((v) => v === BAD);
function asInteger(v) {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' && /^\s*[+-]?\d+\s*$/.test(v) ? Number(v) : v;
  return Number.isInteger(n) ? n : BAD;
}
// 'YYYY-MM-DD' (a real calendar date) or null.
const asDate = (v) => (v === null || v === undefined || v === '' ? null : isIsoDate(v) ? v : BAD);
// '10:00' or '10:00:00' → '10:00:00' (the database's time format), or null. The 5-minute rule
// itself is the database's job (it answers 'invalid'); only "not a time at all" is caught here.
const asTime = (v) => {
  if (v === null || v === undefined || v === '') return null;
  return startTimeMinutes(v) === null ? BAD : `${shortStartTime(v)}:00`;
};
const asText = (v) => (v === null || v === undefined ? null : typeof v === 'string' ? v : BAD);
const asBoolean = (v) => (v === null || v === undefined ? null : typeof v === 'boolean' ? v : BAD);

// ----- Converting database rows to app objects -----

// One event. today ('YYYY-MM-DD', school time) gives its state and its list tag (v0.88).
function toStarEvent(row, today) {
  const event = {
    id: row.id,
    name: row.name,
    testingDate: row.testing_date,
    startTime: shortStartTime(row.start_time), // '10:00'
    whereCode: row.where_code, // 'worcester' | 'shrewsbury' (information only, v0.87)
    registrationOpen: row.registration_open === true,
    autoCloseOn: row.auto_close_on ?? null,
    firstOpenedAt: row.first_opened_at ?? null,
    publicCodeWorcester: row.public_code_worcester,
    publicCodeShrewsbury: row.public_code_shrewsbury,
    note: row.note ?? null,
    version: row.version,
    createdAt: row.created_at, // also "Rubrics and prices were copied when this event was created"
    createdByName: row.created_by_name,
    updatedAt: row.updated_at,
    updatedByName: row.updated_by_name,
  };
  event.state = eventState(event, today); // 'finished' | 'open' | 'closed_by_date' | 'not_open_yet' | 'closed'
  event.tag = stateTag(event.state, event, today); // { code, date? } — words in eventsText.js
  event.isPast = event.state === 'finished'; // Past = from the day after the testing date (v0.89)
  return event;
}

function toCopyCategory(row) {
  return {
    id: row.id,
    templateCategoryId: row.template_category_id,
    name: row.name,
    credits: row.credits,
    position: row.position,
    fromClassCount: row.from_class_count === true,
  };
}

function toCopyDan(row, categories) {
  return {
    id: row.id,
    dan: row.dan,
    label: row.label,
    passMark: toNumber(row.pass_mark),
    starLimit: row.star_limit,
    standardCents: row.standard_cents,
    sameDayCents: row.same_day_cents,
    privateCents: row.private_cents,
    categories,
  };
}

const toCopyGrade = (row) => ({ id: row.id, grade: row.grade, position: row.position, value: toNumber(row.value) });

function toCopyAssistant(row) {
  return {
    id: row.id,
    childMaxAge: row.child_max_age,
    childMins: MIN_SUFFIXES.map((s) => row[`child_${s}`]), // [A+, A, B+, B, C+, C]
    adultMins: MIN_SUFFIXES.map((s) => row[`adult_${s}`]),
  };
}

// ----- Small pure helpers the screens use (no database) -----

// Upcoming / Past (v0.89): Upcoming = not finished (the testing day itself stays Upcoming), soonest
// first; Past = finished, most recent first. events: app events from loadStarEvents (they carry
// isPast). Returns { upcoming, past } (new arrays; the input is not changed).
export function splitUpcomingPast(events) {
  const byDate = (a, b) => (a.testingDate < b.testingDate ? -1 : a.testingDate > b.testingDate ? 1 : 0);
  const list = Array.isArray(events) ? events : [];
  return {
    upcoming: list.filter((e) => !e.isPast).sort(byDate),
    past: list.filter((e) => e.isPast).sort((a, b) => byDate(b, a)),
  };
}

// The event Add event copies Start time and Where from: the one CREATED most recently (as Color
// Belt's "last event"). null when there are no events (the first-event hint, screen 4).
export function latestCreatedEvent(events) {
  const list = Array.isArray(events) ? events : [];
  return list.reduce((best, e) => (best === null || e.createdAt > best.createdAt ? e : best), null);
}

// Builds the API functions around a client. getClient() returns the Supabase client (or a
// look-alike) — or null when no connection is set up. getToday() returns 'YYYY-MM-DD' in school
// time (eventsApi passes Color Belt's schoolToday, which also follows setToday in preview).
export function createStarEventsApi(getClient, getToday) {
  // The has_data_access check that goes with every read: a locked sign-in gets EMPTY lists from
  // the database (row-level security), which must not look like "No star testing events yet".
  async function accessCheck(client) {
    const res = await client.rpc('has_data_access');
    if (res?.error) return failure(res.error);
    if (res?.data === false) return { status: 'no_access' };
    if (res?.data !== true) return unexpected('has_data_access');
    return null; // fine
  }

  // ----- Reading -----

  // Every Star event (both schools), each with its state, tag and candidate counts.
  async function loadStarEvents() {
    try {
      const client = getClient();
      if (!client) return failure(new Error('No connection is set up'));
      const today = getToday();
      const [eventRes, countRes, denied] = await Promise.all([
        client.from('star_events').select(EVENT_COLUMNS).order('testing_date', { ascending: true }),
        client.from('star_roster').select(COUNT_COLUMNS),
        accessCheck(client),
      ]);
      if (denied) return denied; // "No access" wins
      for (const res of [eventRes, countRes]) if (res?.error) return failure(res.error);
      if (!Array.isArray(eventRes?.data) || !Array.isArray(countRes?.data)) return unexpected('star_events');
      const rowsByEvent = new Map();
      for (const r of countRes.data) {
        if (!rowsByEvent.has(r.event_id)) rowsByEvent.set(r.event_id, []);
        rowsByEvent.get(r.event_id).push(r);
      }
      const events = eventRes.data.map((row) => Object.assign(toStarEvent(row, today), eventCounts(rowsByEvent.get(row.id) ?? [])));
      return { status: 'ok', today, events };
    } catch (error) {
      return failure(error);
    }
  }

  // One event for the event page: the event (with counts) and its own copy of the rubrics and
  // prices (taken when it was created, v0.61). 'not_found' when it doesn't exist (any more).
  async function loadStarEvent(eventId) {
    try {
      if (!isUuidText(eventId)) return { status: 'not_found' }; // a mistyped address: nothing to look up
      const client = getClient();
      if (!client) return failure(new Error('No connection is set up'));
      const today = getToday();
      const [eventRes, danRes, categoryRes, gradeRes, assistantRes, countRes, denied] = await Promise.all([
        client.from('star_events').select(EVENT_COLUMNS).eq('id', eventId),
        client.from('star_event_dans').select(EVENT_DAN_COLUMNS).eq('event_id', eventId).order('dan', { ascending: true }),
        client.from('star_event_categories').select(EVENT_CATEGORY_COLUMNS).eq('event_id', eventId)
          .order('dan', { ascending: true }).order('position', { ascending: true }),
        client.from('star_event_grades').select(EVENT_GRADE_COLUMNS).eq('event_id', eventId).order('position', { ascending: true }),
        client.from('star_event_assistant').select(EVENT_ASSISTANT_COLUMNS).eq('event_id', eventId),
        client.from('star_roster').select(COUNT_COLUMNS).eq('event_id', eventId),
        accessCheck(client),
      ]);
      if (denied) return denied;
      const all = [eventRes, danRes, categoryRes, gradeRes, assistantRes, countRes];
      for (const res of all) if (res?.error) return failure(res.error);
      if (!all.every((res) => Array.isArray(res?.data))) return unexpected('the Star event tables');
      if (eventRes.data.length === 0) return { status: 'not_found' };

      const byDan = new Map();
      for (const row of categoryRes.data) {
        if (!byDan.has(row.dan)) byDan.set(row.dan, []);
        byDan.get(row.dan).push(toCopyCategory(row));
      }
      const dans = danRes.data
        .map((row) => toCopyDan(row, (byDan.get(row.dan) ?? []).sort((a, b) => a.position - b.position)))
        .sort((a, b) => a.dan - b.dan);
      const copy = {
        dans,
        grades: gradeRes.data.map(toCopyGrade).sort((a, b) => a.position - b.position),
        assistant: assistantRes.data[0] ? toCopyAssistant(assistantRes.data[0]) : null,
      };
      const event = Object.assign(toStarEvent(eventRes.data[0], today), eventCounts(countRes.data));
      return { status: 'ok', today, event, copy };
    } catch (error) {
      return failure(error);
    }
  }

  // ----- Writing (one database function each, contract 0006 §6.2) -----

  // Calls one database function and turns its answer into { status, … }. readOk(data) checks the
  // ok answer and converts it; null = wrong shape → 'error' rather than a guess.
  async function callRpc(name, args, readOk) {
    try {
      const client = getClient();
      if (!client) return failure(new Error('No connection is set up'));
      const { data, error } = await client.rpc(name, args);
      if (error) return failure(error);
      const status = data?.status;
      if (typeof status !== 'string' || !SERVER_STATUSES.has(status)) return unexpected(name);
      if (status !== 'ok') return { status }; // non-ok answers carry only the status
      const result = readOk(data);
      return result ? { status: 'ok', ...result } : unexpected(name);
    } catch (error) {
      return failure(error);
    }
  }

  const readNothing = () => ({});
  const readVersion = (d) => (isInt(d.version) ? { version: d.version } : null);
  const readSwitch = (d) => (isInt(d.version) && EVENT_STATES.includes(d.state) ? { version: d.version, state: d.state } : null);
  const readAdded = (d) => (isUuidText(d.id) && isInt(d.version) && isStarCode(d.public_code_worcester) && isStarCode(d.public_code_shrewsbury)
    ? { id: d.id, version: d.version, publicCodeWorcester: d.public_code_worcester, publicCodeShrewsbury: d.public_code_shrewsbury }
    : null);

  // Add event (admin). The rubric and prices are copied into the event by the database.
  async function addStarEvent({ name, testingDate, startTime, whereCode, registrationOpen, autoCloseOn = null, note = null } = {}) {
    const args = {
      p_name: asText(name),
      p_testing_date: asDate(testingDate),
      p_start_time: asTime(startTime),
      p_where_code: asText(whereCode),
      p_registration_open: asBoolean(registrationOpen),
      p_auto_close_on: asDate(autoCloseOn),
      p_note: asText(note),
    };
    if (isBad(Object.values(args))) return { status: 'invalid' };
    return callRpc('star_add_event', args, readAdded);
  }

  // Edit event's details (admin) — NOT the Registration switch (contract §11 item 7).
  async function updateStarEvent({ eventId, expectedVersion, name, testingDate, startTime, whereCode, autoCloseOn = null, note = null } = {}) {
    const args = {
      p_event_id: asText(eventId),
      p_expected_version: asInteger(expectedVersion),
      p_name: asText(name),
      p_testing_date: asDate(testingDate),
      p_start_time: asTime(startTime),
      p_where_code: asText(whereCode),
      p_auto_close_on: asDate(autoCloseOn),
      p_note: asText(note),
    };
    if (isBad(Object.values(args))) return { status: 'invalid' };
    if (args.p_event_id !== null && !isUuidText(args.p_event_id)) return { status: 'not_found' };
    return callRpc('star_update_event', args, readVersion);
  }

  // Open (open: true) or close registration — staff and admins (staff can't reopen after the
  // closing date: 'not_allowed'; an admin reopening then also removes the date).
  async function setStarRegistration({ eventId, expectedVersion, open } = {}) {
    const args = { p_event_id: asText(eventId), p_expected_version: asInteger(expectedVersion), p_open: asBoolean(open) };
    if (isBad(Object.values(args))) return { status: 'invalid' };
    if (args.p_event_id !== null && !isUuidText(args.p_event_id)) return { status: 'not_found' };
    return callRpc('star_set_registration', args, readSwitch);
  }

  // The whole Edit event Save: the details first, then — only when the switch was changed in the
  // dialog — the Registration switch with the NEW version (contract §11 item 7, as Color Belt).
  //
  // v0.504: a save must never reopen registration by itself. values.previous = the record as loaded
  // ({ testingDate, registrationOpen, autoCloseOn, firstOpenedAt }); its state is worked out fresh
  // at save time. When the save would make an Open-switch event open again
  // (starEventRules.editWouldReopen):
  //   case 1, an upcoming event closed by its passed date: registration is closed FIRST, then the
  //     details are saved with the close's version (a refused close = nothing saved, its status);
  //   case 2, a finished event: details first (it can't be closed while finished), then the close
  //     with the version the save returned.
  //   → { status:'ok', version, registration: null, keptClosed: { status:'ok', state } }  kept closed
  //     { status:'ok', version, registration: null, keptClosed: { status:<refusal> } }   case 2 only:
  //       details saved, the close failed — registration IS open now (version = the save's)
  async function saveStarEventEdit(values = {}) {
    // v0.504: would this save reopen registration by itself? The state BEFORE the save is worked
    // out fresh, now, from the record's own fields (values.previous) — not taken from a list that
    // may have been loaded before midnight.
    const switchKept = typeof values.registrationOpen !== 'boolean' || values.registrationOpen === values.previousRegistrationOpen;
    const today = getToday();
    const previousState = values.previous ? eventState(values.previous, today) : null;
    const reopens = switchKept && previousState !== null && editWouldReopen({
      previousState,
      registrationOpen: values.registrationOpen,
      previousRegistrationOpen: values.previousRegistrationOpen,
      saved: { testingDate: values.testingDate, autoCloseOn: values.autoCloseOn },
      today,
    });
    // Case 1 (an upcoming event closed by its passed date): close FIRST, then save the details with
    // the version the close returned — registration is never open, not even for a moment. If the
    // close is refused, nothing is saved (its answer is the save's answer).
    if (reopens && previousState !== 'finished') {
      const closed = await setStarRegistration({ eventId: values.eventId, expectedVersion: values.expectedVersion, open: false });
      if (closed.status !== 'ok') return { status: closed.status };
      const saved = await updateStarEvent({ ...values, expectedVersion: closed.version });
      if (saved.status !== 'ok') return saved; // (registration stays closed: it wasn't open before either)
      return { status: 'ok', version: saved.version, registration: null, keptClosed: { status: 'ok', state: 'closed' } };
    }
    const saved = await updateStarEvent(values);
    if (saved.status !== 'ok') return saved;
    if (switchKept) {
      if (!reopens) return { status: 'ok', version: saved.version, registration: null };
      // Case 2 (a finished event): it is "finished" until the new date is saved, so it can only be
      // closed after the save, with the version the save returned.
      const closed = await setStarRegistration({ eventId: values.eventId, expectedVersion: saved.version, open: false });
      if (closed.status === 'ok') {
        return { status: 'ok', version: closed.version, registration: null, keptClosed: { status: 'ok', state: closed.state } };
      }
      return { status: 'ok', version: saved.version, registration: null, keptClosed: { status: closed.status } };
    }
    const switched = await setStarRegistration({ eventId: values.eventId, expectedVersion: saved.version, open: values.registrationOpen });
    if (switched.status === 'ok') {
      return { status: 'ok', version: switched.version, registration: { status: 'ok', open: values.registrationOpen, state: switched.state } };
    }
    return { status: 'ok', version: saved.version, registration: { status: switched.status, open: values.registrationOpen } };
  }

  // Delete event (admin). The two numbers are what the confirmation counted: ALL candidates
  // (withdrawn too) and the NET payment total; 'stale' if either has changed since.
  async function deleteStarEvent({ eventId, expectedVersion, expectedCandidateCount, expectedPaymentTotalCents } = {}) {
    const args = {
      p_event_id: asText(eventId),
      p_expected_version: asInteger(expectedVersion),
      p_expected_candidate_count: asInteger(expectedCandidateCount),
      p_expected_payment_total_cents: asInteger(expectedPaymentTotalCents),
    };
    if (isBad(Object.values(args))) return { status: 'invalid' };
    if (args.p_event_id !== null && !isUuidText(args.p_event_id)) return { status: 'not_found' };
    return callRpc('star_delete_event', args, readNothing);
  }

  return {
    loadStarEvents, loadStarEvent, addStarEvent, updateStarEvent, setStarRegistration, saveStarEventEdit, deleteStarEvent,
  };
}
