# ustaekwondo.net on the dashboard — plan (step 1, written 2026-11-12; §0, risks and Q4 corrected the same day)

Nothing in this file has been done. It is a plan for Jeffrey to decide on. No DNS, Cloudflare, Supabase or app change has been made.

## 0. What I found (read-only checks, 2026-11-12)

| Finding | Why it matters |
|---|---|
| **`ustaekwondo.net` and `www.ustaekwondo.net` currently show Squarespace's "Coming Soon" placeholder page** (checked 2026-11-12; page title "Coming Soon", about 3 KB; I first mistook it for a live site). It is NOT a live school website. The apex name answers from Squarespace's servers, and `www` points at `ext-sq.squarespace.com`. | Nothing live is at stake on these two names. They are reserved for the **new public school website** (Website session's plan: `www.` and the bare name = website, `app.` = dashboard). So the dashboard still goes on a **subdomain** (`app.ustaekwondo.net`), not on the bare name or `www.`. The school's real current website is probably `jeongsustc.com` (old site, hosted at HostGator; **not confirmed by Jeffrey and out of scope: we never touch it**). |
| **The domain's DNS is hosted at Squarespace** (name servers `nsd1-4.squarespacedns.com`), not at Cloudflare. | DNS is the internet's phone book: it says which server answers for a name. Squarespace holds the school's phone book, so the one new line we need for `app.` is added there. Cloudflare allows this for subdomains (a "CNAME" record, below). A bare name (`ustaekwondo.net` with nothing in front) cannot be a CNAME, and Cloudflare Pages only takes a bare name if Cloudflare holds the whole phone book. That matters for the website, not for `app.` (see §2b, the one shared decision). |
| **The school's `@ustaekwondo.net` email runs on Google Workspace** (the MX record points at Google; the SPF TXT record says Google may send mail; a Google DKIM key record exists at `google._domainkey`). | **These are the only records truly at stake.** Do not change, delete or move them; if the DNS ever moves, copy every one and check mail before and after (§2b). Adding an `app` record touches none of them. |
| None of `app`, `dashboard`, `forms`, `join`, `go`, `staff` or `portal` exist as names yet. | All are free to use. |
| **No Supabase Edge Functions exist** (checked with the read-only connector). Supabase's own API accepts calls from any web address, so it has no "allowed origins" list to change. | The database side needs nothing for CORS. |
| **The app never stores a full address in the database.** I searched every migration: there is no `pages.dev` or `http…` in any table or function. Families' links are made in the browser from the short public code (`/camp/k7m2qp4x`). | Existing records and the live Shrewsbury Thanksgiving camp need no data change. **No migration is needed for this work.** |
| Sign-in is email + password only. The app has no password-reset email, magic link or invite link (rulebook §5: admins reset passwords). | The Supabase "Site URL / Redirect URLs" setting is not used by any screen today. It only needs to be tidy for the future (step 5 below). |

## 1. Every place the `pages.dev` address is used or assumed

### A. Things that will break if only one address is allowed (the real work)

1. **The five public-form Functions refuse any address but one.** `functions/_lib/register.js`, `camp.js`, `starRegister.js`, `bbRegister.js` and `forms/forms.js` each check that the browser's `Origin` header equals the setting `PUBLIC_ORIGIN` exactly (e.g. `register.js:240`), and ask Cloudflare's Turnstile ("are you human?") to confirm the page's hostname equals the hostname of `PUBLIC_ORIGIN`. This is a protection against other websites posting to our forms. Result: the day a family opens a form on the new address, **their submit is refused**, and an old printed QR code keeps working only while `PUBLIC_ORIGIN` still names `pages.dev`. Fix: `PUBLIC_ORIGIN` becomes a list (comma-separated) of addresses, e.g. `https://tkd-dashboard.pages.dev,https://app.ustaekwondo.net`. The check passes if the browser's address is in the list, and Turnstile is then told to expect that same address's hostname, so the protection stays exact. One shared helper (`functions/_lib/origins.js`) for all five, with tests. An old single value still works, so the order of steps below never leaves a gap.
2. **The Turnstile widget lists allowed hostnames** (SETUP §12a step 1: only `tkd-dashboard.pages.dev`). The new hostname must be **added** (not swapped). Cloudflare dashboard → Turnstile → the widget `TKD family form`. Without it, the "Verify you are human" box fails on the new address.
3. **The Cloudflare Pages setting `PUBLIC_ORIGIN`** (Pages project → Settings → Environment variables, Production). Cloudflare only applies a changed setting to the **next deployment**, so it is changed right before the code push.

### B. Where the app builds the links and QR codes families get (src/)

All links are built from one fixed address constant, never from the address bar (deliberate, so a link copied on a preview or localhost can't leak):

| File | What |
|---|---|
| `src/lib/testing/eventRules.js:28` | `PUBLIC_ORIGIN`, used by Color Belt `/register/<code>`, Forms `/f/<name>` (`src/lib/forms/share.js`), Star `/star/<code>` (`src/lib/star/links.js`), Black Belt `/black-belt/<code>` (`src/lib/blackBelt/qr.js`) |
| `src/lib/camps/campRules.js:76` and `:911` | a second copy for Camps `/camp/<code>`, one QR per school |
| `src/parts/M5.jsx:13` | a third copy, samples on the parts page |
| `src/forms/ics.js:64` | "Add to calendar" file: each event's id ends `@tkd-dashboard.pages.dev`. It is only a random label, harmless either way. Tidy only. |
| Comments naming `pages.dev` | `pageAddress.js`, `RegistrationLinkBox.jsx`, `StarFlyer.jsx`, `RegistrationLinkDialog.jsx`, `lib/*/qr.js`, `links.js`, and SETUP.md. Words only. |
| Checks that assert the old address | `src/lib/**/checks.mjs`, `eventsChecks.mjs`, `functions/tests/*.test.mjs`. They get updated with the change. |

Plan: **one** constant (`eventRules.js`), with Camps and the parts page importing it, so the address is in one place. The printed flyers and result emails need nothing: the flyers are drawn by the app from this constant; result emails are plain `mailto:` links holding only an address and a subject, with no dashboard link in them.

### C. Hosting files

- `public/_redirects` and `vite.config.js`: path-based only (`/camp/*`, `/f/*`…). They work on any hostname. **No change.**
- `public/_headers`: the strict content policy uses `'self'` (= whatever address the page is on). **No change needed.** Optional addition: a `X-Robots-Tag: noindex` line so Google never lists the dashboard under the school's real domain (only `register.html` has a noindex tag today).
- `public/_routes.json`, `functions/api/*`: no addresses in them.

### D. Outside the repo (Jeffrey does these, I give click-by-click steps)

1. **Squarespace → Domains → `ustaekwondo.net` → DNS settings:** add one record, `CNAME`, host `app`, value `tkd-dashboard.pages.dev`.
2. **Cloudflare → Workers & Pages → project `tkd-dashboard` → Custom domains → Set up a domain** → `app.ustaekwondo.net`. Cloudflare's own page warns that a CNAME added at the DNS host **before** the domain is attached in Pages shows an error 522, so the order is Pages first, then the CNAME (Cloudflare shows the exact record to add).
3. Cloudflare → Turnstile: add the hostname (item A2).
4. Cloudflare Pages → Environment variables → `PUBLIC_ORIGIN` (item A3).
5. **Supabase → Authentication → URL Configuration:** add `https://app.ustaekwondo.net` to the Redirect URLs; change the Site URL to it only after staff have moved. Nothing uses it today, so this is housekeeping, not a risk.
6. `supabase/SETUP.md` gets a numbered section for the whole procedure, and the old mentions of the single address get a pointer.

### E. Per-device data (the one thing that surprises staff)

A browser keeps its saved data **per web address**. A staff tablet that opens the dashboard at the new address starts empty: the staff member signs in again with their password and PIN; this device's **school** falls back to Worcester until set again; "Hide private details", the Finance refund layout, the "seen" reminder list and a running kiosk are all reset on that device. Nothing is lost in the database. Families are not affected (their forms keep nothing between visits). That is why I'd not force staff to move in the same step as the family links (Question 2).

## 2. Layout options

| | Option | Staff dashboard | Family links | Pros | Cons |
|---|---|---|---|---|---|
| **A** | **One name: `app.ustaekwondo.net`** | same | same | One DNS record, one Pages domain, one Turnstile hostname. Neutral word for families ("app", not "dashboard"). A staff-only page still needs a login, same as today. | Families and staff share one address, as they do today. |
| B | One name: `dashboard.ustaekwondo.net` | same | same | Matches "the dashboard" in staff's heads. | Families see "dashboard" in a link on the flyer. Otherwise identical to A. |
| C | Two names: `dashboard.` for staff, a short one for families (`join.` or `go.`) | `dashboard.` | `join.` | Prettiest family links, shorter QR codes. | Two DNS records, two Pages domains, two origins in every check. More to explain and to go wrong. Both names still serve everything unless a Function is added to separate them. |
| X | The bare `ustaekwondo.net` or `www.` | | | | Not for the dashboard: reserved for the new public website (Website session). The bare name can't be a CNAME, and Pages takes it only if Cloudflare holds the DNS (§2b). |

Options A, B and C can be extended later (adding `join.` to A later is "add, never break" and takes the same steps again). **Recommendation: A, `app.ustaekwondo.net`.** If Jeffrey prefers the word "dashboard", B costs nothing extra.

## 2b. The one shared DNS decision (Dashboard + new school website)

Both projects need names under `ustaekwondo.net`: the dashboard on `app.`, the new public website on `www.` and the bare name. Nothing live sits on those names today (Coming Soon placeholder), so the only thing to protect is the **Google Workspace email** (MX, SPF, the Google DKIM key, and any other mail records Squarespace's DNS panel lists).

| | Option | What it needs | Pros | Cons |
|---|---|---|---|---|
| **S** | **Keep DNS at Squarespace (recommended).** `app.` = CNAME to `tkd-dashboard.pages.dev`; `www.` = CNAME to the website's host; the bare name forwarded to `www.` over https | Squarespace's forwarding must serve https for the bare name (**unverified**; Website session is checking) | No existing record is touched, so email cannot be affected. Smallest change, easy to undo. | The bare name cannot point at Cloudflare Pages directly; no Cloudflare rate-limit/WAF rules on the school's own domain. If the bare name's forwarding is http-only, people typing `ustaekwondo.net` may get a browser warning. |
| C | **Move DNS to Cloudflare** (change the name servers at Squarespace Domains) | Copy **every** record from Squarespace's DNS panel into Cloudflare first (Google MX, SPF, DKIM, any DMARC / verification TXT), compare the two lists line by line, only then switch the name servers; send and receive a test email before and after; keep the old record list as the undo | The bare name can serve the website on Cloudflare Pages; WAF rate limiting becomes possible; one place for everything | One missed or mistyped record can stop or spoof the school's email until fixed (name-server changes take minutes to hours to spread). Needs both the Squarespace and the Cloudflare logins. |

What changes because the site is a placeholder: the risk of Option C is now **only the email records** (earlier I also counted a live website). It does not change my pick: keep DNS at Squarespace unless the https forwarding of the bare name fails, then move DNS to Cloudflare with the checklist above. The dashboard's `app.` works the same under both options (under C Cloudflare adds the CNAME itself).

## 3. What happens to links already printed or shared

- **Every pages.dev link keeps working, as it does today.** The app keeps serving on `tkd-dashboard.pages.dev` forever (it is free, and nothing about adding a custom domain removes it). Both addresses are on the allowed list. **The live Shrewsbury Thanksgiving camp link, any printed QR code, any shared flyer: no change in behaviour.** The old and new links open the same camp and the same form.
- **New links the app shows** (Copy link, Download QR code, flyers, Print) switch to the new address on the day of the code push. A family who scans an old code and one who scans a new code both land on the same form and fill the same roster.
- **No redirect from `pages.dev` to the new name.** A redirect would be the one step that can break something (a form open in someone's browser during the switch). The Cloudflare docs say a redirect is available later (a Bulk Redirect) if wanted. I'd skip it: the old address costs nothing and breaks nothing.
- **Staff**: nothing forces them to move (Question 2).

## 4. Order of work (each outward step needs Jeffrey's OK; each has an undo)

| # | Step | Who | Undo |
|---|---|---|---|
| 1 | Jeffrey picks the options (this message). I write the decision into the rulebook (10b row + changelog, block 1.200+) and the status file. | Jeffrey / me | — |
| 2 | I build the code batch: the shared origins helper in the five Functions with tests, one address constant, updated checks, SETUP section, optional noindex line. Preview-checked locally (`npm run dev:preview-mode`), both builds and `run-checks.mjs` pass, then a separate reviewer agent (security review: this touches the form protection). **Committed on this branch, not pushed.** | me | Don't merge it |
| 3 | In Cloudflare Pages: **Set up a custom domain** `app.ustaekwondo.net`. Status shows "Verifying". | Jeffrey (I guide) | Remove domain |
| 4 | In Squarespace DNS: add the one CNAME. Wait for Cloudflare to say "Active" and for its free HTTPS certificate (minutes, up to a few hours). Check `https://app.ustaekwondo.net` loads the dashboard (sign-in page). Family forms on the new name are not usable yet (steps 5–6), which is fine because nobody has the link. | Jeffrey | Delete the CNAME |
| 5 | In Cloudflare Turnstile: **add** the new hostname to the widget (keep the old). | Jeffrey | Remove the entry |
| 6 | In Cloudflare Pages → Environment variables → `PUBLIC_ORIGIN` = both addresses, comma-separated. Applies only to the next deployment. | Jeffrey | Put the old single value back |
| 7 | Main merges the code batch and pushes on Jeffrey's OK (this deploys). | Main / Jeffrey | Revert the push |
| 8 | Live check, both addresses: sign in; a made-up `/camp/abcdefgh`, `/register/…`, `/f/…`, `/star/…`, `/black-belt/…` link on **both** names shows the right "not open" page; the Thanksgiving camp link opens on the old name; then a real test sign-up on the new name (a test camp or form, deleted afterwards) to prove the Origin and Turnstile checks. Cloudflare's Pages build report after the push (a trigger has been missed once before). | me + Jeffrey | — |
| 9 | Supabase Auth: add the new Redirect URL (Site URL later). | Jeffrey | Remove the entry |
| 10 | Optional, when Jeffrey wants: staff devices move to the new address one by one (sign in, set This device's school). Reprint flyers with the new address whenever convenient. | Jeffrey | Keep using the old address |

Steps 3–6 can be done before any code is pushed, in this order, and the live site is unaffected until step 7. If step 7 ever goes before step 6, the old single value still works (the new code accepts one address), so there is no moment when old links break.

## 5. Risks I checked

- **Google email**: only one new `app` record is added; no existing record is changed (MX, SPF, DKIM stay as they are), and no name servers move. There is no live Squarespace site on these names to protect (Coming Soon placeholder). `jeongsustc.com` (HostGator) is a separate domain this work never touches.
- **Wrong order in Pages vs DNS** gives a 522 error on the new name only; the old name is unaffected.
- **Turnstile host mismatch** would block sign-ups on the new name only. Hence the hostname is added before the push and checked in step 8.
- **Forgetting the old address in `PUBLIC_ORIGIN`** would break every printed QR code. The code change has a test for exactly this and step 8 checks it on the live site.
- **Rate limiting** (SETUP §12a step 5 explains why a WAF rate-limit rule can't be used on a `pages.dev` address): it still can't while DNS stays at Squarespace. Moving DNS to Cloudflare is the one way to get it (and to serve the bare name), see §2b for what that costs.
- **Two sites, two sets of device settings** (item E above).

## 6. Questions for Jeffrey (asked together)

**Answered 2026-11-12 (rulebook v1.201):** Q1 = two names, `dashboard.ustaekwondo.net` for staff and `forms.ustaekwondo.net` for families. Still open: Q2–Q6 (Q4 is the DNS decision shared with the website project, §2b).

1. **Name layout:** A `app.ustaekwondo.net` (recommended), B `dashboard.ustaekwondo.net`, or C two names?
2. **Staff devices:** leave them on `tkd-dashboard.pages.dev` for now and move later when convenient (recommended), or move them all on one day?
3. **The old `pages.dev` address:** keep serving it forever, no redirect (recommended), or plan a redirect later?
4. **DNS (the ONE decision shared with the Website project; answer once for both):** keep the school's DNS at Squarespace (my pick: `app.` and `www.` are both CNAMEs there, the bare name forwarded to `www.`), or move it to Cloudflare (needed only if the bare name must serve the website directly, or if you want rate limiting). Details and the checklist for moving: §2b.
5. **Access:** can you sign in to both the school's Squarespace domain settings and the Cloudflare account that owns the Pages project?
6. **Small extras in the same batch:** add the "noindex" header so search engines never list the dashboard (recommended yes), and change the calendar-file label to the new domain (harmless, yes)?
