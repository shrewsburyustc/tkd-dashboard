// format.js — small helpers that turn Finance data into text, and typed text back into numbers.
// Why it exists: the database sends money as whole CENTS (6500 = $65.00) and days as
// 'YYYY-MM-DD'. People read "$65.00" and "Sat, Oct 24". These helpers do that one way
// everywhere on the Finance screens, so every screen shows the same format.
//
// Days: a 'YYYY-MM-DD' text is read as a calendar day, not a moment in time. We build the date
// at midnight UTC and also FORMAT it in UTC, so the day never shifts by one because of the
// browser's own time zone.
// Times: the school's clock is America/New_York (contract 0011 §1.1), whatever the device says.

export const SCHOOL_TIME_ZONE = 'America/New_York';

// ----- Money -----
const DOLLARS = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// 6500 → "$65.00", 123456 → "$1,234.56", -2000 → "−$20.00" (a real minus sign, as mocked up).
export function money(cents) {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return '';
  const text = `$${DOLLARS.format(Math.abs(cents) / 100)}`;
  return cents < 0 ? `−${text}` : text;
}

// The biggest count the database accepts: $100,000.00 (contract §1.2: ≤ 10 000 000 cents).
export const MAX_COUNT_CENTS = 10000000;
export const MAX_CHECKS = 500;

// Reads a typed amount ("300", "$300.00", "1,234.5", ".50"). Returns ONE of:
//   { cents }  ·  { problem: 'empty' }  ·  { problem: 'notNumber' }  ·  { problem: 'tooHigh' }
// No minus sign: cash taken out of the drawer is typed as a positive number (v0.209).
// { allowMinus: true } (only the card machine total on a day whose card refunds are bigger than
// its card payments, v0.814 / mockup B2 "−150.00"): a leading - or − makes the amount negative.
export function parseMoney(text, { allowMinus = false } = {}) {
  let s = String(text ?? '').trim();
  let sign = 1;
  if (allowMinus && /^[-−]/.test(s)) {
    sign = -1;
    s = s.slice(1).trim();
  }
  if (s.startsWith('$')) s = s.slice(1).trim();
  s = s.replace(/,/g, '');
  if (s === '') return { problem: 'empty' };
  if (!/^(\d+(\.\d{0,2})?|\.\d{1,2})$/.test(s)) return { problem: 'notNumber' };
  const [whole, decimals = ''] = s.split('.');
  // Whole dollars × 100 + the cents part padded to two digits ("5" → 50 cents).
  const cents = Number(whole || '0') * 100 + Number((decimals + '00').slice(0, 2));
  if (cents > MAX_COUNT_CENTS) return { problem: 'tooHigh' };
  return { cents: sign < 0 && cents !== 0 ? -cents : cents };
}

// Reads a typed number of checks ("2"). Same kind of answer as parseMoney, with { count }.
export function parseCount(text) {
  const s = String(text ?? '').trim();
  if (s === '') return { problem: 'empty' };
  if (!/^\d+$/.test(s)) return { problem: 'notNumber' };
  const count = Number(s);
  if (count > MAX_CHECKS) return { problem: 'tooHigh' };
  return { count };
}

// ----- Days ('YYYY-MM-DD') -----
function dateOf(day) {
  const [y, m, d] = String(day).split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

function fmt(day, options) {
  if (!day) return '';
  return dateOf(day).toLocaleDateString('en-US', { timeZone: 'UTC', ...options });
}

export const dayLong = (day) => fmt(day, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }); // Saturday, October 24, 2026
export const dayLongNoYear = (day) => fmt(day, { weekday: 'long', month: 'long', day: 'numeric' }); // Saturday, October 24
export const dayShort = (day) => fmt(day, { weekday: 'short', month: 'short', day: 'numeric' }); // Sat, Oct 24
export const dayShortYear = (day) => fmt(day, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }); // Sat, Oct 24, 2026
export const monthDay = (day) => fmt(day, { month: 'short', day: 'numeric' }); // Oct 29
export const monthDayYear = (day) => fmt(day, { month: 'short', day: 'numeric', year: 'numeric' }); // Oct 1, 2026
export const monthYear = (day) => fmt(day, { month: 'long', year: 'numeric' }); // October 2026
export const monthShortYear = (day) => fmt(day, { month: 'short', year: 'numeric' }); // Oct 2026 (phones)
export const weekdayShort = (day) => fmt(day, { weekday: 'short' }); // Sat
export const weekdayLong = (day) => fmt(day, { weekday: 'long' }); // Saturday

// 'YYYY-MM-DD' of a Date, in the school's time zone ('en-CA' writes dates as YYYY-MM-DD).
export function schoolDayOf(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: SCHOOL_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

// Add (or with a minus number, take away) days: addDays('2026-10-24', 1) → '2026-10-25'.
export function addDays(day, n) {
  const date = dateOf(day);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

// The first day of the month a day is in: '2026-10-24' → '2026-10-01'.
export const monthStart = (day) => `${String(day).slice(0, 7)}-01`;

// The first day of the next / previous month.
export function addMonths(monthDayText, n) {
  const date = dateOf(monthStart(monthDayText));
  date.setUTCMonth(date.getUTCMonth() + n);
  return date.toISOString().slice(0, 10);
}

// Whole days from one day to another ('2026-10-01' → '2026-10-31' = 30).
export function daysBetween(from, to) {
  return Math.round((dateOf(to) - dateOf(from)) / 86400000);
}

// ----- Times -----
// A time as the school's clock shows it: "1:42 PM". Accepts a database time ("13:42", "13:42:05")
// or a full timestamp ("2026-10-24T17:42:00Z").
export function timeOfDay(value) {
  if (!value) return '';
  const plain = /^(\d{1,2}):(\d{2})/.exec(String(value));
  if (plain && !String(value).includes('T') && !String(value).includes('-')) {
    const hours = Number(plain[1]);
    const suffix = hours >= 12 ? 'PM' : 'AM';
    return `${((hours + 11) % 12) + 1}:${plain[2]} ${suffix}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleTimeString('en-US', { timeZone: SCHOOL_TIME_ZONE, hour: 'numeric', minute: '2-digit' });
}

// "Mon, Oct 26, 9:07 AM" for a timestamp, in school time.
export function dayAndTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value ?? '');
  return `${dayShort(schoolDayOf(date))}, ${timeOfDay(value)}`;
}

// "Sat at 4:05 PM" — used in the Changed after closing line (D4).
export function weekdayAtTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${weekdayShort(schoolDayOf(date))} at ${timeOfDay(value)}`;
}

// "Oct 24, 2026, 1:45 PM" — when a page was printed (D8).
export function printedWhen(date) {
  return `${monthDayYear(schoolDayOf(date))}, ${timeOfDay(date.toISOString())}`;
}

// The reminder times: Off, then every 15 minutes from 11:00 AM to 11:00 PM (v0.207 / D9).
// Values are 'HH:MM' (what the data layer sends to the database), labels "7:30 PM".
export const REMINDER_TIMES = (() => {
  const list = [];
  for (let minutes = 11 * 60; minutes <= 23 * 60; minutes += 15) {
    const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
    const mm = String(minutes % 60).padStart(2, '0');
    list.push({ value: `${hh}:${mm}`, label: timeOfDay(`${hh}:${mm}`) });
  }
  return list;
})();

// '19:30:00' or '19:30' → '19:30' (the dropdown's value); null stays null (Off).
export const shortTime = (value) => (value ? String(value).slice(0, 5) : null);
