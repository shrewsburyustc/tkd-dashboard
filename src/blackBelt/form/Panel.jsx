// Panel.jsx — the frame of the requirements panel and the waiver's Read all (Form 3, 5).
// Why it exists: contract 0016-B1 §4.5 — on a phone it is a full-screen panel over the form;
// on a tablet or PC it is a dialog in the middle of the page (12px corners) with the form dimmed
// behind it. Esc, ✕ or a click outside close it; the phone's back gesture closes it too (FormApp
// adds a browser history entry while it is open). The form underneath is never touched, so it
// is exactly as it was afterwards.
//
// Header: a ← button when the panel is on a deeper level (back to the list), the title, and ✕.
// On phones ✕ sits on the left at the first level (as drawn) and is hidden on deeper levels
// (← goes back; the back gesture still closes everything) — done in form.css.
//
// Keyboard: focus moves to the title when the panel opens or changes level, Tab stays inside the
// panel ("focus trap"), and focus returns to the button that opened it when it closes.
import { useEffect, useRef } from 'react';
import { Icon } from './parts.jsx';
import * as T from './text.js';

// Everything inside the panel that can take keyboard focus.
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Panel({ title, levelKey, onBack, onClose, children }) {
  const panelRef = useRef(null);
  const titleRef = useRef(null);

  // While open: no page scrolling behind it, and focus goes back to the opener afterwards.
  useEffect(() => {
    const opener = document.activeElement;
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = before;
      if (opener && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
    };
  }, []);

  // Each new level: start at the top and announce its title.
  useEffect(() => {
    const body = panelRef.current?.querySelector('.bbf-panel__body');
    if (body) body.scrollTop = 0;
    titleRef.current?.focus({ preventScroll: true });
  }, [levelKey]);

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = [...(panelRef.current?.querySelectorAll(FOCUSABLE) ?? [])];
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === titleRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  // A click on the dimmed area outside the dialog closes it (only when the press started there,
  // so selecting text inside and releasing outside doesn't close it).
  const pressedOutside = useRef(false);
  const onOverlayDown = (event) => {
    pressedOutside.current = event.target === event.currentTarget;
  };
  const onOverlayClick = (event) => {
    if (pressedOutside.current && event.target === event.currentTarget) onClose();
    pressedOutside.current = false;
  };

  return (
    <div className="bbf-overlay" onMouseDown={onOverlayDown} onClick={onOverlayClick}>
      <div
        className={`bbf-panel${onBack ? ' has-back' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bbf-panel-title"
        ref={panelRef}
        onKeyDown={onKeyDown}
      >
        <div className="bbf-panel__head">
          {onBack ? (
            <button type="button" className="bbf-iconbtn bbf-panel__back" onClick={onBack} aria-label={T.BACK}>
              <Icon name="arrowLeft" size={20} />
            </button>
          ) : null}
          <h2 className="bbf-panel__title" id="bbf-panel-title" ref={titleRef} tabIndex={-1}>
            {title}
          </h2>
          <button type="button" className="bbf-iconbtn bbf-panel__close" onClick={onClose} aria-label={T.CLOSE}>
            <Icon name="x" size={20} />
          </button>
        </div>
        <div className="bbf-panel__body">{children}</div>
      </div>
    </div>
  );
}
