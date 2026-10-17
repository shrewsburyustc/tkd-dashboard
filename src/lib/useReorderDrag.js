// useReorderDrag.js — drag a row by its grip handle to change the order (every device).
// Why it exists: decided v0.43, widened v0.63 — ranks and classes are reordered by dragging the
// grip (ti-grip-vertical) with a mouse, a finger or a pen, on PC, tablet and phone. Only the
// grip starts a drag: the grip has `touch-action: none` (testing.css), so a finger on it drags
// instead of scrolling the page, while a finger anywhere else on the row still scrolls.
// The keyboard way stays ⋯ → Move up / Move down.
// Written by hand with "pointer events" (the browser's mouse/finger/pen events) so the app
// needs no extra drag-and-drop package.
//
// What the person sees (contract 0003 §8.9):
//   - Press the grip with the left mouse button and move at least 4px: the drag starts.
//   - The row "lifts": a gray copy of it appears IN the list at the spot where it will land,
//     under a 2px blue line, and the original row is faded (approved mockup screen 6). Until
//     the mouse has moved past a neighbour, the row simply lifts in place. Text selection is
//     switched off meanwhile.
//   - Near the top or bottom edge of the scrolling area (48px) the list scrolls by itself — but
//     only as far as the dragged item's own list (its class's ranks / the class list) goes.
//   - Let go on a new spot → onDrop(group, id, newIndex). Same spot → nothing happens.
//   - Esc, the browser cancelling the pointer, the window losing focus, or `enabled` turning
//     false (screen locked, a save on its way) → the drag is cancelled, nothing changes.
//
// The rows tell the hook who they are with two HTML attributes:
//   data-drag-group="<group>"  e.g. a class id (its ranks) or "classes" (the class lines)
//   data-drag-id="<id>"        the item's id
// The screen draws the lifted copy and the line itself, from `drag.state` (gap / toIndex).
//
// Usage:
//   const drag = useReorderDrag({ enabled, onDrop });
//   <button {...drag.gripProps('classes', cls.id)} />
//   drag.state → null, or { group, id, fromIndex, toIndex, gap }
//     gap      = how many items are above the pointer (where the copy + line go, 0…n)
//     toIndex  = the new position if dropped now (same as fromIndex = "not moved")
import { useCallback, useEffect, useRef, useState } from 'react';

const START_DISTANCE_PX = 4; // the mouse must move this far before a drag starts
const EDGE_PX = 48; // auto-scroll zone at the top and bottom of the scrolling area
const MAX_SCROLL_STEP_PX = 12; // fastest auto-scroll, per animation frame

// The items of one group, top to bottom, as they are on the page right now.
function itemsOf(group) {
  return Array.from(document.querySelectorAll(`[data-drag-group="${CSS.escape(group)}"]`));
}

// The nearest parent that scrolls (the page content area), or null.
function scrollParentOf(element) {
  let node = element?.parentElement ?? null;
  while (node) {
    const style = window.getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return null;
}

export function useReorderDrag({ enabled, onDrop }) {
  const [state, setState] = useState(null);

  // Live values for the event listeners (refs don't wait for a re-render).
  const pressRef = useRef(null); // { group, id, startX, startY, pointerId } after pointerdown
  const dragRef = useRef(null); // the current drag (same shape as `state`, plus offsets)
  const pointerYRef = useRef(0);
  const frameRef = useRef(0); // auto-scroll animation frame id
  const onDropRef = useRef(onDrop);
  useEffect(() => {
    onDropRef.current = onDrop;
  });

  // Ends everything: listeners, auto-scroll, the "no text selection" switch, the state.
  const stop = useCallback(() => {
    pressRef.current = null;
    dragRef.current = null;
    window.cancelAnimationFrame(frameRef.current);
    document.documentElement.classList.remove('is-reordering');
    setState(null);
  }, []);

  // Works out the landing spot ("gap" = how many items are above the pointer), then draws it.
  // (The lifted copy itself has no data-drag-group, so it's never counted.)
  const update = useCallback(() => {
    const drag = dragRef.current;
    if (!drag) return;
    const y = pointerYRef.current;
    const items = itemsOf(drag.group);
    let gap = 0;
    for (const item of items) {
      const rect = item.getBoundingClientRect();
      if (y > rect.top + rect.height / 2) gap += 1;
    }
    // Dropping into the gap just above or just below itself = the same spot.
    const toIndex = gap > drag.fromIndex ? gap - 1 : gap;
    const next = { group: drag.group, id: drag.id, fromIndex: drag.fromIndex, gap, toIndex };
    dragRef.current = { ...drag, ...next };
    setState(next);
  }, []);

  // Auto-scroll while the pointer is near the top or bottom edge of the scrolling area.
  const autoScroll = useCallback(() => {
    const drag = dragRef.current;
    if (!drag) return;
    const area = drag.scrollArea;
    if (area) {
      const rect = area.getBoundingClientRect();
      const y = pointerYRef.current;
      // Only scroll while the dragged item's OWN list (its class's ranks, or the class list)
      // still goes on past the edge — never scroll away from the place it can land.
      const items = itemsOf(drag.group);
      const groupTop = items.length ? items[0].getBoundingClientRect().top : rect.top;
      const groupBottom = items.length ? items[items.length - 1].getBoundingClientRect().bottom : rect.bottom;
      let step = 0;
      if (y < rect.top + EDGE_PX && groupTop < rect.top) {
        step = -Math.ceil(((rect.top + EDGE_PX - y) / EDGE_PX) * MAX_SCROLL_STEP_PX);
      } else if (y > rect.bottom - EDGE_PX && groupBottom > rect.bottom) {
        step = Math.ceil(((y - (rect.bottom - EDGE_PX)) / EDGE_PX) * MAX_SCROLL_STEP_PX);
      }
      if (step !== 0) {
        area.scrollTop += step;
        update();
      }
    }
    frameRef.current = window.requestAnimationFrame(autoScroll);
  }, [update]);

  // Window-wide listeners while the mouse button is down on a grip.
  useEffect(() => {
    function handleMove(event) {
      const press = pressRef.current;
      if (!press || event.pointerId !== press.pointerId) return;
      pointerYRef.current = event.clientY;
      if (!dragRef.current) {
        // Not dragging yet: start only after the mouse moved a few pixels (a plain click on the
        // grip does nothing).
        const moved = Math.hypot(event.clientX - press.startX, event.clientY - press.startY);
        if (moved < START_DISTANCE_PX) return;
        const items = itemsOf(press.group);
        const item = items.find((element) => element.getAttribute('data-drag-id') === press.id);
        if (!item) {
          stop();
          return;
        }
        dragRef.current = {
          group: press.group,
          id: press.id,
          fromIndex: items.indexOf(item),
          scrollArea: scrollParentOf(item),
        };
        document.documentElement.classList.add('is-reordering'); // text selection off (testing.css)
        frameRef.current = window.requestAnimationFrame(autoScroll);
      }
      update();
    }

    function handleUp(event) {
      const press = pressRef.current;
      if (!press || event.pointerId !== press.pointerId) return;
      const drag = dragRef.current;
      stop();
      if (drag && drag.toIndex !== undefined && drag.toIndex !== drag.fromIndex) {
        onDropRef.current(drag.group, drag.id, drag.toIndex);
      }
    }

    function handleCancel() {
      if (pressRef.current) stop();
    }

    function handleKey(event) {
      if (event.key === 'Escape' && pressRef.current) {
        event.preventDefault();
        event.stopPropagation(); // Esc here only cancels the drag
        stop();
      }
    }

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleCancel);
    window.addEventListener('blur', handleCancel);
    window.addEventListener('keydown', handleKey, true);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleCancel);
      window.removeEventListener('blur', handleCancel);
      window.removeEventListener('keydown', handleKey, true);
    };
  }, [autoScroll, stop, update]);

  // Screen locked, a save started, or the person became view-only: cancel any drag.
  useEffect(() => {
    if (!enabled && pressRef.current) stop();
  }, [enabled, stop]);

  // Leaving the page in the middle of a drag: clean up.
  useEffect(() => stop, [stop]);

  const gripProps = useCallback(
    (group, id) => ({
      onPointerDown: (event) => {
        // Mouse (left button), finger or pen — and only when dragging is allowed right now.
        if (!enabled || event.button !== 0 || !event.isPrimary) return;
        event.preventDefault(); // no text selection (or long-press menu) starting from the grip
        pressRef.current = { group, id, startX: event.clientX, startY: event.clientY, pointerId: event.pointerId };
        pointerYRef.current = event.clientY;
      },
    }),
    [enabled],
  );

  return { state, gripProps };
}
