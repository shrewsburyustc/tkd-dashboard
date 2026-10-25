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
// The camp_roster view (one row per camper; no phones, no signature).
export const ROSTER_COLUMNS = 'id, camp_id, signup_id, position, first_name, last_name, age, member, paying_by, status, withdrawn_reason, withdrawn_at, withdrawn_by_name, duplicate_state, duplicate_of, version, created_at, signup_version, reference, price_kind, signed_up_on, signed, signature_deleted_at, base_cents, days, extras, total_cents, paid_cents, owes_cents, paid_on, paid_method, last_payment_id, last_payment_recorded_at';

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
