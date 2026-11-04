// mock-c17-money.js — Camps design review C17 (rule v1.026, v1.101), drawn ON TOP of the real preview page for a
// picture only: what Camps' money looks like once Camps' text.js writes it with the shared formatMoney
// (src/lib/money.js) instead of Color Belt's dollars (screens/testing/text.js).
// How: every amount Camps' dollars wrote as "$-335" (the only spelling that differs, see the picture's footer)
// is re-written by the REAL shared helper, imported from the running app (Vite serves the source files), so the
// picture shows exactly what formatMoney returns ("−$335", a real minus sign U+2212). Nothing is saved.
// Run with a Camper detail that has a reversed payment open (preview: admin, camper ⋯ → Undo payment first):
//   node shotx.mjs out.png --eval mock-c17-money.js
(async () => {
  const { formatMoney } = await import('/src/lib/money.js');
  const root = [...document.querySelectorAll('[role=dialog]')].pop() || document.body;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let changed = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const next = node.nodeValue.replace(/\$-([\d,]+)(?:\.(\d\d))?/g, (_m, whole, cents) => {
      changed += 1;
      return formatMoney(-(Number(whole.replace(/,/g, '')) * 100 + Number(cents ?? 0)));
    });
    if (next !== node.nodeValue) node.nodeValue = next;
  }
  return `amounts re-written: ${changed}`;
})()
