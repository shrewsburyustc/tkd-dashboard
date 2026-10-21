// vite.config.js — settings for Vite, the tool that runs the dev server and builds the app.
// Why it exists: Vite needs to know we use React so it can turn our .jsx files into
// plain JavaScript the browser understands.
//
// The two extra settings below exist because Claude Code keeps separate working copies
// of this project ("worktrees") inside .claude/worktrees/. Without them, a preview started
// in the main folder would also scan and watch those copies (their index.html files and
// node_modules), which makes it slow and can cause errors.
//
// The build has TWO pages (contract 0005 §4.1): index.html (the staff dashboard) and
// register.html (the public family registration form, /register/<code>). On Cloudflare,
// public/_redirects serves register.html for every /register/<code> address; on this PC the
// small plugin below does the same for `npm run dev`, `dev:preview-mode` and `vite preview`.
// More pages work the same way: camp.html (the public camp sign-up form, /camp/<code>, contract
// 0013 §4.1) shares registerPageRewrite below; forms.html (the public Forms page, /f/<name>, build
// plan §3) has its own small plugin (formsPageRewrite); black-belt.html (the public Black Belt
// testing registration form, /black-belt/<code>, contract 0016-B1 §4.1) has its own too
// (blackBeltPageRewrite). Each has its own line in public/_redirects.
// One more page, star.html (the public Star testing registration form, /star/<code>, Star build
// phase 4), is added ONLY while the Star build switch is on — the same rule as src/lib/features.js
// (VITE_STAR_TESTING 'on' → on; 'off' → off; anything else → on in preview mode only). So the live
// build (switch off) has no Star page or code at all; its rewrite (starPageRewrite) is added the
// same way. The Cloudflare line for /star/* comes from the build too (starRedirects, below): the page
// while the switch is on, the plain public/star-closed.html ("isn't open yet") while it is off.
// Two cautions:
//   - A build on THIS PC also reads .env.local, so `npm run build` here only shows what goes live
//     when .env.local has no VITE_STAR_TESTING=on. What goes live is decided by Cloudflare's setting.
//   - `npm run dev` with the switch off still SERVES the file /star.html on this PC (Vite's dev server
//     serves any page file in the folder); only the /star/<code> rewrite and the build leave it out.
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// The worktrees folder inside THIS copy of the project (forward slashes and lowercase, so
// Windows paths compare the same however the drive letter is written).
// It must be this exact folder, not any path containing ".claude/worktrees": a worktree's own
// files live under a path like that too, and a pattern like '**/.claude/worktrees/**' made the
// preview inside a worktree ignore every edit (it kept showing the code from when it started).
const worktreesDir = fileURLToPath(new URL('./.claude/worktrees/', import.meta.url)).replace(/\\/g, '/').toLowerCase();

// /register, /register/ and /register/<code> (with or without ?query) → register.html, and
// /camp, /camp/ and /camp/<code> → camp.html, like public/_redirects does on Cloudflare.
// Everything else is left alone.
function registerPageRewrite() {
  const rewrite = (req, _res, next) => {
    const [path, query] = (req.url ?? '').split('?');
    if (path === '/register' || path.startsWith('/register/')) {
      req.url = '/register.html' + (query !== undefined ? `?${query}` : '');
    } else if (path === '/camp' || path.startsWith('/camp/')) {
      req.url = '/camp.html' + (query !== undefined ? `?${query}` : '');
    }
    next();
  };
  return {
    name: 'register-page-rewrite',
    configureServer(server) {
      server.middlewares.use(rewrite);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite);
    },
  };
}

// /f, /f/ and /f/<name> (with or without ?query) → forms.html, like public/_redirects does on
// Cloudflare. Everything else is left alone (e.g. /forms or /favicon.ico don't match).
function formsPageRewrite() {
  const rewrite = (req, _res, next) => {
    const [path, query] = (req.url ?? '').split('?');
    if (path === '/f' || path.startsWith('/f/')) {
      req.url = '/forms.html' + (query !== undefined ? `?${query}` : '');
    }
    next();
  };
  return {
    name: 'forms-page-rewrite',
    configureServer(server) {
      server.middlewares.use(rewrite);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite);
    },
  };
}

// /star, /star/ and /star/<code> (with or without ?query) → star.html, like public/_redirects does on
// Cloudflare. Everything else is left alone (/star.html itself, /src/…, /starlight don't match).
function starPageRewrite() {
  const rewrite = (req, _res, next) => {
    const [path, query] = (req.url ?? '').split('?');
    if (path === '/star' || path.startsWith('/star/')) {
      req.url = '/star.html' + (query !== undefined ? `?${query}` : '');
    }
    next();
  };
  return {
    name: 'star-page-rewrite',
    configureServer(server) {
      server.middlewares.use(rewrite);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite);
    },
  };
}

// /black-belt, /black-belt/ and /black-belt/<code> (with or without ?query, e.g. ?dan=2) →
// black-belt.html, like public/_redirects does on Cloudflare. /black-belt.html itself is left
// alone (it doesn't match "/black-belt/"), so the page's own file still loads.
function blackBeltPageRewrite() {
  const rewrite = (req, _res, next) => {
    const [path, query] = (req.url ?? '').split('?');
    if (path === '/black-belt' || path.startsWith('/black-belt/')) {
      req.url = '/black-belt.html' + (query !== undefined ? `?${query}` : '');
    }
    next();
  };
  return {
    name: 'black-belt-page-rewrite',
    configureServer(server) {
      server.middlewares.use(rewrite);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite);
    },
  };
}

// Adds the /star/* line to the BUILT dist/_redirects (Cloudflare reads that copy of public/_redirects):
//   switch on  → /star/*  /star         200   (star.html, the family form)
//   switch off → /star and /star/*  /star-closed  200   (public/star-closed.html — no script, no Star code)
// Without it, a /star/<code> link on the live site would fall through to the staff sign-in page.
// Runs after the build has copied public/ into the output folder.
function starRedirects(star) {
  let outDir = 'dist';
  return {
    name: 'star-redirects',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const file = resolve(outDir, '_redirects');
      // Off: a plain /star (no code) goes there too; on, Pages serves star.html at /star by itself.
      const lines = star ? ['/star/*  /star  200'] : ['/star  /star-closed  200', '/star/*  /star-closed  200'];
      const text = readFileSync(file, 'utf8');
      writeFileSync(file, `${text.replace(/\s*$/, '')}\r\n${lines.join('\r\n')}\r\n`);
    },
  };
}

// Is the Star build switch on for this build? The same rule as src/lib/features.js. loadEnv reads
// the .env files and the computer's own settings (e.g. Cloudflare's VITE_STAR_TESTING) for the mode.
function starTestingOn(mode, root) {
  const setting = loadEnv(mode, root, 'VITE_').VITE_STAR_TESTING;
  return setting === 'on' || (setting !== 'off' && mode === 'preview');
}

export default defineConfig(({ mode }) => {
  const root = fileURLToPath(new URL('.', import.meta.url));
  const star = starTestingOn(mode, root);
  return {
    plugins: [react(), registerPageRewrite(), formsPageRewrite(), blackBeltPageRewrite(), ...(star ? [starPageRewrite()] : []), starRedirects(star)],
    build: {
      rollupOptions: {
        // The pages of the build (camp.html and black-belt.html always; star.html only while the Star switch is on).
        input: {
          main: resolve(root, 'index.html'),
          register: resolve(root, 'register.html'),
          forms: resolve(root, 'forms.html'),
          camp: resolve(root, 'camp.html'),
          blackBelt: resolve(root, 'black-belt.html'),
          ...(star ? { star: resolve(root, 'star.html') } : {}),
        },
      },
    },
    server: {
      // Don't watch the worktree copies for changes.
      watch: { ignored: (path) => path.replace(/\\/g, '/').toLowerCase().startsWith(worktreesDir) },
    },
    optimizeDeps: {
      // Only look for the app's libraries starting from our own pages.
      entries: ['index.html', 'register.html', 'forms.html', 'camp.html', 'black-belt.html', ...(star ? ['star.html'] : [])],
    },
  };
});
