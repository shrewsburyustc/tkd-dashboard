// roster.js — the words of the Board breaking EVENT PAGE (the roster): header, count cards, rows, ⋯ menu, toasts, bars.
// Why it exists: like Camps' text.js, every visible word lives in one file, typed once, so a screen never holds a
// sentence of its own and the words can be checked against the approved pictures (docs/Board Breaking/Mockups/
// B-staff-roster.png). Sentences EVERY section says (a refused change, "Someone else changed …", the Mark paid toast)
// come from src/components/text.js and are not repeated here. Apostrophes are straight (rulebook v1.141).

export const BACK_LABEL = 'Board breaking';
export const LOADING_EVENT = 'Loading the event';
export const EVENT_GONE = 'This event was deleted.';
export const LOAD_EVENT_FAILED = "Couldn't load this event. Check the connection, then retry.";

// ----- The header -----
const SCHOOL_NAMES = { worcester: 'Worcester', shrewsbury: 'Shrewsbury' };
export const schoolName = (code) => SCHOOL_NAMES[code] ?? '';

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// '2026-11-20' → "Fri, Nov 20, 2026" (worked out in UTC, so the computer's own time zone never moves the day).
export function longDate(iso) {
  const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(iso ?? '');
  if (!m) return '';
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return `${SHORT_DAYS[date.getUTCDay()]}, ${SHORT_MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${m[1]}`;
}
// "Fri, Nov 20, 2026 · Shrewsbury school · 10 registered"
export const eventSummary = (date, schoolCode, count) => `${longDate(date)} · ${schoolName(schoolCode)} school · ${count} registered`;

export const REGISTRATION = 'Registration';
export const OPEN = 'Open';
export const CLOSED = 'Closed';
export const ADD_STUDENT = 'Add student';
export const REGISTRATION_LINK = 'Registration link';
export const registrationToast = (open) => (open ? 'Registration opened' : 'Registration closed');
export const REGISTRATION_FAILED = "Registration wasn't changed. Check the connection, then retry.";

// ----- The Square box (admins) -----
export const squareCount = (n) => (n === 1 ? '1 Square payment needs a look' : `${n} Square payments need a look`);
export const SQUARE_LINE = 'The amount was different, or no student matched.';

// ----- Count cards, search, groups -----
export const CARD_REGISTERED = 'Registered';
export const CARD_PAID = 'Paid';
export const CARD_BROKE = 'Broke';
export const CARD_COLLECTED = 'Collected';
export const collectedNote = (dueText) => `of ${dueText} due`;
export const SHOWING_PAID = 'Showing paid only';
export const SHOWING_BROKE = 'Showing broke only';
export const FIND_STUDENT = 'Find a student';
export const CLEAR_SEARCH = 'Clear search';
export const noMatch = (query) => `No students match “${query}”.`;
export const CLEAR_FILTERS = 'Show all';
export const NO_STUDENTS = 'No students yet. Add one, or share the registration link.';
export const groupCount = (registered, broke) => `${registered} registered · ${broke} broke`;
export const STUDENTS_BY_CLASS = 'Students by class time';

// ----- Rows -----
export const COL_STUDENT = 'Student';
export const COL_BOARDS = 'Boards';
export const COL_PAYING_BY = 'Paying by';
export const COL_PAYMENT = 'Payment';
export const COL_BROKE = 'Broke';
export const COL_ACTIONS = 'Actions';
export const boardsText = (tech, adult) => `${tech} Technical · ${adult} Adult`;
export const SAME_DAY = 'Same day';
export const TAG_PAID = 'Paid';
export const TAG_NOT_PAID = 'Not paid';
export const TAG_AWAITING = 'Awaiting card payment';
export const TAG_NOT_SAVED = 'Not saved';
export const MARK_PAID = 'Mark paid';
export const BROKE = 'Broke';
export const markPaidFor = (name) => `Mark paid for ${name}`;
export const markBroke = (name) => `Mark ${name} broke`;
export const undoBrokeFor = (name) => `Undo broke for ${name}`;
export const moreFor = (name) => `More actions for ${name}`;
export const rowSub = (age, rank, tech, adult) => `${age} · ${rank} · ${boardsText(tech, adult)}`;

// ----- The ⋯ menu -----
export const EDIT_STUDENT = 'Edit student';
export const MOVE_TO_CLASS = 'Move to class…';
export const HISTORY = 'History';
export const UNDO_PAYMENT = 'Undo payment';
export const EDIT_PAYMENT = 'Edit payment';
export const RECORD_REFUND = 'Record refund';
export const UNDO_REFUND = 'Undo refund';
export const DELETE_STUDENT = 'Delete student';
export const UNDO_REFUND_FIRST = 'Undo the refund first.';
export const UNDO_REFUND_STANDS_STAFF = 'A refund was recorded for this student. Ask an admin to undo it first.';

// ----- Undo payment's question (the shared ConfirmBox) -----
export const KEEP_PAYMENT = 'Keep payment';
export const UNDOING = 'Undoing…';
export const undoPaymentBody = (name) => `${name} goes back to Not paid.`;
export const UNDO_PAYMENT_FAILED = "The payment wasn't undone. Check the connection, then retry.";
export const KEEP_REFUND = 'Keep refund';
export const undoRefundTitle = (name, money) => `Undo ${name}'s ${money} refund?`;
export const undoRefundBody = (name) => `The money counts as paid again for ${name}.`;
export const UNDO_REFUND_FAILED = "The refund wasn't undone. Check the connection, then retry.";

// ----- Toasts and bars -----
export const brokeToast = (name) => `${name} marked broke`;
export const notBrokeToast = (name) => `${name} marked not broke`;
export const refundUndoneToast = (name) => `Refund undone for ${name}`;
export const deletedToast = (name) => `${name} deleted`;
export const LINK_COPIED = 'Link copied';
export const alreadyPaid = (name) => `${name} is already marked paid.`;
export const markPaidFailed = (name) => `${name} wasn't marked paid. Check the connection, then retry.`;
export const brokeFailed = (name) => `${name}'s Broke box wasn't saved. Check the connection, then retry.`;
export const actionFailed = "That wasn't saved. Check the connection, then retry.";
export const ROSTER_NOT_ALLOWED = "You can't do that. Ask an admin.";
export const UNDO_PAYMENT_TOO_LATE = "Couldn't undo: staff can undo only their own payment, in the first 10 seconds. Ask an admin.";
export const SCHOOL_REFUSED = "This device's school isn't set. Choose it in the account menu, then try again.";
export const SETTINGS_FAILED = "Couldn't load the prices and the chart. Check the connection, then retry.";
export const MONEY_HIDDEN_LINE = 'Payment details are hidden on this tablet.';
export const PRIVATE_NOT_ALLOWED = 'That change could not be made.';
export const someoneElse = (name) => `Someone else changed ${name} just now, so nothing was done. Their change is shown.`;

// ----- The registration link box and its flyer -----
export const LINK_INTRO_OPEN = 'Registration is open. Families choose their class time and boards on the form, and pay by cash, check or card.';
export const LINK_INTRO_CLOSED = 'Registration is closed. The link shows a closed message until you open it.';
export const FLYER_SCHOOL = "Jae H. Jeong's U.S. Taekwondo Center";
export const FLYER_TITLE_SUFFIX = 'Board breaking';
export const flyerLocation = (school) => `Location: ${school} school`;
export const flyerScan = (shortLink) => `Scan the code or go to ${shortLink}`;
