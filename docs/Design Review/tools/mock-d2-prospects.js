// mock-d2-prospects.js — draws end-review question D2's options ON TOP of a real Prospects panel while
// "Hide private details" is on, for pictures only. It copies Star's approved hidden look (v0.507, v0.514):
// a hidden value keeps its row and reads gray "Hidden on this tablet"; a button that would show a hidden
// detail turns gray (the approved "unavailable" look) with one gray line saying why — Star's
// "Email result is off while private details are hidden. Email results at the desk."
//   window.__mockD2 = 'B'       the email and the form answers: Email grayed + the line; every answer's
//                               value "Hidden on this tablet" (the questions and "Show signature" stay)
//   window.__mockD2 = 'C'       B + the phone: Call and Text grayed too, the Phone row hidden
//   window.__mockD2 = 'clear'   puts it back
// Open the form answers first (the "1 answer · waiver signed …" row) so they show in the picture.
// It changes only text inside the panel's own parts and their inline styles, and adds one gray line
// after the Call / Text / Email row (never moves or removes React's parts). A reload also removes it.
// Run:   node cdp.mjs eval "window.__mockD2 = 'B'; $(cat mock-d2-prospects.js)"
(() => {
  const mode = window.__mockD2;
  const undo = (window.__mockD2Undo = window.__mockD2Undo || []);
  while (undo.length) undo.pop()();
  if (mode === 'clear') return 'cleared';
  if (mode !== 'B' && mode !== 'C') return "set window.__mockD2 = 'B', 'C' or 'clear'";
  const panel = document.querySelector('.ppanel');
  if (!panel) return 'open a prospect first';
  const HIDDEN = 'Hidden on this tablet';
  const style = (el, css) => {
    const before = el.getAttribute('style');
    el.style.cssText += `;${css}`;
    undo.push(() => (before === null ? el.removeAttribute('style') : el.setAttribute('style', before)));
  };
  const text = (el, words) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.data.trim()) continue;
      const before = node.data;
      node.data = words;
      undo.push(() => { node.data = before; });
      return;
    }
  };
  // the approved gray "unavailable" look (testing.css .btn-primary.is-unavailable, detail 8)
  const gray = 'color:var(--color-disabled-text);border-color:var(--color-border-strong);background:var(--color-surface);cursor:default';
  const contact = panel.querySelector('.pcontact');
  const buttons = [...contact.querySelectorAll('a, button')];
  const byWord = (w) => buttons.find((b) => b.innerText.trim() === w);
  const off = mode === 'B' ? [byWord('Email')] : [byWord('Call'), byWord('Text'), byWord('Email')];
  for (const b of off) style(b, gray);
  // one gray line under the buttons, with the top bar's "private details hidden" icon (as Star's line)
  const line = document.createElement('p');
  line.style.cssText = 'display:flex;align-items:flex-start;gap:var(--space-8);margin:var(--space-8) 0 0;color:var(--color-text-secondary);font-size:var(--text-13);line-height:1.4';
  const chip = [...document.querySelectorAll('header button')].find((b) => /Private details hidden/.test(b.innerText));
  const icon = chip && chip.querySelector('svg');
  if (icon) {
    const copy = icon.cloneNode(true);
    copy.setAttribute('width', '16');
    copy.setAttribute('height', '16');
    copy.style.cssText = 'flex:none;margin-top:1px';
    line.appendChild(copy);
  }
  const words = document.createElement('span');
  words.textContent = mode === 'B'
    ? 'Email is off while private details are hidden. Email the family at the desk.'
    : 'Call, Text and Email are off while private details are hidden. Contact the family at the desk.';
  line.appendChild(words);
  contact.insertAdjacentElement('afterend', line);
  undo.push(() => line.remove());
  // every form answer's value reads "Hidden on this tablet" (the question stays, as Star's rows)
  for (const dd of panel.querySelectorAll('.panswer dd')) {
    text(dd, HIDDEN);
    style(dd, 'color:var(--color-text-secondary)');
  }
  if (mode === 'C') {
    const phone = [...panel.querySelectorAll('.pkv')].find((row) => row.querySelector('.pkv-k')?.innerText.trim() === 'Phone');
    const value = phone && phone.querySelector('.pkv-v');
    if (value) {
      text(value, HIDDEN);
      style(value, 'color:var(--color-text-secondary)');
    }
  }
  return `drawn ${mode}`;
})()
