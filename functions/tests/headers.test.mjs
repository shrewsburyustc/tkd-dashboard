// headers.test.mjs — tests for public/_headers and public/_redirects (what Cloudflare Pages sends with every page).
// Why it exists: every public family page must refuse to be shown inside another website
// ("frame-ancestors 'none'") and keep the strict script/connect policy, and every family link
// shape needs its address rule. A new page (Board Breaking's /breaking, the next section's page) is
// easy to add without its lines, or with a looser copy; this proves each line is there and the same.
// How to run (from the project folder):   node --test functions/tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const headersText = readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const redirectsText = readFileSync(new URL('../../public/_redirects', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// _headers → { '/camp': ['Content-Security-Policy: …'], … }  (a path line has no indent, its headers do)
function parseHeaders(text) {
  const blocks = new Map();
  let current = null;
  for (const line of text.split('\n')) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      current = line.trim();
      if (!blocks.has(current)) blocks.set(current, []);
    } else if (current) {
      blocks.get(current).push(line.trim());
    }
  }
  return blocks;
}
const blocks = parseHeaders(headersText);
const cspOf = (path) => (blocks.get(path) ?? []).filter((l) => l.startsWith('Content-Security-Policy:'));

// The public family pages' addresses, written out exactly as public/_headers has them (the page file is
// served at /name; Forms' page is forms.html and its links are /f/<name>, so it has /f and /forms).
const PUBLIC_PATHS = [
  '/register', '/register.html', '/register/*',
  '/camp', '/camp.html', '/camp/*',
  '/f', '/f/*', '/forms', '/forms.html',
  '/star', '/star.html', '/star/*', '/star-closed', '/star-closed.html',
  '/black-belt', '/black-belt.html', '/black-belt/*',
  '/breaking', '/breaking.html', '/breaking/*',
];

test('headers: every public family page address has exactly one strict policy that refuses framing', () => {
  for (const path of PUBLIC_PATHS) {
    const csp = cspOf(path);
    assert.equal(csp.length, 1, `${path}: one Content-Security-Policy line`);
    assert.match(csp[0], /frame-ancestors 'none'/, `${path}: never shown inside another website`);
    assert.match(csp[0], /connect-src 'self'/, `${path}: talks only to this site`);
    assert.match(csp[0], /default-src 'self'/, `${path}: nothing from other sites by default`);
    assert.match(csp[0], /base-uri 'none'/, `${path}: base-uri`);
    assert.match(csp[0], /form-action 'self'/, `${path}: form-action`);
  }
});

test('headers: the Board Breaking page (/breaking, /breaking.html, /breaking/*) has the same policy as /camp, copied exactly', () => {
  const camp = cspOf('/camp')[0];
  assert.ok(camp);
  for (const path of ['/breaking', '/breaking.html', '/breaking/*']) assert.equal(cspOf(path)[0], camp, path);
});

test('headers: every public page address has the same policy as /camp (so a looser copy cannot slip in)', () => {
  const camp = cspOf('/camp')[0];
  for (const path of PUBLIC_PATHS) assert.equal(cspOf(path)[0], camp, path);
});

test('headers: no path anywhere allows framing (every frame-ancestors says none)', () => {
  const all = headersText.split('\n').filter((l) => /^\s+Content-Security-Policy:/.test(l) && l.includes('frame-ancestors'));
  assert.ok(all.length >= PUBLIC_PATHS.length + 1);
  for (const line of all) assert.match(line, /frame-ancestors 'none'/, line);
  // Only real header lines (indented), not the comments that mention the name.
  const xfo = headersText.split('\n').filter((l) => /^\s+X-Frame-Options:/i.test(l));
  assert.ok(xfo.length >= 1);
  for (const line of xfo) assert.equal(line.trim(), 'X-Frame-Options: DENY', 'X-Frame-Options is only ever DENY');
});

test('headers: the catch-all /* block frames nothing, is not indexed by search engines, and stays safe', () => {
  const all = blocks.get('/*') ?? [];
  assert.ok(all.includes('X-Frame-Options: DENY'));
  assert.ok(all.includes("Content-Security-Policy: frame-ancestors 'none'"));
  assert.ok(all.includes('X-Robots-Tag: noindex, nofollow'));
  assert.ok(all.includes('X-Content-Type-Options: nosniff'));
});

test('headers: answers from /api/* are never stored', () => {
  assert.ok((blocks.get('/api/*') ?? []).includes('Cache-Control: no-store'));
});

test('redirects: each family link shape serves its ONE page', () => {
  const rules = redirectsText.split('\n').filter((l) => l.trim() !== '' && !l.trim().startsWith('#')).map((l) => l.trim().split(/\s+/));
  const has = (from, to) => assert.ok(rules.some((r) => r[0] === from && r[1] === to && r[2] === '200'), `${from} → ${to}`);
  has('/register/*', '/register');
  has('/camp/*', '/camp');
  has('/f', '/forms');
  has('/f/*', '/forms');
  has('/black-belt/*', '/black-belt');
  has('/breaking/*', '/breaking');
});
