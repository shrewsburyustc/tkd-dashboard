# Domain (ustaekwondo.net) — status

**Branch:** `claude/domain-d6a3ec` (worktree `domain-d6a3ec`) · **Started:** 2026-11-12 · **Rulebook block:** 1.200–1.299 (none used yet)
**Goal (Jeffrey, via Main, 2026-11-12):** the school-owned domain `ustaekwondo.net` on the TKD dashboard (now https://tkd-dashboard.pages.dev). Add, never break: every pages.dev link already printed or shared must keep working, including the live Shrewsbury Thanksgiving camp link.

## Where it stands (2026-11-12)

- **Step 1, the written plan: done.** `docs/Domain/TKD-Domain-Plan.md`. Waiting for Jeffrey's answers to its six questions (§6). Nothing has been changed anywhere: no DNS, no Cloudflare, no Supabase, no code.
- No migration needed (no address is stored in the database; checked 2026-11-12).

## Key facts found

- `ustaekwondo.net` is already the school's **Squarespace** website; its DNS is hosted at Squarespace; school email runs on **Google Workspace**. So the dashboard goes on a **subdomain** (recommended `app.ustaekwondo.net`) with one CNAME added at Squarespace. Name servers are not moved.
- The five public-form Functions accept exactly one address (`PUBLIC_ORIGIN`, plus the Turnstile hostname). The real code work: let `PUBLIC_ORIGIN` be a comma-separated list, with a shared helper and tests.
- Links are built from a fixed constant in `src/lib/testing/eventRules.js` (copies in `camps/campRules.js` and `parts/M5.jsx`).
- Staff devices keep their sign-in, "This device" school and other device settings per web address, so a move to the new address resets those on each device.

## Decisions

None yet (waiting for Jeffrey). Each one goes into the rulebook (10b row + changelog line, version from 1.200, `git merge main` first, CRLF kept) the same turn it is made.

## Next

1. Jeffrey answers the six questions in the plan.
2. Build the code batch on this branch (helper + tests, one constant, checks, SETUP section, optional noindex); both builds + `run-checks.mjs`; security + design review; commit, no push.
3. Jeffrey does the outside steps in the plan's §4 one at a time (Pages custom domain, Squarespace CNAME, Turnstile hostname, `PUBLIC_ORIGIN`), each only after his OK.
4. Main merges and pushes on his OK; live checks on both addresses.
