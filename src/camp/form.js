// form.js — the family form's values and rules, without any drawing (pure functions).
// Why it exists: CampApp.jsx (the screens' "brain") needs to know what a fresh child looks like,
// what's wrong with step 1, how a child's choices are tidied when days change or the camp is
// updated, what each child costs, and exactly what to send. Keeping that here keeps the screens
// short. The money and day rules themselves come from campRules.js (contract 0013 §5.1), the
// same file the staff screens and the preview database use, so the page shows exactly the price
// the database will charge.
//
// A child in the form:  { key, first, last, age (text as typed), member (true/false/null),
//                         dayIds: [uuid], extras: [{ extraId, dayIds: [uuid] }] }
// The camp (camelCase, from the GET answer): { name, days:[{dayId, day}], prices:[PriceRow],
//                         extras:[Extra], minAge, maxAge, … }
import { ageAllowed, extraDaysFor, familyTotal, isAllDays, phoneDigits, priceChild, CAMP_ACK_VERSION } from '../lib/camps/campRules.js';
// (Weekly pricing, rulebook v0.717: priceChild prices each Monday–Sunday week on its own and adds
// the weeks up; a "not charged to all-days campers" per-day extra is included — so not offered —
// on the days of any week the child comes every camp day.)
import { nameLength, nameProblem, normalizeName } from '../lib/testing/names.js';
import { spansWeeks, weekdayList, weekdayNames } from './format.js';
import * as T from './text.js';

export const RELATION_MAX = 40; // the database's limit for "Relationship to the child"
export const SIGNATURE_PREFIX = 'data:image/png;base64,';
export const SIGNATURE_MAX_LENGTH = 70000; // the database refuses bigger pictures

let nextKey = 1; // React needs a steady key per child card (children can be removed)

// A fresh child. A one-day camp starts with its one day picked (nothing to choose).
export function emptyChild(camp) {
  const days = camp?.days ?? [];
  return { key: nextKey++, first: '', last: '', age: '', member: null, dayIds: days.length === 1 ? [days[0].dayId] : [], extras: [] };
}

export const emptyPerson = () => ({ name: '', phone: '', relation: '' });

// The age as typed → a whole number, or null ("9" → 9, "9.5" / "" / "nine" → null).
export function ageNumber(text) {
  const t = String(text ?? '').trim();
  return /^\d{1,3}$/.test(t) ? Number(t) : null;
}

// The form child → campRules' Child shape (§5.1).
export function rulesChild(child) {
  return {
    firstName: normalizeName(child.first),
    lastName: normalizeName(child.last),
    age: ageNumber(child.age),
    member: child.member,
    dayIds: child.dayIds,
    extras: child.extras,
  };
}

// Is this extra limited to some camp days? (only_on, CP1 decision 2026-10-19: e.g. pizza on
// Wed and Fri only. An empty list means every day.)
export const isLimited = (extra) => Array.isArray(extra.onlyOn) && extra.onlyOn.length > 0;

// The day ids (camp order) on which this extra is offered to a child coming on `dayIds`: the
// child's days, or for a limited extra only the child's days that are in its only_on; for a
// not-for-all-days extra, not the days of a week the child comes every day (included there).
export function offeredDayIds(extra, camp, dayIds) {
  const days = (camp.days ?? []).filter((d) => dayIds.includes(d.dayId));
  const ids = extraDaysFor(extra, days, camp.days ?? []);
  return (Array.isArray(ids) ? ids : []).map((d) => (typeof d === 'string' ? d : d.dayId));
}

// The camp days (Day objects, camp order) a limited extra is on — for the labels on the day
// buttons and the "Pizza party: Wed, Fri" lines.
export const limitedDays = (extra, camp) => (camp.days ?? []).filter((d) => extra.onlyOn.includes(d.day));

// Extras this child may choose: all of the camp's, except
//   - a once "not charged to all-days campers" extra for a child who comes every day (C7a)
//   - a per-day not-for-all-days extra once the child has days and every one of them is in a
//     week the child comes every day (included, weekly pricing R6)
//   - a limited extra when the child comes on none of its days
export function extrasFor(child, camp) {
  const allDays = isAllDays(child.dayIds, camp.days);
  return (camp.extras ?? []).filter((extra) => {
    if (extra.notForAllDays && extra.per === 'once' && allDays) return false;
    const none = offeredDayIds(extra, camp, child.dayIds).length === 0;
    if (extra.per === 'day' && extra.notForAllDays && child.dayIds.length > 0 && none) return false;
    if (isLimited(extra) && none) return false;
    return true;
  });
}

// Tidies a child after its days changed or the camp was updated:
//   - days that aren't (any more) days of this camp are dropped; days are kept in camp order
//   - extras the camp no longer has are dropped, and so is a not-for-all-days extra where it is
//     now included (the days of a week the child comes every day; a once one: every camp day)
//   - a per-day extra keeps only days the child still comes (and, for a limited extra, days in its
//     only_on); a once extra never has days
export function tidyChild(child, camp) {
  const campDays = (camp.days ?? []).map((d) => d.dayId);
  const dayIds = campDays.filter((id) => child.dayIds.includes(id));
  const allowed = extrasFor({ ...child, dayIds }, camp);
  const extras = [];
  for (const extra of allowed) {
    const pick = child.extras.find((e) => e.extraId === extra.extraId);
    if (!pick) continue;
    // A per-day extra keeps only days it is still offered on for this child.
    const offered = offeredDayIds(extra, camp, dayIds);
    extras.push({ extraId: extra.extraId, dayIds: extra.per === 'day' ? offered.filter((id) => pick.dayIds.includes(id)) : [] });
  }
  return { ...child, dayIds, extras };
}

// The words for one priced extra (from priceFor) on a child's price lines:
//   limited per-day extra → "Pizza party — Wed" · other per-day extra → "Late pick-up × 2" ·
//   once extra → its name.
export function extraPriceLabel(priced, camp, child) {
  const extra = (camp.extras ?? []).find((e) => e.extraId === priced.extraId);
  // On a camp longer than one week a dates list gets long ("Wed, Oct 28 · Fri, Oct 30 · …"), so
  // it falls through to the count ("Pizza party × 4"), like any other per-day extra.
  if (priced.per === 'day' && extra && isLimited(extra) && !spansWeeks(camp.days)) {
    const pick = child.extras.find((e) => e.extraId === priced.extraId);
    const days = (camp.days ?? []).filter((d) => pick?.dayIds.includes(d.dayId)).map((d) => d.day);
    return T.extraOnDays(priced.name, weekdayList(days));
  }
  return priced.per === 'day' ? T.extraTimes(priced.name, priced.count) : priced.name;
}

// The "Pizza party: Wed, Fri[, included in any week they come every day]" line of every limited extra.
// A camp longer than one week names only the weekdays ("Wed, Fri"), not every date (2026-10-21):
// the day buttons already carry the extra's name on each exact day.
export function onlyOnLines(camp) {
  const manyWeeks = spansWeeks(camp?.days);
  return (camp?.extras ?? [])
    .filter(isLimited)
    .map((extra) => {
      const dates = limitedDays(extra, camp).map((d) => d.day);
      return { extraId: extra.extraId, text: T.onlyOnLine(extra.name, manyWeeks ? weekdayNames(dates) : weekdayList(dates), extra.notForAllDays) };
    });
}

// What one child costs at today's price kind (campRules.priceChild).
export function priceFor(child, camp, kind) {
  return priceChild(rulesChild(child), camp.prices, camp.extras, camp.days, kind);
}

// The family total (what the page shows and sends as expected_total_cents).
export function familyTotalFor(children, camp, kind) {
  return familyTotal(children.map((child) => priceFor(child, camp, kind)));
}

// ----- Step 1 errors -----

function childNameError(value, emptyText) {
  const problem = nameProblem(value);
  if (problem === 'empty') return emptyText;
  if (problem === 'tooLong') return T.ERR_NAME_TOO_LONG;
  if (problem === 'badCharacter') return T.ERR_NAME_BAD_CHARACTER;
  return null;
}

function relationError(value) {
  const problem = nameProblem(value); // same blank / bad-character rules as names
  if (problem === 'empty') return T.ERR_RELATION;
  if (problem === 'badCharacter') return T.ERR_RELATION_BAD_CHARACTER;
  if (nameLength(value) > RELATION_MAX) return T.ERR_RELATION_TOO_LONG;
  return null;
}

// Every problem on step 1, as { fieldKey: words }. Field keys (in screen order):
//   c0.first, c0.last, c0.age, c0.member, c0.days, c0.extra.<extraId>, c1.… ,
//   parent.name, parent.phone, parent.relation, emergency.…, paying
// An empty object = everything is fine.
export function detailsErrors(form, camp) {
  const errors = {};
  const add = (key, text) => {
    if (text) errors[key] = text;
  };
  form.children.forEach((child, i) => {
    const c = `c${i}`;
    add(`${c}.first`, childNameError(child.first, T.ERR_FIRST));
    add(`${c}.last`, childNameError(child.last, T.ERR_LAST));
    const age = ageNumber(child.age);
    if (age === null) add(`${c}.age`, T.ERR_AGE);
    else if (!ageAllowed(age, camp)) add(`${c}.age`, T.agesFor(camp.minAge, camp.maxAge));
    if (child.member === null) add(`${c}.member`, T.ERR_MEMBER);
    if (child.dayIds.length === 0) add(`${c}.days`, T.ERR_DAYS);
    for (const pick of child.extras) {
      const extra = (camp.extras ?? []).find((e) => e.extraId === pick.extraId);
      if (extra?.per === 'day' && pick.dayIds.length === 0) add(`${c}.extra.${pick.extraId}`, T.ERR_EXTRA_DAYS);
    }
  });
  for (const who of ['parent', 'emergency']) {
    const person = form[who];
    add(`${who}.name`, childNameError(person.name, T.ERR_NAME));
    add(`${who}.phone`, phoneDigits(person.phone) ? null : T.ERR_PHONE);
    add(`${who}.relation`, relationError(person.relation));
  }
  add('paying', form.payingBy ? null : T.ERR_PAYING);
  return errors;
}

// The element id for a field key, so the page can move focus to the first problem:
// "c0.extra.<uuid>" → "camp-c0-extra-<uuid>".
export const fieldId = (key) => `camp-${key.replace(/\./g, '-')}`;

// Is a signature picture acceptable to the database? (PNG data URL, ≤ 70 000 characters.)
export function signatureIsValid(text) {
  if (typeof text !== 'string' || !text.startsWith(SIGNATURE_PREFIX)) return false;
  if (text.length > SIGNATURE_MAX_LENGTH) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(text.slice(SIGNATURE_PREFIX.length));
}

// ----- What is sent (POST /api/camp/<code>, contract 0013 §4.3 / §1.16) -----
// Names are sent as the database will store them; phones as 10 digits; uuids as they came.
export function buildBody({ form, camp, kind, waiverVersion, signature, submissionId, honeypot, startedAt, token }) {
  const children = form.children.map((child) => ({
    first_name: normalizeName(child.first),
    last_name: normalizeName(child.last),
    age: ageNumber(child.age),
    member: child.member,
    day_ids: child.dayIds,
    extras: child.extras.map((e) => ({ extra_id: e.extraId, day_ids: e.dayIds })),
  }));
  const person = (p) => ({ name: normalizeName(p.name), phone: phoneDigits(p.phone), relation: normalizeName(p.relation) });
  return {
    submission_id: submissionId,
    children,
    parent: person(form.parent),
    emergency: person(form.emergency),
    paying_by: form.payingBy,
    acknowledged: true,
    signature,
    ack_version: CAMP_ACK_VERSION,
    waiver_version: waiverVersion,
    expected_total_cents: familyTotalFor(form.children, camp, kind),
    website: honeypot,
    started_at: startedAt,
    sent_at: Date.now(),
    turnstile_token: token,
  };
}
