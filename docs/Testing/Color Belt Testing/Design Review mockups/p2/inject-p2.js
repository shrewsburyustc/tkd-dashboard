// inject-p2.js — draws mockup P2's "after" on top of the real preview Private testing tab (no app code
// changes). Same helpers as P1 (markPaid, menuReceipt, confirm), plus cards(): the shared CountCards'
// look on the tab's four cards (Paid / Not paid as filter buttons, Payments recorded a plain total),
// with an optional filter on, and the "1 owes more" note drawn amber (option A) or gray (option B).
window.__p2 = {
  clear() { document.querySelectorAll('.p2-inject').forEach((e) => e.remove()); },
  markPaid(name, amount, method, where) {
    this.clear();
    const btn = [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === `Mark ${name} paid`);
    const r = btn.getBoundingClientRect();
    const seg = ['Cash', 'Check', 'Card'].map((m) => `<button type="button" role="radio" aria-checked="${m === method}" class="segment${m === method ? ' is-checked' : ''}">${m}</button>`).join('');
    const check = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tabler-icon tabler-icon-check" aria-hidden="true"><path d="M5 12l5 5l10 -10"></path></svg>';
    const box = document.createElement('div');
    box.className = 'mpb p2-inject';
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
    wrap.className = 'p2-inject';
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
  // cards({ filter: null | 'paid' | 'notPaid', note: 'amber' | 'gray' }) — the shared cards' look.
  cards({ filter = null, note = 'gray' } = {}) {
    document.querySelectorAll('.p2-filter').forEach((e) => e.remove());
    document.querySelectorAll('[role=row][aria-label]').forEach((r) => { r.style.display = ''; });
    const cards = [...document.querySelectorAll('.ev-cards .ev-card')];
    for (const card of cards) {
      const label = card.querySelector('.ev-card-label').innerText.trim();
      card.classList.remove('is-selected');
      const warn = card.querySelector('.pv-card-warn');
      if (warn && note === 'gray') warn.classList.remove('pv-card-warn');
      const n = card.querySelector('.ev-card-note');
      if (n && note === 'amber') n.classList.add('pv-card-warn');
      if (/^Payments recorded/.test(label)) continue; // a total: not a button (v1.013)
      card.classList.add('ev-card--button');
      if ((filter === 'paid' && label === 'Paid') || (filter === 'notPaid' && label === 'Not paid')) card.classList.add('is-selected');
    }
    if (filter) {
      const p = document.createElement('p');
      p.className = 'ev-filter-line p2-filter';
      p.innerHTML = `Showing ${filter === 'paid' ? 'paid' : 'not paid'} only · <button type="button" class="link-button">Show all</button>`;
      document.querySelector('.ev-cards').after(p);
      for (const row of document.querySelectorAll('[role=row][aria-label]')) {
        const tag = [...row.querySelectorAll('.ttag')].map((t) => t.innerText.trim());
        const isPaid = tag.includes('Paid');
        if ((filter === 'paid') !== isPaid) row.style.display = 'none';
      }
    }
    const c = document.querySelector('.ev-cards').getBoundingClientRect();
    return JSON.stringify({ cards: [c.x, c.y, c.width, c.height] });
  },
};
'ready';
