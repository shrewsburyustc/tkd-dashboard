# Camps build plan — camps, templates, family sign-up form, roster with check-in and payments

**Written:** 2026-10-19 · **Revised:** 2026-10-19 after the independent review (§12) and after Jeffrey's answers (§13) · **Status:** **CP0 — OK'd by Jeffrey 2026-10-19.** The build follows `docs/Dashboard Docs/Build contracts/CONTRACT-0013.md`. Nothing is applied or deployed without his OK for that step.
**Branch:** `camps` (worktree `camp-event-creator-templates-83eafe`).
**Design (approved):** `TKD-Camps-Mockups.html` (C1–C7d incl. the 2026-10-19 additions C4b, age range, staff view, Close / Reopen, overpayment line), images in `Mockup images/`, `Decision images/Camps-roster-layout-options.html` (option **A** chosen) and `Camps-attendance-roster.html`; decisions in `TKD-Camps-Status.md`; rulebook **v0.229–v0.237** and **v0.700–v0.704**.
**Rules:** CLAUDE.md; handoff §6 (security, non-negotiable); rulebook §5 (privacy). The newest 10b row wins.
**Model copied:** Color Belt phase 2 (`TKD-Testing-Phase2-Build-Plan.md`, `CONTRACT-0005.md`, `0005_testing_events.sql`, `functions/**`, `src/register/**`), Color Belt grading (`CONTRACT-0010.md`) and Star testing's later choices (`0006_star_testing.sql`, CONTRACT-0006).

> In plain words: admins create a camp (one or more days, for Worcester, Shrewsbury or both schools), set its prices in a small grid plus a list of extras and the ages it takes, and can save it as a template. The camp gets one link + QR code. Families sign up on their phone (up to 3 children, days, extras, parent, emergency contact, signature) and pay at the school. The camp page has three tabs: **Check in** (the door list for today), **Payments** (who owes, Mark paid) and **Attendance** (the week grid). It is the same machine as Color Belt phase 2 with a different price rule and a check-in list.

> **Migration number: `0013`** (`0013_camps.sql`, `0013_tests.sql`, `0013_fingerprints.sql`). `0010` = Color Belt grading (live), `0011` = Finance (Finance worktree), `0012` = Prospects (its branch). Re-check right before Builder A starts and again at merge.

---

## 0. Scope

**Ships:**
- Rail section **Camps** (`ti-tent`, after Testing) with tabs **Camps | Templates** (C1, C2). Staff (incl. the desk login) see no Templates tab, no + Add camp, no Edit icon, and the line "Ask an admin to add or change camps." (v0.700).
- Add / Edit camp in folded sections incl. **Ages accepted** (C3, v0.703), Save as template (C2b), Use / Edit / Delete template (C2) — admins only.
- **Close / Reopen sign-up** in the camp page ⋯ and the list row ⋯ (v0.700, Star v0.86 reopen rule).
- Camp page with **three tabs** (v0.704): **Check in** (today's campers, "9 of 15 here", Find a camper, Not here yet / Here, one-tap Check in with Undo) · **Payments** ("13 paid · 5 to collect · $1,040", To collect / Paid, Mark paid / Mark paid $X with Undo, Owes $X, Possible duplicate box + compare (C4b, v0.702), Removed group + Restore) · **Attendance** (week grid, "Came X of Y"; Print roster prints it).
- Registration link dialog: QR, link, Copy link, **Download QR code** (C5).
- Camper detail + Edit details, incl. check-in times and the overpayment line (C6).
- Public family sign-up page `/camp/<code>`, all states (C7a–d incl. the age rule), with its Cloudflare Function, own restricted login `camps_registrar`, Turnstile and own kill switch `CAMPS_REGISTRATION`.
- Preview mode (fake database) for all of it, including the family page.

**Deliberately NOT built:** online card payment (Card is only a label) · paper entry / staff **Add camper** (v0.232) · flyer in the app (v0.232) · camper limit · "weeks" concept (v0.231) · medical questionnaire · credits / refunds as records · part payments or deposits (v0.233) · **check-out / pick-up record** (v0.704) · a whole-summer attendance report (later idea) · Home tile · emails to families · central Calendar link · a rule against two camps with the same name · anything from the old `tkd-camps` Worker.

**Decided (no longer open):** Card = label only (v0.233). Delete camp with campers = admin only, warning names them (v0.237). Price fixed at sign-up by the sign-up date in Massachusetts time (v0.230). Both-schools camps: member prices for members of either school (v0.234). All 13 plan questions: §10.

---

## 1. Database — migration `0013_camps.sql`

Same rules as 0005 (handoff §6, CONTRACT-0005 §1.1):
- Tables in `public`, prefix `camp_` (main table `camps`). Owner `postgres`. One transaction, safe to re-run, header comment like 0005's.
- RLS on every table, policies `for select to authenticated using ((select public.has_data_access()))`; `revoke all … from public, anon, authenticated, service_role` on every table, view and sequence; then **column** `select` grants only where the app reads. **Nothing to `anon`.**
- Every write through a `security definer` function (`search_path = ''`, fully qualified names, `has_data_access()` first, then role, input, lock + look up, stale check, data rules, write), returning `{status: …}` with 0005's error mapping.
- Every action tag starts with `camp_`. Every change goes to `public.change_log`; every logged table has a uuid `id` (0003's `change_log_write` reads `row->>'id'`).
- "Today" = `public.testing_today()` (America/New_York). Money = integer cents; prices whole dollars $0–$1,000; a camper total at most $2,000.
- Lock order: camp → sign-up → camper → payments / day rows. (No school lock: Camps has no per-school rule such as Color Belt's unique event name, so the camp row is enough — CONTRACT-0013 §1.1.)
- Reused live helpers (never granted): `testing_today`, `testing_school_date`, `testing_normalize_name`, `testing_name_is_valid`, `testing_line_is_valid`, `testing_normalize_note`, `testing_cents_is_valid`, `testing_signature_is_valid`, `testing_new_public_code`, `testing_location_address`, `change_log_write`, `change_log_actor_name`, `testing_refuse_truncate`. 0013 changes nothing that 0001–0012 made and depends only on 0003 + 0005.

### 1.1 Tables (exact columns in CONTRACT-0013 §1)
- **`camps`** — `location_code` (held at) + `both_schools`; name; hours; `signup_opens_on` ≤ `signup_closes_on` ≤ last day; `early_until` ≤ `signup_closes_on`; `closed_by_hand`; **`min_age`, `max_age`** (whole numbers 1–99, min ≤ max, blank camp 3–17 — v0.703); description (≤ 2000); waiver (≤ 8000); `public_code` (8 characters, 0005's generator). Status derived, never stored.
- **`camp_days`** — 1–10 days per camp, not necessarily next to each other.
- **`camp_prices`** — exactly one row per day count 1…N, four prices each.
- **`camp_extras`** — name, price, `once` | `day`, `not_for_all_days`, sort; 0–10.
- **`camp_templates`** — everything but dates and campers, incl. `min_age` / `max_age`; prices and extras as checked jsonb; dates as days-before-first-day; shared by both schools.
- **`camp_signups`** — one family submission: reference `CP-####`, `submission_id`, parent + emergency contact (name, phone, relationship), `price_kind` fixed at sign-up, `signed_up_on`, signature (never granted), `waiver_text_signed` (copy), `ack_version`.
- **`camp_campers`** — one child: names, age (on the camp's first day), member, `paying_by`, `base_cents` snapshot, status, withdrawn reason (`withdrawn` | `duplicate_copy`), **`duplicate_state` / `duplicate_of`** (v0.702).
- **`camp_camper_days`** — one row per camper per day (own `id`), **`checked_in_at`, `checked_in_by`, `checked_in_by_name`** (v0.704).
- **`camp_camper_extras`** — once / per-day rows with a price snapshot.
- **`camp_payments`** — append-only with reversals (0005 copy).
- Keys from camper day / extra rows to `camp_days` / `camp_extras` use the default `no action` (Delete camp's cascade can't fail); "a day or extra an **active** camper picked can't be removed" is enforced in `camp_update_camp` (v0.701); withdrawn campers' rows for a removed day / extra are deleted (logged).
- Rate-limit ledger: Camps' **own `camp_public_attempts`** (same columns as 0005's `testing_public_attempts`, RLS on, no grants, rows older than 2 days removed by the sign-up function); **30 tries per hour per client key, counting only this table** (v0.700). Camps never writes into `testing_public_attempts`.

### 1.2 Money rules
Base = grid row for the number of days × member / non-member × the sign-up's early / regular. Extras = sum of snapshot rows. Total now = base + extras (≤ $2,000). Owes = total now − net paid. Tag priority: **Possible duplicate > Owes $X > Paid > Not paid** (v0.702). Overpaid → tag Paid, Camper detail "Total now $315 · paid $390 · Paid $75 more than the total" (v0.700). Mark paid records exactly what is owed. Re-price rule (v0.700, literally): price edits on the camp never change existing campers; **any** change to a camper's own days, member box or extras re-prices that **whole camper** at the camp's current prices, keeping the sign-up's early / regular. The shared price case table (CONTRACT-0013 §1.20) is tested by both the database and the app checks. Worked checks: $166, $390, $245, Owes $15.

### 1.3 Staff functions (exact signatures in CONTRACT-0013 §1.14)
- **Admin only:** add / update / delete camp (Edit camp may also correct held at / both schools; the link never changes), save / update / delete template, Edit payment, ⋯ Undo payment, Delete permanently, Restore of a duplicate copy (staff only within 10 s of their own Keep this one), Reopen sign-up after the closing date, Keep this one after the camp's last day, check-in / undo check-in on earlier days.
- **Staff and admins:** Close sign-up, Reopen before the closing date, **Withdraw and Restore** (ordinary withdrawal — v0.700), Edit details (incl. phones), Change how they'll pay, Mark paid, Undo own payment < 10 s, resolve a possible duplicate (keep one / keep both), **check in / undo check-in today**.
- Reads: column grants, the `camp_roster` view (no phones, no signature; `signed` = `signed_at is not null`; days with check-in times), `camp_camper_detail(id)` (the only way to see phones — staff and admins, v0.700).

### 1.4 Check-in (v0.704)
`camp_check_in(p_camper_id, p_day_id)` / `camp_undo_check_in(p_camper_id, p_day_id)`: the camper must be active and signed up for that day; **staff: today only; admins: today and earlier days; future days refused**; check-in sets `checked_in_at = now()` and who; undo clears them; both logged (`camp_check_in` / `camp_undo_check_in`). Check-in doesn't bump the camper's version (an open Edit details dialog doesn't go stale because a child arrived). Edit details can't remove a day the camper was already checked in on (undo the check-in first). No check-out.

### 1.5 Public functions and the restricted login
`camp_public_camp(code)` and `camp_public_signup(…)` — security definer, granted only to **`camps_registrar`** (same attributes as `testing_registrar` / `star_registrar`). Sign-up: jsonb shape and uuid pattern checked before any cast, `data_exception` caught, attempt row always written, ages checked against the camp's range ("This camp is for ages 5 to 12."), `price_changed` refusal when the total moved while the family filled the form (v0.700), `camp_changed` refusal (fresh camp sent back) when a picked day / extra no longer exists, the age range no longer fits or the waiver changed while the family filled the form, possible-duplicate flag set silently (v0.702), no signature purge.

### 1.6 Signatures and logging
Signatures deleted **3 years after the camp's last day** (v0.700; Jeffrey to confirm the period with the insurer), by `camp_purge_old_signatures()` at the end of `camp_add_camp` and `camp_mark_paid`; "Signed on the form, <date>" stays. `camp_signups` has its own log trigger (signature → "on file", no submission id, no waiver copy). **Phones are logged like other fields** (v0.700). `change_log` never contains `data:image` (tested).

---

## 2. Registrar and kill switch — decided (Q1 = A)
Own login **`camps_registrar`** + own Hyperdrive `tkd-camps-registrar` (binding `HYPERDRIVE_CAMPS`) + own Production switch **`CAMPS_REGISTRATION`** (default off), exactly like Star. Color Belt's login, Hyperdrive and tests stay untouched; each form can be stopped alone. Cost: one password and one Hyperdrive config at CP3 / CP4; +5 database connections (checked at CP4; can be lowered to 3).

---

## 3. The public path

```
Family's phone ──> tkd-dashboard.pages.dev/camp/<code>     (static page camp.html, part of this repo's build)
       │  GET  /api/camp/<code>   ┐
       │  POST /api/camp/<code>   ├─ Pages Function functions/api/camp/[code].js
       ▼                          │    CAMPS_REGISTRATION · origin · JSON type · size ≤ 100 KB · field limits ·
                                  │    honeypot · fill time ≥ 4 s · Turnstile (action "camp_signup") ·
                                  │    client key (HMAC, IP never stored) · per-client limiter
                                  ┘    → ONE database function as camps_registrar
                 Hyperdrive tkd-camps-registrar (caching OFF) ──> Supabase pooler ──> Postgres
```
- `/camp/*  /camp  200` in `_redirects`; strict CSP for `/camp`, `/camp.html`, `/camp/*` in `_headers` (same as `/register`); `_routes.json` unchanged.
- New `functions/api/camp/[code].js`, `functions/_lib/camp.js`, `functions/_lib/campDb.js`; `http.js`, `clientKey.js`, `rateLimit.js` reused unchanged; `register.js` / `db.js` not edited.
- Field limits in the Function (CONTRACT-0013 §4.3); the database repeats every check.
- Turnstile: existing widget; `verifyTurnstile` and `getTurnstileToken` get an optional `action` argument (default `'register'`; Color Belt unchanged). **The Star session will need the same argument for its form.**
- Desk tablet: one school IP = one client key; Camps' own limit is 30 camp tries per hour (v0.700); tested at CP6.
- Page: third Vite entry `camp.html` + `src/camp/**`, importing `SignaturePad.jsx`, `turnstile.js`, `format.js` and `register.css` from `src/register` / `src/styles`. No new dependencies.

---

## 4. Staff screens
- **C1 / C2 / C2b / C3 / C5 / C6** as approved, with the 2026-10-19 additions.
- **Camp page = three tabs** (v0.704, option A of `Camps-roster-layout-options.html`), replacing the single C4 roster with day filter and four summary cards:
  - **Check in** (opens here on a camp day): one camp day at a time (today by default); "9 of 15 here · 6 not here yet"; Find a camper; **Not here yet** (name · age, at most one amber note — Possible duplicate, Not paid, Owes $X or that day's per-day extra — and **Check in**) and **Here** (name · age · ✓ time). One tap = check in with 5-second Undo; ⋯ → Undo check-in later. Future days: list without buttons. Earlier days: buttons for admins only.
  - **Payments** (opens here before and after camp week): "13 paid · 5 to collect · $1,040"; **To collect** (name · days · paying by in one gray line, total, tag, Mark paid / Mark paid $X), then **Paid**; possible-duplicate box + compare (C4b); **Removed** group.
  - **Attendance**: one row per camper, one column per camp day (✓ time / didn't come / still to come / not signed up), "Came X of Y"; **Print roster** prints this grid.
  - Tap a name anywhere → Camper detail (C6).
- Files, reuse and the exact shared-file list: CONTRACT-0013 §0 and §6. Shared files: `src/App.jsx`, `src/components/navItems.js`, `src/lib/pageAddress.js`, `src/lib/mockClient.js`, `vite.config.js`, `public/_headers`, `public/_redirects`, the two `turnstile.js` files, `supabase/tests/pglite/run.mjs`, `supabase/SETUP.md`, `README.md`, `docs/README.md`, the rulebook. Not touched: `src/styles/tokens.css`, `src/screens/Testing.jsx`, Settings.

---

## 5. Preview mode
`npm run dev:preview-mode`: `src/lib/mockCamps.js` (own store `tkd.preview.camps`, the shared `tkd.preview.today` key), default data = the mockups (incl. Ava's possible duplicate, Leo's Owes $15, check-ins on April Vacation Camp's first days), the family page at `/camp/<code>`, console helpers (`resetCamps`, `setCampsRegistration`, `simulateFamilySignup`, `forcePriceChanged`, `setToday`, …) — CONTRACT-0013 §5.

---

## 6. Tests
Database (`0013_tests.sql` + PGlite step `stepCamps`), Function (`functions/tests/camp.test.mjs`), app checks (`src/lib/camps/checks.mjs`), builds — full lists in CONTRACT-0013 §2, §4.8, §5.5, §8. Highlights: role gates incl. check-in day rules; registrar catalog proofs; price lookup; extras; snapshot + Owes + overpaid; America/New_York boundaries for early price, sign-up dates, check-in "today"; Both-schools visibility; append-only payments; full-camp delete cascade; public sign-up incl. bad jsonb (each `invalid` + attempt row), ages, `price_changed`, 30-per-hour camp-only limit; possible duplicate flag / keep one / keep both / admin-only after the last day; signatures (3-year purge, never in the log); templates incl. age range.

---

## 7. Build split
Contract **CONTRACT-0013.md**, then four parallel builders (A database · B public path · C data layer + preview mock · D staff screens; ownership in the contract §0), then a **security review** of A + B and a **design review** of D + B at 1280×800, 820×1180 touch, 390×844 touch and 320 wide; fix rounds until no Critical / High; checks green; commit on `camps` (no push).

---

## 8. Checkpoints (in the order they happen; each needs Jeffrey's OK)

| CP | What |
|---|---|
| **CP0** | Plan OK'd and all questions answered — **done 2026-10-19**. Contract written and reviewed. |
| **CP1** | **Preview walkthrough**: camp from blank and from a template (age range), Both schools, change days / prices, refused day removal, Save as template; family form on a phone-size window (2 children, extras, sign, an age outside the range, `forcePriceChanged`); watch the sign-up appear within 15 s; **Check in** with Undo, Find a camper, the amber notes, admin fixing yesterday; **Payments**: Mark paid + Undo, Edit details → Owes → Mark paid $X, overpaid line, possible duplicate → Keep this one / keep both, Withdraw / Restore, Delete; **Attendance** grid + Print roster; Close / Reopen as staff and admin; staff view of C1. New wordings approved here (CONTRACT-0013 §7 lists the ones not in the mockups). Jeffrey said the three-tab layout may change after he uses it. |
| **CP2** | **Cloudflare variable**: Production `CAMPS_REGISTRATION=off`. Turnstile and the other secrets are reused. |
| **CP3** | **Production database**: tests already on production pass first; read-only check that no `camp_` object or `camps_registrar` exists; Jeffrey pastes `0013_camps.sql`; sets the `camps_registrar` password as a SCRAM verifier made on his PC (new password-manager entry); fingerprints = PGlite, earlier fingerprints unchanged, advisor only the expected notices; `0013_tests.sql`, then the earlier tests again. |
| **CP4** | **Hyperdrive** `tkd-camps-registrar` (session pooler, caching **disabled**, verify-full, origin limit ≤ 5), binding `HYPERDRIVE_CAMPS`, Production only; pooler connection budget checked. |
| **CP5** | **Staff side on the real database** (local app): TEST camp — Add, Edit, Save as template, Use template, Registration link + QR + Download, Close / Reopen. Then the **SETUP snippet** (SQL Editor) calls `public.camp_public_signup(…)` for the TEST camp — two children, a `cp5-test` client key, a tiny test signature. Then on the app: Check in + Undo (today), Mark paid + Undo, Edit details add a day → Owes → Mark paid $X, admin Edit / Undo payment, a second snippet run with the same child name → possible duplicate → Keep this one / Restore, Withdraw / Restore, Delete camper, Delete camp. Read-only check: everything in `change_log` (no `data:image`), attempt rows `camp:ok`, zero camp rows left. |
| **CP6** | **Deploy**: Main merges `camps` into `main` (rulebook rows outside the 0.700 block renumbered only if they clash, v0.300; migration number re-checked); push **only with Jeffrey's OK**, `CAMPS_REGISTRATION` still off; live checks (dashboard, `/camp/<x>` CSP, `/api/camp/<x>` → `not_open`). **Phone path:** TEST camp Open, `CAMPS_REGISTRATION=on` + redeploy, Jeffrey signs up from his phone and several times in a row from the desk tablet; sign-ups show within 15 s; check in one child; Hyperdrive cache off; delete the TEST camp, zero camp rows left. Then the first real camp. |

**Rollback (fastest first):** revoke execute on the two camp public functions from `camps_registrar` (instant) → `CAMPS_REGISTRATION=off` + redeploy → `alter role camps_registrar nologin` → Cloudflare Pages roll back → only before real data: "Undo 0013" script in SETUP. Color Belt, Star and Forms are not affected.

---

## 9. Risks

| Risk | What the plan does |
|---|---|
| A second public page into a database about minors, with parent / emergency phones | Restricted login with 2 functions; shape-before-cast + `data_exception`; Turnstile, honeypot, timing, field limits, two rate limits; phones only in the detail read function; security review; TEST sign-ups before real use. |
| Malformed input giving untracked tries | Attempt row always written (tested with bad jsonb). |
| Delete camp failing on its own cascade | `no action` keys; full-camp delete tested. |
| Check-in on the wrong day / by the wrong person | Day rules in the database (staff today only, admins earlier, future refused), tested at the midnight boundary; every check-in logged. |
| The three-tab layout may not suit the desk | Jeffrey will judge it at CP1 ("go with it for now"); tabs are separate components, so a change is contained. |
| Desk tablet sign-ups hitting the limit | Camps' own 30-per-hour camp-only count; tested at CP6. |
| Migration number clash | 0013; re-checked before Builder A and at merge. |
| Price edits during an open sign-up | Snapshot + `price_changed` refusal. |
| Free-plan pooler connection budget | Connection limit 5 (or 3); checked at CP4. |
| Editing two live public-path files (`turnstile.js` ×2) | Optional argument, old default; Color Belt's 32 tests and live form re-checked at CP6. |
| Merge conflicts in shared files | Exact list; named PGlite step; merge small through the Main session. |
| Secrets leaking | SCRAM verifier made locally; never in chat, git or screenshots. |
| Waiver signature deleted too early | 3 years (Jeffrey to confirm with the insurer); sign-up keeps the date and the waiver text. |

---

## 10. Plan questions — answered (Jeffrey, 2026-10-19; rulebook v0.700–v0.703)

| # | Question | Answer |
|---|---|---|
| 1 | Public-form login + off switch | **A.** Own `camps_registrar` + own `CAMPS_REGISTRATION` (like Star). |
| 2 | Who sets up camps and templates | **A.** Admins only; staff run the roster. Staff see no Templates tab and "Ask an admin to add or change camps." |
| 3 | Who sees parent / emergency phones | **A.** Staff and admins, in Camper detail only. |
| 4 | Editing prices after sign-ups | **A.** Allowed; existing campers keep their price; re-price a camper only when their own days / member / extras change. |
| 5 | Removing a camp day someone picked | **A. Refused** — "Can't remove Wed, Dec 30: Mia Rossi and 2 more picked it. Change their days or withdraw them first." (v0.701, replaces the v0.237 proposal). |
| 6 | Removing days / extras after paying | **A.** Allowed; tag stays Paid; "Paid $X more than the total" in Camper detail; admin Edit payment if money is handed back. |
| 7 | Signature retention | **3 years after the camp's last day** (confirm with the insurer). |
| 8 | Phones in the change log | **A.** Logged like other fields. |
| 9 | Close / Reopen sign-up | **A.** Camp page ⋯ and list row ⋯, staff and admins, instant with Undo; staff Reopen only before the closing date, admins any time (Star v0.86); hidden on Not open yet. |
| 10 | Price changed while filling the form | **A. Refuse** — "The price changed while you were filling in the form. New total $X (was $Y). Check it and sign again." |
| 11 | Same child signed up twice | **B.** Color Belt's possible-duplicate pattern with compare / Keep this one / keep both (v0.702, C4b). |
| 12 | Sign-up tries per hour | **B.** Camps counts only its own `camp:` rows, 30 per hour. |
| 13 | Ages the form accepts | **Set per camp**: Ages accepted from / to (blank camp 3–17, templates carry theirs), age on the camp's first day (v0.703). |
| — | Added after the plan: check-in | **Daily check-in, camp page in three tabs Check in / Payments / Attendance, no check-out** (v0.704). |

---

## 11. After the build (housekeeping)
Status file at every step; rulebook rows from the camps block 0.700–0.799 (re-read first, CRLF, rows above `| Approved 2026-10-16 (v0.26) |`, changelog appended); handoff §9, `docs/README.md`; SETUP section number set at merge; claude.ai reading copies; tell the Star session about the optional Turnstile `action` argument.

---

## 12. Review fixes (2026-10-19)

Changes made after the independent review of the first draft:
- **M1** `camp_public_signup` checks jsonb shape, types and uuid pattern before any cast; the wrapper also catches `data_exception`, so every call writes an attempt row; tests for malformed uuid, fractional / huge / text age, wrong-type arrays.
- **M2** `camp_camper_days` and `camp_camper_extras` have their own `id uuid primary key` + unique keys (`change_log_write` needs `id`); catalog test.
- **M3** `no action` instead of `restrict` on camper-day / camper-extra keys; "picked day can't be removed" kept in `camp_update_camp`; full-camp delete test.
- **M4** The days question stated the conflict with v0.237 plainly (now answered: refuse, v0.701).
- **S1** Function-side field limits written out. **S2** `camp_roster.signed` = `signed_at is not null`. **S3** Duplicate sign-up question added (answered B). **S4** Desk-tablet rate-limit note + question (answered B). **S5** CP5 SQL-Editor snippet calling `camp_public_signup` so the roster is tested on the real database before deploy. **S6** No "same camp name" rule. **S7** Camper total over $2,000 → `invalid`.
- **N1** Migration 0013 stated as fact; registrar + switch in one question. **N2** Note that "accept and show" was the simpler build. **N3** `finished` instead of `done`. **N4** Checkpoints in order. **N5** `camp_` action tags. **N6** No `source` column, no 31-day rule; C1 Campers count from `camp_roster`.
- Added: phones-for-staff question; retention note; the Star session will need the Turnstile `action` argument.

## 13. Answers applied (CP0, 2026-10-19)

- All 13 answers written into §0–§10 (rulebook v0.700–v0.703); the questions section is now a table of answers.
- **Q5** refuse removing a picked day (replaces the v0.237 proposal). **Q9** Star v0.86 reopen rule; Close hidden on Not open yet. **Q11** possible-duplicate columns, `camp_resolve_duplicate`, staff Restore of their own duplicate copy < 10 s, Keep this one admin-only after the last day, tag priority. **Q12** camp-only count, 30 per hour. **Q13** `min_age` / `max_age` on camps and templates (default 3–17), checked by the public sign-up.
- **Contract review (2026-10-19, coordinator's decisions):** staff Withdraw / Restore; own ledger `camp_public_attempts`; Edit camp may correct held at / both schools; day / extra removal refused only for active campers (withdrawn campers' rows deleted); re-price rule literally as v0.700; `camp_changed` refusal with a waiver version; the shared price case table and exact data shapes are in the contract.
- **New (v0.704): daily check-in** — `checked_in_at`, `checked_in_by`, `checked_in_by_name` on `camp_camper_days`; `camp_check_in` / `camp_undo_check_in`; the camp page becomes **Check in / Payments / Attendance**; no check-out.
- **Superseded and removed:** the single C4 roster with the day filter and four summary cards (now three tabs; Payments shows the one-line summary of option A); the "Questions for Jeffrey" list; Print roster printing the screen list (it now prints the Attendance grid).
- Exact tables, functions, shapes, wording and tests moved to **CONTRACT-0013.md**.
