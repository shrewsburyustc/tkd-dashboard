// cdp.mjs — a small remote control for a hidden (headless) Chrome, used by the Design Review to take
// exact-size screenshots of the PREVIEW app (fake database) for the review pictures.
// Why: the review needs real screenshots saved as files, at fixed sizes (1280×800, 820×1180 touch,
// 390×844 touch, 320 wide), and a way to click through screens the same way every time.
// How: Chrome runs in the background with a debugging port; each command below connects to it with
// the Chrome DevTools Protocol (the same "remote control" Chrome's own DevTools use), does one thing,
// and exits. Chrome keeps the page, so commands can be chained. Node 22+ has WebSocket built in, so
// nothing is downloaded. Never point it at the live site — preview addresses (localhost) only.
//
// Commands (run from any folder):
//   node cdp.mjs launch                   start the hidden Chrome (profile in the system temp folder)
//   node cdp.mjs quit                     close it
//   node cdp.mjs open <url>               go to an address and wait for it to load
//   node cdp.mjs reload
//   node cdp.mjs size <w> <h> [touch]     screen size; "touch" pretends to be a finger device
//                                         (pointer: coarse, hover: none) and reloads the page
//   node cdp.mjs eval "<js>"              run JavaScript in the page and print the answer
//   node cdp.mjs click "<label>"          click the visible button/link/menu item/tab with that text
//                                         or aria-label (exact match first, then "contains")
//   node cdp.mjs clicksel "<css>"         click the first visible element matching a CSS selector
//   node cdp.mjs type "<css>" "<text>"    replace the text in a field, like a person typing it
//   node cdp.mjs key <Key>                press a key (Escape, Enter, Tab, ArrowDown …)
//   node cdp.mjs wait "<text>" [ms]       wait until that text is on the page (default 8000 ms)
//   node cdp.mjs shot <out.png> [full]    screenshot (full = the whole page height)
//   node cdp.mjs rects "<css>" ...        print the boxes of matching elements (for amber outlines)
//   node cdp.mjs textrects "<text>" ...   print the boxes of the smallest elements containing the text
//
// Settings: TKD_CDP_PORT (default 9333). The last size is remembered in cdp-state.json next to the
// Chrome profile, and put back on every command (Chrome forgets it when a command disconnects).

import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const PORT = Number(process.env.TKD_CDP_PORT || 9333);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PROFILE = join(tmpdir(), `tkd-design-review-chrome-${PORT}`);
const STATE = join(PROFILE, 'cdp-state.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const [cmd, ...args] = process.argv.slice(2);

function readState() {
  try { return JSON.parse(readFileSync(STATE, 'utf8')); } catch { return { w: 1280, h: 800, touch: false }; }
}
function writeState(s) { mkdirSync(PROFILE, { recursive: true }); writeFileSync(STATE, JSON.stringify(s)); }

async function getJson(path, tries = 50) {
  for (let i = 0; i < tries; i++) {
    try { return await (await fetch(`http://127.0.0.1:${PORT}${path}`)).json(); }
    catch { await sleep(200); }
  }
  throw new Error(`No Chrome on port ${PORT}. Run: node cdp.mjs launch`);
}

async function connect() {
  const targets = await getJson('/json/list');
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('Chrome has no page open');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', j, { once: true }); });
  let id = 0;
  const waiting = new Map();
  const events = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); return; }
    if (m.method) {
      events.push(m.method);
      // Accept any "Leave site?" or alert box so a command never hangs on it.
      if (m.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
    }
  });
  const send = (method, params = {}) => new Promise((res, rej) => {
    const n = ++id;
    waiting.set(n, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  await send('Page.enable');
  await send('Runtime.enable');
  // Put the remembered size (and touch mode) back: Chrome drops it when the last command disconnected.
  const s = readState();
  await send('Emulation.setDeviceMetricsOverride', { width: s.w, height: s.h, deviceScaleFactor: 1, mobile: s.touch && s.w < 768 });
  await send('Emulation.setTouchEmulationEnabled', s.touch ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
  await send('Emulation.setEmulatedMedia', { features: s.touch
    ? [{ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' }, { name: 'any-pointer', value: 'coarse' }, { name: 'any-hover', value: 'none' }]
    : [{ name: 'pointer', value: 'fine' }, { name: 'hover', value: 'hover' }] });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const waitLoad = async (ms = 15000) => {
    const start = Date.now();
    while (Date.now() - start < ms && !events.includes('Page.loadEventFired')) await sleep(100);
    await sleep(600); // let the app draw
  };
  return { ws, send, evaluate, events, waitLoad };
}

// Finds the visible element a person would click for a given label. Runs inside the page.
const FIND = `(label, exactOnly) => {
  const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim().toLowerCase();
  const want = norm(label);
  const sel = 'button, a, [role=button], [role=menuitem], [role=menuitemradio], [role=menuitemcheckbox], [role=tab], [role=option], [role=radio], [role=switch], [role=link], [role=row][aria-label], [data-nav-row], tr[tabindex], summary, label, input[type=button], input[type=submit]';
  const visible = (el) => { const r = el.getBoundingClientRect(); const st = getComputedStyle(el); return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none'; };
  const els = [...document.querySelectorAll(sel)].filter(visible);
  const name = (el) => norm(el.getAttribute('aria-label') || el.innerText || el.value || el.title);
  let hit = els.filter((el) => name(el) === want);
  if (!hit.length && !exactOnly) hit = els.filter((el) => name(el).includes(want));
  hit.sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height);
  return hit;
}`;

async function clickAt(c, x, y) {
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await c.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  }
}

async function main() {
  if (cmd === 'launch') {
    mkdirSync(PROFILE, { recursive: true });
    const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--hide-scrollbars', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, 'about:blank'],
      { detached: true, stdio: 'ignore' });
    child.unref();
    await getJson('/json/version');
    if (!existsSync(STATE)) writeState({ w: 1280, h: 800, touch: false });
    console.log(`Chrome running on port ${PORT} (profile ${PROFILE})`);
    return;
  }
  const c = await connect();
  try {
    if (cmd === 'quit') { await c.send('Browser.close').catch(() => {}); console.log('closed'); }
    else if (cmd === 'open') { c.events.length = 0; await c.send('Page.navigate', { url: args[0] }); await c.waitLoad(); console.log(await c.evaluate('location.href')); }
    else if (cmd === 'reload') { c.events.length = 0; await c.send('Page.reload'); await c.waitLoad(); console.log('reloaded'); }
    else if (cmd === 'size') {
      const s = { w: Number(args[0]), h: Number(args[1]), touch: args[2] === 'touch' };
      const before = readState();
      writeState(s);
      if (before.touch !== s.touch) {
        // Touch mode is read when the app starts, so reload with the new mode in place.
        const c2 = await connect(); c2.events.length = 0; await c2.send('Page.reload'); await c2.waitLoad(); c2.ws.close();
      }
      console.log(`size ${s.w}x${s.h}${s.touch ? ' touch' : ''}`);
    }
    else if (cmd === 'eval') { console.log(JSON.stringify(await c.evaluate(args[0]), null, 1)); }
    else if (cmd === 'click' || cmd === 'clicksel') {
      const expr = cmd === 'click'
        ? `(${FIND})(${JSON.stringify(args[0])}, false).map((el) => { el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, text: (el.getAttribute('aria-label') || el.innerText || '').slice(0, 60) }; })`
        : `[...document.querySelectorAll(${JSON.stringify(args[0])})].filter((el) => el.getBoundingClientRect().width > 0).map((el) => { el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, text: (el.getAttribute('aria-label') || el.innerText || '').slice(0, 60) }; })`;
      const hits = await c.evaluate(expr);
      if (!hits?.length) {
        const names = await c.evaluate(`[...document.querySelectorAll('button, a, [role=menuitem], [role=tab]')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => (e.getAttribute('aria-label') || e.innerText || '').trim().slice(0, 40)).filter(Boolean)`);
        throw new Error(`Nothing to click for "${args[0]}". Visible: ${names.join(' | ')}`);
      }
      await clickAt(c, hits[0].x, hits[0].y);
      await sleep(Number(args[1] || 500));
      console.log(`clicked "${hits[0].text.replace(/\s+/g, ' ')}"${hits.length > 1 ? ` (first of ${hits.length})` : ''}`);
    }
    else if (cmd === 'type') {
      // Only real fields count: the typing goes wherever the focus is, so refuse if the field didn't take it.
      const ok = await c.evaluate(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(args[0])})].find((e) => e.matches('input, textarea, [contenteditable=true]')); if (!el) return false; el.scrollIntoView({ block: 'center' }); el.focus(); if (el.select) el.select(); return document.activeElement === el; })()`);
      if (!ok) throw new Error(`No focusable field for ${args[0]}`);
      await c.send('Input.insertText', { text: args[1] });
      await sleep(250);
      console.log(`typed into ${args[0]}`);
    }
    else if (cmd === 'key') {
      const key = args[0];
      const codes = { Escape: 27, Enter: 13, Tab: 9, ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39, Backspace: 8 };
      for (const type of ['keyDown', 'keyUp']) {
        await c.send('Input.dispatchKeyEvent', { type, key, code: key, windowsVirtualKeyCode: codes[key] ?? 0, nativeVirtualKeyCode: codes[key] ?? 0 });
      }
      await sleep(300);
      console.log(`pressed ${key}`);
    }
    else if (cmd === 'wait') {
      const ms = Number(args[1] || 8000); const start = Date.now();
      while (Date.now() - start < ms) {
        if (await c.evaluate(`document.body && document.body.innerText.includes(${JSON.stringify(args[0])})`)) { console.log(`found "${args[0]}"`); return; }
        await sleep(200);
      }
      throw new Error(`"${args[0]}" not on the page after ${ms} ms`);
    }
    else if (cmd === 'shot') {
      const out = args[0]; const full = args[1] === 'full';
      let clip;
      if (full) {
        const { cssContentSize } = await c.send('Page.getLayoutMetrics');
        clip = { x: 0, y: 0, width: readState().w, height: Math.ceil(cssContentSize.height), scale: 1 };
      }
      const shot = await c.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full, ...(clip ? { clip } : {}) });
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, Buffer.from(shot.data, 'base64'));
      console.log(`saved ${out}`);
    }
    else if (cmd === 'rects') {
      const res = {};
      for (const sel of args) res[sel] = await c.evaluate(`[...document.querySelectorAll(${JSON.stringify(sel)})].map((el) => { const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y + scrollY), Math.round(r.width), Math.round(r.height)]; }).filter((b) => b[2] > 0)`);
      console.log(JSON.stringify(res));
    }
    else if (cmd === 'textrects') {
      const res = {};
      for (const text of args) res[text] = await c.evaluate(`(() => { const want = ${JSON.stringify(text)}; const all = [...document.querySelectorAll('body *')].filter((el) => el.innerText && el.innerText.includes(want) && el.getBoundingClientRect().width > 0); const smallest = all.filter((el) => ![...el.children].some((ch) => ch.innerText && ch.innerText.includes(want))); return smallest.map((el) => { const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y + scrollY), Math.round(r.width), Math.round(r.height)]; }); })()`);
      console.log(JSON.stringify(res));
    }
    else { console.log('Unknown command. See the comment at the top of cdp.mjs.'); process.exitCode = 1; }
  } finally {
    c.ws.close();
  }
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
