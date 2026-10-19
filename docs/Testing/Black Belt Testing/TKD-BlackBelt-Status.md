# Black Belt testing — status

**Updated:** 2026-10-18 (Black Belt worktree session, branch `black-belt`)
**Rulebook at this update:** v0.205 (Black Belt rows: v0.204–v0.205; numbers 0.176–0.203 belong to other branches)

> Read `CLAUDE.md` (repo root) first. This file says where Black Belt testing stands and what comes next. Keep it current: update it in the same turn a step finishes or a decision is made.

---

## 1. Where things stand

**Design stage.** Jeffrey asked (2026-10-18) for Black Belt testing to be the last testing section, focusing on registration, grading and recording payments, built alongside Finance's Daily report.

- Research is done (inventory files in `Inventory/`).
- **The plan is approved** (v0.204): `TKD-BlackBelt-Plan.md`. Two reviewer agents checked it first (§4).
- **Black Belt is built now**, not queued behind other sections (v0.205; B1 withdrawn). Question B2 (where Black Belt lives) is asked.
- Nothing is built and there is no migration. The branch includes main up to `5ccb355` (Star 0006 live).

## 2. Files

| File | What |
|---|---|
| `TKD-BlackBelt-Plan.md` | The plan: today's system, urgent live issues, timing, improvements, scope, fit, Finance, order of work, questions |
| `Inventory/Old-AppsScript.md` | Every function, rule and problem in the old Apps Script (2,305 lines) |
| `Inventory/Old-Spreadsheet.md` | Every sheet, formula, dropdown and config table in the old workbook (no personal data) |
| `Inventory/Old-RegistrationPage.md` | The live public page, field by field, plus how Color Belt's form compares |

## 3. Next steps

1. Jeffrey checks the urgent live-system items (plan §2): the live Sheet before Oct 24, and the `updateInfo` stopgap.
2. **Question B3 (what a cycle holds): waiting on Jeffrey.** Then B3, B4, and so on, one at a time; each part is built as soon as its design is approved.
3. With Jeffrey's OK, send the Finance session a note (plan §7).
4. Make the printable rules sheet for Master Jeong (part A) in parallel.

## 4. Reviewer check of the plan (2026-10-18)

There were two reviewers:
- **(R1)** accuracy and completeness against the raw Apps Script, workbook and inventories
- **(R2)** process rules, rulebook decisions, handoff §6 security, Finance fit and feasibility

All the items below were applied to the plan.

| From | Finding | Change made |
|---|---|---|
| R1 must | "Send Make-Up Emails reads moved columns" was wrong. The real risk is no confirmation prompt, and mid-cycle it emails everyone as not passing | §2.3 rewritten |
| R1 must | The "first 20 rows" bug was understated: it's 20 rows across all Dans, so 2nd–4th Dan likely get no result. Leftover "PASS!" values with pass mark 0 sit below row 24 | §2.3 |
| R1 must | Timing was misread. Spring 2026 application due Mar 28; Fall registrations started Jun 17 and 17 of 43 came after the deadline. Registration must be live by ~early Feb, not March | §3 |
| R1 must | The waiver says fees are "applied to the next test if not passed" (a credit) | §1, §5, §7, A10, B10 |
| R1 must | Go-live would remove the requirements page, payment schedule and Kukkiwon instructions | §5 "needed at go-live", B8 |
| R1 should | Missing questions: make-ups for "BELOW PASSING" with no D, examiners, admin override, student-record link, older make-ups, old log / Drive signatures at switch-off | A7, A8, A11, B6, B18, §3 |
| R1 should | Three different age cut-off sets (physical, target kick, pull-up); the 4th Dan cr-4 table list; late registration | §1, §4, A1, A4, A9 |
| R1 nice | The export is probably a copy; the Log is intact; doGet/JSONP is public; phone/address editable; Kukkiwon may need sex; receipt contents | §1, §2, A12, B5, B12 |
| R2 must | The status file didn't exist | this file |
| R2 must | "Same shape as Color Belt/Star" was false: the $1,000 cap per row is less than a $2,700 4th Dan fee, and the kinds differ. A returned-check kind is needed | §4, §7.1 |
| R2 must | DOB on the grading tablet (Star's hide is screen-only). Physical is graded at a public arena | §4, B14: database returns the age bracket only |
| R2 should | Star version numbers will change at merge | cited by title (§6) |
| R2 should | A Finance "view" can't enforce v0.195 (staff today only) | §7.2: Finance-owned checked function |
| R2 should | Post-dated check question framed wrong; checks payable to Master Jeong personally; bounced checks vs closed days | §7.3 |
| R2 should | School + cycle name must be stored on each payment row | §7.1 |
| R2 should | When signatures are deleted needs its own question | B7 |
| R2 should | Order of work too serial; rubric editor in B1; build queue; a third form login in the checkpoints | §3, §8 (two tracks, editor moved to B3, B1 build-priority question, CP adapted) |
| R2 nice | Stopgap: delete the `updateInfo` branch rather than adding a password; check for planted values; Drive sharing; copy before restoring | §2.1, §2.2 |
| R2 nice | Parent email for under-18s; never store passport photos; `CLAUDE.md` as a shared file; payments off the grading screens | B5, §5, §10, §4 |

## 5. Decisions made

| Version | Decision |
|---|---|
| v0.204 | **Black Belt testing added** as the last testing section; plan approved. Registration, grading and payments come first, for Spring 2027, alongside Finance. Two design tracks (grading waits for Master Jeong's rules answers). |
| v0.205 | **Built now**, in this session, not queued behind other sections; design-first order still applies; B1 withdrawn. |
