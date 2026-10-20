// api.js — how the Black Belt family page talks to the server.
// Why it exists: the page needs exactly two things — the cycle (GET) and "save this
// registration" (POST), both at /api/black-belt/<code> (the Cloudflare Pages Function,
// contract 0016-B1 §4.6–§4.7 / CONTRACT-0016 §9). It never talks to the database or Supabase.
//
// Preview mode (npm run dev:preview-mode): there is no Cloudflare Function on this PC, so the
// page uses the stand-in in src/lib/blackBelt/publicApi.preview.js instead (same answers, same
// rules, kept in this browser on the same fake store as the staff preview — contract §2.6).
// Vite replaces `import.meta.env.MODE === 'preview'` with true/false when building; in the
// production build it is false, so the preview code is dropped completely and never reaches
// families (a "dynamic import" inside a branch that can't run isn't bundled).
//
// Both functions always resolve to an object with a `status`. A network problem resolves to
// { status: 'network' }, and an answer we can't read to { status: 'unavailable' }, so the
// screens only ever deal with status codes. Nothing here logs anything.

const apiPath = (code) => `/api/black-belt/${encodeURIComponent(code)}`;

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

// The preview stand-in can only fail by throwing (a bug); treat that like a dropped connection.
async function fromPreview(call) {
  try {
    const answer = await call();
    return answer && typeof answer === 'object' && typeof answer.status === 'string' ? answer : { status: 'unavailable' };
  } catch {
    return { status: 'network' };
  }
}

// The cycle and what the form needs (GET).
export async function getCycle(code) {
  if (import.meta.env.MODE === 'preview') {
    return fromPreview(async () => {
      const preview = await import('../../lib/blackBelt/publicApi.preview.js');
      return preview.getCycle(code);
    });
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

// Sends one registration (POST). `body` is the object described in FormApp.jsx.
export async function sendRegistration(code, body) {
  if (import.meta.env.MODE === 'preview') {
    return fromPreview(async () => {
      const preview = await import('../../lib/blackBelt/publicApi.preview.js');
      return preview.register(code, body);
    });
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
