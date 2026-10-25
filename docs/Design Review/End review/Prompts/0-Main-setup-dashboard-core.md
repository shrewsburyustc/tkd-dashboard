# Prompt 0 — Main session: set up the dashboard-core branch

**Paste into:** the Main session (main folder). **Only after Jeffrey's OK** for the new branch and its rulebook block. CLAUDE.md says a new branch takes the next free block (1.100+), and to "ask Jeffrey first".

**Why a new branch:** the design review's Main items (M1–M17) are building work. CLAUDE.md keeps feature work out of the Main session: "Only commits, merges and setup. No feature work here." So a worktree session named **dashboard-core** does them:
- step 1, the shared parts;
- then step 2, the dashboard's own screens.

---

Main session — set up the dashboard-core branch for the design review's shared parts. Jeffrey OK'd it (branch `dashboard-core`, rulebook block 1.100–1.199).

1. **Check the folder is clean.** `git status` must show no changed or staged files.
   - The two untracked plugin folders, `.claude/claudex/` and `docs/Prospects/.claude/`, don't block a merge. Leave them alone.
   - Anything else: stop and ask Jeffrey.
2. **Merge design-review.** Run `git merge --ff-only design-review`. (`--ff-only` only moves main forward, and refuses if a merge commit would be needed.)
   - It brings in docs only: the three prompt files under `docs/Design Review/End review/Prompts/`, plus updates to the design review's change list and status file.
   - It should be a fast-forward (main just moves forward to design-review's last commit; no merge commit), because design-review has already merged main's 7c19393.
   - If git refuses (main has moved since), explain to Jeffrey why a merge commit is needed. Only after his OK, run `git merge design-review`.
3. **Edit CLAUDE.md's "Rulebook versions" table.**
   - Add the `dashboard-core` row just above the "any new branch" row.
   - Change that row's "(1.100+)" to "(1.200+)".
   - Both lines keep the table's two-space indent:

   ```
     | `dashboard-core` (the design review's shared parts and the dashboard's own screens; decided 2026-10-25) | 1.100–1.199 |
     | any new branch | the next free block (1.200+) — ask Jeffrey first |
   ```

   If Jeffrey OKs it on a later day, use that date.
4. **Commit on main** with the message "CLAUDE.md: dashboard-core branch, rulebook block 1.100–1.199".
   - Show `git diff --cached --stat` first, and explain the commands.
   - **Don't push.** Pushing main deploys, so it needs Jeffrey's OK for that push.
5. **Hand over.** Tell Jeffrey to start a new worktree session and paste the short starter from `docs/Design Review/End review/Prompts/1-DashboardCore-step1-shared-parts.md`.
   - The new worktree starts from this main, because `.claude/settings.json` uses `baseRef: head`.
