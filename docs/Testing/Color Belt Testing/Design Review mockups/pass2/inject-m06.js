// inject-m06.js — draws pass 2's M-06 "after" ON TOP of the real preview Grading tab, for the mockup only:
// Print results is gone (v1.052: Color Belt testing has no printed results sheet). Where nothing is left
// at the right of the class switch (staff, or Hide private details on), the button box isn't drawn at all,
// so there is no empty space and, on phones, no empty line under the switch. A reload removes it.
// Run:   node cdp.mjs eval "$(cat inject-m06.js)"
(() => {
  const print = [...document.querySelectorAll('main button')].find((b) => b.innerText.trim() === 'Print results');
  if (!print) return 'no Print results button on this page';
  const box = print.closest('.gr-bar-buttons');
  print.style.display = 'none';
  if (box && [...box.children].every((c) => c.style.display === 'none')) box.style.display = 'none';
  return box && box.style.display === 'none' ? 'removed (box gone)' : 'removed';
})();
