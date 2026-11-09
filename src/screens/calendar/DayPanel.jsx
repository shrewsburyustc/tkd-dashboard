// DayPanel.jsx — everything on one day (approved mockup screens 1, 5 and 8).
// Why it exists: clicking a day shows it here — in a side panel on the PC, under the month on a
// tablet held upright and on a phone. It shows today until another day is clicked (v0.234):
//   - closures at the top (amber); click one to edit it (admins) or see it (staff)
//   - "Cancelled class no longer on the schedule: …" when the schedule changed after a closure
//     was saved (v0.239 answer 2)
//   - events (time, type color, title); click one to edit / see it
//   - every other section's dated things (v0.645, read-only; each row opens the item in its own
//     section): Color belt / Star testing days and private tests, Black Belt days and camp days
//     join Events; a "Deadlines" part follows Events; "New sign-ups" ("Liam P. · form name",
//     opens the child in Prospects) follows Follow-ups; a gray line when they couldn't be loaded
//   - every class that day in its color; cancelled ones stay listed, crossed out
//     (on Both: each school's classes under its own heading)
//   - free classes booked through Forms (child's first name, class, time, form); one whose class
//     no longer runs then is amber: "Class cancelled — call the family" (v0.241 answer 6); on
//     the class day each free class has Check in (ti-user-check) when the family walks in (v0.236)
//   - prospects' follow-ups (v0.612 / v0.615): "Ruby M." (the child's own last initial since
//     v0.637; the parent's for older sign-ups) with "Overdue" / "Due today" in amber; a tap opens
//     that child's profile in Prospects (on Both: each school under its own heading)
// What the Show menu hides is already gone from `info` (showKinds.js applyShow); a hidden kind's
// heading goes too (no "No classes" line when Classes are hidden).
//
// Props:
//   date, today, info (buildDay result), schoolLabel, both, typeColor,
//   isAdmin, onOpenEvent(event, element), onOpenClosure(closure, element),
//   followUpsFailed (true = show "Couldn't load follow-ups. Check the connection, then retry." with
//   Retry: onRetryFollowUps), onOpenFollowUp(follow-up), onOpenItem(item), itemsFailed (true = the
//   same kind of line for "the other sections' dates", Retry: onRetryItems)
import { IconAlertTriangle, IconChevronRight, IconClockHour4, IconUserCheck, IconUserPlus } from '@tabler/icons-react';
import ErrorBanner from '../../components/ErrorBanner.jsx'; // the amber line with Retry (S-2, v1.051 (2))
import { colorOf } from '../../lib/schedule/colors.js';
import { eventTimeOn } from '../../lib/calendar/days.js';
import { formatRange, formatTime, parseTime } from '../../lib/schedule/time.js';
import { ItemIcon, schoolLetters } from './MonthGrid.jsx';
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

// One row of another section's date (v0.645): time, the section's icon, the name, a chevron. The
// whole row is a button that opens the item in its own section. `timed` false = no time column
// (new sign-ups have a day, not a time).
function ItemRow({ item, both, onOpen, timed = true }) {
  const color = item.kind === 'camp_day' ? colorOf('teal').text : undefined;
  return (
    <li>
      {/* the spoken name says what it is, where it opens and (like the Week view's blocks) when */}
      <button type="button" className="cpanel-row cpanel-row--btn" data-item={item.id} aria-label={timed ? `${T.openItem(item)}, ${T.itemTime(item)}` : T.openItem(item)} onClick={() => onOpen(item)}>
        {timed && <span className="cpanel-time">{T.itemTime(item)}</span>}
        <ItemIcon item={item} size={16} className="cpanel-icon" />
        <span className="cpanel-name" style={color ? { color } : undefined}>
          {both && <b className="cchip-letters">{schoolLetters(item.locationCode)}</b>}
          {T.itemText(item)}
        </span>
        <IconChevronRight size={16} aria-hidden="true" />
      </button>
    </li>
  );
}

export default function DayPanel({ date, today, info, schoolLabel, both, typeColor, isAdmin, onOpenEvent, onOpenClosure, checkIns = null, checkInBusy = false, onCheckIn, followUpsFailed = false, onOpenFollowUp, onOpenItem, itemsFailed = false, onRetryFollowUps, onRetryItems }) {
  const isToday = date === today;
  const showClasses = info.shows?.classes !== false;
  const followSchools = both ? info.schools.filter((s) => info.followUps.some((f) => f.code === s.code)) : [];
  const action = isAdmin ? T.editThing : T.viewThing;
  const hasEvents = info.events.length > 0 || info.items.length > 0;
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
            {info.items.map((it) => (
              <ItemRow key={it.id} item={it} both={both} onOpen={onOpenItem} />
            ))}
          </ul>
        </>
      )}

      {info.deadlines.length > 0 && (
        <>
          <h3 className="cpanel-head">{T.DEADLINES}</h3>
          <ul className="cpanel-list">
            {info.deadlines.map((it) => (
              <ItemRow key={it.id} item={it} both={both} onOpen={onOpenItem} />
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
      {followUpsFailed && <ErrorBanner text={T.FOLLOW_UPS_FAILED} onRetry={onRetryFollowUps} />}

      {info.signupCount > 0 && !both && (
        <>
          <h3 className="cpanel-head">{T.NEW_SIGNUPS}</h3>
          <ul className="cpanel-list">
            {info.signups.map((it) => (
              <ItemRow key={it.id} item={it} both={false} onOpen={onOpenItem} timed={false} />
            ))}
          </ul>
        </>
      )}
      {info.signupCount > 0 &&
        both &&
        info.schools
          .filter((s) => info.signups.some((x) => x.locationCode === s.code))
          .map((school) => (
            <div key={`n-${school.code}`}>
              <h3 className="cpanel-head">{T.newSignupsOf(school.name)}</h3>
              <ul className="cpanel-list">
                {info.signups
                  .filter((x) => x.locationCode === school.code)
                  .map((it) => (
                    <ItemRow key={it.id} item={it} both={false} onOpen={onOpenItem} timed={false} />
                  ))}
              </ul>
            </div>
          ))}
      {itemsFailed && <ErrorBanner text={T.OTHER_SECTIONS_FAILED} onRetry={onRetryItems} />}

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
