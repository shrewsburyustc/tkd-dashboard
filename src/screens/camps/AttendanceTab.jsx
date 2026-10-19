// AttendanceTab.jsx — the camp page's Attendance tab: the week grid (v0.704, Camps-attendance-roster).
// Why it exists: "who came which day, and how many days" at a glance — for the end of the week,
// for a parent asking, or for the paper copy (Print roster prints this same grid).
//   - one row per active camper, one column per camp day, and "Came X of Y" at the end
//   - cells: ✓ with the check-in time (came) · ✗ (signed up, didn't come — past days only) ·
//     a dashed box (signed up, still to come) · — (not signed up that day)
//   - "Came" counts only days that have happened (today once checked in): campRules.cameCount
//   - PC and tablet: the grid with times; phones: a card per camper with small day boxes (the
//     times are in Camper detail)
// Every name opens Camper detail. Never colour alone: each cell also has words for screen readers.
import { IconCheck, IconX } from '@tabler/icons-react';
import { attendanceCell, cameCount } from '../../lib/camps/campRules.js';
import * as T from './text.js';

const byName = (a, b) =>
  a.lastName.localeCompare(b.lastName, 'en', { sensitivity: 'base' }) || a.firstName.localeCompare(b.firstName, 'en', { sensitivity: 'base' });

// One cell. compact = phones (no time, smaller box).
function Cell({ row, day, today, compact }) {
  const kind = attendanceCell(row, day, today);
  if (kind === 'came') {
    const stamp = (row.days ?? []).find((d) => d.dayId === day.dayId)?.checkedInAt;
    return (
      <span className="cp-att cp-att--came">
        <IconCheck size={14} aria-hidden="true" />
        {!compact && <span aria-hidden="true">{T.clockShort(stamp)}</span>}
        <span className="visually-hidden">{T.CELL_CAME(stamp)}</span>
      </span>
    );
  }
  if (kind === 'missed') {
    return (
      <span className="cp-att cp-att--missed">
        <IconX size={14} aria-hidden="true" />
        <span className="visually-hidden">{T.CELL_MISSED}</span>
      </span>
    );
  }
  if (kind === 'upcoming') {
    return (
      <span className="cp-att cp-att--upcoming">
        <span className="visually-hidden">{T.CELL_UPCOMING}</span>
      </span>
    );
  }
  return (
    <span className="cp-att cp-att--none">
      <span aria-hidden="true">—</span>
      <span className="visually-hidden">{T.CELL_NOT_SIGNED_UP}</span>
    </span>
  );
}

export default function AttendanceTab({ days, active, today, layout, onOpen, panelId, tabId }) {
  const rows = [...active].sort(byName);
  if (rows.length === 0) {
    return (
      <div id={panelId} role="tabpanel" aria-labelledby={tabId}>
        <p className="tempty ev-empty">{T.NO_CAMPERS}</p>
      </div>
    );
  }

  if (layout.isPhone) {
    return (
      <div id={panelId} role="tabpanel" aria-labelledby={tabId} className="cp-att-cards">
        {rows.map((row) => {
          const { came, soFar } = cameCount(row, days, today);
          return (
            <button key={row.id} type="button" className="cp-att-card" onClick={() => onOpen(row)}>
              <span className="cp-att-card-top">
                <span className="ev-sname">{T.camperNameAge(row)}</span>
                <span className="cp-came">{T.cameText(came, soFar)}</span>
              </span>
              <span className="cp-att-boxes">
                {days.map((d) => (
                  <span key={d.dayId} className="cp-att-box">
                    <span className="cp-att-day" aria-hidden="true">
                      {T.weekdayShort(d.day).slice(0, 2)}
                    </span>
                    <span className="visually-hidden">{T.dayLong(d.day)}</span>
                    <Cell row={row} day={d} today={today} compact />
                  </span>
                ))}
              </span>
            </button>
          );
        })}
        <p className="field-hint cp-hint-line">{T.ATTENDANCE_LEGEND}</p>
      </div>
    );
  }

  return (
    <div id={panelId} role="tabpanel" aria-labelledby={tabId}>
      <div className="cp-att-scroll">
        <table className="cp-att-table">
          <thead>
            <tr>
              <th scope="col">{T.COL_CAMPER}</th>
              {days.map((d) => (
                <th key={d.dayId} scope="col" className={d.day === today ? 'is-today' : ''}>
                  {T.dayChip(d.day)}
                </th>
              ))}
              <th scope="col">{T.COL_CAME}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const { came, soFar } = cameCount(row, days, today);
              return (
                <tr key={row.id}>
                  <th scope="row">
                    <button type="button" className="link-button cp-att-name" onClick={() => onOpen(row)}>
                      {T.camperNameAge(row)}
                    </button>
                  </th>
                  {days.map((d) => (
                    <td key={d.dayId}>
                      <Cell row={row} day={d} today={today} compact={false} />
                    </td>
                  ))}
                  <td className="cp-came">{T.cameText(came, soFar)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="field-hint cp-hint-line">{T.ATTENDANCE_LEGEND}</p>
    </div>
  );
}
