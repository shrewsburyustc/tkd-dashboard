// mockProspects.js — the PREVIEW (fake) database for Prospects (migration 0010).
// Why it exists: preview mode runs without Supabase. This file pretends to be the prospects
// tables and the prospects_* / prospect_statuses_* functions, with the SAME rules and answers as
// migration 0010. It is a PART of the fake Forms database (mockForms.js), because a sign-up and
// its prospects change together there too: 0010's triggers make one prospect per child when a
// sign-up is saved, and move a child New ↔ Booked when a free class is booked or cancelled.
//
//   const part = createProspectsPart({ newId, stamp, today, nowLocal, times, slotsOn, insertRow, updateRow });
//   part.afterSubmission(db, submission, ctx)   (= trigger prospects_from_submission)
//   part.afterBooking(db, booking, ctx)         (= trigger prospects_follow_booking)
//   part.backfill(db)                           (= 0010 section 12, plus a few made-up samples)
//   part.handlers                               the functions, called by mockForms' rpc()
import { addDays } from './schedule/versions.js';
import { cleanText, textProblem } from './calendar/rules.js';
import { longTextProblem } from './forms/fields.js';

export const PROSPECT_COLORS = ['gray', 'yellow', 'orange', 'green', 'teal', 'sky', 'purple', 'pink'];

export const PROSPECTS_RPC_ARGS = {
  prospects_list: [['p_location_code', 'text']],
  prospects_search: [['p_location_code', 'text'], ['p_text', 'text']],
  prospects_get: [['p_prospect_id', 'uuid']],
  prospects_badge: [['p_location_code', 'text']],
  prospects_for_bookings: [['p_booking_ids', 'uuid[]']],
  prospects_set_status: [['p_prospect_id', 'uuid'], ['p_expected_version', 'int'], ['p_status_id', 'uuid'], ['p_joined_on', 'date']],
  prospects_add_note: [['p_prospect_id', 'uuid'], ['p_body', 'text'], ['p_set_follow_up', 'bool'], ['p_follow_up_on', 'date']],
  prospects_set_follow_up: [['p_prospect_id', 'uuid'], ['p_expected_version', 'int'], ['p_follow_up_on', 'date']],
  prospects_mark_opened: [['p_prospect_id', 'uuid']],
  prospects_check_in: [['p_prospect_id', 'uuid'], ['p_expected_version', 'int'], ['p_came', 'bool'], ['p_after_class', 'bool']],
  prospects_undo_check_in: [['p_prospect_id', 'uuid'], ['p_expected_version', 'int'], ['p_previous_status_id', 'uuid'], ['p_previous_follow_up_on', 'date']],
  prospects_open_times: [['p_prospect_id', 'uuid'], ['p_from', 'date'], ['p_to', 'date']],
  prospects_book_time: [['p_prospect_id', 'uuid'], ['p_expected_version', 'int'], ['p_form_id', 'uuid'], ['p_class_id', 'uuid'], ['p_date', 'date'], ['p_starts_at', 'time']],
  prospects_cancel_time: [['p_prospect_id', 'uuid'], ['p_expected_version', 'int']],
  prospect_statuses_add: [['p_location_code', 'text'], ['p_name', 'text'], ['p_kind', 'text'], ['p_color', 'text']],
  prospect_statuses_update: [['p_status_id', 'uuid'], ['p_expected_version', 'int'], ['p_name', 'text'], ['p_kind', 'text'], ['p_color', 'text']],
  prospect_statuses_reorder: [['p_location_code', 'text'], ['p_expected_ids', 'uuid[]'], ['p_new_ids', 'uuid[]']],
  prospect_statuses_delete: [['p_status_id', 'uuid'], ['p_expected_version', 'int'], ['p_expected_count', 'int'], ['p_move_to_id', 'uuid']],
  prospects_delete: [['p_prospect_id', 'uuid'], ['p_expected_version', 'int']],
};
// Only these need an admin (0010: deleting a prospect or a custom status).
export const PROSPECTS_ADMIN_ONLY = ['prospect_statuses_delete', 'prospects_delete'];
// Functions that change data (a fake transaction: saved only on 'ok'). The list also runs the
// clean-up and seeds statuses, so it is saved too.
export const PROSPECTS_SAVE_ALWAYS = ['prospects_list', 'prospects_mark_opened'];

const LOCATION_CODES = ['worcester', 'shrewsbury'];
const st = (status, extra = {}) => ({ status, ...extra });
const hhmm = (text) => String(text).slice(0, 5);
const SEED = [
  ['New', 'stage', 'sky', 'new'], ['Contacted', 'stage', 'yellow', null], ['Booked', 'stage', 'purple', 'booked'],
  ['Came', 'stage', 'teal', 'came'], ['Joined', 'stage', 'green', 'joined'], ['No-show', 'exit', 'orange', 'no_show'],
  ['Not interested', 'exit', 'gray', 'not_interested'],
];

export function emptyProspectsTables() {
  return { statuses: [], prospects: [], notes: [], activity: [], opens: [] };
}

export function createProspectsPart({ newId, stamp, today, nowLocal, times, slotsOn, insertRow, updateRow }) {
  const statusOf = (db, code, builtin) => db.statuses.find((s) => s.location_code === code && s.builtin === builtin)?.id ?? null;
  const builtinOf = (db, id) => db.statuses.find((s) => s.id === id)?.builtin ?? null;
  const bookingOf = (db, p) => db.bookings.find((b) => b.submission_id === p.submission_id && b.child_index === p.child_index) ?? null;
  const classRan = (b) => Boolean(b.class_id) && slotsOn(b.location_code, b.on_date).some((s) => s.class_ids.includes(b.class_id) && hhmm(s.starts_at) === hhmm(b.starts_at));
  const log = (db, p, kind, detail, ctx, at = stamp()) => db.activity.push({ id: db.activity.length + 1, prospect_id: p.id, location_code: p.location_code, kind, detail: detail ?? {}, created_at: at, created_by_name: ctx.actorName });
  const touch = (p) => {
    p.last_activity_at = stamp();
  };

  function seedStatuses(db, code) {
    if (db.statuses.some((s) => s.location_code === code && s.builtin)) return;
    SEED.forEach(([name, kind, color, builtin], position) => {
      insertRow(db.statuses, { id: newId(), location_code: code, name, kind, position, color, builtin }, { actorName: 'Preview' });
    });
  }

  function afterSubmission(db, sub, ctx) {
    seedStatuses(db, sub.location_code);
    sub.children.forEach((c, i) => {
      if (db.prospects.some((p) => p.submission_id === sub.id && p.child_index === i)) return;
      const p = insertRow(db.prospects, {
        id: newId(), location_code: sub.location_code, submission_id: sub.id, child_index: i, child_first_name: c.first_name, child_age: c.age,
        status_id: statusOf(db, sub.location_code, 'new'), follow_up_on: null, joined_on: null, checked_in_at: null, checked_in_by_name: null,
        last_activity_at: stamp(),
      }, ctx);
      log(db, p, 'created', { source: sub.source, entered_by: sub.entered_by }, ctx, sub.created_at);
    });
  }

  function afterBooking(db, b, ctx) {
    const p = db.prospects.find((x) => x.submission_id === b.submission_id && x.child_index === b.child_index);
    if (!p) return;
    const isNew = p.status_id === statusOf(db, p.location_code, 'new');
    const isBooked = p.status_id === statusOf(db, p.location_code, 'booked');
    if (b.status === 'booked' && isNew) updateRow(p, { status_id: statusOf(db, p.location_code, 'booked') }, ctx);
    else if (b.status === 'cancelled' && isBooked) updateRow(p, { status_id: statusOf(db, p.location_code, 'new') }, ctx);
    touch(p);
  }

  // = prospects_purge_old: every family with no Joined child, quiet for 2 years
  function purge(db) {
    const cutoff = new Date(new Date(stamp()).getTime() - 730 * 86400000).toISOString();
    const families = new Map();
    for (const p of db.prospects) {
      const f = families.get(p.submission_id) ?? { joined: false, last: '' };
      f.joined = f.joined || builtinOf(db, p.status_id) === 'joined';
      f.last = p.last_activity_at > f.last ? p.last_activity_at : f.last;
      families.set(p.submission_id, f);
    }
    for (const [subId, f] of families) {
      if (!f.joined && f.last < cutoff) removeFamily(db, subId);
    }
  }
  function removeProspect(db, id) {
    db.prospects = db.prospects.filter((p) => p.id !== id);
    db.notes = db.notes.filter((n) => n.prospect_id !== id);
    db.activity = db.activity.filter((a) => a.prospect_id !== id);
    db.opens = db.opens.filter((o) => o.prospect_id !== id);
  }
  function removeFamily(db, subId) {
    for (const p of db.prospects.filter((x) => x.submission_id === subId)) removeProspect(db, p.id);
    db.bookings = db.bookings.filter((b) => b.submission_id !== subId);
    db.signatureViews = db.signatureViews.filter((v) => v.submission_id !== subId);
    db.submissions = db.submissions.filter((s) => s.id !== subId);
  }

  // The one prospect a write is for, with its version checked. → { p } or { status }
  function lockFor(db, id, version) {
    const p = db.prospects.find((x) => x.id === id);
    if (!p) return st('not_found');
    if (version !== null && version !== undefined && p.version !== version) return st('stale');
    return { p };
  }
  const bookingJson = (b) => (b ? {
    id: b.id, status: b.status, class_id: b.class_id, class_name: b.class_name, date: b.on_date, starts_at: hhmm(b.starts_at), ends_at: hhmm(b.ends_at),
    class_running: classRan(b),
  } : null);
  const formWithBooking = (db, formId, code) => db.forms.some((f) => f.id === formId && f.location_code === code && f.status === 'live'
    && (f.published ?? []).some((e) => e.type === 'booking'));
  const okDate = (d, lo, hi) => d >= lo && d <= hi;

  const handlers = {
    prospects_list(db, a, ctx) {
      if (!LOCATION_CODES.includes(a.p_location_code)) return st('invalid');
      purge(db);
      seedStatuses(db, a.p_location_code);
      const now = nowLocal();
      const list = db.prospects
        .filter((p) => p.location_code === a.p_location_code)
        .map((p) => ({ p, at: db.submissions.find((x) => x.id === p.submission_id)?.created_at ?? p.created_at }))
        // newest sign-up first (like 0010: by the family's sign-up time)
        .sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : x.p.child_index - y.p.child_index))
        .map(({ p }) => {
          const s = db.submissions.find((x) => x.id === p.submission_id);
          const b = bookingOf(db, p);
          const builtin = builtinOf(db, p.status_id);
          return {
            id: p.id, version: p.version, family_id: p.submission_id, child_first_name: p.child_first_name, parent_name: s?.parent_name ?? '',
            status_id: p.status_id, follow_up_on: p.follow_up_on, joined_on: p.joined_on, created_at: p.created_at, signed_up_at: s?.created_at ?? p.created_at,
            checked_in: Boolean(p.checked_in_at),
            opened_by_me: db.opens.some((o) => o.prospect_id === p.id && o.staff === ctx.actorName),
            booking: bookingJson(b),
            ask_came: Boolean(b) && b.status === 'booked' && !p.checked_in_at && !['came', 'no_show', 'joined', 'not_interested'].includes(builtin ?? '')
              && `${b.on_date} ${hhmm(b.ends_at)}` < now && classRan(b),
          };
        });
      return { status: 'ok', today: today(), prospects: list };
    },

    prospects_search(db, a) {
      const text = String(a.p_text ?? '').trim().toLowerCase();
      const digits = String(a.p_text ?? '').replace(/[^0-9]/g, '');
      if (!a.p_location_code || text.length < 2 || text.length > 80) return st('invalid');
      const ids = db.prospects.filter((p) => p.location_code === a.p_location_code).filter((p) => {
        const s = db.submissions.find((x) => x.id === p.submission_id);
        return p.child_first_name.toLowerCase().includes(text) || (s?.parent_name ?? '').toLowerCase().includes(text)
          || (digits.length >= 4 && (s?.parent_phone ?? '').replace(/[^0-9]/g, '').includes(digits));
      }).map((p) => p.id);
      return { status: 'ok', ids };
    },

    prospects_get(db, a) {
      const p = db.prospects.find((x) => x.id === a.p_prospect_id);
      if (!p) return st('not_found');
      const s = db.submissions.find((x) => x.id === p.submission_id);
      const f = db.forms.find((x) => x.id === s.form_id);
      return {
        status: 'ok',
        prospect: {
          id: p.id, version: p.version, location_code: p.location_code, family_id: p.submission_id, child_first_name: p.child_first_name,
          child_age: p.child_age, status_id: p.status_id, follow_up_on: p.follow_up_on, joined_on: p.joined_on, checked_in_at: p.checked_in_at,
          checked_in_by_name: p.checked_in_by_name, parent_name: s.parent_name, parent_phone: s.parent_phone, parent_email: s.parent_email,
          form_id: f?.id ?? null, form_name: f?.name ?? '', source: s.source, entered_by: s.entered_by, signed_up_at: s.created_at, signed_at: s.signed_at,
          has_signature: s.signature !== null, fields: s.fields, answers: s.answers, booking: bookingJson(bookingOf(db, p)),
          siblings: db.prospects.filter((x) => x.submission_id === p.submission_id && x.id !== p.id).sort((x, y) => x.child_index - y.child_index)
            .map((x) => ({ id: x.id, child_first_name: x.child_first_name, child_age: x.child_age, status_id: x.status_id })),
          notes: db.notes.filter((n) => n.prospect_id === p.id).sort((x, y) => (x.created_at < y.created_at ? 1 : -1))
            .map((n) => ({ id: n.id, body: n.body, follow_up_on: n.follow_up_on, created_at: n.created_at, created_by_name: n.created_by_name })),
          activity: db.activity.filter((x) => x.prospect_id === p.id).sort((x, y) => y.id - x.id)
            .map((x) => ({ kind: x.kind, detail: x.detail, created_at: x.created_at, created_by_name: x.created_by_name })),
        },
      };
    },

    prospects_badge(db, a, ctx) {
      const count = db.prospects.filter((p) => (a.p_location_code === null || p.location_code === a.p_location_code)
        && ['new', 'booked'].includes(builtinOf(db, p.status_id)) && !db.opens.some((o) => o.prospect_id === p.id && o.staff === ctx.actorName)).length;
      return { status: 'ok', count };
    },

    prospects_for_bookings(db, a) {
      if (!Array.isArray(a.p_booking_ids) || a.p_booking_ids.length > 500) return st('invalid');
      const prospects = [];
      for (const id of a.p_booking_ids) {
        const b = db.bookings.find((x) => x.id === id);
        const p = b && db.prospects.find((x) => x.submission_id === b.submission_id && x.child_index === b.child_index);
        if (p) prospects.push({ booking_id: b.id, prospect_id: p.id, version: p.version, checked_in: Boolean(p.checked_in_at), builtin: builtinOf(db, p.status_id) });
      }
      return { status: 'ok', prospects };
    },

    prospects_set_status(db, a, ctx) {
      if (a.p_prospect_id === null || a.p_expected_version === null || a.p_status_id === null) return st('invalid');
      const l = lockFor(db, a.p_prospect_id, a.p_expected_version);
      if (l.status) return l;
      const { p } = l;
      const s = db.statuses.find((x) => x.id === a.p_status_id && x.location_code === p.location_code);
      if (!s) return st('stale');
      const signedUp = db.submissions.find((x) => x.id === p.submission_id)?.created_at ?? p.created_at;
      const joinedFloor = addDays(signedUp.slice(0, 10), -1);
      if ((s.builtin === 'joined') !== (a.p_joined_on !== null) || (a.p_joined_on !== null && !okDate(a.p_joined_on, joinedFloor, today()))) return st('invalid');
      const from = db.statuses.find((x) => x.id === p.status_id)?.name;
      const changed = p.status_id !== s.id || p.joined_on !== a.p_joined_on;
      updateRow(p, { status_id: s.id, joined_on: a.p_joined_on, last_activity_at: stamp() }, ctx);
      if (changed) log(db, p, 'status', { from, to: s.name, joined_on: a.p_joined_on }, ctx);
      return { status: 'ok', id: p.id, version: p.version };
    },

    prospects_add_note(db, a, ctx) {
      const body = String(a.p_body ?? '').replace(/\r\n?/g, '\n').trim();
      if (a.p_prospect_id === null || a.p_set_follow_up === null || longTextProblem(body, 1000)
        || (a.p_follow_up_on !== null && (!a.p_set_follow_up || !okDate(a.p_follow_up_on, today(), addDays(today(), 366))))) return st('invalid');
      const l = lockFor(db, a.p_prospect_id, null);
      if (l.status) return l;
      const { p } = l;
      db.notes.push({ id: newId(), prospect_id: p.id, location_code: p.location_code, body, follow_up_on: a.p_set_follow_up ? a.p_follow_up_on : null, created_at: stamp(), created_by_name: ctx.actorName });
      updateRow(p, a.p_set_follow_up ? { follow_up_on: a.p_follow_up_on, last_activity_at: stamp() } : { last_activity_at: stamp() }, ctx);
      return { status: 'ok', id: p.id, version: p.version };
    },

    prospects_set_follow_up(db, a, ctx) {
      if (a.p_prospect_id === null || a.p_expected_version === null
        || (a.p_follow_up_on !== null && !okDate(a.p_follow_up_on, today(), addDays(today(), 366)))) return st('invalid');
      const l = lockFor(db, a.p_prospect_id, a.p_expected_version);
      if (l.status) return l;
      updateRow(l.p, { follow_up_on: a.p_follow_up_on, last_activity_at: stamp() }, ctx);
      log(db, l.p, 'follow_up', { on: a.p_follow_up_on }, ctx);
      return { status: 'ok', id: l.p.id, version: l.p.version };
    },

    prospects_mark_opened(db, a, ctx) {
      if (a.p_prospect_id === null) return st('invalid');
      if (!db.prospects.some((p) => p.id === a.p_prospect_id)) return st('not_found');
      if (!db.opens.some((o) => o.prospect_id === a.p_prospect_id && o.staff === ctx.actorName)) db.opens.push({ prospect_id: a.p_prospect_id, staff: ctx.actorName, opened_at: stamp() });
      return st('ok');
    },

    prospects_check_in(db, a, ctx) {
      if (a.p_prospect_id === null || a.p_expected_version === null || a.p_came === null || a.p_after_class === null || (!a.p_came && !a.p_after_class)) return st('invalid');
      const l = lockFor(db, a.p_prospect_id, a.p_expected_version);
      if (l.status) return l;
      const { p } = l;
      const b = bookingOf(db, p);
      if (!b || b.status !== 'booked' || p.checked_in_at || !classRan(b) || ['joined', 'not_interested'].includes(builtinOf(db, p.status_id))
        || (!a.p_after_class && b.on_date !== today()) || (a.p_after_class && `${b.on_date} ${hhmm(b.ends_at)}` >= nowLocal())) return st('not_allowed');
      const previous = { previous_status_id: p.status_id, previous_follow_up_on: p.follow_up_on };
      if (a.p_came) {
        updateRow(p, { status_id: statusOf(db, p.location_code, 'came'), checked_in_at: stamp(), checked_in_by_name: ctx.actorName, last_activity_at: stamp() }, ctx);
        log(db, p, a.p_after_class ? 'came' : 'check_in', { class_name: b.class_name, date: b.on_date }, ctx);
      } else {
        updateRow(p, { status_id: statusOf(db, p.location_code, 'no_show'), follow_up_on: addDays(today(), 1), last_activity_at: stamp() }, ctx);
        log(db, p, 'no_show', { class_name: b.class_name, date: b.on_date }, ctx);
      }
      return { status: 'ok', id: p.id, version: p.version, ...previous };
    },

    prospects_undo_check_in(db, a, ctx) {
      if (a.p_prospect_id === null || a.p_expected_version === null || a.p_previous_status_id === null) return st('invalid');
      const l = lockFor(db, a.p_prospect_id, a.p_expected_version);
      if (l.status) return l;
      const { p } = l;
      const now = builtinOf(db, p.status_id);
      const prev = db.statuses.find((s) => s.id === a.p_previous_status_id && s.location_code === p.location_code);
      if (!['came', 'no_show'].includes(now) || !prev || ['joined', 'came', 'no_show'].includes(prev.builtin ?? '')) return st('not_allowed');
      updateRow(p, { status_id: prev.id, checked_in_at: null, checked_in_by_name: null, follow_up_on: now === 'no_show' ? a.p_previous_follow_up_on : p.follow_up_on }, ctx);
      log(db, p, 'undo_check_in', {}, ctx);
      return { status: 'ok', id: p.id, version: p.version };
    },

    prospects_open_times(db, a) {
      if (a.p_prospect_id === null || a.p_from === null || a.p_to === null || a.p_to < a.p_from) return st('invalid');
      const p = db.prospects.find((x) => x.id === a.p_prospect_id);
      if (!p) return st('not_found');
      const best = new Map();
      for (const f of db.forms.filter((x) => formWithBooking(db, x.id, p.location_code) && db.offers.some((o) => o.form_id === x.id))) {
        for (const t of times(db, f.id, a.p_from, a.p_to)) {
          const key = `${t.class_id}|${t.date}|${t.starts_at}`;
          if (!best.has(key) || best.get(key).spots_left < t.spots_left) best.set(key, { form_id: f.id, ...t });
        }
      }
      return { status: 'ok', times: [...best.values()].sort((x, y) => (x.date + x.starts_at + x.class_name < y.date + y.starts_at + y.class_name ? -1 : 1)) };
    },

    prospects_book_time(db, a, ctx) {
      if ([a.p_prospect_id, a.p_expected_version, a.p_form_id, a.p_class_id, a.p_date, a.p_starts_at].some((v) => v === null)) return st('invalid');
      const l = lockFor(db, a.p_prospect_id, a.p_expected_version);
      if (l.status) return l;
      const { p } = l;
      if (p.checked_in_at) return st('not_allowed');
      if (!formWithBooking(db, a.p_form_id, p.location_code)) return st('invalid');
      const old = bookingOf(db, p);
      const had = Boolean(old) && old.status === 'booked';
      if (old) db.bookings = db.bookings.filter((b) => b.id !== old.id); // its spot is free before re-counting
      const t = times(db, a.p_form_id, a.p_date, a.p_date).find((x) => x.class_id === a.p_class_id && x.starts_at === hhmm(a.p_starts_at));
      if (!t) return st('time_taken'); // the fake transaction is dropped: the old row comes back
      const row = insertRow(db.bookings, {
        id: newId(), submission_id: p.submission_id, form_id: a.p_form_id, location_code: p.location_code, class_id: a.p_class_id, class_name: t.class_name,
        on_date: a.p_date, starts_at: `${hhmm(a.p_starts_at)}:00`, ends_at: `${t.ends_at}:00`, child_index: p.child_index, status: 'booked',
      }, ctx);
      afterBooking(db, row, ctx);
      log(db, p, had ? 'changed_time' : 'booked', {
        class_name: t.class_name, date: a.p_date, starts_at: hhmm(a.p_starts_at),
        from: had ? { class_name: old.class_name, date: old.on_date, starts_at: hhmm(old.starts_at) } : null,
      }, ctx);
      updateRow(p, { last_activity_at: stamp() }, ctx);
      return { status: 'ok', id: p.id, version: p.version };
    },

    prospects_cancel_time(db, a, ctx) {
      if (a.p_prospect_id === null || a.p_expected_version === null) return st('invalid');
      const l = lockFor(db, a.p_prospect_id, a.p_expected_version);
      if (l.status) return l;
      const { p } = l;
      const b = bookingOf(db, p);
      if (!b || b.status !== 'booked' || p.checked_in_at) return st('not_allowed');
      updateRow(b, { status: 'cancelled' }, ctx);
      afterBooking(db, b, ctx);
      log(db, p, 'cancelled_time', { class_name: b.class_name, date: b.on_date, starts_at: hhmm(b.starts_at) }, ctx);
      updateRow(p, { last_activity_at: stamp() }, ctx);
      return { status: 'ok', id: p.id, version: p.version, cancelled: { form_id: b.form_id, class_id: b.class_id, date: b.on_date, starts_at: hhmm(b.starts_at) } };
    },

    prospect_statuses_add(db, a, ctx) {
      const name = cleanText(a.p_name ?? '');
      if (!LOCATION_CODES.includes(a.p_location_code) || textProblem(name, 40) || !['stage', 'exit'].includes(a.p_kind) || !PROSPECT_COLORS.includes(a.p_color)) return st('invalid');
      seedStatuses(db, a.p_location_code);
      const mine = db.statuses.filter((s) => s.location_code === a.p_location_code);
      if (mine.length >= 30) return st('invalid');
      if (mine.some((s) => s.name.toLowerCase() === name.toLowerCase())) return st('duplicate_name');
      const position = mine.length ? Math.max(...mine.map((s) => s.position)) + 1 : 0;
      const row = insertRow(db.statuses, { id: newId(), location_code: a.p_location_code, name, kind: a.p_kind, position, color: a.p_color, builtin: null }, ctx);
      return { status: 'ok', id: row.id, version: row.version };
    },

    prospect_statuses_update(db, a, ctx) {
      const name = cleanText(a.p_name ?? '');
      if (a.p_status_id === null || a.p_expected_version === null || textProblem(name, 40) || !['stage', 'exit'].includes(a.p_kind) || !PROSPECT_COLORS.includes(a.p_color)) return st('invalid');
      const s = db.statuses.find((x) => x.id === a.p_status_id);
      if (!s) return st('not_found');
      if (s.version !== a.p_expected_version) return st('stale');
      if (s.builtin && a.p_kind !== s.kind) return st('not_allowed');
      if (db.statuses.some((x) => x.location_code === s.location_code && x.id !== s.id && x.name.toLowerCase() === name.toLowerCase())) return st('duplicate_name');
      updateRow(s, { name, kind: a.p_kind, color: a.p_color }, ctx);
      return { status: 'ok', id: s.id, version: s.version };
    },

    prospect_statuses_reorder(db, a) {
      const exp = a.p_expected_ids ?? [];
      const next = a.p_new_ids ?? [];
      if (!a.p_location_code || exp.length !== next.length || next.length > 30 || new Set(next).size !== next.length || [...exp].sort().join() !== [...next].sort().join()) return st('invalid');
      const order = db.statuses.filter((s) => s.location_code === a.p_location_code).sort((x, y) => x.position - y.position || (x.id < y.id ? -1 : 1)).map((s) => s.id);
      if (order.join() !== exp.join()) return st('stale');
      next.forEach((id, i) => {
        db.statuses.find((s) => s.id === id).position = i;
      });
      return st('ok');
    },

    prospect_statuses_delete(db, a, ctx) {
      if (a.p_status_id === null || a.p_expected_version === null || a.p_expected_count === null || a.p_expected_count < 0) return st('invalid');
      const s = db.statuses.find((x) => x.id === a.p_status_id);
      if (!s) return st('not_found');
      if (s.version !== a.p_expected_version) return st('stale');
      if (s.builtin) return st('not_allowed');
      const people = db.prospects.filter((p) => p.status_id === s.id);
      if (people.length !== a.p_expected_count) return st('stale');
      const target = db.statuses.find((x) => x.id === a.p_move_to_id && x.location_code === s.location_code && x.id !== s.id);
      if (people.length > 0 && !target) return st('invalid');
      for (const p of people) updateRow(p, { status_id: target.id, joined_on: target.builtin === 'joined' ? today() : null, last_activity_at: stamp() }, ctx);
      db.statuses = db.statuses.filter((x) => x.id !== s.id);
      return { status: 'ok', moved: people.length };
    },

    prospects_delete(db, a) {
      if (a.p_prospect_id === null || a.p_expected_version === null) return st('invalid');
      const l = lockFor(db, a.p_prospect_id, a.p_expected_version);
      if (l.status) return l;
      const { p } = l;
      const others = db.prospects.some((x) => x.submission_id === p.submission_id && x.id !== p.id);
      if (others) {
        db.bookings = db.bookings.filter((b) => !(b.submission_id === p.submission_id && b.child_index === p.child_index));
        removeProspect(db, p.id);
      } else {
        removeFamily(db, p.submission_id);
      }
      return { status: 'ok', family_removed: !others };
    },
  };

  // = 0010 section 12, plus made-up samples so every stage has someone in preview.
  function backfill(db, { samples = false } = {}) {
    for (const code of LOCATION_CODES) seedStatuses(db, code);
    for (const s of db.submissions) {
      afterSubmission(db, s, { actorName: 'Preview' });
      for (const b of db.bookings.filter((x) => x.submission_id === s.id)) afterBooking(db, b, { actorName: 'Preview' });
    }
    if (!samples) return;
    const ctx = { actorName: 'Front Desk' };
    // A few more made-up Worcester families (no free class), so every stage has someone.
    const form = db.forms.find((f) => f.location_code === 'worcester' && f.status === 'live');
    const daysAgo = (n) => new Date(new Date(stamp()).getTime() - n * 86400000).toISOString();
    const family = (parent, phone, kids, ago) => {
      if (!form) return [];
      const sub = insertRow(db.submissions, {
        id: newId(), form_id: form.id, location_code: 'worcester', published_version: form.published_version, fields: JSON.parse(JSON.stringify(form.published)),
        answers: { parent_name: parent, parent_phone: phone, parent_email: `${parent.split(' ')[0].toLowerCase()}@example.com`, waiver: true },
        parent_name: parent, parent_phone: phone, parent_email: `${parent.split(' ')[0].toLowerCase()}@example.com`,
        children: kids.map(([first_name, age]) => ({ first_name, age })), signature: db.submissions.find((x) => x.signature)?.signature ?? null, signed_at: daysAgo(ago), entered_by: null, source: 'public', submission_key: newId(),
      }, { actorName: 'Preview' });
      sub.created_at = daysAgo(ago);
      afterSubmission(db, sub, { actorName: 'Preview' });
      return db.prospects.filter((x) => x.submission_id === sub.id);
    };
    const named = (code, name) => db.statuses.find((x) => x.location_code === code && x.name === name)?.id;
    const [liam] = family('Dan Park', '508-555-0161', [['Liam', 6]], 0);
    const [ethan] = family('Lisa Brown', '508-555-0188', [['Ethan', 9]], 12);
    const [owen] = family('Pat Diaz', '508-555-0123', [['Owen', 8]], 20);
    const [mia] = family('Sara Smith', '508-555-0170', [['Mia', 7]], 9);
    const [ruby] = family('Jo Allen', '508-555-0145', [['Ruby', 11]], 5);
    void liam;
    if (ethan) updateRow(ethan, { status_id: statusOf(db, 'worcester', 'no_show'), follow_up_on: addDays(today(), -2) }, ctx);
    if (owen) updateRow(owen, { status_id: statusOf(db, 'worcester', 'joined'), joined_on: addDays(today(), -14) }, ctx);
    if (mia) updateRow(mia, { status_id: statusOf(db, 'worcester', 'came'), follow_up_on: addDays(today(), 2) }, ctx);
    if (ruby) {
      updateRow(ruby, { status_id: named('worcester', 'Contacted'), follow_up_on: today() }, ctx);
      db.notes.push({ id: newId(), prospect_id: ruby.id, location_code: 'worcester', body: 'Mom asked about the Saturday class. Call back today after 3.', follow_up_on: today(), created_at: daysAgo(1), created_by_name: 'Front Desk' });
    }
    const byChild = (name) => db.prospects.find((p) => p.child_first_name === name);
    const rohan = byChild('Rohan');
    if (rohan) {
      updateRow(rohan, { status_id: db.statuses.find((x) => x.location_code === rohan.location_code && x.name === 'Contacted').id, follow_up_on: today() }, ctx);
      db.notes.push({ id: newId(), prospect_id: rohan.id, location_code: rohan.location_code, body: 'Left a voicemail. Dad works evenings — try before 3.', follow_up_on: today(), created_at: stamp(), created_by_name: 'Front Desk' });
    }
  }

  return { handlers, afterSubmission, afterBooking, backfill, purge };
}
