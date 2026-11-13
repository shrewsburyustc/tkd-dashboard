// RefundDialog.jsx — Record refund (admins): money handed back to a student who paid more than they owe.
// Why it exists: Board breaking copies Camps' Record refund (src/screens/camps/RefundDialog.jsx, rulebook v0.743,
// v1.039 / v1.040; contract CONTRACT-0051 §2 "refunds cash / check only, admins"). A refund is saved as its OWN
// payment row (a minus amount), so the original payment is never edited, and Finance shows it on the day the money
// went back, at THIS DEVICE's school (the desk that hands it back).
//   "Eli Park · paid $13 · $4 overpaid"
//   Refunded by   Cash | Check (no Card: money goes back in cash or by check)
//   Amount        filled in with what is overpaid, "Up to $4, the amount overpaid." Dollars and cents (board prices
//                 have cents). More than what is overpaid gets "Can't be more than the $4 overpaid.", $0 and
//                 anything that isn't an amount have their own words.
//   Date refunded today (the calendar allows no day after today)
// The database answers 'refund_too_large' (+ what is overpaid now): the amount's words change and the limit moves.
// Nothing overpaid any more → an amber note and Save grays. After a save the toast says "Refund recorded · $4 cash"
// with Undo (undoRefund); onDone tells the page to reload. Esc / back with changes asks "Unsaved changes…" first.
//
// Props: registration (roster row), deviceLocation ('Worcester' | 'Shrewsbury', the account menu's This device),
//   isPhone, onClose(), onDone({ kind: 'refund', paymentId, text, amountCents } | { kind: 'refund_undone' }),
//   onNoAccess(), onRefreshProfile(), showToast / clearToast.
import { useId, useState } from 'react';
import ChoiceGroup from '../../../components/ChoiceGroup.jsx';
import DatePicker from '../../../components/DatePicker.jsx';
import Dialog from '../../../components/Dialog.jsx';
import Notice from '../../../components/Notice.jsx';
import { recordRefund, schoolCode, undoRefund } from '../../../lib/breaking/breakingApi.js';
import { centsToDollarsText, dollarsToCents, owedCents, paidCents } from '../../../lib/breaking/breakingRules.js';
import { isIsoDate, schoolToday, yearsAround } from '../../../lib/breaking/schoolToday.js';
import * as T from '../../../lib/breaking/text/dialogs.js';
import DialogFooter, { NOTES, noteForStatus } from './DialogFooter.jsx';
import '../../../styles/breaking-dialogs.css';

const REFUND_METHODS = ['cash', 'check'];
const dollarText = (cents) => (cents % 100 === 0 ? String(cents / 100) : centsToDollarsText(cents));

export default function RefundDialog({ registration, deviceLocation, isPhone = false, onClose, onDone, onNoAccess, onRefreshProfile, showToast }) {
  const idBase = useId();
  const today = schoolToday();
  const name = `${registration.firstName} ${registration.lastName}`;
  const paid = paidCents(registration);
  const startCap = Math.max(0, paid - owedCents(registration));
  const [cap, setCap] = useState(startCap); // the most that may go back; a refund_too_large answer lowers it
  const [method, setMethod] = useState('cash');
  const [amount, setAmount] = useState(startCap > 0 ? dollarText(startCap) : '');
  const [refundedOn, setRefundedOn] = useState(today);
  const [touched, setTouched] = useState({});
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState(startCap > 0 ? null : { text: T.NOTHING_OVERPAID, blocking: true });
  const [amountNote, setAmountNote] = useState(null); // the database's words for the amount, until it changes
  const blocked = Boolean(note?.blocking);
  const startAmount = startCap > 0 ? dollarText(startCap) : '';
  const dirty = method !== 'cash' || amount !== startAmount || refundedOn !== today;

  // The amount's message: nothing typed (once touched or Save pressed) or not an amount · $0 · more than overpaid.
  const cents = dollarsToCents(amount);
  let amountError = null;
  if (cents === null) {
    if (amount.trim() !== '' || touched.amount || tried) amountError = T.REFUND_AMOUNT_PROBLEM;
  } else if (cents <= 0) amountError = T.REFUND_AMOUNT_ZERO;
  else if (cents > cap) amountError = T.refundTooLarge(cap);
  const amountMessage = amountNote ?? amountError;
  const dateOk = isIsoDate(refundedOn) && refundedOn <= today;
  const dateMessage = !dateOk && (touched.date || tried) ? T.ENTER_DATE_REFUNDED : null;
  const valid = cents !== null && cents > 0 && cents <= cap && dateOk && REFUND_METHODS.includes(method);
  const canSave = valid && !amountNote && !saving && !blocked;

  const school = schoolCode(deviceLocation) || registration.payments?.find((p) => p.school)?.school || '';

  function changed() {
    if (note && !note.blocking) setNote(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setTried(true);
    if (!canSave) return;
    setSaving(true);
    setNote(null);
    const result = await recordRefund(registration.id, registration.version, { method, amountCents: cents, refundedOn, school });
    setSaving(false);
    if (result.status === 'ok') {
      const text = T.refundedToast(cents, method);
      const paymentId = result.paymentId;
      showToast?.(text, {
        icon: false,
        action: {
          label: T.UNDO,
          // Not on the page's save line: the toast goes first, then this runs and says how it went.
          onAction: async () => {
            const undone = await undoRefund(paymentId);
            if (undone.status === 'ok') {
              showToast?.(T.UNDONE, { icon: false });
              onDone?.({ kind: 'refund_undone' });
            } else if (undone.status === 'no_access') onNoAccess?.();
            else showToast?.(undone.status === 'error' ? T.REFUND_UNDO_FAILED : T.REFUND_UNDO_REFUSED, { icon: false });
          },
        },
      });
      onDone?.({ kind: 'refund', paymentId, text, amountCents: cents });
      onClose();
      return;
    }
    if (result.status === 'no_access') {
      onNoAccess?.();
      return;
    }
    if (result.status === 'not_allowed') onRefreshProfile?.();
    if (result.status === 'refund_too_large') {
      const left = Number.isInteger(result.overpaidCents) ? result.overpaidCents : 0;
      if (left > 0) {
        setCap(left);
        setAmountNote(T.refundTooLarge(left));
      } else setNote({ text: T.NOTHING_OVERPAID, blocking: true });
      return;
    }
    if (result.status === 'invalid' && result.field === 'school') {
      setNote({ text: T.SCHOOL_REFUSED });
      return;
    }
    setNote(noteForStatus(result.status));
  }
  function requestClose() {
    if (saving) return;
    if (!dirty || blocked) onClose();
    else setNote(NOTES.unsaved);
  }

  return (
    <Dialog title={T.REFUND_TITLE} fullScreen={isPhone} onRequestClose={requestClose} busy={saving}>
      <p className="tdialog-sub">{T.refundSub(name, paid, startCap)}</p>
      <form onSubmit={handleSubmit} noValidate>
        <div className="field">
          <span id={`${idBase}-method`} className="field-label">
            {T.REFUNDED_BY}
          </span>
          <div>
            <ChoiceGroup autoFocus labelId={`${idBase}-method`} value={method} readOnly={saving} options={REFUND_METHODS.map((key) => ({ key, label: T.PAYING_BY_TEXT[key] }))}
              onChange={(next) => { setMethod(next); changed(); }} />
          </div>
        </div>
        <div className="field">
          <label htmlFor={`${idBase}-amount`}>{T.AMOUNT}</label>
          <div className={`money ev-money${saving ? ' is-readonly' : ''}`}>
            <span className="money-prefix" aria-hidden="true">
              $
            </span>
            <input id={`${idBase}-amount`} className="money-input" type="text" inputMode="decimal" autoComplete="off" readOnly={saving} value={amount}
              aria-invalid={amountMessage ? true : undefined} aria-describedby={`${idBase}-amount-msg`}
              onChange={(e) => { setAmount(e.target.value); setTouched((t) => ({ ...t, amount: true })); setAmountNote(null); changed(); }} />
          </div>
          {amountMessage ? (
            <Notice id={`${idBase}-amount-msg`}>{amountMessage}</Notice>
          ) : (
            <p id={`${idBase}-amount-msg`} className="field-hint">
              {T.refundUpTo(cap)}
            </p>
          )}
        </div>
        <div className="field">
          <span className="field-label">{T.DATE_REFUNDED}</span>
          <DatePicker id={`${idBase}-date`} label={T.DATE_REFUNDED} value={refundedOn} today={today} max={today} years={yearsAround(today, [refundedOn])} hint={T.FUTURE_DAYS_HINT}
            disabled={saving} invalid={Boolean(dateMessage)} describedBy={dateMessage ? `${idBase}-date-error` : undefined} inline={isPhone}
            onChange={(iso) => { setRefundedOn(iso); setTouched((t) => ({ ...t, date: true })); changed(); }} />
          {dateMessage && <Notice id={`${idBase}-date-error`}>{dateMessage}</Notice>}
        </div>
        {school && <p className="field-hint">{T.countsAt(T.schoolName(school))}</p>}
        <DialogFooter saving={saving} note={note} isPhone={isPhone} canSave={canSave} onCancel={() => !saving && onClose()} />
      </form>
    </Dialog>
  );
}
