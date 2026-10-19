// CancelPrivateDialog.jsx — "Cancel Emma Ross’s private testing?" (mockup P7, contract 0014 §5.4).
// Why it exists: a family can call off a private testing. Cancelling keeps the record (it moves
// to Past, grayed, with "Cancelled Nov 28") and keeps every payment — nothing is refunded or
// deleted, so the button is blue, not red. An admin can restore it while its day is still ahead.
// The same small confirm box on every device (Dialog variant 'confirm'): Keep it / Cancel private
// testing. Focus starts on "Keep it", so Enter never cancels by accident.
import Dialog from '../../../components/Dialog.jsx';
import Notice from '../../../components/Notice.jsx';
import * as T from '../text.js';

// props: name, body (T.cancelBody(...)), saving, failed (the last try didn't reach the database),
// onConfirm, onCancel
export default function CancelPrivateDialog({ name, body, saving, failed, onConfirm, onCancel }) {
  return (
    <Dialog title={T.cancelTitle(name)} variant="confirm" describedBy="cancel-private-body" onRequestClose={() => !saving && onCancel()}>
      <p id="cancel-private-body" className="tdialog-sub tdialog-body">
        {body}
      </p>
      <div className="dialog-actions">
        <button type="button" className="btn" data-autofocus disabled={saving} onClick={onCancel}>
          {T.KEEP_IT}
        </button>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={onConfirm}>
          {saving ? T.SAVING : T.CANCEL_PRIVATE}
        </button>
      </div>
      {failed && (
        <div className="tdialog-note">
          <Notice>{T.actionFailed}</Notice>
        </div>
      )}
    </Dialog>
  );
}
