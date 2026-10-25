// ChildCard.jsx — one child's card on step 1 of the camp form (mockup C7a, "Child 1").
// Why it exists: a family signs up 1 to 3 children at once (rulebook v0.232); each child has
// their own card: first and last name, age (counted on the first day of camp, v0.703), member
// Yes / No, which days (chips with the dark outline, v0.713), extras (a per-day extra asks which
// days, starting with the child's days) and the child's running price.
// A camp longer than one week (Mon–Sun) shows its days week by week: "Week 1 · Oct 26 – 30" with
// a Whole week button, then that week's buttons "Mon 26" … (Jeffrey, 2026-10-21).
// The card only draws; CampApp keeps the values and the rules live in form.js / campRules.js.
import { FieldError, TickBox } from './parts.jsx';
import { extraPriceLabel, extrasFor, fieldId, isLimited, offeredDayIds, onlyOnLines, priceFor, tidyChild } from './form.js';
import { formatDollars, monthDay, shortDate, weekdayAndNumber, weekRange, weeksOf } from './format.js';
import { normalizeName } from '../lib/testing/names.js';
import * as T from './text.js';

export default function ChildCard({ child, index, camp, kind, update, onRemove, show, onLeave }) {
  const c = `c${index}`;
  const key = (field) => `${c}.${field}`;
  const err = (field) => show(key(field));
  const first = normalizeName(child.first);

  // `update` takes a function "current child → new child", so two quick taps never work from
  // an old copy. Changes to days and extras also go through tidyChild, so extras always fit the
  // chosen days.
  const set = (field) => (value) => update((cur) => ({ ...cur, [field]: value }));
  const change = (makeChanges) => update((cur) => tidyChild({ ...cur, ...makeChanges(cur) }, camp));

  const toggleDay = (dayId) =>
    change((cur) => ({ dayIds: cur.dayIds.includes(dayId) ? cur.dayIds.filter((id) => id !== dayId) : [...cur.dayIds, dayId] }));

  // "Whole week": picks every day of that week; if they are all picked already, clears them.
  const toggleWeek = (weekDayIds) =>
    change((cur) => {
      const all = weekDayIds.every((id) => cur.dayIds.includes(id));
      return { dayIds: all ? cur.dayIds.filter((id) => !weekDayIds.includes(id)) : [...cur.dayIds, ...weekDayIds.filter((id) => !cur.dayIds.includes(id))] };
    });

  const toggleExtra = (extra, ticked) =>
    change((cur) => {
      const others = cur.extras.filter((e) => e.extraId !== extra.extraId);
      // A per-day extra starts with all of the child's days it is offered on (C7a; for a limited
      // extra only its only_on days); a once extra has no days.
      return { extras: ticked ? [...others, { extraId: extra.extraId, dayIds: extra.per === 'day' ? offeredDayIds(extra, camp, cur.dayIds) : [] }] : others };
    });

  const toggleExtraDay = (extraId, dayId) =>
    change((cur) => ({
      extras: cur.extras.map((e) => {
        if (e.extraId !== extraId) return e;
        const on = e.dayIds.includes(dayId);
        return { ...e, dayIds: on ? e.dayIds.filter((id) => id !== dayId) : [...e.dayIds, dayId] };
      }),
    }));

  // Limited extras (e.g. pizza on Wed and Fri only, CP1 2026-10-19): their names label the day
  // buttons they are on, and a line under the buttons lists their days.
  const limited = (camp.extras ?? []).filter(isLimited);
  const labelsFor = (day) => limited.filter((extra) => extra.onlyOn.includes(day)).map((extra) => extra.name);
  const lines = onlyOnLines(camp);
  const extras = extrasFor(child, camp);
  const priced = child.member !== null && child.dayIds.length > 0 ? priceFor(child, camp, kind) : null;
  // The camp's weeks; more than one → the day buttons are grouped by week.
  const weeks = weeksOf(camp.days);
  const byWeek = weeks.length > 1;
  const firstDayId = camp.days[0]?.dayId;

  // One day button of "Which days?" (the same button with or without week groups; inside a week
  // group it reads "Mon 26" because the heading already gives the month).
  const dayChip = (d) => (
    <button
      key={d.dayId}
      id={d.dayId === firstDayId ? fieldId(key('days')) : undefined}
      type="button"
      className={`reg-chip${child.dayIds.includes(d.dayId) ? ' is-on' : ''}`}
      aria-pressed={child.dayIds.includes(d.dayId)}
      onClick={() => toggleDay(d.dayId)}
    >
      {byWeek ? weekdayAndNumber(d.day) : shortDate(d.day)}
      {labelsFor(d.day).map((name) => (
        <span key={name} className="camp-pill">
          {name}
        </span>
      ))}
    </button>
  );

  return (
    <section className="reg-card camp-child" aria-labelledby={`${fieldId(c)}-title`}>
      <div className="camp-child__head">
        <h3 className="reg-card__title" id={`${fieldId(c)}-title`}>
          {T.childTitle(index + 1)}
        </h3>
        {onRemove ? (
          <button type="button" className="reg-link" onClick={onRemove} aria-label={T.removeChildLabel(index + 1)}>
            {T.REMOVE_CHILD}
          </button>
        ) : null}
      </div>

      {/* First and last name, side by side (also on phones, as in the mockup) */}
      <div className="camp-two">
        <TextField id={fieldId(key('first'))} label={T.FIRST_NAME} value={child.first} error={err('first')} onChange={set('first')} onBlur={() => onLeave(key('first'))} />
        <TextField id={fieldId(key('last'))} label={T.LAST_NAME} value={child.last} error={err('last')} onChange={set('last')} onBlur={() => onLeave(key('last'))} />
      </div>

      {/* Age: the error (e.g. "This camp is for ages 5 to 12.") sits above the hint, as in C7a */}
      <div className="reg-field">
        <label className="reg-label" htmlFor={fieldId(key('age'))}>{T.AGE}</label>
        <input
          id={fieldId(key('age'))}
          className={`reg-input camp-age${err('age') ? ' is-invalid' : ''}`}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={3}
          value={child.age}
          onChange={(e) => set('age')(e.target.value)}
          onBlur={() => onLeave(key('age'))}
          aria-invalid={err('age') ? true : undefined}
          aria-describedby={`${fieldId(key('age'))}-err ${fieldId(key('age'))}-hint`}
        />
        <FieldError id={`${fieldId(key('age'))}-err`}>{err('age')}</FieldError>
        <div className="reg-hint" id={`${fieldId(key('age'))}-hint`}>{T.AGE_HINT}</div>
      </div>

      {/* Member yes / no */}
      <fieldset className="reg-field reg-fieldset camp-member" aria-describedby={err('member') ? `${fieldId(key('member'))}-err` : undefined}>
        <legend className="reg-label">{first ? T.isMember(first) : T.IS_MEMBER_NO_NAME}</legend>
        <div className="reg-radios">
          {[true, false].map((value, i) => (
            <label key={String(value)} className="reg-radio">
              <input
                id={i === 0 ? fieldId(key('member')) : undefined}
                type="radio"
                name={`${fieldId(key('member'))}-radio`}
                checked={child.member === value}
                onChange={() => set('member')(value)}
              />
              {value ? T.YES : T.NO}
            </label>
          ))}
        </div>
        <FieldError id={`${fieldId(key('member'))}-err`}>{err('member')}</FieldError>
      </fieldset>

      {/* Which days? */}
      <div className="reg-field" role="group" aria-labelledby={`${fieldId(key('days'))}-label`}>
        <div className="reg-label" id={`${fieldId(key('days'))}-label`}>{T.WHICH_DAYS}</div>
        {byWeek ? (
          weeks.map((week, w) => {
            const range = weekRange(week);
            const ids = week.days.map((d) => d.dayId);
            const all = ids.every((id) => child.dayIds.includes(id));
            const headingId = `${fieldId(key('days'))}-week${w + 1}`;
            return (
              <div key={week.monday} className="camp-week" role="group" aria-labelledby={headingId}>
                <div className="camp-week__head">
                  <span className="camp-week__title" id={headingId}>
                    {T.weekHeading(w + 1, range)}
                  </span>
                  <button type="button" className="reg-link camp-week__all" onClick={() => toggleWeek(ids)} aria-label={all ? T.clearWeekLabel(range) : T.wholeWeekLabel(range)}>
                    {all ? T.CLEAR_WEEK : T.WHOLE_WEEK}
                  </button>
                </div>
                <div className="reg-chips">{week.days.map(dayChip)}</div>
              </div>
            );
          })
        ) : (
          <div className="reg-chips">{camp.days.map(dayChip)}</div>
        )}
        {lines.map((line) => (
          <div key={line.extraId} className="reg-hint">
            {line.text}
          </div>
        ))}
        <FieldError>{err('days')}</FieldError>
      </div>

      {/* Extras */}
      {extras.length > 0 ? (
        <div className="reg-field" role="group" aria-labelledby={`${fieldId(c)}-extras-label`}>
          <div className="reg-label" id={`${fieldId(c)}-extras-label`}>{T.EXTRAS}</div>
          {extras.map((extra) => {
            const pick = child.extras.find((e) => e.extraId === extra.extraId);
            const extraKey = key(`extra.${extra.extraId}`);
            const price = formatDollars(extra.priceCents);
            return (
              <div key={extra.extraId} className="camp-extra">
                <TickBox id={fieldId(extraKey)} checked={Boolean(pick)} onChange={(ticked) => toggleExtra(extra, ticked)} invalid={Boolean(show(extraKey))}>
                  {extra.name}
                  <br />
                  <span className="reg-hint">
                    {extra.per === 'day' ? T.perDay(price) : T.onceCost(price)}
                    {pick && extra.per === 'day' ? ` · ${T.PER_DAY_WHICH}` : null}
                  </span>
                </TickBox>
                {pick && extra.per === 'day' ? (
                  <div className="reg-indent">
                    <ExtraDays
                      label={`${extra.name} · ${T.PER_DAY_WHICH}`}
                      weeks={weeks}
                      offered={offeredDayIds(extra, camp, child.dayIds)}
                      days={camp.days}
                      picked={pick.dayIds}
                      onToggle={(dayId) => toggleExtraDay(extra.extraId, dayId)}
                    />
                    <FieldError>{show(extraKey)}</FieldError>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {/* The child's running price (once member and days are chosen) */}
      {priced ? <PriceBox priced={priced} member={child.member} kind={kind} name={first || T.childTitle(index + 1)} label={(e) => extraPriceLabel(e, camp, child)} /> : null}
    </section>
  );
}

// The day buttons of a per-day extra (e.g. "Late pick-up · which days?"). Only the days it is
// offered on; in a camp longer than one week they are grouped under "Week 1 · Oct 26 – 30"
// headings (no Whole week button here: the child's days already decide which weeks).
function ExtraDays({ label, weeks, offered, days, picked, onToggle }) {
  const chip = (d, short) => (
    <button key={d.dayId} type="button" className={`reg-chip${picked.includes(d.dayId) ? ' is-on' : ''}`} aria-pressed={picked.includes(d.dayId)} onClick={() => onToggle(d.dayId)}>
      {short ? weekdayAndNumber(d.day) : shortDate(d.day)}
    </button>
  );
  if (weeks.length <= 1) {
    return (
      <div className="reg-chips" role="group" aria-label={label}>
        {days.filter((d) => offered.includes(d.dayId)).map((d) => chip(d, false))}
      </div>
    );
  }
  return (
    <div role="group" aria-label={label}>
      {weeks.map((week, w) => {
        const shown = week.days.filter((d) => offered.includes(d.dayId));
        if (shown.length === 0) return null;
        return (
          <div key={week.monday} className="camp-week camp-week--extra">
            <div className="camp-week__head">
              <span className="camp-week__title">{T.weekHeading(w + 1, weekRange(week))}</span>
            </div>
            <div className="reg-chips">{shown.map((d) => chip(d, true))}</div>
          </div>
        );
      })}
    </div>
  );
}

// A labelled one-line text field with its amber message.
export function TextField({ id, label, value, error, onChange, onBlur, type = 'text', inputMode, autoComplete = 'off', maxLength = 100, autoCapitalize = 'words' }) {
  return (
    <div className="reg-field">
      <label className="reg-label" htmlFor={id}>{label}</label>
      <input
        id={id}
        className={`reg-input${error ? ' is-invalid' : ''}`}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        autoCapitalize={autoCapitalize}
        spellCheck={false}
        maxLength={maxLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
      />
      <FieldError id={`${id}-err`}>{error}</FieldError>
    </div>
  );
}

// "2 days · non-member · early price $150 / Late pick-up × 2 $16 / Mia's total $166" (C7a).
// More than one week (weekly pricing, v0.717): "member · early price", then one line per week the
// child comes, "Week of Jul 6 · 5 days $275", then the extras and the child's total.
function PriceBox({ priced, member, kind, name, label }) {
  const weeks = priced.weeks ?? [];
  const words = `${member ? T.MEMBER_WORD : T.NON_MEMBER_WORD} · ${kind === 'early' ? T.EARLY_PRICE_WORD : T.REGULAR_PRICE_WORD}`;
  return (
    <div className="camp-price" aria-live="polite">
      {weeks.length > 1 ? (
        <>
          <div>{words.charAt(0).toUpperCase() + words.slice(1)}</div>
          {weeks.map((w) => (
            <div key={w.monday}>
              {T.weekLine(monthDay(w.monday), w.dayCount)} <b>{formatDollars(w.cents ?? 0)}</b>
            </div>
          ))}
        </>
      ) : (
        <div>
          {T.dayCount(priced.dayCount)} · {words} <b>{formatDollars(priced.baseCents ?? 0)}</b>
        </div>
      )}
      {priced.extras.map((e) => (
        <div key={e.extraId}>
          {label(e)} <b>{formatDollars(e.cents)}</b>
        </div>
      ))}
      <div className="camp-price__total">
        <span>{T.childTotal(name)}</span>
        <b>{formatDollars(priced.totalCents)}</b>
      </div>
    </div>
  );
}
