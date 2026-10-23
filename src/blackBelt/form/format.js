// format.js — turns what the server sends (dates, times, places, cents, plans) into what the
// Black Belt family page shows.
// Why it exists: the server answers in database style ('2027-03-27', '12:30', cents, snake_case
// names); the page writes "Sat, Mar 27", "12:30–2:30 PM", "$290". Kept apart from the screens
// so each rule is written once.
//
// The RULES (age on the first testing day, the email check, what is due when) come from
// src/lib/blackBelt/rules.js — the same file the staff screens and the preview database use,
// each with a twin in the SQL — and are only re-exported here, so the form never has its own copy.
//
// A note on dates: a school date like '2027-04-03' is read as midnight UTC and also FORMATTED in
// UTC, so the day never shifts whatever time zone the family's phone is set to. (new Date('…')
// on its own would show the day before for anyone west of London.)
import { formatDollars } from '../../lib/money.js';
import { ageOn, emailIsValid, firstDayOf, kukkiwonRange, planSummary, scheduleFor } from '../../lib/blackBelt/rules.js';
import { handedIn } from '../../lib/blackBelt/rubric.js';
import * as T from './text.js';

export { formatDollars, ageOn, emailIsValid, firstDayOf, kukkiwonRange, scheduleFor };

// ----- Dates -----

// 'YYYY-MM-DD' → a Date at midnight UTC (see the note above).
function utcDate(dateIso) {
  const [y, m, d] = String(dateIso).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
const fmt = (options) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...options });
const SHORT_DAY = fmt({ weekday: 'short', month: 'short', day: 'numeric' });
const MONTH_DAY = fmt({ month: 'short', day: 'numeric' });
const LONG_DAY = fmt({ weekday: 'long', month: 'long', day: 'numeric' });
const DOB = fmt({ month: 'short', day: 'numeric', year: 'numeric' });

// "Sat, Apr 3"
export const shortDay = (dateIso) => SHORT_DAY.format(utcDate(dateIso));
// "Mar 27"
export const monthDay = (dateIso) => MONTH_DAY.format(utcDate(dateIso));
// "Saturday, March 27"
export const longDay = (dateIso) => LONG_DAY.format(utcDate(dateIso));
// "Mar 4, 2012"
export const dobLabel = (dateIso) => DOB.format(utcDate(dateIso));

// A due date in a list: "Mar 27", or "Today" when it has already passed (a late family pays
// passed payments on the day they register — contract 0016-B1 §7 OP-12).
export const dueLabel = (dateIso, today) => (dateIso <= today ? T.TODAY : monthDay(dateIso));

// ----- Times -----

// '12:30' → { clock: '12:30', half: 'PM' } (null for anything else).
function clockParts(text) {
  const m = /^(\d{2}):(\d{2})/.exec(String(text ?? ''));
  if (!m) return null;
  const h24 = Number(m[1]);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return { clock: `${h12}:${m[2]}`, half: h24 < 12 ? 'AM' : 'PM' };
}

// '14:30' → "2:30 PM"
export function timeLabel(text) {
  const t = clockParts(text);
  return t ? `${t.clock} ${t.half}` : '';
}

// "12:30–2:30 PM" (AM/PM once when both match, as drawn) · "11:30 AM–12:30 PM".
export function timeRange(start, end) {
  const a = clockParts(start);
  const b = clockParts(end);
  if (!a || !b) return timeLabel(start);
  return a.half === b.half ? `${a.clock}–${b.clock} ${b.half}` : `${a.clock} ${a.half}–${b.clock} ${b.half}`;
}

// ----- Places -----
// The server sends a place as { name, address|null }: a school's name ("Worcester") with its
// address once it's entered in Settings → Schools, or the "other place" text as typed
// ("Horgan Arena, 403 Oxford St N, Auburn MA 01501") with no address.

export function isSchoolPlace(place) {
  if (!place) return false;
  return Boolean(place.address) || T.SCHOOL_PLACE_NAMES.includes(place.name);
}

// Short form for the cycle box and the requirements panel: "Worcester", "Horgan Arena".
export function placeShort(place) {
  const name = String(place?.name ?? '');
  if (isSchoolPlace(place)) return name;
  return name.split(',')[0].trim();
}

// Medium form for a sentence: "Worcester school", "Horgan Arena".
export function placeMedium(place) {
  return isSchoolPlace(place) ? T.schoolPlace(place.name) : placeShort(place);
}

// Full form for the Registered page: "Worcester school, 1141 Main St, Worcester" (the street
// and town, as drawn) or the other place's whole text.
export function placeFull(place) {
  if (!place) return '';
  if (!isSchoolPlace(place)) return String(place.name ?? '');
  const a = place.address;
  const parts = a && typeof a === 'object' ? [a.street, a.city].filter(Boolean) : [];
  return [T.schoolPlace(place.name), ...parts].join(', ');
}

// Does the day's second part happen somewhere else than the first part?
export function secondPlaceDiffers(day) {
  return Boolean(day?.second?.place) && placeShort(day.second.place) !== placeShort(day.place);
}

// ----- Words -----

// "Egg test" → "egg test" for the middle of a sentence; "TKD project" stays as it is (a word
// that starts with two capitals is an abbreviation).
export function lowerFirst(text) {
  const s = String(text ?? '');
  if (/^[A-Z]{2}/.test(s)) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

// What the candidate hands in, as one list: "egg test, meditation, appreciation letter, TKD project".
// Rubric v2 (migration 0024): worked out from the subjects tagged handed_in, in part order
// (rubric.js handedIn) — the same list the staff screens show under "Handed in by Submissions due".
export function handInList(danSheet) {
  return handedIn(danSheet).map((item) => lowerFirst(item.subject?.name)).filter(Boolean).join(', ');
}

// 2.5 → "2.5", 22.5 → "22.5", 10 → "10" (numbers from the rubric).
export const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? String(value) : String(value ?? ''));

// ----- Prices and plans -----

// The Kukkiwon fee for a Dan (cents), or null.
export function kukkiwonFee(fees, dan) {
  const cents = fees?.[String(dan)];
  return typeof cents === 'number' ? cents : null;
}

// The plan's total for a Dan, in cents (without Kukkiwon), or null before a Dan is chosen.
export const planTotal = (plan, dan) => planSummary(plan, { dan }).totalCents;

// The second line of a plan's card (Form 1, 2; OP-12b), from rules.planSummary:
//   one payment          "1 payment · by Mar 27"
//   before a Dan         "Mar 27, Apr 24, May 29"
//   equal amounts        "3 × $290 · Mar 27, Apr 24, May 29"
//   different amounts    "$400 + $470 · Mar 27, May 29"
// A due date that has already passed reads "Today" (OP-12).
export function planSecondLine(plan, dan, today) {
  const summary = planSummary(plan, { dan, today });
  const dates = summary.dueDates.map((d) => dueLabel(d, today));
  if (summary.paymentsCount === 1) {
    return summary.dueDates[0] <= today ? T.ONE_PAYMENT_TODAY : T.onePaymentBy(dates[0]);
  }
  const dateList = dates.join(', ');
  if (!summary.amounts) return dateList;
  const money = summary.equalAmounts
    ? T.timesAmount(summary.amounts.length, formatDollars(summary.amounts[0]))
    : summary.amounts.map(formatDollars).join(' + ');
  return `${money} · ${dateList}`;
}
