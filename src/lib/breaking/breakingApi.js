// breakingApi.js — every call the Board breaking staff screens make to the database (migration 0051).
// Why it exists: like campsApi.js does for Camps, this keeps the exact names and arguments of the database
// functions (docs/Board Breaking/SIGNATURES-0051.md) in ONE place. Screens call friendly camelCase functions
// and always get back a plain object with a `status` CODE (never words: breakingText.js turns codes into words):
//   'ok' (plus the result fields) · 'no_access' (locked sign-in) · 'not_allowed' (staff pressed an admin
//   thing) · 'not_found' · 'stale' (someone else changed it first) · 'invalid' (+ field) · 'closed' ·
//   'has_payments' · 'class_in_use' (+ classId) · 'already_paid' · 'amount_below_paid' (+ paidCents) ·
//   'refund_stands' · 'refund_too_large' (+ overpaidCents) · 'error' (no connection / odd answer: { status:'error', error })
// These functions NEVER throw.
//
// One function per database function, same names in camelCase (brk_add_student → addStudent). Every key of an
// answer is turned from snake_case into camelCase (amount_cents → amountCents), arrays included. What the app
// sends is the function's own argument names (p_...), written out below so a reader can match them to the sheet.
// Money is whole cents; dates are 'YYYY-MM-DD'; times 'HH:MM'.
//
// The staff screens never see a Square link address or any private data: the database doesn't send them.
import { supabase } from '../supabase.js';

// Every status a call here can return. A status the database sends that isn't on this list counts as an
// unexpected answer ('error').
export const BREAKING_STATUSES = [
  'ok', 'no_access', 'not_allowed', 'not_found', 'stale', 'invalid', 'closed', 'has_payments', 'class_in_use',
  'already_paid', 'amount_below_paid', 'refund_stands', 'refund_too_large', 'error',
];
const SERVER_STATUSES = new Set(BREAKING_STATUSES.filter((s) => s !== 'error'));

const failure = (error) => ({ status: 'error', error });
const unexpected = (what) => failure(new Error(`Unexpected answer from ${what}`));

// snake_case → camelCase for every key, all the way down (arrays and objects). Values are left alone.
const camelKey = (key) => key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
export function toCamel(value) {
  if (Array.isArray(value)) return value.map(toCamel);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [camelKey(k), toCamel(v)]));
  return value;
}

// '09:00:00' → '09:00' (how the app keeps a time). Anything else comes back as it was.
const shortTime = (t) => (typeof t === 'string' && /^\d\d:\d\d(:\d\d)?$/.test(t) ? t.slice(0, 5) : t);

// Calls one database function and turns its answer into { status, …camelCase }. okShape(answer) says whether
// an ok answer has the expected fields; a wrong shape → 'error' rather than a guess.
async function callRpc(name, args, okShape = () => true) {
  try {
    if (!supabase) return failure(new Error('No connection is set up'));
    const { data, error } = await supabase.rpc(name, args);
    if (error) return failure(error);
    const status = data?.status;
    if (typeof status !== 'string' || !SERVER_STATUSES.has(status)) return unexpected(name);
    const answer = toCamel(data);
    if (status === 'ok' && !okShape(answer)) return unexpected(name);
    return answer;
  } catch (error) {
    return failure(error);
  }
}

const isInt = (v) => Number.isInteger(v);
const isText = (v) => typeof v === 'string' && v.length > 0;
const hasVersion = (d) => isInt(d.version);

// A school as the database wants it: the dashboard's 'Worcester' / 'Shrewsbury' / 'Both' → 'worcester' …
export const schoolCode = (location) => String(location ?? '').toLowerCase();

// ----- Reading -----

// Prices, the age line and the whole board chart (every signed-in staff member may read them).
// → { status:'ok', settings:{ techCents, adultCents, cardExtraCents, sameDayExtraCents, childMaxAge, version },
//     chart:[{ id, band, rankName, sort, technique, techBoards, adultBoards }] }
export async function loadSettings() {
  return callRpc('brk_settings_get', {}, (d) => d.settings && hasVersion(d.settings) && Array.isArray(d.chart));
}

// The events a school list shows ('worcester' | 'shrewsbury' | 'both'; the app's 'Worcester' also works).
// → { status:'ok', events:[{ id, name, locationCode, eventDate, registrationOpen, publicCode, registered, paid, version }] }
export async function loadEvents(location) {
  return callRpc('brk_events_list', { p_location_code: schoolCode(location) }, (d) => Array.isArray(d.events));
}

// One event with every student, their payments and (admins only) the Square payments that need a look.
// → { status:'ok', event:{ id, name, locationCode, eventDate, registrationOpen, publicCode, version,
//       classes:[{ id, name, startTime, endTime, sort }] },
//     registrations:[{ id, classId, firstName, lastName, age, rankName, bandUsed, techBoards, adultBoards,
//       payingBy, payingByOnForm, sameDay, amountCents, overrideCents, owedCents, paidCents, broke, brokeOn,
//       hasLink, source, version, createdAt,
//       payments:[{ id, kind ('payment' | 'refund' | 'reversal'), amountCents, method, paidOn, school,
//                   recordedAt, recordedByName, reversesPaymentId }] }],
//     needsLook:[{ squareEventId, receivedAt, outcome, amountCents, orderId }] }
//   or 'not_found' / 'no_access' / 'error'. The roster's rows keep the database's order (screens sort).
export async function loadRoster(eventId) {
  const answer = await callRpc('brk_event_roster', { p_event_id: eventId }, (d) => d.event && Array.isArray(d.event.classes) && Array.isArray(d.registrations));
  if (answer.status !== 'ok') return answer;
  return {
    ...answer,
    event: { ...answer.event, classes: answer.event.classes.map((c) => ({ ...c, startTime: shortTime(c.startTime), endTime: shortTime(c.endTime) })).sort((a, b) => a.sort - b.sort) },
    needsLook: Array.isArray(answer.needsLook) ? answer.needsLook : [],
  };
}

// History of one student (the change log, no login ids). → { status:'ok', rows:[{ … }] } as the database sends it.
export async function loadRegistrationHistory(registrationId) {
  return callRpc('brk_registration_history', { p_registration_id: registrationId }, (d) => Array.isArray(d.rows));
}

// ----- Events (admins) -----

// Add event. classesFrom = an event id whose class times are copied (null: the database picks the school's
// latest earlier event). → { status:'ok', eventId, publicCode }
export async function addEvent({ name, locationCode, eventDate, classesFrom = null }) {
  return callRpc('brk_add_event', {
    p_name: name, p_location_code: schoolCode(locationCode), p_event_date: eventDate, p_copy_classes_from: classesFrom,
  }, (d) => isText(d.eventId) && isText(d.publicCode));
}

// Edit event: name, date and the Registration switch (the school never changes). → { status:'ok', version }
export async function updateEvent(eventId, expectedVersion, { name, eventDate, registrationOpen }) {
  return callRpc('brk_update_event', {
    p_event_id: eventId, p_expected_version: expectedVersion, p_name: name, p_event_date: eventDate, p_registration_open: registrationOpen,
  }, hasVersion);
}

// Delete event (refused with 'has_payments' when any payment row exists). → { status:'ok' }
export async function deleteEvent(eventId, expectedVersion) {
  return callRpc('brk_delete_event', { p_event_id: eventId, p_expected_version: expectedVersion });
}

// Save the event's class times, in order. classes = [{ id?, name, startTime, endTime }] — an id keeps that class
// (and its students), no id adds one, a class left out is removed ('class_in_use' + classId while it has students).
// → { status:'ok', version }
export async function saveClasses(eventId, expectedVersion, classes) {
  return callRpc('brk_save_classes', {
    p_event_id: eventId, p_expected_version: expectedVersion,
    p_classes: classes.map((c) => ({ ...(c.id ? { id: c.id } : {}), name: c.name, start_time: c.startTime, end_time: c.endTime })),
  }, hasVersion);
}

// ----- Students -----

const studentArgs = (s) => ({
  p_first_name: s.firstName, p_last_name: s.lastName, p_age: s.age, p_rank_name: s.rankName, p_class_id: s.classId,
  p_tech: s.tech, p_adult: s.adult, p_paying_by: s.payingBy,
});

// Add student (a walk-in at the desk; works while registration is closed). The database prices it.
// → { status:'ok', registrationId, amountCents, version } · 'invalid' (+ field)
export async function addStudent(eventId, student) {
  return callRpc('brk_add_student', { p_event_id: eventId, ...studentArgs(student) }, (d) => isText(d.registrationId) && isInt(d.amountCents) && hasVersion(d));
}

// Edit student. The amount is worked out again; 'amount_below_paid' + paidCents when it would fall under what
// is already paid. → { status:'ok', amountCents, version, linkCleared }
export async function editRegistration(registrationId, expectedVersion, student) {
  return callRpc('brk_edit_registration', { p_registration_id: registrationId, p_expected_version: expectedVersion, ...studentArgs(student) },
    (d) => isInt(d.amountCents) && hasVersion(d));
}

// Override price (admin). overrideCents null clears it. → { status:'ok', amountCents, version }
export async function setOverride(registrationId, expectedVersion, overrideCents) {
  return callRpc('brk_set_override', { p_registration_id: registrationId, p_expected_version: expectedVersion, p_override_cents: overrideCents },
    (d) => isInt(d.amountCents) && hasVersion(d));
}

// Broke / not broke. → { status:'ok', version, brokeOn }
export async function setBroke(registrationId, expectedVersion, broke) {
  return callRpc('brk_set_broke', { p_registration_id: registrationId, p_expected_version: expectedVersion, p_broke: broke }, hasVersion);
}

// Delete student (admin; 'has_payments' while any payment row exists). → { status:'ok' }
export async function deleteRegistration(registrationId, expectedVersion) {
  return callRpc('brk_delete_registration', { p_registration_id: registrationId, p_expected_version: expectedVersion });
}

// ----- Payments -----

// Mark paid. school = THIS DEVICE's school ('worcester' | 'shrewsbury'); method null = the student's Paying by.
// → { status:'ok', paymentId, amountCents, method, school, payingBy, version } · 'already_paid'
export async function markPaid(registrationId, expectedVersion, school, method = null) {
  return callRpc('brk_mark_paid', {
    p_registration_id: registrationId, p_expected_version: expectedVersion, p_school: schoolCode(school), p_method: method,
  }, (d) => isText(d.paymentId) && isInt(d.amountCents) && hasVersion(d));
}

// Undo a payment: staff their own within 10 seconds, admins any. → { status:'ok', version } · 'not_allowed' ·
// 'stale' · 'refund_stands'
export async function undoPayment(paymentId) {
  return callRpc('brk_undo_payment', { p_payment_id: paymentId }, hasVersion);
}

// Edit payment (admin). → { status:'ok', paymentId, version }
export async function editPayment(paymentId, { method, amountCents, paidOn, school }) {
  return callRpc('brk_edit_payment', {
    p_payment_id: paymentId, p_method: method, p_amount_cents: amountCents, p_paid_on: paidOn, p_school: schoolCode(school),
  }, (d) => isText(d.paymentId) && hasVersion(d));
}

// Record refund (admin; cash or check). → { status:'ok', paymentId, version } · 'refund_too_large' + overpaidCents
export async function recordRefund(registrationId, expectedVersion, { method, amountCents, refundedOn, school }) {
  return callRpc('brk_record_refund', {
    p_registration_id: registrationId, p_expected_version: expectedVersion, p_method: method,
    p_amount_cents: amountCents, p_refunded_on: refundedOn, p_school: schoolCode(school),
  }, (d) => isText(d.paymentId) && hasVersion(d));
}

// Undo a refund (admin). → { status:'ok', version }
export async function undoRefund(paymentId) {
  return callRpc('brk_undo_refund', { p_payment_id: paymentId }, hasVersion);
}

// Dismiss one Square payment that needed a look (admin). → { status:'ok' }
export async function dismissSquareEvent(squareEventId) {
  return callRpc('brk_dismiss_square_event', { p_square_event_id: squareEventId });
}

// ----- Prices, age line, chart (admins) -----

// Save the four prices and the age line. All cents 0–100000, age 1–99. → { status:'ok', version }
export async function saveSettings(expectedVersion, { techCents, adultCents, cardExtraCents, sameDayExtraCents, childMaxAge }) {
  return callRpc('brk_save_settings', {
    p_expected_version: expectedVersion, p_tech_cents: techCents, p_adult_cents: adultCents,
    p_card_extra_cents: cardExtraCents, p_same_day_extra_cents: sameDayExtraCents, p_child_max_age: childMaxAge,
  }, hasVersion);
}

// Save the WHOLE chart (it replaces every row). rows = [{ band, rankName, sort, technique, techBoards, adultBoards }].
// The version is the settings row's. → { status:'ok', version } · 'invalid'
export async function saveChart(expectedVersion, rows) {
  return callRpc('brk_save_chart', {
    p_expected_version: expectedVersion,
    p_rows: rows.map((r) => ({
      band: r.band, rank_name: r.rankName, sort: r.sort, technique: r.technique ?? '', tech_boards: r.techBoards, adult_boards: r.adultBoards,
    })),
  }, hasVersion);
}
