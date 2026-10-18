// PhoneMonth.jsx — the phone's small month (approved mockup screen 1, phone).
// Why it exists: a phone is too narrow for written-out day boxes, so each day is a 44px-tall
// button with up to three colored dots underneath its number (amber = a closure, then the colors
// of that day's events). The chosen day is listed below the month (DayPanel), which is also the
// phone's "day view" — the phone has no Week view (v0.138).
//
// Props: weeks, month, today, selected, infoFor, typeColor, onPick — as MonthGrid.
import { colorOf } from '../../lib/schedule/colors.js';
import * as T from './text.js';

const AMBER = '#EF9F27';

function dotsFor(info, typeColor) {
  const dots = [];
  if (info.closures.length) dots.push({ key: 'closed', color: AMBER });
  for (const e of info.events) dots.push({ key: e.event.id, color: typeColor(e.event.typeId).edge });
  for (const t of info.testing) dots.push({ key: t.id, color: colorOf('purple').edge });
  return dots.slice(0, 3);
}

export default function PhoneMonth({ weeks, month, today, selected, infoFor, typeColor, onPick }) {
  return (
    <div className="cmini" role="grid" aria-label={T.monthTitle(`${month}-01`)}>
      <div className="cmini-heads" role="row">
        {T.DAY_LETTERS.map((d, i) => (
          <span key={T.DAY_HEADS[i]} role="columnheader" aria-label={T.DAY_HEADS[i]}>
            {d}
          </span>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={week[0]} className="cmini-week" role="row">
          {week.map((date) => {
            const info = infoFor(date);
            const isToday = date === today;
            const isSel = date === selected;
            return (
              <div key={date} role="gridcell" aria-selected={isSel ? 'true' : 'false'}>
                <button
                  type="button"
                  className={`cmini-day${date.slice(0, 7) !== month ? ' is-out' : ''}${isSel ? ' is-selected' : ''}${isToday ? ' is-today' : ''}`}
                  data-day={date}
                  aria-label={T.dayLabel(date, info, isToday)}
                  aria-current={isToday ? 'date' : undefined}
                  onClick={(e) => onPick(date, e.currentTarget)}
                >
                  <span className="cmini-num" aria-hidden="true">
                    {Number(date.slice(8, 10))}
                  </span>
                  <span className="cmini-dots" aria-hidden="true">
                    {dotsFor(info, typeColor).map((d) => (
                      <i key={d.key} style={{ background: d.color }} />
                    ))}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
