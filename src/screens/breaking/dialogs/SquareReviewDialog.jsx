// SquareReviewDialog.jsx — "Square payments to review" (admins): the Square payments that did not mark anyone paid.
// Why it exists: when Square tells the dashboard "a card payment completed" (migration 0051's brk_square_payment),
// most payments mark their student paid by themselves. Three kinds don't, and an admin must look: the amount was
// different from the student's price, no student matched the payment, or it arrived for the other school (a Worcester
// payment can never mark a Shrewsbury student paid). The event page shows an amber box "N Square payments need a look"
// with Review (picture "Event roster"); Review opens this list. Each payment says its amount, when it arrived and
// what went wrong, with the plain instruction to check it in Square. Dismiss (brk_dismiss_square_event) says "I dealt
// with it": the row leaves the list and the event page's count goes down; when the last one goes the box closes.
// Nothing here moves money: the dashboard never marks a mismatched payment paid by itself.
//
// Props: items (the roster's needsLook: [{ squareEventId, receivedAt, outcome, amountCents, orderId }]), isPhone,
//   onClose(), onDismissed() (after each one, the page reloads), onNoAccess(), onRefreshProfile(), showToast / clearToast.
import { useState } from 'react';
import Dialog from '../../../components/Dialog.jsx';
import Notice from '../../../components/Notice.jsx';
import { dismissSquareEvent } from '../../../lib/breaking/breakingApi.js';
import * as T from '../../../lib/breaking/text/dialogs.js';
import { formatMoney } from '../../../lib/money.js';
import '../../../styles/breaking-dialogs.css';

// "Nov 12, 3:12 PM" in Massachusetts time (the school's), whatever this computer's clock zone is.
const WHEN = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
function whenText(iso) {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '' : WHEN.format(new Date(t));
}

export default function SquareReviewDialog({ items, isPhone = false, onClose, onDismissed, onNoAccess, onRefreshProfile }) {
  const [rows, setRows] = useState(items);
  const [busyId, setBusyId] = useState(null); // the one being dismissed
  const [note, setNote] = useState(null);

  async function dismiss(row) {
    if (busyId) return;
    setBusyId(row.squareEventId);
    setNote(null);
    const result = await dismissSquareEvent(row.squareEventId);
    setBusyId(null);
    if (result.status === 'ok' || result.status === 'not_found') {
      // (not_found: someone dismissed it already: it is gone from the list either way)
      const left = rows.filter((r) => r.squareEventId !== row.squareEventId);
      setRows(left);
      onDismissed?.();
      if (left.length === 0) onClose();
      return;
    }
    if (result.status === 'no_access') {
      onNoAccess?.();
      return;
    }
    if (result.status === 'not_allowed') {
      onRefreshProfile?.();
      setNote(T.NOT_ADMIN);
      return;
    }
    setNote(T.DISMISS_FAILED);
  }

  return (
    <Dialog title={T.SQUARE_TITLE} size="detail" fullScreen={isPhone} onRequestClose={() => !busyId && onClose()} busy={Boolean(busyId)}>
      <p className="tdialog-sub">{T.SQUARE_SUB}</p>
      {rows.length === 0 ? (
        <p className="brk-history-note">{T.SQUARE_NONE}</p>
      ) : (
        <ul className="brk-sq-list" aria-label={T.SQUARE_TITLE}>
          {rows.map((row, index) => (
            <li key={row.squareEventId} className="brk-sq-item">
              <span className="brk-sq-main">
                <span className="brk-sq-amount">{formatMoney(row.amountCents)}</span>
                <span>{T.outcomeWords(row)}</span>
                <span className="brk-sq-meta">{T.receivedAt(whenText(row.receivedAt))}</span>
              </span>
              <button type="button" className={`btn btn-sm${busyId ? ' is-unavailable' : ''}`} aria-disabled={busyId ? 'true' : undefined} aria-label={T.dismissAria(row.amountCents)}
                data-autofocus={index === 0 ? true : undefined} onClick={() => dismiss(row)}>
                {busyId === row.squareEventId ? T.DISMISSING : T.DISMISS}
              </button>
            </li>
          ))}
        </ul>
      )}
      {note && (
        <div className="tdialog-note">
          <Notice>{note}</Notice>
        </div>
      )}
      {!isPhone && (
        <div className="dialog-actions">
          <button type="button" className="btn" data-autofocus={rows.length === 0 ? true : undefined} onClick={() => !busyId && onClose()}>
            {T.CLOSE}
          </button>
        </div>
      )}
    </Dialog>
  );
}
