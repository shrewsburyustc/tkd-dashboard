// PaymentsList.jsx — the day's payments, grouped Cash / Check / Card (mockups D1, D4; v0.196, v0.199, v0.209).
// Why it exists: staff count the drawer against the Cash group and lay the checks next to the
// Check group, so a short is easy to trace. Each group has a header with its count and total,
// then its payments in time order. Corrections stay on the payment's ORIGINAL day: an undone
// payment is struck through with an Undone tag, an edited one shows its new amount with an
// Edited tag and "Was $70.00", a moved one says "Moved to <date>", and a payment recorded after
// the day was closed says "Added after closing".
//
// Refunds (v0.209) follow this device's layout:
//   'own' — a Refunds group at the end (method on each row);
//   'in'  — inside the Cash / Check group with a gray Refund tag and a minus amount.
//
// Three layouts (rule 1.3):
//   PC (≥1024px)   table: Time · Student · For · Amount · Recorded by
//   tablet         table: Time · Student (For and Recorded by on a second line) · Amount
//   phone (<640)   stacked cards under the same group headers
// Clicking (or Enter on) a row opens the payment's detail (D12). ↑ ↓ move between rows (v0.52).
//
// Props: items, layout ('own' | 'in'), refunds (finance_day's refunds), wide, isPhone,
//        onOpen(item, rowElement) — the row is where keyboard focus goes back after the detail closes
import { groupItems } from '../../lib/finance/financeRules.js';
import { useRowArrowNav } from '../../lib/useRowArrowNav.js';
import { money, monthDay, timeOfDay } from './format.js';
import * as T from './text.js';

const GROUP_LABEL = { cash: T.GROUP_CASH, check: T.GROUP_CHECK, card: T.GROUP_CARD, refunds: T.GROUP_REFUNDS };

// A stable key for one row (the same chain can show twice on a day only with different rows).
export const itemKey = (item) => `${item.payment_id}:${item.row_id ?? ''}:${item.state}`;

// "Color belt testing" / "Star testing" / "Star testing, private"
export function whatText(item) {
  if (item.what === 'star') return item.is_private ? T.WHAT_STAR_PRIVATE : T.WHAT_STAR;
  return T.WHAT_COLOR_BELT;
}

// Everything a row shows, as text. Shared with the printed page (PrintPage.jsx), so paper and
// screen always say the same thing (D8: "corrections print as on screen").
export function rowText(item, layout) {
  const name = `${item.first_name ?? ''} ${item.last_name ?? ''}`.trim();
  const struck = item.state === 'undone' || item.state === 'moved_out';
  const isRefund = item.kind === 'refund';
  // What it was before an edit: "$70.00", "$70.00 check" (amount and method changed) or "check".
  let was = '';
  if (item.was_amount_cents !== null && item.was_amount_cents !== undefined && item.was_amount_cents !== item.amount_cents) {
    was = money(item.was_amount_cents);
    if (item.was_method && item.was_method !== item.method) was += ` ${T.methodLower(item.was_method)}`;
  } else if (item.was_method && item.was_method !== item.method) {
    was = T.methodLower(item.was_method);
  }
  // One tag per row (rule 8), the most important first.
  let tag = null;
  let note = null;
  if (item.state === 'undone') {
    tag = T.TAG_UNDONE;
    note = T.undoneLine(item.changed_by_name ?? '', item.changed_on);
  } else if (item.state === 'moved_out') {
    tag = T.TAG_MOVED;
    note = T.movedToLine(item.moved_to);
  } else if (item.state === 'edited') {
    tag = T.TAG_EDITED;
    note = T.editedLine(was, item.changed_by_name ?? '', item.changed_on);
  } else if (item.state === 'moved_in') {
    tag = T.TAG_EDITED;
    note = T.movedFromLine(item.moved_from, was, item.changed_by_name, item.changed_on);
  } else if (item.added_after_closing) {
    tag = T.TAG_ADDED_AFTER;
    note = T.addedAfterLine(timeOfDay(item.time ?? item.recorded_at));
  } else if (isRefund && layout === 'in') {
    tag = T.TAG_REFUND;
  }
  // "For": testing type · event date (+ the method on a refund in its own group, #q12 B).
  let forText = `${whatText(item)} · ${monthDay(item.event_date)}`;
  if (isRefund && layout !== 'in') forText += ` · ${T.refundMethodNote(item.method)}`;
  return {
    name,
    struck,
    tag,
    note,
    forText,
    time: timeOfDay(item.time ?? item.recorded_at),
    amount: money(item.amount_cents),
    by: item.recorded_by_name ?? '',
  };
}

// Group header words: "Cash · 4 payments · $320.00" / "Refunds · 2 · −$30.00 (cash −$20.00, check −$10.00)"
export function groupHeadText(group, refunds) {
  if (group.key === 'refunds') return T.refundsHead(group.refundCount, group.cents, refunds?.cash_cents ?? 0, refunds?.check_cents ?? 0);
  return T.groupHead(group.count, group.refundCount, group.cents);
}

export const groupLabel = (key) => GROUP_LABEL[key] ?? key;

// The sub-line of a Cash / Check / Card card: "1 payment"; In groups with refunds in it:
// "1 payment, 1 refund" (#q12 A). Shared by the screen's cards and the printed page.
//   cards = financeRules.cardsFor(…), key = 'cash' | 'check' | 'card'
export function cardSub(items, cards, key, layout) {
  if (layout !== 'in') return T.paymentsCount(cards[key].count);
  const group = groupItems(items, 'in').find((g) => g.key === key);
  return T.paymentsAndRefunds(cards[key].count, group?.refundCount ?? 0);
}
// The id of a group's header, so a metric card can jump to it (rule 8).
export const groupAnchorId = (key) => `fin-group-${key}`;

function Tag({ text }) {
  return text ? <span className="ttag">{text}</span> : null;
}

export default function PaymentsList({ items, layout, refunds, wide, isPhone, onOpen }) {
  const groups = groupItems(items, layout);
  const rowKeys = groups.flatMap((g) => g.items.map(itemKey));
  const byKey = new Map(groups.flatMap((g) => g.items.map((item) => [itemKey(item), item])));
  // Enter on a row: the row has keyboard focus, so it is the element focus returns to afterwards.
  const nav = useRowArrowNav({ rowKeys, onOpen: (key) => onOpen(byKey.get(key), document.activeElement) });

  if (groups.length === 0) return null;

  // ----- Phone: stacked cards -----
  if (isPhone) {
    return (
      <div className="fin-cards-list" {...nav.containerProps}>
        {groups.map((group) => (
          <section key={group.key} aria-labelledby={groupAnchorId(group.key)}>
            <h3 id={groupAnchorId(group.key)} className="fin-pgrp" tabIndex={-1}>
              {groupLabel(group.key)}
              <span>{groupHeadText(group, refunds)}</span>
            </h3>
            {group.items.map((item) => {
              const r = rowText(item, layout);
              const key = itemKey(item);
              return (
                <div
                  key={key}
                  className="fin-pcard"
                  role="button"
                  {...nav.rowProps(key)}
                  onClick={(event) => onOpen(item, event.currentTarget)}
                >
                  <div className="fin-pcard-main">
                    <span className="fin-name-line">
                      <span className={r.struck ? 'fin-strike' : undefined}>{r.name}</span>
                      <Tag text={r.tag} />
                    </span>
                    <span className="fin-sub">{r.forText}</span>
                    <span className="fin-sub">
                      {r.time} · {r.by}
                    </span>
                    {r.note && <span className="fin-sub">{r.note}</span>}
                  </div>
                  <span className={`fin-pcard-amount${r.struck ? ' fin-strike' : ''}`}>{r.amount}</span>
                </div>
              );
            })}
          </section>
        ))}
      </div>
    );
  }

  // ----- PC and tablet: one table with a header row per group -----
  const columns = wide ? 5 : 3;
  return (
    <table className={`fin-table${wide ? '' : ' fin-table--narrow'}`} {...nav.containerProps}>
      <thead>
        <tr>
          <th className="fin-col-time">{T.COL_TIME}</th>
          <th>{T.COL_STUDENT}</th>
          {wide && <th>{T.COL_FOR}</th>}
          <th className="fin-r fin-col-amount">{T.COL_AMOUNT}</th>
          {wide && <th className="fin-col-by">{T.COL_RECORDED_BY}</th>}
        </tr>
      </thead>
      {groups.map((group) => (
        <tbody key={group.key}>
          <tr className="fin-grp">
            <th id={groupAnchorId(group.key)} colSpan={columns} scope="colgroup" tabIndex={-1}>
              {groupLabel(group.key)}
              <span>{groupHeadText(group, refunds)}</span>
            </th>
          </tr>
          {group.items.map((item) => {
            const r = rowText(item, layout);
            const key = itemKey(item);
            return (
              <tr key={key} className="fin-row" {...nav.rowProps(key)} onClick={(event) => onOpen(item, event.currentTarget)}>
                <td className="fin-sub fin-col-time">{r.time}</td>
                <td>
                  <span className="fin-name-line">
                    <span className={r.struck ? 'fin-strike' : undefined}>{r.name}</span>
                    <Tag text={r.tag} />
                  </span>
                  {/* Tablet: For and Recorded by drop into a second line (rule 1.3). */}
                  {!wide && (
                    <span className="fin-sub fin-line2">
                      {r.forText} · {r.by}
                    </span>
                  )}
                  {r.note && <span className="fin-sub fin-line2">{r.note}</span>}
                </td>
                {wide && (
                  <td>
                    {r.forText.split(' · ')[0]} <span className="fin-sub">· {r.forText.split(' · ').slice(1).join(' · ')}</span>
                  </td>
                )}
                <td className="fin-r">
                  <span className={r.struck ? 'fin-strike' : undefined}>{r.amount}</span>
                </td>
                {wide && <td className="fin-sub">{r.by}</td>}
              </tr>
            );
          })}
        </tbody>
      ))}
    </table>
  );
}
