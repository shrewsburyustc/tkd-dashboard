// api.js — how the family page talks to the server.
// Why it exists: the page needs exactly two things — the event (GET) and "save this
// registration" (POST), both at /api/register/<code> (the Cloudflare Function, contract 0005
// §4.2). It never talks to the database or Supabase directly.
//
// Preview mode (npm run dev:preview-mode): there is no Cloudflare Function on this PC, so the
// page uses the fake one in src/lib/testing/publicApi.preview.js instead (same answers, same
// rules, stored in this browser — contract 0005 §4.5). The `import.meta.env.MODE === 'preview'`
// test is replaced by Vite with true/false when building; in the production build it is
// false, so the preview code is dropped completely and never reaches families.
//
// Both functions always resolve to an object with a `status`. A network problem resolves to
// { status: 'network' }, and an answer we can't read to { status: 'unavailable' }, so the
// screens only ever deal with status codes.

const apiPath = (code) => `/api/register/${encodeURIComponent(code)}`;

// Reads a server answer. Only a JSON object with a text `status` counts.
async function readAnswer(response) {
  try {
    const body = await response.json();
    if (body && typeof body === 'object' && typeof body.status === 'string') return body;
  } catch {
    // not JSON (e.g. an error page) — fall through
  }
  return { status: 'unavailable' };
}

// The event and what the form needs (GET).
export async function getEvent(code) {
  if (import.meta.env.MODE === 'preview') {
    const preview = await import('../lib/testing/publicApi.preview.js');
    return preview.getEvent(code);
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

// Sends one registration (POST). `body` is the object described in RegisterApp.jsx.
export async function sendRegistration(code, body) {
  if (import.meta.env.MODE === 'preview') {
    const preview = await import('../lib/testing/publicApi.preview.js');
    return preview.register(code, body);
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
