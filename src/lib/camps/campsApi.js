// campsApi.js — every call the Camps screens make to the database (contract 0013 §5.2).
// Why it exists: like testing/eventsApi.js does for Color Belt, this keeps table names, column
// lists and the exact argument names of the database functions (migration 0013, §1.14) in one
// place. Screens call friendly camelCase functions and always get back a plain object with a
// `status` CODE (never words — the screens' text.js turns codes into words):
//   'ok' (plus the result fields) · 'no_access' · 'not_allowed' · 'not_found' · 'stale' ·
//   'duplicate_name' · 'invalid' (+ field) · 'not_empty' (+ kind, day / extraName …) · 'finished' ·
//   'already_paid' · 'withdrawn' · 'checked_in' (+ day) · 'future_day' ·
//   'error' (no connection / unexpected answer — { status:'error', error })
// These functions NEVER throw.
//
// The conversion rule (one rule, no hand-written mapping): every column and every key inside a
// jsonb answer is turned from snake_case into camelCase by campRules.toCamel (price_cents →
// priceCents, day_id → dayId). The only renames: the `id` of a camp_days row becomes `dayId` and
// the `id` of a camp_extras row becomes `extraId` (the shapes of §5.1). What the app sends is
// turned back the same way (toSnake). Times come from the database as '09:00:00' and are kept as
// '09:00'. Dates stay 'YYYY-MM-DD' text. Money is whole cents (7500 = $75).
import { supabase, isPreview } from '../supabase.js';
import { readStorage } from '../storage.js';
import { PREVIEW_TODAY_KEY } from '../testing/eventRules.js';
import { toCamel, toSnake, campCounts, isIsoDate, todayInSchoolTime } from './campRules.js';
import {
  CAMP_COLUMNS, DAY_COLUMNS, PRICE_COLUMNS, EXTRA_COLUMNS, TEMPLATE_COLUMNS, ROSTER_COLUMNS,
  toCamp, toDay, byDay, toPriceRow, toExtra, toTemplate, toRosterRow, campArgs, templateArgs,
} from './campsArgs.js';

export { toCamel, toSnake };

// Every status a call here can return.
export const CAMP_STATUSES = [
  'ok', 'no_access', 'not_allowed', 'not_found', 'stale', 'duplicate_name', 'invalid', 'not_empty', 'finished',
  'already_paid', 'withdrawn', 'checked_in', 'future_day', 'rate_limited', 'not_open', 'closed', 'price_changed',
  'camp_changed', 'error',
];
const SERVER_STATUSES = new Set(CAMP_STATUSES.filter((s) => s !== 'error'));
const LOCATIONS = new Set(['worcester', 'shrewsbury', 'both']);

// How many ids go into one "id is one of these" filter (they travel in the web address).
const IN_CHUNK = 80;

const failure = (error) => ({ status: 'error', error });
const unexpected = (what) => failure(new Error(`Unexpected answer from ${what}`));

// "Today" at the school. In preview mode __tkdPreview.setToday('YYYY-MM-DD') (or campWeek())
// can pretend another date; the preview database uses the same key. Vite replaces isPreview with
// false in the real build, so that branch disappears there.
export function campToday() {
  if (isPreview) {
    const pretend = readStorage(PREVIEW_TODAY_KEY);
    if (isIsoDate(pretend)) return pretend;
  }
  return todayInSchoolTime(new Date());
}

// ----- Reading -----

// The has_data_access check that goes with every read: a locked sign-in gets EMPTY lists from the
// database (row-level security), which must not look like "No camps yet".
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

// The camps a school list shows (the query rule of §5.2, tested by the database tests §2.1 item 8):
//   'both'                     → one select of all camps
//   'worcester' / 'shrewsbury' → two selects, location_code = that school, and both_schools = true,
//                                merged by id
// → { status:'ok', today, camps: [{ …Camp, days: Day[], camperCount }] }  (camperCount = ACTIVE
//   campers; first day earliest first — the screen sorts and splits Upcoming / Past itself)
export async function loadCamps(location) {
  try {
    if (!LOCATIONS.has(location)) return failure(new Error(`Unknown school: ${location}`));
    if (!supabase) return failure(new Error('No connection is set up'));
    const today = campToday();
    const queries = location === 'both'
      ? [supabase.from('camps').select(CAMP_COLUMNS)]
      : [
        supabase.from('camps').select(CAMP_COLUMNS).eq('location_code', location),
        supabase.from('camps').select(CAMP_COLUMNS).eq('both_schools', true),
      ];
    const [denied, ...results] = await Promise.all([accessCheck(), ...queries]);
    if (denied) return denied;
    const byId = new Map();
    for (const res of results) {
      if (res?.error) return failure(res.error);
      if (!Array.isArray(res.data)) return unexpected('camps');
      for (const row of res.data) byId.set(row.id, row); // a both-schools camp of this school comes twice: kept once
    }
    const ids = [...byId.keys()];
    const [dayRes, rosterRes] = await Promise.all([
      selectIn('camp_days', DAY_COLUMNS, 'camp_id', ids),
      selectIn('camp_roster', 'camp_id, status', 'camp_id', ids),
    ]);
    if (dayRes.error) return failure(dayRes.error);
    if (rosterRes.error) return failure(rosterRes.error);
    const counts = campCounts(toCamel(rosterRes.rows));
    const camps = [...byId.values()].map((row) => ({
      ...toCamp(row),
      days: dayRes.rows.filter((d) => d.camp_id === row.id).map(toDay).sort(byDay),
      camperCount: counts[row.id] ?? 0,
    }));
    camps.sort((a, b) => ((a.days[0]?.day ?? '') < (b.days[0]?.day ?? '') ? -1 : (a.days[0]?.day ?? '') > (b.days[0]?.day ?? '') ? 1 : 0));
    return { status: 'ok', today, camps };
  } catch (error) {
    return failure(error);
  }
}

// Every template (shared by both schools), A–Z by name.
// → { status:'ok', templates: Template[] }
export async function loadTemplates() {
  try {
    if (!supabase) return failure(new Error('No connection is set up'));
    const [denied, res] = await Promise.all([accessCheck(), supabase.from('camp_templates').select(TEMPLATE_COLUMNS)]);
    if (denied) return denied;
    if (res?.error) return failure(res.error);
    if (!Array.isArray(res.data)) return unexpected('camp_templates');
    const templates = res.data.map(toTemplate).sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
    return { status: 'ok', templates };
  } catch (error) {
    return failure(error);
  }
}

// One camp with everything the camp page needs:
// → { status:'ok', today, startedAt, camp: Camp, days: Day[], prices: PriceRow[], extras: Extra[],
//     roster: RosterRow[], counts: { activeCount, camperCount, paymentTotalCents } }
//   camperCount = ALL campers incl. withdrawn and paymentTotalCents = net of reversals — the two
//   numbers Delete camp sends back. Or { status:'not_found' }.
// startedAt = Date.now() when this call started (to never show a read older than a save).
export async function loadCamp(campId) {
  const startedAt = Date.now();
  try {
    if (typeof campId !== 'string' || campId === '') return failure(new Error('No camp id'));
    if (!supabase) return failure(new Error('No connection is set up'));
    const today = campToday();
    const [denied, campRes, dayRes, priceRes, extraRes, rosterRes] = await Promise.all([
      accessCheck(),
      supabase.from('camps').select(CAMP_COLUMNS).eq('id', campId),
      supabase.from('camp_days').select(DAY_COLUMNS).eq('camp_id', campId).order('day', { ascending: true }),
      supabase.from('camp_prices').select(PRICE_COLUMNS).eq('camp_id', campId).order('day_count', { ascending: true }),
      supabase.from('camp_extras').select(EXTRA_COLUMNS).eq('camp_id', campId).order('sort', { ascending: true }),
      supabase.from('camp_roster').select(ROSTER_COLUMNS).eq('camp_id', campId),
    ]);
    if (denied) return denied;
    for (const res of [campRes, dayRes, priceRes, extraRes, rosterRes]) if (res?.error) return failure(res.error);
    if (![campRes, dayRes, priceRes, extraRes, rosterRes].every((r) => Array.isArray(r?.data))) return unexpected('the camp tables');
    if (campRes.data.length === 0) return { status: 'not_found' };
    const roster = rosterRes.data.map(toRosterRow)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.position - b.position));
    const counts = {
      activeCount: roster.filter((r) => r.status === 'active').length,
      camperCount: roster.length,
      paymentTotalCents: roster.reduce((sum, r) => sum + (Number.isInteger(r.paidCents) ? r.paidCents : 0), 0),
    };
    return {
      status: 'ok', today, startedAt,
      camp: toCamp(campRes.data[0]),
      days: dayRes.data.map(toDay).sort(byDay),
      prices: priceRes.data.map(toPriceRow).sort((a, b) => a.dayCount - b.dayCount),
      extras: extraRes.data.map(toExtra).sort((a, b) => a.sort - b.sort),
      roster,
      counts,
    };
  } catch (error) {
    return failure(error);
  }
}

// Camper detail (camp_camper_detail — the ONLY way the app sees phones; staff and admins).
// → { status:'ok', camper: RosterRow, family: { parentName, parentPhone, parentRelation,
//     emergencyName, emergencyPhone, emergencyRelation }, breakdown: { dayCount, priceKind, member,
//     baseCents, extras:[{ name, per, days:[date], cents }], totalCents, paidCents, owesCents },
//     payments: [{ id, kind, amountCents, method, paidOn, recordedAt, recordedByName,
//     reversesPaymentId }], checkins: [{ day, checkedInAt, checkedInByName }] }
//   or 'no_access' / 'not_found' / 'error'.
export async function loadCamperDetail(camperId) {
  return callRpc('camp_camper_detail', { p_camper_id: camperId }, (d) =>
    d.camper && d.family && d.breakdown && Array.isArray(d.payments) && Array.isArray(d.checkins));
}

// ----- Writing (one database function each, §1.14) -----

// Calls one database function and turns its answer into { status, …camelCase }. okShape(answer)
// says whether an ok answer has the expected fields; a wrong shape → 'error' rather than a guess.
// Refusals keep their extra fields too (not_empty → kind, day, firstName …; invalid → field).
async function callRpc(name, args, okShape) {
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
const nothing = () => true;

// Add camp (admin). → { status:'ok', id, publicCode, version }
export async function addCamp(input) {
  return callRpc('camp_add_camp', campArgs(input, false), (d) => isText(d.id) && isText(d.publicCode) && hasVersion(d));
}

// Edit camp (admin). Extras that carry their extraId are changed in place; new ones are added.
// → { status:'ok', version } · 'not_empty' + { kind:'day', day, firstName, lastName, more } (an
//   active camper picked a removed day) or + { kind:'extra', extraName, count } · 'stale' …
export async function updateCamp(campId, expectedVersion, input) {
  return callRpc('camp_update_camp', { p_camp_id: campId, p_expected_version: expectedVersion, ...campArgs(input, true) }, hasVersion);
}

// Close (open: false) or Reopen (open: true) sign-up. → { status:'ok', version, state } ·
// 'not_allowed' (staff reopening after the closing date) · 'finished'
export async function setSignup(campId, expectedVersion, open) {
  return callRpc('camp_set_signup', { p_camp_id: campId, p_expected_version: expectedVersion, p_open: open },
    (d) => hasVersion(d) && isText(d.state));
}

// Delete camp (admin). The two numbers are what the warning showed: ALL campers (incl. withdrawn)
// and the NET payment total (loadCamp's counts); 'stale' if either has changed since.
export async function deleteCamp(campId, expectedVersion, expectedCamperCount, expectedPaymentTotalCents) {
  return callRpc('camp_delete_camp', {
    p_camp_id: campId, p_expected_version: expectedVersion,
    p_expected_camper_count: expectedCamperCount, p_expected_payment_total_cents: expectedPaymentTotalCents,
  }, nothing);
}

// Save as template (admin). → { status:'ok', id, version } · 'duplicate_name'
export async function saveTemplate(campId, name) {
  return callRpc('camp_save_template', { p_camp_id: campId, p_name: name }, (d) => isText(d.id) && hasVersion(d));
}

// Edit template (admin).
//   input = { name, locationCode, bothSchools, dayCount, startTime, endTime, opensDaysBefore,
//             closesDaysBefore, earlyDaysBefore, minAge, maxAge, prices, extras, description, waiverText }
//   (extras: [{ name, priceCents, per, notForAllDays, onlyWeekdays }])
// → { status:'ok', version } · 'duplicate_name' · 'invalid' (+ field:'offsets' when the three
//   "days before" numbers are out of range or in the wrong order)
export async function updateTemplate(templateId, expectedVersion, input = {}) {
  return callRpc('camp_update_template', { p_template_id: templateId, p_expected_version: expectedVersion, ...templateArgs(input) }, hasVersion);
}

// Delete template (admin). Never changes camps made from it.
export async function deleteTemplate(templateId, expectedVersion) {
  return callRpc('camp_delete_template', { p_template_id: templateId, p_expected_version: expectedVersion }, nothing);
}

// Edit details (staff and admins). Any change to days, member box or extras re-prices the WHOLE
// camper at the camp's current prices (the sign-up's early / regular is kept); names, age and
// family fields alone re-price nothing.
//   input = { firstName, lastName, age, member, dayIds:[uuid], extras:[{ extraId, dayIds }]
//             (dayIds [] for a once extra), parentName, parentPhone (10 digits), parentRelation,
//             emergencyName, emergencyPhone, emergencyRelation }
// → { status:'ok', camperVersion, signupVersion, totalCents, owesCents } · 'checked_in' + day
//   (a removed day was checked in) · 'withdrawn' · 'stale' · 'invalid'
export async function updateDetails(camperId, camperVersion, signupVersion, input = {}) {
  return callRpc('camp_update_details', {
    p_camper_id: camperId,
    p_camper_version: camperVersion,
    p_signup_version: signupVersion,
    p_first: input.firstName,
    p_last: input.lastName,
    p_age: input.age,
    p_member: input.member,
    p_day_ids: input.dayIds,
    p_extras: Array.isArray(input.extras) ? input.extras.map((e) => toSnake({ extraId: e.extraId, dayIds: e.dayIds ?? [] })) : input.extras,
    p_parent_name: input.parentName,
    p_parent_phone: input.parentPhone,
    p_parent_relation: input.parentRelation,
    p_emergency_name: input.emergencyName,
    p_emergency_phone: input.emergencyPhone,
    p_emergency_relation: input.emergencyRelation,
  }, (d) => isInt(d.camperVersion) && isInt(d.signupVersion) && isInt(d.totalCents) && isInt(d.owesCents));
}

// Change how they'll pay. → { status:'ok', version } · 'already_paid' · 'withdrawn'
export async function changePayingBy(camperId, expectedVersion, payingBy) {
  return callRpc('camp_change_paying_by', { p_camper_id: camperId, p_expected_version: expectedVersion, p_paying_by: payingBy }, hasVersion);
}

// Mark paid: one click records what the camper owes now, the way they said they'd pay, today.
// → { status:'ok', paymentId, amountCents, method, version } · 'already_paid' · 'stale' (double click)
export async function markPaid(camperId, expectedVersion) {
  return callRpc('camp_mark_paid', { p_camper_id: camperId, p_expected_version: expectedVersion },
    (d) => isText(d.paymentId) && isInt(d.amountCents) && isText(d.method) && hasVersion(d));
}

// Undo payment: admins any time (⋯ → Undo payment); staff only their own Mark paid, within 10
// seconds (the toast's Undo). → { status:'ok', version } · 'not_allowed' · 'stale' (already undone)
export async function undoPayment(paymentId) {
  return callRpc('camp_undo_payment', { p_payment_id: paymentId }, hasVersion);
}

// Edit payment (admin): the old payment is reversed and a new one recorded.
// → { status:'ok', paymentId (the new one), version }
export async function editPayment(paymentId, { method, amountCents, paidOn } = {}) {
  return callRpc('camp_edit_payment', { p_payment_id: paymentId, p_method: method, p_amount_cents: amountCents, p_paid_on: paidOn },
    (d) => isText(d.paymentId) && hasVersion(d));
}

// Possible duplicate: keepBoth true → "Not the same person — keep both"; false → the other one
// goes to Removed as "Duplicate copy". → { status:'ok', keepVersion, otherVersion } ·
// 'not_allowed' (staff keeping one after the last day)
export async function resolveDuplicate({ keepId, keepVersion, otherId, otherVersion, keepBoth } = {}) {
  return callRpc('camp_resolve_duplicate', {
    p_keep_id: keepId, p_keep_version: keepVersion, p_other_id: otherId, p_other_version: otherVersion, p_keep_both: keepBoth,
  }, (d) => isInt(d.keepVersion) && isInt(d.otherVersion));
}

// Withdraw (staff and admins; payments are kept). → { status:'ok', version }
export async function withdrawCamper(camperId, expectedVersion) {
  return callRpc('camp_withdraw_camper', { p_camper_id: camperId, p_expected_version: expectedVersion }, hasVersion);
}

// Restore: an ordinary withdrawal — staff and admins; a "Duplicate copy" — admins, or the staff
// member who made it within 10 seconds (the toast's Undo). → { status:'ok', version } · 'not_allowed'
export async function restoreCamper(camperId, expectedVersion) {
  return callRpc('camp_restore_camper', { p_camper_id: camperId, p_expected_version: expectedVersion }, hasVersion);
}

// Delete permanently (admin). expectedPaymentIds = the ids of ALL payment rows of this camper
// (payments and reversals) the warning was built from; 'stale' if they differ now.
export async function deleteCamper(camperId, expectedVersion, expectedPaymentIds) {
  return callRpc('camp_delete_camper', {
    p_camper_id: camperId, p_expected_version: expectedVersion, p_expected_payment_ids: expectedPaymentIds,
  }, nothing);
}

// Check in on one day. Today: staff and admins; an earlier day: admins ('not_allowed' for staff);
// a later day: 'future_day'. Checking in twice is fine: { already: true } with the stored time.
// → { status:'ok', checkedInAt, checkedInByName, already } · 'withdrawn' · 'not_found'
export async function checkIn(camperId, dayId) {
  return callRpc('camp_check_in', { p_camper_id: camperId, p_day_id: dayId },
    (d) => isText(d.checkedInAt) && typeof d.checkedInByName === 'string' && typeof d.already === 'boolean');
}

// Undo check-in (same day rule). Not checked in → ok (nothing to do).
export async function undoCheckIn(camperId, dayId) {
  return callRpc('camp_undo_check_in', { p_camper_id: camperId, p_day_id: dayId }, nothing);
}
