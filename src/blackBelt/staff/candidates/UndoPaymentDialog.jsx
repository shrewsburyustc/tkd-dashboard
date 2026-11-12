// UndoPaymentDialog.jsx — the short "Undo Mia Chen's $870 card payment?" confirmation (admins; a
// payment, a refund or a returned-check mark — from a payment line's ⋯ in the detail, or a
// payment from the roster row's ⋯, which acts on the candidate's latest payment, v0.963).
// Why it exists: contract CONTRACT-0016-B2 §3.5 and open point OP-B1. The database can't undo an
// undo (a reversal can't be reversed, SQL 15p), and rule 1.4 says an action that can't be undone
// is confirmed first. So it asks once, then shows a toast WITHOUT Undo. A payment's words are
// v0.964 (mockup C, option A): the title names the person, the amount and how; the second line
// "Paid on Mar 20 for payments 1, 2 and 3. It comes off the balance; the history keeps it."
// Undo refund and Undo returned mark keep their own words. All words are in text.js.
// Since BB7 (rulebook v1.008 / v1.103) it is the shared confirm box (components/ConfirmBox.jsx):
//   - "Keep payment" / "Keep refund" / "Keep mark" on the LEFT (first focus; changes nothing),
//     the action on the RIGHT repeating the menu's words ("Undo payment", "Undo refund",
//     "Undo returned mark"), blue (it loses nothing for good: the history keeps it);
//   - while it works the action says "Undoing…", both buttons gray, and Esc, a click outside and
//     Back wait until it is done;
//   - a refusal (blocking note) grays the action and says why under the buttons; a lost connection
//     says so there too, and pressing the action again tries again.
// The same small box on every device. This file only draws; useCandidateActions.js decides.
import ConfirmBox from '../../../components/ConfirmBox.jsx';
import { ICONS } from './icons.js';
import * as T from '../text.js';

export default function UndoPaymentDialog({ state, onConfirm, onCancel }) {
  const { data, line } = state;
  const name = T.candidateName(data.candidate);
  const cents = Math.abs(line.amountCents);
  let title;
  let body;
  let keep;
  let confirm;
  if (line.kind === 'refund') {
    title = T.UNDO_REFUND_TITLE;
    body = T.undoRefundBody(cents, line.paidOn, name);
    keep = T.KEEP_REFUND;
    confirm = T.UNDO_REFUND_CONFIRM;
  } else if (line.kind === 'returned') {
    title = T.UNDO_RETURNED_TITLE;
    body = T.undoReturnedBody(state.what, cents);
    keep = T.KEEP_MARK;
    confirm = T.UNDO_RETURNED_CONFIRM;
  } else {
    title = T.undoPaymentTitle(name, cents, line.method);
    body = T.undoPaymentBody(line.paidOn, T.forSentence(line.forItems, { paymentsCount: data.candidate.plan?.paymentsCount ?? null }));
    keep = T.KEEP_PAYMENT;
    confirm = T.UNDO_PAYMENT_CONFIRM;
  }
  return (
    <ConfirmBox
      title={title}
      keepLabel={keep}
      actionLabel={confirm}
      actionIcon={ICONS.undo}
      busyLabel={T.UNDOING}
      loses="something"
      busy={state.saving}
      actionUnavailable={state.blocking}
      failed={state.failed ? T.UNDO_BOX_FAILED : state.note}
      onKeep={onCancel}
      onConfirm={onConfirm}
    >
      {body}
    </ConfirmBox>
  );
}
