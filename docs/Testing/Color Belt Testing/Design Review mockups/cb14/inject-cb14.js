// inject-cb14.js — draws CB14 / M15's "after" ON TOP of the real preview pages, for the mockup only:
// Classes and ranks move into Settings (a second part after Schools), and Color Belt keeps a tab with
// only what is testing's own: the three prices, sparring gear and each class's final award (v1.023,
// walkthrough 15d picture 11). Nothing in the app changes; a reload removes everything.
// Built on docs/Design Review/tools/mock-item15d-settings.js (the approved 15d picture's drawing).
//   window.__cb14 = 'grab'      on Color Belt → Classes and ranks: remembers the class list (first class
//                               open) for this school and this size (PC table or phone rows)
//   window.__cb14 = 'settings'  on Settings: addresses hidden, then the "Classes and ranks" part with
//                               Add class, its gray line and each school's list (no prices; the last
//                               rank's final award points to the Prices tab)
//   window.__cb14 = 'staffA'    on Settings: what staff would see in option A (Classes and ranks only,
//                               the view-only line, no edit controls)
//   window.__cb14 = 'prices'    on Color Belt → Classes and ranks: the tab becomes the Prices tab
//                               (prices, sparring gear, final award per class; no reorder, no Add)
//   window.__cb14 = 'pricesStaff'  the same, as staff see it (view-only line, no edit controls)
//   window.__cb14 = 'clear'
// Run:   node cdp.mjs eval "window.__cb14 = 'grab'; $(cat inject-cb14.js)"
(() => {
  const mode = window.__cb14;
  const MARK = 'cb14';
  const hide = (el) => { if (!el) return; el.dataset.mockHide = MARK; el.style.display = 'none'; };
  const mock = (el) => { el.dataset.mock = MARK; return el; };
  const clear = () => {
    document.querySelectorAll(`[data-mock=${MARK}]`).forEach((e) => e.remove());
    document.querySelectorAll(`[data-mock-hide=${MARK}]`).forEach((e) => { e.style.display = ''; delete e.dataset.mockHide; });
  };
  const fromHtml = (html) => { const h = document.createElement('div'); h.innerHTML = html; return h.firstElementChild; };
  const phone = () => window.matchMedia('(max-width: 639.98px)').matches;
  const key = (school) => `__cb14:${school}:${phone() ? 'phone' : 'pc'}`;
  const school = () => (document.querySelector('button.loc-option.is-active')?.innerText || 'Worcester').trim();
  const VIEW_ONLY = 'View only. Ask an admin to make changes.';
  // A small dashed tag that says which question a part of the picture waits on.
  const qtag = (text) => {
    const t = mock(document.createElement('span'));
    t.textContent = text;
    t.style.cssText = 'display:inline-block;margin-left:8px;padding:1px 8px;border:1px dashed #B7791F;border-radius:999px;color:#8A5A00;background:#FFF8E6;font-size:12px;font-weight:400;vertical-align:middle;white-space:normal';
    return t;
  };
  const gray = (text) => {
    const s = document.createElement('span');
    s.textContent = text;
    s.style.cssText = 'color:var(--color-text-secondary);font-size:var(--text-12)';
    return s;
  };

  // Removes table columns by their heading (the PC and tablet tables have different columns), plus
  // the drag-handle column (grip) and / or the actions column (acts) when asked; the grid's column
  // widths lose the same entries.
  const dropCols = (list, labels, { grip = false, acts = false } = {}) => {
    list.querySelectorAll('[role=table]').forEach((table) => {
      const head = table.querySelector('.rhead');
      if (!head) return;
      const heads = [...head.children].map((c) => c.textContent.trim());
      const widths = (head.style.gridTemplateColumns.match(/minmax\([^)]*\)|\S+/g)) || [];
      const sample = table.querySelector('.rrow');
      const drop = new Set(heads.map((h, i) => (labels.includes(h) ? i : -1)).filter((i) => i >= 0));
      if (grip && sample?.children[0]?.querySelector('.grip')) drop.add(0);
      const last = heads.length - 1;
      if (acts && sample?.children[last]?.querySelector('.acts')) drop.add(last);
      const cols = widths.filter((_, i) => !drop.has(i)).join(' ');
      table.querySelectorAll('.rhead, .rrow').forEach((row) => {
        [...row.children].forEach((c, i) => { if (drop.has(i)) c.remove(); });
        row.style.gridTemplateColumns = cols;
      });
    });
  };

  // Settings: no prices and no sparring gear (they move to the Prices tab); the last rank's
  // "Testing for" (the final award) also lives in the Prices tab.
  const toSettings = (list, { edit }) => {
    // PC table: columns grip · Rank · Testing for · Early · Testing day · Private · Sparring gear · actions
    list.querySelectorAll('.rrow').forEach((row) => {
      const tag = [...row.querySelectorAll('*')].find((e) => e.children.length === 0 && e.textContent.trim() === 'Final award');
      if (tag) { const cell = tag.closest('.rcell'); cell.textContent = ''; cell.append(gray('Final award: set in the Prices tab')); }
    });
    dropCols(list, ['Early', 'Testing day', 'Private', 'Sparring gear'], { grip: !edit, acts: !edit });
    // Phone rows: line 2 holds the prices
    list.querySelectorAll('.prow').forEach((row) => {
      row.querySelector('.l2')?.remove();
      const tag = [...row.querySelectorAll('*')].find((e) => e.children.length === 0 && e.textContent.trim() === 'Final award');
      if (tag) {
        const names = row.querySelectorAll('.l1-names .belt-name');
        if (names[1]) names[1].remove();
        tag.remove();
        const l2 = document.createElement('div'); l2.className = 'l2'; l2.append(gray('Final award: set in the Prices tab'));
        row.querySelector('.prow-main').append(l2);
      }
    });
    if (!edit) {
      list.querySelectorAll('.acts, .grip, .prow-grip').forEach((e) => e.remove());
      list.querySelectorAll('button').forEach((b) => { if (b.innerText.trim() === 'Add rank') b.parentElement.remove(); });
    }
    return list;
  };

  // The Prices tab: no reordering (order belongs to Settings), no "Testing for" column, no Add;
  // each class line names its final award.
  const toPrices = (list, { edit }) => {
    list.querySelectorAll('.cline').forEach((line) => {
      line.querySelector('.grip')?.remove();
      const acts = line.querySelector('.acts');
      if (acts) { const btns = acts.querySelectorAll('button'); btns[1]?.remove(); if (!edit) acts.remove(); }
    });
    list.querySelectorAll('.cblock').forEach((block) => {
      // the final award = the last rank's "Testing for" (PC) or the last row's second belt (phone)
      const lastRow = [...block.querySelectorAll('.rrow, .prow')].pop();
      let award = null;
      if (lastRow) {
        const tf = lastRow.classList.contains('rrow') ? lastRow.children[2] : lastRow.querySelectorAll('.l1-names .belt-name')[1];
        if (tf) { award = tf.cloneNode(true); [...award.querySelectorAll('*')].forEach((e) => { if (e.children.length === 0 && e.textContent.trim() === 'Final award') e.remove(); }); award.innerHTML = award.innerHTML.replace('→ ', ''); }
      }
      const count = block.querySelector('.ccount');
      if (count && award) {
        const s = document.createElement('span');
        s.className = 'ccount';
        s.style.cssText = 'display:inline-flex;align-items:center;gap:4px;margin-left:8px';
        s.append('· Final award ');
        award.style.display = 'inline-flex'; award.style.alignItems = 'center'; award.style.gap = '4px';
        s.append(award);
        count.after(s);
      }
    });
    list.querySelectorAll('.rrow .acts').forEach((acts) => { acts.querySelectorAll('button')[1]?.remove(); });
    dropCols(list, ['Testing for'], { grip: true, acts: !edit });
    list.querySelectorAll('.prow').forEach((row) => {
      row.querySelector('.prow-grip')?.remove();
      const names = row.querySelectorAll('.l1-names .belt-name');
      if (names[1]) names[1].remove();
      [...row.querySelectorAll('*')].forEach((e) => { if (e.children.length === 0 && e.textContent.trim() === 'Final award') e.remove(); });
      const acts = row.querySelector('.acts');
      if (acts) { const btns = acts.querySelectorAll('button'); btns[1]?.remove(); if (!edit) acts.remove(); }
      row.style.paddingLeft = '16px';
    });
    list.querySelectorAll('button').forEach((b) => { if (b.innerText.trim() === 'Add rank') b.parentElement.remove(); });
    return list;
  };

  if (mode === 'clear') { clear(); return 'cleared'; }

  if (mode === 'grab') {
    clear(); // never grab a drawing left from an earlier step
    const first = document.querySelector('main .cname');
    const list = first && first.closest('.clist');
    if (!list) return 'open Color Belt → Classes and ranks first';
    const add = [...document.querySelectorAll('main button')].find((b) => b.innerText.trim() === 'Add class');
    const pin = document.querySelector('button.loc-option.is-active svg');
    sessionStorage.setItem(key(school()), JSON.stringify({ list: list.outerHTML, add: add ? add.outerHTML : '', pin: pin ? pin.outerHTML : '' }));
    return `grabbed ${school()} ${phone() ? 'phone' : 'pc'}`;
  }

  if (mode === 'settings' || mode === 'staffA') {
    const page = document.querySelector('main .settings');
    if (!page) return 'open Settings first';
    clear();
    for (const details of page.querySelectorAll('.st-details')) {
      const note = mock(document.createElement('span'));
      note.className = 'st-details';
      note.style.color = 'var(--color-text-secondary)';
      note.textContent = 'Address and phone (hidden in this picture)';
      hide(details);
      details.after(note);
    }
    const w = JSON.parse(sessionStorage.getItem(key('Worcester')) || 'null');
    const s = JSON.parse(sessionStorage.getItem(key('Shrewsbury')) || 'null');
    if (!w) return "run 'grab' on Worcester's Classes and ranks first (this size)";
    const edit = mode === 'settings';
    const part = mock(document.createElement('div'));
    part.className = 'cb14-part';
    part.style.marginTop = 'var(--space-32)';
    const head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:var(--space-12);margin-bottom:var(--space-4);flex-wrap:wrap';
    const title = document.createElement('h2');
    title.className = 'st-heading';
    title.style.margin = '0';
    title.textContent = 'Classes and ranks';
    head.append(title);
    if (edit && w.add) { const add = fromHtml(w.add); add.className = 'btn'; head.append(add); }
    const sub = document.createElement('p');
    sub.className = 'st-sub st-sub--section';
    sub.textContent = edit
      ? "Each school's classes and belt ranks. The Schedule, Calendar, Forms and Testing all use them. Testing prices are in Color belt testing."
      : VIEW_ONLY;
    part.append(head, sub);
    const heading = (name, saved, first) => {
      const box = document.createElement('div');
      box.className = 'sschool-head';
      box.style.margin = 'var(--space-12) 0 var(--space-8)';
      const h = document.createElement('h2');
      h.className = 'sschool-title';
      if (saved?.pin) h.append(fromHtml(saved.pin));
      h.append(name);
      if (first) h.append(qtag('layout of the two schools: question 3, later'));
      box.append(h);
      return box;
    };
    part.append(heading('Worcester', w, true), toSettings(fromHtml(w.list), { edit }));
    if (s) {
      const sl = toSettings(fromHtml(s.list), { edit });
      // Shrewsbury shown closed, to keep the picture short
      sl.querySelectorAll('[role=table]').forEach((t) => t.remove());
      sl.querySelectorAll('.ctoggle').forEach((t) => {
        t.setAttribute('aria-expanded', 'false');
        t.querySelectorAll('path').forEach((p) => { if (p.getAttribute('d') === 'M6 15l6 -6l6 6') p.setAttribute('d', 'M6 9l6 6l6 -6'); });
      });
      sl.querySelectorAll('button').forEach((b) => { if (b.innerText.trim() === 'Add rank') b.parentElement.remove(); });
      part.append(heading('Shrewsbury', s, false), sl);
    }
    if (mode === 'staffA') {
      // staff: Settings shows only this part (Schools stays admins only)
      // (Schools and the "Admins only." line are hidden; the title stays)
      [...page.children].forEach((c) => { if (c !== part && !c.classList.contains('phead')) hide(c); });
      const top = page.querySelector('.phead');
      if (top) { const p = mock(document.createElement('p')); p.className = 'st-sub'; p.textContent = 'Details for the whole school.'; top.after(p); }
    }
    page.append(part);
    return mode + ' drawn';
  }

  if (mode === 'prices' || mode === 'pricesStaff') {
    clear(); // never copy a drawing left from an earlier step
    const tab = [...document.querySelectorAll('main [role=tab]')].find((t) => t.innerText.trim() === 'Classes and ranks');
    const first = document.querySelector('main .cname');
    const list = first && first.closest('.clist');
    if (!tab || !list) return 'open Color Belt → Classes and ranks first';
    clear();
    const copy = mock(tab.cloneNode(false));
    copy.removeAttribute('id');
    copy.textContent = 'Prices';
    hide(tab);
    tab.after(copy);
    const add = [...document.querySelectorAll('main button')].find((b) => b.innerText.trim() === 'Add class');
    hide(add);
    const edit = mode === 'prices';
    const drawn = mock(toPrices(list.cloneNode(true), { edit }));
    hide(list);
    // the line above the list (staff: the view-only line; admins: where order and names are changed)
    document.querySelectorAll('main .tview, main .view-only, main .cr-viewonly').forEach(hide);
    const line = mock(document.createElement('p'));
    line.className = 'st-sub';
    line.style.cssText = 'margin:0 0 var(--space-12);color:var(--color-text-secondary);font-size:var(--text-14)';
    line.textContent = edit
      ? "Each event copies these prices when it's made. Classes, ranks and their order are in Settings → Classes and ranks."
      : VIEW_ONLY;
    line.append(qtag('name: question 4, later'));
    list.before(line, drawn);
    return mode + ' drawn';
  }
  return "set window.__cb14 = 'grab', 'settings', 'staffA', 'prices', 'pricesStaff' or 'clear'";
})()
