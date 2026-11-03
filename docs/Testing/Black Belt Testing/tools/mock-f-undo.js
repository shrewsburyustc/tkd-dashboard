// mock-f-undo.js — draws mockup F's toasts (design review BB5, "Undo for 5 seconds", rulebook v1.006)
// ON TOP of the real preview page, for the review pictures only. Nothing in the app's code changes.
// Why: a real toast goes away after 5 seconds, and today's "Changes saved", "Owen Price restored" and
// "Cycle added" toasts have no Undo button — the "After" pictures need one. Drawing the toast also lets
// every screen size show the same words without saving anything again.
// How: open the screen the toast belongs to (e.g. a candidate's detail after Edit details), then set
//   window.__mockF = { text: 'Changes saved', undo: true }   (undo: false = today's toast, no button)
// and run this file in the page (Design Review's cdp.mjs eval). It puts a toast into the app's own
// toast area (.toast-region) with the SAME markup as a real "Owen Price withdrawn · Undo" toast
// (copied from its outerHTML), so it looks exactly like the real one. A watcher puts it back if React
// redraws the page. window.__mockF = 'clear' (or a reload) removes it.
// Optional: swap: [['Version 2027-1', 'Version 2027-2']] also changes those exact words on the page
// (e.g. the Waiver block's version tag after "Waiver saved · version 2027-2"); 'clear' puts them back.
(() => {
  const want = window.__mockF;
  if (window.__mockFWatch) { window.__mockFWatch.disconnect(); window.__mockFWatch = null; }
  const region = () => document.querySelector('.toast-region');
  const old = () => document.querySelector('[data-mock-f]');
  // Words on the page swapped for the picture (leaf elements whose whole text matches), kept to undo.
  const swapped = (window.__mockFSwapped ||= []);
  const unswap = () => {
    for (const [el, text] of swapped) el.textContent = text;
    swapped.length = 0;
  };
  if (want === 'clear') {
    old()?.remove();
    unswap();
    return 'cleared';
  }
  if (!want || !want.text) return "set window.__mockF = { text, undo } or 'clear'";
  if (!region()) return 'no .toast-region on this page';

  // The real Undo button: "ti-arrow-back-up" icon + the word Undo (from Toast.jsx, as rendered).
  const undoButton =
    '<button type="button" class="toast-undo"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" ' +
    'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round" class="tabler-icon tabler-icon-arrow-back-up" aria-hidden="true">' +
    '<path d="M9 14l-4 -4l4 -4"></path><path d="M5 10h11a4 4 0 1 1 0 8h-1"></path></svg>Undo</button>';

  const draw = () => {
    for (const [from, to] of want.swap ?? []) {
      for (const el of document.querySelectorAll('body *')) {
        if (el.children.length === 0 && el.textContent === from) {
          swapped.push([el, from]);
          el.textContent = to;
        }
      }
    }
    const r = region();
    if (!r) return;
    // A real toast showing at the same time would sit on top of ours — hide it while drawing.
    for (const t of r.querySelectorAll('.toast:not([data-mock-f])')) t.style.display = 'none';
    const have = old();
    if (have && have.parentElement === r && have.dataset.mockF === JSON.stringify(want)) return;
    have?.remove();
    const el = document.createElement('div');
    el.className = want.undo ? 'toast toast--action' : 'toast';
    el.dataset.mockF = JSON.stringify(want);
    const span = document.createElement('span');
    span.className = 'toast-text';
    span.textContent = want.text;
    el.appendChild(span);
    if (want.undo) el.insertAdjacentHTML('beforeend', undoButton);
    r.appendChild(el);
  };
  draw();
  window.__mockFWatch = new MutationObserver(draw);
  window.__mockFWatch.observe(document.body, { childList: true, subtree: true });
  return `drawn: ${want.text}${want.undo ? ' · Undo' : ''}`;
})()
