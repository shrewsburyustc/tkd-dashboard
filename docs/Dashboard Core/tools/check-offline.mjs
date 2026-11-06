// check-offline.mjs — the one offline bar's behaviour checks (design review M12; rulebook v1.005 and
// v1.123; the approved mockup Mockups/M12-offline-bar.html). Drives the preview app (fake database)
// with real key presses, clicks and taps (Chrome DevTools Protocol "Input" events) and checks what the
// mockup promises:
//   - online: no bar. The browser going offline (DevTools' own network switch, which also makes
//     navigator.onLine false): the bar at once, under the top bar and outside the page's scrolling
//     part, with the approved words, read out (role=alert), with no buttons. Back online: gone;
//   - it lines up with the page's own edges (24px; 16px on phones), clears the page's own scrollbar,
//     and never makes the page scroll sideways (PC, tablet, phone and 320 wide);
//   - it stays while the person changes page;
//   - the Wi-Fi up without internet: no bar after one failed refresh, the bar after two, gone after
//     the next good one; switching school keeps it; leaving the page takes its report with it, and a
//     page that has never loaded never claims "offline";
//   - back online, the bar goes at once on a page that refreshes itself (it reloads on "online"),
//     and a page without a refresh of its own never raises it (it couldn't take it back);
//   - the lock screen hides it, and unlocking shows it again while still offline;
//   - Tab through a page with the bar showing: no focused control is ever under it (WCAG 2.4.11);
//   - with Panel size's "not saved" bar too, the offline bar comes first;
//   - when a bar comes or goes, the page stays still under the finger (v1.124): on PC and phone, at
//     the very top of a page (its first line goes just out of view), at its very end (the browser's
//     own pull-back isn't doubled), with the whole frame scrolled, five times over without creeping,
//     and with Panel size's bar; a control reached with Tab stays in sight with room for its focus
//     ring, and one focused long ago and scrolled away doesn't pull the page back;
//   - a tab that closes while its refreshes were failing (Star's Results) takes its report with it.
// DevTools' switch also stops the app loading code it hasn't loaded yet, so the checks that change
// page use __tkdPreview.cutConnection() instead: the same browser events, but the code still loads.
// The 15-second refresh timers are ticked by hand (a stand-in for setInterval at exactly 15 000 ms),
// so "one failed refresh" is exactly one, whatever the clock does.
// Why: pictures show how it looks; these show how it behaves. A hidden Chrome (chrome.mjs).
//
// Usage: node check-offline.mjs <preview address, e.g. http://localhost:5190/>
//   prints ok / FAIL per check and the totals; exits 1 when any fails.
// Only ever point it at `npm run dev:preview-mode` (the fake database): it signs in with the
// preview password and uses the preview's console helpers (__tkdPreview).
import assert from 'node:assert/strict';
import { withChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5190/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WORDS = 'You’re offline. Changes won’t save until the connection is back. Keep this page open — this bar goes away by itself.';
let passed = 0;
const failures = [];
async function check(label, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`ok    ${label}`);
  } catch (error) {
    failures.push(label);
    console.log(`FAIL  ${label}\n      ${error.message.split('\n').join('\n      ')}`);
  }
}
const KEYS = { Tab: 9, Escape: 27, Enter: 13 };

await withChrome(async (tab) => {
  await tab.cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  // The 15-second refresh timers, ticked by hand: setInterval at exactly 15 000 ms keeps the function
  // instead of running it, and __tickLiveReloads() runs every kept one once (and says how many).
  await tab.cdp('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      const realSet = window.setInterval.bind(window);
      const realClear = window.clearInterval.bind(window);
      const kept = new Map();
      let next = 1;
      window.setInterval = (fn, ms, ...rest) => {
        if (ms !== 15000) return realSet(fn, ms, ...rest);
        const id = -(next++);
        kept.set(id, () => fn(...rest));
        return id;
      };
      window.clearInterval = (id) => (kept.delete(id) ? undefined : realClear(id));
      window.__tickLiveReloads = () => { for (const run of [...kept.values()]) run(); return kept.size; };
    })();`,
  });

  // ----- helpers -----
  const ev = (js) => tab.evaluate(js);
  let touch = false;
  async function size(w, h, isTouch = false) {
    touch = isTouch;
    await tab.size({ w, h, touch: isTouch, scale: 1 });
  }
  // Opens a page of the dashboard and waits until the signed-in frame shows (signing in if needed).
  async function openApp(hash = '') {
    await tab.open('about:blank', 0);
    await tab.open(`${base}#${hash}`, 300);
    for (let i = 0; i < 60; i += 1) {
      const state = await ev(`document.querySelector('.shell:not([hidden])') ? 'shell' : document.getElementById('signin-email') ? 'signin' : document.body.innerText.includes('Enter your PIN') ? 'locked' : 'wait'`);
      if (state === 'shell') break;
      if (state === 'locked') throw new Error('the preview is locked');
      if (state === 'signin') {
        await ev(`(() => {
          const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          for (const [id, value] of [['signin-email', 'preview@example.com'], ['signin-password', 'preview']]) {
            const input = document.getElementById(id); set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true }));
          }
          [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Sign in').click();
        })()`);
        await sleep(1500);
      }
      await sleep(150);
    }
    await sleep(900);
  }
  async function key(name, { shift = false } = {}) {
    const code = KEYS[name];
    const common = { key: name, code: name, windowsVirtualKeyCode: code, modifiers: shift ? 8 : 0 };
    await tab.cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...common });
    await tab.cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...common });
    await sleep(120);
  }
  async function typeDigits(digits) {
    for (const d of digits) {
      await tab.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: d, code: `Digit${d}`, text: d, windowsVirtualKeyCode: 48 + Number(d) });
      await tab.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: d, code: `Digit${d}`, windowsVirtualKeyCode: 48 + Number(d) });
      await sleep(80);
    }
  }
  async function pressAt(x, y) {
    if (touch) {
      await tab.cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await sleep(60);
      await tab.cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await tab.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await tab.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await tab.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    }
    await sleep(400);
  }
  async function press(finder, what) {
    const at = await ev(`(() => { const el = ${finder}; if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return [r.left + Math.min(r.width / 2, 40), r.top + r.height / 2]; })()`);
    if (!at) throw new Error(`not on the page: ${what ?? finder}`);
    await pressAt(at[0], at[1]);
  }
  // The deepest element in the page whose words are exactly `text` (a list row, a link).
  const byText = (text) => `[...document.querySelectorAll('.shell-content *')].find((e) => e.textContent.trim() === ${JSON.stringify(text)} && e.offsetParent && ![...e.children].some((c) => c.textContent.trim() === ${JSON.stringify(text)}))`;
  const railItem = (label) => `[...document.querySelectorAll('nav.rail .rail-item')].find((b) => b.getAttribute('aria-label').startsWith(${JSON.stringify(label)}))`;
  // DevTools' own network switch: navigator.onLine and the browser's online / offline events.
  async function network(online) {
    await tab.cdp('Network.enable', {});
    await tab.cdp('Network.emulateNetworkConditions', { offline: !online, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await sleep(400);
  }
  // The preview's helper: every call fails; true also fires "offline", 'internet' fires nothing.
  async function cut(mode) {
    await ev(`window.__tkdPreview.cutConnection(${JSON.stringify(mode)})`);
    await sleep(400);
  }
  // One live reload now, as when the tab is shown again (useLiveLoad listens for that).
  async function reloadNow() {
    await ev(`document.dispatchEvent(new Event('visibilitychange'))`);
    await sleep(900); // the fake network's ~200 ms plus the redraw
  }
  // One 15-second refresh on every page that refreshes itself; returns how many timers ran.
  async function tick() {
    const timers = await ev('window.__tickLiveReloads()');
    await sleep(700); // the fake network's ~200 ms plus the redraw
    return timers;
  }
  const schoolButton = (name) => `[...document.querySelectorAll('.topbar button')].find((b) => b.textContent.trim() === ${JSON.stringify(name)})`;
  // Chloe Nguyen's first Check in on the camp page (her row on PC, her card on a phone).
  const chloeCheckIn = `(() => {
    const name = [...document.querySelectorAll('.shell-content *')].find((e) => e.textContent.trim().startsWith('Chloe Nguyen') && ![...e.children].some((c) => c.textContent.trim().startsWith('Chloe Nguyen')));
    let box = name;
    while (box && !(box.querySelectorAll && [...box.querySelectorAll('button')].some((b) => b.textContent.includes('Check in')))) box = box.parentElement;
    return box ? [...box.querySelectorAll('button')].find((b) => b.textContent.includes('Check in')) : null;
  })()`;
  const topOf = (finder) => ev(`(() => { const el = ${finder}; return el ? el.getBoundingClientRect().top : null; })()`);
  // Opens Camps → Thanksgiving Camp and scrolls the page so Chloe's Check in sits at screen height y.
  async function openCampAt(y) {
    await openApp('camps');
    await press(byText('Thanksgiving Camp'), 'Thanksgiving Camp');
    await sleep(1200);
    const t = await topOf(chloeCheckIn);
    if (t === null) throw new Error("Chloe Nguyen's Check in isn't on the camp page");
    await ev(`document.querySelector('.shell-content').scrollTop += ${t - y}`);
    await sleep(300);
  }
  // The last Check in on the camp page (the bottom of the roster).
  const lastCheckIn = `[...document.querySelectorAll('.shell-content button')].filter((b) => b.textContent.includes('Check in')).pop()`;
  const toEnd = () => ev(`(() => { const c = document.querySelector('.shell-content'); c.scrollTop = c.scrollHeight; })()`);
  // The bar comes, then goes: the finger's button never moves (1px of rounding allowed).
  async function assertStill(label, finder = chloeCheckIn) {
    const before = await topOf(finder);
    await cut(true);
    assert.equal((await bars()).count, 1, `${label}: the bar is up`);
    const during = await topOf(finder);
    assert.ok(Math.abs(during - before) <= 1, `${label}, while the bar shows: ${Math.round(before)} → ${Math.round(during)}`);
    await cut(false);
    assert.equal((await bars()).count, 0, `${label}: the bar is gone`);
    const after = await topOf(finder);
    assert.ok(Math.abs(after - before) <= 1, `${label}, after it goes: ${Math.round(before)} → ${Math.round(after)}`);
  }
  // The frame's amber bars, and where the offline one is next to the top bar and the page.
  const bars = () => ev(`(() => {
    const main = document.querySelector('.shell-main');
    const content = main.querySelector('.shell-content');
    const top = main.querySelector('.topbar').getBoundingClientRect();
    const c = content.getBoundingClientRect();
    const slots = [...main.querySelectorAll(':scope > .shell-errbar')];
    const offline = slots.map((s) => s.querySelector('.errbar')).filter((b) => b && b.textContent.trim() === ${JSON.stringify(WORDS)});
    const b = offline[0] ?? null;
    const r = b ? b.getBoundingClientRect() : null;
    return {
      count: offline.length,
      shown: Boolean(b && b.offsetParent !== null),
      role: b ? b.getAttribute('role') : null,
      controls: b ? b.querySelectorAll('button, a, input, [tabindex]').length : null,
      top: r && Math.round(r.top), bottom: r && Math.round(r.bottom), left: r && Math.round(r.left), right: r && Math.round(r.right), height: r && Math.round(r.height),
      textFits: b ? b.scrollWidth <= b.clientWidth : null,
      topbarBottom: Math.round(top.bottom), contentTop: Math.round(c.top), contentLeft: Math.round(c.left),
      contentInnerRight: Math.round(c.left + content.clientLeft + content.clientWidth),
      pageScrollbar: content.offsetWidth - content.clientWidth,
      sideways: document.scrollingElement.scrollWidth - innerWidth,
      order: slots.map((s) => (s.textContent.trim() === ${JSON.stringify(WORDS)} ? 'offline' : 'other')),
      gapBetween: slots.length > 1 ? Math.round(slots[1].querySelector('.errbar').getBoundingClientRect().top - slots[0].querySelector('.errbar').getBoundingClientRect().bottom) : null,
    };
  })()`);
  // The bar where the frame promises it: under the top bar, above the page (never over it).
  function assertPlaced(b, edge) {
    assert.equal(b.count, 1, `one offline bar (found ${b.count})`);
    assert.ok(b.shown, 'the bar shows');
    assert.ok(b.top >= b.topbarBottom, `under the top bar (bar top ${b.top}, top bar bottom ${b.topbarBottom})`);
    assert.ok(b.bottom <= b.contentTop, `above the page's scrolling part (bar bottom ${b.bottom}, page top ${b.contentTop})`);
    assert.equal(b.left, b.contentLeft + edge, `${edge}px in from the page's left edge`);
    assert.equal(b.right, b.contentInnerRight - edge, `${edge}px in from where the page ends (its scrollbar: ${b.pageScrollbar}px)`);
    assert.ok(b.sideways <= 0, `the page doesn't scroll sideways (${b.sideways}px)`);
    assert.ok(b.textFits, 'its words fit (they wrap; nothing cut off)');
  }

  // =========================== PC, 1280×800, mouse and keyboard ===========================
  await size(1280, 800);
  await openApp();

  await check('PC, online: no offline bar (Home)', async () => {
    assert.equal((await bars()).count, 0);
  });
  await network(false);
  await check('PC, the browser goes offline: at once, the bar under the top bar and above the page, with the approved words, read out (role=alert), no buttons, 24px from the page\'s edges', async () => {
    const b = await bars();
    assertPlaced(b, 24);
    assert.equal(b.role, 'alert');
    assert.equal(b.controls, 0, 'nothing to press in it: it goes away by itself');
  });
  await network(true);
  await check('PC, back online: the bar goes by itself', async () => {
    assert.equal((await bars()).count, 0);
  });

  // A page with its own scrollbar: the camp page.
  await openApp('camps');
  await press(byText('Thanksgiving Camp'), 'Thanksgiving Camp');
  await sleep(1200);
  await network(false);
  await check('PC, a page with its own scrollbar (Camps → Thanksgiving Camp): the bar ends where the page does, 24px left of its scrollbar', async () => {
    const b = await bars();
    assert.ok(b.pageScrollbar > 0, 'the camp page has a scrollbar of its own here');
    assertPlaced(b, 24);
  });
  await network(true);
  await sleep(300);

  // Changing page while offline (the preview's helper: the app's code still loads).
  await openApp();
  await cut(true);
  await check('PC: the bar stays while the person changes page (Home → Calendar → Camps)', async () => {
    assert.equal((await bars()).count, 1, 'on Home');
    await press(railItem('Calendar'), 'Calendar in the rail');
    await sleep(800);
    assert.equal((await bars()).count, 1, 'on Calendar');
    await press(railItem('Camps'), 'Camps in the rail');
    await sleep(800);
    assertPlaced(await bars(), 24);
  });
  await cut(false);
  await check('PC: when the connection is back, it goes (the browser says "online")', async () => {
    assert.equal((await bars()).count, 0);
  });

  // The Wi-Fi up without internet: only failed refreshes show it (the Camps list refreshes itself).
  await openApp('camps');
  await cut('internet');
  await check('PC, the Wi-Fi up but no internet (Camps): no bar after one failed refresh; the bar after two', async () => {
    assert.ok((await tick()) >= 1, 'the Camps list has a 15-second refresh');
    assert.equal((await bars()).count, 0, 'after one failed refresh');
    await tick();
    assertPlaced(await bars(), 24);
  });
  await check('PC, still no internet: switching school keeps the bar (Worcester → Shrewsbury)', async () => {
    await press(schoolButton('Shrewsbury'), 'Shrewsbury in the top bar');
    await sleep(900);
    assert.equal((await bars()).count, 1, 'after the switch (its first load failed too)');
    await tick();
    assert.equal((await bars()).count, 1, 'and after the next failed refresh');
  });
  await cut(false);
  await check('PC: the next good refresh takes it away', async () => {
    await tick();
    assert.equal((await bars()).count, 0);
  });
  await press(schoolButton('Worcester'), 'Worcester in the top bar'); // back, for the checks below
  await sleep(700);
  await cut('internet');
  await tick();
  await tick();
  await check('PC: leaving the page takes its report with it (Camps, two failed refreshes → Home: the bar goes)', async () => {
    assert.equal((await bars()).count, 1, 'on Camps, after two failed refreshes');
    await press(railItem('Home'), 'Home in the rail');
    await sleep(800);
    assert.equal((await bars()).count, 0, 'on Home, which has no refresh of its own');
  });
  await check('PC, still no internet: a page that has never loaded doesn\'t claim "offline" (Home → Camps: three failed refreshes, no bar)', async () => {
    await press(railItem('Camps'), 'Camps in the rail');
    await sleep(900);
    await tick();
    await tick();
    await tick();
    assert.equal((await bars()).count, 0);
  });
  await cut(false);

  // Back online, the bar goes at once: a page that refreshes itself reloads on "online".
  await openApp('camps');
  await cut(true);
  await tick();
  await tick();
  await check('PC, Camps offline through two failed refreshes: back online, the bar goes at once (the page reloads on "online")', async () => {
    assert.equal((await bars()).count, 1, 'while offline');
    await cut(false);
    await sleep(500);
    assert.equal((await bars()).count, 0, 'half a second after "online"');
  });
  // A tab that closes while its refreshes were failing takes its report with it (Star's Results tab).
  await openApp('testing/star');
  await press(byText('Fall Star Testing'), 'Fall Star Testing');
  await sleep(1200);
  const starEvent = await ev('location.hash');
  await openApp(`${starEvent.slice(1)}/results`);
  await tick(); // one good refresh first, so the Results tab has had its answer
  await cut('internet');
  await check('PC, Star → Fall Star Testing → Results, no internet: two failed refreshes, then Candidates, then the connection back — the bar goes', async () => {
    await tick();
    await tick();
    assert.equal((await bars()).count, 1, 'on Results, after two failed refreshes');
    await press(`[...document.querySelectorAll('.shell-content [role=tab], .shell-content button, .shell-content a')].find((b) => b.textContent.trim() === 'Candidates')`, 'the Candidates tab');
    await sleep(800);
    await cut(false);
    await tick();
    assert.equal((await bars()).count, 0, 'back online, on Candidates');
  });
  await cut(false);
  // A page without a refresh of its own never raises it: nothing would take it back.
  await openApp('finance');
  await cut('internet');
  await check('PC, Finance\'s Daily report (no refresh of its own), no internet: three failed loads never raise the bar', async () => {
    await reloadNow();
    await reloadNow();
    await reloadNow();
    assert.equal((await bars()).count, 0);
  });
  await cut(false);

  // The page stays still when a bar comes or goes (v1.124): the camp page, a finger on Chloe's Check in.
  await openCampAt(420);
  await check('PC, the camp page: when the bar comes and when it goes, Chloe Nguyen\'s Check in stays under the finger (v1.124)', async () => {
    await assertStill('PC');
  });
  await check('PC, the very top of the camp page: the bar comes and the title stays put (the page scrolls by the bar\'s height); when it goes, the page is back at its top', async () => {
    await ev(`document.querySelector('.shell-content').scrollTop = 0`);
    await sleep(200);
    const title = `document.querySelector('.shell-content h1')`;
    const before = await topOf(title);
    await cut(true);
    const during = await topOf(title);
    const scrolled = await ev(`document.querySelector('.shell-content').scrollTop`);
    assert.ok(Math.abs(during - before) <= 1, `the title stays put: ${Math.round(before)} → ${Math.round(during)}`);
    assert.ok(scrolled >= 40, `the page scrolled by the bar's height (${scrolled}px)`);
    await cut(false);
    assert.ok(Math.abs((await topOf(title)) - before) <= 1, 'the title is in the same place after the bar goes');
    assert.ok((await ev(`document.querySelector('.shell-content').scrollTop`)) <= 1, 'back at the very top');
  });
  await check('PC, the very top of the camp page with the keyboard on its back link (reached with Tab): the bar comes, and the back link stays in sight with room for its focus ring (v1.033)', async () => {
    await ev(`document.activeElement && document.activeElement.blur()`);
    await ev(`document.querySelector('.shell-content').scrollTop = 0`);
    await sleep(200);
    let focused = null;
    for (let i = 0; i < 40 && !focused; i += 1) {
      await key('Tab');
      focused = await ev(`(() => { const a = document.activeElement; return a && a.closest('.shell-content') ? (a.textContent || a.getAttribute('aria-label') || a.tagName).trim().slice(0, 30) : null; })()`);
    }
    assert.ok(focused, 'Tab reached the page');
    await ev(`document.querySelector('.shell-content').scrollTop = 0`);
    await sleep(200);
    await cut(true);
    const seen = await ev(`(() => { const c = document.querySelector('.shell-content').getBoundingClientRect(); const f = document.activeElement.getBoundingClientRect(); return { top: f.top, pageTop: c.top }; })()`);
    assert.ok(seen.top >= seen.pageTop + 4, `"${focused}" is in sight with its focus ring (its top ${Math.round(seen.top)}, the page's top edge ${Math.round(seen.pageTop)})`);
    await cut(false);
    await ev(`document.activeElement.blur()`);
  });
  await check('PC, the camp page scrolled to its very end: the bar comes and goes, and the last Check in stays put (the browser\'s own pull-back isn\'t doubled)', async () => {
    await toEnd();
    await sleep(300);
    await assertStill('At the end', lastCheckIn);
  });
  await check('PC, the camp page: Find a camper clicked, then the page scrolled to its end — the bar comes and goes, and the page doesn\'t jump back to the search box', async () => {
    await ev(`document.querySelector('.shell-content').scrollTop = 0`);
    await sleep(200);
    await press(`document.querySelector('.shell-content input')`, 'Find a camper');
    await toEnd();
    await sleep(300);
    assert.equal(await ev(`document.activeElement && document.activeElement.tagName`), 'INPUT', 'the search box still has focus');
    await assertStill('Focused long ago', lastCheckIn);
    await ev(`document.activeElement.blur()`);
  });
  await check('PC, the camp page: the bar comes and goes five times, and Chloe Nguyen\'s Check in ends exactly where it began (no creep)', async () => {
    await ev(`document.querySelector('.shell-content').scrollTop = 0`);
    await sleep(200);
    const t = await topOf(chloeCheckIn);
    await ev(`document.querySelector('.shell-content').scrollTop += ${t - 420}`);
    await sleep(300);
    const before = await topOf(chloeCheckIn);
    for (let i = 0; i < 5; i += 1) {
      await cut(true);
      await cut(false);
    }
    const after = await topOf(chloeCheckIn);
    assert.ok(Math.abs(after - before) <= 1, `after five times: ${Math.round(before)} → ${Math.round(after)}`);
  });
  await check('PC, the camp page scrolled down: a note appears above the view at the same moment as the bar (and goes with it), and the page stays still (the browser\'s own scroll anchoring is kept)', async () => {
    const t = await topOf(chloeCheckIn);
    await ev(`document.querySelector('.shell-content').scrollTop += ${t - 420}`);
    await sleep(300);
    const before = await topOf(chloeCheckIn);
    // In one go, as Camps' own "Couldn't refresh" bar comes with the one bar: a 30px block at the top
    // of the page (above the view), and the bar.
    await ev(`(() => { const s = document.createElement('div'); s.id = 'anchor-test'; s.style.height = '30px'; document.querySelector('.shell-content').firstElementChild.prepend(s); window.__tkdPreview.cutConnection(true); })()`);
    await sleep(500);
    const during = await topOf(chloeCheckIn);
    assert.ok(Math.abs(during - before) <= 1, `while the bar and the note show: ${Math.round(before)} → ${Math.round(during)}`);
    await ev(`(() => { document.getElementById('anchor-test').remove(); window.__tkdPreview.cutConnection(false); })()`);
    await sleep(500);
    const after = await topOf(chloeCheckIn);
    assert.ok(Math.abs(after - before) <= 1, `after both go: ${Math.round(before)} → ${Math.round(after)}`);
  });
  await check('PC, the camp page with the whole frame scrolled 60px (as on some phone pages, or iOS\'s keyboard): the bar comes and goes, and the page stays still', async () => {
    await ev(`(() => { const s = document.createElement('div'); s.id = 'frame-spacer'; s.style.height = '600px'; document.body.appendChild(s); })()`);
    await ev(`document.scrollingElement.scrollTop = 60`);
    await sleep(300);
    assert.ok((await ev('document.scrollingElement.scrollTop')) >= 59, 'the whole frame scrolled');
    try {
      await assertStill('Frame scrolled');
    } finally {
      await ev(`(() => { document.scrollingElement.scrollTop = 0; document.getElementById('frame-spacer')?.remove(); })()`);
    }
  });
  await check('PC, the camp page: Panel size\'s "not saved" bar goes (×) and the page stays still too', async () => {
    await ev(`localStorage.removeItem('tkd.preview.userMetadata')`);
    await openCampAt(420);
    await ev('window.__tkdPreview.failNextPanelSave()');
    await press(`document.querySelector('button[aria-label="Account menu"]')`, 'the initials');
    await press(`[...document.querySelectorAll('.account-panel [role=menuitem]')].find((b) => b.textContent.includes('Panel size'))`, 'the Panel size row');
    await press(`[...document.querySelectorAll('.account-panel [role=group][aria-label="Panel size"] [role=menuitemradio]')].find((b) => b.textContent.trim() === 'Large')`, 'Large');
    await key('Escape');
    await sleep(700);
    assert.equal((await bars()).order.length, 1, 'Panel size\'s bar is up');
    // (choosing Large widens the rail, so the page is measured once that bar is up)
    const before = await topOf(chloeCheckIn);
    await press(`document.querySelector('.shell-errbar button[aria-label="Dismiss"]')`, 'the bar\'s ×');
    await sleep(500);
    assert.equal((await bars()).order.length, 0, 'the bar is gone');
    const after = await topOf(chloeCheckIn);
    assert.ok(Math.abs(after - before) <= 1, `Chloe's Check in: ${Math.round(before)} → ${Math.round(after)}`);
  });
  await ev(`localStorage.removeItem('tkd.preview.userMetadata')`);

  // The lock screen (DevTools' switch: the fake database's PIN check still answers).
  await openApp();
  await network(false);
  await check('PC: the lock screen hides the bar; unlocking shows it again while still offline', async () => {
    assert.ok((await bars()).shown, 'before the lock');
    await ev('window.__tkdPreview.lockNow()');
    await sleep(900);
    assert.equal(await ev(`document.body.innerText.includes('Enter your PIN')`), true, 'the lock screen is up');
    assert.equal((await bars()).shown, false, 'hidden behind the lock screen');
    await typeDigits('2580');
    await sleep(1500);
    assert.equal(await ev(`Boolean(document.querySelector('.shell:not([hidden])'))`), true, 'unlocked');
    assert.ok((await bars()).shown, 'back after unlocking');
  });
  await network(true);
  await sleep(300);

  // Keyboard: Tab through a busy page with the bar showing.
  await openApp('testing/color-belt');
  await press(byText('November Children Testing'), 'November Children Testing');
  await sleep(1200);
  await network(false);
  await check('PC, Tab through the Color Belt event page with the bar showing: every focused control is below the bar, never under it (WCAG 2.4.11)', async () => {
    const b = await bars();
    assert.equal(b.count, 1);
    await ev(`document.activeElement && document.activeElement.blur()`);
    const seen = [];
    for (let i = 0; i < 40; i += 1) {
      await key('Tab');
      const f = await ev(`(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const r = el.getBoundingClientRect();
        const inPage = Boolean(el.closest('.shell-content'));
        return { name: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 30), top: r.top, bottom: r.bottom, inPage, inBar: Boolean(el.closest('.shell-errbar')) };
      })()`);
      if (!f) continue;
      assert.equal(f.inBar, false, `focus never goes into the bar (${f.name})`);
      if (f.inPage) {
        assert.ok(f.top >= b.bottom - 0.5, `"${f.name}" is below the bar (its top ${Math.round(f.top)}, the bar's bottom ${b.bottom})`);
        seen.push(f.name);
      }
    }
    assert.ok(seen.length >= 10, `went through the page's controls (${seen.length})`);
  });
  await network(true);
  await sleep(300);

  // With Panel size's "not saved" bar too.
  await openApp();
  await ev(`localStorage.removeItem('tkd.preview.userMetadata')`);
  await openApp();
  await ev('window.__tkdPreview.failNextPanelSave()');
  await press(`document.querySelector('button[aria-label="Account menu"]')`, 'the initials');
  await press(`[...document.querySelectorAll('.account-panel [role=menuitem]')].find((b) => b.textContent.includes('Panel size'))`, 'the Panel size row');
  await press(`[...document.querySelectorAll('.account-panel [role=group][aria-label="Panel size"] [role=menuitemradio]')].find((b) => b.textContent.trim() === 'Large')`, 'Large');
  await key('Escape');
  await sleep(600);
  await cut(true);
  await check('PC: with Panel size\'s "not saved" bar too, the offline bar comes first, 12px above it', async () => {
    const b = await bars();
    assert.deepEqual(b.order, ['offline', 'other']);
    assert.equal(b.gapBetween, 12);
    assertPlaced(b, 24);
  });
  await cut(false);
  await ev(`localStorage.removeItem('tkd.preview.userMetadata')`);

  // =========================== Tablet 820×1180 touch ===========================
  await size(820, 1180, true);
  await openApp('testing/color-belt');
  await press(byText('November Children Testing'), 'November Children Testing');
  await sleep(1200);
  await network(false);
  await check('Tablet (820×1180, touch), Color Belt event page: under the top bar, above the page, 24px from its edges, no sideways scroll', async () => {
    assertPlaced(await bars(), 24);
  });
  await network(true);
  await sleep(300);

  // =========================== Phones (touch) ===========================
  await size(390, 844, true);
  await openCampAt(470);
  await check('Phone (390×844, touch), the camp page: the 91px bar comes and goes, and Chloe Nguyen\'s Check in stays under the finger (v1.124)', async () => {
    await assertStill('Phone');
  });
  await check('Phone (390×844, touch), the camp page scrolled to its very end: the bar comes and goes, and the last Check in stays put', async () => {
    await toEnd();
    await sleep(300);
    await assertStill('Phone, at the end', lastCheckIn);
  });
  for (const [label, w, h] of [['Phone (390×844, touch)', 390, 844], ['Small phone (320×640, touch)', 320, 640]]) {
    await size(w, h, true);
    await openApp();
    await network(false);
    await check(`${label}, Home: under the top bar, 16px from the edges, the words wrap onto more lines, nothing cut off, no sideways scroll`, async () => {
      const b = await bars();
      assertPlaced(b, 16);
      assert.ok(b.height > 40, `it wraps onto more lines (height ${b.height}px)`);
      const bottom = await ev(`Math.round(document.querySelector('.bottombar').getBoundingClientRect().top)`);
      const pageBottom = await ev(`Math.round(document.querySelector('.shell-content').getBoundingClientRect().bottom)`);
      assert.ok(pageBottom <= bottom, 'the page scrolls between the bar and the bottom bar');
    });
    await network(true);
    await sleep(300);
  }
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
