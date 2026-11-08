// buildReceipt.js — a Black Belt candidate's payment receipt, as the plain list the shared receipt
// draws (src/components/Receipt.jsx; design review BB2, rulebook v1.002 / v1.105).
// Why it exists: Black Belt used to draw its own receipt page (ReceiptPage.jsx, receipt.css).
// Now the shared receipt draws the box and the printed page, and this file only works out WHAT it
// says from what the database sends (loadReceipt's Receipt) and the cycle's prices:
//   - the facts: Candidate and Dan · Cycle and first testing day · Reference · School · Plan
//     (a Kukkiwon fee added after payment 1's date reads "added Apr 26", not "with payment 1");
//   - one table line per live payment, refund and returned check, oldest first, as the database
//     sends them (a refund is its own "Refund" line with a minus; a returned check says which
//     payment bounced and shows "—" for how paid, because no money changed hands that day);
//   - Total due, Paid to date, and the word after a balance owed ("next due May 29", or "overdue").
// NEVER on it (privacy, rulebook §5): date of birth, email, notes, reasons for a change, who
// recorded a payment, the signature, links — the data from the database doesn't carry them either
// (bb_receipt), so they can't slip in by accident.
// It is PURE (no React, no database), so checks.mjs can check it with plain Node.
import { pairReturnedLines } from '../../../lib/blackBelt/rules.js';
import { monthDay } from '../text.js';
import * as T from './text.js';

// receipt   loadReceipt's Receipt (status 'ok')
// cycle     the cycle page's CycleDetail (the first testing day and the prices come from there,
//           because the receipt data has neither — contract §7.3)
// kukkiwonAddedOn, registeredOn   optional 'YYYY-MM-DD' (see above)
// → the plain receipt (Receipt.jsx's shape)
export function buildBlackBeltReceipt(receipt, cycle, { kukkiwonAddedOn = null, registeredOn = null } = {}) {
  const { candidate, money } = receipt;
  const dan = candidate.dan;
  // The candidate's plan in the cycle's price list (plan names are unique within a cycle).
  const plan = (cycle?.plans ?? []).find((p) => p.name === receipt.planName) ?? null;
  const planInfo = { planName: receipt.planName, paymentsCount: plan?.paymentsCount ?? null };
  const school = receipt.schools.find((s) => s.code === candidate.locationCode);
  // Payment 1's date for THIS candidate: the plan's date, or the day they registered when that
  // was later (a late family, S4). A Kukkiwon fee chosen after it was due that day, on its own.
  const p1Plan = (plan?.payments ?? []).find((p) => (p.paymentNo ?? p.payment_no) === 1);
  const p1On = p1Plan ? [p1Plan.dueOn ?? p1Plan.due_on, registeredOn].filter(Boolean).sort().pop() : null;
  const kukkiwonAddedLate = Boolean(receipt.kukkiwon && kukkiwonAddedOn && p1On && kukkiwonAddedOn > p1On);

  // A returned check's line has no link to the check it marks (bb_receipt sends no row ids), so
  // rules.js pairs each one with the matching crossed-out check to name its item (contract §1.4).
  const returnedFor = pairReturnedLines(receipt.lines);
  const lines = receipt.lines.map((line, index) => {
    let forText;
    let how = line.method;
    if (line.kind === 'refund') {
      forText = T.REFUND;
    } else if (line.kind === 'returned') {
      forText = T.returnedText(T.itemsText(returnedFor[index], planInfo));
      how = T.NO_METHOD;
    } else {
      forText = T.itemsText(line.forItems, planInfo); // a returned check's own line prints normally
    }
    return { date: line.paidOn, forText, how, amountCents: line.amountCents };
  });

  return {
    kindLine: T.KIND_LINE,
    facts: [
      [T.LABEL_CANDIDATE, T.candidateLine(candidate.firstName, candidate.lastName, dan)],
      [T.LABEL_CYCLE, T.cycleLine(receipt.cycleName, cycle?.state?.firstDay ?? null)],
      [T.LABEL_REFERENCE, candidate.reference],
      [T.LABEL_SCHOOL, school?.name ?? ''],
      [
        T.LABEL_PLAN,
        T.planLine({
          planName: receipt.planName,
          amounts: plan?.amounts?.[dan] ?? null,
          kukkiwon: receipt.kukkiwon,
          kukkiwonCents: cycle?.kukkiwon?.[dan] ?? null,
          kukkiwonAddedOn: kukkiwonAddedLate ? kukkiwonAddedOn : null,
        }),
      ],
    ],
    lines,
    totalDueCents: money.totalDueCents,
    paidCents: money.paidCents,
    // after a balance owed: when the next payment is due, or "overdue" (late or not paid — the
    // receipt has no "since" date, contract §7.3); paid in full / overpaid are the shared words
    balanceNote: money.nextOn ? T.nextDueNote(monthDay(money.nextOn)) : T.OVERDUE_NOTE,
    schools: receipt.schools.map((s) => ({ name: s.name, street: s.address?.street ?? '', phone: s.phone ?? '' })),
    printedOn: receipt.printedOn,
    printedByName: typeof receipt.printedByName === 'string' && receipt.printedByName.trim() !== '' ? receipt.printedByName.trim() : null,
  };
}
