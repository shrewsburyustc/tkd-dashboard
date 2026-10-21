// Header.jsx — the white header strip of the Star family page, and the preview-mode strip.
// Why it exists: rulebook v0.106 — logo, "Jae H. Jeong's U.S. Taekwondo Center" and the page kind
// under it. A COPY of Color Belt's Header in src/register/parts.jsx (build plan phase 4: "Star
// copies"), because that one says "Color belt testing registration" and its live page must stay
// untouched. It reuses Color Belt's CSS classes (src/styles/register.css), unchanged.
// The logo's alt text is empty because the school name is written right next to it.
import * as T from './text.js';

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
