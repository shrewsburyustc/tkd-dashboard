// mock-e-problems.js — draws mockup E (design review BB4, rulebook v1.004 "Problems stay on screen") ON TOP
// of the real preview screens, for the review pictures only. Nothing in the app's code changes.
// Why: Black Belt still shows refusals as toasts that vanish, and the grayed Add candidate only explains
// itself in a toast when pressed. Jeffrey reviews the fix as a picture before any code (CLAUDE.md).
// Drawing on the real screen keeps the exact look: the bar is the shared ErrorBanner's own markup
// (.errbar, copied from a real one made with __tkdPreview.failNextSave('blackBelt')), and the gray lines
// use existing classes (.phidden-line.pdesk-line = Prospects' line under the page title, v0.616;
// .bbe-gray-line = Black Belt's small gray line from the rubric editor).
// How: open the screen first, set window.__mockE, then run this file in the page (Design Review's cdp.mjs
// eval). It only ADDS its own elements (marked data-mock-e); it never moves or removes React's parts.
// A watcher puts them back if React redraws the page. window.__mockE = 'clear' (or a reload) removes them.
//   window.__mockE = { bar: 'candidates', text }  the amber bar at the top of the Candidates tab's list
//                    (any bar: add changed: '…' for new words after text, drawn in their own span to outline)
//   window.__mockE = { bar: 'detail', text }      inside the open candidate detail, at the top of its body
//   window.__mockE = { bar: 'rubric', text }      at the top of the cycle's Rubric tab
//   window.__mockE = { bar: 'cycles', text }      at the top of the Cycles list
//   window.__mockE = { gray: 'A', text, icon }    one gray line under the page title (icon = the top bar's
//                                                 "private details hidden" icon, for the Hide case)
//   window.__mockE = { gray: 'B', text }          a gray line right under the Add candidate button
// Two extras, for a refusal the preview can't make happen (the Rubric tab's "locked by grading": the
// rubric must still be editable, so registration not opened, while grading starts — not in the sample):
//   toast: '…'      draws TODAY's toast (the shared Toast's markup) with those words
//   lockLine: '…'   swaps the words of the Rubric tab's lock line (e.g. to the "grading started" line)
(() => {
  const want = window.__mockE;
  if (window.__mockEWatch) { window.__mockEWatch.disconnect(); window.__mockEWatch = null; }
  document.querySelectorAll('[data-mock-e], [data-mock-e-toast]').forEach((el) => el.remove());
  const lockWords = () => document.querySelector('.bbr-locked-line span')?.firstChild;
  if (window.__mockELockOrig != null && lockWords()) lockWords().textContent = window.__mockELockOrig;
  window.__mockELockOrig = null;
  if (want === 'clear') return 'cleared';
  if (!want || (!want.bar && !want.gray && !want.toast)) return "set window.__mockE = { bar, text } / { gray, text, icon } / { toast } or 'clear'";

  const svg = (cls, paths) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tabler-icon ${cls}" aria-hidden="true">${paths.map((d) => `<path d="${d}"></path>`).join('')}</svg>`;
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

  // The shared bar (ErrorBanner.jsx) with only the × — a refusal has nothing to retry.
  function makeBar() {
    const div = document.createElement('div');
    div.setAttribute('data-mock-e', '');
    div.className = 'errbar';
    div.setAttribute('role', 'alert');
    div.innerHTML =
      svg('tabler-icon-alert-triangle errbar-icon', ['M12 9v4', 'M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0', 'M12 16h.01']) +
      // changed: optional words added after text, in their own span so the picture can outline them
      `<span class="errbar-text">${esc(want.text)}${want.changed ? `<span data-mock-e-changed>${esc(want.changed)}</span>` : ''}</span>` +
      '<span class="errbar-actions"><button type="button" class="tib errbar-dismiss" aria-label="Dismiss"><span class="tib-box">' +
      svg('tabler-icon-x', ['M18 6l-12 12', 'M6 6l12 12']) +
      '</span><span class="tib-tip" aria-hidden="true">Dismiss</span></button></span>';
    return div;
  }

  // The gray reason line for the grayed Add candidate.
  function makeLine() {
    const p = document.createElement('p');
    p.setAttribute('data-mock-e', '');
    if (want.gray === 'A') {
      p.className = 'phidden-line pdesk-line';
      // ti-currency-dollar-off = private details hidden (the top bar's chip, TopBar.jsx)
      p.innerHTML = (want.icon ? svg('tabler-icon-currency-dollar-off', ['M16.7 8a3 3 0 0 0 -2.7 -2h-4a3 3 0 0 0 0 6h4m1.392 1.355a3 3 0 0 1 -1.392 4.645h-4a3 3 0 0 1 -2.7 -2', 'M12 3v3m0 12v3', 'M3 3l18 18']) : '') + `<span>${esc(want.text)}</span>`;
    } else {
      p.className = 'bbe-gray-line';
      p.style.margin = '4px 0 0';
      p.textContent = want.text;
    }
    return p;
  }

  // Where each piece goes: [the element it sits next to, 'first' (first inside it) or 'after' (right
  // after it)]; the element is null while that part of the screen isn't there.
  function target() {
    if (want.bar === 'candidates') return [document.querySelector('.tpanel.bb-candidates'), 'first'];
    if (want.bar === 'detail') {
      // the candidate detail (a dialog on PC and tablets, a full-screen page on phones; not a small
      // confirm box): right under its header (tag and cycle line), above the first section, so it is
      // the first thing read in the dialog
      const dlg = [...document.querySelectorAll('.tdialog, .dialog-page')].find((d) => !d.classList.contains('tdialog--confirm') && d.getBoundingClientRect().height > 0);
      return [dlg?.querySelector('.bb-detail-head'), 'after'];
    }
    // the Rubric tab: where the cycle page's own bar already goes (CyclePage.jsx): under the lock line, above the rubric
    if (want.bar === 'rubric') return [document.querySelector('.bbr-locked-line') ?? document.querySelector('.bb-cycle-head ~ .ttabs'), 'after'];
    if (want.bar === 'cycles') return [document.querySelector('.tpanel'), 'first'];
    if (want.gray === 'A') return [document.querySelector('.phead.bb-cycle-head'), 'after'];
    // B: on phones the button has its own full-width row (.bb-phone-add), so the line goes right after
    // the button in that row; on PC / tablet the button sits in the header row, so the line goes after
    // the header, lined up with the button's right edge (the ⋯ stays where it is)
    const phoneButton = document.querySelector('.bb-phone-add .bb-add-candidate');
    if (phoneButton) return [phoneButton, 'after'];
    return [document.querySelector('.phead.bb-cycle-head'), 'after'];
  }
  function make() {
    if (want.bar) return makeBar();
    const line = makeLine();
    if (want.gray === 'B' && !document.querySelector('.bb-phone-add')) {
      const head = document.querySelector('.phead.bb-cycle-head').getBoundingClientRect();
      const btn = document.querySelector('.bb-add-candidate').getBoundingClientRect();
      line.style.cssText = `margin: calc(-1 * var(--space-8)) ${Math.round(head.right - btn.right)}px var(--space-12) 0; text-align: right;`;
    }
    return line;
  }
  // Draws it, or moves it back when a redraw left it somewhere else; true when it is on screen.
  // (A redraw can carry an added element along to a wrong place, so "is it there at all?" isn't enough.)
  function extras() {
    if (want.toast) {
      const region = document.querySelector('.toast-region');
      if (region && !region.querySelector('[data-mock-e-toast]')) {
        const t = document.createElement('div');
        t.setAttribute('data-mock-e-toast', '');
        t.className = 'toast';
        t.innerHTML = `<span class="toast-text">${esc(want.toast)}</span>`;
        region.append(t);
      }
    }
    const words = lockWords();
    if (want.lockLine && words && words.textContent !== want.lockLine) {
      if (window.__mockELockOrig == null) window.__mockELockOrig = words.textContent;
      words.textContent = want.lockLine;
    }
  }
  function place() {
    extras();
    if (!want.bar && !want.gray) return true;
    const [ref, how] = target();
    if (!ref) return false;
    let el = document.querySelector('[data-mock-e]');
    if (el && (how === 'after' ? ref.nextElementSibling === el : ref.firstElementChild === el)) return true;
    el?.remove();
    el = make();
    if (how === 'after') ref.after(el);
    else ref.prepend(el);
    return true;
  }
  const ok = place();
  window.__mockEWatch = new MutationObserver(() => place());
  window.__mockEWatch.observe(document.body, { childList: true, subtree: true, characterData: true });
  return ok ? 'drawn' : 'not on screen yet (the watcher will draw it when it appears)';
})()
