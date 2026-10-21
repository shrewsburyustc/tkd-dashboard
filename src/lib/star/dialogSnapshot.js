// dialogSnapshot.js — what a Candidates dialog remembers when it OPENS, and the save call built from it.
// Why it exists: the Candidates tab re-reads the roster every 15 seconds (v0.507 Q3). If a dialog's
// Save took the candidate's version (or payment id) from that fresh roster, the database could never
// answer "stale": another person's change made while the dialog was open would be overwritten
// without a word (contract 0006 §6.3 — every write names the version it was based on). So, as Color
// Belt does with d.snapshot.version (EventPage.jsx), each dialog keeps a snapshot from the moment it
// opened, and Save sends exactly that:
//   version          the candidate's version when the dialog opened (Edit details: the version of the
//                    detail that was shown, detail.candidate.version)
//   lastPaymentId    the payment Edit payment / Undo payment is about (the one that was on screen)
//   expectedFeeCents the amount Record payment was pre-filled with (never worked out here — the
//                    database's number, v0.167)
// A pure module (no React, no database), so candidatesChecks.mjs can run it in Node.

// The snapshot of one roster row (or of the detail's candidate object, which has the same names).
export function takeSnapshot(candidate) {
  return {
    candidateId: candidate.id,
    version: candidate.version,
    lastPaymentId: candidate.lastPaymentId ?? null,
    expectedFeeCents: candidate.expectedFeeCents ?? null,
  };
}

// The arguments for each dialog's Save. `payload` is what the form checked (names, amounts, dates…).
//   'edit'        updateCandidate        'payingBy'     changePayingBy
//   'record'      recordPayment          'refund'       recordRefund
//   'private'     setPrivate             'editPayment'  editPayment (by payment id)
//   'undoPayment' undoPayment (by payment id)
export function writeArgs(type, snap, payload = {}) {
  switch (type) {
    case 'edit':
      return {
        candidateId: snap.candidateId,
        expectedVersion: snap.version,
        firstName: payload.firstName,
        lastName: payload.lastName,
        dateOfBirth: payload.dateOfBirth,
        email: payload.email,
        locationCode: payload.locationCode,
        dan: payload.dan,
        starsFrom: payload.starsFrom,
        clearGradeCount: payload.clearGradeCount ?? null,
      };
    case 'payingBy':
      return { candidateId: snap.candidateId, expectedVersion: snap.version, payingBy: payload.payingBy };
    case 'record':
      return { candidateId: snap.candidateId, expectedVersion: snap.version, method: payload.method, amountCents: payload.amountCents, paidOn: payload.paidOn };
    case 'refund':
      return { candidateId: snap.candidateId, expectedVersion: snap.version, method: payload.method, amountCents: payload.amountCents, refundedOn: payload.paidOn };
    case 'private':
      return { candidateId: snap.candidateId, expectedVersion: snap.version, privateOn: payload.privateOn, privateTime: payload.privateTime };
    case 'editPayment':
      return { paymentId: snap.lastPaymentId, method: payload.method, amountCents: payload.amountCents, paidOn: payload.paidOn };
    case 'undoPayment':
      return { paymentId: snap.lastPaymentId };
    default:
      throw new Error(`writeArgs: unknown dialog type ${type}`);
  }
}
