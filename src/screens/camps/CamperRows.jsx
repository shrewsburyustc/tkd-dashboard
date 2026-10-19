// CamperRows.jsx — the camper rows of the Payments tab (option A, contract §6.4).
// Why it exists: adapted from Color Belt's RosterRows (R1, R7, R8). This file only DRAWS rows;
// CampPage decides what the buttons do. One row per camper:
//   PC / tablet:  Camper (name · age, "non-member" when it applies, and one gray line
//                 "Mon, Tue, Wed · cash") · Total · Status (one tag) · Mark paid · ⋯
//   Phone:        stacked: name · age, the gray line, then the tag, the total and Mark paid; ⋯ right
// One tag per row (v0.702 priority): Possible duplicate (amber, opens the compare) > Owes $15
// (amber) > Paid (green) > Not paid (gray). Mark paid records the full amount ("Mark paid"), or
// just what is still owed ("Mark paid $15"); a possible duplicate has no Mark paid until resolved.
// Privacy (rulebook §5): no phones, no addresses — those are only in Camper detail.
import { IconAlertTriangle, IconCheck, IconDots } from '@tabler/icons-react';
import IconButton from '../../components/IconButton.jsx';
import { payTag } from '../../lib/camps/campRules.js';
import * as T from './text.js';

// The status tag of a row (or Removed / Duplicate copy for a removed camper).
export function CamperTag({ row, onReview, notSaved }) {
  if (notSaved) {
    return (
      <span className="ttag ttag--warn">
        <IconAlertTriangle size={12} aria-hidden="true" />
        {T.TAG_NOT_SAVED}
      </span>
    );
  }
  if (row.status !== 'active') return <span className="ttag">{row.withdrawnReason === 'duplicate_copy' ? T.TAG_DUPLICATE_COPY : T.TAG_REMOVED}</span>;
  const tag = payTag(row);
  if (tag === 'duplicate') {
    return (
      <button
        type="button"
        className="ttag ttag--warn ev-tag-button"
        aria-label={T.reviewDuplicateLabel(T.camperLabel(row))}
        onClick={(event) => {
          event.stopPropagation();
          onReview(row, event.currentTarget);
        }}
      >
        <IconAlertTriangle size={12} aria-hidden="true" />
        {T.TAG_POSSIBLE_DUPLICATE}
      </button>
    );
  }
  if (tag === 'owes') return <span className="ttag ttag--warn">{T.tagOwes(row.owesCents)}</span>;
  if (tag === 'paid') return <span className="ttag ttag--ok">{T.TAG_PAID}</span>;
  return <span className="ttag">{T.TAG_NOT_PAID}</span>;
}

// "Mark paid" or "Mark paid $15" (ti-check: Color Belt's built button), or nothing.
export function MarkPaidButton({ row, busy, tabIndex, onMarkPaid, block = false }) {
  const tag = payTag(row);
  if (row.status !== 'active' || (tag !== 'not_paid' && tag !== 'owes')) return null;
  const name = T.camperLabel(row);
  return (
    <button
      type="button"
      className={`btn btn-sm ev-markpaid${block ? ' cp-markpaid-block' : ''}`}
      aria-label={T.markPaidLabel(name, row.owesCents)}
      aria-disabled={busy ? 'true' : undefined}
      tabIndex={tabIndex}
      onClick={(event) => {
        event.stopPropagation();
        if (!busy) onMarkPaid(row);
      }}
    >
      <IconCheck size={16} aria-hidden="true" />
      {tag === 'owes' ? T.markPaidAmount(row.owesCents) : T.MARK_PAID}
    </button>
  );
}

// "Mia Rossi · 9" (+ " · non-member")
// showMember: false on the Check in tab (name · age only, v0.704 option A).
export function NameAge({ row, showMember = true }) {
  return (
    <span className="cp-name">
      <span className="ev-sname">{T.camperLabel(row)}</span>
      <span className="cp-age-text"> · {row.age}</span>
      {showMember && !row.member && <span className="cp-age-text"> · {T.nonMember}</span>}
    </span>
  );
}

// One camper row. ctx = { layout, nav, isAdmin, busy, menuFor, selectedId, notSavedId, campDays, handlers }
export function CamperRow({ row, ctx }) {
  const { layout, nav, handlers } = ctx;
  const removed = row.status !== 'active';
  const open = ctx.menuFor === row.id;
  const selected = open || ctx.selectedId === row.id;
  const name = T.camperLabel(row);
  const daysText = T.camperDaysText(row, ctx.campDays);
  const gray = removed ? T.removedBy(row.withdrawnAt, row.withdrawnByName) : T.camperPayLine(daysText, row.payingBy);
  const tag = <CamperTag row={row} onReview={handlers.onReview} notSaved={ctx.notSavedId === row.id} />;
  const markPaid = <MarkPaidButton row={row} busy={ctx.busy} tabIndex={nav.itemTabIndex(row.id)} onMarkPaid={handlers.onMarkPaid} />;
  // Staff see no ⋯ on a Duplicate copy (nothing they may do there); a spacer keeps the columns.
  const hasMenu = !removed || ctx.isAdmin || row.withdrawnReason !== 'duplicate_copy';
  const more = hasMenu ? (
    <IconButton
      label={T.moreFor(name)}
      Icon={IconDots}
      aria-haspopup="menu"
      aria-expanded={open ? 'true' : 'false'}
      data-camper-more={row.id}
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
    className: `ev-srow cp-prow${removed ? ' is-removed' : ''}${selected ? ' is-selected' : ''}${layout.isPhone ? ' is-phone' : ''}`,
    role: 'row',
    'aria-label': name,
    ...nav.rowProps(row.id),
    onClick: () => handlers.onOpen(row),
  };

  if (layout.isPhone) {
    return (
      <div {...rowProps}>
        <span className="ev-srow-main" role="cell">
          <NameAge row={row} />
          <span className="ev-sline l2">{gray}</span>
          <span className="ev-sline ev-sline-tag">
            {tag}
            <span className="cp-total">{T.dollars(row.totalCents)}</span>
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
      <span className="ev-scell" role="cell">
        <NameAge row={row} />
        <span className="ev-ssub cp-gray-line">{gray}</span>
      </span>
      <span className="ev-scell cp-total" role="cell">
        {T.dollars(row.totalCents)}
      </span>
      <span className="ev-scell" role="cell">
        {tag}
      </span>
      <span className="acts" role="cell">
        {markPaid}
        {more}
      </span>
    </div>
  );
}

// A group of rows with its small heading ("To collect · 5", "Paid · 13").
export default function CamperRows({ heading, rows, ctx }) {
  if (rows.length === 0) return null;
  return (
    <>
      <div className="gr-subhead ev-subhead cp-subhead" role="row">
        <span role="cell">{heading}</span>
      </div>
      {rows.map((row) => (
        <CamperRow key={row.id} row={row} ctx={ctx} />
      ))}
    </>
  );
}
