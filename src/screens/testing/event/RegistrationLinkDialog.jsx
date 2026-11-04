// RegistrationLinkDialog.jsx — the event's registration link, its QR code, and the flyer (R2, R3).
// Why it exists: Star v0.90 (one link per event — a Color Belt event belongs to one school).
// The event page header's outline button "Registration link" (ti-qrcode) opens it.
// Since the design review's part 2 (CB10, rulebook v0.422, v1.015, v1.106) the box itself is the
// shared one (src/components/RegistrationLinkBox.jsx); this file only hands it Color Belt's parts:
//   - the event name and Color Belt's line saying whether registration is open (and until when)
//   - one card: "<School> school", the QR code, the link, Copy link (the first focus; the page's
//     toast "Link copied"), Download QR code (a 1024-pixel PNG named
//     "November Children Testing - Worcester QR code.png") and Print flyer (Color Belt's flyer below)
//   - a failed copy or download shows its amber note inside the box (the shared box's words)
//   - Close (PC / tablet); phones get a full screen with a back arrow
// The link is made by src/lib/testing/qr.js (always the fixed production address, plan §8) and the
// QR pictures by the shared src/lib/qr.js — both in the browser, no network.
//
// The flyer (R3) is one letter-size, black-and-white page: school logo, school name, event
// name, testing date, "Location: <school>, <address>", "Register by <closing date>", a large
// QR code and the short link. The shared box draws it into the page only while printing; the
// print stylesheet (testing-events.css, @media print) hides everything else.
import { createPortal } from 'react-dom';
import Logo from '../../../components/Logo.jsx';
import RegistrationLinkBox from '../../../components/RegistrationLinkBox.jsx';
import { qrSvgDataUrl } from '../../../lib/qr.js';
import { registrationLink } from '../../../lib/testing/qr.js';
import { addressLine } from '../../settings/text.js';
import * as T from '../text.js';

// "https://tkd-dashboard.pages.dev/register/p4w9tdkm" → "tkd-dashboard.pages.dev/register/p4w9tdkm"
const shortLink = (link) => link.replace(/^https?:\/\//, '');

// The printed flyer. `address` is the school's address object or null (just the school name).
function Flyer({ event, school, address, link }) {
  const qr = qrSvgDataUrl(link);
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

// school: the event's school name ("Worcester"); address: Settings → Schools' address or null.
// onCopied: a copy worked (the page shows its "Link copied" toast).
export default function RegistrationLinkDialog({ event, school, address, isPhone, onCopied, onClose }) {
  const link = registrationLink(event.publicCode);
  // A damaged code gives no link: then there is no card, rather than an empty link to copy.
  const links = link ? [{ url: link, school, flyer: () => <Flyer event={event} school={school} address={address} link={link} /> }] : [];

  return (
    <RegistrationLinkBox
      title={T.REGISTRATION_LINK_TITLE}
      eventName={event.name}
      intro={T.linkDialogLine(event.state, event)}
      links={links}
      onCopied={onCopied}
      onClose={onClose}
      isPhone={isPhone}
    />
  );
}
