// mock-a-rowmenu.js — draws mockup A (the Candidates roster's row ⋯, design review BB3 / BB9 / BB6) ON TOP
// of the real preview screen, for the review pictures only. Nothing in the app's code changes.
// Why: Jeffrey reviews each design change as a picture before any code (CLAUDE.md). Drawing on the real
// menu keeps its exact look (sizes, colors, the grayed "unavailable" look) instead of a hand-made copy.
// How: open a row's ⋯ first, then set window.__mockA and run this file in the page (Design Review's
// cdp.mjs eval). It HIDES the menu's own items and ADDS the new ones next to them — it never moves or
// removes React's parts, so 'clear' or a reload puts the screen back exactly.
//   window.__mockA = 'admin'      the new order, admin, no Record payment in the menu (PC: it has its own button)
//   window.__mockA = 'admin-rec1' tablet / phone, option 1: Record payment first in the whole menu (as today)
//   window.__mockA = 'admin-rec2' tablet / phone, option 2: Record payment first in the money group
//   window.__mockA = 'admin-overpaid' PC, an overpaid row (the refund in the money group)
//   window.__mockA = 'admin-nopay'    PC, no payment and no grades (Delete permanently red)
//   window.__mockA = 'withdrawn'  a withdrawn row: Record refund · Print receipt — Restore · Delete permanently
//   window.__mockA = 'clear'      puts it back
// window.__mockAName = 'Mia Chen' names the candidate in the grayed Delete permanently reason.
(() => {
  const mode = window.__mockA;
  const name = window.__mockAName || 'Mia Chen';
  const undo = (window.__mockAUndo = window.__mockAUndo || []);
  while (undo.length) undo.pop()();
  if (mode === 'clear') return 'cleared';
  const menu = document.querySelector('[role=menu]');
  if (!menu) return "open a row's ⋯ first";

  // Tabler icons (the app's own: candidates/icons.js), drawn the way @tabler/icons-react draws them
  const PATHS = {
    edit: ['M7 7h-1a2 2 0 0 0 -2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2 -2v-1', 'M20.385 6.585a2.1 2.1 0 0 0 -2.97 -2.97l-8.415 8.385v3h3l8.385 -8.415', 'M16 5l3 3'],
    plan: ['M16 3l4 4l-4 4', 'M10 7l10 0', 'M8 13l-4 4l4 4', 'M4 17l9 0'],
    record: ['M7 15h-3a1 1 0 0 1 -1 -1v-8a1 1 0 0 1 1 -1h12a1 1 0 0 1 1 1v3', 'M12 19h-4a1 1 0 0 1 -1 -1v-8a1 1 0 0 1 1 -1h12a1 1 0 0 1 1 1v2.5', 'M12 14a2 2 0 1 0 4 0a2 2 0 0 0 -4 0', 'M16 19h6', 'M19 16v6'],
    editPay: ['M7 15h-3a1 1 0 0 1 -1 -1v-8a1 1 0 0 1 1 -1h12a1 1 0 0 1 1 1v3', 'M11 19h-3a1 1 0 0 1 -1 -1v-8a1 1 0 0 1 1 -1h12a1 1 0 0 1 1 1v1.25', 'M18.42 15.61a2.1 2.1 0 1 1 2.97 2.97l-3.39 3.42h-3v-3l3.42 -3.39'],
    undo: ['M9 14l-4 -4l4 -4', 'M5 10h11a4 4 0 1 1 0 8h-1'],
    refund: ['M5 21v-16a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v16l-3 -2l-2 2l-2 -2l-2 2l-2 -2l-3 2', 'M15 14v-2a2 2 0 0 0 -2 -2h-4l2 -2m0 4l-2 -2'],
    print: ['M17 17h2a2 2 0 0 0 2 -2v-4a2 2 0 0 0 -2 -2h-14a2 2 0 0 0 -2 2v4a2 2 0 0 0 2 2h2', 'M17 9v-4a2 2 0 0 0 -2 -2h-6a2 2 0 0 0 -2 2v4', 'M7 15a2 2 0 0 1 2 -2h6a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2l0 -4'],
    withdraw: ['M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0', 'M6 21v-2a4 4 0 0 1 4 -4h4c.348 0 .686 .045 1.009 .128', 'M16 19h6'],
    trash: ['M4 7l16 0', 'M10 11l0 6', 'M14 11l0 6', 'M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12', 'M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3'],
    restore: ['M9 14l-4 -4l4 -4', 'M5 10h11a4 4 0 1 1 0 8h-1'],
  };
  const svg = (key) => {
    const ns = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(ns, 'svg');
    for (const [k, v] of Object.entries({ width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: 'tabler-icon menu-icon', 'aria-hidden': 'true' })) s.setAttribute(k, v);
    for (const d of PATHS[key]) { const p = document.createElementNS(ns, 'path'); p.setAttribute('d', d); s.appendChild(p); }
    return s;
  };
  // One item, exactly as components/RowMenu.jsx draws it (separator, danger, the grayed look with a reason)
  const item = ({ label, icon, reason, danger, sep }) => {
    const wrap = document.createElement('div');
    wrap.dataset.mockA = '1';
    if (sep) { const line = document.createElement('div'); line.setAttribute('role', 'separator'); line.className = 'menu-separator'; wrap.appendChild(line); }
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    b.tabIndex = -1;
    b.className = `menu-item tmenu-item${danger ? ' tmenu-item--danger' : ''}${reason ? ' is-disabled' : ''}`;
    if (reason) b.setAttribute('aria-disabled', 'true');
    b.appendChild(svg(icon));
    const span = document.createElement('span');
    if (reason) {
      span.className = 'ev-menu-two';
      const a = document.createElement('span'); a.textContent = label;
      const r = document.createElement('span'); r.className = 'ev-menu-reason'; r.textContent = reason;
      span.append(a, r);
    } else span.textContent = label;
    b.appendChild(span);
    wrap.appendChild(b);
    return wrap;
  };

  // The approved words (staff/text.js): an active row says what to do instead (v0.904); a row already
  // withdrawn says only why (hasPaymentRecordsShort)
  const deleteReason = `${name} has payment records, so they can't be deleted. Withdraw them instead.`;
  const deleteReasonShort = `${name} has payment records, so they can't be deleted.`;
  const LISTS = {
    // overpaid (Grace Owens): the refund sits in the money group, after Undo payment
    'admin-overpaid': [
      { label: 'Edit details', icon: 'edit' },
      { label: 'Change plan or Kukkiwon', icon: 'plan' },
      { label: 'Edit payment', icon: 'editPay', sep: true },
      { label: 'Undo payment', icon: 'undo' },
      { label: 'Record refund · $50 overpaid', icon: 'refund' },
      { label: 'Print receipt', icon: 'print' },
      { label: 'Withdraw', icon: 'withdraw', sep: true },
      { label: 'Delete permanently', icon: 'trash', reason: deleteReason },
    ],
    // no payment and no grades (Rina Patel): nothing to edit or undo; Delete permanently is red and asks first
    'admin-nopay': [
      { label: 'Edit details', icon: 'edit' },
      { label: 'Change plan or Kukkiwon', icon: 'plan' },
      { label: 'Print receipt', icon: 'print', sep: true },
      { label: 'Withdraw', icon: 'withdraw', sep: true },
      { label: 'Delete permanently', icon: 'trash', danger: true },
    ],
    admin: [
      { label: 'Edit details', icon: 'edit' },
      { label: 'Change plan or Kukkiwon', icon: 'plan' },
      { label: 'Edit payment', icon: 'editPay', sep: true },
      { label: 'Undo payment', icon: 'undo' },
      { label: 'Print receipt', icon: 'print' },
      { label: 'Withdraw', icon: 'withdraw', sep: true },
      { label: 'Delete permanently', icon: 'trash', reason: deleteReason },
    ],
    'admin-rec1': [
      { label: 'Record payment', icon: 'record' },
      { label: 'Edit details', icon: 'edit', sep: true },
      { label: 'Change plan or Kukkiwon', icon: 'plan' },
      { label: 'Edit payment', icon: 'editPay', sep: true },
      { label: 'Undo payment', icon: 'undo' },
      { label: 'Print receipt', icon: 'print' },
      { label: 'Withdraw', icon: 'withdraw', sep: true },
      { label: 'Delete permanently', icon: 'trash', reason: deleteReason },
    ],
    'admin-rec2': [
      { label: 'Edit details', icon: 'edit' },
      { label: 'Change plan or Kukkiwon', icon: 'plan' },
      { label: 'Record payment', icon: 'record', sep: true },
      { label: 'Edit payment', icon: 'editPay' },
      { label: 'Undo payment', icon: 'undo' },
      { label: 'Print receipt', icon: 'print' },
      { label: 'Withdraw', icon: 'withdraw', sep: true },
      { label: 'Delete permanently', icon: 'trash', reason: deleteReason },
    ],
    // Color Belt's model (event roster): Restore takes Withdraw's place in the last group, before Delete
    withdrawn: [
      { label: 'Record refund', icon: 'refund' },
      { label: 'Print receipt', icon: 'print' },
      { label: 'Restore', icon: 'restore', sep: true },
      { label: 'Delete permanently', icon: 'trash', reason: deleteReasonShort },
    ],
  };
  const list = LISTS[mode];
  if (!list) return 'set window.__mockA to one of: ' + Object.keys(LISTS).join(', ') + ', clear';


  // Hidden by a style rule, not one by one: each cdp.mjs command re-applies the screen size, React may
  // redraw the items then, and redrawn items must stay hidden too. (The sheet's title and Cancel stay.)
  const rule = document.createElement('style');
  rule.textContent = '[role=menu] > div:has([role=menuitem]):not([data-mock-a]):not(:has(.tmenu-cancel)) { display: none !important; }';
  document.head.appendChild(rule);
  undo.push(() => rule.remove());

  // Adds the new items after the menu's own ones, and places a dropdown again with RowMenu.jsx's own
  // rule (under the ⋯, or above it if there's no room), since it grew.
  const draw = () => {
    const m = document.querySelector('[role=menu]');
    // items React pushed out of the menu when it redrew it (they'd show behind the sheet) go first
    document.querySelectorAll('[data-mock-a]').forEach((el) => { if (el.parentElement !== m) el.remove(); });
    if (!m || m.querySelector('[data-mock-a]')) return;
    const own = [...m.children].filter((el) => el.querySelector('[role=menuitem]') && !el.querySelector('.tmenu-cancel'));
    if (!own.length) return;
    let at = own[own.length - 1];
    for (const spec of list) {
      const el = item(spec);
      at.insertAdjacentElement('afterend', el);
      at = el;
    }
    const opener = document.querySelector(`[aria-label="${m.getAttribute('aria-label')}"]:not([role=menu])`);
    document.getElementById('mock-a-place')?.remove();
    if (m.classList.contains('tmenu') && opener) {
      const GAP = 4;
      const rect = opener.getBoundingClientRect();
      const height = m.getBoundingClientRect().height;
      let top = rect.bottom + GAP;
      if (top + height > window.innerHeight - 8 && rect.top - GAP - height > 8) top = rect.top - GAP - height;
      // a rule marked !important wins over the inline "top" RowMenu sets again on every resize
      const place = document.createElement('style');
      place.id = 'mock-a-place';
      place.textContent = `[role=menu].tmenu { top: ${top}px !important; }`;
      document.head.appendChild(place);
    }
  };
  draw();
  // React may drop the added items when it redraws the menu (the phone's sheet does): draw them again
  const watch = new MutationObserver(draw);
  watch.observe(document.body, { childList: true, subtree: true });
  undo.push(() => {
    watch.disconnect();
    document.querySelectorAll('[data-mock-a]').forEach((el) => el.remove());
    document.getElementById('mock-a-place')?.remove();
  });
  return document.querySelector('[data-mock-a]') ? `drawn ${mode} (${list.length} items)` : "open a row's ⋯ first";
})()
