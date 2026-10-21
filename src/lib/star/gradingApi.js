// gradingApi.js — every call Star testing GRADING makes to the database (the Grading tab and the
// private grading page, build phase 5).
// Why it exists: the screens shouldn't need to know the database functions' names or arguments
// (migration 0006, contract §6.5, §7). They call these friendly functions and always get back a plain
// object with a `status` CODE — and they NEVER throw, so a screen can't crash because the Wi-Fi
// dropped. The logic lives in gradingCore.js (so Node can check it); this file connects it to the
// app's one connection, supabase.js (the real database, or the preview fake: mockClient.js +
// mockStarCandidates.js + mockStarGrading.js). The words are in gradingText.js.
//
// THE RULE (v0.158): Total and Result come ONLY from the database's `result` (§5.5) — from a read, or
// from a save's answer. The screens never work a result out.
// PRIVACY (v0.160, v0.506): nothing here returns a date of birth, an email or a payment.
//
// ===== The API for the screens =====
// Statuses: 'ok' · 'no_access' (lock the screen, the house path) · 'not_allowed' · 'invalid' ·
// 'not_found' · 'withdrawn' · 'stale' · 'kept' · 'duplicate_name' (never expected) · 'error'
// ({ status:'error', error } — never show error to people). Other fields only come with 'ok'.
//
// A GridRow (one candidate on the grid, or the private page's one candidate):
//   { id, firstName, lastName, locationCode, dan, starsFrom, starsTo, isMakeup, makeupOfEventName,
//     classesAttended|null, assistantClasses|null, result: Result, sent: { sent, matches } }
// A Result (§5.5, camelCase — candidatesApi.js's header has the full list):
//   { status:'not_finished'|'testing_privately'|'passed'|'makeup'|'withdrawn', total, maxScore, passMark,
//     complete, gradedCount, subjectCount, subjects:[{ eventCategoryId, name, credits, position,
//     fromClassCount, grade|null, points|null, kept, keptFromEventName, retest }],
//     ai:{ ageGroup, count, grade }, dSubjects, makeupReasons:['d'|'below'], needs, needsIds,
//     choiceNeeded, missing, private:{ on, time }|null, resultKey }
//
//   loadGrading(eventId, dans)        dans = the event copy's Dan numbers (loadStarEvent → copy.dans)
//     → { status:'ok', loadedAt, dans: { [dan]: { dan, passMark, maxScore, rows:[GridRow] } } }
//       rows in belt order (v0.117), ACTIVE candidates only, private candidates LEFT OUT (v0.151,
//       v0.153: the Dan counts are rows.length). Both schools — the screen filters by location
//       (v0.118). loadedAt (ms, when the read started) goes to the save engine.
//   loadPrivateGrading(candidateId)   the private grading page (no address of its own, Q1 = A)
//     → { status:'ok', loadedAt, row: GridRow + { eventId, danLabel, privateOn, privateTime, status } }
//   loadCandidateDan(candidateId)     → { status:'ok', dan, danLabel, candidateStatus }   (the engine's `stale` check)
//   loadAgeGroups(eventId)            → { status:'ok', groups: { [candidateId]: 'child'|'adult' } }
//     (each Result already has ai.ageGroup; this is for screens that need the groups alone)
//   Subjects (grid columns) and grade letters come from the event copy: eventsApi.loadStarEvent(eventId)
//   → copy; then judgedSubjects(copy, dan) and gradeLetters(copy) below.
//
// Writes (S = staff and admins, A = admins). The Grading tab sends grades and counts THROUGH the save
// engine (src/screens/testing/star/grading/useStarGradingSaves.js), never directly.
//   setGrade({ candidateId, eventCategoryId, grade })   S   grade 'A+'…'D' or null = clear
//     → { status:'ok', grade, result } · invalid · not_found · withdrawn · stale (the candidate is in
//       another Dan now, v0.164) · kept (a kept make-up grade, OPEN-9)
//   setCount({ candidateId, field:'classesAttended'|'assistantClasses', value })   S   0–999 or null
//     → { status:'ok', result } · invalid · not_found · withdrawn
//   setMakeupSubjects({ candidateId, expectedCategoryIds, categoryIds })   A   (Choose subjects, v0.130)
//     expectedCategoryIds = the chosen set the dialog showed (result.choiceNeeded ? [] : result.needsIds)
//     → { status:'ok', result } · not_allowed · invalid (not below / has a D / not complete / a
//       subject of another Dan) · not_found · stale (someone chose meanwhile) · withdrawn
//
// Pure helpers (gradingCore.js, re-exported): gradeLetters(copy) · judgedSubjects(copy, dan) ·
// toggleGrade(current, chosen) · keptSubject(row, categoryId) · serverValue(row, kind, target) ·
// resultTag(result, { isMakeup, isAdmin, save }) → { tone, text, link, after } · totalText(result,
// isMakeup) · leftOfCount(result, isMakeup) · nextCell(rows, subjectIds, from, isEditable, isEmpty) ·
// typingStep(state, key, letters) · refusalText(…) · unsavedSummary(…) · GRADE_LETTERS · COUNT_FIELDS.
import { supabase } from '../supabase.js';
import { createStarGradingApi } from './gradingCore.js';

export {
  STAR_GRADING_STATUSES, GRADE_LETTERS, COUNT_FIELDS, gradeLetters, judgedSubjects, toggleGrade, keptSubject, serverValue,
  resultTag, totalText, leftOfCount, nextCell, typingStep, refusalText, unsavedSummary,
} from './gradingCore.js';

const api = createStarGradingApi(() => supabase);

export const loadGrading = api.loadGrading;
export const loadPrivateGrading = api.loadPrivateGrading;
export const loadCandidateDan = api.loadCandidateDan;
export const loadAgeGroups = api.loadAgeGroups;
export const setGrade = api.setGrade;
export const setCount = api.setCount;
export const setMakeupSubjects = api.setMakeupSubjects;
