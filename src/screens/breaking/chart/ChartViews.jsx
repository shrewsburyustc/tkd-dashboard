// ChartViews.jsx — what the Chart and prices tab shows: the Prices card, the Age groups card and the Board chart.
// Why it exists: approved pictures C-admin-prices (tab-top) and C-admin-chart (chart), rulebook v1.300. This file only
// DRAWS; ChartAndPricesTab.jsx holds the data and decides what the buttons do (handlers).
//   Prices card      Star testing's Fees look: a title, a pencil, one row per price, then the worked example
//   Age groups card  one line ("Child: 12 and under · Teen / Adult: 13 and up") and a gray sentence
//   Board chart      four groups (Little Tiger, Child, Teen / Adult, Black Belt), each opens and closes like a class
//                    in Classes and ranks. PC and tablet: Rank · Technique · Technical · Adult + pencil and ⋯.
//                    Phone: each rank is a small card (belt and name, "3 Technical · 0 Adult", the technique).
// A rank is identified by its key (chartRules.rankKey) because the database remakes the rows' ids on every save.
import { IconChevronDown, IconChevronUp, IconDots, IconEdit, IconPlus } from '@tabler/icons-react';
import Belt from '../../../components/Belt.jsx';
import IconButton from '../../../components/IconButton.jsx';
import { bandRule, beltFor } from '../../../lib/breaking/breakingRules.js';
import { formatMoneyWithCents } from '../../../lib/money.js';
import * as T from '../../../lib/breaking/text/chart.js';
import { rankKey } from './chartRules.js';

// ----- The two cards -----
export function PricesCard({ settings, selected, onEdit }) {
  const rows = [
    [T.ROW_TECH, T.ROW_CASH_CHECK, settings.techCents],
    [T.ROW_ADULT, T.ROW_CASH_CHECK, settings.adultCents],
    [T.ROW_CARD, '', settings.cardExtraCents],
    [T.ROW_SAME_DAY, '', settings.sameDayExtraCents],
  ];
  return (
    <section className="st-blk" aria-label={T.PRICES_TITLE}>
      <div className="st-bhead">
        <h2 className="st-bname">{T.PRICES_TITLE}</h2>
        <span className="acts">
          <IconButton label={T.EDIT_PRICES_LABEL} Icon={IconEdit} data-brk-edit-prices onClick={(event) => onEdit(event.currentTarget)} />
        </span>
      </div>
      <div role="table" aria-label={T.PRICES_TITLE}>
        {rows.map(([name, note, cents]) => (
          <div key={name} role="row" className={`st-trow brk-g-price${selected ? ' is-selected' : ''}`}>
            <span role="rowheader">
              {name}
              {note && <span className="brk-muted">{note}</span>}
            </span>
            <span role="cell" className="num">
              {formatMoneyWithCents(cents)}
            </span>
          </div>
        ))}
      </div>
      <p className="st-bfoot">
        <span className="brk-muted">{T.EXAMPLE}</span> · {T.exampleLine(settings)}
      </p>
    </section>
  );
}

export function AgeCard({ settings, onEdit }) {
  return (
    <section className="st-blk" aria-label={T.AGE_TITLE}>
      <div className="st-bhead">
        <h2 className="st-bname">{T.AGE_TITLE}</h2>
        <span className="acts">
          <IconButton label={T.EDIT_AGE_LABEL} Icon={IconEdit} data-brk-edit-age onClick={(event) => onEdit(event.currentTarget)} />
        </span>
      </div>
      <div className="st-bbody">
        <p className="st-bline" style={{ marginTop: 0 }}>
          <b className="brk-b">{T.ageLineBold.child}</b>
          {T.ageChildText(settings.childMaxAge)} · <b className="brk-b">{T.ageLineBold.teen}</b>
          {T.ageTeenText(settings.childMaxAge)}
        </p>
        <p className="st-bline st-bline--sec">{T.AGE_NOTE}</p>
      </div>
    </section>
  );
}

// ----- The board chart -----

// The table's columns (a CSS grid, set inline as Classes and ranks does): Rank · Technique · Technical · Adult · actions.
const columns = (isTouch) => (isTouch ? 'minmax(0,1fr) minmax(0,1.7fr) 76px 56px 88px' : 'minmax(0,1fr) minmax(0,1.8fr) 76px 56px 64px');

// The belt picture and the name; on a phone the first word stays glued to the belt (the line breaks after it).
function BeltName({ name, phone }) {
  const belt = beltFor(name);
  if (!phone) {
    return (
      <span className="rk-belt-name">
        <Belt belt={belt} />
        <span className="rk-name">{name}</span>
      </span>
    );
  }
  const [first, ...rest] = String(name).split(' ');
  return (
    <span className="belt-name">
      <span className="nowrap">
        <Belt belt={belt} />
        {first}
      </span>
      {rest.length > 0 && ` ${rest.join(' ')}`}
    </span>
  );
}

function RowActions({ row, menuOpen, handlers }) {
  const key = rankKey(row);
  return (
    <span className="acts">
      <IconButton label={T.editRankLabel(row.band, row.rankName)} Icon={IconEdit} data-brk-edit={key} onClick={(event) => handlers.onEditRank(row, event.currentTarget)} />
      <IconButton
        label={T.moreFor(row.band, row.rankName)}
        Icon={IconDots}
        aria-haspopup="menu"
        aria-expanded={menuOpen ? 'true' : 'false'}
        data-brk-more={key}
        onClick={(event) => handlers.onMoreRank(row, event.currentTarget)}
      />
    </span>
  );
}

function WideRow({ row, isTouch, selected, menuFor, handlers }) {
  const key = rankKey(row);
  return (
    <div className={`rrow${selected ? ' is-selected' : ''}`} role="row" style={{ gridTemplateColumns: columns(isTouch) }}>
      <span role="cell" className="rcell rk">
        <BeltName name={row.rankName} phone={false} />
      </span>
      <span role="cell" className="rcell brk-tech">
        <span>{row.technique}</span>
      </span>
      <span role="cell" className="rcell num">
        {row.techBoards}
      </span>
      <span role="cell" className="rcell num">
        {row.adultBoards}
      </span>
      <span role="cell" className="rcell rcell-acts brk-acts">
        <RowActions row={row} menuOpen={menuFor === key} handlers={handlers} />
      </span>
    </div>
  );
}

function PhoneRow({ row, selected, menuFor, handlers }) {
  return (
    <div className={`prow${selected ? ' is-selected' : ''}`} role="row">
      <div role="cell" className="prow-main">
        <div className="l1">
          <span className="l1-names">
            <BeltName name={row.rankName} phone />
          </span>
        </div>
        <div className="l2">
          <span>{T.phoneTechnical(row.techBoards)}</span> <span>· {T.phoneAdult(row.adultBoards)}</span>
        </div>
        {row.technique && <div className="l2">{row.technique}</div>}
      </div>
      <span role="cell" className="rcell-acts">
        <RowActions row={row} menuOpen={menuFor === rankKey(row)} handlers={handlers} />
      </span>
    </div>
  );
}

function Group({ group, isOpen, ctx }) {
  const { isPhone, isTouch, childMaxAge, selectedKey, menuFor, handlers } = ctx;
  const name = T.bandName(group.band);
  const Chevron = isOpen ? IconChevronUp : IconChevronDown;
  const nameParts = (
    <>
      <span className="cname">{name}</span>
      <span className="ccount">{T.rankCount(group.rows.length)}</span>
    </>
  );
  return (
    <div className="cblock" data-brk-group={group.band}>
      <div className="cline">
        <button
          type="button"
          className="ctoggle"
          aria-expanded={isOpen ? 'true' : 'false'}
          aria-label={isOpen ? T.collapseGroup(name) : T.expandGroup(name)}
          data-brk-toggle={group.band}
          onClick={() => handlers.onToggle(group.band)}
        >
          {isPhone ? (
            <>
              {nameParts}
              <Chevron size={16} aria-hidden="true" className="ctoggle-chevron" />
            </>
          ) : (
            <>
              <span className="tib-box ctoggle-box">
                <Chevron size={16} aria-hidden="true" />
              </span>
              {nameParts}
            </>
          )}
        </button>
      </div>
      <p className="cfinal">{bandRule(group.band, childMaxAge)}</p>
      {isOpen && (
        <>
          {isPhone ? (
            <div role="table" aria-label={name} className="ptable">
              {group.rows.map((row) => (
                <PhoneRow key={rankKey(row)} row={row} selected={selectedKey === rankKey(row)} menuFor={menuFor} handlers={handlers} />
              ))}
            </div>
          ) : (
            <div role="table" aria-label={name} className="rtable">
              <div role="row" className="rhead" style={{ gridTemplateColumns: columns(isTouch) }}>
                <span role="columnheader" className="rcell">
                  {T.COL_RANK}
                </span>
                <span role="columnheader" className="rcell">
                  {T.COL_TECHNIQUE}
                </span>
                <span role="columnheader" className="rcell num">
                  {T.COL_TECHNICAL}
                </span>
                <span role="columnheader" className="rcell num">
                  {T.COL_ADULT}
                </span>
                <span role="columnheader" className="rcell" aria-hidden="true" />
              </div>
              {group.rows.map((row) => (
                <WideRow key={rankKey(row)} row={row} isTouch={isTouch} selected={selectedKey === rankKey(row)} menuFor={menuFor} handlers={handlers} />
              ))}
            </div>
          )}
          <div className="addrow">
            <button type="button" className="btn btn-sm" data-brk-add={group.band} onClick={(event) => handlers.onAddRank(group.band, event.currentTarget)}>
              {/* ti-plus = add new */}
              <IconPlus size={16} aria-hidden="true" />
              {T.ADD_RANK}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function ChartBlock({ groups, openList, ctx }) {
  return (
    <>
      <h2 className="brk-h2">{T.CHART_TITLE}</h2>
      <p className="brk-sub">{T.CHART_SUB}</p>
      <div className={`clist${ctx.isTouch ? ' is-touch' : ''}`}>
        {groups.map((group) => (
          <Group key={group.band} group={group} isOpen={openList.includes(group.band)} ctx={ctx} />
        ))}
      </div>
    </>
  );
}
