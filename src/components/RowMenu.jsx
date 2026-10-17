// RowMenu.jsx — the ⋯ ("More actions") menu of a rank or class row.
// Why it exists: rows show at most 2–3 visible actions (guidelines 8); the rest live here:
// Move up, Move down, and — after a separator, in red — Delete rank / Delete class.
//   - PC and tablet: a small dropdown under the ⋯ button, right-aligned with it. Near the
//     bottom of the screen it opens upward instead, so it's never cut off.
//   - Phone: a sheet that slides up from the bottom (like the account menu), with a header
//     naming the item, 44px rows, and a Cancel row at the end.
// It's drawn into document.body (a "portal") so no scrolling box can clip it.
//
// Keyboard: focus moves to the first available item; ↑/↓/Home/End move between items
// (unavailable ones are announced as "dimmed" via aria-disabled but can still be reached);
// Enter/Space choose; Esc closes and puts focus back on the ⋯ button; Tab closes.
// A click outside closes it too.
//
// Props:
//   anchor    the ⋯ button element (for positioning and to give focus back)
//   isSheet   true on phones
//   title     sheet header line 1 (phone)       subtitle  sheet header line 2 (phone)
//   label     accessible name of the menu, e.g. "More actions for Yellow"
//   items     [{ key, label, Icon, onSelect, disabled, danger, separatorBefore }]
//   onClose   (reason) => void — reason 'escape' | 'outside' | 'select' | 'tab'
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CANCEL } from '../screens/testing/text.js';

const MENU_WIDTH = 200; // px, as mocked up
const GAP = 4; // px between the ⋯ button and the dropdown

export default function RowMenu({ anchor, isSheet, title, subtitle, label, items, onClose }) {
  const panelRef = useRef(null);
  const [position, setPosition] = useState(null); // { top, left } for the dropdown

  // Newest onClose in a ref so the document listeners below never call a stale one.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Dropdown position: under the ⋯ button, right edges lined up; above it if there's no room.
  useLayoutEffect(() => {
    if (isSheet || !anchor) return undefined;
    function place() {
      const rect = anchor.getBoundingClientRect();
      const height = panelRef.current?.offsetHeight ?? 0;
      let top = rect.bottom + GAP;
      if (top + height > window.innerHeight - 8 && rect.top - GAP - height > 8) top = rect.top - GAP - height;
      const left = Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
      setPosition({ top, left });
    }
    place();
    // Follow the button if the page scrolls (true = also scrolling boxes inside the page).
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [anchor, isSheet]);

  // When it opens (and, for the dropdown, once it has its place): focus the first item that
  // can be chosen. focusedRef makes sure this happens only once.
  const ready = isSheet || position !== null;
  const focusedRef = useRef(false);
  useEffect(() => {
    if (!ready || focusedRef.current) return;
    focusedRef.current = true;
    const all = Array.from(panelRef.current?.querySelectorAll('[role="menuitem"]') ?? []);
    (all.find((item) => item.getAttribute('aria-disabled') !== 'true') ?? all[0])?.focus();
  }, [ready]);

  // A click or tap anywhere outside the menu (and outside its ⋯ button) closes it.
  useEffect(() => {
    function handlePointerDown(event) {
      const path = event.composedPath();
      if (path.includes(panelRef.current) || (anchor && path.includes(anchor))) return;
      onCloseRef.current('outside');
    }
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [anchor]);

  function handleKeyDown(event) {
    // The menu is drawn in a portal, but React still passes its events up to the row it
    // belongs to. Stop them here so arrow keys don't also move between rows.
    event.stopPropagation();
    const list = Array.from(panelRef.current.querySelectorAll('[role="menuitem"]'));
    const index = list.indexOf(document.activeElement);
    let next = null;
    if (event.key === 'ArrowDown') next = index + 1 >= list.length ? 0 : index + 1;
    if (event.key === 'ArrowUp') next = index <= 0 ? list.length - 1 : index - 1;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = list.length - 1;
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose('escape');
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      onClose('tab');
      return;
    }
    if (next !== null) {
      event.preventDefault();
      list[next].focus();
    }
  }

  function choose(item) {
    if (item.disabled) return; // gray item: nothing happens (it stays focusable for screen readers)
    onClose('select');
    item.onSelect();
  }

  const menuItems = items.map((item) => (
    <div key={item.key}>
      {item.separatorBefore && <div role="separator" className="menu-separator" />}
      <button
        type="button"
        role="menuitem"
        tabIndex={-1}
        aria-disabled={item.disabled ? 'true' : undefined}
        className={`menu-item tmenu-item${item.danger ? ' tmenu-item--danger' : ''}${item.disabled ? ' is-disabled' : ''}`}
        onClick={() => choose(item)}
      >
        <item.Icon size={16} aria-hidden="true" className="menu-icon" />
        <span>{item.label}</span>
      </button>
    </div>
  ));

  if (isSheet) {
    return createPortal(
      // onClick stopPropagation: same portal reason as in handleKeyDown.
      <div className="tsheet-wrap" onClick={(event) => event.stopPropagation()}>
        <div className="tsheet-backdrop" aria-hidden="true" />
        <div ref={panelRef} className="tsheet" onKeyDown={handleKeyDown}>
          <div className="account-grab" aria-hidden="true" />
          <div className="tsheet-head">
            <p className="tsheet-title">{title}</p>
            {subtitle && <p className="tsheet-sub">{subtitle}</p>}
          </div>
          <div role="menu" aria-label={label}>
            {menuItems}
            <div role="separator" className="menu-separator" />
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              className="menu-item tmenu-cancel"
              onClick={() => onClose('escape')}
            >
              {CANCEL}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      ref={panelRef}
      className="tmenu"
      role="menu"
      aria-label={label}
      style={position ? { top: position.top, left: position.left } : { top: -9999, left: -9999 }}
      onKeyDown={handleKeyDown}
      onClick={(event) => event.stopPropagation()}
    >
      {menuItems}
    </div>,
    document.body,
  );
}
