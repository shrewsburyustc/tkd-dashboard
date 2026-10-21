// api.js — how the Star family page talks to the server.
// Why it exists: the page needs exactly two things — the event (GET) and "save this registration"
// (POST), both at /api/star/<code> (the Cloudflare Function functions/api/star/[code].js, contract
// 0006 §8.2–§8.4). It never talks to the database or Supabase directly, and holds no key.
//
// Preview mode (npm run dev:preview-mode): there is no Function on this PC, so the page uses the
// stand-in src/lib/star/publicApi.preview.js instead (same answers, data shared with the staff
// preview). `import.meta.env.MODE === 'preview'` is replaced by Vite with true/false when building;
// in the real build it is false, so the stand-in is left out completely.
//
// Both functions always resolve to an object with a `status`. A dropped connection gives
// { status: 'network' } and an answer we can't read gives { status: 'unavailable' }, so the screens
// only deal with status words.
//
//   getEvent(code) → { status:'ok', state:'open'|'not_open'|'closed'|'finished', closed_on,
//                      school:{code, name}, event:{name, testing_date, start_time 'HH:MM', note,
//                      auto_close_on, where:{name, address}}, dans:[{dan, label, star_limit,
//                      standard_cents, same_day_cents, pass_mark, max_score, categories:[{name,
//                      credits}]}], turnstile_site_key }
//                  | { status: 'not_found' | 'not_open' | 'rate_limited' | 'bad_request' | 'unavailable' | 'network' }
//   sendRegistration(code, body) → { status:'ok', reference, first_name, last_name, dan, dan_label,
//                      stars_from, stars_to, standard_cents, same_day_cents, paying_by, event_name,
//                      testing_date, start_time, school_name, where:{name, address} }
//                  | { status:'closed', closed_on } | { status: 'not_found' | 'not_open' | 'finished'
//                    | 'rate_limited' | 'invalid' | 'bad_request' | 'verify_failed' | 'unavailable' | 'network' }
//   body = { submission_id, first_name, last_name, date_of_birth, email, dan, stars_from, paying_by,
//            acknowledged, signature, ack_version, website (honeypot), started_at, sent_at, turnstile_token }
//
// An `ok` answer without the parts the page needs is treated as 'unavailable' (fail closed), so a
// broken answer never draws a half-empty form.

const apiPath = (code) => `/api/star/${encodeURIComponent(code)}`;
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isText = (v) => typeof v === 'string' && v !== '';
const isInt = (v) => Number.isInteger(v);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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

// Does the GET answer have everything the form draws?
function eventLooksRight(a) {
  const e = a.event;
  if (!isObject(e) || !isText(e.name) || !ISO_DATE.test(e.testing_date ?? '') || !isObject(a.school) || !isText(a.school.name)) return false;
  if (!Array.isArray(a.dans)) return false;
  return a.dans.every((d) => isObject(d) && isInt(d.dan) && isText(d.label) && isInt(d.star_limit) && d.star_limit >= 1
    && isInt(d.standard_cents) && isInt(d.same_day_cents) && Array.isArray(d.categories));
}
// Does the POST ok answer have everything the Registered page draws?
const registeredLooksRight = (a) => isText(a.reference) && isText(a.first_name) && isText(a.last_name) && isText(a.dan_label)
  && isInt(a.stars_from) && isInt(a.standard_cents) && isInt(a.same_day_cents) && ISO_DATE.test(a.testing_date ?? '');

// The event and what the form needs (GET).
export async function getEvent(code) {
  let answer;
  if (import.meta.env.MODE === 'preview') {
    const preview = await import('../lib/star/publicApi.preview.js');
    answer = await preview.getEvent(code);
  } else {
    try {
      const response = await fetch(apiPath(code), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        credentials: 'same-origin',
      });
      answer = await readAnswer(response);
    } catch {
      return { status: 'network' };
    }
  }
  if (answer.status === 'ok' && !eventLooksRight(answer)) return { status: 'unavailable' };
  return answer;
}

// Sends one registration (POST). `body` is the object described above.
export async function sendRegistration(code, body) {
  let answer;
  if (import.meta.env.MODE === 'preview') {
    const preview = await import('../lib/star/publicApi.preview.js');
    answer = await preview.register(code, body);
  } else {
    try {
      const response = await fetch(apiPath(code), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
        credentials: 'same-origin',
      });
      answer = await readAnswer(response);
    } catch {
      return { status: 'network' };
    }
  }
  if (answer.status === 'ok' && !registeredLooksRight(answer)) return { status: 'unavailable' };
  return answer;
}
