// useRowArrowNav.js — move through a list with the arrow keys (guidelines 3.6 / v0.52).
// Why it exists: on the PC, ↑ ↓ move a visible focus outline from row to row, Enter opens the
// row, and Tab moves between AREAS of the page (it doesn't stop on every row and every little
// button). Built first for Classes and ranks; every later list can reuse it.
//
// How it works ("roving tab index"):
//   - The list is ONE Tab stop: exactly one row (the last one used, or the first) has
//     tabIndex 0; every other row has tabIndex -1, so Tab jumps past the list.
//   - The buttons inside a row (Edit, ⋯, …) are only in the Tab order while their row is the
//     active one (itemTabIndex). ← → move between the row and its buttons.
//   - ↑ ↓ move to the next / previous row in page order (crossing from one class into the
//     next; collapsed classes have no rank rows on the page, so they're skipped). No wrap-around.
//   - Enter on a row that isn't itself a button opens it (onOpen). On a button, Enter just
//     presses the button, as usual.
// The arrows only work inside a row — never in a field, a menu or a dialog.
//
// Two HTML attributes mark things up (spread the props below):
//   data-nav-group="<key>"  the row's box (everything that belongs to that row)
//   data-nav-row="<key>"    the element that gets focus for the row (often the box itself)
//
// Usage:
//   const nav = useRowArrowNav({ rowKeys, onOpen });
//   <div {...nav.containerProps}>
//     <div {...nav.rowProps(key)}> … <button tabIndex={nav.itemTabIndex(key)} /> </div>   (a row)
//     <div {...nav.groupProps(key)}> <button {...nav.targetProps(key)} /> … </div>        (a line whose main control is a button)
//   rowKeys: every row's key, in page order
//   onOpen(key): Enter on a row
import { useCallback, useRef, useState } from 'react';

const ROW = 'data-nav-row';
const GROUP = 'data-nav-group';

// Is it actually on screen? (Hidden elements have no boxes.)
const visible = (element) => element.getClientRects().length > 0;

export function useRowArrowNav({ rowKeys, onOpen }) {
  const [lastKey, setLastKey] = useState(null); // the row that last had focus
  const containerRef = useRef(null);

  // The active row: the last used one if it's still on the page, else the first.
  const activeKey = rowKeys.includes(lastKey) ? lastKey : (rowKeys[0] ?? null);

  const handleKeyDown = useCallback(
    (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const group = target?.closest(`[${GROUP}]`);
      if (!group || !containerRef.current?.contains(group)) return;

      // Enter on a row that isn't a button: open it.
      if (event.key === 'Enter' && target.hasAttribute(ROW) && target.tagName !== 'BUTTON') {
        event.preventDefault();
        onOpen(target.getAttribute(ROW));
        return;
      }

      // ← → : between the row and its own buttons (in the order they appear).
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const items = [group, ...group.querySelectorAll(`[${ROW}], button`)].filter(
          (element) => (element.hasAttribute(ROW) || element.tagName === 'BUTTON') && visible(element),
        );
        const index = items.indexOf(target);
        const next = event.key === 'ArrowRight' ? items[index + 1] : items[index - 1];
        if (index !== -1 && next) {
          event.preventDefault();
          next.focus();
        }
        return;
      }

      // ↑ ↓ : to the next / previous row on the page.
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault(); // stop the page from scrolling by itself
      const current = group.hasAttribute(ROW) ? group : group.querySelector(`[${ROW}]`);
      const rows = Array.from(containerRef.current.querySelectorAll(`[${ROW}]`)).filter(visible);
      const index = rows.indexOf(current);
      const next = event.key === 'ArrowDown' ? rows[index + 1] : rows[index - 1];
      if (next) {
        next.focus();
        next.scrollIntoView({ block: 'nearest' });
      }
    },
    [onOpen],
  );

  // Focus anywhere inside a row (the row or one of its buttons) makes it the active row.
  const onGroupFocus = (key) => () => setLastKey(key);

  return {
    activeKey,
    containerProps: { ref: containerRef, onKeyDown: handleKeyDown },
    // A row that is its own focus target (a rank row).
    rowProps: (key) => ({
      [ROW]: key,
      [GROUP]: key,
      tabIndex: key === activeKey ? 0 : -1,
      onFocus: onGroupFocus(key),
    }),
    // A line whose focus target is a button inside it (a class line → its open/close button).
    groupProps: (key) => ({ [GROUP]: key, onFocus: onGroupFocus(key) }),
    targetProps: (key) => ({ [ROW]: key, tabIndex: key === activeKey ? 0 : -1 }),
    // The other buttons of a row: in the Tab order only while their row is active.
    itemTabIndex: (key) => (key === activeKey ? 0 : -1),
  };
}
