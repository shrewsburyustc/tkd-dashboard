// mock-c01-compare-hidden.js — Camps design review C1, drawn ON TOP of the real preview page for a picture only:
// the Compare dialog ("… is signed up twice") while "Hide private details" is on. Today it ignores the switch
// (Dashboard core plan §10). After: Paying by, Total and Payment keep their rows and read gray
// "Hidden on this tablet" in both columns, and are never marked different (the shared Compare dialog's
// hidden rows, v1.102). Signed up, Reference, Days and Extras stay. Parts are hidden, never removed.
// Run with the Compare dialog open:   node shotx.mjs out.png --eval mock-c01-compare-hidden.js
(() => {
  const d = [...document.querySelectorAll('.dialog, [role=dialog]')].pop();
  if (!d) return 'no dialog';
  // PC / tablet: a table (th = label, td = each sign-up). Phone: one card per sign-up (dt = label, dd = value).
  const rows = [...d.querySelectorAll('table.ev-cmp tbody tr'), ...d.querySelectorAll('.ev-cmp-card .ev-sum-row')];
  for (const tr of rows) {
    const label = tr.querySelector('th, dt')?.innerText.trim();
    if (!['Paying by', 'Total', 'Payment'].includes(label)) continue;
    tr.classList.remove('is-diff');
    for (const td of tr.querySelectorAll('td, dd')) {
      if (td.dataset.mock) continue;
      td.dataset.mock = 'c01';
      td.classList.remove('is-diff');
      [...td.childNodes].forEach((n) => { if (n.nodeType === 1) n.style.display = 'none'; else { const s = document.createElement('span'); s.style.display = 'none'; n.replaceWith(s); s.append(n); } });
      const s = document.createElement('span');
      s.style.color = '#6B6B6B';
      s.textContent = 'Hidden on this tablet';
      td.append(s);
    }
  }
  return 'drawn';
})()
