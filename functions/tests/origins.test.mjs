// origins.test.mjs — tests for the shared "which addresses may post sign-ups" helper.
// Why it exists: functions/_lib/origins.js decides, for EVERY public form Function, whether a request
// came from one of our own pages. A mistake there either blocks families or lets another website
// post into our forms, so each rule is proven here on its own.
// How to run (from the project folder):   node --test functions/tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostOf, matchOrigin, parseOrigins } from '../_lib/origins.js';

const asRequest = (origin) => new Request('https://app.example-school.net/api/x', { method: 'POST', headers: origin === undefined ? {} : { Origin: origin } });

test('parseOrigins: one address, a comma list, spaces, stray commas, a trailing slash, duplicates', () => {
  assert.deepEqual(parseOrigins('https://a.example'), ['https://a.example']);
  assert.deepEqual(parseOrigins('https://a.example,https://b.example'), ['https://a.example', 'https://b.example']);
  assert.deepEqual(parseOrigins(' https://a.example , ,https://b.example,'), ['https://a.example', 'https://b.example']);
  assert.deepEqual(parseOrigins('https://a.example/'), ['https://a.example']); // pasted with a slash: tidied
  assert.deepEqual(parseOrigins('https://a.example/path?x=1'), ['https://a.example']); // only the origin is ever kept
  assert.deepEqual(parseOrigins('https://A.example,https://a.example'), ['https://a.example']); // host names are not case-sensitive
  assert.deepEqual(parseOrigins('https://a.example:8443'), ['https://a.example:8443']);
});

test('parseOrigins: missing, empty or non-text settings allow nothing', () => {
  for (const value of [undefined, null, '', ' ', ',', 42, {}, []]) assert.deepEqual(parseOrigins(value), [], String(value));
});

test('parseOrigins: something that is not a web address is kept as typed (it can never equal a real Origin header)', () => {
  assert.deepEqual(parseOrigins('not a url'), ['not a url']);
  assert.deepEqual(parseOrigins('ftp://a.example'), ['ftp://a.example']);
  assert.deepEqual(parseOrigins('https://user:pw@a.example'), ['https://user:pw@a.example']); // never tidied into a trusted origin
});

test('matchOrigin: the exact listed address matches and is returned', () => {
  const env = { PUBLIC_ORIGIN: 'https://tkd-dashboard.pages.dev,https://app.example-school.net' };
  assert.equal(matchOrigin(asRequest('https://tkd-dashboard.pages.dev'), env), 'https://tkd-dashboard.pages.dev');
  assert.equal(matchOrigin(asRequest('https://app.example-school.net'), env), 'https://app.example-school.net');
});

test('matchOrigin: look-alikes, other schemes, other ports, sub-domains, wildcards, "null" and no header are all refused', () => {
  const env = { PUBLIC_ORIGIN: 'https://app.example-school.net' };
  for (const bad of [
    'https://app.example-school.net.evil.example',
    'https://evilapp.example-school.net',
    'https://x.app.example-school.net',
    'https://example-school.net',
    'https://www.example-school.net',
    'http://app.example-school.net',
    'https://app.example-school.net:8443',
    'https://app.example-school.net/',
    'https://APP.example-school.net',
    '*',
    'null',
    '',
    undefined,
  ]) {
    assert.equal(matchOrigin(asRequest(bad), env), null, String(bad));
  }
});

test('matchOrigin: a list entry like "*" or an empty entry never matches anything', () => {
  assert.equal(matchOrigin(asRequest('https://anything.example'), { PUBLIC_ORIGIN: '*' }), null);
  assert.equal(matchOrigin(asRequest('https://anything.example'), { PUBLIC_ORIGIN: 'https://*.example' }), null);
  assert.equal(matchOrigin(asRequest(''), { PUBLIC_ORIGIN: ',' }), null);
});

test('matchOrigin: no setting (or no env) allows nothing', () => {
  assert.equal(matchOrigin(asRequest('https://a.example'), {}), null);
  assert.equal(matchOrigin(asRequest('https://a.example'), undefined), null);
  assert.equal(matchOrigin(asRequest('https://a.example'), { PUBLIC_ORIGIN: '' }), null);
});

test('hostOf: the host Turnstile must report; null for anything that is not a web address', () => {
  assert.equal(hostOf('https://tkd-dashboard.pages.dev'), 'tkd-dashboard.pages.dev');
  assert.equal(hostOf('https://app.example-school.net'), 'app.example-school.net');
  assert.equal(hostOf('https://a.example:8443'), 'a.example'); // Turnstile reports the host without the port
  for (const bad of ['https://u:p@a.example', 'not a url', '', 'ftp://a.example', 'javascript:alert(1)', undefined, null, 42]) assert.equal(hostOf(bad), null, String(bad));
});
