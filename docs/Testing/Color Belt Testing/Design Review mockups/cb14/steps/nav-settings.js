// helper used by the other steps: window.__wait(fn, ms) resolves when fn() is truthy
window.__wait = (fn, ms = 6000) => new Promise((res, rej) => { const t0 = Date.now(); const tick = () => { const v = fn(); if (v) return res(v); if (Date.now() - t0 > ms) return rej(new Error('timeout')); setTimeout(tick, 100); }; tick(); });
// Settings, top of the page, once the schools' rows have loaded (not the gray placeholders)
(async () => {
  location.hash = '#settings';
  await window.__wait(() => document.querySelector('main .settings .st-details'));
  await new Promise((r) => setTimeout(r, 1200));
  window.scrollTo(0, 0);
  return 'settings';
})()
