// mock-c12-open-signup.js — Camps design review C12 (rule v1.016), drawn ON TOP of the real preview page for a
// picture only: the camp ⋯ menu says "Open sign-up" instead of "Reopen sign-up" (one verb pair, Close / Open,
// with each section's noun, no icons). The staff's grayed reason line follows the verb:
// "The closing date has passed. Ask an admin to open it." (proposed words — today "… Ask an admin to reopen.").
// Only text inside the open menu changes.
// Run with a camp's ⋯ menu open:   node shotx.mjs out.png --eval mock-c12-open-signup.js
(() => {
  const menu = [...document.querySelectorAll('[role=menu]')].pop();
  if (!menu) return 'open the camp ⋯ menu first';
  const swaps = [['Reopen sign-up', 'Open sign-up'], ['Ask an admin to reopen.', 'Ask an admin to open it.']];
  let n = 0;
  const walk = document.createTreeWalker(menu, NodeFilter.SHOW_TEXT);
  for (let t = walk.nextNode(); t; t = walk.nextNode()) {
    for (const [a, b] of swaps) if (t.nodeValue.includes(a)) { t.nodeValue = t.nodeValue.replace(a, b); n++; }
  }
  return `changed ${n}`;
})()
