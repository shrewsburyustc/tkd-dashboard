// mock-item04-undo-confirm.js — draws Design Review item 4's "after" picture ON TOP of the real preview
// page, for a picture only: Color Belt asking before it undoes a payment, with Star's approved wording
// (v0.508) in Color Belt's own confirm box (open one first: a paid student's ⋯ → Delete permanently,
// which deletes nothing until confirmed). The button words are settled later, in item 8.
// Nothing in the app changes; Keep student closes it.
// Run with that confirm open:   node cdp.mjs eval "$(cat mock-item04-undo-confirm.js)"
(() => {
  const d = document.querySelector('[role=dialog], [role=alertdialog]');
  if (!d || !d.querySelector('.btn-delete')) return 'open a Color Belt Delete permanently confirm first';
  d.dataset.mock = 'undo-confirm';
  const name = window.__undoName || 'Owen Reed';
  d.querySelector('.dialog-title').textContent = `Undo ${name}’s payment?`;
  d.querySelector('.tdialog-body').textContent = 'The $65 check payment recorded on Oct 19 is reversed and the row goes back to Not paid. Both stay in the history.';
  d.querySelector('.ev-confirm-hint')?.remove();
  const [keep, act] = d.querySelectorAll('.dialog-actions .btn');
  keep.textContent = 'Keep payment';
  act.className = 'btn btn-primary';
  act.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14l-4 -4l4 -4"></path><path d="M5 10h11a4 4 0 1 1 0 8h-1"></path></svg>Undo payment';
  return 'drawn';
})()
