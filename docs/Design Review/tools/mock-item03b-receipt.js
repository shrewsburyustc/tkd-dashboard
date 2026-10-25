// mock-item03b-receipt.js — draws Design Review item 3b's "after" picture ON TOP of the real preview
// page, for a picture only: Black Belt's real receipt dialog (open it first: Black Belt → a candidate's
// ⋯ → Print receipt), with only the words changed to a Color Belt payment, to show the same receipt
// reused in every section. Nothing in the app changes; Close removes it.
// Run with the receipt open:   node cdp.mjs eval "$(cat mock-item03b-receipt.js)"
(() => {
  const d = document.querySelector('[role=dialog]');
  if (!d || !d.querySelector('.bbr-sheet')) return 'open a Black Belt receipt first';
  d.dataset.mock = 'receipt';
  d.querySelector('.tdialog-sub').textContent = 'Ava Chen · November Children Testing';
  d.querySelector('.bbr-subtitle').textContent = 'Color belt testing · payment receipt';
  d.querySelector('.bbr-facts').innerHTML =
    '<dt>Student</dt><dd>Ava Chen · LT White → LT Yellow</dd>'
    + '<dt>Event</dt><dd>November Children Testing · Fri, Nov 20, 2026</dd>'
    + '<dt>School</dt><dd>Worcester</dd>';
  d.querySelector('.bbr-table tbody').innerHTML =
    '<tr><td class="bbr-date">Oct 22</td><td>Testing fee (early price)</td><td>Cash</td><td class="bbr-r">$50</td></tr>';
  d.querySelector('.bbr-totals').innerHTML =
    '<div><span>Total due</span>$50</div><div><span>Paid to date</span>$50</div>'
    + '<div class="bbr-balance"><span>Balance</span>$0 · paid in full</div>';
  return 'drawn';
})()
