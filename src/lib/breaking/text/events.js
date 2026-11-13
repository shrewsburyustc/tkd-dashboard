// events.js — every word the Board breaking page frame, Events tab and Add / Edit event box show.
// Why it exists: like every section, the screens hold no sentences of their own; the words sit in one place so
// they can be checked against the approved pictures (docs/Board Breaking/Mockups/B-staff*.png) and changed in one
// spot. The data layer (breakingApi.js) only returns CODES such as 'stale' or 'has_payments'; this file turns them
// into plain English. Shared words that other sections already have (Cancel, "Someone else changed …", Retry) come
// from components/text.js, not from here.
import { shortDate } from '../../calendarDates.js';
import {
  CANCEL as SHARED_CANCEL,
  couldntUndo as sharedCouldntUndo,
  PAST_DAYS_HINT,
  someoneElseChanged as sharedSomeoneElseChanged,
  UNDO_DIDNT_SAVE as SHARED_UNDO_DIDNT_SAVE,
} from '../../../components/text.js';

export const CANCEL = SHARED_CANCEL;
export const someoneElseChanged = sharedSomeoneElseChanged;
export const couldntUndo = sharedCouldntUndo;
export const UNDO_DIDNT_SAVE = SHARED_UNDO_DIDNT_SAVE;
export { PAST_DAYS_HINT };

// ----- The page -----
export const PAGE_TITLE = 'Board breaking';
export const BACK_TO_TESTING = 'Testing';
export const BACK_ARIA = 'Back to Testing';
export const TAB_EVENTS = 'Events';
export const TAB_CHART = 'Chart and prices';
export const BOTH_SCHOOLS = 'Both schools';
// The line under the title: the school's name, or "Both schools".
export const schoolLine = (location) => (location === 'Both' ? BOTH_SCHOOLS : location);
export const SCHOOL_NAMES = { worcester: 'Worcester', shrewsbury: 'Shrewsbury' };
export const schoolName = (code) => SCHOOL_NAMES[code] ?? code;

// ----- The Events list -----
export const ADD_EVENT = 'Add event';
export const UPCOMING = 'Upcoming';
export const PAST = 'Past';
export const EVENTS_SWITCH_LABEL = 'Upcoming or past events';
export const COL_EVENT = 'Event';
export const COL_DATE = 'Date';
export const COL_SCHOOL = 'School';
export const COL_REGISTERED = 'Registered';
export const COL_REGISTRATION = 'Registration';
export const ACTIONS_COL = 'Actions';
export const sortBy = (column) => `Sort by ${column}`;
export const LOADING_EVENTS = 'Loading events';
export const NO_UPCOMING = 'No upcoming events.';
export const NO_PAST = 'No past events yet.';
export const NO_EVENTS_ADMIN = 'No board breaking events yet. Add the first one.';
export const NO_EVENTS_STAFF = 'No board breaking events yet. An admin adds them.';
export const STAFF_EVENTS_LINE = 'Staff see this list and open an event to run the day. Admins add, edit and delete events.';
export const TAG_OPEN = 'Registration open';
export const TAG_CLOSED = 'Registration closed';
export const registeredPaid = (registered, paid) => `${registered} registered · ${paid} paid`;
export const eventDate = (iso) => shortDate(iso);
export const eventPhoneDateLine = (iso, schoolText) => `${shortDate(iso)} · ${schoolText}`;
export const moreFor = (name) => `More actions for ${name}`;
export const editEventLabel = (name) => `Edit ${name}`;
export const openEventLabel = (name) => `Open ${name}`;
export const eventMenuSub = (event) => shortDate(event.eventDate);
export const EDIT_EVENT = 'Edit event';
export const DELETE_EVENT = 'Delete event';
export const LOAD_EVENTS_FAILED = "Couldn't load events. Check the connection, then retry.";
export const EVENTS_NOT_ALLOWED = "Only an admin can do that. Your change wasn't saved.";

// ----- Toasts -----
export const TOAST_EVENT_ADDED = 'Event added';
export const TOAST_EVENT_SAVED = 'Event saved';
export const deletedToast = (name) => `${name} deleted`;

// ----- Undo (the toast's Undo button, lib/saveLine.js) -----
export const UNDO_REASON_ADMIN_ONLY = 'only an admin can do that';
export const UNDO_REASON_HAS_PAYMENTS = 'a payment was recorded since';
export const UNDO_REASON_CLASS_IN_USE = 'students were added to a class since';
export const undoReasonSomeoneElse = (name) => `someone else changed ${name} just now`;

// ----- Delete event (the shared "are you sure?" box) -----
export const deleteEventTitle = (name) => `Delete ${name}?`;
export const KEEP_EVENT = 'Keep event';
export const DELETING = 'Deleting…';
export const DELETE_FAILED = "Couldn't delete. Check the connection, then retry.";
export const DELETE_HAS_PAYMENTS = "This event has payments recorded, so it can't be deleted.";
// What goes with it: its students (if any). Payments block the delete, so they are never in this sentence.
// An event with payments can't be deleted at all (money is never removed), so say that instead of "N students are deleted".
export const DELETE_BLOCKED_BODY = "Payments are recorded for this event, so it can't be deleted (money is never removed). Close registration instead.";
export const deleteEventBody = (registered, paid = 0) =>
  paid > 0
    ? DELETE_BLOCKED_BODY
    : registered > 0
    ? `Its ${registered} registered ${registered === 1 ? 'student is' : 'students are'} deleted with it. This can't be undone.`
    : "Nothing is registered yet. This can't be undone.";

// ----- Add / Edit event -----
export const ADD_EVENT_TITLE = 'Add event';
export const EDIT_EVENT_TITLE = 'Edit event';
export const addEventSub = (school) => `${school} school (the school in the top bar). Prices come from Chart and prices.`;
export const ADD_EVENT_SUB_BOTH = 'Choose the school. Prices come from Chart and prices.';
export const editEventSub = (school) => `${school} school. Prices come from Chart and prices.`;
export const EVENT_NAME = 'Event name';
export const DATE = 'Date';
export const SCHOOL = 'School';
export const CHOOSE = 'Choose…';
export const CLASS_TIMES = 'Class times';
export const ADD_CLASS = 'Add class';
export const TIME_TO = 'to';
export const NO_TIME = 'Time';
export const startTimeLabel = (className) => `${className === '' ? 'Class' : className} start time`;
export const endTimeLabel = (className) => `${className === '' ? 'Class' : className} end time`;
export const classNameLabel = (position) => `Class name, class ${position}`;
export const dragClass = (name) => `Drag to reorder ${name === '' ? 'class' : name}`;
export const classMore = (name) => `More actions for ${name === '' ? 'this class' : name}`;
export const MOVE_UP = 'Move up';
export const MOVE_DOWN = 'Move down';
export const REMOVE_CLASS = 'Remove class';
export const copiedFromEvent = (name) =>
  `Copied from ${name}. Use ⋯ to move a class up or down or remove it. A class with students in it can't be removed.`;
export const FIRST_EVENT_HINT = 'Add the class times for this event. Use ⋯ to move a class up or down or remove it.';
export const EDIT_CLASSES_HINT = "Use ⋯ to move a class up or down or remove it. A class with students in it can't be removed.";
export const REGISTRATION = 'Registration';
export const REG_OPEN = 'Open';
export const REG_CLOSED = 'Closed';
export const PRICES_HINT = 'Prices and the board chart come from the Chart and prices tab, not from the event.';
export const SAVE = 'Save';
export const SAVING = 'Saving…';

// Field messages (amber, under the field)
export const ENTER_EVENT_NAME = 'Enter an event name.';
export const EVENT_NAME_LONG = 'The event name can be at most 80 characters.';
export const ENTER_DATE = 'Enter the event date.';
export const DATE_PAST = "The date can't be in the past.";
export const ENTER_SCHOOL = 'Choose the school.';
export const ENTER_CLASS_NAME = 'Enter a class name.';
export const SET_BOTH_TIMES = 'Set a start and an end time.';
export const END_AFTER_START = 'The end time must be after the start time.';
export const ADD_ONE_CLASS = 'Add at least one class.';

// Notes inside the dialog (amber, above the buttons)
export const UNSAVED = 'Unsaved changes. Save or cancel first.';
export const DISCARD_CHANGES = 'Discard changes';
export const STALE_DIALOG = "Someone else changed this just now. Your change wasn't saved. Cancel, then open it again to see the latest.";
export const STALE_DIALOG_PHONE = "Someone else changed this just now. Your change wasn't saved. Discard changes, then open it again to see the latest.";
export const EVENT_NOT_ALLOWED = "Only an admin can add or change events. Your change wasn't saved.";
export const INVALID_DIALOG = "That didn't save. Check the fields and try again.";
export const SAVE_FAILED = "Couldn't save. Check the connection, then retry.";
export const classInUse = (name) => `${name === '' ? 'That class' : name} still has students, so it can't be removed.`;
// The event was added but a later step (its class times, or the Registration switch) didn't save.
export const CLASSES_NOT_SAVED = "The event was added, but its class times or registration setting didn't save. Open Edit event to check them.";
export const HAS_STUDENTS = 'Has students';
