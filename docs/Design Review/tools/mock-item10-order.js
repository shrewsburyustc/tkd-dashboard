// mock-item10-order.js — draws Design Review item 10's proposed ⋯ menu order ON TOP of a real open row
// menu, for a picture only: it rebuilds the menu's items in a given order with the app's own markup
// (menu-item / tmenu-item, the separator line, red tmenu-item--danger, grayed is-disabled + gray reason line).
//   window.__mock10 = 'harvest'   with any row ⋯ menu open: keeps each item's icon in sessionStorage
//                                 (open several sections' menus so every icon needed is kept)
//   window.__mock10 = 'draw' and window.__menuSpec = ['Edit details', 'Set private testing', '-', …]
//       a string is an item, '-' starts a new group (a line), and an object adds options:
//       { label: 'Delete permanently', red: true } or { label, gray: true, reason: '…' }
// Star's "Edit candidate" icon is used for "Edit details" when needed. Nothing in the app changes;
// closing the menu removes it.
// Run:   node cdp.mjs eval "$(cat mock-item10-order.js)"
(() => {
  const m = document.querySelector('[role=menu]');
  if (!m) return 'open a row ⋯ menu first';
  const icons = JSON.parse(sessionStorage.getItem('__icons10') || '{}');
  if (window.__mock10 === 'harvest') {
    for (const b of m.querySelectorAll('[role=menuitem]')) {
      const svg = b.querySelector('svg');
      const label = b.innerText.trim().split('\n')[0];
      if (svg && label && !icons[label]) icons[label] = svg.outerHTML;
    }
    sessionStorage.setItem('__icons10', JSON.stringify(icons));
    return Object.keys(icons);
  }
  const alias = { 'Edit details': 'Edit candidate', 'Edit candidate': 'Edit details' };
  const iconFor = (label) => icons[label] || icons[alias[label]] || '';
  const missing = [];
  // Hide the real items instead of removing them: React still owns them, and removing them can crash
  // the page when the menu closes. The drawn items go after them and disappear with the menu.
  m.querySelectorAll('[data-mock=item10]').forEach((e) => e.remove());
  for (const child of m.children) child.style.display = 'none';
  let lineNext = false;
  for (const entry of window.__menuSpec || []) {
    if (entry === '-') { lineNext = true; continue; }
    const it = typeof entry === 'string' ? { label: entry } : entry;
    const wrap = document.createElement('div');
    wrap.dataset.mock = 'item10';
    if (lineNext) {
      const line = document.createElement('div');
      line.setAttribute('role', 'separator');
      line.className = 'menu-separator';
      wrap.append(line);
      lineNext = false;
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    b.tabIndex = -1;
    b.className = 'menu-item tmenu-item' + (it.red ? ' tmenu-item--danger' : '') + (it.gray ? ' is-disabled' : '');
    if (it.gray) b.setAttribute('aria-disabled', 'true');
    if (!iconFor(it.label)) missing.push(it.label);
    b.innerHTML = iconFor(it.label) + (it.reason
      ? `<span class="ev-menu-two"><span>${it.label}</span><span class="ev-menu-reason">${it.reason}</span></span>`
      : `<span>${it.label}</span>`);
    wrap.append(b);
    m.append(wrap);
  }
  // Keep keyboard focus inside the menu (some menus close when focus leaves them).
  const first = m.querySelector('[role=menuitem]:not([aria-disabled])');
  if (first) first.focus({ preventScroll: true });
  return missing.length ? `drawn; no icon for: ${missing.join(', ')}` : 'drawn';
})()
