// mock-c18-guard.js — Camps design review C18 (rule v1.027), drawn ON TOP of the real preview page for a picture
// only: Save as template with a changed name, after Esc / a click outside / Back. Today it closes and the typing
// is lost; after, it stays open with the shared note "Unsaved changes. Save or cancel first." under its buttons,
// drawn exactly as Camps' other dialogs draw it (div.tdialog-note > div.notice with ti-alert-triangle). On phones
// the note also has the "Discard changes" link (rule v0.56), as Camps' Edit payment / Edit details do.
// Based on docs/Design Review/tools/mock-item17b-guard.js (the walkthrough's PC version). Only adds a part.
// Run with Save as template open:   node shotx.mjs out.png --eval mock-c18-guard.js
(() => {
  document.querySelectorAll('[data-mock=c18]').forEach((e) => e.remove());
  const dialog = [...document.querySelectorAll('.dialog, [role=dialog]')].pop();
  if (!dialog) return 'open the dialog first';
  const phone = window.innerWidth < 768;
  const triangle = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="notice-icon" aria-hidden="true"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 9v4"/><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0"/><path d="M12 16h.01"/></svg>';
  const block = document.createElement('div');
  block.className = 'tdialog-note';
  block.dataset.mock = 'c18';
  block.innerHTML = `<div class="notice" role="alert">${triangle}<span>Unsaved changes. Save or cancel first.${phone ? '<button type="button" class="note-action">Discard changes</button>' : ''}</span></div>`;
  const actions = dialog.querySelector('.dialog-actions');
  if (actions) actions.after(block); else dialog.append(block);
  return phone ? 'note + Discard changes' : 'note';
})()
