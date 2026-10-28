// qr.js — the shared QR code helper: the picture in the Registration link box and the
// "Download QR code" PNG file (design review M5, rulebook v1.015 / v1.106).
// Why it exists: Color Belt (lib/testing/qr.js), Star (lib/star/links.js), Camps (lib/camps/qr.js)
// and Black Belt (lib/blackBelt/qr.js) each made the same QR code with their own copy of
// `qrSvgDataUrl`, and only Camps (1024 px) and Black Belt (about 450 px) could save a PNG, each
// with its own file name. This file does it once: the same QR code as all four today (the small
// `qrcode-generator` library, error correction M, a 4-square quiet zone — made right here in the
// browser, no network, nothing sent anywhere), a PNG of exactly 1024 × 1024 pixels (big enough to
// print), and one file name, "[event] - [school] QR code.png", with a plain hyphen.
// The sections keep building their own links (each has its own address and code rule); this file
// only turns a finished link into a picture. The old copies stay until each section switches.
//
// How the shared box (components/RegistrationLinkBox.jsx) uses it:
//   <img src={qrSvgDataUrl(link)} alt="…" />          — always as an image, never inserted HTML
//   const blob = await qrPngBlob(link);                 — Download QR code (null = it failed)
//   qrFileName('November Children Testing', 'Worcester') → 'November Children Testing - Worcester QR code.png'
// qrSvgDataUrl, qrFileName and qrPngLayout need no browser (src/lib/shared/checks.mjs runs them
// with plain `node`); qrPngBlob draws on a <canvas>, so outside a browser it answers null.
import qrcode from 'qrcode-generator';

const QUIET_ZONE = 4; // empty squares around the code that scanners need (all four copies use 4)
export const QR_PNG_SIZE = 1024; // pixels, both ways (rulebook v1.106: Camps' size today)

// Only a finished web link: http(s)://…, no spaces, not absurdly long. Anything else gives no QR
// code, so a damaged value can never end up in a picture or a file.
const LINK = /^https?:\/\/\S+$/;
const isLink = (link) => typeof link === 'string' && link.length <= 2000 && LINK.test(link);

// The QR code "matrix" for a link, or null. Type number 0 = the library picks the smallest size
// that fits; 'M' = about 15% of the picture can be damaged and it still scans (fine for paper).
function makeQr(link) {
  if (!isLink(link)) return null;
  const qr = qrcode(0, 'M');
  qr.addData(link);
  qr.make();
  return qr;
}

// The QR code as an SVG picture in a data URL (usable as <img src>). "scalable": it fills
// whatever size the <img> is given and stays sharp, printed too. '' for anything but a link.
export function qrSvgDataUrl(link) {
  const qr = makeQr(link);
  if (!qr) return '';
  const svg = qr.createSvgTag({ cellSize: 4, margin: QUIET_ZONE, scalable: true });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// Where the squares go on the PNG: every square a whole number of pixels (crisp edges, no blur),
// as big as fits in `size`, and the code in the middle — the few pixels left over are added to the
// white border. `modules` = squares per side of the code (without the quiet zone).
//   → { size, cell (pixels per square), offset (pixels from the edge to the first square) }
export function qrPngLayout(modules, size = QR_PNG_SIZE) {
  const cells = modules + QUIET_ZONE * 2;
  const cell = Math.max(1, Math.floor(size / cells));
  const offset = Math.floor((size - cell * modules) / 2);
  return { size, cell, offset };
}

// The QR code as a PNG file (a Blob), exactly `size` × `size` pixels, black squares on white —
// for "Download QR code". Drawn straight onto a <canvas> (the same squares as the SVG), so nothing
// is loaded from anywhere. Resolves null for a bad link, or where there is no canvas (Node) or the
// browser can't make the picture; the box then says so (shared words, QR_FAILED).
export function qrPngBlob(link, size = QR_PNG_SIZE) {
  const qr = makeQr(link);
  if (!qr || typeof document === 'undefined') return Promise.resolve(null);
  const modules = qr.getModuleCount();
  const { cell, offset } = qrPngLayout(modules, size);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#000000';
  for (let row = 0; row < modules; row += 1) {
    for (let col = 0; col < modules; col += 1) {
      if (qr.isDark(row, col)) ctx.fillRect(offset + col * cell, offset + row * cell, cell, cell);
    }
  }
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? null), 'image/png');
  });
}

// Characters a Windows or Mac file name can't hold (and invisible control characters).
const BAD_FILE_CHARACTERS = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;
const clean = (text) => String(text ?? '').replace(BAD_FILE_CHARACTERS, '').replace(/\s+/g, ' ').trim();

// The downloaded file's name (rulebook v1.106), with a plain hyphen:
//   ('November Children Testing', 'Worcester') → 'November Children Testing - Worcester QR code.png'
//   ('April Vacation Camp', null)              → 'April Vacation Camp QR code.png'  (one link for both schools)
// Characters a file name can't hold are dropped and runs of spaces become one.
export function qrFileName(eventName, schoolName = null) {
  const base = [clean(eventName), clean(schoolName)].filter(Boolean).join(' - ');
  return base ? `${base} QR code.png` : 'QR code.png';
}

// Saves a Blob as a file: a temporary link to it is clicked, then thrown away. (The browser's
// "download" attribute makes it save the file instead of opening it.)
export function saveFile(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
