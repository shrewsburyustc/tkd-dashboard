// mock-item01-finance.js — draws the "fixed" Daily report for Design Review item 1, ON TOP of the real
// preview page, for a picture only. It adds the Black Belt payment the way rulebook v0.808 says Finance
// will show it ("Black Belt · Spring 2027 · Payment 2", counted on the day recorded, school as recorded).
// Nothing in the app changes: this edits what one hidden browser tab shows, and a reload removes it.
// Run with: node cdp.mjs eval "$(cat mock-item01-finance.js)"   (the page must show the Apr 26 report)
(() => {
  // 1. The cards: Total and Cash now include the $500.
  const setCard = (label, amount, sub) => {
    const card = [...document.querySelectorAll('.fin-card')].find((c) => c.querySelector('.fin-card-label')?.innerText.trim() === label);
    if (!card) return false;
    const spans = [...card.children].filter((el) => !el.classList.contains('fin-card-label'));
    spans[0].textContent = amount;
    if (spans[1]) spans[1].textContent = sub;
    card.dataset.mock = 'card';
    return true;
  };
  const cardsOk = setCard('Total', '$515.00', '2 payments') && setCard('Cash', '$500.00', '1 payment');

  // 2. The list: a Cash group with the Black Belt row, before the Card group (Finance's order is Cash, Check, Card).
  const tbody = document.querySelector('table.fin-table tbody');
  if (!tbody || tbody.querySelector('[data-mock=row]')) return { cardsOk, rowAdded: false };
  const group = document.createElement('tr');
  group.className = 'fin-grp';
  group.innerHTML = '<th colspan="5" scope="colgroup">Cash<span> · 1 payment · $500.00</span></th>';
  const row = document.createElement('tr');
  row.className = 'fin-row';
  row.dataset.mock = 'row';
  row.innerHTML = '<td class="fin-sub fin-col-time">2:21 PM</td>'
    + '<td><span class="fin-name-line"><span>Bao Nguyen</span></span></td>'
    + '<td>Black Belt <span class="fin-sub">· Spring 2027 · Payment 2</span></td>'
    + '<td class="fin-r"><span>$500.00</span></td>'
    + '<td class="fin-sub">Jeffrey Berg</td>';
  tbody.prepend(row);
  tbody.prepend(group);
  return { cardsOk, rowAdded: true };
})()
