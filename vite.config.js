// vite.config.js — settings for Vite, the tool that runs the dev server and builds the app.
// Why it exists: Vite needs to know we use React so it can turn our .jsx files into
// plain JavaScript the browser understands.
//
// The two extra settings below exist because Claude Code keeps separate working copies
// of this project ("worktrees") inside .claude/worktrees/. Without them, a preview started
// in the main folder would also scan and watch those copies (their index.html files and
// node_modules), which makes it slow and can cause errors.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The worktrees folder inside THIS copy of the project (forward slashes and lowercase, so
// Windows paths compare the same however the drive letter is written).
// It must be this exact folder, not any path containing ".claude/worktrees": a worktree's own
// files live under a path like that too, and a pattern like '**/.claude/worktrees/**' made the
// preview inside a worktree ignore every edit (it kept showing the code from when it started).
const worktreesDir = fileURLToPath(new URL('./.claude/worktrees/', import.meta.url)).replace(/\\/g, '/').toLowerCase();

export default defineConfig({
  plugins: [react()],
  server: {
    // Don't watch the worktree copies for changes.
    watch: { ignored: (path) => path.replace(/\\/g, '/').toLowerCase().startsWith(worktreesDir) },
  },
  optimizeDeps: {
    // Only look for the app's libraries starting from our own index.html.
    entries: ['index.html'],
  },
});
