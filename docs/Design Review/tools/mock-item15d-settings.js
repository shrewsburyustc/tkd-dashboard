// mock-item15d-settings.js — draws Design Review item 15d's "after" pictures ON TOP of the real preview pages,
// for pictures only: Classes and ranks moved out of Color Belt into Settings (the school-wide page in the account
// menu), with Color Belt keeping only its testing-only part as a "Prices" tab. This is Jeffrey's own plan from
// 2026-10-17 (Color Belt status file, "Planned, not decided"), drawn so it can be decided.
//   window.__mock15d = 'grab'      on Color Belt → Classes and ranks (Worcester): remembers the class list, the
//                                  Add class button and the map pin
//   window.__mock15d = 'hide'      on Settings: hides the schools' street addresses and phones (keeps them out of
//                                  the pictures)
//   window.__mock15d = 'settings'  on Settings: 'hide', then a second part, "Classes and ranks": its heading with
//                                  Add class, one gray line, and each school's classes under Schedule's school headings
//   window.__mock15d = 'tabs'      on Color Belt: the "Classes and ranks" tab reads "Prices"
//   window.__mock15d = 'clear'     removes the drawing
// It borrows the app's real classes (st-heading / st-sub from Settings, clist / cblock from Color Belt, sschool-head
// from Schedule, ttab from the tabs). It only hides the app's own parts and adds new ones (moving or removing
// React's parts crashes the page). Nothing in the app changes; a reload removes everything.
// Run:   node cdp.mjs eval "window.__mock15d = 'grab'; $(cat mock-item15d-settings.js)"
(() => {
  const mode = window.__mock15d;
  const MARK = 'item15d';
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
  const fromHtml = (html) => {
    const holder = document.createElement('div');
    holder.innerHTML = html;
    return holder.firstElementChild;
  };
  if (mode === 'clear') {
    clear();
    return 'cleared';
  }

  if (mode === 'grab') {
    const firstName = document.querySelector('main .cname');
    const list = firstName && firstName.closest('.clist');
    if (!list) return 'open Color Belt → Classes and ranks first';
    const add = [...document.querySelectorAll('main button')].find((b) => b.innerText.trim() === 'Add class');
    const pin = document.querySelector('button.loc-option.is-active svg');
    sessionStorage.setItem('__mock15d', JSON.stringify({ list: list.outerHTML, add: add ? add.outerHTML : '', pin: pin ? pin.outerHTML : '' }));
    return 'grabbed';
  }

  if (mode === 'hide' || mode === 'settings') {
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
    if (mode === 'hide') return 'addresses hidden';
    const saved = JSON.parse(sessionStorage.getItem('__mock15d') || 'null');
    if (!saved) return "run 'grab' on Color Belt → Classes and ranks first";
    const part = mock(document.createElement('div'));
    part.style.marginTop = 'var(--space-32)';
    const head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:var(--space-12);margin-bottom:var(--space-4)';
    const title = document.createElement('h2');
    title.className = 'st-heading';
    title.style.margin = '0';
    title.textContent = 'Classes and ranks';
    head.append(title);
    if (saved.add) {
      const add = fromHtml(saved.add);
      add.className = 'btn'; // a part's button is outline (the page's one blue button is for the page header)
      head.append(add);
    }
    const sub = document.createElement('p');
    sub.className = 'st-sub st-sub--section';
    sub.textContent = "Each school's classes and belt ranks. The Schedule, Calendar, Forms and Testing all use them.";
    part.append(head, sub);
    // Schedule's school heading: <div class="sschool-head"><h2 class="sschool-title">📍 Name</h2></div>
    const heading = (school) => {
      const box = document.createElement('div');
      box.className = 'sschool-head';
      box.style.margin = 'var(--space-12) 0 var(--space-8)';
      const h = document.createElement('h2');
      h.className = 'sschool-title';
      if (saved.pin) h.append(fromHtml(saved.pin));
      h.append(school);
      box.append(h);
      return box;
    };
    part.append(heading('Worcester'), fromHtml(saved.list), heading('Shrewsbury'));
    page.append(part);
    return 'settings drawn';
  }

  if (mode === 'tabs') {
    const tab = [...document.querySelectorAll('main [role=tab]')].find((t) => t.innerText.trim() === 'Classes and ranks');
    if (!tab) return 'open Color Belt first';
    clear();
    const copy = mock(tab.cloneNode(false));
    copy.removeAttribute('id');
    copy.textContent = 'Prices';
    hide(tab);
    tab.after(copy);
    return 'tabs drawn';
  }
  return "set window.__mock15d = 'grab', 'hide', 'settings', 'tabs' or 'clear'";
})()
