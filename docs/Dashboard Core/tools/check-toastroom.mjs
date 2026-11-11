// check-toastroom.mjs — the toast's own room (rulebook v1.042, v1.138; design review R2-04).
// While a toast shows, the page area (.shell-content) and an open ⋯ sheet (.tsheet) end above it, so its
// Undo never covers a button, a row's ⋯ or the last control; when the toast goes, the room goes too.
// It drives the preview app (Camps: Check in on the roster, which gives a toast with Undo) at
// the four review sizes and measures the boxes:
//   - before the toast: no room (no --toast-room), the page area reaches its usual bottom;
//   - with the toast: the page area's bottom edge is at least 8 px above the toast's top edge, and so is
//     a ⋯ sheet's (one is drawn here the way the app draws it: .tsheet-wrap > .tsheet);
//   - the control the keyboard is on is never left under the toast;
//   - after the toast goes (5 s), the room is gone again.
// Usage: node check-toastroom.mjs <preview address, e.g. http://localhost:5277/>
// Only ever point it at `npm run dev:preview-mode` (the fake database).
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

const SIZES = [
  { name: 'PC 1280×800', w: 1280, h: 800, touch: false },
  { name: 'tablet 820×1180 touch', w: 820, h: 1180, touch: true },
  { name: 'phone 390×844 touch', w: 390, h: 844, touch: true },
  { name: 'small phone 320×640 touch', w: 320, h: 640, touch: true },
];

await withChrome(async (tab) => {
  await tab.cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  const ev = (js) => tab.evaluate(js);
  async function openApp(hash) {
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
  const room = () =>
    ev(`(() => {
      const root = getComputedStyle(document.documentElement);
      const content = document.querySelector('.shell-content').getBoundingClientRect();
      const toast = document.querySelector('.toast-region .toast');
      return {
        room: root.getPropertyValue('--toast-room').trim(),
        windowRoom: root.getPropertyValue('--toast-room-window').trim(),
        contentBottom: content.bottom,
        marginBottom: getComputedStyle(document.querySelector('.shell-content')).marginBottom,
        toastTop: toast ? toast.getBoundingClientRect().top : null,
        toastText: toast ? toast.textContent : null,
      };
    })()`);

  for (const s of SIZES) {
    await check(`${s.name}: the page area and a ⋯ sheet end above the toast; the room goes with the toast (R2-04)`, async () => {
      await tab.size({ w: s.w, h: s.h, touch: s.touch, scale: 1 });
      await sleep(200);
      await openApp('camps');
      await ev(`(() => { const el = [...document.querySelectorAll('.shell-content *')].find((e) => e.textContent.trim() === 'Thanksgiving Camp' && ![...e.children].some((c) => c.textContent.trim() === 'Thanksgiving Camp')); (el.closest('button, a, tr') || el).click(); })()`);
      await sleep(1500);
      const before = await room();
      assert.equal(before.room, '', 'no room before a toast');
      assert.equal(before.marginBottom, '0px');
      // a toast with Undo: Check in on the roster (the family list on phones)
      await ev(`(() => { const b = [...document.querySelectorAll('.shell-content button')].find((x) => (x.getAttribute('aria-label') || '').startsWith('Check in ')); b.scrollIntoView({ block: 'center' }); b.click(); })()`);
      await sleep(1000);
      const during = await room();
      assert.ok(during.toastText && /checked in/i.test(during.toastText), `the toast: ${during.toastText}`);
      assert.ok(parseFloat(during.room) > 0, `--toast-room is set: "${during.room}"`);
      assert.ok(during.contentBottom <= during.toastTop - 7.5, `the page area ends at ${Math.round(during.contentBottom)}, the toast starts at ${Math.round(during.toastTop)}`);
      // a ⋯ sheet, drawn as the app draws it
      const sheet = await ev(`(() => {
        const wrap = document.createElement('div'); wrap.className = 'tsheet-wrap'; wrap.id = 'room-test-sheet';
        wrap.innerHTML = '<div class="tsheet-backdrop"></div><div class="tsheet"><div style="height:120px">items</div></div>';
        document.body.appendChild(wrap);
        const r = wrap.querySelector('.tsheet').getBoundingClientRect();
        const t = document.querySelector('.toast-region .toast').getBoundingClientRect();
        wrap.remove();
        return { sheetBottom: r.bottom, toastTop: t.top };
      })()`);
      assert.ok(sheet.sheetBottom <= sheet.toastTop - 7.5, `the sheet ends at ${Math.round(sheet.sheetBottom)}, the toast starts at ${Math.round(sheet.toastTop)}`);
      // a full-screen page (.dialog-page, outside .shell-content), as Dialog.jsx draws it on phones: (a) with its
      // buttons in the scrolling body, the body ends above the toast; (b) with a pinned bar (.dialog-page-submit,
      // sticky), the bar keeps its place and the toast sits above it (v1.139)
      const fullPage = await ev(`(async () => {
        const out = {};
        const make = (pinned) => {
          const page = document.createElement('div'); page.className = 'dialog-page tdialog-page'; page.id = 'room-test-page';
          page.innerHTML = '<div class="dialog-page-head"><h2 class="dialog-page-title">Test</h2></div><div class="dialog-page-body"><div style="height:1200px">long content</div>' + (pinned ? '<div class="dialog-page-submit"><button class="btn btn-primary">Save</button></div>' : '<button class="btn" id="room-test-last">History</button>') + '</div>';
          document.body.appendChild(page); return page;
        };
        const settle = () => { window.dispatchEvent(new Event('resize')); return new Promise((r) => setTimeout(r, 200)); };
        let page = make(false); await settle();
        const body = page.querySelector('.dialog-page-body').getBoundingClientRect();
        let toast = document.querySelector('.toast-region .toast').getBoundingClientRect();
        out.plain = { bodyBottom: body.bottom, toastTop: toast.top };
        page.remove(); await settle();
        page = make(true); await settle();
        const bar = page.querySelector('.dialog-page-submit').getBoundingClientRect();
        const body2 = page.querySelector('.dialog-page-body').getBoundingClientRect();
        toast = document.querySelector('.toast-region .toast').getBoundingClientRect();
        out.pinned = { barTop: bar.top, toastBottom: toast.bottom, bodyBottom: body2.bottom, windowBottom: window.innerHeight };
        page.remove(); await settle();
        return out;
      })()`);
      assert.ok(fullPage.plain.bodyBottom <= fullPage.plain.toastTop - 7.5, `a full-screen page's body ends at ${Math.round(fullPage.plain.bodyBottom)}, the toast starts at ${Math.round(fullPage.plain.toastTop)}`);
      assert.ok(fullPage.pinned.toastBottom <= fullPage.pinned.barTop - 7.5, `with a pinned bar the toast ends at ${Math.round(fullPage.pinned.toastBottom)}, the bar starts at ${Math.round(fullPage.pinned.barTop)}`);
      assert.ok(Math.abs(fullPage.pinned.bodyBottom - fullPage.pinned.windowBottom) <= 1, 'and the page with the pinned bar does not shrink (the bar keeps its place)');
      // the keyboard's control is not left under the toast: the last control in the page, focused
      const hidden = await ev(`(() => {
        const content = document.querySelector('.shell-content');
        const all = [...content.querySelectorAll('button, a[href], input, select, [tabindex="0"]')].filter((e) => e.offsetParent !== null);
        const last = all.at(-1); if (!last) return null;
        last.focus(); last.scrollIntoView({ block: 'nearest' });
        const r = last.getBoundingClientRect(); const t = document.querySelector('.toast-region .toast');
        if (!t) return false;
        const tr = t.getBoundingClientRect();
        return r.bottom > tr.top && r.top < tr.bottom && r.right > tr.left && r.left < tr.right;
      })()`);
      assert.notEqual(hidden, true, 'the last control is under the toast');
      await sleep(5600);
      const after = await room();
      assert.equal(after.toastText, null, 'the toast is gone');
      assert.equal(after.room, '', 'and the room with it');
      assert.equal(after.marginBottom, '0px');
    });
  }
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
