// text.js — every word the Calendar screens show, in one place.
// Why it exists: same as the Schedule's text.js — one spot to check the wording against the
// approved mockup (docs/Prospects/TKD-Calendar-Mockups.html, rulebook v0.138 / v0.143) and to
// change it later. The data layer only returns codes ('stale', 'tooLong' …); this file turns
// them into plain English.
import { formatDate } from '../../lib/schedule/versions.js';
import { formatTime } from '../../lib/schedule/time.js';

export const PAGE_TITLE = 'Calendar';
export const VIEW_ONLY_LINE = 'View only — ask an admin to make changes.';
export const ADD = 'Add';
export const ADD_EVENT = 'Event';
export const ADD_CLOSURE = 'Closure';
export const ADD_MENU = 'Add to the calendar';
export const MORE_ACTIONS = 'More actions';
export const EVENT_TYPES = 'Event types';
export const LOADING = 'Loading the calendar';
export const BOTH_SCHOOLS = 'Both schools';
export const SCHOOL_LETTER = { worcester: 'W', shrewsbury: 'S' };
export const SCHOOL_NAME = { worcester: 'Worcester', shrewsbury: 'Shrewsbury' };

// ----- Toolbar -----
export const TODAY = 'Today';
export const MONTH = 'Month';
export const WEEK = 'Week';
export const VIEW = 'View';
export const PREVIOUS_MONTH = 'Previous month';
export const NEXT_MONTH = 'Next month';
export const PREVIOUS_WEEK = 'Previous week';
export const NEXT_WEEK = 'Next week';
const MONTH_FMT = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' });
export const monthTitle = (date) => MONTH_FMT.format(new Date(`${date}T12:00:00Z`));
export function weekTitle(first, last, withYear = true) {
  const a = formatDate(first, { weekday: false, year: false });
  const sameMonth = first.slice(0, 7) === last.slice(0, 7);
  const b = sameMonth ? String(Number(last.slice(8, 10))) : formatDate(last, { weekday: false, year: false });
  return `${a} – ${b}${withYear ? `, ${last.slice(0, 4)}` : ''}`;
}

export const DAY_HEADS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const LONG_FMT = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' });
export const longDate = (date) => LONG_FMT.format(new Date(`${date}T12:00:00Z`));

// ----- Month boxes -----
export const classCount = (n) => (n === 1 ? '1 class' : `${n} classes`);
export const cancelledCount = (n) => (n === 1 ? '1 class cancelled' : `${n} classes cancelled`);
export const moreCount = (n) => `+${n} more`;
export const someCancelled = (n) => `${n} cancelled`;
export const dragType = (name) => `Drag to reorder ${name}`;
export const typeMore = (name) => `More actions for ${name}`;
export const EDIT = 'Edit';
export const MOVE_UP_ITEM = 'Move up';
export const MOVE_DOWN_ITEM = 'Move down';
export const DELETE_TYPE = 'Delete type';
export const CHECKING = 'Checking which events use it…';
export const closedChip = (closure) => (closure.wholeDay ? `Closed · ${closure.reason}` : closure.reason);
export const scheduleStartsChip = (name) => `${name ?? 'New'} schedule starts`;
export const partOf = (part) => (part ? ` (${part.index} of ${part.total})` : '');
export function dayLabel(date, info, isToday) {
  const bits = [longDate(date)];
  if (isToday) bits.push('today');
  for (const c of info.closures) bits.push(closedChip(c.closure));
  for (const s of info.scheduleStarts) bits.push(scheduleStartsChip(s.name));
  for (const e of info.events) bits.push(e.event.title);
  for (const t of info.testing) bits.push(t.title);
  if (info.classCount) {
    if (info.cancelledCount === info.classCount) bits.push(`${classCount(info.classCount)}, all cancelled`);
    else if (info.cancelledCount > 0) bits.push(`${info.cancelledCount} of ${classCount(info.classCount)} cancelled`);
    else bits.push(classCount(info.classCount));
  }
  if (info.bookingCount) bits.push(info.bookingProblems ? `${freeCount(info.bookingCount)}, ${info.bookingProblems} on a cancelled class` : freeCount(info.bookingCount));
  return bits.join(', ');
}

export const freeCount = (n) => (n === 1 ? '1 free class' : `${n} free classes`);
export const freeChip = (n, problems) => (problems ? `${freeCount(n)} · ${problems === n ? 'class cancelled' : `${problems} cancelled`}` : freeCount(n));
export const FREE_CLASSES = 'Free classes';
export const freeLine = (b) => `${b.childFirstName} · ${b.className}`;
export const FREE_FROM = (form) => `Booked with ${form}`;
export const CLASS_GONE = 'Class cancelled — call the family';
export const freeBadge = (n) => (n === 1 ? '1 free-class booking' : `${n} free-class bookings`);
export const closureBookings = (n) => `${n === 1 ? '1 free-class booking is' : `${n} free-class bookings are`} on these classes — you'll need to call ${n === 1 ? 'the family' : 'the families'}.`;

// ----- Day panel -----
export const todayLine = (school) => `Today · ${school}`;
export const EVENTS = 'Events';
export const CLASSES = 'Classes';
export const classesOf = (school) => `${school} classes`;
export const NO_CLASSES_DAY = 'No classes this day.';
export const NOTHING_ON_DAY = 'Nothing else on this day.';
export const ALL_DAY = 'All day';
export function eventTime(time) {
  switch (time.kind) {
    case 'range':
      return formatTime(time.start, true);
    case 'from':
      return `from ${formatTime(time.start, true)}`;
    case 'until':
      return `until ${formatTime(time.end, true)}`;
    default:
      return ALL_DAY;
  }
}
export const closedLine = (closure, count) =>
  closure.wholeDay ? `Closed all day · ${closure.reason}` : `${closure.reason} · ${cancelledCount(count)}`;
export const orphanLine = (record) => `Cancelled class no longer on the schedule: ${record.classNames} ${formatTime(record.start)}`;
export const CANCELLED = 'cancelled';
export const editThing = (what) => `Edit ${what}`;
export const viewThing = (what) => `View ${what}`;
export const TESTING_FROM = 'From Testing. Open Testing to change it.';

// ----- Week view -----
export const ALL_DAY_ROW = 'All day';

// ----- Event dialog -----
export const ADD_EVENT_TITLE = 'Add event';
export const EDIT_EVENT_TITLE = 'Edit event';
export const VIEW_EVENT_TITLE = 'Event';
export const TITLE = 'Title';
export const TYPE = 'Type';
export const ALL_DAY_BOX = 'All day';
export const STARTS = 'Starts';
export const ENDS = 'Ends';
export const DATE = 'Date';
export const TIME = 'Time';
export const startDate = 'Start date';
export const endDate = 'End date';
export const startTime = 'Start time';
export const endTime = 'End time';
export const SCHOOL = 'School';
export const BOTH = 'Both';
export const MORE_DETAILS = 'More details (notes)';
export const NOTES = 'Notes';
export const NOTES_HINT = "Don't put student details here (names, health, phone numbers). Notes are kept in the change history.";
export const NO_TYPES = 'Add an event type first: ⋯ → Event types.';
export const CHOOSE_TYPE = 'Choose a type';
export const VIEW_ONLY_DIALOG = 'View only — ask an admin to change this.';

// ----- Closure dialog -----
export const ADD_CLOSURE_TITLE = 'Add closure';
export const EDIT_CLOSURE_TITLE = 'Edit closure';
export const VIEW_CLOSURE_TITLE = 'Closure';
export const REASON = 'Reason';
export const REASON_HINT = 'Shown on the calendar, e.g. "Snow storm", "Thanksgiving"';
export const FROM = 'From';
export const TO = 'To';
export const WHATS_CANCELLED = "What's cancelled";
export const ALL_CLASSES = 'All classes';
export const SOME_CLASSES = 'Some classes';
export const SOME_ONE_DAY = 'Some classes is for a single day. Set From and To to the same day.';
export const someCount = (date, n) => `${formatDate(date)} · ${n === 1 ? 'this 1 is' : `these ${n} are`} cancelled`;
export const NO_CLASSES_THAT_DAY = 'No classes on the schedule that day.';
export const PICK_A_CLASS = 'Tick at least one class.';
export const ORPHANS_NOTE = 'No longer on the schedule (will be dropped when you save):';

// ----- Event types -----
export const TYPES_SUB = 'Colors used on the calendar. Shared by both schools.';
export const ADD_TYPE = 'Add type';
export const ADD_TYPE_TITLE = 'Add event type';
export const EDIT_TYPE_TITLE = 'Edit event type';
export const NAME = 'Name';
export const COLOR = 'Color';
export const usedBy = (n) => (n === null ? '' : n === 0 ? 'Not used by any event' : n === 1 ? 'Used by 1 event' : `Used by ${n} events`);
export const editTypeLabel = (name) => `Edit ${name}`;
export const NO_TYPES_YET = 'No event types yet. Add one, like Tournament or Camp.';
export const deleteTypeTitle = (name) => `Delete ${name}?`;
export const deleteTypeBody = (name, n) =>
  n === 0
    ? `${name} isn't used by any event. This can't be undone.`
    : `${n === 1 ? '1 event uses' : `${n} events use`} ${name}. Pick the type ${n === 1 ? 'it moves' : 'they move'} to. This can't be undone.`;
export const MOVE_TO = 'Move to';
export const LAST_TYPE_IN_USE = "This is the only type and events use it. Add another type first, then delete this one.";
export const DUPLICATE_TYPE = 'Another event type already has this name.';

// ----- Shared form words -----
export const CANCEL = 'Cancel';
export const SAVE = 'Save';
export const SAVING = 'Saving…';
export const REMOVE = 'Remove';
export const REMOVING = 'Removing…';
export const DELETE = 'Delete';
export const DELETING = 'Deleting…';
export const CLOSE = 'Close';
export const UNDO = 'Undo';
export const DISCARD_CHANGES = 'Discard changes';
const TEXT_PROBLEMS = { empty: 'Required.', tooLong: (max) => `Use ${max} characters or fewer.`, badCharacter: 'Remove the hidden or special character.' };
export const textProblemText = (code, max) => (typeof TEXT_PROBLEMS[code] === 'function' ? TEXT_PROBLEMS[code](max) : TEXT_PROBLEMS[code]);
export const NOTES_TOO_LONG = 'Use 1,000 characters or fewer.';
export const NOTES_BAD = 'Remove the tab or hidden character.';
const DATE_PROBLEMS = {
  missing: 'Pick a date.',
  endsBefore: 'The end is before the start.',
  tooLong: 'At most 31 days. Check the end date.',
  outOfRange: 'Check the year.',
  step: 'Use 5-minute steps (e.g. 7:30, 7:35).',
};
export const dateProblemText = (code, what) =>
  code === 'tooLong' ? `A ${what} can be at most 31 days. Check the end date.` : DATE_PROBLEMS[code] ?? '';
export const TIME_MISSING = 'Set a start and end time, or tick All day.';

// ----- Notes in dialogs (amber) -----
export const UNSAVED = 'Unsaved changes. Save or cancel first.';
export const STALE_DIALOG = 'Someone else changed this. Close and open it again to see the latest.';
export const STALE_DIALOG_PHONE = 'Someone else changed this. Go back and open it again.';
export const NOT_ALLOWED = "Only admins can change the calendar. Your access may have changed.";
export const INVALID_DIALOG = "Some values weren't accepted. Check them and try again.";
export const SAVE_FAILED = "Couldn't save. Check the connection and try again.";
export const DELETE_FAILED = "Couldn't delete. Check the connection and try again.";

// ----- Toasts and banners -----
export const TOAST_EVENT_ADDED = 'Event added';
export const TOAST_EVENT_SAVED = 'Event saved';
export const toastEventRemoved = (title) => `Removed ${title}`;
export const TOAST_CLOSURE_ADDED = 'Closure added';
export const TOAST_CLOSURE_SAVED = 'Closure saved';
export const toastClosureRemoved = (reason) => `Removed closure: ${reason}`;
export const TOAST_TYPE_ADDED = 'Event type added';
export const TOAST_TYPE_SAVED = 'Event type saved';
export const toastTypeDeleted = (name) => `${name} deleted`;
export const TOAST_UNDONE = 'Undone';
export const LOAD_FAILED = "Couldn't load the calendar. Check the connection and try again.";
export const UNDO_STALE = "Couldn't undo: it changed meanwhile. The calendar now shows the latest.";
export const UNDO_FAILED = "Couldn't undo. Check the connection and try again.";
export const STALE = 'Someone else changed this. The calendar now shows the latest.';
