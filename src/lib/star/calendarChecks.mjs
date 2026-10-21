// calendarChecks.mjs — automatic checks for the dashboard calendar's date arithmetic
// (src/lib/calendarDates.js) and the Star event date rules (src/lib/star/eventDateRules.js).
// Run:  node src/lib/star/calendarChecks.mjs      (prints ALL CALENDAR CHECKS PASSED, exits 0)
// Why it exists: the calendar mockups C1–C4 (rulebook v0.503) decide exactly what happens to the
// closing date when the testing date moves, which days and years can be chosen, and how the
// keyboard moves by day / week / month / year. These plain `assert` checks prove every case in
// milliseconds, without a browser. Examples use the mockups' dates ("today" Sat, Oct 17, 2026).
import assert from 'node:assert/strict';
import {
  addDaysIso, addMonthsIso, daysInMonth, fullDate, isIso, monthWeeks, parseIso, shortDate, weekdayMonthDay,
  weekEndIso, weekStartIso,
} from '../calendarDates.js';
import {
  closingAfterTestingChange, closingBoxBlocked, closingDateLimits, closingYears, isFollowing,
  suggestedClosingDate, testingDateLimits, testingYears, yearRange,
} from './eventDateRules.js';

let count = 0;
function check(label, fn) {
  try {
    fn();
    count += 1;
  } catch (error) {
    console.error(`FAILED: ${label}`);
    throw error;
  }
}

const TODAY = '2026-10-17'; // the mockups' "today"

// ----- calendarDates.js -----
check('real dates only', () => {
  assert.equal(isIso('2026-11-14'), true);
  assert.equal(isIso('2027-02-29'), false);
  assert.equal(isIso('2028-02-29'), true);
  assert.equal(isIso('2026-13-01'), false);
  assert.equal(isIso('11/14/2026'), false);
  assert.equal(isIso(null), false);
  assert.deepEqual(parseIso('2026-11-14'), { year: 2026, month: 11, day: 14 });
  assert.equal(daysInMonth(2027, 2), 28);
});

check('days, weeks, months, years (the keyboard moves, v0.503 item 8)', () => {
  assert.equal(addDaysIso('2026-11-14', -7), '2026-11-07');
  assert.equal(addDaysIso('2026-12-31', 1), '2027-01-01');
  assert.equal(addDaysIso('2026-11-01', -1), '2026-10-31'); // across the daylight-saving change
  assert.equal(addDaysIso('2026-03-08', 1), '2026-03-09');
  assert.equal(addMonthsIso('2027-01-31', 1), '2027-02-28');
  assert.equal(addMonthsIso('2026-11-14', -1), '2026-10-14');
  assert.equal(addMonthsIso('2026-11-14', 12), '2027-11-14');
  assert.equal(addMonthsIso('2028-02-29', 12), '2029-02-28');
  assert.equal(weekStartIso('2026-11-14'), '2026-11-08'); // Sunday
  assert.equal(weekEndIso('2026-11-08'), '2026-11-14'); // Saturday
});

check('a month as weeks, Sunday first', () => {
  const weeks = monthWeeks(2026, 11); // Nov 1, 2026 is a Sunday
  assert.equal(weeks[0][0], '2026-11-01');
  assert.equal(weeks.length, 5);
  assert.equal(weeks[4][1], '2026-11-30');
  assert.equal(weeks[4][2], null);
  const feb = monthWeeks(2027, 2); // Feb 1, 2027 is a Monday
  assert.equal(feb[0][0], null);
  assert.equal(feb[0][1], '2027-02-01');
  assert.ok(feb.every((w) => w.length === 7));
});

check('words for a day (v0.503 item 9)', () => {
  assert.equal(fullDate('2026-11-14'), 'Saturday, November 14, 2026');
  assert.equal(shortDate('2027-02-13'), 'Sat, Feb 13, 2027');
  assert.equal(weekdayMonthDay('2026-11-05'), 'Thu, Nov 5');
  assert.equal(fullDate('nope'), '');
});

// ----- eventDateRules.js -----
check('the suggested closing date: 7 days before, never before today (item 2)', () => {
  assert.equal(suggestedClosingDate('2027-02-13', TODAY), '2027-02-06');
  assert.equal(suggestedClosingDate('2026-10-20', TODAY), TODAY); // clamped
  assert.equal(suggestedClosingDate('', TODAY), '');
});

check('following = exactly 7 days before (item 7)', () => {
  assert.equal(isFollowing('2026-11-07', '2026-11-14'), true);
  assert.equal(isFollowing('2026-11-12', '2026-11-14'), false);
  assert.equal(isFollowing(TODAY, '2026-10-20'), false); // clamped at Add: not following
});

check('Add event: the first testing date fills the closing date in (item 2)', () => {
  assert.deepEqual(closingAfterTestingChange({ closingDate: '', oldTestingDate: '', newTestingDate: '2027-02-13', today: TODAY }), {
    closingDate: '2027-02-06', moved: false,
  });
});

check('a following closing date follows, later and earlier (C3, PC)', () => {
  // Fall 2026: Nov 14, closing Nov 7 → testing Thu, Nov 5 → closing Thu, Oct 29
  assert.deepEqual(closingAfterTestingChange({ closingDate: '2026-11-07', oldTestingDate: '2026-11-14', newTestingDate: '2026-11-05', today: TODAY }), {
    closingDate: '2026-10-29', moved: false,
  });
  assert.deepEqual(closingAfterTestingChange({ closingDate: '2026-11-07', oldTestingDate: '2026-11-14', newTestingDate: '2026-12-12', today: TODAY }), {
    closingDate: '2026-12-05', moved: false,
  });
  // …never before today
  assert.equal(closingAfterTestingChange({ closingDate: '2026-11-07', oldTestingDate: '2026-11-14', newTestingDate: '2026-10-19', today: TODAY }).closingDate, TODAY);
});

check('a hand-set closing date stays, or moves to the testing date with the note (C3, tablet)', () => {
  assert.deepEqual(closingAfterTestingChange({ closingDate: '2026-11-12', oldTestingDate: '2026-11-14', newTestingDate: '2026-11-05', today: TODAY }), {
    closingDate: '2026-11-05', moved: true,
  });
  assert.deepEqual(closingAfterTestingChange({ closingDate: '2026-11-12', oldTestingDate: '2026-11-14', newTestingDate: '2026-12-20', today: TODAY }), {
    closingDate: '2026-11-12', moved: false,
  });
  // a date Add clamped to today is not following: it stays when the testing date moves later
  assert.equal(closingAfterTestingChange({ closingDate: TODAY, oldTestingDate: '2026-10-20', newTestingDate: '2026-12-01', today: TODAY }).closingDate, TODAY);
});

check('a closing date that has already passed never moves (item 7, v0.85)', () => {
  // testing Oct 20, closing Oct 13, today Oct 17 — following, but passed
  assert.deepEqual(closingAfterTestingChange({ closingDate: '2026-10-13', oldTestingDate: '2026-10-20', newTestingDate: '2026-12-01', today: TODAY }), {
    closingDate: '2026-10-13', moved: false,
  });
  // Summer 2026 (Aug 15, closing Aug 8) moved into the future keeps Aug 8
  assert.equal(closingAfterTestingChange({ closingDate: '2026-08-08', oldTestingDate: '2026-08-15', newTestingDate: '2026-11-21', today: TODAY }).closingDate, '2026-08-08');
  // …even when the new testing date is before it
  assert.equal(closingAfterTestingChange({ closingDate: '2026-10-13', oldTestingDate: '2026-10-20', newTestingDate: '2026-10-10', today: TODAY }).closingDate, '2026-10-13');
});

check('a cleared testing date changes nothing', () => {
  assert.deepEqual(closingAfterTestingChange({ closingDate: '2026-11-07', oldTestingDate: '2026-11-14', newTestingDate: '', today: TODAY }), {
    closingDate: '2026-11-07', moved: false,
  });
});

check('which days each calendar allows (items 1, 5, 6)', () => {
  assert.deepEqual(testingDateLimits(TODAY), { min: TODAY, max: null });
  assert.deepEqual(closingDateLimits('2026-11-14', TODAY), { min: TODAY, max: '2026-11-14', passed: false });
  assert.deepEqual(closingDateLimits('2026-08-15', TODAY), { min: TODAY, max: '2026-08-15', passed: true });
  assert.deepEqual(closingDateLimits(TODAY, TODAY), { min: TODAY, max: TODAY, passed: false }); // testing today: today can be chosen
  assert.deepEqual(closingDateLimits('', TODAY), { min: TODAY, max: null, passed: false });
});

check('the gray box only for a past event with no closing date (item 6)', () => {
  assert.equal(closingBoxBlocked({ isEdit: true, hadClosingDate: false, testingDate: '2026-05-16', today: TODAY }), true);
  assert.equal(closingBoxBlocked({ isEdit: true, hadClosingDate: true, testingDate: '2026-08-15', today: TODAY }), false);
  assert.equal(closingBoxBlocked({ isEdit: true, hadClosingDate: false, testingDate: '2026-11-21', today: TODAY }), false); // moved into the future
  assert.equal(closingBoxBlocked({ isEdit: false, hadClosingDate: false, testingDate: '', today: TODAY }), false);
});

check('Year lists (items 5, 10)', () => {
  assert.deepEqual(yearRange(2026, 2028, [2026, null]), [2026, 2027, 2028]);
  assert.deepEqual(testingYears(TODAY), [2026, 2027, 2028]);
  assert.deepEqual(testingYears(TODAY, '2025-05-10'), [2025, 2026, 2027, 2028]); // an older event's own year
  assert.deepEqual(closingYears(TODAY, '2027-02-13'), [2026, 2027]); // stops at the testing date's year
  assert.deepEqual(closingYears(TODAY, '2026-11-14'), [2026]);
  assert.deepEqual(closingYears(TODAY, '2025-08-15', '2025-08-08'), [2025, 2026]);
});

console.log(`ALL CALENDAR CHECKS PASSED (${count} checks)`);
