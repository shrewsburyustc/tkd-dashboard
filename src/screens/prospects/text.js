// text.js — every word the Prospects screens show, in one place.
// Why it exists: same as the Forms and Calendar text.js — one spot to check the wording against
// the approved mockup (docs/Prospects/TKD-Prospects-Mockups.html rev 3, rulebook v0.140 / v0.191)
// and to change it later. The data layer only returns codes; this file turns them into words.
import { formatDate } from '../../lib/schedule/versions.js';
import { formatTime, parseTime } from '../../lib/schedule/time.js';
import { addDays } from '../../lib/schedule/versions.js';

export const PAGE_TITLE = 'Prospects';
export const ADD_PROSPECT = 'Add prospect';
export const ADD_SHORT = 'Add';
export const LOADING = 'Loading prospects';
export const LOAD_FAILED = "Couldn't load the prospects. Check the connection and try again.";
export const BOTH_SCHOOLS = 'Both schools';
export const SCHOOL_NAME = { worcester: 'Worcester', shrewsbury: 'Shrewsbury' };
export const CANCEL = 'Cancel';
export const CLOSE = 'Close';
export const SAVE = 'Save';
export const SAVING = 'Saving…';
export const MORE_ACTIONS = 'More actions';

// ----- Bar, chips, search -----
export const FOLLOW_UP_TODAY = 'Follow up today';
export const STAGES = 'Stages';
export const SIDE_EXITS = 'Side exits';
export const SEARCH = 'Search name or phone';
export const SEARCH_LABEL = 'Search prospects by child, parent or phone';
export const CLEAR_SEARCH = 'Clear search';
export const stageButton = (name, n, on) => `${name}: ${n === 1 ? '1 child' : `${n} children`}${on ? ', shown' : ''}`;
export const chipCount = (name, n) => `${name} · ${n}`;
export const SHOWING_ALL = 'Everyone';
export const TODAY_TILE = 'Today';

// ----- List -----
export const COL_CHILD = 'Child';
export const COL_PARENT = 'Parent';
export const COL_FREE = 'Free class';
export const COL_FOLLOW = 'Follow up';
export const COL_STATUS = 'Status';
export const NOBODY = 'Nobody here.';
export const NOBODY_TODAY = 'Nobody to follow up today.';
export const NO_PROSPECTS = 'No prospects yet. They appear here when a family sends a form, or with "Add prospect".';
export const NO_MATCH = 'No one matches that search.';
export const childLabel = (p, initial) => (initial ? `${p.childFirstName} ${initial}.` : p.childFirstName);
export const NONE = '—';
export const NEW_SIGNUP = 'New sign-up';
export const askCame = (name) => `Did ${name} come?`;
export const CLASS_GONE_SHORT = 'class cancelled';
const DAY_FMT = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
export const shortDate = (d) => DAY_FMT.format(new Date(`${d}T12:00:00Z`)).replace(',', '');
export const freeClassLine = (b) => `${shortDate(b.date)} · ${formatTime(parseTime(b.start))}`;
export function followUpText(date, today) {
  if (!date) return null;
  if (date < today) return { text: `Overdue · ${shortDate(date).slice(4)}`, warn: true };
  if (date === today) return { text: 'Today', warn: true };
  if (date === addDays(today, 1)) return { text: 'Tomorrow', warn: false };
  return { text: shortDate(date), warn: false };
}
export const joinedLine = (d) => `Joined ${shortDate(d).slice(4)}`;
export const cameLine = (b) => `Came ${shortDate(b.date).slice(4)}`;
export const openLabel = (name, unopened = false) => `Open ${name}${unopened ? ', new — not opened yet' : ''}`;

// ----- Progress track (v0.214) -----
export const COL_PROGRESS = 'Progress';
export const STEP_SIGNED = 'Signed up';
export const STEP_BOOKED = 'Class booked';
export const STEP_CAME = 'Came';
export const STEP_JOINED = 'Joined';
export const TODAY_WORD = 'today';
export const TOMORROW_WORD = 'tomorrow';
export const inNDays = (n) => `in ${n} days`;
export const NEEDS_CLASS = 'Needs a class';
export const needsClassLine = (d) => `Signed up ${shortDate(d).slice(4)} · needs a class`;
export const classShort = (b) => `Class ${freeClassLine(b)}`;
export const classTodayLine = (b) => `Class today · ${formatTime(parseTime(b.start))}`;
export const CLASS_GONE_CARD = 'Class cancelled — call';
export const noShowLine = (d) => `No-show ${shortDate(d).slice(4)} · call back`;
export const NO_SHOW_CALL = 'No-show · call back';
export const cameAskLine = (d) => `Came ${shortDate(d).slice(4)} · ask to join`;
export const ASK_TO_JOIN = 'Came · ask to join';
export const followCard = (text) => (text === 'Today' ? 'Call today' : `Call · ${text}`);
export const NEXT = 'Next:';
export const NEXT_BOOK = 'Book a free class';
export const nextCheckIn = (name, b) => `Check in on ${shortDate(b.date)} when ${name} arrives`;
export const nextCheckInToday = (name, b) => `Check in when ${name} arrives (today ${formatTime(parseTime(b.start), true)})`;
export const nextAskCame = (name) => `Mark whether ${name} came`;
export const NEXT_ASK_JOIN = 'Ask the family to join';
export const NEXT_CLASS_GONE = 'Call the family — the class was cancelled';
export const NEXT_NO_SHOW = 'Call back and book a new class';
export const PROGRESS_LABEL = 'Progress';
export const doneWords = (names) => `${names.join(', ')} done`;
export const nextWords = (name) => `next: ${name}`;
export const stoppedWords = (name) => `stopped at ${name}`;
export const STEP_STATE = { done: ', done', next: ', next', stopped: ', stopped', off: ', stopped', todo: ', not yet' };

// ----- List / Board switch and the Board (v0.214) -----
export const VIEW = 'View';
export const VIEW_LIST = 'List';
export const VIEW_BOARD = 'Board';
export const BOARD_LABEL = (school) => `${PAGE_TITLE} board${school ? ` · ${school}` : ''}`;
export const childrenCount = (n) => (n === 1 ? '1 child' : `${n} children`);
export const NOBODY_COLUMN = 'Nobody here';
export const searchShowing = (n, total, text) => `Showing ${n} of ${childrenCount(total)} · matching “${text}”`;
export const SHOW_EVERYONE = 'Show everyone';
export const showingColumn = (name, n) => `Showing ${name}, ${childrenCount(n)}`;
export const stageJump = (name, n) => `${name}: ${childrenCount(n)} — go to the column`;
export const SWIPE_HINT = 'Swipe, or tap a stage above, for the next column';
export const SCROLL_HINT = 'Scroll sideways for more stages';
export const DRAG_HINT = 'Drag a card to another stage, or open it and change the status.';
export const DRAG_HINT_TOUCH = 'Press and hold a card, then drag it to another stage.';
export const NEW_WORD = 'new';
export const MOVED = (name, to) => `${name} moved to ${to}.`;

// ----- "Came" when a card is dropped on Came -----
export const cameTitle = (name) => `Did ${name} come to the free class?`;
export const NO_CLASS_BOOKED = 'No free class is booked. Came is saved as the status.';
export const cameAheadTitle = (name) => `${name}'s free class is still ahead`;
export const cameAhead = (name, b) => `${name}'s free class is ${classLine(b)}. Check in on that day, when ${name} arrives.`;
export const MARK_CAME = 'Came';

// ----- Panel -----
export const BACK = 'Back';
export const CLOSE_PANEL = 'Close';
export const UNSAVED_NOTE = 'Unsaved note. Save it or cancel first.';
export const CALL = 'Call';
export const TEXT = 'Text';
export const EMAIL = 'Email';
export const COPY_NUMBER = 'Copy number';
export const COPIED = 'Copied';
export const callTitle = (name) => `Call ${name}`;
export const STATUS = 'Status';
export const FOLLOW_UP = 'Follow up';
export const FREE_CLASS = 'Free class';
export const PHONE = 'Phone';
export const SIBLINGS = 'Sibling';
export const NOTES = 'Notes and calls';
export const ADD_NOTE = 'Add a note…';
export const NOTE_LABEL = 'Note';
export const SAVE_NOTE = 'Save note';
export const NOTE_BAD = 'A note needs 1 to 1000 characters, with no hidden characters.';
export const WHEN = 'Follow up';
export const WHEN_OPTIONS = [['tomorrow', 'Tomorrow'], ['3', 'In 3 days'], ['week', 'Next week'], ['pick', 'Pick a date'], ['none', 'No follow-up']];
export const PICK_DATE = 'Follow-up date';
export const FORM_AND_WAIVER = 'Form answers and waiver';
export const answersLine = (n) => (n === 1 ? '1 answer' : `${n} answers`);
export const fromForm = (form, date) => `from "${form}" · ${shortDate(date).slice(4)}`;
export const enteredBy = (name) => `Entered by ${name}`;
export const NO_TIME_YET = 'No time yet — call to set one up';
export const CLASS_GONE = 'Class cancelled — call the family';
export const BOOKING_CANCELLED = 'Booking cancelled';
export const BOOK = 'Book a free class';
export const CHANGE_TIME = 'Change time';
export const CANCEL_BOOKING = 'Cancel booking';
export const CHECK_IN = 'Check in';
export const CAME = 'Came';
export const NO_SHOW = 'No-show';
export const freeToday = (b) => `Free class today · ${formatTime(parseTime(b.start), true)} · ${b.className}`;
export const didCome = (name) => `Did ${name} come to the free class?`;
export const classLine = (b) => `${formatDate(b.date, { year: false })} · ${formatTime(parseTime(b.start), true)} · ${b.className}`;
export const checkedIn = (name, at) => `Checked in by ${name} · ${new Date(at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
export const DELETE_PROSPECT = 'Delete prospect';
export const NO_FOLLOW_UP = 'No follow-up';
export const SET_DATE = 'Set date';
export const CURRENT = '(now)';
export const EDIT_STATUSES = 'Edit statuses';
export const signedLine = (signedAt, hasPicture) => (signedAt
  ? `waiver signed ${shortDate(signedAt.slice(0, 10)).slice(4)}${hasPicture ? '' : ' (picture deleted after 90 days)'}`
  : 'no waiver');
export const SHOW_SIGNATURE = 'Show signature';
export const SIGNATURE = 'Signature';
export const SIGNATURE_GONE = 'The picture was deleted 90 days after the free class. The waiver was signed on the date above.';
export const LOADING_PANEL = 'Loading…';

// timeline
export function activityText(a) {
  const d = a.detail ?? {};
  switch (a.kind) {
    case 'created':
      return d.entered_by ? `Signed up (entered by ${d.entered_by})` : d.source === 'kiosk' ? 'Signed up at the front desk' : 'Signed up online';
    case 'status':
      return d.joined_on ? `Status: ${d.from} → ${d.to} (joined ${shortDate(d.joined_on).slice(4)})` : `Status: ${d.from} → ${d.to}`;
    case 'follow_up':
      return d.on ? `Follow-up set for ${shortDate(d.on)}` : 'Follow-up removed';
    case 'check_in':
      return 'Checked in at the free class';
    case 'came':
      return 'Came to the free class';
    case 'no_show':
      return 'Did not come to the free class';
    case 'undo_check_in':
      return 'Check-in undone';
    case 'booked':
      return `Free class booked: ${shortDate(d.date)} · ${formatTime(parseTime(d.starts_at))} · ${d.class_name}`;
    case 'changed_time':
      return `Free class moved to ${shortDate(d.date)} · ${formatTime(parseTime(d.starts_at))} · ${d.class_name}`;
    case 'cancelled_time':
      return `Free class cancelled (${shortDate(d.date)} · ${formatTime(parseTime(d.starts_at))})`;
    default:
      return a.kind;
  }
}
export const whenLine = (at, who) => `${shortDate(at.slice(0, 10)).slice(4)} · ${who}`;

// ----- Toasts and problems -----
export const STATUS_SAVED = (name) => `Status: ${name}`;
export const NOTE_SAVED = 'Note saved.';
export const CHECKED_IN = (name) => `${name} checked in.`;
export const MARKED_NOSHOW = (name) => `${name}: No-show — call back tomorrow.`;
export const BOOKED = (name) => `Free class booked for ${name}.`;
export const CANCELLED_BOOKING = (name) => `${name}'s free class was cancelled.`;
export const DELETED = (name) => `${name} was deleted.`;
export const STALE = 'Someone else changed this prospect. It was reloaded — please try again.';
export const SAVE_FAILED = "It wasn't saved. Check the connection and try again.";
export const NOT_ALLOWED = "That can't be done right now.";
export const ADMIN_ONLY = 'Only an admin can do that.';
export const TIME_TAKEN = 'That time just filled up or was cancelled. Pick another time.';
export const INVALID = 'That was refused. Check the values and try again.';

// ----- Joined -----
export const JOINED_TITLE = 'Joined';
export const JOINED_DATE = 'Date joined';
export const JOINED_HINT = 'Joined families are kept until a Students section exists.';

// ----- Book a time -----
export const bookTitle = (name, change) => (change ? `Change ${name}'s free class` : `Book a free class for ${name}`);
export const NO_TIMES = 'No free-class times are open in the next 60 days (full, closed or not offered by a Live form).';
export const LOADING_TIMES = 'Loading open times…';
export const THIS_WEEK = 'This week';
export const NEXT_WEEK = 'Next week';
export const weekOf = (d) => `Week of ${shortDate(d).slice(4)}`;
export const spotsLeft = (n) => (n === 1 ? '1 spot left' : `${n} spots left`);
export const BOOK_IT = 'Book';
export const PICK_A_TIME = 'Pick a time first.';

// ----- Add prospect -----
export const ADD_TITLE = 'Add prospect';
export const WHICH_FORM = 'Which form do you want to fill in for them?';
export const NO_LIVE_FORMS = 'This school has no Live form yet. An admin can publish one in Forms.';
export const WHICH_SCHOOL = 'School';

// ----- Statuses -----
export const STATUSES_TITLE = 'Edit statuses';
export const statusesSub = (school) => `${school} · stages show in the bar, side exits as chips beside it`;
export const ADD_STATUS = 'Add status';
export const EDIT_STATUS = 'Edit status';
export const NAME = 'Name';
export const KIND = 'Where it shows';
export const KIND_STAGE = 'Stage (in the bar)';
export const KIND_EXIT = 'Side exit (a chip)';
export const COLOR = 'Color';
export const BUILTIN_NOTE = 'The app uses this status, so it can be renamed but not deleted, and it stays where it is shown.';
export const DELETE_STATUS = 'Delete status';
export const deleteStatusTitle = (name) => `Delete "${name}"?`;
export const deleteStatusBody = (name, n) => (n === 0 ? `Nobody is in "${name}". It will be deleted.` : `${n === 1 ? '1 person is' : `${n} people are`} in "${name}". Move them to:`);
export const MOVE_TO = 'Move them to';
export const CHOOSE = 'Choose…';
export const NAME_BAD = 'A name needs 1 to 40 characters.';
export const DUPLICATE_NAME = 'Another status already has that name.';
export const dragStatus = (name) => `Drag to reorder ${name}`;
export const statusMore = (name) => `More actions for ${name}`;
export const MOVE_UP = 'Move up';
export const MOVE_DOWN = 'Move down';
export const EDIT = 'Edit';
export const BUILTIN_TAG = 'used by the app';

// ----- Delete prospect -----
export const deleteTitle = (name) => `Delete ${name}?`;
export const deleteBody = (name, siblings) => (siblings
  ? `${name}'s prospect, notes and free class are deleted. The family's sign-up stays for the other children. This can't be undone.`
  : `${name}'s prospect, notes and free class are deleted, and the family's sign-up and answers with it. This can't be undone.`);
export const DELETE = 'Delete';
export const DELETING = 'Deleting…';
export const UNDO = 'Undo';
