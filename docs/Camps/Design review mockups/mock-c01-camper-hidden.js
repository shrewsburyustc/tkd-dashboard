// mock-c01-camper-hidden.js — Camps design review C1, drawn ON TOP of the real preview page for a picture only:
// Camper detail while "Hide private details" is on (rule v1.000, words from src/lib/privateDetails.js,
// as Color Belt v0.412 and Star). Price and Paying by keep their rows and read gray "Hidden on this tablet";
// the Payments part becomes one gray line "Payment details are hidden on this tablet.".
// Touch screens' "More" (the roster ⋯ items): the money items go (Change how they'll pay, Edit payment,
// Undo payment) and the gray "Admin" label goes (C9, v1.012). What is left keeps 10a's order (C8).
// Days, extras, check-in, family and sign-up stay. Parts are hidden (never removed: removing React's own
// parts can crash the page). Based on docs/Design Review/tools/mock-item02-camper-hidden.js.
// Run with Camper detail open:   node shotx.mjs out.png --eval mock-c01-camper-hidden.js
(() => {
  const d = [...document.querySelectorAll('.dialog, [role=dialog]')].pop();
  if (!d) return 'no dialog';
  if (d.dataset.mockC01) return 'already drawn';
  d.dataset.mockC01 = '1';
  const gray = (tag, text) => { const el = document.createElement(tag); el.dataset.mock = 'c01'; el.style.color = '#6B6B6B'; el.textContent = text; return el; };
  for (const row of d.querySelectorAll('.ev-sum-row')) {
    const label = row.querySelector('dt')?.innerText.trim();
    if (label === 'Price' || label === 'Paying by') {
      const dd = row.querySelector('dd');
      [...dd.childNodes].forEach((n) => { if (n.nodeType === 1) n.style.display = 'none'; else { const s = document.createElement('span'); s.style.display = 'none'; n.replaceWith(s); s.append(n); } });
      dd.append(gray('span', 'Hidden on this tablet'));
    }
  }
  const head = [...d.querySelectorAll('h3')].find((h) => h.innerText.trim() === 'Payments');
  const list = head?.nextElementSibling;
  if (list) {
    list.style.display = 'none';
    const p = gray('p', 'Payment details are hidden on this tablet.');
    p.style.margin = '4px 0 12px';
    list.after(p);
  }
  for (const b of d.querySelectorAll('.cp-detail-actions button')) {
    if (/Change how they|Edit payment|Undo payment/.test(b.innerText)) b.style.display = 'none';
  }
  d.querySelectorAll('.cp-detail-sublabel').forEach((e) => { e.style.display = 'none'; });
  return 'drawn';
})()
