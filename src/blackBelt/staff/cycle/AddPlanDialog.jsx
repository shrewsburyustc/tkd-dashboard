// AddPlanDialog.jsx — "+ Add plan" in Add cycle: asks the plan's name and number of payments.
// Why it exists: approved v0.902 redraw of Cycles 4 — "+ Add plan asks name + number of
// payments, then its amounts and due dates are typed in the grid". This small box opens on top
// of Add cycle (a sibling InnerDialog, like the testing-day dialog); Add puts an empty plan at the
// end of the list. Its wording is not in the mockups (listed for CP2).
// The values live in useCycleEditor.jsx; this file only draws.
import { useId } from 'react';
import { IconPlus } from '@tabler/icons-react';
import Notice from '../../../components/Notice.jsx';
import { nameKey, nameProblem } from '../../../lib/testing/names.js';
import { MAX_PAYMENTS } from '../../../lib/blackBelt/rules.js';
import InnerDialog from '../parts/InnerDialog.jsx';
import * as T from '../text.js';

export function checkAddPlan(state, plans) {
  const nameCode = nameProblem(state.name) ?? (plans.some((p) => nameKey(p.name) === nameKey(state.name)) ? 'duplicate' : null);
  const count = /^\d{1,2}$/.test(String(state.count).trim()) ? Number(state.count) : NaN;
  const countOk = Number.isInteger(count) && count >= 1 && count <= MAX_PAYMENTS;
  return {
    nameMsg: nameCode && (nameCode !== 'empty' || state.triedSave || state.touchedName) ? T.nameProblemText(nameCode, T.ENTER_PLAN_NAME) : null,
    countMsg: countOk ? null : T.PAYMENTS_RANGE,
    valid: !nameCode && countOk,
    count,
  };
}

export default function AddPlanDialog({ state, plans, isPhone, onChange, onAdd, onCancel }) {
  const id = useId();
  const check = checkAddPlan(state, plans);
  return (
    <InnerDialog title={T.ADD_PLAN_TITLE} size="small" fullScreen={isPhone} onRequestClose={onCancel}>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onAdd(check);
        }}
      >
        <div className="field">
          <label htmlFor={`${id}-name`}>{T.PLAN_NAME_LABEL}</label>
          <input
            id={`${id}-name`}
            className="input"
            type="text"
            autoComplete="off"
            data-autofocus
            value={state.name}
            aria-invalid={check.nameMsg ? 'true' : undefined}
            aria-describedby={check.nameMsg ? `${id}-name-error` : undefined}
            onChange={(event) => onChange({ name: event.target.value, touchedName: true })}
          />
          {check.nameMsg && <Notice id={`${id}-name-error`}>{check.nameMsg}</Notice>}
        </div>
        <div className="field">
          <label htmlFor={`${id}-count`}>{T.NUMBER_OF_PAYMENTS}</label>
          <input
            id={`${id}-count`}
            className="input bb-count"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={state.count}
            aria-invalid={check.countMsg ? 'true' : undefined}
            aria-describedby={`${id}-count-hint`}
            onChange={(event) => onChange({ count: event.target.value })}
          />
          {check.countMsg ? (
            <Notice id={`${id}-count-hint`}>{check.countMsg}</Notice>
          ) : (
            <p id={`${id}-count-hint`} className="field-hint">
              {T.NUMBER_OF_PAYMENTS_HINT}
            </p>
          )}
        </div>
        <div className={isPhone ? 'dialog-page-submit' : 'dialog-actions'}>
          {!isPhone && (
            <button type="button" className="btn" onClick={onCancel}>
              {T.CANCEL}
            </button>
          )}
          <button
            type="submit"
            className={`btn btn-primary${isPhone ? ' btn-block' : ''}${check.valid ? '' : ' is-unavailable'}`}
            aria-disabled={check.valid ? undefined : 'true'}
          >
            {/* ti-plus = add new */}
            <IconPlus size={16} aria-hidden="true" />
            {T.ADD}
          </button>
        </div>
      </form>
    </InnerDialog>
  );
}
