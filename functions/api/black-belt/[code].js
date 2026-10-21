// functions/api/black-belt/[code].js — the Cloudflare Pages Function behind the Black Belt
// family form.
// Why it exists: the public Black Belt registration page (/black-belt/<code>) never talks to
// the database itself. It asks this Function, which runs on Cloudflare's servers, checks the
// request (kill switch, origin, size, spam checks, Turnstile) and then calls ONE database
// function as the restricted login `bb_registrar`. CONTRACT-0016-B1 §4.7, CONTRACT-0016 §9.
//
// How Cloudflare finds it: files under functions/ become web addresses. The [code] in the file
// name means "any value here", handed to us as context.params.code — so this file answers
// /api/black-belt/p4w9tdx2 and so on. public/_routes.json limits Functions to /api/*, so the
// static pages never use up the free Functions allowance.
//
// The work itself is in functions/_lib/bbRegister.js (so the tests can run it with a fake
// database). This file only connects it to the real things: the real database (bbDb.js,
// through the HYPERDRIVE_BB binding) and the real fetch (for Turnstile's siteverify). It is a
// copy of Color Belt's functions/api/register/[code].js; nothing of Color Belt's is changed.
//
// Settings it reads (Cloudflare dashboard, Production only — never in git; set up at CP5):
//   HYPERDRIVE_BB           binding to its OWN Hyperdrive configuration (tkd-bb-registrar,
//                           user bb_registrar, caching disabled)
//   BB_PUBLIC_REGISTRATION  "on" to accept registrations; anything else (or missing) =
//                           everything "not open"
//   PUBLIC_ORIGIN           e.g. https://tkd-dashboard.pages.dev (POSTs must come from here)
//   TURNSTILE_SECRET        secret for Turnstile's siteverify (shared with Color Belt)
//   TURNSTILE_SITE_KEY      Turnstile's PUBLIC key, handed to the page in the GET answer
//   CLIENT_KEY_SECRET       secret for the anonymous client key (functions/_lib/clientKey.js;
//                           the same secret as Color Belt, so the database's 20-per-hour limit
//                           counts every form's tries together)
//   RATE_LIMITER            OPTIONAL Cloudflare Rate Limiting binding (functions/_lib/rateLimit.js)
// Any missing setting = every answer is "not open" (fail closed).
import { handleGet, handlePost, handleOther } from '../../_lib/bbRegister.js';
import { openDatabase } from '../../_lib/bbDb.js';

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
