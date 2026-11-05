// sheetPlan.js — how one child's printed visitor sheet fits on the paper (rulebook v0.641, which
// changes v0.636's "waiver and signature on page 2").
// Why it exists: the signature, the date signed and the 15 trial-class boxes must always print on
// the sheet's first page, at their own size (Jeffrey, 2026-11-05: on a long form they had gone to
// the back of the paper). Before it prints, PrintSheet.jsx lays every sheet out invisibly twice —
// as it is, and with every form answer on one line ("School Attending: Spring Street School", like
// the old paper card) — and measures both. This plain function (no React, so the Node checks can
// run it) then picks the first of these that fits:
//   1. 'whole'          the sheet as it is;
//   2. 'whole' compact  the answers one line each;
//   3. 'whole' zoomed   the compact sheet with the part ABOVE the signature (the school, the form,
//                       the student, the parent, the answers, and the waiver's heading, wording
//                       and ticked line) printed up to 10% smaller (zoom 0.9–1); the signature
//                       row, the 15 boxes and the footer keep their size;
//   4. 'split'          only a form far longer than any today: the first page keeps the answers
//                       that fit, then "More answers on the next page.", and the next page holds
//                       the rest, at full size ("cut" = how many answers stay on the first page).
//                       When not even one answer fits beside a very long waiver, the waiver's
//                       wording goes to the next page as well ("waiverBack"); the first page keeps
//                       the ticked line, the signature and the date signed either way.
// PrintSheet.jsx then checks the real first page of a split sheet and moves one more answer on
// while it's still too tall (rounding), so this plan only has to be a good first guess.
//
// The measurements (px at 96 per inch, the sheet laid out at the paper's width):
//   normal      the whole sheet's height as it is
//   compact     the whole sheet's height with the answers one line each
//   top         the compact sheet's part above the signature (the part that may print smaller)
//   grid        the compact answers block's height (0 when the form asks no other questions)
//   bottoms     each compact answer's bottom edge, measured from the top of the answers block, in
//               the form's order (the answers in one row share its bottom)
//   waiverText  the waiver wording's height with the space above it (0 without a waiver)
//   more        the height of one "… on the next page." line with the space above it
export const PAGE_PX = 979; // the paper inside its margins: 11in − 2 × 0.4in = 10.2in
export const ROOM_PX = 12; // a little room, as print can round a line differently
export const LIMIT_PX = PAGE_PX - ROOM_PX;
export const MIN_ZOOM = 0.9; // at most 10% smaller (v0.641)

// How many answers, from the first, end within `room` px of the top of the answers block.
export function answersThatFit(bottoms, room) {
  let n = 0;
  while (n < bottoms.length && bottoms[n] <= room) n += 1;
  return n;
}

// The plan for one sheet: { kind: 'whole', compact, zoom } or { kind: 'split', compact: true,
// zoom: 1, cut, waiverBack }.
export function planSheet(m, limit = LIMIT_PX) {
  if (m.normal <= limit) return { kind: 'whole', compact: false, zoom: 1 };
  if (m.compact <= limit) return { kind: 'whole', compact: true, zoom: 1 };
  // the part above the signature smaller, just enough: (the rest) + top × zoom = limit; rounded
  // down to 3 places, so the sheet is never a hair too tall
  const keeps = m.compact - m.top;
  const zoom = m.top > 0 ? Math.floor(((limit - keeps) / m.top) * 1000) / 1000 : 0;
  if (zoom >= MIN_ZOOM) return { kind: 'whole', compact: true, zoom };
  // The first page is the compact sheet without its answers block ("rest"), plus the answers that
  // fit and one "More answers on the next page." line.
  const rest = m.compact - m.grid;
  const cut = answersThatFit(m.bottoms, limit - rest - m.more);
  if (cut >= 1) return { kind: 'split', compact: true, zoom: 1, cut, waiverBack: false };
  // Not even one answer fits. Moving the waiver's wording to the next page frees its height, and
  // costs two lines ("The waiver's wording is on the next page." and "More answers on the next
  // page."). Move it only when that lets an answer fit, or when the first page can't fit even
  // without any answers; otherwise all the answers go on and the wording stays.
  const cutWithout = answersThatFit(m.bottoms, limit - rest - 2 * m.more + m.waiverText);
  if (cutWithout >= 1 || rest + m.more > limit) return { kind: 'split', compact: true, zoom: 1, cut: cutWithout, waiverBack: true };
  return { kind: 'split', compact: true, zoom: 1, cut: 0, waiverBack: false };
}
