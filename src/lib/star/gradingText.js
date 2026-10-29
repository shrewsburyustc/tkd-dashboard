// gradingText.js — the words of Star testing GRADING (build phase 5): the Result column, the save
// states, the page banner, the offline banner, the leave question, the kept-grade note and the
// banners for answers that are never retried.
// Why it exists: the data layer (gradingApi.js) and the save engine (useStarGradingSaves.js) only
// deal in codes and numbers. The approved sentences live here, in one place, so the Grading tab, the
// private grading page and the Node checks (gradingChecks.mjs) all use exactly the same words.
// Source: the approved Phase 5 gap mockups (rulebook v0.512, `TKD-StarTesting-Phase5-Gap-Mockups.html`,
// its "Proposals to confirm (31)" box), which reuse Color Belt's LIVE grading wording
// (src/screens/testing/text.js, v0.192) with "grades" and "counts". Lines marked "approved v0.513" follow
// the same pattern but are not in any mockup — Jeffrey approved them in the preview (rulebook v0.513).
//
// The screens' own labels (column headings, buttons, hints) stay in their own text.js files.

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
// "Zoe Park and Sam Diaz" / "Ava Chen, Leo Brown and Nora Kim"
export function joinNames(names) {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
// A score as the database sends it: 280 → "280", 227.5 → "227.5".
export const scoreText = (n) => (Number.isFinite(n) ? String(Math.round(n * 10) / 10) : '');

// "3 grades and 1 count" / "2 grades" / "1 count" ('' when both are 0).
export function gradesAndCounts(grades, counts) {
  const parts = [];
  if (grades > 0) parts.push(plural(grades, 'grade', 'grades'));
  if (counts > 0) parts.push(plural(counts, 'count', 'counts'));
  return parts.join(' and ');
}

// ----- The Result column (proposal 25, H6; the Results tab's words, v0.138) -----
export const RESULT_PASSED = 'Passed'; // green
export const RESULT_NOT_STARTED = 'Not started'; // gray
export const RESULT_SAVING = 'Saving…'; // gray: Not saved cells being sent again by themselves (proposal 4)
export const RESULT_WITHDRAWN = 'Withdrawn'; // approved v0.513 (not in the mockups) (a withdrawn row never shows on the grid)
// amber, a D: "⚠ Make-up · D in Breaking" / "⚠ Make-up · D in Breaking, Knowledge"
export const makeupD = (subjects) => `⚠ Make-up · D in ${subjects.join(', ')}`;
// amber, below the pass mark, nothing chosen yet: "⚠ Make-up · below 245" + the admin link…
export const makeupBelow = (passMark) => `⚠ Make-up · below ${scoreText(passMark)}`;
export const CHOOSE_SUBJECTS = 'Choose subjects'; // …the admin's link after it
export const ADMIN_CHOOSES = '· an admin chooses subjects'; // …or, for staff, this gray text after it
// amber, after an admin chose: "⚠ Make-up · retests Breaking, Knowledge"
export const makeupRetests = (subjects) => `⚠ Make-up · retests ${subjects.join(', ')}`;
// gray: "7 of 11 left"
export const leftOf = (left, of) => `${left} of ${of} left`;
// amber: "⚠ Not saved · 2 grades" / "⚠ Not saved · 1 count" / "⚠ Not saved · 2 grades and 1 count"
export const notSavedTag = (grades, counts) => `⚠ Not saved · ${gradesAndCounts(grades, counts)}`;
// Under a Not saved subject on a phone line / the private page (proposal 19)
export const NOT_SAVED_SHORT = '⚠ Not saved';

// Total: the database's total; a make-up's running total "250 so far" (v0.129); "—" otherwise while
// the row isn't complete (proposal 2).
export const totalSoFar = (n) => `${scoreText(n)} so far`;
export const TOTAL_NONE = '—';

// The Assistant Instructor grade under the Assistant classes box: "= A" (grid) / "Assistant Instructor: A"
export const aiUnderCount = (letter) => `= ${letter}`;
export const aiLine = (letter) => `Assistant Instructor: ${letter}`;

// ----- Screen readers (the polite live region) -----
export const ANNOUNCE_SAVED = 'Saved';
export const ANNOUNCE_NOT_SAVED = 'Not saved';

// ----- The page banner (proposals 3 and 6) -----
// "Couldn’t save 3 grades and 1 count (Mia Patel, Noah Chen and Ethan Lopez). Check the connection,
// then try again." — names up to three candidates, then "and N more". + Retry and ✕.
export function namesUpToThree(names) {
  if (names.length <= 3) return joinNames(names);
  return `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;
}
export function saveFailedBanner(grades, counts, names) {
  const who = names.length > 0 ? ` (${namesUpToThree(names)})` : '';
  return `Couldn’t save ${gradesAndCounts(grades, counts)}${who}. Check the connection, then try again.`;
}
// "You’re offline. 9 grades and 1 count aren’t saved yet. They save by themselves when the connection
// is back. Keep this page open." + Retry.
export function offlineBanner(grades, counts) {
  const n = grades + counts;
  if (n === 0) return 'You’re offline. Grades you choose save by themselves when the connection is back. Keep this page open.'; // approved v0.513 (not in the mockups)
  return `You’re offline. ${gradesAndCounts(grades, counts)} ${n === 1 ? 'isn’t' : 'aren’t'} saved yet. They save by themselves when the connection is back. Keep this page open.`;
}
export const RETRY = 'Retry';

// ----- A retry dropped because the cell changed on another device (proposal 4) — gray, under the cell
export const CHANGED_ELSEWHERE_GRADE = 'Changed on another device — your grade wasn’t saved.';
export const CHANGED_ELSEWHERE_COUNT = 'Changed on another device — your count wasn’t saved.'; // approved v0.513 (not in the mockups)

// ----- Answers that are never retried (H2, proposals 10–12): banner with ✕ only, the grid reloads
export const KEPT_REFUSED = 'That grade was kept from an earlier testing, so it can’t be changed here. Your change wasn’t saved.';
// "Jordan Kim was moved to 2nd Dan on another device. Your grade wasn’t saved."
export const movedToDan = (name, danLabel) => `${name} was moved to ${danLabel} on another device. Your grade wasn’t saved.`;
// stale when the new Dan couldn't be read (not in the mockups, approved v0.513)
export const changedElsewhereRow = (name) => `${name} was changed on another device. Your grade wasn’t saved.`;
// "Mia Patel was removed from this testing. Your grade wasn’t saved."
export const removedFromTesting = (name) => `${name} was removed from this testing. Your grade wasn’t saved.`;
export const GRADE_RELOADED = 'That grade couldn’t be saved. The grid has been reloaded.'; // invalid / not_found
// a count refused the same way (not in the mockups, approved v0.513)
export const removedFromTestingCount = (name) => `${name} was removed from this testing. Your count wasn’t saved.`;
export const COUNT_RELOADED = 'That count couldn’t be saved. The grid has been reloaded.';

// ----- The leave question (proposal 7; Color Belt v0.192) -----
// "3 grades and 1 count aren’t saved" / "1 grade isn’t saved"
export const leaveTitle = (grades, counts) => `${gradesAndCounts(grades, counts)} ${grades + counts === 1 ? 'isn’t' : 'aren’t'} saved`;
// people = [{ name, items: ['Breaking', 'Knowledge'] }] (items: subject names, "Classes attended",
// "Assistant classes") → "Mia Patel (Korean Terminology), Noah Chen (Breaking, Knowledge) and Ethan
// Lopez (Assistant classes) weren’t saved because the connection dropped. If you leave now, they’re
// lost. Stay, and they’ll save when the Wi-Fi is back."
export function leaveBody(people) {
  const total = people.reduce((n, p) => n + p.items.length, 0);
  const who = joinNames(people.map((p) => `${p.name} (${p.items.join(', ')})`));
  return `${who} ${total === 1 ? 'wasn’t' : 'weren’t'} saved because the connection dropped. If you leave now, they’re lost. Stay, and they’ll save when the Wi-Fi is back.`;
}
export const LEAVE_ANYWAY = 'Leave anyway'; // right, red (D1c, DR G5)
export const STAY_ON_PAGE = 'Stay on this page'; // left, plain, the default (Enter, Esc, backdrop, Back)
export const COUNT_CLASSES_ATTENDED = 'Classes attended';
export const COUNT_ASSISTANT_CLASSES = 'Assistant classes';

// ----- A kept make-up grade (proposal 9, OPEN-9) -----
// The note's title: "Kept from Spring 2026 · A"
export const keptNoteTitle = (eventName, grade) => `Kept from ${eventName} · ${grade}`;
export const keptNoteBody = (eventName) =>
  `Kept grades can’t be changed on this testing. To correct one, fix it on ${eventName}, then an admin removes this make-up and adds it again (if it’s still a make-up).`;
export const keptCellLabel = 'kept'; // under the gray letter in the grid
export const keptLine = (grade) => `${grade} kept`; // phone: "B+ kept" (no ▾)
export const keptFromLine = (eventName) => `kept from ${eventName}`; // phone: under the subject

// ----- Choose subjects (v0.130; the dialog waits for the answer) — not in the mockups, approved v0.513 -----
export const CHOOSE_STALE = 'Someone else chose the subjects just now. Your choice wasn’t saved. Close this to see the latest.';
export const CHOOSE_NOT_ALLOWED = 'Only an admin can choose the subjects to retest.';
export const CHOOSE_INVALID = 'This result no longer needs a choice. Close this to see the latest.';
export const CHOOSE_FAILED = 'Couldn’t save. Check the connection, then try again.';
