// mock-c07-history.js — Camps design review C7 (rule v1.010, v1.108; Star's CandidateHistory.jsx as the model),
// drawn ON TOP of the real preview page for a picture only. Nothing is read from a history (Camps has no
// reader yet — that is C7's migration) and nothing is saved.
// What it does: Camper detail must be open. It adds a part after the "Sign-up" line (before "More" on touch)
// holding the REAL shared line (src/components/HistoryLine.jsx), mounted with its own small React root (as
// mock-c11-link.js mounts RegistrationLinkBox). Its rows are a SAMPLE history for Jack Rivera written in the
// proposed words (matching his preview data: signed up Oct 9, one $186 check on Oct 13),
// with his real reference from camp_camper_detail. describe() leaves money rows out while hidden, as Star's.
// Options (window.__c07 before running):
//   open: true       press the line, so the list shows
//   hidden: true     Hide private details on (money rows left out, the gray line); turn the real switch on
//                    first so the rest of Camper detail is hidden too
//   empty: true      no rows → "History · no changes yet"
//   scroll: true     scroll the detail so the History part is in view
// Works in preview mode only (Vite serves the source files).
//   node shotx.mjs out.png --js "window.__c07={open:true}" --eval mock-c07-history.js
(async () => {
  const cfg = window.__c07 || {};
  const dialog = [...document.querySelectorAll('[role=dialog]')].find((d) => d.querySelector('.cp-signup-line'));
  if (!dialog) return 'open Camper detail first';
  window.__c07root?.unmount();
  dialog.querySelectorAll('[data-mock=c07]').forEach((e) => e.remove());
  // The Sign-up line is the LAST .cp-signup-line (the hidden Payments line uses the same class).
  const lines = dialog.querySelectorAll('.cp-signup-line');
  const signup = lines[lines.length - 1];
  const ref = (signup.textContent.match(/CP-\d+/) || ['CP-4409'])[0];

  // The proposed words, newest last here (the line sorts newest first itself).
  const rows = cfg.empty ? [] : [
    { at: '2026-10-09T14:05:00Z', who: 'Family form', text: `Signed up on the family form · ${ref}` },
    { at: '2026-10-11T15:20:00Z', who: 'Dana Ross', text: 'Days: Wed, Nov 25 → Wed, Nov 25 · Fri, Nov 27' },
    { at: '2026-10-12T13:40:00Z', who: 'Jeffrey Berg', text: 'Parent phone: (508) 555-0141 → (508) 555-0109 (whole family)' },
    { at: '2026-10-13T15:58:00Z', who: 'Jeffrey Berg', money: true, text: 'Paying by: Cash → Check' },
    { at: '2026-10-13T16:00:00Z', who: 'Jeffrey Berg', money: true, text: 'Marked paid $186 check' },
  ];

  const src = await (await fetch('/src/components/HistoryLine.jsx')).text();
  const reactUrl = src.match(/from "(\/node_modules\/\.vite\/deps\/react\.js\?v=[^"]+)"/)[1];
  const React = (await import(reactUrl)).default;
  const mainSrc = await (await fetch('/src/main.jsx')).text();
  const clientUrl = mainSrc.match(/from "(\/node_modules\/\.vite\/deps\/react-dom_client\.js\?v=[^"]+)"/)[1];
  const clientMod = await import(clientUrl);
  const createRoot = clientMod.createRoot || clientMod.default.createRoot;
  const HistoryLine = (await import('/src/components/HistoryLine.jsx')).default;

  // Placed after the Sign-up line; on touch that is just before "More".
  const holder = document.createElement('div');
  holder.dataset.mock = 'c07';
  holder.style.marginTop = 'var(--space-16, 16px)';
  signup.after(holder);
  window.__c07root = createRoot(holder);
  window.__c07root.render(React.createElement(HistoryLine, {
    load: async () => rows,
    describe: (row, { hidden }) => (hidden && row.money ? { hiddenPayment: true } : { text: row.text, at: row.at, who: row.who }),
    hidden: Boolean(cfg.hidden),
  }));
  await new Promise((r) => setTimeout(r, 400));
  if (cfg.open) {
    holder.querySelector('button')?.click();
    await new Promise((r) => setTimeout(r, 300));
  }
  if (cfg.scroll) {
    holder.scrollIntoView({ block: cfg.open ? 'end' : 'center' });
    if (cfg.open) {
      // Open: scroll the detail's own scrolling part to its end, so the list's last line clears the buttons.
      let box = holder.parentElement;
      while (box && box.scrollHeight <= box.clientHeight + 1) box = box.parentElement;
      if (box) box.scrollTop = box.scrollHeight;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  const r = holder.getBoundingClientRect();
  const more = [...dialog.querySelectorAll('.cp-detail-head')].find((h) => h.textContent === 'More');
  const m = more?.getBoundingClientRect();
  return `history ${[r.x, r.y, r.width, r.height].map(Math.round).join(',')}${m ? ` more ${Math.round(m.y)}` : ''}`;
})();
