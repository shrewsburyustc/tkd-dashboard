// text.js — the words of the Star testing Events tab, the Add / Edit event dialog, the Delete
// event confirmation, the event page, the Registration links dialog and the flyer (build phase 2).
// Why it exists: the approved mockups (TKD-StarTesting-Events-Mockups.html, screens 1–14, v0.92
// with the two-link updates of v0.99 / v0.107, and the gap mockups G1–G5, v0.500) spell out each
// sentence. The data layer's own words (status messages, tags, the summary line, the toasts) live
// in src/lib/star/eventsText.js and are passed on from here, so a screen imports ONE word list.
//
// Lines marked "// PROPOSAL" are not drawn in the approved mockups: they follow the same pattern
// and are listed in the build report for Jeffrey to confirm or change.
//
// House words shared with Color Belt's screens (Undo, Cancel, Save, the unsaved-changes note, the
// name rules …) come from Color Belt's src/screens/testing/text.js, unchanged — the same as Star's
// Rubrics and prices screens do.
import * as CB from '../../text.js';

import { startTimeLabel } from '../../../../lib/star/starEventRules.js';
import { weekdayMonthDay } from '../../../../lib/calendarDates.js';

export * from '../../../../lib/star/eventsText.js';

// ----- House words (Color Belt's text.js, unchanged) -----
export const {
  UNDO, TOAST_UNDONE, UNDO_STALE, UNDO_FAILED, CANCEL, SAVE, SAVING, CLOSE, MORE_DETAILS, UNSAVED, DISCARD_CHANGES,
  REGISTRATION, REG_OPEN, REG_CLOSED, CLOSE_AUTOMATICALLY, CLOSE_AUTOMATICALLY_LABEL, CLOSING_DATE_LABEL,
  CLOSE_AUTOMATICALLY_HINT, NOTE_FOR_FAMILIES, NOTE_HINT, NOTE_TOO_LONG, ENTER_EVENT_NAME, ENTER_TESTING_DATE,
  TESTING_DATE_PAST, CLOSING_IN_PAST, ENTER_CLOSING_DATE, EVENT_NAME, TESTING_DATE, UPCOMING, PAST,
  EVENTS_SWITCH_LABEL, COL_EVENT, COL_TESTING_DATE, COL_STATUS, ACTIONS_COL, TAG_NOT_SAVED, CLOSE_REGISTRATION,
  OPEN_REGISTRATION, EDIT_EVENT, DELETE_EVENT, KEEP_EVENT, ADD_EVENT, ADD_EVENT_TITLE, EDIT_EVENT_TITLE,
  REGISTRATION_LINK, COPY_FAILED, LOADING_EVENTS, LOADING_EVENT, DELETE_FAILED, sortBy, moreFor, editEventLabel,
  openEventLabel, eventNameProblem, lastChanged,
} = CB;

// ----- Star testing home (v0.60, v0.177) -----
export const TAB_EVENTS = 'Events';
export const COL_CANDIDATES = 'Candidates';

// ----- Empty states (screen 3) -----
export const NO_EVENTS_ADMIN = 'No star testing events yet.';
export const NO_EVENTS_STAFF = 'No star testing events yet. An admin adds them.';
export const NO_UPCOMING = 'No upcoming events.';
export const NO_PAST = 'No past events yet.';

// ----- Rows -----
// Phone rows: "Sat, Nov 14, 2026 · 23 candidates" (screen 1)
export const eventPhoneLine = (dateIso, count) => `${CB.shortDate(dateIso)} · ${count === 1 ? '1 candidate' : `${count} candidates`}`;
export const copySchoolLink = (school) => `Copy ${school} link`;
export const printSchoolFlyer = (school) => `Print ${school} flyer`;

// ----- Add / Edit event (screens 4–7, G4, G5) -----
export const ADD_EVENT_SUB = 'Both schools test together. Rubrics and prices are copied from the Rubrics and prices tab when you save.';
// The date the event was added, in Massachusetts time, always with the year (G5).
export function editEventSub(createdIso) {
  const date = new Date(createdIso);
  const text = Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });
  return `Rubrics and prices were copied when this event was created (${text}).`;
}
export const START_TIME = 'Start time';
export const WHERE = 'Where';
export const WHERE_HINT = 'Where testing takes place. Candidates from both schools take part.';
export const CHOOSE = 'Choose…';
export const copiedFromEvent = (name) => `Start time and Where copied from ${name}. Change if needed.`;
// The calendar (v0.502, v0.503 — calendar mockups C1–C4)
export const TESTING_DATE_HINT = "Past dates can’t be chosen.";
export const MARKED_TESTING_DATE = 'Testing date.'; // after the dot, while the testing date's month is on show
export const MARKED_TESTING_DATE_SR = 'testing date'; // what a screen reader adds to that day
export const closingRangeHint = (testingDate) => `The closing date can be from today up to ${weekdayMonthDay(testingDate)}.`;
export const CLOSING_PASSED_HINT = "The testing day has passed, so a new closing date can’t be chosen. Move the testing date first.";
export const CHOOSE_TESTING_DATE_FIRST = 'Choose the testing date first.';
export const CLOSING_BLOCKED = "Can’t be turned on after the testing day. Move the testing date first.";
export const closingMoved = (date) => `Moved to ${weekdayMonthDay(date)}, so it isn’t after the testing date.`;
// v0.504: shown under the closing-date box instead of "stays open…" when saving would reopen
// registration by itself (it is kept closed)
export const KEPT_CLOSED_HINT = 'Registration stays closed when you save; open it from ⋯ when ready.';
// Edit of a finished event: the Registration switch is grayed
export const REGISTRATION_LOCKED_FINISHED = "This testing has finished, so registration can’t change.";
export const CHOOSE_START_TIME = 'Choose a start time.'; // PROPOSAL (Save tapped while it is empty)
export const CHOOSE_WHERE = 'Choose where testing takes place.'; // PROPOSAL (Save tapped while it is empty)

// ----- Delete event (screen 13, v0.91) -----
export const deleteEventTitle = (name) => `Delete ${name}?`;
// "Its 23 candidates and their registrations, payments and grades are deleted too. This can't be
// undone." / "It has no candidates. This can't be undone."
// withdrawnCount: PROPOSAL — withdrawn candidates are named apart, like Color Belt's "(plus 1 removed)".
export function deleteEventBody({ activeCount, withdrawnCount }) {
  const tail = "This can't be undone.";
  if (activeCount === 0 && withdrawnCount === 0) return `It has no candidates. ${tail}`;
  let who;
  if (activeCount === 0) who = withdrawnCount === 1 ? '1 withdrawn candidate' : `${withdrawnCount} withdrawn candidates`;
  else who = `${activeCount === 1 ? '1 candidate' : `${activeCount} candidates`}${withdrawnCount > 0 ? ` (plus ${withdrawnCount} withdrawn)` : ''}`;
  const regs = activeCount + withdrawnCount === 1 ? 'their registration, payments and grades' : 'their registrations, payments and grades';
  return `Its ${who} and ${regs} are deleted too. ${tail}`;
}

// ----- Event page (screen 11, G2, G3) -----
export const BACK_TO_STAR = 'Star testing'; // drawn as "← Star testing"
export const BACK_TO_STAR_LABEL = 'Back to Star testing';

// ----- Registration links dialog (screen 11 as updated by v0.99 / v0.107) -----
export const LINKS_TITLE = 'Registration links';
export const DAN_ON_FORM = 'Families choose their Dan on the form.';
export const schoolHeading = (school) => `${school} school`;
export const qrAlt = (school, shortLink) => `QR code for the ${school} link, ${shortLink}`;
export const NO_LINK = "This school's link isn't available. Reload the page and try again."; // PROPOSAL (a damaged code)
export const COPY_FAILED_IN_DIALOG = "Couldn't copy the link. Select the link and copy it yourself."; // PROPOSAL

// ----- The flyer (screen 12, v0.99, v0.107) -----
export const FLYER_SCHOOL = CB.FLYER_SCHOOL;
export const flyerFor = (school) => `For ${school} school students`;
export const flyerWhen = (testingDate, startTime) => `${CB.longDate(testingDate)} · ${startTimeLabel(startTime)}`;
// "Location: Shrewsbury school, 123 Main St, Shrewsbury, MA 01545" (just the school name until
// Settings → Schools has its address).
export const flyerLocation = (whereSchool, addressText) =>
  (addressText ? `Location: ${whereSchool} school, ${addressText}` : `Location: ${whereSchool} school`);
export const SCAN_TO_REGISTER = 'Scan to register';
// "Register by Saturday, November 7."
export const flyerRegisterBy = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!m) return '';
  const day = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return `Register by ${day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}.`;
};

// ----- Chooser (v0.177): words live in chooser/text.js -----
