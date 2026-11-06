// PaymentDialogs.jsx — the two small payment dialogs of a camper's ⋯ menu (Payments tab).
// Why it exists: copied and adapted from Color Belt's built PaymentDialogs.jsx (contract §6.1:
// "copy and adapt"). Mark paid is ONE click; these two are the corrections:
//   PayingByDialog    "Change how they'll pay" — Cash / Check / Card before paying (staff and
//                     admins). Mark paid then records that method.
//   EditPaymentDialog "Edit payment" (admins) — fix a recorded payment's method, amount or date.
//                     The database keeps the old one (a reversal + a new payment, §1.14).
// The differences from Color Belt: a camper can cost up to $10,000 (not $1,000; weekly pricing
// v0.717, was $2,000), and the camp page passes what each dialog needs and gets the answer back.
// What was typed (the form: values, touched fields, the note, "saving") lives in the CAMP PAGE's
// dialog state and changes through `onForm`, not inside the dialog: locking the screen stops drawing
// a dialog until the PIN, and its own state would start over (Star's CandidatesTab keeps its
// dialogs' values the same way). payingByForm() / editPaymentForm() make each one's start.
// Small centered dialogs; full screen on phones. Date paid uses the dashboard's own calendar
// (Star's shared DatePicker, rulebook v0.727 / design review C13), not the browser's date box.
// Record refund (RefundDialog.jsx, rulebook v0.743) ends with the same Footer and notes, so Footer,
// noteFor and isBlockingNote are shared from here. While a refund stands the database refuses Edit
// payment ('refund_stands'): its note says "Undo the refund first.".
import { useId } from 'react';
import { IconCheck } from '@tabler/icons-react';
import DatePicker from '../../components/DatePicker.jsx';
import Dialog from '../../components/Dialog.jsx';
import Notice from '../../components/Notice.jsx';
import { MAX_CAMPER_CENTS, PAYING_BY, isIsoDate, yearsAround } from '../../lib/camps/campRules.js';
import ChoiceGroup from '../../components/ChoiceGroup.jsx';
import * as T from './text.js';

const NOTES = {
  UNSAVED: T.UNSAVED,
  STALE_DIALOG: T.STALE_DIALOG,
  NOT_ALLOWED: T.ROSTER_NOT_ALLOWED,
  INVALID_DIALOG: T.INVALID_DIALOG,
  SAVE_FAILED: T.SAVE_FAILED,
  ALREADY_PAID: T.ALREADY_PAID_DIALOG,
  SCHOOL: T.SCHOOL_REFUSED,
  REFUND_STANDS: T.UNDO_REFUND_FIRST, // Edit payment while a refund stands (someone recorded one meanwhile)
  NOTHING_OVERPAID: T.NOTHING_OVERPAID, // Record refund when nothing is overpaid any more (Star's words)
};
// Notes that saving again can't fix: Save grays until the dialog is closed.
const BLOCKING = ['STALE_DIALOG', 'NOT_ALLOWED', 'ALREADY_PAID', 'REFUND_STANDS', 'NOTHING_OVERPAID'];
const PHONE_DISCARD = ['UNSAVED', 'STALE_DIALOG', 'NOT_ALLOWED', 'REFUND_STANDS', 'NOTHING_OVERPAID'];

// The database status of a failed save → which note shows.
export function noteFor(status) {
  if (status === 'not_allowed') return 'NOT_ALLOWED';
  if (status === 'stale' || status === 'not_found' || status === 'withdrawn') return 'STALE_DIALOG';
  if (status === 'already_paid') return 'ALREADY_PAID';
  if (status === 'refund_stands') return 'REFUND_STANDS'; // migration 0039
  if (status === 'invalid_school') return 'SCHOOL'; // { status:'invalid', field:'school' } (review L4)
  if (status === 'invalid') return 'INVALID_DIALOG';
  return 'SAVE_FAILED';
}
// Is this note one that saving again can't fix? (Record refund's dialog asks too.)
export const isBlockingNote = (note) => BLOCKING.includes(note);

// Reads a payment amount: whole dollars, $1 to $10,000 (Color Belt's money rule, camp limit).
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

// The bottom of these dialogs: Cancel and Save, with the amber note under them (phones: the note,
// then a full-width Save; a "Discard changes" link inside the note is the way out there).
export function Footer({ saving, note, isPhone, canSave, onCancel }) {
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
// The form's start (the camp page keeps it): the camper's Paying by now.
export const payingByForm = (initial) => ({ payingBy: initial, saving: false, note: null });
// form / onForm: the camp page's copy of what was picked (see the top of this file).
// onSave(payingBy) → Promise<status>; the page shows the toast and reloads on 'ok'.
export function PayingByDialog({ name, initial, isPhone, form, onForm, onSave, onClose }) {
  const idBase = useId();
  const { payingBy, saving, note } = form;
  const blocked = BLOCKING.includes(note);
  const canSave = !saving && !blocked;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSave) return;
    if (payingBy === initial) {
      onClose();
      return;
    }
    onForm({ saving: true, note: null });
    const status = await onSave(payingBy);
    // (After 'ok' the page has closed the dialog: onForm then changes nothing.)
    onForm(status !== 'ok' && status !== 'no_access' ? { saving: false, note: noteFor(status) } : { saving: false });
  }
  function requestClose() {
    if (saving) return;
    if (payingBy === initial || blocked) onClose();
    else onForm({ note: 'UNSAVED' });
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
              onChange={(next) => onForm((f) => ({ payingBy: next, note: f.note && !BLOCKING.includes(f.note) ? null : f.note }))}
            />
          </div>
        </div>
        <Footer saving={saving} note={note} isPhone={isPhone} canSave={canSave} onCancel={() => !saving && onClose()} />
      </form>
    </Dialog>
  );
}

// ----- Edit payment (admins) -----
// The form's start (the camp page keeps it): the payment as recorded.
//   values / start  { method, amount (as typed), paidOn, school }   touched, tried (Save was pressed)
//   saving, note    the note under the buttons (a code of NOTES above)
export function editPaymentForm(payment) {
  const start = { method: payment.method, amount: String(payment.amountCents / 100), paidOn: payment.paidOn, school: payment.school ?? null };
  return { start, values: start, touched: {}, tried: false, saving: false, note: null };
}
// payment: { id, method, amountCents, paidOn, school } · today: the newest allowed date
// form / onForm: the camp page's copy of what was typed (see the top of this file)
// onSave({ method, amountCents, paidOn, school }) → Promise<status>
// "Paid at" (v0.707): the school whose Daily report has the payment — it can be corrected here.
export function EditPaymentDialog({ name, payment, today, isPhone, form, onForm, onSave, onClose }) {
  const idBase = useId();
  const { start, values, touched, tried, saving, note } = form;
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
    onForm((f) => ({
      values: { ...f.values, ...patch },
      touched: field ? { ...f.touched, [field]: true } : f.touched,
      note: f.note && !BLOCKING.includes(f.note) ? null : f.note,
    }));
  }
  async function handleSubmit(event) {
    event.preventDefault();
    onForm({ tried: true });
    if (!canSave) return;
    if (!dirty) {
      onClose();
      return;
    }
    onForm({ saving: true, note: null });
    const status = await onSave({ method: values.method, amountCents: parsed.cents, paidOn: values.paidOn, school: values.school });
    // (After 'ok' the page has closed the dialog: onForm then changes nothing.)
    onForm(status !== 'ok' && status !== 'no_access' ? { saving: false, note: noteFor(status) } : { saving: false });
  }
  function requestClose() {
    if (saving) return;
    if (!dirty || blocked) onClose();
    else onForm({ note: 'UNSAVED' });
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
          {/* Date paid: the dashboard's own calendar (Star's shared DatePicker, rulebook v0.727).
              Days after today are gray and can't be picked (max = today), as the old box's max did. */}
          <span id={`${idBase}-date-label`} className="field-label">
            {T.DATE_PAID}
          </span>
          <DatePicker
            id={`${idBase}-date`}
            label={T.DATE_PAID}
            value={values.paidOn}
            today={today}
            max={today || null}
            years={yearsAround(today, [values.paidOn, payment.paidOn], false)}
            disabled={saving}
            invalid={Boolean(dateError)}
            describedBy={dateError ? `${idBase}-date-error` : undefined}
            inline={isPhone}
            onChange={(iso) => change({ paidOn: iso }, 'paidOn')}
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
