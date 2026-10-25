// mock-item05b-offline.js — draws Design Review item 5b's "after" picture ON TOP of the real preview
// page, for a picture only: ONE offline bar at the top of every page, in the shared amber bar
// (errbar), with words adapted from Star grading's approved offline message (v0.513). It would show
// while the device is offline (and after two failed refreshes in a row, Camps' rule v0.718) and go
// away by itself. Nothing in the app changes; a reload removes it.
// Run on any staff page:   node cdp.mjs eval "$(cat mock-item05b-offline.js)"
(() => {
  if (document.querySelector('[data-mock=offline]')) return 'already drawn';
  const bar = document.createElement('div');
  bar.className = 'errbar';
  bar.setAttribute('role', 'status');
  bar.dataset.mock = 'offline';
  bar.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tabler-icon tabler-icon-alert-triangle errbar-icon" aria-hidden="true"><path d="M12 9v4"></path><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0"></path><path d="M12 16h.01"></path></svg>'
    + '<span class="errbar-text"><b style="font-weight:500">You’re offline.</b> Changes won’t save until the connection is back. Keep this page open — this bar goes away by itself.</span>';
  bar.style.margin = '0 0 12px';
  const main = document.querySelector('main');
  main.insertBefore(bar, main.firstElementChild);
  return 'drawn';
})()
