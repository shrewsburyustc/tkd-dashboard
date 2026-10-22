// compose.mjs — builds one combined review picture (HTML, then PNG) from preview screenshots:
// a "Today" column with amber outlines on what's wrong, and an "After" column with green outlines on
// what changes. Why: Jeffrey reviews one picture per item (HTML in the side panel didn't show for him).
// Usage: node compose.mjs <spec.json>   → writes <spec>.html next to the spec and <spec>.png
// Spec: { title, subtitle, columns: [{ label, tone: 'today'|'after', items: [{ src, crop: [x,y,w,h],
//         scale, caption, marks: [[x,y,w,h], …], shotWidth (default 1280) } or { row: [item, …] }],
//         note }], footer, width }  (crops and boxes in screenshot pixels)

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const specPath = resolve(process.argv[2]);
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const here = dirname(fileURLToPath(import.meta.url));
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const toneColor = { today: '#F59E0B', after: '#3B8F2A' };

function item(it, tone) {
  // { row: [item, item] } puts screenshots side by side (e.g. a roster next to its detail dialog).
  if (it.row) return `<div class="row">${it.row.map((sub) => item(sub, tone)).join('')}</div>`;
  const [cx, cy, cw, ch] = it.crop;
  const s = it.scale ?? 1;
  const src = it.src.split('/').map(encodeURIComponent).join('/'); // relative to the spec, so the .html works on any PC
  const marks = (it.marks ?? []).map(([x, y, w, h]) =>
    `<div class="mark" style="left:${(x - cx) * s - 4}px;top:${(y - cy) * s - 4}px;width:${w * s + 8}px;height:${h * s + 8}px;border-color:${toneColor[tone]}"></div>`).join('');
  return `<figure style="width:${cw * s}px">
    <div class="shot" style="width:${cw * s}px;height:${ch * s}px">
      <img src="${src}" style="left:${-cx * s}px;top:${-cy * s}px;width:${(it.shotWidth ?? 1280) * s}px">
      ${marks}
    </div>
    <figcaption>${it.caption}</figcaption>
  </figure>`;
}

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(spec.title)}</title>
<style>
  body { margin: 0; padding: 28px 32px 32px; background: #FFFFFF; color: #1F1F1F; font: 15px/1.4 "Segoe UI", system-ui, sans-serif; width: ${spec.width ?? 1840}px; box-sizing: border-box; }
  h1 { font-size: 24px; font-weight: 600; margin: 0 0 6px; }
  .sub { color: #4A4A4A; margin: 0 0 20px; max-width: 1500px; }
  .cols { display: flex; gap: 36px; align-items: flex-start; }
  .col { flex: 1; min-width: 0; }
  .label { display: inline-block; font-size: 14px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; padding: 4px 10px; border-radius: 6px; margin: 0 0 14px; }
  .today .label { background: #FDF0D9; color: #7A4A06; }
  .after .label { background: #E5F2DF; color: #2E6B1F; }
  figure { margin: 0 0 22px; }
  .row { display: flex; gap: 16px; align-items: flex-start; }
  .row figure { flex: 0 0 auto; }
  .row figcaption { max-width: 100%; }
  .shot { position: relative; overflow: hidden; border: 1px solid #D9D9D4; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .shot img { position: absolute; max-width: none; }
  .mark { position: absolute; border: 3px solid; border-radius: 8px; box-sizing: border-box; }
  figcaption { margin-top: 8px; font-size: 15px; }
  figcaption b { font-weight: 600; }
  .note { border-radius: 8px; padding: 12px 16px; font-size: 15px; margin-top: 4px; }
  .today .note { background: #FDF6EA; }
  .after .note { background: #F1F8EE; }
  .foot { margin-top: 8px; padding-top: 14px; border-top: 1px solid #E5E5E2; color: #3A3A3A; font-size: 15px; line-height: 1.55; }
</style></head><body>
<h1>${esc(spec.title)}</h1>
<p class="sub">${spec.subtitle ?? ''}</p>
<div class="cols">
${spec.columns.map((col) => `<div class="col ${col.tone}">
  <div class="label">${esc(col.label)}</div>
  ${col.items.map((it) => item(it, col.tone)).join('\n')}
  ${col.note ? `<div class="note">${col.note}</div>` : ''}
</div>`).join('\n')}
</div>
${spec.footer ? `<div class="foot">${spec.footer}</div>` : ''}
</body></html>`;

const htmlPath = specPath.replace(/\.json$/, '.html');
const pngPath = specPath.replace(/\.json$/, '.png');
writeFileSync(htmlPath, html);
const r = spawnSync(process.execPath, [join(here, 'shoot.mjs'), pathToFileURL(htmlPath).href, pngPath, String(spec.width ?? 1840), '900', 'full'], { stdio: 'inherit' });
process.exitCode = r.status ?? 1;
