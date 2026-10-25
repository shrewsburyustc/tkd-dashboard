// mock-d3-both.js — draws end-review question D3's options ON TOP of Finance's real Both boxes, for pictures
// only. On a day with refunds a school's box shows the total AFTER refunds, but "Cash · Check · Card" are the
// money that came IN, so they add up to more than the total and nothing says why. The refunds are worked out
// from the box's own numbers (cash + check + card − total), as the app could do without a database change.
//   window.__mockD3 = 'B'       the total gets the one-school Total card's words (v0.209):
//                               "$675.00  8 payments · after $445.00 refunds"
//   window.__mockD3 = 'C'       the line adds up instead: "Cash $560.00 · Check $280.00 · Card $280.00 · Refunds −$445.00"
//   window.__mockD3 = 'clear'   puts it back
// In B and C the "Both schools together" line under the boxes gets "· after $X refunds" too.
// A box without refunds is left alone. It changes only the words inside the boxes' own text (never adds,
// moves or removes React's parts). A reload also removes it.
// Run:   node cdp.mjs eval "window.__mockD3 = 'B'; $(cat mock-d3-both.js)"
(() => {
  const mode = window.__mockD3;
  const undo = (window.__mockD3Undo = window.__mockD3Undo || []);
  while (undo.length) undo.pop()();
  if (mode === 'clear') return 'cleared';
  if (mode !== 'B' && mode !== 'C') return "set window.__mockD3 = 'B', 'C' or 'clear'";
  const boxes = [...document.querySelectorAll('.fin-both-box')];
  if (!boxes.length) return 'open Finance on Both first';
  // "$1,120.00" / "−$190.00" ↔ cents
  const cents = (s) => Math.round(Number(s.replace(/[^0-9.]/g, '')) * 100) * (/^[−-]/.test(s.trim()) ? -1 : 1);
  const money = (c) => `${c < 0 ? '−' : ''}$${(Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const setText = (node, words) => {
    const before = node.data;
    node.data = words;
    undo.push(() => { node.data = before; });
  };
  const done = [];
  let allRefunds = 0;
  for (const box of boxes) {
    const totalEl = box.querySelector('.fin-both-total');
    const lineEl = box.querySelector('.fin-both-line');
    const totalText = totalEl.firstChild.data; // "$675.00 " (the hint is its own span)
    const parts = lineEl.textContent.match(/[−-]?\$[\d,]+\.\d{2}/g) || [];
    const moneyIn = parts.reduce((sum, p) => sum + cents(p), 0);
    const refunds = moneyIn - cents(totalText);
    if (refunds <= 0) continue;
    if (mode === 'B') {
      const hint = totalEl.querySelector('.fin-hint');
      setText(hint.firstChild, `${hint.firstChild.data} · after ${money(refunds)} refunds`);
    } else {
      setText(lineEl.firstChild, `${lineEl.firstChild.data} · Refunds ${money(-refunds)}`);
    }
    done.push(`${box.getAttribute('aria-label')} ${money(refunds)}`);
    allRefunds += refunds;
  }
  // "Both schools together: $35.00 · 2 payments" is after refunds too: it gets the Total card's words in B and C
  const together = document.querySelector('.fin-both-together');
  if (together && allRefunds > 0) {
    const last = together.lastChild;
    setText(last, `${last.data} · after ${money(allRefunds)} refunds`);
  }
  return `drawn ${mode}: ${done.join(', ') || 'no box has refunds'}`;
})()
