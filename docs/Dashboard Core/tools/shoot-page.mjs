// shoot-page.mjs — one PNG of a whole page (a question card, a review sheet), sharp at 2×.
// Why: Jeffrey reviews pictures, one per question; this turns a question's HTML into that picture.
// Usage: node shoot-page.mjs <page.html> <out.png> [width]   (width in CSS pixels, default 1400)
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { withChrome } from './chrome.mjs';

const [page, out, w = '1400'] = process.argv.slice(2);
if (!page || !out) {
  console.error('Usage: node shoot-page.mjs <page.html> <out.png> [width]');
  process.exit(1);
}
await withChrome(async (tab) => {
  await tab.size({ w: Number(w), h: 900, scale: 2 });
  await tab.open(pathToFileURL(resolve(page)).href, 300);
  // The content's own height (a short page would otherwise get the window's empty bottom too).
  const height = await tab.evaluate('Math.ceil(document.body.getBoundingClientRect().bottom)');
  writeFileSync(resolve(out), await tab.shot({ x: 0, y: 0, width: Number(w), height }));
});
console.log(`saved ${out}`);
