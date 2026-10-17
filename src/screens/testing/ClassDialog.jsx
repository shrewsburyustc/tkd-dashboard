// ClassDialog.jsx — "Add class" and "Edit class".
// Why it exists: approved mockup screens 4 and 5 (v0.42, v0.45).
//   Add class:  only the Class name is required. The optional "Final award after this class"
//               sits under a collapsed "More details" (guidelines 8: optional fields collapsed)
//               and starts on "Not set" — a new class goes to the bottom, so nothing follows it.
//   Edit class: Class name + Final award after this class (shows the SAVED choice; contract
//               0003 resolution 3 — renaming a class never sets an award by itself).
// The final award is the rank students receive after passing this class's last rank. It's a
// rank of THIS school, never one of the class's own ranks (those aren't even listed).
//
// Like RankDialog, this only draws the form; the values live in ClassesRanksTab so they
// survive the screen locking while the dialog is open.
import { IconCheck, IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import Dialog from '../../components/Dialog.jsx';
import Notice from '../../components/Notice.jsx';
import { findDuplicateClass, nameProblem, normalizeName } from '../../lib/testing/names.js';
import { finalAwardChoiceOf, finalAwardOptions } from '../../lib/testing/rankOrder.js';
import FinalAwardSelect from './FinalAwardSelect.jsx';
import * as T from './text.js';

export function isClassFormDirty(state) {
  return state.values.name !== state.initial.name || state.values.awardId !== state.initial.awardId;
}

// Checks the form. Returns the name message and whether Save is available.
//   classes  the school's classes (for the duplicate-name check)
//   record   the saved class (edit mode)
export function checkClassForm(state, classes, school, record) {
  const { values, touched } = state;
  const typed = normalizeName(values.name);
  const problem = nameProblem(values.name);
  const serverDuplicate = state.duplicateName !== null && state.duplicateName === typed;
  const localDuplicate = problem ? null : findDuplicateClass(classes, values.name, state.classId ?? null);
  let nameError = null;
  if (serverDuplicate) nameError = T.duplicateClass(school, typed);
  else if (problem === 'empty') nameError = touched.name ? T.nameProblemText('empty', 'class') : null;
  else if (problem) nameError = T.nameProblemText(problem, 'class');
  else if (localDuplicate) nameError = T.duplicateClass(school, localDuplicate);

  const valid = !problem && !localDuplicate && !serverDuplicate;
  const sameAsSaved =
    state.mode === 'edit' && record && valid && typed === record.name && values.awardId === finalAwardChoiceOf(record);
  // Blue whenever usable, also when nothing changed (v0.57) — then Save just closes.
  const canSave = valid && !state.saving && !state.blocked;
  // choice: null (Not set) | FINAL_AWARD_NONE | rank id — turned into the two database values
  // with finalAwardArgs(choice) when it's sent (v0.62).
  return { nameError, canSave, sameAsSaved, payload: valid ? { name: typed, choice: values.awardId } : null };
}

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
  onToggleMore, // Add class: open / close "More details"
  onSave,
  onCancel,
  onRequestClose,
}) {
  const isAdd = state.mode === 'add';
  const check = checkClassForm(state, classes, school, state.snapshot?.cls ?? record);
  const readOnly = state.saving;
  const idBase = `class-dialog-${state.key}`;
  // Every class's ranks except this class's own (Add class: every class).
  const options = finalAwardOptions(classes, isAdd ? null : state.classId);
  const showAward = !isAdd || state.moreOpen;

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

  return (
    <Dialog title={isAdd ? T.ADD_CLASS_TITLE : T.EDIT_CLASS} fullScreen={isPhone} onRequestClose={onRequestClose}>
      <p className="tdialog-sub">{isAdd ? T.addClassSubtitle(school) : T.classAtSchool(record?.name ?? '', school)}</p>
      <form onSubmit={handleSubmit} noValidate>
        <div className="field">
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

        {isAdd && (
          <button
            type="button"
            className="more-toggle"
            aria-expanded={state.moreOpen ? 'true' : 'false'}
            aria-controls={`${idBase}-more`}
            onClick={onToggleMore}
          >
            {T.MORE_DETAILS}
            {/* ti-chevron-down / ti-chevron-up = expand / collapse */}
            {state.moreOpen ? <IconChevronUp size={16} aria-hidden="true" /> : <IconChevronDown size={16} aria-hidden="true" />}
          </button>
        )}

        <div id={`${idBase}-more`} hidden={!showAward}>
          <div className="field field--last">
            <span id={`${idBase}-award-label`} className="field-label">
              {isAdd ? T.FINAL_AWARD_FIELD_OPTIONAL : T.FINAL_AWARD_FIELD}
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
              {isAdd ? T.FINAL_AWARD_HINT_ADD : T.FINAL_AWARD_HINT}
            </p>
          </div>
        </div>

        {state.note && (
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
        )}

        {isPhone ? (
          <div className="dialog-page-submit">{saveButton}</div>
        ) : (
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={onCancel}>
              {T.CANCEL}
            </button>
            {saveButton}
          </div>
        )}
      </form>
    </Dialog>
  );
}
