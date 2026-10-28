// main.jsx — the starting point of the shared parts page (parts.html), preview only.
// Why it exists: parts.html loads this file. It draws the parts page (PartsPage.jsx) — but only in
// preview mode (`npm run dev:preview-mode`, the fake database). Started any other way (e.g. with the
// live database's settings) it draws one line saying how to open it, and the parts page's code isn't
// even loaded. The page is never built: vite.config.js doesn't list parts.html, so `npm run build`
// leaves it out (plan §4).
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// The app's stylesheets, in the app's order: tokens, app, shared. This is the ONE place besides
// src/main.jsx that imports shared.css (its header says "import it only from main.jsx": an import
// from another page that is BUILT could move it ahead of app.css in the built CSS). It is allowed
// here because this page is dev-only and never built.
import '../styles/tokens.css';
import '../styles/app.css';
import '../styles/shared.css';
import './parts.css'; // the page's own layout (headings, sample rows) — never part of a shared part

const root = createRoot(document.getElementById('root'));
if (import.meta.env.MODE !== 'preview') {
  root.render(<p className="parts-refuse">Open this page with npm run dev:preview-mode</p>);
} else {
  // Loaded only in preview mode (a "dynamic import": the file is fetched when this line runs).
  import('./PartsPage.jsx').then(({ default: PartsPage }) => {
    root.render(
      <StrictMode>
        <PartsPage />
      </StrictMode>,
    );
  });
}
