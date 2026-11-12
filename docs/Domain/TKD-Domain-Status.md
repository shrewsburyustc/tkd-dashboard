# Domain (ustaekwondo.net) — status

**Branch:** `claude/domain-d6a3ec` (worktree `domain-d6a3ec`) · **Started:** 2026-11-12 · **Rulebook block:** 1.200–1.299 (used: 1.200)
**Goal (Jeffrey, via Main, 2026-11-12):** the school-owned domain `ustaekwondo.net` on the TKD dashboard (now https://tkd-dashboard.pages.dev). Add, never break: every pages.dev link already printed or shared must keep working, including the live Shrewsbury Thanksgiving camp link. **Domain is priority 1** of three parallel sessions (Domain, Board Breaking, Website); all report only to Main.

## Where it stands (2026-11-12)

- **Plan written:** `docs/Domain/TKD-Domain-Plan.md`. Jeffrey's six answers (§6) are still open (relayed by Main).
- **Correction (2026-11-12, from the Website session, verified):** `ustaekwondo.net` and `www.` show Squarespace's "Coming Soon" placeholder, not a live school website (my first plan said live). Only the Google Workspace email records (MX, SPF, DKIM) are at stake; the school's real current site is probably `jeongsustc.com` (HostGator, unconfirmed, out of scope, never touched). Plan §0, risks and Q4 corrected; new §2b is the one DNS decision shared with the Website project (keep DNS at Squarespace with `app.` and `www.` CNAMEs and the bare name forwarded, or move DNS to Cloudflare with every record copied). My recommendations are unchanged. Layout: `app.` = dashboard; `www.` and the bare name = the new website.
- **Batch 1, the shared pieces (built, awaiting review, not pushed):** works with the address NOT switched on, so it can merge to `main` early and changes nothing families or staff see:
  - `functions/_lib/origins.js` + `functions/tests/origins.test.mjs` (+ a "list" test in each of the five Function test files): `PUBLIC_ORIGIN` is a comma-separated list; the five Functions (Color Belt, Camps, Star, Black Belt, Forms) use `matchOrigin` / `hostOf`.
  - `src/lib/publicOrigin.js`: the ONE address constant (value still `https://tkd-dashboard.pages.dev`). `eventRules.js`, `campRules.js` and `parts/M5.jsx` import it; the checks use it.
  - Not touched yet (waits for Jeffrey's answers): `public/_headers` (noindex), `public/_redirects`, `src/forms/ics.js` calendar label, SETUP.md click-by-click section, the new address value itself.
- Rulebook: v1.200 (10b row "The school's own domain, first batch" + changelog line).
- Checks run on this branch: `node --test functions/tests/` 187 pass; `node "docs/Dashboard Core/tools/run-checks.mjs"` 21/21 pass; `npm run build` and `npm run build:preview-mode` pass.
- No migration needed (no address is stored in the database).

## Decisions

- **v1.200** — shared pieces first, address not switched on yet (Jeffrey via Main: Domain is priority 1). Name, staff move, `pages.dev` redirect, DNS home, extras: still open.

## How a NEW public Function adopts the origin helper + the address constant (for Board Breaking; written 2026-11-12)

A "public Function" = a file under `functions/api/…` that families' browsers POST to (signed out). Copy `functions/_lib/bbRegister.js` / `functions/api/black-belt/[code].js` as the model. In the lib file:

1. Import the helper (path is relative to the lib file; from `functions/_lib/` it is `./origins.js`, from `functions/_lib/<folder>/` it is `../origins.js`):
   ```js
   import { hostOf, matchOrigin } from './origins.js';
   ```
2. Step "only our own page may send sign-ups": replace any `Origin !== env.PUBLIC_ORIGIN` comparison with
   ```js
   const origin = matchOrigin(request, env);
   if (origin === null) return { status: 'bad_request' };
   ```
   Do this **before** reading the body, Turnstile or the database (same place as in the other five). Never compare `PUBLIC_ORIGIN` yourself and never split it yourself.
3. Step "human check": ask Turnstile to expect the host of **that same address**:
   ```js
   const expectedHost = hostOf(origin);
   if (expectedHost === null) return { status: 'not_open' }; // PUBLIC_ORIGIN isn't a web address: treat as not set up
   const human = await verifyTurnstile({ fetchImpl: deps.fetchImpl, secret: env.TURNSTILE_SECRET, token: body.turnstile_token, ip, expectedHost, expectedAction: 'your_action' });
   ```
   Use its own Turnstile `action` name (e.g. `board_breaking`) so a token made for another form is refused. Never pass "any host in the list".
4. Keep `PUBLIC_ORIGIN` in the Function's `REQUIRED_SETTINGS` (missing setting = every answer `not_open`). The setting is **shared** with the other five Functions: do not create a second origin setting.
5. Tests (copy the "PUBLIC_ORIGIN as a list" test at the end of `functions/tests/bbRegister.test.mjs`): both listed addresses work, a token naming the other address's host is `verify_failed`, and look-alikes / `http:` / other host / `*` / empty Origin are `bad_request`. Add the test file to `functions/tests/index.js`.

For the family link and QR code in `src/`:

6. Import the one constant and build the link from it; never write the address out:
   ```js
   import { PUBLIC_ORIGIN } from '../publicOrigin.js';   // path relative to your file; src/lib/publicOrigin.js
   export const boardBreakingLink = (code) => `${PUBLIC_ORIGIN}/your-path/${code}`;
   ```
   Same rule as the other sections: fixed address, never the address bar (a preview may use its own address only where Camps' `campLink` does, for the fake database). In checks, build the expected text from `PUBLIC_ORIGIN` too.
7. Public page files (outside the helper, as for the other forms): a `<name>.html` page, its rewrite in `vite.config.js`, a line in `public/_redirects`, and a strict-CSP block in `public/_headers` for `/<name>`, `/<name>.html` and `/<name>/*` (copy the Black Belt block). **Domain owns `_headers` / `_redirects`**: send Main the exact lines and Domain will add them, so two sessions never edit the same lines.
8. Cloudflare needs nothing new for the address: the Turnstile widget and `PUBLIC_ORIGIN` already cover every listed address. A new Function needs only its own settings (kill switch, Hyperdrive binding), as in its own SETUP section.

## How another allowed address is added later (e.g. a future school website)

1. **Cloudflare Pages → project → Settings → Environment variables → `PUBLIC_ORIGIN` (Production):** add the address to the list, comma-separated, exactly as a browser writes it: `https://` + host, no path, no trailing slash, no wildcard (e.g. `https://tkd-dashboard.pages.dev,https://app.ustaekwondo.net,https://www.ustaekwondo.net`). A changed setting only applies from the **next deployment**.
2. **Cloudflare → Turnstile → the widget `TKD family form` → Hostname management:** add the same host (host only, no `https://`). Turnstile's check then expects the host of whichever address the request came from.
3. No code change is needed for steps 1–2, because every public Function uses the shared helper.
4. **What this does and does not cover.** The list allows pages that are **served from** that address to post to the Functions **on the same address** (the normal case: the family form opened at `app.ustaekwondo.net` posts to `app.ustaekwondo.net/api/…`). If a page on a **different host** (the new school website on `www.ustaekwondo.net`) had to post to the dashboard's Function across sites, the browser would also demand CORS answers (`Access-Control-Allow-Origin`, and an `OPTIONS` reply), which the Functions do not give today. Simplest for the website: link families to the form page on the dashboard's address. If a cross-site post is really wanted, it is its own small decision (the Function would answer CORS for exactly the listed addresses and nothing else), to be reviewed for security before it is built.

## Next

1. Independent security review of batch 1, then commit on this branch and send Main the head so it can merge early.
2. Jeffrey answers the six plan questions; then: value of the new address in `publicOrigin.js` (changed only when the new address works), `ics.js` label, noindex, SETUP.md "custom domain" section, `_headers` lines for new public pages.
3. Jeffrey does the outside steps in the plan's §4 one at a time (Pages custom domain, Squarespace CNAME, Turnstile hostname, `PUBLIC_ORIGIN`), each only after his OK.
4. Main merges and pushes on his OK; live checks on both addresses.
