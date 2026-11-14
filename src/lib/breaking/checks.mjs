// checks.mjs — plain-Node checks for Board breaking's shared rules and its preview database (run: node src/lib/breaking/checks.mjs).
// Why it exists: the screens' live "Amount" line (breakingRules.js) and the fake database (mockBreaking.js) must
// work out the same number as the real database will, and the staff / admin / stale / undo rules must hold. These checks
// pin the examples from the approved pictures ($12, $16, $9.75, $138.75) and the main rules of SIGNATURES-0051.
import assert from 'node:assert/strict';
import { priceCents, priceLine, bandFor, recommendedBoards, rankOptions, beltFor, paidState } from './breakingRules.js';
import { createBreakingBackend } from '../mockBreaking.js';
import { STARTER_CLASSES, startingClasses } from './starterClasses.js';
import { exampleLine } from './text/chart.js';
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

console.log(`ALL BOARD BREAKING CHECKS PASSED (${checks} checks)`);
