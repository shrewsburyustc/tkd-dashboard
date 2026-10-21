// InnerDialog.jsx — a dialog that opens ON TOP of another dialog: Add / edit testing day and
// Add plan, over Add cycle / Edit cycle.
// Why it exists: approved mockup Cycles 5 — the testing-day dialog opens on top of the cycle
// dialog on PC and tablet (the cycle dialog stays dimmed behind it), and as a second full-screen
// page with ← on phones. The app's Dialog.jsx adds a browser-history step for the Back button;
// two of them stacked would fight over that one step. So this copy of Dialog.jsx has everything
// else (focus moves in, Tab stays inside, Esc / backdrop / ← ask to close, 12px corners) but NO
// history step: the cycle dialog underneath keeps the step, and Back reaches this dialog through
// the cycle editor (useCycleEditor.jsx: "a day is open → ask the day to close first").
//
// It is drawn as a SIBLING of the cycle dialog (not inside it), so its keys and clicks never reach
// the dialog underneath.
//
// Props: title, size ('small' | 'medium' | 'detail' | 'wide'), fullScreen (phones),
//        variant 'form' (default) | 'confirm' (the small "are you sure?" box, never full screen),
//        describedBy (the confirm's sentence), onRequestClose, children
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IconArrowLeft } from '@tabler/icons-react';
import { BACK } from '../text.js';

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export default function InnerDialog({ title, size = 'small', fullScreen = false, variant = 'form', describedBy, onRequestClose, children }) {
  const boxRef = useRef(null);
  const titleId = useId();

  // Opening: focus the field marked data-autofocus (or the back arrow / the box). Closing: the
  // screen puts focus back on what opened it.
  useEffect(() => {
    const box = boxRef.current;
    if (box && !box.contains(document.activeElement)) {
      (box.querySelector('[data-autofocus]') ?? box.querySelector('[data-back]') ?? box).focus();
    }
  }, []);

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onRequestClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const box = boxRef.current;
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
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const isConfirm = variant === 'confirm';
  const a11y = { role: isConfirm ? 'alertdialog' : 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, 'aria-describedby': describedBy, tabIndex: -1 };

  if (fullScreen && !isConfirm) {
    return createPortal(
      <div ref={boxRef} className="dialog-page tdialog-page bb-inner" onKeyDown={handleKeyDown} {...a11y}>
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
    <div
      className="dialog-backdrop dialog-backdrop--top bb-inner"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) event.preventDefault();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onRequestClose();
      }}
    >
      <div ref={boxRef} className={`dialog tdialog tdialog--${size}${isConfirm ? ' tdialog--confirm' : ''}`} onKeyDown={handleKeyDown} {...a11y}>
        <h2 id={titleId} className="dialog-title">
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}
