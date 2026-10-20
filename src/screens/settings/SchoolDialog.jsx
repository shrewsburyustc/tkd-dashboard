// SchoolDialog.jsx — edit one school's street address and phone (Settings → Schools, mockup S3).
// Why it exists: rulebook v0.135 — admins enter each school's address in the dashboard; the
// family registration pages and the printed flyer show "Location: <school>, <address>".
// Four fields: Street address, City, State, ZIP code. All four empty = no address (the family
// pages then show just the school name); otherwise all four are needed. The same rules as the
// database (src/lib/settings/schoolsApi.js addressProblems) are checked while typing.
// Under the address: an optional Phone (migration 0019, F3 difference 4) — a closed sign-up form
// shows it as "Call us at …". One Save stores the address and the phone together.
// PC / tablet: a small centered dialog with Cancel / Save. Phone: a full screen with a back arrow.
// The values live in Settings.jsx (`state`), so a screen lock never loses what was typed.
import { IconCheck } from '@tabler/icons-react';
import Dialog from '../../components/Dialog.jsx';
import Notice from '../../components/Notice.jsx';
import { addressProblems, phoneProblem } from '../../lib/settings/schoolsApi.js';
import * as T from './text.js';

const FIELDS = [
  { key: 'street', label: T.STREET, autoComplete: 'off' },
  { key: 'city', label: T.CITY, autoComplete: 'off' },
  { key: 'state', label: T.STATE, autoComplete: 'off', short: true },
  { key: 'zip', label: T.ZIP, autoComplete: 'off', short: true, inputMode: 'numeric' },
];

export function isSchoolFormDirty(state) {
  return [...FIELDS.map((field) => field.key), 'phone'].some((key) => state.values[key] !== state.initial[key]);
}

// Messages + whether Save is available. "Empty" messages wait until the field was used or
// Save was pressed; format problems (state, ZIP, too long) show at once.
export function checkSchoolForm(state) {
  const problems = addressProblems(state.values);
  const errors = {};
  let valid = true;
  for (const field of FIELDS) {
    const code = problems[field.key];
    if (!code) continue;
    valid = false;
    if (code !== 'empty' || state.touched[field.key] || state.triedSave) errors[field.key] = T.addressProblemText(field.key, code);
  }
  // the phone: shown once the field was left or Save was pressed (not while typing the first digits)
  if (phoneProblem(state.values.phone)) {
    valid = false;
    if (state.touched.phoneDone || state.triedSave) errors.phone = T.PHONE_PROBLEM;
  }
  const t = (v) => String(v ?? '').trim();
  return {
    errors,
    canSave: valid && !state.saving && !state.blocked,
    sameAsSaved: valid && !isSchoolFormDirty(state),
    payload: valid
      ? { street: t(state.values.street), city: t(state.values.city), state: t(state.values.state), zip: t(state.values.zip), phone: t(state.values.phone) }
      : null,
  };
}

const PHONE_DISCARD_NOTES = ['UNSAVED', 'STALE', 'NOT_ALLOWED'];
const NOTES = {
  UNSAVED: T.UNSAVED,
  STALE: T.STALE,
  NOT_ALLOWED: T.NOT_ALLOWED,
  INVALID: T.INVALID,
  SAVE_FAILED: T.SAVE_FAILED,
};

export default function SchoolDialog({ state, school, isPhone, onChange, onTouch, onSave, onCancel, onRequestClose }) {
  const check = checkSchoolForm(state);
  const idBase = `school-dialog-${state.key}`;
  const readOnly = state.saving;

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
        {isPhone && state.note === 'STALE' ? T.STALE_PHONE : NOTES[state.note]}
        {isPhone && PHONE_DISCARD_NOTES.includes(state.note) && (
          <button type="button" className="note-action" onClick={onCancel}>
            {T.DISCARD_CHANGES}
          </button>
        )}
      </Notice>
    </div>
  );

  return (
    <Dialog title={T.schoolName(school.name)} fullScreen={isPhone} onRequestClose={onRequestClose}>
      {!isPhone && <p className="field-label st-section">{T.ADDRESS}</p>}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave(check.canSave);
        }}
        noValidate
      >
        <div className="st-fields">
          {FIELDS.map((field, index) => (
            <div key={field.key} className={`field${field.short ? ' st-short' : ''}`}>
              <label htmlFor={`${idBase}-${field.key}`}>{field.label}</label>
              <input
                id={`${idBase}-${field.key}`}
                className="input"
                type="text"
                autoComplete={field.autoComplete}
                inputMode={field.inputMode}
                data-autofocus={index === 0 ? true : undefined}
                readOnly={readOnly}
                value={state.values[field.key]}
                aria-invalid={check.errors[field.key] ? true : undefined}
                aria-describedby={check.errors[field.key] ? `${idBase}-${field.key}-error` : undefined}
                onChange={(event) => {
                  // The state is always two capital letters: "ma" becomes "MA" as it's typed.
                  const value = field.key === 'state' ? event.target.value.toUpperCase() : event.target.value;
                  onChange({ [field.key]: value });
                  onTouch(field.key);
                }}
              />
              {check.errors[field.key] && <Notice id={`${idBase}-${field.key}-error`}>{check.errors[field.key]}</Notice>}
            </div>
          ))}
        </div>
        <p className="field-hint">{T.addressHint(school.name)}</p>
        <p className="field-hint">{T.CLEAR_HINT}</p>

        <div className="st-fields st-phone">
          <div className="field">
            <label htmlFor={`${idBase}-phone`}>{T.PHONE}</label>
            <input
              id={`${idBase}-phone`}
              className="input"
              type="tel"
              autoComplete="off"
              inputMode="tel"
              maxLength={20}
              readOnly={readOnly}
              value={state.values.phone}
              aria-invalid={check.errors.phone ? true : undefined}
              aria-describedby={`${idBase}-phone-hint${check.errors.phone ? ` ${idBase}-phone-error` : ''}`}
              onChange={(event) => onChange({ phone: event.target.value })}
              onBlur={() => onTouch('phoneDone')}
            />
            <p className="field-hint" id={`${idBase}-phone-hint`}>{T.PHONE_HINT}</p>
            {check.errors.phone && <Notice id={`${idBase}-phone-error`}>{check.errors.phone}</Notice>}
          </div>
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
