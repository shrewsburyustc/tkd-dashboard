// qr.js — the two family registration links of a Black Belt cycle (Registration link box, Cycles 7).
// Why it exists: each cycle has two links, one per school (the link sets the candidate's school,
// v0.900), always for the fixed production address https://tkd-dashboard.pages.dev/black-belt/<code>
// — never the address of the page you are on, so a QR code made in preview or a test copy still
// points at the real form (contract 0016-B1 §1.5, OP-2). In preview, __tkdPreview.bbLinks() prints
// local addresses that preview can open (OP-20).
// Since the design review's part 2 (BB10, rulebook v1.015 / v1.106) the screens draw the QR picture
// and save the 1024-pixel PNG with the shared src/lib/qr.js (through components/
// RegistrationLinkBox.jsx); the old PNG maker and file name ("Black Belt … QR.png", about 450 px)
// are gone. This file keeps `blackBeltLink` (the address rule) and, like Star's links.js, its own
// qrSvgDataUrl only as the yardstick the shared checks (src/lib/shared/checks.mjs, "M5 QR") compare
// the shared picture with — made in the browser by the small `qrcode-generator` library.
//
// How the screens use it:
//   blackBeltLink(cycle.codes.worcester) → 'https://tkd-dashboard.pages.dev/black-belt/p4w9tdkm'
//   qrSvgDataUrl(code)                   → the picture as a data URL ('' for a bad code); checks only
// Nothing here is logged (S20).
import qrcode from 'qrcode-generator';
import { PUBLIC_ORIGIN } from '../testing/eventRules.js';
import { codeIsValid } from './rules.js';

// The empty border of 4 squares around the code that scanners need (the "quiet zone").
const QUIET_ZONE = 4;

// The full registration address for one school's code. '' for a code the database can't make,
// so a damaged value can never end up in a link or a QR code.
export function blackBeltLink(code) {
  return codeIsValid(code) ? `${PUBLIC_ORIGIN}/black-belt/${code}` : '';
}

// The QR code for the link as a "matrix" object from the library, or null for a bad code.
// Error correction 'M' (about 15% of the picture can be damaged and it still scans); type number
// 0 = the library picks the smallest size that fits.
function makeQr(code) {
  const link = blackBeltLink(code);
  if (!link) return null;
  const qr = qrcode(0, 'M');
  qr.addData(link);
  qr.make();
  return qr;
}

// The QR code as an SVG picture in a data URL (usable as <img src>). It is "scalable": it fills
// whatever size the <img> is given and stays sharp. '' for a bad code.
export function qrSvgDataUrl(code) {
  const qr = makeQr(code);
  if (!qr) return '';
  const svg = qr.createSvgTag({ cellSize: 4, margin: QUIET_ZONE, scalable: true });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

