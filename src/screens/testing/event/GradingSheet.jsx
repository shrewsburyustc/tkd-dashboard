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
//
// Classes that test together (v0.193: same start AND end time) share their pages: one testing
// group per page ("Group B + Group C · 6:00 – 7:00 PM · 5 students"), with a small heading row
// per class ("Group B · 3 students") and each class's two "Added on the day" rows after its
// students. An empty class inside a group is left out.
import { createPortal } from 'react-dom';
import { classTimeLabel } from '../../../lib/testing/eventRules.js';
import { testingGroups } from '../../../lib/testing/gradingRules.js';
import * as T from '../text.js';

// Rows per printed page (the "Added on the day" rows and class headings count). Checked in the browser's print
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
  for (const group of testingGroups(classes)) {
    // Only classes with students (v0.189); a group shows a heading per class (v0.193).
    const withStudents = group.classes.filter((cls) => rows.some((r) => r.eventClassId === cls.id));
    if (withStudents.length === 0) continue;
    const isGroup = withStudents.length > 1;
    const lines = [];
    let count = 0;
    for (const cls of withStudents) {
      const students = rows.filter((r) => r.eventClassId === cls.id);
      count += students.length;
      if (isGroup) lines.push({ key: `head-${cls.id}`, heading: T.groupClassHeading(cls.className, students.length) });
      for (const student of students) lines.push({ key: student.id, student });
      for (let i = 0; i < BLANK_ROWS; i += 1) lines.push({ key: `blank-${cls.id}-${i}`, student: null });
    }
    const name = T.groupFullName(withStudents.map((c) => c.className));
    const first = withStudents[0];
    const time = classTimeLabel(first.startTime, first.endTime);
    for (let start = 0, page = 1; start < lines.length; start += SHEET_ROWS_PER_PAGE, page += 1) {
      pages.push({ key: `${group.id}-${page}`, name, time, page, count, lines: lines.slice(start, start + SHEET_ROWS_PER_PAGE) });
    }
  }

  return createPortal(
    <div className="grading-print">
      {pages.map(({ key, name, time, page, count, lines }) => (
        <section key={key} className="gs-page">
          <h1 className="gs-title">{T.sheetTitle(event.name)}</h1>
          <p className="gs-head">{T.sheetHeaderLine(event.testingDate, school, printedAt, name, page)}</p>
          <p className="gs-class">{T.sheetClassLine(name, time, count)}</p>
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
              {lines.map(({ key: lineKey, student, heading }) => {
                if (heading) {
                  return (
                    <tr key={lineKey}>
                      <td className="gs-subhead" colSpan={4}>
                        {heading}
                      </td>
                    </tr>
                  );
                }
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
