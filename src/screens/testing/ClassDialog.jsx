// ClassDialog.jsx — "Add class", "Edit class" and "Final award" (CB14, rulebook v0.427 / v0.432).
// Why it exists: approved mockup screens 4 and 5 (v0.42, v0.45), split by the dialog sheet of 2026-11-07:
//   Add class:   (Settings → Classes and ranks; state.part 'name') only the Class name. The final award starts
//                on "Not set" — a new class goes to the bottom, so nothing follows it — and is chosen later
//                on the Prices tab.
//   Edit class:  (Settings; part 'name') the Class name only. It sends the saved final award back unchanged.
//   Final award: (Color belt testing → Prices, the pencil on a class; part 'award') only "Final award after
//                this class" (shows the SAVED choice; contract 0003 resolution 3 — renaming a class never
//                sets an award by itself). It sends the saved name back unchanged.
// The final award is the rank students receive after passing this class's last rank. It's a
// rank of THIS school, never one of the class's own ranks (those aren't even listed).
//
// Like RankDialog, this only draws the form; the values live in ClassesRanksTab so they
// survive the screen locking while the dialog is open.
import { IconCheck } from '@tabler/icons-react';
import Dialog from '../../components/Dialog.jsx';
import Notice from '../../components/Notice.jsx';
import { finalAwardOptions } from '../../lib/testing/rankOrder.js';
import { checkClassForm } from '../../lib/testing/classRankForms.js';
import FinalAwardSelect from './FinalAwardSelect.jsx';
import * as T from './text.js';

// The form checks live in lib/testing/classRankForms.js (plain JavaScript, so node can test them); ClassesRanksTab
// still imports them from here.
export { checkClassForm, isClassFormDirty } from '../../lib/testing/classRankForms.js';

// Notes that get the "Discard changes" link on phones.
const PHONE_DISCARD_NOTES = ['UNSAVED', 'STALE_DIALOG', 'NOT_ALLOWED'];

const NOTES = {
  UNSAVED: T.UNSAVED,
  STALE_DIALOG: T.STALE_DIALOG,
  NOT_ALLOWED: T.NOT_ALLOWED,
  INVALID_DIALOG: T.INVALID_DIALOG,
  SAVE_FAILED: T.SAVE_FAILED,
};

export default function ClassDialog({
  state, // the form (see ClassesRanksTab: openClassDialog)
  school,
  classes, // the school's classes, as loaded
  record, // edit: the class as loaded (or as it was when the dialog opened)
  isPhone,
  onChange, // (patch of values) => void
  onTouch, // (field) => void
  onSave,
  onCancel,
  onRequestClose,
}) {
  const isAdd = state.mode === 'add';
  const isAward = state.part === 'award'; // the Final award dialog
  const check = checkClassForm(state, classes, school, state.snapshot?.cls ?? record);
  const readOnly = state.saving;
  const idBase = `class-dialog-${state.key}`;
  // Every class's ranks except this class's own (Add class: every class).
  const options = finalAwardOptions(classes, isAdd ? null : state.classId);

  function handleSubmit(event) {
    event.preventDefault();
    if (check.canSave) onSave();
  }

  const saveButton = (
    <button
      type="submit"
      className={`btn btn-primary${isPhone ? ' btn-block' : ''}${check.canSave ? '' : ' is-unavailable'}`}
      aria-disabled={check.canSave ? undefined : 'true'}
    >
      <IconCheck size={16} aria-hidden="true" />
      {state.saving ? T.SAVING : T.SAVE}
    </button>
  );

  // The note (unsaved / stale / failed …). Phones: above the Save button; PC / tablet: under
  // the Cancel / Save row, so the buttons never move when it appears (v0.81).
  const noteBlock = state.note && (
    <div className="tdialog-note">
      <Notice>
        {isPhone && state.note === 'STALE_DIALOG' ? T.STALE_DIALOG_PHONE : NOTES[state.note]}
        {/* Phone only (v0.56): the page has no Cancel button, so these notes offer the way
            out themselves (Save is unavailable after "stale" / "not allowed").
            Closes without saving, like Cancel. */}
        {isPhone && PHONE_DISCARD_NOTES.includes(state.note) && (
          <button type="button" className="note-action" onClick={onCancel}>
            {T.DISCARD_CHANGES}
          </button>
        )}
      </Notice>
    </div>
  );

  return (
    <Dialog title={isAdd ? T.ADD_CLASS_TITLE : isAward ? T.FINAL_AWARD_TITLE : T.EDIT_CLASS} fullScreen={isPhone} onRequestClose={onRequestClose}>
      <p className="tdialog-sub">{isAdd ? T.addClassSubtitle(school) : T.classAtSchool(record?.name ?? '', school)}</p>
      <form onSubmit={handleSubmit} noValidate>
        {!isAward && (
          <div className="field field--last">
            <label htmlFor={`${idBase}-name`}>{T.CLASS_NAME}</label>
            <input
              id={`${idBase}-name`}
              className="input"
              type="text"
              autoComplete="off"
              data-autofocus
              readOnly={readOnly}
              value={state.values.name}
              aria-invalid={check.nameError ? true : undefined}
              aria-describedby={check.nameError ? `${idBase}-name-error` : undefined}
              onChange={(event) => {
                onChange({ name: event.target.value });
                onTouch('name');
              }}
            />
            {check.nameError && <Notice id={`${idBase}-name-error`}>{check.nameError}</Notice>}
          </div>
        )}

        {isAward && (
          <div className="field field--last">
            <span id={`${idBase}-award-label`} className="field-label">
              {T.FINAL_AWARD_FIELD}
            </span>
            <FinalAwardSelect
              id={`${idBase}-award`}
              labelId={`${idBase}-award-label`}
              describedBy={`${idBase}-award-hint`}
              value={state.values.awardId}
              options={options}
              readOnly={readOnly}
              onChange={(choice) => onChange({ awardId: choice })}
            />
            <p id={`${idBase}-award-hint`} className="field-hint">
              {T.FINAL_AWARD_HINT}
            </p>
          </div>
        )}

        {isPhone && noteBlock}

        {isPhone ? (
          <div className="dialog-page-submit">{saveButton}</div>
        ) : (
          <div className="dialog-footer">
            {/* PC / tablet (v0.81): buttons and, under them, the note share one bottom area, so the
                buttons never move and, on a short screen, both stay pinned in view. */}
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
