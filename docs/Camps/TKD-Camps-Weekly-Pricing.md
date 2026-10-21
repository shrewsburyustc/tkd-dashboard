# Camps — weekly pricing and longer camps (migration 0022, rulebook v0.717)

**Status:** building, 2026-10-21. Jeffrey (after the CP6 phone test): "We charge max per week … the most days should be 5 days for pricing. If it's 2 weeks, then it will charge them for 2 weeks", "The camp is limited to only 10 days". Claude's restatement, confirmed by Jeffrey ("Yes, that seems right. Get it done, change it, and I'll test it again. Make sure it works."): grid of at most 5 rows; each week priced on its own by the days the camper comes that week; weeks add up; 2 + 2 days = two 2-day prices; 10-day limit goes away; early/regular and member/non-member unchanged; pizza (not-for-all-days extras) per week.

This file is the **single spec** the database (0022) and the app follow. Where they must agree, the rule is written once here.

## The rules

**R1. Week.** A camp's days are grouped into calendar weeks **Monday–Sunday** (Postgres: `date_trunc('week', day)`; app: `campWeeks()` in `src/lib/camps/campRules.js`, which already does exactly this).

**R2. Grid size.** `W` = the largest number of camp days in any one week of the camp (1–7; in practice ≤ 5). The price grid has exactly the rows **1 … W** (`day_count` 1..W), each with the 4 prices (member/non-member × early/regular). Add camp / Edit camp refuse a grid that isn't exactly 1..W (`invalid`). Examples: a 1-day camp → 1 row; Mon–Fri ×2 weeks → 5 rows; Thanksgiving Wed + Fri → 2 rows; Test 2 (Oct 26–30, Nov 9–11, Nov 16–17) → 5 rows.

**R3. Price of a camper** (`base_cents`) = the sum over the weeks the camper comes of `grid[days the camper comes that week]`, all at the same price kind (early/regular decided by the sign-up date as today, v0.700) and the same member flag. 5 + 5 = 2 × row 5; 5 + 3 = row 5 + row 3; 2 + 2 = 2 × row 2. It is still stored as a snapshot in `camp_campers.base_cents` (Edit camp never re-prices existing campers — unchanged). Edit details re-prices with the same rule (unchanged trigger: days or member change).

**R4. Camp length.** A camp has **1 to 60 days** (was 10). Every "at most 10 days / 10 day ids / 10 only-on dates" limit becomes 60. Extras per camp (10) and extras per child (10) stay 10. Children per sign-up stay 1–3.

**R5. Money caps.** One camper may cost up to **$10,000** (1,000,000 cents; was $2,000): `base_cents`, a camper's total, a payment amount (and a reversal −1,000,000) and Edit payment. The Function's family total cap becomes 3,000,000 (3 children).

**R6. "Not charged to all-days campers" (e.g. pizza) is per week.**
- A **per-day** extra marked not-for-all-days may not be chosen on a day that lies in a week where the camper comes on **every camp day of that week**. (Week 1 all 5 days → pizza included that week, can't be bought; week 2 only 2 days → may buy pizza on week-2 pizza days.)
- A **once** extra marked not-for-all-days: refused only if the camper comes on every day of the whole camp (unchanged meaning).
- The roster's pizza count on a day = campers who chose pizza that day **+** campers who come every camp day of that day's week (and are on that day).
- Enforced in the same two places as today (the helper `camp_camper_extras_are_ok` and the `camp_camper_extras` trigger), and mirrored in the app (`childProblem`, `extrasFor`, `extraCountOnDay`, Camper detail).

**R7. Templates.** `camp_templates.day_count` now means **"days in a week" = the grid's rows (1–7)** (was the camp's number of days, 1–10). Save as template stores `W` and the 1..W grid. Edit template: "Days per week" select 1–7, grid 1..that. Use template fills the grid as before (sized to the new camp's W).

**R8. Nothing else changes:** early/regular, member/non-member, `price_changed` / `camp_changed` answers, check-in, Mark paid (whole amount owed), Finance (it reads payments only), the week switcher (v0.716), existing campers' prices.

## Words on screen (app)
- Grid row labels: `1 day`, `2 days`, … ; the last row gets ` (full week)` when W > 1 (was "(all days)").
- Prices hint: "Prices are per week. Each week a camper comes is priced by the row for how many days they come that week, and the weeks add up. Early prices apply to sign-ups up to the end of {date}."
- Family form / Check step / Camper detail price line: one week → as today ("3 days · $180"); more weeks → one line per week the child comes, "Week of Jul 6 · 5 days $275", then the child's total.
- Errors: "A camp can have up to 60 days."; checkbox label "Not charged to all-days campers" gets the hint "Included in any week the camper comes every day."
- Edit template: "Days per week" (1–7).

## Database (0022_camps_weekly_pricing.sql)
Replaces (create or replace / drop + create where a signature changes) only the 0013 objects that encode R2–R7; alters the affected checks (`camp_prices.day_count` 1–7, `camp_templates.day_count` 1–7, `camp_campers.base_cents` 0–1,000,000, `camp_payments` amount ±1,000,000). One transaction, `set search_path = ''`, same grants/revokes as 0013, change log unchanged. Does **not** touch 0017's Finance functions. Applied by Jeffrey in the SQL Editor; SETUP section "## Migration 0022: …" (0022a…); run.mjs step `step0022`; tests `supabase/tests/0022_tests.sql` + `0022_fingerprints.sql`; every earlier test file must still pass on a database built in production order + 0013 + 0017 + 0022 (update `0013_tests.sql` where a rule changed, as 0006_tests was updated for 0020).
