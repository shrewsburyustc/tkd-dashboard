// DeleteConfirm.jsx — "Delete Alex Kim permanently?" (admins only): the one question before a
// candidate is deleted for good.
// Why it exists: contract CONTRACT-0016-B2 §3.9 and rulebook v1.007 ("red means gone for good":
// Delete permanently is red and asks first). Delete permanently is its own item in the row's ⋯ and
// the detail's ⋯ (v0.963) — the old "Remove candidate" choice box (Withdraw / Delete permanently)
// is gone, and Withdraw acts at once with its Undo toast. The words:
//   "Delete Alex Kim permanently? Their registration and signed waiver are deleted from Spring
//   2027. This can't be undone."  Keep candidate · Delete permanently (red)
// The item is grayed (it never opens this) while the candidate has payment records (v0.904 —
// payment records are never deleted) or grades (0025, v0.950); the database checks again.
// The small box on every device (Dialog variant 'confirm'); focus starts on the safe choice.
import { useId } from 'react';
import Dialog from '../../../components/Dialog.jsx';
import Notice from '../../../components/Notice.jsx';
import { ICONS } from './icons.js';
import * as T from '../text.js';

export default function DeleteConfirm({ state, cycle, onConfirm, onCancel }) {
  const bodyId = useId();
  const name = T.candidateName(state.target);
  const off = state.saving || state.blocking;
  const Trash = ICONS.deleteForever;
  return (
    <Dialog title={T.deleteTitle(name)} variant="confirm" describedBy={bodyId} onRequestClose={onCancel}>
      <p id={bodyId} className="tdialog-sub tdialog-body">
        {T.deleteBody(cycle.name)}
      </p>
      <div className="dialog-actions">
        <button type="button" className="btn" data-autofocus onClick={onCancel}>
          {T.KEEP_CANDIDATE}
        </button>
        <button type="button" className={`btn btn-delete${off ? ' is-unavailable' : ''}`} aria-disabled={off ? 'true' : undefined} onClick={() => !off && onConfirm()}>
          <Trash size={16} aria-hidden="true" />
          {state.saving ? T.SAVING : T.DELETE_PERMANENTLY}
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
