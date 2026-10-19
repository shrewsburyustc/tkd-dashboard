// starEventRules.js — the small rules of a Star testing EVENT that Color Belt's rules don't cover.
// Why it exists: the Add / Edit event dialog, the data layer (eventsCore.js) and the preview
// database (mockStarEvents.js) must agree on which start times are allowed and which places an
// event can be "Where". The real database (migration 0006) has the same rule in SQL
// (star_start_time_is_valid, contract 0006 §2.2): from 8:00 AM to 8:00 PM, on a 15-minute step,
// no seconds. Color Belt's class-time list (5-minute steps, 6 AM–10 PM) is NOT the same rule, so
// it isn't reused.
//
// Everything else about an event's state (open / closed / finished, the list tag, who may flip the
// Registration switch) is EXACTLY Color Belt's rule (contract 0006 §5.1 = 0005's), so it is
// imported from src/lib/testing/eventRules.js, never copied or changed.
//
// It also holds v0.504's rule (editWouldReopen, at the end): an Edit event save never reopens
// registration by itself.
//
// It is PURE: no React, no database, no browser — so Node checks and the preview database can
// import it.
//
// Words used:
//   start time   'HH:MM' in the app ('10:00'); the database sends 'HH:MM:SS' ('10:00:00')
//   where code   'worcester' | 'shrewsbury' — where the testing takes place (information only,
//                v0.87; Star events always cover both schools)

import { eventState } from '../testing/eventRules.js';

// The first and last allowed start time, and the step, in minutes after midnight.
export const START_TIME_FIRST_MINUTES = 8 * 60; // 8:00 AM
export const START_TIME_LAST_MINUTES = 20 * 60; // 8:00 PM
export const START_TIME_STEP_MINUTES = 15;

// A school's public code (the end of its family link): 8 characters, the letters a–z without i, l
// and o, and the digits 2–9 (no look-alikes such as 0/o or 1/l/i). Contract 0006 §2.2; the
// database draws codes from exactly this set (testing_new_public_code).
export const STAR_CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const STAR_CODE_PATTERN = /^[a-hjkmnp-z2-9]{8}$/;

// The two places an event can be held (the locations table's codes), in the order shown.
export const WHERE_CODES = ['worcester', 'shrewsbury'];

// 'HH:MM' or 'HH:MM:SS' (24-hour). Anything else is not a time.
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

// '10:15' / '10:15:00' → 615 (minutes after midnight). Seconds must be 0 (else null), because the
// database refuses a start time with seconds. Not a time → null.
export function startTimeMinutes(text) {
  const m = typeof text === 'string' ? TIME_PATTERN.exec(text) : null;
  if (!m) return null;
  if (m[3] !== undefined && m[3] !== '00') return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

// Is this a start time the database accepts? 8:00 AM–8:00 PM on a 15-minute step (v0.92).
// Both ends count: '08:00' and '20:00' are fine; '07:45', '20:15' and '10:05' are not.
export function startTimeIsValid(text) {
  const minutes = startTimeMinutes(text);
  return minutes !== null
    && minutes >= START_TIME_FIRST_MINUTES
    && minutes <= START_TIME_LAST_MINUTES
    && minutes % START_TIME_STEP_MINUTES === 0;
}

const two = (n) => String(n).padStart(2, '0');

// '10:00:00' (how the database sends a time) → '10:00' (how the app keeps it). Bad → null.
export function shortStartTime(text) {
  const minutes = startTimeMinutes(text);
  return minutes === null ? null : `${two(Math.floor(minutes / 60))}:${two(minutes % 60)}`;
}

// 615 → '10:15 AM', 720 → '12:00 PM', 1200 → '8:00 PM'.
function minutesLabel(minutes) {
  const h24 = Math.floor(minutes / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${two(minutes % 60)} ${h24 < 12 ? 'AM' : 'PM'}`;
}

// '10:00' or '10:00:00' → '10:00 AM' (the event page summary, the flyer). Bad → ''.
export function startTimeLabel(text) {
  const minutes = startTimeMinutes(text);
  return minutes === null ? '' : minutesLabel(minutes);
}

// Every choice of the Start time dropdown, in order: [{ value: '08:00', label: '8:00 AM' }, …
// { value: '20:00', label: '8:00 PM' }] — 49 choices.
export function startTimeOptions() {
  const options = [];
  for (let m = START_TIME_FIRST_MINUTES; m <= START_TIME_LAST_MINUTES; m += START_TIME_STEP_MINUTES) {
    options.push({ value: `${two(Math.floor(m / 60))}:${two(m % 60)}`, label: minutesLabel(m) });
  }
  return options;
}

// ----- v0.504: an Edit event save never reopens registration by itself -----
// Registration is open when the switch is Open AND the dates allow it (eventRules.eventState). With
// the switch left Open, two edits could make a closed event open again without anyone choosing to:
//   1. unticking a closing date that has already passed;
//   2. moving a finished event (no closing date) to a testing date in the future.
// This says whether a save would do that: the event was NOT open before, the switch was Open and
// stays Open (a person who turns the switch to Open in the dialog DOES choose to open), and the
// saved values would be 'open'. The caller then closes registration straight after the save.
//   previousState            the event's state before the save ('open', 'closed_by_date', 'finished' …)
//   registrationOpen         the switch in the dialog; previousRegistrationOpen: as it was saved
//   saved                    { testingDate, autoCloseOn } as they will be saved
export function editWouldReopen({ previousState, registrationOpen, previousRegistrationOpen, saved, today }) {
  if (previousState === 'open' || registrationOpen !== true || previousRegistrationOpen !== true) return false;
  return eventState({ testingDate: saved.testingDate, registrationOpen: true, autoCloseOn: saved.autoCloseOn ?? null, firstOpenedAt: null }, today) === 'open';
}
