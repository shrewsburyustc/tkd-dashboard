// icon-board.mjs — draws an "icon board" picture for the Design Review walkthrough: one row per meaning,
// with the real Tabler outline icons (read from node_modules/@tabler/icons, the same set the app uses) and
// where each is used. Why: an icon question is easier to judge from the icons side by side than from many
// small screenshots. Two boards are made from one spec, "today" and "after", with the same row heights, so
// they line up when compose.mjs puts them in its two columns.
//
// Usage: node icon-board.mjs <board.json>   → writes <board>-today.png and <board>-after.png next to it
// Spec: { "width": 930, "rowHeight": 88, "meaningWidth": 230,
//         "rows": [ { "meaning": "Not paid", "sub": "count card",
//                     "today": [ { "icon": "clock", "where": "Color Belt · Star · Camps" }, { "icon": null, "where": "…" } ],
//                     "after": [ { "icon": "circle-x", "where": "everywhere" } ], "note": "…" } ] }
// "icon": null draws a dashed empty box labelled "no icon".
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const specPath = resolve(process.argv[2]);
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const here = dirname(fileURLToPath(import.meta.url));
const iconDir = join(here, '..', '..', '..', 'node_modules', '@tabler', 'icons', 'icons', 'outline');
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function icon(name, size) {
  if (!name) return `<span class="none" style="width:${size}px;height:${size}px"></span>`;
  const svg = readFileSync(join(iconDir, `${name}.svg`), 'utf8');
  return svg.replace(/width="24"/, `width="${size}"`).replace(/height="24"/, `height="${size}"`).replace(/class="[^"]*"/, 'class="ic"');
}

function chip(c, tone) {
  return `<span class="chip ${tone}">${icon(c.icon, 24)}<span class="chip-text"><b>${c.icon ? 'ti-' + esc(c.icon) : 'no icon'}</b><br>${esc(c.where)}</span></span>`;
}

function board(which) {
  const tone = which === 'today' ? 'today' : 'after';
  const rows = spec.rows.map((r) => `<div class="r" style="height:${spec.rowHeight ?? 88}px">
    <div class="m" style="width:${spec.meaningWidth ?? 230}px"><b>${esc(r.meaning)}</b>${r.sub ? `<br><span class="sub">${esc(r.sub)}</span>` : ''}</div>
    <div class="cells">${(r[which] ?? []).map((c) => chip(c, tone)).join('')}${which === 'after' && r.note ? `<span class="note">${esc(r.note)}</span>` : ''}</div>
  </div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { margin: 0; background: #FFFFFF; color: #1F1F1F; font: 14px/1.3 "Segoe UI", system-ui, sans-serif; width: ${spec.width ?? 930}px; }
    .r { display: flex; align-items: center; border-bottom: 1px solid #E5E5E2; box-sizing: border-box; }
    .r:first-child { border-top: 1px solid #E5E5E2; }
    .m { flex: 0 0 auto; padding: 0 12px; font-size: 15px; box-sizing: border-box; }
    .m .sub { color: #6B6B6B; font-size: 13px; }
    .cells { display: flex; align-items: center; gap: 10px; flex-wrap: nowrap; min-width: 0; }
    .chip { display: inline-flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 8px; flex: 0 0 auto; }
    .chip.today { background: #FDF6EA; border: 1px solid #F3D9A6; }
    .chip.after { background: #F1F8EE; border: 1px solid #BFDDB3; }
    .chip-text { font-size: 12.5px; line-height: 1.25; color: #3A3A3A; white-space: nowrap; }
    .chip-text b { font-weight: 600; color: #1F1F1F; }
    .ic { flex: 0 0 auto; }
    .none { display: inline-block; border: 1.5px dashed #9A9A9A; border-radius: 4px; box-sizing: border-box; flex: 0 0 auto; }
    .note { font-size: 12.5px; color: #4A4A4A; line-height: 1.3; min-width: 0; }
  </style></head><body>${rows}</body></html>`;
}

for (const which of ['today', 'after']) {
  const htmlPath = specPath.replace(/\.json$/, `-${which}.html`);
  const pngPath = specPath.replace(/\.json$/, `-${which}.png`);
  writeFileSync(htmlPath, board(which));
  const height = (spec.rowHeight ?? 88) * spec.rows.length + 2;
  const r = spawnSync(process.execPath, [join(here, 'shoot.mjs'), pathToFileURL(htmlPath).href, pngPath, String(spec.width ?? 930), String(height)], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
