// forms/rateLimit.js — slows down one connection that sends far too many requests to the
// Forms public Function.
// Why it exists: every GET or POST that gets past the cheap checks opens a database connection.
// Someone hammering /api/forms/<slug> could use up the database's connections (or the free
// allowance) without ever signing anyone up. So, BEFORE any database connection is opened, the
// Function asks "has this client sent too many requests lately?" and, if so, answers
// {status:'rate_limited'} straight away.
//
// A COPY of functions/_lib/rateLimit.js (Color Belt; copied, not shared — build plan §8). The
// only change: every key starts with "forms:", so if both Functions use the same RATE_LIMITER
// binding, a family using one form doesn't use up their allowance on the other. This copy also
// has its own in-memory counter.
//
// "This client" = the anonymous client key (clientKey.js — a scrambled stand-in for the IP,
// never the IP itself) plus the method, so a flood of GETs doesn't block that family's POST.
//
// Two ways to count, best first:
//   1. Cloudflare's Rate Limiting binding, if the Pages project has one named RATE_LIMITER.
//      Cloudflare counts across all its servers. We call `await env.RATE_LIMITER.limit({ key })`
//      and it answers `{ success }` — false means "over the limit". The limit itself (e.g. 60
//      per 60 seconds) is set where the binding is set up, not here.
//   2. Otherwise a small counter kept in this Function's memory (below). BEST EFFORT ONLY:
//      Cloudflare runs many copies of the Function ("isolates") on many servers and throws them
//      away whenever it likes, and each copy has its own counter. It still stops one connection
//      that hammers the same copy, which is the common case for a simple flood.
// What really protects what: a POST (sign-up) is covered by the database's own per-client
// limit (forms_public_attempts: 20 an hour, 120 with a kiosk token) and by Turnstile. A GET
// (showing the form) has only this file: the optional RATE_LIMITER binding, or else the
// best-effort memory counter. A Cloudflare WAF rate-limiting rule on /api/forms/* only becomes
// possible once the school has its own domain (SETUP §12a step 5 explains why).

// The in-memory limit: at most 60 requests per 60 seconds per key.
export const MEMORY_LIMIT = 60;
export const MEMORY_WINDOW_MS = 60_000;
// At most this many keys are remembered, so a flood of DIFFERENT keys can't fill the memory.
export const MEMORY_MAX_KEYS = 5000;

// A fixed-window counter: for each key, when its window started and how many requests came in.
export class MemoryRateLimiter {
  constructor({ limit = MEMORY_LIMIT, windowMs = MEMORY_WINDOW_MS, maxKeys = MEMORY_MAX_KEYS } = {}) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.maxKeys = maxKeys;
    this.counts = new Map(); // key → { start, count }; a Map remembers the order keys arrived
  }

  // true = allowed, false = over the limit. `nowMs` is passed in so tests can move the clock.
  allow(key, nowMs) {
    let entry = this.counts.get(key);
    if (!entry || nowMs - entry.start >= this.windowMs) {
      // A new window for this key. Forget it first so it moves to the "newest" end of the Map.
      this.counts.delete(key);
      if (this.counts.size >= this.maxKeys) this.forgetOld(nowMs);
      entry = { start: nowMs, count: 0 };
      this.counts.set(key, entry);
    }
    entry.count += 1;
    return entry.count <= this.limit;
  }

  // Makes room: drops every key whose window is over, and if that isn't enough, the oldest
  // ones (the Map lists them oldest first).
  forgetOld(nowMs) {
    for (const [key, entry] of this.counts) {
      if (nowMs - entry.start >= this.windowMs) this.counts.delete(key);
    }
    while (this.counts.size >= this.maxKeys) {
      const oldest = this.counts.keys().next().value;
      this.counts.delete(oldest);
    }
  }
}

// The one counter for this copy of the Function (each Cloudflare isolate gets its own).
const sharedMemoryLimiter = new MemoryRateLimiter();

// Is this request allowed? `clientKey` comes from clientKey.js, `method` is 'GET' or 'POST'.
// `memoryLimiter` lets the tests use a fresh counter; the real Function uses the shared one.
// If the Cloudflare binding throws, the error goes up to the caller, which answers
// "unavailable" (fail closed).
export async function allowRequest({ env, clientKey, method, nowMs, memoryLimiter = sharedMemoryLimiter }) {
  const key = `forms:${clientKey}:${method}`; // "forms:" keeps these apart from Color Belt's
  if (env?.RATE_LIMITER && typeof env.RATE_LIMITER.limit === 'function') {
    const outcome = await env.RATE_LIMITER.limit({ key });
    return outcome?.success === true;
  }
  return memoryLimiter.allow(key, nowMs);
}
