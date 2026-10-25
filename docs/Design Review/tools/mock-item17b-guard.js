// mock-item17b-guard.js — draws Design Review item 17b's "after" picture ON TOP of a real preview dialog, for
// a picture only: the shared unsaved-changes note (rule v0.46: "Unsaved changes. Save or cancel first.") in a
// dialog that today closes on Esc and loses the typing — Camps' Save as template.
//   window.__mock17b = 'note'    on an open dialog: adds the amber note under its Cancel / Save row, drawn
//                                exactly like the app's own (<div class="tdialog-note"><div class="notice">…)
//   window.__mock17b = 'clear'   removes it
// It only adds a part (moving or removing React's parts crashes the page); a reload also removes it.
// Run:   node cdp.mjs eval "window.__mock17b = 'note'; $(cat mock-item17b-guard.js)"
(() => {
  const mode = window.__mock17b;
  document.querySelectorAll('[data-mock=item17b]').forEach((e) => e.remove());
  if (mode === 'clear') return 'cleared';
  if (mode !== 'note') return "set window.__mock17b = 'note' or 'clear'";
  const dialog = document.querySelector('.dialog');
  if (!dialog) return 'open the dialog first';
  // ti-alert-triangle (Tabler outline), as Notice.jsx draws it at 16px
  const triangle = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="notice-icon" aria-hidden="true"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 9v4"/><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0"/><path d="M12 16h.01"/></svg>';
  const block = document.createElement('div');
  block.className = 'tdialog-note';
  block.dataset.mock = 'item17b';
  block.innerHTML = `<div class="notice" role="alert">${triangle}<span>Unsaved changes. Save or cancel first.</span></div>`;
  const actions = dialog.querySelector('.dialog-actions');
  if (actions) actions.after(block);
  else dialog.append(block);
  return 'note drawn';
})()
