// mock-stepA.js — draws the "After" pictures for Star's rolling-check Step A (R4-10, R4-08, R2-08)
// ON TOP of the real preview page, for review pictures only. Nothing in the app or its data changes;
// a reload removes it. Why: Jeffrey OKs each screen change from a picture before any code is written.
// Modes (set window.__mockA before running):
//   'icons'   the open ⋯ menu: "Change private day or time" gets ti-calendar (IconCalendar) and
//             "Back to the testing day" gets ti-calendar-event (IconCalendarEvent). The icon drawings
//             are copied from @tabler/icons-react 3.48 (the version the app uses).
//   'email'   Results: the grayed Email result buttons get --color-border-strong and cursor:
//             not-allowed, and aria-describedby pointing at the "Email result is off …" line.
//   'grab'    keeps the app's own Undo button markup from a toast that has one (sessionStorage)
//   'freeze'  copies the toast on screen into a still copy, so it doesn't leave after 5 seconds
//   'undo'    gives the still toast the Undo button grabbed above (the toast--action layout)
//   'pickerUndo'  make-up option (b): Drew Park's picker row says "Added" with an Undo button
//   'rects'   window.__mockSel (CSS selector) → boxes in screen pixels (not page pixels)
// Run:   node cdp.mjs eval "<this file's text>"
(() => {
  const mode = window.__mockA;
  const NS = 'http://www.w3.org/2000/svg';
  const ICONS = {
    calendar: ['M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12', 'M16 3v4', 'M8 3v4', 'M4 11h16', 'M11 15h1', 'M12 15v3'],
    calendarEvent: ['M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12', 'M16 3l0 4', 'M8 3l0 4', 'M4 11l16 0', 'M8 15h2v2h-2l0 -2'],
  };
  if (mode === 'rects') {
    return [...document.querySelectorAll(window.__mockSel)].map((el) => {
      const r = el.getBoundingClientRect();
      return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
    }).filter((b) => b[2] > 0);
  }
  if (mode === 'icons') {
    const items = [...document.querySelectorAll('[role=menuitem]')];
    const swap = (startsWith, icon) => {
      const item = items.find((i) => i.textContent.trim().startsWith(startsWith));
      const svg = item?.querySelector('svg');
      if (!svg) return 0;
      // Keep the app's own <svg> (its size, stroke and class); only the drawing inside changes.
      svg.replaceChildren(...ICONS[icon].map((d) => {
        const p = document.createElementNS(NS, 'path');
        p.setAttribute('d', d);
        return p;
      }));
      svg.setAttribute('class', svg.getAttribute('class').replace(/tabler-icon-[\w-]+/, `tabler-icon-${icon === 'calendar' ? 'calendar' : 'calendar-event'}`));
      item.dataset.mockA = 'icon';
      return 1;
    };
    return `swapped ${swap('Change private day or time', 'calendar') + swap('Back to the testing day', 'calendarEvent')}`;
  }
  if (mode === 'email') {
    const line = document.querySelector('.str-hidden-line');
    if (line) line.id = 'str-email-off';
    const btns = [...document.querySelectorAll('.str-email[aria-disabled=true]')];
    btns.forEach((b) => {
      b.style.borderColor = 'var(--color-border-strong)';
      b.style.cursor = 'not-allowed';
      if (line) b.setAttribute('aria-describedby', 'str-email-off');
    });
    const b = btns[0];
    return `${btns.length} buttons; border ${b && getComputedStyle(b).borderTopColor}; line ${line ? 'found' : 'missing'}`;
  }
  if (mode === 'grab') {
    const undo = document.querySelector('.toast .toast-undo');
    if (!undo) return 'no Undo toast on screen';
    sessionStorage.setItem('__mockAUndo', undo.outerHTML);
    return 'grabbed';
  }
  if (mode === 'freeze') {
    document.querySelectorAll('[data-mock-a=toast]').forEach((e) => e.remove());
    const toast = [...document.querySelectorAll('.toast-region .toast')].find((t) => !t.dataset.mockA);
    if (!toast) return 'no toast on screen';
    const copy = toast.cloneNode(true);
    copy.dataset.mockA = 'toast';
    copy.style.animation = 'none';
    toast.after(copy);
    toast.style.display = 'none';
    return `frozen: ${copy.textContent}`;
  }
  if (mode === 'undo') {
    const copy = document.querySelector('[data-mock-a=toast]');
    const html = sessionStorage.getItem('__mockAUndo');
    if (!copy || !html) return 'freeze a toast and grab an Undo first';
    copy.querySelectorAll('.toast-undo').forEach((e) => e.remove());
    copy.classList.add('toast--action');
    const holder = document.createElement('div');
    holder.innerHTML = html;
    copy.append(holder.firstElementChild);
    return `undo added: ${copy.textContent}`;
  }
  if (mode === 'pickerUndo') {
    // Option (b): the picker stays open and Undo sits in the row itself — "Added" plus a small
    // Undo button (the row's own Add button, with Undo's icon and word) where "Already added" is.
    const d = document.querySelector('[role=dialog]');
    const row = [...(d?.querySelectorAll('.st-mk-row') || [])].find((r) => r.textContent.startsWith(window.__mockName || 'Drew Park'));
    const add = [...(d?.querySelectorAll('.st-mk-row button') || [])].find((b) => /^Add /.test(b.getAttribute('aria-label') || ''));
    const undoHtml = sessionStorage.getItem('__mockAUndo');
    if (!row || !add || !undoHtml) return 'open the picker after an Add, and grab an Undo first';
    const state = row.querySelector('.st-mk-state');
    state.textContent = 'Added';
    const btn = add.cloneNode(true);
    const holder = document.createElement('div');
    holder.innerHTML = undoHtml;
    btn.querySelector('svg').replaceWith(holder.querySelector('svg'));
    btn.lastChild.textContent = 'Undo';
    btn.setAttribute('aria-label', `Undo adding ${window.__mockName || 'Drew Park'}`);
    const act = row.querySelector('.st-mk-act');
    Object.assign(act.style, { display: 'flex', alignItems: 'center', gap: '8px' });
    act.append(btn);
    row.dataset.mockA = 'pickerUndo';
    return 'picker undo drawn';
  }
  return 'set window.__mockA';
})()
