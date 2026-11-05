// mock-x1-roster-extras.js — Camps: Early drop-off and Late pick-up on the roster (Jeffrey 2026-11-04: "We
// have Early Drop Off and Late Pick-Up always and we need to see on the roster"). Drawn ON TOP of the real
// preview camp page for a picture only. Nothing is saved, nothing in the app changes; a reload removes it.
// What it draws (window.__x1 = { option: 'A' | 'B' } before running):
//   both options  the cards' gray line gets a count of every per-day extra for the Coming card's day:
//                 "Mon, Apr 19 · Early drop-off: 6 · Late pick-up: 8" (on a camp day "Today · …", where
//                 today's "Pizza party today: 11" joins the same line).
//   option A      small marks INSIDE each signed-up day box, every day of the week: a sunrise for Early
//                 drop-off, a sunset for Late pick-up (picked by the extra's first word, Early / Late); the
//                 legend under the grid adds both icons with their words.
//   option B      words under the camper's name for the Coming card's day only ("Early drop-off · Late
//                 pick-up"), in place of today's single amber note.
// The marks come from the preview's own camp (loadCamp): each camper's chosen per-day extras.
// Works in preview mode only (Vite serves the source files).
//   node shotx.mjs out.png --js "window.__x1={option:'A'}" --eval mock-x1-roster-extras.js
(async () => {
  const cfg = window.__x1 || {};
  const option = cfg.option || 'A';
  if (!document.querySelector('.cp-rtable, .cp-rcards')) return 'open a camp page first';
  document.querySelectorAll('[data-mock=x1]').forEach((e) => e.remove());
  document.querySelectorAll('[data-mock-x1-hid]').forEach((e) => { e.style.display = ''; delete e.dataset.mockX1Hid; });

  // ----- The camp -----
  const campId = location.hash.split('/')[2];
  const { loadCamp } = await import('/src/lib/camps/campsApi.js');
  const camp = await loadCamp(campId);
  const days = camp.days;
  const active = camp.roster.filter((r) => r.status === 'active');
  const today = cfg.day || camp.today;
  const cardDay = days.find((d) => d.day === today) || days.find((d) => d.day > today) || days[days.length - 1];
  const isToday = cardDay.day === today;
  const dayLabel = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const short = (name) => String(name).split(',')[0].trim(); // "Early drop-off, 7:30–9:00 AM" → "Early drop-off"
  // Extras offered every day, one mark each: Early → sunrise, Late → sunset.
  const everyDay = camp.extras.filter((e) => e.per === 'day' && (e.onlyOn ?? []).length === 0).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  const kindOf = (e) => (/^early\b/i.test(e.name) ? 'early' : /^late\b/i.test(e.name) ? 'late' : 'other');
  // The word in the day box: the extra's first word ("Early drop-off, 7:30–9:00 AM" → "Early").
  const firstWord = (e) => { const w = short(e.name).split(/\s+/)[0]; return w.charAt(0).toUpperCase() + w.slice(1); };
  const has = (row, extraId, dayId) => (row.extras ?? []).some((x) => x.extraId === extraId && x.dayId === dayId);

  // ----- Icons: render the real Tabler icons once, then copy the SVGs -----
  const rosterSrc = await (await fetch('/src/screens/camps/CampRoster.jsx')).text();
  const iconsUrl = rosterSrc.match(/from "(\/node_modules\/\.vite\/deps\/@tabler_icons-react\.js\?v=[^"]+)"/)[1];
  const icons = await import(iconsUrl);
  const mainSrc = await (await fetch('/src/main.jsx')).text();
  const React = (await import(mainSrc.match(/from "(\/node_modules\/\.vite\/deps\/react\.js\?v=[^"]+)"/)[1])).default;
  const clientMod = await import(mainSrc.match(/from "(\/node_modules\/\.vite\/deps\/react-dom_client\.js\?v=[^"]+)"/)[1]);
  const createRoot = clientMod.createRoot || clientMod.default.createRoot;
  const box = document.createElement('div');
  box.style.cssText = 'position:absolute;left:-999px;top:0';
  document.body.append(box);
  const root = createRoot(box);
  root.render(React.createElement('div', null,
    React.createElement(icons.IconSunrise, { size: 14, 'data-k': 'early', 'aria-hidden': 'true' }),
    React.createElement(icons.IconSunset2, { size: 14, 'data-k': 'late', 'aria-hidden': 'true' }),
    React.createElement(icons.IconCirclePlus, { size: 14, 'data-k': 'other', 'aria-hidden': 'true' })));
  await new Promise((r) => setTimeout(r, 300));
  const svg = (k) => box.querySelector(`[data-k=${k}]`).cloneNode(true);
  const style = document.createElement('style');
  style.dataset.mock = 'x1';
  style.textContent = `
    .x1-marks{display:flex;flex-wrap:wrap;justify-content:center;column-gap:6px;margin-top:2px;color:var(--color-blue);font-size:var(--text-12);font-weight:500;line-height:1.3}
    .cp-rdays .x1-marks{flex-direction:column;align-items:flex-start;margin-top:1px}
    .x1-names{display:block;margin-top:2px;color:var(--color-blue);font-size:var(--text-12);line-height:1.35}
    .x1-names svg{vertical-align:-2px;margin-right:2px}
    .x1-legend svg{vertical-align:-2px;margin-right:2px;color:var(--color-blue)}`;
  document.head.append(style);

  // ----- The counts line under the cards -----
  const counts = everyDay.map((e) => `${short(e.name)}: ${active.filter((r) => has(r, e.extraId, cardDay.dayId)).length}`);
  const someDays = isToday
    ? camp.extras.filter((e) => e.per === 'day' && (e.onlyOn ?? []).length > 0 && active.some((r) => has(r, e.extraId, cardDay.dayId)))
      .map((e) => `${short(e.name)}: ${active.filter((r) => has(r, e.extraId, cardDay.dayId)).length}`)
    : [];
  const lineText = [isToday ? 'Today' : dayLabel(cardDay.day), ...counts, ...someDays].join(' · ');
  const oldNote = document.querySelector('.cards-note');
  if (oldNote) { oldNote.style.display = 'none'; oldNote.dataset.mockX1Hid = '1'; }
  const cards = document.querySelector('.ev-cards');
  const line = document.createElement('p');
  line.className = 'cards-note';
  line.dataset.mock = 'x1';
  line.textContent = lineText;
  cards.after(line);

  // ----- Option A: marks in every signed-up day box -----
  const byId = Object.fromEntries(camp.roster.map((r) => [r.id, r]));
  let marked = 0;
  if (option === 'A') {
    for (const cell of document.querySelectorAll('[data-day-cell]')) {
      const [rowId, dayId] = cell.dataset.dayCell.split(':');
      const row = byId[rowId];
      const mine = everyDay.filter((e) => has(row, e.extraId, dayId));
      if (!mine.length) continue;
      const marks = document.createElement('span');
      marks.className = 'x1-marks';
      marks.dataset.mock = 'x1';
      for (const e of mine) {
        const w = document.createElement('span');
        w.textContent = firstWord(e);
        marks.append(w);
      }
      if (cell.closest('.cp-rdays')) cell.append(marks); // phone: inside the day box, under the time
      else cell.after(marks); // PC / tablet: under the button, in the same day column
      marked++;
    }
    // The legend under the grid: each word with what it means ("Early = early drop-off").
    const legend = [...document.querySelectorAll('p')].find((p) => /came \(check-in time\)/.test(p.textContent));
    if (legend) {
      const add = document.createElement('span');
      add.className = 'x1-legend';
      add.dataset.mock = 'x1';
      for (const e of everyDay) {
        const b = document.createElement('b');
        b.style.cssText = 'color:var(--color-blue);font-weight:500';
        b.textContent = firstWord(e);
        add.append(' · ', b, ` ${short(e.name).toLowerCase()}`);
      }
      legend.append(add);
    }
  }

  // ----- Option B: words under the name, for the cards' day only -----
  if (option === 'B') {
    document.querySelectorAll('.cp-rnote').forEach((n) => { n.style.display = 'none'; n.dataset.mockX1Hid = '1'; });
    for (const row of active) {
      const mine = everyDay.filter((e) => has(row, e.extraId, cardDay.dayId));
      if (!mine.length) continue;
      const anchor = document.querySelector(`[data-nav-row="${row.id}"]`);
      const host = anchor?.closest('th, .cp-rcard-top') ?? null;
      if (!host) continue;
      const words = document.createElement('span');
      words.className = 'x1-names';
      words.dataset.mock = 'x1';
      words.textContent = mine.map((e) => short(e.name)).join(' · ');
      if (host.classList.contains('cp-rcard-top')) host.after(words); else host.append(words);
      marked++;
    }
  }
  await new Promise((r) => setTimeout(r, 200));
  return `option ${option} · day ${cardDay.day}${isToday ? ' (today)' : ''} · line "${lineText}" · marked ${marked}`;
})();
