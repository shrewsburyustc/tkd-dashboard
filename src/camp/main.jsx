// main.jsx — the starting point of the PUBLIC camp sign-up page (camp.html).
// Why it exists: the camp family form is a third, separate page in the same build (contract 0013
// §4.1). It loads ONLY what families need: React, the page's own files in src/camp/, a few
// pieces of the Color Belt family page (signature pad, Turnstile, date formats and its styles),
// the shared rules (campRules.js, money.js, names.js) and the color/size tokens.
// It never loads the staff dashboard, supabase-js or anything that can sign in.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/tokens.css';
import '../styles/register.css';
import '../styles/camp.css';
import CampApp from './CampApp.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <CampApp />
  </StrictMode>,
);
