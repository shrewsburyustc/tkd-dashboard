// FinalAwardSelect.jsx — the "Final award after this class" dropdown in Add class / Edit class.
// Why it exists: decided v0.51 — a custom dropdown drawn exactly as approved (the same on every
// device, phones included — not the phone's own picker): "Not set" first, then "None — last rank
// doesn't promote" (v0.62: e.g. Deputy is Dan-testing practice), then each class as a gray
// heading with its ranks under it (this class's own ranks are never listed), the current choice
// tinted blue, a scroll bar as the cue that there's more. It OPENS AT THE TOP.
//
// It follows the standard accessible "select-only combobox" pattern (WAI-ARIA), so it works
// with the keyboard and screen readers:
//   - The field is role="combobox". Focus never leaves it; the list's "active" option is
//     announced with aria-activedescendant (it points at the option's id).
//   - Closed: ↓ ↑ Enter Space Alt+↓ open it (active = the current choice); Home / End open it on
//     the first / last option; typing a letter opens it and jumps to a match.
//   - Open: the first ↓ or ↑ scrolls the current choice into view (the list opens at the top);
//     after that ↓ ↑ move (no wrap; class headings are skipped), Home / End, PageUp / PageDown move
//     10, Enter chooses and closes, Alt+↑ or Tab choose and close, Esc closes without changing
//     anything (and does NOT close the dialog), typing jumps to the next option starting with
//     what was typed (letters typed within half a second count as one word).
//   - Mouse / finger: click an option to choose it; click anywhere else to close.
// The list is drawn with position: fixed so the dialog's scrolling box can't cut it off.
//
// Props:
//   id          id for the field (the label's htmlFor-like link uses labelId)
//   labelId     id of the visible label ("Final award after this class")
//   describedBy id of the hint under the field
//   value       the "choice": null = Not set, FINAL_AWARD_NONE ('none') = None, or a rank id
//   options     finalAwardOptions(...) → [{ kind: 'none', value }, { kind: 'class', classId, className, ranks }, …]
//   onChange    (choice) => void
//   readOnly    true while saving (the field can't be changed)
//   autoFocus   puts data-autofocus on the field
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { IconChevronDown } from '@tabler/icons-react';
import { FINAL_AWARD_NONE_OPTION, FINAL_AWARD_NONE_SHORT, NOT_SET } from './text.js';

const PAGE_STEP = 10; // PageUp / PageDown move this many options
const TYPE_AHEAD_MS = 500; // letters typed within this time are one search word
const LIST_MAX_HEIGHT = 244; // px (~236 as mocked up), so the last visible row is cut in half: the cue that there's more

export default function FinalAwardSelect({ id, labelId, describedBy, value, options, onChange, readOnly = false, autoFocus = false }) {
  const baseId = useId();
  const listId = `${baseId}-list`;
  const fieldRef = useRef(null);
  const listRef = useRef(null);

  // The class groups (the None entry is drawn separately, right after "Not set").
  const groups = useMemo(() => options.filter((option) => option.kind === 'class'), [options]);
  const noneOption = options.find((option) => option.kind === 'none');

  // Every choosable option in list order: "Not set", "None", then each class's ranks.
  // `value` is what onChange receives (the choice).
  const flat = useMemo(() => {
    const list = [{ value: null, label: NOT_SET, optionId: `${baseId}-notset` }];
    if (noneOption) list.push({ value: noneOption.value, label: FINAL_AWARD_NONE_OPTION, optionId: `${baseId}-nonepick` });
    for (const group of groups) {
      for (const rank of group.ranks) list.push({ value: rank.id, label: rank.name, optionId: `${baseId}-${rank.id}` });
    }
    return list;
  }, [groups, noneOption, baseId]);

  const currentIndex = Math.max(
    0,
    flat.findIndex((option) => option.value === value),
  );
  // If the saved choice isn't in the list any more (its rank was deleted), it shows as Not set.
  const currentLabel = flat[currentIndex]?.label ?? NOT_SET;
  // The closed field shows just "None"; the full label stays in the open list and is what a
  // screen reader hears (visually hidden text below).
  const isNone = noneOption && value === noneOption.value;

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0); // index into `flat` of the keyboard-active option
  const [place, setPlace] = useState(null); // { top, left, width, maxHeight } of the open list
  const typedRef = useRef({ text: '', at: 0 }); // the type-ahead buffer

  // ----- Opening and closing -----
  function openList(activeIndex) {
    if (readOnly) return;
    setActive(activeIndex);
    setOpen(true);
  }

  function closeList() {
    setOpen(false);
    typedRef.current = { text: '', at: 0 }; // forget what was typed for type-ahead
  }

  function choose(index) {
    const option = flat[index];
    if (option) onChange(option.value);
    closeList();
  }

  // Where the list goes: right under the field, as wide as it. If there isn't room below,
  // it opens above the field instead.
  useLayoutEffect(() => {
    if (!open) return undefined;
    function placeList() {
      const rect = fieldRef.current.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - 8;
      const above = rect.top - 8;
      const height = Math.min(LIST_MAX_HEIGHT, listRef.current?.scrollHeight ?? LIST_MAX_HEIGHT);
      const goUp = below < Math.min(height, 160) && above > below;
      const maxHeight = Math.min(LIST_MAX_HEIGHT, goUp ? above - 4 : below - 4);
      setPlace({
        left: rect.left,
        width: rect.width,
        maxHeight,
        top: goUp ? rect.top - 4 - Math.min(height, maxHeight) : rect.bottom + 4,
      });
    }
    placeList();
    window.addEventListener('resize', placeList);
    window.addEventListener('scroll', placeList, true);
    return () => {
      window.removeEventListener('resize', placeList);
      window.removeEventListener('scroll', placeList, true);
    };
  }, [open]);

  // Opens scrolled to the TOP ("Not set", then Little Tiger…), as approved.
  const scrolledOnceRef = useRef(false);
  useLayoutEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = 0;
      scrolledOnceRef.current = false;
    }
  }, [open]);

  // A click or tap outside the field and the list closes it without changing anything.
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

  // Moves the active option and scrolls it into view (keyboard only).
  function moveTo(index) {
    const next = Math.min(Math.max(index, 0), flat.length - 1);
    setActive(next);
    scrolledOnceRef.current = true;
    // Scroll after React has drawn the new active option.
    window.requestAnimationFrame(() => {
      document.getElementById(flat[next].optionId)?.scrollIntoView({ block: 'nearest' });
    });
  }

  // Type-ahead: find the next option (after the active one, wrapping) whose label starts with
  // what was typed. Repeating one letter cycles through the options starting with it.
  function typeAhead(character, fromIndex) {
    const now = Date.now();
    const buffer = typedRef.current;
    buffer.text = now - buffer.at > TYPE_AHEAD_MS ? character : buffer.text + character;
    buffer.at = now;
    const text = buffer.text.toLowerCase();
    const sameLetter = text.split('').every((letter) => letter === text[0]);
    const search = sameLetter && text.length > 1 ? text[0] : text;
    // A new word starts searching AFTER the active option; a longer word may stay on it.
    const start = search.length === 1 ? fromIndex + 1 : fromIndex;
    for (let step = 0; step < flat.length; step += 1) {
      const index = (start + step) % flat.length;
      if (flat[index].label.toLowerCase().startsWith(search)) return index;
    }
    return null;
  }

  function handleKeyDown(event) {
    if (readOnly) return;
    const { key, altKey } = event;
    // A space counts as a letter only in the middle of typing a word (e.g. "LT B").
    const typing = Date.now() - typedRef.current.at <= TYPE_AHEAD_MS && typedRef.current.text !== '';
    const printable = key.length === 1 && !event.ctrlKey && !event.metaKey && !altKey && (key !== ' ' || typing);

    if (!open) {
      if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Enter' || key === ' ' || (altKey && key === 'ArrowDown')) {
        event.preventDefault();
        openList(currentIndex);
      } else if (key === 'Home') {
        event.preventDefault();
        openList(0);
      } else if (key === 'End') {
        event.preventDefault();
        openList(flat.length - 1);
      } else if (printable) {
        event.preventDefault();
        const match = typeAhead(key, currentIndex);
        openList(match ?? currentIndex);
        if (match !== null) moveTo(match);
      }
      return;
    }

    // ----- The list is open -----
    if (key === 'Escape') {
      event.preventDefault();
      event.stopPropagation(); // Esc closes only the list, not the dialog around it
      closeList();
      return;
    }
    if (key === 'Tab') {
      choose(active); // choose, close, and let Tab move on as usual
      return;
    }
    if ((altKey && key === 'ArrowUp') || key === 'Enter') {
      event.preventDefault();
      choose(active);
      return;
    }
    let next = null;
    // The list opens scrolled to the top, so the current choice may be out of sight. The FIRST
    // ↓ or ↑ only scrolls to it (it's already the active option); the next one moves on.
    const revealFirst = !scrolledOnceRef.current;
    if (key === 'ArrowDown') next = revealFirst ? active : active + 1;
    if (key === 'ArrowUp') next = revealFirst ? active : active - 1;
    if (key === 'Home') next = 0;
    if (key === 'End') next = flat.length - 1;
    if (key === 'PageDown') next = active + PAGE_STEP;
    if (key === 'PageUp') next = active - PAGE_STEP;
    if (key === ' ' && !printable) {
      event.preventDefault(); // Space while open (not typing a word): no page scroll, nothing else
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

  // Build the list: "Not set", then a group per class.
  let flatIndex = 0;
  const optionProps = (option, index) => ({
    id: option.optionId,
    role: 'option',
    'aria-selected': option.value === value ? 'true' : 'false',
    className: `fa-option${index === active ? ' is-active' : ''}${option.value === value ? ' is-selected' : ''}`,
    // mousedown preventDefault keeps focus on the field.
    onMouseDown: (event) => event.preventDefault(),
    onMouseMove: () => {
      if (active !== index) setActive(index);
    },
    onClick: () => choose(index),
  });

  return (
    <div className="fa-select">
      <div
        ref={fieldRef}
        id={id}
        role="combobox"
        tabIndex={0}
        className={`input fa-field${open ? ' is-open' : ''}${readOnly ? ' is-readonly' : ''}`}
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        aria-haspopup="listbox"
        aria-expanded={open ? 'true' : 'false'}
        aria-controls={listId}
        aria-activedescendant={open ? flat[active]?.optionId : undefined}
        aria-readonly={readOnly ? 'true' : undefined}
        data-autofocus={autoFocus ? true : undefined}
        onKeyDown={handleKeyDown}
        onClick={() => (open ? closeList() : openList(currentIndex))}
      >
        {isNone ? (
          <>
            <span className="fa-value" aria-hidden="true">
              {FINAL_AWARD_NONE_SHORT}
            </span>
            <span className="visually-hidden">{currentLabel}</span>
          </>
        ) : (
          <span className="fa-value">{currentLabel}</span>
        )}
        <IconChevronDown size={16} aria-hidden="true" className="fa-chevron" />
      </div>
      {/* The list stays in the page while closed (hidden) so aria-controls always points at it. */}
      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        aria-labelledby={labelId}
        className="fa-list"
        hidden={!open}
        style={place ? { top: place.top, left: place.left, width: place.width, maxHeight: place.maxHeight } : undefined}
      >
        <li {...optionProps(flat[0], flatIndex++)}>{NOT_SET}</li>
        {noneOption && <li {...optionProps(flat[1], flatIndex++)}>{FINAL_AWARD_NONE_OPTION}</li>}
        {groups.map((group) => {
          const headingId = `${baseId}-g-${group.classId}`;
          return (
            <li key={group.classId} role="presentation">
              <ul role="group" aria-labelledby={headingId} className="fa-group">
                <li id={headingId} role="presentation" className="fa-heading">
                  {group.className}
                </li>
                {group.ranks.map((rank) => {
                  const index = flatIndex++;
                  return (
                    <li key={rank.id} {...optionProps(flat[index], index)}>
                      {rank.name}
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
