// mock-item09b-history.js — draws Design Review item 9b's "after" picture ON TOP of the real preview page,
// for a picture only: Prospects' one-line "History · N changes" (a tap opens the list: what changed, then
// when · who) added at the bottom of another section's summary.
//   1. On a prospect's panel with its History open, run with window.__mock9b = 'grab'
//      → the app's own History line and list markup are kept in sessionStorage.
//   2. Open a person's summary in another section, then run with window.__mock9b = 'draw' and
//      window.__mock9bData = { label: 'History · 3 changes', expanded: true, entries: [[what, 'Oct 22 · Jeffrey Berg'], …] }
// It goes just above the summary's buttons. Nothing in the app changes; closing the summary removes it.
// Run:   node cdp.mjs eval "$(cat mock-item09b-history.js)"
(() => {
  if (window.__mock9b === 'grab') {
    const btn = document.querySelector('button.phistory-btn');
    const list = btn && btn.nextElementSibling;
    if (!btn || !list || btn.getAttribute('aria-expanded') !== 'true') return 'open a prospect and its History first';
    sessionStorage.setItem('__mock9b', JSON.stringify({ btn: btn.outerHTML, list: list.outerHTML, panelClass: btn.parentElement.className }));
    return 'grabbed';
  }
  const saved = JSON.parse(sessionStorage.getItem('__mock9b') || 'null');
  const data = window.__mock9bData;
  const box = [...document.querySelectorAll('[role=dialog]')].pop();
  if (!saved || !data || !box) return 'grab first, set window.__mock9bData, and open a summary';
  box.querySelectorAll('[data-mock=item09b]').forEach((e) => e.remove());
  // Wrap it in the panel's own class so Prospects' styles apply exactly as they do there.
  const wrap = document.createElement('div');
  wrap.className = saved.panelClass;
  wrap.dataset.mock = 'item09b';
  wrap.style.cssText = 'padding:0;margin:4px 0 0;border:0;box-shadow:none;background:none;width:auto;max-width:none;position:static;height:auto;overflow:visible';
  wrap.innerHTML = saved.btn + (data.expanded ? saved.list : '');
  const btn = wrap.querySelector('button');
  btn.setAttribute('aria-expanded', String(!!data.expanded));
  btn.querySelector('.phistory-label').textContent = data.label;
  // Closed, Prospects shows a right-pointing chevron (the grabbed markup is the open one, pointing down).
  const chevron = btn.querySelector('svg');
  if (!data.expanded && chevron) chevron.innerHTML = '<path d="M9 6l6 6l-6 6"></path>';
  const ul = wrap.querySelector('ul');
  if (ul) {
    ul.innerHTML = '';
    for (const [what, meta] of data.entries || []) {
      const li = document.createElement('li');
      li.className = 'plog-item';
      li.innerHTML = '<span class="plog-text"></span><span class="plog-meta"></span>';
      li.children[0].textContent = what;
      li.children[1].textContent = meta;
      ul.append(li);
    }
  }
  // Last thing in the summary, just above its button row: climb from Close to the box's own child
  // (Color Belt: the button row; Black Belt: its pinned footer) and go in front of it.
  let anchor = [...box.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Close');
  while (anchor && anchor.parentElement !== box) anchor = anchor.parentElement;
  if (anchor) box.insertBefore(wrap, anchor);
  else box.append(wrap);
  box.scrollTop = box.scrollHeight; // a long summary scrolls: show its end
  return 'drawn';
})()
