// dialogParts.jsx — small pieces the Candidates dialogs share: the Amount box with "$", the
// Cash · Check · Card choice, the optional Note, and the bottom row (note + Cancel / Save).
// AmountMethod puts Amount and Method side by side on the PC and tablet (mockup Candidates 4);
// phones stack them.
// Why it exists: Record payment, Edit payment and Record refund (mockups Candidates 4 and 5) draw
// the same fields the same way; writing them once keeps them identical.
import { useId } from 'react';
import ErrorBanner from '../../../components/ErrorBanner.jsx';
import Notice from '../../../components/Notice.jsx';
import { METHODS } from '../../../lib/blackBelt/rules.js';
import Choice from '../parts/Choice.jsx';
import * as T from '../text.js';

// "Amount  [$ 390]" — any cents, typed freely (money.parseAmount reads it).
export function AmountField({ value, onChange, error, readOnly, autoFocus = false }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={`${id}-amount`}>{T.AMOUNT}</label>
      <span
        className={`money bb-amount${error ? ' is-invalid' : ''}${readOnly ? ' is-readonly' : ''}`}
        onMouseDown={(event) => {
          const input = event.currentTarget.querySelector('input');
          if (event.target !== input && input) {
            event.preventDefault(); // a click on the "$" still puts the cursor in the box
            input.focus();
          }
        }}
      >
        <span className="money-prefix" aria-hidden="true">
          $
        </span>
        <input
          id={`${id}-amount`}
          className="money-input"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          readOnly={readOnly}
          data-autofocus={autoFocus ? true : undefined}
          value={value}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${id}-amount-err` : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      </span>
      {error && <Notice id={`${id}-amount-err`}>{error}</Notice>}
    </div>
  );
}

// "Method  Cash | Check | Card" — nothing chosen at first (OP-B5). Compact: only as wide as its
// three words (bb-segmented--compact), as drawn.
export function MethodField({ value, onChange, error, readOnly }) {
  const id = useId();
  return (
    <div className="field">
      <span id={`${id}-method`} className="field-label">
        {T.METHOD}
      </span>
      <Choice labelId={`${id}-method`} options={METHODS.map((key) => ({ key, label: T.methodName(key) }))} value={value} readOnly={readOnly} onChange={onChange} className={`bb-segmented--compact${error ? ' is-invalid' : ''}`} />
      {error && <Notice>{error}</Notice>}
    </div>
  );
}

// Amount and Method side by side (PC / tablet); one under the other on phones (blackBelt.css).
export function AmountMethod({ children }) {
  return <div className="bb-pay-pair">{children}</div>;
}

// A one-line text box (the Note, the Reason for the change).
export function TextField({ label, value, onChange, placeholder, error, readOnly, autoFocus = false }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={`${id}-text`}>{label}</label>
      <input
        id={`${id}-text`}
        className="input"
        type="text"
        autoComplete="off"
        maxLength={700}
        placeholder={placeholder}
        readOnly={readOnly}
        data-autofocus={autoFocus ? true : undefined}
        value={value}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${id}-text-err` : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error && <Notice id={`${id}-text-err`}>{error}</Notice>}
    </div>
  );
}

// The failed-connection banner at the top of a dialog (stays until Retry works).
export function FailedBanner({ state, onRetry }) {
  return state.failed ? <ErrorBanner text={T.SAVE_FAILED} onRetry={onRetry} retrying={state.saving} /> : null;
}

// The bottom of a form dialog. PC / tablet: [extra buttons] Cancel · primary, with the note under
// them; phones: the note, then the primary (and any extra) as full-width buttons.
//   primary   the main button (type="submit")
//   extra     other buttons (e.g. "Save and record another"), drawn before the primary on the PC
//             and after it on phones (as drawn)
//   divider   true = the gray line above the buttons even in a small dialog (Record refund, Mark
//             check returned), like every other Candidates dialog
export function Footer({ state, isPhone, primary, extra = null, onCancel, divider = false }) {
  const note = state.note && (
    <div className="tdialog-note">
      <Notice>
        {state.note}
        {isPhone && state.note === T.UNSAVED && (
          <button type="button" className="note-action" onClick={onCancel}>
            {T.DISCARD_CHANGES}
          </button>
        )}
      </Notice>
    </div>
  );
  if (isPhone) {
    return (
      <>
        {note}
        <div className="dialog-page-submit bb-phone-buttons">
          {primary}
          {extra}
        </div>
      </>
    );
  }
  return (
    <div className={`dialog-footer${divider ? ' bb-footer-divider' : ''}`}>
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onCancel}>
          {T.CANCEL}
        </button>
        {extra}
        {primary}
      </div>
      {note}
    </div>
  );
}

// The blue main button: gray while it can't be used (a blocking note, or saving).
export function PrimaryButton({ state, isPhone, label, Icon, savingLabel = T.SAVING, type = 'submit', onClick }) {
  const off = state.saving || state.blocking;
  return (
    <button type={type} className={`btn btn-primary${isPhone ? ' btn-block' : ''}${off ? ' is-unavailable' : ''}`} aria-disabled={off ? 'true' : undefined} onClick={onClick}>
      {Icon && <Icon size={16} aria-hidden="true" />}
      {state.saving ? savingLabel : label}
    </button>
  );
}
