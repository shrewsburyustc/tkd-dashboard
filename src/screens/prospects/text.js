// text.js — every word the Prospects screens show, in one place.
// Why it exists: same as the Forms and Calendar text.js — one spot to check the wording against
// the approved mockups (docs/Prospects/TKD-Prospects-Mockups.html rev 3, rulebook v0.236 / v0.244;
// the profile window and the printed visitor sheet: docs/Prospects/TKD-Prospect-Profile-Mockups.html
// rev 3, v0.634–v0.639) and to change it later. The data layer only returns codes; this file turns
// them into words.
import { formatDate } from '../../lib/schedule/versions.js';
import { formatTime, parseTime } from '../../lib/schedule/time.js';
import { addDays, localDay } from '../../lib/schedule/versions.js';
import { addressLine } from '../../lib/prospects/child.js';

export const PAGE_TITLE = 'Prospects';
export const ADD_PROSPECT = 'Add prospect';
export const ADD_SHORT = 'Add';
// while Hide private details is on, + Add prospect is desk-only (v0.616): the line under the title
// (M-05, v1.055: it names the date of birth too, as Star's line does)
export const ADD_AT_DESK = 'Add prospects at the desk. Dates of birth, email and form answers are hidden on this tablet.';
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
// The search box (R3-09, v1.050): it reads "Find a prospect" like Camps' "Find a camper" and Black Belt's
// "Find a candidate"; it still finds by phone, and its screen-reader name says so.
export const SEARCH = 'Find a prospect';
export const SEARCH_LABEL = 'Find a prospect by child, parent or phone';
export const CLEAR_SEARCH = 'Clear search';
// The gray line under the stage bar while the List is filtered (R3-03, v1.047 (10)): "Showing follow
// up today only · Show all". `name` is the status's name, lower-cased like the other sections' words
// ("Showing not paid only").
export const SHOW_ALL = 'Show all';
export const showingOnly = (name) => `Showing ${name.toLowerCase()} only`;
// On Both each school has its own "Clear search" link: its name says which school's line it is under
export const clearSearchFor = (school) => `Clear search for ${school}`;
export const stageButton = (name, n, on) => `${name}: ${n === 1 ? '1 child' : `${n} children`}${on ? ', shown' : ''}`;
export const chipCount = (name, n) => `${name} · ${n}`;
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
// A search that finds nobody (R3-09): the line is followed by a "Clear search" link (as Camps' line)
export const noMatch = (text) => `No prospects match “${text}”.`;
// "Ava N.": the initial is the child's own last initial, or the parent's for older sign-ups (v0.637)
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

// ----- Progress track (v0.246) -----
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
export const noShowLine = (d) => `Didn't show ${shortDate(d).slice(4)} — call back`;
export const NO_SHOW_CALL = "Didn't show — call back";
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

// ----- List / Board switch and the Board (v0.246) -----
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
export const MOVED = (name, to) => `${name} moved to ${to}`;

// ----- "Came" when a card is dropped on Came -----
export const cameTitle = (name) => `Did ${name} come to the free class?`;
export const NO_CLASS_BOOKED = 'No free class is booked. Came is saved as the status.';
export const cameAheadTitle = (name) => `${name}'s free class is still ahead`;
export const cameAhead = (name, b) => `${name}'s free class is ${classLine(b)}. Check in on that day, when ${name} arrives.`;
export const MARK_CAME = 'Came';
// the button that changes nothing (N3): the card stays in the column it sits in ("Keep in Booked")
export const keepIn = (column) => `Keep in ${column}`;

// ----- The profile window (v0.639; was the side panel, v0.236) -----
export const BACK = 'Back';
export const CLOSE_PANEL = 'Close';
// The note box's warning (default 2: the shared words, N15, as Edit statuses' UNSAVED below)
export const UNSAVED_NOTE = 'Unsaved changes. Save or cancel first.';
export const CALL = 'Call';
export const TEXT = 'Text';
export const EMAIL = 'Email';
export const EMAIL_OFF_WHILE_HIDDEN = 'Email is off while private details are hidden. Email the family at the desk.'; // v1.000 (D2a)
export const COPY_NUMBER = 'Copy number';
export const COPIED = 'Copied';
// Copy number when the clipboard refuses (U-05, default words): the note beside the button
export const COPY_NUMBER_FAILED = "Couldn't copy the number. Select it and copy it yourself.";
export const callTitle = (name) => `Call ${name}`;
export const STATUS = 'Status';
export const statusButton = (name) => `${STATUS}: ${name}`; // the status tag button's name (no "Status" label is shown)
export const FOLLOW_UP = 'Follow up';
export const followUpButton = (text) => `${FOLLOW_UP}: ${text}`;
export const FREE_CLASS = 'Free class';
export const PHONE = 'Phone';
export const NOTES = 'Notes and calls';
export const ADD_NOTE = 'Add a note…';
export const NOTE_LABEL = 'Note';
export const SAVE_NOTE = 'Save note';
export const NOTE_BAD = 'A note needs 1 to 1000 characters, with no hidden characters.';
export const WHEN = 'Follow up';
export const WHEN_OPTIONS = [['tomorrow', 'Tomorrow'], ['3', 'In 3 days'], ['week', 'Next week'], ['pick', 'Pick a date'], ['none', 'No follow-up']];
export const PICK_DATE = 'Follow-up date';
// the gray strip at the top: the form they filled out (v0.639)
export const SENT_ONLINE = 'Sent online';
export const SENT_KIOSK = 'Sent on the kiosk at the desk';
export const enteredAtDesk = (name) => `Entered at the desk by ${name}`;
// how the form came in: staff Fill in ("Entered at the desk by …"), the kiosk, or the family's own page
export const sentHow = (p) => (p.enteredBy ? enteredAtDesk(p.enteredBy) : p.source === 'kiosk' ? SENT_KIOSK : SENT_ONLINE);
// "Sent online · Wed, Nov 4, 2026 · 6:12 pm · Worcester"
export const stripLine = (how, date, time, school) => [how, date, time, school].filter(Boolean).join(' · ');
export const yearsOld = (n) => (n === 1 ? '1 year old' : `${n} years old`);
// the section heads (13px, like Camps' camper detail)
export const HEAD_FAMILY = 'Child and family';
export const HEAD_ANSWERS = 'Form answers';
export const asSentOn = (day) => `as sent on ${shortDate(day).slice(4)}`;
export const NO_QUESTIONS = 'This form asks no other questions.';
export const YES = 'Yes';
// One answer in words: a list → "a, b"; a ticked box → "Yes"; a date → "Mon, Mar 4, 2019"; an
// address → one line; nothing → '' (the profile shows "—", the printed sheet a blank line).
export function answerWords(field, value) {
  if (value === undefined || value === null || value === '' || value === false) return '';
  if (Array.isArray(value)) return value.join(', ');
  if (value === true) return YES;
  if (field?.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(value);
  if (typeof value === 'object') return addressLine(value);
  return String(value);
}
export const HEAD_WAIVER = 'Waiver';
export const HEAD_FREE = 'Free class and follow-up';
// Child and family rows
export const DATE_OF_BIRTH = 'Date of birth';
export const PARENT = 'Parent or guardian';
export const HOME_ADDRESS = 'Home address';
export const SIBLING = 'Brother or sister';
export const siblingLine = (name, age, status) => `${name}${age !== null && age !== undefined ? `, ${age}` : ''}${status ? ` · ${status}` : ''}`;
export const openSibling = (line) => `${SIBLING}: ${line}`;
export const NOT_ASKED_ON_FORM = 'Not asked on this form'; // the form had no Address question
export const notAskedAge = (age) => `Not asked · age on the form: ${age}`; // signed up before dates of birth were asked
// Waiver rows
export const AGREED = 'Agreed';
export const WAIVER_NOT_ON_FORM = 'Not on this form';
export const DATE_SIGNED = 'Date signed';
export const keptUntil = (date, afterClass) => `Kept until ${date} (90 days after ${afterClass ? 'the free class' : 'signing'}).`;
export const READ_WAIVER = 'Read the waiver';
export const WAIVER_TEXT = 'Waiver text';
// Print (v0.636): straight away for one child; a menu when the sign-up has brothers or sisters
export const PRINT = 'Print';
export const PRINT_PREPARING = 'Preparing…';
export const PRINT_OFF_WHILE_HIDDEN = 'Print is off while private details are hidden. Print at the desk.';
export const PRINT_FAILED = "Couldn't get the pages ready to print. Check the connection and try again.";
export const printOnly = (name) => `${name} only`;
// "Ava and Noah · 2 sheets", "Ava, Noah and Mia · 3 sheets" — one visitor sheet per child (a
// sheet that doesn't fit runs to a second page, so the menu counts sheets, not pages)
export function printFamily(names) {
  const list = names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${list} · ${names.length} sheets`;
}
export const NO_TIME_YET = 'No time yet — call to set one up';
export const CLASS_GONE = 'Class cancelled — call the family';
export const PROSPECT_GONE = 'That prospect no longer exists.';
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
export const CURRENT = '(now)';
export const EDIT_STATUSES = 'Edit statuses';
export const SHOW_SIGNATURE = 'Show signature';
export const SIGNATURE = 'Signature';
// The picture is deleted 90 days after the free class, or 90 days after signing when no class was
// booked (v0.242 (1)); `afterClass` is the same flag the "Kept until" line uses (P-03).
export const signatureGone = (afterClass) => `The picture was deleted 90 days after ${afterClass ? 'the free class' : 'signing'}. The waiver was signed on the date above.`;
export const SIGNATURE_FAILED = "Couldn't load the signature. Check the connection and try again.";
export const LOADING_PANEL = 'Loading…';
// The profile window's read failed (pass 2 P-02): the shared amber bar with Retry, in place of
// "Loading…" (v1.051 (2)'s ending).
export const loadDetailFailed = (firstName) => `Couldn't load ${firstName ? `${firstName}'s` : 'the'} details. Check the connection, then retry.`;

// ----- Dates and times as the profile and the sheet show them -----
// 'YYYY-MM-DD' → "Mon, Mar 4, 2019"; withWeekday false → "Mar 4, 2019"
export const longDate = (day, withWeekday = true) => formatDate(day, { weekday: withWeekday });
// A database time → the Massachusetts day in words ("Wed, Nov 4, 2026"; a 9 pm sign-up stays that day)
export const dayOf = (at, withWeekday = true) => longDate(localDay(at), withWeekday);
// A database time → the Massachusetts clock time, "6:12 pm" (read as "18:12", then written the
// app's own way by schedule/time.js)
const NY_24H = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export function clockOf(at) {
  const t = Date.parse(at ?? '');
  if (Number.isNaN(t)) return '';
  const minutes = parseTime(NY_24H.format(new Date(t)));
  return minutes === null ? '' : formatTime(minutes, true);
}
// the free class with its year, for the sheet: "Mon, Nov 9, 2026 · 4:00 pm · White"
export const classLineYear = (b) => `${formatDate(b.date)} · ${formatTime(parseTime(b.start), true)} · ${b.className}`;
// (On the printed sheet a class that was cancelled reads CLASS_GONE in bold, then this line in
// brackets: PrintSheet.jsx, pass 2 P-01.)

// ----- The printed visitor sheet (PrintSheet.jsx; v0.636, mockup rev 3 screen 4) -----
export const SCHOOL_FULL = 'Jae H. Jeong’s U.S. Taekwondo Center';
export const VISITOR_INFORMATION = 'Visitor information';
export const printedBy = (date, name) => `Printed ${date}${name ? ` by ${name}` : ''}`;
export const FORM_WORD = 'Form:';
// "Sent online Wed, Nov 4, 2026, 6:12 pm" / "Entered at the desk by Jeffrey Berg, Sat, Oct 31, 2026, 10:05 am"
export const sheetSentLine = (how, date, time) => (how === SENT_ONLINE ? `${how} ${date}, ${time}` : `${how}, ${date}, ${time}`);
export const SHEET_STUDENT = 'Student';
export const SHEET_NAME = 'Name';
export const SHEET_AGE = 'Age';
export const SHEET_NOT_ASKED = 'Not asked';
export const SHEET_NO_TIME = 'No time yet';
export const SHEET_EMAIL = 'Email';
export const SHEET_AGREE = 'I have read and agree to the waiver.';
export const SHEET_SIGNATURE = 'Signature of parent or guardian';
export const signedOn = (date) => `Signed on ${date}`; // the picture was deleted after 90 days (v0.242)
export const SHEET_STAFF = 'For staff use';
export const SHEET_TRIAL = 'Trial classes';
export const SHEET_COMMENTS = 'Comments';
export const SHEET_BOXES_HINT = 'Write the date on top, initial below.';
export const SHEET_PRIVATE = 'Private: keep in the locked drawer, shred when done.'; // the footer's right side is the child's name
// A sheet too long for one page (v0.641): the answers print one line each, then the part above the
// signature up to 10% smaller; only a much longer form goes on to a second page (the signature and
// the 15 boxes stay on the first). "the next page", not "page 2": no page numbers are printed, and
// in a family's print the second child's pages come after the first child's.
export const SHEET_MORE_NEXT = 'More answers on the next page.';
export const SHEET_ANSWERS_NEXT = 'The answers are on the next page.';
export const HEAD_ANSWERS_CONTINUED = 'Form answers (continued)';
export const SHEET_WAIVER_NEXT = "The waiver's wording is on the next page.";

// timeline: typed notes always show; the automatic changes open from "History" (v0.255)
export const HISTORY = 'History';
export const historyLine = (n) => `History · ${n === 1 ? '1 change' : `${n} changes`}`;
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
// the Massachusetts day of a note or change (not the UTC one, which is a day ahead in the evening)
export const whenLine = (at, who) => `${shortDate(localDay(at)).slice(4)} · ${who}`;

// ----- Toasts and problems -----
export const STATUS_SAVED = (name) => `Status: ${name}`;
// A one-sentence toast has no full stop at the end, and none has the ✓ (R2-09, v1.046 (7), v1.051 (5))
export const NOTE_SAVED = 'Note saved';
export const CHECKED_IN = (name) => `${name} checked in`;
export const MARKED_NOSHOW = (name) => `${name} didn't show — call back tomorrow`; // matches the card line (v0.610)
export const BOOKED = (name) => `Free class booked for ${name}`;
export const CANCELLED_BOOKING = (name) => `${name}'s free class was cancelled`;
export const DELETED = (name) => `${name} was deleted`;
// The follow-up date changed from the profile (it has a 5-second Undo, v1.006): the same words as the History line
export const FOLLOW_UP_SAVED = (date) => (date ? `Follow-up set for ${shortDate(date)}` : 'Follow-up removed');
export const STALE = 'Someone else changed this prospect. It was reloaded — please try again.';
// Delete status when someone else changed (or deleted) that status meanwhile (U-03): the box steps back to the
// list, which now shows their change, with this note. (The sentence is local to Prospects for now; after Dashboard
// core's R2-07 it comes from src/components/text.js.)
export const staleStatus = (name) => `Someone else changed ${name} just now, so nothing was done. Their change is shown.`;
export const SAVE_FAILED = "Couldn't save. Check the connection, then try again."; // Black Belt's and the Schedule's words (R2-01)
export const UNDO_FAILED = "Undo didn't save. Check the connection, then retry."; // a failed Undo keeps a bar with Retry (R2-01)
export const LOAD_ONE_FAILED = "Couldn't load that child. Check the connection, then try again."; // reading a card's child before a Board drop's box
export const TIMES_FAILED = "Couldn't load the times. Check the connection, then try again."; // Book a free class' list of times
// A box that stays open when its save fails (pass 2 U-01, rulebook v1.103): the amber note in the box.
// Delete prospect and Delete status use the dashboard's delete words (U-08: Forms, Schedule, Color
// Belt, Star and Black Belt say the same); Came, Joined and Book a free class the save words.
export const DELETE_FAILED = "Couldn't delete. Check the connection, then try again.";
export const BOX_SAVE_FAILED = "Couldn't save. Check the connection, then try again.";
export const NOT_ALLOWED = "That can't be done right now.";
export const ADMIN_ONLY = 'Only an admin can do that.';
export const TIME_TAKEN = 'That time just filled up or was cancelled. Pick another time.';
export const INVALID = 'That was refused. Check the values and try again.';

// ----- Joined -----
export const JOINED_TITLE = 'Joined';
export const JOINED_DATE = 'Date joined';
export const JOINED_HINT = 'Joined families are kept until a Students section exists.';
export const JOINED_DATE_HINT = 'Days after today can’t be chosen.'; // the Joined calendar's gray line (N6)
export const PAST_DAYS_HINT = 'Past days can’t be chosen.'; // the follow-up and note calendars' gray line (N6)

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
export const UNSAVED = 'Unsaved changes. Save or cancel first.';
export const DISCARD_CHANGES = 'Discard changes';
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
// under a built-in status's grayed "Delete status" (rulebook v0.632, v1.004's reason line)
export const BUILTIN_NO_DELETE = "Built-in statuses can't be deleted.";
export const deleteStatusTitle = (name) => `Delete "${name}"?`;
export const deleteStatusBody = (name, n) => (n === 0 ? `Nobody is in "${name}". It will be deleted.` : `${n === 1 ? '1 person is' : `${n} people are`} in "${name}". Move them to:`);
export const MOVE_TO = 'Move them to';
// the empty choice in a dropdown (Delete status's "Move them to", the panel's lists)
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
// the shared confirm box's "changes nothing" buttons (N3); the actions are the menu words
// (DELETE_PROSPECT, DELETE_STATUS)
export const KEEP_PROSPECT = 'Keep prospect';
export const KEEP_STATUS = 'Keep status';
export const DELETING = 'Deleting…';
export const UNDO = 'Undo';
export const UNDONE = 'Undone'; // after an Undo worked (v0.618), as the other sections say
