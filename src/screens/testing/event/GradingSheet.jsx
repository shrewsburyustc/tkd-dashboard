// GradingSheet.jsx — the printed grading sheet of a testing event (G6, rulebook v0.189).
// Why it exists: a paper backup for the mat. If the tablet or the Wi-Fi fails during testing,
// graders tick boxes on paper and type the results into the Grading tab the same day.
// "Print grading sheet" on the Grading tab draws this into the page, opens the browser's print
// window, and removes it again afterwards — the same way the flyer is printed
// (RegistrationLinkDialog.jsx). The print stylesheet (testing-events.css, @media print) hides
// everything else, so only these pages come out of the printer.
//
// What's on it:
//   - the WHOLE event: one section per class that has active students, in class switch order;
//     each class starts on a new page
//   - per page: "<event> — grading sheet", the date / school / printed time / class and page
//     number, the class line, a table (Student · Testing for · Result (tick one) · Note)
//   - per student: name, "White → Yellow" as plain text, three EMPTY tick boxes, a note line
//   - after each class's students: two blank "Added on the day:" rows for walk-ins
//   - the footer "Type the results into the Grading tab the same day." on every page
// Never printed: payments, the Not paid tag, notes, recorded results (the boxes stay blank so
// the sheet is a clean backup), any grader's name. Black on white, letter size, no belt pictures.
//
// A long class continues on a new page with the same header ("…, page 2"). Pages are split here
// in JavaScript (SHEET_ROWS_PER_PAGE rows each) so the page number can be printed.
import { createPortal } from 'react-dom';
import { classTimeLabel } from '../../../lib/testing/eventRules.js';
import * as T from '../text.js';

// Rows per printed page (the two "Added on the day" rows count). Checked in the browser's print
// preview: 16 rows + header + footer fit a letter page with the 0.75in margins of
// testing-events.css (@page).
export const SHEET_ROWS_PER_PAGE = 16;
const BLANK_ROWS = 2;

// One empty tick box with its word ("☐ Pass"). The box is drawn with CSS, not a font character.
function Tick({ label }) {
  return (
    <span className="gs-tick">
      <span className="gs-box" aria-hidden="true" />
      {label}
    </span>
  );
}

function Ticks() {
  return (
    <span className="gs-ticks">
      <Tick label={T.RESULT_PASS} />
      <Tick label={T.RESULT_NOT_PASSED} />
      <Tick label={T.RESULT_NO_SHOW} />
    </span>
  );
}

// props: event, school, classes (each with ranks), rows (ACTIVE students, any class, in roster
// order), printedAt (a Date: when Print was pressed)
export default function GradingSheet({ event, school, classes, rows, printedAt }) {
  const rankById = new Map(classes.flatMap((c) => c.ranks.map((r) => [r.id, r])));
  const pages = [];
  for (const cls of classes) {
    const students = rows.filter((r) => r.eventClassId === cls.id);
    if (students.length === 0) continue; // only classes with students (v0.189)
    const lines = [...students.map((s) => ({ key: s.id, student: s })), ...Array.from({ length: BLANK_ROWS }, (_, i) => ({ key: `blank-${i}`, student: null }))];
    for (let start = 0, page = 1; start < lines.length; start += SHEET_ROWS_PER_PAGE, page += 1) {
      pages.push({ key: `${cls.id}-${page}`, cls, page, count: students.length, lines: lines.slice(start, start + SHEET_ROWS_PER_PAGE) });
    }
  }

  return createPortal(
    <div className="grading-print">
      {pages.map(({ key, cls, page, count, lines }) => (
        <section key={key} className="gs-page">
          <h1 className="gs-title">{T.sheetTitle(event.name)}</h1>
          <p className="gs-head">{T.sheetHeaderLine(event.testingDate, school, printedAt, cls.className, page)}</p>
          <p className="gs-class">{T.sheetClassLine(cls.className, classTimeLabel(cls.startTime, cls.endTime), count)}</p>
          <table className="gs-table">
            {/* Fixed column widths, so the tick boxes line up on every page */}
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
              {lines.map(({ key: lineKey, student }) => {
                if (!student) {
                  return (
                    <tr key={lineKey} className="gs-blank">
                      <td>
                        <span className="gs-added">{T.SHEET_ADDED_ON_DAY}</span>
                        <span className="gs-fill" />
                      </td>
                      <td>
                        <span className="gs-short" /> → <span className="gs-short" />
                      </td>
                      <td>
                        <Ticks />
                      </td>
                      <td>
                        <span className="gs-line" />
                      </td>
                    </tr>
                  );
                }
                const rank = rankById.get(student.eventRankId);
                const testingFor = rank ? `${rank.name} → ${rank.testingFor?.name ?? T.NO_NEW_RANK}` : '';
                return (
                  <tr key={lineKey}>
                    <td className="gs-name">{T.studentLabel(student)}</td>
                    <td>{testingFor}</td>
                    <td>
                      <Ticks />
                    </td>
                    <td>
                      <span className="gs-line" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="gs-foot">{T.SHEET_FOOTER}</p>
        </section>
      ))}
    </div>,
    document.body,
  );
}
