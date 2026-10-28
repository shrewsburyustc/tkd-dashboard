// Receipt.jsx — the shared payment receipt: its preview box and its printed page (design review M4,
// rulebook v1.002 / v1.105).
// Why it exists: Black Belt has a Print receipt (v0.220); v1.002 gives every section the same one.
// This is Black Belt's receipt made shared, filled from a plain list any section can give:
//   - the box "Receipt" with the page at reading size, then Close (the first focus) and
//     "Print or save as PDF" (the one blue button); phones: a full-screen page with ← and the
//     button pinned at the bottom, full width;
//   - the page: the school's name, what kind of receipt, the section's facts, every payment (date,
//     for, how paid, amount — a refund is its own line with a minus), Total due · Paid to date ·
//     Balance, both schools' street and phone, and "Printed [date] by [name]. Fees are
//     non-refundable.";
//   - (a) while the receipt loads, a gray placeholder page; if it can't load, the shared amber bar
//     with Retry — and in both, Print shows in the gray unavailable look (still focusable);
//   - (b) with Hide private details on, one gray line, "Payment details are hidden on this
//     tablet.", and no Print button.
// How Print works (Black Belt's and Finance's pattern): Print draws the page straight into <body>
// (ReceiptPrint, a "portal"), waits one frame so it is there, opens the browser's print window
// (window.print(); "Save as PDF" is one of its printers), and removes the page again when the
// browser says printing is over ('afterprint'). shared.css's print rules hide everything else and
// print it on US Letter, black on white.
// Nothing switches to it in Dashboard core step 1: Color Belt, Star and Camps add Print receipt in
// their own prompts, Black Belt switches in its own (its receipt.css keeps its own copy until then).
//
// The plain receipt (what a section gives; it never holds a date of birth, an email, notes or links):
//   {
//     kindLine,                       'Color belt testing · payment receipt'
//     facts: [[label, value], …],     [['Student', 'Ava Chen · LT White → LT Yellow'], …]
//     lines: [{ date, forText, how, amountCents }, …]   oldest first; date 'YYYY-MM-DD';
//                                     how 'cash' | 'check' | 'card' or the section's own words ('—');
//                                     a negative amount is a refund or a returned check
//     totalDueCents, paidCents,       Balance = total due − paid to date
//     balanceNote,                    the section's word after a balance owed ('next due May 29'), or null
//     schools: [{ name, street, phone }, …],
//     printedOn, printedByName,       'YYYY-MM-DD', 'Jeffrey Berg'
//   }
//
// Exports:
//   ReceiptDialog (default)   the box. Props:
//     receipt      the plain receipt, or null while it loads
//     sub          the gray line under the title ("Ava Chen · November Children Testing"; PC / tablet)
//     loadError    true when it couldn't load (the amber bar with Retry) · onRetry
//     notFound     the section's words when there is no receipt (e.g. the person was deleted), or null
//     hidden       Hide private details is on
//     onClose, isPhone, onTop (true when it opens on top of another dialog, e.g. a person's detail)
//     returnFocusTo  optional, with onTop: the button that opened it, so focus goes back there when
//                    it closes (also in Safari / iPadOS, where a tapped button takes no focus; Dialog.jsx)
//   ReceiptSheet              the page itself ({ receipt, screen }: screen = the preview's look)
//   ReceiptPrint              the printed copy: the page in <body>, shown only when printing
import { Fragment, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconPrinter } from '@tabler/icons-react';
import Dialog from './Dialog.jsx';
import ErrorBanner from './ErrorBanner.jsx';
import Notice from './Notice.jsx';
import { formatMoney } from '../lib/money.js';
import { PAYMENT_DETAILS_HIDDEN } from '../lib/privateDetails.js';
import {
  BALANCE,
  CLOSE,
  OVERPAID,
  PAID_IN_FULL,
  PAID_TO_DATE,
  PAY_METHODS,
  PRINT_RECEIPT,
  RECEIPT,
  RECEIPT_AMOUNT,
  RECEIPT_DATE,
  RECEIPT_FOR,
  RECEIPT_HOW,
  RECEIPT_LOADING,
  RECEIPT_LOAD_FAILED,
  RECEIPT_PAGE_LABEL,
  RECEIPT_SCHOOL,
  TOTAL_DUE,
  receiptPrinted,
} from './text.js';

// A school date 'YYYY-MM-DD' in words, read on this computer's calendar (new Date(year, month - 1,
// day) — never new Date('YYYY-MM-DD'), which reads it in UTC and can show the day before).
// Anything that isn't such a date is shown as it was given.
function schoolDate(iso, withYear) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!match) return iso ?? '';
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString('en-US', withYear ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' });
}

// "Worcester · 1141 Main St · (508) 767-1717" (an empty street or phone is left out)
const schoolLine = (school) => [school.name, school.street, school.phone].filter((part) => typeof part === 'string' && part.trim() !== '').join(' · ');

// "$0 · paid in full" · "−$50 · overpaid" · "$340 · next due May 29" · "$340"
function balanceText(balanceCents, note) {
  const amount = formatMoney(balanceCents);
  if (balanceCents === 0) return `${amount} · ${PAID_IN_FULL}`;
  if (balanceCents < 0) return `${amount} · ${OVERPAID}`;
  return note ? `${amount} · ${note}` : amount;
}

// The page. `screen` = the preview inside the box (reading size, the app's text sizes).
export function ReceiptSheet({ receipt, screen = false }) {
  const balanceCents = (receipt.totalDueCents ?? 0) - (receipt.paidCents ?? 0);
  return (
    <div className={`rcpt-sheet${screen ? ' rcpt-sheet--screen' : ''}`}>
      <p className="rcpt-title">{RECEIPT_SCHOOL}</p>
      <p className="rcpt-subtitle">{receipt.kindLine}</p>

      {/* Label / value pairs: a definition list is the HTML for "name: value" lines */}
      <dl className="rcpt-facts">
        {(receipt.facts ?? []).map(([label, value]) => (
          // A Fragment groups the two without adding an element: the list's grid lines up
          // every label in one column and every value in the next.
          <Fragment key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </Fragment>
        ))}
      </dl>

      {/* No payments yet: the table head alone (the totals below still say what's owed). A long
          history goes on to page 2 with the head repeated (browsers repeat a <thead>). */}
      <table className="rcpt-table">
        <thead>
          <tr>
            <th scope="col">{RECEIPT_DATE}</th>
            <th scope="col">{RECEIPT_FOR}</th>
            <th scope="col">{RECEIPT_HOW}</th>
            <th scope="col" className="rcpt-r">
              {RECEIPT_AMOUNT}
            </th>
          </tr>
        </thead>
        <tbody>
          {(receipt.lines ?? []).map((line, index) => (
            <tr key={index}>
              <td className="rcpt-date">{schoolDate(line.date, false)}</td>
              <td>{line.forText}</td>
              <td>{PAY_METHODS[line.how] ?? line.how}</td>
              <td className="rcpt-r">{formatMoney(line.amountCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="rcpt-totals">
        <div>
          <span>{TOTAL_DUE}</span>
          {formatMoney(receipt.totalDueCents)}
        </div>
        <div>
          <span>{PAID_TO_DATE}</span>
          {formatMoney(receipt.paidCents)}
        </div>
        <div className="rcpt-balance">
          <span>{BALANCE}</span>
          {balanceText(balanceCents, receipt.balanceNote)}
        </div>
      </div>

      <div className="rcpt-foot">
        {(receipt.schools ?? []).map((school) => (
          <p key={school.name}>{schoolLine(school)}</p>
        ))}
        <p>{receiptPrinted(schoolDate(receipt.printedOn, true), receipt.printedByName)}</p>
      </div>
    </div>
  );
}

// The printed copy: the page straight into <body>, shown only when printing (shared.css).
export function ReceiptPrint({ receipt }) {
  return createPortal(
    <div className="rcpt-print">
      <ReceiptSheet receipt={receipt} />
    </div>,
    document.body,
  );
}

export default function ReceiptDialog({ receipt = null, sub = '', loadError = false, onRetry, notFound = null, hidden = false, onClose, isPhone = false, onTop = false, returnFocusTo = null }) {
  const [printing, setPrinting] = useState(false);

  // Print: draw the page, open the print window, remove the page again afterwards.
  useEffect(() => {
    if (!printing) return undefined;
    const done = () => setPrinting(false);
    window.addEventListener('afterprint', done);
    const frame = window.requestAnimationFrame(() => window.print()); // one frame, so the page is there
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('afterprint', done);
    };
  }, [printing]);

  const canPrint = Boolean(receipt) && !hidden && !notFound;
  const printButton = (
    <button
      type="button"
      className={`btn btn-primary${isPhone ? ' rcpt-full' : ''}${canPrint ? '' : ' is-unavailable'}`}
      aria-disabled={canPrint ? undefined : 'true'}
      onClick={() => {
        if (canPrint && !printing) setPrinting(true);
      }}
    >
      {/* ti-printer = print */}
      <IconPrinter size={16} aria-hidden="true" />
      {PRINT_RECEIPT}
    </button>
  );

  let body;
  if (hidden) {
    body = <p className="rcpt-hidden">{PAYMENT_DETAILS_HIDDEN}</p>;
  } else if (notFound) {
    body = <Notice>{notFound}</Notice>;
  } else if (loadError) {
    body = <ErrorBanner text={RECEIPT_LOAD_FAILED} onRetry={onRetry} />;
  } else if (!receipt) {
    // A gray placeholder page while the receipt loads (usually well under a second)
    body = (
      <div className="rcpt-sheet rcpt-sheet--screen rcpt-loading tskeleton" aria-busy="true" aria-label={RECEIPT_LOADING}>
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="tskeleton-row" aria-hidden="true">
            <span className="tskeleton-bar" />
          </div>
        ))}
      </div>
    );
  } else {
    body = (
      <section className="rcpt-preview" aria-label={RECEIPT_PAGE_LABEL}>
        <ReceiptSheet receipt={receipt} screen />
      </section>
    );
  }

  return (
    <>
      <Dialog title={RECEIPT} size="medium" className="rcpt-dialog" fullScreen={isPhone} onTop={onTop} returnFocusTo={returnFocusTo} onRequestClose={onClose}>
        {!isPhone && sub && <p className="tdialog-sub">{sub}</p>}
        {body}
        {isPhone ? (
          !hidden && <div className="rcpt-phone-buttons">{printButton}</div>
        ) : (
          <div className="dialog-actions">
            <button type="button" className="btn" data-autofocus onClick={onClose}>
              {CLOSE}
            </button>
            {!hidden && printButton}
          </div>
        )}
      </Dialog>
      {printing && receipt && <ReceiptPrint receipt={receipt} />}
    </>
  );
}
