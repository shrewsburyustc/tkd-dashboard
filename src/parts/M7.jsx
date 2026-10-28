// M7.jsx — the parts page's samples of the shared history line (components/HistoryLine.jsx; mockup
// M7, rulebook v1.108).
// Why it exists: the parts page (plan §4) shows every state with fake people (no database). Each
// state opens a sample person's summary (as the mockup draws it: a Color Belt student) whose last
// line is the shared one. The section's reader is a sample: it answers at once, never (loading),
// with nothing (empty) or fails (Retry reads again, then fails again).
import { useState } from 'react';
import { IconEdit } from '@tabler/icons-react';
import Dialog from '../components/Dialog.jsx';
import HistoryLine from '../components/HistoryLine.jsx';
import { HIDDEN_ON_THIS_TABLET } from '../lib/privateDetails.js';
import { PHONE_QUERY, useMediaQuery } from '../lib/useMediaQuery.js';
import { failAfter, never, pressLikeMouse, resolveAfter, useLater } from './act.js';

// The section's history rows (any shape: only its describe() reads them)
const ROWS = [
  { id: 1, kind: 'registered', at: '2026-10-13T22:05:00Z', who: 'Family form' },
  { id: 2, kind: 'payment', at: '2026-10-19T15:00:00Z', who: 'Staff', text: 'Payment recorded: $65 cash' },
  { id: 3, kind: 'payment', at: '2026-10-22T16:05:00Z', who: 'Jeffrey Berg', text: 'Payment changed: $65 cash → $65 check' },
];

// The section's words for one row; money rows are left out while private details are hidden.
function describe(row, { hidden }) {
  if (row.kind === 'payment') return hidden ? { hiddenPayment: true } : { text: row.text, at: row.at, who: row.who };
  return { text: 'Registered on the family form', at: row.at, who: row.who };
}

const READERS = {
  ready: () => resolveAfter(ROWS, 50),
  empty: () => resolveAfter([], 50),
  never,
  failed: () => failAfter(300),
};

// A sample person's summary with the history line at its end.
function SampleSummary({ read = 'ready', hidden = false }) {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [open, setOpen] = useState(true);
  const value = (text) => (hidden ? <span className="parts-hidden">{HIDDEN_ON_THIS_TABLET}</span> : text);
  const summary = (
    <>
      <dl className="parts-sum">
        <div className="ev-sum-row">
          <dt>Class and time</dt>
          <dd>White · 4:00 – 5:00 PM</dd>
        </div>
        <div className="ev-sum-row">
          <dt>Paying by</dt>
          <dd>{value('Cash')}</dd>
        </div>
        <div className="ev-sum-row">
          <dt>Payment</dt>
          <dd>
            {value(
              <>
                <span className="ttag ttag--ok">Paid</span> · $65 check · paid Oct 19
              </>,
            )}
          </dd>
        </div>
        <div className="ev-sum-row">
          <dt>Signed by</dt>
          <dd>Parent or guardian, on the form</dd>
        </div>
      </dl>
      <HistoryLine load={READERS[read]} describe={describe} hidden={hidden} />
    </>
  );
  return (
    <>
      {!open && (
        <p className="parts-note">
          <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
            Open the summary again
          </button>
        </p>
      )}
      {open && (
        <Dialog title="Owen Reed" size="detail" fullScreen={isPhone} onRequestClose={() => setOpen(false)}>
          <p className="tdialog-sub">November Children Testing</p>
          {summary}
          {!isPhone && (
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={() => setOpen(false)}>
                Close
              </button>
              <button type="button" className="btn btn-primary">
                <IconEdit size={16} aria-hidden="true" />
                Edit details
              </button>
            </div>
          )}
        </Dialog>
      )}
    </>
  );
}

// "Closed": the line with the keyboard's focus ring (the mockup shows how it looks focused)
function ClosedState() {
  useLater(() => document.querySelector('.hist-btn')?.focus(), 400);
  return <SampleSummary />;
}

// "Open" / "Hide private details on": the line tapped
function OpenState({ hidden = false }) {
  useLater(() => pressLikeMouse(document.querySelector('.hist-btn')), 400);
  return <SampleSummary hidden={hidden} />;
}

export const PART = {
  id: 'M7',
  title: 'The history line',
  file: 'HistoryLine.jsx',
  states: [
    { id: 'closed', title: 'Closed, as the summary opens', dialog: true, render: () => <ClosedState /> },
    { id: 'open', title: 'Open', dialog: true, render: () => <OpenState /> },
    { id: 'hidden', title: 'Hide private details on', dialog: true, render: () => <OpenState hidden /> },
    { id: 'loading', title: 'While it reads', dialog: true, render: () => <SampleSummary read="never" /> },
    { id: 'failed', title: "If it can't read", dialog: true, render: () => <SampleSummary read="failed" /> },
    { id: 'empty', title: 'Nothing recorded yet', dialog: true, render: () => <SampleSummary read="empty" /> },
  ],
};
