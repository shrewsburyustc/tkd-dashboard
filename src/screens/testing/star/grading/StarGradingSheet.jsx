// StarGradingSheet.jsx — the PRINTED grading sheet of Star testing (build phase 5): one Dan of an
// event, or one private testing.
// Why it exists: graders "have both" (rulebook v0.122) — some judge on the tablet, some on paper, and
// paper is the backup if the Wi-Fi drops. Approved: the Grading mockups' print screen (v0.128) and
// the Phase 5 gap mockups H3 (proposals 13–17) and Q2 = B (a private testing prints its own one-row
// sheet from its page) — rulebook v0.512.
//
// How it prints (the same way as Color Belt's sheet, src/screens/testing/event/GradingSheet.jsx, and
// the Star flyer, StarFlyer.jsx): StarEventPage draws this into the page (a "portal" straight into
// <body>), opens the browser's print window, and removes it again when the window closes. The
// wrapper carries Color Belt's class name "grading-print", because Color Belt's print rule
// (testing-events.css, @media print) hides everything in <body> EXCEPT .flyer-print / .grading-print
// — so only this sheet comes out of the printer. It also carries "stp-print", which grading.css
// gives a NAMED page, `@page star-sheet { size: letter landscape; margin: 0.5in }`: Color Belt's
// global @page is portrait, and a named page lets Star's sheet turn sideways without changing
// Color Belt's or the flyer's paper.
//
// Pages are split HERE, in JavaScript (ROWS_PER_PAGE lines each, the "Added on the day" lines
// included), so every page can repeat its own header and print "Page N of M" (proposal 14).
// Every page:
//   Fall 2026 Star Testing · 1st Dan grading sheet            (page 2 on: "… (continued)")
//   Sat, Nov 14, 2026 · 10:00 AM · Shrewsbury school · both schools          Judge: ____________
//   A+ 4.5 · A 4.0 · … · D 0 · Assistant Instructor is worked out from assistant classes.
//   | Candidate | White–Deputy Curriculum (15) | … | Classes attended | Assistant classes |
//   | Grace Ahn / Shrewsbury · 0→1 |  (empty cells)  …                                   |
//   | Sofia Reyes / Worcester · 1→2 · make-up | kept | kept | … (gray "kept": make-up grades kept)
//   | Added on the day: | …   (two blank lines at the end of the Dan, proposal 16)
//   Fall 2026 Star Testing · 1st Dan · printed Fri, Nov 13, 4:12 PM                    Page 1 of 2
//
// Cells are EMPTY (v0.128, proposal 15): grades already entered are never printed, so it is a clean
// paper backup. Never printed (proposal 17, H7): payments, date of birth, email, private students
// (the Dan sheet's rows come from gradingApi.loadGrading, which leaves them out), grades, any
// grader's name. Black on white. Subject names stay upright and wrap (more room on paper).
//
// Props:
//   title       the sheet's title ("Fall 2026 Star Testing · 1st Dan grading sheet")
//   whenLine    the date · time · place line
//   footWhat    the footer's left part before "· printed …"
//   subjects    the judged subjects in order (gradingApi.judgedSubjects) [{ id, name, credits }]
//   rows        GridRows in belt order (both schools; never a private student on the Dan sheet)
//   grades      the event copy's grade scale (copy.grades: [{ grade, value, position }])
//   addedRows   how many blank "Added on the day:" lines end the sheet (2 for a Dan, 0 for a private)
//   printedAt   a Date: when Print was pressed
import { createPortal } from 'react-dom';
import { keptSubject } from '../../../../lib/star/gradingApi.js';
import { schoolName } from '../candidates/text.js';
import * as T from './text.js';
import './grading.css';

// Lines per printed page (the "Added on the day" lines count, as Color Belt's). Checked in the
// browser's print preview: 14 lines + the repeated header + the footer fit landscape letter with
// 0.5-inch margins (grading.css, @page star-sheet).
export const STAR_SHEET_ROWS_PER_PAGE = 14;

// "Fri, Nov 13, 4:12 PM" in the schools' time zone (as Color Belt's sheet).
function printedText(date) {
  return date.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// Splits the lines into pages of `size`. Always at least one page (a sheet with a header only).
export function sheetPages(lines, size = STAR_SHEET_ROWS_PER_PAGE) {
  const pages = [];
  for (let start = 0; start < lines.length; start += size) pages.push(lines.slice(start, start + size));
  return pages.length > 0 ? pages : [[]];
}

export default function StarGradingSheet({ title, whenLine, footWhat, subjects, rows, grades, addedRows = 2, printedAt }) {
  const lines = [
    ...rows.map((row) => ({ key: row.id, row })),
    ...Array.from({ length: addedRows }, (_, i) => ({ key: `added-${i}`, row: null })),
  ];
  const pages = sheetPages(lines);
  const scale = T.sheetScaleLine(grades ?? []);
  const foot = T.sheetFootLeft(footWhat, printedText(printedAt));
  const columns = subjects.length + 3; // Candidate + subjects + the two counts

  return createPortal(
    <div className="grading-print stp-print" lang="en">
      {pages.map((pageLines, index) => (
        <section key={index} className="stp-page">
          <h1 className="stp-title">
            {title}
            {index > 0 && ` ${T.SHEET_CONTINUED}`}
          </h1>
          <div className="stp-meta">
            <span>{whenLine}</span>
            <span className="stp-judge">
              {T.SHEET_JUDGE} <span className="stp-judge-line" />
            </span>
          </div>
          <p className="stp-scale">{scale}</p>
          <table className="stp-table">
            {/* Fixed widths: the name column, then the subjects and the two counts share the rest */}
            <colgroup>
              <col className="stp-col-name" />
              {subjects.map((s) => (
                <col key={s.id} />
              ))}
              <col className="stp-col-count" />
              <col className="stp-col-count" />
            </colgroup>
            <thead>
              <tr>
                <th className="stp-th-name">{T.COL_CANDIDATE}</th>
                {subjects.map((s) => (
                  <th key={s.id}>
                    {s.name}
                    <span className="stp-credits">{T.credits(s.credits)}</span>
                  </th>
                ))}
                <th>
                  {T.SHEET_COL_CLASSES[0]}
                  <br />
                  {T.SHEET_COL_CLASSES[1]}
                </th>
                <th>
                  {T.SHEET_COL_ASSISTANT[0]}
                  <br />
                  {T.SHEET_COL_ASSISTANT[1]}
                </th>
              </tr>
            </thead>
            <tbody>
              {pageLines.map(({ key, row }) => {
                if (!row) {
                  return (
                    <tr key={key}>
                      <td className="stp-name stp-added">{T.SHEET_ADDED_ON_DAY}</td>
                      {Array.from({ length: columns - 1 }, (_, i) => (
                        <td key={i} />
                      ))}
                    </tr>
                  );
                }
                return (
                  <tr key={key}>
                    <td className="stp-name">
                      {row.firstName} {row.lastName}
                      <small>{T.sheetRowLine(schoolName(row.locationCode), row.starsFrom, row.starsTo, row.isMakeup)}</small>
                    </td>
                    {subjects.map((s) => (
                      // A make-up's kept grade prints gray "kept" (proposal 15); every other cell is empty.
                      <td key={s.id} className={keptSubject(row, s.id) ? 'stp-kept' : undefined}>
                        {keptSubject(row, s.id) ? T.SHEET_KEPT : null}
                      </td>
                    ))}
                    <td />
                    <td />
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="stp-foot">
            <span>{foot}</span>
            <span>{T.sheetPage(index + 1, pages.length)}</span>
          </div>
        </section>
      ))}
    </div>,
    document.body,
  );
}
