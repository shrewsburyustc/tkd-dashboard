// mock-item15-back.js — draws Design Review item 15a's "after" pictures ON TOP of the real preview pages,
// for pictures only: the standard back link ("← <place>" as a text link above the page title, rule v0.59)
// in the two places that do it differently.
//   window.__mock15 = 'grab'     on a page with the standard back link (e.g. a Camps camp page, "← Camps")
//   window.__mock15 = 'forms'    on the Forms builder: its arrow-only button → "← Forms" above the title
//   window.__mock15 = 'finance'  on Finance → History: the "Back to the day" button → the same link above "History"
// Nothing in the app changes; a reload removes it.
// Run:   node cdp.mjs eval "$(cat mock-item15-back.js)"
(() => {
  const mode = window.__mock15;
  if (mode === 'grab') {
    const a = document.querySelector('main .ev-back');
    if (!a) return 'open a page with a standard back link first';
    sessionStorage.setItem('__mock15back', a.outerHTML);
    return 'grabbed';
  }
  const html = sessionStorage.getItem('__mock15back');
  if (!html) return 'grab first';
  document.querySelectorAll('[data-mock=item15]').forEach((e) => e.remove());
  const make = (words) => {
    const holder = document.createElement('div');
    holder.innerHTML = html;
    const link = holder.firstElementChild;
    [...link.childNodes].filter((n) => n.nodeType === 3).forEach((n) => n.remove());
    link.append(words);
    const line = document.createElement('div');
    line.dataset.mock = 'item15';
    line.style.margin = '0 0 8px';
    line.append(link);
    return line;
  };
  if (mode === 'forms') {
    const arrow = document.querySelector('main button[aria-label="Back to Forms"]');
    if (!arrow) return 'open the Forms builder first';
    const row = arrow.parentElement;
    arrow.style.display = 'none';
    row.parentElement.insertBefore(make('Forms'), row);
    return 'forms drawn';
  }
  if (mode === 'finance') {
    const button = [...document.querySelectorAll('main button')].find((b) => b.innerText.trim() === 'Back to the day');
    if (!button) return 'open Finance → History first';
    const row = button.parentElement;
    button.style.display = 'none';
    row.parentElement.insertBefore(make('Back to the day'), row);
    return 'finance drawn';
  }
  return 'set window.__mock15';
})()
