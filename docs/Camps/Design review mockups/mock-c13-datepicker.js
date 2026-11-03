// mock-c13-datepicker.js — Camps design review C13 (rule v1.018), drawn ON TOP of the real preview page for a
// picture only: every browser date box (input[type=date]) in the open dialog is covered by the REAL shared
// date picker (src/components/DatePicker.jsx, Star's), mounted next to it with its own small React root, so the
// picture is exactly the shared part. The box itself is only hidden. The camp-days calendar is not touched.
//   window.__c13 = { today: '2027-04-21', open: 0 }   open = index of the picker to open (or null)
// Each picker gets the field's label, value, min / max, the Year list around the value, and inline on phones
// (as Star does). Closing the dialog removes it. Works in preview mode only (Vite serves the source files).
// Run with Add / Edit camp (section 2 open) or Edit payment open:
//   node shotx.mjs out.png --js "window.__c13={…}" --eval mock-c13-datepicker.js
(async () => {
  const cfg = window.__c13 || {};
  const dialog = [...document.querySelectorAll('.dialog, [role=dialog]')].pop();
  if (!dialog) return 'open the dialog first';
  // The same React the app uses: read its address from the transformed DatePicker file.
  const src = await (await fetch('/src/components/DatePicker.jsx')).text();
  const reactUrl = src.match(/from "(\/node_modules\/\.vite\/deps\/react\.js\?v=[^"]+)"/)[1];
  const React = (await import(reactUrl)).default;
  const mainSrc = await (await fetch('/src/main.jsx')).text();
  const clientUrl = mainSrc.match(/from "(\/node_modules\/\.vite\/deps\/react-dom_client\.js\?v=[^"]+)"/)[1];
  const clientMod = await import(clientUrl);
  const createRoot = clientMod.createRoot || clientMod.default.createRoot; // a CommonJS package: under default
  const DatePicker = (await import('/src/components/DatePicker.jsx')).default;
  const inline = window.innerWidth < 768;
  const year = (iso) => Number((iso || cfg.today).slice(0, 4));
  const inputs = [...dialog.querySelectorAll('input[type=date]')].filter((i) => !i.dataset.mockC13);
  inputs.forEach((input, n) => {
    input.dataset.mockC13 = '1';
    input.style.display = 'none';
    const holder = document.createElement('div');
    holder.dataset.mock = 'c13';
    input.after(holder);
    const label = dialog.querySelector(`label[for="${input.id}"]`)?.textContent || 'Date';
    function Picker() {
      const [value, setValue] = React.useState(input.value);
      return React.createElement(DatePicker, {
        id: `${input.id}-mock`, label, value, today: cfg.today, min: input.min || null, max: input.max || null,
        years: [year(input.value) - 1, year(input.value), year(input.value) + 1], inline, onChange: setValue,
      });
    }
    createRoot(holder).render(React.createElement(Picker));
  });
  await new Promise((r) => setTimeout(r, 300));
  if (cfg.open != null) {
    const button = dialog.querySelectorAll('[data-mock=c13] button')[cfg.open];
    button?.click();
    await new Promise((r) => setTimeout(r, 300));
  }
  return `pickers: ${inputs.length}`;
})()
