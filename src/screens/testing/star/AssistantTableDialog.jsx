// AssistantTableDialog.jsx — "Edit assistant-class table" (approved mockup screen 9).
// Why it exists: v0.61 — the assistant-class table (the age split and how many assisted classes
// give each Assistant Instructor grade) can be changed.
//   - "Children's scale up to age" — 12 today: 12 and under use the first column, 13 and up the
//     second. The column headings and the hint follow this number as it's typed.
//   - Two columns of minimums, one row per grade A+ … C, each with "or more" written inside.
//   - D is read-only: "under 10" — anything below the C number, so it follows C as it's typed.
//   - Each grade's minimum must be lower than the grade above it, per column (v0.66): typing
//     A = 25 under A+ = 20 shows "A must need fewer classes than A+." under that row, and Save
//     stays gray until it's fixed.
// The same three-column layout fits the phone (no sideways scroll, rule 1.3).
import { Fragment } from 'react';
import Notice from '../../../components/Notice.jsx';
import { MINIMUM_GRADES, checkAssistantForm } from './rubricRules.js';
import StarFormDialog, { NumberField, describe } from './StarFormDialog.jsx';
import * as T from './text.js';

export default function AssistantTableDialog({ state, assistant, dans, isPhone, onChange, onTouch, onSave, onCancel, onRequestClose }) {
  const check = checkAssistantForm(state, assistant);
  const readOnly = state.saving;
  const idBase = `star-assist-${state.key}`;
  const childHead = T.childColumn(check.shownAge);
  const adultHead = T.adultColumn(check.shownAge);

  const cell = (column, index, head) => {
    const key = `${column}-${index}`;
    const bad = check.bad.has(key);
    return (
      <NumberField
        id={`${idBase}-${key}`}
        label={`${MINIMUM_GRADES[index]}, ${head}`}
        value={state.values[column][index]}
        suffix={T.OR_MORE_SUFFIX}
        full
        readOnly={readOnly}
        invalid={bad}
        describedBy={bad ? `${idBase}-row-${index}-error` : undefined}
        onChange={(value) => {
          onChange(column, index, value);
          onTouch(key);
        }}
        onBlur={() => onTouch(key)}
      />
    );
  };

  return (
    <StarFormDialog
      title={T.EDIT_ASSISTANT_TABLE}
      subtitle={T.usedByAllDans(dans.length)}
      size="star-wide"
      isPhone={isPhone}
      note={state.note}
      canSave={check.canSave}
      saving={state.saving}
      meta={{ name: assistant.updatedByName, at: assistant.updatedAt }}
      onSave={onSave}
      onCancel={onCancel}
      onRequestClose={onRequestClose}
    >
      <div className="field">
        <label htmlFor={`${idBase}-age`}>{T.CHILD_AGE}</label>
        <NumberField
          id={`${idBase}-age`}
          value={state.values.age}
          autoFocus
          readOnly={readOnly}
          invalid={Boolean(check.ageError)}
          describedBy={describe(`${idBase}-age-hint`, check.ageError && `${idBase}-age-error`)}
          onChange={(value) => {
            onChange('age', null, value);
            onTouch('age');
          }}
          onBlur={() => onTouch('age')}
        />
        <p id={`${idBase}-age-hint`} className="field-hint">
          {T.childAgeHint(check.shownAge)}
        </p>
        {check.ageError && <Notice id={`${idBase}-age-error`}>{check.ageError}</Notice>}
      </div>

      <p className="st-grp-lbl">{T.MINIMUMS_LABEL}</p>
      <div className="st-agrid st-agrid--head" aria-hidden="true">
        <span>{T.COL_GRADE}</span>
        <span>{childHead}</span>
        <span>{adultHead}</span>
      </div>
      {MINIMUM_GRADES.map((grade, index) => (
        <Fragment key={grade}>
          <div className="st-agrid">
            <span className="st-ag">{grade}</span>
            {cell('child', index, childHead)}
            {cell('adult', index, adultHead)}
          </div>
          {check.rows[index] && (
            <div className="st-aerr" id={`${idBase}-row-${index}-error`}>
              {check.rows[index].map((message) => (
                <Notice key={message}>{message}</Notice>
              ))}
            </div>
          )}
        </Fragment>
      ))}
      <div className="st-agrid">
        <span className="st-ag">D</span>
        <span className="st-rov">{T.underN(check.childC)}</span>
        <span className="st-rov">{T.underN(check.adultC)}</span>
      </div>
    </StarFormDialog>
  );
}
