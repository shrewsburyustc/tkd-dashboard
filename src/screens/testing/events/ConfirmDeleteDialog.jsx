// ConfirmDeleteDialog.jsx — "Delete November Children Testing?" / "Delete Mia Lopez permanently?"
// Why it exists: deleting an event (E13, Star v0.91) or a student (R8, plan answer 8) is
// PERMANENT, so (rule 1.4) a confirmation names exactly what goes first, and there is no Undo.
// It is phase 1's DeleteDialog with the approved button words for these screens ("Keep event" /
// "Delete event", "Keep student" / "Delete permanently") and an optional gray hint line
// ("To keep the record, use Withdraw instead."). The same small box on every device.
//
// The sentence is built from data re-read just before this opens, and the delete sends exactly
// what it states — so if anything changed meanwhile, the database answers "stale" instead of
// deleting something the person didn't see.
import { useId } from 'react';
import { IconTrash } from '@tabler/icons-react';
import Dialog from '../../../components/Dialog.jsx';
import Notice from '../../../components/Notice.jsx';
import { DELETE_FAILED } from '../text.js';

export default function ConfirmDeleteDialog({ title, body, hint, keepLabel, deleteLabel, failed, deleting, onDelete, onCancel }) {
  const bodyId = useId();
  return (
    <Dialog title={title} variant="confirm" describedBy={bodyId} onRequestClose={onCancel}>
      <p id={bodyId} className="tdialog-sub tdialog-body">
        {body}
      </p>
      {hint && <p className="field-hint ev-confirm-hint">{hint}</p>}
      <div className="dialog-actions">
        {/* Focus starts on the safe choice for a permanent action. */}
        <button type="button" className="btn" data-autofocus onClick={onCancel}>
          {keepLabel}
        </button>
        <button
          type="button"
          className="btn btn-delete"
          aria-disabled={deleting ? 'true' : undefined}
          onClick={() => {
            if (!deleting) onDelete();
          }}
        >
          {/* ti-trash = delete (red: deleting only) */}
          <IconTrash size={16} aria-hidden="true" />
          {deleteLabel}
        </button>
      </div>
      {failed && (
        <div className="tdialog-note">
          <Notice>{DELETE_FAILED}</Notice>
        </div>
      )}
    </Dialog>
  );
}
