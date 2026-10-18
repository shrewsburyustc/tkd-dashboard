// functions/api/register/[code].js — the Cloudflare Pages Function behind the family form.
// Why it exists: the public registration page (/register/<code>) never talks to the database
// itself. It asks this Function, which runs on Cloudflare's servers, checks the request
// (kill switch, origin, size, spam checks, Turnstile) and then calls ONE database function as
// the restricted login `testing_registrar`. Contract 0005 §4.2; plan §2 has the picture.
//
// How Cloudflare finds it: files under functions/ become web addresses. The [code] in the file
// name means "any value here", handed to us as context.params.code — so this file answers
// /api/register/p4w9tdx2 and so on. public/_routes.json limits Functions to /api/*, so the
// static pages never use up the free Functions allowance.
//
// The work itself is in functions/_lib/register.js (so the tests can run it with a fake
// database). This file only connects it to the real things: the real database (db.js, through
// the HYPERDRIVE binding) and the real fetch (for Turnstile's siteverify).
//
// Settings it reads (Cloudflare dashboard, Production only — never in git):
//   HYPERDRIVE           binding to the database connection (caching disabled — SETUP §12)
//   TURNSTILE_SECRET     secret for Turnstile's siteverify
//   CLIENT_KEY_SECRET    secret for the anonymous client key (clientKey.js)
//   PUBLIC_REGISTRATION  "on" to accept registrations; anything else = everything "not open"
//   PUBLIC_ORIGIN        e.g. https://tkd-dashboard.pages.dev (POSTs must come from here)
//   TURNSTILE_SITE_KEY   Turnstile's PUBLIC key, handed to the page
//   RATE_LIMITER         OPTIONAL Cloudflare Rate Limiting binding. If it's there, it counts
//                        requests per client; if not, a best-effort counter in memory does
//                        (functions/_lib/rateLimit.js explains the difference)
import { handleGet, handlePost, handleOther } from '../../_lib/register.js';
import { openDatabase } from '../../_lib/db.js';

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
