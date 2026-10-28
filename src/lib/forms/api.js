// api.js — every call the Forms screens make to the database, in one place.
// Why it exists: like calendar/api.js — the screens never need table names, column lists or the
// argument names of the database functions (migration 0009). Every function returns a plain
// object with a `status` and NEVER throws:
//   'ok'              it worked (plus the result fields)
//   'no_access'       this sign-in can't see data right now (locked, password too old …)
//   'not_allowed'     only an admin can build forms — or (delete) the form already has sign-ups
//   'not_found'       the form no longer exists (or, for kiosk, isn't Live)
//   'stale'           someone else changed it since this screen loaded it
//   'duplicate_slug'  another form already uses that link
//   'not_publishable' the waiver has no wording yet (v0.241 answer 4)
//   'invalid'         the values were refused
//   'closed'          (Fill in) the form was closed meanwhile
//   'form_changed'    (Fill in) the form was published again meanwhile
//   'time_taken'      (Fill in) a picked free-class time just filled up or was cancelled
//   'error'           anything else (no connection, unexpected answer) — { status:'error', error }
// The database answers in snake_case; this file converts to camelCase.
import { supabase } from '../supabase.js';
import { agesFromRow } from '../schedule/ages.js';

export const FORMS_STATUSES = ['ok', 'no_access', 'not_allowed', 'not_found', 'stale', 'duplicate_slug', 'not_publishable', 'invalid',
  'closed', 'form_changed', 'time_taken', 'error'];
const SERVER_STATUSES = new Set(FORMS_STATUSES.filter((s) => s !== 'error'));

// The columns the app may read (the database refuses select('*') and the hidden columns on purpose).
const FORM_COLUMNS = 'id, location_code, name, slug, kind, status, draft, published, published_version, published_at, settings, version, updated_at, updated_by_name';
const OFFER_COLUMNS = 'id, form_id, class_id, default_limit, days_ahead, min_hours_ahead';
const LIMIT_COLUMNS = 'id, form_id, class_id, weekday, starts_at, spot_limit';
const SUBMISSION_COLUMNS = 'id, form_id, location_code, published_version, fields, answers, parent_name, parent_phone, parent_email, children, signed_at, entered_by, source, created_at';

const failure = (error) => ({ status: 'error', error });
const unexpected = (what) => failure(new Error(`Unexpected answer from ${what}`));
const isText = (v) => typeof v === 'string' && v.length > 0;
const isInt = (v) => Number.isInteger(v);

function toForm(row) {
  return {
    id: row.id,
    locationCode: row.location_code,
    name: row.name,
    slug: row.slug,
    kind: row.kind,
    status: row.status, // 'draft' | 'live' | 'closed'
    draft: Array.isArray(row.draft) ? row.draft : [],
    published: Array.isArray(row.published) ? row.published : null,
    publishedVersion: row.published_version,
    publishedAt: row.published_at ?? null,
    settings: row.settings ?? {},
    version: row.version,
    updatedAt: row.updated_at,
    updatedByName: row.updated_by_name,
  };
}

const toOffer = (r) => ({ id: r.id, classId: r.class_id, defaultLimit: r.default_limit, daysAhead: r.days_ahead, minHoursAhead: r.min_hours_ahead });
const toLimit = (r) => ({ id: r.id, classId: r.class_id, weekday: r.weekday, start: String(r.starts_at).slice(0, 5), spotLimit: r.spot_limit });

function toSubmission(row) {
  return {
    id: row.id,
    formId: row.form_id,
    locationCode: row.location_code,
    publishedVersion: row.published_version,
    fields: Array.isArray(row.fields) ? row.fields : [],
    answers: row.answers ?? {},
    parentName: row.parent_name,
    parentPhone: row.parent_phone,
    parentEmail: row.parent_email,
    children: Array.isArray(row.children) ? row.children : [],
    signedAt: row.signed_at ?? null,
    enteredBy: row.entered_by ?? null,
    source: row.source,
    createdAt: row.created_at,
  };
}

async function access() {
  const res = await supabase.rpc('has_data_access');
  if (!res?.error && res?.data === false) return { status: 'no_access' };
  if (res?.error) return failure(res.error);
  return res?.data === true ? null : unexpected('has_data_access');
}

// ----- Reading -----

// Every form (both schools — the screen filters) with how many sign-ups each had since `since`
// ('YYYY-MM-DD', the first of this month). Only ids and dates of sign-ups are read for the count.
export async function loadForms({ since }) {
  try {
    if (!supabase) return failure(new Error('No connection is set up'));
    const denied = await access();
    if (denied) return denied;
    const [formRes, subRes] = await Promise.all([
      supabase.from('forms').select(FORM_COLUMNS).order('name', { ascending: true }),
      supabase.from('form_submissions').select('id, form_id, created_at').gte('created_at', since),
    ]);
    for (const res of [formRes, subRes]) if (res?.error) return failure(res.error);
    if (!Array.isArray(formRes?.data) || !Array.isArray(subRes?.data)) return unexpected('the forms tables');
    const counts = new Map();
    for (const s of subRes.data) counts.set(s.form_id, (counts.get(s.form_id) ?? 0) + 1);
    return { status: 'ok', forms: formRes.data.map(toForm), monthCounts: counts };
  } catch (error) {
    return failure(error);
  }
}

// One form with its booking settings.
export async function loadForm(formId) {
  try {
    if (!supabase) return failure(new Error('No connection is set up'));
    const denied = await access();
    if (denied) return denied;
    const [formRes, offerRes, limitRes] = await Promise.all([
      supabase.from('forms').select(FORM_COLUMNS).eq('id', formId),
      supabase.from('form_booking_offers').select(OFFER_COLUMNS).eq('form_id', formId),
      supabase.from('form_booking_limits').select(LIMIT_COLUMNS).eq('form_id', formId),
    ]);
    for (const res of [formRes, offerRes, limitRes]) if (res?.error) return failure(res.error);
    if (![formRes, offerRes, limitRes].every((r) => Array.isArray(r?.data))) return unexpected('the forms tables');
    if (formRes.data.length === 0) return { status: 'not_found' };
    return { status: 'ok', form: toForm(formRes.data[0]), offers: offerRes.data.map(toOffer), limits: limitRes.data.map(toLimit) };
  } catch (error) {
    return failure(error);
  }
}

// A form's sign-ups, newest first (never the signature picture — see loadSignature).
export async function loadSubmissions(formId) {
  try {
    if (!supabase) return failure(new Error('No connection is set up'));
    const res = await supabase.from('form_submissions').select(SUBMISSION_COLUMNS).eq('form_id', formId).order('created_at', { ascending: false });
    if (res?.error) return failure(res.error);
    if (!Array.isArray(res?.data)) return unexpected('form_submissions');
    return { status: 'ok', submissions: res.data.map(toSubmission) };
  } catch (error) {
    return failure(error);
  }
}

// ----- Calling the functions -----

async function callRpc(name, args, readOk) {
  try {
    if (!supabase) return failure(new Error('No connection is set up'));
    const { data, error } = await supabase.rpc(name, args);
    if (error) return failure(error);
    const status = data?.status;
    if (typeof status !== 'string' || !SERVER_STATUSES.has(status)) return unexpected(name);
    if (status !== 'ok') return { status, reason: data.reason ?? null, publishedVersion: data.published_version ?? null };
    const result = readOk(data);
    return result ? { status: 'ok', ...result } : unexpected(name);
  } catch (error) {
    return failure(error);
  }
}

const readSaved = (d) => (isText(d.id) && isInt(d.version) ? { id: d.id, version: d.version } : null);

// kind: 'free_class' | 'walk_in' | 'event' | 'blank'. The form starts as a Draft from its template.
export async function createForm({ locationCode, kind, name, slug }) {
  return callRpc('forms_create', { p_location_code: locationCode, p_kind: kind, p_name: name, p_slug: slug }, readSaved);
}

// "Saves as you go": the name, link, field list and settings. Families see nothing until Publish.
export async function saveDraft({ id, expectedVersion, name, slug, draft, settings }) {
  return callRpc('forms_save_draft', { p_form_id: id, p_expected_version: expectedVersion, p_name: name, p_slug: slug, p_draft: draft, p_settings: settings }, readSaved);
}

export async function publishForm({ id, expectedVersion }) {
  return callRpc('forms_publish', { p_form_id: id, p_expected_version: expectedVersion }, readSaved);
}

// status: 'live' | 'closed'
export async function setFormStatus({ id, expectedVersion, status }) {
  return callRpc('forms_set_status', { p_form_id: id, p_expected_version: expectedVersion, p_status: status }, readSaved);
}

export async function duplicateForm(id) {
  return callRpc('forms_duplicate', { p_form_id: id }, (d) => (isText(d.id) && isText(d.slug) ? { id: d.id, version: d.version, slug: d.slug } : null));
}

// Refused with { status:'not_allowed', reason:'has_signups' } once a family has signed up.
export async function deleteForm({ id, expectedVersion }) {
  return callRpc('forms_delete', { p_form_id: id, p_expected_version: expectedVersion }, () => ({}));
}

// offers: [{ classId, defaultLimit, daysAhead, minHoursAhead }]
// limits: [{ classId, weekday, start 'HH:MM', spotLimit }]   (0 = this time isn't offered)
// Takes effect right away, also on a Live form (rulebook v0.242).
export async function setBooking({ id, expectedVersion, offers, limits }) {
  return callRpc('forms_set_booking', {
    p_form_id: id,
    p_expected_version: expectedVersion,
    p_offers: offers.map((o) => ({ class_id: o.classId, default_limit: o.defaultLimit, days_ahead: o.daysAhead, min_hours_ahead: o.minHoursAhead })),
    p_limits: limits.map((l) => ({ class_id: l.classId, weekday: l.weekday, starts_at: l.start, spot_limit: l.spotLimit })),
  }, readSaved);
}

// ageFrom / ageTo: the class's ages, shown next to it (migration 0031, v0.619); null = none
const toTime = (t) => {
  const a = agesFromRow(t);
  return { classId: t.class_id, className: t.class_name, date: t.date, start: t.starts_at, end: t.ends_at, spotsLeft: t.spots_left, ageFrom: a.from, ageTo: a.to };
};

// The free-class times families would see right now (Fill in, builder preview).
export async function openTimes({ formId, from, to }) {
  return callRpc('forms_open_times', { p_form_id: formId, p_from: from, p_to: to }, (d) => (Array.isArray(d.times) ? { times: d.times.map(toTime) } : null));
}

// "Fill in for a family". bookings: [{ child (0-based), classId, date, start 'HH:MM' }].
// submissionKey: a new random id per Send attempt (a repeated Send then gets the same answer).
export async function staffSubmit({ formId, submissionKey, publishedVersion, answers, children, bookings, signature }) {
  return callRpc('forms_staff_submit', {
    p_form_id: formId,
    p_submission_key: submissionKey,
    p_published_version: publishedVersion,
    p_answers: answers,
    p_children: children,
    p_bookings: bookings.map((b) => ({ child: b.child, class_id: b.classId, date: b.date, starts_at: b.start })),
    p_signature: signature,
  }, (d) => (isText(d.id) && Array.isArray(d.bookings)
    ? { id: d.id, repeat: d.repeat === true, bookings: d.bookings.map((b) => ({ child: b.child, className: b.class_name, date: b.date, start: b.starts_at, end: b.ends_at })) }
    : null));
}

// Free-class bookings for the Calendar: locationCode null = both schools. At most 63 days.
export async function bookingsBetween({ locationCode, from, to }) {
  return callRpc('forms_bookings_between', { p_location_code: locationCode, p_from: from, p_to: to }, (d) => (Array.isArray(d.bookings)
    ? {
      bookings: d.bookings.map((b) => ({
        id: b.id, locationCode: b.location_code, classId: b.class_id ?? null, className: b.class_name, date: b.date,
        start: b.starts_at, end: b.ends_at, childFirstName: b.child_first_name ?? '', formId: b.form_id, formName: b.form_name,
        status: b.status, classRunning: b.class_running === true,
      })),
    }
    : null));
}

// One sign-up's signature picture (every look is recorded). signature null = deleted after 90 days.
export async function loadSignature(submissionId) {
  return callRpc('forms_submission_signature', { p_submission_id: submissionId }, (d) => ({ signature: d.signature ?? null, signedAt: d.signed_at ?? null }));
}

export async function kioskToken(formId) {
  return callRpc('forms_kiosk_token', { p_form_id: formId }, (d) => (isText(d.token) ? { token: d.token, hours: d.expires_in_hours } : null));
}

export async function kioskRevoke(formId) {
  return callRpc('forms_kiosk_revoke', { p_form_id: formId }, (d) => (isInt(d.revoked) ? { revoked: d.revoked } : null));
}
