// WeekView.jsx — the Calendar's Week view (approved mockup screen 2; PC and tablet only).
// Why it exists: the same look as the Schedule (times down the left, box height = length), but
// with real dates:
//   - an "All day" row on top: all-day and several-day events, closures, the day a planned
//     schedule starts, testing events from Testing
//   - classes in their colors; cancelled ones crossed out on amber stripes; a whole closed day
//     is striped amber
//   - timed one-day events in their type's color with a thicker left edge
//   - a class with free-class bookings shows ti-user-plus and how many (Forms)
// Clicking an event or a closure opens it (edit for admins, view for staff). Class boxes are
// not buttons here — classes are changed in the Schedule.
//
// Props: dates (7), today, infoFor, typeColor, both, onOpenEvent, onOpenClosure
import { IconAlertTriangle, IconCalendarEvent, IconCertificate, IconUserPlus } from '@tabler/icons-react';
import { colorOf } from '../../lib/schedule/colors.js';
import { eventTimeOn } from '../../lib/calendar/days.js';
import { formatRange, hourLabel } from '../../lib/schedule/time.js';
import { layoutDay } from '../schedule/TimeGrid.jsx';
import { schoolLetters } from './MonthGrid.jsx';
import * as T from './text.js';

const PX_PER_MIN = 0.85;

function splitFill(colorKeys) {
  const colors = colorKeys.map((k) => colorOf(k));
  if (colors.length === 1) return colors[0].fill;
  return `linear-gradient(90deg, ${colors.map((c, i) => `${c.fill} ${(i * 100) / colors.length}% ${((i + 1) * 100) / colors.length}%`).join(', ')})`;
}

export default function WeekView({ dates, today, infoFor, typeColor, both, onOpenEvent, onOpenClosure }) {
  const infos = dates.map((d) => infoFor(d));

  // Everything with a time on each day: classes + timed one-day events.
  const items = infos.map((info, i) => {
    const list = [];
    for (const school of info.schools) {
      for (const c of school.classes) {
        list.push({ id: `${school.code}-${c.slot.id}`, kind: 'class', start: c.slot.start, end: c.slot.end, c, code: school.code });
      }
    }
    for (const e of info.events) {
      const time = eventTimeOn(e.event, dates[i]);
      if (time.kind === 'range') list.push({ id: `e-${e.event.id}`, kind: 'event', start: time.start, end: time.end, e });
    }
    return list;
  });
  const all = items.flat();
  const from = all.length ? Math.floor(Math.min(...all.map((x) => x.start)) / 60) * 60 : 16 * 60;
  let to = all.length ? Math.ceil(Math.max(...all.map((x) => x.end)) / 60) * 60 : 20 * 60;
  to = Math.max(to, from + 60);
  const height = (to - from) * PX_PER_MIN;
  const hours = [];
  for (let m = from; m <= to; m += 60) hours.push(m);

  return (
    <div className="cweek">
      <div className="cweek-heads" aria-hidden="true">
        <span />
        {dates.map((d, i) => (
          <span key={d} className={`cweek-head${d === today ? ' is-today' : ''}`}>
            {T.DAY_HEADS[i]}
            <b>{Number(d.slice(8, 10))}</b>
          </span>
        ))}
      </div>

      <div className="cweek-allday">
        <span className="cweek-allday-label">{T.ALL_DAY_ROW}</span>
        {dates.map((d, i) => {
          const info = infos[i];
          return (
            <div key={d} className="cweek-allday-cell" aria-label={T.longDate(d)} role="group">
              {info.closures.map(({ closure, cancelledCount }) => (
                <button key={closure.id} type="button" className="cchip cchip--closed cchip--btn" data-closure={closure.id} onClick={(e) => onOpenClosure(closure, e.currentTarget)}>
                  <IconAlertTriangle size={12} aria-hidden="true" />
                  {both && <b className="cchip-letters">{schoolLetters(closure.locationCode)}</b>}
                  <span className="cchip-text">{T.closedLine(closure, cancelledCount)}</span>
                </button>
              ))}
              {info.scheduleStarts.map((s) => (
                <span key={s.code} className="cchip cchip--sched">
                  <IconCalendarEvent size={12} aria-hidden="true" />
                  {both && <b className="cchip-letters">{T.SCHOOL_LETTER[s.code]}</b>}
                  <span className="cchip-text">{T.scheduleStartsChip(s.name)}</span>
                </span>
              ))}
              {info.events
                .filter((e) => eventTimeOn(e.event, d).kind !== 'range')
                .map(({ event, part }) => {
                  const c = typeColor(event.typeId);
                  const time = eventTimeOn(event, d);
                  return (
                    <button
                      key={event.id}
                      type="button"
                      className="cchip cchip--event cchip--btn"
                      data-event={event.id}
                      style={{ '--chip-fill': c.fill, '--chip-edge': c.edge, '--chip-text': c.text }}
                      onClick={(e) => onOpenEvent(event, e.currentTarget)}
                    >
                      {both && <b className="cchip-letters">{schoolLetters(event.locationCode)}</b>}
                      <span className="cchip-text">
                        {event.title}
                        {T.partOf(part)}
                        {time.kind !== 'allDay' ? ` · ${T.eventTime(time)}` : ''}
                      </span>
                    </button>
                  );
                })}
              {info.testing.map((t) => {
                const c = colorOf('purple');
                return (
                  <span key={t.id} className="cchip cchip--testing" style={{ '--chip-fill': c.fill, '--chip-edge': c.edge, '--chip-text': c.text }} title={T.TESTING_FROM}>
                    <IconCertificate size={12} aria-hidden="true" />
                    <span className="cchip-text">{t.title}</span>
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="sgrid cweek-grid" style={{ '--sg-days': 7 }}>
        <div className="sgrid-body" style={{ height }}>
          <div className="sgrid-axis" aria-hidden="true">
            {hours.map((m) => (
              <span key={m} className="sgrid-hour" style={{ top: (m - from) * PX_PER_MIN }}>
                {hourLabel(m)}
              </span>
            ))}
          </div>
          {dates.map((d, i) => {
            const info = infos[i];
            const closedAll = info.closures.some((c) => c.closure.wholeDay) && info.classCount > 0 && info.cancelledCount === info.classCount;
            return (
              <div key={d} className={`sgrid-col${closedAll ? ' is-closed' : ''}`} role="list" aria-label={T.longDate(d)}>
                {hours.map((m) => (
                  <span key={`h${m}`} className="sgrid-line" style={{ top: (m - from) * PX_PER_MIN }} aria-hidden="true" />
                ))}
                {(() => {
                  // "Some classes" closed: stripe the hours from the first to the last cancelled class.
                  const off = items[i].filter((x) => x.kind === 'class' && x.c.cancelled);
                  if (closedAll || off.length === 0) return null;
                  const a = Math.min(...off.map((x) => x.start));
                  const b = Math.max(...off.map((x) => x.end));
                  return <span className="cweek-closedband" style={{ top: (a - from) * PX_PER_MIN, height: (b - a) * PX_PER_MIN }} aria-hidden="true" />;
                })()}
                {layoutDay(items[i]).map(({ slot: item, lane, lanes }) => {
                  const style = {
                    top: (item.start - from) * PX_PER_MIN,
                    height: (item.end - item.start) * PX_PER_MIN,
                    left: `calc(${(lane / lanes) * 100}% + 2px)`,
                    width: `calc(${100 / lanes}% - 4px)`,
                  };
                  const tall = (item.end - item.start) * PX_PER_MIN >= 34;
                  if (item.kind === 'class') {
                    const first = colorOf(item.c.colorKeys[0]);
                    const label = `${both ? `${T.SCHOOL_NAME[item.code]}: ` : ''}${item.c.name}, ${formatRange(item.start, item.end, true)}${item.c.cancelled ? `, ${T.CANCELLED}` : ''}${item.c.bookings ? `, ${T.freeBadge(item.c.bookings)}` : ''}`;
                    return (
                      <div key={item.id} role="listitem" className="sslot-wrap" style={{ ...style, '--slot-fill': splitFill(item.c.colorKeys), '--slot-edge': first.edge, '--slot-text': first.text }}>
                        <div className={`sslot${item.c.cancelled ? ' is-cancelled' : ''}`} role="img" aria-label={label} title={label}>
                          <span className="sslot-name">
                            {both && <b className="cchip-letters">{T.SCHOOL_LETTER[item.code]}</b>}
                            {item.c.name}
                            {item.c.bookings > 0 && (
                              <span className="cweek-free" aria-hidden="true">
                                <IconUserPlus size={12} />
                                {item.c.bookings}
                              </span>
                            )}
                          </span>
                          {tall && <span className="sslot-time">{formatRange(item.start, item.end)}</span>}
                        </div>
                      </div>
                    );
                  }
                  const c = typeColor(item.e.event.typeId);
                  return (
                    <div key={item.id} role="listitem" className="sslot-wrap" style={{ ...style, '--slot-fill': c.fill, '--slot-edge': c.edge, '--slot-text': c.text }}>
                      <button
                        type="button"
                        className="sslot cevent-box"
                        data-event={item.e.event.id}
                        aria-label={`${item.e.event.title}, ${formatRange(item.start, item.end, true)}`}
                        title={`${item.e.event.title} · ${formatRange(item.start, item.end, true)}`}
                        onClick={(e) => onOpenEvent(item.e.event, e.currentTarget)}
                      >
                        <span className="sslot-name">
                          {both && <b className="cchip-letters">{schoolLetters(item.e.event.locationCode)}</b>}
                          {item.e.event.title}
                        </span>
                        {tall && <span className="sslot-time">{formatRange(item.start, item.end)}</span>}
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
