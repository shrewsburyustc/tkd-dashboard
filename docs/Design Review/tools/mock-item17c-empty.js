// mock-item17c-empty.js — draws Design Review item 17c's two options ON TOP of Color Belt's empty Private testing
// tab (a school with no private testings yet), for pictures only. Today that tab shows a box with a line AND a
// second blue "Add private testing" button, while the page header has the same button.
//   window.__mock17c = 'line'   option B: the box becomes the empty line every other list uses
//                               (<p class="tempty ev-empty">), and the header button is the one action
//   window.__mock17c = 'box'    option C: rule §8 / §1.1 as written — the box keeps its button and the
//                               header's button is hidden while the list is empty
//   window.__mock17c = 'clear'  removes the drawing
// It only hides the app's parts and adds new ones (moving or removing React's parts crashes the page).
// A reload also removes it.
// Run:   node cdp.mjs eval "window.__mock17c = 'line'; $(cat mock-item17c-empty.js)"
(() => {
  const mode = window.__mock17c;
  const MARK = 'item17c';
  const clear = () => {
    document.querySelectorAll(`[data-mock=${MARK}]`).forEach((e) => e.remove());
    document.querySelectorAll(`[data-mock-hide=${MARK}]`).forEach((e) => {
      e.style.display = '';
      delete e.dataset.mockHide;
    });
  };
  const hide = (el) => {
    el.dataset.mockHide = MARK;
    el.style.display = 'none';
  };
  clear();
  if (mode === 'clear') return 'cleared';
  const box = document.querySelector('main .pv-empty');
  if (!box) return "open Color Belt → Private testing for a school with none yet";
  if (mode === 'line') {
    const line = document.createElement('p');
    line.className = 'tempty ev-empty';
    line.dataset.mock = MARK;
    line.textContent = box.querySelector('p').textContent;
    hide(box);
    box.after(line);
    return 'line drawn';
  }
  if (mode === 'box') {
    const header = [...document.querySelectorAll('main button.btn-primary')].find((b) => /Add private/.test(b.innerText) && !box.contains(b));
    if (header) hide(header);
    return 'header button hidden';
  }
  return "set window.__mock17c = 'line', 'box' or 'clear'";
})()
