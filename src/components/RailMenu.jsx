// RailMenu.jsx — a rail icon whose section has pages of its own (today: Testing, once Star testing
// exists), with the dark hover menu beside it (rulebook v0.59).
// Why it exists: v0.59 decided a "hybrid" for sections with sub-pages:
//   - Clicking / tapping the icon (every device) opens the section's choice page, like any rail icon.
//   - With a MOUSE (CSS "hover: hover"), resting the pointer on the icon for 150ms opens a dark menu
//     beside it instead of the plain label bubble: the heading ("Testing"), then the pages. The
//     page you're on is highlighted (blue tint); the one under the pointer gets a gray step.
//     Clicking a name goes straight there. The menu closes about 300ms after the pointer has left
//     both the icon and the menu (so crossing the small gap between them doesn't close it).
//   - KEYBOARD: focus on the icon opens the menu; ↓ moves into it (↑ / ↓ move between the names,
//     ↑ on the first name goes back to the icon); Enter on the icon opens the choice page; Esc closes.
//   - TOUCH devices never see the menu: a tap always opens the choice page (rule 2.5: nothing may be
//     hover-only — the choice page shows the same choices).
// This is a recorded exception to rule 2.3: the label bubble grows into a menu.
//
// The ARIA "menu button" pattern is used: the icon says it has a menu (aria-haspopup, aria-expanded),
// the names are role="menuitem" and are reached with the arrow keys, not Tab (Tab leaves the menu).
//
// Props:
//   item         the nav item from navItems.js: { id, label, Icon, pages: [{ key, label, Icon }] }
//   isCurrent    is this section open?
//   currentPage  the open page's key (e.g. 'star'), or null (e.g. on the choice page: none is current)
//   onNavigate(id, { testingPage })   App.jsx's navigate
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useMediaQuery } from '../lib/useMediaQuery.js';
import '../styles/rail-menu.css';

const OPEN_DELAY_MS = 150; // v0.59 (the same 150ms as the label bubble, rule 2.3)
const CLOSE_DELAY_MS = 300; // v0.59: "about 300ms after the pointer leaves both icon and menu"
// A device whose main pointer can hover (a mouse or trackpad). Touch screens answer "no".
const HOVER_QUERY = '(hover: hover)';

export default function RailMenu({ item, isCurrent, currentPage, onNavigate }) {
  const { id, label, Icon, pages } = item;
  const canHover = useMediaQuery(HOVER_QUERY);
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null); // the icon + the menu together
  const iconRef = useRef(null);
  const itemRefs = useRef([]);
  const timerRef = useRef(null); // the pending open or close (only one at a time)
  // true while WE move focus back onto the icon (after Esc or choosing a page): that focus must
  // not open the menu again.
  const quietFocusRef = useRef(false);
  // true after a click on the icon: the menu stays shut until the pointer leaves and comes back.
  const clickedRef = useRef(false);
  // true when ↓ asked for the first name before the menu was drawn.
  const focusFirstRef = useRef(false);

  const clearTimer = useCallback(() => {
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);
  const later = useCallback(
    (fn, ms) => {
      clearTimer();
      timerRef.current = window.setTimeout(fn, ms);
    },
    [clearTimer],
  );
  const close = useCallback(() => {
    clearTimer();
    setOpen(false);
  }, [clearTimer]);

  // No timer may outlive the component.
  useEffect(() => clearTimer, [clearTimer]);
  // A different page opened (by any route): the menu has done its job.
  useEffect(() => close(), [isCurrent, currentPage, close]);
  // The device lost its mouse (e.g. a tablet's keyboard cover detached): no menu any more.
  useEffect(() => {
    if (!canHover) close();
  }, [canHover, close]);

  // Esc closes the menu wherever focus is (v0.59) — e.g. it was opened by the mouse alone.
  useEffect(() => {
    if (!open) return undefined;
    function onKey(event) {
      if (event.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  // ↓ opened a closed menu: once it is drawn, focus its first name.
  useEffect(() => {
    if (!open || !focusFirstRef.current) return;
    focusFirstRef.current = false;
    itemRefs.current[0]?.focus();
  }, [open]);

  // Focus the icon without re-opening the menu.
  function focusIconQuietly() {
    quietFocusRef.current = true;
    iconRef.current?.focus();
    quietFocusRef.current = false;
  }

  function focusItem(index) {
    const count = pages.length;
    itemRefs.current[(index + count) % count]?.focus();
  }

  // ----- Mouse -----
  function handlePointerEnter(event) {
    if (!canHover || event.pointerType === 'touch') return; // a finger never opens the menu
    if (clickedRef.current) return;
    if (open) clearTimer(); // came back in time: stay open
    else later(() => setOpen(true), OPEN_DELAY_MS);
  }
  function handlePointerLeave(event) {
    if (event.pointerType === 'touch') return;
    clickedRef.current = false;
    // Keep it open while the keyboard is inside the menu.
    if (open && wrapRef.current?.contains(document.activeElement) && document.activeElement !== iconRef.current) {
      clearTimer();
      return;
    }
    if (open) later(() => setOpen(false), CLOSE_DELAY_MS);
    else clearTimer(); // left before it opened
  }

  // ----- The icon -----
  function handleIconClick() {
    clickedRef.current = true;
    close();
    onNavigate(id); // the section's default page: the choice page (v0.59)
  }
  function handleIconFocus(event) {
    if (!canHover || quietFocusRef.current) return;
    // Only keyboard focus opens it (":focus-visible" is the browser's own "came from the keyboard").
    if (event.currentTarget.matches(':focus-visible')) {
      clearTimer();
      setOpen(true);
    }
  }
  function handleIconKeyDown(event) {
    if (!canHover) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      clearTimer();
      if (open) {
        focusItem(0); // already drawn (focus or the mouse opened it): straight in
      } else {
        focusFirstRef.current = true; // drawn by the next render: the effect below focuses it
        setOpen(true);
      }
    } else if (event.key === 'Escape') {
      close();
    }
  }

  // ----- The menu -----
  function choose(page) {
    close();
    focusIconQuietly(); // the menu is gone: keep keyboard focus on the rail
    onNavigate(id, { testingPage: page.key });
  }
  function handleItemKeyDown(event, index) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusItem(index + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (index === 0) focusIconQuietly();
      else focusItem(index - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusItem(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusItem(pages.length - 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      focusIconQuietly();
    }
  }

  // Focus left the icon and the menu altogether (Tab, or a click elsewhere): close.
  function handleBlur(event) {
    if (event.relatedTarget && wrapRef.current?.contains(event.relatedTarget)) return;
    if (wrapRef.current?.matches(':hover')) return; // the mouse is still on it: the mouse decides
    close();
  }

  const menuShown = open && canHover;

  return (
    <div
      ref={wrapRef}
      className="rail-menu-wrap"
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onBlur={handleBlur}
    >
      <button
        ref={iconRef}
        type="button"
        className={`rail-item${isCurrent ? ' is-current' : ''}${canHover ? ' has-menu' : ''}`}
        aria-label={label} // the name a screen reader reads; matches the label and the menu heading
        aria-current={isCurrent ? 'page' : undefined}
        aria-haspopup={canHover ? 'menu' : undefined}
        aria-expanded={canHover ? menuShown : undefined}
        aria-controls={menuShown ? menuId : undefined}
        onClick={handleIconClick}
        onFocus={handleIconFocus}
        onKeyDown={handleIconKeyDown}
      >
        <span className="rail-icon">
          <Icon size={20} aria-hidden="true" />
        </span>
        {/* Tablet: the label under the icon. PC: the hover bubble — hidden for this icon while the
            menu exists (has-menu, app.css), because the menu's heading says the same. */}
        <span className="rail-label" aria-hidden="true">
          {label}
        </span>
      </button>
      {menuShown && (
        <div id={menuId} className="rail-menu" role="menu" aria-label={label}>
          <div className="rail-menu-heading" aria-hidden="true">
            {label}
          </div>
          {pages.map((page, index) => {
            const current = isCurrent && page.key === currentPage;
            const PageIcon = page.Icon;
            return (
              <button
                key={page.key}
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className={`rail-menu-item${current ? ' is-current' : ''}`}
                aria-current={current ? 'page' : undefined}
                onClick={() => choose(page)}
                onKeyDown={(event) => handleItemKeyDown(event, index)}
              >
                <PageIcon size={16} aria-hidden="true" />
                {page.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
