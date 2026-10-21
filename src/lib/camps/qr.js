// qr.js — the QR code and the family sign-up link for a camp (contract 0013 §5.3).
// Why it exists: the Registration link dialog (C5) shows a QR code families scan with their phone
// camera, and "Download QR code" saves it as a picture the owner puts on his own flyer. The code
// is made right here in the browser by the small `qrcode-generator` library (no network, nothing
// sent anywhere), always for the fixed production address https://tkd-dashboard.pages.dev/camp/<code>
// — never the address of the page you are on, so a QR code made in preview still points at the
// real form.
//
// How the screens use it:
//   <img src={campQrSvgDataUrl(camp.publicCode)} alt="…" />   — always as an image, never innerHTML
//   campLink(camp.publicCode) → 'https://tkd-dashboard.pages.dev/camp/k7m2qp4x'
//   const blob = await campQrPngBlob(camp.publicCode); → save as qrFileName(camp.name)
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

// The QR code as a PNG file (a Blob) about `size` pixels wide, for Download QR code. The squares
// are drawn straight onto a canvas (the same squares as the SVG), so nothing is loaded from
// anywhere. Resolves null for a bad code or when the browser can't make the picture.
export function campQrPngBlob(code, size = 1024) {
  const qr = makeQr(code);
  if (!qr || typeof document === 'undefined') return Promise.resolve(null);
  const modules = qr.getModuleCount();
  const cells = modules + MARGIN * 2;
  const cell = Math.max(1, Math.floor(size / cells)); // whole pixels per square: crisp edges
  const canvas = document.createElement('canvas');
  canvas.width = cell * cells;
  canvas.height = cell * cells;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000000';
  for (let row = 0; row < modules; row += 1) {
    for (let col = 0; col < modules; col += 1) {
      if (qr.isDark(row, col)) ctx.fillRect((col + MARGIN) * cell, (row + MARGIN) * cell, cell, cell);
    }
  }
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? null), 'image/png');
  });
}

// The file name for the downloaded QR code: the camp name in lower case, every run of characters
// other than a–z and 0–9 replaced by one "-", "-" trimmed from both ends, at most 40 characters,
// then "-qr.png". "April Vacation Camp" → "april-vacation-camp-qr.png"; nothing left → "camp-qr.png".
export function qrFileName(campName) {
  const slug = String(campName ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug ? `${slug}-qr.png` : 'camp-qr.png';
}
