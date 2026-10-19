// PrivateSheet.jsx — the printed one-student sheet of a private testing (mockup P7, contract 0014 §5.9).
// Why it exists: the same paper backup as the testing day's grading sheet (GradingSheet.jsx, G6),
// for one student on their own day: if the tablet or the Wi-Fi fails, the grader ticks a box on
// paper and types the result into the private testing page the same day.
// "Print" on the private page draws this into the page, opens the browser's print window and
// removes it again afterwards. It uses the same class ("grading-print") as the grading sheet, so
// the same print rules apply: only this comes out of the printer, letter size, black on white.
//
// What's on it: "<event> — private testing", the day / time / school / printed time, a table
// (Student · Testing for · Result (tick one) · Note) with ONE row — the name, "Yellow → Orange" as
// plain text, three empty tick boxes and a note line — and the footer "Type the result into Ava’s
// private testing page the same day."
// Never printed: payments, Not paid, the recorded result or the note (the boxes stay blank).
import { createPortal } from 'react-dom';
import * as T from '../text.js';

// One empty tick box with its word ("☐ Pass"), drawn with CSS like GradingSheet's.
function Tick({ label }) {
  return (
    <span className="gs-tick">
      <span className="gs-box" aria-hidden="true" />
      {label}
    </span>
  );
}

// props: event, school, row (the private student), rank (their rank copy, with testingFor),
// printedAt (a Date: when Print was pressed)
export default function PrivateSheet({ event, school, row, rank, printedAt }) {
  const testingFor = rank ? `${rank.name} → ${rank.testingFor?.name ?? T.NO_NEW_RANK}` : '';
  return createPortal(
    <div className="grading-print">
      <section className="gs-page">
        <h1 className="gs-title">{T.privateSheetTitle(event.name)}</h1>
        <p className="gs-head">{T.privateSheetHeader(row.privateDate, row.privateTime, school, printedAt)}</p>
        <table className="gs-table">
          {/* The same fixed column widths as the grading sheet */}
          <colgroup>
            <col className="gs-col-student" />
            <col className="gs-col-tf" />
            <col className="gs-col-result" />
            <col className="gs-col-note" />
          </colgroup>
          <thead>
            <tr>
              <th>{T.SHEET_COL_STUDENT}</th>
              <th>{T.COL_TESTING_FOR}</th>
              <th>{T.SHEET_COL_RESULT}</th>
              <th>{T.SHEET_COL_NOTE}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="gs-name">{T.studentLabel(row)}</td>
              <td>{testingFor}</td>
              <td>
                <span className="gs-ticks">
                  <Tick label={T.RESULT_PASS} />
                  <Tick label={T.RESULT_NOT_PASSED} />
                  <Tick label={T.RESULT_NO_SHOW} />
                </span>
              </td>
              <td>
                <span className="gs-line" />
              </td>
            </tr>
          </tbody>
        </table>
        <p className="gs-foot">{T.privateSheetFooter(row.firstName)}</p>
      </section>
    </div>,
    document.body,
  );
}
