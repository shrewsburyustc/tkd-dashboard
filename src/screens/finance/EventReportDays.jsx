// EventReportDays.jsx — the "By day" part of an event's Money report (pictures ER2, ER3; layout B).
// Why it exists: the report shows one compact row per day (Day · Payments · Cash · Check · Card · Refunds ·
// Day total) and each row opens to that day's payments, grouped the way Finance's Daily report groups them
// (Cash, Check, Card, Refunds; a Black Belt returned check gets its own group last). A day is the day each
// payment was PAID (corrections stay on their original day, exactly as the Daily report does).
//   PC (≥1024px)   one table; an opened day shows its payments as Time · Student · School · Amount · Recorded by
//   tablet         the same table; the opened day's table drops Recorded by (it moves under the student)
//   phone (<640px) one card per day (day, net, a sentence of what was taken, a chevron); opening shows stacked
//                  payment cards under the same group headers
// "School" (a column on PC / tablet, a small tag on phones) only shows on Both: with one school every line is
// that school's. Every word of a payment line comes from PaymentsList.rowText (Undone, Edited "Was $335.00",
// Returned check …), so this page reads exactly like the Daily report. Clicking (Enter on) a payment opens its
// detail, like the Daily report. The last row, "All days", is the whole event's net.
//
// Props: data (finance_event_report's answer), wide, isPhone, isBoth, onOpenPayment(item, element)
import { useId, useState } from 'react';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { LOCATION_NAME } from '../../lib/device.js';
import { groupItems } from '../../lib/finance/financeRules.js';
import { dayShort, money } from './format.js';
import { groupHeadText, groupLabel, itemKey, rowText } from './PaymentsList.jsx';
import * as T from './text.js';

// A figure in a Cash / Check / Card cell: the money, or a dash when nothing was taken that way.
export const cell = (part) => ((part?.count ?? 0) > 0 || (part?.cents ?? 0) !== 0 ? money(part.cents) : '—');

// The school's name for a payment line ("Worcester").
export const schoolName = (item) => LOCATION_NAME[item.school] ?? item.school ?? '';

// A payment's second line: what the Student column can't say on its own — a Black Belt payment's words
// ("Payment 2 + Kukkiwon"), "Private testing" for a Star private test, a refund's way of paying ("cash").
export function forLine(item) {
  const parts = [];
  if (item.what === 'black_belt' && item.kind === 'payment') {
    const words = T.bbItems(item.for_items, item.one_payment_plan);
    if (words) parts.push(words);
  }
  if (item.what === 'star' && item.is_private) parts.push(T.PRIVATE_TESTING);
  if (item.kind === 'refund') parts.push(T.refundMethodNote(item.method));
  return parts.join(' · ');
}

function Tag({ text, warn = false }) {
  if (!text) return null;
  return <span className={`ttag${warn ? ' ttag--warn' : ''}`}>{text}</span>;
}

// Enter or Space on a payment line opens it (a line is a button for the keyboard; the Daily report's
// lines work the same way).
function openProps(item, onOpen) {
  return {
    tabIndex: 0,
    onClick: (event) => onOpen(item, event.currentTarget),
    onKeyDown: (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onOpen(item, event.currentTarget);
      }
    },
  };
}

// One day's payments, in groups (the Daily report's "Own group" layout: refunds in a group at the end).
function DayPayments({ day, wide, isPhone, isBoth, onOpenPayment }) {
  const groups = groupItems(day.items ?? [], 'own');

  if (isPhone) {
    return (
      <div className="fin-er-pays">
        {groups.map((group) => (
          <section key={group.key}>
            <h4 className="fin-pgrp">
              {groupLabel(group.key)}
              <span>{groupHeadText(group, day.refunds)}</span>
            </h4>
            {group.items.map((item) => {
              const r = rowText(item, 'own');
              const line = forLine(item);
              return (
                <div key={itemKey(item)} className="fin-pcard" role="button" {...openProps(item, onOpenPayment)}>
                  <div className="fin-pcard-main">
                    <span className="fin-name-line">
                      <span className={r.struck ? 'fin-strike' : undefined}>{r.name}</span>
                      <Tag text={r.tag} warn={r.tagWarn} />
                      {isBoth && <span className="ttag">{schoolName(item)}</span>}
                    </span>
                    <span className="fin-sub">
                      {r.time} · {r.by}
                    </span>
                    {line && <span className="fin-sub">{line}</span>}
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

  const columns = 3 + (isBoth ? 1 : 0) + (wide ? 1 : 0);
  return (
    <table className={`fin-table fin-er-paytable${wide ? '' : ' fin-table--narrow'}`}>
      <thead>
        <tr>
          <th className="fin-col-time">{T.COL_TIME}</th>
          <th>{T.COL_STUDENT}</th>
          {isBoth && <th className="fin-er-col-school">{T.COL_SCHOOL}</th>}
          <th className="fin-r fin-col-amount">{T.COL_AMOUNT}</th>
          {wide && <th className="fin-col-by">{T.COL_RECORDED_BY}</th>}
        </tr>
      </thead>
      {groups.map((group) => (
        <tbody key={group.key}>
          <tr className="fin-grp">
            <th colSpan={columns} scope="colgroup">
              {groupLabel(group.key)}
              <span>{groupHeadText(group, day.refunds)}</span>
            </th>
          </tr>
          {group.items.map((item) => {
            const r = rowText(item, 'own');
            const line = forLine(item);
            return (
              <tr key={itemKey(item)} className="fin-row" {...openProps(item, onOpenPayment)}>
                <td className="fin-sub fin-col-time">{r.time}</td>
                <td>
                  <span className="fin-name-line">
                    <span className={r.struck ? 'fin-strike' : undefined}>{r.name}</span>
                    <Tag text={r.tag} warn={r.tagWarn} />
                  </span>
                  {line && <span className="fin-sub fin-line2">{line}</span>}
                  {!wide && <span className="fin-sub fin-line2">{r.by}</span>}
                  {r.note && <span className="fin-sub fin-line2">{r.note}</span>}
                </td>
                {isBoth && <td className="fin-sub">{schoolName(item)}</td>}
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

export default function EventReportDays({ data, wide, isPhone, isBoth, onOpenPayment }) {
  const uid = useId();
  const days = data.days ?? [];
  // Which days are open. Until someone opens or closes one: a lone day is open, otherwise all are closed.
  const [picked, setPicked] = useState(null);
  const firstOpen = new Set(days.length === 1 ? [days[0].day] : []);
  const open = picked ?? firstOpen;
  const toggle = (day) =>
    setPicked((before) => {
      const next = new Set(before ?? firstOpen);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  const regionId = (day) => `${uid}-${day.day}`;
  const toggleName = (day) => (open.has(day.day) ? T.hideDayPayments(dayShort(day.day)) : T.showDayPayments(dayShort(day.day)));
  const all = { totals: data.totals, refunds: data.refunds, returned: data.returned };
  const net = (d) => d.totals?.net_cents ?? d.totals?.total_cents ?? 0;

  // ----- Phone: one card per day -----
  if (isPhone) {
    return (
      <div className="fin-er-list">
        {days.map((day) => {
          const isOpen = open.has(day.day);
          return (
            <section key={day.day} className={`fin-er-card${isOpen ? ' is-open' : ''}`}>
              <button type="button" className="fin-er-cardhead" aria-expanded={isOpen} aria-controls={regionId(day)} aria-label={toggleName(day)} onClick={() => toggle(day.day)}>
                <span className="fin-er-cardmain">
                  <span className="fin-er-cardday">{dayShort(day.day)}</span>
                  <span className="fin-sub fin-er-cardsub">{T.daySummary(day)}</span>
                </span>
                <span className="fin-er-cardtotal">
                  {money(net(day))}
                  <IconChevronDown size={16} aria-hidden="true" className="fin-er-chev" />
                </span>
              </button>
              {isOpen && (
                <div id={regionId(day)} className="fin-er-cardbody">
                  <DayPayments day={day} wide={wide} isPhone isBoth={isBoth} onOpenPayment={onOpenPayment} />
                </div>
              )}
            </section>
          );
        })}
        <div className="fin-er-card fin-er-all">
          <div className="fin-er-cardhead fin-er-cardhead--static">
            <span className="fin-er-cardmain">
              <span className="fin-er-cardday">{T.ALL_DAYS}</span>
            </span>
            <span className="fin-er-cardtotal">{money(net(all))}</span>
          </div>
        </div>
      </div>
    );
  }

  // ----- PC and tablet: one table, a payments row under an opened day -----
  return (
    <table className="fin-table fin-er-table">
      <thead>
        <tr>
          <th>{T.COL_DAY}</th>
          <th className="fin-r">{T.COL_PAYMENTS}</th>
          <th className="fin-r">{T.CARD_CASH}</th>
          <th className="fin-r">{T.CARD_CHECK}</th>
          <th className="fin-r">{T.CARD_CARD}</th>
          <th className="fin-r">{T.COL_REFUNDS}</th>
          <th className="fin-r">{T.COL_DAY_TOTAL}</th>
        </tr>
      </thead>
      {days.map((day) => {
        const isOpen = open.has(day.day);
        const t = day.totals ?? {};
        return (
          <tbody key={day.day} className={isOpen ? 'fin-er-open' : undefined}>
            <tr className="fin-row fin-er-dayrow" onClick={() => toggle(day.day)}>
              <td>
                <button
                  type="button"
                  className="fin-er-toggle"
                  aria-expanded={isOpen}
                  aria-controls={regionId(day)}
                  aria-label={toggleName(day)}
                  onClick={(event) => {
                    event.stopPropagation(); // the row's own click would toggle a second time
                    toggle(day.day);
                  }}
                >
                  {isOpen ? <IconChevronDown size={16} aria-hidden="true" /> : <IconChevronRight size={16} aria-hidden="true" />}
                  {dayShort(day.day)}
                </button>
              </td>
              <td className="fin-r">{t.count ?? 0}</td>
              <td className="fin-r">{cell(t.cash)}</td>
              <td className="fin-r">{cell(t.check)}</td>
              <td className="fin-r">{cell(t.card)}</td>
              <td className="fin-r">
                {(day.refunds?.count ?? 0) > 0 ? money(day.refunds.cents) : (day.returned?.count ?? 0) > 0 ? '' : '—'}
                {(day.returned?.count ?? 0) > 0 && <span className="fin-sub fin-line2">{`${T.TAG_RETURNED} ${money(day.returned.cents)}`}</span>}
              </td>
              <td className="fin-r fin-er-daytotal">{money(net(day))}</td>
            </tr>
            {isOpen && (
              <tr className="fin-er-detail">
                <td id={regionId(day)} colSpan={7}>
                  <DayPayments day={day} wide={wide} isPhone={false} isBoth={isBoth} onOpenPayment={onOpenPayment} />
                </td>
              </tr>
            )}
          </tbody>
        );
      })}
      <tfoot>
        <tr className="fin-er-all">
          <td>{T.ALL_DAYS}</td>
          <td className="fin-r">{all.totals?.count ?? 0}</td>
          <td className="fin-r">{cell(all.totals?.cash)}</td>
          <td className="fin-r">{cell(all.totals?.check)}</td>
          <td className="fin-r">{cell(all.totals?.card)}</td>
          <td className="fin-r">
            {(all.refunds?.count ?? 0) > 0 ? money(all.refunds.cents) : (all.returned?.count ?? 0) > 0 ? '' : '—'}
            {(all.returned?.count ?? 0) > 0 && <span className="fin-sub fin-line2">{`${T.TAG_RETURNED} ${money(all.returned.cents)}`}</span>}
          </td>
          <td className="fin-r fin-er-daytotal">{money(net(all))}</td>
        </tr>
      </tfoot>
    </table>
  );
}
