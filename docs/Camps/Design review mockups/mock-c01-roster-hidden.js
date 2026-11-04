// mock-c01-roster-hidden.js — Camps design review C1, drawn ON TOP of the real preview page for a picture only:
// the camp roster while "Hide private details" is on (rule v1.000, as Color Belt's v0.412).
// PC / tablet table: the Paid column goes; a "Possible duplicate" tag moves onto the name's line.
// Phone cards: the Paid / "$X due" / "Owes $X" tag goes; "Possible duplicate" stays.
// Summary line: "N to collect · $X" goes; "N of M here today", the pizza count and "Updated …" stay.
// Based on docs/Design Review/tools/mock-item02-camps-hidden.js (the walkthrough's PC version).
// Nothing in the app changes; a reload removes it.
// Run on the camp page:   node cdp.mjs eval "$(cat mock-c01-roster-hidden.js)"
(() => {
  const isDup = (el) => /^Possible duplicate/.test(el.getAttribute('aria-label') || el.innerText.trim());
  const table = document.querySelector('main table');
  if (table && !table.dataset.mock) {
    table.dataset.mock = 'c01';
    const heads = [...table.querySelectorAll('thead th')];
    const paidIndex = heads.findIndex((th) => th.innerText.trim() === 'Paid');
    if (paidIndex >= 0) {
      for (const tr of table.querySelectorAll('tr')) {
        const cell = tr.children[paidIndex];
        if (!cell) continue;
        const dup = [...cell.querySelectorAll('button, span')].find(isDup);
        if (dup) {
          // On the name's line, right after the age (the row keeps its height).
          Object.assign(dup.style, { display: 'inline-flex', marginLeft: '8px', verticalAlign: 'middle' });
          const age = tr.children[0].querySelector('.cp-age-text');
          if (age) age.after(dup); else tr.children[0].append(dup);
        }
        cell.remove();
      }
    }
  }
  // Phone cards: the money tag sits in .cp-rcard-top next to the name.
  for (const top of document.querySelectorAll('.cp-rcard-top')) {
    for (const tag of top.querySelectorAll('.ttag')) if (!isDup(tag)) tag.remove();
  }
  const collect = [...document.querySelectorAll('.cp-statline > span')].find((s) => /to collect/.test(s.innerText));
  if (collect) collect.remove();
  return 'drawn';
})()
