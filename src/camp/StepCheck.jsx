// StepCheck.jsx — step 2 of the camp form (mockup C7b): check the details, read the waiver,
// tick, sign, Sign up.
// Why it exists: rulebook v0.232 — a summary (camp, parent, emergency contact, paying), each
// child's price (early or regular, by today's date at the school) with extras, the family total,
// the camp's waiver text, the tick "I am <first child>'s parent or guardian…", the drawn signature
// (Color Belt's SignaturePad, reused) and Sign up (full width on phones only).
// Messages after a failed Sign up appear at the top, and nothing the family entered is lost.
import SignaturePad from '../register/SignaturePad.jsx';
import { FieldError, TickBox, TopError } from './parts.jsx';
import { priceFor } from './form.js';
import { campDaysShort, campHours, capitalize, childDaysLabel, formatDollars, shortDate } from './format.js';
import { formatPhone, phoneDigits } from '../lib/camps/campRules.js';
import { normalizeName } from '../lib/testing/names.js';
import * as T from './text.js';

export default function StepCheck({
  camp,
  kind,
  form,
  familyTotalCents,
  ack,
  setAck,
  errors, // { ack, signature } words to show (or null)
  banner, // null | { code: 'failed' | 'verify' | 'rate' | 'closed' | 'price', newCents?, oldCents? }
  sending,
  hasTried, // a send failed before → the button says "Try again"
  onSignatureChange,
  onSend,
  onBack,
  refs, // { ack, signature, turnstile, banner }
  headingRef,
}) {
  const closed = banner?.code === 'closed'; // only the summary stays; nothing more can be sent
  const firstName = normalizeName(form.children[0]?.first);
  const method = T.METHOD[form.payingBy] ?? '';
  // The phone number never breaks across two lines.
  const person = (p) => (
    <>
      {T.personLine(normalizeName(p.name), normalizeName(p.relation))}
      <span className="camp-nowrap">{formatPhone(phoneDigits(p.phone))}</span>
    </>
  );

  return (
    <div className="reg-step">
      <h2 className="reg-stepline" ref={headingRef} tabIndex={-1}>
        {T.STEP_2}
      </h2>
      {banner ? <TopError innerRef={refs.banner}>{bannerText(banner)}</TopError> : <p className="reg-intro">{T.CHECK_INTRO}</p>}

      {/* The summary */}
      <dl className="reg-card reg-review">
        <Row label={T.ROW_CAMP}>
          {camp.name} · {campDaysShort(camp.days)} · {campHours(camp.startTime, camp.endTime)}
        </Row>
        <Row label={T.ROW_PARENT}>{person(form.parent)}</Row>
        <Row label={T.ROW_EMERGENCY}>{person(form.emergency)}</Row>
        <Row label={T.ROW_PAYING}>{T.payingLine(capitalize(method))}</Row>
      </dl>

      {/* One card per child with its price; the family total closes the last card (C7b) */}
      {form.children.map((child, index) => {
        const priced = priceFor(child, camp, kind);
        const days = camp.days.filter((d) => child.dayIds.includes(d.dayId)).map((d) => d.day);
        const last = index === form.children.length - 1;
        const name = `${normalizeName(child.first)} ${normalizeName(child.last)}`;
        return (
          <section key={child.key} className="reg-card camp-sum" aria-label={name}>
            <h3 className="reg-card__title">{T.childHeading(name, child.age.trim(), child.member)}</h3>
            <div className="camp-line">
              <span>
                {T.dayCount(priced.dayCount)} · {childDaysLabel(days)}
                <small>{kind === 'early' ? T.earlyPriceNote(shortDate(camp.earlyUntil)) : T.REGULAR_PRICE_NOTE}</small>
              </span>
              <b>{formatDollars(priced.baseCents ?? 0)}</b>
            </div>
            {priced.extras.map((e) => (
              <div key={e.extraId} className="camp-line">
                <span>{e.per === 'day' ? T.extraTimes(e.name, e.count) : e.name}</span>
                <b>{formatDollars(e.cents)}</b>
              </div>
            ))}
            {last ? (
              <div className="reg-total">
                <span>
                  {T.FAMILY_TOTAL}
                  <small>{T.PAY_BEFORE_CAMP}</small>
                </span>
                <b>{formatDollars(familyTotalCents)}</b>
              </div>
            ) : null}
          </section>
        );
      })}

      {closed ? null : (
        <>
          <section className="reg-card" aria-labelledby="camp-waiver-title">
            <h3 className="reg-card__title" id="camp-waiver-title">{T.WAIVER}</h3>
            {/* The camp's own waiver text, in a box that scrolls (C7b). tabIndex lets keyboard
                users scroll it too. */}
            <div className="camp-waiver" tabIndex={0} role="region" aria-labelledby="camp-waiver-title">
              {camp.waiverText}
            </div>
            <TickBox
              id="camp-ack"
              inputRef={refs.ack}
              checked={ack}
              onChange={setAck}
              invalid={Boolean(errors.ack)}
              describedBy={errors.ack ? 'camp-ack-err' : undefined}
            >
              {T.ackText(firstName)}
            </TickBox>
            <div className="reg-indent">
              <FieldError id="camp-ack-err">{errors.ack}</FieldError>
            </div>

            <div className="reg-field reg-field--sign">
              <div className="reg-label" id="camp-sign-label">{T.SIGNATURE}</div>
              <SignaturePad
                ref={refs.signature}
                invalid={Boolean(errors.signature)}
                onChange={onSignatureChange}
                describedBy={errors.signature ? 'camp-sign-err camp-sign-hint' : 'camp-sign-hint'}
              />
              <FieldError id="camp-sign-err">{errors.signature}</FieldError>
              <div className="reg-hint" id="camp-sign-hint">
                {T.SIGNATURE_HINT}
              </div>
            </div>
          </section>

          {/* Turnstile puts its "Verify you are human" box here, only when Cloudflare asks.
              React never puts anything inside this box. */}
          <div className="reg-turnstile" ref={refs.turnstile} />

          <button
            type="button"
            className="reg-btn reg-btn--primary reg-btn--main"
            onClick={onSend}
            disabled={sending}
            aria-busy={sending || undefined}
          >
            {sending ? T.SENDING : hasTried ? T.TRY_AGAIN : T.SIGN_UP}
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

// The words for a banner.
function bannerText(banner) {
  switch (banner.code) {
    case 'price':
      return T.priceChanged(formatDollars(banner.newCents), formatDollars(banner.oldCents));
    case 'verify':
      return T.VERIFY_FAILED;
    case 'rate':
      return T.RATE_LIMITED;
    case 'closed':
      return T.CLOSED_WHILE_FILLING;
    default:
      return T.SEND_FAILED;
  }
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
