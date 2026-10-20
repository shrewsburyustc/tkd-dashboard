// text.js — every word the Schedule screens show, in one place.
// Why it exists: same as Testing's text.js — one spot to check the wording against the approved
// mockup (docs/Prospects/TKD-Class-Schedule-Mockups.html, rulebook v0.233) and to change it later.
// The data layer only returns codes ('stale', 'step' …); this file turns them into plain English.
import { formatDate } from '../../lib/schedule/versions.js';
import { formatRange } from '../../lib/schedule/time.js';

export const PAGE_TITLE = 'Schedule';
export const VIEW_ONLY_LINE = 'View only. Ask an admin to make changes.';
export const ADD_TIME_SLOT = 'Add time slot';
export const ADD_SHORT = 'Add'; // phone header button
export const PLAN_A_CHANGE = 'Plan a change';
export const MORE_ACTIONS = 'More actions';
export const WHICH_SCHOOL = 'Which school?';
export const BOTH_SCHOOLS = 'Worcester and Shrewsbury';
export const whichSchoolFor = (kind) => (kind === 'add' ? 'Add a time slot to which school\'s schedule?' : 'Plan a change for which school?');
export const LOADING = 'Loading the schedule';

export const DAY_SHORT = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' };
export const DAY_LONG = { 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday', 7: 'Sunday' };

// ----- Which schedule (the dropdown) -----
export const SCHEDULE_PICKER = 'Which schedule';
export const GROUP_PLANNED = 'Planned';
export const GROUP_PAST = 'Past schedules';
export const currentLabel = (v) => `Current schedule · since ${formatDate(v.startsOn, { weekday: false })}`;
export const plannedLabel = (v) => `${v.name ?? 'Planned'} · starts ${formatDate(v.startsOn, { weekday: false })}`;
export const pastLabel = (v, endsOn) =>
  `${v.name ?? 'Schedule'} · ${formatDate(v.startsOn, { weekday: false, year: false })} – ${endsOn ? formatDate(endsOn, { weekday: false }) : ''}`;
export function plannedCount(n) {
  if (n === 0) return '';
  return n === 1 ? '1 change planned' : `${n} changes planned`;
}
export const plannedBar = (v) => `Starts ${formatDate(v.startsOn)}. Until then, the current schedule is used.`;
export const pastBar = (v, endsOn) =>
  `Past schedule: ${formatDate(v.startsOn, { weekday: false })} to ${endsOn ? formatDate(endsOn, { weekday: false }) : 'now'}. View only.`;
export const NO_CURRENT_BAR = 'No schedule has started yet. The first planned one starts on its date.';
export const SCHEDULE_MORE = (v) => `More for ${v.name ?? 'this planned schedule'}`;
export const startsLine = (v) => `Starts ${formatDate(v.startsOn)}`;
export const CHANGE_START_DATE = 'Change start date';
export const RENAME = 'Rename';
export const DELETE_PLANNED = 'Delete planned schedule';

// ----- Empty states -----
export const emptySchoolAdmin = (school) => `No classes on the ${school} schedule yet.`;
export const emptySchoolStaff = (school) => `No classes on the ${school} schedule yet. An admin adds them.`;
export const emptyVersion = 'No time slots in this schedule yet.';
export const NO_CLASSES_IN_TESTING = 'Add classes in Testing → Classes and ranks first. The schedule uses them.';
export const noClassesOnDay = (day) => `No classes on ${DAY_LONG[day]}.`;

// ----- Time slot dialog -----
export const ADD_SLOT_TITLE = 'Add time slot';
export const EDIT_SLOT_TITLE = 'Edit time slot';
export const VIEW_SLOT_TITLE = 'Time slot';
export const slotSubtitle = (school, versionLabel) => `${school} · ${versionLabel}`;
export const CLASS = 'Class';
export const CLASSES = 'Class (tick more than one if they are taught together)';
export const together = (names) => `Taught together: ${names.join(' + ')}`;
export const colorFor = (name) => `Color · ${name}`;
export const CLASS_HINT = 'From Testing → Classes and ranks';
export const CHOOSE_CLASS = 'Choose a class';
export const COLOR = 'Color';
export const colorHint = (className) => (className ? `Used for every ${className} time slot` : 'Used for every time slot of this class');
export const colorName = (label) => label; // the radio's checked state is announced by itself
export const DAYS = 'Days';
export const DAY = 'Day';
export const STARTS = 'Starts';
export const ENDS = 'Ends';
export const REMOVE = 'Remove';
export const CANCEL = 'Cancel';
export const SAVE = 'Save';
export const SAVING = 'Saving…';
export const REMOVING = 'Removing…';
export const CLOSE = 'Close';
export const BACK = 'Back';
export const UNDO = 'Undo';

export const PICK_CLASS = 'Tick at least one class.';
export const PICK_DAY = 'Tick at least one day.';
const TIME_PROBLEMS = {
  missing: 'Enter both times.',
  step: 'Use times on 5-minute steps, like 4:30 or 4:35.',
  order: 'The end time must be after the start time.',
  short: 'A class lasts at least 15 minutes.',
  long: 'A class lasts 4 hours at most.',
};
export const timeProblemText = (problem) => TIME_PROBLEMS[problem] ?? null;

// The amber "it still saves" note (decided v0.233: overlaps are allowed — two mats).
// Names every class it overlaps: "Overlaps Group A (5:00–5:45) and Group B (5:00–5:45) on Mon."
export function overlapNote(list) {
  const seen = new Set();
  const parts = [];
  for (const o of list) {
    const text = `${o.className} (${formatRange(o.start, o.end)})`;
    if (!seen.has(text)) {
      seen.add(text);
      parts.push(text);
    }
  }
  const names = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
  const days = [...new Set(list.map((o) => DAY_SHORT[o.weekday]))].join(' and ');
  return `Overlaps ${names} on ${days}. You can still save.`;
}

// ----- Plan a change / edit a planned schedule -----
export const PLAN_TITLE = 'Plan a schedule change';
export const EDIT_PLANNED_TITLE = 'Edit planned schedule';
export const NAME_OPTIONAL = 'Name (optional)';
export const NAME_PLACEHOLDER = 'Winter';
export const STARTS_ON = 'Starts on';
export const STARTS_ON_HINT = 'Must be after today. Until then, the current schedule is used.';
export const START_FROM = 'Start from';
export const copyOf = (label, count) => `Copy of ${label} (${count === 1 ? '1 time slot' : `${count} time slots`})`;
export const COPY_NOTHING = 'Copy (nothing to copy yet)';
export const BLANK = 'Blank';
export const DATE_PROBLEMS = {
  missing: 'Choose the day it starts.',
  notFuture: 'Choose a day after today.',
  taken: 'Another schedule already starts that day. Choose another day.',
};
export const NAME_TOO_LONG = 'Use 40 characters or fewer.';
export const NAME_BAD = "That name has a character that can't be used. Remove it.";

// ----- Delete a planned schedule (permanent → confirmation, rule 1.4) -----
export const deletePlannedTitle = (v) => `Delete the ${v.name ?? 'planned'} schedule?`;
// before: the name of the schedule that keeps running instead ("Current schedule", "Winter"…)
export function deletePlannedBody(v, count, before) {
  const slots = count === 0 ? 'It has no time slots.' : `Its ${count === 1 ? '1 time slot is' : `${count} time slots are`} deleted for good.`;
  const keeps = before ? `${before} keeps running` : 'The schedule before it keeps running';
  return `${slots} ${keeps} past ${formatDate(v.startsOn, { weekday: false })}. This can't be undone.`;
}
export const DELETE = 'Delete';

// ----- Notes, banners, toasts -----
export const UNSAVED = 'Unsaved changes. Save or cancel first.';
export const DISCARD_CHANGES = 'Discard changes';
export const STALE = "Someone else changed this just now. Your change wasn't saved.";
export const STALE_DIALOG = "Someone else changed this just now. Your change wasn't saved. Cancel, then open it again to see the latest.";
export const STALE_DIALOG_PHONE = "Someone else changed this just now. Your change wasn't saved. Discard changes, then open it again to see the latest.";
export const NOT_ALLOWED = "Only an admin can change the schedule. Your change wasn't saved.";
export const PAST_NOT_ALLOWED = "That schedule has already started or ended, so it can't change that way. Your change wasn't saved.";
export const INVALID_DIALOG = "That didn't save. Check the fields and try again.";
export const SAVE_FAILED = "Couldn't save. Check the connection, then try again.";
export const DELETE_FAILED = "Couldn't delete. Check the connection, then try again.";
export const LOAD_FAILED = "Couldn't load the schedule. Check the connection, then retry.";
export const COLOR_FAILED = "The time slot saved, but the color didn't. Check the connection, then try again.";
export const UNDO_STALE = "Couldn't undo. Someone else changed this just now.";
export const UNDO_FAILED = "Undo didn't save. Check the connection, then retry.";

export const TOAST_SLOT_SAVED = 'Time slot saved';
export const toastSlotsAdded = (n) => (n === 1 ? 'Time slot added' : `${n} time slots added`);
export const toastSlotRemoved = (day, className, start) => `${DAY_SHORT[day]} ${start} ${className} removed`;
export const TOAST_PLANNED = 'Planned schedule added';
export const TOAST_PLAN_SAVED = 'Planned schedule saved';
export const toastDeletedPlan = (v) => `${v.name ?? 'Planned'} schedule deleted`;
export const TOAST_UNDONE = 'Undone';

// The slot's accessible name on the grid: "Monday 4:00 to 4:45 pm, White belt".
export const slotLabel = (slot, className) =>
  `${DAY_LONG[slot.weekday]} ${formatRange(slot.start, slot.end, true).replace('–', ' to ')}, ${className}`;
