// PrivateSummaryDialog.jsx — a private testing's read-only summary (rulebook v1.009, CB6).
// Why it exists: tapping anywhere on a row of the Private testing tab opens the same kind of
// summary as the event roster's (event/StudentDialog.jsx, mode 'view'), so staff can read
// everything about one private testing without opening a form:
//   name, then "Private testing · Tue, Dec 1 · 4:00 PM"
//   Class · Testing for (the belts, as on the row) · Price · Added (when, plus "moved from
//   <event>" for one moved from an event) · Paying by · Payment (the tag, "$65 cash · paid Oct 21"
//   and "$20 more to collect" while money is still owed) · Result (when graded: the result tag,
//   when and by whom, and the note — as the roster's summary) · Status ("Cancelled Oct 27 by …",
//   when cancelled; rulebook §8 lists every status in the detail view)
//   buttons: Close · Edit details (Edit details only when the ⋯ menu offers it)
// Mark paid and the ⋯ stay on the row; this dialog changes nothing.
// PC and tablet: a centered dialog. Phone: a full screen with a back arrow (as the event roster).
// Follows "Hide private details" (v0.506, v0.507 Q2), as StudentDialog: while `hidden` is on, the
// Price, Paying by and Payment lines become one gray "Payment details are hidden on this tablet."
// line — no amount, no paid status.
// Like the other dialogs it only DRAWS; PrivateTestingTab decides what the buttons do.
import { IconEdit } from '@tabler/icons-react';
import Dialog from '../../../components/Dialog.jsx';
import { ResultTag } from '../event/ResultButtons.jsx';
import { TestingForCell } from '../event/StudentDialog.jsx';
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

// record: the private testing's row (privateApi.loadPrivateTestings) · canEdit: show Edit details
export default function PrivateSummaryDialog({ record, isPhone, canEdit, hidden = false, onEdit, onCancel, onRequestClose }) {
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
  let payment;
  if (record.paid) {
    payment = (
      <>
        <span className="ttag ttag--ok">{T.TAG_PAID}</span> · {T.paidDetail(record.paidCents, record.paidMethod, record.paidOn)}
        {record.owesMore && ` · ${T.moreToCollect(record.amountDueCents)}`}
      </>
    );
  } else {
    payment = (
      <>
        <span className="ttag">{T.TAG_NOT_PAID}</span> · {T.dollars(record.amountDueCents)}
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
        {!hidden && <SummaryRow label={T.DETAIL_PRICE}>{T.dollars(record.privateCents)}</SummaryRow>}
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
