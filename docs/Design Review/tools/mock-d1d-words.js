// mock-d1d-words.js — draws end-review question D1d's option B ON TOP of a real ask that loses nothing,
// for a picture only: the button that changes nothing says what stays (item 8's rule), instead of "Cancel":
//   Forms' "Open kiosk mode on this device?"     → "Stay in the dashboard"  (like the leave warnings' "Stay on this page")
//   Forms' "End kiosk mode on all tablets?"      → "Keep kiosk mode on"
//   Prospects' "Did … come to the free class?"   → "Keep in Booked"  (the Board column the card came from)
//   Prospects' "…'s free class is still ahead"   → "Keep in Booked"
//   window.__mockD1d = 'words'   on an open ask (window.__mockD1dColumn = 'New' for a card from another column)
//   window.__mockD1d = 'clear'   puts it back
// It only changes the words inside the button's own text (never adds, moves or removes React's parts).
// A reload also removes it.
// Run:   node cdp.mjs eval "window.__mockD1d = 'words'; $(cat mock-d1d-words.js)"
(() => {
  const mode = window.__mockD1d;
  const undo = (window.__mockD1dUndo = window.__mockD1dUndo || []);
  while (undo.length) undo.pop()();
  if (mode === 'clear') return 'cleared';
  if (mode !== 'words') return "set window.__mockD1d = 'words' or 'clear'";
  const dialog = [...document.querySelectorAll('.dialog')].find((d) => {
    const b = d.getBoundingClientRect();
    return b.height > 0 && b.top >= 0 && b.top < 900;
  });
  if (!dialog) return 'open an ask first';
  // the kiosk asks sit inside the Share dialog; Prospects' ask is the whole box
  const box = dialog.querySelector('.fshare-ask') || dialog;
  const text = box.innerText;
  const column = window.__mockD1dColumn || 'Booked';
  const words = /Open kiosk mode on this device\?/.test(text) ? 'Stay in the dashboard'
    : /End kiosk mode on all tablets\?/.test(text) ? 'Keep kiosk mode on'
    : /come to the free class\?|free class is still ahead/.test(text) ? `Keep in ${column}`
    : null;
  if (!words) return 'not one of the D1d asks';
  const safe = [...box.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Cancel');
  if (!safe) return 'no Cancel button in this ask';
  const walker = document.createTreeWalker(safe, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.data.trim()) continue;
    const before = node.data;
    node.data = words;
    undo.push(() => { node.data = before; });
    break;
  }
  return `drawn: ${words}`;
})()
