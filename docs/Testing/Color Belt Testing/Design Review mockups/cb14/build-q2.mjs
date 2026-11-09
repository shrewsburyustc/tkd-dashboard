// build-q2.mjs — writes cb14-q2.json (CB14 / M15 sheet 2: Question 2 of 4 — do the Schedule's and
// Forms' "Classes and ranks" hints become links to Settings → Classes and ranks?) and runs compose.mjs.
// Shots: cdp.mjs by hand (PC) and p3/oneshot.mjs with steps/q2-*.js (phone 390); drawing: inject-q2.js.
// Run: node build-q2.mjs   (from this folder or anywhere)
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const tools = join(here, '../../../../Design Review/tools');

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

// The three hints, cropped the same way in every option
const EMPTY = [440, 96, 400, 140]; // Add time slot at a school with no classes: the amber note
const HINT = [440, 160, 400, 190]; // Add time slot: the Class choices and the gray line under them
const FORMS = [940, 420, 312, 120]; // Forms → Book a class → Classes offered
const empty = (src, caption, marks = []) => fig({ src, crop: EMPTY, scale: 0.95, caption, marks });
const hint = (src, caption, marks = []) => fig({ src, crop: HINT, scale: 0.95, caption, marks });
const forms = (src, caption, marks = []) => fig({ src, crop: FORMS, scale: 1.1, caption, marks });
const phone = (src, caption, crop = [0, 0, 390, 300]) => fig({ src, shotWidth: 390, crop, scale: 0.8, caption });

const q2 = q(
  'Question 2 of 4 · The Schedule’s and Forms’ hints: links to Settings → Classes and ranks, or plain text?',
  'Three hints point at the class list. After the move they must say <b>Settings → Classes and ranks</b> either way. The question is only whether they also open it. <b>Only admins see them</b> (Add / Edit time slot and the form builder are admins only; staff’s Schedule is view only), so there is no staff version to draw. A link needs Settings → Classes and ranks to have <b>its own address</b> (#settings/classes-and-ranks, opening Settings scrolled to that part). The link look is the app’s existing inline link — as Black Belt’s “Go to the default rubric” in its gray line; no other section links between sections today. <b>The hint files are the New students session’s (N11)</b>: Color Belt gives the address, they change the words.',
  [
    opt('A · All three become links', false,
      empty('q2-pc-slot-empty-A.png', '1. Add time slot, no classes yet.', [[554, 176, 152, 18]]) +
      hint('q2-pc-slot-hint-A.png', '2. Add time slot: the line under the Class choices.', [[475, 322, 152, 18]]) +
      forms('q2-pc-forms-A.png', '3. Forms → Book a class → Classes offered.', [[957, 508, 152, 18]]) +
      '<p style="margin:8px 0 0">One tap to the class list from anywhere it’s mentioned. − Hint 2 sits beside choices the admin may already have ticked: a tap there leaves the dialog (the unsaved-changes guard would have to stop it), for a line that is only saying where the list comes from.</p>'),
    opt('B · Plain text, new words only', false,
      empty('q2-pc-slot-empty-B.png', '1. No classes yet.') +
      hint('q2-pc-slot-hint-B.png', '2. Under the Class choices.') +
      forms('q2-pc-forms-B.png', '3. Classes offered.') +
      '<p style="margin:8px 0 0">The least change; no address needed. − An admin stuck on “no classes yet” must find Settings themselves (account menu → Admin → Settings — not on the side panel).</p>'),
    opt('C · Links only where the admin is stuck; the Class choices’ line stays plain', true,
      empty('q2-pc-slot-empty-A.png', '1. No classes yet: a link.', [[554, 176, 152, 18]]) +
      hint('q2-pc-slot-hint-B.png', '2. Under the Class choices: plain “From Settings → Classes and ranks”.') +
      forms('q2-pc-forms-A.png', '3. Classes offered, no classes yet: a link.', [[957, 508, 152, 18]]) +
      '<p style="margin:8px 0 0"><b>Recommended.</b> The two “no classes yet” lines are dead ends — nothing can be done on that screen until classes exist, and Settings is tucked in the account menu — so a link there saves the hunt, with nothing typed to lose. The line under the Class choices is only information, next to choices being made, so it stays plain text.</p>'),
  ],
);

const later = '<div style="margin:26px 0 0"><h2 style="font-size:18px;margin:0 0 6px">Still to come, one at a time</h2><ol start="3" style="margin:0;padding-left:22px;line-height:1.6">' +
  '<li><b>Question 3:</b> how the two schools show on Settings → Classes and ranks, a page that ignores the top bar — one under the other with the school named (sheet 1’s default reading), or a Worcester / Shrewsbury switch inside the part (the shared ChoiceGroup).</li>' +
  '<li><b>Question 4:</b> the Prices tab’s name (drawn as “Prices”).</li></ol></div>' +
  '<p style="margin-top:18px"><b>Answer Question 2 (A, B or C).</b></p>';

const spec = {
  title: 'Color Belt · CB14 / M15 · Sheet 2 · Question 2: the Schedule’s and Forms’ hints',
  subtitle: '<b>Question 1 answered: B</b> — Settings stays admins only; staff read Color Belt’s Prices tab (view only). This sheet is <b>Question 2 of 4</b>. <span style="color:#6B6B6B">(Preview screenshots, fake data; Shrewsbury’s classes cleared in the preview to show the “no classes yet” lines. The options are drawn on top of the real pages; nothing in the app is built yet.)</span>',
  width: 2700,
  columns: [
    {
      label: 'Today', tone: 'today', items: [
        { src: 'q2-pc-slot-empty-today.png', crop: EMPTY, scale: 1, caption: '<b>1. Schedule → Add time slot</b> at a school with no classes yet: “Add classes in Testing → Classes and ranks first. The schedule uses them.” (admins only).', marks: [[476, 176, 352, 36]] },
        { src: 'q2-pc-slot-today.png', crop: HINT, scale: 1, caption: '<b>2. Add / Edit time slot</b>: “From Testing → Classes and ranks” under the Class choices (admins only).', marks: [[444, 322, 392, 18]] },
        { src: 'q2-pc-forms-today.png', crop: FORMS, scale: 1.2, caption: '<b>3. Forms → Book a class → Classes offered</b> at a school with no classes: “This school has no classes yet (Testing → Classes and ranks).” (admins only; staff fill in and share forms).', marks: [[953, 490, 286, 36]] },
      ],
    },
    {
      label: 'Phone 390 (today and option C’s link)', tone: 'after', items: [
        { row: [
          { src: 'w390-q2-slot-empty-today.png', shotWidth: 390, crop: [0, 0, 390, 240], scale: 0.9, caption: 'Today: Add time slot, no classes.' },
          { src: 'w390-q2-slot-empty-A.png', shotWidth: 390, crop: [0, 0, 390, 240], scale: 0.9, caption: 'With the link (A and C).', marks: [[124, 108, 154, 18]] },
        ] },
        { row: [
          { src: 'w390-q2-forms-today.png', shotWidth: 390, crop: [0, 360, 390, 120], scale: 0.9, caption: 'Today: Forms, Classes offered.' },
          { src: 'w390-q2-forms-A.png', shotWidth: 390, crop: [0, 360, 390, 120], scale: 0.9, caption: 'With the link (A and C).' },
        ] },
      ],
    },
  ],
  footer: q2 + later,
};

writeFileSync(join(here, 'cb14-q2.json'), JSON.stringify(spec, null, 1));
const r = spawnSync(process.execPath, [join(tools, 'compose.mjs'), join(here, 'cb14-q2.json')], { stdio: 'inherit' });
process.exitCode = r.status ?? 1;
