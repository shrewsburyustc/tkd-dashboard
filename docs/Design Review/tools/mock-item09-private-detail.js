// mock-item09-private-detail.js — draws Design Review item 9's "after" picture ON TOP of the real preview
// page, for a picture only: tapping a Color Belt private testing row opens the same read-only summary the
// event roster already has (Close · Edit details), filled with that private testing's own data.
//   1. Open a student's summary on a Color Belt EVENT page, then run with window.__mock9 = 'grab'
//      → the summary's frame (the app's own dialog markup) is kept in sessionStorage.
//   2. Close it, open the Private testing tab, then run with window.__mock9 = 'draw' and
//      window.__mock9Data = { name, sub, rows: [[label, html], …], rowName }  (rowName = the roster row
//      whose Testing-for belts and Payment tag are copied into the summary)
// Nothing in the app changes; a reload removes it.
// Run:   node cdp.mjs eval "$(cat mock-item09-private-detail.js)"
(() => {
  if (window.__mock9 === 'grab') {
    const backdrop = document.querySelector('.dialog-backdrop');
    if (!backdrop) return 'open a student summary first';
    sessionStorage.setItem('__mock9', backdrop.outerHTML);
    return 'grabbed';
  }
  const html = sessionStorage.getItem('__mock9');
  const data = window.__mock9Data;
  if (!html || !data) return 'grab first, and set window.__mock9Data';
  document.querySelectorAll('[data-mock=item09]').forEach((e) => e.remove());
  const holder = document.createElement('div');
  holder.innerHTML = html;
  const backdrop = holder.firstElementChild;
  backdrop.dataset.mock = 'item09';
  const box = backdrop.querySelector('.dialog');
  box.querySelector('.dialog-title').textContent = data.name;
  box.querySelector('.tdialog-sub').textContent = data.sub;
  // Belts and the Payment tag come from the real roster row, so they look exactly like the app's.
  const row = document.querySelector(`[role=row][aria-label="${data.rowName}"]`);
  const belts = row && row.querySelector('.ev-tf');
  const tag = row && row.querySelector('.ttag');
  const dl = box.querySelector('dl.ev-sum');
  dl.innerHTML = '';
  for (const [label, value] of data.rows) {
    const div = document.createElement('div');
    div.className = 'ev-sum-row';
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    if (value === '{belts}' && belts) dd.append(belts.cloneNode(true));
    else if (value.startsWith('{tag}') && tag) {
      dd.append(tag.cloneNode(true), value.slice(5));
    } else dd.innerHTML = value;
    div.append(dt, dd);
    dl.append(div);
  }
  document.body.append(backdrop);
  return 'drawn';
})()
