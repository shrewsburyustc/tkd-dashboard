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
//   Extra    { extraId, name, priceCents, per 'once'|'day', notForAllDays, onlyOn:[date], sort }
//            (onlyOn: the camp days a per-day extra is offered on; [] = every day)
//   Child    { firstName, lastName, age, member, dayIds:[uuid], extras:[{ extraId, dayIds:[uuid] }] }
//   RosterRow, Template — see contract 0013 §5.1. A Template's extras carry onlyWeekdays:[1–7]
//            (ISO weekdays) instead of onlyOn.
import { addDays, isIsoDate, todayInSchoolTime, SCHOOL_TIME_ZONE } from '../testing/eventRules.js';

export { addDays, isIsoDate, todayInSchoolTime, SCHOOL_TIME_ZONE };

// The Year list of a date calendar (the shared DatePicker, rulebook v0.727): every year from the
// earliest to the latest of today's year, the next year (when nextYear is true) and the years of
// the given dates. Non-dates ('' while nothing is chosen yet) are skipped.
//   yearsAround('2027-04-21', ['2026-12-30', ''])       → [2026, 2027, 2028]
//   yearsAround('2027-04-21', ['2025-03-01'], false)    → [2025, 2026, 2027]   (Date paid: no future)
export function yearsAround(today, dates = [], nextYear = true) {
  const found = [today, ...dates].filter(isIsoDate).map((iso) => Number(iso.slice(0, 4)));
  if (found.length === 0) return [];
  const first = Math.min(...found);
  const last = Math.max(...found, nextYear && isIsoDate(today) ? Number(today.slice(0, 4)) + 1 : -Infinity);
  const years = [];
  for (let year = first; year <= last; year += 1) years.push(year);
  return years;
}

// ----- Constants (§5.1) -----

// Which waiver/confirmation wording the family ticked. Change it when that wording changes.
export const CAMP_ACK_VERSION = 'camp-2026-10-18';
// A blank camp accepts ages 3 to 17; any range must stay inside 1 to 99 (v0.703).
export const DEFAULT_AGES = { min: 3, max: 17 };
export const AGE_LIMITS = { min: 1, max: 99 };
export const MAX_DAYS = 60; // days in one camp (was 10 before weekly pricing, rulebook v0.717)
export const MAX_WEEK_DAYS = 7; // rows in a price grid at most (days in one Monday–Sunday week)
export const MAX_EXTRAS = 10; // extras in one camp
export const MAX_CHILDREN = 3; // children on one family sign-up
export const MAX_CAMPER_CENTS = 1000000; // the most one camper can cost ($10,000; was $2,000)
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

// The day the Check in tab starts on: today if it's a camp day; otherwise the next camp day (so
// before the camp, the first day); after the camp, the last day. Returns that Day object ({ dayId, day }), or null when the camp has no days.
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
// Used for "once" extras marked not-for-all-days (rule R6: whole camp). Per-day extras use
// comesAllWeek below instead.
export function isAllDays(dayIds, days) {
  const ids = new Set(dayIds ?? []);
  return (days ?? []).length > 0 && days.every((d) => ids.has(d.dayId));
}

// The Monday of the calendar week (Monday–Sunday) a date is in: '2027-04-21' (Wed) → '2027-04-19'.
export function mondayOf(dateIso) {
  return addDays(dateIso, -(isoWeekday(dateIso) - 1));
}

// Does the child come on EVERY camp day of the week that `dateIso` falls in? (Weekly pricing R6:
// a "not charged to all-days campers" per-day extra, e.g. pizza, is included in such a week.)
// dayIds = the child's day ids; days = the camp's Day[]. false when that week has no camp day.
export function comesAllWeek(dayIds, days, dateIso) {
  if (!isIsoDate(dateIso)) return false;
  const monday = mondayOf(dateIso);
  const weekDays = (days ?? []).filter((d) => isIsoDate(d?.day) && mondayOf(d.day) === monday);
  const ids = new Set(dayIds ?? []);
  return weekDays.length > 0 && weekDays.every((d) => ids.has(d.dayId));
}

const bySort = (a, b) => (a.sort ?? 0) - (b.sort ?? 0);

// ----- Extras offered only on some days (owner decision 2026-10-19: "pizza on Wed and Fri") -----
// A per-day extra may carry onlyOn: the camp dates it is offered on ([] = every camp day). Templates
// keep the same thing as weekdays (onlyWeekdays, ISO numbers 1 = Mon … 7 = Sun), because a template
// has no dates.

// Is this per-day extra offered on this date? (Always true when onlyOn is empty.)
export function extraOfferedOn(extra, dateIso) {
  const only = extra?.onlyOn ?? [];
  return only.length === 0 || only.includes(dateIso);
}

// The days a child could take this extra on: the child's days that the extra is offered on.
// childDays = the child's Day objects ({ dayId, day }). Returns Day objects, earliest first.
// campDays (optional) = the camp's Day[]: when given and the extra is "not charged to all-days
// campers", the days of weeks the child comes every day are left out too (weekly pricing R6: the
// extra is already included that week, so it can't be bought there).
export function extraDaysFor(extra, childDays, campDays = null) {
  const ids = (childDays ?? []).map((d) => d.dayId);
  return [...(childDays ?? [])]
    .filter((d) => extraOfferedOn(extra, d.day))
    .filter((d) => !(campDays && extra?.notForAllDays && extra?.per === 'day' && comesAllWeek(ids, campDays, d.day)))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

// ISO weekday of a date: 1 = Monday … 7 = Sunday ('2027-04-21' → 3).
export function isoWeekday(dateIso) {
  const [y, m, d] = dateIso.split('-').map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return js === 0 ? 7 : js;
}

// ----- Weeks (the roster's week switcher, CP5 2026-10-21, multi-week option A) -----

// The camp's days split into calendar weeks (Monday–Sunday), earliest first:
// [{ monday: 'YYYY-MM-DD', days: Day[] }]. A one-week camp gives one week (no switcher shown).
export function campWeeks(days) {
  const weeks = [];
  const sorted = [...(days ?? [])].filter((d) => isIsoDate(d?.day)).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  for (const d of sorted) {
    const monday = mondayOf(d.day);
    const last = weeks[weeks.length - 1];
    if (last && last.monday === monday) last.days.push(d);
    else weeks.push({ monday, days: [d] });
  }
  return weeks;
}

// The price grid's size W (weekly pricing R2): the most camp days in any one Monday–Sunday week,
// 0 when there are no days. Accepts Day objects or plain 'YYYY-MM-DD' dates (duplicates count once).
// Mon–Fri × 2 weeks → 5; Thanksgiving Wed + Fri → 2.
export function gridSizeFor(days) {
  const dates = [...new Set(dayDates(days))];
  return campWeeks(dates.map((day) => ({ day }))).reduce((most, w) => Math.max(most, w.days.length), 0);
}

// Which week the roster opens on: the week containing today, else the first week with a day on or
// after today, else the last week. Returns an index into campWeeks(days) (0 when there are none).
export function defaultWeekIndex(weeks, today) {
  if (!weeks?.length) return 0;
  const containing = weeks.findIndex((w) => w.monday <= today && today <= addDays(w.monday, 6));
  if (containing !== -1) return containing;
  const next = weeks.findIndex((w) => w.days.some((d) => d.day >= today));
  return next !== -1 ? next : weeks.length - 1;
}

// Camp dates → weekdays, for Save as template: ['2027-04-21', '2027-04-23'] → [3, 5].
export function onlyOnToWeekdays(onlyOn) {
  return [...new Set((onlyOn ?? []).filter(isIsoDate).map(isoWeekday))].sort((a, b) => a - b);
}

// Weekdays → the camp dates that fall on them, for "Start from a template": [3, 5] + the camp's
// days → the Wednesdays and Fridays among them. campDays = Day objects or plain dates. [] stays [].
export function weekdaysToOnlyOn(weekdays, campDays) {
  const wanted = new Set(weekdays ?? []);
  if (wanted.size === 0) return [];
  return dayDates(campDays).filter((day) => wanted.has(isoWeekday(day)));
}

// What one child costs:
//   { dayCount, baseCents, weeks:[{ monday, dayCount, cents }], extras:[{ extraId, name, per, count, cents }], totalCents }.
// Weekly pricing (R3): the child's days are split into Monday–Sunday weeks; each week the child
// comes is priced by the grid row for how many days they come THAT week, and the weeks add up
// (5 + 5 days = 2 × row 5; 2 + 2 = 2 × row 2). weeks lists only the weeks the child comes, earliest
// first; a week's cents is null when the grid has no row for that many days.
// Only the child's days that are days of this camp count. A per-day extra counts the chosen days
// that are also the child's days AND days the extra is offered on (onlyOn); a once extra counts 1.
// Extras are only charged when chosen. Unknown extra ids are skipped. Extras come out in the
// camp's order (sort). This is plain arithmetic: whether the choice is ALLOWED (e.g. a
// not-for-all-days extra in a week the child comes every day, R6) is childProblem's job.
// baseCents is null when some week has no grid row (totalCents then counts the base as 0).
export function priceChild(child, prices, extras, days, kind) {
  const dateOf = new Map((days ?? []).map((d) => [d.dayId, d.day]));
  const childDays = new Set((child?.dayIds ?? []).filter((id) => dateOf.has(id)));
  const dayCount = childDays.size;
  const member = child?.member === true;
  const weeks = campWeeks((days ?? []).filter((d) => childDays.has(d.dayId)))
    .map((w) => ({ monday: w.monday, dayCount: w.days.length, cents: baseCents(prices, w.days.length, member, kind) }));
  const base = dayCount > 0 && weeks.every((w) => w.cents !== null && w.cents !== undefined)
    ? weeks.reduce((sum, w) => sum + w.cents, 0)
    : null;
  const chosen = [];
  for (const extra of [...(extras ?? [])].sort(bySort)) {
    const pick = (child?.extras ?? []).find((e) => e.extraId === extra.extraId);
    if (!pick) continue;
    const count = extra.per === 'once'
      ? 1
      : new Set((pick.dayIds ?? []).filter((id) => childDays.has(id) && extraOfferedOn(extra, dateOf.get(id)))).size;
    if (count === 0) continue;
    chosen.push({ extraId: extra.extraId, name: extra.name, per: extra.per, count, cents: count * extra.priceCents });
  }
  const totalCents = (base ?? 0) + chosen.reduce((sum, e) => sum + e.cents, 0);
  return { dayCount, baseCents: base, weeks, extras: chosen, totalCents };
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
//   'extra_day_not_offered'    a per-day extra on a day it isn't offered on (onlyOn)
//   'not_for_all_days' a "not charged to all-days campers" extra the child can't buy (weekly pricing
//                      R6): a per-day one on a day of a week the child comes every camp day; a once
//                      one when the child comes every day of the whole camp
//   'too_expensive'    the child's total is over $10,000
export function childProblem(child, prices, extras, days, kind) {
  const dateOf = new Map((days ?? []).map((d) => [d.dayId, d.day]));
  const dayIds = child?.dayIds ?? [];
  if (dayIds.length === 0) return 'no_days';
  if (dayIds.some((id) => !dateOf.has(id))) return 'unknown_day';
  const childDays = new Set(dayIds);
  const allDays = isAllDays(dayIds, days);
  for (const pick of child?.extras ?? []) {
    const extra = (extras ?? []).find((e) => e.extraId === pick.extraId);
    if (!extra) return 'unknown_extra';
    const pickDays = pick.dayIds ?? [];
    if (extra.per === 'once' && pickDays.length > 0) return 'once_with_days';
    if (extra.per === 'day' && pickDays.length === 0) return 'no_extra_days';
    if (pickDays.some((id) => !childDays.has(id))) return 'extra_day_not_child_day';
    if (pickDays.some((id) => !extraOfferedOn(extra, dateOf.get(id)))) return 'extra_day_not_offered';
    if (extra.notForAllDays && extra.per === 'once' && allDays) return 'not_for_all_days';
    if (extra.notForAllDays && extra.per === 'day'
      && pickDays.some((id) => comesAllWeek(dayIds, days, dateOf.get(id)))) return 'not_for_all_days';
  }
  if (priceChild(child, prices, extras, days, kind).totalCents > MAX_CAMPER_CENTS) return 'too_expensive';
  return null;
}

// ----- Extras on one camp day (the Check in tab) -----

const rowDayIds = (row) => (row?.days ?? []).map((d) => d.dayId);
const comesOn = (row, dayId) => rowDayIds(row).includes(dayId);
const choseOn = (row, extra, dayId) => (row?.extras ?? []).some((e) => e.extraId === extra.extraId && e.dayId === dayId);
const dateOfDay = (days, dayId) => (days ?? []).find((d) => d.dayId === dayId)?.day ?? null;

// "Pizza party today: N" — how many ACTIVE campers get this per-day extra on that day: the ones
// coming that day who chose it that day, plus (for a "not charged to all-days campers" extra)
// every active camper who comes every camp day of THAT DAY'S WEEK (weekly pricing R6). 0 when the
// extra isn't offered that day.
// rows = RosterRow[], days = the camp's Day[] (needed to know who comes every day of the week).
export function extraCountOnDay(rows, extra, dayId, days) {
  return (rows ?? []).filter((r) => r.status === 'active' && getsExtraOnDay(r, extra, dayId, days)).length;
}

// Does this child get this per-day extra on that day? The same test extraCountOnDay counts with:
// the extra is offered that day, the child comes that day, and either chose it for that day or (a
// "not charged to all-days campers" extra) comes every camp day of that day's week (R6: included).
export function getsExtraOnDay(row, extra, dayId, days) {
  const date = dateOfDay(days, dayId);
  if (extra?.per !== 'day' || !extraOfferedOn(extra, date) || !comesOn(row, dayId)) return false;
  return choseOn(row, extra, dayId) || Boolean(extra.notForAllDays && comesAllWeek(rowDayIds(row), days, date));
}

// ----- Extras offered EVERY day on the roster (Early drop-off, Late pick-up; picture 19, option A) -----
// Jeffrey 2026-11-04: "We have Early Drop Off and Late Pick-Up always and we need to see on the
// roster." Each signed-up day box shows the first word of each every-day extra the child gets that
// day ("Early", "Late"); the legend explains the words; the line under the count cards counts them.

// An extra's name before any comma: "Early drop-off, 7:30–9:00 AM" → "Early drop-off".
export function extraShortName(name) {
  return String(name ?? '').split(',')[0].trim();
}

// The word in the day box: the short name's first word, first letter uppercase ("Early").
// (Known and accepted: two every-day extras with the same first word — "Late pick-up" and "Late
// lunch" — would both show "Late"; the legend and the screen-reader label still name them in full.)
export function extraDayWord(name) {
  const word = extraShortName(name).split(/\s+/)[0] ?? '';
  return word.charAt(0).toUpperCase() + word.slice(1);
}

// The camp's per-day extras offered on every camp day (onlyOn empty), in the camp's order (sort).
// An extra set up with every camp day ticked under "Only on these days" counts as a some-days extra
// here, as it does everywhere else in Camps (the "No pizza"-style note, the receipt, Camper detail),
// so the roster and those places never disagree (design review of picture 19, low 2: accepted).
export function everyDayExtras(extras) {
  return (extras ?? []).filter((e) => e?.per === 'day' && (e.onlyOn ?? []).length === 0).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
}

// The every-day extras one child gets on one camp day, in the camp's order (Extra[]). A day the
// child isn't signed up for gets none; an extra offered only on some days is never in this list.
export function dayExtrasFor(row, dayId, extras, days) {
  return everyDayExtras(extras).filter((e) => getsExtraOnDay(row, e, dayId, days));
}

// The parts of the gray line under the count cards, for the Coming card's day (campCardCounts):
//   { day, isToday, counts: [{ name, count }] } — every every-day extra (0 included), then, on a
//   camp day only, each extra offered only on some days that is offered that day ("Pizza party").
//   null after the camp (mode 'after') or when the camp has nothing to count.
// rows = the ACTIVE roster rows (removed ones are skipped anyway); names are the short names.
export function dayExtraCounts(rows, extras, days, mode, day) {
  if (!day || mode === 'after') return null;
  const someDays = mode === 'today'
    ? (extras ?? []).filter((e) => e?.per === 'day' && (e.onlyOn ?? []).length > 0 && extraOfferedOn(e, day.day)).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
    : [];
  const counted = [...everyDayExtras(extras), ...someDays];
  if (counted.length === 0) return null;
  return {
    day: day.day,
    isToday: mode === 'today',
    counts: counted.map((e) => ({ name: extraShortName(e.name), count: extraCountOnDay(rows, e, day.dayId, days) })),
  };
}

// The dates an extra is no longer offered on after an edit, among the camp days that remain:
// before / after = the extra's onlyOn before and after ([] = every day); campDays = the camp's days
// AFTER the edit (Day objects or dates). Edit camp is refused when an active camper chose one of
// these days ({ status:'not_empty', kind:'extra_day', extraName, day, count }).
export function extraDaysRemoved(before, after, campDays) {
  const dates = dayDates(campDays);
  const offered = (only) => (only?.length ? dates.filter((d) => only.includes(d)) : dates);
  const now = new Set(offered(after));
  return offered(before).filter((d) => !now.has(d));
}

// The Check in "No pizza party" note: true when the child comes that day, doesn't come every camp
// day of that day's week (weekly pricing R6 — such a week includes it), the extra is offered that
// day, and the child didn't choose it for that day.
export function missingExtraOnDay(row, extra, dayId, days) {
  const date = dateOfDay(days, dayId);
  if (extra?.per !== 'day' || !extraOfferedOn(extra, date)) return false;
  if (!comesOn(row, dayId) || comesAllWeek(rowDayIds(row), days, date)) return false;
  return !choseOn(row, extra, dayId);
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

// The To collect card's amount: what ACTIVE campers still owe, counting only positive amounts (an
// overpaid camper never lowers it). A row marked "Possible duplicate" is left out until the pair
// is reviewed (rulebook v0.742 / v1.046): its tag replaces "$X due" on the roster, so its money
// would not add up with what the roster shows. (It still counts as a camper and as coming.)
export function toCollectCents(rows) {
  return (rows ?? []).filter((r) => r.status === 'active' && countsToCollect(r)).reduce((sum, r) => sum + Math.max(0, r.owesCents ?? 0), 0);
}

// Is this row part of To collect? Only a camper who still owes and isn't marked Possible
// duplicate (v0.742). The card's count, its amount and its filter all use this one test, so the
// list a pressed To collect card shows is exactly what the card counts.
export function countsToCollect(row) {
  return row?.duplicateState !== 'possible' && stillOwes(row);
}

// ----- The camp page's count cards (design review C10, rulebook v0.737) -----
// The four cards above Find a camper: Campers · Coming [day] (or Came, after the camp) · To collect ·
// Payments recorded. The screen (CampRoster.jsx) draws them with the shared CountCards; the numbers
// are worked out here so checks.mjs can test them without React.

// Which day the "Coming" card is about:
//   { mode: 'today', day }  today is a camp day          → "Coming today", "N here"
//   { mode: 'next', day }   before the camp, or between two camp days → the next camp day
//                           ("Coming Mon, Apr 19")
//   { mode: 'after', day: null }  every camp day has passed (or the camp has no days) → the card
//                           becomes "Came"
// days = the camp's Day[] (any order), today = 'YYYY-MM-DD'.
export function comingCardDay(days, today) {
  const sorted = [...(days ?? [])].filter((d) => isIsoDate(d?.day)).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  const todays = sorted.find((d) => d.day === today);
  if (todays) return { mode: 'today', day: todays };
  const next = sorted.find((d) => d.day > today);
  if (next) return { mode: 'next', day: next };
  return { mode: 'after', day: null };
}

// Does this camper still owe money? (To collect counts and keeps these; an overpaid camper owes
// nothing.)
export function stillOwes(row) {
  return (row?.owesCents ?? 0) > 0;
}

// Does this camper come on that camp day?
export function comesOnDay(row, dayId) {
  return (row?.days ?? []).some((d) => d.dayId === dayId);
}

// Every number on the cards, from the camp's whole roster (active AND removed rows):
//   campers        active campers
//   coming         active campers signed up on the card's day (0 after the camp)
//   here           of those, checked in on that day (only shown when the day is today)
//   came / cameOf  after the camp: days attended / days signed up, over the active campers
//   toCollect      active campers who still owe money (owesCents above 0): "Owes", "$X due" — NOT a
//                  row marked Possible duplicate (v0.742: it stays out until the pair is reviewed)
//   toCollectCents what those campers still owe (toCollectCents above)
//   duplicatesNotCounted  how many possible duplicates To collect left out: only the ones that
//                  still owe (a paid one would not have been counted anyway, so the card's
//                  "N possible duplicates not counted" never names a row that changes nothing)
//   recordedCents  every payment recorded for this camp, reversals taken off — the sum of every
//                  roster row's paidCents, REMOVED campers included: money taken is money taken,
//                  and Finance's Daily report counts a removed camper's payment too (v1.038)
//   removedPaidCents  the part of recordedCents that removed campers paid (Payments recorded says
//                  "includes $X from removed campers" while it is above $0; v0.742, R5-04)
export function campCardCounts(roster, days, today) {
  const rows = roster ?? [];
  const active = rows.filter((r) => r.status === 'active');
  const { mode, day } = comingCardDay(days, today);
  const comingRows = day ? active.filter((r) => comesOnDay(r, day.dayId)) : [];
  const here = day ? comingRows.filter((r) => r.days.find((d) => d.dayId === day.dayId)?.checkedInAt).length : 0;
  return {
    mode,
    day,
    campers: active.length,
    coming: comingRows.length,
    here,
    came: active.reduce((n, r) => n + (r.days ?? []).filter((d) => d.checkedInAt).length, 0),
    cameOf: active.reduce((n, r) => n + (r.days ?? []).length, 0),
    toCollect: active.filter(countsToCollect).length,
    toCollectCents: toCollectCents(active),
    duplicatesNotCounted: active.filter((r) => r.duplicateState === 'possible' && stillOwes(r)).length,
    recordedCents: rows.reduce((n, r) => n + paidOf(r), 0),
    removedPaidCents: rows.filter((r) => r.status !== 'active').reduce((n, r) => n + paidOf(r), 0),
  };
}

// A row's recorded money in cents (0 when the roster has none for it).
const paidOf = (row) => (Number.isInteger(row?.paidCents) ? row.paidCents : 0);

// Does a roster row stay on screen under a card's filter? filter = null | 'coming' | 'collect';
// day = the Coming card's day (comingCardDay). 'coming' with no day (after the camp) keeps everyone.
// 'collect' lists exactly the rows the To collect card counts (countsToCollect).
export function matchesCardFilter(row, filter, day) {
  if (filter === 'coming') return !day || comesOnDay(row, day.dayId);
  if (filter === 'collect') return countsToCollect(row);
  return true;
}

// Which school's drawer a camp payment goes to (owner decision 2026-10-19, changes v0.707 part 1):
// THIS DEVICE's home school (account menu "This device: Worcester / Shrewsbury", device.js) — not
// the top switcher — for every camp, so Mark paid never asks. Accepts the device's name
// ('Worcester') or a code ('worcester'); anything else → null (the screen then sends nothing usable
// and the database refuses with field 'school').
export const SCHOOLS = ['worcester', 'shrewsbury'];
export function paymentSchoolFor(deviceLocation) {
  const code = typeof deviceLocation === 'string' ? deviceLocation.toLowerCase() : null;
  return SCHOOLS.includes(code) ? code : null;
}

// Where the family chose the way the Mark paid box's hint names (migration 0033, rulebook v0.735
// option B): 'form' while Paying by is still the form's choice (paying_by_on_form), 'desk' once
// staff changed it (Change how they'll pay, or Mark paid with another way). A row without
// paying_by_on_form (a database from before 0033) says 'form', as before.
export function payingByChoiceWhere(row) {
  if (row?.payingByOnForm === null || row?.payingByOnForm === undefined) return 'form';
  return row.payingBy === row.payingByOnForm ? 'form' : 'desk';
}

// ----- Record refund (migration 0039, CONTRACT-0039; rulebook v0.743, v1.039, v1.040) -----
// Money handed back to a family that paid more than the total is saved as its own REFUND row: a
// minus amount (−$23), never an edit of the payment. Undo refund adds a reversal row with the
// opposite amount (+$23). Paid (paidCents) is the sum of every row, so both count by themselves.

// How much a camper paid over the total, in cents (0 when they don't): "Paid $23 more than the
// total" = owes −$23 → 2300. row = a roster row or Camper detail's camper (owesCents).
export function overpaidCents(row) {
  const owes = Number.isInteger(row?.owesCents) ? row.owesCents : 0;
  return owes < 0 ? -owes : 0;
}

// Does a refund stand right now? The roster's refunded_cents (0039) = the camper's refunds not
// undone, as a plus number. A database from before 0039 sends none: then no refund stands.
export function refundStands(row) {
  return Number.isInteger(row?.refundedCents) && row.refundedCents > 0;
}

// Which refund items the camper's ⋯ (and Camper detail's More) shows, admins only, in this order
// (v0.743 (1), (4) and v0.744 — Jeffrey chose A on picture 22y): 'record' while the camper paid
// more than the total, and 'undo' while a refund stands. Usually only one of them shows (a full
// refund leaves nothing overpaid); after a PARTIAL refund both show, so the rest can be handed back
// in one step and the hint "⋯ → Record refund" stays true. [] = no refund item.
export function refundMenuItems(row) {
  const items = [];
  if (overpaidCents(row) > 0) items.push('record');
  if (refundStands(row)) items.push('undo');
  return items;
}

// The roster's Paid tag for a camper who owes nothing (rulebook v0.745 — copied from Star's Payment
// column, v0.152 / v0.166, CandidateRows.jsx): while they paid more than the total, or while a
// refund stands, the tag names what they paid ("Paid $315" / "Paid $292"), and while it is too much
// an amber "⚠ $23 overpaid" follows. Otherwise the plain "Paid".
// → { paidCents: what to name, or null for the plain "Paid"; overpaidCents: 0 = no amber part }
export function paidTagParts(row) {
  const over = overpaidCents(row);
  const named = over > 0 || refundStands(row);
  return { paidCents: named ? (Number.isInteger(row?.paidCents) ? row.paidCents : 0) : null, overpaidCents: over };
}

// ----- The roster's layout from the room beside the panel (rulebook v1.053, v1.130; L-02) -----
// The roster's table needs room for its columns: the page's side margins (50 px), the Camper and Paid
// columns (273 px, with the widest ordinary tag, "Possible duplicate"), one column per day of the
// shown week (72 px each: a day column can't get narrower), and — with a mouse — the ⋯ column
// (40 px). While someone is overpaid, the amber "Paid $315 ⚠ $23 overpaid" widens the Paid column by
// another 42 px (27 px measured, 14 more for a four-digit amount). Measured on the built table by the
// design review (a 5-day camp: 683 px of room with touch, 723 with a mouse; 7 days about 867 with a
// mouse). When the page area beside the left panel is narrower than that, the roster draws its cards
// instead (the phone layout), whatever the window's width. The shared hook `usePageRoomBelow(px)`
// (src/lib/pageRoom.js) answers; this says the px for the shown week.
export const ROSTER_ROOM = { margins: 50, fixed: 273, perDay: 72, more: 40, overpaid: 42 };
export function rosterRoomNeeded(dayCount, withMore, anyOverpaid = false) {
  const days = Number.isInteger(dayCount) && dayCount > 0 ? dayCount : 1;
  return ROSTER_ROOM.margins + ROSTER_ROOM.fixed + ROSTER_ROOM.perDay * days
    + (withMore ? ROSTER_ROOM.more : 0) + (anyOverpaid ? ROSTER_ROOM.overpaid : 0);
}

// The refund Undo refund reverses: the NEWEST refund row that stands (no reversal points at it),
// from Camper detail's payments (camelCase: id, kind, reversesPaymentId, recordedAt). null = none.
export function newestStandingRefund(payments) {
  const list = Array.isArray(payments) ? payments : [];
  const reversed = new Set(list.filter((p) => p.kind === 'reversal' && p.reversesPaymentId).map((p) => p.reversesPaymentId));
  const standing = list.filter((p) => p.kind === 'refund' && !reversed.has(p.id));
  // Newest by when it was recorded (the list may come in any order).
  standing.sort((a, b) => ((a.recordedAt ?? '') < (b.recordedAt ?? '') ? -1 : (a.recordedAt ?? '') > (b.recordedAt ?? '') ? 1 : 0));
  return standing[standing.length - 1] ?? null;
}

// Is this payment row the Undo of a REFUND? A reversal is always exactly minus the row it undoes
// (the database's camp_payments_guard), and a refund is a minus amount, so its reversal is a PLUS
// amount; a payment's reversal is a minus one. (The History says "Refund undone" for it.)
export function reversesRefund(p) {
  return p?.kind === 'reversal' && Number.isInteger(p.amountCents) && p.amountCents > 0;
}

// The payments that stand — kind 'payment' that no reversal undid (Undo payment and Edit payment
// both leave the old payment + its reversal behind) — from Camper detail's payments, in the order
// given. Record refund's note counts them: "The 2 payments ($315) stay in the history."
export function standingPayments(payments) {
  const list = Array.isArray(payments) ? payments : [];
  const reversed = new Set(list.filter((p) => p.kind === 'reversal' && p.reversesPaymentId).map((p) => p.reversesPaymentId));
  return list.filter((p) => p.kind === 'payment' && !reversed.has(p.id));
}

// Reads the Record refund box's Amount in WHOLE dollars, like Camps' Edit payment and Star's refund
// box (camp prices and payments are always whole dollars, so what is overpaid is too): "23",
// "$1,023", "23.00". → { cents } · { problem: 'empty' } (nothing typed) · { problem: 'notWhole' }
// (cents, e.g. "23.50") · { problem: 'notNumber' } (not an amount, e.g. "abc", "-5") ·
// { problem: 'tooBig' } (so many digits it can't be an amount — always more than what was
// overpaid). The most that may go back is what was overpaid: the box checks that.
export function parseRefundAmount(text) {
  let s = String(text ?? '').trim();
  if (s.startsWith('$')) s = s.slice(1).trim(); // one leading $ is fine
  s = s.replace(/,/g, ''); // "1,023" → "1023"
  if (s === '') return { problem: 'empty' };
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s); // dollars, then at most 2 decimals
  if (!m) return { problem: 'notNumber' };
  if (m[2] !== undefined && Number(m[2]) !== 0) return { problem: 'notWhole' }; // "23.50" — "23.00" is fine
  const cents = Number(m[1]) * 100;
  if (!Number.isSafeInteger(cents)) return { problem: 'tooBig' };
  return { cents };
}

// ----- Check-in (§1.13 check-in day rule, v0.704) -----

// May this person check a camper in (or undo it) on `day`? Owner decision 2026-10-19 (CP1):
// check-in works on ANY camp day — earlier, today or later — for staff and admins alike, for a
// camper signed up that day. So the answer is always 'allowed'. (The arguments are kept so the
// screens don't change if a rule comes back.)
export function checkInRule(day, today, isAdmin) {
  return 'allowed';
}

// The one small amber note a Check in row shows (at most one), in this order:
//   { kind:'duplicate' } · { kind:'not_paid' } · { kind:'owes', cents } ·
//   { kind:'no_extra', name }  an extra offered only on some days (onlyOn) is offered that day and
//                              this child (not an all-days camper) didn't choose it — "No pizza party" ·
//   { kind:'extra', name }     the first other per-day extra the child has that day (drop-off,
//                              pick-up), in the camp's order · null
// extras / days = the camp's Extra[] and Day[]. When they're left out there is no 'no_extra' note
// and every per-day extra the child has that day counts for 'extra'.
export function checkInNote(row, dayId, extras = null, days = null) {
  const tag = payTag(row);
  if (tag === 'duplicate') return { kind: 'duplicate' };
  if (tag === 'not_paid') return { kind: 'not_paid' };
  if (tag === 'owes') return { kind: 'owes', cents: row.owesCents };
  const campExtras = [...(extras ?? [])].sort(bySort);
  for (const extra of campExtras) {
    if ((extra.onlyOn ?? []).length > 0 && missingExtraOnDay(row, extra, dayId, days)) return { kind: 'no_extra', name: extra.name };
  }
  const limited = new Set(campExtras.filter((e) => (e.onlyOn ?? []).length > 0).map((e) => e.extraId));
  const extra = (row?.extras ?? []).find((e) => e.per === 'day' && e.dayId === dayId && !limited.has(e.extraId));
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

// The price grid for a number of rows: rows 1…dayCount (weekly pricing: dayCount = W, see
// gridSizeFor), keeping the prices of rows that already
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

// The family sign-up address for a camp's public code — the production address, so a link or QR
// code always points at the real form. Exception: in preview mode (fake database) its camps don't
// exist on the real site, so the link uses the preview's own address (e.g. http://localhost:5176)
// and opens the preview's family form instead (Jeffrey, 2026-10-21: the preview link opened the
// live site's "This link isn't working"). '' for a code that isn't a valid code.
function linkOrigin() {
  const previewMode = typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'preview';
  return previewMode && typeof window !== 'undefined' ? window.location.origin : PUBLIC_ORIGIN;
}
export function campLink(code) {
  return typeof code === 'string' && PUBLIC_CODE_PATTERN.test(code) ? `${linkOrigin()}/camp/${code}` : '';
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
