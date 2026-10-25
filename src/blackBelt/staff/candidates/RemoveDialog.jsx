// RemoveDialog.jsx — "Remove Alex Kim?" (admins only) and the Delete permanently confirmation.
// Why it exists: contract CONTRACT-0016-B2 §3.9, approved "Remove = Star's Withdraw / Delete
// permanently" (Star v0.113). Two choices:
//   Withdraw            "Kept under Removed, with their payments; can be restored." — at once,
//                       toast "Alex Kim withdrawn · Undo"
//   Delete permanently  red; grayed while the candidate has payment records ("… can't be deleted.
//                       Withdraw them instead.", v0.904 — payment records are never deleted)
//                       and, since migration 0025, while they have grades ("Alex Kim has grades,
//                       so they can't be deleted. Withdraw them instead.", Q-G3 v0.950);
//                       otherwise it asks once more (DeleteConfirm): "Delete Alex Kim permanently?
//                       Their registration and signed waiver are deleted from Spring 2027. This
//                       can't be undone." Keep candidate · Delete permanently
// Both are the small box on every device (Dialog variant 'confirm'); focus starts on the safe choice.
import { useId } from 'react';
import Dialog from '../../../components/Dialog.jsx';
import Notice from '../../../components/Notice.jsx';
import { ICONS } from './icons.js';
import * as T from '../text.js';

function NoteLine({ state }) {
  if (!state.note && !state.failed) return null;
  return (
    <div className="tdialog-note">
      <Notice>{state.failed ? T.SAVE_FAILED : state.note}</Notice>
    </div>
  );
}

export default function RemoveDialog({ state, onWithdraw, onDelete, onCancel }) {
  const bodyId = useId();
  const t = state.target;
  const name = T.candidateName(t);
  const off = state.saving || state.blocking;
  const Withdraw = ICONS.withdraw;
  const Trash = ICONS.deleteForever;
  // Why Delete permanently can't be used (null = it can): payment records first, then grades
  const blockedReason = t.hasPaymentRows ? T.hasPaymentRecords(name) : t.hasGrades ? T.hasGrades(name) : null;
  return (
    <Dialog title={T.removeTitle(name)} variant="confirm" describedBy={bodyId} onRequestClose={onCancel}>
      <div id={bodyId} className="bb-remove-choices">
        <div className="bb-remove-choice">
          <button type="button" className="btn" data-autofocus aria-disabled={off ? 'true' : undefined} aria-describedby={`${bodyId}-w`} onClick={() => !off && onWithdraw()}>
            <Withdraw size={16} aria-hidden="true" />
            {state.saving ? T.SAVING : T.WITHDRAW}
          </button>
          <p id={`${bodyId}-w`} className="field-hint">
            {T.WITHDRAW_HINT}
          </p>
        </div>
        <div className="bb-remove-choice">
          <button
            type="button"
            className={`btn ${blockedReason ? 'bb-btn-gray' : 'btn-delete'}`}
            aria-disabled={off || blockedReason ? 'true' : undefined}
            aria-describedby={`${bodyId}-d`}
            onClick={() => !off && !blockedReason && onDelete()}
          >
            <Trash size={16} aria-hidden="true" />
            {T.DELETE_PERMANENTLY}
          </button>
          <p id={`${bodyId}-d`} className="field-hint">
            {blockedReason ?? T.DELETE_HINT}
          </p>
        </div>
      </div>
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onCancel}>
          {T.CANCEL}
        </button>
      </div>
      <NoteLine state={state} />
    </Dialog>
  );
}

export function DeleteConfirm({ state, cycle, onConfirm, onCancel }) {
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
      <NoteLine state={state} />
    </Dialog>
  );
}
