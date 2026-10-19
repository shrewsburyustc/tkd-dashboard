// gradingRules.js — the rules of the Grading tab (Color Belt testing phase 3), written once for
// the screens, the data layer (eventsApi.js) AND the preview database (mockTestingEvents.js).
// Why it exists: the database (migration 0010, contract 0010 §1) decides who may record a result
// and when, and what a grading note may contain. The screens use the SAME rules so they can show
// the right buttons and warn while you type, and the preview uses them so it refuses exactly what
// the real database refuses. If a rule changes, change it in migration 0010 AND here.
//
// Pure functions only: no database, no browser — `node src/lib/testing/checks.mjs` tests them.
// Words used:
//   result  'pass' | 'not_passed' | 'no_show' | null (not recorded yet)
//   graded  a result OR a note is saved for the student (the database has a testing_results row)
//   window  where "today" is compared with the testing day: 'before' | 'day' | 'after'
import { normalizeName, nameProblem } from './names.js';
import { timeToMinutes, todayInSchoolTime, SCHOOL_TIME_ZONE } from './eventRules.js';

// The three results a grader can tap, in button order (the database's check uses the same list).
export const RESULTS = ['pass', 'not_passed', 'no_show'];

// The longest grading note, in characters after tidying (testing_line_is_valid(note, 200)).
export const GRADING_NOTE_MAX = 200;

// The note exactly as the database will store it: one line — every run of spaces, tabs and line
// breaks becomes one space, spaces at the ends are removed (the name rule, names.js).
// Nothing left → null (= no note).
export function normalizeGradingNote(text) {
  const tidy = normalizeName(text);
  return tidy === '' ? null : tidy;
}

// What's wrong with a note, as a code the screens turn into words (text.js):
//   null           fine — including blank, which means "clear the note"
//   'badCharacter' an invisible control / zero-width / text-direction character (checked first)
//   'tooLong'      more than 200 characters after tidying
// Characters are counted like the database's char_length: an emoji or 'é' counts as 1.
export function gradingNoteProblem(text) {
  const tidy = normalizeName(text);
  if (tidy === '') return null;
  if (nameProblem(tidy) === 'badCharacter') return 'badCharacter';
  if ([...tidy].length > GRADING_NOTE_MAX) return 'tooLong';
  return null;
}

// Where today is compared with the testing day. Both are 'YYYY-MM-DD' text, which compares
// correctly as plain text (the same way the database compares dates).
export function gradingWindow(today, testingDate) {
  if (today < testingDate) return 'before';
  if (today > testingDate) return 'after';
  return 'day';
}

// May this person change results and notes now? Everyone on the testing day; after it, only
// admins (v0.186). Before the day nobody can (the buttons show, grayed out).
export function canChangeResults(window, isAdmin) {
  return window === 'day' || (window === 'after' && isAdmin === true);
}

// Is anything saved for this roster row (a result or a note)?
export function isGraded(row) {
  return (row?.result ?? null) !== null || (row?.note ?? null) !== null;
}

// The numbers for the "All classes" line and the class's count line. rows = the active students
// with the values shown on screen (an unsaved tap counts as tapped). A note-only row counts as
// "not recorded yet" (it has no result).
// → { total, pass, notPassed, noShow, notRecorded }
export function resultCounts(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const counts = { total: list.length, pass: 0, notPassed: 0, noShow: 0, notRecorded: 0 };
  for (const row of list) {
    if (row?.result === 'pass') counts.pass += 1;
    else if (row?.result === 'not_passed') counts.notPassed += 1;
    else if (row?.result === 'no_show') counts.noShow += 1;
    else counts.notRecorded += 1;
  }
  return counts;
}

// The time right now at the school, as minutes after midnight (5:41 PM → 1061).
// now: a Date or milliseconds (default: this moment).
const SCHOOL_CLOCK = new Intl.DateTimeFormat('en-CA', {
  timeZone: SCHOOL_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
export function schoolMinutesNow(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  const parts = Object.fromEntries(SCHOOL_CLOCK.formatToParts(date).map((p) => [p.type, p.value]));
  return (Number(parts.hour) % 24) * 60 + Number(parts.minute);
}

// Which class the Grading tab opens on, on the testing day (v0.184). classes = the event's
// classes ({ id, position, startTime 'HH:MM', endTime 'HH:MM' }); minutes = schoolMinutesNow().
//   1. the first class (in switch order) that is on right now: start ≤ now < end
//   2. else the class that starts next (the smallest start after now; a tie → switch order)
//   3. else (every class is over) the first class
// No classes → null.
export function defaultGradingClassId(classes, minutes) {
  if (!Array.isArray(classes) || classes.length === 0) return null;
  // Switch order = position. sort() keeps the given order for equal positions.
  const ordered = [...classes].sort((a, b) => a.position - b.position);
  const timed = ordered.map((c) => ({ id: c.id, start: timeToMinutes(c.startTime), end: timeToMinutes(c.endTime) }));
  const now = timed.find((t) => t.start !== null && t.end !== null && t.start <= minutes && minutes < t.end);
  if (now) return now.id;
  let next = null;
  for (const t of timed) {
    // "<" (not "<=") keeps the earlier class in switch order when two start at the same time.
    if (t.start !== null && t.start > minutes && (next === null || t.start < next.start)) next = t;
  }
  return next ? next.id : ordered[0].id;
}

// "Added Nov 21 by Jeffrey Berg (admin)": a student staff added AFTER the testing day (only an
// admin can do that, v0.191). row = a roster row (source, registeredAt, createdByName);
// testingDate = 'YYYY-MM-DD'. → { date: 'YYYY-MM-DD' (school date it was added), byName } or null.
export function addedAfterDay(row, testingDate) {
  if (!row || row.source !== 'staff' || typeof testingDate !== 'string') return null;
  const ms = Date.parse(row.registeredAt ?? '');
  if (Number.isNaN(ms)) return null;
  const date = todayInSchoolTime(new Date(ms));
  return date > testingDate ? { date, byName: row.createdByName ?? null } : null;
}
