// Rail.jsx — the left navigation column on PC and tablet (the "side panel").
// Why it exists: it lists the dashboard sections. Prospects shows a dark count badge: the new
// sign-ups this person hasn't opened yet (rulebook v0.236, counted per person v0.244).
//   - PC (≥1024px, mouse): 52px wide, icon only; a dark label bubble appears on hover
//     and on keyboard focus.
//   - Tablet (640–1023px, or any touch screen ≥640px): 72px wide, label always shown.
//   - Phone (<640px): hidden — BottomBar.jsx is used instead.
// Panel size (v1.118, lib/panelSize.js) — each person's own choice, from their account menu:
//   - Standard: as above.
//   - Large: 72px with the names under the icons on PC too (no bubble); names 14px.
//   - Largest: 96px, 24px icons, names 14px — on PC and tablet.
// All of that switching is done in CSS (src/styles/app.css, "Rail" section), from the class
// rail--standard / rail--large / rail--largest.
// A window too short for the rail gives it its own scroll: the class rail--scrolls (app.css) turns
// the scroll on and narrows the buttons to the room the scrollbar leaves. A rail that fits gets
// neither, so it is exactly as before. Anything drawn BESIDE the rail — the dark label bubble here,
// Testing's menu in RailMenu.jsx — is drawn above the page at its icon's place (position: fixed),
// so that scroll can never cut it off.
// A section with pages of its own (navItems.js "pages" — Testing, once Star testing exists) is
// drawn by RailMenu.jsx instead: same icon, plus the dark hover menu on mouse devices (v0.59).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { NAV_ITEMS } from './navItems.js';
import RailMenu from './RailMenu.jsx';

const BUBBLE_GAP_PX = 8; // the bubble starts 8px right of its icon (rule 2.3: directly to the right)
const KEEP_IN_VIEW_PX = 8; // room kept round the current section when the rail scrolls to it

// currentPage: the open page inside the current section (e.g. Testing's 'star'), or null.
// badges: { [sectionId]: count } — Prospects' new sign-ups (v0.236).
// size: 'standard' | 'large' | 'largest' — the person's Panel size (v1.118).
// shown: false while the lock screen hides the dashboard (nothing can be measured then).
export default function Rail({ current, currentPage = null, onNavigate, badges = {}, size = 'standard', shown = true }) {
  const railRef = useRef(null);
  const [scrolls, setScrolls] = useState(false); // is the rail too tall for its room right now?

  // Does the rail need its own scroll (its buttons taller than its room)? Checked after every
  // drawing, and whenever the rail's own size changes (the window). flushSync applies the answer
  // before the screen is drawn, so a rail that has just stopped fitting never shows overflowing.
  useLayoutEffect(() => {
    const rail = railRef.current;
    setScrolls(rail.scrollHeight > rail.clientHeight);
  });
  useEffect(() => {
    const rail = railRef.current;
    const observer = new ResizeObserver(() => {
      flushSync(() => setScrolls(rail.scrollHeight > rail.clientHeight));
    });
    observer.observe(rail);
    return () => observer.disconnect();
  }, []);

  // Tell each item where its icon is on the screen (CSS variables --bubble-x / --bubble-y), so its
  // bubble, which is drawn above the page, appears right beside it. Done after every drawing, again
  // whenever the rail scrolls or the window changes size, and for the one item the mouse or the
  // keyboard has just reached (onPointerOver / onFocus below), just before its bubble shows.
  useLayoutEffect(() => {
    placeBubbles(railRef.current);
  });
  function placeBubbleOf(event) {
    const item = event.target.closest?.('.rail-item');
    if (item) placeBubble(item);
  }
  useEffect(() => {
    const rail = railRef.current;
    let frame = 0;
    const later = () => {
      if (!frame) {
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          placeBubbles(rail);
        });
      }
    };
    rail.addEventListener('scroll', later, { passive: true });
    window.addEventListener('resize', later);
    return () => {
      window.cancelAnimationFrame(frame);
      rail.removeEventListener('scroll', later);
      window.removeEventListener('resize', later);
    };
  }, []);

  // After a size change, a page change from somewhere else, the lock screen closing, or the rail
  // starting to scroll, the current section stays in view. Only the rail moves; the page never does.
  useLayoutEffect(() => {
    const rail = railRef.current;
    const item = rail.querySelector('.rail-item.is-current');
    if (!item || !shown || !scrolls) return;
    const room = rail.getBoundingClientRect();
    const box = item.getBoundingClientRect();
    if (box.top < room.top) rail.scrollTop -= room.top - box.top + KEEP_IN_VIEW_PX;
    else if (box.bottom > room.bottom) rail.scrollTop += box.bottom - room.bottom + KEEP_IN_VIEW_PX;
  }, [size, current, shown, scrolls]);

  return (
    <nav
      ref={railRef}
      className={`rail rail--${size}${scrolls ? ' rail--scrolls' : ''}`}
      aria-label="Sections"
      onPointerOver={placeBubbleOf}
      onFocus={placeBubbleOf}
    >
      {NAV_ITEMS.map((item) => {
        const { id, label, Icon } = item;
        const isCurrent = id === current;
        if (item.pages) {
          return <RailMenu key={id} item={item} isCurrent={isCurrent} currentPage={currentPage} onNavigate={onNavigate} />;
        }
        return (
          <button
            key={id}
            type="button"
            className={isCurrent ? 'rail-item is-current' : 'rail-item'}
            aria-label={badges[id] ? `${label}, ${badges[id]} new` : label} // the name a screen reader reads
            aria-current={isCurrent ? 'page' : undefined}
            onClick={() => onNavigate(id)}
          >
            <span className="rail-icon">
              <Icon size={20} aria-hidden="true" />
              {badges[id] > 0 && (
                <span className="nav-badge" aria-hidden="true">
                  {badges[id] > 99 ? '99+' : badges[id]}
                </span>
              )}
            </span>
            {/* On PC (Standard) this is the hover/focus bubble; on tablet, and with Large or Largest,
                it's the label under the icon. aria-hidden because aria-label above gives the name. */}
            <span className="rail-label" aria-hidden="true">
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

// Writes a rail item's bubble position (its icon's middle, and just past its right edge),
// unrounded, so the bubble lands exactly where it did when it was drawn inside the rail.
function placeBubble(item) {
  const box = item.getBoundingClientRect();
  item.style.setProperty('--bubble-x', `${box.right + BUBBLE_GAP_PX}px`);
  item.style.setProperty('--bubble-y', `${box.top + box.height / 2}px`);
}

function placeBubbles(rail) {
  if (!rail) return;
  for (const item of rail.querySelectorAll('.rail-item')) placeBubble(item);
}
