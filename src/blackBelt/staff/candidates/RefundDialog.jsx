// RefundDialog.jsx — "Record refund" (admins only).
// Why it exists: approved mockups Candidates 5 and 9, contract CONTRACT-0016-B2 §3.5. Opened from a
// payment line's ⋯, or from the roster row's ⋯ as "Record refund · $50 overpaid" (and on Removed
// rows that paid something). "Grace Owens · In full · paid $920 of $870", amber "Overpaid $50" when
// overpaid; Amount (starts with the overpaid amount), Method Cash · Check · Card, Note; the hint
// "Fees are non-refundable. … It can't be more than $920 (what's been paid). It counts today."
// A refund is its own line (never a change to a payment). It can't be more than what has been
// paid: the screen refuses it first, the database too (refund_too_large).
// Save → toast "Refund recorded · $50 · Grace Owens · Undo".
import Dialog from '../../../components/Dialog.jsx';
import { AmountField, FailedBanner, Footer, MethodField, PrimaryButton, TextField } from './dialogParts.jsx';
import { ICONS } from './icons.js';
import { paymentErrors } from './RecordPaymentDialog.jsx';
import * as T from '../text.js';

export default function RefundDialog({ state, isPhone, onChange, onSave, onCancel, onRequestClose }) {
  const { data, values: v } = state;
  const c = data.candidate;
  const m = data.money;
  const errors = paymentErrors(state, { needTicks: false, maxCents: m.paidCents });
  const ro = state.saving;
  const Warn = ICONS.warn;

  return (
    <Dialog title={T.REFUND_TITLE} size="small" fullScreen={isPhone} onRequestClose={onRequestClose}>
      <p className="tdialog-sub">{T.refundSub(T.candidateName(c), c.plan?.name ?? '', m.paidCents, m.totalDueCents)}</p>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <FailedBanner state={state} onRetry={onSave} />
        {m.overpaidCents > 0 && (
          <p className="bb-amber-line">
            <Warn size={16} aria-hidden="true" />
            <span>{T.overpaidLine(m.overpaidCents)}</span>
          </p>
        )}
        <AmountField value={v.amount} error={errors.amount} readOnly={ro} autoFocus onChange={(amount) => onChange({ amount })} />
        <MethodField value={v.method} error={errors.method} readOnly={ro} onChange={(method) => onChange({ method })} />
        <TextField label={T.NOTE_OPTIONAL} value={v.note} error={errors.note} readOnly={ro} onChange={(note) => onChange({ note })} />
        <p className="field-hint">{T.refundHint(m.paidCents)}</p>
        <Footer state={state} isPhone={isPhone} onCancel={onCancel} divider primary={<PrimaryButton state={state} isPhone={isPhone} label={T.REFUND_TITLE} Icon={ICONS.save} />} />
      </form>
    </Dialog>
  );
}
