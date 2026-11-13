// functions/api/breaking/[code].js — the Cloudflare Pages Function behind the Board breaking family form.
// Why it exists: the public page (/breaking/<code>) never talks to the database itself. It asks this
// Function, which runs on Cloudflare's servers, checks the request (kill switch, origin, size, field
// limits, spam checks, Turnstile), calls ONE of four database functions as the restricted login
// `brk_registrar`, and — for Card — asks Square for a payment link. Contract 0051 §5; docs/Board
// Breaking/FUNCTION-API.md; a copy of api/camp/[code].js.
//
// How Cloudflare finds it: files under functions/ become web addresses. The [code] in the file name
// means "any value here", handed to us as context.params.code — so this file answers
// /api/breaking/p4w9tdx2 and so on. public/_routes.json already limits Functions to /api/*.
//
// The work itself is in functions/_lib/breaking.js (so the tests can run it with a fake database,
// a fake Turnstile and a fake Square). This file only connects it to the real things: the real
// database (brkDb.js, through the HYPERDRIVE_BREAKING binding) and the real fetch (for Turnstile
// and Square).
//
// Settings it reads (Cloudflare dashboard, Production only — never in git):
//   HYPERDRIVE_BREAKING       binding to the database connection as brk_registrar (caching disabled)
//   BREAKING_REGISTRATION     "on" to accept sign-ups; anything else = everything "not open"
//   TURNSTILE_SECRET          secret for Turnstile's siteverify (same as the other forms)
//   TURNSTILE_SITE_KEY        Turnstile's PUBLIC key, handed to the page (same as the other forms)
//   CLIENT_KEY_SECRET         secret for the anonymous client key (same as the other forms)
//   PUBLIC_ORIGIN             our own web addresses, comma-separated (functions/_lib/origins.js)
//   SQUARE_ENVIRONMENT_<SCHOOL>, SQUARE_ACCESS_TOKEN_<SCHOOL>, SQUARE_LOCATION_ID_<SCHOOL>
//                             that school's Square set (WORCESTER / SHREWSBURY); an incomplete set
//                             means that school's card students are told to pay at the front desk
//   RATE_LIMITER              not set up on purpose (Pages Functions can't have it); the per-server
//                             limiter, Turnstile, the login's limits and the off switch protect it
import { handleGet, handlePost, handleOther } from '../../_lib/breaking.js';
import { openBreakingDatabase } from '../../_lib/brkDb.js';

// The real helpers. (Tests pass fake ones to handleGet / handlePost directly.)
const realDeps = {
  openDatabase: openBreakingDatabase,
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
