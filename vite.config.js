// vite.config.js — settings for Vite, the tool that runs the dev server and builds the app.
// Why it exists: Vite needs to know we use React so it can turn our .jsx files into
// plain JavaScript the browser understands. Nothing else needs configuring yet.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
