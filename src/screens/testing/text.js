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
// Added with the Schedule (rulebook v0.137, decision Q1): deleting a class also removes its
// schedule time slots, so the confirmation says how many.
export function scheduleSlotsSentence(n) {
  if (!n) return '';
  // The count covers every schedule (current, planned and past), not only the week on screen.
  return n === 1
    ? "It's also removed from the schedule: 1 time slot, counting every schedule."
    : `It's also removed from the schedule: ${n} time slots, counting every schedule.`;
}

export function classDeleteText(d, scheduleSlotCount = 0) {
  let title;
  if (d.rankCount === 0) title = `Delete ${d.className}?`;
  else if (d.rankCount === 1) title = `Delete ${d.className} and its 1 rank?`;
  else title = `Delete ${d.className} and its ${d.rankCount} ranks?`;
  return { title, body: sentence(lostAwardSentence(d.lostAwardClasses), scheduleSlotsSentence(scheduleSlotCount), DELETE_TAIL) };
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
