// StepCheck.jsx — step 2 of the Black Belt family form: check, agree to the waiver, sign, send
// (mockups Form 5, 6, 8, 9; rulebook v0.213, v0.905; contract 0016-B1 §4.3).
// Why it exists: a summary of step 1 (with the candidate's age on the first testing day and
// what to pay when), the school's waiver (first lines, Read all, its version), the "I have read
// and agree" tick, the name of the person signing (a parent or guardian for a candidate under 18
// on the first testing day; otherwise filled in with the candidate's name), the drawn signature,
// then Send registration. Banners after a Send that didn't work appear at the top; nothing the
// family entered is lost. When registration closed (or the waiver changed) meanwhile, only the
// summary stays and nothing more can be sent.
import SignaturePad from './SignaturePad.jsx';
import { FieldError, Icon, Row, TickBox, TopError } from './parts.jsx';
import { dobLabel, dueLabel, formatDollars, monthDay, shortDay } from './format.js';
import { normalizeName } from '../../lib/testing/names.js';
import * as T from './text.js';

// The words for each banner code.
const BANNERS = {
  failed: T.SEND_FAILED,
  verify: T.VERIFY_FAILED,
  rate: T.RATE_LIMITED,
  closed: T.CLOSED_WHILE_FILLING,
  waiver: T.WAIVER_CHANGED,
};

// About the first 300 characters of the waiver, cut at a space, on one line (Read all shows the rest).
const EXCERPT_LENGTH = 300;
function excerpt(body) {
  const flat = String(body ?? '').replace(/\s+/g, ' ').trim();
  if (flat.length <= EXCERPT_LENGTH) return flat;
  const cut = flat.slice(0, EXCERPT_LENGTH);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 200 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.]+$/, '')} …`;
}

export default function StepCheck({
  cycle,
  school,
  waiver,
  form,
  schedule, // what is due when (rules.scheduleFor)
  paymentsCount, // how many payments the chosen plan has
  today,
  firstDay,
  age,
  isMinor,
  ack,
  setAck,
  signer,
  setSigner,
  errors, // { ack, signer, signature } texts (or null)
  banner, // null | 'failed' | 'verify' | 'rate' | 'closed' | 'waiver'
  sending,
  hasTried, // a Send failed before → the button says "Try again"
  onSignatureChange,
  onSend,
  onBack,
  onReadAll,
  onReload,
  refs, // { ack, signer, signature, turnstile, banner }
  headingRef,
}) {
  const stopped = banner === 'closed' || banner === 'waiver'; // nothing more can be sent
  const first = normalizeName(form.first);
  const firstDayShort = monthDay(firstDay);
  const signerDescribed = [errors.signer ? 'bbf-signer-err' : null, 'bbf-signer-hint'].filter(Boolean).join(' ');

  return (
    <div className="bbf-step">
      <h2 className="bbf-stepline" ref={headingRef} tabIndex={-1}>
        {T.STEP_2}
      </h2>
      {banner ? (
        <TopError
          innerRef={refs.banner}
          action={
            banner === 'waiver' ? (
              <button type="button" className="bbf-btn bbf-btn--inbanner" onClick={onReload}>
                {T.RELOAD_PAGE}
              </button>
            ) : null
          }
        >
          {BANNERS[banner]}
        </TopError>
      ) : (
        <p className="bbf-intro">{T.CHECK_INTRO}</p>
      )}

      {/* The summary */}
      <dl className="bbf-card bbf-review">
        <Row label={T.ROW_CYCLE}>{T.cycleRow(cycle.name, shortDay(firstDay))}</Row>
        <Row label={T.ROW_CANDIDATE}>
          {first} {normalizeName(form.last)}
        </Row>
        <Row label={T.ROW_SCHOOL}>{T.schoolFromLink(school?.name ?? '')}</Row>
        <Row label={T.ROW_DOB}>{T.dobWithAge(dobLabel(form.dob), age, firstDayShort)}</Row>
        <Row label={T.ROW_TESTING_FOR}>
          {T.DAN[form.dan]}
          {form.kukkiwon ? T.WITH_KUKKIWON : T.NO_KUKKIWON}
        </Row>
        <Row label={T.ROW_TO_PAY}>
          <ToPay schedule={schedule} paymentsCount={paymentsCount} today={today} />
        </Row>
        <Row label={T.ROW_RESULTS}>{form.email.trim()}</Row>
      </dl>

      {stopped ? null : (
        <>
          <div className="bbf-card">
            {/* The waiver */}
            <div className="bbf-waiver">
              <div className="bbf-waiver__title">{T.WAIVER_TITLE}</div>
              <p className="bbf-waiver__text">
                {excerpt(waiver?.body)}{' '}
                <button type="button" className="bbf-link bbf-link--inline" onClick={onReadAll}>
                  {T.READ_ALL}
                </button>
              </p>
              <div className="bbf-waiver__version">{T.waiverVersion(waiver?.version_name ?? '')}</div>
            </div>

            <TickBox
              id="bbf-ack"
              inputRef={refs.ack}
              checked={ack}
              onChange={setAck}
              invalid={Boolean(errors.ack)}
              describedBy={errors.ack ? 'bbf-ack-err' : undefined}
            >
              {T.ACK}
            </TickBox>
            <div className="bbf-indent">
              <FieldError id="bbf-ack-err">{errors.ack}</FieldError>
            </div>

            {/* The person signing */}
            <div className="bbf-field bbf-field--signer">
              <label className="bbf-label" htmlFor="bbf-signer">
                {T.SIGNER}
              </label>
              <input
                ref={refs.signer}
                id="bbf-signer"
                className={`bbf-input${errors.signer ? ' is-invalid' : ''}`}
                value={signer}
                onChange={(e) => setSigner(e.target.value)}
                autoComplete="off"
                aria-invalid={Boolean(errors.signer) || undefined}
                aria-describedby={signerDescribed}
              />
              <FieldError id="bbf-signer-err">{errors.signer}</FieldError>
              <div className="bbf-hint" id="bbf-signer-hint">
                {isMinor ? T.signerHintMinor(first, firstDayShort) : T.signerHintAdult(first, firstDayShort)}
              </div>
            </div>

            {/* The signature */}
            <div className="bbf-field bbf-field--sign">
              <div className="bbf-label" id="bbf-sign-label">
                {T.SIGNATURE}
                {isMinor ? T.SIGNATURE_MINOR : null}
              </div>
              <SignaturePad
                ref={refs.signature}
                invalid={Boolean(errors.signature)}
                onChange={onSignatureChange}
                describedBy={errors.signature ? 'bbf-sign-err bbf-sign-hint' : 'bbf-sign-hint'}
              />
              <FieldError id="bbf-sign-err">{errors.signature}</FieldError>
              <div className="bbf-hint" id="bbf-sign-hint">
                {T.SIGNATURE_HINT}
              </div>
            </div>
          </div>

          {/* Turnstile puts its "Verify you are human" box here, only when Cloudflare asks.
              React never puts anything inside this box. */}
          <div className="bbf-turnstile" ref={refs.turnstile} />

          <button
            type="button"
            className="bbf-btn bbf-btn--primary bbf-btn--main"
            onClick={onSend}
            aria-disabled={sending || undefined}
            aria-busy={sending || undefined}
          >
            {sending ? T.SENDING : hasTried ? T.TRY_AGAIN : T.SEND}
          </button>
          <div className="bbf-center">
            <button type="button" className="bbf-link" onClick={onBack} disabled={sending}>
              <Icon name="arrowLeft" size={14} />
              {T.BACK_TO_EDIT}
            </button>
          </div>
        </>
      )}
      <p className="bbf-privacy">{T.PRIVACY}</p>
    </div>
  );
}

// "To pay": "$970 in 3 payments, at the front desk:" / "Mar 27 $390 (incl. Kukkiwon $100)" /
// "Apr 24 $290 · May 29 $290" — or "$990 in full by Mar 27, at the front desk".
// `schedule` is rules.scheduleFor's answer (one line per due date; a passed date reads "Today").
function ToPay({ schedule, paymentsCount, today }) {
  if (!schedule) return null;
  const incl = schedule.kukkiwonCents ? T.inclKukkiwon(formatDollars(schedule.kukkiwonCents)) : '';
  const lines = schedule.lines;
  if (paymentsCount <= 1) {
    const only = lines[0];
    return (
      <>
        <b>{formatDollars(schedule.totalCents)}</b>
        {!only || only.dueOn <= today ? T.IN_FULL_TODAY : T.inFullBy(monthDay(only.dueOn))}
        {incl}
      </>
    );
  }
  const [firstLine, ...rest] = lines;
  const line = (l) => `${dueLabel(l.dueOn, today)} ${formatDollars(l.amountCents)}`;
  return (
    <>
      <b>{formatDollars(schedule.totalCents)}</b>
      {T.inPayments(paymentsCount)}
      <br />
      {line(firstLine)}
      {firstLine.items.includes('kukkiwon') ? incl : ''}
      {rest.length ? (
        <>
          <br />
          {rest.map(line).join(' · ')}
        </>
      ) : null}
    </>
  );
}
