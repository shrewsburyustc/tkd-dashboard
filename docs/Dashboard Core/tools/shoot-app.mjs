// shoot-app.mjs — takes the "before" / "after" pictures of the real app (preview mode, fake data)
// at the four review sizes, so step 1 can prove that nothing on screen changed (brief, "How to
// work" 3 and 5).
// Why: step 1 moves shared words, styles and helpers to new homes. The pictures taken before any
// app file changes and again after must match; compare them with compare-app.mjs.
// How: a hidden Chrome (chrome.mjs) signs in to the preview with its test password ("preview"; the
// preview's fake database accepts any email), then opens each screen by its "#…" address, at each
// size. Pages are pictured whole (top to bottom); a box that opens over the page is pictured as the
// screen shows it. A fresh Chrome profile every run, so the fake data starts the same each time.
//
// Usage: node shoot-app.mjs <preview address, e.g. http://localhost:5190/> <outdir> [screen@size …]
//   With no names it takes every picture; with names (e.g. menu@pc edit@tablet) only those, to take
//   one again.
// Only ever point it at `npm run dev:preview-mode` (or a preview-mode build): never the live database.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { withChrome, SIZES } from './chrome.mjs';

const [base, outArg, ...only] = process.argv.slice(2);
if (!base || !outArg) {
  console.error('Usage: node shoot-app.mjs <preview address> <outdir> [screen@size …]');
  process.exit(1);
}
// Whether this picture is wanted (all of them when no names were given).
const wanted = (screen, size) => only.length === 0 || only.includes(`${screen.id}@${size.name}`);
const outdir = resolve(outArg);
mkdirSync(outdir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The screens (plan §5, widened 2026-10-27: M11 moves styles every section uses, so every section's
// main page is here). After the page opens:
//   tab  = press the tab with these words;
//   menu = open this ⋯ menu (by its screen-reader name) and picture it open;
//   box  = open this ⋯ menu and press this item (a dialog opens);
//   fail = then make the next save fail on purpose (the preview's failNextSave) and press the
//          dialog's button with these words, to picture its failure note — nothing is saved.
const EVENT = '#testing/color-belt/event/000001e0-0000-4000-8000-000000000001';
const AVA = 'More actions for Ava Chen';
const SCREENS = [
  { id: 'home', hash: '#' },
  { id: 'testing', hash: '#testing' },
  { id: 'cb-events', hash: '#testing/color-belt' },
  { id: 'cb-classes', hash: '#testing/color-belt', tab: 'Classes and ranks' },
  { id: 'cb-private', hash: '#testing/color-belt', tab: 'Private testing' },
  { id: 'roster', hash: EVENT },
  { id: 'menu', hash: EVENT, menu: AVA },
  { id: 'edit', hash: EVENT, box: { menu: AVA, item: 'Edit details' } },
  { id: 'confirm', hash: EVENT, box: { menu: AVA, item: 'Delete permanently' } },
  { id: 'confirm-failed', hash: EVENT, box: { menu: AVA, item: 'Delete permanently' }, fail: 'Delete permanently' },
  { id: 'star-events', hash: '#testing/star' },
  { id: 'star-event', hash: '#testing/star/event/000003e0-0000-4000-8000-000000000001' },
  { id: 'bb-cycles', hash: '#testing/black-belt' },
  { id: 'bb-rubric', hash: '#testing/black-belt/rubric' },
  { id: 'camps', hash: '#camps' },
  { id: 'camp', hash: '#camps/camp/000013c0-0000-4000-8000-000000000005' },
  { id: 'schedule', hash: '#schedule' },
  { id: 'calendar', hash: '#calendar' },
  { id: 'forms', hash: '#forms' },
  { id: 'prospects', hash: '#prospects' },
  { id: 'finance', hash: '#finance' },
  { id: 'staff', hash: '#staff-accounts' },
  { id: 'settings', hash: '#settings' },
];

// Signs in through the sign-in screen, as a person would (the preview's test password).
async function signIn(tab) {
  await tab.open(base, 1500);
  const answer = await tab.evaluate(`(() => {
    if (!document.getElementById('signin-email')) return 'ok'; // still signed in from the last size
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    for (const [id, value] of [['signin-email', 'preview@example.com'], ['signin-password', 'preview']]) {
      const input = document.getElementById(id);
      if (!input) return 'no sign-in form';
      set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const button = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Sign in');
    if (!button) return 'no Sign in button';
    button.click();
    return 'ok';
  })()`);
  if (answer !== 'ok') throw new Error('sign-in failed: ' + answer);
  await sleep(2000);
}

// Presses the first element of this kind whose words (or screen-reader name) are exactly these.
async function press(tab, selector, words) {
  const done = await tab.evaluate(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((b) => b.getAttribute('aria-label') === ${JSON.stringify(words)} || b.textContent.trim() === ${JSON.stringify(words)});
    if (!el) return false;
    el.click();
    return true;
  })()`);
  await sleep(700);
  return done;
}

// Opens a ⋯ menu by its screen-reader name.
async function openMenu(tab, menu) {
  if (!(await press(tab, 'button', menu))) throw new Error('no menu button: ' + menu);
}

// Opens a ⋯ menu by its screen-reader name, then presses one of its items by its words.
async function openBox(tab, { menu, item }) {
  await openMenu(tab, menu);
  const pressed = await tab.evaluate(`(() => {
    const entry = [...document.querySelectorAll('[role=menuitem]')].find((m) => m.textContent.trim() === ${JSON.stringify(item)});
    if (!entry) return false;
    entry.click();
    return true;
  })()`);
  if (!pressed) throw new Error('no menu item: ' + item);
  await sleep(900);
}

await withChrome(async (tab) => {
  for (const size of SIZES) {
    const screens = SCREENS.filter((screen) => wanted(screen, size));
    if (screens.length === 0) continue;
    await tab.size({ ...size, scale: 2 });
    await signIn(tab); // signs in again at each size (the page reloads with the new size)
    for (const screen of screens) {
      // A full page load each time (a blank page first: a change of "#…" alone doesn't reload),
      // so nothing is left over from the last screen.
      await tab.open('about:blank', 0);
      await tab.open(base + screen.hash, 1500);
      if (screen.tab && !(await press(tab, '[role=tab]', screen.tab))) {
        console.log(`  (no "${screen.tab}" tab at ${size.name}; ${screen.id} skipped)`);
        continue;
      }
      if (screen.menu) await openMenu(tab, screen.menu);
      if (screen.box) await openBox(tab, screen.box);
      if (screen.fail) {
        await tab.evaluate('window.__tkdPreview.failNextSave()');
        const dialog = '[role=dialog] button, [role=alertdialog] button';
        if (!(await press(tab, dialog, screen.fail))) throw new Error('no dialog button: ' + screen.fail);
        await sleep(800);
      }
      // A page is pictured whole; an open menu or box as the screen shows it.
      const height = screen.box || screen.menu ? size.h : await tab.height();
      writeFileSync(join(outdir, `${screen.id}@${size.name}.png`), await tab.shot({ x: 0, y: 0, width: size.w, height }));
    }
    console.log(`${size.label}: ${screens.length} screens`);
  }
});
