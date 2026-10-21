// StarFormDialog.jsx — the frame every Rubrics and prices form dialog shares.
// Why it exists: the five Star dialogs (category, Dan settings, grade values, assistant-class
// table, fees) all behave the same way (guidelines 6 / v0.46, v0.56, v0.57, v0.81), exactly like
// Color Belt's rank and class dialogs:
//   - PC and tablet: a centered dialog with Cancel + Save; phones: a full-screen page with a back
//     arrow and ONE full-width Save at the bottom (rule 2.1).
//   - Save (ti-check) is blue whenever the form can be saved — also before anything changed —
//     and gray (still focusable) while a field has a problem (v0.57).
//   - The note area: "Unsaved changes. Save or cancel first." when Esc / a click outside / the
//     back arrow is used after typing; "changed by someone else", "not allowed", "didn't save".
//     On phones the note brings its own "Discard changes" link (no Cancel button there, v0.56).
//     PC / tablet: the note sits under Cancel / Save so the buttons never move (v0.81).
//   - "Last changed by …" (gray) when the data layer provides who and when.
// Dialog.jsx (Color Belt's shared frame) does focus, the focus trap, Esc, the backdrop and the
// browser Back button. The typed values live in RubricsTab, not here, so they survive the
// screen locking while the dialog is open.
//
// Props:
//   title, subtitle      heading and the gray line under it
//   size                 Dialog size ('detail' 440px by default; 'star-wide' 480px)
//   isPhone              full-screen page instead of a box
//   note                 null | 'UNSAVED' | 'STALE_DIALOG' | 'NOT_ALLOWED' | 'INVALID_DIALOG' | 'SAVE_FAILED'
//   canSave, saving      Save blue / gray, and "Saving…" while on its way
//   meta                 { name, at } for "Last changed by …", or null
//   onSave, onCancel, onRequestClose
//   children             the fields
import { IconCheck } from '@tabler/icons-react';
import Dialog from '../../../components/Dialog.jsx';
import Notice from '../../../components/Notice.jsx';
import * as T from './text.js';

// Notes that get the "Discard changes" link on phones.
const PHONE_DISCARD_NOTES = ['UNSAVED', 'STALE_DIALOG', 'NOT_ALLOWED'];

const NOTES = {
  UNSAVED: T.UNSAVED,
  STALE_DIALOG: T.STALE_DIALOG,
  NOT_ALLOWED: T.NOT_ALLOWED,
  INVALID_DIALOG: T.INVALID_DIALOG,
  SAVE_FAILED: T.SAVE_FAILED,
};

export default function StarFormDialog({
  title,
  subtitle,
  size = 'detail',
  isPhone,
  note,
  canSave,
  saving,
  meta,
  onSave,
  onCancel,
  onRequestClose,
  children,
}) {
  function handleSubmit(event) {
    event.preventDefault();
    if (canSave) onSave();
  }

  const saveButton = (
    <button
      type="submit"
      className={`btn btn-primary${isPhone ? ' btn-block' : ''}${canSave ? '' : ' is-unavailable'}`}
      aria-disabled={canSave ? undefined : 'true'}
    >
      {/* ti-check = Save */}
      <IconCheck size={16} aria-hidden="true" />
      {saving ? T.SAVING : T.SAVE}
    </button>
  );

  const noteBlock = note && (
    <div className="tdialog-note">
      <Notice>
        {isPhone && note === 'STALE_DIALOG' ? T.STALE_DIALOG_PHONE : NOTES[note]}
        {isPhone && PHONE_DISCARD_NOTES.includes(note) && (
          <button type="button" className="note-action" onClick={onCancel}>
            {T.DISCARD_CHANGES}
          </button>
        )}
      </Notice>
    </div>
  );

  return (
    <Dialog title={title} size={size} fullScreen={isPhone} onRequestClose={onRequestClose}>
      {subtitle && <p className="tdialog-sub">{subtitle}</p>}
      <form onSubmit={handleSubmit} noValidate>
        {children}
        {meta?.name && meta?.at && <p className="tmeta">{T.lastChanged(meta.name, meta.at)}</p>}
        {isPhone && noteBlock}
        {isPhone ? (
          <div className="dialog-page-submit">{saveButton}</div>
        ) : (
          <div className="dialog-footer">
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={onCancel}>
                {T.CANCEL}
              </button>
              {saveButton}
            </div>
            {noteBlock}
          </div>
        )}
      </form>
    </Dialog>
  );
}

// A number field with a gray word inside it on the right ("10   credits", "15   or more").
// Drawn like the price fields (.money in testing.css), 140px wide unless `full`.
export function NumberField({ id, value, suffix, readOnly, invalid, describedBy, autoFocus, full = false, decimal = false, label, onChange, onBlur }) {
  return (
    <div className={`money st-numfield${full ? ' st-numfield--full' : ''}${readOnly ? ' is-readonly' : ''}${invalid ? ' is-bad' : ''}`}>
      <input
        id={id}
        className="money-input"
        type="text"
        inputMode={decimal ? 'decimal' : 'numeric'}
        autoComplete="off"
        aria-label={label}
        data-autofocus={autoFocus ? true : undefined}
        readOnly={readOnly}
        value={value}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
      />
      {suffix && (
        <span className="st-suffix" aria-hidden="true">
          {suffix}
        </span>
      )}
    </div>
  );
}

// aria-describedby from several ids (any may be missing).
export const describe = (...ids) => ids.filter(Boolean).join(' ') || undefined;
