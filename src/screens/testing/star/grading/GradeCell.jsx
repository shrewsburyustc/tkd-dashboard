// GradeCell.jsx — one grade dropdown of Star testing grading: a cell of the Grading grid, or the
// dropdown on a subject line of a one-candidate card (phones, the private grading page).
// Why it exists: rulebook v0.125 makes every grade a dropdown, and proposal 28 (v0.512) asks for it
// to be built like the custom dropdown of v0.51 (StarSelect.jsx / Color Belt's FinalAwardSelect.jsx):
// the SAME list on every device (not the phone's own picker), accessible, D in amber. It reuses that
// dropdown's look (the .fa-* classes in testing.css: 44px list items on touch screens).
//
// The accessible pattern is the "select-only combobox" (WAI-ARIA), as StarSelect:
//   - the cell is role="combobox"; focus never leaves it while the list is open; the list's active
//     choice is announced with aria-activedescendant;
//   - closed: Enter, Space or Alt+↓ open it (on a card line also ↓ / ↑). Every other key goes to the
//     parent (onKeyDown): the grid moves with the arrows and takes typed letters (proposal 28);
//   - open: ↓ ↑ Home End move, Enter chooses, Esc or Tab close without changing anything, a letter
//     jumps to the next choice starting with it ("b" → B+, then B);
//   - mouse / finger: click the cell to open, click a choice; a click anywhere else closes it.
// What a choice MEANS (choosing the cell's own grade again clears it, v0.125) is decided by the
// parent (onChoose gets the letter that was clicked). Only one list is open at a time, so the list
// is drawn only while open (a grid has up to ~100 cells).
//
// Props:
//   variant    'grid' (a table cell's button) | 'line' (a 92px field on a card line)
//   value      the letter the cell shows, or null
//   letters    the event's grade letters in order (A+ … D)
//   state      the save engine's state: null | 'saving' | 'saved' | 'unsaved' | 'retrying'
//   retest     a make-up's retest subject: 1px blue outline (v0.129, proposal 29)
//   tabStop    true: this cell is the grid's Tab stop (roving tabindex); a line is always a stop
//   label      the accessible name ("Noah Chen, Breaking: D, not saved")
//   listLabel  the list's name ("Grade for Breaking")
//   open, onOpenChange(open)   the parent keeps which cell's list is open
//   onChoose(letter)           a choice in the list
//   onKeyDown(event)           keys the cell doesn't use itself (the grid's arrows and typing)
//   onFocus(), cellRef         the grid's selection / focus moves
//   dataCell                   a "rowId|categoryId" marker so the grid can find the cell again
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { IconAlertTriangle, IconChevronDown } from '@tabler/icons-react';
import * as T from './text.js';

const LIST_MIN_WIDTH = 80; // px — wide enough for "A+" with its padding
const LIST_MAX_HEIGHT = 7 * 44 + 8; // every letter fits, even with 44px touch rows

export default function GradeCell({
  variant = 'grid',
  value,
  letters,
  state = null,
  retest = false,
  tabStop = true,
  label,
  listLabel,
  open,
  onOpenChange,
  onChoose,
  onKeyDown,
  onFocus,
  cellRef,
  dataCell,
}) {
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (index) => `${baseId}-o${index}`;
  const fieldRef = useRef(null);
  const listRef = useRef(null);
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState(null); // { top, left, width, maxHeight }
  const currentIndex = letters.indexOf(value);
  const unsaved = state === 'unsaved' || state === 'retrying';

  function setField(element) {
    fieldRef.current = element;
    if (typeof cellRef === 'function') cellRef(element);
  }

  function openList() {
    setActive(Math.max(0, currentIndex));
    onOpenChange(true);
  }
  function closeList() {
    onOpenChange(false);
    setPlace(null);
  }
  function choose(index) {
    const letter = letters[index];
    closeList();
    if (letter) onChoose(letter);
  }

  // Under the cell (above it when there's no room below); at least LIST_MIN_WIDTH wide.
  useLayoutEffect(() => {
    if (!open) return undefined;
    function placeList() {
      const field = fieldRef.current;
      if (!field) return;
      const rect = field.getBoundingClientRect();
      const height = Math.min(LIST_MAX_HEIGHT, listRef.current?.scrollHeight ?? LIST_MAX_HEIGHT);
      const below = window.innerHeight - rect.bottom - 8;
      const above = rect.top - 8;
      const goUp = below < height && above > below;
      const maxHeight = Math.min(LIST_MAX_HEIGHT, goUp ? above - 4 : below - 4);
      const width = Math.max(rect.width, LIST_MIN_WIDTH);
      const left = Math.min(rect.left, window.innerWidth - width - 8);
      setPlace({ left: Math.max(8, left), width, maxHeight, top: goUp ? rect.top - 4 - Math.min(height, maxHeight) : rect.bottom + 4 });
    }
    placeList();
    window.addEventListener('resize', placeList);
    window.addEventListener('scroll', placeList, true);
    return () => {
      window.removeEventListener('resize', placeList);
      window.removeEventListener('scroll', placeList, true);
    };
  }, [open]);

  // A click or tap outside the cell and its list closes it without changing anything.
  useEffect(() => {
    if (!open) return undefined;
    function handlePointerDown(event) {
      const path = event.composedPath();
      if (path.includes(fieldRef.current) || path.includes(listRef.current)) return;
      onOpenChange(false);
      setPlace(null);
    }
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [open, onOpenChange]);

  function moveTo(index) {
    const next = Math.min(Math.max(index, 0), letters.length - 1);
    setActive(next);
    window.requestAnimationFrame(() => document.getElementById(optionId(next))?.scrollIntoView({ block: 'nearest' }));
  }

  function handleKeyDown(event) {
    const { key, altKey } = event;
    if (!open) {
      // The parent goes first (e.g. Enter right after a typed letter moves on instead of opening).
      onKeyDown?.(event);
      if (event.defaultPrevented) return;
      const opens = key === 'Enter' || key === ' ' || (altKey && key === 'ArrowDown')
        || (variant === 'line' && (key === 'ArrowDown' || key === 'ArrowUp'));
      if (opens) {
        event.preventDefault();
        openList();
      }
      return;
    }
    if (key === 'Escape') {
      event.preventDefault();
      event.stopPropagation(); // only the list closes (not a dialog or the kept note around it)
      closeList();
      return;
    }
    if (key === 'Tab') {
      closeList();
      return;
    }
    if (key === 'Enter' || key === ' ' || (altKey && key === 'ArrowUp')) {
      event.preventDefault();
      choose(active);
      return;
    }
    let next = null;
    if (key === 'ArrowDown') next = active + 1;
    if (key === 'ArrowUp') next = active - 1;
    if (key === 'Home') next = 0;
    if (key === 'End') next = letters.length - 1;
    if (next !== null) {
      event.preventDefault();
      moveTo(next);
      return;
    }
    // A letter jumps to the next choice that starts with it (wrapping): "b" → B+, then B.
    if (key.length === 1 && /[a-z]/i.test(key) && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      const wanted = key.toUpperCase();
      for (let step = 1; step <= letters.length; step += 1) {
        const index = (active + step) % letters.length;
        if (letters[index].startsWith(wanted)) {
          moveTo(index);
          break;
        }
      }
    }
  }

  const classes = [
    variant === 'grid' ? 'stg-cell' : 'input fa-field stg-linefield',
    value === 'D' ? 'is-d' : '',
    value === null || value === undefined ? 'is-empty' : '',
    unsaved ? 'is-unsaved' : '',
    retest ? 'is-retest' : '',
    open ? 'is-open' : '',
  ].filter(Boolean).join(' ');

  return (
    <>
      <div
        ref={setField}
        role="combobox"
        tabIndex={tabStop ? 0 : -1}
        className={classes}
        data-grade-cell={dataCell}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open ? 'true' : 'false'}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? optionId(active) : undefined}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        onClick={() => (open ? closeList() : openList())}
      >
        <span className="stg-cell-value">
          {value ?? (variant === 'grid' ? <span className="stg-cell-dot" aria-hidden="true">{T.EMPTY_CELL}</span> : <span className="stg-choose">{T.CHOOSE}</span>)}
        </span>
        {/* ti-alert-triangle = Not saved (text says so too: the Result column / the line under the subject) */}
        {unsaved && <IconAlertTriangle size={12} aria-hidden="true" className="stg-cell-warn" />}
        {/* ti-chevron-down = open the list (card lines only; grid cells are too small for it) */}
        {variant === 'line' && <IconChevronDown size={16} aria-hidden="true" className="fa-chevron" />}
      </div>
      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={listLabel}
          className="fa-list stg-list"
          style={place ? { top: place.top, left: place.left, width: place.width, maxHeight: place.maxHeight } : { top: -9999, left: -9999 }}
        >
          {letters.map((letter, index) => (
            <li
              key={letter}
              id={optionId(index)}
              role="option"
              aria-selected={letter === value ? 'true' : 'false'}
              className={`fa-option${index === active ? ' is-active' : ''}${letter === value ? ' is-selected' : ''}${letter === 'D' ? ' stg-option-d' : ''}`}
              // mousedown preventDefault keeps keyboard focus on the cell
              onMouseDown={(event) => event.preventDefault()}
              onMouseMove={() => {
                if (active !== index) setActive(index);
              }}
              onClick={() => choose(index)}
            >
              {letter}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
