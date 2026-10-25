// mock-item15c-both.js — draws Design Review item 15c's "after" pictures ON TOP of the real preview page, for
// pictures only: what Color Belt could show when the top bar is on "Both", instead of today's
// "Choose a school" page. Two ideas, each copied from a section that already does it:
//   window.__mock15c = 'list'   on Color Belt's Events tab with WORCESTER selected: Schedule's way — the top bar
//                               shows "Both", the school line says "Both schools", and each school's events sit
//                               under Schedule's school heading ("📍 Worcester", then "📍 Shrewsbury" with Color
//                               Belt's empty-list line). Also remembers the first event for 'boxes'.
//   window.__mock15c = 'boxes'  then, on Color Belt with BOTH selected (today's block): Finance's way (v0.198) —
//                               one box per school with its upcoming testing and "Open <school>", nothing to change
//                               on Both. Open Finance on Both once first (same tab, no reload) so its styles are loaded.
//   window.__mock15c = 'clear'  removes the drawing (do this before clicking anything in the app)
// It borrows the app's real classes (sschool-head / sschool-title from Schedule, fin-both / fin-box from Finance,
// tempty ev-empty and ttag from Color Belt) so it looks exactly like those pages. It only hides the app's own
// parts and adds new ones (moving or removing React's parts crashes the page). A reload removes everything.
// Run:   node cdp.mjs eval "window.__mock15c = 'list'; $(cat mock-item15c-both.js)"
(() => {
  const mode = window.__mock15c;
  const MARK = 'item15c';
  const hide = (el) => {
    el.dataset.mockHide = MARK;
    el.style.display = 'none';
  };
  const mock = (el) => {
    el.dataset.mock = MARK;
    return el;
  };
  const clear = () => {
    document.querySelectorAll(`[data-mock=${MARK}]`).forEach((e) => e.remove());
    document.querySelectorAll(`[data-mock-hide=${MARK}]`).forEach((e) => {
      e.style.display = '';
      delete e.dataset.mockHide;
    });
  };
  if (mode === 'clear') {
    clear();
    return 'cleared (the top bar may still show the wrong school as selected until you click one)';
  }
  const options = [...document.querySelectorAll('button.loc-option')];
  const bothButton = options.find((b) => b.innerText.trim() === 'Both');

  if (mode === 'list') {
    const list = document.querySelector('main .ev-list');
    const firstRow = list && list.querySelector('.ev-row:not(.ev-head)'); // the first event, not the column names
    if (!firstRow) return 'open Color Belt events with Worcester selected';
    clear();
    const cells = [...firstRow.querySelectorAll('[role=cell]')];
    const schoolLine = [...document.querySelectorAll('main p, main div')].find((e) => e.children.length === 0 && e.textContent.trim() === 'Worcester');
    sessionStorage.setItem('__mock15c', JSON.stringify({
      name: cells[0]?.textContent.trim(),
      date: cells[1]?.textContent.trim(),
      students: cells[2]?.textContent.trim(),
      tag: cells[3]?.querySelector('.ttag')?.outerHTML ?? '',
      line: schoolLine ? schoolLine.outerHTML : '<p>Worcester</p>',
    }));
    // the top bar: "Both" looks selected (a copy of the map pin, made before the real one is hidden)
    const realPin = options.map((b) => b.querySelector('svg')).find(Boolean);
    const pin = realPin ? realPin.cloneNode(true) : null;
    for (const b of options) {
      const both = b === bothButton;
      b.classList.toggle('is-active', both);
      if (!both && b.querySelector('svg')) hide(b.querySelector('svg'));
      if (both && pin) b.prepend(mock(pin.cloneNode(true)));
    }
    if (schoolLine) {
      const line = mock(schoolLine.cloneNode(false)); // copied before hiding, so the copy shows
      line.textContent = 'Both schools';
      hide(schoolLine);
      schoolLine.after(line);
    }
    // Schedule's school heading: <div class="sschool-head"><h2 class="sschool-title">📍 Name</h2></div>
    const heading = (school) => {
      const head = mock(document.createElement('div'));
      head.className = 'sschool-head';
      const title = document.createElement('h2');
      title.className = 'sschool-title';
      if (pin) title.append(pin.cloneNode(true));
      title.append(school);
      head.append(title);
      return head;
    };
    list.before(heading('Worcester'));
    // the second school: the same divider Schedule puts between two schools, then Color Belt's empty-list line
    const second = mock(document.createElement('section'));
    second.style.cssText = 'margin-top:var(--space-24);padding-top:var(--space-16);border-top:1px solid var(--color-border)';
    second.append(heading('Shrewsbury'));
    const empty = document.createElement('p');
    empty.className = 'tempty ev-empty';
    empty.textContent = 'No color belt testing events yet.';
    second.append(empty);
    list.after(second);
    return 'list drawn';
  }

  if (mode === 'boxes') {
    const blocked = document.querySelector('main .blocked');
    if (!blocked) return 'open Color Belt with Both selected (the "Choose a school" page)';
    const saved = JSON.parse(sessionStorage.getItem('__mock15c') || 'null');
    if (!saved) return "run 'list' first (it remembers the event)";
    if (!document.querySelector('style, link') || ![...document.styleSheets].some((s) => { try { return [...s.cssRules].some((r) => r.selectorText === '.fin-both'); } catch { return false; } })) {
      return 'open Finance on Both first (same tab, no reload) so its box styles are loaded';
    }
    clear();
    const pin = blocked.querySelector('svg');
    const chevron = [...document.querySelectorAll('main .ev-back svg')].pop(); // the Black Belt link's ">" (ti-chevron-right)
    hide(blocked);
    const title = document.querySelector('main h1.ptitle');
    const holder = document.createElement('div');
    holder.innerHTML = saved.line;
    const line = mock(holder.firstElementChild);
    line.textContent = 'Both schools';
    title.after(line);
    // Finance's Both boxes (BothSummary.jsx): one per school, in switcher order
    const boxes = mock(document.createElement('div'));
    boxes.className = 'fin-both';
    const box = (school, events) => {
      const section = document.createElement('section');
      section.className = 'fin-box fin-both-box';
      const h2 = document.createElement('h2');
      h2.className = 'fin-box-title';
      if (pin) {
        const icon = pin.cloneNode(true);
        icon.setAttribute('class', `${icon.getAttribute('class') || ''} fin-box-icon`);
        h2.append(icon);
      }
      h2.append(school);
      section.append(h2);
      if (events.length === 0) {
        const none = document.createElement('p');
        none.className = 'fin-both-line fin-hint';
        none.textContent = 'No upcoming events.';
        section.append(none);
      }
      for (const ev of events) {
        const name = document.createElement('p');
        name.style.cssText = 'margin:var(--space-8) 0 0;font-size:var(--text-16);font-weight:500';
        name.textContent = ev.name;
        const facts = document.createElement('p');
        facts.className = 'fin-both-line';
        facts.innerHTML = `${ev.date} · ${ev.students} students &nbsp;${ev.tag}`;
        section.append(name, facts);
      }
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'btn';
      open.append(`Open ${school}`);
      if (chevron) open.append(chevron.cloneNode(true));
      section.append(open);
      return section;
    };
    boxes.append(box('Worcester', [saved]), box('Shrewsbury', []));
    const hint = document.createElement('p');
    hint.className = 'fin-hint';
    hint.style.marginTop = 'var(--space-12)';
    hint.textContent = "Each school's testing is kept separate. Open a school to see all its events, students and payments.";
    const after = mock(document.createElement('div'));
    after.append(boxes, hint);
    document.querySelector('main .phead').after(after);
    return 'boxes drawn';
  }
  return "set window.__mock15c = 'list', 'boxes' or 'clear'";
})()
