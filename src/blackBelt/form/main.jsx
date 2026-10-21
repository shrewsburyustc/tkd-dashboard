// main.jsx — the starting point of the PUBLIC Black Belt registration page (black-belt.html).
// Why it exists: the family form is a separate page in the same build (contract 0016-B1 §4.1).
// It loads ONLY what families need: React, the page's own files in src/blackBelt/form/, the
// shared name and date rules (src/lib/testing/names.js, eventRules.js), the money format
// (src/lib/money.js) and the color/size tokens. It never loads the staff dashboard,
// supabase-js, mockClient.js or anything that can sign in. In preview mode only, api.js loads
// the stand-in src/lib/blackBelt/publicApi.preview.js (dropped from the real build).
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../../styles/tokens.css';
import './form.css';
import FormApp from './FormApp.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <FormApp />
  </StrictMode>,
);
