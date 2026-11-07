// campsArgs.js — the column lists, the row converters and the argument builders of campsApi.js.
// Why it exists: these pure pieces decide exactly which keys go to and come from the database
// (contract 0013 §5.2 — e.g. an extra's only_on / onlyOn, a template extra's only_weekdays /
// onlyWeekdays). Kept in their own file, without the Supabase client, so checks.mjs can run them in
// Node against the preview database and prove a value survives the round trip
// (Add camp → Load camp, Edit template → Load templates).
import { toCamel, toSnake } from './campRules.js';

// The columns we read (the database refuses select('*') on purpose: some columns — phones, the
// signature, who-as-an-id — are never given to the app). Only columns contract 0013 §1.15 grants.
export const CAMP_COLUMNS = 'id, location_code, both_schools, name, start_time, end_time, signup_opens_on, signup_closes_on, early_until, closed_by_hand, min_age, max_age, description, waiver_text, public_code, version';
export const DAY_COLUMNS = 'id, camp_id, day';
export const PRICE_COLUMNS = 'camp_id, day_count, member_early_cents, member_regular_cents, nonmember_early_cents, nonmember_regular_cents';
export const EXTRA_COLUMNS = 'id, camp_id, name, price_cents, per, not_for_all_days, only_on, sort';
export const TEMPLATE_COLUMNS = 'id, name, location_code, both_schools, day_count, start_time, end_time, opens_days_before, closes_days_before, early_days_before, min_age, max_age, description, waiver_text, prices, extras, version';
// The camp_roster view (one row per camper; no phones, no signature). paying_by_on_form (migration
// 0033): the way the family chose on the form — the Mark paid box's hint says "on the form" while
// Paying by still matches it, "at the desk" once staff changed it (rulebook v0.735).
// refunded_cents (migration 0039, CONTRACT-0039): the camper's refunds that stand, as a plus number
// (0 = none) — the ⋯ shows Undo refund and grays Edit payment / Undo payment while it is above 0
// (rulebook v0.743 (4)). The view only has it once 0039 is pasted, which comes before this app.
export const ROSTER_COLUMNS = 'id, camp_id, signup_id, position, first_name, last_name, age, member, paying_by, status, withdrawn_reason, withdrawn_at, withdrawn_by_name, duplicate_state, duplicate_of, version, created_at, signup_version, reference, price_kind, signed_up_on, signed, signature_deleted_at, base_cents, days, extras, total_cents, paid_cents, owes_cents, paid_on, paid_method, last_payment_id, last_payment_recorded_at, paying_by_on_form, refunded_cents';

// ----- Converting database rows to the §5.1 shapes -----

// '09:00:00' → '09:00'. Anything else is kept.
const hhmm = (t) => (typeof t === 'string' && /^\d{2}:\d{2}(:\d{2})?$/.test(t) ? t.slice(0, 5) : t);

export function toCamp(row) {
  const c = toCamel(row);
  return { ...c, startTime: hhmm(c.startTime), endTime: hhmm(c.endTime) };
}
// A camp_days row → { dayId, day } (the row's id becomes dayId; camp_id is dropped).
export const toDay = ({ id, day }) => ({ dayId: id, day });
export const byDay = (a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0);
export function toPriceRow(row) {
  const { campId, ...rest } = toCamel(row);
  return rest;
}
export function toExtra(row) {
  const { id, campId, ...rest } = toCamel(row);
  return { extraId: id, ...rest, onlyOn: Array.isArray(rest.onlyOn) ? [...rest.onlyOn].sort() : [] };
}
export function toTemplate(row) {
  const t = toCamel(row);
  return {
    ...t,
    startTime: hhmm(t.startTime),
    endTime: hhmm(t.endTime),
    prices: Array.isArray(t.prices) ? [...t.prices].sort((a, b) => a.dayCount - b.dayCount) : [],
    // A template's extras have no ids and no sort key: their position in the list is the order.
    // onlyWeekdays: the ISO weekdays (1 = Mon … 7 = Sun) a per-day extra is offered on; [] = every day.
    extras: Array.isArray(t.extras) ? t.extras.map((e, i) => ({ ...e, onlyWeekdays: Array.isArray(e.onlyWeekdays) ? e.onlyWeekdays : [], sort: i })) : [],
  };
}
// A roster row with its nested days / extras lists converted too (by toCamel).
export const toRosterRow = (row) => toCamel(row);

// The price grid as the database wants it: exactly the five keys per row.
export const pricesArg = (prices) => (Array.isArray(prices)
  ? prices.map((p) => toSnake({
    dayCount: p.dayCount, memberEarlyCents: p.memberEarlyCents, memberRegularCents: p.memberRegularCents,
    nonmemberEarlyCents: p.nonmemberEarlyCents, nonmemberRegularCents: p.nonmemberRegularCents,
  }))
  : prices);
// The extras: exactly these keys, in the order they should appear (the position is the sort).
// A camp's extra carries only_on (the camp dates a per-day extra is offered on, [] = every day); a
// template's carries only_weekdays (ISO 1 = Mon … 7 = Sun) instead (forTemplate).
// withIds: camp_update_camp also takes "id" (the extraId of an existing extra, or null for a new one).
export const extrasArg = (extras, withIds, forTemplate = false) => (Array.isArray(extras)
  ? extras.map((e) => ({
    ...(withIds ? { id: e.extraId ?? null } : {}),
    ...toSnake({ name: e.name, priceCents: e.priceCents, per: e.per, notForAllDays: e.notForAllDays === true }),
    ...(forTemplate ? { only_weekdays: e.onlyWeekdays ?? [] } : { only_on: e.onlyOn ?? [] }),
  }))
  : extras);

// The shared part of Add camp / Edit camp.
//   input = { locationCode, bothSchools, name, days: ['YYYY-MM-DD', …], startTime 'HH:MM', endTime,
//             signupOpensOn, signupClosesOn, earlyUntil, minAge, maxAge, prices: PriceRow[],
//             extras: [{ extraId?, name, priceCents, per, notForAllDays, onlyOn }], description, waiverText }
export function campArgs(input = {}, withIds) {
  return {
    p_location_code: input.locationCode,
    p_both_schools: input.bothSchools,
    p_name: input.name,
    p_days: input.days,
    p_start_time: input.startTime,
    p_end_time: input.endTime,
    p_signup_opens_on: input.signupOpensOn,
    p_signup_closes_on: input.signupClosesOn,
    p_early_until: input.earlyUntil,
    p_min_age: input.minAge,
    p_max_age: input.maxAge,
    p_prices: pricesArg(input.prices),
    p_extras: extrasArg(input.extras, withIds),
    p_description: input.description ?? null,
    p_waiver_text: input.waiverText,
  };
}

// Edit template's arguments (everything but the id and version).
//   input = { name, locationCode, bothSchools, dayCount (days per week = the grid's rows, 1–7; weekly
//             pricing v0.717), startTime, endTime, opensDaysBefore,
//             closesDaysBefore, earlyDaysBefore, minAge, maxAge, prices, extras:[{ name, priceCents,
//             per, notForAllDays, onlyWeekdays }], description, waiverText }
export function templateArgs(input = {}) {
  return {
    p_name: input.name,
    p_location_code: input.locationCode,
    p_both_schools: input.bothSchools,
    p_day_count: input.dayCount,
    p_start_time: input.startTime,
    p_end_time: input.endTime,
    p_opens_days_before: input.opensDaysBefore,
    p_closes_days_before: input.closesDaysBefore,
    p_early_days_before: input.earlyDaysBefore,
    p_min_age: input.minAge,
    p_max_age: input.maxAge,
    p_prices: pricesArg(input.prices),
    p_extras: extrasArg(input.extras, false, true),
    p_description: input.description ?? null,
    p_waiver_text: input.waiverText,
  };
}

// ----- Record refund (migration 0039, CONTRACT-0039, rulebook v0.743) -----

// camp_record_refund's arguments: exactly the six the database function takes (the preview database
// refuses any other name, as PostgREST does). input = { camperId, expectedVersion, method ('cash' |
// 'check'), amountCents (a plus number: the money handed back), refundedOn 'YYYY-MM-DD', school
// (This device's school, v1.040) }.
export function recordRefundArgs({ camperId, expectedVersion, method, amountCents, refundedOn, school } = {}) {
  return {
    p_camper_id: camperId,
    p_expected_version: expectedVersion,
    p_method: method,
    p_amount_cents: amountCents,
    p_refunded_on: refundedOn,
    p_school: school,
  };
}

// ----- Fill in (migration 0043, CONTRACT-0043, rulebook v0.740 / v0.741) -----

// camp_staff_signup's arguments from the family page's own POST body (src/camp/form.js buildBody):
// the camp by id; the honeypot, timing and Turnstile fields are not sent (the staff path has none).
export function staffSignupArgs(campId, body = {}) {
  const parent = body.parent ?? {};
  const emergency = body.emergency ?? {};
  return {
    p_camp_id: campId,
    p_submission_id: body.submission_id,
    p_children: body.children,
    p_parent_name: parent.name,
    p_parent_phone: parent.phone,
    p_parent_relation: parent.relation,
    p_emergency_name: emergency.name,
    p_emergency_phone: emergency.phone,
    p_emergency_relation: emergency.relation,
    p_paying_by: body.paying_by,
    p_acknowledged: body.acknowledged,
    p_signature: body.signature,
    p_ack_version: body.ack_version,
    p_waiver_version: body.waiver_version,
    p_expected_total_cents: body.expected_total_cents,
  };
}

// Is a camelCase camp_staff_form ok answer usable? (0043: the family page's GET answer, flat, plus
// fillIn / signupState / closesOn / closedByHand.)
export const staffFormShapeOk = (d) => Boolean(d?.camp && Array.isArray(d.camp.days)
  && ['open', 'admin_only', 'finished'].includes(d.fillIn) && typeof d.waiverVersion === 'string');

// Is a camelCase camp_staff_signup ok answer usable? (the family form's ok answer)
export const staffSignupShapeOk = (d) => typeof d?.reference === 'string' && d.reference !== ''
  && Number.isInteger(d.familyTotalCents) && Array.isArray(d.children);

// Where a camper's sign-up came from, from a camelCase camp_camper_detail ok answer (0043 adds
// source and entered_by at the answer's top level): { source: 'form' | 'desk', enteredBy }. A
// database from before 0043 sends neither → 'form' (every sign-up was the family form's then).
export function signupSourceOf(detail) {
  const source = detail?.source === 'desk' ? 'desk' : 'form';
  const name = detail?.enteredBy;
  return { source, enteredBy: source === 'desk' && typeof name === 'string' && name.trim() !== '' ? name : null };
}
