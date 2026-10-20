// share.js — a form's public link and its QR code (Share dialog, mockup screen 7).
// Why it exists: staff copy the link for Instagram, Facebook or a text, and download or print the
// QR code for the front desk or an event table. The code is made right here in the browser by the
// small `qrcode-generator` library (no network, nothing sent anywhere), always for the fixed
// production address https://tkd-dashboard.pages.dev/f/<name> — never the address of the page
// you are on, so a sign printed from preview still points at the real form (like Color Belt's
// src/lib/testing/qr.js).
//
//   formLink('free-class') → 'https://tkd-dashboard.pages.dev/f/free-class'  ('' for a bad name)
//   qrSvgDataUrl('free-class') → an SVG picture as a data URL, for <img src> (always as an image)
//   qrPngBlob('free-class', 1024) → a PNG file (Promise<Blob>) for "Download"
import qrcode from 'qrcode-generator';
import { PUBLIC_ORIGIN } from '../testing/eventRules.js';
import { slugOk } from './fields.js';

// The full public address; '' for a name the database would never allow (so a damaged value
// can never end up in a printed link).
export function formLink(slug) {
  return slugOk(slug ?? '') ? `${PUBLIC_ORIGIN}/f/${slug}` : '';
}

// The link without "https://", as printed under the code.
export const shortLink = (link) => link.replace(/^https:\/\//, '');

// The QR code itself: error correction 'M' (about 15% of it can be damaged and it still scans);
// type number 0 = the library picks the smallest size that fits.
function makeQr(slug) {
  const link = formLink(slug);
  if (!link) return null;
  const qr = qrcode(0, 'M');
  qr.addData(link);
  qr.make();
  return qr;
}

// As an SVG picture in a data URL. margin 4 = the "quiet zone" of empty squares scanners need.
export function qrSvgDataUrl(slug) {
  const qr = makeQr(slug);
  if (!qr) return '';
  const svg = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// As a PNG file about `size` pixels wide: each dark square drawn on a white canvas.
export function qrPngBlob(slug, size = 1024) {
  const qr = makeQr(slug);
  if (!qr) return Promise.resolve(null);
  const count = qr.getModuleCount();
  const cells = count + 8; // + the quiet zone, 4 squares each side
  const cell = Math.max(1, Math.floor(size / cells));
  const canvas = document.createElement('canvas');
  canvas.width = cell * cells;
  canvas.height = cell * cells;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000000';
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (qr.isDark(row, col)) ctx.fillRect((col + 4) * cell, (row + 4) * cell, cell, cell);
    }
  }
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}
