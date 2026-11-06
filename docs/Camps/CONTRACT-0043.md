# CONTRACT-0043 — Camps Fill in (database ↔ app)

What the migration `supabase/migrations/0043_camps_fill_in.sql` provides and the app (`src/lib/camps/campsApi.js`, fake store `src/lib/mockCamps.js`) calls. Rulebook v0.740 (when it works) and v0.741 (screens, words). Plan: `TKD-Camps-FillIn-Plan.md`. Both sides follow this file; a change to it is made here first.

## Tables

- `camp_signups.source text not null default 'form'`, check `source in ('form','desk')`.
- `camp_signups.entered_by text null` — the staff member's name (`public.change_log_actor_name()`) for a desk sign-up, null for the family form. Check: `(source = 'desk') = (entered_by is not null)`.
- Existing rows become `source = 'form'`, `entered_by = null` (the default; no backfill step needed).
- Both columns are logged by the existing `camp_signups_log()` like the other columns (check it writes the new ones, or add them).

## Functions (all `security definer`, `set search_path = ''`, fully qualified names, check `public.has_data_access()` first → `{status:'no_access'}`; `revoke all … from public, anon, authenticated, service_role`; `grant execute … to authenticated`; nothing to anon)

### `public.camp_staff_form(p_camp_id uuid) returns jsonb`
What the Fill in dialog needs to draw the camp's family form — **the same JSON shape `public.camp_public_camp(p_code)` returns** (0013:4782, read it), so the family page's parts can be reused unchanged, plus:
- `fill_in`: `'open'` (sign-up open: staff and admins), `'admin_only'` (sign-up not open yet / closed by hand / past the closing date — only admins may fill in), `'finished'` (after the last day: nobody), from `public.camp_signup_state(camp, public.testing_today())`;
- `signup_state`: that function's raw answer (`open`, `not_open_yet`, `closed`, `finished`) and `closes_on` / `closed_by_hand`, so the staff tip can say which words.
Answers: `{status:'ok', camp: …}`, `{status:'not_found'}`, `{status:'no_access'}`. Read only, not logged.

### `public.camp_staff_signup(p_camp_id uuid, p_submission_id uuid, p_children jsonb, p_parent_name text, p_parent_phone text, p_parent_relation text, p_emergency_name text, p_emergency_phone text, p_emergency_relation text, p_paying_by text, p_acknowledged boolean, p_signature text, p_ack_version text, p_waiver_version text, p_expected_total_cents integer) returns jsonb`
Same arguments as `camp_public_signup` (0013:5092) except the camp is by id and there is no client key. It runs **the same core** as the family form (`camp_public_signup_core`, current version 0022:1763), which this migration recreates with two more inputs `p_source text` and `p_entered_by text` (the public wrapper passes `'form', null` — the family form behaves exactly as today). For `'desk'` the core:
- skips the per-client-key rule and the 30-per-hour client limit (the staff path has no client key, as `forms_staff_submit` 0009 has none), keeps every other check (shape, ages, waiver version, extras rules, price_changed, camp_changed, duplicate detection, up to 3 children, same submission id → first answer again);
- open/closed (v0.740 C): sign-up open → allowed; not open yet / closed / past closing date → allowed only if `public.is_admin()` (together with has_data_access), else `{status:'admin_only', signup_state, closes_on}`; finished → `{status:'finished'}`;
- writes `source='desk'`, `entered_by = public.change_log_actor_name()`, `tkd.action = 'camp_staff_signup'`, actor = the staff member (not 'Family form').
Answers: the same as the family form's `ok` (with the reference, the total and the camper ids it returns today), `price_changed`, `camp_changed`, `invalid`, `not_found`, `finished`, plus `admin_only` and `no_access`. No `camp_public_attempts` row for desk sign-ups.

### Readers that gain the two columns
- `public.camp_camper_detail(uuid)` (current version: find it — 0022/0033): adds `source` and `entered_by` of the camper's sign-up.
- `public.camp_camper_history(uuid)` (0033): history rows of a desk sign-up show the staff member as who; `entered_by` reaches the app (no login ids).
Same signatures and grants as today.

## App words (v0.741)
"Signed up at the desk by {entered_by}, {date} · waiver signed on the screen · reference CP-…"; History "Signed up (entered by {entered_by}) · CP-…". Staff tips: "Family sign-up is closed. Ask an admin to fill in for a family." / "The closing date has passed. Ask an admin to fill in for a family." / "This camp is over.".

## Not in 0043
No Finance change (no payment in Fill in). No change for anon or `camps_registrar`. The family form's Function (`functions/_lib/camp.js`) is unchanged.
