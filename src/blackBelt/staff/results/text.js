// text.js — every word of Black Belt testing's Results tab, its printed results sheet, its CSV
// toast, and the "Result emails" block + "Edit result email" dialog on Rubric and prices
// (migration 0025, contract 0025 §14.3 / §14.4).
// Why it exists: wording lives in one place, never inline in the screens (the house rule). The
// sentences are copied from Star testing's Results (src/lib/star/resultsText.js) with Black Belt's
// names, exactly as the approved Results mockups R01–R06 draw them (proposals 1–49 — the numbers
// below are those item numbers). Lines marked `// new wording, not in the mockups` are wording the
// build needed for a case the mockups don't draw; they follow the same pattern and are for Jeffrey
// to confirm in the preview.
//
// Dates are 'YYYY-MM-DD' text, shown US style ("Jun 7", "Sat, Apr 3"), read as calendar dates so
// they never shift a day because of time zones (the helpers of ../text.js).
import { DAN_LABELS, DAN_SHORT, monthDay, monthDayYear, weekdayMonthDay, schoolName } from '../text.js';
import { joinNames, trimScaleText } from '../../../lib/blackBelt/grading.js';
import { MAX_RESULT_TEXT_LENGTH } from '../../../lib/blackBelt/resultEmail.js';
import { bracketLabel } from '../../../lib/blackBelt/rubric.js';

export { schoolName };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const num = (n) => trimScaleText(n); // 305.75 → "305.75", 263.00 → "263"

export const TAB_RESULTS = 'Results';
export const danLabel = (dan) => DAN_LABELS[dan] ?? '';

// ----- The bar (proposals 2, 3, 9) -----
export const PRINT_RESULTS = 'Print results'; // ti-printer
export const DOWNLOAD_CSV = 'Download CSV'; // ti-download, admins only
export const DAN_SWITCH_LABEL = 'Dan'; // screen readers: the switch's name
export const DAN_WORD = 'Dan'; // dropped at 320px: "1st 5" (proposal 9)
export const danShort = (dan) => DAN_SHORT[dan] ?? '';
export const danChoiceLabel = (dan, count) => `${danLabel(dan)}, ${plural(count, 'candidate', 'candidates')}`; // new wording, not in the mockups (screen readers only)
// "1st Dan · 5 candidates · 1 passed · 3 make-ups · 1 not finished" — the three counts always show
export function summaryRest(counts) {
  return [
    '',
    plural(counts.candidates, 'candidate', 'candidates'),
    `${counts.passed} passed`,
    plural(counts.makeup, 'make-up', 'make-ups'),
    `${counts.notFinished} not finished`,
  ].join(' · ');
}
// A one-school device (proposal 30)
export const showingSchoolOnly = (school) => `Showing ${school} candidates only`;
export const SHOW_BOTH_SCHOOLS = 'Show both schools';

// ----- The column headings (proposal 9) -----
export const COL_CANDIDATE = 'Candidate';
export const COL_TOTAL = 'Total';
export const COL_RESULT = 'Result';
export const ACTIONS_COL = 'Actions'; // new wording, not in the mockups (screen readers only)

// ----- A row (proposals 5–8, 10) -----
export const TAG_PASSED = 'Passed'; // green
export const TAG_MAKEUP = 'Make-up'; // amber, with ⚠
export const TAG_NOT_FINISHED = 'Not finished'; // gray
export const STATUS_WORD = { passed: 'Passed', makeup: 'Make-up', not_finished: 'Not finished', no_age: 'Not finished', withdrawn: 'Withdrawn' };
// Total: "305.75", "275.5 so far", "—"; under it "pass 275" (the row's own bracket, never the age)
export const TOTAL_NONE = '—';
export const SO_FAR = 'so far';
export const passMarkLine = (mark) => `pass ${num(mark)}`;
// Phones: "Total 305.75 · pass 275" / "Total 275.5 so far · pass 275"
export const phoneTotalWord = 'Total';
// The gray line under a carried-in make-up's name (proposal 7)
export const makeupFrom = (cycleName) => `Make-up from ${cycleName}`;
// The reasons (proposal 6)
export const earnsDan = (dan) => `Earns ${danLabel(dan)}`;
export const dIn = (names) => `D in ${names.join(', ')}`;
export const belowFirst = (mark) => `Below ${num(mark)}`;
export const belowAfterD = (mark) => `below ${num(mark)}`;
export const retests = (names) => `retests ${names.join(', ')}`;
export const ADMIN_CHOOSES = 'an admin chooses subjects';
export const CHOOSE_SUBJECTS = 'Choose subjects'; // the admins' link (G 21–23)
export const chooseSubjectsLabel = (name) => `Choose subjects for ${name}`; // new wording, not in the mockups (screen readers only)
export const NO_AGE = 'No date of birth on file, so the pass mark can’t be worked out.'; // new wording, not in the mockups
// The sent line (proposals 15, 16, 33)
export const NOT_SENT_YET = 'Not sent yet';
// "Sent Jun 7 · Staff"; seen in a later year "Sent Jun 7, 2027 · Staff" (R04, years later)
export const sentOn = (day, who, withYear) => `Sent ${withYear ? monthDayYear(day) : monthDay(day)}${who ? ` · ${who}` : ''}`;
// "Not sent yet · an earlier Passed result was sent Jun 7"
export const earlierSent = (status, day) => `${NOT_SENT_YET} · an earlier ${STATUS_WORD[status] ? `${STATUS_WORD[status]} result` : 'result'} was sent ${monthDay(day)}`;
export const NO_EMAIL_ON_FILE = 'No email on file — deleted after the keeping time.';
// After Email result (proposal 14): page memory only
export const MESSAGE_COPIED_MOUSE = 'Message copied — paste it into the email (Ctrl+V).';
export const MESSAGE_COPIED_TOUCH = 'Message copied — paste it into the email (press and hold → Paste).';
export const ANNOUNCE_COPIED = 'Message copied'; // new wording, not in the mockups (screen readers only)
export const EMAIL_OPENED = 'Email opened — did you send it?';

// ----- Buttons and the ⋯ menu (proposals 8, 15, 17) -----
export const EMAIL_RESULT = 'Email result'; // ti-mail
export const MARK_AS_SENT = 'Mark as sent'; // ti-mail-check in ⋯
export const UNDO = 'Undo';
export const OPEN_GRADES = 'Open grades'; // ti-school
export const UNDO_MARK_AS_SENT = 'Undo Mark as sent'; // ti-arrow-back-up, admins
export const UNDO_STAFF_GRAYED = 'Only an admin can undo this now.';
export const moreFor = (name) => `More actions for ${name}`; // screen readers
export const emailResultLabel = (name) => `Email result for ${name}`; // screen readers
export const markSentLabel = (name) => `Mark as sent for ${name}`; // screen readers
export const tableLabel = (dan) => `${danLabel(dan)} results`; // new wording, not in the mockups (screen readers only)
export const menuSubtitle = (dan, school) => `${danLabel(dan)} · ${school}`; // new wording, not in the mockups (phone sheet's gray line)

// ----- Lines above the list (proposals 32, 35, 36) -----
export const NO_GRADES_YET = 'No grades yet. Results fill in as grades are entered on the Grading tab.';
export const OFFLINE = 'You’re offline. These results may be out of date. Email result, Mark as sent, Print results and Download CSV need a connection.';
export const EMAIL_OFF_HIDDEN = 'Email result is off on this device. Email results at the desk.';

// ----- Loading and empty (proposals 31, 37) -----
export const LOADING_RESULTS = 'Loading results…'; // screen readers
export const LOAD_FAILED = 'Couldn’t load the results. Check the connection, then try again.'; // + Retry
// The empty Dan on a one-school device: the link sits inside the sentence.
export const emptyOneSchoolParts = (school, dan) => [`No ${school} ${danLabel(dan)} candidates. `, SHOW_BOTH_SCHOOLS, ' to see the rest.'];
export const emptyDanBoth = (dan) => `No ${danLabel(dan)} candidates. Add candidates on the Candidates tab.`;

// ----- Email result's banners (proposal 19) -----
export const COPY_BLOCKED = 'Couldn’t copy the message, so the email opened empty. Close it and try Email result again.';
export const addressFailed = (name) => `Couldn’t get ${name}’s email address. Check the connection, then try again.`; // + Retry
export const MESSAGE_NOT_READY = 'Couldn’t build the message. Check the connection, then try again.'; // new wording, not in the mockups (Star's)
// Email result refused by the database at the click (nothing opens). new wording, not in the mockups
export function emailRefusal(status, name) {
  switch (status) {
    case 'stale': return `${name}’s result changed just now, so the email wasn’t opened. Check the new result, then email it again.`; // new wording, not in the mockups
    case 'not_finished': return `${name}’s result can’t be emailed now, so the email wasn’t opened.`; // new wording, not in the mockups
    case 'no_email': return `No email on file for ${name} — deleted after the keeping time.`; // new wording, not in the mockups
    case 'withdrawn': return `${name} was removed from this cycle. The email wasn’t opened.`; // new wording, not in the mockups
    case 'not_found': return `${name} was deleted on another device. The email wasn’t opened.`; // new wording, not in the mockups
    default: return addressFailed(name);
  }
}

// ----- Mark as sent and its Undo (proposals 15, 18, 19) -----
export const markedAsSent = (name) => `Marked as sent · ${name}`; // the toast, with Undo
export function markSentRefusal(status, name) {
  switch (status) {
    case 'stale':
    case 'invalid':
      return `${name}’s result changed just now, so it wasn’t marked as sent. Check the new result, then email it again.`;
    case 'not_finished': return `${name}’s result isn’t finished any more, so it wasn’t marked as sent.`;
    case 'withdrawn': return `${name} was removed from this cycle. It wasn’t marked as sent.`;
    case 'not_found': return `${name} was deleted on another device. Nothing was marked.`;
    case 'no_email': return `No email on file for ${name}, so it wasn’t marked as sent.`; // new wording, not in the mockups
    default: return `Couldn’t mark ${name} as sent. Check the connection, then try again.`; // + Retry
  }
}
export function undoSentRefusal(status) {
  switch (status) {
    case 'stale': return 'That was already undone.';
    case 'not_allowed': return 'Too late to undo here. Ask an admin to undo Mark as sent.';
    case 'not_found': return 'That send record isn’t there any more. Nothing was changed.';
    case 'invalid': return 'That couldn’t be undone. The list has been reloaded.';
    default: return 'Couldn’t undo Mark as sent. Check the connection, then try again.';
  }
}
export const undoConfirmTitle = (name) => `Undo Mark as sent for ${name}?`;
export const undoConfirmBody = (day) =>
  `This removes the ${monthDay(day)} send record. The row then shows the send before it, if there was one — otherwise “Not sent yet”. Use this only if the email wasn’t really sent.`;
export const UNDO_CONFIRM_GO = 'Undo Mark as sent';
export const CANCEL = 'Cancel';

// ----- Print results and Download CSV (proposals 43, 46) -----
export const PRINT_FAILED = 'Couldn’t load the results to print. Check the connection, then try again.'; // new wording, not in the mockups (+ Retry)
export const csvDownloaded = (fileName, n) =>
  `Downloaded ${fileName} (${plural(n, 'candidate', 'candidates')}). It has dates of birth, emails and payments — keep it private.`;
export const CSV_FAILED = 'Couldn’t download the CSV. Check the connection, then try again.'; // + Retry
export const CSV_NOT_ALLOWED = 'Only an admin can download the CSV.';

// ----- The printed results sheet (R05, proposals 38–44) -----
export const sheetTitle = (cycleName) => `${cycleName} Black Belt testing — Results`;
export const SHEET_CONTINUED = '(continued)';
const BOTH_SCHOOLS = 'Worcester and Shrewsbury';
// "Testing days Sat, Apr 3 · Sat, May 1 · Sat, Jun 5, 2027 · Worcester and Shrewsbury"
export function sheetSub(dates) {
  const list = dates.map((d, i) => (i === dates.length - 1 ? `${weekdayMonthDay(d)}, ${d.slice(0, 4)}` : weekdayMonthDay(d)));
  return list.length > 0 ? `Testing days ${list.join(' · ')} · ${BOTH_SCHOOLS}` : BOTH_SCHOOLS;
}
// The Dan band: "Pass mark 275 (17 and under) · 293 (18 and over), and no D" / "Pass mark 261, and no D"
export function bandPassMarks(brackets, noD) {
  const list = (brackets ?? []).filter((b) => Number.isFinite(b?.pass_mark));
  if (list.length === 0) return '';
  const marks = list.length === 1 ? num(list[0].pass_mark) : list.map((b) => `${num(b.pass_mark)} (${bracketLabel(b)})`).join(' · ');
  return `Pass mark ${marks}${noD ? ', and no D' : ''}`;
}
export const SECTION = {
  passed: 'Passed — congratulations!',
  makeup: '⚠ Make-up',
  not_finished: '⚠ Not finished yet',
};
export const PASS = 'PASS';
export const sheetSoFar = (mark) => (mark === null || mark === undefined ? SO_FAR : `${SO_FAR} · ${passMarkLine(mark)}`);
export const needs = (names) => `Needs: ${names.join(', ')}`;
export const NEEDS_TO_BE_DECIDED = 'Needs: to be decided';
export const stillToHandIn = (names) => `Still to hand in: ${names.join(', ')}`;
// "Still to grade: Korean terminology" (one or two) · "Still to grade: 11 subjects" (none graded) ·
// "Still to grade: 8 of 13 subjects" (Star's words)
export function stillToGrade(names, total) {
  if (names.length === 0) return '';
  if (names.length === total) return `Still to grade: ${plural(total, 'subject', 'subjects')}`;
  if (names.length <= 2) return `Still to grade: ${names.join(', ')}`;
  return `Still to grade: ${names.length} of ${total} subjects`;
}
export const sheetFootLeft = (cycleName, printedText) => `${sheetTitle(cycleName)} · printed ${printedText}`;
export const sheetPage = (n, of) => `Page ${n} of ${of}`;

// ===== The "Result emails" block on Rubric and prices (R03, proposals 21–28) =====
export const RESULT_EMAILS_TITLE = 'Result emails';
export const RESULT_EMAILS_SUB = 'What Email result copies for each family (Results tab). Blanks in {braces} fill in for each candidate.';
export const SUBJECT_LABEL = 'Subject';
export const SUBJECT_FIXED_NOTE_INLINE = 'the same for every email; it can’t be changed.'; // after " · "
export const SUBJECT_FIXED_NOTE = 'The same for every email; it can’t be changed.'; // phones: on its own line
export const TEXTS_USED_WHEN_CLICKED = 'Email result always uses these texts as they are when it’s clicked.';
export const KIND_NAME = { passed: 'Passed', makeup_d: 'Make-up with a D', makeup_below: 'Make-up below the pass mark' };
export const editTextLabel = (kind) => `Edit the ${KIND_NAME[kind]} email`; // screen readers
export const TEXTS_LOAD_FAILED = 'Couldn’t load the result emails. Check the connection, then try again.'; // new wording, not in the mockups (+ Retry)

// ----- The "Edit result email" dialog (proposals 24, 25, 27) -----
export const EDIT_RESULT_EMAIL = 'Edit result email';
export const KIND_USE = {
  passed: 'Used for every Passed result.', // new wording, not in the mockups (Star's)
  makeup_d: 'Used for a D in any subject — also when the total is below the pass mark.',
  makeup_below: 'Used for a total below the pass mark with no D, once an admin has chosen the subjects.', // new wording, not in the mockups (Star's)
};
export const MESSAGE_LABEL = 'Message';
export const RESET_TO_STARTING_TEXT = 'Reset to the starting text';
export const INSERT_A_BLANK = 'Insert a blank';
export const insertBlankLabel = (name) => `Insert {${name}}`; // screen readers
export const BLANKS_HINT = `Type a blank in braces, or click one to insert it where the cursor is. Up to ${MAX_RESULT_TEXT_LENGTH.toLocaleString('en-US')} characters.`;
export const BLANKS_HINT_TOUCH = `Type a blank in braces, or tap one to insert it where the cursor is. Up to ${MAX_RESULT_TEXT_LENGTH.toLocaleString('en-US')} characters.`;
export const PREVIEW_WITH = 'Preview with';
export const PREVIEW_NEEDS_NO_ERRORS = 'The preview shows once the text has no errors.';
export const PREVIEW_LOADING = 'Loading the preview…'; // new wording, not in the mockups
// No candidate of this kind in any cycle yet: a made-up candidate (Star's)
export const SAMPLE_CANDIDATE = { firstName: 'Sam', lastName: 'Example' }; // new wording, not in the mockups
export const SAMPLE_NOTE = 'a made-up candidate (no real one has this result yet)'; // new wording, not in the mockups
export const SAMPLE_CYCLE_NAME = 'Black Belt testing'; // new wording, not in the mockups
export const RESULT_TEXT_SAVED = 'Result email saved'; // toast, with Undo
export const TOAST_UNDONE = 'Undone';
export const SAVE = 'Save';
export const SAVING = 'Saving…';
export const UNSAVED = 'Unsaved changes. Save or cancel first.';
export const DISCARD_CHANGES = 'Discard changes';
export const TEXT_STALE = 'Someone else changed this just now. Your change wasn’t saved. Cancel, then open it again to see the latest.'; // new wording, not in the mockups (Star's)
export const TEXT_STALE_PHONE = 'Someone else changed this just now. Your change wasn’t saved. Discard changes, then open it again to see the latest.'; // new wording, not in the mockups (Star's)
export const TEXT_NOT_ALLOWED = 'Only an admin can change Rubric and prices. Your change wasn’t saved.'; // new wording, not in the mockups (Star's)
export const TEXT_INVALID = 'This text can’t be saved. Check the message under the box.'; // new wording, not in the mockups
export const TEXT_SAVE_FAILED = 'Couldn’t save. Check the connection, then try again.';
export const UNDO_FAILED = 'Undo didn’t save. Check the connection, then retry.';
export const UNDO_STALE = 'Couldn’t undo. Someone else changed this email text just now.'; // new wording, not in the mockups
// Where a blank works, for "{D subjects} only works in a Make-up with a D email."
const BLANK_HOME = {
  'subjects to work on': 'a make-up email',
  'D subjects': 'a Make-up with a D email',
  'below-pass-mark note': 'a Make-up with a D email',
};
// The message under the box for resultEmail.resultTextProblemDetail's problem. The unknown-blank
// one is the mockups'; the others are Star's (new wording, not in the mockups).
export function resultTextProblemText(problem) {
  if (!problem) return null;
  switch (problem.code) {
    case 'unknown_blank': return `{${problem.blank}} isn’t one of the blanks. Check the spelling, or pick one below.`;
    case 'blank_not_for_kind': return `{${problem.blank}} only works in ${BLANK_HOME[problem.blank] ?? 'another kind of email'}.`; // new wording, not in the mockups
    case 'missing_required':
      return problem.blank === 'subjects to work on'
        ? 'A make-up email has to say what to work on. Add {subjects to work on}.' // new wording, not in the mockups
        : `Every result email gives the total and the pass mark. Add {${problem.blank}}.`; // new wording, not in the mockups
    case 'too_long': return `Keep it to ${MAX_RESULT_TEXT_LENGTH.toLocaleString('en-US')} characters or fewer${problem.length ? ` (it has ${problem.length.toLocaleString('en-US')})` : ''}.`; // new wording, not in the mockups
    case 'bad_character': return 'It has a hidden character that can’t be used. Retype the part you pasted.'; // new wording, not in the mockups
    case 'first_line': return 'The first line can’t be empty. Start with the greeting, for example “Hello,”.'; // new wording, not in the mockups
    case 'stray_brace': return 'A { or } is left over. Finish the blank, for example {first name}, or remove the brace.'; // new wording, not in the mockups
    case 'empty': return 'Write the email text.'; // new wording, not in the mockups
    default: return 'This text can’t be saved.'; // new wording, not in the mockups
  }
}
// The names used in sentences built from a list of subjects ("Breaking and Meditation")
export { joinNames };
