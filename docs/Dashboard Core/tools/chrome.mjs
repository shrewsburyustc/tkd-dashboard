// chrome.mjs — a small remote control for a hidden (headless) Chrome, shared by the mockup tools.
// Why: the review pictures must be real browser screenshots at exact sizes, taken the same way
// every time. How: Chrome starts with a debugging port and is driven with the Chrome DevTools
// Protocol (CDP — the same remote control Chrome's own DevTools use), as the Design Review's
// tools/shoot.mjs does. Node 22+ has WebSocket built in, so nothing is downloaded.
//
// Usage:
//   import { withChrome } from './chrome.mjs';
//   await withChrome(async (page) => {
//     await page.size({ w: 390, h: 844, touch: true, scale: 2 });
//     await page.open('file:///…/mockup.html');
//     const value = await page.evaluate('document.title');
//     const png = await page.shot({ x, y, width, height });   // a Buffer
//   });

import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// The four review sizes (CLAUDE.md). The 320 one is a touch phone too, as in the Design Review.
export const SIZES = [
  { name: 'pc', label: 'PC · 1280×800', w: 1280, h: 800, touch: false },
  { name: 'tablet', label: 'Tablet · 820×1180 touch', w: 820, h: 1180, touch: true },
  { name: 'phone', label: 'Phone · 390×844 touch', w: 390, h: 844, touch: true },
  { name: 'small', label: 'Small phone · 320×640 touch', w: 320, h: 640, touch: true },
];

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function withChrome(work) {
  const port = 9300 + Math.floor(Math.random() * 500);
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${port}`, `--user-data-dir=${join(tmpdir(), `tkd-mock-${port}`)}`, 'about:blank',
  ], { stdio: 'ignore' });

  async function json(path) {
    for (let i = 0; i < 50; i++) {
      try { return await (await fetch(`http://127.0.0.1:${port}${path}`)).json(); }
      catch { await sleep(200); }
    }
    throw new Error('Chrome did not start');
  }

  try {
    const target = (await json('/json/list')).find((t) => t.type === 'page');
    const ws = new WebSocket(target.webSocketDebuggerUrl);
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
    let scale = 1;

    const page = {
      // Screen size; "touch" pretends to be a finger device (pointer: coarse, hover: none).
      async size({ w, h, touch = false, scale: s = 1 }) {
        scale = s;
        await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: s, mobile: touch && w < 768 });
        await send('Emulation.setTouchEmulationEnabled', touch ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
        // Hidden Chrome leaves out scroll bars by default; a list's thin scroll bar is part of
        // the design (the cue that it goes on), so draw them.
        await send('Emulation.setScrollbarsHidden', { hidden: false }).catch(() => {});
        await send('Emulation.setEmulatedMedia', {
          features: touch
            ? [{ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' }]
            : [{ name: 'pointer', value: 'fine' }, { name: 'hover', value: 'hover' }],
        });
      },
      // Go to an address and wait until it has loaded (plus a moment for late drawing).
      async open(url, settleMs = 600) {
        events.length = 0;
        await send('Page.navigate', { url });
        for (let i = 0; i < 100 && !events.includes('Page.loadEventFired'); i++) await sleep(100);
        // The page's own scroll bar takes 15 px of width while the page is measured, then goes
        // away while a full-page picture is taken (Chrome stretches the page to its full height),
        // so text above a frame wraps differently and the crop lands too low (M8's tablet
        // pictures, 2026-10-27). Hide just that one; lists inside the page keep theirs.
        await send('Runtime.evaluate', { expression: "document.documentElement.style.scrollbarWidth = 'none'" });
        await sleep(settleMs);
      },
      // Run JavaScript in the page and return its (JSON-able) answer.
      async evaluate(expression) {
        return (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;
      },
      // Any other DevTools Protocol command, for a tool that needs one this file doesn't wrap
      // (e.g. shoot-parts.mjs: Emulation.setFocusEmulationEnabled, print media, real key presses).
      async cdp(method, params = {}) {
        return send(method, params);
      },
      // The page's full height in CSS pixels.
      async height() {
        const { cssContentSize } = await send('Page.getLayoutMetrics');
        return Math.ceil(cssContentSize.height);
      },
      // A PNG of part of the page (CSS pixels); the picture is `scale` times larger.
      // beyond: true (the default) can picture parts of the page below the screen — but while it
      // does, Chrome takes the keyboard focus off the page, so no focus ring is drawn. A picture
      // that fits on the screen and must show the focus ring passes { beyond: false }
      // (shoot-parts.mjs, 2026-10-27).
      async shot(clip, { beyond = true } = {}) {
        const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: beyond, clip: { ...clip, scale: 1 } });
        return Buffer.from(r.data, 'base64');
      },
      get scale() { return scale; },
    };
    await work(page);
    ws.close();
  } finally {
    chrome.kill();
  }
}
