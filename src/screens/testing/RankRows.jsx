// RankRows.jsx — the ranks of ONE open class.
// Why it exists: approved mockup screen 1. The ranks are shown in belt order. Since CB14 (rulebook
// v0.427) the list is drawn in two parts, chosen by ctx.part:
//   - 'settings' (Settings → Classes and ranks): the names. PC and tablet: Rank · Testing for ·
//     actions. Phone: one line, "Blue → High Blue". No prices at all.
//   - 'prices' (Color belt testing → Prices): the money. PC and tablet: Rank · Early · Testing day ·
//     Private · Sparring gear · pencil, all four on every size (there is no "Testing for" column to
//     share the room with). Phone: "Blue" on top, the prices under it. No grips, no ⋯ menu, no tags.
// "Testing for" is never typed: it's the next rank, and for the last rank the class's final
// award (worked out by src/lib/testing/rankOrder.js).
//
// Every rank shows a small belt picture before its name and before its "Testing for" name
// (v0.64; phone: "[belt] Yellow → [belt] Orange"). The names are always written too.
//
// Row actions (guidelines 8 + v0.43, v0.63):
//   - Settings (admins only): the grip (drag to reorder) on the left — a 16px icon with a 44×44
//     touch area on touch screens — and Edit + ⋯ on the right
//   - Settings, phones under 360px wide: ⋯ only, no Edit pencil (v0.68) — long names like
//     "Bo Dan - 1 Big Stripe" need the room; tapping the row opens Edit, and the ⋯ menu
//     starts with "Edit rank" at that width (v0.69, so screen readers can find it)
//   - Prices, admins: one pencil (Edit prices), on every width (there is no ⋯ menu to hold it)
//   - Prices, staff: nothing to press — the list is view only (v0.427), so no dialog either
//   - touch: the icons are 28px with a 44px tap area
// Clicking anywhere else on a row opens it, too (admins). One tag per row at most, in this order:
// "Not saved" (amber) > "Final award" / "No new rank" (Settings only).
// "No new rank" (v0.62) marks the last rank of a class whose final award is None: it doesn't
// promote, on purpose — so it's a neutral gray tag, never the amber reminder.
//
// Keyboard (useRowArrowNav.js): the whole list is ONE Tab stop. ↑ ↓ move between rows (and
// class lines), Enter opens a row, ← → move between the row's own buttons. A row's buttons are
// only in the Tab order while that row is the active one (ctx.nav.itemTabIndex).
//
// While a rank is dragged (any device, v0.63), a gray "lifted" copy of it sits in the list at the spot where
// it will land, under a 2px blue line; the original row stays where it was, faded (approved
// mockup screen 6).
import { Fragment } from 'react';
import { IconAlertTriangle, IconDots, IconEdit } from '@tabler/icons-react';
import Belt from '../../components/Belt.jsx';
import Grip from '../../components/Grip.jsx';
import IconButton from '../../components/IconButton.jsx';
import { formatMoney } from '../../lib/money.js';
import * as T from './text.js';

// The table's columns (CSS grid), depending on the part, the device and on who is looking.
export function rankGridColumns({ hasGrip, isWide, isTouch, isAdmin, part = 'settings' }) {
  const columns = [];
  if (hasGrip) columns.push(isTouch ? '44px' : '24px'); // the grip (44px touch area on touch screens)
  if (part === 'prices') {
    // Rank, then Early / Testing day / Private / Sparring gear — all four on every size.
    columns.push('minmax(0, 1fr)', '72px', '96px', '72px', '112px');
    if (isAdmin) columns.push(isTouch ? '48px' : '36px'); // the one pencil
    return columns.join(' ');
  }
  // Rank, Testing for. Tablets give the two name columns (each with a belt picture) equal room.
  columns.push('minmax(0, 1fr)', isWide ? 'minmax(0, 1.6fr)' : 'minmax(0, 1fr)');
  if (isAdmin) columns.push(isTouch ? '88px' : '64px'); // Edit + ⋯
  return columns.join(' ');
}

// A small tag, e.g. "Final award". The amber "Not saved" one has the warning triangle.
export function Tag({ kind }) {
  if (kind === 'notSaved') {
    return (
      <span className="ttag ttag--warn">
        <IconAlertTriangle size={12} aria-hidden="true" />
        {T.TAG_NOT_SAVED}
      </span>
    );
  }
  const text = { finalAward: T.TAG_FINAL_AWARD, noNewRank: T.TAG_NO_NEW_RANK }[kind];
  return <span className="ttag">{text}</span>;
}

// The amber reminder on the last rank when the class has no final award.
function AwardReminder({ isAdmin }) {
  return (
    <span className="tfwarn">
      <IconAlertTriangle size={16} aria-hidden="true" />
      <span>{isAdmin ? T.AWARD_NOT_SET_ADMIN : T.AWARD_NOT_SET_STAFF}</span>
    </span>
  );
}

// The grip handle: the shared one (src/components/Grip.jsx) since Dashboard core step 1. This
// export keeps the imports of Calendar, Forms and Prospects working.
export { Grip };

// Phone line 1 is two units: "[belt] Rank" and "→ [belt] Next rank". Each unit is an
// inline-block, so the line breaks only BEFORE the arrow — unless one unit alone is wider than
// the line; then it wraps inside, but never between a belt and the first word of its name.
function BeltName({ belt, name, prefix = '' }) {
  const [first, ...rest] = String(name).split(' ');
  return (
    <span className="belt-name">
      <span className="nowrap">
        {prefix}
        <Belt belt={belt} />
        {first}
      </span>
      {rest.length > 0 && ` ${rest.join(' ')}`}
    </span>
  );
}

// The belt of the rank this one tests for (the next rank, or the final award). None / Not set
// → no belt. C's withTestingFor gives rank.nextBelt; ctx.beltById is a fallback lookup.
function nextBeltOf(rank, ctx) {
  if (!rank.testingFor) return null;
  return rank.nextBelt ?? ctx.beltById?.get(rank.testingFor.rankId) ?? null;
}

// Which single tag a row shows. (Sparring gear is never a tag any more: on the phone it is
// always "· Sparring gear" text on the price line; PC/tablet have their own column / dialog.)
function rowTag(rank, notSaved) {
  if (notSaved) return 'notSaved';
  if (rank.isLast && rank.finalAwardState === 'set') return 'finalAward';
  if (rank.isLast && rank.finalAwardState === 'none') return 'noNewRank';
  return null;
}

// The right-hand actions of a row (admins only). tabIndex: 0 only on the active row (see the top).
// Settings: Edit rank + ⋯ (showEdit false on phones under 360px, v0.68). Prices: just Edit prices.
function RowActions({ rank, part, menuOpen, tabIndex, onEdit, onMore, showEdit = true }) {
  const isPrices = part === 'prices';
  return (
    <span className="acts">
      {showEdit && (
        <IconButton
          label={isPrices ? T.editPricesLabel(rank.name) : T.editRankLabel(rank.name)}
          Icon={IconEdit}
          tabIndex={tabIndex}
          onClick={(event) => onEdit(rank, event.currentTarget)}
        />
      )}
      {!isPrices && (
        <IconButton
          label={T.moreFor(rank.name)}
          Icon={IconDots}
          tabIndex={tabIndex}
          aria-haspopup="menu"
          aria-expanded={menuOpen ? 'true' : 'false'}
          data-more-for={rank.id}
          onClick={(event) => onMore(rank, event.currentTarget)}
        />
      )}
    </span>
  );
}

// One table row (PC / tablet). `lifted` = the gray copy shown at the landing spot during a drag.
function TableRow({ rank, cls, ctx, lifted = false }) {
  const { isAdmin, layout, notSavedId, drag, gripProps, nav, menuFor, handlers } = ctx;
  const isPrices = ctx.part === 'prices';
  const notSaved = notSavedId === rank.id;
  const tag = isPrices ? null : rowTag(rank, notSaved);
  const beingDragged = !lifted && drag?.id === rank.id;
  // Dragged to a new spot: the original row fades. Not moved yet: it lifts right where it is.
  const isOrigin = beingDragged && drag.toIndex !== drag.fromIndex;
  const liftedHere = beingDragged && !isOrigin;
  const selected = !lifted && ctx.selectedRankId === rank.id; // open in the dialog right now
  const tabIndex = lifted ? -1 : nav.itemTabIndex(rank.id);
  const rowAttributes = lifted
    ? { 'aria-hidden': 'true', inert: true }
    : {
        ...nav.rowProps(rank.id),
        role: 'row',
        'data-drag-group': cls.id,
        'data-drag-id': rank.id,
        // Staff on the Prices tab: nothing opens (view only).
        onClick: isAdmin
          ? (event) => {
              if (event.target.closest('button')) return; // the buttons do their own thing
              handlers.onOpenRank(rank, event.currentTarget);
            }
          : undefined,
      };
  return (
    <div
      className={`rrow${lifted || liftedHere ? ' is-lifted' : ''}${isOrigin ? ' is-drag-origin' : ''}${selected ? ' is-selected' : ''}`}
      style={{ gridTemplateColumns: ctx.columns }}
      {...rowAttributes}
    >
      {layout.hasGrip && (
        <span role="cell" className="rcell">
          <Grip label={T.dragToReorder(rank.name)} gripProps={gripProps(cls.id, rank.id)} tabIndex={tabIndex} />
        </span>
      )}
      <span role="cell" className="rcell rk">
        <span className="rk-belt-name">
          <Belt belt={rank} />
          <span className="rk-name">{rank.name}</span>
        </span>
        {tag === 'notSaved' && <Tag kind="notSaved" />}
      </span>
      {!isPrices && (
        <span role="cell" className="rcell rk">
          {rank.isLast && rank.finalAwardState === 'notSet' && <AwardReminder isAdmin={isAdmin} />}
          {rank.isLast && rank.finalAwardState === 'none' &&
            // The tag, or (if this row's one tag is "Not saved") the same words as plain gray text.
            (tag === 'noNewRank' ? <Tag kind="noNewRank" /> : <span className="ro-muted">{T.TAG_NO_NEW_RANK}</span>)}
          {!(rank.isLast && (rank.finalAwardState === 'notSet' || rank.finalAwardState === 'none')) && (
            <>
              <span className="rk-belt-name">
                <Belt belt={nextBeltOf(rank, ctx)} />
                <span className="rk-name">{rank.testingFor?.name}</span>
              </span>
              {tag === 'finalAward' && <Tag kind="finalAward" />}
            </>
          )}
        </span>
      )}
      {isPrices && (
        <>
          <span role="cell" className="rcell num">
            {formatMoney(rank.earlyCents)}
          </span>
          <span role="cell" className="rcell num">
            {formatMoney(rank.dayCents)}
          </span>
          <span role="cell" className="rcell num">
            {formatMoney(rank.privateCents)}
          </span>
          <span role="cell" className="rcell">
            {rank.sparringGear ? T.YES : T.NO}
          </span>
        </>
      )}
      {isAdmin && (
        <span role="cell" className="rcell rcell-acts">
          <RowActions
            rank={rank}
            part={ctx.part}
            menuOpen={menuFor === rank.id}
            tabIndex={tabIndex}
            onEdit={handlers.onEditRank}
            onMore={handlers.onMoreRank}
          />
        </span>
      )}
    </div>
  );
}

// One stacked row (phone). `lifted` = the gray copy shown at the landing spot during a drag.
function PhoneRow({ rank, cls, ctx, lifted = false }) {
  const { isAdmin, layout, notSavedId, nav, menuFor, handlers, drag, gripProps } = ctx;
  const isPrices = ctx.part === 'prices';
  const selected = !lifted && ctx.selectedRankId === rank.id;
  const beingDragged = !lifted && drag?.id === rank.id;
  const isOrigin = beingDragged && drag.toIndex !== drag.fromIndex;
  const liftedHere = beingDragged && !isOrigin;
  const tabIndex = lifted ? -1 : nav.itemTabIndex(rank.id);
  const tag = isPrices ? null : rowTag(rank, notSavedId === rank.id);
  const awardMissing = !isPrices && rank.isLast && rank.finalAwardState === 'notSet';
  const noNewRank = !isPrices && rank.isLast && rank.finalAwardState === 'none'; // None: just the rank's name + tag
  // Settings: line 2 exists only for the "No new rank" words when the row's one tag is "Not saved".
  const noNewRankText = noNewRank && tag !== 'noNewRank';
  return (
    <div
      className={`prow${selected ? ' is-selected' : ''}${lifted || liftedHere ? ' is-lifted' : ''}${isOrigin ? ' is-drag-origin' : ''}`}
      {...(lifted
        ? { 'aria-hidden': 'true', inert: true }
        : {
            role: 'row',
            ...nav.rowProps(rank.id),
            'data-drag-group': cls.id,
            'data-drag-id': rank.id,
            onClick: isAdmin
              ? (event) => {
                  if (event.target.closest('button')) return;
                  handlers.onOpenRank(rank, event.currentTarget);
                }
              : undefined,
          })}
    >
      {layout.hasGrip && (
        <span role="cell" className="prow-grip">
          <Grip label={T.dragToReorder(rank.name)} gripProps={gripProps(cls.id, rank.id)} tabIndex={tabIndex} />
        </span>
      )}
      <div role="cell" className="prow-main">
        <div className="l1">
          {/* Settings: "[belt] Yellow → [belt] Orange". Each belt stays glued to its name; a long
              pair wraps between the two halves. Prices: just "[belt] Yellow". */}
          <span className="l1-names">
            <BeltName belt={rank} name={rank.name} />
            {!isPrices && !(awardMissing || noNewRank) && (
              <>
                {' '}
                <BeltName belt={nextBeltOf(rank, ctx)} name={rank.testingFor?.name ?? ''} prefix="→ " />
              </>
            )}
          </span>
          {tag && <Tag kind={tag} />}
        </div>
        {awardMissing && (
          <div className="l1b">
            <AwardReminder isAdmin={isAdmin} />
          </div>
        )}
        {/* Prices: each price never breaks inside itself, and the "·" travels with the price after
            it, so a narrow phone never shows a line ending in a lonely dot. */}
        {isPrices && (
          <div className="l2">
            <span>{T.PHONE_EARLY(formatMoney(rank.earlyCents))}</span> <span>· {T.PHONE_DAY(formatMoney(rank.dayCents))}</span>{' '}
            <span>· {T.PHONE_PRIVATE(formatMoney(rank.privateCents))}</span>
            {rank.sparringGear && (
              <>
                {' '}
                <span>· {T.PHONE_SPARRING_TEXT}</span>
              </>
            )}
          </div>
        )}
        {/* None class, but the row's one tag is "Not saved": the words move here as gray text
            (the same fallback as the PC's Testing for column). */}
        {noNewRankText && (
          <div className="l2">
            <span>{T.TAG_NO_NEW_RANK}</span>
          </div>
        )}
      </div>
      {isAdmin && (
        <span role="cell" className="rcell-acts">
          <RowActions
            rank={rank}
            part={ctx.part}
            showEdit={isPrices || !layout.isNarrowPhone}
            menuOpen={menuFor === rank.id}
            tabIndex={tabIndex}
            onEdit={handlers.onEditRank}
            onMore={handlers.onMoreRank}
          />
        </span>
      )}
    </div>
  );
}

// The blue line showing where a dragged rank will land (only when it's a new spot).
function DropLine() {
  return <div className="dropline" aria-hidden="true" />;
}

export default function RankRows({ cls, ctx }) {
  const { layout, drag } = ctx;
  const isPrices = ctx.part === 'prices';
  // A rank of THIS class is being dragged to a new spot: show the line + lifted copy there.
  const moving = drag && drag.group === cls.id && drag.toIndex !== drag.fromIndex;
  const lifted = moving ? cls.ranks.find((rank) => rank.id === drag.id) : null;
  const Row = layout.isPhone ? PhoneRow : TableRow;
  const landing = lifted ? (
    <>
      <DropLine />
      <Row rank={lifted} cls={cls} ctx={ctx} lifted />
    </>
  ) : null;

  if (layout.isPhone) {
    return (
      <div role="table" aria-label={cls.name} className="ptable">
        {cls.ranks.map((rank, index) => (
          <Fragment key={rank.id}>
            {moving && drag.gap === index && landing}
            <PhoneRow rank={rank} cls={cls} ctx={ctx} />
          </Fragment>
        ))}
        {moving && drag.gap === cls.ranks.length && landing}
      </div>
    );
  }

  return (
    <div role="table" aria-label={cls.name} className="rtable">
      <div role="row" className="rhead" style={{ gridTemplateColumns: ctx.columns }}>
        {layout.hasGrip && <span role="columnheader" className="rcell" aria-hidden="true" />}
        <span role="columnheader" className="rcell">
          {T.COL_RANK}
        </span>
        {isPrices ? (
          <>
            <span role="columnheader" className="rcell num">
              {T.COL_EARLY}
            </span>
            <span role="columnheader" className="rcell num">
              {T.COL_TESTING_DAY}
            </span>
            <span role="columnheader" className="rcell num">
              {T.COL_PRIVATE}
            </span>
            <span role="columnheader" className="rcell">
              {T.COL_SPARRING}
            </span>
          </>
        ) : (
          <span role="columnheader" className="rcell">
            {T.COL_TESTING_FOR}
          </span>
        )}
        {ctx.isAdmin && <span role="columnheader" className="rcell" aria-hidden="true" />}
      </div>
      {cls.ranks.map((rank, index) => (
        <Fragment key={rank.id}>
          {moving && drag.gap === index && landing}
          <TableRow rank={rank} cls={cls} ctx={ctx} />
        </Fragment>
      ))}
      {moving && drag.gap === cls.ranks.length && landing}
    </div>
  );
}
