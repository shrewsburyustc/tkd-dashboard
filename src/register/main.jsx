// main.jsx — the starting point of the PUBLIC family registration page (register.html).
// Why it exists: the family form is a second, separate page in the same build (contract 0005
// §4.1). It loads ONLY what families need: React, the page's own files in src/register/, the
// shared rules (eventRules.js, belts.js, money.js, names.js) and the color/size tokens.
// It never loads the staff dashboard, supabase-js or anything that can sign in.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/tokens.css';
import '../styles/register.css';
import RegisterApp from './RegisterApp.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RegisterApp />
  </StrictMode>,
);
