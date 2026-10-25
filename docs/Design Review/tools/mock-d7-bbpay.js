// mock-d7-bbpay.js — draws end-review question D7's options ON TOP of the real screens, for pictures only.
// Black Belt payments can be recorded today, but Finance's Daily report doesn't read them yet (v0.808: it adds
// them "when Black Belt payments exist"), so a Black Belt payment is missing from that day's report and from
// Close the day. Two temporary fixes are drawn here (option A, "Finance's step before the form opens", has
// nothing to draw):
//   window.__mockD7 = 'B-dialog'    an amber note in Black Belt's open Record payment box
//   window.__mockD7 = 'B-finance'   the same note at the top of Finance's Daily report
//   window.__mockD7 = 'C'           on a cycle's Candidates: every Record payment grayed, one line saying why
//   window.__mockD7 = 'clear'       puts it back
// It changes only inline styles of the app's own parts and adds one note or line (never moves or removes
// React's parts). A reload also removes it.
// Run:   node cdp.mjs eval "window.__mockD7 = 'B-dialog'; $(cat mock-d7-bbpay.js)"
(() => {
  const mode = window.__mockD7;
  const undo = (window.__mockD7Undo = window.__mockD7Undo || []);
  while (undo.length) undo.pop()();
  if (mode === 'clear') return 'cleared';
  const style = (el, css) => {
    const before = el.getAttribute('style');
    el.style.cssText += `;${css}`;
    undo.push(() => (before === null ? el.removeAttribute('style') : el.setAttribute('style', before)));
  };
  // the app's amber note (components/Notice.jsx): <div class="notice"> + the alert triangle + the words
  const notice = (words) => {
    const box = document.createElement('div');
    box.className = 'notice';
    const icon = document.querySelector('svg.tabler-icon-alert-triangle');
    if (icon) {
      const copy = icon.cloneNode(true);
      copy.setAttribute('width', '16');
      copy.setAttribute('height', '16');
      copy.classList.add('notice-icon');
      box.appendChild(copy);
    }
    const span = document.createElement('span');
    span.textContent = words;
    box.appendChild(span);
    return box;
  };
  const add = (el, where, target) => {
    target.insertAdjacentElement(where, el);
    undo.push(() => el.remove());
  };
  if (mode === 'B-dialog') {
    const d = [...document.querySelectorAll('.dialog')].find((x) => /Record payment/.test(x.innerText) && x.getBoundingClientRect().height > 0);
    if (!d) return 'open a Record payment box first';
    const hint = [...d.querySelectorAll('p')].find((p) => /Counts as paid today/.test(p.innerText));
    const note = notice("This payment won't show in Finance's Daily report yet. Keep Black Belt money apart when you close the day.");
    note.style.marginTop = 'var(--space-12)';
    add(note, 'afterend', hint || d.querySelector('.dialog-actions').previousElementSibling);
    return 'drawn B-dialog';
  }
  if (mode === 'B-finance') {
    const cards = document.querySelector('.fin-cards');
    if (!cards) return 'open Finance (one school) first';
    const note = notice("Black Belt payments don't show in this report yet. Count Black Belt money separately when you close the day.");
    note.style.marginBottom = 'var(--space-12)';
    add(note, 'beforebegin', cards);
    return 'drawn B-finance';
  }
  if (mode === 'C') {
    const buttons = [...document.querySelectorAll('main button')].filter((b) => b.innerText.trim() === 'Record payment');
    if (!buttons.length) return 'open a cycle’s Candidates first';
    // the approved gray "unavailable" look
    for (const b of buttons) style(b, 'color:var(--color-disabled-text);border-color:var(--color-border-strong);background:var(--color-surface);cursor:default');
    const search = document.querySelector('main input[type=search], main input[placeholder^="Search"]');
    const anchor = search ? search.closest('label, div') : buttons[0].closest('[role=table], table, ul, div');
    const line = document.createElement('p');
    line.style.cssText = 'margin:0 0 var(--space-8);color:var(--color-text-secondary);font-size:var(--text-13)';
    line.textContent = "Record payment opens when Finance's Daily report can show Black Belt payments.";
    add(line, 'beforebegin', anchor);
    return `drawn C (${buttons.length} buttons)`;
  }
  return "set window.__mockD7 = 'B-dialog', 'B-finance', 'C' or 'clear'";
})()
