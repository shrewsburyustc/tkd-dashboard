// checks.mjs — automatic checks for the Testing data layer. Run:  node src/lib/testing/checks.mjs
// (Phase 2 added: eventRules.js, qr.js, the events preview database and the family page's preview
// API — contract 0005 §5. Those groups are at the end. Phase 3 added gradingRules.js and the
// grading part of the preview database — contract 0010 §3.5 — just before the family page part.
// Phase 4 added privateRules.js and the Private testing part of the preview database — contract
// 0014 §4.5, the worked examples E1–E13 and the replays V3–V11 — after the grading part.)
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
import {
  todayInSchoolTime, addDays, defaultAutoCloseOn, isIsoDate, eventState, EVENT_STATES, stateTag, publicStateFor,
  registrationSwitch, testingFor, feeFor, isPaid, classTimeLabel, shortTime, timeToMinutes, validateClassTimes,
  signatureIsValid, noteIsValid, normalizeNote, registrationUrl, SIGNATURE_PREFIX, SIGNATURE_MAX_LENGTH, NOTE_MAX, ACK_VERSION,
  FORM_PAYING_BY, UNDO_WINDOW_MS, eventCounts,
} from './eventRules.js';
import { registrationLink, qrSvgDataUrl } from './qr.js';
import {
  RESULTS, GRADING_NOTE_MAX, normalizeGradingNote, gradingNoteProblem, gradingWindow, canChangeResults, isGraded,
  resultCounts, schoolMinutesNow, defaultGradingClassId, addedAfterDay, testingGroups, groupOfClass,
} from './gradingRules.js';
import {
  createEventsBackend, defaultEventsData, EVENT_RPC_NAMES, EVENT_RESTRICTED_RPC_NAMES, EVENT_ADMIN_ONLY_RPCS, DEFAULT_EVENT_ID, DEFAULT_PUBLIC_CODE,
  EVENT_TABLES,
} from '../mockTestingEvents.js';
import * as PR from './privateRules.js'; // phase 4: the Private testing tab's rules

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
    B('solid', 'black', null, 2, 'red'), B('solid', 'white', null, 0, 'red'), B('half', 'black', 'red', 1)]) {
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
  assert.equal(validateBelt(B('solid', 'white', null, 0, null)), 'missingEndStripeColor'); // always required
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

check('mock: belts (v0.64; same rules as the database)', () => {
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
    { p_belt_end_stripe_color: null }, // no color even with 0 end stripes
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
  assert.equal(db().schema, 4); // v0.64 → 4 in phase 2 (contract 0005)
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

// ======================= eventRules.js (phase 2, contract 0005 §1.3–§1.6) =======================
// The same table of cases the database tests use (0005_tests.sql step 4): Massachusetts time
// (America/New_York) at the minute boundaries of the closing date and the testing date.

check('eventRules: school date at the minute boundaries (America/New_York)', () => {
  const cases = [
    ['2026-11-14T04:59:59Z', '2026-11-13'], // Nov 13, 11:59:59 PM EST
    ['2026-11-14T05:00:00Z', '2026-11-14'], // Nov 14, 12:00:00 AM EST
    ['2026-11-21T04:59:59Z', '2026-11-20'], // the testing day, 11:59:59 PM
    ['2026-11-21T05:00:00Z', '2026-11-21'], // the day after: finished
    ['2026-07-01T03:59:59Z', '2026-06-30'], // summer time (EDT, UTC−4)
    ['2026-07-01T04:00:00Z', '2026-07-01'],
    ['2026-11-01T05:59:59Z', '2026-11-01'], // 1:59:59 AM EST on the night the clocks go back
    ['2027-03-14T06:59:59Z', '2027-03-14'], // 2:59:59 AM EDT, clocks went forward at 2 AM
    ['2026-12-31T23:59:59Z', '2026-12-31'],
    ['2027-01-01T04:59:59Z', '2026-12-31'],
  ];
  for (const [instant, date] of cases) {
    assert.equal(todayInSchoolTime(new Date(instant)), date, instant);
    assert.equal(todayInSchoolTime(Date.parse(instant)), date, `${instant} as ms`);
  }
  assert.match(todayInSchoolTime(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(addDays('2026-11-20', -7), '2026-11-13');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2028-03-01', -1), '2028-02-29');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-11-20', -90), '2026-08-22');
  assert.equal(defaultAutoCloseOn('2026-11-20'), '2026-11-13');
  assert.equal(defaultAutoCloseOn('nope'), null);
  assert.equal(isIsoDate('2026-02-30'), false);
  assert.equal(isIsoDate('2026-2-3'), false);
  assert.equal(isIsoDate('2028-02-29'), true);
  assert.equal(isIsoDate(null), false);
});

check('eventRules: event state machine, order and boundaries', () => {
  const ev = (over = {}) => ({ testingDate: '2026-11-20', registrationOpen: true, autoCloseOn: '2026-11-13', firstOpenedAt: '2026-10-30T14:00:00Z', ...over });
  const at = (instant) => todayInSchoolTime(new Date(instant));
  // [event, today, state]
  const cases = [
    [ev(), '2026-10-17', 'open'],
    [ev(), at('2026-11-14T04:59:59Z'), 'open'], // 11:59:59 PM on the closing date: still open
    [ev(), at('2026-11-14T05:00:00Z'), 'closed_by_date'], // 12:00:00 AM the next day: closed
    [ev(), '2026-11-20', 'closed_by_date'],
    [ev({ autoCloseOn: null }), at('2026-11-21T04:59:59Z'), 'open'], // testing day until midnight (v0.88)
    [ev({ autoCloseOn: '2026-11-20' }), '2026-11-20', 'open'], // closing on the testing day itself
    [ev({ autoCloseOn: null }), at('2026-11-21T05:00:00Z'), 'finished'],
    [ev(), '2026-11-21', 'finished'], // finished wins over everything
    [ev({ registrationOpen: false, firstOpenedAt: null }), '2026-11-21', 'finished'],
    [ev({ registrationOpen: false, firstOpenedAt: null }), '2026-10-17', 'not_open_yet'],
    [ev({ registrationOpen: false, firstOpenedAt: null }), '2026-11-15', 'not_open_yet'], // date passed without opening
    [ev({ registrationOpen: false }), '2026-10-17', 'closed'], // closed by hand
    [ev({ registrationOpen: false }), '2026-11-15', 'closed'],
    [ev({ registrationOpen: false, autoCloseOn: null }), '2026-11-20', 'closed'],
  ];
  cases.forEach(([event, today, state], i) => assert.equal(eventState(event, today), state, `case ${i}`));
  // The database spelling works too (the preview store uses it).
  assert.equal(eventState({ testing_date: '2026-11-20', registration_open: true, auto_close_on: '2026-11-13', first_opened_at: 'x' }, '2026-11-14'), 'closed_by_date');
  assert.deepEqual(EVENT_STATES, ['finished', 'open', 'closed_by_date', 'not_open_yet', 'closed']);
});

check('eventRules: staff tags and public statuses', () => {
  const e = { testingDate: '2026-11-20', autoCloseOn: '2026-11-13' };
  assert.deepEqual(stateTag('finished', e, '2026-11-21'), { code: 'finished' });
  assert.deepEqual(stateTag('open', e, '2026-11-20'), { code: 'testing_today' }); // whatever the state
  assert.deepEqual(stateTag('closed_by_date', e, '2026-11-20'), { code: 'testing_today' });
  assert.deepEqual(stateTag('not_open_yet', e, '2026-11-20'), { code: 'testing_today' });
  assert.deepEqual(stateTag('open', e, '2026-11-01'), { code: 'open_until', date: '2026-11-13' });
  assert.deepEqual(stateTag('open', { ...e, autoCloseOn: null }, '2026-11-01'), { code: 'open' });
  assert.deepEqual(stateTag('closed_by_date', e, '2026-11-15'), { code: 'closed' });
  assert.deepEqual(stateTag('closed', e, '2026-11-01'), { code: 'closed' });
  assert.deepEqual(stateTag('not_open_yet', e, '2026-11-01'), { code: 'not_open_yet' });
  assert.deepEqual(publicStateFor('open', e), { state: 'open', closedOn: null });
  assert.deepEqual(publicStateFor('not_open_yet', e), { state: 'not_open', closedOn: null }); // F11
  assert.deepEqual(publicStateFor('closed_by_date', e), { state: 'closed', closedOn: '2026-11-13' }); // F12
  assert.deepEqual(publicStateFor('closed', e), { state: 'closed', closedOn: null }); // F13
  assert.deepEqual(publicStateFor('finished', e), { state: 'finished', closedOn: null }); // F14
});

check('eventRules: the registration switch (who may open / close)', () => {
  const e = { testingDate: '2026-11-20', registrationOpen: true, autoCloseOn: '2026-11-13', firstOpenedAt: 'x' };
  const sw = (event, open, isAdmin, today) => registrationSwitch({ event, open, isAdmin, today });
  // Closing: staff and admins, any time before finished.
  assert.deepEqual(sw(e, false, false, '2026-11-20'), { status: 'ok', clearsAutoClose: false });
  assert.deepEqual(sw(e, false, false, '2026-11-21'), { status: 'finished' });
  // Opening before / on the closing date: anyone.
  const closed = { ...e, registrationOpen: false };
  assert.deepEqual(sw(closed, true, false, '2026-11-13'), { status: 'ok', clearsAutoClose: false });
  assert.deepEqual(sw({ ...closed, autoCloseOn: null }, true, false, '2026-11-20'), { status: 'ok', clearsAutoClose: false });
  // After the closing date: admins only, and it clears the closing date.
  assert.deepEqual(sw(closed, true, false, '2026-11-14'), { status: 'not_allowed' });
  assert.deepEqual(sw(closed, true, true, '2026-11-14'), { status: 'ok', clearsAutoClose: true });
  assert.deepEqual(sw(e, true, false, '2026-11-14'), { status: 'not_allowed' }); // from closed_by_date
  assert.deepEqual(sw({ ...closed, firstOpenedAt: null }, true, true, '2026-11-15'), { status: 'ok', clearsAutoClose: true });
  assert.deepEqual(sw(closed, true, true, '2026-11-21'), { status: 'finished' }); // nothing once finished
});

check('eventRules: testing for, fee by date, paid', () => {
  const belt = (color) => ({ beltPattern: 'solid', beltColor: color, beltColor2: null, beltEndStripes: 0, beltEndStripeColor: 'yellow' });
  const a = {
    id: 'A', finalAwardKind: 'rank', finalAwardName: 'Blue', faBeltPattern: 'solid', faBeltColor: 'blue', faBeltColor2: null, faBeltEndStripes: 0, faBeltEndStripeColor: 'yellow',
    ranks: [{ id: 'g', name: 'Green', position: 2, ...belt('green') }, { id: 'y', name: 'Yellow', position: 0, ...belt('yellow') }, { id: 'o', name: 'Orange', position: 1, ...belt('orange') }],
  };
  const d = { id: 'D', finalAwardKind: 'none', ranks: [{ id: 'dep', name: 'Deputy', position: 0, ...belt('black') }] };
  assert.deepEqual(testingFor([a, d], { id: 'y' }), { name: 'Orange', ...belt('orange') }); // next by position
  assert.deepEqual(testingFor([a, d], { id: 'o' }), { name: 'Green', ...belt('green') });
  assert.deepEqual(testingFor([a, d], { id: 'g' }), { name: 'Blue', ...belt('blue') }); // last → final award copy
  assert.equal(testingFor([a, d], { id: 'dep' }), null); // None → "No new rank"
  assert.equal(testingFor([a], { id: 'nope' }), null);
  // snake_case copy (the preview store)
  const snake = { final_award_kind: 'rank', final_award_name: 'Blue', fa_belt_pattern: 'solid', fa_belt_color: 'blue', fa_belt_color_2: null, fa_belt_end_stripes: 0, fa_belt_end_stripe_color: 'yellow', ranks: [{ id: 'x', name: 'High Green', position: 0, belt_pattern: 'stripe', belt_color: 'green', belt_color_2: 'white', belt_end_stripes: 0, belt_end_stripe_color: 'yellow' }] };
  assert.deepEqual(testingFor([snake], { id: 'x' }), { name: 'Blue', ...belt('blue') });
  // Fee: early before the testing day, testing-day price on it (and after).
  const rank = { earlyCents: 6500, dayCents: 7500 };
  assert.equal(feeFor(rank, '2026-11-19', '2026-11-20'), 6500);
  assert.equal(feeFor(rank, '2026-11-20', '2026-11-20'), 7500);
  assert.equal(feeFor(rank, '2026-11-21', '2026-11-20'), 7500);
  assert.equal(feeFor({ early_cents: 5000, day_cents: 6000 }, '2026-01-01', '2026-11-20'), 5000);
  // At the minute boundary: 11:59:59 PM the day before vs 12:00:00 AM on the day.
  assert.equal(feeFor(rank, todayInSchoolTime(new Date('2026-11-20T04:59:59Z')), '2026-11-20'), 6500);
  assert.equal(feeFor(rank, todayInSchoolTime(new Date('2026-11-20T05:00:00Z')), '2026-11-20'), 7500);
  assert.equal(isPaid(6500), true);
  assert.equal(isPaid(0), false); // paid then undone: net 0
  assert.equal(isPaid(null), false);
  assert.equal(isPaid(-6500), false);
});

check('eventRules: class times, signature, note, link', () => {
  assert.equal(classTimeLabel('17:00', '18:00'), '5:00 – 6:00 PM');
  assert.equal(classTimeLabel('16:00:00', '17:00:00'), '4:00 – 5:00 PM');
  assert.equal(classTimeLabel('11:30', '12:30'), '11:30 AM – 12:30 PM');
  assert.equal(classTimeLabel('09:05', '10:00'), '9:05 – 10:00 AM');
  assert.equal(classTimeLabel('00:00', '00:30'), '12:00 – 12:30 AM');
  assert.equal(classTimeLabel('12:00', '13:15'), '12:00 – 1:15 PM');
  assert.equal(classTimeLabel('25:00', '26:00'), '');
  assert.equal(shortTime('17:00:00'), '17:00');
  assert.equal(shortTime('7:00'), null);
  assert.equal(timeToMinutes('23:59'), 1439);
  assert.equal(timeToMinutes('24:00'), null);
  assert.deepEqual(validateClassTimes([
    { startTime: '16:00', endTime: '17:00' },
    { startTime: '19:00', endTime: '18:30' }, // E6
    { startTime: '19:00', endTime: '19:00' },
    { startTime: '', endTime: '17:00' },
    { startTime: '16:00', endTime: null },
    { startTime: '4pm', endTime: '5pm' },
    { start_time: '16:00:00', end_time: '17:00:00' },
  ]), [null, 'endNotAfterStart', 'endNotAfterStart', 'missingStart', 'missingEnd', 'badTime', null]);
  const sig = `${SIGNATURE_PREFIX}iVBORw0KGgo=`;
  assert.equal(signatureIsValid(sig), true);
  assert.equal(signatureIsValid('data:image/jpeg;base64,iVBORw0KGgo='), false);
  assert.equal(signatureIsValid(`${SIGNATURE_PREFIX}<svg onload=x>`), false);
  assert.equal(signatureIsValid(`${SIGNATURE_PREFIX}${'A'.repeat(SIGNATURE_MAX_LENGTH - SIGNATURE_PREFIX.length)}`), true);
  assert.equal(signatureIsValid(`${SIGNATURE_PREFIX}${'A'.repeat(SIGNATURE_MAX_LENGTH - SIGNATURE_PREFIX.length + 1)}`), false);
  assert.equal(signatureIsValid(SIGNATURE_PREFIX), false);
  assert.equal(noteIsValid(null), true);
  assert.equal(noteIsValid('x'.repeat(NOTE_MAX)), true);
  assert.equal(noteIsValid('x'.repeat(NOTE_MAX + 1)), false);
  assert.equal(noteIsValid(` \n${'x'.repeat(NOTE_MAX)}\r\n `), true); // tidied first
  assert.equal(noteIsValid('a\u200bb'), false);
  assert.equal(noteIsValid('line 1\n\tline 2'), true);
  assert.equal(normalizeNote('  Bring water.\r\nArrive early. \n'), 'Bring water.\nArrive early.');
  assert.equal(normalizeNote(' \t\r\n '), null);
  assert.equal(registrationUrl('p4w9tdkm'), 'https://tkd-dashboard.pages.dev/register/p4w9tdkm');
  assert.equal(ACK_VERSION, 'cb-2026-10-17');
  assert.deepEqual(FORM_PAYING_BY, ['cash', 'check']);
  assert.equal(UNDO_WINDOW_MS, 10000);
});

// ======================= qr.js =======================

check('qr: link and QR picture', () => {
  assert.equal(registrationLink('p4w9tdkm'), 'https://tkd-dashboard.pages.dev/register/p4w9tdkm');
  assert.equal(registrationLink('../evil'), '');
  assert.equal(registrationLink(null), '');
  const url = qrSvgDataUrl('p4w9tdkm');
  assert.ok(url.startsWith('data:image/svg+xml;charset=utf-8,'));
  const svg = decodeURIComponent(url.slice(url.indexOf(',') + 1));
  assert.ok(svg.startsWith('<svg') && svg.includes('</svg>'));
  assert.ok(!/script|onload|href/i.test(svg)); // only shapes
  assert.equal(qrSvgDataUrl('BAD CODE'), '');
});

// ======================= mockTestingEvents.js (the phase 2 preview database) =======================

let evClock = Date.parse('2026-10-17T16:00:00Z');
let evToday = '2026-10-17';
let evMemory = null;
const evIds = () => randomUUID();
const evTesting = createTestingBackend({ loadStore: () => evMemory, saveStore: (s) => { evMemory = JSON.parse(JSON.stringify(s)); }, now: () => evClock, newId: evIds });
const ev = createEventsBackend({
  readBase: () => evTesting.snapshot(),
  saveStore: (s) => { evMemory = JSON.parse(JSON.stringify(s)); },
  now: () => evClock,
  today: () => evToday,
  newId: evIds,
});
const E_ADMIN = { signedIn: true, hasDataAccess: true, isAdmin: true, actorName: 'Jeffrey Berg', userId: '00000000-0000-4000-8000-000000000001' };
const E_DESK = { signedIn: true, hasDataAccess: true, isAdmin: false, actorName: 'Staff', userId: '00000000-0000-4000-8000-0000000000d1' };
const E_DESK2 = { ...E_DESK, actorName: 'Other desk', userId: '00000000-0000-4000-8000-0000000000d2' };
const E_LOCKED = { signedIn: true, hasDataAccess: false, isAdmin: true, actorName: 'Jeffrey Berg', userId: E_ADMIN.userId };
const E_ANON = { signedIn: false, hasDataAccess: false, isAdmin: false };
const evCall = (name, args, ctx = E_ADMIN) => {
  const res = ev.rpc(name, args, ctx);
  assert.equal(res.error, null, `${name}: ${res.error?.message}`);
  return res.data;
};
const evStatus = (name, args, ctx) => evCall(name, args, ctx).status;
// Classes and ranks functions (phase 1) on the same store.
const tCall = (name, args) => {
  const res = evTesting.rpc(name, args, E_ADMIN);
  assert.equal(res.data?.status, 'ok', `${name}: ${res.error?.message ?? res.data?.status}`);
  return res.data;
};
const evDb = () => ev.snapshot();
const evReset = () => { evMemory = null; evClock = Date.parse('2026-10-17T16:00:00Z'); evToday = '2026-10-17'; };
const regBy = (ref) => evDb().registrations.find((r) => r.reference === ref);
const rosterOf = (eventId, ctx = E_ADMIN) => ev.select('testing_roster', 'id, reference, first_name, status, duplicate_state, duplicate_of, paid, paid_cents, paid_on, paid_method, last_payment_id, version, signed, class_name', [{ col: 'event_id', value: eventId }], [], ctx).data;
const eventRow = (id = DEFAULT_EVENT_ID) => evDb().events.find((e) => e.id === id);
const worcesterClass = (name) => evDb().classes.find((c) => c.location_code === 'worcester' && c.name === name);
const eventRankByName = (className, rankName, eventId = DEFAULT_EVENT_ID) => {
  const d = evDb();
  const ec = d.event_classes.find((c) => c.event_id === eventId && c.class_name === className);
  return d.event_ranks.find((r) => r.event_class_id === ec.id && r.name === rankName);
};
const SIG = `${SIGNATURE_PREFIX}iVBORw0KGgo=`;
const classesArgFor = (names, start = '17:00', end = '18:00') => names.map((n) => ({ class_id: worcesterClass(n).id, start_time: start, end_time: end }));

check('events mock: default preview data (contract 0005 §5)', () => {
  evReset();
  const d = evDb();
  assert.equal(d.schema, 4);
  assert.equal(d.events.length, 1);
  const e = d.events[0];
  assert.equal(e.name, 'November Children Testing');
  assert.equal(e.location_code, 'worcester');
  assert.equal(e.testing_date, '2026-11-20');
  assert.equal(new Date('2026-11-20T12:00:00Z').getUTCDay(), 5); // a Friday
  assert.equal(eventState(e, evToday), 'open');
  assert.match(e.public_code, /^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/);
  const classes = d.event_classes.filter((c) => c.event_id === e.id).sort((a, b) => a.position - b.position);
  assert.deepEqual(classes.map((c) => [c.class_name, classTimeLabel(c.start_time, c.end_time)]), [
    ['Little Tiger', '4:00 – 5:00 PM'], ['White', '4:00 – 5:00 PM'], ['Group A', '5:00 – 6:00 PM'],
    ['Group B', '6:00 – 7:00 PM'], ['Group C', '7:00 – 8:00 PM'], ['Group D', '7:00 – 8:00 PM'],
  ]);
  const roster = rosterOf(e.id);
  const active = roster.filter((r) => r.status === 'active' && r.duplicate_state !== 'possible');
  assert.equal(active.length, 14);
  const perClass = {};
  for (const r of active) perClass[r.class_name] = (perClass[r.class_name] ?? 0) + 1;
  assert.deepEqual(perClass, { 'Little Tiger': 3, White: 1, 'Group A': 4, 'Group B': 3, 'Group C': 2, 'Group D': 1 });
  assert.equal(roster.filter((r) => r.paid).length, 6);
  assert.equal(roster.reduce((t, r) => t + r.paid_cents, 0), 41000); // $410
  assert.equal(roster.filter((r) => r.duplicate_state === 'possible').length, 1);
  // Withdrawn: Leo, and (phase 4) Ava Chen CB-3117, moved to a private testing (her $65 nets 0 here).
  assert.equal(roster.filter((r) => r.status === 'withdrawn').length, 2);
  const zoe = roster.find((r) => r.reference === 'CB-3112');
  assert.equal(zoe.first_name, 'Zoe');
  assert.equal(zoe.signed, true);
  const mia2 = regBy('CB-3109');
  assert.equal(mia2.duplicate_of, regBy('CB-3107').id);
  // Testing for, as R1 shows: Mia Yellow → Orange, Ethan Green → High Green; LT → Group A Yellow.
  const copy = d.event_classes.filter((c) => c.event_id === e.id).map((c) => ({ ...c, ranks: d.event_ranks.filter((r) => r.event_class_id === c.id) }));
  assert.equal(testingFor(copy, eventRankByName('Group A', 'Yellow')).name, 'Orange');
  assert.equal(testingFor(copy, eventRankByName('Group A', 'Green')).name, 'High Green');
  assert.equal(testingFor(copy, eventRankByName('Little Tiger', 'LT Black')).name, 'Yellow');
  assert.equal(testingFor(copy, eventRankByName('Group D', 'Deputy')), null);
  assert.equal(testingFor(copy, eventRankByName('Group A', 'High Green')).name, 'Blue');
  // School addresses start empty.
  assert.ok(d.locations.every((l) => l.address_street === null && l.version === 1));
  // Classes and ranks are still the phase 1 default list.
  assert.equal(d.classes.filter((c) => c.location_code === 'worcester').length, 7);
});

check('events mock: default data dates are in the past and in order', () => {
  // Dates count back from "today": registered and paid 1-8 days ago, the event made before that.
  const schoolDay = (iso) => todayInSchoolTime(new Date(iso));
  for (const today of ['2026-10-17', '2026-07-01', '2026-11-19', '2026-11-20']) {
    const d = defaultEventsData({ today });
    const e = d.events[0];
    assert.equal(e.testing_date, '2026-11-20', today);
    assert.equal(e.auto_close_on, '2026-11-13');
    assert.ok(schoolDay(e.created_at) < today && schoolDay(e.first_opened_at) < today, today);
    for (const r of d.registrations) {
      const day = schoolDay(r.registered_at);
      assert.ok(day >= addDays(today, -8) && day <= addDays(today, -1), `${today} ${r.reference} ${day}`);
      assert.ok(e.created_at < r.registered_at, `${r.reference} registered before the event was made`);
      if (r.withdrawn_at) assert.ok(r.registered_at < r.withdrawn_at && schoolDay(r.withdrawn_at) < today);
    }
    for (const p of d.payments) {
      const reg = d.registrations.find((r) => r.id === p.registration_id);
      assert.ok(p.paid_on < today && p.paid_on >= schoolDay(reg.registered_at), `${today} ${reg.reference} paid ${p.paid_on}`);
      assert.ok(reg.registered_at < p.recorded_at && schoolDay(p.recorded_at) < today);
      // A payment is dated the day it was recorded; a move's reversal (phase 4) the original's day.
      if (p.kind === 'payment') assert.equal(schoolDay(p.recorded_at), p.paid_on);
      else assert.equal(p.paid_on, d.payments.find((x) => x.id === p.reverses_payment_id).paid_on);
    }
    assert.equal(d.payments.reduce((t, p) => t + p.amount_cents, 0), 41000); // early prices: $410
  }
  // Summer clock (UTC-4) and winter clock (UTC-5) both give the right school time.
  const summer = defaultEventsData({ today: '2026-07-10' }).registrations.find((r) => r.reference === 'CB-3101');
  assert.equal(summer.registered_at, '2026-07-02T21:20:00.000Z'); // 5:20 PM EDT
  const winter = defaultEventsData({ today: '2026-11-10' }).registrations.find((r) => r.reference === 'CB-3101');
  assert.equal(winter.registered_at, '2026-11-02T22:20:00.000Z'); // 5:20 PM EST
  // After Nov 20 2026 the event moves to 30 days ahead.
  const late = defaultEventsData({ today: '2026-12-05' }).events[0];
  assert.deepEqual([late.testing_date, late.auto_close_on], ['2027-01-04', '2026-12-28']);
  // The backend counts back from the pretend date, but never from a date later than its clock.
  evReset();
  assert.equal(todayInSchoolTime(new Date(evDb().registrations[0].registered_at)), addDays(evToday, -8));
  evToday = '2026-11-25'; // pretend later than the clock (Oct 17): still counts back from Oct 17
  assert.equal(evDb().events[0].testing_date, '2026-11-20');
  assert.ok(evDb().payments.every((p) => p.recorded_at < new Date(evClock).toISOString()));
  evReset();
});

check('eventRules: eventCounts for the Events list and Delete event', () => {
  const rows = [
    { status: 'active', paid_cents: 6500 }, { status: 'active', paid_cents: 0 }, { status: 'active', paid_cents: null },
    { status: 'withdrawn', paid_cents: 7000 }, { status: 'withdrawn', paid_cents: 0 },
  ];
  assert.deepEqual(eventCounts(rows), { activeCount: 3, withdrawnCount: 2, registrationCount: 5, paymentTotalCents: 13500, removedPaymentCents: 7000 });
  assert.deepEqual(eventCounts([]), { activeCount: 0, withdrawnCount: 0, registrationCount: 0, paymentTotalCents: 0, removedPaymentCents: 0 });
  // On the default data the totals are exactly what Delete event expects.
  evReset();
  const c = eventCounts(rosterOf(DEFAULT_EVENT_ID));
  // (Phase 4: + Ava Chen CB-3117, moved to a private testing — withdrawn, her $65 nets 0 here.)
  assert.deepEqual(c, { activeCount: 15, withdrawnCount: 2, registrationCount: 17, paymentTotalCents: 41000, removedPaymentCents: 0 });
  const e = eventRow();
  assert.equal(evStatus('testing_delete_event', { p_event_id: e.id, p_expected_version: e.version, p_expected_registration_count: c.activeCount, p_expected_payment_total_cents: c.paymentTotalCents }), 'stale');
  assert.equal(evStatus('testing_delete_event', { p_event_id: e.id, p_expected_version: e.version, p_expected_registration_count: c.registrationCount, p_expected_payment_total_cents: c.paymentTotalCents }), 'ok');
  evReset();
});

check('events mock: reads and column permissions', () => {
  evReset();
  const sel = (table, cols, ctx = E_ADMIN, filters = []) => ev.select(table, cols, filters, [], ctx);
  assert.equal(sel('testing_events', 'id, name, public_code').error, null);
  assert.equal(sel('testing_events', 'id, name', E_DESK).data.length, 1); // staff can read
  for (const [table, col] of [['testing_registrations', 'signature'], ['testing_registrations', 'submission_id'], ['testing_registrations', 'created_by'],
    ['testing_payments', 'recorded_by'], ['testing_events', 'updated_by'], ['testing_public_attempts', 'id'], ['locations', 'updated_by'], ['testing_roster', '*']]) {
    assert.equal(sel(table, `id, ${col}`).error?.code ?? sel(table, col).error?.code, '42501', `${table}.${col}`);
  }
  assert.equal(sel('testing_roster', 'signature').error.code, '42703'); // the view has no signature at all
  const view = sel('testing_roster', 'reference, class_name, start_time, rank_name, belt_color, early_cents, paid_cents', E_ADMIN, [{ col: 'reference', value: 'CB-3112' }]).data[0];
  assert.deepEqual(view, { reference: 'CB-3112', class_name: 'Group A', start_time: '17:00:00', rank_name: 'Yellow', belt_color: 'yellow', early_cents: 6500, paid_cents: 0 });
  assert.equal(sel('testing_events', 'nope').error.code, '42703');
  assert.equal(sel('testing_events', 'id', E_LOCKED).data.length, 0); // RLS hides rows
  assert.equal(sel('testing_events', 'id', E_ANON).error.code, '42501');
  assert.equal(sel('locations', 'code, name, id, address_street, address_city, address_state, address_zip, version').data.length, 2);
  // "in" filter
  const ids = evDb().registrations.slice(0, 3).map((r) => r.id);
  assert.equal(ev.select('testing_registrations', 'id', [{ col: 'id', value: ids, op: 'in' }], [], E_ADMIN).data.length, 3);
  // The public functions and helpers are not for signed-in staff.
  for (const name of EVENT_RESTRICTED_RPC_NAMES) assert.equal(ev.rpc(name, {}, E_ADMIN).error.code, '42501', name);
  assert.equal(ev.rpc('testing_nope', {}, E_ADMIN).error.code, 'PGRST202');
  assert.equal(ev.rpc('testing_mark_paid', { p_registration_id: 'x', p_expected_version: 1 }, E_ADMIN).error.code, '22P02');
  assert.equal(ev.rpc('testing_mark_paid', { p_registration_id: regBy('CB-3112').id }, E_ADMIN).error.code, 'PGRST202'); // missing argument
});

check('events mock: who may call each function (A / S splits)', () => {
  evReset();
  const anyId = '00000000-0000-4000-8000-00000000abcd';
  const sample = {
    testing_add_event: { p_location_code: 'worcester', p_name: 'X', p_testing_date: '2026-12-01', p_classes: [], p_registration_open: false, p_auto_close_on: null, p_note: null },
    testing_update_event: { p_event_id: anyId, p_expected_version: 1, p_name: 'X', p_testing_date: '2026-12-01', p_classes: [], p_auto_close_on: null, p_note: null },
    testing_set_registration: { p_event_id: anyId, p_expected_version: 1, p_open: false },
    testing_delete_event: { p_event_id: anyId, p_expected_version: 1, p_expected_registration_count: 0, p_expected_payment_total_cents: 0 },
    testing_add_student: { p_event_id: anyId, p_first: 'A', p_last: 'B', p_event_rank_id: anyId, p_stripes: true, p_paying_by: 'cash' },
    testing_update_student: { p_registration_id: anyId, p_expected_version: 1, p_first: 'A', p_last: 'B', p_event_rank_id: anyId },
    testing_change_paying_by: { p_registration_id: anyId, p_expected_version: 1, p_paying_by: 'cash' },
    testing_mark_paid: { p_registration_id: anyId, p_expected_version: 1 },
    testing_undo_payment: { p_payment_id: anyId },
    testing_edit_payment: { p_payment_id: anyId, p_method: 'cash', p_amount_cents: 100, p_paid_on: '2026-10-17' },
    testing_resolve_duplicate: { p_keep_id: anyId, p_keep_version: 1, p_other_id: '00000000-0000-4000-8000-00000000abce', p_other_version: 1, p_keep_both: true },
    testing_withdraw_student: { p_registration_id: anyId, p_expected_version: 1 },
    testing_restore_student: { p_registration_id: anyId, p_expected_version: 1 },
    testing_delete_student: { p_registration_id: anyId, p_expected_version: 1, p_expected_payment_ids: [] },
    settings_update_school_address: { p_code: 'nowhere', p_expected_version: 1, p_street: null, p_city: null, p_state: null, p_zip: null },
    settings_update_school_contact: { p_code: 'nowhere', p_expected_version: 1, p_street: null, p_city: null, p_state: null, p_zip: null, p_phone: null }, // 0019 (new students)
    testing_set_result: { p_registration_id: anyId, p_result: 'pass' }, // phase 3 (S)
    testing_set_result_note: { p_registration_id: anyId, p_note: 'x' }, // phase 3 (S)
    // Phase 4 (S unless marked A).
    testing_private_add: { p_location_code: 'worcester', p_first: 'A', p_last: 'B', p_rank_id: anyId, p_stripes: true, p_paying_by: 'cash', p_private_date: '2026-12-01', p_private_time: '16:00' },
    testing_private_update: { p_private_id: anyId, p_expected_version: 1, p_first: 'A', p_last: 'B', p_rank_id: anyId },
    testing_private_change_day: { p_private_id: anyId, p_expected_version: 1, p_private_date: '2026-12-01', p_private_time: '16:00' },
    testing_private_change_paying_by: { p_private_id: anyId, p_expected_version: 1, p_paying_by: 'cash' },
    testing_private_mark_paid: { p_private_id: anyId, p_expected_version: 1 },
    testing_private_undo_payment: { p_payment_id: anyId },
    testing_private_edit_payment: { p_payment_id: anyId, p_method: 'cash', p_amount_cents: 100, p_paid_on: '2026-10-17' }, // A
    testing_private_cancel: { p_private_id: anyId, p_expected_version: 1 },
    testing_private_restore: { p_private_id: anyId, p_expected_version: 1 }, // A
    testing_private_delete: { p_private_id: anyId, p_expected_version: 1, p_expected_payment_ids: [] }, // A
    testing_private_set_result: { p_private_id: anyId, p_result: 'pass' },
    testing_private_set_result_note: { p_private_id: anyId, p_note: 'x' },
    testing_move_to_private: { p_registration_id: anyId, p_expected_version: 1, p_private_date: '2026-12-01', p_private_time: '16:00' },
    testing_private_undo_move: { p_private_id: anyId, p_expected_version: 1 },
  };
  assert.deepEqual(Object.keys(sample).sort(), [...EVENT_RPC_NAMES].sort());
  // testing_restore_student checks who inside (staff: their own "keep one" for 10 seconds).
  const adminOnly = ['testing_add_event', 'testing_update_event', 'testing_delete_event', 'testing_edit_payment', 'testing_withdraw_student', 'testing_delete_student', 'settings_update_school_address', 'settings_update_school_contact',
    'testing_private_edit_payment', 'testing_private_restore', 'testing_private_delete']; // the last three: phase 4
  assert.deepEqual([...EVENT_ADMIN_ONLY_RPCS].sort(), [...adminOnly].sort());
  const before = JSON.stringify(evDb());
  for (const name of EVENT_RPC_NAMES) {
    assert.equal(ev.rpc(name, sample[name], E_ANON).error.code, '42501', `${name} anon`);
    assert.equal(evStatus(name, sample[name], E_LOCKED), 'no_access', `${name} locked`); // has_data_access first
    const desk = evStatus(name, sample[name], E_DESK);
    if (adminOnly.includes(name)) assert.equal(desk, 'not_allowed', `${name} staff`);
    else assert.notEqual(desk, 'not_allowed', `${name} staff`);
    assert.notEqual(evStatus(name, sample[name], E_ADMIN), 'not_allowed', `${name} admin`);
  }
  assert.equal(JSON.stringify(evDb()), before); // nothing was written by refusals
  // failNextSave: a dropped connection, nothing changes.
  ev.failNextSave();
  const res = ev.rpc('testing_mark_paid', { p_registration_id: regBy('CB-3112').id, p_expected_version: regBy('CB-3112').version }, E_DESK);
  assert.equal(res.data, null);
  assert.ok(res.error);
  assert.equal(regBy('CB-3112').version, 1);
});

check('events mock: Add / Edit / Delete event and the copy rule', () => {
  evReset();
  const add = (over = {}) => evCall('testing_add_event', {
    p_location_code: 'worcester', p_name: 'January Children Testing', p_testing_date: '2027-01-22',
    p_classes: classesArgFor(['Group A', 'Group B']), p_registration_open: false, p_auto_close_on: '2027-01-15', p_note: null, ...over,
  });
  // Argument rules.
  assert.equal(add({ p_testing_date: '2026-10-16' }).status, 'invalid'); // in the past
  assert.equal(add({ p_auto_close_on: '2027-01-23' }).status, 'invalid'); // after the testing date
  assert.equal(add({ p_auto_close_on: '2026-10-16' }).status, 'invalid'); // before today
  assert.equal(add({ p_classes: [] }).status, 'invalid');
  assert.equal(add({ p_classes: Array.from({ length: 51 }, () => ({ class_id: randomUUID(), start_time: '17:00', end_time: '18:00' })) }).status, 'invalid');
  assert.equal(add({ p_classes: [{ class_id: worcesterClass('Group A').id, start_time: '18:00', end_time: '17:30' }] }).status, 'invalid');
  assert.equal(add({ p_classes: [...classesArgFor(['Group A']), ...classesArgFor(['Group A'])] }).status, 'invalid');
  assert.equal(add({ p_note: 'x'.repeat(601) }).status, 'invalid');
  assert.equal(add({ p_location_code: 'both' }).status, 'invalid');
  assert.equal(add({ p_name: '   ' }).status, 'invalid');
  const shrewsburyA = evDb().classes.find((c) => c.location_code === 'shrewsbury' && c.name === 'Group A');
  assert.equal(add({ p_classes: [{ class_id: shrewsburyA.id, start_time: '17:00', end_time: '18:00' }] }).status, 'invalid'); // other school
  assert.equal(add({ p_classes: [{ class_id: '00000000-0000-4000-8000-00000000dead', start_time: '17:00', end_time: '18:00' }] }).status, 'stale'); // deleted class
  assert.equal(add({ p_name: ' november  children testing ' }).status, 'duplicate_name');
  // Not set final award → refused, with the class name.
  const ta = worcesterClass('Teen/Adult');
  tCall('testing_update_class', { p_class_id: ta.id, p_expected_version: ta.version, p_name: ta.name, p_final_award_rank_id: null, p_final_award_none: false });
  assert.deepEqual(add({ p_classes: classesArgFor(['Group A', 'Teen/Adult']) }), { status: 'final_award_not_set', class_name: 'Teen/Adult' });
  assert.equal(evDb().events.length, 1);
  // A good one, closed: Not open yet. Auto close null is accepted.
  const ok = add({ p_auto_close_on: null, p_note: '  Bring water.\r\n' });
  assert.equal(ok.status, 'ok');
  assert.equal(ok.version, 1);
  assert.match(ok.public_code, /^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/);
  const jan = eventRow(ok.id);
  assert.equal(jan.first_opened_at, null);
  assert.equal(eventState(jan, evToday), 'not_open_yet');
  assert.equal(jan.note, 'Bring water.');
  // Copy rule: later price / name changes in Classes and ranks don't touch the event copy.
  const yellow = evDb().ranks.find((r) => r.class_id === worcesterClass('Group A').id && r.name === 'Yellow');
  tCall('testing_update_rank', {
    p_rank_id: yellow.id, p_expected_version: yellow.version, p_name: 'Gold', p_early_cents: 9900, p_day_cents: 9900, p_private_cents: 9900, p_sparring_gear: true,
    p_belt_pattern: 'solid', p_belt_color: 'yellow', p_belt_color_2: null, p_belt_end_stripes: 0, p_belt_end_stripe_color: 'yellow',
  });
  const copied = eventRankByName('Group A', 'Yellow', ok.id);
  assert.equal(copied.early_cents, 6500);
  assert.equal(copied.rank_id, yellow.id);
  assert.equal(eventRankByName('Group A', 'Yellow').early_cents, 6500); // the default event too
  // Edit: add Group C later (copied now), times changed, Group B removed (empty).
  const upd = (over = {}) => evCall('testing_update_event', {
    p_event_id: ok.id, p_expected_version: eventRow(ok.id).version, p_name: 'January Children Testing', p_testing_date: '2027-01-22',
    p_classes: [...classesArgFor(['Group A'], '16:00', '17:00'), ...classesArgFor(['Group C'], '18:00', '19:00')], p_auto_close_on: null, p_note: null, ...over,
  });
  assert.equal(upd({ p_expected_version: 99 }).status, 'stale');
  assert.equal(upd({ p_event_id: '00000000-0000-4000-8000-00000000dead' }).status, 'not_found');
  assert.equal(upd({ p_name: 'November Children Testing' }).status, 'duplicate_name');
  const u = upd();
  assert.equal(u.status, 'ok');
  assert.equal(u.version, 2);
  const janClasses = evDb().event_classes.filter((c) => c.event_id === ok.id);
  assert.deepEqual(janClasses.map((c) => c.class_name).sort(), ['Group A', 'Group C']);
  assert.equal(janClasses.find((c) => c.class_name === 'Group A').start_time, '16:00:00');
  assert.equal(eventRankByName('Group A', 'Gold', ok.id), undefined); // Group A kept its old copy
  // Nothing changed → version stays.
  assert.equal(upd().version, 2);
  // Unticking a class with registrations (even withdrawn) → not_empty.
  const noB = classesArgFor(['Little Tiger', 'White', 'Group A', 'Group C', 'Group D']);
  const nov = eventRow();
  assert.equal(evStatus('testing_update_event', { p_event_id: nov.id, p_expected_version: nov.version, p_name: nov.name, p_testing_date: nov.testing_date, p_classes: noB, p_auto_close_on: nov.auto_close_on, p_note: null }), 'not_empty');
  // Editing a finished event may keep its past date, not move to another past date.
  evToday = '2026-12-01';
  const keep = { p_event_id: nov.id, p_expected_version: nov.version, p_name: 'November Kids', p_testing_date: '2026-11-20', p_classes: classesArgFor(['Little Tiger', 'White', 'Group A', 'Group B', 'Group C', 'Group D']), p_auto_close_on: '2026-11-13', p_note: null };
  // (times changed to 17–18 for all: allowed)
  assert.equal(evStatus('testing_update_event', { ...keep, p_testing_date: '2026-11-21' }), 'invalid');
  assert.equal(evStatus('testing_update_event', { ...keep, p_auto_close_on: '2026-11-14' }), 'invalid'); // a changed closing date in the past
  assert.equal(evStatus('testing_update_event', keep), 'ok');
  evToday = '2026-10-17';
  // Delete: the counts must be what the dialog showed (all registrations, net payments).
  const regs = evDb().registrations.filter((r) => r.event_id === nov.id);
  const del = (count, total) => evStatus('testing_delete_event', { p_event_id: nov.id, p_expected_version: eventRow().version, p_expected_registration_count: count, p_expected_payment_total_cents: total });
  assert.equal(regs.length, 17); // incl. the withdrawn one, the duplicate copy and (phase 4) Ava's moved one
  assert.equal(del(14, 41000), 'stale');
  assert.equal(del(17, 0), 'stale');
  assert.equal(evStatus('testing_delete_event', { p_event_id: nov.id, p_expected_version: 1, p_expected_registration_count: 17, p_expected_payment_total_cents: 41000 }), 'stale'); // old version
  assert.equal(del(17, 41000), 'ok');
  const after = evDb();
  assert.equal(after.events.length, 1);
  assert.equal(after.registrations.length, 0);
  assert.equal(after.payments.length, 0);
  assert.equal(after.event_classes.filter((c) => c.event_id === nov.id).length, 0);
});

check('events mock: the registration switch per role', () => {
  evReset();
  const sw = (open, ctx, version = eventRow().version) => evCall('testing_set_registration', { p_event_id: DEFAULT_EVENT_ID, p_expected_version: version, p_open: open }, ctx);
  const closed = sw(false, E_DESK); // staff may close
  assert.equal(closed.status, 'ok');
  assert.equal(closed.state, 'closed');
  assert.equal(sw(true, E_DESK, 1).status, 'stale');
  assert.deepEqual(sw(true, E_DESK), { status: 'ok', version: 3, state: 'open' }); // before the closing date: staff may open
  sw(false, E_DESK);
  evToday = '2026-11-14'; // the closing date has passed
  assert.equal(sw(true, E_DESK).status, 'not_allowed');
  const reopened = sw(true, E_ADMIN);
  assert.equal(reopened.status, 'ok');
  assert.equal(reopened.state, 'open');
  assert.equal(eventRow().auto_close_on, null); // the automatic closing date was removed (E9)
  evToday = '2026-11-21';
  assert.equal(sw(false, E_ADMIN).status, 'finished');
  assert.equal(sw(true, E_ADMIN).status, 'finished');
  // first_opened_at is set the first time it opens.
  evToday = '2026-10-17';
  const made = evCall('testing_add_event', { p_location_code: 'worcester', p_name: 'Spring', p_testing_date: '2027-03-01', p_classes: classesArgFor(['Group A']), p_registration_open: false, p_auto_close_on: '2027-02-20', p_note: null });
  assert.equal(eventRow(made.id).first_opened_at, null);
  evCall('testing_set_registration', { p_event_id: made.id, p_expected_version: 1, p_open: true }, E_DESK);
  assert.equal(eventRow(made.id).first_opened_at, new Date(evClock).toISOString());
  const opened = evCall('testing_add_event', { p_location_code: 'worcester', p_name: 'Summer', p_testing_date: '2027-06-01', p_classes: classesArgFor(['Group A']), p_registration_open: true, p_auto_close_on: null, p_note: null });
  assert.notEqual(eventRow(opened.id).first_opened_at, null);
});

check('events mock: students, Mark paid, Undo window, Edit payment', () => {
  evReset();
  const yellow = eventRankByName('Group A', 'Yellow');
  // Add student (staff): rules, then a walk-in.
  const addS = (over = {}, ctx = E_DESK) => evCall('testing_add_student', { p_event_id: DEFAULT_EVENT_ID, p_first: 'Sam', p_last: 'Ortiz', p_event_rank_id: yellow.id, p_stripes: true, p_paying_by: 'card', ...over }, ctx);
  assert.equal(addS({ p_stripes: false }).status, 'invalid');
  assert.equal(addS({ p_paying_by: 'venmo' }).status, 'invalid');
  assert.equal(addS({ p_first: '' }).status, 'invalid');
  assert.equal(addS({ p_event_id: '00000000-0000-4000-8000-00000000dead' }).status, 'not_found');
  assert.equal(addS({ p_event_rank_id: evDb().ranks[0].id }).status, 'invalid'); // not a rank of this event
  const walkIn = addS({ p_first: '  Sam  ', p_last: 'Ortiz' });
  assert.equal(walkIn.status, 'ok');
  assert.equal(walkIn.reference, 'CB-3118');
  assert.equal(walkIn.version, 1);
  const sam = evDb().registrations.find((r) => r.id === walkIn.id);
  assert.equal(sam.first_name, 'Sam');
  assert.equal(sam.source, 'staff');
  assert.equal(sam.signature, null);
  // Mark paid before the testing day: the early price, method = how they'll pay.
  const paid = evCall('testing_mark_paid', { p_registration_id: sam.id, p_expected_version: 1 }, E_DESK);
  assert.deepEqual({ ...paid, payment_id: 'x' }, { status: 'ok', payment_id: 'x', amount_cents: 6500, method: 'card', version: 2 });
  assert.equal(evStatus('testing_mark_paid', { p_registration_id: sam.id, p_expected_version: 1 }, E_DESK), 'stale'); // double click
  assert.equal(evStatus('testing_mark_paid', { p_registration_id: sam.id, p_expected_version: 2 }, E_DESK), 'already_paid');
  assert.equal(evStatus('testing_change_paying_by', { p_registration_id: sam.id, p_expected_version: 2, p_paying_by: 'cash' }, E_DESK), 'already_paid');
  const row = rosterOf(DEFAULT_EVENT_ID).find((r) => r.id === sam.id);
  assert.deepEqual([row.paid, row.paid_cents, row.paid_on, row.paid_method, row.last_payment_id], [true, 6500, '2026-10-17', 'card', paid.payment_id]);
  // Undo: another desk can't; the same desk can within 10 seconds; not after.
  assert.equal(evStatus('testing_undo_payment', { p_payment_id: paid.payment_id }, E_DESK2), 'not_allowed');
  evClock += 9999;
  const undone = evCall('testing_undo_payment', { p_payment_id: paid.payment_id }, E_DESK);
  assert.deepEqual(undone, { status: 'ok', version: 3 });
  assert.equal(evStatus('testing_undo_payment', { p_payment_id: paid.payment_id }, E_ADMIN), 'stale'); // already undone
  const reversal = evDb().payments.find((p) => p.reverses_payment_id === paid.payment_id);
  assert.equal(reversal.amount_cents, -6500);
  assert.equal(evStatus('testing_undo_payment', { p_payment_id: reversal.id }, E_ADMIN), 'invalid'); // a reversal can't be reversed
  assert.equal(evStatus('testing_undo_payment', { p_payment_id: reversal.id }, E_DESK2), 'not_allowed'); // who is checked first
  assert.equal(rosterOf(DEFAULT_EVENT_ID).find((r) => r.id === sam.id).paid, false);
  // Change how they'll pay, then pay again; 10 s later only an admin may undo.
  assert.equal(evCall('testing_change_paying_by', { p_registration_id: sam.id, p_expected_version: 3, p_paying_by: 'cash' }, E_DESK).version, 4);
  const again = evCall('testing_mark_paid', { p_registration_id: sam.id, p_expected_version: 4 }, E_DESK);
  assert.equal(again.method, 'cash');
  evClock += 10000;
  assert.equal(evStatus('testing_undo_payment', { p_payment_id: again.payment_id }, E_DESK), 'not_allowed');
  // Edit payment (admin): reversal + new payment.
  const edited = evCall('testing_edit_payment', { p_payment_id: again.payment_id, p_method: 'check', p_amount_cents: 7500, p_paid_on: '2026-10-16' });
  assert.equal(edited.status, 'ok');
  assert.equal(evStatus('testing_edit_payment', { p_payment_id: again.payment_id, p_method: 'check', p_amount_cents: 7500, p_paid_on: '2026-10-16' }), 'stale');
  assert.equal(evStatus('testing_edit_payment', { p_payment_id: edited.payment_id, p_method: 'check', p_amount_cents: 0, p_paid_on: '2026-10-16' }), 'invalid');
  assert.equal(evStatus('testing_edit_payment', { p_payment_id: edited.payment_id, p_method: 'check', p_amount_cents: 7500, p_paid_on: '2026-10-18' }), 'invalid'); // not in the future
  assert.equal(evStatus('testing_edit_payment', { p_payment_id: edited.payment_id, p_method: 'check', p_amount_cents: 100001, p_paid_on: '2026-10-16' }), 'invalid');
  const r2 = rosterOf(DEFAULT_EVENT_ID).find((r) => r.id === sam.id);
  assert.deepEqual([r2.paid_cents, r2.paid_method, r2.paid_on, r2.last_payment_id], [7500, 'check', '2026-10-16', edited.payment_id]);
  assert.equal(evStatus('testing_undo_payment', { p_payment_id: edited.payment_id }, E_ADMIN), 'ok'); // admins: any time
  // On the testing day: the testing-day price. Mark paid works even once finished.
  evToday = '2026-11-20';
  const zoe = regBy('CB-3112');
  assert.equal(evCall('testing_mark_paid', { p_registration_id: zoe.id, p_expected_version: zoe.version }, E_DESK).amount_cents, 7500);
  evToday = '2026-11-21';
  const sam2 = regBy('CB-3110');
  assert.equal(evCall('testing_mark_paid', { p_registration_id: sam2.id, p_expected_version: sam2.version }, E_DESK).amount_cents, 7500);
  assert.equal(addS().status, 'finished'); // no new students once finished
  // Withdrawn students can't be paid or change how they pay.
  const leo = regBy('CB-3116');
  assert.equal(evStatus('testing_mark_paid', { p_registration_id: leo.id, p_expected_version: leo.version }, E_DESK), 'withdrawn');
  assert.equal(evStatus('testing_change_paying_by', { p_registration_id: leo.id, p_expected_version: leo.version, p_paying_by: 'card' }, E_DESK), 'withdrawn');
});

check('events mock: edit details, duplicates, withdraw / restore, delete student', () => {
  evReset();
  const mia1 = regBy('CB-3107');
  const mia2 = regBy('CB-3109');
  // Keep both → both kept_both, not flagged again by an edit.
  const both = evCall('testing_resolve_duplicate', { p_keep_id: mia1.id, p_keep_version: mia1.version, p_other_id: mia2.id, p_other_version: mia2.version, p_keep_both: true }, E_DESK);
  assert.equal(both.status, 'ok');
  assert.deepEqual([regBy('CB-3107').duplicate_state, regBy('CB-3109').duplicate_state], ['kept_both', 'kept_both']);
  const m2 = regBy('CB-3109');
  evCall('testing_update_student', { p_registration_id: m2.id, p_expected_version: m2.version, p_first: 'Mia', p_last: 'Lopez', p_event_rank_id: eventRankByName('Group A', 'Orange').id }, E_DESK);
  assert.equal(regBy('CB-3109').duplicate_state, 'kept_both');
  evReset();
  // Keep one → the other is withdrawn as "Duplicate copy" (staff may do this one).
  const a = regBy('CB-3107');
  const b = regBy('CB-3109');
  assert.equal(evStatus('testing_resolve_duplicate', { p_keep_id: a.id, p_keep_version: 99, p_other_id: b.id, p_other_version: b.version, p_keep_both: false }, E_DESK), 'stale');
  assert.equal(evStatus('testing_resolve_duplicate', { p_keep_id: a.id, p_keep_version: a.version, p_other_id: regBy('CB-3112').id, p_other_version: 1, p_keep_both: false }, E_DESK), 'stale'); // not a pair (any more)
  assert.equal(evStatus('testing_resolve_duplicate', { p_keep_id: a.id, p_keep_version: a.version, p_other_id: b.id, p_other_version: b.version, p_keep_both: false }, E_DESK), 'ok');
  const gone = regBy('CB-3109');
  assert.deepEqual([gone.status, gone.withdrawn_reason, gone.withdrawn_by_name, gone.withdrawn_by, gone.duplicate_state], ['withdrawn', 'duplicate_copy', 'Staff', E_DESK.userId, 'none']);
  assert.equal(regBy('CB-3107').duplicate_state, 'none');
  // Restore: staff may undo their OWN "keep one" for less than 10 seconds; then admins only.
  const restore = (ctx, version = gone.version) => evStatus('testing_restore_student', { p_registration_id: gone.id, p_expected_version: version }, ctx);
  assert.equal(restore(E_DESK2), 'not_allowed'); // someone else's
  assert.equal(restore(E_DESK, 99), 'stale'); // who is checked first, then the version
  evClock += UNDO_WINDOW_MS; // exactly 10 seconds later: too late
  assert.equal(restore(E_DESK), 'not_allowed');
  evClock -= 1;
  assert.equal(restore(E_DESK2), 'not_allowed');
  assert.equal(restore(E_DESK), 'ok'); // 9.999 seconds: the toast's Undo
  const back = regBy('CB-3109');
  assert.deepEqual([back.status, back.withdrawn_reason, back.withdrawn_at, back.withdrawn_by, back.withdrawn_by_name, back.duplicate_state], ['active', null, null, null, null, 'possible']);
  assert.equal(evStatus('testing_restore_student', { p_registration_id: gone.id, p_expected_version: back.version }, E_DESK), 'not_allowed'); // active: staff
  // Keep one again, then the admin restores it (any time) → flagged again.
  const a2 = regBy('CB-3107');
  assert.equal(evStatus('testing_resolve_duplicate', { p_keep_id: a2.id, p_keep_version: a2.version, p_other_id: back.id, p_other_version: back.version, p_keep_both: false }, E_DESK), 'ok');
  const gone2 = regBy('CB-3109');
  evClock += 60 * 1000;
  assert.equal(evStatus('testing_restore_student', { p_registration_id: gone2.id, p_expected_version: gone2.version }, E_DESK), 'not_allowed');
  assert.equal(evStatus('testing_restore_student', { p_registration_id: gone2.id, p_expected_version: gone2.version }), 'ok');
  assert.equal(regBy('CB-3109').duplicate_state, 'possible');
  assert.equal(regBy('CB-3109').duplicate_of, regBy('CB-3107').id);
  assert.equal(evStatus('testing_restore_student', { p_registration_id: gone.id, p_expected_version: regBy('CB-3109').version }), 'invalid'); // already active
  // Withdraw the original → the copy goes back to none.
  const orig = regBy('CB-3107');
  assert.equal(evStatus('testing_withdraw_student', { p_registration_id: orig.id, p_expected_version: orig.version }), 'ok');
  assert.equal(regBy('CB-3107').withdrawn_by, E_ADMIN.userId);
  assert.equal(regBy('CB-3109').duplicate_state, 'none');
  // An admin's Withdraw is never staff-restorable, even at once (reason 'withdrawn', not theirs).
  assert.equal(evStatus('testing_restore_student', { p_registration_id: orig.id, p_expected_version: regBy('CB-3107').version }, E_DESK), 'not_allowed');
  const leoNow = regBy('CB-3116'); // withdrawn in the default data by the admin
  assert.equal(leoNow.withdrawn_by, E_ADMIN.userId);
  assert.equal(evStatus('testing_restore_student', { p_registration_id: leoNow.id, p_expected_version: leoNow.version }, E_DESK), 'not_allowed');
  assert.equal(regBy('CB-3107').paid_cents, undefined); // (the table has no payment columns)
  assert.equal(rosterOf(DEFAULT_EVENT_ID).find((r) => r.reference === 'CB-3107').paid, true); // Withdraw keeps payments
  assert.equal(evStatus('testing_withdraw_student', { p_registration_id: orig.id, p_expected_version: regBy('CB-3107').version }), 'withdrawn');
  // Edit details: renaming someone to match another active student flags them.
  const zoe = regBy('CB-3112');
  const upd = evCall('testing_update_student', { p_registration_id: zoe.id, p_expected_version: zoe.version, p_first: 'sam', p_last: ' DIAZ', p_event_rank_id: eventRankByName('Group B', 'Blue').id }, E_DESK);
  assert.equal(upd.status, 'ok');
  assert.equal(regBy('CB-3112').duplicate_state, 'possible');
  assert.equal(regBy('CB-3112').duplicate_of, regBy('CB-3110').id);
  assert.equal(regBy('CB-3110').duplicate_state, 'none');
  assert.equal(evStatus('testing_update_student', { p_registration_id: zoe.id, p_expected_version: upd.version, p_first: 'Zoe', p_last: 'Park', p_event_rank_id: evDb().ranks[0].id }, E_DESK), 'invalid'); // rank of another event
  // A new registration with the same name is flagged (staff add).
  const added = evCall('testing_add_student', { p_event_id: DEFAULT_EVENT_ID, p_first: 'Ethan', p_last: 'Wu', p_event_rank_id: eventRankByName('Group A', 'Green').id, p_stripes: true, p_paying_by: 'cash' }, E_DESK);
  const ethan2 = evDb().registrations.find((r) => r.id === added.id);
  assert.equal(ethan2.duplicate_state, 'possible');
  assert.equal(ethan2.duplicate_of, regBy('CB-3111').id);
  // Delete permanently (admin): the payment ids must match what the warning named.
  const ethan = regBy('CB-3111');
  const payIds = evDb().payments.filter((p) => p.registration_id === ethan.id).map((p) => p.id);
  assert.equal(payIds.length, 1);
  assert.equal(evStatus('testing_delete_student', { p_registration_id: ethan.id, p_expected_version: ethan.version, p_expected_payment_ids: [] }), 'stale');
  assert.equal(evStatus('testing_delete_student', { p_registration_id: ethan.id, p_expected_version: ethan.version, p_expected_payment_ids: payIds }, E_DESK), 'not_allowed');
  assert.equal(evStatus('testing_delete_student', { p_registration_id: ethan.id, p_expected_version: ethan.version, p_expected_payment_ids: payIds }), 'ok');
  assert.equal(regBy('CB-3111'), undefined);
  assert.equal(evDb().payments.filter((p) => p.registration_id === ethan.id).length, 0); // cascaded
  assert.equal(evDb().registrations.find((r) => r.id === added.id).duplicate_state, 'none'); // its twin is gone
});

check('events mock: Restore re-checks the partner, so both sides show "possible duplicate" again', () => {
  evReset();
  const pairOf = () => ({ a: regBy('CB-3107'), b: regBy('CB-3109') });
  // The default data: Mia CB-3109 is a possible duplicate of Mia CB-3107.
  assert.equal(pairOf().b.duplicate_of, pairOf().a.id);
  // Withdraw the original → the copy goes back to none.
  assert.equal(evStatus('testing_withdraw_student', { p_registration_id: pairOf().a.id, p_expected_version: pairOf().a.version }), 'ok');
  assert.equal(pairOf().b.duplicate_state, 'none');
  // Restore the original → BOTH are "possible" again, each pointing at the other.
  assert.equal(evStatus('testing_restore_student', { p_registration_id: pairOf().a.id, p_expected_version: pairOf().a.version }), 'ok');
  let { a, b } = pairOf();
  assert.deepEqual([a.duplicate_state, a.duplicate_of], ['possible', b.id]);
  assert.deepEqual([b.duplicate_state, b.duplicate_of], ['possible', a.id]);
  const roster = rosterOf(DEFAULT_EVENT_ID);
  assert.equal(roster.find((r) => r.reference === 'CB-3107').duplicate_state, 'possible');
  assert.equal(roster.find((r) => r.reference === 'CB-3109').duplicate_state, 'possible');
  // Keep one (staff) removes the copy and clears the original; the staff Undo (Restore within
  // 10 s) flags both sides again.
  assert.equal(evStatus('testing_resolve_duplicate', { p_keep_id: a.id, p_keep_version: a.version, p_other_id: b.id, p_other_version: b.version, p_keep_both: false }, E_DESK), 'ok');
  ({ a, b } = pairOf());
  assert.equal(b.status, 'withdrawn');
  assert.equal(a.duplicate_state, 'none');
  assert.equal(evStatus('testing_restore_student', { p_registration_id: b.id, p_expected_version: b.version }, E_DESK), 'ok');
  ({ a, b } = pairOf());
  assert.deepEqual([b.duplicate_state, b.duplicate_of], ['possible', a.id]);
  assert.deepEqual([a.duplicate_state, a.duplicate_of], ['possible', b.id]);
  // Restoring someone with no same-name partner changes nobody else.
  const leo = regBy('CB-3116');
  const othersBefore = evDb().registrations.filter((r) => r.id !== leo.id).map((r) => `${r.id}:${r.version}`);
  assert.equal(evStatus('testing_restore_student', { p_registration_id: leo.id, p_expected_version: leo.version }), 'ok');
  assert.equal(regBy('CB-3116').duplicate_state, 'none');
  assert.deepEqual(evDb().registrations.filter((r) => r.id !== leo.id).map((r) => `${r.id}:${r.version}`), othersBefore);
});

check('events mock: Settings → Schools address', () => {
  evReset();
  const save = (over = {}, ctx = E_ADMIN) => evCall('settings_update_school_address', { p_code: 'worcester', p_expected_version: 1, p_street: ' 12 Main St ', p_city: 'Worcester', p_state: 'MA', p_zip: '01608', ...over }, ctx);
  assert.equal(save({}, E_DESK).status, 'not_allowed');
  assert.equal(save({ p_zip: null }).status, 'invalid'); // all four or none
  assert.equal(save({ p_state: 'ma' }).status, 'invalid');
  assert.equal(save({ p_zip: '1608' }).status, 'invalid');
  assert.equal(save({ p_zip: '01608-12' }).status, 'invalid');
  assert.equal(save({ p_street: 'x'.repeat(101) }).status, 'invalid');
  assert.equal(save({ p_city: 'x'.repeat(61) }).status, 'invalid');
  assert.equal(save({ p_street: '12 Main\u200b St' }).status, 'invalid'); // invisible character
  assert.equal(save({ p_street: `  ${'x'.repeat(50)}    ${'y'.repeat(49)} ` }).status, 'ok'); // 100 after tidying
  evReset();
  assert.equal(save({ p_code: 'both' }).status, 'not_found');
  assert.equal(save({ p_expected_version: 7 }).status, 'stale');
  assert.deepEqual(save({ p_zip: '01608-1234' }), { status: 'ok', version: 2 });
  const w = evDb().locations.find((l) => l.code === 'worcester');
  assert.deepEqual([w.address_street, w.address_city, w.address_state, w.address_zip], ['12 Main St', 'Worcester', 'MA', '01608-1234']);
  assert.deepEqual(save({ p_expected_version: 2, p_street: '12   Main St', p_zip: ' 01608-1234 ' }), { status: 'ok', version: 2 }); // tidies to the same
  assert.deepEqual(save({ p_expected_version: 2, p_zip: '01608-1234' }), { status: 'ok', version: 2 }); // no change → same version
  assert.deepEqual(save({ p_expected_version: 2, p_street: '  ', p_city: null, p_state: null, p_zip: '' }), { status: 'ok', version: 3 }); // cleared
  assert.equal(evDb().locations.find((l) => l.code === 'worcester').address_street, null);
});

check('events mock: family form (testing_public_event / testing_public_register)', () => {
  evReset();
  const code = eventRow().public_code;
  const pe = ev.publicEvent(code);
  assert.equal(pe.status, 'ok');
  assert.deepEqual([pe.state, pe.closed_on], ['open', null]);
  assert.deepEqual(Object.keys(pe).sort(), ['classes', 'closed_on', 'event', 'state', 'status']);
  assert.deepEqual(pe.event, { name: 'November Children Testing', testing_date: '2026-11-20', note: null, school_name: 'Worcester', address: null, auto_close_on: '2026-11-13' });
  assert.equal(pe.classes.length, 6);
  const groupA = pe.classes.find((c) => c.class_name === 'Group A');
  assert.deepEqual([groupA.start_time, groupA.end_time], ['17:00', '18:00']); // like the database: 'HH:MM'
  assert.deepEqual(groupA.ranks.map((r) => r.name), ['Yellow', 'Orange', 'Green', 'High Green']);
  assert.deepEqual(groupA.ranks[0].testing_for, { name: 'Orange', belt_pattern: 'solid', belt_color: 'orange', belt_color_2: null, belt_end_stripes: 0, belt_end_stripe_color: 'yellow' });
  assert.equal(pe.classes.find((c) => c.class_name === 'Group D').ranks.at(-1).testing_for, null); // Deputy: No new rank
  assert.ok(!JSON.stringify(pe).includes('CB-')); // no registrations, no counts
  assert.ok(!JSON.stringify(pe).includes(DEFAULT_EVENT_ID)); // no event id
  assert.deepEqual(ev.publicEvent('zzzzzzzz'), { status: 'not_found' });
  const yellowId = groupA.ranks[0].event_rank_id;
  const send = (over = {}, opts) => ev.publicRegister({
    code, clientKey: 'k1', submissionId: randomUUID(), first: 'Ivy', last: 'Stone', eventRankId: yellowId, payingBy: 'check', stripes: true,
    signature: SIG, ackVersion: ACK_VERSION, ...over,
  }, opts);
  // Every refusal.
  assert.equal(send({ code: 'zzzzzzzz' }).status, 'not_found');
  assert.equal(send({ payingBy: 'card' }).status, 'invalid'); // families: cash or check
  assert.equal(send({ stripes: false }).status, 'invalid');
  assert.equal(send({ signature: 'data:image/svg+xml;base64,AAAA' }).status, 'invalid');
  assert.equal(send({ signature: `${SIGNATURE_PREFIX}${'A'.repeat(70000)}` }).status, 'invalid');
  assert.equal(send({ ackVersion: 'old' }).status, 'invalid');
  assert.equal(send({ first: '' }).status, 'invalid');
  assert.equal(send({ submissionId: null }).status, 'invalid');
  assert.equal(send({ clientKey: '' }).status, 'invalid');
  assert.equal(send({ eventRankId: evDb().ranks[0].id }).status, 'invalid'); // a rank of no event / another event
  // OK, then the same submission again → the same answer, no second registration.
  const sid = randomUUID();
  const first = send({ submissionId: sid, first: ' Ivy ', last: 'Stone' });
  assert.equal(first.status, 'ok');
  assert.deepEqual(Object.keys(first).sort(), ['address', 'class_name', 'day_cents', 'early_cents', 'end_time', 'first_name', 'last_name', 'paying_by', 'reference', 'school_name', 'start_time', 'status', 'testing_date', 'testing_for'].sort());
  assert.deepEqual([first.reference, first.first_name, first.class_name, first.early_cents, first.day_cents, first.testing_for.name], ['CB-3118', 'Ivy', 'Group A', 6500, 7500, 'Orange']);
  const count = evDb().registrations.length;
  assert.deepEqual(send({ submissionId: sid }), first);
  assert.equal(evDb().registrations.length, count);
  const ivy = regBy('CB-3118');
  assert.deepEqual([ivy.source, ivy.created_by_name, ivy.signature, ivy.ack_version, ivy.duplicate_state], ['form', 'Family form', SIG, ACK_VERSION, 'none']);
  // A duplicate is flagged silently.
  const dup = send({ first: 'zoe', last: 'park' });
  assert.equal(dup.status, 'ok');
  assert.equal(regBy(dup.reference).duplicate_state, 'possible');
  // Closed while filling in (F10) / closed by date (F12) / not open (F11) / finished (F14).
  evToday = '2026-11-14';
  assert.deepEqual(send(), { status: 'closed', closed_on: '2026-11-13' });
  assert.deepEqual([ev.publicEvent(code).state, ev.publicEvent(code).closed_on], ['closed', '2026-11-13']);
  assert.deepEqual(send({ submissionId: sid }), first); // a retry of one that got through still answers ok
  evToday = '2026-10-17';
  evCall('testing_set_registration', { p_event_id: DEFAULT_EVENT_ID, p_expected_version: eventRow().version, p_open: false }, E_DESK);
  assert.deepEqual(send(), { status: 'closed', closed_on: null }); // F13
  const spring = evCall('testing_add_event', { p_location_code: 'worcester', p_name: 'Spring', p_testing_date: '2027-03-01', p_classes: classesArgFor(['Group A']), p_registration_open: false, p_auto_close_on: null, p_note: null });
  assert.equal(send({ code: spring.public_code }).status, 'not_open');
  assert.equal(send({ code: spring.public_code, submissionId: sid }).status, 'invalid'); // that submission belongs to another event
  evToday = '2026-11-21';
  assert.equal(send().status, 'finished');
  assert.equal(ev.publicEvent(code).state, 'finished');
  // Rate limit: more than 20 tries per connection per hour (every try counts, refusals too).
  evReset();
  for (let i = 0; i < 20; i += 1) assert.notEqual(send({ clientKey: 'k9', first: '' }).status, 'rate_limited');
  assert.equal(send({ clientKey: 'k9' }).status, 'rate_limited');
  assert.equal(send({ clientKey: 'other' }).status, 'ok');
  assert.equal(evDb().public_attempts.length, 22);
  assert.equal(evDb().public_attempts.at(-2).outcome, 'rate_limited');
  evClock += 60 * 60 * 1000; // an hour later
  assert.equal(send({ clientKey: 'k9' }).status, 'ok');
  evClock += 3 * 24 * 60 * 60 * 1000; // old rows are removed after 2 days
  send({ clientKey: 'k9', first: '' });
  assert.equal(evDb().public_attempts.length, 1);
  assert.equal(send({ clientKey: 'zz' }, { forceRateLimited: true }).status, 'rate_limited'); // preview helper
});

check('events mock: signatures are removed 90 days after the testing date', () => {
  evReset();
  const zoe = regBy('CB-3112');
  const before = { version: zoe.version, updated_at: zoe.updated_at };
  evToday = '2027-02-18'; // Nov 20 + 90 days: not yet
  const mia = regBy('CB-3109');
  evCall('testing_mark_paid', { p_registration_id: mia.id, p_expected_version: mia.version }, E_DESK);
  assert.ok(regBy('CB-3112').signature.startsWith(SIGNATURE_PREFIX)); // still kept
  evToday = '2027-02-19'; // 91 days after: the next Mark paid / Add event / family form cleans up
  const sam = regBy('CB-3110');
  evCall('testing_mark_paid', { p_registration_id: sam.id, p_expected_version: sam.version }, E_DESK);
  const z = regBy('CB-3112');
  assert.equal(z.signature, null);
  assert.equal(z.signature_deleted_at, new Date(evClock).toISOString());
  assert.deepEqual({ version: z.version, updated_at: z.updated_at }, before); // no version bump
  assert.equal(rosterOf(DEFAULT_EVENT_ID).find((r) => r.reference === 'CB-3112').signed, true); // "Signed on the form" stays
  assert.ok(evDb().registrations.every((r) => r.signature === null));
});

check('events mock: helpers and store migration', () => {
  evReset();
  ev.simulateOtherAdminEdit();
  assert.equal(eventRow().version, 2);
  assert.equal(eventRow().updated_by_name, 'Other Admin');
  assert.equal(evStatus('testing_set_registration', { p_event_id: DEFAULT_EVENT_ID, p_expected_version: 1, p_open: false }, E_DESK), 'stale');
  ev.reset();
  assert.equal(eventRow().version, 1);
  // A store saved by the phase 1 build (schema 3, no events) → default data for both parts.
  evMemory = { ...defaultTestingData(), schema: 3 };
  assert.equal(evDb().schema, 4);
  assert.equal(evDb().events.length, 1);
  // A schema 4 store with a damaged events part keeps its classes, gets the default events.
  const kept = { ...defaultTestingData() };
  kept.classes[0].name = 'Tiny Tigers';
  evMemory = { ...kept, events: 'broken' };
  assert.equal(evDb().classes[0].name, 'Tiny Tigers');
  assert.equal(evDb().events[0].name, 'November Children Testing');
  // Classes and ranks writes keep the events part.
  evReset();
  evStatus('testing_mark_paid', { p_registration_id: regBy('CB-3112').id, p_expected_version: 1 }, E_DESK);
  const cls = worcesterClass('Group A');
  evTesting.rpc('testing_update_class', { p_class_id: cls.id, p_expected_version: cls.version, p_name: 'Group A1', p_final_award_rank_id: cls.final_award_rank_id, p_final_award_none: false }, E_ADMIN);
  assert.equal(evDb().classes.find((c) => c.id === cls.id).name, 'Group A1');
  assert.equal(rosterOf(DEFAULT_EVENT_ID).find((r) => r.reference === 'CB-3112').paid, true);
  assert.equal(evDb().event_classes.find((c) => c.class_id === cls.id).class_name, 'Group A'); // the copy keeps its name
});

// ======================= gradingRules.js (phase 3, contract 0010 §3.1) =======================

const GRADING_DAY = '2026-11-20'; // the default event's testing day

check('gradingRules: lists, window and who may change results', () => {
  assert.deepEqual(RESULTS, ['pass', 'not_passed', 'no_show']);
  assert.equal(GRADING_NOTE_MAX, 200);
  assert.equal(gradingWindow('2026-11-19', GRADING_DAY), 'before');
  assert.equal(gradingWindow(GRADING_DAY, GRADING_DAY), 'day');
  assert.equal(gradingWindow('2026-11-21', GRADING_DAY), 'after');
  assert.equal(gradingWindow('2026-12-31', '2027-01-01'), 'before'); // across a year
  assert.equal(gradingWindow('2027-01-01', '2026-12-31'), 'after');
  const table = [
    ['before', false, false], ['before', true, false],
    ['day', false, true], ['day', true, true],
    ['after', false, false], ['after', true, true],
  ];
  for (const [window, admin, expected] of table) assert.equal(canChangeResults(window, admin), expected, `${window} ${admin}`);
});

check('gradingRules: the note is one line, 1–200 characters, nothing invisible', () => {
  assert.equal(normalizeGradingNote('  Retest \n\n the  jumping\tkick  '), 'Retest the jumping kick');
  assert.equal(normalizeGradingNote('a\n\n b'), 'a b');
  for (const blank of [null, undefined, '', '   ', '\n\t\r ']) {
    assert.equal(normalizeGradingNote(blank), null, JSON.stringify(blank));
    assert.equal(gradingNoteProblem(blank), null, JSON.stringify(blank)); // blank = clear: fine
  }
  assert.equal(gradingNoteProblem('x'.repeat(200)), null);
  assert.equal(gradingNoteProblem('x'.repeat(201)), 'tooLong');
  assert.equal(gradingNoteProblem(`  ${'x'.repeat(200)}   `), null); // counted after tidying
  assert.equal(gradingNoteProblem(`${'x'.repeat(100)}\n\n\n${'y'.repeat(99)}`), null); // 200 after tidying
  assert.equal(gradingNoteProblem('é'.repeat(200)), null); // 'é' counts as 1
  assert.equal(gradingNoteProblem('😀'.repeat(200)), null); // so does an emoji
  assert.equal(gradingNoteProblem('😀'.repeat(201)), 'tooLong');
  assert.equal(gradingNoteProblem('Good​kick'), 'badCharacter'); // zero-width space
  assert.equal(gradingNoteProblem('​'), 'badCharacter'); // alone: not "blank"
  assert.equal(gradingNoteProblem(`a‮b`), 'badCharacter'); // text-direction override
  assert.equal(gradingNoteProblem(`${'x'.repeat(300)}\u0007`), 'badCharacter'); // checked before the length
  assert.equal(gradingNoteProblem('Kick ✓ — “good”'), null);
});

check('gradingRules: isGraded, resultCounts, addedAfterDay', () => {
  assert.equal(isGraded({ result: null, note: null }), false);
  assert.equal(isGraded({ result: 'pass', note: null }), true);
  assert.equal(isGraded({ result: null, note: 'Retest' }), true); // a note alone counts
  assert.deepEqual(resultCounts([]), { total: 0, pass: 0, notPassed: 0, noShow: 0, notRecorded: 0 });
  const rows = ['pass', 'pass', 'not_passed', 'no_show', null, null].map((result) => ({ result, note: null }));
  rows.push({ result: null, note: 'Retest' }); // note only → not recorded yet
  assert.deepEqual(resultCounts(rows), { total: 7, pass: 2, notPassed: 1, noShow: 1, notRecorded: 3 });
  // Added after the testing day: only staff-added rows whose SCHOOL date is after the day.
  const row = (source, registeredAt) => ({ source, registeredAt, createdByName: 'Jeffrey Berg' });
  assert.equal(addedAfterDay(row('form', '2026-11-21T20:00:00Z'), GRADING_DAY), null); // the family form
  assert.equal(addedAfterDay(row('staff', '2026-11-20T22:00:00Z'), GRADING_DAY), null); // on the day
  assert.equal(addedAfterDay(row('staff', '2026-11-21T04:30:00Z'), GRADING_DAY), null); // 11:30 PM Nov 20 at the school
  assert.deepEqual(addedAfterDay(row('staff', '2026-11-21T05:30:00Z'), GRADING_DAY), { date: '2026-11-21', byName: 'Jeffrey Berg' });
  assert.deepEqual(addedAfterDay(row('staff', '2026-11-25T15:00:00Z'), GRADING_DAY), { date: '2026-11-25', byName: 'Jeffrey Berg' });
  assert.equal(addedAfterDay(row('staff', null), GRADING_DAY), null);
  assert.equal(addedAfterDay(null, GRADING_DAY), null);
});

check('gradingRules: school clock and the default class on the testing day', () => {
  assert.equal(schoolMinutesNow(Date.parse('2026-11-20T22:41:00Z')), 17 * 60 + 41); // winter: UTC−5
  assert.equal(schoolMinutesNow(new Date('2026-07-01T21:41:00Z')), 17 * 60 + 41); // summer: UTC−4
  assert.equal(schoolMinutesNow(Date.parse('2026-11-21T05:00:00Z')), 0); // midnight
  assert.equal(typeof schoolMinutesNow(), 'number');
  const classes = [
    { id: 'lt', position: 0, startTime: '16:00', endTime: '17:00' },
    { id: 'w', position: 1, startTime: '16:00', endTime: '17:00' },
    { id: 'a', position: 2, startTime: '17:00', endTime: '18:00' },
    { id: 'c', position: 4, startTime: '19:00', endTime: '20:00' },
    { id: 'b', position: 3, startTime: '18:30', endTime: '19:00' },
  ];
  const at = (hhmm) => timeToMinutes(hhmm);
  assert.equal(defaultGradingClassId(classes, at('16:30')), 'lt'); // two classes on now → switch order
  assert.equal(defaultGradingClassId(classes, at('16:59')), 'lt');
  assert.equal(defaultGradingClassId(classes, at('17:00')), 'a'); // the end time itself is not "on"
  assert.equal(defaultGradingClassId(classes, at('18:10')), 'b'); // between classes → the next one
  assert.equal(defaultGradingClassId(classes, at('15:00')), 'lt'); // before the first (a tie → switch order)
  assert.equal(defaultGradingClassId(classes, at('20:30')), 'lt'); // after the last → the first class
  assert.equal(defaultGradingClassId([...classes].reverse(), at('15:00')), 'lt'); // order = position, not the list
  const sameStart = [
    { id: 'y', position: 1, startTime: '18:00', endTime: '19:00' },
    { id: 'x', position: 0, startTime: '18:00', endTime: '19:00' },
  ];
  assert.equal(defaultGradingClassId(sameStart, at('17:00')), 'x');
  assert.equal(defaultGradingClassId([], at('17:00')), null);
  assert.equal(defaultGradingClassId(null, at('17:00')), null);
});

check('gradingRules: testing groups — same start AND end time test together (v0.193)', () => {
  const classes = [
    { id: 'lt', position: 0, startTime: '16:00', endTime: '16:45' },
    { id: 'w', position: 1, startTime: '16:00', endTime: '17:00' }, // same start, other end → own group
    { id: 'a', position: 2, startTime: '17:00', endTime: '18:00' },
    { id: 'c', position: 4, startTime: '18:00', endTime: '19:00' },
    { id: 'b', position: 3, startTime: '18:00:00', endTime: '19:00:00' }, // seconds from the database
    { id: 'd', position: 5, startTime: null, endTime: null }, // no times → on its own
    { id: 'e', position: 6, startTime: null, endTime: null },
  ];
  const groups = testingGroups(classes);
  assert.deepEqual(groups.map((g) => g.classIds), [['lt'], ['w'], ['a'], ['b', 'c'], ['d'], ['e']]);
  assert.deepEqual(groups.map((g) => g.id), ['lt', 'w', 'a', 'b', 'd', 'e']); // id = first class
  assert.equal(groupOfClass(groups, 'c').id, 'b');
  assert.equal(groupOfClass(groups, 'zz'), null);
  assert.deepEqual(testingGroups([]), []);
  assert.deepEqual(testingGroups(null), []);
  // The testing-day default lands inside the right group (it returns the group's first class).
  assert.equal(groupOfClass(groups, defaultGradingClassId(classes, timeToMinutes('18:30'))).id, 'b');
});

// ======================= the grading part of the preview database (0010 §1, §3.3) =======================
// Replays of the database tests R3–R6 and R9–R15 that need no real sign-in sessions.

// A fresh default store, SAVED first (so the default data is made for "today" = Oct 17 and the
// testing day stays Nov 20), then today moved to `date` at 4 PM school time.
const gradingStart = (date = GRADING_DAY) => {
  evReset();
  ev.reset();
  evToday = date;
  evClock = Date.parse(`${date}T21:00:00Z`);
};
const setRes = (ref, result, ctx = E_DESK) => evCall('testing_set_result', { p_registration_id: regBy(ref).id, p_result: result }, ctx);
const setNote = (ref, note, ctx = E_DESK) => evCall('testing_set_result_note', { p_registration_id: regBy(ref).id, p_note: note }, ctx);
const resultFor = (ref) => evDb().results.find((r) => r.registration_id === regBy(ref).id) ?? null;
const editStudent = (ref, { first, last, rank } = {}, ctx = E_DESK) => {
  const r = regBy(ref);
  return evCall('testing_update_student', {
    p_registration_id: r.id, p_expected_version: r.version, p_first: first ?? r.first_name, p_last: last ?? r.last_name, p_event_rank_id: rank ?? r.event_rank_id,
  }, ctx);
};
const resolvePair = (keepRef, otherRef, keepBoth, ctx = E_DESK) => {
  const k = regBy(keepRef);
  const o = regBy(otherRef);
  return evStatus('testing_resolve_duplicate', { p_keep_id: k.id, p_keep_version: k.version, p_other_id: o.id, p_other_version: o.version, p_keep_both: keepBoth }, ctx);
};
const restoreReg = (ref, ctx = E_DESK) => evStatus('testing_restore_student', { p_registration_id: regBy(ref).id, p_expected_version: regBy(ref).version }, ctx);
const editEventDate = (testingDate, over = {}) => {
  const e = eventRow();
  const classes = evDb().event_classes.filter((c) => c.event_id === e.id).map((c) => ({ class_id: c.class_id, start_time: c.start_time, end_time: c.end_time }));
  return evCall('testing_update_event', {
    p_event_id: e.id, p_expected_version: e.version, p_name: e.name, p_testing_date: testingDate, p_classes: classes,
    p_auto_close_on: e.auto_close_on, p_note: e.note, ...over,
  }, E_ADMIN);
};

check('grading mock: the date rule for staff and admins, both functions (R3)', () => {
  const cases = [
    ['2026-11-19', E_DESK, 'not_open'], ['2026-11-19', E_ADMIN, 'not_open'], // before: nobody
    [GRADING_DAY, E_DESK, 'ok'], [GRADING_DAY, E_ADMIN, 'ok'], // on the day: everyone
    ['2026-11-21', E_DESK, 'finished'], ['2026-11-21', E_ADMIN, 'ok'], // after: admins only
  ];
  for (const [date, ctx, expected] of cases) {
    gradingStart(date);
    assert.equal(setRes('CB-3110', 'pass', ctx).status, expected, `set_result ${date} ${ctx.actorName}`);
    assert.equal(setNote('CB-3112', 'Good kicks', ctx).status, expected, `set_result_note ${date} ${ctx.actorName}`);
    assert.equal(evDb().results.length, expected === 'ok' ? 2 : 0); // a refusal writes nothing
  }
});

check('grading mock: values, same value twice, clearing deletes the row, refusals (R4)', () => {
  gradingStart();
  for (const value of RESULTS) {
    const answer = setRes('CB-3110', value);
    assert.deepEqual(answer, { status: 'ok', result: value, note: null, updated_at: new Date(evClock).toISOString(), updated_by_name: 'Staff' });
    assert.equal(resultFor('CB-3110').result, value);
  }
  // The same value again: ok, nothing written (the "last changed" stamp stays).
  const stampBefore = resultFor('CB-3110').updated_at;
  evClock += 60 * 1000;
  assert.equal(setRes('CB-3110', 'no_show', E_ADMIN).updated_by_name, 'Staff');
  assert.equal(resultFor('CB-3110').updated_at, stampBefore);
  // null clears; with no note the row is removed.
  assert.deepEqual(setRes('CB-3110', null), { status: 'ok', result: null, note: null, updated_at: null, updated_by_name: null });
  assert.equal(resultFor('CB-3110'), null);
  assert.equal(setRes('CB-3110', null).status, 'ok'); // clearing nothing is fine too
  // Result + note, clear the result → the row stays with the note; clear the note → removed.
  setRes('CB-3110', 'not_passed');
  setNote('CB-3110', 'Retest the jumping front kick');
  assert.deepEqual([resultFor('CB-3110').result, resultFor('CB-3110').note], ['not_passed', 'Retest the jumping front kick']);
  assert.equal(setRes('CB-3110', null).note, 'Retest the jumping front kick');
  assert.deepEqual([resultFor('CB-3110').result, resultFor('CB-3110').note], [null, 'Retest the jumping front kick']);
  assert.equal(setNote('CB-3110', null).status, 'ok');
  assert.equal(resultFor('CB-3110'), null);
  // Refusals, in the database's order.
  assert.equal(setRes('CB-3110', 'passed').status, 'invalid');
  assert.equal(evStatus('testing_set_result', { p_registration_id: null, p_result: 'pass' }, E_DESK), 'invalid');
  assert.equal(evStatus('testing_set_result_note', { p_registration_id: null, p_note: 'x' }, E_DESK), 'invalid');
  assert.equal(evStatus('testing_set_result', { p_registration_id: '00000000-0000-4000-8000-00000000abcd', p_result: 'pass' }, E_DESK), 'not_found');
  assert.equal(setRes('CB-3116', 'pass').status, 'withdrawn'); // Leo is withdrawn in the default data
  assert.equal(setNote('CB-3116', 'x').status, 'withdrawn');
  assert.equal(ev.rpc('testing_set_result', { p_registration_id: 'nope', p_result: 'pass' }, E_DESK).error.code, '22P02');
  assert.equal(ev.rpc('testing_set_result', { p_registration_id: regBy('CB-3110').id }, E_DESK).error.code, 'PGRST202'); // missing argument
  assert.equal(evDb().results.length, 0);
});

check('grading mock: the note rule (R5)', () => {
  gradingStart();
  assert.equal(setNote('CB-3110', 'x'.repeat(200)).note.length, 200);
  assert.equal(setNote('CB-3110', 'x'.repeat(201)).status, 'invalid');
  assert.equal(setNote('CB-3110', 'a\n\n b').note, 'a b'); // stored as one line
  assert.equal(resultFor('CB-3110').note, 'a b');
  assert.equal(setNote('CB-3110', 'Good​kick').status, 'invalid');
  assert.equal(setNote('CB-3110', 'é'.repeat(200)).status, 'ok'); // 'é' counts as 1
  assert.deepEqual(setNote('CB-3110', '   '), { status: 'ok', result: null, note: null, updated_at: null, updated_by_name: null }); // blank = cleared
  assert.equal(resultFor('CB-3110'), null);
});

check('grading mock: last change wins; versions untouched; who is stamped; column rights (R6, R7)', () => {
  gradingStart();
  const reg = regBy('CB-3110');
  const eventVersion = eventRow().version;
  setRes('CB-3110', 'pass', E_DESK);
  setRes('CB-3110', 'no_show', E_ADMIN);
  setNote('CB-3110', 'Was sick', E_ADMIN);
  const row = resultFor('CB-3110');
  assert.deepEqual([row.result, row.note, row.updated_by, row.updated_by_name], ['no_show', 'Was sick', E_ADMIN.userId, 'Jeffrey Berg']);
  assert.equal(regBy('CB-3110').version, reg.version); // a result never changes the registration's version
  assert.equal(regBy('CB-3110').updated_at, reg.updated_at);
  assert.equal(eventRow().version, eventVersion);
  // Reads: the 5 granted columns; never updated_by, never '*'; a locked sign-in sees no rows.
  const sel = (cols, ctx = E_DESK) => ev.select('testing_results', cols, [{ col: 'registration_id', value: reg.id }], [], ctx);
  assert.deepEqual(sel('registration_id, result, note, updated_at, updated_by_name').data, [
    { registration_id: reg.id, result: 'no_show', note: 'Was sick', updated_at: row.updated_at, updated_by_name: 'Jeffrey Berg' },
  ]);
  assert.equal(sel('registration_id, updated_by').error.code, '42501');
  assert.equal(sel('*').error.code, '42501');
  assert.equal(ev.select('testing_results', 'registration_id', [{ col: 'updated_by', value: E_ADMIN.userId }], [], E_DESK).error.code, '42501'); // not as a filter either
  assert.deepEqual(sel('registration_id', E_LOCKED).data, []); // row-level security
  assert.equal(sel('registration_id', E_ANON).error.code, '42501');
  assert.equal(evStatus('testing_set_result', { p_registration_id: reg.id, p_result: 'pass' }, E_LOCKED), 'no_access');
  assert.equal(resultFor('CB-3110').result, 'no_show');
});

check('grading mock: Edit details clears a result on a belt change; staff locked after the day (R9)', () => {
  const green = () => eventRankByName('Group A', 'Green').id;
  const highGreen = () => eventRankByName('Group A', 'High Green').id;
  // On the testing day: staff change a graded student's belt → ok, result_cleared, row gone.
  gradingStart();
  setRes('CB-3110', 'not_passed');
  setNote('CB-3110', 'Retest');
  const cleared = editStudent('CB-3110', { rank: green() });
  assert.deepEqual(cleared, { status: 'ok', version: regBy('CB-3110').version, result_cleared: true });
  assert.equal(resultFor('CB-3110'), null);
  // A name-only change of a graded student: exactly { status, version } (no result_cleared key).
  setRes('CB-3112', 'pass');
  const nameOnly = editStudent('CB-3112', { first: 'Zoey' });
  assert.deepEqual(nameOnly, { status: 'ok', version: regBy('CB-3112').version });
  assert.equal(resultFor('CB-3112').result, 'pass');
  // An ungraded student's belt change: no key either.
  assert.deepEqual(Object.keys(editStudent('CB-3111', { rank: highGreen() })).sort(), ['status', 'version']);
  // After the testing day.
  gradingStart('2026-11-21');
  setRes('CB-3110', 'pass', E_ADMIN);
  const before = JSON.stringify(evDb());
  assert.equal(editStudent('CB-3110', { rank: green() }, E_DESK).status, 'not_allowed');
  assert.equal(JSON.stringify(evDb()), before); // nothing changed
  assert.deepEqual(Object.keys(editStudent('CB-3110', { first: 'Samuel' }, E_DESK)).sort(), ['status', 'version']); // names stay editable
  assert.equal(resultFor('CB-3110').result, 'pass');
  assert.equal(editStudent('CB-3112', { rank: green() }, E_DESK).status, 'ok'); // ungraded: fine
  const adminChange = editStudent('CB-3110', { rank: green() }, E_ADMIN);
  assert.equal(adminChange.result_cleared, true);
  assert.equal(resultFor('CB-3110'), null);
});

check('grading mock: after the day, keep one is admin-only for every student (R10, v0.194)', () => {
  // A graded student renamed to match another becomes a possible duplicate.
  const renamedPair = () => {
    gradingStart('2026-11-21');
    setRes('CB-3112', 'pass', E_ADMIN); // Zoe is graded
    assert.equal(editStudent('CB-3112', { first: 'Sam', last: 'Diaz' }, E_DESK).status, 'ok'); // name-only: allowed
    assert.deepEqual([regBy('CB-3112').duplicate_state, regBy('CB-3112').duplicate_of], ['possible', regBy('CB-3110').id]);
  };
  renamedPair();
  const before = JSON.stringify(evDb());
  assert.equal(resolvePair('CB-3110', 'CB-3112', false, E_DESK), 'not_allowed'); // would remove the graded one
  assert.equal(JSON.stringify(evDb()), before);
  assert.equal(resolvePair('CB-3110', 'CB-3112', true, E_DESK), 'ok'); // keep both: unchanged rule
  renamedPair();
  assert.equal(resolvePair('CB-3112', 'CB-3110', false, E_DESK), 'not_allowed'); // the UNgraded one too (v0.194)
  assert.equal(regBy('CB-3110').status, 'active');
  // A pair where nobody is graded: staff still can't keep one after the day; keep both is fine.
  gradingStart('2026-11-21');
  assert.equal(resultFor('CB-3109'), null);
  assert.equal(resolvePair('CB-3107', 'CB-3109', false, E_DESK), 'not_allowed');
  assert.equal(resolvePair('CB-3107', 'CB-3109', false, E_ADMIN), 'ok');
  renamedPair();
  assert.equal(resolvePair('CB-3110', 'CB-3112', false, E_ADMIN), 'ok'); // admins may
  assert.equal(regBy('CB-3112').status, 'withdrawn');
  assert.equal(resultFor('CB-3112').result, 'pass'); // the result stays on the withdrawn student
  // On the testing day staff may keep one of a graded copy.
  gradingStart();
  setRes('CB-3109', 'pass');
  assert.equal(resolvePair('CB-3107', 'CB-3109', false, E_DESK), 'ok');
});

check('grading mock: the staff 10-second Undo of keep one, and admin restore (R11)', () => {
  // Graded copy removed on the day; if the day is over by the time of the Undo → not_allowed.
  gradingStart();
  setRes('CB-3109', 'pass');
  assert.equal(resolvePair('CB-3107', 'CB-3109', false, E_DESK), 'ok');
  evToday = '2026-11-21'; // (the clock stays inside the 10 seconds)
  assert.equal(restoreReg('CB-3109', E_DESK), 'not_allowed');
  evToday = GRADING_DAY;
  assert.equal(restoreReg('CB-3109', E_DESK), 'ok'); // on the day it's fine
  // Ungraded copy removed on the day → the staff Undo works.
  gradingStart();
  assert.equal(resolvePair('CB-3107', 'CB-3109', false, E_DESK), 'ok');
  assert.equal(restoreReg('CB-3109', E_DESK), 'ok');
  // An admin restores a graded withdrawn student → the kept result reads again.
  gradingStart();
  setRes('CB-3109', 'not_passed');
  assert.equal(resolvePair('CB-3107', 'CB-3109', false, E_DESK), 'ok');
  evToday = '2026-11-21';
  assert.equal(restoreReg('CB-3109', E_ADMIN), 'ok');
  assert.deepEqual([regBy('CB-3109').status, resultFor('CB-3109').result], ['active', 'not_passed']);
});

check('grading mock: withdraw keeps the result; admins add after the day; has_results; cascades (R12–R15)', () => {
  // R12: Withdraw (admin) keeps the row; then no more changes.
  gradingStart();
  setRes('CB-3112', 'no_show');
  const zoe = regBy('CB-3112');
  assert.equal(evStatus('testing_withdraw_student', { p_registration_id: zoe.id, p_expected_version: zoe.version }), 'ok');
  assert.equal(resultFor('CB-3112').result, 'no_show');
  assert.equal(setRes('CB-3112', 'pass', E_ADMIN).status, 'withdrawn');
  // R13: after the day staff can't add a student; admins can, and can grade them.
  gradingStart('2026-11-21');
  const add = (ctx) => evCall('testing_add_student', { p_event_id: DEFAULT_EVENT_ID, p_first: 'Late', p_last: 'Comer', p_event_rank_id: eventRankByName('Group A', 'Yellow').id, p_stripes: true, p_paying_by: 'cash' }, ctx);
  assert.equal(add(E_DESK).status, 'finished');
  const added = add(E_ADMIN);
  assert.equal(added.status, 'ok');
  const late = evDb().registrations.find((r) => r.id === added.id);
  assert.deepEqual([late.source, late.created_by_name], ['staff', 'Jeffrey Berg']);
  assert.equal(setRes(added.reference, 'pass', E_ADMIN).status, 'ok');
  assert.deepEqual(addedAfterDay({ source: late.source, registeredAt: late.registered_at, createdByName: late.created_by_name }, GRADING_DAY), { date: '2026-11-21', byName: 'Jeffrey Berg' });
  // R14: the date can't move once a student has a result (a name change can).
  gradingStart();
  setRes('CB-3110', 'pass');
  const eventBefore = JSON.stringify(eventRow());
  assert.deepEqual(editEventDate('2026-11-27'), { status: 'has_results' });
  assert.equal(JSON.stringify(eventRow()), eventBefore);
  assert.equal(editEventDate(GRADING_DAY, { p_name: 'November Testing' }).status, 'ok');
  setRes('CB-3110', null);
  assert.equal(editEventDate('2026-11-27').status, 'ok');
  // ... a withdrawn student's result counts too.
  gradingStart();
  setRes('CB-3112', 'pass');
  evCall('testing_withdraw_student', { p_registration_id: regBy('CB-3112').id, p_expected_version: regBy('CB-3112').version });
  assert.equal(editEventDate('2026-11-27').status, 'has_results');
  // R15: Delete student / Delete event remove the results too.
  gradingStart();
  setRes('CB-3110', 'pass');
  setRes('CB-3111', 'pass');
  const sam = regBy('CB-3110');
  assert.equal(evStatus('testing_delete_student', { p_registration_id: sam.id, p_expected_version: sam.version, p_expected_payment_ids: [] }), 'ok');
  assert.equal(evDb().results.some((r) => r.registration_id === sam.id), false);
  assert.equal(evDb().results.length, 1);
  const regs = evDb().registrations.filter((r) => r.event_id === DEFAULT_EVENT_ID);
  const total = evDb().payments.filter((p) => regs.some((r) => r.id === p.registration_id)).reduce((t, p) => t + p.amount_cents, 0);
  assert.equal(evStatus('testing_delete_event', { p_event_id: DEFAULT_EVENT_ID, p_expected_version: eventRow().version, p_expected_registration_count: regs.length, p_expected_payment_total_cents: total }), 'ok');
  assert.deepEqual(evDb().results, []);
});

check('grading mock: a store saved before phase 3 keeps its events', () => {
  gradingStart();
  const old = JSON.parse(JSON.stringify(evMemory));
  delete old.results;
  old.events[0].name = 'Kept event';
  evMemory = old;
  assert.deepEqual(evDb().results, []);
  assert.equal(eventRow().name, 'Kept event');
  assert.equal(setRes('CB-3110', 'pass').status, 'ok'); // and grading works on it
  assert.equal(eventRow().name, 'Kept event');
  ev.reset();
  assert.deepEqual(evDb().results, []); // reset starts with nobody graded
});

// ======================= privateRules.js (phase 4, contract 0014 §1, §4.1) =======================
// The Private testing tab's rules on their own: the day and time rules, the money rule with the
// contract's worked examples E1–E13, the ⋯ menu, Upcoming / Past and the cards, and Move.

const PT = '2026-10-17'; // "today" of the default preview data

check('privateRules: the time list and the time check (v0.157)', () => {
  assert.equal(PR.PRIVATE_TIME_CHOICES.length, 193);
  assert.equal(PR.PRIVATE_TIME_CHOICES[0], '06:00');
  assert.equal(PR.PRIVATE_TIME_CHOICES[1], '06:05');
  assert.equal(PR.PRIVATE_TIME_CHOICES[192], '22:00');
  for (const ok of ['06:00', '22:00', '16:00', '16:05', '16:00:00', '21:55']) assert.equal(PR.privateTimeIsValid(ok), true, ok);
  for (const bad of ['05:55', '22:05', '16:03', '16:00:30', '6:00', '24:00', '', null, undefined, 1600, ' 16:00']) {
    assert.equal(PR.privateTimeIsValid(bad), false, String(bad));
  }
});

check('privateRules: the day rules count from today (incl. Feb 29)', () => {
  assert.equal(PR.privateDayLimit(PT), '2027-10-17');
  assert.equal(PR.privateDayLimit('2028-02-29'), '2029-02-28'); // as Postgres + interval '1 year'
  assert.equal(PR.privateDayLimit('2027-02-28'), '2028-02-28');
  assert.equal(PR.privateDayLimit('nope'), null);
  assert.equal(PR.privateDayProblem('', PT), 'missing');
  assert.equal(PR.privateDayProblem('2026-12-3', PT), 'missing');
  assert.equal(PR.privateDayProblem('2026-02-30', PT), 'missing');
  assert.equal(PR.privateDayProblem('2026-10-16', PT), 'past');
  assert.equal(PR.privateDayProblem(PT, PT), null);
  assert.equal(PR.privateDayProblem('2027-10-17', PT), null);
  assert.equal(PR.privateDayProblem('2027-10-18', PT), 'tooFar');
  assert.equal(PR.privateDayProblem('2029-02-28', '2028-02-29'), null);
  assert.equal(PR.privateDayProblem('2029-03-01', '2028-02-29'), 'tooFar');
});

check('privateRules: amountDue = the worked examples E1–E13 (§1.3)', () => {
  const due = (privateCents, paidCents) => PR.amountDue({ privateCents, paidCents });
  assert.equal(due(8500, 0), 8500); // E1 added, not paid
  assert.equal(due(8500, 8500), 0); // E1 after Mark paid → already_paid
  assert.equal(due(8500, 6500), 2000); // E2 moved with $65 paid
  assert.equal(due(8500, 6500 + 2000 - 2000), 2000); // E3 the $20 undone
  assert.equal(due(8500, 0), 8500); // E4 moved, not paid
  assert.equal(due(8500, 8500), 0); // E5 moved with $85 paid
  assert.equal(due(9500, 8500), 1000); // E6 belt corrected to Group B Blue
  assert.equal(due(8500, 9500), 0); // E7 corrected to a cheaper rank, nothing refunded
  assert.equal(due(8500, 6500 + 2000 - 2000), 2000); // E8 admin Undo of the $20
  assert.equal(due(8500, 6500 + 2000 - 2000 + 1000), 1000); // E9 the $20 edited to $10
  assert.equal(due(0, 0), 0); // E10 private price $0
  assert.equal(due(8500, 8500), 0); // E11 paid, then cancelled (still paid)
  assert.equal(due(8500, 6500), 2000); // E12 owes $20 whatever the method
  assert.equal(due(8500, 9500), 0); // E13 moved overpaid
  assert.equal(due(8500, undefined), 8500); // a missing paid amount counts as 0
  assert.equal(due(8500, -500), 8500); // (net never negative in practice)
  // E2 / E5 / E13 / E4 as the Move dialog's money line.
  assert.deepEqual(PR.moveMoney({ paidCents: 6500, privateCents: 8500 }), { kind: 'owes', dueCents: 2000 });
  assert.deepEqual(PR.moveMoney({ paidCents: 8500, privateCents: 8500 }), { kind: 'enough', dueCents: 0 });
  assert.deepEqual(PR.moveMoney({ paidCents: 9500, privateCents: 8500 }), { kind: 'enough', dueCents: 0 });
  assert.deepEqual(PR.moveMoney({ paidCents: 0, privateCents: 8500 }), { kind: 'notPaid', dueCents: 8500 });
});

check('privateRules: owesMore, showMarkPaid, canChangePayingBy, canMoveToPrivate', () => {
  const row = (paid, amountDueCents, status = 'active') => ({ paid, amountDueCents, status });
  assert.equal(PR.owesMore(row(true, 2000)), true);
  assert.equal(PR.owesMore(row(true, 0)), false);
  assert.equal(PR.owesMore(row(false, 8500)), false);
  assert.equal(PR.showMarkPaid(row(false, 8500)), true);
  assert.equal(PR.showMarkPaid(row(true, 2000)), true);
  assert.equal(PR.showMarkPaid(row(false, 0)), false); // E10: no button
  assert.equal(PR.showMarkPaid(row(false, 8500, 'cancelled')), false);
  assert.equal(PR.canChangePayingBy(row(false, 8500)), true);
  assert.equal(PR.canChangePayingBy(row(true, 2000)), true);
  assert.equal(PR.canChangePayingBy(row(true, 0)), false);
  assert.equal(PR.canChangePayingBy(row(false, 8500, 'cancelled')), false);
  assert.equal(PR.canMoveToPrivate({ status: 'active', result: null }), true);
  assert.equal(PR.canMoveToPrivate({ status: 'active' }), true);
  assert.equal(PR.canMoveToPrivate({ status: 'active', result: 'no_show' }), true);
  assert.equal(PR.canMoveToPrivate({ status: 'active', result: null, note: 'note only' }), true);
  assert.equal(PR.canMoveToPrivate({ status: 'active', result: 'pass' }), false);
  assert.equal(PR.canMoveToPrivate({ status: 'active', result: 'not_passed' }), false);
  assert.equal(PR.canMoveToPrivate({ status: 'withdrawn', result: null }), false);
});

check('privateRules: the ⋯ menu truth table (P3, P7, L5)', () => {
  const keys = ['editDetails', 'changePayingBy', 'changeDay', 'grade', 'editPayment', 'undoPayment', 'cancel', 'restore', 'delete'];
  const menu = (row, isAdmin, today = PT) => {
    const m = PR.privateMenu(row, { today, isAdmin });
    assert.deepEqual(Object.keys(m).sort(), [...keys].sort());
    return keys.filter((k) => m[k]).join(' ');
  };
  const row = (over = {}) => ({ status: 'active', paid: false, amountDueCents: 8500, result: null, privateDate: '2026-12-01', ...over });
  assert.equal(menu(row(), false), 'editDetails changePayingBy changeDay grade cancel');
  assert.equal(menu(row(), true), 'editDetails changePayingBy changeDay grade cancel delete');
  assert.equal(menu(row({ paid: true, amountDueCents: 0 }), true), 'editDetails changeDay grade editPayment undoPayment cancel delete');
  assert.equal(menu(row({ paid: true, amountDueCents: 2000 }), false), 'editDetails changePayingBy changeDay grade cancel');
  assert.equal(menu(row({ result: 'no_show' }), false), 'editDetails changePayingBy changeDay grade cancel');
  assert.equal(menu(row({ result: null, note: 'note only' }), false), 'editDetails changePayingBy changeDay grade cancel'); // a note never counts
  assert.equal(menu(row({ result: 'pass' }), false), 'grade'); // L5: no Change how they'll pay either
  assert.equal(menu(row({ result: 'not_passed', paid: true, amountDueCents: 0 }), true), 'editDetails grade editPayment undoPayment delete'); // v0.405: admins can still edit a graded one
  assert.equal(menu(row({ result: 'pass' }), true), 'editDetails grade delete');
  // Cancelled: staff nothing; admins Restore while the day is today or later, and Delete.
  assert.equal(menu(row({ status: 'cancelled' }), false), '');
  assert.equal(menu(row({ status: 'cancelled' }), true), 'restore delete');
  assert.equal(menu(row({ status: 'cancelled', privateDate: PT }), true), 'restore delete');
  assert.equal(menu(row({ status: 'cancelled', privateDate: '2026-10-16' }), true), 'delete');
  assert.equal(menu(null, true), '');
});

check('privateRules: Upcoming / Past order and the cards (P1, E11)', () => {
  const r = (firstName, lastName, privateDate, privateTime, over = {}) => ({
    firstName, lastName, privateDate, privateTime, status: 'active', paid: false, paidCents: 0, amountDueCents: 8500, ...over,
  });
  const rows = [
    r('Ava', 'chen', '2026-12-01', '16:00'),
    r('Ben', 'Adams', '2026-12-01', '16:00', { paid: true, paidCents: 6500, amountDueCents: 2000 }),
    r('Dee', 'Zane', '2026-12-01', '09:30', { paid: true, paidCents: 8500, amountDueCents: 0 }),
    r('Eli', 'Today', PT, '18:00'),
    r('Fay', 'Old', '2026-10-01', '17:00', { paid: true, paidCents: 8500, amountDueCents: 0, result: 'pass' }),
    r('Gus', 'Older', '2026-09-01', '17:00'),
    r('Hal', 'Same', '2026-10-01', '18:00'),
    r('Ivy', 'Cancelled', '2026-12-05', '16:00', { status: 'cancelled', paid: true, paidCents: 8500, amountDueCents: 0 }), // E11
  ];
  assert.equal(PR.privateSide(rows[3], PT), 'upcoming'); // today is upcoming
  assert.equal(PR.privateSide(rows[7], PT), 'past'); // cancelled → past, even with a future day
  const { upcoming, past } = PR.splitPrivate(rows, PT);
  assert.deepEqual(upcoming.map((x) => x.firstName), ['Eli', 'Dee', 'Ben', 'Ava']);
  assert.deepEqual(past.map((x) => x.firstName), ['Ivy', 'Hal', 'Fay', 'Gus']);
  assert.equal(rows[0].firstName, 'Ava'); // the input isn't re-ordered
  assert.deepEqual(PR.privateCards(upcoming), { count: 4, paid: 2, notPaid: 2, owesMore: 1, paymentsCents: 15000, cancelledCents: 0 });
  // E11: the cancelled one isn't counted, but its money is ("includes $85 from cancelled").
  assert.deepEqual(PR.privateCards(past), { count: 3, paid: 1, notPaid: 2, owesMore: 0, paymentsCents: 17000, cancelledCents: 8500 });
  assert.deepEqual(PR.privateCards([]), { count: 0, paid: 0, notPaid: 0, owesMore: 0, paymentsCents: 0, cancelledCents: 0 });
  assert.deepEqual(PR.splitPrivate(null, PT), { upcoming: [], past: [] });
});

// ======================= the Private testing part of the preview database (0014 §2, §4.4) =======================
// Replays of the database tests V3–V11 that need no real sign-in sessions. After EVERY call the
// preview's own copy of testing_private_amount_due — and the view's amount_due_cents — must equal
// privateRules.amountDue for every private testing.

// A fresh default store WITHOUT the seeded private testings (the replays below start from an empty
// Private testing tab; the seed has its own check at the end).
const pStart = (date = PT) => {
  evReset();
  ev.reset();
  Object.assign(evMemory, { private: [], private_payments: [], private_results: [] });
  evToday = date;
  evClock = Date.parse(`${date}T21:00:00Z`);
};
const pMoveToday = (date) => {
  evToday = date;
  evClock = Date.parse(`${date}T21:00:00Z`);
};
const pAsPostgres = (fn) => fn(evMemory); // change stored data directly ("as postgres")
const liveRankOf = (className, rankName, school = 'worcester') => {
  const d = evDb();
  const c = d.classes.find((x) => x.location_code === school && x.name === className);
  return d.ranks.find((x) => x.class_id === c.id && x.name === rankName);
};
const privRow = (id) => evDb().private.find((p) => p.id === id) ?? null;
const privPayments = (id) => evDb().private_payments.filter((p) => p.private_id === id);
const privNet = (id) => privPayments(id).reduce((t, p) => t + p.amount_cents, 0);
const eventNet = (ref) => evDb().payments.filter((p) => p.registration_id === regBy(ref).id).reduce((t, p) => t + p.amount_cents, 0);
const pLogs = () => evDb().change_log;
const PRIVATE_LIST_SELECT = 'id, status, first_name, last_name, private_date, private_time, private_cents, paid, paid_cents, amount_due_cents';
const viewOf = (school = 'worcester', ctx = E_ADMIN) => ev.select('testing_private_list', PRIVATE_LIST_SELECT, [{ col: 'location_code', value: school }], [], ctx).data;
function assertPrivDueSame(rule = PR.amountDue) {
  const d = evDb();
  const view = new Map(ev.select('testing_private_list', 'id, amount_due_cents', [], [], E_ADMIN).data.map((v) => [v.id, v.amount_due_cents]));
  for (const row of d.private) {
    const net = d.private_payments.filter((p) => p.private_id === row.id).reduce((t, p) => t + p.amount_cents, 0);
    const expected = rule({ privateCents: row.private_cents, paidCents: net });
    assert.equal(ev.privateAmountDueFor(row.id), expected, `owed of ${row.first_name}`);
    assert.equal(view.get(row.id), expected, `view owed of ${row.first_name}`);
  }
}
const pCall = (name, args, ctx = E_DESK) => {
  const answer = evCall(name, args, ctx);
  assertPrivDueSame();
  return answer;
};
const pArgs = (id, extra = {}) => ({ p_private_id: id, p_expected_version: privRow(id).version, ...extra });
const pAdd = (over = {}, ctx = E_DESK) => pCall('testing_private_add', {
  p_location_code: 'worcester', p_first: 'Liam', p_last: 'Park', p_rank_id: liveRankOf('Group A', 'Yellow').id, p_stripes: true,
  p_paying_by: 'cash', p_private_date: '2026-12-01', p_private_time: '16:00', ...over,
}, ctx);
const pMark = (id, ctx = E_DESK) => pCall('testing_private_mark_paid', pArgs(id), ctx);
const pUpdate = (id, rankId, ctx = E_DESK, names = {}) => pCall('testing_private_update', pArgs(id, {
  p_first: names.first ?? privRow(id).first_name, p_last: names.last ?? privRow(id).last_name, p_rank_id: rankId,
}), ctx);
const pDay = (id, date, time = '16:00', ctx = E_DESK, extra = {}) => pCall('testing_private_change_day', pArgs(id, { p_private_date: date, p_private_time: time, ...extra }), ctx);
const pResult = (id, result, ctx = E_DESK) => pCall('testing_private_set_result', { p_private_id: id, p_result: result }, ctx);
const pNote = (id, note, ctx = E_DESK) => pCall('testing_private_set_result_note', { p_private_id: id, p_note: note }, ctx);
const pMove = (ref, date = '2026-12-01', time = '16:00', ctx = E_DESK, extra = {}) => pCall('testing_move_to_private', {
  p_registration_id: regBy(ref).id, p_expected_version: regBy(ref).version, p_private_date: date, p_private_time: time, ...extra,
}, ctx);
const pUndoMove = (id, ctx = E_DESK, version = 1) => pCall('testing_private_undo_move', { p_private_id: id, p_expected_version: version }, ctx);

check('private mock: tables, grants, the view, the time type, helpers (V1, V2 without sessions)', () => {
  pStart();
  const sel = (table, cols, ctx = E_ADMIN) => ev.select(table, cols, [], [], ctx);
  for (const [table, hidden] of [['testing_private', ['created_by', 'updated_by', 'cancelled_by']], ['testing_private_payments', ['recorded_by']], ['testing_private_results', ['updated_by']]]) {
    assert.ok(EVENT_TABLES.includes(table), table);
    for (const col of hidden) assert.equal(sel(table, col).error.code, '42501', `${table}.${col}`);
    assert.equal(sel(table, '*').error.code, '42501');
    assert.equal(sel(table, 'nope').error.code, '42703');
    assert.equal(sel(table, table === 'testing_private_results' ? 'private_id' : 'id', E_ANON).error.code, '42501');
    assert.deepEqual(sel(table, table === 'testing_private_results' ? 'private_id' : 'id', E_LOCKED).data, []); // RLS
  }
  assert.ok(EVENT_TABLES.includes('testing_private_list'));
  assert.equal(sel('testing_private_list', 'created_by').error.code, '42703'); // never login ids
  assert.equal(sel('testing_private_list', 'amount_due_cents', E_DESK).error, null); // staff read the owed amount (M1)
  for (const name of ['testing_private_time_is_valid', 'testing_private_amount_due', 'testing_private_lock', 'testing_private_lock_payment', 'testing_private_rank_copy']) {
    assert.ok(EVENT_RESTRICTED_RPC_NAMES.includes(name), name);
    assert.equal(ev.rpc(name, {}, E_ADMIN).error.code, '42501', name);
  }
  const bad = (time) => ev.rpc('testing_private_add', {
    p_location_code: 'worcester', p_first: 'A', p_last: 'B', p_rank_id: liveRankOf('Group A', 'Yellow').id, p_stripes: true, p_paying_by: 'cash',
    p_private_date: '2026-10-16', p_private_time: time,
  }, E_DESK);
  assert.equal(bad('x').error.code, '22007');
  assert.equal(bad('25:00').error.code, '22007');
  assert.equal(bad(1600).error.code, '22007');
  assert.equal(bad('16:00').data.status, 'past_day'); // a time: it reaches the function
  assert.deepEqual(evDb().private, []);
});

check('private mock: Add copies from Classes and ranks; day, time and input rules (V3)', () => {
  for (const ctx of [E_DESK, E_ADMIN]) {
    pStart();
    const yellow = liveRankOf('Group A', 'Yellow');
    const a = pAdd({ p_first: '  Liam   ', p_last: ' Park ' }, ctx);
    assert.deepEqual(Object.keys(a).sort(), ['amount_due_cents', 'id', 'status', 'version']);
    assert.deepEqual([a.status, a.version, a.amount_due_cents], ['ok', 1, 8500]);
    const row = privRow(a.id);
    assert.deepEqual([row.first_name, row.last_name, row.location_code, row.class_name, row.rank_name, row.rank_id, row.belt_color], ['Liam', 'Park', 'worcester', 'Group A', 'Yellow', yellow.id, 'yellow']);
    assert.deepEqual([row.to_kind, row.to_name, row.to_belt_color, row.private_cents, row.paying_by, row.private_date, row.private_time, row.status], ['rank', 'Orange', 'orange', 8500, 'cash', '2026-12-01', '16:00:00', 'active']);
    assert.deepEqual([row.moved_from_event_id, row.moved_cleared_no_show, row.moved_registration_version, row.created_by_name], [null, false, null, ctx.actorName]);
    assert.deepEqual(pLogs().map((x) => [x.action, x.table_name, x.op]), [['private_add', 'testing_private', 'insert']]);
  }
  pStart();
  // Testing for: the last rank → the class's final award; a class with None → No new rank.
  const hg = privRow(pAdd({ p_rank_id: liveRankOf('Group A', 'High Green').id }).id);
  assert.deepEqual([hg.to_kind, hg.to_name, hg.to_belt_color], ['rank', 'Blue', 'blue']);
  const deputy = privRow(pAdd({ p_rank_id: liveRankOf('Group D', 'Deputy').id }).id);
  assert.deepEqual([deputy.to_kind, deputy.to_name, deputy.to_belt_color, deputy.private_cents], ['none', null, null, 1000]);
  const n = evDb().private.length;
  // Input refusals.
  const refusals = [
    [{ p_location_code: 'both' }, 'invalid'], [{ p_first: '   ' }, 'invalid'], [{ p_last: null }, 'invalid'], [{ p_rank_id: null }, 'invalid'],
    [{ p_stripes: false }, 'invalid'], [{ p_paying_by: 'venmo' }, 'invalid'], [{ p_private_date: null }, 'invalid'], [{ p_private_time: null }, 'invalid'],
    [{ p_rank_id: liveRankOf('Group A', 'Yellow', 'shrewsbury').id }, 'invalid'], // another school's rank
    [{ p_rank_id: '00000000-0000-4000-8000-00000000dead' }, 'stale'], // a removed rank
    [{ p_private_date: '2026-10-16' }, 'past_day'], [{ p_private_date: '2027-10-18' }, 'invalid'],
    ...['05:55', '22:05', '16:03', '16:00:30'].map((t) => [{ p_private_time: t }, 'invalid']),
  ];
  for (const [over, expected] of refusals) assert.equal(pAdd(over).status, expected, JSON.stringify(over));
  assert.equal(evDb().private.length, n);
  for (const over of [{ p_private_date: PT }, { p_private_date: '2027-10-17' }, { p_private_time: '06:00' }, { p_private_time: '22:00' }]) {
    assert.equal(pAdd(over).status, 'ok', JSON.stringify(over));
  }
  // The last rank of a class whose final award is Not set → final_award_not_set + the class.
  pAsPostgres((s) => { const c = s.classes.find((x) => x.location_code === 'worcester' && x.name === 'Group A'); c.final_award_rank_id = null; c.final_award_none = false; });
  assert.deepEqual(pAdd({ p_rank_id: liveRankOf('Group A', 'High Green').id }), { status: 'final_award_not_set', class_name: 'Group A' });
  assert.equal(pAdd({ p_rank_id: liveRankOf('Group A', 'Green').id }).status, 'ok'); // not the last rank: fine
  // A price change in Classes and ranks afterwards doesn't change the copy.
  const keep = pAdd();
  pAsPostgres((s) => { s.ranks.find((x) => x.id === liveRankOf('Group A', 'Yellow').id).private_cents = 9900; });
  assert.equal(privRow(keep.id).private_cents, 8500);
  assert.equal(pAdd().amount_due_cents, 9900); // a NEW one takes today's price
});

check('private mock: Edit details — names, re-copy, re-price, the kept removed rank, the belt lock (V4, E6, E7)', () => {
  pStart();
  const a = pAdd();
  const id = a.id;
  // Names only: ok, nothing else changes; the same again writes nothing.
  const names = pUpdate(id, privRow(id).rank_id, E_DESK, { first: ' Liam ', last: 'Parker' });
  assert.deepEqual(names, { status: 'ok', version: 2, amount_due_cents: 8500, result_cleared: false });
  assert.equal(privRow(id).last_name, 'Parker');
  const logs = pLogs().length;
  assert.equal(pUpdate(id, privRow(id).rank_id).version, 2);
  assert.equal(pLogs().length, logs);
  // Another school's rank → invalid; a rank that doesn't exist → stale.
  assert.equal(pUpdate(id, liveRankOf('Group B', 'Blue', 'shrewsbury').id).status, 'invalid');
  assert.equal(pUpdate(id, '00000000-0000-4000-8000-00000000dead').status, 'stale');
  // E6: paid $85, corrected to Group B Blue ($95) → $10 more; Mark paid records $10.
  assert.equal(pMark(id).amount_cents, 8500);
  const up = pUpdate(id, liveRankOf('Group B', 'Blue').id);
  assert.deepEqual([up.status, up.amount_due_cents, up.result_cleared], ['ok', 1000, false]);
  assert.deepEqual([privRow(id).class_name, privRow(id).rank_name, privRow(id).to_name, privRow(id).private_cents], ['Group B', 'Blue', 'High Blue', 9500]);
  assert.equal(pMark(id).amount_cents, 1000);
  // E7: paid $95, corrected to an $85 rank → owed 0, nothing refunded.
  assert.equal(pUpdate(id, liveRankOf('Group A', 'Orange').id).amount_due_cents, 0);
  assert.equal(privNet(id), 9500);
  assert.equal(pMark(id).status, 'already_paid');
  // M4: the copied rank is removed from Classes and ranks; sending the stored id back is "belt not changed".
  pAsPostgres((s) => { s.ranks = s.ranks.filter((x) => x.id !== privRow(id).rank_id); });
  const kept = pUpdate(id, privRow(id).rank_id, E_DESK, { first: 'Leo' });
  assert.equal(kept.status, 'ok');
  assert.deepEqual([privRow(id).first_name, privRow(id).rank_name, privRow(id).private_cents], ['Leo', 'Orange', 8500]);
  assert.equal(pUpdate(id, liveRankOf('Group A', 'Green').id).status, 'ok'); // another live rank re-copies
  assert.equal(privRow(id).rank_name, 'Green');
  // A graded one (result or note): a belt change clears it, in the same batch.
  pStart();
  const g = pAdd({ p_private_date: PT }).id;
  pNote(g, 'Good stances');
  const cleared = pUpdate(g, liveRankOf('Group A', 'Orange').id);
  assert.equal(cleared.result_cleared, true);
  assert.equal(evDb().private_results.length, 0);
  const batch = pLogs().slice(-2);
  assert.deepEqual(batch.map((x) => x.action), ['private_update', 'clear_result']);
  assert.equal(batch[0].batch_id, batch[1].batch_id);
  // After the private day: staff can't change the belt of a graded one; admins can; names stay open.
  pResult(g, 'pass');
  pMoveToday('2026-10-18');
  assert.equal(pUpdate(g, liveRankOf('Group A', 'Yellow').id, E_DESK).status, 'not_allowed');
  assert.equal(pUpdate(g, privRow(g).rank_id, E_DESK, { first: 'Sam' }).status, 'ok');
  assert.equal(pUpdate(g, liveRankOf('Group A', 'Yellow').id, E_ADMIN).result_cleared, true);
  // Not graded after the day: staff may.
  const u = pAdd({ p_private_date: '2026-10-18' }).id;
  pMoveToday('2026-10-19');
  assert.equal(pUpdate(u, liveRankOf('Group A', 'Orange').id, E_DESK).status, 'ok');
});

check('private mock: Change day or time — rules, graded, No show cleared, unchanged writes nothing (V5)', () => {
  pStart();
  const id = pAdd({ p_private_date: PT }).id;
  for (const [date, time, expected] of [['2026-10-16', '16:00', 'past_day'], ['2027-10-18', '16:00', 'invalid'], ['2026-12-01', '16:03', 'invalid'], [null, '16:00', 'invalid'], ['2026-12-01', null, 'invalid']]) {
    assert.equal(pDay(id, date, time).status, expected, `${date} ${time}`);
  }
  assert.equal(pDay(id, '2026-12-01', '16:00', E_DESK, { p_expected_version: 9 }).status, 'stale');
  assert.equal(privRow(id).version, 1);
  // A No show (+ note) → removed with the change, one batch.
  pResult(id, 'no_show');
  pNote(id, 'Called in sick');
  // The same day and time: nothing written, the No show stays.
  const logs = pLogs().length;
  assert.deepEqual(pDay(id, PT, '16:00'), { status: 'ok', version: 1, private_date: PT, private_time: '16:00', result_cleared: false });
  assert.equal(evDb().private_results.length, 1);
  assert.equal(pLogs().length, logs);
  const moved = pDay(id, '2026-12-01', '17:30');
  assert.deepEqual(moved, { status: 'ok', version: 2, private_date: '2026-12-01', private_time: '17:30', result_cleared: true });
  assert.equal(evDb().private_results.length, 0);
  const batch = pLogs().slice(-2);
  assert.deepEqual(batch.map((x) => x.action), ['private_change_day', 'clear_result']);
  assert.equal(batch[0].batch_id, batch[1].batch_id);
  // A note only is kept; Pass / Not passed → graded.
  const n = pAdd({ p_private_date: PT }).id;
  pNote(n, 'Bring gear');
  assert.equal(pDay(n, '2026-12-02').result_cleared, false);
  assert.equal(evDb().private_results.find((r) => r.private_id === n).note, 'Bring gear');
  for (const result of ['pass', 'not_passed']) {
    const x = pAdd({ p_private_date: PT }).id;
    pResult(x, result);
    assert.equal(pDay(x, '2026-12-02', '16:00', E_ADMIN).status, 'graded');
  }
});

check('private mock: money — Mark paid, Undo (own / moved / admin), Edit, paying-by, $0, double click (V6, E1, E8–E10, E12)', () => {
  pStart();
  // E1: Mark paid records the price, then already_paid.
  const id = pAdd().id;
  const paid = pMark(id);
  assert.deepEqual([paid.status, paid.amount_cents, paid.method, paid.version], ['ok', 8500, 'cash', 2]);
  assert.equal(pMark(id).status, 'already_paid');
  assert.equal(pCall('testing_private_mark_paid', { p_private_id: id, p_expected_version: 1 }).status, 'stale'); // double click
  // The desk's own Undo within 10 seconds: ok; after 10 seconds / another desk: not_allowed; admins any time.
  evClock += 3000;
  assert.equal(pCall('testing_private_undo_payment', { p_payment_id: paid.payment_id }, E_DESK2).status, 'not_allowed');
  assert.equal(pCall('testing_private_undo_payment', { p_payment_id: paid.payment_id }, E_DESK).status, 'ok');
  assert.equal(pCall('testing_private_undo_payment', { p_payment_id: paid.payment_id }, E_ADMIN).status, 'stale'); // already undone
  const again = pMark(id);
  evClock += 11000;
  assert.equal(pCall('testing_private_undo_payment', { p_payment_id: again.payment_id }, E_DESK).status, 'not_allowed');
  const reversal = evDb().private_payments.find((p) => p.kind === 'reversal');
  assert.equal(pCall('testing_private_undo_payment', { p_payment_id: reversal.id }, E_ADMIN).status, 'invalid');
  assert.equal(pCall('testing_private_undo_payment', { p_payment_id: '00000000-0000-4000-8000-00000000dead' }, E_ADMIN).status, 'not_found');
  assert.equal(pCall('testing_private_undo_payment', { p_payment_id: again.payment_id }, E_ADMIN).status, 'ok');
  assert.equal(reversal.paid_on, PT); // a reversal is dated today
  // E8 / E9 / E12 on a moved one: Mia paid $65 cash at the event → owes $20.
  const m = pMove('CB-3107').private_id;
  assert.equal(PR.amountDue({ privateCents: privRow(m).private_cents, paidCents: privNet(m) }), 2000);
  // M2: the mover can't own-undo the payment that came with the move; an admin can.
  const movedPay = privPayments(m)[0];
  assert.equal(pCall('testing_private_undo_payment', { p_payment_id: movedPay.id }, E_DESK).status, 'not_allowed');
  // E12: paying by changed cash → card while owing; the $20 is card, the $65 stays cash.
  assert.equal(pCall('testing_private_change_paying_by', pArgs(m, { p_paying_by: 'card' })).status, 'ok');
  const topUp = pMark(m);
  assert.deepEqual([topUp.amount_cents, topUp.method], [2000, 'card']);
  assert.equal(privPayments(m).find((p) => p.amount_cents === 6500).method, 'cash');
  assert.equal(pCall('testing_private_change_paying_by', pArgs(m, { p_paying_by: 'cash' })).status, 'already_paid'); // paid in full
  // E9: an admin edits the $20 to $10 → owed $10 (staff: not_allowed).
  const edit = { p_payment_id: topUp.payment_id, p_method: 'card', p_amount_cents: 1000, p_paid_on: PT };
  assert.equal(evCall('testing_private_edit_payment', edit, E_DESK).status, 'not_allowed');
  const edited = pCall('testing_private_edit_payment', edit, E_ADMIN);
  assert.equal(edited.status, 'ok');
  assert.equal(ev.privateAmountDueFor(m), 1000);
  assert.equal(pCall('testing_private_edit_payment', edit, E_ADMIN).status, 'stale'); // already replaced
  assert.equal(pCall('testing_private_edit_payment', { ...edit, p_amount_cents: 0 }, E_ADMIN).status, 'invalid');
  assert.equal(pCall('testing_private_edit_payment', { ...edit, p_paid_on: '2026-10-18' }, E_ADMIN).status, 'invalid'); // in the future
  // E8: an admin Undo of the most recent live payment ($10 now) → owed $20.
  assert.equal(pCall('testing_private_undo_payment', { p_payment_id: edited.payment_id }, E_ADMIN).status, 'ok');
  assert.equal(ev.privateAmountDueFor(m), 2000);
  // The admin may undo the moved-in payment.
  assert.equal(pCall('testing_private_undo_payment', { p_payment_id: movedPay.id }, E_ADMIN).status, 'ok');
  assert.equal(ev.privateAmountDueFor(m), 8500);
  // E10: a $0 private price → nothing to collect, nothing inserted.
  pAsPostgres((s) => { s.ranks.find((x) => x.id === liveRankOf('Group A', 'Yellow').id).private_cents = 0; });
  const zero = pAdd();
  assert.equal(zero.amount_due_cents, 0);
  const before = evDb().private_payments.length;
  assert.equal(pMark(zero.id).status, 'already_paid');
  assert.equal(evDb().private_payments.length, before);
  assert.equal(privRow(zero.id).version, 1);
});

check('private mock: Cancel, Restore and Delete (V7, E11)', () => {
  pStart();
  const id = pAdd().id;
  pMark(id);
  assert.equal(pCall('testing_private_cancel', pArgs(id)).status, 'ok');
  const row = privRow(id);
  assert.deepEqual([row.status, row.cancelled_by_name, typeof row.cancelled_at], ['cancelled', 'Staff', 'string']);
  assert.equal(privNet(id), 8500); // E11: payments stay
  const view = viewOf().find((v) => v.id === id);
  assert.deepEqual([view.paid, view.paid_cents, view.amount_due_cents], [true, 8500, 0]);
  // Every write on a cancelled one → cancelled.
  const pay = privPayments(id)[0];
  const writes = [
    ['testing_private_cancel', pArgs(id)], ['testing_private_mark_paid', pArgs(id)],
    ['testing_private_update', pArgs(id, { p_first: 'X', p_last: 'Y', p_rank_id: row.rank_id })],
    ['testing_private_change_day', pArgs(id, { p_private_date: '2026-12-02', p_private_time: '16:00' })],
    ['testing_private_change_paying_by', pArgs(id, { p_paying_by: 'card' })],
    ['testing_private_set_result', { p_private_id: id, p_result: 'pass' }], ['testing_private_set_result_note', { p_private_id: id, p_note: 'x' }],
  ];
  for (const [name, args] of writes) assert.equal(pCall(name, args, E_ADMIN).status, 'cancelled', name);
  assert.equal(pCall('testing_private_undo_payment', { p_payment_id: pay.id }, E_ADMIN).status, 'cancelled');
  assert.equal(pCall('testing_private_edit_payment', { p_payment_id: pay.id, p_method: 'cash', p_amount_cents: 100, p_paid_on: PT }, E_ADMIN).status, 'cancelled');
  // Restore: admins only, while the day is ahead.
  assert.equal(evCall('testing_private_restore', pArgs(id), E_DESK).status, 'not_allowed');
  assert.equal(pCall('testing_private_restore', pArgs(id), E_ADMIN).status, 'ok');
  assert.equal(privRow(id).status, 'active');
  assert.deepEqual([privRow(id).cancelled_at, privRow(id).cancelled_by_name, privRow(id).cancelled_by], [null, null, null]);
  assert.equal(pCall('testing_private_restore', pArgs(id), E_ADMIN).status, 'invalid'); // not cancelled
  pCall('testing_private_cancel', pArgs(id));
  pMoveToday('2026-12-01');
  assert.equal(pCall('testing_private_restore', pArgs(id), E_ADMIN).status, 'ok'); // on the day itself
  pCall('testing_private_cancel', pArgs(id));
  pMoveToday('2026-12-02');
  assert.equal(pCall('testing_private_restore', pArgs(id), E_ADMIN).status, 'past_day');
  // Cancel: Pass / Not passed → graded; a No show → fine.
  pStart();
  const graded = pAdd({ p_private_date: PT }).id;
  pResult(graded, 'not_passed');
  assert.equal(pCall('testing_private_cancel', pArgs(graded)).status, 'graded');
  const noShow = pAdd({ p_private_date: PT }).id;
  pResult(noShow, 'no_show');
  assert.equal(pCall('testing_private_cancel', pArgs(noShow)).status, 'ok');
  // Delete permanently: admins; the payment ids must be exact.
  pMark(graded);
  const ids = privPayments(graded).map((p) => p.id);
  const del = (paymentIds, ctx = E_ADMIN) => pCall('testing_private_delete', pArgs(graded, { p_expected_payment_ids: paymentIds }), ctx).status;
  assert.equal(evCall('testing_private_delete', pArgs(graded, { p_expected_payment_ids: ids }), E_DESK).status, 'not_allowed');
  assert.equal(del(null), 'invalid');
  assert.equal(del([null]), 'invalid');
  assert.equal(del([ids[0], ids[0]]), 'invalid');
  assert.equal(del([]), 'stale');
  assert.equal(del(['00000000-0000-4000-8000-00000000dead']), 'stale');
  assert.equal(del(ids), 'ok');
  assert.equal(privRow(graded), null);
  assert.equal(evDb().private_payments.some((p) => p.private_id === graded), false);
  assert.equal(evDb().private_results.some((r) => r.private_id === graded), false);
  assert.deepEqual(pLogs().filter((x) => x.action === 'private_delete').map((x) => x.table_name).sort(), ['testing_private', 'testing_private_payments', 'testing_private_results']);
  assert.equal(pCall('testing_private_delete', { p_private_id: noShow, p_expected_version: privRow(noShow).version, p_expected_payment_ids: [] }, E_ADMIN).status, 'ok'); // a cancelled one too
});

check('private mock: grading from the private day (V8)', () => {
  pStart();
  const id = pAdd({ p_private_date: '2026-10-18' }).id;
  for (const ctx of [E_DESK, E_ADMIN]) {
    assert.equal(pResult(id, 'pass', ctx).status, 'not_open');
    assert.equal(pNote(id, 'x', ctx).status, 'not_open');
  }
  pMoveToday('2026-10-18');
  for (const ctx of [E_DESK, E_ADMIN]) {
    assert.equal(pResult(id, 'pass', ctx).status, 'ok');
    assert.equal(pNote(id, 'Good', ctx).status, 'ok');
  }
  pMoveToday('2026-10-19');
  assert.equal(pResult(id, 'not_passed', E_DESK).status, 'finished');
  assert.equal(pNote(id, 'x', E_DESK).status, 'finished');
  const answer = pResult(id, 'not_passed', E_ADMIN);
  assert.deepEqual([answer.status, answer.result, answer.note, answer.updated_by_name], ['ok', 'not_passed', 'Good', 'Jeffrey Berg']);
  // The same value again: no log row; grading never changes the private testing's version.
  const logs = pLogs().length;
  assert.equal(pResult(id, 'not_passed', E_ADMIN).status, 'ok');
  assert.equal(pLogs().length, logs);
  assert.equal(privRow(id).version, 1);
  // Clearing both removes the row; bad values are refused.
  assert.equal(pResult(id, null, E_ADMIN).note, 'Good');
  assert.deepEqual(pNote(id, '   ', E_ADMIN), { status: 'ok', result: null, note: null, updated_at: null, updated_by_name: null });
  assert.equal(evDb().private_results.length, 0);
  assert.equal(pResult(id, 'passed', E_ADMIN).status, 'invalid');
  assert.equal(pNote(id, 'x'.repeat(201), E_ADMIN).status, 'invalid');
  assert.equal(pNote(id, 'x'.repeat(2001), E_ADMIN).status, 'invalid');
  assert.equal(pResult('00000000-0000-4000-8000-00000000dead', 'pass', E_ADMIN).status, 'not_found');
});

check('private mock: Move to private testing — money transfer, statuses, the copy (V9, E2, E4, E5, E13)', () => {
  pStart();
  // E2: Mia paid $65 cash at the event (6 days ago) → owes $20 on the private side.
  const mia = regBy('CB-3107');
  const paidOn = evDb().payments.find((p) => p.registration_id === mia.id).paid_on;
  const activeBefore = rosterOf(DEFAULT_EVENT_ID).filter((r) => r.status === 'active').length;
  const move = pMove('CB-3107');
  assert.deepEqual(Object.keys(move).sort(), ['amount_due_cents', 'private_id', 'registration_version', 'result_cleared', 'status', 'version']);
  assert.deepEqual([move.status, move.version, move.amount_due_cents, move.result_cleared, move.registration_version], ['ok', 1, 2000, false, regBy('CB-3107').version]);
  assert.equal(eventNet('CB-3107'), 0); // the event side nets 0 …
  const reversal = evDb().payments.find((p) => p.registration_id === mia.id && p.kind === 'reversal');
  assert.deepEqual([reversal.amount_cents, reversal.method, reversal.paid_on], [-6500, 'cash', paidOn]); // … dated the original day
  const priv = privRow(move.private_id);
  const pp = privPayments(priv.id);
  assert.deepEqual(pp.map((p) => [p.amount_cents, p.method, p.paid_on, p.moved_from_payment_id]), [[6500, 'cash', paidOn, reversal.reverses_payment_id]]);
  assert.deepEqual([priv.first_name, priv.last_name, priv.class_name, priv.rank_name, priv.to_name, priv.private_cents, priv.paying_by], ['Mia', 'Lopez', 'Group A', 'Yellow', 'Orange', 8500, 'cash']);
  assert.deepEqual([priv.moved_from_event_id, priv.moved_from_registration_id, priv.moved_from_event_name, priv.moved_cleared_no_show, priv.moved_registration_version], [DEFAULT_EVENT_ID, mia.id, 'November Children Testing', false, move.registration_version]);
  const reg = regBy('CB-3107');
  assert.deepEqual([reg.status, reg.withdrawn_reason, reg.withdrawn_by_name, reg.duplicate_state], ['withdrawn', 'withdrawn', 'Staff', 'none']);
  assert.equal(rosterOf(DEFAULT_EVENT_ID).filter((r) => r.status === 'active').length, activeBefore - 1);
  assert.equal(regBy('CB-3109').duplicate_state, 'none'); // its duplicate partner was re-checked
  const batches = new Set(pLogs().map((x) => x.batch_id));
  assert.equal(batches.size, 1);
  assert.ok(pLogs().every((x) => x.action === 'move_to_private'));
  // What the event page reads (loadEvent's extra query): the moved registration → its private testing.
  assert.deepEqual(ev.select('testing_private', 'id, moved_from_registration_id, private_date, private_time, status', [{ col: 'moved_from_event_id', value: DEFAULT_EVENT_ID }], [], E_DESK).data,
    [{ id: priv.id, moved_from_registration_id: mia.id, private_date: '2026-12-01', private_time: '16:00:00', status: 'active' }]);
  // Refusals.
  assert.equal(pMove('CB-3107').status, 'withdrawn'); // moving the same registration again
  assert.equal(pMove('CB-3116').status, 'withdrawn'); // Leo is withdrawn
  assert.equal(pMove('CB-3112', '2026-12-01', '16:00', E_DESK, { p_expected_version: 9 }).status, 'stale');
  assert.equal(pMove('CB-3112', '2026-10-16').status, 'past_day');
  assert.equal(pMove('CB-3112', '2027-10-18').status, 'invalid');
  assert.equal(pMove('CB-3112', '2026-12-01', '16:03').status, 'invalid');
  assert.equal(pCall('testing_move_to_private', { p_registration_id: '00000000-0000-4000-8000-00000000dead', p_expected_version: 1, p_private_date: '2026-12-01', p_private_time: '16:00' }).status, 'not_found');
  // E4: not paid → nothing moves, the full price is owed.
  const zoe = pMove('CB-3112');
  assert.equal(zoe.amount_due_cents, 8500);
  assert.equal(privPayments(zoe.private_id).length, 0);
  // Today's price from Classes and ranks (v0.404); the event's copy only when the rank is gone.
  pStart();
  pAsPostgres((s) => { s.ranks.find((x) => x.id === liveRankOf('Group A', 'Orange').id).private_cents = 9000; });
  assert.equal(privRow(pMove('CB-3110').private_id).private_cents, 9000); // Sam, Orange
  pAsPostgres((s) => { s.ranks = s.ranks.filter((x) => x.id !== liveRankOf('Group A', 'Yellow').id); });
  assert.equal(privRow(pMove('CB-3112').private_id).private_cents, 8500); // Zoe, Yellow: the event copy
  // E5 / an already-reversed pair: Mia's $65 is edited (admin) to $85 at the event → only the live $85 moves.
  pStart();
  const original = evDb().payments.find((p) => p.registration_id === regBy('CB-3107').id);
  assert.equal(evStatus('testing_edit_payment', { p_payment_id: original.id, p_method: 'cash', p_amount_cents: 8500, p_paid_on: original.paid_on }, E_ADMIN), 'ok');
  const e5 = pMove('CB-3107');
  assert.equal(e5.amount_due_cents, 0);
  assert.deepEqual(privPayments(e5.private_id).map((p) => p.amount_cents), [8500]);
  assert.equal(evDb().payments.filter((p) => p.registration_id === regBy('CB-3107').id).length, 4); // the pair + the live one + its move reversal
  assert.equal(eventNet('CB-3107'), 0);
  // E13: overpaid ($95 paid, $85 price) → the whole $95 moves, owed 0, nothing refunded.
  const ethan = evDb().payments.find((p) => p.registration_id === regBy('CB-3111').id);
  evStatus('testing_edit_payment', { p_payment_id: ethan.id, p_method: 'check', p_amount_cents: 9500, p_paid_on: ethan.paid_on }, E_ADMIN);
  const e13 = pMove('CB-3111');
  assert.deepEqual([e13.amount_due_cents, privNet(e13.private_id)], [0, 9500]);
  // Two live payments → both move, oldest first.
  pStart();
  pAsPostgres((s) => {
    const r = s.registrations.find((x) => x.reference === 'CB-3105');
    s.payments.push({ id: randomUUID(), registration_id: r.id, kind: 'payment', amount_cents: 2500, method: 'card', paid_on: PT, recorded_at: new Date(evClock).toISOString(), recorded_by: null, recorded_by_name: 'Staff', reverses_payment_id: null });
  });
  const two = pMove('CB-3105'); // Ella, Group B Blue ($95)
  assert.deepEqual(privPayments(two.private_id).map((p) => [p.amount_cents, p.method]), [[7000, 'cash'], [2500, 'card']]);
  assert.deepEqual([two.amount_due_cents, eventNet('CB-3105')], [0, 0]);
});

check('private mock: Move and the testing-day result; staff any time (V9, v0.404)', () => {
  pStart('2026-11-20');
  setRes('CB-3110', 'no_show');
  setNote('CB-3110', 'Was sick');
  setRes('CB-3112', 'pass');
  setRes('CB-3113', 'not_passed');
  setNote('CB-3114', 'Note only');
  pMoveToday('2026-11-21'); // after the testing day: staff may still move (v0.404)
  assert.equal(pMove('CB-3112', '2026-11-21').status, 'has_result');
  assert.equal(pMove('CB-3113', '2026-11-21', '16:00', E_ADMIN).status, 'has_result');
  const noShow = pMove('CB-3110', '2026-11-21');
  assert.deepEqual([noShow.status, noShow.result_cleared], ['ok', true]);
  assert.equal(resultFor('CB-3110'), null);
  assert.equal(privRow(noShow.private_id).moved_cleared_no_show, true);
  const rows = pLogs().filter((x) => x.batch_id === pLogs().at(-1).batch_id);
  assert.deepEqual(rows.at(-1).action, 'clear_result');
  assert.ok(rows.slice(0, -1).every((x) => x.action === 'move_to_private'));
  const note = pMove('CB-3114', '2026-11-21');
  assert.equal(note.result_cleared, false);
  assert.equal(resultFor('CB-3114').note, 'Note only'); // the note stays with the registration
  assert.equal(evDb().private_results.length, 0); // and isn't copied
});

check('private mock: the moved registration afterwards — live functions (V9b, V10)', () => {
  pStart();
  const mia = regBy('CB-3107');
  const original = evDb().payments.find((p) => p.registration_id === mia.id);
  const move = pMove('CB-3107');
  const moveReversal = evDb().payments.find((p) => p.reverses_payment_id === original.id);
  const v = () => regBy('CB-3107').version;
  assert.equal(evStatus('testing_mark_paid', { p_registration_id: mia.id, p_expected_version: v() }, E_ADMIN), 'withdrawn');
  assert.equal(evStatus('testing_change_paying_by', { p_registration_id: mia.id, p_expected_version: v(), p_paying_by: 'card' }, E_ADMIN), 'withdrawn');
  assert.equal(evStatus('testing_undo_payment', { p_payment_id: original.id }, E_ADMIN), 'stale');
  assert.equal(evStatus('testing_undo_payment', { p_payment_id: moveReversal.id }, E_ADMIN), 'invalid');
  assert.equal(evStatus('testing_edit_payment', { p_payment_id: original.id, p_method: 'cash', p_amount_cents: 100, p_paid_on: PT }, E_ADMIN), 'stale');
  assert.equal(evStatus('testing_edit_payment', { p_payment_id: moveReversal.id, p_method: 'cash', p_amount_cents: 100, p_paid_on: PT }, E_ADMIN), 'invalid');
  pMoveToday('2026-11-20');
  assert.equal(evStatus('testing_set_result', { p_registration_id: mia.id, p_result: 'pass' }, E_ADMIN), 'withdrawn');
  pMoveToday(PT);
  // V10: Restore of the moved registration → moved (staff and admins), nothing changes.
  const before = JSON.stringify(evDb());
  assert.equal(evStatus('testing_restore_student', { p_registration_id: mia.id, p_expected_version: v() }, E_ADMIN), 'moved');
  assert.equal(evStatus('testing_restore_student', { p_registration_id: mia.id, p_expected_version: v() }, E_DESK), 'moved');
  assert.equal(JSON.stringify(evDb()), before);
  const leo = regBy('CB-3116'); // an ordinary withdrawn registration still restores
  assert.equal(evStatus('testing_restore_student', { p_registration_id: leo.id, p_expected_version: leo.version }, E_ADMIN), 'ok');
  // Delete the event with the net WITHOUT the moved money → ok; the private testing stays.
  const regs = evDb().registrations.filter((r) => r.event_id === DEFAULT_EVENT_ID);
  const total = evDb().payments.filter((p) => regs.some((r) => r.id === p.registration_id)).reduce((t, p) => t + p.amount_cents, 0);
  assert.equal(total, 41000 - 6500); // $410 of the default data minus Mia's moved $65
  assert.equal(evStatus('testing_delete_event', { p_event_id: DEFAULT_EVENT_ID, p_expected_version: eventRow().version, p_expected_registration_count: regs.length, p_expected_payment_total_cents: total }, E_ADMIN), 'ok');
  assert.deepEqual([privRow(move.private_id).moved_from_registration_id, privNet(move.private_id)], [mia.id, 6500]);
  assert.equal(pUndoMove(move.private_id).status, 'not_found');
  // Delete permanently of a moved registration (admin) → ok, the private money stays.
  pStart();
  const m2 = pMove('CB-3107');
  const r2 = regBy('CB-3107');
  const payIds = evDb().payments.filter((p) => p.registration_id === r2.id).map((p) => p.id);
  assert.equal(evStatus('testing_delete_student', { p_registration_id: r2.id, p_expected_version: r2.version, p_expected_payment_ids: payIds }, E_ADMIN), 'ok');
  assert.equal(privNet(m2.private_id), 6500);
});

check('private mock: Undo move — the mover within 10 seconds, nothing changed since (V11, M2, M3, L1)', () => {
  pStart();
  const mia = regBy('CB-3107');
  const original = evDb().payments.find((p) => p.registration_id === mia.id);
  const versionBefore = mia.version;
  const move = pMove('CB-3107');
  evClock += 4000;
  assert.equal(pUndoMove(move.private_id, E_ADMIN).status, 'not_allowed'); // not the mover (admins too)
  assert.equal(pUndoMove(move.private_id, E_DESK2).status, 'not_allowed');
  assert.equal(pUndoMove(move.private_id, E_DESK, 2).status, 'stale');
  const logs = pLogs().length;
  const undo = pUndoMove(move.private_id);
  assert.deepEqual(undo, { status: 'ok', registration_id: mia.id, registration_version: regBy('CB-3107').version });
  const reg = regBy('CB-3107');
  assert.deepEqual([reg.status, reg.withdrawn_at, reg.withdrawn_by, reg.withdrawn_by_name, reg.withdrawn_reason], ['active', null, null, null, null]);
  assert.ok(reg.version >= versionBefore + 2); // back to active (+ the duplicate re-check)
  assert.equal(regBy('CB-3109').duplicate_state, 'possible'); // the duplicate pair is back
  assert.equal(eventNet('CB-3107'), 6500);
  const recreated = evDb().payments.filter((p) => p.registration_id === mia.id).at(-1);
  assert.deepEqual([recreated.kind, recreated.amount_cents, recreated.paid_on, recreated.recorded_by, recreated.recorded_by_name], ['payment', 6500, original.paid_on, null, 'Staff']);
  assert.equal(privRow(move.private_id), null);
  assert.equal(evDb().private_payments.length, 0);
  assert.equal(new Set(pLogs().slice(logs).map((x) => x.batch_id)).size, 1);
  assert.ok(pLogs().slice(logs).every((x) => x.action === 'undo_move_to_private'));
  // The recreated event payment has no recorder → the desk's live own-undo can't touch it.
  assert.equal(evStatus('testing_undo_payment', { p_payment_id: recreated.id }, E_DESK), 'not_allowed');
  // After 10 seconds → not_allowed.
  const late = pMove('CB-3107');
  evClock += 10000;
  assert.equal(pUndoMove(late.private_id).status, 'not_allowed');
  // A Mark paid on the private side since → stale (also with its new version).
  pStart();
  const paid = pMove('CB-3107');
  pMark(paid.private_id);
  assert.equal(pUndoMove(paid.private_id).status, 'stale');
  assert.equal(pUndoMove(paid.private_id, E_DESK, privRow(paid.private_id).version).status, 'stale');
  // The registration edited since (an admin renames it) → stale.
  const renamed = pMove('CB-3112');
  const z = regBy('CB-3112');
  evStatus('testing_update_student', { p_registration_id: z.id, p_expected_version: z.version, p_first: 'Zoey', p_last: z.last_name, p_event_rank_id: z.event_rank_id }, E_ADMIN);
  assert.equal(pUndoMove(renamed.private_id).status, 'stale');
  // A result on the private side since → stale.
  const graded = pMove('CB-3110', PT);
  pNote(graded.private_id, 'note');
  assert.equal(pUndoMove(graded.private_id).status, 'stale');
  // L1: a move that cleared a No show → not_allowed (the No show can't come back).
  pStart('2026-11-20');
  setRes('CB-3110', 'no_show');
  const cleared = pMove('CB-3110', '2026-11-20');
  assert.equal(pUndoMove(cleared.private_id).status, 'not_allowed');
  // Not a moved one → not_found.
  const added = pAdd({ p_private_date: '2026-11-20' });
  assert.equal(pUndoMove(added.id).status, 'not_found');
});

check('private mock: the Past / Upcoming cards from the view (E11, privateCards)', () => {
  pStart();
  const a = pAdd({ p_first: 'Ann', p_private_date: '2026-11-02' }).id;
  pMark(a);
  pCall('testing_private_cancel', pArgs(a)); // E11: paid $85, then cancelled
  pAdd({ p_first: 'Bo', p_private_date: '2026-11-03' });
  pMove('CB-3107', '2026-11-04'); // owes $20
  const rows = viewOf().map((v) => ({
    id: v.id, status: v.status, firstName: v.first_name, lastName: v.last_name, privateDate: v.private_date, privateTime: v.private_time,
    paid: v.paid, paidCents: v.paid_cents, amountDueCents: v.amount_due_cents,
  }));
  const { upcoming, past } = PR.splitPrivate(rows, PT);
  assert.deepEqual(upcoming.map((r) => r.firstName), ['Bo', 'Mia']);
  assert.deepEqual(past.map((r) => r.firstName), ['Ann']);
  assert.deepEqual(PR.privateCards(upcoming), { count: 2, paid: 1, notPaid: 1, owesMore: 1, paymentsCents: 6500, cancelledCents: 0 });
  assert.deepEqual(PR.privateCards(past), { count: 0, paid: 0, notPaid: 0, owesMore: 0, paymentsCents: 8500, cancelledCents: 8500 });
  assert.deepEqual(viewOf('shrewsbury'), []);
});

check('private mock: history and a store saved before phase 4', () => {
  pStart();
  const id = pAdd().id;
  pMark(id);
  pDay(id, '2026-12-02');
  pCall('testing_private_cancel', pArgs(id));
  pCall('testing_private_restore', pArgs(id), E_ADMIN);
  const actions = new Set(pLogs().map((x) => x.action));
  for (const a of ['private_add', 'private_mark_paid', 'private_change_day', 'private_cancel', 'private_restore']) assert.ok(actions.has(a), a);
  assert.ok(pLogs().every((x) => typeof x.batch_id === 'string' && x.batch_id && (x.actor_name === 'Staff' || x.actor_name === 'Jeffrey Berg')));
  assert.ok(!JSON.stringify(pLogs()).includes('data:image'));
  // A store without the new lists keeps its events (and private testing works on it).
  const old = JSON.parse(JSON.stringify(evMemory));
  for (const key of ['private', 'private_payments', 'private_results', 'change_log']) delete old[key];
  old.events[0].name = 'Kept event';
  evMemory = old;
  assert.equal(eventRow().name, 'Kept event');
  assert.deepEqual([evDb().private, evDb().private_payments, evDb().private_results, evDb().change_log], [[], [], [], []]);
  assert.equal(pAdd().status, 'ok');
  assert.equal(eventRow().name, 'Kept event');
  ev.reset();
  assert.equal(evDb().private.length, 5); // reset brings back the seeded preview story
});

check('private mock: the seeded preview story is consistent (money nets, the moved pair)', () => {
  evReset();
  ev.reset(); // the default store, made for "today" = Oct 17 (testing day Nov 20)
  const d = evDb();
  const byName = (first) => d.private.find((p) => p.first_name === first);
  const net = (id) => d.private_payments.filter((p) => p.private_id === id).reduce((t, p) => t + p.amount_cents, 0);
  const result = (id) => d.private_results.find((r) => r.private_id === id)?.result ?? null;
  assert.deepEqual(d.private.map((p) => p.first_name), ['Liam', 'Noah', 'Ava', 'Emma', 'Sofia']);
  assert.ok(d.private.every((p) => p.location_code === 'worcester' && p.stripes_confirmed && PR.privateTimeIsValid(p.private_time)));
  // Each one as the story says (class, belt → testing for, price, day, paid, owed, status, result).
  const facts = (first) => {
    const p = byName(first);
    return [p.class_name, p.rank_name, p.to_name, p.private_cents, p.private_date, p.private_time, net(p.id), ev.privateAmountDueFor(p.id), p.status, result(p.id)];
  };
  assert.deepEqual(facts('Liam'), ['Group B', 'Blue', 'High Blue', 9500, '2026-12-03', '17:30:00', 0, 9500, 'active', null]);
  assert.deepEqual(facts('Noah'), ['Group A', 'Orange', 'Green', 8500, '2026-12-05', '10:00:00', 8500, 0, 'active', null]);
  assert.deepEqual(facts('Ava'), ['Group A', 'Yellow', 'Orange', 8500, '2026-12-01', '16:00:00', 6500, 2000, 'active', null]);
  assert.deepEqual(facts('Emma'), ['Group A', 'Green', 'High Green', 8500, '2026-11-30', '16:30:00', 8500, 0, 'cancelled', null]);
  assert.deepEqual(facts('Sofia'), ['Group A', 'Yellow', 'Orange', 8500, '2026-10-14', '16:00:00', 8500, 0, 'active', 'pass']);
  // Weekdays as in the mockups: Thu Dec 3, Sat Dec 5, Tue Dec 1, Mon Nov 30.
  const weekday = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay();
  assert.deepEqual(['Liam', 'Noah', 'Ava', 'Emma'].map((f) => weekday(byName(f).private_date)), [4, 6, 2, 1]);
  assert.ok(byName('Emma').cancelled_at && byName('Emma').cancelled_by_name === 'Staff');
  // Upcoming / Past on today: Ava, Liam, Noah upcoming; Emma (cancelled) and Sofia (past) on Past.
  const rows = d.private.map((p) => ({ status: p.status, privateDate: p.private_date, privateTime: p.private_time, firstName: p.first_name, lastName: p.last_name }));
  const sides = PR.splitPrivate(rows, PT);
  assert.deepEqual([sides.upcoming.map((r) => r.firstName), sides.past.map((r) => r.firstName)], [['Ava', 'Liam', 'Noah'], ['Emma', 'Sofia']]);
  // Nothing is dated in the future; every stamp is in order.
  const day = (iso) => todayInSchoolTime(new Date(iso));
  for (const p of d.private) assert.ok(day(p.created_at) < PT && p.created_at <= p.updated_at, p.first_name);
  for (const p of d.private_payments) assert.ok(p.paid_on < PT && day(p.recorded_at) < PT, p.id);
  // The moved pair, exactly as testing_move_to_private writes it.
  const ava = byName('Ava');
  const reg = d.registrations.find((r) => r.id === ava.moved_from_registration_id);
  assert.deepEqual([reg.reference, reg.first_name, reg.last_name, reg.status, reg.withdrawn_reason, reg.withdrawn_by_name, reg.duplicate_state], ['CB-3117', 'Ava', 'Chen', 'withdrawn', 'withdrawn', 'Staff', 'none']);
  assert.deepEqual([ava.moved_from_event_id, ava.moved_from_event_name, ava.moved_registration_version, ava.moved_cleared_no_show, ava.version], [DEFAULT_EVENT_ID, 'November Children Testing', reg.version, false, 1]);
  const eventPays = d.payments.filter((p) => p.registration_id === reg.id);
  const original = eventPays.find((p) => p.kind === 'payment');
  const reversal = eventPays.find((p) => p.kind === 'reversal');
  assert.equal(eventPays.length, 2);
  assert.deepEqual([original.amount_cents, original.method, reversal.amount_cents, reversal.method, reversal.paid_on, reversal.reverses_payment_id], [6500, 'cash', -6500, 'cash', original.paid_on, original.id]);
  assert.equal(eventPays.reduce((t, p) => t + p.amount_cents, 0), 0); // the event side nets 0
  const moved = d.private_payments.filter((p) => p.private_id === ava.id);
  assert.deepEqual(moved.map((p) => [p.amount_cents, p.method, p.paid_on, p.moved_from_payment_id]), [[6500, 'cash', original.paid_on, original.id]]);
  assert.equal(reversal.recorded_at, reg.withdrawn_at); // one move: the same moment
  assert.equal(moved[0].recorded_at, original.recorded_at); // the original's moment (M1)
  // What the event page reads for the Removed row, and Restore there.
  assert.deepEqual(ev.select('testing_private', 'id, moved_from_registration_id, status', [{ col: 'moved_from_event_id', value: DEFAULT_EVENT_ID }], [], E_DESK).data,
    [{ id: ava.id, moved_from_registration_id: reg.id, status: 'active' }]);
  assert.equal(evStatus('testing_restore_student', { p_registration_id: reg.id, p_expected_version: reg.version }, E_ADMIN), 'moved');
  // Event money unchanged by the seed ($410), and every other private payment is unmoved.
  assert.equal(d.payments.reduce((t, p) => t + p.amount_cents, 0), 41000);
  assert.ok(d.private_payments.filter((p) => p.private_id !== ava.id).every((p) => p.moved_from_payment_id === null));
  assertPrivDueSame();
  // The seed works with the functions: Mark paid on Ava records her $20; on Liam his $95.
  assert.equal(pMark(ava.id).amount_cents, 2000);
  assert.equal(pMark(byName('Liam').id).amount_cents, 9500);
  // A seed made for a later "today" (after the testing day) is still in the past and in order.
  const late = defaultEventsData({ today: '2026-12-10' });
  assert.ok(late.private_payments.every((p) => p.paid_on < '2026-12-10'));
  assert.ok(late.private.every((p) => p.created_at <= p.updated_at));
});

check('private mock: a move keeps each payment\'s moment, so "the most recent payment" stays the same (review M1)', () => {
  pStart();
  // Mia: $65 early (6 days ago, default data), then a $20 top-up 3 days ago (as postgres).
  const mia = regBy('CB-3107');
  const early = evDb().payments.find((p) => p.registration_id === mia.id);
  const topUpId = randomUUID();
  pAsPostgres((s) => {
    s.payments.push({ id: topUpId, registration_id: mia.id, kind: 'payment', amount_cents: 2000, method: 'card', paid_on: addDays(PT, -3),
      recorded_at: new Date(Date.parse(early.recorded_at) + 3 * 24 * 3600 * 1000).toISOString(), recorded_by: null, recorded_by_name: 'Staff', reverses_payment_id: null });
  });
  const roster = () => rosterOf(DEFAULT_EVENT_ID).find((r) => r.reference === 'CB-3107');
  assert.equal(roster().last_payment_id, topUpId);
  const move = pMove('CB-3107');
  const moved = privPayments(move.private_id);
  const topUpCopy = moved.find((p) => p.moved_from_payment_id === topUpId);
  // Each private copy keeps the original's recorded_at (not "now").
  for (const p of moved) assert.equal(p.recorded_at, evDb().payments.find((x) => x.id === p.moved_from_payment_id).recorded_at);
  const view = ev.select('testing_private_list', 'id, last_payment_id, paid_on, paid_method, paid_cents, amount_due_cents', [{ col: 'id', value: move.private_id }], [], E_ADMIN).data[0];
  assert.deepEqual([view.last_payment_id, view.paid_on, view.paid_method, view.paid_cents, view.amount_due_cents], [topUpCopy.id, addDays(PT, -3), 'card', 8500, 0]);
  // Undo move: the recreated event payments keep those moments → the $20 is the latest live one again.
  evClock += 2000;
  assert.equal(pUndoMove(move.private_id).status, 'ok');
  const recreated = evDb().payments.filter((p) => p.registration_id === mia.id && p.kind === 'payment' && p.recorded_by === null && p.id !== topUpId);
  assert.deepEqual(recreated.map((p) => [p.amount_cents, p.recorded_at]).sort(), [[2000, moved.find((p) => p.amount_cents === 2000).recorded_at], [6500, early.recorded_at]].sort());
  const after = roster();
  const latest = recreated.find((p) => p.amount_cents === 2000);
  assert.deepEqual([after.last_payment_id, after.paid_method, after.paid_on, after.paid_cents], [latest.id, 'card', addDays(PT, -3), 8500]);
  // The same moment: the higher id is "the most recent" (recorded_at desc, id desc).
  pStart();
  const id = pAdd().id;
  const at = new Date(evClock - 60000).toISOString();
  pAsPostgres((s) => {
    for (const pid of ['00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a1']) { // the higher id stored first
      s.private_payments.push({ id: pid, private_id: id, kind: 'payment', amount_cents: 1000, method: 'cash', paid_on: PT, recorded_at: at, recorded_by: null, recorded_by_name: 'Staff', reverses_payment_id: null, moved_from_payment_id: null });
    }
  });
  assert.equal(ev.select('testing_private_list', 'last_payment_id', [{ col: 'id', value: id }], [], E_ADMIN).data[0].last_payment_id, '00000000-0000-4000-8000-0000000000a2');
});

check('private mock: Change how they\'ll pay is refused after a Pass / Not passed (review L3)', () => {
  pStart();
  for (const [result, expected] of [['pass', 'graded'], ['not_passed', 'graded'], ['no_show', 'ok'], [null, 'ok']]) {
    const id = pAdd({ p_private_date: PT }).id;
    if (result) pResult(id, result);
    else pNote(id, 'a note alone never counts');
    assert.equal(pCall('testing_private_change_paying_by', pArgs(id, { p_paying_by: 'card' })).status, expected, String(result));
    assert.equal(pCall('testing_private_change_paying_by', pArgs(id, { p_paying_by: 'card' }), E_ADMIN).status, expected, `${result} admin`);
  }
  // The screen agrees: privateMenu hides it after a Pass / Not passed (L5).
  assert.equal(PR.privateMenu({ status: 'active', paid: false, amountDueCents: 8500, result: 'pass' }, { today: PT, isAdmin: true }).changePayingBy, false);
});

check('sanity: these checks catch a broken rule (break on purpose)', () => {
  // The comparison helper must FAIL when the rule it compares with is wrong.
  pStart();
  const m = pMove('CB-3107'); // owes $20
  assert.throws(() => assertPrivDueSame(({ privateCents }) => privateCents)); // "ignores what's paid"
  assert.throws(() => assertPrivDueSame(({ privateCents, paidCents }) => privateCents - paidCents + 1)); // off by a cent
  assert.throws(() => assertPrivDueSame(() => 0)); // "never owes"
  assertPrivDueSame(); // the real rule passes
  // And on a broken copy of the data: a payment changed behind the mock's back shows up in both
  // the mock and the rule (same data), but no longer matches the expected E2 amount.
  pAsPostgres((s) => { s.private_payments.find((p) => p.private_id === m.private_id).amount_cents = 7000; });
  assert.notEqual(ev.privateAmountDueFor(m.private_id), 2000);
  // The menu and the money rule reject wrong answers too.
  assert.throws(() => assert.equal(PR.amountDue({ privateCents: 8500, paidCents: 6500 }), 1500));
  assert.throws(() => assert.equal(PR.privateMenu({ status: 'active', result: 'pass' }, { today: PT, isAdmin: false }).cancel, true));
});

// ======================= publicApi.preview.js (the family page in preview mode) =======================

// It runs in the browser; here a tiny fake window (localStorage + crypto) stands in.
const fakeStorage = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (fakeStorage.has(k) ? fakeStorage.get(k) : null),
    setItem: (k, v) => fakeStorage.set(k, String(v)),
    removeItem: (k) => fakeStorage.delete(k),
  },
  crypto: { randomUUID },
};
const previewApi = await import('./publicApi.preview.js');
const helpers = previewApi.publicPreviewHelpers();
previewApi.setFakeDelay(0); // no pretend network time in the checks

await (async () => {
  const label = 'public preview API: same JSON and rules as the Function';
  try {
    helpers.setToday('2026-10-17');
    const code = DEFAULT_PUBLIC_CODE;
    const got = await previewApi.getEvent(code.toUpperCase());
    assert.equal(typeof globalThis.window.__tkdPreview.setToday, 'function'); // installed on first use
    assert.equal(got.status, 'ok');
    assert.deepEqual(Object.keys(got).sort(), ['classes', 'closed_on', 'event', 'state', 'status', 'turnstile_site_key']);
    assert.equal(got.state, 'open');
    assert.deepEqual(await previewApi.getEvent('zzzzzzzz'), { status: 'not_found' });
    assert.deepEqual(await previewApi.getEvent('../x'), { status: 'not_found' });
    const rankId = got.classes[2].ranks[1].event_rank_id; // Group A, Orange
    const t0 = Date.now();
    const body = (over = {}) => ({
      submission_id: randomUUID(), first_name: 'Ivy', last_name: 'Stone', event_rank_id: rankId, paying_by: 'cash', stripes: true,
      signature: SIG, ack_version: ACK_VERSION, website: '', started_at: t0 - 60000, sent_at: t0, turnstile_token: '', ...over,
    });
    assert.deepEqual(await previewApi.register(code, body({ website: 'http://spam' })), { status: 'bad_request' }); // honeypot
    assert.deepEqual(await previewApi.register(code, body({ started_at: t0 - 1000 })), { status: 'bad_request' }); // too fast
    assert.deepEqual(await previewApi.register(code, body({ signature: 'A'.repeat(110 * 1024) })), { status: 'bad_request' }); // > 100 KB
    assert.deepEqual(await previewApi.register(code, body({ stripes: 'yes' })), { status: 'bad_request' });
    assert.deepEqual(await previewApi.register(code, body({ stripes: false })), { status: 'invalid' });
    helpers.forceVerifyFailed(true);
    assert.deepEqual(await previewApi.register(code, body()), { status: 'verify_failed' });
    const ok = await previewApi.register(code, body()); // only the next one failed
    assert.equal(ok.status, 'ok');
    assert.equal(ok.testing_for.name, 'Green');
    assert.equal(ok.reference, 'CB-3118');
    helpers.forceRateLimited(true);
    assert.deepEqual(await previewApi.register(code, body()), { status: 'rate_limited' });
    helpers.forceRateLimited(false);
    // The staff preview (same store) sees the registration.
    const store = JSON.parse(fakeStorage.get('tkd.preview.testing'));
    assert.equal(store.registrations.find((r) => r.reference === 'CB-3118').first_name, 'Ivy');
    helpers.setToday('2026-11-14');
    assert.deepEqual(await previewApi.register(code, body()), { status: 'closed', closed_on: '2026-11-13' });
    assert.equal((await previewApi.getEvent(code)).state, 'closed');
    helpers.setToday(null);
    assert.equal(previewApi.previewToday(), todayInSchoolTime());
    assert.match(helpers.setToday('nope'), /Use a date/);
    helpers.setPublicRegistration(false);
    assert.deepEqual(await previewApi.getEvent(code), { status: 'not_open' }); // the kill switch
    assert.deepEqual(await previewApi.register(code, body()), { status: 'not_open' });
    helpers.setPublicRegistration(true);
    assert.equal((await previewApi.getEvent(code)).status, 'ok');
    count += 1;
  } catch (error) {
    console.error(`FAILED: ${label}`);
    throw error;
  }
})();

console.log(`${count} groups of checks ran.`);
console.log('ALL TESTING LIB CHECKS PASSED');
