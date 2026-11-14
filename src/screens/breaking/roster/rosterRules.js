// rosterRules.js — small pure helpers the event page uses to decide what a student's ⋯ menu may offer.
// Why it exists: "which payment would Undo payment undo?", "is a refund standing?" and "is there money to refund?"
// are the same questions for the menu, the confirm box and the Undo, so they are answered once, here, with no
// browser in it. They read the payment rows the roster sends (breakingApi.loadRoster: kind 'payment' | 'refund' |
// 'reversal', a reversal names the row it undoes in reversesPaymentId). The database decides for real; this only
// decides what to show.
import { UNDO_WINDOW_MS, owedCents, paidCents } from '../../../lib/breaking/breakingRules.js';

// The narrowest room beside the left panel (px) in which the roster keeps its tablet COLUMNS (Color belt testing's ROSTER_ROOM idea, rulebook
// v0.431: lib/testing/eventRules.js; "room" = lib/pageRoom.js's measure, the page area's width with its side margins). The tablet
// grid has fixed columns that add up to 502 px (two board columns 56, Payment 130, Broke 72, the buttons 148, five 8 px gaps) and the
// page's side margins take about 32, so the Student column gets room - 534: at 680 it keeps 146 px (a name and "High Blue belt"). In a
// narrower room (a window under about 750 px beside the panel) the roster draws the stacked phone rows, as Color belt's does, whatever
// the window's own width. If the columns change, measure again.
export const ROSTER_ROOM = 680;

// ----- Board totals (the two count cards and the class's second line) -----
// The Technical and the Adult boards a set of students will break: each registration's own tech_boards / adult_boards added up, for
// EVERY registration on the roster (paid or not, broke or not: the boards still have to be set out, and a student who already broke
// is still counted). A deleted student is simply not on the roster. The roster is ONE event, so the location switcher ("Both
// schools") never changes these.
export function boardTotals(rows) {
  let tech = 0;
  let adult = 0;
  for (const row of rows ?? []) {
    tech += Number.isInteger(row.techBoards) ? row.techBoards : 0;
    adult += Number.isInteger(row.adultBoards) ? row.adultBoards : 0;
  }
  return { tech, adult };
}
// One class's totals (its tab), and the whole event's (every class). A student who moves to another class changes both classes'
// totals and leaves the event's the same.
export const classBoardTotals = (registrations, classId) => boardTotals((registrations ?? []).filter((r) => r.classId === classId));
export const eventBoardTotals = (registrations) => boardTotals(registrations);

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
