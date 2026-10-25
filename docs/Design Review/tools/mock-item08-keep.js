// mock-item08-keep.js — draws Design Review item 8's options ON TOP of an open "are you sure?" box in the
// real preview page, for a picture only: it changes the words on the box's two buttons.
//   window.__keepMock = { safe: 'Keep class', action: 'Delete class' }
//     safe    the left button (the one that changes nothing) — option B "Keep <thing>", option C "Cancel"
//     action  the right button — it repeats the words of the menu item that opened the box
// Either may be left out. Icons stay as they are. Nothing in the app changes; closing the box removes it.
// Run with a confirm box open:   node cdp.mjs eval "$(cat mock-item08-keep.js)"
(() => {
  const d = document.querySelector('[role=alertdialog]');
  if (!d) return 'open an "are you sure?" box first';
  const m = window.__keepMock || {};
  const [safe, action] = d.querySelectorAll('button');
  // Swap only the words: keep the button's icon (an <svg>) and replace its text.
  const relabel = (b, words) => {
    const icon = b.querySelector('svg');
    b.textContent = '';
    if (icon) b.append(icon, ' ');
    b.append(words);
    b.dataset.mock = 'item08';
  };
  if (m.safe) relabel(safe, m.safe);
  if (m.action) relabel(action, m.action);
  return `drawn: ${safe.innerText.trim()} | ${action.innerText.trim()}`;
})()
