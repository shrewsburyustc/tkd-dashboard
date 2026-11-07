// check-room.mjs — the room beside the panel (src/lib/pageRoom.js; rulebook v1.053, v1.130; design
// review rolling check pass 2, L-02). Drives the preview app (fake database) and the parts page with
// a hidden Chrome (chrome.mjs) and checks what the shared part promises:
//   - the room the app measures is the page area's width (the window minus the panel), less a
//     scrollbar's width on a device whose scrollbars take room. Checked where the rosters overlapped
//     (683 wide with a mouse, a phone turned sideways at 667×375, 700 wide touch with Largest, an
//     iPad mini at 744×1133, an iPad at 768×1024 with Largest), and at 820×1180, 1024×768 with
//     Largest, 1280×800 and a phone (390);
//   - a stand-in roster (listening to the app's own room store) whose phone layout is longer, or
//     shorter, than its columns switches exactly once each way as the window narrows by 10 px and
//     widens back, with the same room both ways, so the page's scrollbar coming or going can't change
//     the room; and the browser gives no "ResizeObserver loop" warning;
//   - it follows Panel size at once, without a reload;
//   - behind the lock screen it keeps the last room, and after unlocking it's the same;
//   - no container or containment sits around the page area (the reason v1.130 chose this over a
//     CSS container query), and a pop-up list drawn inside a page (Star's grade list) still opens
//     right under its cell;
//   - the parts page's sample (parts.html#L02/room and #L02/narrow): the room it shows is its page
//     area's width (the chosen window minus the panel, when the screen has room for that window), the
//     roster shows its phone layout exactly while the room is under its 640 px limit, for each Window
//     and Panel choice at the four review sizes, and its very first frame already shows the room.
// It also REPORTS, without failing, the roster cells whose content is wider than the cell (cut off,
// or running into the next) and the roster boxes wider than their room (a table cut off at its
// edge), at 683 with a mouse, at 768×1024 with Largest and at 1024×768 with Largest, for the
// sections' own L-02 items. (This hidden Chrome draws scrollbars that take room at 768 px and wider,
// even with touch on, so its 768 room is 15 px less than a real iPad's.)
// Why: no screen changes in this step (the sections switch their rosters later), so pictures can't
// show it; these checks show it works. The pictures prove nothing on screen changed (shoot-app.mjs
// before and after, then compare-app.mjs).
//
// Usage: node check-room.mjs <preview address, e.g. http://localhost:5190/> [words]
//   prints ok / FAIL per check, the report, and the totals; exits 1 when any check fails. With
//   [words], only the checks whose name holds those words run, and there is no report.
// Only ever point it at `npm run dev:preview-mode` (the fake database): it signs in with the preview
// password, sets the fake account's Panel size and uses the preview's console helpers (__tkdPreview).
import assert from 'node:assert/strict';
import { withChrome } from './chrome.mjs';

const base = (process.argv[2] ?? 'http://localhost:5190/').replace(/\/?$/, '/');
const only = process.argv[3] ?? null; // optional: run only the checks whose name holds these words
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
const report = []; // what the sections should know (never a failure)

const EVENT = 'testing/color-belt/event/000001e0-0000-4000-8000-000000000001'; // November Children Testing
const STAR_EVENT = 'testing/star/event/000003e0-0000-4000-8000-000000000001'; // Fall Star Testing
const SAMPLE_LIMIT = 640; // the parts page sample's limit (src/parts/L02.jsx)
const KEYS = { Escape: 27 };

await withChrome(async (tab) => {
  await tab.cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  // On every page this tab opens: note each script error (a "ResizeObserver loop" one included), and
  // what the parts sample's room line says at each of its first animation frames (each is drawn on
  // the screen right after).
  await tab.cdp('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__errors = [];
      window.addEventListener('error', (event) => window.__errors.push(String(event.message)));
      window.__frames = [];
      (function tick() {
        const said = document.querySelector('.parts-room-readout b');
        if (said) window.__frames.push(said.textContent);
        if (window.__frames.length < 60) requestAnimationFrame(tick);
      })();`,
  });

  // ----- helpers -----
  const ev = (js) => tab.evaluate(js);
  let touch = false;
  async function size(w, h, isTouch = false) {
    touch = isTouch;
    await tab.size({ w, h, touch: isTouch, scale: 1 });
    await sleep(200);
  }
  async function typeDigits(digits) {
    for (const d of digits) {
      await tab.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: d, code: `Digit${d}`, text: d, windowsVirtualKeyCode: 48 + Number(d) });
      await tab.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: d, code: `Digit${d}`, windowsVirtualKeyCode: 48 + Number(d) });
      await sleep(80);
    }
  }
  // Opens a page of the dashboard and waits until the signed-in frame shows (signing in if needed).
  async function openApp(hash = '') {
    await tab.open('about:blank', 0);
    await tab.open(`${base}#${hash}`, 300);
    for (let i = 0; i < 60; i += 1) {
      const state = await ev(
        `document.querySelector('.shell:not([hidden])') ? 'shell' : document.getElementById('signin-email') ? 'signin' : document.body.innerText.includes('Enter your PIN') ? 'locked' : 'wait'`,
      );
      if (state === 'shell') break;
      if (state === 'locked') {
        // left locked by a check that stopped half-way: unlock with the preview's PIN
        await typeDigits('2580');
        await sleep(1500);
      }
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
  // The fake account's Panel size, as if saved on another device; it's read when the app opens.
  async function savePanel(sizeKey) {
    await ev(`localStorage.setItem('tkd.preview.userMetadata', JSON.stringify({ metadata: { panel_size: ${JSON.stringify(sizeKey)} }, updatedAt: new Date().toISOString() }))`);
  }
  async function key(name) {
    const common = { key: name, code: name, windowsVirtualKeyCode: KEYS[name] };
    await tab.cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...common });
    await tab.cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...common });
    await sleep(150);
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
    await sleep(350);
  }
  // Presses the first element `finder` (a JS expression) gives, at its middle, after scrolling it in.
  async function press(finder, what) {
    const at = await ev(`(() => { const el = ${finder}; if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
    if (!at) throw new Error(`not on the page: ${what ?? finder}`);
    await sleep(150);
    await pressAt(at[0], at[1]);
  }
  const AVATAR = `document.querySelector('button[aria-label="Account menu"]')`;
  const SIZE_ROW = `[...document.querySelectorAll('.account-panel [role=menuitem]')].find((b) => b.textContent.includes('Panel size'))`;
  const sizeChoice = (label) =>
    `[...document.querySelectorAll('.account-panel [role=group][aria-label="Panel size"] [role=menuitemradio]')].find((b) => b.textContent.trim() === ${JSON.stringify(label)})`;
  // Picks a size through the account menu with real presses, then closes the menu with Esc.
  async function chooseSize(label) {
    await press(AVATAR, 'the initials');
    await press(SIZE_ROW, 'the Panel size row');
    await press(sizeChoice(label), `the ${label} choice`);
    await key('Escape');
    await sleep(400);
  }
  // The room the app reported (preview mode writes it on the page area), and the layout's own numbers
  // to compare it with. `bar` is how wide a scrollbar is on this screen (a hidden box that always
  // scrolls); `scrollbar` is the page's own scrollbar right now (0 when it doesn't scroll).
  const area = () =>
    ev(`(() => {
      const c = document.querySelector('.shell-content');
      const rail = document.querySelector('nav.rail');
      const railWidth = rail && getComputedStyle(rail).display !== 'none' ? rail.getBoundingClientRect().width : 0;
      const box = document.createElement('div');
      box.style.cssText = 'position: absolute; top: -9999px; width: 100px; height: 100px; overflow: scroll';
      document.body.appendChild(box);
      const bar = box.offsetWidth - box.clientWidth;
      box.remove();
      return {
        reported: c.dataset.pageRoom === undefined ? null : Number(c.dataset.pageRoom),
        outer: c.offsetWidth,
        scrollbar: c.offsetWidth - c.clientWidth,
        bar,
        window: window.innerWidth,
        rail: railWidth,
      };
    })()`);

  // ----- 1. The room the app measures, at the sizes that matter -----
  const CASES = [
    { name: '683 wide with a mouse, Standard (a laptop window snapped to half the screen)', w: 683, h: 800, touch: false, panel: 'standard', rail: 72 },
    { name: '667×375 touch, Standard (a phone turned sideways)', w: 667, h: 375, touch: true, panel: 'standard', rail: 72 },
    { name: '700 wide touch, Largest', w: 700, h: 1000, touch: true, panel: 'largest', rail: 96 },
    { name: '744×1133 touch, Standard (an iPad mini held upright)', w: 744, h: 1133, touch: true, panel: 'standard', rail: 72 },
    { name: '768×1024 touch, Largest (an iPad held upright)', w: 768, h: 1024, touch: true, panel: 'largest', rail: 96 },
    { name: '820×1180 touch, Standard', w: 820, h: 1180, touch: true, panel: 'standard', rail: 72 },
    { name: '1024×768 with a mouse, Largest', w: 1024, h: 768, touch: false, panel: 'largest', rail: 96 },
    { name: '1280×800 with a mouse, Standard', w: 1280, h: 800, touch: false, panel: 'standard', rail: 52 },
    { name: '390×844 touch (a phone held upright: no panel)', w: 390, h: 844, touch: true, panel: 'standard', rail: 0 },
  ];
  await size(1280, 800);
  await openApp(EVENT); // signs in once
  for (const c of CASES) {
    await check(`the room = window − panel − a scrollbar's width: ${c.name}`, async () => {
      await size(c.w, c.h, c.touch);
      await savePanel(c.panel);
      await openApp(EVENT);
      const a = await area();
      assert.equal(a.rail, c.rail, `the panel is ${a.rail} px`);
      assert.notEqual(a.reported, null, 'the app reported a room');
      assert.equal(a.outer, a.window - a.rail, `the page area is ${a.outer} px, the window less the panel is ${a.window - a.rail}`);
      assert.equal(a.reported, a.outer - a.bar, `reported ${a.reported}; the page area ${a.outer} less a scrollbar (${a.bar}) is ${a.outer - a.bar}`);
      console.log(`      room ${a.reported} px (window ${a.window}, panel ${a.rail}, a scrollbar ${a.bar}; the page's own scrollbar now ${a.scrollbar})`);
    });
  }

  // ----- 2. A roster switching layout can't change the room, or trip the browser's size reports -----
  // A stand-in roster listens to the app's own room store (the page imports the same module the app
  // loaded) and makes the page long (it scrolls) or short (it doesn't) as the room crosses its limit,
  // as a roster's phone layout would. The window then narrows by 10 px and widens back.
  for (const phoneIs of ['longer', 'shorter']) {
    await check(`1280×800 with a mouse: a stand-in roster whose phone layout is ${phoneIs} switches once each way, the room is the same both ways, and no "ResizeObserver loop" warning`, async () => {
      await size(1280, 800, false);
      await savePanel('standard');
      await openApp('');
      const start = await ev(`(async () => {
        const url = performance.getEntriesByType('resource').map((entry) => entry.name).find((name) => name.includes('/src/lib/pageRoom.js'));
        const room = await import(url);
        const page = document.querySelector('.shell-content');
        for (const child of page.children) child.style.display = 'none';
        const roster = document.createElement('div');
        roster.id = 'stand-in-roster';
        page.appendChild(roster);
        const limit = room.pageRoom() - 5; // at 1280 it fits; 10 px narrower it doesn't
        const draw = () => { roster.style.height = (room.pageRoomIsBelow(limit) === ${phoneIs === 'longer'}) ? '3000px' : '10px'; };
        draw();
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
        window.__switches = 0;
        window.__errorsBefore = window.__errors.length;
        window.__stopRoster = room.subscribePageRoom(() => { window.__switches += 1; draw(); });
        window.__room = room;
        return { sameStore: room.pageRoom() === Number(page.dataset.pageRoom), room: room.pageRoom(), limit };
      })()`);
      assert.equal(start.sameStore, true, 'the check listens to the app\'s own store');
      const look = () =>
        ev(`(() => { const page = document.querySelector('.shell-content');
          return { room: window.__room.pageRoom(), switches: window.__switches, scrollbar: page.offsetWidth - page.clientWidth,
            warnings: window.__errors.slice(window.__errorsBefore).filter((message) => /ResizeObserver/.test(message)) }; })()`);
      await size(1270, 800, false);
      await sleep(1000);
      const narrow = await look();
      await size(1280, 800, false);
      await sleep(1000);
      const wide = await look();
      await ev('window.__stopRoster()');
      assert.equal(narrow.room, start.room - 10, `narrowed by 10 px: room ${narrow.room}`);
      assert.equal(narrow.switches, 1, `switched ${narrow.switches} time(s) on the way in`);
      assert.equal(wide.room, start.room, `back to ${start.room} px: room ${wide.room}`);
      assert.equal(wide.switches, 2, `switched ${wide.switches} time(s) in all`);
      assert.ok(narrow.scrollbar !== wide.scrollbar, 'the page\'s scrollbar came or went with the switch (so the case was tested)');
      assert.deepEqual(wide.warnings, [], '"ResizeObserver loop" warnings');
    });
  }

  // ----- 3. Panel size: the room follows at once, with no reload -----
  await check('768×1024 touch: choosing Largest, then Standard, changes the room by 24 px each time, with no reload', async () => {
    await size(768, 1024, true);
    await savePanel('standard');
    await openApp(EVENT);
    await ev('window.__sameDocument = true');
    const standard = (await area()).reported;
    await chooseSize('Largest');
    const largest = (await area()).reported;
    assert.equal(largest, standard - 24, `Standard ${standard} → Largest ${largest}`);
    await chooseSize('Standard');
    assert.equal((await area()).reported, standard, 'back to Standard');
    assert.equal(await ev('window.__sameDocument === true'), true, 'the page was not reloaded');
  });

  // ----- 4. The lock screen keeps the last room -----
  await check('820×1180 touch: behind the lock screen the room stays as it was; after unlocking it is the same', async () => {
    await size(820, 1180, true);
    await savePanel('standard');
    await openApp(EVENT);
    const before = (await area()).reported;
    assert.notEqual(before, null, 'the app reported a room');
    await ev('window.__tkdPreview.lockNow()');
    await sleep(900);
    try {
      assert.equal(await ev(`document.body.innerText.includes('Enter your PIN')`), true, 'the lock screen is up');
      assert.equal(await ev(`document.querySelector('.shell-content').dataset.pageRoom`), String(before), 'not measured as 0 while hidden');
    } finally {
      await typeDigits('2580'); // always unlock, so the next checks start unlocked
      await sleep(1500);
    }
    assert.equal(await ev(`Boolean(document.querySelector('.shell:not([hidden])'))`), true, 'unlocked');
    assert.equal((await area()).reported, before, 'the same room after unlocking');
  });

  // ----- 5. No container around the page; a pop-up list inside a page opens under its cell -----
  await check('820×1180 touch: no container around the page area, and Star\'s grade list (drawn inside the page) opens right under its cell', async () => {
    await size(820, 1180, true);
    await openApp(`${STAR_EVENT}/grading`);
    const boxed = await ev(`(() => {
      const found = [];
      for (let el = document.querySelector('.shell-content'); el; el = el.parentElement) {
        const style = getComputedStyle(el);
        if (style.containerType !== 'normal' || (style.contain && style.contain !== 'none')) found.push(el.tagName + '.' + el.className);
      }
      return found;
    })()`);
    assert.deepEqual(boxed, [], 'a container or containment around the page area (v1.130: none)');
    const cell = `[...document.querySelectorAll('.shell-content [aria-haspopup="listbox"]')][4]`;
    await press(cell, 'a grade cell');
    await sleep(400);
    const at = await ev(`(() => {
      const cell = ${cell};
      const list = document.querySelector('.stg-list, [role="listbox"]');
      if (!cell || !list) return null;
      const c = cell.getBoundingClientRect();
      const l = list.getBoundingClientRect();
      return { cellLeft: c.left, cellBottom: c.bottom, listLeft: l.left, listTop: l.top };
    })()`);
    assert.ok(at, 'the list opened');
    assert.ok(Math.abs(at.listLeft - at.cellLeft) <= 1, `the list's left edge ${Math.round(at.listLeft)} is the cell's ${Math.round(at.cellLeft)}`);
    const gap = at.listTop - at.cellBottom;
    assert.ok(gap >= 0 && gap <= 8, `the list starts ${Math.round(gap)} px under the cell`);
    await key('Escape');
  });

  // ----- 6. The parts page's sample follows the room -----
  const PART_SIZES = [
    { name: 'PC 1280×800', w: 1280, h: 800, touch: false },
    { name: 'tablet 820×1180 touch', w: 820, h: 1180, touch: true },
    { name: 'phone 390×844 touch', w: 390, h: 844, touch: true },
    { name: 'small phone 320×640 touch', w: 320, h: 640, touch: true },
  ];
  const WINDOWS = [
    ['Full width', null],
    ['683 px', 683],
    ['768 px', 768],
    ['820 px', 820],
  ];
  const PANELS = [
    ['Standard 72 px', 72],
    ['Largest 96 px', 96],
  ];
  const radio = (label) => `[...document.querySelectorAll('.parts-room-controls [role=radio]')].find((b) => b.textContent.trim() === ${JSON.stringify(label)})`;
  const sample = () =>
    ev(`(() => {
      const page = document.querySelector('.parts-room-page');
      const roster = document.querySelector('.parts-room-roster');
      const said = document.querySelector('.parts-room-readout b');
      return { outer: page.offsetWidth, said: said ? Number.parseInt(said.textContent, 10) : null, stacked: roster.classList.contains('is-stacked'),
        note: Boolean(document.querySelector('.parts-room-note')),
        cards: document.querySelectorAll('.parts-room-card').length, rows: document.querySelectorAll('.parts-room-row:not(.is-head)').length,
        sideways: document.documentElement.scrollWidth > window.innerWidth };
    })()`);
  async function openPart(state) {
    await tab.open('about:blank', 0);
    await tab.open(`${base}parts.html#L02/${state}`, 1200);
  }
  for (const s of PART_SIZES) {
    await check(`parts page, ${s.name}: the sample's room is its page area, and the roster stacks exactly while it is under ${SAMPLE_LIMIT} px`, async () => {
      await size(s.w, s.h, s.touch);
      await openPart('room');
      const frames = await ev('window.__frames');
      assert.ok(frames.length > 0 && !frames.includes('…'), `the first frames already show the room (frames: ${frames.slice(0, 4).join(' | ')})`);
      const seen = new Set();
      for (const [windowLabel, windowWidth] of WINDOWS) {
        for (const [panelLabel, panelWidth] of PANELS) {
          await press(radio(windowLabel), windowLabel);
          await press(radio(panelLabel), panelLabel);
          const r = await sample();
          const what = `${windowLabel}, ${panelLabel}: room ${r.outer}`;
          assert.equal(r.said, r.outer, `${what}: the sample says ${r.said}`);
          if (windowWidth !== null) {
            const fits = !r.note;
            if (fits) assert.equal(r.outer, windowWidth - panelWidth, `${what}: should be ${windowWidth} − ${panelWidth}`);
            else assert.ok(r.outer + panelWidth < windowWidth, `${what}: says the screen is too narrow, but it isn't`);
          } else {
            assert.equal(r.note, false, `${what}: no note for Full width`);
          }
          assert.equal(r.stacked, r.outer < SAMPLE_LIMIT, `${what}: stacked is ${r.stacked}`);
          assert.equal(r.stacked ? r.cards : r.rows, 3, `${what}: three students drawn`);
          assert.equal(r.sideways, false, `${what}: the parts page scrolls sideways`);
          seen.add(r.stacked);
        }
      }
      if (s.w >= 1024) assert.equal(seen.size, 2, 'at PC width both layouts were seen');
    });
  }
  await check('parts page, PC 1280×800: the "narrow" state opens with a 683 px window and Largest, stacked, room 587 px', async () => {
    await size(1280, 800, false);
    await openPart('narrow');
    const r = await sample();
    assert.equal(r.outer, 683 - 96);
    assert.equal(r.said, r.outer);
    assert.equal(r.stacked, true);
  });

  // ----- 7. Report only: roster cells and boxes wider than their room -----
  // A cell wider than its room means words cut off or running into the next cell; a roster box wider
  // than its room means a whole table cut off at its edge (Camps' Friday at 768 with Largest).
  const cellsOver = () =>
    ev(`(() => {
      const c = document.querySelector('.shell-content');
      const cells = [...c.querySelectorAll('[role=cell], [role=columnheader], td, th')].filter((x) => x.offsetParent !== null && x.scrollWidth > x.clientWidth + 1);
      const words = cells.slice(0, 4).map((x) => '"' + x.textContent.trim().replace(/\\s+/g, ' ').slice(0, 24) + '"');
      const boxes = [...c.querySelectorAll('.ev-roster, .cp-rtable-wrap, .clist')]
        .filter((b) => b.offsetParent !== null && b.scrollWidth > b.clientWidth + 1)
        .map((b) => b.className.split(' ')[0] + ' +' + (b.scrollWidth - b.clientWidth) + ' px');
      return { room: Number(c.dataset.pageRoom), page: c.scrollWidth - c.clientWidth, count: cells.length, words, boxes };
    })()`);
  const ROSTERS = [
    ['Color Belt, November Children Testing', async () => openApp(EVENT)],
    ['Star, Fall Star Testing', async () => openApp(STAR_EVENT)],
    [
      'Camps, April Vacation Camp',
      async () => {
        await openApp('camps');
        await press(`[...document.querySelectorAll('.shell-content a, .shell-content button, .shell-content [role=link], .shell-content span')].find((x) => x.textContent.trim() === 'April Vacation Camp')`, 'April Vacation Camp');
        await sleep(1200);
      },
    ],
  ];
  for (const [w, h, isTouch, panel, label] of only
    ? [] // only some checks: no report
    : [
        [683, 800, false, 'standard', '683 wide with a mouse, Standard'],
        [768, 1024, true, 'largest', '768×1024 touch, Largest'],
        [1024, 768, false, 'largest', '1024×768 with a mouse, Largest'],
      ]) {
    await size(w, h, isTouch);
    await savePanel(panel);
    for (const [name, open] of ROSTERS) {
      try {
        await open();
        // Wait until the roster's rows are drawn (its data loads after the page opens), then a moment.
        for (let i = 0; i < 40; i += 1) {
          if (await ev(`document.querySelectorAll('.shell-content [role=cell], .shell-content td').length > 0`)) break;
          await sleep(200);
        }
        await sleep(400);
        const o = await cellsOver();
        report.push(
          `${label} (room ${o.room} px), ${name}: ${o.count} cell(s) wider than their room${o.count ? ` (${o.words.join(', ')}${o.count > 4 ? ', …' : ''})` : ''}; ` +
            `${o.boxes.length ? `boxes wider than their room: ${o.boxes.join(', ')}` : 'no box wider than its room'}; the page scrolls sideways by ${o.page} px`,
        );
      } catch (error) {
        report.push(`${label}, ${name}: couldn't measure (${error.message})`);
      }
    }
  }
  await ev(`localStorage.removeItem('tkd.preview.userMetadata')`);
});

console.log('\nReport (for the sections; not a check):');
for (const line of report) console.log(`  - ${line}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
