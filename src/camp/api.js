// api.js — how the camp sign-up page talks to the server.
// Why it exists: the page needs exactly two things — the camp (GET) and "save this sign-up"
// (POST), both at /api/camp/<code> (the Cloudflare Function, contract 0013 §4.2). It never talks
// to the database or Supabase directly. A copy of src/register/api.js for camps.
//
// Preview mode (npm run dev:preview-mode): there is no Cloudflare Function on this PC, so the
// page uses the fake one in src/lib/camps/publicApi.preview.js instead (same answers, stored in
// this browser — §4.7). `import.meta.env.MODE === 'preview'` is replaced by Vite with true/false
// when building; in the production build it is false, so the preview code is dropped completely
// and never reaches families.
//
// Both functions always resolve to an object with a `status` (the server's snake_case answer —
// CampApp converts it to camelCase). A network problem resolves to { status: 'network' }, and an
// answer we can't read to { status: 'unavailable' }, so the screens only deal with status codes.

const apiPath = (code) => `/api/camp/${encodeURIComponent(code)}`;

// Reads a server answer. Only a JSON object with a text `status` counts.
async function readAnswer(response) {
  try {
    const body = await response.json();
    if (body && typeof body === 'object' && !Array.isArray(body) && typeof body.status === 'string') return body;
  } catch {
    // not JSON (e.g. an error page) — fall through
  }
  return { status: 'unavailable' };
}

// The camp and what the form needs (GET).
export async function getCamp(code) {
  if (import.meta.env.MODE === 'preview') {
    const preview = await import('../lib/camps/publicApi.preview.js');
    return preview.getCamp(code);
  }
  try {
    const response = await fetch(apiPath(code), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      credentials: 'same-origin',
    });
    return await readAnswer(response);
  } catch {
    return { status: 'network' };
  }
}

// Sends one family's sign-up (POST). `body` is the object described in CampApp.jsx.
export async function sendSignup(code, body) {
  if (import.meta.env.MODE === 'preview') {
    const preview = await import('../lib/camps/publicApi.preview.js');
    return preview.signUp(code, body);
  }
  try {
    const response = await fetch(apiPath(code), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      credentials: 'same-origin',
    });
    return await readAnswer(response);
  } catch {
    return { status: 'network' };
  }
}
