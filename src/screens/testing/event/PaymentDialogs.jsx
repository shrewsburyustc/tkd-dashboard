// PaymentDialogs.jsx — the two small payment dialogs of the roster's ⋯ menu.
// Why it exists: Mark paid is ONE click (plan answer 6) and the old Record payment dialog (R5)
// was dropped. Two small corrections are still needed:
//   PayingByDialog    "Change how they'll pay" — before paying, staff set Cash / Check / Card
//                     (Star v0.109: someone may register cash and pay by card). Mark paid then
//                     records that method.
//   EditPaymentDialog "Edit payment" (admins only) — fix a recorded payment's method, amount or
//                     date. The database keeps the old one in the history (a reversal + a new
//                     payment, §1.6). No check number (v0.120).
// Both are small centered dialogs (full screen on phones) with Cancel / Save. The values live in
// EventPage (`state`), like every other dialog, so a screen lock never loses them.
import { IconCheck } from '@tabler/icons-react';
import Dialog from '../../../components/Dialog.jsx';
import Notice from '../../../components/Notice.jsx';
import { isIsoDate, MAX_PAYMENT_CENTS } from '../../../lib/testing/eventRules.js';
import { parseDollars } from '../../../lib/money.js';
import ChoiceGroup from '../events/ChoiceGroup.jsx';
import * as T from '../text.js';

const METHODS = ['cash', 'check', 'card'];
const PHONE_DISCARD_NOTES = ['UNSAVED', 'STALE_DIALOG', 'NOT_ALLOWED'];
const NOTES = {
  UNSAVED: T.UNSAVED,
  STALE_DIALOG: T.STALE_DIALOG,
  NOT_ALLOWED: T.ROSTER_NOT_ALLOWED,
  INVALID_DIALOG: T.INVALID_DIALOG,
  SAVE_FAILED: T.SAVE_FAILED,
  ALREADY_PAID: T.ALREADY_PAID_DIALOG,
};

// The shared bottom part: note + Cancel / Save (phones: the note, then one full-width Save).
function Footer({ state, isPhone, canSave, onCancel }) {
  const saveButton = (
    <button
      type="submit"
      className={`btn btn-primary${isPhone ? ' btn-block' : ''}${canSave ? '' : ' is-unavailable'}`}
      aria-disabled={canSave ? undefined : 'true'}
    >
      <IconCheck size={16} aria-hidden="true" />
      {state.saving ? T.SAVING : T.SAVE}
    </button>
  );
  const noteBlock = state.note && (
    <div className="tdialog-note">
      <Notice>
        {isPhone && state.note === 'STALE_DIALOG' ? T.STALE_DIALOG_PHONE : NOTES[state.note]}
        {isPhone && PHONE_DISCARD_NOTES.includes(state.note) && (
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
        {noteBlock}
        <div className="dialog-page-submit">{saveButton}</div>
      </>
    );
  }
  return (
    <div className="dialog-footer">
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onCancel}>
          {T.CANCEL}
        </button>
        {saveButton}
      </div>
      {noteBlock}
    </div>
  );
}

// ----- Change how they'll pay -----
export function isPayingByDirty(state) {
  return state.values.payingBy !== state.initial.payingBy;
}

// subtitle (phase 4, optional): the Private testing tab passes "Liam Park · $20 more to collect"
// while a private testing still owes more.
export function PayingByDialog({ state, name, subtitle = null, isPhone, onChange, onSave, onCancel, onRequestClose }) {
  const idBase = `paying-dialog-${state.key}`;
  const canSave = !state.saving && !state.blocked;
  return (
    <Dialog title={T.CHANGE_PAYING_BY_TITLE} fullScreen={isPhone} onRequestClose={onRequestClose}>
      <p className="tdialog-sub">{subtitle ?? T.changePayingBySub(name)}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (canSave) onSave();
        }}
        noValidate
      >
        <div className="field field--last">
          <span id={`${idBase}-label`} className="field-label">
            {T.PAYING_BY_LABEL}
          </span>
          <div>
            <ChoiceGroup
              autoFocus
              labelId={`${idBase}-label`}
              value={state.values.payingBy}
              readOnly={state.saving}
              options={METHODS.map((key) => ({ key, label: T.payingByText(key) }))}
              onChange={(payingBy) => onChange({ payingBy })}
            />
          </div>
        </div>
        <Footer state={state} isPhone={isPhone} canSave={canSave} onCancel={onCancel} />
      </form>
    </Dialog>
  );
}

// ----- Edit payment (admins) -----
export function isEditPaymentDirty(state) {
  const a = state.values;
  const b = state.initial;
  return a.method !== b.method || a.amount !== b.amount || a.paidOn !== b.paidOn;
}

export function checkEditPayment(state) {
  const { values, touched, triedSave } = state;
  const parsed = parseDollars(values.amount);
  let amountError = null;
  if (parsed.problem) {
    if (parsed.problem !== 'empty' || touched.amount || triedSave) amountError = T.priceProblemText(parsed.problem);
  } else if (parsed.cents <= 0) amountError = T.AMOUNT_ZERO;
  else if (parsed.cents > MAX_PAYMENT_CENTS) amountError = T.priceProblemText('tooHigh');
  let dateError = null;
  if (!isIsoDate(values.paidOn)) dateError = touched.paidOn || triedSave ? T.ENTER_DATE_PAID : null;
  const valid = !parsed.problem && parsed.cents > 0 && parsed.cents <= MAX_PAYMENT_CENTS && isIsoDate(values.paidOn);
  return {
    amountError,
    dateError,
    canSave: valid && !state.saving && !state.blocked,
    sameAsSaved: valid && !isEditPaymentDirty(state),
    payload: valid ? { method: values.method, amountCents: parsed.cents, paidOn: values.paidOn } : null,
  };
}

// subtitle (phase 4, optional): with two or more payments the Private testing tab names them all
// and the one being edited ("Ava Chen · $65 cash Nov 2 + $20 card Dec 1 — editing the $20").
export function EditPaymentDialog({ state, name, subtitle = null, isPhone, onChange, onTouch, onSave, onCancel, onRequestClose }) {
  const idBase = `payment-dialog-${state.key}`;
  const check = checkEditPayment(state);
  const readOnly = state.saving;
  return (
    <Dialog title={T.EDIT_PAYMENT_TITLE} fullScreen={isPhone} onRequestClose={onRequestClose}>
      <p className="tdialog-sub">{subtitle ?? T.editPaymentSub(name)}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave(check.canSave);
        }}
        noValidate
      >
        <div className="field">
          <span id={`${idBase}-method`} className="field-label">
            {T.PAID_BY}
          </span>
          <div>
            <ChoiceGroup
              autoFocus
              labelId={`${idBase}-method`}
              value={state.values.method}
              readOnly={readOnly}
              options={METHODS.map((key) => ({ key, label: T.payingByText(key) }))}
              onChange={(method) => onChange({ method })}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor={`${idBase}-amount`}>{T.AMOUNT}</label>
          <div className={`money ev-money${readOnly ? ' is-readonly' : ''}`}>
            <span className="money-prefix" aria-hidden="true">
              $
            </span>
            <input
              id={`${idBase}-amount`}
              className="money-input"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              readOnly={readOnly}
              value={state.values.amount}
              aria-invalid={check.amountError ? true : undefined}
              aria-describedby={check.amountError ? `${idBase}-amount-error` : undefined}
              onChange={(event) => {
                onChange({ amount: event.target.value });
                onTouch('amount');
              }}
            />
          </div>
          {check.amountError && <Notice id={`${idBase}-amount-error`}>{check.amountError}</Notice>}
        </div>
        <div className="field">
          <label htmlFor={`${idBase}-date`}>{T.DATE_PAID}</label>
          <input
            id={`${idBase}-date`}
            className="input ev-date"
            type="date"
            readOnly={readOnly}
            value={state.values.paidOn}
            aria-invalid={check.dateError ? true : undefined}
            aria-describedby={check.dateError ? `${idBase}-date-error` : undefined}
            onChange={(event) => {
              onChange({ paidOn: event.target.value });
              onTouch('paidOn');
            }}
          />
          {check.dateError && <Notice id={`${idBase}-date-error`}>{check.dateError}</Notice>}
        </div>
        <p className="field-hint">{T.EDIT_PAYMENT_HINT}</p>
        <Footer state={state} isPhone={isPhone} canSave={check.canSave} onCancel={onCancel} />
      </form>
    </Dialog>
  );
}
