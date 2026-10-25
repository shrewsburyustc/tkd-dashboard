// mock-item17a-cents.js — draws Design Review item 17a's option C ON TOP of the real preview page, for a
// picture only: every whole-dollar amount in the page body written with cents, the way Finance writes money
// ("$790" → "$790.00", "Paid $160" → "Paid $160.00", "$20 overpaid" → "$20.00 overpaid").
//   window.__mock17a = 'cents'   adds ".00" to every whole-dollar amount inside <main>
//   window.__mock17a = 'clear'   puts the original words back
// It only changes the words inside the page's own text (never adds, moves or removes parts), and remembers
// the originals so 'clear' can put them back. A reload also removes it.
// Run:   node cdp.mjs eval "window.__mock17a = 'cents'; $(cat mock-item17a-cents.js)"
(() => {
  const mode = window.__mock17a;
  const saved = (window.__mock17aSaved = window.__mock17aSaved || []);
  if (mode === 'clear') {
    for (const [node, text] of saved) node.data = text;
    saved.length = 0;
    return 'cleared';
  }
  if (mode !== 'cents') return "set window.__mock17a = 'cents' or 'clear'";
  const main = document.querySelector('main');
  if (!main) return 'no page';
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
  let changed = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    // "$1,040" or "$160" not already followed by cents → add ".00"
    const next = node.data.replace(/\$(\d{1,3}(?:,\d{3})*|\d+)(?![.\d,])/g, (m) => `${m}.00`);
    if (next !== node.data) {
      saved.push([node, node.data]);
      node.data = next;
      changed += 1;
    }
  }
  return `cents added in ${changed} places`;
})()
