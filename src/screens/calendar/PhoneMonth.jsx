// PhoneMonth.jsx — the phone's small month (approved mockup screen 1, phone).
// Why it exists: a phone is too narrow for written-out day boxes, so each day is a 44px-tall
// button with up to three colored dots underneath its number (amber = a closure, then the colors
// of that day's events). The chosen day is listed below the month (DayPanel), which is also the
// phone's "day view" — the phone has no Week view (v0.234).
// Follow-ups (v0.612 / v0.615) are a HOLLOW ring, so they aren't mistaken for an event or closure
// dot: amber when due today or overdue, blue when still ahead. The ring always keeps one of the
// three places. What the Show menu hides is already gone from `info` (showKinds.js applyShow).
//
// Props: weeks, month, today, selected, infoFor, typeColor, onPick — as MonthGrid.
import { colorOf } from '../../lib/schedule/colors.js';
import * as T from './text.js';

const AMBER = '#EF9F27';
const RING_AMBER = '#BA7517'; // darker: a thin ring needs 3:1 on white (design review)

function dotsFor(info, typeColor, due) {
  const dots = [];
  if (info.closures.length) dots.push({ key: 'closed', color: AMBER });
  for (const e of info.events) dots.push({ key: e.event.id, color: typeColor(e.event.typeId).edge });
  for (const t of info.testing) dots.push({ key: t.id, color: colorOf('purple').edge });
  // free classes booked through Forms (amber when one is on a cancelled class)
  if (info.bookingCount) dots.push({ key: 'free', color: info.bookingProblems ? AMBER : 'var(--color-blue)' });
  if (!info.followUpCount) return dots.slice(0, 3);
  return [...dots.slice(0, 2), { key: 'follow', color: due ? RING_AMBER : 'var(--color-blue)', ring: true }];
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
                    {dotsFor(info, typeColor, date <= today).map((d) =>
                      d.ring ? <i key={d.key} className="is-ring" style={{ borderColor: d.color }} /> : <i key={d.key} style={{ background: d.color }} />,
                    )}
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
