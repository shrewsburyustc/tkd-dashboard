// mock-c05-toast.js — Camps design review C4 / C5, drawn ON TOP of the real preview page for a picture only:
// one toast exactly as the shared Toast (src/components/Toast.jsx) draws it — its own classes (toast,
// toast--action, toast-text, toast-undo) and the Undo button's ti-arrow-back-up icon — with the given words.
//   window.__c05 = { text: 'Payment changed', undo: true }
// It is placed in the page's always-present .toast-region (bottom-right on PC and tablet, bottom-center
// above the bottom bar on phones). Nothing is saved; a reload removes it.
// Run:   node shotx.mjs out.png --js "window.__c05={…}" --eval mock-c05-toast.js
(() => {
  const spec = window.__c05;
  const region = document.querySelector('.toast-region');
  if (!spec || !region) return 'set window.__c05 (and be on an app page)';
  region.querySelectorAll('[data-mock=c05]').forEach((e) => e.remove());
  const undo = '<button type="button" class="toast-undo"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tabler-icon tabler-icon-arrow-back-up" aria-hidden="true"><path d="M9 14l-4 -4l4 -4"></path><path d="M5 10h11a4 4 0 1 1 0 8h-1"></path></svg>Undo</button>';
  const box = document.createElement('div');
  box.dataset.mock = 'c05';
  box.className = spec.undo ? 'toast toast--action' : 'toast';
  box.innerHTML = `<span class="toast-text"></span>${spec.undo ? undo : ''}`;
  box.querySelector('.toast-text').textContent = spec.text;
  region.append(box);
  const r = box.getBoundingClientRect();
  return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
})()
