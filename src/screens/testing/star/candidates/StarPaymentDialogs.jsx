// StarPaymentDialogs.jsx — the payment dialogs of the Star testing Candidates tab.
// Why it exists: Record refund (gap mockup G1, v0.166) and the corrections of G16 (Edit payment,
// Change how they'll pay). They are small centered dialogs (full screen on phones) with Cancel / Save.
// (Taking a payment is the row's Mark paid with the shared Mark paid box since S1, v0.518 — the old
// Record payment dialog is gone; a different amount or date is fixed with an admin's Edit payment.)
//   EditPaymentDialog    admins: the recorded payment's method, amount and date; the old one is kept
//                        in the history (a reversal + a new payment).
//   RefundDialog         admins, an overpaid row only: Refunded by Cash | Check (no Card), Amount =
//                        the overpaid amount, at most that; Date refunded.
//   PayingByDialog       "Change how they'll pay" before paying.
// None of them can be opened while "Hide private details" is on (G4: no payment items).
// Like every Star dialog this only DRAWS and checks the form; the values live in CandidatesTab
// (`state`), so a screen lock never loses them.
import Dialog from '../../../../components/Dialog.jsx';
import Notice from '../../../../components/Notice.jsx';
import DatePicker from '../../../../components/DatePicker.jsx';
import { parseDollars } from '../../../../lib/money.js';
import { isIsoDate, MAX_PAYMENT_CENTS } from '../../../../lib/testing/eventRules.js';
import { yearRange } from '../../../../lib/star/eventDateRules.js';
import ChoiceGroup from '../../../../components/ChoiceGroup.jsx';
import { Footer } from './dialogParts.jsx';
import * as T from './text.js';

const METHODS = ['cash', 'check', 'card'];
const REFUND_METHODS = ['cash', 'check'];
const yearOf = (iso) => Number(String(iso).slice(0, 4));

// The amount field's message, or null. cap: a refund's overpaid amount (or null).
function amountProblem(text, touched, cap = null) {
  const parsed = parseDollars(text);
  if (parsed.problem) return { error: parsed.problem !== 'empty' || touched ? T.priceProblemText(parsed.problem) : null, cents: null };
  if (parsed.cents <= 0) return { error: T.AMOUNT_ZERO, cents: null };
  if (parsed.cents > MAX_PAYMENT_CENTS) return { error: T.AMOUNT_TOO_HIGH, cents: null };
  if (cap !== null && parsed.cents > cap) return { error: T.refundTooLarge(cap), cents: null };
  return { error: null, cents: parsed.cents };
}

function MoneyField({ id, label, value, readOnly, error, hint, onChange }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className={`money ev-money${readOnly ? ' is-readonly' : ''}`}>
        <span className="money-prefix" aria-hidden="true">
          $
        </span>
        <input
          id={id}
          className="money-input"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          readOnly={readOnly}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-msg`}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      {error ? (
        <Notice id={`${id}-msg`}>{error}</Notice>
      ) : (
        hint && (
          <p id={`${id}-msg`} className="field-hint">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

function MethodField({ id, label, value, methods, readOnly, hint, autoFocus, onChange }) {
  return (
    <div className="field">
      <span id={id} className="field-label">
        {label}
      </span>
      <div>
        <ChoiceGroup
          autoFocus={autoFocus}
          labelId={id}
          value={value}
          readOnly={readOnly}
          describedBy={hint ? `${id}-hint` : undefined}
          options={methods.map((key) => ({ key, label: T.payingByText(key) }))}
          onChange={onChange}
        />
      </div>
      {hint && (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      )}
    </div>
  );
}

function DateField({ id, label, value, today, min, readOnly, error, hint, isPhone, onChange }) {
  return (
    <div className="field">
      <span id={`${id}-label`} className="field-label">
        {label}
      </span>
      <DatePicker
        id={id}
        label={label}
        value={value}
        today={today}
        min={min}
        max={today}
        years={yearRange(yearOf(min || today), yearOf(today))}
        hint={hint}
        disabled={readOnly}
        invalid={Boolean(error)}
        describedBy={error ? `${id}-error` : undefined}
        inline={isPhone}
        onChange={onChange}
      />
      {error && <Notice id={`${id}-error`}>{error}</Notice>}
    </div>
  );
}

// ===== The amount / date check (Edit payment, Record refund) =====
export function isRecordDirty(state) {
  const a = state.values;
  const b = state.initial;
  return a.method !== b.method || a.amount !== b.amount || a.paidOn !== b.paidOn;
}
export function checkRecordPayment(state, today, cap = null) {
  const { values, touched, triedSave } = state;
  const amount = amountProblem(values.amount, touched.amount || triedSave, cap);
  const dateOk = isIsoDate(values.paidOn) && values.paidOn <= today && (!state.minDate || values.paidOn >= state.minDate);
  const dateError = dateOk ? null : touched.paidOn || triedSave ? T.ENTER_DATE_PAID : null;
  const valid = amount.cents !== null && dateOk && Boolean(values.method);
  return {
    amountError: amount.error,
    dateError,
    canSave: valid && !state.saving && !state.blocked,
    sameAsSaved: valid && !isRecordDirty(state),
    payload: valid ? { method: values.method, amountCents: amount.cents, paidOn: values.paidOn } : null,
  };
}

// ===== Edit payment (admins, G16) =====
export function EditPaymentDialog({ state, candidate, today, isPhone, onChange, onTouch, onSave, onCancel, onRequestClose }) {
  const idBase = `star-editpay-${state.key}`;
  const check = checkRecordPayment(state, today);
  const readOnly = state.saving;
  return (
    <Dialog title={T.EDIT_PAYMENT_TITLE} fullScreen={isPhone} onRequestClose={onRequestClose}>
      <p className="tdialog-sub">{T.candidateName(candidate)}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
        noValidate
      >
        <MethodField id={`${idBase}-method`} label={T.PAID_BY} value={state.values.method} methods={METHODS} readOnly={readOnly} autoFocus onChange={(method) => onChange({ method })} />
        <MoneyField
          id={`${idBase}-amount`}
          label={T.AMOUNT}
          value={state.values.amount}
          readOnly={readOnly}
          error={check.amountError}
          onChange={(amount) => {
            onChange({ amount });
            onTouch('amount');
          }}
        />
        <DateField
          id={`${idBase}-date`}
          label={T.DATE_PAID}
          value={state.values.paidOn}
          today={today}
          min={state.minDate}
          readOnly={readOnly}
          error={check.dateError}
          isPhone={isPhone}
          onChange={(paidOn) => {
            onChange({ paidOn });
            onTouch('paidOn');
          }}
        />
        <p className="field-hint">{T.EDIT_PAYMENT_HINT}</p>
        <Footer saving={state.saving} canSave={check.canSave} note={state.note} isPhone={isPhone} onCancel={onCancel} />
      </form>
    </Dialog>
  );
}

// ===== Record refund (admins, an overpaid row, G1) =====
export function RefundDialog({ state, candidate, today, isPhone, onChange, onTouch, onSave, onCancel, onRequestClose }) {
  const idBase = `star-refund-${state.key}`;
  const cap = state.overpaidCents;
  const check = checkRecordPayment(state, today, cap);
  const readOnly = state.saving;
  const amountError = state.fieldNote ?? check.amountError;
  return (
    <Dialog title={T.RECORD_REFUND_TITLE} fullScreen={isPhone} onRequestClose={onRequestClose}>
      <p className="tdialog-sub">{T.refundSub(T.candidateName(candidate), candidate.paidCents, cap)}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
        noValidate
      >
        <MethodField id={`${idBase}-method`} label={T.REFUNDED_BY} value={state.values.method} methods={REFUND_METHODS} readOnly={readOnly} autoFocus onChange={(method) => onChange({ method })} />
        <MoneyField
          id={`${idBase}-amount`}
          label={T.AMOUNT}
          value={state.values.amount}
          readOnly={readOnly}
          error={amountError}
          hint={T.refundUpTo(cap)}
          onChange={(amount) => {
            onChange({ amount, fieldNote: null });
            onTouch('amount');
          }}
        />
        <DateField
          id={`${idBase}-date`}
          label={T.DATE_REFUNDED}
          value={state.values.paidOn}
          today={today}
          min={state.minDate}
          readOnly={readOnly}
          error={check.dateError}
          hint={T.refundDateHint(state.minDate)}
          isPhone={isPhone}
          onChange={(paidOn) => {
            onChange({ paidOn });
            onTouch('paidOn');
          }}
        />
        <p className="field-hint">{T.refundAfter(candidate.paidCents, candidate.paidCents - cap)}</p>
        <Footer saving={state.saving} canSave={check.canSave && !state.fieldNote} note={state.note} isPhone={isPhone} onCancel={onCancel} />
      </form>
    </Dialog>
  );
}

// ===== Change how they'll pay (G16) =====
export function PayingByDialog({ state, candidate, isPhone, onChange, onSave, onCancel, onRequestClose }) {
  const idBase = `star-paying-${state.key}`;
  const canSave = !state.saving && !state.blocked;
  return (
    <Dialog title={T.CHANGE_PAYING_BY_TITLE} fullScreen={isPhone} onRequestClose={onRequestClose}>
      <p className="tdialog-sub">{T.changePayingBySub(T.candidateName(candidate))}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (canSave) onSave();
        }}
        noValidate
      >
        <MethodField id={`${idBase}-method`} label={T.PAYING_BY_LABEL} value={state.values.payingBy} methods={METHODS} readOnly={state.saving} autoFocus onChange={(payingBy) => onChange({ payingBy })} />
        <Footer saving={state.saving} canSave={canSave} note={state.note} isPhone={isPhone} onCancel={onCancel} />
      </form>
    </Dialog>
  );
}
