// build-q3.mjs — writes cb14-q3.json (CB14 / M15 sheet 3: Question 3 of 4 — how do the two schools show
// in Settings → Classes and ranks, a page that ignores the top bar's school?) and runs compose.mjs.
// Shots: shoot-q3.sh (p3/oneshot.mjs + steps/q3-*.js); drawing: inject-cb14.js ('settings') + inject-q3.js.
// Run: node build-q3.mjs   (from this folder or anywhere)
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const tools = join(here, '../../../../Design Review/tools');

// One screenshot, cropped and scaled, with blue option marks (as sheet 2's options)
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

// Crops (screenshot pixels). PC: the Settings page from its title down; phones: the part, scrolled to the top.
const PC = [56, 80, 720, 1320];
const pc = (src, caption, marks = []) => fig({ src, crop: PC, scale: 0.5, caption, marks });
const pcTop = (src, caption, marks = [], h = 520) => fig({ src, crop: [56, 30, 1224, h], scale: 0.42, caption, marks });
const tab = (src, caption, marks = []) => fig({ src, shotWidth: 820, crop: [0, 0, 820, 1180], scale: 0.38, caption, marks });
const ph = (src, caption, marks = []) => fig({ src, shotWidth: 390, crop: [0, 0, 390, 844], scale: 0.5, caption, marks });
const long = (src, caption, marks = []) => fig({ src, shotWidth: 390, crop: [0, 0, 390, 1700], scale: 0.4, caption, marks });
const nar = (src, caption, marks = []) => fig({ src, shotWidth: 320, crop: [0, 0, 320, 640], scale: 0.6, caption, marks });

const q3 = q(
  'Question 3 of 4 · How do the two schools show in Settings → Classes and ranks?',
  'Today the Classes and ranks tab shows only the school chosen in the top bar. <b>Settings ignores the top bar</b> (Dashboard core’s rule: “Settings keeps ignoring the location switcher, and names the school wherever the classes differ — the shared ChoiceGroup if it’s a switch”). So after the move the part must show the schools some other way. All three keep the same class list, drag order and edit buttons as today; only how you get from one school to the other changes. <span style="color:#6B6B6B">(In the preview both schools have the same seven classes; the real lists can differ.)</span>',
  [
    opt('A · One school under the other', false,
      pc('q3-pc-A.png', 'PC: a “Worcester” heading with its own Add class and its classes, then “Shrewsbury” the same way (Shrewsbury drawn with every class closed; open, it is longer still).', [[76, 410, 672, 32], [76, 1078, 672, 32]]) +
      '<div>' + long('q3-w390long-A.png', 'Phone 390, the whole page (Shrewsbury closed).') + ph('q3-w390-A.png', 'Phone 390, first screen.') + nar('q3-w320-A.png', '320.') + tab('q3-w820-A.png', 'Tablet 820.') + '</div>' +
      what('Both schools’ classes are on the page at once, each under its school’s name, each with its own Add class and its own drag order.',
        'Everything visible at once; nothing to tap to compare the schools.',
        'A long page, longest on phones (14 class lines plus every open class’s ranks). Two “Add class” buttons on one page. A drag can only stay inside its own school, but two near-identical lists one under the other are easy to mix up while scrolling.')),
    opt('B · A school switch inside the part', true,
      pc('q3-pc-BWorcester.png', 'PC: the shared ChoiceGroup “Worcester | Shrewsbury” at the top of the part; it starts on the top bar’s school. Only that school’s classes show.', [[76, 405, 175, 32]]) +
      pc('q3-pc-BShrewsbury.png', 'After one tap on Shrewsbury (the top bar stays on Worcester — Settings ignores it).', [[76, 405, 175, 32]]) +
      fig({ src: 'q3-pc-Bempty.png', crop: [56, 320, 720, 200], scale: 0.5, caption: 'A school with no classes yet: “No classes yet at Shrewsbury.” (the empty line names the school).', marks: [[324, 482, 178, 20]] }) +
      '<div>' + long('q3-w390long-BWorcester.png', 'Phone 390, the whole page.') + ph('q3-w390-BWorcester.png', 'Phone 390, first screen.', [[16, 163, 175, 36]]) + nar('q3-w320-BWorcester.png', '320.') + tab('q3-w820-BWorcester.png', 'Tablet 820.') + '</div>' +
      what('A Worcester / Shrewsbury switch (the same joined buttons as Open / Closed and Cash / Check / Card) sits above the list, with Add class on its right. It opens on the school chosen in the top bar (Worcester if the top bar says Both). Add class adds to the school shown.',
        'Same look and length as today’s tab. The switch always names the school, so nobody edits the wrong school by mistake. One Add class. Uses the shared part Dashboard core’s rule names.',
        'One extra tap to see the other school; the two schools are never side by side.')),
    opt('C · Follow the top bar (as today)', false,
      pc('q3-pc-C.png', 'PC: no switch. The part says “Worcester’s classes — change school in the top bar”.', [[76, 420, 672, 24]]) +
      pcTop('q3-pc-C.png', 'The school comes from the top bar’s switch, far from the part.', [[993, 34, 235, 32]], 420) +
      '<div>' + ph('q3-w390-C.png', 'Phone 390.') + nar('q3-w320-C.png', '320.') + tab('q3-w820-C.png', 'Tablet 820.') + '</div>' +
      what('Works like today’s tab: the part shows the school chosen in the top bar, and says so in its heading.',
        'No new control; exactly today’s behavior.',
        'Settings would be the only part of Settings that follows the top bar — it breaks the page’s rule. An admin who left the top bar on the other school could add or reorder classes at the wrong school without noticing. With “Both” in the top bar the part would still have to pick one school.')),
  ],
);

const later = '<div style="margin:26px 0 0"><h2 style="font-size:18px;margin:0 0 6px">Still to come</h2><ol start="4" style="margin:0;padding-left:22px;line-height:1.6">' +
  '<li><b>Question 4:</b> the Prices tab’s name (drawn as “Prices”).</li></ol></div>' +
  '<p style="margin-top:18px"><b>Answer Question 3 (A, B or C).</b></p>';

const spec = {
  title: 'CB14 sheet 3 · Question 3 of 4: how do the two schools show in Settings → Classes and ranks?',
  subtitle: '<b>Question 1 answered: B</b> — Settings stays admins only; staff read Color Belt’s Prices tab. Question 2 (the hints as links) is on sheet 2. This sheet is <b>Question 3 of 4</b>. <span style="color:#6B6B6B">(Preview screenshots, fake data, signed in as an admin, top bar on Worcester. The options are drawn on top of the real Settings page with sheet 1’s Classes and ranks part; nothing in the app is built yet. Addresses are hidden.)</span>',
  width: 2700,
  columns: [
    {
      label: 'Today', tone: 'today', items: [
        { src: 'q3-pc-today.png', crop: [56, 30, 1224, 620], scale: 0.62, caption: '<b>Testing → Color belt testing → Classes and ranks</b> (admin, PC): shows only the school chosen in the top bar (here Worcester); to see Shrewsbury’s classes you change the top bar.', marks: [[993, 34, 235, 32]] },
      ],
    },
    {
      label: 'After (sheet 1): Settings → Classes and ranks', tone: 'after', items: [
        { src: 'q3-pc-BWorcester.png', crop: [56, 80, 720, 380], scale: 0.62, caption: '<b>Settings ignores the top bar</b>: Schools lists both schools; the new Classes and ranks part (here drawn as option B) must say which school it shows.', marks: [[76, 220, 672, 82], [76, 334, 672, 104]] },
      ],
    },
  ],
  footer: q3 + later,
};

writeFileSync(join(here, 'cb14-q3.json'), JSON.stringify(spec, null, 1));
const r = spawnSync(process.execPath, [join(tools, 'compose.mjs'), join(here, 'cb14-q3.json')], { stdio: 'inherit' });
process.exitCode = r.status ?? 1;
