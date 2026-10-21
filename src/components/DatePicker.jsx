// DatePicker.jsx — the dashboard's own calendar: a date field that opens a month calendar.
// Why it exists: rulebook v0.502 builds it in Star testing phase 2 for Add / Edit event's testing
// date and closing date; the family registration form (Star phase 4) reuses it for the date of
// birth. Its look is the approved Form mockups screen 4 (v0.107), and how it works for event dates
// is the approved calendar mockups C1–C4 (v0.503). One component, so everything that differs
// between uses is a prop: the hint line, which days can be chosen (min / max), the Year list and
// the "dot" day (the testing date, marked in the closing date's calendar).
//
// What it draws:
//   - the FIELD: a button (nothing is typed) showing "Sat, Nov 14, 2026" or a gray "Choose…", with a
//     down chevron. While its calendar is open it has a dark "open" border and an up chevron — not
//     the blue focus border, so the only blue ring on screen is the keyboard's (v0.503 item 3).
//   - the CALENDAR: Month and Year dropdowns side by side, then the days Su–Sa, then a gray hint.
//     It opens on the chosen date's month (or this month when empty). Days that can't be chosen are
//     gray; today has a thin gray outline; the chosen day is blue-tinted; the "dot" day has a small
//     dot under its number. No ‹ › buttons (v0.503 question B).
//   - WHERE: on PC and tablet a box floating under the field (above it when there's no room), drawn
//     into <body> with a "portal" so the dialog's scrolling box can't clip it; on phones (inline)
//     in the page under the field, edge to edge, pushing what's below down (v0.503 item 4).
//
// Keyboard (the WAI-ARIA date picker pattern, v0.503 item 8):
//   field: Enter / Space / Alt+↓ open it, focus on the chosen day (or today)
//   days:  ← → a day · ↑ ↓ a week · Page Up / Down a month (Shift: a year) · Home / End the
//          week's Sunday / Saturday · Enter or Space picks (not on a gray day), closes, focus back
//          on the field. Gray days can get focus; they are read "unavailable".
//   Tab / Shift+Tab: Month → Year → days, round inside the calendar while it's open.
//   Esc, one step at a time: an open Month / Year list, then the calendar (focus back on the
//   field), then the dialog around it.
//   A click or tap outside closes it without changing anything.
// Screen readers (item 9): the field is "Testing date, Saturday, February 13, 2027"; a day is
// "Saturday, November 14, 2026" plus ", today", ", selected", ", testing date" or ", unavailable".
// The days are a real grid (role="grid": rows and gridcells) with one Tab stop ("roving tabindex").
//
// Props:
//   id, label        the field's id and its name ("Testing date") — the visible label is the page's
//   value            'YYYY-MM-DD' or '' / null (nothing chosen)
//   onChange(iso)    a day was picked
//   today            'YYYY-MM-DD' (the school's today: the outline, and where an empty calendar opens)
//   min, max         the first / last day that can be chosen ('YYYY-MM-DD' or null = no limit)
//   years            the Year list's years, e.g. [2026, 2027, 2028] (the year on show is added)
//   hint             the gray line under the days ("Past dates can't be chosen.")
//   marked           { date, hintLabel: 'Testing date.', srLabel: 'testing date' } or null — the
//                    dot day; hintLabel starts the hint (after a dot) only while its month is on show
//   placeholder      shown when empty ("Choose…")
//   disabled         true: dimmed and can't be opened (e.g. no testing date yet); still focusable,
//                    so describedBy can say why
//   describedBy      id(s) of text under the field (a hint or an error)
//   invalid          true when an error is shown for the field
//   inline           true on phones (in the page, edge to edge)
// Three more props for the family form's date of birth (Star phase 4, v0.510); the dashboard's
// own uses leave them out and keep the behaviour above:
//   emptyFocus       'day' (default) or 'month': with nothing chosen yet, opening moves focus to
//                    the Month list instead of a day (a birthday is never near today)
//   yearsNewestFirst true: the Year list runs from the newest year down (1926 at the bottom)
//   formatValue(iso) the words in the field ("Mar 4, 2012"); default shortDate ("Sat, Nov 14, 2026")
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import {
  addDaysIso, addMonthsIso, daysInMonth, fullDate, isIso, MONTH_NAMES, monthWeeks, parseIso, shortDate, toIso,
  WEEKDAY_LONG, WEEKDAY_SHORT, weekEndIso, weekStartIso,
} from '../lib/calendarDates.js';
import './DatePicker.css';

const LIST_MAX_HEIGHT = 244; // px: the dropdown list's height, the last row cut in half (the cue there's more)

// ===== The Month / Year dropdown inside the calendar (v0.51 look) =====
// A "select-only combobox": focus stays on the field, the list's active option is announced with
// aria-activedescendant. options: [{ value, label, disabled }]. Gray options can be reached but not
// chosen. Esc closes only the list (the calendar stays open).
function DpSelect({ label, value, options, onChange, fieldRef, onOpenChange }) {
  const baseId = useId();
  const listRef = useRef(null);
  const [open, setOpenState] = useState(false);
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState(null);
  const [byKeyboard, setByKeyboard] = useState(false); // the outline on the highlighted option: keyboard only
  const current = Math.max(0, options.findIndex((o) => o.value === value));
  const optionId = (index) => `${baseId}-o${index}`;

  function setOpen(next) {
    setOpenState(next);
    onOpenChange?.(next);
    if (!next) setPlace(null);
  }
  function choose(index) {
    const option = options[index];
    if (!option || option.disabled) return; // gray: can't be chosen
    if (option.value !== value) onChange(option.value);
    setOpen(false);
  }

  // Under the field, as wide as it (above when there's no room below).
  useLayoutEffect(() => {
    if (!open) return undefined;
    function placeList() {
      const rect = fieldRef.current.getBoundingClientRect();
      const height = Math.min(LIST_MAX_HEIGHT, listRef.current?.scrollHeight ?? LIST_MAX_HEIGHT);
      const below = window.innerHeight - rect.bottom - 8;
      const up = below < height && rect.top - 8 > below;
      setPlace({ left: rect.left, width: rect.width, top: up ? rect.top - 4 - height : rect.bottom + 4 });
    }
    placeList();
    window.addEventListener('resize', placeList);
    window.addEventListener('scroll', placeList, true);
    return () => {
      window.removeEventListener('resize', placeList);
      window.removeEventListener('scroll', placeList, true);
    };
  }, [open, fieldRef]);

  // Opens scrolled so the month / year on show is in the middle of the list (v0.503 item 10).
  // Measured from the boxes on screen (not offsetTop), once the list is placed and drawn.
  useLayoutEffect(() => {
    if (!open || !place || !listRef.current) return;
    const list = listRef.current;
    const option = document.getElementById(optionId(current));
    if (!option) return;
    const listBox = list.getBoundingClientRect();
    const optionBox = option.getBoundingClientRect();
    const optionTop = optionBox.top - listBox.top + list.scrollTop;
    list.scrollTop = optionTop - (list.clientHeight - optionBox.height) / 2;
    // (once, when the list has its place)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, place !== null]);

  // A click outside the field and the list closes the list.
  useEffect(() => {
    if (!open) return undefined;
    function handlePointerDown(event) {
      const path = event.composedPath();
      if (path.includes(fieldRef.current) || path.includes(listRef.current)) return;
      setOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  });

  function moveTo(index) {
    const next = Math.min(Math.max(index, 0), options.length - 1);
    setActive(next);
    window.requestAnimationFrame(() => document.getElementById(optionId(next))?.scrollIntoView({ block: 'nearest' }));
  }

  function handleKeyDown(event) {
    const { key, altKey } = event;
    if (!open) {
      if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Enter' || key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        setActive(current);
        setByKeyboard(true);
        setOpen(true);
      }
      return; // Tab and Esc go on to the calendar
    }
    if (key === 'Escape') {
      event.preventDefault();
      event.stopPropagation(); // Esc closes only the list (v0.503 item 8)
      setOpen(false);
      return;
    }
    if (key === 'Tab') {
      setOpen(false); // the calendar moves focus on (Month → Year → days)
      return;
    }
    event.stopPropagation(); // the calendar's own keys don't apply inside an open list
    if (key === 'Enter' || key === ' ' || (altKey && key === 'ArrowUp')) {
      event.preventDefault();
      choose(active);
      return;
    }
    let next = null;
    if (key === 'ArrowDown') next = active + 1;
    if (key === 'ArrowUp') next = active - 1;
    if (key === 'Home') next = 0;
    if (key === 'End') next = options.length - 1;
    if (next !== null) {
      event.preventDefault();
      setByKeyboard(true);
      moveTo(next);
    }
  }

  return (
    <div className="dp-selwrap">
      <div
        ref={fieldRef}
        role="combobox"
        tabIndex={0}
        className={`input dp-sel${open ? ' is-open' : ''}`}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open ? 'true' : 'false'}
        aria-controls={`${baseId}-list`}
        aria-activedescendant={open ? optionId(active) : undefined}
        onKeyDown={handleKeyDown}
        onClick={() => {
          if (open) setOpen(false);
          else {
            setActive(current);
            setByKeyboard(false);
            setOpen(true);
          }
        }}
      >
        <span className="dp-sel-value">{options[current]?.label ?? ''}</span>
        {/* ti-chevron-down / ti-chevron-up = closed / open */}
        {open ? <IconChevronUp size={16} aria-hidden="true" /> : <IconChevronDown size={16} aria-hidden="true" />}
      </div>
      <ul
        ref={listRef}
        id={`${baseId}-list`}
        role="listbox"
        aria-label={label}
        className={`dp-list${byKeyboard ? ' is-keyboard' : ''}`}
        hidden={!open}
        style={place ? { top: place.top, left: place.left, width: place.width } : undefined}
      >
        {options.map((option, index) => (
          <li
            key={option.value}
            id={optionId(index)}
            role="option"
            aria-selected={option.value === value ? 'true' : 'false'}
            aria-disabled={option.disabled ? 'true' : undefined}
            className={`dp-option${index === active ? ' is-active' : ''}${option.value === value ? ' is-selected' : ''}${option.disabled ? ' is-off' : ''}`}
            onMouseDown={(event) => event.preventDefault()} // keeps focus on the field
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

// ===== The date field and its calendar =====
export default function DatePicker({
  id,
  label,
  value,
  onChange,
  today,
  min = null,
  max = null,
  years = [],
  hint = '',
  marked = null,
  placeholder = 'Choose…',
  disabled = false,
  describedBy,
  invalid = false,
  inline = false,
  emptyFocus = 'day',
  yearsNewestFirst = false,
  formatValue = shortDate,
}) {
  const baseId = useId();
  const fieldRef = useRef(null);
  const popRef = useRef(null);
  const monthRef = useRef(null);
  const yearRef = useRef(null);
  const gridRef = useRef(null);
  const chosen = isIso(value) ? value : null;
  const start = chosen ?? (isIso(today) ? today : null);

  const [open, setOpen] = useState(false);
  const [focusDate, setFocusDate] = useState(start); // the day with the Tab stop (keyboard focus)
  const [place, setPlace] = useState(null); // { top, left } of the floating box (PC / tablet)
  const focusDayRef = useRef(false); // move DOM focus to the focus day after the next render
  const focusMonthRef = useRef(false); // …or to the Month list (emptyFocus 'month', nothing chosen)

  // The month on show. Without a value or `today` there is nothing to open on (the calendar
  // can't open then), so no guess from this computer's clock is ever made.
  const view = parseIso(focusDate ?? start);

  const allowed = (iso) => Boolean(iso) && (!min || iso >= min) && (!max || iso <= max);

  // ----- Opening and closing -----
  function openCalendar() {
    if (disabled || open || !start) return;
    setFocusDate(start);
    if (emptyFocus === 'month' && !chosen) focusMonthRef.current = true;
    else focusDayRef.current = true;
    setOpen(true);
  }
  function closeCalendar(refocus) {
    setOpen(false);
    setPlace(null);
    if (refocus) fieldRef.current?.focus();
  }
  function pick(iso) {
    if (!allowed(iso)) return; // gray: nothing happens
    if (iso !== value) onChange(iso);
    closeCalendar(true);
  }

  // PC / tablet: place the box under the field (above it when there's no room below), keep it
  // there while the dialog scrolls or the window changes size.
  useLayoutEffect(() => {
    if (!open || inline) return undefined;
    function placeBox() {
      const field = fieldRef.current;
      const box = popRef.current;
      if (!field || !box) return;
      const rect = field.getBoundingClientRect();
      const height = box.offsetHeight;
      const width = box.offsetWidth;
      const below = window.innerHeight - rect.bottom - 8;
      const up = below < height && rect.top - 8 > below;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      setPlace({ top: up ? rect.top - 4 - height : rect.bottom + 4, left });
    }
    placeBox();
    window.addEventListener('resize', placeBox);
    window.addEventListener('scroll', placeBox, true);
    return () => {
      window.removeEventListener('resize', placeBox);
      window.removeEventListener('scroll', placeBox, true);
    };
  }, [open, inline]);

  // Phones: scroll the page so the whole calendar is in view (C2, phone).
  useEffect(() => {
    if (open && inline) popRef.current?.scrollIntoView({ block: 'nearest' });
  }, [open, inline]);

  // Opening with nothing chosen and emptyFocus 'month': keyboard focus to the Month list.
  useEffect(() => {
    if (!open || !focusMonthRef.current) return;
    if (!inline && !place) return; // wait until the box has its place
    focusMonthRef.current = false;
    monthRef.current?.focus();
  });

  // Keyboard focus to the focus day (after opening, and after every arrow key).
  useEffect(() => {
    if (!open || !focusDayRef.current) return;
    if (!inline && !place) return; // wait until the box has its place
    focusDayRef.current = false;
    gridRef.current?.querySelector(`[data-date="${focusDate}"]`)?.focus();
  });

  // A click or tap outside the field and the calendar closes it without changing anything.
  useEffect(() => {
    if (!open) return undefined;
    function handlePointerDown(event) {
      const path = event.composedPath();
      if (path.includes(fieldRef.current) || path.includes(popRef.current)) return;
      closeCalendar(false);
    }
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  });

  // The field can't be used any more (e.g. the testing date was cleared): close.
  useEffect(() => {
    if (disabled && open) closeCalendar(false);
  });

  // ----- Moving around (the days) -----
  function moveFocus(iso) {
    if (!isIso(iso)) return;
    setFocusDate(iso);
    focusDayRef.current = true;
  }
  function handleGridKeyDown(event) {
    const { key, shiftKey } = event;
    const from = focusDate;
    let next = null;
    if (key === 'ArrowLeft') next = addDaysIso(from, -1);
    else if (key === 'ArrowRight') next = addDaysIso(from, 1);
    else if (key === 'ArrowUp') next = addDaysIso(from, -7);
    else if (key === 'ArrowDown') next = addDaysIso(from, 7);
    else if (key === 'PageUp') next = addMonthsIso(from, shiftKey ? -12 : -1);
    else if (key === 'PageDown') next = addMonthsIso(from, shiftKey ? 12 : 1);
    else if (key === 'Home') next = weekStartIso(from);
    else if (key === 'End') next = weekEndIso(from);
    else if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      event.stopPropagation(); // never submits the form around it
      pick(from);
      return;
    }
    if (next) {
      event.preventDefault();
      event.stopPropagation();
      moveFocus(next);
    }
  }

  // Esc and Tab inside the calendar (an open Month / Year list handles its own Esc first).
  function handlePopKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation(); // the dialog's Esc comes only after this one
      closeCalendar(true);
      return;
    }
    if (event.key === 'Tab') {
      // Month → Year → days, round inside the calendar (the dialog's own Tab loop isn't used).
      event.preventDefault();
      event.stopPropagation();
      const order = [monthRef.current, yearRef.current, 'days'];
      const activeEl = document.activeElement;
      let index = 2;
      if (monthRef.current?.contains(activeEl)) index = 0;
      else if (yearRef.current?.contains(activeEl)) index = 1;
      const target = order[(index + (event.shiftKey ? -1 : 1) + 3) % 3];
      focusDayRef.current = false; // nothing may pull focus to the days later
      if (target === 'days') gridRef.current?.querySelector('td[tabindex="0"]')?.focus();
      else target?.focus();
    }
  }

  // ----- The Month and Year lists (v0.503 items 5, 10) -----
  // A month is gray when none of its days can be chosen; a year from `years` (+ the year on show).
  const monthOptions = MONTH_NAMES.map((name, index) => {
    const m = index + 1;
    if (!view) return { value: m, label: name, disabled: true };
    const first = toIso(view.year, m, 1);
    const last = toIso(view.year, m, daysInMonth(view.year, m));
    return { value: m, label: name, disabled: Boolean((min && last < min) || (max && first > max)) };
  });
  const yearList = [...new Set([...years, ...(view ? [view.year] : [])])].sort((a, b) => (yearsNewestFirst ? b - a : a - b));
  const yearOptions = yearList.map((y) => ({ value: y, label: String(y) }));
  function showMonth(year, month) {
    const day = Math.min(view.day, daysInMonth(year, month));
    setFocusDate(toIso(year, month, day)); // the chosen date doesn't change until a day is picked
  }

  // ----- Drawing -----
  const weeks = view ? monthWeeks(view.year, view.month) : [];
  const monthTitle = view ? `${MONTH_NAMES[view.month - 1]} ${view.year}` : '';
  const markedOnShow = Boolean(view && marked && isIso(marked.date) && marked.date.slice(0, 7) === toIso(view.year, view.month, 1).slice(0, 7));
  const fieldName = `${label}, ${chosen ? fullDate(chosen) : placeholder}`;

  function dayName(iso) {
    const parts = [fullDate(iso)];
    if (iso === today) parts.push('today');
    if (iso === chosen) parts.push('selected');
    if (marked && iso === marked.date) parts.push(marked.srLabel);
    if (!allowed(iso)) parts.push('unavailable');
    return parts.join(', ');
  }

  const calendar = open && view && (
    <div
      ref={popRef}
      className={`dp-pop${inline ? ' is-inline' : ''}`}
      // A non-modal popup (the dialog around it is already modal); focus is still kept inside by
      // its own Tab handling below
      role="dialog"
      aria-label={`Choose ${label.toLowerCase()}`}
      style={inline ? undefined : { top: place?.top ?? 0, left: place?.left ?? 0, visibility: place ? 'visible' : 'hidden' }}
      onKeyDown={handlePopKeyDown}
    >
      <div className="dp-top">
        <DpSelect label="Month" value={view.month} options={monthOptions} fieldRef={monthRef} onChange={(m) => showMonth(view.year, m)} />
        <DpSelect label="Year" value={view.year} options={yearOptions} fieldRef={yearRef} onChange={(y) => showMonth(y, view.month)} />
      </div>
      {/* The month on show, announced when it changes */}
      <p id={`${baseId}-month`} className="visually-hidden" aria-live="polite">
        {monthTitle}
      </p>
      <table ref={gridRef} className="dp-grid" role="grid" aria-labelledby={`${baseId}-month`} onKeyDown={handleGridKeyDown}>
        <thead>
          <tr role="row">
            {WEEKDAY_SHORT.map((d, i) => (
              <th key={d} role="columnheader" scope="col" abbr={WEEKDAY_LONG[i]}>
                <span aria-hidden="true">{d}</span>
                <span className="visually-hidden">{WEEKDAY_LONG[i]}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week.find(Boolean)} role="row">
              {week.map((iso, i) =>
                iso ? (
                  <td
                    key={iso}
                    role="gridcell"
                    data-date={iso}
                    tabIndex={iso === focusDate ? 0 : -1}
                    aria-label={dayName(iso)}
                    aria-selected={iso === chosen ? 'true' : 'false'}
                    aria-disabled={allowed(iso) ? undefined : 'true'}
                    aria-current={iso === today ? 'date' : undefined}
                    className={`dp-day${iso === chosen ? ' is-selected' : ''}${allowed(iso) ? '' : ' is-off'}${iso === today ? ' is-today' : ''}`}
                    onMouseDown={(event) => event.preventDefault()} // a click doesn't draw the focus ring
                    onClick={() => pick(iso)}
                  >
                    <span className="dp-num" aria-hidden="true">
                      {Number(iso.slice(8))}
                    </span>
                    {marked && iso === marked.date && <span className="dp-dot" aria-hidden="true" />}
                  </td>
                ) : (
                  <td key={`e${i}`} className="dp-empty" aria-hidden="true" />
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {(hint || markedOnShow) && (
        <p className="dp-hint">
          {markedOnShow && (
            <>
              <span className="dp-hint-dot" aria-hidden="true" />
              {marked.hintLabel}{' '}
            </>
          )}
          {hint}
        </p>
      )}
    </div>
  );

  return (
    <>
      <button
        ref={fieldRef}
        id={id}
        type="button"
        className={`input dp-field${open ? ' is-open' : ''}${chosen ? '' : ' is-empty'}${disabled ? ' is-disabled' : ''}`}
        aria-label={fieldName}
        aria-haspopup="dialog"
        aria-expanded={open ? 'true' : 'false'}
        aria-disabled={disabled ? 'true' : undefined}
        aria-describedby={describedBy}
        aria-invalid={invalid ? 'true' : undefined}
        onClick={() => (open ? closeCalendar(false) : openCalendar())}
        onKeyDown={(event) => {
          if (event.altKey && event.key === 'ArrowDown') {
            event.preventDefault();
            openCalendar();
          }
        }}
      >
        <span className="dp-value">{chosen ? formatValue(chosen) : placeholder}</span>
        {/* ti-chevron-down / ti-chevron-up = closed / open */}
        {open ? <IconChevronUp size={16} aria-hidden="true" /> : <IconChevronDown size={16} aria-hidden="true" />}
      </button>
      {inline ? calendar : calendar && createPortal(calendar, document.body)}
    </>
  );
}
