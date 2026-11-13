// breakingRules.js — the small pure rules every Board breaking screen shares (contract CONTRACT-0051 §4).
// Why it exists: the Add student and Edit student boxes show a live "Amount" line, the roster row shows a
// belt picture and a payment tag, and the chart groups its ranks by age band. All of that is the same
// arithmetic and the same lists on several screens, so it lives here once, with no browser and no database
// in it (plain `node` can import it). THE DATABASE STAYS THE TRUTH: every amount here is only the preview
// the screen shows while someone types; brk_add_student / brk_edit_registration work the real number out
// again and send it back.
//
// What is in here:
//   money    priceCents / unitCents / priceLine   (the same price maths as the database function)
//   boards   bandFor / recommendedBoards          (age band + rank → how many Technical / Adult boards)
//   ranks    rankOptions / beltFor                (the one long rank list and the belt picture of a rank)
//   classes  recommendedClassId / classLabel      (which class time a rank usually comes to)
//   payment  paidState / owedCents / paidCents    (what the roster tag says)
import { classTimeLabel, shortTime, PAYING_BY } from '../testing/eventRules.js';
import { formatMoney } from '../money.js';
import { PUBLIC_ORIGIN } from '../publicOrigin.js';

export { PAYING_BY };

// The family link of an event: the school's one public address + /breaking/<code> (src/lib/publicOrigin.js is the
// ONE place that names the address; the public page itself is built later, so for now this is a placeholder
// that already has its final shape).
export const breakingLink = (code) => `${PUBLIC_ORIGIN}/breaking/${code}`;

// ----- The four chart groups ("bands") -----
export const BANDS = ['tiger', 'child', 'teen', 'black'];
export const BAND_LABELS = { tiger: 'Little Tiger', child: 'Child', teen: 'Teen / Adult', black: 'Black Belt' };
// The line under a group's name on the Chart tab. childMaxAge = the settings' age line (12).
export function bandRule(band, childMaxAge = 12) {
  if (band === 'tiger') return 'Little Tiger belts, at any age';
  if (band === 'child') return `Age ${childMaxAge} and under`;
  if (band === 'teen') return `Age ${childMaxAge + 1} and up`;
  return 'Black Belt ranks, at any age';
}

export const PAYING_BY_LABELS = { cash: 'Cash', check: 'Check', card: 'Card' };
export const payingByLabel = (value) => PAYING_BY_LABELS[value] ?? '';

// Limits the database checks (SIGNATURES-0051): boards 0–12 each, at least one in all; age 1–99.
export const MAX_BOARDS = 12;
export const MIN_AGE = 1;
export const MAX_AGE = 99;
export const NAME_MAX = 60;
export const OVERRIDE_MAX_CENTS = 1000000; // brk_set_override: 0–1,000,000 cents
export const UNDO_WINDOW_MS = 10 * 1000; // staff may undo their own payment this long (Camps' rule)

// ----- Money -----

// What ONE board costs, in cents. kind = 'tech' | 'adult'. card = Paying by Card, sameDay = on or after the
// event date. (Card adds a little to every board; so does the event day.)
export function unitCents(kind, { card = false, sameDay = false } = {}, settings) {
  const base = kind === 'adult' ? settings.adultCents : settings.techCents;
  return base + (card ? settings.cardExtraCents : 0) + (sameDay ? settings.sameDayExtraCents : 0);
}

// The amount for a student, in cents — the database's own rule, written again:
//   tech × (tech price + card? + same day?) + adult × (adult price + card? + same day?)
export function priceCents({ tech, adult, card = false, sameDay = false }, settings) {
  const t = Number.isInteger(tech) ? tech : 0;
  const a = Number.isInteger(adult) ? adult : 0;
  return t * unitCents('tech', { card, sameDay }, settings) + a * unitCents('adult', { card, sameDay }, settings);
}

// The worked line under the amount: "4 Technical × $3 + 4 × $1 same day = $16".
// Shows the card part only when Paying by is Card and the same-day part only on the event day.
export function priceLine({ tech, adult, card = false, sameDay = false }, settings) {
  const parts = [];
  const kinds = [
    ['Technical', tech, settings.techCents],
    ['Adult', adult, settings.adultCents],
  ];
  const boards = (tech || 0) + (adult || 0);
  for (const [label, count, base] of kinds) {
    if (!count) continue;
    parts.push(`${count} ${label} × ${formatMoney(base)}`);
  }
  if (card && boards > 0) parts.push(`${boards} × ${formatMoney(settings.cardExtraCents)} card`);
  if (sameDay && boards > 0) parts.push(`${boards} × ${formatMoney(settings.sameDayExtraCents)} same day`);
  if (parts.length === 0) return '';
  return `${parts.join(' + ')} = ${formatMoney(priceCents({ tech, adult, card, sameDay }, settings))}`;
}

// ----- Boards from the chart -----

const isTigerRank = (name) => /^little tiger\b/i.test(name ?? '');

// Which chart group a student uses (CONTRACT-0051 §4): a "Little Tiger …" rank → tiger, a rank that is in
// the Black Belt group → black (age ignored), anything else → child when age ≤ childMaxAge, else teen.
// chart = [{ band, rankName, … }] (camelCase, as breakingApi gives it). → 'tiger' | 'child' | 'teen' | 'black'
export function bandFor(rankName, age, chart, childMaxAge = 12) {
  // The database's own order (brk_price): a Black Belt rank first, then a Little Tiger one, then the age line.
  if (chart.some((r) => r.band === 'black' && r.rankName === rankName)) return 'black';
  if (isTigerRank(rankName) || chart.some((r) => r.band === 'tiger' && r.rankName === rankName)) return 'tiger';
  return Number.isInteger(age) && age > childMaxAge ? 'teen' : 'child';
}

// The chart row's numbers for a student, or null when the rank isn't on the chart (the steppers then keep
// whatever they show). → { band, tech, adult, technique }
export function recommendedBoards(chart, rankName, age, childMaxAge = 12) {
  const band = bandFor(rankName, age, chart, childMaxAge);
  const row = chart.find((r) => r.band === band && r.rankName === rankName);
  return row ? { band, tech: row.techBoards, adult: row.adultBoards, technique: row.technique ?? '' } : { band, tech: null, adult: null, technique: '' };
}

// ----- The one long rank list (Add student / Edit student) -----
// Every distinct rank name on the chart, in this order: Little Tiger belts, then the regular and High belts
// (the Child and Teen groups share their names), then the Black Belt ranks. Each keeps the chart's own order
// inside its group. → [{ name, band }]  (band = the group it first appears in)
export function rankOptions(chart) {
  const seen = new Set();
  const out = [];
  for (const band of BANDS) {
    const rows = chart.filter((r) => r.band === band).sort((a, b) => a.sort - b.sort);
    for (const row of rows) {
      if (seen.has(row.rankName)) continue;
      seen.add(row.rankName);
      out.push({ name: row.rankName, band });
    }
  }
  return out;
}

// The ranks a student of this AGE can be given: only the ranks that exist in the groups their age selects (the database refuses any
// other, so a rank an admin deleted from the Child group never shows for a 9-year-old, even while the Teen group still has it):
// the Little Tiger ranks, the Child ranks (age <= the age line) or the Teen / Adult ranks, and the Black Belt ranks.
// age = a whole number, or null (not typed yet: the Child list). → [{ name, band }] in the chart's own order.
export function rankOptionsFor(chart, age, childMaxAge = 12) {
  const ageBand = Number.isInteger(age) && age > childMaxAge ? 'teen' : 'child';
  const out = [];
  for (const band of ['tiger', ageBand, 'black']) {
    for (const row of chart.filter((r) => r.band === band).sort((a, b) => a.sort - b.sort)) out.push({ name: row.rankName, band });
  }
  return out;
}

// How a rank is WRITTEN on the roster, in dialogs and hints (the approved B-staff pictures say "Orange belt", "High Green belt"): a plain
// colour rank gets the word "belt"; Little Tiger ranks, Red / Black, Bo-Dan / Deputy and every Dan rank are written as they are. The
// Chart tab shows the plain names (as the C-admin picture does). ONE place, so the wording never drifts.
const PLAIN_COLOR_RANK = /^(white|yellow|orange|green|high green|blue|high blue|purple|red|high red|brown|high brown)$/i;
export function rankLabel(rankName) {
  const name = String(rankName ?? '');
  return PLAIN_COLOR_RANK.test(name.trim()) ? `${name} belt` : name;
}

// ----- Belt pictures (components/Belt.jsx takes this shape) -----
// A rank NAME → { beltPattern, beltColor, beltColor2 }. Words in the name decide it, so an admin who adds a rank
// called "Brown belt" or "High Brown belt" gets a picture without anyone editing a table:
//   "Little Tiger Yellow"  white belt with a yellow stripe ("Little Tiger White": plain white)
//   "High Green belt"      the color with a white stripe          "Red / Black"  half red, half black
//   "Bo-Dan / Deputy"      black with a white stripe              "1st Dan …"   black
//   "Orange belt"          one solid color
// An unknown word draws the neutral gray (Belt.jsx). danStripe: draw a Dan rank black with a white stripe (the
// roster picture does, as Color belt testing's Bo Dan belt); the chart draws it solid black.
const COLORS = ['white', 'yellow', 'orange', 'green', 'blue', 'purple', 'red', 'brown', 'black'];
export function beltFor(rankName, { danStripe = false } = {}) {
  const name = String(rankName ?? '').trim();
  const lower = name.toLowerCase();
  if (lower === '') return null;
  if (/^little tiger\b/.test(lower)) {
    const color = COLORS.find((c) => lower.includes(c)) ?? 'white';
    return color === 'white'
      ? { beltPattern: 'solid', beltColor: 'white' }
      : { beltPattern: 'stripe', beltColor: 'white', beltColor2: color };
  }
  if (lower.includes('red') && lower.includes('black')) return { beltPattern: 'half', beltColor: 'red', beltColor2: 'black' };
  if (/\b(dan|deputy)\b/.test(lower)) {
    const boDan = /\bbo[ -]?dan\b/.test(lower) || /\bdeputy\b/.test(lower);
    return boDan || danStripe
      ? { beltPattern: 'stripe', beltColor: 'black', beltColor2: 'white' }
      : { beltPattern: 'solid', beltColor: 'black' };
  }
  const color = COLORS.find((c) => lower.includes(c)) ?? null;
  if (!color) return { beltPattern: 'solid', beltColor: 'unknown' };
  return /^high\b/.test(lower) ? { beltPattern: 'stripe', beltColor: color, beltColor2: 'white' } : { beltPattern: 'solid', beltColor: color };
}

// ----- Class times -----

// "Group D · 4:20 – 5:00 PM" pieces for the roster's group header: the clock part only.
export function classTimes(cls) {
  return classTimeLabel(cls?.startTime, cls?.endTime);
}
// "Group D · 4:20 PM" — a class chip's words (name and the start time).
export function classChipLabel(cls) {
  const t = shortTime(cls?.startTime);
  if (t === null) return cls?.name ?? '';
  const h = Number(t.slice(0, 2));
  const hour = ((h + 11) % 12) + 1;
  return `${cls.name} · ${hour}:${t.slice(3)} ${h < 12 ? 'AM' : 'PM'}`;
}

// The class a rank usually comes to, as a starting choice in Add student (a hint only; any class is fine).
// Matches by the class NAME's words, because the database keeps no such link: White or Little Tiger belts →
// the "Tiger" / "White" class; Teen / Adult (age above the line, or a Black Belt rank) → the "Teen" / "Adult"
// class; Yellow to High Green → "Group D"; Blue to Purple → "Group B"; Red and above → "Group A".
// → the class row, or null when nothing matches.
export function recommendedClass(classes, rankName, band) {
  const lower = String(rankName ?? '').toLowerCase();
  const find = (...words) => classes.find((c) => words.some((w) => c.name.toLowerCase().includes(w))) ?? null;
  if (band === 'teen' || band === 'black') return find('teen', 'adult');
  if (band === 'tiger' || /^white\b/.test(lower)) return find('tiger', 'white');
  if (/(yellow|orange|green)/.test(lower)) return find('group d');
  if (/(blue|purple)/.test(lower)) return find('group b');
  if (/(red|brown)/.test(lower)) return find('group a');
  return null;
}

// ----- What the roster says about a student's payment -----

// What the student owes: the admin's override when there is one, else the amount worked out.
export function owedCents(reg) {
  return Number.isInteger(reg.overrideCents) ? reg.overrideCents : reg.amountCents;
}
// What stands paid: every payment row, refunds and reversals included (they are minus amounts).
export function paidCents(reg) {
  return (reg.payments ?? []).reduce((total, p) => total + p.amountCents, 0);
}
// 'paid' (net paid ≥ owed, the database's own rule for the Events list's "paid" count; a student whose price
// an admin set to $0 therefore counts as paid) · 'awaiting' (card with a Square link, unpaid) · 'unpaid'.
export function paidState(reg) {
  if (paidCents(reg) >= owedCents(reg)) return 'paid';
  if (reg.payingBy === 'card' && reg.hasLink) return 'awaiting';
  return 'unpaid';
}

// ----- Small checks the dialogs make before they send (the database checks again) -----

export function boardsProblem(tech, adult) {
  if (!Number.isInteger(tech) || !Number.isInteger(adult) || tech < 0 || adult < 0) return 'boards';
  if (tech > MAX_BOARDS || adult > MAX_BOARDS) return 'boards';
  if (tech + adult < 1) return 'noBoards';
  return null;
}
export function ageProblem(text) {
  const t = String(text ?? '').trim();
  if (t === '') return 'empty';
  if (!/^\d+$/.test(t)) return 'notNumber';
  const n = Number(t);
  return n < MIN_AGE || n > MAX_AGE ? 'range' : null;
}
export function nameFieldProblem(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (t === '') return 'empty';
  return t.length > NAME_MAX ? 'long' : null;
}

// Dollars typed in a price box → whole cents, or null. Accepts "3", "3.25", "$3.25", "1,000.50"; not "3.255".
export function dollarsToCents(text) {
  let s = String(text ?? '').trim();
  if (s.startsWith('$')) s = s.slice(1).trim();
  s = s.replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, decimals = ''] = s.split('.');
  return Number(whole) * 100 + Number(decimals.padEnd(2, '0'));
}
// 325 → "3.25" (what goes in a price box). null → "".
export function centsToDollarsText(cents) {
  if (!Number.isInteger(cents)) return '';
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}
