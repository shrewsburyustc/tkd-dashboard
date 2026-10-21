// functions/api/camp/[code].js — the Cloudflare Pages Function behind the camp sign-up form.
// Why it exists: the public camp page (/camp/<code>) never talks to the database itself. It asks
// this Function, which runs on Cloudflare's servers, checks the request (kill switch, origin,
// size, field limits, spam checks, Turnstile) and then calls ONE database function as the
// restricted login `camps_registrar`. Contract 0013 §4.2; a copy of api/register/[code].js.
//
// How Cloudflare finds it: files under functions/ become web addresses. The [code] in the file
// name means "any value here", handed to us as context.params.code — so this file answers
// /api/camp/p4w9tdx2 and so on. public/_routes.json already limits Functions to /api/*.
//
// The work itself is in functions/_lib/camp.js (so the tests can run it with a fake database).
// This file only connects it to the real things: the real database (campDb.js, through the
// HYPERDRIVE_CAMPS binding) and the real fetch (for Turnstile's siteverify).
//
// Settings it reads (Cloudflare dashboard, Production only — never in git):
//   HYPERDRIVE_CAMPS     binding to the database connection as camps_registrar (caching disabled)
//   CAMPS_REGISTRATION   "on" to accept camp sign-ups; anything else = everything "not open"
//   TURNSTILE_SECRET     secret for Turnstile's siteverify (same as Color Belt)
//   TURNSTILE_SITE_KEY   Turnstile's PUBLIC key, handed to the page (same as Color Belt)
//   CLIENT_KEY_SECRET    secret for the anonymous client key (same as Color Belt)
//   PUBLIC_ORIGIN        e.g. https://tkd-dashboard.pages.dev (POSTs must come from here)
//   RATE_LIMITER         not set up on purpose (rulebook v0.410: Pages Functions can't have it);
//                        the per-server limiter, Turnstile, the login's limits and the off switch protect it
import { handleGet, handlePost, handleOther } from '../../_lib/camp.js';
import { openCampDatabase } from '../../_lib/campDb.js';

// The real helpers. (Tests pass fake ones to handleGet / handlePost directly.)
const realDeps = {
  openDatabase: openCampDatabase,
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
