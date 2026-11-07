// build-m03.mjs: writes m03.json (pass 2 M-03: Print receipt on a removed student or a cancelled
// private testing that has money, rule v1.055 (b)) and runs compose.mjs. The sheet shows the admin's
// menu today and after at the four sizes, then ONE question: do staff get it there too?
// Shots: shoot-m03.ps1 (event, private) and shoot-m03-staff.ps1; drawing: inject-m03.js.
// Run: node build-m03.mjs   (from this folder or anywhere)
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const tools = join(here, '../../../../Design Review/tools');

// One screenshot, cropped and scaled, with blue option marks (the question's options)
function fig({ src, crop: [cx, cy, cw, ch], scale: s = 1, marks = [], caption, shotWidth = 1280 }) {
  const m = marks.map(([x, y, w, h]) =>
    `<div class="mark" style="left:${(x - cx) * s - 4}px;top:${(y - cy) * s - 4}px;width:${w * s + 8}px;height:${h * s + 8}px;border-color:#1D4ED8"></div>`).join('');
  return `<figure style="width:${cw * s}px;display:inline-block;vertical-align:top;margin:0 14px 10px 0"><div class="shot" style="width:${cw * s}px;height:${ch * s}px"><img src="${src}" style="left:${-cx * s}px;top:${-cy * s}px;width:${shotWidth * s}px">${m}</div><figcaption>${caption}</figcaption></figure>`;
}
const opt = (label, rec, body) =>
  `<div style="flex:1;min-width:0;border:1px solid #D9D9D4;border-radius:10px;padding:14px 16px;${rec ? 'background:#F3F6FD;border-color:#9DB2E6' : ''}">` +
  `<div style="font-weight:700;margin-bottom:10px">${label}${rec ? ' <span style="background:#1D4ED8;color:#fff;border-radius:5px;padding:2px 8px;font-size:13px;margin-left:6px">Recommended</span>' : ''}</div>${body}</div>`;
const what = (does, plus, minus) =>
  `<p style="margin:8px 0 0"><b>What it does:</b> ${does}</p><p style="margin:6px 0 0"><b>+</b> ${plus}</p><p style="margin:6px 0 0"><b>−</b> ${minus}</p>`;

// Menu boxes (screenshot pixels, from the shoot scripts' rects): PC and tablet menus open by the row;
// phone menus are sheets at the bottom of the screen (390 × 844, 320 × 640).
const PC_EV = [740, 500, 540, 240];
const PC_PR = [740, 370, 540, 240];
const question =
  `<div style="margin:26px 0 8px"><div style="display:inline-block;background:#E6EBF4;color:#003595;font-weight:700;font-size:14px;letter-spacing:.04em;text-transform:uppercase;padding:4px 10px;border-radius:6px;margin-bottom:10px">To decide</div>` +
  `<h2 style="font-size:20px;margin:0 0 6px">Do staff get Print receipt on these rows too?</h2>` +
  `<p style="margin:0 0 14px;max-width:1700px">On an active row with money, staff and admins both get Print receipt (CB2, v0.420). On a removed student or a cancelled private testing, staff see no ⋯ at all today, because Restore and Delete permanently are for admins. Rule v1.055 (b) says the receipt is offered whenever money still stands, but not to whom. Star and Camps will meet the same question when they add it (their staff also see no ⋯ on removed rows).</p>` +
  `<div style="display:flex;gap:24px;align-items:flex-start">` +
  opt('A · Staff too: a ⋯ with only Print receipt', true,
    fig({ src: 'm03-pc-event-staffA.png', crop: PC_EV, scale: 0.6, caption: 'PC 1280, staff: Owen Reed (removed, paid $65).', marks: [[1047, 598, 200, 42]] }) +
    fig({ src: 'm03-w390-event-staffA.png', shotWidth: 390, crop: [0, 560, 390, 284], scale: 0.6, caption: 'Phone 390, staff.', marks: [[0, 747, 390, 97]] }) +
    fig({ src: 'm03-pc-private-staffA.png', crop: PC_PR, scale: 0.6, caption: 'PC 1280, staff: Emma Ross (cancelled, paid $85).', marks: [[1047, 458, 200, 42]] }) +
    what('Staff get a ⋯ on a removed or cancelled row that has money, holding only Print receipt. Admins get Print receipt · line · Restore · line · Delete permanently. With nothing paid, staff still see no ⋯ there.',
      'The person at the desk when a parent asks for a receipt is usually staff, and the same staff can already print one for the same family while the row is active. The same rule everywhere: whoever can print a receipt for a payment can print it for that payment.',
      'Staff now see a ⋯ on some removed rows (the ones with money), so the Removed list looks a little busier for staff.')) +
  opt('B · Admins only', false,
    fig({ src: 'm03-pc-event-staffB.png', crop: PC_EV, scale: 0.6, caption: 'PC 1280, staff: no ⋯ on Owen\'s row, as today.', marks: [[1180, 680, 76, 40]] }) +
    fig({ src: 'm03-w390-event-staffB.png', shotWidth: 390, crop: [0, 330, 390, 170], scale: 0.6, caption: 'Phone 390, staff: as today.', marks: [[300, 372, 74, 40]] }) +
    fig({ src: 'm03-pc-private-staffB.png', crop: PC_PR, scale: 0.6, caption: 'PC 1280, staff: no ⋯ on Emma\'s row, as today.', marks: [[1180, 415, 76, 50]] }) +
    what('Only admins get Print receipt on removed or cancelled rows; staff see these rows as today.',
      'Nothing changes for staff; the Removed list stays as it is.',
      'A staff member at the desk has to find an admin to print a receipt for a withdrawn student\'s payment, though they could print it a day earlier while the student was active. Two rules for the same receipt.')) +
  `</div></div>`;

const spec = {
  title: 'Pass 2 · M-03 — Print receipt on a removed student or a cancelled private testing that has money',
  subtitle: 'Rule v1.055 (b) (you approved A, “Print receipt whenever money still stands”): a removed student or a cancelled private testing with a payment that still stands gets Print receipt in its ⋯, first, in its own group above Restore (§8’s one order: money before taking someone off). Never with nothing paid (Leo Hart, withdrawn without paying, keeps today’s menu); never while Hide private details is on. The receipt itself is the one the active rows print, with that payment. Admin pictures below; the one open question (staff) is under them. <span style="color:#6B6B6B">(Preview screenshots, fake data; the After column is drawn on top of the real page.)</span>',
  width: 2200,
  columns: [
    {
      label: 'Today (admin)', tone: 'today', items: [
        { row: [
          { src: 'm03-pc-event-today.png', crop: PC_EV, scale: 0.8, caption: 'PC 1280: Owen Reed (withdrawn after paying $65): no Print receipt.', marks: [[1047, 598, 200, 83]] },
          { src: 'm03-pc-private-today.png', crop: PC_PR, scale: 0.8, caption: 'PC 1280: Emma Ross (cancelled, $85 paid).', marks: [[1047, 458, 200, 83]] },
        ] },
        { row: [
          { src: 'm03-w820-event-today.png', shotWidth: 820, crop: [380, 760, 440, 320], scale: 0.62, caption: 'Tablet 820 (touch).', marks: [[587, 877, 200, 107]] },
          { src: 'm03-w390-event-today.png', shotWidth: 390, crop: [0, 560, 390, 284], scale: 0.62, caption: 'Phone 390.', marks: [[0, 694, 390, 150]] },
          { src: 'm03-w320-event-today.png', shotWidth: 320, crop: [0, 330, 320, 310], scale: 0.7, caption: '320.', marks: [[0, 490, 320, 150]] },
        ] },
      ],
    },
    {
      label: 'After (admin)', tone: 'after', items: [
        { row: [
          { src: 'm03-pc-event-admin.png', crop: PC_EV, scale: 0.8, caption: 'PC 1280: Print receipt · line · Restore · line · Delete permanently.', marks: [[1047, 598, 200, 124]] },
          { src: 'm03-pc-private-admin.png', crop: PC_PR, scale: 0.8, caption: 'PC 1280: the same on the cancelled private testing.', marks: [[1047, 458, 200, 124]] },
        ] },
        { row: [
          { src: 'm03-w820-event-admin.png', shotWidth: 820, crop: [380, 760, 440, 320], scale: 0.62, caption: 'Tablet 820 (touch).', marks: [[587, 877, 200, 160]] },
          { src: 'm03-w390-event-admin.png', shotWidth: 390, crop: [0, 560, 390, 284], scale: 0.62, caption: 'Phone 390.', marks: [[0, 641, 390, 203]] },
          { src: 'm03-w320-event-admin.png', shotWidth: 320, crop: [0, 330, 320, 310], scale: 0.7, caption: '320.', marks: [[0, 437, 320, 203]] },
        ] },
      ],
    },
  ],
  footer: question + '<p style="margin-top:18px"><b>Answer: A or B.</b></p>',
};

writeFileSync(join(here, 'm03.json'), JSON.stringify(spec, null, 1));
const r = spawnSync(process.execPath, [join(tools, 'compose.mjs'), join(here, 'm03.json')], { stdio: 'inherit' });
process.exitCode = r.status ?? 1;
