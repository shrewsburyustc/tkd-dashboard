// mock-c08-menu.js — Camps design review C8 / C9 / C16 (and C1, C12), drawn ON TOP of the real preview page
// for a picture only: re-draws the open ⋯ menu ([role=menu]) with a given list of items, using the app's own
// menu classes (tmenu-item, menu-separator, tmenu-item--danger, the gray reason line ev-menu-two /
// ev-menu-reason), so it looks exactly like the app's menu.
//   window.__c08 = [ { label, icon, danger, disabled, reason }, 'sep', … ]
//   icon: 'edit' | 'user-minus' | 'trash' | 'alert' | 'cash-edit' | 'arrow-back-up' | 'template' | 'printer' | null
// The original items are hidden, never removed (removing React's own parts can crash the page).
// Run with a ⋯ menu open:   node shotx.mjs out.png --js "window.__c08=[…]" --eval mock-c08-menu.js
(() => {
  const menu = [...document.querySelectorAll('[role=menu]')].pop();
  const items = window.__c08;
  if (!menu || !items) return 'open a ⋯ menu and set window.__c08';
  const P = {
    edit: ['M7 7h-1a2 2 0 0 0 -2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2 -2v-1', 'M20.385 6.585a2.1 2.1 0 0 0 -2.97 -2.97l-8.415 8.385v3h3l8.385 -8.415', 'M16 5l3 3'],
    'user-minus': ['M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0', 'M6 21v-2a4 4 0 0 1 4 -4h4c.348 0 .686 .045 1.009 .128', 'M16 19h6'],
    trash: ['M4 7l16 0', 'M10 11l0 6', 'M14 11l0 6', 'M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12', 'M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3'],
    alert: ['M12 9v4', 'M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0', 'M12 16h.01'],
    'cash-edit': ['M7 15h-3a1 1 0 0 1 -1 -1v-8a1 1 0 0 1 1 -1h12a1 1 0 0 1 1 1v3', 'M11 19h-3a1 1 0 0 1 -1 -1v-8a1 1 0 0 1 1 -1h12a1 1 0 0 1 1 1v1.25', 'M18.42 15.61a2.1 2.1 0 1 1 2.97 2.97l-3.39 3.42h-3v-3l3.42 -3.39'],
    'arrow-back-up': ['M9 14l-4 -4l4 -4', 'M5 10h11a4 4 0 1 1 0 8h-1'],
  };
  const svg = (name) => (P[name]
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tabler-icon menu-icon" aria-hidden="true">${P[name].map((d) => `<path d="${d}"></path>`).join('')}</svg>`
    : '<span class="menu-icon ev-noicon" aria-hidden="true"></span>');
  [...menu.children].forEach((c) => { if (!c.dataset.mock) c.style.display = 'none'; });
  menu.querySelectorAll('[data-mock=c08]').forEach((e) => e.remove());
  let sepNext = false;
  for (const it of items) {
    if (it === 'sep') { sepNext = true; continue; }
    const wrap = document.createElement('div');
    wrap.dataset.mock = 'c08';
    const label = it.reason
      ? `<span class="ev-menu-two"><span>${it.label}</span><span class="ev-menu-reason">${it.reason}</span></span>`
      : `<span>${it.label}</span>`;
    wrap.innerHTML = `${sepNext ? '<div role="separator" class="menu-separator"></div>' : ''}<button type="button" role="menuitem" tabindex="-1"${it.disabled ? ' aria-disabled="true"' : ''} class="menu-item tmenu-item${it.danger ? ' tmenu-item--danger' : ''}${it.disabled ? ' is-disabled' : ''}">${svg(it.icon)}${label}</button>`;
    menu.append(wrap);
    sepNext = false;
  }
  return 'drawn';
})()
