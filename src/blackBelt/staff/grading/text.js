// text.js — the words of Black Belt testing's GRADING tab (contract 0025 §14.2): the tab names, the
// day switch, the grid's headings, the cells, the measured-number editor, the extra points, the
// Result column, the save messages, the phone picker, Choose subjects and the printed sheet.
// Why it exists: wording lives in one place, never inline in the screens (the house rule).
// Sources: the approved Grading mockups `docs/Testing/Black Belt Testing/TKD-BlackBelt-Grading-Mockups.html`
// (G01–G08, proposals G 1–36, rulebook v0.947) — which reuse Star's approved grading words
// (rulebook v0.512 / v0.513). Star's sentences that Black Belt uses UNCHANGED (the "grades and
// counts" banners, the leave question, Choose subjects' answers) are imported from Star's own word
// file as S, so both sections always say the same thing. Lines marked
// `// new wording, not in the mockups` are not drawn anywhere — Jeffrey checks them at CP3.
export * as S from '../../../lib/star/gradingText.js';
import { joinNames } from '../../../lib/star/gradingText.js';

// ----- The cycle page's tabs (v0.946: Candidates · Grading · Results · Rubric) -----
export const TAB_GRADING = 'Grading';
export const TAB_RESULTS = 'Results';

// ----- Numbers -----
// A points number as the database sends it: 263 → "263", 305.75 → "305.75" (never rounded away).
export const pointsText = (n) => (typeof n === 'number' && Number.isFinite(n) ? String(Math.round(n * 100) / 100) : '');
export const plusPoints = (n) => `+${pointsText(n ?? 0)}`; // "+5", "+0", "+12"

// ----- The day switch (G 1, G 28) -----
export const DAY_LABEL = 'Day'; // the phone's dropdown label
export const DAY_SWITCH_LABEL = 'Grading day'; // screen readers: the PC / tablet switch // new wording, not in the mockups
export const TODAY = 'Today';
export const ANY_DAY = 'Any day';
// the top line of a testing day's choice: "Today · Sat, Apr 3" / "Sat, May 1"
export const dayTop = (isToday, dateText) => (isToday ? `${TODAY} · ${dateText}` : dateText);
// the phone's dropdown: "Today · Sat, Apr 3 · Physical" / "Sat, May 1 · Technical" / "Other requirements"
export const dayOption = (top, what) => `${top} · ${what}`;
export const OTHER_REQUIREMENTS = 'Other requirements'; // used when the rubric has no part name
export const EXTRA_POINTS = 'Extra points';
// the parts of a day with two parts: "Technical · Curriculum"
export const partsWords = (names) => names.join(' · ');
export const NO_TESTING_TODAY = 'No testing today. Showing the next testing day.'; // G 28

// ----- Lines under the Dan bar -----
// G 16 — on Other requirements, from the day after Submissions due
export const handInLine = (dueText) => `Hand-in work was due ${dueText}. Empty hand-in cells show Late.`;
// G 20 — on Extra points while the rubric's "to confirm" box is ticked
export const TO_CONFIRM_LINE = 'Extra point numbers are still to be confirmed with Master Jeong.';

// ----- The Dan switch (Star's) -----
export const DAN_SWITCH_LABEL = 'Dan';
export const DAN_WORD = 'Dan';
export const danWord = (label) => label.replace(/\s*Dan$/i, ''); // "1st Dan" → "1st" (below 360px)
export const danChoiceLabel = (label, count, warn) => `${label}, ${count}${warn ? ', has grades not saved' : ''}`;

// ----- Location (G 29; Star's / the Candidates tab's words) -----
export const oneSchoolLine = (school) => `Showing ${school} candidates only`;
export const SHOW_BOTH_SCHOOLS = 'Show both schools';
export const emptyDanOneSchool = (school, danLabel) =>
  `No ${school} ${danLabel} candidates. Show both schools to see the rest, or add candidates on the Candidates tab.`;
// the same line with a working "Show both schools" link (Results' pattern): [before, link, after]
export const emptyOneSchoolParts = (school, danLabel) => [`No ${school} ${danLabel} candidates. `, SHOW_BOTH_SCHOOLS, ' to see the rest, or add candidates on the Candidates tab.'];
export const emptyDanBoth = (danLabel) => `No ${danLabel} candidates. Add candidates on the Candidates tab.`; // Star v0.513's line for Both

// ----- Print (G 33–G 35) -----
export const PRINT_SHEET = 'Print grading sheet';

// ----- Loading -----
export const LOADING_GRADES = 'Loading grades…';
export const OFFLINE_NO_GRADES = 'You’re offline, so the grades couldn’t load. They load by themselves when the connection is back.'; // new wording, not in the mockups
export const LOAD_GRADES_FAILED = 'Couldn’t load the grades. Check the connection, then try again.'; // Star v0.513's line

// ----- Column headings (G 6) -----
export const COL_CANDIDATE = 'Candidate';
export const COL_TOTAL = 'Total';
export const COL_RESULT = 'Result';
export const COL_EXTRA = 'Extra';
export const credits = (n) => `(${n})`; // gray after a tilted subject name
export const creditsWords = (n) => `${n} ${n === 1 ? 'credit' : 'credits'}`;
export const OUTDOOR = 'outdoor';
export const HANDED_IN = 'handed in';
export const COUNT_UNIT = 'count'; // under an extra-points item
export const unitsOfWays = (units) => units.join(' / '); // "reps / sec"
export const gridLabel = (danLabel, dayWords) => `${danLabel} grading, ${dayWords}`; // screen readers // new wording, not in the mockups

// ----- A row's gray lines (G 2, G 14) -----
// "Worcester · 18 and over" (the age group, never the date of birth)
export const rowLine = (school, group) => [school, group].filter(Boolean).join(' · ');
export const MAKEUP_LABEL = 'Make-up'; // the amber pill
// "from Spring 2027 · retests Free sparring"
export const makeupFromLine = (cycleName, retestNames) =>
  [`from ${cycleName}`, retestNames.length > 0 ? `retests ${retestNames.join(', ')}` : null].filter(Boolean).join(' · ');
// the band above the make-up rows (v0.947)
export const makeupBand = (n) => `Make-ups · ${n} — only the outlined subjects are graded`;
// the phone card's header box: "Make-up from Spring 2027 Retests Free sparring. Every other grade is kept and can't be changed here."
export const makeupCardFrom = (cycleName) => `from ${cycleName}`;
export const makeupCardText = (retestNames) =>
  `Retests ${joinNames(retestNames)}. Every other grade is kept and can’t be changed here.`;

// ----- Cells -----
export const EMPTY_CELL = '·';
export const NOT_FOR_AGE = '—'; // G 13
export const notForAgeLine = (group) => `not for ${group}`; // the phone card (G 13)
export const LATE = 'Late'; // G 17
export const KEPT = 'kept';
export const keptLine = (letter) => `${letter} kept`; // the phone card
export const keptFromLine = (cycleName) => `kept from ${cycleName}`;
export const HOLD_PREFIX = 'Hold'; // "Hold 35" (G 5: only when the second way was done)
export const CHOOSE = 'Grade…'; // the empty dropdown on a phone line
export const CLEAR = 'Clear'; // the last item of the grade list (G 12)
export const NOT_SAVED_SHORT = 'Not saved';
export const NO_GRADE = 'no grade';
// "Alex Kim, Breaking: D, not saved" — a cell's name for screen readers
export function cellLabel(name, subject, value, { unsaved = false, retest = false, kept = null, late = false, notForAge = false } = {}) {
  if (notForAge) return `${name}, ${subject}: not for this age group`; // new wording, not in the mockups
  const parts = [`${name}, ${subject}: ${value ?? (late ? LATE : NO_GRADE)}`];
  if (kept) parts.push(`kept from ${kept}`);
  if (retest) parts.push('retest');
  if (unsaved) parts.push('not saved');
  return parts.join(', ');
}
export const gradeListLabel = (subject) => `Grade for ${subject}`;
export const countLabel = (name, item) => `${name}, ${item}`;
export const KEPT_NOTE_LABEL = 'Kept grade';
// the kept note (Star's pattern with Black Belt's words)
export const keptNoteTitle = (cycleName, value) => `Kept from ${cycleName} · ${value}`;
export const keptNoteBody = (cycleName) =>
  `Kept grades can’t be changed on this cycle. To correct one, fix it on ${cycleName}, then an admin removes this make-up and adds it again (if it’s still a make-up).`; // new wording, not in the mockups (Star's note, "cycle" for "testing")

// ----- The measured-number editor (G 3–G 5) -----
export const UNIT_WORDS = { in: 'inches', sec: 'seconds', min: 'min (m:ss)', count: 'count', reps: 'reps', kicks: 'kicks' };
// "= A+ · 31 sec or more · all ages"
export const reachedLine = (letter, cutoff, bracket) => [`= ${letter}`, cutoff, bracket].filter(Boolean).join(' · ');
export const EDITOR_HINT = 'Enter: next candidate · Esc: close';
export const EDITOR_HINT_TOUCH = 'Enter: next candidate'; // new wording, not in the mockups (no Esc key on a tablet)
export const WAY_SWITCH_LABEL = (subject) => `Way for ${subject}`; // screen readers // new wording, not in the mockups
export const numberLabel = (name, subject, unitWord) => `${name}, ${subject}, ${unitWord}`; // screen readers
export const EDITOR_LABEL = (name, subject) => `${subject} for ${name}`; // screen readers // new wording, not in the mockups

// ----- Extra points (G 18, G 36) -----
export const keptPlus = (points) => `${plusPoints(points)} kept`; // "+15 kept"
export const ONE_POINT_EACH = '1 point each';
export const pointsEach = (n) => (n === 1 ? ONE_POINT_EACH : `${pointsText(n)} points each`);
// a step rule on the phone card: "320+ → 3 · 375+ → 5 · 400+ → 10"
export const stepsWords = (steps) => steps.map((s) => `${s.at_least}+ → ${pointsText(s.points)}`).join(' · ');
// "Extra +12 · Total 275.5 so far" (the phone card's footer on Extra points)
export const EXTRA_WORD = 'Extra';

// ----- Total and Result (G 7, G 15, G 30; Star's grid words) -----
export const TOTAL_NONE = '—';
export const SO_FAR = 'so far';
export const RESULT_PASSED = 'Passed';
export const RESULT_NOT_STARTED = 'Not started';
export const RESULT_SAVING = 'Saving…';
export const makeupD = (names) => `⚠ Make-up · D in ${names.join(', ')}`;
export const makeupBelow = (passMark) => `⚠ Make-up · below ${pointsText(passMark)}`;
export const CHOOSE_SUBJECTS = 'Choose subjects';
export const ADMIN_CHOOSES = '· an admin chooses subjects';
export const makeupRetests = (names) => `⚠ Make-up · retests ${names.join(', ')}`;
export const leftOf = (left, of) => `${left} of ${of} left`;
export const NO_AGE = 'No age on file'; // new wording, not in the mockups (a row without a date of birth or a kept age)
export const TOTAL_LINE = 'Total';

// ----- The phone: one candidate at a time (G 10) -----
export const PREVIOUS_CANDIDATE = 'Previous candidate';
export const NEXT_CANDIDATE = 'Next candidate';
export const pickerText = (name, group) => (group ? `${name} · ${group}` : name);
export const pickerLabel = (name) => `Candidate: ${name}. Choose another`;
export const pickerTitle = (danLabel, n) => `${danLabel} · ${n} ${n === 1 ? 'candidate' : 'candidates'}`;
export const PICKER_SUB = 'Pick who to grade';
export const CANCEL = 'Cancel';

// ----- Answers that are never retried (Star's H2 pattern; banner with ✕ only) -----
export const KEPT_REFUSED = 'That grade was kept from an earlier cycle, so it can’t be changed here. Your change wasn’t saved.'; // new wording, not in the mockups ("cycle" for Star's "testing")
export const movedElsewhere = (name, what) => `${name} was moved to another Dan on another device. Your ${what} wasn’t saved.`; // new wording, not in the mockups
export const removedFromCycle = (name, what) => `${name} was removed from this cycle. Your ${what} wasn’t saved.`; // new wording, not in the mockups
export const reloadedAfter = (what) => `That ${what} couldn’t be saved. The grid has been reloaded.`; // Star's words ("grade" / "count")
export const NUMBER_RANGE = 'Type a number from 0 to 999.'; // G 4

// ----- Choose subjects (G 21–G 23, admins) -----
export const chooseTitle = (name) => `Make-up subjects for ${name}`;
// "260 of 339 + 3 extra = 263 · 275 needed · no D. Lowest grades are ticked to start."
export function chooseSub({ base, maximum, extra, total, passMark, hasExtra }) {
  const sum = hasExtra ? `${pointsText(base)} of ${pointsText(maximum)} + ${pointsText(extra)} extra = ${pointsText(total)}` : `${pointsText(total)} of ${pointsText(maximum)}`;
  return `${sum} · ${pointsText(passMark)} needed · no D. Lowest grades are ticked to start.`;
}
// the line of one subject: "Physical · 3 credits · 11:30 min"
export const chooseLine = (partName, creditsN, measured) => [partName, creditsWords(creditsN), measured].filter(Boolean).join(' · ');
export const bestCaseLine = (total, passMark) => `If the ticked subjects all get A+: ${pointsText(total)} (${pointsText(passMark)} needed).`;
export const chooseNote = (firstName) => `${firstName} retests the ticked subjects at a later cycle (no fee). The rest keep their grades.`;
export const CHOOSE_NONE = 'Tick at least one subject.'; // Star v0.513's line
export const CHOOSE_ALREADY_ADDED = (firstName) =>
  `${firstName}’s make-up is already on a later cycle, so the subjects can’t change here.`; // new wording, not in the mockups
export const SUBJECTS_LABEL = 'Subjects to retest';
export const SAVE = 'Save';
export const SAVING = 'Saving…';
export const CLOSE = 'Close';

// ----- The printed sheet (G 33–G 35; Star v0.512's layout) -----
export const BLACK_BELT_TESTING = 'Black Belt testing';
// "Spring 2027 Black Belt testing · 1st Dan · Physical grading sheet"
export const sheetTitle = (cycleName, danLabel, what) => `${cycleName} ${BLACK_BELT_TESTING} · ${danLabel} · ${what} grading sheet`;
export const SHEET_CONTINUED = '(continued)';
export const BOTH_SCHOOLS = 'both schools';
export const secondPartWords = (time, place) => `second part ${time} · ${place}`;
export const sheetWhenLine = (parts) => parts.filter(Boolean).join(' · ');
export const handInDueWords = (dueText) => `Hand-in work due ${dueText}`; // new wording, not in the mockups (Other requirements' sheet)
export const SHEET_JUDGE = 'Judge:';
export const SHEET_MEASURED_HELP = 'Write the number measured. The dashboard works out each grade from the cut-offs for the candidate’s age group.';
export const SHEET_MINUTES_HELP = (names) => `${names}: minutes and seconds (m:ss).`; // "Mile: minutes and seconds (m:ss)."
export const sheetGradesHelp = (letters) => `Grades: ${letters.join(' · ')}.`;
export const sheetWriteNumber = (name, unit) => `${name}: write the number${unit ? ` (${unit})` : ''}.`; // "Target kick (30 sec): write the number (kicks)." // new wording, not in the mockups
export const SHEET_DASH_HELP = '— = not for this age group.';
export const SHEET_KEPT_HELP = 'Gray = kept from an earlier cycle.';
export const SHEET_EXTRA_HELP = 'Write the count for each item. The dashboard works out the points.'; // new wording, not in the mockups (G 35 "write the count")
export const SHEET_WAYS = (names) => names.join(' · '); // "Pull-up · Hold" to circle
export const SHEET_ADDED_ON_DAY = 'Added on the day:';
export const sheetMakeupBand = (n) => `Make-ups · ${n} — only the blank subjects are graded`;
export const sheetFootLeft = (what, printedText) => `${what} · printed ${printedText}`;
export const sheetFootWhat = (cycleName, danLabel) => `${cycleName} ${BLACK_BELT_TESTING} · ${danLabel}`;
export const sheetPage = (n, of) => `Page ${n} of ${of}`;
