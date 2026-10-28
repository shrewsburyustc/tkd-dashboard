// dialogParts.jsx — small pieces every Candidates dialog shares.
// Why it exists: each phase 3 dialog (New candidate, Edit details, Record payment, Record refund,
// Set private testing …) ends the same way: an amber note under the buttons when something went
// wrong (G11: "Couldn't save…", "Someone else changed this just now…", "Unsaved changes…"), then
// Cancel / Save — on phones a full-width Save with no Cancel, and a "Discard changes" link inside
// the note instead (v0.56). Writing it once keeps every dialog the same (Color Belt's pattern,
// src/screens/testing/event/PaymentDialogs.jsx, copied rather than shared).
//   note: { text, discard } | null — discard = the phone note gets the "Discard changes" link
// (The "are you sure?" boxes are the shared components/ConfirmBox.jsx since the design review's part 2,
// rulebook v0.518; Star's own copy that lived here is gone.)
import { IconCheck } from '@tabler/icons-react';
import Notice from '../../../../components/Notice.jsx';
import * as T from './text.js';

export function NoteBlock({ note, isPhone, onCancel }) {
  if (!note) return null;
  return (
    <div className="tdialog-note">
      <Notice>
        {note.text}
        {isPhone && note.discard && (
          <button type="button" className="note-action" onClick={onCancel}>
            {T.DISCARD_CHANGES}
          </button>
        )}
      </Notice>
    </div>
  );
}

// The bottom of a form dialog: the note, Cancel and Save (phones: the note, then a full-width Save).
export function Footer({ saving, canSave, note, isPhone, onCancel, saveLabel = T.SAVE }) {
  const saveButton = (
    <button
      type="submit"
      className={`btn btn-primary${isPhone ? ' btn-block' : ''}${canSave ? '' : ' is-unavailable'}`}
      aria-disabled={canSave ? undefined : 'true'}
    >
      {/* ti-check = save */}
      <IconCheck size={16} aria-hidden="true" />
      {saving ? T.SAVING : saveLabel}
    </button>
  );
  if (isPhone) {
    return (
      <>
        <NoteBlock note={note} isPhone onCancel={onCancel} />
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
      <NoteBlock note={note} isPhone={false} onCancel={onCancel} />
    </div>
  );
}
