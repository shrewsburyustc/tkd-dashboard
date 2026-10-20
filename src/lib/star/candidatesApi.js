// candidatesApi.js — every call the Star testing Candidates tab makes to the database.
// Why it exists: the screens shouldn't need to know table names, column lists or the exact argument
// names of the database functions (migration 0006, contract §6.3–§6.4, §7). They call these friendly
// functions and always get back a plain object with a `status` CODE — and they NEVER throw, so a
// screen can't crash because the Wi-Fi dropped. The words for each code are in candidatesText.js
// (statusMessage(action, status, …)).
//
// The logic lives in candidatesCore.js (so Node can check it without the browser); this file only
// connects it to the app's one connection, supabase.js — the real database, or the preview database
// (mockClient.js + mockStarCandidates.js) in preview mode — and to "today" at the school.
//
// PRIVACY: date of birth and email come ONLY from loadCandidateDetail (v0.160). No list has them.
// While "Hide private details" is on, the screens hide DOB, email and every payment detail (v0.506).
//
// ===== The API for the screens =====
// Statuses: 'ok' · 'no_access' (lock the screen, the house path) · 'not_allowed' · 'invalid' ·
// 'not_found' · 'stale' · 'finished' · 'withdrawn' · 'already_paid' · 'already_added' ·
// 'choice_needed' · 'grades_exist' (+ gradeCount) · 'no_fee' · 'refund_too_large' (+ overpaidCents) ·
// 'error' ({ status:'error', error } — never show error to people). Result fields other than status
// are only there when status is 'ok' (except the two extras named above).
//
// A Candidate (loadCandidates; one roster row, star_roster §2.12):
//   { id, eventId, firstName, lastName, locationCode:'worcester'|'shrewsbury', dan, danLabel,
//     starsFrom, starsTo, starLimit, payingBy:'cash'|'check'|'card'|null, source:'form'|'desk',
//     reference:'ST-4001'|null, registeredAt, status:'active'|'withdrawn',
//     withdrawnReason:'withdrawn'|'duplicate_copy'|null, withdrawnAt, withdrawnByName,
//     duplicateState:'none'|'possible'|'kept_both', duplicateOf (id|null),
//     isMakeup, makeupOfCandidateId, makeupOfEventName, privateOn:'YYYY-MM-DD'|null, privateTime:'16:00'|null,
//     classesAttended|null, assistantClasses|null, version, createdAt, createdByName, updatedAt,
//     updatedByName, testingDate, standardCents, sameDayCents, privateCents,
//     paidCents (net), paid (paidCents > 0), lastPaymentId, paidOn, paidMethod, lastPaymentRecordedAt,
//     lastPaymentRecordedByName, refundedCents (refunds standing), feeKind:'none'|'private'|'standard'|'same_day',
//     expectedFeeCents (Record payment fills this in — screens never work out a fee), overpaidCents,
//     makeupSubjects: [{ id, candidateId, eventCategoryId, kind:'retest'|'chosen' }] (make-up rows) }
//
//   loadCandidates(eventId)
//     → { status:'ok', today, candidates:[Candidate] }   active AND withdrawn, in belt order (v0.117)
//       subject names: loadStarEvent(eventId).copy.dans[].categories (eventsApi.js), by eventCategoryId
//   loadCandidateDetail(candidateId)   (also the compare dialog, once per column; Delete permanently)
//     → { status:'ok', candidate:{ …Candidate's own fields, dateOfBirth|null, emailForResults|null,
//                                   ageOnTestingDay|null, testingDate },
//         signature:{ state:'on_file'|'removed'|'none', signedAt, signatureDeletedAt, ackVersion },
//         payments:[{ id, candidateId, kind:'payment'|'refund'|'reversal', amountCents, method, paidOn,
//                     recordedAt, recordedByName, reversesPaymentId, reversed }]   (oldest first),
//         paidCents, expectedFeeCents, feeKind, overpaidCents,
//         makeupSubjects:[{ eventCategoryId, name, kind }],
//         result:{ status:'withdrawn'|'testing_privately'|'not_finished'|'passed'|'makeup', total, maxScore,
//                  passMark, complete, gradedCount, subjectCount, subjects:[{ eventCategoryId, name, credits,
//                  position, fromClassCount, grade|null, points|null, kept, keptFromEventName, retest }],
//                  ai:{ ageGroup, count, grade }, dSubjects, makeupReasons:['d'|'below'], needs, needsIds,
//                  choiceNeeded, missing, private:{ on, time }|null, resultKey },
//         sent:{ sent:{ id, markedAt, markedByName, resultStatus }|null, matches } }
//     refusals: invalid · not_found
//   loadCandidateHistory(candidateId)
//     → { status:'ok', rows:[{ occurredAt, actorName, action, tableName, op:'insert'|'update'|'delete',
//                             before, after }] }   newest first, ≤ 500; before/after = changed columns
//       (database names). historyPrivacy(row) says what to hide while Hide private details is on.
//   viewSignature(candidateId)
//     → { status:'ok', signature:'data:image/png;base64,…'|null, signedAt, signatureDeletedAt }
//   loadMakeupList(eventId)   (a POST — it writes: the signature clean-up, contract §7)
//     → { status:'ok', rows:[{ candidateId (the EARLIER candidate), firstName, lastName, locationCode, dan,
//         starsFrom, starsTo, earlierEventId, earlierEventName, earlierTestingDate, needs:[names],
//         choiceNeeded ("Can't add yet"), alreadyAdded ("Already added") }] }   newest earlier event first
//
// Writes (who: S = staff and admins, A = admins only):
//   addCandidate({ eventId, firstName, lastName, dateOfBirth|null, email, locationCode, dan, starsFrom, payingBy })  S
//     → { status:'ok', id, version }   · invalid (names, DOB in the future, email, Dan/stars) · not_found · finished
//   addMakeup({ eventId, earlierCandidateId })   S
//     → { status:'ok', id, version, keptCount, retestCount }
//     · invalid · not_found · finished · already_added · stale (no longer a make-up) · choice_needed
//   updateCandidate({ candidateId, expectedVersion, firstName, lastName, dateOfBirth|null, email, locationCode,
//                     dan, starsFrom, clearGradeCount: null })   S; a Dan change on a PAID row: A (S8)
//     → { status:'ok', version, clearedGradeCount }
//     · { status:'grades_exist', gradeCount } → confirm, then call again with clearGradeCount = gradeCount
//     · invalid (a family-form row needs its DOB) · not_found · stale (also: the count changed) · not_allowed
//   changePayingBy({ candidateId, expectedVersion, payingBy })   S   → { version } · withdrawn · no_fee · already_paid
//   resolveDuplicate({ keepId, keepVersion, otherId, otherVersion, keepBoth })   S
//     → { status:'ok', keepVersion, otherVersion }   · invalid · not_found · stale · withdrawn
//     (keep one: the toast's Undo = restoreCandidate on the other, by the same person within 10 s)
//   setPrivate({ candidateId, expectedVersion, privateOn, privateTime:'16:00' })   S
//   clearPrivate({ candidateId, expectedVersion })   S   (Back to the testing day)
//     → { status:'ok', version, expectedFeeCents }   · invalid (time not 8:00 AM–8:00 PM on 15 min) · withdrawn
//   withdrawCandidate({ candidateId, expectedVersion })   A   → { version } · withdrawn
//   restoreCandidate({ candidateId, expectedVersion })   A, or S for their own Keep-this-one within 10 s
//     → { version } · not_allowed ("too late") · stale (not withdrawn, or another active make-up exists)
//   deleteCandidate({ candidateId, expectedVersion, expectedPaymentIds })   A
//     expectedPaymentIds = loadCandidateDetail(…).payments.map((p) => p.id) (every row, reversals too)
//     → { status:'ok' } · stale (version or payments changed)
//   recordPayment({ candidateId, expectedVersion, method:'cash'|'check'|'card', amountCents, paidOn })   S
//     amountCents pre-filled from candidate.expectedFeeCents (1–100 000; staff may type another amount)
//     → { status:'ok', paymentId, version }   · invalid (date in the future / before registration) ·
//       withdrawn · no_fee · already_paid · stale (double click)
//   undoPayment({ paymentId })   S: their own, within 10 s (the toast) · A: any time (asks first, G16)
//     works for a payment (candidate.lastPaymentId) and a refund (Undo refund, its id from the detail)
//     → { status:'ok', version }   · not_allowed (staff, too late) · invalid (a payment while a refund
//       stands: "Undo the refund first.") · stale (already undone)
//   editPayment({ paymentId, method, amountCents, paidOn })   A   → { paymentId (the new one), version }
//     · invalid (while a refund stands, or a bad date) · stale (already undone)
//   recordRefund({ candidateId, expectedVersion, method:'cash'|'check', amountCents, refundedOn })   A (S7)
//     → { status:'ok', paymentId, version }   · { status:'refund_too_large', overpaidCents } · withdrawn
//
// Pure helpers (no database): sortBeltOrder(candidates) · danChangeNeedsAdmin(candidate, isAdmin) ·
// historyPrivacy(historyRow) · starEmailIsValid(text) · trimEmail(text).
import { supabase } from '../supabase.js';
import { schoolToday } from '../testing/eventsApi.js';
import {
  createStarCandidatesApi, STAR_CANDIDATE_STATUSES, sortBeltOrder, danChangeNeedsAdmin, historyPrivacy, starEmailIsValid, trimEmail,
} from './candidatesCore.js';

export { STAR_CANDIDATE_STATUSES, sortBeltOrder, danChangeNeedsAdmin, historyPrivacy, starEmailIsValid, trimEmail };

const api = createStarCandidatesApi(() => supabase, schoolToday);

export const loadCandidates = api.loadCandidates;
export const loadCandidateDetail = api.loadCandidateDetail;
export const loadCandidateHistory = api.loadCandidateHistory;
export const viewSignature = api.viewSignature;
export const loadMakeupList = api.loadMakeupList;
export const addCandidate = api.addCandidate;
export const addMakeup = api.addMakeup;
export const updateCandidate = api.updateCandidate;
export const changePayingBy = api.changePayingBy;
export const resolveDuplicate = api.resolveDuplicate;
export const setPrivate = api.setPrivate;
export const clearPrivate = api.clearPrivate;
export const withdrawCandidate = api.withdrawCandidate;
export const restoreCandidate = api.restoreCandidate;
export const deleteCandidate = api.deleteCandidate;
export const recordPayment = api.recordPayment;
export const undoPayment = api.undoPayment;
export const editPayment = api.editPayment;
export const recordRefund = api.recordRefund;
