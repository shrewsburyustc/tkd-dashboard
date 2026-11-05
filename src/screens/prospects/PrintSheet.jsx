// PrintSheet.jsx — the printed visitor sheet: one US Letter page per child (rulebook v0.636;
// approved mockup docs/Prospects/TKD-Prospect-Profile-Mockups.html rev 3, screen 4; Jeffrey's old
// paper card docs/Prospects/Old-visitor-information-card.png was the reference).
// Why it exists: the front desk still works on paper while a family tries classes. Print in a
// child's profile (ProspectPanel.jsx) gives one page per child, black on white, weight 500 at most:
//   - the school and its town, "Visitor information", "Printed [date] by [name]"
//   - the form they filled out and when it was sent (or who entered it at the desk)
//   - Student: full name, date of birth ("Not asked" for older sign-ups), age, free class
//   - Parent or guardian: name, phone, email, home address (on one line; "Not asked" without the question)
//   - every other answer of that form (the form asks its own questions once per family, so brothers'
//     and sisters' pages repeat them, and the family's details and the waiver)
//   - the waiver text, "I have read and agree to the waiver.", the signature picture — or "Signed
//     on [date]" once it was deleted (90 days after the free class, v0.242) — and the date signed
//   - For staff use: 15 numbered boxes (the date on top, initials below; 3 rows of 5) and Comments
//   - "Private: keep in the locked drawer, shred when done." and the child's full name
// A sheet that doesn't fit the paper keeps the details, the answers and the 15 boxes on its first
// page and puts the waiver, the signature and the date signed on a page of their own right after
// it (v0.636's default). Every page's footer names its child; there are no page numbers (design
// review: "page 1 of 2" was wrong once a sheet spilled over onto a second page).
//
// How it prints (Receipt.jsx's method, the shared receipt): the pages are drawn straight into <body>
// (a "portal", outside the window and the page), in three steps:
//   1. measure — the pages are laid out invisibly at the paper's width (7.5in inside its margins)
//      and each child's page is measured (a ruler in the browser: getBoundingClientRect);
//   2. split — a page taller than the paper (10.2in inside its margins, a little less for safety)
//      is drawn again as two pages;
//   3. print — once the pictures have loaded, the browser's print window opens (window.print();
//      "Save as PDF" is one of its printers), and the pages are removed again when the browser says
//      printing is over ('afterprint').
// prospects.css gives the sheet a named paper (@page pp-visitor: letter, 0.4in × 0.5in margins) and
// hides everything else while printing (its rule is written extra-specific so it wins over
// testing-events.css's own print rule, as the receipt's does).
//
// Props:
//   job     { key, children: [{ detail, signature }], today, printedBy }
//           detail = one child's prospect as getProspect gives it; signature = the family's picture
//           (a data: URL), or null when it was deleted; today = the school's 'YYYY-MM-DD'
//   onDone  called when printing is over
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconSquareCheck } from '@tabler/icons-react';
import Logo from '../../components/Logo.jsx';
import { addressFieldOf, addressLine, answerFieldsOf, childAge, childFullName, isWideAnswer, waiverFieldOf } from '../../lib/prospects/child.js';
import * as T from './text.js';

// The paper inside its margins, at 96px per inch: 10.2in tall. A page measured taller than this
// (less a little room, as print can round a line differently) is split in two.
const PAGE_PX = 979;
const ROOM_PX = 12;
// How long to wait for the pictures (the logo, the signature) before printing anyway.
const PICTURE_WAIT_MS = 3000;

// Every <img> inside `box` has loaded (or failed), or the wait is over.
function picturesReady(box) {
  const pending = [...(box?.querySelectorAll('img') ?? [])].filter((img) => !img.complete);
  if (pending.length === 0) return Promise.resolve();
  const all = Promise.all(pending.map((img) => new Promise((resolve) => {
    img.addEventListener('load', resolve, { once: true });
    img.addEventListener('error', resolve, { once: true });
  })));
  return Promise.race([all, new Promise((resolve) => window.setTimeout(resolve, PICTURE_WAIT_MS))]);
}

// One filled-in line with its small label under it (the old card's "Name: ______" look)
function Line({ span, value, label }) {
  return (
    <div className={`pps-f pps-f--${span}`}>
      <div className="pps-v">{value}</div>
      <div className="pps-k">{label}</div>
    </div>
  );
}

// For staff use: 15 numbered boxes, 3 rows of 5 — each a date box ("1   /") over an initials box
function StaffPart() {
  const rows = [0, 1, 2];
  return (
    <div className="pps-staff-part">
      <p className="pps-stafft">{T.SHEET_STAFF}</p>
      <div className="pps-staff">
        <div>
          <p className="pps-box-title">{T.SHEET_TRIAL}</p>
          <div className="pps-boxes">
            {rows.map((row) => [
              ...[1, 2, 3, 4, 5].map((n) => (
                <div key={`d${row}-${n}`} className="pps-day">
                  <span className="pps-n">{row * 5 + n}</span>/
                </div>
              )),
              ...[1, 2, 3, 4, 5].map((n) => <div key={`i${row}-${n}`} />),
            ])}
          </div>
          <p className="pps-hint">{T.SHEET_BOXES_HINT}</p>
        </div>
        <div>
          <p className="pps-box-title">{T.SHEET_COMMENTS}</p>
          <div className="pps-com">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div key={n} className="pps-ln" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// One printed page. part: 'whole' (everything), 'details' (a split sheet's first page: no waiver)
// or 'waiver' (its second page: the waiver part only).
function Page({ child, part, today, printedBy }) {
  const p = child.detail;
  const name = childFullName(p);
  const age = childAge(p, today);
  const b = p.booking;
  const addressField = addressFieldOf(p.fields);
  const waiver = waiverFieldOf(p.fields);
  const answers = answerFieldsOf(p.fields).map((f) => {
    const words = T.answerWords(f, p.answers?.[f.id]);
    return { f, words, wide: isWideAnswer(f, words) };
  });
  const freeClass = b && b.status === 'booked' ? T.classLineYear(b) : b?.status === 'cancelled' ? T.BOOKING_CANCELLED : T.SHEET_NO_TIME;
  const signedDay = p.signedAt ? T.dayOf(p.signedAt) : '';

  return (
    <section className="pps-page" data-pps-page>
      <header className="pps-head">
        <Logo size={52} alt="" />
        <div className="pps-head-left">
          <p className="pps-school">{T.SCHOOL_FULL}</p>
          <p className="pps-sub">{T.SCHOOL_NAME[p.locationCode] ?? ''}</p>
        </div>
        <div className="pps-head-right">
          <p className="pps-title">{T.VISITOR_INFORMATION}</p>
          <p className="pps-sub">{T.printedBy(T.longDate(today), printedBy)}</p>
        </div>
      </header>
      <div className="pps-form">
        <span>
          {T.FORM_WORD} <b>{p.formName}</b>
        </span>
        <span>{T.sheetSentLine(T.sentHow(p), T.dayOf(p.signedUpAt), T.clockOf(p.signedUpAt))}</span>
      </div>

      {part !== 'waiver' && (
        <>
          <h2 className="pps-sec">{T.SHEET_STUDENT}</h2>
          <div className="pps-grid">
            <Line span={3} value={name} label={T.SHEET_NAME} />
            <Line span={2} value={p.childDob ? T.longDate(p.childDob, false) : T.SHEET_NOT_ASKED} label={T.DATE_OF_BIRTH} />
            <Line span={1} value={age ?? ''} label={T.SHEET_AGE} />
            <Line span={6} value={freeClass} label={T.FREE_CLASS} />
          </div>

          <h2 className="pps-sec">{T.PARENT}</h2>
          <div className="pps-grid">
            <Line span={3} value={p.parentName} label={T.SHEET_NAME} />
            <Line span={3} value={p.parentPhone} label={T.PHONE} />
            <Line span={3} value={p.parentEmail} label={T.SHEET_EMAIL} />
            <Line span={3} value={addressField ? addressLine(p.answers?.[addressField.id]) : T.SHEET_NOT_ASKED} label={T.HOME_ADDRESS} />
          </div>

          {answers.length > 0 && (
            <>
              <h2 className="pps-sec">{T.HEAD_ANSWERS}</h2>
              <div className="pps-qa">
                {answers.map(({ f, words, wide }) => (
                  <div key={f.id} className={wide ? 'is-wide' : undefined}>
                    <div className="pps-q">{f.label}</div>
                    <div className="pps-a">{words}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {part !== 'details' && waiver && (
        <div className="pps-waiver-part">
          <h2 className="pps-sec">{T.HEAD_WAIVER}</h2>
          <p className="pps-waiver">{waiver.text}</p>
          {p.answers?.[waiver.id] === true && (
            <p className="pps-agree">
              {/* the ticked box as a drawn icon (prints the same on every device; no emoji) */}
              <IconSquareCheck size={14} aria-hidden="true" />
              {T.SHEET_AGREE}
            </p>
          )}
          <div className="pps-sign">
            <div>
              <div className="pps-sign-img">
                {child.signature ? <img src={child.signature} alt="" /> : signedDay ? <span>{T.signedOn(signedDay)}</span> : null}
              </div>
              <div className="pps-k">{T.SHEET_SIGNATURE}</div>
            </div>
            <div>
              <div className="pps-v">{signedDay}</div>
              <div className="pps-k">{T.DATE_SIGNED}</div>
            </div>
          </div>
        </div>
      )}

      {/* the 15 boxes and the footer sit at the foot of the paper */}
      <div className="pps-bottom">
        {part !== 'waiver' && <StaffPart />}
        <footer className="pps-foot">
          <span>{T.SHEET_PRIVATE}</span>
          <span>{name}</span>
        </footer>
      </div>
    </section>
  );
}

export default function PrintSheet({ job, onDone }) {
  const boxRef = useRef(null);
  const [split, setSplit] = useState(null); // null while measuring; then one true / false per child
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  // 1–2. Measure each child's page (drawn whole, invisibly) once, before anything prints.
  useLayoutEffect(() => {
    if (split !== null || !boxRef.current) return;
    const pages = [...boxRef.current.querySelectorAll('[data-pps-page]')];
    setSplit(pages.map((el) => el.getBoundingClientRect().height > PAGE_PX - ROOM_PX));
  }, [split]);

  // 3. Print once the pages are final and their pictures have loaded; done after the print window.
  useEffect(() => {
    if (split === null) return undefined;
    let cancelled = false;
    const done = () => onDoneRef.current();
    window.addEventListener('afterprint', done);
    picturesReady(boxRef.current).then(() => {
      if (!cancelled) window.print();
    });
    return () => {
      cancelled = true;
      window.removeEventListener('afterprint', done);
    };
  }, [split]);

  // The pages in order: each child whole, or (split) its details page then its waiver page.
  const pages = [];
  job.children.forEach((child, i) => {
    if (split?.[i]) pages.push({ child, part: 'details' }, { child, part: 'waiver' });
    else pages.push({ child, part: 'whole' });
  });

  return createPortal(
    // aria-hidden: never read on screen (it is invisible there); only paper shows it
    <div ref={boxRef} className={`pp-print${split === null ? ' is-measuring' : ''}`} aria-hidden="true">
      {pages.map((pg) => (
        <Page key={`${pg.child.detail.id}-${pg.part}`} child={pg.child} part={pg.part} today={job.today} printedBy={job.printedBy} />
      ))}
    </div>,
    document.body,
  );
}
