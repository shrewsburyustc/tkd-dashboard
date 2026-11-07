// helper used by the other steps: window.__wait(fn, ms) resolves when fn() is truthy
window.__wait = (fn, ms = 6000) => new Promise((res, rej) => { const t0 = Date.now(); const tick = () => { const v = fn(); if (v) return res(v); if (Date.now() - t0 > ms) return rej(new Error('timeout')); setTimeout(tick, 100); }; tick(); });
'ok';
