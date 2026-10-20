// api.js — every call the Black Belt staff screens make to the database (phase B1).
// Why it exists: like src/lib/testing/eventsApi.js does for Color Belt, this keeps table names,
// column lists and the exact argument names of the database functions (migration 0016, contract
// 0016-B1 §1) in ONE place. Screens call friendly camelCase functions with one object argument
// and always get back a plain object with a `status` CODE (never words — the screens' text.js
// turns codes into words):
//   'ok' (plus the result fields) · 'no_access' · 'not_allowed' · 'not_found' · 'stale' ·
//   'duplicate_name' · 'invalid' · 'part_without_day' (+ parts) · 'waiver_needed' · 'finished' ·
//   'has_payments' · 'has_waivers' · 'confirm_needed' (+ removeCount) ·
//   'error' (no connection / unexpected answer — { status:'error', error })
// These functions NEVER throw.
//
// Real mode: supabase.rpc(name, args) with 0016's exact argument names (p_…). bb_cycles_list
// runs the purge (it writes), so it is a normal POST — never rpc(…, {}, { get: true }). Table reads
// name their columns (the database refuses select('*') and never gives the app the date of birth,
// the email, the signature or any login id).
// Preview mode: the same calls reach the preview database (mockBlackBelt.js) through mockClient.js;
// this file has no preview branch of its own except schoolToday() (the pretend date).
//
// Money is whole cents (87000 = $870). Dates are 'YYYY-MM-DD' school dates; times 'HH:MM' (the
// database sends '12:30:00' from tables — cut to 5 here).
// The shapes returned (CycleState, CycleSummary, CycleDetail, Day, Plan, CycleForm, Waiver) are
// described in contract 0016-B1 §1.3.
import { supabase, isPreview } from '../supabase.js';
import { readStorage } from '../storage.js';
import { todayInSchoolTime, isIsoDate, shortTime, PREVIEW_TODAY_KEY } from '../testing/eventRules.js';
import { cycleState, nextWaiverVersionName, buildAddPayload, buildUpdatePayload, PARTS, DANS } from './rules.js';

// Every status a call here can return.
export const BB_STATUSES = [
  'ok', 'no_access', 'not_allowed', 'not_found', 'stale', 'duplicate_name', 'invalid', 'part_without_day', 'waiver_needed',
  'finished', 'has_payments', 'has_waivers', 'confirm_needed', 'error',
];
const SERVER_STATUSES = new Set(BB_STATUSES.filter((s) => s !== 'error'));

// The columns we read — only the ones contract 0016 §4.1 grants (never '*').
const CYCLE_COLUMNS = 'id, name, application_due, submissions_due, auto_close, registration_open, first_opened_at, public_code_worcester, public_code_shrewsbury, prices_from, version, created_at, updated_at, created_by_name, updated_by_name';
const DAY_COLUMNS = 'id, cycle_id, name, day_date, start_time, end_time, place_code, place_other, second_start, second_end, second_place_code, second_place_other, version, created_at, updated_at, created_by_name, updated_by_name';
const PART_COLUMNS = 'id, day_id, part';
const PLAN_COLUMNS = 'id, cycle_id, name, payments_count, position, created_at, created_by_name';
const AMOUNT_COLUMNS = 'id, cycle_plan_id, dan, payment_no, amount_cents';
const FEE_COLUMNS = 'id, cycle_id, dan, amount_cents';
const PLAN_PAYMENT_COLUMNS = 'id, cycle_plan_id, payment_no, due_on, follows_application_due, version, updated_at, updated_by_name';
const CANDIDATE_COUNT_COLUMNS = 'id, status'; // only to count candidates (no names on these screens)
const SETTINGS_COLUMNS = 'id, keep_years_after_last_day, keep_years_after_18, version, created_at, updated_at, created_by_name, updated_by_name';
const WAIVER_COLUMNS = 'id, version_name, body, is_placeholder, superseded_at, created_at, created_by_name';
// How many ids go into one "id is one of these" filter (they travel in the web address).
const IN_CHUNK = 80;

const failure = (error) => ({ status: 'error', error });
const unexpected = (what) => failure(new Error(`Unexpected answer from ${what}`));
const isText = (v) => typeof v === 'string' && v.length > 0;
const isInt = (v) => Number.isInteger(v);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// "Today" at the school. In preview mode __tkdPreview.setToday('YYYY-MM-DD') can pretend another
// date (the preview database uses the same pretend date). That branch is dropped from the real
// build, because Vite replaces isPreview with false there.
export function schoolToday() {
  if (isPreview) {
    const pretend = readStorage(PREVIEW_TODAY_KEY);
    if (isIsoDate(pretend)) return pretend;
  }
  return todayInSchoolTime(new Date());
}

// ----- Converting database answers to app objects -----

// bb_cycle_state's object (snake_case) → CycleState. null if it isn't one.
function toState(s) {
  if (!s || typeof s !== 'object' || typeof s.state !== 'string') return null;
  return {
    state: s.state,
    registration: s.registration ?? null,
    past: s.past === true,
    testingToday: s.testing_today === true,
    firstDay: s.first_day ?? null,
    lastDay: s.last_day ?? null,
    nextDay: s.next_day ?? null,
    publicStatus: s.public_status ?? null,
    closedOn: s.closed_on ?? null,
  };
}

// A bb_cycles_list row → CycleSummary.
function toSummary(row) {
  const state = toState(row?.state);
  if (!state || !isText(row.id) || !isInt(row.version)) return null;
  return {
    id: row.id,
    name: row.name,
    state,
    firstDay: row.first_day ?? null,
    lastDay: row.last_day ?? null,
    nextDay: row.next_day ?? null,
    dayCount: row.day_count ?? 0,
    applicationDue: row.application_due,
    registrationOpen: row.registration_open === true,
    autoClose: row.auto_close === true,
    candidateCount: row.candidate_count ?? 0, // active candidates, both schools
    hasPayments: row.has_payments === true,
    hasFormWaivers: row.has_form_waivers === true,
    version: row.version,
  };
}

// A stored place → { code } (a school) or { other } (other text).
const toPlace = (code, other) => (code ? { code } : { other: other ?? '' });

// A bb_cycle_days row + its parts → Day.
function toDay(row, parts) {
  return {
    id: row.id,
    name: row.name,
    date: row.day_date,
    start: shortTime(row.start_time),
    end: shortTime(row.end_time),
    place: toPlace(row.place_code, row.place_other),
    second: row.second_start
      ? { start: shortTime(row.second_start), end: shortTime(row.second_end), place: toPlace(row.second_place_code, row.second_place_other) }
      : null,
    parts: PARTS.filter((p) => parts.includes(p)), // always physical, technical, curriculum order
    version: row.version,
  };
}

// A bb_waiver_versions row → Waiver.
function toWaiver(row) {
  return {
    id: row.id,
    versionName: row.version_name,
    body: row.body,
    isPlaceholder: row.is_placeholder === true,
    supersededAt: row.superseded_at ?? null,
    createdAt: row.created_at,
    createdByName: row.created_by_name,
  };
}

// The database's { "1": c, "2": c … } → { 1: c, 2: c, 3: c, 4: c }.
const danMap = (source, read) => Object.fromEntries(DANS.map((dan) => [dan, read(source?.[String(dan)] ?? source?.[dan])]));

// A bb_cycle_defaults payload → the CycleForm Add cycle starts from (the name stays empty: the
// admin types this season's name).
function payloadToForm(p) {
  const place = (x) => (x && typeof x.code === 'string' ? { code: x.code } : { other: x?.other ?? '' });
  return {
    name: '',
    applicationDue: p.application_due ?? null,
    submissionsDue: p.submissions_due ?? null,
    autoClose: p.auto_close !== false,
    registrationOpen: false, // Add cycle starts Closed
    days: (p.days ?? []).map((d) => ({
      id: null,
      name: d.name,
      date: d.day_date,
      start: shortTime(d.start_time),
      end: shortTime(d.end_time),
      place: place(d.place),
      second: d.second ? { start: shortTime(d.second.start), end: shortTime(d.second.end), place: place(d.second.place) } : null,
      parts: PARTS.filter((x) => (d.parts ?? []).includes(x)),
      version: null,
    })),
    plans: (p.plans ?? []).map((plan, i) => ({
      key: `plan-${i + 1}`,
      id: null,
      name: plan.name,
      payments: (plan.payments ?? []).map((x, j) => ({ paymentNo: j + 1, dueOn: x.due_on, followsApplicationDue: x.follows_application_due === true })),
      amounts: danMap(plan.amounts, (list) => (Array.isArray(list) ? [...list] : [])),
    })),
    kukkiwon: danMap(p.kukkiwon, (c) => (isInt(c) ? c : null)),
    pricesFrom: p.prices_from ?? null,
  };
}

// ----- Reading -----

// The has_data_access check that goes with every table read: a locked sign-in gets EMPTY lists
// from the database (row-level security), which must not look like "No cycles yet".
async function accessCheck() {
  const res = await supabase.rpc('has_data_access');
  if (res?.error) return failure(res.error);
  if (res?.data === false) return { status: 'no_access' };
  if (res?.data !== true) return unexpected('has_data_access');
  return null; // fine
}

// Reads rows whose `column` is one of `ids`, a few dozen ids per request.
async function selectIn(table, columns, column, ids) {
  const rows = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error } = await supabase.from(table).select(columns).in(column, ids.slice(i, i + IN_CHUNK));
    if (error) return { error };
    if (!Array.isArray(data)) return { error: new Error(`Unexpected answer from ${table}`) };
    rows.push(...data);
  }
  return { rows };
}

// Calls one database function and turns its answer into { status, … }. readOk(data) checks the
// ok answer and converts it to camelCase; null = wrong shape → 'error' rather than a guess.
// readOther(status, data) adds the extra field some refusals carry (part_without_day → parts).
async function callRpc(name, args, readOk, readOther = null) {
  try {
    if (!supabase) return failure(new Error('No connection is set up'));
    const { data, error } = await supabase.rpc(name, args); // a normal POST (never { get: true })
    if (error) return failure(error);
    const status = data?.status;
    if (typeof status !== 'string' || !SERVER_STATUSES.has(status)) return unexpected(name);
    if (status === 'part_without_day') {
      const parts = Array.isArray(data.parts) ? data.parts.filter((p) => PARTS.includes(p)) : [];
      return { status, parts };
    }
    if (status !== 'ok') {
      const extra = readOther ? readOther(status, data) : null;
      if (extra === undefined) return unexpected(name); // a refusal with a missing extra field
      return { status, ...(extra ?? {}) };
    }
    const result = readOk(data);
    return result ? { status: 'ok', ...result } : unexpected(name);
  } catch (error) {
    return failure(error);
  }
}

// The Cycles tab: every cycle with its state (both schools — Black Belt is joint).
// → { status:'ok', today, cycles: CycleSummary[] } (newest first testing day first; the screen
//   splits Upcoming / Past) · 'no_access' · 'error'
export async function loadCycles() {
  return callRpc('bb_cycles_list', {}, (d) => {
    if (!Array.isArray(d.cycles) || !isIsoDate(d.today)) return null;
    const cycles = d.cycles.map(toSummary);
    return cycles.every(Boolean) ? { today: d.today, cycles } : null;
  });
}

// One cycle with everything the cycle page and Edit cycle need.
// → { status:'ok', cycle: CycleDetail } · 'not_found' (no such cycle — deleted?) · 'no_access' · 'error'
// CycleDetail.candidateCount = active candidates; candidateCountAll = every candidate (withdrawn
// too) — what Delete cycle sends (OP-5). state is worked out here (rules.cycleState) on today.
export async function loadCycle({ cycleId } = {}) {
  try {
    if (!isText(cycleId)) return failure(new Error('No cycle id'));
    if (!supabase) return failure(new Error('No connection is set up'));
    const today = schoolToday();
    const [cycleRes, dayRes, planRes, feeRes, candRes, denied] = await Promise.all([
      supabase.from('bb_cycles').select(CYCLE_COLUMNS).eq('id', cycleId),
      supabase.from('bb_cycle_days').select(DAY_COLUMNS).eq('cycle_id', cycleId),
      supabase.from('bb_cycle_plans').select(PLAN_COLUMNS).eq('cycle_id', cycleId),
      supabase.from('bb_cycle_kukkiwon_fees').select(FEE_COLUMNS).eq('cycle_id', cycleId),
      supabase.from('bb_candidates').select(CANDIDATE_COUNT_COLUMNS).eq('cycle_id', cycleId),
      accessCheck(),
    ]);
    if (denied) return denied;
    for (const res of [cycleRes, dayRes, planRes, feeRes, candRes]) if (res?.error) return failure(res.error);
    if (![cycleRes.data, dayRes.data, planRes.data, feeRes.data, candRes.data].every(Array.isArray)) return unexpected('the cycle tables');
    if (cycleRes.data.length === 0) return { status: 'not_found' };
    const row = cycleRes.data[0];

    const dayIds = dayRes.data.map((d) => d.id);
    const planIds = planRes.data.map((p) => p.id);
    const [partRes, amountRes, payRes] = await Promise.all([
      selectIn('bb_cycle_day_parts', PART_COLUMNS, 'day_id', dayIds),
      selectIn('bb_cycle_plan_amounts', AMOUNT_COLUMNS, 'cycle_plan_id', planIds),
      selectIn('bb_cycle_plan_payments', PLAN_PAYMENT_COLUMNS, 'cycle_plan_id', planIds),
    ]);
    if (partRes.error) return failure(partRes.error);
    if (amountRes.error) return failure(amountRes.error);
    if (payRes.error) return failure(payRes.error);

    const days = dayRes.data
      .map((d) => toDay(d, partRes.rows.filter((p) => p.day_id === d.id).map((p) => p.part)))
      .sort((a, b) => cmp(a.date, b.date) || cmp(a.start, b.start) || cmp(a.id, b.id));
    const plans = planRes.data
      .map((p) => ({
        id: p.id,
        name: p.name,
        position: p.position,
        paymentsCount: p.payments_count,
        payments: payRes.rows
          .filter((x) => x.cycle_plan_id === p.id)
          .sort((a, b) => a.payment_no - b.payment_no)
          .map((x) => ({ id: x.id, paymentNo: x.payment_no, dueOn: x.due_on, followsApplicationDue: x.follows_application_due === true, version: x.version })),
        amounts: Object.fromEntries(DANS.map((dan) => [dan, amountRes.rows
          .filter((a) => a.cycle_plan_id === p.id && a.dan === dan)
          .sort((a, b) => a.payment_no - b.payment_no)
          .map((a) => a.amount_cents)])),
      }))
      .sort((a, b) => a.position - b.position);
    const kukkiwon = Object.fromEntries(DANS.map((dan) => [dan, feeRes.data.find((f) => f.dan === dan)?.amount_cents ?? null]));
    const cycle = {
      id: row.id,
      name: row.name,
      applicationDue: row.application_due,
      submissionsDue: row.submissions_due,
      autoClose: row.auto_close === true,
      registrationOpen: row.registration_open === true,
      firstOpenedAt: row.first_opened_at ?? null,
      codes: { worcester: row.public_code_worcester, shrewsbury: row.public_code_shrewsbury },
      pricesFrom: row.prices_from ?? null,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdByName: row.created_by_name,
      updatedByName: row.updated_by_name,
      candidateCount: candRes.data.filter((c) => c.status === 'active').length,
      candidateCountAll: candRes.data.length,
      days,
      plans,
      kukkiwon,
    };
    cycle.state = cycleState(cycle, days, today);
    return { status: 'ok', cycle };
  } catch (error) {
    return failure(error);
  }
}

// What Add cycle is filled in from (admins): the newest cycle, or the Fall 2026 starting point.
// → { status:'ok', sourceCycleId (null = the starting point), form: CycleForm } ·
//   'not_allowed' · 'no_access' · 'not_found' · 'error'
// form.pricesFrom = "Fall 2026 starting point" or the source cycle's name (the hint shows
// "Fall 2026" — the text before " starting point").
export async function loadCycleDefaults() {
  return callRpc('bb_cycle_defaults', {}, (d) => {
    if (!d.payload || typeof d.payload !== 'object' || !Array.isArray(d.payload.days) || !Array.isArray(d.payload.plans)) return null;
    return { sourceCycleId: d.source_cycle_id ?? null, form: payloadToForm(d.payload) };
  });
}

// Add cycle (admins). form: CycleForm; sourceCycleId: from loadCycleDefaults. The new cycle is
// Closed — if the dialog's switch says Open, call setRegistration next (OP-4).
// → { status:'ok', id, version: 1, codes: { worcester, shrewsbury } } · 'part_without_day' + parts ·
//   'duplicate_name' · 'invalid' · 'not_allowed' · 'no_access' · 'error'
export async function addCycle({ form, sourceCycleId = null } = {}) {
  let payload;
  try {
    payload = buildAddPayload(form);
  } catch (error) {
    return failure(error);
  }
  return callRpc('bb_add_cycle', { p_payload: payload, p_source_cycle_id: sourceCycleId ?? null }, (d) => (
    isText(d.id) && isInt(d.version) && isText(d.public_code_worcester) && isText(d.public_code_shrewsbury)
      ? { id: d.id, version: d.version, codes: { worcester: d.public_code_worcester, shrewsbury: d.public_code_shrewsbury } }
      : null));
}

// Edit cycle (admins). form: CycleForm (days keep their id; every plan payment's due date is sent).
// → { status:'ok', version } · 'stale' · 'part_without_day' + parts · 'duplicate_name' · 'invalid' ·
//   'not_found' · 'not_allowed' · 'no_access' · 'error'
export async function updateCycle({ cycleId, expectedVersion, form } = {}) {
  let payload;
  try {
    payload = buildUpdatePayload(form);
  } catch (error) {
    return failure(error);
  }
  return callRpc('bb_update_cycle', { p_cycle_id: cycleId, p_expected_version: expectedVersion, p_payload: payload },
    (d) => (isInt(d.version) ? { version: d.version } : null));
}

// The Open / Closed switch (staff and admins; opening after Application due: admins, which also
// turns the automatic close off).
// → { status:'ok', version, state: CycleState } · 'finished' · 'waiver_needed' · 'not_allowed' ·
//   'stale' · 'not_found' · 'invalid' · 'no_access' · 'error'
export async function setRegistration({ cycleId, expectedVersion, open } = {}) {
  return callRpc('bb_set_registration', { p_cycle_id: cycleId, p_expected_version: expectedVersion, p_open: open }, (d) => {
    const state = toState(d.state);
    return isInt(d.version) && state ? { version: d.version, state } : null;
  });
}

// Delete cycle (admins). expectedCandidateCount = loadCycle's candidateCountAll (withdrawn too).
// → { status:'ok' } · 'stale' · 'has_payments' · 'has_waivers' · 'not_found' · 'not_allowed' ·
//   'no_access' · 'error'
export async function deleteCycle({ cycleId, expectedVersion, expectedCandidateCount } = {}) {
  return callRpc('bb_delete_cycle', {
    p_cycle_id: cycleId, p_expected_version: expectedVersion, p_expected_candidate_count: expectedCandidateCount,
  }, () => ({}));
}

// Rubric and prices: the keep-years settings and every waiver version (newest first).
// → { status:'ok', settings: { id, afterLastDay, after18, version, updatedAt, updatedByName },
//     current: Waiver, versions: Waiver[], nextVersionName } · 'no_access' · 'error'
// nextVersionName = the name the next save makes (the year of today + that year's count + 1).
export async function loadRubric() {
  try {
    if (!supabase) return failure(new Error('No connection is set up'));
    const [settingsRes, waiverRes, denied] = await Promise.all([
      supabase.from('bb_settings').select(SETTINGS_COLUMNS),
      supabase.from('bb_waiver_versions').select(WAIVER_COLUMNS).order('created_at', { ascending: false }),
      accessCheck(),
    ]);
    if (denied) return denied;
    if (settingsRes?.error) return failure(settingsRes.error);
    if (waiverRes?.error) return failure(waiverRes.error);
    if (!Array.isArray(settingsRes.data) || !Array.isArray(waiverRes.data)) return unexpected('Rubric and prices');
    const s = settingsRes.data[0];
    const versions = waiverRes.data.map(toWaiver).sort((a, b) => cmp(b.createdAt, a.createdAt) || cmp(b.versionName, a.versionName));
    const current = versions.find((v) => v.supersededAt === null) ?? null;
    if (!s || !current) return unexpected('Rubric and prices');
    return {
      status: 'ok',
      settings: {
        id: s.id,
        afterLastDay: s.keep_years_after_last_day ?? null,
        after18: s.keep_years_after_18 ?? null,
        version: s.version,
        updatedAt: s.updated_at,
        updatedByName: s.updated_by_name,
      },
      current,
      versions,
      nextVersionName: nextWaiverVersionName(versions, schoolToday()),
    };
  } catch (error) {
    return failure(error);
  }
}

// Save the waiver text (admins): always a new version; the same text as now writes nothing and
// answers the current version.
// → { status:'ok', id, versionName } · 'stale' · 'invalid' · 'not_allowed' · 'no_access' · 'error'
export async function saveWaiver({ expectedCurrentId, body } = {}) {
  return callRpc('bb_save_waiver', { p_expected_current_id: expectedCurrentId, p_body: body },
    (d) => (isText(d.id) && isText(d.version_name) ? { id: d.id, versionName: d.version_name } : null));
}

// The two keep-years numbers (admins), in two steps (saving may delete data at once):
//   1st call confirmCount: null → { status:'confirm_needed', removeCount } (nothing saved)
//   2nd call confirmCount: that count → { status:'ok', version, removedCount }
// Also 'stale' (the version, or the count changed in between) · 'invalid' · 'not_allowed' ·
// 'no_access' · 'error'.
export async function setKeepYears({ expectedVersion, afterLastDay, after18, confirmCount = null } = {}) {
  return callRpc(
    'bb_set_keep_years',
    { p_expected_version: expectedVersion, p_after_last_day: afterLastDay ?? null, p_after_18: after18 ?? null, p_confirm_count: confirmCount ?? null },
    (d) => (isInt(d.version) && isInt(d.removed_count) ? { version: d.version, removedCount: d.removed_count } : null),
    (status, d) => (status === 'confirm_needed' ? (isInt(d.remove_count) ? { removeCount: d.remove_count } : undefined) : null),
  );
}

// The Testing chooser's "Next: Apr 3 · both schools" line: the earliest testing day of any cycle
// from today on. Reads only the dates (no names, and no purge from the chooser).
// → { status:'ok', next: { date } | null } · 'no_access' · 'error'
export async function loadNextBlackBeltDay() {
  try {
    if (!supabase) return failure(new Error('No connection is set up'));
    const today = schoolToday();
    const [dayRes, denied] = await Promise.all([
      supabase.from('bb_cycle_days').select('day_date').gte('day_date', today).order('day_date', { ascending: true }),
      accessCheck(),
    ]);
    if (denied) return denied;
    if (dayRes?.error) return failure(dayRes.error);
    if (!Array.isArray(dayRes.data)) return unexpected('bb_cycle_days');
    const dates = dayRes.data.map((d) => d.day_date).filter((d) => isIsoDate(d) && d >= today).sort();
    return { status: 'ok', next: dates.length > 0 ? { date: dates[0] } : null };
  } catch (error) {
    return failure(error);
  }
}
