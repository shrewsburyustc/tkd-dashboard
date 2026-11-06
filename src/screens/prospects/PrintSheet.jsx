// PrintSheet.jsx — the printed visitor sheet: one US Letter sheet per child, one page except for a
// very long form (rulebook v0.636, v0.641 and v0.643; approved mockup
// docs/Prospects/TKD-Prospect-Profile-Mockups.html rev 3, screen 4, and picture
// docs/Prospects/ProspectProfile-Q7-print-A.png; Jeffrey's old paper card
// docs/Prospects/Old-visitor-information-card.png was the reference).
// Why it exists: the front desk still works on paper while a family tries classes. Print in a
// child's profile (ProspectPanel.jsx) gives one sheet per child, black on white:
//   - the school and its town, "Visitor information", "Printed [date] by [name]" (small)
//   - the form they filled out and when it was sent (or who entered it at the desk), on one line
//   - two boxes side by side (v0.643, picture docs/Prospects/PrintTop-B-whole-page.png), each value
//     under a small label and without a writing line (the family already gave it; a detail left
//     blank keeps a line to write on):
//       Student: full name (the biggest words in the boxes), date of birth ("Not asked" for older sign-ups),
//       age, free class
//       Parent or guardian: name, phone, email, home address (on one line; "Not asked" without
//       the question)
//   - every other answer of that form (the form asks its own questions once per family, so brothers'
//     and sisters' sheets repeat them, and the family's details and the waiver)
//   - the waiver text, "I have read and agree to the waiver.", the signature picture — or "Signed
//     on [date]" once it was deleted (90 days after the free class, v0.242) — and the date signed
//   - For staff use: 15 numbered boxes (the date on top, initials below; 3 rows of 5) and Comments
//   - "Private: keep in the locked drawer, shred when done." and the child's full name
// The signature, the date signed and the 15 boxes always print on the first page, at their own
// size (v0.641). A sheet too long for one page prints its answers one line each, like the old card
// ("School Attending: Spring Street School"), then the part above the signature up to 10% smaller;
// only a form far longer than any today goes on to a next page with the answers that don't fit
// (and, beside a very long waiver, the waiver's wording too). lib/prospects/sheetPlan.js picks
// which. Every page's footer names its child; there are no page numbers (design review: "page 1
// of 2" was wrong once a sheet spilled over onto a second page).
//
// How it prints (Receipt.jsx's method, the shared receipt): the pages are drawn straight into <body>
// (a "portal", outside the window and the page), in four steps:
//   1. measure — every child's sheet is laid out invisibly at the paper's width (7.5in inside its
//      margins), as it is and with its answers one line each, and measured (a ruler in the
//      browser: getBoundingClientRect);
//   2. plan — sheetPlan.js picks each sheet's layout from those heights;
//   3. check — a sheet that goes on to a next page is drawn as planned and its first page
//      measured again; while it's still too tall, one more answer moves on;
//   4. print — once the pictures have loaded, the browser's print window opens (window.print();
//      "Save as PDF" is one of its printers), and the pages are removed again when the browser says
//      printing is over ('afterprint').
// The paper: PAGE_RULE below, drawn with the sheet (see its note), and prospects.css's named page
// (pp-visitor: letter, 0.4in × 0.5in margins). prospects.css also hides everything else while
// printing (its rule is written extra-specific so it wins over testing-events.css's own print rule,
// as the receipt's does).
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
import { addressFieldOf, addressLine, answerFieldsOf, childAge, childFullName, isWideAnswer, questionLead, waiverFieldOf } from '../../lib/prospects/child.js';
import { LIMIT_PX, planSheet } from '../../lib/prospects/sheetPlan.js';
import * as T from './text.js';

// The paper while the sheet prints. An unnamed @page rule inside another section's print rules
// (finance.css 0.6in, testing-events.css 0.75in) beats the named pp-visitor page in Edge and
// Chrome, and its wider margins pushed every sheet's foot onto an extra page. A later unnamed
// @page wins over those, and goes away with the sheet (Color Belt's and Black Belt's results
// sheets do the same).
const PAGE_RULE = '@page { size: letter portrait; margin: 0.4in 0.5in; }';
// How long to wait for the pictures (the logo, the signature) before printing anyway.
const PICTURE_WAIT_MS = 3000;
// The most rounds of "the first page is still too tall: one more answer moves on" (a safety stop;
// it normally takes one or two). Each round draws the sheet again before the screen updates, and
// React itself stops with an error after about 50 such redraws in a row, so this stays well below.
const MAX_CHECKS = 20;
// The two layouts every sheet is measured in (step 1).
const AS_IT_IS = { kind: 'whole', compact: false, zoom: 1 };
const ONE_LINE = { kind: 'whole', compact: true, zoom: 1 };

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

// Step 1's ruler: each child's two measured sheets → the heights sheetPlan.js needs.
function measureSheets(box, count) {
  const height = (el) => (el ? el.getBoundingClientRect().height : 0);
  // a block's height with the space above it (its top margin)
  const withSpace = (el) => (el ? height(el) + (parseFloat(window.getComputedStyle(el).marginTop) || 0) : 0);
  const more = withSpace(box.querySelector('[data-pps-probe] .pps-more'));
  return Array.from({ length: count }, (_, i) => {
    const normal = box.querySelector(`[data-pps-measure="${i}-normal"]`);
    const compact = box.querySelector(`[data-pps-measure="${i}-compact"]`);
    const grid = compact?.querySelector('.pps-qa') ?? null;
    const top = grid ? grid.getBoundingClientRect().top : 0;
    return {
      normal: height(normal),
      compact: height(compact),
      top: height(compact?.querySelector('.pps-top')),
      grid: height(grid),
      bottoms: grid ? [...grid.children].map((el) => el.getBoundingClientRect().bottom - top) : [],
      waiverText: withSpace(compact?.querySelector('.pps-waiver')),
      more,
    };
  });
}

// One detail in the Student or Parent box: its small label, then the value (v0.643). `span` = how
// many of the box's 6 columns it takes; `big` = the child's name, the biggest words in the boxes.
function Line({ span, value, label, big = false }) {
  return (
    <div className={`pps-f pps-f--${span}${big ? ' pps-f--big' : ''}`}>
      <div className="pps-k">{label}</div>
      <div className="pps-v">{value}</div>
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

// One printed page: the part above the signature (.pps-top — the only part that may print
// smaller), the signature row, then the 15 boxes and the footer.
//   part     'whole' (the whole sheet) or a split sheet's 'first' / 'second' page
//   plan     the sheet's plan (sheetPlan.js): compact, zoom, and for a split sheet cut + waiverBack
//   index    the child's place in the job (the measuring and checking steps find pages by it)
//   measure  'normal' / 'compact' on step 1's invisible copies
function Page({ child, index, part, plan, today, printedBy, measure }) {
  const p = child.detail;
  const name = childFullName(p);
  const age = childAge(p, today);
  const b = p.booking;
  const addressField = addressFieldOf(p.fields);
  const waiver = waiverFieldOf(p.fields);
  const all = answerFieldsOf(p.fields).map((f) => {
    const words = T.answerWords(f, p.answers?.[f.id]);
    return { f, words, wide: isWideAnswer(f, words, plan.compact) };
  });
  // which answers print on this page: all of them on a whole sheet, else the first page keeps `cut`
  const cut = part === 'whole' ? all.length : plan.cut;
  const answers = part === 'second' ? all.slice(cut) : all.slice(0, cut);
  const answersGoOn = part === 'first' && cut < all.length;
  const answersHere = part === 'second' ? answers.length > 0 : all.length > 0;
  const wordingMovesOn = part !== 'whole' && plan.waiverBack;
  const freeClass = b && b.status === 'booked' ? T.classLineYear(b) : b?.status === 'cancelled' ? T.BOOKING_CANCELLED : T.SHEET_NO_TIME;
  const signedDay = p.signedAt ? T.dayOf(p.signedAt) : '';

  return (
    <section
      className={`pps-page${plan.compact ? ' is-compact' : ''}`}
      // the part above the signature printed up to 10% smaller (prospects.css reads it while printing)
      style={plan.zoom < 1 ? { '--pps-zoom': plan.zoom } : undefined}
      data-pps-measure={measure ? `${index}-${measure}` : undefined}
      data-pps-first={part === 'first' ? index : undefined}
    >
      <div className="pps-top">
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

        {part !== 'second' && (
          // Student and Parent or guardian side by side, each in its own box (v0.643)
          <div className="pps-people">
            <section className="pps-person">
              <h2 className="pps-sec">{T.SHEET_STUDENT}</h2>
              <div className="pps-grid">
                <Line span={6} value={name} label={T.SHEET_NAME} big />
                <Line span={4} value={p.childDob ? T.longDate(p.childDob, false) : T.SHEET_NOT_ASKED} label={T.DATE_OF_BIRTH} />
                <Line span={2} value={age ?? ''} label={T.SHEET_AGE} />
                <Line span={6} value={freeClass} label={T.FREE_CLASS} />
              </div>
            </section>
            <section className="pps-person">
              <h2 className="pps-sec">{T.PARENT}</h2>
              <div className="pps-grid">
                <Line span={3} value={p.parentName} label={T.SHEET_NAME} />
                <Line span={3} value={p.parentPhone} label={T.PHONE} />
                <Line span={6} value={p.parentEmail} label={T.SHEET_EMAIL} />
                <Line span={6} value={addressField ? addressLine(p.answers?.[addressField.id]) : T.SHEET_NOT_ASKED} label={T.HOME_ADDRESS} />
              </div>
            </section>
          </div>
        )}

        {answersHere && (
          <>
            <h2 className="pps-sec">{part === 'second' && cut > 0 ? T.HEAD_ANSWERS_CONTINUED : T.HEAD_ANSWERS}</h2>
            {answers.length > 0 && (
              <div className="pps-qa">
                {answers.map(({ f, words, wide }) => (
                  <div key={f.id} className={wide ? 'is-wide' : undefined}>
                    {/* one line each on a long sheet: "School Attending:" then the answer (v0.641) */}
                    <div className="pps-q">{plan.compact ? questionLead(f.label) : f.label}</div>
                    <div className="pps-a">{words}</div>
                  </div>
                ))}
              </div>
            )}
            {answersGoOn && <p className="pps-more">{cut > 0 ? T.SHEET_MORE_NEXT : T.SHEET_ANSWERS_NEXT}</p>}
          </>
        )}

        {waiver && (part !== 'second' || wordingMovesOn) && (
          <div className="pps-waiver-part">
            <h2 className="pps-sec">{T.HEAD_WAIVER}</h2>
            {/* a split sheet beside a very long waiver: its wording on the next page, a line here */}
            {part === 'first' && wordingMovesOn ? <p className="pps-more">{T.SHEET_WAIVER_NEXT}</p> : <p className="pps-waiver">{waiver.text}</p>}
            {part !== 'second' && p.answers?.[waiver.id] === true && (
              <p className="pps-agree">
                {/* the ticked box as a drawn icon (prints the same on every device; no emoji) */}
                <IconSquareCheck size={14} aria-hidden="true" />
                {T.SHEET_AGREE}
              </p>
            )}
          </div>
        )}
      </div>

      {/* the signature and the date signed: on the first page, always at their own size */}
      {part !== 'second' && waiver && (
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
      )}

      {/* the 15 boxes (first page only) and the footer sit at the foot of the paper */}
      <div className="pps-bottom">
        {part !== 'second' && <StaffPart />}
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
  const [plans, setPlans] = useState(null); // null while measuring; then one plan per child
  const [checked, setChecked] = useState(false); // every first page fits (or can't fit better)
  const checks = useRef(0);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  // 1–2. Measure each child's sheet both ways (drawn invisibly), then plan it.
  useLayoutEffect(() => {
    if (plans !== null || !boxRef.current) return;
    setPlans(measureSheets(boxRef.current, job.children.length).map((m) => planSheet(m)));
  }, [plans, job.children.length]);

  // 3. A sheet that goes on to a next page: its real first page must fit; if not, one more answer
  // moves on (or, with none left, the waiver's wording), and it's checked again.
  useLayoutEffect(() => {
    if (plans === null || checked || !boxRef.current) return;
    let moved = false;
    const next = plans.map((plan, i) => {
      if (plan.kind !== 'split') return plan;
      const first = boxRef.current.querySelector(`[data-pps-first="${i}"]`);
      if (!first || first.getBoundingClientRect().height <= LIMIT_PX) return plan;
      if (plan.cut > 0) {
        moved = true;
        return { ...plan, cut: plan.cut - 1 };
      }
      if (!plan.waiverBack) {
        moved = true;
        return { ...plan, waiverBack: true };
      }
      return plan; // nothing more can move on: it prints as it is
    });
    checks.current += 1;
    if (moved && checks.current < MAX_CHECKS) setPlans(next);
    else setChecked(true);
  }, [plans, checked]);

  // 4. Print once the pages are final and their pictures have loaded; done after the print window.
  useEffect(() => {
    if (!checked) return undefined;
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
  }, [checked]);

  const common = { today: job.today, printedBy: job.printedBy };
  let pages;
  if (plans === null) {
    // step 1: every sheet twice, and one "… on the next page." line to measure
    pages = [
      ...job.children.flatMap((child, i) => [
        <Page key={`${child.detail.id}-normal`} child={child} index={i} part="whole" plan={AS_IT_IS} measure="normal" {...common} />,
        <Page key={`${child.detail.id}-compact`} child={child} index={i} part="whole" plan={ONE_LINE} measure="compact" {...common} />,
      ]),
      <section key="probe" className="pps-page" data-pps-probe>
        <p className="pps-more">{T.SHEET_MORE_NEXT}</p>
      </section>,
    ];
  } else {
    pages = job.children.flatMap((child, i) => {
      const plan = plans[i];
      return plan.kind === 'split'
        ? [
            <Page key={`${child.detail.id}-first`} child={child} index={i} part="first" plan={plan} {...common} />,
            <Page key={`${child.detail.id}-second`} child={child} index={i} part="second" plan={plan} {...common} />,
          ]
        : [<Page key={`${child.detail.id}-whole`} child={child} index={i} part="whole" plan={plan} {...common} />];
    });
  }

  return createPortal(
    // aria-hidden: never read on screen (it is invisible there); only paper shows it
    <div ref={boxRef} className={`pp-print${checked ? '' : ' is-measuring'}`} aria-hidden="true">
      <style>{PAGE_RULE}</style>
      {pages}
    </div>,
    document.body,
  );
}
