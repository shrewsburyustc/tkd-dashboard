// shoot-states.mjs — takes the review screenshots of one mockup sheet, at the four review sizes.
// Why: CLAUDE.md asks for every mockup at 1280×800, 820×1180 touch, 390×844 touch and 320 wide,
// with PNGs. A mockup sheet shows one shared part in all its states; this script saves a picture
// of EACH state at EACH size, so compose-sheet.mjs can line them up in one review image.
// "touch" pretends to be a finger device (CSS pointer: coarse, hover: none), as an iPad or phone.
//
// Usage: node shoot-states.mjs <mockup.html> <outdir> [marks] [page]
//   For every element with data-state="<id>" it saves <outdir>/<id>@<size>.png (just that element,
//   exactly its box; a state draws its own margins); with "page", also <outdir>/page@<size>.png (the
//   whole page, for checking the layout), and it writes
//   <outdir>/states.json (each state id with its data-caption, in page order) for compose-sheet.mjs.
//   "marks" adds ?marks to the address, which turns on the amber outlines drawn by the mockup.
//   Pictures are 2× (sharp when zoomed; Jeffrey found 1× combined pictures "smudged").
//   The 320 shot is a touch screen too (a real 320-wide phone is one; the Design Review's d1b
//   pictures were taken that way). Its 640 height is under 700, so the short-screen rules apply.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { withChrome, SIZES } from './chrome.mjs';

const [page, outdir, ...flags] = process.argv.slice(2);
if (!page || !outdir) {
  console.error('Usage: node shoot-states.mjs <mockup.html> <outdir> [marks]');
  process.exit(1);
}
const url = pathToFileURL(resolve(page)).href + (flags.includes('marks') ? '?marks' : '');

mkdirSync(outdir, { recursive: true });
await withChrome(async (tab) => {
  for (const size of SIZES) {
    await tab.size({ ...size, scale: 2 });
    await tab.open(url);
    // Every state box on the page, in CSS pixels from the top of the page.
    const boxes = await tab.evaluate(`[...document.querySelectorAll('[data-state]')].map((el) => {
      const r = el.getBoundingClientRect();
      return { id: el.dataset.state, caption: el.dataset.caption ?? '', x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
    })`);
    const pageHeight = await tab.height();
    if (flags.includes('page')) writeFileSync(join(outdir, `page@${size.name}.png`), await tab.shot({ x: 0, y: 0, width: size.w, height: pageHeight }));
    for (const b of boxes) {
      if (b.w < 1 || b.h < 1) continue; // hidden at this size (e.g. the printed page on a phone)
      const pad = 0;
      const x = Math.max(0, Math.floor(b.x - pad));
      const y = Math.max(0, Math.floor(b.y - pad));
      const clip = { x, y, width: Math.min(size.w - x, Math.ceil(b.w + 2 * pad)), height: Math.min(pageHeight - y, Math.ceil(b.h + 2 * pad)) };
      writeFileSync(join(outdir, `${b.id}@${size.name}.png`), await tab.shot(clip));
    }
    if (size.name === 'pc') {
      writeFileSync(join(outdir, 'states.json'), JSON.stringify(boxes.map(({ id, caption }) => ({ id, caption })), null, 2));
    }
    console.log(`${size.label}: ${boxes.length} states`);
  }
});
