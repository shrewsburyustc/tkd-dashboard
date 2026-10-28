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
// Where focus goes after closing is decided by the screen (contract 0003 §8.5), not here (only
// a dialog on top, below, puts focus back in the dialog underneath when it would otherwise be lost).
//
// PC / tablet position (decided v0.80): the box sits a fixed distance from the TOP of the screen
// instead of in the middle, so when a message appears inside it ("Unsaved changes…") only what's
// below the message moves down — the buttons above don't jump away from the pointer.
//
// Every device (v0.83; phones since v0.56): an open dialog adds an entry to the browser's
// history, so the browser's Back button (or the phone's) does the same as Esc / the back arrow —
// including the unsaved-changes guard — instead of leaving the page behind it.
//
// A dialog ON TOP of another dialog (onTop, rulebook v1.100; e.g. an "are you sure?" box opened
// from a dialog): it adds NO history step of its own — two steps would fight, and one Back press
// would reach both dialogs. The dialog underneath keeps its step, and when Back uses it up, the
// dialog underneath asks the one on top to close first (backButton.js: openTopLayer /
// closeTopLayer). Esc and a click outside reach only the dialog on top; it is drawn above the
// other one (shared.css .dialog-on-top); and when it closes, focus goes back to the dialog
// underneath (to what opened it, if it's still there), unless the screen put it somewhere itself.
// Without onTop (every dialog until a section switches) nothing of this happens.
//
// AccountDialog.jsx (Change PIN / Change password) is a separate, older frame and stays as it is.
//
// Props:
//   title           text of the heading
//   ariaLabel       optional: a different name for screen readers (e.g. "Yellow, view only")
//   variant         'form' (default) | 'confirm'
//   size            'small' (360px, default) | 'detail' (440px, view-only rank) |
//                   'medium' (520px, edit rank on tablets) | 'wide' (760px, edit rank on the PC)
//   The Cancel / Save row is pinned to the bottom of the dialog (shared.css), so it never
//   ends up below the fold on a short screen.
//   fullScreen      true on phones (form dialogs only)
//   onRequestClose  Esc / backdrop click / back arrow
//   describedBy     optional id of the text that explains the dialog (used by 'confirm')
//   onTop           true: this dialog opens on top of another Dialog (see above). Default false.
//   returnFocusTo   optional, with onTop only: the element focus goes back to when this dialog
//                   closes (the button that opened it — the section has it as event.currentTarget).
//                   Needed because Safari / iPadOS (and Firefox on macOS) don't focus a clicked or
//                   tapped button, so "what had focus when it opened" can be the dialog underneath.
//                   Left out, the dialog uses what had focus when it opened, as before.
//   className       optional extra class(es) on the box (PC / tablet) and on the phone page, for a
//                   shared part's own look (e.g. the receipt's 560px box). Default: none.
//   busy            optional: true while the dialog's action works (e.g. the Compare dialog's
//                   "Keeping…", rulebook v1.102): the phone page's back arrow shows the gray
//                   unavailable look (aria-disabled, still focusable). Esc, a click outside, Back
//                   and the arrow still call onRequestClose; the screen ignores them while busy.
//                   Default false.
//   children        the content
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconArrowLeft } from '@tabler/icons-react';
import { BACK } from './text.js';
import { closeTopLayer, dialogStep, openTopLayer } from '../lib/backButton.js';

// Everything a person can Tab to. (A disabled button or a tabIndex="-1" element can't be.)
// (select / textarea added for the Schedule's Class and Day dropdowns.)
const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export default function Dialog({
  title,
  ariaLabel,
  variant = 'form',
  size = 'small',
  fullScreen = false,
  onRequestClose,
  describedBy,
  onTop = false,
  returnFocusTo = null,
  className = '',
  busy = false,
  children,
}) {
  const boxRef = useRef(null);
  const titleId = useId();
  const isConfirm = variant === 'confirm';
  const asPage = fullScreen && !isConfirm; // the delete confirmation is never full screen
  // On top of another dialog: what had focus when this one opened (in the dialog underneath).
  // Read once, while drawing the first time — before this dialog takes the focus.
  const [opener] = useState(() => (onTop ? document.activeElement : null));

  // Opening: move focus inside, to [data-autofocus] (the first field). A phone page with no
  // field (the view-only rank) starts on its back arrow; otherwise the box itself.
  useEffect(() => {
    const box = boxRef.current;
    if (box && !box.contains(document.activeElement)) {
      (box.querySelector('[data-autofocus]') ?? box.querySelector('[data-back]') ?? box).focus();
    }
  }, []);

  // A message that appears inside the box ("Unsaved changes…", "Couldn't save…") may land below
  // the visible part on a short screen, behind the pinned Cancel / Save row. Scroll it into view
  // (shared.css gives it room above that row). "MutationObserver" = a browser helper that
  // reports when elements are added inside the box.
  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof MutationObserver === 'undefined') return undefined;
    const observer = new MutationObserver((changes) => {
      for (const change of changes) {
        for (const node of change.addedNodes) {
          if (!(node instanceof Element)) continue;
          const notice = node.matches('.notice') ? node : node.querySelector('.notice');
          if (notice) {
            // A note in the pinned bottom area (.dialog-footer, v0.81) is already in view:
            // scrolling would only push the fields the person is working on out of sight.
            if (!notice.closest('.dialog-footer')) notice.scrollIntoView({ block: 'nearest' });
            return;
          }
        }
      }
    });
    observer.observe(box, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  // ----- Browser / phone Back button (history) -----
  // Newest onRequestClose in a ref, for the 'popstate' listener below.
  const onRequestCloseRef = useRef(onRequestClose);
  useEffect(() => {
    onRequestCloseRef.current = onRequestClose;
  });
  useEffect(() => {
    // On top of another dialog: no history step of our own. The dialog underneath keeps its step
    // and, when Back uses it up, asks this one to close first (closeTopLayer in its handleBack).
    if (onTop) return openTopLayer(() => onRequestCloseRef.current());
    // A token unique to this opening, so we only ever remove our OWN entry later.
    const token = `${titleId}-${Date.now()}-${Math.random()}`;
    const marker = { tkdDialog: token };
    // pushState adds a history entry without leaving the page. (If a previous dialog's entry
    // is still on top — e.g. it closed a moment ago — reuse it instead of stacking another.)
    if (window.history.state?.tkdDialog) window.history.replaceState(marker, '');
    else window.history.pushState(marker, '');
    const release = dialogStep(token); // App.jsx: this step is in use (backButton.js)

    function handleBack() {
      // The Back button just used up our entry. Put it back (the dialog may stay open with
      // "Unsaved changes…"), then ask to close exactly like the back arrow does — or, while a
      // dialog is open on top of this one (onTop), ask THAT one to close instead.
      window.history.pushState(marker, '');
      if (closeTopLayer()) return;
      onRequestCloseRef.current();
    }
    window.addEventListener('popstate', handleBack);
    return () => {
      release();
      window.removeEventListener('popstate', handleBack);
      // Closed some other way (Save, back arrow, lock…): remove our entry so the next Back
      // press doesn't land on an empty step. Done a moment later, and only if our entry is
      // still on top, so a dialog that immediately opens again keeps its entry.
      window.setTimeout(() => {
        if (window.history.state?.tkdDialog === token) window.history.back();
      }, 0);
    };
  }, [titleId, onTop]);

  // On top of another dialog, closing: if focus fell to the page (the focused element went away
  // with this dialog), put it back in the dialog underneath — on the screen's returnFocusTo, else
  // on what opened this one if it's still there, otherwise on that dialog's box. A screen that
  // moved focus itself keeps its choice. (The newest returnFocusTo is kept in a ref, so a new
  // value never runs this "closing" step early.)
  const returnFocusRef = useRef(returnFocusTo);
  useEffect(() => {
    returnFocusRef.current = returnFocusTo;
  });
  useEffect(() => {
    if (!onTop) return undefined;
    return () => {
      const active = document.activeElement;
      if (active && active !== document.body && active.isConnected) return; // focus is somewhere
      const back = returnFocusRef.current;
      if (back?.isConnected) back.focus();
      else if (opener?.isConnected) opener.focus();
      else [...document.querySelectorAll('[aria-modal="true"]')].pop()?.focus();
    };
  }, [onTop, opener]);

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

  // The optional extra class(es), with the space in front (nothing at all without them, so every
  // dialog that doesn't ask keeps exactly the classes it had).
  const extra = className ? ` ${className}` : '';

  if (asPage) {
    return createPortal(
      <div ref={boxRef} className={`dialog-page tdialog-page${onTop ? ' dialog-on-top' : ''}${extra}`} onKeyDown={handleKeyDown} {...a11y}>
        <div className="dialog-page-head">
          <button
            type="button"
            className={`icon-button${busy ? ' is-unavailable' : ''}`}
            aria-label={BACK}
            aria-disabled={busy ? 'true' : undefined}
            data-back
            onClick={onRequestClose}
          >
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
      className={`dialog-backdrop dialog-backdrop--top${onTop ? ' dialog-on-top' : ''}`}
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
        className={`dialog tdialog tdialog--${size}${isConfirm ? ' tdialog--confirm' : ''}${extra}`}
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
