// candidatesText.js — the words for every answer the Star testing candidates data layer can give.
// Why it exists: candidatesApi.js only returns codes ('stale', 'refund_too_large', …). The screens
// need the approved sentences for them: the Candidates and Private mockups (v0.121, v0.153) and the
// phase 3 gap mockups (v0.508, `TKD-StarTesting-Phase3-Gap-Mockups.html`, "Proposals" box) — which
// reuse Color Belt's LIVE wording for the same situations (src/screens/testing/text.js). Keeping the
// sentences next to the data layer lets the Node checks prove every status of every action has words.
// The Candidates screens import it (and keep their own labels, buttons and hints in their own file).
//
// Lines marked "not drawn" are not in any approved mockup: they follow the same pattern, and are
// proposals for the design review.

import { formatMoney } from '../money.js';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
// Money is written with the dashboard's one helper, formatMoney (src/lib/money.js; rulebook v1.026,
// v1.101; Star's switch S10, v0.518): 2000 → "$20", 13050 → "$130.50" — cents only when there are
// some (an admin's Edit payment can set them). `dollars` stays as its other name, so the Candidates
// words that already say dollars(…) keep working.
export const dollars = formatMoney;

// ----- Banners for row actions (G11; Color Belt's live lines) -----
export const ROW_STALE = "Someone else changed this just now. Your change wasn't saved.";
export const ROW_NOT_ALLOWED = "Only an admin can do that. Your change wasn't saved.";
export const ROW_FAILED = "That didn't save. Check the connection, then retry."; // + Retry; the row's tag reads "Not saved"
export const isWithdrawn = (name) => `${name} was withdrawn. An admin can restore them first.`;
export const alreadyPaid = (name) => `${name} is already marked paid.`;
export const UNDO_PAYMENT_TOO_LATE = 'Too late to undo here. Ask an admin to undo the payment.'; // G16
export const UNDO_DUPLICATE_TOO_LATE = 'Too late to undo here. Ask an admin to restore the copy from Removed.';
export const UNDO_REFUND_FIRST = 'Undo the refund first.'; // G1 (also the grayed menu items' reason)
export const NO_FEE = 'Make-ups have no fee, so there’s nothing to pay.'; // not drawn
export const EVENT_FINISHED_ADD = 'This testing has finished, so candidates can’t be added any more.'; // Color Belt's line, for Star

// ----- Dialog notes (under the buttons) -----
export const DIALOG_STALE = "Someone else changed this just now. Your change wasn’t saved. Cancel, then open it again to see the latest.";
export const DIALOG_STALE_PHONE = "Someone else changed this just now. Your change wasn't saved. Discard changes, then open it again to see the latest.";
export const DIALOG_INVALID = "That didn't save. Check the fields and try again.";
export const DIALOG_FAILED = "Couldn't save. Check the connection, then try again."; // G11
export const ALREADY_PAID_DIALOG = 'Already marked paid. Close this and use ⋯ → Edit payment instead.'; // G16
export const DAN_NEEDS_ADMIN = 'Only an admin can change the Dan after a payment is recorded.'; // G2
export const DAN_AT_THE_DESK = 'Change the Dan at the desk.'; // G2/G8, while Hide private details is on
// G1: Record refund — refund_too_large while something is still overpaid (under the Amount field)…
export const refundTooLarge = (overpaidCents) => `Can’t be more than the ${dollars(overpaidCents)} overpaid.`;
// …and when nothing is overpaid any more (someone else refunded first).
export const NOTHING_OVERPAID = 'Nothing is overpaid any more. Someone else changed this just now. Close this to see the latest.';

// ----- The Dan-change confirmation (G2, v0.164) — opened by a grades_exist answer -----
export const changeDanTitle = (name, newDanLabel) => `Change ${name} to ${newDanLabel}?`;
// "The 4 grades entered for 1st Dan subjects will be cleared. 2nd Dan has different subjects. This can’t be undone."
export const changeDanBody = (count, oldDanLabel, newDanLabel) =>
  `The ${plural(count, 'grade', 'grades')} entered for ${oldDanLabel} subjects will be cleared. ${newDanLabel} has different subjects. This can’t be undone.`;
export const clearGradesButton = (count) => `Change Dan and clear ${plural(count, 'grade', 'grades')}`; // red
export const keepDanButton = (oldDanLabel) => `Keep ${oldDanLabel}`;

// ----- The make-up list (G10) -----
export const MAKEUP_LIST_EMPTY = [
  'No one owes a make-up from an earlier Star testing.',
  'Make-ups appear here once an earlier Star testing on the dashboard has results.',
];
export const makeupNoMatch = (search) => `No one matches “${search}”.`;
export const ALREADY_ADDED = 'Already added'; // the row's right side; no banner
export const CANT_ADD_YET = 'Can’t add yet'; // gray, a choice_needed row
// "Fall 2026 · scored below 245. An admin chooses the subjects to retest on Fall 2026’s Grading tab first."
export const choiceNeededLine = (earlierEventName, passMark) =>
  `${earlierEventName} · scored below ${passMark}. An admin chooses the subjects to retest on ${earlierEventName}’s Grading tab first.`;

export const DUPLICATE_NAME = 'That name is already used here. Change it, then save again.'; // PROPOSAL (not expected from a candidate function)

// ----- The payment receipt (S2, DR2-P4, v0.518; candidatesReceipt.js) -----
export const RECEIPT_KIND = 'Star testing · payment receipt';
export const RECEIPT_CANDIDATE = 'Candidate';
export const RECEIPT_EVENT = 'Event';
export const RECEIPT_SCHOOL_LABEL = 'School';
export const RECEIPT_PRIVATE = 'Private testing';
export const RECEIPT_FOR_FEE = 'Testing fee';
export const RECEIPT_FOR_REFUND = 'Refund';

// ----- Toasts -----
export const candidateAddedToast = (name) => `${name} added`; // + Undo (G7)
export const TOAST_CHANGES_SAVED = 'Changes saved';
export const TOAST_PAYMENT_CHANGED = 'Payment changed'; // Edit payment (G16) + Undo, admins (DR G2, v0.517)
export const TOAST_REFUND_RECORDED = 'Refund recorded'; // + Undo (G1)
export const paymentUndoneToast = (name) => `Payment undone for ${name}`; // admin, no Undo (G16)
export const withdrawnToast = (name) => `${name} withdrawn`;
export const restoredToast = (name) => `${name} restored`;
export const duplicateRemovedToast = (name) => `${name}’s extra copy moved to Removed`;
export const TOAST_KEPT_BOTH = 'Kept both registrations';

// The message for an answer, by which action it answered. Returns:
//   null                     for 'ok' (the screen shows its toast) and 'no_access' (the screen locks)
//   { text }                 a banner (row actions) or the note under a dialog's buttons
//   { field, text }          a message under one field (refund Amount)
//   { row, text }            no banner: the row itself changes (the make-up list's "Already added")
//   { confirm, gradeCount }  grades_exist: open the Dan-change confirmation with that number
// action — where the answer came from:
//   row actions (banner): 'mark_paid' (the row's Mark paid, S1, v0.518 — the box has closed, so a
//     failure shows in the row bar with Retry and the row's "Not saved" tag) · 'withdraw' · 'restore' · 'undo_duplicate' (the toast's Undo of Keep this
//     one) · 'undo_payment' (the toast's Undo) · 'admin_undo_payment' · 'undo_refund' · 'duplicate' ·
//     'undo_edit_payment' and 'undo_paying_by' (the toasts' Undo after Edit payment and Change how
//     they'll pay, DR G2 / G3, v0.517)
//   dialogs (note under the buttons): 'add' · 'edit' · 'paying_by' · 'private' · 'record_payment' ·
//     'edit_payment' · 'refund' · 'delete'
//   the make-up list: 'add_makeup'
// options: name (the candidate's name), phone (full-screen dialog, no Cancel), overpaidCents.
export function statusMessage(action, status, { name = '', phone = false, overpaidCents = 0, gradeCount = 0 } = {}) {
  if (status === 'ok' || status === 'no_access') return null;
  const rowAction = ['withdraw', 'restore', 'undo_duplicate', 'undo_payment', 'admin_undo_payment', 'undo_refund', 'duplicate', 'add_makeup', 'undo_edit_payment', 'undo_paying_by', 'mark_paid'].includes(action);
  const stale = rowAction ? { text: ROW_STALE } : { text: phone ? DIALOG_STALE_PHONE : DIALOG_STALE };
  switch (status) {
    case 'stale':
    case 'not_found': // deleted elsewhere: the same as "someone else changed it"
      return stale;
    case 'not_allowed':
      if (action === 'undo_payment') return { text: UNDO_PAYMENT_TOO_LATE };
      if (action === 'undo_duplicate') return { text: UNDO_DUPLICATE_TOO_LATE };
      if (action === 'edit') return { text: DAN_NEEDS_ADMIN };
      return { text: ROW_NOT_ALLOWED };
    case 'withdrawn':
      return { text: isWithdrawn(name) };
    case 'already_paid':
      if (action === 'paying_by') return { text: ALREADY_PAID_DIALOG };
      return { text: alreadyPaid(name) };
    case 'no_fee':
      return { text: NO_FEE };
    case 'finished':
      return { text: EVENT_FINISHED_ADD };
    case 'already_added':
      return { row: 'already_added', text: ALREADY_ADDED };
    case 'choice_needed':
      return { row: 'choice_needed', text: CANT_ADD_YET };
    case 'grades_exist':
      return { confirm: true, gradeCount };
    case 'duplicate_name':
      return { text: DUPLICATE_NAME };
    case 'refund_too_large':
      return overpaidCents > 0 ? { field: 'amount', text: refundTooLarge(overpaidCents) } : { text: NOTHING_OVERPAID };
    case 'invalid':
      // Undo payment while a refund stands is refused as 'invalid' (contract §6.4). (Edit payment
      // can also be refused for its date, so its dialog keeps the general line; the ⋯ item is
      // grayed with UNDO_REFUND_FIRST while a refund stands — roster refundedCents > 0.)
      if (action === 'undo_payment' || action === 'admin_undo_payment') return { text: UNDO_REFUND_FIRST };
      if (rowAction) return stale; // a row action refused its arguments: the screen sent something odd; reload
      return { text: DIALOG_INVALID };
    default: // 'error' and anything unexpected: the connection
      return rowAction ? { text: ROW_FAILED } : { text: DIALOG_FAILED };
  }
}
