// dateLimits.js — which days each Black Belt date calendar lets you pick, and its Year list.
// Why it exists: rulebook v1.018 (design review BB12) puts the dashboard's calendar
// (components/DatePicker.jsx) on every Black Belt date. The calendar grays the days a field's
// save rule refuses, so those can't be picked. The limits come ONLY from the existing save rules (rules.js cycleFormProblems / dayProblems, DayDialog's checkDay,
// candidates/checks.js dobProblem) — nothing new is refused here:
//   - testing day:        today or later; once grading has started, not before lock.minDate
//   - Application due /
//     Submissions due:    any date up to the last testing day (no earliest date, as today)
//   - payment due date:   today or later
//   - date of birth:      up to today
// A date that was SAVED in the past stays allowed when it is edited (the save rules let a saved
// date keep its value), so the earliest day is then the earlier of today and the saved date. The
// calendar can only gray days before one first day (it has no "these days only" list), so the days
// BETWEEN the saved date and today stay pickable; the save rule's amber message ("Choose today or
// a later date.") catches them, and the calendar then shows no "Past dates can't be chosen." hint
// (pastHint below), which wouldn't be true.
// Every date is 'YYYY-MM-DD' text, so plain text comparison ("<") puts them in date order.
// These are plain functions (no React), so checks.mjs can test them.
import { isIsoDate } from '../testing/eventRules.js';

const yearOf = (iso) => (isIsoDate(iso) ? Number(iso.slice(0, 4)) : null);

// The calendar's hint for a "today or later" date: "Past dates can't be chosen." only while the
// first choosable day really is today or later; when a saved past date pulls it back, no hint.
//   min   the first choosable day (notBeforeToday / testingDayMin)
//   hint  the words (text.js PAST_DATES_HINT)
export function pastHint(today, min, hint) {
  return isIsoDate(today) && isIsoDate(min) && min >= today ? hint : '';
}

// The saved due date of every payment of a cycle as it was loaded (Edit cycle), by plan and
// payment number: Map of 'planId|paymentNo' → 'YYYY-MM-DD'. A payment without a number counts by
// its place (1, 2, …), as cycleFormProblems does. Used by BOTH the save rule
// (rules.cycleFormProblems: a past due date may stay if it is the saved one) and the due date's
// calendar (CycleDialog: that saved date stays choosable), so the two can't drift apart.
//   plans  the loaded cycle's plans ([{ id, payments: [{ paymentNo, dueOn }] }]) or null (Add cycle)
export function savedDueDates(plans) {
  const saved = new Map();
  for (const plan of plans ?? []) {
    (plan?.payments ?? []).forEach((pay, i) => saved.set(dueKey(plan.id, pay?.paymentNo ?? i + 1), pay?.dueOn ?? null));
  }
  return saved;
}
// The map's key for one payment.
export const dueKey = (planId, paymentNo) => `${planId}|${paymentNo}`;

// "Today or later", except that a saved past date keeps its own day choosable: the earlier of
// today and the saved date (a missing one doesn't count).
//   today  the school's today ('YYYY-MM-DD')
//   saved  the date as it was saved (null for a new one)
export function notBeforeToday(today, saved = null) {
  if (!isIsoDate(saved)) return isIsoDate(today) ? today : null;
  if (!isIsoDate(today)) return saved;
  return saved < today ? saved : today;
}

// The testing day (DayDialog): today or later (a saved past day keeps its date), and once grading
// has started (lock.minDate, while the date isn't locked) not before that date.
//   lock  DayDialog's lock ({ minDate, dateLocked } or null)
export function testingDayMin(today, saved = null, lock = null) {
  const min = notBeforeToday(today, saved);
  if (lock?.minDate && !lock.dateLocked && isIsoDate(lock.minDate) && (!min || lock.minDate > min)) return lock.minDate;
  return min;
}

// Application due and Submissions due: up to the last testing day (null while there are no days).
//   days  the cycle's testing days ([{ date }])
export function lastTestingDay(days) {
  const dates = (days ?? []).map((d) => d?.date).filter(isIsoDate).sort();
  return dates.length > 0 ? dates[dates.length - 1] : null;
}

// A Year list from `from` to `to` (both included), plus any extra years (e.g. the year of the date
// on show), oldest first, without repeats. The calendar also adds the year on show by itself.
export function yearRange(from, to, extra = []) {
  const years = new Set();
  for (let y = from; y <= to; y += 1) years.add(y);
  for (const y of extra) if (Number.isInteger(y)) years.add(y);
  return [...years].sort((a, b) => a - b);
}

// The Year list of a cycle date (testing day, deadlines, due dates): from the earliest choosable
// year (never later than this year) up to the latest choosable year (or two years ahead when there
// is no latest, as Star's testing date), plus the year of the date on show.
//   today, min, max, value  'YYYY-MM-DD' or null
export function cycleDateYears(today, { min = null, max = null, value = null } = {}) {
  const now = yearOf(today);
  if (now === null) return [];
  const from = Math.min(yearOf(min) ?? now, now);
  const to = Math.max(yearOf(max) ?? now + 2, from);
  return yearRange(from, to, [yearOf(value)]);
}

// The staff date of birth's Year list (Star's staff birthday field): this year back 80 years.
export const DOB_YEARS_BACK = 80;
export function dobYears(today) {
  const now = yearOf(today);
  return now === null ? [] : yearRange(now - DOB_YEARS_BACK, now);
}

// The family form's date of birth (Star's family birthday field): this year back 100 years. The
// form shows them newest first (DatePicker's yearsNewestFirst).
export const FORM_DOB_YEARS_BACK = 100;
export function formDobYears(today) {
  const now = yearOf(today);
  return now === null ? [] : yearRange(now - FORM_DOB_YEARS_BACK, now);
}
