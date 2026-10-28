// compare-app.mjs — compares the "before" and "after" pictures from shoot-app.mjs, pixel by pixel.
// Why: step 1 must change nothing on screen (rulebook v1.030); this says which pictures differ,
// where, and saves a copy of each differing "after" picture with the changed pixels in red.
// How: a hidden Chrome (chrome.mjs) draws both pictures on a canvas and compares their pixels.
// Node has no PNG reader of its own, and the browser does.
//
// Usage: node compare-app.mjs <beforeDir> <afterDir> <diffDir>
// Prints one line per picture: "same", "same pixels" (the files differ but not the picture), or
// "DIFFERENT" with how many pixels and the box around them (in screen pixels, i.e. half the
// picture's size).

import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { withChrome } from './chrome.mjs';

const [beforeArg, afterArg, diffArg] = process.argv.slice(2);
if (!beforeArg || !afterArg || !diffArg) {
  console.error('Usage: node compare-app.mjs <beforeDir> <afterDir> <diffDir>');
  process.exit(1);
}
const [beforeDir, afterDir, diffDir] = [beforeArg, afterArg, diffArg].map((p) => resolve(p));
mkdirSync(diffDir, { recursive: true });
const dataUrl = (file) => `data:image/png;base64,${readFileSync(file).toString('base64')}`;

const names = readdirSync(beforeDir).filter((n) => n.endsWith('.png')).sort();
let different = 0;
await withChrome(async (tab) => {
  await tab.size({ w: 800, h: 600, scale: 1 });
  await tab.open('about:blank', 0);
  for (const name of names) {
    const before = join(beforeDir, name);
    const after = join(afterDir, name);
    if (!existsSync(after)) {
      console.log(`${name}: MISSING after`);
      different++;
      continue;
    }
    if (readFileSync(before).equals(readFileSync(after))) {
      console.log(`${name}: same`);
      continue;
    }
    // Draw both, count the pixels that differ, and paint them red on a copy of "after".
    const result = await tab.evaluate(`(async () => {
      const load = (src) => new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = src; });
      const [a, b] = await Promise.all([load(${JSON.stringify(dataUrl(before))}), load(${JSON.stringify(dataUrl(after))})]);
      if (a.width !== b.width || a.height !== b.height) return { size: [a.width, a.height, b.width, b.height] };
      const canvas = (img) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return [c, x]; };
      const [, ca] = canvas(a);
      const [cb, cxb] = canvas(b);
      const pa = ca.getImageData(0, 0, a.width, a.height).data;
      const imgB = cxb.getImageData(0, 0, b.width, b.height);
      const pb = imgB.data;
      let count = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
      for (let i = 0; i < pa.length; i += 4) {
        if (pa[i] !== pb[i] || pa[i + 1] !== pb[i + 1] || pa[i + 2] !== pb[i + 2] || pa[i + 3] !== pb[i + 3]) {
          count++;
          const p = i / 4, x = p % a.width, y = Math.floor(p / a.width);
          if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
          pb[i] = 255; pb[i + 1] = 0; pb[i + 2] = 0; pb[i + 3] = 255;
        }
      }
      if (!count) return { count: 0 };
      cxb.putImageData(imgB, 0, 0);
      return { count, box: [x0, y0, x1, y1].map((v) => Math.round(v / 2)), png: cb.toDataURL('image/png') };
    })()`);
    if (result.size) {
      console.log(`${name}: DIFFERENT size — before ${result.size[0]}×${result.size[1]}, after ${result.size[2]}×${result.size[3]}`);
      different++;
    } else if (!result.count) {
      console.log(`${name}: same pixels`);
    } else {
      writeFileSync(join(diffDir, name), Buffer.from(result.png.split(',')[1], 'base64'));
      console.log(`${name}: DIFFERENT — ${result.count} pixels, box ${result.box.join(',')} (x0,y0,x1,y1 in screen pixels)`);
      different++;
    }
  }
});
console.log(different ? `${different} picture(s) differ — see ${diffDir}` : 'all pictures match');
