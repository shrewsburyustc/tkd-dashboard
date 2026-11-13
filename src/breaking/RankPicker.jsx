// RankPicker.jsx — the Rank field of the public Board breaking form: a button-like field that shows the chosen
// rank with its belt picture, and a popup list of every rank (grouped), each with its belt picture.
// Why it exists: the phone's own picker for a native <select> showed no usable list on an iPhone (Jeffrey tried
// the live page: "I cannot see the ranks when selecting"), and a native list can't draw a belt beside each name.
// This is the staff screens' RankSelect (src/screens/breaking/dialogs/RankSelect.jsx) rebuilt for the public
// page: the same behaviour and the same WAI-ARIA "select-only combobox" pattern, but with no dashboard styles,
// with group headings, big tap rows on touch screens, and a list that always stays on the screen:
//   closed  ↓ ↑ Enter Space open it · Home / End open it on the first / last rank · typing jumps to a rank
//           that starts with what was typed
//   open    ↓ ↑ move · Home / End · PageUp / PageDown move 8 · Enter or Tab choose · Esc closes only the list ·
//           typing jumps · a tap or click chooses a rank, a tap anywhere else closes the list
// The list is drawn with position: fixed under the field (above it when there is no room below), as wide as the
// field, with its own scrolling (it never scrolls the page and the page is never locked). It is one field:
// the form and the checks see a rank NAME (or '' when nothing is chosen).
//
// Props: id (the field's id, so Register can focus it), labelId, describedBy (the error message's id), value
//   (a rank name or ''), groups [{ label, options: [{ value, label, belt }] }] (belt = the shape Belt.jsx takes),
//   placeholder, onChange(value), onBlur, invalid.
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import Belt from '../components/Belt.jsx';
import { tabChooses } from './form.js';

const PAGE_STEP = 8;
const TYPE_AHEAD_MS = 500;

export default function RankPicker({ id, labelId, describedBy, value, groups, placeholder, onChange, onBlur, invalid = false }) {
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (index) => `${baseId}-o${index}`;
  const fieldRef = useRef(null);
  const listRef = useRef(null);
  const typedRef = useRef({ text: '', at: 0 });
  const movedRef = useRef(false); // the person moved with the arrows or typed since the list opened (Tab then chooses)
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState(null); // { top, left, width, maxHeight }

  // Every rank in one flat list (the keyboard walks it); `start` = the index of each group's first rank.
  const options = groups.flatMap((g) => g.options);
  const starts = groups.map((_, i) => groups.slice(0, i).reduce((n, g) => n + g.options.length, 0));
  const currentIndex = options.findIndex((o) => o.value === value); // -1 = nothing chosen
  const current = currentIndex >= 0 ? options[currentIndex] : null;

  function openList(index) {
    movedRef.current = false;
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

  // Under the field, as wide as it; above it when there is more room there. Never taller than the room.
  useLayoutEffect(() => {
    if (!open) return undefined;
    function placeList() {
      const rect = fieldRef.current.getBoundingClientRect();
      // The bottom of the screen less the iPhone's home-indicator strip (env(safe-area-inset-bottom), when the page is saved to the home screen).
      const probe = document.createElement('div');
      probe.style.cssText = 'position:fixed;left:0;bottom:0;visibility:hidden;padding-bottom:env(safe-area-inset-bottom,0px)';
      document.body.appendChild(probe);
      const safeBottom = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
      probe.remove();
      const roomBelow = window.innerHeight - safeBottom - rect.bottom - 8;
      const roomAbove = rect.top - 8;
      const wanted = Math.min(window.innerHeight * 0.6, 440, listRef.current?.scrollHeight ?? 440);
      const goUp = roomBelow < Math.min(wanted, 220) && roomAbove > roomBelow;
      const maxHeight = Math.max(96, Math.min(wanted, (goUp ? roomAbove : roomBelow) - 4));
      const height = Math.min(wanted, maxHeight);
      setPlace({ left: rect.left, width: rect.width, maxHeight, top: goUp ? Math.max(4, rect.top - 4 - height) : rect.bottom + 4 });
    }
    // The list scrolling inside itself must not move it (only the page or a box around the field scrolling does).
    const onScroll = (event) => {
      if (event.target !== listRef.current) placeList();
    };
    placeList();
    window.addEventListener('resize', placeList);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', placeList);
      window.removeEventListener('scroll', onScroll, true);
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

  // A tap or click outside closes it without changing anything.
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
    movedRef.current = true;
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
      event.stopPropagation();
      closeList();
      return;
    }
    if (key === 'Tab') {
      // Chooses only a rank the person already had or moved to; otherwise just closes and lets Tab move on.
      if (tabChooses(currentIndex, movedRef.current)) choose(active);
      else closeList();
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
      choose(active); // Space chooses the highlighted rank (as Enter does)
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
    <div className="brk-combo">
      <div
        ref={fieldRef}
        id={id}
        role="combobox"
        tabIndex={0}
        className={`reg-input brk-select brk-combo__field${open ? ' is-open' : ''}${current ? '' : ' is-empty'}${invalid ? ' is-invalid' : ''}`}
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        aria-haspopup="listbox"
        aria-expanded={open ? 'true' : 'false'}
        aria-controls={listId}
        aria-activedescendant={open ? optionId(active) : undefined}
        aria-invalid={invalid ? 'true' : undefined}
        onKeyDown={handleKeyDown}
        onBlur={() => onBlur?.()}
        onClick={() => (open ? closeList() : openList(currentIndex))}
      >
        <span className="brk-combo__value">
          {current ? <Belt belt={current.belt} /> : null}
          <span>{current ? current.label : placeholder}</span>
        </span>
      </div>
      {/* The list stays in the page while closed (hidden) so aria-controls always points at it. */}
      <div
        ref={listRef}
        id={listId}
        role="listbox"
        aria-labelledby={labelId}
        className="brk-list"
        hidden={!open}
        style={place ? { top: place.top, left: place.left, width: place.width, maxHeight: place.maxHeight } : undefined}
      >
        {groups.map((group, g) => (
          <div key={group.label} role="group" aria-labelledby={`${baseId}-g${g}`} className="brk-grpbox">
            <div id={`${baseId}-g${g}`} className="brk-grp" role="presentation">
              {group.label}
            </div>
            {group.options.map((option, i) => {
              const index = starts[g] + i;
              return (
                <div
                  key={option.value}
                  id={optionId(index)}
                  role="option"
                  aria-selected={option.value === value ? 'true' : 'false'}
                  className={`brk-opt${index === active ? ' is-active' : ''}${option.value === value ? ' is-selected' : ''}`}
                  onMouseDown={(event) => event.preventDefault()} // keeps focus on the field
                  onMouseMove={() => {
                    if (active !== index) setActive(index);
                  }}
                  onClick={() => choose(index)}
                >
                  <Belt belt={option.belt} />
                  <span>{option.label}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
