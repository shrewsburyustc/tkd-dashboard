// SelectField.jsx — a custom dropdown (Start time, End time, Place) for the testing-day dialog.
// Why it exists: rulebook v0.51 — dropdowns are drawn by the app, the same on every device
// (phones too, not the phone's own picker), and follow the standard accessible "select-only
// combobox" pattern (WAI-ARIA). It is a smaller cousin of Color Belt's FinalAwardSelect.jsx
// (flat list, no group headings), kept in Black Belt's own folder so neither can break the other.
//
// How it works for the keyboard and screen readers:
//   - The field is role="combobox" and keeps focus; the highlighted option is announced through
//     aria-activedescendant (it points at the option's id).
//   - Closed: ↓ ↑ Enter Space Alt+↓ open it on the current choice; Home / End open it on the
//     first / last option; typing opens it and jumps to a match ("2" → 2:00 PM… "w" → Worcester).
//   - Open: ↓ ↑ move, Home / End, PageUp / PageDown move 10, Enter chooses and closes, Tab
//     chooses and moves on, Esc closes without changing anything (and doesn't close the dialog).
//   - Mouse / finger: click an option to choose it; click anywhere else to close.
// The list is drawn with position: fixed so the dialog's scrolling box can't cut it off.
//
// Props:
//   id, labelId, describedBy   the field's id, its visible label's id, the hint / error id
//   value      the chosen value (or null / '' = nothing chosen)
//   options    [{ value, label }]
//   placeholder  text when nothing is chosen
//   onChange   (value) => void
//   invalid    true to mark the field as having a problem
//   readOnly   true while saving
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { IconChevronDown } from '@tabler/icons-react';

const PAGE_STEP = 10;
const TYPE_AHEAD_MS = 500;
const LIST_MAX_HEIGHT = 244; // the last visible row is cut in half: the cue that there's more

export default function SelectField({ id, labelId, describedBy, value, options, placeholder = '', onChange, invalid = false, readOnly = false, autoFocus = false }) {
  const baseId = useId();
  const listId = `${baseId}-list`;
  const fieldRef = useRef(null);
  const listRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0); // highlighted option while open
  const [place, setPlace] = useState(null); // { top, left, width, maxHeight }
  const typedRef = useRef({ text: '', at: 0 });

  const currentIndex = options.findIndex((o) => o.value === value);
  const current = currentIndex === -1 ? null : options[currentIndex];
  const optionId = (index) => `${baseId}-opt-${index}`;

  function openAt(index) {
    if (readOnly || options.length === 0) return;
    setActive(Math.max(0, Math.min(options.length - 1, index)));
    setOpen(true);
  }
  function close() {
    setOpen(false);
  }
  function choose(index) {
    const option = options[index];
    if (option && option.value !== value) onChange(option.value);
    close();
  }

  // Where the list goes: under the field, or above it when there's no room below.
  useLayoutEffect(() => {
    if (!open) return undefined;
    function placeList() {
      const rect = fieldRef.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom - 8;
      const above = rect.top - 8;
      const height = Math.min(LIST_MAX_HEIGHT, options.length * 44 + 8);
      const goUp = below < Math.min(height, 160) && above > below;
      const maxHeight = Math.max(120, Math.min(LIST_MAX_HEIGHT, goUp ? above : below));
      setPlace({
        left: rect.left,
        width: rect.width,
        maxHeight,
        top: goUp ? Math.max(8, rect.top - 4 - Math.min(height, maxHeight)) : rect.bottom + 4,
      });
    }
    placeList();
    window.addEventListener('resize', placeList);
    window.addEventListener('scroll', placeList, true);
    return () => {
      window.removeEventListener('resize', placeList);
      window.removeEventListener('scroll', placeList, true);
    };
  }, [open, options.length]);

  // Keep the highlighted option in view.
  useEffect(() => {
    if (!open || !place) return;
    const element = document.getElementById(optionId(active));
    element?.scrollIntoView({ block: 'nearest' });
    // optionId is stable for this field (baseId never changes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active, place]);

  // A click or tap outside the field and the list closes it.
  useEffect(() => {
    if (!open) return undefined;
    function handlePointerDown(event) {
      const path = event.composedPath();
      if (path.includes(fieldRef.current) || path.includes(listRef.current)) return;
      close();
    }
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [open]);

  // Typing letters/digits jumps to the next option that starts with them.
  function typeAhead(key, from) {
    const now = Date.now();
    const typed = now - typedRef.current.at < TYPE_AHEAD_MS ? typedRef.current.text + key.toLowerCase() : key.toLowerCase();
    typedRef.current = { text: typed, at: now };
    for (let step = 1; step <= options.length; step += 1) {
      const index = (from + (typed.length > 1 ? step - 1 : step) + options.length) % options.length;
      if (options[index].label.toLowerCase().startsWith(typed)) return index;
    }
    return -1;
  }

  function handleKeyDown(event) {
    if (readOnly) return;
    const start = currentIndex === -1 ? 0 : currentIndex;
    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openAt(start);
      } else if (event.key === 'Home') {
        event.preventDefault();
        openAt(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        openAt(options.length - 1);
      } else if (event.key.length === 1 && /\S/.test(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const found = typeAhead(event.key, start);
        if (found !== -1) {
          event.preventDefault();
          openAt(found);
        }
      }
      return;
    }
    // Open
    let next = null;
    if (event.key === 'ArrowDown') next = event.altKey ? active : Math.min(options.length - 1, active + 1);
    else if (event.key === 'ArrowUp') {
      if (event.altKey) {
        event.preventDefault();
        choose(active);
        return;
      }
      next = Math.max(0, active - 1);
    } else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = options.length - 1;
    else if (event.key === 'PageDown') next = Math.min(options.length - 1, active + PAGE_STEP);
    else if (event.key === 'PageUp') next = Math.max(0, active - PAGE_STEP);
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(active);
      return;
    } else if (event.key === 'Escape') {
      // Close the list only — stopPropagation keeps the dialog from treating it as "close me".
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    } else if (event.key === 'Tab') {
      choose(active); // no preventDefault: focus moves on as usual
      return;
    } else if (event.key.length === 1 && /\S/.test(event.key) && !event.ctrlKey && !event.metaKey) {
      const found = typeAhead(event.key, active);
      if (found !== -1) next = found;
    }
    if (next !== null) {
      event.preventDefault();
      setActive(next);
    }
  }

  return (
    <>
      <button
        ref={fieldRef}
        id={id}
        type="button"
        role="combobox"
        className={`input bb-select${invalid ? ' is-invalid' : ''}${current ? '' : ' is-empty'}`}
        aria-haspopup="listbox"
        aria-expanded={open ? 'true' : 'false'}
        aria-controls={listId}
        aria-labelledby={labelId ? `${labelId} ${id}` : undefined}
        aria-describedby={describedBy}
        aria-invalid={invalid ? 'true' : undefined}
        aria-activedescendant={open ? optionId(active) : undefined}
        aria-readonly={readOnly ? 'true' : undefined}
        data-autofocus={autoFocus ? true : undefined}
        onClick={() => (open ? close() : openAt(currentIndex === -1 ? 0 : currentIndex))}
        onKeyDown={handleKeyDown}
      >
        <span className="bb-select-text">{current ? current.label : placeholder}</span>
        {/* ti-chevron-down = a list opens here */}
        <IconChevronDown size={16} aria-hidden="true" className="bb-select-chevron" />
      </button>
      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        aria-labelledby={labelId}
        tabIndex={-1}
        hidden={!open}
        className="bb-select-list"
        style={open && place ? { top: place.top, left: place.left, minWidth: place.width, maxHeight: place.maxHeight } : undefined}
        // Keep focus on the field while clicking an option.
        onMouseDown={(event) => event.preventDefault()}
      >
        {open &&
          options.map((option, index) => (
            <li
              key={option.value}
              id={optionId(index)}
              role="option"
              aria-selected={index === currentIndex ? 'true' : 'false'}
              className={`bb-select-option${index === active ? ' is-active' : ''}${index === currentIndex ? ' is-current' : ''}`}
              onClick={() => choose(index)}
              onPointerMove={() => setActive(index)}
            >
              {option.label}
            </li>
          ))}
      </ul>
    </>
  );
}
