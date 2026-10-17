// names.js — the rules for class and rank names, written once for the screens AND the preview.
// Why it exists: the database checks every name (migration 0003, testing_normalize_name and
// testing_name_is_valid). The screens use the SAME rules so they can warn while you type, and
// the preview backend (mockTesting.js) uses them so it refuses exactly what the server refuses.
// If these rules change, change them in the database AND here (contract 0003 §1.5).
//
// The rules, in order:
//   1. Every run of "blank" characters (space, tab, new line, carriage return, vertical tab,
//      form feed, no-break space) becomes ONE space.
//   2. Spaces at the start and end are removed.
//   3. Any other invisible control character, zero-width character or text-direction mark
//      makes the name unusable.
//   4. The result must be 1–60 characters long (counted as characters, not bytes).
//   5. Two names are "the same" if they match ignoring upper/lower case.

// The longest name allowed, in characters.
export const NAME_MAX = 60;

// Characters that count as "blank".   is the no-break space (often pasted from Word or
// web pages). A run of them (the + sign) is replaced by one plain space.
const BLANK_RUN = /[ \t\n\r\f\v ]+/g;

// Characters that are never allowed, because they are invisible or can disguise a name:
//   - control characters like "bell" or "escape": U+0001–U+0008, U+000E–U+001F, U+007F–U+009F
//   - zero-width characters and direction marks: U+200B–U+200F
//   - text-direction overrides (can make a name display backwards): U+202A–U+202E
//   - invisible joiners/operators: U+2060–U+2064, direction isolates: U+2066–U+2069
//   - the "byte order mark" (an invisible zero-width space): U+FEFF
// Same list as the database (security review amendment to contract 0003 §1.5).
const BAD_CHARACTER = /[\u0001-\u0008\u000e-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/;

// Only plain spaces are trimmed (the database uses btrim(…, ' ')). JavaScript's own .trim()
// would also remove other kinds of space, which would disagree with the database.
const EDGE_SPACES = /^ +| +$/g;

// The name exactly as the database will store it. null/undefined → '' (empty).
export function normalizeName(text) {
  if (text === null || text === undefined) return '';
  return String(text).replace(BLANK_RUN, ' ').replace(EDGE_SPACES, '');
}

// How many characters the (normalized) name has. [...s] splits by real characters, so an
// emoji counts as 1 — the same as the database's char_length. (s.length would count 2.)
export function nameLength(text) {
  return [...normalizeName(text)].length;
}

// What's wrong with a name, as a code the screens turn into words (text.js):
//   null           — the name is fine
//   'badCharacter' — has an invisible/control/direction character (checked first)
//   'empty'        — nothing left after removing spaces
//   'tooLong'      — more than 60 characters
export function nameProblem(text) {
  const name = normalizeName(text);
  if (BAD_CHARACTER.test(name)) return 'badCharacter';
  const length = [...name].length;
  if (length === 0) return 'empty';
  if (length > NAME_MAX) return 'tooLong';
  return null;
}

// The comparison key for "is this the same name?": normalized, then lower case.
export function nameKey(text) {
  return normalizeName(text).toLowerCase();
}

// Does another class in this school already use this name? Returns that class's stored name
// (so the message can show it, e.g. "Group A"), or null. exceptClassId = the class being
// edited (it may keep its own name).
export function findDuplicateClass(classes, name, exceptClassId) {
  const key = nameKey(name);
  if (key === '') return null;
  const match = (classes ?? []).find((c) => c.id !== exceptClassId && nameKey(c.name) === key);
  return match ? match.name : null;
}

// Same idea for ranks inside ONE class (the same rank name in another class is fine).
export function findDuplicateRank(classView, name, exceptRankId) {
  const key = nameKey(name);
  if (key === '') return null;
  const match = (classView?.ranks ?? []).find((r) => r.id !== exceptRankId && nameKey(r.name) === key);
  return match ? match.name : null;
}
