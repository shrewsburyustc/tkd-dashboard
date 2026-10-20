// functions/api/forms/[slug].js — the Cloudflare Pages Function behind the public Forms page.
// Why it exists: the public form page (/f/<slug>, e.g. a free-class sign-up) never talks to the
// database itself. It asks this Function, which runs on Cloudflare's servers, checks the request
// (kill switch, origin, size, spam checks, Turnstile) and then calls ONE database function as
// the restricted login `forms_registrar` (migration 0009 §8–9). Build plan
// docs/Prospects/TKD-Forms-Build-Plan.md §3.
//
// How Cloudflare finds it: files under functions/ become web addresses. The [slug] in the file
// name means "any value here", handed to us as context.params.slug — so this file answers
// /api/forms/free-class and so on. public/_routes.json limits Functions to /api/*, so the static
// pages never use up the free Functions allowance.
//
// The work itself is in functions/_lib/forms/forms.js (so the tests can run it with a fake
// database). This file only connects it to the real things: the real database
// (functions/_lib/forms/db.js, through the HYPERDRIVE_FORMS binding) and the real fetch (for
// Turnstile's siteverify). It is a copy of Color Belt's functions/api/register/[code].js
// pattern; nothing of Color Belt's is changed or shared.
//
// Settings it reads (Cloudflare dashboard, Production only — never in git; SETUP §15):
//   HYPERDRIVE_FORMS     binding to its OWN Hyperdrive configuration, user forms_registrar
//                        (caching disabled)
//   PUBLIC_FORMS         "on" to accept sign-ups; anything else (or missing) = forms "not open"
//   PUBLIC_ORIGIN        e.g. https://tkd-dashboard.pages.dev (POSTs must come from here)
//   TURNSTILE_SECRET     secret for Turnstile's siteverify (the same widget as Color Belt)
//   TURNSTILE_SITE_KEY   Turnstile's PUBLIC key, handed to the page in the GET answer
//   CLIENT_KEY_SECRET    secret for the anonymous client key (functions/_lib/forms/clientKey.js)
//   RATE_LIMITER         OPTIONAL Cloudflare Rate Limiting binding. If it's there, it counts
//                        requests per client; if not, a best-effort counter in memory does
//                        (functions/_lib/forms/rateLimit.js explains the difference)
// Any missing setting = every answer is "not open" (fail closed).
//
// Emails: none for now (rulebook v0.601). They would be added later in forms.js (a Cloudflare
// web address for the school + Resend), see the note there.
import { handleGet, handlePost, handleOther } from '../../_lib/forms/forms.js';
import { openDatabase } from '../../_lib/forms/db.js';

// The real helpers. (Tests pass fake ones to handleGet / handlePost directly.)
const realDeps = {
  openDatabase,
  fetchImpl: (url, init) => fetch(url, init),
  now: () => Date.now(),
};

// One entry point for every method, so nothing falls through to anything else.
export async function onRequest(context) {
  const method = context.request.method;
  if (method === 'GET') return handleGet(context, realDeps);
  if (method === 'POST') return handlePost(context, realDeps);
  return handleOther();
}
