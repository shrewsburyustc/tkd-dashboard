# CONTRACT-0050 — Camps: sign-ups carry the school they came from (one QR code and link per school)

Status: **approved by Jeffrey 2026-11-11 (picture 29); migration being written.** Migration number 0050 reserved by Main on
2026-11-11. Rulebook row v0.757 (camps block). His answers: (1) keep the live Thanksgiving link for Shrewsbury and add a
Worcester one; (2) the roster follows the school; (3) **no "change school" function** ("we will only give Shrewsbury students
the correct QR and Worcester theirs") — so design item 5 below is NOT built; (4) the receipt names the camper's own school.

Jeffrey, 2026-11-11: "(1) Still show us both schools (2) Have separate QR Codes for worcester and shrewsbury even if they are
together so there are different rosters."

## What it does

A camp for both schools gets **two family links** (two QR codes), one per school. A family that signs up through a school's
link is a camper of that school. The roster, its count cards, the camp list's Campers count and the receipt follow the school:
the Worcester switcher shows the Worcester families, Shrewsbury the Shrewsbury families, Both shows everyone with a small gray
school line. The family form itself is unchanged and names no school (picture 28).

## Design (kept as small as possible: nothing that already works is rewritten)

1. **`camp_signups.school text`** — `'worcester'` or `'shrewsbury'` (check against `public.locations`' codes, as `camp_payments.school`).
   Set for every sign-up; the migration backfills existing rows from the camp's stored `location_code` (production today: one
   camp, 0 sign-ups, so nothing to move). A sign-up's school is for the whole family (all its children). Not private data.
2. **`camps.public_code_2 text null`** (unique, same 8-character pattern as `public_code`). For a camp for both schools it is
   the link for the school that is NOT the camp's stored school; `public_code` (the link already given out) stays and means the
   stored school. A camp for one school has `public_code_2` null. A small trigger on `camps` creates it when `both_schools`
   becomes true (same generator as `public_code`: `testing_new_public_code`, retried until unused) and clears it when it
   becomes false. `public_code` and `id` still never change.
3. **The two public functions only look the code up differently** (so the 290-line sign-up core is NOT replaced):
   - `camp_public_camp(p_code)` finds the camp by either code.
   - `camp_public_signup(...)` (the family form's wrapper) finds the camp and the school from the code, then calls the
     unchanged core with the camp's own `public_code`, after setting a transaction-local `tkd.signup_school` (the same pattern as
     `tkd.actor_label`). A small `BEFORE INSERT` trigger on `camp_signups` copies it into `school` (default: the camp's stored
     school). The attempts log row still records the camp.
   - `camp_staff_signup(...)` (Fill in) takes a new input `p_school text default null` (blank = the camp's stored school;
     the app sends This device's school) and sets the same variable.
   The Cloudflare Function (`functions/_lib/camp.js`) passes the code through as today; no change needed.
4. **Roster:** `camp_roster` view gains a `school` column at the END (so `create or replace view` keeps working). The app
   filters by the switcher. Camper detail's school line comes from the roster row, so `camp_camper_detail` is NOT replaced.
5. ~~Change school~~ — **dropped** (Jeffrey's answer 3). A sign-up's school never changes after it is written.
6. **Receipt:** a both-schools camp's receipt says the camper's school (the app; no database change).

## Compatibility and safety

- **Finance** (0017, 0026, 0047): readers use `camp_payments.school` (the desk that took the money) and join campers and camps
  for names; none reads `camp_signups` columns that change. A new column and a view column at the end change nothing for them.
  The old 16-input `camp_public_signup` and `camp_staff_signup` signatures keep working (new input has a default).
- **Nothing for `anon`.** `camps_registrar` keeps exactly its current grants (the two public functions). The new function:
  `revoke … from public, anon, authenticated, service_role`, `grant execute … to authenticated`, `set search_path = ''`,
  `has_data_access()` first, returns `{status: …}`.
- `camp_public_camp`'s answer is unchanged in shape (no school, no second code: families never see either).
- Rate limit, duplicate checks, prices: untouched (the core is not replaced). A sign-up through either link is the same camp,
  so a possible duplicate is still found across both schools' links (same camp).
- Tests: a `0050_tests.sql`, `0050_fingerprints.sql`, a SETUP section "Migration 0050: Camps sign-ups carry the school",
  `step0050` in `supabase/tests/pglite/run.mjs`, and the preview's fake database (`src/lib/mockCamps.js`) gets the same rules.
- Order: **0050 live before the app that uses it merges** (the new app reads `school`). Jeffrey pastes it after a security
  review and his OK. No `drop` needed (new column, new function, `create or replace` for the rest) — to be confirmed when written.

## App parts (after the migration is live)

Registration link box: two cards (Worcester, Shrewsbury) for a both-schools camp (the shared `RegistrationLinkBox` already
takes several links); roster filter and school line; Campers counts by school; Fill in sends This device's school; Camper
detail "Change school"; receipt line; History word; checks.

## Questions asked with picture 29, and Jeffrey's answers (2026-11-11)

1. Two links per both-schools camp; the live Thanksgiving link (384jztag) keeps working and counts as Shrewsbury. — **Yes.**
2. Roster: switcher Worcester / Shrewsbury shows only that school's families (cards and money too); Both shows all with a
   school line. — **"The roster is fine."**
3. A family that used the wrong QR: staff change the school in Camper detail. — **Not wanted** ("we will only give Shrewsbury
   students the correct QR and Worcester theirs so there shouldnt be a problem").
4. Receipts for a both-schools camp say the camper's own school. — **Yes.**
