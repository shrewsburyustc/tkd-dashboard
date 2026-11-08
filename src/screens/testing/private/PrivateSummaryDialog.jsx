// PrivateSummaryDialog.jsx — a private testing's read-only summary (rulebook v1.009, CB6).
// Why it exists: tapping anywhere on a row of the Private testing tab opens the same kind of
// summary as the event roster's (event/StudentDialog.jsx, mode 'view'), so staff can read
// everything about one private testing without opening a form:
//   name, then "Private testing · Tue, Dec 1 · 4:00 PM"
//   Class · Testing for (the belts, as on the row) · Price · Added (when, plus "moved from
//   <event>" for one moved from an event) · Paying by · Payment (the tag, "$65 cash · paid Oct 21"
//   and "$20 more to collect" while money is still owed; paid in parts, one line per payment that
//   still stands, pass 2 C-03) · Result (when graded: the result tag,
//   when and by whom, and the note — as the roster's summary) · Status ("Cancelled Oct 27 by …",
//   when cancelled; rulebook §8 lists every status in the detail view)
//   buttons: Close · Edit details (Edit details only when the ⋯ menu offers it)
// Mark paid and the ⋯ stay on the row; this dialog changes nothing.
// PC and tablet: a centered dialog. Phone: a full screen with a back arrow (as the event roster).
// Follows "Hide private details" (v0.506, v0.507 Q2), as StudentDialog: while `hidden` is on, the
// Price, Paying by and Payment lines become one gray "Payment details are hidden on this tablet."
// line — no amount, no paid status.
// Like the other dialogs it only DRAWS; PrivateTestingTab decides what the buttons do.
//
// Design review Part 2, mockup P3 (rulebook v0.421), as the event roster's summary:
//   - an outline "Print receipt" ends the Payment row (CB2) — staff and admins, on a private testing
//     with a payment that still stands, never while Hide private details is on (the ⋯ menu's rule,
//     privateMenu's printReceipt); it opens the same receipt as ⋯ → Print receipt, on top of this;
//   - the shared History line ends the summary (CB7): only this private testing's own changes — a
//     moved one starts at the move, which names the event (v0.418 Q4); money changes are left out
//     while Hide private details is on.
import { IconEdit } from '@tabler/icons-react';
import Dialog from '../../../components/Dialog.jsx';
import HistoryLine from '../../../components/HistoryLine.jsx';
import { formatMoney } from '../../../lib/money.js';
import { loadPrivateHistory } from '../../../lib/testing/privateApi.js';
import { describeHistoryRow, historyReader } from '../../../lib/testing/history.js';
import { summaryPaymentParts } from '../../../lib/testing/privateRules.js';
import { ResultTag } from '../event/ResultButtons.jsx';
import { PrintReceiptButton, TestingForCell } from '../event/StudentDialog.jsx';
import { rankViewOf } from './PrivateRows.jsx';
import * as T from '../text.js';

// One line of the summary: gray label on the left, value on the right (the event roster's look).
function SummaryRow({ label, children }) {
  return (
    <div className="ev-sum-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

// record: the private testing's row (privateApi.loadPrivateTestings) · payments: the tab's payment
// rows (any private testing's; the summary picks this one's, C-03) · canEdit: show Edit details ·
// canPrintReceipt: show Print receipt (the ⋯ menu's rule) · onPrintReceipt(opener): open the receipt ·
// onNoAccess: the History reader's no_access (the lock screen)
export default function PrivateSummaryDialog({
  record,
  payments = [],
  isPhone,
  canEdit,
  hidden = false,
  canPrintReceipt = false,
  onPrintReceipt = null,
  onNoAccess = null,
  onEdit,
  onCancel,
  onRequestClose,
}) {
  const name = T.studentLabel(record);
  const editButton = canEdit ? (
    <button type="button" className={`btn btn-primary${isPhone ? ' btn-block' : ''}`} onClick={onEdit}>
      {/* ti-edit = edit */}
      <IconEdit size={16} aria-hidden="true" />
      {T.EDIT_DETAILS}
    </button>
  ) : null;

  // The payment line: "[Paid] · $65 cash · paid Oct 21 · $20 more to collect", or
  // "[Not paid] · $85" (what is still owed).
  // Paid in parts (pass 2 C-03, v1.009): one line per payment that still stands, oldest first, each
  // with its own way and day ("[Paid] · $65 cash · paid Oct 30", then "$20 card · paid Nov 6"), and
  // "$X more to collect" on its own line under them. Paid once: today's one line, unchanged.
  let payment;
  if (record.paid) {
    const parts = summaryPaymentParts(record, payments);
    const lines = parts.map((p) => T.paidDetail(p.cents, p.method, p.paidOn));
    const oneLine = lines.length === 1;
    payment = (
      <>
        <span className="ttag ttag--ok">{T.TAG_PAID}</span> · {lines[0]}
        {lines.slice(1).map((line, index) => (
          <span key={index} className="ev-sum-line">
            {line}
          </span>
        ))}
        {/* A cancelled one owes nothing more (v0.429), as its row already shows */}
        {record.owesMore &&
          record.status !== 'cancelled' &&
          (oneLine ? ` · ${T.moreToCollect(record.amountDueCents)}` : <span className="ev-sum-line">{T.moreToCollect(record.amountDueCents)}</span>)}
        {canPrintReceipt && !hidden && onPrintReceipt && <PrintReceiptButton onPrint={onPrintReceipt} />}
      </>
    );
  } else if (record.status === 'cancelled') {
    // Cancelled and never paid: nothing is owed, so no "[Not paid] · $85" (batch 3 Q2 a)
    payment = (
      <>
        <span className="ttag">{T.TAG_CANCELLED}</span> · {T.CANCELLED_NOTHING_PAID}
      </>
    );
  } else {
    payment = (
      <>
        <span className="ttag">{T.TAG_NOT_PAID}</span> · {formatMoney(record.amountDueCents)}
      </>
    );
  }

  return (
    <Dialog title={name} size="detail" fullScreen={isPhone} onRequestClose={onRequestClose}>
      <p className="tdialog-sub">{T.privateSummarySub(record.privateDate, record.privateTime)}</p>
      <dl className="ev-sum">
        <SummaryRow label={T.DETAIL_CLASS}>{record.className}</SummaryRow>
        <SummaryRow label={T.DETAIL_TESTING_FOR}>
          <TestingForCell rank={rankViewOf(record)} />
        </SummaryRow>
        {!hidden && <SummaryRow label={T.DETAIL_PRICE}>{formatMoney(record.privateCents)}</SummaryRow>}
        <SummaryRow label={T.DETAIL_ADDED}>{T.privateAddedDetail(record.createdAt, record.movedFromEventName)}</SummaryRow>
        {hidden ? (
          // Hide private details (v0.507 Q2): the payment part keeps its row and says it is hidden
          <SummaryRow label={T.DETAIL_PAYMENT}>
            <span className="ev-hidden-value">{T.PAYMENT_DETAILS_HIDDEN}</span>
          </SummaryRow>
        ) : (
          <>
            <SummaryRow label={T.DETAIL_PAYING_BY}>{T.payingByText(record.payingBy)}</SummaryRow>
            <SummaryRow label={T.DETAIL_PAYMENT}>{payment}</SummaryRow>
          </>
        )}
        {record.graded && (
          // As the event roster's summary (G8): "[Not passed] Dec 1, 5:41 PM by Staff", then "Note: …"
          <SummaryRow label={T.DETAIL_RESULT}>
            {record.result ? <ResultTag result={record.result} /> : <span className="gr-notrec">{T.NOT_RECORDED_YET}</span>}{' '}
            {T.resultStamp(record.resultAt, record.resultByName)}
            {record.note && <span className="ev-sum-line">{T.resultNoteLine(record.note)}</span>}
          </SummaryRow>
        )}
        {record.status === 'cancelled' && (
          // Every status is listed in the detail view (rulebook §8): "Cancelled Oct 27 by …"
          <SummaryRow label={T.DETAIL_STATUS}>{T.cancelledDetail(record.cancelledAt, record.cancelledByName)}</SummaryRow>
        )}
      </dl>
      {/* CB7: the shared History line ends the summary; it reads the history itself when it
          appears (testing_private_history). */}
      <section className="ev-sum-history">
        <HistoryLine
          load={historyReader(loadPrivateHistory, record.id, onNoAccess)}
          describe={describeHistoryRow}
          hidden={hidden}
        />
      </section>
      {isPhone ? (
        editButton && <div className="dialog-page-submit">{editButton}</div>
      ) : (
        <div className="dialog-actions">
          {/* Focus starts on Close: nothing changes by accident at a shared desk (Star v0.112). */}
          <button type="button" className="btn" data-autofocus onClick={onCancel}>
            {T.CLOSE}
          </button>
          {editButton}
        </div>
      )}
    </Dialog>
  );
}
