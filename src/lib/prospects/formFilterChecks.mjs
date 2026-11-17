// formFilterChecks.mjs — checks for the merged Prospects | Forms section and its "Forms" filter (Jeffrey 2026-11-17):
// the addresses (#prospects, #prospects/forms, the old #forms), the tab rules in pageAddress.js, and the filter's words.
// Run: node src/lib/prospects/formFilterChecks.mjs   (also picked up by docs/Dashboard Core/tools/run-checks.mjs)
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// pageAddress.js reads window.location; give it a tiny stand-in
globalThis.window = { location: { pathname: '/', search: '', hash: '' } };
const at = (hash) => { window.location.hash = hash; };
// pageAddress.js asks features.js (a Vite file: import.meta.env) which build switches are on; here both are off.
const source = readFileSync(new URL('../pageAddress.js', import.meta.url), 'utf8')
  .replace(/import \{[^}]*\} from '\.\/features\.js';/, 'const BOARD_BREAKING_ON = false; const STAR_TESTING_ON = false;');
const dir = mkdtempSync(join(tmpdir(), 'pageaddress-'));
writeFileSync(join(dir, 'pageAddress.mjs'), source);
const { routeFromAddress, routeIsUnknown, correctedAddress, addressForRoute, addressFor, routeTab, hasAddressTabs, sameRoute, samePage } = await import(pathToFileURL(join(dir, 'pageAddress.mjs')).href);
const T = await import('../../screens/prospects/text.js');
let n = 0;
const ok = (label, fn) => { fn(); n += 1; console.log(`ok  ${label}`); };

ok('#prospects opens the Prospects tab (first), #prospects/forms the Forms tab', () => {
  at('#prospects');
  assert.deepEqual(routeFromAddress(), { section: 'prospects', testingPage: null, eventId: null, eventTab: 'prospects', privateId: null });
  assert.equal(correctedAddress(), null);
  at('#prospects/forms');
  assert.equal(routeFromAddress().section, 'prospects');
  assert.equal(routeFromAddress().eventTab, 'forms');
  assert.equal(correctedAddress(), null);
  assert.equal(routeIsUnknown(), false);
});

ok('the old #forms address opens the Forms tab and is corrected to #prospects/forms', () => {
  at('#forms');
  assert.equal(routeIsUnknown(), false);
  assert.equal(routeFromAddress().section, 'prospects');
  assert.equal(routeFromAddress().eventTab, 'forms');
  assert.equal(correctedAddress(), '/#prospects/forms');
});

ok('an unknown ending is not a page; addresses are written back the same way', () => {
  at('#prospects/nonsense');
  assert.equal(routeIsUnknown(), true);
  assert.equal(addressForRoute({ section: 'prospects', eventTab: 'forms' }), '/#prospects/forms');
  assert.equal(addressForRoute({ section: 'prospects', eventTab: 'prospects' }), '/#prospects');
  assert.equal(addressForRoute({ section: 'prospects', eventTab: 'students' }), '/#prospects'); // any other tab word = the first tab
  assert.equal(addressFor('prospects'), '/#prospects'); // the rail opens the Prospects tab
});

ok('the tab is a Prospects tab only: routeTab, hasAddressTabs, sameRoute', () => {
  assert.equal(routeTab('prospects', null, null, 'forms'), 'forms');
  assert.equal(routeTab('prospects', null, null, undefined), 'prospects');
  assert.equal(routeTab('prospects', null, null, 'students'), 'prospects');
  assert.equal(routeTab('calendar', null, null, 'forms'), 'students'); // other sections never get a Forms tab
  assert.equal(hasAddressTabs({ section: 'prospects' }), true);
  const a = { section: 'prospects', testingPage: null, eventId: null, eventTab: 'prospects', privateId: null };
  const b = { ...a, eventTab: 'forms' };
  assert.equal(samePage(a, b), true, 'switching tabs never leaves the page');
  assert.equal(sameRoute(a, b), false, 'but it is another route');
  assert.equal(sameRoute(a, { ...a, eventTab: 'students' }), true);
});

ok('the filter\'s words: the button, the menu rows, the line under the search row', () => {
  assert.equal(T.formsButton(0, [], 3), 'Forms: All forms');
  assert.equal(T.formsButton(1, ['Visitor Information'], 3), 'Forms: Visitor Information');
  assert.equal(T.formsButton(2, ['A', 'B'], 3), 'Forms: 2 of 3 forms');
  assert.equal(T.formOption('Visitor Information', 4, ''), 'Visitor Information · 4');
  assert.equal(T.formOption('Visitor Information', 4, 'Worcester'), 'Visitor Information · Worcester · 4');
  assert.equal(T.showingForms(4, 10, ['Visitor Information']), 'Showing 4 of 10 prospects from Visitor Information');
  assert.equal(T.showingForms(7, 10, ['A', 'B']), 'Showing 7 of 10 prospects from A and B');
  assert.equal(T.showingForms(8, 10, ['A', 'B', 'C']), 'Showing 8 of 10 prospects from 3 forms');
  assert.equal(T.TAB_PROSPECTS, 'Prospects');
  assert.equal(T.TAB_FORMS, 'Forms');
});

console.log(`ALL FORM FILTER CHECKS PASSED (${n} checks)`);
