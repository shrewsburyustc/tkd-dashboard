// oneshot.mjs — runs some JavaScript in the preview page and takes the screenshot in ONE connection
// to the hidden Chrome. Why: cdp.mjs reconnects for every command and puts the screen size back each
// time; on touch phone sizes that makes the phone page draw itself again, dropping what a mockup
// script added. Here the size is set once, then the script runs, then the picture is taken.
// Usage: node oneshot.mjs <w> <h> <touch|-> <out.png> <js-file>...   (TKD_CDP_PORT as cdp.mjs)
import { readFileSync, writeFileSync } from 'node:fs';

const [w, h, touchArg, out, ...files] = process.argv.slice(2);
const touch = touchArg === 'touch';
const port = Number(process.env.TKD_CDP_PORT || 9333);
const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = pages.find((p) => p.type === 'page' && p.url.startsWith('http://localhost'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
});
const send = (method, params = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send('Emulation.setDeviceMetricsOverride', { width: Number(w), height: Number(h), deviceScaleFactor: 1, mobile: touch && Number(w) < 768 });
await send('Emulation.setTouchEmulationEnabled', touch ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
await sleep(600);
for (const f of files) {
  const r = await send('Runtime.evaluate', { expression: readFileSync(f, 'utf8'), awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) { console.error(f, JSON.stringify(r.result.exceptionDetails).slice(0, 400)); process.exit(1); }
  console.log(f, JSON.stringify(r.result?.result?.value ?? null).slice(0, 200));
}
// the mouse off everything, so nothing shows its hover color
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Number(w) - 2, y: Number(h) - 2 });
await sleep(400);
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
console.log('saved', out);
ws.close();
