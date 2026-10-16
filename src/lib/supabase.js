// supabase.js — creates the ONE connection object the whole app uses to talk to the backend.
// Why it exists: every screen imports `supabase` from here, so there's a single place that
// decides between the real Supabase project and the fake preview backend.
//   - Normal mode: reads the URL and anon key from .env.local.
//   - Preview mode (started with `--mode preview`, i.e. npm run dev:preview-mode): uses src/lib/mockClient.js,
//     which pretends to be Supabase so the screens can be tried without a database.
import { createClient } from '@supabase/supabase-js';
import { createMockClient } from './mockClient.js';
import { decodeJwtPayload } from './session.js';

// Vite only exposes settings whose names start with VITE_, via import.meta.env.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Vite sets import.meta.env.MODE to whatever --mode was passed, so no extra settings file is needed.
export const isPreview = import.meta.env.MODE === 'preview';

// True when the real settings are missing (e.g. .env.local wasn't created yet).
// main.jsx shows a setup message instead of the app in that case.
export const isMissingConfig = !isPreview && (!supabaseUrl || !supabaseAnonKey);

// True when the key looks like Supabase's SECRET key instead of the publishable (anon) one.
// The secret key skips every database safety rule, and anything in the app is readable by
// anyone who opens it in a browser — so the app refuses to start with it.
//   - New-style keys say what they are: "sb_secret_..." vs "sb_publishable_...".
//   - Older keys are JWTs; the secret one has role "service_role" inside its payload.
function looksLikeSecretKey(key) {
  if (!key) return false;
  if (key.startsWith('sb_secret_')) return true;
  // decodeJwtPayload (session.js) undoes the base64url encoding and returns null, instead
  // of crashing, for anything that isn't a readable JWT (e.g. an "sb_publishable_..." key).
  const payload = decodeJwtPayload(key);
  return payload?.role === 'service_role';
}

// main.jsx shows a "wrong key" message instead of the app when this is true.
export const isSecretKey = !isPreview && looksLikeSecretKey(supabaseAnonKey);

function makeClient() {
  if (isPreview) return createMockClient();
  if (isMissingConfig) return null; // createClient would throw without a URL
  if (isSecretKey) return null; // never connect with the secret key
  // Defaults: the session is saved in localStorage and refreshed automatically.
  return createClient(supabaseUrl, supabaseAnonKey);
}

export const supabase = makeClient();
