// mock-item02-camper-hidden.js — draws Design Review item 2's "after" camper detail ON TOP of the real
// preview page, for a picture only: while "Hide private details" is on, the money parts use the shared
// words from src/lib/privateDetails.js ("Hidden on this tablet", "Payment details are hidden on this
// tablet."), as Color Belt and Star do. Days, extras, check-in, family and sign-up stay.
// Nothing in the app changes; closing the dialog removes it.
// Run with the camper detail open:   node cdp.mjs eval "$(cat mock-item02-camper-hidden.js)"
(() => {
  const d = document.querySelector('[role=dialog]');
  if (!d || d.dataset.mock) return 'already drawn or no dialog';
  d.dataset.mock = 'detail';
  const hint = (text) => `<span data-mock="hidden" style="color:#6B6B6B">${text}</span>`;
  for (const row of d.querySelectorAll('.ev-sum-row')) {
    const label = row.querySelector('dt')?.innerText.trim();
    if (label === 'Price' || label === 'Paying by') row.querySelector('dd').innerHTML = hint('Hidden on this tablet');
  }
  const head = [...d.querySelectorAll('h3')].find((h) => h.innerText.trim() === 'Payments');
  const list = head?.nextElementSibling;
  if (list) list.outerHTML = `<p data-mock="hidden" style="margin:4px 0 12px;color:#6B6B6B">Payment details are hidden on this tablet.</p>`;
  return 'drawn';
})()
