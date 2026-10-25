// ResultsSheet.jsx — the PRINTED results sheet of a Black Belt testing cycle: the whole cycle, both
// schools, every Dan, to show students at the school.
// Why it exists: approved Results mockup R05 (proposals 38–44), copied from Star's
// StarResultsSheet.jsx (v0.142, v0.143, v0.145, v0.514) with Black Belt's pass marks by age.
//
// How it prints (as Star's sheet and the receipt): ResultsTab draws this into <body> (a "portal"),
// opens the browser's print window and removes it again when the window closes. results.css gives
// it a NAMED page, `@page bb-results { size: letter portrait; margin: 0.5in }`, so the other
// sections' print pages keep their own paper, and hides everything else while printing.
//
// Every page (portrait Letter, 0.5-inch margins):
//   Spring 2027 Black Belt testing — Results               (page 2 on: "… (continued)")
//   Testing days Sat, Apr 3 · Sat, May 1 · Sat, Jun 5, 2027 · Worcester and Shrewsbury
//   ▇ 1st Dan  Pass mark 275 (17 and under) · 293 (18 and over), and no D ▇
//   PASSED — CONGRATULATIONS!                         Alex Kim / Shrewsbury · 305.75 / pass 275 · PASS
//   ⚠ MAKE-UP              (solid black border)       … · Needs: Free sparring / Needs: to be decided
//   ⚠ NOT FINISHED YET     (dashed black border)      … · Still to hand in: TKD project / Still to grade: …
//   Spring 2027 Black Belt testing — Results · printed Wed, Jun 9, 2027, 9:05 AM        Page 1 of 1
// More candidates → more pages, never smaller text (proposal 43): rows keep their size and flow on;
// a Dan or section that runs over repeats its band / heading with "(continued)"; a heading never
// sits alone at the foot of a page (at least two rows go with it). Rows stretch to fill the page
// only when the whole cycle fits on one page (v0.143). Pages are split HERE, in JavaScript.
// Black and white (proposal 44): every section is named in words, every row says PASS / Needs … /
// Still to …, Make-up has a solid border and Not finished a dashed one.
// A make-up carried into this cycle prints like any other row — no "make-up from" note (proposal 42).
// NEVER on the sheet (proposal 44): emails, dates of birth, payments, extra-point details, the sent
// state, staff names. The age itself is never printed — only the row's own "pass 275".
//
// Props:
//   cycleName, dates      the title's cycle name and its testing days ('YYYY-MM-DD', in order)
//   dans                  [{ dan, danObj, rows }] in Dan order, only Dans with rows
//   printedAt             a Date: when Print was pressed
import { createPortal } from 'react-dom';
import { subjectNames } from '../../../lib/blackBelt/grading.js';
import { nothingYet, totalParts } from './resultLines.js';
import * as T from './text.js';
import './results.css';

// The drawn heights (px at 96 per inch): the page inside its margins is 10in = 960px.
const BODY_PX = 960 - 64 - 24 - 8; // minus the title block, the footer and a little room for rounding
const DAN_PX = 34; // the band (28) and the space above it (6)
const GROUP_PX = 30; // the section heading (26) and the space above it (4)
const ROW_PX = 38;
const MAX_STRETCHED_ROW_PX = 64; // one-page sheets: rows grow to fill the page, up to this
const PAGE_RULE = '@page { size: letter portrait; margin: 0.5in; }';

// The sections of a Dan, in the approved order.
const SECTIONS = ['passed', 'makeup', 'not_finished'];
// Which section a row prints in (no_age counts as Not finished).
const sectionOf = (row) => (row.result?.status === 'passed' || row.result?.status === 'makeup' ? row.result.status : 'not_finished');

// "Wed, Jun 9, 2027, 9:05 AM" in the schools' time zone.
function printedText(date) {
  return date.toLocaleString('en-US', {
    timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

// Splits the Dans' sections into pages (pure; exported for the checks and the reviewer).
//   dans: [{ dan, rows }]  → [{ items: [{ type:'dan'|'group'|'row', … }], used }]
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
          page.items.push({ type: 'dan', key: `dan-${d.dan}-${pages.length}`, dan: d, continued: danStarted });
          page.used += DAN_PX;
          danStarted = true;
          danOnPage = true;
        }
        if (!groupOnPage) {
          page.items.push({ type: 'group', key: `g-${d.dan}-${kind}-${pages.length}`, kind, continued: i > 0 });
          page.used += GROUP_PX;
          groupOnPage = true;
        }
        page.items.push({ type: 'row', key: row.id, kind, row, danObj: d.danObj });
        page.used += ROW_PX;
      });
    }
  }
  pages.push(page);
  return pages;
}

// The right-hand cell of a row: a list of { text, boxed }.
function rightCells(row, danObj) {
  const r = row.result;
  const names = (ids) => subjectNames(danObj, ids);
  const kind = sectionOf(row);
  if (kind === 'passed') return [{ text: T.PASS, className: 'bbresp-pass' }];
  if (kind === 'makeup') {
    const needs = names(r.needs);
    return [{ text: needs.length > 0 ? T.needs(needs) : T.NEEDS_TO_BE_DECIDED, className: 'bbresp-need' }];
  }
  // Not finished: a late hand-in first ("Still to hand in: TKD project"), then what isn't graded.
  const out = [];
  const late = names(r?.late);
  if (late.length > 0) out.push({ text: T.stillToHandIn(late), className: 'bbresp-need' });
  const lateIds = r?.late ?? [];
  const others = names((r?.missing ?? []).filter((id) => !lateIds.includes(id)));
  const grade = T.stillToGrade(others, r?.counts?.applying ?? others.length);
  if (grade) out.push({ text: grade, className: 'bbresp-need' });
  return out;
}

// The score cell: "305.75" over "pass 275", "275.5" over "so far · pass 275", or "—".
function Score({ row }) {
  const r = row.result;
  const t = totalParts(r);
  const mark = Number.isFinite(r?.pass_mark) ? r.pass_mark : null;
  let small = '';
  if (nothingYet(r)) small = mark !== null ? T.passMarkLine(mark) : '';
  else if (t.soFar) small = T.sheetSoFar(mark);
  else if (mark !== null) small = T.passMarkLine(mark);
  return (
    <td className="bbresp-sc">
      {t.number}
      <small>{small}</small>
    </td>
  );
}

export default function ResultsSheet({ cycleName, dates, dans, printedAt }) {
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
        if (last && last.type === 'table' && last.kind === item.kind) last.rows.push(item);
        else out.push({ type: 'table', key: `t-${item.key}`, kind: item.kind, rows: [item] });
      } else out.push(item);
    }
    return out;
  };

  return createPortal(
    <div className="bbresp-print" lang="en" style={{ '--bbresp-row': `${rowPx}px` }}>
      {/* The paper, while this sheet is on the page (it only is while printing). The named page in
          results.css alone isn't enough: the browser took the first page's margins from
          testing-events.css's general @page (0.75in), which pushed the last rows onto a second page.
          A later unnamed @page wins over that one, and goes away with the sheet. */}
      <style>{PAGE_RULE}</style>
      {pages.map((page, index) => (
        <section key={index} className="bbresp-page">
          <h1 className="bbresp-title">
            {T.sheetTitle(cycleName)}
            {index > 0 && ` ${T.SHEET_CONTINUED}`}
          </h1>
          <p className="bbresp-sub">{T.sheetSub(dates)}</p>
          <div className="bbresp-body">
            {blocks(page.items).map((block) => {
              if (block.type === 'dan') {
                const marks = T.bandPassMarks(block.dan.danObj?.pass?.brackets, block.dan.danObj?.pass?.no_d === true);
                return (
                  <div key={block.key} className="bbresp-dan">
                    <span>
                      {T.danLabel(block.dan.dan)}
                      {block.continued && ` ${T.SHEET_CONTINUED}`}
                    </span>
                    {marks && <small>{marks}</small>}
                  </div>
                );
              }
              if (block.type === 'group') {
                return (
                  <div key={block.key} className={`bbresp-grp bbresp-grp--${block.kind}`}>
                    {T.SECTION[block.kind]}
                    {block.continued && ` ${T.SHEET_CONTINUED}`}
                  </div>
                );
              }
              return (
                <table key={block.key} className={`bbresp-table bbresp-table--${block.kind}`}>
                  <tbody>
                    {block.rows.map(({ row, danObj }) => (
                      <tr key={row.id}>
                        <td className="bbresp-n">
                          {row.firstName} {row.lastName}
                          <small>{T.schoolName(row.locationCode)}</small>
                        </td>
                        <Score row={row} />
                        <td className="bbresp-r">
                          {rightCells(row, danObj).map((c, i) => (
                            <div key={i}>
                              <span className={c.className}>{c.text}</span>
                            </div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })}
          </div>
          <div className="bbresp-foot">
            <span>{T.sheetFootLeft(cycleName, printed)}</span>
            <span>{T.sheetPage(index + 1, pages.length)}</span>
          </div>
        </section>
      ))}
    </div>,
    document.body,
  );
}
