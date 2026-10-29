// text.js — every word the Forms screens show, in one place.
// Why it exists: same as the Calendar's text.js — one spot to check the wording against the
// approved mockup (docs/Prospects/TKD-Forms-Mockups.html, rulebook v0.235 / v0.241 / v0.242) and
// to change it later. The data layer only returns codes ('stale', 'waiverEmpty' …); this file
// turns them into plain English.
import { formatDate } from '../../lib/schedule/versions.js';
import { formatTime, parseTime } from '../../lib/schedule/time.js';

export const PAGE_TITLE = 'Forms';
export const VIEW_ONLY_LINE = 'View only — ask an admin to create or change forms.';
export const NEW_FORM = 'New form';
export const NEW_SHORT = 'New';
export const LOADING = 'Loading forms';
export const LOAD_FAILED = "Couldn't load the forms. Check the connection and try again.";
export const BOTH_SCHOOLS = 'Both schools';
export const SCHOOL_NAME = { worcester: 'Worcester', shrewsbury: 'Shrewsbury' };
export const SCHOOL_LETTER = { worcester: 'W', shrewsbury: 'S' };
export const CANCEL = 'Cancel';
export const CLOSE = 'Close';
export const SAVE = 'Save';
export const SAVING = 'Saving…';
export const BACK = 'Back';
export const CONTINUE = 'Continue'; // Fill in uses the family page's words (rulebook v0.622)
export const MORE_ACTIONS = 'More actions';

// ----- List -----
export const COL_FORM = 'Form';
export const COL_STATUS = 'Status';
export const COL_MONTH = 'This month';
export const COL_TYPE = 'Type';
export const STATUS = { draft: 'Draft', live: 'Live', closed: 'Closed' };
export const KIND = { free_class: 'Free class', walk_in: 'Walk-in', event: 'Event', blank: 'Blank' };
export const signups = (n) => (n === 1 ? '1 sign-up' : `${n} sign-ups`);
export const thisMonth = (n) => `${n} this month`;
export const NO_FORMS = 'No forms yet.';
export const NO_FORMS_ADMIN = 'No forms yet. Start one with "New form".';
export const FILL_IN = 'Fill in';
export const FILL_IN_ITEM = 'Fill in for a family';
// while Hide private details is on, Fill in is desk-only (v0.616): the page line and the menu item's reason
export const FILL_IN_AT_DESK = 'Fill in forms at the desk. Email and form answers are hidden on this tablet.';
export const SHARE = 'Share';
export const DUPLICATE = 'Duplicate';
export const CLOSE_FORM = 'Close form';
export const OPEN_FORM = 'Open form';
export const DELETE_FORM = 'Delete';
export const shareLabel = (name) => `Share ${name}`;
export const moreLabel = (name) => `More actions for ${name}`;
export const openLabel = (name) => `Open ${name}`;
export const duplicated = (name) => `Copied as "${name}" (a Draft).`;
export const closedToast = (name) => `${name} is closed — the link now says so.`;
export const reopenedToast = (name) => `${name} is taking sign-ups again.`;
export const UNDO = 'Undo'; // on the Close / Open toasts (v1.006, N2)
export const UNDONE = 'Undone'; // after an Undo worked (v0.618)
export const UNDO_STALE = "Couldn't undo. Someone else changed this form just now."; // like Schedule's and Star's
export const deletedToast = (name) => `${name} was deleted.`;
export const DELETE_TITLE = 'Delete this form?';
export const deleteText = (name) => `"${name}" and its booking settings will be deleted. This can't be undone.`;
export const HAS_SIGNUPS = 'Families have signed up with this form, so it can\'t be deleted. Close it instead — every sign-up keeps its form.';
export const DRAFT_NO_FILL = 'Publish the form first — then it can be filled in.';

// ----- New form -----
export const NEW_FORM_TITLE = 'New form';
export const FORM_NAME = 'Form name';
export const START_FROM = 'Start from';
export const SCHOOL = 'School';
export const CREATE = 'Create';
export const CREATING = 'Creating…';
export const TEMPLATES = [
  { kind: 'free_class', label: 'Free class', sub: 'Social media sign-up with booking' },
  { kind: 'walk_in', label: 'Walk-in', sub: 'Front desk, with waiver' },
  { kind: 'event', label: 'Event', sub: 'Fairs, demos, camps' },
  { kind: 'blank', label: 'Blank', sub: 'Contact and children only' },
];
export const NAME_NEEDED = 'Give the form a name.';
export const NAME_TOO_LONG = 'Keep the name to 80 characters or fewer.';
export const NAME_BAD = 'The name has a character that can\'t be used. Retype it.';

// ----- Builder -----
export const BACK_TO_FORMS = 'Back to Forms';
export const PREVIEW = 'Preview';
export const PUBLISH = 'Publish';
export const PUBLISHING = 'Publishing…';
export const ADD_FIELD = 'Add field';
export const SAVED_NOTE = 'Changes save as you go. Families see them after Publish.';
export function statusLine(form, { dirty, saving, failed }) {
  const parts = [STATUS[form.status]];
  if (form.publishedAt) parts.push(`last published ${formatDate(form.publishedAt.slice(0, 10), { weekday: false, year: false })}`);
  else parts.push('not published yet');
  if (failed) return { text: parts.join(' · '), extra: 'not saved', warn: true };
  if (saving) return { text: parts.join(' · '), extra: 'saving…', warn: false };
  if (dirty) return { text: parts.join(' · '), extra: 'unpublished changes', warn: true };
  return { text: parts.join(' · '), extra: null, warn: false };
}
export const published = (name) => `${name} is published — families see the new version.`;
export const NOT_PUBLISHABLE = 'Write the waiver wording before publishing (select the Waiver block).';
export const NOTHING_TO_PUBLISH = 'Nothing new to publish.';
export const SAVE_FAILED_BAR = "Your last change wasn't saved. Check the connection — it will try again with your next change.";
export const STALE_BUILDER = 'Someone else changed this form. It was reloaded — please redo your last change.';
export const INVALID_SAVE = 'That change was refused. It was undone — please try it another way.';
export const NOT_ALLOWED = 'Only an admin can change forms.';
export const DUPLICATE_SLUG = 'Another form already uses that web address. Pick another one.';
export const PALETTE_GROUPS = { Contact: 'Contact', Choices: 'Choices', School: 'School', Layout: 'Layout' };
export const TYPE_LABEL = {
  short_text: 'Short text', long_text: 'Long text', phone: 'Phone', email: 'Email', number: 'Number', date: 'Date',
  choice: 'One choice', checkboxes: 'Checkboxes', dropdown: 'Dropdown', booking: 'Book a class', waiver: 'Waiver',
  heading: 'Heading and text', step: 'New step',
  parent_name: 'Parent name', parent_phone: 'Phone', parent_email: 'Email', children: 'Children',
};
export const addType = (type) => `Add ${TYPE_LABEL[type]}`;
export const ONLY_ONE = { booking: 'This form already has a Book a class block.', waiver: 'This form already has a Waiver block.' };
export const TOO_MANY = 'A form can have at most 60 fields.';
export const stepLabel = (n, label) => `Step ${n} · ${label}`;
export const REQUIRED_MARK = '· required';
export const LOCKED = 'Always on the form';
export const showsIf = (question, value) => `Shows only if "${question}" is ${value}`;
export const CHILD_HINT = 'First name, age · "+ Add another child"';
export const bookingHint = (classes, times) => (classes === 0 ? 'No classes picked yet' : `${classes === 1 ? '1 class' : `${classes} classes`} · ${times === 1 ? '1 time' : `${times} times`}`);
export const WAIVER_HINT_EMPTY = 'No wording yet — write it before publishing';
export const WAIVER_HINT = 'Waiver text · I agree · signature';
export const dragField = (label) => `Drag to reorder ${label}`;
export const fieldMore = (label) => `More actions for ${label}`;
export const SHOW_IF_ORDER = 'A "Show only if" question must stay below the question it depends on.';
export const MOVE_UP = 'Move up';
export const MOVE_DOWN = 'Move down';
export const DELETE_FIELD = 'Delete field';
export const EDIT_FIELD = 'Edit';
export const FORM_SETTINGS = 'Form settings';
export const NO_FIELD_HINT = 'Click a field to change it, or empty space for the form settings.';

// ----- Field settings -----
export const fieldTitle = (type) => (['parent_name', 'parent_phone', 'parent_email', 'children', 'booking', 'waiver', 'heading', 'step'].includes(type) ? TYPE_LABEL[type] : `${TYPE_LABEL[type]} field`);
export const LABEL = 'Label';
export const HEADING_TEXT = 'Text under the heading (optional)';
export const STEP_NAME = 'Step name';
export const HELP = 'Help text (optional)';
export const REQUIRED = 'Required';
export const ALWAYS_REQUIRED = 'Always required — we need a way to reach the family.';
export const CHILDREN_HINT = 'Families add 1 to 6 children: first name and age.';
export const BOOKING_NEVER_REQUIRED = 'Never required — when no times are open, families can still send the form.';
export const OPTIONS = 'Options';
export const option = (n) => `Option ${n}`;
export const ADD_OPTION = 'Add option';
export const removeOption = (text) => `Remove ${text || 'this option'}`;
export const SHOW_IF = 'Show only if…';
export const SHOW_IF_QUESTION = 'Question';
export const SHOW_IF_ANSWER = 'Answer is';
export const NO_EARLIER_CHOICE = 'Add a "One choice" or "Dropdown" question above this one first.';
export const WAIVER_TEXT = 'Waiver text';
export const WAIVER_ALWAYS = 'Always shown: everyone who sends this form signs the waiver.';
export const WAIVER_TEXT_HINT = 'Your school\'s own wording. Families tick "I have read and agree to the waiver" and sign.';
export const WAIVER_EMPTY = 'A waiver needs its wording before the form can be published.';
export const LABEL_PROBLEM = { empty: 'A label is needed.', tooLong: 'Keep it to 120 characters or fewer.', badCharacter: 'It has a character that can\'t be used. Retype it.' };
export const OPTION_PROBLEM = 'Each option needs 1 to 80 characters, and no two the same.';
export const DELETE_THIS_FIELD = 'Delete this field';

// ----- Booking settings -----
export const BOOK_A_CLASS = 'Book a class';
export const CLASSES_OFFERED = 'Classes offered';
export const NO_CLASSES = 'This school has no classes yet (Testing → Classes and ranks).';
export const timesAndSpots = (name) => `Times and spots · ${name}`;
// classes taught together (rulebook v0.620)
export const TOGETHER_TITLE = 'Taught together · times and spots';
export const togetherHint = (example) =>
  `One spot number for the whole time${example ? `. On the forms: “${example}”` : ''}. These times aren’t in the classes’ own lists; to offer one to a single class, untick the other class above.`;
export const togetherTime = (weekdayTimeText, names) => `${weekdayTimeText} · ${names}`;
export const SPOTS_HINT = 'Spots = free-class students per class. Untick a time to hide it.';
export const NO_TIMES = 'This class isn\'t on the schedule yet.';
export const SHOW_NEXT = 'Show the next';
export const DAYS = 'days';
export const BOOK_AHEAD = 'Book at least';
export const HOURS_AHEAD = 'hours ahead';
export const LIVE_RIGHT_AWAY = 'Changes here go live right away.';
export const SAVE_BOOKING = 'Save booking settings';
export const BOOKING_SAVED = 'Booking settings saved — they are live now.';
export const spotsFor = (time) => `Spots for ${time}`;
export const offerTime = (time) => `Offer ${time}`;
export const BOOKING_BAD = 'Spots are 0–20 a time (1–20 for the usual number), days 1–60, hours 0–72.';
export const DEFAULT_SPOTS = 'Spots per time';
export const weekdayTime = (weekday, start, end) => `${['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][weekday]} ${formatTime(parseTime(start))}–${formatTime(parseTime(end), true)}`;

// ----- Form settings -----
export const THANK_YOU = 'Thank-you message';
export const THANK_YOU_HINT = 'Shown under the heading "Thanks, {first name}!". {parent} and {class time} fill in automatically.';
export const CONFIRM_EMAIL = 'Send confirmation email';
export const ADD_TO_CALENDAR = '"Add to calendar" button';
export const ALERT_EMAIL = 'Email the school about new sign-ups';
export const ALERT_EMAIL_HINT = 'Leave empty for no alert.';
export const EMAIL_NOT_READY = 'Emails start once the school\'s sending address is set up.';
export const EMAIL_BAD = 'That doesn\'t look like an email address.';
export const WEB_ADDRESS = 'Web address';
export const SLUG_HINT = '3–40 lowercase letters, numbers and dashes.';
export const SLUG_BAD = 'Use 3–40 lowercase letters, numbers and dashes (not at the start or end).';
export const ACCEPTING = 'Accepting sign-ups (Live)';
export const ACCEPTING_DRAFT = 'Publish the form to start taking sign-ups.';
export const THANK_YOU_BAD = 'Keep it to 500 characters, with no hidden characters.';

// ----- Share -----
export const shareTitle = (name) => `Share "${name}"`;
export const LINK = 'Link';
export const COPY = 'Copy';
export const COPIED = 'Copied';
export const QR_CODE = 'QR code';
export const DOWNLOAD = 'Download';
export const PRINT_SIGN = 'Print a sign';
export const DOWNLOAD_FAILED = "Couldn't make the picture in this browser. Try Print a sign instead.";
export const qrAlt = (link) => `QR code for ${link}`;
export const qrFileName = (slug) => `qr-${slug}.png`;
export const signSchool = (code) => `Jae H. Jeong's U.S. Taekwondo Center${SCHOOL_NAME[code] ? ` · ${SCHOOL_NAME[code]}` : ''}`;
export const signScan = (link) => `Scan the code with your phone camera, or go to ${link}`;
export const FRONT_DESK = 'Front desk';
export const KIOSK = 'Open kiosk mode on this device';
export const KIOSK_HINT = 'Turns this tablet into the sign-up station at the desk. The dashboard locks while it runs.';
export const KIOSK_ONLY_LIVE = 'Only a Live form can run in kiosk mode.';
export const KIOSK_CONFIRM_TITLE = 'Open kiosk mode on this device?';
export const kioskConfirmText = (name) => `This device will show "${name}" full screen for families to sign up. The dashboard locks: the small lock in the corner and your PIN bring it back.`;
export const KIOSK_HOURS = 'Kiosk mode lasts 11 hours 45 minutes, then it asks staff to open it again.';
export const KIOSK_PIN_TIP = 'Tip: turn on Guided Access (iPad) or screen pinning (Android) so nobody can leave the page.';
export const KIOSK_NOT_SHARED = 'You are signed in with your own account. Kiosk mode is meant for the shared front-desk account: your PIN will be the one that ends it.';
export const KIOSK_OPEN = 'Open kiosk mode';
export const KIOSK_OPENING = 'Opening…';
export const KIOSK_FAILED = "Couldn't open kiosk mode. Check the connection, then try again.";
export const KIOSK_NOT_LIVE = 'This form is no longer Live, so it can\'t run in kiosk mode.';
export const KIOSK_END = 'End kiosk mode on all tablets';
export const KIOSK_END_HINT = 'For a lost or stolen tablet: its kiosk stops at the next sign-up.';
export const KIOSK_END_TITLE = 'End kiosk mode on all tablets?';
export const KIOSK_END_TEXT = 'Every tablet running this form in kiosk mode stops. A family that is filling it in right now still gets signed up.';
export const KIOSK_END_CONFIRM = 'End kiosk mode';
export const kioskEnded = (n) => (n === 0 ? 'No tablet was in kiosk mode for this form' : `Kiosk mode ended on ${n} tablet${n === 1 ? '' : 's'}`);
export const KIOSK_END_FAILED = "Couldn't end kiosk mode. Check the connection, then try again.";
export const SHARE_DRAFT = 'A Draft form can\'t be shared until it\'s published.';
export const SHARE_CLOSED = 'This form is closed — the link tells families so.';

// ----- Fill in / Preview -----
export const fillInTitle = (name) => `Fill in · ${name}`;
export const previewTitle = (name) => `Preview · ${name}`;
export const PREVIEW_NOTE = 'Preview — nothing is sent from here.';
export const PREVIEW_DRAFT_NOTE = 'Preview of your latest changes (not published yet). Nothing is sent from here.';
export const stepOf = (n, total, label) => `Step ${n} of ${total} · ${label}`;
export const ENTERED_BY = 'You are filling this in for a family. It will be marked "Entered by" you.';
export const CHILD = (n) => `Child ${n}`;
export const FIRST_NAME = 'First name';
export const AGE = 'Age';
export const ADD_CHILD = 'Add another child';
export const removeChild = (n) => `Remove child ${n}`;
export const pickTimeFor = (name) => (name ? `Free class for ${name}` : 'Free class');
export const pickTimeProblem = (name) => `Pick a time for ${name}, or "No time yet".`;
export const NO_OPEN_TIMES = 'No free-class times are open right now. Send the form and call the family to set one up.';
export const NO_TIME = 'No time yet — we\'ll call to set one up';
export const THIS_WEEK = 'This week';
export const NEXT_WEEK = 'Next week';
export const weekOf = (date) => `Week of ${date}`;
export const spotsLeft = (n) => (n === 1 ? '1 spot left' : `${n} spots left`);
export const LOADING_TIMES = 'Loading open times…';
export const TIMES_FAILED = "Couldn't load the open times. Check the connection.";
export const AGREE = 'I have read and agree to the waiver';
export const SIGN_HERE = 'Signature';
export const SIGN_HINT = 'Sign with a finger, pen or mouse.';
export const CLEAR = 'Clear';
export const SEND = 'Send';
export const SUBMITTING = 'Sending…';
export const PICK = 'Choose…';
export const FIELD_PROBLEM = {
  required: 'This one is needed.',
  text: 'Too long, or it has a character that can\'t be used.',
  phone: 'Enter a phone number (at least 7 digits).',
  email: 'Finish the email address, like name@example.com.',
  number: 'Enter a number.',
  date: 'Pick a date.',
  choice: 'Pick one of the options.',
  children: 'Add at least one child (up to 6).',
  child: 'Each child needs a first name and an age from 2 to 99.',
  signature: 'Please sign in the box.',
  booking_pick: 'Pick a time for each child, or "No time yet".',
  booking_full: 'Two children picked a time with fewer spots left. Pick another time for one of them.',
};
export const takenBy = (names) => `Taken by ${names}`;
export const SENT_TITLE = 'Sent';
export const sentText = (parent) => `${parent}'s sign-up is saved.`;
export const sentBooking = (child, b) => `${child}: ${formatDate(b.date, { year: false })} · ${formatTime(parseTime(b.start), true)} · ${b.className}`;
export const ANOTHER = 'Fill in another';
export const TIME_TAKEN = 'A picked time just filled up or was cancelled. Pick another time.';
export const FORM_CHANGED = 'The form was published again while you were filling it in. It was reloaded — check the answers and send again.';
export const FORM_CLOSED = 'This form was closed meanwhile, so it can\'t take sign-ups.';
export const SEND_FAILED = "It wasn't sent. Check the connection and press Send again (it won't be saved twice).";
export const SEND_INVALID = 'Some answers were refused. Check them and send again.';
export const timeOption = (t) => `${formatDate(t.date, { year: false })} · ${formatTime(parseTime(t.start), true)} · ${t.className}`;
export const UNSAVED = 'Unsaved changes. Save or cancel first.';
export const LEAVE_FILL = 'This sign-up isn\'t sent yet. Send it or press Cancel to throw it away.';
export const DISCARD = 'Throw it away';
