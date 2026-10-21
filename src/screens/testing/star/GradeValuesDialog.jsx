// GradeValuesDialog.jsx — "Edit grade values" (approved mockup screen 8).
// Why it exists: v0.61 — the school-wide grade values (A+ 4.5 … D 0) can be changed. Seven number
// fields in a 4-column grid (4 + 3) on every device. Under them:
//   - a live gray line with each Dan's resulting max score ("Max score: 1st Dan 315 · …"),
//     which follows the typed A+ value
//   - the fixed line "Changing these changes every Dan's max and scores for events created
//     after saving."
// Each grade must be worth more than the one below it (v0.66): typing A = 3.0 under B+ = 3.5
// shows "A must be higher than B+." under that row of the grid, and Save stays gray until it's
// fixed. Nothing else is forced (D doesn't have to stay 0 — that would be a new rule).
import { Fragment } from 'react';
import Notice from '../../../components/Notice.jsx';
import { checkGradesForm } from './rubricRules.js';
import StarFormDialog, { NumberField } from './StarFormDialog.jsx';
import * as T from './text.js';

const PER_ROW = 4;

export default function GradeValuesDialog({ state, grades, dans, isPhone, onChange, onTouch, onSave, onCancel, onRequestClose }) {
  const sorted = [...grades].sort((a, b) => a.position - b.position);
  const check = checkGradesForm(state, sorted, dans);
  const readOnly = state.saving;
  const idBase = `star-grades-${state.key}`;
  const latest = [...sorted].sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))[0];

  // The grid in rows of 4, each followed by the errors of its own fields.
  const rows = [];
  for (let start = 0; start < sorted.length; start += PER_ROW) rows.push(sorted.slice(start, start + PER_ROW).map((g, i) => ({ g, index: start + i })));

  return (
    <StarFormDialog
      title={T.EDIT_GRADE_VALUES}
      subtitle={T.usedByAllDans(dans.length)}
      isPhone={isPhone}
      note={state.note}
      canSave={check.canSave}
      saving={state.saving}
      meta={latest ? { name: latest.updatedByName, at: latest.updatedAt } : null}
      onSave={onSave}
      onCancel={onCancel}
      onRequestClose={onRequestClose}
    >
      <div className="st-ggrid">
        {rows.map((row, rowIndex) => {
          const errors = row.map(({ index }) => ({ index, text: check.errors[index] })).filter((e) => e.text);
          return (
            <Fragment key={rowIndex}>
              {row.map(({ g, index }) => (
                <div key={g.id} className="field">
                  <label htmlFor={`${idBase}-${index}`}>{g.grade}</label>
                  <NumberField
                    id={`${idBase}-${index}`}
                    value={state.values[index]}
                    decimal
                    full
                    autoFocus={index === 0}
                    readOnly={readOnly}
                    invalid={Boolean(check.errors[index])}
                    describedBy={check.errors[index] ? `${idBase}-${index}-error` : undefined}
                    onChange={(value) => {
                      onChange(index, value);
                      onTouch(index);
                    }}
                    onBlur={() => onTouch(index)}
                  />
                </div>
              ))}
              {errors.length > 0 && (
                <div className="st-gerr">
                  {errors.map((e) => (
                    <Notice key={e.index} id={`${idBase}-${e.index}-error`}>
                      {e.text}
                    </Notice>
                  ))}
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
      <div className="st-preview" aria-live="polite">
        <div>{T.maxScoresLine(check.maxScores)}</div>
      </div>
      <p className="field-hint st-after-preview">{T.GRADES_CHANGE_NOTE}</p>
    </StarFormDialog>
  );
}
