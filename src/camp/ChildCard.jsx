// ChildCard.jsx — one child's card on step 1 of the camp form (mockup C7a, "Child 1").
// Why it exists: a family signs up 1 to 3 children at once (rulebook v0.232); each child has
// their own card: first and last name, age (counted on the first day of camp, v0.703), member
// Yes / No, which days (chips with the dark outline, v0.237), extras (a per-day extra asks which
// days, starting with the child's days) and the child's running price.
// The card only draws; CampApp keeps the values and the rules live in form.js / campRules.js.
import { FieldError, TickBox } from './parts.jsx';
import { extrasFor, fieldId, priceFor, tidyChild } from './form.js';
import { formatDollars, shortDate } from './format.js';
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

  const toggleExtra = (extra, ticked) =>
    change((cur) => {
      const others = cur.extras.filter((e) => e.extraId !== extra.extraId);
      // A per-day extra starts with all of the child's days (C7a); a once extra has no days.
      return { extras: ticked ? [...others, { extraId: extra.extraId, dayIds: extra.per === 'day' ? cur.dayIds : [] }] : others };
    });

  const toggleExtraDay = (extraId, dayId) =>
    change((cur) => ({
      extras: cur.extras.map((e) => {
        if (e.extraId !== extraId) return e;
        const on = e.dayIds.includes(dayId);
        return { ...e, dayIds: on ? e.dayIds.filter((id) => id !== dayId) : [...e.dayIds, dayId] };
      }),
    }));

  const childDays = camp.days.filter((d) => child.dayIds.includes(d.dayId));
  const extras = extrasFor(child, camp);
  const priced = child.member !== null && child.dayIds.length > 0 ? priceFor(child, camp, kind) : null;

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
        <div className="reg-chips">
          {camp.days.map((d, i) => (
            <button
              key={d.dayId}
              id={i === 0 ? fieldId(key('days')) : undefined}
              type="button"
              className={`reg-chip${child.dayIds.includes(d.dayId) ? ' is-on' : ''}`}
              aria-pressed={child.dayIds.includes(d.dayId)}
              onClick={() => toggleDay(d.dayId)}
            >
              {shortDate(d.day)}
            </button>
          ))}
        </div>
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
                    <div className="reg-chips" role="group" aria-label={`${extra.name} · ${T.PER_DAY_WHICH}`}>
                      {childDays.map((d) => (
                        <button
                          key={d.dayId}
                          type="button"
                          className={`reg-chip${pick.dayIds.includes(d.dayId) ? ' is-on' : ''}`}
                          aria-pressed={pick.dayIds.includes(d.dayId)}
                          onClick={() => toggleExtraDay(extra.extraId, d.dayId)}
                        >
                          {shortDate(d.day)}
                        </button>
                      ))}
                    </div>
                    <FieldError>{show(extraKey)}</FieldError>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {/* The child's running price (once member and days are chosen) */}
      {priced ? <PriceBox priced={priced} member={child.member} kind={kind} name={first || T.childTitle(index + 1)} /> : null}
    </section>
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
function PriceBox({ priced, member, kind, name }) {
  return (
    <div className="camp-price" aria-live="polite">
      <div>
        {T.dayCount(priced.dayCount)} · {member ? T.MEMBER_WORD : T.NON_MEMBER_WORD} · {kind === 'early' ? T.EARLY_PRICE_WORD : T.REGULAR_PRICE_WORD}{' '}
        <b>{formatDollars(priced.baseCents ?? 0)}</b>
      </div>
      {priced.extras.map((e) => (
        <div key={e.extraId}>
          {e.per === 'day' ? T.extraTimes(e.name, e.count) : e.name} <b>{formatDollars(e.cents)}</b>
        </div>
      ))}
      <div className="camp-price__total">
        <span>{T.childTotal(name)}</span>
        <b>{formatDollars(priced.totalCents)}</b>
      </div>
    </div>
  );
}
