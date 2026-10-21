// PrivateRows.jsx — the rows of the Private testing tab (mockups P1, P3, P7; contract 0014 §5.2).
// Why it exists: one row per private testing of the side shown (Upcoming or Past). This file only
// DRAWS the rows; PrivateTestingTab decides what the buttons do.
//   PC (1024px and wider):  Day · time · Student (+ class; on Past the result tag or "Cancelled
//                            Nov 28") · Testing for · price · Paying by · Payment · Paid on ·
//                            Mark paid · ⋯
//   Tablet:                  the day and time move under the name; Paid on is dropped (it's in the
//                            phone line and on the Payment tag's day); the amber / gray lines run
//                            the full row width
//   Phone / 320:             stacked: name + class, day · time, belts · price, the lines, paying
//                            by ("Cash · paid Nov 2"), then the tag and Mark paid, ⋯ on the right
// Under the name: the amber "Paid $65 · $20 more to collect" line while a paid student owes more
// (P1), and a gray "→ Moved from November Children Testing" line for one moved from an event.
// A cancelled row is grayed entirely; staff see no ⋯ on it (admins: Restore / Delete).
import { IconAlertTriangle, IconArrowRight, IconCheck, IconDots } from '@tabler/icons-react';
import IconButton from '../../../components/IconButton.jsx';
import { showMarkPaid } from '../../../lib/testing/privateRules.js';
import { ResultTag } from '../event/ResultButtons.jsx';
import { TestingForCell } from '../event/StudentDialog.jsx';
import * as T from '../text.js';

// The row's copied rank in the shape TestingForCell / Belt draw: { name, belt fields, testingFor }.
export function rankViewOf(row) {
  const to = row.testingFor;
  return {
    name: row.rankName,
    ...(row.belt ?? {}),
    testingFor: to && to.kind === 'rank' ? { name: to.name, ...(to.belt ?? {}) } : null,
  };
}

function NotSavedTag() {
  return (
    <span className="ttag ttag--warn">
      <IconAlertTriangle size={12} aria-hidden="true" />
      {T.TAG_NOT_SAVED}
    </span>
  );
}

// One private testing. ctx = { layout, busy, isAdmin, menuFor, notSavedId, handlers }
function PrivateRow({ row, ctx }) {
  const { layout, handlers } = ctx;
  const name = T.studentLabel(row);
  const cancelled = row.status === 'cancelled';
  const open = ctx.menuFor === row.id;
  const showMenu = !cancelled || ctx.isAdmin;

  // On Past (and on a cancelled row): the result tag, or the gray "Cancelled Nov 28" tag.
  let sideTag = null;
  if (cancelled) sideTag = <span className="ttag">{T.cancelledTag(row.cancelledAt)}</span>;
  else if (row.side === 'past' && row.result) sideTag = <ResultTag result={row.result} />;

  const payTag = ctx.notSavedId === row.id ? <NotSavedTag /> : <span className={`ttag${row.paid ? ' ttag--ok' : ''}`}>{row.paid ? T.TAG_PAID : T.TAG_NOT_PAID}</span>;

  // The amber owed line and the gray moved line (P1)
  const owed =
    !cancelled && row.owesMore ? (
      <span className="pv-owed-line">
        {/* ti-alert-triangle = still something to collect */}
        <IconAlertTriangle size={14} aria-hidden="true" />
        <span>{T.owedLine(row.paidCents, row.amountDueCents)}</span>
      </span>
    ) : null;
  const moved = row.movedFromEventName ? (
    <span className="pv-moved-line">
      {/* ti-arrow-right = came over from an event */}
      <IconArrowRight size={14} aria-hidden="true" />
      <span>{T.movedFromLine(row.movedFromEventName)}</span>
    </span>
  ) : null;
  const lines = owed || moved ? (
    <span className="pv-lines">
      {owed}
      {moved}
    </span>
  ) : null;

  const testingFor = (
    <span className="pv-tf">
      <TestingForCell rank={rankViewOf(row)} />
      <span className="pv-tf-price">· {T.dollars(row.privateCents)}</span>
    </span>
  );

  const markPaid = !cancelled && showMarkPaid(row) ? (
    <button
      type="button"
      className="btn btn-sm ev-markpaid"
      aria-label={T.markPaidLabel(name)}
      aria-disabled={ctx.busy ? 'true' : undefined}
      onClick={() => {
        if (!ctx.busy) handlers.onMarkPaid(row);
      }}
    >
      {/* ti-check: as the event roster's Mark paid */}
      <IconCheck size={16} aria-hidden="true" />
      {T.MARK_PAID}
    </button>
  ) : null;
  const more = showMenu ? (
    <IconButton
      label={T.moreForStudent(name)}
      Icon={IconDots}
      aria-haspopup="menu"
      aria-expanded={open ? 'true' : 'false'}
      data-private-more={row.id}
      onClick={(event) => handlers.onMore(row, event.currentTarget)}
    />
  ) : (
    <span className="ev-more-spacer" aria-hidden="true" />
  );

  const rowClass = `pv-row${cancelled ? ' is-cancelled' : ''}${open ? ' is-selected' : ''}${layout.isPhone ? ' is-phone' : ''}`;

  if (layout.isPhone) {
    const payLine = row.paid ? T.paidOnPhone(row.paidMethod, row.paidOn) : T.payingByText(row.payingBy);
    return (
      <div className={rowClass} role="row" aria-label={name} data-private-row={row.id}>
        <span className="pv-phone-main" role="cell">
          <span className="pv-name-line">
            <span className="ev-sname">{name}</span>
            <span className="pv-class">{row.className}</span>
            {sideTag}
          </span>
          <span className="pv-daytime-line">{T.privateDayTime(row.privateDate, row.privateTime)}</span>
          {testingFor}
          {lines}
          <span className="pv-sub">{payLine}</span>
          <span className="ev-sline-tag">
            {payTag}
            {markPaid}
          </span>
        </span>
        <span className="acts" role="cell">
          {more}
        </span>
      </div>
    );
  }

  const student = (
    <span className="pv-student" role="cell">
      <span className="pv-name-line">
        <span className="ev-sname">{name}</span>
        {sideTag}
      </span>
      <span className="pv-class">{row.className}</span>
      {!layout.isWide && <span className="pv-class">{T.privateDayTime(row.privateDate, row.privateTime)}</span>}
      {layout.isWide && lines}
    </span>
  );
  return (
    <div className={rowClass} role="row" aria-label={name} data-private-row={row.id}>
      {layout.isWide && (
        <span className="pv-day" role="cell">
          <span className="pv-day-date">{T.weekdayMonthDay(row.privateDate)}</span>
          <span className="pv-class">{T.timeLabel(row.privateTime)}</span>
        </span>
      )}
      {student}
      <span role="cell">{testingFor}</span>
      <span role="cell">{T.payingByText(row.payingBy)}</span>
      <span role="cell">{payTag}</span>
      {layout.isWide && (
        <span className="nowrap" role="cell">
          {row.paid ? T.monthDay(row.paidOn) : '—'}
        </span>
      )}
      <span className="acts" role="cell">
        {markPaid}
        {more}
      </span>
      {/* Tablet: the lines run the full row width under the name (P1) */}
      {!layout.isWide && lines && (
        <span className="pv-lines--full" role="cell">
          {lines}
        </span>
      )}
    </div>
  );
}

// rows: one side's private testings, already sorted (privateRules.splitPrivate)
export default function PrivateRows({ rows, label, ctx }) {
  const { layout } = ctx;
  return (
    <div className={`clist pv-list${layout.isWide ? ' is-wide' : ''}${layout.isPhone ? ' is-phone' : ''}${layout.isTouch ? ' is-touch' : ''}`} role="table" aria-label={label}>
      {!layout.isPhone && (
        <div className="pv-row pv-head" role="row">
          {layout.isWide && <span role="columnheader">{T.COL_DAY_TIME}</span>}
          <span role="columnheader">{T.COL_STUDENT}</span>
          <span role="columnheader">{T.COL_TESTING_FOR_PRICE}</span>
          <span role="columnheader">{T.COL_PAYING_BY}</span>
          <span role="columnheader">{T.COL_PAYMENT}</span>
          {layout.isWide && <span role="columnheader">{T.COL_PAID_ON}</span>}
          <span role="columnheader" aria-label={T.ACTIONS_COL} />
        </div>
      )}
      <div role="rowgroup">
        {rows.map((row) => (
          <PrivateRow key={row.id} row={row} ctx={ctx} />
        ))}
      </div>
    </div>
  );
}
