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
// Phase 4 (P5): a student moved to private testing sits there too, with "moved Nov 10 by Staff"
// and the gray tag "Moved to private testing, Tue, Dec 1" under the name (no payment tag: the
// payment moved with them).
// v0.195: classes that test together show together — `sections` gives each class its own small
// heading row ("Group B · 3 students") with its rows under it; one Removed group after them all.
// Follows "Hide private details" (v0.506), as Star's CandidateRows: while ctx.hidden is on there is
// no Paying by, Payment or Paid on column, no Paid / Not paid tag, no "Cash · paid Nov 3" line and
// no Mark paid. A Status column keeps the tags that aren't about money (Possible duplicate, Not
// saved, Removed / Duplicate copy) and shows only when a shown row has one (ctx.showStatusCol).
import { Fragment } from 'react';
import { IconAlertTriangle, IconCheck, IconChevronDown, IconChevronUp, IconDots } from '@tabler/icons-react';
import IconButton from '../../../components/IconButton.jsx';
import { TestingForCell } from './StudentDialog.jsx';
import * as T from '../text.js';

// Does the row have a tag that isn't about money? (Used while private details are hidden: the
// Status column shows only when a shown row has one, as Star's G4.) A moved row shows "—".
export function hasStatusTag(row, notSavedId) {
  if (notSavedId === row.id) return true;
  if (row.status === 'withdrawn') return !row.movedTo;
  return row.duplicateState === 'possible';
}

// The one tag of a row. hidden: the Paid / Not paid tag is left out (null).
function PaymentTag({ row, onReview, hidden = false }) {
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
  if (hidden) return null; // nothing about money while details are hidden
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
  const { layout, nav, rankById, handlers, hidden } = ctx;
  const rank = rankById.get(row.eventRankId);
  const name = T.studentLabel(row);
  const removed = row.status === 'withdrawn';
  const showMarkPaid = !hidden && !removed && !row.paid && row.duplicateState !== 'possible';
  const showMenu = !removed || ctx.isAdmin;
  const open = ctx.menuFor === row.id;
  const selected = open || ctx.selectedId === row.id;
  const moved = removed && row.movedTo ? row.movedTo : null;
  let tag = ctx.notSavedId === row.id ? <NotSavedTag /> : <PaymentTag row={row} onReview={handlers.onReview} hidden={hidden} />;
  if (moved) tag = <span className="ev-ssub">—</span>;
  // Phase 3 (plan Q1, v0.191): a student an admin added after the testing day gets a gray line
  // "Added Nov 21 by Jeffrey Berg (admin)" under the name, on Students and on Grading.
  const addedAfter = row.addedAfterDay ? (
    <span className="ev-ssub ev-added-after">{T.addedAfterDayLine(row.addedAfterDay.date, row.addedAfterDay.byName)}</span>
  ) : null;
  let subline = removed ? T.removedBy(row.withdrawnAt, row.withdrawnByName) : row.source === 'form' ? T.registeredOn(row.registeredAt) : T.addedOn(row.registeredAt);
  if (moved) subline = T.movedBy(row.withdrawnAt, row.withdrawnByName);
  // Phase 4: the moved tag on its own line under the name
  const movedLine = moved ? (
    <span className="ev-added-after">
      <span className="ttag">{T.movedTag(moved.privateDate)}</span>
    </span>
  ) : null;

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
    const payLine = hidden ? null : row.paid ? T.paidOnPhone(row.paidMethod, row.paidOn) : T.payingByText(row.payingBy);
    // While hidden, a moved row's "—" placeholder isn't needed (the moved tag is under the name).
    const tagShown = hidden && moved ? null : tag;
    return (
      <div {...rowProps}>
        <span className="ev-srow-main" role="cell">
          <span className="ev-sname-line">
            <span className="ev-sname">{name}</span>
            <span className="ev-ssub">{subline}</span>
            {addedAfter}
            {movedLine}
          </span>
          <span className="ev-sline">
            <TestingForCell rank={rank} />
          </span>
          {payLine && <span className="ev-sline l2">{payLine}</span>}
          {(tagShown || markPaid) && (
            <span className="ev-sline ev-sline-tag">
              {tagShown}
              {markPaid}
            </span>
          )}
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
        {movedLine}
      </span>
      <span className="ev-scell" role="cell">
        <TestingForCell rank={rank} />
      </span>
      {!hidden && (
        <span className="ev-scell" role="cell">
          {T.payingByText(row.payingBy)}
        </span>
      )}
      {(!hidden || ctx.showStatusCol) && (
        <span className="ev-scell" role="cell">
          {hidden && moved ? null : tag}
        </span>
      )}
      {!hidden && layout.isWide && (
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

// sections (optional): [{ key, heading (text or null), rows }] — the same rows, split per class.
export default function RosterRows({ rows, sections, removedRows, removedOpen, onToggleRemoved, emptyText, ctx }) {
  const parts = sections ?? [{ key: 'all', heading: null, rows }];
  const { layout, nav, hidden } = ctx;
  // Hide private details: the roster's own class names pick the narrower grid (testing-events.css).
  const hiddenClass = hidden ? ` is-hidden${ctx.showStatusCol ? '' : ' no-status'}` : '';
  return (
    <div
      className={`clist ev-roster${layout.isWide ? ' is-wide' : ''}${layout.isPhone ? ' is-phone' : ''}${layout.isTouch ? ' is-touch' : ''}${hiddenClass}`}
      role="table"
      aria-label={ctx.tableLabel}
    >
      {!layout.isPhone && (
        <div className="ev-srow ev-shead" role="row">
          <span role="columnheader">{T.COL_STUDENT}</span>
          <span role="columnheader">{T.COL_TESTING_FOR}</span>
          {!hidden && <span role="columnheader">{T.COL_PAYING_BY}</span>}
          {(!hidden || ctx.showStatusCol) && <span role="columnheader">{hidden ? T.COL_STATUS : T.COL_PAYMENT}</span>}
          {!hidden && layout.isWide && <span role="columnheader">{T.COL_PAID_ON}</span>}
          <span role="columnheader" aria-label={T.ACTIONS_COL} />
        </div>
      )}
      <div role="rowgroup" {...nav.containerProps}>
        {rows.length === 0 && (
          <p className="tempty ev-roster-empty" role="row">
            <span role="cell">{emptyText}</span>
          </p>
        )}
        {parts.map((part) => (
          <Fragment key={part.key}>
            {part.heading && (
              <div className="gr-subhead ev-subhead" role="row">
                <span role="cell">{part.heading}</span>
              </div>
            )}
            {part.rows.map((row) => (
              <StudentRow key={row.id} row={row} ctx={ctx} />
            ))}
          </Fragment>
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
