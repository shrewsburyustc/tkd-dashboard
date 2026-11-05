// build-p2.mjs — writes p2.json (the Today / After columns plus Jeffrey's two questions under them) and
// runs compose.mjs on it. The questions use compose's footer, drawn with the same crop + outline
// markup as the columns, in blue (an option, not today or after).
// Run: node build-p2.mjs   (from this folder or anywhere)
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const tools = join(here, '../../../../Design Review/tools');

// One cropped screenshot with blue outlines, as compose.mjs draws them.
function fig({ src, crop: [cx, cy, cw, ch], scale: s = 1, marks = [], caption, shotWidth = 1280 }) {
  const m = marks.map(([x, y, w, h]) =>
    `<div class="mark" style="left:${(x - cx) * s - 4}px;top:${(y - cy) * s - 4}px;width:${w * s + 8}px;height:${h * s + 8}px;border-color:#1D4ED8"></div>`).join('');
  return `<figure style="width:${cw * s}px"><div class="shot" style="width:${cw * s}px;height:${ch * s}px"><img src="${src}" style="left:${-cx * s}px;top:${-cy * s}px;width:${shotWidth * s}px">${m}</div><figcaption>${caption}</figcaption></figure>`;
}
const opt = (label, rec, body) =>
  `<div style="flex:1;min-width:0;border:1px solid #D9D9D4;border-radius:10px;padding:14px 16px;${rec ? 'background:#F3F6FD;border-color:#9DB2E6' : ''}">` +
  `<div style="font-weight:700;margin-bottom:10px">${label}${rec ? ' <span style="background:#1D4ED8;color:#fff;border-radius:5px;padding:2px 8px;font-size:13px;margin-left:6px">Recommended</span>' : ''}</div>${body}</div>`;
const q = (title, intro, opts) =>
  `<div style="margin:26px 0 8px"><div style="display:inline-block;background:#E6EBF4;color:#003595;font-weight:700;font-size:14px;letter-spacing:.04em;text-transform:uppercase;padding:4px 10px;border-radius:6px;margin-bottom:10px">To decide</div>` +
  `<h2 style="font-size:20px;margin:0 0 6px">${title}</h2><p style="margin:0 0 14px;max-width:1700px">${intro}</p>` +
  `<div style="display:flex;gap:24px;align-items:flex-start">${opts.join('')}</div></div>`;

const paidCard = [374, 232, 286, 94];
const q1 = q(
  'Question 1 of 2 · The Paid card’s “1 owes more”: amber or gray?',
  'Today the note is amber text (the warning color) on the gray card; it is the only colored card note in the dashboard. The shared cards draw every note gray (Payments recorded’s “includes $85 from cancelled”, Star’s school counts). Each row that owes more already has its own amber line with the ⚠ icon: “Paid $65 · $20 more to collect”.',
  [
    opt('A · Keep it amber', false,
      `<div style="display:flex;gap:16px;align-items:flex-start">` + fig({ src: 'pc-q1-a.png', crop: [366, 226, 300, 106], scale: 1.8, marks: [[386, 296, 76, 18]], caption: 'The Paid card, enlarged.' }) + fig({ src: 'pc-q1-a.png', crop: [180, 418, 300, 84], scale: 1.3, caption: 'Ava’s row (both options).' }) + `</div>` + `<p style="margin:8px 0 0">` +  'Looks as today. <b>Needs a change to a shared part</b> (an amber note option on CountCards): asked of Dashboard core through Main, so P2’s build waits for it. Amber text without the ⚠ icon and its pale background goes against §7 (amber is always icon + text), and on the gray card it reads almost black (it is hard to tell from gray, as you can see).</p>'),
    opt('B · Gray, like every card note', true,
      `<div style="display:flex;gap:16px;align-items:flex-start">` + fig({ src: 'pc-q1-b.png', crop: [366, 226, 300, 106], scale: 1.8, marks: [[386, 296, 76, 18]], caption: 'The Paid card, enlarged.' }) + fig({ src: 'pc-q1-b.png', crop: [180, 418, 300, 84], scale: 1.3, caption: 'Ava’s row (both options).' }) + `</div>` + `<p style="margin:8px 0 0">` +  '<b>Recommended.</b> No shared-part change, so nothing waits. The card only counts; the warning stays where staff act on it: the row’s amber “⚠ Paid $65 · $20 more to collect” line and its Mark paid button. Same words, only the color changes.</p>'),
  ],
);
const q2 = q(
  'Question 2 of 2 · With Not paid on, what happens when you switch to Past?',
  'The cards already count only the side shown (Upcoming: 3 · 2 paid · 1 not paid; Past: 1 · 1 · 0). The closest pattern is the event roster: its Not paid filter <b>stays on when you switch class</b>, and a class with nobody left shows “Everyone in this class has paid.” (Star and Camps have no second switch to copy.)',
  [
    opt('A · The filter stays on (as the event roster’s class switch)', true,
      `<div style="display:flex;gap:16px;align-items:flex-start">` +
      fig({ src: 'pc-q2-upcoming.png', crop: [60, 225, 1210, 280], scale: 0.48, marks: [[672, 232, 286, 94], [76, 338, 210, 32]], caption: 'Upcoming, Not paid on: Liam.' }) +
      fig({ src: 'pc-q2-a-past.png', crop: [60, 225, 1210, 280], scale: 0.48, marks: [[672, 232, 286, 94], [76, 410, 1180, 84]], caption: 'Tap Past: still “Showing not paid only”; nobody → “Every past private testing is paid.”' }) +
      `</div><p style="margin:8px 0 0"><b>Recommended.</b> Same as the roster staff already use: a filter you turned on stays on until Show all or tapping the card again; the blue edge and the “Showing not paid only · Show all” line always say it’s on. Lets the desk check “who still owes” on both sides in two taps. The filter is kept only while the page is open, as the side is today.</p>`),
    opt('B · Switching sides turns the filter off', false,
      fig({ src: 'pc-q2-b-past.png', crop: [60, 225, 1210, 300], scale: 0.48, marks: [[374, 232, 884, 94]], caption: 'Tap Past: every past private testing shows, no card on.' }) +
      `<p style="margin:8px 0 0">Never an empty-looking list after a switch, but it behaves differently from the event roster, and checking who owes on Past needs Not paid again (one more tap).</p>`),
  ],
);

const spec = {
  title: 'Color Belt · Part 2 · P2 · Private testing tab (CB1, CB2, CB3, CB9)',
  subtitle: '<b>Mostly already decided</b>: the same Mark paid box, Print receipt and Undo question as P1 (Star v0.518, shared parts v1.103–v1.107), plus the private cards becoming filters (v1.013). <b>Two questions of Color Belt’s own are at the bottom.</b> <span style="color:#6B6B6B">(Preview screenshots, fake data. The “after” is drawn on top of the real page with the shared parts’ real markup; nothing in the app is built yet.)</span>',
  width: 2700,
  columns: [
    {
      label: 'Today', tone: 'today', items: [
        { src: 'pc-today.png', crop: [60, 225, 1210, 390], scale: 0.8, caption: '<b>1. Mark paid</b> records the payment at once, by Paying by (Liam: Cash; Ava’s top-up: Cash). If they pay another way, an admin fixes it afterwards with Edit payment. <b>4. The cards</b> are plain boxes: tapping does nothing; “1 owes more” is amber text.', marks: [[1107, 446, 108, 28], [1107, 515, 108, 28], [374, 232, 286, 94], [672, 232, 286, 94]] },
        { src: 'pc-menu-today.png', crop: [640, 290, 630, 330], scale: 0.9, caption: '<b>2–3.</b> ⋯ → <b>Undo payment</b> acts at once, with no question. There is no Print receipt.', marks: [[1048, 450, 198, 32]] },
      ],
    },
    {
      label: 'After', tone: 'after', items: [
        { row: [
          { src: 'pc-markpaid-after.png', crop: [640, 420, 630, 310], scale: 0.85, caption: '<b>1. CB1 · Mark paid opens the shared box</b>, as P1: name · amount (worked out by the database, shown, not typed), <b>Paid by</b> preset to Paying by with “They chose Cash at the desk.” (added at the desk; “… on the form.” for a student moved from an event), then <b>Mark paid $95</b>. Picking another way also changes Paying by (v0.419).', marks: [[975, 547, 240, 166]] },
          { src: 'pc-topup-after.png', crop: [640, 380, 630, 280], scale: 0.85, caption: '<b>Top-up</b> (Ava paid $65 of $85 before the price went up): the same box with <b>only what is still owed</b>, “Ava Chen · $20” → <b>Mark paid $20</b>.', marks: [[975, 478, 240, 166]] },
        ] },
        { row: [
          { src: 'w820-markpaid-after.png', shotWidth: 820, crop: [96, 420, 700, 360], scale: 0.55, caption: 'Tablet 820', marks: [[499, 595, 240, 178]] },
          { src: 'w390-markpaid-after.png', shotWidth: 390, crop: [0, 190, 390, 350], scale: 0.7, caption: 'Phone 390', marks: [[8, 340, 240, 178]] },
          { src: 'w320-markpaid-after.png', shotWidth: 320, crop: [0, 190, 320, 350], scale: 0.7, caption: '320 wide', marks: [[8, 340, 240, 178]] },
        ] },
        { src: 'pc-menu-after.png', crop: [640, 270, 630, 340], scale: 0.9, caption: '<b>2. CB2 · Print receipt</b> ends the ⋯ money group, for staff and admins, on a row with a payment. Hidden while Hide private details is on. (The receipt itself is mockup P3.)', marks: [[1048, 450, 198, 32]] },
        { row: [
          { src: 'pc-confirm-after.png', crop: [440, 60, 400, 230], scale: 1, caption: '<b>3. CB3 · Undo payment asks first</b>, as P1: “Undo Noah Kim’s payment?” · Keep payment (focused first) · <b>Undo payment</b> (blue). On a top-up it undoes the most recent payment, as today.', marks: [[460, 80, 360, 183]] },
          { src: 'w820-confirm-after.png', shotWidth: 820, crop: [200, 70, 420, 240], scale: 0.75, caption: 'Tablet 820', marks: [[230, 96, 360, 187]] },
          { src: 'w390-confirm-after.png', shotWidth: 390, crop: [0, 60, 390, 240], scale: 0.7, caption: 'Phone 390', marks: [[16, 84, 358, 187]] },
          { src: 'w320-confirm-after.png', shotWidth: 320, crop: [0, 40, 320, 280], scale: 0.7, caption: '320: stacked', marks: [[16, 64, 288, 231]] },
        ] },
        { row: [
          { src: 'pc-filter-after.png', crop: [60, 225, 1210, 280], scale: 0.62, caption: '<b>4. CB9 · The cards filter</b> (shared CountCards, as the event roster): Private testings shows everyone; <b>Paid</b> and <b>Not paid</b> filter, with a blue edge and “Showing not paid only · Show all”; Payments recorded stays a plain total and keeps “includes $X from cancelled”. With Hide private details on, only the Private testings card shows (as today).', marks: [[672, 232, 286, 94], [76, 336, 190, 18]] },
          { src: 'w390-filter-after.png', shotWidth: 390, crop: [0, 236, 390, 440], scale: 0.7, caption: 'Phone 390', marks: [[16, 348, 175, 70], [16, 440, 200, 20]] },
        ] },
      ],
    },
  ],
  footer: q1 + q2 + '<p style="margin-top:18px"><b>Everything else is copied</b> from P1 / Star v0.518 and the shared parts. <b>Answer Question 1 first (A or B), then Question 2.</b></p>',
};

writeFileSync(join(here, 'p2.json'), JSON.stringify(spec, null, 1));
const r = spawnSync(process.execPath, [join(tools, 'compose.mjs'), join(here, 'p2.json')], { stdio: 'inherit' });
process.exitCode = r.status ?? 1;
