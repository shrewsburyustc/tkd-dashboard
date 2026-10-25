// mock-item11-private-filter.js — draws Design Review item 11's "after" picture ON TOP of the real preview
// page, for a picture only: Color Belt private testing's count cards work like the event roster's —
// a tapped card turns blue, the event page's own line "Showing not paid only · Show all" appears under the
// cards, and only those rows stay. "Payments recorded" is a total, so it stays a plain box (as on the event page).
//   1. On a Color Belt EVENT page with its "Not paid" card tapped, run with window.__mock11 = 'grab'
//      → the event page's filter line is kept in sessionStorage.
//   2. Open the Private testing tab, then run with window.__mock11 = 'draw'.
//   3. Option C, on a Camps camp page: window.__mock11 = 'camps' → the summary line's "… to collect" number
//      looks tapped (blue, underlined), the same filter line says "Showing to collect only", and only the
//      campers who still owe stay (Paid rows hidden).
// Rows are only hidden, never removed. Nothing in the app changes; a reload removes it.
// Run:   node cdp.mjs eval "$(cat mock-item11-private-filter.js)"
(() => {
  if (window.__mock11 === 'grab') {
    const line = document.querySelector('p.ev-filter-line');
    if (!line) return 'tap the event page\'s Not paid card first';
    sessionStorage.setItem('__mock11line', line.outerHTML);
    return 'grabbed';
  }
  if (window.__mock11 === 'camps') {
    const stat = document.querySelector('p.cp-statline');
    const saved = sessionStorage.getItem('__mock11line');
    if (!stat || !saved) return 'grab the event line first, then open a camp page';
    const collect = [...stat.children].find((s) => /to collect/.test(s.innerText));
    collect.style.cssText = 'color:var(--color-link, #1D4ED8);text-decoration:underline;text-underline-offset:3px;cursor:pointer';
    document.querySelectorAll('[data-mock=item11]').forEach((e) => e.remove());
    const holder = document.createElement('div');
    holder.innerHTML = saved;
    const p = holder.firstElementChild;
    p.firstChild.textContent = 'Showing to collect only · ';
    p.dataset.mock = 'item11';
    stat.after(p);
    for (const name of document.querySelectorAll('button.cp-name-link')) {
      const row = name.closest('tr');
      const tag = row && row.querySelector('.ttag, [class*=tag]');
      if (row && tag && tag.innerText.trim() === 'Paid') row.style.display = 'none';
    }
    return 'drawn: camps';
  }
  const cards = [...document.querySelectorAll('.ev-cards .ev-card')];
  const line = sessionStorage.getItem('__mock11line');
  if (!cards.length || !line) return 'grab the event line first, then open the Private testing tab';
  for (const card of cards) {
    const label = card.innerText.trim();
    if (/^Payments recorded/.test(label)) continue;
    card.classList.add('ev-card--button');
    if (/^Not paid/.test(label)) card.classList.add('is-selected');
  }
  document.querySelectorAll('[data-mock=item11]').forEach((e) => e.remove());
  const holder = document.createElement('div');
  holder.innerHTML = line;
  const p = holder.firstElementChild;
  p.dataset.mock = 'item11';
  document.querySelector('.ev-cards').after(p);
  for (const row of document.querySelectorAll('[role=row][aria-label]')) {
    const tag = row.querySelector('.ttag');
    if (!(tag && /Not paid/.test(tag.innerText))) row.style.display = 'none';
  }
  return 'drawn';
})()
