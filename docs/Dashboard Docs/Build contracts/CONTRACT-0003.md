# Contract 0003 — Testing → Classes and ranks (phase 1)

The single source of truth for the four parallel builders: **A database**, **B seed**, **C data layer + preview mock**, **D screens**. Follow it exactly so the parts fit. If something here is impossible or contradicts the rulebook, stop and report it — do not improvise.

| Source (in this order of authority) | |
|---|---|
| This contract | wins over everything below for phase 1 |
| Build plan `/home/claude/plans/phase1-plan.md` — **§8 overrides §1–7** | approved v0.55 |
| Rulebook `docs/Dashboard Docs/TKD-Dashboard-Design-Guidelines.md` v0.55 (sections 1–8, 10b rows v0.32–v0.55) | |
| Approved mockup `docs/Testing/Color Belt Testing/TKD-Testing-Classes-Ranks-Mockups.html` (9 screens + the 12 small details) | |
| Handoff `docs/Dashboard Docs/TKD-Dashboard-Handoff.md` §6 (security rules) and §7 (workflow) | |
| Existing code: `supabase/migrations/0001*`, `0002*` (applied to production — **never edit**), `src/` | |

**Working copy:** `/home/claude/work/tkd-dashboard` (local scratch git repo). Do **not** touch remote device folders, Supabase (no connector calls of any kind), or git remotes. Do not commit; the orchestrator commits.

**Audience:** Jeffrey is learning IT. Every new file starts with a header comment (what it is + why it exists); non-obvious lines get short plain-English comments. Readable over clever. No new npm dependencies in the app (`package.json` unchanged).

**Production facts:** Supabase project `tkd-dashboard`, **PostgreSQL 17.11** (column-list `on delete set null (col)` is supported). 0001 + 0002 live. Staff rows: "Main Admin" (admin), "Staff" (shared desk, role `staff`, `is_shared`). The Supabase connector cancels SQL containing `delete` or `drop`, so **0003 is pasted whole into the SQL Editor by Jeffrey** (one transaction). The connector is used later by the orchestrator only for read-only checks.

---

## 0. File ownership (no two builders edit the same file)

| Builder | Owns (creates / edits) | Must not edit |
|---|---|---|
| **A — database** | `supabase/migrations/0003_testing_classes_ranks.sql` · `supabase/tests/0003_tests.sql` · `supabase/tests/0003_fingerprints.sql` · `supabase/tests/pglite/package.json` · `supabase/tests/pglite/run.mjs` · `supabase/tests/pglite/stubs.sql` · `supabase/SETUP.md` (new §10 only) | 0001/0002 files, `supabase/manual/*`, anything in `src/`, `docs/` |
| **B — seed** | `supabase/manual/make_seed.mjs` · `supabase/manual/0003s_export_fixture.json` · `supabase/manual/0003s_seed_from_fixture_NOT_FOR_PRODUCTION.sql` (generated) | everything else. (`0003s_export_query.sql`, `0003s_export_from_old_system.json` and the real `0003s_seed_classes_and_ranks.sql` are produced later by the orchestrator.) |
| **C — data layer + mock** | `src/lib/testing/api.js` · `src/lib/testing/rankOrder.js` · `src/lib/testing/names.js` · `src/lib/testing/useClassesRanks.js` · `src/lib/testing/checks.mjs` · `src/lib/money.js` · `src/lib/mockTesting.js` · `src/lib/mockClient.js` · `src/lib/device.js` | UI files, styles, `supabase/` |
| **D — screens** | everything else in `src/**`: `src/App.jsx` · `src/main.jsx` · `src/components/navItems.js` · `src/components/Toast.jsx` · `src/components/Shell.jsx` (only if needed) · new `src/components/Dialog.jsx`, `RowMenu.jsx`, `ErrorBanner.jsx` · new `src/screens/Testing.jsx` · new `src/screens/testing/*` (`BlockedOnBoth.jsx`, `ClassesRanksTab.jsx`, `ClassBlock.jsx`, `RankRows.jsx`, `RankDialog.jsx`, `ClassDialog.jsx`, `FinalAwardSelect.jsx`, `DeleteDialog.jsx`, `TestingSkeleton.jsx`, `text.js`) · new `src/lib/useShortcutN.js`, `src/lib/useReorderDrag.js`, `src/lib/useRowArrowNav.js` · `src/styles/tokens.css`, `src/styles/app.css`, new `src/styles/testing.css` · `README.md` | files owned by C; **`src/components/AccountDialog.jsx` stays unchanged** (plan §8.9) |
| Orchestrator only | `docs/Dashboard Docs/Build contracts/CONTRACT-0003.md`, `docs/*` rulebook/handoff, git commits | |

Builder D imports C's modules by the exact names in §5. Builder C must not import from `src/screens/**` or `src/components/**`. All user-visible wording lives in D's `src/screens/testing/text.js` (C returns codes, D turns them into words — §7).

---

## 1. Database — `0003_testing_classes_ranks.sql`

### 1.1 General rules (from handoff §6 — non-negotiable)

- Everything in schema `public`, names prefixed `testing_` (tables/functions) or `change_log` (audit). Owner: `postgres` (the SQL Editor role).
- The file is **one transaction** (`begin;` … `commit;`) and **safe to re-run**: `create table if not exists` (constraints inside the `create table`), `create or replace function`, `drop trigger if exists` + `create trigger`, `drop policy if exists` + `create policy`, the circular FK via `alter table … drop constraint if exists …` + `add constraint …`, `insert … on conflict do nothing`.
- **Upgrade over an earlier copy of 0003** (pre-v0.62): after the `create table`, `alter table public.testing_classes add column if not exists final_award_none …`, then `drop constraint if exists` + `add constraint testing_classes_final_award_none_ck`; before the RPCs, `drop function if exists public.testing_add_class(text, text, uuid)` and `public.testing_update_class(uuid, integer, text, uuid)` so no old overload stays callable. The PGlite runner proves it: earlier copy (`supabase/tests/pglite/fixtures/0003_before_v062.sql`, git blob of commit 1c5d03c) + seed, then today's 0003, all rows kept, fingerprints equal a fresh install, all tests pass. *(amended v0.62, security re-check)*
- Every function: `set search_path = ''` and fully qualified names (`public.x`, `auth.uid()`, `pg_catalog` built-ins need no prefix). Every function gets an explicit `revoke execute … from public, anon, authenticated` and, only for the 8 RPCs, `grant execute … to authenticated`.
- `is_admin()` is never a gate on its own; RPCs check `has_data_access()` **first**, then `is_admin()`.
- No write grants and no write policies for any client role. All writes go through the 8 security-definer RPCs.
- File header like 0002's: what / why / what it adds / how to run (SQL Editor, whole file, "Supabase will warn about destructive operations — the words *delete* and *drop* are inside rules and functions; nothing is deleted now") / words used.

### 1.2 `public.locations` (lookup)

| Column | Type | Notes |
|---|---|---|
| `code` | `text` | `constraint locations_pkey primary key`, `constraint locations_code_check check (code in ('worcester','shrewsbury'))` |
| `name` | `text not null` | `constraint locations_name_key unique` |

Rows (in the migration): `('worcester','Worcester')`, `('shrewsbury','Shrewsbury')` — `on conflict (code) do nothing`. No triggers, no audit (changes only by migration). Location is a **filter, not a permission**: both roles see both schools.

### 1.3 `public.testing_classes`

| Column | Type / default | Constraint (exact name) |
|---|---|---|
| `id` | `uuid not null default gen_random_uuid()` | `testing_classes_pkey` primary key |
| `location_code` | `text not null` | `testing_classes_location_fk` foreign key → `public.locations(code)` (default no action); immutable (trigger) |
| `name` | `text not null` | `testing_classes_name_check check (coalesce(public.testing_name_is_valid(name) and name = public.testing_normalize_name(name), false))` |
| `position` | `integer not null` | `testing_classes_position_check check (position >= 0)` |
| `final_award_rank_id` | `uuid null` | see FK below |
| `final_award_none` | `boolean not null default false` | `testing_classes_final_award_none_ck check (not (final_award_none and final_award_rank_id is not null))`; true = "None" (the last rank doesn't promote, on purpose) *(amended v0.62)* |
| `version` | `integer not null default 1` | `testing_classes_version_check check (version >= 1)` |
| `created_at`, `updated_at` | `timestamptz not null default now()` | |
| `created_by`, `updated_by` | `uuid null` | **no FK** (would block deleting auth users); hidden from clients (§1.8) |
| `created_by_name`, `updated_by_name` | `text not null` | snapshot set by trigger (§1.6) |

Table constraints / indexes:

| Name | Definition |
|---|---|
| `testing_classes_location_position_key` | `unique (location_code, position) deferrable initially immediate` |
| `testing_classes_location_lower_name_idx` | `create unique index … on public.testing_classes (location_code, lower(name))` |
| `testing_classes_id_location_key` | `unique (id, location_code)` (non-deferrable — FK target for ranks) |
| `testing_classes_final_award_fk` | `foreign key (final_award_rank_id, location_code) references public.testing_ranks (id, location_code) on delete set null (final_award_rank_id)` — added with `alter table` after `testing_ranks` exists |
| `testing_classes_final_award_idx` | `create index … on public.testing_classes (final_award_rank_id) where final_award_rank_id is not null` |

### 1.4 `public.testing_ranks`

| Column | Type / default | Constraint (exact name) |
|---|---|---|
| `id` | `uuid not null default gen_random_uuid()` | `testing_ranks_pkey` |
| `class_id` | `uuid not null` | immutable (trigger) |
| `location_code` | `text not null` | immutable (trigger) |
| `name` | `text not null` | `testing_ranks_name_check` (same expression as classes) |
| `position` | `integer not null` | `testing_ranks_position_check check (position >= 0)` |
| `early_cents` | `integer not null` | `testing_ranks_early_cents_check check (early_cents between 0 and 100000 and early_cents % 100 = 0)` |
| `day_cents` | `integer not null` | `testing_ranks_day_cents_check` (same rule) |
| `private_cents` | `integer not null` | `testing_ranks_private_cents_check` (same rule) |
| `sparring_gear` | `boolean not null default false` | |
| `version` | `integer not null default 1` | `testing_ranks_version_check check (version >= 1)` |
| `created_at`, `updated_at`, `created_by`, `updated_by`, `created_by_name`, `updated_by_name` | as in classes | |

| Name | Definition |
|---|---|
| `testing_ranks_class_fk` | `foreign key (class_id, location_code) references public.testing_classes (id, location_code) on delete cascade` |
| `testing_ranks_class_position_key` | `unique (class_id, position) deferrable initially immediate` |
| `testing_ranks_class_lower_name_idx` | `create unique index … on public.testing_ranks (class_id, lower(name))` |
| `testing_ranks_id_location_key` | `unique (id, location_code)` (non-deferrable — FK target for final awards) |
| `testing_ranks_location_idx` | `create index … on public.testing_ranks (location_code)` |

"Testing for" is **never stored**. It is derived: a rank tests for the next rank in its class; the last rank tests for the class's final award.

### 1.5 Shared rules (DB, mock and UI all use these exact rules)

**Names** (class and rank names)

1. `null` → invalid.
2. Replace every run of the characters space U+0020, tab U+0009, LF U+000A, CR U+000D, VT U+000B, FF U+000C, no-break space U+00A0 with one space U+0020.
3. Trim leading and trailing spaces.
4. Invalid if the result contains any other control character: U+0001–U+0008, U+000E–U+001F, U+007F–U+009F, **or an invisible format character: U+200B–U+200F, U+202A–U+202E, U+2060–U+2064, U+2066–U+2069, U+FEFF** (zero-width, direction marks/overrides/isolates, byte-order mark). *(amended after security review)*
5. Invalid unless the length is **1–60 characters**, counted in characters (SQL `char_length`; JS `[...s].length`, never `s.length`).
6. The **normalized** name is what gets stored.
7. Uniqueness is case-insensitive: class names unique per school (`lower(name)`), rank names unique per class. Same rank name in another class, or same class name in the other school, is fine.

Exact SQL (Builder A):

```sql
create or replace function public.testing_normalize_name(p_name text)
returns text language sql immutable set search_path = '' as $$
  select case when p_name is null then null
              else btrim(regexp_replace(p_name, '[ \t\n\r\f\v\u00a0]+', ' ', 'g'), ' ') end
$$;

create or replace function public.testing_name_is_valid(p_name text)
returns boolean language sql immutable set search_path = '' as $$
  select p_name is not null
     and char_length(public.testing_normalize_name(p_name)) between 1 and 60
     and public.testing_normalize_name(p_name)
         !~ '[\x01-\x08\x0e-\x1f\x7f-\x9f\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]'
$$;
```

(Amended after security review: the no-break space is written as the escape `\u00a0` instead of the literal invisible character, same meaning; the invisible format characters were added to the bad-character class.)

Exact JS (Builder C, `names.js`): `/[ \t\n\r\f\v ]+/g` → `' '`, then strip leading/trailing `' '`; bad characters `/[\u0001-\u0008\u000e-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/` *(amended after security review)*; duplicate compare with `toLowerCase()`.

**Prices**: whole dollars **$0 – $1,000**, stored as integer cents: `0 ≤ cents ≤ 100000` and `cents % 100 = 0`. All three prices required (never null). Sparring gear: boolean, never null.

**Positions**: dense `0 … n-1` — classes per school, ranks per class. Always renumbered by the server (add = append at `max+1`, or `0` when empty; delete = shift the ones after it down by 1; reorder = rewrite from the given order). Unique constraints are `deferrable initially immediate` so one multi-row `update` can shift positions (checked at end of statement).

**Versions** (stale protection; enforced by the before-write triggers, §1.6):
- Insert: `version = 1` (whatever was supplied); the trigger also sets `created_at = updated_at = now()`, `created_by = updated_by = auth.uid()` and both `*_by_name` to the actor name (supplied values are ignored). *(amended after security review)*
- Update that changes a **content column** → `version = old.version + 1`, `updated_at = now()`, `updated_by = auth.uid()`, `updated_by_name = actor name`. Content columns: classes `name`, `final_award_rank_id`, `final_award_none` *(amended v0.62)*; ranks `name`, `early_cents`, `day_cents`, `private_cents`, `sparring_gear`.
- Update that changes only `position` (or nothing) → `version`, `updated_at`, `updated_by`, `updated_by_name` stay exactly as before (any supplied values are overwritten with the old ones). A reorder never bumps a version.
- `created_at`, `created_by`, `created_by_name` never change after insert.
- An FK `set null` of `final_award_rank_id` (its rank was deleted) is a content change → that class's version goes up by 1.

**Stale**: an RPC returns `stale` whenever what the client last saw differs from the database at the moment of the write (wrong `expected_version`, wrong expected id lists, chosen final-award rank no longer exists, concurrent unique/position conflict, deadlock). `not_found` = the record the call is about no longer exists. The UI treats both the same way (§8).

**Final award**: a class setting with **three states** *(amended v0.62)*: a **rank** (`final_award_rank_id` set, `final_award_none = false`), **None** (`null`, `true`: the last rank doesn't promote on purpose, e.g. Group D and Teen/Adult whose last rank Deputy is Dan-testing practice), or **Not set** (`null`, `false`: undecided, amber reminder). A rank must be of the **same school** and must **not** be one of the class's **own** ranks. Several classes may share the same final-award rank. A None class points at no rank, so it never appears in a delete's lost-award list.

### 1.6 Triggers and their functions

| Trigger (on table) | When | Function | What it does |
|---|---|---|---|
| `testing_classes_before_write` (testing_classes) | `before insert or update for each row` | `public.testing_classes_before_write()` | Version/stamp rules (§1.5). On update: raise if `id`, `location_code` changed (`errcode '23514'`, `constraint 'testing_classes_immutable'`). If `new.final_award_rank_id` is not null and that rank's `class_id = new.id` → raise `errcode '23514'`, `constraint 'testing_classes_final_award_not_own'`, message `final award can't be one of the class's own ranks`. |
| `testing_ranks_before_write` (testing_ranks) | `before insert or update for each row` | `public.testing_ranks_before_write()` | Version/stamp rules. On update: raise if `id`, `class_id` or `location_code` changed (`'23514'`, `constraint 'testing_ranks_immutable'`). |
| `testing_classes_log` (testing_classes) | `after insert or update or delete for each row` | `public.change_log_write()` | Writes one change_log row (§1.7). |
| `testing_ranks_log` (testing_ranks) | same | `public.change_log_write()` | same |
| `change_log_append_only` (change_log) | `before update or delete for each row` | `public.change_log_refuse_change()` | `raise exception 'change_log is append-only'` |
| `change_log_no_truncate` (change_log) | `before truncate for each statement` | `public.change_log_refuse_change()` | same |
| `testing_classes_no_truncate` (testing_classes) | `before truncate for each statement` | `public.testing_refuse_truncate()` | `raise exception '% can''t be truncated (it would skip the history); remove rows one by one', tg_table_name` *(amended after security review)* |
| `testing_ranks_no_truncate` (testing_ranks) | same | same | same *(amended after security review)* |

Actor name helper — `public.change_log_actor_name() returns text`, `stable security definer`: `coalesce((select s.full_name from public.staff s where s.id = auth.uid()), nullif(current_setting('tkd.actor_label', true), ''), 'Database admin')`. Used for `created_by_name`/`updated_by_name` and `change_log.actor_name`. (Needed because staff can read only their own staff row.)

`change_log_write()` and `change_log_actor_name()` are `security definer`; the two `before_write` functions, `change_log_refuse_change()` and `testing_refuse_truncate()` are invoker functions. All have `set search_path = ''` and execute revoked from `public, anon, authenticated, service_role`. *(amended after security review)* Extra internal helpers are allowed only if named `testing_*` and following the same rules (built: `testing_cents_is_valid(integer)`, `testing_ids_are_valid(uuid[])`). Tables that `change_log_write()` is attached to must have a uuid `id` column. 0003 creates **18** functions. *(amended after security review)*

### 1.7 `public.change_log` (dashboard-wide audit)

| Column | Type | Notes |
|---|---|---|
| `id` | `bigint generated always as identity` | `change_log_pkey`; sequence `public.change_log_id_seq` |
| `occurred_at` | `timestamptz not null default now()` | |
| `actor_id` | `uuid null` | `auth.uid()` (null in SQL Editor) — no FK |
| `actor_name` | `text not null` | `public.change_log_actor_name()` |
| `session_id` | `uuid null` | `public.current_session_id()` (0001) |
| `batch_id` | `uuid null` | `nullif(current_setting('tkd.batch_id', true), '')::uuid` |
| `action` | `text not null` | `coalesce(nullif(current_setting('tkd.action', true), ''), 'manual')` |
| `table_name` | `text not null` | `TG_TABLE_NAME` |
| `record_id` | `uuid not null` | the row's `id` |
| `location_code` | `text null` | the row's `location_code` if it has one (read via `to_jsonb(row)->>'location_code'`) |
| `op` | `text not null` | `change_log_op_check check (op in ('insert','update','delete'))` |
| `before` | `jsonb null` | insert: null · update: **only changed columns**, old values · delete: **full row** |
| `after` | `jsonb null` | insert: full row · update: only changed columns, new values · delete: null |

Indexes: `change_log_table_record_idx (table_name, record_id)`, `change_log_occurred_at_idx (occurred_at)`, `change_log_batch_idx (batch_id)`.
An update whose old and new rows are identical writes **no** change_log row. Cascaded rank deletes and FK set-null updates are logged by the same triggers, carrying the calling RPC's `action` and `batch_id`.
Comment on the table: "Append-only history of every change. Later sections must exclude sensitive columns (e.g. PIN hashes, medical notes) from before/after." RLS on, **no policies**, no grants (§1.8).

**Action names** (exact): `add_class`, `update_class`, `reorder_classes`, `delete_class`, `add_rank`, `update_rank`, `reorder_ranks`, `delete_rank`, `seed` (seed file), `manual` (anything untagged, e.g. SQL Editor edits). Undo calls use the RPC they call (Undo of "add rank" logs as `delete_rank`).

### 1.8 RLS, grants and revokes (exact)

```sql
alter table public.locations       enable row level security;
alter table public.testing_classes enable row level security;
alter table public.testing_ranks   enable row level security;
alter table public.change_log      enable row level security;

revoke all on table public.locations, public.testing_classes, public.testing_ranks, public.change_log
  from public, anon, authenticated, service_role;            -- service_role: amended after security review
revoke all on sequence public.change_log_id_seq from public, anon, authenticated, service_role;

grant select (code, name) on public.locations to authenticated;
grant select (id, location_code, name, position, final_award_rank_id, final_award_none, version,   -- final_award_none: amended v0.62
              created_at, updated_at, created_by_name, updated_by_name)
  on public.testing_classes to authenticated;
grant select (id, class_id, location_code, name, position, early_cents, day_cents, private_cents,
              sparring_gear, version, created_at, updated_at, created_by_name, updated_by_name)
  on public.testing_ranks to authenticated;
-- created_by / updated_by (uuids) are NOT granted. change_log: nothing at all.

-- policies (drop policy if exists first):
create policy locations_select_with_access       on public.locations       for select to authenticated using ((select public.has_data_access()));
create policy testing_classes_select_with_access on public.testing_classes for select to authenticated using ((select public.has_data_access()));
create policy testing_ranks_select_with_access   on public.testing_ranks   for select to authenticated using ((select public.has_data_access()));

-- functions: for each of the 8 RPCs
revoke execute on function public.testing_add_class(text, text, uuid, boolean) from public, anon, authenticated, service_role;   -- signature amended v0.62
grant  execute on function public.testing_add_class(text, text, uuid, boolean) to authenticated;
-- … same pair for the other 7 (exact signatures in §2) …
-- for every helper / trigger function: revoke execute … from public, anon, authenticated, service_role; (no grant)
-- service_role (the secret key, never used by the app) gets nothing on any 0003 object (amended after security review)
```

Consequence for the client: `select('*')` fails with permission denied — every read lists its columns (§5.1).

---

## 2. The 8 RPCs

### 2.1 Common pattern (every RPC)

- `language plpgsql volatile security definer set search_path = ''`, `returns jsonb`.
- Returns exactly `{"status": "<status>"}` for every non-ok status (no other keys). Ok shapes below. **JSON keys are snake_case** (the client converts to camelCase in `api.js`).
- Statuses: `ok`, `no_access`, `not_allowed`, `not_found`, `stale`, `duplicate_name`, `invalid`, `not_empty`.
- **Check order** (uniform; per-RPC details in the tables):
  1. `public.has_data_access() is not true` → `no_access`
  2. `public.is_admin() is not true` → `not_allowed`
  3. argument shape (nulls, name rule, price rule, array rules) → `invalid`. Nothing is computed from the arguments (not even name normalization) and nothing is looked up before steps 1–2. *(amended after security review)*
  4. look up the school (no lock), lock the school row, then lock / re-check the class, then the rank(s); target missing → `not_found` *(amended after security review)*
  5. version / expected-state comparisons → `stale` (or `not_empty`)
  6. relational validation (same school, not own rank) → `invalid`; chosen final-award rank missing → `stale`
  7. duplicate name → `duplicate_name`
  8. tag, write, untag, return `ok`
- Tagging: right before writing, `perform set_config('tkd.action', '<action>', true); perform set_config('tkd.batch_id', gen_random_uuid()::text, true);` — after writing, reset both to `''` with `set_config(…, '', true)`. All rows one call writes share one `batch_id`.
- **Locks** ("school lock" = the `public.locations` row): always `for no key update` on parent rows (doesn't block FK key-share checks), `for update` on the row being deleted. Lock order: school → class → rank → other classes (by `id`). **Every** write RPC takes the school lock first (it looks the school up without a lock, locks the `locations` row, then locks and re-checks the class/rank), so **all writes to one school are serialized** and two write RPCs can't deadlock each other. `add_class`/`update_class` additionally lock the chosen final-award rank `for key share` (same school, so already serialized); `delete_class` locks the class's ranks `for update` before comparing the rank and lost-award sets. *(amended after security review)*
- **Error mapping** — the whole body sits in `begin … exception … end` (a failed write rolls back, including the tags):

| Caught | Returns |
|---|---|
| `unique_violation` with constraint `testing_classes_location_lower_name_idx` or `testing_ranks_class_lower_name_idx` (`get stacked diagnostics … constraint_name`) | `duplicate_name` |
| any other `unique_violation` (e.g. position race) | `stale` |
| `foreign_key_violation` | `invalid` (plan §8.10) |
| `check_violation`, `not_null_violation` | `invalid` |
| `deadlock_detected`, `serialization_failure`, `lock_not_available` | `stale` |
| anything else | not caught (client sees an error → "didn't save" handling) |

### 2.2 `testing_add_class(p_location_code text, p_name text, p_final_award_rank_id uuid, p_final_award_none boolean)` — action `add_class` *(amended v0.62)*

No defaults: the client always sends both final-award arguments.

| # | Check | Status |
|---|---|---|
| 1–2 | access / admin | `no_access` / `not_allowed` |
| 3 | `p_location_code` null or not in `locations`; name invalid; `p_final_award_none` null; `p_final_award_none` true **and** `p_final_award_rank_id` not null *(amended v0.62)* | `invalid` |
| 4 | lock school row `for no key update` | — |
| 6 | final award given: rank id not found → `stale`; rank in other school → `invalid` | |
| 7 | another class in the school with `lower(name) = lower(normalized)` | `duplicate_name` |
| 8 | insert at `position = coalesce(max+1, 0)` | `ok` |

Ok: `{"status":"ok","id":"<uuid>","version":1,"position":<int>,"final_award_none":<bool>}` *(amended v0.62)*

### 2.3 `testing_update_class(p_class_id uuid, p_expected_version integer, p_name text, p_final_award_rank_id uuid, p_final_award_none boolean)` — action `update_class` *(amended v0.62)*

Neither final-award argument has a default: (rank id, `false`) = a rank; (`null`, `true`) = None; (`null`, `false`) = Not set.

| # | Check | Status |
|---|---|---|
| 3 | `p_class_id` or `p_expected_version` null; name invalid; `p_final_award_none` null; both final-award arguments set *(amended v0.62)* | `invalid` |
| 4 | find the class's school (missing → `not_found`); lock school; lock class `for no key update` (re-check → `not_found`) *(amended after security review)* | `not_found` |
| 5 | `version <> p_expected_version` | `stale` |
| 6 | final award: rank not found → `stale`; other school → `invalid`; `class_id = p_class_id` → `invalid` | |
| 7 | other class in same school with same lower(name) | `duplicate_name` |
| 8 | update name + final award rank + `final_award_none` (all three unchanged → no write, no version bump, no log row) *(amended v0.62)* | `ok` |

Ok: `{"status":"ok","id":"<uuid>","version":<int>,"final_award_none":<bool>}` (current version after the call) *(amended v0.62)*.

### 2.4 `testing_reorder_classes(p_location_code text, p_expected_ids uuid[], p_new_ids uuid[])` — action `reorder_classes`

| # | Check | Status |
|---|---|---|
| 3 | location null/unknown; either array null; any null element; duplicates in either array; `cardinality` differs; `p_new_ids` not a permutation of `p_expected_ids` | `invalid` |
| 4 | lock school row | — |
| 5 | current ids of the school ordered by `position` ≠ `p_expected_ids` (exact, ordered) | `stale` |
| 8 | `update … set position = n.ord - 1 from unnest(p_new_ids) with ordinality n(id, ord) where … and position <> n.ord - 1` (only moved rows; identical order = no writes) | `ok` |

Ok: `{"status":"ok"}`. Empty arrays are valid (a school with no classes → `ok`, nothing written). No version changes.

### 2.5 `testing_delete_class(p_class_id uuid, p_expected_version integer, p_expected_rank_ids uuid[], p_expected_lost_award_class_ids uuid[], p_only_if_empty boolean default false)` — action `delete_class`

The two arrays are what the confirmation dialog stated ("… and its 18 ranks? Group D's final award will become Not set."). Both compared as **sets**.

| # | Check | Status |
|---|---|---|
| 3 | id/version null; either array null; null element; duplicate element; `p_only_if_empty` null | `invalid` |
| 4 | find class (missing → `not_found`); lock its school row; lock class `for update` (re-check → `not_found`) | |
| 5a | `version <> p_expected_version` | `stale` |
| 5b | `p_only_if_empty` and the class has ranks | `not_empty` |
| 5c | set of the class's rank ids ≠ `p_expected_rank_ids` | `stale` |
| 5d | lock (`for no key update`, order by id) the other classes whose `final_award_rank_id` is one of this class's ranks; that set ≠ `p_expected_lost_award_class_ids` | `stale` |
| 8 | delete class (ranks cascade; lost awards set null by FK); shift later classes' positions −1 | `ok` |

Ok: `{"status":"ok","removed_rank_count":<int>,"classes_lost_award":[{"id":"<uuid>","name":"<text>"}, …]}` (array ordered by class position; `[]` if none).

### 2.6 `testing_add_rank(p_class_id uuid, p_name text, p_early_cents integer, p_day_cents integer, p_private_cents integer, p_sparring_gear boolean)` — action `add_rank`

| # | Check | Status |
|---|---|---|
| 3 | class id null; name invalid; any price null/out of range/not whole dollars; sparring null | `invalid` |
| 4 | find the class's school (missing → `not_found`); lock school; lock class `for no key update` (re-check → `not_found`) *(amended after security review)* | `not_found` |
| 7 | another rank in the class with same lower(name) | `duplicate_name` |
| 8 | insert at `position = coalesce(max+1, 0)`, `location_code` = the class's | `ok` |

Ok: `{"status":"ok","id":"<uuid>","version":1,"position":<int>}`. Copying prices from the last rank is a **client-side default** only.

### 2.7 `testing_update_rank(p_rank_id uuid, p_expected_version integer, p_name text, p_early_cents integer, p_day_cents integer, p_private_cents integer, p_sparring_gear boolean)` — action `update_rank`

| # | Check | Status |
|---|---|---|
| 3 | id/version null; name/price/sparring invalid | `invalid` |
| 4 | read the rank's class and school (missing → `not_found`); lock school *(amended after security review)*; lock class `for no key update`; lock rank `for update` (gone → `not_found`) | |
| 5 | `version <> p_expected_version` | `stale` |
| 7 | other rank in same class with same lower(name) | `duplicate_name` |
| 8 | update (unchanged → no bump, no log) | `ok` |

Ok: `{"status":"ok","id":"<uuid>","version":<int>}`

### 2.8 `testing_reorder_ranks(p_class_id uuid, p_expected_ids uuid[], p_new_ids uuid[])` — action `reorder_ranks`

Same as 2.4 with the class instead of the school: step 3 also `invalid` if `p_class_id` null; step 4 finds the class's school, locks the school, then locks the class (`not_found` if missing) *(amended after security review)*; step 5 compares the class's rank ids ordered by position. Ok `{"status":"ok"}`. Ranks can never move between classes (other ids are never a permutation → `invalid`/`stale`).

### 2.9 `testing_delete_rank(p_rank_id uuid, p_expected_version integer, p_expected_class_version integer, p_expected_rank_ids uuid[], p_expected_lost_award_class_ids uuid[])` — action `delete_rank`

`p_expected_rank_ids` = the class's rank ids **in the order the dialog showed** (compared **ordered**, because "Green will test for Blue" depends on neighbours). `p_expected_class_version` protects the class's final award named in the sentence. Lost-award list compared as a set.

| # | Check | Status |
|---|---|---|
| 3 | any arg null; null/duplicate element in either array; `p_rank_id` not in `p_expected_rank_ids` | `invalid` |
| 4 | read rank's class and school (missing → `not_found`); lock school *(amended after security review)*; lock class `for no key update`; lock rank `for update` (gone → `not_found`) | |
| 5a | rank `version <> p_expected_version` | `stale` |
| 5b | class `version <> p_expected_class_version` | `stale` |
| 5c | class's rank ids ordered by position ≠ `p_expected_rank_ids` | `stale` |
| 5d | lock (`for no key update`, by id) classes with `final_award_rank_id = p_rank_id`; set ≠ `p_expected_lost_award_class_ids` | `stale` |
| 8 | delete rank (FK sets those classes' award null); shift later ranks −1 | `ok` |

Ok: `{"status":"ok","classes_lost_award":[{"id":"…","name":"…"}],"class_final_award_now_on":"<uuid of the rank that is now last in the class>" | null}` (null when the class is now empty).

---

## 3. Database tests — `supabase/tests/0003_tests.sql` + PGlite

Style of `0002_tests.sql`: one transaction, `ROLLBACK` at the end, placeholders `<paste-admin-UID-here>` / `<paste-desk-UID-here>`, `raise exception 'TEST FAILED: <id> …'`, final row `ALL 0003 TESTS PASSED`. Sessions are made with `set local role authenticated` + `request.jwt.claims` and test rows in `auth.sessions`, exactly like 0002. **Relative to existing rows** (plan §8.13): the tests create their own classes with unique names (e.g. `'zz test ' || left(gen_random_uuid()::text, 8)`) in both schools and assert positions relative to the existing count, so the file passes before and after seeding. After writes that the test inspects, `set constraints all immediate`.

Sessions used: `A1` admin fresh + unlocked · `A2` server-locked (unlocked_until past) · `A3` PIN-locked · `A4` signed out (not in auth.sessions) · `A5` password 8 days old · `A6` magic link (`amr` method `otp`) · `A7` idle-expired · `A8` inactive admin (staff row set inactive inside the transaction) · `D1` desk unlocked · `D2` desk server-locked · `D3` desk magic link · anon.

| Id | Test |
|---|---|
| T1 | A1 and D1 read `locations` (2 rows), `testing_classes`, `testing_ranks` — counts equal what `postgres` sees |
| T2a–g | A2, A3, A4, A5, A6, A7, A8 read 0 rows from all 3 tables |
| T3 | anon: `select` on each of the 4 tables → `insufficient_privilege` (42501); executing each of the 8 RPCs → 42501 |
| T4 | A1 (authenticated): direct `insert`/`update`/`delete` on locations, testing_classes, testing_ranks, change_log → 42501; `select created_by` / `select updated_by` / `select *` on classes and ranks → 42501 |
| T5 | D1 calls all 8 RPCs → `not_allowed`; table snapshot (counts, sum of versions, positions) and change_log count unchanged |
| T6 | A2–A8 call all 8 RPCs → `no_access`; nothing changed |
| T6b | D2 and D3 call all 8 RPCs → `no_access` (not `not_allowed`): proves `has_data_access()` runs before `is_admin()` |
| T5–T6b batches | each session calls the 8 RPCs three times: sensible arguments; broken input (null ids, `''` names, `-1` prices, null arrays); ids that exist nowhere — all 24 must return the session's status (proves access checks run before input checks and lookups) *(amended after security review)* |
| T7 | Full A1 flow: add class (position = existing count), add 3 ranks (0,1,2), update rank (version 2), no-op update (version stays 2, no change_log row), update class name + final award, reorder ranks, reorder classes; positions dense after each step |
| T8 | duplicates: rank `Green` then `green`, ` GREEN `, `Green` (with double inner space variants) in same class → `duplicate_name`; class duplicate in same school (case/space) → `duplicate_name`; update to an existing name → `duplicate_name` |
| T8b | same rank name in another class → ok; same class name in the other school → ok |
| T9 | names: `''`, `'   '`, 61 chars, contains `chr(7)` → `invalid`; 60 chars ok; `'Group   E'` stored as `'Group E'`; tab and `chr(160)` collapse to one space. Prices: `-100`, `100100`, `6550`, null → `invalid`; `0` and `100000` ok; sparring null → `invalid` |
| T10 | final award in other school via add_class and update_class → `invalid`; as postgres, direct update to a cross-school rank → `foreign_key_violation` |
| T10b | own rank as final award via update_class → `invalid`; as postgres, direct update → `check_violation` |
| T10c | final award id that doesn't exist (random uuid) via add_class / update_class → `stale` |
| T10d | final award None *(amended v0.62)*: add/update with None → ok, `final_award_none` in the result; rank **and** None → `invalid`; `p_final_award_none` null → `invalid`; None→rank, rank→None, None→Not set, Not set→None each bump the version and are logged (before/after hold only the changed final-award columns); saving the same None again → no bump, no log; as postgres a rank while None is set → `check_violation` (`testing_classes_final_award_none_ck`); deleting the rank (and then the class) a None class used to point at, and deleting the last rank of the None class itself → `classes_lost_award` `[]`, None class unchanged |
| T11 | reorder (classes and ranks): not a permutation, foreign id (other school's class / other class's rank), null array, null element, duplicates, length mismatch → `invalid` |
| T12 | reorder with `expected` ≠ current order → `stale`, nothing changed |
| T13 | wrong `expected_version` on update_rank, update_class, delete_rank, delete_class → `stale`; for the two deletes every other argument is read from the database first so **only** the version is wrong *(amended after security review)*; T13b reorder leaves `version`, `updated_at`, `updated_by_name` unchanged |
| T14 | as postgres: update class `location_code`, rank `class_id`, rank `location_code`, any `id` → error `check_violation` |
| T15 | delete a middle rank → ok; remaining positions dense; other ranks' versions unchanged |
| T16 | delete a rank that is another class's final award → that class's award null, its version +1, reported in `classes_lost_award`; `class_final_award_now_on` correct |
| T17 | delete class → its ranks gone (cascade), later classes renumbered, lost awards cleared and reported, `removed_rank_count` correct |
| T18 | delete_class with `p_only_if_empty = true` on a class with ranks → `not_empty`, nothing changed |
| T18b | confirmations can't go stale (plan §8.2) — each returns `stale` and deletes nothing: delete_rank after the class was reordered; with an old `p_expected_class_version` (class award changed); with a lost-award list missing a class that has since chosen this rank; delete_class after a rank was added to it; with a stale lost-award list |
| T19 | change_log: one row per changed row with correct `action`, `op`, `table_name`, `record_id`, `location_code`, `actor_id`, `actor_name`, `session_id`; all rows of one RPC call share one non-null `batch_id`, different calls differ; update rows hold only changed columns; delete rows hold the full row in `before` and null `after`; cascade rank deletes and the FK set-null update are logged with the caller's action and batch; after each RPC `current_setting('tkd.action', true)` and `tkd.batch_id` are `''` |
| T20 | as postgres: `update`, `delete`, `truncate` on change_log → error; `truncate … cascade` on testing_ranks and testing_classes → error, rows kept *(amended after security review)*. T20b A1 `select`/`insert` on change_log → 42501 |
| T21 | `created_by_name`/`updated_by_name` = the admin's `staff.full_name`; renaming the staff row afterwards leaves the snapshot unchanged. T21b as postgres with `tkd.actor_label` set → name = label; without → `'Database admin'` |
| T22 | D1 can read `created_by_name` and `updated_by_name` |
| T23 | consecutive add_rank → positions 0,1,2…; add_class appends at the end of its school |
| T24 | `0002_tests.sql` and `verify_pin_tests.sql` still pass after 0003 (run separately) |
| C1 | catalog — for each table 0003 creates: `has_table_privilege(anon, t, p)` false for `SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN`; the same for `service_role` and PUBLIC, and no column rights for them *(amended after security review)*; authenticated: table-level all false (column `final_award_none` included in the granted list *(amended v0.62)*); `has_column_privilege(authenticated, t, c, 'SELECT')` true exactly for the granted columns of §1.8 and false for `created_by`, `updated_by`; `has_any_column_privilege(authenticated, 'public.change_log', 'SELECT')` false |
| C2 | `has_sequence_privilege(r, 'public.change_log_id_seq', 'USAGE')`, `'SELECT'`, `'UPDATE'` false for anon, authenticated, service_role, PUBLIC *(amended after security review)* |
| C3 | every function named `testing\_%` or `change\_log\_%`: anon and service_role *(amended after security review)* can't execute; authenticated can execute **exactly** the 8 RPCs; no `proacl` entry grants execute to PUBLIC (`=X/`) |
| C3f | `pronargdefaults` = 0 for `testing_add_class` and `testing_update_class`, = 1 for `testing_delete_class` *(amended v0.62, security re-check)* |
| C4 | `relrowsecurity` true for locations, testing_classes, testing_ranks, change_log |
| C5 | every `prosecdef` function in schema `public` has `search_path=""` in `proconfig` |
| C6 | position uniques: `condeferrable = true`, `condeferred = false`; every constraint/index name in §1.3–1.4 exists (incl. `testing_classes_final_award_none_ck` *(amended v0.62)*) |
| C7 | `testing_classes_final_award_fk`: `confdeltype = 'n'`, `confdelsetcols` = {final_award_rank_id}; `testing_ranks_class_fk`: `confdeltype = 'c'` |
| C8 | the 8 triggers of §1.6 exist, run the right function and are enabled (`tgenabled = 'O'`) *(amended after security review)* |
| C9 | exactly one SELECT policy to authenticated using `has_data_access()` on each of the 3 data tables; none on change_log; no write policies (added by Builder A) |

**PGlite** (`supabase/tests/pglite/`): own `package.json` pinning an exact `@electric-sql/pglite` version that bundles PostgreSQL 17 (app dependencies unchanged; its `node_modules` is git-ignored). `stubs.sql` creates what Supabase provides: roles `anon`, `authenticated`; schema `auth` with `auth.uid()`/`auth.jwt()` reading `request.jwt.claims`, `auth.users`, `auth.sessions (id uuid primary key, user_id uuid)`; `extensions` schema + pgcrypto. `run.mjs` applies 0001 → 0002 → 0003, inserts an admin and a desk staff row, substitutes the UID placeholders, then runs `verify_pin_tests.sql`, `0002_tests.sql`, `0003_tests.sql` (expect each "PASSED" row), then applies 0003 a **second time** (re-run safety) and prints the fingerprints from `0003_fingerprints.sql`.

**Fingerprints** (`0003_fingerprints.sql`, read-only, no `delete`/`drop` words) *(amended after security review)*: per function `proname`, `pg_get_function_identity_arguments(oid)`, `md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g'))`, plus `prosecdef`, `array_to_string(proconfig, ',')`, `proowner::regrole` and the execute rights as sorted `grantee::regrole:privilege` from `aclexplode(coalesce(proacl, acldefault('f', proowner)))`; for `public` functions named `testing\_%` / `change\_log\_%`, ordered by name and arguments. Every column must match the PGlite run.

**SETUP.md §10** (Builder A): how to apply 0003 (SQL Editor, whole file, expect the destructive-operation warning), the read-only checks Claude runs afterwards (`select version()`, list_tables, fingerprints, security advisor), how to run 0003_tests (UIDs), how the seed is applied later (separate OK), and a **revert snippet** (drops the 8 RPCs, helpers, triggers, the 3 testing tables + locations; change_log kept unless Jeffrey says otherwise).

---

## 4. Seed — `make_seed.mjs` (Builder B)

**Input**: `supabase/manual/0003s_export_from_old_system.json` (written later by the orchestrator from one read-only query on the old project: non-archived classes and ranks; names, order, prices, sparring flag, next_rank only — no student data). Exact shape:

```json
{
  "source": "USTC Color Belt Staging (mfqcchrapunngwwvxzwu)",
  "exportedAt": "2026-10-16T20:00:00Z",
  "fixture": false,
  "classes": [
    { "name": "Little Tiger", "position": 1,
      "ranks": [ { "name": "LT White", "position": 1, "earlyCents": 5000, "dayCents": 6000,
                   "privateCents": 7000, "sparringGear": false, "nextRank": "LT Yellow" } ] }
  ]
}
```

`position` = the old system's order (gaps allowed); `nextRank` = the old **text** column `next_rank` (a rank *name*, may be null).

**Usage**: `node supabase/manual/make_seed.mjs <export.json> [--adjustments <file.json> | --no-adjustments] [--out <file.sql>] [--expect-classes 7] [--expect-ranks 42]`. Node built-ins only. Prints the review table to stdout; writes the SQL. Real seed *(amended v0.62)*: `node supabase/manual/make_seed.mjs supabase/manual/0003s_export_from_old_system.json` (stdout saved as `0003s_review_table.txt`). For a real export (`"fixture": false`) `--adjustments` **defaults** to `supabase/manual/0003s_adjustments.json` (missing file → hard error); skipping it needs the explicit `--no-adjustments` flag, which puts a loud "APPROVED ADJUSTMENTS SKIPPED — do not apply to the real database" warning in the review table and the SQL header; using both flags → hard error. A fixture export uses adjustments only when `--adjustments` is given *(amended after security review)*.

**Approved adjustments** *(amended v0.62)*: the export stays an exact record of the old system; changes Jeffrey approved live in `supabase/manual/0003s_adjustments.json`, applied **after** the export passes every check below. Shape: `{ "fixture": false, "adjustments": [ … ] }`, each entry with a required non-empty `reason` and one of two kinds:
- `{ "kind": "price", "class", "rank", "field": "earlyCents"|"dayCents"|"privateCents", "from", "to" }` — `to` must pass the price rule and differ from `from`.
- `{ "kind": "finalAward", "class", "from": <the class's last rank's exported nextRank, may be null>, "to": "none" }` — final award **None** (the last rank doesn't promote, on purpose).

Hard errors (no SQL written): a target (class by name, rank by name within it; normalized, exact) matching ≠ 1 record; `from` ≠ the export value; the same target adjusted twice; unknown `kind`/`field`; bad `to`; missing reason; a reason containing `delete`/`drop`; the file's `fixture` flag ≠ the export's (real and fixture files can't be mixed). Approved contents (v0.62): (1) Teen/Adult › High Green › `privateCents` 9500 → 8500, "Teen/Adult matches the kids' classes one to one (Jeffrey, 2026-10-16, v0.62)"; (2) and (3) Group D and Teen/Adult final award → None, "Deputy is practice for Dan testing, not a promotion (v0.62)".

**Hard errors (no SQL written)**: class/rank counts ≠ expected (default 7 / 42); a price null, not an integer, negative, > 100000 or not a multiple of 100; a name that is invalid under §1.5; duplicate class names (case-insensitive) or duplicate rank names within a class; a name containing `delete` or `drop` (any case — the output must contain neither substring, see below). **Warnings** (listed in the table, SQL still written): a name changed by normalization; a non-last rank whose `nextRank` doesn't match the next rank's name.

**Final award** (replaces plan §4 and §8.6 — Jeffrey's later note): take the class's **last** rank's `nextRank`; find the **first class after this one** in belt order that has a rank with that name (normalized, case-insensitive compare); that rank is the final award. None found (or `nextRank` empty) → **Not set**, with the reason in the table. A `finalAward` adjustment then turns a class's award into **None** *(amended v0.62)*. With the real data and the approved adjustments the expected result is:

| Class | Final award |
|---|---|
| Little Tiger | Yellow (Group A) |
| White | Yellow (Group A) |
| Group A | Blue (Group B) |
| Group B | High Red (Group C) |
| Group C | Bo Dan (Group D) |
| Group D | None — last rank doesn't promote *(amended v0.62; was Not set — "Deputy 1" doesn't exist)* |
| Teen/Adult | None — last rank doesn't promote *(amended v0.62; was Not set)* |

**Review table** (stdout): first an **ADJUSTMENTS (approved)** section *(amended v0.62)* — the adjustments file and its sha256, then per adjustment: target, change (old → new) and reason (or "none" when no file is given); then per class — position, name, rank count, final award (+ which class), "None — last rank doesn't promote", or "Not set — <reason>"; per rank — position, name, early/day/private in dollars, sparring Yes/No, old nextRank, warning. Every cell changed by an adjustment is marked ` *`.

**Output SQL**: header comment (what, generated from `<input file>` sha256 `<hash>` at `<time>`, "do not edit by hand", how to apply). Then:
- `begin;` → `select set_config('tkd.actor_label', 'Initial copy from the old system', true);` `select set_config('tkd.action', 'seed', true);` `select set_config('tkd.batch_id', '<one uuid per file>', true);`
- One `do $seed$ … $seed$;` block **per school** (`worcester`, then `shrewsbury`), same list for both: if the school already has any class → `raise notice '<School> already has classes — skipped.'` and do nothing; else insert classes (positions 0..6, `final_award_rank_id` null, `final_award_none` true for None classes and false otherwise *(amended v0.62)*), insert ranks (dense positions, cents — adjusted where approved, sparring), then set each class's `final_award_rank_id` (None and Not set classes get no update). A security review added: each block first runs `perform 1 from public.locations where code = '<school>' for no key update;` so two simultaneous runs can't both seed. All ids are literal uuids generated by the script (different per school).
- The header also names the adjustments file, its sha256 and each applied adjustment *(amended v0.62)*.
- Reset the three settings to `''`; `commit;`; then a check `select location_code, count(*) … group by 1` for classes and ranks.
- Names are single-quoted with `'` doubled. The script asserts the final text contains no `delete`/`drop` (case-insensitive) before writing.
- If the input has `"fixture": true`: the SQL starts with `do $$ begin raise exception 'FIXTURE seed — not for production'; end $$;`, and `--out` must not be `0003s_seed_classes_and_ranks.sql` (the script refuses).

**Fixture** `0003s_export_fixture.json` (`"fixture": true`): the mockup list — the same names/prices as the preview data in §6.3 — with `nextRank` values that reproduce the expected table above (Group D's last rank `nextRank: "Deputy 1"`; Teen/Adult's last `nextRank: null`), and old positions with gaps (e.g. 10, 20, …). Builder B generates `0003s_seed_from_fixture_NOT_FOR_PRODUCTION.sql` from it **with** `--adjustments supabase/manual/0003s_adjustments_fixture.json` *(amended v0.62)* (`"fixture": true`; mirrors the real adjustments: Teen/Adult › "Teen/Adult rank 5" › private 10000 → 9000, Group D and Teen/Adult → None) and checks the review table matches the expected mapping, so the fixture seed exercises both a price adjustment and `final_award_none`.

---

## 5. Data layer (Builder C)

### 5.1 `src/lib/device.js` (add)

```js
export const LOCATION_CODE = { Worcester: 'worcester', Shrewsbury: 'shrewsbury' };
export const LOCATION_NAME = { worcester: 'Worcester', shrewsbury: 'Shrewsbury' };
```
`'Both'` has no code (Testing never requests data on Both).

### 5.2 `src/lib/testing/api.js`

Reads (exact column lists; never `*`):

```js
const CLASS_COLUMNS = 'id, location_code, name, position, final_award_rank_id, final_award_none, version, created_at, updated_at, created_by_name, updated_by_name';  // final_award_none: amended v0.62
const RANK_COLUMNS  = 'id, class_id, location_code, name, position, early_cents, day_cents, private_cents, sparring_gear, belt_pattern, belt_color, belt_color_2, belt_end_stripes, belt_end_stripe_color, version, created_at, updated_at, created_by_name, updated_by_name';  // belt_*: amended v0.64 — preview first; DB pending
// in parallel (Promise.all):
supabase.from('testing_classes').select(CLASS_COLUMNS).eq('location_code', code).order('position', { ascending: true });
supabase.from('testing_ranks').select(RANK_COLUMNS).eq('location_code', code).order('position', { ascending: true });
supabase.rpc('has_data_access');
```

Why the third call: RLS returns `[]` to a locked session, which would look like "No classes yet". If `has_data_access` is `false` → result `no_access` (never show the empty state).

Client shapes (camelCase):

```js
// TestingRank
{ id, classId, locationCode, name, position, earlyCents, dayCents, privateCents, sparringGear,
  beltPattern, beltColor, beltColor2, beltEndStripes, beltEndStripeColor,   // amended v0.64 — preview first; DB pending (§5.8)
  version, createdAt, updatedAt, createdByName, updatedByName }
// TestingClass (raw, as loaded) — ranks sorted by position
{ id, locationCode, name, position, finalAwardRankId /* string|null */, finalAwardNone /* boolean, amended v0.62 */, version,
  createdAt, updatedAt, createdByName, updatedByName, ranks: TestingRank[] }
```

Final award as two values *(amended v0.62)*: a rank = (`'<rank id>'`, `false`) · None = (`null`, `true`) · Not set = (`null`, `false`). Screens hold one "choice" value instead (`null` | `FINAL_AWARD_NONE` | rank id) and convert with `finalAwardChoiceOf` / `finalAwardArgs` (§5.3).

Exports (all `async`, **never throw** — every failure becomes `{ status: 'error', error }`):

| Function | RPC + args (exact) | Ok result (camelCase) |
|---|---|---|
| `loadClassesAndRanks(locationCode)` | the 3 reads | `{ status:'ok', classes: TestingClass[] }` · `{ status:'no_access' }` · `{ status:'error', error }` |
| `addClass({ locationCode, name, finalAwardRankId = null, finalAwardNone = false })` *(amended v0.62)* | `testing_add_class` `{ p_location_code, p_name, p_final_award_rank_id, p_final_award_none }` (both always sent) | `{ status:'ok', id, version, position, finalAwardNone }` |
| `updateClass({ classId, expectedVersion, name, finalAwardRankId, finalAwardNone })` *(amended v0.62)* — **no defaults**: leaving either out fails with `error` (PGRST202), never silently changes the award | `testing_update_class` `{ p_class_id, p_expected_version, p_name, p_final_award_rank_id, p_final_award_none }` | `{ status:'ok', id, version, finalAwardNone }` |
| `reorderClasses({ locationCode, expectedIds, newIds })` | `testing_reorder_classes` `{ p_location_code, p_expected_ids, p_new_ids }` | `{ status:'ok' }` |
| `deleteClass({ classId, expectedVersion, expectedRankIds, expectedLostAwardClassIds, onlyIfEmpty = false })` | `testing_delete_class` `{ p_class_id, p_expected_version, p_expected_rank_ids, p_expected_lost_award_class_ids, p_only_if_empty }` | `{ status:'ok', removedRankCount, classesLostAward:[{id,name}] }` |
| `addRank({ classId, name, earlyCents, dayCents, privateCents, sparringGear, beltPattern, beltColor, beltColor2, beltEndStripes, beltEndStripeColor })` *(amended v0.64 — preview first; DB pending)* | `testing_add_rank` `{ p_class_id, p_name, p_early_cents, p_day_cents, p_private_cents, p_sparring_gear, p_belt_pattern, p_belt_color, p_belt_color_2, p_belt_end_stripes, p_belt_end_stripe_color }` (belt values always sent, no defaults; a missing one → `error` PGRST202) | `{ status:'ok', id, version, position }` |
| `updateRank({ rankId, expectedVersion, name, earlyCents, dayCents, privateCents, sparringGear, beltPattern, beltColor, beltColor2, beltEndStripes, beltEndStripeColor })` *(amended v0.64 — preview first; DB pending)* | `testing_update_rank` `{ p_rank_id, p_expected_version, p_name, p_early_cents, p_day_cents, p_private_cents, p_sparring_gear, p_belt_* (same five) }` | `{ status:'ok', id, version }` |
| `reorderRanks({ classId, expectedIds, newIds })` | `testing_reorder_ranks` `{ p_class_id, p_expected_ids, p_new_ids }` | `{ status:'ok' }` |
| `deleteRank({ rankId, expectedVersion, expectedClassVersion, expectedRankIds, expectedLostAwardClassIds })` | `testing_delete_rank` `{ p_rank_id, p_expected_version, p_expected_class_version, p_expected_rank_ids, p_expected_lost_award_class_ids }` | `{ status:'ok', classesLostAward, classFinalAwardNowOn }` |

Non-ok results: `{ status }` with status one of `no_access | not_allowed | not_found | stale | duplicate_name | invalid | not_empty`; any supabase `error`, thrown exception or unrecognised response shape → `{ status:'error', error }`. Export `TESTING_STATUSES` (array of the 8 server statuses + `'error'`).

### 5.3 `src/lib/testing/rankOrder.js` (pure functions, no React, node-importable)

**`withTestingFor(classes)`** — input: `TestingClass[]` for one school (any order); output: a new array sorted by `position`, each class sorted ranks, plus computed fields:

```js
// ClassView = TestingClass + {
//   rankCount,                                   // ranks.length
//   finalAward: { rankId, name, classId, className } | null,   // resolved in the same school; null if None, unset or not found
//   finalAwardState: 'set' | 'none' | 'notSet',  // the class's award state (amended v0.62)
//   ranks: RankView[] }
// RankView = TestingRank + {
//   isLast,                                      // last rank of its class
//   testingFor: { rankId, name } | null,         // next rank; for the last rank the final award; null if last and award None or not set
//   finalAwardState: 'set' | 'none' | 'notSet' | null,  // only on the last rank; null on every other rank ('none' amended v0.62)
//   nextBelt: Belt | null }                      // belt of the rank in testingFor (next rank / final award); null when testingFor is null — amended v0.64, preview first
```
Example: Group A [Yellow, Orange, Green, High Green], award Blue → Yellow→{Orange}, … High Green → `{ isLast:true, testingFor:{rankId:<Blue>, name:'Blue'}, finalAwardState:'set' }`. Award id pointing at a rank not in the list → `'notSet'`. Group D (None) → Deputy `{ isLast:true, testingFor:null, finalAwardState:'none' }` *(amended v0.62)*. `finalAwardNone` true wins over a rank id (the database never stores both).

Other exports:

| Function | Contract |
|---|---|
| `moveId(ids, fromIndex, toIndex)` | new array with one id moved |
| `reorderRanksLocal(classes, classId, newIds)` | raw classes with that class's ranks reordered, positions rewritten 0..n-1 |
| `reorderClassesLocal(classes, newIds)` | raw classes reordered, positions rewritten |
| `finalAwardOptions(classes, classId)` | *(amended v0.62)* `[{ kind:'none', value: FINAL_AWARD_NONE }, { kind:'class', classId, className, ranks:[{ id, name }] }, …]` — first the **None** entry (always present), then every class **except `classId`**, in belt order, skipping classes with no ranks. ("Not set", value `null`, is added by the UI **before** the None entry.) For Add class pass `classId = null` (all classes). |
| `FINAL_AWARD_NONE`, `finalAwardChoiceOf(cls)`, `finalAwardArgs(choice)` | *(amended v0.62)* `FINAL_AWARD_NONE = 'none'`. `finalAwardChoiceOf(cls)` → `null` (Not set) \| `'none'` \| rank id (the saved choice; use it for the Edit class field and for "unchanged" checks). `finalAwardArgs(choice)` → `{ finalAwardRankId, finalAwardNone }` to spread into `addClass` / `updateClass`: `'none'` → `{ null, true }`, `null`/`undefined` → `{ null, false }`, rank id → `{ id, false }`. |
| `describeAddRank(classes, classId)` | `{ className, lastRankName /* null if empty */, copied: { earlyCents, dayCents, privateCents, sparringGear } | null }` — `copied` from the current last rank; null for an empty class |
| `describeRankDelete(classes, rankId)` | `null` if the rank isn't there; else `{ rankName, className, previousRankName|null, nextRankName|null, isLast, finalAwardState /* the class's: 'set'|'none'|'notSet', amended v0.62 */, finalAwardName|null, isOnlyRank, lostAwardClasses:[{id,name}] /* by position */, rpcArgs:{ rankId, expectedVersion, expectedClassVersion, expectedRankIds /* ordered */, expectedLostAwardClassIds } }` |
| `describeClassDelete(classes, classId)` | `null` if missing; else `{ className, rankCount, lostAwardClasses, rpcArgs:{ classId, expectedVersion, expectedRankIds, expectedLostAwardClassIds, onlyIfEmpty:false } }` |
| (delete sentences, *amended v0.62*) | Deleting the last rank of a **None** class (`isLast`, has previous, `finalAwardState:'none'`): the new last rank won't test for a new rank — Builder D adds that row to §7.4 (the checks use `{prev} won't test for a new rank.`). A None class points at no rank, so it never appears in `lostAwardClasses` of either description. |
| `checkUndoAddRank(classes, rankId)` | `{ ok:true, rpcArgs }` (deleteRank args with `expectedVersion:1`, `expectedLostAwardClassIds:[]`) or `{ ok:false, reason:'gone' | 'edited' | 'isFinalAward', className?, rankName? }` (`edited` = version ≠ 1; `isFinalAward` = some class now uses it — Undo refuses, plan §8 nit) |
| `classOrderIds(classes)`, `rankOrderIds(classes, classId)` | current id lists |

### 5.4 `src/lib/testing/names.js`

`normalizeName(text)` → normalized string (`''` for null/undefined) · `nameProblem(text)` → `null | 'empty' | 'tooLong' | 'badCharacter'` (on the normalized value; `badCharacter` checked before length) · `nameLength(text)` (code points) · `findDuplicateClass(classes, name, exceptClassId)` → the **existing** class's stored name or `null` · `findDuplicateRank(classView, name, exceptRankId)` → existing rank's stored name or `null`. Constant `NAME_MAX = 60`.

### 5.5 `src/lib/money.js`

| Export | Behavior |
|---|---|
| `MAX_PRICE_DOLLARS = 1000`, `MAX_PRICE_CENTS = 100000` | |
| `formatDollars(cents)` | `"$65"`, `"$0"`, `"$1,000"` (en-US grouping, no decimals) |
| `centsToInputText(cents)` | `"65"`; `null` → `""` |
| `parseDollars(text)` | trim → strip one leading `$` → trim → remove commas. `''` → `{ problem:'empty' }`; `^\d+$` → value; `^\d+\.\d{1,2}$` with all-zero decimals → value; other decimals → `{ problem:'notWhole' }`; anything else (incl. `-5`) → `{ problem:'notNumber' }`; value > 1000 → `{ problem:'tooHigh' }`; ok → `{ cents }` |
| `isValidCents(n)` | integer, 0 ≤ n ≤ 100000, `n % 100 === 0` |

### 5.6 `src/lib/testing/useClassesRanks.js`

```js
const t = useClassesRanks({ locationCode, enabled });
// locationCode: 'worcester' | 'shrewsbury' | null (null = Both → no requests)
// enabled: false while the screen is locked (no requests)
t.status        // 'idle' | 'loading' | 'ready' | 'error' | 'noAccess'
t.classes       // ClassView[] (withTestingFor applied); [] until first 'ready'
t.reload()      // Promise<'ok' | 'error' | 'noAccess'>; quiet: keeps current data visible
t.setLocalClasses(updater)  // optimistic edit: updater(rawClasses) => rawClasses; views recomputed
```
- `'loading'` only for the first load of a location (no data yet) → UI shows the skeleton. Later reloads are quiet.
- Auto-reloads: `locationCode` changes; `enabled` false → true (unlock); `document` becomes visible. Latest request wins; a response for an older request or another location is ignored.
- A quiet reload that fails keeps the data, `status` stays `'ready'`, and `reload()` resolves `'error'` (UI shows the load banner). `no_access` → `status 'noAccess'` (UI calls `onNoAccess`).

### 5.7 `src/lib/testing/checks.mjs`

`node src/lib/testing/checks.mjs` — plain `assert` checks of `names.js`, `money.js`, `rankOrder.js` (all examples in this contract, incl. the delete descriptions of §7.4) and the mock backend core (§6) running the DB test scenarios T5–T18b (incl. T10d *(amended v0.62)*) that don't need sessions. Prints `ALL TESTING LIB CHECKS PASSED`.

### 5.8 `src/lib/testing/belts.js` *(amended v0.64 — preview first; DB pending)*

Belt picture per rank (rulebook v0.64/v0.65). Built in the data layer and preview mock first; Builder A adds the database columns/arguments after Jeffrey approves the look. **Until then `RANK_COLUMNS` and the rank RPCs work only in preview mode** (the real database would answer 42703 / PGRST202).

`Belt = { beltPattern, beltColor, beltColor2, beltEndStripes, beltEndStripeColor }` — planned columns `belt_pattern text`, `belt_color text`, `belt_color_2 text null`, `belt_end_stripes integer`, `belt_end_stripe_color text` (default `'yellow'`).

| Export | Behavior |
|---|---|
| `BELT_COLORS` | ordered `[{ key, name }]`: `white White`, `yellow Yellow`, `orange Orange`, `green Green`, `blue Blue`, `purple Purple`, `red Red`, `brown Brown`, `black Black` |
| `BELT_PATTERNS` | `['solid', 'stripe', 'half']` |
| `BELT_END_STRIPES_MAX = 3`, `DEFAULT_END_STRIPE_COLOR = 'yellow'` | |
| `PLAIN_WHITE_BELT` | frozen `{ 'solid', 'white', null, 0, 'yellow' }` |
| `validateBelt(belt)` | `null` if valid, else (first failing, in this order) `'badPattern'` (not solid/stripe/half) · `'badColor'` (main or second color not a key) · `'color2NotAllowed'` (solid with a second color) · `'missingColor2'` (stripe/half without one) · `'sameColors'` (stripe/half, second = main) · `'badEndStripes'` (not an integer 0–3) · `'missingEndStripeColor'` (end stripes > 0, color null) · `'badEndStripeColor'` (not a key; null is allowed only with 0 end stripes) |
| `describeBelt(belt)` | plain English or `null` if invalid: solid `Plain white` (with end stripes: `Black with 3 red end stripes`) · stripe `Blue with a white middle stripe` (+ ` and 2 yellow end stripes` / ` and 1 yellow end stripe`) · half `Top half red, bottom half black` (+ `, with 1 yellow end stripe`) |
| `defaultBeltFor(cls)` | copy of the class's last rank's belt (by position); plain white solid when the class is empty or that belt is invalid/missing — Add rank's starting belt |
| `beltOf(rank)` | just the five belt fields (new object) |
| `sameBelt(a, b)` | the five fields equal — for Edit rank's "unchanged" check (name, prices, sparring **and** belt) |

Mock (§6.2) and, later, the database refuse an invalid belt with `invalid` (argument check, step 3). Belt columns are rank **content columns** (a belt-only change bumps the version; the same belt again doesn't).

---

## 6. Preview mock (Builder C) — must mirror the server exactly

### 6.1 Structure

- `src/lib/mockTesting.js` exports a **pure core** (no `window` access at import time): `createTestingBackend({ loadStore, saveStore, now, newId })` with `select(table, columns, filters, orders, ctx)` and `rpc(name, args, ctx)`, plus `defaultTestingData()`. `ctx = { signedIn, hasDataAccess, isAdmin, actorName }`.
- `src/lib/mockClient.js` wires it in: `supabase.from(table)` returns a thenable builder supporting `.select(cols).eq(col, val).order(col, { ascending })` (order may be chained); `rpc('has_data_access')`; the 8 `testing_*` RPCs. Store in localStorage key **`tkd.preview.testing`** (`{ schema: 3, classes: [...snake_case rows incl. final_award_none], ranks: [...rows incl. the five belt_* columns] }`; missing/corrupt, an invalid stored belt, or saved by an older build (schema 1 no `final_award_none`, schema 2 no belts) → default data *(amended v0.62; schema 3 amended v0.64 — preview first; DB pending)*).
- `ctx.hasDataAccess` = signed in AND password within 7 days AND session id AND not PIN-locked AND `unlockedUntil > now` (the existing session state). `ctx.isAdmin` = role `'admin'` from the preview staff state (new field `role`, default `'admin'`) AND password fresh. `get_my_profile` returns that role.

### 6.2 Behavior (same as §1–2)

- Same check order, same statuses, same ok payloads (snake_case), same name/price/position/version rules (import `names.js` / `money.js`), same set-vs-ordered comparisons, same lost-award reporting, same `version` rules (position-only changes don't bump; set-null bumps the class).
- *(amended v0.62)* `testing_add_class` / `testing_update_class` take `p_final_award_none` with **no defaults** on either final-award argument (missing → PGRST202 error, like the real API); `p_final_award_none` null, or true together with a rank id → `invalid` (step 3, before `not_found`/`stale`); ok answers include `final_award_none`; `final_award_none` is a content column (each state change bumps the version, the same state again doesn't). `final_award_none` is readable (granted column).
- *(amended v0.64 — preview first; DB pending)* `testing_add_rank` / `testing_update_rank` take `p_belt_pattern text, p_belt_color text, p_belt_color_2 text, p_belt_end_stripes integer, p_belt_end_stripe_color text` with **no defaults** (missing → PGRST202); any `validateBelt` problem → `invalid` (step 3); the five `belt_*` columns are granted (readable) rank content columns. The real database gets the same rules when Builder A catches up.
- Response envelope: `{ data, error: null }`. Not signed in: reads → `{ data: null, error: { code:'42501', message:'permission denied for table <t>' } }`; RPCs → same with `function <name>`. `has_data_access` false → reads return `[]` (RLS), RPCs return `{status:'no_access'}`.
- `select('*')`, or any column not granted in §1.8 → `{ data:null, error:{ code:'42501', message:'permission denied for table <t>' } }`. `change_log` and `locations` writes don't exist in the mock; `from('locations')` returns the 2 rows.
- Delay ~200 ms per call (existing `FAKE_DELAY_MS / 2`); `setTestingDelay(ms)` overrides it.
- Actor name for writes: the preview staff's `full_name` ("Jeffrey Berg").

### 6.3 Default preview data (both schools get the same list) *(amended: real export + approved adjustments, v0.62)*

The preview uses the **real** list from `supabase/manual/0003s_export_from_old_system.json` (7 classes, 42 ranks, real prices; written into `mockTesting.js` in short form) with the approved adjustments of §4 applied — no placeholders.

Belts *(amended v0.64 — preview first; DB pending)* (both schools; Teen/Adult = the kids' rank of the same name): LT White solid white · LT Yellow / LT Green / LT Blue / LT Red / LT Black stripe white + that color · White, Yellow, Orange, Green, Blue, Purple, Red, Brown solid · High Green / High Blue / High Red / High Brown stripe that color + white · Red / Black half red (top) + black (bottom) · Bo Dan stripe black + white · Bo Dan - 1/2/3 Big Stripe stripe black + white with 1/2/3 yellow end stripes · Deputy stripe black + yellow. End-stripe color `yellow` on every rank.

| Pos | Class | Ranks (in order) | Early / Testing day / Private | Sparring | Final award |
|---|---|---|---|---|---|
| 0 | Little Tiger | LT White, LT Yellow, LT Green, LT Blue, LT Red, LT Black | $50 / $60 / $70 | No | Yellow (Group A) |
| 1 | White | White | $65 / $75 / $85 | No | Yellow (Group A) |
| 2 | Group A | Yellow, Orange, Green, High Green | $65 / $75 / $85 | No | Blue (Group B) |
| 3 | Group B | Blue, High Blue, Purple, Red | $70 / $80 / $95 | Yes | High Red (Group C) |
| 4 | Group C | High Red, Brown, High Brown, Red / Black | $75 / $85 / $95 | Yes | Bo Dan (Group D) |
| 5 | Group D | Bo Dan, Bo Dan - 1 Big Stripe, Bo Dan - 2 Big Stripe ($100 / $110 / $120); Bo Dan - 3 Big Stripe ($120 / $130 / $150); Deputy ($10 / $10 / $10) | per rank | Yes | **None** (`final_award_none` true) |
| 6 | Teen/Adult | White, Yellow, Orange, Green, High Green ($65 / $75 / $85, No — High Green private **$85**, adjusted from $95); Blue … Red ($70 / $80 / $95), High Red … Red / Black ($75 / $85 / $95), Bo Dan … Deputy (as Group D) — all Yes | per rank | per rank | **None** (`final_award_none` true) |

Every row: `version 1`, `created_by_name`/`updated_by_name` `'Main Admin'`, `created_at`/`updated_at` `2026-10-16T20:52:00Z` (shows "Oct 16, 4:52 PM" in Eastern time, as mocked up).

### 6.4 Console helpers (added to the existing `window.__tkdPreview`; each returns a short sentence saying what happened)

| Helper | Effect |
|---|---|
| `setRole('admin' \| 'staff')` | sets the preview account's role; "Reload the page to see it." |
| `failNextSave()` | the next `testing_*` RPC returns `{ data:null, error:{ message:'Failed to fetch (preview: failNextSave)' } }` and changes nothing |
| `simulateOtherAdminEdit()` | in both schools: every class and rank gets `version + 1`, `updated_by_name 'Other Admin'`, `updated_at` now; and the first two ranks of the first class with ≥ 2 ranks swap places — so any open dialog, confirmation or Undo goes stale |
| `clearSchool('Worcester' \| 'Shrewsbury')` | removes all classes/ranks of that school (to see the empty state) |
| `resetTesting()` | restores §6.3 |
| `setTestingDelay(ms)` | sets the fake network delay (e.g. 3000 to photograph the skeleton) |

Existing helpers (`lockNow`, `setHasPin`, `setShared`, `setPasswordAgeDays`, `setPasswordAgeMinutes`) keep working. Builder D lists all helpers in `README.md`.

---

## 7. Every user-visible string (Builder D: `src/screens/testing/text.js`)

`{x}` = inserted value. Copy exactly; sentence case; no trailing spaces.

### 7.1 Page, tabs, states

| Where | Text |
|---|---|
| Rail / bottom bar label + aria-label | `Testing` (IconCertificate); order **Home, Testing** |
| `document.title` | `Testing · U.S. Taekwondo Center` (Home keeps `Home · U.S. Taekwondo Center`) |
| Page title (h1) + location line under it | `Testing` + `{Worcester}` (on Both: title only, no location line) |
| Page-header primary button | `Add class` with IconPlus |
| Tab bar (only tab, v0.50) | `Classes and ranks` |
| Staff line under the tabs | `View only. Ask an admin to make changes.` |
| Both blocked | `Testing is kept separate for each school. Choose a school to see its testing.` + outline buttons `Worcester`, `Shrewsbury` (each with IconMapPin) |
| Empty school — admin | `No classes yet at {Shrewsbury}.` (Add class stays in the header) |
| Empty school — staff | `No classes yet at {Shrewsbury}. An admin adds them.` |
| Skeleton (screen readers) | `Loading Classes and ranks` |
| Rank count on a class line | `No ranks` · `1 rank` · `{n} ranks` |
| Empty class | `No ranks in this class yet.` + outline `Add rank` (IconPlus; admin only) |
| Under an open class (admin) | outline `Add rank` (IconPlus, 28px compact) |
| Table headers (not sortable) | `Rank` · `Testing for` · `Early` · `Testing day` · `Private` · `Sparring gear` |
| Sparring cell | `Yes` / `No` |
| Tags | `Final award` (neutral) · `Sparring gear` (neutral, phone only) · `Not saved` (amber, IconAlertTriangle) · **(amended v0.62)** `No new rank` (neutral; last rank of a class whose final award is **None**, shown in the Testing for column; one tag per row, priority `Not saved` > `Final award` / `No new rank` > `Sparring gear`) |
| Last rank, award not set (amber + IconAlertTriangle) — admin | `Final award not set — choose one in Edit class` |
| same — staff | `Final award not set` |
| Phone rank row line 1 | `{rank} → {testingFor}` (last rank with award not set: `{rank}` then the amber reminder line) · **(amended v0.62)** last rank of a None class: `{rank}` + the `No new rank` tag (sparring gear then moves to line 2 as text); if that row's one tag is `Not saved`, line 2 ends with ` · No new rank` as gray text · *(amended v0.63/v0.64/v0.65 — preview first)* with belt pictures: `[belt] {rank} → [belt] {testingFor}`; each belt stays glued to the first word of its name, long names wrap (no sideways scroll at 320 px) · *(amended belt review — preview first)* `[belt] {rank}` and `→ [belt] {testingFor}` are two non-breaking units: the line breaks only before the arrow unless one unit alone is wider than the line; the phone never shows a `Sparring gear` tag |
| Belt pictures *(amended v0.63/v0.64/v0.65 — preview first)* | `Belt.jsx` SVG, `aria-hidden` (the name is always written): 40×12 in the list, 56×14 in the dialog; 1 px `--belt-outline` outline, 2 px corners; patterns solid / stripe (outer color top + bottom thirds, second color middle third) / half (top half color, bottom half color 2, exactly 50/50); 0–3 end stripes = vertical bars near the right end in their color. Colors = `--belt-*` tokens (real belt colors incl. red: recorded exception to rule 7, v0.64). Shown before the rank name AND before the Testing for name (PC/tablet columns; phone line 1); a final-award row shows the award rank's belt; a None row shows no next belt, only `No new rank`. Staff see the same. |
| Phone rank row line 2 | `{$70} early · {$80} testing day · {$95} private` + ` · Sparring gear` when the sparring tag can't show · *(amended belt review — preview first)* ` · Sparring gear` is **always** text here on the phone (never a tag) |

### 7.2 Aria-labels and tooltips

| Control | aria-label (= tooltip text where a tooltip exists) |
|---|---|
| Class chevron/name toggle | `Expand {class}` / `Collapse {class}` |
| Class edit / more / grip | `Edit class {class}` · `More actions for {class}` · `Drag to reorder {class}` |
| Rank edit / more / grip / view | `Edit {rank}` · `More actions for {rank}` · `Drag to reorder {rank}` · `View {rank}` (visible text `View`) |
| Grip tooltip text | `Drag to reorder` |
| Banner buttons | `Retry` (IconRefresh, visible text) · `Dismiss` (IconX, icon-only) |
| Phone dialog back arrow | `Back` |
| Toast Undo | `Undo` (IconArrowBackUp, visible text) |

### 7.3 Menus

PC/tablet dropdown and phone bottom sheet: `Move up` (IconArrowUp) · `Move down` (IconArrowDown) · separator · `Delete rank` / `Delete class` (IconTrash, red). Move up is unavailable (gray, `aria-disabled`) on the first item, Move down on the last. Phone sheet ends with a separator + `Cancel` and starts with a header:

| Item | Sheet header line 1 | line 2 |
|---|---|---|
| rank, not last | `{rank}` | `{class} · tests for {next}` |
| last rank, award set | `{rank}` | `{class} · last rank, tests for {award} (final award)` |
| last rank, not set | `{rank}` | `{class} · last rank, final award not set` |
| last rank, final award None *(amended v0.62)* | `{rank}` | `{class} · last rank, no new rank` |
| class | `{class}` | `{n ranks}` (as 7.1) |

### 7.4 Dialogs

| Dialog | Title | Subtitle | Body / fields | Buttons |
|---|---|---|---|---|
| Edit rank | `Edit rank` | `{class} · {Worcester}` | `Rank name` · `Testing for` (read-only) · `Prices` (`Early`, `Testing day`, `Private testing`, each with `$` prefix) · hint `Early = paid in full before testing day.` (phone: under the Early field `Paid in full before testing day.`) · checkbox `Sparring gear required` · meta `Last changed by {name} · {Oct 16, 4:52 PM}` | `Cancel` · `Save` (IconCheck, primary). Phone: back arrow + full-width `Save` only |
| Belt section of Edit / Add rank *(amended v0.63/v0.64/v0.65 — preview first)* | — | — | Group label `Belt`; live preview (56×14 belt + the typed rank name); `Pattern` segmented control `Solid` · `Middle stripe` · `Half and half` (radio group, arrow keys); color row `Belt color` (`Top half` for half and half) and, except Solid, `Middle stripe color` / `Bottom half` — each a radio group of the `BELT_COLORS` swatches (aria-label = color name, mouse tooltip = color name, the chosen color's name written next to the row label, arrow keys move + choose, 44 px tap on touch, chosen = dark ring, not blue); `End stripes` stepper (`Fewer end stripes` − n + `More end stripes`, 0–3) and, when n ≥ 1, an `End stripe color` row (default yellow). Same-color error (amber): `Pick a stripe color that differs from the belt color.` / `Pick a bottom half that differs from the top half.` *(amended belt review — preview first)* Stepper buttons show plain `−` / `+` text with a tooltip (hover and keyboard focus) equal to their aria-label; swatch tooltips sit **below** the swatch so they never cover the row label; a same-color error shows under the color row the user changed last (amber, Save gray); new end-stripe error `Pick an end stripe color that differs from the belt color.` when the end stripe color equals the color it sits on (belt color; bottom half for Half and half), shown under `End stripe color`, Save gray. Preview box: 56×14 belt + rank name + `describeBelt()` text. `Testing for` in Edit / Add / View rank shows the next rank's belt before its name. Swatches: one row of 9 on PC and tablet; phone fixed grid of 5 per row (5 + 4). Add rank starts with `defaultBeltFor(class)` (copy of the last rank's belt; plain white for an empty class). A belt change counts as a change (Save / unsaved-changes guard / Undo restore the belt). | — |
| Add rank | `Add rank` | `{class} · {Worcester}` | as Edit rank, no meta line. Testing-for line: `Added at the end of {class}. {lastRank} will now test for this rank.` — empty class: `Added as the first rank of {class}.` · Prices hint: `Copied from {lastRank}. Change if needed.` — empty class: fields empty + `Enter the three prices for this class's first rank.` | same |
| View rank (staff) | `{rank}` (aria-label `{rank}, view only`) | `{class} · {Worcester} · view only` | plain text values; prices `$65`; phone Early: `$65 · paid in full before testing day`; `Sparring gear required` `Yes`/`No`; meta line | `Close` (secondary). Phone: back arrow only · *(amended v0.63/v0.64/v0.65 — preview first)* `Belt` line: the 56×14 preview + `describeBelt()` text (e.g. `Black with a white middle stripe and 1 yellow end stripe`) |
| Add class | `Add class` | `Adds an empty class to {Worcester}'s list.` | `Class name` · collapsed `More details` (IconChevronDown/Up) → `Final award after this class (optional)` + hint `Students who pass the last rank of this class receive this rank. You can set it later in Edit class.` (starts on `Not set`) | `Cancel` · `Save` |
| Edit class | `Edit class` | `{class} · {Worcester}` | `Class name` · `Final award after this class` + hint `Students who pass the last rank of this class receive this rank.` | `Cancel` · `Save` |
| Delete (alertdialog, small on every device incl. phone) | see below | — | see below | `Cancel` · red `Delete` (IconTrash, the main button) |

Testing-for read-only text in Edit/View rank: not last → `{next} — set by the rank order`; last with award → `{award} — final award, set in the class settings`; last, not set → amber `Final award not set — choose one in Edit class` (staff: `Final award not set`). **(amended v0.62)** Last rank of a None class → `No new rank — set in the class settings` (neutral, not amber; staff: `No new rank`).

**Final-award list options** *(amended v0.62)*: `Not set` · `None — last rank doesn't promote` · then one group per class (as before). None is selectable and gets the current-choice tint; same keyboard / type-ahead rules (§8.7). The **closed** field shows just `None` when None is chosen (the open list keeps the full label, and screen readers hear the full label). Add class still starts on `Not set`; Edit class shows the saved choice (`Not set`, `None …` or the rank). `addClass` / `updateClass` always send both values via `finalAwardArgs(choice)`; Undo of Edit class restores the previous choice the same way.

"Last changed" date: `toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' })` → `Oct 16, 4:52 PM`; add the year (`Oct 16, 2025, 4:52 PM`) only when it isn't the current year.

**Delete confirmations** (built from `describeRankDelete` / `describeClassDelete` after the re-read, §8.6):

| Case | Title | Body |
|---|---|---|
| Rank with previous and next | `Delete {rank}?` | `{prev} will test for {next}. [lost] Existing events keep their own copy. This can't be undone.` |
| Last rank, has previous, award set | `Delete {rank}?` | `{prev} will test for {award}. [lost] Existing events …` |
| Last rank, has previous, award not set | `Delete {rank}?` | `{prev} will be the last rank of {class}. [lost] Existing events …` |
| Last rank, has previous, final award **None** *(amended v0.62)* | `Delete {rank}?` | `{prev} won't test for a new rank. [lost] Existing events …` (class delete text unchanged: a None class never loses an award) |
| First rank, has next | `Delete {rank}?` | `[lost] Existing events keep their own copy. This can't be undone.` |
| Only rank | `Delete {rank}?` | `{class} will have no ranks. [lost] Existing events …` |
| Class with n ranks | `Delete {class}?` (n=0) · `Delete {class} and its 1 rank?` · `Delete {class} and its {n} ranks?` | `[lost] Existing events keep their own copy. This can't be undone.` |

`[lost]` (classes by position; omitted when none): 1 → `{A}'s final award will become Not set.` · 2 → `{A}'s and {B}'s final awards will become Not set.` · 3+ → `{A}'s, {B}'s and {C}'s final awards will become Not set.`
Examples (must match the mockup): `Delete High Green?` / `Green will test for Blue. Existing events keep their own copy. This can't be undone.` · `Delete Blue?` / `Group A's final award will become Not set. Existing events keep their own copy. This can't be undone.` · `Delete Teen/Adult and its 18 ranks?` / `Group D's final award will become Not set. Existing events …` (when Group D's award is Teen/Adult's first rank).

### 7.5 Field errors (amber, IconAlertTriangle, under the field, as the user types)

| Code | Text |
|---|---|
| name `empty` (only after the field was typed in) | `Enter a rank name.` / `Enter a class name.` |
| name `tooLong` | `Use 60 characters or fewer.` |
| name `badCharacter` | `That name has a character that can't be used. Remove it.` |
| duplicate rank | `{class} already has a rank called {existingName}. Try another name.` |
| duplicate class | `{Worcester} already has a class called {existingName}. Try another name.` |
| price `empty` | `Enter a price in whole dollars.` |
| price `notNumber` | `Enter a price in whole dollars, like 65.` |
| price `notWhole` | `Use whole dollars, like 65.` |
| price `tooHigh` | `Enter $1,000 or less.` |

### 7.6 Notes, banners, toasts

| Key | Text | Where |
|---|---|---|
| `UNSAVED` | `Unsaved changes. Save or cancel first.` | in dialog. **(amended v0.56)** On phone full-screen dialogs only, the note also holds a text link `Discard changes` (see below) |
| `DISCARD_CHANGES` | `Discard changes` | **(amended v0.56)** phone full-screen dialogs only, inside the `UNSAVED`, `STALE_DIALOG` and `NOT_ALLOWED` notes (the last two block Save, so the link is the phone's only way out): text-style button in the note's amber text color (not red, not blue), ≥ 44 px tap height; closes the dialog without saving (same as Cancel) and removes the dialog's history entry |
| `STALE` | `Someone else changed this just now. Your change wasn't saved.` | page banner (dismiss only) |
| `STALE_DIALOG` | `Someone else changed this just now. Your change wasn't saved. Cancel, then open it again to see the latest.` | in dialog (PC/tablet). **(amended v0.56)** Phone full-screen: `Someone else changed this just now. Your change wasn't saved. Discard changes, then open it again to see the latest.` + the `Discard changes` link |
| `NOT_ALLOWED` | `Only an admin can change Classes and ranks. Your change wasn't saved.` | in dialog / page banner. **(amended v0.56)** Phone full-screen dialog: + the `Discard changes` link |
| `INVALID_DIALOG` | `That didn't save. Check the fields and try again.` | in dialog |
| `SAVE_FAILED` | `Couldn't save. Check the connection, then try again.` | in dialog |
| `DELETE_FAILED` | `Couldn't delete. Check the connection, then try again.` | in delete dialog |
| `RANK_ORDER_FAILED` | `Rank order didn't save. Check the connection, then retry.` | banner + Retry |
| `CLASS_ORDER_FAILED` | `Class order didn't save. Check the connection, then retry.` | banner + Retry |
| `LOAD_FAILED` | `Couldn't load Classes and ranks. Check the connection, then retry.` | banner + Retry (or in place of the list on first load) |
| `UNDO_STALE` | `Couldn't undo. Someone else changed this just now.` | banner |
| `UNDO_NOT_EMPTY` | `Couldn't undo. {class} has ranks now. Use ⋯ → Delete class instead.` | banner |
| `UNDO_AWARD` | `Couldn't undo. {rank} is now {class}'s final award. Use ⋯ → Delete rank instead.` | banner |
| `UNDO_FAILED` | `Undo didn't save. Check the connection, then retry.` | banner + Retry |
| Toasts with Undo | `Rank saved` · `Rank added` · `Class saved` · `Class added` · `Rank order saved` · `Class order saved` | toast + `Undo` |
| Plain toasts | `{rank} deleted` · `{class} deleted` · `Undone` | toast, no Undo |

Testing toasts have **no leading icon** (as mocked up: text, divider, Undo). Account toasts keep their IconCheck.

---

## 8. UI behavior contract (Builder D)

### 8.1 App wiring (`App.jsx`, `navItems.js`, `Toast.jsx`)

- `NAV_ITEMS = [{ id:'home', label:'Home', Icon: IconHome }, { id:'testing', label:'Testing', Icon: IconCertificate }]`. Nothing is added to Home.
- `section` `'home' | 'testing'`; title per §7.1.
- `<Testing location onLocationChange isAdmin={profile.role === 'admin'} screenLocked={phase === 'locked'} onNoAccess={() => setLockedFlag(true)} onRefreshProfile showToast clearToast onModalOpenChange />`. `isAdmin` is for showing controls only — the database enforces.
- `onRefreshProfile` re-reads `get_my_profile` and updates `profile` (role may have changed).
- Shell `inert` = an account dialog open **or** a Testing dialog open (`onModalOpenChange(true/false)`).
- `showToast(text, { action: { label:'Undo', onAction } | null, icon: true|false } = {})`; `clearToast()`. Toasts are dropped on lock/sign-out (existing), on location change and on section change.
- Toast: an Undo button (IconArrowBackUp + "Undo"); activating it calls `onAction` and dismisses the toast. **The 5-second timer pauses while the pointer is over the toast or focus is inside it, and resumes with the time that was left** (v0.54). A new toast replaces the old one (only the latest Undo exists).

### 8.2 Layout

- PC (≥ 1024 px **and** `pointer: fine`): rank rows 40 px; columns Rank · Testing for · Early · Testing day · Private · Sparring gear · actions; row actions grip (left) + Edit + ⋯; class line: grip left of chevron, rank names aligned under the class name.
- Tablet width (640–1023): drops Private and Sparring gear columns (reachable in the dialog). *(amended belt review — preview first)* Rank and Testing for share the spare width equally; Early 56 px, Testing day 76 px, 8 px column gap.
- Phone (< 640): stacked two-line rank rows; class line name area 48 px tall opens/closes; 16 px side padding; no horizontal scroll down to 320 px.
- Touch (`pointer: coarse`, any width): rows 48 px; no grips; admin rows Edit + ⋯ (icons 28 px visual, 44 px tap); staff rows a 36 px outline `View` button. Mouse staff rows have no buttons (row click opens). *(amended v0.63/v0.64/v0.65 — preview first)* **Admins get grips on every device** (touch: left of the row, 16 px icon, 44×44 tap, `touch-action: none` on the grip only); staff never see grips.
- One tag per row, priority `Not saved` > `Final award` > `Sparring gear` (the last only as a tag on the phone; otherwise ` · Sparring gear` text on line 2). *(amended belt review — preview first)* Sparring gear is never a tag: phone line 2 always says ` · Sparring gear`; PC keeps its column.
- Blue count ≤ 5 (rail, switcher, tab, Add class, drop line). Red only on Delete items/buttons (`#A32D2D` on `#FCEBEB` hover). New tokens in `tokens.css`: `--color-delete-text #A32D2D`, `--color-delete-bg #FCEBEB`, `--radius-dialog 12px`, `--color-tag-warn-border #F2D9B0`, `--color-toast-divider #4A4A4A`.
- Classes start collapsed; any number open; open set kept per location while the page is open; a newly added class opens.
- Skeleton: shown immediately while `status === 'loading'` — 7 gray bars the height of class lines, `aria-busy="true"`.

### 8.3 Status → UI

| Result | Dialog save (add/edit rank or class) | Reorder (drag, Move up/down, Retry) | Delete confirmation | Undo |
|---|---|---|---|---|
| `ok` | close; toast with Undo; quiet reload | toast with Undo; quiet reload; clear "Not saved" + banner | close; plain toast `{name} deleted`; reload | toast `Undone`; reload |
| `no_access` | keep everything; call `onNoAccess()` (lock); dialog re-shown after unlock (§8.5) | `onNoAccess()`; reload after unlock | keep dialog state; `onNoAccess()` | `onNoAccess()` (toast is dropped by the lock) |
| `not_allowed` | `NOT_ALLOWED` in dialog, Save unavailable; `onRefreshProfile()` | banner `NOT_ALLOWED`; reload; `onRefreshProfile()` | close; banner; `onRefreshProfile()` | banner `NOT_ALLOWED` |
| `stale`, `not_found` | `STALE_DIALOG` in dialog, Save unavailable; quiet reload behind | banner `STALE`; reload | close; banner `STALE`; reload | banner `UNDO_STALE`; reload |
| `duplicate_name` | name-field error (duplicate text, using the typed name); Save unavailable until the name changes | — | — | banner `UNDO_STALE`; reload |
| `invalid` | `INVALID_DIALOG` in dialog | as `stale` | as `stale` | as `stale` |
| `not_empty` | — | — | — | banner `UNDO_NOT_EMPTY` |
| `error` (network etc.) | `SAVE_FAILED` in dialog; Save stays available | keep the new order on screen, amber `Not saved` tag on the moved row/class, banner `RANK_ORDER_FAILED`/`CLASS_ORDER_FAILED` + Retry + Dismiss | `DELETE_FAILED` in dialog; Delete stays available | banner `UNDO_FAILED` + Retry |

Banners (`ErrorBanner`: amber, IconAlertTriangle, `role="alert"`): one at a time (newest replaces), never auto-close, cleared by Dismiss, by a successful Retry, or by a location change. A dismissed reorder failure keeps its `Not saved` tag until the next reload; any reload shows the server order and clears the tag.

### 8.4 Writes

- Dialog saves **wait** for the result (fields read-only and Save/Cancel/Esc ignored while waiting). Only reorders are optimistic.
- **One write at a time**: while any write is in flight, other write actions are ignored (`aria-disabled` items, drag doesn't start, `N` ignored).
- **(amended v0.57)** Save is available (blue) whenever the form is valid — **including when nothing has changed**. It is unavailable (gray, `aria-disabled="true"`, still focusable) only while it can't be used: name empty/invalid or duplicate, any price error, a save in flight, or after a refused save (`STALE_DIALOG` / `NOT_ALLOWED`). Enter in a text field = Save when available. An edit form identical to the saved record → Save just closes, no RPC, no toast. Applies to the rank and class dialogs.
- Add rank form: name empty; prices + sparring copied from the class's current last rank, or empty prices (with the first-rank hint) for an empty class; Save needs a name and three valid prices.
- Edit class: the final-award field shows the **saved** value (`Not set` if none). Add class: starts on `Not set` (the new class goes to the bottom, nothing follows it).
- Undo per action (only the latest toast; refusals per §8.3):

| Action | Undo sends | Refused client-side when |
|---|---|---|
| Edit rank | `updateRank` back to the previous name/prices/sparring, `expectedVersion` = version returned by the save | — |
| Edit class | `updateClass` back to previous name + final award, `expectedVersion` = returned version | — |
| Add rank | `deleteRank(checkUndoAddRank(...).rpcArgs)` from the latest loaded data | `checkUndoAddRank` says `gone` (→ `UNDO_STALE`), `edited` (→ `UNDO_STALE`) or `isFinalAward` (→ `UNDO_AWARD`) |
| Add class | `deleteClass({ classId, expectedVersion:1, expectedRankIds:[], expectedLostAwardClassIds:[], onlyIfEmpty:true })` | class has ranks in loaded data (→ `UNDO_NOT_EMPTY`) |
| Reorder | `reorder*` with `expectedIds` = the order just saved, `newIds` = the order before | — |
| Delete | no Undo | — |

### 8.5 Dialogs (`Dialog.jsx`)

- Portal to `document.body` (outside the inert Shell). PC/tablet: centered, 12 px corners, dimmed backdrop. Phone (< 640): full screen with back arrow; the delete confirmation stays a small dialog on every device. Focus trap; initial focus on the first field (`data-autofocus`); `role="dialog"` (`alertdialog` for delete) with `aria-labelledby`.
- Esc, backdrop click and the phone back arrow close **only when nothing was changed** (dirty = values differ from what the dialog opened with); otherwise the dialog stays and shows `UNSAVED`. Cancel always closes and throws changes away. Esc while the final-award list is open closes only the list.
- **(amended v0.56)** Phone full-screen dialogs (no Cancel button there): the in-app back arrow and the phone/browser Back button (a history entry is pushed while the dialog is open) behave the same; with unsaved changes the `UNSAVED` note includes `Discard changes`, which closes without saving and cleans up the history entry. PC/tablet keep Cancel and get no link.
- **Lock rule**: while `screenLocked`, Testing dialogs, menus and sheets are **unmounted**; the form state (values, which dialog, errors) lives in the Testing screen and is re-shown after unlock with focus on the dialog's first field. Menus/sheets are not restored; a drag in progress is cancelled.
- *(amended belt review — preview first)* Sizes: rank dialog **760 px two columns on PC** (`(min-width:1024px) and (pointer:fine)`; left = name, Testing for, prices, sparring, meta; right = Belt section), **520 px one column on tablet** (name, Belt, Testing for, prices); class dialog unchanged. The Cancel / Save row (phone: the full-width Save) is **pinned to the bottom** of the dialog (sticky, top border) so it is never below the fold at any size incl. 1366×768; the delete confirmation keeps its normal footer.
- **Focus return** after close: the element that opened it if still on the page; else — rank dialog: that rank's row; new rank saved: the new rank's row; Add class saved: the new class's toggle; Add class cancelled: the Add class button; delete confirmation cancelled: the ⋯ button; rank deleted: the row now at the same index, else the previous row, else the class's Add rank button; class deleted: the next class's toggle, else the previous, else Add class.

### 8.6 Delete flow

⋯ → Delete rank / Delete class → **quiet reload first** → if the item still exists, build the confirmation from the fresh data (`describe*Delete`) and keep its `rpcArgs`; if not, banner `STALE`. Delete sends exactly those `rpcArgs`, so the server refuses (`stale`) if anything stated in the confirmation changed.

### 8.7 Final-award listbox (`FinalAwardSelect.jsx`, v0.51)

- Custom select-only combobox, identical on every device (no native picker). The field shows the current choice (`Not set` or the rank name) + IconChevronDown; `role="combobox"`, `aria-haspopup="listbox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant` while open; labelled by its field label.
- List (`role="listbox"`): `Not set` first, then `None — last rank doesn't promote` *(amended v0.62; a plain option, value `FINAL_AWARD_NONE`)*, then one `role="group"` per class from `finalAwardOptions` (heading = class name via `aria-labelledby`, not selectable), options `role="option"` with `aria-selected` on the current choice (blue tint). This class's own ranks are never listed. Max height ~236 px with a scroll bar; rows 32 px mouse / 44 px touch.
- **Opens scrolled to the top** (`Not set`, Little Tiger…), as approved. The active option starts on the current choice (announced by `aria-activedescendant`) and is scrolled into view on the first arrow press.
- Keys (closed): ↓, ↑, Enter, Space, Alt+↓ open; Home/End open on first/last option; a printable character opens and type-aheads. (Open): ↓/↑ move (no wrap, headings skipped), Home/End, PageUp/PageDown ±10, Enter selects + closes, Alt+↑ or Tab selects + closes, Esc closes without change, type-ahead (500 ms buffer, case-insensitive prefix match on option labels including `Not set`, searching forward from the active option and wrapping). Focus never leaves the combobox, so it stays on the field after closing. Mouse/touch: click an option selects + closes; click outside closes without change.

### 8.8 Keyboard

- **`N` shortcut** (`useShortcutN.js`): key `n`/`N`, no Ctrl/Meta/Alt, not a repeat → presses Add class **only when all** hold: Add class is shown (admin, not Both, status `ready`, not no-access), no dialog/menu/sheet/listbox open, screen not locked, no write in flight, no drag, focus not in `input`/`textarea`/`select`/`[contenteditable]`/`[role=combobox]`/`[role=listbox]`, and the device matches `(min-width: 1024px) and (pointer: fine)`.
- **Arrow-key row navigation** (`useRowArrowNav.js`, v0.52, reusable): rank rows (all open classes, DOM order) are focusable with a roving `tabIndex` (one row `0`, the rest `-1`; default the first visible row, then the last focused). With focus **on a row**: ↓/↑ move to the next/previous row (crossing into the next open class; no wrap; collapsed classes skipped), Enter opens the row's dialog (admin: Edit rank, staff: view). Arrows do nothing when focus is anywhere else (fields, buttons, menus). Tab moves between page areas as usual. Visible 2 px blue focus ring on the row.
- Menus: arrow keys between items, Esc closes and returns focus to ⋯; Move up/down keep focus on the moved item's ⋯ button.

### 8.9 Drag (`useReorderDrag.js`) — *every device (amended v0.63 — preview first; was PC mouse only)*

- *(amended v0.63/v0.64/v0.65 — preview first)* The grip is shown to admins on **every device** and a drag starts from the grip with a mouse (left button), a finger or a pen (`isPrimary` pointer) after 4 px of movement; the grip has `touch-action: none`, so a finger on the grip drags while a finger anywhere else on the row scrolls. The lifted copy + blue line and auto-scroll near the scrolling area's top/bottom work the same on touch. Esc cancels (keyboard). Move up / Move down in ⋯ stay on every device. The original PC-only rule below is replaced by this line. *(amended belt review — preview first)* Auto-scroll only moves while the dragged item's own list (its class's ranks, or the class lines) extends past that edge, so a held drag can't pull the view away from where the item can land.
- Grip shown only at `(min-width: 1024px) and (pointer: fine)`; starts on a primary-button `pointerdown` with `pointerType === 'mouse'` after 4 px of movement. Ranks move only within their class; class lines among class lines (only the class line is dragged).
- While dragging: lifted row gray (surface), a 2 px blue line at the landing spot, faded row at the origin, text selection off. Auto-scroll when within 48 px of the viewport top/bottom.
- Drop on a new spot → optimistic order + reorder RPC (§8.3). Same spot → nothing. **Esc**, `pointercancel`, window blur, or the screen locking → cancel, nothing changes.
- The grip is focusable (for its tooltip) but keyboard reordering is ⋯ → Move up / Move down. Drag is off for staff, on Both, and while a write is in flight.

### 8.10 Reloads

Quiet reload after every write result except `no_access`; on location change (first load per location shows the skeleton); after unlock; when the tab becomes visible. **Never** any data request while the switcher is on Both. Responses for an old request are ignored.

---

## 9. Design review — Playwright screenshots (orchestrator)

Viewports: **PC** 1280×800 mouse · **Tablet** 820×1180 touch · **Phone** 390×844 touch · **Narrow** 320×640 touch. Preview mode. Screenshots and scripts live **outside the repo** (`/home/claude/work/shots/`); check `git status` is clean afterwards.

| Id | Screen | Viewports |
|---|---|---|
| S01 | Admin list, Worcester, Group A open | PC, Tablet, Phone, Narrow |
| S02 | Little Tiger + Group B open (sparring Yes; final-award tags) | PC |
| S03 | Rail/bottom bar Home → Testing (PC hover tooltip) | PC, Tablet, Phone |
| S04 | Edit rank Yellow; last rank High Green (read-only award); duplicate-name error | PC; Tablet; Phone |
| S05 | Unsaved-changes note after Esc / back arrow | PC, Phone |
| S06 | Toast `Rank saved · Undo` (+ hovered: timer paused) | PC, Tablet, Phone |
| S07 | Add rank: empty name (Save gray); name typed | PC, Tablet; Phone |
| S08 | Add class: More details closed; opened | PC; Tablet, Phone |
| S09 | New empty class open + `Class added · Undo` | PC, Tablet, Phone |
| S10 | First rank in an empty class (empty prices + hint) | PC, Phone |
| S11 | Last rank with `Final award not set — choose one in Edit class` (Group D) | PC, Phone |
| S12 | Edit class with the listbox open at the top; keyboard-active option after ↓ | PC, Tablet, Phone |
| S13 | Mid-drag rank; mid-drag class | PC |
| S14 | ⋯ menu on last rank (Move down gray); phone bottom sheet with Cancel | Tablet; Phone |
| S15 | Failed reorder (`failNextSave`): Not saved tag + banner with Retry | PC, Phone |
| S16 | Delete rank menu → confirmation → `High Green deleted` | PC |
| S17 | Delete class confirmation (lost-award sentence) | Tablet |
| S18 | Delete Blue confirmation → Group A shows the amber reminder | Phone, PC |
| S19 | Stale: `simulateOtherAdminEdit()` then Save → `STALE_DIALOG` | PC |
| S20 | Staff: read-only dialog; View buttons; phone list + read-only page | PC; Tablet; Phone |
| S21 | Both blocked | PC, Tablet, Phone |
| S22 | Empty school — admin and staff (`clearSchool`) | PC, Phone |
| S23 | Skeleton (`setTestingDelay(3000)`) | PC |
| S24 | Arrow-key focus ring on a rank row | PC |
| S25 | Lock with a dialog open → lock screen, no dialog → PIN → dialog back with typed values | PC (3 shots) |
| S26 | Regressions: Home, account menu, Change PIN, Change password | PC, Phone |

Functional checks (no screenshot): `N` opens Add class on PC; `N` does nothing in each blocked case of §8.8; listbox keys (§8.7) incl. type-ahead and Esc; Undo for each action in §8.4 incl. each refusal; no horizontal scroll at 320 px (`scrollWidth <= clientWidth`) on the list and every dialog; toast timer pause/resume; no request is sent while on Both.

---

## 10. Resolutions made in this contract (for Jeffrey to check)

1. **Seed final award by name**, first later class containing it, else Not set — Jeffrey's note replaces plan §4 ("else first overall") and §8.6 ("map by old rank id"). Compare is normalized + case-insensitive.
2. **Names**: tabs/newlines/no-break spaces are collapsed into one space (not rejected); other control characters are rejected; length counted in characters.
3. **Edit class shows the saved final award** (Not set stays Not set). The v0.42 "defaults to the first rank of the next class" is realized by the seed and is not re-proposed when editing, so renaming a class can't silently set an award.
4. **Chosen final-award rank deleted meanwhile → `stale`** (not `invalid`); other-school / own rank → `invalid`. A residual FK race still maps to `invalid` per plan §8.10.
5. **Unique violation on a position** (not a name) → `stale`; deadlock/serialization → `stale`.
6. **Delete-rank confirmation is also protected by the class version** (`p_expected_class_version`), because its sentence names the class's final award. Rank list compared in order; class delete compares sets.
7. **RPC JSON is snake_case**; `api.js` converts to camelCase. Non-ok results carry only `status`.
8. **Position-only updates** don't touch version, `updated_at` or "Last changed by".
9. **No-op saves**: an unchanged edit form just closes (no call, no toast); the server also skips the version bump and log row.
10. **`finalAwardState`** is `null` on every rank except the last.
11. **Wording not in the mockup** (§7): staff reminder `Final award not set`; first-rank Add rank line `Added as the first rank of {class}.`; delete sentences for "last rank, award not set" and "only rank"; `NOT_ALLOWED`; `STALE_DIALOG` (adds "Cancel, then open it again to see the latest."); all Undo-refusal texts; `Undone` toast; price and name error texts; `LOAD_FAILED`; phone sheet header lines.
12. **Testing toasts have no check icon** (as mocked up); account toasts keep theirs.
13. **Listbox**: opens at the top (approved) but the keyboard's active option starts on the current choice; first arrow press scrolls to it.
14. **Grip** is focusable for its tooltip but does nothing from the keyboard (⋯ → Move up/down is the keyboard path).
15. **A dismissed failed reorder** keeps its Not saved tag until the next reload, which shows the server order.
16. **Preview data**: White, Group C, Group D and Teen/Adult prices and most of their rank names are placeholders (marked) until the real export.
17. Undo of a refused/failed Undo is not offered; only the latest toast's Undo exists.

Open for Jeffrey (not decided here): "Deputy" → "Deputy 1" naming (seed leaves Group D Not set); the export query is run by Claude read-only after this build, with his review of the printed table before any write.
