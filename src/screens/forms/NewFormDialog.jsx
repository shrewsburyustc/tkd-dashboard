// NewFormDialog.jsx — "New form" (mockup screen 2).
// Why it exists: a form starts from a template — Free class, Walk-in, Event or Blank — and
// everything can be changed after. Create makes it a Draft and opens the builder.
// A form belongs to ONE school: the one in the switcher; on "Both" the dialog asks which.
// The typed values live in Forms.jsx (so a lock while it's open loses nothing).
import { IconCalendarEvent, IconCheck, IconDoor, IconFile, IconUserPlus } from '@tabler/icons-react';
import Dialog from '../../components/Dialog.jsx';
import Notice from '../../components/Notice.jsx';
import { textProblem } from '../../lib/calendar/rules.js';
import * as T from './text.js';

const ICONS = { free_class: IconUserPlus, walk_in: IconDoor, event: IconCalendarEvent, blank: IconFile };
const NAME_PROBLEM = { empty: T.NAME_NEEDED, tooLong: T.NAME_TOO_LONG, badCharacter: T.NAME_BAD };

export function checkNewForm(state) {
  const problem = textProblem(state.values.name, 80);
  return {
    nameError: problem && (state.touched.name || state.touched.submit) ? NAME_PROBLEM[problem] : null,
    canSave: problem === null && Boolean(state.values.school) && !state.saving,
  };
}

export default function NewFormDialog({ state, both, isPhone, onChange, onTouch, onSave, onCancel, onRequestClose }) {
  const v = state.values;
  const check = checkNewForm(state);
  const idBase = `new-form-${state.key}`;
  function submit(e) {
    e.preventDefault();
    if (check.canSave) onSave();
    else onTouch(['submit', 'name']);
  }
  const createButton = (
    <button type="submit" className={`btn btn-primary${isPhone ? ' btn-block' : ''}${check.canSave ? '' : ' is-unavailable'}`} aria-disabled={check.canSave ? undefined : 'true'}>
      <IconCheck size={16} aria-hidden="true" />
      {state.saving ? T.CREATING : T.CREATE}
    </button>
  );
  return (
    <Dialog title={T.NEW_FORM_TITLE} size="detail" fullScreen={isPhone} onRequestClose={onRequestClose}>
      {!both && <p className="tdialog-sub">{T.SCHOOL_NAME[v.school]}</p>}
      <form onSubmit={submit} noValidate>
        {both && (
          <fieldset className="field cfieldset">
            <legend className="field-label">{T.SCHOOL}</legend>
            <div className="cseg" role="radiogroup" aria-label={T.SCHOOL}>
              {['worcester', 'shrewsbury'].map((code) => (
                <label key={code} className={`cseg-item${v.school === code ? ' is-on' : ''}`}>
                  <input type="radio" name={`${idBase}-school`} checked={v.school === code} disabled={state.saving} onChange={() => onChange({ school: code })} />
                  <span>{T.SCHOOL_NAME[code]}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div className="field">
          <label htmlFor={`${idBase}-name`}>{T.FORM_NAME}</label>
          <input
            id={`${idBase}-name`}
            className="input"
            data-autofocus
            value={v.name}
            maxLength={200}
            readOnly={state.saving}
            aria-invalid={check.nameError ? true : undefined}
            aria-describedby={check.nameError ? `${idBase}-name-error` : undefined}
            onChange={(e) => onChange({ name: e.target.value })}
            onBlur={() => onTouch(['name'])}
          />
          {check.nameError && <Notice id={`${idBase}-name-error`}>{check.nameError}</Notice>}
        </div>
        <fieldset className="field cfieldset">
          <legend className="field-label">{T.START_FROM}</legend>
          <div className="ftemplates" role="radiogroup" aria-label={T.START_FROM}>
            {T.TEMPLATES.map((t) => {
              const Icon = ICONS[t.kind];
              return (
                <label key={t.kind} className={`ftemplate${v.kind === t.kind ? ' is-on' : ''}`}>
                  <input type="radio" name={`${idBase}-kind`} className="visually-hidden" checked={v.kind === t.kind} disabled={state.saving} onChange={() => onChange({ kind: t.kind })} />
                  <b>
                    <Icon size={16} aria-hidden="true" />
                    {t.label}
                  </b>
                  <span>{t.sub}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
        {state.note && (
          <div className="tdialog-note">
            <Notice>{state.note}</Notice>
          </div>
        )}
        {isPhone ? (
          <div className="dialog-page-submit">{createButton}</div>
        ) : (
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={onCancel}>
              {T.CANCEL}
            </button>
            {createButton}
          </div>
        )}
      </form>
    </Dialog>
  );
}
