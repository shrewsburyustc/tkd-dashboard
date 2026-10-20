// ReceiptDialog.jsx — "Receipt": the preview of a candidate's payment receipt, with
// Print or save as PDF (mockup Candidates 8, rulebook v0.220, contract CONTRACT-0016-B2 §4).
// Why it exists: Jeffrey's choice (status §3b) — Print receipt first shows the page, so staff can
// check it before printing. PC and tablet: a centered dialog "Receipt" / "Alex Kim · Spring 2027"
// with the page at reading size, then Close and Print or save as PDF (primary). Phones: a full
// screen "← Receipt" with the button at the bottom. The browser's print window offers
// "Save as PDF" as a printer, which is how a family gets a PDF.
//
// How Print works (the Finance Daily report pattern): Print draws ReceiptPage into <body>, waits
// one frame so it is on the page, calls window.print(), and removes the page again when the
// browser says printing is over ('afterprint'). receipt.css hides everything else while printing.
//
// The receipt is read fresh from the database each time the dialog opens (loadReceipt), so it
// shows every payment up to now. Nothing is logged (rule S20), and nothing is stored: the
// receipt data lives only while the dialog is open.
//
// Props (fixed by the contract, §4.1):
//   candidateId   the candidate whose receipt this is
//   cycle         the cycle page's CycleDetail (first testing day and prices; see ReceiptPage.jsx)
//   isPhone       true on phones (full screen)
//   onClose       Close / Esc / ← / backdrop
//   showToast     the page's toast function (not needed today; kept for the fixed interface)
//   nested        optional: true when it opens on top of another dialog (the candidate's detail).
//                 Left out, the dialog checks for itself whether another dialog is already open.
//                 On top of another one it uses InnerDialog, which adds no second browser-history
//                 step (two dialogs fighting over one step would close the detail too).
import { useCallback, useEffect, useState } from 'react';
import { IconPrinter } from '@tabler/icons-react';
import Dialog from '../../../components/Dialog.jsx';
import ErrorBanner from '../../../components/ErrorBanner.jsx';
import Notice from '../../../components/Notice.jsx';
import { loadReceipt } from '../../../lib/blackBelt/api.js';
import { usePaymentsHidden } from '../../../screens/finance/usePaymentsHidden.js';
import InnerDialog from '../parts/InnerDialog.jsx';
import ReceiptPage, { ReceiptSheet } from './ReceiptPage.jsx';
import * as T from './text.js';
import './receipt.css';

// Is a dialog already on screen? (Dialog.jsx and InnerDialog.jsx draw .tdialog boxes or
// .dialog-page pages straight into <body>.)
const anotherDialogOpen = () => typeof document !== 'undefined' && document.querySelector('body > .dialog-backdrop, body > .dialog-page') !== null;

export default function ReceiptDialog({ candidateId, cycle, isPhone, onClose, nested }) {
  // Worked out once, when the dialog opens (before it draws its own box).
  const [onTop] = useState(() => nested ?? anotherDialogOpen());
  const [hidden] = usePaymentsHidden();
  // { phase: 'loading' } · { phase: 'ok', receipt } · { phase: 'failed', status }
  const [load, setLoad] = useState({ phase: 'loading' });
  const [printing, setPrinting] = useState(false);

  // Asks the database for the receipt. `isCurrent` says whether the dialog is still waiting for
  // this answer (it may have closed, or changed candidate, while the answer was on its way).
  const read = useCallback(
    async (isCurrent = () => true) => {
      setLoad({ phase: 'loading' });
      const answer = await loadReceipt({ candidateId });
      if (!isCurrent()) return;
      if (answer.status === 'ok' && answer.receipt) setLoad({ phase: 'ok', receipt: answer.receipt });
      else setLoad({ phase: 'failed', status: answer.status });
    },
    [candidateId],
  );

  // Read on open (not while payments are hidden on this device: then nothing about money loads).
  useEffect(() => {
    if (hidden) return undefined;
    let current = true;
    read(() => current);
    return () => {
      current = false;
    };
  }, [read, hidden]);

  // ----- Print: draw the page, print, remove it again -----
  useEffect(() => {
    if (!printing) return undefined;
    const done = () => setPrinting(false);
    window.addEventListener('afterprint', done);
    const frame = window.requestAnimationFrame(() => window.print()); // wait one frame so the page is drawn
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('afterprint', done);
    };
  }, [printing]);

  const receipt = load.phase === 'ok' ? load.receipt : null;
  const canPrint = Boolean(receipt) && !hidden;
  const sub = receipt ? T.dialogSub(receipt.candidate.firstName, receipt.candidate.lastName, receipt.cycleName) : cycle?.name ?? '';

  const printButton = (
    <button
      type="button"
      className={`btn btn-primary${isPhone ? ' bbr-full' : ''}`}
      aria-disabled={canPrint ? undefined : 'true'}
      onClick={() => {
        if (canPrint && !printing) setPrinting(true);
      }}
    >
      {/* ti-printer = print */}
      <IconPrinter size={16} aria-hidden="true" />
      {T.PRINT}
    </button>
  );

  let body;
  if (hidden) {
    body = <p className="bbr-hidden">{T.HIDDEN}</p>;
  } else if (load.phase === 'loading') {
    // A gray placeholder page while the receipt loads (usually well under a second)
    body = (
      <div className="bbr-sheet bbr-sheet--screen bbr-loading tskeleton" aria-busy="true" aria-label={T.LOADING}>
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <div key={index} className="tskeleton-row" aria-hidden="true">
            <span className="tskeleton-bar" />
          </div>
        ))}
      </div>
    );
  } else if (load.phase === 'failed') {
    body =
      load.status === 'not_found' ? (
        <Notice>{T.NOT_FOUND}</Notice>
      ) : (
        <ErrorBanner text={T.LOAD_FAILED} onRetry={() => read()} />
      );
  } else {
    body = (
      <section className="bbr-preview" aria-label={T.PAGE_LABEL}>
        <ReceiptSheet receipt={receipt} cycle={cycle} screen />
      </section>
    );
  }

  const Frame = onTop ? InnerDialog : Dialog;
  return (
    <>
      <Frame title={T.DIALOG_TITLE} size="medium" fullScreen={isPhone} onRequestClose={onClose}>
        {!isPhone && <p className="tdialog-sub">{sub}</p>}
        {body}
        {isPhone ? (
          !hidden && <div className="bbr-phone-buttons">{printButton}</div>
        ) : (
          <div className="dialog-actions">
            <button type="button" className="btn" data-autofocus onClick={onClose}>
              {T.CLOSE}
            </button>
            {!hidden && printButton}
          </div>
        )}
      </Frame>
      {printing && receipt && <ReceiptPage receipt={receipt} cycle={cycle} />}
    </>
  );
}
