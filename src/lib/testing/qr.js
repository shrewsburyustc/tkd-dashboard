// qr.js — the registration link for a testing event (and its QR code, made by the shared helper).
// Why it exists: the Registration link box (R2), the printed flyer (R3) and the Events tab's ⋯ →
// Copy registration link all need the event's family link. It is always the fixed production
// address https://tkd-dashboard.pages.dev/register/<code> — never the address of the page you are
// on, so a flyer printed from preview or a test copy still points at the real form (plan §8).
// Since the design review's part 2 (CB10, rulebook v0.422, v1.106) the QR picture itself is drawn
// by the shared src/lib/qr.js (the same picture as before: error correction M, a 4-square quiet
// zone, in the browser, no network). This file only builds the link.
//
// How the screens use it (contract 0005 §5):
//   registrationLink(event.publicCode) → 'https://tkd-dashboard.pages.dev/register/p4w9tdkm'
//   qrSvgDataUrl(event.publicCode)     → the shared helper's QR picture for that link (kept for
//                                        src/lib/shared/checks.mjs, which compares it with the
//                                        shared one; the screens call src/lib/qr.js directly)
import { qrSvgDataUrl as sharedQrSvgDataUrl } from '../qr.js';
import { registrationUrl } from './eventRules.js';

// Only codes the database can make: 6–12 lower-case letters and digits (it makes 8). Anything
// else gives no link, so a damaged value can never end up in a printed link.
const CODE_PATTERN = /^[a-z0-9]{6,12}$/;

// The full registration address for a public code. '' for a code that isn't valid.
export function registrationLink(code) {
  return CODE_PATTERN.test(code ?? '') ? registrationUrl(code) : '';
}

// The QR code for that address, as an SVG picture in a data URL (usable as <img src>), drawn by
// the shared helper. '' for a bad code.
export function qrSvgDataUrl(code) {
  const link = registrationLink(code);
  return link ? sharedQrSvgDataUrl(link) : '';
}
