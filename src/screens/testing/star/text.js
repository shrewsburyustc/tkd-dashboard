// text.js — every word the Star testing → Rubrics and prices screens show, in one place.
// Why it exists: the approved mockups (docs/Testing/Star Testing/TKD-StarTesting-Rubrics-Mockups.html,
// 12 screens, v0.66) spell out each sentence. Keeping them here (instead of scattered through the
// screens) makes it easy to check them against the mockups and to change a wording later in ONE
// spot. Same pattern as Color Belt's src/screens/testing/text.js. The data layer
// (src/lib/star/rubricsApi.js) only returns codes such as 'stale'; this file turns them into words.
//
// A few words come from shared pieces that Color Belt built (Dialog's "Back", ErrorBanner's
// "Retry" / "Dismiss", RowMenu's "Cancel", the delete confirmation's buttons): those live in
// Color Belt's text.js and are the same house wording.
import { formatMoney } from '../../../lib/money.js';

// ----- Page header (approved phase 1 header, Chooser mockups screen 5, v0.177) -----
export const PAGE_TITLE = 'Star testing';
export const BACK_TO_TESTING = 'Testing';
export const BACK_TO_TESTING_LABEL = 'Back to Testing';
export const TAB_RUBRICS = 'Rubrics and prices';
export const SAME_FOR_BOTH = 'Same for both schools. Events keep the rubric and prices they were created with.';
export const VIEW_ONLY_LINE = 'View only. Ask an admin to make changes.';
export const LOADING = 'Loading Rubrics and prices';

// ----- Numbers as the screens show them -----
// Scores and points: at most one decimal, no ".0" (315, 337.5, 22.5).
export function formatScore(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '';
  return String(Math.round(n * 10) / 10);
}
// Grade values: one decimal, except 0 ("4.5", "4.0", "0") — as on the paper scale.
export function formatGrade(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '';
  return n === 0 ? '0' : n.toFixed(1);
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
export const categoryCount = (n) => plural(n, 'category', 'categories');
export const creditsText = (n) => plural(n, 'credit', 'credits');
export const starsText = (n) => plural(n, 'star', 'stars');

// ----- Dan blocks (screen 1, 6) -----
// "11 categories · 70 credits · pass 245 of 315 · up to 4 stars"
export const danSummary = ({ count, credits, passMark, max, starLimit }) =>
  `${categoryCount(count)} · ${creditsText(credits)} · pass ${formatScore(passMark)} of ${formatScore(max)} · up to ${starsText(starLimit)}`;
// The amber tag on a Dan line whose credits don't add up to 70 (v0.61).
export const totalNotUsual = (credits) => `Total is ${credits} credits (usually 70)`;
export const editDanSettingsLabel = (label) => `Edit Dan settings for ${label}`;
export const DAN_SETTINGS_TOOLTIP = 'Edit Dan settings';

// Category rows: "15 credits" · "max 67.5"
export const rowCredits = (credits) => creditsText(credits);
export const rowMax = (max) => `max ${formatScore(max)}`;
export const TAG_FROM_CLASS_COUNT = 'From class count';
export const TAG_NOT_SAVED = 'Not saved';
export const ADD_CATEGORY = 'Add category';
// "Total 70 credits · max 315"
export const totalLine = (credits, max) => `Total ${creditsText(credits)} · max ${formatScore(max)}`;

// Aria-labels and tooltips
export const editCategoryLabel = (name) => `Edit ${name}`;
export const moreFor = (name) => `More actions for ${name}`;
export const dragToReorder = (name) => `Drag to reorder ${name}`;
export const UNDO = 'Undo';

// ----- ⋯ menu (screens 4, 5) -----
export const MOVE_UP = 'Move up';
export const MOVE_DOWN = 'Move down';
export const DELETE_CATEGORY = 'Delete category';
// The "Delete …?" box (the shared ConfirmBox, rulebook v0.518): the button that changes nothing,
// the action's words while it works, and the amber note under the buttons when it fails.
export const KEEP_CATEGORY = 'Keep category';
export const DELETING = 'Deleting…';
export const DELETE_FAILED = "Couldn't delete. Check the connection, then try again.";
export const CANT_DELETE_REASON = "Can't delete — it's the only category graded from class count";
// Phone sheet, line 2: "1st Dan · 5 credits"
export const sheetLine = (danLabel, credits) => `${danLabel} · ${creditsText(credits)}`;

// ----- Grade scale, assistant-class table, fees (screen 1) -----
export const GRADE_SCALE = 'Grade scale';
export const GRADE_VALUES_LABEL = 'Grade values';
export const EDIT_GRADE_VALUES_LABEL = 'Edit grade values';
export const MAKEUP_RULE = 'A D in any category means a make-up, even when the total passes.';
export const POINTS_RULE = 'Points = credits × grade value.';

export const ASSISTANT_TABLE = 'Assistant-class table';
export const EDIT_ASSISTANT_TABLE_LABEL = 'Edit assistant-class table';
export const ASSISTANT_SUB = 'The number of classes a candidate assisted gives the Assistant Instructor grade.';
export const COL_GRADE = 'Grade';
export const childColumn = (maxAge) => `${maxAge} and under`;
export const adultColumn = (maxAge) => `${maxAge + 1} and up`;
export const orMore = (n) => `${n} or more`;
// A grade's range of classes: "14" (one number), "19 or 18" (two), "19 to 16" (more).
export function classRange(high, low) {
  if (high <= low) return String(low);
  if (high === low + 1) return `${high} or ${low}`;
  return `${high} to ${low}`;
}
export const underN = (n) => `under ${n}`;
export const assistantFoot = (maxAge) =>
  `Age comes from the candidate's date of birth, counted on the testing day. No date of birth → ${adultColumn(maxAge)} column.`;

export const FEES = 'Fees';
export const COL_DAN = 'Dan';
export const COL_STANDARD = 'Standard';
export const COL_SAME_DAY = 'Same day';
export const COL_PRIVATE = 'Private';
export const editFeesLabel = (label) => `Edit ${label} fees`;
export const FEES_FOOT = 'Same day = paid on testing day. Cash or check.';
// Phone fee row, line 2: "$140 standard · $150 same day · $160 private"
export const phoneStandard = (cents) => `${formatMoney(cents)} standard`;
export const phoneSameDay = (cents) => `${formatMoney(cents)} same day`;
export const phonePrivate = (cents) => `${formatMoney(cents)} private`;

// ----- Dialogs -----
export const SAVE = 'Save';
export const SAVING = 'Saving…';
export const CANCEL = 'Cancel';

// Edit / Add category (screens 2, 3)
export const EDIT_CATEGORY = 'Edit category';
export const ADD_CATEGORY_TITLE = 'Add category';
export const NAME = 'Name';
export const CREDITS = 'Credits';
export const CREDITS_SUFFIX = 'credits';
export const maxPoints = (n) => `Max points ${formatScore(n)}`;
// "1st Dan · 7 of 11" — where the category sits in its Dan.
export const categoryPlace = (danLabel, index, count) => `${danLabel} · ${index} of ${count}`;
export const addedAtEnd = (danLabel, lastName) => `Added at the end of ${danLabel}, after ${lastName}.`;
export const addedFirst = (danLabel) => `Added as the first category of ${danLabel}.`;
export const GRADE_LABEL = 'Grade';
export const GRADE_FROM_COUNT = 'Grade comes from the assistant-class count.';
// The amber reminder while editing (v0.61, exact wording).
export const totalWillBe = (danLabel, credits, max, passMark) =>
  `${danLabel} total will be ${credits} credits (usually 70). Max becomes ${formatScore(max)}; pass mark stays ${formatScore(passMark)}.`;

// Edit Dan settings (screen 7)
export const EDIT_DAN_SETTINGS = 'Edit Dan settings';
export const PASS_MARK = 'Pass mark';
export const outOf = (max) => `Out of ${formatScore(max)}`;
export const HIGHEST_STAR = 'Highest star';
export const HIGHEST_STAR_HINT = 'Candidates can test up to this many stars.';
// "Progressions: 0→1, 1→2, 2→3, 3→4 stars"
export function progressions(limit) {
  const steps = Array.from({ length: limit }, (_, i) => `${i}→${i + 1}`);
  return `Progressions: ${steps.join(', ')} ${limit === 1 ? 'star' : 'stars'}`;
}
// "Max score 315 (70 credits × 4.5)"
export const maxScoreLine = (max, credits, aPlus) => `Max score ${formatScore(max)} (${creditsText(credits)} × ${formatGrade(aPlus)})`;

// Edit grade values (screen 8)
export const EDIT_GRADE_VALUES = 'Edit grade values';
export const usedByAllDans = (n) => (n === 3 ? 'Used by all three Dans' : `Used by all ${n} Dans`);
// "Max score: 1st Dan 315 · 2nd Dan 315 · 3rd Dan 315"
export const maxScoresLine = (items) => `Max score: ${items.map((i) => `${i.label} ${formatScore(i.max)}`).join(' · ')}`;
export const GRADES_CHANGE_NOTE = "Changing these changes every Dan's max and scores for events created after saving.";

// Edit assistant-class table (screen 9)
export const EDIT_ASSISTANT_TABLE = 'Edit assistant-class table';
export const CHILD_AGE = "Children's scale up to age";
export const childAgeHint = (maxAge) => `Ages ${maxAge + 1} and up use the second column.`;
export const MINIMUMS_LABEL = 'Minimum assistant classes for each grade';
export const OR_MORE_SUFFIX = 'or more';

// Edit fees (screen 10)
export const EDIT_FEES = 'Edit fees';
export const FEE_STANDARD = 'Standard';
export const FEE_SAME_DAY = 'Same day';
export const FEE_PRIVATE = 'Private';
export const FEES_HINT = 'Whole dollars. Same day = paid on testing day. Cash or check.';

// "Last changed by Main Admin · Oct 16, 4:52 PM" (the year only when it isn't this year).
// Shown only when the data layer provides who/when.
export function lastChanged(name, isoDate, now = new Date()) {
  const date = new Date(isoDate);
  const options = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
  if (date.getFullYear() !== now.getFullYear()) options.year = 'numeric';
  return `Last changed by ${name} · ${date.toLocaleString('en-US', options)}`;
}

// Delete confirmation (screen 5)
export const deleteTitle = (name, danLabel) => `Delete ${name} from ${danLabel}?`;
export const deleteBody = (credits, max, passMark) =>
  `The total becomes ${creditsText(credits)}. Max becomes ${formatScore(max)}; pass mark stays ${formatScore(passMark)}. Existing events keep their own copy. This can't be undone.`;
export const deletedToast = (name) => `${name} deleted`;

// ----- Field errors (amber, under the field, saying what to do) -----
const NAME_PROBLEMS = {
  empty: 'Enter a category name.',
  tooLong: 'Use 60 characters or fewer.',
  badCharacter: "That name has a character that can't be used. Remove it.",
};
export const nameProblemText = (problem) => NAME_PROBLEMS[problem] ?? null;
export const duplicateCategory = (danLabel, existing) => `${danLabel} already has a category called ${existing}. Try another name.`;
export const CREDITS_PROBLEM = 'Enter a whole number of credits from 1 to 100.';

const PASS_MARK_PROBLEMS = {
  empty: 'Enter a pass mark.',
  notNumber: 'Enter a number above 0, like 245.',
  decimals: 'Use at most one decimal, like 245.5.',
  range: 'Enter a number above 0, up to 9999.9.',
};
export const passMarkProblemText = (problem) => PASS_MARK_PROBLEMS[problem] ?? null;
export const STAR_LIMIT_PROBLEM = 'Enter a whole number from 1 to 20.';

const GRADE_PROBLEMS = {
  empty: 'Enter a value from 0 to 9.9.',
  notNumber: 'Enter a value from 0 to 9.9, like 4.5.',
  decimals: 'Use at most one decimal, like 4.5.',
  range: 'Enter a value from 0 to 9.9.',
};
export const gradeProblemText = (grade, problem) => `${grade}: ${GRADE_PROBLEMS[problem] ?? GRADE_PROBLEMS.notNumber}`;
// The order rule (v0.66, exact wording): "A must be higher than B+."
export const gradeOrder = (grade, below) => `${grade} must be higher than ${below}.`;

export const AGE_PROBLEM = 'Enter an age from 1 to 30.';
export const minimumProblem = (grade) => `${grade}: enter a whole number from 1 to 999.`;
// The order rule (v0.66, exact wording): "A must need fewer classes than A+."
export const minimumOrder = (grade, above) => `${grade} must need fewer classes than ${above}.`;

const PRICE_PROBLEMS = {
  empty: 'Enter a price in whole dollars.',
  notNumber: 'Enter a price in whole dollars, like 140.',
  notWhole: 'Use whole dollars, like 140.',
  tooHigh: 'Enter $1,000 or less.',
};
export const priceProblemText = (problem) => PRICE_PROBLEMS[problem] ?? null;
// Under the fees row (PC and tablet) a message names its field: "Standard: Use whole dollars, like 140."
export const feeProblemText = (label, message) => `${label}: ${message}`;

// ----- Notes, banners, toasts -----
export const UNSAVED = 'Unsaved changes. Save or cancel first.';
export const DISCARD_CHANGES = 'Discard changes'; // phone only: the link inside the note (v0.56)
export const STALE = "Someone else changed this just now. Your change wasn't saved.";
export const STALE_DIALOG =
  "Someone else changed this just now. Your change wasn't saved. Cancel, then open it again to see the latest.";
export const STALE_DIALOG_PHONE =
  "Someone else changed this just now. Your change wasn't saved. Discard changes, then open it again to see the latest.";
export const NOT_ALLOWED = "Only an admin can change Rubrics and prices. Your change wasn't saved.";
export const INVALID_DIALOG = "That didn't save. Check the fields and try again.";
export const SAVE_FAILED = "Couldn't save. Check the connection, then try again.";
export const ORDER_FAILED = "Category order didn't save. Check the connection, then retry.";
export const LOAD_FAILED = "Couldn't load Rubrics and prices. Check the connection, then retry.";
export const UNDO_STALE = "Couldn't undo. Someone else changed this just now.";
export const UNDO_FAILED = "Undo didn't save. Check the connection, then retry.";

export const TOAST_CATEGORY_SAVED = 'Category saved';
export const TOAST_CATEGORY_ADDED = 'Category added';
export const TOAST_ORDER_SAVED = 'Category order saved';
export const TOAST_DAN_SAVED = 'Dan settings saved';
export const TOAST_GRADES_SAVED = 'Grade values saved';
export const TOAST_ASSISTANT_SAVED = 'Assistant-class table saved';
export const TOAST_FEES_SAVED = 'Fees saved';
export const TOAST_UNDONE = 'Undone';
