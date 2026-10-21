// EditPaymentDialog.jsx — "Edit payment" (admins only, from a payment line's ⋯ in the detail).
// Why it exists: approved mockup Candidates 5, contract CONTRACT-0016-B2 §3.5. "Alex Kim · Payment 2
// · recorded Mar 27 by Staff"; For (the same checklist as Record payment, ticked with the line's
// items — OP-B4), Amount, Method and Note filled in from the line; Reason for the change
// (required); "The date (Mar 27) stays. The old and new values go in the change log."
// The database never changes a payment row: it adds an undo of the old one and the new one, both
// on the old date (append-only, Star v0.166). Save → toast "Payment changed · Undo".
// Only the items the plan still has are ticked; when none is left (the plan changed since) the
// list starts empty with "This payment was for an item no longer in the plan." and "Tick what this
// payment is for." under it (useCandidateActions.openEditPayment).
import Dialog from '../../../components/Dialog.jsx';
import Notice from '../../../components/Notice.jsx';
import { AmountField, AmountMethod, FailedBanner, Footer, MethodField, PrimaryButton, TextField } from './dialogParts.jsx';
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
  // Nothing left ticked because the line's items left the plan: say so at once (not only on Save).
  const ticksError = errors.ticks ?? (state.itemGone && v.ticks.length === 0 ? T.ERR_TICK : null);

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
        {state.itemGone && (
          <div className="bb-item-gone">
            <Notice>{T.EDIT_PAYMENT_ITEM_GONE}</Notice>
          </div>
        )}
        <ItemChecklist items={data.money.items ?? []} ticks={v.ticks} onChange={onTicks} showAll label={T.FOR_LABEL} error={ticksError} readOnly={ro} />
        <AmountMethod>
          <AmountField value={v.amount} error={errors.amount} readOnly={ro} onChange={(amount) => onChange({ amount })} />
          <MethodField value={v.method} error={errors.method} readOnly={ro} onChange={(method) => onChange({ method })} />
        </AmountMethod>
        <TextField label={T.NOTE_OPTIONAL} placeholder={T.NOTE_PLACEHOLDER} value={v.note} error={errors.note} readOnly={ro} onChange={(note) => onChange({ note })} />
        <TextField label={T.REASON} placeholder={T.REASON_PLACEHOLDER} value={v.reason} error={errors.reason} readOnly={ro} onChange={(reason) => onChange({ reason })} />
        <p className="field-hint">{T.editPaymentHint(line.paidOn)}</p>
        <Footer state={state} isPhone={isPhone} onCancel={onCancel} primary={<PrimaryButton state={state} isPhone={isPhone} label={T.SAVE} Icon={ICONS.save} />} />
      </form>
    </Dialog>
  );
}
