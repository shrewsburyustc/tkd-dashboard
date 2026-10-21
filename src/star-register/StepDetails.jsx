// StepDetails.jsx — step 1 of the Star family form: names, date of birth, Dan and stars, the fees and
// the rubric, the email for results and Paying by (Form screens 1–5, gap mockups F3 and F6).
// Why it exists: rulebook v0.98 (fields in this order, all required; no School field — the link sets
// it), v0.100 (Current Dan, then the stars the candidate has now — only the numbers below the Dan's
// limit), v0.510 Q2 (the top-star note under the stars buttons), v0.101 (both prices, then "What
// 1st Dan is graded on" behind a link), v0.107 (errors show when a text field is left and again for
// everything at Continue — a recorded exception to rule 8).
// Everything about the Dans, stars, prices and the rubric comes from the event's own copy (v0.61),
// sent by the server; nothing is typed in here.
import { useState } from 'react';
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import { FieldError } from '../register/parts.jsx';
import { formatDollars } from '../register/format.js';
import { FORM_PAYING_BY } from '../lib/testing/eventRules.js';
import DobField from './DobField.jsx';
import { danLabelOf, scoreText } from './parts.jsx';
import * as T from './text.js';

export default function StepDetails({
  dans,
  form,
  update,
  errors,
  visible, // which errors to show now: { first, last, dob, dan, stars, email, paying }
  onLeave,
  onContinue,
  onTestingDay,
  today,
  refs,
  headingRef,
  honeypot,
  setHoneypot,
  another, // true after "Register another candidate"; no step-line note (Jeffrey, v0.511)
}) {
  const [rubricOpen, setRubricOpen] = useState(false);
  const dan = dans.find((d) => d.dan === form.dan) ?? null;
  const show = (field) => (visible[field] ? errors[field] : null);

  const chooseDan = (value) => {
    if (value === form.dan) return;
    const next = dans.find((d) => d.dan === value);
    // A star number the new Dan doesn't have is cleared (2nd Dan stops at 2, 3rd Dan at 4 …).
    const keepStars = form.stars !== null && next && form.stars < next.star_limit;
    update({ dan: value, stars: keepStars ? form.stars : null });
    setRubricOpen(false);
  };

  // The next Dan's name for the top-star note: from the event when it has it, else worked out.
  const nextLabel = dan ? (dans.find((d) => d.dan === dan.dan + 1)?.label ?? danLabelOf(dan.dan + 1)) : '';
  const isAssistant = (name) => /assistant\s+instructor/i.test(name ?? '');

  return (
    <form
      className="reg-step"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onContinue();
      }}
    >
      <h2 className="reg-stepline" ref={headingRef} tabIndex={-1}>
        {T.STEP_1}
      </h2>
      <div className="reg-card">
        {/* Names */}
        <div className="reg-field">
          <label className="reg-label" htmlFor="sreg-first">{T.FIRST_NAME}</label>
          <input
            ref={refs.first}
            id="sreg-first"
            className={`reg-input${show('first') ? ' is-invalid' : ''}`}
            type="text"
            autoComplete="off"
            autoCapitalize="words"
            spellCheck={false}
            maxLength={100}
            value={form.first}
            onChange={(e) => update({ first: e.target.value })}
            onBlur={() => onLeave('first')}
            aria-invalid={show('first') ? true : undefined}
            aria-describedby={show('first') ? 'sreg-first-err' : 'sreg-name-hint'}
          />
          <FieldError id="sreg-first-err">{show('first')}</FieldError>
        </div>
        <div className="reg-field">
          <label className="reg-label" htmlFor="sreg-last">{T.LAST_NAME}</label>
          <input
            ref={refs.last}
            id="sreg-last"
            className={`reg-input${show('last') ? ' is-invalid' : ''}`}
            type="text"
            autoComplete="off"
            autoCapitalize="words"
            spellCheck={false}
            maxLength={100}
            value={form.last}
            onChange={(e) => update({ last: e.target.value })}
            onBlur={() => onLeave('last')}
            aria-invalid={show('last') ? true : undefined}
            aria-describedby={show('last') ? 'sreg-last-err' : 'sreg-name-hint'}
          />
          <FieldError id="sreg-last-err">{show('last')}</FieldError>
        </div>
        {/* Screen 5: the errors take the hint's place */}
        {show('first') || show('last') ? null : (
          <div className="reg-hint reg-hint--names" id="sreg-name-hint">
            {T.NAME_HINT}
          </div>
        )}

        {/* Honeypot: hidden from people (and screen readers); bots fill in every field.
            If anything is typed here the server refuses the registration. */}
        <div className="reg-hp" aria-hidden="true">
          <label htmlFor="sreg-website">Website</label>
          <input id="sreg-website" type="text" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
        </div>

        {/* Date of birth: the dashboard calendar (DobField) */}
        <div className="reg-field" ref={refs.dob}>
          <div className="reg-label" id="sreg-dob-label">{T.DOB}</div>
          <DobField
            value={form.dob}
            onChange={(dob) => update({ dob })}
            today={today}
            invalid={Boolean(show('dob'))}
            describedBy={show('dob') ? 'sreg-dob-err' : 'sreg-dob-hint'}
          />
          {show('dob') ? (
            <FieldError id="sreg-dob-err">{show('dob')}</FieldError>
          ) : (
            <div className="reg-hint" id="sreg-dob-hint">{T.DOB_HINT}</div>
          )}
        </div>

        {/* Current Dan */}
        <div className="reg-field" role="group" aria-labelledby="sreg-dan-label">
          <div className="reg-label" id="sreg-dan-label">{T.CURRENT_DAN}</div>
          <div className="reg-chips">
            {dans.map((d, index) => (
              <button
                key={d.dan}
                ref={index === 0 ? refs.dan : undefined}
                type="button"
                className={`reg-chip${form.dan === d.dan ? ' is-on' : ''}`}
                aria-pressed={form.dan === d.dan}
                onClick={() => chooseDan(d.dan)}
              >
                {d.label}
              </button>
            ))}
          </div>
          <FieldError>{show('dan')}</FieldError>
        </div>

        {/* Stars the candidate has now (after a Dan is chosen): 0 … limit − 1 */}
        {dan ? (
          <div className="reg-field" role="group" aria-labelledby="sreg-stars-label" aria-describedby="sreg-stars-note">
            <div className="reg-label" id="sreg-stars-label">{T.STARS_NOW}</div>
            <div className="reg-chips sreg-stars">
              {Array.from({ length: dan.star_limit }, (_, n) => (
                <button
                  key={n}
                  ref={n === 0 ? refs.stars : undefined}
                  type="button"
                  className={`reg-chip${form.stars === n ? ' is-on' : ''}`}
                  aria-pressed={form.stars === n}
                  aria-label={T.starsWord(n)}
                  onClick={() => update({ stars: n })}
                >
                  {n}
                </button>
              ))}
            </div>
            {show('stars') ? (
              <FieldError>{show('stars')}</FieldError>
            ) : (
              <div className="reg-hint" id="sreg-stars-note">{T.topStarNote(dan.label, dan.star_limit, nextLabel)}</div>
            )}
          </div>
        ) : null}

        {/* Testing for, both prices and the rubric (after the stars are chosen) */}
        {dan && form.stars !== null ? (
          <>
            <div className="reg-result">
              {T.TESTING_FOR} <b>{T.progression(dan.label, form.stars)}</b>
            </div>
            <div className="sreg-feebox">
              <FeeLines dan={dan} onTestingDay={onTestingDay} />
              <div className="sreg-rubric-toggle">
                <button
                  type="button"
                  className="reg-link sreg-rubric-link"
                  aria-expanded={rubricOpen}
                  aria-controls="sreg-rubric"
                  onClick={() => setRubricOpen((o) => !o)}
                >
                  {/* ti-chevron-down / ti-chevron-up = closed / open */}
                  {rubricOpen ? <IconChevronUp size={16} aria-hidden="true" /> : <IconChevronDown size={16} aria-hidden="true" />}
                  {T.rubricLink(dan.label)}
                </button>
              </div>
              {rubricOpen ? (
                <div className="sreg-rubric" id="sreg-rubric">
                  <ul className="sreg-rubric__list">
                    {dan.categories.map((k) => (
                      <li key={k.name} className="sreg-rubric__row">
                        <span>{k.name}</span>
                        <span>{T.credits(k.credits)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="sreg-rubric__pass">
                    {T.passLine(scoreText(dan.pass_mark), scoreText(dan.max_score))}
                    {dan.categories.some((k) => isAssistant(k.name)) ? T.AI_NOTE : ''}
                  </div>
                </div>
              ) : null}
            </div>
          </>
        ) : null}

        {/* Email for results */}
        <div className="reg-field">
          <label className="reg-label" htmlFor="sreg-email">{T.EMAIL}</label>
          <input
            ref={refs.email}
            id="sreg-email"
            className={`reg-input${show('email') ? ' is-invalid' : ''}`}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={254}
            value={form.email}
            onChange={(e) => update({ email: e.target.value })}
            onBlur={() => onLeave('email')}
            aria-invalid={show('email') ? true : undefined}
            aria-describedby={show('email') ? 'sreg-email-err' : 'sreg-email-hint'}
          />
          {show('email') ? (
            <FieldError id="sreg-email-err">{show('email')}</FieldError>
          ) : (
            <div className="reg-hint" id="sreg-email-hint">{T.EMAIL_HINT}</div>
          )}
        </div>

        {/* Paying by: cash or check only on the form */}
        <fieldset className="reg-field reg-fieldset" aria-describedby={show('paying') ? 'sreg-paying-err' : 'sreg-paying-hint'}>
          <legend className="reg-label">{T.PAYING_BY}</legend>
          <div className="reg-radios">
            {FORM_PAYING_BY.map((method, index) => (
              <label key={method} className="reg-radio">
                <input
                  ref={index === 0 ? refs.paying : undefined}
                  type="radio"
                  name="sreg-paying"
                  value={method}
                  checked={form.payingBy === method}
                  onChange={() => update({ payingBy: method })}
                />
                {T.METHOD[method]}
              </label>
            ))}
          </div>
          {show('paying') ? (
            <FieldError id="sreg-paying-err">{show('paying')}</FieldError>
          ) : (
            <div className="reg-hint" id="sreg-paying-hint">{T.PAYING_HINT}</div>
          )}
        </fieldset>
      </div>
      <button type="submit" className="reg-btn reg-btn--primary reg-btn--main">
        {T.CONTINUE}
      </button>
    </form>
  );
}

// "Fee: $140 if paid before the testing day / $150 if paid on the testing day" (v0.101).
// On the testing day only the testing-day price applies; one price for both days shows once.
function FeeLines({ dan, onTestingDay }) {
  if (onTestingDay) {
    return (
      <div>
        {T.FEE}
        <b>{formatDollars(dan.same_day_cents)}</b>
        {T.TESTING_DAY_PRICE}
      </div>
    );
  }
  if (dan.same_day_cents === dan.standard_cents) {
    return (
      <div>
        {T.FEE}
        <b>{formatDollars(dan.standard_cents)}</b>
      </div>
    );
  }
  return (
    <div>
      {T.FEE}
      <b>{formatDollars(dan.standard_cents)}</b>
      {T.IF_BEFORE}
      <br />
      <b>{formatDollars(dan.same_day_cents)}</b>
      {T.IF_ON_DAY}
    </div>
  );
}
