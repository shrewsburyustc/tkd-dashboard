// CandidateRows.jsx — the Star testing Candidates roster of one Dan (Candidates screens 1–3, 10;
// Private screen 1; gap mockups G4, G12–G15).
// Why it exists: this file only DRAWS the rows; CandidatesTab.jsx decides what they do. One row per
// candidate, in belt order (v0.117, the order loadCandidates returns):
//   PC (1024px and wider):  Candidate ("Registered Oct 12" beside the name with a mouse, under it on
//                            touch) · School · Testing for · Paying by ·
//                            Payment (one tag) · Paid on · Record payment · ⋯
//   Tablet:                  Candidate (+ "Shrewsbury · Registered Oct 12") · Testing for ·
//                            Paying by · Payment · Record payment · ⋯   (Paid on is in the detail)
//   Phone:                   stacked: name + registered; stars · school; payment; tag + Record payment
// The School column / the school in the second line is left out with one school selected (G12).
// Make-up rows (v0.116, G14): a gray line "Make-up · retests …", "No fee", the Make-up tag, no
// Record payment. Private students (G15): a plain gray line "Private · Tue, Dec 1, 4:00 PM · $160".
// One tag per row (rule 8): Not saved > Removed / Duplicate copy > Possible duplicate (amber, a
// button that opens the compare) > Make-up > Paid / Not paid.
// While "Hide private details" is on (v0.506, G4): no Paying by, Payment, Paid on or Record payment;
// the Payment column becomes Status with only the tags that aren't about money, and it is left out
// when no shown row has one; "No fee" and the private line's fee are hidden; removed rows drop the
// payment.
// Withdrawn candidates sit in a Removed group at the bottom of the Dan, collapsed by default (G13).
import { IconAlertTriangle, IconChevronDown, IconChevronUp, IconDots } from '@tabler/icons-react';
import IconButton from '../../../../components/IconButton.jsx';
import * as T from './text.js';

// The row's one status tag that isn't about money (also used while details are hidden), or null.
export function statusTagKind(row, notSavedId) {
  if (notSavedId === row.id) return 'notSaved';
  if (row.status === 'withdrawn') return row.withdrawnReason === 'duplicate_copy' ? 'duplicateCopy' : 'removed';
  if (row.duplicateState === 'possible') return 'duplicate';
  if (row.isMakeup) return 'makeup';
  return null;
}

function Tag({ row, ctx }) {
  const kind = statusTagKind(row, ctx.notSavedId);
  if (kind === 'notSaved') {
    return (
      <span className="ttag ttag--warn">
        <IconAlertTriangle size={12} aria-hidden="true" />
        {T.TAG_NOT_SAVED}
      </span>
    );
  }
  if (kind === 'removed' || kind === 'duplicateCopy') {
    return <span className="ttag">{kind === 'duplicateCopy' ? T.TAG_DUPLICATE_COPY : T.TAG_REMOVED}</span>;
  }
  if (kind === 'duplicate') {
    // The amber tag opens the compare dialog (v0.114).
    return (
      <button
        type="button"
        className="ttag ttag--warn ev-tag-button"
        aria-label={T.reviewDuplicateLabel(T.candidateName(row))}
        onClick={(event) => {
          event.stopPropagation();
          ctx.handlers.onReview(row);
        }}
      >
        <IconAlertTriangle size={12} aria-hidden="true" />
        {T.TAG_POSSIBLE_DUPLICATE}
      </button>
    );
  }
  if (kind === 'makeup') return <span className="ttag">{T.TAG_MAKEUP}</span>;
  if (ctx.hidden) return null; // nothing about money while details are hidden
  if (row.paid) {
    // An overpaid amount, or a refund that stands: the tag names the amount (G1, Private screen 4).
    const showAmount = row.overpaidCents > 0 || row.refundedCents > 0;
    return (
      <span className="st-paytag">
        <span className="ttag ttag--ok">{showAmount ? T.paidAmount(row.paidCents) : T.TAG_PAID}</span>
        {row.overpaidCents > 0 && (
          <span className="st-overpaid">
            <IconAlertTriangle size={12} aria-hidden="true" />
            {T.overpaidText(row.overpaidCents)}
          </span>
        )}
      </span>
    );
  }
  return <span className="ttag">{T.TAG_NOT_PAID}</span>;
}

// The gray lines under the name: the registered line, then a make-up or private line.
// The first gray line: "Registered Oct 12" (or the withdrawn line on a removed row).
const firstLine = (row) => (row.status === 'withdrawn' ? T.withdrawnLine(row) : T.registeredLine(row));

// showFirst false: the PC with a mouse, where the first line sits beside the name instead (v0.109,
// G12, screen 1 — 36–40px rows; only a make-up or private line makes a second line).
function SubLines({ row, ctx, withSchool, showFirst = true }) {
  const removed = row.status === 'withdrawn';
  const first = firstLine(row);
  const lines = [];
  if (row.isMakeup) lines.push(T.makeupLine(ctx.subjectNames(row), ctx.belowPassMark(row)));
  if (row.privateOn && !removed) lines.push(T.privateLine(row.privateOn, row.privateTime, ctx.hidden ? null : row.expectedFeeCents));
  return (
    <>
      {showFirst && <span className="ev-ssub">{withSchool ? `${T.schoolName(row.locationCode)} · ${first}` : first}</span>}
      {lines.map((line) => (
        <span key={line} className="st-cline">
          {line}
        </span>
      ))}
    </>
  );
}

function CandidateRow({ row, ctx }) {
  const { layout, nav, handlers, hidden, oneSchool } = ctx;
  const name = T.candidateName(row);
  const removed = row.status === 'withdrawn';
  const showRecord = !hidden && !removed && !row.paid && !row.isMakeup && row.feeKind !== 'none';
  const showMenu = !removed || ctx.isAdmin; // staff get no ⋯ on removed rows (G13)
  const open = ctx.menuFor === row.id;
  const selected = open || ctx.selectedId === row.id;
  // Paid rows show the method actually used (screen 4: "Alex Kim … Check · Paid"); unpaid rows the family's choice.
  const payingCell = row.isMakeup ? T.NO_FEE_CELL : T.payingByText(row.paid ? (row.paidMethod ?? row.payingBy) : row.payingBy);
  const tag = <Tag row={row} ctx={ctx} />;

  const record = showRecord ? (
    <button
      type="button"
      className="btn btn-sm st-record"
      aria-label={T.recordPaymentLabel(name)}
      aria-disabled={ctx.busy ? 'true' : undefined}
      tabIndex={nav.itemTabIndex(row.id)}
      onClick={(event) => {
        event.stopPropagation();
        if (!ctx.busy) handlers.onRecordPayment(row, event.currentTarget);
      }}
    >
      {T.RECORD_PAYMENT}
    </button>
  ) : null;
  const more = showMenu ? (
    <IconButton
      label={T.moreForCandidate(name)}
      Icon={IconDots}
      aria-haspopup="menu"
      aria-expanded={open ? 'true' : 'false'}
      data-star-cand-more={row.id}
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
    className: `st-crow-c${removed ? ' is-removed' : ''}${selected ? ' is-selected' : ''}${layout.isPhone ? ' is-phone' : ''}`,
    role: 'row',
    'aria-label': name,
    ...nav.rowProps(row.id),
    onClick: () => handlers.onOpen(row),
  };

  if (layout.isPhone) {
    const school = oneSchool ? null : T.schoolName(row.locationCode);
    const payLine = hidden || removed ? null : row.isMakeup ? T.NO_FEE_CELL : row.paid ? T.paidOnPhone(row.paidMethod, row.paidOn) : T.payingByText(row.payingBy);
    return (
      <div {...rowProps}>
        <span className="ev-srow-main" role="cell">
          <span className="ev-sname-line">
            <span className="ev-sname">{name}</span>
            <span className="ev-ssub">{removed ? T.withdrawnLine(row) : T.registeredLine(row)}</span>
          </span>
          <span className="st-cline-plain">{school ? `${T.testingFor(row)} · ${school}` : T.testingFor(row)}</span>
          {row.isMakeup && <span className="st-cline">{T.makeupLine(ctx.subjectNames(row), ctx.belowPassMark(row))}</span>}
          {row.privateOn && !removed && <span className="st-cline">{T.privateLine(row.privateOn, row.privateTime, hidden ? null : row.expectedFeeCents)}</span>}
          {payLine && <span className="st-cline-plain l2">{payLine}</span>}
          <span className="ev-sline-tag">
            {tag}
            {record}
          </span>
        </span>
        <span className="acts" role="cell">
          {more}
        </span>
      </div>
    );
  }

  const oneLine = layout.isWide && !layout.isTouch; // PC with a mouse: name and "Registered …" on one line
  const cells = [
    <span key="name" className="ev-scell st-namecell" role="cell">
      {oneLine ? (
        <span className="st-nameline">
          <span className="ev-sname">{name}</span>
          <span className="ev-ssub">{firstLine(row)}</span>
        </span>
      ) : (
        <span className="ev-sname">{name}</span>
      )}
      <SubLines row={row} ctx={ctx} withSchool={!layout.isWide && !oneSchool} showFirst={!oneLine} />
    </span>,
  ];
  if (layout.isWide && !oneSchool) {
    cells.push(
      <span key="school" className="ev-scell" role="cell">
        {T.schoolName(row.locationCode)}
      </span>,
    );
  }
  cells.push(
    <span key="for" className="ev-scell" role="cell">
      {T.testingFor(row)}
    </span>,
  );
  if (!hidden) {
    cells.push(
      <span key="pay" className="ev-scell" role="cell">
        {payingCell}
      </span>,
    );
  }
  if (ctx.showStatusCol) {
    cells.push(
      <span key="tag" className="ev-scell" role="cell">
        {tag}
      </span>,
    );
  }
  if (!hidden && layout.isWide) {
    cells.push(
      <span key="on" className="ev-scell nowrap" role="cell">
        {row.paid ? T.monthDay(row.paidOn) : '—'}
      </span>,
    );
  }
  cells.push(
    <span key="acts" className="acts" role="cell">
      {record}
      {more}
    </span>,
  );
  return <div {...rowProps}>{cells}</div>;
}

// The column headers (PC and tablet), matching the cells above.
function HeadRow({ ctx }) {
  const { layout, hidden, oneSchool } = ctx;
  return (
    <div className="st-crow-c st-chead" role="row">
      <span role="columnheader">{T.COL_CANDIDATE}</span>
      {layout.isWide && !oneSchool && <span role="columnheader">{T.COL_SCHOOL}</span>}
      <span role="columnheader">{T.COL_TESTING_FOR}</span>
      {!hidden && <span role="columnheader">{T.COL_PAYING_BY}</span>}
      {ctx.showStatusCol && <span role="columnheader">{hidden ? T.COL_STATUS : T.COL_PAYMENT}</span>}
      {!hidden && layout.isWide && <span role="columnheader">{T.COL_PAID_ON}</span>}
      <span role="columnheader" aria-label={T.ACTIONS_COL} />
    </div>
  );
}

// The grid's columns: one CSS variable, worked out from which columns show (st-crow-c in star.css).
function columnsFor(ctx) {
  const { layout, hidden, oneSchool } = ctx;
  const cols = ['minmax(0, 1.6fr)'];
  if (layout.isWide && !oneSchool) cols.push('104px');
  cols.push('minmax(0, 1fr)');
  if (!hidden) cols.push('64px');
  if (ctx.showStatusCol) cols.push(hidden ? '148px' : '176px');
  if (!hidden && layout.isWide) cols.push('64px');
  // Record payment + ⋯ (touch: 44px ⋯); hidden: the ⋯ only
  const more = layout.isTouch ? 44 : 28;
  cols.push(hidden ? `${more}px` : `${more + 4 + (layout.isTouch ? 132 : 124)}px`);
  return cols.join(' ');
}

export default function CandidateRows({ rows, removedRows, removedOpen, onToggleRemoved, emptyText, ctx }) {
  const { layout, nav } = ctx;
  const style = layout.isPhone ? undefined : { '--st-cols': columnsFor(ctx) };
  return (
    <div className={`clist st-roster${layout.isTouch ? ' is-touch' : ''}`} role="table" aria-label={ctx.tableLabel} style={style}>
      {!layout.isPhone && <HeadRow ctx={ctx} />}
      <div role="rowgroup" {...nav.containerProps}>
        {rows.length === 0 && (
          <p className="tempty ev-roster-empty" role="row">
            <span role="cell">{emptyText}</span>
          </p>
        )}
        {rows.map((row) => (
          <CandidateRow key={row.id} row={row} ctx={ctx} />
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
                <span className="ev-removed-note">{T.NOT_IN_GRADING}</span>
              </span>
            </div>
            {removedOpen && removedRows.map((row) => <CandidateRow key={row.id} row={row} ctx={ctx} />)}
          </>
        )}
      </div>
    </div>
  );
}
