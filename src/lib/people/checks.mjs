// checks.mjs — Node checks for the top-bar people search's plain parts (M16; rulebook v1.144).
// Run: node src/lib/people/checks.mjs
// They test: the rules and words (rules.js), the in-memory hand-over (openPerson.js) and the preview's fake
// people_search (../mockPeople.js, which must answer by the same rules as the real database function).
import assert from 'node:assert/strict';
import * as R from './rules.js';
import * as OPEN from './openPerson.js';
import { previewPeopleSearch } from '../mockPeople.js';

let count = 0;
async function check(label, fn) {
  try {
    await fn();
    count += 1;
  } catch (error) {
    console.error(`FAIL: ${label}`);
    throw error;
  }
}

await check('rules: it starts at 2 letters and stops at 80, and the text is tidied', () => {
  assert.equal(R.cleanQuery('A'), null);
  assert.equal(R.cleanQuery('  a  '), null);
  assert.equal(R.cleanQuery('Av'), 'Av');
  assert.equal(R.cleanQuery('  Ava   Chen '), 'Ava Chen');
  assert.equal(R.cleanQuery('x'.repeat(80)), 'x'.repeat(80));
  assert.equal(R.cleanQuery('x'.repeat(81)), null);
  assert.equal(R.cleanQuery(null), null);
});

await check('rules: the top bar\'s school becomes the database\'s (Both = both)', () => {
  assert.equal(R.schoolArg('Worcester'), 'worcester');
  assert.equal(R.schoolArg('Shrewsbury'), 'shrewsbury');
  assert.equal(R.schoolArg('Both'), 'both');
  assert.equal(R.schoolArg(undefined), 'both');
});

await check('rules: the words are the ones Jeffrey chose (v1.144)', () => {
  assert.equal(R.TYPE_MORE, 'Type at least 2 letters.');
  assert.equal(R.noMatch('Zzq', 'Worcester'), 'No one matches “Zzq” at Worcester. Check the spelling, or search both schools.');
  assert.equal(R.SEARCH_PEOPLE, 'Search people');
  assert.ok(!/[\u2019\u2018]/.test(R.SEARCH_FAILED), 'straight apostrophes');
  assert.equal(R.SEARCH_FAILED, "Couldn't search. Check the connection, then retry.");
});

await check('rules: a result row becomes a result; a bad row is dropped; the detail line says event and school', () => {
  const row = { kind: 'colorbelt', id: 'a', event_id: 'e', name: 'Ava Chen', event: 'November Children Testing', school: 'worcester' };
  assert.deepEqual(R.toResult(row), { kind: 'colorbelt', id: 'a', eventId: 'e', name: 'Ava Chen', event: 'November Children Testing', school: 'worcester' });
  assert.equal(R.toResult({ ...row, kind: 'nope' }), null);
  assert.equal(R.toResult({ ...row, id: 5 }), null);
  assert.equal(R.toResult(null), null);
  assert.equal(R.detailLine(R.toResult(row)), 'November Children Testing · Worcester');
  assert.equal(R.detailLine({ kind: 'colorbelt_private', event: null, school: 'shrewsbury' }), 'Private testing · Shrewsbury');
  assert.equal(R.detailLine({ kind: 'camp', event: 'Summer Camp', school: null }), 'Summer Camp');
});

await check('rules: results are grouped by section in the listed order; empty groups are left out', () => {
  const mk = (kind, id) => ({ kind, id, eventId: null, name: id, event: null, school: null });
  const groups = R.groupResults([mk('prospect', 'p'), mk('colorbelt_private', 'cp'), mk('colorbelt', 'c'), mk('star', 's')]);
  assert.deepEqual(groups.map((g) => g.title), ['Color belt testing', 'Star testing', 'New students']);
  assert.deepEqual(groups[0].items.map((i) => i.id), ['cp', 'c'], 'Color belt shows registrations and private testings together');
});

await check('openPerson: a request is taken once, only by its own section, and only within a minute', () => {
  OPEN.clearOpenPerson();
  OPEN.requestOpenPerson({ kind: 'star', id: 's1', eventId: 'e1' }, 1000);
  assert.equal(OPEN.takeOpenPerson(['camp'], 1500), null, 'another section does not take it');
  assert.equal(OPEN.hasOpenPerson(['star'], 1500), true, 'and it stays for the owner');
  assert.deepEqual(OPEN.takeOpenPerson(['star'], 2000), { kind: 'star', id: 's1', eventId: 'e1' });
  assert.equal(OPEN.takeOpenPerson(['star'], 2100), null, 'taken once');
  OPEN.requestOpenPerson({ kind: 'camp', id: 'c1' }, 0);
  assert.equal(OPEN.takeOpenPerson(['camp'], 61000), null, 'older than a minute is dropped');
  OPEN.requestOpenPerson({ kind: 'camp', id: 'c1' }, 0);
  OPEN.clearOpenPerson();
  assert.equal(OPEN.takeOpenPerson(['camp'], 10), null, 'signing out clears it');
  OPEN.requestOpenPerson({ id: 'x' });
  assert.equal(OPEN.hasOpenPerson(['x']), false, 'a request without a kind is nothing');
});

await check('preview people_search: the real function\'s rules (invalid input, schools, withdrawn, camps for both)', () => {
  for (const bad of [undefined, null, '', 'a', ' a ', 'x'.repeat(81)]) assert.equal(previewPeopleSearch({ p_query: bad, p_school: 'both' }).status, 'invalid', `${bad}`);
  assert.equal(previewPeopleSearch({ p_query: 'Ava', p_school: 'Nope' }).status, 'invalid');
  const both = previewPeopleSearch({ p_query: 'ava', p_school: 'both' });
  assert.equal(both.status, 'ok');
  assert.deepEqual(both.results.map((r) => r.kind), ['colorbelt', 'colorbelt_private', 'star', 'star', 'black_belt', 'camp', 'camp', 'prospect'], 'kinds in order');
  assert.ok(!both.results.some((r) => r.name === 'Ava Gone'), 'a withdrawn person is left out');
  for (const r of both.results) assert.deepEqual(Object.keys(r).sort(), ['event', 'event_id', 'id', 'kind', 'name', 'school'], 'six keys only');
  const w = previewPeopleSearch({ p_query: 'ava', p_school: 'worcester' }).results;
  assert.ok(w.every((r) => r.school === 'worcester' || r.school === null), 'one school keeps that school and camps for both');
  assert.ok(w.some((r) => r.name === 'Ava Park' && r.school === null), 'a camp for both schools shows for either');
  assert.equal(previewPeopleSearch({ p_query: 'AVA R', p_school: '' }).results.find((r) => r.kind === 'prospect').name, 'Ava R.', 'case does not matter, a blank school is both, New students are Ava R.');
  assert.equal(previewPeopleSearch({ p_query: 'zzzz', p_school: 'both' }).results.length, 0);
  assert.equal(previewPeopleSearch({ p_query: 'a%', p_school: 'both' }).results.length, 0, 'a typed % is a plain character');
});

console.log(`${count} groups of checks ran.`);
console.log('ALL PEOPLE SEARCH CHECKS PASSED');