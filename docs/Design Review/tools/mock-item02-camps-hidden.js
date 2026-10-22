// mock-item02-camps-hidden.js — draws Design Review item 2's "after" picture ON TOP of the real preview
// page, for a picture only: the camp roster while "Hide private details" is on, following the pattern
// Color Belt and Star already use (rule v0.506 / v0.412: no payment column, no amounts to collect;
// everything else stays). Nothing in the app changes; a reload removes it.
// Run on the camp page:   node cdp.mjs eval "$(cat mock-item02-camps-hidden.js)"
(() => {
  const table = document.querySelector('main table');
  if (!table || table.dataset.mock) return 'already drawn or no roster';
  table.dataset.mock = 'roster';
  const heads = [...table.querySelectorAll('thead th')];
  const paidIndex = heads.findIndex((th) => th.innerText.trim() === 'Paid');
  // 1. The Paid column goes. A "Possible duplicate" tag isn't money, so it moves next to the name.
  for (const tr of table.querySelectorAll('tr')) {
    const cell = tr.children[paidIndex];
    if (!cell) continue;
    const dup = [...cell.querySelectorAll('button')].find((b) => /^Possible duplicate/.test(b.getAttribute('aria-label') || ''));
    if (dup) { dup.style.marginLeft = '8px'; tr.children[0].append(dup); }
    cell.remove();
  }
  // 2. The amount to collect leaves the summary line; attendance stays.
  const collect = [...document.querySelectorAll('.cp-statline > span')].find((s) => /to collect/.test(s.innerText));
  if (collect) collect.remove();
  return 'drawn';
})()
