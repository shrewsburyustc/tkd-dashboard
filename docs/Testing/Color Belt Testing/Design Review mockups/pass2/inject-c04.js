// inject-c04.js: draws pass 2's C-04 "after" ON TOP of an open ⋯ menu in the preview, for the mockup only.
// It adds the shared menu's own separator line above the red "Delete permanently" (v1.055 (f), as Star's).
// A reload removes it.
(() => {
  const menu = document.querySelector('[role=menu]');
  if (!menu) return 'no open menu';
  const del = [...menu.querySelectorAll('[role=menuitem]')].find((e) => e.innerText.trim() === 'Delete permanently');
  if (!del) return 'no Delete permanently';
  const line = document.createElement('div');
  line.setAttribute('role', 'separator');
  line.className = 'menu-separator';
  del.before(line);
  return 'line added';
})();
