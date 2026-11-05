// mock-endtime.js — draws the "after" pictures for Star testing's End time (rulebook decision "A")
// ON TOP of the real preview page, for review pictures only. Nothing in the app or its data changes;
// a reload removes it.
// Modes (set window.__mockEnd before running):
//   'text'     every "6:00 PM" that is the Star testing day's time becomes "6:00 PM – 8:00 PM"
//              (inside window.__mockEndScope, a CSS selector; default: the whole page)
//   'grab'     keeps the markup of an amber error Notice in the open dialog and/or of an open time
//              list (the app's own markup, in sessionStorage) for 'dialog'
//   'dialog'   Add / Edit event: Testing date moves to its own row, then "Start time | End time" side
//              by side (stacked on phones, as the grid already does). window.__mockEndData =
//              { end: null | '5:00 PM', error: null | 'Choose an end time.' | 'End time must be after the start time.',
//                openList: false | true }  (openList: the End time list open, the times after 6:00 PM)
// Run:   node cdp.mjs eval "$(cat mock-endtime.js)"
(() => {
  const mode = window.__mockEnd;
  if (mode === 'text') {
    const root = document.querySelector(window.__mockEndScope || 'body');
    if (!root) return 'scope not found';
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const hits = [];
    let node;
    while ((node = walker.nextNode())) if (/6:00 PM(?![  ]–)/.test(node.textContent)) hits.push(node);
    hits.forEach((n) => {
      // No-break spaces keep "6:00 PM" and "8:00 PM" whole when the line wraps (a narrow phone
      // otherwise breaks "6:00" from "PM"); the line may only break after the dash.
      n.textContent = n.textContent.replace(/6:00 PM(?! –)/, '6:00 PM – 8:00 PM');
      n.parentElement.dataset.mockText = 'endtime';
    });
    return `replaced ${hits.length}`;
  }
  const dialog = [...document.querySelectorAll('[role=dialog]')].pop();
  if (mode === 'grab') {
    const notice = dialog?.querySelector('.notice');
    const openList = [...document.querySelectorAll('.fa-list')].find((l) => l.getBoundingClientRect().height);
    if (notice) sessionStorage.setItem('__mockEndNotice', notice.outerHTML);
    if (openList) sessionStorage.setItem('__mockEndList', openList.outerHTML);
    return `grabbed${notice ? ' notice' : ''}${openList ? ' list' : ''}`;
  }
  if (mode !== 'dialog') return 'set window.__mockEnd';
  const data = window.__mockEndData || {};
  if (!dialog) return 'open the dialog first';
  document.querySelectorAll('[data-mock=endtime]').forEach((e) => e.remove());
  const two = dialog.querySelector('.ev-two');
  const fields = [...two.querySelectorAll(':scope > .field')];
  const dateField = fields.find((f) => f.querySelector('.dp-field'));
  const startField = fields.find((f) => f.querySelector('.sel-field'));
  if (dateField) two.before(dateField); // Testing date on its own row
  const end = startField.cloneNode(true);
  end.dataset.mock = 'endtime';
  end.querySelectorAll('[id]').forEach((e) => e.removeAttribute('id'));
  end.querySelectorAll('.notice').forEach((e) => e.remove());
  end.querySelector('.field-label').textContent = 'End time';
  const box = end.querySelector('.sel-field');
  box.classList.remove('is-open');
  // The field's first words are its value.
  const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
  let t;
  while ((t = walker.nextNode())) if (t.textContent.trim()) { t.textContent = data.end || 'Choose a time'; break; }
  box.classList.toggle('is-empty', !data.end);
  if (data.error) {
    box.setAttribute('aria-invalid', 'true');
    const html = sessionStorage.getItem('__mockEndNotice');
    if (html) {
      const holder = document.createElement('div');
      holder.innerHTML = html;
      const n = holder.firstElementChild;
      n.removeAttribute('id');
      const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
      let s;
      while ((s = w.nextNode())) if (s.textContent.trim()) { s.textContent = data.error; break; }
      end.append(n);
    }
  } else box.removeAttribute('aria-invalid');
  two.append(end);
  const listHtml = sessionStorage.getItem('__mockEndList');
  if (data.openList && listHtml) {
    box.classList.add('is-open');
    const holder = document.createElement('div');
    holder.innerHTML = listHtml;
    const list = holder.firstElementChild;
    list.dataset.mock = 'endtime';
    list.removeAttribute('id');
    const options = [...list.querySelectorAll('[role=option]')];
    const plain = (options.find((o) => o.getAttribute('aria-selected') !== 'true') || {}).className || '';
    // Times after the 6:00 PM start, up to 10:00 PM; nothing chosen, so it opens at its first time.
    const times = [];
    for (let m = 18 * 60 + 5; m <= 22 * 60; m += 5) times.push(`${Math.floor(m / 60) - 12}:${String(m % 60).padStart(2, '0')} PM`);
    options.forEach((o, i) => {
      if (i < times.length) { o.textContent = times[i]; o.className = plain; o.setAttribute('aria-selected', 'false'); }
      else o.remove();
    });
    const r = box.getBoundingClientRect();
    Object.assign(list.style, { position: 'fixed', left: `${Math.round(r.x)}px`, top: `${Math.round(r.bottom + 4)}px`, width: `${Math.round(r.width)}px`, zIndex: 2000 });
    document.body.append(list);
    list.scrollTop = 0;
  }
  return 'drawn';
})()
