// serve-static.mjs — serves a finished preview-mode build (dist-preview/) on this PC, for pictures.
// Why: the real build loads the stylesheets in a different order than the dev server (forms.css
// before app.css), so step 1's "nothing changed" pictures are taken from a built copy too. CLAUDE.md
// forbids `npm run preview` in a worktree (it serves the build that uses the live database); a
// preview-mode build uses the fake database, and this tiny server is all it needs.
// Only the dashboard page is needed: every page of it is "/#…" (pageAddress.js).
// Point the picture tools at http://127.0.0.1:<port>/, not localhost: this server listens on IPv4
// only, and "localhost" tries IPv6 first, where another session's dev server may hold the same
// port number (on 2026-10-28 one did, and its pictures were taken instead of the build's).
//
// Usage: node serve-static.mjs <folder, e.g. dist-preview> <port, e.g. 5191>
// Build first: npm run build:preview-mode -- --outDir dist-preview

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const [folderArg, portArg] = process.argv.slice(2);
const folder = resolve(folderArg ?? 'dist-preview');
const port = Number(portArg ?? 5191);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain',
};

createServer(async (req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  // Only files inside the folder; "/" and anything unknown get the dashboard page.
  const file = normalize(join(folder, path));
  const inside = file.startsWith(folder) && extname(file) !== '';
  try {
    const body = await readFile(inside ? file : join(folder, 'index.html'));
    res.writeHead(200, { 'Content-Type': TYPES[extname(inside ? file : 'index.html')] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`serving ${folder} at http://127.0.0.1:${port}/`));
