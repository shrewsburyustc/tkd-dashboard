// ResultsSheet.jsx — the PRINTED results sheet of one Color Belt testing event (CB18): who passed,
// and to which belt, to put up at the school after the testing day.
// Why it exists: Color Belt design review, screen 4 (rulebook v1.029; v0.416 = option A, a page per
// class). It copies Star's sheet (../star/results/StarResultsSheet.jsx): the same portal, print
// window, named portrait page, page splitting in JavaScript, "(continued)" headings and footer.
//
// How it prints: GradingTab draws this into <body> (a "portal" — React draws it outside the
// dashboard's own box), opens the browser's print window and removes it again when the window
// closes. The wrapper carries the class "grading-print" (Color Belt's print rule in
// testing-events.css hides everything else on paper) and "rs-print", which resultsSheet.css gives
// a NAMED page, `@page cb-results { size: letter portrait; margin: 0.5in }`, so the grading sheet
// and the flyers keep their own paper.
//
// Every page (portrait letter, 0.5-inch margins):
//   November Children Testing — Results                (page 2 of a class: "… (continued)")
//   Friday, November 20, 2026 · Worcester school
//   ▇ LITTLE TIGER ▇                                   a dark band with the class name
//   PASSED — CONGRATULATIONS!
//   Ava Chen                      New belt ▬ LT Yellow  [PASSED]
//   November Children Testing — Results · printed Fri, Nov 20, 2026, 8:15 PM      Page 1 of 6
// A page per CLASS (v0.416): every class starts a new page, even classes that test together.
// Only students who PASSED are listed — Not passed, No show and "not recorded yet" never are (the
// sheet goes up at the school). A class with nobody passed gets no page at all (a page saying
// "nobody passed" would single that class out); if nobody in the whole event has passed, one page
// says "No passed results recorded yet." A long class flows on to more pages (never smaller text),
// repeating its band and heading with "(continued)".
// Black and white: the belt's NAME is printed next to its picture, and every row says PASSED, so
// nothing relies on colour. The colours stay for a colour printer.
// NEVER on the sheet: payments, dates of birth, emails, notes, staff names.
//
// Props:
//   eventName  the event's name
//   subLine    the line under the title ("Friday, November 20, 2026 · Worcester school")
//   classes    [{ id, name, rows: [{ id, name, belt }] }] in class switch order, only students who
//              passed; belt = the new belt (a rank with its belt fields), or null if none is set
//   printedAt  a Date: when Print was pressed
import { createPortal } from 'react-dom';
import Belt from '../../../components/Belt.jsx';
import * as T from '../text.js';
import './resultsSheet.css';

// The drawn heights (px at 96 per inch). The page inside its margins is 10in, and each sheet page
// is drawn 9.9in tall (resultsSheet.css, so rounding never spills a blank page) = 950px.
// The title block: the title (26px type, 1.25 line height = 32.5px a line) is given TWO lines,
// because a long event name wraps, + the line under it (18.75px) and its margins (4 + 14) ≈ 102.
const PAGE_PX = 950;
const TITLE_PX = 104;
const FOOT_PX = 24; // the footer: 15px of text, 6px above it and its 1px line
const BODY_PX = PAGE_PX - TITLE_PX - FOOT_PX - 6; // and a little room for rounding
const BAND_PX = 40; // the class band (30) and the space above it (10)
const HEAD_PX = 30; // "PASSED — CONGRATULATIONS!" (24) and the space above it (6)
const ROW_PX = 48;
// The paper, drawn inside the sheet while it is on the page (Black Belt's fix, its ResultsSheet.jsx):
// the named page in resultsSheet.css alone isn't enough — the browser took the first page's
// margins from testing-events.css's general @page (0.75in). A later unnamed @page wins over that
// one, and goes away with the sheet.
const PAGE_RULE = '@page { size: letter portrait; margin: 0.5in; }';

// Splits the classes into pages (pure; exported for the checks).
//   classes: [{ id, name, rows }]  → [{ items: [{ type: 'band' | 'head' | 'row' | 'none', … }] }]
// Each class starts a new page; a class with no rows is left out; a page that goes on with a
// class repeats its band and heading with "(continued)".
export function resultsPages(classes, { bodyPx = BODY_PX } = {}) {
  const pages = [];
  for (const cls of classes) {
    if (cls.rows.length === 0) continue;
    let page = null;
    cls.rows.forEach((row) => {
      if (page === null || page.used + ROW_PX > bodyPx) {
        const continued = page !== null;
        page = {
          items: [
            { type: 'band', key: `band-${cls.id}-${pages.length}`, text: cls.name, continued },
            { type: 'head', key: `head-${cls.id}-${pages.length}`, continued },
          ],
          used: BAND_PX + HEAD_PX,
        };
        pages.push(page);
      }
      page.items.push({ type: 'row', key: row.id, row });
      page.used += ROW_PX;
    });
  }
  // Nobody passed anywhere yet: one page that says so (never a blank sheet).
  if (pages.length === 0) pages.push({ items: [{ type: 'none', key: 'none' }], used: 0 });
  return pages;
}

export default function ResultsSheet({ eventName, subLine, classes, printedAt }) {
  const pages = resultsPages(classes);
  const foot = T.resultsSheetFoot(eventName, printedAt);

  return createPortal(
    <div className="grading-print rs-print" lang="en">
      <style>{PAGE_RULE}</style>
      {pages.map((page, index) => (
        <section key={index} className="rs-page">
          <h1 className="rs-title">
            {T.resultsSheetTitle(eventName)}
            {page.items[0]?.continued && ` ${T.RESULTS_SHEET_CONTINUED}`}
          </h1>
          <p className="rs-sub">{subLine}</p>
          <div className="rs-body">
            {page.items.map((item) => {
              if (item.type === 'none') {
                return (
                  <p key={item.key} className="rs-none">
                    {T.RESULTS_NONE_PASSED}
                  </p>
                );
              }
              if (item.type === 'band') {
                return (
                  <div key={item.key} className="rs-band">
                    {item.text}
                    {item.continued && ` ${T.RESULTS_SHEET_CONTINUED}`}
                  </div>
                );
              }
              if (item.type === 'head') {
                return (
                  <div key={item.key} className="rs-head">
                    {T.RESULTS_PASSED_HEADING}
                    {item.continued && ` ${T.RESULTS_SHEET_CONTINUED}`}
                  </div>
                );
              }
              const { row } = item;
              return (
                <div key={item.key} className="rs-row">
                  <span className="rs-name">{row.name}</span>
                  <span className="rs-belt">
                    {/* A student whose rank has no next belt set: only the PASSED box */}
                    {row.belt && (
                      <>
                        <span className="rs-new">{T.RESULTS_NEW_BELT}</span>
                        <Belt belt={row.belt} size="dialog" />
                        <span className="rs-to">{row.belt.name}</span>
                      </>
                    )}
                    <span className="rs-pass">{T.RESULTS_PASSED_BOX}</span>
                  </span>
                </div>
              );
            })}
          </div>
          <div className="rs-foot">
            <span>{foot}</span>
            <span>{T.resultsSheetPage(index + 1, pages.length)}</span>
          </div>
        </section>
      ))}
    </div>,
    document.body,
  );
}
