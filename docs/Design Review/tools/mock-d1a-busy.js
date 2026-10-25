// mock-d1a-busy.js — draws end-review question D1a's option B ON TOP of a real "are you sure?" box, for a
// picture only: the box while it works, the way a form dialog's Save already looks while saving —
// the pressed button says what it is doing ("Deleting…") and is drawn gray (the approved "unavailable" look,
// testing.css .btn-primary.is-unavailable), and the other button is gray too, so nothing can be pressed twice.
//   window.__mockD1a = 'busy'    on an open confirm box
//   window.__mockD1a = 'clear'   puts it back
// It only changes the words inside the buttons' own text and their inline style (never adds, moves or removes
// React's parts). A reload also removes it.
// Run:   node cdp.mjs eval "window.__mockD1a = 'busy'; $(cat mock-d1a-busy.js)"
(() => {
  const mode = window.__mockD1a;
  const undo = (window.__mockD1aUndo = window.__mockD1aUndo || []);
  while (undo.length) undo.pop()();
  if (mode === 'clear') return 'cleared';
  if (mode !== 'busy') return "set window.__mockD1a = 'busy' or 'clear'";
  const box = [...document.querySelectorAll('.dialog')].find((d) => {
    const b = d.getBoundingClientRect();
    return b.height > 0 && b.top >= 0 && b.top < 900 && d.querySelector('.dialog-actions');
  });
  if (!box) return 'open a confirm box first';
  const buttons = [...box.querySelectorAll('.dialog-actions button')];
  const action = buttons[buttons.length - 1];
  const gray = 'border-color:var(--color-border-strong);background:var(--color-surface);color:var(--color-disabled-text);cursor:not-allowed';
  for (const b of buttons) {
    const style = b.getAttribute('style');
    b.style.cssText += `;${gray}`;
    undo.push(() => (style === null ? b.removeAttribute('style') : b.setAttribute('style', style)));
  }
  // "Delete permanently" → "Deleting…", "Undo payment" → "Undoing…": the verb of the button + "ing…"
  const walker = document.createTreeWalker(action, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.data.trim()) continue;
    const before = node.data;
    const verb = before.trim().split(/\s+/)[0];
    const ing = verb.endsWith('e') ? `${verb.slice(0, -1)}ing` : `${verb}ing`;
    node.data = `${ing}…`;
    undo.push(() => { node.data = before; });
    break;
  }
  return 'busy drawn';
})()
