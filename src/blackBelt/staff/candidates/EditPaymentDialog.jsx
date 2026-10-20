// EditPaymentDialog.jsx — "Edit payment" (admins only, from a payment line's ⋯ in the detail).
// Why it exists: approved mockup Candidates 5, contract CONTRACT-0016-B2 §3.5. "Alex Kim · Payment 2
// · recorded Mar 27 by Staff"; For (the same checklist as Record payment, ticked with the line's
// items — OP-B4), Amount, Method and Note filled in from the line; Reason for the change
// (required); "The date (Mar 27) stays. The old and new values go in the change log."
// The database never changes a payment row: it adds an undo of the old one and the new one, both
// on the old date (append-only, Star v0.166). Save → toast "Payment changed · Undo".
import Dialog from '../../../components/Dialog.jsx';
import { AmountField, FailedBanner, Footer, MethodField, PrimaryButton, TextField } from './dialogParts.jsx';
import { ICONS } from './icons.js';
import ItemChecklist from './ItemChecklist.jsx';
import { paymentErrors } from './RecordPaymentDialog.jsx';
import { lineWords } from './CandidateDialog.jsx';
import * as T from '../text.js';

export default function EditPaymentDialog({ state, isPhone, onChange, onTicks, onSave, onCancel, onRequestClose }) {
  const { data, line, values: v } = state;
  const c = data.candidate;
  const errors = paymentErrors(state, { needReason: true });
  const ro = state.saving;
  const what = lineWords(line, data.payments, c.plan).what;

  return (
    <Dialog title={T.EDIT_PAYMENT_TITLE} size="medium" fullScreen={isPhone} onRequestClose={onRequestClose}>
      <p className="tdialog-sub">{T.editPaymentSub(T.candidateName(c), what, line.paidOn, line.recordedByName)}</p>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <FailedBanner state={state} onRetry={onSave} />
        <ItemChecklist items={data.money.items ?? []} ticks={v.ticks} onChange={onTicks} showAll label={T.FOR_LABEL} error={errors.ticks} readOnly={ro} />
        <AmountField value={v.amount} error={errors.amount} readOnly={ro} onChange={(amount) => onChange({ amount })} />
        <MethodField value={v.method} error={errors.method} readOnly={ro} onChange={(method) => onChange({ method })} />
        <TextField label={T.NOTE_OPTIONAL} placeholder={T.NOTE_PLACEHOLDER} value={v.note} error={errors.note} readOnly={ro} onChange={(note) => onChange({ note })} />
        <TextField label={T.REASON} placeholder={T.REASON_PLACEHOLDER} value={v.reason} error={errors.reason} readOnly={ro} onChange={(reason) => onChange({ reason })} />
        <p className="field-hint">{T.editPaymentHint(line.paidOn)}</p>
        <Footer state={state} isPhone={isPhone} onCancel={onCancel} primary={<PrimaryButton state={state} isPhone={isPhone} label={T.SAVE} Icon={ICONS.save} />} />
      </form>
    </Dialog>
  );
}
