// api.js — every call the Prospects screens make to the database, in one place.
// Why it exists: like forms/api.js — the screens never need table names or the argument names of
// the database functions (migration 0012). Every function returns a plain object with a `status`
// and NEVER throws:
//   'ok'              it worked (plus the result fields)
//   'no_access'       this sign-in can't see data right now (locked, password too old …)
//   'not_allowed'     only an admin can do that — or (check in, booking) not possible right now
//   'not_found'       the prospect / status no longer exists
//   'stale'           someone else changed it since this screen loaded it
//   'duplicate_name'  (statuses) another status of this school already has that name
//   'time_taken'      (booking) that free-class time just filled up or was cancelled
//   'invalid'         the values were refused
//   'error'           anything else (no connection, unexpected answer) — { status:'error', error }
// The database answers in snake_case; this file converts to camelCase.
import { supabase } from '../supabase.js';
import { agesFromRow } from '../schedule/ages.js';

export const PROSPECTS_STATUSES = ['ok', 'no_access', 'not_allowed', 'not_found', 'stale', 'duplicate_name', 'time_taken', 'invalid', 'error'];
const SERVER_STATUSES = new Set(PROSPECTS_STATUSES.filter((s) => s !== 'error'));
const STATUS_COLUMNS = 'id, location_code, name, kind, position, color, builtin, version';

const failure = (error) => ({ status: 'error', error });
const unexpected = (what) => failure(new Error(`Unexpected answer from ${what}`));

const toStatus = (r) => ({ id: r.id, locationCode: r.location_code, name: r.name, kind: r.kind, position: r.position, color: r.color, builtin: r.builtin ?? null, version: r.version });

function toBooking(b) {
  if (!b) return null;
  return { id: b.id, status: b.status, classId: b.class_id ?? null, className: b.class_name, date: b.date, start: b.starts_at, end: b.ends_at, classRunning: b.class_running === true };
}

function toListItem(r) {
  return {
    id: r.id, version: r.version, familyId: r.family_id, childFirstName: r.child_first_name, parentName: r.parent_name, statusId: r.status_id,
    followUpOn: r.follow_up_on ?? null, joinedOn: r.joined_on ?? null, createdAt: r.created_at, signedUpAt: r.signed_up_at ?? null, checkedIn: r.checked_in === true,
    openedByMe: r.opened_by_me === true, booking: toBooking(r.booking), askCame: r.ask_came === true,
  };
}

function toProspect(p) {
  return {
    id: p.id, version: p.version, locationCode: p.location_code, familyId: p.family_id, childFirstName: p.child_first_name, childAge: p.child_age,
    statusId: p.status_id, followUpOn: p.follow_up_on ?? null, joinedOn: p.joined_on ?? null, checkedInAt: p.checked_in_at ?? null,
    checkedInByName: p.checked_in_by_name ?? null, parentName: p.parent_name, parentPhone: p.parent_phone, parentEmail: p.parent_email,
    formId: p.form_id, formName: p.form_name, source: p.source, enteredBy: p.entered_by ?? null, signedUpAt: p.signed_up_at,
    signedAt: p.signed_at ?? null, hasSignature: p.has_signature === true, fields: Array.isArray(p.fields) ? p.fields : [], answers: p.answers ?? {},
    booking: toBooking(p.booking),
    siblings: (p.siblings ?? []).map((x) => ({ id: x.id, childFirstName: x.child_first_name, childAge: x.child_age, statusId: x.status_id })),
    notes: (p.notes ?? []).map((n) => ({ id: n.id, body: n.body, followUpOn: n.follow_up_on ?? null, createdAt: n.created_at, createdByName: n.created_by_name })),
    activity: (p.activity ?? []).map((a) => ({ kind: a.kind, detail: a.detail ?? {}, createdAt: a.created_at, createdByName: a.created_by_name })),
  };
}

async function callRpc(name, args, readOk) {
  try {
    if (!supabase) return failure(new Error('No connection is set up'));
    const { data, error } = await supabase.rpc(name, args);
    if (error) return failure(error);
    const status = data?.status;
    if (typeof status !== 'string' || !SERVER_STATUSES.has(status)) return unexpected(name);
    if (status !== 'ok') return { status };
    const result = readOk(data);
    return result ? { status: 'ok', ...result } : unexpected(name);
  } catch (error) {
    return failure(error);
  }
}

const readSaved = (d) => (typeof d.id === 'string' && Number.isInteger(d.version) ? { id: d.id, version: d.version } : null);

// ----- Reading -----

// Both schools' status lists (the screen picks the shown school's).
export async function loadStatuses() {
  try {
    if (!supabase) return failure(new Error('No connection is set up'));
    const res = await supabase.from('prospect_statuses').select(STATUS_COLUMNS).order('position', { ascending: true });
    if (res?.error) return failure(res.error);
    if (!Array.isArray(res?.data)) return unexpected('prospect_statuses');
    return { status: 'ok', statuses: res.data.map(toStatus) };
  } catch (error) {
    return failure(error);
  }
}

// One school's prospects, list columns only (never phone, email, age or answers).
export async function listProspects(locationCode) {
  return callRpc('prospects_list', { p_location_code: locationCode }, (d) => (Array.isArray(d.prospects) ? { today: d.today, prospects: d.prospects.map(toListItem) } : null));
}

// Ids of the prospects whose child or parent name contains `text`, or (4+ digits) whose phone does.
export async function searchProspects(locationCode, text) {
  return callRpc('prospects_search', { p_location_code: locationCode, p_text: text }, (d) => (Array.isArray(d.ids) ? { ids: d.ids } : null));
}

// The side panel.
export async function getProspect(id) {
  return callRpc('prospects_get', { p_prospect_id: id }, (d) => (d.prospect ? { prospect: toProspect(d.prospect) } : null));
}

// How many New / Booked prospects I haven't opened (null = both schools).
export async function prospectsBadge(locationCode) {
  return callRpc('prospects_badge', { p_location_code: locationCode }, (d) => (Number.isInteger(d.count) ? { count: d.count } : null));
}

// For the Calendar: which prospect each free-class booking belongs to.
export async function prospectsForBookings(bookingIds) {
  return callRpc('prospects_for_bookings', { p_booking_ids: bookingIds }, (d) => (Array.isArray(d.prospects)
    ? { prospects: d.prospects.map((x) => ({ bookingId: x.booking_id, prospectId: x.prospect_id, version: x.version, checkedIn: x.checked_in === true, builtin: x.builtin ?? null })) }
    : null));
}

// ----- Working a prospect -----

export async function setStatus({ id, expectedVersion, statusId, joinedOn = null }) {
  return callRpc('prospects_set_status', { p_prospect_id: id, p_expected_version: expectedVersion, p_status_id: statusId, p_joined_on: joinedOn }, readSaved);
}

// setFollowUp false = leave the follow-up as it is; true + followUpOn null = No follow-up.
export async function addNote({ id, body, setFollowUp, followUpOn }) {
  return callRpc('prospects_add_note', { p_prospect_id: id, p_body: body, p_set_follow_up: setFollowUp, p_follow_up_on: followUpOn ?? null }, readSaved);
}

export async function setFollowUp({ id, expectedVersion, followUpOn }) {
  return callRpc('prospects_set_follow_up', { p_prospect_id: id, p_expected_version: expectedVersion, p_follow_up_on: followUpOn }, readSaved);
}

export async function markOpened(id) {
  return callRpc('prospects_mark_opened', { p_prospect_id: id }, () => ({}));
}

// came true + afterClass false = Check in; afterClass true = the "Did … come?" answer.
// Returns what Undo needs: previousStatusId, previousFollowUpOn.
export async function checkIn({ id, expectedVersion, came, afterClass }) {
  return callRpc('prospects_check_in', { p_prospect_id: id, p_expected_version: expectedVersion, p_came: came, p_after_class: afterClass }, (d) => (readSaved(d)
    ? { ...readSaved(d), previousStatusId: d.previous_status_id, previousFollowUpOn: d.previous_follow_up_on ?? null }
    : null));
}

export async function undoCheckIn({ id, expectedVersion, previousStatusId, previousFollowUpOn }) {
  return callRpc('prospects_undo_check_in', {
    p_prospect_id: id, p_expected_version: expectedVersion, p_previous_status_id: previousStatusId, p_previous_follow_up_on: previousFollowUpOn ?? null,
  }, readSaved);
}

// ----- Free classes from the panel -----

export async function openTimesFor({ id, from, to }) {
  return callRpc('prospects_open_times', { p_prospect_id: id, p_from: from, p_to: to }, (d) => (Array.isArray(d.times)
    // ageFrom / ageTo: the class's ages, only shown (migration 0031, v0.619)
    ? { times: d.times.map((t) => ({ formId: t.form_id, classId: t.class_id, className: t.class_name, date: t.date, start: t.starts_at, end: t.ends_at, spotsLeft: t.spots_left, ageFrom: agesFromRow(t).from, ageTo: agesFromRow(t).to })) }
    : null));
}

export async function bookTime({ id, expectedVersion, formId, classId, date, start }) {
  return callRpc('prospects_book_time', { p_prospect_id: id, p_expected_version: expectedVersion, p_form_id: formId, p_class_id: classId, p_date: date, p_starts_at: start }, readSaved);
}

// Returns what Undo needs (the time it had) — Undo books it again.
export async function cancelTime({ id, expectedVersion }) {
  return callRpc('prospects_cancel_time', { p_prospect_id: id, p_expected_version: expectedVersion }, (d) => (readSaved(d) && d.cancelled
    ? { ...readSaved(d), cancelled: { formId: d.cancelled.form_id, classId: d.cancelled.class_id, date: d.cancelled.date, start: d.cancelled.starts_at } }
    : null));
}

// ----- Statuses (each school's own list) -----

export async function addStatus({ locationCode, name, kind, color }) {
  return callRpc('prospect_statuses_add', { p_location_code: locationCode, p_name: name, p_kind: kind, p_color: color }, readSaved);
}

export async function updateStatus({ id, expectedVersion, name, kind, color }) {
  return callRpc('prospect_statuses_update', { p_status_id: id, p_expected_version: expectedVersion, p_name: name, p_kind: kind, p_color: color }, readSaved);
}

export async function reorderStatuses({ locationCode, expectedIds, newIds }) {
  return callRpc('prospect_statuses_reorder', { p_location_code: locationCode, p_expected_ids: expectedIds, p_new_ids: newIds }, () => ({}));
}

// Admins only. expectedCount = how many people the screen showed in it; moveToId = where they go.
export async function deleteStatus({ id, expectedVersion, expectedCount, moveToId }) {
  return callRpc('prospect_statuses_delete', { p_status_id: id, p_expected_version: expectedVersion, p_expected_count: expectedCount, p_move_to_id: moveToId },
    (d) => (Number.isInteger(d.moved) ? { moved: d.moved } : null));
}

// Admins only. familyRemoved: the family's sign-up went too (this was its last child).
export async function deleteProspect({ id, expectedVersion }) {
  return callRpc('prospects_delete', { p_prospect_id: id, p_expected_version: expectedVersion }, (d) => ({ familyRemoved: d.family_removed === true }));
}
