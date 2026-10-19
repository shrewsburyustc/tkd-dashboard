// parts.jsx — small pieces shared by the camp sign-up page's screens: the header strip, the camp
// card at the top, the "can't sign up" message, field errors, the top banner and the tick box.
// Why it exists: the steps (StepDetails, StepCheck, SignedUp) reuse these so every screen looks
// like the approved mockups C7a–C7d. They use the Color Belt page's styles (register.css, classes
// starting "reg-") so both public forms look the same (rulebook v0.106); camp-only pieces use
// camp.css ("camp-").
import * as T from './text.js';
import { addressLine, campDaysLong, campHours, locationLine, longDate } from './format.js';

// The white header strip: logo, school name, "Camp sign-up" (v0.106).
// The logo's alt text is empty because the school name is written right next to it.
export function Header() {
  return (
    <header className="reg-header">
      <div className="reg-header__in">
        <img className="reg-header__logo" src={`${import.meta.env.BASE_URL}logo.png`} width="52" height="52" alt="" />
        <div>
          <div className="reg-header__school">{T.SCHOOL}</div>
          <div className="reg-header__kind">{T.PAGE_KIND}</div>
        </div>
      </div>
    </header>
  );
}

// Preview mode only: a thin amber strip so nobody mistakes it for the real form.
export function PreviewStrip() {
  return (
    <div className="reg-preview" role="status">
      {T.PREVIEW_BANNER}
    </div>
  );
}

// The camp card at the top (C7a, C7d). `camp` is the camelCase camp from the GET answer.
//   full = true on the open form: adds "Ages 5–12", the early-price / sign-up-by line and the
//   camp's description. The "can't sign up" messages (C7d) show only name, days, school and hours.
//   priceKindToday 'early' | 'regular' — after the early-price date the early part is left out.
export function CampCard({ camp, full = false, priceKindToday = 'early' }) {
  if (!camp) return null;
  const hours = campHours(camp.startTime, camp.endTime);
  const where = locationLine(camp.schoolName, camp.address);
  const byParts = [];
  if (priceKindToday === 'early' && camp.earlyUntil) byParts.push(T.earlyUntilPart(longDate(camp.earlyUntil)));
  if (camp.signupClosesOn) byParts.push(T.signUpByPart(longDate(camp.signupClosesOn)));
  return (
    <section className="reg-hero" aria-label={camp.name}>
      <h1 className="reg-hero__title">{camp.name}</h1>
      <div className="reg-hero__when">{campDaysLong(camp.days)}</div>
      {camp.bothSchools ? (
        // A camp for both schools: the school is named once in the both-schools line
        // ("… · held at Worcester"), then the hours and the street address (when there is one).
        <>
          <div className="reg-hero__where">{T.BOTH_SCHOOLS_LINE(camp.schoolName)}</div>
          <div className="reg-hero__where">{[hours, addressLine(camp.address)].filter(Boolean).join(' · ')}</div>
        </>
      ) : (
        <div className="reg-hero__where">
          {hours} · {where}
        </div>
      )}
      {full ? (
        <>
          <div className="reg-hero__where camp-ages">
            <b>{T.agesLine(camp.minAge, camp.maxAge)}</b>
          </div>
          {byParts.length > 0 ? (
            <div className="reg-hero__by">
              <b>{byParts.join(' · ')}</b>
            </div>
          ) : null}
          {camp.description ? <div className="reg-hero__note camp-pre">{camp.description}</div> : null}
        </>
      ) : null}
    </section>
  );
}

// The message box when families can't sign up (C7d), and the "didn't load" box.
export function StateMessage({ title, text, children }) {
  return (
    <div className="reg-state" role="status">
      <h2 className="reg-state__title">{title}</h2>
      <p className="reg-state__text">{text}</p>
      {children}
    </div>
  );
}

// An amber message under a field. `id` lets the field point at it (aria-describedby).
export function FieldError({ id, children }) {
  if (!children) return null;
  return (
    <div className="reg-ferr" id={id}>
      <WarnIcon />
      <span>{children}</span>
    </div>
  );
}

// The amber banner at the top of a step (send failed, price changed, camp changed, …).
export function TopError({ children, innerRef }) {
  return (
    <div className="reg-errtop" role="alert" ref={innerRef} tabIndex={-1}>
      <WarnIcon />
      <span>{children}</span>
    </div>
  );
}

// Tabler's "alert-triangle" icon, drawn inline (the page loads no icon library).
export function WarnIcon() {
  return (
    <svg className="reg-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M12 9v4" />
      <path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z" />
      <path d="M12 16h.01" />
    </svg>
  );
}

// Tabler's "plus" icon, for "Add another child".
export function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M12 5l0 14" />
      <path d="M5 12l14 0" />
    </svg>
  );
}

// A tick box with its words next to it (extras, the waiver tick).
export function TickBox({ id, checked, onChange, invalid, describedBy, inputRef, children }) {
  return (
    <label className="reg-ack" htmlFor={id}>
      <input
        ref={inputRef}
        id={id}
        type="checkbox"
        className="reg-checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
      />
      <span>{children}</span>
    </label>
  );
}
