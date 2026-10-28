// compose-parts-review.mjs — one side-by-side review picture per shared part: every state's approved
// mockup picture next to the built part's picture, at each of the four sizes.
// Why: Dashboard core step 1's proof (plan §4) — the built parts must look like the mockups Jeffrey
// approved (M1–M8). shoot-parts.mjs pictures the parts page with the mockups' own state ids, so
// every built picture has a mockup picture of the same name (Mockups/shots/M#/<state>@<size>.png).
// How: an HTML page lays them out — one row per state (number, id and the mockup's first words),
// one column per size, and in each cell the mockup (left) and the built part (right; its "-full"
// picture when the dialog is longer than the screen). Every picture is shrunk by the same amount,
// chosen so the whole picture stays under 8000 px both ways (the chat's limit), then a hidden
// Chrome takes a 2× picture of the page.
//
// Usage: node compose-parts-review.mjs <M#> [M# …]
//   reads  ../Mockups/shots/M#/ and ../Proof/parts/M#/
//   writes ../Proof/parts/M#-built-vs-mockup.html and .png

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { withChrome, SIZES } from './chrome.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const mockRoot = resolve(here, '..', 'Mockups', 'shots');
const builtRoot = resolve(here, '..', 'Proof', 'parts');
const parts = process.argv.slice(2);
if (parts.length === 0) {
  console.error('Usage: node compose-parts-review.mjs <M#> [M# …]');
  process.exit(1);
}
const LIMIT = 7900; // px, both ways (the 2× picture)
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// A PNG's width and height are stored at fixed places in its header (bytes 16–23).
function pngSize(file) {
  const b = readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

// A short name for the row: the caption's first bold words ("While it works"), or else its first
// sentence. (The full captions are in the mockup's sheet and states.json.)
function firstWords(caption) {
  const bold = /<b>(.*?)<\/b>/.exec(caption);
  if (bold) return `<b>${bold[1]}</b>`;
  const cut = caption.search(/[.:](\s|$)/);
  return cut > 0 ? caption.slice(0, cut + 1) : caption;
}

function page(part, scale) {
  const states = JSON.parse(readFileSync(join(mockRoot, part, 'states.json'), 'utf8'));
  const out = join(builtRoot, `${part}-built-vs-mockup.html`);
  const img = (file, label) => {
    if (!existsSync(file)) return `<figure class="none"><figcaption>${label}</figcaption><div>—</div></figure>`;
    const { w, h } = pngSize(file);
    const src = relative(dirname(out), file).split(/[\\/]/).map(encodeURIComponent).join('/');
    return `<figure><figcaption>${label}</figcaption><img src="${src}" width="${Math.round((w / 2) * scale)}" height="${Math.round((h / 2) * scale)}" alt=""></figure>`;
  };
  const rows = states
    .map((state, index) => {
      const cells = SIZES.map((size) => {
        const mock = join(mockRoot, part, `${state.id}@${size.name}.png`);
        const fullBuilt = join(builtRoot, part, `${state.id}@${size.name}-full.png`);
        const built = existsSync(fullBuilt) ? fullBuilt : join(builtRoot, part, `${state.id}@${size.name}.png`);
        const builtLabel = existsSync(fullBuilt) ? 'Built (whole page)' : 'Built';
        if (!existsSync(mock) && !existsSync(built)) return '<td class="empty">—</td>';
        return `<td><div class="pair">${img(mock, 'Mockup')}${img(built, builtLabel)}</div></td>`;
      }).join('');
      return `<tr><th scope="row"><span class="n">${index + 1}</span><code>${esc(state.id)}</code><p>${firstWords(state.caption)}</p></th>${cells}</tr>`;
    })
    .join('\n');
  const heads = SIZES.map((s) => `<th scope="col">${esc(s.label)}</th>`).join('');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${part} — built vs mockup</title>
<style>
  body { margin: 0; padding: 20px 24px; background: #fff; color: #1f1f1f; font: 13px/1.4 "Segoe UI", system-ui, sans-serif; }
  h1 { margin: 0 0 4px; font-size: 18px; font-weight: 600; }
  .intro { margin: 0 0 12px; color: #3a3a3a; }
  table { border-collapse: collapse; }
  th, td { padding: 8px 10px; border-top: 1px solid #e5e5e2; vertical-align: top; text-align: left; }
  thead th { border-top: none; font-size: 12px; color: #6b6b6b; font-weight: 600; }
  tbody th { width: 150px; font-weight: 400; font-size: 12px; }
  tbody th p { margin: 4px 0 0; color: #3a3a3a; }
  .n { display: inline-grid; place-items: center; width: 18px; height: 18px; margin-right: 6px; border-radius: 9px; background: #1f1f1f; color: #fff; font-size: 11px; }
  .pair { display: flex; gap: 6px; align-items: flex-start; }
  figure { margin: 0; }
  figcaption { font-size: 10px; color: #6b6b6b; margin-bottom: 2px; }
  img { display: block; border: 1px solid #d9d9d4; border-radius: 4px; }
  .none div, .empty { color: #b0b0aa; }
</style></head><body>
<h1>${part} — the built part next to the approved mockup</h1>
<p class="intro">Left in each cell: the approved mockup's picture (its amber outlines mark what the mockup asked about). Right: the built part on the parts page (parts.html#${part}/&lt;state&gt;), real fonts and real dialogs. Every picture at ${Math.round(scale * 100)}% of its screen size. The single pictures are in Proof/parts/${part}/.</p>
<table><thead><tr><th></th>${heads}</tr></thead><tbody>
${rows}
</tbody></table>
</body></html>`;
  writeFileSync(out, html);
  return out;
}

await withChrome(async (tab) => {
  for (const part of parts) {
    let scale = 0.5;
    let out;
    let size = { w: 0, h: 0 };
    for (let round = 0; round < 4; round += 1) {
      out = page(part, scale);
      await tab.size({ w: 1200, h: 900, scale: 2 });
      await tab.open(pathToFileURL(out).href, 300);
      size = await tab.evaluate('({ w: Math.ceil(document.documentElement.scrollWidth), h: Math.ceil(document.documentElement.scrollHeight) })');
      const fit = Math.min(LIMIT / (size.w * 2), LIMIT / (size.h * 2));
      if (fit >= 1) break;
      scale = Math.floor(scale * fit * 0.97 * 100) / 100;
    }
    await tab.size({ w: size.w, h: 900, scale: 2 });
    await tab.open(pathToFileURL(out).href, 300);
    const height = await tab.height();
    const png = out.replace(/\.html$/, '.png');
    writeFileSync(png, await tab.shot({ x: 0, y: 0, width: size.w, height }));
    console.log(`${part}: ${png} (${size.w * 2}×${height * 2} px, pictures at ${Math.round(scale * 100)}%)`);
  }
});
