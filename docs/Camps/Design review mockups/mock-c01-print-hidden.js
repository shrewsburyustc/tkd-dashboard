// mock-c01-print-hidden.js — Camps design review C1 (open question), drawn ON TOP of the real preview page for a
// picture only: Print roster's sheet while "Hide private details" is on. Today the sheet prints a Paid column
// (Paid / $X due / Owes $X) whatever the switch says. Option drawn here: the Paid column goes (as on the
// screen), and "Possible duplicate" — not money — moves next to the name. Parts are hidden, never removed.
// Run with the print sheet on the page (window.print stubbed) and print media:
//   node shotx.mjs out.png --print --eval mock-c01-print-hidden.js
(() => {
  const sheet = document.querySelector('.camp-print');
  if (!sheet) return 'no print sheet';
  const table = sheet.querySelector('.cpr-table');
  const heads = [...table.querySelectorAll('thead th')];
  const paid = heads.findIndex((th) => th.innerText.trim() === 'Paid');
  if (paid < 0) return 'already drawn';
  for (const tr of table.querySelectorAll('tr')) {
    const cell = tr.children[paid];
    if (!cell) continue;
    if (/Possible duplicate/.test(cell.innerText)) {
      const s = document.createElement('span');
      s.textContent = ' · Possible duplicate';
      s.style.fontWeight = '400';
      tr.children[0].append(s);
    }
    cell.style.display = 'none';
  }
  return 'drawn';
})()
