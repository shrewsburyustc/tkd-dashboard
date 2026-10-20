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
export const deleteCycleBody = (count) =>
  `This removes the cycle, its testing days and prices, and its ${candidatesCount(count)}. This can't be undone.`;

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
export const PLAN_NAME_LABEL = 'Plan name'; // screen readers (the name field in a plan block)
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
// OP-7: preview-only line until B2 builds the list
export const candidatesComingLine = (n) => `${candidatesCount(n)}. The list is built in the next step (B2).`;

// ===== Testing.jsx entry (until the chooser row arrives in step C2) =====
export const ENTRY_LABEL = 'Black Belt testing';
