// PrintRoster.jsx — "Print roster": the camp's attendance grid on paper (contract §6.4).
// Why it exists: staff want a paper list at the door or on the mat — the camp name, its dates,
// one row per camper and a column per camp day with the check-in times. No phones and no prices
// on paper (privacy, rulebook §5: lists never show contact or payment details).
// It is drawn into the page only while printing; the print rules in camps.css hide everything
// else, and it removes itself when the browser's print window closes ('afterprint').
//
// Props: data = a loaded camp ({ camp, days, roster, today, printedAt }), onDone()
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { attendanceCell, cameCount } from '../../lib/camps/campRules.js';
import { campToday } from '../../lib/camps/campsApi.js';
import * as T from './text.js';

// What one cell prints: "✓ 7:42", "✗", "–" (still to come) or "—" (not signed up).
function cellText(row, day, today) {
  const cell = attendanceCell(row, day, today);
  if (cell === 'came') {
    const mine = row.days.find((d) => d.dayId === day.dayId);
    return `✓ ${T.clockShort(mine?.checkedInAt)}`;
  }
  if (cell === 'missed') return '✗';
  if (cell === 'upcoming') return '';
  return '—';
}

export default function PrintRoster({ data, onDone }) {
  // The newest onDone in a ref, so a re-draw of the page never prints a second time.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });
  useEffect(() => {
    const done = () => onDoneRef.current();
    window.addEventListener('afterprint', done);
    // Wait one frame so the sheet is on the page before the print window opens.
    const frame = window.requestAnimationFrame(() => window.print());
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('afterprint', done);
    };
  }, []);

  const { camp } = data;
  const days = data.days ?? [];
  const today = data.today ?? campToday();
  const rows = (data.roster ?? [])
    .filter((r) => r.status === 'active')
    .sort((a, b) => a.lastName.localeCompare(b.lastName, 'en', { sensitivity: 'base' }) || a.firstName.localeCompare(b.firstName, 'en', { sensitivity: 'base' }));

  return createPortal(
    <div className="camp-print">
      <h1 className="cpr-title">{camp.name}</h1>
      <p className="cpr-line">{T.campSummaryLine(camp, days.map((d) => d.day), rows.length)}</p>
      <table className="cpr-table">
        <thead>
          <tr>
            <th scope="col">{T.COL_CAMPER}</th>
            {days.map((d) => (
              <th key={d.dayId} scope="col">
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
                <th scope="row">{T.camperNameAge(row)}</th>
                {days.map((d) => (
                  <td key={d.dayId}>{cellText(row, d, today)}</td>
                ))}
                <td>{T.cameText(came, soFar)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="cpr-foot">
        {T.ATTENDANCE_LEGEND} · {T.printedOn(data.printedAt)}
      </p>
    </div>,
    document.body,
  );
}
