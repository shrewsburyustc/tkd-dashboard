// qr.js — the QR code and the registration link for a testing event.
// Why it exists: the Registration link dialog (R2) and the printed flyer (R3) show a QR code
// families scan with their phone camera. The code is made right here in the browser by the small
// `qrcode-generator` library (no network, nothing sent anywhere), always for the fixed production
// address https://tkd-dashboard.pages.dev/register/<code> — never the address of the page you are
// on, so a flyer printed from preview or a test copy still points at the real form (plan §8).
//
// How the screens use it (contract 0005 §5):
//   <img src={qrSvgDataUrl(event.publicCode)} alt="…" />    — always as an image, never innerHTML
//   registrationLink(event.publicCode) → 'https://tkd-dashboard.pages.dev/register/p4w9tdkm'
import qrcode from 'qrcode-generator';
import { registrationUrl } from './eventRules.js';

// Only codes the database can make: 6–12 lower-case letters and digits (it makes 8). Anything
// else gives no QR code, so a damaged value can never end up in a printed link.
const CODE_PATTERN = /^[a-z0-9]{6,12}$/;

// The full registration address for a public code. '' for a code that isn't valid.
export function registrationLink(code) {
  return CODE_PATTERN.test(code ?? '') ? registrationUrl(code) : '';
}

// The QR code for that address, as an SVG picture in a data URL (usable as <img src>).
// Error correction 'M' (about 15% of the picture can be damaged and it still scans — fine for
// paper); type number 0 = the library picks the smallest size that fits. '' for a bad code.
// The SVG is "scalable": it fills whatever size the <img> is given, staying sharp when printed.
export function qrSvgDataUrl(code) {
  const link = registrationLink(code);
  if (!link) return '';
  const qr = qrcode(0, 'M');
  qr.addData(link);
  qr.make();
  // margin 4 = the "quiet zone" of 4 empty squares around the code that scanners need.
  const svg = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
