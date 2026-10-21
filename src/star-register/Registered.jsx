// Registered.jsx — the Star family page after a successful Send (Form screens 9 and 10, gap mockup F2).
// Why it exists: rulebook v0.93 / v0.103 — "<Name> is registered" with the event and progression,
// What happens next as labelled lines (Pay · Testing · Location · Results · Reference), the
// "Registered on this visit" list with the family total, and "Register another candidate".
// Everything about THIS registration comes from the server's answer (`result`), except the email
// for results: the server never sends it back (privacy, §8.3), so the Results line shows what the
// family typed (v0.510). The reference number is shown on screen only (no email yet, v0.103).
import { formatDollars, longDate, methodsLabel, methodWord } from '../register/format.js';
import { startTimeLabel } from '../lib/star/starEventRules.js';
import { whereLine } from './parts.jsx';
import * as T from './text.js';

export default function Registered({ result, email, visit, onTestingDay, onAnother, headingRef }) {
  const name = `${result.first_name} ${result.last_name}`;
  const method = methodWord(result.paying_by);
  const time = startTimeLabel(result.start_time);
  const twoPrices = result.same_day_cents > result.standard_cents;

  // The family's total: before-the-day prices before the testing day, testing-day prices on it.
  const earlyTotal = visit.reduce((sum, v) => sum + v.earlyCents, 0);
  const dayTotal = visit.reduce((sum, v) => sum + v.dayCents, 0);
  const methods = methodsLabel(visit.map((v) => v.payingBy));
  const anyTwoPrices = visit.some((v) => v.dayCents > v.earlyCents);

  return (
    <div className="reg-step">
      <div className="reg-done">
        <h1 className="reg-done__title" ref={headingRef} tabIndex={-1}>
          {T.isRegistered(name)}
        </h1>
        <div>
          {result.event_name} · {T.progression(result.dan_label, result.stars_from)}
        </div>
      </div>

      <section className="reg-card" aria-labelledby="sreg-next">
        <h2 className="reg-card__title" id="sreg-next">{T.WHAT_NEXT}</h2>
        <dl className="reg-review">
          <div className="reg-rv">
            <dt className="reg-rv__k">{T.ROW_PAY}</dt>
            <dd className="reg-rv__v">
              {onTestingDay ? (
                <>
                  <b>{formatDollars(result.same_day_cents)}</b>
                  {T.payLineToday(method)}
                </>
              ) : (
                <>
                  <b>{formatDollars(result.standard_cents)}</b>
                  {T.payLine(method)}
                  {twoPrices ? (
                    <>
                      <br />
                      <span className="reg-hint">{T.dayPriceHint(formatDollars(result.same_day_cents))}</span>
                    </>
                  ) : null}
                </>
              )}
            </dd>
          </div>
          <div className="reg-rv">
            <dt className="reg-rv__k">{T.ROW_TESTING}</dt>
            <dd className="reg-rv__v">
              {longDate(result.testing_date)}
              {time ? ` · ${time}` : ''}
            </dd>
          </div>
          <div className="reg-rv">
            <dt className="reg-rv__k">{T.ROW_LOCATION}</dt>
            <dd className="reg-rv__v">{whereLine(result.where)}</dd>
          </div>
          <div className="reg-rv">
            <dt className="reg-rv__k">{T.ROW_RESULTS}</dt>
            <dd className="reg-rv__v">{T.sentTo(email)}</dd>
          </div>
          <div className="reg-rv">
            <dt className="reg-rv__k">{T.ROW_REFERENCE}</dt>
            <dd className="reg-rv__v">
              <b className="reg-ref">{result.reference}</b>
              <br />
              <span className="reg-hint">{T.REFERENCE_HINT}</span>
            </dd>
          </div>
        </dl>
      </section>

      <section className="reg-card sreg-visit" aria-labelledby="sreg-visit">
        <h2 className="reg-card__title" id="sreg-visit">{T.THIS_VISIT}</h2>
        <ul className="reg-visit__list">
          {visit.map((v) => (
            <li key={v.reference} className="reg-visit__row">
              <span>
                {v.name} · {v.danLabel}
              </span>
              <b>{formatDollars(onTestingDay ? v.dayCents : v.earlyCents)}</b>
            </li>
          ))}
        </ul>
        <div className="sreg-total">
          <span>
            {onTestingDay || !anyTwoPrices ? T.TOTAL : T.TOTAL_EARLY}
            <small>{onTestingDay ? T.totalHowToday(methods) : T.totalHow(methods)}</small>
          </span>
          <b>{formatDollars(onTestingDay ? dayTotal : earlyTotal)}</b>
        </div>
      </section>

      <button type="button" className="reg-btn reg-btn--main" onClick={onAnother}>
        {T.REGISTER_ANOTHER}
      </button>
    </div>
  );
}
