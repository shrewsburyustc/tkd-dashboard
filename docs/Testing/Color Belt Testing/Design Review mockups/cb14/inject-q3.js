// inject-q3.js — CB14 sheet 3 (Question 3 of 4): how the two schools show in Settings → Classes and
// ranks, a page that ignores the top bar's school. For the mockup only: it changes the part that
// inject-cb14.js ('settings' mode) has just drawn on the real Settings page. Nothing in the app
// changes; a reload removes everything.
//   window.__q3 = 'A'             one school under the other: a "Worcester" heading with its own Add
//                                 class, its classes, then "Shrewsbury" the same way
//   window.__q3 = 'B:Worcester'   a school switch inside the part (the shared ChoiceGroup's segmented
//   window.__q3 = 'B:Shrewsbury'  look, same markup: .segmented.ev-segmented, role=radiogroup,
//                                 .segment.is-checked); only the chosen school's classes show
//                                 (B:Shrewsbury expects steps/q3-swap.js before inject-cb14.js, so
//                                 the drawn list is Shrewsbury's, first class open)
//   window.__q3 = 'B:empty'       the switch on Shrewsbury when that school has no classes yet
//   window.__q3 = 'C'             follows the top bar (as today): no switch, the part names the school
//                                 and says to change it in the top bar
// Run after: window.__cb14 = 'settings'; inject-cb14.js
(() => {
  const mode = window.__q3 || '';
  document.activeElement?.blur?.(); // no focus ring left on the account button in the picture
  const part = document.querySelector('.cb14-part');
  if (!part) return 'run inject-cb14.js (settings) first';
  const head = part.children[0];
  const sub = part.children[1];
  const add = head.querySelector('button');
  const heads = [...part.querySelectorAll('.sschool-head')];
  const lists = [...part.querySelectorAll('.clist')];
  part.querySelectorAll('[data-mock=cb14]').forEach((t) => { if (t.tagName === 'SPAN') t.remove(); }); // sheet 1's "question 3, later" tag
  const gray = (text) => {
    const s = document.createElement('span');
    s.textContent = text;
    s.style.cssText = 'color:var(--color-text-secondary);font-size:var(--text-14);font-weight:400';
    return s;
  };
  const USES = 'The Schedule, Calendar, Forms and Testing all use them. Testing prices are in Color belt testing.';

  if (mode === 'A') {
    // each school's heading gets its own Add class (it adds a class to that school)
    add?.remove();
    sub.textContent = `Each school's classes and belt ranks, one school under the other. ${USES}`;
    heads.forEach((h, i) => {
      h.style.cssText += ';display:flex;align-items:center;justify-content:space-between;gap:var(--space-12);flex-wrap:wrap';
      h.style.marginTop = i === 0 ? 'var(--space-16)' : 'var(--space-24)';
      const b = add.cloneNode(true);
      b.className = 'btn';
      h.append(b);
    });
    return 'A drawn';
  }

  if (mode.startsWith('B')) {
    const school = mode === 'B:Worcester' ? 'Worcester' : 'Shrewsbury';
    // only one list: the first (Worcester's, or Shrewsbury's after q3-swap.js); no school headings
    heads.forEach((h) => h.remove());
    lists.slice(1).forEach((l) => l.remove());
    if (mode === 'B:empty') {
      lists[0].remove();
    }
    sub.textContent = `Each school's classes and belt ranks. ${USES}`;
    // the switch row: the shared ChoiceGroup (segmented) on the left, Add class on the right
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:var(--space-12);flex-wrap:wrap;margin:var(--space-12) 0 var(--space-12)';
    const label = document.createElement('span');
    label.id = 'q3-school-label';
    label.className = 'visually-hidden';
    label.textContent = 'School';
    const group = document.createElement('div');
    group.className = 'segmented ev-segmented';
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-labelledby', 'q3-school-label');
    for (const name of ['Worcester', 'Shrewsbury']) {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      const on = name === school;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
      b.className = `segment${on ? ' is-checked' : ''}`;
      b.textContent = name;
      group.append(b);
    }
    const left = document.createElement('div');
    left.append(label, group);
    add.remove();
    add.className = 'btn';
    row.append(left, add);
    sub.after(row);
    if (mode === 'B:empty') {
      const p = document.createElement('p');
      p.className = 'tempty';
      p.textContent = `No classes yet at ${school}.`;
      row.after(p);
    }
    return mode + ' drawn';
  }

  if (mode === 'C') {
    // only the top bar's school; the heading names it and says where to change it
    heads.slice(1).forEach((h) => h.remove());
    lists.slice(1).forEach((l) => l.remove());
    sub.textContent = `Each school's classes and belt ranks. ${USES}`;
    const h = heads[0].querySelector('.sschool-title');
    // keep the pin icon, change the words
    [...h.childNodes].forEach((n) => { if (n.nodeType === 3) n.remove(); });
    h.append("Worcester's classes");
    heads[0].style.cssText += ';display:flex;align-items:baseline;justify-content:flex-start;gap:var(--space-8);flex-wrap:wrap';
    heads[0].append(gray('— change school in the top bar'));
    return 'C drawn';
  }
  return "set window.__q3 = 'A', 'B:Worcester', 'B:Shrewsbury', 'B:empty' or 'C'";
})()
