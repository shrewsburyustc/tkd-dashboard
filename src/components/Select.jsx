// Select.jsx — the shared dropdown: a field that opens a list of choices (one is chosen).
// Why it exists: rulebook v0.51 asks for one custom dropdown with the same look on every device,
// phones included (not the phone's own picker). Star (StarSelect.jsx) and Black Belt
// (SelectField.jsx) each had a copy; this is Star's, the more complete one, made shared in
// Dashboard core step 1 (rulebook v1.100). It is the base of the shared time list (TimeList.jsx,
// M8). StarSelect and Color Belt's FinalAwardSelect stay as they are until their sections switch.
// The look is the .fa-* dropdown in shared.css, plus two rules of its own there: the gray
// placeholder (.sel-field.is-empty) and the 2px blue focus ring on the row the arrow keys are on
// (.sel-list, rule §4, M8 detail a, rulebook v1.109) — today's dropdowns show only a faint gray.
//
// It follows the standard accessible "select-only combobox" pattern (WAI-ARIA):
//   - The field is role="combobox". Focus never leaves it; the list's "active" option is
//     announced with aria-activedescendant.
//   - Closed: ↓ ↑ Enter Space Alt+↓ open it; Home / End open it on the first / last choice;
//     typing opens it and jumps to a choice that starts with what was typed ("s" → Shrewsbury).
//   - Open: ↓ ↑ move (no wrap), Home / End, PageUp / PageDown move 8, Enter or Tab choose and
//     close, Esc closes without changing anything (and does NOT close the dialog), typing jumps.
//   - Mouse / finger: click a choice; click anywhere else to close.
// With nothing chosen yet the field shows the placeholder (e.g. "Choose…") in gray and the list
// opens at the top. With a choice, the list opens with that choice in the middle of the list
// (a long list of times opened at its top would hide the chosen time).
// The list is drawn with position: fixed so the dialog's scrolling box can't cut it off, and it
// stays in the page while closed (hidden), so screen readers can always find it.
//
// Props:
//   id, labelId, describedBy   the field's id, its visible label's id, the hint / error under it
//   value          the chosen value, or null (nothing chosen)
//   options        [{ value, label }]
//   placeholder    shown when value is null ("Choose…")
//   onChange       (value) => void
//   readOnly       true while saving
//   invalid        true when an error is shown under the field
//   autoFocus      true: the dialog puts keyboard focus here when it opens (data-autofocus)
//   matcher        optional: its own way of finding the choice to jump to while typing, instead of
//                  "starts with what was typed" — (typed, fromIndex, options, startIndex) => index
//                  | null. `typed` is everything typed in the last half second ("1", then "10");
//                  fromIndex is the choice the list is on now; startIndex the one it was on when
//                  that typing STARTED (before the "1" of "10" moved it). The time list
//                  (TimeList.jsx) uses it so typing a number jumps to that hour (M8 detail b,
//                  rulebook v1.109). Without it, typing works exactly as before.
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { IconChevronDown } from '@tabler/icons-react';

const PAGE_STEP = 8;
const TYPE_AHEAD_MS = 500;
const LIST_MAX_HEIGHT = 244; // px — the same as FinalAwardSelect: the last visible row is cut in half (the cue there's more)

export default function Select({ id, labelId, describedBy, value, options, placeholder, onChange, readOnly = false, invalid = false, autoFocus = false, matcher = null }) {
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (index) => `${baseId}-o${index}`;
  const fieldRef = useRef(null);
  const listRef = useRef(null);

  const currentIndex = options.findIndex((option) => option.value === value); // -1 = nothing chosen
  const currentLabel = currentIndex >= 0 ? options[currentIndex].label : placeholder;

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState(null); // { top, left, width, maxHeight }
  // What was typed in the last half second, when, and (for the matcher) the choice the list was on
  // when that typing started.
  const typedRef = useRef({ text: '', at: 0, from: -1 });

  function openList(activeIndex) {
    if (readOnly) return;
    setActive(Math.max(0, activeIndex));
    setOpen(true);
  }
  function closeList() {
    setOpen(false);
    setPlace(null);
    typedRef.current = { text: '', at: 0, from: -1 };
  }
  function choose(index) {
    const option = options[index];
    if (option && option.value !== value) onChange(option.value);
    closeList();
  }

  // Under the field, as wide as it; above it when there's no room below.
  useLayoutEffect(() => {
    if (!open) return undefined;
    function placeList() {
      const rect = fieldRef.current.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - 8;
      const above = rect.top - 8;
      const height = Math.min(LIST_MAX_HEIGHT, listRef.current?.scrollHeight ?? LIST_MAX_HEIGHT);
      const goUp = below < Math.min(height, 160) && above > below;
      const maxHeight = Math.min(LIST_MAX_HEIGHT, goUp ? above - 4 : below - 4);
      setPlace({ left: rect.left, width: rect.width, maxHeight, top: goUp ? rect.top - 4 - Math.min(height, maxHeight) : rect.bottom + 4 });
    }
    placeList();
    window.addEventListener('resize', placeList);
    window.addEventListener('scroll', placeList, true);
    return () => {
      window.removeEventListener('resize', placeList);
      window.removeEventListener('scroll', placeList, true);
    };
  }, [open]);

  // Opening: the chosen value in view, in the middle of the list (or the top when nothing is
  // chosen). Done once the list has its place and height; only the list scrolls (not the dialog).
  const placed = place !== null;
  const scrolledForOpenRef = useRef(false);
  useLayoutEffect(() => {
    if (!open) {
      scrolledForOpenRef.current = false;
      return;
    }
    const list = listRef.current;
    if (!placed || !list || scrolledForOpenRef.current) return;
    scrolledForOpenRef.current = true;
    const option = currentIndex >= 0 ? document.getElementById(optionId(currentIndex)) : null;
    list.scrollTop = option ? option.offsetTop - (list.clientHeight - option.offsetHeight) / 2 : 0;
    // Only when it opens; moving with the keyboard scrolls by itself (moveTo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, placed]);

  // A click or tap outside closes it without changing anything.
  useEffect(() => {
    if (!open) return undefined;
    function handlePointerDown(event) {
      const path = event.composedPath();
      if (path.includes(fieldRef.current) || path.includes(listRef.current)) return;
      closeList();
    }
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [open]);

  function moveTo(index) {
    const next = Math.min(Math.max(index, 0), options.length - 1);
    setActive(next);
    window.requestAnimationFrame(() => document.getElementById(optionId(next))?.scrollIntoView({ block: 'nearest' }));
  }

  // Type-ahead: the next choice (after the active one, wrapping) starting with what was typed.
  function typeAhead(character, fromIndex) {
    const now = Date.now();
    const buffer = typedRef.current;
    const fresh = now - buffer.at > TYPE_AHEAD_MS;
    buffer.text = fresh ? character : buffer.text + character;
    if (fresh) buffer.from = fromIndex; // where the list was when this typing started
    buffer.at = now;
    // A screen with its own way of matching (the time list's "a number jumps to that hour").
    if (matcher) {
      const index = matcher(buffer.text, fromIndex, options, buffer.from);
      return Number.isInteger(index) && index >= 0 && index < options.length ? index : null;
    }
    const text = buffer.text.toLowerCase();
    const sameLetter = text.split('').every((letter) => letter === text[0]);
    const search = sameLetter && text.length > 1 ? text[0] : text;
    const start = search.length === 1 ? fromIndex + 1 : fromIndex;
    for (let step = 0; step < options.length; step += 1) {
      const index = (((start + step) % options.length) + options.length) % options.length;
      if (options[index].label.toLowerCase().startsWith(search)) return index;
    }
    return null;
  }

  function handleKeyDown(event) {
    if (readOnly) return;
    const { key, altKey } = event;
    const typing = Date.now() - typedRef.current.at <= TYPE_AHEAD_MS && typedRef.current.text !== '';
    const printable = key.length === 1 && !event.ctrlKey && !event.metaKey && !altKey && (key !== ' ' || typing);

    if (!open) {
      if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Enter' || key === ' ') {
        event.preventDefault();
        openList(currentIndex);
      } else if (key === 'Home') {
        event.preventDefault();
        openList(0);
      } else if (key === 'End') {
        event.preventDefault();
        openList(options.length - 1);
      } else if (printable) {
        event.preventDefault();
        const match = typeAhead(key, currentIndex);
        openList(match ?? currentIndex);
        if (match !== null) moveTo(match);
      }
      return;
    }

    if (key === 'Escape') {
      event.preventDefault();
      event.stopPropagation(); // only the list closes, not the dialog around it
      closeList();
      return;
    }
    if (key === 'Tab') {
      choose(active);
      return;
    }
    if ((altKey && key === 'ArrowUp') || key === 'Enter') {
      event.preventDefault();
      choose(active);
      return;
    }
    let next = null;
    if (key === 'ArrowDown') next = active + 1;
    if (key === 'ArrowUp') next = active - 1;
    if (key === 'Home') next = 0;
    if (key === 'End') next = options.length - 1;
    if (key === 'PageDown') next = active + PAGE_STEP;
    if (key === 'PageUp') next = active - PAGE_STEP;
    if (key === ' ' && !printable) {
      event.preventDefault();
      return;
    }
    if (next !== null) {
      event.preventDefault();
      moveTo(next);
      return;
    }
    if (printable) {
      event.preventDefault();
      const match = typeAhead(key, active);
      if (match !== null) moveTo(match);
    }
  }

  return (
    <div className="fa-select">
      <div
        ref={fieldRef}
        id={id}
        role="combobox"
        tabIndex={0}
        data-autofocus={autoFocus ? true : undefined}
        className={`input fa-field sel-field${open ? ' is-open' : ''}${readOnly ? ' is-readonly' : ''}${currentIndex < 0 ? ' is-empty' : ''}`}
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        aria-haspopup="listbox"
        aria-expanded={open ? 'true' : 'false'}
        aria-controls={listId}
        aria-activedescendant={open ? optionId(active) : undefined}
        aria-readonly={readOnly ? 'true' : undefined}
        aria-invalid={invalid ? 'true' : undefined}
        onKeyDown={handleKeyDown}
        onClick={() => (open ? closeList() : openList(currentIndex))}
      >
        <span className="fa-value">{currentLabel}</span>
        {/* ti-chevron-down = open the list */}
        <IconChevronDown size={16} aria-hidden="true" className="fa-chevron" />
      </div>
      {/* The list stays in the page while closed (hidden) so aria-controls always points at it. */}
      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        aria-labelledby={labelId}
        className="fa-list sel-list"
        hidden={!open}
        style={place ? { top: place.top, left: place.left, width: place.width, maxHeight: place.maxHeight } : undefined}
      >
        {options.map((option, index) => (
          <li
            key={option.value}
            id={optionId(index)}
            role="option"
            aria-selected={option.value === value ? 'true' : 'false'}
            className={`fa-option${index === active ? ' is-active' : ''}${option.value === value ? ' is-selected' : ''}`}
            // mousedown preventDefault keeps focus on the field
            onMouseDown={(event) => event.preventDefault()}
            onMouseMove={() => {
              if (active !== index) setActive(index);
            }}
            onClick={() => choose(index)}
          >
            {option.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
