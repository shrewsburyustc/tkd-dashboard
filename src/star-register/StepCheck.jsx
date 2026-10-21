// StepCheck.jsx — step 2 of the Star family form: check the details, tick the acknowledgment, sign,
// send (Form screens 6–8, 12, 13; gap mockups F1 and F4).
// Why it exists: rulebook v0.94 (a plain summary starting with the event, the age on testing day,
// the school from the link, both prices, where results go; Send registration and Back to edit),
// v0.102 / v0.107 (the required tick and a drawn signature with Clear, no typed fallback), v0.510
// (the acknowledgment and privacy wording). Messages after a failed Send, as approved:
//   'failed'  sending failed — amber banner at the top instead of the intro, button "Try again" (12)
//   'rate'    too many tries — amber banner at the top, the intro stays, button "Try again" (F4)
//   'verify'  the human check couldn't run — amber box above Send with a "Try again" link (8)
//   'closed'  registration closed while filling in — banner at the top, only the summary stays (13)
// Nothing the family entered is lost in any of them.
import { IconAlertTriangle, IconArrowLeft } from '@tabler/icons-react';
import SignaturePad from '../register/SignaturePad.jsx';
import { FieldError, TickBox, TopError } from '../register/parts.jsx';
import { formatDollars, methodWord, shortDate } from '../register/format.js';
import { startTimeLabel } from '../lib/star/starEventRules.js';
import { ageOn } from '../lib/star/resultRules.js';
import { monthDayYear } from './parts.jsx';
import * as T from './text.js';

const TOP_BANNERS = { failed: T.SEND_FAILED, rate: T.RATE_LIMITED, closed: T.CLOSED_WHILE_FILLING };

export default function StepCheck({
  event,
  school,
  dan,
  form,
  onTestingDay,
  ack,
  setAck,
  errors, // { ack, signature } texts to show (or null)
  banner, // null | 'failed' | 'rate' | 'verify' | 'closed'
  sending,
  hasTried, // a send failed before → the button says "Try again"
  onSignatureChange,
  onSend,
  onBack,
  refs, // { ack, signature, turnstile, banner }
  headingRef,
}) {
  const method = methodWord(form.payingBy);
  const closed = banner === 'closed'; // screen 13: only the summary stays; nothing more can be sent
  const top = TOP_BANNERS[banner] ?? null;
  const showIntro = !top || banner === 'rate';
  const time = startTimeLabel(event.start_time);

  let fee;
  if (onTestingDay) fee = T.feeSummaryToday(formatDollars(dan.same_day_cents), method);
  else if (dan.same_day_cents === dan.standard_cents) fee = T.feeSummaryOne(formatDollars(dan.standard_cents), method);
  else fee = T.feeSummary(formatDollars(dan.standard_cents), formatDollars(dan.same_day_cents), method);

  return (
    <div className="reg-step">
      <h2 className="reg-stepline" ref={headingRef} tabIndex={-1}>
        {T.STEP_2}
      </h2>
      {top ? <TopError innerRef={refs.banner}>{top}</TopError> : null}
      {showIntro ? <p className="reg-intro">{T.CHECK_INTRO}</p> : null}

      {/* The summary */}
      <dl className="reg-card reg-review">
        <Row label={T.ROW_EVENT}>
          {event.name} · {shortDate(event.testing_date)}
          {time ? ` · ${time}` : ''}
        </Row>
        <Row label={T.ROW_CANDIDATE}>
          {form.first.trim()} {form.last.trim()}
        </Row>
        <Row label={T.ROW_SCHOOL}>{T.fromThisLink(school.name)}</Row>
        <Row label={T.ROW_DOB}>{T.dobLine(monthDayYear(form.dob), ageOn(form.dob, event.testing_date))}</Row>
        <Row label={T.TESTING_FOR}>{T.progression(dan.label, form.stars)}</Row>
        <Row label={T.ROW_FEE}>{fee}</Row>
        <Row label={T.ROW_RESULTS_TO}>{form.email.trim()}</Row>
      </dl>

      {closed ? null : (
        <>
          <div className="reg-card">
            <TickBox
              id="sreg-ack"
              inputRef={refs.ack}
              checked={ack}
              onChange={setAck}
              invalid={Boolean(errors.ack)}
              describedBy={errors.ack ? 'sreg-ack-err' : undefined}
            >
              {T.ACK_TEXT}
              <b>{T.ACK_BOLD}</b>
              {T.ACK_END}
            </TickBox>
            <div className="reg-indent">
              <FieldError id="sreg-ack-err">{errors.ack}</FieldError>
            </div>

            <div className="reg-field reg-field--sign">
              <div className="reg-label" id="sreg-sign-label">
                {T.SIGNATURE}
              </div>
              <SignaturePad
                ref={refs.signature}
                invalid={Boolean(errors.signature)}
                onChange={onSignatureChange}
                describedBy={errors.signature ? 'sreg-sign-err sreg-sign-hint' : 'sreg-sign-hint'}
              />
              <FieldError id="sreg-sign-err">{errors.signature}</FieldError>
              <div className="reg-hint" id="sreg-sign-hint">
                {T.SIGNATURE_HINT}
              </div>
            </div>
          </div>

          {/* Turnstile puts its "Verify you are human" box here, only when Cloudflare asks (screen 8).
              React never puts anything inside this box. */}
          <div className="reg-turnstile" ref={refs.turnstile} />

          {/* Screen 8: the human check couldn't run */}
          {banner === 'verify' ? (
            <div className="sreg-warnbox" role="alert" ref={refs.banner} tabIndex={-1}>
              <IconAlertTriangle size={18} aria-hidden="true" />
              <span>
                {T.VERIFY_BEFORE}
                <button type="button" className="reg-link sreg-inline-link" onClick={onSend} disabled={sending}>
                  {T.TRY_AGAIN}
                </button>
                {T.VERIFY_AFTER}
              </span>
            </div>
          ) : null}

          <button
            type="button"
            className="reg-btn reg-btn--primary reg-btn--main"
            onClick={onSend}
            disabled={sending}
            aria-busy={sending || undefined}
          >
            {sending ? T.SENDING : hasTried && banner !== 'verify' ? T.TRY_AGAIN : T.SEND}
          </button>
          <div className="reg-center">
            <button type="button" className="reg-link sreg-back" onClick={onBack} disabled={sending}>
              {/* ti-arrow-left */}
              <IconArrowLeft size={16} aria-hidden="true" />
              {T.BACK_TO_EDIT}
            </button>
          </div>
          <p className="reg-privacy">{T.PRIVACY}</p>
        </>
      )}
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
