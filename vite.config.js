// vite.config.js — settings for Vite, the tool that runs the dev server and builds the app.
// Why it exists: Vite needs to know we use React so it can turn our .jsx files into
// plain JavaScript the browser understands.
//
// The two extra settings below exist because Claude Code keeps separate working copies
// of this project ("worktrees") inside .claude/worktrees/. Without them, a preview started
// in the main folder would also scan and watch those copies (their index.html files and
// node_modules), which makes it slow and can cause errors.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Don't watch the worktree copies for changes.
    watch: { ignored: ['**/.claude/worktrees/**'] },
  },
  optimizeDeps: {
    // Only look for the app's libraries starting from our own index.html.
    entries: ['index.html'],
  },
});
