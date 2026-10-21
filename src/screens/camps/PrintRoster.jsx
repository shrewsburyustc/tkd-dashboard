// PrintRoster.jsx — "Print roster": the camp page's roster on paper (CP5, 2026-10-21).
// Why it exists: staff want a paper list at the door or on the mat — the same grid as the screen:
// the camp name, its dates, one row per camper (A–Z by first name), Paid (Paid / $X due /
// Owes $X — the staff's own printout, design review CP5), a column per camp day with the check-in
// times (every week of a longer camp) and "Came X of Y". No phones on paper (rulebook §5).
// It is drawn into the page only while printing; the print rules in camps.css hide everything
// else, and it removes itself when the browser's print window closes ('afterprint').
//
// Props: data = a loaded camp ({ camp, days, roster, today, printedAt }), onDone()
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { attendanceCell, cameCount, payTag } from '../../lib/camps/campRules.js';
import { campToday } from '../../lib/camps/campsApi.js';
import { byFirstName } from './CampRoster.jsx';
import * as T from './text.js';

// The Paid column as words (the screen's tag): Paid · $245 due · Owes $15 · Possible duplicate.
function paidText(row) {
  const tag = payTag(row);
  if (tag === 'paid') return T.TAG_PAID;
  if (tag === 'owes') return T.tagOwes(row.owesCents);
  if (tag === 'duplicate') return T.TAG_POSSIBLE_DUPLICATE;
  return T.dueTag(row.owesCents);
}

// What one cell prints: "✓ 7:42", "✗", blank (still to come) or "—" (not signed up).
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
    .sort(byFirstName);

  return createPortal(
    <div className="camp-print">
      <h1 className="cpr-title">{camp.name}</h1>
      <p className="cpr-line">{T.campSummaryLine(camp, days.map((d) => d.day), rows.length)}</p>
      <table className="cpr-table">
        <thead>
          <tr>
            <th scope="col">{T.COL_CAMPER}</th>
            <th scope="col">{T.COL_PAID}</th>
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
                <td>{paidText(row)}</td>
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
        {T.PRINT_LEGEND} · {T.printedOn(data.printedAt)}
      </p>
    </div>,
    document.body,
  );
}
