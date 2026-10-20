// ReceiptPage.jsx — the Black Belt payment receipt as a page (mockup Candidates 8, rulebook v0.220).
// Why it exists: a family can be handed (or emailed as a PDF) one page with the candidate's whole
// payment history, the totals and the balance. The same page is drawn twice:
//   - ReceiptSheet: the page itself. The preview dialog (ReceiptDialog.jsx) shows it at reading
//     size; the printed copy uses it at US Letter size.
//   - ReceiptPage (the default export): ReceiptSheet put straight into <body> through a "portal"
//     (React drawing outside the app's frame), so the print stylesheet (receipt.css, @media print)
//     can hide everything else and print only this. ReceiptDialog adds it, opens the browser's
//     print window and removes it again afterwards — the same way Finance prints its Daily report.
//
// What it shows (contract CONTRACT-0016-B2 §4.2): the school's name, "Black Belt testing ·
// payment receipt", candidate and Dan, cycle and first testing day, reference, the candidate's
// school, the plan and Kukkiwon, one table line per live payment / refund / returned check
// (oldest first, as the database sends them), the totals, both schools' street and phone, and
// "Printed [date] by [name]. Fees are non-refundable."
// NEVER on it (privacy, rulebook §5): date of birth, email, notes, reasons for a change, who
// recorded a payment, the signature, links. The receipt data from the database doesn't carry them
// either (bb_receipt), so they can't slip in by accident.
//
// A long history continues on page 2 with the table's head repeated: browsers repeat a table's
// <thead> at the top of every printed page.
//
// Props (both components): receipt (api.js loadReceipt's Receipt), cycle (the cycle page's
// CycleDetail: the first testing day and the prices come from there, because the receipt data has
// neither — contract §7.3). ReceiptSheet also takes `screen` (true = the preview look).
import { createPortal } from 'react-dom';
import { pairReturnedLines } from '../../../lib/blackBelt/rules.js';
import { formatCents } from '../../../lib/blackBelt/money.js';
import * as T from './text.js';

// Works out every piece of text the page shows, from the receipt and the cycle. Kept apart from
// the drawing below so the preview and the printed copy can never say different things.
export function receiptView(receipt, cycle) {
  const { candidate, money } = receipt;
  const dan = candidate.dan;
  // The candidate's plan in the cycle's price list (plan names are unique within a cycle).
  const plan = (cycle?.plans ?? []).find((p) => p.name === receipt.planName) ?? null;
  const planInfo = { planName: receipt.planName, paymentsCount: plan?.paymentsCount ?? null };
  const school = receipt.schools.find((s) => s.code === candidate.locationCode);

  // A returned check's line has no link to the check it marks (bb_receipt sends no row ids), so
  // rules.js pairs each one with the matching crossed-out check to name its item (contract §1.4).
  const returnedFor = pairReturnedLines(receipt.lines);

  const rows = receipt.lines.map((line, index) => {
    let forText;
    let how = T.methodLabel(line.method);
    if (line.kind === 'refund') {
      forText = T.REFUND;
    } else if (line.kind === 'returned') {
      forText = T.returnedText(T.itemsText(returnedFor[index], planInfo));
      how = T.NO_METHOD;
    } else {
      forText = T.itemsText(line.forItems, planInfo); // a returned check's own line prints normally
    }
    return {
      key: index,
      date: T.lineDate(line.paidOn),
      forText,
      how,
      amount: formatCents(line.amountCents),
      negative: line.amountCents < 0,
    };
  });

  return {
    candidate: T.candidateLine(candidate.firstName, candidate.lastName, dan),
    cycle: T.cycleLine(receipt.cycleName, cycle?.state?.firstDay ?? null),
    reference: candidate.reference,
    school: school?.name ?? '',
    plan: T.planLine({
      planName: receipt.planName,
      amounts: plan?.amounts?.[dan] ?? null,
      kukkiwon: receipt.kukkiwon,
      kukkiwonCents: cycle?.kukkiwon?.[dan] ?? null,
    }),
    rows,
    totalDue: formatCents(money.totalDueCents),
    paid: formatCents(money.paidCents),
    balance: T.balanceText(money),
    schoolLines: receipt.schools.map((s) => T.schoolLine(s.name, s.address?.street ?? null, s.phone ?? null)),
    printed: T.printedLine(receipt.printedOn, receipt.printedByName),
  };
}

// The page. `screen` = the preview inside the dialog (narrower padding and type, no fixed size).
export function ReceiptSheet({ receipt, cycle, screen = false }) {
  const view = receiptView(receipt, cycle);
  return (
    <div className={`bbr-sheet${screen ? ' bbr-sheet--screen' : ''}`}>
      <p className="bbr-title">{T.SCHOOL_NAME}</p>
      <p className="bbr-subtitle">{T.PAGE_SUBTITLE}</p>

      {/* Label / value pairs: a definition list is the HTML for "name: value" lines */}
      <dl className="bbr-facts">
        <dt>{T.LABEL_CANDIDATE}</dt>
        <dd>{view.candidate}</dd>
        <dt>{T.LABEL_CYCLE}</dt>
        <dd>{view.cycle}</dd>
        <dt>{T.LABEL_REFERENCE}</dt>
        <dd>{view.reference}</dd>
        <dt>{T.LABEL_SCHOOL}</dt>
        <dd>{view.school}</dd>
        <dt>{T.LABEL_PLAN}</dt>
        <dd>{view.plan}</dd>
      </dl>

      {/* No payments yet: the table head alone (the totals below still say what's owed) */}
      <table className="bbr-table">
        <thead>
          <tr>
            <th scope="col">{T.COL_DATE}</th>
            <th scope="col">{T.COL_FOR}</th>
            <th scope="col">{T.COL_HOW}</th>
            <th scope="col" className="bbr-r">
              {T.COL_AMOUNT}
            </th>
          </tr>
        </thead>
        <tbody>
          {view.rows.map((row) => (
            <tr key={row.key} className={row.negative ? 'bbr-neg' : undefined}>
              <td className="bbr-date">{row.date}</td>
              <td>{row.forText}</td>
              <td>{row.how}</td>
              <td className="bbr-r">{row.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="bbr-totals">
        <div>
          <span>{T.TOTAL_DUE}</span>
          {view.totalDue}
        </div>
        <div>
          <span>{T.PAID_TO_DATE}</span>
          {view.paid}
        </div>
        <div className="bbr-balance">
          <span>{T.BALANCE}</span>
          {view.balance}
        </div>
      </div>

      <div className="bbr-foot">
        {view.schoolLines.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <p>{view.printed}</p>
      </div>
    </div>
  );
}

// The printed copy: the page straight into <body>, shown only when printing (receipt.css).
export default function ReceiptPage({ receipt, cycle }) {
  return createPortal(
    <div className="bbr-print">
      <ReceiptSheet receipt={receipt} cycle={cycle} />
    </div>,
    document.body,
  );
}
