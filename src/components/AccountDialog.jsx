// AccountDialog.jsx — the frame around Change PIN and Change password.
// Why it exists: both screens open from the account menu and must behave the same way
// (approved mockups, guidelines 6 and 4):
//   - PC and tablet: a dialog box in the middle of a dimmed page. No close (X) icon — the
//     screen's own Cancel button is the way out.
//   - Phone (<640px): a full-screen page with a back arrow (IconArrowLeft) and the title.
//   - Keyboard: focus moves into it when it opens; Tab and Shift+Tab stay inside it (a "focus
//     trap"); Esc cancels; when it closes, focus goes back to the initials (account menu) button.
//
// Props:
//   title       "Change PIN" / "Change password"
//   fullScreen  true on phones (the screen decides, using the same 640px breakpoint as app.css)
//   onCancel    Esc pressed (and the phone back arrow, unless onBack is given)
//   onBack      phone back arrow — Change PIN uses it to step back instead of closing
//   children    the screen's content
//
// The page behind it is made "inert" by the App (no clicks, no Tab) while it's open.
//
// Browser Back (v0.83): while open, the dialog adds a step to the browser's history, so the
// browser's (or phone's) Back cancels it — like Esc — instead of leaving the page behind it.
// Same way Dialog.jsx does it.
import { useEffect, useId, useRef } from 'react';
import { IconArrowLeft } from '@tabler/icons-react';

// Everything a person can Tab to. (A disabled button or a tabIndex="-1" element can't be.)
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export default function AccountDialog({ title, fullScreen, onCancel, onBack, children }) {
  const boxRef = useRef(null); // the dialog box (or the full-screen page)
  const titleId = useId(); // links the title to the dialog, so screen readers announce it

  // Newest callbacks in refs, so the key listener below never calls stale ones.
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    onCancelRef.current = onCancel;
  });

  // Opening: move focus inside (unless the screen already did). Closing: back to the initials.
  useEffect(() => {
    const box = boxRef.current;
    if (!box.contains(document.activeElement)) {
      // [data-autofocus] marks the field that should get focus first (e.g. the password box).
      (box.querySelector('[data-autofocus]') ?? box).focus();
    }
    return () => {
      // The initials button in the top bar; looked up by its class name (as App.jsx does).
      // If the page is locked or signed out by then, it's hidden or gone and nothing happens.
      document.querySelector('.avatar-button')?.focus();
    };
  }, []);

  // While open: the browser's Back cancels (see the header). A token unique to this opening lets
  // us remove only our OWN history step when the dialog closes some other way.
  const titleKey = titleId;
  useEffect(() => {
    const token = `${titleKey}-${Date.now()}-${Math.random()}`;
    const marker = { tkdDialog: token };
    if (window.history.state?.tkdDialog) window.history.replaceState(marker, '');
    else window.history.pushState(marker, '');
    function handleBack() {
      onCancelRef.current(); // Back used up our step; cancelling closes the dialog
    }
    window.addEventListener('popstate', handleBack);
    return () => {
      window.removeEventListener('popstate', handleBack);
      // Closed some other way (Cancel, saved, lock…): remove our step, a moment later and only
      // if it's still on top.
      window.setTimeout(() => {
        if (window.history.state?.tkdDialog === token) window.history.back();
      }, 0);
    };
  }, [titleKey]);

  // While open: Esc cancels; Tab / Shift+Tab wrap around inside the dialog.
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancelRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const box = boxRef.current;
      // Only things actually on screen (getClientRects is empty for hidden elements).
      const items = Array.from(box.querySelectorAll(FOCUSABLE)).filter((element) => element.getClientRects().length > 0);
      if (items.length === 0) {
        event.preventDefault();
        box.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (!box.contains(active)) {
        event.preventDefault(); // focus somehow escaped: bring it back in
        first.focus();
      } else if (event.shiftKey && (active === first || active === box)) {
        event.preventDefault(); // Shift+Tab on the first item → jump to the last
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault(); // Tab on the last item → jump to the first
        first.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (fullScreen) {
    return (
      // tabIndex={-1}: the page itself can hold focus (e.g. between steps) but isn't a Tab stop.
      <div ref={boxRef} className="dialog-page" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="dialog-page-head">
          <button type="button" className="icon-button" aria-label="Back" onClick={onBack ?? onCancel}>
            <IconArrowLeft size={20} aria-hidden="true" />
          </button>
          <h2 id={titleId} className="dialog-page-title">
            {title}
          </h2>
        </div>
        <div className="dialog-page-body">{children}</div>
      </div>
    );
  }

  return (
    // The dimmed backdrop. Clicking it does nothing on purpose: Cancel is the one way out,
    // so a stray click can't throw away what was typed. "--top": the box sits near the top of the
    // screen, like every other dialog (v0.82; the class lives in testing.css with v0.80).
    <div className="dialog-backdrop dialog-backdrop--top">
      <div ref={boxRef} className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <h2 id={titleId} className="dialog-title">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
