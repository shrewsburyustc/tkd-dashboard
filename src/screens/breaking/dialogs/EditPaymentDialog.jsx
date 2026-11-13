// EditPaymentDialog.jsx — Edit payment (admins): fix a recorded payment's way, amount, date or school.
// Why it exists: a wrong way to pay, a typo in the amount or a payment taken at the other desk has to be corrected
// by an admin. Copied from Camps' Edit payment (src/screens/camps/PaymentDialogs.jsx, rulebook v0.727 / v0.707 /
// design review L4). The database keeps the old payment (a reversal row) and writes a corrected one, so Finance's
// history stays honest; this box only asks for the four values (brk_edit_payment).
//   Paid by   Cash | Check | Card      Amount  dollars and cents, $0.01 to $10,000
//   Date paid today or earlier (the calendar grays later days)      Paid at  Worcester | Shrewsbury (the school
//   whose Daily report has the payment; it starts on the payment's own school)
// Answers: 'refund_stands' → "Undo the refund first."; 'stale' (already edited or undone) → the shared "someone else
// changed this" note; 'invalid' with field school → its own words. Nothing changed + Save just closes.
//
// Props: registration (roster row: for the name), payment ({ id, method, amountCents, paidOn, school }),
//   deviceLocation (the fallback school when the payment has none), isPhone, onClose(),
//   onDone({ kind: 'payment_edited', name }), onNoAccess(), onRefreshProfile(), showToast / clearToast.
import { useId, useState } from 'react';
import ChoiceGroup from '../../../components/ChoiceGroup.jsx';
import DatePicker from '../../../components/DatePicker.jsx';
import Dialog from '../../../components/Dialog.jsx';
import Notice from '../../../components/Notice.jsx';
import { editPayment, schoolCode } from '../../../lib/breaking/breakingApi.js';
import { centsToDollarsText, dollarsToCents, PAYING_BY } from '../../../lib/breaking/breakingRules.js';
import { isIsoDate, schoolToday, yearsAround } from '../../../lib/breaking/schoolToday.js';
import * as T from '../../../lib/breaking/text/dialogs.js';
import DialogFooter, { NOTES, noteForStatus } from './DialogFooter.jsx';
import '../../../styles/breaking-dialogs.css';

const MAX_PAYMENT_CENTS = 1000000;
const dollarText = (cents) => (cents % 100 === 0 ? String(cents / 100) : centsToDollarsText(cents));

export default function EditPaymentDialog({ registration, payment, deviceLocation, isPhone = false, onClose, onDone, onNoAccess, onRefreshProfile, showToast }) {
  const idBase = useId();
  const today = schoolToday();
  const name = `${registration.firstName} ${registration.lastName}`;
  const start = { method: payment.method, amount: dollarText(payment.amountCents), paidOn: payment.paidOn, school: payment.school ?? (schoolCode(deviceLocation) || null) };
  const [values, setValues] = useState(start);
  const [touched, setTouched] = useState({});
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState(null);
  const blocked = Boolean(note?.blocking);
  const dirty = Object.keys(start).some((key) => values[key] !== start[key]);

  const cents = dollarsToCents(values.amount);
  let amountError = null;
  if (cents === null) {
    if (values.amount.trim() !== '' || touched.amount || tried) amountError = T.AMOUNT_PROBLEM;
  } else if (cents <= 0) amountError = T.AMOUNT_ZERO;
  else if (cents > MAX_PAYMENT_CENTS) amountError = T.AMOUNT_TOO_HIGH;
  const dateOk = isIsoDate(values.paidOn) && values.paidOn <= today;
  const dateError = !dateOk && (touched.paidOn || tried) ? T.ENTER_DATE_PAID : null;
  const valid = cents !== null && cents > 0 && cents <= MAX_PAYMENT_CENTS && dateOk && Boolean(values.school);
  const canSave = valid && !saving && !blocked;

  function change(patch, field) {
    setValues((v) => ({ ...v, ...patch }));
    if (field) setTouched((t) => ({ ...t, [field]: true }));
    if (note && !note.blocking) setNote(null);
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
    const result = await editPayment(payment.id, { method: values.method, amountCents: cents, paidOn: values.paidOn, school: values.school });
    setSaving(false);
    if (result.status === 'ok') {
      showToast?.(T.paymentEditedToast(name), { icon: false });
      onDone?.({ kind: 'payment_edited', name });
      onClose();
      return;
    }
    if (result.status === 'no_access') {
      onNoAccess?.();
      return;
    }
    if (result.status === 'not_allowed') onRefreshProfile?.();
    if (result.status === 'refund_stands') setNote({ text: T.UNDO_REFUND_FIRST, blocking: true, discard: true });
    else if (result.status === 'invalid' && result.field === 'school') setNote({ text: T.PAYMENT_SCHOOL_REFUSED });
    else setNote(noteForStatus(result.status));
  }
  function requestClose() {
    if (saving) return;
    if (!dirty || blocked) onClose();
    else setNote(NOTES.unsaved);
  }

  return (
    <Dialog title={T.EDIT_PAYMENT_TITLE} fullScreen={isPhone} onRequestClose={requestClose} busy={saving}>
      <p className="tdialog-sub">{T.editPaymentSub(name)}</p>
      <form onSubmit={handleSubmit} noValidate>
        <div className="field">
          <span id={`${idBase}-method`} className="field-label">
            {T.PAID_BY}
          </span>
          <div>
            <ChoiceGroup autoFocus labelId={`${idBase}-method`} value={values.method} readOnly={saving} options={PAYING_BY.map((key) => ({ key, label: T.PAYING_BY_TEXT[key] }))} onChange={(method) => change({ method })} />
          </div>
        </div>
        <div className="field">
          <label htmlFor={`${idBase}-amount`}>{T.AMOUNT}</label>
          <div className={`money ev-money${saving ? ' is-readonly' : ''}`}>
            <span className="money-prefix" aria-hidden="true">
              $
            </span>
            <input id={`${idBase}-amount`} className="money-input" type="text" inputMode="decimal" autoComplete="off" readOnly={saving} value={values.amount}
              aria-invalid={amountError ? true : undefined} aria-describedby={amountError ? `${idBase}-amount-error` : undefined}
              onChange={(e) => change({ amount: e.target.value }, 'amount')} />
          </div>
          {amountError && <Notice id={`${idBase}-amount-error`}>{amountError}</Notice>}
        </div>
        <div className="field">
          <span className="field-label">{T.DATE_PAID}</span>
          <DatePicker id={`${idBase}-date`} label={T.DATE_PAID} value={values.paidOn} today={today} max={today} years={yearsAround(today, [values.paidOn, payment.paidOn])} hint={T.FUTURE_DAYS_HINT}
            disabled={saving} invalid={Boolean(dateError)} describedBy={dateError ? `${idBase}-date-error` : undefined} inline={isPhone}
            onChange={(iso) => change({ paidOn: iso }, 'paidOn')} />
          {dateError && <Notice id={`${idBase}-date-error`}>{dateError}</Notice>}
        </div>
        <div className="field">
          <span id={`${idBase}-school`} className="field-label">
            {T.PAID_AT}
          </span>
          <div>
            <ChoiceGroup labelId={`${idBase}-school`} value={values.school} readOnly={saving}
              options={[{ key: 'worcester', label: T.schoolName('worcester') }, { key: 'shrewsbury', label: T.schoolName('shrewsbury') }]} onChange={(school) => change({ school })} />
          </div>
        </div>
        <p className="field-hint">{T.EDIT_PAYMENT_HINT}</p>
        <DialogFooter saving={saving} note={note} isPhone={isPhone} canSave={canSave} onCancel={() => !saving && onClose()} />
      </form>
    </Dialog>
  );
}
