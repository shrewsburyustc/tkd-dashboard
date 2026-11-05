// cdp.mjs — a small remote control for a hidden (headless) Chrome, used by the Design Review to take
// exact-size screenshots of the PREVIEW app (fake database) for the review pictures.
// Why: the review needs real screenshots saved as files, at fixed sizes (1280×800, 820×1180 touch,
// 390×844 touch, 320 wide), and a way to click through screens the same way every time.
// How: Chrome runs in the background with a debugging port. A second small background process, the
// "holder", keeps ONE connection to the page open, using the Chrome DevTools Protocol (the same
// "remote control" Chrome's own DevTools use). Each command below hands its work to the holder over a
// local address and prints the answer. Chrome keeps the page, so commands can be chained.
// Why a holder: Chrome forgets the screen size and touch mode the moment a connection closes. When every
// command opened and closed its own connection, the page jumped back to Chrome's own window size between
// two commands and was resized again by the next one, so a popup the app had placed for the tablet size
// sat in the wrong spot in the next picture. One connection that stays open keeps the size put.
// Node 22+ has WebSocket and fetch built in, so nothing is downloaded. Never point it at the live
// site — preview addresses (localhost) only.
//
// Commands (run from any folder):
//   node cdp.mjs launch                   start the hidden Chrome and the holder (profile in the system temp folder)
//   node cdp.mjs quit                     close both (works even while another command is stuck)
//   node cdp.mjs open <url>               go to an address and wait for it to load
//   node cdp.mjs reload
//   node cdp.mjs size <w> <h> [touch]     screen size in whole pixels; "touch" pretends to be a finger device
//                                         (pointer: coarse, hover: none); the page reloads when touch mode changes
//   node cdp.mjs eval "<js>"              run JavaScript in the page and print the answer
//   node cdp.mjs click "<label>"          click the visible button/link/menu item/tab with that text
//                                         or aria-label (exact match first, then "contains")
//   node cdp.mjs clicksel "<css>"         click the first visible element matching a CSS selector
//   node cdp.mjs type "<css>" "<text>"    replace the text in a field, like a person typing it
//   node cdp.mjs key <Key>                press a key (Escape, Enter, Tab, ArrowDown …)
//   node cdp.mjs drag x1 y1 x2 y2         press, move in steps, release (a mouse drag)
//   node cdp.mjs move x y                 move the mouse there without clicking (e.g. off a row before a
//                                         picture, so nothing shows its hover color)
//   node cdp.mjs wait "<text>" [ms]       wait until that text is on the page (default 8000 ms)
//   node cdp.mjs shot <out.png> [full]    screenshot (full = the whole page height); with
//                                         TKD_NET_OFFLINE=1 the network is cut for the picture (the page
//                                         hears "offline"), then plugged back in
//   node cdp.mjs rects "<css>" ...        print the boxes of matching elements (for amber outlines)
//   node cdp.mjs textrects "<text>" ...   print the boxes of the smallest elements containing the text
//   (node cdp.mjs hold                    internal: the holder itself; launch and the other commands start it)
//
// Settings: TKD_CDP_PORT (default 9333) is Chrome's port. The holder listens on that port + 10000 (19333),
// on this computer only, far from the Chrome ports other sessions use. TKD_CDP_TIMEOUT_MS (default 60000)
// is how long the holder waits for Chrome to answer one step before it gives up on that command; the holder
// reads it when it starts, so set it on `launch`.
// The last size is remembered in cdp-state.json inside the Chrome profile folder; a new holder puts it
// back when it connects. Each holder writes its port and a fresh key to cdp-holder.json there, so only
// these commands can talk to it. If the holder isn't running, the next command starts it.

import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.TKD_CDP_PORT || 9333);
const HOLD_PORT = PORT + 10000;
const TIMEOUT_MS = Number(process.env.TKD_CDP_TIMEOUT_MS) > 0 ? Number(process.env.TKD_CDP_TIMEOUT_MS) : 60000;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PROFILE = join(tmpdir(), `tkd-design-review-chrome-${PORT}`);
const STATE = join(PROFILE, 'cdp-state.json');
const HOLDER = join(PROFILE, 'cdp-holder.json');
const COMMANDS = new Set(['quit', 'open', 'reload', 'size', 'eval', 'click', 'clicksel', 'type', 'key', 'drag', 'move',
  'wait', 'shot', 'rects', 'textrects']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wholePixels = (n) => Number.isInteger(n) && n > 0;

const [cmd, ...args] = process.argv.slice(2);

// The remembered size. A damaged file (say, from a typo in an older version) falls back to the PC size.
function readState() {
  const fallback = { w: 1280, h: 800, touch: false };
  try {
    const s = JSON.parse(readFileSync(STATE, 'utf8'));
    return wholePixels(s.w) && wholePixels(s.h) ? { w: s.w, h: s.h, touch: !!s.touch } : fallback;
  } catch { return fallback; }
}
function writeState(s) { mkdirSync(PROFILE, { recursive: true }); writeFileSync(STATE, JSON.stringify(s)); }
function readHolder() { try { return JSON.parse(readFileSync(HOLDER, 'utf8')); } catch { return null; } }

async function getJson(path, tries = 50) {
  for (let i = 0; i < tries; i++) {
    try { return await (await fetch(`http://127.0.0.1:${PORT}${path}`)).json(); }
    catch { await sleep(200); }
  }
  throw new Error(`No Chrome on port ${PORT}. Run: node cdp.mjs launch`);
}

// The screen size and touch mode. Set on the holder's connection, they stay until that connection closes.
async function applySize(send, s) {
  await send('Emulation.setDeviceMetricsOverride', { width: s.w, height: s.h, deviceScaleFactor: 1, mobile: s.touch && s.w < 768 });
  await send('Emulation.setTouchEmulationEnabled', s.touch ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
  await send('Emulation.setEmulatedMedia', { features: s.touch
    ? [{ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' }, { name: 'any-pointer', value: 'coarse' }, { name: 'any-hover', value: 'none' }]
    : [{ name: 'pointer', value: 'fine' }, { name: 'hover', value: 'hover' }] });
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
      if (events.length > 2000) events.splice(0, events.length - 2000); // the holder runs for hours
      // Accept any "Leave site?" or alert box so a command never hangs on it.
      if (m.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
    }
  });
  // If Chrome goes away, fail whatever is still waiting instead of hanging.
  ws.addEventListener('close', () => {
    for (const done of waiting.values()) done({ error: { message: 'Chrome closed the connection' } });
    waiting.clear();
  });
  // One step: ask Chrome, wait for its answer, and give up after TIMEOUT_MS, so a step that never ends
  // (a page script that never finishes, say) can't block every command after it.
  const send = (method, params = {}) => new Promise((res, rej) => {
    // A closed connection drops what is sent without a word, so say so straight away.
    if (ws.readyState !== WebSocket.OPEN) { rej(new Error(`${method}: Chrome closed the connection`)); return; }
    const n = ++id;
    const timer = setTimeout(() => {
      waiting.delete(n);
      rej(new Error(`${method}: no answer from Chrome after ${Math.round(TIMEOUT_MS / 1000)} s`));
    }, TIMEOUT_MS);
    timer.unref();
    waiting.set(n, (m) => { clearTimeout(timer); if (m.error) rej(new Error(`${method}: ${m.error.message}`)); else res(m.result); });
    try { ws.send(JSON.stringify({ id: n, method, params })); }
    catch (e) { clearTimeout(timer); waiting.delete(n); rej(e); }
  });
  try {
    await send('Page.enable');
    await send('Runtime.enable');
    // Put the remembered size (and touch mode) on this connection; it stays while the connection is open.
    await applySize(send, readState());
  } catch (e) { ws.close(); throw e; } // an open connection would keep this process alive for nothing
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

// Runs one command on the holder's open connection. `say` prints a line back to whoever asked.
async function run(c, cmd, args, env, say) {
  if (cmd === 'quit') {
    await Promise.race([c.send('Browser.close').catch(() => {}), sleep(1500)]);
    say('closed');
  }
  else if (cmd === 'open') { c.events.length = 0; await c.send('Page.navigate', { url: args[0] }); await c.waitLoad(); say(await c.evaluate('location.href')); }
  else if (cmd === 'reload') { c.events.length = 0; await c.send('Page.reload'); await c.waitLoad(); say('reloaded'); }
  else if (cmd === 'size') {
    const w = Number(args[0]); const h = Number(args[1]);
    if (!wholePixels(w) || !wholePixels(h)) throw new Error('size needs a width and a height in whole pixels, e.g. size 390 844 touch');
    const s = { w, h, touch: args[2] === 'touch' };
    const before = readState();
    await applySize(c.send, s);
    writeState(s); // remembered only once Chrome took it
    if (before.touch !== s.touch) {
      // Touch mode is read when the app starts, so reload with the new mode in place.
      c.events.length = 0; await c.send('Page.reload'); await c.waitLoad();
    }
    say(`size ${s.w}x${s.h}${s.touch ? ' touch' : ''}`);
  }
  else if (cmd === 'eval') { say(JSON.stringify(await c.evaluate(args[0]), null, 1) ?? 'undefined'); }
  else if (cmd === 'click' || cmd === 'clicksel') {
    // Scroll the first match into view instantly (the app scrolls smoothly, which would move the
    // target after we measured it), wait two frames, then measure where to click.
    const list = cmd === 'click'
      ? `(${FIND})(${JSON.stringify(args[0])}, false)`
      : `[...document.querySelectorAll(${JSON.stringify(args[0])})].filter((el) => el.getBoundingClientRect().width > 0)`;
    const expr = `(async () => { const els = ${list}; if (!els.length) return []; els[0].scrollIntoView({ block: 'center', behavior: 'instant' }); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return els.map((el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, text: (el.getAttribute('aria-label') || el.innerText || '').slice(0, 60) }; }); })()`;
    const hits = await c.evaluate(expr);
    if (!hits?.length) {
      const names = await c.evaluate(`[...document.querySelectorAll('button, a, [role=menuitem], [role=tab]')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => (e.getAttribute('aria-label') || e.innerText || '').trim().slice(0, 40)).filter(Boolean)`);
      throw new Error(`Nothing to click for "${args[0]}". Visible: ${names.join(' | ')}`);
    }
    await clickAt(c, hits[0].x, hits[0].y);
    await sleep(Number(args[1] || 500));
    say(`clicked "${hits[0].text.replace(/\s+/g, ' ')}"${hits.length > 1 ? ` (first of ${hits.length})` : ''}`);
  }
  else if (cmd === 'type') {
    // Only real fields count: the typing goes wherever the focus is, so refuse if the field didn't take it.
    const ok = await c.evaluate(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(args[0])})].find((e) => e.matches('input, textarea, [contenteditable=true]')); if (!el) return false; el.scrollIntoView({ block: 'center' }); el.focus(); if (el.select) el.select(); return document.activeElement === el; })()`);
    if (!ok) throw new Error(`No focusable field for ${args[0]}`);
    await c.send('Input.insertText', { text: args[1] });
    await sleep(250);
    say(`typed into ${args[0]}`);
  }
  else if (cmd === 'move') {
    const [x, y] = args.map(Number);
    await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await sleep(200);
    say(`moved to ${x},${y}`);
  }
  else if (cmd === 'drag') {
    // drag x1 y1 x2 y2 — press at one point, move there in small steps, release (like a mouse drag).
    const [x1, y1, x2, y2] = args.map(Number);
    await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1, y: y1 });
    await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x1, y: y1, button: 'left', clickCount: 1 });
    for (let i = 1; i <= 12; i++) {
      await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1 + ((x2 - x1) * i) / 12, y: y1 + ((y2 - y1) * i) / 12, button: 'left', buttons: 1 });
      await sleep(30);
    }
    await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x2, y: y2, button: 'left', clickCount: 1 });
    await sleep(Number(args[4] || 600));
    say(`dragged ${x1},${y1} → ${x2},${y2}`);
  }
  else if (cmd === 'key') {
    const key = args[0];
    const codes = { Escape: 27, Enter: 13, Tab: 9, ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39, Backspace: 8 };
    for (const type of ['keyDown', 'keyUp']) {
      await c.send('Input.dispatchKeyEvent', { type, key, code: key, windowsVirtualKeyCode: codes[key] ?? 0, nativeVirtualKeyCode: codes[key] ?? 0 });
    }
    await sleep(300);
    say(`pressed ${key}`);
  }
  else if (cmd === 'wait') {
    const ms = Number(args[1] || 8000); const start = Date.now();
    while (Date.now() - start < ms) {
      if (await c.evaluate(`document.body && document.body.innerText.includes(${JSON.stringify(args[0])})`)) { say(`found "${args[0]}"`); return; }
      await sleep(200);
    }
    throw new Error(`"${args[0]}" not on the page after ${ms} ms`);
  }
  else if (cmd === 'shot') {
    const out = args[0]; const full = args[1] === 'full';
    const offline = env.TKD_NET_OFFLINE === '1';
    if (offline) {
      // Pull the network plug for this picture: the page gets the browser's "offline" signal.
      await c.send('Network.enable');
      await c.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
      await sleep(Number(env.TKD_NET_OFFLINE_WAIT || 1500));
    }
    try {
      let clip;
      if (full) {
        const { cssContentSize } = await c.send('Page.getLayoutMetrics');
        clip = { x: 0, y: 0, width: readState().w, height: Math.ceil(cssContentSize.height), scale: 1 };
      }
      const shot = await c.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full, ...(clip ? { clip } : {}) });
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, Buffer.from(shot.data, 'base64'));
      say(`saved ${out}`);
    } finally {
      if (offline) {
        // The holder's connection stays open, so plug the network back in (a closing connection used to).
        await c.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
        await c.send('Network.disable');
      }
    }
  }
  else if (cmd === 'rects') {
    const res = {};
    for (const sel of args) res[sel] = await c.evaluate(`[...document.querySelectorAll(${JSON.stringify(sel)})].map((el) => { const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y + scrollY), Math.round(r.width), Math.round(r.height)]; }).filter((b) => b[2] > 0)`);
    say(JSON.stringify(res));
  }
  else if (cmd === 'textrects') {
    const res = {};
    for (const text of args) res[text] = await c.evaluate(`(() => { const want = ${JSON.stringify(text)}; const all = [...document.querySelectorAll('body *')].filter((el) => el.innerText && el.innerText.includes(want) && el.getBoundingClientRect().width > 0); const smallest = all.filter((el) => ![...el.children].some((ch) => ch.innerText && ch.innerText.includes(want))); return smallest.map((el) => { const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y + scrollY), Math.round(r.width), Math.round(r.height)]; }); })()`);
    say(JSON.stringify(res));
  }
  else throw new Error('Unknown command. See the comment at the top of cdp.mjs.');
}

// The holder: one connection to the page, kept open. Commands arrive over a local address (127.0.0.1, this
// computer only), must carry the key from cdp-holder.json, and run one at a time in the order they came;
// a failed or timed-out command doesn't block the next one, and quit goes ahead even of a stuck command.
async function hold() {
  const token = randomUUID();
  let c = null;
  let queue = Promise.resolve();
  const server = createServer((req, res) => {
    if (req.headers['x-token'] !== token) { res.writeHead(403); res.end(); return; }
    if (req.method === 'GET' && req.url === '/ping') { res.writeHead(200); res.end('ok'); return; }
    if (req.method !== 'POST' || req.url !== '/run') { res.writeHead(404); res.end(); return; }
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      let msg = null;
      try { msg = JSON.parse(body); } catch { /* answered below */ }
      const job = async () => {
        const out = [];
        let reply;
        try {
          if (!msg || typeof msg.cmd !== 'string') throw new Error('bad request');
          await run(c, msg.cmd, msg.args || [], msg.env || {}, (line) => out.push(line));
          reply = { ok: true, out };
        } catch (e) { reply = { ok: false, out, error: e.message }; }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(reply));
        if (msg?.cmd === 'quit') stop(0);
      };
      if (msg?.cmd === 'quit') job(); // closing Chrome also fails a stuck command, so its caller gets an answer
      else queue = queue.then(job);
    });
  });
  const stop = (code) => { server.close(); try { rmSync(HOLDER); } catch { /* already gone */ } setTimeout(() => process.exit(code), 200); };
  try {
    // Take the port first: it works as a lock, so a second holder for the same Chrome stops here.
    await new Promise((r, j) => { server.once('error', j); server.listen(HOLD_PORT, '127.0.0.1', r); });
    c = await connect();
  } catch { process.exit(1); } // no Chrome, or the port is taken: nothing for this holder to do
  c.ws.addEventListener('close', () => stop(0)); // Chrome closed: nothing left to hold
  writeFileSync(HOLDER, JSON.stringify({ port: HOLD_PORT, token, pid: process.pid }));
}

async function ping(h) {
  try {
    const r = await fetch(`http://127.0.0.1:${h.port}/ping`, { headers: { 'x-token': h.token }, signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch { return false; }
}

// Finds the running holder, or starts one (in the background, like Chrome) and waits for it. Any holder that
// answers with the key in cdp-holder.json is the right one, even if another command started it a moment ago.
async function ensureHolder() {
  const h = readHolder();
  if (h && await ping(h)) return h;
  await getJson('/json/version', 5); // is Chrome there at all? ("No Chrome on port …" if not)
  // cwd: the profile folder, so the holder never keeps a worktree folder busy (that can block archiving it).
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'hold'],
    { detached: true, stdio: 'ignore', windowsHide: true, cwd: PROFILE });
  let exited = false;
  child.once('exit', () => { exited = true; }); // it stops at once if its port is taken or Chrome isn't there
  child.unref();
  for (let i = 0, afterExit = 0; i < 75; i++) {
    await sleep(200);
    const n = readHolder();
    if (n && await ping(n)) return n; // ours, or one another command started a moment ago
    if (exited && ++afterExit > 10) break; // ours gave up and no other holder showed up in 2 s
  }
  throw new Error(`The holder didn't start on port ${HOLD_PORT}. Run: node cdp.mjs quit, then node cdp.mjs launch`);
}

// Closes Chrome through its own browser address (from /json/version), without a page or a holder.
async function closeChromeDirectly(version) {
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', () => j(new Error(`Couldn't reach Chrome on port ${PORT} to close it`)), { once: true }); });
  ws.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
  // Wait for Chrome to hang up, at most 1.5 s; the timer doesn't keep this command running after that.
  await new Promise((r) => { ws.addEventListener('close', r, { once: true }); setTimeout(r, 1500).unref(); });
  try { ws.close(); } catch { /* already closed */ }
}

async function main() {
  if (cmd === 'launch') {
    mkdirSync(PROFILE, { recursive: true });
    // --window-size: Chrome's own window size, seen only while no holder is connected. 1280 px keeps the
    // PC layout, where the app shows its PC-only parts (e.g. Prospects' Call button).
    const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--hide-scrollbars', '--window-size=1280,800', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, 'about:blank'],
      { detached: true, stdio: 'ignore', cwd: PROFILE });
    child.unref();
    await getJson('/json/version');
    if (!existsSync(STATE)) writeState({ w: 1280, h: 800, touch: false });
    await ensureHolder();
    console.log(`Chrome running on port ${PORT} (profile ${PROFILE}); holder on port ${HOLD_PORT}`);
    return;
  }
  if (cmd === 'hold') { await hold(); return; }
  if (!COMMANDS.has(cmd)) { console.log('Unknown command. See the comment at the top of cdp.mjs.'); process.exitCode = 1; return; }
  if (cmd === 'quit') {
    const h = readHolder();
    if (!(h && await ping(h))) {
      // No holder: close Chrome directly, if it is there at all.
      let version;
      try { version = await getJson('/json/version', 3); } catch { console.log('not running'); return; }
      await closeChromeDirectly(version);
      console.log('closed');
      return;
    }
  }
  const h = await ensureHolder();
  // The holder writes the picture, and it runs in another folder: send the file's full path.
  const list = cmd === 'shot' && args[0] ? [resolve(args[0]), ...args.slice(1)] : args;
  let reply;
  try {
    const res = await fetch(`http://127.0.0.1:${h.port}/run`, {
      method: 'POST',
      headers: { 'x-token': h.token, 'content-type': 'application/json' },
      body: JSON.stringify({ cmd, args: list, env: { TKD_NET_OFFLINE: process.env.TKD_NET_OFFLINE, TKD_NET_OFFLINE_WAIT: process.env.TKD_NET_OFFLINE_WAIT } }),
    });
    reply = await res.json();
  } catch {
    throw new Error('The holder stopped before it answered (did Chrome close?). Run: node cdp.mjs launch');
  }
  for (const line of reply.out || []) console.log(line);
  if (!reply.ok) { console.error(reply.error); process.exitCode = 1; }
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
