// build-cb14.mjs — writes cb14.json (CB14 / M15 sheet 1: Today / After columns for Classes and ranks
// moving into Settings and Color Belt's Prices tab, then Jeffrey's Question 1 of 4 under them) and runs
// compose.mjs on it. Shots: shoot-cb14.sh (tablet, phones) and cdp.mjs by hand (PC); drawing: inject-cb14.js.
// The questions use compose's footer, drawn like build-p2.mjs's (blue = an option).
// Run: node build-cb14.mjs   (from this folder or anywhere)
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const tools = join(here, '../../../../Design Review/tools');

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

const phone = (src, caption, marks = [], crop = [0, 0, 390, 844], scale = 0.6) => ({ src, shotWidth: 390, crop, scale, caption, marks });
const narrow = (src, caption, marks = [], crop = [0, 0, 320, 640], scale = 0.7) => ({ src, shotWidth: 320, crop, scale, caption, marks });
const tablet = (src, caption, marks = [], crop = [0, 0, 820, 1180], scale = 0.42) => ({ src, shotWidth: 820, crop, scale, caption, marks });

const q1 = q(
  'Question 1 of 4 · Staff can view Classes and ranks today (v0.40). Settings is admins only. What do staff see after the move?',
  'Today staff (and the shared desk sign-in) open Testing → Classes and ranks and read every class, rank and price, with “View only. Ask an admin to make changes.” (v1.021). After the move, the prices stay in Color Belt’s tab; only the class and belt list goes to Settings, which staff can’t open (they see “Only admins can see Settings.”). Day to day the desk needs the <b>prices</b> (a family asks what testing costs) — and the classes’ days and times are already in the Schedule, which staff can see.',
  [
    opt('A · Staff get a view-only Settings → Classes and ranks', false,
      fig({ src: 'pc-q1a-staff-settings.png', crop: [56, 80, 720, 600], scale: 0.72, caption: 'Staff open Settings: only Classes and ranks, with the view-only line; no Add, no edit, no reorder. Schools stays admins only.', marks: [[76, 203, 240, 42]] }) +
      '<p style="margin:8px 0 0">Staff keep everything they can read today, in its new place. − Settings stops being “admins only”: the account menu must show Settings to staff (that entry is <b>Dashboard core’s change</b>, in AccountMenu.jsx — M17 changes the menu too), and the page needs a staff version. − Two places to look for one school’s rank list (Settings for belts, Color Belt for prices).</p>'),
    opt('B · Settings stays admins only; staff read the Prices tab (view only)', true,
      fig({ src: 'pc-q1b-staff-prices.png', crop: [56, 90, 1220, 560], scale: 0.48, caption: 'Staff on Color Belt → Prices: every class and rank with its belt, the three prices, sparring gear and the final award; the view-only line; no edit.', marks: [[76, 232, 420, 26]] }) +
      '<p style="margin:8px 0 0"><b>Recommended.</b> The desk still sees what it uses — every class, rank, price and final award — in the place it already goes (Color belt testing). No account-menu change, no staff version of Settings, Settings keeps its one rule (admins only, v0.135). − Staff lose the “Testing for” column (which belt comes next); the belts are listed in order, and the event’s roster still shows it.</p>'),
  ],
);

const later = '<div style="margin:26px 0 0"><h2 style="font-size:18px;margin:0 0 6px">Questions to come, one at a time after Question 1</h2><ol style="margin:0;padding-left:22px;line-height:1.6">' +
  '<li><b>Question 2:</b> the Schedule’s and Forms’ hints (“Add classes in …”) — plain text pointing to Settings → Classes and ranks, or links that open it (it would get its own address, e.g. #settings/classes-and-ranks; the hints are the new students’ N11).</li>' +
  '<li><b>Question 3:</b> how the two schools show on a page that ignores the top bar — one under the other with the school named (drawn here as the default reading), or a Worcester / Shrewsbury switch inside the part (the shared ChoiceGroup).</li>' +
  '<li><b>Question 4:</b> the Prices tab’s name (drawn as “Prices”).</li></ol>' +
  '<p style="margin:12px 0 0;color:#6B6B6B">Not on this sheet: the Add / Edit class and Add / Edit rank dialogs split the same way (Settings keeps name, belt, order and next rank; the Prices tab’s edit keeps the prices, sparring gear and the final award) — drawn after the four answers. No database change is expected (same tables; admins already write them).</p></div>' +
  '<p style="margin-top:18px"><b>Answer Question 1 first (A or B).</b></p>';

const spec = {
  title: 'Color Belt · CB14 / M15 · Sheet 1 · Classes and ranks move to Settings; Color Belt keeps a Prices tab',
  subtitle: '<b>Already decided</b> (v1.023, walkthrough 15d option B): things several sections use live in Settings — <b>Classes and ranks</b> becomes Settings’ second part, after Schools, each school’s classes and belt ranks with Add class; Color Belt keeps only what is testing’s own — <b>the three prices, sparring gear and each class’s final award</b> — in a tab. Joint plan with Dashboard core agreed: Color Belt builds it, Dashboard core reviews the Settings fit. <b>Four questions of D6 are left; Question 1 is at the bottom.</b> <span style="color:#6B6B6B">(Preview screenshots, fake data. The “after” is drawn on top of the real pages from the real class list; nothing in the app is built yet. Addresses are hidden in the pictures.)</span>',
  width: 2700,
  columns: [
    {
      label: 'Today', tone: 'today', items: [
        { src: 'pc-classes-today.png', crop: [56, 80, 1224, 560], scale: 0.85, caption: '<b>1. Testing → Color belt testing → Classes and ranks</b> (admin, Worcester): each class’s ranks with their belt, the belt they test for, the three prices and sparring gear; the last rank tests for the class’s final award. Add class at the top. It follows the top bar’s school (v0.36).', marks: [[137, 180, 103, 36], [840, 274, 340, 272], [400, 512, 185, 28]] },
        { src: 'pc-settings-staff-today.png', crop: [56, 80, 700, 140], scale: 0.85, caption: '<b>2. Settings</b> today: one part, Schools; admins only — staff see this line.', marks: [] },
      ],
    },
    {
      label: 'After', tone: 'after', items: [
        { src: 'pc-settings-after.png', crop: [56, 80, 720, 1310], scale: 0.62, caption: '<b>1. Settings gets a second part, “Classes and ranks”</b>, after Schools: its h2 heading, Add class (outline, as a part’s button) and one gray line; each school’s classes under the school’s name. The same class list and drag order as today, with <b>no prices and no sparring gear</b>; the last rank’s next belt reads “Final award: set in the Prices tab”. Settings ignores the top bar. The layout of the two schools is Question 3.', marks: [[76, 334, 672, 72], [76, 418, 672, 352]] },
        { src: 'pc-prices-after.png', crop: [56, 80, 1224, 760], scale: 0.62, caption: '<b>2. Color belt testing → “Prices”</b> (name: Question 4): the three prices and sparring gear per rank, and each class’s <b>final award</b> on its line, with an edit pencil (admins). No reorder, no Add (classes, ranks and their order are in Settings); it still follows the top bar’s school.', marks: [[137, 180, 40, 36], [244, 279, 160, 22], [845, 312, 335, 268]] },
        { row: [
          tablet('w820-settings-part-after.png', 'Tablet 820: Settings, the new part.'),
          tablet('w820-prices-after.png', 'Tablet 820: the Prices tab.'),
        ] },
        { row: [
          phone('w390-settings-part-after.png', 'Phone 390: Settings, the new part (scrolled).'),
          phone('w390-prices-after.png', 'Phone 390: the Prices tab; each rank’s prices on its second line.'),
          narrow('w320-settings-part-after.png', '320: Settings, the new part.'),
          narrow('w320-prices-after.png', '320: the Prices tab.'),
        ] },
      ],
    },
  ],
  footer: q1 + later,
};

writeFileSync(join(here, 'cb14.json'), JSON.stringify(spec, null, 1));
const r = spawnSync(process.execPath, [join(tools, 'compose.mjs'), join(here, 'cb14.json')], { stdio: 'inherit' });
process.exitCode = r.status ?? 1;
