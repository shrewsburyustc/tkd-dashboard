# Current Black Belt registration page — read-only analysis (2026-10-18)

Live page: https://blackbelt-registration-ustc.shrewsburyustc.workers.dev/
Method: plain GET of the page (curl, 192 KB — mostly a base64 crest image), GET of the one data URL the page itself references (`blackbelt-info` worker), read-only Cloudflare connector (`workers_list`, `workers_get_worker`, `workers_get_worker_code`). Nothing was submitted, typed or clicked. No text on the page tried to instruct an AI.

## 1. Architecture (what talks to what)

```
Browser (single static HTML file, all JS inline, no framework)
  ├─ GET  https://blackbelt-info.shrewsburyustc.workers.dev/     ← dates, times, prices (JSON)
  │        (Worker: every 5 min cron fetches the Apps Script, keeps last good copy in KV "INFO_KV")
  ├─ GET  <Apps Script>/exec?callback=__infoNNN   (JSONP fallback, and the staff editor's source)
  ├─ POST <Apps Script>/exec   mode:'no-cors', text/plain, JSON body  ← REGISTRATION
  └─ POST <Apps Script>/exec   {action:'updateInfo', info:{…}}       ← STAFF EDIT of dates/prices
Apps Script → (presumably) a Google Sheet ("Testing Info" sheet + registrations; the email footer
              fields suggest it also sends an email). Its code is not visible from here.
```

- Apps Script URL is hard-coded in the page (line ~234) and in the `blackbelt-info` worker: (the Apps Script web-app URL; not copied here). A web-app URL is not a secret, but it is the only thing standing between the public and the Sheet.
- Cloudflare account (connector worked) has 5 Workers: `blackbelt-info`, `blackbelt-registration-ustc`, `ustc-color-belt-staging`, `tkd-camps`, `square-webhook-proxy`.
- `workers_get_worker_code` for `blackbelt-registration-ustc` failed (connector returned an empty/invalid result) — most likely a static-assets-only Worker, so the served HTML *is* the code. `blackbelt-info` source was read: GET-only, CORS `*`, `no-store`, validates that `Cycle` exists before replacing the KV copy. No secrets in it.
- No security headers on the page response (no CSP, no X-Frame-Options, no Referrer-Policy). `robots.txt` exists; `/api` and `/config` → 404.

## 2. The page, top to bottom

### Header
Crest, "Black Belt Test Registration", "Jae H. Jeong's U.S. Taekwondo Center — Worcester & Shrewsbury", red pill with cycle name (live value: **"Fall 2026"**).

### Card: Testing Schedule & Requirements (from the Testing Info sheet)
Three test cards, each Date / Time / Location + fixed note:
| # | Name | Live date | Live time | Live location | Fixed note |
|---|---|---|---|---|---|
| 1 | Physical Conditioning | 2026-09-26 | Indoor 12:30–2:30pm · Outdoor 2:30–3:30pm | Worcester School, 1141 Main St (Outdoor: Horgan Arena) | Bring running shoes and your uniform. |
| 2 | Technical Requirement | 2026-10-24 | 12:30–3:30pm | Shrewsbury School, 370 Boston Turnpike | Referee / sparring (bring gear), target kicking, and knowledge. |
| 3 | Curriculum Test | 2026-11-21 | 2:00–5:00pm | Shrewsbury School | All curriculum and board breaking. |

"Important Deadlines": Application due (2026-09-19); "Project, appreciation letters, egg test & meditation due" (Submissions due, 2026-11-14).

"Payment Options — <rank>" box (appears once a rank is chosen):
- Option 1 · Pay in full — amount, "by <Payment due>"; + Kukkiwon line if chosen; Total.
- Option 2 · 3 payments — Payment 1/2/3 labelled with the three tests, each "by <due>"; Kukkiwon "with Payment 1"; Total.
- Note: "If paying in 3: bring all three checks (each post-dated to its date above) to the school by <Checks due>."

### Prices (live values from the Sheet; page fallbacks in brackets are never shown because nothing price-related renders until the info loads)
| Rank | Pay in full | 3 payments | Kukkiwon cert (hard-coded in page, NOT in Sheet) |
|---|---|---|---|
| 1st Dan | $870 [760] | 290 + 290 + 290 = $870 [270+270+250] | $100 |
| 2nd Dan | $990 [960] | 330 ×3 = $990 | $110 |
| 3rd Dan | $1,500 [1450] | 500 ×3 = $1,500 | $140 |
| 4th Dan | $2,700 [2320] | 900 ×3 = $2,700 [800×3] | $170 |

Live due dates: Payment 1 / Pay-in-full / Checks / Application all 2026-09-19; Payment 2 2026-10-17; Payment 3 2026-11-14. The Sheet also carries unused `Fee 1st Dan…4th Dan` = 790/990/1500/2400 (stale, conflicting with "Full Payment" values) and unused `School address` / `School phone`.

### Collapsible "Click here to see Testing Requirements" (only after a rank is picked; all hard-coded in the page)
1. Physical Conditioning — Stretching, Sit-up (20 s), Push-up (1 min), Static Jump, Long Jump, Sprint 4×10 m, Pull-up/Hold, Sprint 100 m, 0.5/1 Mile; each with an A+…D table by age band (8 & under / 9–12 / 13 & over).
2. Technical — 1st–3rd Dan: Referee Seminar 2 cr, Free Sparring 3, Target Kick 2, Korean Terminology 2, TKD Knowledge 2. 4th Dan: 10/4/4/4/4 + Written Test 10.
3. Other Requirements — Egg Test 5, Meditation 4, Assistant Instructor Course 5, Appreciation Letter 2, TKD Project 4 (4th Dan: 4/4/10/4/10).
4. Curriculum — per-rank list with credits (e.g. 1st Dan: Basic 10 Motions, Tae-Geuk 1–8, Sa Bang Chuck 1–13, One Step Sparring (adult only), Technical Break, Power Break, Self-Defense, 5 cr each).
- Bonus points: Extra Stripes, Outstanding Performance, Competition Experience, Attendance, Special Event Participation, Breaking Class Participation (tables per rank).
- Passing totals: 1st Dan 275 (children) / 293 (adults); 2nd 261; 3rd 293; 4th 453. "Any subject graded D must be re-tested."
This is grading-rubric content, not registration — but it is the only place families see it, so the rebuild needs a home for it (or a link).

### Form "Candidate Registration" (`novalidate`; all validation in JS on submit)
| Field | id / name | Type | Required | Validation / behaviour |
|---|---|---|---|---|
| Full Name | `fullName` | text, autocomplete off | yes | non-empty after trim only. Warning: "Enter your name exactly as you want it printed on your black belt and certificate." |
| Date of Birth | `dob` | `<input type=date>` | yes | non-empty only (no range check). Shows "Age at today: N". Age < 18 → shows Parent block and relabels signature. |
| Sex | `sex` radio | Male / Female | yes | one chosen |
| Rank Testing For | `dan` select | 1st / 2nd / 3rd / 4th Dan | yes | `?dan=2nd%20Dan` in the URL pre-selects and disables the select ("Registering for 2nd Dan.") |
| Email | `email` | email, autocomplete off | yes | regex `^[^\s@]+@[^\s@]+\.[^\s@]+$`. Hint: "Results and any make-up notices are sent here." |
| Optional: Kukkiwon Dan Certificate | `kuk` radio | Yes — add it / No thanks (default No) | no | hint: email one passport-size photo if Yes (no upload; photo goes by email) |
| Payment Plan | `plan` radio | "Pay in Full" / "3 Payments" (labels show amounts) | yes | only rendered after rank chosen and info loaded |
| Parent / Guardian Name | `parentName` | text | yes if age < 18 | non-empty only |
| Waiver & Agreement | static text | — | (implied by signing) | No checkbox. Text: every subject must pass, failed subjects made up later; fees non-refundable, applied to next test if not passed; physical-risk acknowledgement and release of the school, owners, instructors, staff. "By signing below I agree." |
| Signature | `<canvas id=sigPad>` | drawn (mouse + touch) | yes | "has ink" flag only. "Clear signature" link. Label: "Your Signature" (18+) or "Parent / Guardian Signature". Canvas drawn at 2× resolution. |
| Submit | button | "Submit Registration" | | disables, shows "Submitting…" |

### Payload sent (POST, `mode:'no-cors'`, `Content-Type: text/plain`)
`fullName, dateOfBirth, age, sex, danTestingFor, email, kukkiwonCert, paymentPlan, signedBy ("Parent/Guardian: <name>" or "Self (18+)"), signatureImage (PNG data URL), submittedAt (browser-local toLocaleString)`.

### Confirmation
Form hidden; card "✓ Registration Received — Thank you, <name>. Your <dan> test registration has been received." plus a `<pre>` summary (rank, plan, DOB, signed by, Kukkiwon). It still carries the stale line "this draft isn't connected to the school's system yet" — on the live page.

### Payment handling
**No online payment.** Families pay by check (3 post-dated checks handed in by the Checks-due date, or one payment) — cash isn't mentioned; no Stripe/Square/PayPal on this page (there is a separate `square-webhook-proxy` worker in the account, unrelated to this page). The form only records the chosen plan.

### Eligibility rules
None enforced. Any visitor can pick any Dan. No check of current rank, student record, school, attendance, age minimum, or that the cycle is open. Only age < 18 matters (parent signature). The page doesn't ask which school the candidate trains at.

### Bot protection
None: no CAPTCHA/Turnstile, no honeypot, no timing check, no rate limit (anything Apps Script does server-side is unknown).

### Hidden staff editor
`#admin` in the URL, or triple-click the crest, opens "Staff — Edit Testing Info": ~45 inputs (cycle, school 1/2 name/address/phone, test dates/times/locations incl. outdoor, deadlines, all payment dates, 16 prices). It reads fresh values from the Apps Script (JSONP) and Save POSTs `{action:'updateInfo', info}`. The code comment says "password still guards saving", **but the request carries no password, token or session** — see problem S1.

## 3. Problems found

### Security
- **S1 (high, needs checking in the Apps Script):** staff Save sends `{action:'updateInfo', info}` with no credential. Either the Apps Script accepts it from anyone on the internet (anyone who opens `#admin` — or just posts to the URL — can change public dates, locations and prices), or the save is silently rejected and the "Saved" message is a lie (`no-cors` means the page can't see the answer). Look at the Apps Script `doPost` to know which. I did not test it.
- **S2 (high if S1 is open):** every Sheet value is inserted with `innerHTML` (cycle name, times, locations, dates). If S1 is open, that is a stored-XSS path: someone writes `<img onerror=…>` into a location and it runs on every family's browser. No CSP to stop it.
- **S3:** registrations go to a public Apps Script web app with no auth, no bot check, no rate limit, no size limit, no server-side validation visible. Anyone can flood the Sheet with fake candidates (including fake "minors" with signatures).
- **S4:** `mode:'no-cors'` → the response is opaque, so the page shows "Registration Received" for any HTTP answer, including an Apps Script error page or quota failure. Families can be told they registered when nothing was saved. No idempotency id → a double-tap or retry creates duplicates.
- **S5:** No security headers on the page (CSP, frame-ancestors/X-Frame-Options, Referrer-Policy). Page can be framed (clickjacking).
- No secrets found in client code or in `blackbelt-info`. The Apps Script URL is public by nature.

### Privacy (records are mostly about minors)
- **P1:** Collects DOB, sex, email and a drawn signature of a minor's parent, and stores them in a Google Sheet via an anonymous web app — outside our Supabase controls (RLS, change log, access rules). Unknown who can open that Sheet.
- **P2:** DOB is needed only to decide "minor or not"; the payload also stores `age` and the full DOB. Sex is collected with no stated purpose on the page (likely for sparring pairing / certificate). Our rulebook keeps DOB out of list views — the Sheet has no such control.
- **P3:** The email is free-typed per candidate, not linked to a family record; no confirmation email loop to prove ownership.
- **P4:** The signature PNG is a 2× canvas → often tens of KB as base64; a Google Sheets cell holds max 50,000 characters, so signatures may be getting truncated (if stored in a cell). Unverified.

### UX / data quality
- **U1:** The cycle's Application/Payment-1/Checks due date (2026-09-19) has passed, yet the form is fully open — there's no open/closed state at all.
- **U2:** "Pay in full" now equals the 3-payment total (e.g. 1st Dan $870 both ways); the page's fallback prices and the unused `Fee …` Sheet keys (790/990/1500/2400) disagree with the live prices — three different price sets exist.
- **U3:** Kukkiwon certificate fees are hard-coded in the HTML; staff can't change them from the editor.
- **U4:** Age is computed "at today", not at the test date; a 17-year-old who turns 18 before the test gets the parent path (and vice versa).
- **U5:** Waiver has no explicit "I agree" checkbox, no waiver version recorded, and the signed text isn't saved with the registration.
- **U6:** Parent name is free text; no relationship, no parent email/phone. No phone number at all; no school (Worcester/Shrewsbury) field.
- **U7:** Stale "this draft isn't connected to the school's system yet" on the live confirmation.
- **U8:** `submittedAt` is browser-local text (device clock/locale), not a server timestamp.
- **U9:** Radio inputs are `display:none` → keyboard users can't tab to Sex / Kukkiwon / Plan; errors aren't tied to fields (`aria-describedby`), not announced. Labels aren't linked to inputs (`for`).
- **U10:** Name field gives no rule (length, characters), yet it's printed on the belt/certificate — one field for "full name" makes certificate printing and sorting harder (Color Belt uses first/last).
- **U11:** Physical-conditioning date (2026-09-26) is before this form likely gets used by late sign-ups; no per-candidate make-up handling.

## 4. Compare: our Color Belt public form (what we can reuse)

Files: `register.html`, `src/register/*`, `functions/api/register/[code].js`, `functions/_lib/*`, `public/_headers`, `public/_redirects`.

- **Page:** `register.html` is a second Vite entry in the same build (shares no dashboard code). `public/_redirects` rewrites `/register/<code>` → `/register` (200). One link/QR per event via an 8-char code (`[a-hjkmnp-z2-9]{8}`).
- **Strict CSP** for `/register*` in `public/_headers`: only self + `challenges.cloudflare.com` (Turnstile); `connect-src 'self'`, `frame-ancestors 'none'`, `base-uri 'none'`.
- **Client (`src/register/api.js`):** only two calls, both same-origin: `GET /api/register/<code>` (event) and `POST /api/register/<code>` (JSON). Every result is a `{status}`; network → `network`. Preview mode swaps in `src/lib/testing/publicApi.preview.js` (dropped from production builds).
- **Pages Function (`functions/_lib/register.js`)** — order on POST: kill switch `PUBLIC_REGISTRATION="on"` + all settings present → Origin must equal `PUBLIC_ORIGIN` → `Content-Type: application/json` → code shape → rate limit (anonymous HMAC client key from `clientKey.js`, daily-rotating, IPv6 /64; `RATE_LIMITER` binding or in-memory fallback) **before** any DB connection → body ≤ 100 KB (`http.js` streaming reader) → honeypot `website` → fill time ≥ 4 s (`started_at`/`sent_at`) → type/size checks → **Turnstile siteverify** (`turnstile.js`: checks success + hostname + action `register`, fails closed) → DB call. Never returns DB error text; logs only method/status/ms.
- **DB access (`functions/_lib/db.js`):** Postgres.js through Cloudflare **Hyperdrive** (`HYPERDRIVE` binding; the restricted login `testing_registrar`'s password lives only in Hyperdrive). It may call exactly two security-definer functions: `public.testing_public_event(code)` and `public.testing_public_register(code, client_key, submission_id, first, last, event_rank_id, paying_by, stripes, signature, ack_version)`. Typed parameters, `prepare:false`, `max:1`. The DB re-checks every rule, enforces its own per-client attempt limit (`testing_public_attempts`), and `submission_id` makes retries idempotent.
- **Client form:** first/last name with shared name rules (`src/lib/testing/names.js`), signature pad (`SignaturePad.jsx`, ≤ 70,000 chars, validated), ack checkbox + `ACK_VERSION`, open/closed/finished states, "register another student", reference number on success.

**Reusable almost as-is for Black Belt:** the whole `functions/_lib/` stack (http, turnstile, clientKey, rateLimit, kill switch, Origin/JSON/honeypot/timing checks), the CSP, the `/register/<code>` pattern (could become a `/blackbelt/<code>` route or an event-type flag), `SignaturePad.jsx`, `api.js`, `turnstile.js`, name rules, preview-mode fake API, the test harness in `functions/tests/`. **New work:** a Black Belt event/cycle model (three test dates, deadlines, two payment plans, per-Dan prices, Kukkiwon add-on), new security-definer functions `…public_event`/`…public_register` for Black Belt (or extend the existing ones), deciding which extra fields are truly needed (DOB vs "is the candidate under 18?", sex, email, parent name), and a home for the grading-rubric content. `db.js` would need its new calls added (it is deliberately limited to two).

### Things to settle before building (for Jeffrey)
1. Do we really need DOB and sex on a public form, or can staff fill those from the student record?
2. Should Black Belt registrations be tied to existing student records (staff pick from a list) like Color Belt, or stay free-typed?
3. Keep checks-only payment, or add online payment later?
4. Who fixes S1/S2 on the live page in the meantime (it stays in real use until the rebuild ships)?
