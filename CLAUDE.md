# TKD Dashboard — instructions for Claude Code

Staff dashboard (Kicksite-style) for Jae H. Jeong's U.S. Taekwondo Center (U.S.T.C.), two schools: Worcester and Shrewsbury, MA. Owner of this work: **Jeffrey** (admin; career-switcher into IT, studying at QCC).

## Read first, every session

1. `docs/Dashboard Docs/TKD-Dashboard-Design-Guidelines.md` — **the rulebook** (source of truth for every screen). Sections 0 (process), 5 (privacy/access), 10b (decisions) and 11 (changelog) matter most. The newest 10b row / changelog line wins over older text.
2. `docs/Dashboard Docs/TKD-Dashboard-Handoff.md` §6 — security rules for every database change (non-negotiable). The rest of that file is older than the rulebook; where they differ, the rulebook wins.
3. The **status file of the project you are working on**:
   - Color Belt testing → `docs/Testing/Color Belt Testing/TKD-ColorBelt-Status.md`
   - Star testing → `docs/Testing/Star Testing/` (its own status file, kept by the Star testing session)

Keep the status file current: when a step finishes or a decision is made, update it in the same turn.

## How Jeffrey wants to work (follow exactly)

- **Nothing is deployed without his explicit OK for that specific item.** A push to `main` auto-deploys to https://tkd-dashboard.pages.dev (Cloudflare Pages), so **never `git push`** unless he says so for that push. Never apply SQL to the live Supabase project without his OK.
- **Plan before building. Show before building:** every new screen or visual change is shown as a mockup at PC, tablet and phone sizes, with an explanation of what it does, before code. Mockups are self-contained HTML files he opens in a browser.
- **One decision at a time.** For any choice with real cost, ask ONE question, show each option visually, describe each option in detail (what it does, pros/cons), give a recommendation. Don't compress options into a summary.
- **Every decision goes into the rulebook:** bump `**Version:** 0.NN (draft) · **Last updated:** date`, add/change the 10b row, add a changelog line. The file uses CRLF line endings — keep them. **Re-read the rulebook right before editing it** — another session edits it too. New 10b rows go just above the `| Approved 2026-10-16 (v0.26) |` row; changelog rows are appended at the end of §11.
- **Split multi-part work across subagents, and have a separate reviewer agent check the work before it's final** (security review for database/auth work; design review against the rulebook + approved mockups, with screenshots at 1280×800, 820×1180 touch, 390×844 touch, 320 wide).
- **Teach while working:** explain what each command/tool is and why, briefly. He knows the basics; define new terms in a line. No Taekwondo/coaching analogies unless he asks for one.
- **Be direct and blunt.** Flag a flaw once, clearly, then go with his call. Ask when something is ambiguous instead of guessing.
- Short status updates; markdown headers/bullets for everyday answers.

## Stack and how to run it

- React 19 + Vite, plain JavaScript, plain CSS (tokens in `src/styles/tokens.css`), `@tabler/icons-react`. Supabase (Postgres 17 + Auth). Cloudflare Pages.
- Every file starts with a header comment (what + why) and uses plain-English comments — written for a learner. Keep that style.
- `Start preview.bat` → local app with a **fake database** (`src/lib/mockClient.js` + `src/lib/mockTesting.js`). Sign in with any email + password `preview`, PIN **`2580`** (the .bat window wrongly says 1234 — known, unfixed). Data lives in the browser's localStorage key `tkd.preview.testing`.
  Browser-console helpers: `__tkdPreview.setRole('staff'|'admin')`, `failNextSave()`, `simulateOtherAdminEdit()`, `clearSchool('Shrewsbury')`, `resetTesting()`, `setTestingDelay(ms)`, `lockNow()`.
- `Start dashboard.bat` → local app against the **real** database (`.env.local`, never commit it).
- `npm run build` / `npm run build:preview-mode` must pass before anything is called done.
- Database tests: `supabase/tests/pglite/` (Postgres-in-Node runner: `cd supabase/tests/pglite && npm install && node run.mjs`) runs migrations + `0003_tests.sql` with Supabase-style stubs. Run it after any migration change.

## Database rules (summary — full list in handoff §6)

- RLS on every table; policies `to authenticated using ((select public.has_data_access()) …)`. `is_admin()` is never a gate on its own.
- Explicit `revoke … from public, anon, authenticated` (and service_role where 0003 does) + only the needed grants. **Nothing to `anon`.**
- Writes go through security-definer functions: `set search_path = ''`, fully qualified names, check `has_data_access()` first, return `{status: …}` jsonb.
- Every change is logged (`public.change_log`). Records are mostly about minors: list views never show DOB, address, medical or billing.
- The secret / service_role key never goes in the app, `.env.local`, git, chat or screenshots.
- Migrations are pasted by Jeffrey into the Supabase **SQL Editor** (the Supabase connector cancels SQL containing the words `delete` or `drop`). Use the connector only for read-only checks. After applying: fingerprint functions with `supabase/tests/0003_fingerprints.sql`, run the security advisor, run the tests file.
- Supabase project `tkd-dashboard`, ref `eozkfbdfxqlcbpewhach` (Free plan). Old Color Belt system: `mfqcchrapunngwwvxzwu` — **read-only**, still in real use until the new section replaces it.

## Parallel sessions (worktrees) — how the two projects stay apart

Color Belt testing and Star testing are built at the same time in separate Claude Code sessions, each in its own **git worktree** (its own folder + branch under `.claude/worktrees/`). Three kinds of session:

| Session | Where | Branch | Does |
|---|---|---|---|
| **Main** | the main folder (no worktree) | `main` | Only commits, merges and setup. **No feature work here.** |
| **Color Belt** | its worktree | `color-belt` | Color Belt work only |
| **Star testing** | its worktree | `star-testing` | Star testing work only |

- **One-time setup (Main session):** (1) create `.claude/settings.json` with exactly this content (it makes new worktrees start from local `main` instead of GitHub's older `main`, and makes every `git push` ask first):
  `{ "worktree": { "baseRef": "head" }, "permissions": { "ask": ["Bash(git push *)", "PowerShell(git push *)"] } }`
  (2) before the first worktree exists, make the checkpoint commit: `git check-ignore -v .env.local supabase/tests/pglite/node_modules .claude/worktrees/x .claude/settings.local.json` (all must be ignored), `git check-ignore -v .claude/settings.json CLAUDE.md .worktreeinclude` (must NOT be ignored), `git add -A`, show Jeffrey `git diff --cached --stat`, then `git commit`. Explain each command. No push.
- **First thing in a new worktree session:** rename the branch Claude Code created (`git branch -m color-belt` or `git branch -m star-testing`). Check `git log -1` shows the latest `main` commit; if it shows an older one, run `git merge --ff-only main` (moves the branch forward, no new commit). Then `npm ci` in the worktree (and in `supabase/tests/pglite` before running DB tests) — `npm ci` installs exactly what `package-lock.json` says without rewriting it, so it causes no merge conflicts. Each worktree has its own `node_modules`.
- **Preview in a worktree:** run `npm run dev:preview-mode` from the worktree folder and give Jeffrey the address. Vite takes the next free port (5173, 5174, …), and each port keeps its own fake data.
- **Commit on your own branch** when a step is reviewed and done. Never edit files in the main folder or another worktree (Claude Code blocks it anyway).
- **Merging:** when a worktree finishes a reviewed step, Jeffrey asks the **Main** session to `git merge <branch>` into `main` (explain the merge and any conflict before resolving it). The main folder must be clean first (`git status` shows nothing). Then each other worktree session commits its own work and runs `git merge main` on its own branch to stay current. Merge small and often.
- **Shared files** — the rulebook, `README.md`, `docs/README.md`, `src/App.jsx`, `src/components/navItems.js`, `src/lib/mockClient.js`, `src/styles/tokens.css`, `src/screens/Testing.jsx`: change only what your project needs and list every shared file you touched in your summary. These are where merge conflicts happen.
- **Rulebook versions:** both branches may add the same version number. When merging into `main`, keep both sets of changes and renumber the branch being merged so its versions follow the highest version already on `main` (10b rows, changelog lines, and any "vX.XX" references in that branch's docs). Before starting new rulebook edits in a worktree, `git merge main` first.
- **Migration numbers:** `0003` belongs to Color Belt phase 1; Star testing takes the next free number.
- **Don't archive a worktree session in the app** until its branch is merged into `main` — archiving removes the worktree folder.
- Never use the app's **Create PR** / push buttons — they push the branch. `.claude/settings.json` makes every `git push` ask first.

## Git

- Commit locally on your own branch when a step is reviewed and done (clear message, explain the commands). `git status` must never list `.env.local`, `node_modules`, `dist`, `dist-preview`.
- Never push, force-push, rebase shared history or delete branches without Jeffrey's OK.
- Remote: `origin` = GitHub `shrewsburyustc/tkd-dashboard` (private, school-owned); Jeffrey pushes as `jberg412-jb`.
- **Branches never leave this PC without Jeffrey's OK.** Pushing `main` deploys; Cloudflare Pages may also build public preview sites for other pushed branches. Until Color Belt checkpoint CP6, its work can't go to the school PC without deploying a broken Testing tab.
- The repo also exists on the school PC (`C:\Users\shrew\projects\tkd-dashboard`); this one is the home PC (`C:\Users\jberg\projects\tkd-dashboard`). Work only moves between them through GitHub (push/pull), so unpushed work exists only here.

## Docs

`docs/` in this repo is the master copy of every design doc (`docs/README.md` explains the layout). The claude.ai project "Taekwondo Management System" holds reading copies of the `.md` files; the OneDrive "TKD Dashboard" folder is an old copy — don't use it.
