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
//   onCancel    the real close: the screen's own Cancel button, and what happens once the guard lets go
//   dirty       true while the person has typed something that would be thrown away (M14, v1.027): Esc,
//               a click on the dimmed backdrop, the browser's Back and the phone's back arrow then keep the
//               dialog open with the amber note "Unsaved changes. Save or cancel first." (phones add a
//               "Discard changes" link, v0.56). With nothing typed they close it, as in every other dialog
//               (v0.46; before v1.143 a click outside did nothing). The screen's Cancel button always closes.
//   onBack      phone back arrow — Change PIN uses it to step back instead of closing
//   backLeaves  true when the phone back arrow would leave the dialog (Change PIN's first step): it then
//               goes through the same guard instead of calling onBack
//   children    the screen's content
//
// The page behind it is made "inert" by the App (no clicks, no Tab) while it's open.
//
// Browser Back (v0.83): while open, the dialog adds a step to the browser's history, so the
// browser's (or phone's) Back cancels it — like Esc — instead of leaving the page behind it.
// Same way Dialog.jsx does it.
import { useEffect, useId, useRef, useState } from 'react';
import { IconArrowLeft } from '@tabler/icons-react';
import { dialogStep } from '../lib/backButton.js';
import { BACK, DISCARD_CHANGES, UNSAVED_CHANGES } from './text.js';
import Notice from './Notice.jsx';

// Everything a person can Tab to. (A disabled button or a tabIndex="-1" element can't be.)
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export default function AccountDialog({ title, fullScreen, onCancel, onBack, backLeaves = false, dirty = false, children }) {
  const boxRef = useRef(null); // the dialog box (or the full-screen page)
  const [unsaved, setUnsaved] = useState(false); // the amber note is showing
  const titleId = useId(); // links the title to the dialog, so screen readers announce it

  // Newest callbacks in refs, so the key listener below never calls stale ones.
  const onCancelRef = useRef(onCancel);
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    onCancelRef.current = onCancel;
    dirtyRef.current = dirty;
  });
  // Nothing left to lose: the note has done its job.
  useEffect(() => {
    if (!dirty) setUnsaved(false);
  }, [dirty]);

  // Esc, a click outside, the browser's Back and the phone's back arrow ask to close: with something typed
  // the dialog stays open and says so; with nothing typed it closes (v1.027, v1.143).
  // (A ref, so the listeners below never call a stale one.)
  const requestCloseRef = useRef(null);
  requestCloseRef.current = () => {
    if (dirtyRef.current) setUnsaved(true);
    else onCancelRef.current();
  };

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
    const release = dialogStep(token); // App.jsx: this step is in use (backButton.js)
    function handleBack() {
      // Back used up our step. With something typed, put the step back (the dialog stays open with the
      // note); otherwise closing the dialog is what Back does.
      if (dirtyRef.current) window.history.pushState(marker, '');
      requestCloseRef.current();
    }
    window.addEventListener('popstate', handleBack);
    return () => {
      release();
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
        requestCloseRef.current();
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

  // The amber note (M14). On phones a "Discard changes" link goes with it: the page has no Cancel button.
  const unsavedNote = unsaved ? (
    <div className="dialog-unsaved">
      <Notice>
        {/* One piece of text, so the icon and the words line up (the link wraps with the words) */}
        <span>
          {UNSAVED_CHANGES}
          {fullScreen && (
            <>
              {' '}
              <button type="button" className="link-button" onClick={() => onCancelRef.current()}>
                {DISCARD_CHANGES}
              </button>
            </>
          )}
        </span>
      </Notice>
    </div>
  ) : null;

  if (fullScreen) {
    return (
      // tabIndex={-1}: the page itself can hold focus (e.g. between steps) but isn't a Tab stop.
      <div ref={boxRef} className="dialog-page" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="dialog-page-head">
          <button type="button" className="icon-button" aria-label={BACK} onClick={backLeaves || !onBack ? () => requestCloseRef.current() : onBack}>
            <IconArrowLeft size={20} aria-hidden="true" />
          </button>
          <h2 id={titleId} className="dialog-page-title">
            {title}
          </h2>
        </div>
        <div className="dialog-page-body">
          {unsavedNote}
          {children}
        </div>
      </div>
    );
  }

  return (
    // The dimmed backdrop. A click on it (not on the box) asks to close: it closes when nothing was typed,
    // and with something typed it keeps the dialog open and says so, so a stray click can't throw away
    // what was typed (v1.027, v1.143). "--top": the box sits near the top of the screen, like every other
    // dialog (v0.82; the class lives in shared.css with v0.80).
    <div
      className="dialog-backdrop dialog-backdrop--top"
      onMouseDown={(event) => {
        // Keep focus where it is: a click on the dim area shouldn't drop focus to the page.
        if (event.target === event.currentTarget) event.preventDefault();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) requestCloseRef.current();
      }}
    >
      <div ref={boxRef} className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <h2 id={titleId} className="dialog-title">
          {title}
        </h2>
        {unsavedNote}
        {children}
      </div>
    </div>
  );
}
