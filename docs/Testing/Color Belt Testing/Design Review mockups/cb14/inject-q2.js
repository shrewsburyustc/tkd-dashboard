// inject-q2.js — draws CB14 Question 2's options (the Schedule's and Forms' hints) on top of the
// real preview page, for the mockup only (nothing in the app changes). Pasted into the page by
// cdp.mjs eval; then call __q2.slotEmpty('A'|'B'|'C'), __q2.slotHint(...), __q2.forms(...).
// The link look is the app's own inline link (.link-button, as Black Belt's "Go to the default
// rubric" in its gray line, CycleRubricTab.jsx).
(() => {
  const LINK = '<button type="button" class="link-button inline-link" style="font-size:inherit;padding:0;min-height:0;display:inline;vertical-align:baseline;line-height:inherit;text-decoration:underline;text-underline-offset:2px">Settings → Classes and ranks</button>';
  const PLAIN = 'Settings → Classes and ranks';
  const find = (re) => [...document.querySelectorAll('body *')].find((e) => re.test(e.textContent) && [...e.children].every((c) => !re.test(c.textContent)));
  const set = (re, html) => { const e = find(re); if (!e) return 'not found: ' + re; e.innerHTML = html; return 'ok'; };
  window.__q2 = {
    // The amber note in an empty Add time slot (a school with no classes yet)
    slotEmpty(v) {
      const where = v === 'B' ? PLAIN : LINK;
      return set(/Add classes in Testing/, `Add classes in ${where} first. The schedule uses them.`);
    },
    // The gray hint under the Class choices in Add / Edit time slot
    slotHint(v) {
      const where = v === 'A' ? LINK : PLAIN;
      return set(/^From Testing → Classes and ranks$/, `From ${where}`);
    },
    // Forms → Book a class → Classes offered, at a school with no classes yet
    forms(v) {
      const where = v === 'B' ? PLAIN : LINK;
      return set(/This school has no classes yet/, `This school has no classes yet <span style="white-space:nowrap">(${where}).</span>`);
    },
  };
  return 'ready';
})();
