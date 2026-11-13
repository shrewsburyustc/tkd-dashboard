// RankSelect.jsx — the Rank dropdown of Add / Edit student: one long list of every rank, each with its belt picture.
// Why it exists: the shared Select (components/Select.jsx) can only show text in its list, but the approved picture
// ("The Rank list, open") shows a belt picture beside every name, in the closed field too. This is that Select
// with one addition, a belt per choice; it keeps the same markup (fa-select / sel-field / fa-list / fa-option, so
// the look is the app's own) and the same keyboard and screen-reader behaviour (WAI-ARIA "select-only combobox"):
//   closed  ↓ ↑ Enter Space open it · Home / End open it on the first / last · typing jumps to a rank that starts
//           with what was typed
//   open    ↓ ↑ move · Home / End · PageUp / PageDown move 8 · Enter or Tab choose · Esc closes only the list (not
//           the dialog) · typing jumps · a click chooses, a click anywhere else closes
// The list is drawn with position: fixed so the dialog's scrolling box can't cut it off.
//
// Props: id, labelId, describedBy, value (a rank name or null), options [{ value, label, belt }] (belt = the shape
//   components/Belt.jsx takes), placeholder, onChange(value), readOnly (while saving), invalid, autoFocus.
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { IconChevronDown } from '@tabler/icons-react';
import Belt from '../../../components/Belt.jsx';

const PAGE_STEP = 8;
const TYPE_AHEAD_MS = 500;
const LIST_MAX_HEIGHT = 244;

export default function RankSelect({ id, labelId, describedBy, value, options, placeholder, onChange, readOnly = false, invalid = false, autoFocus = false }) {
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (index) => `${baseId}-o${index}`;
  const fieldRef = useRef(null);
  const listRef = useRef(null);
  const typedRef = useRef({ text: '', at: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState(null); // { top, left, width, maxHeight }

  const currentIndex = options.findIndex((o) => o.value === value); // -1 = nothing chosen
  const current = currentIndex >= 0 ? options[currentIndex] : null;

  function openList(index) {
    if (readOnly) return;
    setActive(Math.max(0, index));
    setOpen(true);
  }
  function closeList() {
    setOpen(false);
    setPlace(null);
    typedRef.current = { text: '', at: 0 };
  }
  function choose(index) {
    const option = options[index];
    if (option && option.value !== value) onChange(option.value);
    closeList();
  }

  // Under the field, as wide as it; above it when there is no room below.
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

  // Opening: the chosen rank in the middle of the list (the top when nothing is chosen).
  const placed = place !== null;
  const scrolledRef = useRef(false);
  useLayoutEffect(() => {
    if (!open) {
      scrolledRef.current = false;
      return;
    }
    const list = listRef.current;
    if (!placed || !list || scrolledRef.current) return;
    scrolledRef.current = true;
    const option = currentIndex >= 0 ? document.getElementById(optionId(currentIndex)) : null;
    list.scrollTop = option ? option.offsetTop - (list.clientHeight - option.offsetHeight) / 2 : 0;
    // Only when it opens (moving with the keyboard scrolls by itself, in moveTo).
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

  // Type-ahead: the next rank (after the active one, wrapping) that starts with what was typed.
  function typeAhead(character, fromIndex) {
    const now = Date.now();
    const buffer = typedRef.current;
    buffer.text = now - buffer.at > TYPE_AHEAD_MS ? character : buffer.text + character;
    buffer.at = now;
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
        className={`input fa-field sel-field${open ? ' is-open' : ''}${readOnly ? ' is-readonly' : ''}${current ? '' : ' is-empty'}`}
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
        <span className="fa-value brk-rankvalue">
          {current && <Belt belt={current.belt} />}
          <span>{current ? current.label : placeholder}</span>
        </span>
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
            className={`fa-option brk-opt${index === active ? ' is-active' : ''}${option.value === value ? ' is-selected' : ''}`}
            onMouseDown={(event) => event.preventDefault()} // keeps focus on the field
            onMouseMove={() => {
              if (active !== index) setActive(index);
            }}
            onClick={() => choose(index)}
          >
            <Belt belt={option.belt} />
            <span>{option.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
