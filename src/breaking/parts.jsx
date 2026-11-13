// parts.jsx — small pieces shared by the Board breaking sign-up page's screens: the header strip, the
// preview strip, the event card at the top, the "can't register" message, amber messages and the icons.
// Why it exists: the screens (BreakingForm, DonePage, ReturnPage) reuse these so every screen looks like
// the approved pictures A-family-*. They use the Color Belt / Camps page's styles (register.css, classes
// starting "reg-"; camp.css, "camp-") so the public forms look the same (rulebook v0.106); only the new
// pieces are in breaking-public.css ("brk-"). Icons are drawn inline from Tabler's paths because the
// public pages load no icon library.
import * as T from './text.js';
import { longDate } from '../register/format.js';
import { schoolName } from './form.js';

// The white header strip: logo, school name, "Board breaking". The logo's alt text is empty because the
// school name is written right next to it.
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

// $1 or $0.25: a whole number of dollars without cents, otherwise with (the pre-register banner's style).
const shortMoney = (cents) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

// The event card at the top: name, date, school and (on the open form) the pre-register banner.
export function EventCard({ event, banner = false }) {
  if (!event) return null;
  const extra = event.prices.sameDayExtraCents;
  return (
    <section className="reg-hero" aria-label={event.name}>
      <h1 className="reg-hero__title">{event.name}</h1>
      <div className="reg-hero__when">{longDate(event.eventDate)}</div>
      <div className="reg-hero__where">{T.schoolLine(schoolName(event.locationCode))}</div>
      {banner && extra > 0 ? (
        <div className="reg-hero__by">
          {event.prices.sameDay ? (
            <>
              <b>{T.SAME_DAY_BOLD}</b>
              {T.sameDayRest(shortMoney(extra))}
            </>
          ) : (
            <>
              <b>{T.preRegisterBold(shortMoney(extra))}</b>
              {T.preRegisterRest(shortMoney(extra))}
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}

// The message box when families can't register, and the "didn't load" box.
// `level` is 'h1' when no event card is shown above it (one h1 per page), otherwise 'h2'.
export function StateMessage({ title, text, children, level = 'h2' }) {
  const Heading = level;
  return (
    <div className="reg-state" role="status">
      <Heading className="reg-state__title">{title}</Heading>
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

// The amber banner at the top of a screen (send failed, price changed, link failed, …). role="alert" makes
// screen readers announce it; tabIndex lets the page move focus to it.
export function TopError({ children, innerRef }) {
  return (
    <div className="reg-errtop" role="alert" ref={innerRef} tabIndex={-1}>
      <WarnIcon />
      <span>{children}</span>
    </div>
  );
}

const svgProps = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', focusable: 'false' };

// Tabler's "alert-triangle".
export function WarnIcon() {
  return (
    <svg className="reg-icon" {...svgProps}>
      <path d="M12 9v4" />
      <path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z" />
      <path d="M12 16h.01" />
    </svg>
  );
}

// Tabler's "minus", "plus", "chevron-down" and "credit-card".
export function Icon({ name, className }) {
  return (
    <svg className={className} {...svgProps}>
      {name === 'minus' ? <path d="M5 12l14 0" /> : null}
      {name === 'plus' ? (
        <>
          <path d="M12 5l0 14" />
          <path d="M5 12l14 0" />
        </>
      ) : null}
      {name === 'chevron-down' ? <path d="M6 9l6 6l6 -6" /> : null}
      {name === 'credit-card' ? (
        <>
          <path d="M3 5m0 3a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3z" />
          <path d="M3 10l18 0" />
          <path d="M7 15l.01 0" />
          <path d="M11 15l2 0" />
        </>
      ) : null}
    </svg>
  );
}
