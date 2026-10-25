// mock-item03-paybox.js — draws Design Review item 3's proposed "Mark paid" box ON TOP of the real
// preview page, for a picture only. It starts from Camps' real box (tap a "$ due" tag) and adds the one
// thing Jeffrey asked for in Star (v0.109: "someone may register cash and pay by check or card"):
// Paid by Cash / Check / Card, starting on what the family chose, then one tap on Mark paid.
// It uses the app's own segmented buttons (testing/events/ChoiceGroup classes). Nothing in the app
// changes; a reload removes it.
// Run with Camps' box open:  node cdp.mjs eval "$(cat mock-item03-paybox.js)"
//   or pass a target first:  window.__payboxTarget = '<row text>'  (draws a box under that row's button)
(() => {
  const paid = window.__payboxMethod || 'Cash';
  const name = window.__payboxName || 'Ethan Brooks';
  const amount = window.__payboxAmount || '$245';
  const body = `
    <p class="cp-popover-line" style="margin:0 0 8px"><b style="font-weight:500">${name}</b> · ${amount}</p>
    <p style="margin:0 0 4px;font-size:12px;color:#6B6B6B">Paid by</p>
    <div class="segmented ev-segmented" role="radiogroup" style="margin:0 0 6px">
      ${['Cash', 'Check', 'Card'].map((m) => `<button type="button" role="radio" aria-checked="${m === paid}" class="segment${m === paid ? ' is-checked' : ''}">${m}</button>`).join('')}
    </div>
    <p style="margin:0 0 10px;font-size:12px;color:#6B6B6B">They chose ${paid} on the form.</p>
    <button type="button" class="btn btn-sm ev-markpaid"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5l10 -10"></path></svg>Mark paid ${amount}</button>`;
  let box = document.querySelector('.cp-popover');
  if (!box) {
    // No Camps box on this page: draw one under the target row's Mark paid / Record payment button.
    const row = [...document.querySelectorAll('[role=row], tr')].find((r) => r.innerText.includes(window.__payboxTarget || name));
    const btn = row && [...row.querySelectorAll('button')].find((b) => /Mark paid|Record payment/.test(b.innerText));
    if (!btn) return 'no box and no target button';
    const r = btn.getBoundingClientRect();
    box = document.createElement('div');
    box.className = 'cp-popover';
    box.setAttribute('role', 'dialog');
    box.style.cssText = `position:fixed;top:${r.bottom + 6}px;left:${Math.max(8, r.right - 236)}px;z-index:50`;
    document.body.append(box);
  }
  box.dataset.mock = 'paybox';
  box.style.minWidth = '236px';
  box.innerHTML = body;
  return 'drawn';
})()
