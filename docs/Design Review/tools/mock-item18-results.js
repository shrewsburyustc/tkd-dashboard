// mock-item18-results.js — draws Design Review item 18's "after" picture ON TOP of Color Belt's real Grading tab,
// for a picture only: one results pattern across the testing sections —
//   - Color Belt's result button "Pass" reads "Passed" (Star's word for the same result; "Not passed" and
//     "No show" stay), and
//   - Star's "Print results" and "Download CSV" buttons sit at the right of the class switch, where Star has
//     them next to its Dan switch.
//   window.__mock18 = 'grab'   on Star's Results tab: remembers its Print results and Download CSV buttons
//   window.__mock18 = 'cb'     on Color Belt's Grading tab: draws the above
//   window.__mock18 = 'clear'  puts everything back
// It only changes words inside the page's own text, one inline style, and adds new parts (moving or removing
// React's parts crashes the page). A reload also removes it.
// Run:   node cdp.mjs eval "window.__mock18 = 'cb'; $(cat mock-item18-results.js)"
(() => {
  const mode = window.__mock18;
  const MARK = 'item18';
  const undo = (window.__mock18Undo = window.__mock18Undo || []);
  const clear = () => {
    document.querySelectorAll(`[data-mock=${MARK}]`).forEach((e) => e.remove());
    while (undo.length) undo.pop()();
  };
  if (mode === 'clear') {
    clear();
    return 'cleared';
  }
  if (mode === 'grab') {
    const pick = (t) => [...document.querySelectorAll('main button')].find((b) => b.innerText.trim() === t);
    const print = pick('Print results');
    const csv = pick('Download CSV');
    if (!print || !csv) return "open Star's Results tab first";
    sessionStorage.setItem('__mock18', JSON.stringify({ print: print.outerHTML, csv: csv.outerHTML }));
    return 'grabbed';
  }
  if (mode === 'cb') {
    const saved = JSON.parse(sessionStorage.getItem('__mock18') || 'null');
    if (!saved) return "run 'grab' on Star's Results tab first";
    const row = document.querySelector('main .ev-class-switch');
    if (!row) return "open Color Belt's Grading tab first";
    clear();
    // 1. "Pass" → "Passed" in the result buttons (only the word, inside the app's own text)
    const walker = document.createTreeWalker(document.querySelector('main'), NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.data.trim() === 'Pass') {
        const before = node.data;
        node.data = before.replace('Pass', 'Passed');
        undo.push(() => { node.data = before; });
      }
    }
    // 2. Star's two buttons at the right of the class switch
    const style = row.getAttribute('style');
    row.style.cssText += ';display:flex;align-items:center;justify-content:space-between;gap:var(--space-8)';
    undo.push(() => (style === null ? row.removeAttribute('style') : row.setAttribute('style', style)));
    const box = document.createElement('div');
    box.dataset.mock = MARK;
    box.style.cssText = 'display:flex;gap:var(--space-8);flex:none';
    box.innerHTML = saved.print + saved.csv;
    row.append(box);
    return 'drawn';
  }
  return "set window.__mock18 = 'grab', 'cb' or 'clear'";
})()
