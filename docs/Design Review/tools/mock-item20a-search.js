// mock-item20a-search.js — draws Design Review item 20a's "after" picture ON TOP of the real preview page, for a
// picture only: the top-bar search that rule §3.2 (v0.12) asks for — "Search people" in the top bar on every
// page, with results from every section grouped by section, names and event only (nothing private).
//   window.__mock20a = 'grab'    on Prospects: remembers its search box (label.psearch) to copy its look
//   window.__mock20a = 'draw'    on any page: puts the search box in the top bar with "Ava" typed, and the
//                                results list under it (sample people from the preview's fake data)
//   window.__mock20a = 'clear'   removes the drawing
// It only adds parts (moving or removing React's parts crashes the page); a reload also removes it.
// Run:   node cdp.mjs eval "window.__mock20a = 'draw'; $(cat mock-item20a-search.js)"
(() => {
  const mode = window.__mock20a;
  const MARK = 'item20a';
  document.querySelectorAll(`[data-mock=${MARK}]`).forEach((e) => e.remove());
  if (mode === 'clear') return 'cleared';
  if (mode === 'grab') {
    const label = document.querySelector('main label.psearch');
    if (!label) return 'open Prospects first';
    sessionStorage.setItem('__mock20a', label.outerHTML);
    return 'grabbed';
  }
  if (mode !== 'draw') return "set window.__mock20a = 'grab', 'draw' or 'clear'";
  const html = sessionStorage.getItem('__mock20a');
  const bar = document.querySelector('header.topbar');
  if (!html || !bar) return "run 'grab' on Prospects first";
  const holder = document.createElement('div');
  holder.innerHTML = html;
  const box = holder.firstElementChild;
  box.dataset.mock = MARK;
  box.style.cssText = 'flex:0 1 340px;margin-left:16px';
  const input = box.querySelector('input');
  input.removeAttribute('id');
  input.placeholder = 'Search people';
  input.value = 'Ava';
  const hidden = box.querySelector('.visually-hidden');
  if (hidden) hidden.textContent = 'Search people in every section';
  bar.insertBefore(box, bar.firstElementChild);
  // The results under the box: one group per section, name + event + school, nothing private
  const groups = [
    ['Color belt testing', [['Ava Chen', 'November Children Testing · Worcester']]],
    ['Star testing', [['Ava Reed', 'Fall Star Testing · Worcester']]],
    ['Black Belt testing', [['Ava Brooks', 'Spring 2027 · Shrewsbury']]],
    ['Camps', [['Ava Thompson', 'April Vacation Camp · Worcester']]],
  ];
  const r = box.getBoundingClientRect();
  const list = document.createElement('div');
  list.dataset.mock = MARK;
  list.setAttribute('role', 'listbox');
  list.style.cssText = `position:fixed;left:${Math.round(r.left)}px;top:${Math.round(r.bottom + 6)}px;width:${Math.round(r.width + 40)}px;z-index:60;`
    + 'background:var(--color-surface, #fff);border:1px solid var(--color-border);border-radius:var(--radius-control);'
    + 'box-shadow:0 8px 24px rgba(0,0,0,.12);padding:6px 0;font-size:var(--text-14)';
  for (const [section, rows] of groups) {
    const head = document.createElement('div');
    head.textContent = section;
    head.style.cssText = 'padding:6px 12px 2px;font-size:var(--text-12);color:var(--color-text-secondary)';
    list.append(head);
    for (const [name, where] of rows) {
      const row = document.createElement('div');
      row.setAttribute('role', 'option');
      row.style.cssText = 'padding:6px 12px;line-height:1.3';
      row.innerHTML = `<div style="font-weight:500">${name}</div><div style="font-size:var(--text-13);color:var(--color-text-secondary)">${where}</div>`;
      list.append(row);
    }
  }
  list.firstElementChild.nextElementSibling.style.background = 'var(--color-blue-tint, #EAF1FB)'; // the first result is the active one
  document.body.append(list);
  return 'drawn';
})()
