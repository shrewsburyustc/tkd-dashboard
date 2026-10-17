#!/usr/bin/env node
// =====================================================================
// make_seed.mjs — turns the old system's class/rank export into a seed SQL file
// ---------------------------------------------------------------------
// WHAT THIS FILE IS
//   A small Node script (built-in modules only — nothing to npm install).
//   It reads the JSON export of classes and ranks from the old Color Belt
//   project, checks every name and price against the same rules the new
//   database uses (contract 0003, §1.5), prints a review table for Jeffrey,
//   and writes one SQL file that copies the list into BOTH schools.
//
// WHY IT EXISTS
//   Typing 42 ranks x 2 schools by hand would be slow and error-prone. A
//   script that refuses bad data and shows a readable table first means the
//   numbers are checked by a person BEFORE anything is written to the
//   database. The SQL it writes is plain inserts, so it can be read and
//   reviewed too.
//
// HOW TO RUN IT (from the repo folder)
//   node supabase/manual/make_seed.mjs <export.json> [--adjustments <file.json>]
//        [--out <file.sql>] [--expect-classes 7] [--expect-ranks 42]
//   Real seed (amended v0.62):
//   node supabase/manual/make_seed.mjs supabase/manual/0003s_export_from_old_system.json
//   * For a REAL export (fixture false) --adjustments defaults to
//     supabase/manual/0003s_adjustments.json (next to this script), so the
//     approved changes can't be forgotten. Skipping them needs the explicit
//     --no-adjustments flag, which prints a loud warning in the review table
//     and the SQL header. A fixture export only uses adjustments when
//     --adjustments is given.
//   * Prints the review table to the screen (stdout).
//   * Writes the SQL file (default: next to the input — the real seed name
//     for a real export, the NOT_FOR_PRODUCTION name for a fixture).
//   * Any hard error -> the problems are listed and NO SQL file is written.
//
// RULES IT ENFORCES (contract 0003, §4)
//   Hard errors: wrong class/rank count; a price that is missing, not a whole
//   number of cents, negative, over $1,000 or not whole dollars; an invalid
//   name; duplicate class names (ignoring capital letters) or duplicate rank
//   names inside one class; a name containing "de" + "lete" or "dr" + "op"
//   (the Supabase connection cancels any SQL containing those words).
//   Warnings (shown in the table, SQL still written): a name that had extra
//   spaces cleaned up; a rank whose old "next rank" isn't the rank after it.
//
// FINAL AWARD (what the last rank of a class tests for)
//   Take the class's LAST rank's old nextRank. Look through the classes that
//   come AFTER this one, in belt order; the first one that has a rank with
//   that name (spaces cleaned, capital letters ignored) supplies the award.
//   Nothing found, or nextRank empty -> "Not set", with the reason printed.
//
// APPROVED ADJUSTMENTS (amended v0.62)
//   The export stays an exact record of the old system. Changes Jeffrey has
//   approved live in a separate file (--adjustments), applied AFTER the
//   export passes every check. Each adjustment must hit exactly one target
//   and its "from" must equal what the export says — otherwise it's a hard
//   error (so an adjustment can never silently apply to the wrong thing or
//   to data that has changed since it was approved). Two kinds:
//     price       {class, rank, field: earlyCents|dayCents|privateCents, from, to}
//     finalAward  {class, from: <the class's last rank's old nextRank, may be null>,
//                  to: "none"}  -> final award "None" (the last rank doesn't
//                  promote, on purpose); the SQL sets final_award_none = true.
//   Every adjustment needs a "reason". The file's "fixture" flag must match
//   the export's, so fixture changes can't leak into the real seed.
//   The review table lists them under ADJUSTMENTS (approved) and marks each
//   changed cell with " *".
// =====================================================================

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------
const REAL_SEED_FILE = '0003s_seed_classes_and_ranks.sql';
const FIXTURE_SEED_FILE = '0003s_seed_from_fixture_NOT_FOR_PRODUCTION.sql';
const DEFAULT_ADJUSTMENTS_FILE = '0003s_adjustments.json'; // default for a real export (v0.62)
const MAX_CENTS = 100000; // $1,000 — the highest price the database accepts
const NAME_MAX = 60; // longest allowed name, counted in characters

// The two schools, in the order the SQL handles them.
const SCHOOLS = [
  { code: 'worcester', name: 'Worcester' },
  { code: 'shrewsbury', name: 'Shrewsbury' },
];

// The two words the Supabase connection refuses. Built from pieces so that
// searching this script's own text for them doesn't look alarming — what
// matters is that the SQL OUTPUT never contains them.
const FORBIDDEN_WORDS = ['de' + 'lete', 'dr' + 'op'];
const FORBIDDEN_RE = new RegExp(FORBIDDEN_WORDS.join('|'), 'i');

// ---------------------------------------------------------------------
// Name rules — an exact copy of contract §1.5 (same as the database's
// testing_normalize_name / testing_name_is_valid and the app's names.js).
// ---------------------------------------------------------------------

// Runs of space, tab, LF, CR, VT, FF and no-break space (U+00A0) become one space.
const SPACE_RUN_RE = /[ \t\n\r\f\v\u00a0]+/g;
// Other control characters are not allowed at all, and neither are invisible
// "format" characters (zero-width spaces, text-direction marks/overrides/
// isolates, invisible operators, the byte-order mark) — they can make two
// names that look identical be different. Same list as the database and
// src/lib/testing/names.js (contract §1.5 rule 4, amended after security
// review). U+0000 is added here because PostgreSQL text can't hold it.
const BAD_CHAR_RE = /[\u0000-\u0008\u000e-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/;

/** Clean up spaces the same way the database does. */
function normalizeName(text) {
  return text.replace(SPACE_RUN_RE, ' ').replace(/^ +| +$/g, '');
}

/** null when the name is fine, otherwise a short reason. */
function nameProblem(raw) {
  if (typeof raw !== 'string') return 'is missing or not text';
  const n = normalizeName(raw);
  if (BAD_CHAR_RE.test(n)) return 'contains a control or invisible character';
  const length = [...n].length; // count characters, not UTF-16 units
  if (length < 1) return 'is empty';
  if (length > NAME_MAX) return `is ${length} characters (max ${NAME_MAX})`;
  return null;
}

/** The key used to compare names: cleaned-up spaces + lower case. */
function nameKey(raw) {
  return normalizeName(raw).toLowerCase();
}

// ---------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------

/** SQL text literal: wrap in single quotes, double any quote inside. */
function sqlText(s) {
  return "'" + s.replace(/'/g, "''") + "'";
}

/** 6500 -> "$65", 100000 -> "$1,000". */
function dollars(cents) {
  return '$' + (cents / 100).toLocaleString('en-US');
}

/** Show a value in error messages without risking huge output. */
function show(v) {
  const s = JSON.stringify(v);
  return s === undefined ? 'undefined' : s.length > 70 ? s.slice(0, 67) + '...' : s;
}

/** Make text safe to sit inside a one-line SQL comment (no line breaks). */
function oneLine(s) {
  return String(s).replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ');
}

/** Pad to a width counted in characters (so names with accents line up). */
function pad(s, width) {
  const len = [...s].length;
  return len >= width ? s : s + ' '.repeat(width - len);
}

/** Render rows (arrays of strings) as an aligned text table. */
function textTable(header, rows, indent = '  ') {
  const all = [header, ...rows];
  const widths = header.map((_, i) => Math.max(...all.map((r) => [...r[i]].length)));
  const line = (r) => indent + r.map((c, i) => pad(c, widths[i])).join('  ').trimEnd();
  const rule = indent + widths.map((w) => '-'.repeat(w)).join('  ');
  return [line(header), rule, ...rows.map(line)].join('\n');
}

function fail(message) {
  console.error('make_seed: ' + message);
  process.exit(1);
}

// ---------------------------------------------------------------------
// 1. Read the command line
// ---------------------------------------------------------------------
function parseArgs(argv) {
  const opts = { input: null, out: null, adjustments: null, noAdjustments: false, expectClasses: 7, expectRanks: 42 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const needValue = () => {
      if (i + 1 >= argv.length) fail(`${a} needs a value`);
      return argv[++i];
    };
    const needCount = () => {
      const v = needValue();
      if (!/^\d+$/.test(v)) fail(`${a} must be a whole number, got "${v}"`);
      return Number(v);
    };
    if (a === '--out') opts.out = needValue();
    else if (a === '--adjustments') opts.adjustments = needValue();
    else if (a === '--no-adjustments') opts.noAdjustments = true;
    else if (a === '--expect-classes') opts.expectClasses = needCount();
    else if (a === '--expect-ranks') opts.expectRanks = needCount();
    else if (a.startsWith('--')) fail(`unknown option ${a}`);
    else if (opts.input === null) opts.input = a;
    else fail(`unexpected extra argument "${a}"`);
  }
  if (opts.adjustments && opts.noAdjustments) fail('--adjustments and --no-adjustments can\'t be used together');
  if (!opts.input) {
    fail('usage: node supabase/manual/make_seed.mjs <export.json> [--adjustments <file.json> | --no-adjustments] ' +
      '[--out <file.sql>] [--expect-classes 7] [--expect-ranks 42]');
  }
  return opts;
}

// ---------------------------------------------------------------------
// 2. Check the export and build a clean, ordered list
//    Returns { classes, errors, warnings }. Every problem is collected
//    (not just the first) so one run shows everything that needs fixing.
// ---------------------------------------------------------------------
function validateExport(data, opts) {
  const errors = [];
  const warnings = []; // general warnings (per-rank ones live on the rank)

  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { classes: [], errors: ['the file is not a JSON object'], warnings };
  }
  if (typeof data.fixture !== 'boolean') errors.push(`"fixture" must be true or false, got ${show(data.fixture)}`);
  if (!Array.isArray(data.classes)) {
    errors.push('"classes" must be a list');
    return { classes: [], errors, warnings };
  }

  // Keep the original list index so equal positions keep the export's order.
  const classes = [];
  data.classes.forEach((c, ci) => {
    const where = `class #${ci + 1}`;
    if (c === null || typeof c !== 'object') {
      errors.push(`${where}: not an object`);
      return;
    }
    if (!Number.isInteger(c.position)) errors.push(`${where} (${show(c.name)}): position must be a whole number, got ${show(c.position)}`);
    const cls = {
      rawName: c.name,
      name: typeof c.name === 'string' ? normalizeName(c.name) : '',
      oldPosition: c.position,
      index: ci,
      nameWarning: null,
      ranks: [],
    };
    const problem = nameProblem(c.name);
    if (problem) errors.push(`${where}: class name ${show(c.name)} ${problem}`);
    else if (cls.name !== c.name) cls.nameWarning = `name cleaned up: ${show(c.name)} -> ${show(cls.name)}`;

    if (!Array.isArray(c.ranks)) {
      errors.push(`${where} (${show(c.name)}): "ranks" must be a list`);
    } else {
      c.ranks.forEach((r, ri) => {
        const rWhere = `${where} (${show(c.name)}), rank #${ri + 1}`;
        if (r === null || typeof r !== 'object') {
          errors.push(`${rWhere}: not an object`);
          return;
        }
        const rank = {
          rawName: r.name,
          name: typeof r.name === 'string' ? normalizeName(r.name) : '',
          oldPosition: r.position,
          index: ri,
          earlyCents: r.earlyCents,
          dayCents: r.dayCents,
          privateCents: r.privateCents,
          sparringGear: r.sparringGear,
          nextRank: r.nextRank,
          warnings: [],
        };
        const rp = nameProblem(r.name);
        if (rp) errors.push(`${rWhere}: rank name ${show(r.name)} ${rp}`);
        else if (rank.name !== r.name) rank.warnings.push(`name cleaned up: ${show(r.name)} -> ${show(rank.name)}`);
        if (!Number.isInteger(r.position)) errors.push(`${rWhere} (${show(r.name)}): position must be a whole number, got ${show(r.position)}`);

        // Prices: whole dollars $0–$1,000, stored as cents (contract §1.5).
        for (const key of ['earlyCents', 'dayCents', 'privateCents']) {
          const v = r[key];
          if (v === null || v === undefined) errors.push(`${rWhere} (${show(r.name)}): ${key} is missing`);
          else if (!Number.isInteger(v)) errors.push(`${rWhere} (${show(r.name)}): ${key} must be a whole number of cents, got ${show(v)}`);
          else if (v < 0) errors.push(`${rWhere} (${show(r.name)}): ${key} is negative (${v})`);
          else if (v > MAX_CENTS) errors.push(`${rWhere} (${show(r.name)}): ${key} is over $1,000 (${v})`);
          else if (v % 100 !== 0) errors.push(`${rWhere} (${show(r.name)}): ${key} is not whole dollars (${v})`);
        }
        // The database column is "boolean not null", so anything else would fail there.
        if (typeof r.sparringGear !== 'boolean') errors.push(`${rWhere} (${show(r.name)}): sparringGear must be true or false, got ${show(r.sparringGear)}`);
        if (r.nextRank !== null && r.nextRank !== undefined && typeof r.nextRank !== 'string') {
          errors.push(`${rWhere} (${show(r.name)}): nextRank must be text or null, got ${show(r.nextRank)}`);
        }
        cls.ranks.push(rank);
      });
    }
    classes.push(cls);
  });

  // Sort into belt order by the old position (gaps are fine). Ties keep the
  // export's own order (the export query already sorts by position, name, id).
  const byOldPosition = (a, b) => (a.oldPosition - b.oldPosition) || (a.index - b.index);
  classes.sort(byOldPosition);
  for (const c of classes) c.ranks.sort(byOldPosition);

  // Equal old positions are allowed, but worth a look.
  const tie = (list) => list.some((x, i) => i > 0 && x.oldPosition === list[i - 1].oldPosition);
  if (tie(classes)) warnings.push('two classes share the same old position — kept in the export\'s order');
  for (const c of classes) if (tie(c.ranks)) warnings.push(`${c.name}: two ranks share the same old position — kept in the export's order`);

  // Counts (contract default: 7 classes, 42 ranks in total).
  const rankTotal = classes.reduce((n, c) => n + c.ranks.length, 0);
  if (classes.length !== opts.expectClasses) errors.push(`expected ${opts.expectClasses} classes, found ${classes.length}`);
  if (rankTotal !== opts.expectRanks) errors.push(`expected ${opts.expectRanks} ranks, found ${rankTotal}`);

  // Duplicate names (capital letters and extra spaces ignored).
  const seenClass = new Map();
  for (const c of classes) {
    if (!c.name) continue;
    const k = c.name.toLowerCase();
    if (seenClass.has(k)) errors.push(`duplicate class name: ${show(seenClass.get(k))} and ${show(c.name)}`);
    else seenClass.set(k, c.name);
    const seenRank = new Map();
    for (const r of c.ranks) {
      if (!r.name) continue;
      const rk = r.name.toLowerCase();
      if (seenRank.has(rk)) errors.push(`${c.name}: duplicate rank name: ${show(seenRank.get(rk))} and ${show(r.name)}`);
      else seenRank.set(rk, r.name);
    }
  }

  // Names that would make the SQL contain a word the connection refuses,
  // or the marker that ends the SQL blocks ($seed$).
  for (const c of classes) {
    for (const n of [c.name, ...c.ranks.map((r) => r.name)]) {
      if (FORBIDDEN_RE.test(n)) errors.push(`name ${show(n)} contains a word the Supabase connection refuses (${FORBIDDEN_WORDS.join(' / ')})`);
      if (n.includes('$seed$')) errors.push(`name ${show(n)} contains "$seed$", which would break the SQL`);
    }
  }

  // nextRank check: each non-last rank should point at the rank after it.
  for (const c of classes) {
    c.ranks.forEach((r, i) => {
      if (i === c.ranks.length - 1) return;
      const next = c.ranks[i + 1];
      const old = typeof r.nextRank === 'string' ? r.nextRank : null;
      if (old === null || nameKey(old) !== next.name.toLowerCase()) {
        r.warnings.push(`old next rank ${show(old)} isn't the next rank here (${show(next.name)})`);
      }
    });
  }

  return { classes, errors, warnings };
}

// ---------------------------------------------------------------------
// 3. Work out each class's final award (rule at the top of this file)
// ---------------------------------------------------------------------
function resolveFinalAwards(classes) {
  classes.forEach((c, ci) => {
    c.finalAward = null; // { classIndex, rankIndex } when found
    c.finalAwardReason = null; // why it's Not set
    const last = c.ranks[c.ranks.length - 1];
    if (!last) {
      c.finalAwardReason = 'the class has no ranks';
      return;
    }
    const target = typeof last.nextRank === 'string' ? normalizeName(last.nextRank) : '';
    if (target === '') {
      c.finalAwardReason = `last rank "${last.name}" has no next rank in the old system`;
      return;
    }
    for (let k = ci + 1; k < classes.length; k++) {
      const ri = classes[k].ranks.findIndex((r) => r.name.toLowerCase() === target.toLowerCase());
      if (ri !== -1) {
        c.finalAward = { classIndex: k, rankIndex: ri };
        return;
      }
    }
    c.finalAwardReason = ci === classes.length - 1
      ? `"${target}" not found (no class after this one)`
      : `"${target}" not found in any later class`;
  });
}

const NONE_TEXT = "None — last rank doesn't promote";
// Shown in the review table and SQL header when --no-adjustments skips them.
const SKIPPED_WARNING = [
  'WARNING: APPROVED ADJUSTMENTS SKIPPED (--no-adjustments).',
  'This seed is the UNADJUSTED old-system data: Jeffrey\'s approved price and',
  'final-award changes are NOT in it. Do not apply it to the real database.',
];
const MARK = ' *'; // marks a cell changed by an approved adjustment

/** The final award as words. mark = add " *" when an adjustment set it. */
function finalAwardText(classes, c, mark = false) {
  if (c.finalAwardNone) return NONE_TEXT + (mark && c.awardAdjusted ? MARK : '');
  if (c.finalAward) {
    const k = classes[c.finalAward.classIndex];
    return `${k.ranks[c.finalAward.rankIndex].name} (${k.name})`;
  }
  return `Not set — ${c.finalAwardReason}`;
}

// ---------------------------------------------------------------------
// 3b. Approved adjustments (amended v0.62) — rules at the top of this file.
//     Runs after the export passed every check and the final awards were
//     worked out. Returns { list, errors }; list = what was applied, for
//     the review table and the SQL header.
// ---------------------------------------------------------------------
const PRICE_FIELDS = { earlyCents: 'early', dayCents: 'test day', privateCents: 'private' };

function applyAdjustments(adj, data, classes) {
  const errors = [];
  const list = [];
  if (adj === null || typeof adj !== 'object' || Array.isArray(adj)) {
    return { list, errors: ['adjustments: the file is not a JSON object'] };
  }
  if (adj.fixture !== data.fixture) {
    errors.push(`adjustments: "fixture" is ${show(adj.fixture)} but the export's is ${show(data.fixture)} — real and fixture files can't be mixed`);
  }
  if (!Array.isArray(adj.adjustments)) {
    errors.push('adjustments: "adjustments" must be a list');
    return { list, errors };
  }

  // Find classes / ranks by their cleaned-up name (exact match).
  const findClass = (name) => (typeof name === 'string' ? classes.filter((c) => c.name === normalizeName(name)) : []);
  const done = new Set(); // targets already adjusted, so nothing is changed twice

  adj.adjustments.forEach((a, i) => {
    const where = `adjustment #${i + 1}`;
    if (a === null || typeof a !== 'object') {
      errors.push(`${where}: not an object`);
      return;
    }
    if (typeof a.reason !== 'string' || a.reason.trim() === '') errors.push(`${where}: a "reason" is required`);
    else if (FORBIDDEN_RE.test(a.reason)) errors.push(`${where}: the reason contains a word the Supabase connection refuses`);

    const cls = findClass(a.class);
    if (cls.length !== 1) {
      errors.push(`${where}: class ${show(a.class)} matches ${cls.length} classes (must be exactly 1)`);
      return;
    }
    const c = cls[0];

    if (a.kind === 'price') {
      if (!(a.field in PRICE_FIELDS)) {
        errors.push(`${where}: "field" must be earlyCents, dayCents or privateCents, got ${show(a.field)}`);
        return;
      }
      const ranks = typeof a.rank === 'string' ? c.ranks.filter((r) => r.name === normalizeName(a.rank)) : [];
      if (ranks.length !== 1) {
        errors.push(`${where}: rank ${show(a.rank)} in ${show(c.name)} matches ${ranks.length} ranks (must be exactly 1)`);
        return;
      }
      const r = ranks[0];
      const key = `price|${c.name}|${r.name}|${a.field}`;
      if (done.has(key)) errors.push(`${where}: ${c.name} > ${r.name} > ${a.field} is adjusted twice`);
      if (a.from !== r[a.field]) errors.push(`${where}: "from" is ${show(a.from)} but the export says ${show(r[a.field])} (${c.name} > ${r.name} > ${a.field})`);
      if (!Number.isInteger(a.to) || a.to < 0 || a.to > MAX_CENTS || a.to % 100 !== 0) {
        errors.push(`${where}: "to" must be whole dollars in cents, 0–100000, got ${show(a.to)}`);
      } else if (a.to === a.from) {
        errors.push(`${where}: "to" equals "from" — it changes nothing`);
      }
      if (errors.length > 0) return; // apply only while everything is clean
      done.add(key);
      r[a.field] = a.to;
      r.adjusted = { ...(r.adjusted ?? {}), [a.field]: i + 1 };
      list.push({
        target: `${c.name} > ${r.name} > ${PRICE_FIELDS[a.field]}`,
        change: `${dollars(a.from)} -> ${dollars(a.to)}`,
        reason: a.reason,
      });
    } else if (a.kind === 'finalAward') {
      if (a.to !== 'none') {
        errors.push(`${where}: "to" must be "none" (the only final-award adjustment), got ${show(a.to)}`);
        return;
      }
      const last = c.ranks[c.ranks.length - 1];
      if (!last) {
        errors.push(`${where}: ${c.name} has no ranks`);
        return;
      }
      const key = `award|${c.name}`;
      if (done.has(key)) errors.push(`${where}: ${c.name}'s final award is adjusted twice`);
      // "from" = what the export says the last rank leads to (its old nextRank).
      const exported = last.nextRank ?? null;
      if ((a.from ?? null) !== exported) {
        errors.push(`${where}: "from" is ${show(a.from)} but the export says ${c.name}'s last rank "${last.name}" has nextRank ${show(exported)}`);
      }
      if (errors.length > 0) return;
      done.add(key);
      const before = finalAwardText(classes, c);
      c.finalAwardNone = true;
      c.finalAward = null;
      c.awardAdjusted = i + 1;
      list.push({ target: `${c.name} > final award`, change: `${before} -> None`, reason: a.reason });
    } else {
      errors.push(`${where}: "kind" must be "price" or "finalAward", got ${show(a.kind)}`);
    }
  });
  return { list, errors };
}

// ---------------------------------------------------------------------
// 4. The review table Jeffrey reads before anything is written
// ---------------------------------------------------------------------
function reviewTable(data, classes, generalWarnings, meta) {
  const out = [];
  out.push('SEED REVIEW — classes and ranks copied into BOTH schools (Worcester and Shrewsbury)');
  out.push(`Input:    ${meta.inputLabel}${data.fixture === true ? '   ** FIXTURE — not for production **' : ''}`);
  out.push(`Source:   ${oneLine(data.source ?? '(not given)')}`);
  out.push(`Exported: ${oneLine(data.exportedAt ?? '(not given)')}`);
  out.push(`sha256:   ${meta.sha256}`);
  out.push('');

  // Approved adjustments first, so the reviewer sees every change up front.
  if (meta.adjustLabel) {
    out.push(`ADJUSTMENTS (approved) — ${meta.adjustLabel} (sha256 ${meta.adjustSha256})`);
    if (meta.adjustments.length === 0) out.push('  (none applied)');
    else {
      out.push(textTable(
        ['#', 'Target', 'Change', 'Reason'],
        meta.adjustments.map((x, i) => [String(i + 1), x.target, x.change, oneLine(x.reason)]),
      ));
    }
    out.push(`  Cells marked "${MARK.trim()}" below were changed by these adjustments; the export file itself is unchanged.`);
  } else if (meta.adjustSkipped) {
    out.push(SKIPPED_WARNING.map((l) => '!!! ' + l).join('\n'));
  } else {
    out.push('ADJUSTMENTS (approved) — none (no --adjustments file given)');
  }
  out.push('');

  // Summary: one line per class.
  out.push('CLASSES (belt order)');
  out.push(textTable(
    ['Pos', 'Old pos', 'Class', 'Ranks', 'Final award', 'Warning'],
    classes.map((c, i) => [
      String(i), String(c.oldPosition), c.name || show(c.rawName), String(c.ranks.length),
      finalAwardText(classes, c, true), c.nameWarning ?? '',
    ]),
  ));
  out.push('');

  // A price cell, with " *" when an adjustment changed it.
  const price = (r, field) => (Number.isInteger(r[field]) ? dollars(r[field]) : show(r[field]))
    + (r.adjusted && r.adjusted[field] ? MARK : '');

  // Detail: every rank, class by class.
  classes.forEach((c, i) => {
    out.push(`CLASS ${i} — ${c.name || show(c.rawName)} — ${c.ranks.length} rank${c.ranks.length === 1 ? '' : 's'} — final award: ${finalAwardText(classes, c, true)}`);
    if (c.ranks.length === 0) {
      out.push('  (no ranks)');
    } else {
      out.push(textTable(
        ['Pos', 'Old pos', 'Rank', 'Early', 'Test day', 'Private', 'Sparring', 'Old next rank', 'Warning'],
        c.ranks.map((r, ri) => [
          String(ri), String(r.oldPosition), r.name || show(r.rawName),
          price(r, 'earlyCents'), price(r, 'dayCents'), price(r, 'privateCents'),
          r.sparringGear === true ? 'Yes' : r.sparringGear === false ? 'No' : show(r.sparringGear),
          typeof r.nextRank === 'string' ? r.nextRank : '(none)',
          r.warnings.join('; '),
        ]),
      ));
    }
    out.push('');
  });

  const rankWarnings = classes.reduce((n, c) => n + c.ranks.filter((r) => r.warnings.length).length, 0)
    + classes.filter((c) => c.nameWarning).length;
  const totalRanks = classes.reduce((n, c) => n + c.ranks.length, 0);
  out.push(`TOTAL: ${classes.length} classes, ${totalRanks} ranks per school (x2 schools = ${classes.length * 2} classes, ${totalRanks * 2} ranks)`);
  out.push(`Warnings: ${rankWarnings + generalWarnings.length}`);
  for (const w of generalWarnings) out.push('  - ' + w);
  return out.join('\n');
}

// ---------------------------------------------------------------------
// 5. Build the SQL text
// ---------------------------------------------------------------------
function buildSql(data, classes, meta) {
  const L = []; // lines of the file

  // A fixture file must never run on the real database: its very first
  // statement stops the run with an error.
  if (data.fixture === true) {
    L.push("do $$ begin raise exception 'FIXTURE seed — not for production'; end $$;");
    L.push('');
  }

  const awardSummary = classes.map((c) => `--     ${pad(c.name, 14)} -> ${finalAwardText(classes, c)}`);
  L.push(
    '-- =====================================================================',
    `-- ${meta.outLabel}`,
    '-- ---------------------------------------------------------------------',
    '-- WHAT THIS FILE IS',
    '--   The starting list of testing classes and ranks for BOTH schools',
    '--   (Worcester and Shrewsbury get the same list), copied from the old',
    '--   Color Belt system. Generated by supabase/manual/make_seed.mjs —',
    '--   DO NOT EDIT BY HAND: change the export and run the script again.',
    '--',
    `--   Generated from: ${oneLine(meta.inputLabel)}`,
    `--   Input sha256:   ${meta.sha256}`,
    `--   Generated at:   ${meta.generatedAt}`,
    `--   Source:         ${oneLine(data.source ?? '(not given)')}`,
    `--   Exported at:    ${oneLine(data.exportedAt ?? '(not given)')}`,
    ...(data.fixture === true ? ['--   ** FIXTURE (made-up test data) — the first line above refuses to run. **'] : []),
    ...(meta.adjustLabel
      ? [`--   Adjustments:    ${oneLine(meta.adjustLabel)}`,
         `--   Adj. sha256:    ${meta.adjustSha256}`,
         ...meta.adjustments.map((x, i) => `--     ${i + 1}. ${oneLine(x.target)}: ${oneLine(x.change)} (${oneLine(x.reason)})`)]
      : meta.adjustSkipped
        ? SKIPPED_WARNING.map((l) => '-- !!! ' + l)
        : ['--   Adjustments:    none']),
    '--',
    '-- WHY IT EXISTS',
    '--   The Testing -> Classes and ranks screen needs the real belt list and',
    '--   prices. Copying them by script (after Jeffrey checks the printed',
    '--   review table) avoids typing 84 ranks by hand.',
    '--',
    `-- WHAT IT ADDS (per school): ${classes.length} classes, ${classes.reduce((n, c) => n + c.ranks.length, 0)} ranks, and each`,
    '--   class\'s final award (what its last rank tests for):',
    ...awardSummary,
    '--',
    '-- HOW TO APPLY (only after Jeffrey OKs the review table)',
    '--   Run AFTER migration 0003_testing_classes_ranks.sql. Supabase SQL',
    '--   Editor -> New query -> paste this whole file -> Run. It is one',
    '--   transaction: if anything fails, nothing is kept.',
    '--   Safe to run again: a school that already has ANY class is skipped',
    '--   (you will see a notice "<School> already has classes — skipped.").',
    '--   The last query shows the class and rank counts per school.',
    '--',
    '-- WORDS USED BELOW',
    '--   * tkd.actor_label - the name the change history shows for these rows',
    '--     ("Initial copy from the old system"), because the SQL Editor is not',
    '--     a staff member.',
    '--   * tkd.action = seed and one tkd.batch_id - every history row this',
    '--     file writes is tagged "seed" and shares one batch id.',
    '--   * The ids below are fixed uuids made by the script, so the final-award',
    '--     links can point at the right rank. Each school gets its own ids.',
    '--   * Prices are in cents: 6500 = $65.',
    '--   * Each class gets version 2 if a final award is set (the award is',
    '--     linked in a second step, after its rank exists) — that is normal.',
    '--   * final_award_none = true means "None": the class\'s last rank does',
    '--     not promote, on purpose (e.g. Deputy is practice for Dan testing).',
    '--     false with no rank = "Not set" (still to be decided).',
    '-- =====================================================================',
    '',
    'begin;',
    '',
    '-- Tags read by the change-history trigger (true = only for this transaction).',
    "select set_config('tkd.actor_label', 'Initial copy from the old system', true);",
    "select set_config('tkd.action', 'seed', true);",
    `select set_config('tkd.batch_id', '${meta.batchId}', true);`,
    '',
  );

  for (const school of SCHOOLS) {
    // Fresh ids for this school's classes and ranks.
    const classIds = classes.map(() => randomUUID());
    const rankIds = classes.map((c) => c.ranks.map(() => randomUUID()));
    const loc = sqlText(school.code);

    L.push(
      '-- ---------------------------------------------------------------------',
      `-- ${school.name}`,
      '-- Skipped if this school already has any class (so re-running is safe).',
      '-- Order: classes first (no final award yet), then ranks, then the',
      '-- final awards (a class can only point at a rank that already exists).',
      '-- ---------------------------------------------------------------------',
      'do $seed$',
      'begin',
      '  -- Lock this school\'s row first, so if the file is run twice at the same',
      '  -- moment the second run waits here, then sees the classes and skips.',
      `  perform 1 from public.locations where code = ${loc} for no key update;`,
      '',
      `  if exists (select 1 from public.testing_classes where location_code = ${loc}) then`,
      `    raise notice '${school.name} already has classes — skipped.';`,
      '    return;',
      '  end if;',
      '',
      '  -- Classes (positions 0, 1, 2 … in belt order).',
      '  -- final_award_none = true for "None" classes (no rank is ever linked to them).',
      '  insert into public.testing_classes (id, location_code, name, position, final_award_rank_id, final_award_none) values',
      classes.map((c, i) => `    ('${classIds[i]}', ${loc}, ${sqlText(c.name)}, ${i}, null, ${c.finalAwardNone === true})`).join(',\n') + ';',
      '',
    );

    // Ranks: one insert for all, grouped by class with a comment per class.
    const rankRows = [];
    classes.forEach((c, i) => {
      c.ranks.forEach((r, ri) => {
        rankRows.push(
          `    ('${rankIds[i][ri]}', '${classIds[i]}', ${loc}, ${sqlText(r.name)}, ${ri}, ` +
          `${r.earlyCents}, ${r.dayCents}, ${r.privateCents}, ${r.sparringGear})`,
        );
      });
    });
    if (rankRows.length > 0) {
      L.push(
        '  -- Ranks (positions 0, 1, 2 … inside each class; prices in cents).',
        '  insert into public.testing_ranks',
        '    (id, class_id, location_code, name, position, early_cents, day_cents, private_cents, sparring_gear) values',
        rankRows.join(',\n') + ';',
        '',
      );
    }

    // Final awards (only the classes that have one; Not set stays null).
    const awardLines = [];
    classes.forEach((c, i) => {
      if (!c.finalAward) return;
      const { classIndex, rankIndex } = c.finalAward;
      const rankName = classes[classIndex].ranks[rankIndex].name;
      awardLines.push(
        `  -- ${oneLine(c.name)} -> ${oneLine(rankName)} (${oneLine(classes[classIndex].name)})`,
        `  update public.testing_classes set final_award_rank_id = '${rankIds[classIndex][rankIndex]}' where id = '${classIds[i]}';`,
      );
    });
    const none = classes.filter((c) => c.finalAwardNone).map((c) => oneLine(c.name));
    const notSet = classes.filter((c) => !c.finalAward && !c.finalAwardNone).map((c) => oneLine(c.name));
    L.push('  -- Final awards.' + (none.length ? ` None (set above): ${none.join(', ')}.` : '')
      + (notSet.length ? ` Not set: ${notSet.join(', ')}.` : ''));
    L.push(...awardLines);
    L.push('end', '$seed$;', '');
  }

  L.push(
    '-- Clear the tags so nothing after this is mislabelled.',
    "select set_config('tkd.actor_label', '', true);",
    "select set_config('tkd.action', '', true);",
    "select set_config('tkd.batch_id', '', true);",
    '',
    'commit;',
    '',
    `-- Check: each school should show ${classes.length} classes and ${classes.reduce((n, c) => n + c.ranks.length, 0)} ranks.`,
    'select location_code,',
    "       count(*) filter (where kind = 'class') as classes,",
    "       count(*) filter (where kind = 'rank')  as ranks",
    "  from (select location_code, 'class' as kind from public.testing_classes",
    '        union all',
    "        select location_code, 'rank' as kind from public.testing_ranks) t",
    ' group by 1',
    ' order by 1;',
    '',
  );
  return L.join('\n');
}

// ---------------------------------------------------------------------
// 6. Main
// ---------------------------------------------------------------------
function main() {
  const opts = parseArgs(process.argv.slice(2));
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '..', '..');
  const label = (p) => {
    const rel = path.relative(repoRoot, path.resolve(p));
    return rel.startsWith('..') || path.isAbsolute(rel) ? path.basename(p) : rel.split(path.sep).join('/');
  };

  let raw;
  try {
    raw = readFileSync(opts.input);
  } catch (e) {
    fail(`can't read ${opts.input}: ${e.message}`);
  }
  let data;
  try {
    data = JSON.parse(raw.toString('utf8'));
  } catch (e) {
    fail(`${opts.input} is not valid JSON: ${e.message}`);
  }

  const isFixture = data && data.fixture === true;
  const outPath = opts.out ?? path.join(path.dirname(path.resolve(opts.input)), isFixture ? FIXTURE_SEED_FILE : REAL_SEED_FILE);
  // A fixture must never land in the real seed file's name.
  if (isFixture && path.basename(outPath) === REAL_SEED_FILE) {
    fail(`refusing: the input is a FIXTURE ("fixture": true) and --out is ${REAL_SEED_FILE}. Use ${FIXTURE_SEED_FILE}.`);
  }

  const meta = {
    inputLabel: label(opts.input),
    outLabel: path.basename(outPath),
    sha256: createHash('sha256').update(raw).digest('hex'),
    generatedAt: new Date().toISOString(),
    batchId: randomUUID(), // one per file
    adjustLabel: null, // set below when adjustments are used
    adjustSha256: null,
    adjustments: [],
    adjustSkipped: false, // true = --no-adjustments on a real export
  };

  // A real export always uses the approved adjustments unless told not to.
  if (!isFixture && !opts.adjustments) {
    if (opts.noAdjustments) meta.adjustSkipped = true;
    else opts.adjustments = path.join(scriptDir, DEFAULT_ADJUSTMENTS_FILE);
  }

  const { classes, errors, warnings } = validateExport(data, opts);
  resolveFinalAwards(classes);

  // Approved adjustments: only applied to an export that passed every check.
  if (opts.adjustments) {
    let adjRaw;
    let adj;
    try {
      adjRaw = readFileSync(opts.adjustments);
      adj = JSON.parse(adjRaw.toString('utf8'));
    } catch (e) {
      fail(`can't read adjustments ${opts.adjustments}: ${e.message}`);
    }
    meta.adjustLabel = label(opts.adjustments);
    meta.adjustSha256 = createHash('sha256').update(adjRaw).digest('hex');
    if (errors.length === 0) {
      const result = applyAdjustments(adj, data, classes);
      meta.adjustments = result.list;
      errors.push(...result.errors);
    } else {
      errors.push('adjustments not applied: fix the export errors first');
    }
  }

  console.log(reviewTable(data, classes, warnings, meta));

  if (errors.length > 0) {
    console.error('');
    console.error(`HARD ERRORS (${errors.length}) — no SQL written:`);
    for (const e of errors) console.error('  - ' + e);
    process.exit(1);
  }

  const sql = buildSql(data, classes, meta);
  // Last safety net: the connection refuses SQL with these words anywhere.
  const hit = sql.match(FORBIDDEN_RE);
  if (hit) fail(`internal check failed: the SQL would contain "${hit[0]}" — no SQL written.`);

  writeFileSync(outPath, sql);
  console.log('');
  console.log(`SQL written: ${label(outPath)}`);
}

main();
