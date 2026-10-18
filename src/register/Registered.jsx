// Registered.jsx — the page after a successful Send (mockups F7, F8).
// Why it exists: rulebook v0.131/v0.132 — "<Name> is registered", What happens next (Pay ·
// Testing · Location · Reference), the "Registered on this visit" list with the official
// Total due and the testing-day warning, and "Register another student".
// The reference number is shown on screen only (no email, Q5).
// Everything about THIS registration comes from the server's answer (`result`), except the
// student's current belt, which the page already knows (`fromRank`).
import { DayWarning } from './parts.jsx';
import { TestingFor } from './StepDetails.jsx';
import { earlyDeadline, formatDollars, locationLine, longDate, methodWord, methodsLabel } from './format.js';
import { classTimeLabel } from '../lib/testing/eventRules.js';
import * as T from './text.js';

export default function Registered({ eventName, result, fromRank, visit, onTestingDay, onAnother, headingRef }) {
  const name = `${result.first_name} ${result.last_name}`;
  const deadline = earlyDeadline(result.testing_date);
  const method = methodWord(result.paying_by);

  // The family's total: early prices before the testing day, testing-day prices on it.
  const earlyTotal = visit.reduce((sum, v) => sum + v.earlyCents, 0);
  const dayTotal = visit.reduce((sum, v) => sum + v.dayCents, 0);
  const methods = methodsLabel(visit.map((v) => v.payingBy));

  return (
    <div className="reg-step">
      <div className="reg-done">
        <h1 className="reg-done__title" ref={headingRef} tabIndex={-1}>
          {T.isRegistered(name)}
        </h1>
        <div>
          {eventName} · <TestingFor rank={fromRank} testingFor={result.testing_for} boldTarget={false} />
        </div>
      </div>

      <section className="reg-card" aria-labelledby="reg-next">
        <h2 className="reg-card__title" id="reg-next">{T.WHAT_NEXT}</h2>
        <dl className="reg-review">
          <div className="reg-rv">
            <dt className="reg-rv__k">{T.ROW_PAY}</dt>
            <dd className="reg-rv__v">
              {onTestingDay ? (
                <>
                  <b>{formatDollars(result.day_cents)}</b>
                  {T.payLineToday(method)}
                </>
              ) : (
                <>
                  <b>{formatDollars(result.early_cents)}</b>
                  {T.payLine(method, deadline)}
                  {result.day_cents > result.early_cents ? (
                    <>
                      <br />
                      <span className="reg-warn-text">{T.dayPriceLine(formatDollars(result.day_cents))}</span>
                    </>
                  ) : null}
                </>
              )}
            </dd>
          </div>
          <div className="reg-rv">
            <dt className="reg-rv__k">{T.ROW_TESTING}</dt>
            <dd className="reg-rv__v">
              {longDate(result.testing_date)} · {result.class_name}, {classTimeLabel(result.start_time, result.end_time)}
            </dd>
          </div>
          <div className="reg-rv">
            <dt className="reg-rv__k">{T.ROW_LOCATION}</dt>
            <dd className="reg-rv__v">{locationLine(result.school_name, result.address)}</dd>
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

      <section className="reg-card reg-visit" aria-labelledby="reg-visit">
        <h2 className="reg-card__title" id="reg-visit">{T.THIS_VISIT}</h2>
        <ul className="reg-visit__list">
          {visit.map((v) => (
            <li key={v.reference} className="reg-visit__row">
              <span>
                {v.name} · {v.from} → {v.to ?? T.NO_NEW_RANK}
              </span>
              <b>{formatDollars(onTestingDay ? v.dayCents : v.earlyCents)}</b>
            </li>
          ))}
        </ul>
        <div className="reg-total">
          <span>
            {T.TOTAL_DUE}
            <small>{onTestingDay ? T.totalHowToday(methods) : T.totalHow(methods, deadline)}</small>
          </span>
          <b>{formatDollars(onTestingDay ? dayTotal : earlyTotal)}</b>
        </div>
        {!onTestingDay && dayTotal > earlyTotal ? (
          <div className="reg-visit__warn">
            <DayWarning dayCents={dayTotal} savingCents={dayTotal - earlyTotal} deadline={deadline} />
          </div>
        ) : null}
      </section>

      <button type="button" className="reg-btn reg-btn--main reg-btn--full" onClick={onAnother}>
        {T.REGISTER_ANOTHER}
      </button>
    </div>
  );
}

