// UndoPaymentDialog.jsx — the short "Undo payment 2?" confirmation (admins; a payment, a refund or
// a returned-check mark, from its line's ⋯ in the detail).
// Why it exists: contract CONTRACT-0016-B2 §3.5 and open point OP-B1. The mockup drew Undo payment
// with no dialog and an Undo in its toast, but the database can't undo an undo (a reversal can't
// be reversed, SQL 15p), and rule 1.4 says an action that can't be undone is confirmed first. So
// the working default asks once — "$290 check from Mar 27 comes off Alex Kim's balance. The
// history keeps it." — then shows a toast WITHOUT Undo. Jeffrey decides at CP2; the words are in
// text.js (undoPayment…) so they are easy to change.
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
    title = T.undoPaymentTitle(state.what);
    body = T.undoPaymentBody(cents, line.method, line.paidOn, name);
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
