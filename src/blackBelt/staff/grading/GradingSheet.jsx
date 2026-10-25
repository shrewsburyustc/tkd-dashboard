// GradingSheet.jsx — the PRINTED Black Belt grading sheet: one choice of the day switch (a testing
// day, Other requirements or Extra points) and one Dan, both schools (contract 0025 §14.2; approved
// mockup G08, proposals G 33–G 35).
// Why it exists: graders "have both" — some judge on a tablet, some on paper, and paper is the backup
// if the Wi-Fi drops. Copied from Star's sheet (src/screens/testing/star/grading/StarGradingSheet.jsx,
// v0.512): GradingTab draws this into the page (a "portal" straight into <body>), opens the browser's
// print window, and removes it again when the window closes. The wrapper carries Color Belt's class
// "grading-print" (Color Belt's print rule hides everything else in <body>) and "bbp-print", which
// grading.css gives a NAMED page, landscape Letter with 0.5-inch margins.
// Pages are split HERE (14 lines a page; the "Added on the day:" lines and the make-up band count),
// so every page repeats its header ("(continued)" from page 2) and prints "Page N of M".
//
//   Spring 2027 Black Belt testing · 1st Dan · Physical grading sheet
//   Sat, Apr 3, 2027 · 12:30–2:30 PM · Worcester school · second part 2:30–3:30 PM · Horgan Arena, Auburn · both schools   Judge: ____
//   Write the number measured. The dashboard works out each grade … Mile: minutes and seconds (m:ss).
//   | Candidate | Stretching (3) · in | … | Pull-up or hold (2) · reps or sec  "Pull-up · Hold" | …
//   | Alex Kim / Shrewsbury · 13–17 |  (empty cells)
//   | Added on the day: | … (two lines)
//   | Make-ups · 1 — only the blank subjects are graded |     (bold gray band)
//   | Mia Chen [Make-up] / Worcester · 18 and over · from Spring 2027 · retests Free sparring | kept | (blank) | kept …
//   Spring 2027 Black Belt testing · 1st Dan · printed Fri, Apr 2, 2027, 4:12 PM          Page 1 of 1
//
// Cells are EMPTY: grades already entered are never printed (a clean backup). Never printed: a date
// of birth, an email, payments, grades, any grader's name (G 33). Black on white.
//
// Props: title, whenLine, helpLines ([text]), footWhat, columns (model.columnsFor), rows (the Dan's
//        rows, both schools, own then make-ups), rubric (the Dan object), printedAt (a Date)
import { createPortal } from 'react-dom';
import { schoolName } from '../text.js';
import { groupWords, headingUnder, resultItem, resultSubject, retestNames, rowName } from './model.js';
import * as T from './text.js';
import './grading.css';

export const BB_SHEET_ROWS_PER_PAGE = 14;

// "Fri, Apr 2, 2027, 4:12 PM" in the schools' time zone.
function printedText(date) {
  return date.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function pagesOf(lines, size = BB_SHEET_ROWS_PER_PAGE) {
  const pages = [];
  for (let start = 0; start < lines.length; start += size) pages.push(lines.slice(start, start + size));
  return pages.length > 0 ? pages : [[]];
}

export default function GradingSheet({ title, whenLine, helpLines = [], footWhat, columns, rows, rubric, printedAt }) {
  const own = rows.filter((r) => !r.isMakeup);
  const makeups = rows.filter((r) => r.isMakeup);
  const lines = [
    ...own.map((row) => ({ key: row.id, row })),
    ...[0, 1].map((i) => ({ key: `added-${i}`, added: true })),
    ...(makeups.length > 0 ? [{ key: 'band', band: true }] : []),
    ...makeups.map((row) => ({ key: row.id, row })),
  ];
  const pages = pagesOf(lines);
  const foot = T.sheetFootLeft(footWhat, printedText(printedAt));

  function cell(row, col) {
    const result = row.result;
    if (col.item) {
      const item = resultItem(result, col.id);
      return item?.kept ? <td key={col.id} className="bbp-kept">{T.KEPT}</td> : <td key={col.id} />;
    }
    const rs = resultSubject(result, col.id);
    if (!rs || !rs.applies) return <td key={col.id} className="bbp-na">{T.NOT_FOR_AGE}</td>;
    if (rs.kept) return <td key={col.id} className="bbp-kept">{T.KEPT}</td>;
    const ways = Array.isArray(col.subject?.ways) ? col.subject.ways : [];
    if (col.subject?.scoring === 'measured' && ways.length > 1) {
      return (
        <td key={col.id} className="bbp-ways">
          <span>{T.SHEET_WAYS(ways.map((w) => w.name))}</span>
        </td>
      );
    }
    return <td key={col.id} />;
  }

  return createPortal(
    <div className="grading-print bbp-print" lang="en">
      {pages.map((pageLines, index) => (
        <section key={index} className="bbp-page">
          <h1 className="bbp-title">
            {title}
            {index > 0 && ` ${T.SHEET_CONTINUED}`}
          </h1>
          <div className="bbp-meta">
            <span>{whenLine}</span>
            <span className="bbp-judge">
              {T.SHEET_JUDGE} <span className="bbp-judge-line" />
            </span>
          </div>
          {helpLines.length > 0 && <p className="bbp-help">{helpLines.join(' ')}</p>}
          <table className="bbp-table">
            <colgroup>
              <col className="bbp-col-name" />
              {columns.map((c) => (
                <col key={c.id} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="bbp-th-name">{T.COL_CANDIDATE}</th>
                {columns.map((col) => {
                  const under = headingUnder(col);
                  const bits = col.item ? [T.COUNT_UNIT] : [T.credits(col.subject.credits), ...under.map((u) => u.replace(' / ', ' or '))];
                  return (
                    <th key={col.id}>
                      {col.item ? col.item.name : col.subject.name}
                      <span className="bbp-under">{bits.join(' · ')}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {pageLines.map((line) => {
                if (line.band) {
                  return (
                    <tr key={line.key} className="bbp-band">
                      <td colSpan={columns.length + 1}>{T.sheetMakeupBand(makeups.length)}</td>
                    </tr>
                  );
                }
                if (line.added) {
                  return (
                    <tr key={line.key}>
                      <td className="bbp-name bbp-added">{T.SHEET_ADDED_ON_DAY}</td>
                      {columns.map((c) => (
                        <td key={c.id} />
                      ))}
                    </tr>
                  );
                }
                const { row } = line;
                const result = row.result;
                const small = [schoolName(row.locationCode), groupWords(result)];
                if (row.isMakeup) small.push(T.makeupFromLine(row.makeupOfCycleName ?? '', retestNames(result, rubric)));
                return (
                  <tr key={line.key}>
                    <td className="bbp-name">
                      {rowName(row)}
                      {row.isMakeup && <span className="bbp-pill">{T.MAKEUP_LABEL}</span>}
                      <small>{small.filter(Boolean).join(' · ')}</small>
                    </td>
                    {columns.map((col) => cell(row, col))}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="bbp-foot">
            <span>{foot}</span>
            <span>{T.sheetPage(index + 1, pages.length)}</span>
          </div>
        </section>
      ))}
    </div>,
    document.body,
  );
}
