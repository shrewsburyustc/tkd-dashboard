// StarDeleteEventDialog.jsx — "Delete Fall 2026 Star Testing?" (admins only).
// Why it exists: approved Events mockup screen 13 and rulebook v0.91. Deleting an event is
// PERMANENT, so it asks first and names exactly what goes (rule 1.4): "Its 23 candidates and their
// registrations, payments and grades are deleted too. This can't be undone." — or, for an empty
// event, "It has no candidates. This can't be undone." Buttons: Keep event and red Delete event.
// No Undo afterwards. The same small box on every device, phones included.
//
// The numbers come from the event re-read just before this opens (StarEventsTab.startDelete),
// and the delete sends exactly what was counted (every candidate, withdrawn too, and the net
// payment total) — so if anything changed meanwhile the database answers "stale" instead of
// deleting something the person didn't see.
//
// Mat-side mode (v0.249, built in phase 3): the approved sentence names no money amount, so this
// box shows no payment details today. If a later decision adds the payment total to the sentence,
// that total must be hidden on a mat-side tablet.
import { useId } from 'react';
import { IconTrash } from '@tabler/icons-react';
import Dialog from '../../../../components/Dialog.jsx';
import Notice from '../../../../components/Notice.jsx';
import * as T from './text.js';

export default function StarDeleteEventDialog({ name, activeCount, withdrawnCount, failed, deleting, onDelete, onCancel }) {
  const bodyId = useId();
  return (
    <Dialog title={T.deleteEventTitle(name)} variant="confirm" describedBy={bodyId} onRequestClose={onCancel}>
      <p id={bodyId} className="tdialog-sub tdialog-body">
        {T.deleteEventBody({ activeCount, withdrawnCount })}
      </p>
      <div className="dialog-actions">
        {/* Focus starts on the safe choice for a permanent action. */}
        <button type="button" className="btn" data-autofocus onClick={onCancel}>
          {T.KEEP_EVENT}
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
          {T.DELETE_EVENT}
        </button>
      </div>
      {failed && (
        <div className="tdialog-note">
          <Notice>{T.DELETE_FAILED}</Notice>
        </div>
      )}
    </Dialog>
  );
}
