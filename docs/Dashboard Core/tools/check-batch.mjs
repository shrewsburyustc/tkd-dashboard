// check-batch.mjs — the shared-parts batch's looks, measured on the parts page (parts.html#SH/looks):
//   - R3-06 (v1.048 (12)): the shared back link is 24px tall with a mouse; on touch its tap box is 44px
//     and the title under it sits at the same height at 1280 (mouse) and 820 (touch);
//   - L-06: a grip turned off is gray, has no grab cursor and is aria-disabled; a ready one is not;
//   - R1-08 (v1.103): a button, a primary button and a clickable tag marked aria-disabled show the
//     unavailable gray, while their usable twins don't, and the tag/button are still Tab stops;
//   - R4-09 / L-03: a clickable tag's click box is 24px tall with a mouse; on touch a button's tap box
//     reaches 44px (a click 3.5px above and below still lands on it);
//   - L-10: touch tabs and sort headers are at least 44px wide (the app's Camps and Testing tabs).
// Usage: node check-batch.mjs <preview address, e.g. http://localhost:5190/>
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

await withChrome(async (tab) => {
  const ev = (js) => tab.evaluate(js);
  async function open(w, h, touch) {
    await tab.size({ w, h, touch, scale: 1 });
    await tab.open('about:blank', 0);
    await tab.open(`${base}parts.html#SH/looks`, 300);
    for (let i = 0; i < 60; i += 1) {
      if (await ev(`Boolean(document.querySelector('.back-link'))`)) break;
      await sleep(100);
    }
    await sleep(300);
  }
  const measure = () =>
    ev(`(() => {
      const box = (el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: r.height, w: r.width }; };
      const back = document.querySelector('.back-link');
      const title = document.querySelector('[data-sh="title"]');
      const grips = [...document.querySelectorAll('[data-sh="grips"] .grip')].map((g) => { const s = getComputedStyle(g); return { color: s.color, cursor: s.cursor, aria: g.getAttribute('aria-disabled') }; });
      const look = (el) => { const s = getComputedStyle(el); return { bg: s.backgroundColor, color: s.color, cursor: s.cursor, tab: el.tabIndex }; };
      const buttons = [...document.querySelectorAll('[data-sh="buttons"] .btn')].map(look);
      const tags = [...document.querySelectorAll('[data-sh="tags"] .ttag')].map((t) => ({ ...look(t), after: getComputedStyle(t, '::after').position, box: box(t) }));
      return { back: box(back), title: box(title), grips, buttons, tags };
    })()`);
  const GRAY = 'rgb(138, 138, 133)'; // --color-disabled-text

  await check('PC 1280, mouse: the back link is 24px tall; the title sits under it', async () => {
    await open(1280, 800, false);
    const m = await measure();
    assert.ok(Math.abs(m.back.h - 24) <= 0.5, `back link ${m.back.h}px tall`);
    globalThis.pcTitle = m.title.top - (await ev(`document.querySelector('[data-sh="title"]').parentElement.getBoundingClientRect().top`));
  });
  await check('tablet 820, touch: the back link has a 44px tap box and the title sits at the same height as on PC', async () => {
    await open(820, 1180, true);
    const m = await measure();
    assert.ok(m.back.h >= 43.5, `back link tap box ${m.back.h}px`);
    const here = m.title.top - (await ev(`document.querySelector('[data-sh="title"]').parentElement.getBoundingClientRect().top`));
    assert.ok(Math.abs(here - globalThis.pcTitle) <= 1.5, `title ${here}px below the frame's top on touch, ${globalThis.pcTitle}px on PC`);
  });
  await check('grips: turned off = gray, no grab cursor, aria-disabled; ready = not', async () => {
    await open(1280, 800, false);
    const { grips } = await measure();
    assert.equal(grips[0].aria, null);
    assert.notEqual(grips[0].color, GRAY, 'a ready grip is not the unavailable gray');
    assert.equal(grips[0].cursor, 'grab');
    assert.equal(grips[1].aria, 'true');
    assert.equal(grips[1].color, GRAY);
    assert.notEqual(grips[1].cursor, 'grab');
  });
  await check('unavailable button, primary button and tag: gray and focusable; their usable twins are not gray', async () => {
    await open(1280, 800, false);
    const { buttons, tags } = await measure();
    for (const i of [1, 3]) {
      assert.equal(buttons[i].color, GRAY, `button ${i} words gray`);
      assert.equal(buttons[i].cursor, 'not-allowed');
      assert.ok(buttons[i].tab >= 0, 'still a Tab stop');
    }
    assert.notEqual(buttons[0].color, GRAY);
    assert.notEqual(buttons[2].color, GRAY);
    assert.equal(tags[1].color, GRAY, 'the busy tag is gray');
    assert.ok(tags[1].tab >= 0);
    assert.notEqual(tags[0].color, GRAY);
  });
  await check('the app, PC: Camps\' "$X due" tag draws 22px tall and its click box is 24px; busy, it is gray (R4-09, R1-08)', async () => {
    await tab.size({ w: 1280, h: 800, touch: false, scale: 1 });
    await tab.open('about:blank', 0);
    await tab.open(`${base}#camps`, 300);
    for (let i = 0; i < 60; i += 1) {
      const where = await ev(`document.querySelector('.shell:not([hidden])') ? 'shell' : document.getElementById('signin-email') ? 'signin' : 'wait'`);
      if (where === 'shell') break;
      if (where === 'signin') {
        await ev(`(() => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          for (const [id, value] of [['signin-email', 'preview@example.com'], ['signin-password', 'preview']]) { const input = document.getElementById(id); set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); }
          [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Sign in').click(); })()`);
        await sleep(1500);
      }
      await sleep(150);
    }
    await sleep(1200);
    await ev(`(() => { const el = [...document.querySelectorAll('.shell-content *')].find((e) => e.textContent.trim() === 'April Vacation Camp' && ![...e.children].some((c) => c.textContent.trim() === 'April Vacation Camp')); (el.closest('button, a, tr') || el).click(); })()`);
    for (let i = 0; i < 40; i += 1) {
      if (await ev(`Boolean(document.querySelector('.cp-paybtn'))`)) break;
      await sleep(200);
    }
    const m = await ev(`(() => { const t = document.querySelector('.cp-paybtn'); if (!t) return null; t.scrollIntoView({ block: 'center' }); const r = t.getBoundingClientRect();
      const at = (dy) => document.elementFromPoint(r.left + 12, dy) === t;
      return { h: r.height, above: at(r.top - 0.5), below: at(r.bottom + 0.5), farAbove: at(r.top - 3.5), farBelow: at(r.bottom + 3.5) }; })()`);
    assert.ok(m, 'a "$X due" tag is on the page');
    assert.ok(Math.abs(m.h - 22) <= 0.5, `tag ${m.h}px tall`);
    // The box is 24px: 1px beyond the 22px tag above and below (pass 2's correction: -1px gave 22).
    assert.equal(m.above && m.below, true, 'a click 0.5px above and below the tag hits it');
    assert.equal(m.farAbove || m.farBelow, false, '3.5px away does not');
    const gray = await ev(`(() => { const t = document.querySelector('.cp-paybtn'); t.setAttribute('aria-disabled', 'true'); const s = getComputedStyle(t); return { color: s.color, cursor: s.cursor }; })()`);
    assert.equal(gray.color, GRAY, 'busy: gray words');
    assert.equal(gray.cursor, 'not-allowed');
  });
  await check('the red Delete button stays red; only a Delete that is aria-disabled (busy) turns gray (finding 4)', async () => {
    await open(1280, 800, false);
    const looks = await ev(`(() => {
      const make = (extra) => { const b = document.createElement('button'); b.className = 'btn btn-delete'; b.textContent = 'Delete permanently'; if (extra) b.setAttribute('aria-disabled', 'true'); document.body.appendChild(b); const s = getComputedStyle(b); const out = { color: s.color, bg: s.backgroundColor }; b.remove(); return out; };
      return { ready: make(false), busy: make(true) };
    })()`);
    assert.notEqual(looks.ready.color, GRAY, 'a ready Delete is not gray');
    assert.notEqual(looks.ready.bg, 'rgb(247, 247, 245)', 'a ready Delete keeps its own background');
    assert.equal(looks.busy.color, GRAY, 'a busy Delete is gray, as v1.103 says');
  });
  await check('Camps\' "Delete permanently" (cp-btn-danger): red when ready, fully gray (words, edge and fill, hover too) when busy', async () => {
    await tab.size({ w: 1280, h: 800, touch: false, scale: 1 });
    await tab.open('about:blank', 0);
    await tab.open(`${base}#camps`, 300);
    for (let i = 0; i < 60; i += 1) {
      const where = await ev(`document.querySelector('.shell:not([hidden])') ? 'shell' : document.getElementById('signin-email') ? 'signin' : 'wait'`);
      if (where === 'shell') break;
      if (where === 'signin') {
        await ev(`(() => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          for (const [id, value] of [['signin-email', 'preview@example.com'], ['signin-password', 'preview']]) { const input = document.getElementById(id); set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); }
          [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Sign in').click(); })()`);
        await sleep(1500);
      }
      await sleep(150);
    }
    await sleep(1200);
    const looks = await ev(`(() => {
      const make = (busy) => { const b = document.createElement('button'); b.className = 'btn btn-sm cp-btn-danger'; b.textContent = 'Delete permanently'; if (busy) b.setAttribute('aria-disabled', 'true'); document.body.appendChild(b); const s = getComputedStyle(b); const out = { color: s.color, edge: s.borderTopColor, bg: s.backgroundColor, cursor: s.cursor }; b.remove(); return out; };
      return { ready: make(false), busy: make(true) };
    })()`);
    assert.equal(looks.ready.color, 'rgb(163, 45, 45)', 'ready: red words');
    assert.equal(looks.busy.color, GRAY, 'busy: gray words');
    assert.equal(looks.busy.edge, 'rgb(207, 207, 202)', 'busy: the gray edge (not red)');
    assert.equal(looks.busy.bg, 'rgb(247, 247, 245)', 'busy: the gray fill');
    assert.equal(looks.busy.cursor, 'not-allowed');
  });
  await check('L-10, touch 820: the page tabs and the sort headers are at least 44px wide', async () => {
    await tab.size({ w: 820, h: 1180, touch: true, scale: 1 });
    for (const hash of ['camps', 'testing/color-belt']) {
      await tab.open('about:blank', 0);
      await tab.open(`${base}#${hash}`, 300);
      for (let i = 0; i < 60; i += 1) {
        const where = await ev(`document.querySelector('.shell:not([hidden])') ? 'shell' : document.getElementById('signin-email') ? 'signin' : 'wait'`);
        if (where === 'shell') break;
        if (where === 'signin') {
          await ev(`(() => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
            for (const [id, value] of [['signin-email', 'preview@example.com'], ['signin-password', 'preview']]) { const input = document.getElementById(id); set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); }
            [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Sign in').click(); })()`);
          await sleep(1500);
        }
        await sleep(150);
      }
      await sleep(1500);
      const widths = await ev(`[...document.querySelectorAll('.shell-content .ttab, .shell-content .ev-sort')].map((b) => ({ words: b.textContent.trim().slice(0, 20), w: Math.round(b.getBoundingClientRect().width * 10) / 10 }))`);
      assert.ok(widths.length > 0, `${hash}: tabs or sort headers found`);
      const narrow = widths.filter((x) => x.w < 43.5);
      assert.deepEqual(narrow, [], `${hash}: narrower than 44px`);
    }
  });
  // A real key press (Chrome DevTools Protocol), as a person's hand
  async function press(name, code, vk) {
    const common = { key: name, code, windowsVirtualKeyCode: vk };
    await tab.cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...common });
    await tab.cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...common });
    await sleep(120);
  }
  await check('a locked ChoiceGroup: the arrow keys move nothing and the focus stays on its one Tab stop', async () => {
    await open(1280, 800, false);
    await tab.cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
    const first = await ev(`(() => { const r = document.querySelector('[data-sh="choices"] [role=radio]'); r.focus(); return { checked: r.getAttribute('aria-checked'), text: r.textContent }; })()`);
    assert.equal(first.checked, 'true');
    await press('ArrowRight', 'ArrowRight', 39);
    await press('ArrowDown', 'ArrowDown', 40);
    const after = await ev(`(() => ({ on: document.activeElement.textContent, checked: [...document.querySelectorAll('[data-sh="choices"] [role=radio]')].map((r) => r.getAttribute('aria-checked')) }))()`);
    assert.equal(after.on, first.text, 'focus did not move');
    assert.deepEqual(after.checked, ['true', 'false', 'false'], 'nothing was chosen');
  });
  await check('Paid by (compact) in a wide parent: its joined buttons are only as wide as their words, and the label is "Refunded by"', async () => {
    await open(1280, 800, false);
    const m = await ev(`(() => { const parent = document.querySelector('[data-sh="paidby"]'); const seg = parent.querySelector('.segmented'); return { parent: parent.getBoundingClientRect().width, seg: seg.getBoundingClientRect().width, label: parent.querySelector('.field-label').textContent }; })()`);
    assert.equal(m.label, 'Refunded by');
    assert.ok(m.seg < m.parent * 0.6, `the buttons are ${m.seg}px in a ${m.parent}px parent`);
  });
  await check('a busy clickable tag is white with a dashed edge (not only a lighter word); aria-busy keeps the busy cursor, a plain busy one the not-allowed cursor', async () => {
    await open(1280, 800, false);
    const looks = await ev(`(() => {
      const make = (busy, ariaBusy) => { const t = document.createElement('button'); t.className = 'ttag ev-tag-button'; t.textContent = '$140 due'; if (busy) t.setAttribute('aria-disabled', 'true'); if (ariaBusy) t.setAttribute('aria-busy', 'true'); document.body.appendChild(t); const s = getComputedStyle(t); const out = { style: s.borderTopStyle, bg: s.backgroundColor, cursor: s.cursor }; t.remove(); return out; };
      return { ready: make(false), blocked: make(true), busy: make(true, true) };
    })()`);
    assert.equal(looks.ready.style, 'solid');
    assert.equal(looks.blocked.style, 'dashed');
    assert.equal(looks.blocked.bg, 'rgb(255, 255, 255)');
    assert.equal(looks.blocked.cursor, 'not-allowed');
    assert.equal(looks.busy.cursor, 'progress');
  });
  await check('the Mark paid box at 390 touch, opened from a low tag, stays above the bottom bar (it flips above its button)', async () => {
    await tab.size({ w: 390, h: 844, touch: true, scale: 1 });
    await tab.open('about:blank', 0);
    await tab.open(`${base}#camps`, 300);
    for (let i = 0; i < 60; i += 1) {
      const where = await ev(`document.querySelector('.shell:not([hidden])') ? 'shell' : document.getElementById('signin-email') ? 'signin' : 'wait'`);
      if (where === 'shell') break;
      if (where === 'signin') {
        await ev(`(() => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          for (const [id, value] of [['signin-email', 'preview@example.com'], ['signin-password', 'preview']]) { const input = document.getElementById(id); set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); }
          [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Sign in').click(); })()`);
        await sleep(1500);
      }
      await sleep(150);
    }
    await sleep(1200);
    await ev(`(() => { const el = [...document.querySelectorAll('.shell-content *')].find((e) => e.textContent.trim() === 'April Vacation Camp' && ![...e.children].some((c) => c.textContent.trim() === 'April Vacation Camp')); (el.closest('button, a, tr') || el).click(); })()`);
    for (let i = 0; i < 40; i += 1) {
      if (await ev(`Boolean([...document.querySelectorAll('.cp-paybtn')].find((x) => /^\\$/.test(x.textContent)))`)) break;
      await sleep(200);
    }
    // Scroll so the tag sits 170px above the bottom of the page area: the box (about 175px) fits in the WINDOW below it, but not in the page area (it would cover the bottom bar)
    await ev(`(() => { const c = document.querySelector('.shell-content'); const t = ([...document.querySelectorAll('.cp-paybtn')].find((x) => /^\\$/.test(x.textContent))); c.scrollTop += t.getBoundingClientRect().top - (c.getBoundingClientRect().bottom - 170); })()`);
    await sleep(400);
    await ev(`([...document.querySelectorAll('.cp-paybtn')].find((x) => /^\\$/.test(x.textContent))).click()`);
    await sleep(700);
    const m = await ev(`(() => { const box = document.querySelector('.mpb'); const c = document.querySelector('.shell-content').getBoundingClientRect(); const t = ([...document.querySelectorAll('.cp-paybtn')].find((x) => /^\\$/.test(x.textContent))).getBoundingClientRect(); if (!box) return null; const b = box.getBoundingClientRect(); return { boxTop: b.top, boxBottom: b.bottom, pageBottom: c.bottom, tagTop: t.top }; })()`);
    assert.ok(m, 'the box opened');
    assert.ok(m.boxBottom <= m.pageBottom - 7.5, `the box ends at ${Math.round(m.boxBottom)}, the page area at ${Math.round(m.pageBottom)} (the bottom bar starts there)`);
    assert.ok(m.boxTop < m.tagTop, 'it flipped above the tag');
  });
  await check('touch 820 and 390: an amber bar\'s Retry (the failed-Undo bar) is a 44px tap target: a click 3.5px above and below it lands on it', async () => {
    for (const [w, h] of [[820, 1180], [390, 844]]) {
      await open(w, h, true);
      const m = await ev(`(() => { const b = document.querySelector('[data-sh="bar"] .errbar-retry'); const r = b.getBoundingClientRect(); const at = (x, y) => document.elementFromPoint(x, y)?.closest('.errbar-retry') === b; return { h: r.height, above: at(r.left + r.width / 2, r.top - 3.5), below: at(r.left + r.width / 2, r.bottom + 3.5) }; })()`);
      assert.ok(m.above && m.below, `${w}px wide: the Retry button is ${m.h}px tall; a click 3.5px above lands on it: ${m.above}, below: ${m.below}`);
    }
  });
  await check('Select: 44px tall on touch (36 with a mouse); grouped options show a heading (seen, not read), a choice says its group, and the arrow keys move by choice only', async () => {
    await open(1280, 800, false);
    const pc = await ev(`document.querySelector('#sh-select').getBoundingClientRect().height`);
    assert.ok(pc < 40, `with a mouse ${pc}px`);
    await open(820, 1180, true);
    const touch = await ev(`document.querySelector('#sh-select').getBoundingClientRect().height`);
    assert.ok(touch >= 43.5, `on touch ${touch}px`);
    await open(1280, 800, false);
    await ev(`document.querySelector('#sh-select').click()`);
    await sleep(300);
    const list = await ev(`(() => { const l = document.querySelector('.sel-list'); return { headings: [...l.querySelectorAll('.fa-group-label')].map((h) => h.textContent), options: l.querySelectorAll('[role=option]').length, optionLabel: l.querySelector('[role=option]').getAttribute('aria-label') }; })()`);
    assert.deepEqual(list.headings, ['Current', 'Planned']);
    assert.equal(list.options, 4, 'the headings are not choices');
    assert.equal(list.optionLabel, 'Current: Spring', 'a screen reader hears the group');
    const hidden = await ev(`[...document.querySelectorAll('.sel-list .fa-group-label')].every((h) => h.getAttribute('aria-hidden') === 'true')`);
    assert.equal(hidden, true, 'the heading rows are hidden from screen readers (the choices carry the group)');
    // Arrow keys: from the first choice, three presses reach the last choice and never a heading
    await ev(`document.querySelector('#sh-select').focus()`);
    const reached = [];
    for (let i = 0; i < 4; i += 1) {
      await press('ArrowDown', 'ArrowDown', 40);
      reached.push(await ev(`(() => { const id = document.querySelector('#sh-select').getAttribute('aria-activedescendant'); const el = id ? document.getElementById(id) : null; return el ? el.getAttribute('role') + ':' + el.textContent : null; })()`));
    }
    assert.ok(reached.every((r) => r && r.startsWith('option:')), `the arrow keys landed on ${reached.join(' | ')}`);
    assert.equal(reached.at(-1), 'option:Winter', 'and reached the last choice');
  });
  await check('tablet 820, touch: a button\'s tap box reaches 44px: a click 3.5px above and below still lands on it (L-03)', async () => {
    await open(820, 1180, true);
    const hit = await ev(`(() => { const b = document.querySelector('[data-sh="buttons"] .btn'); const r = b.getBoundingClientRect(); const a = document.elementFromPoint(r.left + 20, r.top - 3.5); const c = document.elementFromPoint(r.left + 20, r.bottom + 3.5); return [a === b, c === b, r.height]; })()`);
    assert.equal(hit[0], true, 'above');
    assert.equal(hit[1], true, 'below');
  });
  await check('PC: the back link inside a page that is a flex column is only as wide as itself, so a click right of it does not go back (v1.136)', async () => {
    await open(1280, 800, false);
    const w = await ev(`(() => {
      const back = document.querySelector('.back-link');
      const parent = back.parentElement;
      const was = [parent.style.display, parent.style.flexDirection];
      parent.style.display = 'flex'; parent.style.flexDirection = 'column'; // the shape of Camps' and Color Belt's pages
      const r = back.getBoundingClientRect();
      const out = { link: r.width, page: parent.getBoundingClientRect().width, align: getComputedStyle(back).alignSelf };
      [parent.style.display, parent.style.flexDirection] = was;
      return out;
    })()`);
    assert.equal(w.align, 'flex-start');
    assert.ok(w.link < w.page / 2, `the link is ${Math.round(w.link)}px in a ${Math.round(w.page)}px page`);
  });
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
