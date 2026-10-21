// format.js — camp-specific ways of writing dates, times and lists on the family page.
// Why it exists: a camp has SEVERAL days (not one testing date) and opening hours, so the page
// needs "Wednesday, November 25 & Friday, November 27, 2026", "Wed & Fri" and "9:00 AM – 3:00 PM".
// The single-date, money and address helpers are reused from the Color Belt page
// (src/register/format.js) so both forms write them the same way.
import { formatDollars, longDate, shortDate, locationLine, addressLine } from '../register/format.js';

export { formatDollars, longDate, shortDate, locationLine, addressLine };

// 'YYYY-MM-DD' → a Date at midnight UTC (formatted in UTC, so the day never shifts whatever time
// zone the family's phone is set to).
function utcDate(dateIso) {
  const [y, m, d] = String(dateIso).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
const WEEKDAY = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' });
const MONTH_DAY = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
const YEAR = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', year: 'numeric' });
const DAY_MS = 24 * 60 * 60 * 1000;

// The days of a list as sorted 'YYYY-MM-DD' texts (accepts Day objects or plain dates).
export function sortedDates(days) {
  return (days ?? []).map((d) => (typeof d === 'string' ? d : d?.day)).filter(Boolean).sort();
}

// Are these (sorted) dates one unbroken run of days, e.g. Mon–Fri?
function isRun(dates) {
  for (let i = 1; i < dates.length; i += 1) {
    if (utcDate(dates[i]) - utcDate(dates[i - 1]) !== DAY_MS) return false;
  }
  return true;
}

// "A & B", "A, B & C" — the way the mockups join two or more things.
export function joinAnd(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} & ${items.at(-1)}`;
}

// The camp's days for the top card (C7a / C7d):
//   one day                → "Wednesday, November 25, 2026"
//   two days               → "Wednesday, November 25 & Friday, November 27, 2026"
//   three or more in a row → "Monday, April 19 – Friday, April 23, 2027"
//   three or more, gaps    → "Monday, December 28 · Tuesday, December 29 & Thursday, December 31, 2026"
//                            (not in the mockups — long dates already contain commas)
export function campDaysLong(days) {
  const dates = sortedDates(days);
  if (dates.length === 0) return '';
  const year = YEAR.format(utcDate(dates.at(-1)));
  if (dates.length === 1) return `${longDate(dates[0])}, ${year}`;
  if (dates.length === 2) return `${longDate(dates[0])} & ${longDate(dates[1])}, ${year}`;
  if (isRun(dates)) return `${longDate(dates[0])} – ${longDate(dates.at(-1))}, ${year}`;
  const long = dates.map(longDate);
  return `${long.slice(0, -1).join(' · ')} & ${long.at(-1)}, ${year}`;
}

// The camp's days in short form (step 2 "Camp" row, C7c): "Wed, Nov 25 & Fri, Nov 27";
// three or more in a row: "Mon, Apr 19 – Fri, Apr 23".
export function campDaysShort(days) {
  const dates = sortedDates(days);
  if (dates.length >= 3 && isRun(dates)) return `${shortDate(dates[0])} – ${shortDate(dates.at(-1))}`;
  const short = dates.map(shortDate);
  return short.length >= 3 ? `${short.slice(0, -1).join(' · ')} & ${short.at(-1)}` : short.join(' & ');
}

// One child's days in step 2: "Wed & Fri" (weekday names), or short dates when a weekday
// repeats (a camp longer than a week), e.g. "Mon, Apr 19 & Mon, Apr 26".
export function childDaysLabel(dates) {
  const sorted = sortedDates(dates);
  const names = sorted.map((d) => WEEKDAY.format(utcDate(d)));
  if (new Set(names).size === names.length) return joinAnd(names);
  return joinAnd(sorted.map(shortDate));
}

// Days as a short comma list: "Wed, Fri" (weekday names), or short dates when a weekday repeats.
export function weekdayList(dates) {
  const sorted = sortedDates(dates);
  const names = sorted.map((d) => WEEKDAY.format(utcDate(d)));
  return new Set(names).size === names.length ? names.join(', ') : sorted.map(shortDate).join(' · ');
}

// '09:00' or '09:00:00' → minutes after midnight, or null.
function minutesOf(text) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(String(text ?? ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
function clock(minutes) {
  const h24 = Math.floor(minutes / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return { text: `${h12}:${String(minutes % 60).padStart(2, '0')}`, half: h24 < 12 ? 'AM' : 'PM' };
}

// "9:00 AM – 3:00 PM"; both in the same half of the day: "1:00 – 3:00 PM" (Color Belt's rule).
export function campHours(start, end) {
  const a = minutesOf(start);
  const b = minutesOf(end);
  if (a === null || b === null) return '';
  const x = clock(a);
  const y = clock(b);
  return x.half === y.half ? `${x.text} – ${y.text} ${y.half}` : `${x.text} ${x.half} – ${y.text} ${y.half}`;
}

// "Jul 6" — the Monday in a "Week of Jul 6" price line (weekly pricing, rulebook v0.717).
export const monthDay = (dateIso) => MONTH_DAY.format(utcDate(dateIso));

// The first letter in capitals: "cash" → "Cash" (for payment words at the start of a line).
export const capitalize = (text) => (text ? text[0].toUpperCase() + text.slice(1) : '');
