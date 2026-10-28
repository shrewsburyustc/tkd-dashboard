// eventsApi.js — every call the Star testing Events tab and the event page make to the database.
// Why it exists: the screens shouldn't need to know table names, column lists or the exact argument
// names of the database functions (migration 0006, contract §6.2). They call these friendly
// functions and always get back a plain object with a `status` CODE — and they NEVER throw, so a
// screen can't crash because the Wi-Fi dropped. The words for each code are in eventsText.js.
//
// The logic lives in eventsCore.js (so Node can check it without the browser); this file only
// connects it to the app's one connection, supabase.js — the real database, or the preview database
// (mockClient.js + mockStarEvents.js) in preview mode — and to "today" at the school (Color Belt's
// schoolToday, which follows __tkdPreview.setToday in preview mode).
//
// ===== The API for the screens =====
// Statuses: 'ok' · 'no_access' (lock the screen, the house path) · 'not_allowed' · 'invalid' ·
// 'not_found' · 'stale' · 'duplicate_name' · 'finished' · 'error' ({ status:'error', error }).
// Result fields other than status are only there when status is 'ok'.
//
// A StarEvent (what the reads return):
//   { id, name, testingDate:'YYYY-MM-DD', startTime:'10:00', whereCode:'worcester'|'shrewsbury',
//     registrationOpen, autoCloseOn:'YYYY-MM-DD'|null, firstOpenedAt:ISO|null,
//     publicCodeWorcester, publicCodeShrewsbury,            (8 characters each; links.js makes the links)
//     note|null, version, createdAt, createdByName, updatedAt, updatedByName,
//     state: 'finished'|'open'|'closed_by_date'|'not_open_yet'|'closed'   (eventRules.eventState, §5.1)
//     tag:   { code:'finished'|'testing_today'|'open_until'|'open'|'closed'|'not_open_yet', date? }  (v0.88)
//     isPast: true from the day after the testing date (v0.89)
//     activeCount, withdrawnCount, registrationCount, paymentTotalCents, removedPaymentCents }
//     (the counts come from eventRules.eventCounts: activeCount = the list's "candidates" number;
//      registrationCount + paymentTotalCents are what Delete event must send back)
//
//   loadStarEvents()
//     → { status:'ok', today, events: [StarEvent] }       every Star event (both schools), by testing date
//   loadStarEvent(eventId)
//     → { status:'ok', today, event: StarEvent, copy }     or { status:'not_found' }
//       copy = the event's own rubric and prices, taken when it was created (v0.61):
//         { dans: [{ id, dan, label, passMark, starLimit, standardCents, sameDayCents, privateCents,
//                    categories: [{ id, templateCategoryId, name, credits, position, fromClassCount }] }],
//           grades: [{ id, grade, position, value }]   (A+ … D),
//           assistant: { id, childMaxAge, childMins:[6], adultMins:[6] } | null }
//
//   addStarEvent({ name, testingDate, startTime, whereCode, registrationOpen, autoCloseOn, note })   admin
//     → { status:'ok', id, version, publicCodeWorcester, publicCodeShrewsbury }
//     refusals: not_allowed · invalid (past date, start time not 6:00 AM–10:00 PM on a 5-minute step,
//               closing date before today or after the testing date, …) · duplicate_name
//   updateStarEvent({ eventId, expectedVersion, name, testingDate, startTime, whereCode, autoCloseOn, note })   admin
//     → { status:'ok', version }      (details only — the switch is setStarRegistration)
//     refusals: not_allowed · invalid (a CHANGED date or closing date in the past, closing date after
//               the testing date …) · not_found · stale · duplicate_name
//   setStarRegistration({ eventId, expectedVersion, open })   staff and admins
//     → { status:'ok', version, state }
//     refusals: invalid · not_found · stale · finished · not_allowed (staff reopening after the
//               closing date passed; an admin reopening then also removes the date, v0.85/v0.86)
//   saveStarEventEdit({ …updateStarEvent's fields, registrationOpen, previousRegistrationOpen })   admin
//     The Edit event Save: updateStarEvent, then setStarRegistration with the new version ONLY when
//     registrationOpen !== previousRegistrationOpen (contract §11 item 7).
//     → a refusal of updateStarEvent as above (nothing saved), or
//       { status:'ok', version, registration: null }                          switch not changed
//       { status:'ok', version, registration: { status:'ok', open, state } }   both saved
//       { status:'ok', version, registration: { status:<refusal>, open } }     details saved, switch NOT
//     v0.504: pass previous: { testingDate, registrationOpen, autoCloseOn, firstOpenedAt } (the
//     record as loaded; its state is worked out fresh at save time). If the save would reopen an
//     Open-switch event by itself, registration is kept closed — case 1 (a passed closing date
//     unticked) closes first, then saves; case 2 (a finished event moved into the future) saves,
//     then closes:
//       { status:'ok', version, registration: null, keptClosed: { status:'ok', state } }
//       { status:'ok', version, registration: null, keptClosed: { status:<refusal> } }  NOT closed
//          (show "Registration for … wasn't opened/closed"; version is the details' version)
//   deleteStarEvent({ eventId, expectedVersion, expectedCandidateCount, expectedPaymentTotalCents })   admin
//     expectedCandidateCount = event.registrationCount (ALL candidates, withdrawn too),
//     expectedPaymentTotalCents = event.paymentTotalCents (the NET total) — 'stale' if either changed
//     → { status:'ok' } · not_allowed · invalid · not_found · stale
//
// Pure helpers (no database):
//   splitUpcomingPast(events) → { upcoming (soonest first), past (most recent first) }   (v0.89)
//   latestCreatedEvent(events) → the event Add event copies Start time and Where from, or null
// Related files: starEventRules.js (startTimeOptions, startTimeIsValid, startTimeLabel, WHERE_CODES),
// links.js (starSchoolLinks, starRegistrationLink, starQrSvgDataUrl), eventsText.js (the words).
// Color Belt's src/lib/testing/eventRules.js gives registrationSwitch() (to gray out Open registration
// for staff, v0.86), defaultAutoCloseOn() (7 days before) and addDays().
import { supabase } from '../supabase.js';
import { schoolToday } from '../testing/eventsApi.js';
import { createStarEventsApi, STAR_EVENT_STATUSES, splitUpcomingPast, latestCreatedEvent } from './eventsCore.js';

export { STAR_EVENT_STATUSES, splitUpcomingPast, latestCreatedEvent };

const api = createStarEventsApi(() => supabase, schoolToday);

export const loadStarEvents = api.loadStarEvents;
export const loadStarEvent = api.loadStarEvent;
export const addStarEvent = api.addStarEvent;
export const updateStarEvent = api.updateStarEvent;
export const setStarRegistration = api.setStarRegistration;
export const saveStarEventEdit = api.saveStarEventEdit;
export const deleteStarEvent = api.deleteStarEvent;
