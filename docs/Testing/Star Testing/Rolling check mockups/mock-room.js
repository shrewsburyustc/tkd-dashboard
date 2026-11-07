// mock-room.js — measures and draws Star's candidate roster for the pass 2 L-02 review picture
// (C1-roster-room: the roster follows the room beside the panel, rulebook v1.053 / v1.130).
// Why: to pick the roster's limit (the narrowest room its tablet columns fit in) from the REAL roster,
// and to draw the "After" (the phone's stacked rows in a tablet window) on the real page before any
// code changes. Nothing in the app or its data changes; a reload removes everything drawn.
// Modes (set window.__mockRoom before running):
//   'measure'  the room beside the panel (main.shell-content's data-page-room, preview only), the
//              roster's width, whether it scrolls sideways, and every pair of text boxes in two
//              different cells of the same row that overlap (+ their union boxes, screen px, for
//              the amber outlines)
//   'grab'     (run at a phone width) keeps the phone roster's markup in localStorage
//   'stack'    (run at a tablet width) swaps the tablet roster for the grabbed phone markup. The
//              phone rows' styles (.st-crow-c.is-phone, .ev-srow-main …) aren't behind a phone-width
//              @media rule, so they apply as they will once the roster follows a class (v1.130).
//   'rects'    window.__mockSel (CSS selector) → boxes in screen pixels
// Run:   node cdp.mjs eval "eval(atob('<this file, base64>'))"   (PowerShell breaks plain quoting)
(() => {
  const mode = window.__mockRoom;
  // The roster on screen: the drawn (stacked) copy once 'stack' has run, otherwise the app's own.
  const roster = () => [...document.querySelectorAll('.st-roster')].find((e) => e.offsetParent);
  const box = (r) => [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
  if (mode === 'rects') {
    return [...document.querySelectorAll(window.__mockSel)].map((el) => box(el.getBoundingClientRect())).filter((b) => b[2] > 0);
  }
  if (mode === 'measure') {
    const main = document.querySelector('main.shell-content');
    const list = roster();
    if (!list) return { error: 'no roster on screen' };
    // The text boxes in one cell: one box per line of each text node (a Range gives a line's box).
    const textBoxes = (cell) => {
      const out = [];
      const walk = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (!n.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const r of range.getClientRects()) if (r.width > 0) out.push({ r, text: n.textContent.trim() });
      }
      return out;
    };
    const hit = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
    // One "pair" = two cells of the same row whose text overlaps (counted once, however many lines
    // touch); its mark is the box round all the overlapping text of those two cells.
    const pairs = [];
    const marks = [];
    for (const row of list.querySelectorAll('.st-crow-c')) {
      const cells = [...row.children].map(textBoxes);
      for (let i = 0; i < cells.length; i += 1) {
        for (let j = i + 1; j < cells.length; j += 1) {
          let u = null;
          const words = new Set();
          for (const a of cells[i]) {
            for (const b of cells[j]) {
              if (!hit(a.r, b.r)) continue;
              words.add(`${a.text} ⟷ ${b.text}`);
              for (const r of [a.r, b.r]) {
                u = u ? { l: Math.min(u.l, r.left), t: Math.min(u.t, r.top), r: Math.max(u.r, r.right), b: Math.max(u.b, r.bottom) }
                  : { l: r.left, t: r.top, r: r.right, b: r.bottom };
              }
            }
          }
          if (!u) continue;
          pairs.push([...words].join(' / '));
          marks.push([Math.round(u.l), Math.round(u.t), Math.round(u.r - u.l), Math.round(u.b - u.t)]);
        }
      }
    }
    // Text that sticks out of its own column (wider than its cell) without reaching the next
    // column's text yet: the step before an overlap. Box = the cell's left edge to the text's end.
    const sticking = [...list.querySelectorAll('.st-crow-c .ev-scell, .st-crow-c .ev-ssub, .st-crow-c .ev-sname, .st-crow-c .st-cline')]
      .filter((e) => e.scrollWidth > e.clientWidth + 1)
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { text: e.textContent.trim().slice(0, 40), box: [Math.round(r.x), Math.round(r.y), e.scrollWidth, Math.round(r.height)] };
      });
    return {
      window: innerWidth,
      sticking,
      room: Number(main?.dataset.pageRoom ?? NaN),
      rail: Math.round(document.querySelector('.rail, nav')?.getBoundingClientRect().width ?? 0),
      roster: Math.round(list.getBoundingClientRect().width),
      cols: list.style.getPropertyValue('--st-cols'),
      sideways: document.documentElement.scrollWidth > innerWidth || (main && main.scrollWidth > main.clientWidth),
      count: pairs.length,
      pairs,
      marks,
      rosterBox: box(list.getBoundingClientRect()),
    };
  }
  if (mode === 'grab') {
    const list = roster();
    if (!list || !list.querySelector('.is-phone')) return 'open the roster at a phone width first';
    localStorage.setItem('__mockRoomPhone', list.outerHTML);
    return `grabbed ${list.querySelectorAll('.st-crow-c.is-phone').length} phone rows`;
  }
  if (mode === 'stack') {
    const list = document.querySelector('.st-roster:not([data-mock-room])');
    const html = localStorage.getItem('__mockRoomPhone');
    if (!list || !html) return 'grab the phone roster first';
    const holder = document.createElement('div');
    holder.innerHTML = html;
    const phone = holder.firstElementChild;
    phone.dataset.mockRoom = 'stacked';
    // React still owns the tablet roster, so it is hidden rather than removed; a reload undoes both.
    list.style.display = 'none';
    list.after(phone);
    return `stacked: ${phone.querySelectorAll('.st-crow-c.is-phone').length} rows, roster ${Math.round(phone.getBoundingClientRect().width)} px`;
  }
  return 'set window.__mockRoom';
})()
