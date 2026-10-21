// qr.js — the two family registration links of a Black Belt cycle, their QR codes, and the PNG
// file for "Download QR code" (Registration links dialog, Cycles 7).
// Why it exists: each cycle has two links, one per school (the link sets the candidate's school,
// v0.900). The QR code is made right here in the browser by the small `qrcode-generator` library
// (already used by Color Belt — no new package, no network, nothing sent anywhere), always for the
// fixed production address https://tkd-dashboard.pages.dev/black-belt/<code> — never the address
// of the page you are on, so a QR code made in preview or a test copy still points at the real
// form (contract 0016-B1 §1.5, OP-2). In preview, __tkdPreview.bbLinks() prints local addresses
// that preview can open (OP-20).
//
// How the screens use it:
//   blackBeltLink(cycle.codes.worcester) → 'https://tkd-dashboard.pages.dev/black-belt/p4w9tdkm'
//   <img src={qrSvgDataUrl(code)} alt="…" />          — always as an image, never innerHTML
//   const blob = await qrPngBlob(code)                  — black on white PNG, 10 px per square
//   qrFileName('Spring 2027', 'Shrewsbury')  → 'Black Belt Spring 2027 - Shrewsbury QR.png'
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

// The QR code as a PNG file (a Blob) for "Download QR code": drawn on a <canvas>, black squares
// on white, cellPx pixels per square, with the 4-square quiet zone (about 450 px wide at 10 px —
// OP-19). Resolves to null for a bad code or where there is no canvas (e.g. Node).
export function qrPngBlob(code, { cellPx = 10 } = {}) {
  const qr = makeQr(code);
  if (!qr || typeof document === 'undefined') return Promise.resolve(null);
  const count = qr.getModuleCount(); // squares per side
  const size = (count + QUIET_ZONE * 2) * cellPx;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#000000';
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (qr.isDark(row, col)) ctx.fillRect((col + QUIET_ZONE) * cellPx, (row + QUIET_ZONE) * cellPx, cellPx, cellPx);
    }
  }
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? null), 'image/png');
  });
}

// Characters a Windows / Mac file name can't hold (and invisible control characters).
const BAD_FILE_CHARACTERS = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;

// The downloaded file's name: 'Black Belt Spring 2027 - Shrewsbury QR.png'. Characters a file
// name can't hold are dropped; runs of spaces become one.
export function qrFileName(cycleName, schoolName) {
  const clean = (text) => String(text ?? '').replace(BAD_FILE_CHARACTERS, '').replace(/\s+/g, ' ').trim();
  return `${clean(`Black Belt ${clean(cycleName)} - ${clean(schoolName)} QR`)}.png`;
}
