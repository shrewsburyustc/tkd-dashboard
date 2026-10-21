// main.jsx — the starting point of the PUBLIC Star testing registration page (star.html, /star/<code>).
// Why it exists: the Star family form is a separate page in the same build (build plan phase 4),
// built only while the Star build switch is on (vite.config.js). It loads ONLY what families need:
// React, the page's own files in src/star-register/, the few pieces it shares with Color Belt's live
// form unchanged (SignaturePad, visit.js, format.js, the plain parts of parts.jsx), the dashboard
// calendar (components/DatePicker.jsx), the pure Star / Color Belt rules files and the styles.
// It never loads the staff dashboard, supabase-js or anything that can sign in.
//
// Styles: tokens.css (colors, sizes), register.css (Color Belt's public-page look, unchanged) and
// star-register.css (the few Star-only parts, on top). DatePicker brings its own DatePicker.css.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/tokens.css';
import '../styles/register.css';
import '../styles/star-register.css';
import StarRegisterApp from './StarRegisterApp.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <StarRegisterApp />
  </StrictMode>,
);
