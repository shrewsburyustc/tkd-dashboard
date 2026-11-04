// inject-p1.js — draws mockup P1's "after" on top of the real preview roster (no app code changes).
// window.__p1.markPaid(...), .menuReceipt(html), .confirm(html) — each copies the shared part's real
// markup as Star renders it (MarkPaidBox, the ⋯ money group's Print receipt, ConfirmBox).
window.__p1 = {
  clear() { document.querySelectorAll('.p1-inject').forEach((e) => e.remove()); },
  markPaid(name, amount, method, where) {
    this.clear();
    const btn = [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === `Mark ${name} paid`);
    const r = btn.getBoundingClientRect();
    const seg = ['Cash', 'Check', 'Card'].map((m) => `<button type="button" role="radio" aria-checked="${m === method}" class="segment${m === method ? ' is-checked' : ''}">${m}</button>`).join('');
    const check = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tabler-icon tabler-icon-check" aria-hidden="true"><path d="M5 12l5 5l10 -10"></path></svg>';
    const box = document.createElement('div');
    box.className = 'mpb p1-inject';
    box.setAttribute('role', 'dialog');
    box.innerHTML = `<p class="mpb-line"><span class="mpb-name">${name}</span> · ${amount}</p><div class="mpb-field"><span class="field-label">Paid by</span><div class="segmented ev-segmented" role="radiogroup">${seg}</div></div><p class="mpb-hint">They chose ${method} ${where}.</p><button type="button" class="btn btn-sm mpb-go">${check}Mark paid ${amount}</button>`;
    document.body.appendChild(box);
    const w = box.getBoundingClientRect().width;
    const vw = document.documentElement.clientWidth;
    box.style.left = Math.max(8, Math.min(r.right - w, vw - w - 8)) + 'px';
    box.style.top = (r.bottom + 4) + 'px';
    const b = box.getBoundingClientRect();
    return JSON.stringify({ box: [b.x, b.y, b.width, b.height], btn: [r.x, r.y, r.width, r.height] });
  },
  menuReceipt(html) {
    const menu = document.querySelector('[role=menu]');
    const money = [...menu.children].find((g) => g.innerText.includes('Undo payment'));
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    money.appendChild(tmp.firstElementChild);
    const item = money.lastElementChild.getBoundingClientRect(), m = menu.getBoundingClientRect();
    return JSON.stringify({ item: [item.x, item.y, item.width, item.height], menu: [m.x, m.y, m.width, m.height] });
  },
  confirm(html) {
    this.clear();
    const wrap = document.createElement('div');
    wrap.className = 'p1-inject';
    wrap.innerHTML = html;
    document.body.appendChild(wrap);
    // ConfirmBox stacks the pair full width when it doesn't fit side by side (v1.103, D1b)
    const row = wrap.querySelector('.cfm-actions');
    const btns = row.querySelectorAll(':scope > .btn');
    if (btns[0].getBoundingClientRect().left < row.getBoundingClientRect().left - 1) row.classList.add('is-stacked');
    wrap.querySelector('[data-autofocus]').focus();
    const d = wrap.querySelector('[role=alertdialog]').getBoundingClientRect();
    return JSON.stringify({ dialog: [d.x, d.y, d.width, d.height] });
  },
};
'ready';
