// merge-mockups.mjs — draws the pictures for "Prospects + Forms in one section, and a form filter"
// (Jeffrey, 2026-11-17). Run only against `npm run dev:preview-mode` (fake data), never the live database.
// Why: new designs are shown before they are built (rulebook P8, CLAUDE.md). A picture made of the REAL
// page (real styles, real fake data) with the new parts added on top shows exactly what the built page
// will look like, and the added parts carry an amber outline.
// How: a hidden Chrome (the Dashboard core's chrome.mjs) signs in to the preview, opens a page at a screen
// size, adds the new pieces to the page with a little JavaScript (they exist only in the picture), and
// takes a screenshot of the top of the page. A second step lays pictures out on one sheet (PNG).
//
// Usage: node merge-mockups.mjs <preview address, e.g. http://localhost:5173/> <outdir> <sheet name> …
//   sheets: questions | pages (the approved-design pictures, made after the answers)

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..', '..');
const { withChrome, SIZES } = await import(pathToFileURL(join(repo, 'docs', 'Dashboard Core', 'tools', 'chrome.mjs')).href);

const [base, outArg, ...sheets] = process.argv.slice(2);
if (!base || !outArg) {
  console.error('Usage: node merge-mockups.mjs <preview address> <outdir> <sheet> …');
  process.exit(1);
}
const outdir = resolve(outArg);
mkdirSync(outdir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A Tabler icon as inline SVG text (the app's own icon set).
const icon = (name, size = 16) =>
  readFileSync(join(repo, 'node_modules', '@tabler', 'icons', 'icons', 'outline', `${name}.svg`), 'utf8')
    .replace(/width="24"/, `width="${size}"`).replace(/height="24"/, `height="${size}"`).replace(/\s+/g, ' ');

// ---------- what gets added to the real page (runs inside the page) ----------
// Everything new is wrapped in .mk (amber outline). Styles use the app's own tokens.
const CSS = `
.mk { outline: 2px solid #f59e0b; outline-offset: 3px; border-radius: 6px; }
.mk-note { display:inline-block; background:#f59e0b; color:#3b2400; font: 600 11px/1 system-ui,sans-serif; padding:3px 6px; border-radius:4px; margin-left:8px; vertical-align:middle; }
.mk-row { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom: var(--space-12); position:relative; }
.mk-row .psearch { margin-bottom:0; flex:1 1 180px; max-width:360px; width:auto; }
.mk-fbtn { display:inline-flex; align-items:center; gap:8px; height:var(--control-height); padding:0 12px; border:1px solid var(--color-border-control); border-radius:var(--radius-control); background:var(--color-bg); color:var(--color-text); font:inherit; font-size:var(--text-13); white-space:nowrap; max-width:100%; }
.mk-fbtn.is-on { border-color:var(--color-blue); background:var(--color-blue-tint); color:var(--color-blue); }
.mk-fbtn span.t { overflow:hidden; text-overflow:ellipsis; }
.mk-pop { position:absolute; top:46px; bottom:auto; left:0; z-index:5; width:340px; max-width:calc(100vw - 32px); background:var(--color-bg); border:1px solid var(--color-border); border-radius:8px; box-shadow:0 8px 24px rgba(0,0,0,.16); padding:8px 0; }
.mk-pop h4, .mk-sheet h4 { margin:0; padding:6px 16px 8px; font-size:12px; font-weight:500; color:var(--color-text-secondary); }
.mk-pop .grp, .mk-sheet .grp { padding:8px 16px 4px; font-size:12px; font-weight:500; color:var(--color-text-secondary); border-top:1px solid var(--color-border); margin-top:4px; }
.mk-opt { display:flex; align-items:flex-start; gap:10px; padding:8px 16px; font-size:13px; }
.mk-opt .box { flex:none; width:18px; height:18px; margin-top:1px; border:1.5px solid var(--color-border-control); border-radius:4px; display:flex; align-items:center; justify-content:center; background:var(--color-bg); }
.mk-opt .box.on { background:var(--color-blue); border-color:var(--color-blue); color:#fff; }
.mk-opt .n { margin-left:auto; padding-left:12px; color:var(--color-text-secondary); font-size:12px; flex:none; }
.mk-opt .l { min-width:0; }
.mk-sheet .mk-foot, .mk-foot { display:flex; justify-content:space-between; padding:8px 16px 4px; border-top:1px solid var(--color-border); margin-top:4px; font-size:13px; color:var(--color-blue); }
.mk-sheet { position:fixed; left:0; right:0; bottom:0; z-index:50; background:var(--color-bg); border-radius:16px 16px 0 0; box-shadow:0 -8px 32px rgba(0,0,0,.25); padding:8px 0 20px; }
.mk-sheet .mk-opt { padding:12px 16px; font-size:14px; }
.mk-scrim { position:fixed; inset:0; background:rgba(0,0,0,.4); z-index:49; }
.mk-chips { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom: var(--space-12); }
.mk-chips .lab { font-size:12px; color:var(--color-text-secondary); }
.mk-chips .pchip { max-width:100%; }
.mk-chips .pchip span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
`;

// the form names used in the drawings (the real forms are named by the school; these are the examples Jeffrey gave)
const FORMS = [
  { name: 'Visitor Information', school: 'Worcester', n: 4 },
  { name: 'Al-Hamra Special 4-Week Introductory Taekwondo Program', school: 'Worcester', n: 3 },
  { name: 'Free class — Instagram', school: 'Worcester', n: 3 },
];

const tabsHtml = (current) =>
  `<div class="ttabs mk" role="tablist" style="margin-top:8px"><button class="ttab${current === 'prospects' ? ' is-current' : ''}" role="tab" type="button">Prospects</button><button class="ttab${current === 'forms' ? ' is-current' : ''}" role="tab" type="button">Forms</button></div>`;

const check = icon('check', 14);
const optHtml = (f, on, group) =>
  `<div class="mk-opt"><span class="box${on ? ' on' : ''}">${on ? check : ''}</span><span class="l">${f.name}</span><span class="n">${f.n}</span></div>`;
const allHtml = (on, total) => `<div class="mk-opt"><span class="box${on ? ' on' : ''}">${on ? check : ''}</span><span class="l"><b style="font-weight:500">All forms</b></span><span class="n">${total}</span></div>`;

function menuBody(picked) {
  const total = FORMS.reduce((s, f) => s + f.n, 0);
  return `<h4>Show prospects from</h4>${allHtml(picked.length === 0, total)}<div class="grp">${FORMS[0].school}</div>${FORMS.map((f, i) => optHtml(f, picked.includes(i))).join('')}<div class="mk-foot"><span>Clear</span><span>Done</span></div>`;
}

const label = (picked) => (picked.length === 0 ? 'All forms' : picked.length === 1 ? FORMS[picked[0]].name : `${picked.length} of ${FORMS.length} forms`);

// The search row of the page: [Forms filter button] [search box]  (+ the menu / sheet, when open)
function filterRow({ picked = [], open = false, phone = false }) {
  const on = picked.length > 0;
  const btn = `<button class="mk-fbtn mk${on ? ' is-on' : ''}" type="button">${icon('filter', 16)}<span class="t">Forms: ${label(picked)}</span>${icon('chevron-down', 16)}</button>`;
  const pop = open && !phone ? `<div class="mk-pop mk">${menuBody(picked)}</div>` : '';
  const sheet = open && phone ? `<div class="mk-scrim"></div><div class="mk-sheet mk">${menuBody(picked)}</div>` : '';
  return { btn, pop, sheet };
}

// Injects things into the real Prospects / Forms page. `spec` is plain JSON.
function injectScript(spec) {
  return `(() => {
    const spec = ${JSON.stringify(spec)};
    const css = document.createElement('style'); css.textContent = ${JSON.stringify(CSS)}; document.head.appendChild(css);
    const q = (s) => document.querySelector(s);
    if (spec.title) q('.ptitle').textContent = spec.title;
    if (spec.showAll) { const b = q('.ev-filter-line .link-button'); if (b) b.click(); }
    return new Promise((resolve) => setTimeout(() => {
      const total = [...document.querySelectorAll('.pstage-n, .ptile:not(.ptile--today) b')].slice(0, 5).reduce((s, e) => s + (parseInt(e.textContent, 10) || 0), 0);
      if (spec.showingLine) spec.showingLine = spec.showingLine.replace('__TOTAL__', total);
      if (spec.tabs) q('.phead').insertAdjacentHTML('afterend', spec.tabs);
      if (spec.counts) {
        const ns = [...document.querySelectorAll('.pstage-n')]; spec.counts.forEach((n, i) => { if (ns[i]) ns[i].textContent = n; });
        const bars = [...document.querySelectorAll('.pstage-bar')]; const max = Math.max(1, ...spec.counts);
        spec.counts.forEach((n, i) => { if (bars[i]) bars[i].style.width = Math.max(8, (n / max) * 100) + '%'; });
        const tiles = [...document.querySelectorAll('.ptile:not(.ptile--today) b')]; spec.counts.forEach((n, i) => { if (tiles[i]) tiles[i].textContent = n; });
      }
      if (spec.hideRows) { [...document.querySelectorAll('.plist-row:not(.plist-head)')].forEach((r, i) => { if (i >= spec.hideRows) r.style.display = 'none'; }); }
      if (spec.row) {
        const search = q('.psection .psearch');
        // the box sits in a wrapper that has no box of its own (display: contents); wrap it in a real row
        const wrapper = search && search.parentElement;
        let holder = null;
        if (wrapper) { holder = document.createElement('div'); wrapper.parentElement.insertBefore(holder, wrapper); holder.appendChild(wrapper); }
        if (holder) {
          holder.classList.add('mk-row');
          holder.insertAdjacentHTML('afterbegin', spec.row.btn + spec.row.pop);
          if (spec.showingLine) holder.insertAdjacentHTML('afterend', spec.showingLine);
        }
        if (spec.row.sheet) document.body.insertAdjacentHTML('beforeend', spec.row.sheet);
      }
      if (spec.chips) {
        const search = q('.psection .psearch');
        const holder = search && search.parentElement && search.parentElement.parentElement && search.parentElement;
        if (holder) holder.insertAdjacentHTML('beforebegin', spec.chips);
        if (spec.showingLine) q('.psection .mk-chips').insertAdjacentHTML('afterend', spec.showingLine);
      }
      if (spec.noteOnHead) q('.phead-titles').insertAdjacentHTML('beforeend', spec.noteOnHead);
      resolve('ok');
    }, 1800));
  })()`;
}

// ---------- taking pictures ----------
async function signIn(tab) {
  await tab.open(base, 1500);
  const answer = await tab.evaluate(`(() => {
    if (!document.getElementById('signin-email')) return 'ok';
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    for (const [id, value] of [['signin-email', 'preview@example.com'], ['signin-password', 'preview']]) {
      const input = document.getElementById(id); if (!input) return 'no sign-in form';
      set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const button = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Sign in');
    if (!button) return 'no Sign in button'; button.click(); return 'ok';
  })()`);
  if (answer !== 'ok') throw new Error('sign-in failed: ' + answer);
  await sleep(2000);
}

// Opens `hash` at a size, switches to a school ('Shrewsbury' | 'Worcester' | 'Both'), adds the drawing, returns a PNG.
async function picture(tab, size, { hash, school = 'Worcester', spec, height }) {
  await tab.size({ w: size.w, h: size.h, touch: size.touch, scale: 1 });
  await signIn(tab);
  await tab.open(base + hash, 1200);
  // the school switcher: press the button with the school's name (the page has it in the top bar)
  await tab.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(school)}); if (b) b.click(); return true; })()`);
  await sleep(900);
  const ok = await tab.evaluate(injectScript(spec));
  if (ok !== 'ok') throw new Error('inject failed');
  await sleep(500);
  if (process.env.MOCK_DEBUG) console.log('after inject:', await tab.evaluate(`document.querySelector('.pstage-n')?.textContent + ' rows=' + document.querySelectorAll('.plist-row').length + ' hidden=' + [...document.querySelectorAll('.plist-row')].filter(r=>r.style.display==='none').length`));
  // a picture that fits on the screen is taken without "beyond the screen": that mode makes the page redraw its lists, which loses what was added above
  const h = Math.min(height ?? size.h, size.h);
  return tab.shot({ x: 0, y: 0, width: size.w, height: h }, { beyond: false });
}

const png64 = (buf) => `data:image/png;base64,${buf.toString('base64')}`;

// Lays pictures out on one sheet and saves it as a PNG.
async function sheet(tab, name, html, width) {
  const file = join(outdir, `${name}.html`);
  writeFileSync(file, html);
  await tab.size({ w: width, h: 900, touch: false, scale: 1.5 });
  await tab.open(pathToFileURL(file).href, 500);
  const full = await tab.height();
  writeFileSync(join(outdir, `${name}.png`), await tab.shot({ x: 0, y: 0, width, height: full }));
}

const SHEET_CSS = `
body { margin:0; font: 14px/1.45 system-ui, 'Segoe UI', sans-serif; color:#1a1a1a; background:#f4f5f7; }
.wrap { padding: 28px 32px 36px; }
h1 { font-size: 24px; margin: 0 0 4px; } h2 { font-size: 18px; margin: 28px 0 4px; } p { margin: 4px 0 10px; max-width: 980px; }
.opts { display:flex; gap:28px; align-items:flex-start; flex-wrap:wrap; margin-top:10px; }
.opt { background:#fff; border:1px solid #d7dae0; border-radius:10px; padding:14px; }
.opt h3 { margin:0 0 6px; font-size:15px; } .opt .rec { background:#1d7a3a; color:#fff; font-size:11px; padding:2px 7px; border-radius:10px; margin-left:8px; vertical-align:middle; }
.opt ul { margin:6px 0 10px; padding-left:18px; max-width:560px; } .opt li { margin:2px 0; }
.pics { display:flex; flex-wrap:wrap; gap:16px; align-items:flex-start; }
.pics figure { margin:0; } .pics figcaption { font-size:11px; color:#555; margin-top:4px; }
.pics img { border:1px solid #c9ccd3; display:block; }
.amber { background:#fff4dc; border:1px solid #f59e0b; border-radius:6px; padding:6px 10px; display:inline-block; font-size:12px; }
`;
let partNo = 0;
const fig = (buf, cap, w) => { mkdirSync(join(outdir, 'parts'), { recursive: true }); writeFileSync(join(outdir, 'parts', `part-${String(++partNo).padStart(2, '0')}.png`), buf); return figure(buf, cap, w); };
const figure = (buf, cap, w) => `<figure><img src="${png64(buf)}" width="${w}" alt="${cap}"><figcaption>${cap}</figcaption></figure>`;

// ---------- the sheets ----------
const PC = SIZES[0], PHONE = SIZES[2];

await withChrome(async (tab) => {
  if (sheets.includes('questions')) {
    const stages = { counts: [1, 1, 2, 0, 0] };
    const lineA = `<p class="ev-filter-line cards-showing mk" style="margin-top:0">Showing 4 of __TOTAL__ prospects from Visitor Information · <button type="button" class="link-button inline-link">Show all</button></p>`;
    const common = { tabs: tabsHtml('prospects'), showAll: true };
    // Q2 — the filter control
    const a1 = await picture(tab, PC, { hash: '#prospects', height: 760, spec: { ...common, row: filterRow({ picked: [], open: true }) } });
    const a2 = await picture(tab, PC, { hash: '#prospects', height: 760, spec: { ...common, row: filterRow({ picked: [0] }), showingLine: lineA, counts: stages.counts, hideRows: 4 } });
    const a3 = await picture(tab, PHONE, { hash: '#prospects', height: 844, spec: { ...common, row: filterRow({ picked: [0], open: true, phone: true }) } });
    const chips = (picked) => `<div class="mk-chips mk" role="group" aria-label="Forms"><span class="lab">Forms</span><button class="pchip${picked.length === 0 ? ' is-on' : ''}" type="button"><span>All forms</span></button>${FORMS.map((f, i) => `<button class="pchip${picked.includes(i) ? ' is-on' : ''}" type="button"><span>${f.name} · ${f.n}</span></button>`).join('')}</div>`;
    const b1 = await picture(tab, PC, { hash: '#prospects', height: 760, spec: { ...common, chips: chips([0]), showingLine: lineA, counts: stages.counts, hideRows: 4 } });
    const b2 = await picture(tab, PHONE, { hash: '#prospects', height: 844, spec: { ...common, chips: chips([1]) } });
    // Q3 — the numbers
    const c1 = await picture(tab, PC, { hash: '#prospects', height: 560, spec: { ...common, row: filterRow({ picked: [0] }), counts: stages.counts, showingLine: lineA, hideRows: 4 } });
    const c2 = await picture(tab, PC, { hash: '#prospects', height: 560, spec: { ...common, row: filterRow({ picked: [0] }), showingLine: lineA, hideRows: 4 } });

    const html = `<!doctype html><meta charset="utf-8"><style>${SHEET_CSS}</style><div class="wrap">
<h1>Prospects + Forms in one section — questions</h1>
<p>Drawn on the real Prospects page (fake data; form names are Jeffrey's examples, the counts are made up). <span class="amber">Amber outline = new</span>. Settled without asking (copies what Camps does today): one rail entry <b>Prospects</b>; inside it two underlined tabs, <b>Prospects</b> first, <b>Forms</b> second; <code>#forms</code> bookmarks open the Forms tab.</p>

<h2>Question 1 — how do you pick which forms to see?</h2>
<p>Real form names are long ("Al-Hamra Special 4-Week Introductory Taekwondo Program"), and each school has several forms.</p>
<div class="opts">
 <div class="opt"><h3>A · A "Forms" dropdown next to the search box <span class="rec">Recommended</span></h3>
  <ul><li>Tick one form, several, or "All forms" (the default). Each form shows how many prospects it has.</li>
  <li>Only forms that have prospects at this school are listed, so it stays short. On Both, the forms are grouped under Worcester and Shrewsbury.</li>
  <li>Once a form is picked, the button turns blue ("Forms: Visitor Information") and the line under it says "Showing 4 of 10 prospects from Visitor Information · Show all".</li>
  <li>Phone: opens as a bottom sheet with 44px rows (like the ⋯ menus).</li>
  <li>Pro: copes with long names and many forms; one small control. Con: forms are hidden until you open it.</li></ul>
  <div class="pics">${fig(a1, 'A · PC, menu open (nothing picked yet)', 800)}${fig(a2, 'A · PC, Visitor Information picked', 800)}${fig(a3, 'A · phone, sheet open', 300)}</div></div>
 <div class="opt"><h3>B · A row of chips, one per form</h3>
  <ul><li>Every form is always visible as a chip; tap to turn one on. Same "Showing … · Show all" line.</li>
  <li>Pro: one tap, you see the forms at a glance. Con: long names get cut off ("Al-Hamra Special 4-Week Intro…"); three or four forms already fill two rows on a phone; ten forms would push the list down the page.</li></ul>
  <div class="pics">${fig(b1, 'B · PC, Visitor Information picked', 800)}${fig(b2, 'B · phone, Al-Hamra picked (name cut off)', 300)}</div></div>
</div>

<h2>Question 2 — when a form is picked, do the stage numbers follow?</h2>
<p>The five stage tiles at the top (New, Contacted, Booked, Came, Joined) and the Board follow the same rule. Last time the List said 8 and the Board 7 you asked for numbers that add up (v0.610), so this matters.</p>
<div class="opts">
 <div class="opt"><h3>A · Everything follows the filter <span class="rec">Recommended</span></h3>
  <ul><li>Tiles, List and Board all count only the picked form(s): "New 1, Contacted 1, Booked 2" = the four rows below.</li><li>Pro: numbers always add up to what you see; you can read "how is Visitor Information doing?" straight off the tiles. Con: the school-wide totals are hidden until you press Show all.</li></ul>
  <div class="pics">${fig(c1, 'A · PC: tiles show 1 / 1 / 2 / 0 / 0', 800)}</div></div>
 <div class="opt"><h3>B · Only the rows are filtered, tiles stay school-wide</h3>
  <ul><li>Tiles keep showing 2 / 2 / 4 / 2 / 1 (everyone at the school); only the rows below shrink.</li><li>Pro: you never lose the school-wide picture. Con: "Booked 4" but 2 rows under it when you press Booked — the confusion v0.610 removed.</li></ul>
  <div class="pics">${fig(c2, 'B · PC: tiles unchanged, rows filtered', 800)}</div></div>
</div>

<h2>Question 3 — does the filter stay after you leave the page?</h2>
<div class="opts">
 <div class="opt"><h3>A · It resets <span class="rec">Recommended</span></h3><ul><li>The picked forms stay while you switch between Prospects ↔ Forms, open a profile, or change the school (picks that don't exist at the other school drop out). A reload, sign-in or lock starts on "All forms".</li><li>Pro: nobody, especially at the shared front-desk computer, starts the day looking at half the prospects and wonders where a family went. Con: you pick again each visit.</li></ul></div>
 <div class="opt"><h3>B · It is remembered per person (like List / Board)</h3><ul><li>Saved in this browser for your account, so the next visit opens on the same forms; the blue button and the "Showing … only" line still show it is on.</li><li>Pro: if you always look at Visitor Information, it is already there. Con: on a shared computer the next person sees it too, and a new sign-up from another form can sit unseen (the rail badge counts every form, so it says 3 new while the list shows none).</li></ul></div>
</div>

<h2>Settled without asking (shout if you disagree)</h2>
<ul style="max-width:980px">
<li><b>No database change needed.</b> The list already comes with each prospect's family id, and the app is already allowed to read which form each sign-up belongs to (the Forms page counts sign-ups this way). So the filter is built in the app alone — no migration, no SQL for you to paste.</li>
<li><b>No "no form" group.</b> Every prospect comes from a form: even "+ Add prospect" at the desk fills in one of your forms, and a form with sign-ups cannot be deleted. A prospect added at the desk shows under the form that was used.</li>
<li><b>The rail badge</b> keeps counting new sign-ups from every form, whatever the filter says.</li>
<li><b>Phone:</b> the bottom bar keeps Prospects; "Forms" disappears from the More menu because it is now a tab inside Prospects. Staff still see the Forms tab view-only; admins edit, as today.</li>
</ul>
</div>`;
    const cut = html.indexOf('<h2>Question 2');
    const headHtml = html.slice(0, html.indexOf('<div class="wrap">'));
    await sheet(tab, 'Merge-Questions-1', html.slice(0, cut) + '</div>', 1700);
    await sheet(tab, 'Merge-Questions-2', headHtml + '<div class="wrap"><h1>Prospects + Forms in one section — questions (continued)</h1>' + html.slice(cut), 1700);
    console.log('wrote Merge-Questions');
  }
});
