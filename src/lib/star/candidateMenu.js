// candidateMenu.js — which items a Star candidate row's ⋯ menu shows, and in what order.
// Why it exists: the design review's one menu order (DR G1, rulebook v0.517; decisions 10a and 16a).
// Every candidate ⋯ menu has up to three groups, with a line between them:
//   (1) about the person — Edit details (always first) · the private testing items · Change how
//       they'll pay · Review possible duplicate (only on a row flagged "Possible duplicate")
//   (2) money — Edit payment · Undo payment · Record refund / Undo refund
//       (admins, paid rows, not a make-up, Hide private details off), then Print receipt (staff
//       and admins, a row with a payment, not while hidden; S2, v0.518)
//   (3) taking someone off — Withdraw · Delete permanently (admins)
// Items that don't apply are left out; the rest never move. A withdrawn row has its own short menu
// (Restore · line · Delete permanently, admins only).
// It is plain JavaScript with no React, so candidatesChecks.mjs can check the order without a browser.
// The screen (CandidatesTab.jsx) turns each key into a menu item with its words, icon and action.

// row:      the roster row (status, privateOn, paid, isMakeup, refundedCents, overpaidCents)
// isAdmin:  admin vs staff — only changes what is SHOWN (the database decides who may do what)
// hidden:   Hide private details is on (no money items)
// flagged:  the row is one of a "Possible duplicate" pair still on the list
// canGradePrivate: the page can open the private grading page (phase 5)
// Returns [{ key, separatorBefore }] — empty when there is nothing to show (a staff member on a
// withdrawn row).
// Print receipt's one rule, shared by the ⋯ menu and the summary's Payment part (S2, v0.518): an
// active row (not withdrawn) with a payment or a refund that stands, not a make-up, and never while
// Hide private details is on (Q8 B).
export function canPrintReceipt(row, hidden) {
  return Boolean(row) && row.status !== 'withdrawn' && !hidden && !row.isMakeup && (row.paid || row.refundedCents > 0);
}

export function candidateMenuKeys(row, { isAdmin, hidden, flagged = false, canGradePrivate = false }) {
  const out = [];
  const add = (key, separatorBefore = false) => out.push({ key, separatorBefore });
  if (row.status === 'withdrawn') {
    if (!isAdmin) return out;
    add('restore');
    add('delete', true);
    return out;
  }
  // (1) about the person
  add('edit');
  if (row.privateOn) {
    add('changePrivate');
    add('backToDay');
    if (canGradePrivate) add('gradePrivate');
  } else {
    add('setPrivate');
  }
  const moneyShown = !hidden && !row.isMakeup;
  if (moneyShown && !row.paid) add('payingBy');
  if (flagged) add('reviewDuplicate');
  // (2) money
  if (moneyShown && isAdmin && row.paid) {
    add('editPayment', true);
    add('undoPayment');
    // While a refund stands, Edit payment and Undo payment stay in place but grayed ("Undo the
    // refund first."), and Undo refund takes Record refund's place.
    if (row.refundedCents > 0) add('undoRefund');
    else if (row.overpaidCents > 0) add('recordRefund');
  }
  // Print receipt (S2, DR2-P4, v0.518): staff and admins, any row with a payment (or a refund that
  // stands), last in the money group — for staff it starts the group (it is the only item there).
  if (canPrintReceipt(row, hidden)) add('printReceipt', !(isAdmin && row.paid));
  // (3) taking someone off
  if (isAdmin) {
    add('withdraw', true);
    add('delete');
  }
  return out;
}
