// eventDateRules.js — the rules for a Star event's two dates in Add / Edit event: the testing date
// and the automatic closing date (calendar mockups C1–C4, rulebook v0.503; v0.85, v0.92, G4 v0.500).
// Why it exists: what happens to the closing date when the testing date changes, which days each
// calendar lets you choose, and which years its Year list offers are small rules that are easy to
// get subtly wrong. Written PURE (no React, no database, no browser) so src/lib/star/calendarChecks.mjs
// can prove every case in Node, and StarEventsTab / StarEventDialog only call these functions.
//
// Dates are 'YYYY-MM-DD' text; '' or null = not chosen. `today` is the school's today.
//
//   suggestedClosingDate(testingDate, today)    7 days before, never before today (v0.503 item 2)
//   isFollowing(closingDate, testingDate)       exactly 7 days before that testing date (item 7)
//   closingAfterTestingChange({ closingDate, oldTestingDate, newTestingDate, today })
//        → { closingDate, moved }   moved = true when a hand-set date was pulled back to the new
//          testing date (the note "Moved to …, so it isn't after the testing date.")
//   testingDateLimits(today)                    → { min: today, max: null }
//   closingDateLimits(testingDate, today)       → { min, max, passed }   passed = no day can be chosen
//   closingBoxBlocked({ isEdit, hadClosingDate, testingDate, today })   (item 6: the gray box)
//   yearRange(from, to, extra)                  → sorted years for a Year list (item 10)
//   testingYears(today, savedTestingDate)       this year and the next two (+ an older event's year)
//   closingYears(today, testingDate, closingDate)
import { addDaysIso, isIso, parseIso } from '../calendarDates.js';

export const CLOSE_DAYS_BEFORE = 7; // v0.85: the closing date starts 7 days before the testing date

export function suggestedClosingDate(testingDate, today) {
  if (!isIso(testingDate)) return '';
  const date = addDaysIso(testingDate, -CLOSE_DAYS_BEFORE);
  return isIso(today) && date < today ? today : date;
}

// "Following" = exactly 7 days before the testing date (v0.503 item 7). A date that Add event
// clamped to today (testing date less than 7 days away) is NOT following.
export function isFollowing(closingDate, testingDate) {
  return isIso(closingDate) && isIso(testingDate) && closingDate === addDaysIso(testingDate, -CLOSE_DAYS_BEFORE);
}

// The closing date after the testing date changed from oldTestingDate to newTestingDate
// (Add and Edit, on every change, later or earlier):
//   1. a closing date that has already passed never moves (v0.85: nothing reopens by itself)
//   2. no closing date yet (Add: "Choose…") → 7 days before the new date, never before today
//   3. a following closing date follows: 7 days before the new date, never before today
//   4. a hand-set date stays — unless it would be after the new testing date: then it moves to
//      the testing date itself (moved: true)
// A new testing date that isn't a date (cleared) changes nothing.
export function closingAfterTestingChange({ closingDate, oldTestingDate, newTestingDate, today }) {
  const keep = { closingDate: closingDate ?? '', moved: false };
  if (!isIso(newTestingDate)) return keep;
  if (isIso(closingDate) && isIso(today) && closingDate < today) return keep; // 1
  if (!isIso(closingDate)) return { closingDate: suggestedClosingDate(newTestingDate, today), moved: false }; // 2
  if (isFollowing(closingDate, oldTestingDate)) return { closingDate: suggestedClosingDate(newTestingDate, today), moved: false }; // 3
  if (closingDate > newTestingDate) return { closingDate: newTestingDate, moved: true }; // 4
  return keep;
}

// The testing date calendar: today or later (CONTRACT-0006: a new or changed date can't be past).
export const testingDateLimits = (today) => ({ min: today, max: null });

// The closing date calendar: from today up to the testing date (v0.85, CONTRACT-0006).
// passed: the testing day is already over, so no day can be chosen (v0.503 item 6).
export function closingDateLimits(testingDate, today) {
  if (!isIso(testingDate)) return { min: today, max: null, passed: false };
  return { min: today, max: testingDate, passed: isIso(today) && testingDate < today };
}

// Past events (v0.503 item 6): only an event that had NO closing date when the dialog opened, and
// whose testing date is before today, can't have the box ticked ("Can't be turned on after the
// testing day. Move the testing date first."). One that had a closing date keeps a usable box:
// ticking again brings the saved date back (G4), which the database accepts unchanged.
export function closingBoxBlocked({ isEdit, hadClosingDate, testingDate, today }) {
  return Boolean(isEdit && !hadClosingDate && isIso(testingDate) && isIso(today) && testingDate < today);
}

// Years from `from` to `to` (both included), plus any extra years, sorted, without repeats.
export function yearRange(from, to, extra = []) {
  const years = new Set();
  for (let y = from; y <= to; y += 1) years.add(y);
  for (const y of extra) if (Number.isInteger(y)) years.add(y);
  return [...years].sort((a, b) => a - b);
}

const yearOf = (iso) => parseIso(iso)?.year ?? null;

// The testing date's Year list (item 10): this year and the next two, plus the saved event's own
// year (Edit event of an older event).
export function testingYears(today, savedTestingDate = null) {
  const now = yearOf(today);
  return yearRange(now, now + 2, [yearOf(savedTestingDate)]);
}

// The closing date's Year list (item 5): from this year up to the testing date's year, plus the
// year of the closing date on show (a past event's saved date).
export function closingYears(today, testingDate, closingDate = null) {
  const now = yearOf(today);
  const last = yearOf(testingDate) ?? now;
  return yearRange(now, Math.max(now, last), [yearOf(closingDate), yearOf(testingDate)]);
}
