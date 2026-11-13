// BreakingForm.jsx — the sign-up form itself (pictures A-family-form, A-family-form-errors, A-family-extras).
// Why it exists: a parent opens the school's Board breaking link or QR code and registers ONE student:
// first and last name, age, rank (one long list in three groups), class time, boards (filled in from the
// chart and changeable with − and +), how they will pay, and the amount. This file only DRAWS the form and
// reports changes; BreakingApp.jsx holds the values, checks them on Register and sends them.
//
// Errors work like the Camps form: nothing is grey or blocked, Register stays tappable, and when it is
// tapped amber messages say what is missing (a field's message also shows when you leave the field).
// Colors: amber for problems, never red (rulebook §7). Tap targets are 44 px on touch screens
// (breaking-public.css). Every box has a visible label tied to it; messages are tied with aria-describedby.
import { useState } from 'react';
import { EventCard, FieldError, Icon, TopError } from './parts.jsx';
import RankPicker from './RankPicker.jsx';
import Belt from '../components/Belt.jsx';
import { ageNumber, beltOf, chartView, classLabel, fieldId, listedCents, MAX_BOARDS, priceView, rankPickerGroups, recommendationFor } from './form.js';
import { formatMoneyWithCents } from '../lib/money.js';
import * as T from './text.js';

export default function BreakingForm({ event, form, change, errors, showAll, banner, bannerRef, onRegister, sending, hasTried, honeypot, setHoneypot, turnstileRef, headingRef }) {
  const [touched, setTouched] = useState({}); // fields the person has left (their message may show)
  const show = (key) => (showAll || touched[key] ? errors[key] ?? null : null);
  const leave = (key) => () => setTouched((t) => (t[key] ? t : { ...t, [key]: true }));
  const age = ageNumber(form.age);
  const price = priceView(form, event);
  const rec = recommendationFor(event, age, form.rank);
  const groups = rankPickerGroups(event, age);

  return (
    <>
      <EventCard event={event} banner />
      <form
        className="reg-step"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          onRegister();
        }}
      >
        <h2 className="brk-sr" ref={headingRef} tabIndex={-1}>
          {T.PAGE_KIND}
        </h2>
        {banner ? <TopError innerRef={bannerRef}>{banner}</TopError> : null}

        {/* Honeypot: hidden from people (and screen readers); bots fill in every field. If anything is
            typed here the Function refuses the registration. */}
        <div className="reg-hp" aria-hidden="true">
          <label htmlFor="brk-website">Website</label>
          <input id="brk-website" type="text" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
        </div>

        <section className="reg-card" aria-labelledby="brk-student-title">
          <h2 className="reg-card__title" id="brk-student-title">{T.STUDENT}</h2>
          <div className="camp-two">
            <TextBox id={fieldId('first')} label={T.FIRST_NAME} value={form.first} error={show('first')} onChange={(v) => change({ first: v })} onBlur={leave('first')} autoComplete="given-name" maxLength={80} />
            <TextBox id={fieldId('last')} label={T.LAST_NAME} value={form.last} error={show('last')} onChange={(v) => change({ last: v })} onBlur={leave('last')} autoComplete="family-name" maxLength={80} />
          </div>
          <TextBox
            id={fieldId('age')}
            label={T.AGE}
            className="camp-age"
            value={form.age}
            error={show('age')}
            hint={T.AGE_HINT}
            onChange={(v) => change({ age: v })}
            onBlur={leave('age')}
            inputMode="numeric"
            maxLength={3}
            autoCapitalize="off"
          />

          {/* Rank: ONE list in three groups (Little Tiger belts, Color Belts, Black Belt), a belt picture beside every
              rank. A custom picker, not a <select>: the phone's own picker was unusable on an iPhone (RankPicker.jsx). */}
          <div className="reg-field">
            <label className="reg-label" id="brk-rank-label" onClick={() => document.getElementById(fieldId('rank'))?.focus()}>{T.RANK}</label>
            <RankPicker
              id={fieldId('rank')}
              labelId="brk-rank-label"
              describedBy={show('rank') ? 'brk-rank-err' : undefined}
              value={form.rank}
              groups={groups}
              placeholder={T.CHOOSE_RANK}
              onChange={(rank) => change({ rank })}
              onBlur={leave('rank')}
              invalid={Boolean(show('rank'))}
            />
            <FieldError id="brk-rank-err">{show('rank')}</FieldError>
          </div>

          <div className="reg-field">
            <label className="reg-label" htmlFor={fieldId('classId')}>{T.CLASS_TIME}</label>
            <select
              id={fieldId('classId')}
              className={`reg-input brk-select${form.classId ? '' : ' is-empty'}${show('classId') ? ' is-invalid' : ''}`}
              value={form.classId}
              onChange={(e) => change({ classId: e.target.value })}
              onBlur={leave('classId')}
              aria-invalid={show('classId') ? true : undefined}
              aria-describedby={show('classId') ? 'brk-class-err brk-class-hint' : 'brk-class-hint'}
            >
              <option value="" disabled>{T.CHOOSE_CLASS}</option>
              {event.classes.map((c) => (
                <option key={c.id} value={c.id}>{classLabel(c)}</option>
              ))}
            </select>
            <FieldError id="brk-class-err">{show('classId')}</FieldError>
            <div className="reg-hint" id="brk-class-hint">{T.CLASS_HINT}</div>
          </div>
        </section>

        <section className="reg-card" aria-labelledby="brk-boards-title">
          <h2 className="reg-card__title" id="brk-boards-title">{T.BOARDS}</h2>
          <div className="reg-result brk-note">
            {rec ? (
              <>
                {T.RECOMMENDED_FOR}
                <b>{T.recommendedWho(age, form.rank)}</b>
                {T.recommendedWhat(rec.tech, rec.adult)}
              </>
            ) : (
              T.BOARDS_EMPTY_NOTE
            )}
          </div>
          <Stepper id={fieldId('boards')} kind={T.TECHNICAL} each={listedCents('tech', event)} value={form.tech} setValue={(n) => change({ tech: n })} describedBy={show('boards') ? 'brk-boards-err' : undefined} />
          <Stepper kind={T.ADULT} each={listedCents('adult', event)} value={form.adult} setValue={(n) => change({ adult: n })} describedBy={show('boards') ? 'brk-boards-err' : undefined} />
          {show('boards') ? <FieldError id="brk-boards-err">{show('boards')}</FieldError> : null}
          <ChartFold event={event} age={age} rank={form.rank} />
        </section>

        <section className="reg-card">
          <fieldset className="reg-field reg-fieldset camp-last" aria-describedby={show('paying') ? 'brk-paying-err' : form.payingBy === 'card' ? 'brk-paying-hint' : undefined}>
            <legend className="reg-card__title camp-legend">{T.PAYING_BY}</legend>
            <div className="reg-chips brk-pay">
              {['cash', 'check', 'card'].map((method, i) => (
                <button
                  key={method}
                  id={i === 0 ? fieldId('paying') : undefined}
                  type="button"
                  className={`reg-chip${form.payingBy === method ? ' is-on' : ''}`}
                  aria-pressed={form.payingBy === method}
                  onClick={() => change({ payingBy: method })}
                >
                  {T.METHOD[method]}
                </button>
              ))}
            </div>
            {show('paying') ? (
              <FieldError id="brk-paying-err">{show('paying')}</FieldError>
            ) : form.payingBy === 'card' ? (
              <div className="reg-hint brk-cardnote" id="brk-paying-hint">
                <Icon name="credit-card" />
                <span>{T.CARD_NOTE}</span>
              </div>
            ) : null}
          </fieldset>
        </section>

        <section className="reg-card" aria-labelledby="brk-amount-title">
          <h2 className="reg-card__title" id="brk-amount-title">{T.AMOUNT}</h2>
          <div className="brk-lines">
            {price.lines.length === 0 ? (
              <div className="camp-line">
                <span className="reg-muted">{T.NO_BOARDS_YET}</span>
                <b />
              </div>
            ) : (
              price.lines.map((l) => (
                <div className="camp-line" key={l.key}>
                  <span>
                    {l.text}
                    {l.small ? <small>{l.small}</small> : null}
                  </span>
                  <b>{formatMoneyWithCents(l.cents)}</b>
                </div>
              ))
            )}
          </div>
          <div className="brk-total">
            <span>{T.TOTAL}</span>
            <b>{formatMoneyWithCents(price.totalCents)}</b>
          </div>
          {price.saveHint ? <div className="reg-hint brk-save">{price.saveHint}</div> : null}
        </section>

        {/* Turnstile puts its "Verify you are human" box here, only when Cloudflare asks. React never puts
            anything inside this box. */}
        <div className="reg-turnstile" ref={turnstileRef} />
        <button type="submit" className="reg-btn reg-btn--primary reg-btn--main" disabled={sending} aria-busy={sending || undefined}>
          {sending ? T.SENDING : hasTried ? T.TRY_AGAIN : T.REGISTER}
        </button>
        <p className="reg-privacy">{T.PRIVACY}</p>
      </form>
    </>
  );
}

// A labelled text box with an amber message under it and an optional hint.
function TextBox({ id, label, value, error, hint, onChange, onBlur, className = '', ...rest }) {
  const describedBy = [error ? `${id}-err` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="reg-field">
      <label className="reg-label" htmlFor={id}>{label}</label>
      <input
        id={id}
        className={`reg-input ${className}${error ? ' is-invalid' : ''}`.trim()}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        autoCapitalize="words"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...rest}
        autoComplete={rest.autoComplete ?? 'off'}
      />
      <FieldError id={`${id}-err`}>{error}</FieldError>
      {hint ? <div className="reg-hint" id={`${id}-hint`}>{hint}</div> : null}
    </div>
  );
}

// One board kind: its name, price each and the − / + buttons around the count (0 to 12).
function Stepper({ id, kind, each, value, setValue, describedBy }) {
  return (
    <div className="brk-board">
      <div>
        <div className="brk-board__name">{kind}</div>
        <div className="reg-hint">{T.eachPrice(formatMoneyWithCents(each))}</div>
      </div>
      <div className="brk-step" role="group" aria-label={T.boardsGroup(kind)}>
        <button type="button" aria-label={T.fewerBoards(kind)} aria-describedby={describedBy} disabled={value <= 0} onClick={() => setValue(Math.max(0, value - 1))}>
          <Icon name="minus" />
        </button>
        <output>{value}</output>
        <button id={id} type="button" aria-label={T.moreBoards(kind)} aria-describedby={describedBy} disabled={value >= MAX_BOARDS} onClick={() => setValue(Math.min(MAX_BOARDS, value + 1))}>
          <Icon name="plus" />
        </button>
      </div>
    </div>
  );
}

// "View full requirement chart": the table of the student's group, their own rank highlighted.
function ChartFold({ event, age, rank }) {
  const view = chartView(event, age, rank);
  const heading = T.chartHeading(view.band, event.childMaxAge);
  const yours = rank !== '' || age !== null;
  return (
    <details className="brk-fold">
      <summary>
        <Icon name="chevron-down" className="brk-fold__chev" />
        {T.CHART_SUMMARY}
      </summary>
      <div className="brk-chart" role="table" aria-label={T.chartLabel(heading)}>
        <div className="brk-chart__head">
          {heading} {yours ? <span className="reg-hint">{T.YOUR_GROUP}</span> : null}
        </div>
        {view.rows.map((r) => (
          <div className={`brk-chart__row${r.rankName === rank ? ' is-you' : ''}`} role="row" key={r.rankName}>
            <span role="cell" className="brk-chart__rank">
              <Belt belt={beltOf(r.rankName)} />
              <span>
                {r.rankName}
                {r.technique ? <small>{r.technique}</small> : null}
              </span>
            </span>
            <span role="cell">{T.boardsText(r.techBoards, r.adultBoards)}</span>
          </div>
        ))}
        <div className="reg-hint brk-chart__foot">{view.foot.join(' ')}</div>
      </div>
    </details>
  );
}
