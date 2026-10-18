// DayPanel.jsx — everything on one day (approved mockup screens 1, 5 and 8).
// Why it exists: clicking a day shows it here — in a side panel on the PC, under the month on a
// tablet held upright and on a phone. It shows today until another day is clicked (v0.138):
//   - closures at the top (amber); click one to edit it (admins) or see it (staff)
//   - "Cancelled class no longer on the schedule: …" when the schedule changed after a closure
//     was saved (v0.143 answer 2)
//   - events (time, type color, title); click one to edit / see it
//   - Color Belt / Star testing events, read from Testing (changed there, v0.143 answer 1)
//   - every class that day in its color; cancelled ones stay listed, crossed out
//     (on Both: each school's classes under its own heading)
// Free-class bookings join this panel with Forms (step 3).
//
// Props:
//   date, today, info (buildDay result), schoolLabel, both, typeColor,
//   isAdmin, onOpenEvent(event, element), onOpenClosure(closure, element)
import { IconAlertTriangle, IconCertificate, IconChevronRight } from '@tabler/icons-react';
import { colorOf } from '../../lib/schedule/colors.js';
import { eventTimeOn } from '../../lib/calendar/days.js';
import { formatRange } from '../../lib/schedule/time.js';
import { schoolLetters } from './MonthGrid.jsx';
import * as T from './text.js';

function Dots({ colorKeys }) {
  return (
    <span className="cdots" aria-hidden="true">
      {colorKeys.map((key, i) => {
        const c = colorOf(key);
        return <i key={`${key}-${i}`} style={{ background: c.fill, borderColor: c.edge }} />;
      })}
    </span>
  );
}

export default function DayPanel({ date, today, info, schoolLabel, both, typeColor, isAdmin, onOpenEvent, onOpenClosure }) {
  const isToday = date === today;
  const action = isAdmin ? T.editThing : T.viewThing;
  const hasEvents = info.events.length > 0 || info.testing.length > 0;
  return (
    <section className="cpanel" aria-label={T.longDate(date)}>
      <h2 className="cpanel-title">{T.longDate(date)}</h2>
      <p className="cpanel-sub">{isToday ? T.todayLine(schoolLabel) : schoolLabel}</p>

      {info.closures.map(({ closure, cancelledCount, orphans }) => (
        <div key={closure.id} className="cpanel-closure-wrap">
          <button
            type="button"
            className="cpanel-closure"
            data-closure={closure.id}
            aria-label={`${action(T.closedLine(closure, cancelledCount))}`}
            onClick={(e) => onOpenClosure(closure, e.currentTarget)}
          >
            <IconAlertTriangle size={16} aria-hidden="true" />
            <span className="cpanel-closure-text">
              {both && <b className="cchip-letters">{schoolLetters(closure.locationCode)}</b>}
              {T.closedLine(closure, cancelledCount)}
            </span>
            <IconChevronRight size={16} aria-hidden="true" />
          </button>
          {orphans.map((r) => (
            <p key={r.id ?? `${r.slotId}-${r.start}`} className="cpanel-orphan">
              <IconAlertTriangle size={14} aria-hidden="true" />
              {T.orphanLine(r)}
            </p>
          ))}
        </div>
      ))}

      {hasEvents && (
        <>
          <h3 className="cpanel-head">{T.EVENTS}</h3>
          <ul className="cpanel-list">
            {info.events.map(({ event, part }) => {
              const c = typeColor(event.typeId);
              const time = T.eventTime(eventTimeOn(event, date));
              return (
                <li key={event.id}>
                  <button
                    type="button"
                    className="cpanel-row cpanel-row--btn"
                    data-event={event.id}
                    aria-label={`${action(event.title)}, ${time}`}
                    onClick={(e) => onOpenEvent(event, e.currentTarget)}
                  >
                    <span className="cpanel-time">{time}</span>
                    <i className="cpanel-swatch" style={{ background: c.fill, borderColor: c.edge }} aria-hidden="true" />
                    <span className="cpanel-name">
                      {both && <b className="cchip-letters">{schoolLetters(event.locationCode)}</b>}
                      {event.title}
                      {T.partOf(part)}
                    </span>
                    <IconChevronRight size={16} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
            {info.testing.map((t) => (
              <li key={t.id} className="cpanel-row" title={T.TESTING_FROM}>
                <span className="cpanel-time">{t.start === null ? T.ALL_DAY : T.eventTime({ kind: 'range', start: t.start })}</span>
                <IconCertificate size={16} aria-hidden="true" className="cpanel-icon" />
                <span className="cpanel-name">
                  {both && <b className="cchip-letters">{schoolLetters(t.locationCode)}</b>}
                  {t.title}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {info.schools.map((school) => (
        <div key={school.code}>
          <h3 className="cpanel-head">{both ? T.classesOf(school.name) : T.CLASSES}</h3>
          {school.classes.length === 0 ? (
            <p className="cpanel-empty">{T.NO_CLASSES_DAY}</p>
          ) : (
            <ul className="cpanel-list">
              {school.classes.map((c) => (
                <li key={c.slot.id} className={`cpanel-row${c.cancelled ? ' is-cancelled' : ''}`}>
                  <span className="cpanel-time">{formatRange(c.slot.start, c.slot.end)}</span>
                  <Dots colorKeys={c.colorKeys} />
                  <span className="cpanel-name">
                    <span className="cpanel-classname">{c.name}</span>
                    {c.cancelled && <span className="cpanel-tag">{T.CANCELLED}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}
