// mock-i-tabname.js — draws mockup I (design review BB17 / D4, "Rubric and prices" becomes "Rubric and
// waiver", rulebook v1.023) ON TOP of the real preview page, for the review pictures only. Nothing in
// the app's code changes.
// Why: prices moved onto each cycle long ago, so the tab now holds the rubric, the waiver and the
// result emails — the old name sends people looking for prices that aren't there. The "After" pictures
// need the new name everywhere it shows: the tab itself, and the sentences that name the tab (e.g. the
// placeholder waiver, "Save the school's waiver on Rubric and prices first.").
// How: open the screen, then run this file in the page (Design Review's cdp.mjs eval). It walks every
// piece of text on the page (text nodes, plus aria-label and title attributes, which screen readers
// and tooltips use) and replaces "Rubric and prices" with "Rubric and waiver". The tab's first line,
// "Same for both schools. Prices are set on each cycle.", doesn't contain those words, so it stays.
// A watcher does it again if React redraws part of the page. A reload puts the old words back.
(() => {
  if (window.__mockIWatch) { window.__mockIWatch.disconnect(); window.__mockIWatch = null; }
  const FROM = 'Rubric and prices';
  const TO = 'Rubric and waiver';
  let count = 0;
  const draw = () => {
    // Text on screen: every text node under <body> that contains the old words.
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeValue.includes(FROM)) {
        node.nodeValue = node.nodeValue.split(FROM).join(TO);
        count += 1;
      }
    }
    // Words that aren't drawn but are read aloud or shown on hover.
    for (const el of document.querySelectorAll('[aria-label], [title]')) {
      for (const attr of ['aria-label', 'title']) {
        const value = el.getAttribute(attr);
        if (value && value.includes(FROM)) {
          el.setAttribute(attr, value.split(FROM).join(TO));
          count += 1;
        }
      }
    }
  };
  draw();
  window.__mockIWatch = new MutationObserver(() => {
    window.__mockIWatch.disconnect(); // our own changes must not wake the watcher again
    draw();
    window.__mockIWatch.observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  window.__mockIWatch.observe(document.body, { childList: true, subtree: true, characterData: true });
  return `swapped "${FROM}" in ${count} place(s)`;
})()
