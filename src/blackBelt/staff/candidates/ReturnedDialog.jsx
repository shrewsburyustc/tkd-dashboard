// ReturnedDialog.jsx — "Mark check returned" (admins only, from a check payment's ⋯ in the detail).
// Why it exists: approved mockup Candidates 5, contract CONTRACT-0016-B2 §3.5. When the bank
// returns a (post-dated) check: "Alex Kim · Payment 2 · $290 check recorded Mar 27", then "The check
// stays in the history, marked returned. $290 goes back on Alex Kim's balance." and what the roster
// will show afterwards ("Payment 2 was due Apr 24, so the roster will show Late · $290 since
// Apr 24."), worked out in advance with rules.predictMoney — nothing is saved until Mark returned.
// A note only (no bank fee field). The mark is its own "returned" line, never a change to the
// payment (Finance v0.809). Toast "Check marked returned · $290 · Alex Kim · Undo".
import Dialog from '../../../components/Dialog.jsx';
import { predictMoney } from '../../../lib/blackBelt/rules.js';
import { FailedBanner, Footer, PrimaryButton, TextField } from './dialogParts.jsx';
import { ICONS } from './icons.js';
import { noteLength } from './checks.js';
import * as T from '../text.js';

export default function ReturnedDialog({ state, cycle, isPhone, today, onChange, onSave, onCancel, onRequestClose }) {
  const { data, line, what, values: v } = state;
  const c = data.candidate;
  const name = T.candidateName(c);
  const ro = state.saving;
  const predicted = predictMoney({
    cycle,
    planId: c.cyclePlanId,
    dan: c.dan,
    kukkiwon: c.kukkiwon,
    kukkiwonAddedOn: c.kukkiwonAddedOn,
    registeredOn: c.registeredOn,
    lines: data.payments,
    today,
    returnedPaymentId: line.id,
  });
  // The earliest due date among the items this check was for ("Payment 2 was due Apr 24").
  const dueOn = (data.money.items ?? []).filter((x) => (line.forItems ?? []).includes(x.item)).map((x) => x.dueOn).sort()[0] ?? null;
  const noteError = state.triedSave && noteLength(v.note) > 600 ? T.ERR_NOTE : null;

  return (
    <Dialog title={T.RETURNED_TITLE} size="small" fullScreen={isPhone} onRequestClose={onRequestClose}>
      <p className="tdialog-sub">{T.returnedSub(name, what, line.amountCents, line.paidOn)}</p>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <FailedBanner state={state} onRetry={onSave} />
        <p className="bb-returned-text">
          {T.returnedSentence(line.amountCents, name)} {T.returnedPrediction(what, dueOn, predicted)}
        </p>
        <TextField label={T.NOTE_OPTIONAL} value={v.note} error={noteError} readOnly={ro} autoFocus onChange={(note) => onChange({ note })} />
        <Footer state={state} isPhone={isPhone} onCancel={onCancel} divider primary={<PrimaryButton state={state} isPhone={isPhone} label={T.MARK_RETURNED} Icon={ICONS.returned} />} />
      </form>
    </Dialog>
  );
}
