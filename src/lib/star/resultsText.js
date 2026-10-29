// resultsText.js — the words of Star testing RESULTS (build phase 6): the summary line, the Result
// column's tag and reason, the sent line, Email result's banners, Mark as sent's toast and refusals,
// the CSV's toast and banners, the loading / empty lines, and the result-email editor's messages.
// Why it exists: the data layer (resultsApi.js) and the rules (resultsCore.js) only deal in codes and
// numbers. The approved sentences live here, in one place, so the Results tab, the Rubrics and prices
// editor and the Node checks (resultsChecks.mjs) all use exactly the same words.
// Source: the approved Phase 6 gap mockups (rulebook v0.514, `TKD-StarTesting-Phase6-Gap-Mockups.html`,
// its "Proposals (53)" box — the numbers below are its item numbers). Lines marked "not in the
// mockups" are wording the builders needed for a case the mockups don't draw; they follow the same
// pattern and are for Jeffrey to confirm in the preview.
//
// Dates are 'YYYY-MM-DD' text, shown US style ("Nov 16", "Tue, Dec 1"); read as calendar dates, so
// they never shift a day because of time zones.
import { monthDay, weekdayMonthDay } from './eventsText.js';
import { startTimeLabel } from './starEventRules.js';
import { scoreText, joinNames } from './gradingText.js';
import { ordinal, MAX_RESULT_TEXT_LENGTH } from './resultEmail.js';

export { monthDay };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const SCHOOL = { worcester: 'Worcester', shrewsbury: 'Shrewsbury' };
export const schoolName = (code) => SCHOOL[code] ?? '';

// ----- The summary line (3) -----
// "1st Dan · 8 candidates · 3 passed · 2 make-ups · 2 not finished · 1 testing privately"
// Passed, make-ups and not finished always show ("0 passed"); testing privately only when there is one.
export function summaryLine(danLabel, counts) {
  const parts = [
    danLabel,
    plural(counts.candidates, 'candidate', 'candidates'),
    `${counts.passed} passed`,
    plural(counts.makeup, 'make-up', 'make-ups'),
    `${counts.notFinished} not finished`,
  ];
  if (counts.testingPrivately > 0) parts.push(`${counts.testingPrivately} testing privately`);
  return parts.join(' · ');
}

// ----- The Result column: the tag (3, 5) -----
export const TAG_PASSED = 'Passed'; // green
export const TAG_MAKEUP = 'Make-up'; // amber (⚠)
export const TAG_NOT_FINISHED = 'Not finished'; // gray
export const TAG_TESTING_PRIVATELY = 'Testing privately'; // gray, ti-calendar-event (not purple, 5)
// The same words for the CSV's Result column (32) and the "an earlier … result" note (25).
export const STATUS_WORD = { passed: 'Passed', makeup: 'Make-up', not_finished: 'Not finished', testing_privately: 'Testing privately' };

// ----- The reason under the tag (4) -----
export const earnsStar = (starsTo) => (starsTo === 1 ? 'Earns 1 star' : `Earns ${ordinal(starsTo)} star`); // "Earns 2nd star"
export const dIn = (subjects) => `D in ${subjects.join(', ')}`; // "D in Breaking"
export const belowFirst = (passMark) => `Below ${scoreText(passMark)}`; // "Below 245 · …"
export const belowAfterD = (passMark) => `below ${scoreText(passMark)}`; // "D in Breaking · below 245 · …"
export const retests = (subjects) => `retests ${subjects.join(', ')}`; // "retests Breaking, Advanced Motion"
export const ADMIN_CHOOSES = 'an admin chooses subjects'; // "Below 245 · an admin chooses subjects"
export const CHOOSE_SUBJECTS = 'Choose subjects'; // the admins' link after it (the Grading dialog, v0.513)
// Not finished: up to two names, more than two a count, none graded, a missing count.
export const notGradedYet = (names) => `${joinNames(names)} not graded yet`; // "Breaking and Knowledge not graded yet"
export const subjectsNotGradedYet = (n) => `${n} subjects not graded yet`;
export const NOTHING_GRADED_YET = 'Nothing graded yet';
export const ASSISTANT_NOT_ENTERED = 'Assistant classes not entered yet';
// Testing privately (5): "Private · Tue, Dec 1 · 4:00 PM"
export const privateWhen = (day, time) => `Private · ${weekdayMonthDay(day)}${time ? ` · ${startTimeLabel(time)}` : ''}`;
// The late-grade suffix (26), joined to the reason with " · "
export const lateOne = (subject, day) => `${subject} graded ${monthDay(day)}`; // "Korean Terminology graded Dec 3"
export const lateMany = (n, day) => `${n} subjects graded ${monthDay(day)}`; // "2 subjects graded Dec 3"
export const privateTestingOn = (day) => `private testing ${monthDay(day)}`; // "private testing Dec 1"

// ----- Total (R1): "280" · "250 so far" (a make-up's running total) · "—"
export const TOTAL_NONE = '—';

// ----- The sent line (R1, 10, 25) -----
export const NOT_SENT_YET = 'Not sent yet';
// "Sent Nov 16 · Staff" / "Sent Nov 16 · Jeffrey" (who = the first word of the name the database kept)
export const sentOn = (day, who) => `Sent ${monthDay(day)} · ${who}`;
// "Not sent yet · an earlier Make-up result was sent Nov 16"
export const earlierSent = (status, day) => `Not sent yet · an earlier ${STATUS_WORD[status] ?? 'result'}${STATUS_WORD[status] ? ' result' : ''} was sent ${monthDay(day)}`;
// After Email result (10): kept in page memory only, until Mark as sent, another Email result or a reload
export const MESSAGE_COPIED_MOUSE = 'Message copied — paste it into the email (Ctrl+V).';
export const MESSAGE_COPIED_TOUCH = 'Message copied — paste it into the email (press and hold → Paste).';
export const ANNOUNCE_COPIED = 'Message copied'; // what screen readers hear
export const EMAIL_OPENED = 'Email opened — did you send it?';

// ----- Buttons and menu items (R1, R5, R7) -----
export const EMAIL_RESULT = 'Email result';
export const MARK_AS_SENT = 'Mark as sent'; // ti-mail-check in ⋯
export const UNDO = 'Undo';
export const OPEN_GRADES = 'Open grades'; // ti-school
export const GRADE_PRIVATE_TESTING = 'Grade private testing'; // ti-school
export const UNDO_MARK_AS_SENT = 'Undo Mark as sent'; // ti-arrow-back-up, admins
export const UNDO_STAFF_GRAYED = 'Only an admin can undo this now.'; // staff see the item grayed (21)
export const PRINT_RESULTS = 'Print results';
export const DOWNLOAD_CSV = 'Download CSV';
// Q4 = A: Hide private details on → Email result grayed, this one line above the list, CSV hidden
export const EMAIL_OFF_WHILE_HIDDEN = 'Email result is off while private details are hidden. Email results at the desk.';

// ----- Email result's banners (R4: 17–19) -----
export const COPY_BLOCKED = 'Couldn’t copy the message, so the email opened empty. Close it and try Email result again.';
export const noEmailOnFile = (name) => `${name} has no email for results. Add it with Edit details on the Candidates tab, then try again.`;
export const addressFailed = (name) => `Couldn’t get ${name}’s email address. Check the connection, then try again.`; // + Retry
// The email text wasn't loaded / the row changed so it gets no email (not in the mockups)
export const MESSAGE_NOT_READY = 'Couldn’t build the message. Check the connection, then try again.';

// ----- Mark as sent (20–24) -----
export const markedAsSent = (name) => `Marked as sent · ${name}`; // the toast, with Undo
// Refusals of Mark as sent: banner with ✕ only (the connection one has Retry). name: "Noah Chen"
export function markSentRefusal(status, name) {
  switch (status) {
    case 'stale':
    case 'invalid': // (only if the screen sent no key — treated as "changed": the list reloads)
      return `${name}’s result changed just now, so it wasn’t marked as sent. Check the new result, then email it again.`;
    case 'not_finished': return `${name}’s result isn’t finished any more, so it wasn’t marked as sent.`;
    case 'withdrawn': return `${name} was removed from this testing. It wasn’t marked as sent.`;
    case 'not_found': return `${name} was deleted on another device. Nothing was marked.`;
    default: return `Couldn’t mark ${name} as sent. Check the connection, then try again.`; // + Retry
  }
}
// Refusals of Undo (24; not_found and the connection one are not in the mockups)
export function undoSentRefusal(status) {
  switch (status) {
    case 'stale': return 'That was already undone.';
    case 'not_allowed': return 'Too late to undo here. Ask an admin to undo Mark as sent.';
    case 'not_found': return 'That send record isn’t there any more. Nothing was changed.';
    case 'invalid': return 'That couldn’t be undone. The list has been reloaded.';
    default: return 'Couldn’t undo Mark as sent. Check the connection, then try again.';
  }
}
// The admins' Undo question (21)
export const undoConfirmTitle = (name) => `Undo Mark as sent for ${name}?`;
export const undoConfirmBody = (day) =>
  `This removes the ${monthDay(day)} send record. The row then shows the send before it, if there was one — otherwise “Not sent yet”. Use this only if the email wasn’t really sent.`;
// Its buttons (shared ConfirmBox, rulebook v0.518, Q1 A): the one that changes nothing, and the
// action's words while it works. (Black Belt's twin box takes the same words.)
export const KEEP_SEND_RECORD = 'Keep send record';
export const UNDOING = 'Undoing…';

// ----- Download CSV (29–33) -----
export const csvDownloaded = (fileName, n) =>
  `Downloaded ${fileName} (${plural(n, 'candidate', 'candidates')}). It has dates of birth, emails and payments — keep it private.`;
export const CSV_FAILED = 'Couldn’t download the CSV. Check the connection, then try again.'; // + Retry
export const CSV_NOT_ALLOWED = 'Only an admin can download the CSV.';
// The 15 column headings, exactly v0.144's, in order (32)
export const CSV_HEADINGS = [
  'Dan', 'Name', 'School', 'Stars from', 'Stars to', 'Date of birth', 'Email', 'Paying by', 'Paid',
  'Classes attended', 'Assistant classes', 'Total', 'Result', 'Needs', 'Result sent',
];
export const PAYING_BY_WORD = { cash: 'Cash', check: 'Check', card: 'Card' };
export const NO_FEE = 'No fee';
export const ADMIN_CHOOSES_CSV = 'Admin chooses'; // Needs, below the pass mark with nothing chosen yet
// "Not sent yet (Make-up sent 2026-11-16)"
export const csvEarlierSent = (status, date) => `${NOT_SENT_YET} (${STATUS_WORD[status] ? `${STATUS_WORD[status]} sent` : 'sent'} ${date})`;

// ----- Loading and empty (40, 41) -----
export const LOAD_FAILED = 'Couldn’t load the results. Check the connection, then try again.'; // + Retry
export const emptyDanOneSchool = (school, danLabel) => `No ${school} ${danLabel} candidates. Show both schools to see the rest.`;
export const emptyDanBoth = (danLabel) => `No ${danLabel} candidates. Add candidates on the Candidates tab.`;

// ----- The result email editor (R11: 42–53) -----
export const RESULT_EMAILS_TITLE = 'Result emails';
export const KIND_LABEL = { passed: 'Passed', makeup_d: 'Make-up with a D', makeup_below: 'Make-up below 245 (subjects chosen)' };
export const SUBJECT_FIXED_NOTE = 'The same for every email; it can’t be changed.';
export const RESET_TO_STARTING_TEXT = 'Reset to the starting text';
export const RESULT_TEXT_SAVED = 'Result email saved'; // toast, with Undo (5 s)
export const SAMPLE_CANDIDATE = { firstName: 'Sam', lastName: 'Example' }; // the preview with no real candidate (49)
export const TEXT_STALE = 'Someone else changed this just now. Your change wasn’t saved. Cancel, then open it again to see the latest.';
export const TEXT_STALE_PHONE = 'Someone else changed this just now. Your change wasn’t saved. Discard changes, then open it again to see the latest.';
export const TEXT_NOT_ALLOWED = 'Only an admin can change Rubrics and prices. Your change wasn’t saved.';
export const TEXT_SAVE_FAILED = 'Couldn’t save. Check the connection, then try again.'; // not in the mockups (the Star dialogs' line)
// The block on Rubrics and prices (R11, 42–45). passMark: the Dans' pass mark when they all share
// one (245); otherwise null → "the pass mark" (not in the mockups — every Dan is 245 today).
export const RESULT_EMAILS_SUB = 'What Email result copies for each family (Results tab). Blanks in {braces} fill in for each candidate.';
export const SUBJECT_LABEL = 'Subject';
export const SUBJECT_FIXED_NOTE_INLINE = 'the same for every email; it can’t be changed.'; // PC / tablet: after " · "
export const TEXTS_USED_WHEN_CLICKED = 'Email result always uses these texts as they are when it’s clicked.'; // Q5 = A
const belowWhat = (passMark) => (passMark === null || passMark === undefined ? 'the pass mark' : scoreText(passMark));
// The row names, exactly as the block draws them: "Passed" · "Make-up with a D" · "Make-up below 245"
export function kindName(kind, passMark) {
  if (kind === 'passed') return 'Passed';
  if (kind === 'makeup_d') return 'Make-up with a D';
  return `Make-up below ${belowWhat(passMark)}`;
}
export const editTextLabel = (kind, passMark) => `Edit the ${kindName(kind, passMark)} email`; // the Edit icon's name
// Not in the mockups (the block couldn't load its texts; the rest of the tab still works)
export const TEXTS_LOAD_FAILED = 'Couldn’t load the result emails. Check the connection, then retry.';
// The dialog (47–51)
export const EDIT_RESULT_EMAIL = 'Edit result email';
export function kindUse(kind, passMark) {
  const b = belowWhat(passMark);
  if (kind === 'passed') return 'Used for every Passed result.';
  if (kind === 'makeup_d') return `Used for a D in any subject — also when the total is below ${b}.`;
  return `Used for a total below ${b} with no D, once an admin has chosen the subjects.`;
}
export const MESSAGE_LABEL = 'Message';
export const INSERT_A_BLANK = 'Insert a blank';
export const insertBlankLabel = (name) => `Insert {${name}}`; // each button's screen-reader name
export const BLANKS_HINT = `Type a blank in braces, or click one to insert it where the cursor is. Up to ${MAX_RESULT_TEXT_LENGTH.toLocaleString('en-US')} characters.`;
export const BLANKS_HINT_TOUCH = `Type a blank in braces, or tap one to insert it where the cursor is. Up to ${MAX_RESULT_TEXT_LENGTH.toLocaleString('en-US')} characters.`; // touch: "tap" (not in the mockups)
export const PREVIEW_WITH = 'Preview with';
export const PREVIEW_NEEDS_NO_ERRORS = 'The preview shows once the text has no errors.';
export const PREVIEW_LOADING = 'Loading the preview…'; // not in the mockups
// No candidate of this kind in any event yet (49): the made-up candidate (not in the mockups)
export const SAMPLE_NOTE = 'a made-up candidate (no real one has this result yet)';
export const SAMPLE_EVENT_NAME = 'Star Testing';
// Where a blank works, for "{D subjects} only works in a Make-up with a D email." (48)
const BLANK_HOME = {
  'star earned': 'a Passed email',
  'subjects to work on': 'a make-up email',
  'D subjects': 'a Make-up with a D email',
  'below-pass-mark note': 'a Make-up with a D email',
};
// The message under the box for a problem from resultEmail.resultTextProblemDetail (48). The three
// blank messages are the mockups'; the others are not in the mockups (Forms' style).
export function resultTextProblemText(problem) {
  if (!problem) return null;
  switch (problem.code) {
    case 'unknown_blank': return `{${problem.blank}} isn’t one of the blanks. Check the spelling, or pick one below.`;
    case 'blank_not_for_kind': return `{${problem.blank}} only works in ${BLANK_HOME[problem.blank] ?? 'another kind of email'}.`;
    case 'missing_required':
      return problem.blank === 'subjects to work on'
        ? 'A make-up email has to say what to work on. Add {subjects to work on}.'
        : `Every result email gives the total and the pass mark. Add {${problem.blank}}.`;
    case 'too_long': return `Keep it to ${MAX_RESULT_TEXT_LENGTH.toLocaleString('en-US')} characters or fewer${problem.length ? ` (it has ${problem.length.toLocaleString('en-US')})` : ''}.`;
    case 'bad_character': return 'It has a hidden character that can’t be used. Retype the part you pasted.';
    case 'first_line': return 'The first line can’t be empty. Start with the greeting, for example “Hello,”.';
    case 'stray_brace': return 'A { or } is left over. Finish the blank, for example {first name}, or remove the brace.';
    case 'empty': return 'Write the email text.';
    default: return 'This text can’t be saved.';
  }
}
