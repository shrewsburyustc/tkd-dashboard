// StarResultsSheet.jsx — the PRINTED results sheet of Star testing (build phase 6): the whole event,
// both schools, every Dan, to show students at the school.
// Why it exists: approved Results mockups print screen (v0.142, v0.143, v0.145), Private mockup 7
// (v0.150) and the Phase 6 gap mockups R9, proposals 34–38 (rulebook v0.514).
//
// How it prints (the same way as the grading sheet, ../grading/StarGradingSheet.jsx): StarEventPage
// draws this into <body> (a "portal"), opens the browser's print window and removes it again when
// the window closes. The wrapper carries Color Belt's class "grading-print" (Color Belt's print rule
// hides everything else) and "strp-print", which results.css gives a NAMED page,
// `@page star-results { size: letter portrait; margin: 0.5in }` — portrait, unlike the landscape
// grading sheet, and without changing Color Belt's own paper.
//
// Every page (portrait letter, 0.5-inch margins):
//   Fall 2026 Star Testing — Results                 (page 2 on: "… (continued)")
//   Saturday, November 14, 2026 · Shrewsbury school · Pass mark: 245 of 315, and no D
//   ▇ 1st Dan ▇                                      a dark band per Dan ("1st Dan (continued)")
//   PASSED — CONGRATULATIONS!                         then Grace Ahn / Shrewsbury · 268.5 of 315 · PASS
//   ⚠ MAKE-UP                (solid black border)    … · Needs: Breaking
//   ⚠ NOT FINISHED YET       (dashed black border)   … · Still to grade: Korean Terminology
//   TESTING PRIVATELY        (plain)                  Alex Kim / Shrewsbury · Dec 1 · Results after their private testing
//   Fall 2026 Star Testing — Results · printed Mon, Nov 16, 2026, 9:05 AM            Page 1 of 3
// More candidates → more pages, never smaller text (proposal 35): rows keep their size and flow on;
// a section that runs over repeats its band and heading with "(continued)"; a heading never sits
// alone at the foot of a page (at least two rows go with it, proposal 36). Rows are stretched to fill
// the page only when the whole event fits on one page (v0.143). Pages are split HERE, in JavaScript,
// with the drawn heights of the approved page (R9: 816 × 1056 px at 96 px per inch).
// Black and white (proposal 37): every section is named in words, every row says PASS / Needs … /
// Still to grade … / Results after their private testing, and Make-up has a solid border while Not
// finished has a dashed one — nothing relies on colour. The colours stay for a colour printer.
// NEVER on the sheet (proposal 38, §4.2): emails, dates of birth, payments, staff names, the sent
// state, a private testing's time or fee.
//
// Props:
//   eventName, subLine   the title's event name and the line under the title
//   dans      [{ dan, label, band, rows }] in Dan order (band: the Dan band's words); rows = ResultRows
//   printedAt a Date: when Print was pressed
import { createPortal } from 'react-dom';
import { monthDay } from '../../../../lib/star/eventsText.js';
import { resultsTotalText } from '../../../../lib/star/resultsApi.js';
import { schoolName } from '../candidates/text.js';
import * as T from './text.js';
import './results.css';

// The drawn heights (px at 96 per inch, R9's page): the page inside its margins is 10in = 960px.
const BODY_PX = 960 - 64 - 24 - 8; // minus the title block, the footer and a little room for rounding
const DAN_PX = 34; // the band (28) and the space above it (6)
const GROUP_PX = 30; // the section heading (26) and the space above it (4)
const ROW_PX = 38;
const MAX_STRETCHED_ROW_PX = 64; // one-page sheets: rows grow to fill the page, up to this

// The sections of a Dan, in the approved order.
const SECTIONS = ['passed', 'makeup', 'not_finished', 'testing_privately'];

// "Mon, Nov 16, 2026, 9:05 AM" in the schools' time zone.
function printedText(date) {
  return date.toLocaleString('en-US', {
    timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

// Splits the Dans' sections into pages (pure; exported for the checks and the reviewer).
//   dans: [{ dan, band, rows }]  → [{ items: [{ type:'dan'|'group'|'row', … }], used }]
// The rules: a heading (band or section) needs room for itself and its first two rows (or the one
// row if the section has one); a page that starts in the middle of a Dan or a section repeats the
// band / heading with "(continued)".
export function resultPages(dans, { bodyPx = BODY_PX } = {}) {
  const pages = [];
  let page = { items: [], used: 0 };
  const newPage = () => {
    pages.push(page);
    page = { items: [], used: 0 };
  };
  for (const d of dans) {
    let danStarted = false;
    let danOnPage = false;
    for (const kind of SECTIONS) {
      const rows = d.rows.filter((r) => sectionOf(r) === kind);
      let groupOnPage = false;
      rows.forEach((row, i) => {
        const heads = () => (danOnPage ? 0 : DAN_PX) + (groupOnPage ? 0 : GROUP_PX);
        const keep = i === 0 ? Math.min(2, rows.length) : 1;
        if (page.used > 0 && page.used + heads() + ROW_PX * keep > bodyPx) {
          newPage();
          danOnPage = false;
          groupOnPage = false;
        }
        if (!danOnPage) {
          page.items.push({ type: 'dan', key: `dan-${d.dan}-${pages.length}`, text: d.band, continued: danStarted });
          page.used += DAN_PX;
          danStarted = true;
          danOnPage = true;
        }
        if (!groupOnPage) {
          page.items.push({ type: 'group', key: `g-${d.dan}-${kind}-${pages.length}`, kind, continued: i > 0 });
          page.used += GROUP_PX;
          groupOnPage = true;
        }
        page.items.push({ type: 'row', key: row.id, kind, row });
        page.used += ROW_PX;
      });
    }
  }
  pages.push(page);
  return pages;
}

// Which section a row prints in: its result's status.
function sectionOf(row) {
  const s = row.result?.status;
  return SECTIONS.includes(s) ? s : 'not_finished';
}

// The right-hand cell of a row.
function rightText(row) {
  const r = row.result;
  switch (sectionOf(row)) {
    case 'passed':
      return { text: T.PASS, className: 'strp-pass' };
    case 'makeup':
      return { text: r.needs.length > 0 ? T.needs(r.needs) : T.NEEDS_ADMIN_CHOOSES, className: 'strp-need' };
    case 'testing_privately':
      return { text: T.AFTER_PRIVATE, className: null };
    default: {
      const left = r.subjects.filter((s) => s.grade === null).map((s) => s.name);
      const text = T.stillToGrade(left, r.subjects.length);
      return { text, className: text ? 'strp-need' : null };
    }
  }
}

// The score cell: "268.5" over "of 315", "250" over "so far", "—", or a private student's "Dec 1".
function Score({ row }) {
  const r = row.result;
  if (r.status === 'testing_privately') return <td className="strp-sc strp-sc--day">{r.private?.on ? monthDay(r.private.on) : '—'}</td>;
  const text = resultsTotalText(r, row.isMakeup);
  const soFar = text.endsWith(' so far');
  const number = soFar ? text.slice(0, -' so far'.length) : text;
  return (
    <td className="strp-sc">
      {number}
      <small>{soFar ? T.SO_FAR : number === '—' ? '' : T.scoreOf(r.maxScore)}</small>
    </td>
  );
}

export default function StarResultsSheet({ eventName, subLine, dans, printedAt }) {
  const pages = resultPages(dans);
  const printed = printedText(printedAt);
  // One page: stretch the rows to fill it (v0.143's "fill the page"), never past MAX_STRETCHED_ROW_PX.
  let rowPx = ROW_PX;
  if (pages.length === 1) {
    const rowCount = pages[0].items.filter((i) => i.type === 'row').length;
    if (rowCount > 0) rowPx = Math.min(MAX_STRETCHED_ROW_PX, ROW_PX + Math.floor((BODY_PX - pages[0].used) / rowCount));
  }

  // Consecutive rows of one section on one page go in one table (so its border wraps them).
  const blocks = (items) => {
    const out = [];
    for (const item of items) {
      if (item.type === 'row') {
        const last = out[out.length - 1];
        if (last && last.type === 'table' && last.kind === item.kind) last.rows.push(item.row);
        else out.push({ type: 'table', key: `t-${item.key}`, kind: item.kind, rows: [item.row] });
      } else out.push(item);
    }
    return out;
  };

  return createPortal(
    <div className="grading-print strp-print" lang="en" style={{ '--strp-row': `${rowPx}px` }}>
      {pages.map((page, index) => (
        <section key={index} className="strp-page">
          <h1 className="strp-title">
            {T.sheetTitle(eventName)}
            {index > 0 && ` ${T.SHEET_CONTINUED}`}
          </h1>
          <p className="strp-sub">{subLine}</p>
          <div className="strp-body">
            {blocks(page.items).map((block) => {
              if (block.type === 'dan') {
                return (
                  <div key={block.key} className="strp-dan">
                    {block.text}
                    {block.continued && ` ${T.SHEET_CONTINUED}`}
                  </div>
                );
              }
              if (block.type === 'group') {
                return (
                  <div key={block.key} className={`strp-grp strp-grp--${block.kind}`}>
                    {T.SECTION[block.kind]}
                    {block.continued && ` ${T.SHEET_CONTINUED}`}
                  </div>
                );
              }
              return (
                <table key={block.key} className={`strp-table strp-table--${block.kind}`}>
                  <tbody>
                    {block.rows.map((row) => {
                      const right = rightText(row);
                      return (
                        <tr key={row.id}>
                          <td className="strp-n">
                            {row.firstName} {row.lastName}
                            <small>{schoolName(row.locationCode)}</small>
                          </td>
                          <Score row={row} />
                          <td className="strp-r">{right.className ? <span className={right.className}>{right.text}</span> : right.text}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              );
            })}
          </div>
          <div className="strp-foot">
            <span>{T.sheetFootLeft(eventName, printed)}</span>
            <span>{T.sheetPage(index + 1, pages.length)}</span>
          </div>
        </section>
      ))}
    </div>,
    document.body,
  );
}
