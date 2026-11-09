// mock-cards.js — draws the "After" pictures for Star's rolling-check Step B, the count cards
// (B3: R5-05, R3-02, S-1 cards part, C-05 (b); B4: M-03 Print receipt on a withdrawn row)
// ON TOP of the real preview page, for review pictures only. Nothing in the app or its data changes;
// a reload removes it. Why: Jeffrey OKs each screen change from a picture before any code is written.
// Modes (set window.__mockB before running; parameters in window.__mockP):
//   'rects'    window.__mockSel (CSS selector) -> boxes in screen pixels (for the amber/green outlines)
//   'cards'    the Candidates tab's count cards as Step B draws them. __mockP = { schools: ['Worcester 6',
//              'Shrewsbury 5'] (S-1: Worcester first), paid, notPaid (numbers after R3-02),
//              payments ('$930', R5-05: the removed candidate's $140 counts again),
//              payNote ('includes $140 from removed candidates', R5-05), dupLine (R3-02's one gray line),
//              dupRows ('noMarkPaid' = the flagged rows lose Mark paid; 'hide' = they leave a card's list) }
//   'empty'    __mockP.text = the words in the empty roster line (C-05 (b))
//   'harvest'  with an ACTIVE paid row's menu open: keeps the app's own Print receipt item in sessionStorage
//   'menuAdmin' with a withdrawn row's menu open: Print receipt · line · Restore · line · Delete permanently
//   'menuStaff' with a withdrawn row's menu open: only Print receipt (what a staff member's menu holds)
//              (a staff member's menu can't be opened in the app today, so the admin's menu is trimmed)
//   'dots'     staff role: puts the app's own ⋯ button (cloned from another row) where a withdrawn row
//              with money has only a blank spacer today. __mockP.names = ['Noah Chen']
// Run:   node cdp.mjs eval "<this file's text>"
(() => {
  const mode = window.__mockB;
  const P = window.__mockP || {};
  const KEY = '__mockBPrint';
  if (mode === 'rects') {
    return [...document.querySelectorAll(window.__mockSel)].map((el) => {
      const r = el.getBoundingClientRect();
      return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
    }).filter((b) => b[2] > 0);
  }
  if (mode === 'cards') {
    const cards = [...document.querySelectorAll('.ev-cards .ev-card')];
    if (cards.length < 4) return `only ${cards.length} cards`;
    const noteOf = (card, lines) => {
      card.querySelectorAll('.ev-card-note').forEach((n) => n.remove());
      lines.forEach((t) => {
        const s = document.createElement('span');
        s.className = 'ev-card-note';
        s.textContent = t;
        card.append(s);
      });
    };
    if (P.schools) noteOf(cards[0], P.schools);
    if (P.paid !== undefined) cards[1].querySelector('.ev-card-value').textContent = P.paid;
    if (P.notPaid !== undefined) cards[2].querySelector('.ev-card-value').textContent = P.notPaid;
    if (P.payments) cards[3].querySelector('.ev-card-value').textContent = P.payments;
    if (P.payNote) noteOf(cards[3], [P.payNote]);
    document.querySelectorAll('[data-mock-b=dup]').forEach((n) => n.remove());
    if (P.dupLine) {
      const p = document.createElement('p');
      p.className = 'cards-note';
      p.dataset.mockB = 'dup';
      p.textContent = P.dupLine;
      document.querySelector('.ev-cards').after(p);
    }
    // R3-02: a possible-duplicate row offers no Mark paid; with Not paid / Paid on, it isn't listed at all.
    const dupRows = [...document.querySelectorAll('.st-crow-c')].filter((r) => /Possible duplicate/.test(r.textContent));
    if (P.dupRows === 'noMarkPaid') {
      dupRows.forEach((r) => r.querySelectorAll('button').forEach((b) => { if (/^Mark paid/.test(b.getAttribute('aria-label') || b.textContent)) b.remove(); }));
    }
    if (P.dupRows === 'hide') dupRows.forEach((r) => { r.style.display = 'none'; });
    return 'cards drawn';
  }
  if (mode === 'empty') {
    const cell = document.querySelector('.tempty [role=cell]');
    if (!cell) return 'no empty line on screen';
    cell.textContent = P.text;
    return `empty line: ${cell.textContent}`;
  }
  if (mode === 'harvest') {
    const item = [...document.querySelectorAll('.tmenu-item')].find((i) => i.textContent.trim() === 'Print receipt');
    if (!item) return 'open an active paid row menu first';
    sessionStorage.setItem(KEY, item.outerHTML);
    return 'print item kept';
  }
  if (mode === 'menuAdmin' || mode === 'menuStaff') {
    // PC / tablet: .tmenu; phone: the bottom sheet's [role=menu] (it also ends with a line and Cancel).
    const menu = document.querySelector('.tmenu') || document.querySelector('[role=menu]');
    const html = sessionStorage.getItem(KEY);
    if (!menu || !html) return 'open a withdrawn row menu, and harvest first';
    const holder = document.createElement('div');
    holder.innerHTML = html;
    const print = holder.firstElementChild;
    // the item groups: [Restore] and [line + Delete permanently]; not the sheet's own line and Cancel
    const groups = [...menu.children].filter((el) => el.tagName === 'DIV' && !el.matches('[role=separator]'));
    const first = document.createElement('div');
    first.append(print);
    if (mode === 'menuStaff') {
      groups.forEach((g) => g.remove());
      menu.prepend(first);
      print.focus();
      return 'staff menu: Print receipt only';
    }
    menu.prepend(first);
    const sep = document.createElement('div');
    sep.setAttribute('role', 'separator');
    sep.className = 'menu-separator';
    groups[0].prepend(sep); // line between Print receipt and Restore
    print.focus(); // the app puts the keyboard focus on a menu's first item
    return 'admin menu: Print receipt, Restore, Delete permanently';
  }
  if (mode === 'dots') {
    const donor = document.querySelector('button[aria-label^="More actions for"]');
    if (!donor) return 'no ⋯ button to copy';
    let n = 0;
    (P.names || []).forEach((name) => {
      const row = [...document.querySelectorAll('.st-crow-c')].find((r) => r.getAttribute('aria-label') === name && r.classList.contains('is-removed'));
      const spacer = row?.querySelector('.ev-more-spacer');
      if (!spacer) return;
      const b = donor.cloneNode(true);
      b.setAttribute('aria-label', `More actions for ${name}`);
      b.setAttribute('aria-expanded', 'false');
      spacer.replaceWith(b);
      n += 1;
    });
    return `${n} ⋯ drawn`;
  }
  return 'set window.__mockB';
})()
