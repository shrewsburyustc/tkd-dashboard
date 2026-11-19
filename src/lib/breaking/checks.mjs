// checks.mjs — plain-Node checks for Board breaking's shared rules and its preview database (run: node src/lib/breaking/checks.mjs).
// Why it exists: the screens' live "Amount" line (breakingRules.js) and the fake database (mockBreaking.js) must
// work out the same number as the real database will, and the staff / admin / stale / undo rules must hold. These checks
// pin the examples from the approved pictures ($12, $16, $9.75, $138.75) and the main rules of SIGNATURES-0051.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { priceCents, priceLine, bandFor, recommendedBoards, rankOptions, beltFor, paidState, hasSquarePayment } from './breakingRules.js';
import { createBreakingBackend, closedPaymentIdsFromFinance } from '../mockBreaking.js';
import { STARTER_CLASSES, startingClasses } from './starterClasses.js';
import { exampleLine } from './text/chart.js';
import * as dialogText from './text/dialogs.js';
import * as eventText from './text/events.js';
import { boardTotals, classBoardTotals, eventBoardTotals } from '../../screens/breaking/roster/rosterRules.js';
import { checkPricesForm, pricesToValues, settingsFromListed } from '../../screens/breaking/chart/chartRules.js';

const settings = { techCents: 300, adultCents: 400, cardExtraCents: 25, sameDayExtraCents: 100, childMaxAge: 12 };
let checks = 0;
const ok = (fn) => { fn(); checks += 1; };

// ----- the price maths (the pictures' examples) -----
ok(() => assert.equal(priceCents({ tech: 4, adult: 0 }, settings), 1200)); // Ava Reed, cash
ok(() => assert.equal(priceCents({ tech: 4, adult: 0, sameDay: true }, settings), 1600)); // Mia Santos, event day
ok(() => assert.equal(priceCents({ tech: 3, adult: 0, card: true }, settings), 975)); // Eli Park, card
ok(() => assert.equal(priceCents({ tech: 1, adult: 3, card: true }, settings), 1600)); // Cara Lin, card
ok(() => assert.equal(priceCents({ tech: 4, adult: 0, card: true, sameDay: true }, settings), 1700)); // the Prices card's example
// the LISTED-price framing: the listed price is the card price, cash or check gets a discount; the money is the same
ok(() => assert.equal(priceLine({ tech: 4, adult: 0, sameDay: true }, settings), '4 Technical × $3.25 + 4 × $1 same day − 4 × $0.25 discount = $16'));
ok(() => assert.equal(priceLine({ tech: 3, adult: 0, card: true }, settings), '3 Technical × $3.25 = $9.75')); // a card: no discount line
ok(() => assert.equal(priceLine({ tech: 4, adult: 0 }, { ...settings, cardExtraCents: 0 }), '4 Technical × $3 = $12')); // no discount set: no discount line
ok(() => assert.equal(exampleLine(settings), 'Cash, 4 Technical, event day: 4 × $4.25 = $17.00, minus the $1.00 discount = $16.00'));
// the Edit prices dialog: today's $3.00 / $4.00 / $0.25 show as listed $3.25 / $4.25 and a $0.25 discount, and convert back on save
ok(() => assert.deepEqual(pricesToValues(settings), { tech: '3.25', adult: '4.25', discount: '0.25', sameDay: '1.00' }));
ok(() => assert.deepEqual(checkPricesForm({ values: pricesToValues(settings), blocked: false }, settings).payload, { techCents: 300, adultCents: 400, cardExtraCents: 25, sameDayExtraCents: 100 }));
ok(() => assert.equal(checkPricesForm({ values: pricesToValues(settings), blocked: false }, settings).sameAsSaved, true));
ok(() => assert.deepEqual(settingsFromListed({ tech: 350, adult: 450, discount: 50, sameDay: 100 }), { techCents: 300, adultCents: 400, cardExtraCents: 50, sameDayExtraCents: 100 }));
ok(() => assert.equal(checkPricesForm({ values: { tech: '3.25', adult: '4.25', discount: '3.50', sameDay: '1.00' }, blocked: false }, settings).errors.discount, 'discountTooBig')); // a discount over a listed price is refused
ok(() => assert.equal(checkPricesForm({ values: { tech: '3.25', adult: '4.25', discount: '3.50', sameDay: '1.00' }, blocked: false }, settings).canSave, false));
ok(() => assert.equal(checkPricesForm({ values: { tech: '3.25', adult: '4.25', discount: '3.25', sameDay: '1.00' }, blocked: false }, settings).errors.discount, 'discountTooBig')); // equal to a listed price (a $0 cash price) is refused too
ok(() => assert.equal(checkPricesForm({ values: { tech: '3.25', adult: '4.25', discount: '0.00', sameDay: '1.00' }, blocked: false }, settings).canSave, true)); // no discount is fine

// ----- the chart and ranks -----
const chart = [
  { band: 'tiger', rankName: 'Little Tiger White', sort: 1, techBoards: 3, adultBoards: 0, technique: '' },
  { band: 'child', rankName: 'Green', sort: 1, techBoards: 3, adultBoards: 0, technique: '' },
  { band: 'teen', rankName: 'Green', sort: 1, techBoards: 0, adultBoards: 3, technique: '' },
  { band: 'black', rankName: '1st Dan', sort: 1, techBoards: 4, adultBoards: 3, technique: '' },
];
ok(() => assert.equal(bandFor('Little Tiger White', 15, chart), 'tiger'));
ok(() => assert.equal(bandFor('1st Dan', 9, chart), 'black'));
ok(() => assert.equal(bandFor('Green', 12, chart), 'child'));
ok(() => assert.equal(bandFor('Green', 13, chart), 'teen'));
ok(() => assert.deepEqual(recommendedBoards(chart, 'Green', 13), { band: 'teen', tech: 0, adult: 3, technique: '' }));
ok(() => assert.deepEqual(rankOptions(chart).map((r) => r.name), ['Little Tiger White', 'Green', '1st Dan']));
ok(() => assert.deepEqual(beltFor('High Green belt'), { beltPattern: 'stripe', beltColor: 'green', beltColor2: 'white' }));
ok(() => assert.deepEqual(beltFor('Little Tiger Yellow'), { beltPattern: 'stripe', beltColor: 'white', beltColor2: 'yellow' }));
ok(() => assert.deepEqual(beltFor('Red / Black'), { beltPattern: 'half', beltColor: 'red', beltColor2: 'black' }));
ok(() => assert.equal(paidState({ amountCents: 1200, overrideCents: null, payments: [], payingBy: 'card', hasLink: true }), 'awaiting'));
ok(() => assert.equal(paidState({ amountCents: 1200, overrideCents: 600, payments: [{ amountCents: 600 }], payingBy: 'cash', hasLink: false }), 'paid'));

// ----- the preview database -----
let store = null;
let clock = Date.parse('2026-11-12T15:00:00Z');
let counter = 0;
const brk = createBreakingBackend({
  loadStore: () => store, saveStore: (s) => { store = JSON.parse(JSON.stringify(s)); }, now: () => clock, today: () => '2026-11-12',
  newId: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
});
const admin = { signedIn: true, hasDataAccess: true, isAdmin: true, actorName: 'Admin', userId: 'a1' };
const staff = { ...admin, isAdmin: false, actorName: 'Staff', userId: 's1' };
const call = (name, args, ctx = admin) => brk.rpc(name, args, ctx).data;

const events = call('brk_events_list', { p_location_code: 'shrewsbury' }).events;
const nov = events.find((e) => e.registered === 10);
ok(() => assert.equal(nov.paid, 5));
const roster = call('brk_event_roster', { p_event_id: nov.id });
ok(() => assert.equal(roster.needs_look.length, 2));
ok(() => assert.equal(call('brk_event_roster', { p_event_id: nov.id }, staff).needs_look.length, 0)); // staff see none
ok(() => assert.equal(roster.registrations.reduce((t, r) => t + r.owed_cents, 0), 13475)); // $134.75 due ($138.75 before Zoe's sample price override of $9.00, which Finance's preview shows with a $4.00 refund)
ok(() => assert.equal(call('brk_save_settings', { p_expected_version: 1, p_tech_cents: 300, p_adult_cents: 400, p_card_extra_cents: 25, p_same_day_extra_cents: 100, p_child_max_age: 12 }, staff).status, 'not_allowed'));
ok(() => assert.equal(brk.rpc('brk_events_list', { p_location_code: 'both' }, { ...staff, hasDataAccess: false }).data.status, 'no_access'));
ok(() => assert.equal(brk.rpc('brk_public_event', { p_code: 'abcdefgh' }, admin).error.code, '42501')); // public functions: denied

// add student at the desk: priced by the database; a walk-in on the event day pays the event-day price
const cls = roster.event.classes[0].id;
const added = call('brk_add_student', { p_event_id: nov.id, p_first_name: 'Test', p_last_name: 'Kid', p_age: 9, p_rank_name: 'Green', p_class_id: cls, p_tech: 4, p_adult: 0, p_paying_by: 'card' }, staff);
ok(() => assert.equal(added.amount_cents, 1300)); // 4 × (300 + 25), not the event day yet
ok(() => assert.equal(call('brk_add_student', { p_event_id: nov.id, p_first_name: 'T', p_last_name: 'K', p_age: 9, p_rank_name: 'Nope', p_class_id: cls, p_tech: 1, p_adult: 0, p_paying_by: 'cash' }).field, 'rank_name'));
ok(() => assert.equal(call('brk_add_student', { p_event_id: nov.id, p_first_name: 'T', p_last_name: 'K', p_age: 9, p_rank_name: 'Green', p_class_id: cls, p_tech: 0, p_adult: 0, p_paying_by: 'cash' }).field, 'boards'));

// mark paid: stale version, then ok, then already_paid; staff undo only within 10 seconds and only their own
ok(() => assert.equal(call('brk_mark_paid', { p_registration_id: added.registration_id, p_expected_version: 99, p_school: 'shrewsbury', p_method: null }, staff).status, 'stale'));
const paid = call('brk_mark_paid', { p_registration_id: added.registration_id, p_expected_version: 1, p_school: 'shrewsbury', p_method: 'cash' }, staff);
ok(() => assert.equal(paid.amount_cents, 1300));
ok(() => assert.equal(paid.paying_by, 'cash')); // a different way also changes Paying by
ok(() => assert.equal(call('brk_mark_paid', { p_registration_id: added.registration_id, p_expected_version: paid.version, p_school: 'shrewsbury', p_method: null }, staff).status, 'already_paid'));
clock += 11000;
ok(() => assert.equal(call('brk_undo_payment', { p_payment_id: paid.payment_id }, staff).status, 'not_allowed')); // 11 s later
ok(() => assert.equal(call('brk_undo_payment', { p_payment_id: paid.payment_id }).status, 'ok')); // an admin may
const after = call('brk_event_roster', { p_event_id: nov.id }).registrations.find((r) => r.id === added.registration_id);
ok(() => assert.equal(after.paying_by, 'card')); // Undo puts Paying by back
ok(() => assert.equal(after.paid_cents, 0));

// edit: amount worked out again; a card link is cleared when Paying by leaves Card
const eli = roster.registrations.find((r) => r.first_name === 'Eli');
const edited = call('brk_edit_registration', { p_registration_id: eli.id, p_expected_version: eli.version, p_first_name: 'Eli', p_last_name: 'Park', p_age: 6, p_rank_name: 'Little Tiger Yellow', p_class_id: eli.class_id, p_tech: 3, p_adult: 0, p_paying_by: 'cash' }, staff);
ok(() => assert.deepEqual([edited.amount_cents, edited.link_cleared], [900, true]));

// delete rules: a student with a payment stays; an event with payments stays
const ava = roster.registrations.find((r) => r.first_name === 'Ava');
ok(() => assert.equal(call('brk_delete_registration', { p_registration_id: ava.id, p_expected_version: ava.version }).status, 'has_payments'));
ok(() => assert.equal(call('brk_delete_event', { p_event_id: nov.id, p_expected_version: 1 }).status, 'has_payments'));
// a removed class with students is refused
ok(() => assert.equal(call('brk_save_classes', { p_event_id: nov.id, p_expected_version: 1, p_classes: roster.event.classes.slice(1).map((c) => ({ id: c.id, name: c.name, start_time: c.start_time, end_time: c.end_time })) }).status, 'class_in_use'));
// the chart: needs one row per band; the settings version moves on
const chartNow = call('brk_settings_get', {});
ok(() => assert.equal(call('brk_save_chart', { p_expected_version: chartNow.settings.version, p_rows: [{ band: 'tiger', rank_name: 'X', sort: 1, technique: '', tech_boards: 1, adult_boards: 0 }] }).status, 'invalid'));
ok(() => assert.equal(call('brk_save_settings', { p_expected_version: chartNow.settings.version, p_tech_cents: 350, p_adult_cents: 400, p_card_extra_cents: 25, p_same_day_extra_cents: 100, p_child_max_age: 12 }).status, 'ok'));
ok(() => assert.equal(call('brk_save_settings', { p_expected_version: chartNow.settings.version, p_tech_cents: 350, p_adult_cents: 400, p_card_extra_cents: 25, p_same_day_extra_cents: 100, p_child_max_age: 12 }).status, 'stale'));
// history has no login ids
const history = call('brk_registration_history', { p_registration_id: added.registration_id }).rows;
ok(() => assert.ok(history.length >= 3 && history.every((r) => !JSON.stringify(r).includes('recorded_by"') && !('actor_id' in r))));

// ----- the final migration's rules (a fresh preview database each time) -----
function fresh() {
  let st = null;
  let n = 0;
  const b = createBreakingBackend({ loadStore: () => st, saveStore: (x) => { st = JSON.parse(JSON.stringify(x)); }, now: () => clock, today: () => '2026-11-12', newId: () => `00000000-0000-4000-8000-${String(900000 + (++n)).padStart(12, '0')}` });
  const run = (name, args, ctx = admin) => b.rpc(name, args, ctx).data;
  const ev = run('brk_events_list', { p_location_code: 'shrewsbury' }).events.find((e) => e.registered === 10);
  const ro = () => run('brk_event_roster', { p_event_id: ev.id });
  const person = (first) => ro().registrations.find((r) => r.first_name === first);
  return { b, run, ev, ro, person };
}
// the chart uses the migration's names, sorted from 0 (no " belt")
const f1 = fresh();
const seedChart = f1.run('brk_settings_get', {}).chart;
ok(() => assert.ok(seedChart.some((r) => r.band === 'child' && r.rank_name === 'Orange' && r.sort === 2)));
ok(() => assert.ok(seedChart.some((r) => r.band === 'child' && r.rank_name === 'Red / Black' && r.sort === 12)));
ok(() => assert.equal(seedChart.filter((r) => r.rank_name.endsWith(' belt')).length, 0));
ok(() => assert.equal(Math.min(...seedChart.filter((r) => r.band === 'black').map((r) => r.sort)), 0));
// Set override on a card student whose link is unpaid: the link goes (keyed on the order id and the OLD owed amount)
const eliA = f1.person('Eli');
ok(() => assert.equal(eliA.has_link, true));
const ov = f1.run('brk_set_override', { p_registration_id: eliA.id, p_expected_version: eliA.version, p_override_cents: 800 });
ok(() => assert.deepEqual([ov.status, ov.amount_cents, ov.link_cleared], ['ok', 800, true]));
ok(() => assert.equal(f1.person('Eli').has_link, false));
ok(() => assert.ok(f1.b.snapshot().cleared_links.some((c) => c.registration_id === eliA.id))); // brk_cleared_links remembers the order
const ov2 = f1.run('brk_set_override', { p_registration_id: eliA.id, p_expected_version: ov.version, p_override_cents: 700 });
ok(() => assert.equal(ov2.link_cleared, false)); // nothing left to clear
// Mark paid by Check clears the link and does NOT re-price (still the owed amount)
const f2 = fresh();
const eli2 = f2.person('Eli');
const mp = f2.run('brk_mark_paid', { p_registration_id: eli2.id, p_expected_version: eli2.version, p_school: 'shrewsbury', p_method: 'check' }, staff);
ok(() => assert.deepEqual([mp.amount_cents, mp.paying_by], [975, 'check']));
ok(() => assert.equal(f2.person('Eli').has_link, false));
// Edit student: the clearing tests the ORDER ID and the owed amounts, not the link address; same amount + still Card keeps the link
const f3 = fresh();
const eli3 = f3.person('Eli');
const same = f3.run('brk_edit_registration', { p_registration_id: eli3.id, p_expected_version: eli3.version, p_first_name: 'Eli', p_last_name: 'Park', p_age: 6, p_rank_name: 'Little Tiger Yellow', p_class_id: eli3.class_id, p_tech: 3, p_adult: 0, p_paying_by: 'card' }, staff);
ok(() => assert.equal(same.link_cleared, false));
const more = f3.run('brk_edit_registration', { p_registration_id: eli3.id, p_expected_version: same.version, p_first_name: 'Eli', p_last_name: 'Park', p_age: 6, p_rank_name: 'Little Tiger Yellow', p_class_id: eli3.class_id, p_tech: 4, p_adult: 0, p_paying_by: 'card' }, staff);
ok(() => assert.deepEqual([more.link_cleared, more.amount_cents], [true, 1300]));
// needs_look: a link_cleared row names the student (admins only); other rows have the names empty
f3.b.addNeedsLook();
const looks = f3.run('brk_event_roster', { p_event_id: f3.ev.id }).needs_look;
const cleared = looks.find((x) => x.outcome === 'link_cleared');
ok(() => assert.ok(cleared && cleared.first_name && cleared.last_name && cleared.registration_id));
ok(() => assert.ok(looks.filter((x) => x.outcome !== 'link_cleared').every((x) => x.first_name === null && x.registration_id === null)));
ok(() => assert.equal(f3.run('brk_event_roster', { p_event_id: f3.ev.id }, staff).needs_look.length, 0));
// the group a student's age selects decides which ranks exist for them (a deleted rank is refused, even if another group has it)
const f4 = fresh();
const chart4 = f4.run('brk_settings_get', {});
const withoutChildOrange = chart4.chart.filter((r) => !(r.band === 'child' && r.rank_name === 'Orange')).map(({ band, rank_name, sort, technique, tech_boards, adult_boards }) => ({ band, rank_name, sort, technique, tech_boards, adult_boards }));
ok(() => assert.equal(f4.run('brk_save_chart', { p_expected_version: chart4.settings.version, p_rows: withoutChildOrange }).status, 'ok'));
const cls4 = f4.ro().event.classes[0].id;
const add4 = (age) => f4.run('brk_add_student', { p_event_id: f4.ev.id, p_first_name: 'A', p_last_name: 'B', p_age: age, p_rank_name: 'Orange', p_class_id: cls4, p_tech: 1, p_adult: 0, p_paying_by: 'cash' }, staff);
ok(() => assert.deepEqual([add4(9).status, add4(9).field], ['invalid', 'rank_name'])); // child: Orange was deleted from the child group
ok(() => assert.equal(add4(14).status, 'ok')); // the teen group still has Orange
// chart rules: untidied names, a wrong key count and too few rows are refused
const goodRows = withoutChildOrange;
const v4 = f4.run('brk_settings_get', {}).settings.version;
ok(() => assert.equal(f4.run('brk_save_chart', { p_expected_version: v4, p_rows: goodRows.map((r, i) => (i === 0 ? { ...r, rank_name: ` ${r.rank_name}` } : r)) }).field, 'rows'));
ok(() => assert.equal(f4.run('brk_save_chart', { p_expected_version: v4, p_rows: goodRows.map((r, i) => (i === 0 ? { ...r, extra: 1 } : r)) }).field, 'rows'));
ok(() => assert.equal(f4.run('brk_save_chart', { p_expected_version: v4, p_rows: goodRows.slice(0, 3) }).field, 'rows'));
// the date window: Add event refuses a date more than a year back / two years ahead; Edit event only checks a CHANGED date
const f5 = fresh();
const newEvent = (date) => f5.run('brk_add_event', { p_name: 'X', p_location_code: 'shrewsbury', p_event_date: date });
ok(() => assert.deepEqual([newEvent('2025-01-01').status, newEvent('2025-01-01').field], ['invalid', 'event_date']));
ok(() => assert.equal(newEvent('2029-01-01').status, 'invalid'));
ok(() => assert.equal(newEvent('2027-01-01').status, 'ok'));
const old = f5.run('brk_events_list', { p_location_code: 'shrewsbury' }).events.find((e) => e.event_date < '2026-10-01');
const oldStore = JSON.parse(JSON.stringify(f5.b.snapshot()));
oldStore.events.find((e) => e.id === old.id).event_date = '2024-01-01'; // pretend a very old event exists
f5.b.snapshot(); // (read only) the next line saves through a second backend over the same data
let st6 = oldStore; let n6 = 0;
const b6 = createBreakingBackend({ loadStore: () => st6, saveStore: (x) => { st6 = x; }, now: () => clock, today: () => '2026-11-12', newId: () => `00000000-0000-4000-8000-${String(800000 + (++n6)).padStart(12, '0')}` });
const rename = b6.rpc('brk_update_event', { p_event_id: old.id, p_expected_version: old.version, p_name: 'Renamed', p_event_date: '2024-01-01', p_registration_open: false }, admin).data;
ok(() => assert.equal(rename.status, 'ok')); // an unchanged old date is not checked
ok(() => assert.equal(b6.rpc('brk_update_event', { p_event_id: old.id, p_expected_version: rename.version, p_name: 'Renamed', p_event_date: '2023-01-01', p_registration_open: false }, admin).data.field, 'event_date'));
// a payment's date can't be before the day the student was added; Undo refund on a non-refund is invalid
const f7 = fresh();
const gia = f7.person('Gia');
const pay = f7.ro().registrations.find((r) => r.id === gia.id).payments[0];
ok(() => assert.equal(f7.run('brk_edit_payment', { p_payment_id: pay.id, p_method: 'cash', p_amount_cents: 1000, p_paid_on: '2026-11-01', p_school: 'shrewsbury' }).field, 'date'));
ok(() => assert.equal(f7.run('brk_undo_refund', { p_payment_id: pay.id }).status, 'invalid'));

// ----- Delete a student or an event once its money nets to zero (migration 0053, contract CONTRACT-0053) -----
// A fresh preview database whose "closed Finance days" can be told which payment ids they counted (closedIds).
function freshDelete(closedFn = null) {
  let st = null;
  let n = 0;
  const closedIds = [];
  const b = createBreakingBackend({
    loadStore: () => st, saveStore: (x) => { st = JSON.parse(JSON.stringify(x)); }, now: () => clock, today: () => '2026-11-12',
    newId: () => `00000000-0000-4000-8000-${String(600000 + (++n)).padStart(12, '0')}`, closedPaymentIds: () => (closedFn ? closedFn() : closedIds),
  });
  const run = (name, args, ctx = admin) => b.rpc(name, args, ctx).data;
  const ev = run('brk_events_list', { p_location_code: 'shrewsbury' }).events.find((e) => e.registered === 10);
  const ro = () => run('brk_event_roster', { p_event_id: ev.id });
  const person = (first) => ro().registrations.find((r) => r.first_name === first);
  const del = (r) => run('brk_delete_registration', { p_registration_id: r.id, p_expected_version: r.version });
  const delEvent = () => run('brk_delete_event', { p_event_id: ev.id, p_expected_version: ev.version });
  // Undo whatever still stands for one student: a refund first (it blocks undoing the payment), then the payments.
  function settle(first) {
    const r = person(first);
    const reversed = new Set(r.payments.map((p) => p.reverses_payment_id).filter(Boolean));
    for (const p of r.payments.filter((x) => x.kind === 'refund' && !reversed.has(x.id))) assert.equal(run('brk_undo_refund', { p_payment_id: p.id }).status, 'ok');
    for (const p of person(first).payments.filter((x) => x.kind === 'payment' && !new Set(person(first).payments.map((y) => y.reverses_payment_id)).has(x.id))) assert.equal(run('brk_undo_payment', { p_payment_id: p.id }).status, 'ok');
  }
  return { b, run, ev, ro, person, del, delEvent, settle, closedIds, count: () => ({ regs: b.snapshot().registrations.length, pays: b.snapshot().payments.length, events: b.snapshot().events.length }) };
}
// a student whose money still stands: refused (has_payments); a student who never paid: deleted, as before
const d1 = freshDelete();
const ava1 = d1.person('Ava');
ok(() => assert.ok(ava1.payments.length > 0 && ava1.paid_cents > 0));
ok(() => assert.deepEqual(d1.del(ava1), { status: 'has_payments' }));
const before1 = d1.count();
const owen1 = d1.person('Owen'); // never paid
ok(() => assert.equal(owen1.payments.length, 0));
ok(() => assert.equal(d1.del(owen1).status, 'ok'));
ok(() => assert.deepEqual(d1.count(), { ...before1, regs: before1.regs - 1 }));
// after Undo the payments net to zero: staff may not delete, an admin may; the student, the payment rows AND the reversal rows go
ok(() => assert.equal(d1.del({ ...ava1, version: d1.person('Ava').version }).status, 'has_payments'));
d1.settle('Ava');
const avaZero = d1.person('Ava');
ok(() => assert.equal(avaZero.paid_cents, 0));
ok(() => assert.ok(avaZero.payments.length >= 2)); // the payment and its reversal are still rows
ok(() => assert.equal(d1.run('brk_delete_registration', { p_registration_id: avaZero.id, p_expected_version: avaZero.version }, staff).status, 'not_allowed'));
ok(() => assert.equal(d1.run('brk_delete_registration', { p_registration_id: avaZero.id, p_expected_version: avaZero.version - 1 }).status, 'stale'));
ok(() => assert.equal(d1.del(avaZero).status, 'ok'));
ok(() => assert.equal(d1.ro().registrations.some((r) => r.first_name === 'Ava'), false));
ok(() => assert.equal(d1.b.snapshot().payments.some((p) => avaZero.payments.some((q) => q.id === p.id)), false));
ok(() => assert.equal(d1.del(avaZero).status, 'not_found')); // already gone
// the change log keeps who deleted what: one delete line for the student and one for each payment row
const log1 = d1.b.snapshot().change_log.filter((r) => r.op === 'delete');
ok(() => assert.equal(log1.filter((r) => r.table_name === 'brk_registrations' && r.record_id === avaZero.id).length, 1));
ok(() => assert.equal(log1.filter((r) => r.table_name === 'brk_payments' && avaZero.payments.some((q) => q.id === r.record_id)).length, avaZero.payments.length));
// an edit chain that nets to zero: Edit payment (reversal + new payment) still stands; undo the new one and it is zero
const d2 = freshDelete();
const mia = d2.person('Mia');
const edit2 = d2.run('brk_edit_payment', { p_payment_id: mia.payments[0].id, p_method: 'cash', p_amount_cents: 1500, p_paid_on: '2026-11-12', p_school: 'shrewsbury' });
ok(() => assert.equal(edit2.status, 'ok'));
ok(() => assert.equal(d2.del(d2.person('Mia')).status, 'has_payments')); // the new payment stands
ok(() => assert.equal(d2.run('brk_undo_payment', { p_payment_id: edit2.payment_id }).status, 'ok'));
ok(() => assert.deepEqual([d2.person('Mia').paid_cents, d2.person('Mia').payments.length], [0, 4])); // payment, reversal, new payment, reversal
ok(() => assert.equal(d2.del(d2.person('Mia')).status, 'ok'));
// a refund that was undone, then the payment undone: zero, deletable (the refund blocks undoing the payment until it is undone)
const d3 = freshDelete();
const zoe = d3.person('Zoe');
ok(() => assert.ok(zoe.payments.some((p) => p.kind === 'refund')));
ok(() => assert.equal(d3.del(zoe).status, 'has_payments'));
d3.settle('Zoe');
ok(() => assert.equal(d3.person('Zoe').paid_cents, 0));
ok(() => assert.equal(d3.del(d3.person('Zoe')).status, 'ok'));
// a Square payment (no staff login) that was undone can be deleted too
const d4 = freshDelete();
const cara = d4.person('Cara');
ok(() => assert.ok(cara.payments.length > 0 && d4.b.snapshot().payments.find((p) => p.id === cara.payments[0].id).recorded_by === null));
d4.settle('Cara');
ok(() => assert.equal(d4.del(d4.person('Cara')).status, 'ok'));
// a closed Finance day counted a payment: refused even though the money nets to zero, nothing deleted, and it works again when no closing names it
const d5 = freshDelete();
const giaPaid = d5.person('Gia');
d5.settle('Gia');
d5.closedIds.push(giaPaid.payments[0].id);
const before5 = d5.count();
ok(() => assert.deepEqual(d5.del(d5.person('Gia')), { status: 'closed_day' }));
ok(() => assert.deepEqual(d5.count(), before5));
ok(() => assert.equal(d5.delEvent().status, 'has_payments')); // the whole event: the other payers' money still stands, which is checked first
ok(() => assert.deepEqual(d5.count(), before5));
d5.closedIds.length = 0;
ok(() => assert.equal(d5.del(d5.person('Gia')).status, 'ok'));
// money standing is checked BEFORE a closed day: both true gives has_payments
const d6 = freshDelete();
d6.closedIds.push(d6.person('Ava').payments[0].id);
ok(() => assert.equal(d6.del(d6.person('Ava')).status, 'has_payments'));
// the whole event: all or nothing. One student whose money stands keeps everything; once all are zero the event and every row of it goes
const d7 = freshDelete();
const others = d7.b.snapshot().registrations.filter((r) => r.event_id !== d7.ev.id).length;
const classesBefore = d7.b.snapshot().classes.length;
const before7 = d7.count();
ok(() => assert.equal(d7.delEvent().status, 'has_payments'));
ok(() => assert.deepEqual(d7.count(), before7)); // nothing at all deleted
const payers = d7.ro().registrations.filter((r) => r.paid_cents !== 0).map((r) => r.first_name);
ok(() => assert.ok(payers.length >= 3));
for (const first of payers.slice(0, -1)) d7.settle(first); // every payer but the last: that one's money still stands
ok(() => assert.equal(d7.delEvent().status, 'has_payments'));
ok(() => assert.equal(d7.count().regs, before7.regs)); // still nothing deleted: all or nothing
d7.settle(payers[payers.length - 1]);
ok(() => assert.equal(d7.run('brk_delete_event', { p_event_id: d7.ev.id, p_expected_version: d7.ev.version }, staff).status, 'not_allowed'));
ok(() => assert.equal(d7.delEvent().status, 'ok'));
ok(() => assert.equal(d7.b.snapshot().events.some((e) => e.id === d7.ev.id), false));
ok(() => assert.equal(d7.b.snapshot().registrations.some((r) => r.event_id === d7.ev.id), false));
ok(() => assert.equal(d7.b.snapshot().classes.some((c) => c.event_id === d7.ev.id), false));
ok(() => assert.equal(d7.b.snapshot().registrations.length, others)); // the other events' students are untouched
ok(() => assert.equal(d7.b.snapshot().classes.length, classesBefore - 5)); // only this event's five classes went
ok(() => assert.equal(d7.run('brk_event_roster', { p_event_id: d7.ev.id }).status, 'not_found'));

// the whole event when every student nets to zero but a closed Finance day counted a payment: refused, nothing deleted; fine once no closing names it
const d8 = freshDelete();
for (const first of d8.ro().registrations.filter((r) => r.paid_cents !== 0).map((r) => r.first_name)) d8.settle(first);
d8.closedIds.push(d8.person('Ava').payments[0].id);
const before8 = d8.count();
ok(() => assert.deepEqual(d8.delEvent(), { status: 'closed_day' }));
ok(() => assert.deepEqual(d8.count(), before8));
d8.closedIds.length = 0;
ok(() => assert.equal(d8.delEvent().status, 'ok'));
// A closing counts only while it stands (the real rule: an Undo close or Reopen day ends it; closing again counts again). The fake Finance
// keeps closings (the ending row has reverses_closing_id) and closing_items (closing_id, source, chain_id / row_id).
{
  // One fresh preview database per question, each with its own fake Finance store.
  const scenario = (first = 'Gia') => {
    const fin = { closings: [], closing_items: [] };
    const d = freshDelete(() => closedPaymentIdsFromFinance(fin));
    d.settle(first);
    const rows = d.person(first).payments.map((p) => p.id); // the payment and its reversal
    const close = (id, source = 'board_breaking') => {
      fin.closings.push({ id, kind: 'close', reverses_closing_id: null });
      fin.closing_items.push({ id: `item-${id}`, closing_id: id, source, chain_id: rows[0], row_id: rows[1] });
    };
    const end = (id, ends, kind) => fin.closings.push({ id, kind, reverses_closing_id: ends }); // 'undo' or 'reopen' row
    const del = () => d.run('brk_delete_registration', { p_registration_id: d.person(first).id, p_expected_version: d.person(first).version });
    return { fin, d, close, end, del };
  };
  ok(() => assert.deepEqual(closedPaymentIdsFromFinance(null), [])); // no Finance store: nothing is closed
  ok(() => assert.deepEqual(closedPaymentIdsFromFinance({ closings: 5, closing_items: 'x' }), [])); // damaged: nothing is closed
  // a day was closed and counted the payment: refused, and it stays refused
  const s1 = scenario();
  s1.close('c1');
  ok(() => assert.deepEqual(s1.del(), { status: 'closed_day' }));
  // another source's item with the same ids never blocks
  const s2 = scenario();
  s2.close('c1', 'star');
  ok(() => assert.equal(s2.del().status, 'ok'));
  // the closing was undone: its items stay in Finance's table but no longer block
  const s3 = scenario();
  s3.close('c1');
  s3.end('u1', 'c1', 'undo');
  ok(() => assert.deepEqual(closedPaymentIdsFromFinance(s3.fin), []));
  ok(() => assert.equal(s3.del().status, 'ok'));
  // the day was reopened: the same
  const s4 = scenario();
  s4.close('c1');
  s4.end('r1', 'c1', 'reopen');
  ok(() => assert.equal(s4.del().status, 'ok'));
  // the day was closed again after the undo: a new closing with new items counts again
  const s5 = scenario();
  s5.close('c1');
  s5.end('u1', 'c1', 'undo');
  s5.close('c2');
  ok(() => assert.deepEqual(s5.del(), { status: 'closed_day' }));
  s5.end('r2', 'c2', 'reopen'); // ... and reopened once more
  ok(() => assert.equal(s5.del().status, 'ok'));
  // a whole event: every student nets to zero; one standing closing → closed_day, nothing deleted; once it is ended → deleted
  const s6 = scenario('Mia');
  for (const first of s6.d.ro().registrations.filter((r) => r.paid_cents !== 0).map((r) => r.first_name)) s6.d.settle(first);
  s6.close('c9');
  const before6 = s6.d.count();
  ok(() => assert.deepEqual(s6.d.delEvent(), { status: 'closed_day' }));
  ok(() => assert.deepEqual(s6.d.count(), before6));
  s6.end('u9', 'c9', 'undo');
  ok(() => assert.equal(s6.d.delEvent().status, 'ok'));
}
// the closed-day sentences say nothing about reopening being useless (the rule lets a reopened or undone day go)
ok(() => assert.equal(/reopen|does not free|never/i.test(`${dialogText.deleteClosedDay('A B')} ${eventText.DELETE_CLOSED_DAY}`), false));
{
  const student = readFileSync(new URL('../../screens/breaking/dialogs/DeleteStudentConfirm.jsx', import.meta.url), 'utf8');
  const eventsTab = readFileSync(new URL('../../screens/breaking/EventsTab.jsx', import.meta.url), 'utf8');
  ok(() => assert.equal(/Reopen day does not/i.test(student + eventsTab), false));
}
// the words (plain, straight apostrophes, no "Undo the payment first", no "money is never removed")
ok(() => assert.equal(dialogText.deleteHasPayments('Ava Reed'), 'Ava Reed has payments that still count. Undo or refund them first, then delete the student.'));
ok(() => assert.equal(dialogText.deleteClosedDay('Ava Reed'), "Ava Reed's payments were counted when a day was closed in Finance, so the student can't be deleted. Leave the student on the roster."));
ok(() => assert.equal(dialogText.deleteBody('Ava Reed'), "This removes Ava Reed from the roster. This can't be undone."));
ok(() => assert.equal(dialogText.deleteBody('Ava Reed', true), "This removes Ava Reed from the roster, together with their payment history. This can't be undone."));
ok(() => assert.equal(eventText.DELETE_HAS_PAYMENTS, 'Some students on this event still have payments that count. Undo or refund them first, then delete the event.'));
ok(() => assert.equal(eventText.DELETE_CLOSED_DAY, "Money on this event was counted when a day was closed in Finance, so the event can't be deleted."));
ok(() => assert.equal(eventText.deleteEventBody(0, 0), "Nothing is registered yet. This can't be undone."));
ok(() => assert.equal(eventText.deleteEventBody(1, 0), "Its 1 registered student is deleted with it, along with any payment history. This can't be undone."));
ok(() => assert.equal(eventText.deleteEventBody(10, 5), "Its 10 registered students are deleted with it, together with their payment history. This can't be undone."));
ok(() => assert.equal(dialogText.SQUARE_NOT_REFUNDED, 'A card payment taken through Square is not refunded by this. Refund it in Square first.'));
ok(() => assert.equal(eventText.DELETE_SQUARE_NOT_REFUNDED, 'Deleting does not refund card payments taken through Square. Refund those in Square first.'));
ok(() => assert.equal(/Square/.test(dialogText.deleteBody('A B', true)) || /Square/.test(eventText.deleteEventBody(3, 1)), false)); // the Square line is a separate quiet line, not part of the sentence
// the student box shows the Square line only for a payment recorded by "Square" (the roster's own data)
{
  const rosterNow = freshDelete().ro().registrations.map((r) => ({ name: r.first_name, payments: r.payments.map((p) => ({ recordedByName: p.recorded_by_name })) }));
  ok(() => assert.equal(hasSquarePayment(rosterNow.find((r) => r.name === 'Cara').payments), true)); // Cara paid by card through Square
  ok(() => assert.equal(hasSquarePayment(rosterNow.find((r) => r.name === 'Gia').payments), false)); // Gia paid cash at the desk
  ok(() => assert.equal(hasSquarePayment(rosterNow.find((r) => r.name === 'Owen').payments), false)); // never paid
  ok(() => assert.equal(hasSquarePayment(undefined), false));
  ok(() => assert.equal(hasSquarePayment([{ recordedByName: 'Square' }, { recordedByName: 'Square' }]), true)); // an undone Square payment (payment + reversal) still shows it
}
// the screens pass the line as the box's quiet hint, never as the amber failure
{
  const student = readFileSync(new URL('../../screens/breaking/dialogs/DeleteStudentConfirm.jsx', import.meta.url), 'utf8');
  const eventsTab = readFileSync(new URL('../../screens/breaking/EventsTab.jsx', import.meta.url), 'utf8');
  ok(() => assert.ok(/hint=\{hasSquarePayment\(registration\.payments\) \? T\.SQUARE_NOT_REFUNDED : null\}/.test(student)));
  ok(() => assert.ok(/hint=\{dialog\.registered > 0 \? T\.DELETE_SQUARE_NOT_REFUNDED : null\}/.test(eventsTab))); // shown whenever the event has students
}
ok(() => assert.equal(eventText.DELETE_BLOCKED_BODY, undefined)); // the old "Close registration instead" block is gone
{
  const all = [dialogText.deleteHasPayments('A B'), dialogText.deleteClosedDay('A B'), eventText.DELETE_HAS_PAYMENTS, eventText.DELETE_CLOSED_DAY, eventText.deleteEventBody(3, 1)].join(' ');
  ok(() => assert.equal(/Undo the payment first|never removed|surcharge|’/.test(all), false));
}

// ----- Add event's starting class list (EventsTab.jsx follows this rule; the database copy is what saveAdd relies on) -----
ok(() => assert.deepEqual(STARTER_CLASSES.map((c) => [c.name, c.startTime, c.endTime]), [
  ['Group D', '16:20', '17:00'], ['White / Little Tiger', '17:10', '17:50'], ['Group A', '18:00', '18:40'], ['Group B+C', '18:50', '19:30'], ['Teen / Adult', '19:40', '20:20'],
]));
ok(() => assert.deepEqual(startingClasses([]), STARTER_CLASSES)); // no earlier event: the starter list
ok(() => assert.deepEqual(startingClasses(null), STARTER_CLASSES));
ok(() => assert.deepEqual(startingClasses(undefined), STARTER_CLASSES)); // no copy at all
ok(() => assert.deepEqual(startingClasses([]), STARTER_CLASSES)); // an earlier event with ZERO classes falls back to the starter list
ok(() => assert.deepEqual(startingClasses([{ id: 'x', name: 'Only', startTime: '10:00', endTime: '10:40' }]), [{ name: 'Only', startTime: '10:00', endTime: '10:40' }])); // an earlier event: its classes, in its order
// What saveAdd does with the database: add the event (classesFrom = the copy's id, or none), then save the dialog's list when it
// differs. A class is never duplicated: the saved list is exactly what the dialog showed.
const classNamesOf = (f, id) => f.run('brk_event_roster', { p_event_id: id }).event.classes.map((c) => [c.name, c.start_time, c.end_time]);
const f8 = fresh();
const latest = f8.run('brk_events_list', { p_location_code: 'shrewsbury' }).events.sort((a, b) => (a.event_date < b.event_date ? 1 : -1))[0];
const copied = classNamesOf(f8, latest.id);
const addCopy = f8.run('brk_add_event', { p_name: 'Copy me', p_location_code: 'shrewsbury', p_event_date: '2027-01-15', p_copy_classes_from: latest.id });
ok(() => assert.deepEqual(classNamesOf(f8, addCopy.event_id), copied)); // copied once, in order, no duplicates
const trimmedList = copied.slice(0, 3).map(([name, start_time, end_time]) => ({ name, start_time, end_time })); // the admin removed two rows
const v8 = f8.run('brk_event_roster', { p_event_id: addCopy.event_id }).event.version;
ok(() => assert.equal(f8.run('brk_save_classes', { p_event_id: addCopy.event_id, p_expected_version: v8, p_classes: trimmedList }).status, 'ok'));
ok(() => assert.deepEqual(classNamesOf(f8, addCopy.event_id), copied.slice(0, 3))); // exactly what the dialog showed
// a school with no event at all: nothing is copied, then the starter list is saved once
const f9 = fresh();
const store9 = JSON.parse(JSON.stringify(f9.b.snapshot()));
store9.events = store9.events.filter((e) => e.location_code !== 'worcester'); // (Worcester has no event)
const b9 = createBreakingBackend({ loadStore: () => store9, saveStore: (x) => Object.assign(store9, x), now: () => clock, today: () => '2026-11-12', newId: () => `00000000-0000-4000-8000-${String(700000 + store9.events.length + store9.classes.length + store9.registrations.length + Math.floor(Math.random() * 1e5)).padStart(12, '0')}` });
const addStarter = b9.rpc('brk_add_event', { p_name: 'First', p_location_code: 'worcester', p_event_date: '2027-01-15' }, admin).data;
const rosterOf = (id) => b9.rpc('brk_event_roster', { p_event_id: id }, admin).data;
ok(() => assert.equal(rosterOf(addStarter.event_id).event.classes.length, 0)); // the database copies nothing when there is no earlier event
const saveStarter = b9.rpc('brk_save_classes', { p_event_id: addStarter.event_id, p_expected_version: rosterOf(addStarter.event_id).event.version,
  p_classes: STARTER_CLASSES.map((c) => ({ name: c.name, start_time: c.startTime, end_time: c.endTime })) }, admin).data;
ok(() => assert.equal(saveStarter.status, 'ok'));
ok(() => assert.deepEqual(rosterOf(addStarter.event_id).event.classes.map((c) => [c.name, c.start_time, c.end_time]), STARTER_CLASSES.map((c) => [c.name, c.startTime, c.endTime])));

// ----- Black Belt ranks: a SOLID black belt with gold end stripes = the Dan; stars never change the picture; Bo-Dan / Deputy unchanged -----
const GOLD = (n) => ({ beltPattern: 'solid', beltColor: 'black', beltEndStripes: n, beltEndStripeColor: 'yellow' });
ok(() => assert.deepEqual(beltFor('1st Dan'), GOLD(1)));
ok(() => assert.deepEqual(beltFor('2nd Dan'), GOLD(2)));
ok(() => assert.deepEqual(beltFor('3rd Dan'), GOLD(3)));
for (const row of seedChart.filter((r) => r.band === 'black')) {
  const dan = Number(row.rank_name[0]); // "2nd Dan 3 Star" -> 2
  ok(() => assert.deepEqual(beltFor(row.rank_name), GOLD(dan))); // every Black Belt rank, stars ignored
  ok(() => assert.deepEqual(beltFor(row.rank_name, { danStripe: true }), GOLD(dan))); // the old option changes nothing any more
  ok(() => assert.equal(beltFor(row.rank_name).beltColor2, undefined)); // no white middle stripe: it can't look like Bo-Dan
}
ok(() => assert.deepEqual(beltFor('1st Dan – 4 Star'), GOLD(1))); // a dash before the stars (the family page's label) reads the same
ok(() => assert.deepEqual(beltFor('Bo-Dan / Deputy'), { beltPattern: 'stripe', beltColor: 'black', beltColor2: 'white' }));

// ----- Board totals: the two count cards and the class's second line (rosterRules.js) -----
const reg = (classId, techBoards, adultBoards, extra = {}) => ({ classId, techBoards, adultBoards, ...extra });
const sample = [reg('A', 3, 0, { broke: true }), reg('A', 0, 3), reg('A', 1, 3), reg('A', 2, 3, { broke: true }), reg('A', 4, 3), reg('A', 4, 0), reg('D', 4, 0), reg('D', 3, 0)];
ok(() => assert.deepEqual(classBoardTotals(sample, 'A'), { tech: 14, adult: 12 })); // the picture's Group A: 14 Technical, 12 Adult (paid or not, broke or not)
ok(() => assert.deepEqual(classBoardTotals(sample, 'D'), { tech: 7, adult: 0 }));
ok(() => assert.deepEqual(eventBoardTotals(sample), { tech: 21, adult: 12 })); // the whole event = every class
ok(() => assert.deepEqual(classBoardTotals(sample, 'Z'), { tech: 0, adult: 0 })); // a class with nobody
ok(() => assert.deepEqual(boardTotals([]), { tech: 0, adult: 0 })); // no students at all
ok(() => assert.deepEqual(boardTotals(null), { tech: 0, adult: 0 }));
ok(() => assert.deepEqual(boardTotals([reg('A', 0, 0)]), { tech: 0, adult: 0 })); // zero boards
// a student moved from class D to class A changes both classes' totals and leaves the event's the same
const moved = sample.map((r, i) => (i === 6 ? { ...r, classId: 'A' } : r));
ok(() => assert.deepEqual(classBoardTotals(moved, 'A'), { tech: 18, adult: 12 }));
ok(() => assert.deepEqual(classBoardTotals(moved, 'D'), { tech: 3, adult: 0 }));
ok(() => assert.deepEqual(eventBoardTotals(moved), eventBoardTotals(sample)));
// a deleted student is not on the roster: leaving them out lowers the totals
ok(() => assert.deepEqual(eventBoardTotals(sample.slice(1)), { tech: 18, adult: 12 }));
// the same totals come out of the preview database's own roster (an event is one school; the roster knows nothing of the school switcher)
{
  const fx = fresh();
  const rows = fx.ro().registrations.map((r) => ({ classId: r.class_id, techBoards: r.tech_boards, adultBoards: r.adult_boards }));
  ok(() => assert.deepEqual(eventBoardTotals(rows), { tech: 31, adult: 10 }));
  ok(() => assert.equal(rows.length, 10));
}

// ----- Contrast of the new board cells (WCAG: text needs 4.5:1 against its background) -----
// Reads the real colors from tokens.css and breaking-roster.css, so a changed token or a changed gray fails here.
{
  const tokens = readFileSync(new URL('../../styles/tokens.css', import.meta.url), 'utf8');
  const roster = readFileSync(new URL('../../styles/breaking-roster.css', import.meta.url), 'utf8');
  const hex = (name, text = tokens) => new RegExp(name + ': *(#[0-9a-fA-F]{6})').exec(text)[1];
  const channel = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const luminance = (h) => 0.2126 * channel(parseInt(h.slice(1, 3), 16)) + 0.7152 * channel(parseInt(h.slice(3, 5), 16)) + 0.0722 * channel(parseInt(h.slice(5, 7), 16));
  const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const tint = hex('--color-blue-tint');
  const surface = hex('--color-surface');
  const border = hex('--color-border');
  const text = hex('--color-text');
  const secondary = hex('--color-text-secondary');
  const quietOnTint = hex('--brk-quiet-on-tint', roster);
  const pairs = [
    ['number (dark) on the Technical tint', text, tint], ['number (dark) on the Adult surface', text, surface],
    ['quiet gray (zero, broke) on the Technical tint', quietOnTint, tint], ['quiet gray (zero, broke) on the Adult surface', secondary, surface],
    ['header on the Technical tint', text, tint], ['header on the Adult header gray', text, border],
    ['chip label on the tint', text, tint], ['chip label on the surface', text, surface],
    ['Technical card label and note on the tint', text, tint], ['Adult card label on the surface', secondary, surface],
  ];
  for (const [what, fg, bg] of pairs) ok(() => assert.ok(contrast(fg, bg) >= 4.5, `${what}: ${contrast(fg, bg).toFixed(2)}:1`));
  // the quiet gray is a different color from the token only where the token fails on the tint
  ok(() => assert.ok(contrast(secondary, tint) < 4.5 && contrast(quietOnTint, tint) >= 4.5));
}

console.log(`ALL BOARD BREAKING CHECKS PASSED (${checks} checks)`);
