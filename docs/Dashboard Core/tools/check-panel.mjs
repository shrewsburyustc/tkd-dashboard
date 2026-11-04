// check-panel.mjs — Panel size's behaviour checks (rulebook v1.118; the approved mockup
// Mockups/SP-panel-size.png). Drives the preview app (fake database) with REAL mouse moves, clicks,
// taps and key presses (Chrome DevTools Protocol "Input" events, as a person's hand) and checks what
// the mockup promises:
//   - the three sizes at PC and tablet: widths, icon and name sizes, the name bubble on Standard PC,
//     the pill greyed on hover with Large and Largest, Testing keeping its name;
//   - the "Panel size" row: under This device; opens on the ticked size with the keyboard on it;
//     choosing closes the choices and keeps the menu open; not on a phone held upright, but on a
//     phone turned sideways;
//   - saved with the account: a reload opens at the saved size from the very first drawing; a size
//     saved on "another device" shows after a reload, or after a sign-in refresh; the older copy
//     Supabase re-sends when the tab is shown again can't undo it;
//   - a short window (1093×514, a 1366×768 laptop at 125%): the rail and the account menu scroll on
//     their own and the page never does; Testing's menu and the name bubble show in full with the
//     rail scrolled; the section you're on stays in view after a size change;
//   - a failed save: the amber bar under the top bar with the approved words, on every page, with
//     Retry and ×; the size stays on this device meanwhile; after ×, choosing it again saves it.
// Why: pictures show how it looks; these show how it behaves. A hidden Chrome (chrome.mjs).
//
// Usage: node check-panel.mjs <preview address, e.g. http://localhost:5190/>
//   prints ok / FAIL per check and the totals; exits 1 when any fails.
// Only ever point it at `npm run dev:preview-mode` (the fake database): it signs in with the
// preview password and uses the preview's console helpers (__tkdPreview).
import assert from 'node:assert/strict';
import { withChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5190/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NOT_SAVED = "Couldn't save your panel size, so your other devices keep the old one. Check the internet, then Retry.";
const SURFACE = 'rgb(247, 247, 245)'; // --color-surface, the gray hover highlight
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

const KEYS = { ArrowDown: 40, ArrowUp: 38, Enter: 13, Escape: 27, Tab: 9 };

await withChrome(async (tab) => {
  await tab.cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  // Records every class the rail has had since the page started, to prove there's no jump.
  await tab.cdp('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__railClasses = [];
      new MutationObserver(() => {
        const rail = document.querySelector('nav.rail');
        const list = window.__railClasses;
        if (rail && list[list.length - 1] !== rail.className) list.push(rail.className);
      }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });`,
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
    await sleep(700);
  }
  async function key(name, { shift = false } = {}) {
    const code = KEYS[name];
    const text = name === 'Enter' ? '\r' : undefined;
    const common = { key: name, code: name, windowsVirtualKeyCode: code, modifiers: shift ? 8 : 0 };
    await tab.cdp('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', ...common, ...(text ? { text } : {}) });
    await tab.cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...common });
    await sleep(150);
  }
  async function mouseTo(x, y) {
    await tab.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  }
  async function pressAt(x, y) {
    if (touch) {
      await tab.cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await sleep(60);
      await tab.cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await mouseTo(x, y);
      await tab.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await tab.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    }
    await sleep(350);
  }
  // The middle of the first element `finder` (a JS expression) gives, or null.
  async function centre(finder) {
    return ev(`(() => { const el = ${finder}; if (!el) return null; const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  }
  async function press(finder, what) {
    const at = await centre(finder);
    if (!at) throw new Error(`not on the page: ${what ?? finder}`);
    await pressAt(at[0], at[1]);
  }
  const AVATAR = `document.querySelector('button[aria-label="Account menu"]')`;
  const SIZE_ROW = `[...document.querySelectorAll('.account-panel [role=menuitem]')].find((b) => b.textContent.includes('Panel size'))`;
  const sizeChoice = (label) => `[...document.querySelectorAll('.account-panel [role=group][aria-label="Panel size"] [role=menuitemradio]')].find((b) => b.textContent.trim() === ${JSON.stringify(label)})`;
  const railItem = (label) => `[...document.querySelectorAll('nav.rail .rail-item')].find((b) => b.getAttribute('aria-label').startsWith(${JSON.stringify(label)}))`;
  // Picks a size through the account menu with real presses, then closes the menu with Esc.
  async function chooseSize(label) {
    await press(AVATAR, 'the initials');
    await press(SIZE_ROW, 'the Panel size row');
    await press(sizeChoice(label), `the ${label} choice`);
    await key('Escape');
    await sleep(300);
  }
  const saved = () => ev(`(JSON.parse(localStorage.getItem('tkd.preview.userMetadata') || '{}').metadata || {}).panel_size ?? null`);
  // The rail's numbers: width, first button, icon, name (font size, display, position).
  const rail = () => ev(`(() => {
    const r = document.querySelector('nav.rail');
    const cs = getComputedStyle(r);
    const b = r.querySelector('.rail-item');
    const l = getComputedStyle(b.querySelector('.rail-label'));
    const pill = b.querySelector('.rail-icon').getBoundingClientRect();
    return { cls: r.className, display: cs.display, width: r.getBoundingClientRect().width,
      button: [Math.round(b.getBoundingClientRect().width), Math.round(b.getBoundingClientRect().height)],
      icon: Math.round(b.querySelector('svg').getBoundingClientRect().width), pill: [Math.round(pill.width), Math.round(pill.height)],
      name: [l.display, l.position, l.fontSize], scrolls: r.scrollHeight - r.clientHeight, sideways: r.scrollWidth - r.clientWidth,
      pageScrolls: document.scrollingElement.scrollHeight - innerHeight };
  })()`);
  async function resetAccount() {
    await ev(`localStorage.removeItem('tkd.preview.userMetadata')`);
  }
  // Is the focused rail button's keyboard ring (2px gap + 2px line round it) inside the part of the
  // rail that shows (a rail that scrolls cuts off whatever lies outside it)?
  const ringWhole = () => ev(`(() => {
    const rail = document.querySelector('nav.rail');
    const b = document.activeElement;
    if (!rail.contains(b)) return { name: b?.getAttribute?.('aria-label') ?? b?.tagName, inRail: false };
    const r = rail.getBoundingClientRect();
    const top = r.top + rail.clientTop, left = r.left + rail.clientLeft;
    const clip = { top, left, bottom: top + rail.clientHeight, right: left + rail.clientWidth };
    const q = b.getBoundingClientRect();
    const whole = q.top - 4 >= clip.top - 0.5 && q.bottom + 4 <= clip.bottom + 0.5 && q.left - 4 >= clip.left - 0.5 && q.right + 4 <= clip.right + 0.5;
    return { name: b.getAttribute('aria-label'), inRail: true, whole };
  })()`);

  // =========================== PC, 1280×800, mouse ===========================
  await size(1280, 800);
  await openApp();
  await resetAccount();
  await openApp();

  await check('PC: a new person starts on Standard — 52px icon rail, 36×36 buttons, 18px icons, names hidden (the bubble)', async () => {
    const r = await rail();
    assert.equal(r.cls, 'rail rail--standard');
    assert.deepEqual([r.width, r.button, r.icon, r.name[0]], [52, [36, 36], 18, 'none']);
  });
  await check('PC Standard: pointing at Calendar shows its dark bubble 8px right of the button, level with it, above the page (position fixed) — also after the rail moved without being redrawn', async () => {
    // Hiding the preview's banner moves the rail up 26px without any redraw, scroll or resize: the
    // bubble must still find its icon (it is measured as the pointer arrives).
    await ev(`(() => { const s = document.createElement('style'); s.id = 'no-banner'; s.textContent = '.preview-banner{display:none!important}'; document.head.appendChild(s); })()`);
    await sleep(200);
    await mouseTo(600, 400);
    const at = await centre(railItem('Calendar'));
    await mouseTo(at[0], at[1]);
    await sleep(300);
    const b = await ev(`(() => { const btn = ${railItem('Calendar')}; const l = btn.querySelector('.rail-label'); const s = getComputedStyle(l); const r = l.getBoundingClientRect(); const br = btn.getBoundingClientRect();
      return { display: s.display, position: s.position, gap: Math.round(r.left - br.right), dy: Math.round((r.top + r.height / 2) - (br.top + br.height / 2)), bg: getComputedStyle(btn).backgroundColor }; })()`);
    await ev(`document.getElementById('no-banner').remove()`);
    await mouseTo(600, 400);
    await sleep(200);
    assert.deepEqual([b.display, b.position, b.gap, b.dy, b.bg], ['block', 'fixed', 8, 0, SURFACE]);
  });
  await check('PC Standard: pointing at Testing opens its page menu 20px right of the icon, at its top; Testing\'s bubble stays hidden', async () => {
    const at = await centre(railItem('Testing'));
    await mouseTo(at[0], at[1]);
    await sleep(600);
    const m = await ev(`(() => { const btn = ${railItem('Testing')}; const menu = document.querySelector('.rail-menu'); if (!menu) return null; const r = menu.getBoundingClientRect(); const br = btn.getBoundingClientRect();
      return { gap: Math.round(r.left - br.right), dy: Math.round(r.top - br.top), label: getComputedStyle(btn.querySelector('.rail-label')).display, position: getComputedStyle(menu).position }; })()`);
    assert.ok(m, 'the menu did not open');
    assert.deepEqual([m.gap, m.dy, m.label, m.position], [20, 0, 'none', 'fixed']);
    await mouseTo(700, 400);
    await sleep(600);
  });

  await check('PC: the account menu has "Panel size" right under "This device", showing Standard', async () => {
    await press(AVATAR, 'the initials');
    const rows = await ev(`[...document.querySelectorAll('.account-panel [role=menuitem], .account-panel [role=menuitemcheckbox]')].map((b) => b.textContent.trim())`);
    const i = rows.findIndex((t) => t.startsWith('This device'));
    assert.ok(i >= 0, 'no This device row');
    assert.equal(rows[i + 1], 'Panel sizeStandard');
    await key('Escape');
  });
  await check('PC keyboard: Enter on the initials, ↓ to Panel size, Enter → the ticked size has the focus; ↓ then Enter picks Large; focus back on the row; menu open; value "Large"', async () => {
    await ev(`${AVATAR}.focus()`);
    await key('Enter');
    for (let i = 0; i < 10; i += 1) {
      if ((await ev(`document.activeElement.textContent`)).startsWith('Panel size')) break;
      await key('ArrowDown');
    }
    await key('Enter');
    const first = await ev(`[document.activeElement.getAttribute('role'), document.activeElement.textContent.trim(), document.activeElement.getAttribute('aria-checked')]`);
    assert.deepEqual(first, ['menuitemradio', 'Standard', 'true']);
    await key('ArrowDown');
    assert.equal(await ev(`document.activeElement.textContent.trim()`), 'Large');
    await key('Enter');
    await sleep(300);
    const after = await ev(`({ focus: document.activeElement.textContent.trim(), open: Boolean(document.querySelector('.account-panel')), choices: Boolean(document.querySelector('.account-panel [role=group][aria-label="Panel size"]')), rail: document.querySelector('nav.rail').className })`);
    assert.deepEqual(after, { focus: 'Panel sizeLarge', open: true, choices: false, rail: 'rail rail--large' });
    await key('Escape');
    await sleep(800);
    assert.equal(await saved(), 'large');
  });
  await check('PC Large: 72px, names under the icons at 14px, 20px icons, 44×28 pill, 64×58 buttons (the rail fits: no scroll class)', async () => {
    const r = await rail();
    assert.equal(r.cls, 'rail rail--large');
    assert.deepEqual([r.width, r.icon, r.pill, r.name[0], r.name[1], r.name[2], r.button], [72, 20, [44, 28], 'block', 'static', '14px', [64, 58]]);
  });
  await check('PC Large, a normal window: the rail neither scrolls nor clips (as before), so every keyboard ring shows whole', async () => {
    const o = await ev(`(() => { const s = getComputedStyle(document.querySelector('nav.rail')); return [s.overflowX, s.overflowY]; })()`);
    assert.deepEqual(o, ['visible', 'visible']);
  });
  await check('PC Large: pointing greys only the icon\'s pill, not the whole button', async () => {
    const at = await centre(railItem('Calendar'));
    await mouseTo(at[0], at[1]);
    await sleep(300);
    const c = await ev(`(() => { const btn = ${railItem('Calendar')}; return [getComputedStyle(btn).backgroundColor, getComputedStyle(btn.querySelector('.rail-icon')).backgroundColor]; })()`);
    assert.deepEqual(c, ['rgba(0, 0, 0, 0)', SURFACE]);
  });
  await check('PC Large: Testing keeps its name while its page menu shows beside it', async () => {
    const at = await centre(railItem('Testing'));
    await mouseTo(at[0], at[1]);
    await sleep(600);
    const m = await ev(`(() => { const btn = ${railItem('Testing')}; const menu = document.querySelector('.rail-menu'); return { menu: Boolean(menu), name: getComputedStyle(btn.querySelector('.rail-label')).display, gap: menu ? Math.round(menu.getBoundingClientRect().left - btn.getBoundingClientRect().right) : null }; })()`);
    assert.deepEqual(m, { menu: true, name: 'block', gap: 20 });
    await mouseTo(700, 400);
    await sleep(600);
  });
  await check('PC: clicking the ticked size changes nothing and saves nothing; the choices close, the menu stays', async () => {
    const before = await ev(`localStorage.getItem('tkd.preview.userMetadata')`);
    await press(AVATAR, 'the initials');
    await press(SIZE_ROW, 'the Panel size row');
    await press(sizeChoice('Large'), 'Large');
    const s = await ev(`({ open: Boolean(document.querySelector('.account-panel')), choices: Boolean(document.querySelector('.account-panel [role=group][aria-label="Panel size"]')) })`);
    await key('Escape');
    await sleep(600);
    assert.deepEqual(s, { open: true, choices: false });
    assert.equal(await ev(`localStorage.getItem('tkd.preview.userMetadata')`), before);
  });
  await check('PC: opening "This device" closes the sizes, and the other way round', async () => {
    await press(AVATAR, 'the initials');
    await press(SIZE_ROW, 'the Panel size row');
    const device = `[...document.querySelectorAll('.account-panel [role=menuitem]')].find((b) => b.textContent.startsWith('This device'))`;
    await press(device, 'This device');
    const a = await ev(`[...document.querySelectorAll('.account-panel [role=group]')].map((g) => g.getAttribute('aria-label'))`);
    await press(SIZE_ROW, 'the Panel size row');
    const b = await ev(`[...document.querySelectorAll('.account-panel [role=group]')].map((g) => g.getAttribute('aria-label'))`);
    await key('Escape');
    await sleep(300);
    assert.deepEqual([a.filter((x) => x !== 'Admin' && x !== null), b.filter((x) => x !== 'Admin' && x !== null)], [['This device opens on'], ['Panel size']]);
  });
  await check('PC, a normal window: the dropdown never scrolls, even with Panel size open (it looks exactly as before)', async () => {
    await press(AVATAR, 'the initials');
    await press(SIZE_ROW, 'the Panel size row');
    const p = await ev(`(() => { const p = document.querySelector('.account-panel'); return { scrolls: p.classList.contains('account-panel--scrolls'), overflow: getComputedStyle(p).overflowY, maxHeight: p.style.maxHeight }; })()`);
    await key('Escape');
    await sleep(300);
    assert.deepEqual(p, { scrolls: false, overflow: 'visible', maxHeight: '' });
  });
  await check('PC Largest: 96px, 24px icons, 14px names, 56×32 pill, 88×64 buttons', async () => {
    await chooseSize('Largest');
    const r = await rail();
    assert.equal(r.cls, 'rail rail--largest');
    assert.deepEqual([r.width, r.icon, r.pill, r.name[2], r.button], [96, 24, [56, 32], '14px', [88, 64]]);
    await sleep(600);
    assert.equal(await saved(), 'largest');
  });
  await check('Saved with the account: a reload opens at Largest from the very first drawing (no jump)', async () => {
    await openApp();
    const classes = await ev(`window.__railClasses`);
    assert.deepEqual(classes, ['rail rail--largest']);
  });
  await check('Another device saves Standard: this open tab keeps Largest until the sign-in refreshes, then shows Standard', async () => {
    await ev(`__tkdPreview.panelSizeElsewhere('standard')`);
    await sleep(300);
    assert.equal((await rail()).cls, 'rail rail--largest');
    await ev(`__tkdPreview.refreshSignIn()`);
    await sleep(400);
    assert.equal((await rail()).cls, 'rail rail--standard');
  });
  await check('Another device saves Large: a reload shows Large (the account is asked at load; the saved sign-in still said Standard)', async () => {
    await ev(`__tkdPreview.panelSizeElsewhere('large')`);
    await openApp();
    const r = await rail();
    const classes = await ev(`window.__railClasses`);
    assert.equal(r.cls, 'rail rail--large', `classes seen: ${classes.join(' → ')}`);
    console.log(`      (classes seen while loading: ${classes.join(' → ')})`);
  });
  await check('Back to the tab: Supabase re-sends this browser\'s older saved copy (still Standard); the panel stays Large', async () => {
    await ev(`__tkdPreview.refocusTab()`);
    await sleep(300);
    assert.equal((await rail()).cls, 'rail rail--large');
  });

  // ----- A failed save -----
  await check('Failed save: the panel shows Largest at once; the amber bar shows under the top bar with the approved words, Retry and ×', async () => {
    await ev(`__tkdPreview.failNextPanelSave()`);
    await chooseSize('Largest');
    await sleep(600);
    const b = await ev(`(() => { const bar = document.querySelector('.shell-errbar .errbar'); if (!bar) return null; const top = document.querySelector('header.topbar').getBoundingClientRect(); const r = bar.getBoundingClientRect(); const main = document.querySelector('.shell-main').getBoundingClientRect();
      return { text: bar.querySelector('.errbar-text').textContent, role: bar.getAttribute('role'), retry: Boolean(bar.querySelector('.errbar-retry')), dismiss: bar.querySelector('.errbar-dismiss')?.getAttribute('aria-label'), gapUnderTopBar: Math.round(r.top - top.bottom), left: Math.round(r.left - main.left), right: Math.round(main.right - r.right) }; })()`);
    assert.ok(b, 'no bar');
    assert.deepEqual(b, { text: NOT_SAVED, role: 'alert', retry: true, dismiss: 'Dismiss', gapUnderTopBar: 12, left: 24, right: 24 });
    assert.equal((await rail()).cls, 'rail rail--largest');
    assert.equal(await saved(), 'large');
  });
  await check('Failed save: the bar stays when the person changes page (Calendar, then Home)', async () => {
    await press(railItem('Calendar'), 'Calendar');
    await sleep(800);
    const a = await ev(`Boolean(document.querySelector('.shell-errbar .errbar'))`);
    await press(railItem('Home'), 'Home');
    await sleep(800);
    const b = await ev(`Boolean(document.querySelector('.shell-errbar .errbar'))`);
    assert.deepEqual([a, b], [true, true]);
  });
  await check('Failed save, on a page with its own scrollbar (Schedule): the bar still ends where the page does (24px in from the page\'s edge, left of its scrollbar)', async () => {
    await press(railItem('Schedule'), 'Schedule');
    await sleep(1200);
    const m = await ev(`(() => { const main = document.querySelector('.shell-content'); const bar = document.querySelector('.shell-errbar .errbar'); if (!bar) return null; const mr = main.getBoundingClientRect(); const br = bar.getBoundingClientRect();
      return { pageScrollbar: main.offsetWidth - main.clientWidth, leftGap: Math.round(br.left - mr.left), rightGap: Math.round(mr.left + main.clientWidth - br.right) }; })()`);
    await press(railItem('Home'), 'Home');
    await sleep(800);
    assert.ok(m, 'no bar');
    assert.ok(m.pageScrollbar > 0, `Schedule has no scrollbar of its own here (${JSON.stringify(m)}): this check proves nothing`);
    assert.deepEqual([m.leftGap, m.rightGap], [24, 24], JSON.stringify(m));
  });
  await check('Failed save: Retry saves it and the bar goes', async () => {
    await press(`document.querySelector('.shell-errbar .errbar-retry')`, 'Retry');
    await sleep(900);
    assert.deepEqual([await ev(`Boolean(document.querySelector('.shell-errbar'))`), await saved()], [false, 'largest']);
  });
  await check('Failed save, then ×: the bar goes, the size stays on this device; a reload brings back the saved one', async () => {
    await ev(`__tkdPreview.failNextPanelSave()`);
    await chooseSize('Large');
    await sleep(700);
    assert.equal(await ev(`Boolean(document.querySelector('.shell-errbar .errbar'))`), true, 'no bar');
    await press(`document.querySelector('.shell-errbar .errbar-dismiss')`, '×');
    await sleep(300);
    const s = { bar: await ev(`Boolean(document.querySelector('.shell-errbar'))`), rail: (await rail()).cls, saved: await saved() };
    await openApp();
    assert.deepEqual({ ...s, afterReload: (await rail()).cls }, { bar: false, rail: 'rail rail--large', saved: 'largest', afterReload: 'rail rail--largest' });
  });
  await check('Failed save, then ×: choosing the ticked (unsaved) size again saves it', async () => {
    await ev(`__tkdPreview.failNextPanelSave()`);
    await chooseSize('Large');
    await sleep(700);
    await press(`document.querySelector('.shell-errbar .errbar-dismiss')`, '×');
    await sleep(300);
    const before = await saved();
    await chooseSize('Large');
    await sleep(800);
    assert.deepEqual({ before, after: await saved(), bar: await ev(`Boolean(document.querySelector('.shell-errbar'))`) }, { before: 'largest', after: 'large', bar: false });
    await chooseSize('Largest'); // as the checks below expect
    await sleep(600);
  });

  // =========================== A short window ===========================
  await size(1093, 514);
  await openApp('finance');
  await check('Short window, Largest, on Finance: the page never scrolls; the rail scrolls up and down only; Finance (the last section) is in view', async () => {
    const r = await rail();
    const fin = await ev(`(() => { const rail = document.querySelector('nav.rail').getBoundingClientRect(); const b = ${railItem('Finance')}.getBoundingClientRect(); return b.top >= rail.top && b.bottom <= rail.bottom; })()`);
    assert.deepEqual([r.cls, r.pageScrolls <= 0, r.scrolls > 0, r.sideways, fin], ['rail rail--largest rail--scrolls', true, true, 0, true]);
  });
  await check('Short window: the buttons narrow to the room the scrollbar leaves, with 4px each side for the keyboard ring', async () => {
    const m = await ev(`(() => { const rail = document.querySelector('nav.rail'); const inner = rail.clientWidth; const b = rail.querySelector('.rail-item').getBoundingClientRect(); const left = b.left - rail.getBoundingClientRect().left;
      return { roomEachSide: [Math.round(left), Math.round(inner - left - b.width)], scrollbar: rail.offsetWidth - rail.clientWidth - 1 }; })()`);
    assert.ok(m.roomEachSide[0] >= 4 && m.roomEachSide[1] >= 4, JSON.stringify(m));
  });
  await check('Short window: with the rail scrolled to the end, pointing at Testing shows its whole menu, on top of the page', async () => {
    await ev(`document.querySelector('nav.rail').scrollTop = 10000`);
    await sleep(300);
    const at = await centre(railItem('Testing'));
    await mouseTo(at[0], at[1]);
    await sleep(600);
    const m = await ev(`(() => { const menu = document.querySelector('.rail-menu'); if (!menu) return null; const r = menu.getBoundingClientRect(); const items = [...menu.querySelectorAll('.rail-menu-item')];
      const onTop = items.every((it) => { const q = it.getBoundingClientRect(); return menu.contains(document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2)); });
      return { inside: r.top >= 0 && r.bottom <= innerHeight && r.right <= innerWidth, onTop, count: items.length }; })()`);
    assert.ok(m, 'the menu did not open');
    assert.deepEqual([m.inside, m.onTop], [true, true]);
  });
  await check('Short window: a scroll of the rail that moves Testing\'s icon closes its open menu (the pointer stays on the menu)', async () => {
    const at = await centre(`document.querySelector('.rail-menu .rail-menu-item')`);
    await mouseTo(at[0], at[1]);
    await sleep(400);
    const before = await ev(`Boolean(document.querySelector('.rail-menu'))`);
    await ev(`document.querySelector('nav.rail').scrollTop -= 40`);
    await sleep(150);
    assert.deepEqual([before, await ev(`Boolean(document.querySelector('.rail-menu'))`)], [true, false]);
    await mouseTo(700, 300);
    await sleep(500);
  });
  await check('Short window: the account menu with Panel size open stays inside the window and scrolls on its own; Sign out is reached by scrolling it; the page doesn\'t move', async () => {
    await press(AVATAR, 'the initials');
    await press(SIZE_ROW, 'the Panel size row');
    const m = await ev(`(() => { const p = document.querySelector('.account-panel'); const r = p.getBoundingClientRect(); p.scrollTop = 10000;
      const so = [...p.querySelectorAll('[role=menuitem]')].find((b) => b.textContent.includes('Sign out')).getBoundingClientRect();
      return { bottomRoom: Math.round(innerHeight - r.bottom), scrolls: p.scrollHeight - p.clientHeight, signOutShown: so.top >= r.top && so.bottom <= r.bottom, pageScrolls: document.scrollingElement.scrollHeight - innerHeight }; })()`);
    await key('Escape');
    await sleep(300);
    assert.ok(m.bottomRoom >= 8 && m.scrolls > 0 && m.signOutShown && m.pageScrolls <= 0, JSON.stringify(m));
  });
  await check('Short window: after a size change, the section you\'re on (Finance) stays in view in the rail', async () => {
    await ev(`document.querySelector('nav.rail').scrollTop = 0`);
    await chooseSize('Standard');
    await chooseSize('Largest');
    const fin = await ev(`(() => { const rail = document.querySelector('nav.rail').getBoundingClientRect(); const b = ${railItem('Finance')}.getBoundingClientRect(); return [b.top >= rail.top, b.bottom <= rail.bottom]; })()`);
    assert.deepEqual(fin, [true, true]);
  });
  await check('Short window, Largest (the real height, no preview banner): Tab and Shift+Tab through the rail scroll it so every keyboard ring shows whole', async () => {
    await ev(`(() => { const s = document.createElement('style'); s.id = 'no-banner'; s.textContent = '.preview-banner{display:none!important}'; document.head.appendChild(s); })()`);
    await sleep(300);
    await ev(`document.querySelector('nav.rail').scrollTop = 0; ${railItem('Home')}.focus()`);
    await sleep(200);
    const cut = [];
    const note = async (how) => {
      const ring = await ringWhole();
      if (!ring.inRail || !ring.whole) cut.push(`${how} ${ring.name}: ${ring.inRail ? 'ring cut off' : 'left the rail'}`);
    };
    for (let i = 0; i < 7; i += 1) {
      await key('Tab');
      await note('Tab →');
    }
    for (let i = 0; i < 7; i += 1) {
      await key('Tab', { shift: true });
      await note('Shift+Tab →');
    }
    await ev(`document.getElementById('no-banner').remove(); document.activeElement.blur()`);
    await sleep(300);
    assert.deepEqual(cut, []);
  });
  await chooseSize('Standard'); // here, where the whole menu fits; the next window is shorter
  await size(1093, 330);
  await openApp();
  await check('Very short window (1093×330), Standard: the 52px rail scrolls too (its buttons keep 36px); scrolled to the end, Calendar\'s bubble shows in full beside its icon, above the page', async () => {
    await ev(`document.querySelector('nav.rail').scrollTop = 10000`);
    await sleep(300);
    const r = await rail();
    const at = await centre(railItem('Calendar'));
    await mouseTo(at[0], at[1]);
    await sleep(300);
    // (In a window this short the bubble's tip lies over the rail's thin scrollbar: it starts 8px past
    // the icon, as rule 2.3 says, and it is drawn above everything, so nothing cuts it off.)
    const b = await ev(`(() => { const btn = ${railItem('Calendar')}; const l = btn.querySelector('.rail-label'); const r = l.getBoundingClientRect(); const br = btn.getBoundingClientRect();
      return { shown: getComputedStyle(l).display, position: getComputedStyle(l).position, inWindow: r.left >= 0 && r.top >= 0 && r.bottom <= innerHeight && r.right <= innerWidth, gap: Math.round(r.left - br.right), dy: Math.round((r.top + r.height / 2) - (br.top + br.height / 2)) }; })()`);
    assert.ok(r.scrolls > 0, 'the rail does not scroll here');
    assert.equal(r.button[1], 36, `buttons squashed to ${r.button[1]}px`);
    assert.deepEqual(b, { shown: 'block', position: 'fixed', inWindow: true, gap: 8, dy: 0 });
    await mouseTo(700, 200);
  });

  // =========================== Tablet, 820×1180, touch ===========================
  await size(820, 1180, true);
  await openApp();
  await check('Tablet Standard: 72px, 64px-wide buttons, names 12px under 20px icons — today\'s tablet panel', async () => {
    const r = await rail();
    assert.deepEqual([r.cls, r.width, r.button[0], r.icon, r.name[2]], ['rail rail--standard', 72, 64, 20, '12px']);
  });
  await check('Tablet: the Panel size row is in the menu (a tap opens the three sizes)', async () => {
    await press(AVATAR, 'the initials');
    await press(SIZE_ROW, 'the Panel size row');
    const radios = await ev(`[...document.querySelectorAll('.account-panel [role=group][aria-label="Panel size"] [role=menuitemradio]')].map((b) => b.textContent.trim() + (b.getAttribute('aria-checked') === 'true' ? ' ✓' : ''))`);
    await press(sizeChoice('Large'), 'Large');
    await key('Escape');
    await sleep(300);
    assert.deepEqual(radios, ['Standard ✓', 'Large', 'Largest']);
  });
  await check('Tablet Large: 72px, names 14px', async () => {
    const r = await rail();
    assert.deepEqual([r.cls, r.width, r.icon, r.name[2]], ['rail rail--large', 72, 20, '14px']);
  });
  await check('Tablet Largest: 96px, 24px icons, names 14px', async () => {
    await chooseSize('Largest');
    const r = await rail();
    assert.deepEqual([r.cls, r.width, r.icon, r.name[2]], ['rail rail--largest', 96, 24, '14px']);
  });

  // =========================== Phones ===========================
  for (const [w, h] of [[390, 844], [320, 640]]) {
    await size(w, h, true);
    await openApp();
    await check(`Phone ${w}×${h}: no side panel, and the account sheet has no Panel size row (even with Largest saved)`, async () => {
      const r = await rail();
      await press(AVATAR, 'the initials');
      const rows = await ev(`[...document.querySelectorAll('.account-panel [role=menuitem]')].map((b) => b.textContent.trim())`);
      await key('Escape');
      await sleep(400);
      assert.equal(r.display, 'none');
      assert.equal(rows.some((t) => t.startsWith('Panel size')), false, rows.join(' | '));
      assert.ok(rows.some((t) => t.startsWith('This device')), 'This device is missing');
    });
  }
  await size(844, 390, true);
  await openApp();
  await check('Phone turned sideways (844×390): the tablet panel at Largest scrolls on its own, the page doesn\'t, and the menu has the row', async () => {
    const r = await rail();
    await press(AVATAR, 'the initials');
    const row = await ev(`Boolean(${SIZE_ROW})`);
    await key('Escape');
    assert.deepEqual([r.cls, r.scrolls > 0, r.pageScrolls <= 0, row], ['rail rail--largest rail--scrolls', true, true, true]);
  });
});

console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
