// shoot-parts.mjs — takes the pictures of the shared parts page (parts.html), every state at the
// four review sizes, so the built parts can be laid next to the approved mockups.
// Why: Dashboard core step 1's proof (plan §4): the parts are checked against mockups M1–M8 at
// 1280×800, 820×1180 touch, 390×844 touch and 320×640 touch. The state ids are the mockups' own
// (Mockups/shots/M#/states.json), so every built picture has a mockup picture with the same name.
// How: a hidden Chrome (chrome.mjs) opens parts.html#M#/<state> fresh for every picture (a blank
// page first, so nothing is left over), waits for the page's own scripted presses to finish, then
//   - a dialog state:   the box with a margin of dimmed page around it (24 px above and below, 40 px
//                       at the sides, as the mockups' gray stage); on a phone the whole screen, the
//                       full-screen page. When the dialog's content is longer than the screen, a
//                       second picture <state>@<size>-full.png shows all of it (the window made as
//                       tall as the content), as the mockups draw it.
//   - an inline state:  the page's [data-shot] box (the part with its sample context, as the
//                       mockups' frames), plus anything the part opened over the page (the Mark paid
//                       box, an open time list).
//   - the printed page (M4 paper): Chrome pretends to print (print media) on a US Letter sized
//                       window (8.5 × 11 in at 96 px per inch) — once, saved as paper@pc.png, as
//                       the mockup draws it once.
// "Focus emulation" makes the hidden Chrome behave like a window that has the focus, so keyboard
// focus rings are drawn as a person sees them. Pictures are 2× (sharp when zoomed).
//
// Usage: node shoot-parts.mjs <preview address, e.g. http://localhost:5190/> <outdir> [M1 M2 …]
//   saves <outdir>/<M#>/<state>@<pc|tablet|phone|small>.png (and -full.png when needed) and
//   <outdir>/<M#>/states.json (the mockup's ids and captions, for compose-parts-review.mjs).
// Only ever point it at `npm run dev:preview-mode`: the parts page refuses to draw otherwise.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withChrome, SIZES } from './chrome.mjs';

const [base, outArg, ...only] = process.argv.slice(2);
if (!base || !outArg) {
  console.error('Usage: node shoot-parts.mjs <preview address> <outdir> [M1 M2 …]');
  process.exit(1);
}
const outdir = resolve(outArg);
const mockShots = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'Mockups', 'shots');
const PARTS = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8'].filter((id) => only.length === 0 || only.includes(id));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LETTER = { w: 816, h: 1056 }; // 8.5 × 11 in at 96 px per inch

// Where to crop, worked out in the page (CSS pixels). `kind` comes from the page (data-kind).
const MEASURE = `(() => {
  const page = document.querySelector('.parts-page');
  if (!page) return { error: 'no parts page' };
  const kind = page.dataset.kind;
  const vw = window.innerWidth, vh = window.innerHeight;
  const rect = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; };
  if (kind === 'dialog') {
    const pages = [...document.querySelectorAll('body > .dialog-page')];
    const boxes = [...document.querySelectorAll('body > .dialog-backdrop > .dialog')];
    if (pages.length) {
      const body = pages[pages.length - 1].querySelector('.dialog-page-body');
      const extra = body ? Math.max(0, body.scrollHeight - body.clientHeight) : 0;
      return { kind, clip: { x: 0, y: 0, w: vw, h: vh }, overflow: extra };
    }
    if (boxes.length) {
      const box = boxes[boxes.length - 1];
      const r = rect(box);
      const x = Math.max(0, r.x - 40), y = Math.max(0, r.y - 24);
      const extra = Math.max(0, box.scrollHeight - box.clientHeight);
      return { kind, clip: { x, y, w: Math.min(vw, r.x + r.w + 40) - x, h: Math.min(vh, r.y + r.h + 24) - y }, overflow: extra };
    }
    return { error: 'no dialog open' };
  }
  if (kind === 'print') return { kind, clip: { x: 0, y: 0, w: vw, h: vh } };
  const shot = document.querySelector('[data-shot]');
  if (!shot) return { error: 'no [data-shot]' };
  let r = rect(shot);
  for (const extra of document.querySelectorAll('.mpb, .fa-list:not([hidden])')) {
    const e = rect(extra);
    if (e.w < 1 || e.h < 1) continue;
    const x0 = Math.min(r.x, e.x), y0 = Math.min(r.y, e.y);
    const x1 = Math.max(r.x + r.w, e.x + e.w), y1 = Math.max(r.y + r.h, e.y + e.h);
    r = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  return { kind, clip: { x: Math.max(0, Math.floor(r.x)), y: Math.max(0, Math.floor(r.y)), w: Math.ceil(r.w), h: Math.ceil(r.h) } };
})()`;

async function openState(tab, part, state) {
  await tab.open('about:blank', 0);
  await tab.open(`${base}parts.html#${part}/${state}`, 300);
  // Wait for the page (the first open compiles its files), then for its scripted presses.
  for (let i = 0; i < 100; i += 1) {
    if (await tab.evaluate(`Boolean(document.querySelector('.parts-page[data-state]'))`)) break;
    await sleep(100);
  }
  await sleep(1400);
}

// A picture that fits on the screen is taken as the screen shows it ({ beyond: false }): Chrome's
// "beyond the screen" pictures take the keyboard focus away, and with it the focus ring.
async function shoot(tab, file, clip) {
  const fits = await tab.evaluate(`${clip.y + clip.h} <= window.innerHeight + scrollY && ${clip.x + clip.w} <= window.innerWidth + scrollX`);
  writeFileSync(file, await tab.shot({ x: clip.x, y: clip.y, width: clip.w, height: clip.h }, { beyond: !fits }));
}

const problems = [];
await withChrome(async (tab) => {
  await tab.cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  for (const part of PARTS) {
    const states = JSON.parse(readFileSync(join(mockShots, part, 'states.json'), 'utf8'));
    mkdirSync(join(outdir, part), { recursive: true });
    writeFileSync(join(outdir, part, 'states.json'), JSON.stringify(states, null, 2));
    for (const size of SIZES) {
      for (const { id } of states) {
        const print = part === 'M4' && id === 'paper';
        if (print && size.name !== 'pc') continue; // the printed page is the same on every device: once
        if (print) {
          await tab.size({ w: LETTER.w, h: LETTER.h, touch: false, scale: 2 });
          await openState(tab, part, id);
          // The paper's margins as the body's padding, for this picture only (parts.css); a real
          // print from the page uses the receipt's own @page margins.
          await tab.evaluate("document.documentElement.dataset.partsShot = 'paper'");
          await tab.cdp('Emulation.setEmulatedMedia', { media: 'print', features: [{ name: 'pointer', value: 'fine' }, { name: 'hover', value: 'hover' }] });
          await sleep(300);
        } else {
          await tab.size({ ...size, scale: 2 });
          await openState(tab, part, id);
        }
        const m = await tab.evaluate(MEASURE);
        if (m.error) {
          problems.push(`${part}/${id}@${size.name}: ${m.error}`);
          continue;
        }
        await shoot(tab, join(outdir, part, `${id}@${size.name}.png`), m.clip);
        // A dialog longer than the screen: once more in a window as tall as its content.
        if (m.kind === 'dialog' && m.overflow > 1) {
          await tab.size({ ...size, h: size.h + Math.ceil(m.overflow) + 2, scale: 2 });
          await openState(tab, part, id);
          const full = await tab.evaluate(MEASURE);
          if (!full.error) await shoot(tab, join(outdir, part, `${id}@${size.name}-full.png`), full.clip);
        }
        if (print) await tab.cdp('Emulation.setEmulatedMedia', { media: '' });
      }
      console.log(`${part} · ${size.label}: ${states.length} states`);
    }
  }
});
if (problems.length) {
  console.log(`PROBLEMS (${problems.length}):\n  ${problems.join('\n  ')}`);
  process.exitCode = 1;
} else {
  console.log('all states pictured');
}
