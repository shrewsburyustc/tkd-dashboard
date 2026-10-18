// RegistrationLinkDialog.jsx — the event's registration link, its QR code, and the flyer (R2, R3).
// Why it exists: Star v0.90 (one link per event — a Color Belt event belongs to one school).
// The event page header's outline button "Registration link" (ti-qrcode) opens it:
//   - a line saying whether registration is open (and until when)
//   - a card: the school, the QR code, the link, Copy link (ti-copy, toast "Link copied") and
//     Print flyer (ti-printer)
//   - Close (PC / tablet); phones get a full screen with a back arrow
// The QR code is made in the browser by src/lib/testing/qr.js — no network — always for the
// fixed production address (plan §8), and drawn as an <img> (never as inserted HTML).
//
// The flyer (R3) is one letter-size, black-and-white page: school logo, school name, event
// name, testing date, "Location: <school>, <address>", "Register by <closing date>", a large
// QR code and the short link. It is drawn into the page only while printing; the print
// stylesheet (testing-events.css, @media print) hides everything else.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconCopy, IconPrinter } from '@tabler/icons-react';
import Dialog from '../../../components/Dialog.jsx';
import Logo from '../../../components/Logo.jsx';
import { qrSvgDataUrl, registrationLink } from '../../../lib/testing/qr.js';
import { addressLine } from '../../settings/text.js';
import * as T from '../text.js';

// "https://tkd-dashboard.pages.dev/register/p4w9tdkm" → "tkd-dashboard.pages.dev/register/p4w9tdkm"
const shortLink = (link) => link.replace(/^https?:\/\//, '');

// The printed flyer. `address` is the school's address object or null (just the school name).
function Flyer({ event, school, address, qr, link }) {
  return createPortal(
    <div className="flyer-print">
      <div className="flyer">
        <Logo size={120} alt="" />
        <p className="flyer-school">{T.FLYER_SCHOOL}</p>
        <h1 className="flyer-title">{event.name}</h1>
        <p className="flyer-date">{T.longDate(event.testingDate)}</p>
        <p className="flyer-line">{T.flyerLocation(school, address ? addressLine(address) : null)}</p>
        {event.autoCloseOn && <p className="flyer-line flyer-strong">{T.flyerRegisterBy(event.autoCloseOn)}</p>}
        {qr && <img className="flyer-qr" src={qr} alt={T.qrAlt(shortLink(link))} />}
        <p className="flyer-line">{T.flyerScan(shortLink(link))}</p>
      </div>
    </div>,
    document.body,
  );
}

export default function RegistrationLinkDialog({ event, school, address, isPhone, onCopy, onClose }) {
  const link = registrationLink(event.publicCode);
  const qr = qrSvgDataUrl(event.publicCode);
  const [printing, setPrinting] = useState(false);

  // Print flyer: draw the flyer, then open the browser's print window. 'afterprint' fires when
  // that window closes (printed or cancelled); then the flyer is removed again.
  useEffect(() => {
    if (!printing) return undefined;
    const done = () => setPrinting(false);
    window.addEventListener('afterprint', done);
    // Wait one frame so the flyer (and its QR image) is on the page before printing.
    const frame = window.requestAnimationFrame(() => window.print());
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('afterprint', done);
    };
  }, [printing]);

  return (
    <>
      <Dialog title={T.REGISTRATION_LINK_TITLE} size="detail" fullScreen={isPhone} onRequestClose={onClose}>
        <p className="tdialog-sub ev-link-event">{event.name}</p>
        <p className="ev-link-line">{T.linkDialogLine(event.state, event)}</p>
        <div className="ev-link-card">
          <p className="ev-link-school">{T.schoolName(school)}</p>
          {qr && <img className="ev-link-qr" src={qr} alt={T.qrAlt(shortLink(link))} width={128} height={128} />}
          <p className="ev-link-url">{shortLink(link)}</p>
          <div className="ev-link-buttons">
            <button type="button" className="btn btn-sm" data-autofocus onClick={() => onCopy(link)}>
              {/* ti-copy = copy to clipboard */}
              <IconCopy size={16} aria-hidden="true" />
              {T.COPY_LINK}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setPrinting(true)}>
              {/* ti-printer = print */}
              <IconPrinter size={16} aria-hidden="true" />
              {T.PRINT_FLYER}
            </button>
          </div>
        </div>
        {!isPhone && (
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={onClose}>
              {T.CLOSE}
            </button>
          </div>
        )}
      </Dialog>
      {printing && <Flyer event={event} school={school} address={address} qr={qr} link={link} />}
    </>
  );
}
