// main.jsx — the starting point of the PUBLIC Board breaking sign-up page (breaking.html).
// Why it exists: the family form is a separate page in the same build (contract 0051 §5), like camp.html.
// It loads ONLY what families need: React, the page's own files in src/breaking/, a few shared pieces
// (Turnstile, date formats), the dashboard's pure Board breaking rules (price maths, rank lists) and the
// color/size tokens. It never loads the staff dashboard, supabase-js or anything that can sign in.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/tokens.css';
import '../styles/register.css'; // the Color Belt form's look (classes "reg-"), shared by every public form
import '../styles/camp.css'; // the Camps pieces this page reuses (two names side by side, price lines, "camp-")
import '../styles/breaking-public.css'; // the new pieces only ("brk-")
import BreakingApp from './BreakingApp.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BreakingApp />
  </StrictMode>,
);
