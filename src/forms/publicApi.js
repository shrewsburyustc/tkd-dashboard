// publicApi.js — how the public forms page talks to the server.
// Why it exists: the page needs exactly two things, both at /api/forms/<name> (the Cloudflare
// Function functions/api/forms/[slug].js, build plan §3): GET = the form, its open free-class
// times and the Turnstile site key; POST = "save this sign-up". It never talks to the database or
// Supabase directly, and holds no key of any kind.
//
// Preview mode (npm run dev:preview-mode): there is no Function on this PC, so the page uses the
// stand-in src/forms/publicApi.preview.js (same answers, data shared with the staff preview).
// `import.meta.env.MODE === 'preview'` is replaced by Vite with true/false when building; in the
// real build it is false, so the stand-in is left out completely (src/forms/checks.mjs checks it).
//
// The JSON shapes match functions/_lib/forms/forms.js (its mapGetResult / mapSubmitResult).
// Both functions always resolve to an object with a `status`. A dropped connection gives
// { status: 'network' } and an answer we can't read gives { status: 'unavailable' }, so the
// screens only deal with status words. The server's snake_case names are turned into the
// camelCase ones the shared field drawing (src/screens/forms/FormFields.jsx) uses.
//
//   getForm(slug) → { status: 'ok', formName, fields, publishedVersion, schoolName, schoolPhone,
//                     thankYou, addToCalendar, times, turnstileSiteKey }
//                 | { status: 'closed', schoolName, schoolPhone } | { status: 'not_found' | 'not_open' (switched off) | … }
//   submitForm(slug, body) → { status: 'ok', bookings } | { status: 'time_taken', times }
//                 | { status: 'form_changed' } | { status: 'closed' | 'not_found' | 'not_open' | 'rate_limited'
//                 | 'verify_failed' | 'invalid' | 'bad_request' | 'network' | 'unavailable' }
//   body = { submission_key, published_version, answers, children: [{ first_name, age }],
//            bookings: [{ child, class_id, date, starts_at }], signature, website (honeypot),
//            started_at, sent_at, turnstile_token }

const apiPath = (slug) => `/api/forms/${encodeURIComponent(slug)}`;
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v) => (typeof v === 'string' ? v : null);

// Reads a server answer. Only a JSON object with a text `status` counts.
async function readAnswer(response) {
  try {
    const body = await response.json();
    if (isObject(body) && typeof body.status === 'string') return body;
  } catch {
    // not JSON (e.g. an error page) — fall through
  }
  return { status: 'unavailable' };
}

// One open time, in the shape FormFields draws. Anything malformed is dropped.
function toTime(t) {
  if (!isObject(t)) return null;
  const ok = typeof t.class_id === 'string' && typeof t.class_name === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.date ?? '')
    && /^\d{2}:\d{2}$/.test(t.starts_at ?? '') && /^\d{2}:\d{2}$/.test(t.ends_at ?? '') && Number.isInteger(t.spots_left);
  return ok ? { classId: t.class_id, className: t.class_name, date: t.date, start: t.starts_at, end: t.ends_at, spotsLeft: t.spots_left } : null;
}
export const toTimes = (list) => (Array.isArray(list) ? list.map(toTime).filter(Boolean) : []);

// One booked time from the POST answer.
const toBooking = (b) => (isObject(b) && Number.isInteger(b.child)
  ? { child: b.child, className: text(b.class_name) ?? '', date: text(b.date) ?? '', start: text(b.starts_at) ?? '00:00', end: text(b.ends_at) ?? text(b.starts_at) ?? '00:00' }
  : null);

// The GET answer → what the page uses.
export function readForm(answer) {
  if (answer.status === 'closed') return { status: 'closed', schoolName: text(answer.school_name), schoolPhone: text(answer.school_phone) };
  if (answer.status !== 'ok') return { status: answer.status };
  if (!Array.isArray(answer.fields) || !Number.isInteger(answer.published_version)) return { status: 'unavailable' };
  return {
    status: 'ok',
    formName: text(answer.form_name) ?? '',
    fields: answer.fields,
    publishedVersion: answer.published_version,
    schoolName: text(answer.school_name),
    schoolPhone: text(answer.school_phone),
    thankYou: text(answer.thank_you),
    addToCalendar: answer.add_to_calendar !== false,
    times: toTimes(answer.times),
    turnstileSiteKey: text(answer.turnstile_site_key),
  };
}

// The POST answer → what the page uses.
export function readSubmit(answer) {
  if (answer.status === 'ok') return { status: 'ok', bookings: Array.isArray(answer.bookings) ? answer.bookings.map(toBooking).filter(Boolean) : [] };
  if (answer.status === 'time_taken') return { status: 'time_taken', times: Array.isArray(answer.times) ? toTimes(answer.times) : null };
  return { status: answer.status };
}

async function call(slug, init) {
  try {
    const response = await fetch(apiPath(slug), { ...init, cache: 'no-store', credentials: 'same-origin' });
    return await readAnswer(response);
  } catch {
    return { status: 'network' };
  }
}

// The form (GET).
export async function getForm(slug) {
  if (import.meta.env.MODE === 'preview') {
    const preview = await import('./publicApi.preview.js');
    return readForm(await preview.getForm(slug));
  }
  return readForm(await call(slug, { method: 'GET', headers: { Accept: 'application/json' } }));
}

// One sign-up (POST). The same submission_key on a repeat Send means it is saved only once.
export async function submitForm(slug, body) {
  if (import.meta.env.MODE === 'preview') {
    const preview = await import('./publicApi.preview.js');
    return readSubmit(await preview.submit(slug, body));
  }
  return readSubmit(await call(slug, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  }));
}
