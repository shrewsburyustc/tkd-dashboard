// mock-item14-datepicker.js — draws Design Review item 14a's "after" picture ON TOP of the real preview page,
// for a picture only: a dialog's browser date box replaced by Star's shared date picker (the date button,
// and its month calendar open under it).
//   1. In Star's Edit event, with the Testing date picker OPEN, run with window.__mock14 = 'grab'
//      → keeps the date button and the open calendar (the app's own markup) in sessionStorage.
//   2. Open a dialog with a browser date box, then run with window.__mock14 = 'draw' and
//      window.__mock14Data = { label: 'Fri, Nov 20, 2026', day: '20', open: true }
// Nothing in the app changes; closing the dialog removes it.
// Run:   node cdp.mjs eval "$(cat mock-item14-datepicker.js)"
(() => {
  if (window.__mock14 === 'grab') {
    const pop = document.querySelector('.dp-pop');
    const button = pop && document.querySelector('button[aria-expanded="true"]');
    if (!pop || !button) return 'open Star\'s date picker first';
    sessionStorage.setItem('__mock14button', button.outerHTML);
    sessionStorage.setItem('__mock14pop', pop.outerHTML);
    return 'grabbed';
  }
  const data = window.__mock14Data || {};
  const dialog = [...document.querySelectorAll('[role=dialog]')].pop();
  const input = dialog && dialog.querySelector('input[type=date]');
  const buttonHtml = sessionStorage.getItem('__mock14button');
  const popHtml = sessionStorage.getItem('__mock14pop');
  if (!input || !buttonHtml) return 'grab first, then open a dialog with a date box';
  dialog.querySelectorAll('[data-mock=item14]').forEach((e) => e.remove());
  const holder = document.createElement('div');
  holder.innerHTML = buttonHtml;
  const button = holder.firstElementChild;
  button.dataset.mock = 'item14';
  button.removeAttribute('id');
  // The button's visible words are its first text: replace them with this dialog's date.
  const label = [...button.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim()) || button.querySelector('span');
  if (label) label.textContent = data.label;
  if (!data.open) button.setAttribute('aria-expanded', 'false');
  input.style.display = 'none';
  input.after(button);
  if (data.open && popHtml) {
    holder.innerHTML = popHtml;
    const pop = holder.firstElementChild;
    pop.dataset.mock = 'item14';
    // Move the "chosen day" look from Star's day to this dialog's day (day cells are td.dp-day).
    const days = [...pop.querySelectorAll('.dp-day')];
    const chosen = days.find((b) => b.classList.contains('is-selected'));
    const target = days.find((b) => b.textContent.trim() === data.day);
    if (chosen && target && chosen !== target) {
      for (const attr of ['class', 'aria-pressed', 'aria-selected', 'aria-current']) {
        const a = chosen.getAttribute(attr); const t = target.getAttribute(attr);
        if (a !== null) target.setAttribute(attr, a); else target.removeAttribute(attr);
        if (t !== null) chosen.setAttribute(attr, t); else chosen.removeAttribute(attr);
      }
    }
    button.parentElement.style.position = 'relative';
    pop.style.position = 'absolute';
    pop.style.zIndex = '5';
    button.after(pop);
  }
  return 'drawn';
})()
