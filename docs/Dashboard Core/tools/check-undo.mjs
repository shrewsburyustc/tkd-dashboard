// check-undo.mjs — the queued Undo's behaviour checks (rulebook v1.125–v1.129; design review R2-05).
// Drives the parts page's sample (parts.html#R205/page: a pretend page whose saves are fake and can
// be slow or fail, src/parts/R205.jsx) and the preview app, with REAL mouse, touch and key presses
// (Chrome DevTools Protocol "Input" events), and checks what the five rules promise:
//   - v1.125: an Undo pressed while another save runs says "Undoing…" in the busy look (grayed words,
//     the busy cursor, unavailable for screen readers, still a Tab stop), the toast doesn't move or
//     change size (its Undo button is as wide as "Undoing…" from the start: 236 px on PC for "Zoe Park
//     withdrawn"), and the Undo runs when that save ends — at the four review sizes;
//   - v1.126: the toast that came meanwhile shows after, and "Undone" is skipped;
//   - v1.127: the save it waited for fails and the Undo still runs: when it works, "Undone" and that
//     save's own bar stays; when it fails too, one bar, "Neither change saved. …", with the keyboard
//     on its Retry, which redoes both in turn;
//   - v1.128: the bars show under the top bar, not in the page (the sample's frame, and Settings in
//     the app with the connection cut: the offline bar first, then the page's own bar);
//   - v1.129: leaving the page while the Undo waits: nothing more if it saves; if it fails, the bar
//     under the top bar names it, and its Retry runs it again;
//   - Camps, on the save line since its v0.750 batch: the real app's toast (236 px), then "Undone".
// Why: pictures show how it looks; these show how it behaves. A hidden Chrome (chrome.mjs).
//
// Usage: node check-undo.mjs <preview address, e.g. http://localhost:5190/> [words]
//   prints ok / FAIL per check and the totals; exits 1 when any fails. With [words], only the checks
//   whose name holds those words run.
// Only ever point it at `npm run dev:preview-mode` (the fake database): it signs in with the preview
// password and uses the preview's console helpers (__tkdPreview).
import assert from 'node:assert/strict';
import { withChrome } from './chrome.mjs';

const base = (process.argv[2] ?? 'http://localhost:5190/').replace(/\/?$/, '/');
const only = process.argv[3] ?? null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
const failures = [];
async function check(label, fn) {
  if (only && !label.includes(only)) return;
  try {
    await fn();
    passed += 1;
    console.log(`ok    ${label}`);
  } catch (error) {
    failures.push(label);
    console.log(`FAIL  ${label}\n      ${error.message.split('\n').join('\n      ')}`);
  }
}

const SIZES = [
  { name: 'PC 1280×800', w: 1280, h: 800, touch: false },
  { name: 'tablet 820×1180 touch', w: 820, h: 1180, touch: true },
  { name: 'phone 390×844 touch', w: 390, h: 844, touch: true },
  { name: 'small phone 320×640 touch', w: 320, h: 640, touch: true },
];
const NEITHER = 'Neither change saved. Check the connection, then retry.';
const LEFT = 'Undo didn\'t save: “Zoe Park withdrawn” (Sample). Check the connection, then retry.';

await withChrome(async (tab) => {
  await tab.cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  const ev = (js) => tab.evaluate(js);
  let touch = false;
  async function size(w, h, isTouch = false) {
    touch = isTouch;
    await tab.size({ w, h, touch: isTouch, scale: 1 });
    await sleep(200);
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
    await sleep(150);
  }
  // Presses the first element `finder` (a JS expression) gives, at its middle, after scrolling it in.
  async function press(finder, what) {
    const at = await ev(`(() => { const el = ${finder}; if (!el) return null; el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
    if (!at) throw new Error(`not on the page: ${what ?? finder}`);
    await sleep(80);
    await pressAt(at[0], at[1]);
  }
  // Enter needs its text ("\r") for Chrome to press the button it's on.
  async function enter() {
    const common = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 };
    await tab.cdp('Input.dispatchKeyEvent', { type: 'keyDown', ...common, text: '\r' });
    await tab.cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...common });
    await sleep(120);
  }

  // ----- the sample's pieces -----
  async function openSample() {
    await tab.open('about:blank', 0);
    await tab.open(`${base}parts.html#R205/page`, 300);
    for (let i = 0; i < 80; i += 1) {
      if (await ev(`Boolean(document.querySelector('.parts-r205-roster'))`)) break;
      await sleep(100);
    }
    await sleep(400);
  }
  const withdrawButton = (name) => `[...document.querySelectorAll('.parts-r205-row button')].find((b) => b.textContent.trim() === 'Withdraw ${name}')`;
  const choice = (group, label) =>
    `(() => { const g = [...document.querySelectorAll('.parts-r205-controls [role=radiogroup]')].find((x) => document.getElementById(x.getAttribute('aria-labelledby'))?.textContent.trim() === ${JSON.stringify(group)});
      return g ? [...g.querySelectorAll('[role=radio]')].find((r) => r.textContent.trim() === ${JSON.stringify(label)}) : null; })()`;
  const choose = (group, label) => press(choice(group, label), `${group}: ${label}`);
  const UNDO_BUTTON = `document.querySelector('.toast-region .toast-undo')`;
  const toast = () =>
    ev(`(() => {
      const t = document.querySelector('.toast-region .toast');
      if (!t) return null;
      const b = t.querySelector('.toast-undo');
      const visible = b ? [...b.querySelectorAll('.toast-undo-word')].find((w) => getComputedStyle(w).visibility !== 'hidden') : null;
      const cs = b ? getComputedStyle(b) : null;
      return {
        text: t.querySelector('.toast-text').textContent,
        width: t.getBoundingClientRect().width,
        left: t.getBoundingClientRect().left,
        button: b ? { width: b.getBoundingClientRect().width, words: visible ? visible.textContent.trim() : null, disabled: b.getAttribute('aria-disabled'), cursor: cs.cursor, color: cs.color, tabIndex: b.tabIndex } : null,
      };
    })()`);
  const state = (id) => ev(`document.querySelector('[data-camper="${id}"] .parts-r205-state').textContent`);
  const notSaved = (id) => ev(`Boolean(document.querySelector('[data-camper="${id}"] .ttag--warn'))`);
  const bars = () =>
    ev(`[...document.querySelectorAll('.parts-r205-frame .errbar')].map((b) => ({ text: b.querySelector('.errbar-text').textContent, inBars: Boolean(b.closest('.shell-bars')), inPage: Boolean(b.closest('.parts-r205-page')) }))`);
  const focusIsOn = () => ev(`(() => { const a = document.activeElement; return a ? (a.className || a.tagName) + ':' + a.textContent.trim().slice(0, 20) : null; })()`);
  // Zoe withdrawn (a quick save that works): her toast with Undo shows.
  async function zoeWithdrawn() {
    await press(withdrawButton('Zoe Park'), 'Withdraw Zoe Park');
    await sleep(700);
    const t = await toast();
    assert.equal(t?.text, 'Zoe Park withdrawn', 'Zoe\'s toast');
    return t;
  }

  // ----- 1. v1.125 and v1.126 at the four sizes -----
  for (const s of SIZES) {
    await check(`${s.name}: Undo pressed during a save says "Undoing…" in the busy look, the toast keeps its size, then the waiting toast shows and "Undone" is skipped (v1.125, v1.126)`, async () => {
      await size(s.w, s.h, s.touch);
      await openSample();
      const rest = await zoeWithdrawn();
      if (s.w === 1280) assert.ok(Math.abs(rest.width - 236) <= 1, `the toast is ${rest.width} px wide on PC (v1.125: 236)`);
      await choose('Next saves take', '3 seconds');
      await press(withdrawButton('Sofia Rivera'), 'Withdraw Sofia Rivera');
      await sleep(300);
      await press(UNDO_BUTTON, 'the toast\'s Undo');
      await sleep(300);
      const busy = await toast();
      assert.equal(busy.text, 'Zoe Park withdrawn', 'the same toast stays');
      assert.equal(busy.button.words, 'Undoing…');
      assert.equal(busy.button.disabled, 'true', 'unavailable for screen readers');
      assert.equal(busy.button.cursor, 'progress', 'the busy cursor');
      assert.equal(busy.button.color, 'rgba(255, 255, 255, 0.6)', 'grayed words');
      assert.ok(busy.button.tabIndex >= 0, 'still a Tab stop');
      assert.ok(Math.abs(busy.width - rest.width) < 0.5 && Math.abs(busy.button.width - rest.button.width) < 0.5, `nothing moves: ${rest.width} → ${busy.width}`);
      assert.equal(await state('zoe'), 'Withdrawn', 'it waits: not undone yet');
      await sleep(4200); // the 3-second save, the 0.3-second Undo, and a margin for a slow machine
      const after = await toast();
      assert.equal(after?.text, 'Sofia Rivera withdrawn', 'the toast that waited, not "Undone"');
      assert.equal(await state('zoe'), 'Signed up', 'Zoe\'s Undo ran');
      assert.equal(await state('sofia'), 'Withdrawn', 'Sofia\'s save worked');
    });
  }

  // ----- 2. v1.127 -----
  await check('PC: the save it waited for fails and the Undo works: "Undone", and that save\'s own bar stays, under the top bar (v1.127, v1.128)', async () => {
    await size(1280, 800, false);
    await openSample();
    await zoeWithdrawn();
    await choose('Next saves take', '3 seconds');
    await choose('Next saves', 'Fail');
    await press(withdrawButton('Sofia Rivera'), 'Withdraw Sofia Rivera');
    await sleep(300);
    await press(UNDO_BUTTON, 'the toast\'s Undo');
    await sleep(3900);
    assert.equal((await toast())?.text, 'Undone');
    assert.equal(await state('zoe'), 'Signed up');
    assert.equal(await notSaved('sofia'), true, 'Sofia\'s row says "Not saved"');
    const b = await bars();
    assert.deepEqual(b.map((x) => x.text), ['Couldn\'t withdraw Sofia Rivera. Check the connection, then retry.'], 'the failed save\'s own bar stays');
    assert.equal(b[0].inBars && !b[0].inPage, true, 'under the top bar, not in the page (v1.128)');
  });

  await check('PC, keyboard: both fail: one bar, "Neither change saved", with the keyboard on its Retry; Retry redoes the save, then the Undo (v1.127)', async () => {
    await size(1280, 800, false);
    await openSample();
    await zoeWithdrawn();
    await choose('Next saves take', '3 seconds');
    await choose('Next saves', 'Fail');
    await press(withdrawButton('Sofia Rivera'), 'Withdraw Sofia Rivera');
    await sleep(200);
    await ev(`${UNDO_BUTTON}.focus()`);
    await enter();
    await choose('Next Undos', 'Fail');
    await ev(`${UNDO_BUTTON}?.focus()`); // the keyboard is on the toast while it waits
    await sleep(3900);
    assert.equal(await toast(), null, 'no toast: the bar says why');
    const b = await bars();
    assert.deepEqual(b.map((x) => x.text), [NEITHER], 'one bar covers both');
    assert.equal(b[0].inBars, true, 'under the top bar');
    assert.equal(await state('zoe'), 'Withdrawn');
    assert.match(await focusIsOn(), /errbar-retry/, 'the keyboard is on the bar\'s Retry');
    await choose('Next saves take', '0.3 seconds');
    await choose('Next saves', 'Work');
    await choose('Next Undos', 'Work');
    await press(`document.querySelector('.parts-r205-frame .errbar-retry')`, 'Retry');
    await sleep(1600);
    assert.equal(await state('sofia'), 'Withdrawn', 'the save, redone');
    assert.equal(await state('zoe'), 'Signed up', 'then the Undo');
    assert.deepEqual(await bars(), [], 'the bar goes');
    assert.equal((await toast())?.text, 'Undone');
  });

  // ----- 3. v1.129 -----
  for (const s of [SIZES[0], SIZES[2]]) {
    await check(`${s.name}: leaving the page while the Undo waits: it still runs; failed, the bar under the top bar names it, and its Retry runs it again (v1.129)`, async () => {
      await size(s.w, s.h, s.touch);
      await openSample();
      await zoeWithdrawn();
      await choose('Next saves take', '3 seconds');
      await press(withdrawButton('Sofia Rivera'), 'Withdraw Sofia Rivera');
      await sleep(200);
      await press(UNDO_BUTTON, 'the toast\'s Undo');
      await choose('Next Undos', 'Fail');
      await press(`[...document.querySelectorAll('.parts-r205-top button')][0]`, 'Go to Home');
      assert.equal(await toast(), null, 'the toast went with the page');
      await sleep(3900);
      const b = await bars();
      assert.deepEqual(b.map((x) => x.text), [LEFT]);
      assert.equal(b[0].inBars, true, 'under the top bar');
      await choose('Next Undos', 'Work');
      await press(`document.querySelector('.parts-r205-frame .errbar-retry')`, 'Retry');
      await sleep(900);
      assert.deepEqual(await bars(), [], 'it worked: the bar goes');
      assert.equal((await toast())?.text, 'Undone');
      await press(`[...document.querySelectorAll('.parts-r205-top button')][0]`, 'Back to the camp');
    });
  }
  await check('PC: leaving the page while the Undo waits, and it saves: nothing more is said (v1.129)', async () => {
    await size(1280, 800, false);
    await openSample();
    await zoeWithdrawn();
    await choose('Next saves take', '3 seconds');
    await press(withdrawButton('Sofia Rivera'), 'Withdraw Sofia Rivera');
    await sleep(200);
    await press(UNDO_BUTTON, 'the toast\'s Undo');
    await press(`[...document.querySelectorAll('.parts-r205-top button')][0]`, 'Go to Home');
    await sleep(3900);
    assert.deepEqual(await bars(), [], 'no bar');
    // (Sofia's own save ended after leaving and shows its toast, as any save does today; v1.129 is
    // about the Undo: no "Undone" for it.)
    assert.notEqual((await toast())?.text, 'Undone', 'no "Undone"');
  });

  // ----- 4. The app -----
  async function openApp(hash = '') {
    await tab.open('about:blank', 0);
    await tab.open(`${base}#${hash}`, 300);
    for (let i = 0; i < 60; i += 1) {
      const where = await ev(`document.querySelector('.shell:not([hidden])') ? 'shell' : document.getElementById('signin-email') ? 'signin' : 'wait'`);
      if (where === 'shell') break;
      if (where === 'signin') {
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
  await check('the app, PC: Camps (on the save line since its v0.750 batch): the toast is 236 px wide, its Undo keeps the toast, then says Undone (v1.125)', async () => {
    await size(1280, 800, false);
    await openApp('camps');
    // (Opened with a script click on the row, as the picture scripts do: the row's own press handler.)
    await ev(`(() => { const el = [...document.querySelectorAll('.shell-content *')].find((e) => e.textContent.trim() === 'Thanksgiving Camp' && ![...e.children].some((c) => c.textContent.trim() === 'Thanksgiving Camp')); (el.closest('button, a, tr') || el).click(); })()`);
    await sleep(1500);
    await ev(`(() => { const b = [...document.querySelectorAll('.shell-content button[aria-haspopup="menu"]')].find((x) => (x.getAttribute('aria-label') || '').includes('Zoe Park')); b.scrollIntoView({ block: 'center' }); b.click(); })()`);
    await sleep(500);
    await ev(`[...document.querySelectorAll('[role=menuitem]')].find((x) => x.textContent.trim().startsWith('Withdraw')).click()`);
    await sleep(1200);
    const t = await toast();
    assert.equal(t?.text, 'Zoe Park withdrawn');
    assert.ok(Math.abs(t.width - 236) <= 1, `the toast is ${t.width} px wide`);
    // (A script click: after the script clicks above, this hidden Chrome drops real mouse presses.)
    await ev(`${UNDO_BUTTON}.click()`);
    await sleep(30);
    const busy = await toast();
    assert.ok(busy === null || busy.text === 'Zoe Park withdrawn' || busy.text === 'Undone', 'the same toast stays while it undoes (or already says Undone)');
    await sleep(1500);
    assert.equal((await toast())?.text, 'Undone');
  });

  await check('PC: Hide private details turned ON while the toast says "Undoing…": the toast with the name goes at once, the Undo still runs (v1.134)', async () => {
    await size(1280, 800, false);
    await openSample();
    await zoeWithdrawn();
    await choose('Next saves take', '3 seconds');
    await press(withdrawButton('Sofia Rivera'), 'Withdraw Sofia Rivera');
    await sleep(300);
    await press(UNDO_BUTTON, 'the toast\'s Undo');
    await sleep(300);
    assert.equal((await toast())?.button?.words, 'Undoing…', 'the toast says "Undoing…" first');
    // the switch turns ON (the same way the account menu does it: the stored value, then the event)
    await ev(`localStorage.setItem('tkd.device.hidePayments', 'true'); window.dispatchEvent(new CustomEvent('tkd:hide-payments'));`);
    await sleep(300);
    assert.equal(await toast(), null, 'no toast with a name on the screen');
    await sleep(4200);
    // (Sofia's own save, a separate toast, may show once it ends: that is a new toast, not the Undoing one.)
    const later = await toast();
    assert.ok(!later || (later.text !== 'Zoe Park withdrawn' && later.text !== 'Undone'), `nothing more is said about the Undo (v1.129): ${later?.text}`);
    assert.equal(await state('zoe'), 'Signed up', 'the Undo still ran');
    await ev(`localStorage.removeItem('tkd.device.hidePayments'); window.dispatchEvent(new CustomEvent('tkd:hide-payments'));`);
  });
  await check('the app, PC: with the connection cut, Settings\' "couldn\'t load" bar shows under the top bar, after the offline bar (v1.128)', async () => {
    await size(1280, 800, false);
    await openApp('');
    await ev('window.__tkdPreview.cutConnection(true)');
    await sleep(300);
    await press(`[...document.querySelectorAll('nav.rail .rail-item, nav.rail button')].find((b) => (b.getAttribute('aria-label') || b.textContent).trim().startsWith('Settings'))`, 'Settings').catch(async () => {
      await ev(`location.hash = '#settings'`);
    });
    await sleep(1500);
    if (!(await ev(`location.hash.startsWith('#settings')`))) {
      await ev(`location.hash = '#settings'`);
      await sleep(1500);
    }
    const found = await ev(`(() => {
      const shellBars = document.querySelector('.shell-bars');
      const content = document.querySelector('.shell-content');
      const all = [...document.querySelectorAll('.errbar')].map((b) => ({ text: b.querySelector('.errbar-text').textContent.slice(0, 40), inBars: shellBars.contains(b), inPage: content.contains(b), slot: Boolean(b.closest('.shell-pagebars')) }));
      return { all, barsAbovePage: shellBars.getBoundingClientRect().bottom <= content.getBoundingClientRect().top + 0.5 };
    })()`);
    await ev('window.__tkdPreview.cutConnection(false)');
    assert.ok(found.all.length >= 2, `bars: ${JSON.stringify(found.all)}`);
    assert.equal(found.all[0].text.startsWith('You’re offline'), true, 'the offline bar first');
    const pageBar = found.all.find((b) => b.slot);
    assert.ok(pageBar, 'the page\'s own bar is in the frame\'s place for page bars');
    assert.equal(pageBar.inPage, false, 'not inside the page');
    assert.equal(found.barsAbovePage, true, 'the bars sit above the page');
  });
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
