// SignedUp.jsx — the page after a successful Sign up (mockup C7c).
// Why it exists: rulebook v0.232 — the confirmation is on screen only (no email, like Color
// Belt): "You're signed up", What happens next (Pay · Camp · Where · About the camp · Reference)
// and "Pay at the school before camp" with each child's line and the Total to pay.
// Everything here comes from the server's answer (`result`, already camelCase), so the family
// sees exactly what was saved — not what the form guessed.
import { addressLine, campDaysShort, campHours, formatDollars, joinAnd, locationLine, shortDate, sortedDates } from './format.js';
import * as T from './text.js';

export default function SignedUp({ result, headingRef }) {
  const camp = result.camp ?? {};
  const children = result.children ?? [];
  const names = children.map((c) => `${c.firstName} ${c.lastName}`);
  const method = T.METHOD[result.payingBy] ?? '';
  const firstDay = sortedDates(camp.days)[0];
  const where = locationLine(camp.schoolName, camp.address);

  return (
    <div className="reg-step">
      <div className="reg-done">
        <h1 className="reg-done__title" ref={headingRef} tabIndex={-1}>
          {T.SIGNED_UP}
        </h1>
        <div>
          {joinAnd(names)} · {camp.name}
        </div>
      </div>

      <section className="reg-card" aria-labelledby="camp-next">
        <h2 className="reg-card__title" id="camp-next">{T.WHAT_NEXT}</h2>
        <dl className="reg-review">
          <Row label={T.ROW_PAY}>
            <b>{formatDollars(result.familyTotalCents)}</b>
            {T.payNext(method.toLowerCase())}
          </Row>
          <Row label={T.ROW_CAMP}>
            {campDaysShort(camp.days)} · {campHours(camp.startTime, camp.endTime)}
          </Row>
          {camp.bothSchools ? (
            <Row label={T.ROW_WHERE}>
              {T.BOTH_SCHOOLS_LINE(camp.schoolName)}
              {addressLine(camp.address) ? (
                <>
                  <br />
                  {addressLine(camp.address)}
                </>
              ) : null}
            </Row>
          ) : (
            <Row label={T.ROW_WHERE}>{where}</Row>
          )}
          {camp.description ? (
            <Row label={T.ROW_ABOUT}>
              <span className="camp-pre">{camp.description}</span>
            </Row>
          ) : null}
          <Row label={T.ROW_REFERENCE}>
            <b className="reg-ref">{result.reference}</b>
            <br />
            <span className="reg-hint">{T.REFERENCE_HINT}</span>
          </Row>
        </dl>
      </section>

      <section className="reg-card reg-visit" aria-labelledby="camp-pay">
        <h2 className="reg-card__title" id="camp-pay">{T.PAY_CARD_TITLE}</h2>
        <ul className="reg-visit__list">
          {children.map((c, i) => (
            <li key={`${i}-${c.firstName}`} className="reg-visit__row">
              <span>{T.childPayLine(names[i], T.dayCount(c.dayCount), (c.extras ?? []).map((e) => e.name))}</span>
              <b>{formatDollars(c.totalCents)}</b>
            </li>
          ))}
        </ul>
        <div className="reg-total">
          <span>
            {T.TOTAL_TO_PAY}
            <small>{T.totalHow(method, firstDay ? shortDate(firstDay) : '')}</small>
          </span>
          <b>{formatDollars(result.familyTotalCents)}</b>
        </div>
      </section>
    </div>
  );
}

// One labelled line of "What happens next".
function Row({ label, children }) {
  return (
    <div className="reg-rv">
      <dt className="reg-rv__k">{label}</dt>
      <dd className="reg-rv__v">{children}</dd>
    </div>
  );
}

