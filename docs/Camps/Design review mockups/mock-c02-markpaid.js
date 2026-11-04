// mock-c02-markpaid.js — Camps design review C2 (rule v1.001, v1.104), drawn ON TOP of the real preview page
// for a picture only. Nothing is pressed for real or saved.
// What it does: the camp page must be open on the roster. It hides today's small box (if open) and mounts the
// REAL shared box (src/components/MarkPaidBox.jsx) with its own small React root (as mock-c11-link.js mounts
// RegistrationLinkBox), under the camper's "$X due" / "Owes $X" tag, filled from the preview's own camp
// (loadCamp): the camper's name, what they owe, and their Paying by as the family's choice.
// Options (window.__c02 before running):
//   camper: 'Mia Rossi'       whose tag (default Mia Rossi)
//   where: 'form' | 'desk'    the hint's ending: "… on the form." / "… at the desk."
//   choice: 'cash'|'check'|'card'   draw as if Paying by were this (e.g. after a change at the desk)
//   scroll: n                phones: bring the row to the middle of the screen, then scroll n pixels more
//   pick: 'cash'|'check'|'card'   press that way in Paid by after the box opens (one tap picks another way)
// Works in preview mode only (Vite serves the source files).
//   node shotx.mjs out.png --js "window.__c02={pick:'card'}" --eval mock-c02-markpaid.js
(async () => {
  const cfg = { camper: 'Mia Rossi', where: 'form', ...(window.__c02 || {}) };
  const tag = [...document.querySelectorAll('.cp-paybtn')].find((b) => (b.getAttribute('aria-label') || '').startsWith(`${cfg.camper}:`));
  if (!tag) return `no pay tag for ${cfg.camper}`;
  if (cfg.scroll) {
    // Phones: bring the row to the middle of the screen, then scroll cfg.scroll pixels more.
    tag.scrollIntoView({ block: 'center' });
    window.scrollBy(0, cfg.scroll);
    await new Promise((r) => setTimeout(r, 300));
  }
  document.querySelectorAll('.cp-popover').forEach((e) => { e.style.display = 'none'; });
  // The box draws itself into <body> (a portal), so an earlier run is unmounted, not just removed.
  window.__c02root?.unmount();
  document.querySelectorAll('[data-mock=c02]').forEach((e) => e.remove());

  // The camper's row from the preview's own camp.
  const campId = location.hash.split('/').pop();
  const { loadCamp } = await import('/src/lib/camps/campsApi.js');
  const camp = await loadCamp(campId);
  const all = camp.roster ?? [];
  const row = all.find((c) => `${c.firstName} ${c.lastName}` === cfg.camper);
  if (!row) return `camper ${cfg.camper} not in loadCamp (keys: ${Object.keys(camp).join(',')})`;
  const owes = row.owesCents ?? (row.totalCents ?? 0) - (row.paidCents ?? 0);

  const src = await (await fetch('/src/components/MarkPaidBox.jsx')).text();
  const reactUrl = src.match(/from "(\/node_modules\/\.vite\/deps\/react\.js\?v=[^"]+)"/)[1];
  const React = (await import(reactUrl)).default;
  const mainSrc = await (await fetch('/src/main.jsx')).text();
  const clientUrl = mainSrc.match(/from "(\/node_modules\/\.vite\/deps\/react-dom_client\.js\?v=[^"]+)"/)[1];
  const clientMod = await import(clientUrl);
  const createRoot = clientMod.createRoot || clientMod.default.createRoot;
  const MarkPaidBox = (await import('/src/components/MarkPaidBox.jsx')).default;
  const holder = document.createElement('div');
  holder.dataset.mock = 'c02';
  document.body.append(holder);
  window.__c02root = createRoot(holder);
  window.__c02root.render(React.createElement(MarkPaidBox, {
    anchor: tag,
    name: cfg.camper,
    amountCents: owes,
    familyChoice: cfg.choice || row.payingBy,
    choiceWhere: cfg.where,
    onMarkPaid: () => {},
    onClose: () => {},
  }));
  await new Promise((r) => setTimeout(r, 400));
  if (cfg.pick) {
    const label = { cash: 'Cash', check: 'Check', card: 'Card' }[cfg.pick];
    const b = [...document.querySelectorAll('.mpb-field button, .mpb-field [role=radio]')].find((x) => x.textContent.trim() === label);
    if (b) b.click();
    await new Promise((r) => setTimeout(r, 200));
  }
  const box = document.querySelector('.mpb-field')?.closest('[role=dialog]') || document.querySelector('.mpb-field')?.parentElement;
  const r = box?.getBoundingClientRect();
  const t = tag.getBoundingClientRect();
  return `box ${r ? [r.x, r.y, r.width, r.height].map(Math.round).join(',') : '?'} tag ${[t.x, t.y, t.width, t.height].map(Math.round).join(',')} choice ${row.payingBy} owes ${owes}`;
})();
