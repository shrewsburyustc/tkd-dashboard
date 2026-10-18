// PlanDialog.jsx — "Plan a schedule change" and "Edit planned schedule" (mockup screens 4 and 5).
// Why it exists: admins plan any number of future schedules, each with its own start date
// (v0.137). A new one starts as a copy of the schedule running just before its date, or blank.
// Editing a planned one changes its name and/or start date (the ⋯ menu's Change start date
// and Rename open this same dialog).
import { IconCheck } from '@tabler/icons-react';
import Dialog from '../../components/Dialog.jsx';
import Notice from '../../components/Notice.jsx';
import { nameProblem, normalizeName } from '../../lib/testing/names.js';
import { addDays } from '../../lib/schedule/versions.js';
import * as T from './text.js';

export function isPlanFormDirty(state) {
  return JSON.stringify(state.values) !== JSON.stringify(state.initial);
}

// versions: this school's schedules (classified). today: 'YYYY-MM-DD'.
export function checkPlanForm(state, versions, today) {
  const { values, touched } = state;
  const typed = normalizeName(values.name);
  let nameError = null;
  if (typed !== '') {
    const problem = nameProblem(values.name);
    if (problem === 'tooLong' || typed.length > 40) nameError = T.NAME_TOO_LONG;
    else if (problem && problem !== 'empty') nameError = T.NAME_BAD;
  }
  let dateProblem = null;
  if (!values.startsOn) dateProblem = 'missing';
  else if (values.startsOn <= today) dateProblem = 'notFuture';
  else if (versions.some((v) => v.startsOn === values.startsOn && v.id !== state.versionId)) dateProblem = 'taken';
  if (state.duplicateDate && state.duplicateDate === values.startsOn) dateProblem = 'taken';
  const dateError = dateProblem && (dateProblem !== 'missing' || touched.startsOn) ? T.DATE_PROBLEMS[dateProblem] : null;
  const valid = !nameError && !dateProblem;
  return {
    nameError,
    dateError,
    canSave: valid && !state.saving && !state.blocked,
    sameAsSaved: state.mode === 'edit' && !isPlanFormDirty(state),
    payload: valid ? { name: typed === '' ? null : typed, startsOn: values.startsOn, copy: values.copy } : null,
  };
}

const NOTES = {
  UNSAVED: T.UNSAVED,
  STALE_DIALOG: T.STALE_DIALOG,
  NOT_ALLOWED: T.NOT_ALLOWED,
  PAST_NOT_ALLOWED: T.PAST_NOT_ALLOWED,
  INVALID_DIALOG: T.INVALID_DIALOG,
  SAVE_FAILED: T.SAVE_FAILED,
};

export default function PlanDialog({ state, school, versions, today, copySource, copyCount, isPhone, onChange, onTouch, onSave, onCancel, onRequestClose }) {
  const isPlan = state.mode === 'plan';
  const check = checkPlanForm(state, versions, today);
  const readOnly = state.saving;
  const idBase = `plan-dialog-${state.key}`;

  function handleSubmit(event) {
    event.preventDefault();
    if (check.canSave) onSave();
    else onTouch(['startsOn']);
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
  const noteBlock = state.note && (
    <div className="tdialog-note">
      <Notice>
        {isPhone && state.note === 'STALE_DIALOG' ? T.STALE_DIALOG_PHONE : NOTES[state.note]}
        {isPhone && state.note !== 'SAVE_FAILED' && state.note !== 'INVALID_DIALOG' && (
          <button type="button" className="note-action" onClick={onCancel}>
            {T.DISCARD_CHANGES}
          </button>
        )}
      </Notice>
    </div>
  );

  return (
    <Dialog title={isPlan ? T.PLAN_TITLE : T.EDIT_PLANNED_TITLE} fullScreen={isPhone} onRequestClose={onRequestClose}>
      <p className="tdialog-sub">{school}</p>
      <form onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor={`${idBase}-name`}>{T.NAME_OPTIONAL}</label>
          <input
            id={`${idBase}-name`}
            className="input"
            type="text"
            autoComplete="off"
            placeholder={T.NAME_PLACEHOLDER}
            data-autofocus
            readOnly={readOnly}
            value={state.values.name}
            aria-invalid={check.nameError ? true : undefined}
            aria-describedby={check.nameError ? `${idBase}-name-error` : undefined}
            onChange={(e) => onChange({ name: e.target.value })}
          />
          {check.nameError && <Notice id={`${idBase}-name-error`}>{check.nameError}</Notice>}
        </div>

        <div className="field">
          <label htmlFor={`${idBase}-date`}>{T.STARTS_ON}</label>
          <input
            id={`${idBase}-date`}
            className="input"
            type="date"
            min={addDays(today, 1)}
            readOnly={readOnly}
            value={state.values.startsOn}
            aria-invalid={check.dateError ? true : undefined}
            aria-describedby={check.dateError ? `${idBase}-date-error` : `${idBase}-date-hint`}
            onChange={(e) => {
              onChange({ startsOn: e.target.value });
              onTouch(['startsOn']);
            }}
          />
          {check.dateError ? (
            <Notice id={`${idBase}-date-error`}>{check.dateError}</Notice>
          ) : (
            <p id={`${idBase}-date-hint`} className="field-hint">
              {T.STARTS_ON_HINT}
            </p>
          )}
        </div>

        {isPlan && (
          <fieldset className="field field--last sdialog-fieldset">
            <legend className="field-label">{T.START_FROM}</legend>
            <label className="sradio">
              <input
                type="radio"
                name={`${idBase}-from`}
                checked={state.values.copy}
                disabled={readOnly}
                onChange={() => onChange({ copy: true })}
              />
              <span>{copySource ? T.copyOf(copySource, copyCount) : T.COPY_NOTHING}</span>
            </label>
            <label className="sradio">
              <input
                type="radio"
                name={`${idBase}-from`}
                checked={!state.values.copy}
                disabled={readOnly}
                onChange={() => onChange({ copy: false })}
              />
              <span>{T.BLANK}</span>
            </label>
          </fieldset>
        )}

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
