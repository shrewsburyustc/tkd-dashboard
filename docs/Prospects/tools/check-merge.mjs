// check-merge.mjs — the merged Prospects | Forms section and its "Forms" filter, in the browser.
// It drives the preview app (fake database, made-up people and forms) with real clicks at the review sizes and checks
// what Jeffrey approved on 2026-11-17 (pictures Merge-Page-1/2/3, answers A / A / A):
//   - one rail entry "Prospects" (no "Forms"); Prospects tab first, Forms second; phone More has no Forms;
//   - the old #forms address opens the Forms tab (and the bar is corrected to #prospects/forms);
//   - the Forms button lists each form with prospects (with how many); picking one narrows the stage numbers,
//     the line says "Showing n of m prospects from …", Show all clears it;
//   - the picks survive Prospects → Forms → Prospects, and reset on a reload;
//   - Esc closes the menu and gives focus back to the button; arrow keys move between the tabs.
// Only ever point it at `npm run dev:preview-mode` (the fake database).
// Usage: node check-merge.mjs <preview address, e.g. http://localhost:5173/>
import assert from 'node:assert/strict';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..', '..');
const { withChrome } = await import(pathToFileURL(join(repo, 'docs', 'Dashboard Core', 'tools', 'chrome.mjs')).href);

const base = (process.argv[2] ?? 'http://localhost:5173/').replace(/\/?$/, '/');
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
    await sleep(1400);
  }
  const text = (sel) => ev(`document.querySelector(${JSON.stringify(sel)})?.textContent.replace(/\\s+/g, ' ').trim() ?? null`);
  const hash = () => ev('window.location.hash');
  const clickText = (sel, label) => ev(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => x.textContent.trim() === ${JSON.stringify(label)}); if (!b) return false; b.click(); return true; })()`);
  const menuRows = () => ev(`[...document.querySelectorAll('[role=menu] [role=menuitemcheckbox]')].map((r) => ({ text: r.textContent.replace(/\\s+/g, ' ').trim(), on: r.getAttribute('aria-checked') === 'true' }))`);
  const stageNumbers = () => ev(`[...document.querySelectorAll('.pstage-n, .ptile:not(.ptile--today) b')].map((e) => parseInt(e.textContent, 10) || 0)`);
  const setLocation = (name) => ev(`[...document.querySelectorAll('.topbar [role=radio], .topbar button')].find((b) => b.textContent.trim() === ${JSON.stringify(name)}).click()`);

  await tab.size({ w: 1280, h: 800, touch: false, scale: 1 });

  await check('PC: the rail has Prospects but no Forms; the Prospects tab is first and selected', async () => {
    await openApp('prospects');
    await setLocation('Worcester');
    await sleep(900);
    const rail = await ev(`[...document.querySelectorAll('.rail-item')].map((i) => i.textContent.replace(/^[0-9]+|[0-9]+$/g, '').trim())`);
    assert.ok(rail.includes('Prospects'), JSON.stringify(rail));
    assert.ok(!rail.includes('Forms'), 'no Forms entry: ' + JSON.stringify(rail));
    const tabs = await ev(`[...document.querySelectorAll('[role=tablist] [role=tab]')].map((t) => t.textContent.trim() + ':' + t.getAttribute('aria-selected'))`);
    assert.deepEqual(tabs, ['Prospects:true', 'Forms:false']);
    assert.equal(await text('.ptitle'), 'Prospects');
    assert.equal(await ev('document.title'), 'Prospects · U.S. Taekwondo Center');
  });

  await check('PC: the Forms button shows "Forms: All forms"; its menu lists each form with its number of prospects, All forms ticked', async () => {
    assert.equal(await text('[data-forms-filter]'), 'Forms: All forms');
    await ev(`document.querySelector('[data-forms-filter]').click()`);
    await sleep(300);
    const rows = await menuRows();
    assert.equal(rows[0].text, 'All forms');
    assert.ok(rows[0].on, 'All forms is ticked');
    const named = rows.slice(1).map((r) => r.text);
    assert.ok(named.includes('Visitor Information · 2'), JSON.stringify(named));
    assert.ok(named.includes('Al-Hamra Special 4-Week Introductory Taekwondo Program · 2'), JSON.stringify(named));
    assert.ok(named.some((n) => n.startsWith('Free class — Instagram · ')), JSON.stringify(named));
    assert.ok(rows.slice(1).every((r) => !r.on));
  });

  let before;
  await check('PC: ticking Visitor Information narrows the stage numbers to its 2 families\' children, the button turns on and the line says so; the menu stays open', async () => {
    await ev(`document.querySelector('[data-forms-filter]').click()`); // close it, to read the numbers first
    await sleep(200);
    before = await stageNumbers();
    await ev(`document.querySelector('[data-forms-filter]').click()`);
    await sleep(300);
    await ev(`[...document.querySelectorAll('[role=menuitemcheckbox]')].find((r) => r.textContent.includes('Visitor Information')).click()`);
    await sleep(500);
    assert.equal(await ev(`document.querySelector('[role=menu]') !== null`), true, 'the menu stays open after a tick');
    const rows = await menuRows();
    assert.ok(rows.find((r) => r.text.startsWith('Visitor')).on && !rows[0].on);
    await ev(`document.querySelector('[data-forms-filter]').click()`); // close
    await sleep(300);
    const after = await stageNumbers();
    assert.equal(after.reduce((a, b) => a + b, 0), 2, `tiles ${JSON.stringify(after)} (before ${JSON.stringify(before)})`);
    assert.ok(before.reduce((a, b) => a + b, 0) > 2);
    assert.equal(await text('[data-forms-filter]'), 'Forms: Visitor Information');
    assert.equal(await ev(`document.querySelector('[data-forms-filter]').classList.contains('is-on')`), true);
    assert.match(await text('.pformsline'), /^Showing 2 of \d+ prospects from Visitor Information · Show all$/);
  });

  await check('PC: the Board follows the filter too (2 cards)', async () => {
    await clickText('.pview-btn', 'Board');
    await sleep(500);
    const cards = await ev(`document.querySelectorAll('.pbcard').length`);
    await clickText('.pview-btn', 'List'); // (the choice is remembered, so go back before anything can fail)
    await sleep(300);
    assert.equal(cards, 2, 'cards on the Board');
  });

  await check('PC: two forms picked say "2 of N forms" on the button and name both in the line', async () => {
    await ev(`document.querySelector('[data-forms-filter]').click()`);
    await sleep(300);
    await ev(`[...document.querySelectorAll('[role=menuitemcheckbox]')].find((r) => r.textContent.includes('Al-Hamra')).click()`);
    await sleep(400);
    await ev(`document.querySelector('[data-forms-filter]').click()`);
    await sleep(300);
    assert.match(await text('[data-forms-filter]'), /^Forms: 2 of \d forms$/);
    assert.match(await text('.pformsline'), /^Showing 4 of \d+ prospects from Al-Hamra Special 4-Week Introductory Taekwondo Program and Visitor Information · Show all$/);
  });

  await check('PC: Forms tab keeps the title "Prospects"; the address is #prospects/forms; its list shows; the New form button is there', async () => {
    await clickText('[role=tab]', 'Forms');
    await sleep(700);
    assert.equal(await hash(), '#prospects/forms');
    assert.equal(await text('.ptitle'), 'Prospects');
    assert.equal(await ev('document.title'), 'Forms · U.S. Taekwondo Center');
    const tabs = await ev(`[...document.querySelectorAll('[role=tablist] [role=tab]')].map((t) => t.textContent.trim() + ':' + t.getAttribute('aria-selected'))`);
    assert.deepEqual(tabs, ['Prospects:false', 'Forms:true']);
    assert.ok((await text('.forms')).includes('Visitor Information'), 'the forms list shows');
    assert.ok(await ev(`[...document.querySelectorAll('.btn-primary')].some((b) => b.textContent.includes('New form'))`), 'New form button');
    const current = await ev(`document.querySelector('.rail-item.is-current')?.textContent.replace(/^[0-9]+|[0-9]+$/g, '').trim()`);
    assert.equal(current, 'Prospects', 'the rail highlights Prospects on the Forms tab');
  });

  await check('PC: back on the Prospects tab the picked forms are still picked; a reload starts on All forms', async () => {
    await clickText('[role=tab]', 'Prospects');
    await sleep(900);
    assert.equal(await hash(), '#prospects');
    assert.match(await text('[data-forms-filter]'), /^Forms: 2 of \d forms$/);
    await openApp('prospects');
    await setLocation('Worcester');
    await sleep(900);
    assert.equal(await text('[data-forms-filter]'), 'Forms: All forms');
  });

  await check('PC: the old #forms address opens the Forms tab and the bar is corrected', async () => {
    await openApp('forms');
    assert.equal(await hash(), '#prospects/forms');
    assert.equal(await ev(`document.querySelector('[role=tab][aria-selected=true]')?.textContent.trim()`), 'Forms');
  });

  await check('PC: ← → move between the tabs and keep focus on the tab', async () => {
    await openApp('prospects');
    await ev(`document.getElementById('prospects-tab-prospects').focus()`);
    await ev(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))`);
    await sleep(700);
    assert.equal(await hash(), '#prospects/forms');
    assert.equal(await ev(`document.activeElement?.id`), 'prospects-tab-forms');
  });

  await check('PC: Esc closes the filter menu and puts focus back on the button; Show all clears the picks', async () => {
    await openApp('prospects');
    await setLocation('Worcester');
    await sleep(900);
    await ev(`document.querySelector('[data-forms-filter]').click()`);
    await sleep(300);
    await ev(`[...document.querySelectorAll('[role=menuitemcheckbox]')].find((r) => r.textContent.includes('Visitor Information')).click()`);
    await sleep(300);
    await ev(`document.querySelector('[role=menu]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))`);
    await sleep(300);
    assert.equal(await ev(`document.querySelector('[role=menu]') === null`), true, 'the menu closed');
    assert.equal(await ev(`document.activeElement?.hasAttribute('data-forms-filter')`), true, 'focus is on the button');
    await clickText('.pformsline button', 'Show all');
    await sleep(500);
    assert.equal(await text('[data-forms-filter]'), 'Forms: All forms');
    assert.equal(await ev(`document.querySelector('.pformsline') === null`), true);
  });

  await check('PC: on Both the menu names each form\'s school and the Shrewsbury list can be empty for a Worcester pick', async () => {
    await setLocation('Both');
    await sleep(1200);
    await ev(`document.querySelector('[data-forms-filter]').click()`);
    await sleep(300);
    const rows = (await menuRows()).map((r) => r.text);
    assert.ok(rows.includes('Visitor Information · Worcester · 2'), JSON.stringify(rows));
    await ev(`[...document.querySelectorAll('[role=menuitemcheckbox]')].find((r) => r.textContent.includes('Visitor Information')).click()`);
    await sleep(500);
    await ev(`document.querySelector('[data-forms-filter]').click()`);
    await sleep(300);
    const empty = await ev(`[...document.querySelectorAll('[data-prospects-school=shrewsbury] .plist-empty, [data-prospects-school=shrewsbury] .pbody')].map((e) => e.textContent.replace(/\\s+/g, ' ').trim()).join('|')`);
    assert.ok(empty.includes('No prospects from the picked forms.'), empty);
  });

  // ----- phone -----
  await tab.size({ w: 390, h: 844, touch: true, scale: 1 });

  await check('Phone: the bottom bar has Home, Calendar, Prospects, More; More has no Forms', async () => {
    await openApp('prospects');
    await setLocation('Worcester');
    await sleep(900);
    const bar = await ev(`[...document.querySelectorAll('.bottombar-item')].map((i) => i.textContent.replace(/^[0-9]+|[0-9]+$/g, '').trim())`);
    assert.deepEqual(bar, ['Home', 'Calendar', 'Prospects', 'More']);
    await ev(`[...document.querySelectorAll('.bottombar-item')].find((i) => i.textContent.includes('More')).click()`);
    await sleep(500);
    const more = await ev(`[...document.querySelectorAll('[role=menu] [role=menuitem], .more-item, .sheet button')].map((b) => b.textContent.trim())`);
    assert.ok(!more.includes('Forms'), JSON.stringify(more));
    await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  });

  await check('Phone: the Forms button opens a bottom sheet with 44px rows; ticking narrows the tiles', async () => {
    await openApp('prospects');
    await setLocation('Worcester');
    await sleep(900);
    await ev(`document.querySelector('[data-forms-filter]').click()`);
    await sleep(400);
    assert.ok(await ev(`document.querySelector('.tsheet') !== null`), 'a sheet');
    const h = await ev(`Math.round(document.querySelector('.tsheet [role=menuitemcheckbox]').getBoundingClientRect().height)`);
    assert.ok(h >= 44, `row height ${h}`);
    await ev(`[...document.querySelectorAll('.tsheet [role=menuitemcheckbox]')].find((r) => r.textContent.includes('Visitor Information')).click()`);
    await sleep(400);
    await ev(`[...document.querySelectorAll('.tsheet [role=menuitem]')].find((r) => r.textContent.trim() === 'Cancel').click()`);
    await sleep(400);
    const nums = await stageNumbers();
    assert.equal(nums.reduce((a, b) => a + b, 0), 2, JSON.stringify(nums));
  });

  await check('Phone: no sideways scroll at 390 and 320 on either tab', async () => {
    for (const [w, h] of [[390, 844], [320, 640]]) {
      await tab.size({ w, h, touch: true, scale: 1 });
      for (const hh of ['prospects', 'prospects/forms']) {
        await openApp(hh);
        await setLocation('Worcester');
        await sleep(700);
        // only this section's own content (the top bar's avatar button pokes out 6px at 320 wide on every page: not this work)
        const over = await ev(`(function () { var W = document.documentElement.clientWidth; var m = 0; document.querySelectorAll('.prospects *, .forms *').forEach(function (e) { var b = e.getBoundingClientRect(); if (b.width > 0 && b.right > m) m = b.right; }); return Math.round(m - W); })()`);
        assert.ok(over <= 0, `${hh} at ${w}: content overflows by ${over}px`);
      }
    }
  });
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
