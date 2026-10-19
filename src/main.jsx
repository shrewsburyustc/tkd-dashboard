// main.jsx — the starting point: React takes over the page from here.
// Why it exists: index.html loads this file. It pulls in the styles and draws <App />
// inside <div id="root">. If the Supabase settings are missing — or the wrong (secret) key
// was used — it draws a setup message instead.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/app.css';
import './styles/testing.css'; // Testing → Classes and ranks (contract 0003)
import './styles/staff.css'; // Staff accounts (rulebook v0.70–v0.76)
import './styles/schedule.css'; // Schedule (rulebook v0.137)
import './styles/calendar.css'; // Calendar (rulebook v0.138)
import './styles/forms.css'; // Forms (rulebook v0.139)
import './styles/prospects.css'; // Prospects (rulebook v0.140)
import App from './App.jsx';
import SetupNeeded from './screens/SetupNeeded.jsx';
import { isMissingConfig, isSecretKey } from './lib/supabase.js';

// Which setup problem (if any) to show. null = all good, start the app.
const setupProblem = isMissingConfig ? 'missing' : isSecretKey ? 'secretKey' : null;

// StrictMode runs extra checks while developing (it has no effect in the built app).
createRoot(document.getElementById('root')).render(
  <StrictMode>{setupProblem ? <SetupNeeded problem={setupProblem} /> : <App />}</StrictMode>,
);
