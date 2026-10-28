// compose-review.mjs — makes the SCREEN-WIDTH review picture for one mockup (an HTML page, then a PNG).
// Why: compose-sheet.mjs puts every state at every size on one sheet at full size. For M1 that
// came out 5030×22954 px — far too big to read on a screen (Jeffrey said a big combined picture
// looked "smudged", 2026-10-23). The design review's pictures he approved were about 2000 px wide.
// This page is ~2200 px wide: the main state at all four sizes, the other states side by side at
// one size, every picture shrunk by the same amount so their sizes still compare honestly. The
// full sheet stays as the record.
//
// Usage: node compose-review.mjs <spec.json>   → writes <out>.html and <out>.png
// Spec (paths relative to the spec file):
//   { "title": "…", "intro": "…" (HTML allowed), "shots": "<folder made by shoot-states.mjs>",
//     "out": "<name without extension>", "width": 1100 (CSS px; the PNG is twice that),
//     "scale": 0.6 (how much every picture is shrunk),
//     "sections": [
//       { "head": "…", "states": ["id", …] (their captions, numbered), "pics": ["id@size", …] },
//       { "head": "…", "grid": ["id@size", …] }   ← each cell: number, caption, picture
//     ],
//     "footer": "…" (HTML allowed) }

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { withChrome, SIZES } from './chrome.mjs';

const specPath = resolve(process.argv[2]);
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const base = dirname(specPath);
const shots = resolve(base, spec.shots);
const out = resolve(base, spec.out);
const width = spec.width ?? 1100;
const scale = spec.scale ?? 0.6;
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// A PNG's width and height are stored at fixed places in its header (bytes 16–23).
function pngSize(file) {
  const b = readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

// The states in page order: their number (as on the full sheet) and caption.
const all = JSON.parse(readFileSync(join(shots, 'states.json'), 'utf8'));
const number = (id) => all.findIndex((s) => s.id === id) + 1;
const caption = (id) => all.find((s) => s.id === id)?.caption ?? id;
const label = (size) => SIZES.find((s) => s.name === size)?.label ?? size;

// One picture "id@size": the 2× screenshot shown at half its pixel size times `scale`.
function picture(shot) {
  const [, size] = shot.split('@');
  const file = join(shots, `${shot}.png`);
  if (!existsSync(file)) throw new Error(`missing picture: ${file}`);
  const { w, h } = pngSize(file);
  const src = relative(dirname(out), file).split(/[\\/]/).map(encodeURIComponent).join('/');
  return `<figure><figcaption>${esc(label(size))}</figcaption><img src="${src}" width="${Math.round((w / 2) * scale)}" height="${Math.round((h / 2) * scale)}" alt=""></figure>`;
}

const numbered = (id) => `<p class="cap"><span class="n">${number(id)}</span><span>${caption(id)}</span></p>`;

const sections = spec.sections.map((s) => {
  if (s.grid) {
    const cells = s.grid.map((shot) => `<div class="cell">${numbered(shot.split('@')[0])}${picture(shot)}</div>`).join('');
    return `<section><h2>${s.head}</h2><div class="grid">${cells}</div></section>`;
  }
  const caps = (s.states ?? []).map(numbered).join('');
  return `<section><h2>${s.head}</h2>${caps}<div class="line">${s.pics.map(picture).join('')}</div></section>`;
}).join('\n');

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(spec.title)}</title>
<style>
  body { margin: 0; padding: 24px 32px 28px; width: ${width}px; box-sizing: border-box; background: #FFFFFF; color: #1F1F1F; font: 15px/1.45 "Segoe UI", system-ui, sans-serif; }
  h1 { font-size: 22px; font-weight: 600; margin: 0 0 6px; }
  .intro { color: #3A3A3A; margin: 0 0 18px; }
  section { margin: 0 0 18px; padding-top: 14px; border-top: 1px solid #E5E5E2; }
  h2 { font-size: 17px; font-weight: 600; margin: 0 0 8px; }
  .cap { display: flex; gap: 8px; align-items: baseline; font-size: 14px; margin: 0 0 8px; }
  .cap b { font-weight: 600; }
  .n { flex: none; display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 11px; background: #1F1F1F; color: #fff; font-size: 12px; }
  .line { display: flex; flex-wrap: wrap; gap: 16px 20px; align-items: flex-start; margin-top: 10px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px 20px; align-items: start; }
  figure { margin: 0; }
  figcaption { font-size: 12px; color: #6B6B6B; margin-bottom: 4px; }
  img { display: block; border: 1px solid #D9D9D4; border-radius: 6px; }
  .foot { padding-top: 12px; border-top: 1px solid #E5E5E2; color: #3A3A3A; font-size: 14px; line-height: 1.55; }
</style></head><body>
<h1>${esc(spec.title)}</h1>
<p class="intro">${spec.intro ?? ''}</p>
${sections}
${spec.footer ? `<div class="foot">${spec.footer}</div>` : ''}
</body></html>`;

writeFileSync(`${out}.html`, html);
let height = 0;
await withChrome(async (tab) => {
  await tab.size({ w: width, h: 900, scale: 2 });
  await tab.open(pathToFileURL(`${out}.html`).href, 300);
  height = await tab.height();
  writeFileSync(`${out}.png`, await tab.shot({ x: 0, y: 0, width, height }));
});
console.log(`saved ${out}.png (${width * 2}×${height * 2} px)`);
// The chat accepts pictures up to 8000 px wide or tall; a taller one reaches Jeffrey shrunk.
if (height * 2 > 8000) console.warn('warning: taller than 8000 px — the chat will send a shrunk copy; cut a state or lower "scale"');
