// mock-c16-daygrid-icons.js — Camps design review C16 (rule v1.024), drawn ON TOP of the real preview page for a
// picture only: the roster's day grid uses the map's icons for attendance — came `ti-user-check` (was ti-check)
// and didn't come `ti-user-x` (was ti-x), as Prospects and the Calendar already do. Same size (14px), same
// colors. The legend under the roster follows the icons. Works on the PC / tablet table and the phone cards.
// Only the icon drawings are swapped (React's parts stay in place).
// Run on the camp page:   node shotx.mjs out.png --eval mock-c16-daygrid-icons.js
(() => {
  const paths = {
    check: ['M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0', 'M6 21v-2a4 4 0 0 1 4 -4h4', 'M15 19l2 2l4 -4'],
    x: ['M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0', 'M6 21v-2a4 4 0 0 1 4 -4h3.5', 'M22 22l-5 -5', 'M17 22l5 -5'],
  };
  const svg = (kind, size = 14) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tabler-icon tabler-icon-user-${kind}" aria-hidden="true" data-mock="c16">${paths[kind].map((d) => `<path d="${d}"></path>`).join('')}</svg>`;
  let n = 0;
  for (const cell of document.querySelectorAll('.cp-dc--came .cp-dc-val > svg:not([data-mock]), .cp-dc--missed .cp-dc-val > svg:not([data-mock])')) {
    const kind = cell.closest('.cp-dc--came') ? 'check' : 'x';
    cell.style.display = 'none';
    cell.insertAdjacentHTML('afterend', svg(kind));
    n++;
  }
  // The legend line under the roster ("✓ came (check-in time) · Check in: … · ✗ didn’t come · — not signed up that day").
  const legend = [...document.querySelectorAll('main p, main div')].find((el) => el.children.length === 0 && /✓ came/.test(el.textContent));
  if (legend && !legend.dataset.mock) {
    legend.dataset.mock = 'c16';
    const t = legend.textContent;
    const ic = (k) => `<span style="display:inline-flex;vertical-align:-2px">${svg(k, 14)}</span>`;
    legend.style.display = 'none';
    const copy = document.createElement(legend.tagName);
    copy.className = legend.className;
    copy.dataset.mock = 'c16';
    copy.innerHTML = t.replace('✓', ic('check')).replace('✗', ic('x'));
    legend.after(copy);
  }
  return `swapped ${n} icons${legend ? ' + legend' : ''}`;
})()
