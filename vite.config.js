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
// More pages work exactly the same way: camp.html (the public camp sign-up form, /camp/<code>,
// contract 0013 §4.1) shares registerPageRewrite below; forms.html (the public Forms page,
// /f/<name>, build plan §3) has its own small plugin (formsPageRewrite). Each has its own line
// in public/_redirects.
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
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

export default defineConfig({
  plugins: [react(), registerPageRewrite(), formsPageRewrite()],
  build: {
    rollupOptions: {
      // The pages of the build.
      input: {
        main: resolve(fileURLToPath(new URL('.', import.meta.url)), 'index.html'),
        register: resolve(fileURLToPath(new URL('.', import.meta.url)), 'register.html'),
        forms: resolve(fileURLToPath(new URL('.', import.meta.url)), 'forms.html'),
        camp: resolve(fileURLToPath(new URL('.', import.meta.url)), 'camp.html'),
      },
    },
  },
  server: {
    // Don't watch the worktree copies for changes.
    watch: { ignored: (path) => path.replace(/\\/g, '/').toLowerCase().startsWith(worktreesDir) },
  },
  optimizeDeps: {
    // Only look for the app's libraries starting from our own pages.
    entries: ['index.html', 'register.html', 'forms.html', 'camp.html'],
  },
});
