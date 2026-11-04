// mock-c10-cards.js — Camps design review C10 (rules v1.013, v1.014, v1.107, v1.115, v1.117), drawn ON TOP of
// the real preview page for a picture only. Nothing is saved, nothing in the app changes; a reload removes it.
// What it does: on a camp page, hides today's summary line (.cp-statline) and puts in its place
//   - "Updated …" on its own line, on the right, ABOVE the cards (as walkthrough picture 11b), and
//   - the REAL shared row of cards (src/components/CountCards.jsx), mounted with its own small React root
//     (as mock-c07-history.js mounts HistoryLine), with Camps' four cards:
//       Campers (all) · Coming <day> (filter) · To collect (filter, note = the money) · Payments recorded (total)
//     After the camp the Coming card becomes "Came" (a total: "142" / "of 150 days").
// The numbers come from the preview's own camp (loadCamp) worked out the way CampRoster.jsx works out
// today's line (payTag, toCollectCents, extraCountOnDay), unless a sample is given below.
// Options (window.__c10 before running):
//   mode: 'before' | 'day' | 'after'   which state to draw (default: what the camp's dates say)
//   day: '2027-04-21'                  'day' mode: the camp day that plays "today"
//   here: 9                            'day' mode: how many of today's campers are checked in (sample)
//   came: [142, 150]                   'after' mode: a sample instead of the real check-ins
//   allPaid: true                      To collect 0 / "All paid" (sample), Payments recorded grows by the money owed
//   selected: 'coming' | 'collect'     a filter card pressed: the blue edge, the gray "Showing … only · Show all"
//                                      line, and the roster's table rows that don't match hidden (PC table only)
//   hidden: true                       Hide private details on: only Campers and Coming (turn the real switch on
//                                      first, so the rest of the page is hidden too)
// Works in preview mode only (Vite serves the source files).
//   node shotx.mjs out.png --js "window.__c10={mode:'day',day:'2027-04-21',here:9,selected:'coming'}" --eval mock-c10-cards.js
(async () => {
  const cfg = window.__c10 || {};
  const stat = document.querySelector('.cp-statline');
  if (!stat) return 'open a camp page first';
  window.__c10root?.unmount();
  document.querySelectorAll('[data-mock=c10]').forEach((e) => e.remove());
  document.querySelectorAll('[data-mock-c10-hid]').forEach((e) => { e.style.display = ''; delete e.dataset.mockC10Hid; });

  // ----- The camp's numbers (as CampRoster.jsx counts them) -----
  const campId = location.hash.split('/')[2];
  const { loadCamp } = await import('/src/lib/camps/campsApi.js');
  const rules = await import('/src/lib/camps/campRules.js');
  const { formatMoney } = await import('/src/lib/money.js');
  const camp = await loadCamp(campId);
  const days = camp.days;
  const active = camp.roster.filter((r) => r.status === 'active');
  const comes = (row, dayId) => (row.days ?? []).some((d) => d.dayId === dayId);
  const today = cfg.day || camp.today;
  const mode = cfg.mode || (days.some((d) => d.day === today) ? 'day' : days.some((d) => d.day > today) ? 'before' : 'after');
  const dayLabel = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  let toCollect = active.filter((r) => rules.payTag(r) !== 'paid').length;
  let owed = rules.toCollectCents(active);
  let recorded = camp.roster.reduce((n, r) => n + (r.paidCents ?? 0), 0);
  if (cfg.allPaid) { recorded += owed; toCollect = 0; owed = 0; }

  const icons = await import(new URL((await (await fetch('/src/screens/camps/CampRoster.jsx')).text())
    .match(/from "(\/node_modules\/\.vite\/deps\/@tabler_icons-react\.js\?v=[^"]+)"/)[1], location.origin).href);

  let comingCard; let comingDay = null; let note = null;
  if (mode === 'after') {
    const came = cfg.came ?? [
      active.reduce((n, r) => n + (r.days ?? []).filter((d) => d.checkedInAt).length, 0),
      active.reduce((n, r) => n + (r.days ?? []).length, 0),
    ];
    comingCard = { key: 'came', Icon: icons.IconUserCheck, label: 'Came', value: String(came[0]), note: `of ${came[1]} ${came[1] === 1 ? 'day' : 'days'}`, kind: 'total' };
  } else {
    comingDay = mode === 'day' ? days.find((d) => d.day === today) : days.find((d) => d.day > today);
    const coming = active.filter((r) => comes(r, comingDay.dayId)).length;
    comingCard = mode === 'day'
      ? { key: 'coming', Icon: icons.IconCalendarEvent, label: 'Coming today', value: String(coming), note: `${cfg.here ?? 0} here`, kind: 'filter' }
      : { key: 'coming', Icon: icons.IconCalendarEvent, label: `Coming ${dayLabel(comingDay.day)}`, value: String(coming), kind: 'filter' };
    if (mode === 'day') {
      // The day's extras offered only on some days (the pizza party), each its own count.
      const lines = camp.extras.filter((e) => e.per === 'day' && (e.onlyOn ?? []).length > 0 && rules.extraOfferedOn(e, comingDay.day))
        .map((e) => `${e.name} today: ${rules.extraCountOnDay(active, e, comingDay.dayId, days)}`);
      note = lines.join(' · ') || null;
    }
  }
  const cards = [
    { key: 'all', Icon: icons.IconUsers, label: 'Campers', value: String(active.length), kind: 'all' },
    comingCard,
    { key: 'collect', Icon: icons.IconCircleX, label: 'To collect', value: String(toCollect), note: toCollect === 0 ? 'All paid' : formatMoney(owed), kind: 'filter' },
    { key: 'recorded', Icon: icons.IconSum, label: 'Payments recorded', value: formatMoney(recorded), kind: 'total' },
  ].filter((c) => !cfg.hidden || c.key === 'all' || c.key === 'coming' || c.key === 'came');

  const selected = cfg.selected ?? null;
  const showingText = selected === 'coming'
    ? (mode === 'day' ? 'Showing coming today only' : `Showing coming ${dayLabel(comingDay.day)} only`)
    : 'Showing to collect only';

  // ----- Draw -----
  const mainSrc = await (await fetch('/src/main.jsx')).text();
  const reactUrl = mainSrc.match(/from "(\/node_modules\/\.vite\/deps\/react\.js\?v=[^"]+)"/)?.[1]
    ?? (await (await fetch('/src/screens/camps/CampRoster.jsx')).text()).match(/from "(\/node_modules\/\.vite\/deps\/react\.js\?v=[^"]+)"/)[1];
  const React = (await import(reactUrl)).default;
  const clientUrl = mainSrc.match(/from "(\/node_modules\/\.vite\/deps\/react-dom_client\.js\?v=[^"]+)"/)[1];
  const clientMod = await import(clientUrl);
  const createRoot = clientMod.createRoot || clientMod.default.createRoot;
  const CountCards = (await import('/src/components/CountCards.jsx')).default;

  const updated = stat.querySelector('.cp-updated');
  stat.style.display = 'none';
  stat.dataset.mockC10Hid = '1';
  const wrap = document.createElement('div');
  wrap.dataset.mock = 'c10';
  const up = document.createElement('div');
  up.className = 'c10-updated';
  up.style.cssText = 'display:flex;justify-content:flex-end;margin:0 0 var(--space-4)';
  if (updated) up.append(updated.cloneNode(true));
  const holder = document.createElement('div');
  wrap.append(up, holder);
  stat.after(wrap);
  window.__c10root = createRoot(holder);
  window.__c10root.render(React.createElement(CountCards, {
    cards, selected, onSelect: () => {}, showingText, note,
  }));
  await new Promise((r) => setTimeout(r, 400));

  // ----- The filter on the roster (PC / tablet table): hide the rows that don't match -----
  let hiddenRows = 0;
  if (selected) {
    const table = document.querySelector('.cp-rtable-wrap table') || document.querySelector('.cp-rtable-wrap');
    const heads = [...table.querySelectorAll('thead th, [role=columnheader]')].map((th) => th.innerText.trim());
    const dayHead = comingDay ? new Date(`${comingDay.day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }) : '';
    const dayIndex = heads.findIndex((h) => h.replace(/\s+/g, ' ') === dayHead || h.replace(/\s+/g, ' ') === dayHead.split(' ').reverse().join(' '));
    const paidIndex = heads.findIndex((h) => h === 'Paid');
    for (const tr of table.querySelectorAll('tbody tr')) {
      const cells = tr.children;
      const out = selected === 'coming'
        ? dayIndex >= 0 && cells[dayIndex] && cells[dayIndex].innerText.trim() === '—'
        : paidIndex >= 0 && cells[paidIndex] && cells[paidIndex].innerText.trim() === 'Paid';
      if (out) { tr.style.display = 'none'; tr.dataset.mockC10Hid = '1'; hiddenRows++; }
    }
    if (dayIndex < 0 && selected === 'coming') return `day column ${dayHead} not found in ${heads.join('|')}`;
  }
  const r = wrap.getBoundingClientRect();
  const s = document.querySelector('.cp-search')?.getBoundingClientRect();
  return `mode ${mode} · cards ${[r.x, r.y, r.width, r.height].map(Math.round).join(',')} · search ${s ? Math.round(s.y) : '-'} · rows hidden ${hiddenRows} · ${cards.map((c) => `${c.label}=${c.value}${c.note ? `(${c.note})` : ''}`).join(' ')}${note ? ` · note ${note}` : ''}`;
})();
