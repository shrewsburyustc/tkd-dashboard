// mock-x8-partial-refund.js — Camps "a partial refund: how does the admin hand back the rest?"
// (picture 22y-partial-refund), drawn ON TOP of the real preview page for a picture only. Nothing is
// saved; a reload removes it, and nothing in the app changes.
// The screens are the BUILT Record refund (rulebook v0.743) after a real partial refund in the preview:
// Emma Garcia paid $315, Friday was taken off (total $292, $23 overpaid), an admin recorded a $10
// cash refund — she is still $13 overpaid, the hint says "⋯ → Record refund", but the ⋯ / More show
// Undo refund in Record refund's place (v0.743 (4)). Only what differs between the two options is
// drawn here:
//   option A — Record refund AND Undo refund while still overpaid: a "Record refund" item is added
//              BEFORE the real Undo refund (in the ⋯ and in Camper detail's More), cloned from the real
//              Undo refund item's markup with Star's / the built ti-receipt-refund icon;
//   option B — the approved menu stays; only the hint's words change.
// Usage: window.__x8 = { mode } then run this file (through cdp.mjs's holder, so the size stays put).
//   mode 'menuA'   the open camper ⋯: Record refund before Undo refund
//   mode 'moreA'   Camper detail's More (touch screens): the same button
//   mode 'hintB'   Camper detail: the hint's option-B words
(async () => {
  const s = window.__x8;
  if (!s) return 'set window.__x8';
  const W = {
    record: 'Record refund',
    undo: 'Undo refund',
    hintB: 'To hand back more, an admin first uses ⋯ → Undo refund, then records the whole amount.',
  };
  // Boxes in screen pixels (the pictures are screen-sized shots).
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; };
  // Tabler's receipt-refund paths (the icon the built Record refund item uses, IconReceiptRefund).
  const RECEIPT_REFUND_PATHS = '<path d="M5 21v-16a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v16l-3 -2l-2 2l-2 -2l-2 2l-2 -2l-3 2"></path><path d="M15 14v-2a2 2 0 0 0 -2 -2h-4l2 -2m0 4l-2 -2"></path>';
  // Turn a clone of Undo refund into Record refund: its own svg keeps its size and classes; only the
  // icon's drawing and name change.
  const toReceiptIcon = (svg) => {
    svg.innerHTML = RECEIPT_REFUND_PATHS;
    svg.setAttribute('class', svg.getAttribute('class').replace('tabler-icon-arrow-back-up', 'tabler-icon-receipt-refund'));
  };
  const setWords = (el, words) => { [...el.childNodes].filter((n) => n.nodeType === 3).forEach((n) => n.remove()); el.append(words); };

  if (s.mode === 'menuA') {
    const menu = [...document.querySelectorAll('[role=menu]')].pop();
    if (!menu) return 'open the camper ⋯';
    menu.querySelectorAll('[data-mock=x8]').forEach((e) => e.remove());
    const undoWrap = [...menu.querySelectorAll('[role=menuitem]')].find((b) => b.textContent.trim() === W.undo)?.parentElement;
    if (!undoWrap) return 'no Undo refund item (record a refund first)';
    const wrap = undoWrap.cloneNode(true);
    wrap.dataset.mock = 'x8';
    const item = wrap.querySelector('[role=menuitem]');
    toReceiptIcon(item.querySelector('svg'));
    item.querySelector(':scope > span').textContent = W.record;
    undoWrap.before(wrap); // Record refund, then Undo refund (in the money group after Undo payment)
    return { record: box(item), undo: box(undoWrap.querySelector('[role=menuitem]')), menu: box(menu) };
  }

  if (s.mode === 'moreA') {
    const actions = document.querySelector('.cp-detail-actions');
    if (!actions) return 'open Camper detail on a touch screen';
    actions.querySelectorAll('[data-mock=x8]').forEach((e) => e.remove());
    const undo = [...actions.querySelectorAll('button')].find((b) => b.textContent.trim() === W.undo);
    if (!undo) return 'no Undo refund button (record a refund first)';
    const rec = undo.cloneNode(true);
    rec.dataset.mock = 'x8';
    toReceiptIcon(rec.querySelector('svg'));
    setWords(rec, W.record);
    undo.before(rec);
    return { record: box(rec), undo: box(undo), actions: box(actions) };
  }

  if (s.mode === 'hintB') {
    const host = [...document.querySelectorAll('.dialog, .dialog-page')].pop();
    const p = host && [...host.querySelectorAll('p.field-hint')].find((e) => /^An admin records money handed back/.test(e.textContent));
    if (!p) return 'open Camper detail of a camper who is still overpaid';
    p.textContent = W.hintB;
    return { hint: box(p), amber: box(host.querySelector('.cp-amber-text')) };
  }
  return 'unknown mode';
})()
