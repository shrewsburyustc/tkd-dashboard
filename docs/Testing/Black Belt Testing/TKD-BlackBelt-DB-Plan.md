# Black Belt testing — database plan (proposed migration 0016)

**Status:** DRAFT 2026-10-19, revised the same day after a security review (19 findings applied). Nothing answered yet, no SQL, no contract. Nothing is applied to Supabase without Jeffrey's OK for that paste.
**Built from:** rulebook v0.900 (every Black Belt row: v0.204, v0.205, v0.209–v0.213, v0.216–v0.220, v0.224, v0.900), rulebook §5 (privacy), handoff §6 (security rules), `TKD-BlackBelt-Plan.md` (§4, §6, §7), `TKD-BlackBelt-Status.md` §3b, `Finance-note-draft.md`, the three approved mockups (Cycles, Form, Candidates), `Inventory/Old-Spreadsheet.md`, Star's DB plan and `CONTRACT-0006.md`, the real migrations `0005_testing_events.sql`, `0006_star_testing.sql`, `0010_testing_results.sql`, and Finance's `0011_finance.sql` + `TKD-Finance-Status.md` (read-only, finance worktree).
**Words used:** "rule" = handoff §6 or the rulebook. "0005" = Color Belt's live migration, "0006" = Star's, "0011" = Finance's. "Template" = what admins keep on **Rubric and prices**; "cycle copy" = the copy a cycle takes of it. A **security-definer function** runs with its owner's rights, so the app can write only through it, never straight into a table. A **guard trigger** is a small database rule that runs before every change to a table and can refuse it.

---

## 1. What this migration must do (in one paragraph)

Store everything the 26 approved screens show, for **cycles, the family form, candidates and payments** (build phases B1–B2): the template (payment plans with amounts per Dan per payment, Kukkiwon fee per Dan, waiver text versions, the two "keep signed waivers" settings); cycles with their list of testing days (each with the parts graded that day and an optional second part), deadlines, each plan's due dates, an "Offer this plan" tick and the cycle's own copy of plans and prices; two public link codes per cycle; candidates (from the form or the desk) with a BB-#### reference, their signed or paper waiver, possible-duplicate state and withdraw/restore; an append-only payment ledger with reversal rows, refunds and returned checks, built so Finance can read it later; and the reads behind the roster, the candidate detail, the receipt and the family form. The Payments tag, balance, late / next due, overpaid and the cycle status tag are **worked out every time, never stored** (Star's results rule, v0.158). **Grading is not in this migration** (it waits for Master Jeong's part A answers), but nothing here may block it (§3.5). Every handoff §6 rule applies: RLS on every table, `revoke … from public, anon, authenticated, service_role` on every `bb_` object, then only the needed grants, nothing for `anon` or `service_role`, writes only through security-definer functions that check `has_data_access()` first and answer `{status: …}`, every change in `change_log`, signatures and signers' names never logged ("on file" only), DOB and email never in lists.

## 2. Facts that shape the plan

1. **What's live.** 0005 (Color Belt: `testing_*` tables and ~45 functions, login `testing_registrar`), 0006 (Star: 16 `star_*` tables, login `star_registrar`) and 0010 (Color Belt results) are in production. 0011 Finance is built on its branch. Black Belt must not reuse or change any of their names, grants or tests. **`bb_` is unused** anywhere in the repo, so every new object starts with `bb_` and the new login is `bb_registrar`.
2. **Migration number.** 0011 Finance, 0012 Prospects, 0013 Camps, 0014 Color Belt phase 4 and 0015 family history are claimed, so this plan proposes **0016**. **It must be reserved with the Main session before any SQL is written** (0010 was once claimed twice; plan §10).
3. **A cycle is not a Star event.** A Star event is one day; a Black Belt cycle has any number of testing days (v0.209), two deadlines and due dates per plan payment (v0.217). Both schools share it, each candidate has a home school (v0.58 pattern). So **the cycle row replaces Star's event row as the first per-cycle lock**.
4. **Lock order (for the reviewer to check).** A *lock* makes other saves wait their turn; taking locks in the same order everywhere means two saves can never wait on each other in a circle (a *deadlock*). **Everywhere: `bb_settings` → cycle → candidate(s) → payment.**
   - Template edits and the keep-years setting lock the one `bb_settings` row `for no key update`; Add cycle and **Copy prices again** lock it `for share` first, then the cycle, so neither can copy a half-saved template. (Simpler than Star's "Dan rows in Dan order".)
   - **Record payment, every payment action, Copy prices again and Delete cycle** lock the cycle row first, then the candidate, then the payment row.
   - **Resolve duplicate** locks the cycle, then **both candidates in id order**.
   - Public register: the cycle `for no key update`. Signature purge: `for update … skip locked` (never waits).
   - Every function's header states its lock order; PGlite runs on one connection, so the order is proved by review only.
5. **Money caps.** 0005 and 0006 cap one payment row at **$1,000** (100 000 cents), and 0005's fee check `testing_cents_is_valid` allows only whole dollars $0–$1,000. Black Belt fees are bigger: 4th Dan in full **$2,700** + Kukkiwon $170 = $2,870 in one check; 4th Dan per payment $900. So Black Belt gets **its own amount checks** (§8 S3); it never calls `testing_cents_is_valid`. Every sum of money is added up as `bigint` (a big whole number), never `integer`, so no total can overflow.
6. **Finance fit (0011).** Finance reads `testing_payments` and `star_payments` in its own internal function (`finance_chain_steps`), never through a grant. It knows three kinds (payment, refund, reversal) and recognises an **edit** as "a reversal plus a new payment written in the same transaction, with the same `recorded_at` and the same `recorded_by`". For Star it takes the school from the **candidate's current school**. So:
   - Black Belt's Edit payment writes exactly that pair (§4, as 0006's `star_edit_payment`).
   - A **returned check** is a new kind Finance doesn't know, and the school stored on each row differs from Star. Finance adds Black Belt to its own function in its own later migration (and widens `finance_day_closing_items.source`, today `color_belt` / `star`). **0016 grants Finance nothing and changes no Finance object.** The columns Finance's function may read are listed in §8 S17.
   - Finance's two open questions for Jeffrey (does Black Belt money belong in the school's Daily report at all, since checks go to Master Jeong; a bounced check on a closed day) **don't block this migration**: the ledger stores the same facts either way.
7. **Signatures are kept for years, not 90 days.** Color Belt and Star delete a drawn signature 90 days after the testing day, inside staff reads. Black Belt keeps the signed waiver for a set time (v0.213), in the shape v0.900 approved: "N years after the last testing day; under-18s until 3 years after they turn 18, if later". That is **two settings**, both from the insurer:
   - **N1** = years after the cycle's last testing day; **N2** = years after the candidate's 18th birthday.
   - A waiver is due for deletion on or after **`greatest(last testing day + N1 years, DOB + 18 years + N2 years)`** (for an adult the second date is already past, so N1 decides).
   - The signer's name is part of the legal record, so it is masked in `change_log` like the signature (`change_log` is append-only, so anything logged there would survive the deletion).
   - "Under 18" for who signs is counted on the **first testing day** (v0.213), worked out by the database from the DOB **every time it is read** (§3.3).
8. **The public form path** (0005 pattern, Star's own-login choice, decided for Black Belt in v0.204 / plan §6): a Cloudflare Pages Function → Hyperdrive → a restricted login that can run **exactly two** functions.
   - Today `functions/_lib/register.js` reads one `PUBLIC_REGISTRATION` switch, `db.js` is wired to Color Belt's two functions, and **`turnstile.js` hard-codes the action `'register'`**. All three are **shared files** that need a small change for a third form (listed in every summary). Star planned `/star/<code>`, `functions/api/star/[code].js`, `HYPERDRIVE_STAR`, `STAR_PUBLIC_REGISTRATION`; Black Belt copies that: proposed `/black-belt/<code>`, `functions/api/black-belt/[code].js`, `HYPERDRIVE_BB`, `BB_PUBLIC_REGISTRATION` (default off), Turnstile action `bb_register`.
   - The rate-limit table `testing_public_attempts` (0005) is shared: 20 tries per hour per visitor key, counted across all forms, **only if every Function makes its visitor key with the same `CLIENT_KEY_SECRET`** (otherwise each form's keys differ and the limit is per form; the contract states which). Outcomes are prefixed `bb:`. The "200 per cycle" count is **logged only, never a refusal** (a busy cycle must not lock families out).
   - 0016 runs **no** `revoke` or `grant` on any 0005 object (it would undo 0005's grants).
   - **What a separate login does and doesn't protect:** Pages Function bindings (Hyperdrive configs, secrets) are shared across the whole Pages project, so a compromised Function could reach any form's connection. The separate login protects **inside the database** (each login can run only its own two functions); it is not a wall between the Functions themselves.
9. **The requirements panel needs rubric data at go-live** (v0.216: "filled from the cycle's own rubric", registration live by early February), but the rubric's real shape waits for Master Jeong. That conflict is question Q-B1.
10. **Payments are append-only** (0005/0006): a guard trigger refuses every update; Undo and Edit are reversal rows. Star's guard also allows a delete inside a cascade (`pg_trigger_depth() > 1` or its delete functions' action tags). **If Jeffrey picks Q-B4 A (payment rows are never deleted), Black Belt has no such escape:** every foreign key pointing at a candidate or cycle from `bb_payments` is `on delete restrict`, and the guard refuses **every** delete, from anywhere. Delete cycle and Delete permanently then simply fail once any payment row exists, even a reversed one (tested, §5).
11. **Dates.** "Today" is `public.testing_today()` (0005: the Massachusetts date). A school date from a timestamp (e.g. the day a candidate registered) is always `public.testing_school_date(…)`; the contract forbids `::date` on a `timestamptz` (that would use UTC and be a day off in the evening).

## 3. Shape: `bb_…` tables (proposals; columns are key ones only)

Each table has the house columns (as 0006): `id uuid`, `version`, `created_at/updated_at`, `created_by/updated_by` (never readable), `created_by_name/updated_by_name`, a `*_before_write` trigger, a `*_no_truncate` trigger and a `change_log` trigger. Written-once tables (copies, payments, waiver versions) have no version columns and are guarded instead.

### 3.1 Template (Rubric and prices)

| Table | What it holds | Serves |
|---|---|---|
| `bb_settings` | one row: **keep signed waivers N1 years after the last testing day** (`keep_years_after_last_day`) and **for under-18s until N2 years after they turn 18, if later** (`keep_years_after_18`), both empty until the insurer answers (§8 S12); also the "template lock" row (§2.4). Rubric and prices shows them as one sentence with two numbers | v0.213, v0.900 |
| `bb_plans` | a payment plan: name, number of payments (1–12), position (drag order = form order) | v0.217, v0.900 |
| `bb_plan_amounts` | amount per plan × Dan (1–4) × payment number, in cents | v0.217 |
| `bb_kukkiwon_fees` | Kukkiwon certificate fee per Dan (seed $100 / $110 / $140 / $170) | v0.217 |
| `bb_waiver_versions` | every waiver text ever saved: version name ("2027-1" = year + count), the text, who and when. Written once, never changed or removed; the newest is current | v0.213, v0.900 |

Seeds (tagged `bb_seed`, never overwrite): plans "In full" (1 payment) and "3 payments" with the Fall 2026 amounts from the Sheet (870/990/1,500/2,700; 290×3, 330×3, 500×3, 900×3), the Kukkiwon fees, waiver version 2027-1 (the old page's text, for Jeffrey to check), and Fall 2026's schedule as the starting point for the first Add cycle (§8 S9).

### 3.2 Cycles

| Table | What it holds | Serves |
|---|---|---|
| `bb_cycles` | name (unique), Application due, Submissions due, registration open, auto-close date (= Application due; cleared when an admin reopens after it, v0.85), first opened at, two public codes (Worcester, Shrewsbury; new random codes each cycle), prices copied at | v0.209, v0.212, v0.900 |
| `bb_cycle_days` | one testing day: name, date, start and end time (15-minute steps), place (Worcester school / Shrewsbury school / Other + text), optional **second part** (time + place, e.g. Horgan Arena) | v0.209, v0.900 detail 3 |
| `bb_cycle_day_parts` | which parts are graded that day (Physical / Technical / Curriculum). A part may be on two days (detail 2). Each part must be on at least one day (detail 1, checked at the end of every cycle save) | v0.209, v0.900 details 1–2 |
| `bb_cycle_plans` | the cycle's copy of each plan: name, number of payments, position, **Offer this plan** tick | v0.217, v0.900 |
| `bb_cycle_plan_payments` | each plan payment's **due date**, and for payment 1 a "follows Application due" flag (until changed by hand) | v0.217, v0.900 |
| `bb_cycle_plan_amounts`, `bb_cycle_kukkiwon_fees` | the cycle's copy of the amounts and Kukkiwon fees. A guard trigger refuses any update or delete of these rows once the cycle has a payment row (v0.217); before that, only Q-B2's function may replace them | v0.217 |
| *(depends on Q-B1)* `bb_cycles.requirements` | the requirements panel's content for this cycle | v0.216 |

### 3.3 Candidates

| Table | What it holds | Serves |
|---|---|---|
| `bb_candidates` | one person in one cycle: first and last name (belt spelling), **date of birth** (required, §8 S5), **email for results**, school (`location_code`, so `change_log` fills it), Dan (1–4), the cycle plan, Kukkiwon yes/no and the day it was added, source (form / desk), **reference BB-####** (form and desk, from one counter), registered at, status (active / withdrawn + reason, when, by), duplicate state (none / possible / kept both). How long DOB and email are kept: Q-B7 | v0.211, v0.212, v0.900 |
| `bb_candidate_waivers` | one per candidate: waiver version, how (drawn on the form / **signed on paper**, ticked by), signer's name, drawn signature (form only), signed at, submission id (form only, unique: a retry never makes a second candidate), signature deleted at. **Never granted to any role**; its own masking log trigger writes "on file", never the picture or the signer's name | v0.213, v0.900 |

**"Signed by a parent or guardian" is not stored as fact.** It is worked out on every read from the DOB and the cycle's current first testing day. If a DOB fix or a moved first day turns an adult-signed waiver into a minor's, the candidate detail shows an amber warning **"Needs a parent's or guardian's signature"** (the desk then gets a paper waiver signed and ticks "signed on paper" again).

### 3.4 Money

| Table | What it holds | Serves |
|---|---|---|
| `bb_payments` | append-only. **kind**: payment / refund (its own negative row) / reversal (Undo, Edit) / **returned** (a bounced check: undoes one check row, keeps it in the history as "returned"). Columns: amount (cents), method (cash / check / card), `paid_on` (school date), **for** (the plan items it pays, e.g. payment 1 + Kukkiwon; §8 S1), optional note, reason (required on Edit), `reverses_payment_id` (unique: each row is reversed at most once), recorded at / by / by name, and what the row remembers for Finance (Q-B3). Rules in §8 S2 | v0.210, v0.218, v0.219, v0.220, v0.900 |

**No table for receipts** (printed from a read, v0.220), **for QR codes** (Download QR code is a PNG drawn in the browser from the link, v0.900), or for the "Registered on this visit" list (kept in the family's browser, Star v0.93).

**Worked out, never stored:** the cycle status tag (Not open yet → Open until → Registration closed → Next day → Testing today → Past, v0.900); a candidate's **items** (each plan payment + Kukkiwon, with its due date, §8 S4); what's paid against each item (§8 S1); the Payments tag (Paid in full / Next $X by date / Late · $X since date / Not paid, v0.219, v0.224), balance, overpaid; the summary cards (possible duplicates and withdrawn left out, v0.900); under 18 on the first testing day and the parent-signature warning; when a waiver is due for deletion; whether Delete cycle is allowed.

### 3.5 Room left for grading (next migration, no tables now)

- **Parts per day** already exist (`bb_cycle_day_parts`), so grading can say "this subject's grades come from these days", and "a day with grades can't be deleted" (v0.900 detail 4) becomes a check the grading migration adds to `bb_update_cycle` (it replaces the function, as 0010 replaced 0005's).
- **A rubric copy per cycle** follows the plans pattern: template tables + cycle copy tables, both pointing at `bb_cycles` and the part codes.
- **Age is worked out in the database:** one internal helper `bb_age_on(dob, date)` now (used for "under 18 on the first testing day"); grading adds a read that returns only the bracket (≤8 / 9–12 / 13+, child / adult) for each candidate, never the DOB (plan §4: stronger than Star's screen-only hide).
- **Make-ups and the waiver's "applied to the next test" credit** (plan §7) wait for Master Jeong's A8/A10; the payment kinds can gain `credit` then (a change to one check rule).
- **Kukkiwon tracking** (Tcon id, photo received) and **Students links** are new columns later; nothing now (§8 S10).

## 4. Functions (the only way to write)

Each: `security definer`, `set search_path = ''`, full names, checks in the house order (access → role → arguments → lock and look up → version → rules → write → `{status}`), statuses from the existing set plus any new ones the contract lists. Roles per v0.210: **A** = admins only, **S** = staff (incl. the shared desk account) and admins, **P** = the public form login only.

| Area | Functions |
|---|---|
| Rubric and prices | **A:** add / update / reorder / delete plan (template only; cycles keep their copies), update Kukkiwon fees, save waiver (always a new version), **set the keep-years settings** (two steps: the first call changes nothing and answers "this will delete X signed waivers now"; only a second call that repeats that X saves it; never below 3 years each; logged in `change_log`). **S:** read Rubric and prices (staff view only) |
| Cycles | **A:** add cycle (one call with the whole form: days, parts, deadlines, due dates, offered ticks; copies the template at that moment), update cycle (same payload, days matched by id so their ids stay stable for grading; refused while a part is on no day), delete cycle (refused once a payment row **or a form waiver** exists, §8 S15), and Q-B2's price change. **S:** open / close registration (v0.86: staff close any time, open only before the closing date; admins reopen after it, which clears the automatic close). **S reads:** cycles list, one cycle (these run the signature purge, §8 S13) |
| Candidates | **S:** add candidate at the desk ("Waiver signed on paper" required, v0.900), update details (a Dan change after a payment: admins only, §8 S8), change plan or Kukkiwon (staff before any payment; admins after, v0.210), resolve a possible duplicate. **A:** withdraw, restore, delete permanently (Q-B4) |
| Payments | **S:** record payment (amount, method, for, note; v0.218), undo within the toast (own row; the server allows 10 seconds for the 5-second toast, Star's rule). **A:** undo later; **edit** (reason required): writes a reversal of the old row and a new payment row in one transaction, **both with `recorded_by` = the editing admin and `recorded_at = now()`** (the transaction's own timestamp, so the two match exactly; never `clock_timestamp()`), as 0006's `star_edit_payment` and 0011's pairing rule require. Only `paid_on` carries over from the old row (the approved dialog keeps the date); the original row stays in the history with its first recorder. **A:** record refund, mark check returned (rules in §8 S2). Each A action's toast Undo is an undo of the new row |
| Reads | **S:** roster for a cycle (no DOB, email or signature; one read function, because the money tag is worked out per candidate); candidate detail (DOB, email, signer's name, the parent-signature warning; one candidate, desk devices — the database can't tell devices apart, Star v0.161); receipt data (no DOB, email, notes or "recorded by", v0.900). **A:** view signature (one candidate, v0.213). All check `has_data_access()` first |
| Public (family form) | **P:** read the cycle by code (school from the code; the cycle box, testing days with places, deadlines, offered plans with amounts and due dates, Kukkiwon fees, the current waiver text and version, the requirements; never counts, candidates or ids). **P:** register (one candidate + waiver), in **Star's exact order** (0006 `star_public_register_core`): the wrapper clears `request.jwt.claims` and `request.jwt.claim.sub` first → cycle by code → this `submission_id` already saved? (same cycle: the same ok answer again; another cycle: `invalid`) → lock the cycle and read it again → the `submission_id` check **again** under the lock (a retry that waited gets the same answer, not `closed` or `rate_limited`) → only then open / closed → input → rate limit → duplicate check → write. The answer is identical whether or not the person looks like a duplicate and **never includes the DOB, email or signer's name**. Login **`bb_registrar`**: `login noinherit`, 5 connections, the same timeouts as `testing_registrar`, empty search path, no password in the file, execute on these two functions only |
| Internal (no grants) | cycle state, a candidate's items and money tag, find duplicate, lock helpers, `bb_age_on`, under-18 on the first day, signature purge, the public answer |

Reads never return `date_of_birth`, `email_for_results`, the signature or the signer's name except the candidate detail (DOB, email, signer's name) and view signature (admins). Those columns are **never granted to any role** (leaving them out of a view wouldn't protect them).

## 5. Tests (copy 0005 / 0006's shape)

- `supabase/tests/0016_tests.sql`: one transaction ending in `rollback`, its own `zz test …` cycles and candidates, the 0005 session set (admin unlocked, locked, 5 wrong PINs, signed out, password 8 days old, magic link, idle-expired, inactive; desk unlocked, locked, magic link; anon). It proves:
  - no read or write through any locked or stale session; staff refused every A function;
  - nothing granted on DOB, email, signature or signer's name; no `change_log_write` trigger on `bb_candidate_waivers`; `change_log` never contains `data:image` **or the signer's name** (the test uses a parent signer whose name differs from the candidate's, so a match can't come from the candidate row);
  - the payment guard refuses every update and **every delete**; Delete cycle and Delete permanently fail once any payment row exists, **including a reversed one** (if Q-B4 A);
  - reversal / refund / returned rules and §8 S2's net and status rules; the amount cap; money sums in `bigint`;
  - an edit writes two rows with the same `recorded_at` and `recorded_by` (the admin);
  - Add cycle copies the template exactly; the cycle copy guard; a part on no day is refused;
  - the keep-years two-step (first call changes nothing; the floor of 3); the purge removes only what's due under §2.7's formula, including an under-18 whose N2 date is later;
  - public register: idempotent on `submission_id` (also for a retry under the lock), rate-limited, refused when closed, the same answer for a duplicate, no DOB / email / signer's name in any answer.
- `supabase/tests/0016_fingerprints.sql`: read-only, connector-safe (the words the connector refuses are spelled in pieces, as 0005).
- **PGlite step:** apply every migration on `main` before 0016, print their fingerprints, apply 0016, prove those fingerprints are **unchanged**, run `0016_tests.sql` then **every earlier test file** unchanged, then live `bb_registrar` checks (`set role bb_registrar`):
  - every `bb_` table, `testing_public_attempts`, `change_log`, Color Belt's and Star's public functions: all refused;
  - **no impersonation:** after `set_config('request.jwt.claims', <an admin's claims>, …)` as `bb_registrar`, every `bb_` staff function and `has_data_access()` are still refused (the login has no execute right on them); and the public wrapper clears any claims before its core runs;
  - `testing_registrar` and `star_registrar` can't run Black Belt's two functions.
- 0005's T2a and Star's registrar tests stay exactly as they are (each form has its own login).

## 6. Order of work after the questions

1. Reserve **0016** with the Main session; `git merge main` into `black-belt` so 0016 is written against the real 0005, 0006, 0010 and (once merged) 0011.
2. Answers → rulebook rows (0.9xx block) → this file updated.
3. Write `CONTRACT-0016.md` (as 0006's: tables, grants, statuses, lock order per function, every function's checks) → **security review** (separate agent) → Jeffrey's OK.
4. Write `0016_black_belt.sql` + tests → PGlite passes → **security review** of the SQL → Jeffrey's OK for the paste.
5. **Jeffrey pastes** it in the Supabase SQL Editor → Claude runs the fingerprints read-only, the security advisor, and Jeffrey runs `0016_tests.sql` (then `0005_tests.sql` and `0006_tests.sql` again).
6. Jeffrey's one-time setup for `bb_registrar` (password via a SCRAM script, as Star's SETUP §13; a third Hyperdrive config when the Function is built, with his OK). Jeffrey asks the insurer for **both** numbers (N1, N2).
7. Tell the Finance session the final ledger columns (§8 S17; it adds Black Belt to its own function in its own migration).
8. Build B1 (cycles, prices, public form) then B2 (candidates, payments) in the preview, each reviewed at its checkpoint.

## 7. Questions for Jeffrey (one at a time, in this order)

Structure first, then money, then waivers and privacy. Each will be shown with a picture and the options drawn side by side.

### Q-B1 · Where the requirements panel gets its content until grading is built — **answered v0.901: B** (sheet now, rubric in spring)

- **The question:** the family form's "What [Dan] is tested on" panel (v0.216) must work in February, but the real rubric tables wait for Master Jeong's answers. What feeds the panel until then?
- **Why it matters:** if we build rubric tables now and his answers change the shape (child/adult pass marks, age tables, extra points), we rebuild them; if we don't, the panel needs another source for a few months.
- **Options:**
  - **A · Rubric tables now (display only).** Parts, subjects, credits, scoring tables and pass marks as real template + cycle copy tables, loaded from the Fall 2026 numbers; grading later adds grade storage on top. *Pro:* one source from day one; matches v0.216 exactly. *Con:* the biggest piece of work, designed before the rules are known; likely reshaped.
  - **B · One requirements document per cycle (recommended).** A structured text block (JSON) on the cycle, copied from a template document that this migration loads from the Fall 2026 numbers; the panel draws it; no editor. When grading lands, the panel switches to the real rubric copy and the document is dropped. *Pro:* small, no shape locked in, the form ships on time. *Con:* until grading, a number change needs a small SQL update pasted by Jeffrey; two sources for a few months (grading doesn't exist yet, so they can't disagree).
  - **C · No panel at go-live.** The form links to the old `requirements.html` until grading is built. *Pro:* nothing to build. *Con:* goes against v0.216; the old page stays online longer.
- **Recommendation:** B.
- **Touches:** v0.216, v0.900 (Form 3), plan §8 B1.

### Q-B2 · Changing a cycle's prices before anyone has paid

- **The question:** a cycle copies the plans and amounts when it is added; after a payment they never change (v0.217). Before that, how does an admin change them (for example prices go up after Spring 2027 was added)?
- **Why it matters:** decides which functions and dialog exist. Families who already registered saw the old amounts on their confirmation page.
- **Options:**
  - **A · "Copy prices again" (recommended).** One action in Edit cycle, allowed while the cycle has no payment row: it re-copies every plan, amount and Kukkiwon fee from Rubric and prices (keeping this cycle's due dates and ticks), with a warning naming how many families have registered. It locks `bb_settings`, then the cycle (§2.4). *Pro:* Rubric and prices stays the only place amounts are typed; one small function. *Con:* all-or-nothing; can't give one season a special price without changing the template.
  - **B · Edit amounts per cycle.** Edit cycle gets the full amounts grid per plan and Dan. *Pro:* a season can differ from the template. *Con:* a second big grid to draw and check; two places to type prices.
  - **C · No change.** Delete the cycle and add it again. *Pro:* nothing to build. *Con:* new link codes, registrations lost.
- **Recommendation:** A.
- **Touches:** v0.217, v0.900 (Cycles 4, the "copied from Rubric and prices on …" line).

### Q-B3 · What each payment row remembers for Finance

- **The question:** when a payment is recorded, does its row keep the candidate's school and the cycle's name **as they were then**, or read them from the candidate and cycle each time?
- **Why it matters:** if staff later fix a candidate's school (registered through the wrong link), money already recorded either stays in the old school's Daily report or moves to the new one, and a moved amount marks a closed day "Changed after closing" (Finance v0.199).
- **Options:**
  - **A · Keep both on the row (recommended).** School and cycle name are copied onto every row (a reversal, refund or returned row copies them from the row it belongs to, so a chain never splits between schools). *Pro:* closed days never change because of a correction; matches the note already sent to Finance. *Con:* a school correction doesn't move old money (an admin would undo and re-record it if that's what's wanted).
  - **B · School on the row, cycle name read live.** *Pro:* a renamed cycle shows its new name everywhere. *Con:* differs from the Finance note; a rename changes old report lines.
  - **C · Neither (Star's way).** Read both live. *Pro:* fewest columns. *Con:* a school fix moves old money and marks closed days changed.
- **Recommendation:** A.
- **Touches:** plan §7.1, Finance note point 4, Finance v0.196, v0.199.

### Q-B4 · Can payment rows ever be deleted?

- **The question:** v0.900 allows Delete cycle "only while no payment is recorded", and Remove candidate offers Star's "Delete permanently", which in Star also removes the candidate's payments. Should Black Belt ever delete a payment row?
- **Why it matters:** a deleted payment disappears from Finance's days (a closed day would show "Changed after closing" with nothing to see), and an undone payment still leaves rows behind.
- **Options:**
  - **A · Never (recommended).** Delete cycle and Delete permanently are both refused once the cycle or candidate has **any** payment row, even one that was undone; Withdraw is the way out (kept under Removed, can be restored). In the database this means: `on delete restrict` on every key that points at a candidate or cycle from `bb_payments`, and a guard that refuses every delete with no cascade or action-tag exception (§2.10). *Pro:* the ledger is complete forever; one rule for cycles and candidates; nothing in the database can remove money rows, even by mistake. *Con:* a test payment recorded by mistake blocks deleting that candidate (withdraw it instead).
  - **B · Star's way.** Delete permanently removes the candidate's payments after a warning naming them; Delete cycle refused once any payment row exists. *Pro:* matches Star. *Con:* real money can vanish from the record.
  - **C · Allowed when the net is $0.** *Pro:* a mistaken payment that was undone doesn't block. *Con:* the undone rows still vanish from Finance's history.
- **Recommendation:** A.
- **Touches:** v0.210, v0.900 (Cycles 2, Candidates 3).

### Q-B5 · The waiver changes while a family is filling in the form

- **The question:** an admin saves waiver version 2027-2 while a family has 2027-1 on screen. When they press Send, what happens?
- **Why it matters:** the signed record must say exactly which text they agreed to.
- **Options:**
  - **A · Accept the version they saw, if it was current in the last 24 hours (recommended).** The waiver row records 2027-1 exactly. Older versions are refused as `invalid` (a months-old open tab). *Pro:* no new screen; the record is accurate. *Con:* for up to a day someone can sign the previous text.
  - **B · Refuse and show the new text.** A new message on step 2 ("The waiver was updated. Read it and tick again."). *Pro:* everyone signs the newest text. *Con:* a new screen state to design; families lose a step.
- **Recommendation:** A.
- **Touches:** v0.213, v0.900 (Form 5, Rubric and prices waiver versions).

### Q-B6 · What is removed when a signed waiver's keeping time ends

- **The question:** when a signed waiver reaches its deletion date (the later of last testing day + N1 years and 18th birthday + N2 years, §2.7), what goes?
- **Why it matters:** privacy of minors versus being able to say later "a waiver was signed, version 2027-1, on Mar 10".
- **Options:**
  - **A · The signature and the signer's name (recommended).** The row keeps "signed on [date], version [x], deleted on [date]"; the detail view says "Waiver signature deleted after the keeping time". *Pro:* the personal parts go; the fact stays. *Con:* none important.
  - **B · The whole waiver row.** *Pro:* nothing left. *Con:* the detail view can no longer say a waiver ever existed.
  - **C · The signature only.** *Pro:* simplest (Star's way). *Con:* the parent's name stays for good.
- **Recommendation:** A.
- **Touches:** v0.213, v0.900 (Cycles 6).

### Q-B7 · How long a candidate's date of birth and email are kept

- **The question:** unless we decide otherwise, each candidate's DOB, email and names stay in `bb_candidates`, and their old values in `change_log`, **forever** (as Color Belt and Star decided, v0.162 / v0.169). Most candidates are minors. Should Black Belt remove the DOB and email after a while?
- **Why it matters:** the DOB is needed for this cycle's age brackets and for any make-up the next season; after that it mostly sits there. Names, Dan, results and payments are the rank history and Finance's record, so they stay in every option.
- **Options:**
  - **A · Keep (like Color Belt and Star).** *Pro:* one rule across testing sections; old cycles stay complete for certificates or Kukkiwon questions. *Con:* minors' DOB and email stay indefinitely, including in the change log.
  - **B · Remove DOB and email N years after the cycle's last testing day** (a third setting, e.g. 3 years; names and results stay). *Pro:* a clear, short limit. *Con:* a third number on Rubric and prices; the candidate detail shows "removed" for old cycles.
  - **C · Remove them at the same time as the waiver signature (recommended).** One deletion date per candidate (§2.7's formula); the DOB and email go with the signature and signer's name; names, Dan, results and payments stay. *Pro:* one date to explain ("everything personal is kept as long as the insurer needs the waiver, then removed"); no extra setting. *Con:* minors' data stays until 3 years after they turn 18 (if N2 = 3), longer than B for young children.
- **What B or C also need:** DOB and email are then **masked in `change_log`** ("changed", like the signature), because the log is append-only and would otherwise keep the old values forever. That replaces §8 S11's "as Star" with "masked".
- **Recommendation:** C.
- **Touches:** rulebook §5, v0.213, Star v0.162 / v0.169 (Color Belt and Star are not changed).

## 8. Smaller defaults to OK together

| # | Item | Proposed default | Why |
|---|---|---|---|
| S1 | What a payment's "For" means for the balance | The ticks count: each row stores the items it was for. Its money goes first to those items (in plan order), anything left goes to the earliest unpaid items, and only then is it "overpaid". A typed amount smaller than the ticked items leaves the last ticked item partly unpaid. If a plan change removes an item, its money flows to the earliest unpaid items | It is the only rule that gives the approved tags, e.g. Omar's "Late · $110 Kukkiwon since Mar 27" (v0.900 Candidates 4, 9); "one check = one line" |
| S2 | Payment kinds and rules | **payment** (1 cent up to the S3 cap, any cents); **refund** (stored negative, cash / check / card as drawn, counts the day recorded, never more than the net paid); **reversal** (exactly minus one row); **returned** (its own kind, check rows only, exactly minus the check, note only). The net per candidate never goes below $0, **except** through a returned row (a check bounces after a refund: the family then owes money back, shown as a balance). **No new payment on a withdrawn candidate** (refunds still allowed). **Edit refused while the candidate has an active (not undone) refund**, as 0006. Undoing a refund or returned mark is a reversal of that row; because each row can be reversed only once (`reverses_payment_id` unique), a check whose returned mark was undone **can't be marked returned again** (an admin records it as a new returned check by undoing and re-recording the payment) | v0.900 Candidates 5; Star 0006 rules; its own kind lets the screens and receipt show "returned" |
| S3 | Amount limits and price domain | One payment row: up to **$5,000**. Prices (plan payments, Kukkiwon fees, template and copies): **whole dollars, $1–$5,000**; $0 is not allowed (Kukkiwon is optional per candidate, so no "$0" fee is needed). Every sum in `bigint` | Fits 4th Dan in full + Kukkiwon ($2,870) with room for rises; still catches an extra zero |
| S4 | Due dates for late registrations and late changes | An item's due date is the **later of the plan's date and the day the candidate registered** (`testing_school_date(registered_at)`), for desk **and** form registrations. A plan change keeps that registration day. A Kukkiwon fee added late is **due at once** (v0.900): its due date is the day it was added, so under v0.224 it shows gray "Next … by [today]" that day and Late from the next day | One rule from the approved desk screen (Candidates 7); red still means a date has passed |
| S5 | DOB and email at the desk | **Required**, like the form (Star allowed a desk row without DOB) | Grading's age brackets and child/adult pass mark need the DOB; the approved desk dialog shows both |
| S6 | Table structure | Separate `bb_…` tables (as Star); cycle copies of plans and prices as **copy tables** (not a JSON blob), taken when the cycle is added, with a guard once payments exist (§3.2) | Star's approved pattern; prices are checked and summed, which tables do safely |
| S7 | Duplicates | Same cycle, same first + last name (ignoring capitals and spaces) and same DOB, any Dan; "Keep this one" withdraws the other as "Duplicate copy" (can be restored); duplicates left out of the cards until resolved (v0.900); both candidates locked in id order | Star's rule (v0.114, S2) |
| S8 | Changing Dan after a payment | Staff and admins before any payment; admins only after (the price changes, like Change plan, v0.210) | Keeps v0.210's money rule |
| S9 | The first Add cycle | The Fall 2026 schedule (days, places, times, deadlines, due dates from the Sheet) is a seed the first Add cycle starts from; after that Add cycle starts from the newest cycle. Fall 2026 is **not** a cycle (Past starts empty, v0.900) | v0.900 Cycles 3–4 |
| S10 | Links to Color Belt / Star / Students | No column now; added when a Students section exists | Nothing to link to yet (Star S4) |
| S11 | DOB and email in `change_log` | As Star v0.169 (kept in full) **unless Q-B7 picks B or C**, which masks them; **the signature and the signer's name are always masked** ("on file") | Black Belt has no History screen, so nothing in the app shows them; masking the signer keeps the waiver deletion real |
| S12 | Keep-years settings before the insurer answers | Both empty = **nothing is deleted**, and Rubric and prices shows the amber "waiting for the insurer" line. Once set: whole years, **3–20 each** (the floor stops a slip from deleting waivers early), changed only through the two-step confirm (§4), logged | The first deletion couldn't fall before 2030 anyway |
| S13 | How the deletion runs | As Star: inside the staff reads that open the cycles list or a cycle, `skip locked` (never waits), logged; not in the public register call (its 5-second limit) | House pattern; with years-long keeping, a daily schedule isn't needed |
| S14 | Reference numbers | One counter for form and desk, `BB-5001` upward, never reused | v0.900 Candidates 7; differs from Star's `ST-` |
| S15 | Delete cycle | Refused once the cycle has any payment row **or any form-signed waiver** (a family has registered online and signed); before that it removes the cycle with its days, copies and desk-only candidates | A signed waiver is a legal record and must not vanish with a cycle |
| S16 | Plan switched off ("Offer this plan" unticked) | Hidden on the form and in Change plan; candidates already on it keep it and pay as before | v0.217 detail 2, v0.900 |
| S17 | What Finance's function may read | From `bb_payments`: id, kind, amount, method, `paid_on`, for items, recorded at / by / by name, `reverses_payment_id`, and the school and cycle name stored on the row (Q-B3). From `bb_candidates`: first and last name only. **Never** DOB, email, notes, the waiver table or anything else | Finance shows name, school, "Black Belt · Spring 2027 · Payment 2" and the amount (v0.196) |
| S18 | Who can see a signature | Admins only, through one function, one candidate at a time; paper waivers show "Signed on paper · date · version · ticked by" (the paper itself is kept in the testing folder, outside the database) | v0.213, v0.900 |
| S19 | Shared helpers | Call 0005's `testing_today`, `testing_school_date`, name, note and signature checks, `testing_new_public_code`, `testing_location_address`, and `locations` (read only); **own** email and amount checks (not Star's or 0005's) | Black Belt doesn't depend on Star's functions; the 0005 fee check stops at $1,000 |
| S20 | Receipts and QR codes | No log of prints or downloads; the QR code is made in the browser | Neither changes data (Star logs CSV downloads only because they export personal data) |

Left for the contract (technical, no decision needed): exact column grant lists, the payload shape of Add / update cycle, new status names (e.g. `has_payments`, `refund_too_large`, `part_without_day`, `confirm_needed`), the public answers' exact keys, whether every Function shares `CLIENT_KEY_SECRET` (§2.8), and the route name.
