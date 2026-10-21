// links.js — the registration links and QR codes of a Star testing event (one per school).
// Why it exists: every Star event has TWO family links, one for Worcester and one for Shrewsbury,
// and the link sets the candidate's school (rulebook v0.98, v0.99). The Registration links dialog
// shows both side by side with their own QR code, the ⋯ menu copies either one, and each school
// gets its own printed flyer. Color Belt's src/lib/testing/qr.js can't be reused: it hard-codes
// the /register/ path and Color Belt's code rule, and it must not change (its live form uses it).
//
// The link ALWAYS uses the fixed production address https://tkd-dashboard.pages.dev — never the
// address of the page you are on — so a flyer printed from preview (localhost) or a test copy still
// points at the real form. The address is Color Belt's PUBLIC_ORIGIN (one place for it).
// The form itself lives at /star/<code> (CONTRACT-0006 OPEN-2), built in Star phase 4.
//
// The QR code is made right here in the browser by the small `qrcode-generator` library (no
// network, nothing sent anywhere), and shown as a picture: <img src={starQrSvgDataUrl(code)} />,
// never as innerHTML.
//
//   STAR_CODE_PATTERN                        /^[a-hjkmnp-z2-9]{8}$/ (contract 0006 §2.2)
//   isStarCode('fa2kxm7p')                   → true
//   starRegistrationLink('fa2kxm7p')         → 'https://tkd-dashboard.pages.dev/star/fa2kxm7p'
//                                              ('' for anything that isn't a valid code)
//   starQrSvgDataUrl('fa2kxm7p')             → 'data:image/svg+xml;charset=utf-8,…' ('' for a bad code)
//   starSchoolLinks(event)                   → [{ locationCode:'worcester', school:'Worcester', code, link },
//                                               { locationCode:'shrewsbury', school:'Shrewsbury', code, link }]
//      event: an app event from eventsApi (publicCodeWorcester / publicCodeShrewsbury) or a database
//      row (public_code_worcester / public_code_shrewsbury). Worcester first, as in the mockups.
//      A bad code gives link '' (the screen then shows no link and no QR code for that school).
import qrcode from 'qrcode-generator';
import { PUBLIC_ORIGIN } from '../testing/eventRules.js';
import { STAR_CODE_PATTERN } from './starEventRules.js';

// The code rule itself lives in starEventRules.js (the preview database uses it too, without
// pulling in the QR library); it is passed on from here for the screens.
export { STAR_CODE_PATTERN };

// The path the family form answers on (phase 4: star.html, functions/api/star/[code].js).
export const STAR_FORM_PATH = '/star/';

export function isStarCode(code) {
  return typeof code === 'string' && STAR_CODE_PATTERN.test(code);
}

// The full family link for one school's code, on the production address. '' for a bad code, so a
// damaged value can never end up in a copied or printed link.
export function starRegistrationLink(code) {
  return isStarCode(code) ? `${PUBLIC_ORIGIN}${STAR_FORM_PATH}${code}` : '';
}

// The QR code for that link, as an SVG picture in a data URL (usable as <img src>).
// Error correction 'M' (about 15% of the picture can be damaged and it still scans — fine for
// paper); type number 0 = the library picks the smallest size that fits. margin 4 = the empty
// "quiet zone" scanners need. The SVG is scalable: it stays sharp at any size, also printed.
export function starQrSvgDataUrl(code) {
  const link = starRegistrationLink(code);
  if (!link) return '';
  const qr = qrcode(0, 'M');
  qr.addData(link);
  qr.make();
  const svg = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// The two schools' links of one event, Worcester first.
export function starSchoolLinks(event) {
  const read = (camel, snake) => (event?.[camel] !== undefined ? event[camel] : event?.[snake]);
  const schools = [
    { locationCode: 'worcester', school: 'Worcester', code: read('publicCodeWorcester', 'public_code_worcester') },
    { locationCode: 'shrewsbury', school: 'Shrewsbury', code: read('publicCodeShrewsbury', 'public_code_shrewsbury') },
  ];
  return schools.map((s) => ({ ...s, code: isStarCode(s.code) ? s.code : null, link: starRegistrationLink(s.code) }));
}
