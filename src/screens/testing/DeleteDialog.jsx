// DeleteDialog.jsx — "Delete High Green?" / "Delete Teen/Adult and its 18 ranks?"
// Why it exists: decided v0.41 — deleting a rank or a class is PERMANENT, so (rule 1.4) a
// confirmation names exactly what will happen first. There is no Undo afterwards. The main
// button is the red Delete (red means delete — nothing else, guidelines 7); Cancel backs out.
// It's the same small box on every device, phones included.
//
// The sentence is built from data re-read just before this opens (ClassesRanksTab), and the
// delete sends exactly what the sentence states — so if anything changed meanwhile, the
// database refuses ("stale") instead of deleting something the person didn't see.
import { useId } from 'react';
import { IconTrash } from '@tabler/icons-react';
import Dialog from '../../components/Dialog.jsx';
import Notice from '../../components/Notice.jsx';
import { CANCEL, DELETE, DELETE_FAILED } from './text.js';

export default function DeleteDialog({ title, body, failed, deleting, onDelete, onCancel }) {
  const bodyId = useId();
  return (
    <Dialog title={title} variant="confirm" describedBy={bodyId} onRequestClose={onCancel}>
      <p id={bodyId} className="tdialog-sub tdialog-body">
        {body}
      </p>
      {failed && (
        <div className="tdialog-note">
          <Notice>{DELETE_FAILED}</Notice>
        </div>
      )}
      <div className="dialog-actions">
        {/* Focus starts on Cancel: the safe choice for a permanent action. */}
        <button type="button" className="btn" data-autofocus onClick={onCancel}>
          {CANCEL}
        </button>
        <button
          type="button"
          className="btn btn-delete"
          aria-disabled={deleting ? 'true' : undefined}
          onClick={() => {
            if (!deleting) onDelete();
          }}
        >
          {/* ti-trash = delete */}
          <IconTrash size={16} aria-hidden="true" />
          {DELETE}
        </button>
      </div>
    </Dialog>
  );
}
