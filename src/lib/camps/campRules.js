// campRules.js — the rules of a CAMP, written once for everyone (contract 0013 §5.1).
// Why it exists: the staff Camps screens, the preview database (mockCamps.js) and the public
// family sign-up page (src/camp/) must all agree on things like "is sign-up open today?",
// "what does this child pay?", "does this camper owe money?" and "may I check this child in on
// that day?". The real database (migration 0013, §1.13) has the same rules in SQL; checks.mjs
// tests this file on the same table of price cases the SQL tests use (§1.20).
//
// It is PURE: no React, no database, no browser — so Node can import it, and the public page can
// use it without pulling in any dashboard code. It returns CODES, never words: the screens
// (text.js files) turn codes into words.
//
// Words used:
//   today      a date as text 'YYYY-MM-DD' in school time (America/New_York). Dates are compared
//              as text: '2027-04-19' < '2027-04-21' works because the format always has the same
//              width.
//   first day / last day   the earliest / latest of the camp's days
//   camp week  first day <= today <= last day (days in between that aren't camp days count too)
//   all days   a child who comes on every day of the camp
//   cents      money is whole cents everywhere (7500 = $75), never decimals
//
// Object shapes (camelCase, exactly these keys — what campsApi.js returns and what the family
// page builds after converting the public answer with toCamel below):
//   Camp     { id, locationCode, bothSchools, name, startTime 'HH:MM', endTime, signupOpensOn,
//              signupClosesOn, earlyUntil, closedByHand, minAge, maxAge, description, waiverText,
//              publicCode, version }
//   Day      { dayId, day 'YYYY-MM-DD' }                         (sorted by day)
//   PriceRow { dayCount, memberEarlyCents, memberRegularCents, nonmemberEarlyCents, nonmemberRegularCents }
//   Extra    { extraId, name, priceCents, per 'once'|'day', notForAllDays, sort }
//   Child    { firstName, lastName, age, member, dayIds:[uuid], extras:[{ extraId, dayIds:[uuid] }] }
//   RosterRow, Template — see contract 0013 §5.1.
import { addDays, isIsoDate, todayInSchoolTime, SCHOOL_TIME_ZONE } from '../testing/eventRules.js';

export { addDays, isIsoDate, todayInSchoolTime, SCHOOL_TIME_ZONE };

// ----- Constants (§5.1) -----

// Which waiver/confirmation wording the family ticked. Change it when that wording changes.
export const CAMP_ACK_VERSION = 'camp-2026-10-18';
// A blank camp accepts ages 3 to 17; any range must stay inside 1 to 99 (v0.703).
export const DEFAULT_AGES = { min: 3, max: 17 };
export const AGE_LIMITS = { min: 1, max: 99 };
export const MAX_DAYS = 10; // days in one camp
export const MAX_EXTRAS = 10; // extras in one camp
export const MAX_CHILDREN = 3; // children on one family sign-up
export const MAX_CAMPER_CENTS = 200000; // the most one camper can cost ($2,000)
export const SIGNATURE_KEEP_YEARS = 3; // drawn signatures are deleted 3 years after the camp
export const CAMP_TRIES_PER_HOUR = 30; // family-form tries per connection per hour (v0.700)
export const UNDO_WINDOW_MS = 10000; // staff may undo their own Mark paid / Keep this one this long
export const PAYING_BY = ['cash', 'check', 'card'];
export const DEFAULT_EARLY_DAYS_BEFORE = 7; // a new camp's early price ends 7 days before the first day
export const DEFAULT_CLOSES_DAYS_BEFORE = 1; // … and its sign-up closes the day before

// Extra constants other files share (not in the §5.1 list, but used the same way everywhere).
export const PUBLIC_ORIGIN = 'https://tkd-dashboard.pages.dev'; // the fixed production address
export const PUBLIC_CODE_PATTERN = /^[a-hjkmnp-z2-9]{8}$/; // what testing_new_public_code() makes
export const DESCRIPTION_MAX = 2000; // camp description, characters
export const WAIVER_MAX = 8000; // waiver text, characters
export const EXTRA_NAME_MAX = 60; // an extra's name
export const RELATION_MAX = 40; // "Relationship to the child"
export const OFFSET_LIMITS = { min: -365, max: 365 }; // template "days before the first day"
export const SIGNUP_STATES = ['finished', 'closed', 'not_open_yet', 'open'];
export const PAY_TAGS = ['duplicate', 'owes', 'paid', 'not_paid'];

// ----- snake_case <-> camelCase (§5.2: one mechanical rule, used by campsApi.js AND the family
// page, which can't import campsApi because that file talks to the database) -----

const toCamelKey = (key) => key.replace(/_([a-z0-9])/g, (_, ch) => ch.toUpperCase());
const toSnakeKey = (key) => key.replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`);

// Converts every key of a database answer, at every depth: { day_id: 1, price_cents: 2 } →
// { dayId: 1, priceCents: 2 }. Arrays are converted item by item; plain values are kept.
// ('member_early_cents' → 'memberEarlyCents', 'not_for_all_days' → 'notForAllDays'.)
export function toCamel(value) {
  if (Array.isArray(value)) return value.map(toCamel);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, v]) => [toCamelKey(key), toCamel(v)]));
}

// The same rule backwards, for what the app sends: { dayIds: [] } → { day_ids: [] }.
export function toSnake(value) {
  if (Array.isArray(value)) return value.map(toSnake);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, v]) => [toSnakeKey(key), toSnake(v)]));
}

// ----- Small date helpers -----

// The camp's days as plain dates, earliest first. Accepts Day objects or plain 'YYYY-MM-DD'.
function dayDates(days) {
  return (days ?? []).map((d) => (typeof d === 'string' ? d : d?.day)).filter(isIsoDate).sort();
}
export const firstDay = (days) => dayDates(days)[0] ?? null;
export const lastDay = (days) => {
  const list = dayDates(days);
  return list.length ? list[list.length - 1] : null;
};

// Whole calendar days from a to b ('2027-04-12' → '2027-04-19' = 7). Daylight saving doesn't matter.
export function daysBetween(a, b) {
  const ms = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((ms(b) - ms(a)) / 86400000);
}

// ----- States and tags (§1.13) -----

// Where a camp's sign-up stands on `today`, checked in this exact order:
//   'finished'      today is after the last day
//   'closed'        closed by hand, or today is after the closing date
//   'not_open_yet'  today is before the opening date
//   'open'          otherwise
export function signupState(camp, days, today) {
  const last = lastDay(days);
  if (last !== null && today > last) return 'finished';
  if (camp?.closedByHand === true || today > camp?.signupClosesOn) return 'closed';
  if (today < camp?.signupOpensOn) return 'not_open_yet';
  return 'open';
}

// The tag the staff lists show (first match wins):
//   today after the last day        → { kind:'done' }
//   today is one of the camp's days → { kind:'camp_today' }  (a day between camp days falls through)
//   sign-up open                    → { kind:'open', closesOn: <signupClosesOn> }  "Open until …"
//   not open yet                    → { kind:'not_open_yet' }
//   closed                          → { kind:'closed' }
// closesOn is null for every kind except 'open'.
export function campTag(camp, days, today) {
  const last = lastDay(days);
  if (last !== null && today > last) return { kind: 'done', closesOn: null };
  if (dayDates(days).includes(today)) return { kind: 'camp_today', closesOn: null };
  const state = signupState(camp, days, today);
  if (state === 'open') return { kind: 'open', closesOn: camp.signupClosesOn };
  if (state === 'not_open_yet') return { kind: 'not_open_yet', closesOn: null };
  return { kind: 'closed', closesOn: null };
}

// Camp week: first day <= today <= last day.
export function isCampWeek(days, today) {
  const first = firstDay(days);
  const last = lastDay(days);
  return first !== null && first <= today && today <= last;
}

// The camp page opens on Check in during camp week, else on Payments (v0.704).
export function defaultCampTab(days, today) {
  return isCampWeek(days, today) ? 'checkin' : 'payments';
}

// The day the Check in tab starts on: today if it's a camp day, else the next camp day, else the
// last one. Returns that Day object ({ dayId, day }), or null when the camp has no days.
export function defaultCheckInDay(days, today) {
  const sorted = [...(days ?? [])].filter((d) => isIsoDate(d?.day)).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  if (sorted.length === 0) return null;
  return sorted.find((d) => d.day === today) ?? sorted.find((d) => d.day > today) ?? sorted[sorted.length - 1];
}

// The camps a school list shows: 'worcester' / 'shrewsbury' → that school's camps plus every
// both-schools camp; 'both' → all camps. (The same rule as the two queries campsApi sends, §2.1 item 8.)
export function campsForLocation(camps, location) {
  if (location === 'both') return [...(camps ?? [])];
  return (camps ?? []).filter((c) => c.locationCode === location || c.bothSchools === true);
}

// How many ACTIVE campers each camp has: rows [{ campId, status }] → { [campId]: count }.
// A camp with no active camper isn't in the answer (read it with `?? 0`).
export function campCounts(rows) {
  const counts = {};
  for (const r of rows ?? []) {
    if (r?.status === 'active') counts[r.campId] = (counts[r.campId] ?? 0) + 1;
  }
  return counts;
}

// ----- Prices (§1.13, §1.20) -----

// Early or regular: early when the sign-up day is on or before the "early price until" day.
// (Both dates are school dates — a sign-up at 11:59:59 PM on Apr 12 is still early.)
export function priceKind(signedUpOn, earlyUntil) {
  return signedUpOn <= earlyUntil ? 'early' : 'regular';
}

// The grid cell for this many days, member box and kind. null when the grid has no such row.
export function baseCents(prices, dayCount, member, kind) {
  const row = (prices ?? []).find((p) => p.dayCount === dayCount);
  if (!row) return null;
  if (member) return kind === 'early' ? row.memberEarlyCents : row.memberRegularCents;
  return kind === 'early' ? row.nonmemberEarlyCents : row.nonmemberRegularCents;
}

// Does this list of day ids cover every day of the camp? (An empty camp never counts.)
export function isAllDays(dayIds, days) {
  const ids = new Set(dayIds ?? []);
  return (days ?? []).length > 0 && days.every((d) => ids.has(d.dayId));
}

const bySort = (a, b) => (a.sort ?? 0) - (b.sort ?? 0);

// What one child costs: { dayCount, baseCents, extras:[{ extraId, name, per, count, cents }], totalCents }.
// Only the child's days that are days of this camp count. A per-day extra counts the extra's days
// that are also the child's days; a once extra counts 1. Unknown extra ids are skipped. Extras come
// out in the camp's order (sort). This is plain arithmetic: whether the choice is ALLOWED (e.g. a
// not-for-all-days extra on an all-days child, §1.20 P8) is childProblem's job.
// baseCents is null when the grid has no row for that many days (totalCents then counts it as 0).
export function priceChild(child, prices, extras, days, kind) {
  const campDayIds = new Set((days ?? []).map((d) => d.dayId));
  const childDays = new Set((child?.dayIds ?? []).filter((id) => campDayIds.has(id)));
  const dayCount = childDays.size;
  const base = dayCount > 0 ? baseCents(prices, dayCount, child?.member === true, kind) : null;
  const chosen = [];
  for (const extra of [...(extras ?? [])].sort(bySort)) {
    const pick = (child?.extras ?? []).find((e) => e.extraId === extra.extraId);
    if (!pick) continue;
    const count = extra.per === 'once' ? 1 : new Set((pick.dayIds ?? []).filter((id) => childDays.has(id))).size;
    if (count === 0) continue;
    chosen.push({ extraId: extra.extraId, name: extra.name, per: extra.per, count, cents: count * extra.priceCents });
  }
  const totalCents = (base ?? 0) + chosen.reduce((sum, e) => sum + e.cents, 0);
  return { dayCount, baseCents: base, extras: chosen, totalCents };
}

// The family total: the sum of each child's totalCents.
export function familyTotal(priced) {
  return (priced ?? []).reduce((sum, p) => sum + (p?.totalCents ?? 0), 0);
}

// Is this child's choice of days and extras allowed at this camp? (The database's §1.10 rules —
// the family page and Edit details check them before sending.) null = fine, else a code:
//   'no_days'          no day of this camp chosen
//   'unknown_day'      a day id that isn't a day of this camp (the camp changed meanwhile)
//   'unknown_extra'    an extra id that isn't an extra of this camp (the camp changed meanwhile)
//   'once_with_days'   a once extra sent with days
//   'no_extra_days'    a per-day extra with no day chosen ("Choose which days.")
//   'extra_day_not_child_day'  a per-day extra on a day the child doesn't come
//   'not_for_all_days' a "not charged to all-days campers" extra for a child who comes every day
//   'too_expensive'    the child's total is over $2,000
export function childProblem(child, prices, extras, days, kind) {
  const campDayIds = new Set((days ?? []).map((d) => d.dayId));
  const dayIds = child?.dayIds ?? [];
  if (dayIds.length === 0) return 'no_days';
  if (dayIds.some((id) => !campDayIds.has(id))) return 'unknown_day';
  const childDays = new Set(dayIds);
  const allDays = isAllDays(dayIds, days);
  for (const pick of child?.extras ?? []) {
    const extra = (extras ?? []).find((e) => e.extraId === pick.extraId);
    if (!extra) return 'unknown_extra';
    const pickDays = pick.dayIds ?? [];
    if (extra.per === 'once' && pickDays.length > 0) return 'once_with_days';
    if (extra.per === 'day' && pickDays.length === 0) return 'no_extra_days';
    if (pickDays.some((id) => !childDays.has(id))) return 'extra_day_not_child_day';
    if (extra.notForAllDays && allDays) return 'not_for_all_days';
  }
  if (priceChild(child, prices, extras, days, kind).totalCents > MAX_CAMPER_CENTS) return 'too_expensive';
  return null;
}

// ----- Payments (§1.13 pay tag, v0.702) -----

// The status tag of a roster row, first match wins:
//   possible duplicate → 'duplicate' · paid something and still owes → 'owes' ·
//   owes nothing (or paid too much) → 'paid' · else → 'not_paid'
export function payTag(row) {
  if (row?.duplicateState === 'possible') return 'duplicate';
  const paid = row?.paidCents ?? 0;
  const owes = row?.owesCents ?? 0;
  if (paid > 0 && owes > 0) return 'owes';
  if (owes <= 0) return 'paid';
  return 'not_paid';
}

// The Payments line's amount: what ACTIVE campers still owe, counting only positive amounts (an
// overpaid camper never lowers it). Possible duplicates count — they are campers until resolved.
export function toCollectCents(rows) {
  return (rows ?? []).filter((r) => r.status === 'active').reduce((sum, r) => sum + Math.max(0, r.owesCents ?? 0), 0);
}

// ----- Check-in (§1.13 check-in day rule, v0.704) -----

// May this person check a camper in (or undo it) on `day`?
//   a future day → 'future' (nobody) · today → 'allowed' · an earlier day → admins 'allowed',
//   staff 'admin_only'.
export function checkInRule(day, today, isAdmin) {
  const date = typeof day === 'string' ? day : day?.day;
  if (date > today) return 'future';
  if (date === today) return 'allowed';
  return isAdmin ? 'allowed' : 'admin_only';
}

// The one small amber note a Check in row shows (at most one), in this order:
//   { kind:'duplicate' } · { kind:'not_paid' } · { kind:'owes', cents } ·
//   { kind:'extra', name } (the first per-day extra on that day, in the camp's order) · null
export function checkInNote(row, dayId) {
  const tag = payTag(row);
  if (tag === 'duplicate') return { kind: 'duplicate' };
  if (tag === 'not_paid') return { kind: 'not_paid' };
  if (tag === 'owes') return { kind: 'owes', cents: row.owesCents };
  const extra = (row?.extras ?? []).find((e) => e.per === 'day' && e.dayId === dayId);
  return extra ? { kind: 'extra', name: extra.name } : null;
}

// One cell of the Attendance grid:
//   'not_signed_up' (—) · 'came' (✓ time) · 'missed' (a past day, not checked in) ·
//   'upcoming' (today not checked in yet, or a later day — the dashed box)
export function attendanceCell(row, day, today) {
  const mine = (row?.days ?? []).find((d) => d.dayId === day?.dayId);
  if (!mine) return 'not_signed_up';
  if (mine.checkedInAt) return 'came';
  if (day.day < today) return 'missed';
  return 'upcoming';
}

// "Came X of Y": came = days checked in; soFar = the camper's days that have happened (days before
// today, plus today once checked in). Noah on Wed, here Mon, missed Tue, not in yet → { came:1, soFar:2 }.
export function cameCount(row, days, today) {
  let came = 0;
  let soFar = 0;
  for (const day of days ?? []) {
    const cell = attendanceCell(row, day, today);
    if (cell === 'came') {
      came += 1;
      soFar += 1;
    } else if (cell === 'missed') {
      soFar += 1;
    }
  }
  return { came, soFar };
}

// ----- Ages (v0.703) -----

const isWhole = (n) => typeof n === 'number' && Number.isInteger(n);
const isBlank = (v) => v === null || v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v));

// Checks the "Ages accepted from / to" boxes. null = fine, else 'blank' ("Enter an age"),
// 'range' (not a whole number from 1 to 99) or 'order' ("The first age must be lower than the
// second."). From may equal to (8–8 is fine).
export function validateAges(minAge, maxAge) {
  if (isBlank(minAge) || isBlank(maxAge)) return 'blank';
  if (!isWhole(minAge) || !isWhole(maxAge)) return 'range';
  if (minAge < AGE_LIMITS.min || maxAge > AGE_LIMITS.max || maxAge < AGE_LIMITS.min || minAge > AGE_LIMITS.max) return 'range';
  if (minAge > maxAge) return 'order';
  return null;
}

// May a child of this age sign up on the family form? (Staff Edit details accepts 1–99.)
export function ageAllowed(age, camp) {
  return isWhole(age) && age >= camp?.minAge && age <= camp?.maxAge;
}

// ----- Phones -----

// What a family typed → exactly 10 digits, or null. Everything that isn't a digit is ignored, and
// a leading 1 (country code) is dropped: '(508) 555-0142' and '+1 508 555 0142' → '5085550142'.
export function phoneDigits(text) {
  if (typeof text !== 'string') return null;
  let digits = text.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  return /^\d{10}$/.test(digits) ? digits : null;
}

// '5085550142' → '(508) 555-0142'. Anything else is returned as it is.
export function formatPhone(digits) {
  if (typeof digits !== 'string' || !/^\d{10}$/.test(digits)) return digits ?? '';
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

// ----- Templates (§1.6) -----

// A camp's dates as "days before the first day" (negative = after it), for Save as template.
export function templateFromCamp(camp, days) {
  const first = firstDay(days);
  if (first === null) return { opensDaysBefore: null, closesDaysBefore: null, earlyDaysBefore: null };
  return {
    opensDaysBefore: daysBetween(camp.signupOpensOn, first),
    closesDaysBefore: daysBetween(camp.signupClosesOn, first),
    earlyDaysBefore: daysBetween(camp.earlyUntil, first),
  };
}

// The other way: a template's offsets + the new camp's first day → its three dates.
export function campDatesFromTemplate(template, firstDayIso) {
  if (!isIsoDate(firstDayIso)) return { signupOpensOn: null, signupClosesOn: null, earlyUntil: null };
  return {
    signupOpensOn: addDays(firstDayIso, -template.opensDaysBefore),
    signupClosesOn: addDays(firstDayIso, -template.closesDaysBefore),
    earlyUntil: addDays(firstDayIso, -template.earlyDaysBefore),
  };
}

// Are a template's offsets acceptable? Each a whole number from −365 to 365, opens >= closes and
// early >= closes (the database answers { status:'invalid', field:'offsets' } otherwise).
export function offsetsAreValid({ opensDaysBefore, closesDaysBefore, earlyDaysBefore } = {}) {
  const ok = (n) => isWhole(n) && n >= OFFSET_LIMITS.min && n <= OFFSET_LIMITS.max;
  return ok(opensDaysBefore) && ok(closesDaysBefore) && ok(earlyDaysBefore)
    && opensDaysBefore >= closesDaysBefore && earlyDaysBefore >= closesDaysBefore;
}

// The price grid for a number of days: rows 1…dayCount, keeping the prices of rows that already
// exist (by dayCount) and adding empty rows (every price null → "Enter a price") for new ones.
// Picking fewer days drops the extra rows.
export function gridRowsFor(dayCount, rows) {
  const out = [];
  for (let n = 1; n <= dayCount; n += 1) {
    const existing = (rows ?? []).find((r) => r.dayCount === n);
    out.push(existing ? { ...existing } : {
      dayCount: n, memberEarlyCents: null, memberRegularCents: null, nonmemberEarlyCents: null, nonmemberRegularCents: null,
    });
  }
  return out;
}

// ----- The public link (§5.3; qr.js re-exports it) -----

// The family sign-up address for a camp's public code — always the production address, so a QR
// code made in preview still points at the real form. '' for a code that isn't a valid code.
export function campLink(code) {
  return typeof code === 'string' && PUBLIC_CODE_PATTERN.test(code) ? `${PUBLIC_ORIGIN}/camp/${code}` : '';
}

// ----- Text rules shared with the preview database (the SQL helpers' twins) -----

// Invisible characters a description / waiver may not contain (tab and line break are fine) —
// the same list as testing_note_is_valid.
const TEXT_BAD_CHARACTER = /[\u0001-\u0008\u000b-\u001f\u007f-\u009f​-‏‪-‮⁠-⁤⁦-⁩﻿]/;

// A description or waiver as the database stores it: Windows line breaks become plain ones,
// spaces / tabs / line breaks at the very ends are removed, and nothing left → null.
export function normalizeCampText(text) {
  if (text === null || text === undefined) return null;
  const tidy = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/^[ \t\n]+|[ \t\n]+$/g, '');
  return tidy === '' ? null : tidy;
}

// camp_text_is_valid(text, max): after tidying, 1…max characters and nothing invisible.
// (null or blank → false; the description column allows "no description" separately.)
export function campTextIsValid(text, max) {
  if (typeof text !== 'string') return false;
  const tidy = normalizeCampText(text);
  return tidy !== null && [...tidy].length <= max && !TEXT_BAD_CHARACTER.test(tidy);
}
