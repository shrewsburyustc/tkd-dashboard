// GradeCell.jsx — one grade dropdown of Black Belt grading: a cell of the Grading grid, or the
// dropdown on a subject line of the phone card (contract 0025 §14.2; G 12, G 17).
// Why it exists: copied from Star's GradeCell (src/screens/testing/star/grading/GradeCell.jsx, Star
// v0.125 / v0.512): every grade is a dropdown drawn by the app, the same list on every device, D in
// amber, built as the accessible "select-only combobox". Black Belt's changes:
//   * the list is the PART's letters (Technical, Curriculum, Other: A+ A A- B+ B B- C C- D; Physical:
//     A+ A B+ B C D) followed by "Clear" (G 12) — choosing the cell's own grade does nothing new;
//     Clear empties it;
//   * an empty hand-in cell after the hand-in date shows an amber "Late" (G 17: nothing is saved —
//     it is worked out from the date); it opens the normal list, D included;
//   * at 320px wide the list opens as a bottom sheet with 44px items and Cancel (G02a's drawing).
//
// Keyboard (as Star): closed — Enter, Space or Alt+↓ open it (a card line also ↓ / ↑); every other
// key goes to the parent (the grid's arrows and typed letters). Open — ↓ ↑ Home End move, Enter
// chooses, Esc or Tab close without changing anything, a letter jumps to the next choice with it.
//
// Props:
//   variant    'grid' (a table cell) | 'line' (a field on a card line)
//   value      the letter shown, or null      letters   the part's letters in order
//   state      the save engine's state: null | 'saving' | 'saved' | 'unsaved' | 'retrying'
//   retest     a make-up's retest subject: 1px blue outline (v0.947)
//   late       an empty hand-in cell after the hand-in date: amber "Late"
//   tabStop, label, listLabel, sheetTitle, sheetSub, open, onOpenChange(open), onChoose(letter|null),
//   onKeyDown(event), onFocus(), dataCell, asSheet (true: the bottom sheet instead of the list)
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconAlertTriangle, IconChevronDown } from '@tabler/icons-react';
import * as T from './text.js';

const LIST_MIN_WIDTH = 80;
const LIST_MAX_HEIGHT = 10 * 44 + 8; // nine letters and Clear, even with 44px touch rows

export default function GradeCell({
  variant = 'grid',
  value,
  letters,
  state = null,
  retest = false,
  late = false,
  tabStop = true,
  label,
  listLabel,
  sheetTitle,
  sheetSub,
  asSheet = false,
  open,
  onOpenChange,
  onChoose,
  onKeyDown,
  onFocus,
  dataCell,
}) {
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (index) => `${baseId}-o${index}`;
  const fieldRef = useRef(null);
  const listRef = useRef(null);
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState(null);
  // The choices: the letters, then Clear (null).
  const choices = [...letters, null];
  const currentIndex = letters.indexOf(value);
  const unsaved = state === 'unsaved' || state === 'retrying';
  const empty = value === null || value === undefined;

  function openList() {
    setActive(Math.max(0, currentIndex));
    onOpenChange(true);
  }
  function closeList() {
    onOpenChange(false);
    setPlace(null);
  }
  function choose(index) {
    closeList();
    if (index < 0 || index >= choices.length) return;
    const letter = choices[index];
    if (letter === null && empty) return; // Clear on an empty cell: nothing to do
    onChoose(letter);
  }

  // The list goes under the cell (above it when there's no room below).
  useLayoutEffect(() => {
    if (!open || asSheet) return undefined;
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
  }, [open, asSheet]);

  // A click or tap outside closes it without changing anything.
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
    const next = Math.min(Math.max(index, 0), choices.length - 1);
    setActive(next);
    window.requestAnimationFrame(() => document.getElementById(optionId(next))?.scrollIntoView({ block: 'nearest' }));
  }

  function handleKeyDown(event) {
    const { key, altKey } = event;
    if (!open) {
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
      event.stopPropagation();
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
    if (key === 'End') next = choices.length - 1;
    if (next !== null) {
      event.preventDefault();
      moveTo(next);
      return;
    }
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

  const showLate = late && empty;
  const classes = [
    variant === 'grid' ? 'bbg-cell' : 'input fa-field bbg-linefield',
    value === 'D' ? 'is-d' : '',
    empty ? 'is-empty' : '',
    showLate ? 'is-late' : '',
    unsaved ? 'is-unsaved' : '',
    retest ? 'is-retest' : '',
    open ? 'is-open' : '',
  ].filter(Boolean).join(' ');

  let shown;
  if (!empty) shown = value;
  else if (showLate) shown = T.LATE;
  else if (variant === 'grid') shown = <span className="bbg-cell-dot" aria-hidden="true">{T.EMPTY_CELL}</span>;
  else shown = <span className="bbg-choose">{T.CHOOSE}</span>;

  const options = choices.map((letter, index) => (
    <li
      key={letter ?? 'clear'}
      id={optionId(index)}
      role="option"
      aria-selected={letter !== null && letter === value ? 'true' : 'false'}
      className={[
        'fa-option',
        index === active ? 'is-active' : '',
        letter !== null && letter === value ? 'is-selected' : '',
        letter === 'D' ? 'bbg-option-d' : '',
        letter === null ? 'bbg-option-clear' : '',
      ].filter(Boolean).join(' ')}
      onMouseDown={(event) => event.preventDefault()}
      onMouseMove={() => {
        if (active !== index) setActive(index);
      }}
      onClick={() => choose(index)}
    >
      {letter ?? T.CLEAR}
    </li>
  ));

  return (
    <>
      <div
        ref={fieldRef}
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
        <span className="bbg-cell-value">{shown}</span>
        {/* ti-alert-triangle = Not saved (the Result column / the line under the subject says so too) */}
        {unsaved && <IconAlertTriangle size={12} aria-hidden="true" className="bbg-cell-warn" />}
        {/* ti-chevron-down = open the list (card lines only) */}
        {variant === 'line' && <IconChevronDown size={16} aria-hidden="true" className="fa-chevron" />}
      </div>
      {open && !asSheet && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={listLabel}
          className="fa-list bbg-list"
          style={place ? { top: place.top, left: place.left, width: place.width, maxHeight: place.maxHeight } : { top: -9999, left: -9999 }}
        >
          {options}
        </ul>
      )}
      {/* 320px: the same choices in a bottom sheet (G02a), drawn into <body> over the page */}
      {open && asSheet && createPortal(
        <div className="tsheet-wrap">
          <div className="tsheet-backdrop" aria-hidden="true" onClick={closeList} />
          <div ref={listRef} className="tsheet bbg-gradesheet">
            <div className="account-grab" aria-hidden="true" />
            {sheetTitle && (
              <div className="tsheet-head">
                <p className="tsheet-title">{sheetTitle}</p>
                {sheetSub && <p className="tsheet-sub">{sheetSub}</p>}
              </div>
            )}
            <ul id={listId} role="listbox" aria-label={listLabel} className="bbg-sheetlist">
              {options}
            </ul>
            <div role="separator" className="menu-separator" />
            <button type="button" className="menu-item tmenu-cancel" onMouseDown={(event) => event.preventDefault()} onClick={closeList}>
              {T.CANCEL}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
