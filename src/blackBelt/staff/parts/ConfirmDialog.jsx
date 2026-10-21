// ConfirmDialog.jsx — the small "are you sure?" box: Delete cycle, and "Save and delete" when a
// new keeping time would remove personal details at once (contract OP-6, OP-8).
// Why it exists: rule 1.4 — something that can't be undone is confirmed first, naming exactly
// what goes. The same small box on every device, phones included (Dialog variant 'confirm').
// Focus starts on the safe choice (Cancel). The red button is used only for deleting.
//
// Props: title, body, cancelLabel, confirmLabel, danger (red confirm button), busy (saving),
//        failed (text of the amber note after a dropped connection, or null), onConfirm, onCancel,
//        nested (true when it opens on top of another dialog: then it uses InnerDialog, which
//        adds no second browser-history step)
import { useId } from 'react';
import { IconTrash } from '@tabler/icons-react';
import Dialog from '../../../components/Dialog.jsx';
import Notice from '../../../components/Notice.jsx';
import InnerDialog from './InnerDialog.jsx';

export default function ConfirmDialog({ title, body, cancelLabel, confirmLabel, danger = false, busy = false, failed = null, nested = false, onConfirm, onCancel }) {
  const bodyId = useId();
  const Frame = nested ? InnerDialog : Dialog;
  return (
    <Frame title={title} variant="confirm" describedBy={bodyId} onRequestClose={onCancel}>
      <p id={bodyId} className="tdialog-sub tdialog-body">
        {body}
      </p>
      <div className="dialog-actions">
        <button type="button" className="btn" data-autofocus onClick={onCancel}>
          {cancelLabel}
        </button>
        <button
          type="button"
          className={`btn ${danger ? 'btn-delete' : 'btn-primary'}`}
          aria-disabled={busy ? 'true' : undefined}
          onClick={() => {
            if (!busy) onConfirm();
          }}
        >
          {/* ti-trash = delete (red: deleting only) */}
          {danger && <IconTrash size={16} aria-hidden="true" />}
          {confirmLabel}
        </button>
      </div>
      {failed && (
        <div className="tdialog-note">
          <Notice>{failed}</Notice>
        </div>
      )}
    </Frame>
  );
}
