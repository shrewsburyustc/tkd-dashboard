// PaymentDialogs.jsx — the two small payment dialogs of a camper's ⋯ menu (Payments tab).
// Why it exists: copied and adapted from Color Belt's built PaymentDialogs.jsx (contract §6.1:
// "copy and adapt"). Mark paid is ONE click; these two are the corrections:
//   PayingByDialog    "Change how they'll pay" — Cash / Check / Card before paying (staff and
//                     admins). Mark paid then records that method.
//   EditPaymentDialog "Edit payment" (admins) — fix a recorded payment's method, amount or date.
//                     The database keeps the old one (a reversal + a new payment, §1.14).
// The differences from Color Belt: a camper can cost up to $2,000 (not $1,000), and the values
// live in the dialog itself (the camp page passes what it needs and gets the answer back).
// Small centered dialogs; full screen on phones.
import { useId, useState } from 'react';
import { IconCheck } from '@tabler/icons-react';
import Dialog from '../../components/Dialog.jsx';
import Notice from '../../components/Notice.jsx';
import { MAX_CAMPER_CENTS, PAYING_BY, isIsoDate } from '../../lib/camps/campRules.js';
import ChoiceGroup from '../testing/events/ChoiceGroup.jsx';
import * as T from './text.js';

const NOTES = {
  UNSAVED: T.UNSAVED,
  STALE_DIALOG: T.STALE_DIALOG,
  NOT_ALLOWED: T.ROSTER_NOT_ALLOWED,
  INVALID_DIALOG: T.INVALID_DIALOG,
  SAVE_FAILED: T.SAVE_FAILED,
  ALREADY_PAID: T.ALREADY_PAID_DIALOG,
  SCHOOL: T.SCHOOL_REFUSED,
};
const BLOCKING = ['STALE_DIALOG', 'NOT_ALLOWED', 'ALREADY_PAID'];
const PHONE_DISCARD = ['UNSAVED', 'STALE_DIALOG', 'NOT_ALLOWED'];

// The database status of a failed save → which note shows.
export function noteFor(status) {
  if (status === 'not_allowed') return 'NOT_ALLOWED';
  if (status === 'stale' || status === 'not_found' || status === 'withdrawn') return 'STALE_DIALOG';
  if (status === 'already_paid') return 'ALREADY_PAID';
  if (status === 'invalid_school') return 'SCHOOL'; // { status:'invalid', field:'school' } (review L4)
  if (status === 'invalid') return 'INVALID_DIALOG';
  return 'SAVE_FAILED';
}

// Reads a payment amount: whole dollars, $1 to $2,000 (Color Belt's money rule, camp limit).
function parseAmount(text) {
  let s = String(text ?? '').trim();
  if (s.startsWith('$')) s = s.slice(1);
  s = s.trim().replace(/,/g, '');
  if (s === '') return { problem: 'empty' };
  let dollars;
  if (/^\d+$/.test(s)) dollars = Number(s);
  else if (/^\d+\.0{1,2}$/.test(s)) dollars = Number(s.split('.')[0]);
  else if (/^\d+\.\d{1,2}$/.test(s)) return { problem: 'notWhole' };
  else return { problem: 'notNumber' };
  if (dollars * 100 > MAX_CAMPER_CENTS) return { problem: 'tooHighCamp' };
  return { cents: dollars * 100 };
}

function Footer({ saving, note, isPhone, canSave, onCancel }) {
  const saveButton = (
    <button type="submit" className={`btn btn-primary${isPhone ? ' btn-block' : ''}${canSave ? '' : ' is-unavailable'}`} aria-disabled={canSave ? undefined : 'true'}>
      <IconCheck size={16} aria-hidden="true" />
      {saving ? T.SAVING : T.SAVE}
    </button>
  );
  const noteBlock = note && (
    <div className="tdialog-note">
      <Notice>
        {isPhone && note === 'STALE_DIALOG' ? T.STALE_DIALOG_PHONE : NOTES[note]}
        {isPhone && PHONE_DISCARD.includes(note) && (
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
// onSave(payingBy) → Promise<status>; the page shows the toast and reloads on 'ok'.
export function PayingByDialog({ name, initial, isPhone, onSave, onClose }) {
  const idBase = useId();
  const [payingBy, setPayingBy] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState(null);
  const blocked = BLOCKING.includes(note);
  const canSave = !saving && !blocked;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSave) return;
    if (payingBy === initial) {
      onClose();
      return;
    }
    setSaving(true);
    setNote(null);
    const status = await onSave(payingBy);
    setSaving(false);
    if (status !== 'ok' && status !== 'no_access') setNote(noteFor(status));
  }
  function requestClose() {
    if (saving) return;
    if (payingBy === initial || blocked) onClose();
    else setNote('UNSAVED');
  }

  return (
    <Dialog title={T.CHANGE_PAYING_BY_TITLE} fullScreen={isPhone} onRequestClose={requestClose}>
      <p className="tdialog-sub">{T.changePayingBySub(name)}</p>
      <form onSubmit={handleSubmit} noValidate>
        <div className="field field--last">
          <span id={`${idBase}-label`} className="field-label">
            {T.PAYING_BY_LABEL}
          </span>
          <div>
            <ChoiceGroup
              autoFocus
              labelId={`${idBase}-label`}
              value={payingBy}
              readOnly={saving}
              options={PAYING_BY.map((key) => ({ key, label: T.payingByText(key) }))}
              onChange={(next) => {
                setPayingBy(next);
                if (note && !BLOCKING.includes(note)) setNote(null);
              }}
            />
          </div>
        </div>
        <Footer saving={saving} note={note} isPhone={isPhone} canSave={canSave} onCancel={() => !saving && onClose()} />
      </form>
    </Dialog>
  );
}

// ----- Edit payment (admins) -----
// payment: { id, method, amountCents, paidOn, school } · today: the newest allowed date
// onSave({ method, amountCents, paidOn, school }) → Promise<status>
// "Paid at" (v0.707): the school whose Daily report has the payment — it can be corrected here.
export function EditPaymentDialog({ name, payment, today, isPhone, onSave, onClose }) {
  const idBase = useId();
  const start = { method: payment.method, amount: String(payment.amountCents / 100), paidOn: payment.paidOn, school: payment.school ?? null };
  const [values, setValues] = useState(start);
  const [touched, setTouched] = useState({});
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState(null);
  const blocked = BLOCKING.includes(note);
  const dirty = values.method !== start.method || values.amount !== start.amount || values.paidOn !== start.paidOn || values.school !== start.school;

  const parsed = parseAmount(values.amount);
  let amountError = null;
  if (parsed.problem === 'tooHighCamp') amountError = T.AMOUNT_TOO_HIGH;
  else if (parsed.problem) {
    if (parsed.problem !== 'empty' || touched.amount || tried) amountError = T.priceProblemText(parsed.problem);
  } else if (parsed.cents <= 0) amountError = T.AMOUNT_ZERO;
  const dateOk = isIsoDate(values.paidOn) && (!today || values.paidOn <= today);
  const dateError = !dateOk && (touched.paidOn || tried) ? T.ENTER_DATE_PAID : null;
  const valid = !parsed.problem && parsed.cents > 0 && dateOk && values.school !== null;
  const canSave = valid && !saving && !blocked;

  function change(patch, field) {
    setValues((current) => ({ ...current, ...patch }));
    if (field) setTouched((current) => ({ ...current, [field]: true }));
    if (note && !BLOCKING.includes(note)) setNote(null);
  }
  async function handleSubmit(event) {
    event.preventDefault();
    setTried(true);
    if (!canSave) return;
    if (!dirty) {
      onClose();
      return;
    }
    setSaving(true);
    setNote(null);
    const status = await onSave({ method: values.method, amountCents: parsed.cents, paidOn: values.paidOn, school: values.school });
    setSaving(false);
    if (status !== 'ok' && status !== 'no_access') setNote(noteFor(status));
  }
  function requestClose() {
    if (saving) return;
    if (!dirty || blocked) onClose();
    else setNote('UNSAVED');
  }

  return (
    <Dialog title={T.EDIT_PAYMENT_TITLE} fullScreen={isPhone} onRequestClose={requestClose}>
      <p className="tdialog-sub">{T.editPaymentSub(name)}</p>
      <form onSubmit={handleSubmit} noValidate>
        <div className="field">
          <span id={`${idBase}-method`} className="field-label">
            {T.PAID_BY}
          </span>
          <div>
            <ChoiceGroup
              autoFocus
              labelId={`${idBase}-method`}
              value={values.method}
              readOnly={saving}
              options={PAYING_BY.map((key) => ({ key, label: T.payingByText(key) }))}
              onChange={(method) => change({ method })}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor={`${idBase}-amount`}>{T.AMOUNT}</label>
          <div className={`money ev-money${saving ? ' is-readonly' : ''}`}>
            <span className="money-prefix" aria-hidden="true">
              $
            </span>
            <input
              id={`${idBase}-amount`}
              className="money-input"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              readOnly={saving}
              value={values.amount}
              aria-invalid={amountError ? true : undefined}
              aria-describedby={amountError ? `${idBase}-amount-error` : undefined}
              onChange={(event) => change({ amount: event.target.value }, 'amount')}
            />
          </div>
          {amountError && <Notice id={`${idBase}-amount-error`}>{amountError}</Notice>}
        </div>
        <div className="field">
          <label htmlFor={`${idBase}-date`}>{T.DATE_PAID}</label>
          <input
            id={`${idBase}-date`}
            className="input ev-date"
            type="date"
            max={today || undefined}
            readOnly={saving}
            value={values.paidOn}
            aria-invalid={dateError ? true : undefined}
            aria-describedby={dateError ? `${idBase}-date-error` : undefined}
            onChange={(event) => change({ paidOn: event.target.value }, 'paidOn')}
          />
          {dateError && <Notice id={`${idBase}-date-error`}>{dateError}</Notice>}
        </div>
        <div className="field">
          <span id={`${idBase}-school`} className="field-label">
            {T.PAID_AT}
          </span>
          <div>
            <ChoiceGroup
              labelId={`${idBase}-school`}
              value={values.school}
              readOnly={saving}
              options={[
                { key: 'worcester', label: T.schoolName('worcester') },
                { key: 'shrewsbury', label: T.schoolName('shrewsbury') },
              ]}
              onChange={(school) => change({ school })}
            />
          </div>
        </div>
        <p className="field-hint">{T.EDIT_PAYMENT_HINT}</p>
        <Footer saving={saving} note={note} isPhone={isPhone} canSave={canSave} onCancel={() => !saving && onClose()} />
      </form>
    </Dialog>
  );
}
