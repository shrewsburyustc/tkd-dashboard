// DonePage.jsx — what the family sees after Register (pictures A-family-done: done-card, done-card-failed,
// done-cash) and when they come back from Square (/breaking/<code>?paid=1).
// Why it exists: the Function answers a registration with the amount the DATABASE worked out and, for Card,
// either a Square payment link, "failed" (Square could not make one) or nothing. The page shows exactly
// that: the amount comes from the answer, never from the form. The registration itself is already saved
// before this page shows, so a failed link is not a failed registration ("You're registered ...").
// The confirmation is on screen only (no email), like Color Belt and Camps.
import { Icon, TopError } from './parts.jsx';
import { formatMoneyWithCents } from '../lib/money.js';
import { longDate } from '../register/format.js';
import { schoolName } from './form.js';
import * as T from './text.js';

// `result` = { amountCents, payingBy, sameDay, pay: { state: 'link' | 'failed' | 'none' | 'paid', url? } }
// `summary` = what the form said (form.js summaryOf). `note` = the amber line for a failed link.
export function DonePage({ event, summary, result, note, busy, canRetry, headingRef, bannerRef, turnstileRef, onPay, onTryAgain, onAnother }) {
  const amount = formatMoneyWithCents(result.amountCents);
  const card = result.payingBy === 'card';
  const state = result.pay?.state;
  const paid = state === 'paid';
  const link = card && state === 'link';
  const failed = card && !link && !paid; // 'failed' (or an unexpected 'none' for a card): pay at the desk or try again
  return (
    <>
      <div className="reg-done">
        <h1 className="reg-done__title" ref={headingRef} tabIndex={-1}>
          {T.registeredTitle(summary.name)}
        </h1>
        <div>
          {event.name} · {longDate(event.eventDate)} · {schoolName(event.locationCode)}
        </div>
      </div>

      {failed && note ? <TopError innerRef={bannerRef}>{note}</TopError> : null}

      <section className="reg-card" aria-labelledby="brk-reg-title">
        <h2 className="reg-card__title" id="brk-reg-title">{T.YOUR_REGISTRATION}</h2>
        <dl className="reg-review">
          <Row label={T.ROW_CLASS}>{summary.classText}</Row>
          <Row label={T.ROW_RANK}>{T.rankAge(summary.rank, summary.age)}</Row>
          <Row label={T.ROW_BOARDS}>{summary.boardsText}</Row>
          <Row label={T.ROW_PAYING}>{T.METHOD[result.payingBy] ?? ''}</Row>
        </dl>
      </section>

      {paid ? (
        <section className="reg-card reg-visit" aria-labelledby="brk-pay-title">
          <h2 className="reg-card__title" id="brk-pay-title">{T.PAY}</h2>
          <p className="brk-say">{T.ALREADY_PAID}</p>
        </section>
      ) : link ? (
        <section className="reg-card reg-visit" aria-labelledby="brk-pay-title">
          <h2 className="reg-card__title" id="brk-pay-title">{T.PAY_NOW}</h2>
          <div className="reg-total">
            <span>
              {T.TOTAL_TO_PAY}
              <small>{T.HOW_CARD}</small>
            </span>
            <b>{amount}</b>
          </div>
          <div className="brk-paybox">
            <button type="button" className="reg-btn reg-btn--primary reg-btn--main" onClick={() => onPay(result.pay.url)}>
              <Icon name="credit-card" />
              {T.payWithSquare(amount)}
            </button>
            <div className="reg-hint">{T.PAY_HINT}</div>
          </div>
        </section>
      ) : failed ? (
        <section className="reg-card reg-visit" aria-labelledby="brk-pay-title">
          <h2 className="reg-card__title" id="brk-pay-title">{T.PAY}</h2>
          <div className="reg-total">
            <span>
              {T.TOTAL_TO_PAY}
              <small>{T.HOW_CARD_SHORT}</small>
            </span>
            <b>{amount}</b>
          </div>
          <div className="brk-paybox">
            {/* Turnstile may show its small check here when "Try again" asks the Function for a new link. */}
            <div className="reg-turnstile" ref={turnstileRef} />
            {canRetry ? (
              <button type="button" className="reg-btn" onClick={onTryAgain} disabled={busy} aria-busy={busy || undefined}>
                {busy ? T.SENDING : T.TRY_AGAIN}
              </button>
            ) : null}
            <div className="reg-hint">{T.OR_DESK}</div>
          </div>
        </section>
      ) : (
        <section className="reg-card reg-visit" aria-labelledby="brk-pay-title">
          <h2 className="reg-card__title" id="brk-pay-title">{T.PAY_THE_SCHOOL}</h2>
          <p className="brk-say">{result.sameDay ? T.CASH_SAY_SAME_DAY : T.CASH_SAY}</p>
          <div className="reg-total">
            <span>
              {T.TOTAL_TO_PAY}
              <small>{T.HOW_DESK}</small>
            </span>
            <b>{amount}</b>
          </div>
          <div className="brk-paybox">
            <button type="button" className="reg-btn" onClick={onAnother}>
              {T.REGISTER_ANOTHER}
            </button>
          </div>
        </section>
      )}
    </>
  );
}

// The page a family lands on after paying at Square (/breaking/<code>?paid=1).
// status: 'checking' | 'paid' | 'unpaid' | 'unknown' ('unknown' = this browser has no registration to check).
export function ReturnPage({ status, headingRef, onCheck }) {
  const paid = status === 'paid';
  return (
    <>
      <div className="reg-done">
        <h1 className="reg-done__title" ref={headingRef} tabIndex={-1}>
          {paid ? T.PAID_TITLE : T.THANK_YOU}
        </h1>
        <div>{paid ? T.PAID_TEXT : T.THANK_YOU_TEXT}</div>
      </div>
      {paid ? null : (
        <section className="reg-card reg-visit" aria-live="polite">
          {status === 'checking' ? <p className="brk-say">{T.CHECKING}</p> : null}
          {status === 'unpaid' ? <p className="brk-say">{T.NOT_YET}</p> : null}
          {status === 'unknown' ? <p className="brk-say">{T.CLOSE_PAGE}</p> : null}
          {status === 'unpaid' ? (
            <div className="brk-paybox">
              <button type="button" className="reg-btn" onClick={onCheck}>
                {T.CHECK_AGAIN}
              </button>
              <div className="reg-hint">{T.CLOSE_PAGE}</div>
            </div>
          ) : null}
        </section>
      )}
    </>
  );
}

// One labelled line of "Your registration".
function Row({ label, children }) {
  return (
    <div className="reg-rv">
      <dt className="reg-rv__k">{label}</dt>
      <dd className="reg-rv__v">{children}</dd>
    </div>
  );
}
