// mock-g-nolocks.js — draws mockup G (design review BB11, "Close / Open registration lose their lock
// icons", rulebook v1.016) ON TOP of the real preview page, for the review pictures only. Nothing in
// the app's code changes.
// Why: in Black Belt's two ⋯ menus (the cycle page header and a Cycles list row), "Close registration"
// has a closed lock and "Open registration" an open lock. Elsewhere in the dashboard a lock means
// "Lock now", so the design review took the locks off. The words stay. Color Belt and Star already
// draw these two items with an EMPTY icon slot (their NoIcon: a blank span the size of an icon), so
// the words stay lined up with the other items. The "After" picture needs that look.
// How: open the ⋯ menu on the page, then run this file in the page (Design Review's cdp.mjs eval).
// It finds the menu items whose words are exactly "Close registration" or "Open registration" and
// hides their icon with visibility: hidden — the icon still takes its space, exactly like the blank
// NoIcon slot. A watcher does it again if React redraws the menu (e.g. it is closed and opened).
// window.__mockG = 'clear' before running it (or a reload) puts the icons back.
(() => {
  if (window.__mockGWatch) { window.__mockGWatch.disconnect(); window.__mockGWatch = null; }
  const WORDS = ['Close registration', 'Open registration'];
  const items = () => [...document.querySelectorAll('[role=menuitem]')]
    .filter((el) => WORDS.includes(el.textContent.trim()));
  if (window.__mockG === 'clear') {
    for (const el of items()) el.querySelector('svg')?.style.removeProperty('visibility');
    window.__mockG = null;
    return 'cleared';
  }
  let count = 0;
  const draw = () => {
    count = 0;
    for (const el of items()) {
      const icon = el.querySelector('svg');
      if (icon && icon.style.visibility !== 'hidden') icon.style.visibility = 'hidden';
      count += 1;
    }
  };
  draw();
  window.__mockGWatch = new MutationObserver(draw);
  window.__mockGWatch.observe(document.body, { childList: true, subtree: true });
  return `lock icons hidden on ${count} menu item(s)`;
})()
