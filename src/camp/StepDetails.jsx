// StepDetails.jsx — step 1 of the camp form (mockup C7a): the camp card, one card per child
// (1–3), "Add another child", parent, emergency contact and how the family will pay.
// Why it exists: rulebook v0.232 / v0.703 and contract 0013 §4.1. Errors show when a field is
// left and again for everything at Continue (the Color Belt form's rule, Star v0.107); Continue
// then moves focus to the first problem.
import ChildCard from './ChildCard.jsx';
import FamilyFields from './FamilyFields.jsx';
import { CampCard, FieldError, PlusIcon, TopError } from './parts.jsx';
import { fieldId } from './form.js';
import { MAX_CHILDREN, PAYING_BY } from '../lib/camps/campRules.js';
import * as T from './text.js';

export default function StepDetails({
  camp,
  kind,
  form,
  setChild,
  addChild,
  removeChild,
  setPerson,
  setPayingBy,
  show, // (fieldKey) → the error words to show now, or null
  onLeave,
  onContinue,
  banner, // null | 'camp_changed'
  bannerRef,
  headingRef,
  honeypot,
  setHoneypot,
}) {
  const full = form.children.length >= MAX_CHILDREN;
  return (
    <>
      <CampCard camp={camp} full priceKindToday={kind} />
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
        {banner === 'camp_changed' ? <TopError innerRef={bannerRef}>{T.CAMP_CHANGED}</TopError> : null}

        {/* Honeypot: hidden from people (and screen readers); bots fill in every field.
            If anything is typed here the server refuses the sign-up. */}
        <div className="reg-hp" aria-hidden="true">
          <label htmlFor="camp-website">Website</label>
          <input id="camp-website" type="text" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
        </div>

        {form.children.map((child, index) => (
          <ChildCard
            key={child.key}
            child={child}
            index={index}
            camp={camp}
            kind={kind}
            update={(next) => setChild(index, next)}
            onRemove={index > 0 ? () => removeChild(index) : null}
            show={show}
            onLeave={onLeave}
          />
        ))}

        {/* Add another child (up to 3 on one sign-up) */}
        <div className="camp-add">
          {full ? null : (
            <button type="button" className="camp-add__btn" onClick={addChild}>
              <PlusIcon />
              {T.ADD_CHILD}
            </button>
          )}
          <div className="reg-hint camp-add__hint">{T.UP_TO_3}</div>
        </div>

        <FamilyFields form={form} setPerson={setPerson} show={show} onLeave={onLeave} />

        {/* How you'll pay at the school: Cash / Check / Card (Card is Camps only, v0.233) */}
        <section className="reg-card">
          <fieldset className="reg-field reg-fieldset camp-last" aria-describedby={show('paying') ? 'camp-paying-err' : 'camp-paying-hint'}>
            <legend className="reg-card__title camp-legend">{T.HOW_PAY}</legend>
            <div className="reg-radios">
              {PAYING_BY.map((method, i) => (
                <label key={method} className="reg-radio">
                  <input
                    id={i === 0 ? fieldId('paying') : undefined}
                    type="radio"
                    name="camp-paying"
                    value={method}
                    checked={form.payingBy === method}
                    onChange={() => setPayingBy(method)}
                  />
                  {T.METHOD[method]}
                </label>
              ))}
            </div>
            {/* The error takes the hint's place (as Color Belt's F3) */}
            {show('paying') ? (
              <FieldError id="camp-paying-err">{show('paying')}</FieldError>
            ) : (
              <div className="reg-hint" id="camp-paying-hint">{T.PAY_HINT}</div>
            )}
          </fieldset>
        </section>

        <button type="submit" className="reg-btn reg-btn--primary reg-btn--main">
          {T.CONTINUE}
        </button>
      </form>
    </>
  );
}
