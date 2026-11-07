// build-m03b.mjs: writes m03b.json (the M-03 follow-up question: what a CANCELLED private testing that
// was only partly paid shows as owed, on its receipt and in its summary) and runs compose.mjs.
// Found by M-03's review: M-03 (v0.428) made this receipt reachable. Shots: shoot-m03b.ps1; drawing:
// inject-m03b.js. Run: node build-m03b.mjs   (from this folder or anywhere)
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const tools = join(here, '../../../../Design Review/tools');

function fig({ src, crop: [cx, cy, cw, ch], scale: s = 1, marks = [], caption, shotWidth = 1280, color = '#1D4ED8' }) {
  const m = marks.map(([x, y, w, h]) =>
    `<div class="mark" style="left:${(x - cx) * s - 4}px;top:${(y - cy) * s - 4}px;width:${w * s + 8}px;height:${h * s + 8}px;border-color:${color}"></div>`).join('');
  return `<figure style="width:${cw * s}px;display:inline-block;vertical-align:top;margin:0 14px 10px 0"><div class="shot" style="width:${cw * s}px;height:${ch * s}px"><img src="${src}" style="left:${-cx * s}px;top:${-cy * s}px;width:${shotWidth * s}px">${m}</div><figcaption>${caption}</figcaption></figure>`;
}
const opt = (label, rec, body) =>
  `<div style="flex:1;min-width:0;border:1px solid #D9D9D4;border-radius:10px;padding:14px 16px;${rec ? 'background:#F3F6FD;border-color:#9DB2E6' : ''}">` +
  `<div style="font-weight:700;margin-bottom:10px">${label}${rec ? ' <span style="background:#1D4ED8;color:#fff;border-radius:5px;padding:2px 8px;font-size:13px;margin-left:6px">Recommended</span>' : ''}</div>${body}</div>`;
const what = (does, plus, minus) =>
  `<p style="margin:8px 0 0"><b>What it does:</b> ${does}</p><p style="margin:6px 0 0"><b>+</b> ${plus}</p><p style="margin:6px 0 0"><b>−</b> ${minus}</p>`;

// Crops (screenshot pixels): the receipt page alone; the summary's middle part.
const RPC = [384, 168, 512, 465];
const R390 = [16, 64, 358, 465];
const R820 = [154, 184, 512, 465];
const R320 = [16, 64, 288, 564];
const TOT_PC = [[639, 440, 240, 90]];
const TOT_390 = [[117, 336, 240, 90]];
const LINE_PC = [[505, 266, 230, 20]];
const LINE_390 = [[138, 164, 222, 20]];

const question =
  `<div style="margin:26px 0 8px"><div style="display:inline-block;background:#E6EBF4;color:#003595;font-weight:700;font-size:14px;letter-spacing:.04em;text-transform:uppercase;padding:4px 10px;border-radius:6px;margin-bottom:10px">To decide</div>` +
  `<h2 style="font-size:20px;margin:0 0 6px">What does the receipt say is owed on a cancelled private testing that was only partly paid?</h2>` +
  `<p style="margin:0 0 14px;max-width:1750px">Both options also do two small things the review asked for: the receipt’s Private testing line says it was cancelled (“· cancelled Nov 6”), and the summary stops saying “$20 more to collect” on a cancelled one (its row already leaves that line out; picture above). Fully paid cancelled ones (Emma Ross) and every active one print as today.</p>` +
  `<div style="display:flex;gap:24px;align-items:flex-start">` +
  opt('A · Nothing more is owed: Total due = what was paid', true,
    fig({ src: 'm03b-pc-receipt-A.png', crop: RPC, scale: 0.62, caption: 'PC 1280: Total due $65 · Paid $65 · Balance “$0 · paid in full”.', marks: [...TOT_PC, ...LINE_PC] }) +
    fig({ src: 'm03b-w390-receipt-A.png', shotWidth: 390, crop: R390, scale: 0.62, caption: 'Phone 390.', marks: [...TOT_390, ...LINE_390] }) +
    fig({ src: 'm03b-w820-receipt-A.png', shotWidth: 820, crop: R820, scale: 0.5, caption: 'Tablet 820 (touch).', marks: [[409, 456, 240, 90]] }) +
    fig({ src: 'm03b-w320-receipt-A.png', shotWidth: 320, crop: R320, scale: 0.5, caption: '320.', marks: [[47, 416, 240, 90]] }) +
    what('On a cancelled private testing, the receipt’s Total due is what was paid, so the balance is $0 (“paid in full”), and the cancelled date explains why the total is below the price.',
      'A parent reading it can’t think they still owe $20 for a testing that was cancelled. Matches how the dashboard treats it: the row and the Not paid card don’t count anything as owed on a cancelled one. “Fees are non-refundable” at the bottom still says the $65 stays.',
      'The receipt no longer shows the $85 price on a cancelled one (the summary’s Price line still does).')) +
  opt('B · Show the price, say the rest isn’t owed', false,
    fig({ src: 'm03b-pc-receipt-B.png', crop: RPC, scale: 0.62, caption: 'PC 1280: Total due $85 · Paid $65 · Balance “$20 · not owed (cancelled)”.', marks: [...TOT_PC, ...LINE_PC] }) +
    fig({ src: 'm03b-w390-receipt-B.png', shotWidth: 390, crop: R390, scale: 0.62, caption: 'Phone 390.', marks: [...TOT_390, ...LINE_390] }) +
    what('The receipt keeps the price as Total due and the $20 as the balance, with the words “not owed (cancelled)” after it.',
      'Shows the full price and exactly what was and wasn’t paid.',
      'A $20 balance on a receipt is easy to read as money owed, even with the words after it; and it uses the shared receipt’s balance note, which the other sections use only for an amount that IS owed (“next due May 29”).')) +
  `</div></div>`;

const spec = {
  title: 'Pass 2 · M-03 follow-up — a cancelled private testing that was only partly paid',
  subtitle: 'Found by M-03’s review. Since v0.428 a cancelled private testing with money has Print receipt. One case wasn’t drawn: Ava Chen paid $65 of the $85 (moved with her from the event), then her private testing was cancelled. Her receipt then says “Total due $85 · Paid to date $65 · Balance $20”, and her summary says “$20 more to collect” next to Print receipt, though her row (correctly) doesn’t. Nothing is owed on a cancelled private testing, and the $65 isn’t refunded (“Fees are non-refundable”). <span style="color:#6B6B6B">(Preview screenshots, fake data; the options are drawn on top of the real receipt.)</span>',
  width: 2200,
  columns: [
    {
      label: 'Today', tone: 'today', items: [
        { row: [
          { src: 'm03b-pc-receipt-today.png', crop: RPC, scale: 0.62, caption: 'PC 1280: the receipt says $20 is still owed.', marks: TOT_PC },
          { src: 'm03b-w390-receipt-today.png', shotWidth: 390, crop: R390, scale: 0.62, caption: 'Phone 390.', marks: TOT_390 },
        ] },
        { row: [
          { src: 'm03b-pc-summary-today.png', crop: [420, 80, 440, 560], scale: 0.62, caption: 'PC 1280: the summary says “$20 more to collect”; the row doesn’t.', marks: [[568, 378, 268, 42]] },
          { src: 'm03b-w390-summary-today.png', shotWidth: 390, crop: [0, 250, 390, 250], scale: 0.7, caption: 'Phone 390.', marks: [[124, 306, 250, 44]] },
        ] },
      ],
    },
    {
      label: 'After, in both options: the summary', tone: 'after', items: [
        { row: [
          { src: 'm03b-pc-summary-after.png', crop: [420, 80, 440, 560], scale: 0.62, caption: 'PC 1280: “Paid · $65 cash · paid Oct 30”, no “more to collect” on a cancelled one.', marks: [[568, 378, 190, 22]] },
          { src: 'm03b-w390-summary-after.png', shotWidth: 390, crop: [0, 250, 390, 250], scale: 0.7, caption: 'Phone 390.', marks: [[124, 306, 250, 22]] },
        ] },
      ],
    },
  ],
  footer: question + '<p style="margin-top:18px"><b>Answer: A or B.</b></p>',
};

writeFileSync(join(here, 'm03b.json'), JSON.stringify(spec, null, 1));
const r = spawnSync(process.execPath, [join(tools, 'compose.mjs'), join(here, 'm03b.json')], { stdio: 'inherit' });
process.exitCode = r.status ?? 1;
