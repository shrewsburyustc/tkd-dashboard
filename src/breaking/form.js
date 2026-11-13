// form.js — the pure rules of the public Board breaking sign-up form (no React, no browser).
// Why it exists: the page, the preview's fake Function and the checks (checks.mjs) all need the same few
// rules: what the Function's answer means, which ranks an age may pick (one long list in three groups), how
// many boards the chart recommends, what the family is asked to check, the live price PREVIEW and the
// body that is sent. Keeping them here, away from React, lets plain `node` test them.
//
// THE DATABASE STAYS THE TRUTH (contract 0051 §4, SIGNATURES-0051): brk_public_signup works the real amount
// out again and answers `price_changed` when it differs from `expected_total_cents`. The numbers here are
// only what the page SHOWS while someone types, and the amount it expects. The maths and the rank lists
// are the dashboard's own (src/lib/breaking/breakingRules.js), written once and shared with the staff
// screens, so the family page can never drift from the Add student box.
import { ageProblem, bandFor, beltFor, boardsProblem, MAX_BOARDS, priceCents, rankOptionsFor, recommendedBoards, unitCents } from '../lib/breaking/breakingRules.js';
import { nameProblem, normalizeName } from '../lib/testing/names.js';
import { formatMoneyWithCents } from '../lib/money.js';
import * as T from './text.js';

export { MAX_BOARDS };
export const PAYING_BY = ['cash', 'check', 'card'];
export const MIN_FILL_MS = 4000; // the Function refuses a form sent sooner than this after it was opened

// ----- The Function's GET answer, in camelCase for the screens -----
// → { name, locationCode, eventDate, open, classes, prices, childMaxAge, chart } or null when the answer is
// not the shape FUNCTION-API.md promises (the page then says "didn't load" instead of guessing).
export function eventFromAnswer(answer) {
  const e = answer?.event;
  if (answer?.status !== 'ok' || !e || typeof e !== 'object') return null;
  const p = e.prices;
  const ints = [p?.tech_cents, p?.adult_cents, p?.card_extra_cents, p?.same_day_extra_cents, e.child_max_age];
  if (typeof e.name !== 'string' || typeof e.location_code !== 'string' || typeof e.event_date !== 'string') return null;
  if (!ints.every((n) => Number.isInteger(n) && n >= 0) || !Array.isArray(e.classes) || !Array.isArray(e.chart)) return null;
  return {
    name: e.name,
    locationCode: e.location_code,
    eventDate: e.event_date,
    open: e.registration_state === 'open',
    classes: e.classes.map((c) => ({ id: c.id, name: c.name, startTime: c.start_time, endTime: c.end_time })),
    prices: { techCents: p.tech_cents, adultCents: p.adult_cents, cardExtraCents: p.card_extra_cents, sameDayExtraCents: p.same_day_extra_cents, sameDay: p.same_day === true },
    childMaxAge: e.child_max_age,
    chart: e.chart.map((r) => ({ band: r.band, rankName: r.rank_name, sort: r.sort, technique: r.technique ?? '', techBoards: r.tech_boards, adultBoards: r.adult_boards })),
  };
}

// "Shrewsbury" from the school code (the page shows "U.S.T.C. Shrewsbury").
export const schoolName = (code) => (code === 'worcester' ? 'Worcester' : code === 'shrewsbury' ? 'Shrewsbury' : '');

// ----- Class times: "Group D (4:20-5:00 PM)" -----
function clock(time) {
  const m = /^(\d{2}):(\d{2})/.exec(String(time ?? ''));
  if (!m) return null;
  const h = Number(m[1]);
  return { text: `${((h + 11) % 12) + 1}:${m[2]}`, half: h < 12 ? 'AM' : 'PM' };
}
export function classLabel(cls) {
  const a = clock(cls?.startTime);
  const b = clock(cls?.endTime);
  if (!a || !b) return cls?.name ?? '';
  const span = a.half === b.half ? `${a.text}-${b.text} ${b.half}` : `${a.text} ${a.half}-${b.text} ${b.half}`;
  return `${cls.name} (${span})`;
}

// ----- The form -----
export const emptyForm = () => ({ first: '', last: '', age: '', rank: '', classId: '', tech: 0, adult: 0, payingBy: null });

// The age as a whole number, or null (empty, not a number or outside 1–99).
export function ageNumber(text) {
  return ageProblem(text) === null ? Number(String(text).trim()) : null;
}

// The ONE long rank list for this age, in three groups: Little Tiger belts, Color Belts (the Child or the Teen / Adult
// list, by the age typed; the Child list while no age is typed) and Black Belt. → [{ label, ranks: [name] }]
export function rankGroups(event, age) {
  const groups = [
    { band: 'tiger', label: T.GROUP_TIGER, ranks: [] },
    { band: 'belts', label: T.GROUP_BELTS, ranks: [] },
    { band: 'black', label: T.GROUP_BLACK, ranks: [] },
  ];
  for (const option of rankOptionsFor(event.chart, age, event.childMaxAge)) {
    const group = groups.find((g) => g.band === (option.band === 'child' || option.band === 'teen' ? 'belts' : option.band));
    group.ranks.push(option.name);
  }
  return groups.filter((g) => g.ranks.length > 0).map(({ label, ranks }) => ({ label, ranks }));
}

// The same list for the rank picker: every rank with its belt picture, drawn as the staff roster draws it (a Dan rank
// black with a white stripe). → [{ label, options: [{ value, label, belt }] }]
export const beltOf = (rankName) => beltFor(rankName, { danStripe: true });
export function rankPickerGroups(event, age) {
  return rankGroups(event, age).map((g) => ({ label: g.label, options: g.ranks.map((name) => ({ value: name, label: name, belt: beltOf(name) })) }));
}

// Does Tab choose the highlighted rank in the open rank list? Only when a rank was already chosen, or the person moved with
// the arrows / typed. With nothing chosen and nothing touched, Tab just closes the list and moves on (it must never pick
// the first rank by itself, which would also fill in boards).
export const tabChooses = (chosenIndex, moved) => chosenIndex >= 0 || moved === true;

// The chart's recommended boards for this age and rank → { band, tech, adult, technique } or null (no age or
// rank yet, or the rank has no row in the group the age selects).
export function recommendationFor(event, age, rankName) {
  if (!rankName || age === null) return null;
  const found = recommendedBoards(event.chart, rankName, age, event.childMaxAge);
  return found.tech === null ? null : found;
}

// Changing the age or the rank: a rank that the new age doesn't offer is cleared, and the boards are filled
// in from the chart again (they can be changed afterwards with the − and + buttons).
export function applyChange(form, patch, event) {
  const next = { ...form, ...patch };
  if (!('age' in patch) && !('rank' in patch)) return next;
  const age = ageNumber(next.age);
  const offered = rankGroups(event, age).some((g) => g.ranks.includes(next.rank));
  if (next.rank && !offered) {
    next.rank = '';
    next.tech = 0;
    next.adult = 0;
    return next;
  }
  const rec = recommendationFor(event, age, next.rank);
  if (rec) {
    next.tech = rec.tech;
    next.adult = rec.adult;
  }
  return next;
}

// Which chart table the "View full requirement chart" fold-out shows: the group of the chosen rank (Little Tiger
// or Black Belt), else the group the age selects (Child while no age is typed). → { band, rows, foot: [sentences] }
export function chartView(event, age, rankName) {
  const ageBand = age !== null && age > event.childMaxAge ? 'teen' : 'child';
  const band = rankName ? bandFor(rankName, age, event.chart, event.childMaxAge) : ageBand;
  const rowsOf = (b) => event.chart.filter((r) => r.band === b).sort((x, y) => x.sort - y.sort);
  const rows = rowsOf(band);
  const foot = [];
  if (band !== 'tiger') {
    const texts = [...new Set(rowsOf('tiger').map((r) => T.boardsText(r.techBoards, r.adultBoards)))];
    foot.push(texts.length === 1 ? T.chartTigerFoot(texts[0]) : T.CHART_TIGER_OWN);
  }
  if (band !== 'black') foot.push(T.CHART_BLACK_OWN);
  if (band === 'child' || band === 'teen') foot.push(T.chartAgeOwn(band, event.childMaxAge));
  return { band, rows, foot };
}

// ----- The live price preview (the database's own rule, SIGNATURES-0051) -----
// The page shows the LISTED price (what a board costs by card, plus the event-day amount on the event day) and a
// discount for paying cash or check (Jeffrey: families are only ever shown the listed price and a cash / check discount). The database keeps its own
// prices (cash / check) and the card difference, so the money is the same either way:
//   listed  = tech × (tech price + card difference + same day?) + adult × (adult price + card difference + same day?)
//   cash / check total = listed − boards × card difference   (= the database's tech × (tech price + same day?) + …)
//   card total = listed
// → { boards, lines: [{ key, text, small?, cents }], totalCents, saveHint }. `lines` are the worked lines of the Amount
// card (the discount line is a minus amount); `totalCents` is exactly the database's number for the chosen way to pay
// (before a way is chosen it is the listed price, and `saveHint` says what paying cash or check saves).
export function priceView(form, event) {
  const tech = Number.isInteger(form.tech) ? form.tech : 0;
  const adult = Number.isInteger(form.adult) ? form.adult : 0;
  const sameDay = event.prices.sameDay;
  const settings = event.prices;
  const boards = tech + adult;
  const listed = (kind) => unitCents(kind, { card: true, sameDay }, settings);
  const lines = [];
  if (tech > 0) lines.push({ key: 'tech', text: T.lineBoards(T.TECHNICAL, tech, formatMoneyWithCents(listed('tech'))), cents: tech * listed('tech') });
  if (adult > 0) lines.push({ key: 'adult', text: T.lineBoards(T.ADULT, adult, formatMoneyWithCents(listed('adult'))), cents: adult * listed('adult') });
  const difference = settings.cardExtraCents;
  const discounted = (form.payingBy === 'cash' || form.payingBy === 'check') && difference > 0 && boards > 0;
  if (discounted) {
    lines.push({ key: 'discount', text: T.DISCOUNT, small: T.boardsTimes(boards, formatMoneyWithCents(difference)), cents: -boards * difference });
  }
  const totalCents = lines.reduce((sum, l) => sum + l.cents, 0);
  const saveHint = form.payingBy === null && difference > 0 ? T.saveHint(formatMoneyWithCents(difference)) : null;
  return { boards, lines, totalCents, saveHint };
}
// What one board of a kind is listed at on this event ('tech' | 'adult'), in cents (the card price, plus the event-day amount on the event day).
export const listedCents = (kind, event) => unitCents(kind, { card: true, sameDay: event.prices.sameDay }, event.prices);
export { unitCents };

// ----- Checking the form before it is sent (the Function and the database check again) -----
// → an object { fieldKey: words } in screen order; empty = fine. Keys: first, last, age, rank, classId, boards, paying.
export function formErrors(form, event) {
  const errors = {};
  const nameError = (text, emptyWords) => {
    const problem = nameProblem(text);
    if (problem === null) return null;
    return problem === 'empty' ? emptyWords : problem === 'tooLong' ? T.ERR_NAME_LONG : T.ERR_NAME_BAD;
  };
  const first = nameError(form.first, T.ERR_FIRST);
  if (first) errors.first = first;
  const last = nameError(form.last, T.ERR_LAST);
  if (last) errors.last = last;
  const age = ageProblem(form.age);
  if (age) errors.age = age === 'empty' ? T.ERR_AGE : age === 'notNumber' ? T.ERR_AGE_NUMBER : T.ERR_AGE_RANGE;
  if (!form.rank) errors.rank = T.ERR_RANK;
  if (!event.classes.some((c) => c.id === form.classId)) errors.classId = T.ERR_CLASS;
  if (boardsProblem(form.tech, form.adult)) errors.boards = T.ERR_BOARDS;
  if (!PAYING_BY.includes(form.payingBy)) errors.paying = T.ERR_PAYING;
  return errors;
}

// The id of each field's input (so Register can move focus to the first problem).
export const fieldId = (key) => `brk-${key}`;

// The student's name as the done page says it: "Ava R."
export function shortName(first, last) {
  const f = normalizeName(first);
  const l = [...normalizeName(last)][0];
  return l ? `${f} ${l.toUpperCase()}.` : f;
}

// ----- What is sent (FUNCTION-API.md, action signup) -----
export function buildSignupBody({ form, submissionId, startedAt, sentAt, honeypot, token, expectedTotalCents }) {
  return {
    action: 'signup',
    submission_id: submissionId,
    first_name: normalizeName(form.first),
    last_name: normalizeName(form.last),
    age: Number(String(form.age).trim()),
    rank_name: form.rank,
    class_id: form.classId,
    tech: form.tech,
    adult: form.adult,
    paying_by: form.payingBy,
    expected_total_cents: expectedTotalCents,
    website: honeypot,
    started_at: startedAt,
    sent_at: sentAt,
    turnstile_token: token,
  };
}

// ----- The Square link: only Square's own https address is ever followed -----
// The SAME rules as the database (brk_public_set_link, migration 0051) and the Function (functions/_lib/breaking.js
// isSquareLink): https only, no user name, no port, and the WHOLE host (small letters) one of LINK_HOSTS. A change to
// the list needs a later migration AND a change in the Function AND here. This is the page's own last check before it
// leaves the page. → the address as text, or null.
export const LINK_HOSTS = ['square.link', 'checkout.square.site', 'connect.squareup.com', 'sandbox.square.link', 'connect.squareupsandbox.com', 'checkout.squareupsandbox.com'];
// The same two patterns the database uses: the whole address, then the host alone. After "https://" only letters,
// digits, dots and dashes up to the first "/" — so no user name ("x@") and no port (":443").
const LINK_SHAPE = /^https:\/\/[A-Za-z0-9.-]+(\/[A-Za-z0-9._~:/?#@!$&'()*+,;=%-]*)?$/;
const LINK_HOST = /^https:\/\/([A-Za-z0-9.-]+)(?:\/|$)/;
export function safePayUrl(url) {
  if (typeof url !== 'string' || url.length === 0 || url.length > 2000 || !LINK_SHAPE.test(url)) return null;
  const host = LINK_HOST.exec(url)?.[1]?.toLowerCase();
  return typeof host === 'string' && LINK_HOSTS.includes(host) ? url : null;
}

// What the done page says the student signed up for, from the form that was sent.
export function summaryOf(form, event) {
  const cls = event.classes.find((c) => c.id === form.classId);
  return {
    name: shortName(form.first, form.last),
    classText: cls ? classLabel(cls) : '',
    rank: form.rank,
    age: Number(String(form.age).trim()),
    boardsText: T.boardsText(form.tech, form.adult),
    payingBy: form.payingBy,
  };
}
