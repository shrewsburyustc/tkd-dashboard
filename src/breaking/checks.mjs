// checks.mjs — plain-Node checks for the public Board breaking sign-up page's rules (run: node src/breaking/checks.mjs).
// Why it exists: the page's live price must work out exactly what the database will (SIGNATURES-0051:
// tech × (tech price + card? + same day?) + adult × (adult price + …), in whole cents), the rank list must
// follow the age, the boards must come from the right chart group, and the form must refuse what the Function
// refuses. All of that is pure logic in form.js, so it is tested here without a browser. The chart is the
// migration's own seed (taken from the preview database), so the examples are the real numbers.
import assert from 'node:assert/strict';
import { createBreakingBackend } from '../lib/mockBreaking.js';
import { applyChange, ageNumber, beltOf, rankPickerGroups, tabChooses, buildSignupBody, chartView, classLabel, emptyForm, eventFromAnswer, formErrors, priceView, LINK_HOSTS, listedCents, rankGroups, recommendationFor, safePayUrl, shortName, summaryOf } from './form.js';
import { freshSubmission, MAX_AGE_MS } from './memory.js';
import * as T from './text.js';

let checks = 0;
const ok = (fn) => { fn(); checks += 1; };

// A GET answer like the Function's, from the preview database's seed (prices 300 / 400 / 25 / 100, age line 12).
let n = 0;
const backend = createBreakingBackend({ loadStore: () => null, saveStore: () => {}, today: () => '2026-12-10', newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` });
const store = backend.snapshot();
const answerFor = (sameDay, overrides = {}) => ({
  status: 'ok',
  event: {
    name: 'December Board Breaking', location_code: 'shrewsbury', event_date: '2026-12-18', registration_state: 'open',
    classes: store.classes.slice(0, 5).map((c) => ({ id: c.id, name: c.name, start_time: c.start_time, end_time: c.end_time })),
    prices: { tech_cents: 300, adult_cents: 400, card_extra_cents: 25, same_day_extra_cents: 100, same_day: sameDay, ...overrides },
    child_max_age: 12,
    chart: store.chart.map((r) => ({ band: r.band, rank_name: r.rank_name, sort: r.sort, technique: r.technique, tech_boards: r.tech_boards, adult_boards: r.adult_boards })),
  },
  turnstile_site_key: 'x',
});
const event = eventFromAnswer(answerFor(false));
const eventDay = eventFromAnswer(answerFor(true));
assert.ok(event && eventDay);

const total = (tech, adult, payingBy, ev = event) => priceView({ ...emptyForm(), tech, adult, payingBy }, ev).totalCents;

// ----- the price preview equals the database's maths (≥ 12 cases) -----
ok(() => assert.equal(total(4, 0, 'cash'), 1200)); // 4 × $3
ok(() => assert.equal(total(4, 0, 'check'), 1200));
ok(() => assert.equal(total(4, 0, 'card'), 1300)); // 4 × ($3 + $0.25): the A-family-form picture's $13.00
ok(() => assert.equal(total(1, 3, 'cash'), 1500)); // 3 + 12: the done-cash picture's $15.00
ok(() => assert.equal(total(0, 3, 'cash'), 1200));
ok(() => assert.equal(total(3, 0, 'card'), 975)); // Little Tiger: 3 × $3.25
ok(() => assert.equal(total(4, 3, 'card'), 4 * 325 + 3 * 425)); // Black Belt 1st Dan, card
ok(() => assert.equal(total(4, 0, 'cash', eventDay), 1600)); // same day: 4 × ($3 + $1)
ok(() => assert.equal(total(4, 0, 'card', eventDay), 1700)); // both: 4 × ($3 + $0.25 + $1)
ok(() => assert.equal(total(1, 3, 'card', eventDay), 1 * 425 + 3 * 525)); // both, tech and adult
ok(() => assert.equal(total(12, 12, 'card', eventDay), 12 * 425 + 12 * 525)); // the most
ok(() => assert.equal(total(0, 0, 'card'), 0)); // nothing chosen yet
ok(() => assert.equal(total(2, 2, null), 2 * 325 + 2 * 425)); // no way to pay chosen yet: the LISTED price (the card price)
// other prices: the page follows the Function's numbers, not its own
ok(() => assert.equal(total(2, 1, 'card', eventFromAnswer(answerFor(true, { tech_cents: 350, adult_cents: 450, card_extra_cents: 30, same_day_extra_cents: 50 }))), 2 * (350 + 30 + 50) + 1 * (450 + 30 + 50)));
ok(() => assert.equal(total(4, 0, 'card', eventFromAnswer(answerFor(true, { same_day_extra_cents: 0, card_extra_cents: 0 }))), 1200));
// the page's total is exactly the database's maths (breakingRules.priceCents = SIGNATURES-0051) for the chosen way to pay,
// in every combination: cash, check and card, on and before the event day, with and without the card difference
import { priceCents } from '../lib/breaking/breakingRules.js';
const noDifference = eventFromAnswer(answerFor(true, { card_extra_cents: 0 }));
const otherPrices = eventFromAnswer(answerFor(false, { tech_cents: 350, adult_cents: 450, card_extra_cents: 30, same_day_extra_cents: 50 }));
for (const ev of [event, eventDay, noDifference, otherPrices]) {
  for (const by of ['cash', 'check', 'card']) {
    for (const [t, a] of [[1, 0], [4, 0], [0, 3], [1, 3], [3, 4], [12, 12], [0, 1]]) {
      ok(() => assert.equal(total(t, a, by, ev), priceCents({ tech: t, adult: a, card: by === 'card', sameDay: ev.prices.sameDay }, ev.prices), `${by} ${t}+${a}`));
    }
  }
}
// the worked lines add up to the total
for (const [t, a, by, ev] of [[4, 0, 'card', event], [1, 3, 'cash', event], [4, 3, 'card', eventDay], [0, 5, 'check', eventDay], [2, 2, null, event], [3, 0, 'cash', noDifference]]) {
  ok(() => {
    const view = priceView({ ...emptyForm(), tech: t, adult: a, payingBy: by }, ev);
    assert.equal(view.lines.reduce((s, l) => s + l.cents, 0), view.totalCents);
  });
}
// the lines: the LISTED price per board (the card price), then a discount for cash or check (Jeffrey's framing)
const show = (view) => view.lines.map((l) => [l.text, l.small ?? null, l.cents]);
ok(() => assert.deepEqual(show(priceView({ ...emptyForm(), tech: 4, adult: 0, payingBy: 'card' }, event)), [['Technical 4 × $3.25', null, 1300]])); // card: no discount line, total $13.00
ok(() => assert.deepEqual(show(priceView({ ...emptyForm(), tech: 4, adult: 0, payingBy: 'cash' }, event)), [['Technical 4 × $3.25', null, 1300], ['Cash or check discount', '4 boards × $0.25', -100]])); // cash: $12.00
ok(() => assert.equal(total(4, 0, 'cash'), 1200));
ok(() => assert.equal(priceView({ ...emptyForm(), tech: 4, adult: 0, payingBy: 'check' }, event).lines.at(-1).text, 'Cash or check discount'));
ok(() => assert.deepEqual(show(priceView({ ...emptyForm(), tech: 1, adult: 3, payingBy: 'check' }, event)), [['Technical 1 × $3.25', null, 325], ['Adult 3 × $4.25', null, 1275], ['Cash or check discount', '4 boards × $0.25', -100]])); // $15.00
// the event day: the listed price includes the event-day amount (no separate line)
ok(() => assert.deepEqual(show(priceView({ ...emptyForm(), tech: 4, adult: 0, payingBy: 'card' }, eventDay)), [['Technical 4 × $4.25', null, 1700]]));
ok(() => assert.deepEqual(show(priceView({ ...emptyForm(), tech: 4, adult: 0, payingBy: 'cash' }, eventDay)), [['Technical 4 × $4.25', null, 1700], ['Cash or check discount', '4 boards × $0.25', -100]])); // $16.00
// before a way to pay is chosen: the listed total and the "save" sentence
ok(() => assert.equal(priceView({ ...emptyForm(), tech: 4, adult: 0, payingBy: null }, event).totalCents, 1300));
ok(() => assert.equal(priceView({ ...emptyForm(), tech: 4, adult: 0, payingBy: null }, event).saveHint, 'Pay by cash or check and save $0.25 per board.'));
ok(() => assert.equal(priceView({ ...emptyForm(), tech: 4, adult: 0, payingBy: 'card' }, event).saveHint, null));
ok(() => assert.equal(priceView({ ...emptyForm(), tech: 4, adult: 0, payingBy: 'cash' }, event).saveHint, null));
ok(() => assert.equal(priceView({ ...emptyForm(), tech: 4, adult: 0, payingBy: 'cash' }, otherPrices).saveHint, null));
ok(() => assert.equal(priceView({ ...emptyForm(), tech: 4, adult: 0, payingBy: null }, otherPrices).saveHint, 'Pay by cash or check and save $0.30 per board.'));
// no card difference: no discount line and no sentence at all
ok(() => assert.deepEqual(priceView({ ...emptyForm(), tech: 4, adult: 0, payingBy: 'cash' }, noDifference).lines.map((l) => l.key), ['tech']));
ok(() => assert.equal(priceView({ ...emptyForm(), tech: 4, adult: 0, payingBy: null }, noDifference).saveHint, null));
ok(() => assert.equal(listedCents('tech', event), 325));
ok(() => assert.equal(listedCents('adult', eventDay), 525));
// the family page never says "surcharge", "fee" or that the card costs extra (every word of text.js, every line the form makes)
const FORBIDDEN = /card adds|surcharge|\bfee\b|extra for card|card extra|card fee|more by card|extra by card/i;
ok(() => assert.deepEqual(Object.entries(T).filter(([, v]) => typeof v === 'string' && FORBIDDEN.test(v)), []));
ok(() => {
  const words = [];
  for (const ev of [event, eventDay, noDifference, otherPrices]) {
    for (const by of ['cash', 'check', 'card', null]) {
      const view = priceView({ ...emptyForm(), tech: 4, adult: 2, payingBy: by }, ev);
      words.push(...view.lines.flatMap((l) => [l.text, l.small ?? '']), view.saveHint ?? '');
    }
  }
  assert.deepEqual(words.filter((w) => FORBIDDEN.test(w)), []);
});
ok(() => assert.equal(priceView(emptyForm(), event).lines.length, 0)); // "No boards chosen yet"

// ----- the one long rank list, three groups, by age -----
const names = (groups, label) => groups.find((g) => g.label === label)?.ranks ?? [];
ok(() => assert.deepEqual(rankGroups(event, 9).map((g) => g.label), ['Little Tiger belts', 'Color Belts', 'Black Belt'])); // Jeffrey: "Color Belts", not "Belts"
ok(() => assert.equal(names(rankGroups(event, 9), 'Little Tiger belts')[0], 'Little Tiger White'));
ok(() => assert.equal(names(rankGroups(event, 9), 'Color Belts')[0], 'White'));
ok(() => assert.equal(names(rankGroups(event, 9), 'Color Belts').at(-1), 'Bo-Dan / Deputy'));
ok(() => assert.equal(names(rankGroups(event, 9), 'Black Belt')[0], '1st Dan'));
ok(() => assert.deepEqual(rankGroups(event, null), rankGroups(event, 9))); // no age typed: the Child list
ok(() => assert.equal(rankGroups(event, 9).flatMap((g) => g.ranks).length, 35)); // the picture's "35 choices"
ok(() => assert.ok(!rankGroups(event, 9).flatMap((g) => g.ranks).some((r) => /belt$/i.test(r)))); // plain names, as the chart
// the Belts group is the teen list for a 13-year-old: delete a rank from teen only and it disappears for them, not for an 8-year-old
const noTeenOrange = eventFromAnswer({ ...answerFor(false), event: { ...answerFor(false).event, chart: answerFor(false).event.chart.filter((r) => !(r.band === 'teen' && r.rank_name === 'Orange')) } });
ok(() => assert.ok(!names(rankGroups(noTeenOrange, 13), 'Color Belts').includes('Orange')));
ok(() => assert.ok(names(rankGroups(noTeenOrange, 8), 'Color Belts').includes('Orange')));

// ----- the rank picker's groups carry the staff roster's belt pictures -----
const picker = rankPickerGroups(event, 9);
ok(() => assert.deepEqual(picker.map((g) => g.label), ['Little Tiger belts', 'Color Belts', 'Black Belt']));
// Tab in the open list: nothing chosen and not moved → no pick (the field stays empty, boards stay as they are); moved or already chosen → picks
ok(() => assert.equal(tabChooses(-1, false), false));
ok(() => assert.equal(tabChooses(-1, true), true)); // moved with the arrows / typed
ok(() => assert.equal(tabChooses(5, false), true)); // a rank was already chosen: Tab keeps it
ok(() => assert.equal(tabChooses(0, false), true));
ok(() => assert.deepEqual(picker.map((g) => g.options.map((o) => o.value)), rankGroups(event, 9).map((g) => g.ranks))); // the same ranks, in the same order
ok(() => assert.ok(picker.flatMap((g) => g.options).every((o) => o.belt && o.belt.beltColor))); // every rank has a belt picture
const beltOfRank = (name) => picker.flatMap((g) => g.options).find((o) => o.value === name).belt;
ok(() => assert.deepEqual(beltOfRank('Little Tiger White'), { beltPattern: 'solid', beltColor: 'white' }));
ok(() => assert.deepEqual(beltOfRank('Little Tiger Yellow'), { beltPattern: 'stripe', beltColor: 'white', beltColor2: 'yellow' }));
ok(() => assert.deepEqual(beltOfRank('Orange'), { beltPattern: 'solid', beltColor: 'orange' }));
ok(() => assert.deepEqual(beltOfRank('High Green'), { beltPattern: 'stripe', beltColor: 'green', beltColor2: 'white' }));
ok(() => assert.deepEqual(beltOfRank('Red / Black'), { beltPattern: 'half', beltColor: 'red', beltColor2: 'black' }));
ok(() => assert.deepEqual(beltOfRank('Bo-Dan / Deputy'), { beltPattern: 'stripe', beltColor: 'black', beltColor2: 'white' }));
ok(() => assert.deepEqual(beltOfRank('1st Dan'), { beltPattern: 'stripe', beltColor: 'black', beltColor2: 'white' })); // Dan ranks as the roster draws them (danStripe)
ok(() => assert.deepEqual(beltOf('2nd Dan 1 Star'), beltOf('1st Dan')));
ok(() => assert.equal(rankPickerGroups(event, 14)[1].options.length, rankGroups(event, 14)[1].ranks.length)); // the age-driven list is unchanged

// ----- which chart group the boards come from -----
const rec = (age, rank) => recommendationFor(event, age, rank);
ok(() => assert.equal(rec(9, 'Blue').band, 'child'));
ok(() => assert.equal(rec(12, 'Blue').band, 'child')); // the age line itself is Child
ok(() => assert.equal(rec(13, 'Blue').band, 'teen'));
ok(() => assert.equal(rec(40, 'Green').band, 'teen'));
ok(() => assert.equal(rec(5, 'Little Tiger Red').band, 'tiger'));
ok(() => assert.equal(rec(30, 'Little Tiger Red').band, 'tiger')); // a Little Tiger rank ignores age
ok(() => assert.equal(rec(9, '1st Dan').band, 'black')); // Black Belt ranks ignore age
ok(() => assert.equal(rec(9, 'Blue').tech, 4)); // the seed's Child Blue is 4 Technical (the A-family-form picture)
ok(() => assert.equal(rec(9, 'Blue').adult, 0));
ok(() => assert.equal(rec(5, 'Little Tiger Red').tech, 3));
ok(() => assert.equal(rec(null, 'Blue'), null)); // no age yet
ok(() => assert.equal(rec(9, ''), null)); // no rank yet
ok(() => assert.equal(rec(9, 'Nonexistent'), null));
ok(() => {
  const row = (band, rank) => store.chart.find((r) => r.band === band && r.rank_name === rank);
  for (const [age, rank, band] of [[9, 'High Brown', 'child'], [14, 'High Brown', 'teen'], [20, 'Red / Black', 'teen'], [10, '3rd Dan 5 Star', 'black']]) {
    const found = rec(age, rank);
    assert.equal(found.tech, row(band, rank).tech_boards);
    assert.equal(found.adult, row(band, rank).adult_boards);
  }
});

// ----- changing the age or rank fills the boards in -----
ok(() => {
  let f = applyChange(emptyForm(), { age: '9' }, event);
  assert.deepEqual([f.tech, f.adult], [0, 0]); // no rank yet
  f = applyChange(f, { rank: 'Blue' }, event);
  assert.deepEqual([f.tech, f.adult, f.rank], [4, 0, 'Blue']);
  f = { ...f, tech: 2 }; // the family changed the amounts
  f = applyChange(f, { classId: 'x' }, event);
  assert.equal(f.tech, 2); // other fields leave their boards alone
  f = applyChange(f, { rank: '1st Dan' }, event);
  assert.deepEqual([f.tech, f.adult], [rec(9, '1st Dan').tech, rec(9, '1st Dan').adult]);
});
ok(() => { // a rank the new age doesn't offer is cleared
  const f = applyChange({ ...emptyForm(), age: '14', rank: 'Orange', tech: 3 }, { age: '9' }, noTeenOrange);
  assert.equal(f.rank, 'Orange'); // child list has it
  const g = applyChange({ ...emptyForm(), age: '9', rank: 'Orange', tech: 3 }, { age: '14' }, noTeenOrange);
  assert.deepEqual([g.rank, g.tech, g.adult], ['', 0, 0]);
});
ok(() => assert.equal(applyChange({ ...emptyForm(), age: '9', rank: 'Blue', tech: 4 }, { age: '13' }, event).tech, rec(13, 'Blue').tech)); // boards follow the age group

// ----- the chart fold-out -----
ok(() => assert.equal(chartView(event, 9, 'Blue').band, 'child'));
ok(() => assert.equal(chartView(event, 15, 'Blue').band, 'teen'));
ok(() => assert.equal(chartView(event, 15, '1st Dan').band, 'black'));
ok(() => assert.equal(chartView(event, 4, 'Little Tiger Blue').band, 'tiger'));
ok(() => assert.equal(chartView(event, null, '').band, 'child'));
ok(() => assert.equal(chartView(event, 9, 'Blue').rows.length, 14));
ok(() => assert.match(chartView(event, 9, 'Blue').foot.join(' '), /Little Tiger belts: 3 Technical\. Black Belt ranks have their own boards\. Ages 13 and up have their own list\./));
ok(() => assert.equal(T.chartHeading('child', 12), 'Ages 12 and under'));
ok(() => assert.equal(T.chartHeading('teen', 12), 'Ages 13 and up'));

// ----- validation (the Function's refusals, in screen order) -----
const good = { first: 'Ava', last: 'Rivera', age: '9', rank: 'Blue', classId: event.classes[0].id, tech: 4, adult: 0, payingBy: 'card' };
ok(() => assert.deepEqual(formErrors(good, event), {}));
ok(() => assert.deepEqual(Object.keys(formErrors(emptyForm(), event)), ['first', 'last', 'age', 'rank', 'classId', 'boards', 'paying'])); // the "form-errors" picture, in order
ok(() => assert.equal(formErrors(emptyForm(), event).first, "Enter the student's first name."));
ok(() => assert.equal(formErrors(emptyForm(), event).boards, 'Choose at least 1 board.'));
ok(() => assert.equal(formErrors(emptyForm(), event).paying, 'Choose Cash, Check or Card.'));
ok(() => assert.ok(formErrors({ ...good, first: '   ' }, event).first)); // blanks only
ok(() => assert.ok(formErrors({ ...good, last: 'x'.repeat(61) }, event).last)); // 61 characters
ok(() => assert.equal(formErrors({ ...good, last: 'x'.repeat(60) }, event).last, undefined)); // 60 is fine
ok(() => assert.ok(formErrors({ ...good, first: 'A​va' }, event).first)); // invisible character
for (const [text, bad] of [['', true], ['0', true], ['1', false], ['99', false], ['100', true], ['9.5', true], ['abc', true], ['-3', true], [' 12 ', false]]) {
  ok(() => assert.equal(Boolean(formErrors({ ...good, age: text }, event).age), bad, `age "${text}"`));
}
ok(() => assert.equal(ageNumber(' 12 '), 12));
ok(() => assert.equal(ageNumber('9.5'), null));
ok(() => assert.ok(formErrors({ ...good, tech: 0, adult: 0 }, event).boards));
ok(() => assert.equal(formErrors({ ...good, tech: 0, adult: 1 }, event).boards, undefined));
ok(() => assert.ok(formErrors({ ...good, tech: 13 }, event).boards)); // 12 each at most
ok(() => assert.ok(formErrors({ ...good, classId: 'not-a-class' }, event).classId));
ok(() => assert.ok(formErrors({ ...good, payingBy: 'bitcoin' }, event).paying));

// ----- what is sent -----
ok(() => {
  const body = buildSignupBody({ form: { ...good, first: '  Ava ', last: 'Rivera  ' }, submissionId: 'id', startedAt: 1, sentAt: 5000, honeypot: '', token: 't', expectedTotalCents: 1300 });
  assert.deepEqual(Object.keys(body).sort(), ['action', 'adult', 'age', 'class_id', 'expected_total_cents', 'first_name', 'last_name', 'paying_by', 'rank_name', 'started_at', 'sent_at', 'submission_id', 'tech', 'turnstile_token', 'website'].sort());
  assert.equal(body.first_name, 'Ava');
  assert.equal(body.age, 9);
  assert.equal(body.action, 'signup');
  assert.equal(body.website, '');
});

// ----- the Square link and small words -----
for (const url of ['https://square.link/u/abc', 'https://checkout.square.site/pay/abc', 'https://sandbox.square.link/u/abc', 'https://connect.squareup.com/v2/checkout?x=1', 'https://connect.squareupsandbox.com/x', 'https://checkout.squareupsandbox.com/x', 'https://SQUARE.LINK/u/abc']) {
  ok(() => assert.equal(safePayUrl(url), url, url)); // Square's own hosts (small or capital letters), https only
}
for (const url of ['https://evil.example/x', 'https://square.link.evil.com/x', 'https://evilsquare.link/x', 'https://square.link:8443/x', 'https://square.link:443/x', 'https://user@square.link/x', 'https://user:pw@square.link/x', 'http://square.link/x', 'javascript:alert(1)', '//square.link/x', 'https://square.link\@evil.example/x', 'https://square.link/a b', 'https://127.0.0.1/x', 'not a url', '', 'https://' + 'a'.repeat(2000) + '.square.link/x', 42, undefined, null]) {
  ok(() => assert.equal(safePayUrl(url), null, String(url)));
}
ok(() => assert.deepEqual(LINK_HOSTS, ['square.link', 'checkout.square.site', 'connect.squareup.com', 'sandbox.square.link', 'connect.squareupsandbox.com', 'checkout.squareupsandbox.com'])); // the Function's and the database's list

// ----- the remembered submission id: forgotten after 24 hours (memory.js) -----
const uuid = '11111111-1111-4111-8111-111111111111';
const entry = (at) => JSON.stringify({ id: uuid, at });
ok(() => assert.equal(freshSubmission(entry(1000), 1000 + 60 * 1000), uuid)); // a minute old
ok(() => assert.equal(freshSubmission(entry(1000), 1000 + MAX_AGE_MS - 1), uuid)); // just under 24 hours
ok(() => assert.equal(freshSubmission(entry(1000), 1000 + MAX_AGE_MS), null)); // 24 hours
ok(() => assert.equal(freshSubmission(uuid, 5000), null)); // the old format (a bare id, no time) counts as old
ok(() => assert.equal(freshSubmission(JSON.stringify({ id: uuid }), 5000), null)); // no time
ok(() => assert.equal(freshSubmission(entry(9000), 5000), null)); // a time in the future
ok(() => assert.equal(freshSubmission(JSON.stringify({ id: 'x', at: 1000 }), 1500), null)); // not an id
ok(() => assert.equal(freshSubmission(null, 1500), null));
ok(() => assert.equal(freshSubmission('{broken', 1500), null));
ok(() => assert.equal(shortName('Ava', 'Rivera'), 'Ava R.'));
ok(() => assert.equal(shortName(' ava ', 'rivera'), 'ava R.'));
ok(() => assert.equal(classLabel({ name: 'Group D', startTime: '16:20:00', endTime: '17:00:00' }), 'Group D (4:20-5:00 PM)'));
ok(() => assert.equal(classLabel({ name: 'Early', startTime: '11:30:00', endTime: '13:00:00' }), 'Early (11:30 AM-1:00 PM)'));
ok(() => assert.equal(T.boardsText(1, 3), '1 Technical + 3 Adult'));
ok(() => assert.equal(T.boardsText(4, 0), '4 Technical'));
ok(() => {
  const s = summaryOf(good, event);
  assert.deepEqual([s.name, s.rank, s.age, s.boardsText], ['Ava R.', 'Blue', 9, '4 Technical']);
});
// a GET answer that isn't the promised shape is refused (the page then says "didn't load")
ok(() => assert.equal(eventFromAnswer({ status: 'ok', event: { name: 'x' } }), null));
ok(() => assert.equal(eventFromAnswer({ status: 'not_found' }), null));
ok(() => assert.equal(eventFromAnswer({ status: 'ok', event: { ...answerFor(false).event, registration_state: 'closed' } }).open, false));

console.log(`${checks} checks passed`);
