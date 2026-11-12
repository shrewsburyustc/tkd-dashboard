// origins.js — which web addresses may send sign-ups to our public-form Functions.
// Why it exists (domain plan, rulebook v1.200): every public form Function (Color Belt, Camps, Star,
// Black Belt, Forms, and any new one) must refuse a sign-up that was not sent from one of OUR own
// pages — the browser adds an `Origin` header that a page on another website can't fake. Until now
// each Function compared that header with ONE address (the Cloudflare setting PUBLIC_ORIGIN). The
// school now has two addresses for the same site (tkd-dashboard.pages.dev and, soon, one on
// ustaekwondo.net), and printed QR codes must keep working on the old one. So PUBLIC_ORIGIN is now
// a LIST: addresses separated by commas, e.g.
//     https://tkd-dashboard.pages.dev,https://app.ustaekwondo.net
// ONE shared helper (this file) does the check for every Function, so a new Function can't invent
// its own, looser version.
//
// The rules (kept strict on purpose; the tests prove each one):
//   - An address is `https://` + host, with NO path, NO trailing slash and NO wildcard (a browser's
//     Origin header never has them). A pasted "https://app.example.net/" is tidied to its origin.
//   - The browser's Origin must equal one entry EXACTLY (so https://app.example.net.evil.example,
//     http://app.example.net or a sub-domain we did not list are all refused). No Origin header at
//     all (a plain script, not a browser) is refused too.
//   - Empty entries (a stray comma) are ignored; an empty setting allows nothing.
//   - Turnstile (the "are you human" check) is then told to expect the hostname of the SAME address
//     the request came from — never "any hostname on the list" — so the check stays exact.
//
// The functions:
//   parseOrigins(value)          → the list of allowed addresses from the setting (always an array)
//   matchOrigin(request, env)    → the allowed address this request came from, or null (= refuse)
//   hostOf(origin)               → that address's hostname for Turnstile, or null when it isn't a web address
//
// How a Function uses it (three lines; the five existing Functions all look like this):
//   const origin = matchOrigin(request, env);
//   if (origin === null) return { status: 'bad_request' };
//   const expectedHost = hostOf(origin);
//   if (expectedHost === null) return { status: 'not_open' }; // the setting isn't a web address

// Splits the PUBLIC_ORIGIN setting into its addresses. Anything that is not text gives an empty list.
export function parseOrigins(value) {
  if (typeof value !== 'string') return [];
  const list = [];
  for (const piece of value.split(',')) {
    const entry = piece.trim();
    if (entry === '') continue;
    const tidy = tidyOrigin(entry);
    if (!list.includes(tidy)) list.push(tidy);
  }
  return list;
}

// "https://app.example.net/" → "https://app.example.net". Anything that is not an http(s) address
// is kept as typed: it can then never equal a real Origin header, except in the odd test where the
// setting and the header are the same text (then hostOf says "not a web address" → not_open).
function tidyOrigin(entry) {
  try {
    const url = new URL(entry);
    if ((url.protocol === 'https:' || url.protocol === 'http:') && url.username === '' && url.password === '') {
      return url.origin;
    }
  } catch {
    // not a web address: fall through
  }
  return entry;
}

// The list entry that this request's Origin header equals exactly, or null.
export function matchOrigin(request, env) {
  const sent = request.headers.get('Origin');
  if (typeof sent !== 'string' || sent === '') return null;
  return parseOrigins(env?.PUBLIC_ORIGIN).includes(sent) ? sent : null;
}

// The hostname Turnstile must report for an address, or null if it isn't a web address.
export function hostOf(origin) {
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.username !== '' || url.password !== '') return null; // an address with a login in it is never trusted
    return url.hostname === '' ? null : url.hostname;
  } catch {
    return null;
  }
}
