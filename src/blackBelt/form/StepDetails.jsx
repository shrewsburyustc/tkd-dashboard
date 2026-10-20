// StepDetails.jsx — step 1 of the Black Belt family form: the candidate's details (mockups
// Form 1, 2, 4, 9; rulebook v0.211, v0.217; contract 0016-B1 §4.2).
// Why it exists: the fields in the approved order — First name, Last name (spelled as on the
// belt), Date of birth, Testing for (1st–4th Dan), Kukkiwon Dan certificate (optional), How
// you'll pay (one card per plan), the Total box with the payment schedule, Email for results.
// Amounts and the Kukkiwon fee appear once a Dan is chosen. Continue is always active; problems
// show under each field when it is tapped (FormApp checks and moves focus to the first one).
import CycleBox from './CycleBox.jsx';
import DateField from './DateField.jsx';
import { FieldError, Icon } from './parts.jsx';
import { dueLabel, formatDollars, kukkiwonFee, kukkiwonRange, planSecondLine, planTotal, scheduleFor } from './format.js';
import * as T from './text.js';

export const DANS = [1, 2, 3, 4];

export default function StepDetails({
  cycle,
  form,
  update,
  errors, // { first, last, dob, dan, plan, email } texts (or null)
  showErrors, // true once Continue has been tapped
  today,
  refs, // { first, last, dob, dan, plan, email }
  headingRef,
  honeypot,
  setHoneypot,
  onContinue,
  onOpenRequirements,
}) {
  const err = (field) => (showErrors ? errors[field] : null);
  const describe = (field, hintId) => [err(field) ? `bbf-${field}-err` : null, hintId].filter(Boolean).join(' ') || undefined;

  const plans = [...(cycle.plans ?? [])].sort((a, b) => a.position - b.position);
  const plan = plans.find((p) => p.id === form.planId) ?? null;
  const fee = form.dan ? kukkiwonFee(cycle.kukkiwon, form.dan) : null;
  const range = kukkiwonRange(cycle.kukkiwon);

  return (
    <>
      <CycleBox cycle={cycle} showApplyBy />
      <div className="bbf-step">
        <h2 className="bbf-stepline" ref={headingRef} tabIndex={-1}>
          {T.STEP_1}
        </h2>
        <div className="bbf-card">
          {/* Names */}
          <div className="bbf-field">
            <label className="bbf-label" htmlFor="bbf-first">
              {T.FIRST_NAME}
            </label>
            <input
              ref={refs.first}
              id="bbf-first"
              className={`bbf-input${err('first') ? ' is-invalid' : ''}`}
              value={form.first}
              onChange={(e) => update({ first: e.target.value })}
              autoComplete="off"
              aria-invalid={Boolean(err('first')) || undefined}
              aria-describedby={describe('first')}
            />
            <FieldError id="bbf-first-err">{err('first')}</FieldError>
          </div>
          <div className="bbf-field">
            <label className="bbf-label" htmlFor="bbf-last">
              {T.LAST_NAME}
            </label>
            <input
              ref={refs.last}
              id="bbf-last"
              className={`bbf-input${err('last') ? ' is-invalid' : ''}`}
              value={form.last}
              onChange={(e) => update({ last: e.target.value })}
              autoComplete="off"
              aria-invalid={Boolean(err('last')) || undefined}
              aria-describedby={describe('last', 'bbf-last-hint')}
            />
            <FieldError id="bbf-last-err">{err('last')}</FieldError>
            <div className="bbf-hint" id="bbf-last-hint">
              {T.LAST_NAME_HINT}
            </div>
          </div>

          {/* Date of birth */}
          <div className="bbf-field">
            <label className="bbf-label" htmlFor="bbf-dob">
              {T.DOB}
            </label>
            <DateField
              ref={refs.dob}
              id="bbf-dob"
              value={form.dob}
              onChange={(dob) => update({ dob })}
              min="1900-01-01"
              max={today}
              invalid={Boolean(err('dob'))}
              describedBy={describe('dob', 'bbf-dob-hint')}
            />
            <FieldError id="bbf-dob-err">{err('dob')}</FieldError>
            <div className="bbf-hint" id="bbf-dob-hint">
              {T.DOB_HINT}
            </div>
          </div>

          {/* Testing for: 1st–4th Dan */}
          <fieldset className="bbf-field bbf-fieldset" aria-describedby={err('dan') ? 'bbf-dan-err' : undefined}>
            <legend className="bbf-label">{T.TESTING_FOR}</legend>
            <div className="bbf-chips">
              {DANS.map((dan, i) => (
                <button
                  key={dan}
                  ref={i === 0 ? refs.dan : undefined}
                  type="button"
                  className={`bbf-chip${form.dan === dan ? ' is-on' : ''}`}
                  aria-pressed={form.dan === dan}
                  onClick={() => update({ dan })}
                >
                  {T.DAN[dan]}
                </button>
              ))}
            </div>
            <FieldError id="bbf-dan-err">{err('dan')}</FieldError>
          </fieldset>

          {/* Kukkiwon certificate: starts on "No, thanks", so it needs no error */}
          <fieldset className="bbf-field bbf-fieldset" aria-describedby="bbf-kuk-hint">
            <legend className="bbf-label">{T.KUKKIWON}</legend>
            <div className="bbf-radios">
              <label className="bbf-radio">
                <input type="radio" name="bbf-kukkiwon" checked={!form.kukkiwon} onChange={() => update({ kukkiwon: false })} />
                {T.KUKKIWON_NO}
              </label>
              <label className="bbf-radio">
                <input type="radio" name="bbf-kukkiwon" checked={form.kukkiwon} onChange={() => update({ kukkiwon: true })} />
                {fee !== null ? T.kukkiwonYesWithFee(formatDollars(fee)) : T.KUKKIWON_YES}
              </label>
            </div>
            <div className="bbf-hint" id="bbf-kuk-hint">
              {!form.dan && range ? T.kukkiwonRangeHint(formatDollars(range[0]), formatDollars(range[1])) : null}
              {form.dan && form.kukkiwon ? T.KUKKIWON_ADDED : null}
            </div>
          </fieldset>

          {/* How you'll pay: one card per plan, in the order set on the cycle */}
          <fieldset className="bbf-field bbf-fieldset" aria-describedby={err('plan') ? 'bbf-plan-err' : undefined}>
            <legend className="bbf-label">{T.HOW_PAY}</legend>
            <div className="bbf-plans">
              {plans.map((p, i) => (
                <label key={p.id} className={`bbf-plan${form.planId === p.id ? ' is-on' : ''}${err('plan') ? ' is-invalid' : ''}`}>
                  <input
                    ref={i === 0 ? refs.plan : undefined}
                    type="radio"
                    name="bbf-plan"
                    checked={form.planId === p.id}
                    onChange={() => update({ planId: p.id })}
                    aria-invalid={Boolean(err('plan')) || undefined}
                  />
                  <span className="bbf-plan__text">
                    <span className="bbf-plan__top">
                      <span className="bbf-plan__name">{p.name}</span>
                      {form.dan ? <span className="bbf-plan__total">{formatDollars(planTotal(p, form.dan))}</span> : null}
                    </span>
                    <span className="bbf-plan__line">{planSecondLine(p, form.dan, today)}</span>
                  </span>
                </label>
              ))}
            </div>
            <FieldError id="bbf-plan-err">{err('plan')}</FieldError>
            {!form.dan ? <div className="bbf-hint">{T.AMOUNTS_LATER}</div> : null}
          </fieldset>

          {form.dan && plan ? (
            <TotalBox
              schedule={scheduleFor({ plan, dan: form.dan, kukkiwon: form.kukkiwon, fees: cycle.kukkiwon, today })}
              dan={form.dan}
              today={today}
              onOpenRequirements={onOpenRequirements}
            />
          ) : null}

          {/* Email for results */}
          <div className="bbf-field">
            <label className="bbf-label" htmlFor="bbf-email">
              {T.EMAIL}
            </label>
            <input
              ref={refs.email}
              id="bbf-email"
              type="email"
              inputMode="email"
              className={`bbf-input${err('email') ? ' is-invalid' : ''}`}
              value={form.email}
              onChange={(e) => update({ email: e.target.value })}
              autoComplete="email"
              spellCheck={false}
              autoCapitalize="none"
              aria-invalid={Boolean(err('email')) || undefined}
              aria-describedby={describe('email', 'bbf-email-hint')}
            />
            <FieldError id="bbf-email-err">{err('email')}</FieldError>
            <div className="bbf-hint" id="bbf-email-hint">
              {T.EMAIL_HINT}
            </div>
          </div>

          {/* The honeypot: a field people never see or fill in. Bots that fill every field
              give themselves away; the server refuses a registration with anything in it. */}
          <div className="bbf-hp" aria-hidden="true">
            <label htmlFor="bbf-website">Website</label>
            <input id="bbf-website" name="website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
          </div>
        </div>

        <button type="button" className="bbf-btn bbf-btn--primary bbf-btn--main" onClick={onContinue}>
          {T.CONTINUE}
        </button>
      </div>
    </>
  );
}

// The Total box (Form 2): "Total: $970 (testing $870 + Kukkiwon $100)", the chosen plan's
// schedule with Kukkiwon in payment 1, "Pay at the front desk." and the requirements link.
// `schedule` comes from rules.scheduleFor: one line per due date (a passed date reads "Today").
function TotalBox({ schedule, dan, today, onOpenRequirements }) {
  if (!schedule) return null;
  const [label, total] = T.totalLine(formatDollars(schedule.totalCents));
  return (
    <div className="bbf-totalbox">
      <div className="bbf-totalbox__total">
        {label}
        <b>{total}</b>
        {schedule.kukkiwonCents ? T.totalSplit(formatDollars(schedule.testingCents), formatDollars(schedule.kukkiwonCents)) : null}
      </div>
      <ul className="bbf-totalbox__lines">
        {schedule.lines.map((line) => (
          <li key={line.dueOn}>
            <span>
              {dueLabel(line.dueOn, today)}
              {line.items.length > 1 ? <small>{T.itemsLabel(line.items)}</small> : null}
            </span>
            <b>{formatDollars(line.amountCents)}</b>
          </li>
        ))}
      </ul>
      <p className="bbf-totalbox__desk">{T.PAY_AT_DESK}</p>
      <RequirementsLink dan={dan} onOpen={onOpenRequirements} />
    </div>
  );
}

// Re-used by Registered: the same "What 1st Dan is tested on ›" row.
export function RequirementsLink({ dan, onOpen }) {
  return (
    <button type="button" className="bbf-linkrow" onClick={onOpen}>
      <span>{T.whatDanTested(T.DAN[dan])}</span>
      <Icon name="chevronRight" />
    </button>
  );
}
