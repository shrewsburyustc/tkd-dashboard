// squareSignature.js — checks that a Square webhook message really came from Square.
// Why it exists: the Board breaking webhook (functions/api/square/breaking/[school].js) is open to
// the whole internet and marks students as paid, so the ONLY thing that lets a message in is a
// signature that proves Square made it. Square signs every message like this:
//
//     signature = base64( HMAC-SHA256( signature key , notification URL + raw body ) )
//
// and sends it in the header `x-square-hmacsha256-signature`. HMAC is a "keyed fingerprint": only
// someone who knows the signature key (a Cloudflare secret, never in git) can make a matching one.
// We make the same fingerprint from what we received and compare the two.
//
// The check itself uses Web Crypto's crypto.subtle.verify, which compares in constant time inside the
// platform. constantTimeEqual below is our own small version of the same idea, kept for texts that are
// not signatures and covered by its own tests.
//
// "Constant time" compare: an ordinary `a === b` stops at the first different character, so how
// long it takes could tell an attacker how many leading characters of a guess were right. The
// compare below always looks at every byte, so the time does not depend on where the texts differ.
//
// Uses Web Crypto (crypto.subtle), which exists both on Cloudflare and in Node, so the tests run
// the same code. Nothing here is ever logged.

const encoder = new TextEncoder();

// Compares two texts in constant time (for equal-length texts). Different lengths are "not equal"
// straight away — the length of a signature is not a secret (it is always 44 characters).
export function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  if (x.length !== y.length) return false;
  let difference = 0;
  for (let i = 0; i < x.length; i += 1) difference |= x[i] ^ y[i]; // 0 stays 0 only when every byte matches
  return difference === 0;
}

// Bytes → base64 text.
function toBase64(buffer) {
  let binary = '';
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

// base64 text → bytes, or null when it is not clean base64 (only A–Z a–z 0–9 + / and = at the end).
function fromBase64(text) {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text) || text.length % 4 !== 0) return null;
  try {
    return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

// The signature Square would send for this URL + body, made with this key.
export async function computeSquareSignature(signatureKey, notificationUrl, rawBody) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(signatureKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false, // the key can't be exported again
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(notificationUrl + rawBody));
  return toBase64(signature);
}

// true only when `header` (the x-square-hmacsha256-signature value) equals the signature made from
// the key, the URL and the raw body. A missing header, an empty key or any error → false (fail closed).
export async function verifySquareSignature({ signatureKey, notificationUrl, rawBody, header }) {
  try {
    if (typeof signatureKey !== 'string' || signatureKey === '') return false;
    if (typeof notificationUrl !== 'string' || notificationUrl === '') return false;
    if (typeof rawBody !== 'string' || typeof header !== 'string' || header === '') return false;
    // The header is base64 text: turn it back into bytes (not valid base64 → false) and let Web
    // Crypto check them against the HMAC of URL + body.
    const sent = fromBase64(header);
    if (sent === null) return false;
    const key = await crypto.subtle.importKey('raw', encoder.encode(signatureKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    return await crypto.subtle.verify('HMAC', key, sent, encoder.encode(notificationUrl + rawBody));
  } catch {
    return false;
  }
}
