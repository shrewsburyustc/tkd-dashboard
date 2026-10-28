// compose-sheet.mjs — puts one mockup's state pictures into ONE review image (an HTML page, then a PNG).
// Why: Jeffrey reviews one picture per question (an HTML file in the side panel didn't show for
// him), with what matters outlined in amber. Each state gets a numbered caption, then its pictures
// at the four review sizes side by side (or the PC picture on its own line when it is wide).
//
// Usage: node compose-sheet.mjs <spec.json>   → writes <out>.sheet.html and <out>.png
// Spec (paths relative to the spec file):
//   { "title": "…", "subtitle": "…" (HTML allowed), "shots": "<folder made by shoot-states.mjs>",
//     "out": "<name without extension>",
//     "states": ["id", …]        optional: which states, in this order (default: all, page order)
//     "pcOwnLine": ["id", …]     optional: states whose PC picture gets a line of its own
//     "sizes": ["pc", …]         optional: which sizes to show (default all four)
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
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// A PNG's width and height are stored at fixed places in its header (bytes 16–23).
function pngSize(file) {
  const b = readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

const all = JSON.parse(readFileSync(join(shots, 'states.json'), 'utf8'));
const order = spec.states ?? all.map((s) => s.id);
const sizes = SIZES.filter((s) => (spec.sizes ?? SIZES.map((x) => x.name)).includes(s.name));
const ownLine = new Set(spec.pcOwnLine ?? []);

function picture(id, size) {
  const file = join(shots, `${id}@${size.name}.png`);
  if (!existsSync(file)) return ''; // this state isn't drawn at this size
  const { w, h } = pngSize(file); // 2× pictures: shown at half their pixel size
  const src = relative(dirname(out), file).split(/[\\/]/).map(encodeURIComponent).join('/');
  return `<figure><figcaption>${esc(size.label)}</figcaption><img src="${src}" width="${w / 2}" height="${h / 2}" alt=""></figure>`;
}

const rows = order.map((id, i) => {
  const caption = spec.captions?.[id] ?? all.find((s) => s.id === id)?.caption ?? id;
  const pics = sizes.map((size) => picture(id, size));
  const body = ownLine.has(id) && sizes[0]?.name === 'pc'
    ? `<div class="line">${pics[0]}</div><div class="line">${pics.slice(1).join('')}</div>`
    : `<div class="line">${pics.join('')}</div>`;
  return `<section><h2><span class="n">${i + 1}</span><span>${caption}</span></h2>${body}</section>`;
}).join('\n');

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(spec.title)}</title>
<style>
  body { margin: 0; padding: 28px 32px 32px; background: #FFFFFF; color: #1F1F1F; font: 15px/1.45 "Segoe UI", system-ui, sans-serif; width: max-content; min-width: 1200px; box-sizing: border-box; }
  h1 { font-size: 24px; font-weight: 600; margin: 0 0 6px; }
  .sub { color: #4A4A4A; margin: 0 0 22px; max-width: 1400px; }
  section { margin: 0 0 26px; padding-top: 16px; border-top: 1px solid #E5E5E2; }
  h2 { display: flex; gap: 10px; align-items: baseline; font-size: 16px; font-weight: 400; margin: 0 0 12px; max-width: 1400px; }
  h2 b { font-weight: 600; }
  h2 .n { flex: none; display: inline-grid; place-items: center; width: 24px; height: 24px; border-radius: 12px; background: #1F1F1F; color: #fff; font-size: 13px; }
  .line { display: flex; gap: 20px; align-items: flex-start; margin-bottom: 14px; }
  figure { margin: 0; }
  figcaption { font-size: 13px; color: #6B6B6B; margin-bottom: 6px; }
  img { display: block; border: 1px solid #D9D9D4; border-radius: 8px; }
  .foot { margin-top: 8px; padding-top: 14px; border-top: 1px solid #E5E5E2; color: #3A3A3A; max-width: 1400px; line-height: 1.55; }
</style></head><body>
<h1>${esc(spec.title)}</h1>
<p class="sub">${spec.subtitle ?? ''}</p>
${rows}
${spec.footer ? `<div class="foot">${spec.footer}</div>` : ''}
</body></html>`;

// The sheet's own page is "<out>.sheet.html": plain "<out>.html" is the built mockup itself
// (build-mockup.mjs), which this tool once overwrote (2026-10-27).
const sheetPage = `${out}.sheet.html`;
writeFileSync(sheetPage, html);
await withChrome(async (tab) => {
  await tab.size({ w: 1400, h: 900, scale: 2 });
  await tab.open(pathToFileURL(sheetPage).href, 300);
  const width = await tab.evaluate('Math.ceil(document.body.getBoundingClientRect().width)');
  await tab.size({ w: width, h: 900, scale: 2 });
  await tab.open(pathToFileURL(sheetPage).href, 300);
  writeFileSync(`${out}.png`, await tab.shot({ x: 0, y: 0, width, height: await tab.height() }));
});
console.log(`saved ${out}.png`);
