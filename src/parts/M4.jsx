// M4.jsx — the parts page's samples of the shared receipt (components/Receipt.jsx; mockup M4,
// rulebook v1.105).
// Why it exists: the parts page (plan §4) shows every state with fake people (no database): the
// section's plain receipt is sample data here; "while it loads" is a read that never finishes and
// "if it can't load" one that fails (Retry reads again, then fails again). "The printed page" draws
// the printed copy into the page (ReceiptPrint): it shows only when printing — print this page, or
// let the picture tool pretend to print (shoot-parts.mjs).
import { useEffect, useState } from 'react';
import ReceiptDialog, { ReceiptPrint } from '../components/Receipt.jsx';
import { PHONE_QUERY, useMediaQuery } from '../lib/useMediaQuery.js';

const SCHOOLS = [
  { name: 'Worcester', street: '1141 Main St', phone: '(508) 767-1717' },
  { name: 'Shrewsbury', street: '370 Boston Turnpike', phone: '(508) 792-5534' },
];

// Color Belt, paid in full (as picture 03b drew it)
const PAID = {
  kindLine: 'Color belt testing · payment receipt',
  facts: [
    ['Student', 'Ava Chen · LT White → LT Yellow'],
    ['Event', 'November Children Testing · Fri, Nov 20, 2026'],
    ['School', 'Worcester'],
  ],
  lines: [{ date: '2026-10-22', forText: 'Testing fee (early price)', how: 'cash', amountCents: 5000 }],
  totalDueCents: 5000,
  paidCents: 5000,
  balanceNote: null,
  schools: SCHOOLS,
  printedOn: '2026-10-22',
  printedByName: 'Jeffrey Berg',
};

// Black Belt: several payments, a refund and a balance
const BALANCE = {
  kindLine: 'Black Belt testing · payment receipt',
  facts: [
    ['Candidate', 'Alex Kim · 1st Dan'],
    ['Cycle', 'Spring 2027 · first testing day Sat, Apr 3, 2027'],
    ['Reference', 'BB-5007'],
    ['School', 'Shrewsbury'],
    ['Plan', '3 payments of $290 + Kukkiwon certificate ($100, with payment 1)'],
  ],
  lines: [
    { date: '2027-03-27', forText: 'Payment 1 + Kukkiwon certificate', how: 'card', amountCents: 39000 },
    { date: '2027-04-24', forText: 'Payment 2', how: 'check', amountCents: 29000 },
    { date: '2027-04-26', forText: 'Refund', how: 'cash', amountCents: -5000 },
  ],
  totalDueCents: 97000,
  paidCents: 63000,
  balanceNote: 'next due May 29',
  schools: SCHOOLS,
  printedOn: '2027-04-26',
  printedByName: 'Jeffrey Berg',
};

// A sample section: it "reads" the receipt — at once (ready), never (loading) or failing.
function SampleReceipt({ sub, receipt = null, read = 'ready', hidden = false }) {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [open, setOpen] = useState(true);
  const [state, setState] = useState(read === 'failed' ? { loadError: true } : { receipt: read === 'ready' ? receipt : null });
  return (
    <>
      {!open && (
        <p className="parts-note">
          <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
            Open the receipt again
          </button>
        </p>
      )}
      {open && (
        <ReceiptDialog
          receipt={state.receipt ?? null}
          sub={sub}
          loadError={Boolean(state.loadError)}
          onRetry={() => {
            setState({});
            window.setTimeout(() => setState({ loadError: true }), 600);
          }}
          hidden={hidden}
          onClose={() => setOpen(false)}
          isPhone={isPhone}
        />
      )}
    </>
  );
}

// The printed page: the printed copy, drawn into <body> (it shows only when printing). The page
// gets a class, and the picture tool sets a flag on <html> while it pretends to print, so that
// picture gets the paper's margins (parts.css); a real Ctrl+P uses the receipt's own @page margins.
function PaperState() {
  useEffect(() => {
    document.body.classList.add('parts-paper');
    return () => document.body.classList.remove('parts-paper');
  }, []);
  return (
    <>
      <p className="parts-note">
        This state is the printed page. It shows only when printing: press Ctrl+P (or <button type="button" className="link-button" onClick={() => window.print()}>print this page</button>
        ) — the picture tool pretends to print.
      </p>
      <ReceiptPrint receipt={PAID} />
    </>
  );
}

export const PART = {
  id: 'M4',
  title: 'Print receipt',
  file: 'Receipt.jsx (ReceiptDialog, ReceiptSheet, ReceiptPrint)',
  states: [
    { id: 'paid', title: 'Paid in full', dialog: true, render: () => <SampleReceipt sub="Ava Chen · November Children Testing" receipt={PAID} /> },
    { id: 'balance', title: 'Several payments, a refund and a balance', dialog: true, render: () => <SampleReceipt sub="Alex Kim · Spring 2027" receipt={BALANCE} /> },
    { id: 'loading', title: 'While it loads', dialog: true, render: () => <SampleReceipt sub="Leo Kim · April Vacation Camp" read="never" /> },
    { id: 'failed', title: "If it can't load", dialog: true, render: () => <SampleReceipt sub="Leo Kim · April Vacation Camp" read="failed" /> },
    { id: 'hidden', title: 'Hide private details on', dialog: true, render: () => <SampleReceipt sub="Ava Chen · November Children Testing" receipt={PAID} hidden /> },
    { id: 'paper', title: 'The printed page', print: true, render: () => <PaperState /> },
  ],
};
