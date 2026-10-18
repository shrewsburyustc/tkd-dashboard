// StepDetails.jsx — step 1 of the family form: the student's names, class, current belt,
// the 3-stripes tick, Testing for + class time, the fee, and Paying by (mockups F1–F3).
// Why it exists: rulebook v0.131/v0.132 — one student per form; the class is chosen with tap
// buttons, then the current belt with belt-picture buttons (Q2); a required 3-stripes tick (Q4).
// Errors show when a name field is left and again for everything at Continue (rule from
// Star v0.107, a recorded exception to rule 8).
import BeltPicture from './BeltPicture.jsx';
import { FeeBox, FieldError, TickBox } from './parts.jsx';
import { beltFrom } from './format.js';
import { classTimeLabel, FORM_PAYING_BY } from '../lib/testing/eventRules.js';
import * as T from './text.js';

export default function StepDetails({
  event,
  classes,
  form,
  update,
  errors,
  visible, // which errors to show now: { first, last, class, belt, stripes, paying }
  onLeaveName,
  onContinue,
  onTestingDay,
  refs,
  headingRef,
  honeypot,
  setHoneypot,
}) {
  const cls = form.classIndex === null ? null : classes[form.classIndex];
  const rank = cls?.ranks.find((r) => r.event_rank_id === form.rankId) ?? null;
  const show = (field) => (visible[field] ? errors[field] : null);

  const chooseClass = (index) => {
    // Picking another class clears the belt (each class has its own belts).
    if (index !== form.classIndex) update({ classIndex: index, rankId: null });
  };

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
          <label className="reg-label" htmlFor="reg-first">{T.FIRST_NAME}</label>
          <input
            ref={refs.first}
            id="reg-first"
            className={`reg-input${show('first') ? ' is-invalid' : ''}`}
            type="text"
            autoComplete="off"
            autoCapitalize="words"
            spellCheck={false}
            maxLength={100}
            value={form.first}
            onChange={(e) => update({ first: e.target.value })}
            onBlur={() => onLeaveName('first')}
            aria-invalid={show('first') ? true : undefined}
            aria-describedby={show('first') ? 'reg-first-err' : 'reg-name-hint'}
          />
          <FieldError id="reg-first-err">{show('first')}</FieldError>
        </div>
        <div className="reg-field">
          <label className="reg-label" htmlFor="reg-last">{T.LAST_NAME}</label>
          <input
            ref={refs.last}
            id="reg-last"
            className={`reg-input${show('last') ? ' is-invalid' : ''}`}
            type="text"
            autoComplete="off"
            autoCapitalize="words"
            spellCheck={false}
            maxLength={100}
            value={form.last}
            onChange={(e) => update({ last: e.target.value })}
            onBlur={() => onLeaveName('last')}
            aria-invalid={show('last') ? true : undefined}
            aria-describedby={show('last') ? 'reg-last-err' : 'reg-name-hint'}
          />
          <FieldError id="reg-last-err">{show('last')}</FieldError>
        </div>
        <div className="reg-hint reg-hint--names" id="reg-name-hint">
          {T.NAME_HINT}
        </div>

        {/* Honeypot: hidden from people (and screen readers); bots fill in every field.
            If anything is typed here the server refuses the registration. */}
        <div className="reg-hp" aria-hidden="true">
          <label htmlFor="reg-website">Website</label>
          <input id="reg-website" type="text" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
        </div>

        {/* Class buttons */}
        <div className="reg-field" role="group" aria-labelledby="reg-class-label">
          <div className="reg-label" id="reg-class-label">{T.CLASS}</div>
          <div className="reg-chips">
            {classes.map((c, index) => (
              <button
                key={c.class_name}
                ref={index === 0 ? refs.class : undefined}
                type="button"
                className={`reg-chip${form.classIndex === index ? ' is-on' : ''}`}
                aria-pressed={form.classIndex === index}
                onClick={() => chooseClass(index)}
              >
                {c.class_name}
              </button>
            ))}
          </div>
          {cls ? null : <div className="reg-hint">{T.CLASS_HINT}</div>}
          <FieldError>{show('class')}</FieldError>
        </div>

        {/* Belt buttons (after a class is chosen) */}
        {cls ? (
          <div className="reg-field" role="group" aria-labelledby="reg-belt-label">
            <div className="reg-label" id="reg-belt-label">{T.CURRENT_BELT}</div>
            <div className="reg-bchips">
              {cls.ranks.map((r, index) => (
                <button
                  key={r.event_rank_id}
                  ref={index === 0 ? refs.belt : undefined}
                  type="button"
                  className={`reg-bchip${form.rankId === r.event_rank_id ? ' is-on' : ''}`}
                  aria-pressed={form.rankId === r.event_rank_id}
                  onClick={() => update({ rankId: r.event_rank_id })}
                >
                  <BeltPicture belt={beltFrom(r)} />
                  {r.name}
                </button>
              ))}
            </div>
            <FieldError>{show('belt')}</FieldError>
          </div>
        ) : null}

        {/* 3-stripes tick (Q4) */}
        {cls ? (
          <div className="reg-field reg-field--tick">
            <TickBox
              id="reg-stripes"
              inputRef={refs.stripes}
              checked={form.stripes}
              onChange={(value) => update({ stripes: value })}
              invalid={Boolean(show('stripes'))}
              describedBy={show('stripes') ? 'reg-stripes-err' : undefined}
            >
              The student has <b>{T.STRIPES_BOLD}</b>. <span className="reg-muted">{T.STRIPES_NOTE}</span>
            </TickBox>
            <div className="reg-indent">
              <FieldError id="reg-stripes-err">{show('stripes')}</FieldError>
            </div>
          </div>
        ) : null}

        {/* Testing for + class time, then the fee (after a belt is chosen) */}
        {rank ? (
          <>
            <div className="reg-result">
              {T.TESTING_FOR} <TestingFor rank={rank} />
              <br />
              <span className="reg-result__time">
                {T.testsAt(cls.class_name)}
                <b>{classTimeLabel(cls.start_time, cls.end_time)}</b>
              </span>
            </div>
            <FeeBox
              earlyCents={rank.early_cents}
              dayCents={rank.day_cents}
              testingDate={event.testing_date}
              onTestingDay={onTestingDay}
            />
          </>
        ) : null}

        {/* Paying by: cash or check only on the form */}
        <fieldset className="reg-field reg-fieldset" aria-describedby={show('paying') ? 'reg-paying-err' : 'reg-paying-hint'}>
          <legend className="reg-label">{T.PAYING_BY}</legend>
          <div className="reg-radios">
            {FORM_PAYING_BY.map((method, index) => (
              <label key={method} className="reg-radio">
                <input
                  ref={index === 0 ? refs.paying : undefined}
                  type="radio"
                  name="reg-paying"
                  value={method}
                  checked={form.payingBy === method}
                  onChange={() => update({ payingBy: method })}
                />
                {T.METHOD[method]}
              </label>
            ))}
          </div>
          {/* F3: the error takes the hint's place */}
          {show('paying') ? (
            <FieldError id="reg-paying-err">{show('paying')}</FieldError>
          ) : (
            <div className="reg-hint" id="reg-paying-hint">{T.PAYING_HINT}</div>
          )}
        </fieldset>
      </div>
      <button type="submit" className="reg-btn reg-btn--primary reg-btn--main">
        {T.CONTINUE}
      </button>
    </form>
  );
}

// "[belt] Yellow → [belt] Orange" (bold), or "→ No new rank" for a top rank with no award.
export function TestingFor({ rank, testingFor = rank?.testing_for ?? null, boldTarget = true }) {
  const target = testingFor ? (
    <>
      <BeltPicture belt={beltFrom(testingFor)} />
      {boldTarget ? <b>{testingFor.name}</b> : testingFor.name}
    </>
  ) : (
    T.NO_NEW_RANK
  );
  return (
    <span className="reg-testing-for">
      <BeltPicture belt={beltFrom(rank)} />
      {rank.name} → {target}
    </span>
  );
}
