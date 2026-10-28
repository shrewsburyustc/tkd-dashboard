// PaymentsList.jsx — the day's payments, grouped Cash / Check / Card (mockups D1, D4; v0.807, v0.199, v0.209).
// Why it exists: staff count the drawer against the Cash group and lay the checks next to the
// Check group, so a short is easy to trace. Each group has a header with its count and total,
// then its payments in time order. Corrections stay on the payment's ORIGINAL day: an undone
// payment is struck through with an Undone tag, an edited one shows its new amount with an
// Edited tag and "Was $70.00", a moved one says "Moved to <date>", and a payment recorded after
// the day was closed says "Added after closing".
//
// Refunds (v0.209) follow this device's layout:
//   'own' — a Refunds group at the end (method on each row);
//   'in'  — inside the Cash / Check / Card group with a gray Refund tag and a minus amount.
// Black Belt payments (migration 0026, v0.815, mockup B1) sit in their method's group like any
// payment ("Black Belt · Spring 2027 · Payment 2", no date). Black Belt's returned (bounced) checks
// get their own Returned checks group, ALWAYS last (after Refunds, and in the "In groups" layout
// too): −the check, a warning-style "Returned check" tag and "Returned by the bank · handed in
// <day>". An undone mark is struck through with the Undone tag, like any undone payment (B5).
//
// Three layouts (rule 1.3):
//   PC (≥1024px)   table: Time · Student · For · Amount · Recorded by
//   tablet         table: Time · Student (For and Recorded by on a second line) · Amount
//   phone (<640)   stacked cards under the same group headers
// Clicking (or Enter on) a row opens the payment's detail (D12). ↑ ↓ move between rows (v0.52).
//
// Props: items, layout ('own' | 'in'), refunds (finance_day's refunds), wide, isPhone,
//        onOpen(item, rowElement) — the row is where keyboard focus goes back after the detail closes
import { IconAlertTriangle } from '@tabler/icons-react';
import { groupItems } from '../../lib/finance/financeRules.js';
import { useRowArrowNav } from '../../lib/useRowArrowNav.js';
import { money, monthDay, timeOfDay } from './format.js';
import * as T from './text.js';

const GROUP_LABEL = { cash: T.GROUP_CASH, check: T.GROUP_CHECK, card: T.GROUP_CARD, refunds: T.GROUP_REFUNDS, returned: T.GROUP_RETURNED };

// A stable key for one row (the same chain can show twice on a day only with different rows).
export const itemKey = (item) => `${item.payment_id}:${item.row_id ?? ''}:${item.state}`;

// "Color belt testing" / "Color belt testing, private" (v0.813) / "Star testing" / "Star testing, private" /
// "Camp" (Camps v0.707) / "Black Belt" (v0.815)
export function whatText(item) {
  if (item.what === 'camp') return T.WHAT_CAMP;
  if (item.what === 'black_belt') return T.WHAT_BLACK_BELT;
  if (item.what === 'star') return item.is_private ? T.WHAT_STAR_PRIVATE : T.WHAT_STAR;
  return item.is_private ? T.WHAT_COLOR_BELT_PRIVATE : T.WHAT_COLOR_BELT;
}

// What a payment is for, without the refund's method note: "Color belt testing · Oct 29",
// "Camp · April Vacation Camp", "Black Belt · Spring 2027 · Payment 1 + Kukkiwon" (a Black Belt
// refund: "Black Belt · Spring 2027"). Shared by the list, the printed page and the detail.
export function forTextOf(item) {
  if (item.what === 'black_belt') {
    // A refund isn't for one payment, so it names only the cycle (contract 0026 §6).
    return item.kind === 'refund'
      ? T.blackBeltFor(item.event_name ?? '', null, null)
      : T.blackBeltFor(item.event_name ?? '', item.for_items, item.one_payment_plan);
  }
  // A camp payment names the camp instead of a date: "Camp · April Vacation Camp" (v0.707).
  // (Until a day's rows carry the camp's name, the camp's first day stands in for it.)
  const campName = item.event_name ?? item.camp_name ?? null;
  return item.what === 'camp' ? `${T.WHAT_CAMP} · ${campName ?? monthDay(item.event_date)}` : `${whatText(item)} · ${monthDay(item.event_date)}`;
}

// Everything a row shows, as text. Shared with the printed page (PrintPage.jsx), so paper and
// screen always say the same thing (D8: "corrections print as on screen").
//   tagWarn: the tag is warning-style (amber, with the warning icon) — the Returned check tag (B1)
export function rowText(item, layout) {
  const name = `${item.first_name ?? ''} ${item.last_name ?? ''}`.trim();
  const struck = item.state === 'undone' || item.state === 'moved_out';
  const isRefund = item.kind === 'refund';
  const isReturnedCheck = item.kind === 'returned';
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
  let tagWarn = false;
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
  } else if (isReturnedCheck) {
    // A returned check (v0.809): its own line on the day it was returned; never "Added after
    // closing" (Close the day doesn't use it). Who marked it is in Recorded by only (v0.815).
    tag = T.TAG_RETURNED;
    tagWarn = true;
    note = item.handed_in_on ? T.returnedLine(item.handed_in_on) : null;
  } else if (item.added_after_closing) {
    tag = T.TAG_ADDED_AFTER;
    note = T.addedAfterLine(timeOfDay(item.time ?? item.recorded_at));
  } else if (isRefund && layout === 'in') {
    tag = T.TAG_REFUND;
  }
  // "For": testing type · event date (+ the method on a refund in its own group, #q12 B).
  let forText = forTextOf(item);
  if (isRefund && layout !== 'in') forText += ` · ${T.refundMethodNote(item.method)}`;
  return {
    name,
    struck,
    tag,
    tagWarn,
    note,
    forText,
    time: timeOfDay(item.time ?? item.recorded_at),
    amount: money(item.amount_cents),
    by: item.recorded_by_name ?? '',
  };
}

// Group header words: "Cash · 4 payments · $320.00" / "Refunds · 2 · −$30.00 (cash −$20.00, check −$10.00)" /
// "Returned checks · 1 returned check · −$900.00" (B1) or "… · 0 returned checks · $0.00 (1 undone, not counted)" (B5)
export function groupHeadText(group, refunds) {
  if (group.key === 'refunds') {
    return T.refundsHead(group.refundCount, group.cents, refunds?.cash_cents ?? 0, refunds?.check_cents ?? 0, refunds?.card_cents ?? 0);
  }
  if (group.key === 'returned') return T.returnedHead(group.returnedCount, group.cents, group.undoneCount);
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

// A row's tag: gray, or warning-style with the warning icon and words (the Returned check tag, B1).
function Tag({ text, warn = false }) {
  if (!text) return null;
  if (warn) {
    return (
      <span className="ttag ttag--warn">
        <IconAlertTriangle size={14} aria-hidden="true" />
        {text}
      </span>
    );
  }
  return <span className="ttag">{text}</span>;
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
                      <Tag text={r.tag} warn={r.tagWarn} />
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
                    <Tag text={r.tag} warn={r.tagWarn} />
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
