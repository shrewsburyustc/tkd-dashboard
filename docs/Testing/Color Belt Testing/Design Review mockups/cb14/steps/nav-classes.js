// helper used by the other steps: window.__wait(fn, ms) resolves when fn() is truthy
window.__wait = (fn, ms = 6000) => new Promise((res, rej) => { const t0 = Date.now(); const tick = () => { const v = fn(); if (v) return res(v); if (Date.now() - t0 > ms) return rej(new Error('timeout')); setTimeout(tick, 100); }; tick(); });
// Color Belt → Classes and ranks, first class open
(async () => {
  location.hash = '#testing/color-belt';
  const tab = await window.__wait(() => [...document.querySelectorAll('main [role=tab]')].find((t) => t.innerText.trim() === 'Classes and ranks'));
  tab.click();
  const t = await window.__wait(() => document.querySelector('main .ctoggle'));
  if (t.getAttribute('aria-expanded') === 'false') t.click();
  await window.__wait(() => document.querySelector('main .rrow, main .prow'));
  window.scrollTo(0, 0); document.querySelector('main')?.scrollTo?.(0, 0);
  return 'classes open';
})()
