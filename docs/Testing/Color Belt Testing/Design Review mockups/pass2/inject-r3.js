// inject-r3.js: draws pass 1's R3-10 + R3-02 "after" ON TOP of the event roster in the preview, for the
// mockup only (rulebook v1.047 (15), v1.046 (8)):
//   - R3-10: the possible-duplicate box moves ABOVE the count cards (one order above every roster);
//   - R3-02: a row marked "Possible duplicate" stays out of Paid and Not paid until the pair is
//     resolved (Students still counts it; Payments recorded keeps any money), and one gray line under
//     the cards says so, as Black Belt does: "1 possible duplicate isn't counted in Paid or Not paid
//     until it's resolved." (Hidden with the money cards while Hide private details is on.)
//   window.__r3 = { notPaid: 8, paid: 6 }   the numbers the cards show after (worked out by the shoot
//                                           script from the rows: the flagged rows leave Paid / Not paid)
// A reload removes it.
(() => {
  const main = document.querySelector('main');
  const cards = main && main.querySelector('.ev-cards');
  const box = main && main.querySelector('.ev-dupbox');
  if (!cards || !box) return 'need the cards and the duplicate box on the page';
  cards.before(box);
  const want = window.__r3 || {};
  for (const card of cards.querySelectorAll('.ev-card')) {
    const label = card.querySelector('.ev-card-label')?.innerText.trim();
    const value = card.querySelector('.ev-card-value');
    if (label === 'Not paid' && want.notPaid !== undefined) value.textContent = String(want.notPaid);
    if (label === 'Paid' && want.paid !== undefined) value.textContent = String(want.paid);
  }
  let note = cards.parentElement.querySelector(':scope > .cards-note');
  if (!note) {
    note = document.createElement('p');
    note.className = 'cards-note';
    cards.after(note);
  }
  const n = want.flagged ?? 1;
  note.textContent = n === 1
    ? `1 possible duplicate isn't counted in Paid or Not paid until it's resolved.`
    : `${n} possible duplicates aren't counted in Paid or Not paid until they're resolved.`;
  return 'drawn';
})();
