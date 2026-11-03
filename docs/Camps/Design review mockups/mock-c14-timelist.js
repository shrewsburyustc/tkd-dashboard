// mock-c14-timelist.js — Camps design review C14 (rule v1.019, v1.109), drawn ON TOP of the real preview page for
// a picture only: Add / Edit camp → Times section's Starts and Ends (today the browser's own <select>,
// 6:00 AM–9:00 PM) covered by the REAL shared time list (src/components/TimeList.jsx, 6:00 AM–10:00 PM every
// 5 minutes by default), mounted next to each box with its own small React root (as mock-c13-datepicker.js
// does), so the picture is exactly the shared part. The <select> itself is only hidden.
//   window.__c14 = { open: 0 }      index of the list to open (0 = Starts, 1 = Ends), or null
//   window.__c14 = { open: 1, end: true }   … and scroll the open list to its last times (to show 10:00 PM)
// Closing the dialog removes it. Works in preview mode only (Vite serves the source files).
// Run with Add / Edit camp's Times section on screen:
//   node shotx.mjs out.png --js "window.__c14={open:1}" --eval mock-c14-timelist.js
(async () => {
  const cfg = window.__c14 || {};
  const dialog = [...document.querySelectorAll('.dialog, [role=dialog]')].pop();
  if (!dialog) return 'open Add / Edit camp first';
  // The same React the app uses: read its address from the transformed TimeList file.
  const src = await (await fetch('/src/components/TimeList.jsx')).text();
  const reactUrl = src.match(/from "(\/node_modules\/\.vite\/deps\/react\.js\?v=[^"]+)"/)[1];
  const React = (await import(reactUrl)).default;
  const mainSrc = await (await fetch('/src/main.jsx')).text();
  const clientUrl = mainSrc.match(/from "(\/node_modules\/\.vite\/deps\/react-dom_client\.js\?v=[^"]+)"/)[1];
  const clientMod = await import(clientUrl);
  const createRoot = clientMod.createRoot || clientMod.default.createRoot; // a CommonJS package: under default
  const TimeList = (await import('/src/components/TimeList.jsx')).default;
  const selects = [...dialog.querySelectorAll('select.cp-time')].filter((s) => !s.dataset.mockC14);
  selects.forEach((select) => {
    select.dataset.mockC14 = '1';
    select.style.display = 'none';
    const holder = document.createElement('div');
    holder.dataset.mock = 'c14';
    select.after(holder);
    // The label points at the field (as TimesSection would pass labelId).
    const label = dialog.querySelector(`label[for="${select.id}"]`);
    if (label && !label.id) label.id = `${select.id}-label`;
    function Field() {
      const [value, setValue] = React.useState(select.value);
      return React.createElement(TimeList, { id: `${select.id}-mock`, labelId: label?.id, value, onChange: setValue });
    }
    createRoot(holder).render(React.createElement(Field));
  });
  await new Promise((r) => setTimeout(r, 300));
  const fields = [...dialog.querySelectorAll('[data-mock=c14] [role=combobox]')];
  // Close a list left open by an earlier run (Esc on its field closes the list only).
  for (const f of fields) {
    if (f.getAttribute('aria-expanded') === 'true') f.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }
  await new Promise((r) => setTimeout(r, 150));
  if (cfg.open != null && fields[cfg.open]) {
    fields[cfg.open].scrollIntoView({ block: 'center', behavior: 'instant' });
    await new Promise((r) => setTimeout(r, 150));
    fields[cfg.open].click();
    await new Promise((r) => setTimeout(r, 400));
    if (cfg.end) {
      const list = document.getElementById(fields[cfg.open].getAttribute('aria-controls'));
      if (list) list.scrollTop = list.scrollHeight;
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  return `time lists: ${fields.length}`;
})()
