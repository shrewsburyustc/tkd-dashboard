// mock-item07-remove.js — draws Design Review item 7's options ON TOP of the real preview page, for a
// picture only, on Black Belt's open row ⋯ menu: "Remove candidate" becomes the two items Color Belt,
// Star and Camps already have — Withdraw (user-minus) and Delete permanently (trash).
//   window.__removeMock = 'split'         option C: Withdraw plain, Delete permanently red
//   window.__removeMock = 'split-red'     option B: both red (rule §7 as written: red for every removal)
//   window.__removeMock = 'split-grayed'  option C for a candidate with payment records: Delete permanently
//                                         grayed, with Black Belt's approved reason (v0.904) as the gray
//                                         line under it — the app's existing grayed-menu-item look
//   window.__removeName = 'Sam Lee'       the name in that reason
// Red and gray come from the app's own menu classes. Nothing in the app changes; closing the menu removes it.
// Run with Black Belt's row ⋯ menu open:   node cdp.mjs eval "$(cat mock-item07-remove.js)"
(() => {
  const m = document.querySelector('[role=menu]');
  if (!m) return 'open a row ⋯ menu first';
  const remove = [...m.querySelectorAll('[role=menuitem]')].find((i) => i.innerText.trim() === 'Remove candidate');
  if (!remove) return 'no Remove candidate item';
  const mode = window.__removeMock;
  const trash = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tabler-icon menu-icon" aria-hidden="true"><path d="M4 7l16 0"></path><path d="M10 11l0 6"></path><path d="M14 11l0 6"></path><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12"></path><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3"></path></svg>';
  const del = remove.cloneNode(true);
  remove.innerHTML = remove.querySelector('svg').outerHTML + 'Withdraw';
  remove.dataset.mock = 'withdraw';
  if (mode === 'split-red') remove.classList.add('tmenu-item--danger');
  del.dataset.mock = 'delete';
  if (mode === 'split-grayed') {
    const name = window.__removeName || 'Sam Lee';
    del.classList.add('is-disabled');
    del.setAttribute('aria-disabled', 'true');
    del.innerHTML = trash + '<span class="ev-menu-two"><span>Delete permanently</span>'
      + `<span class="ev-menu-reason">${name} has payment records, so they can’t be deleted. Withdraw them instead.</span></span>`;
  } else {
    del.classList.add('tmenu-item--danger');
    del.innerHTML = trash + 'Delete permanently';
  }
  remove.after(del);
  return `drawn: ${mode}`;
})()
