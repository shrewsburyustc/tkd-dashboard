// parts.jsx — small pieces shared by the family page's screens: the header strip, the event
// box, the "can't register" message, field errors, the tick box and the fee box.
// Why it exists: the steps (StepDetails, StepCheck, Registered) reuse these so every screen
// looks the same as the approved mockups (F1–F15, rulebook v0.106 look).
import * as T from './text.js';
import { formatDollars, earlyDeadline, locationLine, longDate, longDateWithYear } from './format.js';

// The white header strip: logo, school name, "Color belt testing registration" (v0.106).
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

// The event box (F1): title, date, location, "Register by …" (only while open), note.
export function EventBox({ event, showRegisterBy }) {
  if (!event) return null;
  return (
    <section className="reg-hero" aria-label={event.name}>
      <h1 className="reg-hero__title">{event.name}</h1>
      <div className="reg-hero__when">{longDateWithYear(event.testing_date)}</div>
      <div className="reg-hero__where">
        {T.LOCATION}: {locationLine(event.school_name, event.address)}
      </div>
      {showRegisterBy && event.auto_close_on ? (
        <div className="reg-hero__by">
          <b>{T.REGISTER_BY(longDate(event.auto_close_on))}</b>
        </div>
      ) : null}
      {event.note ? <div className="reg-hero__note">{event.note}</div> : null}
    </section>
  );
}

// The message box when families can't register (F11–F15), and the "didn't load" box.
export function StateMessage({ title, text, children }) {
  return (
    <div className="reg-state" role="status">
      <h2 className="reg-state__title">{title}</h2>
      <p className="reg-state__text">{text}</p>
      {children}
    </div>
  );
}

// An amber message under a field (F3, F5). `id` lets the field point at it (aria-describedby).
export function FieldError({ id, children }) {
  if (!children) return null;
  return (
    <div className="reg-ferr" id={id}>
      <WarnIcon />
      <span>{children}</span>
    </div>
  );
}

// The amber banner at the top of step 2 (F9, F10, and the spam-check / too-many-tries messages).
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

// A tick box with its words next to it (the 3-stripes tick, the confirmation tick).
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

// The official "Testing fee" box with the testing-day warning (F2, rulebook v0.131).
// On the testing day itself only the testing-day price applies (no warning).
export function FeeBox({ earlyCents, dayCents, testingDate, onTestingDay }) {
  const deadline = earlyDeadline(testingDate);
  const amount = onTestingDay ? dayCents : earlyCents;
  const warn = !onTestingDay && dayCents > earlyCents;
  return (
    <div className="reg-fee">
      <div className="reg-fee__label">{T.TESTING_FEE}</div>
      <div className="reg-fee__amount">
        <b>{formatDollars(amount)}</b>
        <span>{onTestingDay ? T.PAY_TODAY : T.payBy(deadline)}</span>
      </div>
      {warn ? (
        <DayWarning dayCents={dayCents} savingCents={dayCents - earlyCents} deadline={deadline} />
      ) : null}
    </div>
  );
}

// "$75 if paid on the testing day. Pay by Thursday, November 19 to save $10."
export function DayWarning({ dayCents, savingCents, deadline }) {
  return (
    <div className="reg-fwarn">
      <WarnIcon />
      <span>
        <b>{T.dayPriceBold(formatDollars(dayCents))}</b>
        {T.saveBy(deadline, formatDollars(savingCents))}
      </span>
    </div>
  );
}
