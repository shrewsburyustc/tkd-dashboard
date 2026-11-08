# CONTRACT 0045 — `calendar_items(p_from, p_to)`

The one read-only database function the Calendar uses to show every other section's dated things. Rulebook v0.645 (Jeffrey 2026-11-06: "B: one reader", "A: show them", "OK, build it"). Plan: `TKD-Calendar-AllEvents-Plan.md`. Migration number **0045**, reserved by Main (CLAUDE.md row). Two people build against this file at the same time — the database half (`supabase/…`) and the app half (`src/…`) — so **change it only by telling the other side**.

## The call

`public.calendar_items(p_from date, p_to date) returns jsonb` — security definer, `set search_path = ''`, fully qualified names, **read-only (no insert/update/delete, no purge, no change_log)**.

- First line of the body: `has_data_access()` — false → `{"status":"no_access"}`.
- `p_from` or `p_to` null, `p_to < p_from`, or `p_to - p_from > 62` (at most 63 days) → `{"status":"invalid"}`.
- Otherwise `{"status":"ok","items":[ … ]}`, items sorted by `date`, then `start` (all-day first), then `kind`, then `id`. Dates are Massachusetts days.
- `revoke all … from public, anon, authenticated, service_role`, then `grant execute … to authenticated` only. **Nothing for anon.** Staff and admins both may call it (like `prospects_list`).

## One item

Every key is always present (`null` when it doesn't apply). Times are `'HH:MM'` (24 hour).

| key | meaning |
|---|---|
| `kind` | `colorbelt_event` · `colorbelt_private` · `star_event` · `star_private` · `camp_day` · `bb_day` · `signup` · `deadline` |
| `id` | text, unique inside one answer (see below) |
| `date` | `'YYYY-MM-DD'` |
| `start`, `end` | `'HH:MM'` or `null`; both null = all day |
| `location_code` | `'worcester'`, `'shrewsbury'`, or `null` = both schools |
| `title` | the event / camp / cycle / form name (never a child's name) |
| `child` | `"Ava N."` (child's first name + initial of the child's own last name; the parent's last initial for sign-ups before last names were asked; first name alone if there is neither) or `null` |
| `what` | `deadline`: `registration_closes` · `signup_opens` · `signup_closes` · `early_price_ends` · `applications_due` · `submissions_due`; `bb_day`: the testing day's own name; else `null` |
| `place` | `bb_day` with a free-text place: that text; else `null` |
| `opens` | where a click goes: `colorbelt_event` · `colorbelt_private` · `star_event` · `star_private` · `camp` · `bb_cycle` · `prospect` |
| `ref_id` | the id to open (see below) |
| `event_id` | `star_private` only: the Star event's id; else `null` |

## What each kind returns

| kind | from | date and times | school | title / child / ref |
|---|---|---|---|---|
| `colorbelt_event` | `testing_events` | `testing_date`; start = earliest `testing_event_classes.start_time`, end = latest `end_time` (both null with no classes) | its `location_code` | title = `name`; id/ref_id = event id; opens `colorbelt_event` |
| `colorbelt_private` | `testing_private`, `status = 'active'` | `private_date`; start = `private_time`, end null | its `location_code` | title = `'Private'`; child "Ava N."; id/ref_id = row id; opens `colorbelt_private` |
| `star_event` | `star_events` | `testing_date`; `start_time`, `end_time` (null when none) | null (Star is joint) | title = `name`; id/ref_id = event id; opens `star_event` |
| `star_private` | `star_candidates` with `private_on` set and `status = 'active'` (not withdrawn) | `private_on`; start = `private_time`, end null | the candidate's `location_code` | title = `'Private'`; child "Leo N."; id/ref_id = candidate id; `event_id` = its Star event; opens `star_private` |
| `camp_day` | `camp_days` joined to `camps` | `camp_days.day`; the camp's daily `start_time`/`end_time` | the camp's `location_code`, or null when `both_schools` | title = camp name; id = `<camp id>:<day>`; ref_id = camp id; opens `camp` |
| `bb_day` | `bb_cycle_days` joined to `bb_cycles` | `day_date`; start = `start_time`, end = the second part's end when there is one, else `end_time` | `place_code`, or null for a free-text place (`place` carries it) | title = cycle name; `what` = the day's name; id = day id; ref_id = cycle id; opens `bb_cycle` |
| `signup` | `form_submissions` (+ `forms` for the name, `prospects` for the child) — **one item per prospect (child)** | the Massachusetts day of `created_at` | the sign-up's `location_code` | title = the form's name; child "Ava N."; id = prospect id; ref_id = prospect id; opens `prospect` |
| `deadline` | `testing_events.auto_close_on` (`registration_closes`), `star_events.auto_close_on` (`registration_closes`), `camps.signup_opens_on` / `signup_closes_on` / `early_until` (`signup_opens` / `signup_closes` / `early_price_ends`), `bb_cycles.application_due` / `submissions_due` (`applications_due` / `submissions_due`) | that date, all day (only when the column is set and falls in the range) | its section's school rule above (Star: null; a Black Belt cycle: null) | title = the source's name; id = `<source id>:<what>`; ref_id = the source's id; opens = its section's (`colorbelt_event`, `star_event`, `camp`, `bb_cycle`) |

**Never returned:** dates of birth, ages, phone, email, address, form answers, notes, payments, last names, signatures, a child's full name, Finance. Withdrawn / cancelled private tests, and any private test whose event or candidate is gone, are left out.

## Where the app half uses it

- `src/lib/calendar/api.js`: `loadCalendarItems({ from, to })` → `{ status: 'ok', items }` (camelCase: `locationCode`, `refId`, `eventId`) · `'no_access'` · `'error'`. The old `loadTestingEvents()` stub goes.
- A source that fails (`'error'`) never breaks the Calendar: the rest shows, with a gray line in the day panel — "Couldn't load the other sections' dates." (as follow-ups, v0.615).
- The preview's fake database answers the same call from its own file (`src/lib/mockCalendar.js`) with sample items shaped exactly as above.

## Tests the database half must have (`supabase/tests/0045_tests.sql`, PGlite `step0045`)

Access (locked / no access → `no_access`; anon can't execute); the range rules; each kind in and out (active vs cancelled / withdrawn private tests; both-schools camps and Star → null school; a Black Belt day with a free-text place; a session on the edge of a Massachusetts day); children only as initials and nothing private in the text of the answer; every deadline kind; sort order; that calling it writes nothing (`change_log` and every touched table unchanged).
