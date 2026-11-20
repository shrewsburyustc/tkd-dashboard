// EventReportPrint.jsx — the printed Money report of one event (same approach as PrintPage.jsx, the Daily report).
// Why it exists: a paper copy for the boss — black on white, letter size, portrait: the event, the school(s),
// who printed it and when, the four totals and the net line, the school boxes on Both, then EVERY day with its
// payments in the Cash / Check / Card / Refunds groups (Print opens every day, whatever is open on screen).
// "Print" draws this into the page, opens the browser's print window and removes it again afterwards. The
// shared print stylesheet (finance.css, @media print) hides everything else on the page, so only this report
// prints; the report's own extra print rules are in finance-event-report.css.
// The header sits in the table's <thead>, so a long report repeats it at the top of every printed page.
// Corrections print as on screen (struck through, "Was $335.00", …): the row text is PaymentsList.rowText.
//
// Props: data (finance_event_report's answer), schoolText ('Both schools' | 'Worcester' | …), isBoth,
//        printedAt (Date), printedBy (name)
import { createPortal } from 'react-dom';
import { dayLong, money, printedWhen } from './format.js';
import { groupItems } from '../../lib/finance/financeRules.js';
import { netOf } from '../../lib/finance/eventReportModel.js';
import { cell, forLine, schoolName } from './EventReportDays.jsx';
import { groupHeadText, groupLabel, itemKey, rowText } from './PaymentsList.jsx';
import * as T from './text.js';

export default function EventReportPrint({ data, schoolText, isBoth, printedAt, printedBy }) {
  const days = data.days ?? [];
  const t = data.totals ?? {};
  const net = money(netOf(data));
  const netLine = T.netLine(data.refunds, data.returned, netOf(data));
  const cols = isBoth ? 5 : 4;
  const figure = (label, value, sub) => (
    <div className="fp-card">
      {label}
      <strong>{value}</strong>
      {sub}
    </div>
  );

  return createPortal(
    <div className="fin-print fin-er-print">
      <table className="fp-table">
        <colgroup>
          <col className="fp-col-time" />
          <col />
          {isBoth && <col className="fp-col-school" />}
          <col className="fp-col-amount" />
          <col className="fp-col-by" />
        </colgroup>
        <thead>
          <tr>
            <th colSpan={cols} className="fp-head">
              <span className="fp-title-row">
                <span className="fp-title">{T.EVENT_REPORT_PRINT_TITLE(data.event?.name ?? '')}</span>
                <span className="fp-date">{schoolText}</span>
              </span>
              <span className="fp-sub">
                {T.SCHOOL_NAME} · {T.printedBy(printedWhen(printedAt), printedBy)}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={cols}>
              <div className="fp-cards">
                {figure(T.CARD_TAKEN, money(t.in_cents ?? 0), T.paymentsCount(t.count ?? 0))}
                {figure(T.CARD_CASH, money(t.cash?.cents ?? 0), T.paymentsCount(t.cash?.count ?? 0))}
                {figure(T.CARD_CHECK, money(t.check?.cents ?? 0), T.paymentsCount(t.check?.count ?? 0))}
                {figure(T.CARD_CARD, money(t.card?.cents ?? 0), T.paymentsCount(t.card?.count ?? 0))}
              </div>
              {netLine ? (
                <p className="fp-line">
                  <strong>{netLine}</strong>
                </p>
              ) : (
                <p className="fp-line">
                  <strong>
                    {T.NET} {net}
                  </strong>
                </p>
              )}
              {isBoth &&
                (data.by_school ?? []).map((s) => (
                  <p key={s.school} className="fp-line">
                    <strong>{schoolName({ school: s.school })}</strong> · {money(netOf(s))} · {T.paymentsCount(s.totals.count)} ·{' '}
                    {T.bothBreakdown(s.totals.cash.cents, s.totals.check.cents, s.totals.card.cents)}
                  </p>
                ))}
            </td>
          </tr>
        </tbody>
        {days.map((day) => {
          const groups = groupItems(day.items ?? [], 'own');
          return (
            <tbody key={day.day} className="fp-daybody">
              <tr>
                <td colSpan={cols} className="fp-dayhead">
                  {dayLong(day.day)} · {T.paymentsCount(day.totals?.count ?? 0)} · {T.NET} {money(netOf(day))}
                  <span className="fp-daysub">
                    {cell(day.totals?.cash) !== '—' ? ` Cash ${cell(day.totals.cash)}` : ''}
                    {cell(day.totals?.check) !== '—' ? ` · Check ${cell(day.totals.check)}` : ''}
                    {cell(day.totals?.card) !== '—' ? ` · Card ${cell(day.totals.card)}` : ''}
                  </span>
                </td>
              </tr>
              {groups.map((group) => (
                <Group key={group.key} group={group} refunds={day.refunds} isBoth={isBoth} cols={cols} />
              ))}
            </tbody>
          );
        })}
      </table>
    </div>,
    document.body,
  );
}

// One group of a day (Cash / Check / Card / Refunds / Returned checks): its heading, then its payments.
function Group({ group, refunds, isBoth, cols }) {
  return (
    <>
      <tr>
        <td colSpan={cols} className="fp-group">
          {groupLabel(group.key)}
          {groupHeadText(group, refunds)}
        </td>
      </tr>
      {group.items.map((item) => {
        const r = rowText(item, 'own');
        const line = forLine(item);
        return (
          <tr key={itemKey(item)} className="fp-row">
            <td>{r.time}</td>
            <td>
              <span className={r.struck ? 'fp-strike' : undefined}>{r.name}</span>
              {r.tag ? ` (${r.tag})` : ''}
              {line && <span className="fp-note">{line}</span>}
              {r.note && <span className="fp-note">{r.note}</span>}
            </td>
            {isBoth && <td>{schoolName(item)}</td>}
            <td className="fp-r">
              <span className={r.struck ? 'fp-strike' : undefined}>{r.amount}</span>
            </td>
            <td>{r.by}</td>
          </tr>
        );
      })}
    </>
  );
}
