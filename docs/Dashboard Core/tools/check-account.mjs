// check-account.mjs — step 2's two screen changes, M14 and M17 (rulebook v1.027, v1.000, v1.143).
//   M17: while Hide private details is on, the account menu's "Staff accounts" is the unavailable look (aria-disabled,
//        still focusable) with the gray line "Off while private details are hidden.", choosing it does nothing, and the
//        Staff accounts page itself (open, or opened by its address) shows that line instead of the list.
//   M14: Change PIN and Change password join the unsaved-changes guard. Nothing typed: a click outside and Esc close
//        them (as every other dialog). Something typed: Esc and a click outside keep the dialog open with the amber note
//        "Unsaved changes. Save or cancel first."; the Cancel button always closes; on a phone the back arrow keeps it
//        open with the note and a "Discard changes" link that closes it. Nothing typed is kept after it closes.
// Only ever point it at `npm run dev:preview-mode` (the fake database: the password check there is "preview").
// Usage: node check-account.mjs <preview address, e.g. http://localhost:5277/>
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
const UNSAVED = 'Unsaved changes. Save or cancel first.';

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
    await ev(`window.__tkdPreview.setRole('admin')`);
    await sleep(300);
  }
  const setHidden = (on) =>
    ev(`(() => { ${on ? `localStorage.setItem('tkd.device.hidePayments', 'true')` : `localStorage.removeItem('tkd.device.hidePayments')`}; window.dispatchEvent(new CustomEvent('tkd:hide-payments')); })()`);
  const openMenu = async () => {
    await ev(`document.querySelector('button[aria-label="Account menu"]').click()`);
    await sleep(400);
  };
  const menuItem = (label) => `[...document.querySelectorAll('.account-panel [role=menuitem], .account-sheet [role=menuitem], [role=menu] [role=menuitem]')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(label)}))`;
  const key = async (k, code, vk) => {
    await tab.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk });
    await tab.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
    await sleep(250);
  };
  const dialogOpen = () => ev(`Boolean(document.querySelector('[role=dialog][aria-labelledby]'))`);
  const noteText = () => ev(`(() => { const n = document.querySelector('[role=dialog] .notice'); return n ? n.textContent.replace(/\\s+/g, ' ').trim() : null; })()`);
  const typeInto = (selector, value) =>
    ev(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; el.focus(); set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);

  await tab.size({ w: 1280, h: 800, touch: false, scale: 1 });

  await check('M17: Staff accounts is the unavailable look in the account menu while private details are hidden, with the gray line; choosing it does nothing', async () => {
    await openApp('');
    await setHidden(true);
    await sleep(300);
    await openMenu();
    const s = await ev(`(() => {
      const item = ${menuItem('Staff accounts')};
      if (!item) return null;
      const note = document.getElementById(item.getAttribute('aria-describedby') || 'none');
      const color = getComputedStyle(item).color;
      const hashBefore = location.hash;
      item.click();
      return { aria: item.getAttribute('aria-disabled'), note: note ? note.textContent.trim() : null, color, cursor: getComputedStyle(item).cursor, hashBefore, hashAfter: location.hash, focusable: item.tabIndex };
    })()`);
    assert.ok(s, 'the Staff accounts row is in the menu');
    assert.equal(s.aria, 'true');
    assert.equal(s.note, 'Off while private details are hidden.');
    assert.equal(s.cursor, 'not-allowed');
    assert.equal(s.hashBefore, s.hashAfter, 'choosing it does nothing');
    await ev(`${menuItem('Staff accounts')}.focus()`);
    assert.match(await ev(`document.activeElement.textContent`), /Staff accounts/, 'still focusable');
    await setHidden(false);
  });

  await check('M17: with the switch off Staff accounts works; turning it on while the page is open replaces the list with the gray line; the address alone shows the line too', async () => {
    await openApp('staff-accounts');
    await sleep(1200);
    assert.equal(await ev(`Boolean(document.querySelector('.sa-list'))`), true, 'the list shows with the switch off');
    await setHidden(true);
    await sleep(400);
    assert.equal(await ev(`Boolean(document.querySelector('.sa-list'))`), false, 'no list');
    assert.equal(await ev(`document.querySelector('.staffaccounts .sa-sub').textContent.trim()`), 'Off while private details are hidden.');
    await openApp('staff-accounts'); // opened by its address with the switch still on
    assert.equal(await ev(`Boolean(document.querySelector('.sa-list'))`), false, 'no list on a fresh open');
    assert.equal(await ev(`document.querySelector('.staffaccounts .sa-sub').textContent.trim()`), 'Off while private details are hidden.');
    await setHidden(false);
  });

  await check('M14, PC: Change password with nothing typed: a click outside and Esc close it', async () => {
    await openApp('');
    await openMenu();
    await ev(`${menuItem('Change password')}.click()`);
    await sleep(500);
    assert.equal(await dialogOpen(), true, 'it opens');
    await ev(`document.querySelector('.dialog-backdrop').click()`);
    await sleep(300);
    assert.equal(await dialogOpen(), false, 'a click outside closes it when nothing is typed');
    await openMenu();
    await ev(`${menuItem('Change password')}.click()`);
    await sleep(500);
    await key('Escape', 'Escape', 27);
    assert.equal(await dialogOpen(), false, 'Esc closes it when nothing is typed');
  });

  await check('M14, PC: Change password with something typed: Esc and a click outside keep it open with the note; Cancel closes it; nothing typed is kept', async () => {
    await openApp('');
    await openMenu();
    await ev(`${menuItem('Change password')}.click()`);
    await sleep(500);
    await typeInto('#change-password-current', 'secret-typed');
    await key('Escape', 'Escape', 27);
    assert.equal(await dialogOpen(), true, 'Esc keeps it open');
    assert.equal(await noteText(), UNSAVED);
    await ev(`document.querySelector('.dialog-backdrop').click()`);
    await sleep(300);
    assert.equal(await dialogOpen(), true, 'a click outside keeps it open');
    assert.equal(await noteText(), UNSAVED);
    await ev(`[...document.querySelectorAll('[role=dialog] .btn')].find((b) => b.textContent.trim() === 'Cancel').click()`);
    await sleep(300);
    assert.equal(await dialogOpen(), false, 'Cancel always closes it');
    await openMenu();
    await ev(`${menuItem('Change password')}.click()`);
    await sleep(500);
    assert.equal(await ev(`document.querySelector('#change-password-current').value`), '', 'nothing typed is kept after it closed');
    assert.equal(await noteText(), null, 'and no old note');
  });

  await check('M14, PC: Change PIN with the password typed is guarded too', async () => {
    await openApp('');
    await openMenu();
    await ev(`${menuItem('Change PIN')}.click()`);
    await sleep(500);
    await typeInto('#change-pin-password', 'abc');
    await key('Escape', 'Escape', 27);
    assert.equal(await dialogOpen(), true);
    assert.equal(await noteText(), UNSAVED);
  });

  await check('M14, phone: the back arrow keeps a typed Change password page open with the note and "Discard changes", which closes it', async () => {
    await tab.size({ w: 390, h: 844, touch: true, scale: 1 });
    await openApp('');
    await openMenu();
    await ev(`${menuItem('Change password')}.click()`);
    await sleep(500);
    await typeInto('#change-password-current', 'typed-on-phone');
    await ev(`document.querySelector('.dialog-page [aria-label="Back"]').click()`);
    await sleep(300);
    assert.equal(await dialogOpen(), true, 'the back arrow keeps it open');
    assert.match(await noteText(), /^Unsaved changes\. Save or cancel first\.\s*Discard changes$/);
    await ev(`[...document.querySelectorAll('.dialog-page .link-button')].find((b) => b.textContent.trim() === 'Discard changes').click()`);
    await sleep(300);
    assert.equal(await dialogOpen(), false, 'Discard changes closes it');
    // and with nothing typed the back arrow just closes it
    await openMenu();
    await ev(`${menuItem('Change password')}.click()`);
    await sleep(500);
    await ev(`document.querySelector('.dialog-page [aria-label="Back"]').click()`);
    await sleep(300);
    assert.equal(await dialogOpen(), false, 'nothing typed: the back arrow closes it');
  });
  await check('M14: the screen lock closes an open Change password at once, even with the note showing, and keeps nothing typed', async () => {
    await tab.size({ w: 1280, h: 800, touch: false, scale: 1 });
    await openApp('');
    await openMenu();
    await ev(`${menuItem('Change password')}.click()`);
    await sleep(500);
    await typeInto('#change-password-current', 'typed-before-lock');
    await key('Escape', 'Escape', 27);
    assert.equal(await noteText(), UNSAVED, 'the note is showing');
    await ev(`window.__tkdPreview.lockNow()`);
    await sleep(600);
    assert.equal(await dialogOpen(), false, 'the dialog is gone behind the lock screen');
    assert.equal(await ev(`document.body.textContent.includes('typed-before-lock') || [...document.querySelectorAll('input')].some((i) => i.value.includes('typed-before-lock'))`), false, 'nothing typed is left on the page');
    assert.equal(await ev(`JSON.stringify(history.state || {}).includes('typed-before-lock') || JSON.stringify(localStorage).includes('typed-before-lock') || JSON.stringify(sessionStorage).includes('typed-before-lock')`), false, 'nor in history or storage');
  });
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
