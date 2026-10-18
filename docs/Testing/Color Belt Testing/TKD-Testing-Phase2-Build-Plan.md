# Phase 2 build plan — Color Belt testing: Events, family registration form, roster with payments (DRAFT for review)

**Written:** 2026-10-17 · **Status:** draft, waiting for Jeffrey's OK (nothing is built until he says so)
**Design (approved 2026-10-17):** `TKD-ColorBelt-Events-Mockups.html` (E1–E14), `TKD-ColorBelt-Roster-Mockups.html` (R1–R8), `TKD-ColorBelt-Form-Mockups.html` (F1–F15), images in `Phase 2 images/`; decisions Q1–Q9 in `TKD-ColorBelt-Status.md`. Built on Star testing's approved Events / form / Candidates designs (branch `star-testing`, Star v0.60–v0.99).
**Rules:** CLAUDE.md; handoff §6 (security, non-negotiable); rulebook v0.33 (public path), v0.34–v0.36 (one school per event, Both blocked, per-school prices copied into the event).

> In plain words: staff create a testing event and pick which classes test at what time; the school gets one registration link + QR code; families register one student at a time on a public page (no login); staff see a roster per class and record payments at the desk. This is the first time anything in the dashboard is reachable **without signing in**, so most of the risk — and most of this plan — is the public path.

---

## 0. What phase 2 delivers (scope)

In: Events list + Add / Edit / Delete event with class times (E1–E14) · event page with the per-class Students roster, summary cards, Add student, Record payment (+ admin Edit / Undo payment), student detail + Edit details, Withdraw / Restore / Delete permanently, possible-duplicate box + compare (R1–R8) · Registration link + QR + printable flyer (R2–R3) · the public family form, all 15 states (F1–F15) · the shared public path (Pages Function + restricted database login, v0.33), built so Star testing can reuse it.

Out (later phases): grading / testing-day roster (phase 3), private testing (phase 4), emails (no email is collected, Q5), card payments online, the central Calendar link (decided with the Calendar session), moving Classes and ranks to Settings (planned, not decided).

---

## 1. Database — migration `0005_testing_events.sql`

(0003 = Color Belt phase 1, 0004 = Staff accounts. Star testing's first migration takes the next free number after this one.)

Same rules as 0003 (handoff §6): tables in `public` with a `testing_` prefix; RLS on everything; `revoke all … from public, anon, authenticated`; column-level `select` grants only where the app reads; every write through a `security definer` function with `set search_path = ''`, fully qualified names, `has_data_access()` first, `{status: …}` jsonb answers; every change logged in `public.change_log` (existing triggers pattern); re-run safe; no `anon` anything.

### 1.1 Tables

**`testing_events`** — id · location_code (immutable) · name (same name rules as classes; unique per school, case/space-insensitive) · testing_date · registration_open bool · auto_close_on date null (Star v0.67: closes at 11:59 PM Massachusetts time on that day; never reopens by itself) · **public_code** text unique (random, 6–8 characters, for the link `/register/<code>`; never guessable from the id) · version · created/updated at/by/by_name.
Status (Not open yet / Open until … / Registration closed / Testing today / Finished, Star v0.70) is **derived**, never stored.

**`testing_event_classes`** — the classes testing at this event (Q3): id · event_id · class_id (no FK — the class may later be renamed or deleted; phase-1 rule "events copy names/prices") · class_name (copy) · position (copy) · start_time · end_time (check end > start) · final_award copy (rank name + belt, or "None").

**`testing_event_ranks`** — a **copy** of each included class's ranks at event creation (v0.36: later price changes don't touch the event): id · event_class_id · rank_id (no FK) · name · position · the five belt_* values · early_cents · day_cents · private_cents · sparring_gear. "Testing for" is derived from this copy (next rank in the class, or the class's final-award copy).
Edit event: unticking a class is refused if it has registrations (message); changing times is allowed; prices stay as copied (an admin "Update prices from Classes and ranks" action is **not** in phase 2).

**`testing_registrations`** — id · event_id · event_rank_id (current belt; class follows) · first_name · last_name (same name rules, ≤ 60) · paying_by ('cash' | 'check' | 'card' — card only when staff add or change it) · stripes_confirmed bool (must be true) · source ('form' | 'staff') · **reference** (`CB-` + 4+ digits, unique, from a sequence) · signature (drawn signature, **PNG only**, stored as `data:image/png;base64,…`, prefix and decoded size (≤ ~50 KB) checked in the database; staff screens show it only as an `<img>`, never as HTML; no typed-name fallback, Star v0.89) · submission_id (uuid made by the browser, unique — a double tap or retry returns the existing reference instead of a second registration) · duplicate_of (the registration it may duplicate, for the compare dialog) · ack_text_version (which confirmation wording was ticked, Q7) · registered_at · status ('active' | 'withdrawn') · withdrawn_at/by_name · duplicate_state ('none' | 'possible' | 'kept_both') · version · created/updated.
Holds only names of minors + belt + payment method (no DOB, email, phone, address, medical — Q5). List views never show the signature.

**`testing_payments`** — append-only (old system rule): id · registration_id · amount_cents · method (cash/check/card) · check_number null · paid_on date · recorded_at · recorded_by/by_name · reverses_payment_id null (Undo / Edit = a reversal row + optional new row; nothing is updated or deleted). "Paid" = net amount > 0.

**`testing_public_attempts`** — rate-limit ledger for the public path: hashed client key (IP hash with a daily rotating salt — no raw IPs stored) · event_id · at · outcome. Cleaned up automatically after 2 days.

### 1.2 Staff functions (authenticated; `has_data_access()` first; roles per Star v0.68 / v0.92 / Q9)

Events (admin): `testing_add_event`, `testing_update_event` (expected version), `testing_delete_event` (expected ids of what is lost, like phase 1 deletes; admin only; confirmation lists registrations + payments). Registration switch: `testing_set_registration(p_event_id, p_open, p_expected_version)` — staff may close any time; open only before the closing date; admins any time (Star v0.68/v0.69 reopen rule).
Roster (staff + admin): `testing_add_student` (source 'staff', works after closing, incl. testing day), `testing_update_student` (names, class/belt → fee follows the event copy), `testing_change_paying_by`, `testing_record_payment` (amount defaults server-side to early or testing-day price by Massachusetts date; staff may change it), `testing_resolve_duplicate` (keep one → other withdrawn as "Duplicate copy"; or keep both).
Admin only (Star v0.92 / v0.95, carried over by Q9): `testing_withdraw_student` / `testing_restore_student`, `testing_edit_payment`, `testing_undo_payment` (after the toast window), `testing_delete_student` (permanent; expected ids/payments in the call so the confirmation can't be stale). The toast Undo of a just-recorded payment is allowed for the person who recorded it, **enforced in the database** (`recorded_by = auth.uid()` and recorded less than ~10 seconds ago).
Reads: plain selects with column grants + RLS `has_data_access()`; the roster joins registrations + net payment per registration through a `security invoker` view or a read function (decided in the contract).

### 1.3 Public functions (only the restricted login can call them)

New login role **`testing_registrar`** (Postgres role with LOGIN, password stored only as a Cloudflare secret / Hyperdrive config — never in git, chat, `.env.local` or screenshots). It has **no table privileges at all** and **execute on exactly two functions**:
- `testing_public_event(p_code text)` → the event's public view: name, date, school name + address (setting), note, deadline, state (open / not open yet / closed / finished / not found), and per included class: name, times, ranks with belts, prices, testing-for. Nothing about other events, no registrations, no counts.
- `testing_public_register(p_code, p_client_key_hash, p_first, p_last, p_event_rank_id, p_paying_by, p_stripes, p_signature, p_ack_version)` → `{status: ok, reference, … what-happens-next fields}` or `not_open / closed / invalid / rate_limited`. Validates everything again (never trusts the Function), checks the event is open **at that moment** (F10), rate-limits per client key and per event, flags "possible duplicate" (same normalized name + same event, Star v0.79 — silently accepted), writes one registration, logs it (`actor_name` = "Family form").
Both are `security definer`, `search_path = ''`, owned by the same owner as the tables (the 0003 C3h lesson), revoked from public/anon/authenticated/service_role, granted only to `testing_registrar`.

### 1.4 School street addresses
Needed on family pages and the flyer (Star v0.89, same need). Smallest fit: an `address` column on `public.locations` (edited by SQL / SETUP snippet until Settings exists). **Needs the two addresses from Jeffrey.**

---

## 2. The public path (shared with Star testing later)

```
Family's browser ──> tkd-dashboard.pages.dev/register/<code>   (static page, part of this repo's build)
        │  GET  /api/register/<code>          ┐
        │  POST /api/register/<code>          ├─ Cloudflare Pages Function (functions/api/register/[code].js)
        ▼                                     │    • checks Turnstile token (POST), honeypot, too-fast send, body size
                                              │    • hashes the client IP (salt = Cloudflare secret), never stores it raw
                                              │    • calls ONE database function as testing_registrar
                                              ┘
                     Hyperdrive (Cloudflare's database connector) ──> Supabase Postgres (login: testing_registrar)
```

- **No Supabase key in the browser or the Function.** The page never talks to Supabase; the Function never uses `anon` or `service_role`. Rejected again: Supabase Edge Function (needs the secret key), browser → `anon` (breaks the no-anon rule).
- **Connection:** Hyperdrive binding (same pattern the old Color Belt system already runs: Worker → Hyperdrive → restricted role) to Supabase's **session-mode pooler** (`aws-0-<region>.pooler.supabase.com:5432`, user `testing_registrar.eozkfbdfxqlcbpewhach`; the Free plan's direct host is IPv6-only). **Hyperdrive query caching OFF** (`--caching-disabled`): otherwise the register call could be answered from cache without writing, and "closed" could show "open" for up to a minute. Driver: `postgres` (Postgres.js) or `pg` with `nodejs_compat`, version pinned; client created per request; typed parameters only, never SQL built from strings; the Function fails closed if the binding is missing. Bindings and secrets set for the **Production** environment only, so branch preview builds can never reach the database. Dashboard settings vs `wrangler.toml`: chosen in the contract (one source of truth).
- **Kill switch:** a Pages variable `PUBLIC_REGISTRATION=off` makes the Function answer "not open" for every code without touching the database.
- **Spam check (Star v0.87):** invisible checks (honeypot field, minimum fill time, rate limit) + **Cloudflare Turnstile** (managed / invisible mode; the "Verify you are human" box only when Cloudflare is unsure, F6). Turnstile secret = Cloudflare secret.
- **The page:** a second, small entry in the Vite build (`register.html` + `src/register/*`): no supabase-js, no dashboard code, same tokens/look as the approved form (header strip, 44px buttons, 16px fields on phones — Star v0.88 exceptions). `_redirects`: `/register/*  /register.html  200`. "Register another student" + "Registered on this visit" live in that browser's sessionStorage only.
- **Headers:** `_headers` gets a Content-Security-Policy for `/register/*` that allows only this site + `challenges.cloudflare.com` (Turnstile); `Cache-Control: no-store` on `/api/*`; the dashboard's existing headers stay.
- **Preview mode:** `npm run dev:preview-mode` serves `/register/<code>` and answers `/api/register/*` from the fake backend (same rules), so the whole form can be tried without Cloudflare or the real database.

---

## 3. Front end (staff screens)

Change (shared files — listed in every summary): `src/screens/Testing.jsx` (Events tab left of Classes and ranks, v0.50), `src/lib/mockClient.js`, `src/App.jsx` (address `#testing/event/<id>` for browser Back, v0.83 pattern), `src/styles/tokens.css` (only if a token is missing), `public/_headers`, `vite.config.js` (second entry), README / SETUP.
New: `src/screens/testing/events/*` (EventsTab, EventDialog with ClassTimes, EventRowMenu, DeleteEventDialog, RegistrationLinkDialog + QR, Flyer print view), `src/screens/testing/event/*` (EventPage, SummaryCards, ClassSwitch, RosterRows, AddStudentDialog, RecordPaymentDialog, StudentDetailDialog, DuplicateBox + CompareDialog, RemovedGroup), `src/lib/testing/eventsApi.js`, `eventRules.js` (status, testing-for, fee by date — pure, node-checkable, shared with the mock and the public page), `qr.js` (QR generation, no network; small vendored encoder or a pinned dependency — decided in the contract), `src/lib/mockTestingEvents.js`, `src/styles/testing-events.css`, `src/register/*`.
Reused from phase 1: Dialog, RowMenu, Toast + Undo, ErrorBanner, Belt, useRowArrowNav, useReorderDrag (not needed), money.js, names.js, belts.js.
Behavior notes: roster reloads on location change / unlock / visibility / after writes; Record payment, Withdraw, Close/Open registration = instant with 5-second Undo; deletes ask first; stale → amber "Someone else changed this just now" + reload; payment details never appear outside this roster (rule 5 exception, Star v0.90); "Both" blocked as in phase 1.

---

## 4. Tests

- **Database** (`supabase/tests/0005_tests.sql` + PGlite runner, before AND after a seeded event): every function's role gate (anon none; authenticated only the staff functions; `testing_registrar` only the two public ones and **nothing else — no table select, no other function**); locked / signed-out sessions → `no_access`; staff vs admin splits; event copy is a true copy (changing Classes and ranks afterwards doesn't change the event); fee by date (Massachusetts time, day before / on the day); closing date and "closed while filling" (register at 11:59:59 PM vs 12:00:00 AM); duplicate flagging; reference uniqueness; append-only payments + reversal math; stale/expected-ids on deletes; rate limit; signature size cap; change_log rows for everything incl. public registrations; catalog checks (search_path, security definer, owners, grants, RLS on every new table); fingerprints file for production comparison.
- **Function** (`functions/` unit tests in Node with a fake database + fake Turnstile): rejects missing/failed Turnstile, honeypot filled, too-fast send, oversized body, wrong method, unknown code; never echoes database errors; never logs names or signatures.
- **Rules** (`node src/lib/testing/checks.mjs` extended): eventRules — status tags, testing-for, fees by date, class-time validation; mock mirrors the database exactly.
- **Screens:** design review with screenshots at 1280×800, 820×1180 touch, 390×844 touch, 320 wide against the approved mockups, incl. the public form in every state (F1–F15).

---

## 5. Order and checkpoints (each needs Jeffrey's OK where marked)

1. **CP0 — this plan OK** (+ the questions in §6).
2. Main merges `staff-accounts` + `star-testing`; this branch merges `main`; phase 2 decisions recorded in the rulebook (renumbered versions); contract `CONTRACT-0005.md` written.
3. Build in parallel by separate builders, no shared files between them: **A** database (0005 + tests + PGlite) · **B** public path (Function + `register.html` page + preview mock for it) · **C** data layer + staff mock · **D** staff screens. Then **security review** (database + public path, the most important review of this phase) and **design review**; fix; re-review.
4. **CP1 — preview walkthrough** by Jeffrey (staff screens + the public form in preview mode).
5. **CP2a — Cloudflare part 1, by Jeffrey with step-by-step help** (he clicks; nothing secret goes into chat): Turnstile site (site key public, secret key as a Production secret), IP-hash secret, `PUBLIC_REGISTRATION=off`. Written as a SETUP.md section first.
6. **CP3 — database** (production, pasted by Jeffrey): re-run the 0002 / verify_pin / 0003 / 0004 tests; OK → paste 0005; set the `testing_registrar` password **as a SCRAM verifier made on this PC** (so the real password never appears in SQL Editor history or database logs; then blank the snippet, handoff §6); connector read-only checks (fingerprints, advisors, the registrar catalog checks); run `0005_tests.sql`; add the two street addresses.
7. **CP2b — Cloudflare part 2:** Hyperdrive config for `testing_registrar` with caching off (needs the role from CP3), bound to Production only.
8. **CP4 — local check of the staff side** against the real database (as in phase 1).
9. **CP5 — OK to push** (= deploy) with the kill switch **off**. Then: create a **TEST event**, switch `PUBLIC_REGISTRATION=on`, register from a phone, check the roster + change_log + Hyperdrive cache status, delete the TEST event. Only then is the first real event created; its link goes to families after Jeffrey has tried it once.
10. **Rollback (any time):** `PUBLIC_REGISTRATION=off` (instant) → `alter role testing_registrar nologin` (SQL Editor) → roll back to the previous deployment in Cloudflare Pages. Nothing in the database needs undoing; registrations already made stay.
11. Housekeeping: status file, handoff §9, docs README, SETUP; tell the Star session the shared path is ready.

---

## 6. Questions for Jeffrey before building (one at a time, with visuals where it's a screen choice)

1. **Street addresses** of both schools (needed — not a choice).
2. **Which event goes first on the new system,** and do the November events keep running on the old system until CP5 is done? (Recommendation: yes; switch with the first event after CP5, and keep the old system read-only for October's records.)
3. **Signature kept how long?** The drawn signature is stored with the registration (needed to show the family agreed to the non-refundable fee). Proposal: kept as long as the registration, deleted with it; a retention rule for all testing records is decided later (handoff open item).
4. **Cloudflare account access** for CP2 (Turnstile + Hyperdrive need the school's Cloudflare login).
5. **Adjusting prices for one event:** rulebook v0.36 says an event "can adjust" its copied prices — in phase 2, or later? (Recommendation: later; phase 2 copies the prices and staff can change the amount when recording a payment.)
6. **Paid, exactly:** is a partial payment "Paid"? What happens when a paid student's belt (and so fee) changes afterwards? (Recommendation: Paid = paid in full; a belt change on a paid student shows "Paid · $5 due" in amber.)
7. **Star changed after our approval** — align Color Belt? (a) Add student moves into the event page header, left of Registration link (Star v0.101, page-header button rule v0.45); (b) no Check number in Record payment (Star v0.102). (Recommendation: align both, so the two testing types work the same way.)
8. **Delete permanently removes payment records** — accepted for Color Belt as for Star (v0.95)? (Withdraw keeps them.)
9. **Same web address for families?** The public form runs on `tkd-dashboard.pages.dev/register/…`, the same address as the staff dashboard (protected by a strict CSP on that page). A separate address is possible later with the school's own domain. (Recommendation: same address now.)

Settled without a question: the top rank of a class whose final award is None (e.g. Deputy) can still register — it shows "No new rank" as Testing for (v0.62, practice testing); no typed-name signature fallback (Star v0.89).

---

## 7. Risks (and what the plan does about them)

| Risk | Mitigation |
|---|---|
| First public, unauthenticated path into the database | Restricted login with execute on 2 functions only, no table rights; both functions re-validate everything; Turnstile + honeypot + timing + rate limit; no raw IPs; security review focused here; TEST-event check before deploy. |
| Secrets leaking (registrar password, Turnstile secret, salt) | Only in Cloudflare secrets / Hyperdrive and the SQL Editor; never in git, `.env.local`, chat or screenshots; SETUP steps say so; reviewer greps the diff. |
| Hyperdrive / pooler connection limits on the Free plan | One short query per request; checked at CP2; Supabase Pro upgrade is already an open item before daily use. |
| Time zones (closing at 11:59 PM, testing-day price) | All date logic in the database in `America/New_York`; tests at the minute boundaries. |
| Staff and families seeing different prices | One source of truth: the event's copied prices; `eventRules.js` shared by the screens, the mock and the public page; database decides the amount it records. |
| Spam / fake registrations | Turnstile + rate limit; "Possible duplicate" box; staff can withdraw; nothing a family submits is shown to other families. |
| Two systems during the switch | Old system stays read-only once the new one runs a real event; one event never lives in both. |
| Star testing builds on the same path later | The Function and registrar pattern are written generically (testing type in the function name / route), documented in the contract for the Star session. |
| Bigger phase than phase 1 (payments merged in, Q8) | Parallel builders with no shared files, two reviews, preview walkthrough before any production step. |

---

## 8. Changes adopted from the independent review (2026-10-17)

Must (also written into the sections above):
1. Hyperdrive query caching **off**; checked at CP5 (cache status) — §2, CP2b.
2. Withdraw / Restore are **admin only** (Star v0.92 / v0.95 via Q9) — §1.2; role-gate tests.
3. Signature **PNG only**, data-URL prefix + decoded size checked in the database, shown only as an image — §1.1.
4. `testing_registrar` locked down **and proven by tests**: created `NOINHERIT NOCREATEDB NOCREATEROLE NOBYPASSRLS CONNECTION LIMIT 5`, role-level `statement_timeout = 5s` and `idle_in_transaction_session_timeout`; catalog tests: across every schema (except pg_catalog / information_schema) it can execute **only** the two public functions; no usage/create on any schema beyond what those need; no table privileges anywhere; `pg_has_role('authenticator', 'testing_registrar', 'member')` is false (PostgREST can never become it); owner = the tables' owner (0003 C3h lesson).
5. Cloudflare setup split around the database step (Hyperdrive needs the role to exist) — §5 CP2a / CP3 / CP2b.
6. Kill switch, Production-only bindings, TEST event after deploy, and a rollback section — §2, §5.

Should:
- Password set as a SCRAM verifier made locally (never the real password in SQL Editor history or logs) — §5 CP3.
- Turnstile verified on the server with siteverify: `success`, `hostname` (production host), `action`, `remoteip`; token requested at Send (tokens are single-use and expire after 300 s), so a slow signer doesn't see a false "Verify you are human".
- Double sends: browser-made `submission_id`, unique in the database, repeat returns the existing reference — §1.1.
- Rate limits: generous per client (families share school Wi-Fi and phone carriers share IPs); the per-event limit **logs** instead of refusing (so an attacker can't block real families); client key = HMAC(secret, date ‖ IP) (daily rotation without storing a salt per day); old rows deleted inside the register function (no scheduled job); a Cloudflare rate-limiting rule on `/api/register/*` GET as well, so codes can't be guessed cheaply.
- Same origin as the staff dashboard: strict CSP on `/register/*` only — `default-src 'self'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'`; the Function checks `Origin` and `Content-Type: application/json` on POST and the body size before reading it. (Question 9 asks Jeffrey about a separate address.)
- Fee by date, exactly: `paid_on < testing_date` (America/New_York) → early price, otherwise the testing-day price; a back-dated `paid_on` follows the same rule; staff can still change the amount.
- The register function refuses once the event is Finished (after the testing date) whatever the switch says, including events with no closing date.
- Every function that takes an `event_rank_id` checks it belongs to the same event (test).
- Duplicates: `duplicate_of` stored for the compare dialog; Edit details re-checks.
- Payments: `amount_cents > 0` (with a cap) on normal rows; a reversal row = minus the original, `reverses_payment_id` unique, a reversal can't be reversed.
- The production `register` bundle is checked for mock code (grep `dist/`).

Nits: two matching `_headers` CSP lines combine (both apply) — documented; the `/register/*` rewrite is tested against Pages' pretty-URL redirects; the QR code and flyer use the fixed production address, not the current page's; never add a public lookup by reference number (`CB-` numbers are sequential); "Massachusetts time" is `America/New_York` everywhere in code.
