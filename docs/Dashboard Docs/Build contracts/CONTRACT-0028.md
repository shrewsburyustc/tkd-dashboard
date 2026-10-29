# Contract 0028 — Star start times 6:00 AM–10:00 PM every 5 minutes (migration `0028_star_start_times.sql`)

**Status: DRAFT — built and tested locally (PGlite), waiting for review and Jeffrey's OK.** Nothing is applied to Supabase without his OK for that paste. Migration number 0028 reserved for Star in CLAUDE.md's migration table (2026-10-28).

| Source (in this order of authority) | |
|---|---|
| This contract | wins for 0028 |
| Rulebook v1.019 (design-review item S12): every time list 6:00 AM–10:00 PM every 5 minutes | the decision |
| CONTRACT-0006 §2.2 (the start-time rule) | the rule being widened |
| Handoff §6 (security rules, non-negotiable) | |

---

## 1. What changes

- **One function:** `public.star_start_time_is_valid(p_time time) returns boolean` (0006 section 1a) is replaced with `create or replace`. New rule: `p_time` from **06:00 to 22:00**, minutes a **multiple of 5**, **seconds 0**; NULL → false.
- Kept exactly: `language sql`, `immutable`, `set search_path = ''`, not security definer, owner, and `revoke execute … from public, anon, authenticated, service_role` (nobody in the app may call it).

New body:

```sql
select coalesce(p_time between time '06:00' and time '22:00'
                and extract(minute from p_time)::integer % 5 = 0
                and extract(second from p_time) = 0,
                false);
```

## 2. What does not change

- The four users of the rule are **not** replaced; they call the function and pick up the new rule: the table rule `star_events_start_time_check` (0006), `star_add_event` (0006), `star_update_event` (0023's version) and `star_set_private` (0006).
- No table, column, rule, other function, right or data. `star_candidates.private_time` has no range rule of its own (only "both or neither" with `private_on`), so nothing else hard-codes 08:00 / 20:00 / 15 minutes in 0006 or 0023.
- The app's Start time / private time **lists** stay 8:00 AM–8:00 PM every 15 minutes (the shared time list is a later step). The app's validator (`src/lib/star/starEventRules.js` `startTimeIsValid`) and therefore the preview fake (`mockStarEvents.js`, `mockStarCandidates.js`) follow the new rule, so preview answers like the database after 0028.

## 3. Why it is safe

- The rule only **widens**: every old time (8:00–20:00 on a 15-minute step) is inside 6:00–22:00 and 15 is a multiple of 5. Every saved event start time and private testing time stays valid. (Postgres doesn't re-check saved rows when a table rule's function is replaced — irrelevant here, since nothing allowed becomes refused.)
- Proof on production before pasting: `supabase/tests/0028_preapply_check.sql` must answer `body_is_0006 = true` and 0 in all four counts.
- Rights: unchanged and re-stated; nothing to `anon`; no security definer added.

## 4. Order of release

1. 0028 (after 0006 and 0023; production order … 0027 → 0026 → **0028**) — SETUP.md "Migration 0028", 0028a–0028d.
2. Only **after** 0028 is live: the app version whose time lists offer 6:00 AM–10:00 PM every 5 minutes. If the app went first, a save at e.g. 6:05 AM would be refused as `invalid`.
3. The current app works unchanged before and after 0028 (its list offers only old times, which both rules accept).

## 5. Undo plan

- File: `supabase/manual/0028u_undo_star_start_time.sql` (SETUP.md 0028e). It puts back 0006's exact function (section 1a, word for word) with its revoke.
- **It refuses** (raises "0028 undo refused: …", changes nothing) while any `star_events.start_time` or `star_candidates.private_time` breaks 0006's rule. Without that guard the undo would **succeed** and leave such rows behind (Postgres doesn't re-check them), and every later save of such an event would then fail the table rule and answer `invalid`.
- Check first: `0028_preapply_check.sql` → `events_bad_old` and `privates_bad_old` must be 0; otherwise change those times in the app. Put the app's lists back to the old range **before** the undo.
- Afterwards `0006_fingerprints.sql` must equal the record taken in 0028a; redo = paste 0028 again.

## 6. Tests and checks

- `supabase/tests/0028_tests.sql` (production, begin … rollback): S1 the rule (valid 6:00, 6:05, 21:55, 22:00 …; invalid 5:55, 22:05, 6:03, 06:00:30, NULL …; exactly 193 valid minutes; all 49 old times still valid), S2 catalog + rights (anon / authenticated / service_role / star_registrar can't run it; search_path set), S3 the users: `star_add_event`, `star_update_event`, `star_set_private` and the table rule.
- `supabase/tests/0006_tests.sql`: the refused times in T4b / T4c / T6e changed to times outside **both** rules (05:55, 22:05, 10:03, 10:32), so it passes before and after 0028.
- `supabase/tests/0028_fingerprints.sql`: one row; tested value `d0548ce90322fdb063bb02bd3e8b77d1 lang=sql volatility=i returns=boolean definer=false settings=search_path="" owner=postgres rights=postgres:EXECUTE`.
- PGlite `run.mjs` step0028 (production order): pre-apply check, only `star_start_time_is_valid`'s body moves (0006 and 0028 files), 0028 / 0006 / 0023 tests, re-run safety, the undo refused with a planted 6:05 AM event, then the undo gives back every fingerprint, and the redo.
