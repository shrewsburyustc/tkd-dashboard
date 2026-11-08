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
// Since BB7 (rulebook v1.008 / v1.103) it is the shared confirm box (components/ConfirmBox.jsx):
// "Keep candidate" on the left (first focus), the red "Delete permanently" on the right; while it
// works the red button says "Deleting…", both gray, and Esc, a click outside and Back wait. A
// refusal (payment records, grades, a changed candidate) grays the red button and says why under
// the buttons. The same small box on every device.
import ConfirmBox from '../../../components/ConfirmBox.jsx';
import { ICONS } from './icons.js';
import * as T from '../text.js';

export default function DeleteConfirm({ state, cycle, onConfirm, onCancel }) {
  return (
    <ConfirmBox
      title={T.deleteTitle(T.candidateName(state.target))}
      keepLabel={T.KEEP_CANDIDATE}
      actionLabel={T.DELETE_PERMANENTLY}
      actionIcon={ICONS.deleteForever}
      busyLabel={T.DELETING}
      loses="forGood"
      busy={state.saving}
      actionUnavailable={state.blocking}
      failed={state.failed ? T.DELETE_FAILED : state.note}
      onKeep={onCancel}
      onConfirm={onConfirm}
    >
      {T.deleteBody(cycle.name)}
    </ConfirmBox>
  );
}
