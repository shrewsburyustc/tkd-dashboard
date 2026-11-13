// C-admin-gen.mjs — writes the three mockup SOURCE pages for Board breaking's admin "Chart and prices" tab.
// Why: Jeffrey reviews pictures before anything is built (CLAUDE.md). A mockup must use the app's REAL
// stylesheets and icons, and the same screen has to be drawn three ways (PC, tablet, phone). Writing the
// markup by hand three times would drift, so this script builds it from one description.
// The markup copies what the real app draws (class names read from the preview app on 2026-11-12):
//   shell (rail / top bar / bottom bar) ... components/Shell.jsx, Rail.jsx, TopBar.jsx, BottomBar.jsx
//   a block with a title and a pencil ..... Star testing's Fees block (screens/testing/star/SettingsBlocks.jsx)
//   groups, rank rows, phone rank rows .... Color belt's Classes and ranks (ClassBlock.jsx, RankRows.jsx)
//   dialogs, "are you sure?" box, ⋯ menu, toast ... shared Dialog, ConfirmBox, RowMenu, Toast
//   the − n + stepper ..................... BeltPicker.jsx's end stripes
// Usage (from the repo's top folder):  node "docs/Board Breaking/Mockups/C-admin-gen.mjs"
// Then: build-mockup.mjs → shoot-states.mjs → compose-sheet.mjs (the commands are in C-admin-run.sh).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, 'C-admin-src');
mkdirSync(SRC, { recursive: true });

// ---------- small helpers ----------
const icon = (name, size = 16, cls = '') => `<i data-icon="${name}" data-size="${size}"${cls ? ` class="${cls}"` : ''}></i>`;
const tib = (label, name, extra = '') =>
  `<button type="button" class="tib" aria-label="${label}"${extra}><span class="tib-box">${icon(name)}</span><span class="tib-tip" aria-hidden="true">${label}</span></button>`;
let beltId = 0;
const FILL = (k) => (k ? `var(--belt-${k}, var(--belt-unknown))` : 'var(--belt-unknown)');
// Belt.jsx, drawn the same way (40×12, bands of whole pixels, 1px outline).
function belt({ p = 'solid', c, c2 }) {
  const w = 40, h = 12, id = `bc${++beltId}`;
  const first = FILL(c), second = FILL(c2 ?? c);
  let bands;
  if (p === 'stripe') { const o = Math.ceil(h / 3), m = h - o * 2; bands = [[0, o, first], [o, m, second], [o + m, o, first]]; }
  else if (p === 'half') bands = [[0, h / 2, first], [h / 2, h / 2, second]];
  else bands = [[0, h, first]];
  return `<svg class="belt belt--row" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false"><defs><clipPath id="${id}"><rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="2"/></clipPath></defs><g clip-path="url(#${id})" shape-rendering="crispEdges">${bands.map(([y, hh, f]) => `<rect x="0" y="${y}" width="${w}" height="${hh}" style="fill:${f}"/>`).join('')}</g><rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="2" style="fill:none;stroke:var(--belt-outline)" stroke-width="1"/></svg>`;
}
const solid = (c) => ({ p: 'solid', c });
const stripe = (c, c2) => ({ p: 'stripe', c, c2 });
const half = (c, c2) => ({ p: 'half', c, c2 });

// ---------- the board chart (the LIVE PAGE's numbers, docs/Board Breaking/Chart-live-page-vs-PDF.md) ----------
// [rank, belt, technique, technical, adult, what the printed PDF says if it differs]
const LT = [
  ['White', solid('white'), 'Hammer Fist', 3, 0],
  ['Yellow', stripe('white', 'yellow'), 'Hammer Fist', 3, 0],
  ['Green', stripe('white', 'green'), 'Elbow Strike', 3, 0],
  ['Blue', stripe('white', 'blue'), 'Elbow Strike', 3, 0],
  ['Red', stripe('white', 'red'), 'Axe Kick', 3, 0],
  ['Black', stripe('white', 'black'), 'Axe Kick', 3, 0],
];
const technique = {
  White: 'Hammer Fist', Yellow: 'Elbow Strike', Orange: 'Flying Side Kick', Green: 'Axe Kick', 'High Green': 'Round House Kick',
  Blue: 'Punch', 'High Blue': 'Jumping Front Snap Kick', Purple: 'Back Kick', Red: 'Spinning Round House', 'High Red': 'Skipping Hook Kick',
  Brown: 'Back Hook Kick', 'High Brown': 'Back Kick (Adult Board)', 'Red / Black': 'Back Kick / Axe (Adult Board)',
  'Bo Dan / Deputy': 'Back Hook + Spinning Round House + 3 Power Breaking',
};
const BELT = {
  White: solid('white'), Yellow: solid('yellow'), Orange: solid('orange'), Green: solid('green'), 'High Green': stripe('green', 'white'),
  Blue: solid('blue'), 'High Blue': stripe('blue', 'white'), Purple: solid('purple'), Red: solid('red'), 'High Red': stripe('red', 'white'),
  Brown: solid('brown'), 'High Brown': stripe('brown', 'white'), 'Red / Black': half('red', 'black'), 'Bo Dan / Deputy': stripe('black', 'white'),
};
const beltNames = Object.keys(BELT);
const CHILD = beltNames.map((n) => {
  let t = 3, a = 0, printed = null;
  if (['Blue', 'High Blue', 'Purple', 'Red', 'High Red', 'Brown'].includes(n)) { t = 4; printed = '3 Technical'; }
  if (n === 'High Brown') { t = 3; a = 1; printed = '2 Technical + 1 Adult'; }
  if (n === 'Red / Black') { t = 2; a = 2; printed = '2 Adult'; }
  if (n === 'Bo Dan / Deputy') { t = 2; a = 3; }
  return [n, BELT[n], technique[n], t, a, printed];
});
const TEEN = beltNames.map((n) => {
  let t = 0, a = 3, printed = null;
  if (['Blue', 'Purple', 'High Red', 'Brown', 'High Brown'].includes(n)) { t = 1; printed = '3 Adult'; }
  if (['High Blue', 'Red'].includes(n)) { t = 1; printed = '1 Technical + 2 Adult'; }
  if (n === 'Red / Black') { t = 1; a = 4; printed = '4 Adult'; }
  if (n === 'Bo Dan / Deputy') { t = 2; a = 3; }
  return [n, BELT[n], technique[n], t, a, printed];
});
const P2 = '2 Technical + Power Breaking (3 Adult)';
const P3 = '3 Technical + Power Breaking (3 Adult)';
const BLACK = [
  ['1st Dan', 4, 3, P2], ['1st Dan 1 Star', 4, 3, P2], ['1st Dan 2 Star', 4, 3, P2], ['1st Dan 3 Star', 4, 3, P2],
  ['1st Dan 4 Star', 7, 3, null], ['2nd Dan', 7, 3, null],
  ['2nd Dan 1 Star', 6, 3, P3], ['2nd Dan 2 Star', 6, 3, P3], ['2nd Dan 3 Star', 6, 3, P3],
  ['3rd Dan', 6, 3, P3], ['3rd Dan 1 Star', 6, 3, P3], ['3rd Dan 2 Star', 6, 3, P3], ['3rd Dan 3 Star', 6, 3, P3],
  ['3rd Dan 4 Star', 6, 3, P3], ['3rd Dan 5 Star', 6, 3, '4 Adult + Power Breaking (3 Adult)'],
].map(([n, t, a, p]) => [n, solid('black'), 'Power Breaking', t, a, p]);
const GROUPS = [
  { key: 'tiger', name: 'Little Tiger', rule: 'Little Tiger belts, at any age', rows: LT },
  { key: 'child', name: 'Child', rule: 'Age 12 and under', rows: CHILD },
  { key: 'teen', name: 'Teen / Adult', rule: 'Age 13 and up', rows: TEEN },
  { key: 'black', name: 'Black Belt', rule: 'Black Belt ranks, at any age', rows: BLACK },
];

// ---------- the shell (copied from the app's own markup) ----------
const NAV = [
  ['Home', 'home'], ['Testing', 'certificate'], ['Camps', 'tent'], ['Schedule', 'clock'], ['Calendar', 'calendar-month'],
  ['Forms', 'clipboard-text'], ['Prospects', 'address-book', 5], ['Finance', 'report-money'],
];
function rail() {
  const item = ([label, ic, badge]) => {
    const current = label === 'Testing';
    const btn = `<button type="button" class="rail-item${current ? ' is-current has-menu' : ''}" aria-label="${label}${badge ? `, ${badge} new` : ''}"${current ? ' aria-current="page" aria-haspopup="menu"' : ''}><span class="rail-icon">${icon(ic, 20)}${badge ? `<span class="nav-badge" aria-hidden="true">${badge}</span>` : ''}</span><span class="rail-label" aria-hidden="true">${label}</span></button>`;
    return current ? `<div class="rail-menu-wrap">${btn}</div>` : btn;
  };
  return `<nav class="rail rail--standard" aria-label="Sections">${NAV.map(item).join('')}</nav>`;
}
const loc = `<div class="loc" role="radiogroup" aria-label="Location"><button type="button" role="radio" aria-checked="true" class="loc-option is-active">${icon('map-pin')}Worcester</button><button type="button" role="radio" aria-checked="false" class="loc-option">Shrewsbury</button><button type="button" role="radio" aria-checked="false" class="loc-option">Both</button></div><button type="button" class="avatar-button" aria-label="Account menu"><span class="avatar" aria-hidden="true">JB</span></button>`;
function topbar(kind) {
  if (kind === 'phone') return `<header class="topbar"><div class="topbar-spacer"></div><button type="button" class="icon-button ps-open" aria-label="Search people">${icon('search', 20)}</button>${loc}</header>`;
  return `<header class="topbar"><div class="ps"><div class="ps-field">${icon('search', 16, 'ps-icon')}<input class="ps-input" aria-label="Search people" placeholder="Search people" type="search" value="" readonly><kbd class="ps-key" aria-hidden="true">/</kbd></div></div><div class="topbar-spacer"></div>${loc}</header>`;
}
const bottombar = `<nav class="bottombar" aria-label="Sections"><button type="button" class="bottombar-item"><span class="bottombar-icon">${icon('home', 20)}</span><span>Home</span></button><button type="button" class="bottombar-item"><span class="bottombar-icon">${icon('calendar-month', 20)}</span><span>Calendar</span></button><button type="button" class="bottombar-item" aria-label="Prospects, 5 new"><span class="bottombar-icon">${icon('address-book', 20)}<span class="nav-badge" aria-hidden="true">5</span></span><span>Prospects</span></button><button type="button" class="bottombar-item is-current" aria-current="page"><span class="bottombar-icon">${icon('menu-2', 20)}</span><span>More</span></button></nav>`;
const shell = (kind, page, overlay = '') =>
  `<div class="app-root"><div class="app-screen"><div class="shell">${rail()}<div class="shell-main">${topbar(kind)}<div class="shell-bars"><div class="shell-pagebars"></div></div><main class="shell-content">${page}</main>${bottombar}</div></div></div>${overlay}</div>`;

// ---------- the page: header, tabs ----------
function pageHead(admin) {
  const tab = (label, current) => `<button type="button" class="ttab${current ? ' is-current' : ''}" role="tab" aria-selected="${current}">${label}</button>`;
  return `<div class="phead"><div class="phead-titles"><button type="button" class="link-button back-link" aria-label="Back to Testing">${icon('arrow-left')}Testing</button><h1 class="ptitle">Board breaking</h1><p class="psub">Worcester</p></div></div>
<div class="ttabs" role="tablist" aria-label="Board breaking">${admin ? `${tab('Events', false)}${tab('Chart and prices', true)}` : tab('Events', true)}</div>`;
}
const VIEWONLY_ADMIN = `<p class="viewonly">Prices, age groups and the board chart. They are the same for every Board breaking event, at both schools.</p>`;

// ---------- the two cards ----------
const PRICES = [
  ['Technical board', ' (cash / check)', '$3.00'],
  ['Adult board', ' (cash / check)', '$4.00'],
  ['Card adds, per board', '', '$0.25'],
  ['From the event date on, adds per board', '', '$1.00'],
];
const EXAMPLE = 'Card, 4 Technical, event day: 4 × $4.25 = $17.00';
const pricesCard = (mark = true) => `<section class="st-blk${mark ? ' mark' : ''}" aria-label="Prices (all events)">
  <div class="st-bhead"><h2 class="st-bname">Prices (all events)</h2><span class="acts">${tib('Edit prices', 'edit')}</span></div>
  <div role="table" aria-label="Prices">${PRICES.map(([a, b, v]) => `<div role="row" class="st-trow bb-g-price"><span role="rowheader">${a}<span class="bb-muted">${b}</span></span><span role="cell" class="num">${v}</span></div>`).join('')}</div>
  <p class="st-bfoot"><span class="bb-muted">Example</span> · ${EXAMPLE}</p>
</section>`;
const ageCard = (mark = true) => `<section class="st-blk${mark ? ' mark' : ''}" aria-label="Age groups">
  <div class="st-bhead"><h2 class="st-bname">Age groups</h2><span class="acts">${tib('Edit age groups', 'edit')}</span></div>
  <div class="st-bbody"><p class="st-bline" style="margin-top:0"><b class="bb-b">Child</b>: 12 and under · <b class="bb-b">Teen / Adult</b>: 13 and up</p>
  <p class="st-bline st-bline--sec">A student's age decides which chart row is used. Little Tiger belts always use the Little Tiger rows, and Black Belt ranks always use the Black Belt rows.</p></div>
</section>`;

// ---------- the chart ----------
const cols = (kind) => (kind === 'tablet' ? 'minmax(0,1fr) minmax(0,1.7fr) 76px 56px 88px' : 'minmax(0,1fr) minmax(0,1.8fr) 76px 56px 64px');
const tagDiff = `<span class="ttag ttag--warn">${icon('alert-triangle', 12)}Differs from the printed chart</span>`;
function wideRow(g, r, kind, opts = {}) {
  const [name, b, tech, T, A, printed] = r;
  const ctx = `${g.name} ${name}`;
  const menu = opts.menu
    ? `<div class="tmenu bb-menu" role="menu" aria-label="More actions for ${ctx}"><div><button type="button" role="menuitem" class="menu-item tmenu-item">${icon('arrow-up', 16, 'menu-icon')}<span>Move up</span></button></div><div><button type="button" role="menuitem" class="menu-item tmenu-item">${icon('arrow-down', 16, 'menu-icon')}<span>Move down</span></button></div><div><div role="separator" class="menu-separator"></div><button type="button" role="menuitem" class="menu-item tmenu-item tmenu-item--danger mark">${icon('trash', 16, 'menu-icon')}<span>Delete rank</span></button></div></div>`
    : '';
  return `<div class="rrow" role="row"${opts.anchor ? ' data-scroll-to' : ''} style="grid-template-columns:${cols(kind)}">
  <span role="cell" class="rcell rk"><span class="rk-belt-name">${belt(b)}<span class="rk-name">${name}</span></span></span>
  <span role="cell" class="rcell bb-tech"><span>${tech}</span>${printed ? `${tagDiff}<span class="bb-printed">Printed chart: ${printed}</span>` : ''}</span>
  <span role="cell" class="rcell num">${T}</span><span role="cell" class="rcell num">${A}</span>
  <span role="cell" class="rcell rcell-acts bb-acts"><span class="acts">${tib(`Edit ${ctx}`, 'edit')}${tib(`More actions for ${ctx}`, 'dots', ' aria-haspopup="menu"')}</span>${menu}</span>
</div>`;
}
function phoneRow(g, r, opts = {}) {
  const [name, b, tech, T, A, printed] = r;
  const ctx = `${g.name} ${name}`;
  const [first, ...rest] = name.split(' ');
  return `<div class="prow" role="row"${opts.anchor ? ' data-scroll-to' : ''}>
  <div role="cell" class="prow-main">
    <div class="l1"><span class="l1-names"><span class="belt-name"><span class="nowrap">${belt(b)}${first}</span>${rest.length ? ` ${rest.join(' ')}` : ''}</span></span></div>
    <div class="l2"><span>${T} Technical</span> <span>· ${A} Adult</span></div>
    <div class="l2">${tech}</div>
    ${printed ? `<div class="l1b">${tagDiff}</div><div class="l2">Printed chart: ${printed}</div>` : ''}
  </div>
  <span role="cell" class="rcell-acts"><span class="acts">${tib(`Edit ${ctx}`, 'edit')}${tib(`More actions for ${ctx}`, 'dots', ' aria-haspopup="menu"')}</span></span>
</div>`;
}
function groupBlock(g, kind, opts = {}) {
  const phone = kind === 'phone';
  const count = `${g.rows.length} ranks`;
  const line = `<div class="cline"><button type="button" class="ctoggle" aria-expanded="true" aria-label="Collapse ${g.name}">${phone
    ? `<span class="cname">${g.name}</span><span class="ccount">${count}</span>${icon('chevron-up', 16, 'ctoggle-chevron')}`
    : `<span class="tib-box ctoggle-box">${icon('chevron-up')}</span><span class="cname">${g.name}</span><span class="ccount">${count}</span>`}</button></div><p class="cfinal">${g.rule}</p>`;
  const anchorIdx = opts.anchorGroup === g.key ? 1 : -1; // the second rank of that group carries the scroll anchor
  let body;
  if (phone) body = `<div role="table" aria-label="${g.name}" class="ptable">${g.rows.map((r, i) => phoneRow(g, r, { anchor: i === anchorIdx })).join('')}</div>`;
  else body = `<div role="table" aria-label="${g.name}" class="rtable"><div role="row" class="rhead" style="grid-template-columns:${cols(kind)}"><span role="columnheader" class="rcell">Rank</span><span role="columnheader" class="rcell">Technique</span><span role="columnheader" class="rcell num">Technical</span><span role="columnheader" class="rcell num">Adult</span><span role="columnheader" class="rcell" aria-hidden="true"></span></div>${g.rows.map((r, i) => wideRow(g, r, kind, { anchor: i === anchorIdx, menu: opts.menuOn === g.key && i === anchorIdx })).join('')}</div>`;
  return `<div class="cblock">${line}${body}<div class="addrow"><button type="button" class="btn btn-sm">${icon('plus')}Add rank</button></div></div>`;
}
const chartBlock = (kind, opts = {}) => `<h2 class="bb-h2">Board chart</h2>
<p class="bb-sub">The boards each rank usually breaks, and the technique. A family sees these as the starting numbers on the form and can still change them.</p>
<div class="clist${kind === 'pc' ? '' : ' is-touch'}${opts.mark === false ? '' : ' mark'}">${GROUPS.map((g) => groupBlock(g, kind, opts)).join('')}</div>`;

// ---------- dialogs, menu, toast ----------
const dlgMeta = '<p class="tmeta">Last changed by Database admin · Nov 10, 3:12 PM</p>';
function dialog(kind, { title, sub, body, size = 'detail' }) {
  if (kind === 'phone') {
    return `<div class="dialog-page tdialog-page" role="dialog" aria-modal="true"><div class="dialog-page-head"><button type="button" class="icon-button" aria-label="Back">${icon('arrow-left', 20)}</button><h2 class="dialog-page-title">${title}</h2></div><div class="dialog-page-body"><p class="tdialog-sub">${sub}</p><form novalidate>${body(true)}${dlgMeta}<div class="dialog-page-submit"><button type="submit" class="btn btn-primary btn-block">${icon('check')}Save</button></div></form></div></div>`;
  }
  return `<div class="dialog-backdrop dialog-backdrop--top"><div class="dialog tdialog tdialog--${size}" role="dialog" aria-modal="true"><h2 class="dialog-title">${title}</h2><p class="tdialog-sub">${sub}</p><form novalidate>${body(false)}${dlgMeta}<div class="dialog-footer"><div class="dialog-actions"><button type="button" class="btn">Cancel</button><button type="submit" class="btn btn-primary">${icon('check')}Save</button></div></div></form></div></div>`;
}
const money = (id, label, value, first = false) => `<div class="field"><label for="${id}">${label}</label><div class="money"><span class="money-prefix" aria-hidden="true">$</span><input id="${id}" class="money-input" type="text" inputmode="decimal" autocomplete="off" value="${value}"${first ? ' data-autofocus="true"' : ''}></div></div>`;
const two = (phone) => `style="${phone ? '' : 'grid-template-columns:repeat(2,minmax(0,1fr))'}"`;
const pricesBody = (phone) => `<p class="ro-label tdialog-group" style="margin-top:0">Cash or check, per board</p>
<div class="tprices${phone ? ' is-stacked' : ''}" ${two(phone)}>${money('p-tech', 'Technical board', '3.00', true)}${money('p-adult', 'Adult board', '4.00')}</div>
<p class="ro-label tdialog-group">Added to every board</p>
<div class="tprices${phone ? ' is-stacked' : ''}" ${two(phone)}>${money('p-card', 'Card adds, per board', '0.25')}${money('p-day', 'From the event date on, adds per board', '1.00')}</div>
<div class="ro"><p class="ro-label">Worked example</p><p class="ro-value">${EXAMPLE}</p></div>
<p class="field-hint tdialog-hint">Dollars and cents. A change applies to new sign-ups and to Edit; amounts already charged stay as they were.</p>`;
const ageBody = (phone) => `<div class="field"><label for="a-child">Child: this age and under</label><input id="a-child" class="input" type="text" inputmode="numeric" autocomplete="off" data-autofocus="true" value="12" style="${phone ? '' : 'width:96px'}"></div>
<div class="ro"><p class="ro-label">Teen / Adult</p><p class="ro-value">13 and up</p></div>
<p class="field-hint tdialog-hint">A student's age decides which chart row is used. Little Tiger belts always use the Little Tiger rows.</p>`;
const stepper = (id, label, v) => `<div class="field"><span class="field-label" id="${id}">${label}</span><div class="stepper" role="group" aria-labelledby="${id}"><button type="button" class="btn stepper-btn" aria-label="Fewer ${label.toLowerCase()}"><span aria-hidden="true">−</span></button><output class="stepper-value">${v}</output><button type="button" class="btn stepper-btn" aria-label="More ${label.toLowerCase()}"><span aria-hidden="true">+</span></button></div></div>`;
const rankBody = (phone) => `<div class="field"><label for="r-name">Rank name</label><input id="r-name" class="input" type="text" autocomplete="off" data-autofocus="true" value="Yellow"></div>
<div class="field"><label for="r-tech">Technique</label><input id="r-tech" class="input" type="text" autocomplete="off" value="Elbow Strike"></div>
<div class="tprices${phone ? ' is-stacked' : ''}" ${two(phone)}>${stepper('s-t', 'Technical boards', 3)}${stepper('s-a', 'Adult boards', 0)}</div>
<p class="field-hint tdialog-hint">From 0 to 12 of each. Families see these as the starting numbers and can change them.</p>`;
const confirmBox = `<div class="dialog-backdrop dialog-backdrop--top"><div class="dialog tdialog tdialog--small tdialog--confirm" role="alertdialog" aria-modal="true"><h2 class="dialog-title">Delete Child Yellow?</h2><p class="tdialog-sub tdialog-body">Families can't pick this rank any more. Sign-ups already made keep it. This can't be undone.</p><div class="dialog-actions cfm-actions"><button type="button" class="btn">Keep rank</button><button type="button" class="btn btn-delete">${icon('trash')}Delete rank</button></div></div></div>`;
const sheetMenu = `<div class="tsheet-wrap"><div class="tsheet-backdrop" aria-hidden="true"></div><div class="tsheet"><div class="account-grab" aria-hidden="true"></div><div class="tsheet-head"><p class="tsheet-title">Yellow</p><p class="tsheet-sub">Child · Elbow Strike · 3 Technical, 0 Adult</p></div><div role="menu" aria-label="More actions for Child Yellow"><div><button type="button" role="menuitem" class="menu-item tmenu-item">${icon('arrow-up', 16, 'menu-icon')}<span>Move up</span></button></div><div><button type="button" role="menuitem" class="menu-item tmenu-item">${icon('arrow-down', 16, 'menu-icon')}<span>Move down</span></button></div><div><div role="separator" class="menu-separator"></div><button type="button" role="menuitem" class="menu-item tmenu-item tmenu-item--danger mark">${icon('trash', 16, 'menu-icon')}<span>Delete rank</span></button></div><div role="separator" class="menu-separator"></div><button type="button" role="menuitem" class="menu-item tmenu-cancel">Cancel</button></div></div></div>`;
const toast = (text) => `<div class="toast-region" role="status"><div class="toast toast--action mark">${icon('check', 16, 'toast-icon')}<span class="toast-text">${text}</span><button type="button" class="toast-undo"><span class="toast-undo-words"><span class="toast-undo-word">${icon('arrow-back-up')}Undo</span><span class="toast-undo-word is-hidden">${icon('arrow-back-up')}Undoing…</span></span></button></div></div>`;

// ---------- staff view: a placeholder Events list ----------
const EVENTS = [['November Board Breaking', 'Fri, Nov 20 · Worcester', '38 registered'], ['October Board Breaking', 'Fri, Oct 16 · Worcester', '52 registered'], ['September Board Breaking', 'Fri, Sep 18 · Worcester', '47 registered']];
function eventsList(kind) {
  if (kind === 'phone') return `<div class="clist is-touch">${EVENTS.map(([n, d, c]) => `<div class="prow"><div class="prow-main"><div class="l1"><span>${n}</span></div><div class="l2">${d} · ${c}</div></div></div>`).join('')}</div>`;
  return `<div class="clist">${EVENTS.map(([n, d, c]) => `<div class="rrow bb-ev" style="grid-template-columns:minmax(0,1.4fr) minmax(0,1fr) 120px;padding-left:var(--space-16)"><span class="rcell">${n}</span><span class="rcell bb-muted">${d}</span><span class="rcell num">${c}</span></div>`).join('')}</div>`;
}

// ---------- the sheet pages ----------
const css = `<!-- css: src/styles/tokens.css src/styles/app.css src/styles/shared.css src/styles/testing.css src/styles/testing-events.css src/styles/rail-menu.css src/styles/people-search.css src/screens/testing/star/star.css -->`;
const head = (title, intro) => `<!doctype html>
<!--
  ${title}.src.html — mockup source, written by C-admin-gen.mjs (do not edit by hand; change the generator).
  Why: Board breaking's admin-only "Chart and prices" tab, drawn with the app's real stylesheets and icons.
  ${intro}
  Build: node "docs/Dashboard Core/tools/build-mockup.mjs" "docs/Board Breaking/Mockups/C-admin-src/${title}.src.html" "docs/Board Breaking/Mockups/${title}.html"
-->
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Board breaking (mockup)</title>
${css}
<style>
  body { background: #fff; }
  /* How the sheet shows the three drawings: one per device kind (the real app measures the same things in script). */
  .v-pc, .v-tablet, .v-phone { display: none; }
  @media (min-width: 640px) and (pointer: fine) { .v-pc { display: block; } }
  @media (min-width: 640px) and (pointer: coarse) { .v-tablet { display: block; } }
  @media (max-width: 639.98px) { .v-phone { display: block; } }
  /* A state is one screenshot. transform makes it the box that position:fixed pieces (dialogs, toast, menus) sit in. */
  .state { position: relative; transform: translateZ(0); margin: 0 0 24px; }
  .state .app-root { height: auto; min-height: 100vh; }
  .state .app-screen, .state .shell { flex: 1 0 auto; }
  .state .shell-content { overflow: visible; }
  .state.crop .app-root { height: 100vh; min-height: 0; overflow: hidden; }
  .state.crop .app-screen, .state.crop .shell { flex: 1 1 0; min-height: 0; }
  .state.crop .shell-content { flex: 1 1 0; min-height: 0; overflow: hidden; }
  .wrap > h2 { padding: 8px 16px; font-size: 14px; }
  .marks .mark { outline: 3px solid #f59e0b; outline-offset: 3px; border-radius: 8px; }
  /* ===== NEW in this screen (the rest is today's CSS) ===== */
  .bb-g-price { grid-template-columns: minmax(0, 1fr) 88px; padding: 0 var(--space-12); }
  .bb-muted { color: var(--color-text-secondary); }
  .bb-b { font-weight: 500; }
  .bb-h2 { margin-top: var(--space-24); font-size: var(--text-16); font-weight: 500; }
  .bb-sub { margin: 2px 0 var(--space-8); color: var(--color-text-secondary); font-size: var(--text-12); }
  .bb-tech { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
  .bb-printed { color: var(--color-text-secondary); font-size: var(--text-12); }
  .bb-acts { position: relative; }
  .bb-menu { position: absolute; top: 34px; right: 0; }
  .rrow { align-items: flex-start; padding-top: 6px; padding-bottom: 6px; }
  .rrow .rk, .rrow .bb-tech, .rrow .num { padding-top: 4px; }
  .rrow .rcell-acts { padding-top: 0; }
  .rrow.bb-ev { align-items: center; padding-top: 0; padding-bottom: 0; min-height: 40px; }
  .rrow.bb-ev .rcell, .rrow.bb-ev .num { padding-top: 0 !important; }
  @media (max-width: 639.98px) { .bb-g-price { padding: 0 var(--space-16); } }
  @media (pointer: coarse) { .rrow { padding-top: 2px; padding-bottom: 2px; } .rrow .rk, .rrow .bb-tech, .rrow .num { padding-top: 12px; } }
</style>
<script>if (location.search.includes('marks')) document.documentElement.classList.add('marks');
// Crop states show the page scrolled to its [data-scroll-to] row (the real page scrolls inside .shell-content).
function place() { for (const s of document.querySelectorAll('.state.crop')) { for (const r of s.querySelectorAll('.app-root')) r.style.height = innerHeight + 'px'; /* pixels, not vh: a picture taken beyond the screen re-measures vh */ const c = [...s.querySelectorAll('.shell-content')].find((x) => x.offsetParent); const a = c && [...c.querySelectorAll('[data-scroll-to]')].find((x) => x.offsetParent); if (c && a) c.scrollTop += a.getBoundingClientRect().top - c.getBoundingClientRect().top - 150; } }
addEventListener('load', place); addEventListener('resize', place);</script>
</head><body>
`;
function state({ id, caption, crop = false, page, overlay }) {
  const variants = ['pc', 'tablet', 'phone'].map((k) => `<div class="v-${k}">${shell(k, page(k), overlay ? overlay(k) : '')}</div>`).join('');
  return `<div class="wrap"><h2>${id}</h2><div class="state${crop ? ' crop' : ''}" data-state="${id}" data-caption="${caption.replace(/"/g, '&quot;')}">${variants}</div></div>\n`;
}
const adminPage = (inner) => (k) => `<div class="testing">${pageHead(true)}${VIEWONLY_ADMIN}<div role="tabpanel" class="tpanel">${inner(k)}</div></div>`;
const chartPage = (opts) => adminPage((k) => chartBlock(k, opts));
const end = '</body></html>\n';
const files = {};

files['C-admin-prices'] = head('C-admin-prices', 'States: the top of the tab with both cards, Edit prices, after saving (toast with Undo), Edit age groups.') +
  state({
    id: 'tab-top',
    caption: '<b>The top of “Chart and prices” (admins only).</b> Two cards in the look of Star testing’s Fees block: a title, a pencil, rows. <b>1 · Prices (all events)</b> and <b>2 · Age groups</b>. The board chart comes under them (next picture). Staff never see this tab.',
    page: adminPage(() => `${pricesCard()}${ageCard()}`),
  }) +
  state({
    id: 'prices-edit', crop: true,
    caption: '<b>Edit prices</b> (the pencil on the Prices card): a dialog like Star’s “Edit fees”, in dollars and cents, Cancel / Save, with the worked example read-only. On the phone it is a full-screen page with one full-width Save.',
    page: adminPage(() => `${pricesCard(false)}${ageCard(false)}`),
    overlay: (k) => dialog(k, { title: 'Edit prices', sub: 'All Board breaking events', body: pricesBody }),
  }) +
  state({
    id: 'prices-saved', crop: true,
    caption: '<b>After Save</b>: the dialog closes and the toast says “Prices saved” with <b>Undo</b> for 5 seconds, as Color belt’s Edit prices does. The card shows the new numbers at once. A failed save keeps the dialog open with the app’s amber “not saved” note (rule 3.5).',
    page: adminPage(() => `${pricesCard(false)}${ageCard(false)}`),
    overlay: () => toast('Prices saved'),
  }) +
  state({
    id: 'age-edit', crop: true,
    caption: '<b>Edit age groups</b> (the pencil on the Age groups card): one number box. “Teen / Adult” follows by itself (the number plus one).',
    page: adminPage(() => `${pricesCard(false)}${ageCard(false)}`),
    overlay: (k) => dialog(k, { title: 'Edit age groups', sub: 'All Board breaking events', body: ageBody, size: 'small' }),
  }) + end;

files['C-admin-chart'] = head('C-admin-chart', 'States: the whole tab with the chart, Edit rank, the ⋯ menu, Delete rank asks.') +
  state({
    id: 'chart',
    caption: '<b>The whole tab, as an admin sees it</b>: the two cards, then the <b>Board chart</b>. Four groups, each opens and closes like a class in Classes and ranks; a row = belt and rank · technique · Technical · Adult, a pencil and a ⋯ (Move up, Move down, Delete rank). “Add rank” ends each group. On the phone each row is a small card. The amber <b>“Differs from the printed chart”</b> tags are only here to help Jeffrey review (every row where the live page and the PDF disagree); they are not part of the screen.',
    page: adminPage((k) => `${pricesCard(false)}${ageCard(false)}${chartBlock(k)}`),
  }) +
  state({
    id: 'rank-edit', crop: true,
    caption: '<b>Edit rank</b> (the pencil on a row): rank name, technique, and a − n + stepper for each board count (the stepper Color belt’s Belt picker uses for end stripes). The group is fixed. <b>Add rank</b> opens the same dialog, empty, with the group named under the title.',
    page: chartPage({ anchorGroup: 'child', mark: false }),
    overlay: (k) => dialog(k, { title: 'Edit rank', sub: 'Child · Yellow', body: rankBody }),
  }) +
  state({
    id: 'rank-menu', crop: true,
    caption: '<b>The ⋯ menu</b> on a row: Move up, Move down, and <b>Delete rank</b> in red (red means delete, nothing else). PC and tablet: a small menu under the ⋯; phone: the bottom sheet.',
    page: chartPage({ anchorGroup: 'child', menuOn: 'child', mark: false }),
    overlay: (k) => (k === 'phone' ? sheetMenu : ''),
  }) +
  state({
    id: 'rank-delete', crop: true,
    caption: '<b>Delete rank asks first</b> (the shared “are you sure?” box, v1.008): the button that changes nothing says what stays and is on the left; the red action repeats the words. Admins only; staff never see the ⋯ menu.',
    page: chartPage({ anchorGroup: 'child', mark: false }),
    overlay: () => confirmBox,
  }) + end;

files['C-admin-staffview'] = head('C-admin-staffview', 'State: what staff see of the Board breaking page (only the Events tab).') +
  state({
    id: 'staff',
    caption: '<b>Staff (not an admin)</b>: the Board breaking page has only the <b>Events</b> tab; “Chart and prices” is not there at all, and nothing says “view only” because staff run the day. The list is a placeholder: the Events tab is drawn in its own picture.',
    page: (k) => `<div class="testing">${pageHead(false)}<div role="tabpanel" class="tpanel">${eventsList(k)}</div></div>`,
  }) + end;

for (const [name, html] of Object.entries(files)) writeFileSync(join(SRC, `${name}.src.html`), html);
console.log('wrote', Object.keys(files).join(', '));
