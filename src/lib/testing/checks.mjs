// checks.mjs — automatic checks for the Testing data layer. Run:  node src/lib/testing/checks.mjs
// (Phase 2 added: eventRules.js, qr.js, the events preview database and the family page's preview
// API — contract 0005 §5. Those groups are at the end. Phase 3 added gradingRules.js and the
// grading part of the preview database — contract 0010 §3.5 — just before the family page part.
// Phase 4 added the private testing rules and the private part of the preview database —
// contract 0014 §4.4, the worked examples M1–M14 and the replays V3–V20 — after the grading part.)
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
  PRIVATE_TIME_CHOICES, privateTimeIsValid, privateDayLimit, privateDayProblem, isPrivate, gradingDay, priceFor, amountDue,
  owesMore, showMarkPaid, canChangePayingBy, privateMenu, livePayments, privateTestingsList,
} from './eventRules.js';
import { registrationLink, qrSvgDataUrl } from './qr.js';
import {
  RESULTS, GRADING_NOTE_MAX, normalizeGradingNote, gradingNoteProblem, gradingWindow, canChangeResults, isGraded,
  resultCounts, schoolMinutesNow, defaultGradingClassId, addedAfterDay, testingGroups, groupOfClass,
} from './gradingRules.js';
import {
  createEventsBackend, defaultEventsData, EVENT_RPC_NAMES, EVENT_RESTRICTED_RPC_NAMES, EVENT_ADMIN_ONLY_RPCS, DEFAULT_EVENT_ID, DEFAULT_PUBLIC_CODE,
} from '../mockTestingEvents.js';

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
  assert.equal(roster.filter((r) => r.status === 'withdrawn').length, 1);
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
      assert.ok(reg.registered_at < p.recorded_at && schoolDay(p.recorded_at) === p.paid_on);
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
  assert.deepEqual(c, { activeCount: 15, withdrawnCount: 1, registrationCount: 16, paymentTotalCents: 41000, removedPaymentCents: 0 });
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
    testing_set_result: { p_registration_id: anyId, p_result: 'pass' }, // phase 3 (S)
    testing_set_result_note: { p_registration_id: anyId, p_note: 'x' }, // phase 3 (S)
    testing_set_private: { p_registration_id: anyId, p_expected_version: 1, p_private_date: '2026-12-01', p_private_time: '16:00' }, // phase 4 (S)
    testing_clear_private: { p_registration_id: anyId, p_expected_version: 1 }, // phase 4 (S)
    testing_add_private_student: { p_event_id: anyId, p_first: 'A', p_last: 'B', p_event_rank_id: anyId, p_stripes: true, p_paying_by: 'cash', p_private_date: '2026-12-01', p_private_time: '16:00' }, // phase 4 (S)
  };
  assert.deepEqual(Object.keys(sample).sort(), [...EVENT_RPC_NAMES].sort());
  // testing_restore_student checks who inside (staff: their own "keep one" for 10 seconds).
  const adminOnly = ['testing_add_event', 'testing_update_event', 'testing_delete_event', 'testing_edit_payment', 'testing_withdraw_student', 'testing_delete_student', 'settings_update_school_address'];
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
  assert.equal(regs.length, 16); // incl. the withdrawn one and the duplicate copy
  assert.equal(del(14, 41000), 'stale');
  assert.equal(del(16, 0), 'stale');
  assert.equal(evStatus('testing_delete_event', { p_event_id: nov.id, p_expected_version: 1, p_expected_registration_count: 16, p_expected_payment_total_cents: 41000 }), 'stale'); // old version
  assert.equal(del(16, 41000), 'ok');
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
  assert.equal(walkIn.reference, 'CB-3117');
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
  assert.deepEqual([first.reference, first.first_name, first.class_name, first.early_cents, first.day_cents, first.testing_for.name], ['CB-3117', 'Ivy', 'Group A', 6500, 7500, 'Orange']);
  const count = evDb().registrations.length;
  assert.deepEqual(send({ submissionId: sid }), first);
  assert.equal(evDb().registrations.length, count);
  const ivy = regBy('CB-3117');
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

// ======================= private testing rules (phase 4, contract 0014 §1, §4.1) =======================
// The contract's worked examples (§1.3 M1–M14) and the menu / list rules, on eventRules.js alone.

const P4_DAY = '2026-11-20'; // the testing day of the examples (a Friday)
const RANK_A = { earlyCents: 6500, dayCents: 7500, privateCents: 8500 }; // Group A Yellow
const RANK_B = { earlyCents: 7000, dayCents: 8000, privateCents: 9500 }; // Group B Blue

check('private rules: the time list and the time check (v0.157)', () => {
  assert.equal(PRIVATE_TIME_CHOICES.length, 193);
  assert.equal(PRIVATE_TIME_CHOICES[0], '06:00');
  assert.equal(PRIVATE_TIME_CHOICES[1], '06:05');
  assert.equal(PRIVATE_TIME_CHOICES[192], '22:00');
  assert.ok(PRIVATE_TIME_CHOICES.includes('16:00'));
  for (const ok of ['06:00', '22:00', '16:00', '16:05', '16:00:00', '21:55']) assert.equal(privateTimeIsValid(ok), true, ok);
  for (const bad of ['05:55', '22:05', '16:03', '16:00:30', '6:00', '24:00', '', null, undefined, 1600, '16:00:00.5', ' 16:00']) {
    assert.equal(privateTimeIsValid(bad), false, String(bad));
  }
});

check('private rules: the day limit (Postgres + 1 year) and the day problems', () => {
  assert.equal(privateDayLimit('2026-11-20'), '2027-11-20');
  assert.equal(privateDayLimit('2028-02-29'), '2029-02-28'); // a leap day → Feb 28, as Postgres
  assert.equal(privateDayLimit('2027-02-28'), '2028-02-28');
  assert.equal(privateDayLimit('2026-02-30'), null);
  assert.equal(privateDayLimit(null), null);
  const today = '2026-10-17';
  assert.equal(privateDayProblem('', today, P4_DAY), 'missing');
  assert.equal(privateDayProblem(null, today, P4_DAY), 'missing');
  assert.equal(privateDayProblem('2026-12-3', today, P4_DAY), 'missing'); // half typed
  assert.equal(privateDayProblem('2026-02-30', today, P4_DAY), 'missing');
  assert.equal(privateDayProblem('2026-10-16', today, P4_DAY), 'past');
  assert.equal(privateDayProblem(today, today, P4_DAY), null); // today is fine
  assert.equal(privateDayProblem('2026-11-01', today, P4_DAY), null); // before the testing day
  assert.equal(privateDayProblem(P4_DAY, today, P4_DAY), null); // the testing day itself (Q4)
  assert.equal(privateDayProblem('2027-11-20', today, P4_DAY), null); // exactly a year after
  assert.equal(privateDayProblem('2027-11-21', today, P4_DAY), 'tooFar');
});

check('private rules: isPrivate, gradingDay, priceFor', () => {
  assert.equal(isPrivate({ privateDate: '2026-12-01' }), true);
  assert.equal(isPrivate({ private_date: '2026-12-01' }), true);
  assert.equal(isPrivate({ privateDate: null }), false);
  assert.equal(isPrivate({}), false);
  assert.equal(isPrivate(null), false);
  assert.equal(gradingDay({ privateDate: '2026-12-01' }, P4_DAY), '2026-12-01');
  assert.equal(gradingDay({ privateDate: null }, P4_DAY), P4_DAY);
  assert.equal(gradingWindow('2026-11-30', gradingDay({ privateDate: '2026-12-01' }, P4_DAY)), 'before');
  assert.equal(priceFor({ rank: RANK_A, privateDate: '2026-12-01', today: '2026-10-17', testingDate: P4_DAY }), 8500);
  assert.equal(priceFor({ rank: RANK_A, privateDate: null, today: '2026-11-19', testingDate: P4_DAY }), 6500);
  assert.equal(priceFor({ rank: RANK_A, privateDate: null, today: P4_DAY, testingDate: P4_DAY }), 7500);
  assert.equal(priceFor({ rank: { private_cents: 9500 }, privateDate: '2026-12-01', today: '2026-10-17', testingDate: P4_DAY }), 9500); // database spelling
});

check('private rules: amountDue = every worked example M1–M14 (§1.3)', () => {
  const due = (rank, privateDate, paidCents, today) => amountDue({ rank, privateDate, paidCents, today, testingDate: P4_DAY });
  const PRIV = '2026-12-01';
  // M1 regular, not paid: by the day they pay.
  assert.equal(due(RANK_A, null, 0, '2026-11-10'), 6500);
  assert.equal(due(RANK_A, null, 0, '2026-11-20'), 7500);
  assert.equal(due(RANK_A, null, 0, '2026-11-21'), 7500);
  // M2 private, not paid, any day.
  for (const day of ['2026-11-10', '2026-11-20', '2026-12-01']) assert.equal(due(RANK_A, PRIV, 0, day), 8500);
  // M3 paid $65, then private → $20 more; after the $20 → nothing.
  assert.equal(due(RANK_A, PRIV, 6500, '2026-11-10'), 2000);
  assert.equal(due(RANK_A, PRIV, 8500, '2026-11-10'), 0);
  // M4 the $20 undone (net back to 6500) → $20 again.
  assert.equal(due(RANK_A, PRIV, 8500 - 2000, '2026-11-10'), 2000);
  // M5 private paid $85, then Back → not private, paid → 0.
  assert.equal(due(RANK_A, null, 8500, '2026-11-10'), 0);
  // M6 paid $65, private (owes $20), then Back → 0 (partial accepted, L2).
  assert.equal(due(RANK_A, null, 6500, '2026-11-10'), 0);
  // M7 private, not paid, Back on Nov 21 → regular, testing-day price.
  assert.equal(due(RANK_A, null, 0, '2026-11-21'), 7500);
  // M8 private paid $85, belt corrected to Group B Blue ($95) → $10.
  assert.equal(due(RANK_B, PRIV, 8500, '2026-11-10'), 1000);
  // M9 corrected to a rank with private $80 → 0 (no refund).
  assert.equal(due({ ...RANK_A, privateCents: 8000 }, PRIV, 8500, '2026-11-10'), 0);
  // M10 regular, paid $65, pricier rank → 0 (v0.136).
  assert.equal(due(RANK_B, null, 6500, '2026-11-10'), 0);
  // M11 private price $0, not paid → 0 (nothing to collect); a regular $0 rank too.
  assert.equal(due({ ...RANK_A, privateCents: 0 }, PRIV, 0, '2026-11-10'), 0);
  assert.equal(due({ earlyCents: 0, dayCents: 0, privateCents: 0 }, null, 0, '2026-11-10'), 0);
  // M12 topped up ($65 + $20), the $20 edited to $10 (reversal −2000, new 1000) → $10.
  assert.equal(due(RANK_A, PRIV, 6500 + 2000 - 2000 + 1000, '2026-11-12'), 1000);
  // M13 topped up, admin Undo of the $20 → $20.
  assert.equal(due(RANK_A, PRIV, 6500 + 2000 - 2000, '2026-11-12'), 2000);
  // M14 owes $20 whatever the method (the method is the database's part, replayed below).
  assert.equal(due(RANK_A, PRIV, 6500, '2026-11-12'), 2000);
  // Never negative, never a fraction; a missing paid amount counts as 0.
  assert.equal(due(RANK_A, PRIV, 20000, '2026-11-12'), 0);
  assert.equal(due(RANK_A, PRIV, undefined, '2026-11-12'), 8500);
  assert.equal(due(RANK_A, null, -6500, '2026-11-12'), 6500); // (net can't be negative; read as not paid)
});

check('private rules: owesMore, showMarkPaid, canChangePayingBy (P4, Q3)', () => {
  const row = (paid, amountDueCents, status = 'active') => ({ paid, amountDueCents, status });
  assert.equal(owesMore(row(true, 2000)), true);
  assert.equal(owesMore(row(true, 0)), false);
  assert.equal(owesMore(row(false, 8500)), false); // not paid at all isn't "owes more"
  assert.equal(showMarkPaid(row(false, 8500)), true);
  assert.equal(showMarkPaid(row(true, 2000)), true); // next to the Paid tag (P4)
  assert.equal(showMarkPaid(row(true, 0)), false);
  assert.equal(showMarkPaid(row(false, 0)), false); // a $0 price: nothing to collect (§10 point 3)
  assert.equal(showMarkPaid(row(false, 8500, 'withdrawn')), false);
  assert.equal(canChangePayingBy(row(false, 0)), true);
  assert.equal(canChangePayingBy(row(true, 2000)), true);
  assert.equal(canChangePayingBy(row(true, 0)), false);
  assert.equal(canChangePayingBy(row(false, 6500, 'withdrawn')), false);
});

check('private rules: the ⋯ menu truth table (P2, P5, H1, Q5)', () => {
  const before = { today: '2026-11-19', testingDate: P4_DAY, isAdmin: false };
  const onDay = { today: P4_DAY, testingDate: P4_DAY, isAdmin: false };
  const afterStaff = { today: '2026-11-21', testingDate: P4_DAY, isAdmin: false };
  const afterAdmin = { ...afterStaff, isAdmin: true };
  const row = (isPrivate, result = null, note = null, status = 'active') => ({ status, isPrivate, result, note, graded: isGraded({ result, note }) });
  const menu = (r, when) => {
    const m = privateMenu(r, when);
    return [m.canSet, m.canChange, m.canBack, m.canGrade].map((b) => (b ? 1 : 0)).join('');
  };
  // Regular students: Set private unless graded (a testing-day No show may be set private).
  assert.equal(menu(row(false), before), '1000');
  assert.equal(menu(row(false), afterStaff), '1000'); // Q3: also after the testing day, all staff
  assert.equal(menu(row(false, 'no_show'), afterStaff), '1000');
  assert.equal(menu(row(false, 'no_show', 'Sick'), afterStaff), '1000');
  assert.equal(menu(row(false, 'pass'), onDay), '0000');
  assert.equal(menu(row(false, 'not_passed'), onDay), '0000');
  assert.equal(menu(row(false, null, 'Note only'), onDay), '0000'); // a testing-day note blocks (has_result)
  // Private, nothing recorded: Change, Back (staff until the testing day), Grade.
  assert.equal(menu(row(true), before), '0111');
  assert.equal(menu(row(true), onDay), '0111');
  assert.equal(menu(row(true), afterStaff), '0101'); // H1: Back hidden for staff
  assert.equal(menu(row(true), afterAdmin), '0111');
  // A note alone doesn't count for the private paths (Q5).
  assert.equal(menu(row(true, null, 'Bring gear'), before), '0111');
  // A private No show: Change (a new day clears it, H2), no Back.
  assert.equal(menu(row(true, 'no_show'), before), '0101');
  assert.equal(menu(row(true, 'no_show'), afterAdmin), '0101');
  // A private result: only Grade (to see / fix it).
  assert.equal(menu(row(true, 'pass'), afterAdmin), '0001');
  assert.equal(menu(row(true, 'not_passed'), before), '0001');
  // Withdrawn: nothing.
  assert.equal(menu(row(false, null, null, 'withdrawn'), before), '0000');
  assert.equal(menu(row(true, null, null, 'withdrawn'), afterAdmin), '0000');
});

check('private rules: livePayments (oldest first, reversed ones out)', () => {
  const payments = [
    { id: 'p3', registrationId: 'r1', kind: 'payment', amountCents: 2000, recordedAt: '2026-11-12T17:00:00.000Z', reversesPaymentId: null },
    { id: 'p1', registrationId: 'r1', kind: 'payment', amountCents: 6500, recordedAt: '2026-11-02T17:00:00.000Z', reversesPaymentId: null },
    { id: 'p2', registrationId: 'r1', kind: 'payment', amountCents: 500, recordedAt: '2026-11-05T17:00:00.000Z', reversesPaymentId: null },
    { id: 'x2', registrationId: 'r1', kind: 'reversal', amountCents: -500, recordedAt: '2026-11-05T17:00:05.000Z', reversesPaymentId: 'p2' },
    { id: 'q1', registrationId: 'r2', kind: 'payment', amountCents: 7000, recordedAt: '2026-11-01T17:00:00.000Z', reversesPaymentId: null },
  ];
  assert.deepEqual(livePayments(payments, 'r1').map((p) => p.id), ['p1', 'p3']);
  assert.deepEqual(livePayments(payments, 'r2').map((p) => p.id), ['q1']);
  assert.deepEqual(livePayments(payments, 'r9'), []);
  assert.deepEqual(livePayments(null, 'r1'), []);
  // The database spelling works too.
  assert.deepEqual(livePayments([{ id: 'a', registration_id: 'r1', kind: 'payment', recorded_at: 'x', reverses_payment_id: null }], 'r1').map((p) => p.id), ['a']);
});

check('private rules: the Private testings list (P8, v0.228, Q5)', () => {
  const r = (firstName, lastName, privateDate, privateTime, result = null, status = 'active', note = null) => ({ firstName, lastName, privateDate, privateTime, result, status, note });
  const rows = [
    r('Ava', 'chen', '2026-12-01', '16:00'),
    r('Ben', 'Adams', '2026-12-01', '16:00'),
    r('Cal', 'Adams', '2026-12-01', '16:00'),
    r('Dee', 'Zane', '2026-12-01', '09:30'),
    r('Eve', 'Old', '2026-10-01', '17:00'), // a past day, still ungraded → stays
    r('Fay', 'Passed', '2026-11-25', '16:00', 'pass'), // graded → out
    r('Gus', 'NoShow', '2026-11-25', '16:00', 'no_show'), // a No show is a result → out
    r('Hal', 'Gone', '2026-11-25', '16:00', null, 'withdrawn'), // withdrawn → out
    r('Ivy', 'Note', '2026-11-26', '16:00', null, 'active', 'Bring gear'), // a note alone → stays
    r('Jo', 'Regular', null, null), // not private → out
  ];
  assert.deepEqual(privateTestingsList(rows).map((x) => x.firstName), ['Eve', 'Ivy', 'Dee', 'Ben', 'Cal', 'Ava']);
  assert.deepEqual(privateTestingsList([]), []);
  assert.deepEqual(privateTestingsList(null), []);
  const input = [rows[0], rows[1]];
  privateTestingsList(input);
  assert.equal(input[0].firstName, 'Ava'); // the input list isn't re-ordered
});

// ======================= the private part of the preview database (0014 §2, §4.3) =======================
// Replays of the database tests V3–V20 that need no real sign-in sessions. After every call the
// preview's own copy of testing_amount_due must equal eventRules.amountDue for EVERY registration.

const P4_TODAY = '2026-10-17'; // "today" of the default preview data (before the testing day)
const p4Start = (date = P4_TODAY) => {
  evReset();
  ev.reset();
  evToday = date;
  evClock = Date.parse(`${date}T21:00:00Z`);
};
const moveToday = (date) => {
  evToday = date;
  evClock = Date.parse(`${date}T21:00:00Z`);
};
// Change the stored data directly — what the database tests do "as postgres".
const asPostgres = (fn) => fn(evMemory);
const memReg = (ref) => evMemory.registrations.find((r) => r.reference === ref);
const netOf = (ref) => evDb().payments.filter((p) => p.registration_id === regBy(ref).id).reduce((t, p) => t + p.amount_cents, 0);
const logRows = () => evDb().change_log;
function assertDueSame() {
  const d = evDb();
  for (const reg of d.registrations) {
    const event = d.events.find((e) => e.id === reg.event_id);
    const rank = d.event_ranks.find((x) => x.id === reg.event_rank_id);
    const net = d.payments.filter((p) => p.registration_id === reg.id).reduce((t, p) => t + p.amount_cents, 0);
    const expected = amountDue({ rank, privateDate: reg.private_date, paidCents: net, today: evToday, testingDate: event.testing_date });
    assert.equal(ev.amountDueFor(reg.id), expected, `due of ${reg.reference}`);
  }
}
const p4Call = (name, args, ctx = E_DESK) => {
  const answer = evCall(name, args, ctx);
  assertDueSame();
  return answer;
};
const setPriv = (ref, date, time = '16:00', ctx = E_DESK, over = {}) => p4Call('testing_set_private', {
  p_registration_id: regBy(ref).id, p_expected_version: regBy(ref).version, p_private_date: date, p_private_time: time, ...over,
}, ctx);
const clearPriv = (ref, ctx = E_DESK, over = {}) => p4Call('testing_clear_private', { p_registration_id: regBy(ref).id, p_expected_version: regBy(ref).version, ...over }, ctx);
const payNow = (ref, ctx = E_DESK) => p4Call('testing_mark_paid', { p_registration_id: regBy(ref).id, p_expected_version: regBy(ref).version }, ctx);
const addPriv = (over = {}, ctx = E_DESK) => p4Call('testing_add_private_student', {
  p_event_id: DEFAULT_EVENT_ID, p_first: 'Pia', p_last: 'Vale', p_event_rank_id: eventRankByName('Group A', 'Yellow').id, p_stripes: true,
  p_paying_by: 'cash', p_private_date: '2026-12-01', p_private_time: '16:00', ...over,
}, ctx);

check('private mock: columns, grants, the time type, restricted helpers (V1, V2 without sessions)', () => {
  p4Start();
  const sel = (table, columns) => ev.select(table, columns, [{ col: 'reference', value: 'CB-3112' }], [], E_ADMIN);
  assert.deepEqual(ev.select('testing_registrations', 'id, private_date, private_time', [{ col: 'id', value: regBy('CB-3112').id }], [], E_ADMIN).data,
    [{ id: regBy('CB-3112').id, private_date: null, private_time: null }]);
  assert.equal(sel('testing_roster', 'private_date').error.code, '42703'); // the view is unchanged (M1)
  assert.equal(sel('testing_roster', 'private_time').error.code, '42703');
  assert.equal(ev.select('testing_registrations', 'private_date', [], [], E_ANON).error.code, '42501');
  assert.deepEqual(ev.select('testing_registrations', 'private_date', [], [], E_LOCKED).data, []); // RLS
  for (const name of ['testing_amount_due', 'testing_private_time_is_valid']) {
    assert.ok(EVENT_RESTRICTED_RPC_NAMES.includes(name));
    assert.equal(ev.rpc(name, { p_registration_id: regBy('CB-3112').id }, E_ADMIN).error.code, '42501', name);
  }
  for (const name of ['testing_set_private', 'testing_clear_private', 'testing_add_private_student']) {
    assert.ok(EVENT_RPC_NAMES.includes(name));
    assert.equal(EVENT_ADMIN_ONLY_RPCS.has(name), false, name); // staff and admins
  }
  // The time type: '16:00' and '16:00:30' are times (the function then checks the rule); 'x' isn't.
  const bad = (time) => ev.rpc('testing_set_private', { p_registration_id: regBy('CB-3112').id, p_expected_version: 99, p_private_date: '2026-12-01', p_private_time: time }, E_DESK).error?.code;
  assert.equal(bad('x'), '22007');
  assert.equal(bad('25:00'), '22007');
  assert.equal(bad(1600), '22007');
  assert.equal(bad('16:00'), undefined); // a time: reaches the function (stale here — nothing is written)
  assert.equal(ev.rpc('testing_set_private', { p_registration_id: regBy('CB-3112').id, p_expected_version: 1, p_private_date: '2026-12-01' }, E_DESK).error.code, 'PGRST202'); // missing argument
  assert.deepEqual(logRows(), []);
});

check('private mock: day and time input, staff and admin (V3)', () => {
  for (const ctx of [E_DESK, E_ADMIN]) {
    p4Start();
    const z = regBy('CB-3112').id;
    const raw = (date, time, version = regBy('CB-3112').version) => p4Call('testing_set_private', { p_registration_id: z, p_expected_version: version, p_private_date: date, p_private_time: time }, ctx).status;
    assert.equal(raw(null, '16:00'), 'invalid');
    assert.equal(raw('2026-12-01', null), 'invalid');
    assert.equal(raw('2026-12-01', '16:00', null), 'invalid');
    for (const time of ['05:55', '22:05', '16:03', '16:00:30']) assert.equal(raw('2026-12-01', time), 'invalid', time);
    assert.equal(regBy('CB-3112').version, 1); // refusals write nothing
    assert.equal(raw('2026-10-16', '16:00'), 'past_day'); // yesterday
    assert.equal(raw('2027-11-21', '16:00'), 'invalid'); // testing day + 1 year + 1 day
    const okCases = [['2026-12-01', '06:00'], ['2026-12-01', '22:00'], [P4_TODAY, '16:00'], ['2026-11-20', '16:00'], ['2026-11-01', '16:00'], ['2027-11-20', '16:00']];
    let version = 1;
    for (const [date, time] of okCases) {
      const answer = setPriv('CB-3112', date, time, ctx);
      version += 1;
      assert.deepEqual(answer, { status: 'ok', version, private_date: date, private_time: time, amount_due_cents: 8500, result_cleared: false }, `${date} ${time}`);
      assert.deepEqual([memReg('CB-3112').private_date, memReg('CB-3112').private_time], [date, `${time}:00`]);
    }
    assert.equal(setPriv('CB-3112', '2026-12-01', '16:00:00', ctx).private_time, '16:00'); // seconds 00 are fine
    assert.deepEqual(logRows().map((x) => x.action), ['set_private', ...Array(okCases.length).fill('change_private')]);
  }
});

check('private mock: stale, withdrawn, not found, and an unchanged Change writes nothing (V4)', () => {
  p4Start();
  const missing = '00000000-0000-4000-8000-00000000abcd';
  assert.equal(setPriv('CB-3112', '2026-12-01', '16:00', E_DESK, { p_expected_version: 9 }).status, 'stale');
  assert.equal(clearPriv('CB-3112', E_DESK, { p_expected_version: 9 }).status, 'stale');
  assert.equal(setPriv('CB-3116', '2026-12-01').status, 'withdrawn'); // Leo is withdrawn
  assert.equal(clearPriv('CB-3116').status, 'withdrawn');
  assert.equal(p4Call('testing_set_private', { p_registration_id: missing, p_expected_version: 1, p_private_date: '2026-12-01', p_private_time: '16:00' }).status, 'not_found');
  assert.equal(p4Call('testing_clear_private', { p_registration_id: missing, p_expected_version: 1 }).status, 'not_found');
  assert.equal(p4Call('testing_clear_private', { p_registration_id: null, p_expected_version: 1 }).status, 'invalid');
  // Clear on a student who isn't private: ok, nothing written (0014 §10 point 7).
  const before = JSON.stringify(evDb());
  assert.deepEqual(clearPriv('CB-3112'), { status: 'ok', version: 1, amount_due_cents: 6500 });
  assert.equal(JSON.stringify(evDb()), before);
  // Set, then the same day and time again: ok, same version, nothing logged.
  assert.equal(setPriv('CB-3112', '2026-12-01', '16:00').version, 2);
  const same = JSON.stringify(evDb());
  assert.deepEqual(setPriv('CB-3112', '2026-12-01', '16:00'), { status: 'ok', version: 2, private_date: '2026-12-01', private_time: '16:00', amount_due_cents: 8500, result_cleared: false });
  assert.equal(JSON.stringify(evDb()), same);
  assert.equal(logRows().length, 1);
  // Only the time changes → a real change.
  assert.equal(setPriv('CB-3112', '2026-12-01', '16:30').version, 3);
});

check('private mock: Add student with Tests privately (V5)', () => {
  p4Start();
  const count = () => evDb().registrations.length;
  const n = count();
  const yellow = eventRankByName('Group A', 'Yellow');
  const answer = addPriv();
  assert.equal(answer.status, 'ok');
  assert.deepEqual({ ...answer, id: 'x', reference: 'x' }, { status: 'ok', id: 'x', reference: 'x', version: 1, private_date: '2026-12-01', private_time: '16:00', amount_due_cents: yellow.private_cents });
  assert.equal(yellow.private_cents, 8500);
  const reg = evDb().registrations.find((r) => r.id === answer.id);
  assert.deepEqual([reg.private_date, reg.private_time, reg.version, reg.source, reg.status], ['2026-12-01', '16:00:00', 1, 'staff', 'active']);
  assert.match(answer.reference, /^CB-\d+$/);
  assert.deepEqual(logRows().map((x) => [x.action, x.table_name, x.op, x.row_id]), [['add_student', 'testing_registrations', 'insert', answer.id]]);
  // Refusals insert nothing and log nothing.
  assert.equal(addPriv({ p_private_time: '16:03' }).status, 'invalid');
  assert.equal(addPriv({ p_private_time: null }).status, 'invalid');
  assert.equal(addPriv({ p_private_date: null }).status, 'invalid');
  assert.equal(addPriv({ p_private_date: '2026-10-16' }).status, 'past_day');
  assert.equal(addPriv({ p_private_date: '2027-11-21' }).status, 'invalid');
  assert.equal(addPriv({ p_stripes: false }).status, 'invalid');
  assert.equal(addPriv({ p_event_id: '00000000-0000-4000-8000-00000000abcd' }).status, 'not_found');
  assert.equal(count(), n + 1);
  assert.equal(logRows().length, 1);
  // After the testing day (E_after): staff → finished, admins may (v0.191).
  moveToday('2026-11-21');
  assert.equal(addPriv({ p_first: 'Late', p_private_date: '2026-11-21' }, E_DESK).status, 'finished');
  assert.equal(addPriv({ p_first: 'Late', p_private_date: '2026-11-21' }, E_ADMIN).status, 'ok');
  assert.equal(count(), n + 2);
});

check('private mock: the price, the top-up, Undo and Edit payment (V6, V7, M2, M3, M4, M12, M13, M14)', () => {
  p4Start();
  // V6 / M2: a private student who hasn't paid pays the private price, then nothing more.
  setPriv('CB-3110', '2026-12-01'); // Sam, Group A Orange
  const sam = payNow('CB-3110');
  assert.equal(sam.amount_cents, 8500);
  assert.equal(sam.method, 'cash');
  assert.equal(payNow('CB-3110').status, 'already_paid');
  // Regular unchanged: early before the testing day, testing-day price on it.
  assert.equal(payNow('CB-3114').amount_cents, 7500); // Chloe, Group C Brown early $75
  moveToday('2026-11-20');
  assert.equal(payNow('CB-3113').amount_cents, 8000); // Maya, Group B Purple day $80
  // V7 / M3: Zoe paid $65 (check) before going private → $20 more.
  p4Start();
  assert.equal(payNow('CB-3112').amount_cents, 6500);
  const set = setPriv('CB-3112', '2026-12-01');
  assert.equal(set.amount_due_cents, 2000);
  assert.equal(evDb().registrations.find((r) => r.reference === 'CB-3112').paying_by, 'check');
  const topUp = payNow('CB-3112');
  assert.deepEqual([topUp.status, topUp.amount_cents, topUp.method], ['ok', 2000, 'check']);
  assert.equal(payNow('CB-3112').status, 'already_paid');
  assert.equal(netOf('CB-3112'), 8500);
  // M4: the desk's own Undo of the $20 within 10 seconds → $20 due again → pay → nothing more.
  evClock += 3000;
  assert.equal(p4Call('testing_undo_payment', { p_payment_id: topUp.payment_id }, E_DESK).status, 'ok');
  assert.equal(ev.amountDueFor(regBy('CB-3112').id), 2000);
  const again = payNow('CB-3112');
  assert.equal(again.amount_cents, 2000);
  assert.equal(payNow('CB-3112').status, 'already_paid');
  // M12: an admin edits the most recent payment ($20) to $10 → $10 due.
  assert.equal(p4Call('testing_edit_payment', { p_payment_id: again.payment_id, p_method: 'check', p_amount_cents: 1000, p_paid_on: evToday }, E_ADMIN).status, 'ok');
  assert.equal(ev.amountDueFor(regBy('CB-3112').id), 1000);
  // M13: an admin Undo of the most recent live payment ($10) → $20 due.
  const live = evDb().payments.filter((p) => p.registration_id === regBy('CB-3112').id && p.kind === 'payment' && !evDb().payments.some((x) => x.reverses_payment_id === p.id));
  const newest = live.sort((a, b) => (a.recorded_at < b.recorded_at ? -1 : 1)).at(-1);
  assert.equal(newest.amount_cents, 1000);
  assert.equal(p4Call('testing_undo_payment', { p_payment_id: newest.id }, E_ADMIN).status, 'ok');
  assert.equal(ev.amountDueFor(regBy('CB-3112').id), 2000);
  // M14 / V10: while owing, the desk changes check → card; the top-up is card, the $65 stays check.
  assert.equal(p4Call('testing_change_paying_by', { p_registration_id: regBy('CB-3112').id, p_expected_version: regBy('CB-3112').version, p_paying_by: 'card' }).status, 'ok');
  const card = payNow('CB-3112');
  assert.deepEqual([card.amount_cents, card.method], [2000, 'card']);
  const first = evDb().payments.find((p) => p.registration_id === regBy('CB-3112').id && p.amount_cents === 6500);
  assert.equal(first.method, 'check');
  // Fully paid → Change how they'll pay is refused again.
  assert.equal(p4Call('testing_change_paying_by', { p_registration_id: regBy('CB-3112').id, p_expected_version: regBy('CB-3112').version, p_paying_by: 'cash' }).status, 'already_paid');
  // A regular paid student: refused, as before (v0.136).
  assert.equal(p4Call('testing_change_paying_by', { p_registration_id: regBy('CB-3111').id, p_expected_version: regBy('CB-3111').version, p_paying_by: 'cash' }).status, 'already_paid');
  // The roster still says Paid while a top-up is owed (paid = net > 0).
  p4Start();
  payNow('CB-3112');
  setPriv('CB-3112', '2026-12-01');
  const view = rosterOf(DEFAULT_EVENT_ID).find((r) => r.reference === 'CB-3112');
  assert.deepEqual([view.paid, view.paid_cents], [true, 6500]);
});

check('private mock: a $0 private price inserts nothing (V8, M11, L1)', () => {
  p4Start();
  asPostgres((s) => { s.event_ranks.find((r) => r.id === regBy('CB-3110').event_rank_id).private_cents = 0; });
  assert.equal(setPriv('CB-3110', '2026-12-01').amount_due_cents, 0);
  const payments = evDb().payments.length;
  const version = regBy('CB-3110').version;
  assert.equal(payNow('CB-3110').status, 'already_paid');
  assert.equal(evDb().payments.length, payments);
  assert.equal(regBy('CB-3110').version, version);
  // A regular $0 rank too (0005 answered 'invalid'; 0014 answers already_paid, §10 point 3).
  asPostgres((s) => { const r = s.event_ranks.find((x) => x.id === regBy('CB-3114').event_rank_id); r.early_cents = 0; r.day_cents = 0; });
  assert.equal(payNow('CB-3114').status, 'already_paid');
  assert.equal(evDb().payments.length, payments);
});

check('private mock: Back after paying, and M7 as an admin (V9, M5, M6, M7)', () => {
  p4Start();
  // M5: private, paid $85, Back → nothing owed.
  setPriv('CB-3110', '2026-12-01');
  payNow('CB-3110');
  const back = clearPriv('CB-3110');
  assert.deepEqual(back, { status: 'ok', version: regBy('CB-3110').version, amount_due_cents: 0 });
  assert.equal(payNow('CB-3110').status, 'already_paid');
  // M6: paid $65, private (owes $20), Back → nothing owed (partial accepted, L2).
  payNow('CB-3112');
  assert.equal(setPriv('CB-3112', '2026-12-01').amount_due_cents, 2000);
  assert.equal(clearPriv('CB-3112').amount_due_cents, 0);
  assert.equal(payNow('CB-3112').status, 'already_paid');
  // M7: private, not paid, Back on Nov 21 (staff can't then — H1 — so an admin) → $75.
  setPriv('CB-3114', '2026-12-01');
  moveToday('2026-11-21');
  assert.equal(clearPriv('CB-3114', E_DESK).status, 'not_allowed');
  assert.equal(clearPriv('CB-3114', E_ADMIN).amount_due_cents, 8500); // Group C Brown, day $85
  assert.equal(payNow('CB-3114').amount_cents, 8500);
  // The same for a Group A student: $75.
  p4Start();
  setPriv('CB-3110', '2026-12-01');
  moveToday('2026-11-21');
  assert.equal(clearPriv('CB-3110', E_ADMIN).amount_due_cents, 7500);
  assert.equal(payNow('CB-3110').amount_cents, 7500);
});

check('private mock: a testing-day No show is cleared by Set private, other results refuse (V11)', () => {
  p4Start('2026-11-20');
  setRes('CB-3110', 'no_show');
  setNote('CB-3110', 'Was sick');
  setRes('CB-3112', 'pass');
  setRes('CB-3113', 'not_passed');
  setNote('CB-3114', 'Note only');
  moveToday('2026-11-21'); // E_after: staff may still set an ungraded / No show student private (Q3)
  const answer = setPriv('CB-3110', '2026-11-21', '16:00', E_DESK);
  assert.equal(answer.status, 'ok');
  assert.equal(answer.result_cleared, true);
  assert.equal(resultFor('CB-3110'), null); // the No show AND its note are gone
  const rows = logRows().filter((x) => x.row_id === regBy('CB-3110').id);
  assert.deepEqual(rows.map((x) => [x.action, x.table_name, x.op]), [['set_private', 'testing_registrations', 'update'], ['clear_result', 'testing_results', 'delete']]);
  assert.equal(rows[0].batch_id, rows[1].batch_id);
  assert.ok(rows[0].batch_id);
  for (const ref of ['CB-3112', 'CB-3113', 'CB-3114']) {
    const version = regBy(ref).version;
    assert.equal(setPriv(ref, '2026-11-21', '16:00', E_DESK).status, 'has_result', ref);
    assert.equal(setPriv(ref, '2026-11-21', '16:00', E_ADMIN).status, 'has_result', ref); // admins too
    assert.equal(regBy(ref).version, version);
  }
  // An ungraded student after the testing day: all staff (Q3).
  assert.equal(setPriv('CB-3101', '2026-11-21', '16:00', E_DESK).status, 'ok');
});

check('private mock: a private No show — Back refused, same day writes nothing, new day clears it (V12, H2)', () => {
  p4Start();
  setPriv('CB-3112', P4_TODAY, '16:00'); // private day = today
  assert.equal(setRes('CB-3112', 'no_show').status, 'ok');
  setNote('CB-3112', 'Called in sick');
  assert.equal(clearPriv('CB-3112').status, 'graded');
  assert.equal(clearPriv('CB-3112', E_ADMIN).status, 'graded');
  // The same day and time on the private No show: ok, nothing removed, nothing written.
  const version = regBy('CB-3112').version;
  const logs = logRows().length;
  assert.deepEqual(setPriv('CB-3112', P4_TODAY, '16:00'), { status: 'ok', version, private_date: P4_TODAY, private_time: '16:00', amount_due_cents: 8500, result_cleared: false });
  assert.equal(resultFor('CB-3112').result, 'no_show');
  assert.equal(regBy('CB-3112').version, version);
  assert.equal(logRows().length, logs);
  // A new day: ok, the No show and its note are cleared, change_private + clear_result in one batch.
  const moved = setPriv('CB-3112', '2026-10-24', '16:00');
  assert.deepEqual([moved.status, moved.result_cleared, moved.version], ['ok', true, version + 1]);
  assert.equal(resultFor('CB-3112'), null);
  const rows = logRows().slice(logs);
  assert.deepEqual(rows.map((x) => x.action), ['change_private', 'clear_result']);
  assert.equal(rows[0].batch_id, rows[1].batch_id);
});

check('private mock: a graded private student; a note alone never counts (V13, Q5)', () => {
  p4Start();
  setPriv('CB-3112', P4_TODAY, '16:00');
  setRes('CB-3112', 'pass');
  assert.equal(setPriv('CB-3112', '2026-10-24').status, 'graded');
  assert.equal(clearPriv('CB-3112').status, 'graded');
  setRes('CB-3112', 'not_passed');
  assert.equal(setPriv('CB-3112', '2026-10-24', '16:00', E_ADMIN).status, 'graded');
  // Note only: Change ok (note kept), Back ok (note kept).
  setPriv('CB-3110', P4_TODAY, '17:00');
  setNote('CB-3110', 'Bring sparring gear');
  const change = setPriv('CB-3110', '2026-10-24', '17:00');
  assert.deepEqual([change.status, change.result_cleared], ['ok', false]);
  assert.equal(resultFor('CB-3110').note, 'Bring sparring gear');
  assert.equal(clearPriv('CB-3110').status, 'ok');
  assert.equal(resultFor('CB-3110').note, 'Bring sparring gear');
  assert.equal(memReg('CB-3110').private_date, null);
});

check('private mock: Back after the testing day is for admins (V14, H1)', () => {
  p4Start();
  setPriv('CB-3112', '2026-12-01');
  setPriv('CB-3110', '2026-12-01');
  setPriv('CB-3114', '2026-12-01');
  moveToday('2026-11-21'); // E_after
  const before = JSON.stringify(evDb());
  assert.equal(clearPriv('CB-3112', E_DESK).status, 'not_allowed');
  assert.equal(JSON.stringify(evDb()), before);
  assert.equal(clearPriv('CB-3112', E_ADMIN).status, 'ok');
  moveToday('2026-11-20'); // E_day
  assert.equal(clearPriv('CB-3110', E_DESK).status, 'ok');
  moveToday('2026-11-19'); // E_before
  assert.equal(clearPriv('CB-3114', E_DESK).status, 'ok');
  assert.deepEqual(logRows().filter((x) => x.action === 'clear_private').map((x) => x.actor_name), ['Jeffrey Berg', 'Staff', 'Staff']);
});

check('private mock: grading counts from the student\'s own day (V15)', () => {
  p4Start();
  setPriv('CB-3112', '2026-11-21'); // the day after the testing day
  setPriv('CB-3110', '2026-11-20'); // the testing day itself (Q4)
  setPriv('CB-3114', '2026-11-19'); // will become "yesterday"
  moveToday('2026-11-20'); // E_day
  for (const ctx of [E_DESK, E_ADMIN]) {
    assert.equal(setRes('CB-3112', 'pass', ctx).status, 'not_open');
    assert.equal(setNote('CB-3112', 'x', ctx).status, 'not_open');
    assert.equal(setRes('CB-3110', 'pass', ctx).status, 'ok');
    assert.equal(setNote('CB-3110', 'Good', ctx).status, 'ok');
  }
  assert.equal(setRes('CB-3114', 'pass', E_DESK).status, 'finished'); // private day was yesterday
  assert.equal(setNote('CB-3114', 'x', E_DESK).status, 'finished');
  assert.equal(setRes('CB-3114', 'pass', E_ADMIN).status, 'ok');
  assert.equal(setNote('CB-3114', 'x', E_ADMIN).status, 'ok');
  assert.equal(setRes('CB-3113', 'pass', E_DESK).status, 'ok'); // a regular student, unchanged
  // A private day made "yesterday" as postgres, before the testing day.
  p4Start();
  setPriv('CB-3112', P4_TODAY);
  asPostgres(() => { memReg('CB-3112').private_date = '2026-10-16'; });
  assert.equal(setRes('CB-3112', 'pass', E_DESK).status, 'finished');
  assert.equal(setRes('CB-3112', 'pass', E_ADMIN).status, 'ok');
  assert.equal(setRes('CB-3113', 'pass', E_DESK).status, 'not_open'); // regular: before the testing day
});

check('private mock: Edit details re-prices a private student; the lock uses the own day (V16, Q2, M8–M10)', () => {
  p4Start();
  const blue = eventRankByName('Group B', 'Blue');
  const orange = eventRankByName('Group A', 'Orange');
  const edit = (ref, rankId, ctx = E_DESK) => {
    const r = regBy(ref);
    return p4Call('testing_update_student', { p_registration_id: r.id, p_expected_version: r.version, p_first: r.first_name, p_last: r.last_name, p_event_rank_id: rankId }, ctx);
  };
  // M8: private paid $85 → Group B Blue ($95) → $10 due; Mark paid records $10.
  setPriv('CB-3112', '2026-12-01');
  payNow('CB-3112');
  const up = edit('CB-3112', blue.id);
  assert.deepEqual(up, { status: 'ok', version: regBy('CB-3112').version, amount_due_cents: 1000 });
  assert.equal(payNow('CB-3112').amount_cents, 1000);
  // M9: to a rank with a private price of $80 → nothing due, no refund.
  asPostgres((s) => { s.event_ranks.find((r) => r.id === orange.id).private_cents = 8000; });
  const down = edit('CB-3112', orange.id);
  assert.equal(down.amount_due_cents, 0);
  assert.equal(payNow('CB-3112').status, 'already_paid');
  assert.equal(netOf('CB-3112'), 9500);
  // A name-only edit of a private student also says what is due.
  const r = regBy('CB-3112');
  assert.equal(p4Call('testing_update_student', { p_registration_id: r.id, p_expected_version: r.version, p_first: 'Zoey', p_last: r.last_name, p_event_rank_id: r.event_rank_id }).amount_due_cents, 0);
  // M10: a regular paid student → the answer is exactly as before (no extra keys).
  const regular = edit('CB-3107', blue.id); // Mia, paid $65
  assert.deepEqual(regular, { status: 'ok', version: regBy('CB-3107').version });
  assert.equal(payNow('CB-3107').status, 'already_paid');
  // The lock: a graded private student after their PRIVATE day (still before the testing day).
  p4Start();
  setPriv('CB-3110', P4_TODAY);
  setRes('CB-3110', 'pass');
  moveToday('2026-10-18');
  assert.equal(edit('CB-3110', blue.id, E_DESK).status, 'not_allowed');
  const admin = edit('CB-3110', blue.id, E_ADMIN);
  assert.deepEqual(admin, { status: 'ok', version: regBy('CB-3110').version, result_cleared: true, amount_due_cents: 9500 });
  assert.equal(resultFor('CB-3110'), null);
  // Graded on the private day itself: staff may still correct the belt.
  p4Start();
  setPriv('CB-3110', P4_TODAY);
  setRes('CB-3110', 'pass');
  assert.equal(edit('CB-3110', blue.id, E_DESK).result_cleared, true);
});

check('private mock: keep one and Restore lock from the private day (V17, H3)', () => {
  // Mia Lopez CB-3107 (kept) and CB-3109 (a possible copy) in the default data.
  p4Start();
  asPostgres(() => {
    Object.assign(memReg('CB-3109'), { private_date: '2026-10-16', private_time: '16:00:00' });
    evMemory.results.push({ registration_id: memReg('CB-3109').id, result: 'pass', note: null, updated_at: new Date(evClock).toISOString(), updated_by: null, updated_by_name: 'Staff' });
  });
  assert.equal(resolvePair('CB-3107', 'CB-3109', false, E_DESK), 'not_allowed');
  assert.equal(resolvePair('CB-3107', 'CB-3109', true, E_DESK), 'ok'); // keep both stays open
  p4Start();
  asPostgres(() => { Object.assign(memReg('CB-3109'), { private_date: '2026-10-16', private_time: '16:00:00' }); });
  assert.equal(resolvePair('CB-3107', 'CB-3109', false, E_ADMIN), 'ok');
  // Control: the private day is tomorrow → staff may keep one.
  p4Start();
  setPriv('CB-3109', '2026-10-18');
  assert.equal(resolvePair('CB-3107', 'CB-3109', false, E_DESK), 'ok');
  // Restore: then as postgres a result + the private day moved to yesterday → staff Undo refused.
  asPostgres(() => {
    memReg('CB-3109').private_date = '2026-10-16';
    evMemory.results.push({ registration_id: memReg('CB-3109').id, result: 'pass', note: null, updated_at: new Date(evClock).toISOString(), updated_by: null, updated_by_name: 'Staff' });
  });
  evClock += 2000; // still inside the 10 seconds
  assert.equal(restoreReg('CB-3109', E_DESK), 'not_allowed');
  assert.equal(restoreReg('CB-3109', E_ADMIN), 'ok');
  // Control: without the result, the desk's own Undo works.
  p4Start();
  setPriv('CB-3109', '2026-10-18');
  assert.equal(resolvePair('CB-3107', 'CB-3109', false, E_DESK), 'ok');
  assert.equal(restoreReg('CB-3109', E_DESK), 'ok');
});

check('private mock: Edit event ignores private results, not private notes (V18, M3)', () => {
  p4Start();
  setPriv('CB-3112', P4_TODAY);
  setRes('CB-3112', 'pass');
  assert.equal(editEventDate('2026-11-27').status, 'ok');
  setPriv('CB-3110', P4_TODAY);
  setNote('CB-3110', 'Note only'); // a private note-only row counts (that student can go Back)
  assert.equal(editEventDate('2026-11-28').status, 'has_results');
  setNote('CB-3110', null);
  assert.equal(editEventDate('2026-11-28').status, 'ok');
  asPostgres(() => {
    evMemory.results.push({ registration_id: memReg('CB-3113').id, result: 'pass', note: null, updated_at: new Date(evClock).toISOString(), updated_by: null, updated_by_name: 'Staff' });
  });
  assert.equal(editEventDate('2026-11-29').status, 'has_results'); // a regular student's result
  assert.equal(editEventDate('2026-11-28').status, 'ok'); // the same date: always fine
});

check('private mock: a private NOTE-only row alone still blocks a date change (M3 negative case)', () => {
  // The rule counts a results row when `private_date is null or result is null`: a private
  // student's note without a result counts (they can still go Back to the testing day).
  p4Start();
  setPriv('CB-3110', P4_TODAY);
  setNote('CB-3110', 'Bring sparring gear');
  assert.equal(evDb().results.length, 1); // the only results row of the event
  assert.equal(resultFor('CB-3110').result, null);
  const version = eventRow().version;
  assert.equal(editEventDate('2026-11-27').status, 'has_results');
  assert.equal(eventRow().testing_date, '2026-11-20'); // nothing changed
  assert.equal(eventRow().version, version);
  // Once that note gets a result, the row stops counting (a private result belongs to their own day).
  setRes('CB-3110', 'pass');
  assert.equal(editEventDate('2026-11-27').status, 'ok');
});

check('private mock: signatures wait for the later day (V19)', () => {
  p4Start();
  // As postgres: the event was 100 days ago; Ava (form, signed) had a private day 10 days ago.
  asPostgres(() => {
    evMemory.events[0].testing_date = addDays(P4_TODAY, -100);
    Object.assign(memReg('CB-3101'), { private_date: addDays(P4_TODAY, -10), private_time: '16:00:00' });
  });
  payNow('CB-3103', E_ADMIN); // Mark paid runs the clean-up as its last step
  const d = evDb();
  assert.notEqual(d.registrations.find((r) => r.reference === 'CB-3101').signature, null); // kept
  assert.equal(d.registrations.find((r) => r.reference === 'CB-3102').signature, null); // removed
  assert.ok(d.registrations.find((r) => r.reference === 'CB-3102').signature_deleted_at);
  // Once the private day is also more than 90 days ago, it goes too.
  asPostgres(() => { memReg('CB-3101').private_date = addDays(P4_TODAY, -91); });
  payNow('CB-3113', E_ADMIN);
  assert.equal(regBy('CB-3101').signature, null);
});

check('private mock: history — actions, batch ids, actor names, one version step each (V20)', () => {
  p4Start();
  const v = (ref) => regBy(ref).version;
  let before = v('CB-3112');
  payNow('CB-3112');
  assert.equal(v('CB-3112'), before + 1);
  before = v('CB-3112');
  setPriv('CB-3112', P4_TODAY);
  assert.equal(v('CB-3112'), before + 1);
  setPriv('CB-3112', '2026-10-24', '17:00', E_ADMIN);
  assert.equal(v('CB-3112'), before + 2);
  clearPriv('CB-3112');
  assert.equal(v('CB-3112'), before + 3);
  addPriv();
  setPriv('CB-3110', P4_TODAY);
  setRes('CB-3110', 'no_show');
  setPriv('CB-3110', '2026-10-24');
  const rows = logRows();
  const actions = new Set(rows.map((x) => x.action));
  for (const a of ['set_private', 'change_private', 'clear_private', 'add_student', 'clear_result', 'mark_paid']) assert.ok(actions.has(a), a);
  assert.ok(rows.every((x) => typeof x.batch_id === 'string' && x.batch_id.length > 0));
  assert.ok(rows.every((x) => x.actor_name === 'Staff' || x.actor_name === 'Jeffrey Berg'));
  assert.equal(rows.find((x) => x.action === 'change_private').actor_name, 'Jeffrey Berg');
  // One batch per call: only a cleared result shares its call's batch.
  const batches = new Map();
  for (const x of rows) batches.set(x.batch_id, [...(batches.get(x.batch_id) ?? []), x.action]);
  for (const list of batches.values()) assert.ok(list.length === 1 || (list.length === 2 && list[1] === 'clear_result'), list.join());
  assert.ok(!JSON.stringify(rows).includes('data:image')); // V21
});

check('private mock: a store saved before phase 4 keeps its events', () => {
  p4Start();
  const old = JSON.parse(JSON.stringify(evMemory));
  for (const reg of old.registrations) {
    delete reg.private_date;
    delete reg.private_time;
  }
  delete old.change_log;
  old.events[0].name = 'Kept event';
  evMemory = old;
  assert.equal(eventRow().name, 'Kept event');
  assert.ok(evDb().registrations.every((r) => r.private_date === null && r.private_time === null));
  assert.deepEqual(evDb().change_log, []);
  assertDueSame();
  assert.equal(setPriv('CB-3112', '2026-12-01').status, 'ok'); // and private testing works on it
  assert.equal(eventRow().name, 'Kept event');
  ev.reset();
  assert.ok(evDb().registrations.every((r) => r.private_date === null));
  assert.deepEqual(evDb().change_log, []);
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
    assert.equal(ok.reference, 'CB-3117');
    helpers.forceRateLimited(true);
    assert.deepEqual(await previewApi.register(code, body()), { status: 'rate_limited' });
    helpers.forceRateLimited(false);
    // The staff preview (same store) sees the registration.
    const store = JSON.parse(fakeStorage.get('tkd.preview.testing'));
    assert.equal(store.registrations.find((r) => r.reference === 'CB-3117').first_name, 'Ivy');
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
