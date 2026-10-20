// DayCalendar.jsx — the month calendar where an admin taps a camp's days on or off (C3, section 1).
// Why it exists: a camp has 1–10 days that don't have to be next to each other (Thanksgiving: Wed
// & Fri), so a "from – to" pair of dates can't describe it. Tapping days on a month view can.
//   - a Month and a Year list at the top (as drawn), plus ‹ › buttons for the next / previous month
//   - Su–Sa columns; each day is a button. Chosen days use the DARK outline, not blue (C3 note:
//     multi-select day chips use the dark outline, v0.713), with aria-pressed for screen readers
//   - days before today can't be added (an Edit camp's kept past days stay chosen and can be
//     taken off); with 10 days chosen, other days can't be added
//   - keyboard: the calendar is ONE Tab stop; ← → move a day, ↑ ↓ a week, Enter / Space toggles
// Phones: no frame or gaps, 44px-tall cells, almost edge to edge (camps.css).
//
// Props: month 'YYYY-MM', days [iso] chosen, today, keepDays [iso] (past days allowed back),
//        maxDays, readOnly, onMonth(month), onToggle(iso), labelId, describedBy
import { useRef, useState } from 'react';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import IconButton from '../../../components/IconButton.jsx';
import { NARROW_PHONE_QUERY, useMediaQuery } from '../../../lib/useMediaQuery.js';
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
  const narrow = useMediaQuery(NARROW_PHONE_QUERY);
  const [focusDay, setFocusDay] = useState(null); // the day that has the Tab stop

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
        <IconButton label={T.PREV_MONTH} Icon={IconChevronLeft} onClick={() => onMonth(shiftMonth(month, -1))} />
        <select className="input cp-cal-month" aria-label={T.MONTH} tabIndex={0} value={m} disabled={readOnly} onChange={(e) => onMonth(`${y}-${pad(Number(e.target.value))}`)}>
          {(narrow ? SHORT_MONTHS : MONTHS).map((name, index) => (
            <option key={name} value={index + 1}>
              {name}
            </option>
          ))}
        </select>
        <select className="input cp-cal-year" aria-label={T.YEAR} tabIndex={0} value={y} disabled={readOnly} onChange={(e) => onMonth(`${e.target.value}-${pad(m)}`)}>
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
        <IconButton label={T.NEXT_MONTH} Icon={IconChevronRight} onClick={() => onMonth(shiftMonth(month, 1))} />
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
