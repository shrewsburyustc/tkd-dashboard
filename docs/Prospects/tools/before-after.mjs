// before-after.mjs — before-and-after pictures of the merged Prospects | Forms section (Jeffrey 2026-11-17).
// "Before" is a copy of the code from before the merge running on one preview address, "after" the built work on
// another; both are the fake-data preview (`npm run dev:preview-mode`), never the live database. A hidden Chrome signs
// in, opens each page at the four review sizes and takes real screenshots; they are laid out on PNG sheets.
//
// Usage: node before-after.mjs <before address> <after address> <outdir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..', '..');
const { withChrome, SIZES } = await import(pathToFileURL(join(repo, 'docs', 'Dashboard Core', 'tools', 'chrome.mjs')).href);
const [beforeBase, afterBase, outArg] = process.argv.slice(2);
if (!beforeBase || !afterBase || !outArg) {
  console.error('Usage: node before-after.mjs <before address> <after address> <outdir>');
  process.exit(1);
}
const outdir = resolve(outArg);
mkdirSync(outdir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slash = (a) => a.replace(/\/?$/, '/');

await withChrome(async (tab) => {
  await tab.cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  const ev = (js) => tab.evaluate(js);
  async function openApp(base, hash) {
    await tab.open('about:blank', 0);
    await tab.open(`${slash(base)}#${hash}`, 300);
    for (let i = 0; i < 60; i += 1) {
      const where = await ev(`document.querySelector('.shell:not([hidden])') ? 'shell' : document.getElementById('signin-email') ? 'signin' : 'wait'`);
      if (where === 'shell') break;
      if (where === 'signin') {
        await ev(`(() => {
          const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          for (const [id, value] of [['signin-email', 'preview@example.com'], ['signin-password', 'preview']]) {
            const input = document.getElementById(id); set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true }));
          }
          [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Sign in').click();
        })()`);
        await sleep(1500);
      }
      await sleep(150);
    }
    await sleep(1400);
    await ev(`[...document.querySelectorAll('.topbar [role=radio], .topbar button')].find((b) => b.textContent.trim() === 'Worcester')?.click()`);
    await sleep(1200);
  }
  // the screen as it is, at a size → a PNG buffer
  const shoot = async (size) => tab.shot({ x: 0, y: 0, width: size.w, height: size.h }, { beyond: false });

  const WIDTHS = { pc: 720, tablet: 440, phone: 230, small: 190 };
  const png64 = (buf) => `data:image/png;base64,${buf.toString('base64')}`;
  const CSS = `body { margin:0; font: 14px/1.45 system-ui,'Segoe UI',sans-serif; color:#1a1a1a; background:#f4f5f7; } .wrap { padding: 28px 32px 36px; }
    h1 { font-size: 24px; margin: 0 0 4px; } h2 { font-size: 17px; margin: 22px 0 2px; } p { margin: 4px 0 8px; max-width: 980px; }
    .pics { display:flex; flex-wrap:wrap; gap:16px; align-items:flex-start; margin: 8px 0 14px; } figure { margin:0; } figcaption { font-size:11px; color:#555; margin-top:4px; }
    img { border:1px solid #c9ccd3; display:block; }`;
  const row = (shots, label) => `<div class="pics">${shots.map(({ size, buf }) => `<figure><img src="${png64(buf)}" width="${WIDTHS[size.name]}"><figcaption>${label} · ${size.label}</figcaption></figure>`).join('')}</div>`;
  async function sheet(name, html) {
    const file = join(outdir, `${name}.html`);
    writeFileSync(file, `<!doctype html><meta charset="utf-8"><style>${CSS}</style><div class="wrap">${html}</div>`);
    await tab.size({ w: 1750, h: 900, touch: false, scale: 1.5 });
    await tab.open(pathToFileURL(file).href, 500);
    writeFileSync(join(outdir, `${name}.png`), await tab.shot({ x: 0, y: 0, width: 1750, height: await tab.height() }));
  }
  async function series(base, hash, prepare) {
    const out = [];
    for (const size of SIZES) {
      await tab.size({ w: size.w, h: size.h, touch: size.touch, scale: 1 });
      await openApp(base, hash);
      if (prepare) await prepare(size);
      out.push({ size, buf: await shoot(size) });
    }
    return out;
  }
  const pickVisitor = async (size) => {
    await ev(`document.querySelector('[data-forms-filter]').click()`);
    await sleep(400);
    await ev(`[...document.querySelectorAll('[role=menuitemcheckbox]')].find((r) => r.textContent.includes('Visitor Information')).click()`);
    await sleep(500);
    void size;
  };

  const beforeP = await series(beforeBase, 'prospects');
  const afterP = await series(afterBase, 'prospects');
  await sheet('Before-After-1-Prospects-tab', `<h1>Before / after — the Prospects tab</h1>
<p><b>Before:</b> two rail entries (Forms and Prospects), no tabs. <b>After:</b> one entry, Prospects, with two tabs under the title (Prospects selected), and the new Forms button beside "Find a prospect". (The after pictures have made-up sample forms, so the button shows; the before data has one form only.)</p>
<h2>Before</h2>${row(beforeP, 'Before')}<h2>After</h2>${row(afterP, 'After')}`);

  const beforeF = await series(beforeBase, 'forms');
  const afterF = await series(afterBase, 'prospects/forms');
  await sheet('Before-After-2-Forms-tab', `<h1>Before / after — the Forms screen</h1>
<p><b>Before:</b> its own page titled "Forms", reached from its own rail entry. <b>After:</b> the second tab of Prospects: same list, same buttons, now under the title "Prospects" and the two tabs. <code>#forms</code> bookmarks open it.</p>
<h2>Before</h2>${row(beforeF, 'Before')}<h2>After</h2>${row(afterF, 'After')}`);

  const open = await series(afterBase, 'prospects', async () => {
    await ev(`document.querySelector('[data-forms-filter]').click()`);
    await sleep(500);
  });
  const applied = await series(afterBase, 'prospects', async (size) => {
    await pickVisitor(size);
    await ev(`document.querySelector('[data-forms-filter]').click()`); // close the menu
    await sleep(500);
  });
  await sheet('Before-After-3-Form-filter', `<h1>After — the form filter, open and applied</h1>
<p>Real screens (no "before": the filter is new). <b>Open:</b> tick one form, several, or "All forms"; each form shows how many prospects it has. <b>Applied (Visitor Information):</b> the button is blue, the gray line says "Showing 2 of N prospects from Visitor Information · Show all", and the stage numbers, List and Board count only those two children.</p>
<h2>Open</h2>${row(open, 'Open')}<h2>Applied</h2>${row(applied, 'Applied')}`);
  console.log('wrote Before-After-1/2/3');
});
