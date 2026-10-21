// resultsApi.js — every call Star testing RESULTS makes to the database (the Results tab and the
// result email editor on Rubrics and prices, build phase 6).
// Why it exists: the screens shouldn't need to know the database functions' names or arguments
// (migration 0006 §6.6 and §7, migration 0023). They call these friendly functions and always get
// back a plain object with a `status` CODE — and they NEVER throw, so a screen can't crash because
// the Wi-Fi dropped. The logic lives in resultsCore.js (so Node can check it); this file connects it
// to the app's one connection, supabase.js (the real database, or the preview fake: mockClient.js +
// mockStarCandidates.js + mockStarResults.js). The words are in resultsText.js, the email in
// resultEmail.js, the file in csv.js.
//
// THE RULE (v0.158): the result comes ONLY from the database (star_event_results). The screens never
// work a result out. PRIVACY (§4.2, v0.160): the list holds no date of birth, email or payment.
//
// ===== The API for the screens =====
// Statuses: 'ok' · 'no_access' (lock the screen, the house path) · 'not_allowed' · 'invalid' ·
// 'not_found' · 'withdrawn' · 'stale' · 'not_finished' · 'no_email' · 'duplicate_name' (never
// expected) · 'error' ({ status:'error', error } — never show error to people). Other fields only
// come with 'ok'.
//
// A ResultRow (one candidate on the Results tab):
//   { id, firstName, lastName, locationCode, dan, starsFrom, starsTo, isMakeup, makeupOfEventName,
//     result: Result (gradingApi.js's header — status, total, maxScore, passMark, complete, gradedCount,
//             subjects, dSubjects, makeupReasons, needs, needsIds, choiceNeeded, missing, private, resultKey),
//     sent: { sent: { id, markedAt, markedByName, resultStatus } | null, matches },
//     grades: [{ eventCategoryId, gradedOn:'YYYY-MM-DD' (Massachusetts date of star_grades.updated_at), kept }] }
//
//   loadResults(eventId, dans)     dans = the event copy's Dan numbers (eventsApi.loadStarEvent → copy.dans)
//     → { status:'ok', loadedAt, dans: { [dan]: { dan, passMark, maxScore,
//           counts: { candidates, passed, makeup, notFinished, testingPrivately },   (both schools)
//           rows: [ResultRow] } } }
//       Rows in belt order (v0.117), ACTIVE candidates, private ones INCLUDED ("Testing privately").
//       Both schools — the screen filters by location (v0.118) and counts with summaryCounts(rows).
//   loadEmailAddress(candidateId)  Email result, at the click (R2) — reads star_candidate_detail and keeps
//     ONLY the address → { status:'ok', email } · 'no_email' · not_found · no_access · error
//   loadResultTexts()              → { status:'ok', texts: { passed, makeup_d, makeup_below: { id, kind, body,
//                                       version, updatedAt, updatedByName } } } · no_access · error
//
// Writes (S = staff and admins, A = admins):
//   markSent({ candidateId, resultKey })     S   resultKey = row.result.resultKey (what the row SHOWED)
//     → { status:'ok', sentId, markedAt } · not_finished · stale (the result changed meanwhile) ·
//       withdrawn · not_found · invalid
//   undoSent(sentId)                         S own send within 10 s (the toast) · A any time
//     → { status:'ok' } · not_allowed · stale (already undone) · not_found · invalid
//   downloadCsv({ event: { id, name }, dans: copy.dans })   A   the WHOLE event, both schools (Q2 = A);
//     saves the file in the browser → { status:'ok', fileName, rowCount, text } · not_allowed · not_found
//   setResultText({ kind, expectedVersion, body })          A   (R11; also the toast's Undo with the old body)
//     → { status:'ok', version, body } · not_allowed · invalid · stale · not_found
//
// Pure helpers (resultsCore.js, re-exported):
//   summaryCounts(rows) · resultTag(result) → { tone, text, icon } · resultReason(row, { testingDate,
//   isAdmin }) → { text, link } · lateNote(row, testingDate) · resultsTotalText(result, isMakeup) ·
//   sentLine(row) → { kind:'sent'|'changed'|'not_sent', text } | null · isSent(row) · canMarkSent(row) ·
//   csvFileName(eventName, today) · undoTimeLeft(clickedAtMs, nowMs) · UNDO_TOAST_MS · UNDO_CAP_MS ·
//   schoolDateOf(stamp)
// The email (resultEmail.js): resultKind(result) · canEmailResult(result) · buildResultMessage({ texts,
//   row, eventName, testingDate, danLabel }) → { status:'ok', kind, subject, body } · mailtoFor(address) ·
//   RESULT_SUBJECT · resultTextProblemDetail(kind, body) · STARTING_TEXTS · BLANKS_BY_KIND · fillBlanks
import { supabase } from '../supabase.js';
import { schoolToday } from '../testing/eventsApi.js';
import { createStarResultsApi } from './resultsCore.js';
import { saveCsvFile } from './csv.js';

export {
  STAR_RESULTS_STATUSES, UNDO_TOAST_MS, UNDO_CAP_MS, undoTimeLeft, schoolDateOf, summaryCounts, resultTag, lateNote,
  resultReason, resultsTotalText, sentLine, isSent, canMarkSent, csvFileName,
} from './resultsCore.js';

const api = createStarResultsApi(() => supabase, { getToday: schoolToday, saveFile: saveCsvFile });

export const loadResults = api.loadResults;
export const loadEmailAddress = api.loadEmailAddress;
export const loadResultTexts = api.loadResultTexts;
export const markSent = api.markSent;
export const undoSent = api.undoSent;
export const downloadCsv = api.downloadCsv;
export const setResultText = api.setResultText;
