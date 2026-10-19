// useCardDrag.js — dragging a Board card to another stage (rulebook v0.214, choice B).
// Why it exists: on the Board, moving a child should be one move, on every device:
//   - mouse (PC): press and move the card a few pixels — the drag starts
//   - touch / pen (tablet, phone): press and HOLD the card (0.45 s), then drag it. A finger that
//     moves before then is a normal scroll, so swiping the columns sideways still works.
// It uses "pointer events" (one set of browser events for mouse, touch and pen) rather than the
// browser's built-in drag and drop, which doesn't work with fingers.
// While a card is dragged, a copy of it follows the pointer; whatever is under the pointer with a
// data-drop-status attribute (a Board column, a stage in the bar, a phone stage tile) lights up.
// Letting go there calls onDrop(item, code, statusId). Esc, or letting go anywhere else, puts
// the card back. Near the edge of the board (or the page) it scrolls, so far columns are
// reachable. Keyboard users move a child with the status tag in the panel instead.
import { useCallback, useEffect, useRef, useState } from 'react';

const HOLD_MS = 450; // how long a finger must rest on a card before it can be dragged
const MOUSE_SLOP = 6; // pixels the mouse must move before a press becomes a drag
const TOUCH_SLOP = 10; // a finger moving more than this before the hold ends = scrolling
const EDGE = 48; // pixels from an edge where dragging scrolls
const SPEED = 14;

// The nearest parent that scrolls up and down (the page itself if none)
function scrollParent(el) {
  for (let n = el?.parentElement; n; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return n;
  }
  return document.scrollingElement;
}

export function useCardDrag({ enabled, resetKey, onDrop }) {
  const [drag, setDrag] = useState(null); // { id, label, x, y, dx, dy, width }
  const st = useRef(null); // the press / drag in progress
  const suppressClick = useRef(false);
  const endedAt = useRef(0); // when the last drag ended (a finger drag must not also count as a swipe)
  const onDropRef = useRef(onDrop);
  useEffect(() => {
    onDropRef.current = onDrop;
  });

  const clearOver = () => {
    st.current?.over?.classList.remove('is-drop-over');
    if (st.current) st.current.over = null;
  };

  const stop = useCallback((drop) => {
    const s = st.current;
    if (!s) return;
    window.clearTimeout(s.timer);
    window.cancelAnimationFrame(s.raf);
    window.removeEventListener('pointermove', s.move);
    window.removeEventListener('pointerup', s.up);
    window.removeEventListener('pointercancel', s.cancel);
    window.removeEventListener('keydown', s.key, true);
    document.removeEventListener('touchmove', s.touch);
    document.removeEventListener('contextmenu', s.menu, true);
    const target = s.over;
    clearOver();
    s.el.classList.remove('is-held');
    st.current = null;
    if (s.started) {
      setDrag(null);
      document.body.classList.remove('is-card-dragging');
      // the click the browser sends after letting go must not open the card
      suppressClick.current = true;
      endedAt.current = Date.now();
      const release = () => window.setTimeout(() => {
        suppressClick.current = false;
      }, 50);
      // ended by letting go: the click comes right after. Ended by Esc: wait for the button to come up.
      if (drop) release();
      else window.addEventListener('pointerup', release, { once: true, capture: true });
      if (drop && target) {
        const statusId = target.getAttribute('data-drop-status');
        const code = target.getAttribute('data-drop-code');
        if (statusId && code === s.code && statusId !== s.item.statusId) onDropRef.current(s.item, s.code, statusId);
      }
    }
  }, []);

  // A drag in progress ends if the Board goes away (lock, school switch, view switch)
  useEffect(() => () => stop(false), [stop]);
  useEffect(() => {
    if (!enabled) stop(false);
  }, [enabled, stop]);
  // ... and when the school changes
  useEffect(() => () => stop(false), [resetKey, stop]);

  function findTarget(x, y) {
    const el = document.elementFromPoint(x, y)?.closest('[data-drop-status]');
    return el && el.getAttribute('data-drop-code') === st.current.code ? el : null;
  }

  function begin() {
    const s = st.current;
    if (!s) return;
    s.started = true;
    const r = s.el.getBoundingClientRect();
    const width = Math.min(r.width, 200);
    // mouse: the copy stays where it was grabbed. Finger: it floats just above the fingertip, so
    // the stage being dropped on stays visible.
    s.dx = s.touch ? 32 : Math.min(s.startX - r.left, width - 16);
    s.dy = s.touch ? 64 : s.startY - r.top;
    s.el.classList.remove('is-held');
    document.body.classList.add('is-card-dragging');
    navigator.vibrate?.(12); // a small buzz on phones that support it: "you can drag now"
    setDrag({ id: s.item.id, label: s.label, x: s.x, y: s.y, dx: s.dx, dy: s.dy, width });
    // scroll near the edges, every frame while dragging
    const tick = () => {
      const t = st.current;
      if (!t || !t.started) return;
      const box = t.board?.getBoundingClientRect();
      if (box && t.board.scrollWidth > t.board.clientWidth) {
        if (t.x < box.left + EDGE) t.board.scrollLeft -= SPEED;
        else if (t.x > box.right - EDGE) t.board.scrollLeft += SPEED;
      }
      const page = t.page;
      if (page) {
        const top = page === document.scrollingElement ? 0 : page.getBoundingClientRect().top;
        const bottom = page === document.scrollingElement ? window.innerHeight : page.getBoundingClientRect().bottom;
        if (t.y < top + EDGE) page.scrollTop -= SPEED;
        else if (t.y > bottom - EDGE) page.scrollTop += SPEED;
      }
      t.raf = window.requestAnimationFrame(tick);
    };
    s.raf = window.requestAnimationFrame(tick);
  }

  // The props a card gets: <button {...cardProps(item, code, label)}>
  function cardProps(item, code, label) {
    return {
      onPointerDown: (e) => {
        if (!enabled || st.current || e.button !== 0 || !e.isPrimary) return;
        const el = e.currentTarget;
        const touch = e.pointerType !== 'mouse';
        const s = {
          item, code, label, el, touch, started: false, over: null, timer: 0, raf: 0,
          startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY,
          board: el.closest('[data-board-scroll]'), page: scrollParent(el),
        };
        s.move = (ev) => {
          if (ev.pointerId !== e.pointerId) return;
          s.x = ev.clientX;
          s.y = ev.clientY;
          const far = Math.hypot(s.x - s.startX, s.y - s.startY);
          if (!s.started) {
            if (!touch && far > MOUSE_SLOP) begin();
            else if (touch && far > TOUCH_SLOP) stop(false); // the finger is scrolling
            return;
          }
          ev.preventDefault();
          const target = findTarget(s.x, s.y);
          if (target !== s.over) {
            clearOver();
            if (target) target.classList.add('is-drop-over');
            s.over = target;
          }
          setDrag((d) => (d ? { ...d, x: s.x, y: s.y } : d));
        };
        s.up = (ev) => ev.pointerId === e.pointerId && stop(true);
        s.cancel = (ev) => ev.pointerId === e.pointerId && stop(false);
        s.key = (ev) => {
          if (ev.key === 'Escape' && s.started) {
            ev.preventDefault();
            ev.stopPropagation();
            stop(false);
          }
        };
        // once a finger drag has started, the page must not scroll under it
        s.touch = (ev) => {
          if (s.started && ev.cancelable) ev.preventDefault();
        };
        // a long press would otherwise open the phone's "copy / share" menu
        s.menu = (ev) => {
          if (touch) ev.preventDefault();
        };
        st.current = s;
        window.addEventListener('pointermove', s.move, { passive: false });
        window.addEventListener('pointerup', s.up);
        window.addEventListener('pointercancel', s.cancel);
        window.addEventListener('keydown', s.key, true);
        document.addEventListener('touchmove', s.touch, { passive: false });
        document.addEventListener('contextmenu', s.menu, true);
        if (touch) {
          el.classList.add('is-held');
          s.timer = window.setTimeout(begin, HOLD_MS);
        }
      },
      onClickCapture: (e) => {
        if (suppressClick.current) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
    };
  }

  // true while dragging and just after (Board.jsx skips a swipe then)
  const busyDragging = () => Boolean(st.current?.started) || Date.now() - endedAt.current < 400;
  return { drag, cardProps, dragging: drag !== null, busyDragging };
}
