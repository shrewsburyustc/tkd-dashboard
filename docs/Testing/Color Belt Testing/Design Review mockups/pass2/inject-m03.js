// inject-m03.js: draws pass 2's M-03 "after" ON TOP of an open ⋯ menu of a removed student or a
// cancelled private testing that has money, for the mockup only (rule v1.055 (b): Print receipt
// whenever money still stands). The menu gets the money group first, "Print receipt", then a line
// and today's Restore · line · Delete permanently (§8's one order: money before taking someone off).
//   window.__m03 = 'admin'   the admin's menu: Print receipt · line · Restore · line · Delete permanently
//   window.__m03 = 'staff'   option A for staff: a ⋯ with only Print receipt (staff have no Restore or
//                            Delete permanently; today they see no ⋯ on these rows at all)
// A reload removes it.
(() => {
  const mode = window.__m03 || 'admin';
  const menu = document.querySelector('[role=menu]');
  if (!menu) return 'open the menu first';
  const buttons = [...menu.querySelectorAll('[role=menuitem]')];
  const restore = buttons.find((b) => b.innerText.trim() === 'Restore');
  if (!restore) return 'no Restore in this menu';
  const restoreWrap = restore.parentElement;
  const wrap = restoreWrap.cloneNode(true);
  const button = wrap.querySelector('[role=menuitem]');
  button.querySelector('span').textContent = 'Print receipt';
  // the Tabler printer icon (ti-printer), as on the active rows' Print receipt (single quotes only:
  // the PowerShell shoot script can't pass double quotes to node)
  const svg = button.querySelector('svg');
  svg.setAttribute('class', svg.getAttribute('class').replace('tabler-icon-arrow-back-up', 'tabler-icon-printer'));
  svg.innerHTML = `<path d='M17 17h2a2 2 0 0 0 2 -2v-4a2 2 0 0 0 -2 -2h-14a2 2 0 0 0 -2 2v4a2 2 0 0 0 2 2h2'></path>`
    + `<path d='M17 9v-4a2 2 0 0 0 -2 -2h-6a2 2 0 0 0 -2 2v4'></path>`
    + `<path d='M7 13m0 2a2 2 0 0 1 2 -2h6a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2z'></path>`;
  wrap.querySelectorAll('[role=separator]').forEach((s) => s.remove());
  restoreWrap.before(wrap);
  if (mode === 'staff') {
    // staff: only the money group
    [...menu.children].forEach((child) => { if (child !== wrap && child.querySelector('[role=menuitem]')) child.remove(); });
    return 'staff menu drawn';
  }
  const line = document.createElement('div');
  line.setAttribute('role', 'separator');
  line.className = 'menu-separator';
  restoreWrap.prepend(line);
  return 'admin menu drawn';
})();
