// qr.js — Camps' old QR code helper, kept only as a yardstick (contract 0013 §5.3).
// Why it still exists: since rulebook v0.733 (design review C11) the camp page's Registration link
// box is the dashboard's shared one (components/RegistrationLinkBox.jsx), which draws the QR code
// and saves the 1024-pixel PNG with the shared src/lib/qr.js. Nothing on screen uses this file any
// more. It stays because the shared checks (src/lib/shared/checks.mjs, a shared file Camps doesn't
// change) compare the shared QR picture with this one, to prove a camp's QR code didn't change.
// Its PNG maker and the old "april-vacation-camp-qr.png" file name went with Camps' own box.
// The code is made right here in the browser by the small `qrcode-generator` library (no network,
// nothing sent anywhere), for the production address https://tkd-dashboard.pages.dev/camp/<code>
// (in preview mode, the preview's own address — see campLink in campRules.js).
//
//   campLink(camp.publicCode) → 'https://tkd-dashboard.pages.dev/camp/k7m2qp4x' (the one definition
//     lives in campRules.js; re-exported here)
//   campQrSvgDataUrl(camp.publicCode) → the QR code as an SVG data URL ('' for a bad code)
import qrcode from 'qrcode-generator';
import { campLink } from './campRules.js';

export { campLink };

const MARGIN = 4; // the "quiet zone": 4 empty squares around the code that scanners need

// The QR code object for a camp's link, or null for a bad code. Error correction 'M' (about 15%
// of the picture can be damaged and it still scans); type number 0 = the smallest size that fits.
function makeQr(code) {
  const link = campLink(code);
  if (!link) return null;
  const qr = qrcode(0, 'M');
  qr.addData(link);
  qr.make();
  return qr;
}

// The QR code as an SVG picture in a data URL (usable as <img src>). '' for a bad code.
// "scalable": it fills whatever size the <img> is given and stays sharp.
export function campQrSvgDataUrl(code) {
  const qr = makeQr(code);
  if (!qr) return '';
  const svg = qr.createSvgTag({ cellSize: 4, margin: MARGIN, scalable: true });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
