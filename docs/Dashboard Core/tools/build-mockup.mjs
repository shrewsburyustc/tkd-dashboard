// build-mockup.mjs — turns a hand-written mockup source into ONE self-contained HTML file.
// Why: CLAUDE.md asks for mockups as self-contained HTML files Jeffrey can open in a browser, and the
// design review asks to copy the approved look, not redesign it. So a mockup uses the app's REAL
// stylesheets and the app's REAL Tabler icons; this script copies both into the file.
//
// Usage: node build-mockup.mjs <source.html> <out.html>
// In the source:
//   <!-- css: src/styles/tokens.css src/styles/app.css … -->   → one <style> with those files
//                                                                (paths from the repo's top folder)
//   <i data-icon="check" data-size="16"></i>                     → that Tabler outline icon as an
//                                                                inline <svg>, as the app draws it
//                                                                (@tabler/icons-react; default 16px)
//   <img data-qr="https://…" …>                                  → that link's QR code, made as the app makes it

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [src, out] = process.argv.slice(2);
if (!src || !out) {
  console.error('Usage: node build-mockup.mjs <source.html> <out.html>');
  process.exit(1);
}
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const iconDir = join(repo, 'node_modules', '@tabler', 'icons', 'icons', 'outline');
let html = readFileSync(resolve(src), 'utf8');

html = html.replace(/<!--\s*css:([\s\S]*?)-->/g, (_, list) => {
  const files = list.trim().split(/\s+/);
  const css = files.map((f) => `/* ===== ${f} (copied from the app) ===== */\n${readFileSync(join(repo, f), 'utf8')}`).join('\n');
  return `<style>\n${css}\n</style>`;
});

html = html.replace(/<i data-icon="([a-z0-9-]+)"(?: data-size="(\d+)")?(?: class="([^"]*)")?><\/i>/g, (_, name, size = '16', cls = '') => {
  const svg = readFileSync(join(iconDir, `${name}.svg`), 'utf8');
  const inner = svg.slice(svg.indexOf('>') + 1, svg.lastIndexOf('</svg>')).trim().replace(/\s*\n\s*/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tabler-icon tabler-icon-${name}${cls ? ` ${cls}` : ''}" aria-hidden="true">${inner}</svg>`;
});

// <img data-qr="https://…" …>  → that link's QR code as a picture, made exactly as the app makes it
// (src/lib/testing/qr.js: the qrcode-generator library, error correction M, a 4-square quiet zone).
const { default: qrcode } = await import(pathToFileURL(join(repo, 'node_modules', 'qrcode-generator', 'dist', 'qrcode.mjs')).href);
html = html.replace(/<img data-qr="([^"]+)"/g, (_, link) => {
  const qr = qrcode(0, 'M');
  qr.addData(link);
  qr.make();
  const svg = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
  return `<img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}"`;
});

writeFileSync(resolve(out), html);
console.log(`built ${out}`);
