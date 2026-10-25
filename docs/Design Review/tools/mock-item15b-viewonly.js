// mock-item15b-viewonly.js — draws Design Review item 15b's "after" pictures ON TOP of the real preview page,
// for a picture only: the page's gray staff line (p.viewonly) reworded to the one pattern —
// "View only. Ask an admin to …" where staff can only look, "[what staff can do]. Ask an admin to …" where they
// can do part of the page. Set window.__mock15b = 'the new words'. Nothing in the app changes; a reload removes it.
// Run (signed in as staff):   node cdp.mjs eval "$(cat mock-item15b-viewonly.js)"
(() => {
  const line = document.querySelector('main p.viewonly');
  if (!line || !window.__mock15b) return 'open a page with the staff line, and set window.__mock15b';
  line.textContent = window.__mock15b;
  line.dataset.mock = 'item15b';
  return 'drawn';
})()
