// Roster.jsx — the students of a Board breaking event, grouped by class time (the roster table / phone cards).
// Why it exists: the event page (EventPage.jsx) keeps the data and the saves; this file only DRAWS the rows,
// exactly as the approved pictures show them (docs/Board Breaking/Mockups/B-staff-gen.mjs wideRow / phoneRow):
//   PC and tablet: one table. Student (name, "age · [belt] rank", the small Same day tag) · Technical · Adult (two board
//     columns: just the number, a gray dash for zero, a tint each) · Paying by with the amount under it (on a tablet it sits under
//     the Payment tag instead) · Payment tag (Paid / Not paid / Awaiting card payment) · the Broke box (Camps' check-in box look)
//     · Mark paid and ⋯. A student who has broken keeps the numbers, in gray and light type (the .is-broke row).
//   Phone: a stacked card per student: two labelled chips (Technical 3 / Adult 0) on their own line, then the same pieces, the ⋯ on
//     the right. (Approved picture: docs/Board Breaking/Mockups/D-roster-boards-gen.mjs, "Boards separated".)
// One class at a time (the class switch above the table, as in Color belt testing; EventPage.jsx draws the switch and the
// class line "Group D · 4:20 – 5:00 PM · 3 registered · 2 broke"), so there is no heading inside the table any more.
// While Hide private details is on, the money parts (Paying by, the amount, the payment tag, Mark paid) are
// left out and the payment cell says "Hidden on this tablet" — the Broke box and the belt stay.
//
// Props:
//   rows          the selected class's students (Registration[])
//   isPhone       draw the phone cards instead of the table
//   hidden        Hide private details is on
//   busy          a save is running: Mark paid and Broke are unavailable meanwhile (aria-disabled)
//   notSavedId    the row whose last save didn't reach the database (a small "Not saved" mark)
//   markRowId     the row whose Mark paid box is open (keeps its button looking pressed)
//   handlers      { onMarkPaid(row, button), onBroke(row), onMore(row, button) }
import { IconCheck, IconDots } from '@tabler/icons-react';
import Belt from '../../../components/Belt.jsx';
import IconButton from '../../../components/IconButton.jsx';
import { formatMoney } from '../../../lib/money.js';
import { HIDDEN_ON_THIS_TABLET } from '../../../lib/privateDetails.js';
import { beltFor, owedCents, paidState, payingByLabel, rankLabel } from '../../../lib/breaking/breakingRules.js';
import * as T from '../../../lib/breaking/text/roster.js';

export const fullName = (row) => `${row.firstName} ${row.lastName}`;

// "8 · [belt picture] Orange belt" — the name of the rank is always written next to the picture.
function RankLine({ row }) {
  return (
    <span className="ev-ssub brk-rank">
      <span>{row.age} ·</span>
      <Belt belt={beltFor(row.rankName, { danStripe: true })} size="row" />
      <span>{rankLabel(row.rankName)}</span>
    </span>
  );
}

function PayTag({ row, notSaved }) {
  const state = paidState(row);
  return (
    <>
      {state === 'paid' && <span className="ttag ttag--ok">{T.TAG_PAID}</span>}
      {state === 'awaiting' && <span className="ttag ttag--warn">{T.TAG_AWAITING}</span>}
      {state === 'unpaid' && <span className="ttag">{T.TAG_NOT_PAID}</span>}
      {notSaved && <span className="ttag ttag--warn">{T.TAG_NOT_SAVED}</span>}
    </>
  );
}

// The Broke box: Camps' check-in box (cp-dc). Pressed = broke (green, a check); pressing it again undoes it.
function BrokeBox({ row, busy, onBroke }) {
  const name = fullName(row);
  const common = {
    type: 'button',
    'data-broke': row.id,
    'aria-disabled': busy ? 'true' : undefined,
    onClick: (event) => {
      event.stopPropagation();
      if (!busy) onBroke(row);
    },
  };
  if (row.broke) {
    return (
      <button {...common} className="cp-dc cp-dc--came" aria-label={T.undoBrokeFor(name)}>
        <span className="cp-dc-val">
          <IconCheck size={14} aria-hidden="true" />
          {T.BROKE}
        </span>
      </button>
    );
  }
  return (
    <button {...common} className="cp-dc cp-dc--checkin" aria-label={T.markBroke(name)}>
      <span className="cp-dc-val">{T.BROKE}</span>
    </button>
  );
}

function MarkPaidButton({ row, busy, hidden, onMarkPaid }) {
  if (hidden || paidState(row) === 'paid') return null;
  return (
    <button
      type="button"
      className="btn btn-sm ev-markpaid"
      data-mark={row.id}
      aria-label={T.markPaidFor(fullName(row))}
      aria-disabled={busy ? 'true' : undefined}
      onClick={(event) => {
        if (!busy) onMarkPaid(row, event.currentTarget);
      }}
    >
      {/* ti-check = Mark paid (Color belt testing's button icon) */}
      <IconCheck size={16} aria-hidden="true" />
      {T.MARK_PAID}
    </button>
  );
}

function MoreButton({ row, onMore }) {
  return <IconButton label={T.moreFor(fullName(row))} Icon={IconDots} aria-haspopup="menu" data-more={row.id} onClick={(event) => onMore(row, event.currentTarget)} />;
}

// One board number: the number itself (a bold 16px figure), or a quiet gray dash for zero. Never colour alone: the column header (PC and
// tablet) or the chip's own visible label (phone) says which kind of board it is, so the number carries no label of its own. A zero's
// dash is hidden from screen readers and the word "0" is read in its place.
function BoardNumber({ n }) {
  return n === 0 ? (
    <b className="brk-zero">
      <span aria-hidden="true">–</span>
      <span className="visually-hidden">0</span>
    </b>
  ) : (
    <b className="brk-num">{n}</b>
  );
}

// One row on PC / tablet: Student · Technical · Adult · Paying by · Payment · Broke · actions. On a tablet there is no room for a
// Paying by column, so "Cash · $9" sits under the Payment tag (brk-payby-inline; the CSS decides which one shows).
function WideRow({ row, busy, hidden, notSavedId, handlers }) {
  const name = fullName(row);
  return (
    <div className={`ev-srow brk-srow${row.broke ? ' is-broke' : ''}`} role="row" aria-label={name} data-nav-row={row.id}>
      <span className="ev-scell ev-sname-line" role="cell">
        <span className="ev-sname">{name}</span>
        <RankLine row={row} />
        {row.sameDay && <span className="ttag">{T.SAME_DAY}</span>}
      </span>
      <span className="ev-scell brk-bcell brk-bcell--tech" role="cell">
        <BoardNumber n={row.techBoards} />
      </span>
      <span className="ev-scell brk-bcell brk-bcell--adult" role="cell">
        <BoardNumber n={row.adultBoards} />
      </span>
      <span className="ev-scell brk-payby-col" role="cell">
        {!hidden && (
          <>
            {payingByLabel(row.payingBy)}
            <span className="brk-sub">{formatMoney(owedCents(row))}</span>
          </>
        )}
      </span>
      <span className="ev-scell" role="cell">
        {hidden ? <span className="brk-hidden-pay">{HIDDEN_ON_THIS_TABLET}</span> : <PayTag row={row} notSaved={notSavedId === row.id} />}
        {!hidden && (
          <span className="brk-sub brk-payby-inline">
            {payingByLabel(row.payingBy)} · {formatMoney(owedCents(row))}
          </span>
        )}
      </span>
      <span className="ev-scell" role="cell">
        <BrokeBox row={row} busy={busy} onBroke={handlers.onBroke} />
      </span>
      <span className="acts" role="cell">
        <MarkPaidButton row={row} busy={busy} hidden={hidden} onMarkPaid={handlers.onMarkPaid} />
        <MoreButton row={row} onMore={handlers.onMore} />
      </span>
    </div>
  );
}

// One card on a phone.
function PhoneRow({ row, busy, hidden, notSavedId, handlers }) {
  const name = fullName(row);
  return (
    <div className={`ev-srow is-phone brk-prow${row.broke ? ' is-broke' : ''}`} role="row" aria-label={name} data-nav-row={row.id}>
      <span className="ev-srow-main" role="cell">
        <span className="ev-sname-line">
          <span className="ev-sname">{name}</span>
          <RankLine row={row} />
        </span>
        {/* Two labelled chips side by side on their own line: "Technical 3" / "Adult 0" */}
        <span className="ev-sline brk-chips">
          <span className="brk-chip brk-chip--tech">
            <span className="brk-chip-label">{T.COL_TECHNICAL}</span>
            <BoardNumber n={row.techBoards} />
          </span>
          <span className="brk-chip brk-chip--adult">
            <span className="brk-chip-label">{T.COL_ADULT}</span>
            <BoardNumber n={row.adultBoards} />
          </span>
        </span>
        {!hidden && (
          <span className="ev-sline l2">
            {payingByLabel(row.payingBy)} · {formatMoney(owedCents(row))}
            {row.sameDay && ' '}
            {row.sameDay && <span className="ttag">{T.SAME_DAY}</span>}
          </span>
        )}
        <span className="ev-sline ev-sline-tag">
          {hidden ? <span className="brk-hidden-pay">{HIDDEN_ON_THIS_TABLET}</span> : <PayTag row={row} notSaved={notSavedId === row.id} />}
          <MarkPaidButton row={row} busy={busy} hidden={hidden} onMarkPaid={handlers.onMarkPaid} />
          <BrokeBox row={row} busy={busy} onBroke={handlers.onBroke} />
        </span>
      </span>
      <span className="acts" role="cell">
        <MoreButton row={row} onMore={handlers.onMore} />
      </span>
    </div>
  );
}

export default function Roster({ rows, isPhone, hidden, busy, notSavedId, handlers }) {
  const Row = isPhone ? PhoneRow : WideRow;
  return (
    <div className={`clist ev-roster brk-roster${isPhone ? ' is-phone is-touch' : ''}`} role="table" aria-label={T.STUDENTS_BY_CLASS}>
      {!isPhone && (
        <div className="ev-srow ev-shead brk-srow" role="row">
          <span role="columnheader">{T.COL_STUDENT}</span>
          <span role="columnheader" className="brk-bcell brk-bcell--tech brk-bhead">{T.COL_TECHNICAL}</span>
          <span role="columnheader" className="brk-bcell brk-bcell--adult brk-bhead">{T.COL_ADULT}</span>
          <span role="columnheader" className="brk-payby-col">{hidden ? '' : T.COL_PAYING_BY}</span>
          <span role="columnheader">{T.COL_PAYMENT}</span>
          <span role="columnheader">{T.COL_BROKE}</span>
          <span role="columnheader" aria-label={T.COL_ACTIONS} />
        </div>
      )}
      <div role="rowgroup">
        {rows.map((row) => (
          <Row key={row.id} row={row} busy={busy} hidden={hidden} notSavedId={notSavedId} handlers={handlers} />
        ))}
      </div>
    </div>
  );
}
