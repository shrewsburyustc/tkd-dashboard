// rankOrder.js — works out everything that follows from the ORDER of classes and ranks.
// Why it exists: the database stores only names, prices and positions. "Testing for" (which
// belt a student tests for next) is never stored — it is worked out from the order:
//   - a rank tests for the next rank in its class;
//   - the last rank of a class tests for the class's "final award" (a rank in a later class).
// A class's final award has three states (rulebook v0.62):
//   'set'    — a rank (finalAwardRankId = that rank's id)
//   'none'   — None: the last rank doesn't promote, on purpose (finalAwardNone = true),
//              e.g. Group D and Teen/Adult, whose last rank Deputy is practice for Dan testing
//   'notSet' — not decided yet (no rank, finalAwardNone = false) → the amber reminder
// These are plain functions (no React, no browser), so the screens, the preview backend and
// the Node checks (checks.mjs) all use the exact same logic.
//
// Words used:
//   raw classes  — what api.js loads: [{ id, name, position, finalAwardRankId, version, …, ranks }]
//   class views  — the same plus the worked-out fields below (withTestingFor)
//   belt order   — classes sorted by position (Little Tiger first … Teen/Adult last)
// Every function here accepts raw classes OR class views, in any order.
import { beltOf } from './belts.js';

// ----- The final-award "choice" (what the Final award field holds) -----
// One value instead of two: null = Not set, FINAL_AWARD_NONE = None, otherwise a rank id.
// (A rank id is a uuid, so it can never be the word 'none'.)
export const FINAL_AWARD_NONE = 'none';

// The saved choice of a class: null | FINAL_AWARD_NONE | '<rank id>'.
export function finalAwardChoiceOf(cls) {
  if (!cls) return null;
  if (cls.finalAwardNone === true) return FINAL_AWARD_NONE;
  return cls.finalAwardRankId ?? null;
}

// Turns a choice into the two values addClass / updateClass send.
export function finalAwardArgs(choice) {
  if (choice === FINAL_AWARD_NONE) return { finalAwardRankId: null, finalAwardNone: true };
  return { finalAwardRankId: choice ?? null, finalAwardNone: false };
}

// ----- Small helpers -----

const byPosition = (a, b) => a.position - b.position;

// Classes in belt order, each with its ranks in order. Never changes the input arrays.
function sortedClasses(classes) {
  return [...(classes ?? [])]
    .sort(byPosition)
    .map((c) => ({ ...c, ranks: [...(c.ranks ?? [])].sort(byPosition) }));
}

// Finds a rank anywhere in the school. Returns { rank, cls, index } or null.
function findRank(sorted, rankId) {
  for (const cls of sorted) {
    const index = cls.ranks.findIndex((r) => r.id === rankId);
    if (index !== -1) return { rank: cls.ranks[index], cls, index };
  }
  return null;
}

// The other classes (in belt order) whose final award is one of the given rank ids — the
// classes that would lose their final award if those ranks were deleted.
function classesUsingAward(sorted, rankIds, exceptClassId = null) {
  const ids = new Set(rankIds);
  return sorted
    .filter((c) => c.id !== exceptClassId && c.finalAwardRankId != null && ids.has(c.finalAwardRankId))
    .map((c) => ({ id: c.id, name: c.name }));
}

// ----- The main view -----

// The state of a class's final award: 'set' | 'none' | 'notSet'. An award id that isn't in the
// list counts as 'notSet' (never show a name we can't find). None wins over a rank id (the
// database never allows both).
function awardOf(sorted, cls) {
  if (cls.finalAwardNone === true) return { state: 'none', found: null };
  const found = cls.finalAwardRankId != null ? findRank(sorted, cls.finalAwardRankId) : null;
  return { state: found ? 'set' : 'notSet', found };
}

// Adds the worked-out fields to every class and rank (see contract 0003 §5.3):
//   class: rankCount, finalAward { rankId, name, classId, className } | null,
//          finalAwardState 'set'|'none'|'notSet'
//   rank:  isLast, testingFor { rankId, name } | null, finalAwardState 'set'|'none'|'notSet'|null,
//          nextBelt — the belt of the rank it tests for (the "→ [belt]" picture), or null
//          when it tests for nothing (last rank with None / Not set)   (v0.64)
export function withTestingFor(classes) {
  const sorted = sortedClasses(classes);
  return sorted.map((cls) => {
    const { state, found } = awardOf(sorted, cls);
    const finalAward = found
      ? { rankId: found.rank.id, name: found.rank.name, classId: found.cls.id, className: found.cls.name }
      : null;
    const lastIndex = cls.ranks.length - 1;
    const ranks = cls.ranks.map((rank, index) => {
      const isLast = index === lastIndex;
      // The rank this one tests for: the next rank, or for the last rank the final award.
      const target = !isLast ? cls.ranks[index + 1] : found ? found.rank : null; // None/Not set → null
      const testingFor = target ? { rankId: target.id, name: target.name } : null;
      return {
        ...rank,
        isLast,
        testingFor,
        nextBelt: target ? beltOf(target) : null,
        // Only the last rank shows the award state (amber reminder for 'notSet').
        finalAwardState: isLast ? state : null,
      };
    });
    return { ...cls, rankCount: ranks.length, finalAward, finalAwardState: state, ranks };
  });
}

// ----- Reordering -----

// A new array with the id at fromIndex moved to toIndex. Indexes outside the list are
// clamped; an unknown fromIndex returns an unchanged copy.
export function moveId(ids, fromIndex, toIndex) {
  const next = [...(ids ?? [])];
  if (!Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex >= next.length) return next;
  const target = Math.min(Math.max(Number(toIndex) || 0, 0), next.length - 1);
  const [moved] = next.splice(fromIndex, 1);
  next.splice(target, 0, moved);
  return next;
}

// Puts items in the order of newIds and rewrites positions 0, 1, 2 … (like the server).
// Items missing from newIds keep their old order and go at the end (shouldn't happen).
function applyOrder(items, newIds) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const ordered = [];
  for (const id of newIds ?? []) {
    if (byId.has(id)) {
      ordered.push(byId.get(id));
      byId.delete(id);
    }
  }
  const rest = items.filter((item) => byId.has(item.id)).sort(byPosition);
  return [...ordered, ...rest].map((item, index) => ({ ...item, position: index }));
}

// Used for the optimistic update (the new order shows at once, before the server answers).
// Returns the classes with ONE class's ranks in the new order.
export function reorderRanksLocal(classes, classId, newIds) {
  return (classes ?? []).map((c) => (c.id === classId ? { ...c, ranks: applyOrder(c.ranks ?? [], newIds) } : c));
}

// Same for the classes of the school.
export function reorderClassesLocal(classes, newIds) {
  return applyOrder(classes ?? [], newIds);
}

// The current id lists, in order (what the reorder calls send as "expected").
export function classOrderIds(classes) {
  return sortedClasses(classes).map((c) => c.id);
}

export function rankOrderIds(classes, classId) {
  const cls = sortedClasses(classes).find((c) => c.id === classId);
  return cls ? cls.ranks.map((r) => r.id) : [];
}

// ----- What the dialogs need -----

// The choices for "Final award after this class", in list order:
//   [{ kind: 'none', value: FINAL_AWARD_NONE },                       ← "None" (always listed)
//    { kind: 'class', classId, className, ranks: [{ id, name }] }, …]  ← every OTHER class, belt order
// Classes with no ranks are skipped. "Not set" (value null) is added by the screen, BEFORE these.
// For Add class pass classId = null (every class is listed).
export function finalAwardOptions(classes, classId) {
  const groups = sortedClasses(classes)
    .filter((c) => c.id !== classId && c.ranks.length > 0)
    .map((c) => ({ kind: 'class', classId: c.id, className: c.name, ranks: c.ranks.map((r) => ({ id: r.id, name: r.name })) }));
  return [{ kind: 'none', value: FINAL_AWARD_NONE }, ...groups];
}

// For the Add rank dialog: the new rank goes at the end, and its prices start as a copy of
// the current last rank's (just a starting point — the server doesn't copy anything).
export function describeAddRank(classes, classId) {
  const cls = sortedClasses(classes).find((c) => c.id === classId);
  if (!cls) return null;
  const last = cls.ranks[cls.ranks.length - 1] ?? null;
  return {
    className: cls.name,
    lastRankName: last ? last.name : null,
    copied: last
      ? { earlyCents: last.earlyCents, dayCents: last.dayCents, privateCents: last.privateCents, sparringGear: last.sparringGear }
      : null,
  };
}

// Everything the "Delete rank?" confirmation says, plus the exact arguments to send.
// The server refuses (stale) if anything the sentence states has changed since — that's why
// the rank list is sent in order and the class version is included (it names the award).
export function describeRankDelete(classes, rankId) {
  const sorted = sortedClasses(classes);
  const found = findRank(sorted, rankId);
  if (!found) return null;
  const { rank, cls, index } = found;
  const previous = cls.ranks[index - 1] ?? null;
  const next = cls.ranks[index + 1] ?? null;
  const award = awardOf(sorted, cls);
  const lostAwardClasses = classesUsingAward(sorted, [rank.id]); // a None class never appears here
  return {
    rankName: rank.name,
    className: cls.name,
    previousRankName: previous ? previous.name : null,
    nextRankName: next ? next.name : null,
    isLast: next === null,
    finalAwardState: award.state, // the class's: 'set' | 'none' | 'notSet'
    finalAwardName: award.found ? award.found.rank.name : null,
    isOnlyRank: cls.ranks.length === 1,
    lostAwardClasses,
    rpcArgs: {
      rankId: rank.id,
      expectedVersion: rank.version,
      expectedClassVersion: cls.version,
      expectedRankIds: cls.ranks.map((r) => r.id), // in order
      expectedLostAwardClassIds: lostAwardClasses.map((c) => c.id),
    },
  };
}

// Everything the "Delete class?" confirmation says, plus the exact arguments to send.
export function describeClassDelete(classes, classId) {
  const sorted = sortedClasses(classes);
  const cls = sorted.find((c) => c.id === classId);
  if (!cls) return null;
  const rankIds = cls.ranks.map((r) => r.id);
  const lostAwardClasses = classesUsingAward(sorted, rankIds, cls.id);
  return {
    className: cls.name,
    rankCount: cls.ranks.length,
    lostAwardClasses,
    rpcArgs: {
      classId: cls.id,
      expectedVersion: cls.version,
      expectedRankIds: rankIds, // the server compares these as a set
      expectedLostAwardClassIds: lostAwardClasses.map((c) => c.id),
      onlyIfEmpty: false,
    },
  };
}

// Can "Undo" of "Rank added" still safely delete that rank? Checked on the latest loaded data:
//   gone         — it's not there any more
//   edited       — someone changed it since it was added (version isn't 1)
//   isFinalAward — a class now uses it as its final award (Undo would clear that, so it refuses)
export function checkUndoAddRank(classes, rankId) {
  const sorted = sortedClasses(classes);
  const found = findRank(sorted, rankId);
  if (!found) return { ok: false, reason: 'gone' };
  if (found.rank.version !== 1) return { ok: false, reason: 'edited', className: found.cls.name, rankName: found.rank.name };
  const users = classesUsingAward(sorted, [rankId]);
  if (users.length > 0) return { ok: false, reason: 'isFinalAward', className: users[0].name, rankName: found.rank.name };
  const { rpcArgs } = describeRankDelete(sorted, rankId);
  return { ok: true, rpcArgs: { ...rpcArgs, expectedVersion: 1, expectedLostAwardClassIds: [] } };
}
