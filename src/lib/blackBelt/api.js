// api.js — every call the Black Belt staff screens make to the database (phases B1 and B2, and
// the rubric editor of migration 0024 — the last section of this file).
// Why it exists: like src/lib/testing/eventsApi.js does for Color Belt, this keeps table names,
// column lists and the exact argument names of the database functions (migration 0016, contract
// 0016-B1 §1) in ONE place. Screens call friendly camelCase functions with one object argument
// and always get back a plain object with a `status` CODE (never words — the screens' text.js
// turns codes into words):
//   'ok' (plus the result fields) · 'no_access' · 'not_allowed' · 'not_found' · 'stale' ·
//   'duplicate_name' · 'invalid' · 'part_without_day' (+ parts) · 'waiver_needed' · 'finished' ·
//   'has_payments' · 'has_waivers' · 'confirm_needed' (+ removeCount) · 'withdrawn' ·
//   'refund_too_large' (+ paidCents) ·
//   rubric (0024): 'invalid' (+ problems) · 'locked' (+ firstOpenedAt) · 'has_registrations' ·
//   grading (0025, contract 0025 §1.2): 'has_grades' (Edit details' Dan change: + gradeCount,
//   countCount, chosenCount; a rubric save / undo: + gradingStartedAt; Delete permanently, Delete
//   cycle and Edit cycle: alone) · 'already_added' (Restore of a make-up while another is active;
//   a Dan change of a candidate whose make-up is on a later cycle) · 'kept' · 'choice_needed' ·
//   'not_finished' · 'no_email' (gradingApi.js uses those) ·
//   'error' (no connection / unexpected answer — { status:'error', error })
// These functions NEVER throw.
//
// Real mode: supabase.rpc(name, args) with 0016's exact argument names (p_…). bb_cycles_list
// and bb_cycle_roster run the purge (they write), so they are normal POSTs — never
// rpc(…, {}, { get: true }). Table reads name their columns (the database refuses select('*') and never gives the app the date of birth,
// the email, the signature or any login id).
// Preview mode: the same calls reach the preview database (mockBlackBelt.js) through mockClient.js;
// this file has no preview branch of its own except schoolToday() (the pretend date).
//
// Money is whole cents (87000 = $870). Dates are 'YYYY-MM-DD' school dates; times 'HH:MM' (the
// database sends '12:30:00' from tables — cut to 5 here).
// The shapes returned (CycleState, CycleSummary, CycleDetail, Day, Plan, CycleForm, Waiver) are
// described in contract 0016-B1 §1.3; the candidate and payment shapes (Money, RosterRow,
// CandidateDetail, WaiverState, PaymentLine, Receipt) in contract 0016-B2 §1.3.
import { supabase, isPreview } from '../supabase.js';
import { readStorage } from '../storage.js';
import { todayInSchoolTime, isIsoDate, shortTime, normalizeNote, PREVIEW_TODAY_KEY } from '../testing/eventRules.js';
import { cycleState, nextWaiverVersionName, buildAddPayload, buildUpdatePayload, PARTS, DANS } from './rules.js';
import { normalizeDan, RUBRIC_SCHEMA_VERSION, RUBRIC_DANS } from './rubric.js';

// Every status a call here can return.
export const BB_STATUSES = [
  'ok', 'no_access', 'not_allowed', 'not_found', 'stale', 'duplicate_name', 'invalid', 'part_without_day', 'waiver_needed',
  'finished', 'has_payments', 'has_waivers', 'confirm_needed', 'withdrawn', 'refund_too_large', 'locked', 'has_registrations',
  // 0025 (contract 0025 §1.2)
  'kept', 'already_added', 'choice_needed', 'not_finished', 'no_email', 'has_grades',
  'error',
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
// A database id (uuid). A cycle address typed or bookmarked wrong (C2, v0.937) is "not found"
// instead of a database error.
const isUuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
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
    if (!isUuid(cycleId)) return { status: 'not_found' };
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
// ALWAYS saved Closed, with a copy of the default rubric (0024 §6.4); opening is its own admin
// step from the cycle's ⋯ menu (v0.933 — no follow-up setRegistration any more).
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
//   'has_grades' (0025, S2: a past day with grades, or the first day once grading started —
//   gradingApi.loadGradingState says which, so the form can gray them first) ·
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

// The Open / Closed switch (staff and admins; the FIRST opening of a cycle: admins only, because
// it locks the cycle's rubric (0024, v0.930); opening after Application due: admins, which also
// turns the automatic close off).
// → { status:'ok', version, state: CycleState, firstOpen } · 'finished' · 'waiver_needed' ·
//   'not_allowed' · 'stale' · 'not_found' · 'invalid' · 'no_access' · 'error'
// firstOpen = true only when this call was the cycle's first opening: then the toast's Undo
// calls undoFirstOpen (back to "never opened"); otherwise Undo sends the opposite switch.
export async function setRegistration({ cycleId, expectedVersion, open } = {}) {
  return callRpc('bb_set_registration', { p_cycle_id: cycleId, p_expected_version: expectedVersion, p_open: open }, (d) => {
    const state = toState(d.state);
    return isInt(d.version) && state ? { version: d.version, state, firstOpen: d.first_open === true } : null;
  });
}

// Undo of a FIRST opening (admins; the "Registration opened" toast, within 15 seconds): the cycle
// goes back to never opened, so its rubric is editable again (v0.929).
// → { status:'ok', version, state: CycleState } · 'stale' (too late, someone changed it, or it
//   wasn't this admin's opening) · 'has_registrations' (a family already registered — the lock
//   stays) · 'not_found' · 'invalid' · 'not_allowed' · 'no_access' · 'error'
export async function undoFirstOpen({ cycleId, expectedVersion } = {}) {
  return callRpc('bb_undo_first_open', { p_cycle_id: cycleId ?? null, p_expected_version: expectedVersion ?? null }, (d) => {
    const state = toState(d.state);
    return isInt(d.version) && state ? { version: d.version, state } : null;
  });
}

// Delete cycle (admins). expectedCandidateCount = loadCycle's candidateCountAll (withdrawn too).
// → { status:'ok' } · 'stale' · 'has_payments' · 'has_waivers' · 'has_grades' (0025, Q-G3) ·
//   'not_found' · 'not_allowed' · 'no_access' · 'error'
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

// =====================================================================================
// ----- Candidates and payments (phase B2, contract 0016-B2 §1) -----
// =====================================================================================
// Every call below is one database function of 0016 (sections 15g–15s, 16c–16f) with its exact
// argument names. The shapes (Money, RosterRow, CandidateDetail, WaiverState, PaymentLine,
// Receipt) are described in contract 0016-B2 §1.3.
// Privacy: ONLY loadCandidate returns the date of birth, the email and the signer's name, and
// ONLY loadSignature returns a signature. Nothing here stores or logs any of them.
// Undo, Edit payment and Mark check returned take no expected version (the database has none);
// a second click is caught as 'stale' ("already undone / already marked").

const isNum = (v) => typeof v === 'number' && Number.isFinite(v); // money sums (bigint) arrive as numbers
const isBool = (v) => typeof v === 'boolean';
const isDate = (v) => isIsoDate(v);
const orNull = (v) => (v === undefined ? null : v);
// The school date of a timestamp — never .slice(0, 10) of a UTC time (an evening registration
// would land on the next day).
const schoolDateOf = (iso) => (isText(iso) && !Number.isNaN(Date.parse(iso)) ? todayInSchoolTime(Date.parse(iso)) : null);
// A note or reason as the database keeps it: spaces at the ends trimmed, empty → null.
const tidyNote = (text) => (typeof text === 'string' ? normalizeNote(text) : null);

// bb_candidate_money's object → Money. withItems: the detail and the write answers carry the
// item list; the roster's money has none. null if it isn't one.
function toMoney(m, { withItems = true } = {}) {
  if (!m || typeof m !== 'object' || typeof m.tag !== 'string') return null;
  if (!['paid_in_full', 'next', 'late', 'not_paid'].includes(m.tag)) return null;
  if (![m.total_due_cents, m.paid_cents, m.balance_cents, m.overpaid_cents].every(isNum)) return null;
  const money = {
    totalDueCents: m.total_due_cents,
    paidCents: m.paid_cents,
    balanceCents: m.balance_cents,
    overpaidCents: m.overpaid_cents,
    tag: m.tag,
    nextOn: orNull(m.next_on),
    nextCents: orNull(m.next_cents),
    lateSince: orNull(m.late_since),
    lateCents: orNull(m.late_cents),
    lateKukkiwonOnly: orNull(m.late_kukkiwon_only),
  };
  if (withItems) {
    if (!Array.isArray(m.items)) return null;
    const items = m.items.map((x) => (x && isText(x.item) && isDate(x.due_on) && [x.amount_cents, x.paid_cents, x.remaining_cents].every(isNum)
      ? { item: x.item, label: x.label ?? null, dueOn: x.due_on, amountCents: x.amount_cents, paidCents: x.paid_cents, remainingCents: x.remaining_cents }
      : null));
    if (!items.every(Boolean)) return null;
    return { items, ...money };
  }
  return money;
}

// A bb_cycle_roster row → RosterRow (no DOB, email, waiver data, withdrawn date/by or login id —
// the database doesn't send them, and nothing else is copied).
function toRosterRow(r) {
  if (!r || !isText(r.id) || !isInt(r.version) || !isInt(r.dan)) return null;
  const money = toMoney(r.money, { withItems: false });
  if (!money) return null;
  return {
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    locationCode: r.location_code,
    dan: r.dan,
    planId: r.plan_id,
    planName: r.plan_name,
    kukkiwon: r.kukkiwon === true,
    source: r.source,
    reference: r.reference,
    registeredAt: r.registered_at,
    registeredOn: schoolDateOf(r.registered_at),
    status: r.status,
    withdrawnReason: orNull(r.withdrawn_reason),
    duplicateState: r.duplicate_state,
    duplicateOf: orNull(r.duplicate_of),
    version: r.version,
    hasPaymentRows: r.has_payment_rows === true,
    money,
    // 0025: a make-up from an earlier cycle (no plan, no fee) and whether real grades exist
    // (Delete permanently is grayed then, v0.950)
    ...makeupFields(r),
  };
}

// The four keys 0025 adds to every roster row and to the detail's candidate (contract 0025 §6.5).
// A make-up row has no plan (planId / planName null): the screens show "No fee".
function makeupFields(r) {
  return {
    isMakeup: r.is_makeup === true,
    makeupOfCycleName: orNull(r.makeup_of_cycle_name),
    retestNames: Array.isArray(r.retest_names) ? r.retest_names.filter((x) => typeof x === 'string') : [],
    hasGrades: r.has_grades === true,
  };
}

// bb_candidate_detail's candidate object → CandidateDetail (every key of the SQL object, in
// camelCase; DOB, email and age are null once the keeping time has passed).
function toCandidateDetail(c) {
  // plan is null for a make-up row (0025: no plan, no fee); every other row has one
  const makeup = c?.is_makeup === true;
  if (!c || !isText(c.id) || !isInt(c.version) || (!makeup && (!c.plan || typeof c.plan !== 'object'))) return null;
  return {
    id: c.id,
    cycleId: c.cycle_id,
    firstName: c.first_name,
    lastName: c.last_name,
    dateOfBirth: orNull(c.date_of_birth),
    emailForResults: orNull(c.email_for_results),
    personalRemovedAt: orNull(c.personal_removed_at),
    locationCode: c.location_code,
    dan: c.dan,
    cyclePlanId: c.cycle_plan_id,
    kukkiwon: c.kukkiwon === true,
    kukkiwonAddedOn: orNull(c.kukkiwon_added_on),
    source: c.source,
    reference: c.reference,
    registeredAt: c.registered_at,
    registeredOn: schoolDateOf(c.registered_at),
    status: c.status,
    withdrawnReason: orNull(c.withdrawn_reason),
    withdrawnAt: orNull(c.withdrawn_at),
    withdrawnByName: orNull(c.withdrawn_by_name),
    duplicateState: c.duplicate_state,
    duplicateOf: orNull(c.duplicate_of),
    version: c.version,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    createdByName: c.created_by_name,
    updatedByName: c.updated_by_name,
    ageOnFirstDay: orNull(c.age_on_first_day),
    under18OnFirstDay: orNull(c.under_18_on_first_day),
    plan: c.plan && typeof c.plan === 'object' ? { name: c.plan.name ?? null, paymentsCount: c.plan.payments_count ?? null } : null,
    ...makeupFields(c),
  };
}

// The detail's waiver object → WaiverState (never the picture: only whether one is on file).
function toWaiverState(w) {
  if (w === null || w === undefined) return null;
  if (typeof w !== 'object' || !['drawn', 'paper'].includes(w.how)) return undefined; // wrong shape
  return {
    how: w.how,
    versionName: orNull(w.version_name),
    signedAt: orNull(w.signed_at),
    signerName: orNull(w.signer_name),
    signedAsMinor: w.signed_as_minor === true,
    tickedByName: orNull(w.ticked_by_name),
    signatureOnFile: w.signature_on_file === true,
    removedAt: orNull(w.removed_at),
  };
}

// One of the detail's payment lines → PaymentLine (live rows only; refund/returned negative).
function toPaymentLine(p) {
  if (!p || !isText(p.id) || !['payment', 'refund', 'returned'].includes(p.kind) || !isInt(p.amount_cents)) return null;
  return {
    id: p.id,
    kind: p.kind,
    amountCents: p.amount_cents,
    method: p.method,
    paidOn: p.paid_on,
    forItems: Array.isArray(p.for_items) ? [...p.for_items] : null,
    note: orNull(p.note),
    reason: orNull(p.reason),
    recordedAt: p.recorded_at,
    recordedByName: p.recorded_by_name,
    reversesPaymentId: orNull(p.reverses_payment_id),
    returned: p.returned === true,
  };
}

// The Candidates tab of one cycle: every candidate (withdrawn too) with their money picture.
// Runs the purge, so it is a normal POST.
// → { status:'ok', state: CycleState, rows: RosterRow[] } (the database's order: Dan,
//   Shrewsbury then Worcester, last name, first name) · 'not_found' · 'invalid' · 'no_access' · 'error'
export async function loadRoster({ cycleId } = {}) {
  return callRpc('bb_cycle_roster', { p_cycle_id: cycleId ?? null }, (d) => {
    const state = toState(d.state);
    if (!state || !Array.isArray(d.rows)) return null;
    const rows = d.rows.map(toRosterRow);
    return rows.every(Boolean) ? { state, rows } : null;
  });
}

// One candidate for the detail dialog (and each side of Compare) — the ONLY call that returns
// the date of birth, the email and the signer's name. Keep the answer only while the dialog is open.
// → { status:'ok', candidate: CandidateDetail, waiver: WaiverState|null, needsParentSignature,
//     payments: PaymentLine[] (oldest first), money: Money } · 'not_found' · 'invalid' · 'no_access' · 'error'
export async function loadCandidate({ candidateId } = {}) {
  return callRpc('bb_candidate_detail', { p_candidate_id: candidateId ?? null }, (d) => {
    const candidate = toCandidateDetail(d.candidate);
    const waiver = toWaiverState(d.waiver);
    const money = toMoney(d.money);
    if (!candidate || waiver === undefined || !money || !Array.isArray(d.payments)) return null;
    const payments = d.payments.map(toPaymentLine);
    if (!payments.every(Boolean)) return null;
    return { candidate, waiver, needsParentSignature: d.needs_parent_signature === true, payments, money };
  });
}

// The drawn signature itself (admins; "View signature"). Show it only as <img src> and drop it
// when the dialog closes. signature is null for a paper-only waiver or after the keeping time.
// → { status:'ok', signature, signerName, signedAt, removedAt } · 'not_allowed' · 'not_found' ·
//   'invalid' · 'no_access' · 'error'
export async function loadSignature({ candidateId } = {}) {
  return callRpc('bb_view_signature', { p_candidate_id: candidateId ?? null }, (d) => {
    if (d.signature !== null && d.signature !== undefined && !isText(d.signature)) return null;
    return { signature: orNull(d.signature), signerName: orNull(d.signer_name), signedAt: orNull(d.signed_at), removedAt: orNull(d.removed_at) };
  });
}

// What the printed receipt shows (bb_receipt) + the schools' phone numbers (locations.phone,
// asked at the same time; an empty phone → null, B1 OP-21). No DOB, email, notes, reasons or
// "recorded by".
// → { status:'ok', receipt: Receipt } · 'not_found' · 'invalid' · 'no_access' · 'error'
export async function loadReceipt({ candidateId } = {}) {
  try {
    if (!supabase) return failure(new Error('No connection is set up'));
    const [res, phoneRes] = await Promise.all([
      callRpc('bb_receipt', { p_candidate_id: candidateId ?? null }, (d) => d),
      supabase.from('locations').select('code, name, phone'),
    ]);
    if (res.status !== 'ok') return res;
    if (phoneRes?.error) return failure(phoneRes.error);
    if (!Array.isArray(phoneRes?.data)) return unexpected('locations');
    const phoneOf = (code) => {
      const phone = phoneRes.data.find((l) => l.code === code)?.phone;
      return isText(phone) && phone.trim() !== '' ? phone : null;
    };
    const c = res.candidate;
    const money = res.money;
    if (!c || !isText(c.reference) || !Array.isArray(res.lines) || !Array.isArray(res.schools) || !money || !isNum(money.total_due_cents)) {
      return unexpected('bb_receipt');
    }
    const lines = res.lines.map((l) => (l && ['payment', 'refund', 'returned'].includes(l.kind) && isInt(l.amount_cents)
      ? { paidOn: l.paid_on, forItems: Array.isArray(l.for_items) ? [...l.for_items] : null, kind: l.kind, method: l.method, amountCents: l.amount_cents, returned: l.returned === true }
      : null));
    if (!lines.every(Boolean)) return unexpected('bb_receipt');
    const address = (a) => (a && typeof a === 'object' ? { street: orNull(a.street), city: orNull(a.city), state: orNull(a.state), zip: orNull(a.zip) } : null);
    return {
      status: 'ok',
      receipt: {
        candidate: { firstName: c.first_name, lastName: c.last_name, dan: c.dan, reference: c.reference, locationCode: c.location_code },
        cycleName: res.cycle?.name ?? null,
        planName: res.plan?.name ?? null,
        kukkiwon: res.kukkiwon === true,
        lines,
        money: {
          totalDueCents: money.total_due_cents,
          paidCents: money.paid_cents,
          balanceCents: money.balance_cents,
          nextOn: orNull(money.next_on),
          nextCents: orNull(money.next_cents),
        },
        schools: res.schools.map((s) => ({ code: s.code, name: s.name, address: address(s.address), phone: phoneOf(s.code) })),
        printedOn: res.printed_on,
        printedByName: res.printed_by_name,
      },
    };
  } catch (error) {
    return failure(error);
  }
}

// Add candidate at the desk (walk-ins and late families; works while registration is closed).
// paperWaiver must be true ("Waiver signed on paper" ticked). A same-name + same-DOB match is
// marked "possible duplicate" silently (the box appears on the roster).
// → { status:'ok', id, reference, version } · 'finished' · 'invalid' · 'not_found' · 'no_access' · 'error'
export async function addCandidate({ cycleId, first, last, dateOfBirth, email, locationCode, dan, planId, kukkiwon, paperWaiver } = {}) {
  return callRpc('bb_add_candidate', {
    p_cycle_id: cycleId ?? null,
    p_first: first ?? null,
    p_last: last ?? null,
    p_date_of_birth: dateOfBirth || null,
    p_email: email || null, // '' → none (the database answers invalid)
    p_location_code: locationCode ?? null,
    p_dan: dan ?? null,
    p_cycle_plan_id: planId ?? null,
    p_kukkiwon: kukkiwon ?? null,
    p_paper_waiver: paperWaiver ?? null,
  }, (d) => (isText(d.id) && isText(d.reference) && isInt(d.version) ? { id: d.id, reference: d.reference, version: d.version } : null));
}

// Edit details. A candidate whose personal details were deleted after the keeping time sends
// dateOfBirth: null, email: null (they can't come back). A Dan change after a payment: admins.
// → { status:'ok', version, needsParentSignature } · 'not_allowed' · 'stale' · 'invalid' (also a
//   Dan change of a make-up row) · 'not_found' · 'no_access' · 'error'
//   0025: a Dan change while the old Dan has grades → 'has_grades' + gradeCount, countCount,
//   chosenCount and NOTHING is saved (show the Dan-change dialog, then updateCandidateClear);
//   'already_added' (a make-up of this candidate is on a later cycle — Undo it first, OI-4).
export async function updateCandidate({ candidateId, expectedVersion, first, last, dateOfBirth, email, locationCode, dan } = {}) {
  return callRpc('bb_update_candidate', candidateArgs({ candidateId, expectedVersion, first, last, dateOfBirth, email, locationCode, dan }),
    (d) => (isInt(d.version) && isBool(d.needs_parent_signature) ? { version: d.version, needsParentSignature: d.needs_parent_signature } : null),
    hasGradesCounts);
}

// Edit details' eight arguments (bb_update_candidate and bb_update_candidate_clear share them).
function candidateArgs({ candidateId, expectedVersion, first, last, dateOfBirth, email, locationCode, dan }) {
  return {
    p_candidate_id: candidateId ?? null,
    p_expected_version: expectedVersion ?? null,
    p_first: first ?? null,
    p_last: last ?? null,
    p_date_of_birth: dateOfBirth || null,
    p_email: email || null, // '' → none, so a purged candidate's empty field is sent as null
    p_location_code: locationCode ?? null,
    p_dan: dan ?? null,
  };
}

// A 'has_grades' answer of a Dan change → its three counts (contract 0025 §6.4, DC 5).
function hasGradesCounts(status, d) {
  if (status !== 'has_grades') return null;
  if (![d.grade_count, d.count_count, d.chosen_count].every(isInt)) return undefined;
  return { gradeCount: d.grade_count, countCount: d.count_count, chosenCount: d.chosen_count };
}

// The confirmed Dan change (the Dan-change dialog's red button, v0.955): the same as Edit details,
// plus the three counts the dialog showed. The old Dan's grades, counts and chosen subjects are
// cleared in the same step (logged); kept make-up rows and sends stay.
// → { status:'ok', version, needsParentSignature, cleared: { grades, counts, chosen } } ·
//   'has_grades' + the NEW counts (someone graded meanwhile — ask again) · 'already_added' ·
//   'not_allowed' · 'stale' · 'invalid' · 'not_found' · 'no_access' · 'error'
export async function updateCandidateClear({
  candidateId, expectedVersion, first, last, dateOfBirth, email, locationCode, dan, expectedGradeCount, expectedCountCount, expectedChosenCount,
} = {}) {
  return callRpc('bb_update_candidate_clear', {
    ...candidateArgs({ candidateId, expectedVersion, first, last, dateOfBirth, email, locationCode, dan }),
    p_expected_grade_count: expectedGradeCount ?? null,
    p_expected_count_count: expectedCountCount ?? null,
    p_expected_chosen_count: expectedChosenCount ?? null,
  }, (d) => (isInt(d.version) && isBool(d.needs_parent_signature) && d.cleared && typeof d.cleared === 'object'
    ? {
      version: d.version,
      needsParentSignature: d.needs_parent_signature,
      cleared: { grades: d.cleared.grades ?? 0, counts: d.cleared.counts ?? 0, chosen: d.cleared.chosen ?? 0 },
    }
    : null), hasGradesCounts);
}

// Change plan or Kukkiwon (staff before a payment; admins after). The same values write nothing.
// (0025: a make-up row has no plan → 'invalid'; the screens don't offer Change plan there.)
// → { status:'ok', version, money: Money } · 'withdrawn' · 'not_allowed' · 'stale' · 'invalid' ·
//   'not_found' · 'no_access' · 'error'
export async function changePlan({ candidateId, expectedVersion, planId, kukkiwon } = {}) {
  return callRpc('bb_change_plan', {
    p_candidate_id: candidateId ?? null, p_expected_version: expectedVersion ?? null, p_cycle_plan_id: planId ?? null, p_kukkiwon: kukkiwon ?? null,
  }, (d) => {
    const money = toMoney(d.money);
    return isInt(d.version) && money ? { version: d.version, money } : null;
  });
}

// The "Possible duplicate" choice: keepBoth true → both stay ("kept both"); false → "Keep this
// one" (the other is withdrawn as a duplicate copy and can be restored).
// → { status:'ok', keepVersion, otherVersion } · 'withdrawn' · 'stale' · 'invalid' · 'not_found' ·
//   'no_access' · 'error'
export async function resolveDuplicate({ keepId, keepVersion, otherId, otherVersion, keepBoth } = {}) {
  return callRpc('bb_resolve_duplicate', {
    p_keep_id: keepId ?? null, p_keep_version: keepVersion ?? null, p_other_id: otherId ?? null, p_other_version: otherVersion ?? null, p_keep_both: keepBoth ?? null,
  }, (d) => (isInt(d.keep_version) && isInt(d.other_version) ? { keepVersion: d.keep_version, otherVersion: d.other_version } : null));
}

// Withdraw (admins): the candidate moves to the Removed group with their payments.
// → { status:'ok', version } · 'withdrawn' (already) · 'stale' · 'not_found' · 'invalid' ·
//   'not_allowed' · 'no_access' · 'error'
export async function withdrawCandidate({ candidateId, expectedVersion } = {}) {
  return callRpc('bb_withdraw_candidate', { p_candidate_id: candidateId ?? null, p_expected_version: expectedVersion ?? null },
    (d) => (isInt(d.version) ? { version: d.version } : null));
}

// Restore (admins; or staff within 10 seconds of their own "Keep this one" — the toast's Undo).
// → { status:'ok', version } · 'stale' (not withdrawn, or the version) · 'not_allowed' ·
//   'already_added' (0025: a make-up whose earlier candidate already has another active make-up) ·
//   'not_found' · 'invalid' · 'no_access' · 'error'
export async function restoreCandidate({ candidateId, expectedVersion } = {}) {
  return callRpc('bb_restore_candidate', { p_candidate_id: candidateId ?? null, p_expected_version: expectedVersion ?? null },
    (d) => (isInt(d.version) ? { version: d.version } : null));
}

// Delete permanently (admins): refused once the candidate has ANY payment row (even an undone one),
// and (0025, Q-G3) once they have real grades — "Withdraw them instead". Also the Undo of Add make-up.
// → { status:'ok' } · 'has_payments' · 'has_grades' · 'stale' · 'not_found' · 'invalid' ·
//   'not_allowed' · 'no_access' · 'error'
export async function deleteCandidate({ candidateId, expectedVersion } = {}) {
  return callRpc('bb_delete_candidate', { p_candidate_id: candidateId ?? null, p_expected_version: expectedVersion ?? null }, () => ({}));
}

// "Waiver signed on paper" in the needs-a-parent's-signature box: a new paper waiver row.
// → { status:'ok', version, needsParentSignature } · 'finished' · 'invalid' (personal details
//   deleted) · 'stale' · 'not_found' · 'no_access' · 'error'
export async function recordPaperWaiver({ candidateId, expectedVersion } = {}) {
  return callRpc('bb_record_paper_waiver', { p_candidate_id: candidateId ?? null, p_expected_version: expectedVersion ?? null },
    (d) => (isInt(d.version) && isBool(d.needs_parent_signature) ? { version: d.version, needsParentSignature: d.needs_parent_signature } : null));
}

const paymentAnswer = (d) => {
  const money = toMoney(d.money);
  return isText(d.payment_id) && isInt(d.version) && money ? { paymentId: d.payment_id, version: d.version, money } : null;
};
const moneyAnswer = (d) => {
  const money = toMoney(d.money);
  return isInt(d.version) && money ? { version: d.version, money } : null;
};

// Record payment: amountCents 1–500000 (any cents), method 'cash'|'check'|'card', forItems
// ['p1', 'kukkiwon'] (items of the CURRENT plan), note optional (trimmed; '' → none). Counts today.
// → { status:'ok', paymentId, version, money } · 'withdrawn' · 'invalid' · 'stale' · 'not_found' ·
//   'no_access' · 'error'
export async function recordPayment({ candidateId, expectedVersion, amountCents, method, forItems, note = null } = {}) {
  return callRpc('bb_record_payment', {
    p_candidate_id: candidateId ?? null,
    p_expected_version: expectedVersion ?? null,
    p_amount_cents: amountCents ?? null,
    p_method: method ?? null,
    p_for_items: Array.isArray(forItems) ? [...forItems] : null,
    p_note: tidyNote(note),
  }, paymentAnswer);
}

// Undo a payment, a refund or a returned-check mark (a reversal row; the original stays).
// Staff: their own row within 10 seconds; admins any time.
// → { status:'ok', version, money } · 'not_allowed' · 'invalid' (a reversal; a payment with a
//   live returned mark; it would take the paid total below zero) · 'stale' (already undone) ·
//   'not_found' · 'no_access' · 'error'
export async function undoPayment({ paymentId } = {}) {
  return callRpc('bb_undo_payment', { p_payment_id: paymentId ?? null }, moneyAnswer);
}

// Edit payment (admins) = an undo of the old row + a new payment with the old row's date, school
// and cycle name; the editing admin is the new row's recorder. reason is required.
// → { status:'ok', paymentId (the NEW row), version, money } · 'withdrawn' · 'invalid' (not a
//   payment; an active refund; an item not in the plan) · 'stale' (undone, edited away or
//   returned) · 'not_found' · 'not_allowed' · 'no_access' · 'error'
export async function editPayment({ paymentId, amountCents, method, forItems, note = null, reason } = {}) {
  return callRpc('bb_edit_payment', {
    p_payment_id: paymentId ?? null,
    p_amount_cents: amountCents ?? null,
    p_method: method ?? null,
    p_for_items: Array.isArray(forItems) ? [...forItems] : null,
    p_note: tidyNote(note),
    p_reason: tidyNote(reason),
  }, paymentAnswer);
}

// Record refund (admins): entered positive, stored negative, counted today; never more than
// what's been paid (all rows added up).
// → { status:'ok', paymentId, version, money } · 'refund_too_large' (+ paidCents) · 'invalid' ·
//   'stale' · 'not_found' · 'not_allowed' · 'no_access' · 'error'
export async function recordRefund({ candidateId, expectedVersion, amountCents, method, note = null } = {}) {
  return callRpc('bb_record_refund', {
    p_candidate_id: candidateId ?? null,
    p_expected_version: expectedVersion ?? null,
    p_amount_cents: amountCents ?? null,
    p_method: method ?? null,
    p_note: tidyNote(note),
  }, paymentAnswer, (status, d) => (status === 'refund_too_large' ? (isNum(d.paid_cents) ? { paidCents: d.paid_cents } : undefined) : null));
}

// Mark check returned (admins): a 'returned' row of minus the check's amount, dated today (never
// written as an undo — Finance shows it on the day it was marked, v0.809).
// → { status:'ok', paymentId (the returned row), version, money } · 'invalid' (not a check
//   payment) · 'stale' (undone, edited away, or marked once already) · 'not_found' ·
//   'not_allowed' · 'no_access' · 'error'
export async function markCheckReturned({ paymentId, note = null } = {}) {
  return callRpc('bb_mark_check_returned', { p_payment_id: paymentId ?? null, p_note: tidyNote(note) }, paymentAnswer);
}

// =====================================================================================
// ----- The rubric (migration 0024, contract 0024 §10.1) -----
// =====================================================================================
// The rubric is ONE JSON document (rubric.js describes it) in two places: the default on Rubric
// and prices (bb_default_rubric.sheet) and each cycle's own copy (bb_cycles.requirements). The
// document keeps its stored snake_case keys; only these functions' own fields are camelCase.
// An admin saves ONE Dan at a time with the rev (revision number) they loaded; a newer save by
// someone else answers 'stale' instead of overwriting. Saves and undos are admins only.

const RUBRIC_COLUMNS = 'id, sheet, version, updated_at, updated_by_name';
const CYCLE_RUBRIC_COLUMNS = 'id, name, requirements, first_opened_at, registration_open, created_at';
const PROBLEM_KEYS = ['code', 'part', 'subject', 'way', 'bracket', 'item', 'step', 'path'];

// Is this a v2 rubric document (outer shape only — the database checked every value)?
const isRubric = (doc) => Boolean(doc) && typeof doc === 'object' && doc.schema_version === RUBRIC_SCHEMA_VERSION
  && Array.isArray(doc.dans) && doc.dans.length === RUBRIC_DANS.length;

// The database's problem list → the same objects with only the known keys (at most 100).
function toProblems(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((p) => p && typeof p.code === 'string').slice(0, 100)
    .map((p) => Object.fromEntries(PROBLEM_KEYS.filter((k) => p[k] !== undefined && p[k] !== null).map((k) => [k, p[k]])));
}

// The refusals of a rubric save / undo that carry an extra field.
function rubricRefusal(status, d) {
  if (status === 'invalid') return { problems: toProblems(d.problems) }; // no list = a wrong argument
  if (status === 'locked') return isText(d.first_opened_at) ? { firstOpenedAt: d.first_opened_at } : undefined;
  // 0025 (Q-G1, OI-2 = B): grading started on this cycle — its copy is locked for good
  if (status === 'has_grades') return { gradingStartedAt: orNull(d.grading_started_at) };
  return null;
}

// A save's ok answer → { rev, savedAt, savedByName, changed, undoAvailable, previousRev }.
// undoAvailable is true only when this save wrote an undo slot: show the toast's Undo only then.
const saveAnswer = (d) => (isInt(d.rev) && isBool(d.changed)
  ? {
    rev: d.rev,
    savedAt: orNull(d.saved_at),
    savedByName: orNull(d.saved_by_name),
    changed: d.changed,
    undoAvailable: d.undo_available === true,
    previousRev: isInt(d.previous_rev) ? d.previous_rev : null,
  }
  : null);
// An undo's ok answer → { rev, savedAt, savedByName } (the previous version is back, with a new rev).
const undoAnswer = (d) => (isInt(d.rev) ? { rev: d.rev, savedAt: orNull(d.saved_at), savedByName: orNull(d.saved_by_name) } : null);

// Reads one table for the rubric screens together with the has_data_access check (a locked
// sign-in gets an empty list, which must not look like "no rubric").
async function selectWithAccess(table, columns, filter = null) {
  if (!supabase) return { result: failure(new Error('No connection is set up')) };
  let query = supabase.from(table).select(columns);
  if (filter) query = query.eq(filter.col, filter.value);
  const [res, denied] = await Promise.all([query, accessCheck()]);
  if (denied) return { result: denied };
  if (res?.error) return { result: failure(res.error) };
  if (!Array.isArray(res?.data)) return { result: unexpected(table) };
  return { rows: res.data };
}

// The default rubric (Rubric and prices; staff read it too, view only).
// → { status:'ok', rubric, version, updatedAt, updatedByName } · 'no_access' · 'error'
// "Last changed by" per Dan = rubric.dans[n].saved_by_name / saved_at (null = never saved: hide it).
export async function loadDefaultRubric() {
  try {
    const { result, rows } = await selectWithAccess('bb_default_rubric', RUBRIC_COLUMNS);
    if (result) return result;
    const row = rows[0];
    if (!row || !isRubric(row.sheet) || !isInt(row.version)) return unexpected('bb_default_rubric');
    return { status: 'ok', rubric: row.sheet, version: row.version, updatedAt: row.updated_at, updatedByName: row.updated_by_name };
  } catch (error) {
    return failure(error);
  }
}

// One cycle's own copy of the rubric (the cycle page's Rubric tab).
// → { status:'ok', rubric, locked, firstOpenedAt, registrationOpen, createdAt, name } · 'not_found' ·
//   'no_access' · 'error'
// locked = registration has opened once (first_opened_at set): the copy can't change any more.
export async function loadCycleRubric({ cycleId } = {}) {
  try {
    if (!isText(cycleId)) return failure(new Error('No cycle id'));
    const { result, rows } = await selectWithAccess('bb_cycles', CYCLE_RUBRIC_COLUMNS, { col: 'id', value: cycleId });
    if (result) return result;
    if (rows.length === 0) return { status: 'not_found' };
    const row = rows[0];
    if (!isRubric(row.requirements)) return unexpected('bb_cycles.requirements');
    const firstOpenedAt = orNull(row.first_opened_at);
    return {
      status: 'ok',
      rubric: row.requirements,
      locked: firstOpenedAt !== null,
      firstOpenedAt,
      registrationOpen: row.registration_open === true,
      createdAt: row.created_at,
      name: row.name,
    };
  } catch (error) {
    return failure(error);
  }
}

// Save one Dan of the default rubric (admins). sheet = the whole Dan object as edited (it is
// tidied here first — names and texts normalized, worked-out points recomputed — the same
// tidying the editor shows). Its rev / saved_at / saved_by_name are replaced by the database.
// → { status:'ok', rev, savedAt, savedByName, changed, undoAvailable, previousRev } ·
//   'invalid' + problems (rubric.js danProblems codes; [] = a wrong argument) · 'stale' (another
//   admin saved this Dan since it was loaded) · 'not_allowed' · 'no_access' · 'error'
// changed false = the same content as saved (nothing written; undoAvailable false, previousRev null).
export async function saveDefaultDan({ dan, expectedRev, sheet } = {}) {
  return callRpc('bb_save_default_dan', { p_dan: dan ?? null, p_expected_rev: expectedRev ?? null, p_sheet: normalizeDan(sheet) ?? null },
    saveAnswer, rubricRefusal);
}

// Undo of the last save of one default Dan (the admin who saved, within 15 seconds): the previous
// version comes back as one more history entry (a new rev).
// → { status:'ok', rev, savedAt, savedByName } · 'stale' (too late, or someone saved since) ·
//   'invalid' · 'not_allowed' · 'no_access' · 'error'
export async function undoDefaultDan({ dan, expectedRev } = {}) {
  return callRpc('bb_undo_default_dan', { p_dan: dan ?? null, p_expected_rev: expectedRev ?? null }, undoAnswer, rubricRefusal);
}

// Save one Dan of a cycle's own copy (admins; only while the cycle has never been opened).
// → as saveDefaultDan, plus 'locked' + firstOpenedAt (registration opened since — reload into
//   the locked view), 'has_grades' + gradingStartedAt (0025: grading started — locked for good)
//   and 'not_found'.
export async function saveCycleDan({ cycleId, dan, expectedRev, sheet } = {}) {
  return callRpc('bb_save_cycle_dan', {
    p_cycle_id: cycleId ?? null, p_dan: dan ?? null, p_expected_rev: expectedRev ?? null, p_sheet: normalizeDan(sheet) ?? null,
  }, saveAnswer, rubricRefusal);
}

// Undo of the last save of one Dan of a cycle's copy.
// → as undoDefaultDan, plus 'locked' + firstOpenedAt, 'has_grades' + gradingStartedAt and 'not_found'.
export async function undoCycleDan({ cycleId, dan, expectedRev } = {}) {
  return callRpc('bb_undo_cycle_dan', { p_cycle_id: cycleId ?? null, p_dan: dan ?? null, p_expected_rev: expectedRev ?? null },
    undoAnswer, rubricRefusal);
}
