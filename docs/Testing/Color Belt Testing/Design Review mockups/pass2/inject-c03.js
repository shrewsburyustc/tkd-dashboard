// inject-c03.js: draws pass 2's C-03 "after" ON TOP of Ava Chen's private testing summary in the
// preview, for the mockup only. Today the Payment row says "Paid · $85 card · paid Nov 6": the TOTAL
// with the LATEST payment's way and day, a payment that never happened. After: one line per payment
// that still stands, oldest first (as the receipt and the Edit payment subtitle already list them).
// The numbers are Ava's in the preview: $65 cash on Oct 30 (moved with her from the event), then $20
// by card on Nov 6. A reload removes it.
(() => {
  const dialog = [...document.querySelectorAll('[role=dialog]')].pop();
  if (!dialog) return 'no summary open';
  const row = [...dialog.querySelectorAll('.ev-sum-row')].find((r) => r.querySelector('dt')?.innerText.trim() === 'Payment');
  if (!row) return 'no Payment row';
  const dd = row.querySelector('dd');
  const tag = dd.querySelector('.ttag');
  const print = dd.querySelector('.ev-print-receipt')?.closest('.ev-sum-line');
  dd.textContent = '';
  // the middle dot, made from its number so the PowerShell shoot script can't garble it
  const dot = String.fromCharCode(183);
  dd.append(tag, ` ${dot} $65 cash ${dot} paid Oct 30`);
  const second = document.createElement('span');
  second.className = 'ev-sum-line';
  second.textContent = `$20 card ${dot} paid Nov 6`;
  dd.append(second);
  if (print) dd.append(print);
  return 'drawn';
})();
