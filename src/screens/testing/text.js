// text.js — every word the Testing → Classes and ranks screens show, in one place.
// Why it exists: contract 0003 §7 lists each sentence exactly. Keeping them here (instead of
// scattered through the screens) makes it easy to check them against the contract and to
// change a wording later in ONE spot. The data layer (src/lib/testing) only returns codes such
// as 'stale' or 'tooLong'; this file turns those codes into plain English.
//
// Values in {curly braces} in the contract are filled in by the small functions below.

// ----- 7.1 Page, tabs, states -----
export const PAGE_TITLE = 'Testing';
export const ADD_CLASS = 'Add class';
export const TAB_CLASSES_RANKS = 'Classes and ranks';
export const VIEW_ONLY_LINE = 'View only. Ask an admin to make changes.';
export const BLOCKED_ON_BOTH = 'Testing is kept separate for each school. Choose a school to see its testing.';
export const LOADING = 'Loading Classes and ranks';

export const emptySchoolAdmin = (school) => `No classes yet at ${school}.`;
export const emptySchoolStaff = (school) => `No classes yet at ${school}. An admin adds them.`;

// "No ranks" · "1 rank" · "18 ranks"
export function rankCount(n) {
  if (n === 0) return 'No ranks';
  if (n === 1) return '1 rank';
  return `${n} ranks`;
}

export const EMPTY_CLASS = 'No ranks in this class yet.';
export const ADD_RANK = 'Add rank';

// Rank table headers (not sortable)
export const COL_RANK = 'Rank';
export const COL_TESTING_FOR = 'Testing for';
export const COL_EARLY = 'Early';
export const COL_TESTING_DAY = 'Testing day';
export const COL_PRIVATE = 'Private';
export const COL_SPARRING = 'Sparring gear';

export const YES = 'Yes';
export const NO = 'No';

// Tags
export const TAG_FINAL_AWARD = 'Final award';
export const TAG_SPARRING = 'Sparring gear';
export const TAG_NOT_SAVED = 'Not saved';
// Last rank of a class whose final award is None: it doesn't promote, on purpose (v0.62).
export const TAG_NO_NEW_RANK = 'No new rank';

// The amber reminder on the last rank when the class has no final award.
export const AWARD_NOT_SET_ADMIN = 'Final award not set — choose one in Edit class';
export const AWARD_NOT_SET_STAFF = 'Final award not set';

// Phone rank row, line 2: "$70 early · $80 testing day · $95 private"
export const PHONE_EARLY = (price) => `${price} early`;
export const PHONE_DAY = (price) => `${price} testing day`;
export const PHONE_PRIVATE = (price) => `${price} private`;
export const PHONE_SPARRING_TEXT = 'Sparring gear';

// ----- 7.2 Aria-labels and tooltips -----
export const expandClass = (name) => `Expand ${name}`;
export const collapseClass = (name) => `Collapse ${name}`;
export const editClassLabel = (name) => `Edit class ${name}`;
export const moreFor = (name) => `More actions for ${name}`;
export const dragToReorder = (name) => `Drag to reorder ${name}`;
export const editRankLabel = (name) => `Edit ${name}`;
export const viewRankLabel = (name) => `View ${name}`;
export const VIEW = 'View';
export const GRIP_TOOLTIP = 'Drag to reorder';
export const RETRY = 'Retry';
export const DISMISS = 'Dismiss';
export const BACK = 'Back';
export const UNDO = 'Undo';

// ----- 7.3 Menus -----
export const MOVE_UP = 'Move up';
export const MOVE_DOWN = 'Move down';
export const DELETE_RANK = 'Delete rank';
export const DELETE_CLASS = 'Delete class';
export const CANCEL = 'Cancel';

// Second line of the phone sheet header for a rank.
export function rankSheetLine(className, rankView) {
  if (!rankView.isLast) return `${className} · tests for ${rankView.testingFor?.name ?? ''}`;
  if (rankView.finalAwardState === 'set') return `${className} · last rank, tests for ${rankView.testingFor.name} (final award)`;
  if (rankView.finalAwardState === 'none') return `${className} · last rank, no new rank`;
  return `${className} · last rank, final award not set`;
}

// ----- 7.4 Dialogs -----
export const EDIT_RANK = 'Edit rank';
export const ADD_RANK_TITLE = 'Add rank';
export const EDIT_CLASS = 'Edit class';
export const ADD_CLASS_TITLE = 'Add class';
export const SAVE = 'Save';
export const SAVING = 'Saving…'; // on the Save button while the save is on its way
export const CLOSE = 'Close';
export const DELETE = 'Delete';

// "Group A · Worcester"
export const classAtSchool = (className, school) => `${className} · ${school}`;
export const viewOnlySubtitle = (className, school) => `${className} · ${school} · view only`;
export const viewOnlyDialogLabel = (rankName) => `${rankName}, view only`;
export const addClassSubtitle = (school) => `Adds an empty class to ${school}'s list.`;

// Field labels
export const RANK_NAME = 'Rank name';
export const CLASS_NAME = 'Class name';
export const TESTING_FOR = 'Testing for';
export const PRICES = 'Prices';
export const EARLY = 'Early';
export const TESTING_DAY = 'Testing day';
export const PRIVATE_TESTING = 'Private testing';
export const EARLY_HINT = 'Early = paid in full before testing day.';
export const EARLY_HINT_PHONE = 'Paid in full before testing day.';
export const EARLY_VIEW_PHONE_SUFFIX = ' · paid in full before testing day';
export const SPARRING_REQUIRED = 'Sparring gear required';

// Belt section of the rank dialog (v0.65, preview first)
export const BELT = 'Belt';
export const PATTERN = 'Pattern';
export const PATTERN_SOLID = 'Solid';
export const PATTERN_STRIPE = 'Middle stripe';
export const PATTERN_HALF = 'Half and half';
export const BELT_COLOR = 'Belt color';
export const TOP_HALF = 'Top half';
export const STRIPE_COLOR = 'Middle stripe color';
export const BOTTOM_HALF = 'Bottom half';
export const END_STRIPES = 'End stripes';
export const END_STRIPE_COLOR = 'End stripe color';
export const FEWER_END_STRIPES = 'Fewer end stripes';
export const MORE_END_STRIPES = 'More end stripes';
export const BELT_SAME_STRIPE = 'Pick a stripe color that differs from the belt color.';
export const BELT_SAME_HALVES = 'Pick a bottom half that differs from the top half.';
export const END_STRIPE_SAME = 'Pick an end stripe color that differs from the belt color.';
export const MORE_DETAILS = 'More details';
export const FINAL_AWARD_FIELD = 'Final award after this class';
export const FINAL_AWARD_FIELD_OPTIONAL = 'Final award after this class (optional)';
export const FINAL_AWARD_HINT = 'Students who pass the last rank of this class receive this rank.';
export const FINAL_AWARD_HINT_ADD =
  'Students who pass the last rank of this class receive this rank. You can set it later in Edit class.';
export const NOT_SET = 'Not set';
export const FINAL_AWARD_NONE_OPTION = "None — last rank doesn't promote"; // v0.62, in the open list
export const FINAL_AWARD_NONE_SHORT = 'None'; // the closed field shows just this (screen readers hear the full option)

// "Testing for" read-only text in Edit / View rank
export const testingForNext = (next) => `${next} — set by the rank order`;
export const testingForAward = (award) => `${award} — final award, set in the class settings`;
// Split versions so the name can be drawn dark and the rest gray (as in the mockup).
export const TESTING_FOR_NEXT_SUFFIX = ' — set by the rank order';
export const TESTING_FOR_AWARD_SUFFIX = ' — final award, set in the class settings';
// Last rank of a None class (v0.62): "No new rank — set in the class settings" (staff: "No new rank")
export const TESTING_FOR_NONE = 'No new rank';
export const TESTING_FOR_NONE_SUFFIX = ' — set in the class settings';

// Add rank dialog
export const addRankAtEnd = (className, lastRank) =>
  `Added at the end of ${className}. ${lastRank} will now test for this rank.`;
export const addRankFirst = (className) => `Added as the first rank of ${className}.`;
export const copiedFrom = (lastRank) => `Copied from ${lastRank}. Change if needed.`;
export const FIRST_RANK_PRICES = "Enter the three prices for this class's first rank.";

// "Last changed by Main Admin · Oct 16, 4:52 PM" (the year is added only when it isn't this year)
export function lastChanged(name, isoDate, now = new Date()) {
  const date = new Date(isoDate);
  const options = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
  if (date.getFullYear() !== now.getFullYear()) options.year = 'numeric';
  return `Last changed by ${name} · ${date.toLocaleString('en-US', options)}`;
}

// ----- Delete confirmations (§7.4) -----

// "[lost]" sentence: which other classes lose their final award. '' when none.
export function lostAwardSentence(lostClasses) {
  const names = (lostClasses ?? []).map((c) => `${c.name}'s`);
  if (names.length === 0) return '';
  if (names.length === 1) return `${names[0]} final award will become Not set.`;
  if (names.length === 2) return `${names[0]} and ${names[1]} final awards will become Not set.`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} final awards will become Not set.`;
}

const DELETE_TAIL = "Existing events keep their own copy. This can't be undone.";

// Joins the non-empty parts with single spaces.
const sentence = (...parts) => parts.filter(Boolean).join(' ');

// From describeRankDelete(...) → { title, body }
export function rankDeleteText(d) {
  const lost = lostAwardSentence(d.lostAwardClasses);
  const title = `Delete ${d.rankName}?`;
  let first = '';
  if (d.isOnlyRank) {
    first = `${d.className} will have no ranks.`;
  } else if (d.previousRankName && d.nextRankName) {
    first = `${d.previousRankName} will test for ${d.nextRankName}.`;
  } else if (d.previousRankName && d.isLast && d.finalAwardState === 'none') {
    first = `${d.previousRankName} won't test for a new rank.`; // None class (v0.62)
  } else if (d.previousRankName && d.isLast) {
    first = d.finalAwardName
      ? `${d.previousRankName} will test for ${d.finalAwardName}.`
      : `${d.previousRankName} will be the last rank of ${d.className}.`;
  }
  // (First rank with a next one: nothing changes for the others, so only [lost] + the tail.)
  return { title, body: sentence(first, lost, DELETE_TAIL) };
}

// From describeClassDelete(...) → { title, body }
export function classDeleteText(d) {
  let title;
  if (d.rankCount === 0) title = `Delete ${d.className}?`;
  else if (d.rankCount === 1) title = `Delete ${d.className} and its 1 rank?`;
  else title = `Delete ${d.className} and its ${d.rankCount} ranks?`;
  return { title, body: sentence(lostAwardSentence(d.lostAwardClasses), DELETE_TAIL) };
}

// ----- 7.5 Field errors -----
const NAME_PROBLEMS = {
  tooLong: 'Use 60 characters or fewer.',
  badCharacter: "That name has a character that can't be used. Remove it.",
};

// kind: 'rank' | 'class'
export function nameProblemText(problem, kind) {
  if (problem === 'empty') return kind === 'rank' ? 'Enter a rank name.' : 'Enter a class name.';
  return NAME_PROBLEMS[problem] ?? null;
}

export const duplicateRank = (className, existing) => `${className} already has a rank called ${existing}. Try another name.`;
export const duplicateClass = (school, existing) => `${school} already has a class called ${existing}. Try another name.`;

const PRICE_PROBLEMS = {
  empty: 'Enter a price in whole dollars.',
  notNumber: 'Enter a price in whole dollars, like 65.',
  notWhole: 'Use whole dollars, like 65.',
  tooHigh: 'Enter $1,000 or less.',
};
export const priceProblemText = (problem) => PRICE_PROBLEMS[problem] ?? null;

// ----- 7.6 Notes, banners, toasts -----
export const UNSAVED = 'Unsaved changes. Save or cancel first.';
export const DISCARD_CHANGES = 'Discard changes'; // phone only: the link inside UNSAVED (v0.56)
export const STALE = "Someone else changed this just now. Your change wasn't saved.";
export const STALE_DIALOG =
  "Someone else changed this just now. Your change wasn't saved. Cancel, then open it again to see the latest.";
// Phone version: the full-screen page has no Cancel button, the note's "Discard changes" link is the way out.
export const STALE_DIALOG_PHONE =
  "Someone else changed this just now. Your change wasn't saved. Discard changes, then open it again to see the latest.";
export const NOT_ALLOWED = "Only an admin can change Classes and ranks. Your change wasn't saved.";
export const INVALID_DIALOG = "That didn't save. Check the fields and try again.";
export const SAVE_FAILED = "Couldn't save. Check the connection, then try again.";
export const DELETE_FAILED = "Couldn't delete. Check the connection, then try again.";
export const RANK_ORDER_FAILED = "Rank order didn't save. Check the connection, then retry.";
export const CLASS_ORDER_FAILED = "Class order didn't save. Check the connection, then retry.";
export const LOAD_FAILED = "Couldn't load Classes and ranks. Check the connection, then retry.";
export const UNDO_STALE = "Couldn't undo. Someone else changed this just now.";
export const undoNotEmpty = (className) => `Couldn't undo. ${className} has ranks now. Use ⋯ → Delete class instead.`;
export const undoAward = (rankName, className) =>
  `Couldn't undo. ${rankName} is now ${className}'s final award. Use ⋯ → Delete rank instead.`;
export const UNDO_FAILED = "Undo didn't save. Check the connection, then retry.";

export const TOAST_RANK_SAVED = 'Rank saved';
export const TOAST_RANK_ADDED = 'Rank added';
export const TOAST_CLASS_SAVED = 'Class saved';
export const TOAST_CLASS_ADDED = 'Class added';
export const TOAST_RANK_ORDER = 'Rank order saved';
export const TOAST_CLASS_ORDER = 'Class order saved';
export const TOAST_UNDONE = 'Undone';
export const deletedToast = (name) => `${name} deleted`;

// =====================================================================================
// Phase 2 — Events, the event page (Students roster with payments). Contract 0005 §6,
// approved mockups TKD-ColorBelt-Events-Mockups.html (E1–E14) and
// TKD-ColorBelt-Roster-Mockups.html (R1–R8) with the later changes (Mark paid, Add student
// in the page header). The data layer (src/lib/testing/eventsApi.js, eventRules.js) only
// returns codes; every word the staff see is here.
// =====================================================================================

// ----- Dates and times (all shown in Massachusetts time) -----
// A date from the database is "YYYY-MM-DD" with no time. new Date(y, m - 1, d) makes it a
// date on THIS computer's calendar, so it never shifts a day because of time zones.
function parseDay(iso) {
  if (typeof iso !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}
const dayText = (iso, options) => parseDay(iso)?.toLocaleDateString('en-US', options) ?? '';

// "Fri, Nov 20, 2026"
export const shortDate = (iso) => dayText(iso, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
// "Fri, Nov 13"
export const weekdayMonthDay = (iso) => dayText(iso, { weekday: 'short', month: 'short', day: 'numeric' });
// "Nov 13"
export const monthDay = (iso) => dayText(iso, { month: 'short', day: 'numeric' });
// "Friday, November 20, 2026" (the flyer)
export const longDate = (iso) => dayText(iso, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
// "Friday, November 13" (the flyer's "Register by")
export const longWeekdayMonthDay = (iso) => dayText(iso, { weekday: 'long', month: 'long', day: 'numeric' });
// "Oct 1, 2026"
export const monthDayYear = (iso) => dayText(iso, { month: 'short', day: 'numeric', year: 'numeric' });

// A moment in time (a timestamp) shown in Massachusetts time.
const SCHOOL_TZ = 'America/New_York';
// "Nov 1" — from a timestamp ("2026-11-01T22:05:00Z")
export function stampDay(stamp) {
  if (!stamp) return '';
  const date = new Date(stamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { timeZone: SCHOOL_TZ, month: 'short', day: 'numeric' });
}
// "Nov 1, 6:05 PM"
export function stampDayTime(stamp) {
  if (!stamp) return '';
  const date = new Date(stamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', { timeZone: SCHOOL_TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// "16:00" (or "16:00:00") → "4:00 PM"
export function timeLabel(hhmm) {
  const match = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? '');
  if (!match) return '';
  const hours = Number(match[1]);
  const suffix = hours < 12 ? 'AM' : 'PM';
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return `${twelve}:${match[2]} ${suffix}`;
}

// ----- Money -----
// 6500 → "$65" (whole dollars; the same style as Classes and ranks)
export function dollars(cents) {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return '';
  const value = cents / 100;
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: Number.isInteger(value) ? 0 : 2 })}`;
}

// ----- Paying by -----
export const PAYING_BY = { cash: 'Cash', check: 'Check', card: 'Card' };
export const payingByText = (code) => PAYING_BY[code] ?? '';
// lower case, inside a sentence: "$65 check"
export const payingByLower = (code) => payingByText(code).toLowerCase();

// ----- Testing page tabs -----
export const TAB_EVENTS = 'Events';

// ----- E1–E3: the Events list -----
export const ADD_EVENT = 'Add event';
export const UPCOMING = 'Upcoming';
export const PAST = 'Past';
export const EVENTS_SWITCH_LABEL = 'Upcoming or past events';
export const COL_EVENT = 'Event';
export const COL_TESTING_DATE = 'Testing date';
export const COL_STUDENTS = 'Students';
export const COL_STATUS = 'Status';
export const sortBy = (column) => `Sort by ${column}`;
export const ACTIONS_COL = 'Actions';
export const NO_EVENTS_ADMIN = 'No color belt testing events yet.';
export const NO_EVENTS_STAFF = 'No color belt testing events yet. An admin adds them.';
export const NO_UPCOMING = 'No upcoming events.';
export const NO_PAST = 'No past events.';
export const LOADING_EVENTS = 'Loading events';
export const STAFF_EVENTS_LINE =
  'Staff can open or close registration from ⋯ until the closing date. Ask an admin to add or change events.';
// Phone row, line 2: "Fri, Nov 20, 2026 · 23 students"
export const studentsCount = (n) => (n === 1 ? '1 student' : `${n} students`);
export const eventPhoneLine = (dateIso, count) => `${shortDate(dateIso)} · ${studentsCount(count)}`;
export const editEventLabel = (name) => `Edit ${name}`;
export const openEventLabel = (name) => `Open ${name}`;

// One tag per event (Star v0.88). `tag` is { code, date } from eventRules.stateTag.
export function eventTagText(tag) {
  switch (tag?.code) {
    case 'finished':
      return 'Finished';
    case 'testing_today':
      return 'Testing today';
    case 'open_until':
      return `Open until ${monthDay(tag.date)}`;
    case 'open':
      return 'Registration open';
    case 'closed':
      return 'Registration closed';
    case 'not_open_yet':
      return 'Not open yet';
    default:
      return '';
  }
}

// ----- E8–E10: the event ⋯ menu -----
export const COPY_REGISTRATION_LINK = 'Copy registration link';
export const CLOSE_REGISTRATION = 'Close registration';
export const OPEN_REGISTRATION = 'Open registration';
export const EDIT_EVENT = 'Edit event';
export const DELETE_EVENT = 'Delete event';
export const REOPEN_NEEDS_ADMIN = 'The closing date has passed. Ask an admin to reopen.';
export const eventMenuSub = (event) => shortDate(event.testingDate);

export const TOAST_REGISTRATION_CLOSED = 'Registration closed';
export const TOAST_REGISTRATION_OPEN = 'Registration open';
export const TOAST_REGISTRATION_OPEN_DATE_REMOVED = 'Registration open. The automatic closing date was removed.';
export const TOAST_LINK_COPIED = 'Link copied';
export const COPY_FAILED = "Couldn't copy the link. Open Registration link on the event page and copy it from there.";

// E14: a switch change that didn't reach the database
export const registrationNotClosed = (name) => `Registration for ${name} wasn't closed. Check the connection and try again.`;
export const registrationNotOpened = (name) => `Registration for ${name} wasn't opened. Check the connection and try again.`;
export const REGISTRATION_FINISHED = 'This testing has finished, so registration can no longer change.';
export const REGISTRATION_NEEDS_ADMIN = "The closing date has passed. Ask an admin to reopen. Registration wasn't opened.";
export const EVENTS_NOT_ALLOWED = "Only an admin can do that. Your change wasn't saved.";
export const LOAD_EVENTS_FAILED = "Couldn't load events. Check the connection, then retry.";

// ----- E4–E7: Add / Edit event -----
export const ADD_EVENT_TITLE = 'Add event';
export const EDIT_EVENT_TITLE = 'Edit event';
export const addEventSub = (school) => `${school} school. Prices are copied from Classes and ranks when you save.`;
export const editEventSub = (createdIso) =>
  `Prices were copied from Classes and ranks when this event was created (${monthDayYear(createdIso)}).`;
export const EVENT_NAME = 'Event name';
export const TESTING_DATE = 'Testing date';
export const CLASSES_TESTING = 'Classes testing';
export const TIME_TO = 'to';
export const NOT_TESTING_HERE = 'Not testing at this event';
export const CLASSES_TESTING_HINT = "Untick a class that doesn't test at this event. Classes with the same times test together.";
export const FIRST_EVENT_HINT =
  'Every class starts ticked with no times; set each one. Later events copy the classes and times from the last event.';
export const copiedFromEvent = (name) => `Classes and times copied from ${name}. Change if needed.`;
export const NO_TIME = 'Time'; // the empty choice in a time list
export const startTimeLabel = (className) => `${className} start time`;
export const endTimeLabel = (className) => `${className} end time`;
export const testsAtEventLabel = (className) => `${className} tests at this event`;
export const REGISTRATION = 'Registration';
export const REG_OPEN = 'Open';
export const REG_CLOSED = 'Closed';
export const CLOSE_AUTOMATICALLY = 'Close automatically at the end of';
// The tick's name for screen readers: the visible words alone stop mid-sentence (E4–E7).
export const CLOSE_AUTOMATICALLY_LABEL = 'Close automatically at the end of the closing date';
export const CLOSING_DATE_LABEL = 'Closing date';
export const CLOSE_AUTOMATICALLY_HINT = '11:59 PM, Massachusetts time. You can open or close registration yourself at any time.';
export const NOTE_FOR_FAMILIES = 'Note for families (optional)';
export const NOTE_HINT = 'Shown on the registration form.';
export const NO_CLASSES_YET = 'This school has no classes yet. Add them in Classes and ranks first.';

// Field messages (amber, under the field)
export const ENTER_EVENT_NAME = 'Enter an event name.';
export const eventNameProblem = (problem) =>
  problem === 'empty' ? ENTER_EVENT_NAME : (NAME_PROBLEMS[problem] ?? null);
export const duplicateEvent = (name) => `There’s already an event called ${name}. Try another name.`;
export const ENTER_TESTING_DATE = 'Enter the testing date.';
export const TESTING_DATE_PAST = "The testing date can't be in the past.";
export const END_AFTER_START = 'The end time must be after the start time.';
export const SET_BOTH_TIMES = 'Set a start and an end time.';
export const TICK_ONE_CLASS = 'Tick at least one class.';
export const CLOSING_AFTER_TESTING = 'The closing date must be on or before the testing date.';
export const CLOSING_IN_PAST = "The closing date can't be in the past.";
export const ENTER_CLOSING_DATE = 'Enter the closing date, or untick the box.';
export const NOTE_TOO_LONG = 'Use 600 characters or fewer.';
export const finalAwardNotSet = (className) => `Set a final award for ${className} in Classes and ranks first.`;
export const EVENT_NOT_EMPTY =
  'A class you unticked has students registered. Tick it again, or move its students to another class first.';
export const EVENT_NOT_ALLOWED = "Only an admin can add or change events. Your change wasn't saved.";

export const TOAST_EVENT_ADDED = 'Event added';
export const TOAST_EVENT_SAVED = 'Event saved';

// ----- E13: Delete event -----
export const deleteEventTitle = (name) => `Delete ${name}?`;
// The count is the same number as the list's Students column (active students); removed ones
// (withdrawn or duplicate copies) are mentioned separately, and the money is every payment
// recorded for the event, removed students' included.
// e.g. "Its 15 students (plus 1 removed), their registrations and $410 of payments are deleted
// too. This can't be undone."
// Phase 3 (G8, contract 0010 §4.8): testing results are named too — "Its 14 students (plus 1
// removed), their registrations, their 8 testing results and $410 of payments are deleted too.
// This can't be undone." resultCount = graded students (any status).
export function deleteEventBody({ activeCount, removedCount, paymentCents, resultCount = 0 }) {
  const tail = "This can't be undone.";
  let who = null;
  if (activeCount > 0) who = `${studentsCount(activeCount)}${removedCount > 0 ? ` (plus ${removedCount} removed)` : ''}`;
  else if (removedCount > 0) who = removedCount === 1 ? '1 removed student' : `${removedCount} removed students`;
  if (who === null) return tail;
  const regs = activeCount + removedCount === 1 ? 'their registration' : 'their registrations';
  if (resultCount > 0) {
    const results = resultCount === 1 ? 'their 1 testing result' : `their ${resultCount} testing results`;
    if (paymentCents > 0) return `Its ${who}, ${regs}, ${results} and ${dollars(paymentCents)} of payments are deleted too. ${tail}`;
    return `Its ${who}, ${regs} and ${results} are deleted too. ${tail}`; // CP1
  }
  if (paymentCents > 0) return `Its ${who}, ${regs} and ${dollars(paymentCents)} of payments are deleted too. ${tail}`;
  return `Its ${who} and ${regs} are deleted too. ${tail}`;
}
export const KEEP_EVENT = 'Keep event';

// ----- R1: the event page -----
export const BACK_TO_COLOR_BELT = 'Color belt testing';
export const TAB_STUDENTS = 'Students';
export const REGISTRATION_LINK = 'Registration link';
export const ADD_STUDENT = 'Add student';
export const LOADING_EVENT = 'Loading the event';
export const LOAD_EVENT_FAILED = "Couldn't load this event. Check the connection, then retry.";
export const EVENT_GONE = 'This testing event was deleted, or the link is wrong.';
export const schoolName = (school) => `${school} school`;

// The summary line's last part, e.g. "registration open until Nov 13"
export function registrationPhrase(state, event) {
  switch (state) {
    case 'finished':
      return 'finished';
    case 'open':
      return event.autoCloseOn ? `registration open until ${monthDay(event.autoCloseOn)}` : 'registration open';
    case 'not_open_yet':
      return 'registration not open yet';
    default:
      return 'registration closed';
  }
}
// "Fri, Nov 20, 2026 · Worcester school · 14 students · registration open until Nov 13"
export const eventSummary = (event, school, count, state) =>
  `${shortDate(event.testingDate)} · ${schoolName(school)} · ${studentsCount(count)} · ${registrationPhrase(state, event)}`;

// Summary cards (Star v0.115)
export const CARD_STUDENTS = 'Students · all classes';
export const CARD_PAID = 'Paid';
export const CARD_NOT_PAID = 'Not paid';
export const CARD_PAYMENTS = 'Payments recorded';
// R8: the small gray line under Payments recorded when removed students' payments are in it.
export const includesRemoved = (cents) => `includes ${dollars(cents)} from removed students`;
export const SHOWING_PAID = 'Showing paid only';
export const SHOWING_NOT_PAID = 'Showing not paid only';
export const SHOW_ALL = 'Show all';
export const CLASS_SWITCH_LABEL = 'Class';

// The class line: "Group A · 5:00 – 6:00 PM", "4 students", one gear tag
export const classLineTitle = (className, timeText) => (timeText ? `${className} · ${timeText}` : className);
export const NO_SPARRING_GEAR = 'No sparring gear';
export const SPARRING_GEAR = 'Sparring gear';
export const sparringFrom = (rankName) => `Sparring gear from ${rankName}`;

// Roster table
export const COL_STUDENT = 'Student';
export const COL_PAYING_BY = 'Paying by';
export const COL_PAYMENT = 'Payment';
export const COL_PAID_ON = 'Paid on';
export const registeredOn = (stamp) => `Registered ${stampDay(stamp)}`;
export const addedOn = (stamp) => `Added ${stampDay(stamp)}`;
export const TAG_PAID = 'Paid';
export const TAG_NOT_PAID = 'Not paid';
export const TAG_POSSIBLE_DUPLICATE = 'Possible duplicate';
export const TAG_REMOVED = 'Removed';
export const TAG_DUPLICATE_COPY = 'Duplicate copy';
export const NO_NEW_RANK = 'No new rank';
export const MARK_PAID = 'Mark paid';
export const markPaidLabel = (name) => `Mark ${name} paid`;
export const reviewDuplicateLabel = (name) => `Possible duplicate: review ${name}`;
export const paidOnPhone = (method, stamp) => `${payingByText(method)} · paid ${monthDay(stamp)}`;
export const EMPTY_CLASS_ROSTER = 'No students in this class yet.';
export const NO_STUDENTS_FILTERED_PAID = 'No paid students in this class.';
export const NO_STUDENTS_FILTERED_NOT_PAID = 'Everyone in this class has paid.';
export const NO_CLASSES_IN_EVENT = 'This event has no classes.';
export const removedGroup = (n) => `Removed · ${n}`;
export const NOT_IN_COUNTS = 'Not in the counts';
export const removedBy = (stamp, name) => (name ? `removed ${stampDay(stamp)} by ${name}` : `removed ${stampDay(stamp)}`);
export const studentLabel = (row) => `${row.firstName} ${row.lastName}`;

// Possible duplicate box (R7)
export function duplicateBoxLine(count) {
  return count === 1 ? '1 possible duplicate' : `${count} possible duplicates`;
}
export const registeredTwice = (name, className) => `${name} (${className}) is registered twice`;
export const REVIEW = 'Review';

// ⋯ menu on a student (R8, plan answers 6 and 8)
export const CHANGE_PAYING_BY = 'Change how they’ll pay';
export const EDIT_DETAILS = 'Edit details';
export const EDIT_PAYMENT = 'Edit payment';
export const UNDO_PAYMENT = 'Undo payment';
export const WITHDRAW = 'Withdraw';
export const RESTORE = 'Restore';
export const DELETE_PERMANENTLY = 'Delete permanently';
export const REVIEW_DUPLICATE = 'Review possible duplicate';
export const moreForStudent = (name) => `More actions for ${name}`;

// Toasts
export const markedPaidToast = (name, cents, method) => `${name} marked paid · ${dollars(cents)} ${payingByLower(method)}`;
export const withdrawnToast = (name) => `${name} withdrawn`;
export const restoredToast = (name) => `${name} restored`;
export const studentAddedToast = (name) => `${name} added`;
export const TOAST_CHANGES_SAVED = 'Changes saved';
export const TOAST_PAYMENT_SAVED = 'Payment saved';
export const paymentUndoneToast = (name) => `Payment undone for ${name}`;
export const duplicateRemovedToast = (name) => `${name}’s extra copy moved to Removed`;
export const TOAST_KEPT_BOTH = 'Kept both registrations';

// Banners for row actions that didn't work
export const ROSTER_STALE = "Someone else changed this just now. Your change wasn't saved.";
export const ROSTER_NOT_ALLOWED = "Only an admin can do that. Your change wasn't saved.";
export const alreadyPaid = (name) => `${name} is already marked paid.`;
export const isWithdrawn = (name) => `${name} was withdrawn. An admin can restore them first.`;
export const markPaidFailed = (name) => `${name} wasn't marked paid. Check the connection and try again.`;
export const UNDO_PAYMENT_TOO_LATE = 'Too late to undo here. Ask an admin to undo the payment.';
// Staff Undo of "keep this one" after the database's 10-second window (R7)
export const UNDO_DUPLICATE_TOO_LATE = 'Too late to undo here. Ask an admin to restore the copy from Removed.';
export const actionFailed = "That didn't save. Check the connection, then retry.";
export const EVENT_FINISHED_ADD = "This testing has finished, so students can't be added any more.";

// R4: Add student
export const ADD_STUDENT_TITLE = 'Add student';
export const addStudentSub = (eventName, school) => `${eventName} · ${schoolName(school)}`;
export const FIRST_NAME = 'First name';
export const LAST_NAME = 'Last name';
export const CLASS = 'Class';
export const CURRENT_BELT = 'Current belt';
export const THREE_STRIPES = 'Has 3 stripes on one side of their belt';
export const PAYING_BY_LABEL = 'Paying by';
export const ADD_STUDENT_HINT =
  'For walk-ins or families who couldn’t use the form. Works after registration has closed, including on the testing day.';
export const ENTER_FIRST_NAME = 'Enter a first name.';
export const ENTER_LAST_NAME = 'Enter a last name.';
export const studentNameProblem = (problem, which) =>
  problem === 'empty' ? (which === 'first' ? ENTER_FIRST_NAME : ENTER_LAST_NAME) : (NAME_PROBLEMS[problem] ?? null);
export const PICK_CLASS_FIRST = 'Choose the class first.';
export const PICK_CLASS = 'Choose a class.';
export const PICK_BELT = 'Choose the current belt.';
export const PICK_PAYING_BY = 'Choose how they’ll pay.';
export const NEEDS_THREE_STRIPES = 'Every student needs 3 stripes on one side of their belt to test.';
// "$65 ($75 on the testing day)" before the testing day; "$75" on it or after.
export function feeText(earlyCents, dayCents, onOrAfterTestingDay) {
  if (onOrAfterTestingDay || earlyCents === dayCents) return dollars(dayCents);
  return `${dollars(earlyCents)} (${dollars(dayCents)} on the testing day)`;
}
// "Testing for Orange → Green · Group A, 5:00 – 6:00 PM · $65 ($75 on the testing day)"
export const testingForLine = (fromName, toName, className, timeText, fee) =>
  `Testing for ${fromName} → ${toName} · ${className}${timeText ? `, ${timeText}` : ''} · ${fee}`;

// R6: detail summary + Edit details
export const DETAIL_CLASS_TIME = 'Class and time';
export const DETAIL_TESTING_FOR = 'Testing for';
export const DETAIL_STRIPES = '3 stripes';
export const DETAIL_REGISTERED = 'Registered';
export const DETAIL_PAYING_BY = 'Paying by';
export const DETAIL_PAYMENT = 'Payment';
export const DETAIL_SIGNED = 'Signed by';
export const DETAIL_REMOVED = 'Removed';
export const STRIPES_FORM = 'Confirmed on the form';
export const STRIPES_DESK = 'Confirmed at the desk';
export const STRIPES_NO = 'Not confirmed';
export const SOURCE_FORM = 'family form';
export const SOURCE_DESK = 'added at the desk';
// The reference part is drawn separately (StudentDialog) so "CB-3102" never breaks across lines.
export const registeredDetail = (stamp, source) => [stampDayTime(stamp), source === 'form' ? SOURCE_FORM : SOURCE_DESK].join(' · ');
export const REFERENCE_WORD = 'reference';
export const SIGNED_FORM = 'Parent or guardian, on the form';
export const signatureDeleted = (stamp) => `Signed on the form, ${stampDay(stamp)} (the signature is deleted 90 days after testing)`;
export const NOT_SIGNED_DESK = 'Not signed here (added at the desk)';
export const paidDetail = (cents, method, paidOn) => `${dollars(cents)} ${payingByLower(method)} · paid ${monthDay(paidOn)}`;
export const removedDetail = (stamp, name, reason) =>
  `${reason === 'duplicate_copy' ? 'Duplicate copy, removed' : 'Withdrawn'} ${stampDay(stamp)}${name ? ` by ${name}` : ''}`;
export const EDIT_DETAILS_TITLE = 'Edit details';
export const editDetailsSub = (name, eventName) => `${name} · ${eventName}`;
export const nowTestingFor = (fromName, toName) => `Now testing for ${fromName} → ${toName}.`;
export const feeStays = (fee) => `The fee stays ${fee}.`;
export const feeNow = (fee) => `The fee is now ${fee}.`;
export const PAYMENT_STAYS = 'The payment already recorded stays as it is.';
export const PAYMENT_NOT_HERE = 'Payment is changed with Mark paid or ⋯, not here.';

// R7: compare
export const compareTitle = (name) => `${name} is registered twice`;
export const COMPARE_SUB = 'Same name in the same class. Differences are highlighted.';
export const FIRST_REGISTRATION = 'First registration';
export const SECOND_REGISTRATION = 'Second registration';
export const COMPARE_REFERENCE = 'Reference';
export const KEEP_THIS_ONE = 'Keep this one';
export const keepThisOneLabel = (which) => `Keep the ${which.toLowerCase()}`;
// The same note for staff and admins (R7): staff get the 5-second Undo too.
export const COMPARE_NOTE =
  'Keeping one moves the other to Removed as “Duplicate copy” (Undo for 5 seconds; admins can Restore). Both are logged.';
export const KEEP_BOTH = 'Not the same person — keep both';
export const DIFFERENT = 'different'; // read by screen readers after a highlighted value
export const NO_REFERENCE = '—';

// Change how they'll pay
export const CHANGE_PAYING_BY_TITLE = 'Change how they’ll pay';
export const changePayingBySub = (name) => `${name} · not paid yet`;
export const ALREADY_PAID_DIALOG = 'Already marked paid. Close this and use ⋯ → Edit payment instead.';

// Edit payment (admins). The R5 dialog was dropped (plan answer 6); this small dialog is only
// for correcting a recorded payment: Paid by, Amount, Date paid (no check number, v0.120).
export const EDIT_PAYMENT_TITLE = 'Edit payment';
export const editPaymentSub = (name) => name;
export const PAID_BY = 'Paid by';
export const AMOUNT = 'Amount';
export const DATE_PAID = 'Date paid';
export const ENTER_DATE_PAID = 'Enter the date paid.';
export const AMOUNT_ZERO = 'Enter more than $0. To remove the payment, use ⋯ → Undo payment.';
export const EDIT_PAYMENT_HINT = 'The old payment is kept in the history and replaced by this one.';

// Delete permanently (admins; plan answer 8: allowed for a paid student, naming the payment)
export const deleteStudentTitle = (name) => `Delete ${name} permanently?`;
// graded (phase 3, G8) = { result, resultAt, hasNote }, or null when the student has no result
// and no grading note. firstName is used only when graded ("Sam’s registration …").
export function deleteStudentBody(eventName, payment, graded = null, firstName = '') {
  if (graded) {
    // "the testing result (Not passed, Nov 20)" — or "the grading note" when only a note exists.
    const what = graded.result ? `the testing result (${resultTagText(graded.result)}, ${stampDay(graded.resultAt)})` : 'the grading note';
    if (payment) {
      const paid = `the ${dollars(payment.cents)} ${payingByLower(payment.method)} payment recorded on ${monthDay(payment.paidOn)}`;
      return `${firstName}’s registration, ${paid} and ${what} are deleted. They won’t show in Payments recorded or on the Grading tab any more. This can’t be undone.`;
    }
    return `${firstName}’s registration and ${what} are deleted. They won’t show on the Grading tab any more. This can’t be undone.`; // CP1
  }
  if (!payment) return `The registration is deleted from ${eventName}. This can’t be undone.`;
  return `The registration and the ${dollars(payment.cents)} ${payingByLower(payment.method)} payment recorded on ${monthDay(
    payment.paidOn,
  )} are deleted from ${eventName}. The payment won’t show in Payments recorded any more. This can’t be undone.`;
}
export const DELETE_STUDENT_HINT = 'To keep the record, use Withdraw instead.';
export const KEEP_STUDENT = 'Keep student';

// R2: Registration link dialog
export const REGISTRATION_LINK_TITLE = 'Registration link';
export function linkDialogLine(state, event) {
  switch (state) {
    case 'open':
      return event.autoCloseOn
        ? `Registration is open until ${weekdayMonthDay(event.autoCloseOn)}. Families choose their class and belt on the form.`
        : 'Registration is open. Families choose their class and belt on the form.';
    case 'not_open_yet':
      return "Registration isn't open yet. The link starts working once registration is opened.";
    case 'finished':
      return 'This testing has finished. The link tells families registration is over.';
    default:
      return 'Registration is closed. The link tells families registration is closed.';
  }
}
export const COPY_LINK = 'Copy link';
export const PRINT_FLYER = 'Print flyer';
export const qrAlt = (link) => `QR code for ${link}`;

// R3: the flyer (letter size, black and white)
export const FLYER_SCHOOL = "Jae H. Jeong's U.S. Taekwondo Center";
export const flyerLocation = (school, address) => (address ? `Location: ${schoolName(school)}, ${address}` : `Location: ${schoolName(school)}`);
export const flyerRegisterBy = (iso) => `Register by ${longWeekdayMonthDay(iso)}`;
export const flyerScan = (shortLink) => `Scan the code, or go to ${shortLink}`;

// =====================================================================================
// Phase 3 — the Grading tab (contract 0010 §4.8, approved mockups G1–G8 in
// TKD-ColorBelt-Grading-Mockups.html, rulebook v0.180–v0.192). Lines marked "// CP1" are not in
// the mockups; they follow the same pattern and are shown to Jeffrey at the CP1 walkthrough.
// =====================================================================================

export const TAB_GRADING = 'Grading';

// "14 students · 6 passed · 1 not passed · 1 no show · 6 not recorded yet" — parts that are 0
// are left out. c = gradingRules.resultCounts(rows): { total, pass, notPassed, noShow, notRecorded }
function countParts(c) {
  const parts = [studentsCount(c.total)];
  if (c.pass > 0) parts.push(`${c.pass} passed`);
  if (c.notPassed > 0) parts.push(`${c.notPassed} not passed`);
  if (c.noShow > 0) parts.push(`${c.noShow} no show`);
  if (c.notRecorded > 0) parts.push(`${c.notRecorded} not recorded yet`);
  return parts.join(' · ');
}
export const allClassesLine = (c) => `All classes: ${countParts(c)}`;
export const resultCountLine = (c) => countParts(c);

export const PRINT_GRADING_SHEET = 'Print grading sheet';
export const COL_RESULT = 'Result';

// The three result buttons
export const RESULT_PASS = 'Pass';
export const RESULT_NOT_PASSED = 'Not passed';
export const RESULT_NO_SHOW = 'No show';
const RESULT_BUTTON_TEXT = { pass: RESULT_PASS, not_passed: RESULT_NOT_PASSED, no_show: RESULT_NO_SHOW };
export const resultButtonText = (code) => RESULT_BUTTON_TEXT[code] ?? '';

// Read-only tags (staff after the testing day; the Students detail view)
export const TAG_PASSED = 'Passed';
export const TAG_NOT_PASSED = 'Not passed';
export const TAG_NO_SHOW = 'No show';
export const NOT_RECORDED = 'Not recorded';
const RESULT_TAG_TEXT = { pass: TAG_PASSED, not_passed: TAG_NOT_PASSED, no_show: TAG_NO_SHOW };
export function resultTagText(code) {
  return RESULT_TAG_TEXT[code] ?? '';
}

export const resultGroupLabel = (name) => `Result for ${name}`;
export const addNoteLabel = (name) => `Add note for ${name}`;
export const editNoteLabel = (name) => `Edit note for ${name}`;
export const ADD_NOTE_TIP = 'Add note';
export const EDIT_NOTE_TIP = 'Edit note';

// Lock lines (ti-lock)
export const gradingOpensLine = (dateIso) => `Grading opens on the testing day, ${longWeekdayMonthDay(dateIso)}.`;
export const GRADING_OVER_STAFF = 'The testing day is over. Only an admin can change results or notes now.';
export const GRADING_OVER_ADMIN = 'The testing day is over. Staff can’t change results now; as an admin, you can.';

// Banners
export const TOO_LATE_RESULTS = 'Too late to change. Only an admin can change results now.';
export const GRADING_NOT_OPEN = 'Grading hasn’t opened yet. Your change wasn’t saved.'; // CP1
// "Couldn’t save 2 results (Group A). Check the connection, then try again."
export function gradingSaveFailed(n, classNames) {
  const what = n === 1 ? '1 result' : `${n} results`;
  const where = classNames.length > 0 ? ` (${classNames.join(', ')})` : '';
  return `Couldn’t save ${what}${where}. Check the connection, then try again.`;
}
export const ANNOUNCE_SAVED = 'Saved';
export const ANNOUNCE_NOT_SAVED = 'Not saved';
export const TAG_SAVING = 'Saving…'; // v0.192: a Not saved row being sent again by itself
export const classUnsavedLabel = 'has results not saved'; // CP1 — screen readers only

// Empty states (G7)
export const noStudentsInClass = (className) => `No students in ${className}. Students added on the Students tab show here.`;
export const NO_STUDENTS_AT_EVENT = 'No students at this event yet. Add students on the Students tab.';

// G2: the note dialog. (Named GRADING_NOTE_HINT: NOTE_HINT is already the event form's hint.)
export const noteTitle = (name) => `Note for ${name}`;
// "Group A · Orange → Green · Not passed"
export const noteSub = (className, fromName, toName, resultText) =>
  [className, fromName ? `${fromName} → ${toName}` : '', resultText].filter(Boolean).join(' · ');
export const NOT_RECORDED_YET = 'Not recorded yet'; // CP1
export const NOTE_FIELD_LABEL = 'Note'; // CP1
export const GRADING_NOTE_HINT = 'Shows on the Grading tab, also on the mat. Write only what a parent could read.';
export const noteCounter = (n) => `${n} / 200`;
export const NOTE_SAVE_FAILED = 'Couldn’t save the note. Check the connection, then try again.';
export const NOTE_BAD_CHARACTER = 'That note has a character that can’t be used. Remove it.'; // CP1
export const NOTE_TOO_LONG_200 = 'Use 200 characters or fewer.'; // CP1

// G6: the printed grading sheet
export const sheetTitle = (eventName) => `${eventName} — grading sheet`;
// "Thu, Nov 19, 4:12 PM" in Massachusetts time
function printedStamp(date) {
  return date.toLocaleString('en-US', { timeZone: SCHOOL_TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
// "Fri, Nov 20, 2026 · Worcester school · printed Thu, Nov 19, 4:12 PM · Little Tiger, page 1"
export const sheetHeaderLine = (dateIso, school, printedAt, className, page) =>
  `${shortDate(dateIso)} · ${schoolName(school)} · printed ${printedStamp(printedAt)} · ${className}, page ${page}`;
// "Little Tiger · 4:00 – 4:45 PM · 3 students"
export const sheetClassLine = (className, timeText, count) => [className, timeText, studentsCount(count)].filter(Boolean).join(' · ');
export const SHEET_COL_STUDENT = 'Student';
export const SHEET_COL_RESULT = 'Result (tick one)';
export const SHEET_COL_NOTE = 'Note';
export const SHEET_ADDED_ON_DAY = 'Added on the day:';
export const SHEET_FOOTER = 'Type the results into the Grading tab the same day.';

// G8: the Students tab
export const DETAIL_RESULT = 'Result';
// "· Nov 20, 5:41 PM by Staff"
export const resultStamp = (stamp, name) => `· ${stampDayTime(stamp)}${name ? ` by ${name}` : ''}`;
export const resultNoteLine = (note) => `Note: ${note}`;
export const beltChangeClears = (firstName, resultText) =>
  `Changing the belt clears ${firstName}’s result (${resultText}). Record it again on the Grading tab.`;
export const beltChangeClearsNote = (firstName) =>
  `Changing the belt clears ${firstName}’s grading note. Record it again on the Grading tab.`; // CP1
export const STUDENT_LOCKED = 'Only an admin can change this student now. Their result is locked.';
export const EVENT_HAS_RESULTS = 'This event already has testing results, so its date can’t change.';
// Plan Q1: a student an admin added after the testing day — "Added Nov 21 by Jeffrey Berg (admin)"
export const addedAfterDayLine = (dateIso, name) => `Added ${monthDay(dateIso)}${name ? ` by ${name}` : ''} (admin)`;

// v0.192: leaving the event page while results are Not saved
export const leaveTitle = (n) => (n === 1 ? '1 result isn’t saved' : `${n} results aren’t saved`);
// "Zoe Park and Sam Diaz" / "Ava Chen, Leo Brown and Nora Kim"
function joinNames(names) {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
// groups = [{ className, names: ['Zoe Park', 'Sam Diaz'] }] in class switch order
export function leaveBody(groups) {
  const total = groups.reduce((sum, g) => sum + g.names.length, 0);
  const who = groups.map((g) => `${joinNames(g.names)} (${g.className})`).join(', ');
  return `${who} ${total === 1 ? 'wasn’t' : 'weren’t'} saved because the connection dropped. If you leave now, they’re lost. Stay, and they’ll save when the Wi-Fi is back.`;
}
export const STAY_ON_PAGE = 'Stay on this page';
export const LEAVE_ANYWAY = 'Leave anyway';
