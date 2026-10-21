// dialogParts.jsx — small pieces every Candidates dialog shares.
// Why it exists: each phase 3 dialog (New candidate, Edit details, Record payment, Record refund,
// Set private testing …) ends the same way: an amber note under the buttons when something went
// wrong (G11: "Couldn't save…", "Someone else changed this just now…", "Unsaved changes…"), then
// Cancel / Save — on phones a full-width Save with no Cancel, and a "Discard changes" link inside
// the note instead (v0.56). Writing it once keeps every dialog the same (Color Belt's pattern,
// src/screens/testing/event/PaymentDialogs.jsx, copied rather than shared).
//   note: { text, discard } | null — discard = the phone note gets the "Discard changes" link
// Also: ConfirmBox, the small confirmation used for Undo payment / Undo refund / Delete permanently
// and the Dan-change question (the same small box on every device, phones included).
import { useId } from 'react';
import { IconArrowBackUp, IconCheck, IconTrash } from '@tabler/icons-react';
import Dialog from '../../../../components/Dialog.jsx';
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

// A small confirmation. tone: 'danger' (red, ti-trash), 'undo' (blue primary, ti-arrow-back-up —
// nothing is deleted, G16) or 'dan' (red, no icon — the decided v0.164 drawing).
export function ConfirmBox({ title, body, hint, keepLabel, goLabel, tone = 'danger', busy, failedText, onGo, onCancel }) {
  const bodyId = useId();
  const goClass = tone === 'undo' ? 'btn btn-primary' : 'btn btn-delete';
  return (
    <Dialog title={title} variant="confirm" describedBy={bodyId} onRequestClose={onCancel}>
      <p id={bodyId} className="tdialog-sub tdialog-body">
        {body}
      </p>
      {hint && <p className="field-hint ev-confirm-hint">{hint}</p>}
      <div className="dialog-actions">
        {/* Focus starts on the safe choice. */}
        <button type="button" className="btn" data-autofocus onClick={onCancel}>
          {keepLabel}
        </button>
        <button
          type="button"
          className={goClass}
          aria-disabled={busy ? 'true' : undefined}
          onClick={() => {
            if (!busy) onGo();
          }}
        >
          {tone === 'danger' && <IconTrash size={16} aria-hidden="true" />}
          {tone === 'undo' && <IconArrowBackUp size={16} aria-hidden="true" />}
          {goLabel}
        </button>
      </div>
      {failedText && (
        <div className="tdialog-note">
          <Notice>{failedText}</Notice>
        </div>
      )}
    </Dialog>
  );
}
