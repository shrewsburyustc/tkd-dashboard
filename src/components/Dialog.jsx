// Dialog.jsx — the frame for the Testing dialogs (Edit/Add/View rank, Edit/Add class, Delete).
// Why it exists: guidelines 6 (v0.46) — opening or editing a record uses a centered dialog over
// the dimmed list (12px corners); on phones it is a full screen with a back arrow. Every Testing
// dialog behaves the same way, so the rules live here once:
//   - Drawn into document.body with a "portal", i.e. outside the page frame (the App makes the
//     frame "inert" — unclickable — while a dialog is open, and the dialog must stay usable).
//   - Keyboard focus moves into it when it opens (to the element marked data-autofocus) and
//     Tab / Shift+Tab stay inside it (a "focus trap").
//   - Esc, a click on the dimmed backdrop, or the phone back arrow call onRequestClose. The
//     screen decides what that means: close when nothing was changed, otherwise keep the dialog
//     open and show "Unsaved changes. Save or cancel first."
//   - variant 'confirm' is the small delete confirmation (role="alertdialog"), the same small box
//     on every device, phones included.
// Where focus goes after closing is decided by the screen (contract 0003 §8.5), not here.
//
// Phones: the full-screen page adds an entry to the browser's history while it's open, so the
// phone's own Back button (or the browser's) does the same as the back arrow on the page —
// including the unsaved-changes guard — instead of leaving the dashboard.
//
// AccountDialog.jsx (Change PIN / Change password) is a separate, older frame and stays as it is.
//
// Props:
//   title           text of the heading
//   ariaLabel       optional: a different name for screen readers (e.g. "Yellow, view only")
//   variant         'form' (default) | 'confirm'
//   size            'small' (360px, default) | 'detail' (440px, view-only rank) |
//                   'medium' (520px, edit rank on tablets) | 'wide' (760px, edit rank on the PC)
//   The Cancel / Save row is pinned to the bottom of the dialog (testing.css), so it never
//   ends up below the fold on a short screen.
//   fullScreen      true on phones (form dialogs only)
//   onRequestClose  Esc / backdrop click / back arrow
//   describedBy     optional id of the text that explains the dialog (used by 'confirm')
//   children        the content
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IconArrowLeft } from '@tabler/icons-react';
import { BACK } from '../screens/testing/text.js';

// Everything a person can Tab to. (A disabled button or a tabIndex="-1" element can't be.)
const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export default function Dialog({
  title,
  ariaLabel,
  variant = 'form',
  size = 'small',
  fullScreen = false,
  onRequestClose,
  describedBy,
  children,
}) {
  const boxRef = useRef(null);
  const titleId = useId();
  const isConfirm = variant === 'confirm';
  const asPage = fullScreen && !isConfirm; // the delete confirmation is never full screen

  // Opening: move focus inside, to [data-autofocus] (the first field). A phone page with no
  // field (the view-only rank) starts on its back arrow; otherwise the box itself.
  useEffect(() => {
    const box = boxRef.current;
    if (box && !box.contains(document.activeElement)) {
      (box.querySelector('[data-autofocus]') ?? box.querySelector('[data-back]') ?? box).focus();
    }
  }, []);

  // ----- Phone Back button (history) -----
  // Newest onRequestClose in a ref, for the 'popstate' listener below.
  const onRequestCloseRef = useRef(onRequestClose);
  useEffect(() => {
    onRequestCloseRef.current = onRequestClose;
  });
  useEffect(() => {
    if (!asPage) return undefined;
    // A token unique to this opening, so we only ever remove our OWN entry later.
    const token = `${titleId}-${Date.now()}-${Math.random()}`;
    const marker = { tkdDialog: token };
    // pushState adds a history entry without leaving the page. (If a previous dialog's entry
    // is still on top — e.g. it closed a moment ago — reuse it instead of stacking another.)
    if (window.history.state?.tkdDialog) window.history.replaceState(marker, '');
    else window.history.pushState(marker, '');

    function handleBack() {
      // The Back button just used up our entry. Put it back (the dialog may stay open with
      // "Unsaved changes…"), then ask to close exactly like the back arrow does.
      window.history.pushState(marker, '');
      onRequestCloseRef.current();
    }
    window.addEventListener('popstate', handleBack);
    return () => {
      window.removeEventListener('popstate', handleBack);
      // Closed some other way (Save, back arrow, lock…): remove our entry so the next Back
      // press doesn't land on an empty step. Done a moment later, and only if our entry is
      // still on top, so a dialog that immediately opens again keeps its entry.
      window.setTimeout(() => {
        if (window.history.state?.tkdDialog === token) window.history.back();
      }, 0);
    };
  }, [asPage, titleId]);

  // Esc asks to close; Tab / Shift+Tab wrap around inside the dialog.
  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onRequestClose();
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
    if (event.shiftKey && (active === first || active === box)) {
      event.preventDefault(); // Shift+Tab on the first item → jump to the last
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault(); // Tab on the last item → jump to the first
      first.focus();
    }
  }

  // Shared accessibility attributes for the box / page.
  const a11y = {
    role: isConfirm ? 'alertdialog' : 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': ariaLabel ? undefined : titleId,
    'aria-label': ariaLabel,
    'aria-describedby': describedBy,
    tabIndex: -1, // can hold focus, but isn't a Tab stop
  };

  if (asPage) {
    return createPortal(
      <div ref={boxRef} className="dialog-page tdialog-page" onKeyDown={handleKeyDown} {...a11y}>
        <div className="dialog-page-head">
          <button type="button" className="icon-button" aria-label={BACK} data-back onClick={onRequestClose}>
            <IconArrowLeft size={20} aria-hidden="true" />
          </button>
          <h2 id={titleId} className="dialog-page-title">
            {title}
          </h2>
        </div>
        <div className="dialog-page-body">{children}</div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    // The dimmed backdrop. A click on it (not on the box) asks to close.
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        // Keep focus where it is: a click on the dim area shouldn't drop focus to the page.
        if (event.target === event.currentTarget) event.preventDefault();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onRequestClose();
      }}
    >
      <div
        ref={boxRef}
        className={`dialog tdialog tdialog--${size}${isConfirm ? ' tdialog--confirm' : ''}`}
        onKeyDown={handleKeyDown}
        {...a11y}
      >
        <h2 id={titleId} className="dialog-title">
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}
