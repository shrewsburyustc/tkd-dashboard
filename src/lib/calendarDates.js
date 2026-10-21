// calendarDates.js — the date arithmetic behind the dashboard's calendar (components/DatePicker.jsx).
// Why it exists: the calendar moves a day, a week, a month or a year at a time, draws a month as
// weeks of days, and names each day in full for screen readers ("Saturday, November 14, 2026").
// Keeping that arithmetic here — PURE: no React, no browser — lets the Node checks
// (src/lib/star/calendarChecks.mjs) prove it, e.g. that Jan 31 + one month is Feb 28.
//
// Every date is 'YYYY-MM-DD' text (a calendar day, no time and no time zone), the same as the rest
// of the dashboard. It is turned into a JavaScript Date only at noon on this computer, so a day
// never shifts because of time zones or daylight saving time.
//
//   isIso('2026-11-14') → true            parseIso → { year: 2026, month: 11, day: 14 } (month 1–12)
//   toIso(2026, 11, 14) → '2026-11-14'    daysInMonth(2027, 2) → 28
//   addDaysIso('2026-11-14', -7) → '2026-11-07'
//   addMonthsIso('2027-01-31', 1) → '2027-02-28' (the day is kept when it exists, else the month's last)
//   weekStartIso / weekEndIso → that week's Sunday / Saturday
//   monthWeeks(2026, 11) → [[null, … '2026-11-01' …], …]  (Sunday-first rows; null = not this month)
//   fullDate('2026-11-14') → 'Saturday, November 14, 2026'
//   shortDate('2026-11-14') → 'Sat, Nov 14, 2026'      weekdayMonthDay → 'Sat, Nov 14'
//   MONTH_NAMES, WEEKDAY_SHORT ('Su' … 'Sa'), WEEKDAY_LONG

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAY_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
export const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAY_3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const two = (n) => String(n).padStart(2, '0');

export function toIso(year, month, day) {
  return `${String(year).padStart(4, '0')}-${two(month)}-${two(day)}`;
}

export function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate(); // day 0 of the next month = the last day of this one
}

// 'YYYY-MM-DD' that is a real calendar day → { year, month, day }; anything else → null.
export function parseIso(text) {
  const m = typeof text === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(text) : null;
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}
export const isIso = (text) => parseIso(text) !== null;

// The day as a Date at noon on this computer (noon: never near a daylight-saving jump).
function noon(iso) {
  const p = parseIso(iso);
  return p ? new Date(p.year, p.month - 1, p.day, 12) : null;
}
const fromDate = (date) => toIso(date.getFullYear(), date.getMonth() + 1, date.getDate());

export function addDaysIso(iso, days) {
  const date = noon(iso);
  if (!date) return null;
  date.setDate(date.getDate() + days);
  return fromDate(date);
}

// Same day n months later (or earlier); a day the new month doesn't have becomes its last day.
export function addMonthsIso(iso, months) {
  const p = parseIso(iso);
  if (!p) return null;
  const index = p.year * 12 + (p.month - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return toIso(year, month, Math.min(p.day, daysInMonth(year, month)));
}

export const weekdayOf = (iso) => noon(iso)?.getDay() ?? null; // 0 = Sunday
export const weekStartIso = (iso) => addDaysIso(iso, -weekdayOf(iso));
export const weekEndIso = (iso) => addDaysIso(iso, 6 - weekdayOf(iso));

// One month as weeks (Sunday first). Each week has 7 entries: the day's 'YYYY-MM-DD', or null
// for the empty places before the 1st and after the last day.
export function monthWeeks(year, month) {
  const first = new Date(year, month - 1, 1, 12).getDay();
  const count = daysInMonth(year, month);
  const cells = [];
  for (let i = 0; i < first; i += 1) cells.push(null);
  for (let day = 1; day <= count; day += 1) cells.push(toIso(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// Words for a day.
export function fullDate(iso) {
  const p = parseIso(iso);
  if (!p) return '';
  return `${WEEKDAY_LONG[weekdayOf(iso)]}, ${MONTH_NAMES[p.month - 1]} ${p.day}, ${p.year}`;
}
export function shortDate(iso) {
  const p = parseIso(iso);
  if (!p) return '';
  return `${WEEKDAY_3[weekdayOf(iso)]}, ${MONTH_SHORT[p.month - 1]} ${p.day}, ${p.year}`;
}
export function weekdayMonthDay(iso) {
  const p = parseIso(iso);
  if (!p) return '';
  return `${WEEKDAY_3[weekdayOf(iso)]}, ${MONTH_SHORT[p.month - 1]} ${p.day}`;
}

// The earlier / later of two 'YYYY-MM-DD' (null and '' are ignored). Text order = date order.
export const minIso = (a, b) => (!a ? b : !b ? a : a < b ? a : b);
export const maxIso = (a, b) => (!a ? b : !b ? a : a > b ? a : b);
