// DialogFooter.jsx — the bottom of Board breaking's form dialogs: Cancel and Save, with the amber note under them.
// Why it exists: every dialog here (Add / Edit student, Move to class, Record refund, Edit payment) ends the same
// way as Camps' PaymentDialogs.jsx Footer: on a PC or tablet a pinned Cancel / Save row with the note under it;
// on a phone the note, then a full-width Save, with a "Discard changes" link inside notes the dialog can't fix by
// saving again. Written once here so the five dialogs agree (guidelines 3.5: a failed save is never silent).
//
// A note is { text, phoneText?, blocking?, discard? } (see NOTES below):
//   blocking  saving again can't fix it (someone else changed the row): Save grays until the dialog closes
//   discard   on phones the note gets a "Discard changes" link (the way out there)
// noteForStatus(status) turns the database's status CODE into the right note.
import { IconCheck } from '@tabler/icons-react';
import Notice from '../../../components/Notice.jsx';
import * as T from '../../../lib/breaking/text/dialogs.js';

export const NOTES = {
  unsaved: { text: T.UNSAVED, discard: true },
  stale: { text: T.STALE_DIALOG, phoneText: T.STALE_DIALOG_PHONE, blocking: true, discard: true },
  notAllowed: { text: T.ROSTER_NOT_ALLOWED, blocking: true, discard: true },
  invalid: { text: T.INVALID_DIALOG },
  failed: { text: T.SAVE_FAILED },
};

// The database status of a failed save → which note shows.
export function noteForStatus(status) {
  if (status === 'not_allowed') return NOTES.notAllowed;
  if (status === 'stale' || status === 'not_found') return NOTES.stale;
  if (status === 'invalid') return NOTES.invalid;
  return NOTES.failed; // 'error' (no connection) and anything unexpected
}

export default function DialogFooter({ saving, note, isPhone, canSave, onCancel, saveLabel = T.SAVE, savingLabel = T.SAVING }) {
  const saveButton = (
    <button type="submit" className={`btn btn-primary${isPhone ? ' btn-block' : ''}${canSave ? '' : ' is-unavailable'}`} aria-disabled={canSave ? undefined : 'true'}>
      <IconCheck size={16} aria-hidden="true" />
      {saving ? savingLabel : saveLabel}
    </button>
  );
  const noteBlock = note && (
    <div className="tdialog-note">
      <Notice>
        {isPhone && note.phoneText ? note.phoneText : note.text}
        {isPhone && note.discard && (
          <button type="button" className="note-action" onClick={onCancel}>
            {T.DISCARD_CHANGES}
          </button>
        )}
      </Notice>
    </div>
  );
  if (isPhone) {
    return (
      <>
        {noteBlock}
        <div className="dialog-page-submit">{saveButton}</div>
      </>
    );
  }
  return (
    <div className="dialog-footer">
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onCancel}>
          {T.CANCEL}
        </button>
        {saveButton}
      </div>
      {noteBlock}
    </div>
  );
}
