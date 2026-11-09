// DayCalendar.jsx — the month calendar where an admin taps a camp's days on or off (C3, section 1).
// Why it exists: a camp has 1–60 days (weekly pricing v0.717; was 10) that don't have to be next to each other (Thanksgiving: Wed
// & Fri), so a "from – to" pair of dates can't describe it. Tapping days on a month view can.
//   - a Month and a Year list at the top (as drawn; the shared dropdown, components/Select.jsx),
//     plus ‹ › buttons for the next / previous month
//   - Su–Sa columns; each day is a button. Chosen days use the DARK outline, not blue (C3 note:
//     multi-select day chips use the dark outline, v0.713), with aria-pressed for screen readers
//   - days before today can't be added (an Edit camp's kept past days stay chosen and can be
//     taken off); with 60 days chosen (maxDays), other days can't be added
//   - keyboard: the calendar is ONE Tab stop; ← → move a day, ↑ ↓ a week, Enter / Space toggles
// Phones: no frame or gaps, 44px-tall cells, almost edge to edge (camps.css).
//
// Props: month 'YYYY-MM', days [iso] chosen, today, keepDays [iso] (past days allowed back),
//        maxDays, readOnly, onMonth(month), onToggle(iso), labelId, describedBy
import { useId, useRef, useState } from 'react';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import IconButton from '../../../components/IconButton.jsx';
import Select from '../../../components/Select.jsx';
import { useMediaQuery } from '../../../lib/useMediaQuery.js';

// The Month dropdown shows the short names ("Sep") on phones narrower than 390px: with the Year box
// (96px) and the two arrows (44px each) the Month box is only about 110px at 360 and 125px at 375,
// which cuts "September" off ("Septe…"); from 390px up the full names fit (design review, 2026-11-08).
const SHORT_MONTH_NAMES_QUERY = '(max-width: 389.98px)';
import * as T from '../text.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// Under 360px wide the long names don't fit the box ("Febr…"): Jan, Feb … instead.
const SHORT_MONTHS = MONTHS.map((name) => name.slice(0, 3));
const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

// The month after / before 'YYYY-MM'.
function shiftMonth(month, by) {
  const [y, m] = month.split('-').map(Number);
  const date = new Date(y, m - 1 + by, 1);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export default function DayCalendar({ month, days, today, keepDays = [], maxDays, readOnly, onMonth, onToggle, labelId, describedBy }) {
  const [y, m] = month.split('-').map(Number);
  const firstWeekday = new Date(y, m - 1, 1).getDay(); // 0 = Sunday
  const length = new Date(y, m, 0).getDate(); // days in this month
  const chosen = new Set(days);
  const full = days.length >= maxDays;
  const gridRef = useRef(null);
  const narrow = useMediaQuery(SHORT_MONTH_NAMES_QUERY);
  const [focusDay, setFocusDay] = useState(null); // the day that has the Tab stop
  const baseId = useId(); // ids for the Month / Year dropdowns and their hidden labels

  // Can this day be tapped right now? A chosen day can always be taken off.
  const canToggle = (day) => !readOnly && (chosen.has(day) || ((day >= today || keepDays.includes(day)) && !full));

  // The one day in the Tab order: the remembered one if it is in this month, else the first
  // chosen day, today, or the 1st.
  const inMonth = (day) => day && day.startsWith(month);
  const firstChosen = days.find(inMonth);
  const tabDay = inMonth(focusDay) ? focusDay : (firstChosen ?? (inMonth(today) ? today : iso(y, m, 1)));

  function moveFocus(from, by) {
    const [fy, fm, fd] = from.split('-').map(Number);
    const target = new Date(fy, fm - 1, fd + by);
    const next = iso(target.getFullYear(), target.getMonth() + 1, target.getDate());
    if (!next.startsWith(month)) onMonth(next.slice(0, 7));
    setFocusDay(next);
    // Focus after the (maybe new) month is drawn.
    window.requestAnimationFrame(() => gridRef.current?.querySelector(`[data-day="${next}"]`)?.focus());
  }
  function handleKeyDown(event) {
    const day = event.target.getAttribute?.('data-day');
    if (!day) return;
    const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (event.key in moves) {
      event.preventDefault();
      moveFocus(day, moves[event.key]);
    }
  }

  // The year list: this year and the next two, plus any year the camp already uses.
  const thisYear = Number(today.slice(0, 4));
  const years = Array.from(new Set([thisYear, thisYear + 1, thisYear + 2, y, ...days.map((d) => Number(d.slice(0, 4)))])).sort();
  // The same lists as choices for the shared dropdown (values are text: 'value' of a Select is a string)
  const monthOptions = (narrow ? SHORT_MONTHS : MONTHS).map((name, index) => ({ value: String(index + 1), label: name }));
  const yearOptions = years.map((year) => ({ value: String(year), label: String(year) }));

  const cells = [];
  for (let i = 0; i < firstWeekday; i += 1) cells.push(<span key={`b${i}`} className="cp-cal-blank" aria-hidden="true" />);
  for (let d = 1; d <= length; d += 1) {
    const day = iso(y, m, d);
    const picked = chosen.has(day);
    const usable = canToggle(day);
    cells.push(
      <button
        key={day}
        type="button"
        data-day={day}
        className={`cp-cal-day${picked ? ' is-picked' : ''}${day === today ? ' is-today' : ''}`}
        aria-pressed={picked ? 'true' : 'false'}
        aria-label={T.dayCellLabel(day, picked)}
        aria-disabled={usable ? undefined : 'true'}
        tabIndex={day === tabDay ? 0 : -1}
        onFocus={() => setFocusDay(day)}
        onClick={() => usable && onToggle(day)}
      >
        {d}
      </button>,
    );
  }

  return (
    <div className="cp-cal" aria-labelledby={labelId} aria-describedby={describedBy} role="group">
      <div className="cp-cal-top">
        {/* The arrows wait while the dialog saves, like the dropdowns (aria-disabled: still a Tab stop) */}
        <IconButton label={T.PREV_MONTH} Icon={IconChevronLeft} aria-disabled={readOnly ? 'true' : undefined} onClick={() => !readOnly && onMonth(shiftMonth(month, -1))} />
        {/* Month and Year: the shared dropdown (S-10, pass 1). No visible label, so each has a hidden
            one (a span with an id) that the Select reads its name from. Values are strings. */}
        <span id={`${baseId}-month-label`} className="visually-hidden">
          {T.MONTH}
        </span>
        <div className="cp-cal-month">
          <Select
            id={`${baseId}-month`}
            labelId={`${baseId}-month-label`}
            value={String(m)}
            options={monthOptions}
            placeholder={T.MONTH}
            readOnly={readOnly}
            onChange={(value) => onMonth(`${y}-${pad(Number(value))}`)}
          />
        </div>
        <span id={`${baseId}-year-label`} className="visually-hidden">
          {T.YEAR}
        </span>
        <div className="cp-cal-year">
          <Select
            id={`${baseId}-year`}
            labelId={`${baseId}-year-label`}
            value={String(y)}
            options={yearOptions}
            placeholder={T.YEAR}
            readOnly={readOnly}
            onChange={(value) => onMonth(`${value}-${pad(m)}`)}
          />
        </div>
        <IconButton label={T.NEXT_MONTH} Icon={IconChevronRight} aria-disabled={readOnly ? 'true' : undefined} onClick={() => !readOnly && onMonth(shiftMonth(month, 1))} />
      </div>
      <div className="cp-cal-grid" aria-hidden="true">
        {T.WEEKDAY_HEADS.map((head) => (
          <span key={head} className="cp-cal-head">
            {head}
          </span>
        ))}
      </div>
      <div ref={gridRef} className="cp-cal-grid" onKeyDown={handleKeyDown}>
        {cells}
      </div>
    </div>
  );
}
