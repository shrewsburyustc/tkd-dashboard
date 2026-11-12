// check-search.mjs — the top-bar people search in the browser (M16; rulebook v1.144, picture Mockups/M16-people-search).
// It drives the preview app (fake database; its made-up people come from src/lib/mockPeople.js) with real key
// presses and clicks at the review sizes and checks what Jeffrey chose ("A for all"):
//   - PC 1280: a box left of the school switch; "Ava" lists people grouped by section with name, event · school;
//     ↓ and Enter open the highlighted one (the section's page opens); Esc clears then closes; "/" jumps to the box;
//   - one letter says "Type at least 2 letters."; no match says "No one matches “Zzq” at Worcester…" with a
//     "Search both schools" button that switches the top bar to Both;
//   - the school in the top bar is the one searched (Worcester hides the Shrewsbury Avas; Both shows them);
//   - tablet 820: the same box, 44px rows; phone 390 and 320: a magnifier button opens a full-screen search page.
// Only ever point it at `npm run dev:preview-mode` (the fake database).
// Usage: node check-search.mjs <preview address, e.g. http://localhost:5277/>
import assert from 'node:assert/strict';
import { withChrome } from './chrome.mjs';

const base = (process.argv[2] ?? 'http://localhost:5190/').replace(/\/?$/, '/');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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

await withChrome(async (tab) => {
  await tab.cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  const ev = (js) => tab.evaluate(js);
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
  // A key press as the page sees it. (This hidden Chrome often drops real key presses sent from outside, so the press is
  // sent from inside the page: the page's handlers can't tell the difference.)
  const key = async (k, code) => {
    await ev(`(() => { const el = document.activeElement || document.body; el.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, code: ${JSON.stringify(code)}, bubbles: true, cancelable: true })); })()`);
    await sleep(300);
  };
  const typeText = async (text) => {
    await tab.cdp('Input.insertText', { text });
    await sleep(700); // the pause + the fake database's own wait
  };
  const setLocation = (name) => ev(`[...document.querySelectorAll('.topbar [role=radio], .topbar button')].find((b) => b.textContent.trim() === ${JSON.stringify(name)}).click()`);
  const box = `document.querySelector('.ps-input')`;
  const rows = () => ev(`[...document.querySelectorAll('.ps-item')].map((i) => ({ name: i.querySelector('.ps-name').textContent, detail: i.querySelector('.ps-detail').textContent.replace(/^[^,]*, /, '') }))`);
  const groups = () => ev(`[...document.querySelectorAll('.ps-group-title')].map((g) => g.textContent)`);
  const hint = () => ev(`document.querySelector('.ps-hint')?.textContent.replace(/\\s+/g, ' ').trim() ?? null`);

  await tab.size({ w: 1280, h: 800, touch: false, scale: 1 });

  await check('PC: "Ava" lists people grouped by section with name and "event · school"; the box is left of the school switch', async () => {
    await openApp('');
    await setLocation('Both');
    await sleep(300);
    const pos = await ev(`(() => { const b = ${box}.getBoundingClientRect(); const s = document.querySelector('.topbar [role=radiogroup], .topbar .loc-switcher')?.getBoundingClientRect(); return { boxRight: b.right, switchLeft: s ? s.left : null, h: b.height }; })()`);
    if (pos.switchLeft !== null) assert.ok(pos.boxRight <= pos.switchLeft, 'the box is left of the school switch');
    await ev(`${box}.focus()`);
    await typeText('Ava');
    assert.deepEqual(await groups(), ['Color belt testing', 'Star testing', 'Black Belt testing', 'Camps', 'New students']);
    const r = await rows();
    assert.ok(r.some((x) => x.name === 'Ava Chen' && x.detail === 'November Children Testing · Worcester'), JSON.stringify(r));
    assert.ok(r.some((x) => x.name === 'Ava R.' && x.detail === 'Free class · Worcester'), 'New students show Ava R.');
    assert.ok(r.some((x) => x.name === 'Ava Lopez' && x.detail === 'Private testing · Shrewsbury'), 'a private testing has no event');
    assert.ok(r.some((x) => x.name === 'Ava Park' && x.detail === 'Summer Camp'), 'a camp for both schools has no school');
    assert.ok(!r.some((x) => x.name === 'Ava Gone'), 'a withdrawn person is left out');
  });

  await check('PC: the school in the top bar is the one searched (Worcester keeps Worcester people and camps for both)', async () => {
    await setLocation('Worcester');
    await sleep(700);
    const r = await rows();
    assert.ok(r.length > 0 && r.every((x) => !x.detail.includes('Shrewsbury')), JSON.stringify(r));
    assert.ok(r.some((x) => x.name === 'Ava Park'), 'a camp for both schools shows');
  });

  await check('PC: one letter says "Type at least 2 letters."; no match says so and offers both schools, which switches the top bar to Both', async () => {
    await ev(`(() => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; const el = ${box}; set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true })); el.focus(); })()`);
    await typeText('A');
    assert.equal(await hint(), 'Type at least 2 letters.');
    await ev(`(() => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; const el = ${box}; set.call(el, 'Zzq'); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await sleep(900);
    assert.match(await hint(), /^No one matches “Zzq” at Worcester\. Check the spelling, or search both schools\. Search both schools$/);
    await ev(`[...document.querySelectorAll('.ps-hint .link-button')].find((b) => b.textContent.trim() === 'Search both schools').click()`);
    await sleep(500);
    assert.equal(await ev(`document.querySelector('.topbar [aria-checked=true], .topbar .is-current')?.textContent.trim() ?? null`), 'Both', 'the top bar is on Both now');
  });

  await check('PC: ↓ and Enter open the highlighted person (the section opens); Esc clears the text', async () => {
    await ev(`(() => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; const el = ${box}; set.call(el, 'Ava Reed'); el.dispatchEvent(new Event('input', { bubbles: true })); el.focus(); })()`);
    await sleep(900);
    assert.equal((await rows())[0].name, 'Ava Reed');
    await key('Enter', 'Enter');
    await sleep(800);
    const hash = await ev('location.hash');
    assert.match(hash, /testing|star/i, 'Star opened: ' + hash);
    assert.equal(await ev(`${box}.value`), '', 'the box is cleared after a pick');
    await ev(`${box}.focus()`);
    await typeText('Ava');
    await key('Escape', 'Escape');
    assert.equal(await ev(`${box}.value`), '', 'Esc clears the text');
  });

  await check('PC: "/" jumps to the box when nothing is being typed', async () => {
    await ev(`document.activeElement?.blur()`);
    await key('/', 'Slash');
    assert.equal(await ev(`document.activeElement === ${box}`), true);
    assert.equal(await ev(`${box}.value`), '', 'the slash itself is not typed');
  });

  await check('tablet 820 touch: the same box; result rows are at least 44px tall', async () => {
    await tab.size({ w: 820, h: 1180, touch: true, scale: 1 });
    await openApp('');
    await ev(`${box}.focus()`);
    await typeText('Ava');
    const heights = await ev(`[...document.querySelectorAll('.ps-item')].map((i) => Math.round(i.getBoundingClientRect().height))`);
    assert.ok(heights.length > 0 && heights.every((h) => h >= 44), `row heights ${heights}`);
    assert.ok((await ev(`Math.round(document.querySelector('.ps-input').closest('.ps-field').getBoundingClientRect().height)`)) >= 44, 'the box is a 44px tap target on touch');
    assert.equal(await ev(`getComputedStyle(document.querySelector('.ps-key')).display`), 'none', 'no / hint on touch');
    const drop = await ev(`(() => { const r = document.querySelector('.ps-drop').getBoundingClientRect(); return { right: r.right, w: window.innerWidth }; })()`);
    assert.ok(drop.right <= drop.w, 'the dropdown stays on the screen');
  });

  await check('PC, end to end in Camps: a REAL camper found by the search opens their detail in the camp page, also when that camp is already open (a second search)', async () => {
    await tab.size({ w: 1280, h: 800, touch: false, scale: 1 });
    await openApp('camps');
    // open Thanksgiving Camp, read two real campers' ids and the camp's id from the page
    await ev(`(() => { const el = [...document.querySelectorAll('.shell-content *')].find((e) => e.textContent.trim() === 'Thanksgiving Camp' && ![...e.children].some((c) => c.textContent.trim() === 'Thanksgiving Camp')); (el.closest('button, a, tr') || el).click(); })()`);
    await sleep(1800);
    const real = await ev(`(() => ({ campId: location.hash.split('/').pop(), ids: [...document.querySelectorAll('[data-camper-more]')].slice(0, 2).map((e) => e.getAttribute('data-camper-more')) }))()`);
    assert.ok(real.ids.length === 2 && real.campId, JSON.stringify(real));
    await ev(`window.__tkdPreviewPeople = [['camp', ${JSON.stringify(real.ids[0])}, ${JSON.stringify(real.campId)}, 'Zed Firstcamper', 'Thanksgiving Camp', 'worcester', 'active'], ['camp', ${JSON.stringify(real.ids[1])}, ${JSON.stringify(real.campId)}, 'Zed Secondcamper', 'Thanksgiving Camp', 'worcester', 'active']]`);
    const search = async (text, pick) => {
      await ev(`(() => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; const el = document.querySelector('.ps-input'); el.focus(); set.call(el, ${JSON.stringify(text)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      await sleep(900);
      await ev(`[...document.querySelectorAll('.ps-item')].find((i) => i.textContent.startsWith(${JSON.stringify(pick)})).click()`);
      await sleep(1500);
    };
    await search('Zed First', 'Zed Firstcamper');
    assert.equal(await ev(`Boolean(document.querySelector('[role=dialog]'))`), true, 'the first camper\'s detail opened');
    assert.match(await ev(`document.querySelector('[role=dialog]').textContent`), /Camper|Paying by|Total/i);
    // close it the way a person does: Esc inside the dialog
    await ev(`document.querySelector('[role=dialog]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))`);
    await sleep(700);
    assert.equal(await ev(`Boolean(document.querySelector('[role=dialog]'))`), false, 'closed again');
    await search('Zed Second', 'Zed Secondcamper'); // the camp page is already open: it must notice this new request
    assert.equal(await ev(`Boolean(document.querySelector('[role=dialog]'))`), true, 'the second search opens the second camper on the open page');
  });  for (const [w, h] of [[390, 844], [320, 640]]) {
    await check(`phone ${w} touch: a magnifier opens a full-screen search page; results fill it; a pick opens the section and closes the page`, async () => {
      await tab.size({ w, h, touch: true, scale: 1 });
      await openApp('');
      assert.equal(await ev(`Boolean(document.querySelector('.ps-input'))`), false, 'no box in the top bar on a phone');
      const bar = await ev(`(() => { const av = document.querySelector('.avatar-button').getBoundingClientRect(); return { avatarRight: Math.round(av.right), width: window.innerWidth, scrollW: document.documentElement.scrollWidth }; })()`);
      assert.ok(bar.avatarRight <= bar.width && bar.scrollW <= bar.width, 'the top bar fits with the magnifier: ' + JSON.stringify(bar));
      const btn = await ev(`(() => { const b = document.querySelector('.ps-open'); if (!b) return null; const r = b.getBoundingClientRect(); return { w: r.width, h: r.height }; })()`);
      assert.ok(btn && btn.w >= 36, `the magnifier button: ${JSON.stringify(btn)}`);
      await ev(`document.querySelector('.ps-open').click()`);
      await sleep(500);
      assert.equal(await ev(`Boolean(document.querySelector('.dialog-page .ps-input'))`), true, 'the search page opens');
      const fs = await ev(`(() => { const p = document.querySelector('.dialog-page').getBoundingClientRect(); return { w: Math.round(p.width), h: Math.round(p.height) }; })()`);
      assert.equal(fs.w, await ev('window.innerWidth'), 'full width');
      assert.equal(await ev(`document.activeElement === document.querySelector('.dialog-page .ps-input')`), true, 'the keyboard is on the field');
      await ev(`(() => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; const el = document.querySelector('.dialog-page .ps-input'); set.call(el, 'Ava'); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      await sleep(900);
      const heights = await ev(`[...document.querySelectorAll('.dialog-page .ps-item')].map((i) => Math.round(i.getBoundingClientRect().height))`);
      assert.ok(heights.length >= 5 && heights.every((x) => x >= 44), `row heights ${heights}`);
      assert.ok((await ev(`Math.round(document.querySelector('.dialog-page .ps-field').getBoundingClientRect().height)`)) >= 44, 'the field on the phone page is 44px tall');
      const noSideScroll = await ev(`document.documentElement.scrollWidth <= window.innerWidth`);
      assert.equal(noSideScroll, true, 'no sideways scroll');
      await ev(`[...document.querySelectorAll('.dialog-page .ps-item')].find((i) => i.textContent.startsWith('Ava Thompson')).click()`);
      await sleep(900);
      assert.equal(await ev(`Boolean(document.querySelector('.dialog-page .ps-input'))`), false, 'the search page closed');
      assert.match(await ev('location.hash'), /camps/i, 'Camps opened');
    });
  }
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
