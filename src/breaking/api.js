// api.js — how the Board breaking sign-up page talks to the server.
// Why it exists: the page needs exactly two things at /api/breaking/<code> (the Cloudflare Function,
// docs/Board Breaking/FUNCTION-API.md): the event (GET) and "do this" (POST: signup, pay or status).
// It never talks to the database or Supabase directly. A copy of src/camp/api.js for Board breaking.
//
// Preview mode (npm run dev:preview-mode): there is no Cloudflare Function on this PC, so the page uses
// the fake one in src/lib/breaking/publicApi.preview.js instead (same answers, kept in this browser).
// `import.meta.env.MODE === 'preview'` is replaced by Vite with true/false when building; in the
// production build it is false, so the preview code is dropped completely and never reaches families.
//
// Both functions always resolve to an object with a `status` (the server's snake_case answer). A network
// problem resolves to { status: 'network' }, and an answer we can't read to { status: 'unavailable' }, so
// the screens only deal with status words. Nothing here ever writes the submission id (or anything the
// family typed) into an address, a log line or an error message: it travels only in the POST body.

const apiPath = (code) => `/api/breaking/${encodeURIComponent(code)}`;

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

// The event and what the form needs (GET).
export async function getEvent(code) {
  if (import.meta.env.MODE === 'preview') {
    const preview = await import('../lib/breaking/publicApi.preview.js');
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

// One POST: body.action is 'signup', 'pay' or 'status' (FUNCTION-API.md).
export async function postAction(code, body) {
  if (import.meta.env.MODE === 'preview') {
    const preview = await import('../lib/breaking/publicApi.preview.js');
    return preview.postAction(code, body);
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
