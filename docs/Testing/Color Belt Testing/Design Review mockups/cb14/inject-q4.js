// inject-q4.js — CB14 sheet 4 (Question 4 of 4): what is the Color Belt tab that keeps the prices called?
// For the mockup only: it renames the tab that inject-cb14.js ('prices' or 'pricesStaff') has just drawn
// and writes the gray line above the list. Nothing in the app changes; a reload removes everything.
//   window.__q4 = 'today'   nothing drawn (today's "Classes and ranks" tab); only measures the tab bar
//   window.__q4 = 'A'       "Prices"             (admin)
//   window.__q4 = 'Astaff'  "Prices"             (staff: view only; run after inject-cb14.js 'pricesStaff')
//   window.__q4 = 'B'       "Prices and awards"  (admin)
//   window.__q4 = 'C'       "Testing prices"     (admin)
// Answers with the tab bar's measurements: whether it scrolls sideways (its content is wider than the
// bar) and whether the last tab, Private testing, is cut off at the right edge.
// Run after: window.__cb14 = 'prices' (or 'pricesStaff' / 'clear'); inject-cb14.js
(() => {
  const mode = window.__q4 || '';
  document.activeElement?.blur?.(); // no focus ring in the picture
  const bar = document.querySelector('main .ttabs');
  if (!bar) return 'open Color Belt testing first';
  const LABELS = { A: 'Prices', Astaff: 'Prices', B: 'Prices and awards', C: 'Testing prices' };
  if (mode !== 'today') {
    const copy = bar.querySelector('[data-mock=cb14]');
    if (!copy) return 'run inject-cb14.js (prices) first';
    copy.textContent = LABELS[mode];
    const line = document.querySelector('main p.st-sub[data-mock=cb14]');
    line.querySelectorAll('span').forEach((s) => s.remove()); // sheet 1's "question 4, later" tag
    const staff = mode === 'Astaff';
    line.textContent = "Testing prices, sparring gear and each class's final award. " +
      (staff ? 'Classes and ranks are set by an admin.' : 'Classes and ranks are in Settings.');
    // (staff: the app's own view-only line stays where the app puts it, above this line)
    // like the app: keep the current tab in view inside the bar (the bar only, never the page)
    const r = copy.getBoundingClientRect();
    const b = bar.getBoundingClientRect();
    if (r.right > b.right) bar.scrollLeft += r.right - b.right;
  }
  window.scrollTo(0, 0);
  document.querySelector('main')?.scrollTo?.(0, 0);
  const tabs = [...bar.querySelectorAll('[role=tab]')].filter((t) => t.offsetParent);
  const last = tabs[tabs.length - 1].getBoundingClientRect();
  const br = bar.getBoundingClientRect();
  return `${mode}: bar ${bar.clientWidth}px, content ${bar.scrollWidth}px, scrolls=${bar.scrollWidth > bar.clientWidth}, ` +
    `lastTabCut=${last.right > br.right + 0.5 || last.left < br.left - 0.5}, ` +
    `tabs=${tabs.map((t) => Math.round(t.getBoundingClientRect().width)).join('/')}`;
})()
