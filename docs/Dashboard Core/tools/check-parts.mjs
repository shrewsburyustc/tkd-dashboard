// check-parts.mjs — the shared parts' behaviour checks: drives the parts page (parts.html) with REAL
// key presses and mouse clicks (Chrome DevTools Protocol "Input" events, as a person's keyboard and
// mouse) and checks what each part promises (Dashboard core step 1's proof, step 2):
//   - the time list's keys: one Tab stop, ↓ opens on the chosen time (in the middle), ↑ ↓ every 5
//     minutes with the 2px ring, Enter chooses, Esc closes the list only (also inside a dialog),
//     Home / End, "6" → 6:00 AM, "6" again → 6:00 PM, "1" then "0" → 10:00 AM, "10" again →
//     10:00 PM, Finance's "11" twice → 11:00 AM / 11:00 PM, "12" twice, Finance's 146 choices,
//     read-only while saving;
//   - the "are you sure?" box on top of a dialog: Esc, a click outside and Back close only the box,
//     focus goes back to its opener (also when the opener never took the focus, as in Safari), and
//     while it works all three wait;
//   - busy looks (both buttons gray, still focusable, nothing moves — also with busy words longer
//     than the usual ones, at the four sizes) and failure notes inside the boxes; the Compare
//     dialog's busy button is heard as "Keeping…";
//   - the Mark paid box's keys, first focus and Tab out (also inside a dialog); the count cards'
//     pressed state; the history line;
//   - Download QR code's hidden name: with two schools its own words first, then the school
//     ("Download QR code, Worcester", v1.111); with one school none;
//   - a real Download QR code: the file's name and that it is 1024 × 1024 pixels.
// Why: pictures show how a part looks; these show how it behaves. A hidden Chrome (chrome.mjs) with
// focus emulation (it behaves like a window that has the focus).
//
// Usage: node check-parts.mjs <preview address, e.g. http://localhost:5190/>
//   prints ok / FAIL per check and the totals; exits 1 when any fails.
// Only ever point it at `npm run dev:preview-mode`: the parts page refuses to draw otherwise.
import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { withChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5190/';
const downloads = join(tmpdir(), 'tkd-parts-downloads'); // where the real download lands
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

const KEYS = {
  ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39, Enter: 13, Escape: 27, Tab: 9, Home: 36, End: 35, ' ': 32,
  PageUp: 33, PageDown: 34,
};

await withChrome(async (tab) => {
  await tab.cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  await tab.size({ w: 1280, h: 800, touch: false, scale: 1 });

  // ----- helpers -----
  const ev = (js) => tab.evaluate(js);
  async function open(hash, settle = 1300) {
    await tab.open('about:blank', 0);
    await tab.open(`${base}parts.html#${hash}`, 300);
    for (let i = 0; i < 80; i += 1) {
      if (await ev(`Boolean(document.querySelector('.parts-page[data-state]'))`)) break;
      await sleep(100);
    }
    await sleep(settle);
  }
  async function key(name, { shift = false, alt = false } = {}) {
    const code = KEYS[name] ?? name.toUpperCase().charCodeAt(0);
    // Enter carries a carriage-return text, as a real keyboard does: that is what presses a focused button.
    const text = name.length === 1 ? name : name === 'Enter' ? String.fromCharCode(13) : undefined;
    const common = { key: name, code: name.length === 1 ? (/\d/.test(name) ? `Digit${name}` : `Key${name.toUpperCase()}`) : name, windowsVirtualKeyCode: code, modifiers: (alt ? 1 : 0) | (shift ? 8 : 0) };
    await tab.cdp('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', ...common, ...(text ? { text } : {}) });
    await tab.cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...common });
    await sleep(120);
  }
  async function clickAt(x, y) {
    await tab.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await tab.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await tab.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await sleep(250);
  }
  // Click the centre of the first element matching `selector` (whose words / name are `words`).
  async function click(selector, words) {
    const box = await ev(`(() => {
      const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => ${words === undefined ? 'true' : `(e.getAttribute('aria-label') === ${JSON.stringify(words)} || e.textContent.trim() === ${JSON.stringify(words)})`});
      if (!el) return null;
      el.scrollIntoView({ block: 'nearest' });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    if (!box) throw new Error(`nothing to click: ${selector} ${words ?? ''}`);
    await clickAt(box.x, box.y);
  }
  const focused = () => ev(`(() => { const a = document.activeElement; return a ? (a.getAttribute('aria-label') ?? a.textContent.trim()) : null; })()`);
  const dialogs = () => ev(`[...document.querySelectorAll('[role=dialog],[role=alertdialog]')].filter((d) => !d.classList.contains('mpb')).map((d) => d.querySelector('h2')?.textContent ?? '')`);
  const fieldText = (label) => ev(`(() => { const f = [...document.querySelectorAll('.field')].find((x) => x.querySelector('.field-label')?.textContent === ${JSON.stringify(label)}); return f?.querySelector('.fa-value')?.textContent ?? null; })()`);
  const activeOption = () => ev(`(() => { const c = document.activeElement; const id = c?.getAttribute('aria-activedescendant'); return id ? document.getElementById(id)?.textContent : null; })()`);
  const expanded = () => ev(`document.activeElement?.getAttribute('aria-expanded')`);

  // ===================== M8 — the time list's keys =====================
  await open('M8/closed', 600);
  await check('M8: one Tab stop per field; ↓ opens the list on the chosen time (4:40 PM)', async () => {
    await ev(`[...document.querySelectorAll('[role=combobox]')][1].focus()`);
    assert.equal(await expanded(), 'false');
    await key('ArrowDown');
    assert.equal(await expanded(), 'true');
    assert.equal(await activeOption(), '4:40 PM');
    const middle = await ev(`(() => { const list = document.querySelector('.fa-list:not([hidden])'); const sel = list.querySelector('[aria-selected=true]'); const top = sel.offsetTop - list.scrollTop; return Math.abs(top + sel.offsetHeight / 2 - list.clientHeight / 2) < sel.offsetHeight; })()`);
    assert.ok(middle, 'the chosen time is in the middle of the list');
  });
  await check('M8: ↓ ↑ move one row (every 5 minutes); the row has the 2px blue ring', async () => {
    await key('ArrowDown');
    assert.equal(await activeOption(), '4:45 PM');
    await key('ArrowDown');
    assert.equal(await activeOption(), '4:50 PM');
    await key('ArrowUp');
    assert.equal(await activeOption(), '4:45 PM');
    const ring = await ev(`getComputedStyle(document.querySelector('.fa-option.is-active')).boxShadow`);
    assert.match(ring, /0px 0px 0px 2px inset/, ring);
  });
  await check('M8: Enter chooses and closes; the field says the time with PM', async () => {
    await key('Enter');
    assert.equal(await expanded(), 'false');
    assert.equal(await fieldText('Ends'), '4:45 PM');
  });
  await check('M8: typing a number jumps to that hour — "6" → 6:00 AM, "6" again → 6:00 PM', async () => {
    await key('6'); // closed: typing opens the list and jumps
    assert.equal(await expanded(), 'true');
    assert.equal(await activeOption(), '6:00 AM');
    await sleep(600); // a new press, not "66"
    await key('6');
    assert.equal(await activeOption(), '6:00 PM');
    await key('6'); // quickly: "66" = 6 again → round to 6:00 AM
    assert.equal(await activeOption(), '6:00 AM');
    await sleep(600);
    await key('1');
    assert.equal(await activeOption(), '1:00 PM');
    await key('0'); // "10"
    assert.equal(await activeOption(), '10:00 AM');
  });
  await check('M8: Esc closes the list only and changes nothing', async () => {
    await key('Escape');
    assert.equal(await expanded(), 'false');
    assert.equal(await fieldText('Ends'), '4:45 PM');
    assert.equal(await ev(`Boolean(document.querySelector('.parts-page'))`), true);
  });
  await check('M8: Home / End, and a click on a time chooses it', async () => {
    await key('End');
    assert.equal(await activeOption(), '10:00 PM');
    await key('Home');
    assert.equal(await activeOption(), '6:00 AM');
    await key('Escape');
    await click('[role=combobox]', undefined); // the first field (Starts)
    await click('.fa-list:not([hidden]) [role=option]', '4:20 PM');
    assert.equal(await fieldText('Starts'), '4:20 PM');
  });
  await open('M8/empty', 1000);
  await check("M8: Finance's list — Off first then 11:00 AM … 11:00 PM (146); nothing chosen reads 'Choose a time'", async () => {
    const options = await ev(`[...document.querySelectorAll('.fa-list:not([hidden]) [role=option]')].map((o) => o.textContent)`);
    assert.equal(options.length, 146);
    assert.equal(options[0], 'Off');
    assert.equal(options[1], '11:00 AM');
    assert.equal(options[145], '11:00 PM');
    assert.equal(await fieldText('Start time'), 'Choose a time');
    const gray = await ev(`getComputedStyle([...document.querySelectorAll('.fa-value')][0]).color`);
    assert.equal(gray, 'rgb(107, 107, 107)', gray);
  });
  await open('M8/saving', 600);
  await check('M8: read-only while saving — it does not open', async () => {
    await ev(`[...document.querySelectorAll('[role=combobox]')][0].focus()`);
    await key('ArrowDown');
    assert.equal(await expanded(), 'false');
  });
  // Two-digit hours typed twice (design review D1): each number typed quickly ("1" then "0"), then a
  // pause longer than the half second the list keeps what was typed.
  async function typeNumber(digits) {
    for (const digit of digits) await key(digit);
    await sleep(650);
  }
  await open('M8/closed', 600);
  await check('M8: "10" then "10" again → 10:00 AM, then 10:00 PM; "12" twice stays on 12:00 PM', async () => {
    await ev(`[...document.querySelectorAll('[role=combobox]')][1].focus()`); // Ends, 4:40 PM
    await typeNumber('10');
    assert.equal(await activeOption(), '10:00 AM');
    await typeNumber('10');
    assert.equal(await activeOption(), '10:00 PM');
    await typeNumber('10');
    assert.equal(await activeOption(), '10:00 AM', 'and round again');
    await typeNumber('12');
    assert.equal(await activeOption(), '12:00 PM');
    await typeNumber('12');
    assert.equal(await activeOption(), '12:00 PM', 'noon is the only 12 on 6 AM–10 PM');
    await typeNumber('66'); // "6" then "6" quickly: 6:00 AM, then 6 again → 6:00 PM (unchanged)
    assert.equal(await activeOption(), '6:00 PM', '"66" unchanged');
    await key('Escape');
  });
  await open('M8/empty', 1000);
  await check('M8: Finance — "11" then "11" again → 11:00 AM, then 11:00 PM; "12" twice → 12:00 PM', async () => {
    await ev(`[...document.querySelectorAll('[role=combobox]')][1].focus()`); // Monday reminder, open on Off
    assert.equal(await activeOption(), 'Off');
    await typeNumber('11');
    assert.equal(await activeOption(), '11:00 AM');
    await typeNumber('11');
    assert.equal(await activeOption(), '11:00 PM');
    await typeNumber('12');
    assert.equal(await activeOption(), '12:00 PM');
    await typeNumber('12');
    assert.equal(await activeOption(), '12:00 PM');
  });

  await open('M8/indialog', 900);
  await check('M8: inside a dialog, Esc closes the list only — the dialog stays', async () => {
    await ev(`document.querySelector('[role=dialog] [role=combobox]').focus()`);
    await key('ArrowDown');
    assert.equal(await expanded(), 'true');
    await key('Escape');
    assert.equal(await expanded(), 'false');
    assert.deepEqual(await dialogs(), ['Add time slot']);
    await key('Escape'); // now the dialog
    assert.deepEqual(await dialogs(), []);
  });

  // ===================== M2 — on top of a dialog =====================
  async function openOnTop() {
    await ev(`document.querySelector('[data-open-ask]').focus()`);
    await key('Enter');
    await sleep(300);
  }
  await open('M2/ontop', 900);
  await check('M2 on top: Enter on "Delete permanently…" opens the box on top; first focus on Keep student', async () => {
    await openOnTop();
    assert.deepEqual(await dialogs(), ['Edit details', 'Delete Owen Reed permanently?']);
    assert.equal(await focused(), 'Keep student');
    assert.equal(await ev(`history.state?.tkdDialog ? 'dialog step' : 'none'`), 'dialog step');
  });
  await check('M2 on top: Esc closes only the box; focus goes back to the opener', async () => {
    await key('Escape');
    assert.deepEqual(await dialogs(), ['Edit details']);
    assert.equal(await focused(), 'Delete permanently…');
  });
  await check('M2 on top: a click outside closes only the box; focus goes back to the opener', async () => {
    await openOnTop();
    assert.equal((await dialogs()).length, 2);
    await clickAt(8, 790); // the dimmed area, away from both boxes
    assert.deepEqual(await dialogs(), ['Edit details']);
    assert.equal(await focused(), 'Delete permanently…');
  });
  await check('M2 on top: Back closes only the box (the dialog underneath stays); focus goes back', async () => {
    await openOnTop();
    assert.equal((await dialogs()).length, 2);
    await ev('history.back()');
    await sleep(500);
    assert.deepEqual(await dialogs(), ['Edit details']);
    assert.equal(await focused(), 'Delete permanently…');
    assert.match(await ev('location.hash'), /#M2\/ontop/);
  });
  await check('M2 on top: while it works, Esc, a click outside and Back wait; both buttons gray, focusable', async () => {
    await openOnTop();
    await key('Tab'); // Keep student → Delete permanently
    assert.equal(await focused(), 'Delete permanently');
    await key('Enter'); // the sample action never finishes
    const buttons = await ev(`[...document.querySelectorAll('[role=alertdialog] .cfm-actions > button')].map((b) => [b.textContent.trim(), b.getAttribute('aria-disabled'), b.classList.contains('is-unavailable'), b.disabled])`);
    assert.deepEqual(buttons, [['Keep student', 'true', true, false], ['Deleting…', 'true', true, false]]);
    await key('Escape');
    await clickAt(8, 790);
    await ev('history.back()');
    await sleep(500);
    assert.deepEqual(await dialogs(), ['Edit details', 'Delete Owen Reed permanently?']);
    await key('Tab');
    assert.equal(await focused(), 'Keep student', 'still focusable (Tab wraps inside the box)');
    await click('[role=alertdialog] button', 'Keep student');
    assert.equal((await dialogs()).length, 2, 'Keep student waits too');
  });

  // ===================== M2 / M1 — busy disables both; failures inside the box =====================
  await open('M2/busy');
  await check('M2 busy: both buttons gray (aria-disabled), pressing Keep does nothing, Esc waits', async () => {
    await click('[role=alertdialog] button', 'Keep student');
    await key('Escape');
    assert.deepEqual(await dialogs(), ['Delete Owen Reed permanently?']);
    const states = await ev(`[...document.querySelectorAll('[role=alertdialog] .cfm-actions > button')].map((b) => b.getAttribute('aria-disabled'))`);
    assert.deepEqual(states, ['true', 'true']);
  });
  await open('M2/failed');
  await check('M2 failed: the amber note is inside the box, under the buttons; pressing again tries again', async () => {
    const inside = await ev(`(() => { const box = document.querySelector('[role=alertdialog]'); const note = box.querySelector('.notice'); const row = box.querySelector('.cfm-actions'); return Boolean(note) && note.getBoundingClientRect().top >= row.getBoundingClientRect().bottom; })()`);
    assert.ok(inside);
    await click('[role=alertdialog] button', 'Delete permanently');
    assert.equal(await ev(`document.querySelector('[role=alertdialog] .cfm-actions > button:last-of-type').textContent.trim()`), 'Deleting…');
  });
  await open('M1/busy');
  await check('M1 busy: "Keeping…", every button gray incl. Close; Esc and Back wait', async () => {
    const buttons = await ev(`[...document.querySelectorAll('[role=dialog] button')].map((b) => [b.textContent.trim(), b.getAttribute('aria-disabled')])`);
    assert.deepEqual(buttons, [['Keeping…', 'true'], ['Keep this one', 'true'], ['Not the same person — keep both', 'true'], ['Close', 'true']]);
    await key('Escape');
    await ev('history.back()');
    await sleep(400);
    await click('[role=dialog] button', 'Close');
    assert.deepEqual(await dialogs(), ['Mia Lopez is registered twice']);
  });
  await open('M2/ontop', 900);
  await check('M2 on top, opened without focus (as a tap in Safari / iPadOS): focus goes back to the button that opened it (returnFocusTo)', async () => {
    // Focus sits on the dialog's Close; the opener is pressed without taking the focus.
    await ev(`[...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.trim() === 'Close').focus()`);
    await ev(`document.querySelector('[data-open-ask]').click()`);
    await sleep(300);
    assert.deepEqual(await dialogs(), ['Edit details', 'Delete Owen Reed permanently?']);
    await key('Escape');
    assert.deepEqual(await dialogs(), ['Edit details']);
    assert.equal(await focused(), 'Delete permanently\u2026');
  });
  await open('M2/forgood');
  await check('M2: while it works nothing moves \u2014 "Keep student" stays put and the action keeps its width (side by side, 1280)', async () => {
    const rects = () => ev(`[...document.querySelectorAll('[role=alertdialog] .cfm-actions > button')].map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.width)]; })`);
    const before = await rects();
    await click('[role=alertdialog] button', 'Delete permanently'); // the sample action never finishes
    assert.equal(await ev(`document.querySelector('[role=alertdialog] .cfm-actions > button:last-of-type').textContent.trim()`), 'Deleting\u2026');
    assert.deepEqual(await rects(), before);
  });
  await tab.size({ w: 320, h: 640, touch: true, scale: 1 });
  await open('M2/busy');
  await check('M2 at 320 while it works: the pair stays stacked, both buttons the box\u2019s full width, nothing sticks out sideways', async () => {
    const layout = await ev(`(() => {
      const box = document.querySelector('[role=alertdialog]');
      const row = box.querySelector('.cfm-actions');
      const widths = [...row.querySelectorAll(':scope > button')].map((b) => Math.round(b.getBoundingClientRect().width));
      return { stacked: row.classList.contains('is-stacked'), widths, row: Math.round(row.clientWidth), overflow: box.scrollWidth - box.clientWidth };
    })()`);
    assert.equal(layout.stacked, true);
    assert.deepEqual(layout.widths, [layout.row, layout.row]);
    assert.equal(layout.overflow, 0);
  });

  // Busy words LONGER than the usual words (design re-check of D2): Prospects' "Came" → "Saving…"
  // (the mockup's "Loses nothing" sample) and a check-only "Withdraw" → "Withdrawing…", at the four
  // sizes. Each button's exact box at rest and while it works must be the same, and nothing may
  // stick out sideways: not out of the row (a right-aligned row spills out on the LEFT, which
  // scrollWidth doesn't count), not out of the box, not out of the page.
  const pairLayout = () => ev(`(() => {
    const box = document.querySelector('[role=alertdialog]');
    const row = box.querySelector('.cfm-actions');
    const edge = row.getBoundingClientRect();
    const buttons = [...row.querySelectorAll(':scope > button')].map((b) => {
      const r = b.getBoundingClientRect();
      return { words: b.textContent.trim(), at: [r.left, r.top, r.width, r.height], inside: r.left >= edge.left - 0.5 && r.right <= edge.right + 0.5 };
    });
    return { stacked: row.classList.contains('is-stacked'), buttons, boxOverflow: box.scrollWidth - box.clientWidth, pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  })()`);
  const FOUR_SIZES = [
    { label: '1280', w: 1280, h: 800, touch: false },
    { label: '820 touch', w: 820, h: 1180, touch: true },
    { label: '390 touch', w: 390, h: 844, touch: true },
    { label: '320 touch', w: 320, h: 640, touch: true },
  ];
  for (const [hash, usual, busyWords] of [['M2/nothing', 'Came', 'Saving…'], ['M2/withdraw', 'Withdraw', 'Withdrawing…']]) {
    for (const size of FOUR_SIZES) {
      await tab.size({ w: size.w, h: size.h, touch: size.touch, scale: 1 });
      await open(hash);
      await check(`M2 at ${size.label}: "${usual}" → "${busyWords}" (longer busy words) — nothing moves while it works, nothing sticks out sideways`, async () => {
        const rest = await pairLayout();
        // Pressed in the page (no scrolling, no mouse): the sample action never finishes.
        await ev(`[...document.querySelectorAll('[role=alertdialog] .cfm-actions > button')].find((b) => b.textContent.trim() === ${JSON.stringify(usual)}).click()`);
        await sleep(300);
        const working = await pairLayout();
        assert.equal(working.buttons[1].words, busyWords);
        for (const [when, layout] of [['at rest', rest], ['while it works', working]]) {
          assert.ok(layout.buttons.every((b) => b.inside), `${when}: a button sticks out of the row (stacked: ${layout.stacked})`);
          assert.equal(layout.boxOverflow, 0, `${when}: the box scrolls sideways`);
          assert.equal(layout.pageOverflow, 0, `${when}: the page scrolls sideways`);
        }
        assert.equal(working.stacked, rest.stacked, 'stacked at rest and not while it works, or the other way round');
        assert.deepEqual(working.buttons.map((b) => b.at), rest.buttons.map((b) => b.at), 'the buttons moved or changed size');
      });
    }
  }
  await tab.size({ w: 1280, h: 800, touch: false, scale: 1 });

  await open('M1/busy');
  await check('M1 busy: the pressed button has no separate name, so "Keeping\u2026" is heard; the other keeps "Keep this one: \u2026"', async () => {
    const names = await ev(`[...document.querySelectorAll('[role=dialog] .ev-cmp-keep button')].map((b) => [b.textContent.trim(), b.getAttribute('aria-label')])`);
    assert.deepEqual(names, [['Keeping\u2026', null], ['Keep this one', 'Keep this one: Second registration']]);
  });

  await open('M1/failed');
  await check('M1 failed: the note is in the dialog\u2019s bottom area with the buttons (not under them)', async () => {
    const ok = await ev(`(() => { const footer = document.querySelector('[role=dialog] .dialog-footer'); const note = footer?.querySelector('.notice'); return Boolean(note) && getComputedStyle(footer).position === 'sticky'; })()`);
    assert.ok(ok);
  });
  await open('M1/compare');
  await check('M1: "⚠ different" on the differing rows only; the reference and date are never marked', async () => {
    const marked = await ev(`[...document.querySelectorAll('.ev-cmp tbody tr')].map((tr) => [tr.querySelector('th')?.textContent ?? '', tr.querySelectorAll('.cmp-diff').length])`);
    assert.deepEqual(marked, [['Registered', 0], ['Reference', 0], ['Testing for', 0], ['Paying by', 2], ['Payment', 2], ['', 0]]);
    assert.equal(await ev(`document.querySelector('.cmp-diff').textContent`), ' different');
  });
  await open('M1/box', 600);
  await check('M1 box: Review opens the compare; Close puts focus back on that Review', async () => {
    await click('.dupbox button', undefined);
    assert.deepEqual(await dialogs(), ['Mia Lopez is registered twice']);
    await key('Escape');
    assert.deepEqual(await dialogs(), []);
    assert.equal(await focused(), 'Review');
  });
  await open('M5/failed');
  await check('M5: a failed download shows its note inside the box; a failed copy its own sentence', async () => {
    const note = await ev(`document.querySelector('[role=dialog] .notice')?.textContent`);
    assert.equal(note, "Couldn't make the QR code picture. Try again.");
    await click('[role=dialog] button', 'Copy Shrewsbury link');
    assert.equal(await ev(`document.querySelector('[role=dialog] .notice')?.textContent`), "Couldn't copy the link. Select the link and copy it yourself.");
  });
  // The Download buttons' hidden names (what screen readers say, what voice control listens for)
  const downloadNames = () => ev(`[...document.querySelectorAll('[role=dialog] button')].filter((b) => b.textContent.trim() === 'Download QR code').map((b) => b.getAttribute('aria-label'))`);
  await open('M5/two');
  await check('M5: two schools — Download keeps its words; its hidden name adds the school after them (v1.111, WCAG 2.5.3)', async () => {
    assert.deepEqual(await downloadNames(), ['Download QR code, Worcester', 'Download QR code, Shrewsbury']);
  });
  await open('M5/one');
  await check('M5: one school — Download QR code has no hidden name of its own', async () => {
    assert.deepEqual(await downloadNames(), [null]);
  });
  await open('M4/failed');
  await check('M4 failed: the amber bar with Retry is inside the box; Print stays gray', async () => {
    assert.ok(await ev(`Boolean(document.querySelector('[role=dialog] .errbar'))`));
    assert.equal(await ev(`[...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.includes('Print'))?.getAttribute('aria-disabled')`), 'true');
  });
  await open('M7/failed');
  await check('M7 failed: the amber bar with Retry under the line; Retry reads again', async () => {
    assert.ok(await ev(`Boolean(document.querySelector('[role=dialog] .hist-error .errbar'))`));
    // Retry pressed, and what the line says right after (the sample reader fails again after a moment)
    await ev(`[...document.querySelectorAll('[role=dialog] .errbar button')].find((b) => b.textContent.trim() === 'Retry').click()`);
    const after = await ev(`document.querySelector('.hist-wait')?.textContent ?? null`);
    assert.equal(after, 'Loading…');
  });

  // ===================== M3 — the Mark paid box's keys =====================
  await open('M3/open');
  await check('M3: first focus on "Mark paid $50" (named "… by check"); Esc closes and focus goes back to the opener', async () => {
    assert.equal(await focused(), 'Mark paid $50 by check');
    await key('Escape');
    assert.equal(await ev(`Boolean(document.querySelector('.mpb'))`), false);
    assert.equal(await focused(), 'Mark paid');
  });
  await check('M3: arrow keys pick another way; Enter on Mark paid hands the section that way', async () => {
    await key('Enter'); // the opener: opens the box again
    await sleep(300);
    await key('Tab', { shift: true }); // Mark paid $50 → the chosen way (Check)
    assert.equal(await focused(), 'Check');
    await key('ArrowRight');
    assert.equal(await focused(), 'Card');
    await key('Tab');
    assert.equal(await focused(), 'Mark paid $50 by card');
    await key('Enter');
    assert.equal(await ev(`Boolean(document.querySelector('.mpb'))`), false);
    assert.match(await ev(`document.querySelector('.parts-note')?.textContent ?? ''`), /“card”/);
  });
  await check('M3: a click outside closes the box', async () => {
    await click('button', 'Mark paid');
    assert.equal(await ev(`Boolean(document.querySelector('.mpb'))`), true);
    await clickAt(1200, 700);
    assert.equal(await ev(`Boolean(document.querySelector('.mpb'))`), false);
  });
  await open('M3/open');
  await check('M3: a Tab that leaves the box closes it and focus goes back to the opener (as the ⋯ menu); Tab inside moves between its two stops', async () => {
    assert.equal(await focused(), 'Mark paid $50 by check');
    await key('Tab'); // from the last stop: out of the box
    assert.equal(await ev(`Boolean(document.querySelector('.mpb'))`), false);
    assert.equal(await focused(), 'Mark paid');
    await key('Enter'); // open it again
    await sleep(300);
    await key('Tab', { shift: true }); // Mark paid $50 → Check (inside)
    assert.equal(await focused(), 'Check');
    assert.equal(await ev(`Boolean(document.querySelector('.mpb'))`), true);
    await key('Tab', { shift: true }); // from the first stop: out of the box
    assert.equal(await ev(`Boolean(document.querySelector('.mpb'))`), false);
    assert.equal(await focused(), 'Mark paid');
  });
  // Inside a dialog (code re-check of D7): the section puts focus back on the opener at once (as
  // Camps does), and the dialog's own Tab wrap-around must not then move it on. The dialog's first
  // and last Tab stops are the two rows' tags, so a wrap would land on the other tag.
  await open('M3/indialog', 800);
  await check('M3 inside a dialog: a Tab out of the box leaves focus on its opener (the dialog’s Tab wrap doesn’t move it on), Tab and Shift+Tab', async () => {
    await click('[role=dialog] button', 'Owes $30'); // the dialog's last Tab stop
    await sleep(300);
    assert.equal(await focused(), 'Mark paid $30 by card');
    await key('Tab'); // from the box's last stop: out of the box
    assert.equal(await ev(`Boolean(document.querySelector('.mpb'))`), false);
    assert.equal(await focused(), 'Owes $30');
    await click('[role=dialog] button', 'Owes $15.50'); // the dialog's first Tab stop
    await sleep(300);
    await key('Tab', { shift: true }); // Mark paid $15.50 → Cash (the chosen way)
    assert.equal(await focused(), 'Cash');
    await key('Tab', { shift: true }); // from the box's first stop: out of the box
    assert.equal(await ev(`Boolean(document.querySelector('.mpb'))`), false);
    assert.equal(await focused(), 'Owes $15.50');
    assert.deepEqual(await dialogs(), ['April Vacation Camp']);
  });
  await open('M3/nochoice');
  await check('M3 no choice: focus on Cash; Mark paid is gray and does nothing until a way is picked', async () => {
    assert.equal(await focused(), 'Cash');
    await click('.mpb button', 'Mark paid $50');
    assert.equal(await ev(`Boolean(document.querySelector('.mpb'))`), true);
    assert.equal(await ev(`document.querySelector('.mpb-reason')?.textContent`), 'Choose how they paid.');
    await key(' '); // Space on Cash: picks it
    await click('.mpb [role=radio]', 'Cash');
    assert.equal(await ev(`document.querySelector('[data-mark-paid]').getAttribute('aria-disabled')`), null);
    assert.equal(await ev(`Boolean(document.querySelector('.mpb-reason'))`), false);
  });

  // ===================== M6 / M7 =====================
  await open('M6/rest', 500);
  await check('M6: a count card is a pressed/not-pressed button; tapping filters, again or Show all clears; a total is not a button', async () => {
    assert.equal(await ev(`[...document.querySelectorAll('.ev-card')].map((c) => c.tagName + ':' + (c.getAttribute('aria-pressed') ?? '-')).join(' ')`), 'BUTTON:- BUTTON:false BUTTON:false DIV:-');
    await click('.ev-card', 'Not paid9');
    assert.equal(await ev(`document.querySelector('.ev-card.is-selected')?.getAttribute('aria-pressed')`), 'true');
    assert.equal(await ev(`document.querySelector('.ev-filter-line')?.textContent`), 'Showing not paid only · Show all');
    await click('.ev-card', 'Not paid9');
    assert.equal(await ev(`Boolean(document.querySelector('.ev-filter-line'))`), false);
    await click('.ev-card', 'Paid6');
    await click('.ev-filter-line button', 'Show all');
    assert.equal(await ev(`Boolean(document.querySelector('.ev-card.is-selected'))`), false);
  });
  await open('M7/closed');
  await check('M7: the line is a button heard as collapsed/expanded; Enter opens the list newest first, "Oct 22 · Jeffrey Berg"', async () => {
    assert.equal(await ev(`document.querySelector('.hist-btn').getAttribute('aria-expanded')`), 'false');
    await key('Enter');
    assert.equal(await ev(`document.querySelector('.hist-btn').getAttribute('aria-expanded')`), 'true');
    const metas = await ev(`[...document.querySelectorAll('.hist-meta')].map((m) => m.textContent)`);
    assert.deepEqual(metas, ['Oct 22 · Jeffrey Berg', 'Oct 19 · Staff', 'Oct 13 · Family form']);
    assert.equal(await ev(`Boolean(document.querySelector('.hist-btn .tabler-icon-chevron-down'))`), true);
  });

  // ===================== M5 — the real download: name and size =====================
  rmSync(downloads, { recursive: true, force: true });
  mkdirSync(downloads, { recursive: true });
  await tab.cdp('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
  await open('M5/one');
  await check('M5: Download QR code saves "November Children Testing - Worcester QR code.png", 1024 × 1024 px', async () => {
    await click('[role=dialog] button', 'Download QR code');
    let files = [];
    for (let i = 0; i < 30 && files.length === 0; i += 1) {
      await sleep(200);
      files = readdirSync(downloads).filter((f) => f.endsWith('.png'));
    }
    assert.deepEqual(files, ['November Children Testing - Worcester QR code.png']);
    const png = readFileSync(join(downloads, files[0]));
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1024, 1024]);
  });

  // ===================== DP — the date picker opened from a button (v0.817) =====================
  // The section's own button opens the calendar (no field); `opener` here is that button.
  const dp = () => ev(`(() => {
    const pop = document.querySelector('.dp-pop');
    const opener = document.querySelector('.parts-dp [aria-haspopup="dialog"]');
    const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), bottom: Math.round(b.bottom) }; };
    const a = document.activeElement;
    const sample = document.querySelector('.parts-dp');
    return {
      open: Boolean(pop), inline: Boolean(pop?.classList.contains('is-inline')), inBody: pop?.parentElement === document.body,
      haspopup: opener?.getAttribute('aria-haspopup'), expanded: opener?.getAttribute('aria-expanded'),
      fields: document.querySelectorAll('.parts-dp .dp-field').length,
      pop: box(pop), opener: box(opener), row: box(document.querySelector('.parts-dayrow')), cards: box(document.querySelector('.parts-cards')),
      focus: a === opener ? 'opener' : a === document.body || !a ? 'body' : a.dataset.date ?? (a.getAttribute('aria-label') || a.textContent.trim()),
      name: pop?.getAttribute('aria-label') ?? null,
      hint: pop?.querySelector('.dp-hint')?.textContent.trim() ?? null,
      value: sample?.dataset.day ?? sample?.dataset.date ?? null,
    };
  })()`);
  const cells = (dates) => ev(`${JSON.stringify(dates)}.map((d) => { const td = document.querySelector('.dp-pop td[data-date="' + d + '"]'); return td ? [d, td.getAttribute('aria-selected'), td.getAttribute('aria-current'), td.getAttribute('aria-disabled')] : [d, 'missing']; })`);
  const pressOpener = () => click('.parts-dp [aria-haspopup="dialog"]');

  await tab.size({ w: 1280, h: 800, touch: false, scale: 1 });
  await open('DP/row-closed', 600);
  await check('DP: no field is drawn; the calendar button says it opens a dialog, closed', async () => {
    const s = await dp();
    assert.deepEqual([s.fields, s.open, s.haspopup, s.expanded], [0, false, 'dialog', 'false']);
  });
  await check('DP: a click on the calendar button opens the calendar under it (PC), focus on the chosen day', async () => {
    await pressOpener();
    const s = await dp();
    assert.deepEqual([s.open, s.inBody, s.expanded, s.focus, s.name], [true, true, 'true', '2026-10-26', 'Choose day']);
    assert.ok(Math.abs(s.pop.y - (s.opener.bottom + 4)) <= 1, `calendar top ${s.pop.y}, button bottom ${s.opener.bottom}`);
    assert.ok(Math.abs(s.pop.x - s.opener.x) <= 1, `calendar left ${s.pop.x}, button left ${s.opener.x}`);
  });
  await check("DP: the same calendar: Finance's line, days after today unavailable, today outlined, the chosen day selected", async () => {
    assert.equal((await dp()).hint, "Days after today can't be chosen.");
    assert.deepEqual(await cells(['2026-10-26', '2026-10-28', '2026-10-29']), [
      ['2026-10-26', 'true', null, null],
      ['2026-10-28', 'false', 'date', null],
      ['2026-10-29', 'false', null, 'true'],
    ]);
  });
  await check("DP: a gray day can't be picked: a click on Oct 30 does nothing, the calendar stays open", async () => {
    await click('.dp-pop td[data-date="2026-10-30"]');
    const s = await dp();
    assert.deepEqual([s.open, s.value], [true, '2026-10-26']);
  });
  await check('DP: Esc closes it; focus back on the calendar button', async () => {
    await key('Escape');
    const s = await dp();
    assert.deepEqual([s.open, s.expanded, s.focus], [false, 'false', 'opener']);
  });
  await check('DP: the keyboard: Enter on the button opens it on Oct 26; ← then Enter picks Oct 25, closes, focus back on the button', async () => {
    await key('Enter');
    await sleep(200);
    assert.equal((await dp()).focus, '2026-10-26');
    await key('ArrowLeft');
    assert.equal((await dp()).focus, '2026-10-25');
    await key('Enter');
    const s = await dp();
    assert.deepEqual([s.open, s.value, s.focus], [false, '2026-10-25', 'opener']);
  });
  await check('DP: Alt+↓ on the button opens it too', async () => {
    await key('ArrowDown', { alt: true });
    await sleep(200);
    const s = await dp();
    assert.deepEqual([s.open, s.focus], [true, '2026-10-25']);
    await key('Escape');
  });
  await check('DP: a click on the page outside closes it; focus back on the calendar button', async () => {
    await pressOpener();
    assert.equal((await dp()).open, true);
    await clickAt(1200, 760); // empty page, far from the calendar
    await sleep(100);
    const s = await dp();
    assert.deepEqual([s.open, s.focus], [false, 'opener']);
  });
  await check('DP: a click on another control (History) closes it, and that control keeps the focus', async () => {
    await pressOpener();
    await click('.parts-dayrow button', 'History');
    await sleep(100);
    const s = await dp();
    assert.deepEqual([s.open, s.focus], [false, 'History']);
  });
  await check("DP: a click on the calendar button while it's open closes it (it doesn't open again)", async () => {
    await pressOpener();
    assert.equal((await dp()).open, true);
    await pressOpener();
    const s = await dp();
    assert.deepEqual([s.open, s.expanded], [false, 'false']);
  });

  await open('DP/panel', 600);
  await check("DP panel: a text button opens it on today (nothing chosen), past days unavailable, the picker's line", async () => {
    await pressOpener();
    const s = await dp();
    assert.deepEqual([s.open, s.focus, s.hint, s.name], [true, '2026-10-28', "Past dates can't be chosen.", 'Choose follow-up date']);
    assert.deepEqual(await cells(['2026-10-27', '2026-10-28']), [
      ['2026-10-27', 'false', null, 'true'],
      ['2026-10-28', 'false', 'date', null],
    ]);
  });
  await check('DP panel: a click on Oct 30 picks it, closes, focus back on the button', async () => {
    await click('.dp-pop td[data-date="2026-10-30"]');
    const s = await dp();
    assert.deepEqual([s.open, s.value, s.focus], [false, '2026-10-30', 'opener']);
  });

  await tab.size({ w: 390, h: 844, touch: true, scale: 1 });
  await open('DP/row-closed', 600);
  await check('DP (phone 390): the calendar opens in the page under the row, edge to edge, and pushes the cards down', async () => {
    await pressOpener();
    const s = await dp();
    assert.deepEqual([s.open, s.inline, s.inBody], [true, true, false]);
    assert.ok(s.pop.y >= s.row.bottom, `calendar top ${s.pop.y}, row bottom ${s.row.bottom}`);
    assert.deepEqual([s.pop.x, s.pop.w], [0, 390]);
    assert.ok(s.cards.y >= s.pop.bottom, `cards top ${s.cards.y}, calendar bottom ${s.pop.bottom}`);
  });
  await check('DP (phone 390): picking a day closes it; focus back on the button', async () => {
    await click('.dp-pop td[data-date="2026-10-27"]');
    const s = await dp();
    assert.deepEqual([s.open, s.value, s.focus], [false, '2026-10-27', 'opener']);
  });
  await tab.size({ w: 1280, h: 800, touch: false, scale: 1 });

  // The field mode is unchanged: it still draws its field, gives focus back to it on Esc, and a
  // click outside still leaves the focus where the click put it (v0.503).
  await open('DP/field', 600);
  await check('DP field mode, unchanged: the field opens the calendar under it; Esc gives focus back to the field', async () => {
    await click('.parts-dp .dp-field');
    let s = await dp();
    assert.deepEqual([s.fields, s.open, s.inBody, s.expanded, s.focus], [1, true, true, 'true', '2026-10-26']);
    await key('Escape');
    s = await dp();
    assert.deepEqual([s.open, s.focus], [false, 'opener']);
  });
  await check('DP field mode, unchanged: a click outside closes it and leaves the focus off the field', async () => {
    await click('.parts-dp .dp-field');
    await clickAt(1200, 760);
    await sleep(100);
    const s = await dp();
    assert.deepEqual([s.open, s.focus], [false, 'body']);
  });

  // The design review's cases (2026-10-28): the day moved while the calendar was closed (phones),
  // a real tap outside, a box that can take the focus, a box opened above its button that grows, a
  // disabled button, and the section closing the calendar itself.
  const centerOf = (selector) => ev(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  async function tapAt(x, y) {
    await tab.cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await sleep(80);
    await tab.cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(500);
  }
  await tab.size({ w: 390, h: 844, touch: true, scale: 1 });
  await open('DP/row-closed', 600);
  await check('DP (phone): ‹ then the calendar button: it opens on the new day (Oct 25), with focus on it', async () => {
    await click('[aria-label="Previous day"]');
    await pressOpener();
    const s = await dp();
    assert.deepEqual([s.open, s.value, s.focus], [true, '2026-10-25', '2026-10-25']);
    await key('Escape');
  });
  await check('DP (phone): moved into another month (‹ to Sep 30), it opens on Sep 30, and Esc still closes it', async () => {
    for (let i = 0; i < 25; i += 1) await click('[aria-label="Previous day"]');
    assert.equal((await dp()).value, '2026-09-30');
    await pressOpener();
    let s = await dp();
    assert.deepEqual([s.open, s.focus], [true, '2026-09-30']);
    await key('Escape');
    s = await dp();
    assert.deepEqual([s.open, s.focus], [false, 'opener']);
  });
  await check('DP (phone): a real tap outside (on the day heading) closes it; focus back on the button once the tap is over', async () => {
    await pressOpener();
    assert.equal((await dp()).open, true);
    const at = await centerOf('.parts-day');
    await tapAt(at.x, at.y);
    const s = await dp();
    assert.deepEqual([s.open, s.focus], [false, 'opener']);
  });
  await open('DP/row-disabled', 600);
  await check("DP (phone): a disabled button does nothing: no calendar, no scrolling, aria-expanded stays false", async () => {
    const before = await ev('scrollY');
    await pressOpener();
    const s = await dp();
    assert.deepEqual([s.open, s.expanded, await ev('scrollY')], [false, 'false', before]);
  });

  await tab.size({ w: 1280, h: 800, touch: false, scale: 1 });
  await open('DP/panel-in-box', 600);
  await check('DP: a click inside a box that can take the focus (tabindex -1, as the dialog box) gives the focus back to the button', async () => {
    await pressOpener();
    assert.equal((await dp()).open, true);
    const spot = await ev(`(() => { const r = document.querySelector('.parts-focusbox').getBoundingClientRect(); return { x: r.right - 12, y: r.top + 12 }; })()`);
    await clickAt(spot.x, spot.y);
    await sleep(100);
    const s = await dp();
    assert.deepEqual([s.open, s.focus], [false, 'opener']);
  });
  await open('DP/panel-low', 600);
  await check('DP: opened above its button, the calendar stays above it when the month gets a 6th week (Oct → Jan, Page Down ×3)', async () => {
    await pressOpener();
    let s = await dp();
    assert.ok(Math.abs(s.pop.bottom - (s.opener.y - 4)) <= 1, `opens above: calendar bottom ${s.pop.bottom}, button top ${s.opener.y}`);
    for (let i = 0; i < 3; i += 1) await key('PageDown');
    await sleep(150);
    s = await dp();
    assert.equal(s.focus, '2027-01-28');
    assert.ok(Math.abs(s.pop.bottom - (s.opener.y - 4)) <= 1, `after Jan: calendar bottom ${s.pop.bottom}, button top ${s.opener.y}`);
  });
  await open('DP/row-autoclose', 600);
  await check('DP: when the section closes the calendar itself (focus inside it), focus goes back to the button', async () => {
    await pressOpener();
    assert.equal((await dp()).focus, '2026-10-26');
    await sleep(1300); // the sample closes it 1 s after it opens
    const s = await dp();
    assert.deepEqual([s.open, s.focus], [false, 'opener']);
  });
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exitCode = 1;
