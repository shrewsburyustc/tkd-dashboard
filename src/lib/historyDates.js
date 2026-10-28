// historyDates.js — the dates in a history list (the shared history line, components/HistoryLine.jsx;
// design review M7, rulebook v1.108): reading a row's "when", showing it ("Oct 22") and sorting the
// rows newest first.
// Why it exists: one reading of a date for both showing and sorting, so a row can never show one
// date and sort by another (code re-check of N4). It is plain JavaScript (no JSX), so the shared
// checks (src/lib/shared/checks.mjs) can run it in Node.
//
// A row's "when" (`at`) may be:
//   - a school date 'YYYY-MM-DD': a calendar day, read as it is — midnight on this computer's
//     calendar (new Date(year, month - 1, day)), never through UTC, which can show the day before
//     (Prospects' small bug, plan §10);
//   - anything else a JavaScript Date understands — a timestamp text ('2026-10-22T16:05:00Z'),
//     milliseconds (1792685100000) or a Date — read with new Date(at), to the millisecond;
//   - missing (null, undefined, '') or unreadable: no date is shown, and the row sorts last.

const SCHOOL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// "Oct 22" for a timestamp, in Massachusetts time (the school's: 'America/New_York', the time zone
// every section uses).
const MONTH_DAY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });

// The school date's year, month and day, or null when `at` isn't a school date.
function schoolDate(at) {
  return typeof at === 'string' ? SCHOOL_DATE.exec(at) : null;
}

// A row's moment as a Date, or null when it is missing or unreadable.
export function momentOf(at) {
  if (at === null || at === undefined || at === '') return null;
  const date = schoolDate(at);
  const moment = date ? new Date(Number(date[1]), Number(date[2]) - 1, Number(date[3])) : new Date(at);
  return Number.isNaN(moment.getTime()) ? null : moment;
}

// The date as the list shows it: "Oct 22", or '' when there is none to show.
export function historyDate(at) {
  const moment = momentOf(at);
  if (!moment) return '';
  // A school date shows its own day (momentOf put it on this computer's calendar).
  if (schoolDate(at)) return moment.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return MONTH_DAY.format(moment);
}

// For sorting rows ({ at, … }) newest first, by real time (not by the text, which differs between
// formats). Rows without a readable date go last; rows with the same time keep the section's order
// (the array sort keeps equal rows in place).
export function newestFirst(a, b) {
  const time = (row) => momentOf(row.at)?.getTime() ?? -Infinity;
  return time(b) - time(a) || 0;
}
