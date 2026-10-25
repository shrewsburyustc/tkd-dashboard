// mock-d4-tab.js — draws end-review question D4's options ON TOP of Black Belt testing's real tab bar, for
// pictures only: the "Rubric and prices" tab named for what's in it (item 15d's rule). Its prices moved to
// each cycle (v0.902); it holds the waiver, how long signed waivers are kept, the default rubric — and, on the
// Black Belt branch (0025, not merged yet), the result emails.
//   window.__mockD4 = 'B'       "Rubric and waiver"
//   window.__mockD4 = 'C'       "Rubric, waiver and emails"
//   window.__mockD4 = 'clear'   puts it back
// It only changes the words inside the tab's own text (never adds, moves or removes React's parts).
// A reload also removes it.
// Run:   node cdp.mjs eval "window.__mockD4 = 'B'; $(cat mock-d4-tab.js)"
(() => {
  const mode = window.__mockD4;
  const undo = (window.__mockD4Undo = window.__mockD4Undo || []);
  while (undo.length) undo.pop()();
  if (mode === 'clear') return 'cleared';
  const words = { B: 'Rubric and waiver', C: 'Rubric, waiver and emails' }[mode];
  if (!words) return "set window.__mockD4 = 'B', 'C' or 'clear'";
  const tab = [...document.querySelectorAll('main [role=tab]')].find((t) => t.innerText.trim() === 'Rubric and prices');
  if (!tab) return 'open Black Belt testing first';
  const walker = document.createTreeWalker(tab, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.data.trim()) continue;
    const before = node.data;
    node.data = words;
    undo.push(() => { node.data = before; });
    break;
  }
  return `drawn: ${words}`;
})()
