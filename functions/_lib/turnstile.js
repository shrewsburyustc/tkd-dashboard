// turnstile.js — asks Cloudflare whether the browser that sent a registration passed the
// "are you human?" check (Cloudflare Turnstile, rulebook v0.105).
// Why it exists: the page gets a one-time token from Turnstile when the family taps Send. A
// token proves nothing until OUR server shows it to Cloudflare together with the secret key
// ("siteverify"). We also check that the token was made on our own site (hostname) and for the
// registration form (action "register"), so a token from some other page can't be reused here.
// Plan §8: success, hostname = production host, action = register, remoteip.

export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
export const TURNSTILE_ACTION = 'register';

// Returns true only when Cloudflare says yes AND the hostname and action match.
// Anything else — a "no", a wrong host, a wrong action, Cloudflare not answering, an answer we
// can't read — returns false (fail closed: when in doubt, don't let it through).
//   fetchImpl     the fetch function (the real one on Cloudflare; a fake one in the tests)
//   secret        TURNSTILE_SECRET (a Cloudflare secret)
//   token         what the page sent as turnstile_token
//   ip            the visitor's IP (Cloudflare uses it as one more signal; never stored)
//   expectedHost  e.g. "tkd-dashboard.pages.dev" (taken from PUBLIC_ORIGIN)
export async function verifyTurnstile({ fetchImpl, secret, token, ip, expectedHost }) {
  // Tokens are at most 2048 characters (Cloudflare's documented limit).
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) return false;
  try {
    const form = new URLSearchParams();
    form.set('secret', secret);
    form.set('response', token);
    if (ip) form.set('remoteip', ip);
    const response = await fetchImpl(SITEVERIFY_URL, { method: 'POST', body: form });
    if (!response.ok) return false;
    const result = await response.json();
    return (
      result?.success === true &&
      result.hostname === expectedHost &&
      result.action === TURNSTILE_ACTION
    );
  } catch {
    return false;
  }
}
