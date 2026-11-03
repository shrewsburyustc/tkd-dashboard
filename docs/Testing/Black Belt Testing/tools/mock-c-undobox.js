// mock-c-undobox.js — draws mockup C (the Undo payment box's words, design review BB3) ON TOP of the real
// preview box, for the review pictures only. Nothing in the app's code changes.
// Why: today one card payment that paid three installments asks "Undo payment 1 + Payment 2 + Payment 3?";
// the box must name the payment clearly (amount, how, when) now that the roster row's ⋯ opens it too.
// How: open an Undo payment box first (a payment line's ⋯ → Undo payment; never press its Undo button),
// then set window.__mockC = { title, body } and run this file in the page (Design Review's cdp.mjs eval).
// It only swaps the title's and the body's words; a watcher puts them back if React redraws the box.
// window.__mockC = 'clear' (or a reload) puts the real words back.
(() => {
  const want = window.__mockC;
  if (window.__mockCWatch) { window.__mockCWatch.disconnect(); window.__mockCWatch = null; }
  // the small "are you sure?" box (Dialog variant 'confirm'), not the candidate detail behind it
  const box = () => [...document.querySelectorAll('.tdialog--confirm')].find((d) => /Undo/.test(d.innerText) && d.getBoundingClientRect().height > 0);
  const d = box();
  if (!d) return 'open an Undo payment box first';
  const title = () => box()?.querySelector('h2, h1, .dialog-title, [id$="title"]');
  const body = () => box()?.querySelector('.tdialog-body');
  if (!window.__mockCOrig) window.__mockCOrig = { title: title()?.textContent, body: body()?.textContent };
  if (want === 'clear') {
    const o = window.__mockCOrig;
    if (title() && o.title) title().textContent = o.title;
    if (body() && o.body) body().textContent = o.body;
    window.__mockCOrig = null;
    return 'cleared';
  }
  if (!want || !want.title) return "set window.__mockC = { title, body } or 'clear'";
  const apply = () => {
    const t = title();
    const b = body();
    if (t && t.textContent !== want.title) t.textContent = want.title;
    if (b && want.body && b.textContent !== want.body) b.textContent = want.body;
  };
  apply();
  window.__mockCWatch = new MutationObserver(apply);
  window.__mockCWatch.observe(document.body, { childList: true, subtree: true, characterData: true });
  return `drawn: ${title()?.textContent} | ${body()?.textContent}`;
})()
