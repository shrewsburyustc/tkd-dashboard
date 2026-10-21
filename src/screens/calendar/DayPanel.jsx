// DayPanel.jsx — everything on one day (approved mockup screens 1, 5 and 8).
// Why it exists: clicking a day shows it here — in a side panel on the PC, under the month on a
// tablet held upright and on a phone. It shows today until another day is clicked (v0.234):
//   - closures at the top (amber); click one to edit it (admins) or see it (staff)
//   - "Cancelled class no longer on the schedule: …" when the schedule changed after a closure
//     was saved (v0.239 answer 2)
//   - events (time, type color, title); click one to edit / see it
//   - Color Belt / Star testing events, read from Testing (changed there, v0.239 answer 1)
//   - every class that day in its color; cancelled ones stay listed, crossed out
//     (on Both: each school's classes under its own heading)
//   - free classes booked through Forms (child's first name, class, time, form); one whose class
//     no longer runs then is amber: "Class cancelled — call the family" (v0.241 answer 6); on
//     the class day each free class has Check in (ti-user-check) when the family walks in (v0.236)
//   - prospects' follow-ups (v0.612 / v0.615): "Ruby A." with "Overdue" / "Due today" in amber;
//     a tap opens that child in Prospects (on Both: each school under its own heading)
// What the Show menu hides is already gone from `info` (showKinds.js applyShow); a hidden kind's
// heading goes too (no "No classes" line when Classes are hidden).
//
// Props:
//   date, today, info (buildDay result), schoolLabel, both, typeColor,
//   isAdmin, onOpenEvent(event, element), onOpenClosure(closure, element),
//   followUpsFailed (true = show "Couldn't load follow-ups."), onOpenFollowUp(follow-up)
import { IconAlertTriangle, IconCertificate, IconChevronRight, IconClockHour4, IconUserCheck, IconUserPlus } from '@tabler/icons-react';
import { colorOf } from '../../lib/schedule/colors.js';
import { eventTimeOn } from '../../lib/calendar/days.js';
import { formatRange, formatTime, parseTime } from '../../lib/schedule/time.js';
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

function FollowUps({ list, date, today, onOpen }) {
  const tag = date < today ? T.OVERDUE : date === today ? T.DUE_TODAY : null;
  return (
    <ul className="cpanel-list">
      {list.map((f) => (
        <li key={f.id}>
          <button type="button" className="cpanel-row cpanel-row--btn cpanel-follow" data-follow-up={f.id} aria-label={T.openFollowUp(f, tag)} onClick={() => onOpen(f)}>
            <IconClockHour4 size={16} aria-hidden="true" className="cpanel-icon" />
            <span className="cpanel-name">{T.followName(f)}</span>
            {tag && <span className="cpanel-follow-tag">{tag}</span>}
            <IconChevronRight size={16} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function DayPanel({ date, today, info, schoolLabel, both, typeColor, isAdmin, onOpenEvent, onOpenClosure, checkIns = null, checkInBusy = false, onCheckIn, followUpsFailed = false, onOpenFollowUp }) {
  const isToday = date === today;
  const showClasses = info.shows?.classes !== false;
  const followSchools = both ? info.schools.filter((s) => info.followUps.some((f) => f.code === s.code)) : [];
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

      {info.bookings.length > 0 && (
        <>
          <h3 className="cpanel-head">{T.FREE_CLASSES}</h3>
          <ul className="cpanel-list">
            {info.bookings.map((b) => (
              <li key={b.id} className={`cpanel-row cpanel-free${b.classRunning ? '' : ' is-warn'}`} title={T.FREE_FROM(b.formName)}>
                <span className="cpanel-time">{formatTime(parseTime(b.start), true)}</span>
                {b.classRunning ? <IconUserPlus size={16} aria-hidden="true" className="cpanel-icon" /> : <IconAlertTriangle size={16} aria-hidden="true" className="cpanel-icon" />}
                <span className="cpanel-name">
                  {both && <b className="cchip-letters">{T.SCHOOL_LETTER[b.locationCode]}</b>}
                  {T.freeLine(b)}
                  {!b.classRunning && <span className="cpanel-free-warn">{T.CLASS_GONE}</span>}
                </span>
                {date === today && b.classRunning && checkIns?.get(b.id) && (
                  checkIns.get(b.id).checkedIn ? (
                    <span className="cpanel-tag">{T.CHECKED_IN}</span>
                  ) : (
                    !['joined', 'not_interested', 'came', 'no_show'].includes(checkIns.get(b.id).builtin ?? '') && (
                      <button type="button" className="btn btn-sm cpanel-checkin" disabled={checkInBusy} onClick={() => onCheckIn(b, checkIns.get(b.id))}>
                        <IconUserCheck size={16} aria-hidden="true" />
                        {T.CHECK_IN}
                      </button>
                    )
                  )
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {info.followUpCount > 0 && !both && (
        <>
          <h3 className="cpanel-head">{T.FOLLOW_UPS}</h3>
          <FollowUps list={info.followUps} date={date} today={today} onOpen={onOpenFollowUp} />
        </>
      )}
      {info.followUpCount > 0 &&
        followSchools.map((school) => (
          <div key={`f-${school.code}`}>
            <h3 className="cpanel-head">{T.followUpsOf(school.name)}</h3>
            <FollowUps list={info.followUps.filter((f) => f.code === school.code)} date={date} today={today} onOpen={onOpenFollowUp} />
          </div>
        ))}
      {followUpsFailed && <p className="cpanel-empty">{T.FOLLOW_UPS_FAILED}</p>}

      {showClasses && info.schools.map((school) => (
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
