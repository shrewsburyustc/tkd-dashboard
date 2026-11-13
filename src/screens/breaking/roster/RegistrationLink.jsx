// RegistrationLink.jsx — an event's family link, its QR code and its flyer (the "Registration link" button).
// Why it exists: every section opens the same shared box (components/RegistrationLinkBox.jsx: school card, QR
// picture, address, Copy link, Download QR code, Print flyer). This file hands it Board breaking's parts:
//   - the event's name and one line saying whether families can register now;
//   - ONE card for the event's school (an event belongs to one school, rulebook v1.300);
//   - the address: breakingLink(code) = the school's one public address + /breaking/<code>. The family page itself
//     is built later, so for now the address is a placeholder with its final shape;
//   - the flyer: one black-and-white letter page (school, "Board breaking", the event's name and date, the school,
//     a big QR code and the short link), drawn into the page only while printing (Color belt testing's flyer
//     look, the same .flyer classes in testing-events.css).
//
// Props: event ({ name, eventDate, locationCode, publicCode, registrationOpen }), isPhone, onCopied(), onClose()
import { createPortal } from 'react-dom';
import Logo from '../../../components/Logo.jsx';
import RegistrationLinkBox from '../../../components/RegistrationLinkBox.jsx';
import { qrSvgDataUrl } from '../../../lib/qr.js';
import { breakingLink } from '../../../lib/breaking/breakingRules.js';
import * as T from '../../../lib/breaking/text/roster.js';

const shortLink = (link) => link.replace(/^https?:\/\//, '');

function Flyer({ event, school, link }) {
  const qr = qrSvgDataUrl(link);
  return createPortal(
    <div className="flyer-print">
      <div className="flyer">
        <Logo size={120} alt="" />
        <p className="flyer-school">{T.FLYER_SCHOOL}</p>
        <h1 className="flyer-title">{event.name}</h1>
        <p className="flyer-date">{T.longDate(event.eventDate)}</p>
        <p className="flyer-line">{T.flyerLocation(school)}</p>
        {qr && <img className="flyer-qr" src={qr} alt="" />}
        <p className="flyer-line">{T.flyerScan(shortLink(link))}</p>
      </div>
    </div>,
    document.body,
  );
}

export default function RegistrationLink({ event, isPhone, onCopied, onClose }) {
  const school = T.schoolName(event.locationCode);
  const link = breakingLink(event.publicCode);
  return (
    <RegistrationLinkBox
      title={T.REGISTRATION_LINK}
      eventName={event.name}
      intro={event.registrationOpen ? T.LINK_INTRO_OPEN : T.LINK_INTRO_CLOSED}
      links={[{ url: link, school, flyer: () => <Flyer event={event} school={school} link={link} /> }]}
      onCopied={onCopied}
      onClose={onClose}
      isPhone={isPhone}
    />
  );
}
