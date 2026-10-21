// Registered.jsx — the page after a successful Send (mockup Form 7; rulebook v0.919, v0.218,
// v0.900; contract 0016-B1 §4.6).
// Why it exists: it stands in for today's confirmation email. It shows "[name] is registered",
// What to pay (Due by · For · Amount, from the server's answer, so a late family's passed dates
// already read as the day they registered), the testing days with times and addresses, what is
// handed in and when, the Kukkiwon certificate steps (only if chosen), the reference number, the
// "Registered on this visit" list with the family's total, and Print or save this page /
// Register another candidate. The results line waits for the email service (OP-14), so it isn't
// shown. The printout (form.css @media print) drops the buttons and adds the chosen Dan's
// requirements with every part opened (RequirementsPrint).
import { RequirementsLink } from './StepDetails.jsx';
import { RequirementsPrint } from './RequirementsPanel.jsx';
import { Icon, Row } from './parts.jsx';
import { formatDollars, handInList, longDay, placeFull, shortDay, timeRange } from './format.js';
import * as T from './text.js';

// The answer's items grouped by due date: one line per date, e.g.
// { dueOn: '2027-03-27', labels: ['Payment 1', 'Kukkiwon certificate ($100)'], cents: 39000 }.
function payLines(result) {
  const items = Array.isArray(result?.items) ? result.items : [];
  const paymentCount = items.filter((i) => /^p\d+$/.test(i.item)).length;
  const groups = [];
  for (const item of items) {
    let label;
    if (item.item === 'kukkiwon') label = T.kukkiwonItem(formatDollars(item.amount_cents));
    else if (paymentCount === 1) label = result.plan_name; // a one-payment plan reads its name ("In full")
    else label = T.paymentN(Number(item.item.slice(1)));
    const last = groups[groups.length - 1];
    if (last && last.dueOn === item.due_on) {
      last.labels.push(label);
      last.cents += item.amount_cents;
    } else {
      groups.push({ dueOn: item.due_on, labels: [label], cents: item.amount_cents });
    }
  }
  return { groups, paymentCount };
}

export default function Registered({ cycle, result, visit, onAnother, onOpenRequirements, headingRef }) {
  const name = `${result.first_name} ${result.last_name}`;
  const dan = result.dan;
  const { groups, paymentCount } = payLines(result);
  const sheet = (cycle?.requirements?.dans ?? []).find((d) => d?.dan === dan) ?? null;
  const handIn = handInList(sheet);
  const visitTotal = visit.reduce((sum, v) => sum + (v.totalCents ?? 0), 0);

  return (
    <div className="bbf-step">
      <div className="bbf-done">
        <span className="bbf-done__tick">
          <Icon name="check" size={18} />
        </span>
        <h1 className="bbf-done__title" ref={headingRef} tabIndex={-1}>
          {T.isRegistered(name)}
        </h1>
        <div>{T.doneLine(result.cycle_name ?? cycle?.name ?? '', T.DAN[dan], result.kukkiwon)}</div>
      </div>

      {/* What to pay */}
      <section className="bbf-card" aria-labelledby="bbf-pay-title">
        <h2 className="bbf-card__title" id="bbf-pay-title">
          {T.WHAT_TO_PAY}
        </h2>
        <table className="bbf-paytable">
          <thead>
            <tr>
              <th scope="col">{T.DUE_BY}</th>
              <th scope="col">{T.FOR}</th>
              <th scope="col" className="is-num">
                {T.AMOUNT}
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.dueOn}>
                <td className="bbf-paytable__date">{shortDay(g.dueOn)}</td>
                <td className="bbf-paytable__for">{g.labels.join(T.PLUS)}</td>
                <td className="is-num">
                  <b>{formatDollars(g.cents)}</b>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={2}>
                {T.TOTAL}
              </th>
              <td className="is-num">
                <b>{formatDollars(result.total_cents)}</b>
              </td>
            </tr>
          </tfoot>
        </table>
        <p className="bbf-small">{T.PAY_AT_DESK}</p>
        {paymentCount >= 2 && groups.length >= 2 ? <p className="bbf-small">{T.bringChecks(groups.length, longDay(groups[0].dueOn))}</p> : null}
        <p className="bbf-small">{T.NON_REFUNDABLE}</p>
      </section>

      {/* Testing days, hand-in and the requirements */}
      <section className="bbf-card" aria-labelledby="bbf-days-title">
        <h2 className="bbf-card__title" id="bbf-days-title">
          {T.TESTING_DAYS}
        </h2>
        <dl className="bbf-review bbf-review--top">
          {(cycle?.days ?? []).map((day, i) => (
            <Row key={`${day.day_date}-${i}`} label={day.name}>
              {shortDay(day.day_date)} · {timeRange(day.start_time, day.end_time)}
              <br />
              {placeFull(day.place)}
              {day.second ? (
                <span className="bbf-small bbf-block">
                  {T.outdoorPart(timeRange(day.second.start_time, day.second.end_time), placeFull(day.second.place))}
                </span>
              ) : null}
            </Row>
          ))}
          {handIn && cycle?.submissions_due ? <Row label={T.HAND_IN}>{T.handInLine(shortDay(cycle.submissions_due), handIn)}</Row> : null}
        </dl>
        <div className="bbf-noprint">
          <RequirementsLink dan={dan} onOpen={onOpenRequirements} />
        </div>
      </section>

      {/* Kukkiwon certificate steps, only if chosen */}
      {result.kukkiwon ? (
        <section className="bbf-card" aria-labelledby="bbf-kuk-title">
          <h2 className="bbf-card__title" id="bbf-kuk-title">
            {T.KUKKIWON_TITLE}
          </h2>
          <ol className="bbf-steps">
            {T.KUKKIWON_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      ) : null}

      {/* Reference — one row only (the Results row is gone), so the card has no row padding
          on top of its own (bbf-ref-card in form.css) */}
      <section className="bbf-card bbf-ref-card">
        <dl className="bbf-review">
          <Row label={T.REFERENCE}>
            <b className="bbf-ref">{result.reference}</b>
            <span className="bbf-small bbf-block">{T.REFERENCE_HINT}</span>
          </Row>
        </dl>
      </section>

      {/* Registered on this visit */}
      <section className="bbf-card bbf-visit" aria-labelledby="bbf-visit-title">
        <h2 className="bbf-card__title" id="bbf-visit-title">
          {T.THIS_VISIT}
        </h2>
        <ul className="bbf-visit__list">
          {visit.map((v) => (
            <li key={v.reference} className="bbf-visit__row">
              <span>{T.visitLine(v.name, T.DAN[v.dan] ?? '', v.kukkiwon, v.planName)}</span>
              <b>{formatDollars(v.totalCents)}</b>
            </li>
          ))}
        </ul>
        <div className="bbf-visit__total">
          <span>
            {T.VISIT_TOTAL}
            <small>{T.VISIT_TOTAL_HOW}</small>
          </span>
          <b>{formatDollars(visitTotal)}</b>
        </div>
      </section>

      <RequirementsPrint cycle={cycle} dan={dan} />

      <div className="bbf-donebtns bbf-noprint">
        <button type="button" className="bbf-btn bbf-btn--full" onClick={() => window.print()}>
          <Icon name="printer" />
          {T.PRINT}
        </button>
        <button type="button" className="bbf-btn bbf-btn--full" onClick={onAnother}>
          {T.REGISTER_ANOTHER}
        </button>
      </div>
    </div>
  );
}
