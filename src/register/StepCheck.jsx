// StepCheck.jsx — step 2 of the family form: check the details, tick the confirmation, sign,
// send (mockups F4–F6, F9, F10).
// Why it exists: rulebook v0.102/v0.132 — a summary of step 1, the required confirmation tick
// ("…Testing fees are not refundable."), a drawn signature, then Send registration. Messages
// after a failed Send appear at the top (F9 / F10 and the spam-check / too-many-tries wording),
// and nothing the family entered is lost.
import SignaturePad from './SignaturePad.jsx';
import { FieldError, TickBox, TopError } from './parts.jsx';
import { TestingFor } from './StepDetails.jsx';
import { formatDollars, earlyDeadline, methodWord, shortDate } from './format.js';
import { classTimeLabel } from '../lib/testing/eventRules.js';
import * as T from './text.js';

// The words for each banner code.
const BANNERS = {
  failed: T.SEND_FAILED,
  verify: T.VERIFY_FAILED,
  rate: T.RATE_LIMITED,
  closed: T.CLOSED_WHILE_FILLING,
};

export default function StepCheck({
  event,
  cls,
  rank,
  form,
  onTestingDay,
  ack,
  setAck,
  errors, // { ack, signature } texts to show (or null)
  banner, // null | 'failed' | 'verify' | 'rate' | 'closed'
  sending,
  hasTried, // a send failed before → the button says "Try again"
  onSignatureChange,
  onSend,
  onBack,
  refs, // { ack, signature, turnstile, banner }
  headingRef,
}) {
  const deadline = earlyDeadline(event.testing_date);
  const method = methodWord(form.payingBy);
  const closed = banner === 'closed'; // F10: only the summary stays; nothing more can be sent

  return (
    <div className="reg-step">
      <h2 className="reg-stepline" ref={headingRef} tabIndex={-1}>
        {T.STEP_2}
      </h2>
      {banner ? <TopError innerRef={refs.banner}>{BANNERS[banner]}</TopError> : <p className="reg-intro">{T.CHECK_INTRO}</p>}

      {/* The summary */}
      <dl className="reg-card reg-review">
        <Row label={T.ROW_EVENT}>
          {event.name} · {shortDate(event.testing_date)}
        </Row>
        <Row label={T.ROW_STUDENT}>
          {form.first.trim()} {form.last.trim()}
        </Row>
        <Row label={T.TESTING_FOR}>
          <TestingFor rank={rank} boldTarget={false} />
        </Row>
        <Row label={T.ROW_CLASS_TIME}>
          {cls.class_name} · {classTimeLabel(cls.start_time, cls.end_time)}
        </Row>
        <Row label={T.ROW_STRIPES}>{T.CONFIRMED}</Row>
        <Row label={T.ROW_FEE}>
          {onTestingDay ? (
            <>
              <b>{formatDollars(rank.day_cents)}</b>
              {T.feeLineToday(method)}
            </>
          ) : (
            <>
              <b>{formatDollars(rank.early_cents)}</b>
              {T.feeLine(deadline, method)}
              {rank.day_cents > rank.early_cents ? (
                <>
                  <br />
                  <span className="reg-warn-text">{T.dayPriceLine(formatDollars(rank.day_cents))}</span>
                </>
              ) : null}
            </>
          )}
        </Row>
      </dl>

      {closed ? null : (
        <>
          <div className="reg-card">
            <TickBox
              id="reg-ack"
              inputRef={refs.ack}
              checked={ack}
              onChange={setAck}
              invalid={Boolean(errors.ack)}
              describedBy={errors.ack ? 'reg-ack-err' : undefined}
            >
              {T.ACK_TEXT}
              <b>{T.ACK_BOLD}</b>
            </TickBox>
            <div className="reg-indent">
              <FieldError id="reg-ack-err">{errors.ack}</FieldError>
            </div>

            <div className="reg-field reg-field--sign">
              <div className="reg-label" id="reg-sign-label">
                {T.SIGNATURE}
                <span className="reg-muted">{T.SIGNATURE_WHO}</span>
              </div>
              <SignaturePad
                ref={refs.signature}
                invalid={Boolean(errors.signature)}
                onChange={onSignatureChange}
                describedBy={errors.signature ? 'reg-sign-err reg-sign-hint' : 'reg-sign-hint'}
              />
              <FieldError id="reg-sign-err">{errors.signature}</FieldError>
              <div className="reg-hint" id="reg-sign-hint">
                {T.SIGNATURE_HINT}
              </div>
            </div>
          </div>

          {/* Turnstile puts its "Verify you are human" box here, only when Cloudflare asks (F6).
              React never puts anything inside this box. */}
          <div className="reg-turnstile" ref={refs.turnstile} />

          <button
            type="button"
            className="reg-btn reg-btn--primary reg-btn--main"
            onClick={onSend}
            disabled={sending}
            aria-busy={sending || undefined}
          >
            {sending ? T.SENDING : hasTried ? T.TRY_AGAIN : T.SEND}
          </button>
          <div className="reg-center">
            <button type="button" className="reg-link" onClick={onBack} disabled={sending}>
              {T.BACK_TO_EDIT}
            </button>
          </div>
        </>
      )}
      <p className="reg-privacy">{T.PRIVACY}</p>
    </div>
  );
}

// One labelled line of the summary.
function Row({ label, children }) {
  return (
    <div className="reg-rv">
      <dt className="reg-rv__k">{label}</dt>
      <dd className="reg-rv__v">{children}</dd>
    </div>
  );
}
