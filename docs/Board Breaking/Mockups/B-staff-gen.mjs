// B-staff-gen.mjs — writes, builds, shoots and composes the Board breaking STAFF pictures.
// Why: CLAUDE.md asks for one combined picture per page group (PC / tablet / phone / small phone), drawn with
// the app's REAL stylesheets and icons, and shown before anything is built. The three screens share the same
// shell, rows and dialog markup, so one small generator writes the one source page (B-staff.src.html) from
// small pieces instead of repeating them by hand. Everything here copies markup the app already draws today
// (Color Belt's Events tab and event page, Camps' Find a camper and check-in box, the shared Mark paid box,
// the shared dialog frame); the few NEW parts carry a "NEW" comment in the style block below.
//
// Run from the repo's top folder:  node "docs/Board Breaking/Mockups/B-staff-gen.mjs"
// It writes B-staff.src.html, builds B-staff.html (self-contained), shoots B-staff-shots/, and composes
//   B-staff-events.png  B-staff-roster.png  B-staff-dialogs.png  (with their .sheet.json / .sheet.html).
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..', '..');
const tools = join(repo, 'docs', 'Dashboard Core', 'tools');

// ---------- small helpers ----------
const I = (name, size = 16, cls = '') => `<i data-icon="${name}"${size !== 16 ? ` data-size="${size}"` : ''}${cls ? ` class="${cls}"` : ''}></i>`;
const cap = (html) => html.replace(/"/g, '&quot;');
const tib = (label, icon, extra = '') => `<button type="button" class="tib" aria-label="${label}"${extra}><span class="tib-box">${I(icon)}</span><span class="tib-tip" aria-hidden="true">${label}</span></button>`;
const moneyHtml = (s) => s;

// ---------- the shell (copied from the app's signed-in frame; Testing is the current rail item) ----------
const RAIL_ITEMS = [
  ['Home', 'home'], ['Testing', 'certificate'], ['Camps', 'tent'], ['Schedule', 'clock'], ['Calendar', 'calendar-month'],
  ['Forms', 'clipboard-text'], ['Prospects', 'address-book'], ['Finance', 'report-money'],
];
const rail = `<nav class="rail rail--standard" aria-label="Sections">${RAIL_ITEMS.map(([label, icon]) => {
  const cur = label === 'Testing';
  const btn = `<button type="button" class="rail-item${cur ? ' is-current has-menu' : ''}" aria-label="${label}"${cur ? ' aria-current="page"' : ''}><span class="rail-icon">${I(icon, 20)}</span><span class="rail-label" aria-hidden="true">${label}</span></button>`;
  return cur ? `<div class="rail-menu-wrap">${btn}</div>` : btn;
}).join('')}</nav>`;
const loc = `<div class="loc" role="radiogroup" aria-label="Location"><button type="button" role="radio" aria-checked="false" class="loc-option">Worcester</button><button type="button" role="radio" aria-checked="true" class="loc-option is-active">${I('map-pin')}Shrewsbury</button><button type="button" role="radio" aria-checked="false" class="loc-option">Both</button></div>`;
const avatar = `<button type="button" class="avatar-button" aria-label="Account menu"><span class="avatar" aria-hidden="true">JB</span></button>`;
const topbars = `<header class="topbar topbar-pc"><div class="ps"><div class="ps-field">${I('search')}<input class="ps-input" aria-label="Search people" placeholder="Search people" type="search"><kbd class="ps-key" aria-hidden="true">/</kbd></div></div><div class="topbar-spacer"></div>${loc}${avatar}</header>
<header class="topbar topbar-phone"><div class="topbar-spacer"></div><button type="button" class="icon-button ps-open" aria-label="Search people">${I('search')}</button>${loc}${avatar}</header>`;
const bottombar = `<nav class="bottombar" aria-label="Sections">${[['Home', 'home'], ['Calendar', 'calendar-month'], ['Prospects', 'address-book']].map(([l, i]) => `<button type="button" class="bottombar-item"><span class="bottombar-icon">${I(i, 20)}</span><span>${l}</span></button>`).join('')}<button type="button" class="bottombar-item is-current" aria-current="page"><span class="bottombar-icon">${I('menu-2', 20)}</span><span>More</span></button></nav>`;
const shell = (main, { extra = '' } = {}) => `<div class="mock-app"><div class="shell">${rail}<div class="shell-main">${topbars}<main class="shell-content"><div class="testing brk">${main}</div></main>${bottombar}</div></div>${extra}</div>`;

// ---------- the Events page ----------
const events = {
  upcoming: [
    { name: 'November Board Breaking', date: 'Fri, Nov 20, 2026', reg: 10, paid: 5, open: true },
    { name: 'December Board Breaking', date: 'Fri, Dec 18, 2026', reg: 0, paid: 0, open: false },
  ],
  past: [
    { name: 'October Board Breaking', date: 'Fri, Oct 23, 2026', reg: 31, paid: 31, open: false },
    { name: 'September Board Breaking', date: 'Fri, Sep 18, 2026', reg: 27, paid: 27, open: false },
  ],
};
const regTag = (e) => (e.open ? '<span class="ttag ttag--ok">Registration open</span>' : '<span class="ttag">Registration closed</span>');
function eventRowsWide(list) {
  return list.map((e) => `<div class="ev-row brk-erow" role="row"><span class="ev-name" role="cell">${e.name}</span><span role="cell" class="nowrap">${e.date}</span><span role="cell">Shrewsbury</span><span role="cell">${e.reg} registered · ${e.paid} paid</span><span role="cell">${regTag(e)}</span><span class="acts" role="cell">${tib('Edit ' + e.name, 'edit')}${tib('More actions for ' + e.name, 'dots')}</span></div>`).join('');
}
function eventRowsPhone(list) {
  return list.map((e) => `<div class="ev-row is-phone" role="row"><span class="ev-phone-main" role="cell"><span class="ev-name">${e.name}</span><span class="l2">${e.date} · Shrewsbury</span><span class="l2">${e.reg} registered · ${e.paid} paid</span><span class="ev-phone-tag">${regTag(e)}</span></span><span class="acts" role="cell">${tib('More actions for ' + e.name, 'dots')}</span></div>`).join('');
}
const eventsHead = `<div class="phead"><div class="phead-titles"><button type="button" class="link-button back-link" aria-label="Back to Testing">${I('arrow-left')}Testing</button><h1 class="ptitle">Board breaking</h1><p class="psub">Shrewsbury</p></div><button type="button" class="btn btn-primary">${I('plus')}Add event</button></div>
<div class="ttabs" role="tablist" aria-label="Board breaking"><button type="button" class="ttab is-current" role="tab" aria-selected="true">Events</button><button type="button" class="ttab" role="tab" aria-selected="false">Chart and prices</button></div>`;
const sideSwitch = (side) => `<div class="ev-side"><div class="segmented ev-segmented" role="radiogroup"><button type="button" role="radio" aria-checked="${side === 'up'}" class="segment${side === 'up' ? ' is-checked' : ''}">Upcoming<span class="ev-side-count">${events.upcoming.length}</span></button><button type="button" role="radio" aria-checked="${side === 'past'}" class="segment${side === 'past' ? ' is-checked' : ''}">Past<span class="ev-side-count">${events.past.length}</span></button></div></div>`;
const eventsHeader = `<div class="ev-row ev-head" role="row"><span class="ev-th" role="columnheader"><button type="button" class="ev-sort">Event</button></span><span class="ev-th" role="columnheader"><button type="button" class="ev-sort">Date</button></span><span class="ev-th" role="columnheader"><button type="button" class="ev-sort">School</button></span><span class="ev-th" role="columnheader"><button type="button" class="ev-sort">Registered</button></span><span class="ev-th" role="columnheader"><button type="button" class="ev-sort">Registration</button></span><span class="ev-th" role="columnheader" aria-label="Actions"></span></div>`;
function eventsPage(side) {
  const list = side === 'up' ? events.upcoming : events.past;
  return `${eventsHead}<div role="tabpanel" class="tpanel">${sideSwitch(side)}
<div class="clist ev-list has-edit mk-wide" role="table" aria-label="${side === 'up' ? 'Upcoming' : 'Past'}">${eventsHeader}<div role="rowgroup">${eventRowsWide(list)}</div></div>
<div class="clist ev-list is-touch mk-phone" role="table" aria-label="${side === 'up' ? 'Upcoming' : 'Past'}"><div role="rowgroup">${eventRowsPhone(list)}</div></div>
<p class="viewonly">Staff see this list and open an event to run the day. Admins add, edit and delete events.</p></div>`;
}
const eventsEmpty = `${eventsHead}<div role="tabpanel" class="tpanel"><p class="tempty ev-empty">No board breaking events yet. Add the first one.</p></div>`;

// ---------- the roster ----------
const classes = [
  { name: 'Group D', time: '4:20 – 5:00 PM' },
  { name: 'White / Little Tiger', time: '5:10 – 5:50 PM' },
  { name: 'Group A', time: '6:00 – 6:40 PM' },
  { name: 'Teen / Adult', time: '7:40 – 8:20 PM' },
];
// pay: 'paid' | 'unpaid' | 'await' (card, waiting for Square)
const students = [
  { c: 0, n: 'Ava Reed', age: 8, rank: 'Orange belt', t: 4, a: 0, by: 'Cash', amt: '$12', pay: 'paid', broke: true },
  { c: 0, n: 'Mia Santos', age: 9, rank: 'Green belt', t: 4, a: 0, by: 'Cash', amt: '$16', pay: 'paid', broke: true, same: true },
  { c: 0, n: 'Owen Reed', age: 8, rank: 'Yellow belt', t: 4, a: 0, by: 'Cash', amt: '$12', pay: 'unpaid' },
  { c: 1, n: 'Eli Park', age: 6, rank: 'Little Tiger Yellow', t: 3, a: 0, by: 'Card', amt: '$9.75', pay: 'await' },
  { c: 1, n: 'Ben Torres', age: 7, rank: 'White belt', t: 4, a: 0, by: 'Check', amt: '$12', pay: 'unpaid', id: 'ben' },
  { c: 2, n: 'Zoe Park', age: 10, rank: 'Red belt', t: 3, a: 1, by: 'Check', amt: '$13', pay: 'paid' },
  { c: 2, n: 'Noah Kim', age: 12, rank: 'Brown belt', t: 2, a: 2, by: 'Cash', amt: '$14', pay: 'unpaid' },
  { c: 3, n: 'Cara Lin', age: 14, rank: 'Blue belt', t: 1, a: 3, by: 'Card', amt: '$16', pay: 'paid' },
  { c: 3, n: 'Gia Chen', age: 13, rank: 'Purple belt', t: 2, a: 1, by: 'Cash', amt: '$10', pay: 'paid' },
  { c: 3, n: 'Leo Brooks', age: 16, rank: '1st Dan', t: 4, a: 3, by: 'Cash', amt: '$24', pay: 'unpaid' },
];
const boards = (s) => `${s.t} Technical · ${s.a} Adult`;
const payTag = (s) => (s.pay === 'paid' ? '<span class="ttag ttag--ok">Paid</span>' : s.pay === 'await' ? '<span class="ttag ttag--warn">Awaiting card payment</span>' : '<span class="ttag">Not paid</span>');
const sameTag = (s) => (s.same ? '<span class="ttag">Same day</span>' : '');
const markBtn = (s) => (s.pay === 'paid' ? '' : `<button type="button" class="btn btn-sm ev-markpaid"${s.id ? ` data-mark="${s.id}"` : ''} aria-label="Mark paid for ${s.n}">${I('check')}Mark paid</button>`);
const brokeBtn = (s) => (s.broke
  ? `<button type="button" class="cp-dc cp-dc--came" aria-label="Undo broke for ${s.n}"><span class="cp-dc-val">${I('check', 14)}Broke</span></button>`
  : `<button type="button" class="cp-dc cp-dc--checkin" aria-label="Mark ${s.n} broke"><span class="cp-dc-val">Broke</span></button>`);
const more = (s) => tib('More actions for ' + s.n, 'dots', s.id ? ` data-more="${s.id}"` : '');
function groupHead(ci) {
  const list = students.filter((s) => s.c === ci);
  const broke = list.filter((s) => s.broke).length;
  return `<div class="gr-subhead ev-subhead brk-subhead" role="row"><span role="cell"><strong>${classes[ci].name}</strong> · ${classes[ci].time}</span><span role="cell" class="brk-subcount">${list.length} registered · ${broke} broke</span></div>`;
}
const wideRow = (s) => `<div class="ev-srow brk-srow" role="row" aria-label="${s.n}"><span class="ev-scell ev-sname-line" role="cell"><span class="ev-sname">${s.n}</span><span class="ev-ssub">${s.age} · ${s.rank}</span>${sameTag(s)}<span class="brk-boards-inline ev-ssub">${boards(s)}</span></span><span class="ev-scell brk-boards" role="cell">${boards(s)}</span><span class="ev-scell" role="cell">${s.by}<span class="brk-sub">${s.amt}</span></span><span class="ev-scell" role="cell">${payTag(s)}</span><span class="ev-scell" role="cell">${brokeBtn(s)}</span><span class="acts" role="cell">${markBtn(s)}${more(s)}</span></div>`;
const phoneRow = (s) => `<div class="ev-srow is-phone" role="row" aria-label="${s.n}"><span class="ev-srow-main" role="cell"><span class="ev-sname-line"><span class="ev-sname">${s.n}</span><span class="ev-ssub">${s.age} · ${s.rank}</span></span><span class="ev-sline">${boards(s)}</span><span class="ev-sline l2">${s.by} · ${s.amt}${s.same ? ' ' + sameTag(s) : ''}</span><span class="ev-sline ev-sline-tag">${payTag(s)}${markBtn(s)}${brokeBtn(s)}</span></span><span class="acts" role="cell">${more(s)}</span></div>`;
const rosterHead = `<div class="ev-srow ev-shead brk-srow" role="row"><span role="columnheader">Student</span><span role="columnheader" class="brk-boards">Boards</span><span role="columnheader">Paying by</span><span role="columnheader">Payment</span><span role="columnheader">Broke</span><span role="columnheader" aria-label="Actions"></span></div>`;
const rosterGroups = (row) => [0, 1, 2, 3].map((ci) => `<div role="rowgroup">${groupHead(ci)}${students.filter((s) => s.c === ci).map(row).join('')}</div>`).join('');

const rosterHeader = `<button type="button" class="link-button back-link">${I('arrow-left')}Board breaking</button>
<div class="phead ev-phead"><div class="phead-titles"><h1 class="ptitle">November Board Breaking</h1><p class="ev-summary">Fri, Nov 20, 2026 · Shrewsbury school · 10 registered</p>
<div class="brk-regline"><span class="field-label">Registration</span><div class="segmented ev-segmented segmented--compact" role="radiogroup" aria-label="Registration"><button type="button" role="radio" aria-checked="true" class="segment is-checked">Open</button><button type="button" role="radio" aria-checked="false" class="segment">Closed</button></div></div></div>
<div class="ev-head-buttons"><button type="button" class="btn btn-primary">${I('plus')}Add student</button><button type="button" class="btn">${I('qrcode')}Registration link</button></div></div>`;
const squareNotice = `<div class="ev-dupbox dupbox" role="status">${I('alert-triangle')}<div class="ev-dupbox-lines"><div class="ev-dupbox-line dupbox-line"><strong class="dupbox-count">2 Square payments need a look</strong><span class="dupbox-sep" aria-hidden="true">·</span><span>The amount was different, or no student matched.</span><button type="button" class="btn btn-sm">Review</button></div></div></div>`;
const cards = `<div class="ev-cards">
<button type="button" class="ev-card ev-card--button"><span class="ev-card-label">${I('users')}Registered</span><span class="ev-card-value">10</span></button>
<button type="button" class="ev-card ev-card--button" aria-pressed="false"><span class="ev-card-label">${I('check')}Paid</span><span class="ev-card-value">5</span></button>
<button type="button" class="ev-card ev-card--button" aria-pressed="false"><span class="ev-card-label">${I('hammer')}Broke</span><span class="ev-card-value">2</span></button>
<div class="ev-card"><span class="ev-card-label">${I('sum')}Collected</span><span class="ev-card-value">$67</span><span class="ev-card-note">of $138.75 due</span></div></div>`;
const find = `<div class="cp-search">${I('search', 16, 'cp-search-icon')}<input class="input cp-search-input" placeholder="Find a student" aria-label="Find a student" autocomplete="off" type="search"></div>`;
const buildRoster = () => rosterHeader + `${squareNotice}${cards}${find}
<div class="clist ev-roster brk-roster mk-wide" role="table" aria-label="Students by class time">${rosterHead}${rosterGroups(wideRow)}</div>
<div class="clist ev-roster brk-roster is-phone is-touch mk-phone" role="table" aria-label="Students by class time">${rosterGroups(phoneRow)}</div>`;
const rosterMain = buildRoster();
const ben = students.find((x) => x.id === 'ben');
ben.pay = 'paid';
const rosterBenPaid = buildRoster();
ben.pay = 'unpaid';

// ---------- dialogs ----------
const field = (label, input, hint = '') => `<div class="field"><label>${label}</label>${input}${hint ? `<p class="field-hint">${hint}</p>` : ''}</div>`;
const text = (v = '', ph = '') => `<input class="input" autocomplete="off" type="text" value="${v}"${ph ? ` placeholder="${ph}"` : ''}>`;
const select = (v, empty = false) => `<div class="fa-select"><div role="combobox" class="input fa-field sel-field${empty ? ' is-empty' : ''}" aria-haspopup="listbox" aria-expanded="false"><span class="fa-value">${v}</span>${I('chevron-down', 16, 'fa-chevron')}</div></div>`;
const timeSel = (label, v) => `<span class="ev-time"><span class="visually-hidden">${label}</span>${select(v)}</span>`;
const dateField = (v) => `<button type="button" class="input dp-field" aria-haspopup="dialog"><span class="dp-value">${v}</span>${I('chevron-down')}</button>`;
const chips = (label, items, sel) => `<div class="field"><span class="field-label">${label}</span><div class="ev-chips" role="radiogroup">${items.map((x) => `<button type="button" role="radio" aria-checked="${x === sel}" class="ev-chip${x === sel ? ' is-checked' : ''}">${x}</button>`).join('')}</div></div>`;
const segmented = (label, items, sel, compact = false) => `<div class="field"><span class="field-label">${label}</span><div><div class="segmented ev-segmented${compact ? ' segmented--compact' : ''}" role="radiogroup">${items.map((x) => `<button type="button" role="radio" aria-checked="${x === sel}" class="segment${x === sel ? ' is-checked' : ''}">${x}</button>`).join('')}</div></div></div>`;
const step = (label, value) => `<div class="field"><span class="field-label">${label}</span><span class="stepper"><button type="button" class="btn stepper-btn" aria-label="One fewer ${label.toLowerCase()}"><span aria-hidden="true">−</span></button><span class="stepper-value">${value}</span><button type="button" class="btn stepper-btn" aria-label="One more ${label.toLowerCase()}"><span aria-hidden="true">+</span></button></span></div>`;
const notice = (html) => `<div class="notice" role="alert">${I('alert-triangle', 16, 'notice-icon')}<span>${html}</span></div>`;
const footerWide = (primary = 'Save') => `<div class="dialog-footer"><div class="dialog-actions"><button type="button" class="btn">Cancel</button><button type="submit" class="btn btn-primary">${I('check')}${primary}</button></div></div>`;
const footerPhone = (primary = 'Save') => `<div class="dialog-page-submit"><button type="submit" class="btn btn-primary btn-block">${I('check')}${primary}</button></div>`;

// A dialog drawn as the app draws it: a box on a dimmed page (PC and tablet), a full-screen page (phone).
// body(isPhone) gives the form's fields; size is the box's width class.
function dialogState({ id, caption, title, sub, body, primary = 'Save', size = 'medium', behind, anchorBox = '' }) {
  return `<div class="mock-frame dlg" data-state="${id}" data-caption="${cap(caption)}">
${behind}
<div class="dialog-backdrop dialog-backdrop--top mk-wide"><div class="dialog tdialog tdialog--${size}" role="dialog" aria-modal="true"><h2 class="dialog-title">${title}</h2><p class="tdialog-sub">${sub}</p><form novalidate>${body(false)}${footerWide(primary)}</form></div></div>
<div class="dialog-page tdialog-page mk-phone" role="dialog" aria-modal="true"><div class="dialog-page-head"><button type="button" class="icon-button" aria-label="Back">${I('arrow-left', 20)}</button><h2 class="dialog-page-title">${title}</h2></div><div class="dialog-page-body"><p class="tdialog-sub">${sub}</p><form novalidate>${body(true)}${footerPhone(primary)}</form></div></div>
${anchorBox}</div>`;
}

const amountLine = (big, small) => `<p class="brk-amount"><strong>${big}</strong><span>${small}</span></p>`;

const addStudentBody = () => `<div class="ev-two">${field('First name', text(''))}${field('Last name', text(''))}</div>
<div class="ev-two">${field('Age', text('9'))}${field('Rank', select('Green belt'))}</div>
${chips('Class', ['Group D · 4:20 PM', 'White / Little Tiger · 5:10 PM', 'Group A · 6:00 PM', 'Teen / Adult · 7:40 PM'], 'Group D · 4:20 PM')}
<p class="field-hint brk-hint">Group D is the recommended class for Green belt. Any class is fine.</p>
<div class="ev-two">${step('Technical boards', 4)}${step('Adult boards', 0)}</div>
<p class="field-hint brk-hint">Filled in from age 9 and Green belt (Child chart). Change them if the student breaks a different number.</p>
${segmented('Paying by', ['Cash', 'Check', 'Card'], 'Cash')}
${amountLine('Amount $16', 'Event day: +$1 per board. 4 Technical × $3 + 4 × $1 same day = $16.')}
<p class="field-hint">Added at the desk. Card here means taken at the desk, so no Square link is sent.</p>`;

const editStudentBody = (isPhone) => `<div class="ev-two">${field('First name', text('Eli'))}${field('Last name', text('Park'))}</div>
<div class="ev-two">${field('Age', text('6'))}${field('Rank', select('Little Tiger Yellow'))}</div>
${chips('Class', ['Group D · 4:20 PM', 'White / Little Tiger · 5:10 PM', 'Group A · 6:00 PM', 'Teen / Adult · 7:40 PM'], 'Group D · 4:20 PM')}
<p class="field-hint brk-hint">Eli will move from White / Little Tiger to Group D.</p>
<div class="ev-two">${step('Technical boards', 3)}${step('Adult boards', 0)}</div>
${segmented('Paying by', ['Cash', 'Check', 'Card'], 'Cash')}
<div class="field">${notice('Their Square payment link will be cancelled so it can\'t mark them paid later. Collect cash at the desk.')}</div>
<div class="field"><label class="cbrow"><input class="cb" type="checkbox" checked><span>Override price (admins only)</span></label>
<div class="brk-override"><span class="brk-dollar" aria-hidden="true">$</span><input class="input brk-override-input" type="text" value="8" aria-label="Price for this student"></div></div>
${amountLine('Amount $8', 'Set by hand. The price would be $9 (3 Technical × $3, cash).')}`;

const crow = (n, a, b, first = false, last = false) => `<div class="ev-crow brk-crow">
<span class="brk-crow-main">${'<button type="button" class="grip" aria-label="Drag to reorder ' + n + '">' + I('grip-vertical') + '<span class="grip-tip" aria-hidden="true">Drag to reorder</span></button>'}<input class="input brk-crow-name" type="text" value="${n}" aria-label="Class name"></span>
<span class="ev-crow-times">${timeSel(n + ' start time', a)}<span class="ev-crow-to">to</span>${timeSel(n + ' end time', b)}${tib('More actions for ' + n, 'dots')}</span></div>`;
const eventBody = () => `<div class="ev-two">${field('Event name', text('December Board Breaking'))}<div class="field"><span class="field-label">Date</span>${dateField('Fri, Dec 18, 2026')}</div></div>
<div class="field"><span class="field-label">Class times</span><div class="ev-classes brk-classes" role="group">
${crow('Group D', '4:20 PM', '5:00 PM')}${crow('White / Little Tiger', '5:10 PM', '5:50 PM')}${crow('Group A', '6:00 PM', '6:40 PM')}${crow('Teen / Adult', '7:40 PM', '8:20 PM')}
<div class="brk-addclass"><button type="button" class="btn btn-sm">${I('plus')}Add class</button></div></div>
<p class="field-hint">Copied from November Board Breaking. Use ⋯ to move a class up or down or remove it. A class with students in it can't be removed.</p></div>
${segmented('Registration', ['Open', 'Closed'], 'Closed', true)}
<p class="field-hint brk-hint">Prices and the board chart come from the Chart and prices tab, not from the event.</p>`;

// ---------- the pieces that sit over a page ----------
const markPaidBox = `<div class="mpb" role="dialog" aria-label="Mark Ben Torres paid" data-anchor="[data-mark=ben]"><p class="mpb-line"><span class="mpb-name">Ben Torres</span> · $12</p>
<div class="mpb-field"><span class="field-label">Paid by</span><div class="segmented ev-segmented segmented--compact" role="radiogroup"><button type="button" role="radio" aria-checked="false" class="segment">Cash</button><button type="button" role="radio" aria-checked="true" class="segment is-checked">Check</button><button type="button" role="radio" aria-checked="false" class="segment">Card</button></div></div>
<p class="mpb-hint">They chose Check on the form.</p><p class="mpb-hint brk-newline">Counts at Shrewsbury, this device's school.</p>
<button type="button" class="btn btn-sm mpb-go">${I('check')}Mark paid $12</button></div>`;
const toast = `<div class="toast-region" role="status"><div class="toast toast--action">${I('check', 16, 'toast-icon')}<span class="toast-text">Ben Torres marked paid · $12 check</span><button type="button" class="toast-undo"><span class="toast-undo-words"><span class="toast-undo-word">${I('arrow-back-up')}Undo</span></span></button></div></div>`;
const rowMenuPc = `<div class="tmenu" role="menu" aria-label="More actions for Ben Torres" data-anchor="[data-more=ben]">
<div><button type="button" role="menuitem" class="menu-item tmenu-item">${I('edit', 16, 'menu-icon')}<span>Edit student</span></button></div>
<div><button type="button" role="menuitem" class="menu-item tmenu-item">${I('arrow-right', 16, 'menu-icon')}<span>Move to class…</span></button></div>
<div><button type="button" role="menuitem" class="menu-item tmenu-item">${I('history', 16, 'menu-icon')}<span>History</span></button></div>
<div><button type="button" role="menuitem" class="menu-item tmenu-item is-disabled" aria-disabled="true">${I('arrow-back-up', 16, 'menu-icon')}<span>Undo payment</span></button></div>
<div><div role="separator" class="menu-separator"></div><button type="button" role="menuitem" class="menu-item tmenu-item tmenu-item--danger">${I('trash', 16, 'menu-icon')}<span>Delete student</span></button></div></div>`;
const rowMenuPhone = `<div class="tsheet-wrap"><div class="tsheet-backdrop" aria-hidden="true"></div><div class="tsheet"><div class="account-grab" aria-hidden="true"></div><div class="tsheet-head"><p class="tsheet-title">Ben Torres</p><p class="tsheet-sub">7 · White belt · 4 Technical · 0 Adult</p></div><div role="menu" aria-label="More actions for Ben Torres">
<div><button type="button" role="menuitem" class="menu-item tmenu-item">${I('edit', 16, 'menu-icon')}<span>Edit student</span></button></div>
<div><button type="button" role="menuitem" class="menu-item tmenu-item">${I('arrow-right', 16, 'menu-icon')}<span>Move to class…</span></button></div>
<div><button type="button" role="menuitem" class="menu-item tmenu-item">${I('history', 16, 'menu-icon')}<span>History</span></button></div>
<div><button type="button" role="menuitem" class="menu-item tmenu-item is-disabled" aria-disabled="true">${I('arrow-back-up', 16, 'menu-icon')}<span>Undo payment</span></button></div>
<div><div role="separator" class="menu-separator"></div><button type="button" role="menuitem" class="menu-item tmenu-item tmenu-item--danger">${I('trash', 16, 'menu-icon')}<span>Delete student</span></button></div>
<div role="separator" class="menu-separator"></div><button type="button" role="menuitem" class="menu-item tmenu-cancel">Cancel</button></div></div></div>`;
const linkDialog = `<div class="dialog tdialog tdialog--detail" role="dialog" aria-modal="true"><h2 class="dialog-title">Registration link</h2><p class="tdialog-sub ev-link-event">November Board Breaking</p>
<p class="ev-link-line">Registration is open. Families choose their class time and boards on the form, and pay by cash, check or card.</p>
<div class="ev-link-card"><p class="ev-link-school">Shrewsbury school</p><img data-qr="https://example.invalid/breaking/ab12cd34" alt="" width="128" height="128"><p class="ev-link-url">tkd-dashboard.pages.dev/<wbr>breaking/ab12cd34</p>
<div class="ev-link-buttons"><button type="button" class="btn btn-sm">${I('copy')}Copy link</button><button type="button" class="btn btn-sm">${I('download')}Download QR code</button><button type="button" class="btn btn-sm">${I('printer')}Print flyer</button></div></div>
<div class="dialog-actions"><button type="button" class="btn">Close</button></div></div>`;

// ---------- all the states ----------
const crop = (id, caption, main, over = '', focus = '', short = false) => `<div class="mock-frame crop${short ? ' short' : ''}" data-state="${id}" data-caption="${cap(caption)}"${focus ? ` data-focus="${focus}"` : ''}>${shell(main)}${over}</div>`;
const full = (id, caption, main) => `<div class="mock-frame" data-state="${id}" data-caption="${cap(caption)}">${shell(main)}</div>`;
const behindRoster = `<div class="mock-app-wrap dim-behind">${shell(rosterMain)}</div>`;
const behindEvents = `<div class="mock-app-wrap dim-behind">${shell(eventsPage('up'))}</div>`;

const states = [
  full('events', '<b>Events (admin).</b> Board breaking is the fourth page inside Testing, after Black Belt testing. Same list as Color belt testing: Upcoming and Past, one row per event with its date, school, <b>10 registered · 5 paid</b> and the Registration tag, a pencil and a ⋯ at the end. <b>Add event</b> is the page\'s one primary button (admins only; staff see the list and open an event). The <b>Chart and prices</b> tab is drawn on its own picture.', eventsPage('up')),
  crop('events-past', '<b>Events, Past side.</b> The Past button shows older events, newest first, with the same columns; their rosters stay open for looking up.', eventsPage('past'), '', '', true),
  crop('events-empty', '<b>Empty state.</b> Before the first event: one gray line and the Add event button (staff are told "An admin adds them", as in Color belt testing).', eventsEmpty, '', '', true),
  full('roster', '<b>Event roster (admin).</b> Header: name, date and school, a <b>Registration Open / Closed</b> switch (admins), <b>Add student</b> (the one primary button) and <b>Registration link</b>. Amber box for Square payments that did not match (admins only, with Review). Count cards that filter the list (Registered, Paid, Broke) and a money total ($67 collected of $138.75 due). <b>Find a student</b>, then students grouped by class time, each group saying <b>N registered · N broke</b>. Row: name, age · rank, boards, Paying by with the amount, a payment tag (<b>Paid</b>, <b>Not paid</b>, <b>Awaiting card payment</b>), the <b>Broke</b> box (Camps\' check-in box), Mark paid and ⋯. Mia Santos has the small <b>Same day</b> tag.', rosterMain),
  crop('rowmenu', '<b>The ⋯ menu.</b> Edit student · Move to class… · History · Undo payment (gray until a payment exists; staff can undo only their own recent one, admins any) · Delete student (admins only, red, because it deletes). A phone gets the usual bottom sheet.', rosterMain, `<div class="mk-wide">${rowMenuPc}</div><div class="mk-phone">${rowMenuPhone}</div>`, '[data-more=ben]'),
  `<div class="mock-frame dlg" data-state="link" data-caption="${cap('<b>Registration link.</b> The same box Color belt testing and Camps open: school, the QR code, the address, Copy link, Download QR code, Print flyer. The address is a placeholder; the real one comes from the section\'s public page.')}">${behindRoster}<div class="dialog-backdrop dialog-backdrop--top">${linkDialog}</div></div>`,
  dialogState({
    id: 'add', title: 'Add student', sub: 'November Board Breaking · Shrewsbury school', body: addStudentBody, behind: behindRoster,
    caption: '<b>Add student (walk-in).</b> First and last name, age and rank (one long list of every rank), class (free choice, the recommended one named), the two board steppers filled in from age and rank, <b>Paying by</b>, and the amount worked out by the database with the <b>event-day +$1 per board</b> line. One primary button. On a phone it is the usual full-screen dialog page.',
  }),
  crop('markpaid', '<b>Mark paid.</b> The shared small box under the row\'s button (design review M3): the amount, <b>Paid by</b> Cash / Check / Card preset to the family\'s choice with its hint, then <b>Mark paid $12</b>. <b style="color:#b45309">NEW (a guess)</b>: the gray line <i>Counts at Shrewsbury, this device\'s school</i>; the shared box shows no school today, the school comes from the account menu\'s This device.', rosterMain, `${markPaidBox}`, '[data-mark=ben]'),
  crop('toast', '<b>After Mark paid.</b> The row now says Paid, and the usual dark toast says what was recorded with <b>Undo</b> for 5 seconds. Undo takes the payment back in one step.', rosterBenPaid, toast, '[data-more=ben]'),
  dialogState({
    id: 'edit', title: 'Edit student', sub: 'Eli Park · November Board Breaking', body: editStudentBody, behind: behindRoster,
    caption: '<b>Edit student (admin view).</b> Name, age, rank, class (a note says <b>Eli will move from White / Little Tiger to Group D</b>), boards, Paying by. Moving from Card to Cash shows the amber note about the cancelled Square link. <b>Override price</b> (a tick and a box) is for admins only; staff do not see it. The amount is always worked out by the database; an override says so.',
  }),
  dialogState({
    id: 'event', title: 'Add event', sub: 'Shrewsbury school (the school in the top bar). Prices come from Chart and prices.', body: eventBody, behind: behindEvents, size: 'wide',
    caption: '<b>Add / Edit event (admin).</b> Name, date, the fixed school, the <b>class times list</b> (name, start, end with the shared time list; grip to drag, ⋯ for Move up / Move down / Remove; Add class) that starts as a copy of the last event\'s classes, and the Registration switch. Save is the one primary button. Edit event is the same box with the saved values.',
  }),
];

// ---------- the one source page ----------
const cssFiles = ['src/styles/tokens.css', 'src/styles/app.css', 'src/styles/shared.css', 'src/styles/testing.css', 'src/styles/testing-events.css', 'src/styles/camps.css', 'src/styles/people-search.css', 'src/styles/rail-menu.css', 'src/components/DatePicker.css'];
const style = `
  html { scrollbar-width: none; }
  body { margin: 0; background: #fff; }
  .mock-frame { position: relative; transform: translateZ(0); overflow: hidden; margin: 0 0 24px; background: var(--color-bg); outline: 1px solid var(--color-border); }
  .mock-app, .mock-app-wrap { min-height: 100%; }
  .mock-app { display: flex; flex-direction: column; }
  .mock-app .shell { flex: 1 0 auto; min-height: 0; }
  .mock-app .shell-content { flex: none; overflow: visible; }
  /* A cropped picture is exactly one screen high, as the app shows it (the page area scrolls inside). */
  .mock-frame.crop { height: 100vh; }
  .mock-frame.crop.short { height: min(100vh, 520px); }
  .mock-frame.crop .mock-app { height: 100%; }
  .mock-frame.crop .shell { min-height: 0; flex: 1 1 0; }
  .mock-frame.crop .shell-content { flex: 1; min-height: 0; overflow: hidden; }
  /* A dialog picture: the page behind and the dialog in the same spot (the grid cell grows to the taller one). */
  .mock-frame.dlg { display: grid; min-height: min(100vh, 860px); }
  .mock-frame.dlg > * { grid-area: 1 / 1; }
  .mock-frame.dlg > .mock-app-wrap { max-height: min(100vh, 860px); overflow: hidden; }
  .mock-frame.dlg > .dialog-backdrop { position: relative; inset: auto; z-index: 5; }
  .mock-frame.dlg .dialog { max-height: none; overflow: visible; margin-bottom: 24px; }
  .mock-frame.dlg .dialog-page { position: relative; inset: auto; min-height: 100%; }
  .mock-frame.dlg .dialog-page-body { overflow: visible; flex: none; }
  .mock-frame .tsheet-wrap, .mock-frame .tmenu, .mock-frame .mpb, .mock-frame .toast-region { position: absolute; }
  .mock-frame .mpb, .mock-frame .tmenu { z-index: 45; }
  .mock-frame.crop > .mk-phone { position: absolute; inset: 0; }
  /* Pieces drawn for one family of sizes only (the app switches by script; the media query is its own). */
  .topbar-phone { display: none; }
  .mk-phone { display: none; }
  @media (max-width: 639.98px) {
    .topbar-pc { display: none; }
    .topbar-phone { display: flex; }
    .mk-wide { display: none !important; }
    .mk-phone { display: block; }
    .mock-frame.dlg > .mock-app-wrap { display: none; }
    .mock-frame.dlg > .mk-phone.dialog-page { display: flex; }
  }
  .dim-behind { filter: none; }
  .dlg > .dialog-backdrop { background: var(--color-backdrop); }
  /* NEW: Board breaking's own parts (they go in the section's stylesheet when built). */
  .brk .brk-regline { display: flex; align-items: center; gap: var(--space-8); margin-top: var(--space-8); }
  .brk .brk-regline .field-label { margin: 0; }
  .brk .brk-sub { display: block; color: var(--color-text-secondary); font-size: var(--text-12); }
  .brk .brk-subhead { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-12); }
  .brk .brk-subhead strong { font-weight: 600; }
  .brk .brk-subcount { color: var(--color-text-secondary); font-weight: 400; white-space: nowrap; }
  .brk .brk-boards-inline { display: none; flex-basis: 100%; }
  .brk .brk-srow { grid-template-columns: minmax(0, 1.5fr) minmax(0, 1.1fr) 84px 176px 92px 152px; }
  .brk .brk-erow, .brk .ev-list:not(.is-touch) .ev-row { grid-template-columns: minmax(0, 1.4fr) 150px 110px minmax(0, 1fr) 160px 64px; }
  .brk-amount { display: flex; flex-direction: column; gap: 2px; margin: 0 0 var(--space-12); font-size: var(--text-13); }
  .brk-amount span { color: var(--color-text-secondary); font-size: var(--text-12); }
  .brk-hint, .brk .brk-hint { margin: calc(-1 * var(--space-4)) 0 var(--space-12); }
  .brk-override { position: relative; width: 120px; margin-top: var(--space-8); }
  .brk-dollar { position: absolute; left: var(--space-12); top: 50%; transform: translateY(-50%); color: var(--color-text-secondary); font-size: var(--text-13); }
  .brk-override-input { padding-left: 24px; }
  .brk .viewonly { margin-top: var(--space-12); }
  .brk-crow { grid-template-columns: minmax(0, 1fr) auto; }
  .brk-crow-main { display: flex; align-items: center; gap: var(--space-4); min-width: 0; }
  .brk-crow-name { min-width: 0; }
  .brk-addclass { padding: var(--space-8) 0 var(--space-4); border-top: 1px solid var(--color-border); }
  
  @media (min-width: 640px) and (max-width: 1023.98px) {
    .brk .brk-srow { grid-template-columns: minmax(0, 1.6fr) 76px 150px 76px 152px; }
    .brk .brk-boards { display: none; }
    .brk .brk-boards-inline { display: block; }
    .brk .brk-erow, .brk .ev-list:not(.is-touch) .ev-row { grid-template-columns: minmax(0, 1fr) 108px 84px 170px 136px 64px; white-space: nowrap; } .brk .brk-erow .ev-name, .brk .ev-list:not(.is-touch) .ev-row .ev-name { white-space: normal; }
  }
  @media (max-width: 1023.98px) {
    .brk-crow { grid-template-columns: minmax(0, 1fr); row-gap: var(--space-4); padding: var(--space-4) 0 var(--space-8); }
    .brk-crow .ev-crow-times { margin-left: 32px; }
  }
  @media (pointer: coarse) {
    button.cp-dc { min-height: 28px; }
    button.cp-dc::after { content: ''; position: absolute; inset: -8px 0; }
  }
  @media (max-width: 639.98px) {
    .brk-crow { position: relative; }
    .brk-crow .ev-crow-times { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); margin-left: 0; }
    .brk-crow .ev-time { width: auto; }
    .brk-crow .ev-crow-times .tib { position: absolute; top: 0; right: -4px; }
    .brk-crow .brk-crow-name { margin-right: 40px; }
    .brk .brk-subhead { flex-wrap: wrap; row-gap: 0; }
    .brk .brk-subcount { white-space: normal; }
    .brk .ev-srow.is-phone .ev-sline-tag { gap: var(--space-8); }
  }
`;
const script = `
  function position() {
    document.querySelectorAll('.mock-frame.crop[data-focus]').forEach((frame) => {
      const content = frame.querySelector('.shell-content');
      const target = [...frame.querySelectorAll(frame.dataset.focus)].find((x) => x.getClientRects().length);
      if (!content || !target) return;
      content.scrollTop = 0;
      const c = content.getBoundingClientRect(); const t = target.getBoundingClientRect();
      content.scrollTop = Math.max(0, (t.top - c.top) - content.clientHeight * 0.38);
    });
    document.querySelectorAll('.mock-frame [data-anchor]').forEach((el) => {
      const frame = el.closest('.mock-frame');
      const anchors = [...frame.querySelectorAll(el.dataset.anchor)].filter((a) => a.getClientRects().length);
      const a = anchors[0]; if (!a) return;
      const fr = frame.getBoundingClientRect(); const ar = a.getBoundingClientRect();
      const w = el.offsetWidth; const h = el.offsetHeight;
      let left = ar.right - fr.left - w; left = Math.max(8, Math.min(left, fr.width - w - 8));
      let top = ar.bottom - fr.top + 4;
      if (top + h > fr.height - 8) top = ar.top - fr.top - h - 4;
      el.style.left = left + 'px'; el.style.top = top + 'px';
    });
  }
  window.addEventListener('load', position); window.addEventListener('resize', position);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(position);
`;
const source = `<!doctype html>
<!--
  B-staff.src.html — mockup source for the Board breaking STAFF screens (events list, event roster, dialogs).
  Written by B-staff-gen.mjs; build with docs/Dashboard Core/tools/build-mockup.mjs. Fake names only.
-->
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Board breaking staff screens — mockup</title>
<!-- css: ${cssFiles.join(' ')} -->
<style>${style}</style>
<script>if (location.search.includes('marks')) document.documentElement.classList.add('marks');</script>
</head><body>
${states.join('\n')}
<script>${script}</script>
</body></html>`;

mkdirSync(join(here, 'B-staff-shots'), { recursive: true });
writeFileSync(join(here, 'B-staff.src.html'), source);

const run = (script, args) => {
  const r = spawnSync(process.execPath, [join(tools, script), ...args], { stdio: 'inherit', cwd: repo });
  if (r.status !== 0) throw new Error(`${script} failed`);
};
run('build-mockup.mjs', [join(here, 'B-staff.src.html'), join(here, 'B-staff.html')]);
run('shoot-states.mjs', [join(here, 'B-staff.html'), join(here, 'B-staff-shots')]);

const sheets = [
  { out: 'B-staff-events', title: 'Board breaking · Events page (staff dashboard)', states: ['events', 'events-past', 'events-empty'], own: ['events'],
    subtitle: 'New page inside Testing (rulebook v1.300): the list of Board breaking events. Drawn with the app\'s own stylesheets, at PC 1280×800, tablet 820×1180 touch, phone 390×844 touch and small phone 320×640 touch. School = Shrewsbury. Fake data.' },
  { out: 'B-staff-roster', title: 'Board breaking · Event roster (staff dashboard)', states: ['roster', 'rowmenu', 'link'], own: ['roster', 'rowmenu', 'link'],
    subtitle: 'One event page: header, counts, Square notice (admin), Find a student and the students grouped by class time. Rows copy Color belt testing\'s roster and Camps\' check-in box. Fake data.' },
  { out: 'B-staff-dialogs', title: 'Board breaking · Dialogs (staff dashboard)', states: ['add', 'markpaid', 'toast', 'edit', 'event'], own: ['add', 'markpaid', 'toast', 'edit', 'event'],
    subtitle: 'Add student (walk-in), Mark paid with its Undo toast, Edit student, and Add / Edit event. PC and tablet draw a box on a dimmed page; phones draw the full-screen dialog page. Fake data.' },
];
for (const s of sheets) {
  writeFileSync(join(here, `${s.out}.sheet.json`), JSON.stringify({ shots: 'B-staff-shots', title: s.title, subtitle: s.subtitle, states: s.states, pcOwnLine: s.own, out: s.out }, null, 2));
  run('compose-sheet.mjs', [join(here, `${s.out}.sheet.json`)]);
}
