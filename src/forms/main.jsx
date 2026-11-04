// main.jsx — the starting point of the PUBLIC forms page (forms.html, /f/<name>).
// Why it exists: the family form is a separate page in the same build (build plan §3). It loads
// ONLY what families need: React, the page's own files in src/forms/, the shared field drawing
// and rules (src/screens/forms/FormFields.jsx, SignaturePad.jsx, text.js, src/lib/forms/fields.js,
// Notice.jsx, and the shared calendar src/components/DatePicker.jsx with its own DatePicker.css for
// a Date question, design review N6) and the styles. It never loads the staff dashboard, supabase-js or any key.
//
// Styles: tokens.css (colors, sizes), forms.css (the staff Forms look — its Fill in part draws the
// same fields here: progress bar, children, time cards, waiver, signature) and forms-public.css
// (this page's frame plus the few dashboard basics the fields use, like .field and .btn).
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/tokens.css';
import '../styles/forms.css';
import '../styles/forms-public.css';
import FormsApp from './FormsApp.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <FormsApp />
  </StrictMode>,
);
