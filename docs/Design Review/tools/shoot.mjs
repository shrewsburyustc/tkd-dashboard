// shoot.mjs — take a PNG screenshot of a page with headless Chrome, at an exact size,
// optionally pretending to be a touch screen (pointer: coarse, hover: none).
// Uses the Chrome DevTools Protocol over Node's built-in WebSocket (Node 22+), so no downloads.
//
// Usage: node shoot.mjs <url> <out.png> <width> <height> [touch] [full]
//   touch → emulate a finger device; full → capture the whole page height.

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const [url, out, w = '1280', h = '800', ...flags] = process.argv.slice(2);
const touch = flags.includes('touch');
const full = flags.includes('full');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9300 + Math.floor(Math.random() * 500);
const profile = join(tmpdir(), `tkd-shoot-${port}`);

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function json(path, method = 'GET') {
  for (let i = 0; i < 50; i++) {
    try { return await (await fetch(`http://127.0.0.1:${port}${path}`, { method })).json(); }
    catch { await sleep(200); }
  }
  throw new Error('Chrome did not start');
}

try {
  const targets = await json('/json/list');
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  const waiting = new Map();
  const events = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
    else if (m.method) events.push(m.method);
  });
  const send = (method, params = {}) => new Promise((res, rej) => {
    const n = ++id;
    waiting.set(n, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
    ws.send(JSON.stringify({ id: n, method, params }));
  });

  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: +w, height: +h, deviceScaleFactor: 1, mobile: touch && +w < 768,
  });
  if (touch) {
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await send('Emulation.setEmulatedMedia', {
      features: [{ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' }],
    });
  }
  await send('Page.navigate', { url });
  for (let i = 0; i < 100 && !events.includes('Page.loadEventFired'); i++) await sleep(100);
  await sleep(800); // let fonts and late renders settle
  let clip;
  if (full) {
    const { cssContentSize } = await send('Page.getLayoutMetrics');
    clip = { x: 0, y: 0, width: +w, height: Math.ceil(cssContentSize.height), scale: 1 };
  }
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full, ...(clip ? { clip } : {}) });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log(`saved ${out} (${w}x${h}${touch ? ', touch' : ''}${full ? ', full page' : ''})`);
  ws.close();
} finally {
  chrome.kill();
}
