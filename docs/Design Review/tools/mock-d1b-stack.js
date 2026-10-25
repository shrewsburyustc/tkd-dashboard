// mock-d1b-stack.js — draws end-review question D1b's options ON TOP of a real "are you sure?" box on a phone,
// for pictures only: the box's two buttons stacked one above the other, each the full width of the box, in the
// same order as the row (the row's first button on top: "Keep …", then the action).
//   window.__mockD1b = 'stack'   on an open confirm box
//   window.__mockD1b = 'clear'   puts it back
// It only changes inline styles of the box's own button row and buttons (never adds, moves or removes React's
// parts). A reload also removes it.
// Run:   node cdp.mjs eval "window.__mockD1b = 'stack'; $(cat mock-d1b-stack.js)"
(() => {
  const mode = window.__mockD1b;
  const undo = (window.__mockD1bUndo = window.__mockD1bUndo || []);
  while (undo.length) undo.pop()();
  if (mode === 'clear') return 'cleared';
  if (mode !== 'stack') return "set window.__mockD1b = 'stack' or 'clear'";
  const box = [...document.querySelectorAll('.dialog')].find((d) => {
    const b = d.getBoundingClientRect();
    return b.height > 0 && b.top >= 0 && b.top < 900 && d.querySelector('.dialog-actions');
  });
  if (!box) return 'open a confirm box first';
  const style = (el, css) => {
    const before = el.getAttribute('style');
    el.style.cssText += `;${css}`;
    undo.push(() => (before === null ? el.removeAttribute('style') : el.setAttribute('style', before)));
  };
  const row = box.querySelector('.dialog-actions');
  style(row, 'display:flex;flex-direction:column;align-items:stretch;gap:var(--space-8)');
  for (const b of row.querySelectorAll('button')) style(b, 'width:100%;margin:0;justify-content:center;white-space:nowrap');
  return 'stacked';
})()
