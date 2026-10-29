// text.js — every word the PUBLIC forms page (/f/<name>) shows that the staff "Fill in" doesn't.
// Why it exists: the fields themselves (labels, "Add another child", "1 spot left", the waiver,
// the error lines under fields) come from src/screens/forms/text.js, shared with the staff side,
// so the family sees exactly what staff preview. This file holds only the page's own wording:
// header, step line, buttons, the thank-you screen and the "can't sign up" messages.
// Emails are OFF at launch (rulebook v0.601), so nothing here may mention an email being sent.
import { formatTime, parseTime } from '../lib/schedule/time.js';

export const SCHOOL = "Jae H. Jeong's U.S. Taekwondo Center";
export const PAGE_KIND = 'Sign-up form';
export const PREVIEW_BANNER = 'Preview — a test copy of the public form. Nothing reaches the school.';
export const LOADING = 'Loading the form…';

// ----- Steps -----
export const stepOf = (n, total) => `Step ${n} of ${total}`;
export const progressLabel = (n, total) => `Step ${n} of ${total}`;
export const CONTINUE = 'Continue'; // the same words on every family page (rulebook v1.017)
export const BACK = 'Back';
export const SEND = 'Send';
export const SENDING = 'Sending…';
export const FIX_ABOVE = 'Please check the answers marked above.';
// Shown in the booking step when no time is open (rulebook v0.235 wording, mockup screen 8).
export const NO_OPEN_TIMES = "No free-class times are open right now. Leave your details and we'll call you to set one up.";
export const PRIVACY = 'The school uses these details to contact you about classes. They are not shared or sold.'; // like Color Belt's form

// ----- Messages over the step (after Send) -----
export const TIME_TAKEN = 'Sorry — a time you picked just filled up. The open times are updated: please pick another one.';
export const FORM_CHANGED = 'The school just updated this form. Please check your answers (what you typed is kept) and send again.';
export const RATE_LIMITED = 'Too many tries from this connection. Please wait a few minutes and try again.';
export const VERIFY_FAILED = "We couldn't check this browser. Press Send again, or call the school.";
export const SEND_FAILED = "It wasn't sent — check the connection and press Send again. Nothing you typed is lost, and it won't be saved twice.";
export const SEND_INVALID = 'Some answers were refused. Please check them and press Send again.';
export const CLOSED_NOW = 'This form just stopped taking sign-ups.';

// ----- Thank-you screen -----
export const BOOKED_TITLE = 'Your free class';
export const KEEP_TIME = 'Please save this page (a screenshot is fine) or write the time down — it is your confirmation.';
export const KEEP_NO_TIME = 'Please save this page (a screenshot is fine) — the school will call you to set up a time.';
export const ADD_TO_CALENDAR = 'Add to calendar';
export const DEFAULT_THANK_YOU = 'We will be in touch soon.';
export const NO_CLASS_TIME = 'a time we set up with you'; // {class time} when no time was booked
export const longTime = (b) => `${longDay(b.date)} at ${formatTime(parseTime(b.start), true)}`;
export const bookedLine = (child, b) => `${child}: ${longDay(b.date)} · ${formatTime(parseTime(b.start), true)}–${formatTime(parseTime(b.end), true)} · ${b.className}`;
export const calendarTitle = (child, className) => `Free class for ${child}: ${className}`;
export const calendarFile = 'free-class.ics';
export const SIGN_UP_ANOTHER = 'Start a new sign-up';

// The thank-you screen's heading: always short (Jeffrey, F3 difference 3).
export const thanksHeading = (parentName) => {
  const first = firstName(parentName);
  return first ? `Thanks, ${first}!` : 'Thanks!';
};
const firstName = (name) => String(name ?? '').trim().split(/\s+/)[0] || '';

// The form's message shows under that heading, so an opening "Thank you, {parent}!" (the
// usual way admins start it, and the database's default) is dropped instead of said twice.
// Only a FIRST sentence that greets AND names {parent} is dropped; anything else stays.
const GREETING = /^\s*(?:thank you|thanks|hi|hello)\b[^.!?\n]*\{parent\}[^.!?\n]*[.!?]*\s*/i;
export function thankYouBody(template, info) {
  const rest = String(template || DEFAULT_THANK_YOU).replace(GREETING, '');
  return rest.trim() ? fillThankYou(rest, info) : '';
}

// The form's thank-you text with {parent} and {class time} filled in. {parent} is the parent's
// first name ("Maria Lopez" → "Maria", like the mockup's "Thanks, Maria!"); {class time} is the
// booked time(s) ("Wednesday, January 13 at 4:00 pm"), or NO_CLASS_TIME when none was booked.
export function fillThankYou(template, { parentName, bookings }) {
  const parent = firstName(parentName);
  const times = [...new Set(bookings.map((b) => longTime(b)))];
  const classTime = times.length ? times.join(' and ') : NO_CLASS_TIME;
  // (functions as replacements, so a typed name with "$&" in it stays exactly as typed)
  return String(template || DEFAULT_THANK_YOU).replaceAll('{parent}', () => parent).replaceAll('{class time}', () => classTime);
}

// "Wednesday, January 13"
export function longDay(date) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(`${date}T12:00:00Z`));
}

// ----- Can't sign up -----
export const NOT_FOUND_TITLE = 'This form was not found';
export const NOT_FOUND_TEXT = 'Check the link, or ask the school for a new one.';
export const CLOSED_TITLE = 'This form is closed';
// ----- The front-desk kiosk (kiosk plan K1–K4) -----
export const KIOSK_KEEP_TIME = 'Take a photo of this screen with your phone, or write the time down.';
export const KIOSK_KEEP_NO_TIME = 'The school will call you to set up a time.';
export const KIOSK_DONE = 'Done';
export const kioskStartingOver = (n) => `Starting over in ${n} second${n === 1 ? '' : 's'}…`;
export const KIOSK_WELCOME = 'Welcome to U.S. Taekwondo Center';
export const KIOSK_WELCOME_SUB = 'New here? Tell us about your family.';
export const KIOSK_START = 'Start';
export const KIOSK_ASK_DESK = 'Please ask at the front desk to sign up.';
export const kioskEndsAt = (time) => `Staff: kiosk mode ends at ${time}. Unlock and open it again from Share.`;
export const KIOSK_ENDED_STAFF = 'Staff: kiosk mode has ended. Tap the lock, enter your PIN, then open it again from Share.';
export const KIOSK_STILL_THERE = 'Still there?';
export const kioskClearingIn = (n) => `To keep your details private, this form clears in ${n} second${n === 1 ? '' : 's'}.`;
export const KIOSK_KEEP_GOING = "I'm still here";
export const KIOSK_LOCK = 'Staff: leave kiosk mode';
export const KIOSK_PIN_TITLE = 'Staff PIN to leave kiosk mode';
export const KIOSK_CANCEL = 'Cancel';

export const CLOSED_NO_PHONE = 'It is not taking sign-ups any more. Please contact the school.';
// With the school's phone (Settings → Schools, migration 0019): "Call us at <tap-to-call> to try a free class."
export const CALL_BEFORE = 'Call us at ';
export const CALL_AFTER = ' to try a free class.';
// "tel:" + only the digits and + signs (the shown number keeps its spaces and brackets)
export const telHref = (phone) => `tel:${String(phone).replace(/[^0-9+]/g, '')}`;
export const OFF_TITLE = 'Sign-ups are paused';
export const OFF_TEXT = 'Online sign-up is switched off for now. Please try again later, or contact the school.';
export const LOAD_FAILED_TITLE = "The form didn't load";
export const LOAD_FAILED_TEXT = 'Check the connection and try again.';
export const TRY_AGAIN = 'Try again';
