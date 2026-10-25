// mock-d10b-remove.js — draws end-review question D10b's option B ON TOP of a real Calendar or Schedule dialog, for a
// picture only: the dialog's red "Remove" (an event, a closure or a time slot — instant, with a 5-second Undo) drawn
// plain, in the ordinary outline-button look (testing.css .btn), because it can be undone.
//   window.__mockD10b = 'plain'   on an open Edit event / Edit closure / Edit time slot dialog
//   window.__mockD10b = 'clear'   puts it back
// It only changes the inline style of the dialog's own Remove button (never adds, moves or removes React's parts).
// A reload also removes it.
// Run:   node cdp.mjs eval "window.__mockD10b = 'plain'; $(cat mock-d10b-remove.js)"
(() => {
  const mode = window.__mockD10b;
  const undo = (window.__mockD10bUndo = window.__mockD10bUndo || []);
  while (undo.length) undo.pop()();
  if (mode === 'clear') return 'cleared';
  if (mode !== 'plain') return "set window.__mockD10b = 'plain' or 'clear'";
  const dialog = [...document.querySelectorAll('.dialog')].find((d) => d.getBoundingClientRect().height > 0);
  const remove = dialog && dialog.querySelector('.sdialog-remove');
  if (!remove) return 'open an Edit event, Edit closure or Edit time slot dialog first';
  const before = remove.getAttribute('style');
  remove.style.cssText += ';color:var(--color-text);border-color:var(--color-border-control)';
  undo.push(() => (before === null ? remove.removeAttribute('style') : remove.setAttribute('style', before)));
  return 'drawn plain';
})()
