// format.js — turns what the server sends (dates, addresses, belts, money) into what the
// family page shows.
// Why it exists: the server answers in database style ('2026-11-20', snake_case names, cents);
// the page writes "Friday, November 20, 2026", "$65" and draws belts. Kept apart from the
// screens so each rule is written once.
import { formatDollars } from '../lib/money.js';
import { addDays } from '../lib/testing/eventRules.js';
import * as T from './text.js';

export { formatDollars };

// 'YYYY-MM-DD' → a Date at midnight UTC. Formatting it in UTC below means the day never
// shifts, whatever time zone the family's phone is set to.
function utcDate(dateIso) {
  const [y, m, d] = String(dateIso).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
const LONG_YEAR = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const LONG = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' });
const SHORT = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });

// "Friday, November 20, 2026"
export const longDateWithYear = (dateIso) => LONG_YEAR.format(utcDate(dateIso));
// "Friday, November 20"
export const longDate = (dateIso) => LONG.format(utcDate(dateIso));
// "Fri, Nov 20"
export const shortDate = (dateIso) => SHORT.format(utcDate(dateIso));
// The last day of the early price: the day before testing ("Thursday, November 19").
export const earlyDeadline = (testingDateIso) => longDate(addDays(testingDateIso, -1));

// Reads a field in either spelling (camelCase or snake_case), like eventRules.js does.
function pick(object, ...names) {
  if (!object || typeof object !== 'object') return undefined;
  for (const name of names) if (object[name] !== undefined && object[name] !== null) return object[name];
  return undefined;
}

// The school's address as one line: "12 Main St, Worcester, MA 01608". The server may send it
// as text or as its four parts. Nothing usable → '' (the page then shows only the school name,
// rulebook v0.135).
export function addressLine(address) {
  if (!address) return '';
  if (typeof address === 'string') return address.trim();
  const street = pick(address, 'street', 'address_street');
  const city = pick(address, 'city', 'address_city');
  const state = pick(address, 'state', 'address_state');
  const zip = pick(address, 'zip', 'address_zip');
  const stateZip = [state, zip].filter(Boolean).join(' ');
  return [street, city, stateZip].filter(Boolean).join(', ');
}

// "Worcester school, 12 Main St, Worcester, MA 01608" — or just "Worcester school".
export function locationLine(schoolName, address) {
  const line = addressLine(address);
  const school = T.schoolLabel(schoolName ?? '');
  return line ? `${school}, ${line}` : school;
}

// The five belt values (belts.js style) from whatever the server sent: the fields directly on
// the object (belt_pattern … or beltPattern …) or inside a `belt` object. null = no belt.
export function beltFrom(source) {
  if (!source || typeof source !== 'object') return null;
  const from = source.belt && typeof source.belt === 'object' ? source.belt : source;
  const belt = {
    beltPattern: pick(from, 'beltPattern', 'belt_pattern', 'pattern') ?? 'solid',
    beltColor: pick(from, 'beltColor', 'belt_color', 'color') ?? null,
    beltColor2: pick(from, 'beltColor2', 'belt_color_2', 'color_2', 'color2') ?? null,
    beltEndStripes: pick(from, 'beltEndStripes', 'belt_end_stripes', 'end_stripes') ?? 0,
    beltEndStripeColor: pick(from, 'beltEndStripeColor', 'belt_end_stripe_color', 'end_stripe_color') ?? 'yellow',
  };
  return belt.beltColor ? belt : null;
}

// "Cash" / "Cash or check" for a list of payment methods ('cash', 'check').
export function methodsLabel(methods) {
  const unique = [...new Set(methods)].filter((m) => T.METHOD[m]);
  if (unique.length === 0) return '';
  const words = unique.map((m, i) => (i === 0 ? T.METHOD[m] : T.METHOD[m].toLowerCase()));
  return words.join(' or ');
}

// A payment method in the middle of a sentence: "cash".
export const methodWord = (method) => (T.METHOD[method] ?? '').toLowerCase();
