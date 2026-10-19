// RosterRows.jsx — the Students roster of one class on the event page (R1, R7, R8).
// Why it exists: Star's approved Candidates roster (Star v0.108–v0.117) with a class switch
// instead of the Dan switch (Q8). This file only DRAWS the rows; EventPage decides what they
// do. One row per student, in belt order (lowest first), then A–Z by last name:
//   PC (1024px and wider):  Student (+ "Registered Nov 1") · Testing for · Paying by ·
//                            Payment (one tag) · Paid on · Mark paid · ⋯
//   Tablet:                  the same without Paid on (it's in the detail view, rule 1.3)
//   Phone:                   stacked: name + registered, testing for, "Cash · paid Nov 3",
//                            then the tag and Mark paid, with ⋯ on the right
// One tag per row (rule 8): Possible duplicate (amber) > Paid (green) > Not paid (gray).
// Phase 3 (v0.191): a student an admin added after the testing day gets a gray line
// "Added Nov 21 by Jeffrey Berg (admin)" under the name.
// Withdrawn students sit in a "Removed" group at the bottom, "Not in the counts" (Star v0.113).
import { IconAlertTriangle, IconCheck, IconChevronDown, IconChevronUp, IconDots } from '@tabler/icons-react';
import IconButton from '../../../components/IconButton.jsx';
import { TestingForCell } from './StudentDialog.jsx';
import * as T from '../text.js';

// The one tag of a row.
function PaymentTag({ row, onReview }) {
  if (row.status === 'withdrawn') {
    return <span className="ttag">{row.withdrawnReason === 'duplicate_copy' ? T.TAG_DUPLICATE_COPY : T.TAG_REMOVED}</span>;
  }
  if (row.duplicateState === 'possible') {
    // The amber tag opens the compare dialog (Star v0.114).
    return (
      <button
        type="button"
        className="ttag ttag--warn ev-tag-button"
        aria-label={T.reviewDuplicateLabel(T.studentLabel(row))}
        onClick={(event) => {
          event.stopPropagation();
          onReview(row);
        }}
      >
        <IconAlertTriangle size={12} aria-hidden="true" />
        {T.TAG_POSSIBLE_DUPLICATE}
      </button>
    );
  }
  if (row.paid) return <span className="ttag ttag--ok">{T.TAG_PAID}</span>;
  return <span className="ttag">{T.TAG_NOT_PAID}</span>;
}

function NotSavedTag() {
  return (
    <span className="ttag ttag--warn">
      <IconAlertTriangle size={12} aria-hidden="true" />
      {T.TAG_NOT_SAVED}
    </span>
  );
}

// One student row. ctx = { layout, nav, rankById, busy, menuFor, selectedId, notSavedId, handlers, canMenu }
function StudentRow({ row, ctx }) {
  const { layout, nav, rankById, handlers } = ctx;
  const rank = rankById.get(row.eventRankId);
  const name = T.studentLabel(row);
  const removed = row.status === 'withdrawn';
  const showMarkPaid = !removed && !row.paid && row.duplicateState !== 'possible';
  const showMenu = !removed || ctx.isAdmin;
  const open = ctx.menuFor === row.id;
  const selected = open || ctx.selectedId === row.id;
  const tag = ctx.notSavedId === row.id ? <NotSavedTag /> : <PaymentTag row={row} onReview={handlers.onReview} />;
  // Phase 3 (plan Q1, v0.191): a student an admin added after the testing day gets a gray line
  // "Added Nov 21 by Jeffrey Berg (admin)" under the name, on Students and on Grading.
  const addedAfter = row.addedAfterDay ? (
    <span className="ev-ssub ev-added-after">{T.addedAfterDayLine(row.addedAfterDay.date, row.addedAfterDay.byName)}</span>
  ) : null;
  const subline = removed ? T.removedBy(row.withdrawnAt, row.withdrawnByName) : row.source === 'form' ? T.registeredOn(row.registeredAt) : T.addedOn(row.registeredAt);

  const markPaid = showMarkPaid ? (
    <button
      type="button"
      className="btn btn-sm ev-markpaid"
      aria-label={T.markPaidLabel(name)}
      aria-disabled={ctx.busy ? 'true' : undefined}
      tabIndex={nav.itemTabIndex(row.id)}
      onClick={(event) => {
        event.stopPropagation();
        if (!ctx.busy) handlers.onMarkPaid(row);
      }}
    >
      {/* ti-check: approved in the Mark paid drawing (plan answer 6) */}
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
      data-student-more={row.id}
      tabIndex={nav.itemTabIndex(row.id)}
      onClick={(event) => {
        event.stopPropagation();
        handlers.onMore(row, event.currentTarget);
      }}
    />
  ) : (
    <span className="ev-more-spacer" aria-hidden="true" />
  );

  const rowProps = {
    className: `ev-srow${removed ? ' is-removed' : ''}${selected ? ' is-selected' : ''}${layout.isPhone ? ' is-phone' : ''}`,
    role: 'row',
    'aria-label': name,
    ...nav.rowProps(row.id),
    onClick: () => handlers.onOpen(row),
  };

  if (layout.isPhone) {
    const payLine = row.paid ? T.paidOnPhone(row.paidMethod, row.paidOn) : T.payingByText(row.payingBy);
    return (
      <div {...rowProps}>
        <span className="ev-srow-main" role="cell">
          <span className="ev-sname-line">
            <span className="ev-sname">{name}</span>
            <span className="ev-ssub">{subline}</span>
            {addedAfter}
          </span>
          <span className="ev-sline">
            <TestingForCell rank={rank} />
          </span>
          <span className="ev-sline l2">{payLine}</span>
          <span className="ev-sline ev-sline-tag">
            {tag}
            {markPaid}
          </span>
        </span>
        <span className="acts" role="cell">
          {more}
        </span>
      </div>
    );
  }

  return (
    <div {...rowProps}>
      <span className="ev-scell ev-sname-line" role="cell">
        <span className="ev-sname">{name}</span>
        <span className="ev-ssub">{subline}</span>
        {addedAfter}
      </span>
      <span className="ev-scell" role="cell">
        <TestingForCell rank={rank} />
      </span>
      <span className="ev-scell" role="cell">
        {T.payingByText(row.payingBy)}
      </span>
      <span className="ev-scell" role="cell">
        {tag}
      </span>
      {layout.isWide && (
        <span className="ev-scell nowrap" role="cell">
          {row.paid ? T.monthDay(row.paidOn) : '—'}
        </span>
      )}
      <span className="acts" role="cell">
        {markPaid}
        {more}
      </span>
    </div>
  );
}

export default function RosterRows({ rows, removedRows, removedOpen, onToggleRemoved, emptyText, ctx }) {
  const { layout, nav } = ctx;
  return (
    <div
      className={`clist ev-roster${layout.isWide ? ' is-wide' : ''}${layout.isPhone ? ' is-phone' : ''}${layout.isTouch ? ' is-touch' : ''}`}
      role="table"
      aria-label={ctx.tableLabel}
    >
      {!layout.isPhone && (
        <div className="ev-srow ev-shead" role="row">
          <span role="columnheader">{T.COL_STUDENT}</span>
          <span role="columnheader">{T.COL_TESTING_FOR}</span>
          <span role="columnheader">{T.COL_PAYING_BY}</span>
          <span role="columnheader">{T.COL_PAYMENT}</span>
          {layout.isWide && <span role="columnheader">{T.COL_PAID_ON}</span>}
          <span role="columnheader" aria-label={T.ACTIONS_COL} />
        </div>
      )}
      <div role="rowgroup" {...nav.containerProps}>
        {rows.length === 0 && (
          <p className="tempty ev-roster-empty" role="row">
            <span role="cell">{emptyText}</span>
          </p>
        )}
        {rows.map((row) => (
          <StudentRow key={row.id} row={row} ctx={ctx} />
        ))}
        {removedRows.length > 0 && (
          <>
            <div className="ev-removed-head" role="row">
              <span role="cell">
                <button type="button" className="ev-removed-toggle" aria-expanded={removedOpen ? 'true' : 'false'} onClick={onToggleRemoved}>
                  {/* ti-chevron-up / ti-chevron-down = collapse / expand */}
                  {removedOpen ? <IconChevronUp size={16} aria-hidden="true" /> : <IconChevronDown size={16} aria-hidden="true" />}
                  <span className="ev-removed-title">{T.removedGroup(removedRows.length)}</span>
                </button>
                <span className="ev-removed-note">{T.NOT_IN_COUNTS}</span>
              </span>
            </div>
            {removedOpen && removedRows.map((row) => <StudentRow key={row.id} row={row} ctx={ctx} />)}
          </>
        )}
      </div>
    </div>
  );
}
