// parts.jsx — small pieces shared by the Black Belt family page's screens: the header strip,
// the preview strip, the "can't register" message, field errors, the amber banner, the tick
// box, one summary row and the few icons the page draws.
// Why it exists: the steps (StepDetails, StepCheck, Registered) and the panels reuse these so
// every screen looks the same as the approved mockups (Form 1–9, public-page look v0.106).
//
// Icons: the page loads no icon library (it must stay small and load nothing from the
// dashboard), so the few Tabler outline icons it needs are drawn here as inline SVG with
// Tabler's own shapes: ti-alert-triangle, ti-x, ti-arrow-left, ti-chevron-right, ti-plus,
// ti-minus, ti-printer, ti-check. aria-hidden: the button around each icon carries the words.
import * as T from './text.js';

// The white header strip: logo, school name, "Black Belt testing registration · Shrewsbury".
// The logo's alt text is empty because the school name is written right next to it.
export function Header({ schoolName }) {
  return (
    <header className="bbf-header">
      <div className="bbf-header__in">
        <img className="bbf-header__logo" src={`${import.meta.env.BASE_URL}logo.png`} width="52" height="52" alt="" />
        <div>
          <div className="bbf-header__school">{T.SCHOOL}</div>
          <div className="bbf-header__kind">{T.pageKindFor(schoolName)}</div>
        </div>
      </div>
    </header>
  );
}

// Preview mode only: a thin amber strip so nobody mistakes it for the real form.
export function PreviewStrip() {
  return (
    <div className="bbf-preview" role="status">
      {T.PREVIEW_BANNER}
    </div>
  );
}

// The message box when families can't register (Form 8), and the "didn't load" box.
export function StateMessage({ title, text, children }) {
  return (
    <div className="bbf-state" role="status">
      <h2 className="bbf-state__title">{title}</h2>
      <p className="bbf-state__text">{text}</p>
      {children}
    </div>
  );
}

// An amber message under a field (Form 4, 6). `id` lets the field point at it (aria-describedby).
export function FieldError({ id, children }) {
  if (!children) return null;
  return (
    <div className="bbf-ferr" id={id}>
      <Icon name="alert" />
      <span>{children}</span>
    </div>
  );
}

// The amber banner at the top of step 2 after a Send that didn't work (Form 8).
export function TopError({ innerRef, children, action }) {
  return (
    <div className="bbf-errtop" role="alert" ref={innerRef} tabIndex={-1}>
      <Icon name="alert" />
      <div>
        <span>{children}</span>
        {action}
      </div>
    </div>
  );
}

// A tick box with its words next to it (the waiver tick).
export function TickBox({ id, checked, onChange, invalid, describedBy, inputRef, children }) {
  return (
    <label className="bbf-ack" htmlFor={id}>
      <input
        ref={inputRef}
        id={id}
        type="checkbox"
        className="bbf-checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
      />
      <span>{children}</span>
    </label>
  );
}

// One labelled line of a summary (step 2, Registered).
export function Row({ label, children }) {
  return (
    <div className="bbf-rv">
      <dt className="bbf-rv__k">{label}</dt>
      <dd className="bbf-rv__v">{children}</dd>
    </div>
  );
}

// Tabler outline icons (paths copied from Tabler Icons, MIT licence).
const PATHS = {
  alert: ['M12 9v4', 'M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z', 'M12 16h.01'],
  x: ['M18 6l-12 12', 'M6 6l12 12'],
  arrowLeft: ['M5 12l14 0', 'M5 12l6 6', 'M5 12l6 -6'],
  chevronRight: ['M9 6l6 6l-6 6'],
  plus: ['M12 5l0 14', 'M5 12l14 0'],
  minus: ['M5 12l14 0'],
  printer: [
    'M17 17h2a2 2 0 0 0 2 -2v-4a2 2 0 0 0 -2 -2h-14a2 2 0 0 0 -2 2v4a2 2 0 0 0 2 2h2',
    'M17 9v-4a2 2 0 0 0 -2 -2h-6a2 2 0 0 0 -2 2v4',
    'M7 13m0 2a2 2 0 0 1 2 -2h6a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2z',
  ],
  check: ['M5 12l5 5l10 -10'],
};

export function Icon({ name, size = 16, className = 'bbf-icon' }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {(PATHS[name] ?? []).map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
