// mock-c20-confirm.js — Camps design review C6 / C20 (rule v1.008, v1.103), drawn ON TOP of the real preview
// page for a picture only: one of Camps' three "are you sure?" boxes (Delete camp, Delete template, Delete
// camper permanently — today Color Belt's ConfirmDeleteDialog) as the shared ConfirmBox draws it with
// loses: 'forGood'. It turns today's button row into ConfirmBox's own markup (copied from parts.html#M2/busy),
// so the app's real shared.css draws it:
//   - .cfm-actions: never the pinned row (a screen under 700px tall pins today's row, with a line above it);
//   - the hidden sizer and the measured stacking: the two buttons stack, each the box's full width, when
//     "Keep …" + the action at the wider of its usual and busy words don't fit side by side (v1.103 (b));
//   - window.__c20 = { busy: true } → the "while it works" look: the action says "Deleting…" and grays,
//     "Keep …" grays too (.is-unavailable), the action keeps its width (min-width = the wider words).
// The words don't change (Keep camp · Delete camp, Keep template · Delete template, Keep camper · Delete
// permanently). Only adds / changes classes and text inside the open box.
// Run with the box open:   node shotx.mjs out.png [--js "window.__c20={busy:true}"] --eval mock-c20-confirm.js
(() => {
  document.querySelectorAll('[data-mock=c20]').forEach((e) => e.remove());
  const dialog = [...document.querySelectorAll('.tdialog--confirm')].pop();
  if (!dialog) return 'open a delete box first';
  const busy = Boolean(window.__c20?.busy);
  const row = dialog.querySelector('.dialog-actions');
  const [keep, action] = row.querySelectorAll(':scope > .btn');
  // Remember the usual words once, so the script can be run again on the same box.
  if (!action.dataset.usual) action.dataset.usual = action.lastChild.nodeValue;
  const usualWords = action.dataset.usual;
  const busyWords = 'Deleting…';
  const icon = action.querySelector('svg')?.outerHTML ?? '';
  // Today's hint class → ConfirmBox's (same look; Delete camper has none today).
  dialog.querySelector('.ev-confirm-hint')?.classList.replace('ev-confirm-hint', 'cfm-hint');
  row.classList.add('cfm-actions');
  // The sizer, as ConfirmButtons draws it (shared.css .cfm-sizer).
  const sizer = document.createElement('span');
  sizer.className = 'cfm-sizer';
  sizer.dataset.mock = 'c20';
  sizer.setAttribute('aria-hidden', 'true');
  sizer.innerHTML = `<span class="btn">${keep.textContent}</span><span class="cfm-sizer-action">`
    + `<span class="btn btn-delete" data-words="usual">${icon}${usualWords}</span>`
    + `<span class="btn btn-delete" data-words="busy">${icon}${busyWords}</span></span>`;
  row.append(sizer);
  const stacked = sizer.getBoundingClientRect().width > row.clientWidth + 0.5;
  row.classList.toggle('is-stacked', stacked);
  const usualW = sizer.querySelector('[data-words=usual]').getBoundingClientRect().width;
  const busyW = sizer.querySelector('[data-words=busy]').getBoundingClientRect().width;
  keep.classList.toggle('is-unavailable', busy);
  action.classList.toggle('is-unavailable', busy);
  action.lastChild.nodeValue = busy ? busyWords : usualWords;
  action.style.minWidth = !stacked && (busy || busyW > usualW) ? `${Math.max(usualW, busyW)}px` : '';
  // No focus ring in the picture (the box puts focus on "Keep …" when it opens; that look doesn't change).
  document.activeElement?.blur?.();
  return `${stacked ? 'stacked' : 'side by side'}${busy ? ', busy' : ''}`;
})()
