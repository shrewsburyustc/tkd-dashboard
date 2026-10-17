// belts.js — what each rank's belt looks like, and the rules for a valid belt.
// Why it exists: every rank gets a small belt picture (rulebook v0.64/v0.65), drawn by the screens
// from five values stored with the rank. The screens, the preview backend (mockTesting.js) and
// — once Jeffrey approves the look — the database all use the SAME rules, kept here.
// (Preview first: the database columns are planned but not built yet. Contract 0003 §5.8.)
//
// The five values (JavaScript name → planned database column):
//   beltPattern        → belt_pattern           'solid' | 'stripe' | 'half'
//   beltColor          → belt_color             the main color (for 'half': the TOP half)
//   beltColor2         → belt_color_2           'stripe': the middle-stripe color; 'half': the BOTTOM
//                                               half; 'solid': always null
//   beltEndStripes     → belt_end_stripes       0–3 short stripes near the end (e.g. Bo Dan stripes)
//   beltEndStripeColor → belt_end_stripe_color  their color (usually yellow); required when > 0
// Colors are keys from one fixed list (BELT_COLORS), never free text, so a belt can't be
// misspelled and the screens know how to draw every color.

// The colors a belt can use, in the order the color pickers list them.
export const BELT_COLORS = [
  { key: 'white', name: 'White' },
  { key: 'yellow', name: 'Yellow' },
  { key: 'orange', name: 'Orange' },
  { key: 'green', name: 'Green' },
  { key: 'blue', name: 'Blue' },
  { key: 'purple', name: 'Purple' },
  { key: 'red', name: 'Red' },
  { key: 'brown', name: 'Brown' },
  { key: 'black', name: 'Black' },
];
export const BELT_PATTERNS = ['solid', 'stripe', 'half'];
export const BELT_END_STRIPES_MAX = 3;
export const DEFAULT_END_STRIPE_COLOR = 'yellow';

// The belt a rank gets when there's nothing to copy from (the first rank of an empty class).
export const PLAIN_WHITE_BELT = Object.freeze({
  beltPattern: 'solid',
  beltColor: 'white',
  beltColor2: null,
  beltEndStripes: 0,
  beltEndStripeColor: DEFAULT_END_STRIPE_COLOR,
});

const COLOR_KEYS = new Set(BELT_COLORS.map((c) => c.key));
const colorName = (key) => BELT_COLORS.find((c) => c.key === key)?.name ?? key;
const lower = (key) => colorName(key).toLowerCase();

// Just the five belt values of a rank (or of anything that has them), as a new object.
export function beltOf(rank) {
  return {
    beltPattern: rank?.beltPattern ?? null,
    beltColor: rank?.beltColor ?? null,
    beltColor2: rank?.beltColor2 ?? null,
    beltEndStripes: rank?.beltEndStripes ?? null,
    beltEndStripeColor: rank?.beltEndStripeColor ?? null,
  };
}

// Are two belts the same? (Used for "nothing changed" checks in the Edit rank dialog.)
export function sameBelt(a, b) {
  const x = beltOf(a);
  const y = beltOf(b);
  return Object.keys(x).every((key) => x[key] === y[key]);
}

// What's wrong with a belt, as a code (the screens turn codes into words). null = fine.
//   'badPattern'          pattern isn't solid / stripe / half
//   'badColor'            main or second color isn't one of BELT_COLORS
//   'color2NotAllowed'    a solid belt has a second color
//   'missingColor2'       a stripe/half belt has no second color
//   'sameColors'          a stripe/half belt uses the same color twice (it would look solid)
//   'badEndStripes'       end stripes isn't a whole number 0–3
//   'missingEndStripeColor' end stripes > 0 but no color for them
//   'badEndStripeColor'   the end-stripe color isn't one of BELT_COLORS
export function validateBelt(belt) {
  if (!belt || !BELT_PATTERNS.includes(belt.beltPattern)) return 'badPattern';
  if (!COLOR_KEYS.has(belt.beltColor)) return 'badColor';
  const color2 = belt.beltColor2 ?? null;
  if (belt.beltPattern === 'solid') {
    if (color2 !== null) return 'color2NotAllowed';
  } else {
    if (color2 === null) return 'missingColor2';
    if (!COLOR_KEYS.has(color2)) return 'badColor';
    if (color2 === belt.beltColor) return 'sameColors';
  }
  const stripes = belt.beltEndStripes;
  if (!Number.isInteger(stripes) || stripes < 0 || stripes > BELT_END_STRIPES_MAX) return 'badEndStripes';
  const stripeColor = belt.beltEndStripeColor ?? null;
  if (stripes > 0 && stripeColor === null) return 'missingEndStripeColor';
  if (stripeColor !== null && !COLOR_KEYS.has(stripeColor)) return 'badEndStripeColor';
  return null;
}

// The belt in plain English, for screen readers and tooltips. null if the belt isn't valid.
//   "Plain white" · "Blue with a white middle stripe" · "Top half red, bottom half black" ·
//   "Black with a white middle stripe and 2 yellow end stripes" · "Black with 1 yellow end stripe"
export function describeBelt(belt) {
  if (validateBelt(belt) !== null) return null;
  const n = belt.beltEndStripes;
  const ends = n > 0 ? `${n} ${lower(belt.beltEndStripeColor)} end stripe${n === 1 ? '' : 's'}` : '';
  if (belt.beltPattern === 'half') {
    const text = `Top half ${lower(belt.beltColor)}, bottom half ${lower(belt.beltColor2)}`;
    return ends ? `${text}, with ${ends}` : text;
  }
  if (belt.beltPattern === 'stripe') {
    const text = `${colorName(belt.beltColor)} with a ${lower(belt.beltColor2)} middle stripe`;
    return ends ? `${text} and ${ends}` : text;
  }
  return ends ? `${colorName(belt.beltColor)} with ${ends}` : `Plain ${lower(belt.beltColor)}`;
}

// The starting belt for "Add rank": a copy of the class's current last rank's belt (the next
// belt is usually similar), or plain white when the class is empty or that belt isn't valid.
export function defaultBeltFor(cls) {
  const ranks = [...(cls?.ranks ?? [])].sort((a, b) => a.position - b.position);
  const last = ranks[ranks.length - 1];
  const copy = last ? beltOf(last) : null;
  return copy && validateBelt(copy) === null ? copy : { ...PLAIN_WHITE_BELT };
}
