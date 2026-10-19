// http.js — small helpers for the answers the registration Function sends back.
// Why it exists: every answer from /api/register/<code> has the SAME shape — a JSON object
// with a `status` code (contract 0005 §4.2) — and the same safety headers. Writing them once
// here means no answer can forget them.
//
// Note: Cloudflare's public/_headers file does NOT apply to answers made by a Function, so the
// "never store this" header (Cache-Control: no-store) has to be set here in code as well.

// The headers every answer gets.
//   Content-Type            it's JSON, written in UTF-8
//   Cache-Control: no-store no browser or proxy may keep a copy (answers can change any second,
//                           and a POST answer contains a family's details)
//   X-Content-Type-Options  the browser must trust our Content-Type and never guess another
const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

// Makes a JSON answer. HTTP status is 200 for every answer the page understands, except
// `bad_request`, which is 400 (contract 0005 §4.2) — the body has the same {status} shape.
export function jsonAnswer(body) {
  const httpStatus = body?.status === 'bad_request' ? 400 : 200;
  return new Response(JSON.stringify(body), { status: httpStatus, headers: JSON_HEADERS });
}

// The size limit for a registration sent by the page: 100 KB. A signature is at most
// 70 000 characters, so a real form is always well under this.
export const MAX_BODY_BYTES = 100 * 1024;

// Reads the request body as text, but stops (and returns null) as soon as it is bigger than
// `maxBytes`. Why not just `await request.text()`? That would read a 1 GB body into memory
// before we could refuse it. Reading piece by piece lets us give up early.
export async function readBodyLimited(request, maxBytes = MAX_BODY_BYTES) {
  // First the cheap check: the size the browser says it is sending (it can lie or leave it
  // out, so the loop below counts the real bytes too).
  const declared = request.headers.get('Content-Length');
  if (declared !== null) {
    const n = Number(declared);
    if (!Number.isFinite(n) || n < 0 || n > maxBytes) return null;
  }
  if (!request.body) return '';

  const reader = request.body.getReader();
  const pieces = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      // Too big: stop reading and tell the sender we're done with it.
      try { await reader.cancel(); } catch { /* nothing to do */ }
      return null;
    }
    pieces.push(value);
  }
  // Glue the pieces together and turn the bytes into text. `fatal: true` refuses broken UTF-8.
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const piece of pieces) {
    bytes.set(piece, offset);
    offset += piece.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}
