// mock-item11b-camps-cards.js — draws Design Review item 11b's options ON TOP of the real preview page,
// for a picture only: a Camps camp page with the same row of count cards the other rosters have, in place
// of its summary numbers (item 11: "cards everywhere").
//   1. On a Color Belt EVENT page, run with window.__mock11b = 'harvest'
//      → keeps the event page's card row and the four card icons, plus the rail's Calendar icon.
//   2. On a camp page, run with window.__mock11b = 'draw' and window.__mock11bData =
//      { cards: [{ label, value, sub, icon, tappable }], keepComing: true|false }
//      icon: 'Students' | 'Paid' | 'Not paid' | 'Payments recorded' | 'calendar'
//      keepComing: keep "15 coming on …" as a line above the cards (option A); the "… to collect" number
//      always moves into a card. Camps' own "Updated …" time stays where it is.
// Nothing in the app changes; a reload removes it.
// Run:   node cdp.mjs eval "$(cat mock-item11b-camps-cards.js)"
(() => {
  if (window.__mock11b === 'harvest') {
    const row = document.querySelector('.ev-cards');
    if (!row) return 'open a Color Belt event page first';
    const icons = {};
    for (const card of row.querySelectorAll('.ev-card')) {
      const label = card.querySelector('.ev-card-label');
      const svg = card.querySelector('svg');
      if (label && svg) icons[label.innerText.trim().split(' · ')[0]] = svg.outerHTML;
    }
    const cal = document.querySelector('[aria-label="Calendar"] svg');
    if (cal) icons.calendar = cal.outerHTML;
    sessionStorage.setItem('__mock11bIcons', JSON.stringify(icons));
    sessionStorage.setItem('__mock11bRowClass', row.className);
    return Object.keys(icons);
  }
  const stat = document.querySelector('p.cp-statline');
  const icons = JSON.parse(sessionStorage.getItem('__mock11bIcons') || 'null');
  const data = window.__mock11bData;
  if (!stat || !icons || !data) return 'harvest first, set window.__mock11bData, and open a camp page';
  document.querySelectorAll('[data-mock=item11b]').forEach((e) => e.remove());
  const [coming, collect] = stat.children;
  collect.style.display = 'none';
  coming.style.display = data.keepComing ? '' : 'none';
  const row = document.createElement('div');
  row.className = sessionStorage.getItem('__mock11bRowClass') || 'ev-cards';
  row.dataset.mock = 'item11b';
  row.style.margin = '12px 0 16px';
  for (const c of data.cards) {
    const card = document.createElement(c.tappable ? 'button' : 'div');
    card.className = 'ev-card' + (c.tappable ? ' ev-card--button' : '');
    if (c.tappable) card.type = 'button';
    card.innerHTML = `<span class="ev-card-label">${icons[c.icon] || ''}${c.label}</span><span class="ev-card-value">${c.value}</span>`
      + (c.sub ? `<span class="ev-card-note">${c.sub}</span>` : ''); // the cards' own small second line
    row.append(card);
  }
  stat.after(row);
  return 'drawn';
})()
