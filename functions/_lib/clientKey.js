// clientKey.js — turns a visitor's internet address (IP) into an anonymous "client key".
// Why it exists: the database counts registration attempts per connection to slow down spam
// (contract 0005 §1.7, rate limit), but we must never store a raw IP address — that's personal
// data. So the Function sends the database a scrambled stand-in instead:
//
//     client key = HMAC-SHA-256( CLIENT_KEY_SECRET , today's date in Massachusetts + "|" + IP )
//     (for IPv6: the address's /64 block instead of the full address — see below)
//
// HMAC is a "keyed fingerprint": the same inputs always give the same 64-character result, but
// without the secret (a Cloudflare secret, never in git) nobody can work back to the IP or even
// test a guess. Because today's date is part of the input, the key for the same IP changes every
// day at midnight, so the database can't follow one connection from day to day.
// "Massachusetts time" is the America/New_York time zone everywhere in this project.
//
// IPv6 (security review M2): one home or phone usually gets a whole block of IPv6 addresses
// (a "/64" — every address that starts with the same first 4 groups) and can pick a fresh one
// for every request. Counting per full IPv6 address would let one phone look like millions of
// visitors. So for IPv6 the key is made from the first 4 groups only (written the same way
// every time), and for IPv4 from the whole address.

// The part of the IP the key is made from: the full address for IPv4, the /64 block for IPv6
// (e.g. "2001:db8:0:12::/64"). Anything we can't read is used as it is (lower-cased), so it
// still gets a key of its own.
export function clientNetwork(ip) {
  const raw = String(ip ?? '').trim().toLowerCase();
  if (!raw.includes(':')) return raw; // IPv4 (or empty)
  const groups = expandIPv6(raw);
  if (!groups) return raw;
  // An IPv4 address written the IPv6 way (::ffff:203.0.113.7) is really that IPv4 address.
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    return [groups[6] >> 8, groups[6] & 255, groups[7] >> 8, groups[7] & 255].join('.');
  }
  return `${groups.slice(0, 4).map((g) => g.toString(16)).join(':')}::/64`;
}

// "2001:DB8::1" → [0x2001, 0xdb8, 0, 0, 0, 0, 0, 1] (8 numbers), or null if it isn't IPv6.
// Copes with "::" (a run of zero groups), leading zeros, a "%zone" ending and a dotted IPv4
// tail ("::ffff:1.2.3.4").
function expandIPv6(text) {
  let address = text.split('%')[0];
  if (address.startsWith('[') && address.endsWith(']')) address = address.slice(1, -1);
  // A dotted IPv4 tail is rewritten as the two groups it stands for (1.2.3.4 → 102:304).
  const lastColon = address.lastIndexOf(':');
  const last = address.slice(lastColon + 1);
  if (last.includes('.')) {
    const parts = last.split('.');
    if (parts.length !== 4 || !parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)) return null;
    const [a, b, c, d] = parts.map(Number);
    address = `${address.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = address.split('::');
  if (halves.length > 2) return null;
  const read = (part) => (part === '' ? [] : part.split(':'));
  const head = read(halves[0]);
  const rest = halves.length === 2 ? read(halves[1]) : [];
  if (![...head, ...rest].every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  const known = head.length + rest.length;
  // Without "::" there must be exactly 8 groups; with it, fewer than 8 (it stands for ≥ 1 zero).
  if (halves.length === 1 ? known !== 8 : known > 7) return null;
  const zeros = new Array(8 - known).fill('0');
  return [...head, ...zeros, ...rest].map((g) => parseInt(g, 16));
}

// Today's date in America/New_York as "YYYY-MM-DD". `now` is a Date (passed in so tests can
// pretend it's any day). The 'en-CA' locale happens to write dates as YYYY-MM-DD.
export function todayInNewYork(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

// Bytes → lowercase hexadecimal text (each byte becomes two characters 00–ff).
function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// The client key for this IP today (its /64 block for IPv6 — see clientNetwork). Uses the Web Crypto API (crypto.subtle), which exists both
// on Cloudflare and in Node, so the same code runs in the tests.
export async function makeClientKey(secret, ip, now = new Date()) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, // the key can't be exported again
    ['sign'],
  );
  const message = `${todayInNewYork(now)}|${clientNetwork(ip)}`;
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return toHex(signature);
}
