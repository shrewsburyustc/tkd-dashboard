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
import { readFileSync } from 'node:fs';
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
  FORM_PAYING_BY, UNDO_WINDOW_MS, eventCounts, canPrintReceipt, rosterCounts, inCardFilter, dateSignedOf, ROSTER_ROOM, rosterLayoutFor, markPaidChoiceWhere,
} from './eventRules.js';
import { registrationLink, qrSvgDataUrl } from './qr.js';
import * as SHARED_QR from '../qr.js';
import * as TIMES from '../times.js'; // the shared time list's choices (CB12)
import {
  RESULTS, GRADING_NOTE_MAX, normalizeGradingNote, gradingNoteProblem, gradingWindow, canChangeResults, isGraded,
  resultCounts, schoolMinutesNow, defaultGradingClassId, addedAfterDay, testingGroups, groupOfClass,
} from './gradingRules.js';
import {
  createEventsBackend, defaultEventsData, EVENT_RPC_NAMES, EVENT_RESTRICTED_RPC_NAMES, EVENT_ADMIN_ONLY_RPCS, DEFAULT_EVENT_ID, DEFAULT_PUBLIC_CODE,
  EVENT_TABLES,
} from '../mockTestingEvents.js';
import * as PR from './privateRules.js'; // phase 4: the Private testing tab's rules
import { buildColorBeltReceipt, eventTotalDueCents, standingPayments } from './receipt.js'; // CB2
import { combineHistoryRows, describeHistoryRow, historyReader } from './history.js'; // CB7
import * as CSV from './resultsCsv.js'; // CB18: the results CSV's columns
import * as CSV_WRITER from '../star/csv.js'; // CB18: Star's CSV writer (quoting, formula guard), used as it is
import * as CBT from '../../screens/testing/text.js'; // the Private testing tab's new words (CB1, CB3)
const { payingByText } = CBT; // CB7's checks

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

// Since CB10 (rulebook v0.422, v1.106) the QR picture is the shared helper's (src/lib/qr.js); qr.js
// here only builds the link. The shared helper's own checks are in src/lib/shared/checks.mjs.
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
  // The same picture the shared Registration link box draws for the link (no drawing of its own).
  assert.equal(url, SHARED_QR.qrSvgDataUrl(registrationLink('p4w9tdkm')));
  // Download QR code's file name for a Color Belt event (one school per event).
  assert.equal(SHARED_QR.qrFileName('November Children Testing', 'Worcester'), 'November Children Testing - Worcester QR code.png');
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
// Migration 0035 removed the old one-click Mark paid (testing_mark_paid / testing_private_mark_paid,
// 2 arguments), and the preview with it. The checks written for it now call 0030's *_by version
// the way the old one worked: the family's "Paying by" as the way, and the amount the database
// works out (asked for first with 0 cents expected: that price_changed answer writes nothing).
// An ok answer keeps only the old keys, so the checks still compare exactly what they did.
const OLD_MARK_PAID_KEYS = ['status', 'payment_id', 'amount_cents', 'method', 'version'];
const oneClickPaid = (name, idKey, rowOf) => (args, ctx = E_ADMIN) => {
  const full = { ...args, p_method: rowOf(args[idKey])?.paying_by ?? 'cash', p_expected_cents: 0 };
  let answer = evCall(name, full, ctx);
  if (answer.status === 'price_changed') answer = evCall(name, { ...full, p_expected_cents: answer.amount_cents }, ctx);
  return answer.status === 'ok' ? Object.fromEntries(OLD_MARK_PAID_KEYS.map((k) => [k, answer[k]])) : answer;
};
const markPaid = oneClickPaid('testing_mark_paid_by', 'p_registration_id', (id) => ev.snapshot().registrations.find((r) => r.id === id));
const markPaidStatus = (args, ctx) => markPaid(args, ctx).status;
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
  assert.equal(ev.rpc('testing_mark_paid_by', { p_registration_id: 'x', p_expected_version: 1, p_method: 'cash', p_expected_cents: 6500 }, E_ADMIN).error.code, '22P02');
  assert.equal(ev.rpc('testing_mark_paid_by', { p_registration_id: regBy('CB-3112').id }, E_ADMIN).error.code, 'PGRST202'); // missing argument
  // 0035: the old 2-argument Mark paid functions are gone, as on the live database.
  assert.equal(ev.rpc('testing_mark_paid', { p_registration_id: regBy('CB-3112').id, p_expected_version: 1 }, E_ADMIN).error.code, 'PGRST202');
  assert.equal(ev.rpc('testing_private_mark_paid', { p_private_id: regBy('CB-3112').id, p_expected_version: 1 }, E_ADMIN).error.code, 'PGRST202');
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
    testing_private_undo_payment: { p_payment_id: anyId },
    testing_private_edit_payment: { p_payment_id: anyId, p_method: 'cash', p_amount_cents: 100, p_paid_on: '2026-10-17' }, // A
    testing_private_cancel: { p_private_id: anyId, p_expected_version: 1 },
    testing_private_restore: { p_private_id: anyId, p_expected_version: 1 }, // A
    testing_private_delete: { p_private_id: anyId, p_expected_version: 1, p_expected_payment_ids: [] }, // A
    testing_private_set_result: { p_private_id: anyId, p_result: 'pass' },
    testing_private_set_result_note: { p_private_id: anyId, p_note: 'x' },
    testing_move_to_private: { p_registration_id: anyId, p_expected_version: 1, p_private_date: '2026-12-01', p_private_time: '16:00' },
    testing_private_undo_move: { p_private_id: anyId, p_expected_version: 1 },
    // 0030 (S unless marked A).
    testing_mark_paid_by: { p_registration_id: anyId, p_expected_version: 1, p_method: 'card', p_expected_cents: 6500 },
    testing_private_mark_paid_by: { p_private_id: anyId, p_expected_version: 1, p_method: 'card', p_expected_cents: 8500 },
    testing_registration_history: { p_registration_id: anyId },
    testing_private_history: { p_private_id: anyId },
    testing_results_csv: { p_event_id: anyId }, // A
    // 0044 (A): Edit event's Undo in one call.
    testing_undo_event_edit: { p_event_id: anyId, p_expected_version: 1, p_name: 'X', p_testing_date: '2026-12-01', p_classes: [], p_auto_close_on: null, p_note: null, p_open: null },
  };
  assert.deepEqual(Object.keys(sample).sort(), [...EVENT_RPC_NAMES].sort());
  // testing_restore_student checks who inside (staff: their own "keep one" for 10 seconds).
  const adminOnly = ['testing_add_event', 'testing_update_event', 'testing_delete_event', 'testing_edit_payment', 'testing_withdraw_student', 'testing_delete_student', 'settings_update_school_address', 'settings_update_school_contact',
    'testing_private_edit_payment', 'testing_private_restore', 'testing_private_delete', // phase 4
    'testing_results_csv', // 0030
    'testing_undo_event_edit']; // 0044
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
  const res = ev.rpc('testing_mark_paid_by', {
    p_registration_id: regBy('CB-3112').id, p_expected_version: regBy('CB-3112').version, p_method: regBy('CB-3112').paying_by, p_expected_cents: 6500,
  }, E_DESK);
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
  const paid = markPaid({ p_registration_id: sam.id, p_expected_version: 1 }, E_DESK);
  assert.deepEqual({ ...paid, payment_id: 'x' }, { status: 'ok', payment_id: 'x', amount_cents: 6500, method: 'card', version: 2 });
  assert.equal(markPaidStatus({ p_registration_id: sam.id, p_expected_version: 1 }, E_DESK), 'stale'); // double click
  assert.equal(markPaidStatus({ p_registration_id: sam.id, p_expected_version: 2 }, E_DESK), 'already_paid');
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
  const again = markPaid({ p_registration_id: sam.id, p_expected_version: 4 }, E_DESK);
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
  assert.equal(markPaid({ p_registration_id: zoe.id, p_expected_version: zoe.version }, E_DESK).amount_cents, 7500);
  evToday = '2026-11-21';
  const sam2 = regBy('CB-3110');
  assert.equal(markPaid({ p_registration_id: sam2.id, p_expected_version: sam2.version }, E_DESK).amount_cents, 7500);
  assert.equal(addS().status, 'finished'); // no new students once finished
  // Withdrawn students can't be paid or change how they pay.
  const leo = regBy('CB-3116');
  assert.equal(markPaidStatus({ p_registration_id: leo.id, p_expected_version: leo.version }, E_DESK), 'withdrawn');
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
  markPaid({ p_registration_id: mia.id, p_expected_version: mia.version }, E_DESK);
  assert.ok(regBy('CB-3112').signature.startsWith(SIGNATURE_PREFIX)); // still kept
  evToday = '2027-02-19'; // 91 days after: the next Mark paid / Add event / family form cleans up
  const sam = regBy('CB-3110');
  markPaid({ p_registration_id: sam.id, p_expected_version: sam.version }, E_DESK);
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
  markPaidStatus({ p_registration_id: regBy('CB-3112').id, p_expected_version: 1 }, E_DESK);
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

check('CB12: the shared time list offers exactly the times the database accepts (v0.422, v1.109)', () => {
  // The private time: TimeList's default range (6:00 AM–10:00 PM, every 5 minutes) is exactly
  // testing_private_time_is_valid (0014), so every choice saves and nothing allowed is missing.
  const offered = TIMES.timeOptions().map((option) => option.value);
  assert.deepEqual(offered, PR.PRIVATE_TIME_CHOICES);
  for (const time of offered) assert.equal(PR.privateTimeIsValid(time), true, time);
  // A saved time shows as chosen, with or without seconds (the database answers 'HH:MM:SS').
  assert.equal(TIMES.selectValue('16:30:00'), '16:30');
  assert.equal(TIMES.selectValue('16:30'), '16:30');
  // A class time the database took that isn't on the list (classes accept any minute, 0005) is
  // still shown, in its place, so Edit event opens with it chosen.
  const withOdd = TIMES.timeOptions({ value: '16:12' }).map((option) => option.value);
  assert.ok(withOdd.includes('16:12'));
  assert.ok(withOdd.indexOf('16:10') < withOdd.indexOf('16:12') && withOdd.indexOf('16:12') < withOdd.indexOf('16:15'));
  assert.ok(TIMES.timeOptions({ value: '05:30' }).some((option) => option.value === '05:30'));
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

check('privateRules: summaryPaymentParts = the payments that still stand, oldest first (pass 2 C-03)', () => {
  const pay = (id, privateId, cents, paidOn, recordedAt, method = 'cash') =>
    ({ id, privateId, kind: 'payment', amountCents: cents, method, paidOn, recordedAt, reversesPaymentId: null });
  const rev = (id, privateId, of, cents, paidOn, recordedAt) =>
    ({ id, privateId, kind: 'reversal', amountCents: -cents, method: 'cash', paidOn, recordedAt, reversesPaymentId: of });
  // Ava: $65 cash moved with her from the event, a $10 check that was undone, then a $20 card top-up
  const row = { id: 'a', paid: true, paidCents: 8500, paidMethod: 'card', paidOn: '2026-11-06' };
  const payments = [
    pay('p2', 'a', 2000, '2026-11-06', '2026-11-06T15:00:00Z', 'card'),
    pay('p1', 'a', 6500, '2026-10-30', '2026-10-30T15:00:00Z', 'cash'),
    pay('x', 'a', 1000, '2026-11-01', '2026-11-01T15:00:00Z', 'check'),
    rev('rx', 'a', 'x', 1000, '2026-11-02', '2026-11-02T15:00:00Z'),
    pay('other', 'b', 9900, '2026-10-01', '2026-10-01T15:00:00Z'), // another private testing's
  ];
  assert.deepEqual(PR.summaryPaymentParts(row, payments), [
    { cents: 6500, method: 'cash', paidOn: '2026-10-30' },
    { cents: 2000, method: 'card', paidOn: '2026-11-06' },
  ]);
  // Paid once: one part, so the summary keeps today's one line
  assert.equal(PR.summaryPaymentParts(row, payments.slice(1, 2)).length, 1);
  // No payment rows to go on (safety net): the row's own summary, as before
  const own = [{ cents: 8500, method: 'card', paidOn: '2026-11-06' }];
  assert.deepEqual(PR.summaryPaymentParts(row, []), own);
  assert.deepEqual(PR.summaryPaymentParts(row, undefined), own);
  assert.deepEqual(PR.summaryPaymentParts(row, payments.slice(4)), own); // only another testing's
});

check('privateRules: the ⋯ menu truth table (P3, P7, L5)', () => {
  const keys = ['editDetails', 'changePayingBy', 'changeDay', 'grade', 'editPayment', 'undoPayment', 'printReceipt', 'cancel', 'restore', 'delete'];
  const menu = (row, isAdmin, today = PT) => {
    const m = PR.privateMenu(row, { today, isAdmin });
    assert.deepEqual(Object.keys(m).sort(), [...keys].sort());
    return keys.filter((k) => m[k]).join(' ');
  };
  const row = (over = {}) => ({ status: 'active', paid: false, amountDueCents: 8500, result: null, privateDate: '2026-12-01', ...over });
  assert.equal(menu(row(), false), 'editDetails changePayingBy changeDay grade cancel');
  assert.equal(menu(row(), true), 'editDetails changePayingBy changeDay grade cancel delete');
  assert.equal(menu(row({ paid: true, amountDueCents: 0 }), true), 'editDetails changeDay grade editPayment undoPayment printReceipt cancel delete');
  assert.equal(menu(row({ paid: true, amountDueCents: 2000 }), false), 'editDetails changePayingBy changeDay grade printReceipt cancel');
  // CB2: staff get Print receipt on a paid row too (their money group holds only it).
  assert.equal(menu(row({ paid: true, amountDueCents: 0 }), false), 'editDetails changeDay grade printReceipt cancel');
  assert.equal(menu(row({ result: 'no_show' }), false), 'editDetails changePayingBy changeDay grade cancel');
  assert.equal(menu(row({ result: null, note: 'note only' }), false), 'editDetails changePayingBy changeDay grade cancel'); // a note never counts
  assert.equal(menu(row({ result: 'pass' }), false), 'grade'); // L5: no Change how they'll pay either
  assert.equal(menu(row({ result: 'not_passed', paid: true, amountDueCents: 0 }), true), 'editDetails grade editPayment undoPayment printReceipt delete'); // v0.405: admins can still edit a graded one
  assert.equal(menu(row({ result: 'pass' }), true), 'editDetails grade delete');
  // Cancelled: staff nothing; admins Restore while the day is today or later, and Delete.
  assert.equal(menu(row({ status: 'cancelled' }), false), '');
  assert.equal(menu(row({ status: 'cancelled' }), true), 'restore delete');
  assert.equal(menu(row({ status: 'cancelled', privateDate: PT }), true), 'restore delete');
  assert.equal(menu(row({ status: 'cancelled', privateDate: '2026-10-16' }), true), 'delete');
  assert.equal(menu(null, true), '');
  // A cancelled row keeps its payments: while one still stands, Print receipt for staff and admins
  // (pass 2 M-03, v1.055 (b), v0.428) — staff's ⋯ holds only it; admins also Restore / Delete.
  assert.equal(menu(row({ status: 'cancelled', paid: true, amountDueCents: 0 }), true), 'printReceipt restore delete');
  assert.equal(menu(row({ status: 'cancelled', paid: true, amountDueCents: 0 }), false), 'printReceipt');
  assert.equal(PR.canPrintPrivateReceipt(row({ status: 'cancelled', paid: true })), true);
  assert.equal(PR.canPrintPrivateReceipt(row({ status: 'cancelled', paid: true }), true), false); // hidden
  assert.equal(PR.canPrintPrivateReceipt(row({ status: 'cancelled' })), false); // nothing paid
  assert.equal(PR.canPrintPrivateReceipt(null), false);
  // Hide private details (v0.506): no payment items (Print receipt included); everything else unchanged.
  const hiddenMenu = (r, isAdmin) => {
    const m = PR.privateMenu(r, { today: PT, isAdmin, hidden: true });
    return keys.filter((k) => m[k]).join(' ');
  };
  assert.equal(hiddenMenu(row(), false), 'editDetails changeDay grade cancel');
  assert.equal(hiddenMenu(row({ paid: true, amountDueCents: 0 }), true), 'editDetails changeDay grade cancel delete');
  assert.equal(hiddenMenu(row({ paid: true, amountDueCents: 2000 }), true), 'editDetails changeDay grade cancel delete');
  assert.equal(hiddenMenu(row({ status: 'cancelled' }), true), 'restore delete');
  assert.equal(hiddenMenu(row({ status: 'cancelled', paid: true, amountDueCents: 0 }), true), 'restore delete'); // no Print receipt while hidden
  assert.equal(hiddenMenu(row({ status: 'cancelled', paid: true, amountDueCents: 0 }), false), ''); // staff: no ⋯ at all
});

check('eventRules: rosterCounts / inCardFilter — possible duplicates out of Paid and Not paid (pass 1 R3-02)', () => {
  const r = (id, paid, duplicateState = 'none') => ({ id, paid, duplicateState });
  const active = [r('a', true), r('b', false), r('c', false, 'possible'), r('d', true, 'possible'), r('e', false)];
  assert.deepEqual(rosterCounts(active), { students: 5, paid: 1, notPaid: 2, flagged: 2 });
  assert.deepEqual(rosterCounts([]), { students: 0, paid: 0, notPaid: 0, flagged: 0 });
  assert.deepEqual(rosterCounts(undefined), { students: 0, paid: 0, notPaid: 0, flagged: 0 });
  const shown = (filter) => active.filter((row) => inCardFilter(row, filter)).map((row) => row.id).join('');
  assert.equal(shown(null), 'abcde'); // no card pressed: everyone, possible duplicates included
  assert.equal(shown('paid'), 'a');
  assert.equal(shown('notPaid'), 'be');
});

check('eventRules: dateSignedOf — the summary\'s "Date signed" row, only with a signature on file (rule v0.638, v0.430)', () => {
  const form = { source: 'form', signedAt: '2026-10-29T21:45:00Z', signatureDeletedAt: null };
  assert.equal(dateSignedOf(form), '2026-10-29T21:45:00Z');
  assert.equal(dateSignedOf({ ...form, source: 'staff' }), null); // added at the desk: no signature, no row
  assert.equal(dateSignedOf({ ...form, signatureDeletedAt: '2027-02-18T05:00:00Z' }), null); // deleted: that line already says the day
  assert.equal(dateSignedOf({ ...form, signedAt: null }), null);
  assert.equal(dateSignedOf(null), null);
  assert.equal(dateSignedOf(undefined), null);
  // The day is the school's: 10:45 PM on Oct 29 in Massachusetts is 02:45 UTC on Oct 30, and still reads Oct 29
  assert.equal(CBT.stampDay('2026-10-30T02:45:00Z'), 'Oct 29');
  assert.equal(CBT.stampDay('2026-10-29T21:45:00Z'), 'Oct 29');
});

check('words: the gray line while possible duplicates are left out of Paid / Not paid (pass 1 R3-02; batch 3 Q2 b: the box\'s unit, pairs)', () => {
  // one pair = 2 students; the box above says "1 possible duplicate", so the line counts the same unit
  assert.equal(CBT.duplicatesLeftOut(2, 1), "1 possible duplicate (2 students) isn't counted in Paid or Not paid until it's resolved.");
  assert.equal(CBT.duplicatesLeftOut(4, 2), "2 possible duplicates (4 students) aren't counted in Paid or Not paid until they're resolved.");
  // a pair with one flagged row (the usual case) reads as it always did: the number in the box and the line agree
  assert.equal(CBT.duplicatesLeftOut(1, 1), "1 possible duplicate isn't counted in Paid or Not paid until it's resolved.");
  assert.equal(CBT.duplicatesLeftOut(2, 2), "2 possible duplicates aren't counted in Paid or Not paid until they're resolved.");
  assert.equal(CBT.duplicatesLeftOut(3, 0), "1 possible duplicate (3 students) isn't counted in Paid or Not paid until it's resolved."); // never "0 possible duplicates"
  assert.equal(CBT.duplicatesLeftOut(1), "1 possible duplicate isn't counted in Paid or Not paid until it's resolved."); // no pair count given: one per row
  assert.equal(CBT.duplicatesLeftOut(2), "2 possible duplicates aren't counted in Paid or Not paid until they're resolved.");
  assert.equal(CBT.duplicateBoxLine(1), '1 possible duplicate'); // the box's own words, unchanged
});

check('words: batch 3 Q2 a and c, and the wiring of Q1 / Q2 / Q3 (Jeffrey: A to all)', () => {
  assert.equal(CBT.NO_STUDENTS_FILTERED_NOT_PAID_DUPLICATE, "No unpaid students in this class. A possible duplicate isn't counted.");
  assert.equal(CBT.NO_STUDENTS_FILTERED_NOT_PAID, 'Everyone in this class has paid.'); // still the line when nothing is unpaid
  assert.equal(`${CBT.TAG_CANCELLED} · ${CBT.CANCELLED_NOTHING_PAID}`, 'Cancelled · nothing was paid');
  const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
  // Q2 a: only a cancelled record that was never paid gets the new line; the paid branch and the plain Not paid line stay
  const summary = read('../../screens/testing/private/PrivateSummaryDialog.jsx');
  assert.match(summary, /if \(record\.paid\) \{[\s\S]*?\} else if \(record\.status === 'cancelled'\) \{\s+\/\/[^\n]*\n\s+payment = \(\s+<>\s+<span className="ttag">\{T\.TAG_CANCELLED\}<\/span> · \{T\.CANCELLED_NOTHING_PAID\}[\s\S]*?\} else \{\s+payment = \(\s+<>\s+<span className="ttag">\{T\.TAG_NOT_PAID\}/); // paid first, then cancelled-unpaid, then plain unpaid
  // Q2 b + c: the event page passes pairs to the gray line and picks the empty text from an unpaid possible duplicate
  const page = read('../../screens/testing/event/EventPage.jsx');
  assert.match(page, /T\.duplicatesLeftOut\(counts\.flagged, pairs\.length\)/);
  assert.match(page, /const unpaidDuplicateHere = rows\.some\(\(r\) => r\.duplicateState === 'possible' && r\.paid !== true\);\s+rows = rows\.filter/);
  assert.match(page, /shownFilter === 'notPaid'\) emptyText = unpaidDuplicateHere \? T\.NO_STUDENTS_FILTERED_NOT_PAID_DUPLICATE : T\.NO_STUDENTS_FILTERED_NOT_PAID/);
  // Q3: Paying by is drawn only when details are not hidden (Add student); its default 'cash' still goes with the save
  const student = read('../../screens/testing/event/StudentDialog.jsx');
  assert.match(student, /\{isAdd && !hidden && \(\s+<div className="field">\s+<span id=\{`\$\{idBase\}-pay-label`\}/);
  assert.match(page, /payingBy: 'cash' \};/); // Add student starts as Cash …
  assert.match(student, /stripes: values\.stripes, payingBy: values\.payingBy \}/); // … and the saved value is still sent, hidden or not
});

check('privateRules: PRIVATE_ROOM — the room below which the Private testing list draws its phone rows (batch 3 Q1 A)', () => {
  // Measured 2026-11-07 with the sample list: first text-on-text overlap at 608 px of room (mouse) and 592 (touch),
  // clean from 616 in both.
  assert.equal(PR.PRIVATE_ROOM, 632);
  assert.ok(PR.PRIVATE_ROOM >= 616 + 12, 'keeps a few px above the first clean room');
  for (const [width, panel] of [[683, 72], [683, 96], [700, 96], [712, 96]]) {
    assert.ok(width - panel < PR.PRIVATE_ROOM, `${width} wide with a ${panel} px panel draws phone rows`);
  }
  assert.ok(820 - 72 >= PR.PRIVATE_ROOM, '820 wide with the Standard panel keeps the tablet columns');
  const tab = readFileSync(new URL('../../screens/testing/private/PrivateTestingTab.jsx', import.meta.url), 'utf8');
  assert.match(tab, /const narrowRoom = usePageRoomBelow\(PRIVATE_ROOM\);\s+const listLayout = rosterLayoutFor\(layout, narrowRoom\);/);
  assert.match(tab, /layout: listLayout,/); // the rows get the room's layout …
  assert.doesNotMatch(tab, /isPhone[=:]\s*\{?\s*listLayout|\.\.\.listLayout/); // … the dialogs and the ⋯ menu keep the window's
  // A layout flip closes an open ⋯ menu or Mark paid box (their button is gone), as the event roster does
  assert.match(tab, /const listIsPhone = listLayout\.isPhone;\s+useEffect\(\(\) => \{\s+setMenu\(null\);\s+setMarkPaidBox\(null\);\s+\}, \[listIsPhone, isPhone\]\);/);
  assert.match(tab, /isSheet=\{isPhone\}/);
  assert.doesNotMatch(tab, /\b(?:const|let|var) PRIVATE_ROOM\b/); // no copy of the number
});

check('eventRules: canPrintReceipt — a payment that still stands, active or removed, never hidden (CB2; pass 2 M-03)', () => {
  const row = (over = {}) => ({ status: 'active', paid: true, movedTo: null, ...over });
  assert.equal(canPrintReceipt(row()), true);
  assert.equal(canPrintReceipt(row({ status: 'withdrawn' })), true); // removed with money (v0.428: staff too)
  assert.equal(canPrintReceipt(row({ status: 'withdrawn', withdrawnReason: 'duplicate_copy' })), true);
  assert.equal(canPrintReceipt(row({ paid: false })), false); // nothing paid
  assert.equal(canPrintReceipt(row({ status: 'withdrawn', paid: false })), false);
  assert.equal(canPrintReceipt(row({ status: 'withdrawn', movedTo: { privateId: 'p1' } })), false); // the money moved with them
  assert.equal(canPrintReceipt(row(), true), false); // Hide private details
  assert.equal(canPrintReceipt(null), false);
});

check('eventRules: ROSTER_ROOM — the room below which the roster draws its phone rows (pass 2 L-02, v0.431)', () => {
  // Measured 2026-11-06: the tablet columns first collide at 636 px of room with a mouse, 611 with touch.
  assert.equal(ROSTER_ROOM, 648);
  assert.ok(ROSTER_ROOM >= 636 + 12, 'keeps a few px above the first collision');
  // The pictures Jeffrey approved (pass2/l02.png): 683 wide with a mouse and 700 wide on touch, with the
  // Standard panel (72 px) or the Largest (96 px), draw phone rows; 820 wide on touch, Standard, keeps its columns.
  for (const [width, panel] of [[683, 72], [683, 96], [700, 72], [700, 96]]) {
    assert.ok(width - panel < ROSTER_ROOM, `${width} wide with a ${panel} px panel draws phone rows`);
  }
  assert.ok(820 - 72 >= ROSTER_ROOM, '820 wide with the Standard panel keeps the tablet columns');
});

check('eventRules: rosterLayoutFor — a narrow room draws the phone rows; touch and wide stay the window\'s (pass 2 L-02)', () => {
  const tablet = { isPhone: false, isTouch: true, isWide: false };
  const phone = { isPhone: true, isTouch: true, isWide: false };
  const pc = { isPhone: false, isTouch: false, isWide: true };
  assert.deepEqual(rosterLayoutFor(tablet, false), tablet); // enough room: the window's layout
  assert.deepEqual(rosterLayoutFor(tablet, true), { isPhone: true, isTouch: true, isWide: false }); // too narrow: phone rows
  assert.deepEqual(rosterLayoutFor(phone, false), phone); // a phone window is a phone window
  assert.deepEqual(rosterLayoutFor(phone, true), phone);
  assert.deepEqual(rosterLayoutFor(pc, true), { isPhone: true, isTouch: false, isWide: true }); // a mouse keeps its mouse sizes
  assert.equal(rosterLayoutFor(tablet, false), tablet); // nothing changes: the same object comes back
  assert.equal(tablet.isPhone, false); // and the window's own layout is never edited
});

check('words: the moved-to-private tag keeps its date together, so a narrow cell never splits it (pass 2 L-02)', () => {
  assert.equal(CBT.movedTag('2026-12-01'), 'Moved to private testing, Tue,\u00A0Dec\u00A01');
  // only the date is held together: the words before it still wrap
  assert.equal(CBT.movedTag('2026-12-01').split(' ').length, 5);
});

check('EventPage: only the roster follows the room — rosterLayoutFor feeds ctx.layout; the Grading tab, dialogs and ⋯ menu keep the window (pass 2 L-02)', () => {
  const page = readFileSync(new URL('../../screens/testing/event/EventPage.jsx', import.meta.url), 'utf8');
  const imports = (name) => new RegExp(`import \\{[^}]*\\b${name}\\b[^}]*\\} from '\\.\\./\\.\\./\\.\\./lib/testing/eventRules\\.js'`);
  assert.match(page, imports('ROSTER_ROOM'));
  assert.match(page, imports('rosterLayoutFor'));
  assert.doesNotMatch(page, /\b(?:const|let|var) ROSTER_ROOM\b/); // no copy of the number
  // The hook is called on every render, at the top of the component (never inside an if), and its answer is used
  assert.match(page, /const narrowRoom = usePageRoomBelow\(ROSTER_ROOM\);\s+const rosterLayout = rosterLayoutFor\(layout, narrowRoom\);/);
  assert.match(page, /layout: rosterLayout,/); // the roster's rows get the room's layout …
  assert.doesNotMatch(page, /layout=\{rosterLayout\}/); // … the Grading tab does not
  assert.doesNotMatch(page, /isPhone[=:]\s*\{?\s*rosterLayout/); // … nor the dialogs
  assert.match(page, /layout=\{layout\}/); // the Grading tab keeps the window's layout
  assert.match(page, /isSheet=\{isPhone\}/); // the ⋯ menu keeps the window's too
  // A layout flip redraws the row buttons, so an open ⋯ menu or Mark paid box closes (they'd point at nothing)
  assert.match(page, /useEffect\(\(\) => \{\s+setMenu\(null\);\s+setMarkPaidBox\(null\);\s+\}, \[rosterIsPhone, isPhone\]\);/);
});

check('batch 2: every Color Belt page lines its saves up with the shared save line, draws its bars with PageBar and no longer shows "Undone" itself (R2-05)', () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const pages = {
    'Classes and ranks': '../../screens/testing/ClassesRanksTab.jsx',
    'Events tab': '../../screens/testing/events/EventsTab.jsx',
    'event page': '../../screens/testing/event/EventPage.jsx',
    'Private testing tab': '../../screens/testing/private/PrivateTestingTab.jsx',
    'private grading page': '../../screens/testing/private/PrivateGradingPage.jsx',
  };
  for (const [name, path] of Object.entries(pages)) {
    const full = read(path);
    const src = full.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''); // code only: a comment can't satisfy a check
    if (name !== 'private grading page') {
      assert.match(src, /useSaveLine\(\{/, `${name} uses the save line`);
      assert.match(src, /line\.undoAction\(|undoAction\(/, `${name} makes its Undo toasts with line.undoAction`);
      assert.match(src, /undoBar/, `${name} gives the line its bar`);
      assert.doesNotMatch(src, /\b(?:beginWrite|endWrite|busyRef)\b/, `${name} has no flag of its own any more`);
      // every begin() has its end(): the same number of each, and each end() gets its token
      assert.equal((src.match(/line\.begin\(\)/g) || []).length > 0, true, `${name} takes the line`);
      assert.doesNotMatch(src, /line\.end\((?![^;]*token)[^;]*\);/, `${name}: every line.end() is given its token`);
    }
    assert.match(src, /<PageBar\b/, `${name} draws its bars with PageBar`);
    assert.doesNotMatch(src, /<ErrorBanner\b/, `${name} has no page-level ErrorBanner (a dialog's own bar is drawn inside the dialog's file)`);
    assert.doesNotMatch(src, /showToast\(T\.TOAST_UNDONE\b/, `${name} leaves "Undone" to the line`);
  }
  // Undos that reopen registration say so (R2-07, v1.051); an Undo that closes it stays plain "Undone"
  const events = read(pages['Events tab']);
  assert.match(events, /doneText: T\.TOAST_UNDONE_REOPENED/);
  assert.equal(CBT.TOAST_UNDONE_REOPENED, 'Undone. Registration is open again.');
});

check('batch 2: the back links are the shared BackLink (R3-06); .tc-back is gone', () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
  for (const path of ['../../screens/testing/event/EventPage.jsx', '../../screens/testing/private/PrivateGradingPage.jsx']) {
    const src = read(path);
    assert.match(src, /import BackLink from '\.\.\/\.\.\/\.\.\/components\/BackLink\.jsx'/);
    assert.match(src, /<BackLink\b/);
    assert.doesNotMatch(src, /className="link-button ev-back"/);
  }
  const chooserBack = read('../../screens/testing/chooser/BackToTesting.jsx');
  assert.match(chooserBack, /<BackLink\b/);
  assert.doesNotMatch(chooserBack.replace(/\/\/[^\n]*/g, ''), /tc-back/); // (its header comment says where the old class went)
  assert.doesNotMatch(read('../../screens/testing/chooser/chooser.css').replace(/\/\*[\s\S]*?\*\//g, ''), /\.tc-back/); // no rule left (only the comment that says it went)
  // Testing's focus helper finds the shared link; its Black Belt link keeps the .ev-back look, so that rule stays
  assert.match(read('../../screens/Testing.jsx'), /querySelector\('\.back-link, /);
  assert.match(read('../../styles/testing-events.css'), /\.ev-back \{/);
});

check('R1-07 second part (v1.135, Jeffrey "C"): the payment line, History and Paying by words of Color belt testing', () => {
  // The payment line is Star's base; Color Belt adds nothing (a regression pin: these exact strings)
  assert.equal(CBT.paidDetail(14000, 'card', '2026-11-03'), '$140 card · paid Nov 3');
  assert.equal(CBT.paidOnPhone('card', '2026-11-03'), 'Card · paid Nov 3'); // the phone line
  // History, as Star's, Black Belt's and Camps' (Camps used to say "Marked paid $350 cash" with no day)
  assert.equal(CBT.historyPaymentRecorded(14000, 'card', '2026-11-03'), 'Payment recorded: $140 card, paid Nov 3');
  assert.equal(CBT.historyPaymentUndone(14000), 'Payment undone: $140');
  // Paying by: "Card (chosen on the form)" / "(chosen at the desk)"
  assert.equal(CBT.payingByDetail('card', 'form'), 'Card (chosen on the form)');
  assert.equal(CBT.payingByDetail('check', 'desk'), 'Check (chosen at the desk)');
  assert.equal(CBT.payingByDetail('cash', 'form'), 'Cash (chosen on the form)');
  // Which one: the same answer as the Mark paid box's hint — still the form's choice → form; changed or none → desk
  const where = markPaidChoiceWhere;
  assert.equal(CBT.payingByDetail('cash', where({ payingBy: 'cash', payingByOnForm: 'cash' })), 'Cash (chosen on the form)');
  assert.equal(CBT.payingByDetail('card', where({ payingBy: 'card', payingByOnForm: 'cash' })), 'Card (chosen at the desk)');
  assert.equal(CBT.payingByDetail('cash', where({ payingBy: 'cash', payingByOnForm: null })), 'Cash (chosen at the desk)'); // added at the desk
  // Both summaries draw it, and hide it (with the payment line) while Hide private details is on
  const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
  for (const [name, path, rec] of [['event student summary', '../../screens/testing/event/StudentDialog.jsx', 'row'], ['private summary', '../../screens/testing/private/PrivateSummaryDialog.jsx', 'record']]) {
    const src = read(path);
    assert.match(src, new RegExp(`T\\.payingByDetail\\(${rec}\\.payingBy, markPaidChoiceWhere\\(${rec}\\)\\)`), `${name}: Paying by says where it was chosen`);
    assert.doesNotMatch(src.replace(/\/\/[^\n]*/g, ''), new RegExp(`label=\\{T\\.DETAIL_PAYING_BY\\}>\\{T\\.payingByText\\(`), `${name}: no plain Paying by line left`);
  }
  assert.match(read('../../screens/testing/private/PrivateSummaryDialog.jsx'), /hidden \? \(\s+\/\/[^\n]*\n\s+<SummaryRow label=\{T\.DETAIL_PAYMENT\}>\s+<span className="ev-hidden-value">/); // hidden: one gray line instead
});

check('batch 2: the Undo payment box, the Mark paid toasts and the row buttons (R1-06, R1-07, R1-08)', () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const event = read('../../screens/testing/event/EventPage.jsx');
  const priv = read('../../screens/testing/private/PrivateTestingTab.jsx');
  for (const [name, src] of [['event page', event], ['Private testing tab', priv]]) {
    assert.match(src, /T\.undoPaymentTitle\(T\.studentLabel\(dialog\.snapshot\), dialog\.payment\.amountCents, dialog\.payment\.method\)/, `${name}: the Undo payment box title carries the amount and the way`);
    assert.match(src, /T\.markedPaidToastHidden\(/, `${name}: a Mark paid toast while details are hidden names no amount`);
    assert.match(src, /T\.markedPaidToast\(/);
  }
  const code = (path) => read(path).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.match(code('../../screens/testing/event/RosterRows.jsx'), /is-unavailable/);
  assert.match(code('../../screens/testing/private/PrivateRows.jsx'), /is-unavailable/);
  // A bar that can be shown after the person left the page never carries money while details are hidden:
  // the event page's Mark paid and Edit payment Undos hand the line general words
  assert.match(code('../../screens/testing/event/EventPage.jsx'), /\{ words: T\.markedPaidToastHidden\(name\) \}/);
  assert.match(code('../../screens/testing/event/EventPage.jsx'), /\{ words: \`\$\{T\.TOAST_CHANGES_SAVED\} for \$\{T\.studentLabel\(d\.snapshot\)\}\` \}/);
  assert.match(code('../../screens/testing/private/PrivateTestingTab.jsx'), /\{ words: \`\$\{T\.TOAST_CHANGES_SAVED\} for \$\{name\}\` \}/);
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
// 0035: the one-click private Mark paid is gone; pMark calls testing_private_mark_paid_by the way it
// worked (see oneClickPaid above).
const privateMarkPaid = oneClickPaid('testing_private_mark_paid_by', 'p_private_id', privRow);
const pOneClick = (args, ctx = E_DESK) => {
  const answer = privateMarkPaid(args, ctx);
  assertPrivDueSame();
  return answer;
};
const pMark = (id, ctx = E_DESK) => pOneClick(pArgs(id), ctx);
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
  assert.equal(pOneClick({ p_private_id: id, p_expected_version: 1 }).status, 'stale'); // double click
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
    ['testing_private_cancel', pArgs(id)], ['testing_private_mark_paid_by', pArgs(id, { p_method: 'cash', p_expected_cents: 0 })],
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
  assert.equal(markPaidStatus({ p_registration_id: mia.id, p_expected_version: v() }, E_ADMIN), 'withdrawn');
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

// ======================= receipt.js (CB2, rulebook v0.420 / v0.421, mockup P3) =======================

// Payment rows as loadEvent / the private load give them (a reversal is negative and points at the
// payment it undoes).
const rPay = (id, amountCents, paidOn, recordedAt, method = 'cash') => ({ id, kind: 'payment', amountCents, method, paidOn, recordedAt, reversesPaymentId: null });
const rRev = (id, of, amountCents, paidOn, recordedAt) => ({ id, kind: 'reversal', amountCents: -amountCents, method: 'cash', paidOn, recordedAt, reversesPaymentId: of });
const R_SCHOOLS = [
  { name: 'Worcester', address: { street: '1 Main St' }, phone: '508-555-0101' },
  { name: 'Shrewsbury', address: { street: '2 Elm St' }, phone: '508-555-0202' },
];

check('receipt: an event registration (P3 "Owen") — facts, one line, paid in full', () => {
  const r = buildColorBeltReceipt({
    firstName: 'Owen', lastName: 'Reed', rankName: 'White', testingForName: 'Yellow',
    event: { name: 'November Children Testing', testingDate: '2026-11-20' },
    className: 'White', classStart: '16:00', classEnd: '17:00', locationCode: 'worcester', reference: 'CB-3104',
    payments: [rPay('p1', 6500, '2026-11-01', '2026-11-01T15:00:00Z')],
    totalDueCents: 6500, schools: R_SCHOOLS, printedOn: '2026-11-03', printedByName: '  Jeffrey Berg ',
  });
  assert.equal(r.kindLine, 'Color belt testing · payment receipt');
  assert.deepEqual(r.facts, [
    ['Student', 'Owen Reed · White → Yellow'],
    ['Event', 'November Children Testing · Nov 20, 2026'],
    ['Class', 'White · 4:00 – 5:00 PM'],
    ['School', 'Worcester'],
    ['Reference', 'CB-3104'],
  ]);
  assert.deepEqual(r.lines, [{ date: '2026-11-01', forText: 'Testing fee', how: 'cash', amountCents: 6500 }]);
  assert.equal(r.totalDueCents, 6500);
  assert.equal(r.paidCents, 6500);
  assert.equal(r.balanceNote, null);
  assert.deepEqual(r.schools, [
    { name: 'Worcester', street: '1 Main St', phone: '508-555-0101' },
    { name: 'Shrewsbury', street: '2 Elm St', phone: '508-555-0202' },
  ]);
  assert.equal(r.printedOn, '2026-11-03');
  assert.equal(r.printedByName, 'Jeffrey Berg'); // trimmed
  // Never a date of birth, an email, notes, a signature or a link.
  assert.doesNotMatch(JSON.stringify(r), /@|https?:|signature|"notes?"|birth|email/i);
});

check('receipt: undone and edited payments leave out the payment and its reversal; oldest first', () => {
  const payments = [
    rPay('p1', 5000, '2026-10-20', '2026-10-20T15:00:00Z'), // undone
    rRev('x1', 'p1', 5000, '2026-10-21', '2026-10-21T15:00:00Z'),
    rPay('p3', 6000, '2026-10-25', '2026-10-25T15:00:00Z', 'check'), // edited → reversal + p4
    rRev('x3', 'p3', 6000, '2026-10-26', '2026-10-26T15:00:00Z'),
    rPay('p4', 6500, '2026-10-24', '2026-10-26T15:00:01Z', 'card'), // the edit's new payment (dated earlier)
  ];
  assert.deepEqual(standingPayments(payments).map((p) => p.id), ['p4']);
  const r = buildColorBeltReceipt({
    firstName: 'Ava', lastName: 'Chen', rankName: 'LT White', testingForName: null,
    event: { name: 'Fall', testingDate: '2026-11-20' }, className: 'Little Tiger', classStart: '16:00', classEnd: '17:00',
    locationCode: 'shrewsbury', reference: null, payments, totalDueCents: 6500, schools: [], printedOn: '2026-11-03', printedByName: null,
  });
  assert.deepEqual(r.lines, [{ date: '2026-10-24', forText: 'Testing fee', how: 'card', amountCents: 6500 }]);
  assert.equal(r.paidCents, 6500);
  assert.deepEqual(r.facts[0], ['Student', 'Ava Chen · LT White']); // no new rank: just the belt
  assert.deepEqual(r.facts.at(-1), ['School', 'Shrewsbury']); // no reference → no Reference line
  assert.deepEqual(r.schools, []); // schools couldn't load: no footer lines
  assert.equal(r.printedByName, null); // get_my_profile failed: the name is left out
  assert.equal(buildColorBeltReceipt({ firstName: 'A', lastName: 'B', locationCode: 'worcester', printedOn: '2026-11-03', printedByName: '   ' }).printedByName, null);
  // Everything undone: no lines, nothing paid.
  const none = buildColorBeltReceipt({ firstName: 'A', lastName: 'B', locationCode: 'worcester', payments: payments.slice(0, 2), totalDueCents: 5000, printedOn: '2026-11-03' });
  assert.deepEqual(none.lines, []);
  assert.equal(none.paidCents, 0);
  // Same day: by when it was recorded.
  const sameDay = standingPayments([rPay('b', 1, '2026-11-01', '2026-11-01T16:00:00Z'), rPay('a', 1, '2026-11-01', '2026-11-01T15:00:00Z')]);
  assert.deepEqual(sameDay.map((p) => p.id), ['a', 'b']);
});

check('receipt: a private testing (P3 "Ava", v0.421 Q A) — Moved from, a top-up as a second line', () => {
  const base = {
    firstName: 'Ava', lastName: 'Chen', rankName: 'Yellow', testingForName: 'Orange', className: 'Group A',
    classStart: '16:00', classEnd: '17:00', locationCode: 'worcester', reference: null,
    payments: [rPay('m1', 6500, '2026-10-27', '2026-11-01T15:00:00Z'), rPay('t1', 2000, '2026-11-03', '2026-11-03T15:00:00Z')],
    totalDueCents: 8500, schools: [], printedOn: '2026-11-03', printedByName: 'Jeffrey Berg',
  };
  const moved = buildColorBeltReceipt({ ...base, privateTesting: { privateOn: '2026-12-01', privateTime: '16:00', movedFromEventName: 'November Children Testing' } });
  assert.deepEqual(moved.facts, [
    ['Student', 'Ava Chen · Yellow → Orange'],
    ['Private testing', 'Tue, Dec 1, 4:00 PM'],
    ['Moved from', 'November Children Testing'],
    ['Class', 'Group A'], // a private testing: no class time
    ['School', 'Worcester'],
  ]);
  assert.deepEqual(moved.lines.map((l) => [l.date, l.forText, l.amountCents]), [['2026-10-27', 'Testing fee', 6500], ['2026-11-03', 'Testing fee', 2000]]);
  assert.equal(moved.paidCents, 8500);
  assert.equal(moved.totalDueCents, 8500);
  // Added at the desk: no Moved from line; a reference shows when it has one.
  const desk = buildColorBeltReceipt({ ...base, reference: 'CB-9001', privateTesting: { privateOn: '2026-12-01', privateTime: '16:00', movedFromEventName: null } });
  assert.deepEqual(desk.facts.map((f) => f[0]), ['Student', 'Private testing', 'Class', 'School', 'Reference']);
});

check('receipt: a cancelled private testing owes nothing more (v0.429, pass 2 M-03 follow-up)', () => {
  const base = {
    firstName: 'Ava', lastName: 'Chen', rankName: 'Yellow', testingForName: 'Orange', className: 'Group A',
    locationCode: 'worcester', reference: null, payments: [rPay('m1', 6500, '2026-10-30', '2026-10-30T15:00:00Z')],
    totalDueCents: 8500, schools: [], printedOn: '2026-11-06', printedByName: null,
  };
  const pt = { privateOn: '2026-12-01', privateTime: '16:00', movedFromEventName: 'November Children Testing' };
  // Paid $65 of $85, then cancelled: Total due = what was paid (Balance $0), and the line says so
  const cancelled = buildColorBeltReceipt({ ...base, privateTesting: { ...pt, cancelledAt: '2026-11-06T15:00:00Z' } });
  assert.equal(cancelled.totalDueCents, 6500);
  assert.equal(cancelled.paidCents, 6500);
  assert.deepEqual(cancelled.facts[1], ['Private testing', 'Tue, Dec 1, 4:00 PM · cancelled Nov 6']);
  // Active (no cancelledAt, or null): the price, as before — $20 still to pay
  const active = buildColorBeltReceipt({ ...base, privateTesting: { ...pt, cancelledAt: null } });
  assert.equal(active.totalDueCents, 8500);
  assert.deepEqual(active.facts[1], ['Private testing', 'Tue, Dec 1, 4:00 PM']);
  assert.equal(buildColorBeltReceipt({ ...base, privateTesting: pt }).totalDueCents, 8500);
  // An event registration never has a cancelled line
  const ev = buildColorBeltReceipt({ ...base, event: { name: 'Fall', testingDate: '2026-11-20' }, classStart: '16:00', classEnd: '17:00' });
  assert.equal(ev.totalDueCents, 8500);
  // The school's day: cancelled at 10:30 PM on Nov 6 at the school (03:30 the next day in UTC)
  const late = buildColorBeltReceipt({ ...base, privateTesting: { ...pt, cancelledAt: '2026-11-07T03:30:00Z' } });
  assert.deepEqual(late.facts[1], ['Private testing', 'Tue, Dec 1, 4:00 PM · cancelled Nov 6']);
  // Paid above its price (a move, or a price lowered later): Total due stays the price, so the
  // overpayment still shows, as before
  const over = buildColorBeltReceipt({ ...base, totalDueCents: 6000, privateTesting: { ...pt, cancelledAt: '2026-11-06T15:00:00Z' } });
  assert.equal(over.totalDueCents, 6000);
  assert.equal(over.paidCents, 6500);
});

check('receipt: Total due for an event registration (the price the database charges)', () => {
  const rank = { earlyCents: 5000, dayCents: 6000 };
  // Not paid: today's price — early before the testing day, the testing-day price on and after it.
  assert.equal(eventTotalDueCents(rank, [], '2026-11-19', '2026-11-20'), 5000);
  assert.equal(eventTotalDueCents(rank, [], '2026-11-20', '2026-11-20'), 6000);
  assert.equal(eventTotalDueCents(rank, [], '2026-11-21', '2026-11-20'), 6000);
  // Paid early, printed on the testing day: the early price (no false "$10 owed").
  assert.equal(eventTotalDueCents(rank, [rPay('p', 5000, '2026-11-10', '2026-11-10T12:00:00Z')], '2026-11-20', '2026-11-20'), 5000);
  // Paid on the day: the testing-day price.
  assert.equal(eventTotalDueCents(rank, [rPay('p', 6000, '2026-11-20', '2026-11-20T12:00:00Z')], '2026-11-20', '2026-11-20'), 6000);
  // An undone payment doesn't count: back to today's price.
  assert.equal(eventTotalDueCents(rank, [rPay('p', 5000, '2026-11-10', 'a'), rRev('x', 'p', 5000, '2026-11-11', 'b')], '2026-11-20', '2026-11-20'), 6000);
  assert.equal(eventTotalDueCents(null, [], '2026-11-20', '2026-11-20'), 0); // no rank: nothing, never NaN
});

// ======================= Mark paid with a way to pay (CB1, migration 0030 §3a, rulebook v0.418) =======================

// The preview database's testing_mark_paid_by must follow 0030 §3a: refused in the order
// no_access → invalid → not_found → stale → withdrawn → already_paid → price_changed (which writes
// nothing); a way other than "Paying by" changes "Paying by" and the payment remembers the old one
// (paying_by_before); Undo payment (0030 §3c) puts it back while "Paying by" is still the payment's way.
check('events mock: Mark paid with a way to pay (testing_mark_paid_by, 0030 §3a)', () => {
  evReset();
  const zoe = () => regBy('CB-3112'); // Group A Yellow, not paid: early $65, testing-day $75
  const by = (over = {}, ctx = E_DESK) => evCall('testing_mark_paid_by', {
    p_registration_id: zoe().id, p_expected_version: zoe().version, p_method: 'card', p_expected_cents: 6500, ...over,
  }, ctx);
  const familyChoice = zoe().paying_by;
  const other = ['cash', 'check', 'card'].find((m) => m !== familyChoice); // a different way than "Paying by"
  // invalid: a bad way, a missing way, a negative expected amount, a missing id or version.
  assert.equal(by({ p_method: 'venmo' }).status, 'invalid');
  assert.equal(by({ p_method: null }).status, 'invalid');
  assert.equal(by({ p_expected_cents: -1 }).status, 'invalid');
  assert.equal(by({ p_expected_cents: null }).status, 'invalid');
  assert.equal(by({ p_expected_version: null }).status, 'invalid');
  assert.equal(by({ p_registration_id: '00000000-0000-4000-8000-00000000dead' }).status, 'not_found');
  assert.equal(by({}, E_LOCKED).status, 'no_access'); // has_data_access first
  // stale comes before price_changed (an old version AND a wrong amount → stale).
  assert.equal(by({ p_expected_version: zoe().version + 1, p_expected_cents: 1 }).status, 'stale');
  // price_changed: the box showed the testing-day price before the testing day → the early price
  // comes back and NOTHING is saved (same data, same version, same "Paying by").
  const before = JSON.stringify(evDb());
  assert.deepEqual(by({ p_expected_cents: 7500 }), { status: 'price_changed', amount_cents: 6500 });
  assert.equal(JSON.stringify(evDb()), before);
  // The box opened before midnight and the testing day began: the testing-day price comes back.
  evToday = '2026-11-20';
  assert.deepEqual(by({ p_expected_cents: 6500, p_method: other }), { status: 'price_changed', amount_cents: 7500 });
  assert.equal(JSON.stringify(evDb()), before);
  evToday = '2026-10-17';
  // ok, a different way than "Paying by": "Paying by" becomes that way, the old one is remembered.
  const v0 = zoe().version;
  const paid = by({ p_method: other });
  assert.deepEqual({ ...paid, payment_id: 'x' }, {
    status: 'ok', payment_id: 'x', amount_cents: 6500, method: other, paid_on: '2026-10-17', paying_by: other, version: v0 + 1,
  });
  const pay = evDb().payments.find((p) => p.id === paid.payment_id);
  assert.deepEqual([pay.kind, pay.amount_cents, pay.method, pay.paid_on, pay.paying_by_before], ['payment', 6500, other, '2026-10-17', familyChoice]);
  assert.equal(zoe().paying_by, other);
  const row = rosterOf(DEFAULT_EVENT_ID).find((r) => r.id === zoe().id);
  assert.deepEqual([row.paid, row.paid_cents, row.paid_method], [true, 6500, other]);
  // A double click (the old version) → stale; the new version → already_paid, which comes before
  // price_changed (a wrong amount on a paid registration is still already_paid).
  assert.equal(by({ p_expected_version: v0, p_method: other }).status, 'stale');
  assert.equal(by({ p_method: other }).status, 'already_paid');
  assert.equal(by({ p_method: other, p_expected_cents: 1 }).status, 'already_paid');
  // Undo payment (same desk, inside 10 seconds) puts the family's "Paying by" back.
  const undone = evCall('testing_undo_payment', { p_payment_id: paid.payment_id }, E_DESK);
  assert.deepEqual(undone, { status: 'ok', version: v0 + 2 });
  assert.equal(zoe().paying_by, familyChoice);
  assert.equal(rosterOf(DEFAULT_EVENT_ID).find((r) => r.id === zoe().id).paid, false);
  // Paying the family's own way: nothing remembered, "Paying by" unchanged — and Undo leaves it.
  const same = by({ p_method: familyChoice });
  assert.equal(same.status, 'ok');
  assert.equal(same.paying_by, familyChoice);
  assert.equal(evDb().payments.find((p) => p.id === same.payment_id).paying_by_before, null);
  assert.equal(zoe().paying_by, familyChoice);
  assert.equal(evStatus('testing_undo_payment', { p_payment_id: same.payment_id }, E_DESK), 'ok');
  assert.equal(zoe().paying_by, familyChoice);
  // Withdrawn students can't be paid (withdrawn comes before price_changed too).
  const leo = regBy('CB-3116');
  assert.equal(evStatus('testing_mark_paid_by', { p_registration_id: leo.id, p_expected_version: leo.version, p_method: 'cash', p_expected_cents: 1 }, E_DESK), 'withdrawn');
  evReset();
});

// eventsApi.js's markPaidBy imports the app's ONE connection (../supabase.js), which needs Vite.
// Here a Node module hook swaps that one import for a tiny stand-in whose rpc() calls cbRpc below:
// by default the preview database above (so the wrapper is checked end to end), or a hand-made
// answer (cbRaw) to check how the wrapper reads answers the database should never give.
let cbRpcCtx = E_DESK;
let cbRaw = null; // null = ask the preview database; otherwise the { data, error } to answer, or a function that throws
let cbLastCall = null;
globalThis.__cbChecksRpc = (name, args) => {
  cbLastCall = { name, args };
  if (typeof cbRaw === 'function') return cbRaw();
  if (cbRaw) return cbRaw;
  // has_data_access lives in the shared preview client, not the events backend: answered here
  // from cbRpcCtx (the reads in privateApi.loadPrivateTestings check it first).
  if (name === 'has_data_access') return { data: cbRpcCtx.hasDataAccess === true, error: null };
  return ev.rpc(name, args, cbRpcCtx);
};
// from(table).select(columns).eq(…).in(…) reads the preview database the same way (as cbRpcCtx);
// cbFromFail = a table name whose reads answer a connection error instead.
let cbFromFail = null;
globalThis.__cbChecksFrom = (table) => ({
  select(columns) {
    const filters = [];
    const orders = [];
    const query = {
      eq(col, value) { filters.push({ col, value, op: 'eq' }); return query; },
      in(col, value) { filters.push({ col, value, op: 'in' }); return query; },
      order(col, { ascending = true } = {}) { orders.push({ col, ascending }); return query; }, // eventsApi.loadEvent sorts
      then(resolve, reject) {
        try {
          resolve(cbFromFail === table ? { data: null, error: { message: 'Failed to fetch' } } : ev.select(table, columns, filters, orders, cbRpcCtx));
        } catch (error) {
          reject(error);
        }
      },
    };
    return query;
  },
});
const SUPABASE_STUB = `data:text/javascript,${encodeURIComponent(
  'export const isPreview = false; export const supabase = { rpc: async (n, a) => globalThis.__cbChecksRpc(n, a), from: (t) => globalThis.__cbChecksFrom(t) };',
)}`;
const { registerHooks } = await import('node:module');
registerHooks({
  resolve(specifier, context, nextResolve) {
    const found = nextResolve(specifier, context);
    return found.url.endsWith('/src/lib/supabase.js') ? { url: SUPABASE_STUB, shortCircuit: true } : found;
  },
});
const eventsApi = await import('./eventsApi.js');

await (async () => {
  const label = 'eventsApi: markPaidBy reads ok, price_changed and the other answers';
  try {
    evReset();
    cbRaw = null;
    const zoe = () => regBy('CB-3112');
    const args = (over = {}) => ({ registrationId: zoe().id, expectedVersion: zoe().version, method: 'card', expectedCents: 6500, ...over });
    // It calls testing_mark_paid_by with exactly 0030's argument names, plus 0044's p_school
    // (null when no school is given: the database then uses the event's).
    const changed = await eventsApi.markPaidBy(args({ expectedCents: 7500 }));
    assert.equal(cbLastCall.name, 'testing_mark_paid_by');
    assert.deepEqual(cbLastCall.args, { p_registration_id: zoe().id, p_expected_version: zoe().version, p_method: 'card', p_expected_cents: 7500, p_school: null });
    // price_changed from the preview database: the database's amount, as amountCents.
    assert.deepEqual(changed, { status: 'price_changed', amountCents: 6500 });
    // An unknown school is refused (nothing saved).
    assert.equal((await eventsApi.markPaidBy(args({ school: 'boston' }))).status, 'invalid');
    // ok: camelCase, with the day and the new "Paying by". This device's school is stored on the
    // payment (R1-01) — here the OTHER school's desk took the money for a Worcester event.
    const v0 = zoe().version;
    const paid = await eventsApi.markPaidBy(args({ school: 'shrewsbury' }));
    assert.equal(cbLastCall.args.p_school, 'shrewsbury');
    assert.equal(typeof paid.paymentId, 'string');
    assert.deepEqual({ ...paid, paymentId: 'x' }, { status: 'ok', paymentId: 'x', amountCents: 6500, method: 'card', paidOn: '2026-10-17', payingBy: 'card', version: v0 + 1 });
    assert.equal(evDb().payments.find((p) => p.id === paid.paymentId).school, 'shrewsbury');
    // Refusals from the preview database come through as just { status }.
    assert.deepEqual(await eventsApi.markPaidBy(args({ expectedVersion: v0 })), { status: 'stale' });
    assert.deepEqual(await eventsApi.markPaidBy(args()), { status: 'already_paid' });
    cbRpcCtx = E_LOCKED;
    assert.deepEqual(await eventsApi.markPaidBy(args()), { status: 'no_access' });
    cbRpcCtx = E_DESK;
    // How the ok answer is read (hand-made answers).
    const answer = (data) => { cbRaw = { data, error: null }; return eventsApi.markPaidBy(args()); };
    const okRow = { status: 'ok', payment_id: 'p1', amount_cents: 6500, method: 'cash', paid_on: '2026-10-17', paying_by: 'cash', version: 4 };
    assert.deepEqual(await answer(okRow), { status: 'ok', paymentId: 'p1', amountCents: 6500, method: 'cash', paidOn: '2026-10-17', payingBy: 'cash', version: 4 });
    // No paid_on / paying_by: the day is unknown (null) and "Paying by" is the way they paid.
    assert.deepEqual(await answer({ ...okRow, paid_on: undefined, paying_by: undefined }), { status: 'ok', paymentId: 'p1', amountCents: 6500, method: 'cash', paidOn: null, payingBy: 'cash', version: 4 });
    // A wrong shape is an error, never a guess.
    for (const bad of [{ payment_id: '' }, { payment_id: undefined }, { amount_cents: '6500' }, { amount_cents: 65.5 }, { method: '' }, { version: null }, { version: '4' }]) {
      assert.equal((await answer({ ...okRow, ...bad })).status, 'error', JSON.stringify(bad));
    }
    // price_changed needs a whole-cents amount_cents; missing or not an integer → error.
    assert.deepEqual(await answer({ status: 'price_changed', amount_cents: 7500 }), { status: 'price_changed', amountCents: 7500 });
    assert.deepEqual(await answer({ status: 'price_changed', amount_cents: 0 }), { status: 'price_changed', amountCents: 0 });
    for (const bad of [undefined, null, '7500', 75.5, NaN, true, {}]) {
      const r = await answer({ status: 'price_changed', amount_cents: bad });
      assert.equal(r.status, 'error', String(bad));
      assert.ok(r.error instanceof Error);
      assert.equal('amountCents' in r, false);
    }
    // Every other status the database can give comes back as just { status } (extra fields dropped).
    for (const s of ['already_paid', 'withdrawn', 'stale', 'not_found', 'invalid', 'no_access', 'not_allowed']) {
      assert.deepEqual(await answer({ status: s, amount_cents: 6500 }), { status: s });
    }
    // Not a known status, no status, no answer, a connection error, a throw: 'error', never a throw.
    for (const data of [{ status: 'weird' }, { status: 'error' }, {}, null, 'ok']) assert.equal((await answer(data)).status, 'error', JSON.stringify(data));
    cbRaw = { data: null, error: { message: 'Failed to fetch' } };
    assert.equal((await eventsApi.markPaidBy(args())).status, 'error');
    cbRaw = () => { throw new Error('network down'); };
    assert.equal((await eventsApi.markPaidBy(args())).status, 'error');
    cbRaw = null;
    evReset();
    count += 1;
  } catch (error) {
    console.error(`FAILED: ${label}`);
    throw error;
  }
})();

// ======================= CB18: the results CSV (migration 0030 §6c, rulebook v0.416 / v0.418 Q3) =======================
// Three parts: resultsCsv.js (the columns and their values, with Star's csv.js writing the text),
// the preview database's testing_results_csv (admins only, one download-log row), and
// eventsApi.downloadResultsCsv (how it reads every answer), through the stand-in connection above.

// One full row as testing_results_csv sends it (0030's shape).
const csvSample = (over = {}) => ({
  registration_id: '11111111-1111-4111-8111-111111111111', reference: 'CB-3101', first_name: 'Mia', last_name: 'Lopez',
  class_name: 'Group B', start_time: '17:00:00', end_time: '18:00:00', current_belt: 'Yellow', testing_for: 'Orange',
  result: 'pass', note: 'Strong kicks', paying_by: 'cash', paid: true, paid_cents: 6500, paid_on: '2026-11-02', paid_method: 'card',
  ...over,
});

check('CB18 resultsCsv: the 15 columns, in v0.418 Q3 order, and each value', () => {
  assert.deepEqual(CBT.CB_CSV_HEADINGS, [
    'Reference', 'First name', 'Last name', 'Class', 'Class time', 'Belt', 'Testing for', 'Result', 'Grader’s note',
    'Paying by', 'Paid', 'Amount paid', 'Paid on', 'Paid by', 'Registration id',
  ]);
  const full = CSV.csvRow(csvSample());
  assert.equal(full.length, CBT.CB_CSV_HEADINGS.length);
  assert.deepEqual(full, [
    'CB-3101', 'Mia', 'Lopez', 'Group B', '5:00 – 6:00 PM', 'Yellow', 'Orange', 'Passed', 'Strong kicks',
    'Cash', 'Yes', '65.00', '2026-11-02', 'Card', '11111111-1111-4111-8111-111111111111',
  ]);
  // Paid by = how the newest counted payment was paid (paid_method), Paying by = the family's choice.
  // Not paid: "No", 0.00, and no Paid on / Paid by even if the database sent a day.
  const unpaid = CSV.csvRow(csvSample({ paid: false, paid_cents: 0, paid_on: '2026-11-02', paid_method: 'cash', paying_by: 'check' }));
  assert.deepEqual(unpaid.slice(9, 14), ['Check', 'No', '0.00', '', '']);
  // Not graded, no note, last rank (testing_for null), the other results.
  const blank = CSV.csvRow(csvSample({ result: null, note: null, testing_for: null }));
  assert.deepEqual([blank[6], blank[7], blank[8]], ['No new rank', '', '']);
  assert.equal(CSV.csvRow(csvSample({ result: 'not_passed' }))[7], 'Not passed');
  assert.equal(CSV.csvRow(csvSample({ result: 'no_show' }))[7], 'No show');
  // Times across noon; amounts with cents and over $1,000 (no $ and no commas: a number).
  assert.equal(CSV.csvRow(csvSample({ start_time: '11:30:00', end_time: '12:30:00' }))[4], '11:30 AM – 12:30 PM');
  assert.equal(CSV.centsToCsvNumber(29050), '290.50');
  assert.equal(CSV.centsToCsvNumber(112005), '1120.05');
  assert.equal(CSV.centsToCsvNumber(0), '0.00');
  assert.equal(CSV.centsToCsvNumber(-3500), '-35.00');
  assert.equal(CSV.centsToCsvNumber(65.5), '');
  // The rows keep the database's order.
  const two = CSV.csvRows([csvSample({ reference: 'CB-2' }), csvSample({ reference: 'CB-1' })]);
  assert.deepEqual(two.map((r) => r[0]), ['CB-2', 'CB-1']);
  // Every row shape check: the sample passes, a wrong field fails.
  assert.equal(CSV.isCsvRow(csvSample()), true);
  assert.equal(CSV.isCsvRow(csvSample({ result: null, note: null, testing_for: null, paid_on: null, paid_method: null, paying_by: null })), true);
  for (const bad of [{ registration_id: 5 }, { reference: null }, { paid: 'true' }, { paid_cents: '6500' }, { paid_cents: 65.5 }, { note: 7 }, { class_name: undefined }]) {
    assert.equal(CSV.isCsvRow(csvSample(bad)), false, JSON.stringify(bad));
  }
  assert.equal(CSV.isCsvRow(null), false);
  // The file name: Star's rule, Color Belt's fallback.
  assert.equal(CSV.csvFileName('November Children Testing', '2026-11-20'), 'November-Children-Testing-results-2026-11-20.csv');
  assert.equal(CSV.csvFileName('Fall: "A/B" test?', '2026-11-20'), 'Fall-A-B-test-results-2026-11-20.csv');
  assert.equal(CSV.csvFileName('  ', '2026-11-20'), 'Color-Belt-testing-results-2026-11-20.csv');
  // Direction controls (U+202A–U+202E, U+2066–U+2069, U+200E, U+200F) are taken out, every one.
  const bidi = [0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069, 0x200e, 0x200f].map((c) => String.fromCharCode(c));
  for (const ch of bidi) {
    assert.equal(CSV.csvFileName(`Fall${ch} Test`, '2026-11-20'), 'Fall-Test-results-2026-11-20.csv', ch.codePointAt(0).toString(16));
  }
  const tricky = CSV.csvFileName(`Nov ${bidi[4]}vsc.exe${bidi[2]} Test`, '2026-11-20');
  assert.equal(tricky, 'Nov-vsc.exe-Test-results-2026-11-20.csv');
  assert.doesNotMatch(tricky, /[‪-‮⁦-⁩‎‏]/);
  assert.equal(CSV.csvFileName(bidi.join(''), '2026-11-20'), 'Color-Belt-testing-results-2026-11-20.csv'); // nothing left → the fallback
});

check('CB18 resultsCsv: every cell is safe from formula injection and quoted right (Star csv.js)', () => {
  // Free text in any cell: the grader's note most of all, but names and class names too.
  const evil = csvSample({
    first_name: '=1+1', last_name: '+SUM(A1)', class_name: '-2', current_belt: '@cmd', testing_for: '\t=x', note: '\r=y',
    reference: '  =HYPERLINK("http://x")', registration_id: '\n@z',
  });
  const cells = CSV.csvRow(evil);
  const text = CSV_WRITER.toCsv(CBT.CB_CSV_HEADINGS, [cells]);
  const lines = text.split('\r\n');
  assert.equal(lines.length, 3); // header, one row, '' after the closing CRLF
  assert.equal(lines[2], '');
  assert.equal(lines[0], 'Reference,First name,Last name,Class,Class time,Belt,Testing for,Result,Grader’s note,Paying by,Paid,Amount paid,Paid on,Paid by,Registration id');
  // Each written cell, read back: none may start with = + - @ tab or CR, even after spaces.
  for (const cell of cells) {
    const written = CSV_WRITER.csvCell(cell);
    const inner = written.startsWith('"') ? written.slice(1, -1).replace(/""/g, '"') : written;
    assert.doesNotMatch(inner, /^\s*[=+\-@]/, JSON.stringify(cell));
    assert.doesNotMatch(inner, /^[\t\r]/, JSON.stringify(cell));
  }
  assert.equal(CSV_WRITER.csvCell(cells[1]), "'=1+1");
  assert.equal(CSV_WRITER.csvCell(cells[2]), "'+SUM(A1)");
  assert.equal(CSV_WRITER.csvCell(cells[3]), "'-2");
  assert.equal(CSV_WRITER.csvCell(cells[5]), "'@cmd");
  assert.equal(CSV_WRITER.csvCell(cells[0]), `"'  =HYPERLINK(""http://x"")"`); // spaces first: guarded here, quoted by csv.js
  assert.equal(CSV.guardLeadingSpace('\n@z'), "'\n@z");
  assert.equal(CSV.guardLeadingSpace(' plain'), ' plain');
  assert.equal(CSV.guardLeadingSpace(7), 7);
  // Look-alike signs (full-width ＝ ＋ － ＠, the minus sign −): guarded, at the start or after space.
  const u = (c) => String.fromCharCode(c);
  for (const c of [0xff1d, 0xff0b, 0xff0d, 0xff20, 0x2212]) {
    assert.equal(CSV.guardLeadingSpace(`${u(c)}SUM(A1)`), `'${u(c)}SUM(A1)`, c.toString(16));
    assert.equal(CSV.guardLeadingSpace(` ${u(c)}1`), `' ${u(c)}1`, c.toString(16));
    assert.equal(CSV.guardLeadingSpace(`A${u(c)}1`), `A${u(c)}1`, c.toString(16)); // inside: unchanged
  }
  // Invisible characters first count as leading space: zero-width space/non-joiner/joiner, word joiner, BOM.
  for (const c of [0x200b, 0x200c, 0x200d, 0x2060, 0xfeff]) {
    for (const sign of ['=', '+', '-', '@', u(0xff1d), u(0x2212)]) {
      assert.equal(CSV.guardLeadingSpace(`${u(c)}${sign}1+1`), `'${u(c)}${sign}1+1`, `${c.toString(16)} ${sign}`);
    }
    assert.equal(CSV.guardLeadingSpace(`${u(c)} ${u(0x200b)}=1`), `'${u(c)} ${u(0x200b)}=1`); // mixed with spaces
    assert.equal(CSV.guardLeadingSpace(`${u(c)}plain`), `${u(c)}plain`); // no sign after: unchanged
  }
  assert.equal(CSV.guardLeadingSpace('=1+1'), '=1+1'); // a plain = first stays csv.js's job …
  assert.equal(CSV_WRITER.csvCell(CSV.guardLeadingSpace('=1+1')), "'=1+1"); // … which guards it
  // Through the whole row and writer: no written cell starts (after any space or invisible
  // character) with a formula sign or a look-alike, without the ' first.
  const lookAlike = CSV.csvRow(csvSample({ note: `${u(0xff1d)}cmd`, first_name: `${u(0x200b)}=1`, last_name: `${u(0x2212)}2`, class_name: `${u(0xfeff)}@x` }));
  for (const cell of lookAlike) {
    const written = CSV_WRITER.csvCell(cell);
    const inner = written.startsWith('"') ? written.slice(1, -1).replace(/""/g, '"') : written;
    assert.doesNotMatch(inner, /^[\s​-‍⁠﻿]*[=+\-@＝＋－＠−]/, JSON.stringify(cell));
  }
  // A safe cell is never changed: a plain note, a hyphen inside, an amount.
  assert.equal(CSV_WRITER.csvCell(CSV.csvRow(csvSample({ note: 'Well-done kicks' }))[8]), 'Well-done kicks');
  assert.equal(CSV.csvRow(csvSample())[11], '65.00');
  // Quoting (RFC 4180): commas, quote marks and line breaks stay inside ONE cell.
  const note = 'Kicks, "high" ones\nand turns';
  const row = CSV.csvRow(csvSample({ note, last_name: 'Kim, Jr.' }));
  const line = CSV_WRITER.toCsv(['a'], [row]).split('\r\n').slice(1).join('\r\n');
  assert.ok(line.includes('"Kicks, ""high"" ones\nand turns"'));
  assert.ok(line.includes('"Kim, Jr."'));
});

check('CB18 events mock: testing_results_csv — admins only, one log row, active students in roster order', () => {
  evReset();
  const before = evDb().downloads.length;
  // Refusals write nothing.
  assert.equal(evStatus('testing_results_csv', { p_event_id: DEFAULT_EVENT_ID }, E_DESK), 'not_allowed');
  assert.equal(evStatus('testing_results_csv', { p_event_id: DEFAULT_EVENT_ID }, E_LOCKED), 'no_access');
  assert.equal(ev.rpc('testing_results_csv', { p_event_id: DEFAULT_EVENT_ID }, E_ANON).error.code, '42501');
  assert.equal(evStatus('testing_results_csv', { p_event_id: null }, E_ADMIN), 'invalid');
  assert.equal(evStatus('testing_results_csv', { p_event_id: randomUUID() }, E_ADMIN), 'not_found');
  assert.equal(evDb().downloads.length, before);
  // A withdrawn student is left out (use one of the seed's active students).
  const d0 = evDb();
  const active0 = d0.registrations.filter((r) => r.event_id === DEFAULT_EVENT_ID && r.status === 'active');
  assert.ok(active0.length > 2);
  const out = active0[0];
  assert.equal(evStatus('testing_withdraw_student', { p_registration_id: out.id, p_expected_version: out.version }, E_ADMIN), 'ok');
  const answer = evCall('testing_results_csv', { p_event_id: DEFAULT_EVENT_ID }, E_ADMIN);
  assert.equal(answer.status, 'ok');
  const d = evDb();
  const event = d.events.find((e) => e.id === DEFAULT_EVENT_ID);
  assert.deepEqual(Object.keys(answer.event).sort(), ['id', 'location_code', 'location_name', 'name', 'testing_date']);
  assert.equal(answer.event.name, event.name);
  const active = d.registrations.filter((r) => r.event_id === DEFAULT_EVENT_ID && r.status === 'active');
  assert.equal(answer.rows.length, active.length);
  assert.equal(answer.rows.some((r) => r.registration_id === out.id), false);
  assert.ok(answer.rows.every(CSV.isCsvRow));
  // Exactly 0030's fields — never a signature, login id or staff name.
  assert.deepEqual(Object.keys(answer.rows[0]).sort(), ['class_name', 'current_belt', 'end_time', 'first_name', 'last_name', 'note', 'paid', 'paid_cents', 'paid_method', 'paid_on', 'paying_by', 'reference', 'registration_id', 'result', 'start_time', 'testing_for'].sort());
  // Roster order: class position, belt position, last name, first name.
  const key = (r) => {
    const reg = d.registrations.find((x) => x.id === r.registration_id);
    const rank = d.event_ranks.find((k) => k.id === reg.event_rank_id);
    const cls = d.event_classes.find((c) => c.id === rank.event_class_id);
    return [cls.position, rank.position, reg.last_name.toLowerCase(), reg.first_name.toLowerCase()];
  };
  for (let i = 1; i < answer.rows.length; i += 1) {
    const a = key(answer.rows[i - 1]);
    const b = key(answer.rows[i]);
    const c = a[0] - b[0] || a[1] - b[1] || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0) || (a[3] < b[3] ? -1 : a[3] > b[3] ? 1 : 0);
    assert.ok(c <= 0, `row ${i} out of order`);
  }
  // ONE log row: who, which event, how many rows.
  assert.equal(d.downloads.length, before + 1);
  const log = d.downloads[d.downloads.length - 1];
  assert.equal(log.event_id, DEFAULT_EVENT_ID);
  assert.equal(log.event_name, event.name);
  assert.equal(log.row_count, answer.rows.length);
  assert.equal(log.downloaded_by_name, 'Jeffrey Berg');
  // A second download is a second row.
  evCall('testing_results_csv', { p_event_id: DEFAULT_EVENT_ID }, E_ADMIN);
  assert.equal(evDb().downloads.length, before + 2);
  evReset();
});

await (async () => {
  const label = 'CB18 eventsApi: downloadResultsCsv reads ok and every other answer';
  try {
    evReset();
    cbRaw = null;
    // Admin, the preview database: ok, one call with 0030's argument name, the file's text.
    cbRpcCtx = E_ADMIN;
    const ok = await eventsApi.downloadResultsCsv({ eventId: DEFAULT_EVENT_ID, eventName: 'November Children Testing' });
    assert.equal(cbLastCall.name, 'testing_results_csv');
    assert.deepEqual(cbLastCall.args, { p_event_id: DEFAULT_EVENT_ID });
    assert.equal(ok.status, 'ok');
    assert.match(ok.fileName, /^November-Children-Testing-results-\d{4}-\d{2}-\d{2}\.csv$/);
    const active = evDb().registrations.filter((r) => r.event_id === DEFAULT_EVENT_ID && r.status === 'active');
    assert.equal(ok.rowCount, active.length);
    const lines = ok.text.split('\r\n');
    assert.equal(lines[0], CBT.CB_CSV_HEADINGS.join(','));
    assert.equal(lines.length, active.length + 2); // header + rows + '' after the last CRLF
    assert.equal(ok.text.charCodeAt(0) === 0xfeff, false); // the BOM is added only when the file is saved
    assert.equal(evDb().downloads.length, 1);
    // Staff: not_allowed; locked: no_access; nothing logged.
    cbRpcCtx = E_DESK;
    assert.deepEqual(await eventsApi.downloadResultsCsv({ eventId: DEFAULT_EVENT_ID, eventName: 'x' }), { status: 'not_allowed' });
    cbRpcCtx = E_LOCKED;
    assert.deepEqual(await eventsApi.downloadResultsCsv({ eventId: DEFAULT_EVENT_ID, eventName: 'x' }), { status: 'no_access' });
    cbRpcCtx = E_ADMIN;
    assert.deepEqual(await eventsApi.downloadResultsCsv({ eventId: randomUUID(), eventName: 'x' }), { status: 'not_found' });
    assert.deepEqual(await eventsApi.downloadResultsCsv({ eventName: 'x' }), { status: 'invalid' }); // no id → null
    assert.deepEqual(cbLastCall.args, { p_event_id: null });
    assert.equal(evDb().downloads.length, 1);
    // Hand-made answers: every refusal 0030 can give comes back as just { status }.
    const answer = (data) => { cbRaw = { data, error: null }; return eventsApi.downloadResultsCsv({ eventId: DEFAULT_EVENT_ID, eventName: 'E' }); };
    for (const s of ['no_access', 'not_allowed', 'invalid', 'not_found', 'stale']) {
      assert.deepEqual(await answer({ status: s, rows: [csvSample()] }), { status: s });
    }
    // ok with hand-made rows: the text is the rows' cells, written by csv.js.
    const one = await answer({ status: 'ok', event: {}, rows: [csvSample({ note: '=cmd' })] });
    assert.equal(one.status, 'ok');
    assert.equal(one.rowCount, 1);
    assert.equal(one.text.split('\r\n')[1], "CB-3101,Mia,Lopez,Group B,5:00 – 6:00 PM,Yellow,Orange,Passed,'=cmd,Cash,Yes,65.00,2026-11-02,Card,11111111-1111-4111-8111-111111111111");
    assert.equal((await answer({ status: 'ok', rows: [] })).rowCount, 0); // an event with nobody: the header only
    // canSave (EventPage: Hide private details still off, still an admin) is asked when the rows
    // ARRIVE: no → 'skipped', nothing built or saved (no text, no file name); yes → ok as before.
    let askedAfterCall = null;
    cbLastCall = null;
    const skipped = await eventsApi.downloadResultsCsv({
      eventId: DEFAULT_EVENT_ID, eventName: 'E',
      canSave: () => { askedAfterCall = cbLastCall?.name === 'testing_results_csv'; return false; },
    });
    assert.deepEqual(skipped, { status: 'skipped' });
    assert.equal(askedAfterCall, true);
    assert.equal((await eventsApi.downloadResultsCsv({ eventId: DEFAULT_EVENT_ID, eventName: 'E', canSave: () => true })).status, 'ok');
    // A refusal is returned as it is; canSave isn't asked (there are no rows to save).
    cbRaw = { data: { status: 'not_allowed' }, error: null };
    let asked = false;
    assert.deepEqual(await eventsApi.downloadResultsCsv({ eventId: DEFAULT_EVENT_ID, eventName: 'E', canSave: () => { asked = true; return false; } }), { status: 'not_allowed' });
    assert.equal(asked, false);
    // A wrong shape is an error, never a half-right file.
    for (const data of [{ status: 'ok' }, { status: 'ok', rows: null }, { status: 'ok', rows: [csvSample({ paid: 1 })] }, { status: 'ok', rows: [null] }]) {
      const r = await answer(data);
      assert.equal(r.status, 'error', JSON.stringify(data));
      assert.ok(r.error instanceof Error);
    }
    // Not a known status, no answer, a connection error, a throw: 'error', never a throw.
    for (const data of [{ status: 'weird' }, {}, null, 'ok']) assert.equal((await answer(data)).status, 'error', JSON.stringify(data));
    cbRaw = { data: null, error: { message: 'Failed to fetch' } };
    assert.equal((await eventsApi.downloadResultsCsv({ eventId: DEFAULT_EVENT_ID, eventName: 'E' })).status, 'error');
    cbRaw = () => { throw new Error('network down'); };
    assert.equal((await eventsApi.downloadResultsCsv({ eventId: DEFAULT_EVENT_ID, eventName: 'E' })).status, 'error');
    // The words around it.
    assert.equal(CBT.cbCsvDownloaded('E-results-2026-11-20.csv', 1), 'Downloaded E-results-2026-11-20.csv (1 student). It has payments and graders’ notes — keep it private.');
    assert.equal(CBT.cbCsvDownloaded('E.csv', 14).includes('(14 students)'), true);
    cbRaw = null;
    cbRpcCtx = E_DESK;
    evReset();
    count += 1;
  } catch (error) {
    console.error(`FAILED: ${label}`);
    throw error;
  }
})();

// ======================= Private testing: Mark paid with a way to pay (CB1, migration 0030 §3b) =======================

// The preview database's testing_private_mark_paid_by must follow 0030 §3b: refused in the order
// no_access → invalid → not_found → stale → cancelled → already_paid → price_changed (which writes
// nothing); the amount is what is still OWED (on a top-up only the rest); a way other than "Paying
// by" changes "Paying by" and the payment remembers the old one; Undo payment puts it back.
check('private mock: Mark paid with a way to pay (testing_private_mark_paid_by, 0030 §3b)', () => {
  pStart();
  const id = pAdd().id; // Liam Park, Group A Yellow: $85 private price, Paying by cash, not paid
  const by = (over = {}, ctx = E_DESK) => pCall('testing_private_mark_paid_by', pArgs(id, { p_method: 'card', p_expected_cents: 8500, ...over }), ctx);
  // invalid: a bad way, a missing way, a negative or missing amount, a missing id or version.
  assert.equal(by({ p_method: 'venmo' }).status, 'invalid');
  assert.equal(by({ p_method: null }).status, 'invalid');
  assert.equal(by({ p_expected_cents: -1 }).status, 'invalid');
  assert.equal(by({ p_expected_cents: null }).status, 'invalid');
  assert.equal(by({ p_expected_version: null }).status, 'invalid');
  assert.equal(by({ p_private_id: '00000000-0000-4000-8000-00000000dead' }).status, 'not_found');
  assert.equal(by({}, E_LOCKED).status, 'no_access'); // has_data_access first
  // stale comes before price_changed (an old version AND a wrong amount → stale).
  assert.equal(by({ p_expected_version: privRow(id).version + 1, p_expected_cents: 1 }).status, 'stale');
  // price_changed: the box showed another amount → the amount owed comes back, NOTHING is saved.
  const before = JSON.stringify(evDb());
  assert.deepEqual(by({ p_expected_cents: 9500 }), { status: 'price_changed', amount_cents: 8500 });
  assert.equal(JSON.stringify(evDb()), before);
  // ok, a different way than "Paying by" (cash → card): "Paying by" becomes card, cash is remembered.
  const v0 = privRow(id).version;
  const paid = by();
  assert.deepEqual({ ...paid, payment_id: 'x' }, { status: 'ok', payment_id: 'x', amount_cents: 8500, method: 'card', paid_on: PT, paying_by: 'card', version: v0 + 1 });
  const pay = evDb().private_payments.find((p) => p.id === paid.payment_id);
  assert.deepEqual([pay.kind, pay.amount_cents, pay.method, pay.paid_on, pay.paying_by_before], ['payment', 8500, 'card', PT, 'cash']);
  assert.equal(privRow(id).paying_by, 'card');
  // A double click (the old version) → stale; then already_paid, which comes before price_changed.
  assert.equal(by({ p_expected_version: v0 }).status, 'stale');
  assert.equal(by().status, 'already_paid');
  assert.equal(by({ p_expected_cents: 1 }).status, 'already_paid');
  // Undo payment (same desk, inside 10 seconds) puts the family's "Paying by" back.
  assert.equal(pCall('testing_private_undo_payment', { p_payment_id: paid.payment_id }, E_DESK).status, 'ok');
  assert.equal(privRow(id).paying_by, 'cash');
  // A top-up (E2): Mia paid $65 cash at the event, so only the $20 still owed is asked for.
  const m = pMove('CB-3107').private_id;
  const mBy = (over = {}) => pCall('testing_private_mark_paid_by', pArgs(m, { p_method: 'cash', p_expected_cents: 2000, ...over }));
  assert.deepEqual(mBy({ p_expected_cents: 8500 }), { status: 'price_changed', amount_cents: 2000 }); // the full price is wrong
  const topUp = mBy();
  assert.deepEqual([topUp.status, topUp.amount_cents, topUp.method], ['ok', 2000, 'cash']);
  assert.equal(privNet(m), 8500);
  assert.equal(mBy().status, 'already_paid');
  // Cancelled comes before already_paid and price_changed.
  const c = pAdd({ p_first: 'Cara' }).id;
  assert.equal(pCall('testing_private_cancel', pArgs(c)).status, 'ok');
  assert.equal(pCall('testing_private_mark_paid_by', pArgs(c, { p_method: 'cash', p_expected_cents: 1 })).status, 'cancelled');
  evReset();
});

// privateApi.js's markPrivatePaidBy, checked end to end through the same stand-in connection as
// eventsApi above (the module hook is already registered).
const privateApi = await import('./privateApi.js');

await (async () => {
  const label = 'privateApi: markPrivatePaidBy reads ok, price_changed and the other answers';
  try {
    pStart();
    cbRaw = null;
    cbRpcCtx = E_DESK;
    const id = pAdd().id;
    const args = (over = {}) => ({ privateId: id, expectedVersion: privRow(id).version, method: 'check', expectedCents: 8500, ...over });
    // It calls testing_private_mark_paid_by with exactly 0030's argument names, plus 0044's
    // p_school (null when none is given).
    const changed = await privateApi.markPrivatePaidBy(args({ expectedCents: 2000 }));
    assert.equal(cbLastCall.name, 'testing_private_mark_paid_by');
    assert.deepEqual(cbLastCall.args, { p_private_id: id, p_expected_version: privRow(id).version, p_method: 'check', p_expected_cents: 2000, p_school: null });
    assert.deepEqual(changed, { status: 'price_changed', amountCents: 8500 });
    assert.equal((await privateApi.markPrivatePaidBy(args({ school: 'nowhere' }))).status, 'invalid');
    const v0 = privRow(id).version;
    const paid = await privateApi.markPrivatePaidBy(args({ school: 'shrewsbury' }));
    assert.deepEqual({ ...paid, paymentId: 'x' }, { status: 'ok', paymentId: 'x', amountCents: 8500, method: 'check', paidOn: PT, payingBy: 'check', version: v0 + 1 });
    // R1-01: the desk's school is stored (and readable on testing_private_payments).
    assert.equal(evDb().private_payments.find((p) => p.id === paid.paymentId).school, 'shrewsbury');
    assert.deepEqual(await privateApi.markPrivatePaidBy(args({ expectedVersion: v0 })), { status: 'stale' });
    assert.deepEqual(await privateApi.markPrivatePaidBy(args()), { status: 'already_paid' });
    cbRpcCtx = E_LOCKED;
    assert.deepEqual(await privateApi.markPrivatePaidBy(args()), { status: 'no_access' });
    cbRpcCtx = E_DESK;
    // Hand-made answers.
    const answer = (data) => { cbRaw = { data, error: null }; return privateApi.markPrivatePaidBy(args()); };
    const okRow = { status: 'ok', payment_id: 'p1', amount_cents: 2000, method: 'cash', paid_on: PT, paying_by: 'cash', version: 4 };
    assert.deepEqual(await answer(okRow), { status: 'ok', paymentId: 'p1', amountCents: 2000, method: 'cash', paidOn: PT, payingBy: 'cash', version: 4 });
    assert.deepEqual(await answer({ ...okRow, paid_on: undefined, paying_by: undefined }), { status: 'ok', paymentId: 'p1', amountCents: 2000, method: 'cash', paidOn: null, payingBy: 'cash', version: 4 });
    for (const bad of [{ payment_id: '' }, { amount_cents: '2000' }, { amount_cents: 20.5 }, { method: '' }, { version: null }]) {
      assert.equal((await answer({ ...okRow, ...bad })).status, 'error', JSON.stringify(bad));
    }
    assert.deepEqual(await answer({ status: 'price_changed', amount_cents: 2000 }), { status: 'price_changed', amountCents: 2000 });
    for (const bad of [undefined, null, '2000', 20.5, true]) {
      const r = await answer({ status: 'price_changed', amount_cents: bad });
      assert.equal(r.status, 'error', String(bad));
      assert.equal('amountCents' in r, false);
    }
    // Every other status 0030 §3b can give (cancelled included) comes back as just { status }.
    for (const s of ['already_paid', 'cancelled', 'stale', 'not_found', 'invalid', 'no_access']) {
      assert.deepEqual(await answer({ status: s, amount_cents: 2000 }), { status: s });
    }
    for (const data of [{ status: 'weird' }, { status: 'error' }, {}, null]) assert.equal((await answer(data)).status, 'error', JSON.stringify(data));
    cbRaw = { data: null, error: { message: 'Failed to fetch' } };
    assert.equal((await privateApi.markPrivatePaidBy(args())).status, 'error');
    cbRaw = () => { throw new Error('network down'); };
    assert.equal((await privateApi.markPrivatePaidBy(args())).status, 'error');
    // The old one-click wrapper is gone (nothing in the app calls testing_private_mark_paid).
    assert.equal('markPrivatePaid' in privateApi, false);
    cbRaw = null;
    evReset();
    count += 1;
  } catch (error) {
    console.error(`FAILED: ${label}`);
    throw error;
  }
})();

// The Mark paid box's "They chose … on the form / at the desk." (M-01 = C-01, migration 0044):
// the database keeps the family form's own choice (paying_by_on_form, set once, never changed;
// none for a desk add; carried by Move to private testing) and markPaidChoiceWhere says 'form'
// only while Paying by still equals it — on the event roster and the Private testing tab alike.
await (async () => {
  const label = 'M-01: paying_by_on_form through the API; the Mark paid hint says "on the form" only while Paying by is the form\'s choice';
  try {
    pStart();
    cbRaw = null;
    cbFromFail = null;
    cbRpcCtx = E_DESK;
    const ER = await import('./eventRules.js');
    // Pure: 'form' only when payingByOnForm is set and equals payingBy. A missing choice is 'desk'
    // (NOT Camps' default: here it means "added at the desk"). privateRules re-exports the same one.
    assert.equal(PR.markPaidChoiceWhere, ER.markPaidChoiceWhere);
    assert.equal(ER.markPaidChoiceWhere({ payingBy: 'check', payingByOnForm: 'check' }), 'form');
    assert.equal(ER.markPaidChoiceWhere({ payingBy: 'cash', payingByOnForm: 'check' }), 'desk');
    for (const onForm of [null, undefined, '']) assert.equal(ER.markPaidChoiceWhere({ payingBy: 'cash', payingByOnForm: onForm }), 'desk');
    assert.equal(ER.markPaidChoiceWhere({ payingBy: 'cash' }), 'desk');
    assert.equal(ER.markPaidChoiceWhere(null), 'desk');

    const roster = async () => {
      const res = await eventsApi.loadEvent(DEFAULT_EVENT_ID);
      assert.equal(res.status, 'ok', String(res.error?.message ?? res.error));
      return (ref) => res.roster.find((r) => r.reference === ref);
    };
    // Event roster: Noah Kim (family form, Check) → "on the form".
    let rowOf = await roster();
    assert.deepEqual([rowOf('CB-3102').payingByOnForm, ER.markPaidChoiceWhere(rowOf('CB-3102'))], ['check', 'form']);
    // A student added at the desk (Ryan Patel, seeded) → "at the desk".
    assert.deepEqual([rowOf('CB-3115').payingByOnForm, ER.markPaidChoiceWhere(rowOf('CB-3115'))], [null, 'desk']);
    // Change how they'll pay → Cash: "at the desk"; back to Check: "on the form" again.
    const noah = () => regBy('CB-3102');
    const change = (to) => evCall('testing_change_paying_by', { p_registration_id: noah().id, p_expected_version: noah().version, p_paying_by: to }, E_DESK);
    assert.equal(change('cash').status, 'ok');
    rowOf = await roster();
    assert.deepEqual([rowOf('CB-3102').payingBy, rowOf('CB-3102').payingByOnForm, ER.markPaidChoiceWhere(rowOf('CB-3102'))], ['cash', 'check', 'desk']);
    assert.equal(change('check').status, 'ok');
    rowOf = await roster();
    assert.equal(ER.markPaidChoiceWhere(rowOf('CB-3102')), 'form');
    // Mark paid by Card (Paying by becomes Card: "at the desk"), then Undo payment (admin): back to
    // Check, "on the form".
    const markNoah = (cents) => evCall('testing_mark_paid_by', { p_registration_id: noah().id, p_expected_version: noah().version, p_method: 'card', p_expected_cents: cents }, E_DESK);
    const asked = markNoah(0); // price_changed tells today's amount, nothing saved
    assert.equal(asked.status, 'price_changed');
    const paid = markNoah(asked.amount_cents);
    assert.equal(paid.status, 'ok', JSON.stringify(paid));
    rowOf = await roster();
    assert.deepEqual([rowOf('CB-3102').payingBy, ER.markPaidChoiceWhere(rowOf('CB-3102'))], ['card', 'desk']);
    assert.equal(evCall('testing_undo_payment', { p_payment_id: paid.payment_id }, E_ADMIN).status, 'ok');
    rowOf = await roster();
    assert.deepEqual([rowOf('CB-3102').payingBy, rowOf('CB-3102').payingByOnForm, ER.markPaidChoiceWhere(rowOf('CB-3102'))], ['check', 'check', 'form']);
    // A desk add has none, whatever the caller sends.
    const added = evCall('testing_add_student', { p_event_id: DEFAULT_EVENT_ID, p_first: 'Dana', p_last: 'Desk', p_event_rank_id: eventRankByName('Group A', 'Yellow').id, p_stripes: true, p_paying_by: 'check' }, E_DESK);
    assert.equal(added.status, 'ok');
    assert.equal(regBy(added.reference).paying_by_on_form, null);

    // Private testing tab.
    const load = async () => {
      const res = await privateApi.loadPrivateTestings('worcester');
      assert.equal(res.status, 'ok');
      return (id) => res.rows.find((r) => r.id === id);
    };
    // Move a form registration (Zoe Park, Check): the private testing carries the choice.
    const formMove = pMove('CB-3112', '2026-12-01', '16:00');
    assert.equal(formMove.status, 'ok');
    // Undo move (the mover, within 10 seconds): back on the roster, still "on the form".
    assert.equal(pCall('testing_private_undo_move', pArgs(formMove.private_id)).status, 'ok');
    rowOf = await roster();
    assert.deepEqual([rowOf('CB-3112').status, rowOf('CB-3112').payingByOnForm, ER.markPaidChoiceWhere(rowOf('CB-3112'))], ['active', 'check', 'form']);
    // Move again: "on the form" on the Private testing tab too.
    const again = pMove('CB-3112', '2026-12-01', '16:00');
    assert.equal(again.status, 'ok');
    let pRowOf = await load();
    assert.deepEqual([pRowOf(again.private_id).payingByOnForm, PR.markPaidChoiceWhere(pRowOf(again.private_id))], ['check', 'form']);
    // Change how they'll pay → Card: "at the desk".
    assert.equal(pCall('testing_private_change_paying_by', pArgs(again.private_id, { p_paying_by: 'card' })).status, 'ok');
    pRowOf = await load();
    assert.deepEqual([pRowOf(again.private_id).payingByOnForm, PR.markPaidChoiceWhere(pRowOf(again.private_id))], ['check', 'desk']);
    // A desk student moved, and one added here: none → "at the desk".
    const deskMove = pMove(added.reference, '2026-12-01', '17:00');
    assert.equal(deskMove.status, 'ok');
    const here = pAdd({ p_first: 'Hana' }).id;
    pRowOf = await load();
    assert.deepEqual([pRowOf(deskMove.private_id).payingByOnForm, PR.markPaidChoiceWhere(pRowOf(deskMove.private_id))], [null, 'desk']);
    assert.deepEqual([pRowOf(here).payingByOnForm, PR.markPaidChoiceWhere(pRowOf(here))], [null, 'desk']);
    // The seeded Ava Chen (moved from a form registration, Cash) → "on the form" (the default
    // preview data, which pStart empties, so it is read from a fresh reset here).
    evReset();
    ev.reset();
    pRowOf = await load();
    const ava = evDb().private.find((p) => p.first_name === 'Ava' && p.last_name === 'Chen');
    assert.deepEqual([pRowOf(ava.id).payingByOnForm, PR.markPaidChoiceWhere(pRowOf(ava.id))], ['cash', 'form']);
    // Every seeded payment has its school (R1-01): the event's / private testing's, Worcester.
    for (const p of [...evDb().payments, ...evDb().private_payments]) assert.equal(p.school, 'worcester');
    evReset();
    count += 1;
  } catch (error) {
    console.error(`FAILED: ${label}`);
    throw error;
  }
})();

// 0044 in the preview database: R1-01 (the school travels with Undo, Edit, Move and Undo move;
// the old 4-input call still works), M-01's fill of a store saved before 0044, and R2-02's
// testing_undo_event_edit (one call, all or nothing) through eventsApi.undoEventEdit.
await (async () => {
  const label = '0044 mock: payment school copies, the pre-0044 store fill, and Edit event\'s one-call Undo';
  try {
    // --- R1-01 on the event side ---
    pStart();
    cbRaw = null;
    cbRpcCtx = E_DESK;
    const schoolOf = (id) => [...evDb().payments, ...evDb().private_payments].find((p) => p.id === id).school;
    const sam = () => regBy('CB-3110');
    const markSam = (cents, extra = {}) => evCall('testing_mark_paid_by', { p_registration_id: sam().id, p_expected_version: sam().version, p_method: 'cash', p_expected_cents: cents, ...extra }, E_DESK);
    const cents = markSam(0).amount_cents;
    // Blank = the event's school; the old 4-input call (no p_school) is still accepted.
    const first = markSam(cents, { p_school: '  ' });
    assert.equal(first.status, 'ok');
    assert.equal(schoolOf(first.payment_id), 'worcester');
    assert.equal(evCall('testing_undo_payment', { p_payment_id: first.payment_id }, E_ADMIN).status, 'ok');
    const second = markSam(cents);
    assert.equal(second.status, 'ok');
    assert.equal(schoolOf(second.payment_id), 'worcester');
    assert.equal(evCall('testing_undo_payment', { p_payment_id: second.payment_id }, E_ADMIN).status, 'ok');
    // Shrewsbury's desk takes Worcester event money: the undo reversal keeps Shrewsbury.
    const away = markSam(cents, { p_school: 'shrewsbury' });
    assert.equal(schoolOf(away.payment_id), 'shrewsbury');
    // Edit payment: the reversal AND the new payment copy the edited payment's school.
    const edited = evCall('testing_edit_payment', { p_payment_id: away.payment_id, p_method: 'check', p_amount_cents: cents, p_paid_on: evToday }, E_ADMIN);
    assert.equal(edited.status, 'ok');
    assert.equal(schoolOf(edited.payment_id), 'shrewsbury');
    assert.equal(evDb().payments.find((p) => p.reverses_payment_id === away.payment_id).school, 'shrewsbury');
    // Move to private: the event reversal and the private payment copy it; Undo move brings it back.
    const moved = pMove('CB-3110', '2026-12-01', '16:00');
    assert.equal(moved.status, 'ok');
    assert.equal(evDb().payments.find((p) => p.reverses_payment_id === edited.payment_id).school, 'shrewsbury');
    assert.equal(evDb().private_payments.find((p) => p.moved_from_payment_id === edited.payment_id).school, 'shrewsbury');
    assert.equal(pCall('testing_private_undo_move', pArgs(moved.private_id)).status, 'ok');
    const back = evDb().payments.filter((p) => p.registration_id === sam().id && p.kind === 'payment').at(-1);
    assert.equal(back.school, 'shrewsbury');
    // The school is NOT readable on testing_payments (0005 lists its columns), but is on private.
    assert.equal(ev.select('testing_payments', 'school', [], [], E_ADMIN).error.code, '42501');
    assert.equal(ev.select('testing_private_payments', 'school', [], [], E_ADMIN).error, null);

    // --- The fill of a store saved before 0044 ---
    evReset();
    ev.reset();
    const old = evDb();
    const noahReg = old.registrations.find((r) => r.reference === 'CB-3102');
    for (const r of old.registrations) delete r.paying_by_on_form;
    for (const p of old.private) delete p.paying_by_on_form;
    for (const p of [...old.payments, ...old.private_payments]) delete p.school;
    old.change_log.push({ table_name: 'testing_registrations', op: 'insert', record_id: noahReg.id, after: { paying_by: 'check' }, seq: 1 });
    evMemory = old;
    const filled = evDb();
    // A form registration with its insert row → the form's choice; without one → EMPTY (never
    // today's Paying by); a desk one → empty. Ava's private testing follows her (empty) registration.
    assert.equal(filled.registrations.find((r) => r.reference === 'CB-3102').paying_by_on_form, 'check');
    assert.equal(filled.registrations.find((r) => r.reference === 'CB-3101').paying_by_on_form, null);
    assert.equal(filled.registrations.find((r) => r.reference === 'CB-3115').paying_by_on_form, null);
    assert.equal(filled.private.find((p) => p.first_name === 'Ava').paying_by_on_form, null);
    for (const p of [...filled.payments, ...filled.private_payments]) assert.equal(p.school, 'worcester');

    // --- R2-02: Edit event's Undo in one call (admins) ---
    evReset();
    cbRpcCtx = E_ADMIN;
    const loaded = await eventsApi.loadEvent(DEFAULT_EVENT_ID);
    assert.equal(loaded.status, 'ok');
    const ev0 = loaded.event;
    const old0 = { name: ev0.name, testingDate: ev0.testingDate, classes: loaded.classes, autoCloseOn: ev0.autoCloseOn, note: ev0.note };
    // The "edit": a new name and registration closed.
    const renamed = await eventsApi.updateEvent({ eventId: ev0.id, expectedVersion: ev0.version, ...old0, name: 'November Kids' });
    assert.equal(renamed.status, 'ok');
    const closed = await eventsApi.setRegistration({ eventId: ev0.id, expectedVersion: renamed.version, open: false });
    assert.equal(closed.status, 'ok');
    // A dropped connection: nothing changed, and Retry (the same call) works.
    ev.failNextSave();
    assert.equal((await eventsApi.undoEventEdit({ eventId: ev0.id, expectedVersion: closed.version, ...old0, open: true })).status, 'error');
    assert.deepEqual([eventRow().name, eventRow().registration_open, eventRow().version], ['November Kids', false, closed.version]);
    const undone = await eventsApi.undoEventEdit({ eventId: ev0.id, expectedVersion: closed.version, ...old0, open: true });
    assert.equal(undone.status, 'ok', JSON.stringify(undone));
    assert.equal(cbLastCall.name, 'testing_undo_event_edit');
    assert.deepEqual(Object.keys(cbLastCall.args).sort(), ['p_auto_close_on', 'p_classes', 'p_event_id', 'p_expected_version', 'p_name', 'p_note', 'p_open', 'p_testing_date']);
    assert.deepEqual([eventRow().name, eventRow().registration_open, eventRow().version], [ev0.name, true, undone.version]);
    assert.equal(typeof undone.state, 'string');
    // open: null leaves the switch alone (an edit that didn't change it).
    const r2 = await eventsApi.updateEvent({ eventId: ev0.id, expectedVersion: undone.version, ...old0, name: 'November Kids' });
    const leave = await eventsApi.undoEventEdit({ eventId: ev0.id, expectedVersion: r2.version, ...old0, open: null });
    assert.equal(leave.status, 'ok');
    assert.equal(cbLastCall.args.p_open, null);
    assert.deepEqual([eventRow().name, eventRow().registration_open], [ev0.name, true]);
    // All or nothing: the details pass but the switch is refused (the event is finished) → the
    // refusal comes back as it came, and the details are NOT changed either.
    const r3 = await eventsApi.updateEvent({ eventId: ev0.id, expectedVersion: leave.version, ...old0, name: 'November Kids' });
    evToday = '2026-11-21';
    const half = await eventsApi.undoEventEdit({ eventId: ev0.id, expectedVersion: r3.version, ...old0, open: false });
    assert.equal(half.status, 'finished');
    assert.deepEqual([eventRow().name, eventRow().version], ['November Kids', r3.version]);
    evToday = '2026-10-17';
    // An old version → stale, nothing changed; staff → not_allowed.
    assert.equal((await eventsApi.undoEventEdit({ eventId: ev0.id, expectedVersion: 1, ...old0, open: null })).status, 'stale');
    cbRpcCtx = E_DESK;
    assert.equal((await eventsApi.undoEventEdit({ eventId: ev0.id, expectedVersion: r3.version, ...old0, open: null })).status, 'not_allowed');
    assert.equal(eventRow().name, 'November Kids');
    evReset();
    count += 1;
  } catch (error) {
    console.error(`FAILED: ${label}`);
    throw error;
  }
})();

// ======================= Private testing: the receipt and the Undo payment box (CB2, CB3) =======================

check('receipt: a private testing as the tab builds it (CB2) — Total due = the private price; an undone top-up drops its line', () => {
  pStart();
  const m = pMove('CB-3107').private_id; // Mia: $65 cash at the event moved with her; $85 private price
  const top = pCall('testing_private_mark_paid_by', pArgs(m, { p_method: 'card', p_expected_cents: 2000 }));
  assert.equal(top.status, 'ok');
  const row = privRow(m);
  // The payments as privateApi gives them (camelCase), every row of this private testing.
  const asApp = () => privPayments(m).map((p) => ({
    id: p.id, kind: p.kind, amountCents: p.amount_cents, method: p.method, paidOn: p.paid_on, recordedAt: p.recorded_at, reversesPaymentId: p.reverses_payment_id ?? null,
  }));
  const build = () => buildColorBeltReceipt({
    firstName: row.first_name, lastName: row.last_name, rankName: row.rank_name, testingForName: row.to_name ?? null,
    privateTesting: { privateOn: row.private_date, privateTime: row.private_time.slice(0, 5), movedFromEventName: row.moved_from_event_name },
    className: row.class_name, locationCode: row.location_code, reference: null,
    payments: asApp(), totalDueCents: row.private_cents, schools: [], printedOn: PT, printedByName: 'Jeffrey Berg',
  });
  const r = build();
  assert.deepEqual(r.facts.map((f) => f[0]), ['Student', 'Private testing', 'Moved from', 'Class', 'School']);
  assert.equal(r.facts[2][1], row.moved_from_event_name);
  assert.deepEqual(r.lines.map((l) => [l.forText, l.how, l.amountCents]), [['Testing fee', 'cash', 6500], ['Testing fee', 'card', 2000]]);
  assert.equal(r.totalDueCents, 8500);
  assert.equal(r.paidCents, 8500);
  // An admin undoes the top-up: its line and its reversal are left out; $65 paid of $85.
  assert.equal(pCall('testing_private_undo_payment', { p_payment_id: top.payment_id }, E_ADMIN).status, 'ok');
  const after = build();
  assert.deepEqual(after.lines.map((l) => l.amountCents), [6500]);
  assert.equal(after.paidCents, 6500);
  assert.equal(after.totalDueCents - after.paidCents, 2000);
  evReset();
});

check('text: the private Undo payment box names the latest payment and what the row becomes (CB3)', () => {
  // A top-up undone: back to "Paid $65 · $20 more to collect".
  assert.equal(
    CBT.privateUndoPaymentBody(2000, 'cash', '2026-11-03', { paidCents: 6500, dueCents: 2000 }),
    'Paid on Nov 3. The row goes back to Paid $65 · $20 more to collect. Both stay in the history.',
  );
  // The only payment undone: back to Not paid (as the event roster's words).
  assert.equal(
    CBT.privateUndoPaymentBody(8500, 'card', '2026-11-03', { paidCents: 0, dueCents: 8500 }),
    'Paid on Nov 3. The row goes back to Not paid. Both stay in the history.',
  );
  // Still paid in full after the undo (paid more than the price before): back to Paid.
  assert.match(CBT.privateUndoPaymentBody(1000, 'check', '2026-11-03', { paidCents: 9000, dueCents: 0 }), /goes back to Paid\. Both/);
  assert.match(CBT.privateUndoPaymentBody(1000, 'check', '2026-11-03', null), /goes back to Not paid\./);
  assert.equal(CBT.privatePriceChangedNote('Ava Chen', 2000), 'The amount owed for Ava Chen is now $20. Nothing was saved. Tap Mark paid again.');
});

check('words: batch 2 — the shared sentences reach Color Belt unchanged (R1-06, R1-07, R2-07, R3-13)', () => {
  assert.equal(CBT.undoPaymentTitle('Ava Chen', 6500, 'cash'), "Undo Ava Chen's $65 cash payment?"); // R1-06
  assert.equal(CBT.undoPaymentBody(6500, 'cash', '2026-11-03'), 'Paid on Nov 3. The row goes back to Not paid. Both stay in the history.');
  assert.equal(CBT.markedPaidToast('Ava Chen', 6500, 'cash'), 'Ava Chen marked paid · $65 cash'); // R1-07
  assert.equal(CBT.markedPaidToastHidden('Ava Chen'), 'Ava Chen marked paid');
  assert.equal(CBT.paymentUndoneToast('Ava Chen'), 'Payment undone for Ava Chen');
  assert.equal(CBT.someoneElseChanged('Ava Chen'), 'Someone else changed Ava Chen just now, so nothing was done. Their change is shown.'); // R2-07
  assert.equal(CBT.couldntUndo('a result was recorded just now'), "Couldn't undo: a result was recorded just now.");
  assert.equal(CBT.UNDO_DIDNT_SAVE, "Undo didn't save. Check the connection, then retry.");
  assert.equal(CBT.UNDO_FAILED, CBT.UNDO_DIDNT_SAVE); // the old name says the same thing
  assert.equal(CBT.PAST_DATES_HINT, "Past days can't be chosen."); // R3-13
  // Camps re-exports these old names from this file until it has switched: they must still exist as words
  for (const name of ['STALE', 'UNDO_STALE', 'UNDO_FAILED', 'ROSTER_STALE', 'markPaidFailed', 'paymentUndoneToast']) {
    assert.ok(CBT[name] !== undefined, `${name} is still exported (Camps re-exports it)`);
  }
});

// ======================= history.js (CB7, migration 0030 §5, rulebook v0.421, mockup P3) =======================
// Every change-log action Color Belt writes (0005, 0010, 0014, 0030) gets words; money rows are
// left out while Hide private details is on; Edit payment is one entry; the reader throws unless ok.

// A change-log row as the readers give it (database names).
const hRow = (table, op, action, before = null, after = null, at = '2026-11-01T19:00:00Z', who = 'Dana Ross') => ({
  occurred_at: at, actor_name: who, action, table_name: table, op, before, after,
});
const words = (row, ctx = {}) => describeHistoryRow(row, ctx);
const textOf = (row, ctx = {}) => words(row, ctx)?.text ?? null;

check('history: event registration rows — every action has words (CB7)', () => {
  const R = 'testing_registrations';
  // public_register / add_student (the insert row); a possible duplicate found at once
  assert.deepEqual(words(hRow(R, 'insert', 'public_register', null, { source: 'form', duplicate_state: 'none' }, '2026-10-26T22:00:00Z', 'Family form')),
    { text: 'Registered on the family form', at: '2026-10-26T22:00:00Z', who: 'Family form' });
  assert.equal(textOf(hRow(R, 'insert', 'add_student', null, { source: 'staff', duplicate_state: 'possible' })), 'Added at the desk; Possible duplicate found');
  // update_student: names and the belt, one entry joined with "; " (names the event's ranks)
  const rankName = (id) => ({ r1: 'White', r2: 'Yellow' })[id] ?? '';
  assert.equal(textOf(hRow(R, 'update', 'update_student', { first_name: 'Owen', event_rank_id: 'r1', version: 2 }, { first_name: 'Owen J.', event_rank_id: 'r2', version: 3 }), { rankName }),
    'First name: Owen → Owen J.; Belt: White → Yellow');
  assert.equal(textOf(hRow(R, 'update', 'update_student', { last_name: 'Reed' }, { last_name: 'Reid' })), 'Last name: Reed → Reid');
  assert.equal(textOf(hRow(R, 'update', 'update_student', { event_rank_id: 'x' }, { event_rank_id: 'y' })), 'Belt changed'); // ranks unknown
  // change_paying_by / Mark paid or Edit payment by another way (money)
  const paying = hRow(R, 'update', 'change_paying_by', { paying_by: 'check', version: 3 }, { paying_by: 'cash', version: 4 });
  assert.equal(textOf(paying), 'Paying by changed: Check → Cash');
  assert.deepEqual(words(paying, { hidden: true }), { hiddenPayment: true });
  // Mark paid's own registration update (version only) says nothing: one entry per change
  assert.equal(words(hRow(R, 'update', 'mark_paid', { version: 4, updated_at: 'a' }, { version: 5, updated_at: 'b' })), null);
  // withdraw_student / restore_student / resolve_duplicate
  assert.equal(textOf(hRow(R, 'update', 'withdraw_student', { status: 'active' }, { status: 'withdrawn', withdrawn_reason: 'withdrawn' })), 'Withdrawn');
  assert.equal(textOf(hRow(R, 'update', 'restore_student', { status: 'withdrawn', withdrawn_reason: 'withdrawn' }, { status: 'active', withdrawn_reason: null })), 'Restored');
  assert.equal(textOf(hRow(R, 'update', 'resolve_duplicate', { status: 'active', duplicate_state: 'possible' }, { status: 'withdrawn', withdrawn_reason: 'duplicate_copy', duplicate_state: 'none' })),
    'Moved to Removed as a duplicate copy');
  assert.equal(textOf(hRow(R, 'update', 'resolve_duplicate', { duplicate_state: 'possible' }, { duplicate_state: 'none' })), 'Possible duplicate: kept this registration');
  assert.equal(textOf(hRow(R, 'update', 'resolve_duplicate', { duplicate_state: 'possible' }, { duplicate_state: 'kept_both' })), 'Possible duplicate: kept both registrations');
  assert.equal(textOf(hRow(R, 'update', 'public_register', { duplicate_state: 'none' }, { duplicate_state: 'possible' })), 'Possible duplicate found');
  // move_to_private / undo_move_to_private (the registration's side)
  assert.equal(textOf(hRow(R, 'update', 'move_to_private', { status: 'active', duplicate_state: 'none' }, { status: 'withdrawn', withdrawn_reason: 'withdrawn' })), 'Moved to private testing');
  assert.equal(textOf(hRow(R, 'update', 'undo_move_to_private', { status: 'withdrawn' }, { status: 'active' })), 'Move to private testing undone');
  // purge_old_signatures (the signature only ever "on file")
  assert.equal(textOf(hRow(R, 'update', 'purge_old_signatures', { signature: 'on file', signature_deleted_at: null }, { signature: null, signature_deleted_at: 'x' })),
    'Signature deleted (90 days after the testing day)');
  // delete_student (the reader answers not_found afterwards, but the words exist)
  assert.equal(textOf(hRow(R, 'delete', 'delete_student', { status: 'active' }, null)), 'Deleted');
  // Kept while hidden: registered / added (Star's Q4 A)
  assert.equal(textOf(hRow(R, 'insert', 'public_register', null, { source: 'form' }), { hidden: true }), 'Registered on the family form');
  // who: the log's name, or "Staff" when it has none
  assert.equal(words(hRow(R, 'insert', 'add_student', null, { source: 'staff' }, '2026-11-01T19:00:00Z', null)).who, 'Staff');
});

check('history: payment rows — recorded, undone, changed, moved (money; CB7)', () => {
  const P = 'testing_payments';
  const pay = (action, after) => hRow(P, 'insert', action, null, after);
  assert.equal(textOf(pay('mark_paid', { id: 'p1', kind: 'payment', amount_cents: 6500, method: 'check', paid_on: '2026-11-01' })), 'Payment recorded: $65 check, paid Nov 1'); // P3
  assert.equal(textOf(pay('undo_payment', { kind: 'reversal', amount_cents: -6500, method: 'check', paid_on: '2026-10-30', reverses_payment_id: 'p1' })), 'Payment undone: $65'); // P3
  assert.equal(textOf(pay('move_to_private', { kind: 'reversal', amount_cents: -6500, method: 'cash', reverses_payment_id: 'p1' })), 'Payment moved to private testing: $65 cash');
  assert.equal(textOf(pay('undo_move_to_private', { kind: 'payment', amount_cents: 6500, method: 'cash', paid_on: '2026-10-30' })), 'Payment moved back from private testing: $65 cash, paid Oct 30');
  assert.equal(textOf(pay('manual', { kind: 'payment', amount_cents: 13050, method: 'card', paid_on: '2026-10-30' })), 'Payment recorded: $130.50 card, paid Oct 30'); // cents show
  // Every payment row is money: left out while hidden
  for (const action of ['mark_paid', 'undo_payment', 'edit_payment', 'move_to_private', 'undo_move_to_private']) {
    assert.deepEqual(words(pay(action, { kind: 'payment', amount_cents: 6500, method: 'cash', paid_on: '2026-10-30' }), { hidden: true }), { hiddenPayment: true }, action);
  }
  // Edit payment = a reversal + a new payment in one save → ONE entry with only what changed
  const orig = hRow(P, 'insert', 'mark_paid', null, { id: 'p1', kind: 'payment', amount_cents: 6500, method: 'check', paid_on: '2026-11-01' }, '2026-11-01T19:00:00Z');
  const rev = hRow(P, 'insert', 'edit_payment', null, { id: 'p2', kind: 'reversal', amount_cents: -6500, method: 'check', paid_on: '2026-11-01', reverses_payment_id: 'p1' }, '2026-11-01T21:30:00Z', 'Jeffrey Berg');
  const fresh = hRow(P, 'insert', 'edit_payment', null, { id: 'p3', kind: 'payment', amount_cents: 6500, method: 'cash', paid_on: '2026-11-01' }, '2026-11-01T21:30:00Z', 'Jeffrey Berg');
  const joined = combineHistoryRows([fresh, rev, orig]);
  assert.equal(joined.length, 2);
  assert.deepEqual(joined.map((r) => textOf(r)), ['Payment changed: check → cash', 'Payment recorded: $65 check, paid Nov 1']); // P3
  // amount and day too; the old payment's own row gives its day
  const fresh2 = { ...fresh, after: { ...fresh.after, amount_cents: 5000, paid_on: '2026-10-31' } };
  assert.equal(textOf(combineHistoryRows([fresh2, rev, orig])[0]), 'Payment changed: $65 check, paid Nov 1 → $50 cash, paid Oct 31');
  // without the old payment's row: the reversal's amount and way (no day)
  assert.equal(textOf(combineHistoryRows([fresh2, rev])[0]), 'Payment changed: $65 check → $50 cash');
  // nothing different (an edit that kept everything) and a lone half
  assert.equal(textOf(combineHistoryRows([{ ...fresh, after: { ...fresh.after, method: 'check' } }, rev, orig])[0]), 'Payment changed');
  assert.deepEqual(combineHistoryRows([rev]).map((r) => textOf(r)), ['Payment changed']);
  assert.deepEqual(combineHistoryRows([fresh]).map((r) => textOf(r)), ['Payment changed']);
  assert.deepEqual(combineHistoryRows(null), []);
  // a second edit later pairs with its own reversal (nearest time, same action)
  const rev2 = { ...rev, occurred_at: '2026-11-02T10:00:00Z', after: { ...rev.after, id: 'p4', method: 'cash', reverses_payment_id: 'p3' } };
  const fresh3 = { ...fresh, occurred_at: '2026-11-02T10:00:00Z', after: { ...fresh.after, id: 'p5', method: 'card' } };
  assert.deepEqual(combineHistoryRows([fresh3, rev2, fresh, rev, orig]).map((r) => textOf(r)),
    ['Payment changed: cash → card', 'Payment changed: check → cash', 'Payment recorded: $65 check, paid Nov 1']);
});

check('history: result rows (event and private; CB7)', () => {
  for (const T_ of ['testing_results', 'testing_private_results']) {
    const set = T_ === 'testing_results' ? 'set_result' : 'private_set_result';
    const note = T_ === 'testing_results' ? 'set_result_note' : 'private_set_result_note';
    assert.equal(textOf(hRow(T_, 'insert', set, null, { result: 'pass', note: null })), 'Result: Passed'); // P3
    assert.equal(textOf(hRow(T_, 'update', set, { result: 'not_passed' }, { result: 'pass' })), 'Result: Not passed → Passed');
    assert.equal(textOf(hRow(T_, 'update', set, { result: 'no_show' }, { result: null })), 'Result cleared (was No show)');
    assert.equal(textOf(hRow(T_, 'insert', note, null, { result: null, note: 'Kicks need height' })), 'Grading note: Kicks need height');
    assert.equal(textOf(hRow(T_, 'update', note, { note: 'a' }, { note: null })), 'Grading note removed');
    assert.equal(textOf(hRow(T_, 'update', note, { note: 'a' }, { note: 'b' })), 'Grading note: b');
    // clear_result (a belt change, a new day or a move): the row goes
    assert.equal(textOf(hRow(T_, 'delete', 'clear_result', { result: 'no_show', note: 'late' }, null)), 'Result cleared (was No show); Grading note removed');
    assert.equal(textOf(hRow(T_, 'delete', 'clear_result', { result: null, note: 'late' }, null)), 'Grading note removed');
    assert.equal(textOf(hRow(T_, 'delete', 'delete_student', { result: null, note: null }, null)), 'Result cleared');
    // not money: shown while hidden
    assert.equal(textOf(hRow(T_, 'insert', set, null, { result: 'pass' }), { hidden: true }), 'Result: Passed');
  }
});

check('history: private testing rows — added, moved in, day, cancel, restore, edits, payments (CB7)', () => {
  const PV = 'testing_private';
  const PP = 'testing_private_payments';
  // private_add / move_to_private (the insert names the event, v0.418 Q4, P3)
  assert.equal(textOf(hRow(PV, 'insert', 'private_add', null, { private_date: '2026-10-31', private_time: '16:00:00', moved_from_event_name: null })),
    'Added at the desk (Sat, Oct 31, 4:00 PM)'); // P3
  assert.equal(textOf(hRow(PV, 'insert', 'move_to_private', null, { private_date: '2026-12-01', private_time: '16:00:00', moved_from_event_name: 'November Children Testing' })),
    'Moved to private testing from November Children Testing (Tue, Dec 1, 4:00 PM)'); // P3
  // private_change_day: the day, the time, or both
  assert.equal(textOf(hRow(PV, 'update', 'private_change_day', { private_date: '2026-12-01', private_time: '16:00:00' }, { private_date: '2026-12-01', private_time: '16:30:00' })),
    'Day or time changed: Tue, Dec 1, 4:00 PM → Tue, Dec 1, 4:30 PM'); // P3
  assert.equal(textOf(hRow(PV, 'update', 'private_change_day', { private_date: '2026-12-01', private_time: '16:00:00' }, { private_date: '2026-12-03', private_time: '16:00:00' })),
    'Day or time changed: Tue, Dec 1, 4:00 PM → Thu, Dec 3, 4:00 PM');
  // A real update row holds only what changed (a new time alone has no date): on its own it says
  // what it has; with the insert row in the list, combineHistoryRows fills in both sides (P3's words).
  const addRow = hRow(PV, 'insert', 'private_add', null, { private_date: '2026-12-01', private_time: '16:00:00', moved_from_event_name: null }, '2026-11-01T10:00:00Z');
  const timeOnly = hRow(PV, 'update', 'private_change_day', { private_time: '16:00:00', version: 1 }, { private_time: '16:30:00', version: 2 }, '2026-11-02T18:00:00Z');
  const dayOnly = hRow(PV, 'update', 'private_change_day', { private_date: '2026-12-01', version: 2 }, { private_date: '2026-12-03', version: 3 }, '2026-11-03T18:00:00Z');
  assert.equal(textOf(timeOnly), 'Day or time changed: 4:00 PM → 4:30 PM');
  assert.equal(textOf(dayOnly), 'Day or time changed: Tue, Dec 1 → Thu, Dec 3');
  assert.deepEqual(combineHistoryRows([dayOnly, timeOnly, addRow]).map((r) => textOf(r)), [
    'Day or time changed: Tue, Dec 1, 4:30 PM → Thu, Dec 3, 4:30 PM',
    'Day or time changed: Tue, Dec 1, 4:00 PM → Tue, Dec 1, 4:30 PM', // P3
    'Added at the desk (Tue, Dec 1, 4:00 PM)',
  ]);
  // private_cancel / private_restore
  assert.equal(textOf(hRow(PV, 'update', 'private_cancel', { status: 'active', cancelled_at: null }, { status: 'cancelled', cancelled_at: 'x', cancelled_by_name: 'Dana Ross' })), 'Cancelled');
  assert.equal(textOf(hRow(PV, 'update', 'private_restore', { status: 'cancelled' }, { status: 'active' })), 'Restored');
  // private_update: names, the belt, the class and the price (the price is money)
  const edit = hRow(PV, 'update', 'private_update',
    { first_name: 'Ava', rank_name: 'Yellow', class_name: 'Group A', private_cents: 8500, to_name: 'Orange' },
    { first_name: 'Eva', rank_name: 'Orange', class_name: 'Group B', private_cents: 9500, to_name: 'Green' });
  assert.equal(textOf(edit), 'First name: Ava → Eva; Belt: Yellow → Orange; Class: Group A → Group B; Price: $85 → $95');
  assert.equal(textOf(edit, { hidden: true }), 'First name: Ava → Eva; Belt: Yellow → Orange; Class: Group A → Group B'); // the price part goes
  assert.deepEqual(words(hRow(PV, 'update', 'private_update', { private_cents: 8500 }, { private_cents: 9500 }), { hidden: true }), { hiddenPayment: true });
  // private_change_paying_by / private_mark_paid (version only) / private_delete
  assert.equal(textOf(hRow(PV, 'update', 'private_change_paying_by', { paying_by: 'card' }, { paying_by: 'check' })), 'Paying by changed: Card → Check');
  assert.equal(words(hRow(PV, 'update', 'private_mark_paid', { version: 1 }, { version: 2 })), null);
  assert.equal(textOf(hRow(PV, 'delete', 'private_delete', { status: 'cancelled' }, null)), 'Deleted');
  // payments: private_mark_paid, private_undo_payment, private_edit_payment, moved in with the student
  assert.equal(textOf(hRow(PP, 'insert', 'private_mark_paid', null, { kind: 'payment', amount_cents: 8500, method: 'card', paid_on: '2026-10-31' })), 'Payment recorded: $85 card, paid Oct 31'); // P3
  assert.equal(textOf(hRow(PP, 'insert', 'private_undo_payment', null, { kind: 'reversal', amount_cents: -2000, method: 'card' })), 'Payment undone: $20');
  assert.equal(textOf(hRow(PP, 'insert', 'move_to_private', null, { kind: 'payment', amount_cents: 6500, method: 'cash', paid_on: '2026-10-30', moved_from_payment_id: 'p1' })),
    'Payment moved from the event: $65 cash, paid Oct 30');
  const pRev = hRow(PP, 'insert', 'private_edit_payment', null, { id: 'q2', kind: 'reversal', amount_cents: -8500, method: 'card', reverses_payment_id: 'q1' });
  const pNew = hRow(PP, 'insert', 'private_edit_payment', null, { id: 'q3', kind: 'payment', amount_cents: 8500, method: 'cash', paid_on: '2026-10-31' });
  assert.deepEqual(combineHistoryRows([pNew, pRev]).map((r) => textOf(r)), ['Payment changed: card → cash']);
  // a row from a table History doesn't know says nothing
  assert.equal(words(hRow('testing_events', 'update', 'update_event', { name: 'a' }, { name: 'b' })), null);
  assert.equal(words(null), null);
});

// The reader throws unless ok; no_access calls the lock path (async, so it runs on its own).
await (async () => {
  const label = 'history: historyReader throws unless ok; no_access locks (CB7)';
  try {
    let locked = 0;
    const ok = historyReader(async (id) => ({ status: 'ok', rows: [hRow('testing_registrations', 'insert', 'add_student', null, { source: 'staff', id })] }), 'r1');
    assert.equal((await ok()).length, 1);
    for (const status of ['no_access', 'invalid', 'not_found', 'stale', 'error']) {
      const read = historyReader(async () => ({ status }), 'r1', () => { locked += 1; });
      await assert.rejects(read(), new RegExp(status));
    }
    assert.equal(locked, 1); // only no_access locks
    await assert.rejects(historyReader(async () => undefined, 'r1')(), /no answer/);
    count += 1;
  } catch (error) {
    console.error(`FAILED: ${label}`);
    throw error;
  }
})();

check('history: the preview readers end to end — Mark paid, Undo, Edit payment, a result; hidden (CB7, P3)', () => {
  evReset();
  const zoe = () => regBy('CB-3112'); // Group A Yellow, not paid
  const family = zoe().paying_by;
  const other = ['cash', 'check', 'card'].find((m) => m !== family);
  const tick = () => { evClock += 60_000; };
  const read = (ctx = E_DESK) => evCall('testing_registration_history', { p_registration_id: zoe().id }, ctx);
  // refusals (the shapes historyReader turns into the amber bar)
  assert.equal(evStatus('testing_registration_history', { p_registration_id: zoe().id }, E_LOCKED), 'no_access');
  assert.equal(evStatus('testing_registration_history', { p_registration_id: '00000000-0000-4000-8000-00000000dead' }, E_DESK), 'not_found');
  // Mark paid by another way → Paying by follows (v0.418); Undo (admin) puts it back; Mark paid
  // again; Edit payment (admin) to another way; a result on the testing day.
  tick();
  const paid = evCall('testing_mark_paid_by', { p_registration_id: zoe().id, p_expected_version: zoe().version, p_method: other, p_expected_cents: 6500 }, E_DESK);
  tick();
  assert.equal(evStatus('testing_undo_payment', { p_payment_id: paid.payment_id }, E_ADMIN), 'ok');
  tick();
  const again = evCall('testing_mark_paid_by', { p_registration_id: zoe().id, p_expected_version: zoe().version, p_method: family, p_expected_cents: 6500 }, E_DESK);
  tick();
  assert.equal(evStatus('testing_edit_payment', { p_payment_id: again.payment_id, p_method: other, p_amount_cents: 6500, p_paid_on: '2026-10-17' }, E_ADMIN), 'ok');
  evToday = '2026-11-20';
  tick();
  assert.equal(evStatus('testing_set_result', { p_registration_id: zoe().id, p_result: 'pass' }, E_DESK), 'ok');
  const answer = read();
  assert.equal(answer.status, 'ok');
  // login ids never reach the app (0030's strip)
  for (const r of answer.rows) {
    for (const v of [r.before, r.after]) for (const key of ['created_by', 'updated_by', 'withdrawn_by', 'recorded_by', 'submission_id']) assert.ok(!v || !(key in v), key);
  }
  const rows = combineHistoryRows(answer.rows);
  const P = (m) => payingByText(m);
  const list = rows.map((r) => describeHistoryRow(r, {})).filter(Boolean).map((e) => e.text);
  // (Rows of one save share a moment; their order inside it is the reader's, so compare the set —
  // newest first is checked by the first and last entries.)
  assert.equal(list[0], 'Result: Passed');
  // One save is one entry (pass 2 M-02, v1.055 (a)): a payment save that also changed Paying by
  // says both, money first; the Mark paid by the family's own way changed nothing else.
  assert.deepEqual([...list].sort(), [
    'Result: Passed',
    `Payment changed: ${payingByText(family).toLowerCase()} → ${payingByText(other).toLowerCase()}; Paying by changed: ${P(family)} → ${P(other)}`,
    `Payment recorded: $65 ${payingByText(family).toLowerCase()}, paid Oct 17`,
    `Payment undone: $65; Paying by changed: ${P(other)} → ${P(family)}`,
    `Payment recorded: $65 ${payingByText(other).toLowerCase()}, paid Oct 17; Paying by changed: ${P(family)} → ${P(other)}`,
    zoe().source === 'form' ? 'Registered on the family form' : 'Added at the desk',
  ].sort());
  // Hide private details: only the result and the registration stay; 4 money entries hidden
  const hiddenWords = rows.map((r) => describeHistoryRow(r, { hidden: true })).filter(Boolean);
  assert.deepEqual(hiddenWords.filter((w) => !w.hiddenPayment).map((w) => w.text), ['Result: Passed', list[list.length - 1]]);
  assert.equal(hiddenWords.filter((w) => w.hiddenPayment).length, 4);
  // who: the person who did it
  assert.equal(describeHistoryRow(rows[0], {}).who, 'Staff');
  assert.equal(describeHistoryRow(rows.find((r) => r.action === 'edit_payment'), {}).who, 'Jeffrey Berg');
  evReset();
});

check('history: a payment save that changed Paying by is ONE entry, money first (pass 2 M-02)', () => {
  const at = (s) => `2026-11-05T15:00:${s}Z`;
  const row = (table, op, action, occurred, before, after) =>
    ({ occurred_at: occurred, actor_name: 'Jeffrey Berg', action, table_name: table, op, before, after });
  const words = (rows) => combineHistoryRows(rows).map((r) => describeHistoryRow(r, {})).filter(Boolean).map((e) => e.text);
  // A private Mark paid by cash while Paying by was card (the preview's few milliseconds apart)
  const markPaid = [
    row('testing_private', 'update', 'private_mark_paid', '2026-11-05T15:00:00.004Z', { paying_by: 'card', version: 2 }, { paying_by: 'cash', version: 3 }),
    row('testing_private_payments', 'insert', 'private_mark_paid', at('00'), null, { kind: 'payment', amount_cents: 2000, method: 'cash', paid_on: '2026-11-05' }),
  ];
  assert.deepEqual(words(markPaid), ['Payment recorded: $20 cash, paid Nov 5; Paying by changed: Card → Cash']);
  // … and its Undo payment, newest first: two saves, two entries
  const undo = [
    row('testing_private', 'update', 'private_undo_payment', at('30'), { paying_by: 'cash' }, { paying_by: 'card' }),
    row('testing_private_payments', 'insert', 'private_undo_payment', at('30'), null, { kind: 'reversal', amount_cents: -2000, method: 'cash', paid_on: '2026-11-05' }),
  ];
  assert.deepEqual(words([...undo, ...markPaid]), [
    'Payment undone: $20; Paying by changed: Cash → Card',
    'Payment recorded: $20 cash, paid Nov 5; Paying by changed: Card → Cash',
  ]);
  // Hide private details: both parts are money, so the whole entry is left out (one, not two)
  const hidden = combineHistoryRows(markPaid).map((r) => describeHistoryRow(r, { hidden: true })).filter(Boolean);
  assert.deepEqual(hidden, [{ hiddenPayment: true }]);
  // ⋯ Change how they'll pay has no payment in its save: its own entry, as before
  assert.deepEqual(words([row('testing_registrations', 'update', 'change_paying_by', at('40'), { paying_by: 'cash' }, { paying_by: 'check' })]), ['Paying by changed: Cash → Check']);
  // No payment row of that save in the list (the 500-row limit): Paying by keeps its own entry
  assert.deepEqual(words(markPaid.slice(0, 1)), ['Paying by changed: Card → Cash']);
  // A payment row of another table or action, or more than 5 seconds away, is never joined
  const apart = [
    row('testing_registrations', 'update', 'mark_paid', at('00'), { paying_by: 'cash' }, { paying_by: 'card' }),
    row('testing_payments', 'insert', 'mark_paid', '2026-11-05T15:00:06Z', null, { kind: 'payment', amount_cents: 6500, method: 'card', paid_on: '2026-11-05' }),
  ];
  assert.deepEqual(words(apart).sort(), ['Paying by changed: Cash → Card', 'Payment recorded: $65 card, paid Nov 5']);
  const otherTable = [apart[0], { ...apart[1], table_name: 'testing_private_payments', occurred_at: at('00') }];
  assert.equal(words(otherTable).length, 2);
  const otherAction = [apart[0], { ...apart[1], action: 'edit_payment', occurred_at: at('00') }];
  assert.equal(words(otherAction).length, 2);
  // The way to pay must match (the 500-row limit can cut one save's payment row): Paying by Cash →
  // Card whose card payment is cut off, then Undo, then Mark paid by cash within 5 seconds — the
  // orphaned change must not take the cash payment of the later save.
  const orphan = [
    row('testing_registrations', 'update', 'mark_paid', at('04'), { version: 4 }, { version: 5 }), // same way: only the version moved
    row('testing_payments', 'insert', 'mark_paid', at('04'), null, { kind: 'payment', amount_cents: 6500, method: 'cash', paid_on: '2026-11-05' }),
    row('testing_registrations', 'update', 'mark_paid', at('00'), { paying_by: 'cash' }, { paying_by: 'card' }),
  ];
  assert.deepEqual(words(orphan).sort(), ['Paying by changed: Cash → Card', 'Payment recorded: $65 cash, paid Nov 5']);
  // Undo payment joins its reversal (the old way, before) and Edit payment its new payment (after)
  const undoEv = [
    row('testing_registrations', 'update', 'undo_payment', at('10'), { paying_by: 'card' }, { paying_by: 'cash' }),
    row('testing_payments', 'insert', 'undo_payment', at('10'), null, { kind: 'reversal', amount_cents: -6500, method: 'card', paid_on: '2026-11-05' }),
  ];
  assert.deepEqual(words(undoEv), ['Payment undone: $65; Paying by changed: Card → Cash']);
});

check('history: a moved private testing starts at the move, which names the event (v0.418 Q4, P3)', () => {
  pStart();
  const reg = regBy('CB-3107'); // Mia: $65 cash paid at the event
  const m = pMove('CB-3107').private_id;
  const answer = evCall('testing_private_history', { p_private_id: m }, E_DESK);
  assert.equal(answer.status, 'ok');
  // the move is ONE entry (P3, Ava's History): its moved-in payment says nothing of its own
  assert.ok(answer.rows.some((r) => r.table_name === 'testing_private_payments' && r.action === 'move_to_private')); // the row is there …
  const list = combineHistoryRows(answer.rows).map((r) => describeHistoryRow(r, {})).filter(Boolean).map((e) => e.text);
  assert.deepEqual(list, ['Moved to private testing from November Children Testing (Tue, Dec 1, 4:00 PM)']); // … and folded
  // the registration's side: ONE "Moved to private testing" entry (its payment's reversal folded in);
  // its own earlier entries (registered, the event payment) stay on the registration
  const regRows = evCall('testing_registration_history', { p_registration_id: reg.id }, E_DESK).rows;
  assert.ok(regRows.some((r) => r.table_name === 'testing_payments' && r.action === 'move_to_private'));
  const regMove = combineHistoryRows(regRows).filter((r) => r.action === 'move_to_private')
    .map((r) => describeHistoryRow(r, {})).filter(Boolean).map((e) => e.text);
  assert.deepEqual(regMove, ['Moved to private testing']);
  assert.ok(!combineHistoryRows(regRows).some((r) => /Payment moved/.test(describeHistoryRow(r, {})?.text ?? '')));
  // hidden: the same one entry (nothing left over to say "Payment history is hidden")
  const hiddenWords = combineHistoryRows(answer.rows).map((r) => describeHistoryRow(r, { hidden: true })).filter(Boolean);
  assert.deepEqual(hiddenWords.map((w) => w.text), ['Moved to private testing from November Children Testing (Tue, Dec 1, 4:00 PM)']);
  // the preview's failed read (fail_history_reads): one read fails like a dropped connection, then it works
  pAsPostgres((s) => { s.fail_history_reads = 1; });
  assert.match(ev.rpc('testing_private_history', { p_private_id: m }, E_DESK).error.message, /Failed to fetch/);
  assert.equal(evStatus('testing_private_history', { p_private_id: m }, E_DESK), 'ok');
  // refusals
  assert.equal(evStatus('testing_private_history', { p_private_id: m }, E_LOCKED), 'no_access');
  assert.equal(evStatus('testing_private_history', { p_private_id: '00000000-0000-4000-8000-00000000dead' }, E_DESK), 'not_found');
  evReset();
});

check('history: Undo move is ONE entry on the registration, its payment back folded in (P3)', () => {
  pStart();
  const reg = regBy('CB-3107'); // Mia: $65 cash paid at the event
  const move = pMove('CB-3107');
  evClock += 4000;
  assert.equal(pUndoMove(move.private_id).status, 'ok');
  const rows = evCall('testing_registration_history', { p_registration_id: reg.id }, E_DESK).rows;
  assert.ok(rows.some((r) => r.table_name === 'testing_payments' && r.action === 'undo_move_to_private')); // the payment back is logged …
  const entries = combineHistoryRows(rows).filter((r) => r.action === 'move_to_private' || r.action === 'undo_move_to_private')
    .map((r) => describeHistoryRow(r, {})).filter(Boolean).map((e) => e.text);
  // … one entry each, newest first (Mia's duplicate pair comes back with the Undo: the same entry says so)
  assert.deepEqual(entries, ['Move to private testing undone; Possible duplicate found', 'Moved to private testing']);
  // the private testing is gone after the Undo (its reader answers not_found)
  assert.equal(evStatus('testing_private_history', { p_private_id: move.private_id }, E_DESK), 'not_found');
  evReset();
});

check('history: a move folds only its own payment rows (same action, same moment); a lone one keeps its words', () => {
  const at = '2026-11-01T19:00:00Z';
  const later = '2026-11-01T19:00:09Z'; // more than 5 seconds after
  // private side: the insert + its moved-in payments → one entry
  const pIns = hRow('testing_private', 'insert', 'move_to_private', null, { private_date: '2026-12-01', private_time: '16:00:00', moved_from_event_name: 'November Children Testing' }, at);
  const pPay = (id, cents) => hRow('testing_private_payments', 'insert', 'move_to_private', null, { id, kind: 'payment', amount_cents: cents, method: 'cash', paid_on: '2026-10-30', moved_from_payment_id: 'p' + id }, at);
  assert.deepEqual(combineHistoryRows([pPay('a', 6500), pPay('b', 2000), pIns]).map((r) => textOf(r)),
    ['Moved to private testing from November Children Testing (Tue, Dec 1, 4:00 PM)']);
  // event side: the registration update + its reversal → one entry
  const rUpd = hRow('testing_registrations', 'update', 'move_to_private', { status: 'active' }, { status: 'withdrawn', withdrawn_reason: 'withdrawn' }, at);
  const rRev = hRow('testing_payments', 'insert', 'move_to_private', null, { kind: 'reversal', amount_cents: -6500, method: 'cash', reverses_payment_id: 'p1' }, at);
  assert.deepEqual(combineHistoryRows([rRev, rUpd]).map((r) => textOf(r)), ['Moved to private testing']);
  // Undo move: the registration update + the payment back → one entry
  const uUpd = hRow('testing_registrations', 'update', 'undo_move_to_private', { status: 'withdrawn' }, { status: 'active' }, later);
  const uPay = hRow('testing_payments', 'insert', 'undo_move_to_private', null, { kind: 'payment', amount_cents: 6500, method: 'cash', paid_on: '2026-10-30' }, later);
  assert.deepEqual(combineHistoryRows([uPay, uUpd, rRev, rUpd]).map((r) => textOf(r)), ['Move to private testing undone', 'Moved to private testing']);
  // the record's own row of that action not in the list (the 500-row limit) → the payment keeps its words
  assert.deepEqual(combineHistoryRows([uPay, rUpd]).map((r) => textOf(r)), ['Payment moved back from private testing: $65 cash, paid Oct 30', 'Moved to private testing']);
  assert.deepEqual(combineHistoryRows([pPay('a', 6500)]).map((r) => textOf(r)), ['Payment moved from the event: $65 cash, paid Oct 30']);
  // other payment rows next to a move are not touched
  const marked = hRow('testing_payments', 'insert', 'mark_paid', null, { kind: 'payment', amount_cents: 2000, method: 'cash', paid_on: '2026-11-01' }, at);
  assert.deepEqual(combineHistoryRows([rRev, rUpd, marked]).map((r) => textOf(r)), ['Moved to private testing', 'Payment recorded: $20 cash, paid Nov 1']);
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

// ======================= CB14: the split dialogs (classRankForms.js) =======================
// Edit rank / Edit prices / Add rank and Edit class / Final award each own one half of a record; a save still calls
// the one database function that takes every field, so the other half must go back exactly as it was saved.
import { checkRankForm as CHECK_RANK, isRankFormDirty as RANK_DIRTY, checkClassForm as CHECK_CLASS, isClassFormDirty as CLASS_DIRTY } from './classRankForms.js';
{
  const savedBelt = { beltPattern: 'solid', beltColor: 'blue', beltColor2: null, beltEndStripes: 1, beltEndStripeColor: 'white' };
  const savedRank = { id: 'r1', classId: 'c1', name: 'LT Blue', version: 3, earlyCents: 6500, dayCents: 8000, privateCents: 9500, sparringGear: true, ...savedBelt };
  const savedClass = { id: 'c1', name: 'Little Tiger', version: 2, ranks: [savedRank, { id: 'r2', classId: 'c1', name: 'LT Black' }], finalAwardRankId: null, finalAwardNone: true };
  const cv = { id: 'c1', name: 'Little Tiger', ranks: savedClass.ranks };
  // The dialog's values for a rank as ClassesRanksTab fills them (prices as the fields show them).
  const valuesOf = (rank) => ({
    name: rank.name,
    early: centsToInputText(rank.earlyCents),
    day: centsToInputText(rank.dayCents),
    priv: centsToInputText(rank.privateCents),
    sparring: rank.sparringGear,
    belt: { ...savedBelt },
  });
  const rankState = (part, patch = {}, mode = 'edit') => {
    const values = { ...valuesOf(savedRank), ...patch };
    return { mode, part, rankId: 'r1', values, initial: valuesOf(savedRank), touched: {}, duplicateName: null, saving: false, blocked: false };
  };

  check('CB14 Edit rank: the name and belt change; the saved prices and Sparring gear go back unchanged', () => {
    const state = rankState('structure', { name: 'LT Navy', belt: { ...savedBelt, beltColor: 'black' } });
    const result = CHECK_RANK(state, cv, savedRank);
    assert.equal(result.canSave, true);
    assert.deepEqual(result.payload, {
      name: 'LT Navy', earlyCents: 6500, dayCents: 8000, privateCents: 9500, sparringGear: true,
      beltPattern: 'solid', beltColor: 'black', beltColor2: null, beltEndStripes: 1, beltEndStripeColor: 'white',
    });
  });
  check('CB14 Edit rank: price text is not part of this dialog, so a bad price never blocks it or changes the sent prices', () => {
    const state = rankState('structure', { name: 'LT Navy', early: 'abc', sparring: false });
    const result = CHECK_RANK(state, cv, savedRank);
    assert.equal(result.canSave, true);
    assert.equal(result.payload.earlyCents, 6500);
    assert.equal(result.payload.sparringGear, true);
    assert.deepEqual(result.priceErrors, {});
  });
  check('CB14 Edit rank: nothing changed = sameAsSaved (Save just closes)', () => {
    const result = CHECK_RANK(rankState('structure'), cv, savedRank);
    assert.equal(result.canSave, true);
    assert.equal(result.sameAsSaved, true);
    assert.equal(RANK_DIRTY(rankState('structure')), false);
  });
  check('CB14 Edit rank: still checks the name (empty, too long, same as another rank)', () => {
    assert.equal(CHECK_RANK(rankState('structure', { name: '  ' }), cv, savedRank).canSave, false);
    assert.equal(CHECK_RANK(rankState('structure', { name: 'x'.repeat(61) }), cv, savedRank).canSave, false);
    assert.equal(CHECK_RANK(rankState('structure', { name: 'lt black' }), cv, savedRank).canSave, false); // LT Black is the class's other rank
    assert.ok(CHECK_RANK(rankState('structure', { name: 'lt black' }), cv, savedRank).nameError);
  });

  check('CB14 Edit prices: the prices and Sparring gear change; the saved name and belt go back unchanged', () => {
    const state = rankState('prices', { early: '70', day: '85', priv: '100', sparring: false });
    const result = CHECK_RANK(state, cv, savedRank);
    assert.equal(result.canSave, true);
    assert.deepEqual(result.payload, {
      name: 'LT Blue', earlyCents: 7000, dayCents: 8500, privateCents: 10000, sparringGear: false, ...savedBelt,
    });
  });
  check('CB14 Edit prices: the name field is not on this dialog, so even an empty name never blocks it or goes out', () => {
    const state = rankState('prices', { name: '', early: '70' });
    const result = CHECK_RANK(state, cv, savedRank);
    assert.equal(result.canSave, true);
    assert.equal(result.payload.name, 'LT Blue');
    assert.equal(result.nameError, null);
  });
  check('CB14 Edit prices: still checks every price (whole dollars, $0 to $1,000)', () => {
    for (const bad of ['', 'abc', '65.5', '1001', '-1']) {
      assert.equal(CHECK_RANK(rankState('prices', { priv: bad }), cv, savedRank).canSave, false, bad);
    }
    assert.equal(CHECK_RANK(rankState('prices', { early: '0', day: '1000' }), cv, savedRank).canSave, true);
  });
  check('CB14 Edit prices: nothing changed = sameAsSaved', () => {
    const result = CHECK_RANK(rankState('prices'), cv, savedRank);
    assert.equal(result.sameAsSaved, true);
    assert.equal(CHECK_RANK(rankState('prices', { early: '65.00' }), cv, savedRank).sameAsSaved, true); // "65" typed as "65.00"
    assert.equal(CHECK_RANK(rankState('prices', { early: '66' }), cv, savedRank).sameAsSaved, false);
  });

  check('CB14 Add rank (option A, Jeffrey v0.432): checks and sends the name, belt, all three prices and Sparring gear', () => {
    const add = (patch) => ({ mode: 'add', part: 'all', rankId: null, values: { ...valuesOf(savedRank), name: 'LT Brown', ...patch }, initial: valuesOf(savedRank), touched: {}, duplicateName: null, saving: false, blocked: false });
    const ok = CHECK_RANK(add({}), cv, null);
    assert.equal(ok.canSave, true);
    assert.deepEqual(ok.payload, { name: 'LT Brown', earlyCents: 6500, dayCents: 8000, privateCents: 9500, sparringGear: true, ...savedBelt });
    assert.equal(CHECK_RANK(add({ name: '' }), cv, null).canSave, false);
    assert.equal(CHECK_RANK(add({ day: '' }), cv, null).canSave, false); // a new rank never goes live with a blank price
    assert.equal(CHECK_RANK(add({}), cv, null).sameAsSaved, false); // never "same as saved" when adding
  });

  const classState = (part, patch = {}, mode = 'edit') => {
    const initial = { name: savedClass.name, awardId: 'none' }; // FINAL_AWARD_NONE
    return { mode, part, classId: 'c1', values: { ...initial, ...patch }, initial, touched: {}, duplicateName: null, saving: false, blocked: false };
  };
  const others = [savedClass, { id: 'c2', name: 'Group A', ranks: [], finalAwardRankId: null, finalAwardNone: false }];

  check('CB14 Edit class: the name changes; the saved final award goes back unchanged', () => {
    const result = CHECK_CLASS(classState('name', { name: 'Tiny Tiger' }), others, 'Worcester', savedClass);
    assert.equal(result.canSave, true);
    assert.equal(result.payload.name, 'Tiny Tiger');
    assert.equal(result.payload.choice, 'none'); // None stays None
  });
  check('CB14 Edit class: still checks the name (empty, same as another class)', () => {
    assert.equal(CHECK_CLASS(classState('name', { name: '' }), others, 'Worcester', savedClass).canSave, false);
    assert.equal(CHECK_CLASS(classState('name', { name: 'group a' }), others, 'Worcester', savedClass).canSave, false);
  });
  check('CB14 Final award: the award changes; the saved name goes back unchanged and is never checked', () => {
    const result = CHECK_CLASS(classState('award', { name: '', awardId: 'r9' }), others, 'Worcester', savedClass);
    assert.equal(result.canSave, true);
    assert.deepEqual(result.payload, { name: 'Little Tiger', choice: 'r9' });
    assert.equal(result.nameError, null);
  });
  check('CB14 Final award / Edit class: nothing changed = sameAsSaved; any change counts as unsaved', () => {
    assert.equal(CHECK_CLASS(classState('award'), others, 'Worcester', savedClass).sameAsSaved, true);
    assert.equal(CHECK_CLASS(classState('name'), others, 'Worcester', savedClass).sameAsSaved, true);
    assert.equal(CLASS_DIRTY(classState('award')), false);
    assert.equal(CLASS_DIRTY(classState('award', { awardId: null })), true);
    assert.equal(CLASS_DIRTY(classState('name', { name: 'X' })), true);
  });
  check('CB14 Add class: the name only; the final award starts Not set', () => {
    const state = { mode: 'add', part: 'name', classId: null, values: { name: 'Seniors', awardId: null }, initial: { name: '', awardId: null }, touched: {}, duplicateName: null, saving: false, blocked: false };
    const result = CHECK_CLASS(state, others, 'Worcester', null);
    assert.equal(result.canSave, true);
    assert.deepEqual(result.payload, { name: 'Seniors', choice: null });
  });

  // ----- the gaps the code review's mutation run found (each of these failed to be caught before) -----
  check('CB14 Edit rank: a VALID typed price or a toggled Sparring gear never leaks into the save', () => {
    const result = CHECK_RANK(rankState('structure', { name: 'LT Navy', early: '99', day: '98', priv: '97', sparring: false }), cv, savedRank);
    assert.deepEqual([result.payload.earlyCents, result.payload.dayCents, result.payload.privateCents, result.payload.sparringGear], [6500, 8000, 9500, true]);
  });
  check('CB14 Edit prices: a changed belt or name in the form never leaks into the save', () => {
    const result = CHECK_RANK(rankState('prices', { name: 'Other', belt: { ...savedBelt, beltColor: 'red' }, early: '70' }), cv, savedRank);
    assert.equal(result.payload.name, 'LT Blue');
    assert.equal(result.payload.beltColor, 'blue');
    assert.equal(result.payload.earlyCents, 7000);
  });
  check('CB14 sameAsSaved is false for every field that really changed (Save must not just close)', () => {
    const s = (patch) => CHECK_RANK(rankState('structure', patch), cv, savedRank).sameAsSaved;
    assert.equal(s({ name: 'LT Navy' }), false);
    assert.equal(s({ belt: { ...savedBelt, beltColor: 'red' } }), false);
    assert.equal(s({ belt: { ...savedBelt, beltEndStripes: 2 } }), false);
    const p = (patch) => CHECK_RANK(rankState('prices', patch), cv, savedRank).sameAsSaved;
    assert.equal(p({ early: '66' }), false);
    assert.equal(p({ day: '81' }), false);
    assert.equal(p({ priv: '96' }), false);
    assert.equal(p({ sparring: false }), false);
  });
  check('CB14 dirty (Esc must not close over edits): every rank field counts', () => {
    for (const patch of [{ name: 'X' }, { early: '1' }, { day: '1' }, { priv: '1' }, { sparring: false }, { belt: { ...savedBelt, beltColor: 'red' } }]) {
      assert.equal(RANK_DIRTY(rankState('structure', patch)), true, JSON.stringify(patch));
    }
  });
  check('CB14 Save is unavailable while saving or after a refused save (stale / not allowed), rank and class', () => {
    assert.equal(CHECK_RANK({ ...rankState('structure'), saving: true }, cv, savedRank).canSave, false);
    assert.equal(CHECK_RANK({ ...rankState('prices'), blocked: true }, cv, savedRank).canSave, false);
    assert.equal(CHECK_CLASS({ ...classState('name'), saving: true }, others, 'Worcester', savedClass).canSave, false);
    assert.equal(CHECK_CLASS({ ...classState('award'), blocked: true }, others, 'Worcester', savedClass).canSave, false);
  });
  check('CB14 a duplicate name the SERVER reported blocks Save for exactly that name (rank and class)', () => {
    const r = CHECK_RANK({ ...rankState('structure', { name: 'LT Navy' }), duplicateName: 'LT Navy' }, cv, savedRank);
    assert.equal(r.canSave, false);
    assert.ok(r.nameError);
    assert.equal(CHECK_RANK({ ...rankState('structure', { name: 'LT Teal' }), duplicateName: 'LT Navy' }, cv, savedRank).canSave, true);
    const c = CHECK_CLASS({ ...classState('name', { name: 'Tiny Tiger' }), duplicateName: 'Tiny Tiger' }, others, 'Worcester', savedClass);
    assert.equal(c.canSave, false);
    assert.ok(c.nameError);
  });
  check('CB14 an invalid belt (end stripe the same color as the belt) blocks Edit rank but not Edit prices', () => {
    const bad = { ...savedBelt, beltEndStripes: 1, beltEndStripeColor: 'blue' };
    assert.equal(CHECK_RANK(rankState('structure', { belt: bad }), cv, savedRank).canSave, false);
    assert.equal(CHECK_RANK(rankState('prices', { belt: bad, early: '70' }), cv, savedRank).canSave, true);
  });
  check('CB14 "Enter a name / price" shows only once the field was touched; Save is unavailable either way', () => {
    const untouched = CHECK_RANK(rankState('structure', { name: '' }), cv, savedRank);
    assert.equal(untouched.nameError, null);
    assert.equal(untouched.canSave, false);
    assert.ok(CHECK_RANK({ ...rankState('structure', { name: '' }), touched: { name: true } }, cv, savedRank).nameError);
    const emptyPrice = CHECK_RANK(rankState('prices', { priv: '' }), cv, savedRank);
    assert.equal(emptyPrice.priceErrors.priv, undefined);
    assert.equal(emptyPrice.canSave, false);
    assert.ok(CHECK_RANK({ ...rankState('prices', { priv: '' }), touched: { priv: true } }, cv, savedRank).priceErrors.priv);
    assert.equal(CHECK_CLASS(classState('name', { name: '' }), others, 'Worcester', savedClass).nameError, null);
    assert.ok(CHECK_CLASS({ ...classState('name', { name: '' }), touched: { name: true } }, others, 'Worcester', savedClass).nameError);
  });
}

console.log(`${count} groups of checks ran.`);
console.log('ALL TESTING LIB CHECKS PASSED');
