// functions/api/star/[code].js — the Cloudflare Pages Function behind the Star family form.
// Why it exists: the public Star registration page (/star/<code>) never talks to the database
// itself. It asks this Function, which runs on Cloudflare's servers, checks the request (kill
// switch, origin, size, spam checks, Turnstile) and then calls ONE database function as the
// restricted login `star_registrar`. CONTRACT-0006 §8.4; rulebook v0.159 (Star's own login).
// A copy of Color Belt's functions/api/register/[code].js pattern; nothing of Color Belt's is
// changed except that functions/_lib/turnstile.js now takes the expected action as a parameter.
//
// How Cloudflare finds it: files under functions/ become web addresses. The [code] in the file
// name means "any value here", handed to us as context.params.code — so this file answers
// /api/star/p4w9tdx2 and so on. public/_routes.json limits Functions to /api/*, so the static
// pages never use up the free Functions allowance.
//
// IMPORTANT: this file is deployed as soon as it reaches `main`, whatever the dashboard's
// VITE_STAR_TESTING switch says. Its only guards are the kill switch below (off unless set to
// exactly "on") and failing closed when HYPERDRIVE_STAR or any other setting is missing.
//
// The work itself is in functions/_lib/starRegister.js (so the tests can run it with a fake
// database). This file only connects it to the real things: the real database (starDb.js,
// through the HYPERDRIVE_STAR binding) and the real fetch (for Turnstile's siteverify).
//
// Settings it reads (Cloudflare dashboard, Production only — never in git; SETUP §13f and §13i):
//   HYPERDRIVE_STAR           binding to Star's OWN Hyperdrive configuration `tkd-star-registrar`
//                             (user star_registrar, caching disabled)
//   STAR_PUBLIC_REGISTRATION  "on" to accept Star registrations; anything else (or missing) =
//                             everything "not open"
//   TURNSTILE_SECRET          secret for Turnstile's siteverify      (reused from Color Belt)
//   TURNSTILE_SITE_KEY        Turnstile's PUBLIC key, for the page   (reused from Color Belt)
//   CLIENT_KEY_SECRET         secret for the anonymous client key    (reused — it MUST be the
//                             same one, so the shared 20-an-hour limit counts both forms)
//   PUBLIC_ORIGIN             e.g. https://tkd-dashboard.pages.dev   (reused)
//   RATE_LIMITER              OPTIONAL Cloudflare Rate Limiting binding. Pages Functions can't
//                             have one today (Workers only), so Star goes live without it and
//                             counts per server in memory (rulebook v0.410); used if it's there
import { handleGet, handlePost, handleOther } from '../../_lib/starRegister.js';
import { openDatabase } from '../../_lib/starDb.js';

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
