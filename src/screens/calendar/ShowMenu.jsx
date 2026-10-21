// ShowMenu.jsx — the Calendar's "Show" button and its menu of tick boxes (rulebook v0.613-v0.615).
// Why it exists: every kind of Calendar item (classes, closures, events, free classes, follow-ups)
// can be hidden, and with more kinds coming a row of switches would not fit — so it is ONE compact
// button that opens a list.
//   - The button: ti-filter, "Show", and — only while something is hidden — a "4 of 5" badge.
//   - PC and tablet: a dropdown under the button, right edges lined up (above it if no room).
//   - Phone: a sheet from the bottom with a title, the tick boxes, "Show everything" and "Done".
// It copies the look, placement and keyboard rules of the ⋯ menu (components/RowMenu.jsx, which
// about 30 screens use and is NOT changed): ↑/↓/Home/End move, Enter/Space tick, Esc / Tab / a
// click outside close it and give focus back to the button. Unlike the ⋯ menu, ticking does NOT
// close it, and it takes effect at once (no Save).
//
// Props:
//   kinds      [{ key, label }]            (showKinds.js KINDS)
//   hidden     Set of hidden keys
//   isSheet    true on phones
//   full       true = full-width button (phone)
//   onToggle   (key) => void               onShowAll () => void
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconCheck, IconChevronDown, IconChevronUp, IconFilter } from '@tabler/icons-react';
import { shownCount } from '../../lib/calendar/showKinds.js';
import * as T from './text.js';

const MENU_WIDTH = 280; // px, as mocked up
const GAP = 4; // px between the button and the dropdown

export default function ShowMenu({ kinds, hidden, isSheet, full = false, onToggle, onShowAll }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const count = shownCount(hidden);
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`btn cshow-btn${full ? ' cshow-btn--full' : ''}`}
        data-cal-show
        aria-haspopup="menu"
        aria-expanded={open ? 'true' : 'false'}
        aria-label={count ? T.showButtonLabel(count.shown, count.total) : T.SHOW}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="cshow-btn-main">
          <IconFilter size={16} aria-hidden="true" />
          {T.SHOW}
        </span>
        <span className="cshow-btn-end">
          {count && <span className="cshow-badge">{T.showBadge(count.shown, count.total)}</span>}
          {open ? <IconChevronUp size={16} aria-hidden="true" /> : <IconChevronDown size={16} aria-hidden="true" />}
        </span>
      </button>
      {open && (
        <ShowPanel
          anchor={buttonRef.current}
          kinds={kinds}
          hidden={hidden}
          isSheet={isSheet}
          onToggle={onToggle}
          onShowAll={onShowAll}
          onClose={(reason) => {
            setOpen(false);
            if (reason !== 'outside') buttonRef.current?.focus();
          }}
        />
      )}
    </>
  );
}

function ShowPanel({ anchor, kinds, hidden, isSheet, onToggle, onShowAll, onClose }) {
  const panelRef = useRef(null);
  const [position, setPosition] = useState(null); // { top, left } for the dropdown
  const allShown = hidden.size === 0;

  // Newest onClose in a ref so the document listener below never calls a stale one.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Dropdown position: under the button, right edges lined up; above it if there's no room.
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
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [anchor, isSheet]);

  // Once it is in place: focus the first tick box (only once).
  const ready = isSheet || position !== null;
  const focusedRef = useRef(false);
  useEffect(() => {
    if (!ready || focusedRef.current) return;
    focusedRef.current = true;
    panelRef.current?.querySelector('[role="menuitemcheckbox"]')?.focus();
  }, [ready]);

  // A click or tap outside the menu (and outside its button) closes it.
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
    event.stopPropagation(); // drawn in a portal: keep keys from reaching the page behind
    const list = Array.from(panelRef.current.querySelectorAll('[role="menuitemcheckbox"], [role="menuitem"]'));
    const index = list.indexOf(document.activeElement);
    let next = null;
    if (event.key === 'ArrowDown') next = index + 1 >= list.length ? 0 : index + 1;
    if (event.key === 'ArrowUp') next = index <= 0 ? list.length - 1 : index - 1;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = list.length - 1;
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      onClose(event.key === 'Escape' ? 'escape' : 'tab');
      return;
    }
    if (next !== null) {
      event.preventDefault();
      list[next].focus();
    }
  }

  const rows = (
    <>
      {kinds.map((kind) => {
        const on = !hidden.has(kind.key);
        return (
          <button
            key={kind.key}
            type="button"
            role="menuitemcheckbox"
            aria-checked={on ? 'true' : 'false'}
            tabIndex={-1}
            className="menu-item tmenu-item cshow-item"
            data-show-kind={kind.key}
            onClick={() => onToggle(kind.key)}
          >
            <span className={`cshow-box${on ? ' is-on' : ''}`} aria-hidden="true">
              {on && <IconCheck size={14} stroke={3} />}
            </span>
            <span>{kind.label}</span>
          </button>
        );
      })}
      <div role="separator" className="menu-separator" />
      <button
        type="button"
        role="menuitem"
        tabIndex={-1}
        aria-disabled={allShown ? 'true' : undefined}
        className={`menu-item tmenu-item cshow-all${allShown ? ' is-disabled' : ''}`}
        onClick={() => {
          if (!allShown) onShowAll();
        }}
      >
        {T.SHOW_EVERYTHING}
      </button>
    </>
  );

  if (isSheet) {
    return createPortal(
      <div className="tsheet-wrap" onClick={(event) => event.stopPropagation()}>
        <div className="tsheet-backdrop" aria-hidden="true" />
        <div ref={panelRef} className="tsheet" onKeyDown={handleKeyDown}>
          <div className="account-grab" aria-hidden="true" />
          <div className="tsheet-head">
            <p className="tsheet-title">{T.SHOW_TITLE}</p>
          </div>
          <div role="menu" aria-label={T.SHOW_TITLE}>
            {rows}
            <div role="separator" className="menu-separator" />
            <button type="button" role="menuitem" tabIndex={-1} className="menu-item tmenu-cancel cshow-done" onClick={() => onClose('escape')}>
              {T.DONE}
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
      className="tmenu cshow-menu"
      role="menu"
      aria-label={T.SHOW_TITLE}
      style={position ? { top: position.top, left: position.left, width: MENU_WIDTH } : { top: -9999, left: -9999, width: MENU_WIDTH }}
      onKeyDown={handleKeyDown}
      onClick={(event) => event.stopPropagation()}
    >
      <p className="cshow-head" aria-hidden="true">
        {T.SHOW_TITLE}
      </p>
      {rows}
    </div>,
    document.body,
  );
}
