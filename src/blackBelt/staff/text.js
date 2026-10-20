// text.js — every word the Black Belt testing staff screens show, in one place.
// Why it exists: contract CONTRACT-0016-B1 §0 — the data layer (src/lib/blackBelt) returns only
// codes such as 'stale' or 'part_without_day'; the screens turn them into words here. The
// sentences come from the approved mockups (TKD-BlackBelt-Cycles-Mockups.html, Cycles 1–8, with
// the v0.902 redraw) and the contract's tables. Anything the mockups don't show is marked
// "(not in the mockups)" so it can be listed for Jeffrey's walkthrough (CP2).
//
// Dates: the database sends school dates as 'YYYY-MM-DD' text. They are turned into a date on
// THIS computer's calendar with new Date(year, month - 1, day) — never new Date('YYYY-MM-DD'),
// which would read the text as UTC midnight and could show the day before.

import { formatCents } from '../../lib/blackBelt/money.js';

// ===== Dates, times, money =====
function parseDay(iso) {
  if (typeof iso !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}
const dayText = (iso, options) => parseDay(iso)?.toLocaleDateString('en-US', options) ?? '';

// "Sat, Apr 3, 2027"
export const shortDate = (iso) => dayText(iso, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
// "Sat, Mar 27"
export const weekdayMonthDay = (iso) => dayText(iso, { weekday: 'short', month: 'short', day: 'numeric' });
// "Mar 27"
export const monthDay = (iso) => dayText(iso, { month: 'short', day: 'numeric' });

// A moment in time (a timestamp) as a date in Massachusetts time: "Feb 2, 2027".
export function stampDate(stamp) {
  if (!stamp) return '';
  const date = new Date(stamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric' });
}

// "14:30" (or "14:30:00") → { text: '2:30', suffix: 'PM' }
function timeParts(hhmm) {
  const match = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? '');
  if (!match) return null;
  const hours = Number(match[1]);
  return { text: `${hours % 12 === 0 ? 12 : hours % 12}:${match[2]}`, suffix: hours < 12 ? 'AM' : 'PM' };
}
// "14:30" → "2:30 PM"
export function timeLabel(hhmm) {
  const parts = timeParts(hhmm);
  return parts ? `${parts.text} ${parts.suffix}` : '';
}
// "12:30"–"14:30" → "12:30–2:30 PM" (one AM/PM when both match); "11:30 AM–1:00 PM" otherwise.
export function timeRange(start, end) {
  const a = timeParts(start);
  const b = timeParts(end);
  if (!a || !b) return '';
  if (a.suffix === b.suffix) return `${a.text}–${b.text} ${b.suffix}`;
  return `${a.text} ${a.suffix}–${b.text} ${b.suffix}`;
}

// ===== Common words =====
export const SAVE = 'Save';
export const SAVING = 'Saving…';
export const CANCEL = 'Cancel';
export const CLOSE = 'Close';
export const BACK = 'Back';
export const UNDO = 'Undo';
export const RETRY = 'Retry';
export const DISMISS = 'Dismiss';
export const ACTIONS_COL = 'Actions';
export const UNSAVED = 'Unsaved changes. Save or cancel first.';
export const DISCARD_CHANGES = 'Discard changes'; // phones: the link inside the note (v0.56)

// ===== Statuses from the data layer (contract §1.2 "Status → what the staff screens say") =====
export const NOT_ALLOWED = "Only an admin can do that. Your change wasn't saved.";
export const STALE_DIALOG = 'Someone else changed this cycle just now. Close and open it again to see their change.';
export const STALE_SETTINGS = 'Someone else changed this just now. Close and open it again to see their change.'; // Rubric and prices (not in the mockups)
export const SWITCH_STALE = "Couldn't change registration. Someone else changed this cycle just now.";
export const duplicateCycle = (name) => `There's already a cycle called ${name}. Try another name.`;
export const WAIVER_NEEDED = "Save the school's waiver on Rubric and prices first.";
export const FINISHED = "This cycle is finished, so registration can't change."; // (not in the mockups)
export const HAS_PAYMENTS = 'Payments are recorded for this cycle.';
export const HAS_WAIVERS = 'Families signed waivers on the form for this cycle.'; // (not in the mockups, OP-6)
export const CYCLE_DELETED = 'This cycle was deleted.';
export const INVALID = "That didn't save. Check the fields and try again.";
export const SAVE_FAILED = "Couldn't save. Check the connection, then try again.";
export const LOAD_FAILED = "Couldn't load. Check the connection, then try again.";
export const DELETE_FAILED = "Couldn't delete. Check the connection, then try again."; // (not in the mockups)
export const DELETE_STALE = "Couldn't delete. Someone else changed this cycle just now."; // (not in the mockups)
export const UNDO_FAILED = "Undo didn't save. Check the connection, then retry."; // (not in the mockups)
export const UNDO_STALE = "Couldn't undo. Someone else changed this cycle just now."; // (not in the mockups)
export const REOPEN_NEEDS_ADMIN = 'The application date has passed. Ask an admin to reopen.';
// OP-4: the cycle saved, the Registration switch (a second call) didn't. (not in the mockups)
export const registrationNotChanged = (reason) => `The cycle was saved, but registration didn't change: ${reason}`;
export const COPY_FAILED = "Couldn't copy the link. Open Registration links on the cycle page and copy it from there."; // (not in the mockups)
export const QR_FAILED = "Couldn't make the QR code picture. Try again."; // (not in the mockups)

// The reason words used inside registrationNotChanged / banners, by status.
export function switchProblem(status) {
  if (status === 'waiver_needed') return WAIVER_NEEDED;
  if (status === 'finished') return FINISHED;
  if (status === 'not_allowed') return NOT_ALLOWED;
  if (status === 'stale') return SWITCH_STALE;
  return SAVE_FAILED;
}

// ===== Toasts =====
export const TOAST_REG_CLOSED = 'Registration closed';
export const TOAST_REG_OPEN = 'Registration open';
export const TOAST_REG_OPEN_DATE_REMOVED = 'Registration open. The automatic closing date was removed.';
export const TOAST_LINK_COPIED = 'Link copied';
export const TOAST_QR_DOWNLOADED = 'QR code downloaded';
export const TOAST_CYCLE_DELETED = 'Cycle deleted';
export const TOAST_CYCLE_ADDED = 'Cycle added';
export const TOAST_CHANGES_SAVED = 'Changes saved';
export const toastWaiverSaved = (version) => `Waiver saved · version ${version}`;
export const TOAST_KEEPING_SAVED = 'Keeping time saved'; // (not in the mockups, OP-8)
export const TOAST_UNDONE = 'Undone';

// ===== Cycles 2 / 3 · Black Belt home and the Cycles tab =====
export const BACK_TO_TESTING = 'Testing';
export const PAGE_TITLE = 'Black Belt testing';
export const ADD_CYCLE = 'Add cycle';
export const TAB_CYCLES = 'Cycles';
export const TAB_RUBRIC = 'Rubric and prices';
export const STAFF_CYCLES_LINE =
  'Staff can open or close registration from ⋯ until the application date. Ask an admin to add or change cycles.';
export const VIEW_ONLY = 'View only. Ask an admin to make changes.';
export const UPCOMING = 'Upcoming';
export const PAST = 'Past';
export const SIDE_SWITCH_LABEL = 'Show upcoming or past cycles'; // screen readers only (not in the mockups)
export const COL_CYCLE = 'Cycle';
export const COL_FIRST_DAY = 'First testing day';
export const COL_CANDIDATES = 'Candidates';
export const COL_STATUS = 'Status';
export const sortBy = (label) => `Sort by ${label}`;
export const LOADING_CYCLES = 'Loading Black Belt testing cycles';
export const NO_CYCLES_ADMIN = 'No Black Belt testing cycles yet.';
export const NO_CYCLES_STAFF = 'No Black Belt testing cycles yet. An admin adds them.';
export const NO_UPCOMING = 'No upcoming cycles.';
export const NO_PAST = 'No past cycles yet.';

export const candidatesCount = (n) => (n === 1 ? '1 candidate' : `${n} candidates`);
// Phone row line 2: "Sat, Apr 3, 2027 · 6 candidates"
export const phoneLine = (firstDay, count) => `${shortDate(firstDay)} · ${candidatesCount(count)}`;

// The one status tag (rules.cycleTag → { kind, date }).
export function tagText(tag) {
  if (!tag) return '';
  switch (tag.kind) {
    case 'testing_today':
      return 'Testing today';
    case 'open':
      return tag.date ? `Open until ${monthDay(tag.date)}` : 'Open';
    case 'open_until':
      return `Open until ${monthDay(tag.date)}`;
    case 'not_open_yet':
      return 'Not open yet';
    case 'next_day':
      return `Next day ${monthDay(tag.date)}`;
    case 'registration_closed':
    case 'closed':
      return 'Registration closed';
    case 'past':
      return 'Past';
    default:
      return '';
  }
}
// Green ("good") only while families can register (as drawn).
export const tagIsOk = (tag) => tag?.kind === 'open' || tag?.kind === 'open_until';

// Row labels and the ⋯ menu
export const openCycleLabel = (name) => `Open ${name}`;
export const editCycleLabel = (name) => `Edit ${name}`;
export const moreFor = (name) => `More actions for ${name}`;
export const COPY_WORCESTER_LINK = 'Copy Worcester link';
export const COPY_SHREWSBURY_LINK = 'Copy Shrewsbury link';
export const copySchoolLink = (school) => `Copy ${school} link`;
export const CLOSE_REGISTRATION = 'Close registration';
export const OPEN_REGISTRATION = 'Open registration';
export const DELETE_CYCLE = 'Delete cycle';
export const EDIT_CYCLE = 'Edit cycle';
export const REGISTRATION_LINKS = 'Registration links';

// OP-6: the Delete cycle confirmation (not in the mockups)
export const deleteCycleTitle = (name) => `Delete ${name}?`;
// No candidates → the candidates part is left out (not "…and its 0 candidates"); 1 → "1 candidate".
export const deleteCycleBody = (count) =>
  count > 0
    ? `This removes the cycle, its testing days and prices, and its ${candidatesCount(count)}. This can't be undone.`
    : "This removes the cycle, its testing days and prices. This can't be undone.";

// ===== Cycles 4 · Add cycle / Edit cycle =====
export const ADD_CYCLE_TITLE = 'Add cycle';
export const EDIT_CYCLE_TITLE = 'Edit cycle';
export const ADD_CYCLE_SUB = 'Both schools test together.';
export const editCycleSub = (name, count) => `${name} · ${candidatesCount(count)}`;
export const CYCLE_NAME = 'Cycle name';
// "Fall 2026 starting point" → "Fall 2026" (contract §7.3)
export const fromName = (pricesFrom) => String(pricesFrom ?? '').replace(/ starting point$/, '');
export const copiedHint = (from) => `Testing days, deadlines and due dates copied from ${from}. Change the dates.`;
export const TESTING_DAYS = 'Testing days';
export const ADD_TESTING_DAY = 'Add testing day';
export const editDayLabel = (name) => `Edit ${name}`;
export const deleteDayLabel = (name) => `Delete ${name}`;
export const SECOND_PART = 'Second part';
export const PART_NAMES = { physical: 'Physical', technical: 'Technical', curriculum: 'Curriculum' };
export const PART_ORDER = ['physical', 'technical', 'curriculum'];
export const gradedLine = (parts) => `Graded: ${PART_ORDER.filter((p) => parts.includes(p)).map((p) => PART_NAMES[p]).join(', ')}`;
export const NO_DAYS_YET = 'No testing days yet.'; // (not in the mockups)

// v0.209 detail 1: "Curriculum isn't graded on any testing day. …" / two or three parts.
export function partsWithoutDayText(parts) {
  const names = PART_ORDER.filter((p) => parts.includes(p)).map((p) => PART_NAMES[p]);
  const tail = 'Tick it on a day, or add a testing day.';
  if (names.length === 1) return `${names[0]} isn't graded on any testing day. ${tail}`;
  const list = names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${list} aren't graded on any testing day. Tick them on a day, or add a testing day.`;
}

export const DEADLINES = 'Deadlines';
export const APPLICATION_DUE = 'Application due';
export const SUBMISSIONS_DUE = 'Submissions due';
export const SUBMISSIONS_HINT =
  'Hand-in work (egg test, meditation, appreciation letter, TKD project) is due by the submissions date.';

export const PRICES = 'Prices and payment due dates';
export const pricesFromHint = (from) =>
  `Filled in from the ${from} prices. Change anything before you save — prices can't be changed after the cycle is saved.`;
export const PRICES_SET = 'Prices are set when the cycle is saved. Due dates can still change.';
export const paymentsCount = (n) => (n === 1 ? '1 payment' : `${n} payments`);
export const removePlanLabel = (name) => `Remove ${name || 'plan'}`;
export const dragPlanLabel = (name) => `Drag to reorder ${name || 'plan'}`;
export const GRIP_TOOLTIP = 'Drag to reorder';
export const MOVE_UP = 'Move up';
export const MOVE_DOWN = 'Move down';
export const planMoreLabel = (name) => `More actions for ${name || 'plan'}`;
export const COL_DUE = 'Due';
export const DAN_LABELS = { 1: '1st Dan', 2: '2nd Dan', 3: '3rd Dan', 4: '4th Dan' };
export const DAN_SHORT = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' };
export const COL_DAN = 'Dan';
export const DUE_DATES = 'Due dates';
export const paymentLabel = (n) => `Payment ${n}`;
export const payShort = (n) => `Pay ${n}`;
export const TOTAL = 'Total';
export const PLAN_NAME_LABEL = 'Plan name'; // the name field in the Add plan dialog
export const amountLabel = (planName, dan, n) => `${planName || 'Plan'}, ${DAN_LABELS[dan]}, payment ${n}`;
export const dueDateLabel = (planName, n) => `${planName || 'Plan'}, payment ${n} due date`;
export const ADD_PLAN = 'Add plan';
export const KUKKIWON_FEE = 'Kukkiwon certificate fee';
export const KUKKIWON_HINT =
  'Optional for each candidate. Added to payment 1, so it is paid in the same check (e.g. 1st Dan on 3 payments: $290 + $100 = $390). Payment 1 follows Application due until you change it.';

// "+ Add plan" asks the name and the number of payments first (not in the mockups).
export const ADD_PLAN_TITLE = 'Add plan';
export const NUMBER_OF_PAYMENTS = 'Number of payments';
export const NUMBER_OF_PAYMENTS_HINT = 'From 1 to 12. Then type the amounts and due dates in the grid.';
export const ADD = 'Add';
export const PAYMENTS_RANGE = 'Choose a number from 1 to 12.';

export const REGISTRATION = 'Registration';
export const REG_OPEN = 'Open';
export const REG_CLOSED = 'Closed';
export const autoCloseLabel = (applicationDue) =>
  applicationDue ? `Close automatically at the end of Application due (${weekdayMonthDay(applicationDue)})` : 'Close automatically at the end of Application due';
export const AUTO_CLOSE_HINT = '11:59 PM, Massachusetts time. You can close registration yourself at any time.';
export const lastChanged = (name, stamp) => `Last changed by ${name} · ${stampDate(stamp)}`;

// OP-10 / OP-11 / OP-18: field errors (all not in the mockups)
export const ENTER_CYCLE_NAME = 'Enter a cycle name.';
export const NAME_TOO_LONG = 'Use 60 characters or fewer.';
export const NAME_BAD_CHARACTER = "That name has a character that can't be used. Remove it.";
export const DATE_TODAY_OR_LATER = 'Choose today or a later date.';
export const ENTER_DATE = 'Choose a date.';
export const ON_OR_BEFORE_LAST_DAY = 'Must be on or before the last testing day.';
export const END_AFTER_START = 'Choose an end time after the start time.';
export const secondStartsAfter = (end) => `The second part starts at or after ${timeLabel(end)}.`;
export const ENTER_PLACE = 'Enter the place.';
export const PLACE_TOO_LONG = 'Use 100 characters or fewer.';
export const PRICE_RANGE = 'Whole dollars from $1 to $5,000.';
export const PLAN_NAME_TAKEN = 'Another plan has this name.';
export const ADD_ONE_PLAN = 'Add at least one plan.';
export const ENTER_PLAN_NAME = 'Enter a plan name.';
export const TICK_ONE_PART = 'Tick at least one part graded this day.';
export const ENTER_DAY_NAME = 'Enter a name.';
export const TOO_MANY_DAYS = 'A cycle has at most 20 testing days.';
export const TOO_MANY_PLANS = 'A cycle has at most 10 plans.';
export const DUE_ON_OR_BEFORE_LAST_DAY = 'Must be on or before the last testing day.';

export const ADD_ONE_DAY = 'Add at least one testing day.'; // (not in the mockups)
export const TEXT_BAD_CHARACTER = "That text has a character that can't be used. Remove it."; // (not in the mockups)

// Codes from rules.js → the words under a field.
export function nameProblemText(code, emptyText) {
  if (code === 'empty') return emptyText;
  if (code === 'tooLong') return NAME_TOO_LONG;
  if (code === 'badCharacter') return NAME_BAD_CHARACTER;
  if (code === 'duplicate') return PLAN_NAME_TAKEN;
  return null;
}
export function dateProblemText(code) {
  if (code === 'missing') return ENTER_DATE;
  if (code === 'past') return DATE_TODAY_OR_LATER;
  if (code === 'afterLastDay') return ON_OR_BEFORE_LAST_DAY;
  if (code) return ENTER_DATE;
  return null;
}
export function timeProblemText(code, firstEnd) {
  if (code === 'missing' || code === 'badTime') return CHOOSE_TIME_ERROR;
  if (code === 'notAfterStart') return END_AFTER_START;
  if (code === 'beforeFirstEnd') return secondStartsAfter(firstEnd);
  return null;
}
export function placeProblemText(code) {
  if (code === 'missing') return ENTER_PLACE;
  if (code === 'tooLong') return PLACE_TOO_LONG;
  if (code === 'badCharacter') return TEXT_BAD_CHARACTER;
  return null;
}
export const CHOOSE_TIME_ERROR = 'Choose a time.'; // (not in the mockups)

// ===== Cycles 5 · Add / edit testing day =====
export const ADD_DAY_TITLE = 'Add testing day';
export const EDIT_DAY_TITLE = 'Edit testing day';
export const editDaySub = (cycleName, index, count) => `${cycleName || 'New cycle'} · day ${index} of ${count}`;
export const addDaySub = (cycleName, index) => `${cycleName || 'New cycle'} · day ${index}`;
export const DAY_NAME = 'Name';
export const DAY_NAME_HINT = 'Shown to families on the form and the confirmation page.';
export const DATE = 'Date';
export const START_TIME = 'Start time';
export const END_TIME = 'End time';
export const PLACE = 'Place';
export const PLACE_SCHOOL = { worcester: 'Worcester school', shrewsbury: 'Shrewsbury school' };
export const OTHER_PLACE = 'Other place';
export const OTHER_PLACE_HINT = 'For example the outdoor part of Physical.';
export const SECOND_PART_TICK = 'Second part at another time or place';
export const secondStartLabel = 'Second part start time';
export const secondEndLabel = 'Second part end time';
export const secondPlaceLabel = 'Second part place';
export const secondOtherLabel = 'Second part other place';
export const GRADED_THIS_DAY = 'Graded this day';
// v0.209 detail 2
export const alsoGradedOn = (part, otherDays) =>
  `${PART_NAMES[part]} is also graded on ${otherDays.map((d) => `${d.name} (${weekdayMonthDay(d.date)})`).join(' and ')}. Grades from both days count as one.`;
export const CHOOSE_TIME = 'Choose a time';

// The place line of a day: "Worcester school", or the other text shortened as drawn — the text
// up to its first comma, then the town: "Horgan Arena, 403 Oxford St N, Auburn MA 01501" →
// "Horgan Arena, Auburn" (the state and ZIP code at the end are left out).
export function placeText(place) {
  if (!place) return '';
  if (place.code) return PLACE_SCHOOL[place.code] ?? place.code;
  const parts = String(place.other ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  if (parts.length <= 2) return parts.join(', ');
  const town = parts[parts.length - 1].replace(/\s+[A-Z]{2}(\s+\d{5}(-\d{4})?)?$/, '').replace(/\s+\d{5}(-\d{4})?$/, '');
  return `${parts[0]}, ${town}`;
}
// "Sat, Apr 3, 2027 · 12:30–2:30 PM · Worcester school"
export const dayLine = (day) => `${shortDate(day.date)} · ${timeRange(day.start, day.end)} · ${placeText(day.place)}`;
// "Second part · 2:30–3:30 PM · Horgan Arena, Auburn"
export const secondLine = (second) => `${SECOND_PART} · ${timeRange(second.start, second.end)} · ${placeText(second.place)}`;

// ===== Cycles 6 · Rubric and prices =====
export const RUBRIC_LINE = 'Same for both schools. Prices are set on each cycle.';
export const LOADING_RUBRIC = 'Loading Rubric and prices';
export const WAIVER = 'Waiver';
export const versionLabel = (v) => `Version ${v}`;
export const READ_ALL = 'Read all';
export const EDIT_WAIVER = 'Edit waiver';
export const WAIVER_ABOUT_STAFF =
  'Families read and sign this on step 2 of the form. A parent or guardian signs for a candidate under 18 on the first testing day.';
export const WAIVER_ABOUT_ADMIN = `${WAIVER_ABOUT_STAFF} Editing makes a new version; registrations already sent keep theirs.`;
// OP-9 (not in the mockups)
export const WAIVER_PLACEHOLDER = "This is a placeholder. Save the school's waiver before opening registration.";
export const WAIVER_TITLE = 'Waiver and agreement'; // the Read all dialog's title (as the form's panel)
export const editWaiverSub = (version, name, stamp) => `Version ${version} · Last changed by ${name} · ${stampDate(stamp)}`;
export const WAIVER_TEXT = 'Waiver text';
// OP-3: without the count of registrations (no granted read gives it)
export const waiverSaveHint = (current, next) =>
  `Saving makes version ${next}. Registrations that signed version ${current} keep it; new registrations sign ${next}.`;
export const ENTER_WAIVER = 'Enter the waiver text.'; // (not in the mockups)
export const WAIVER_TOO_LONG = 'Use 20,000 characters or fewer.'; // (not in the mockups)

// Keeping (OP-8)
export const KEEPING = 'Keeping signed waivers'; // the block's name for screen readers and the dialog title (not in the mockups)
export const EDIT_KEEPING = 'Edit keeping time'; // (not in the mockups)
export const keepSentence1 = (n1) => `Keep signed waivers for ${n1} years after the last testing day.`;
export const keepSentence2 = (n2) => `For a candidate under 18: until ${n2} years after they turn 18, if that's later.`;
export const KEEP_DELETED_AFTER = 'Then they are deleted automatically.';
export const KEEP_NOT_SET = 'Not set: nothing is deleted until both numbers are entered.';
export const KEEP_WAITING = "Waiting for the insurer's answer…";
// The dialog's sentence is split around the two number fields.
export const KEEP_PART_1 = 'Keep signed waivers for';
export const KEEP_PART_2 = 'years after the last testing day. For a candidate under 18: until';
export const KEEP_PART_3 = "years after they turn 18, if that's later.";
export const KEEP_N1_LABEL = 'Years after the last testing day';
export const KEEP_N2_LABEL = 'Years after turning 18';
export const KEEP_HINT = 'Each from 3 to 20 years. Leave both empty to keep everything for now.';
export const KEEP_RANGE = 'Enter whole numbers from 3 to 20, or leave both empty.';
export const keepConfirmBody = (n) =>
  `Saving deletes the signature, signer's name, date of birth and email of ${candidatesCount(n)} now. This can't be undone.`;
export const KEEP_CONFIRM_TITLE = 'Delete personal details now?';
export const SAVE_AND_DELETE = 'Save and delete';

// ===== Cycles 7 · Registration links =====
export const linksSub = (name) => `${name} Black Belt testing`;
//   state  the cycle's CycleState; cycle  { autoClose, applicationDue }
export function linksStateLine(state, cycle) {
  if (!state) return '';
  if (state.state === 'past') return "This cycle is finished, so families can't sign up."; // (not in the mockups)
  if (state.publicStatus === 'open') {
    return cycle.autoClose ? `Registration is open until ${weekdayMonthDay(cycle.applicationDue)}.` : 'Registration is open.';
  }
  if (state.state === 'not_open_yet') return "Registration hasn't been opened yet, so families can't sign up.";
  return "Registration is closed, so families can't sign up right now.";
}
export const LINKS_EXPLAIN = 'Each school has its own link; the link sets the candidate’s school. Families choose their Dan on the form.';
export const schoolTitle = (school) => `${school} school`;
export const DOWNLOAD_QR = 'Download QR code';
export const qrAlt = (link) => `QR code for ${link}`;
export const DAN_HINT_START = 'To choose the Dan for a family, add ';
export const DAN_HINT_END = ' to the end of a link.';

// ===== Cycles 8 · Cycle page =====
export const BACK_TO_BLACK_BELT = 'Black Belt testing';
export const testingDaysCount = (n) => (n === 1 ? '1 testing day' : `${n} testing days`);
export const cycleSummary = (firstDay, dayCount, candidates) =>
  `First day ${shortDate(firstDay)} · ${testingDaysCount(dayCount)} · both schools · ${candidatesCount(candidates)}`;
export const TAB_CANDIDATES = 'Candidates';
export const LOADING_CYCLE = 'Loading the cycle';

// ===== Testing.jsx entry (until the chooser row arrives in step C2) =====
export const ENTRY_LABEL = 'Black Belt testing';

// ===== B2 · Candidates tab (contract CONTRACT-0016-B2 §3, mockups Candidates 1–7 and 9) =====
// Money is shown with formatCents ("$290", "$290.50", "−$50"; OP-B15). Every sentence the
// mockups don't draw is marked "(not in the mockups)" for Jeffrey's walkthrough (CP2, OP-B12).
// The points still open for Jeffrey (contract §7.1) are kept in one place each so they are easy
// to change: OP-B1 (Undo payment) → UNDO_PAYMENT_*, OP-B2 (Add's Undo for staff) →
// ADD_UNDO_FOR_STAFF, OP-B3 (icons) → candidates/icons.js.
const money = (cents) => formatCents(cents);

// "Mar 4, 2012"
export const monthDayYear = (iso) => dayText(iso, { month: 'short', day: 'numeric', year: 'numeric' });
// A moment in time as a month and day in Massachusetts time: "Mar 10"
export function stampMonthDay(stamp) {
  if (!stamp) return '';
  const date = new Date(stamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
}
// A moment in time with the clock: "Mar 25, 2027 · 2:14 PM" (the compare dialog)
export function stampDateTime(stamp) {
  if (!stamp) return '';
  const date = new Date(stamp);
  if (Number.isNaN(date.getTime())) return '';
  const time = date.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
  return `${stampDate(stamp)} · ${time}`;
}
// "A, B and C" / "A and B" / "A"
function andList(parts) {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export const SCHOOL_NAMES = { worcester: 'Worcester', shrewsbury: 'Shrewsbury' };
export const schoolName = (code) => SCHOOL_NAMES[code] ?? code ?? '';
export const METHOD_NAMES = { cash: 'Cash', check: 'Check', card: 'Card' };
export const methodName = (method) => METHOD_NAMES[method] ?? method ?? '';
export const candidateName = (c) => `${c?.firstName ?? ''} ${c?.lastName ?? ''}`.trim();

// ----- Items: what a payment is for (p1 … p12, kukkiwon) -----
// "Payment 1" / "Kukkiwon certificate" (the Record payment checklist, the receipt)
export const itemLabel = (item) => (item === 'kukkiwon' ? 'Kukkiwon certificate' : `Payment ${String(item).slice(1)}`);
// "Payment 1" / "Kukkiwon" (the detail's For column: "Payment 1 + Kukkiwon")
const itemShort = (item) => (item === 'kukkiwon' ? 'Kukkiwon' : `Payment ${String(item).slice(1)}`);
// "payment 1" / "Kukkiwon" (inside a sentence: "(payment 1 $290 + Kukkiwon $100)")
const itemLower = (item) => (item === 'kukkiwon' ? 'Kukkiwon' : `payment ${String(item).slice(1)}`);
// The For text of a payment line. A one-payment plan's only payment reads as the plan's name
// ("In full"), as drawn on Candidates 9.
export function forText(items, { paymentsCount = null, planName = '' } = {}) {
  const list = Array.isArray(items) ? items : [];
  if (paymentsCount === 1 && list.length === 1 && list[0] === 'p1' && planName) return planName;
  return list.map(itemShort).join(' + ');
}
// "(payment 1 $290 + Kukkiwon $100)" from [{item, remainingCents}]
export const itemsWithAmounts = (items) => `(${items.map((x) => `${itemLower(x.item)} ${money(x.remainingCents ?? x.amountCents)}`).join(' + ')})`;

// ----- Candidates 1 · the tab -----
export const ADD_CANDIDATE = 'Add candidate';
export const ADD_AT_DESK = 'Add new candidates at the desk.'; // Hide payments on (OP-B7)
export const registrationClosedStaff = (date) => `Registration closed on ${weekdayMonthDay(date)}. Ask an admin to reopen it.`;
export const LOADING_CANDIDATES = 'Loading the candidates'; // screen readers only (not in the mockups)
export const showingSchoolOnly = (school) => `Showing ${school} candidates only`;
export const SHOW_BOTH_SCHOOLS = 'Show both schools';

// Duplicate box (Star v0.114; several pairs: one line each, OP-B11)
export const possibleDuplicates = (n) => (n === 1 ? '1 possible duplicate' : `${n} possible duplicates`);
export const registeredTwice = (name, dan) => `${name} (${DAN_LABELS[dan] ?? ''}) is registered twice`;
export const REVIEW = 'Review';
export const reviewDuplicateLabel = (name) => `Review the possible duplicate ${name}`; // screen readers (not in the mockups)

// Cards (v0.219) and phone pills
export const CARD_PAID_IN_FULL = 'Paid in full';
export const CARD_ON_SCHEDULE = 'Paying on schedule';
export const CARD_LATE = 'Late';
export const CARD_NOT_PAID = 'Not paid';
export const duplicatesLeftOut = (n) =>
  n === 1 ? "The possible duplicate row isn't counted in the cards until it's resolved." : `The ${n} possible duplicate rows aren’t counted in the cards until they’re resolved.`;
export const duplicatesLeftOutPhone = (n) => (n === 1 ? "1 possible duplicate isn't counted until resolved." : `${n} possible duplicates aren’t counted until resolved.`);
export const SHOWING_FILTER = {
  paidInFull: 'Showing paid in full only',
  onSchedule: 'Showing paying on schedule only',
  late: 'Showing late only',
  notPaid: 'Showing not paid only',
};
export const SHOW_ALL = 'Show all';

// Search and the list
export const SEARCH_CANDIDATES = 'Search candidates';
export const CLEAR_SEARCH = 'Clear search'; // (not in the mockups)
export const listCaption = (n) => `${candidatesCount(n)} · Dan, then school, then last name`;
export const COL_CANDIDATE = 'Candidate';
export const COL_SCHOOL = 'School';
export const COL_PLAN = 'Plan';
export const COL_PAYMENTS = 'Payments';
export const COL_BALANCE = 'Balance';
export const registeredOnShort = (iso) => `Registered ${monthDay(iso)}`;
export const danSchool = (dan, code) => `${DAN_LABELS[dan] ?? ''} · ${schoolName(code)}`;
export const planCell = (planName, kukkiwon) => (kukkiwon ? `${planName} · Kukkiwon` : planName);
export const phoneSubline = (row) => `${danSchool(row.dan, row.locationCode)} · ${planCell(row.planName, row.kukkiwon)}`;
export const NO_CANDIDATES = "No candidates yet. Families register with the cycle's links, or add one here."; // (not in the mockups)
export const noMatch = (text) => `No candidates match "${text}".`; // (not in the mockups)
export const NO_FILTER_MATCH = 'No candidates in this group.'; // a card filter with no rows (not in the mockups)
export const removedGroup = (n) => `Removed (${n})`; // (not in the mockups, OP-B10)
export const NOT_IN_COUNTS = 'Not in the counts'; // (not in the mockups, OP-B10)
export const TAG_REMOVED = 'Removed';
export const TAG_DUPLICATE_COPY = 'Duplicate copy';
export const TAG_POSSIBLE_DUPLICATE = 'Possible duplicate';
export const recordPaymentFor = (name) => `Record payment for ${name}`; // the row button's screen-reader name
export const moreForCandidate = (name) => `More actions for ${name}`;

// The one Payments tag of a row (Money from the data layer). kind = how it's colored.
export function moneyTag(m) {
  if (!m) return { kind: 'gray', text: '' };
  switch (m.tag) {
    case 'paid_in_full':
      return m.overpaidCents > 0 ? { kind: 'warn', text: `Paid in full · ⚠ ${money(m.overpaidCents)} overpaid` } : { kind: 'ok', text: 'Paid in full' };
    case 'next':
      return { kind: 'gray', text: `Next ${money(m.nextCents)} by ${monthDay(m.nextOn)}` };
    case 'late':
      return m.lateKukkiwonOnly
        ? { kind: 'warn', text: `Late · ${money(m.lateCents)} Kukkiwon since ${monthDay(m.lateSince)}` }
        : { kind: 'warn', text: `Late · ${money(m.lateCents)} since ${monthDay(m.lateSince)}` };
    case 'not_paid':
      return { kind: 'red', text: 'Not paid' };
    default:
      return { kind: 'gray', text: '' };
  }
}
export const balanceText = (m) => (m ? money(m.balanceCents) : '');

// Row ⋯ items
export const RECORD_PAYMENT = 'Record payment';
export const EDIT_DETAILS = 'Edit details';
// Hide payments on (the mat-side switch): Edit details shows the date of birth and email, so it
// is grayed with this reason, like Add candidate's (not in the mockups)
export const EDIT_AT_DESK = 'Edit details at the desk.';
export const CHANGE_PLAN = 'Change plan or Kukkiwon';
export const alreadyPaidAskAdmin = (cents) => `${money(cents)} is already paid. Ask an admin.`;
export const PAYMENT_RECORDED_ASK_ADMIN = 'A payment is recorded. Ask an admin.';
export const RECORD_REFUND = 'Record refund';
export const recordRefundOverpaid = (cents) => `Record refund · ${money(cents)} overpaid`;
export const PRINT_RECEIPT = 'Print receipt';
export const REMOVE_CANDIDATE = 'Remove candidate';
export const RESTORE = 'Restore';
export const DELETE_PERMANENTLY = 'Delete permanently';

// Statuses → words (B returns codes only)
export const candidateStale = (name) => `Someone else changed ${name} just now. Close and open them again to see the change.`;
export const CANDIDATE_GONE = 'This candidate was deleted.'; // (not in the mockups)
export const CANDIDATE_FINISHED = "This cycle is finished, so candidates can't be added.";
export const PAPER_WAIVER_FINISHED = "This cycle is finished, so the waiver can't be recorded here."; // (not in the mockups)
export const PURGED_INVALID = "This candidate's personal details were deleted after the keeping time, so this can't be saved."; // (not in the mockups)
export const TOO_LATE_TO_UNDO = 'Too late to undo here. Ask an admin.'; // (not in the mockups)
export const ACTION_FAILED = "That didn't work. Check the connection, then try again."; // a toast Undo or a one-click action (not in the mockups)

// ----- Candidates 3 · Candidate detail -----
export const SECTION_CANDIDATE = 'Candidate';
export const SECTION_REGISTRATION = 'Registration';
export const SECTION_PAYMENTS = 'Payments';
export const ROW_NAME = 'Name';
export const ROW_DOB = 'Date of birth';
export const ROW_EMAIL = 'Email for results';
export const ROW_SCHOOL = 'School';
export const ROW_TESTING_FOR = 'Testing for';
export const ROW_REGISTERED = 'Registered';
export const ROW_REFERENCE = 'Reference';
export const ROW_WAIVER = 'Waiver';
export const ROW_PLAN = 'Plan';
export const ROW_KUKKIWON = 'Kukkiwon certificate';
export const ROW_REMOVED = 'Removed'; // (not in the mockups)
export const detailSub = (cycleName, dan, code) => `${cycleName} · ${DAN_LABELS[dan] ?? ''} · ${schoolName(code)}`;
// Edit details' line under its title names whose details they are (not in the mockups)
export const editDetailsSub = (name, cycleName, dan, code) => `${name} · ${detailSub(cycleName, dan, code)}`;
export const dobLine = (dob, age, firstDay) => (age === null || age === undefined || !firstDay ? monthDayYear(dob) : `${monthDayYear(dob)} (${age} on ${monthDayYear(firstDay)})`);
export const DELETED_AFTER_KEEPING = 'Deleted after the keeping time';
export const HIDDEN_ON_DEVICE = 'Hidden on this device'; // Hide payments on (OP-B7)
export const PAYMENTS_HIDDEN = 'Payments are hidden on this device.'; // (OP-B7)
export const registeredLine = (registeredOn, source, code) =>
  source === 'desk' ? `${shortDate(registeredOn)} · at the desk` : `${shortDate(registeredOn)} · family form (${schoolName(code)} link)`;
export const VIEW_SIGNATURE = 'View signature';
export function waiverLine(w) {
  if (!w) return 'No waiver on file'; // (not in the mockups)
  if (w.removedAt) {
    return `Signed on ${stampDate(w.signedAt)} · version ${w.versionName} · signature and signer's name deleted on ${stampDate(w.removedAt)} after the keeping time`;
  }
  if (w.how === 'paper') return `Signed on paper · ${stampMonthDay(w.signedAt)} · version ${w.versionName} · ticked by ${w.tickedByName ?? ''}`;
  const who = w.signedAsMinor ? `${w.signerName} (parent)` : w.signerName;
  return `Signed by ${who} · ${stampMonthDay(w.signedAt)} · version ${w.versionName} · on file`;
}
export const removedLine = (c) =>
  c.withdrawnReason === 'duplicate_copy' ? `Duplicate copy · ${stampMonthDay(c.withdrawnAt)}` : `Removed ${stampMonthDay(c.withdrawnAt)} by ${c.withdrawnByName ?? ''}`;

// Needs a parent's signature (CONTRACT-0016 OI-2; not in the mockups, shown at CP2)
export const needsParentSignature = (first, firstDay) =>
  `${first} is under 18 on ${monthDay(firstDay)}, but the waiver was signed as an adult. Have a parent or guardian sign the paper waiver.`;
export const WAIVER_SIGNED_ON_PAPER = 'Waiver signed on paper';
export const TOAST_PAPER_WAIVER = 'Paper waiver recorded'; // (not in the mockups)

// The due dates of a candidate's payments, with payments due on the SAME day said once: a late
// family's passed dates all count from the day they registered, so "Apr 26, Apr 26, May 29"
// reads "today (payments 1 and 2), May 29" (on another day: "Apr 26 (payments 1 and 2), May 29").
// items: [{ item: 'p1', dueOn }] in payment order. (The grouped wording is not in the mockups.)
export function dueDatesText(items, today = null) {
  const groups = [];
  for (const x of items ?? []) {
    const last = groups[groups.length - 1];
    if (last && last.dueOn === x.dueOn) last.nos.push(String(x.item).slice(1));
    else groups.push({ dueOn: x.dueOn, nos: [String(x.item).slice(1)] });
  }
  return groups
    .map((g) => (g.nos.length === 1 ? monthDay(g.dueOn) : `${g.dueOn === today ? 'today' : monthDay(g.dueOn)} (payments ${andList(g.nos)})`))
    .join(', ');
}

// The Plan line: "3 payments · $290 each, due Mar 27, Apr 24, May 29" / "$400 + $470, due …" /
// "In full · $870, due Mar 27". amounts: this Dan's amounts; items: the candidate's payment items
// [{ item, dueOn }] in payment order (same-day ones said once, dueDatesText).
export function planLine(planName, amounts, items, today = null) {
  const list = amounts ?? [];
  let what;
  if (list.length === 1) what = money(list[0]);
  else if (list.length > 1 && list.every((a) => a === list[0])) what = `${money(list[0])} each`;
  else what = list.map(money).join(' + ');
  return `${planName} · ${what}, due ${dueDatesText(items, today)}`;
}
// Kukkiwon: "Yes · $100, due with payment 1" / added late "Yes · $110, due Apr 26" / "No"
export function kukkiwonLine(item, p1) {
  if (!item) return 'No';
  if (p1 && item.dueOn === p1.dueOn) return `Yes · ${money(item.amountCents)}, due with payment 1`;
  return `Yes · ${money(item.amountCents)}, due ${monthDay(item.dueOn)}`;
}
export const COL_DATE = 'Date';
export const COL_FOR = 'For';
export const COL_HOW = 'How';
export const COL_AMOUNT = 'Amount';
export const COL_NOTE = 'Note';
export const COL_RECORDED_BY = 'Recorded by';
export const FOR_REFUND = 'Refund';
export const RETURNED_CHECK = 'Returned check';
export const RETURNED_NOTE = 'returned'; // "post-dated Apr 24 · returned"
export const NO_NOTE = '—';
export const NO_PAYMENTS_YET = 'No payments recorded yet.'; // (not in the mockups)
export const byName = (name) => `by ${name}`;
export const paymentMoreLabel = (what, date) => `More actions for ${what} of ${monthDay(date)}`;
export const TOTAL_DUE = 'Total due';
export const PAID = 'Paid';
export const BALANCE = 'Balance';
export const NEXT_DUE = 'Next due';
export const PAID_IN_FULL = 'Paid in full';
// The Next due value. dueNow = the items due by today (Not paid's "was due" date comes from them).
export function nextDueText(m, dueNow) {
  if (!m) return '';
  if (m.tag === 'paid_in_full') return PAID_IN_FULL;
  if (m.tag === 'next') return `${money(m.nextCents)} by ${monthDay(m.nextOn)}`;
  if (m.tag === 'late') return `${money(m.lateCents)} · late since ${monthDay(m.lateSince)}`;
  if (m.tag === 'not_paid') {
    const items = dueNow ?? [];
    const cents = items.reduce((a, x) => a + (x.remainingCents ?? 0), 0);
    const first = items.map((x) => x.dueOn).sort()[0];
    return first ? `${money(cents)} · was due ${monthDay(first)}` : money(m.balanceCents);
  }
  return '';
}
export const MORE_FOR_DETAIL = (name) => `More actions for ${name}`;

// Payment line ⋯ (admins)
export const EDIT_PAYMENT = 'Edit payment';
export const UNDO_PAYMENT = 'Undo payment';
export const MARK_CHECK_RETURNED = 'Mark check returned';
export const UNDO_RETURNED = 'Undo returned mark'; // (not in the mockups)
export const UNDO_REFUND = 'Undo refund'; // (not in the mockups)
export const REFUND_FIRST = 'A refund is recorded. Undo the refund first.';
export const RETURNED_FIRST = 'Undo the returned-check mark first.';

// Edit details (Star v0.112)
export const FIRST_NAME = 'First name';
export const LAST_NAME = 'Last name';
export const LAST_NAME_HINT = 'Spell it exactly as it should be printed on the black belt and certificate.';
export const DAN_LOCKED_STAFF = 'A payment is recorded. Ask an admin to change the Dan.';
export const alreadyPaidAdmin = (cents) => `${money(cents)} is already paid. Recorded payments stay as they are; the balance is worked out again.`;
// Field errors: the family form's wording (B1 Form 4), plus the desk's own two (not in the mockups)
export const ERR_FIRST = 'Enter the candidate’s first name.';
export const ERR_LAST = 'Enter the candidate’s last name.';
export const ERR_DOB = 'Choose the candidate’s date of birth.';
export const ERR_DAN = 'Choose the Dan the candidate is testing for.';
export const ERR_EMAIL = 'Enter a full email address, like name@example.com.';
export const ERR_SCHOOL = 'Choose the school.'; // (not in the mockups)
export const ERR_PLAN = 'Choose how they’ll pay.'; // (not in the mockups)
export const ERR_WAIVER_TICK = 'Tick this once the family has signed the paper waiver.';
export function nameError(code, emptyText) {
  if (code === 'empty') return emptyText;
  if (code === 'tooLong') return NAME_TOO_LONG;
  if (code === 'badCharacter') return NAME_BAD_CHARACTER;
  return null;
}

// ----- Candidates 4 · Record payment -----
export const RECORD_PAYMENT_TITLE = 'Record payment';
export const paymentSub = (c, planName) => `${candidateName(c)} · ${DAN_LABELS[c.dan] ?? ''} · ${schoolName(c.locationCode)} · ${planName}${c.kukkiwon ? ' + Kukkiwon' : ''}`;
// The "Owes …" line. dueNow / next: [{item, dueOn, remainingCents}]
export function owesLine(m, dueNow, next, today) {
  if (!m || m.balanceCents <= 0) return 'Paid in full. A payment here is counted as overpaid.'; // (not in the mockups)
  const sum = (list) => list.reduce((a, x) => a + (x.remainingCents ?? 0), 0);
  if (dueNow.length > 0) {
    const word = dueNow.every((x) => x.dueOn === today) ? 'due today' : 'due now';
    return `Owes ${money(m.balanceCents)} · ${word}: ${money(sum(dueNow))} ${itemsWithAmounts(dueNow)}`;
  }
  if (next.length > 0) return `Owes ${money(m.balanceCents)} · next: ${money(sum(next))} by ${monthDay(next[0].dueOn)}`;
  return `Owes ${money(m.balanceCents)}`;
}
export const FOR_TICK = 'For (tick one or more)';
export const FOR_LABEL = 'For';
export const itemLine = (item, dueOn) => `${itemLabel(item)} · due ${monthDay(dueOn)}`;
export const PAID_MARK = '(paid)';
export const AMOUNT = 'Amount';
export const METHOD = 'Method';
export const NOTE_OPTIONAL = 'Note (optional)';
export const NOTE_PLACEHOLDER = 'e.g. post-dated Apr 24';
export const countsToday = (today) => `Counts as paid today, ${weekdayMonthDay(today)}, like every check handed in today.`;
export const SAVE_AND_ANOTHER = 'Save and record another';
export const ERR_TICK = 'Tick what this payment is for.';
export const ERR_AMOUNT = {
  empty: 'Enter an amount, like 290 or 290.50.',
  notNumber: 'Enter an amount, like 290 or 290.50.',
  tooManyDecimals: 'Use at most two decimals.',
  tooLow: 'The amount must be more than $0.',
  tooHigh: 'One payment can be at most $5,000.',
};
export const ERR_METHOD = 'Choose cash, check or card.';
export const ERR_NOTE = 'Use 600 characters or fewer.';
export const toastPaymentRecorded = (cents, name) => `Payment recorded · ${money(cents)} · ${name}`;
export const withdrawnNoPayment = (name) => `${name} was withdrawn, so no payment can be recorded.`;

// ----- Candidates 5 · Admin payment actions -----
export const EDIT_PAYMENT_TITLE = 'Edit payment';
export const editPaymentSub = (name, what, paidOn, by) => `${name} · ${what} · recorded ${monthDay(paidOn)} by ${by}`;
export const REASON = 'Reason for the change';
export const REASON_PLACEHOLDER = 'e.g. typed the wrong amount';
export const ERR_REASON = 'Enter a reason for the change.';
export const editPaymentHint = (paidOn) => `The date (${monthDay(paidOn)}) stays. The old and new values go in the change log.`;
// The payment was ticked for an item the plan no longer has (the plan changed since): nothing is
// ticked, so the person ticks what it is for now (not in the mockups)
export const EDIT_PAYMENT_ITEM_GONE = 'This payment was for an item no longer in the plan.';
export const TOAST_PAYMENT_CHANGED = 'Payment changed';
export const UNDO_EDIT_REASON = 'Undo of the change just made'; // (not in the mockups)
export const PAYMENT_GONE = 'This payment was already undone or changed.';

// OP-B1 (working default): Undo payment asks first, then a toast WITHOUT Undo — kept here so the
// wording can follow Jeffrey's choice at CP2.
export const undoPaymentTitle = (what) => (/^Payment /.test(what) ? `Undo p${what.slice(1)}?` : 'Undo this payment?');
export const undoPaymentBody = (cents, method, paidOn, name) =>
  `${money(cents)} ${methodName(method).toLowerCase()} from ${monthDay(paidOn)} comes off ${name}'s balance. The history keeps it.`;
export const UNDO_PAYMENT_CONFIRM = 'Undo payment';
export const toastPaymentUndone = (what, cents, name) => `${what} undone · ${money(cents)} · ${name}`;
export const UNDO_REFUND_TITLE = 'Undo the refund?'; // (not in the mockups)
export const undoRefundBody = (cents, paidOn, name) => `The ${money(cents)} refund of ${monthDay(paidOn)} comes off ${name}'s history. The change log keeps it.`; // (not in the mockups)
export const toastRefundUndone = (cents, name) => `Refund undone · ${money(cents)} · ${name}`; // (not in the mockups)
export const UNDO_RETURNED_TITLE = 'Undo the returned-check mark?'; // (not in the mockups)
export const undoReturnedBody = (what, cents) => `${what} (${money(cents)} check) counts as paid again. The change log keeps the mark.`; // (not in the mockups)
export const toastReturnedUndone = (cents, name) => `Returned-check mark undone · ${money(cents)} · ${name}`; // (not in the mockups)
export const UNDO_RETURNED_CONFIRM = 'Undo the mark'; // (not in the mockups)
export const UNDO_REFUND_CONFIRM = 'Undo refund'; // (not in the mockups)
export const undoBlockedReturned = RETURNED_FIRST;
export const UNDO_NET_FLOOR = 'Undoing this would take the paid total below zero. Undo the refund first.';

export const REFUND_TITLE = 'Record refund';
export const refundSub = (name, planName, paidCents, dueCents) => `${name} · ${planName} · paid ${money(paidCents)} of ${money(dueCents)}`;
export const overpaidLine = (cents) => `Overpaid ${money(cents)}`;
export const refundHint = (paidCents) =>
  `Fees are non-refundable. Record a refund only when money is handed back, for example an overpayment. It can’t be more than ${money(paidCents)} (what’s been paid). It counts today.`;
export const refundTooLarge = (paidCents) => `A refund can't be more than ${money(paidCents)} (what's been paid).`;
export const toastRefund = (cents, name) => `Refund recorded · ${money(cents)} · ${name}`;

export const RETURNED_TITLE = 'Mark check returned';
export const returnedSub = (name, what, cents, paidOn) => `${name} · ${what} · ${money(cents)} check recorded ${monthDay(paidOn)}`;
export const returnedSentence = (cents, name) => `The check stays in the history, marked returned. ${money(cents)} goes back on ${name}’s balance.`;
// The predicted tag after the mark (from the predicted Money). what = "Payment 2"; firstDue = its due date
export function returnedPrediction(what, dueOn, m) {
  const tag = moneyTag(m);
  const start = dueOn ? `${what} was due ${monthDay(dueOn)}, so the roster will show` : 'The roster will show';
  if (m?.tag === 'not_paid') return `${start} Not paid.`;
  return `${start} ${tag.text}.`;
}
export const MARK_RETURNED = 'Mark returned';
export const toastReturned = (cents, name) => `Check marked returned · ${money(cents)} · ${name}`;
export const RETURNED_TWICE = 'This check was already marked returned once. To mark it again, undo the payment and record it again.';
export const NOT_A_CHECK = 'Only a check payment can be marked returned.'; // (not in the mockups)

// ----- Candidates 6 · Change plan or Kukkiwon -----
export const CHANGE_PLAN_TITLE = 'Change plan or Kukkiwon';
export const changePlanSub = (c) => `${candidateName(c)} · ${DAN_LABELS[c.dan] ?? ''} · ${schoolName(c.locationCode)}`;
export const PLAN = 'Plan';
export const CURRENT = 'Current';
export const KUKKIWON_DAN_CERT = 'Kukkiwon Dan certificate';
export const KUKKIWON_NO = 'No, thanks';
export const kukkiwonYes = (fee) => (fee === null || fee === undefined ? 'Yes, add it' : `Yes, add it · ${money(fee)}`);
// The second line of a plan card: "1 payment · due Mar 27" / "3 × $290 · Mar 27, Apr 24, May 29" /
// "$400 + $470 · Mar 27, May 29". amounts null → only the dates (before a Dan; Hide payments).
export function planCardLine(amounts, dates) {
  const days = dates.map(monthDay).join(', ');
  if (dates.length === 1) return `1 payment · due ${days}`;
  if (!amounts) return `${paymentsCount(dates.length)} · ${days}`;
  const what = amounts.every((a) => a === amounts[0]) ? `${amounts.length} × ${money(amounts[0])}` : amounts.map(money).join(' + ');
  return `${what} · ${days}`;
}
export const centsText = (cents) => money(cents);
// "New total $870 · 3 × $290, due Mar 27, Apr 24, May 29 · nothing paid yet"
// items: the candidate's payment items [{ item, dueOn }] (a late family's same-day ones said once)
export function newTotalNothingPaid(totalCents, amounts, items, today = null) {
  const days = dueDatesText(items, today);
  let what;
  if (amounts.length === 1) what = `in full, due ${days}`;
  else if (amounts.every((a) => a === amounts[0])) what = `${amounts.length} × ${money(amounts[0])}, due ${days}`;
  else what = `${amounts.map(money).join(' + ')}, due ${days}`;
  return `New total ${money(totalCents)} · ${what} · nothing paid yet`;
}
// "New total $1,100 · paid $330 · balance $770 · due now: $440 (Kukkiwon $110 + payment 2 $330)"
// — the Kukkiwon fee first (contract §3.6): adding it is what changed, so it is named first.
export function newTotalWithPaid(m, dueNow, next) {
  const sum = (list) => list.reduce((a, x) => a + (x.remainingCents ?? 0), 0);
  const head = `New total ${money(m.totalDueCents)} · paid ${money(m.paidCents)} · balance ${money(m.balanceCents)}`;
  const kukkiwonFirst = [...dueNow].sort((a, b) => (b.item === 'kukkiwon') - (a.item === 'kukkiwon'));
  if (dueNow.length > 0) return `${head} · due now: ${money(sum(dueNow))} ${itemsWithAmounts(kukkiwonFirst)}`;
  if (next.length > 0) return `${head} · next: ${money(sum(next))} by ${monthDay(next[0].dueOn)}`;
  return head;
}
export const toastPlanChanged = (name) => `Plan changed · ${name}`;
export const planWithdrawn = (name) => `${name} was withdrawn, so the plan can't change.`;
export const PLAN_PURGED = "This candidate's personal details were deleted after the keeping time, so the plan can't change.";

// ----- Candidates 7 · Add candidate -----
export const ADD_TITLE = 'Add candidate';
export const addSub = (cycleName) => `${cycleName} · for walk-ins and late families.`;
export const addClosedSub = (date) => `Registration closed on ${weekdayMonthDay(date)}; staff can still add here.`;
export const SCHOOL = 'School';
export const DOB = 'Date of birth';
export const TESTING_FOR = 'Testing for';
export const HOW_THEY_PAY = 'How they’ll pay';
export const AMOUNTS_AFTER_DAN = 'Amounts show once you choose a Dan.';
export const EMAIL = 'Email for results';
export const PAPER_WAIVER_HINT = 'The signed paper goes in the testing folder.';
export const adultHint = (age) => `${age} on the first testing day, so they sign for themself.`;
export const MINOR_HINT = 'Under 18 on the first testing day, so a parent or guardian signs the paper waiver.';
// "Total $1,100 · $440 with payment 1 (includes Kukkiwon $110), then $330 and $330"
// lines: scheduleFor's [{dueOn, items, amountCents}]
export function addTotalLine(totalCents, lines, kukkiwonCents) {
  if (!lines || lines.length === 0) return '';
  const first = lines[0];
  const withKuk = first.items.includes('kukkiwon') && kukkiwonCents > 0 ? ` (includes Kukkiwon ${money(kukkiwonCents)})` : '';
  if (lines.length === 1) return `Total ${money(totalCents)}, due ${monthDay(first.dueOn)}${withKuk}`; // (not in the mockups)
  const rest = andList(lines.slice(1).map((l) => money(l.amountCents)));
  // A late family may owe several payments at once (passed dates count as today): "with payments 1 and 2".
  const nos = first.items.filter((i) => i !== 'kukkiwon').map((i) => i.slice(1));
  const withWhat = nos.length > 1 ? `payments ${andList(nos)}` : `payment ${nos[0] ?? 1}`;
  return `Total ${money(totalCents)} · ${money(first.amountCents)} with ${withWhat}${withKuk}, then ${rest}`;
}
export const toastAdded = (name, reference) => `${name} added · ${reference}`;
// OP-B2 (working default): staff get no Undo on "added" (removing a candidate is admin-only).
export const ADD_UNDO_FOR_STAFF = false;

// ----- Possible duplicates · compare (all not in the mockups beyond screen 1) -----
export const compareTitle = (name) => `${name} is registered twice`;
export const COMPARE_SUB = 'Check both registrations. Differences are highlighted.';
export const FIRST_REGISTRATION = 'First registration';
export const SECOND_REGISTRATION = 'Second registration';
export const CMP_REGISTERED = 'Registered';
export const CMP_REFERENCE = 'Reference';
export const CMP_SOURCE = 'Source';
export const CMP_DOB = 'Date of birth';
export const CMP_EMAIL = 'Email';
export const CMP_DAN = 'Dan';
export const CMP_SCHOOL = 'School';
export const CMP_PLAN = 'Plan';
export const CMP_PAID = 'Paid';
export const SOURCE_FORM = 'Family form';
export const SOURCE_DESK = 'At the desk';
export const DIFFERENT = 'different';
export const KEEP_THIS_ONE = 'Keep this one';
export const keepThisOneLabel = (which) => `Keep this one: ${which}`;
export const KEEP_BOTH = 'Not the same person — keep both';
export const COMPARE_NOTE = 'Keep this one moves the other registration under Removed. Its payments stay with it.';
export const toastKeptOne = (name) => `Kept one ${name} · the other is under Removed`;
export const TOAST_BOTH_KEPT = 'Both kept';
export const DUPLICATE_CHANGED = 'These registrations changed just now. Close and open them again.';

// ----- Remove (v0.113) -----
export const removeTitle = (name) => `Remove ${name}?`;
export const WITHDRAW = 'Withdraw';
export const WITHDRAW_HINT = 'Kept under Removed, with their payments; can be restored.';
export const DELETE_HINT = "Deletes the registration and its signed waiver. This can't be undone."; // (not in the mockups)
export const hasPaymentRecords = (name) => `${name} has payment records, so they can't be deleted. Withdraw them instead.`;
export const hasPaymentRecordsShort = (name) => `${name} has payment records, so they can't be deleted.`; // a candidate already withdrawn (not in the mockups)
export const deleteTitle = (name) => `Delete ${name} permanently?`;
export const deleteBody = (cycleName) => `Their registration and signed waiver are deleted from ${cycleName}. This can't be undone.`;
export const KEEP_CANDIDATE = 'Keep candidate';
export const toastWithdrawn = (name) => `${name} withdrawn`;
export const toastDeleted = (name) => `${name} deleted`;
export const toastRestored = (name) => `${name} restored`; // (not in the mockups)

// ----- View signature (admins) -----
export const SIGNATURE_TITLE = 'Signature';
export const signatureAlt = (name) => `Signature of ${name}`;
export const signedByOn = (name, stamp) => `Signed by ${name} · ${stampDate(stamp)}`;
export const SIGNED_ON_PAPER_ONLY = 'Signed on paper. There is no signature picture.';
export const signatureDeleted = (stamp) => `The signature and signer's name were deleted on ${stampDate(stamp)} after the keeping time.`;
export const LOADING_SIGNATURE = 'Loading the signature'; // (not in the mockups)
export const UNDO_STALE_CANDIDATE = "Couldn't undo. Someone else changed this candidate just now."; // (not in the mockups)
