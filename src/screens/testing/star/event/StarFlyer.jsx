// StarFlyer.jsx — the printed flyer of one school's registration link (Events mockup screen 12).
// Why it exists: v0.92 / v0.99 / v0.107 — one letter-size, black-and-white page PER SCHOOL, made
// only from what the event already holds:
//   school logo · "Jae H. Jeong's U.S. Taekwondo Center" · "For Shrewsbury school students" (large,
//   boxed) · the event name · "Saturday, November 14, 2026 · 10:00 AM" · "Location: <Where school>,
//   <street address>" · that school's QR code · "Scan to register" · the link · "Register by …."
//   (only when a closing date is set) · the note for families (only when there is one).
// "For … students" is the school of THE LINK (whose families the flyer is for); "Location" is
// where the testing is held (Where, v0.87) — they can differ.
//
// It is drawn into the page (a "portal" into <body>) only while printing; the print rules hide
// everything else. The wrapper keeps Color Belt's class name "flyer-print", because Color Belt's
// print rule (testing-events.css) hides every other child of <body> while printing; Star's own
// look for the page lives in star.css (.st-flyer).
import { createPortal } from 'react-dom';
import Logo from '../../../../components/Logo.jsx';
import * as T from '../events/text.js';

// "https://tkd-dashboard.pages.dev/star/fa2kxm7p" → "tkd-dashboard.pages.dev/star/fa2kxm7p"
export const shortLink = (link) => link.replace(/^https?:\/\//, '');

// event: the StarEvent. school: { school: 'Shrewsbury', link, qr }. whereSchool: 'Shrewsbury' (the
// Where school's name). addressText: "123 Main St, Shrewsbury, MA 01545" or null.
export default function StarFlyer({ event, school, whereSchool, addressText }) {
  return createPortal(
    <div className="flyer-print st-flyer-print">
      <div className="st-flyer">
        <Logo size={96} alt="" />
        <p className="st-flyer-school">{T.FLYER_SCHOOL}</p>
        <p className="st-flyer-for">{T.flyerFor(school.school)}</p>
        <h1 className="st-flyer-title">{event.name}</h1>
        <p className="st-flyer-big">{T.flyerWhen(event.testingDate, event.startTime)}</p>
        <p className="st-flyer-line">{T.flyerLocation(whereSchool, addressText)}</p>
        {school.qr && <img className="st-flyer-qr" src={school.qr} alt={T.qrAlt(school.school, shortLink(school.link))} />}
        <p className="st-flyer-big">{T.SCAN_TO_REGISTER}</p>
        <p className="st-flyer-url">{shortLink(school.link)}</p>
        {event.autoCloseOn && <p className="st-flyer-line">{T.flyerRegisterBy(event.autoCloseOn)}</p>}
        {event.note && <p className="st-flyer-note">{event.note}</p>}
      </div>
    </div>,
    document.body,
  );
}
