// inject-p3.js — draws mockup P3's "after" on top of the real preview (no app code changes): the
// shared History line (components/HistoryLine.jsx) and an outline "Print receipt" in Color Belt's two
// summaries, and the shared receipt (components/Receipt.jsx). The shared parts are the REAL ones:
// Vite serves the app's own source files, so this imports them and draws them with the app's React.
// Run __p3.ready() once per page load (it is async), then summary(...) / receipt(...).
window.__p3 = {
  async ready() {
    const deps = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('/deps/react.js'));
    const v = deps.slice(deps.indexOf('?'));
    this.React = (await import(`/node_modules/.vite/deps/react.js${v}`)).default;
    const rd = await import(`/node_modules/.vite/deps/react-dom_client.js${v}`);
    this.createRoot = rd.createRoot ?? rd.default.createRoot;
    this.History = (await import('/src/components/HistoryLine.jsx')).default;
    this.Receipt = (await import('/src/components/Receipt.jsx')).default;
    this.schools = await (await import('/src/lib/settings/schoolsApi.js')).loadSchools().then((r) => r.schools ?? r).catch(() => []);
    return 'ready';
  },
  clear() {
    document.querySelectorAll('.p3-inject').forEach((e) => e.remove());
    (this.roots ?? []).forEach((r) => r.unmount());
    this.roots = [];
  },
  mount(el, element) {
    const root = this.createRoot(el);
    root.render(element);
    (this.roots ??= []).push(root);
  },
  // summary({ rows: [{ text, at, who, money }], open, fail, hidden, receiptButton })
  // — into the open summary dialog: Print receipt at the end of the Payment row, History at the end.
  async summary({ rows = [], open = true, fail = false, hidden = false, receiptButton = true } = {}) {
    const dlg = document.querySelector('[role=dialog]');
    const sum = dlg.querySelector('dl.ev-sum');
    if (receiptButton && !hidden) {
      const pay = [...sum.querySelectorAll('.ev-sum-row')].find((r) => r.querySelector('dt').innerText.trim() === 'Payment');
      const b = document.createElement('span');
      b.className = 'ev-sum-line p3-inject';
      b.innerHTML = '<button type="button" class="btn btn-sm" style="margin-top:8px"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tabler-icon tabler-icon-printer" aria-hidden="true"><path d="M17 17h2a2 2 0 0 0 2 -2v-4a2 2 0 0 0 -2 -2h-14a2 2 0 0 0 -2 2v4a2 2 0 0 0 2 2h2"></path><path d="M17 9v-4a2 2 0 0 0 -2 -2h-6a2 2 0 0 0 -2 2v4"></path><path d="M7 13m0 2a2 2 0 0 1 2 -2h6a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2z"></path></svg>Print receipt</button>';
      pay.querySelector('dd').appendChild(b);
    }
    const sec = document.createElement('section');
    sec.className = 'p3-inject';
    sec.style.marginTop = '12px';
    sum.after(sec);
    const load = fail ? () => Promise.reject(new Error('offline')) : async () => rows;
    const describe = (r, { hidden: h }) => (h && r.money ? { hiddenPayment: true } : { text: r.text, at: r.at, who: r.who });
    this.mount(sec, this.React.createElement(this.History, { load, describe, hidden }));
    await new Promise((r) => setTimeout(r, 300));
    if (open && !fail) sec.querySelector('.hist-btn')?.click();
    await new Promise((r) => setTimeout(r, 200));
    document.activeElement?.blur();
    const box = dlg.getBoundingClientRect(), s = sec.getBoundingClientRect();
    const btn = dlg.querySelector('.p3-inject .btn')?.getBoundingClientRect();
    return JSON.stringify({ dialog: [box.x, box.y, box.width, box.height], history: [s.x, s.y, s.width, s.height], receiptBtn: btn ? [btn.x, btn.y, btn.width, btn.height] : null });
  },
  // receipt(receipt, sub, { isPhone, onTop }) — the shared receipt box.
  async receipt(receipt, sub, { isPhone = false, onTop = true } = {}) {
    const host = document.createElement('div');
    host.className = 'p3-inject';
    document.body.appendChild(host);
    this.mount(host, this.React.createElement(this.Receipt, { receipt, sub, isPhone, onTop, hidden: false, onClose() {} }));
    await new Promise((r) => setTimeout(r, 400));
    document.activeElement?.blur();
    const d = [...document.querySelectorAll('[role=dialog]')].pop().getBoundingClientRect();
    return JSON.stringify({ receipt: [d.x, d.y, d.width, d.height] });
  },
  // schools in the receipt's footer shape
  footer() {
    return (this.schools ?? []).map((s) => ({ name: s.name, street: s.address?.street ?? '', phone: s.phone ?? '' }));
  },
};
'ok';
