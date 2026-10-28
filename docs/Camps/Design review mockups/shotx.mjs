// shotx.mjs — one screenshot of the page that docs/Design Review/tools/cdp.mjs is driving, with the mock-up
// drawn in the SAME connection. Why: Chrome forgets the screen size and touch mode whenever a cdp.mjs command
// disconnects, and the app re-draws when "touch" flips back on (e.g. Camper detail's "More" comes and goes),
// which can wipe a mock-up drawn by an earlier command. This script puts the size and touch mode back, waits
// for the app to settle, runs the mock-up scripts, and shoots — all while connected.
// Usage: TKD_CDP_PORT=9787 node shotx.mjs <out.png> [--dsf 2] [--eval file.js]... [--js "code"]... [--full] [--print]
// The size comes from cdp.mjs's remembered state (node cdp.mjs size <w> <h> [touch]).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const PORT = Number(process.env.TKD_CDP_PORT || 9333);
const args = process.argv.slice(2);
const out = args[0];
let dsf = 1; let full = false; let print = false; const scripts = [];
for (let i = 1; i < args.length; i++) {
  if (args[i] === '--dsf') dsf = Number(args[++i]);
  else if (args[i] === '--eval') scripts.push(readFileSync(args[++i], 'utf8'));
  else if (args[i] === '--js') scripts.push(args[++i]);
  else if (args[i] === '--full') full = true;
  else if (args[i] === '--print') print = true; // show the page as the printer sees it (print CSS)
}
const state = JSON.parse(readFileSync(join(tmpdir(), `tkd-design-review-chrome-${PORT}`, 'cdp-state.json'), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const page = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const waiting = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } });
const send = (method, params = {}) => new Promise((res, rej) => { const n = ++id; waiting.set(n, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id: n, method, params })); });
await send('Emulation.setDeviceMetricsOverride', { width: state.w, height: state.h, deviceScaleFactor: dsf, mobile: state.touch && state.w < 768 });
await send('Emulation.setTouchEmulationEnabled', state.touch ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
await send('Emulation.setEmulatedMedia', { media: print ? 'print' : '', features: state.touch
  ? [{ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' }, { name: 'any-pointer', value: 'coarse' }, { name: 'any-hover', value: 'none' }]
  : [{ name: 'pointer', value: 'fine' }, { name: 'hover', value: 'hover' }] });
await sleep(900); // let the app re-draw for the touch mode
for (const code of scripts) {
  const r = await send('Runtime.evaluate', { expression: code, awaitPromise: true, returnByValue: true });
  console.log('mock:', r.exceptionDetails ? r.exceptionDetails.exception?.description : JSON.stringify(r.result.value));
}
await sleep(300);
let clip;
if (full) {
  const { cssContentSize } = await send('Page.getLayoutMetrics');
  clip = { x: 0, y: 0, width: state.w, height: Math.ceil(cssContentSize.height), scale: 1 };
}
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full, ...(clip ? { clip } : {}) });
writeFileSync(out, Buffer.from(shot.data, 'base64'));
ws.close();
console.log(`saved ${out} (${state.w}x${state.h}${state.touch ? ' touch' : ''}, ${dsf}x)`);
