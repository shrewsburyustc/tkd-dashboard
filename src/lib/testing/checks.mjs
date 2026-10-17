// checks.mjs — automatic checks for the Testing data layer. Run:  node src/lib/testing/checks.mjs
// Why it exists: names.js, money.js, rankOrder.js and the preview database (mockTesting.js) carry
// rules that must match the real database exactly. These plain `assert` checks run in a few
// milliseconds without a browser or a database, and print ALL TESTING LIB CHECKS PASSED.
// The preview-database part replays the database test scenarios (contract 0003 §3, T5–T23)
// that don't need real sign-in sessions.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NAME_MAX, normalizeName, nameProblem, nameLength, findDuplicateClass, findDuplicateRank } from './names.js';
import { MAX_PRICE_CENTS, MAX_PRICE_DOLLARS, formatDollars, centsToInputText, parseDollars, isValidCents } from '../money.js';
import {
  withTestingFor, moveId, reorderRanksLocal, reorderClassesLocal, finalAwardOptions, describeAddRank,
  describeRankDelete, describeClassDelete, checkUndoAddRank, classOrderIds, rankOrderIds,
  FINAL_AWARD_NONE, finalAwardChoiceOf, finalAwardArgs,
} from './rankOrder.js';
import { createTestingBackend, defaultTestingData, TESTING_RPC_NAMES } from '../mockTesting.js';
import {
  BELT_COLORS, BELT_PATTERNS, BELT_END_STRIPES_MAX, DEFAULT_END_STRIPE_COLOR, PLAIN_WHITE_BELT,
  validateBelt, describeBelt, defaultBeltFor, beltOf, sameBelt,
} from './belts.js';

let count = 0;
function check(label, fn) {
  try {
    fn();
    count += 1;
  } catch (error) {
    console.error(`FAILED: ${label}`);
    throw error;
  }
}

// ======================= names.js =======================

check('names: normalize', () => {
  assert.equal(normalizeName('  Group   E  '), 'Group E');
  assert.equal(normalizeName('High\tGreen'), 'High Green');
  assert.equal(normalizeName('High Green'), 'High Green');
  assert.equal(normalizeName('a \t\n\r\v\f  b'), 'a b');
  assert.equal(normalizeName(null), '');
  assert.equal(normalizeName(undefined), '');
  assert.equal(normalizeName(' x '), ' x '); // only plain spaces are trimmed (like btrim)
});

check('names: problems', () => {
  assert.equal(NAME_MAX, 60);
  assert.equal(nameProblem(''), 'empty');
  assert.equal(nameProblem('   '), 'empty');
  assert.equal(nameProblem(null), 'empty');
  assert.equal(nameProblem('x'.repeat(61)), 'tooLong');
  assert.equal(nameProblem('x'.repeat(60)), null);
  assert.equal(nameProblem(` ${'x'.repeat(60)}  `), null); // trimmed first
  assert.equal(nameProblem(`Red${String.fromCharCode(7)}`), 'badCharacter');
  assert.equal(nameProblem(`${'x'.repeat(70)}\u0007`), 'badCharacter'); // checked before length
  assert.equal(nameProblem('a\u0085b'), 'badCharacter'); // U+0085 is in 7F–9F
  assert.equal(nameProblem('a\u000bb'), null); // vertical tab is a blank → becomes a space
  // Zero-width / text-direction / invisible format characters (security review amendment).
  const invisible = [0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e,
    0x2060, 0x2061, 0x2062, 0x2063, 0x2064, 0x2066, 0x2067, 0x2068, 0x2069, 0xfeff];
  for (const code of invisible) {
    const ch = String.fromCodePoint(code);
    assert.equal(nameProblem(`Gr${ch}een`), 'badCharacter', code.toString(16));
    assert.equal(nameProblem(ch), 'badCharacter', `alone ${code.toString(16)}`); // not 'empty'
    assert.equal(nameProblem(` ${ch} `), 'badCharacter'); // not trimmed away
  }
  // Neighbours just outside the ranges stay allowed.
  for (const code of [0x200a, 0x2010, 0x2029, 0x202f, 0x205f, 0x2065, 0x206a, 0xfefe, 0xff01]) {
    assert.equal(nameProblem(`a${String.fromCodePoint(code)}b`), null, code.toString(16));
  }
  assert.equal(nameProblem('🥋'.repeat(60)), null); // 60 characters even though .length is 120
  assert.equal(nameLength('🥋🥋'), 2);
  assert.equal(nameLength('  a  b '), 3);
});

// ======================= money.js =======================

check('money', () => {
  assert.equal(MAX_PRICE_DOLLARS, 1000);
  assert.equal(MAX_PRICE_CENTS, 100000);
  assert.equal(formatDollars(6500), '$65');
  assert.equal(formatDollars(0), '$0');
  assert.equal(formatDollars(100000), '$1,000');
  assert.equal(centsToInputText(6500), '65');
  assert.equal(centsToInputText(null), '');
  assert.deepEqual(parseDollars('65'), { cents: 6500 });
  assert.deepEqual(parseDollars(' $65 '), { cents: 6500 });
  assert.deepEqual(parseDollars('$ 65'), { cents: 6500 });
  assert.deepEqual(parseDollars('1,000'), { cents: 100000 });
  assert.deepEqual(parseDollars('65.00'), { cents: 6500 });
  assert.deepEqual(parseDollars('65.0'), { cents: 6500 });
  assert.deepEqual(parseDollars('0'), { cents: 0 });
  assert.deepEqual(parseDollars(''), { problem: 'empty' });
  assert.deepEqual(parseDollars('  '), { problem: 'empty' });
  assert.deepEqual(parseDollars('$'), { problem: 'empty' });
  assert.deepEqual(parseDollars('65.50'), { problem: 'notWhole' });
  assert.deepEqual(parseDollars('65.5'), { problem: 'notWhole' });
  assert.deepEqual(parseDollars('65.500'), { problem: 'notNumber' });
  assert.deepEqual(parseDollars('-5'), { problem: 'notNumber' });
  assert.deepEqual(parseDollars('abc'), { problem: 'notNumber' });
  assert.deepEqual(parseDollars('$$65'), { problem: 'notNumber' });
  assert.deepEqual(parseDollars('1001'), { problem: 'tooHigh' });
  assert.deepEqual(parseDollars('1,000.00'), { cents: 100000 });
  assert.equal(isValidCents(6500), true);
  assert.equal(isValidCents(0), true);
  assert.equal(isValidCents(100000), true);
  assert.equal(isValidCents(100100), false);
  assert.equal(isValidCents(6550), false);
  assert.equal(isValidCents(-100), false);
  assert.equal(isValidCents(null), false);
  assert.equal(isValidCents('6500'), false);
});

// ======================= belts.js (v0.64) =======================

const B = (beltPattern, beltColor, beltColor2 = null, beltEndStripes = 0, beltEndStripeColor = 'yellow') =>
  ({ beltPattern, beltColor, beltColor2, beltEndStripes, beltEndStripeColor });

check('belts: colors, rules, words', () => {
  assert.deepEqual(BELT_COLORS.map((c) => c.key), ['white', 'yellow', 'orange', 'green', 'blue', 'purple', 'red', 'brown', 'black']);
  assert.deepEqual(BELT_COLORS.map((c) => c.name), ['White', 'Yellow', 'Orange', 'Green', 'Blue', 'Purple', 'Red', 'Brown', 'Black']);
  assert.deepEqual(BELT_PATTERNS, ['solid', 'stripe', 'half']);
  assert.equal(BELT_END_STRIPES_MAX, 3);
  assert.equal(DEFAULT_END_STRIPE_COLOR, 'yellow');
  assert.deepEqual({ ...PLAIN_WHITE_BELT }, B('solid', 'white'));
  // Valid belts.
  for (const ok of [B('solid', 'white'), B('stripe', 'blue', 'white'), B('half', 'red', 'black'), B('stripe', 'black', 'white', 3),
    B('solid', 'black', null, 2, 'red'), B('solid', 'white', null, 0, null), B('half', 'black', 'red', 1)]) {
    assert.equal(validateBelt(ok), null, JSON.stringify(ok));
  }
  // Each problem code.
  assert.equal(validateBelt(null), 'badPattern');
  assert.equal(validateBelt(B('dotted', 'white')), 'badPattern');
  assert.equal(validateBelt(B(null, 'white')), 'badPattern');
  assert.equal(validateBelt(B('solid', 'pink')), 'badColor');
  assert.equal(validateBelt(B('solid', null)), 'badColor');
  assert.equal(validateBelt(B('solid', 'White')), 'badColor'); // keys are lower case
  assert.equal(validateBelt(B('solid', 'white', 'black')), 'color2NotAllowed');
  assert.equal(validateBelt(B('stripe', 'white')), 'missingColor2');
  assert.equal(validateBelt(B('half', 'red', null)), 'missingColor2');
  assert.equal(validateBelt(B('stripe', 'white', 'gold')), 'badColor');
  assert.equal(validateBelt(B('stripe', 'blue', 'blue')), 'sameColors');
  assert.equal(validateBelt(B('half', 'red', 'red')), 'sameColors');
  for (const n of [-1, 4, 1.5, null, '2']) assert.equal(validateBelt(B('solid', 'white', null, n)), 'badEndStripes', String(n));
  assert.equal(validateBelt(B('solid', 'white', null, 1, null)), 'missingEndStripeColor');
  assert.equal(validateBelt(B('solid', 'white', null, 1, 'gold')), 'badEndStripeColor');
  assert.equal(validateBelt(B('solid', 'white', null, 0, 'gold')), 'badEndStripeColor');
  // Plain English (the examples from the rulebook request).
  assert.equal(describeBelt(B('stripe', 'blue', 'white')), 'Blue with a white middle stripe');
  assert.equal(describeBelt(B('half', 'red', 'black')), 'Top half red, bottom half black');
  assert.equal(describeBelt(B('stripe', 'black', 'white', 2)), 'Black with a white middle stripe and 2 yellow end stripes');
  assert.equal(describeBelt(B('solid', 'white')), 'Plain white');
  assert.equal(describeBelt(B('stripe', 'black', 'white', 1)), 'Black with a white middle stripe and 1 yellow end stripe');
  assert.equal(describeBelt(B('solid', 'black', null, 3, 'red')), 'Black with 3 red end stripes');
  assert.equal(describeBelt(B('half', 'red', 'black', 1)), 'Top half red, bottom half black, with 1 yellow end stripe');
  assert.equal(describeBelt(B('stripe', 'blue', 'blue')), null); // not a valid belt → no words
  // beltOf / sameBelt / defaultBeltFor.
  const rankRow = { id: 'r', name: 'X', position: 0, ...B('stripe', 'green', 'white'), earlyCents: 1 };
  assert.deepEqual(beltOf(rankRow), B('stripe', 'green', 'white'));
  assert.equal(sameBelt(rankRow, B('stripe', 'green', 'white')), true);
  assert.equal(sameBelt(rankRow, B('stripe', 'green', 'white', 1)), false);
  assert.equal(sameBelt(rankRow, B('stripe', 'white', 'green')), false);
  const cls = { ranks: [{ position: 1, ...B('half', 'red', 'black') }, { position: 0, ...B('solid', 'red') }] };
  assert.deepEqual(defaultBeltFor(cls), B('half', 'red', 'black')); // the LAST rank by position
  assert.deepEqual(defaultBeltFor({ ranks: [] }), B('solid', 'white'));
  assert.deepEqual(defaultBeltFor(null), B('solid', 'white'));
  assert.deepEqual(defaultBeltFor({ ranks: [{ position: 0, name: 'old shape' }] }), B('solid', 'white')); // no belt → plain white
  const copy = defaultBeltFor(cls);
  copy.beltColor = 'blue';
  assert.equal(cls.ranks[0].beltColor, 'red'); // a copy, not the rank's own object
  const plain = defaultBeltFor({ ranks: [] });
  plain.beltColor = 'blue';
  assert.equal(PLAIN_WHITE_BELT.beltColor, 'white');
});

// ======================= rankOrder.js =======================

// The preview data, converted to the app's camelCase shape (what api.js returns).
function toAppClasses(store, code) {
  const ranks = store.ranks
    .filter((r) => r.location_code === code)
    .map((r) => ({
      id: r.id, classId: r.class_id, locationCode: r.location_code, name: r.name, position: r.position,
      earlyCents: r.early_cents, dayCents: r.day_cents, privateCents: r.private_cents, sparringGear: r.sparring_gear,
      beltPattern: r.belt_pattern, beltColor: r.belt_color, beltColor2: r.belt_color_2,
      beltEndStripes: r.belt_end_stripes, beltEndStripeColor: r.belt_end_stripe_color,
      version: r.version, createdAt: r.created_at, updatedAt: r.updated_at, createdByName: r.created_by_name, updatedByName: r.updated_by_name,
    }));
  return store.classes
    .filter((c) => c.location_code === code)
    .map((c) => ({
      id: c.id, locationCode: c.location_code, name: c.name, position: c.position, finalAwardRankId: c.final_award_rank_id,
      finalAwardNone: c.final_award_none, version: c.version, createdAt: c.created_at, updatedAt: c.updated_at, createdByName: c.created_by_name, updatedByName: c.updated_by_name,
      ranks: ranks.filter((r) => r.classId === c.id).sort((a, b) => a.position - b.position),
    }))
    .reverse(); // any order in → belt order out
}

const store0 = defaultTestingData();
const raw = toAppClasses(store0, 'worcester');
const views = withTestingFor(raw);
const cls = (name, list = views) => list.find((c) => c.name === name);
const rank = (className, rankName, list = views) => cls(className, list).ranks.find((r) => r.name === rankName);

check('preview data: real list, both schools', () => {
  for (const code of ['worcester', 'shrewsbury']) {
    assert.equal(store0.classes.filter((c) => c.location_code === code).length, 7);
    assert.equal(store0.ranks.filter((r) => r.location_code === code).length, 42);
  }
  assert.deepEqual(views.map((c) => c.name), ['Little Tiger', 'White', 'Group A', 'Group B', 'Group C', 'Group D', 'Teen/Adult']);
  assert.deepEqual(views.map((c) => c.rankCount), [6, 1, 4, 4, 4, 5, 18]);
  const label = (c) => (c.finalAward ? `${c.finalAward.name} (${c.finalAward.className})` : c.finalAwardState === 'none' ? 'None' : 'Not set');
  const awards = Object.fromEntries(views.map((c) => [c.name, label(c)]));
  assert.deepEqual(awards, {
    'Little Tiger': 'Yellow (Group A)', White: 'Yellow (Group A)', 'Group A': 'Blue (Group B)',
    'Group B': 'High Red (Group C)', 'Group C': 'Bo Dan (Group D)', 'Group D': 'None', 'Teen/Adult': 'None', // v0.62
  });
  // Same in the other school, and the raw rows: None = (null, true).
  assert.deepEqual(withTestingFor(toAppClasses(store0, 'shrewsbury')).map(label), Object.values(awards));
  for (const row of store0.classes) {
    const none = row.name === 'Group D' || row.name === 'Teen/Adult';
    assert.equal(row.final_award_none, none);
    if (none) assert.equal(row.final_award_rank_id, null);
  }
  assert.equal(rank('Group B', 'Blue').earlyCents, 7000);
  assert.equal(rank('Group D', 'Deputy').privateCents, 1000);
  assert.equal(rank('Teen/Adult', 'High Green').privateCents, 8500); // approved adjustment v0.62 (was 9500)
  for (const row of [...store0.classes, ...store0.ranks]) {
    assert.equal(row.version, 1);
    assert.equal(row.created_by_name, 'Main Admin');
    assert.equal(row.updated_at, '2026-10-16T20:52:00Z');
  }
  // Different ids per school.
  const ids = new Set([...store0.classes, ...store0.ranks].map((r) => r.id));
  assert.equal(ids.size, 14 + 84);
});

check('preview data: belts (v0.64)', () => {
  const words = (className, rankName, list = views) => describeBelt(rank(className, rankName, list));
  for (const list of [views, withTestingFor(toAppClasses(store0, 'shrewsbury'))]) {
    assert.equal(words('Little Tiger', 'LT White', list), 'Plain white');
    for (const c of ['Yellow', 'Green', 'Blue', 'Red', 'Black']) {
      assert.equal(words('Little Tiger', `LT ${c}`, list), `White with a ${c.toLowerCase()} middle stripe`);
    }
    for (const [cls, names] of [['White', ['White']], ['Group A', ['Yellow', 'Orange', 'Green']], ['Group B', ['Blue', 'Purple', 'Red']], ['Group C', ['Brown']]]) {
      for (const n of names) assert.equal(words(cls, n, list), `Plain ${n.toLowerCase()}`);
    }
    assert.equal(words('Group A', 'High Green', list), 'Green with a white middle stripe');
    assert.equal(words('Group B', 'High Blue', list), 'Blue with a white middle stripe');
    assert.equal(words('Group C', 'High Red', list), 'Red with a white middle stripe');
    assert.equal(words('Group C', 'High Brown', list), 'Brown with a white middle stripe');
    assert.equal(words('Group C', 'Red / Black', list), 'Top half red, bottom half black');
    assert.equal(words('Group D', 'Bo Dan', list), 'Black with a white middle stripe');
    assert.equal(words('Group D', 'Bo Dan - 1 Big Stripe', list), 'Black with a white middle stripe and 1 yellow end stripe');
    assert.equal(words('Group D', 'Bo Dan - 2 Big Stripe', list), 'Black with a white middle stripe and 2 yellow end stripes');
    assert.equal(words('Group D', 'Bo Dan - 3 Big Stripe', list), 'Black with a white middle stripe and 3 yellow end stripes');
    assert.equal(words('Group D', 'Deputy', list), 'Black with a yellow middle stripe');
    // Teen/Adult: the same belt as the kids' rank with the same name.
    const kids = new Map(list.slice(1, 6).flatMap((c) => c.ranks).map((r) => [r.name, describeBelt(r)]));
    for (const r of list[6].ranks) assert.equal(describeBelt(r), kids.get(r.name), r.name);
    for (const c of list) for (const r of c.ranks) assert.equal(validateBelt(r), null, r.name);
  }
});

check('withTestingFor: Group A example', () => {
  const a = cls('Group A');
  const blue = rank('Group B', 'Blue');
  assert.deepEqual(a.ranks.map((r) => r.testingFor?.name), ['Orange', 'Green', 'High Green', 'Blue']);
  assert.deepEqual(a.ranks.map((r) => r.isLast), [false, false, false, true]);
  assert.deepEqual(a.ranks.map((r) => r.finalAwardState), [null, null, null, 'set']);
  const last = a.ranks[3];
  assert.deepEqual(last.testingFor, { rankId: blue.id, name: 'Blue' });
  assert.deepEqual(a.finalAward, { rankId: blue.id, name: 'Blue', classId: cls('Group B').id, className: 'Group B' });
  // nextBelt (v0.64): the belt of the rank it tests for.
  assert.deepEqual(a.ranks[0].nextBelt, B('solid', 'orange')); // Yellow → Orange
  assert.deepEqual(a.ranks[2].nextBelt, B('stripe', 'green', 'white')); // Green → High Green
  assert.deepEqual(last.nextBelt, B('solid', 'blue')); // last rank → its final award (Blue, Group B)
  assert.deepEqual(cls('Little Tiger').ranks.at(-1).nextBelt, B('solid', 'yellow')); // LT Black → Yellow (Group A)
  assert.deepEqual(cls('Group D').ranks[2].nextBelt, B('stripe', 'black', 'white', 3)); // → Bo Dan - 3 Big Stripe
  assert.equal(cls('Group D').ranks.at(-1).nextBelt, null); // None → no belt
  assert.equal(cls('Teen/Adult').ranks.at(-1).nextBelt, null);
  assert.equal(a.finalAwardState, 'set');
  // Group D: None (v0.62) — the last rank tests for nothing, on purpose.
  const dLast = cls('Group D').ranks.at(-1);
  assert.equal(dLast.testingFor, null);
  assert.equal(dLast.finalAwardState, 'none');
  assert.equal(cls('Group D').finalAwardState, 'none');
  assert.equal(cls('Group D').finalAward, null);
  assert.deepEqual(cls('Group D').ranks.map((r) => r.finalAwardState), [null, null, null, null, 'none']);
  // Not set: no rank and not None.
  const notSet = withTestingFor(raw.map((c) => (c.name === 'Group D' ? { ...c, finalAwardNone: false } : c)));
  assert.equal(cls('Group D', notSet).ranks.at(-1).finalAwardState, 'notSet');
  assert.equal(cls('Group D', notSet).finalAwardState, 'notSet');
  assert.equal(cls('Group D', notSet).ranks.at(-1).nextBelt, null); // Not set → no belt
  // None wins if a rank id is somehow there too (the database never allows both).
  const both = withTestingFor(raw.map((c) => (c.name === 'Group A' ? { ...c, finalAwardNone: true } : c)));
  assert.equal(cls('Group A', both).ranks.at(-1).finalAwardState, 'none');
  assert.equal(cls('Group A', both).ranks.at(-1).testingFor, null);
  // A class without finalAwardNone at all (older shape) counts as not None.
  assert.equal(withTestingFor([{ id: 'x', name: 'X', position: 0, finalAwardRankId: null, ranks: [{ id: 'r', name: 'R', position: 0 }] }])[0].ranks[0].finalAwardState, 'notSet');
  // An award id that isn't in the list → Not set.
  const broken = withTestingFor(raw.map((c) => (c.name === 'Group A' ? { ...c, finalAwardRankId: randomUUID() } : c)));
  assert.equal(cls('Group A', broken).finalAward, null);
  assert.equal(cls('Group A', broken).ranks.at(-1).finalAwardState, 'notSet');
  assert.equal(cls('Group A', broken).ranks.at(-1).nextBelt, null);
  // Input arrays are not changed.
  assert.equal(raw[0].name, 'Teen/Adult');
  // An empty class.
  const empty = withTestingFor([{ id: 'x', name: 'Empty', position: 0, finalAwardRankId: null, finalAwardNone: true, ranks: [] }]);
  assert.equal(empty[0].rankCount, 0);
  assert.equal(empty[0].finalAward, null);
  assert.equal(empty[0].finalAwardState, 'none');
});

check('rankOrder: moving and reordering', () => {
  assert.deepEqual(moveId(['a', 'b', 'c', 'd'], 0, 2), ['b', 'c', 'a', 'd']);
  assert.deepEqual(moveId(['a', 'b', 'c', 'd'], 3, 0), ['d', 'a', 'b', 'c']);
  assert.deepEqual(moveId(['a', 'b'], 1, 9), ['a', 'b']);
  assert.deepEqual(moveId(['a', 'b'], 5, 0), ['a', 'b']);
  const a = cls('Group A');
  const ids = rankOrderIds(raw, a.id);
  assert.deepEqual(ids, a.ranks.map((r) => r.id));
  const newIds = moveId(ids, 3, 0);
  const moved = reorderRanksLocal(raw, a.id, newIds);
  const movedA = moved.find((c) => c.id === a.id);
  assert.deepEqual(movedA.ranks.map((r) => [r.name, r.position]), [['High Green', 0], ['Yellow', 1], ['Orange', 2], ['Green', 3]]);
  assert.equal(cls('Group A', withTestingFor(moved)).ranks.at(-1).testingFor.name, 'Blue'); // last is now Green
  assert.deepEqual(cls('Group A', withTestingFor(moved)).ranks[0].nextBelt, B('solid', 'yellow')); // High Green → Yellow now
  assert.equal(raw.find((c) => c.id === a.id).ranks[0].name, 'Yellow'); // input unchanged
  const order = classOrderIds(raw);
  assert.deepEqual(order, views.map((c) => c.id));
  const classesMoved = reorderClassesLocal(raw, moveId(order, 6, 0));
  assert.deepEqual(classesMoved.map((c) => [c.name, c.position]).slice(0, 2), [['Teen/Adult', 0], ['Little Tiger', 1]]);
  assert.deepEqual(rankOrderIds(raw, 'nope'), []);
});

check('rankOrder: final award choices and Add rank', () => {
  const options = finalAwardOptions(raw, cls('Group A').id);
  assert.deepEqual(options[0], { kind: 'none', value: FINAL_AWARD_NONE }); // "None" right after the screen's "Not set"
  const groups = options.slice(1);
  assert.ok(groups.every((o) => o.kind === 'class'));
  assert.equal(groups.some((o) => o.className === 'Group A'), false); // never its own ranks
  assert.deepEqual(groups.map((o) => o.className), ['Little Tiger', 'White', 'Group B', 'Group C', 'Group D', 'Teen/Adult']);
  assert.deepEqual(groups[2], { kind: 'class', classId: cls('Group B').id, className: 'Group B', ranks: cls('Group B').ranks.map((r) => ({ id: r.id, name: r.name })) });
  assert.equal(finalAwardOptions(raw, null).length, 8);
  const withEmpty = [...raw, { id: 'e', name: 'Empty', position: 9, finalAwardRankId: null, finalAwardNone: false, ranks: [] }];
  assert.equal(finalAwardOptions(withEmpty, null).length, 8); // empty classes are skipped
  assert.deepEqual(finalAwardOptions([], null), [{ kind: 'none', value: 'none' }]); // None is always offered
  // The one-value "choice" and the two values sent to the server.
  assert.equal(FINAL_AWARD_NONE, 'none');
  assert.equal(finalAwardChoiceOf(cls('Group D')), FINAL_AWARD_NONE);
  assert.equal(finalAwardChoiceOf(cls('Group A')), rank('Group B', 'Blue').id);
  assert.equal(finalAwardChoiceOf({ finalAwardRankId: null, finalAwardNone: false }), null);
  assert.equal(finalAwardChoiceOf(null), null);
  assert.deepEqual(finalAwardArgs(FINAL_AWARD_NONE), { finalAwardRankId: null, finalAwardNone: true });
  assert.deepEqual(finalAwardArgs(null), { finalAwardRankId: null, finalAwardNone: false });
  assert.deepEqual(finalAwardArgs(undefined), { finalAwardRankId: null, finalAwardNone: false });
  assert.deepEqual(finalAwardArgs('abc'), { finalAwardRankId: 'abc', finalAwardNone: false });
  assert.deepEqual(describeAddRank(raw, cls('Group B').id), {
    className: 'Group B', lastRankName: 'Red', copied: { earlyCents: 7000, dayCents: 8000, privateCents: 9500, sparringGear: true },
  });
  assert.deepEqual(describeAddRank(withEmpty, 'e'), { className: 'Empty', lastRankName: null, copied: null });
  assert.equal(describeAddRank(raw, 'nope'), null);
});

// The confirmation sentences of contract §7.4, built the way the screen builds them.
function lostSentence(lost) {
  const names = lost.map((c) => c.name);
  if (names.length === 0) return '';
  if (names.length === 1) return `${names[0]}'s final award will become Not set. `;
  if (names.length === 2) return `${names[0]}'s and ${names[1]}'s final awards will become Not set. `;
  return `${names.slice(0, -1).map((n) => `${n}'s`).join(', ')} and ${names.at(-1)}'s final awards will become Not set. `;
}
const TAIL = "Existing events keep their own copy. This can't be undone.";
function rankDeleteText(d) {
  let first = '';
  if (d.isOnlyRank) first = `${d.className} will have no ranks. `;
  else if (d.previousRankName && d.nextRankName) first = `${d.previousRankName} will test for ${d.nextRankName}. `;
  else if (d.previousRankName && d.finalAwardName) first = `${d.previousRankName} will test for ${d.finalAwardName}. `;
  else if (d.previousRankName && d.finalAwardState === 'none') first = `${d.previousRankName} won't test for a new rank. `; // v0.62
  else if (d.previousRankName) first = `${d.previousRankName} will be the last rank of ${d.className}. `;
  return [`Delete ${d.rankName}?`, `${first}${lostSentence(d.lostAwardClasses)}${TAIL}`];
}
function classDeleteText(d) {
  const title = d.rankCount === 0 ? `Delete ${d.className}?`
    : d.rankCount === 1 ? `Delete ${d.className} and its 1 rank?` : `Delete ${d.className} and its ${d.rankCount} ranks?`;
  return [title, `${lostSentence(d.lostAwardClasses)}${TAIL}`];
}

check('rankOrder: delete descriptions (mockup examples)', () => {
  const hg = describeRankDelete(raw, rank('Group A', 'High Green').id);
  assert.deepEqual(rankDeleteText(hg), ['Delete High Green?', `Green will test for Blue. ${TAIL}`]);
  assert.equal(hg.isLast, true);
  assert.deepEqual(hg.rpcArgs, {
    rankId: rank('Group A', 'High Green').id, expectedVersion: 1, expectedClassVersion: 1,
    expectedRankIds: cls('Group A').ranks.map((r) => r.id), expectedLostAwardClassIds: [],
  });
  const blue = describeRankDelete(raw, rank('Group B', 'Blue').id);
  assert.deepEqual(rankDeleteText(blue), ['Delete Blue?', `Group A's final award will become Not set. ${TAIL}`]);
  assert.deepEqual(blue.rpcArgs.expectedLostAwardClassIds, [cls('Group A').id]);
  // Yellow is the final award of BOTH Little Tiger and White.
  const yellow = describeRankDelete(raw, rank('Group A', 'Yellow').id);
  assert.deepEqual(rankDeleteText(yellow)[1], `Little Tiger's and White's final awards will become Not set. ${TAIL}`);
  const white = describeRankDelete(raw, rank('White', 'White').id);
  assert.deepEqual(rankDeleteText(white)[1], `White will have no ranks. ${TAIL}`);
  assert.equal(white.isOnlyRank, true);
  assert.equal(hg.finalAwardState, 'set');
  // Group D is None (v0.62): deleting its last rank → the new last rank won't test for a new rank.
  const deputy = describeRankDelete(raw, rank('Group D', 'Deputy').id);
  assert.equal(deputy.finalAwardState, 'none');
  assert.equal(deputy.finalAwardName, null);
  assert.deepEqual(deputy.lostAwardClasses, []);
  assert.deepEqual(rankDeleteText(deputy)[1], `Bo Dan - 3 Big Stripe won't test for a new rank. ${TAIL}`);
  // The same class with its award Not set.
  const dNotSet = raw.map((c) => (c.name === 'Group D' ? { ...c, finalAwardNone: false } : c));
  const deputy2 = describeRankDelete(dNotSet, rank('Group D', 'Deputy').id);
  assert.equal(deputy2.finalAwardState, 'notSet');
  assert.deepEqual(rankDeleteText(deputy2)[1], `Bo Dan - 3 Big Stripe will be the last rank of Group D. ${TAIL}`);
  // Deleting Bo Dan (Group C's award): Group C loses it; Group D and Teen/Adult (None) never do.
  const boDan = describeRankDelete(raw, rank('Group D', 'Bo Dan').id);
  assert.deepEqual(boDan.lostAwardClasses.map((c) => c.name), ['Group C']);
  const orange = describeRankDelete(raw, rank('Group A', 'Orange').id);
  assert.deepEqual(rankDeleteText(orange)[1], `Yellow will test for Green. ${TAIL}`);
  assert.equal(describeRankDelete(raw, 'nope'), null);

  // "Delete Teen/Adult and its 18 ranks?" when Group D's award is Teen/Adult's first rank.
  const teenFirst = rank('Teen/Adult', 'White');
  const withD = raw.map((c) => (c.name === 'Group D' ? { ...c, finalAwardRankId: teenFirst.id, finalAwardNone: false } : c));
  const teen = describeClassDelete(withD, cls('Teen/Adult').id);
  assert.deepEqual(classDeleteText(teen), ['Delete Teen/Adult and its 18 ranks?', `Group D's final award will become Not set. ${TAIL}`]);
  assert.deepEqual(teen.rpcArgs, {
    classId: cls('Teen/Adult').id, expectedVersion: 1, expectedRankIds: cls('Teen/Adult').ranks.map((r) => r.id),
    expectedLostAwardClassIds: [cls('Group D').id], onlyIfEmpty: false,
  });
  assert.deepEqual(classDeleteText(describeClassDelete(raw, cls('White').id)), ['Delete White and its 1 rank?', `${TAIL}`]);
  // With the real data Group D is None, so deleting Teen/Adult takes nobody's award.
  assert.deepEqual(classDeleteText(describeClassDelete(raw, cls('Teen/Adult').id)), ['Delete Teen/Adult and its 18 ranks?', TAIL]);
  // Group D's ranks: only Group C points at one of them (Bo Dan).
  assert.deepEqual(describeClassDelete(raw, cls('Group D').id).lostAwardClasses.map((c) => c.name), ['Group C']);
  // Group A's ranks are the award of Little Tiger, White (Yellow) — 2 classes.
  assert.deepEqual(describeClassDelete(raw, cls('Group A').id).lostAwardClasses.map((c) => c.name), ['Little Tiger', 'White']);
  // Three or more.
  const three = raw.map((c) => (c.name === 'Group C' ? { ...c, finalAwardRankId: rank('Group A', 'Green').id } : c));
  assert.equal(lostSentence(describeClassDelete(three, cls('Group A').id).lostAwardClasses), "Little Tiger's, White's and Group C's final awards will become Not set. ");
  assert.equal(describeClassDelete(raw, 'nope'), null);
});

check('rankOrder: Undo of "Rank added"', () => {
  const red = rank('Group B', 'Red');
  const ok = checkUndoAddRank(raw, red.id);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.rpcArgs, {
    rankId: red.id, expectedVersion: 1, expectedClassVersion: 1,
    expectedRankIds: cls('Group B').ranks.map((r) => r.id), expectedLostAwardClassIds: [],
  });
  assert.deepEqual(checkUndoAddRank(raw, 'nope'), { ok: false, reason: 'gone' });
  const edited = raw.map((c) => ({ ...c, ranks: c.ranks.map((r) => (r.id === red.id ? { ...r, version: 2 } : r)) }));
  assert.equal(checkUndoAddRank(edited, red.id).reason, 'edited');
  const blue = rank('Group B', 'Blue');
  assert.deepEqual(checkUndoAddRank(raw, blue.id), { ok: false, reason: 'isFinalAward', className: 'Group A', rankName: 'Blue' });
});

check('names: duplicates', () => {
  assert.equal(findDuplicateClass(views, ' group   a ', null), 'Group A');
  assert.equal(findDuplicateClass(views, 'Group A', cls('Group A').id), null); // keeping its own name
  assert.equal(findDuplicateClass(views, 'Group E', null), null);
  assert.equal(findDuplicateClass(views, '', null), null);
  assert.equal(findDuplicateRank(cls('Group A'), 'high green', null), 'High Green');
  assert.equal(findDuplicateRank(cls('Group A'), 'High Green', rank('Group A', 'High Green').id), null);
  assert.equal(findDuplicateRank(cls('Group B'), 'Green', null), null); // other class: fine
});

// ======================= mockTesting.js (the preview database) =======================

let clock = Date.parse('2026-10-17T12:00:00Z');
let memory = null; // the "localStorage" for these checks
const backend = createTestingBackend({
  loadStore: () => memory,
  saveStore: (store) => { memory = JSON.parse(JSON.stringify(store)); },
  now: () => clock,
  newId: () => randomUUID(),
});

const ADMIN = { signedIn: true, hasDataAccess: true, isAdmin: true, actorName: 'Jeffrey Berg' };
const DESK = { signedIn: true, hasDataAccess: true, isAdmin: false, actorName: 'Staff' };
const LOCKED_ADMIN = { signedIn: true, hasDataAccess: false, isAdmin: true, actorName: 'Jeffrey Berg' };
const LOCKED_DESK = { signedIn: true, hasDataAccess: false, isAdmin: false, actorName: 'Staff' };
const ANON = { signedIn: false, hasDataAccess: false, isAdmin: false };
// The five belt arguments (v0.64) for a plain white belt — added to every rank call below.
const PLAIN_BELT_ARGS = { p_belt_pattern: 'solid', p_belt_color: 'white', p_belt_color_2: null, p_belt_end_stripes: 0, p_belt_end_stripe_color: 'yellow' };

// Calls a function and returns its jsonb answer (asserting there was no transport error).
function call(name, args, ctx = ADMIN) {
  const res = backend.rpc(name, args, ctx);
  assert.equal(res.error, null, `${name}: ${res.error?.message}`);
  return res.data;
}
const statusOf = (name, args, ctx) => call(name, args, ctx).status;
const db = () => backend.snapshot();
const classRow = (id) => db().classes.find((c) => c.id === id);
const rankRow = (id) => db().ranks.find((r) => r.id === id);
const schoolClasses = (code) => db().classes.filter((c) => c.location_code === code).sort((a, b) => a.position - b.position);
const classRanks = (classId) => db().ranks.filter((r) => r.class_id === classId).sort((a, b) => a.position - b.position);
const dense = (rows) => rows.every((r, i) => r.position === i);
const fingerprint = () => JSON.stringify(db());
const uniqueName = (prefix) => `${prefix} ${randomUUID().slice(0, 8)}`;

// A valid argument set for each function (used for the "who may call" checks).
function sampleArgs() {
  const d = db();
  const c = d.classes.find((x) => x.location_code === 'worcester');
  const r = d.ranks.find((x) => x.class_id === c.id);
  const ids = classRanks(c.id).map((x) => x.id);
  const cids = schoolClasses('worcester').map((x) => x.id);
  return {
    testing_add_class: { p_location_code: 'worcester', p_name: uniqueName('zz'), p_final_award_rank_id: null, p_final_award_none: false },
    testing_update_class: { p_class_id: c.id, p_expected_version: c.version, p_name: 'Renamed', p_final_award_rank_id: null, p_final_award_none: false },
    testing_reorder_classes: { p_location_code: 'worcester', p_expected_ids: cids, p_new_ids: [...cids].reverse() },
    testing_delete_class: { p_class_id: c.id, p_expected_version: c.version, p_expected_rank_ids: ids, p_expected_lost_award_class_ids: [] },
    testing_add_rank: { p_class_id: c.id, p_name: 'New', p_early_cents: 100, p_day_cents: 100, p_private_cents: 100, p_sparring_gear: false, ...PLAIN_BELT_ARGS },
    testing_update_rank: { p_rank_id: r.id, p_expected_version: r.version, p_name: 'X', p_early_cents: 0, p_day_cents: 0, p_private_cents: 0, p_sparring_gear: true, ...PLAIN_BELT_ARGS },
    testing_reorder_ranks: { p_class_id: c.id, p_expected_ids: ids, p_new_ids: [...ids].reverse() },
    testing_delete_rank: { p_rank_id: r.id, p_expected_version: r.version, p_expected_class_version: c.version, p_expected_rank_ids: ids, p_expected_lost_award_class_ids: [] },
  };
}

check('mock: reads, permissions, row-level security', () => {
  const CLASS_COLUMNS = 'id, location_code, name, position, final_award_rank_id, version, created_at, updated_at, created_by_name, updated_by_name';
  const res = backend.select('testing_classes', CLASS_COLUMNS, [{ col: 'location_code', value: 'worcester' }], [{ col: 'position', ascending: true }], ADMIN);
  assert.equal(res.error, null);
  assert.deepEqual(res.data.map((c) => c.name), ['Little Tiger', 'White', 'Group A', 'Group B', 'Group C', 'Group D', 'Teen/Adult']);
  assert.deepEqual(Object.keys(res.data[0]), CLASS_COLUMNS.split(', '));
  const desc = backend.select('testing_ranks', 'name', [{ col: 'class_id', value: res.data[2].id }], [{ col: 'position', ascending: false }], DESK);
  assert.deepEqual(desc.data.map((r) => r.name), ['High Green', 'Green', 'Orange', 'Yellow']); // T22: desk can read
  assert.equal(backend.select('testing_ranks', 'created_by_name, updated_by_name', [], [], DESK).error, null);
  assert.equal(backend.select('locations', 'code, name', [], [], ADMIN).data.length, 2); // T1
  for (const table of ['testing_classes', 'testing_ranks']) {
    for (const cols of ['*', 'id, created_by', 'updated_by', undefined]) {
      assert.equal(backend.select(table, cols, [], [], ADMIN).error.code, '42501', `${table} ${cols}`); // T4
    }
    assert.equal(backend.select(table, 'id', [{ col: 'created_by', value: 'x' }], [], ADMIN).error.code, '42501');
    assert.equal(backend.select(table, 'nope', [], [], ADMIN).error.code, '42703');
    assert.deepEqual(backend.select(table, 'id', [], [], LOCKED_ADMIN).data, []); // T2: RLS hides rows
    assert.equal(backend.select(table, 'id', [], [], ANON).error.code, '42501'); // T3
    assert.equal(backend.select(table, 'id', [], [], ANON).error.message, `permission denied for table ${table}`);
  }
  assert.equal(backend.select('change_log', 'id', [], [], ADMIN).error.code, '42501'); // T20b
  assert.deepEqual(backend.rpc('has_data_access', {}, ADMIN).data, true);
  assert.deepEqual(backend.rpc('has_data_access', {}, LOCKED_ADMIN).data, false);
  assert.equal(backend.rpc('has_data_access', {}, ANON).error.code, '42501');
});

check('mock: T3/T5/T6/T6b — who may call', () => {
  const before = fingerprint();
  const args = sampleArgs();
  assert.deepEqual(TESTING_RPC_NAMES.sort(), Object.keys(args).sort());
  for (const name of TESTING_RPC_NAMES) {
    assert.equal(statusOf(name, args[name], DESK), 'not_allowed', name); // T5
    assert.equal(statusOf(name, args[name], LOCKED_ADMIN), 'no_access', name); // T6
    assert.equal(statusOf(name, args[name], LOCKED_DESK), 'no_access', name); // T6b: access is checked before admin
    // no_access / not_allowed come before argument checks.
    const bad = { ...args[name] };
    for (const key of Object.keys(bad)) bad[key] = null;
    assert.equal(statusOf(name, bad, LOCKED_DESK), 'no_access', name);
    assert.equal(statusOf(name, bad, DESK), 'not_allowed', name);
    const anon = backend.rpc(name, args[name], ANON); // T3
    assert.equal(anon.error.code, '42501');
    assert.equal(anon.error.message, `permission denied for function ${name}`);
  }
  assert.equal(fingerprint(), before); // nothing changed
});

check('mock: argument names and types (like the real API)', () => {
  const args = sampleArgs();
  const missing = backend.rpc('testing_update_class', { ...args.testing_update_class, p_final_award_rank_id: undefined }, ADMIN);
  assert.equal(missing.error.code, 'PGRST202'); // no default: must be sent (null = Not set)
  assert.equal(backend.rpc('testing_add_rank', { ...args.testing_add_rank, extra: 1 }, ADMIN).error.code, 'PGRST202');
  assert.equal(backend.rpc('testing_add_rank', { ...args.testing_add_rank, p_class_id: 'abc' }, ADMIN).error.code, '22P02');
  assert.equal(backend.rpc('testing_add_rank', { ...args.testing_add_rank, p_early_cents: 65.5 }, ADMIN).error.code, '22P02');
  assert.equal(backend.rpc('testing_add_rank', { ...args.testing_add_rank, p_early_cents: 2 ** 40 }, ADMIN).error.code, '22003');
  assert.equal(backend.rpc('testing_reorder_ranks', { ...args.testing_reorder_ranks, p_new_ids: 'x' }, ADMIN).error.code, '22P02');
  assert.equal(backend.rpc('testing_nope', {}, ADMIN).error.code, 'PGRST202');
  // v0.62: add_class has no defaults any more — both final-award arguments must be sent.
  assert.equal(backend.rpc('testing_add_class', { p_location_code: 'shrewsbury', p_name: uniqueName('opt') }, ADMIN).error.code, 'PGRST202');
  assert.equal(backend.rpc('testing_add_class', { p_location_code: 'shrewsbury', p_name: 'Q', p_final_award_rank_id: null }, ADMIN).error.code, 'PGRST202');
  assert.equal(backend.rpc('testing_update_class', { ...args.testing_update_class, p_final_award_none: undefined }, ADMIN).error.code, 'PGRST202');
  assert.equal(backend.rpc('testing_update_class', { ...args.testing_update_class, p_final_award_none: 'maybe' }, ADMIN).error.code, '22P02');
  // The only optional argument left: delete_class's p_only_if_empty (default false).
  const empty = call('testing_add_class', { p_location_code: 'shrewsbury', p_name: uniqueName('opt'), p_final_award_rank_id: null, p_final_award_none: false });
  assert.equal(statusOf('testing_delete_class', { p_class_id: empty.id, p_expected_version: 1, p_expected_rank_ids: [], p_expected_lost_award_class_ids: [] }), 'ok');
  backend.reset();
});

check('mock: T7 + T23 — full admin flow', () => {
  backend.reset();
  const before = schoolClasses('worcester').length;
  const name = uniqueName('zz test');
  const added = call('testing_add_class', { p_location_code: 'worcester', p_name: name, p_final_award_rank_id: null, p_final_award_none: false });
  assert.deepEqual(Object.keys(added).sort(), ['final_award_none', 'id', 'position', 'status', 'version']);
  assert.equal(added.final_award_none, false);
  assert.equal(added.position, before);
  assert.equal(added.version, 1);
  const c = added.id;
  const ranks = ['Green', 'Blue', 'Red'].map((n, i) => {
    const r = call('testing_add_rank', { p_class_id: c, p_name: n, p_early_cents: 6500, p_day_cents: 7500, p_private_cents: 8500, p_sparring_gear: false, ...PLAIN_BELT_ARGS });
    assert.equal(r.position, i); // T23
    assert.equal(r.version, 1);
    return r.id;
  });
  const row = rankRow(ranks[0]);
  assert.equal(row.created_by_name, 'Jeffrey Berg');
  assert.equal(row.location_code, 'worcester');
  clock += 60000;
  const upd = call('testing_update_rank', { p_rank_id: ranks[0], p_expected_version: 1, p_name: 'Green', p_early_cents: 7000, p_day_cents: 7500, p_private_cents: 8500, p_sparring_gear: true, ...PLAIN_BELT_ARGS });
  assert.deepEqual(upd, { status: 'ok', id: ranks[0], version: 2 });
  assert.equal(rankRow(ranks[0]).updated_at, new Date(clock).toISOString());
  clock += 60000;
  const noop = call('testing_update_rank', { p_rank_id: ranks[0], p_expected_version: 2, p_name: ' Green ', p_early_cents: 7000, p_day_cents: 7500, p_private_cents: 8500, p_sparring_gear: true, ...PLAIN_BELT_ARGS });
  assert.equal(noop.version, 2); // nothing changed → no new version
  assert.notEqual(rankRow(ranks[0]).updated_at, new Date(clock).toISOString());
  const someRankElsewhere = classRanks(schoolClasses('worcester')[0].id)[0].id;
  const updc = call('testing_update_class', { p_class_id: c, p_expected_version: 1, p_name: `${name} x`, p_final_award_rank_id: someRankElsewhere, p_final_award_none: false });
  assert.deepEqual(updc, { status: 'ok', id: c, version: 2, final_award_none: false });
  const rr = call('testing_reorder_ranks', { p_class_id: c, p_expected_ids: ranks, p_new_ids: [ranks[2], ranks[0], ranks[1]] });
  assert.deepEqual(rr, { status: 'ok' });
  assert.deepEqual(classRanks(c).map((r) => r.id), [ranks[2], ranks[0], ranks[1]]);
  assert.ok(dense(classRanks(c)));
  const ids = schoolClasses('worcester').map((x) => x.id);
  assert.deepEqual(call('testing_reorder_classes', { p_location_code: 'worcester', p_expected_ids: ids, p_new_ids: [c, ...ids.filter((x) => x !== c)] }), { status: 'ok' });
  assert.equal(schoolClasses('worcester')[0].id, c);
  assert.ok(dense(schoolClasses('worcester')));
  // Same order again → ok, nothing written.
  const same = fingerprint();
  const now = schoolClasses('worcester').map((x) => x.id);
  assert.equal(statusOf('testing_reorder_classes', { p_location_code: 'worcester', p_expected_ids: now, p_new_ids: now }), 'ok');
  assert.equal(fingerprint(), same);
  // Empty school: empty arrays are fine.
  backend.clearSchool('Shrewsbury');
  assert.equal(statusOf('testing_reorder_classes', { p_location_code: 'shrewsbury', p_expected_ids: [], p_new_ids: [] }), 'ok');
  const first = call('testing_add_class', { p_location_code: 'shrewsbury', p_name: 'Group A', p_final_award_rank_id: null, p_final_award_none: false }); // same name, other school (T8b)
  assert.equal(first.position, 0);
  backend.reset();
});

check('mock: T8/T8b — duplicate names', () => {
  backend.reset();
  const c = call('testing_add_class', { p_location_code: 'worcester', p_name: uniqueName('dup'), p_final_award_rank_id: null, p_final_award_none: false }).id;
  const add = (n) => statusOf('testing_add_rank', { p_class_id: c, p_name: n, p_early_cents: 0, p_day_cents: 0, p_private_cents: 0, p_sparring_gear: false, ...PLAIN_BELT_ARGS });
  assert.equal(add('Green'), 'ok');
  for (const n of ['green', ' GREEN ', 'Green', 'GrEeN\t']) assert.equal(add(n), 'duplicate_name', n);
  assert.equal(add('High  Green'), 'ok');
  assert.equal(add('high green'), 'duplicate_name');
  assert.equal(add('high green'), 'duplicate_name');
  assert.equal(statusOf('testing_add_class', { p_location_code: 'worcester', p_name: ' group   a ', p_final_award_rank_id: null, p_final_award_none: false }), 'duplicate_name');
  assert.equal(statusOf('testing_add_class', { p_location_code: 'shrewsbury', p_name: uniqueName('x'), p_final_award_rank_id: null, p_final_award_none: false }), 'ok');
  const blueRank = classRanks(c).find((r) => r.name === 'Green');
  assert.equal(statusOf('testing_update_rank', { p_rank_id: blueRank.id, p_expected_version: 1, p_name: 'HIGH GREEN', p_early_cents: 0, p_day_cents: 0, p_private_cents: 0, p_sparring_gear: false, ...PLAIN_BELT_ARGS }), 'duplicate_name');
  // Changing only the case of its own name is fine.
  assert.equal(call('testing_update_rank', { p_rank_id: blueRank.id, p_expected_version: 1, p_name: 'GREEN', p_early_cents: 0, p_day_cents: 0, p_private_cents: 0, p_sparring_gear: false, ...PLAIN_BELT_ARGS }).version, 2);
  const groupA = schoolClasses('worcester').find((x) => x.name === 'Group A');
  assert.equal(statusOf('testing_update_class', { p_class_id: c, p_expected_version: 1, p_name: 'group b', p_final_award_rank_id: null, p_final_award_none: false }), 'duplicate_name');
  assert.equal(statusOf('testing_update_class', { p_class_id: groupA.id, p_expected_version: 1, p_name: 'GROUP A', p_final_award_rank_id: groupA.final_award_rank_id, p_final_award_none: false }), 'ok');
  // Same rank name in another class (T8b): "Yellow" is in Group A and Teen/Adult already.
  assert.equal(statusOf('testing_add_rank', { p_class_id: c, p_name: 'Yellow', p_early_cents: 0, p_day_cents: 0, p_private_cents: 0, p_sparring_gear: false, ...PLAIN_BELT_ARGS }), 'ok');
  backend.reset();
});

check('mock: T9 — name and price rules', () => {
  backend.reset();
  const c = call('testing_add_class', { p_location_code: 'worcester', p_name: '  Group   E  ', p_final_award_rank_id: null, p_final_award_none: false }).id;
  assert.equal(classRow(c).name, 'Group E'); // stored normalized
  const base = { p_class_id: c, p_early_cents: 6500, p_day_cents: 7500, p_private_cents: 8500, p_sparring_gear: false, ...PLAIN_BELT_ARGS };
  for (const bad of ['', '   ', 'x'.repeat(61), `Red${String.fromCharCode(7)}`, null, 'Gr\u200been', '\u202eneerG', 'A\u2066B', '\ufeffWhite', 'X\u2064']) {
    assert.equal(statusOf('testing_add_rank', { ...base, p_name: bad }), 'invalid', JSON.stringify(bad));
    assert.equal(statusOf('testing_add_class', { p_location_code: 'worcester', p_name: bad, p_final_award_rank_id: null, p_final_award_none: false }), 'invalid');
  }
  const r60 = call('testing_add_rank', { ...base, p_name: 'x'.repeat(60) });
  assert.equal(r60.status, 'ok');
  assert.equal(statusOf('testing_update_rank', { p_rank_id: r60.id, p_expected_version: 1, p_name: 'Bad\u200dName', p_early_cents: 0, p_day_cents: 0, p_private_cents: 0, p_sparring_gear: false, ...PLAIN_BELT_ARGS }), 'invalid');
  assert.equal(statusOf('testing_update_class', { p_class_id: c, p_expected_version: 1, p_name: 'Group\u2067E', p_final_award_rank_id: null, p_final_award_none: false }), 'invalid');
  const tabbed = call('testing_add_rank', { ...base, p_name: 'High\tBlue  Belt' });
  assert.equal(rankRow(tabbed.id).name, 'High Blue Belt');
  for (const price of [-100, 100100, 6550, null]) {
    for (const key of ['p_early_cents', 'p_day_cents', 'p_private_cents']) {
      assert.equal(statusOf('testing_add_rank', { ...base, p_name: uniqueName('p'), [key]: price }), 'invalid', `${key}=${price}`);
    }
  }
  assert.equal(statusOf('testing_add_rank', { ...base, p_name: 'Zero', p_early_cents: 0 }), 'ok');
  assert.equal(statusOf('testing_add_rank', { ...base, p_name: 'Max', p_early_cents: 100000 }), 'ok');
  assert.equal(statusOf('testing_add_rank', { ...base, p_name: 'NoGear', p_sparring_gear: null, ...PLAIN_BELT_ARGS }), 'invalid');
  assert.equal(statusOf('testing_add_class', { p_location_code: 'both', p_name: 'X', p_final_award_rank_id: null, p_final_award_none: false }), 'invalid');
  assert.equal(statusOf('testing_add_class', { p_location_code: null, p_name: 'X', p_final_award_rank_id: null, p_final_award_none: false }), 'invalid');
  assert.equal(statusOf('testing_add_rank', { ...base, p_class_id: randomUUID(), p_name: 'Lost' }), 'not_found');
  assert.equal(statusOf('testing_update_rank', { p_rank_id: randomUUID(), p_expected_version: 1, p_name: 'X', p_early_cents: 0, p_day_cents: 0, p_private_cents: 0, p_sparring_gear: false, ...PLAIN_BELT_ARGS }), 'not_found');
  assert.equal(statusOf('testing_update_rank', { p_rank_id: r60.id, p_expected_version: null, p_name: 'X', p_early_cents: 0, p_day_cents: 0, p_private_cents: 0, p_sparring_gear: false, ...PLAIN_BELT_ARGS }), 'invalid');
  assert.equal(statusOf('testing_update_class', { p_class_id: randomUUID(), p_expected_version: 1, p_name: 'X', p_final_award_rank_id: null, p_final_award_none: false }), 'not_found');
  backend.reset();
});

check('mock: T10/T10b/T10c — final award rules', () => {
  backend.reset();
  const w = schoolClasses('worcester');
  const s = schoolClasses('shrewsbury');
  const otherSchoolRank = classRanks(s[2].id)[0].id;
  const ownRank = classRanks(w[2].id)[0].id;
  assert.equal(statusOf('testing_add_class', { p_location_code: 'worcester', p_name: 'Cross', p_final_award_rank_id: otherSchoolRank, p_final_award_none: false }), 'invalid');
  assert.equal(statusOf('testing_update_class', { p_class_id: w[0].id, p_expected_version: 1, p_name: w[0].name, p_final_award_rank_id: otherSchoolRank, p_final_award_none: false }), 'invalid');
  assert.equal(statusOf('testing_update_class', { p_class_id: w[2].id, p_expected_version: 1, p_name: w[2].name, p_final_award_rank_id: ownRank, p_final_award_none: false }), 'invalid');
  assert.equal(statusOf('testing_add_class', { p_location_code: 'worcester', p_name: 'Ghost', p_final_award_rank_id: randomUUID(), p_final_award_none: false }), 'stale');
  assert.equal(statusOf('testing_update_class', { p_class_id: w[0].id, p_expected_version: 1, p_name: w[0].name, p_final_award_rank_id: randomUUID(), p_final_award_none: false }), 'stale');
  // Check order: not_found before stale before invalid relations.
  assert.equal(statusOf('testing_update_class', { p_class_id: w[0].id, p_expected_version: 9, p_name: w[0].name, p_final_award_rank_id: otherSchoolRank, p_final_award_none: false }), 'stale');
  // A valid award in a later class, and Not set.
  const added = call('testing_add_class', { p_location_code: 'worcester', p_name: 'With award', p_final_award_rank_id: ownRank, p_final_award_none: false });
  assert.equal(classRow(added.id).final_award_rank_id, ownRank);
  const cleared = call('testing_update_class', { p_class_id: w[0].id, p_expected_version: 1, p_name: w[0].name, p_final_award_rank_id: null, p_final_award_none: false });
  assert.equal(cleared.version, 2);
  assert.equal(classRow(w[0].id).final_award_rank_id, null);
  backend.reset();
});

check('mock: T10d — final award None (v0.62)', () => {
  backend.reset();
  const w = schoolClasses('worcester');
  const [lt, , ga, gb, gc, gd, teen] = w;
  const blue = classRanks(gb.id)[0].id;
  const upd = (cls, version, rankId, none) => call('testing_update_class', {
    p_class_id: cls.id, p_expected_version: version, p_name: cls.name, p_final_award_rank_id: rankId, p_final_award_none: none,
  });
  // Add with None → ok, final_award_none in the answer.
  const added = call('testing_add_class', { p_location_code: 'worcester', p_name: 'Black belts', p_final_award_rank_id: null, p_final_award_none: true });
  assert.deepEqual(Object.keys(added).sort(), ['final_award_none', 'id', 'position', 'status', 'version']);
  assert.equal(added.final_award_none, true);
  assert.equal(classRow(added.id).final_award_none, true);
  assert.equal(classRow(added.id).final_award_rank_id, null);
  // A rank AND None → invalid; None null → invalid (add and update). Nothing changes.
  const before = fingerprint();
  assert.equal(statusOf('testing_add_class', { p_location_code: 'worcester', p_name: 'Both', p_final_award_rank_id: blue, p_final_award_none: true }), 'invalid');
  assert.equal(statusOf('testing_add_class', { p_location_code: 'worcester', p_name: 'Nul', p_final_award_rank_id: null, p_final_award_none: null }), 'invalid');
  assert.equal(statusOf('testing_update_class', { p_class_id: ga.id, p_expected_version: 1, p_name: 'Group A', p_final_award_rank_id: blue, p_final_award_none: true }), 'invalid');
  assert.equal(statusOf('testing_update_class', { p_class_id: ga.id, p_expected_version: 1, p_name: 'Group A', p_final_award_rank_id: blue, p_final_award_none: null }), 'invalid');
  // Argument checks come before not_found and stale.
  assert.equal(statusOf('testing_update_class', { p_class_id: randomUUID(), p_expected_version: 99, p_name: 'X', p_final_award_rank_id: blue, p_final_award_none: true }), 'invalid');
  assert.equal(statusOf('testing_update_class', { p_class_id: randomUUID(), p_expected_version: 99, p_name: 'X', p_final_award_rank_id: null, p_final_award_none: true }), 'not_found');
  assert.equal(fingerprint(), before);
  // Each change of state bumps the version: rank → None → Not set → None → rank.
  let r = upd(ga, 1, null, true);
  assert.deepEqual(r, { status: 'ok', id: ga.id, version: 2, final_award_none: true });
  assert.equal(classRow(ga.id).final_award_rank_id, null);
  r = upd(ga, 2, null, true); // the same None again → no change
  assert.equal(r.version, 2);
  r = upd(ga, 2, null, false);
  assert.deepEqual(r, { status: 'ok', id: ga.id, version: 3, final_award_none: false });
  r = upd(ga, 3, null, true);
  assert.equal(r.version, 4);
  r = upd(ga, 4, blue, false);
  assert.deepEqual(r, { status: 'ok', id: ga.id, version: 5, final_award_none: false });
  assert.equal(classRow(ga.id).final_award_rank_id, blue);
  assert.equal(classRow(ga.id).updated_by_name, 'Jeffrey Berg');
  // A None class used to point at Bo Dan (Group C → None): deleting Bo Dan doesn't touch it.
  assert.equal(upd(gc, 1, null, true).version, 2);
  const gdIds = classRanks(gd.id).map((x) => x.id);
  const del = call('testing_delete_rank', { p_rank_id: gdIds[0], p_expected_version: 1, p_expected_class_version: 1, p_expected_rank_ids: gdIds, p_expected_lost_award_class_ids: [] });
  assert.deepEqual(del.classes_lost_award, []);
  assert.equal(classRow(gc.id).version, 2);
  assert.equal(classRow(gc.id).final_award_none, true);
  // Deleting the last rank of a None class itself: nobody loses an award, the class stays None.
  const gdNow = classRanks(gd.id).map((x) => x.id);
  const last = call('testing_delete_rank', { p_rank_id: gdNow.at(-1), p_expected_version: 1, p_expected_class_version: 1, p_expected_rank_ids: gdNow, p_expected_lost_award_class_ids: [] });
  assert.deepEqual(last.classes_lost_award, []);
  assert.equal(last.class_final_award_now_on, gdNow.at(-2));
  assert.equal(classRow(gd.id).final_award_none, true);
  assert.equal(classRow(gd.id).version, 1);
  // Deleting a whole class: None classes are never in the lost list.
  const teenIds = classRanks(teen.id).map((x) => x.id);
  const cd = call('testing_delete_class', { p_class_id: teen.id, p_expected_version: 1, p_expected_rank_ids: teenIds, p_expected_lost_award_class_ids: [] });
  assert.deepEqual(cd.classes_lost_award, []);
  // A None class can't be offered a rank AND None, but an own-school rank alone is fine again.
  assert.equal(upd(lt, 1, classRanks(gd.id)[0].id, false).final_award_none, false);
  // Reading the column.
  const read = backend.select('testing_classes', 'id, final_award_none', [{ col: 'id', value: gd.id }], [], DESK);
  assert.deepEqual(read.data, [{ id: gd.id, final_award_none: true }]);
  backend.reset();
});

check('mock: belts (v0.64, preview first)', () => {
  backend.reset();
  const ga = schoolClasses('worcester')[2];
  // Stored and readable (the desk can read the belt columns too).
  const cols = 'name, belt_pattern, belt_color, belt_color_2, belt_end_stripes, belt_end_stripe_color';
  const read = backend.select('testing_ranks', cols, [{ col: 'class_id', value: ga.id }], [{ col: 'position', ascending: true }], DESK);
  assert.equal(read.error, null);
  assert.deepEqual(read.data.at(-1), { name: 'High Green', belt_pattern: 'stripe', belt_color: 'green', belt_color_2: 'white', belt_end_stripes: 0, belt_end_stripe_color: 'yellow' });
  // add_rank: every belt rule → invalid, nothing changes.
  const before = fingerprint();
  const addArgs = { p_class_id: ga.id, p_name: 'Belted', p_early_cents: 0, p_day_cents: 0, p_private_cents: 0, p_sparring_gear: false };
  const badBelts = [
    { p_belt_pattern: 'dotted' }, { p_belt_pattern: null }, { p_belt_color: 'pink' }, { p_belt_color: null },
    { p_belt_color_2: 'black' }, // solid with a second color
    { p_belt_pattern: 'stripe' }, // stripe without a second color
    { p_belt_pattern: 'half', p_belt_color_2: 'white' }, // half with the same color twice
    { p_belt_pattern: 'stripe', p_belt_color_2: 'gold' },
    { p_belt_end_stripes: 4 }, { p_belt_end_stripes: -1 }, { p_belt_end_stripes: null },
    { p_belt_end_stripes: 1, p_belt_end_stripe_color: null }, { p_belt_end_stripe_color: 'gold' },
  ];
  for (const bad of badBelts) {
    assert.equal(statusOf('testing_add_rank', { ...addArgs, ...PLAIN_BELT_ARGS, ...bad }), 'invalid', JSON.stringify(bad));
  }
  assert.equal(fingerprint(), before);
  // Belt arguments are required (no defaults) and typed.
  for (const key of Object.keys(PLAIN_BELT_ARGS)) {
    const missing = { ...addArgs, ...PLAIN_BELT_ARGS, [key]: undefined };
    assert.equal(backend.rpc('testing_add_rank', missing, ADMIN).error.code, 'PGRST202', key);
  }
  assert.equal(backend.rpc('testing_add_rank', { ...addArgs, ...PLAIN_BELT_ARGS, p_belt_end_stripes: 1.5 }, ADMIN).error.code, '22P02');
  // Access checks still come first.
  assert.equal(statusOf('testing_add_rank', { ...addArgs, ...PLAIN_BELT_ARGS, p_belt_pattern: 'dotted' }, DESK), 'not_allowed');
  // A valid belt is stored exactly.
  const stripe3 = { p_belt_pattern: 'stripe', p_belt_color: 'black', p_belt_color_2: 'white', p_belt_end_stripes: 3, p_belt_end_stripe_color: 'yellow' };
  const added = call('testing_add_rank', { ...addArgs, ...stripe3 });
  assert.equal(added.status, 'ok');
  assert.deepEqual(
    (({ belt_pattern, belt_color, belt_color_2, belt_end_stripes, belt_end_stripe_color }) => ({ belt_pattern, belt_color, belt_color_2, belt_end_stripes, belt_end_stripe_color }))(rankRow(added.id)),
    { belt_pattern: 'stripe', belt_color: 'black', belt_color_2: 'white', belt_end_stripes: 3, belt_end_stripe_color: 'yellow' },
  );
  // update_rank: a belt-only change bumps the version; the same belt again doesn't.
  const upd = (version, belt) => call('testing_update_rank', { p_rank_id: added.id, p_expected_version: version, p_name: 'Belted', p_early_cents: 0, p_day_cents: 0, p_private_cents: 0, p_sparring_gear: false, ...belt });
  clock += 60000;
  assert.equal(upd(1, { ...stripe3, p_belt_end_stripes: 2 }).version, 2);
  assert.equal(rankRow(added.id).updated_at, new Date(clock).toISOString());
  assert.equal(upd(2, { ...stripe3, p_belt_end_stripes: 2 }).version, 2); // unchanged
  assert.equal(upd(2, { ...stripe3, p_belt_end_stripes: 2, p_belt_end_stripe_color: 'red' }).version, 3);
  assert.equal(upd(3, { ...stripe3, p_belt_pattern: 'half', p_belt_end_stripes: 0 }).version, 4);
  assert.equal(upd(4, PLAIN_BELT_ARGS).version, 5);
  assert.equal(statusOf('testing_update_rank', { p_rank_id: added.id, p_expected_version: 5, p_name: 'Belted', p_early_cents: 0, p_day_cents: 0, p_private_cents: 0, p_sparring_gear: false, ...PLAIN_BELT_ARGS, p_belt_color_2: 'black' }), 'invalid');
  // A reorder still doesn't touch versions.
  const ids = classRanks(ga.id).map((r) => r.id);
  call('testing_reorder_ranks', { p_class_id: ga.id, p_expected_ids: ids, p_new_ids: [...ids].reverse() });
  assert.equal(rankRow(added.id).version, 5);
  backend.reset();
});

check('mock: T11/T12 — reorder argument and stale checks', () => {
  backend.reset();
  const w = schoolClasses('worcester').map((c) => c.id);
  const s = schoolClasses('shrewsbury').map((c) => c.id);
  const ga = schoolClasses('worcester')[2].id;
  const r = classRanks(ga).map((x) => x.id);
  const otherRank = classRanks(schoolClasses('worcester')[3].id)[0].id;
  const before = fingerprint();
  const classCases = [
    [w, [...w.slice(0, -1), s[0]]], // not a permutation / foreign id
    [w, null], [null, w], [w, [...w.slice(0, -1), null]], [[...w.slice(0, -1), null], w],
    [w, [w[0], ...w.slice(0, -1)]], [[w[0], ...w.slice(0, -1)], w], // duplicates
    [w, w.slice(1)], // length mismatch
  ];
  for (const [expected, next] of classCases) {
    assert.equal(statusOf('testing_reorder_classes', { p_location_code: 'worcester', p_expected_ids: expected, p_new_ids: next }), 'invalid');
  }
  assert.equal(statusOf('testing_reorder_classes', { p_location_code: 'nowhere', p_expected_ids: w, p_new_ids: w }), 'invalid');
  const rankCases = [[r, [...r.slice(0, -1), otherRank]], [r, null], [r, [r[0], r[0], r[1], r[2]]], [r, r.slice(1)], [[...r.slice(0, -1), null], r]];
  for (const [expected, next] of rankCases) {
    assert.equal(statusOf('testing_reorder_ranks', { p_class_id: ga, p_expected_ids: expected, p_new_ids: next }), 'invalid');
  }
  assert.equal(statusOf('testing_reorder_ranks', { p_class_id: null, p_expected_ids: r, p_new_ids: r }), 'invalid');
  assert.equal(statusOf('testing_reorder_ranks', { p_class_id: randomUUID(), p_expected_ids: r, p_new_ids: r }), 'not_found');
  // A rank list from another class is a valid permutation of itself but not this class's → stale.
  const otherIds = classRanks(schoolClasses('worcester')[3].id).map((x) => x.id);
  assert.equal(statusOf('testing_reorder_ranks', { p_class_id: ga, p_expected_ids: otherIds, p_new_ids: otherIds }), 'stale');
  // T12: expected ≠ current order.
  const wrongOrder = [w[1], w[0], ...w.slice(2)];
  assert.equal(statusOf('testing_reorder_classes', { p_location_code: 'worcester', p_expected_ids: wrongOrder, p_new_ids: w }), 'stale');
  assert.equal(statusOf('testing_reorder_classes', { p_location_code: 'worcester', p_expected_ids: s, p_new_ids: s }), 'stale');
  assert.equal(statusOf('testing_reorder_ranks', { p_class_id: ga, p_expected_ids: [r[1], r[0], r[2], r[3]], p_new_ids: r }), 'stale');
  assert.equal(fingerprint(), before);
});

check('mock: T13/T13b — versions', () => {
  backend.reset();
  const ga = schoolClasses('worcester')[2];
  const yellow = classRanks(ga.id)[0];
  const ids = classRanks(ga.id).map((x) => x.id);
  assert.equal(statusOf('testing_update_rank', { p_rank_id: yellow.id, p_expected_version: 2, p_name: 'Y', p_early_cents: 0, p_day_cents: 0, p_private_cents: 0, p_sparring_gear: false, ...PLAIN_BELT_ARGS }), 'stale');
  assert.equal(statusOf('testing_update_class', { p_class_id: ga.id, p_expected_version: 2, p_name: 'Y', p_final_award_rank_id: null, p_final_award_none: false }), 'stale');
  assert.equal(statusOf('testing_delete_rank', { p_rank_id: ids[1], p_expected_version: 2, p_expected_class_version: 1, p_expected_rank_ids: ids, p_expected_lost_award_class_ids: [] }), 'stale');
  assert.equal(statusOf('testing_delete_class', { p_class_id: ga.id, p_expected_version: 2, p_expected_rank_ids: ids, p_expected_lost_award_class_ids: [] }), 'stale');
  clock += 60000;
  call('testing_reorder_ranks', { p_class_id: ga.id, p_expected_ids: ids, p_new_ids: [...ids].reverse() });
  const after = classRanks(ga.id);
  for (const row of after) {
    assert.equal(row.version, 1); // a reorder never changes versions …
    assert.equal(row.updated_at, '2026-10-16T20:52:00Z'); // … or "last changed"
    assert.equal(row.updated_by_name, 'Main Admin');
  }
  const cids = schoolClasses('worcester').map((x) => x.id);
  call('testing_reorder_classes', { p_location_code: 'worcester', p_expected_ids: cids, p_new_ids: [...cids].reverse() });
  for (const row of schoolClasses('worcester')) assert.equal(row.version, 1);
  backend.reset();
});

check('mock: T15/T16 — deleting ranks', () => {
  backend.reset();
  const ga = schoolClasses('worcester')[2];
  const gb = schoolClasses('worcester')[3];
  const ids = classRanks(ga.id).map((x) => x.id);
  // T15: middle rank.
  const del = call('testing_delete_rank', { p_rank_id: ids[1], p_expected_version: 1, p_expected_class_version: 1, p_expected_rank_ids: ids, p_expected_lost_award_class_ids: [] });
  assert.deepEqual(del, { status: 'ok', classes_lost_award: [], class_final_award_now_on: ids[3] });
  assert.deepEqual(classRanks(ga.id).map((r) => r.id), [ids[0], ids[2], ids[3]]);
  assert.ok(dense(classRanks(ga.id)));
  assert.ok(classRanks(ga.id).every((r) => r.version === 1));
  assert.equal(classRow(ga.id).version, 1);
  // T16: Blue (first of Group B) is Group A's final award.
  const gbIds = classRanks(gb.id).map((x) => x.id);
  const res = call('testing_delete_rank', { p_rank_id: gbIds[0], p_expected_version: 1, p_expected_class_version: 1, p_expected_rank_ids: gbIds, p_expected_lost_award_class_ids: [ga.id] });
  assert.deepEqual(res, { status: 'ok', classes_lost_award: [{ id: ga.id, name: 'Group A' }], class_final_award_now_on: gbIds[3] });
  assert.equal(classRow(ga.id).final_award_rank_id, null);
  assert.equal(classRow(ga.id).version, 2); // set-null counts as a change
  assert.equal(classRow(ga.id).updated_by_name, 'Jeffrey Berg');
  // Yellow is the award of Little Tiger AND White → both reported, in belt order.
  const yellow = classRanks(ga.id)[0].id;
  const gaIds = classRanks(ga.id).map((r) => r.id);
  const lt = schoolClasses('worcester')[0];
  const white = schoolClasses('worcester')[1];
  assert.equal(statusOf('testing_delete_rank', { p_rank_id: yellow, p_expected_version: 1, p_expected_class_version: 2, p_expected_rank_ids: gaIds, p_expected_lost_award_class_ids: [lt.id] }), 'stale');
  const y = call('testing_delete_rank', { p_rank_id: yellow, p_expected_version: 1, p_expected_class_version: 2, p_expected_rank_ids: gaIds, p_expected_lost_award_class_ids: [white.id, lt.id] });
  assert.deepEqual(y.classes_lost_award.map((c) => c.name), ['Little Tiger', 'White']);
  // Only rank → class_final_award_now_on is null.
  const whiteRank = classRanks(white.id)[0].id;
  const w2 = classRow(white.id);
  const only = call('testing_delete_rank', { p_rank_id: whiteRank, p_expected_version: 1, p_expected_class_version: w2.version, p_expected_rank_ids: [whiteRank], p_expected_lost_award_class_ids: [] });
  assert.equal(only.class_final_award_now_on, null);
  // Argument checks.
  const gbNow = classRanks(gb.id).map((x) => x.id);
  const okArgs = { p_rank_id: gbNow[0], p_expected_version: 1, p_expected_class_version: 1, p_expected_rank_ids: gbNow, p_expected_lost_award_class_ids: [] };
  for (const key of Object.keys(okArgs)) assert.equal(statusOf('testing_delete_rank', { ...okArgs, [key]: null }), 'invalid', key);
  assert.equal(statusOf('testing_delete_rank', { ...okArgs, p_expected_rank_ids: gbNow.slice(1) }), 'invalid'); // rank not in the list
  assert.equal(statusOf('testing_delete_rank', { ...okArgs, p_expected_rank_ids: [...gbNow, gbNow[0]] }), 'invalid');
  assert.equal(statusOf('testing_delete_rank', { ...okArgs, p_expected_lost_award_class_ids: [null] }), 'invalid');
  assert.equal(statusOf('testing_delete_rank', { ...okArgs, p_rank_id: randomUUID(), p_expected_rank_ids: [...gbNow.slice(1), randomUUID()] }), 'invalid');
  const ghost = randomUUID();
  assert.equal(statusOf('testing_delete_rank', { ...okArgs, p_rank_id: ghost, p_expected_rank_ids: [ghost] }), 'not_found');
  backend.reset();
});

check('mock: T17/T18 — deleting classes', () => {
  backend.reset();
  const w = schoolClasses('worcester');
  const ga = w[2];
  const gaIds = classRanks(ga.id).map((r) => r.id);
  const before = fingerprint();
  // T18: only-if-empty on a class with ranks.
  assert.equal(statusOf('testing_delete_class', { p_class_id: ga.id, p_expected_version: 1, p_expected_rank_ids: gaIds, p_expected_lost_award_class_ids: [w[0].id, w[1].id], p_only_if_empty: true }), 'not_empty');
  assert.equal(fingerprint(), before);
  // T17: Group A's ranks (Yellow) are the award of Little Tiger and White. Sets: any order.
  const res = call('testing_delete_class', { p_class_id: ga.id, p_expected_version: 1, p_expected_rank_ids: [...gaIds].reverse(), p_expected_lost_award_class_ids: [w[1].id, w[0].id] });
  assert.deepEqual(res, { status: 'ok', removed_rank_count: 4, classes_lost_award: [{ id: w[0].id, name: 'Little Tiger' }, { id: w[1].id, name: 'White' }] });
  assert.equal(classRow(ga.id), undefined);
  assert.equal(db().ranks.filter((r) => gaIds.includes(r.id)).length, 0); // ranks went with it
  const after = schoolClasses('worcester');
  assert.equal(after.length, 6);
  assert.ok(dense(after));
  assert.equal(classRow(w[0].id).final_award_rank_id, null);
  assert.equal(classRow(w[0].id).version, 2);
  assert.equal(classRow(w[3].id).version, 1); // moved up a place: no version change
  assert.equal(classRow(w[3].id).position, 2);
  // Undo of "Class added": empty class with only-if-empty.
  const added = call('testing_add_class', { p_location_code: 'worcester', p_name: 'Temp', p_final_award_rank_id: null, p_final_award_none: false });
  assert.deepEqual(call('testing_delete_class', { p_class_id: added.id, p_expected_version: 1, p_expected_rank_ids: [], p_expected_lost_award_class_ids: [], p_only_if_empty: true }), { status: 'ok', removed_rank_count: 0, classes_lost_award: [] });
  // Argument checks.
  const gb = w[3];
  const gbIds = classRanks(gb.id).map((r) => r.id);
  const okArgs = { p_class_id: gb.id, p_expected_version: 1, p_expected_rank_ids: gbIds, p_expected_lost_award_class_ids: [], p_only_if_empty: false };
  for (const key of Object.keys(okArgs)) assert.equal(statusOf('testing_delete_class', { ...okArgs, [key]: null }), 'invalid', key);
  assert.equal(statusOf('testing_delete_class', { ...okArgs, p_expected_rank_ids: [...gbIds, gbIds[0]] }), 'invalid');
  assert.equal(statusOf('testing_delete_class', { ...okArgs, p_class_id: randomUUID() }), 'not_found');
  backend.reset();
});

check('mock: T18b — confirmations go stale', () => {
  backend.reset();
  const w = schoolClasses('worcester');
  const gb = w[3];
  const gbIds = classRanks(gb.id).map((r) => r.id);
  // delete_rank after the class was reordered.
  const purple = gbIds[2];
  const args = { p_rank_id: purple, p_expected_version: 1, p_expected_class_version: 1, p_expected_rank_ids: gbIds, p_expected_lost_award_class_ids: [] };
  call('testing_reorder_ranks', { p_class_id: gb.id, p_expected_ids: gbIds, p_new_ids: [gbIds[1], gbIds[0], gbIds[2], gbIds[3]] });
  const before = fingerprint();
  assert.equal(statusOf('testing_delete_rank', args), 'stale');
  assert.equal(fingerprint(), before);
  backend.reset();
  // with an old class version (the class's final award changed).
  call('testing_update_class', { p_class_id: gb.id, p_expected_version: 1, p_name: 'Group B', p_final_award_rank_id: null, p_final_award_none: false });
  assert.equal(statusOf('testing_delete_rank', args), 'stale');
  backend.reset();
  // with a lost-award list missing a class that has since chosen this rank.
  call('testing_update_class', { p_class_id: w[0].id, p_expected_version: 1, p_name: w[0].name, p_final_award_rank_id: purple, p_final_award_none: false });
  assert.equal(statusOf('testing_delete_rank', args), 'stale');
  backend.reset();
  // delete_class after a rank was added to it.
  const classArgs = { p_class_id: gb.id, p_expected_version: 1, p_expected_rank_ids: gbIds, p_expected_lost_award_class_ids: [w[2].id] };
  call('testing_add_rank', { p_class_id: gb.id, p_name: 'Extra', p_early_cents: 0, p_day_cents: 0, p_private_cents: 0, p_sparring_gear: false, ...PLAIN_BELT_ARGS });
  assert.equal(statusOf('testing_delete_class', classArgs), 'stale');
  backend.reset();
  // with a stale lost-award list (another class chose one of its ranks).
  call('testing_update_class', { p_class_id: w[0].id, p_expected_version: 1, p_name: w[0].name, p_final_award_rank_id: gbIds[3], p_final_award_none: false });
  assert.equal(statusOf('testing_delete_class', classArgs), 'stale');
  backend.reset();
  assert.equal(statusOf('testing_delete_class', classArgs), 'ok'); // the fresh confirmation works
  backend.reset();
});

check('mock: preview helpers and storage', () => {
  backend.reset();
  const before = fingerprint();
  backend.failNextSave();
  const failed = backend.rpc('testing_add_class', { p_location_code: 'worcester', p_name: 'X', p_final_award_rank_id: null, p_final_award_none: false }, ADMIN);
  assert.deepEqual(failed.data, null);
  assert.equal(failed.error.message, 'Failed to fetch (preview: failNextSave)');
  assert.equal(fingerprint(), before);
  assert.equal(statusOf('testing_add_class', { p_location_code: 'worcester', p_name: 'X', p_final_award_rank_id: null, p_final_award_none: false }), 'ok'); // only once
  backend.reset();
  // simulateOtherAdminEdit: versions up, first two ranks of the first class swapped (each school).
  const lt = schoolClasses('worcester')[0];
  const ltIds = classRanks(lt.id).map((r) => r.id);
  backend.simulateOtherAdminEdit();
  assert.ok(db().classes.every((c) => c.version === 2 && c.updated_by_name === 'Other Admin'));
  assert.ok(db().ranks.every((r) => r.version === 2));
  assert.deepEqual(classRanks(lt.id).map((r) => r.id), [ltIds[1], ltIds[0], ...ltIds.slice(2)]);
  const ltS = schoolClasses('shrewsbury')[0];
  assert.equal(classRanks(ltS.id)[0].name, 'LT Yellow');
  // An Undo/confirmation built before is now stale.
  assert.equal(statusOf('testing_delete_rank', { p_rank_id: ltIds[5], p_expected_version: 1, p_expected_class_version: 1, p_expected_rank_ids: ltIds, p_expected_lost_award_class_ids: [] }), 'stale');
  assert.equal(backend.clearSchool('Shrewsbury'), true);
  assert.equal(schoolClasses('shrewsbury').length, 0);
  assert.equal(db().ranks.filter((r) => r.location_code === 'shrewsbury').length, 0);
  assert.equal(schoolClasses('worcester').length, 7);
  assert.equal(backend.clearSchool('Both'), false);
  backend.reset();
  assert.equal(fingerprint(), JSON.stringify(defaultTestingData()));
  // Missing or damaged store → default data.
  memory = { schema: 1, classes: 'nope', ranks: [] };
  assert.equal(fingerprint(), JSON.stringify(defaultTestingData()));
  memory = { schema: 1, classes: [], ranks: [] }; // saved by the build before v0.62
  assert.equal(schoolClasses('worcester').length, 7);
  memory = { ...defaultTestingData(), schema: 2 }; // saved by the v0.62 build (no belts)
  assert.equal(memory.schema, 2);
  assert.equal(rankRow(classRanks(schoolClasses('worcester')[0].id)[0].id).belt_pattern, 'solid');
  assert.equal(db().schema, 3);
  const damaged = defaultTestingData();
  damaged.ranks[0].belt_color_2 = 'black'; // solid with a second color: not a valid belt
  memory = damaged;
  assert.equal(db().ranks[0].belt_color_2, null); // → default data
  assert.equal(schoolClasses('worcester').length, 7);
  memory = { ...defaultTestingData(), classes: defaultTestingData().classes.map((c) => ({ ...c, final_award_none: undefined })) };
  assert.equal(schoolClasses('worcester')[5].final_award_none, true); // a class row without the column → default data
  memory = { schema: 99, classes: [], ranks: [] };
  assert.equal(schoolClasses('worcester').length, 7);
  memory = null;
  assert.equal(schoolClasses('worcester').length, 7);
});

console.log(`${count} groups of checks ran.`);
console.log('ALL TESTING LIB CHECKS PASSED');
