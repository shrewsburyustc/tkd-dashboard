// RefundDialog.jsx — Record refund: money handed back to a family that paid more than the total
// (rulebook v0.743, picture 22; carries out v1.039 and v1.040 for Camps; migration 0039).
// Why it exists: when Edit details takes days or extras off after paying, Camper detail shows "Paid
// $23 more than the total". An admin who hands that money back records it here (⋯ → Record refund;
// on touch screens Camper detail's More). It is saved as its OWN refund row, so the payment itself is
// never edited for it, and Finance shows it on the day the money went back.
// The box is Star testing's Record refund (StarPaymentDialogs.jsx RefundDialog, Star's v0.166 /
// v0.172) with Camps' words:
//   "Chloe Martin · paid $315 · $23 overpaid"
//   Refunded by    Cash | Check (Cash first; no Card — money goes back in cash or by check)
//   Amount         filled in with what is overpaid, "Up to $23, the amount overpaid." Whole
//                  dollars, like Edit payment and Star's box ("23" or "23.00"; "23.50" gets "Enter an
//                  amount in whole dollars, like 23."). More than what is overpaid — however large —
//                  "Can’t be more than the $23 overpaid." takes the hint's place and Save grays; $0
//                  and anything that isn't an amount have their own words (text.js).
//   After a partial refund the box opens again for the rest (v0.744): "paid" is what stands now.
//   Date refunded  today. The calendar allows the sign-up day … today; its gray line says so.
//   "The $315 payment stays in the history. Afterwards the row reads “Paid”." ("The 2 payments
//                  ($315) stay …" when more than one payment stands.)
//   Cancel · Save — Camps' Footer (PaymentDialogs.jsx): on phones full screen with ← and a
//   full-width Save, the amber note above it.
// Saving works like Camps' Edit payment: the fields are read-only while it saves; a refused or failed
// save keeps the box open with its amber note (notes that saving again can't fix gray Save); Esc / ←
// with changes says "Unsaved changes …" first. The database's answers that point at one field show
// under that field until it is changed (Save grays meanwhile): refund_too_large while something is
// still overpaid → that amount's words under Amount (Star's); { status:'invalid', field:'date' } →
// "Pick a day from Mar 4 to today." under Date refunded. Nothing overpaid any more → the note under
// the buttons, and Save grays.
// What was typed lives in the CAMP PAGE's dialog state (`form`, changed through `onForm`), not in
// this box: locking the screen stops drawing the box until the PIN, and its own state would start
// over (Star's CandidatesTab keeps its dialogs' values the same way). refundForm() makes the start.
// It is never open while Hide private details is on (the camp page closes it when the switch turns on).
//
// Props: name ("Chloe Martin"), paidCents (what the camper paid, net), paymentsCents and
//        paymentCount (the payments that stand, added up / how many), signedUpOn 'YYYY-MM-DD' (the
//        first day allowed), today, isPhone, form, onForm(patch | (form) => patch),
//        onSave({ method, amountCents, refundedOn }) → Promise<the database's answer, { status,
//        field?, overpaidCents? }>, onClose()
import { useId } from 'react';
import ChoiceGroup from '../../components/ChoiceGroup.jsx';
import DatePicker from '../../components/DatePicker.jsx';
import Dialog from '../../components/Dialog.jsx';
import Notice from '../../components/Notice.jsx';
import { centsToInputText } from '../../lib/money.js';
import { isIsoDate, parseRefundAmount, yearsAround } from '../../lib/camps/campRules.js';
import { Footer, isBlockingNote, noteFor } from './PaymentDialogs.jsx';
import * as T from './text.js';

// Money goes back in cash or by check (the database refuses anything else for a refund).
const REFUND_METHODS = ['cash', 'check'];

// The box's starting form (v0.743 (2)): the whole amount overpaid, Cash, today. The camp page keeps it.
//   values / start  { method, amount (as typed), refundedOn }   touched, tried (Save was pressed)
//   saving, note    the note under the buttons (a PaymentDialogs code, e.g. 'SAVE_FAILED')
//   cap             the most that may go back: what was overpaid at opening, or the newer amount
//                   a refund_too_large answer brought
//   amountNote / dateNote   the database's words for one field, shown until that field changes
export function refundForm(overpaidCents, today) {
  const start = { method: 'cash', amount: centsToInputText(overpaidCents), refundedOn: today };
  return { start, values: start, touched: {}, tried: false, saving: false, note: null, cap: overpaidCents, amountNote: null, dateNote: null };
}

export default function RefundDialog({ name, paidCents, paymentsCents, paymentCount, signedUpOn, today, isPhone, form, onForm, onSave, onClose }) {
  const idBase = useId();
  const { start, values, touched, tried, saving, note, cap, amountNote, dateNote } = form;
  const blocked = isBlockingNote(note);
  const dirty = values.method !== start.method || values.amount !== start.amount || values.refundedOn !== start.refundedOn;

  // The amount's message: nothing typed (only once touched or after pressing Save) or not an amount ·
  // $0 · more than what is overpaid (however large — the cap is the amount overpaid).
  const parsed = parseRefundAmount(values.amount);
  let amountError = null;
  if (parsed.problem === 'tooBig') amountError = T.refundTooLarge(cap);
  else if (parsed.problem) {
    if (parsed.problem !== 'empty' || touched.amount || tried) amountError = T.REFUND_AMOUNT_PROBLEM;
  } else if (parsed.cents <= 0) amountError = T.REFUND_AMOUNT_ZERO;
  else if (parsed.cents > cap) amountError = T.refundTooLarge(cap);
  const amountMessage = amountNote ?? amountError;
  // The date: not before the sign-up day, not after today (the calendar grays the others). No date
  // → "Enter the date refunded."; a date that is there but out of range (e.g. the day changed while
  // the box was open) → "Pick a day from [sign-up day] to today." (the database's words too).
  const hasDate = isIsoDate(values.refundedOn);
  const dateOk = hasDate && (!today || values.refundedOn <= today) && (!signedUpOn || values.refundedOn >= signedUpOn);
  const dateProblem = !hasDate ? T.ENTER_DATE_REFUNDED : signedUpOn ? T.refundDateRange(signedUpOn) : T.ENTER_DATE_REFUNDED;
  const dateMessage = dateNote ?? (!dateOk && (touched.refundedOn || tried || hasDate) ? dateProblem : null);
  const valid = !parsed.problem && parsed.cents > 0 && parsed.cents <= cap && dateOk && REFUND_METHODS.includes(values.method);
  const canSave = valid && !amountNote && !dateNote && !saving && !blocked;

  // A change: the value, "touched", and away go a note that saving again could fix and the
  // database's words for that field.
  function change(patch, field) {
    onForm((f) => ({
      values: { ...f.values, ...patch },
      touched: field ? { ...f.touched, [field]: true } : f.touched,
      note: f.note && !isBlockingNote(f.note) ? null : f.note,
      amountNote: field === 'amount' ? null : f.amountNote,
      dateNote: field === 'refundedOn' ? null : f.dateNote,
    }));
  }
  async function handleSubmit(event) {
    event.preventDefault();
    onForm({ tried: true });
    if (!canSave) return;
    // (No "nothing changed" shortcut, unlike Edit payment: the box opens on a refund ready to save.)
    onForm({ saving: true, note: null });
    const result = await onSave({ method: values.method, amountCents: parsed.cents, refundedOn: values.refundedOn });
    const status = result?.status ?? 'error';
    // (After 'ok' the page has closed the box: onForm then changes nothing.)
    if (status === 'ok' || status === 'no_access') onForm({ saving: false });
    else if (status === 'refund_too_large') {
      const left = Number.isInteger(result.overpaidCents) ? result.overpaidCents : 0;
      onForm(left > 0 ? { saving: false, cap: left, amountNote: T.refundTooLarge(left) } : { saving: false, note: 'NOTHING_OVERPAID' });
    } else if (status === 'invalid' && result.field === 'date' && signedUpOn) onForm({ saving: false, dateNote: T.refundDateRange(signedUpOn) });
    else if (status === 'invalid' && result.field === 'school') onForm({ saving: false, note: 'SCHOOL' }); // Edit payment's words
    else onForm({ saving: false, note: noteFor(status) });
  }
  function requestClose() {
    if (saving) return;
    if (!dirty || blocked) onClose();
    else onForm({ note: 'UNSAVED' });
  }

  return (
    <Dialog title={T.RECORD_REFUND_TITLE} fullScreen={isPhone} onRequestClose={requestClose}>
      <p className="tdialog-sub">{T.refundSub(name, paidCents, cap)}</p>
      <form onSubmit={handleSubmit} noValidate>
        <div className="field">
          <span id={`${idBase}-method`} className="field-label">
            {T.REFUNDED_BY}
          </span>
          <div>
            <ChoiceGroup
              autoFocus
              labelId={`${idBase}-method`}
              value={values.method}
              readOnly={saving}
              options={REFUND_METHODS.map((key) => ({ key, label: T.payingByText(key) }))}
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
              inputMode="decimal"
              autoComplete="off"
              readOnly={saving}
              value={values.amount}
              aria-invalid={amountMessage ? true : undefined}
              aria-describedby={`${idBase}-amount-msg`}
              onChange={(event) => change({ amount: event.target.value }, 'amount')}
            />
          </div>
          {/* "Up to $23, the amount overpaid." — or, in its place, what is wrong (Star's MoneyField) */}
          {amountMessage ? (
            <Notice id={`${idBase}-amount-msg`}>{amountMessage}</Notice>
          ) : (
            <p id={`${idBase}-amount-msg`} className="field-hint">
              {T.refundUpTo(cap)}
            </p>
          )}
        </div>
        <div className="field">
          {/* Date refunded: the dashboard's own calendar (Star's shared DatePicker, as Edit payment's).
              Days before the sign-up day and after today are gray; the calendar's gray line says why. */}
          <span id={`${idBase}-date-label`} className="field-label">
            {T.DATE_REFUNDED}
          </span>
          <DatePicker
            id={`${idBase}-date`}
            label={T.DATE_REFUNDED}
            value={values.refundedOn}
            today={today}
            min={signedUpOn || null}
            max={today || null}
            years={yearsAround(today, [signedUpOn, values.refundedOn], false)}
            hint={signedUpOn ? T.refundDateHint(signedUpOn) : undefined}
            disabled={saving}
            invalid={Boolean(dateMessage)}
            describedBy={dateMessage ? `${idBase}-date-error` : undefined}
            inline={isPhone}
            onChange={(iso) => change({ refundedOn: iso }, 'refundedOn')}
          />
          {dateMessage && <Notice id={`${idBase}-date-error`}>{dateMessage}</Notice>}
        </div>
        <p className="field-hint">{T.refundAfter(paymentsCents, paymentCount)}</p>
        <Footer saving={saving} note={note} isPhone={isPhone} canSave={canSave} onCancel={() => !saving && onClose()} />
      </form>
    </Dialog>
  );
}
