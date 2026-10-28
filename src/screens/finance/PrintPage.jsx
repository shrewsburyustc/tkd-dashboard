// PrintPage.jsx — the printed Daily report (mockup D8, v0.200, v0.207).
// Why it exists: a paper copy of the day, black on white, letter size (portrait): the school,
// the date, who printed it and when, the four totals, the Close the day count and note, the
// Cash / Check / Card groups, and a "Counted by" line to sign. "Print" draws this into the page,
// opens the browser's print window and removes it again afterwards — the same way Testing prints
// its grading sheet. The print stylesheet (finance.css, @media print) hides everything else.
//
// A long day continues on a second page with the header repeated: the header sits in the table's
// <thead>, and browsers repeat a table's head at the top of every printed page.
// Corrections print as on screen (struck through, "Was $70.00", …) — the row text comes from
// the same rowText() the screen uses. Refunds follow the layout chosen on this device (v0.209).
// Black Belt rows and the Returned checks group (migration 0026, v0.815) print as on screen too:
// the same groups, the same "For" words, the same Total sub-line.
//
// Props: data (finance_day's answer), school (name), layout, printedAt (Date), printedBy (name)
import { createPortal } from 'react-dom';
import { cardsFor, groupItems } from '../../lib/finance/financeRules.js';
import { changedLine, closedTag, closingLine } from './ClosedBox.jsx';
import { dayLong, money, printedWhen } from './format.js';
import { cardSub, groupHeadText, groupLabel, rowText } from './PaymentsList.jsx';
import * as T from './text.js';

export default function PrintPage({ data, school, layout, printedAt, printedBy }) {
  const cards = cardsFor(data.totals, data.refunds, layout, data.returned);
  const groups = groupItems(data.items ?? [], layout);
  const closing = data.closing?.kind === 'close' || (data.closing && !data.closing.kind) ? data.closing : null;
  const totalSub = T.totalSub(cards.total);
  const cell = (label, c, sub) => (
    <div className="fp-card">
      {label}
      <strong>{money(c)}</strong>
      {sub}
    </div>
  );

  return createPortal(
    <div className="fin-print">
      <table className="fp-table">
        <colgroup>
          <col className="fp-col-time" />
          <col />
          <col className="fp-col-for" />
          <col className="fp-col-amount" />
          <col className="fp-col-by" />
        </colgroup>
        <thead>
          <tr>
            <th colSpan={5} className="fp-head">
              <span className="fp-title-row">
                <span className="fp-title">{T.printTitle(school)}</span>
                <span className="fp-date">{dayLong(data.day)}</span>
              </span>
              <span className="fp-sub">
                {T.SCHOOL_NAME} · {T.printedBy(printedWhen(printedAt), printedBy)}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={5}>
              <div className="fp-cards">
                {cell(T.CARD_TOTAL, cards.total.cents, totalSub)}
                {cell(T.CARD_CASH, cards.cash.cents, cardSub(data.items ?? [], cards, 'cash', layout))}
                {cell(T.CARD_CHECK, cards.check.cents, cardSub(data.items ?? [], cards, 'check', layout))}
                {cell(T.CARD_CARD, cards.card.cents, cardSub(data.items ?? [], cards, 'card', layout))}
              </div>
              {/* The count line: "Day closed by Staff at 1:42 PM. Cash counted …" or "Not closed yet" */}
              <p className="fp-line">
                <strong>{closing ? T.DAY_CLOSED : T.PRINT_NOT_CLOSED}</strong>
                {/* The box's one tag, as on screen (Changed after closing / Cash short $X / Closed) */}
                {closing ? ` (${closedTag(closing).text})` : ''}
                {closing ? ` · ${closingLine(closing, true)}` : ''}
              </p>
              {closing?.note && <p className="fp-line">{T.noteLine(closing.note)}</p>}
              {closing?.changed_after && <p className="fp-line fp-changed">{changedLine(closing, data.items ?? [])}</p>}
            </td>
          </tr>
        </tbody>
        {groups.map((group) => (
          <tbody key={group.key}>
            <tr>
              <td colSpan={5} className="fp-group">
                {groupLabel(group.key)}
                {groupHeadText(group, data.refunds)}
              </td>
            </tr>
            {group.items.map((item) => {
              const r = rowText(item, layout);
              return (
                <tr key={`${item.payment_id}:${item.row_id}:${item.state}`} className="fp-row">
                  <td>{r.time}</td>
                  <td>
                    <span className={r.struck ? 'fp-strike' : undefined}>{r.name}</span>
                    {r.tag ? ` (${r.tag})` : ''}
                    {r.note && <span className="fp-note">{r.note}</span>}
                  </td>
                  <td>{r.forText}</td>
                  <td className="fp-r">
                    <span className={r.struck ? 'fp-strike' : undefined}>{r.amount}</span>
                  </td>
                  <td>{r.by}</td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
      <p className="fp-sign">
        <span>{T.COUNTED_BY}</span>
        <span>{T.DATE_LINE}</span>
      </p>
    </div>,
    document.body,
  );
}
