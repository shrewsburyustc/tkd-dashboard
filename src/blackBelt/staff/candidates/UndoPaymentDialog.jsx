// UndoPaymentDialog.jsx — the short "Undo Mia Chen’s $870 card payment?" confirmation (admins; a
// payment, a refund or a returned-check mark — from a payment line's ⋯ in the detail, or a
// payment from the roster row's ⋯, which acts on the candidate's latest payment, v0.963).
// Why it exists: contract CONTRACT-0016-B2 §3.5 and open point OP-B1. The database can't undo an
// undo (a reversal can't be reversed, SQL 15p), and rule 1.4 says an action that can't be undone
// is confirmed first. So it asks once, then shows a toast WITHOUT Undo. A payment's words are
// v0.964 (mockup C, option A): the title names the person, the amount and how; the second line
// "Paid on Mar 20 for payments 1, 2 and 3. It comes off the balance; the history keeps it."
// Undo refund and Undo returned mark keep their own words. All words are in text.js.
// The same small box on every device (Dialog variant 'confirm'); focus starts on Cancel.
import { useId } from 'react';
import Dialog from '../../../components/Dialog.jsx';
import Notice from '../../../components/Notice.jsx';
import * as T from '../text.js';

export default function UndoPaymentDialog({ state, onConfirm, onCancel }) {
  const bodyId = useId();
  const { data, line } = state;
  const name = T.candidateName(data.candidate);
  const cents = Math.abs(line.amountCents);
  let title;
  let body;
  let confirm;
  if (line.kind === 'refund') {
    title = T.UNDO_REFUND_TITLE;
    body = T.undoRefundBody(cents, line.paidOn, name);
    confirm = T.UNDO_REFUND_CONFIRM;
  } else if (line.kind === 'returned') {
    title = T.UNDO_RETURNED_TITLE;
    body = T.undoReturnedBody(state.what, cents);
    confirm = T.UNDO_RETURNED_CONFIRM;
  } else {
    title = T.undoPaymentTitle(name, cents, line.method);
    body = T.undoPaymentBody(line.paidOn, T.forSentence(line.forItems, { paymentsCount: data.candidate.plan?.paymentsCount ?? null }));
    confirm = T.UNDO_PAYMENT_CONFIRM;
  }
  const off = state.saving || state.blocking;
  return (
    <Dialog title={title} variant="confirm" describedBy={bodyId} onRequestClose={onCancel}>
      <p id={bodyId} className="tdialog-sub tdialog-body">
        {body}
      </p>
      <div className="dialog-actions">
        <button type="button" className="btn" data-autofocus onClick={onCancel}>
          {T.CANCEL}
        </button>
        <button type="button" className={`btn btn-primary${off ? ' is-unavailable' : ''}`} aria-disabled={off ? 'true' : undefined} onClick={() => !off && onConfirm()}>
          {state.saving ? T.SAVING : confirm}
        </button>
      </div>
      {(state.note || state.failed) && (
        <div className="tdialog-note">
          <Notice>{state.failed ? T.SAVE_FAILED : state.note}</Notice>
        </div>
      )}
    </Dialog>
  );
}
