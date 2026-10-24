// mock-d1c-order.js — draws end-review question D1c's option B ON TOP of a real "… isn't saved" leave warning,
// for a picture only: the same order as every other box — the button that changes nothing on the left in
// outline ("Stay on this page", still focused first), the action on the right, red because leaving loses the
// unsaved results for good (item 7: red means gone for good). Colors are the app's own (testing.css .btn and
// .btn-delete).
//   window.__mockD1c = 'flip'    on an open leave warning
//   window.__mockD1c = 'clear'   puts it back
// It only changes inline styles of the box's own button row and buttons (never adds, moves or removes React's
// parts). A reload also removes it.
// Run:   node cdp.mjs eval "window.__mockD1c = 'flip'; $(cat mock-d1c-order.js)"
(() => {
  const mode = window.__mockD1c;
  const undo = (window.__mockD1cUndo = window.__mockD1cUndo || []);
  while (undo.length) undo.pop()();
  if (mode === 'clear') return 'cleared';
  if (mode !== 'flip') return "set window.__mockD1c = 'flip' or 'clear'";
  const box = [...document.querySelectorAll('.dialog')].find((d) => /isn.t saved|aren.t saved/.test(d.innerText));
  if (!box) return 'open a leave warning first';
  const style = (el, css) => {
    const before = el.getAttribute('style');
    el.style.cssText += `;${css}`;
    undo.push(() => (before === null ? el.removeAttribute('style') : el.setAttribute('style', before)));
  };
  const row = box.querySelector('.dialog-actions');
  const [leave, stay] = [...row.querySelectorAll('button')];
  style(row, 'flex-direction:row-reverse;justify-content:flex-start');
  style(stay, 'border-color:var(--color-border-control);background:var(--color-surface);color:var(--color-text)');
  style(leave, 'border-color:var(--color-delete-text);background:var(--color-delete-text);color:var(--color-on-blue)');
  stay.focus();
  return 'flipped';
})()
