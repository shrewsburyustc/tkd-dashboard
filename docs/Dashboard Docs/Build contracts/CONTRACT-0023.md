# Contract 0023 — Star result email texts, registration stays closed on edit, CSV row keys (migration `0023_star_result_texts.sql`)

**Status: DRAFT — built and tested locally (PGlite), waiting for review and Jeffrey's OK.** Nothing is applied to Supabase without his OK for that paste. Migration number 0023 reserved for Star in CLAUDE.md's migration table.

| Source (in this order of authority) | |
|---|---|
| This contract | wins for 0023 |
| Rulebook rows "Star Results: gap mockups approved (decided v0.514)" (R3 = B, R11, Q5 A) and "Star testing: an edit never reopens registration by itself (decided v0.504)" | decisions |
| `docs/Testing/Star Testing/TKD-StarTesting-Phase6-Gap-Mockups.html` — R3 (the three starting texts, word for word) and R11 (proposals 42–53) | wording, blanks, checks |
| `docs/Testing/Star Testing/TKD-StarTesting-Remaining-Build-Plan.md` §4 M5 | the M5 problem |
| CONTRACT-0006 §1 (general rules, statuses, error mapping, lock order, house columns) and §4 (grants) | patterns copied, unchanged |
| Handoff §6 (security rules, non-negotiable) | |

**Words:** *blank* = a name in braces, e.g. `{first name}`, that the app fills in per candidate. Every other term as CONTRACT-0006.

---

## 1. Scope

1. A new table `public.star_result_texts` (three rows) + one admin write function `public.star_set_result_text` + one helper `public.star_result_text_problem`.
2. **M5:** `public.star_update_event` replaced (`create or replace`, same signature, rights, answers) so an edit that would make registration open again by itself also turns the switch to Closed **in the same call**.
3. **CSV row keys:** `public.star_results_csv` replaced (same signature, rights, checks, statuses, download log written first) with three more keys per row (§6b).
4. Nothing else of 0001–0021 changes. The subject line ("Your star testing result — U.S.T.C.") stays fixed in the app (v0.248); it is not stored.

## 2. Table `public.star_result_texts`

| Column | Type | Rule |
|---|---|---|
| `id` | uuid pk `star_result_texts_pkey` | house column (`change_log.record_id` is a uuid, so the history needs it) |
| `kind` | `text not null` | `star_result_texts_kind_key unique`; `star_result_texts_kind_check check (kind in ('passed','makeup_d','makeup_below'))`; immutable |
| `body` | `text not null` | `star_result_texts_body_check check (star_result_text_problem(kind, body) is null)` (§4) |
| `version` | `integer not null default 1` | `check (version >= 1)` |
| `created_at`, `updated_at`, `created_by`, `updated_by`, `created_by_name`, `updated_by_name` | as CONTRACT-0006 §1.8 | set by the trigger |

**Decided here (the mockups said `kind` is the key):** `kind` is the natural key (unique, immutable, what the app and the function use), but the primary key is the house `id`, because 0003's `change_log_write()` logs `record_id = id::uuid` — a text primary key would break the history.

**Triggers** (as 0006 §2.11): `star_result_texts_before_write` = `star_before_write('id,kind', '')`; `star_result_texts_log` = `change_log_write()` after insert, update and removal; `star_result_texts_no_truncate` = `testing_refuse_truncate()`.

**Seed** (tagged `tkd.action = 'star_seed'`, actor "Database admin", `on conflict (kind) do nothing` — never overwrites an admin's text): R3's three starting texts word for word, with the names and numbers turned into blanks. Line breaks are `\n` (E-strings), so the file's line endings never get into a text; apostrophes are U+2019 as drawn.

## 3. Rights

- RLS on. One rule: `star_result_texts_select_with_access for select to authenticated using ((select public.has_data_access()))` (made if missing, then `alter policy` to exactly this, so a re-run repairs a changed rule).
- `revoke all … from public, anon, authenticated, service_role`; then `grant select (id, kind, body, version, created_at, updated_at, created_by_name, updated_by_name) … to authenticated`. **Never** `created_by` / `updated_by`. Nothing to `anon`, `service_role`, PUBLIC, `star_registrar` or `testing_registrar`. No write rights for anyone: the only way to write is §5.
- The app reads the rows directly (as Rubrics and prices reads `star_dan_settings`); no read function.
- Execute: `star_set_result_text` → `authenticated` only; `star_result_text_problem` → nobody (helper; immutable, security invoker). `star_update_event` keeps 0006's rights (authenticated only).

## 4. The text rules — `star_result_text_problem(p_kind text, p_body text) returns text`

NULL = fine; otherwise the **first** problem, in this order:

| Code | Rule |
|---|---|
| `kind` | kind not `passed` / `makeup_d` / `makeup_below` (exact, lower case) |
| `empty` | null or `''` |
| `too_long` | more than 2,000 characters (`char_length`, code points — the same count as the app's `[...text].length`) |
| `bad_character` | a hidden / control character: 1–9, 11–31, 127–159, U+200B–200F, U+202A–202E, U+2060–2064, U+2066–2069, U+FEFF (Forms' `forms_bad_text(true)` list; line break 10 allowed, carriage return 13 not) |
| `first_line` | the first line (up to the first line break) is empty or only spaces / no-break spaces (R2 proposal 11's empty-email guard) |
| `unknown_blank` | a `{…}` (no braces inside) whose name isn't one of the 12 blanks — exact spelling and capitals (`{Dan}`; `{dan}`, `{ total }`, `{}` are unknown) |
| `blank_not_for_kind` | a real blank this kind can't fill |
| `stray_brace` | a `{` or `}` left over after removing every `{…}` (decided here: a lone brace is almost always a half-typed blank, so Save is blocked) |
| `missing_required` | `{total}` or `{pass mark}` missing (every kind, v0.141), or `{subjects to work on}` missing (both make-ups) |

**Blanks per kind** (proposal 46):

| Kind | Allowed | Required |
|---|---|---|
| every kind | `{first name}` `{full name}` `{event}` `{Dan}` `{testing day}` `{total}` `{pass mark}` `{max}` | `{total}` `{pass mark}` |
| `passed` | + `{star earned}` | — |
| `makeup_d` | + `{D subjects}` `{subjects to work on}` `{below-pass-mark note}` | + `{subjects to work on}` |
| `makeup_below` | + `{subjects to work on}` | + `{subjects to work on}` |

The app shows the specific message (R11 proposal 48); the database answers only `invalid`. The app's check must give the same yes/no as this helper.

## 5. `star_set_result_text(p_kind text, p_expected_version integer, p_body text) returns jsonb` — **A**

`language plpgsql volatile security definer set search_path = ''`, fully qualified names, no argument defaults, whole body in 0006 §1.4's `begin … exception … end`, minus the `duplicate_name` branch (this table has no name rule, so any `unique_violation` → `stale`). Action tag `star_set_result_text` (new; added to 0006 §6.7's list).

| Step | Check | Answer |
|---|---|---|
| 1 | `has_data_access()` not true | `{status:'no_access'}` |
| 2 | `is_admin()` not true | `{status:'not_allowed'}` |
| 3 | any argument null, or `star_result_text_problem(p_kind, p_body)` not null | `{status:'invalid'}` |
| 4 | lock the row `for update` by kind; missing | `{status:'not_found'}` (only possible after a removal outside the app) |
| 5 | `version <> p_expected_version` | `{status:'stale'}` |
| 8 | tag, update `body` (same text → no write, no bump, no log), untag | `{status:'ok', version, body}` |

The text is stored exactly as sent (no trimming). **Lock order:** only the text row; it touches no event, candidate or Dan row, so it can't deadlock with any other Star write. **Undo** (toast) = the same call with the old text and the new version. Changing a text never changes "Sent" (`star_sent_state` compares results, not wording — proposal 52).

## 6. M5 — `star_update_event` (replaces 0006 §6.2's)

Identical to 0006 (arguments, ordered checks, `{status, version}` answer, owner, rights, "same values → no write") with one addition at step 8: with `v_after` = the locked event with the new `testing_date` and `auto_close_on`,
`keep_closed = star_event_state(old, today) <> 'open' and star_event_state(v_after, today) = 'open'`.
When true the same `update` also sets `registration_open = false`: one write, one version bump, one history row (`registration_open` true → false), `first_opened_at` kept. This covers both v0.504 cases (a finished event moved into the future; an upcoming event closed by a passed closing date that is removed or moved later) and matches the app's `editWouldReopen`. The answer is unchanged, so the app needs no change: its follow-up `star_set_registration(…, false)` now finds the switch closed and writes nothing. Opening stays by hand.

## 6b. `star_results_csv(p_event_id uuid, p_dan integer) returns jsonb` (replaces 0006 §6.6's) — **A**

Identical to 0006 (no_access → not_allowed → invalid → not_found; the `star_downloads` row written first, in the same call; belt order; active candidates only; volatile; 0006's revoke + grant to `authenticated`). Each row gains:

| Key | Value |
|---|---|
| `candidate_id` | the candidate's id — the app matches rows by id, never by values |
| `paid_on` | `paid_on` of the newest `kind = 'payment'` row that has no reversal (newest by `recorded_at`, then id — exactly `star_roster`'s `paid_on`); refunds and reversals never change it; null when none (R8 proposal 34) |
| `sent.result_status` | `'passed'` / `'makeup'` of the newest send not undone (from `star_sent_state`), next to `marked_at`, `marked_by_name`, `matches`; `sent` stays null when nothing was sent |

The return type is jsonb, so the extra keys are compatible. `0006_tests.sql` T10a's exact key check was widened to accept both 0006's 18 keys and 0023's 20 (as its C9 accepts both versions of `current_session_id`).

## 7. Tests and checks

- `supabase/tests/0023_tests.sql` (R1 seed · R2 who can read · R3 check order and every invalid case · R4 ok, history, no-op, Undo, 2,000 boundary, kind immutable, no truncate · R5 helper codes · R6 M5 cases incl. "nothing changes" cases · R7 catalog). Self-checking, rolled back, "ALL 0023 TESTS PASSED".
- `supabase/tests/0023_fingerprints.sql`: the 3 functions, the table's rights, the rule, the 3 triggers, the 3 seed rows (version + md5). Connector-safe.
- Expected change elsewhere: **only** the `star_update_event(...)` and `star_results_csv(...)` lines of `0006_fingerprints.sql` change.
- `0023_tests.sql` R8: the new keys (a payment, a later one reversed, a refund; a send then a re-send, then the re-send undone; a newest payment reversed), staff `not_allowed`, locked `no_access`, the download log still written (whole event and one Dan).
- PGlite `step0023` in `supabase/tests/pglite/run.mjs` (live-order database; 0006/0005/0003 tests after 0023; re-runs; 0006 re-run then 0023; minimal database).
- Re-run order: a 0006 re-run puts 0006's `star_update_event` back — re-run 0023 straight after.
- The migration is pasted by hand in the SQL Editor; it contains the word delete only in the log trigger (`after insert or update or delete`, as 0006), so Supabase may show its destructive-operations warning. `0023_fingerprints.sql` (run through the connector) contains neither refused word; run.mjs checks it.
- **Undo:** `supabase/manual/0023u_undo_star_update_event.sql` = 0006's exact `star_update_event` and `star_results_csv`, each with its revoke/grant; PGlite proves it gives back 0006's fingerprints for both and that 0023 again restores them. The app must stop using the new CSV keys first. The table and its two functions stay (harmless while the app doesn't use them).

## 8. Paste and verify

`supabase/SETUP.md` → "Migration 0023: Star result email texts, registration stays closed on edit, CSV row keys" (0023a–0023e).
