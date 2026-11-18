// shoot.mjs — one PNG per mockup picture (#ER1 …), sharp at 2x. Usage: node shoot.mjs <mockup.html> <outdir> <ids…>
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { withChrome } from '../../../Dashboard Core/tools/chrome.mjs';
const [page, outdir, ...ids] = process.argv.slice(2);
mkdirSync(resolve(outdir), { recursive: true });
await withChrome(async (tab) => {
  await tab.size({ w: 1700, h: 900, scale: 1.5 });
  for (const id of ids) {
    await tab.open('about:blank', 0);
    await tab.open(pathToFileURL(resolve(page)).href + '#' + id, 500);
    const height = await tab.evaluate('Math.max(Math.ceil(document.querySelector("main").getBoundingClientRect().bottom + window.scrollY), document.documentElement.scrollHeight) + 8');
    writeFileSync(join(resolve(outdir), `${id}.png`), await tab.shot({ x: 0, y: 0, width: 1700, height }));
    console.log(id, height);
  }
});
