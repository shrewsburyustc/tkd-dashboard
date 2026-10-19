// NoteDialog.jsx — "Note for Sam Diaz": the grading note of one student (G2, rulebook v0.185).
// Why it exists: graders sometimes need a short remark ("Retest the jumping front kick next
// time."). The note shows on the Grading tab — also on the mat, where parents can see the
// screen — so the hint reminds the grader to write only what a parent could read.
//   - subtitle: class · current belt → testing for · the result on screen (or "Not recorded yet")
//   - one text box (about 4 lines); up to 200 characters AFTER tidying. Line breaks and runs of
//     spaces become one space when saved (the note is one line, contract 0010 §1.2), so the
//     counter counts the tidied text. The counter shows from the start.
//   - Save stays gray until the tidied text differs from the saved note; clearing the text and
//     saving removes the note
//   - typing that isn't saved: Esc, a click outside or the back arrow keep the dialog open with
//     "Unsaved changes. Save or cancel first." (phones: with a "Discard changes" link, v0.56)
// PC and tablet: a centered dialog. Phone: a full screen with a back arrow and the Save button
// pinned under the field (the same as the Students dialogs on phones).
//
// Like the other event-page dialogs this only DRAWS the form; the text lives in EventPage
// (`state.values.text`), so a screen lock hides the dialog and brings it back still filled in.
import { useEffect, useRef } from 'react';
import { IconCheck } from '@tabler/icons-react';
import Dialog from '../../../components/Dialog.jsx';
import Notice from '../../../components/Notice.jsx';
import { gradingNoteProblem, normalizeGradingNote } from '../../../lib/testing/gradingRules.js';
import * as T from '../text.js';

// Notes that get the "Discard changes" link on phones (the page has no Cancel button).
const PHONE_DISCARD_NOTES = ['UNSAVED', 'STALE_DIALOG'];
const NOTES = {
  UNSAVED: T.UNSAVED,
  STALE_DIALOG: T.STALE_DIALOG,
  NOTE_SAVE_FAILED: T.NOTE_SAVE_FAILED,
  NOTE_BAD_CHARACTER: T.NOTE_BAD_CHARACTER,
};

// Can this note be saved, and is it any different from the saved one?
//   savedNote = the note the row has now (null = none)
export function checkNote(state, savedNote) {
  const text = state.values.text;
  const problem = gradingNoteProblem(text);
  const tidy = normalizeGradingNote(text);
  const changed = tidy !== (savedNote ?? null);
  const length = tidy ? [...tidy].length : 0; // characters, an emoji or 'é' counts as 1
  return { problem, tidy, changed, length, canSave: !problem && changed && !state.saving && !state.blocked };
}

export function isNoteDirty(state) {
  return state.values.text !== state.initial.text;
}

// hint (phase 4, optional): the gray line under the field — the private grading page passes its own.
export default function NoteDialog({ state, name, subtitle, savedNote, hint = T.GRADING_NOTE_HINT, isPhone, onChange, onSave, onCancel, onRequestClose }) {
  const idBase = `note-dialog-${state.key}`;
  // Opening on an existing note: the cursor starts at its end, ready to add to it. (Dialog.jsx
  // has already put focus in the text box: a child's effect runs before its parent's.)
  const fieldRef = useRef(null);
  useEffect(() => {
    const field = fieldRef.current;
    if (field && document.activeElement === field) field.setSelectionRange(field.value.length, field.value.length);
  }, []);
  const check = checkNote(state, savedNote);
  let fieldError = null;
  if (check.problem === 'badCharacter') fieldError = T.NOTE_BAD_CHARACTER;
  if (check.problem === 'tooLong') fieldError = T.NOTE_TOO_LONG_200;

  function handleSubmit(submitEvent) {
    submitEvent.preventDefault();
    if (check.canSave) onSave();
  }

  const saveButton = (
    <button
      type="submit"
      className={`btn btn-primary${isPhone ? ' btn-block' : ''}${check.canSave ? '' : ' is-unavailable'}`}
      aria-disabled={check.canSave ? undefined : 'true'}
    >
      {/* ti-check = Save */}
      <IconCheck size={16} aria-hidden="true" />
      {state.saving ? T.SAVING : T.SAVE}
    </button>
  );
  const noteBlock = state.note && (
    <div className="tdialog-note">
      <Notice>
        {isPhone && state.note === 'STALE_DIALOG' ? T.STALE_DIALOG_PHONE : NOTES[state.note]}
        {isPhone && PHONE_DISCARD_NOTES.includes(state.note) && (
          <button type="button" className="note-action" onClick={onCancel}>
            {T.DISCARD_CHANGES}
          </button>
        )}
      </Notice>
    </div>
  );

  return (
    <Dialog title={T.noteTitle(name)} size="small" fullScreen={isPhone} onRequestClose={onRequestClose}>
      <p className="tdialog-sub">{subtitle}</p>
      <form className="gr-note-form" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <textarea
            ref={fieldRef}
            id={`${idBase}-text`}
            className="input gr-note-field"
            rows={4}
            maxLength={400} /* only a paste guard: the real limit is 200 after tidying (counter) */
            aria-label={T.NOTE_FIELD_LABEL}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={`${idBase}-hint${fieldError ? ` ${idBase}-error` : ''}`}
            data-autofocus
            // tabIndex 0: Dialog.jsx's Tab loop only knows elements with a tabindex besides
            // buttons, inputs and links — without it Tab would skip the text box.
            tabIndex={0}
            readOnly={state.saving}
            value={state.values.text}
            onChange={(changeEvent) => onChange({ text: changeEvent.target.value })}
          />
          <div className="gr-note-under">
            <p id={`${idBase}-hint`} className="field-hint">
              {hint}
            </p>
            <span className="gr-note-counter" aria-hidden="true">
              {T.noteCounter(check.length)}
            </span>
          </div>
          {fieldError && <Notice id={`${idBase}-error`}>{fieldError}</Notice>}
        </div>

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
