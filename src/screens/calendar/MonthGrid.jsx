// MonthGrid.jsx — the Month view's grid of day boxes (approved mockup screen 1, rulebook v0.234).
// Why it exists: the Calendar opens on the month. Each day box is ONE button (click → that day
// shows in the side panel) with a short summary written out inside:
//   - closures first (amber, ti-alert-triangle: they are a warning — classes are cancelled)
//   - the day a planned schedule starts (dashed chip)
//   - events in their type's color; Color Belt / Star testing events (purple, ti-certificate)
//   - "4 classes" in gray (crossed out when the whole day is closed)
//   - "2 free classes" (ti-user-plus) booked through Forms; amber when one is on a cancelled class
//   - "2 follow-ups" (ti-clock-hour-4): prospects to call that day; amber when due today or
//     overdue, blue when still ahead (v0.612 / v0.615); on Both one chip per school
// What the Show menu hides is already gone from `info` (showKinds.js applyShow, v0.613).
// Busy days show "+N more" instead of growing. Days of the months before and after are grayed.
// On Both, each chip starts with W or S (W S for both schools) and class counts add up.
// The chips are drawn for the eye; the button's label reads the same summary out loud.
//
// Props:
//   weeks       [[7 dates] …] (days.js monthWeeks)
//   month       'YYYY-MM' of the month shown
//   today, selected   dates
//   infoFor     (date) => the day's buildDay() result
//   typeColor   (typeId) => color record (schedule/colors.js)
//   both        true on "Both" (school letters)
//   onPick      (date, element) => void
import { IconAlertTriangle, IconCalendarEvent, IconCertificate, IconClockHour4, IconUserPlus } from '@tabler/icons-react';
import { colorOf } from '../../lib/schedule/colors.js';
import * as T from './text.js';

const MAX_CHIPS = 3; // closures / schedule starts / events per box before "+N more"

export function schoolLetters(locationCode) {
  return locationCode === null ? 'W S' : T.SCHOOL_LETTER[locationCode] ?? '';
}

// The chips of one day, in order (also used by the week view's "All day" row).
export function dayChips(info, typeColor, both) {
  const chips = [];
  for (const c of info.closures) {
    chips.push({ key: `c${c.closure.id}`, kind: 'closed', letters: both ? schoolLetters(c.closure.locationCode) : '', text: T.closedChip(c.closure) });
  }
  for (const s of info.scheduleStarts) {
    chips.push({ key: `s${s.code}`, kind: 'sched', letters: both ? T.SCHOOL_LETTER[s.code] : '', text: T.scheduleStartsChip(s.name) });
  }
  for (const e of info.events) {
    chips.push({
      key: `e${e.event.id}`,
      kind: 'event',
      color: typeColor(e.event.typeId),
      letters: both ? schoolLetters(e.event.locationCode) : '',
      text: `${e.event.title}${T.partOf(e.part)}`,
    });
  }
  for (const t of info.testing) {
    chips.push({ key: `t${t.id}`, kind: 'testing', color: colorOf('purple'), letters: both ? schoolLetters(t.locationCode) : '', text: t.title });
  }
  return chips;
}

// The follow-up chips of one day: one per school on Both, else one. Also used by the week view.
export function followChips(info, date, today, both) {
  if (!info.followUpCount) return [];
  const due = date <= today;
  if (!both) return [{ key: 'f', letters: '', count: info.followUpCount, due }];
  const codes = [...new Set(info.followUps.map((f) => f.code))];
  return codes.map((code) => ({ key: `f${code}`, letters: T.SCHOOL_LETTER[code], count: info.followUps.filter((f) => f.code === code).length, due }));
}

export function FollowChip({ chip }) {
  return (
    <span className={`cchip cchip--follow${chip.due ? ' is-due' : ''}`}>
      <IconClockHour4 size={12} aria-hidden="true" />
      {chip.letters && <b className="cchip-letters">{chip.letters}</b>}
      <span className="cchip-text">{T.followUpCount(chip.count)}</span>
    </span>
  );
}

export function Chip({ chip }) {
  const style = chip.color ? { '--chip-fill': chip.color.fill, '--chip-edge': chip.color.edge, '--chip-text': chip.color.text } : undefined;
  return (
    <span className={`cchip cchip--${chip.kind}`} style={style}>
      {chip.kind === 'closed' && <IconAlertTriangle size={12} aria-hidden="true" />}
      {chip.kind === 'sched' && <IconCalendarEvent size={12} aria-hidden="true" />}
      {chip.kind === 'testing' && <IconCertificate size={12} aria-hidden="true" />}
      {chip.letters && <b className="cchip-letters">{chip.letters}</b>}
      <span className="cchip-text">{chip.text}</span>
    </span>
  );
}

export default function MonthGrid({ weeks, month, today, selected, infoFor, typeColor, both, onPick }) {
  return (
    <div className="cmonth" role="grid" aria-label={T.monthTitle(`${month}-01`)}>
      <div className="cmonth-heads" role="row">
        {T.DAY_HEADS.map((d) => (
          <span key={d} className="cmonth-head" role="columnheader">
            {d}
          </span>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={week[0]} className="cmonth-week" role="row">
          {week.map((date) => {
            const info = infoFor(date);
            const out = date.slice(0, 7) !== month;
            const chips = dayChips(info, typeColor, both);
            const shown = chips.slice(0, MAX_CHIPS);
            const isToday = date === today;
            const isSel = date === selected;
            return (
              <div key={date} role="gridcell" className="cmonth-cell" aria-selected={isSel ? 'true' : 'false'}>
                <button
                  type="button"
                  className={`cday${out ? ' is-out' : ''}${isSel ? ' is-selected' : ''}${isToday ? ' is-today' : ''}`}
                  data-day={date}
                  aria-label={T.dayLabel(date, info, isToday)}
                  aria-current={isToday ? 'date' : undefined}
                  onClick={(e) => onPick(date, e.currentTarget)}
                >
                  <span className="cday-num" aria-hidden="true">
                    {Number(date.slice(8, 10))}
                  </span>
                  <span className="cday-chips" aria-hidden="true">
                    {shown.map((chip) => (
                      <Chip key={chip.key} chip={chip} />
                    ))}
                    {chips.length > MAX_CHIPS && <span className="cchip cchip--more">{T.moreCount(chips.length - MAX_CHIPS)}</span>}
                    {info.classCount > 0 && (
                      <span className={`cchip cchip--cls${info.cancelledCount === info.classCount ? ' is-x' : ''}`}>
                        {T.classCount(info.classCount)}
                        {info.cancelledCount > 0 && info.cancelledCount < info.classCount && (
<s className="cchip-cancelled">{T.someCancelled(info.cancelledCount)}</s>
                        )}
                      </span>
                    )}
                    {info.bookingCount > 0 && (
                      <span className={`cchip cchip--free${info.bookingProblems ? ' is-warn' : ''}`}>
                        {info.bookingProblems ? <IconAlertTriangle size={12} aria-hidden="true" /> : <IconUserPlus size={12} aria-hidden="true" />}
                        <span className="cchip-text">{T.freeChip(info.bookingCount, info.bookingProblems)}</span>
                      </span>
                    )}
                    {followChips(info, date, today, both).map((chip) => (
                      <FollowChip key={chip.key} chip={chip} />
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
