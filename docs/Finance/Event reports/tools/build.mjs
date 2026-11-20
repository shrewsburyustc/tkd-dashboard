// build.mjs — makes the finished, self-contained mockup file from the hand-written source.
// Why: CLAUDE.md wants mockups Jeffrey opens in a browser with nothing else downloaded. The page styles
// (mock-base.css) are the ones the approved Finance mockups used; the icons are the app's real Tabler
// icons, turned into small inline pictures here.
// Usage: node build.mjs <source.html> <out.html>
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..', '..', '..');
const [src, out] = process.argv.slice(2);
const ICONS = ['home', 'certificate', 'tent', 'clock', 'calendar-month', 'address-book', 'hammer', 'report-money', 'chevron-left', 'chevron-right',
  'chevron-down', 'chevron-up', 'calendar', 'printer', 'arrow-left', 'dots', 'sum', 'cash', 'receipt', 'credit-card', 'alert-triangle', 'check', 'x',
  'map-pin', 'menu-2', 'refresh', 'eye-off', 'receipt-refund', 'history', 'users', 'clipboard-text', 'download', 'qrcode', 'link', 'lock-check'];
const iconCss = ICONS.map((name) => {
  const svg = readFileSync(join(repo, 'node_modules', '@tabler', 'icons', 'icons', 'outline', `${name}.svg`), 'utf8')
    .replace(/\s+class="[^"]*"/, '').replace(/currentColor/g, 'black').replace(/\s+/g, ' ');
  return `.ti-${name}{--i:url("data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, '%27').replace(/"/g, '%22')}")}`;
}).join('\n');
const base = readFileSync(join(here, 'mock-base.css'), 'utf8');
const iconBase = `.ti{display:inline-flex;align-items:center;justify-content:center;font-style:normal;line-height:1;flex:none;vertical-align:-0.125em}
.ti::before{content:"";display:block;width:1em;height:1em;background-color:currentColor;-webkit-mask:var(--i) center/contain no-repeat;mask:var(--i) center/contain no-repeat}`;
let html = readFileSync(resolve(src), 'utf8').replace('/*BASECSS*/', base).replace('/*ICONS*/', iconBase + '\n' + iconCss);
writeFileSync(resolve(out), html);
console.log('saved', out, Math.round(html.length / 1024) + ' KB');
