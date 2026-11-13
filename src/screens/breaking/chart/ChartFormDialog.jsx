// ChartFormDialog.jsx — the frame the three Chart and prices dialogs share (Edit prices, Edit age groups, Edit/Add rank).
// Why it exists: they all behave the same way as Star's Rubrics and prices dialogs and Color belt's rank dialog
// (a copy of Star's StarFormDialog.jsx with Board breaking's own words, so the two sections stay apart):
//   - PC and tablet: a centered box with Cancel + Save; phones: a full-screen page with a back arrow and ONE
//     full-width Save at the bottom (rule 2.1).
//   - Save (ti-check) is blue whenever the form can be saved — also before anything changed — and gray (still
//     focusable, aria-disabled) while a field has a problem.
//   - The note area: "Unsaved changes. Save or cancel first." when Esc / a click outside / the back arrow is used
//     after typing; "changed by someone else", "not allowed", "didn't save". On phones the note brings its own
//     "Discard changes" link. PC / tablet: the note sits under Cancel / Save so the buttons never move (v0.81).
// Dialog.jsx (the shared frame) does focus, the focus trap, Esc, the backdrop and the browser Back button. The typed
// values live in ChartAndPricesTab, not here, so they survive the screen locking while the dialog is open.
//
// Props:
//   title, subtitle      heading and the gray line under it
//   size                 Dialog size ('detail' 440px by default; 'small' 360px)
//   isPhone              full-screen page instead of a box
//   note                 null | 'UNSAVED' | 'STALE_DIALOG' | 'NOT_ALLOWED' | 'INVALID_DIALOG' | 'SAVE_FAILED'
//   canSave, saving      Save blue / gray, and "Saving…" while on its way
//   onSave, onCancel, onRequestClose
//   children             the fields
import { IconCheck } from '@tabler/icons-react';
import Dialog from '../../../components/Dialog.jsx';
import Notice from '../../../components/Notice.jsx';
import * as T from '../../../lib/breaking/text/chart.js';

// Notes that get the "Discard changes" link on phones.
const PHONE_DISCARD_NOTES = ['UNSAVED', 'STALE_DIALOG', 'NOT_ALLOWED'];

const NOTES = {
  UNSAVED: T.UNSAVED,
  STALE_DIALOG: T.STALE_DIALOG,
  NOT_ALLOWED: T.NOT_ALLOWED,
  INVALID_DIALOG: T.INVALID_DIALOG,
  SAVE_FAILED: T.SAVE_FAILED,
};

export default function ChartFormDialog({ title, subtitle, size = 'detail', isPhone, note, canSave, saving, onSave, onCancel, onRequestClose, children }) {
  function handleSubmit(event) {
    event.preventDefault(); // stop the browser from reloading the page
    if (canSave) onSave(); // Enter in a field = Save, but only when Save is available
  }

  const saveButton = (
    <button
      type="submit"
      className={`btn btn-primary${isPhone ? ' btn-block' : ''}${canSave ? '' : ' is-unavailable'}`}
      aria-disabled={canSave ? undefined : 'true'}
    >
      {/* ti-check = Save (and only Save) */}
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
      {/* noValidate: our own plain-language messages instead of the browser's pop-ups */}
      <form onSubmit={handleSubmit} noValidate>
        {children}
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
