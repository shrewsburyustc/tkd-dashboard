// FeesDialog.jsx — "Edit fees" for one Dan (approved mockup screen 10).
// Why it exists: v0.61 — admins change the three fees of each Dan: Standard, Same day (paid on
// testing day) and Private, in whole dollars. Side by side on PC and tablet, stacked on the phone
// (the same as Color Belt's approved rank prices). Events copy the fees when they are created;
// recorded payments never change.
// The fees are saved with the Dan's settings (one database call, one version), so this dialog
// sends the Dan's saved pass mark and highest star back unchanged.
// Messages: on the phone (fields stacked) each message sits under its own field. On PC and tablet
// the three fields share one row with narrow columns, so the messages go UNDER THE ROW, each naming
// its field ("Standard: Use whole dollars, like 140.") — the same pattern as the grade scale.
import Notice from '../../../components/Notice.jsx';
import { FEE_KEYS, checkFeesForm } from './rubricRules.js';
import StarFormDialog from './StarFormDialog.jsx';
import * as T from './text.js';

const LABELS = { standard: T.FEE_STANDARD, sameDay: T.FEE_SAME_DAY, private: T.FEE_PRIVATE };

export default function FeesDialog({ state, dan, isPhone, onChange, onTouch, onSave, onCancel, onRequestClose }) {
  const check = checkFeesForm(state, dan);
  const readOnly = state.saving;
  const idBase = `star-fees-${state.key}`;

  return (
    <StarFormDialog
      title={T.EDIT_FEES}
      subtitle={dan.label}
      isPhone={isPhone}
      note={state.note}
      canSave={check.canSave}
      saving={state.saving}
      meta={{ name: dan.updatedByName, at: dan.updatedAt }}
      onSave={onSave}
      onCancel={onCancel}
      onRequestClose={onRequestClose}
    >
      <div className={isPhone ? 'tprices is-stacked' : 'tprices'}>
        {FEE_KEYS.map((key, index) => {
          const error = check.errors[key];
          return (
            <div key={key} className="field">
              <label htmlFor={`${idBase}-${key}`}>{LABELS[key]}</label>
              <div className={`money${readOnly ? ' is-readonly' : ''}${error ? ' is-bad' : ''}`}>
                <span className="money-prefix" aria-hidden="true">
                  $
                </span>
                <input
                  id={`${idBase}-${key}`}
                  className="money-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  data-autofocus={index === 0 ? true : undefined}
                  readOnly={readOnly}
                  value={state.values[key]}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${idBase}-${key}-error` : `${idBase}-hint`}
                  onChange={(event) => {
                    onChange({ [key]: event.target.value });
                    onTouch(key);
                  }}
                  onBlur={() => onTouch(key)}
                />
              </div>
              {error && isPhone && <Notice id={`${idBase}-${key}-error`}>{error}</Notice>}
            </div>
          );
        })}
      </div>
      {!isPhone && FEE_KEYS.some((key) => check.errors[key]) && (
        <div className="st-fee-errors">
          {FEE_KEYS.filter((key) => check.errors[key]).map((key) => (
            <Notice key={key} id={`${idBase}-${key}-error`}>
              {T.feeProblemText(LABELS[key], check.errors[key])}
            </Notice>
          ))}
        </div>
      )}
      <p id={`${idBase}-hint`} className="field-hint tdialog-hint">
        {T.FEES_HINT}
      </p>
    </StarFormDialog>
  );
}
