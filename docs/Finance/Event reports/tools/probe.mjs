// probe.mjs — finds the addresses of sample pages in the preview (fake data), for the mockup pictures.
import { withChrome } from '../../../Dashboard Core/tools/chrome.mjs';
const base = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await withChrome(async (tab) => {
  await tab.size({ w: 1280, h: 800, scale: 1 });
  await tab.open(base, 1500);
  await tab.evaluate(`(() => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    for (const [id, value] of [['signin-email', 'preview@example.com'], ['signin-password', 'preview']]) {
      const input = document.getElementById(id); set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Sign in').click();
  })()`);
  await sleep(2500);
  for (const hash of process.argv.slice(3)) {
    await tab.open('about:blank', 0);
    await tab.open(base + hash, 1800);
    const info = await tab.evaluate(`JSON.stringify({ url: location.hash, title: document.title, links: [...document.querySelectorAll('a[href*="#"]')].map(a => a.getAttribute('href')).slice(0,30), text: document.body.innerText.slice(0,600) })`);
    console.log(hash, info);
  }
});
