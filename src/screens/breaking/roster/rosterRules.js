// rosterRules.js — small pure helpers the event page uses to decide what a student's ⋯ menu may offer.
// Why it exists: "which payment would Undo payment undo?", "is a refund standing?" and "is there money to refund?"
// are the same questions for the menu, the confirm box and the Undo, so they are answered once, here, with no
// browser in it. They read the payment rows the roster sends (breakingApi.loadRoster: kind 'payment' | 'refund' |
// 'reversal', a reversal names the row it undoes in reversesPaymentId). The database decides for real; this only
// decides what to show.
import { UNDO_WINDOW_MS, owedCents, paidCents } from '../../../lib/breaking/breakingRules.js';

// A row is "standing" when no reversal undoes it.
const isUndone = (payments, id) => payments.some((p) => p.reversesPaymentId === id);

// The latest payment that is still standing (Undo payment / Edit payment work on it), or null.
export function standingPayment(row) {
  const payments = row.payments ?? [];
  const live = payments.filter((p) => p.kind === 'payment' && !isUndone(payments, p.id));
  return live.length === 0 ? null : live[live.length - 1];
}

// The refunds that still stand (Undo refund works on the latest one), or [].
export function standingRefunds(row) {
  const payments = row.payments ?? [];
  return payments.filter((p) => p.kind === 'refund' && !isUndone(payments, p.id));
}

// What was paid over what is owed (Record refund can give back at most this), in cents; 0 = nothing to refund.
export const overpaidCents = (row) => Math.max(0, paidCents(row) - owedCents(row));

// May this person undo this payment? Admins any time; staff only a payment recorded in the last 10 seconds
// (the database checks that it was theirs, too).
export function canUndoPayment(payment, isAdmin, nowMs = Date.now()) {
  if (!payment) return false;
  if (isAdmin) return true;
  const age = nowMs - Date.parse(payment.recordedAt);
  return age >= 0 && age < UNDO_WINDOW_MS;
}
