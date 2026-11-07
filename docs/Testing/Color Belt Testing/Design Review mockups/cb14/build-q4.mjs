// build-q4.mjs — writes cb14-q4.json (CB14 / M15 sheet 4: Question 4 of 4 — what is the Color Belt tab
// that keeps the prices called?) and runs compose.mjs.
// Shots: shoot-q4.sh (p3/oneshot.mjs + steps/q4-*.js); drawing: inject-cb14.js ('prices') + inject-q4.js.
// The tab bar measurements behind the captions are in q4-measure.txt (written by shoot-q4.sh).
// Run: node build-q4.mjs   (from this folder or anywhere)
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const tools = join(here, '../../../../Design Review/tools');

// One screenshot, cropped and scaled, with blue option marks (as sheets 2 and 3's options)
function fig({ src, crop: [cx, cy, cw, ch], scale: s = 1, marks = [], caption, shotWidth = 1280 }) {
  const m = marks.map(([x, y, w, h]) =>
    `<div class="mark" style="left:${(x - cx) * s - 4}px;top:${(y - cy) * s - 4}px;width:${w * s + 8}px;height:${h * s + 8}px;border-color:#1D4ED8"></div>`).join('');
  return `<figure style="width:${cw * s}px;display:inline-block;vertical-align:top;margin:0 14px 10px 0"><div class="shot" style="width:${cw * s}px;height:${ch * s}px"><img src="${src}" style="left:${-cx * s}px;top:${-cy * s}px;width:${shotWidth * s}px">${m}</div><figcaption>${caption}</figcaption></figure>`;
}
const opt = (label, rec, body) =>
  `<div style="flex:1;min-width:0;border:1px solid #D9D9D4;border-radius:10px;padding:14px 16px;${rec ? 'background:#F3F6FD;border-color:#9DB2E6' : ''}">` +
  `<div style="font-weight:700;margin-bottom:10px">${label}${rec ? ' <span style="background:#1D4ED8;color:#fff;border-radius:5px;padding:2px 8px;font-size:13px;margin-left:6px">Recommended</span>' : ''}</div>${body}</div>`;
const q = (title, intro, opts) =>
  `<div style="margin:26px 0 8px"><div style="display:inline-block;background:#E6EBF4;color:#003595;font-weight:700;font-size:14px;letter-spacing:.04em;text-transform:uppercase;padding:4px 10px;border-radius:6px;margin-bottom:10px">To decide</div>` +
  `<h2 style="font-size:20px;margin:0 0 6px">${title}</h2><p style="margin:0 0 14px;max-width:1700px">${intro}</p>` +
  `<div style="display:flex;gap:24px;align-items:flex-start">${opts.join('')}</div></div>`;
const what = (does, plus, minus) =>
  `<p style="margin:8px 0 0"><b>What it does:</b> ${does}</p><p style="margin:6px 0 0"><b>+</b> ${plus}</p><p style="margin:6px 0 0"><b>−</b> ${minus}</p>`;

// The second tab's width in each picture (q4-measure.txt), for the blue mark around it
const TABW = { today: 103, A: 34, B: 105, C: 80 };
// Crops (screenshot pixels): the page title, the tab bar, the gray line and the first class
const pc = (o, caption) => fig({ src: `q4-pc-${o}.png`, crop: [56, 90, 1224, 250], scale: 0.5, caption, marks: [[137, 182, TABW[o], 34]] });
const tab = (o, caption) => fig({ src: `q4-w820-${o}.png`, shotWidth: 820, crop: [72, 90, 748, 300], scale: 0.5, caption, marks: [[157, 184, TABW[o], 36]] });
const ph = (o, caption, file = `q4-w390-${o}.png`) => fig({ src: file, shotWidth: 390, crop: [0, 90, 390, 330], scale: 0.7, caption, marks: [[77, 192, TABW[o], 38]] });
const nar = (o, caption) => fig({ src: `q4-w320-${o}.png`, shotWidth: 320, crop: [0, 90, 320, 300], scale: 0.75, caption, marks: [[77, 190, TABW[o], 40]] });

const LINE = '“Testing prices, sparring gear and each class’s final award. Classes and ranks are in Settings.”';
const q4 = q(
  'Question 4 of 4 · What is the Testing tab that keeps the prices called?',
  'After CB14, Classes and ranks lives in Settings (admins only). Color belt testing keeps one tab with each class’s ranks, the Early / Testing day / Private prices, Sparring gear and each class’s final award — admins edit there, staff only read it (Question 1, B). Sheet 1 drew it as “Prices” (rulebook v1.023’s word). Only the tab’s name changes between the options; all three have the same gray line above the list: ' + LINE + ' (staff read “… Classes and ranks are set by an admin.”). <b>Tab bar measured in each picture:</b> none of the names makes the bar scroll sideways, not even at 320 — today’s “Classes and ranks” fits too (the bar is 288 px wide at 320; the three tabs plus their gaps take 270 px today).',
  [
    opt('A · “Prices”', true,
      pc('A', 'PC 1280.') +
      '<div>' + tab('A', 'Tablet 820 (touch).') + '</div>' +
      '<div>' + ph('A', 'Phone 390, admin.') + ph('A', 'Phone 390, <b>staff</b>: today’s view-only line, then “… Classes and ranks are set by an admin.” No edit buttons.', 'q4-w390-Astaff.png') + nar('A', '320: 87 px to spare in the bar.') + '</div>' +
      what('The tab is called “Prices”. The gray line under it names what else is there (sparring gear, final award) and where classes and ranks went.',
        'Shortest name (34 px): lots of room on every phone, even if a fourth tab is ever added. Matches the rulebook’s v1.023 wording and Star testing’s own “Rubrics and prices”. One word staff can find quickly when a parent asks “how much is testing?”.',
        'Doesn’t name the final award or sparring gear — the gray line has to say it, and some people skip gray lines.')),
    opt('B · “Prices and awards”', false,
      pc('B', 'PC 1280.') +
      '<div>' + tab('B', 'Tablet 820 (touch).') + '</div>' +
      '<div>' + ph('B', 'Phone 390: fits, no scrolling.') + nar('B', '320: fits, no scrolling — 16 px to spare in the bar.') + '</div>' +
      what('The tab is called “Prices and awards”, so the final award is in the name too.',
        'Names both things admins come here to change. Fits today’s three tabs at 390 and at 320 (measured; the bar doesn’t scroll).',
        'Longest name (105 px, as long as today’s “Classes and ranks”): at 320 only 16 px are left, so a fourth tab or a slightly bigger font would make the bar scroll. Still leaves out sparring gear. “Awards” can be read as trophies or certificates rather than the belt the class ends on.')),
    opt('C · “Testing prices”', false,
      pc('C', 'PC 1280.') +
      '<div>' + tab('C', 'Tablet 820 (touch).') + '</div>' +
      '<div>' + ph('C', 'Phone 390: fits.') + nar('C', '320: fits — 41 px to spare.') + '</div>' +
      what('The tab is called “Testing prices”.',
        'Says exactly what the prices are for (testing fees, not tuition) — clearer if someone lands here from Finance.',
        '“Testing” repeats the page’s own title (“Color belt testing”) right above it. Doesn’t name the final award or sparring gear. 80 px — between A and B.')),
  ],
);

const end = '<p style="margin-top:18px"><b>Answer Question 4 (A, B or C).</b></p>';

const spec = {
  title: 'CB14 sheet 4 · Question 4 of 4: what is the Testing tab that keeps the prices called?',
  subtitle: 'Answered: Q1 B (Settings admins only; staff read the Prices tab), Q2 C (links only on the two ‘no classes yet’ hints), Q3 B (a school switch inside the part). This sheet is <b>Question 4 of 4</b>. <span style="color:#6B6B6B">(Preview screenshots, fake data, signed in as an admin unless marked staff, top bar on Worcester. The options are drawn on top of the real Color belt testing page with sheet 1’s Prices tab; nothing in the app is built yet.)</span>',
  width: 2700,
  columns: [
    {
      label: 'Today', tone: 'today', items: [
        { src: 'q4-pc-today.png', crop: [56, 90, 1224, 250], scale: 0.62, caption: '<b>Testing → Color belt testing</b> (admin, PC): the tab bar is “Events · Classes and ranks · Private testing”. After CB14 “Classes and ranks” moves to Settings, so this tab needs a new name.', marks: [[137, 182, TABW.today, 34]] },
        {
          row: [
            { src: 'q4-w390-today.png', shotWidth: 390, crop: [0, 90, 390, 330], scale: 0.7, caption: 'Phone 390.', marks: [[77, 192, TABW.today, 38]] },
            { src: 'q4-w320-today.png', shotWidth: 320, crop: [0, 90, 320, 300], scale: 0.75, caption: '320: today’s three tabs fit without scrolling (measured).', marks: [[77, 190, TABW.today, 40]] },
          ],
        },
      ],
    },
    {
      label: 'After (sheet 1): the Prices tab', tone: 'after', items: [
        { src: 'w390-prices-after.png', shotWidth: 390, crop: [0, 90, 390, 330], scale: 0.7, caption: 'Sheet 1 drew the tab as “Prices”, with a tag saying the name waits on this question.', marks: [[22, 288, 142, 24]] },
      ],
    },
  ],
  footer: q4 + end,
};

writeFileSync(join(here, 'cb14-q4.json'), JSON.stringify(spec, null, 1));
const r = spawnSync(process.execPath, [join(tools, 'compose.mjs'), join(here, 'cb14-q4.json')], { stdio: 'inherit' });
process.exitCode = r.status ?? 1;
