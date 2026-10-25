// RosterRows.jsx — the list of a cycle's Black Belt candidates (the roster), approved mockup
// Candidates 1 (and 2 for staff, 9 for the overpaid / Kukkiwon tags).
// Why it exists: contract CONTRACT-0016-B2 §3.2. This file only DRAWS the rows; CandidatesTab
// decides what a click does. One row per candidate, in the database's order (Dan, then school —
// Shrewsbury, Worcester — then last name):
//   PC (1024px and wider):  Candidate ("Registered Mar 10" beside the name) · Dan · School ·
//                           Plan ("· Kukkiwon") · Payments (one tag) · Balance ·
//                           Record payment (rows with a balance) · ⋯
//   Tablet:                 Candidate ("1st Dan · Shrewsbury" under it) · Plan · Payments ·
//                           Balance · ⋯ (Record payment moves into ⋯)
//   Phone:                  name; "1st Dan · Shrewsbury · 3 payments · Kukkiwon"; the tag and the
//                           balance; ⋯ on the right; no row button
// With the device's Hide payments switch on (v0.215, OP-B7) the Payments and Balance columns and
// the Record payment button aren't drawn at all.
// One tag per row (§8): "⚠ Possible duplicate" (amber; opens the compare) outranks the money tag.
// Withdrawn candidates sit in a collapsed "Removed (N)" group at the bottom, with a gray Removed /
// Duplicate copy tag and their balance (Star v0.113, OP-B10).
// A make-up from an earlier cycle (contract 0025 §14.5, mockup G06, proposal 27): Plan "No fee",
// the gray "Make-up" tag in Payments, Balance "—", no Record payment, and a gray second line under
// the name, "Make-up from Spring 2027 · retests Free sparring" (in place of "Registered Sep 14").
// A row added a moment ago glows pale amber for a moment (ctx.flashId, G06's "after Add").
// Keyboard (useRowArrowNav): the list is one Tab stop, ↑ ↓ move between rows, Enter opens one,
// ← → reach the row's buttons.
import { Fragment } from 'react';
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import IconButton from '../../../components/IconButton.jsx';
import { ICONS } from './icons.js';
import * as T from '../text.js';

// The one tag of a row.
export function RowTag({ row, onReview }) {
  if (row.status === 'withdrawn') {
    return <span className="ttag">{row.withdrawnReason === 'duplicate_copy' ? T.TAG_DUPLICATE_COPY : T.TAG_REMOVED}</span>;
  }
  if (row.duplicateState === 'possible' && onReview) {
    const Warn = ICONS.warn;
    return (
      <button
        type="button"
        className="ttag ttag--warn ev-tag-button"
        aria-label={T.reviewDuplicateLabel(T.candidateName(row))}
        onClick={(event) => {
          event.stopPropagation();
          onReview(row, event.currentTarget);
        }}
      >
        <Warn size={12} aria-hidden="true" />
        {T.TAG_POSSIBLE_DUPLICATE}
      </button>
    );
  }
  // A make-up has no fee: always the gray "Make-up" tag (Star v0.116's default tag color)
  if (row.isMakeup) return <span className="ttag">{T.TAG_MAKEUP}</span>;
  return <MoneyTag money={row.money} />;
}

// The money tag alone (also the detail's tag under its title).
export function MoneyTag({ money }) {
  const tag = T.moneyTag(money);
  if (!tag.text) return null;
  const kind = { ok: ' ttag--ok', warn: ' ttag--warn', red: ' bb-tag--red', gray: '' }[tag.kind];
  return <span className={`ttag${kind}`}>{tag.text}</span>;
}

function Balance({ row }) {
  if (row.isMakeup) return <span className="bb-balance">{T.BALANCE_NONE}</span>;
  const over = row.money?.overpaidCents > 0;
  return <span className={`bb-balance${over ? ' is-over' : ''}`}>{T.balanceText(row.money)}</span>;
}

// One candidate. ctx = { layout, nav, hidden, busy, menuFor, flashId, onOpen, onMore, onRecord, onReview }
function CandidateRow({ row, ctx }) {
  const { layout, nav, hidden } = ctx;
  const name = T.candidateName(row);
  const removed = row.status === 'withdrawn';
  const open = ctx.menuFor === row.id;
  const makeup = row.isMakeup === true;
  const showRecord = !hidden && !removed && !makeup && layout.isWide && (row.money?.balanceCents ?? 0) > 0;
  const plan = makeup ? T.PLAN_NO_FEE : T.planCell(row.planName, row.kukkiwon);
  // The make-up's gray line (G 27)
  const makeupText = makeup ? <span className="bb-cline bb-makeup-line">{T.makeupLine(row.makeupOfCycleName, row.retestNames)}</span> : null;
  const RecordIcon = ICONS.recordPayment;

  const record = showRecord ? (
    <button
      type="button"
      className="btn btn-sm bb-record"
      aria-label={T.recordPaymentFor(name)}
      aria-disabled={ctx.busy ? 'true' : undefined}
      tabIndex={nav.itemTabIndex(row.id)}
      onClick={(event) => {
        event.stopPropagation();
        if (!ctx.busy) ctx.onRecord(row, event.currentTarget);
      }}
    >
      <RecordIcon size={16} aria-hidden="true" />
      {T.RECORD_PAYMENT}
    </button>
  ) : null;
  const more = ctx.hasMenu(row) ? (
    <IconButton
      label={T.moreForCandidate(name)}
      Icon={ICONS.more}
      aria-haspopup="menu"
      aria-expanded={open ? 'true' : 'false'}
      data-candidate-more={row.id}
      tabIndex={nav.itemTabIndex(row.id)}
      onClick={(event) => {
        event.stopPropagation();
        ctx.onMore(row, event.currentTarget);
      }}
    />
  ) : (
    <span className="ev-more-spacer" aria-hidden="true" />
  );
  const tag = hidden && row.duplicateState !== 'possible' && !removed ? null : <RowTag row={row} onReview={removed ? null : ctx.onReview} />;
  const rowProps = {
    className: `ev-srow bb-crow${removed ? ' is-removed' : ''}${open ? ' is-selected' : ''}${layout.isPhone ? ' is-phone' : ''}${ctx.flashId === row.id ? ' is-flash' : ''}`,
    role: 'row',
    'aria-label': name,
    ...nav.rowProps(row.id),
    onClick: (event) => ctx.onOpen(row, event.currentTarget),
  };

  if (layout.isPhone) {
    return (
      <div {...rowProps}>
        <span className="ev-srow-main" role="cell">
          <span className="ev-sname">{name}</span>
          {makeupText}
          <span className="bb-cline">{makeup ? `${T.danSchool(row.dan, row.locationCode)} · ${T.PLAN_NO_FEE}` : T.phoneSubline(row)}</span>
          {(tag || !hidden) && (
            <span className="ev-sline-tag bb-ctagline">
              {tag}
              {!hidden && <Balance row={row} />}
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
      <span className={`ev-scell ev-sname-line${makeup ? ' bb-makeup-name' : ''}`} role="cell">
        <span className="ev-sname">{name}</span>
        {layout.isWide ? (
          makeup ? makeupText : <span className="ev-ssub">{T.registeredOnShort(row.registeredOn)}</span>
        ) : (
          <>
            {makeupText}
            <span className="bb-cline bb-cline--under">{T.danSchool(row.dan, row.locationCode)}</span>
          </>
        )}
      </span>
      {layout.isWide && (
        <>
          <span className="ev-scell" role="cell">
            {T.DAN_LABELS[row.dan]}
          </span>
          <span className="ev-scell" role="cell">
            {T.schoolName(row.locationCode)}
          </span>
        </>
      )}
      <span className="ev-scell" role="cell">
        {plan}
      </span>
      {!hidden && (
        <>
          <span className="ev-scell" role="cell">
            {tag}
          </span>
          <span className="ev-scell bb-num" role="cell">
            <Balance row={row} />
          </span>
        </>
      )}
      {hidden && (
        <span className="ev-scell" role="cell">
          {tag}
        </span>
      )}
      <span className="acts" role="cell">
        {record}
        {more}
      </span>
    </div>
  );
}

export default function RosterRows({ rows, removedRows, removedOpen, onToggleRemoved, emptyText, caption, ctx }) {
  const { layout, nav, hidden } = ctx;
  const listClass = `clist ev-roster bb-roster${layout.isWide ? ' is-wide' : ''}${layout.isPhone ? ' is-phone' : ''}${hidden ? ' is-nomoney' : ''}`;
  return (
    <div className={listClass} role="table" aria-label={caption}>
      {!layout.isPhone && (
        <div className="ev-srow ev-shead bb-crow" role="row">
          <span role="columnheader">{T.COL_CANDIDATE}</span>
          {layout.isWide && <span role="columnheader">{T.COL_DAN}</span>}
          {layout.isWide && <span role="columnheader">{T.COL_SCHOOL}</span>}
          <span role="columnheader">{T.COL_PLAN}</span>
          {!hidden && <span role="columnheader">{T.COL_PAYMENTS}</span>}
          {!hidden && (
            <span role="columnheader" className="bb-num">
              {T.COL_BALANCE}
            </span>
          )}
          {hidden && <span role="columnheader" aria-label={T.COL_STATUS} />}
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
          <CandidateRow key={row.id} row={row} ctx={ctx} />
        ))}
        {removedRows.length > 0 && (
          <Fragment>
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
            {removedOpen && removedRows.map((row) => <CandidateRow key={row.id} row={row} ctx={ctx} />)}
          </Fragment>
        )}
      </div>
    </div>
  );
}
