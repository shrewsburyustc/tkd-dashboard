// D-roster-boards-gen.mjs — writes, builds, shoots and composes ONE review picture: the Board breaking roster with
// the Technical boards and the Adult boards drawn as two separate things (no code change in the app).
// Why: Jeffrey (2026-11-14): "clearly separate technical boards and adult boards so it is easier to see when it is
// event day. Show me the change before building." On event day the two kinds of board are different boards stacked at
// the stations, so staff must see at a glance how many of EACH a student breaks, and how many of each a class and the
// whole event need. Everything not new is copied from what the app draws today (rows, class tabs, count cards, Find a
// student, belt pictures, Paying by, Payment tag, Broke box, Mark paid, the ⋯ button, Registration link, the amber
// Square notice): the shell and header come from B-staff.src.html (the approved roster picture), the class tabs, count
// cards and class line were copied from the running preview (src/screens/breaking/EventPage.jsx), the belt pictures
// from the app's own Belt drawing (D-roster-boards-belts.json). The few NEW parts carry "NEW" comments below and an
// amber outline in the picture (?marks); when built they go into src/styles/breaking-roster.css.
//
// Run from the repo's top folder:  node "docs/Board Breaking/Mockups/D-roster-boards-gen.mjs"
// It writes D-roster-boards.src.html, builds D-roster-boards.html (self-contained), shoots D-roster-boards-shots/ at
// PC 1280×800, tablet 820×1180 touch, phone 390×844 touch and small phone 320×640 touch, and composes
// D-roster-boards.png (+ .sheet.json / .sheet.html). Cutting the PNG into pages under 7500 px is a separate step (see the end).
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..', '..');
const tools = join(repo, 'docs', 'Dashboard Core', 'tools');
const read = (p) => readFileSync(p, 'utf8');

const I = (name, size = 16) => `<i data-icon="${name}"${size !== 16 ? ` data-size="${size}"` : ''}></i>`;
const dot = '·';

// ---------- pieces copied from the approved roster picture (B-staff.src.html) ----------
const bstaff = read(join(here, 'B-staff.src.html'));
const frameStart = bstaff.indexOf('data-state="roster"');
const frame = bstaff.slice(bstaff.lastIndexOf('<div class="mock-frame"', frameStart), bstaff.indexOf('data-state="rowmenu"'));
const afterOpen = frame.indexOf('<div class="mock-app">');
// shell (rail, top bars, <main>) up to the page header; the page content goes inside .testing.brk > .brk-ev, as in the app
const shellTop = frame.slice(afterOpen, frame.indexOf('<div class="phead ev-phead">')).replace('<div class="testing brk">', '<div class="testing brk"><div class="brk-ev">');
const headerAndSquare = frame.slice(frame.indexOf('<div class="phead ev-phead">'), frame.indexOf('<div class="ev-cards">'))
  .replace('Fri, Nov 20, 2026', 'Sat, Nov 21, 2026').replace('10 registered', '13 registered');
const shellBottom = '</div>' + frame.slice(frame.indexOf('</main>')); // the extra </div> closes .brk-ev

// ---------- belt pictures (Belt.jsx's drawing, copied from the running app); unique ids per use ----------
const belts = JSON.parse(read(join(here, 'D-roster-boards-belts.json')));
let beltN = 0;
function beltSvg(rank) {
  const n = beltN++;
  return belts[rank].replace(/id="_r_[a-z0-9]+_"/g, `id="bx${n}"`).replace(/url\(#_r_[a-z0-9]+_\)/g, `url(#bx${n})`);
}

// ---------- the sample class (fake names only) ----------
const ROWS = [
  { n: 'Ava Reed', age: 8, rank: 'Orange belt', t: 3, a: 0, by: 'Cash', amt: '$9', tag: 'paid', broke: true },
  { n: 'Cara Lin', age: 15, rank: 'Purple belt', t: 0, a: 3, by: 'Card', amt: '$12.75', tag: 'paid', broke: false },
  { n: 'Noah Kim', age: 14, rank: 'High Blue belt', t: 1, a: 3, by: 'Cash', amt: '$15', tag: 'unpaid', broke: false },
  { n: 'Gia Chen', age: 16, rank: 'Bo-Dan / Deputy', t: 2, a: 3, by: 'Check', amt: '$18', tag: 'paid', broke: true },
  { n: 'Leo Brooks', age: 17, rank: '1st Dan', t: 4, a: 3, by: 'Cash', amt: '$24', tag: 'unpaid', broke: false, sameDay: true },
  { n: 'Eli Park', age: 11, rank: 'Blue belt', t: 4, a: 0, by: 'Card', amt: '$13', tag: 'awaiting', broke: false },
];
const sum = (key, rows = ROWS) => rows.reduce((s, r) => s + r[key], 0);
const TECH = sum('t'); // 14
const ADULT = sum('a'); // 12
const BROKE = ROWS.filter((r) => r.broke).length; // 2
const EVENT_TECH = 31; // the whole event (the other four classes hold 17 Technical and 7 Adult)
const EVENT_ADULT = ADULT + 7;

const tagHtml = (tag) => (tag === 'paid' ? '<span class="ttag ttag--ok">Paid</span>' : tag === 'awaiting' ? '<span class="ttag ttag--warn">Awaiting card payment</span>' : '<span class="ttag">Not paid</span>');
const brokeBtn = (r, small = false) => (r.broke
  ? `<button type="button" class="cp-dc cp-dc--came" aria-label="Undo broke for ${r.n}"><span class="cp-dc-val">${I('check', 14)}Broke</span></button>`
  : `<button type="button" class="cp-dc cp-dc--checkin" aria-label="Mark ${r.n} broke"><span class="cp-dc-val">Broke</span></button>`);
const markPaid = (r) => (r.tag === 'paid' ? '' : `<button type="button" class="btn btn-sm ev-markpaid" aria-label="Mark paid for ${r.n}">${I('check')}Mark paid</button>`);
const more = (r) => `<button type="button" class="tib" aria-label="More actions for ${r.n}"><span class="tib-box">${I('dots')}</span><span class="tib-tip" aria-hidden="true">More actions for ${r.n}</span></button>`;
const nameLine = (r) => `<span class="ev-sname">${r.n}</span><span class="ev-ssub brk-rank"><span>${r.age} ${dot}</span>${beltSvg(r.rank)}<span>${r.rank}</span></span>`;
const sameDayTag = (r) => (r.sameDay ? '<span class="ttag">Same day</span>' : '');

// NEW: one board cell. A zero is a quiet gray dash; the number is what the eye finds from a step away.
const cell = (kind, n) => `<span class="ev-scell brk-bcell brk-bcell--${kind}" role="cell" data-mg="cols"><b class="${n === 0 ? 'brk-zero' : 'brk-num'}" aria-label="${n} ${kind === 'tech' ? 'Technical' : 'Adult'} boards">${n === 0 ? '–' : n}</b></span>`;
// NEW: one phone chip pair, on its own line
const chip = (kind, n) => `<span class="brk-chip brk-chip--${kind}"><span class="brk-chip-label">${kind === 'tech' ? 'Technical' : 'Adult'}</span><b class="${n === 0 ? 'brk-zero' : 'brk-num'}" aria-label="${n}">${n === 0 ? '–' : n}</b></span>`;

// A row on PC and tablet
const wideRow = (r) => `<div class="ev-srow brk-srow${r.broke ? ' is-broke' : ''}" role="row" aria-label="${r.n}"><span class="ev-scell ev-sname-line" role="cell">${nameLine(r)}${sameDayTag(r)}</span>${cell('tech', r.t)}${cell('adult', r.a)}<span class="ev-scell brk-payby-col" role="cell">${r.by}<span class="brk-sub">${r.amt}</span></span><span class="ev-scell" role="cell">${tagHtml(r.tag)}<span class="brk-sub brk-payby-inline">${r.by} ${dot} ${r.amt}</span></span><span class="ev-scell" role="cell">${brokeBtn(r)}</span><span class="acts" role="cell">${markPaid(r)}${more(r)}</span></div>`;
const wideHead = `<div class="ev-srow ev-shead brk-srow" role="row"><span role="columnheader">Student</span><span role="columnheader" class="brk-bcell brk-bcell--tech brk-bhead" data-mg="cols">Technical</span><span role="columnheader" class="brk-bcell brk-bcell--adult brk-bhead" data-mg="cols">Adult</span><span role="columnheader" class="brk-payby-col">Paying by</span><span role="columnheader">Payment</span><span role="columnheader">Broke</span><span role="columnheader" aria-label="Actions"></span></div>`;
// A card on a phone
const phoneRow = (r) => `<div class="ev-srow is-phone brk-prow${r.broke ? ' is-broke' : ''}" role="row" aria-label="${r.n}"><span class="ev-srow-main" role="cell"><span class="ev-sname-line">${nameLine(r)}</span><span class="ev-sline brk-chips" data-mark>${chip('tech', r.t)}${chip('adult', r.a)}</span><span class="ev-sline l2">${r.by} ${dot} ${r.amt}${r.sameDay ? ' ' : ''}${sameDayTag(r)}</span><span class="ev-sline ev-sline-tag">${tagHtml(r.tag)}${markPaid(r)}${brokeBtn(r)}</span></span><span class="acts" role="cell">${more(r)}</span></div>`;

// ---------- "today" rows, only for the before / after picture: the single Boards cell, exactly as built ----------
const oldText = (r) => `${r.t} Technical ${dot} ${r.a} Adult`;
const oldWideRow = (r) => `<div class="ev-srow brk-srow" role="row" aria-label="${r.n}"><span class="ev-scell ev-sname-line" role="cell">${nameLine(r)}${sameDayTag(r)}<span class="brk-boards-inline ev-ssub">${oldText(r)}</span></span><span class="ev-scell brk-boards" role="cell">${oldText(r)}</span><span class="ev-scell" role="cell">${r.by}<span class="brk-sub">${r.amt}</span></span><span class="ev-scell" role="cell">${tagHtml(r.tag)}</span><span class="ev-scell" role="cell">${brokeBtn(r)}</span><span class="acts" role="cell">${markPaid(r)}${more(r)}</span></div>`;
const oldWideHead = '<div class="ev-srow ev-shead brk-srow" role="row"><span role="columnheader">Student</span><span role="columnheader" class="brk-boards">Boards</span><span role="columnheader">Paying by</span><span role="columnheader">Payment</span><span role="columnheader">Broke</span><span role="columnheader" aria-label="Actions"></span></div>';
const oldPhoneRow = (r) => `<div class="ev-srow is-phone" role="row" aria-label="${r.n}"><span class="ev-srow-main" role="cell"><span class="ev-sname-line">${nameLine(r)}</span><span class="ev-sline">${oldText(r)}</span><span class="ev-sline l2">${r.by} ${dot} ${r.amt}${r.sameDay ? ' ' : ''}${sameDayTag(r)}</span><span class="ev-sline ev-sline-tag">${tagHtml(r.tag)}${markPaid(r)}${brokeBtn(r)}</span></span><span class="acts" role="cell">${more(r)}</span></div>`;

const wideTable = (head, rows, extra = '') => `<div class="clist ev-roster brk-roster mk-wide${extra}" role="table" aria-label="Students by class time">${head}<div role="rowgroup">${rows.join('')}</div></div>`;
const phoneTable = (rows, extra = '') => `<div class="clist ev-roster brk-roster is-phone is-touch mk-phone${extra}" role="table" aria-label="Students by class time"><div role="rowgroup">${rows.join('')}</div></div>`;

// ---------- the count cards: the four that exist today + NEW Technical boards and Adult boards ----------
const card = (icon, label, value, note, button = true, extra = '') => (button
  ? `<button type="button" class="ev-card ev-card--button"${label === 'Registered' ? '' : ' aria-pressed="false"'}><span class="ev-card-label">${I(icon)}${label}</span><span class="ev-card-value">${value}</span></button>`
  : `<div class="ev-card${extra}"><span class="ev-card-label">${I(icon)}${label}</span><span class="ev-card-value">${value}</span>${note ? `<span class="ev-card-note">${note}</span>` : ''}</div>`);
const cards = `<div class="ev-cards">${card('users', 'Registered', 13)}${card('check', 'Paid', 8)}${card('hammer', 'Broke', BROKE + 1)}${card('sum', 'Collected', '$97', 'of $187.75 due', false)}`
  + `<div class="ev-card brk-boardcard brk-boardcard--tech" data-mg="cards"><span class="ev-card-label">${I('stack-2')}Technical boards</span><span class="ev-card-value">${TECH}</span><span class="ev-card-note">whole event: ${EVENT_TECH}</span></div>`
  + `<div class="ev-card brk-boardcard brk-boardcard--adult" data-mg="cards"><span class="ev-card-label">${I('stack-3')}Adult boards</span><span class="ev-card-value">${ADULT}</span><span class="ev-card-note">whole event: ${EVENT_ADULT}</span></div></div>`;

const search = `<div class="cp-search"><i data-icon="search" class="cp-search-icon"></i><input class="input cp-search-input" placeholder="Find a student" aria-label="Find a student" autocomplete="off" type="search"></div>`;
const tab = (name, n, on) => `<button type="button" role="radio" aria-checked="${on}" aria-label="${name} ${n}" class="segment${on ? ' is-checked' : ''}"><span class="ev-cs-name">${name}</span><span class="ev-cs-count">${n}</span></button>`;
const classSwitch = `<div class="ev-class-switch"><div class="segmented ev-segmented" role="radiogroup" aria-label="Class">${tab('Group D', 2, false)}${tab('White / Little Tiger', 2, false)}${tab('Group A', 6, true)}${tab('Group B+C', 0, false)}${tab('Teen / Adult', 3, false)}</div></div>`;
const classLine = `<p class="ev-classline"><strong>Group A ${dot} 6:00 – 6:40 PM</strong><span>6 registered ${dot} ${BROKE} broke</span></p>`
  // NEW: the second, small line under it
  + `<p class="ev-classline brk-boardsline" data-mark><span><b>${TECH}</b> Technical ${dot} <b>${ADULT}</b> Adult boards for this class</span></p>`;

// ---------- state 1: the whole page ----------
const caption1 = `<b>Event roster, class tab Group A.</b> <b>1.</b> The single <i>Boards</i> cell ("3 Technical ${dot} 0 Adult") becomes two columns, <b>Technical</b> and <b>Adult</b> (PC and tablet): just the number, 16px semibold; a zero is a quiet gray dash; Technical sits on the app's blue tint, Adult on the neutral gray, with column headers and a thin line on each side, so it never rests on colour alone. On phones the row gets two labelled chips side by side on their own line. <b>2.</b> Two more count cards, <b>Technical boards</b> and <b>Adult boards</b>, count the SELECTED class tab (14 and 12) and say the whole event under the number (31 and 19). <b>3.</b> A small second line under the class line adds up the same class. <b>Tablet only:</b> the two new columns need the room, so "Cash · $9" (Paying by) moves under the Payment tag, as today's Boards line already moves under the name there; the long tag may wrap to two lines. Ava and Gia are marked Broke: their numbers stay but go gray and light (not bold), the green Broke box is unchanged. Nothing else changed: tabs, Find a student, belt pictures, Paying by, Payment tag, Broke, Mark paid, ⋯, Registration link and the amber Square notice are the built ones.`;
const state1 = `<div class="mock-frame" data-state="roster" data-caption="${caption1.replace(/"/g, '&quot;')}">${shellTop}${headerAndSquare}${cards}${search}${classSwitch}${classLine}${wideTable(wideHead, ROWS.map(wideRow))}${phoneTable(ROWS.map(phoneRow))}${shellBottom}`;

// ---------- state 2: before / after for two rows (one Broke) ----------
const pair = [ROWS[4], ROWS[3]]; // Leo (4 Technical + 3 Adult), Gia (broke, dimmed)
const label = (text, extra = '') => `<p class="mk-label${extra}">${text}</p>`;
const caption2 = `<b>Before and after, two rows.</b> Today (top): one "Boards" cell with a sentence, "4 Technical ${dot} 3 Adult" (tablet and phone: the same sentence under the name). New (bottom): two numbers in two columns (PC, tablet) or two chips (phones). Leo Brooks is not Broke yet (numbers bold, dark); Gia Chen is Broke (numbers stay, gray and light, so the boards still to set out stand out).`;
const state2 = `<div class="mock-frame mk-plain" data-state="rowstates" data-caption="${caption2.replace(/"/g, '&quot;')}"><div class="testing brk"><div class="brk-ev">`
  + `<div class="brk-old">${label('Today')}${wideTable(oldWideHead, pair.map(oldWideRow))}${phoneTable(pair.map(oldPhoneRow))}</div>`
  + `<div class="brk-new">${label('New', ' mk-label--new')}${wideTable(wideHead, pair.map(wideRow))}${phoneTable(pair.map(phoneRow))}</div>`
  + `</div></div></div>`;

// ---------- the page ----------
const style = `
  html { scrollbar-width: none; }
  body { margin: 0; background: #fff; }
  /* Frames (copied from B-staff.src.html) */
  .mock-frame { position: relative; transform: translateZ(0); overflow: hidden; margin: 0 0 24px; background: var(--color-bg); outline: 1px solid var(--color-border); }
  .mock-app { min-height: 100%; display: flex; flex-direction: column; }
  .mock-app .shell { flex: 1 0 auto; min-height: 0; }
  .mock-app .shell-content { flex: none; overflow: visible; }
  .mock-frame.mk-plain { padding: var(--space-16) var(--space-16) var(--space-4); }
  .mock-frame.mk-plain .testing { padding: 0; }
  .topbar-phone { display: none; }
  .mk-phone { display: none; }
  @media (max-width: 639.98px) {
    .topbar-pc { display: none; }
    .topbar-phone { display: flex; }
    .mk-wide { display: none !important; }
    .mk-phone { display: block; }
  }
  .mk-label { margin: 0 0 var(--space-8); font-size: var(--text-13); font-weight: 600; }
  .brk-new { margin-top: var(--space-16); }
  .mk-label--new { color: var(--color-blue); }

  /* ===== NEW (these go into src/styles/breaking-roster.css when built; tokens only) ===== */

  /* The count strip: six cards on a PC (one row), three by two on a tablet, two by three on a phone (like today's wrap) */
  .brk-ev .ev-cards { grid-template-columns: repeat(6, minmax(0, 1fr)); }
  @media (min-width: 640px) and (max-width: 1023.98px) { .brk-ev .ev-cards { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  @media (max-width: 639.98px) { .brk-ev .ev-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  /* Technical = the app's blue tint, Adult = the neutral gray the other cards already have; the label says which. */
  .brk-ev .brk-boardcard--tech { background: var(--color-blue-tint); }
  .brk-ev .brk-boardcard--tech .ev-card-label,
  .brk-ev .brk-boardcard--tech .ev-card-note { color: var(--color-text); }  /* the gray label is only 4.4:1 on the tint */
  .brk-ev .brk-boardcard .ev-card-value { font-weight: 600; }

  /* The second class line */
  .brk-ev .brk-boardsline { margin-top: calc(-1 * var(--space-4)); margin-bottom: var(--space-16); color: var(--color-text-secondary); font-size: var(--text-13); }
  .brk-ev .brk-boardsline b { color: var(--color-text); font-weight: 600; }

  /* PC: Student . Technical . Adult . Paying by . Payment . Broke . actions (was: ... Boards ...) */
  .brk-ev .brk-srow { grid-template-columns: minmax(0, 1.5fr) 84px 84px 84px 176px 92px 152px; }
  .brk-ev .brk-old .brk-srow { grid-template-columns: minmax(0, 1.5fr) minmax(0, 1.1fr) 84px 176px 92px 152px; }
  /* the two board cells: one tinted column each, full row height, a thin line on the outer sides */
  .brk-ev .brk-bcell { display: flex; align-items: center; justify-content: center; align-self: stretch; margin: calc(-1 * var(--space-4)) 0; font-size: var(--text-16); font-variant-numeric: tabular-nums; }
  .brk-ev .brk-bcell--tech { background: var(--color-blue-tint); border-left: 1px solid var(--color-border-strong); }
  .brk-ev .brk-bcell--adult { background: var(--color-surface); border-right: 1px solid var(--color-border-strong); }
  .brk-ev .brk-num { font-weight: 600; }
  .brk-ev .brk-zero { color: var(--color-text-secondary); font-weight: 400; }
  .brk-ev .brk-payby-inline { display: none; }
  .brk-ev .brk-bhead { font-size: var(--text-12); font-weight: 600; color: var(--color-text); }
  .brk-ev .ev-shead .brk-bcell--adult { background: var(--color-border); }
  /* Broke: the numbers stay, but gray and light */
  .brk-ev .is-broke .brk-bcell .brk-num { color: var(--color-text-secondary); font-weight: 400; }

  /* Phone: two labelled chips side by side on their own line */
  .brk-ev .brk-chips { display: flex; gap: var(--space-8); margin: var(--space-4) 0; }
  .brk-ev .brk-chip { flex: 1 1 0; min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: var(--space-8); padding: var(--space-4) var(--space-8); min-height: 32px; border: 1px solid var(--color-border-strong); border-radius: var(--radius-tag); font-size: var(--text-13); color: var(--color-text); }
  .brk-ev .brk-chip--tech { background: var(--color-blue-tint); }
  .brk-ev .brk-chip--adult { background: var(--color-surface); }
  .brk-ev .brk-chip .brk-num, .brk-ev .brk-chip .brk-zero { font-size: var(--text-16); }
  .brk-ev .is-broke .brk-chip .brk-num { color: var(--color-text-secondary); font-weight: 400; }

  /* Tablet: the same two columns, narrower; everything else keeps its width as built */
  @media (min-width: 640px) and (max-width: 1023.98px) {
    /* a tablet has no room for a separate Paying by column: "Cash . $9" goes under the Payment tag (the same trick today's Boards line uses) */
    .brk-ev .brk-srow { grid-template-columns: minmax(0, 1fr) 56px 56px 130px 72px 148px; column-gap: var(--space-8); }
    .brk-ev .brk-payby-col { display: none; }
    .brk-ev .brk-payby-inline { display: block; }
    .brk-ev .brk-srow .ttag { white-space: normal; }
    .brk-ev .brk-old .brk-srow { grid-template-columns: minmax(0, 1.6fr) 76px 150px 76px 152px; }
    .brk-ev .brk-old .brk-boards { display: none; }
    .brk-ev .brk-old .brk-boards-inline { display: block; }
    .brk-ev .brk-bhead { font-size: var(--text-12); }
  }
  @media (pointer: coarse) { button.cp-dc { min-height: 28px; } button.cp-dc::after { content: ''; position: absolute; inset: -8px 0; } }

  /* ===== Amber marks (?marks): what is new in this picture ===== */
  .mark-box { position: absolute; z-index: 20; pointer-events: none; outline: 3px solid #f59e0b; outline-offset: 2px; border-radius: 8px; }
  .marks [data-mark] { outline: 3px solid #f59e0b; outline-offset: 3px; border-radius: 8px; }
`;

const marksScript = `<script>
if (location.search.includes('marks')) {
  document.documentElement.classList.add('marks');
  // one amber box around each group (the board columns, the two new cards): the union of its visible parts
  addEventListener('load', () => setTimeout(() => {
    for (const frame of document.querySelectorAll('.mock-frame')) {
      const fr = frame.getBoundingClientRect();
      const groups = {};
      for (const el of frame.querySelectorAll('[data-mg]')) {
        if (!el.getClientRects().length) continue;
        (groups[el.dataset.mg] ??= []).push(el.getBoundingClientRect());
      }
      for (const rects of Object.values(groups)) {
        const left = Math.min(...rects.map((r) => r.left)), right = Math.max(...rects.map((r) => r.right));
        const top = Math.min(...rects.map((r) => r.top)), bottom = Math.max(...rects.map((r) => r.bottom));
        const box = document.createElement('div');
        box.className = 'mark-box';
        box.style.cssText = 'left:' + (left - fr.left) + 'px;top:' + (top - fr.top) + 'px;width:' + (right - left) + 'px;height:' + (bottom - top) + 'px';
        frame.appendChild(box);
      }
    }
  }, 150));
}
</script>`;

const src = `<!doctype html>
<!--
  D-roster-boards.src.html — mockup source: Board breaking roster with Technical and Adult boards separated.
  Written by D-roster-boards-gen.mjs; build with docs/Dashboard Core/tools/build-mockup.mjs. Fake names only.
-->
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Board breaking roster, boards separated - mockup</title>
<!-- css: src/styles/tokens.css src/styles/app.css src/styles/shared.css src/styles/testing.css src/styles/testing-events.css src/styles/camps.css src/styles/people-search.css src/styles/rail-menu.css src/components/DatePicker.css src/styles/breaking-roster.css -->
<style>${style}</style>
${marksScript}
</head><body>
${state1}
${state2}
</body></html>
`;

const out = (name) => join(here, name);
writeFileSync(out('D-roster-boards.src.html'), src);

writeFileSync(out('D-roster-boards.sheet.json'), JSON.stringify({
  shots: 'D-roster-boards-shots',
  title: 'Board breaking · Roster: Technical boards and Adult boards separated (for your OK, nothing built yet)',
  subtitle: 'The roster exactly as built today, with only what is new outlined in <b style="color:#b45309">amber</b>. Why: on event day the Technical boards and the Adult boards are different boards stacked at the stations, so staff need the two numbers apart, per student, per class and for the whole event. Fake names and numbers.',
  states: ['roster', 'rowstates'],
  pcOwnLine: ['roster', 'rowstates'],
  out: 'D-roster-boards',
  footer: '<b>What stays the same:</b> the class tabs (Color belt testing style), Find a student, the belt pictures, Paying by with the amount, the Payment tag, the Broke box, Mark paid, the ⋯ menu, Registration link, the amber Square notice, the Registration Open / Closed switch. <b>What would change if you say yes:</b> the one "Boards" cell becomes two columns / two chips; two count cards and one small class line are added. No database change: the two numbers are already stored per student.',
}, null, 2));

const run = (file, args) => {
  const r = spawnSync(process.execPath, [file, ...args], { stdio: 'inherit', cwd: repo });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
run(join(tools, 'build-mockup.mjs'), [out('D-roster-boards.src.html'), out('D-roster-boards.html')]);
run(out('C-admin-shoot.mjs'), [out('D-roster-boards.html'), out('D-roster-boards-shots'), 'marks']);
run(join(tools, 'compose-sheet.mjs'), [out('D-roster-boards.sheet.json')]);
