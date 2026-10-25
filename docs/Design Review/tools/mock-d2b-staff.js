// mock-d2b-staff.js — draws end-review question D2b's options ON TOP of the real staff screens while
// "Hide private details" is on, for pictures only.
//   window.__mockD2b = 'B'       staff emails hide like families': every email on the open screen reads gray
//                                "Hidden on this tablet" (Staff accounts' rows, the reset box's name line);
//                                the account menu's line keeps only the role ("Admin")
//   window.__mockD2b = 'C'       Staff accounts is desk-only while the switch is on (like Star's New candidate,
//                                v0.507): the account menu's "Staff accounts" grays, with one gray line under it
//   window.__mockD2b = 'clear'   puts it back
// Open the screen first (the account menu for C; Staff accounts, the menu or a reset box for B).
// It changes only text inside the app's own parts and their inline styles, and (C) adds one gray line
// after the menu item (never moves or removes React's parts). A reload also removes it.
// Run:   node cdp.mjs eval "window.__mockD2b = 'B'; $(cat mock-d2b-staff.js)"
(() => {
  const mode = window.__mockD2b;
  const undo = (window.__mockD2bUndo = window.__mockD2bUndo || []);
  while (undo.length) undo.pop()();
  if (mode === 'clear') return 'cleared';
  if (mode !== 'B' && mode !== 'C') return "set window.__mockD2b = 'B', 'C' or 'clear'";
  const style = (el, css) => {
    const before = el.getAttribute('style');
    el.style.cssText += `;${css}`;
    undo.push(() => (before === null ? el.removeAttribute('style') : el.setAttribute('style', before)));
  };
  const setText = (node, words) => {
    const before = node.data;
    node.data = words;
    undo.push(() => { node.data = before; });
  };
  const textNodes = (el) => {
    const out = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node.data.trim()) out.push(node);
    return out;
  };
  let changed = 0;
  if (mode === 'B') {
    // Staff accounts' rows and the reset box's name line: "jeffrey@" <wbr> "ustc.com" → one gray phrase
    for (const el of document.querySelectorAll('.sa-email, .sa-who-email')) {
      const [first, ...rest] = textNodes(el);
      if (!first) continue;
      setText(first, 'Hidden on this tablet');
      for (const node of rest) setText(node, '');
      style(el, 'color:var(--color-text-secondary)');
      changed += 1;
    }
    // the account menu: "jeffrey@ustc.com · Admin" → "Admin"
    const meta = document.querySelector('.account-meta');
    if (meta) {
      const nodes = textNodes(meta);
      const role = nodes[nodes.length - 1];
      for (const node of nodes) if (node !== role) setText(node, '');
      setText(role, role.data.replace(/^\s*·\s*/, '').trim());
      changed += 1;
    }
  } else {
    const item = [...document.querySelectorAll('[role=menu] [role^=menuitem]')].find((b) => b.innerText.trim() === 'Staff accounts');
    if (!item) return 'open the account menu first';
    // the approved gray "unavailable" look; the item stays in the menu so it can say why
    style(item, 'color:var(--color-disabled-text);cursor:default');
    const line = document.createElement('p');
    const pad = getComputedStyle(item).paddingLeft;
    line.style.cssText = `margin:-4px 0 4px;padding:0 var(--space-12) 0 calc(${pad} + 24px);color:var(--color-text-secondary);font-size:var(--text-13);line-height:1.35`;
    line.textContent = 'Off while private details are hidden.';
    item.insertAdjacentElement('afterend', line);
    undo.push(() => line.remove());
    changed += 1;
  }
  return `drawn ${mode} (${changed} part${changed === 1 ? '' : 's'})`;
})()
