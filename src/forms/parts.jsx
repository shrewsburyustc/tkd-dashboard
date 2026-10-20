// parts.jsx — small pieces of the public forms page: the header strip, the preview strip and the
// "can't sign up" box.
// Why it exists: every screen of the page (FormsApp.jsx, ThankYou.jsx) uses them, and they follow
// the public-page look of rulebook v0.106 — the same white header strip with the school logo as
// Color Belt's family page (src/register/parts.jsx), drawn with this page's own fp- classes.
import * as T from './text.js';

// The white header strip: logo, school name, and the school's town (or "Sign-up form").
// The logo's alt text is empty because the school name is written right next to it.
export function Header({ schoolName }) {
  return (
    <header className="fp-header">
      <div className="fp-header__in">
        <img className="fp-header__logo" src={`${import.meta.env.BASE_URL}logo.png`} width="52" height="52" alt="" />
        <div>
          <div className="fp-header__school">{T.SCHOOL}</div>
          <div className="fp-header__kind">{schoolName || T.PAGE_KIND}</div>
        </div>
      </div>
    </header>
  );
}

// Preview mode only: a thin amber strip so nobody mistakes it for the real form.
export function PreviewStrip() {
  return (
    <div className="fp-preview" role="status">
      {T.PREVIEW_BANNER}
    </div>
  );
}

// The box when families can't sign up (not found, closed, paused) and "didn't load".
export function StateMessage({ title, text, children }) {
  return (
    <div className="fp-card fp-state" role="status">
      <h1 className="fp-title">{title}</h1>
      <p className="fp-state__text">{text}</p>
      {children}
    </div>
  );
}
