// mock-item20b-offline.js — draws Design Review item 20b's option C ON TOP of a real Camps camp page (a camp
// day, after a check-in), for a picture only: check-ins kept on the tablet while offline and sent later, as
// rule §3.5 promises today. Option B needs no drawing of its own — it is item 5b's offline bar
// (mock-item05b-offline.js) plus Camps' real ⋯ → Print roster as the paper backup.
//   window.__mock20b = 'queue'   the offline bar (5b's look) saying one check-in is kept on this tablet,
//                                and today's newest check-in shown as "kept, not sent yet"
//   window.__mock20b = 'clear'   removes the drawing
// It only hides the app's parts and adds new ones (moving or removing React's parts crashes the page).
// A reload also removes it.
// Run:   node cdp.mjs eval "window.__mock20b = 'queue'; $(cat mock-item20b-offline.js)"
(() => {
  const mode = window.__mock20b;
  const MARK = 'item20b';
  document.querySelectorAll(`[data-mock=${MARK}]`).forEach((e) => e.remove());
  document.querySelectorAll(`[data-mock-hide=${MARK}]`).forEach((e) => {
    e.style.display = '';
    delete e.dataset.mockHide;
  });
  if (mode === 'clear') return 'cleared';
  if (mode !== 'queue') return "set window.__mock20b = 'queue' or 'clear'";
  const main = document.querySelector('main');
  const cells = [...main.querySelectorAll('button.cp-dc--came.is-today')];
  if (!cells.length) return 'open a camp page on a camp day with a check-in today';
  // the newest check-in today becomes "kept on this tablet, not sent yet"; the minutes since midnight come from
  // the button's label ("… checked in Wed, Apr 21 at 3:24 PM. Undo check-in"), so 3:24 PM beats 7:42 AM
  const time = (b) => b.textContent.trim();
  const minutes = (b) => {
    const m = /at (\d{1,2}):(\d{2}) (AM|PM)/.exec(b.getAttribute('aria-label') || '');
    return m ? ((Number(m[1]) % 12) + (m[3] === 'PM' ? 12 : 0)) * 60 + Number(m[2]) : -1;
  };
  const cell = cells.sort((a, b) => minutes(b) - minutes(a))[0];
  const clock = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"/><path d="M12 7v5l3 3"/></svg>';
  const kept = cell.cloneNode(false);
  kept.dataset.mock = MARK;
  kept.removeAttribute('data-day-cell');
  kept.style.cssText = 'border:1px dashed #B7791F;color:#8A5300;background:#FDF6EA';
  kept.innerHTML = `<span class="cp-dc-val">${clock}${time(cell)}</span>`;
  const note = document.createElement('div');
  note.dataset.mock = MARK;
  note.textContent = 'Not sent yet';
  note.style.cssText = 'font-size:11px;line-height:1.2;color:#8A5300;margin-top:2px';
  cell.dataset.mockHide = MARK;
  cell.style.display = 'none';
  cell.after(kept, note);
  // the offline bar, in item 5b's look, with the queue's words
  const triangle = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="errbar-icon" aria-hidden="true"><path d="M12 9v4"/><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0"/><path d="M12 16h.01"/></svg>';
  const bar = document.createElement('div');
  bar.className = 'errbar';
  bar.setAttribute('role', 'status');
  bar.dataset.mock = MARK;
  bar.style.margin = '0 0 12px';
  bar.innerHTML = `${triangle}<span class="errbar-text"><b style="font-weight:500">You’re offline.</b> 1 check-in is kept on this tablet and will be sent when the connection is back. Keep this page open.</span>`;
  main.insertBefore(bar, main.firstElementChild);
  return 'queue drawn';
})()
