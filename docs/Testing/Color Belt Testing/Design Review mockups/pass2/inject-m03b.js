// inject-m03b.js: draws the options for the M-03 follow-up question ON TOP of the open receipt (or the
// summary) of a CANCELLED private testing that was only partly paid (Ava Chen in the preview: $65 of
// $85 paid, then cancelled), for the mockup only. A reload removes it.
//   window.__m03b = 'A'        receipt: nothing more is owed — Total due = what was paid ($65), Balance
//                              "$0 · paid in full", and the Private testing line says "· cancelled Nov 6"
//   window.__m03b = 'B'        receipt: the price stays — Total due $85, Paid $65, and the balance says the
//                              rest isn't owed: "$20 · not owed (cancelled)"; the same "· cancelled Nov 6"
//   window.__m03b = 'summary'  the summary's Payment row without " · $20 more to collect" (the row
//                              already leaves it out on a cancelled private testing)
(() => {
  const mode = window.__m03b;
  const dot = String.fromCharCode(183);
  const dialog = [...document.querySelectorAll('[role=dialog]')].pop();
  if (!dialog) return 'open the receipt or the summary first';
  if (mode === 'summary') {
    const row = [...dialog.querySelectorAll('.ev-sum-row')].find((r) => r.querySelector('dt')?.innerText.trim() === 'Payment');
    if (!row) return 'no Payment row';
    const dd = row.querySelector('dd');
    for (const node of [...dd.childNodes]) {
      if (node.nodeType === 3 && node.textContent.includes('more to collect')) {
        // (\S = the middle dot; written that way so the PowerShell shoot script can't garble it)
        node.textContent = node.textContent.replace(/\s*\S\s*\$\d+ more to collect/, '');
      }
    }
    return 'summary drawn';
  }
  const sheet = dialog.querySelector('.rcpt-sheet');
  if (!sheet) return 'open the receipt first';
  // "Tue, Dec 1, 4:00 PM" → "Tue, Dec 1, 4:00 PM · cancelled Nov 6"
  const dts = [...sheet.querySelectorAll('.rcpt-facts dt')];
  const privateDt = dts.find((dt) => dt.innerText.trim() === 'Private testing');
  if (privateDt) privateDt.nextElementSibling.textContent += ` ${dot} cancelled Nov 6`;
  const totals = [...sheet.querySelectorAll('.rcpt-totals > div')];
  const setValue = (div, text) => {
    const label = div.querySelector('span');
    div.textContent = '';
    div.append(label, text);
  };
  if (mode === 'A') {
    setValue(totals[0], '$65');
    setValue(totals[2], `$0 ${dot} paid in full`);
  } else if (mode === 'B') {
    setValue(totals[2], `$20 ${dot} not owed (cancelled)`);
  }
  return `receipt ${mode} drawn`;
})();
