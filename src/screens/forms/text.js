// text.js — every word the Forms screens show, in one place.
// Why it exists: same as the Calendar's text.js — one spot to check the wording against the
// approved mockup (docs/Prospects/TKD-Forms-Mockups.html, rulebook v0.235 / v0.241 / v0.242) and
// to change it later. The data layer only returns codes ('stale', 'waiverEmpty' …); this file
// turns them into plain English.
import { formatDate, localDay } from '../../lib/schedule/versions.js';
import { formatTime, parseTime } from '../../lib/schedule/time.js';
// The sentences every section says the same way (R2-07, S-2; rulebook v1.045 (4), v1.051 (2)) live in the shared file.
import { UNDO_DIDNT_SAVE, couldntUndo, loadFailedNamed, someoneElseChanged } from '../../components/text.js';

export const PAGE_TITLE = 'Forms';
// Staff can fill in and share forms, so the line says what they can do first (the second pattern in v1.021).
export const VIEW_ONLY_LINE = 'Staff can fill in and share forms. Ask an admin to create or change forms.';
export const NEW_FORM = 'New form';
export const NEW_SHORT = 'New';
export const LOADING = 'Loading forms';
// S-2: "Couldn't load the forms. Check the connection, then retry." (the list; its bar has Retry)
export const LOAD_FAILED = loadFailedNamed('the forms');
// … and opening one form in the builder (its bar has a Retry that opens it again)
export const LOAD_FORM_FAILED = loadFailedNamed('the form');
export const RETRY = 'Retry';
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
export const NO_FORMS = 'No forms yet. An admin adds them.'; // v0.53 (§8 Empty states): says who adds them
export const NO_FORMS_ADMIN = 'No forms yet. Start one with "New form".';
export const FILL_IN = 'Fill in';
export const FILL_IN_ITEM = 'Fill in for a family';
// while Hide private details is on, Fill in is desk-only (v0.616): the page line and the menu item's reason
// (M-05, v1.055: every child on these forms has a date of birth, and the switch hides it too)
export const FILL_IN_AT_DESK = 'Fill in forms at the desk. Dates of birth, email and form answers are hidden on this tablet.';
export const SHARE = 'Share';
export const DUPLICATE = 'Duplicate';
export const CLOSE_FORM = 'Close form';
export const OPEN_FORM = 'Open form';
// the ⋯ item and the confirm box's action say the same words (design review N3, v1.008)
export const DELETE_FORM = 'Delete form';
// On Both a copy has the same name as its form at the other school (v0.642), so each row's buttons
// also name the school: "More actions for Walk-in, Worcester" (v0.644)
export const withSchool = (name, school) => (school ? `${name}, ${school}` : name);
export const shareLabel = (name) => `Share ${name}`;
export const moreLabel = (name) => `More actions for ${name}`;
export const openLabel = (name) => `Open ${name}`;
// One-sentence toasts have no closing full stop and no check mark (v1.051 (5), v1.046 (7)); a dash doesn't make two sentences
export const duplicated = (name) => `Copied as "${name}" (a Draft)`;
export const closedToast = (name) => `${name} is closed — the link now says so`;
export const reopenedToast = (name) => `${name} is taking sign-ups again`;
// "Copy to Worcester / Shrewsbury" (rulebook v0.642): the ⋯ item names the other school, and the
// toast says where the Draft copy went. A form with a booking step adds what still has to be done:
// the other school's class times are picked in the copy's Booking settings.
export const copyTo = (school) => `Copy to ${school}`;
export const copiedTo = (school, hasBooking) => (hasBooking
  ? `Copied to ${school} as a Draft. Pick its class times before you publish.` // two sentences keep their full stops (v1.051 (5))
  : `Copied to ${school} as a Draft`); // one sentence: no full stop (v1.051 (5)), no ✓ (v1.046 (7))
// Two refusals of a copy that trying again can't fix, so their bar has no Retry (v1.004: Retry
// "where it applies"); both are rare: the form's saved questions no longer pass today's checks,
// or the other school already has 50 copies of its link.
export const COPY_REFUSED = "This form couldn't be copied. Open it and check its questions, then try again.";
export const copyTooMany = (school) => `This form has been copied to ${school} too many times. Delete an old copy, then try again.`;
export const UNDO = 'Undo'; // on the Close / Open and Copy toasts (v1.006, N2; v0.642)
export const UNDONE = 'Undone'; // after an Undo worked (v0.618)
// after an Undo that opened a form again (v1.051 (1), R2-07's open part): two sentences keep their full stops
export const UNDONE_OPEN = 'Undone. The form is open again.';
// R2-07: a change or an Undo that the database refused because someone else changed the form first
// (the shared sentence, naming the form; the list or builder then shows their change)
export const staleForm = (name) => someoneElseChanged(name);
// A save or an Undo that failed on the connection: the bar has Retry, which does the same again
// (v1.004; Black Belt's and the Schedule's words). Used by Copy to the other school (v0.642);
// design review R2-01 moves the list's other actions to them.
export const SAVE_FAILED = "Couldn't save. Check the connection, then try again.";
export const UNDO_FAILED = UNDO_DIDNT_SAVE; // the shared sentence (R2-07)
export const deletedToast = (name) => `${name} was deleted`;
// Delete form on a form someone else changed or deleted meanwhile (U-03): the box closes and the page's bar says
// it, with staleForm's words above.
export const FORM_GONE = 'That form no longer exists.';
export const DELETE_TITLE = 'Delete this form?';
export const KEEP_FORM = 'Keep form'; // the confirm box's "changes nothing" button (N3)
export const DELETING = 'Deleting…';
// Delete form failed (the connection): nothing tries again by itself, so the words don't say it
// will (Star's approved v0.518 wording)
export const DELETE_FAILED = "Couldn't delete. Check the connection, then try again.";
export const deleteText = (name) => `"${name}" and its booking settings will be deleted. This can't be undone.`;
export const HAS_SIGNUPS = 'Families have signed up with this form, so it can\'t be deleted. Close it instead — every sign-up keeps its form.';
export const DRAFT_NO_FILL = 'Publish the form first — then it can be filled in.';
// A Closed form is already published: only an admin can open it again (rulebook v0.629)
export const CLOSED_NO_FILL = 'This form is closed. An admin can open it again.';

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
export const BACK_TO_FORMS = 'Back to Forms'; // the back link's name for screen readers
export const FORMS_LINK = 'Forms'; // the back link's visible words: "← Forms" (v1.020, v0.624)
export const PREVIEW = 'Preview';
export const PUBLISH = 'Publish';
export const PUBLISHING = 'Publishing…';
export const ADD_FIELD = 'Add field';
export const SAVED_NOTE = 'Changes save as you go. Families see them after Publish.';
export function statusLine(form, { dirty, saving, failed }) {
  const parts = [STATUS[form.status]];
  if (form.publishedAt) parts.push(`last published ${formatDate(localDay(form.publishedAt), { weekday: false, year: false })}`);
  else parts.push('not published yet');
  if (failed) return { text: parts.join(' · '), extra: 'not saved', warn: true };
  if (saving) return { text: parts.join(' · '), extra: 'saving…', warn: false };
  if (dirty) return { text: parts.join(' · '), extra: 'unpublished changes', warn: true };
  return { text: parts.join(' · '), extra: null, warn: false };
}
export const published = (name) => `${name} is published — families see the new version`;
export const NOT_PUBLISHABLE = 'Write the waiver wording before publishing (select the Waiver block).';
export const NOTHING_TO_PUBLISH = 'Nothing new to publish.';
export const SAVE_FAILED_BAR = "Your last change wasn't saved. Check the connection — it will try again with your next change.";
export const INVALID_SAVE = 'That change was refused. It was undone — please try it another way.';
export const NOT_ALLOWED = 'Only an admin can change forms.';
export const DUPLICATE_SLUG = 'Another form already uses that web address. Pick another one.';
export const PALETTE_GROUPS = { Contact: 'Contact', Choices: 'Choices', School: 'School', Layout: 'Layout' };
export const TYPE_LABEL = {
  short_text: 'Short text', long_text: 'Long text', phone: 'Phone', email: 'Email', number: 'Number', date: 'Date',
  address: 'Address', choice: 'One choice', checkboxes: 'Checkboxes', dropdown: 'Dropdown', booking: 'Book a class', waiver: 'Waiver',
  heading: 'Heading and text', step: 'New step',
  parent_name: 'Parent name', parent_phone: 'Phone', parent_email: 'Email', children: 'Children',
};
export const addType = (type) => `Add ${TYPE_LABEL[type]}`;
export const ONLY_ONE = {
  booking: 'This form already has a Book a class block.',
  waiver: 'This form already has a Waiver block.',
  address: 'This form already has an Address question.', // one per form (v0.634)
};
export const TOO_MANY = 'A form can have at most 60 fields.';
export const stepLabel = (n, label) => `Step ${n} · ${label}`;
export const REQUIRED_MARK = '· required';
export const LOCKED = 'Always on the form';
export const showsIf = (question, value) => `Shows only if "${question}" is ${value}`;
export const CHILD_HINT = 'First name, last name, date of birth · "+ Add another child"'; // v0.634, v0.637
export const ADDRESS_HINT = 'Street, city, state, ZIP code'; // the Address question in the builder (v0.634)
export const bookingHint = (classes, times) => (classes === 0 ? 'No classes picked yet' : `${classes === 1 ? '1 class' : `${classes} classes`} · ${times === 1 ? '1 time' : `${times} times`}`);
export const WAIVER_HINT_EMPTY = 'No wording yet — write it before publishing';
export const WAIVER_HINT = 'Waiver text · I agree · signature';
export const dragField = (label) => `Drag to reorder ${label}`;
export const fieldMore = (label) => `More actions for ${label}`;
export const SHOW_IF_ORDER = 'A "Show only if" question must stay below the question it depends on.';
export const MOVE_UP = 'Move up';
export const MOVE_DOWN = 'Move down';
export const DELETE_FIELD = 'Delete field';
// The toast after deleting a field, with Undo (rulebook v0.630)
// A refused Undo of Delete field shows in the builder's amber bar, not a toast (U-02; v1.045 (4) pattern)
export const UNDO_FIELD_CHANGED = couldntUndo('the form has changed since'); // the shared "Couldn't undo: [reason]."
export const fieldDeleted = (label) => (String(label ?? '').trim() ? `“${String(label).trim()}” deleted` : 'Field deleted');
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
export const CHILDREN_HINT = 'Families add 1 to 6 children: first name, last name and date of birth.';
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
// N11 (rulebook v0.427, v1.023): the hint points to Settings → Classes and ranks, and those words are a link
// (BookingSettings.jsx draws them; the address is #settings/classes-and-ranks)
export const NO_CLASSES_BEFORE = 'This school has no classes yet (';
export const NO_CLASSES_LINK = 'Settings → Classes and ranks';
export const NO_CLASSES_AFTER = ').';
export const NO_CLASSES = `${NO_CLASSES_BEFORE}${NO_CLASSES_LINK}${NO_CLASSES_AFTER}`;
export const SETTINGS_CLASSES_ADDRESS = '#settings/classes-and-ranks';
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
export const BOOKING_SAVED = 'Booking settings saved — they are live now';
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
// Share's Copy failed (U-05): the shared words, as the Registration link box says them
export { COPY_FAILED } from '../../components/text.js';
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
export const KIOSK_STAY = 'Stay in the dashboard'; // the open ask's "changes nothing" button (N3)
export const KIOSK_FAILED = "Couldn't open kiosk mode. Check the connection, then try again.";
export const KIOSK_NOT_LIVE = 'This form is no longer Live, so it can\'t run in kiosk mode.';
export const KIOSK_END = 'End kiosk mode on all tablets';
export const KIOSK_END_HINT = 'For a lost or stolen tablet: its kiosk stops at the next sign-up.';
export const KIOSK_END_TITLE = 'End kiosk mode on all tablets?';
export const KIOSK_END_TEXT = 'Every tablet running this form in kiosk mode stops. A family that is filling it in right now still gets signed up.';
export const KIOSK_END_CONFIRM = 'End kiosk mode';
export const KIOSK_ENDING = 'Ending…';
export const KIOSK_KEEP_ON = 'Keep kiosk mode on'; // the end ask's "changes nothing" button (N3)
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
export const LAST_NAME = 'Last name'; // v0.637
export const DOB = 'Date of birth'; // v0.634: the age is worked out from it
// inside the date of birth's calendar (the same set-up as Star's date of birth)
// (L-09: one agreed hint, with the curly apostrophe; kept here until Dashboard core's shared file holds it)
export const DOB_CALENDAR_HINT = 'Pick the month and year first, then the day. Future dates can’t be chosen.';
export const yearsOld = (n) => (n === 1 ? '1 year old' : `${n} years old`); // under the date of birth once picked
export const ADD_CHILD = 'Add another child';
// The Address question's four boxes (v0.634; the question's own label, e.g. "Home address", is above them)
export const STREET = 'Street address';
export const CITY = 'City';
export const STATE = 'State';
export const ZIP_CODE = 'ZIP code';
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
export const TIMES_FAILED = loadFailedNamed('the open times'); // S-2 (Fill in's notice has a Retry beside it)
export const AGREE = 'I have read and agree to the waiver';
export const SIGN_HERE = 'Signature';
export const SIGN_HINT = 'Sign with a finger, pen or mouse.';
// under the signature: today's date, filled in by itself (v0.635); the day saved is the day it's sent
// (the two words now live in the shared file, so Star's form says exactly the same; re-exported here)
export { DATE_SIGNED, DATE_SIGNED_HINT } from '../../components/text.js';
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
  // the children's boxes (v0.634, v0.637): put together into one line by childrenProblemLine below
  child_dob: "Pick each child's date of birth.",
  child_name_long: "Keep each child's first and last name to 40 characters or fewer.",
  child_name_bad: "A child's name has a character that can't be used. Retype it.",
  child_age: 'Each child needs to be 2 to 99 years old. Check the date of birth.',
  // the Address question (v0.634): put together by addressProblemLine below
  address: 'Enter the whole address: street, city, state and ZIP code.',
  zip: 'Enter a 5-digit ZIP code, like 01604.', // L-09: Settings → Schools' words
  signature: 'Please sign in the box.',
  booking_pick: 'Pick a time for each child, or "No time yet".',
  booking_full: 'Two children picked a time with fewer spots left. Pick another time for one of them.',
};
// "a", "a and b", "a, b and c"
const andList = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
const CHILD_BOX_WORDS = { first_name: 'first name', last_name: 'last name', dob: 'date of birth' };
// The ONE line under the children, about every wrong box at once (design review), from
// childrenProblemKinds (lib/forms/fields.js): e.g. a blank child → "Enter each child's first name,
// last name and date of birth."
export function childrenProblemLine({ missing, long, bad, age }) {
  const parts = [];
  if (missing.length === 1 && missing[0] === 'dob') parts.push(FIELD_PROBLEM.child_dob);
  else if (missing.length > 0) parts.push(`Enter each child's ${andList(missing.map((box) => CHILD_BOX_WORDS[box]))}.`);
  if (long) parts.push(FIELD_PROBLEM.child_name_long);
  if (bad) parts.push(FIELD_PROBLEM.child_name_bad);
  if (age) parts.push(FIELD_PROBLEM.child_age);
  return parts.join(' ');
}
// The ONE line under an address, about every wrong box at once: codes = addressPartProblems' values
export function addressProblemLine(codes) {
  return ['address', 'zip', 'text'].filter((code) => codes.includes(code)).map((code) => FIELD_PROBLEM[code]).join(' ');
}
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
// Phones have no Cancel button, so the phone note points at its own link instead (design review N15)
export const LEAVE_FILL_PHONE = 'This sign-up isn\'t sent yet. Send it or discard it.';
export const DISCARD_CHANGES = 'Discard changes';
