// eventsText.js — the words for every answer the Star testing events data layer can give.
// Why it exists: eventsApi.js only returns codes ('stale', 'duplicate_name', a tag code …). The
// screens need the approved sentences for them (Events mockups v0.92 with v0.99, gap mockups
// v0.500). Keeping them in one place makes them easy to check against the mockups and to change
// once. It sits next to the data layer (not in src/screens/testing/star/text.js, which is the
// Rubrics and prices screens' word list) so the Node checks can prove every status has words; the
// Events screens import it (and may add their own labels, buttons and hints to their own text file).
//
// Dates are 'YYYY-MM-DD' text and are shown in US style ("Nov 7", "Sat, Nov 14, 2026"); they are
// read as a calendar date on this computer, so they never shift a day because of time zones.
import { startTimeLabel } from './starEventRules.js';

// ----- Dates -----
function parseDay(iso) {
  const m = typeof iso === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
const dayText = (iso, options) => parseDay(iso)?.toLocaleDateString('en-US', options) ?? '';
// "Nov 7"
export const monthDay = (iso) => dayText(iso, { month: 'short', day: 'numeric' });
// "Sat, Nov 7"
export const weekdayMonthDay = (iso) => dayText(iso, { weekday: 'short', month: 'short', day: 'numeric' });
// "Sat, Nov 14, 2026"
export const shortDate = (iso) => dayText(iso, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

const SCHOOL = { worcester: 'Worcester', shrewsbury: 'Shrewsbury' };
// 'shrewsbury' → "Shrewsbury school" (Where, v0.87)
export const whereText = (code) => (SCHOOL[code] ? `${SCHOOL[code]} school` : '');
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
export const candidatesCount = (n) => plural(n, 'candidate', 'candidates');

// ----- The one tag per event (v0.88; tag codes from eventRules.stateTag) -----
export function tagText(tag) {
  switch (tag?.code) {
    case 'finished': return 'Finished';
    case 'testing_today': return 'Testing today';
    case 'open_until': return `Open until ${monthDay(tag.date)}`;
    case 'open': return 'Registration open';
    case 'closed': return 'Registration closed';
    case 'not_open_yet': return 'Not open yet';
    default: return '';
  }
}
// Green tags (the two "open" ones); all others are gray (v0.88).
export const tagIsGreen = (tag) => tag?.code === 'open_until' || tag?.code === 'open';

// ----- Event page summary line (v0.90, v0.92) -----
// "Sat, Nov 14, 2026 · 10:00 AM at Shrewsbury school · both schools · 23 candidates"
export const eventSummary = (event) =>
  `${shortDate(event.testingDate)} · ${startTimeLabel(event.startTime)} at ${whereText(event.whereCode)} · both schools · ${candidatesCount(event.activeCount ?? 0)}`;

// ----- Registration links dialog: the status line (v0.92 screen 11, v0.99) -----
export const EACH_SCHOOL_LINK = 'Each school has its own link; the link sets the candidate’s school.';
export function registrationStatusLine(event) {
  switch (event?.state) {
    case 'open':
      return event.autoCloseOn ? `Registration is open until ${weekdayMonthDay(event.autoCloseOn)}.` : 'Registration is open.';
    case 'not_open_yet':
      return "Registration hasn't been opened yet, so families can't sign up.";
    default: // closed by hand, closed by the date, finished
      return "Registration is closed, so families can't sign up right now.";
  }
}

// ----- Edit event: the closing date unticked (gap mockups G5, v0.500) -----
export const switchOnlyHint = (open) =>
  (open ? 'Registration stays open until you close it, or until the end of the testing day.' : 'Registration stays closed until you open it.');

// ----- Toasts (v0.92) -----
export const TOAST_EVENT_ADDED = 'Event added';
export const TOAST_CHANGES_SAVED = 'Changes saved';
// v0.504: the save would have reopened registration by itself, so it was closed again (+ Undo)
export const TOAST_CHANGES_SAVED_KEPT_CLOSED = 'Changes saved. Registration stays closed — open it from ⋯ when ready.';
// v0.504: …but closing it again failed — registration IS open (amber banner, Retry closes it)
export const SAVED_BUT_OPEN = 'Changes saved, but registration is open. Close it now.';
export const TOAST_EVENT_DELETED = 'Event deleted';
export const TOAST_LINK_COPIED = 'Link copied';
export const TOAST_REGISTRATION_CLOSED = 'Registration closed';
export const TOAST_REGISTRATION_OPEN = 'Registration open';
export const TOAST_REGISTRATION_OPEN_DATE_REMOVED = 'Registration open. The automatic closing date was removed.';

// ----- Field messages (amber, under the field) -----
export const duplicateEventName = (name) => `There's already an event called ${name}. Try another name.`;
export const CLOSING_AFTER_TESTING = 'The closing date must be on or before the testing date.';

// ----- Loading -----
export const LOAD_EVENTS_FAILED = 'Couldn’t load events. Check the connection, then retry.'; // G1
export const LOAD_EVENT_FAILED = 'Couldn’t load this event. Check the connection, then retry.'; // G2
export const EVENT_GONE = 'This testing event was deleted, or the link is wrong.'; // G3

// ----- Refusals -----
export const STALE = "Someone else changed this just now. Your change wasn't saved.";
export const STALE_DIALOG = "Someone else changed this just now. Your change wasn't saved. Cancel, then open it again to see the latest.";
export const STALE_DIALOG_PHONE = "Someone else changed this just now. Your change wasn't saved. Discard changes, then open it again to see the latest.";
export const EVENTS_NOT_ALLOWED = "Only an admin can add or change events. Your change wasn't saved.";
export const INVALID_DIALOG = "That didn't save. Check the fields and try again.";
export const SAVE_FAILED = "Couldn't save. Check the connection, then try again.";
export const REOPEN_NEEDS_ADMIN = 'The closing date has passed. Ask an admin to reopen.';
export const REGISTRATION_NEEDS_ADMIN = "The closing date has passed. Ask an admin to reopen. Registration wasn't opened.";
// Not drawn in the mockups: Color Belt's live wording.
export const REGISTRATION_FINISHED = 'This testing has finished, so registration can no longer change.';
export const registrationNotClosed = (name) => `Registration for ${name} wasn't closed. Check the connection and try again.`;
export const registrationNotOpened = (name) => `Registration for ${name} wasn't opened. Check the connection and try again.`;
// Not drawn in the mockups (Delete event failing): proposed, in the same pattern.
export const eventNotDeleted = (name) => `${name} wasn't deleted. Check the connection and try again.`;
// Staff's gray line (v0.86)
export const STAFF_LINE = 'Staff can open or close registration from ⋯ until the closing date. Ask an admin to add or change events.';

// The message for an answer, by which action it answered. Returns:
//   null            for 'ok' (the screen shows its toast) and 'no_access' (the screen locks)
//   { field, text } for a message under a field ('duplicate_name' → the Event name field)
//   { text }        for a dialog note or a banner
// action: 'add' | 'edit' | 'open' | 'close' | 'delete'
// name: the event name (for the sentences that name it); phone: true on a phone (full-screen
// dialog without Cancel).
export function statusMessage(action, status, { name = '', phone = false } = {}) {
  if (status === 'ok' || status === 'no_access') return null;
  const dialog = action === 'add' || action === 'edit';
  switch (status) {
    case 'duplicate_name':
      return { field: 'name', text: duplicateEventName(name) };
    case 'stale':
    case 'not_found': // the event was deleted elsewhere: treated as "someone else changed it" (G3)
      if (dialog) return { text: phone ? STALE_DIALOG_PHONE : STALE_DIALOG };
      return { text: STALE };
    case 'not_allowed':
      if (action === 'open') return { text: REGISTRATION_NEEDS_ADMIN };
      return { text: EVENTS_NOT_ALLOWED };
    case 'finished':
      return { text: REGISTRATION_FINISHED };
    case 'invalid':
      if (dialog) return { text: INVALID_DIALOG };
      // a switch or delete call refused its arguments: the screen sent something odd; reload
      return { text: STALE };
    default: // 'error' and anything unexpected: the connection
      if (action === 'open') return { text: registrationNotOpened(name) };
      if (action === 'close') return { text: registrationNotClosed(name) };
      if (action === 'delete') return { text: eventNotDeleted(name) };
      return { text: SAVE_FAILED };
  }
}
