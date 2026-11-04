// mock-c20-compare.js — Camps design review C20 (rule v1.102), drawn ON TOP of the real preview page for a
// picture only: Camps' own Compare dialog ("Ava Thompson is signed up twice", camps/CompareDialog.jsx) as the
// shared components/CompareDialog.jsx draws it. It changes today's markup into the shared part's own (read
// from its render), so the app's real shared.css draws it:
//   (a) each differing value gets "⚠ different" after it (.cmp-diff with the 12px ti-alert-triangle), in
//       place of today's screen-reader-only "(different)";
//   (b) window.__c20c = { busy: 'keep-first' | 'keep-second' | 'keep-both' } → the pressed button says
//       "Keeping…" / "Keeping both…" and every button grays (.is-unavailable; .cmp-dialog on the dialog);
//       on phones the page's back arrow grays too (.icon-button.is-unavailable);
//   - PC / tablet: the buttons and the failure note go into one .dialog-footer (pinned together), so the
//     note can't slide under the pinned buttons. On phones the shared part keeps today's order (buttons,
//     then the note), so nothing moves there.
// Words, rows and order stay Camps' own. Only adds / changes classes and text inside the open dialog.
// Run with the Compare dialog open:   node shotx.mjs out.png [--js "window.__c20c={busy:'keep-first'}"] --eval mock-c20-compare.js
(() => {
  const dialog = [...document.querySelectorAll('[role=dialog]')].find((d) => /signed up twice/.test(d.textContent));
  if (!dialog) return 'open the Compare dialog first';
  const opts = window.__c20c ?? {};
  const triangle = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tabler-icon tabler-icon-alert-triangle" aria-hidden="true"><path d="M12 9v4"></path><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z"></path><path d="M12 16h.01"></path></svg>';
  (dialog.closest('.tdialog') ?? dialog).classList.add('cmp-dialog');
  // (a) the visible mark, once per differing value
  let marks = 0;
  dialog.querySelectorAll('td.is-diff, .ev-sum-row.is-diff > dd').forEach((cell) => {
    cell.querySelector('.visually-hidden')?.remove();
    if (!cell.querySelector('.cmp-diff')) {
      cell.insertAdjacentHTML('beforeend', `<span class="cmp-diff">${triangle} different</span>`);
      marks++;
    }
  });
  // (b) while it works
  const keeps = [...dialog.querySelectorAll('button')].filter((b) => /Keep this one|Keeping…/.test(b.textContent));
  const both = [...dialog.querySelectorAll('button')].find((b) => /keep both|Keeping both/.test(b.textContent));
  const all = [...dialog.querySelectorAll('.ev-cmp-keep .btn, .ev-cmp-card .btn, .dialog-actions .btn')];
  const busy = opts.busy ?? null;
  all.forEach((b) => b.classList.toggle('is-unavailable', Boolean(busy)));
  keeps.forEach((b, i) => { b.textContent = busy === (i === 0 ? 'keep-first' : 'keep-second') ? 'Keeping…' : 'Keep this one'; });
  if (both) both.textContent = busy === 'keep-both' ? 'Keeping both…' : 'Not the same person — keep both';
  document.querySelectorAll('.tdialog-page .icon-button, .dialog-page-head .icon-button').forEach((b) => b.classList.toggle('is-unavailable', Boolean(busy)));
  // The bottom area: buttons + note in one .dialog-footer (PC / tablet only, as the shared part)
  const phone = dialog.matches('.tdialog-page') || Boolean(dialog.querySelector('.ev-cmp-card'));
  const actions = dialog.querySelector('.dialog-actions');
  if (!phone && actions && !actions.parentElement.classList.contains('dialog-footer')) {
    const footer = document.createElement('div');
    footer.className = 'dialog-footer';
    const note = actions.nextElementSibling?.classList.contains('tdialog-note') ? actions.nextElementSibling : null;
    actions.before(footer);
    footer.append(actions);
    if (note) footer.append(note);
  }
  document.activeElement?.blur?.();
  return `${marks} marks${busy ? ', ' + busy : ''}${phone ? ', phone' : ''}`;
})()
