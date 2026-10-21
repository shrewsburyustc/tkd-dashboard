// RecordPaymentDialog.jsx — "Record payment" (staff and admins).
// Why it exists: approved mockup Candidates 4 (post-dated checks), contract CONTRACT-0016-B2 §3.4,
// rulebook v0.218. Top to bottom:
//   "Alex Kim · 1st Dan · Shrewsbury · 3 payments + Kukkiwon"
//   "Owes $970 · due today: $390 (payment 1 $290 + Kukkiwon $100)" in a gray box
//   For (tick one or more) — the unpaid items in a bordered list; what's due now is ticked
//   (ItemChecklist.jsx)
//   Amount — the ticked items' sum, refilled on every tick until someone types in it (OP-B6) —
//   and beside it Method Cash · Check · Card — nothing chosen at first (OP-B5)
//   Note (optional) "e.g. post-dated Apr 24"
//   "Counts as paid today, Sat, Mar 27, like every check handed in today."
//   Cancel · Save and record another · Save (phones: Save, then Save and record another)
// Save closes and shows "Payment recorded · $390 · Alex Kim · Undo" for 5 seconds. Save and record
// another shows the same toast and stays open on the next unpaid item, so three checks handed in
// together are three quick saves. No check date or number (v0.218).
import Dialog from '../../../components/Dialog.jsx';
import { dueNowItems, nextItems } from '../../../lib/blackBelt/rules.js';
import { paymentProblems } from './checks.js';
import { AmountField, AmountMethod, FailedBanner, Footer, MethodField, PrimaryButton, TextField } from './dialogParts.jsx';
import { ICONS } from './icons.js';
import ItemChecklist from './ItemChecklist.jsx';
import * as T from '../text.js';

// The words for the problems of a payment form (shared with Edit payment and Record refund).
export function paymentErrors(state, options) {
  if (!state.triedSave) return {};
  const { problems } = paymentProblems(state.values, options);
  return {
    ticks: problems.ticks ? T.ERR_TICK : null,
    amount: problems.amount ? T.ERR_AMOUNT[problems.amount] : problems.tooLarge ? T.refundTooLarge(options?.maxCents ?? 0) : null,
    method: problems.method ? T.ERR_METHOD : null,
    note: problems.note ? T.ERR_NOTE : null,
    reason: problems.reason === 'missing' ? T.ERR_REASON : problems.reason ? T.ERR_NOTE : null,
  };
}

export default function RecordPaymentDialog({ state, isPhone, today, onChange, onTicks, onSave, onCancel, onRequestClose }) {
  const { data, values: v } = state;
  const c = data.candidate;
  const money = data.money;
  const errors = paymentErrors(state);
  const ro = state.saving;
  const planName = c.plan?.name ?? '';

  const another = (
    <button
      type="button"
      className={`btn${isPhone ? ' btn-block' : ''}`}
      aria-disabled={ro || state.blocking ? 'true' : undefined}
      onClick={() => !ro && !state.blocking && onSave({ another: true })}
    >
      {T.SAVE_AND_ANOTHER}
    </button>
  );

  return (
    <Dialog title={T.RECORD_PAYMENT_TITLE} size="medium" fullScreen={isPhone} onRequestClose={onRequestClose}>
      <p className="tdialog-sub">{T.paymentSub(c, planName)}</p>
      <form
        key={state.key}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onSave({ another: false });
        }}
      >
        <FailedBanner state={state} onRetry={() => onSave({ another: false })} />
        <p className="bb-owes">{T.owesLine(money, dueNowItems(money, today), nextItems(money), today)}</p>
        <ItemChecklist items={money.items ?? []} ticks={v.ticks} onChange={onTicks} error={errors.ticks} readOnly={ro} />
        <AmountMethod>
          <AmountField value={v.amount} error={errors.amount} readOnly={ro} onChange={(amount) => onChange({ amount, amountTyped: true })} />
          <MethodField value={v.method} error={errors.method} readOnly={ro} onChange={(method) => onChange({ method })} />
        </AmountMethod>
        <TextField label={T.NOTE_OPTIONAL} placeholder={T.NOTE_PLACEHOLDER} value={v.note} error={errors.note} readOnly={ro} onChange={(note) => onChange({ note })} />
        <p className="field-hint bb-counts-today">{T.countsToday(today)}</p>
        <Footer state={state} isPhone={isPhone} onCancel={onCancel} extra={another} primary={<PrimaryButton state={state} isPhone={isPhone} label={T.SAVE} Icon={ICONS.save} />} />
      </form>
    </Dialog>
  );
}
