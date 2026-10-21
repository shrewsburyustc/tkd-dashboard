// =====================================================================
// run.mjs - runs the database migrations and SQL tests in PGlite
// ---------------------------------------------------------------------
// WHAT THIS FILE IS
//   A small Node.js script that builds a brand-new, throwaway PostgreSQL 17
//   database in memory (PGlite = the real Postgres engine compiled to run
//   inside Node), sets it up like a Supabase project (stubs.sql), applies
//   our migrations in order, and runs the same test files Jeffrey runs in
//   the Supabase SQL Editor. Nothing here touches Supabase.
//
// WHY
//   Handoff section 7: every migration is tested on a copy first. If a
//   test fails here, production is never touched.
//
// WHAT IT DOES, IN ORDER
//    1. stubs.sql                      (roles, auth schema, pgcrypto)
//    2. 0001_staff_and_pin.sql
//    3. adds two logins + staff rows: an admin and the shared front desk
//       (before 0002, like production, so 0002 marks the desk as shared)
//    4. 0002_server_lock_and_accounts.sql
//    5. "hostile defaults": puts back Supabase's grant-everything default
//       privileges (which 0001 removed), so the 0003 checks prove that
//       0003's OWN revokes lock everything down, not just 0001's defaults
//    6. 0003_testing_classes_ranks.sql, then 0004_staff_accounts.sql
//    7. tests: verify_pin_tests.sql, 0002_tests.sql, 0003_tests.sql,
//       0004_tests.sql (0005 comes later, in step 11)
//    8. a seed (7 classes / 42 ranks per school) - built in, or with
//       --fixture-seed Builder B's generated fixture seed file - then
//       0003_tests.sql again (the tests must pass before AND after seeding)
//    9. 0003 applied a SECOND time (re-run safety), checks nothing was
//       duplicated or lost, runs 0003_tests.sql again, and prints the
//       function fingerprints (0003_fingerprints.sql), which must be the
//       same before and after the re-run
//   9b. 0004 applied a SECOND time: its fingerprints
//       (0004_fingerprints.sql) must be the same before and after, and
//       0004_tests.sql / 0002_tests.sql must pass again
//   10. UPGRADE check, on a second fresh database: steps 1-5, then the
//       EARLIER copy of 0003 (fixtures/0003_before_v062.sql), a seed, then
//       today's 0003 over it. Every row must survive, the fingerprints
//       must equal step 9's, and all three test files must pass.
//       Then 0004 and 0005 on top (their fingerprints must equal a fresh
//       install's, their tests must pass).
//   11. 0005 (Color Belt phase 2) on the main database, AFTER every 0003
//       step above (re-running 0003 after 0005 would reset 0005's read
//       rights on public.locations - see 0005's header):
//         a. apply 0005; 0005_tests.sql (no event yet); 0002 / PIN /
//            0003 / 0004 tests again (0005 must not break them)
//         b. "live" checks as the family form's login: SET ROLE
//            testing_registrar, then every table read, staff function,
//            helper and CREATE must be refused, and the public function
//            must work (the SQL tests prove the same from the catalog,
//            which is all the Supabase SQL Editor can do)
//         c. a TEST EVENT seeded here (contract §3): an open Worcester
//            event with 4 classes, two family registrations made AS
//            testing_registrar, one desk registration with a payment;
//            then 0005_tests.sql and 0003_tests.sql again (before AND
//            after an event exists)
//         d. 0005 applied a SECOND time: nothing changed or lost, the
//            fingerprints (0005_fingerprints.sql) identical, tests pass
//            (0005's and 0003's)
//   12. 0006 (Star testing) on the main database, after step 11
//       (contract CONTRACT-0006.md section 9.3):
//         a. 0006_fingerprints.sql must not contain the words the Supabase
//            connection refuses (so Claude can run it on production)
//         b. the 0003 / 0004 / 0005 fingerprints are taken, 0006 is
//            applied, and they must be IDENTICAL afterwards (0006 changed
//            none of their objects)
//         c. 0006_tests.sql, then every earlier test file again - all must
//            still pass unchanged
//         d. "live" checks as the Star form's login: SET ROLE
//            star_registrar, then every table read, the counter, a write,
//            staff functions, helpers, Color Belt's public functions and
//            CREATE must be refused, and star_public_event must work; and
//            testing_registrar can't run Star's public functions
//         e. a Star TEST event seeded here: two family registrations made
//            AS star_registrar, one desk candidate with grades and a
//            payment; then 0006_tests.sql and 0005_tests.sql again
//         f. 0006 applied a SECOND time: nothing changed or lost, the
//            fingerprints (0006_fingerprints.sql) identical, tests pass
//         g. on the upgrade database: 0006 on top (fingerprints equal a
//            fresh install, tests pass); then one seeded subject renamed
//            and one removed, 0006 applied again: the seed never brings
//            them back or adds a duplicate
//   13. 0010 (Color Belt phase 3: grading results) on the main database,
//       AFTER steps 11 and 12 (it replaces five 0005 functions, so 0005
//       itself is applied again only inside the down-scripts: 15i re-runs
//       0010 (step 2 of the 0014 down-script) and 13g re-runs 0005):
//         a. apply 0010 (the main database already has 0005 and the test
//            event); 0010_tests.sql must pass
//         b. the earlier test files again: 0005_tests.sql, 0003_tests.sql,
//            0004_tests.sql, 0002_tests.sql, verify_pin_tests.sql
//         c. the registrar live checks (11b) again, plus: it can't read
//            testing_results and can't call testing_set_result
//         d. one result + note for the test event's desk student (as
//            postgres, labelled like 11c), so the re-run below has data
//         e. 0010 applied a SECOND time: testing_results and the history
//            count unchanged, the fingerprints (0010_fingerprints.sql)
//            identical; 0010_tests.sql and 0005_tests.sql pass again
//         f. the upgrade database: 0010 on top of its 0005; its 0010
//            fingerprints must equal the main database's (fresh =
//            upgrade); 0010_tests.sql and 0005_tests.sql pass there
//         g. LAST, on the main database (nothing runs on it afterwards),
//            AFTER step 14 (Finance) and step 15i - the real removal order
//            is 0014 down, then 0010 down: the down-script of SETUP
//            section 14e, both steps exactly as written there (re-run
//            0005, then the SQL block). Afterwards the 0005 fingerprints
//            must equal step 11's (= a database that never had 0010),
//            change_log must have one undo_0010 row per removed result,
//            and 0005_tests.sql / 0003_tests.sql pass. It runs only if
//            step 14 and the 0014 down-script (15i) both passed
//            (otherwise a failure "skipped: ..." is recorded).
//   14. 0011 (Finance) after steps 11-13f (contract CONTRACT-0011.md
//       section 2: the tests run before AND after sample payments):
//         a. 0011_fingerprints.sql must not contain the words the Supabase
//            connection refuses (so Claude can run it on production)
//         b. BEFORE sample data, on the upgrade database (it has 0005,
//            0006 and 0010 but no payment at all): FIRST the 0011 that was
//            applied to production on 2026-10-19 (fixtures/
//            0011_as_applied_2026-10-19.sql) with an admin's settings
//            changed, THEN today's 0011 over it - as production will get
//            it. The settings row and the 14 reminder times must be
//            untouched, the old chain function gone; 0011_tests.sql
//         c. the main database: the 0003 / 0004 / 0005 / 0006 / 0010
//            fingerprints are taken, 0011 is applied, and they must be
//            IDENTICAL afterwards (0011 changes none of their objects)
//         d. AFTER sample data: the main database already has a Color Belt
//            and a Star payment from steps 11c / 12e; a few more are added
//            on both sources (a payment yesterday, a refund today), then
//            0011_tests.sql and every earlier test file
//         e. 0011 applied a SECOND time: the 5 finance tables and the
//            history count unchanged, the fingerprints identical, tests
//            pass
//         f. fresh = upgrade: the upgrade database's 0011 fingerprints
//            equal the main database's
//         g. SPEED, on the upgrade database: 0011_tests.sql must finish in
//            under 60 seconds (it timed out on production once); then a
//            big seed (finance_perf_seed.sql: 5 years, both schools, both
//            sources, about 11,000 payment rows with edits, moves, undos,
//            mis-clicks and refunds) and every app function is timed as
//            an unlocked admin: each must answer "ok" in under 2 seconds,
//            and the answers must be right (a busy day has items whose
//            totals add up; the year export has both sources)
//         h. OLD vs NEW: the PRODUCTION copy of 0011 (fixtures/, whose
//            chain builder is the slow but proven one) and today's 0011
//            must give exactly the same answers on the same data. Before /
//            after: the data is loaded with the old 0011, the answers are
//            written down, today's 0011 is applied over it, and the same
//            questions are asked again.
//            * the big database: finance_perf_seed.sql + finance_chain_seed
//              .sql (longer chains: edited twice and moved back, edited then
//              undone, several chains per person, refunds then undone, on
//              both sources). Compared: every 7th day of 5 years AND every
//              day a chain-seed payment touches (items + figures, both
//              schools), and finance_payment_detail for about 50 chain
//              starts of both sources (as an unlocked admin)
//            * a second, small database: the chain seed's LONG chains only
//              (people 17, 19 and 23 of each kind, Worcester, all within
//              the last year - about 27 payment rows). The old builder's
//              time explodes with the number of rows in a range (measured:
//              32 rows 0.9 s, 64 rows 27 s, 96 rows over 10 minutes, a
//              year of the big seed over 20 minutes), so a year can only
//              be compared on a small set. Compared: one 366-day
//              finance_money_rows (every item) + the figures of every day,
//              and the 366-day Worcester export (as an unlocked admin)
//         i. COLLATION, on a fourth database whose text sorting is ICU
//            "en-US" like production's (punctuation is ignored, so e.g.
//            '~end' sorts BEFORE 'color_belt'; PGlite's normal databases
//            sort byte by byte, "C"): all migrations, 0011_tests.sql and the
//            speed + correctness check of g again. A Finance function that
//            relied on text order would give wrong answers there.
//   15. 0014 (Color Belt phase 4: the Private testing tab) on the main
//       database, AFTER step 14 (production order: 0011 is live, then
//       0014 goes on top of it) and before 13g, and ONLY if 13a-13f and
//       step 14 all passed (otherwise a failure "skipped: ..." is
//       recorded; contract CONTRACT-0014.md section 3.3):
//         a. the 0003 / 0004 / 0005 / 0006 / 0010 / 0011 fingerprints are
//            taken, 0014 is applied, and 0014_tests.sql must pass
//         b. 0004, 0006 and 0011 fingerprints IDENTICAL; 0003 identical except the
//            rows of the new testing_* functions and testing_restore_student
//            (0003's file lists every testing_* function); 0005 and 0010
//            differ only in testing_restore_student (and that row really
//            changed)
//         c. every earlier test file again (0011, 0010, 0005, 0006, 0003,
//            0004, 0002, PIN) - all must pass
//         d. the registrar live checks (11b) again, plus: it can't read the
//            3 new tables or the view, and can't call testing_private_add,
//            testing_move_to_private or testing_private_amount_due
//         e. one private testing with a payment and a result (as postgres,
//            labelled like 11c), so the re-run and the down-script have data
//         f. 0014 applied a SECOND time: the 3 tables and the history count
//            unchanged, the fingerprints (0014_fingerprints.sql) identical;
//            0014_tests.sql and 0005_tests.sql pass again
//         g. the upgrade database: 0014 on top of its 0010 + 0011; its 0014
//            fingerprints must equal the main database's (fresh = upgrade);
//            0014_tests.sql, 0010_tests.sql and 0005_tests.sql pass there
//         h. 0014_fingerprints.sql contains neither "delete" nor "drop"
//            (connector-safe); its rows are printed at the end
//         i. the 0014 down-script of SETUP section 0014e, exactly as written
//            there (re-run 0010, then the SQL block). Afterwards the 3
//            tables, the view and every 0014 function are gone, the 0005 /
//            0010 / 0003 / 0011 fingerprints equal 15a's, change_log has one
//            undo_0014 row per removed row, and 0010_tests.sql /
//            0005_tests.sql pass. Then 13g runs.
//   ===== Finance 0018 (step0018; camps' run.mjs has its own steps 15-16) =====
//   0018. (Finance: Color Belt PRIVATE testing payments), after 14 and
//       before 13g, in production order: 0011 -> camps' 0013 + 0017 ->
//       0014 -> 0018. Until the real files are on this branch, exact
//       copies are used: fixtures/0013_camps_at_fb4ec24.sql,
//       fixtures/0017_finance_camps_at_fb4ec24.sql (and camps' tests
//       fixtures/0017_tests_at_fb4ec24.sql) from git fb4ec24, and
//       fixtures/0014_testing_private_as_live.sql (live 0014).
//         a. 0018_fingerprints.sql must not contain the words the Supabase
//            connection refuses
//         b. database 1 (no payments): 0011 + 0014 first - 0018's GUARD
//            must refuse to run (no camps' 0017 yet); then camps' 0013 +
//            0017 (camps' 0017_tests.sql passes), then 0018; the 0003 /
//            0004 / 0005 / 0006 / 0010 fingerprints don't move;
//            0011_tests.sql, camps' 0017_tests.sql and 0018_tests.sql pass;
//            0018 applied a SECOND time changes no row and no fingerprint;
//            0018's camp blocks are byte-identical to 0017's
//         c. database 2 (production order): the big seed + the chain seed +
//            camps' big seed (no private rows yet) with 0017, the answers
//            written down; 0018 applied: every 7th day of 5 years + every
//            chain-seed day (items, and figures without the fingerprint -
//            0018 builds it from the chain id now) and ~60 payment details
//            (Color Belt, Star and camp) must be identical
//         d. then the private seed (finance_private_perf_seed.sql: 2,000
//            private testings, ~400 moves) on database 2: 0018_tests.sql
//            passes there too, and every app function answers in < 2 s
//         e. the ICU database (14i) also gets 0014 + 0018 and runs
//            0018_tests.sql
//         f. days closed UNDER 0011 (a move, a move + undo move, a private
//            payment), then 0018: only real money differences show as
//            "changed after closing"; and an event deleted after a move
//            on a day closed under 0018 doesn't
//   ===== end Finance 0018 =====
//
// THE FIXTURE fixtures/0014_testing_private_as_live.sql
//   An exact copy of git color-belt:supabase/migrations/0014_testing_private.sql
//   (live on production 2026-10-19). Never edit it; once the real file is
//   on this branch, run.mjs uses that instead.
//
// THE FIXTURE fixtures/0011_as_applied_2026-10-19.sql
//   An exact copy of 0011 as it was pasted into production on 2026-10-19
//   (git commit 278539b). Never edit it.
//   16. the new-students files in the LIVE order, on their own database:
//       0001-0006 + 0010 (grading) as live, then 0007 Schedule, 0008 Calendar,
//       0009 Forms, 0012 Prospects (a sign-up saved before 0012 must keep its
//       date), every test file again, re-run safety for 0007/0008/0009/0012,
//       and a minimal database (only 0003, 0004, 0007-0012) whose
//       0007/0008/0009/0012 fingerprints must be the same.
//   step0021. 0021 (Not interested families deleted after 6 months) on its own
//       live-order database: only prospects_purge_old's fingerprint moves,
//       0021_tests + 0015/0012 tests pass, re-runs harmless, minimal = live.
//   17. 0015 (family history) on a database built in the live order
//       (no family rows in change_log): earlier fingerprints unchanged
//       (0003's above all), 0015_tests.sql and every earlier test file
//       pass, 0015 twice more is harmless, a minimal database gives the
//       same fingerprints, and on step 16's database (a sign-up logged in
//       change_log before 0012) 0015 refuses to apply.
//   18. 0019 (school phone) on a database built in the live order (with
//       0011 and 0015): the other migrations' fingerprints don't move -
//       except 0005's line for the locations table, which gains the phone
//       column's read right (and nothing else) - 0019_tests.sql and every
//       earlier test file pass, 0019 twice more is harmless, a 0005
//       re-run takes the phone's read right away and a 0019 re-run brings
//       it back (the numbers kept), and a minimal database gives the same
//       0019 fingerprints.
//   19. 0020 (current_session_id reads only request.jwt.claims, rulebook
//       v0.408), LAST - after step 18 and after 13g, on the main database
//       and on the upgrade database (which still has every migration up
//       to 0014 and 0011):
//         a. 0020_fingerprints.sql and the migration contain neither
//            "delete" nor "drop"; the fingerprint BEFORE 0020 (0001's
//            version) is taken
//         b. the attack, before the fix: AS testing_registrar, a planted
//            legacy request.jwt.claim + a family registration on 11c's test
//            event -> its history rows carry the planted session id (proves
//            the check really reproduces the finding)
//         c. apply 0020; 0020_tests.sql; verify_pin / 0002 / 0003 / 0004 /
//            0005 / 0011 tests again; the body changed, owner and rights not
//         d. the attack again -> the new history rows have session_id NULL
//         e. 0020 applied a SECOND time: history count and fingerprint
//            unchanged; 0020_tests.sql again
//         f. the undo of SETUP section 0020e, exactly as written there: the
//            fingerprint equals (a); PIN + 0002 tests pass; then 0020 again
//            (fingerprint equals c's; 0020_tests.sql passes)
//         g. the upgrade database: 0006_tests.sql BEFORE 0020 (its C9
//            accepts 0001's and 0020's current_session_id), 0020 on top,
//            its fingerprint equals the main database's, then 0020_tests.sql
//            and every earlier test file (0014, 0010, 0006, 0005, 0004,
//            0003, 0002, PIN) pass. (0011_tests.sql runs in c instead: the
//            upgrade database holds 14g's big seed, which it refuses.)
//
// 0003_tests.sql AFTER 0005: its catalog checks (C1c, C3, C5) look only at
//   the columns and functions 0003 itself makes (by name), so 0005's new
//   read rights on public.locations and new testing_* functions don't count
//   against it. It must pass in every step, before AND after 0005.
//
// THE FIXTURE (fixtures/0003_before_v062.sql)
//   An exact copy of 0003 as it was before rulebook v0.62 added "final
//   award None" (git commit 1c5d03c; same git blob id e36492b1). It is
//   kept as a file so the runner works without git. It also predates the
//   belts (rulebook v0.64), so the same check proves the five belt_*
//   columns, their rule and the new rank-function arguments upgrade an
//   older copy cleanly (existing ranks get a plain white belt; the old
//   6- and 7-argument rank functions are removed). Never edit it. When a
//   later change to 0003 needs the same check again, add that version's
//   copy next to it.
//
// HOW TO RUN
//   cd supabase/tests/pglite
//   npm install --no-package-lock     (first time only; installs PGlite here)
//   node run.mjs                      (or: node run.mjs --fixture-seed)
//   Exit code 0 = everything passed, 1 = something failed.
// =====================================================================

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

// Paths are worked out from this file's location, so the script works
// from any current folder.
const here = path.dirname(fileURLToPath(import.meta.url));
const supabaseDir = path.resolve(here, '..', '..');
const read = (...parts) => readFileSync(path.join(supabaseDir, ...parts), 'utf8');

const useFixtureSeed = process.argv.includes('--fixture-seed');

// Fixed ids for the two pretend logins (any uuid works).
const ADMIN_UID = '11111111-1111-4111-8111-111111111111';
const DESK_UID = '22222222-2222-4222-8222-222222222222';

// Collected results, printed as a summary at the end.
const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -  ' + detail : ''}`);
}

// Runs one SQL file / snippet; a failure is recorded instead of crashing,
// and any half-finished transaction is rolled back so the next step starts
// clean. Returns PGlite's result list (one entry per statement) or null.
async function run(db, name, sql) {
  try {
    const out = await db.exec(sql);
    record(name, true);
    return out;
  } catch (error) {
    record(name, false, error.message);
    await db.exec('rollback;').catch(() => {});
    return null;
  }
}

// Runs a test file and checks it printed its "PASSED" row.
// The UID placeholders are replaced exactly as Jeffrey does by hand.
async function runTestFile(db, label, file, passedText) {
  try {
    const sql = read('tests', file)
      .replaceAll('<paste-admin-UID-here>', ADMIN_UID)
      .replaceAll('<paste-desk-UID-here>', DESK_UID)
      .replaceAll('<paste-staff-UID-here>', ADMIN_UID);
    const out = await db.exec(sql);
    const passed = out.some((r) => r.rows.some((row) => Object.values(row).includes(passedText)));
    record(label, passed, passed ? passedText : `no "${passedText}" row in the output`);
  } catch (error) {
    record(label, false, error.message);
    await db.exec('rollback;').catch(() => {});
  }
}

// One number from a query (e.g. a count).
async function one(db, sql) {
  const r = await db.query(sql);
  return Object.values(r.rows[0])[0];
}

// The built-in seed: the same shape as the real one (7 classes, 42 ranks,
// both schools, tagged 'seed', named by tkd.actor_label), written directly
// as "postgres" like the SQL Editor would. Final awards follow the
// contract's expected table (Group D and Teen/Adult: None, v0.62).
function builtInSeedSql({ withNone = true } = {}) {
  const classes = [
    ['Little Tiger', ['LT White', 'LT Yellow', 'LT Green', 'LT Blue', 'LT Red', 'LT Black'], [5000, 6000, 7000], false],
    ['White', ['White'], [6500, 7500, 8500], false],
    ['Group A', ['Yellow', 'Orange', 'Green', 'High Green'], [6500, 7500, 8500], false],
    ['Group B', ['Blue', 'High Blue', 'Purple', 'Red'], [7000, 8000, 9500], true],
    ['Group C', ['High Red', 'Group C rank 2', 'Group C rank 3', 'Group C rank 4'], [7500, 8500, 10000], true],
    ['Group D', ['Bo Dan', 'Group D rank 2', 'Group D rank 3', 'Group D rank 4', 'Group D rank 5'], [8000, 9000, 11000], true],
    ['Teen/Adult', Array.from({ length: 18 }, (_, i) => `Teen/Adult rank ${i + 1}`), [7500, 8500, 10000], true],
  ];
  // class name -> name of the rank (in a later class) it awards
  const awards = { 'Little Tiger': 'Yellow', White: 'Yellow', 'Group A': 'Blue', 'Group B': 'High Red', 'Group C': 'Bo Dan' };
  // classes whose last rank doesn't promote, on purpose (final award "None", rulebook v0.62)
  const noneClasses = ['Group D', 'Teen/Adult'];
  const q = (s) => `'${s.replaceAll("'", "''")}'`;
  let sql = `begin;
select set_config('request.jwt.claims', '', true);
select set_config('tkd.actor_label', 'Initial copy from the old system', true);
select set_config('tkd.action', 'seed', true);
select set_config('tkd.batch_id', gen_random_uuid()::text, true);
`;
  for (const loc of ['worcester', 'shrewsbury']) {
    classes.forEach(([name, ranks, [early, day, priv], sparring], ci) => {
      sql += `insert into public.testing_classes (location_code, name, position) values ('${loc}', ${q(name)}, ${ci});\n`;
      ranks.forEach((rank, ri) => {
        sql += `insert into public.testing_ranks (class_id, location_code, name, position, early_cents, day_cents, private_cents, sparring_gear)
  select c.id, '${loc}', ${q(rank)}, ${ri}, ${early}, ${day}, ${priv}, ${sparring}
    from public.testing_classes c where c.location_code = '${loc}' and c.name = ${q(name)};\n`;
      });
    });
    for (const [cls, rank] of Object.entries(awards)) {
      sql += `update public.testing_classes c set final_award_rank_id = r.id
  from public.testing_ranks r
 where c.location_code = '${loc}' and c.name = ${q(cls)}
   and r.location_code = '${loc}' and r.name = ${q(rank)};\n`;
    }
    for (const cls of withNone ? noneClasses : []) {
      sql += `update public.testing_classes set final_award_none = true where location_code = '${loc}' and name = ${q(cls)};\n`;
    }
  }
  sql += `select set_config('tkd.actor_label', '', true);
select set_config('tkd.action', '', true);
select set_config('tkd.batch_id', '', true);
commit;
`;
  return sql;
}

// Builder B's fixture seed starts with a guard that refuses to run (it is
// fake data, not for production). For this test database only, that one
// guard statement is removed.
function fixtureSeedSql() {
  const file = path.join(supabaseDir, 'manual', '0003s_seed_from_fixture_NOT_FOR_PRODUCTION.sql');
  if (!existsSync(file)) throw new Error(`fixture seed not found: ${file}`);
  const sql = readFileSync(file, 'utf8');
  const guard = /do\s+\$\$\s*begin\s+raise\s+exception\s+'FIXTURE seed[^']*';\s*end\s*\$\$\s*;/i;
  if (!guard.test(sql)) throw new Error('fixture seed: could not find its FIXTURE guard statement');
  return sql.replace(guard, '-- (fixture guard removed by run.mjs for the PGlite test database)');
}

// Fingerprints: name + arguments + md5 of the function body without
// comments and spaces (0003_fingerprints.sql). Returned as text lines.
async function fingerprints(db, file = '0003_fingerprints.sql') {
  const r = await db.query(read('tests', file));
  return r.rows.map((row) => Object.values(row).join('  '));
}

// Steps 1-5: a fresh database with everything that exists before 0003.
// Returns the database, or null if a step failed. "label" prefixes the
// result lines (used by the upgrade check).
async function buildBase(label = '', existing = null) {
  const db = existing ?? new PGlite({ extensions: { pgcrypto } });
  if (!(await run(db, label + 'stubs.sql (Supabase stand-ins)', readFileSync(path.join(here, 'stubs.sql'), 'utf8')))) return null;
  if (!(await run(db, label + 'apply 0001_staff_and_pin.sql', read('migrations', '0001_staff_and_pin.sql')))) return null;
  await run(db, label + 'add test logins + staff rows', `
    insert into auth.users (id, email) values
      ('${ADMIN_UID}', 'admin@example.com'),
      ('${DESK_UID}', 'shrewsburyustc@gmail.com');
    insert into public.staff (id, full_name, email, role) values
      ('${ADMIN_UID}', 'Main Admin', 'admin@example.com', 'admin'),
      ('${DESK_UID}', 'Staff', 'shrewsburyustc@gmail.com', 'staff');`);
  if (!(await run(db, label + 'apply 0002_server_lock_and_accounts.sql', read('migrations', '0002_server_lock_and_accounts.sql')))) return null;
  await run(db, label + 'hostile defaults (re-grant Supabase defaults before 0003)', `
    alter default privileges for role postgres in schema public grant all     on tables    to anon, authenticated;
    alter default privileges for role postgres in schema public grant all     on sequences to anon, authenticated;
    alter default privileges for role postgres in schema public grant execute on functions to anon, authenticated;
    alter default privileges for role postgres grant execute on functions to public;`);
  return db;
}

async function main() {
  console.log('Starting PGlite...');
  const db = await buildBase();
  if (!db) return finish();
  console.log(`Database: ${await one(db, 'select version()')}\n`);

  // 6. apply 0003
  if (!(await run(db, 'apply 0003_testing_classes_ranks.sql', read('migrations', '0003_testing_classes_ranks.sql')))) return finish();
  if (!(await run(db, 'apply 0004_staff_accounts.sql', read('migrations', '0004_staff_accounts.sql')))) return finish();

  // 7. tests on the empty (unseeded) database
  await runTestFile(db, 'verify_pin_tests.sql', 'verify_pin_tests.sql', 'ALL PIN TESTS PASSED');
  await runTestFile(db, '0002_tests.sql', '0002_tests.sql', 'ALL 0002 TESTS PASSED');
  await runTestFile(db, '0003_tests.sql (before seed)', '0003_tests.sql', 'ALL 0003 TESTS PASSED');
  await runTestFile(db, '0004_tests.sql', '0004_tests.sql', 'ALL 0004 TESTS PASSED');

  // 8. seed, then the 0003 tests again
  let seedSql;
  try {
    seedSql = useFixtureSeed ? fixtureSeedSql() : builtInSeedSql();
  } catch (error) {
    record('prepare seed', false, error.message);
    return finish();
  }
  await run(db, useFixtureSeed ? 'apply fixture seed (Builder B)' : 'apply built-in seed', seedSql);
  const classCount = await one(db, 'select count(*)::int from public.testing_classes');
  const rankCount = await one(db, 'select count(*)::int from public.testing_ranks');
  record('seed row counts (14 classes, 84 ranks)', classCount === 14 && rankCount === 84, `${classCount} classes, ${rankCount} ranks`);
  await runTestFile(db, '0003_tests.sql (after seed)', '0003_tests.sql', 'ALL 0003 TESTS PASSED');

  // 9. re-run safety
  const before = await fingerprints(db);
  const snapshotSql = `select md5(coalesce((select string_agg(to_jsonb(c)::text, ',' order by c.id) from public.testing_classes c), '')
                          || coalesce((select string_agg(to_jsonb(r)::text, ',' order by r.id) from public.testing_ranks r), '')
                          || (select string_agg(code || name, ',' order by code) from public.locations)
                          || (select count(*) from public.change_log)::text)`;
  const dataBefore = await one(db, snapshotSql);
  await run(db, 'apply 0003 a SECOND time (re-run safety)', read('migrations', '0003_testing_classes_ranks.sql'));
  const dataAfter = await one(db, snapshotSql);
  record('re-run kept every row unchanged (classes, ranks, locations, change_log)', dataBefore === dataAfter);
  const after = await fingerprints(db);
  record('fingerprints identical before/after re-run', JSON.stringify(before) === JSON.stringify(after), `${after.length} functions`);
  await runTestFile(db, '0003_tests.sql (after re-run)', '0003_tests.sql', 'ALL 0003 TESTS PASSED');
  await runTestFile(db, '0002_tests.sql (after re-run)', '0002_tests.sql', 'ALL 0002 TESTS PASSED');
  await runTestFile(db, 'verify_pin_tests.sql (after re-run)', 'verify_pin_tests.sql', 'ALL PIN TESTS PASSED');

  // 9b. 0004 re-run safety
  const before4 = await fingerprints(db, '0004_fingerprints.sql');
  await run(db, 'apply 0004 a SECOND time (re-run safety)', read('migrations', '0004_staff_accounts.sql'));
  const after4 = await fingerprints(db, '0004_fingerprints.sql');
  record('0004 fingerprints identical before/after re-run', JSON.stringify(before4) === JSON.stringify(after4), `${after4.length} rows`);
  await runTestFile(db, '0004_tests.sql (after re-run)', '0004_tests.sql', 'ALL 0004 TESTS PASSED');
  await runTestFile(db, '0002_tests.sql (after 0004 re-run)', '0002_tests.sql', 'ALL 0002 TESTS PASSED');

  // 10. upgrade check: earlier 0003 + data, then today's 0003 over it
  console.log('\nUpgrade check (earlier 0003 -> today\'s 0003):');
  let upgradeDb = null;
  const up = await buildBase('[upgrade] ');
  if (up) {
    const oldSql = readFileSync(path.join(here, 'fixtures', '0003_before_v062.sql'), 'utf8');
    if (await run(up, '[upgrade] apply EARLIER 0003 (fixtures/0003_before_v062.sql)', oldSql)) {
      await run(up, '[upgrade] seed with the earlier schema', builtInSeedSql({ withNone: false }));
      const upBefore = await one(up, snapshotSql);
      if (await run(up, '[upgrade] apply today\'s 0003 over it', read('migrations', '0003_testing_classes_ranks.sql'))) {
        // upBefore was taken before final_award_none and the five belt_*
        // columns existed, so the new columns are left out here and
        // checked on their own just below
        const keptRows = await one(up, `select md5(coalesce((select string_agg((to_jsonb(c) - 'final_award_none')::text, ',' order by c.id) from public.testing_classes c), '')
                          || coalesce((select string_agg((to_jsonb(r) - array['belt_pattern', 'belt_color', 'belt_color_2', 'belt_end_stripes', 'belt_end_stripe_color'])::text, ',' order by r.id) from public.testing_ranks r), '')
                          || (select string_agg(code || name, ',' order by code) from public.locations)
                          || (select count(*) from public.change_log)::text)`);
        record('[upgrade] every class, rank, location and history row kept', keptRows === upBefore);
        record('[upgrade] existing classes start as Not set (final_award_none false)',
          (await one(up, 'select count(*)::int from public.testing_classes where final_award_none')) === 0);
        record('[upgrade] existing ranks start with a plain white belt (belt columns added)',
          (await one(up, `select count(*)::int from public.testing_ranks
                           where not (belt_pattern = 'solid' and belt_color = 'white' and belt_color_2 is null
                                      and belt_end_stripes = 0 and belt_end_stripe_color = 'yellow')`)) === 0
          && (await one(up, 'select count(*)::int from public.testing_ranks')) === 84);
        const upPrints = await fingerprints(up);
        record('[upgrade] fingerprints identical to a fresh install', JSON.stringify(upPrints) === JSON.stringify(after), `${upPrints.length} functions`);
        await runTestFile(up, '[upgrade] 0003_tests.sql', '0003_tests.sql', 'ALL 0003 TESTS PASSED');
        await runTestFile(up, '[upgrade] 0002_tests.sql', '0002_tests.sql', 'ALL 0002 TESTS PASSED');
        await runTestFile(up, '[upgrade] verify_pin_tests.sql', 'verify_pin_tests.sql', 'ALL PIN TESTS PASSED');
        if (await run(up, '[upgrade] apply 0004 on top', read('migrations', '0004_staff_accounts.sql'))) {
          const up4 = await fingerprints(up, '0004_fingerprints.sql');
          record('[upgrade] 0004 fingerprints identical to a fresh install', JSON.stringify(up4) === JSON.stringify(after4), `${up4.length} rows`);
          await runTestFile(up, '[upgrade] 0004_tests.sql', '0004_tests.sql', 'ALL 0004 TESTS PASSED');
          await runTestFile(up, '[upgrade] 0002_tests.sql (after 0004)', '0002_tests.sql', 'ALL 0002 TESTS PASSED');
          upgradeDb = up;   // 0005 goes on top of it in step 11
        }
      }
    }
  }

  // 11. Color Belt phase 2 (0005)
  console.log('\nMigration 0005 (events, family form, payments):');
  const { prints: after5, upgradeHas0005 } = await step11(db, upgradeDb);

  // 12. Star testing (0006)
  console.log('\nMigration 0006 (Star testing):');
  const after6 = after5 ? await step12(db, upgradeDb) : null;

  // 13. Color Belt phase 3 (0010), only if 0005 is in place (13a-13f;
  // 13g, the 0010 down-script, runs LAST - below).
  let after10 = null;
  let step13 = { prints: null, upgradeHas0010: false, ok: false };
  if (after5) {
    console.log('\nMigration 0010 (grading results):');
    step13 = await runStep13(db, upgradeHas0005 ? upgradeDb : null);
    after10 = step13.prints;
  }

  // 14. Finance (0011), after 0010 and before 13g (the 0010 down-script,
  // which must stay the last thing on the main database). 0011 is live on
  // production, so it comes before 0014 here too.
  let after11 = null;
  let finance14Ok = false;
  if (after6 && after10) {
    console.log('\nMigration 0011 (Finance):');
    const failuresBefore14 = results.filter((r) => !r.ok).length;
    after11 = await step14(db, upgradeHas0005 ? upgradeDb : null);
    finance14Ok = after11 != null && results.filter((r) => !r.ok).length === failuresBefore14;
  } else {
    record('0011 (Finance)', false, 'skipped: 0006 or 0010 could not be applied (see the lines above)');
  }

  // ===== Finance 0018 (step0018, rule v0.304) =====
  // 0018. Finance + Color Belt private testing
  let after18 = null;
  if (after11) {
    console.log('\nMigration 0018 (Finance: Color Belt private testing payments):');
    after18 = await step0018();
  }
  // ===== end Finance 0018 =====

  // 14h + 14i. old vs new chain builder; the ICU-collation database
  if (after11) {
    console.log('\n0011 old vs new chain builder (big seed):');
    await financeOldVsNew();
    console.log('\n0011 on a database that sorts text like production (ICU en-US):');
    await financeIcuCheck();
  }

  // 15. Color Belt phase 4 (0014), on top of 0011, only if 13a-13f and
  // step 14 all passed. It ends with the 0014 down-script (15i).
  let prints0014 = null;   // 0014's fingerprints (step 15); after15 is 0015's (step 17)
  let down15Ok = false;
  if (after10) {
    console.log('\nMigration 0014 (private testing), on top of 0011:');
    if (!step13.ok) {
      record('[0014] step0014', false, 'skipped: step 13 failed');
    } else if (!finance14Ok) {
      record('[0014] step0014', false, 'skipped: step 14 (0011 Finance) failed');
    } else {
      const result15 = await step0014(db, step13.upgradeHas0010 ? upgradeDb : null);
      prints0014 = result15.prints;
      down15Ok = result15.downOk;
    }
  }

  // 13g. the down-script (SETUP section 14e), LAST - the real removal
  // order: 0014 first (15i), then 0010. Only if steps 14 and 15i passed.
  if (after5 && after10) {
    console.log('\nUndo 0010 (SETUP section 14e), last:');
    if (finance14Ok && down15Ok) {
      await downScriptCheck(db, after5);
    } else {
      record('[undo 0010] 13g the 0010 down-script', false,
        !finance14Ok ? 'skipped: step 14 (0011 Finance) failed' : 'skipped: the 0014 down-script failed');
    }
  }

  // 16. the new-students migrations (0007, 0008, 0009, 0012) in the live order
  console.log('\nMigrations 0007-0012 (Schedule, Calendar, Forms, Prospects) in the live order:');
  const newStudents = after5 ? await step16() : null;

  // 17. 0015 (family history) in the live order, and its refusal on step 16's database
  console.log('\nMigration 0015 (family history):');
  const after15 = after5 ? await step17(newStudents?.db ?? null) : null;

  // 18. 0019 (school phone)
  console.log('\nMigration 0019 (school phone):');
  const after19 = after5 ? await step18() : null;

  // step0021: Not interested families deleted after 6 months (its own database)
  console.log('\nMigration 0021 (Not interested families deleted after 6 months):');
  const after21 = after5 ? await step0021() : null;

  // step0020 (named after its migration, not a number other branches use): 0020, LAST
  console.log('\nMigration 0020 (current_session_id reads only request.jwt.claims), last:');
  const after20 = after5 ? await step0020(db, upgradeDb) : null;

  console.log('\nFunction fingerprints (name  arguments  body_md5  security_definer  settings  owner  execute_rights):');
  for (const line of after) console.log('  ' + line);
  console.log('\n0004 fingerprints (kind  item  detail):');
  for (const line of after4) console.log('  ' + line);
  if (after5) {
    console.log('\n0005 fingerprints (kind  item  detail):');
    for (const line of after5) console.log('  ' + line);
  }
  if (after6) {
    console.log('\n0006 fingerprints (kind  item  detail):');
    for (const line of after6) console.log('  ' + line);
  }
  if (after10) {
    console.log('\n0010 fingerprints (kind  item  detail):');
    for (const line of after10) console.log('  ' + line);
  }
  if (newStudents) {
    for (const [n, lines] of [['0007', newStudents.after7], ['0008', newStudents.after8], ['0009', newStudents.after9], ['0012', newStudents.after12]]) {
      console.log(`\n${n} fingerprints (kind  item  detail):`);
      for (const line of lines) console.log('  ' + line);
    }
  }
  if (after15) {
    console.log('\n0015 fingerprints (kind  item  detail):');
    for (const line of after15) console.log('  ' + line);
  }
  if (after19) {
    console.log('\n0019 fingerprints (kind  item  detail):');
    for (const line of after19) console.log('  ' + line);
  }
  if (after21) {
    console.log('\n0021 fingerprints (kind  item  detail):');
    for (const line of after21) console.log('  ' + line);
  }
  if (after11) {
    console.log('\n0011 fingerprints (kind  item  detail):');
    for (const line of after11) console.log('  ' + line);
  }
  if (prints0014) {
    console.log('\n0014 fingerprints (kind  item  detail):');
    for (const line of prints0014) console.log('  ' + line);
  }
  if (after20) {
    console.log('\n0020 fingerprints (kind  item  detail):');
    for (const line of after20) console.log('  ' + line);
  }
  if (after18) {
    console.log('\n0018 fingerprints (kind  item  detail):');
    for (const line of after18) console.log('  ' + line);
  }

  return finish();
}

// A test signature (a tiny PNG as a data URL) and the confirmation wording
// version the family form sends today.
const TEST_SIGNATURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const ACK_VERSION = 'cb-2026-10-17';
const TEST_EVENT_CODE = 'pgxt2345';   // 8 characters from the public-code alphabet

// Everything 0005 stores, as one md5 (used for "re-running changed nothing").
const snapshot5Sql = `select md5(
     coalesce((select string_agg(to_jsonb(x)::text, ',' order by x.code) from public.locations x), '')
  || coalesce((select string_agg(to_jsonb(x)::text, ',' order by x.id) from public.testing_events x), '')
  || coalesce((select string_agg(to_jsonb(x)::text, ',' order by x.id) from public.testing_event_classes x), '')
  || coalesce((select string_agg(to_jsonb(x)::text, ',' order by x.id) from public.testing_event_ranks x), '')
  || coalesce((select string_agg(to_jsonb(x)::text, ',' order by x.id) from public.testing_registrations x), '')
  || coalesce((select string_agg(to_jsonb(x)::text, ',' order by x.id) from public.testing_payments x), '')
  || (select count(*) from public.testing_public_attempts)::text
  || (select count(*) from public.change_log)::text)`;

// 11b. Acting AS the family form's login. Each statement must be refused
// (permission denied), except the last group, which must work.
// "extra" = more [label, sql] pairs that must also be refused (step 13c).
async function registrarLiveChecks(db, extra = []) {
  const refused = [
    ['read testing_events', 'select 1 from public.testing_events limit 1'],
    ['read testing_registrations', 'select 1 from public.testing_registrations limit 1'],
    ['read testing_payments', 'select 1 from public.testing_payments limit 1'],
    ['read testing_roster', 'select 1 from public.testing_roster limit 1'],
    ['read testing_public_attempts', 'select 1 from public.testing_public_attempts limit 1'],
    ['read change_log', 'select 1 from public.change_log limit 1'],
    ['read staff', 'select 1 from public.staff limit 1'],
    ['read locations', 'select 1 from public.locations limit 1'],
    ['read auth.users', 'select 1 from auth.users limit 1'],
    ['use the reference counter', "select nextval('public.testing_registration_ref_seq')"],
    ['write testing_registrations', "update public.testing_registrations set first_name = first_name"],
    ['call a staff function', "select public.testing_mark_paid(gen_random_uuid(), 1)"],
    ['call has_data_access', 'select public.has_data_access()'],
    ['call a helper', 'select public.testing_purge_old_signatures()'],
    ['call the register core directly', `select public.testing_public_register_core('${TEST_EVENT_CODE}', 'k', gen_random_uuid(), 'a', 'b', gen_random_uuid(), 'cash', true, '${TEST_SIGNATURE}', '${ACK_VERSION}')`],
    ['create a table in public', 'create table public.zz_registrar_probe (x integer)'],
    ['create a schema', 'create schema zz_registrar_probe'],
    // (No "SET ROLE authenticated" probe here: PostgreSQL checks SET ROLE
    // against the SIGNED-IN user, which in PGlite is the superuser, so it
    // would always be allowed. 0005_tests.sql T2e proves from the catalog
    // that testing_registrar is a member of no role.)
    ...extra,
  ];
  let allRefused = true;
  const leaks = [];
  for (const [label, sql] of refused) {
    try {
      await db.exec('set role testing_registrar;');
      await db.exec(sql);
      allRefused = false;
      leaks.push(label);
    } catch (error) {
      if (!/permission denied|must be a member|not allowed/i.test(error.message)) {
        allRefused = false;
        leaks.push(`${label} (unexpected error: ${error.message})`);
      }
    } finally {
      await db.exec('reset role;').catch(() => {});
    }
  }
  record('[registrar] every table, staff function, helper and CREATE refused', allRefused, leaks.join('; '));
  try {
    await db.exec('set role testing_registrar;');
    const r = await db.query("select public.testing_public_event('zzzzzzzz') as r");
    record('[registrar] can call testing_public_event', r.rows[0].r?.status === 'not_found', JSON.stringify(r.rows[0].r));
  } catch (error) {
    record('[registrar] can call testing_public_event', false, error.message);
  } finally {
    await db.exec('reset role;').catch(() => {});
  }
}

// 11c. The seeded TEST event: written as the SQL Editor would (postgres,
// labelled), then two families register through the public function AS
// testing_registrar, and the desk adds one paid student.
async function seedTestEvent(db) {
  const ok = await run(db, '[event] seed a test event (Worcester, 4 classes, open)', `
    begin;
    select set_config('request.jwt.claims', '', true);
    select set_config('tkd.actor_label', 'PGlite test event', true);
    select set_config('tkd.action', 'seed', true);
    select set_config('tkd.batch_id', gen_random_uuid()::text, true);
    insert into public.testing_events (location_code, name, testing_date, registration_open, auto_close_on, first_opened_at, public_code, note)
    values ('worcester', 'PGlite November Testing', public.testing_today() + 30, true, public.testing_today() + 23, now(),
            '${TEST_EVENT_CODE}', 'Arrive 15 minutes early.');
    select public.testing_copy_class_into_event(e.id, n.id, time '16:00' + make_interval(hours => n.i),
                                                time '17:00' + make_interval(hours => n.i))
      from public.testing_events e,
           (select c.id, (row_number() over (order by c.position) - 1)::int as i
              from public.testing_classes c
             where c.location_code = 'worcester' and (c.final_award_none or c.final_award_rank_id is not null)
             order by c.position limit 4) as n
     where e.public_code = '${TEST_EVENT_CODE}';
    select set_config('tkd.actor_label', '', true);
    select set_config('tkd.action', '', true);
    select set_config('tkd.batch_id', '', true);
    commit;`);
  if (!ok) return false;
  const ranks = await db.query(`select k.id from public.testing_event_ranks k
      join public.testing_event_classes c on c.id = k.event_class_id
      join public.testing_events e on e.id = c.event_id
     where e.public_code = '${TEST_EVENT_CODE}' order by c.position, k.position limit 2`);
  record('[event] the test event has copied classes and ranks', ranks.rows.length === 2, `${ranks.rows.length} ranks found`);
  if (ranks.rows.length < 2) return false;
  let registered = 0;
  for (const [first, last, rank] of [['Pat', 'Lee', ranks.rows[0].id], ['Kim', 'Ray', ranks.rows[1].id]]) {
    try {
      await db.exec('set role testing_registrar;');
      const r = await db.query(
        'select public.testing_public_register($1, $2, gen_random_uuid(), $3, $4, $5::uuid, $6, true, $7, $8) as r',
        [TEST_EVENT_CODE, 'pglite-client-key', first, last, rank, 'cash', TEST_SIGNATURE, ACK_VERSION]);
      if (r.rows[0].r?.status === 'ok') registered += 1;
    } catch (error) {
      record(`[event] register ${first} ${last} as testing_registrar`, false, error.message);
    } finally {
      await db.exec('reset role;').catch(() => {});
    }
  }
  record('[event] two family registrations made AS testing_registrar', registered === 2, `${registered} ok`);
  await run(db, '[event] a desk registration with a payment', `
    begin;
    select set_config('tkd.actor_label', 'PGlite test event', true);
    insert into public.testing_registrations (event_id, event_rank_id, first_name, last_name, paying_by, stripes_confirmed, source)
    select e.id, '${ranks.rows[0].id}', 'Sam', 'Ortiz', 'card', true, 'staff'
      from public.testing_events e where e.public_code = '${TEST_EVENT_CODE}';
    insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, recorded_by_name)
    select r.id, 'payment', 6500, 'card', public.testing_today(), 'PGlite test event'
      from public.testing_registrations r where r.first_name = 'Sam' and r.last_name = 'Ortiz';
    select set_config('tkd.actor_label', '', true);
    commit;`);
  const counts = await db.query(`select (select count(*)::int from public.testing_registrations) as regs,
      (select count(*)::int from public.testing_payments) as pays,
      (select count(*)::int from public.change_log where coalesce(before::text, '') || coalesce(after::text, '') like '%data:image%') as pictures`);
  record('[event] 3 registrations, 1 payment, no signature in change_log',
    counts.rows[0].regs === 3 && counts.rows[0].pays === 1 && counts.rows[0].pictures === 0, JSON.stringify(counts.rows[0]));
  return true;
}

// Step 11 on the main database (and 0005 on top of the upgrade database).
// Returns { prints: 0005's fingerprints (null if 0005 could not be
// applied), upgradeHas0005: true if 0005 is on the upgrade database too }.
async function step11(db, upgradeDb) {
  let upgradeHas0005 = false;
  if (!(await run(db, 'apply 0005_testing_events.sql', read('migrations', '0005_testing_events.sql')))) return { prints: null, upgradeHas0005 };
  await runTestFile(db, '0005_tests.sql (no event yet)', '0005_tests.sql', 'ALL 0005 TESTS PASSED');
  await runTestFile(db, '0002_tests.sql (after 0005)', '0002_tests.sql', 'ALL 0002 TESTS PASSED');
  await runTestFile(db, 'verify_pin_tests.sql (after 0005)', 'verify_pin_tests.sql', 'ALL PIN TESTS PASSED');
  await runTestFile(db, '0004_tests.sql (after 0005)', '0004_tests.sql', 'ALL 0004 TESTS PASSED');
  await runTestFile(db, '0003_tests.sql (after 0005)', '0003_tests.sql', 'ALL 0003 TESTS PASSED');

  await registrarLiveChecks(db);

  if (await seedTestEvent(db)) {
    await runTestFile(db, '0005_tests.sql (with the test event)', '0005_tests.sql', 'ALL 0005 TESTS PASSED');
    await runTestFile(db, '0003_tests.sql (with the test event)', '0003_tests.sql', 'ALL 0003 TESTS PASSED');
  }

  const before5 = await fingerprints(db, '0005_fingerprints.sql');
  const data5Before = await one(db, snapshot5Sql);
  await run(db, 'apply 0005 a SECOND time (re-run safety)', read('migrations', '0005_testing_events.sql'));
  const data5After = await one(db, snapshot5Sql);
  record('0005 re-run kept every row unchanged (locations, events, copies, registrations, payments, attempts, change_log)', data5Before === data5After);
  const after5 = await fingerprints(db, '0005_fingerprints.sql');
  record('0005 fingerprints identical before/after re-run', JSON.stringify(before5) === JSON.stringify(after5), `${after5.length} rows`);
  await runTestFile(db, '0005_tests.sql (after re-run)', '0005_tests.sql', 'ALL 0005 TESTS PASSED');
  await runTestFile(db, '0003_tests.sql (after 0005 re-run)', '0003_tests.sql', 'ALL 0003 TESTS PASSED');
  await registrarLiveChecks(db);

  if (upgradeDb) {
    if (await run(upgradeDb, '[upgrade] apply 0005 on top', read('migrations', '0005_testing_events.sql'))) {
      upgradeHas0005 = true;
      const up5 = await fingerprints(upgradeDb, '0005_fingerprints.sql');
      record('[upgrade] 0005 fingerprints identical to a fresh install', JSON.stringify(up5) === JSON.stringify(after5), `${up5.length} rows`);
      await runTestFile(upgradeDb, '[upgrade] 0005_tests.sql', '0005_tests.sql', 'ALL 0005 TESTS PASSED');
      await runTestFile(upgradeDb, '[upgrade] 0003_tests.sql (after 0005)', '0003_tests.sql', 'ALL 0003 TESTS PASSED');
    }
  }
  return { prints: after5, upgradeHas0005 };
}

// Everything 0010 stores, as one md5, plus the history count (used for
// "re-running 0010 changed nothing").
const snapshot10Sql = `select md5(
     coalesce((select string_agg(to_jsonb(x)::text, ',' order by x.registration_id) from public.testing_results x), '')
  || (select count(*) from public.change_log)::text)`;

// Step 13 (a-f) on the main database (and 0010 on top of the upgrade
// database). Returns { prints: 0010's fingerprints (null if 0010 could not
// be applied), upgradeHas0010: true if 0010 is on the upgrade database
// too, ok: true if every 13a-13f check passed }. (13g, the 0010
// down-script, is run by main() after steps 14 and 15.)
async function runStep13(db, upgradeDb) {
  const failuresBefore = results.filter((r) => !r.ok).length;
  let upgradeHas0010 = false;
  // a. apply 0010 + its tests
  if (!(await run(db, 'apply 0010_testing_results.sql', read('migrations', '0010_testing_results.sql')))) {
    return { prints: null, upgradeHas0010, ok: false };
  }
  await runTestFile(db, '0010_tests.sql', '0010_tests.sql', 'ALL 0010 TESTS PASSED');

  // b. the earlier TEST files again (never the 0005 SQL itself)
  await runTestFile(db, '0005_tests.sql (after 0010)', '0005_tests.sql', 'ALL 0005 TESTS PASSED');
  await runTestFile(db, '0003_tests.sql (after 0010)', '0003_tests.sql', 'ALL 0003 TESTS PASSED');
  await runTestFile(db, '0004_tests.sql (after 0010)', '0004_tests.sql', 'ALL 0004 TESTS PASSED');
  await runTestFile(db, '0002_tests.sql (after 0010)', '0002_tests.sql', 'ALL 0002 TESTS PASSED');
  await runTestFile(db, 'verify_pin_tests.sql (after 0010)', 'verify_pin_tests.sql', 'ALL PIN TESTS PASSED');

  // c. the family form's login can't reach the results either
  await registrarLiveChecks(db, [
    ['read testing_results', 'select 1 from public.testing_results limit 1'],
    ['call testing_set_result', 'select public.testing_set_result(gen_random_uuid(), null)'],
  ]);

  // d. one result + note for the test event's desk student (11c)
  await run(db, "[0010] a result + note for the test event's desk student", `
    begin;
    select set_config('request.jwt.claims', '', true);
    select set_config('tkd.actor_label', 'PGlite test event', true);
    select set_config('tkd.action', 'seed', true);
    select set_config('tkd.batch_id', gen_random_uuid()::text, true);
    insert into public.testing_results (registration_id, result, note)
    select r.id, 'pass', 'Strong forms.'
      from public.testing_registrations r where r.first_name = 'Sam' and r.last_name = 'Ortiz';
    select set_config('tkd.actor_label', '', true);
    select set_config('tkd.action', '', true);
    select set_config('tkd.batch_id', '', true);
    commit;`);
  const graded = await db.query('select count(*)::int as n, min(updated_by_name) as by_name from public.testing_results');
  record('[0010] the desk student has one result, stamped with the label',
    graded.rows[0].n === 1 && graded.rows[0].by_name === 'PGlite test event', JSON.stringify(graded.rows[0]));

  // e. re-run safety
  const before10 = await fingerprints(db, '0010_fingerprints.sql');
  const data10Before = await one(db, snapshot10Sql);
  await run(db, 'apply 0010 a SECOND time (re-run safety)', read('migrations', '0010_testing_results.sql'));
  const data10After = await one(db, snapshot10Sql);
  record('0010 re-run kept every result row and the history count unchanged', data10Before === data10After);
  const after10 = await fingerprints(db, '0010_fingerprints.sql');
  record('0010 fingerprints identical before/after re-run', JSON.stringify(before10) === JSON.stringify(after10), `${after10.length} rows`);
  await runTestFile(db, '0010_tests.sql (after re-run)', '0010_tests.sql', 'ALL 0010 TESTS PASSED');
  await runTestFile(db, '0005_tests.sql (after 0010 re-run)', '0005_tests.sql', 'ALL 0005 TESTS PASSED');

  // f. fresh = upgrade
  if (upgradeDb) {
    if (await run(upgradeDb, '[upgrade] apply 0010 on top', read('migrations', '0010_testing_results.sql'))) {
      upgradeHas0010 = true;
      const up10 = await fingerprints(upgradeDb, '0010_fingerprints.sql');
      record('[upgrade] 0010 fingerprints identical to the main database', JSON.stringify(up10) === JSON.stringify(after10), `${up10.length} rows`);
      await runTestFile(upgradeDb, '[upgrade] 0010_tests.sql', '0010_tests.sql', 'ALL 0010 TESTS PASSED');
      await runTestFile(upgradeDb, '[upgrade] 0005_tests.sql (after 0010)', '0005_tests.sql', 'ALL 0005 TESTS PASSED');
    }
  } else {
    record('[upgrade] 0010 on top of the upgrade database', false, 'the upgrade database has no 0005 (see the lines above)');
  }

  // g. the down-script (SETUP section 14e) runs from main(), after steps 14 and 15
  return { prints: after10, upgradeHas0010, ok: results.filter((r) => !r.ok).length === failuresBefore };
}

// 13g. SETUP section 14e, step 1 (re-run 0005) then step 2 (the SQL block,
// read from SETUP.md so the tested text is the documented text).
async function downScriptCheck(db, after5) {
  const setup = read('SETUP.md').replace(/\r\n/g, '\n');
  const block = setup.slice(setup.indexOf('### 14e.')).match(/```sql\n([\s\S]*?)```/);
  if (!block) {
    record('[undo 0010] find the down-script in SETUP section 14e', false, 'no sql block after "### 14e."');
    return;
  }
  const results = await one(db, 'select count(*)::int from public.testing_results');
  const logBefore = await one(db, 'select count(*)::int from public.change_log');
  if (!(await run(db, '[undo 0010] step 1: re-run 0005', read('migrations', '0005_testing_events.sql')))) return;
  if (!(await run(db, '[undo 0010] step 2: the SQL block of SETUP 14e', block[1]))) return;
  const gone = await one(db, `select (to_regclass('public.testing_results') is null)
      and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname = 'public'
                         and p.proname in ('testing_set_result', 'testing_set_result_note', 'testing_results_log', 'testing_results_before_write'))`);
  record('[undo 0010] the table and the four 0010-only functions are gone', gone === true);
  const undoRows = await one(db, `select count(*)::int from public.change_log
      where table_name = 'testing_results' and action = 'undo_0010' and op = 'delete' and batch_id is not null`);
  const logAfter = await one(db, 'select count(*)::int from public.change_log');
  record('[undo 0010] one undo_0010 history row per removed result, nothing else lost',
    results > 0 && undoRows === results && logAfter === logBefore + results, `${results} results, ${undoRows} undo rows`);
  const prints5 = await fingerprints(db, '0005_fingerprints.sql');
  record('[undo 0010] 0005 fingerprints equal a database that never had 0010',
    after5 != null && JSON.stringify(prints5) === JSON.stringify(after5), `${prints5.length} rows`);
  await runTestFile(db, '[undo 0010] 0005_tests.sql', '0005_tests.sql', 'ALL 0005 TESTS PASSED');
  await runTestFile(db, '[undo 0010] 0003_tests.sql', '0003_tests.sql', 'ALL 0003 TESTS PASSED');
}

// ---------------------------------------------------------------------
// Step 15: Color Belt private testing (0014) - the Private testing tab,
// applied on top of Finance (0011, step 14)
// ---------------------------------------------------------------------

// Every function 0014 adds (all named testing_*), by name (contract §2.5).
const FNS_0014 = ['testing_private_before_write', 'testing_private_results_before_write',
  'testing_private_payments_guard', 'testing_private_log',
  'testing_private_time_is_valid', 'testing_private_amount_due', 'testing_private_lock',
  'testing_private_lock_payment', 'testing_private_rank_copy',
  'testing_private_add', 'testing_private_update', 'testing_private_change_day', 'testing_private_change_paying_by',
  'testing_private_mark_paid', 'testing_private_undo_payment', 'testing_private_edit_payment', 'testing_private_cancel',
  'testing_private_restore', 'testing_private_delete', 'testing_private_set_result', 'testing_private_set_result_note',
  'testing_move_to_private', 'testing_private_undo_move'];
const PRIVATE_TABLES = ['testing_private', 'testing_private_payments', 'testing_private_results'];

// Everything 0014 stores, plus the history's row count, as one md5 (15f).
const snapshot14Sql = `select md5(
     coalesce((select string_agg(to_jsonb(x)::text, ',' order by x.id) from public.testing_private x), '')
  || coalesce((select string_agg(to_jsonb(x)::text, ',' order by x.id) from public.testing_private_payments x), '')
  || coalesce((select string_agg(to_jsonb(x)::text, ',' order by x.private_id) from public.testing_private_results x), '')
  || (select count(*) from public.change_log)::text)`;

// Compares two fingerprint lists row by row. keyOf gives each row a
// unique key, nameOf the function (or table) the row is about. The rows
// that differ must be EXACTLY the rows whose name is in "expected": no
// other row may change, and every expected row must really change (or
// appear). Returns { ok, detail } for record().
function onlyTheseChanged(before, after, keyOf, nameOf, expected) {
  const b = new Map(before.map((line) => [keyOf(line), line]));
  const a = new Map(after.map((line) => [keyOf(line), line]));
  const changed = [...new Set([...b.keys(), ...a.keys()])].filter((k) => b.get(k) !== a.get(k));
  const changedNames = new Set(changed.map((k) => nameOf(a.get(k) ?? b.get(k))));
  const unexpected = changed.filter((k) => !expected.includes(nameOf(a.get(k) ?? b.get(k))));
  const unchanged = expected.filter((n) => !changedNames.has(n));
  return {
    ok: unexpected.length === 0 && unchanged.length === 0,
    detail: `${changed.length} rows differ`
      + (unexpected.length ? `; unexpected: ${unexpected.join(' | ')}` : '')
      + (unchanged.length ? `; expected to change but did not: ${unchanged.join(', ')}` : ''),
  };
}
// 0003_fingerprints.sql rows: "proname  arguments  body_md5 ...".
const key3 = (line) => line.split('  ').slice(0, 2).join('(');
const name3 = (line) => line.split('  ')[0];
// 0005 / 0010 rows: "kind  item  detail"; a function's item is
// "name(arguments)", any other row's item its name.
const keyKind = (line) => line.split('  ').slice(0, 2).join(' ');
const nameKind = (line) => {
  const [kind, item] = line.split('  ');
  return kind === 'function' ? item.split('(')[0] : `${kind} ${item}`;
};

// Step 15 on the main database (and 0014 on top of the upgrade database).
// Returns { prints: 0014's fingerprints (null if 0014 could not be
// applied), downOk: true if the 0014 down-script (15i) passed every check
// - main() runs 13g only then }.
async function step0014(db, upgradeDb) {
  // h (first). the fingerprints file must stay runnable through the connector
  const printsText = read('tests', '0014_fingerprints.sql');
  record('0014_fingerprints.sql contains neither "delete" nor "drop" (connector-safe)', !/delete|drop/i.test(printsText));

  // a. the earlier fingerprints, apply 0014, its tests
  const p3 = await fingerprints(db, '0003_fingerprints.sql');
  const p4 = await fingerprints(db, '0004_fingerprints.sql');
  const p5 = await fingerprints(db, '0005_fingerprints.sql');
  const p6 = await fingerprints(db, '0006_fingerprints.sql');
  const p10 = await fingerprints(db, '0010_fingerprints.sql');
  const p11 = await fingerprints(db, '0011_fingerprints.sql');
  if (!(await run(db, 'apply 0014_testing_private.sql', read('migrations', '0014_testing_private.sql')))) {
    return { prints: null, downOk: false };
  }
  await runTestFile(db, '0014_tests.sql', '0014_tests.sql', 'ALL 0014 TESTS PASSED');

  // b. what 0014 may (and must) change in the earlier fingerprints
  record('[0014] 0004 fingerprints identical before/after 0014',
    JSON.stringify(p4) === JSON.stringify(await fingerprints(db, '0004_fingerprints.sql')));
  record('[0014] 0006 fingerprints identical before/after 0014',
    JSON.stringify(p6) === JSON.stringify(await fingerprints(db, '0006_fingerprints.sql')));
  record('[0014] 0011 (Finance) fingerprints identical before/after 0014',
    JSON.stringify(p11) === JSON.stringify(await fingerprints(db, '0011_fingerprints.sql')), `${p11.length} rows`);
  const c3 = onlyTheseChanged(p3, await fingerprints(db, '0003_fingerprints.sql'), key3, name3,
    [...FNS_0014, 'testing_restore_student']);
  record('[0014] 0003 fingerprints differ only in the new testing_* functions and testing_restore_student', c3.ok, c3.detail);
  const c5 = onlyTheseChanged(p5, await fingerprints(db, '0005_fingerprints.sql'), keyKind, nameKind, ['testing_restore_student']);
  record('[0014] 0005 fingerprints differ only in testing_restore_student', c5.ok, c5.detail);
  const c10 = onlyTheseChanged(p10, await fingerprints(db, '0010_fingerprints.sql'), keyKind, nameKind, ['testing_restore_student']);
  record('[0014] 0010 fingerprints differ only in testing_restore_student', c10.ok, c10.detail);

  // c. every earlier test file again (Finance's too)
  await runTestFile(db, '0011_tests.sql (after 0014)', '0011_tests.sql', 'ALL 0011 TESTS PASSED');
  await runTestFile(db, '0010_tests.sql (after 0014)', '0010_tests.sql', 'ALL 0010 TESTS PASSED');
  await runTestFile(db, '0005_tests.sql (after 0014)', '0005_tests.sql', 'ALL 0005 TESTS PASSED');
  await runTestFile(db, '0006_tests.sql (after 0014)', '0006_tests.sql', 'ALL 0006 TESTS PASSED');
  await runTestFile(db, '0003_tests.sql (after 0014)', '0003_tests.sql', 'ALL 0003 TESTS PASSED');
  await runTestFile(db, '0004_tests.sql (after 0014)', '0004_tests.sql', 'ALL 0004 TESTS PASSED');
  await runTestFile(db, '0002_tests.sql (after 0014)', '0002_tests.sql', 'ALL 0002 TESTS PASSED');
  await runTestFile(db, 'verify_pin_tests.sql (after 0014)', 'verify_pin_tests.sql', 'ALL PIN TESTS PASSED');

  // d. the family form's login can't reach anything of 0014
  await registrarLiveChecks(db, [
    ['read testing_results', 'select 1 from public.testing_results limit 1'],
    ['call testing_set_result', 'select public.testing_set_result(gen_random_uuid(), null)'],
    ...PRIVATE_TABLES.map((t) => [`read ${t}`, `select 1 from public.${t} limit 1`]),
    ['read testing_private_list', 'select 1 from public.testing_private_list limit 1'],
    ['call testing_private_add', "select public.testing_private_add('worcester', 'a', 'b', gen_random_uuid(), true, 'cash', current_date, time '16:00')"],
    ['call testing_move_to_private', "select public.testing_move_to_private(gen_random_uuid(), 1, current_date, time '16:00')"],
    ['call testing_private_amount_due', 'select public.testing_private_amount_due(gen_random_uuid())'],
  ]);

  // e. one private testing with a payment and a result (as postgres,
  //    labelled like 11c), so the re-run and the down-script have data
  await run(db, '[0014] a seeded private testing with a payment and a result', `
    begin;
    select set_config('request.jwt.claims', '', true);
    select set_config('tkd.actor_label', 'PGlite test event', true);
    select set_config('tkd.action', 'seed', true);
    select set_config('tkd.batch_id', gen_random_uuid()::text, true);
    insert into public.testing_private
      (location_code, first_name, last_name, class_id, class_name, rank_id, rank_name,
       belt_pattern, belt_color, belt_color_2, belt_end_stripes, belt_end_stripe_color, to_kind,
       private_cents, paying_by, stripes_confirmed, private_date, private_time)
    select 'worcester', 'Pia', 'Private', c.id, c.name, r.id, r.name,
           r.belt_pattern, r.belt_color, r.belt_color_2, r.belt_end_stripes, r.belt_end_stripe_color, 'none',
           r.private_cents, 'cash', true, public.testing_today(), time '16:00'
      from public.testing_ranks r join public.testing_classes c on c.id = r.class_id
     where r.location_code = 'worcester'
     order by c.position, r.position
     limit 1;
    insert into public.testing_private_payments (private_id, kind, amount_cents, method, paid_on, recorded_by_name)
    select p.id, 'payment', 5000, 'cash', public.testing_today(), 'PGlite test event'
      from public.testing_private p where p.first_name = 'Pia' and p.last_name = 'Private';
    insert into public.testing_private_results (private_id, result, note)
    select p.id, 'pass', 'Strong forms.'
      from public.testing_private p where p.first_name = 'Pia' and p.last_name = 'Private';
    select set_config('tkd.actor_label', '', true);
    select set_config('tkd.action', '', true);
    select set_config('tkd.batch_id', '', true);
    commit;`);
  const seeded = (await db.query(`select (select count(*)::int from public.testing_private) as privates,
      (select count(*)::int from public.testing_private_payments) as payments,
      (select count(*)::int from public.testing_private_results) as results`)).rows[0];
  record('[0014] one private testing, one payment, one result', seeded.privates === 1 && seeded.payments === 1 && seeded.results === 1,
    JSON.stringify(seeded));

  // f. re-run safety
  const before14 = await fingerprints(db, '0014_fingerprints.sql');
  const data14Before = await one(db, snapshot14Sql);
  await run(db, 'apply 0014 a SECOND time (re-run safety)', read('migrations', '0014_testing_private.sql'));
  const data14After = await one(db, snapshot14Sql);
  record('0014 re-run kept every row (3 tables) and the history count unchanged', data14Before === data14After);
  const after14 = await fingerprints(db, '0014_fingerprints.sql');
  record('0014 fingerprints identical before/after re-run', JSON.stringify(before14) === JSON.stringify(after14), `${after14.length} rows`);
  await runTestFile(db, '0014_tests.sql (after re-run)', '0014_tests.sql', 'ALL 0014 TESTS PASSED');
  await runTestFile(db, '0005_tests.sql (after 0014 re-run)', '0005_tests.sql', 'ALL 0005 TESTS PASSED');

  // g. fresh = upgrade
  if (upgradeDb) {
    if (await run(upgradeDb, '[upgrade] apply 0014 on top', read('migrations', '0014_testing_private.sql'))) {
      const up14 = await fingerprints(upgradeDb, '0014_fingerprints.sql');
      record('[upgrade] 0014 fingerprints identical to the main database', JSON.stringify(up14) === JSON.stringify(after14), `${up14.length} rows`);
      await runTestFile(upgradeDb, '[upgrade] 0014_tests.sql', '0014_tests.sql', 'ALL 0014 TESTS PASSED');
      await runTestFile(upgradeDb, '[upgrade] 0010_tests.sql (after 0014)', '0010_tests.sql', 'ALL 0010 TESTS PASSED');
      await runTestFile(upgradeDb, '[upgrade] 0005_tests.sql (after 0014)', '0005_tests.sql', 'ALL 0005 TESTS PASSED');
    }
  } else {
    record('[upgrade] 0014 on top of the upgrade database', false, 'the upgrade database has no 0010 (see the lines above)');
  }

  // i. the 0014 down-script (SETUP section 0014e)
  const downOk = await downScript15Check(db, { p3, p5, p10, p11 });
  return { prints: after14, downOk };
}

// 15i. SETUP section 0014e: step 2 (re-run 0010), then step 3 (the SQL
// block, read from SETUP.md so the tested text is the documented text).
// (Step 1, putting the app back, has nothing to test here.) Returns true
// only if every step and check passed.
async function downScript15Check(db, { p3, p5, p10, p11 }) {
  const failuresBefore = results.filter((r) => !r.ok).length;
  const setup = read('SETUP.md').replace(/\r\n/g, '\n');
  const start = setup.indexOf('### 0014e.');
  const block = start < 0 ? null : setup.slice(start).match(/```sql\n([\s\S]*?)```/);
  if (!block) {
    record('[undo 0014] find the down-script in SETUP section 0014e', false, 'no sql block after "### 0014e."');
    return false;
  }
  const counts = (await db.query(`select (select count(*)::int from public.testing_private) as privates,
      (select count(*)::int from public.testing_private_payments) as payments,
      (select count(*)::int from public.testing_private_results) as results`)).rows[0];
  const logBefore = await one(db, 'select count(*)::int from public.change_log');
  if (!(await run(db, '[undo 0014] step 2: re-run 0010', read('migrations', '0010_testing_results.sql')))) return false;
  if (!(await run(db, '[undo 0014] step 3: the SQL block of SETUP 0014e', block[1]))) return false;
  const gone = await one(db, `select ${PRIVATE_TABLES.map((t) => `to_regclass('public.${t}') is null`).join(' and ')}
      and to_regclass('public.testing_private_list') is null
      and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname = 'public'
                         and p.proname in (${FNS_0014.map((n) => `'${n}'`).join(', ')}))`);
  record('[undo 0014] the 3 tables, the view and every 0014 function are gone', gone === true);
  const undo = (await db.query(`select
      (select count(*)::int from public.change_log where action = 'undo_0014' and op = 'delete' and batch_id is not null
          and table_name = 'testing_private') as privates,
      (select count(*)::int from public.change_log where action = 'undo_0014' and op = 'delete' and batch_id is not null
          and table_name = 'testing_private_payments') as payments,
      (select count(*)::int from public.change_log where action = 'undo_0014' and op = 'delete' and batch_id is not null
          and table_name = 'testing_private_results') as results`)).rows[0];
  const logAfter = await one(db, 'select count(*)::int from public.change_log');
  const removed = counts.privates + counts.payments + counts.results;
  record('[undo 0014] one undo_0014 history row per removed private testing (and its payments and result), nothing else lost',
    counts.privates > 0 && JSON.stringify(undo) === JSON.stringify(counts) && logAfter === logBefore + removed,
    `removed ${JSON.stringify(counts)}, undo rows ${JSON.stringify(undo)}`);
  for (const [file, before, label] of [['0010_fingerprints.sql', p10, '0010'], ['0005_fingerprints.sql', p5, '0005'],
    ['0003_fingerprints.sql', p3, '0003'], ['0011_fingerprints.sql', p11, '0011']]) {
    const now = await fingerprints(db, file);
    record(`[undo 0014] ${label} fingerprints equal the ones taken before 0014 (15a)`,
      JSON.stringify(now) === JSON.stringify(before), `${now.length} rows`);
  }
  await runTestFile(db, '[undo 0014] 0010_tests.sql', '0010_tests.sql', 'ALL 0010 TESTS PASSED');
  await runTestFile(db, '[undo 0014] 0005_tests.sql', '0005_tests.sql', 'ALL 0005 TESTS PASSED');
  return results.filter((r) => !r.ok).length === failuresBefore;
}

// ---------------------------------------------------------------------
// Step 12: Star testing (0006)
// ---------------------------------------------------------------------

// The Star form's confirmation wording version (contract OPEN-3).
const STAR_ACK_VERSION = 'st-2026-10-18';

// The 0006 tables (16) - used for the "re-running changed nothing" md5.
const STAR_TABLES = [
  'star_dan_settings', 'star_categories', 'star_grade_values', 'star_assistant_table', 'star_events',
  'star_event_dans', 'star_event_categories', 'star_event_grades', 'star_event_assistant', 'star_candidates',
  'star_candidate_signatures', 'star_makeup_subjects', 'star_payments', 'star_grades', 'star_result_emails',
  'star_downloads'];

// Everything 0006 stores, plus the history's row count, as one md5.
const snapshot6Sql = `select md5(${STAR_TABLES.map((t) =>
  `coalesce((select string_agg(to_jsonb(x)::text, ',' order by x.id) from public.${t} x), '')`).join(' || ')}
  || (select count(*) from public.change_log)::text)`;

// 12d. Acting AS the Star family form's login. Each statement must be
// refused (permission denied), then star_public_event must work. Last,
// Color Belt's login can't run Star's public functions.
async function starRegistrarLiveChecks(db) {
  const refused = [
    ...STAR_TABLES.map((t) => [`read ${t}`, `select 1 from public.${t} limit 1`]),
    ['read star_roster', 'select 1 from public.star_roster limit 1'],
    ['read testing_public_attempts', 'select 1 from public.testing_public_attempts limit 1'],
    ['read change_log', 'select 1 from public.change_log limit 1'],
    ['read staff', 'select 1 from public.staff limit 1'],
    ['read locations', 'select 1 from public.locations limit 1'],
    ['read auth.users', 'select 1 from auth.users limit 1'],
    ['use the reference counter', "select nextval('public.star_candidate_ref_seq')"],
    ['write star_candidates', 'update public.star_candidates set first_name = first_name'],
    ['write star_payments', "insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, recorded_by_name) values (gen_random_uuid(), 'payment', 1, 'cash', current_date, 'x')"],
    ['call a staff function', 'select public.star_record_payment(gen_random_uuid(), 1, \'cash\', 100, current_date)'],
    ['call a staff read function', 'select public.star_candidate_detail(gen_random_uuid())'],
    ['call has_data_access', 'select public.has_data_access()'],
    ['call a helper', 'select public.star_purge_old_signatures()'],
    ['call the register core directly', `select public.star_public_register_core('abcdefgh', 'k', gen_random_uuid(), 'a', 'b', current_date - 4000, 'a@b.co', 1, 0, 'cash', true, '${TEST_SIGNATURE}', '${STAR_ACK_VERSION}')`],
    ['call testing_public_event', "select public.testing_public_event('abcdefgh')"],
    ['call testing_public_register', `select public.testing_public_register('abcdefgh', 'k', gen_random_uuid(), 'a', 'b', gen_random_uuid(), 'cash', true, '${TEST_SIGNATURE}', '${ACK_VERSION}')`],
    ['create a table in public', 'create table public.zz_star_registrar_probe (x integer)'],
    ['create a schema', 'create schema zz_star_registrar_probe'],
  ];
  let allRefused = true;
  const leaks = [];
  for (const [label, sql] of refused) {
    try {
      await db.exec('set role star_registrar;');
      await db.exec(sql);
      allRefused = false;
      leaks.push(label);
    } catch (error) {
      if (!/permission denied|must be a member|not allowed/i.test(error.message)) {
        allRefused = false;
        leaks.push(`${label} (unexpected error: ${error.message})`);
      }
    } finally {
      await db.exec('reset role;').catch(() => {});
    }
  }
  record('[star registrar] every table, the counter, writes, staff functions, helpers, Color Belt\'s form and CREATE refused',
    allRefused, leaks.join('; '));
  try {
    await db.exec('set role star_registrar;');
    const r = await db.query("select public.star_public_event('zzzzzzzz') as r");
    record('[star registrar] can call star_public_event', r.rows[0].r?.status === 'not_found', JSON.stringify(r.rows[0].r));
  } catch (error) {
    record('[star registrar] can call star_public_event', false, error.message);
  } finally {
    await db.exec('reset role;').catch(() => {});
  }
  const crossed = [];
  for (const sql of ["select public.star_public_event('zzzzzzzz')",
    `select public.star_public_register('zzzzzzzz', 'k', gen_random_uuid(), 'a', 'b', current_date - 4000, 'a@b.co', 1, 0, 'cash', true, '${TEST_SIGNATURE}', '${STAR_ACK_VERSION}')`]) {
    try {
      await db.exec('set role testing_registrar;');
      await db.exec(sql);
      crossed.push(sql.slice(7, 40));
    } catch (error) {
      if (!/permission denied/i.test(error.message)) crossed.push(`${sql.slice(7, 40)} (${error.message})`);
    } finally {
      await db.exec('reset role;').catch(() => {});
    }
  }
  record('[star registrar] testing_registrar can\'t run Star\'s public functions', crossed.length === 0, crossed.join('; '));
}

// 12e. The seeded Star TEST event: written as the SQL Editor would
// (postgres, labelled; the copy taken with the migration's own helper),
// then two families register AS star_registrar, and one desk candidate
// gets grades and a payment.
async function seedStarTestEvent(db) {
  const ok = await run(db, '[star event] seed a Star test event (both schools, open)', `
    begin;
    select set_config('request.jwt.claims', '', true);
    select set_config('tkd.actor_label', 'PGlite test event', true);
    select set_config('tkd.action', 'pglite_seed', true);
    select set_config('tkd.batch_id', gen_random_uuid()::text, true);
    insert into public.star_events (name, testing_date, start_time, where_code, registration_open, first_opened_at,
                                    public_code_worcester, public_code_shrewsbury, note, created_by_name, updated_by_name)
    values ('PGlite Star Testing', public.testing_today() + 30, '10:00', 'worcester', true, now(),
            '${STAR_CODE_W}', '${STAR_CODE_S}', 'Arrive 15 minutes early.', '', '');
    select public.star_copy_template_into_event(e.id) from public.star_events e where e.public_code_worcester = '${STAR_CODE_W}';
    select set_config('tkd.actor_label', '', true);
    select set_config('tkd.action', '', true);
    select set_config('tkd.batch_id', '', true);
    commit;`);
  if (!ok) return false;
  let registered = 0;
  for (const [code, first, last] of [[STAR_CODE_W, 'Pat', 'Lee'], [STAR_CODE_S, 'Kim', 'Ray']]) {
    try {
      await db.exec('set role star_registrar;');
      const r = await db.query(
        `select public.star_public_register($1, $2, gen_random_uuid(), $3, $4, current_date - 4000, $5, 1, 0, 'cash', true, $6, $7) as r`,
        [code, 'pglite-star-client-key', first, last, `${first.toLowerCase()}@example.com`, TEST_SIGNATURE, STAR_ACK_VERSION]);
      if (r.rows[0].r?.status === 'ok') registered += 1;
      else record(`[star event] register ${first} ${last} as star_registrar`, false, JSON.stringify(r.rows[0].r));
    } catch (error) {
      record(`[star event] register ${first} ${last} as star_registrar`, false, error.message);
    } finally {
      await db.exec('reset role;').catch(() => {});
    }
  }
  record('[star event] two family registrations made AS star_registrar', registered === 2, `${registered} ok`);
  await run(db, '[star event] a desk candidate with grades and a payment', `
    begin;
    select set_config('tkd.actor_label', 'PGlite test event', true);
    select set_config('tkd.action', 'pglite_seed', true);
    insert into public.star_candidates (event_id, first_name, last_name, date_of_birth, email_for_results, location_code,
                                        dan, stars_from, paying_by, source, assistant_classes, created_by_name, updated_by_name)
    select e.id, 'Sam', 'Ortiz', null, 'sam@example.com', 'shrewsbury', 1, 0, 'card', 'desk', 18, '', ''
      from public.star_events e where e.public_code_worcester = '${STAR_CODE_W}';
    insert into public.star_grades (candidate_id, event_category_id, grade, created_by_name, updated_by_name)
    select c.id, k.id, 'A', '', ''
      from public.star_candidates c
      join public.star_event_categories k on k.event_id = c.event_id and k.dan = c.dan and not k.from_class_count
     where c.first_name = 'Sam' and c.last_name = 'Ortiz';
    insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, recorded_by_name)
    select c.id, 'payment', 14000, 'card', public.testing_today(), 'PGlite test event'
      from public.star_candidates c where c.first_name = 'Sam' and c.last_name = 'Ortiz';
    select set_config('tkd.actor_label', '', true);
    select set_config('tkd.action', '', true);
    commit;`);
  const counts = await db.query(`select (select count(*)::int from public.star_candidates) as candidates,
      (select count(*)::int from public.star_candidate_signatures where signature is not null) as signatures,
      (select count(*)::int from public.star_grades) as grades,
      (select count(*)::int from public.star_payments) as payments,
      (select count(*)::int from public.change_log where coalesce(before::text, '') || coalesce(after::text, '') like '%data:image%') as pictures`);
  const c = counts.rows[0];
  record('[star event] 3 candidates, 2 signatures, 10 grades, 1 payment, no picture in change_log',
    c.candidates === 3 && c.signatures === 2 && c.grades === 10 && c.payments === 1 && c.pictures === 0, JSON.stringify(c));
  return true;
}

// The 0003 + 0004 + 0005 fingerprints together (12b: 0006 must not change them).
async function earlierFingerprints(db) {
  return [
    ...(await fingerprints(db, '0003_fingerprints.sql')),
    ...(await fingerprints(db, '0004_fingerprints.sql')),
    ...(await fingerprints(db, '0005_fingerprints.sql')),
  ];
}

// Every test file, in the order run.mjs uses (12c).
async function allTestFiles(db, label) {
  await runTestFile(db, `0006_tests.sql (${label})`, '0006_tests.sql', 'ALL 0006 TESTS PASSED');
  await runTestFile(db, `verify_pin_tests.sql (${label})`, 'verify_pin_tests.sql', 'ALL PIN TESTS PASSED');
  await runTestFile(db, `0002_tests.sql (${label})`, '0002_tests.sql', 'ALL 0002 TESTS PASSED');
  await runTestFile(db, `0003_tests.sql (${label})`, '0003_tests.sql', 'ALL 0003 TESTS PASSED');
  await runTestFile(db, `0004_tests.sql (${label})`, '0004_tests.sql', 'ALL 0004 TESTS PASSED');
  await runTestFile(db, `0005_tests.sql (${label})`, '0005_tests.sql', 'ALL 0005 TESTS PASSED');
}

// Two link codes for the seeded Star event (8 characters from the
// public-code alphabet, different from 0005's test code).
const STAR_CODE_W = 'pgst2345';
const STAR_CODE_S = 'pgst6789';

// Step 12 on the main database (and 0006 on top of the upgrade database).
// Returns 0006's fingerprints (or null if 0006 could not be applied).
async function step12(db, upgradeDb) {
  // 12a. the fingerprints file must stay runnable through the connector
  const printsText = read('tests', '0006_fingerprints.sql');
  record('0006_fingerprints.sql contains neither "delete" nor "drop" (connector-safe)', !/delete|drop/i.test(printsText));

  // 12b. apply 0006; the earlier migrations' fingerprints don't move
  const earlierBefore = await earlierFingerprints(db);
  if (!(await run(db, 'apply 0006_star_testing.sql', read('migrations', '0006_star_testing.sql')))) return null;
  const earlierAfter = await earlierFingerprints(db);
  record('0003 / 0004 / 0005 fingerprints identical before/after 0006',
    JSON.stringify(earlierBefore) === JSON.stringify(earlierAfter), `${earlierAfter.length} rows`);

  // 12c. every test file
  await allTestFiles(db, 'after 0006');

  // 12d. live checks as the Star form's login
  await starRegistrarLiveChecks(db);

  // 12e. a seeded Star event, then the 0006 and 0005 tests again
  if (await seedStarTestEvent(db)) {
    await runTestFile(db, '0006_tests.sql (with the Star test event)', '0006_tests.sql', 'ALL 0006 TESTS PASSED');
    await runTestFile(db, '0005_tests.sql (with the Star test event)', '0005_tests.sql', 'ALL 0005 TESTS PASSED');
  }

  // 12f. re-run safety
  const before6 = await fingerprints(db, '0006_fingerprints.sql');
  const data6Before = await one(db, snapshot6Sql);
  await run(db, 'apply 0006 a SECOND time (re-run safety)', read('migrations', '0006_star_testing.sql'));
  const data6After = await one(db, snapshot6Sql);
  record('0006 re-run kept every row unchanged (16 Star tables, change_log)', data6Before === data6After);
  const after6 = await fingerprints(db, '0006_fingerprints.sql');
  record('0006 fingerprints identical before/after re-run', JSON.stringify(before6) === JSON.stringify(after6), `${after6.length} rows`);
  record('0003 / 0004 / 0005 fingerprints still identical after the 0006 re-run',
    JSON.stringify(earlierBefore) === JSON.stringify(await earlierFingerprints(db)));
  await runTestFile(db, '0006_tests.sql (after re-run)', '0006_tests.sql', 'ALL 0006 TESTS PASSED');
  await runTestFile(db, '0005_tests.sql (after 0006 re-run)', '0005_tests.sql', 'ALL 0005 TESTS PASSED');
  await starRegistrarLiveChecks(db);

  // 12g. the upgrade database: 0006 on top, then the seed's "never
  // overwrite" rule with a renamed and a removed seeded subject
  if (upgradeDb) {
    if (await run(upgradeDb, '[upgrade] apply 0006 on top', read('migrations', '0006_star_testing.sql'))) {
      const up6 = await fingerprints(upgradeDb, '0006_fingerprints.sql');
      record('[upgrade] 0006 fingerprints identical to a fresh install', JSON.stringify(up6) === JSON.stringify(after6), `${up6.length} rows`);
      await runTestFile(upgradeDb, '[upgrade] 0006_tests.sql', '0006_tests.sql', 'ALL 0006 TESTS PASSED');
      await runTestFile(upgradeDb, '[upgrade] 0005_tests.sql (after 0006)', '0005_tests.sql', 'ALL 0005 TESTS PASSED');
      await runTestFile(upgradeDb, '[upgrade] 0003_tests.sql (after 0006)', '0003_tests.sql', 'ALL 0003 TESTS PASSED');
      const changed = await run(upgradeDb, '[upgrade] rename one seeded subject and remove another (as an admin would)', `
        begin;
        update public.star_categories set name = 'Knowledge (renamed)' where dan = 1 and name = 'Knowledge';
        delete from public.star_categories where dan = 2 and name = 'Breaking';
        commit;`);
      if (changed) {
        const seedState = `select (select count(*)::int from public.star_categories) as n,
            (select count(*)::int from public.star_categories where name = 'Knowledge') as knowledge1,
            (select count(*)::int from public.star_categories where dan = 2 and name = 'Breaking') as breaking2,
            (select count(*)::int from public.change_log where action = 'star_seed') as seed_rows`;
        const before = (await upgradeDb.query(seedState)).rows[0];
        await run(upgradeDb, '[upgrade] apply 0006 again after the subject changes', read('migrations', '0006_star_testing.sql'));
        const afterRun = (await upgradeDb.query(seedState)).rows[0];
        record('[upgrade] the seed never re-adds a renamed or removed subject, nor duplicates one',
          JSON.stringify(before) === JSON.stringify(afterRun) && afterRun.n === 33 && afterRun.knowledge1 === 2
            && afterRun.breaking2 === 0 && afterRun.seed_rows === 45,
          `before ${JSON.stringify(before)}, after ${JSON.stringify(afterRun)}`);
        await runTestFile(upgradeDb, '[upgrade] 0006_tests.sql (after the second apply)', '0006_tests.sql', 'ALL 0006 TESTS PASSED');
      }
    }
  }
  return after6;
}

// =====================================================================
// Step 16: the new-students migrations (0007 Schedule, 0008 Calendar,
// 0009 Forms, 0012 Prospects) in the LIVE order, on their own database:
//   a. steps 1-5, 0003, 0004, the seed, 0005 (+ its test event), 0006,
//      0010 (grading results) - what the live database already has
//   b. 0007 -> 0008 -> 0009, each with its tests; a sign-up saved before
//      0012 (dated weeks earlier); then 0012: the backfill makes its
//      prospects and keeps the real sign-up time
//   c. every test file again (the earlier ones must still pass on top)
//   d. re-run safety for 0007, 0008, 0009 and 0012 (fingerprints and
//      rows unchanged, tests pass again)
//   e. fresh = live order: a minimal database (steps 1-5, 0003, 0004,
//      0007-0012 only) must give the same 0007 / 0008 / 0009 / 0012
//      fingerprints, so 0005, 0006 and 0010 change nothing of ours
// Returns { after7, after8, after9, after12 } for the printout, or null.
// =====================================================================
async function step16() {
  const L = '[live order] ';
  const db = await buildBase(L);
  if (!db) return null;
  // a. what is live already
  if (!(await run(db, L + 'apply 0003', read('migrations', '0003_testing_classes_ranks.sql')))) return null;
  if (!(await run(db, L + 'apply 0004', read('migrations', '0004_staff_accounts.sql')))) return null;
  await run(db, L + 'apply built-in seed', builtInSeedSql());
  if (!(await run(db, L + 'apply 0005', read('migrations', '0005_testing_events.sql')))) return null;
  await seedTestEvent(db);
  if (!(await run(db, L + 'apply 0006', read('migrations', '0006_star_testing.sql')))) return null;
  if (!(await run(db, L + 'apply 0010 (grading results)', read('migrations', '0010_testing_results.sql')))) return null;
  await runTestFile(db, L + '0010_tests.sql (grading, before the new-students files)', '0010_tests.sql', 'ALL 0010 TESTS PASSED');

  // b. the new-students files, in order
  if (!(await run(db, L + 'apply 0007_schedule.sql', read('migrations', '0007_schedule.sql')))) return null;
  await runTestFile(db, L + '0007_tests.sql', '0007_tests.sql', 'ALL 0007 TESTS PASSED');
  if (!(await run(db, L + 'apply 0008_calendar.sql', read('migrations', '0008_calendar.sql')))) return null;
  await runTestFile(db, L + '0008_tests.sql', '0008_tests.sql', 'ALL 0008 TESTS PASSED');
  if (!(await run(db, L + 'apply 0009_forms.sql', read('migrations', '0009_forms.sql')))) return null;
  await runTestFile(db, L + '0009_tests.sql', '0009_tests.sql', 'ALL 0009 TESTS PASSED');
  await run(db, L + 'a sign-up saved before 0012 (as postgres)', `
    insert into public.forms (location_code, name, slug, kind, status, draft, published, published_version, settings)
    values ('worcester', 'zz upgrade', 'zz-upgrade-form', 'blank', 'live', public.forms_template('blank'), public.forms_template('blank'), 1,
            '{"thank_you":"","alert_email":null,"confirm_email":false,"add_to_calendar":false}');
    insert into public.form_submissions (form_id, location_code, published_version, fields, answers, parent_name, parent_phone, parent_email,
                                         children, source, submission_key)
    select f.id, 'worcester', 1, f.published, '{}', 'Up Grade', '5085550000', 'up@example.com',
           '[{"first_name":"Una","age":6},{"first_name":"Ned","age":8}]', 'staff', gen_random_uuid()
      from public.forms f where f.slug = 'zz-upgrade-form';
    -- it was sent weeks before 0012 runs (the bookkeeping trigger would reset the time, so skip triggers for this one line)
    set session_replication_role = replica;
    update public.form_submissions set created_at = timestamptz '2026-09-01 21:30:00-04' where parent_name = 'Up Grade';
    set session_replication_role = origin;`);
  if (!(await run(db, L + 'apply 0012_prospects.sql', read('migrations', '0012_prospects.sql')))) return null;
  record(L + '0012 made prospects for the earlier sign-up (2 children)',
    (await one(db, "select count(*)::int from public.prospects p join public.form_submissions s on s.id = p.submission_id where s.parent_name = 'Up Grade'")) === 2);
  record(L + 'each backfilled child has a "Signed up" timeline line at the real sign-up time',
    (await one(db, "select count(*)::int from public.prospect_activity a join public.prospects p on p.id = a.prospect_id join public.form_submissions s on s.id = p.submission_id where s.parent_name = 'Up Grade' and a.kind = 'created' and a.created_at = timestamptz '2026-09-01 21:30:00-04'")) === 2);
  await runTestFile(db, L + '0012_tests.sql', '0012_tests.sql', 'ALL 0012 TESTS PASSED');

  // c. every test file again, on top of everything
  for (const [file, ok] of [['verify_pin_tests.sql', 'ALL PIN TESTS PASSED'], ['0002_tests.sql', 'ALL 0002 TESTS PASSED'], ['0003_tests.sql', 'ALL 0003 TESTS PASSED'],
    ['0004_tests.sql', 'ALL 0004 TESTS PASSED'], ['0005_tests.sql', 'ALL 0005 TESTS PASSED'], ['0006_tests.sql', 'ALL 0006 TESTS PASSED'], ['0010_tests.sql', 'ALL 0010 TESTS PASSED'],
    ['0007_tests.sql', 'ALL 0007 TESTS PASSED'], ['0008_tests.sql', 'ALL 0008 TESTS PASSED'], ['0009_tests.sql', 'ALL 0009 TESTS PASSED']]) {
    await runTestFile(db, `${L}${file} (after 0012)`, file, ok);
  }

  // d. re-run safety
  const before7 = await fingerprints(db, '0007_fingerprints.sql');
  await run(db, L + 'apply 0007 a SECOND time (re-run safety)', read('migrations', '0007_schedule.sql'));
  const after7 = await fingerprints(db, '0007_fingerprints.sql');
  record(L + '0007 fingerprints identical before/after re-run', JSON.stringify(before7) === JSON.stringify(after7), `${after7.length} rows`);
  await runTestFile(db, L + '0007_tests.sql (after re-run)', '0007_tests.sql', 'ALL 0007 TESTS PASSED');
  await runTestFile(db, L + '0003_tests.sql (after 0007 re-run)', '0003_tests.sql', 'ALL 0003 TESTS PASSED');
  await runTestFile(db, L + '0005_tests.sql (after 0007 re-run)', '0005_tests.sql', 'ALL 0005 TESTS PASSED');

  const typeCount = await one(db, 'select count(*)::int from public.calendar_event_types');
  const calendarSnapshotSql = `select md5(coalesce((select string_agg(to_jsonb(t)::text, ',' order by t.id) from public.calendar_event_types t), '')
                          || coalesce((select string_agg(to_jsonb(e)::text, ',' order by e.id) from public.calendar_events e), '')
                          || coalesce((select string_agg(to_jsonb(c)::text, ',' order by c.id) from public.calendar_closures c), '')
                          || coalesce((select string_agg(to_jsonb(x)::text, ',' order by x.id) from public.calendar_closure_classes x), '')
                          || (select count(*) from public.change_log)::text)`;
  const calendarBefore = await one(db, calendarSnapshotSql);
  const before8 = await fingerprints(db, '0008_fingerprints.sql');
  await run(db, L + 'apply 0008 a SECOND time (re-run safety)', read('migrations', '0008_calendar.sql'));
  record(L + '0008 re-run kept every calendar row and the history unchanged', calendarBefore === (await one(db, calendarSnapshotSql)));
  const after8 = await fingerprints(db, '0008_fingerprints.sql');
  record(L + '0008 fingerprints identical before/after re-run', JSON.stringify(before8) === JSON.stringify(after8), `${after8.length} rows`);
  record(L + '0008 re-run added no second set of event types (5)',
    typeCount === 5 && (await one(db, 'select count(*)::int from public.calendar_event_types')) === 5);
  await runTestFile(db, L + '0008_tests.sql (after re-run)', '0008_tests.sql', 'ALL 0008 TESTS PASSED');

  const formsSnapshotSql = `select md5(coalesce((select string_agg(to_jsonb(f)::text, ',' order by f.id) from public.forms f), '')
                          || coalesce((select string_agg(to_jsonb(s)::text, ',' order by s.id) from public.form_submissions s), '')
                          || (select count(*) from public.change_log)::text)`;
  const formsBefore = await one(db, formsSnapshotSql);
  const before9 = await fingerprints(db, '0009_fingerprints.sql');
  await run(db, L + 'apply 0009 a SECOND time (re-run safety)', read('migrations', '0009_forms.sql'));
  record(L + '0009 re-run kept every form row and the history unchanged', formsBefore === (await one(db, formsSnapshotSql)));
  const after9 = await fingerprints(db, '0009_fingerprints.sql');
  record(L + '0009 fingerprints identical before/after re-run', JSON.stringify(before9) === JSON.stringify(after9), `${after9.length} rows`);
  await runTestFile(db, L + '0009_tests.sql (after re-run)', '0009_tests.sql', 'ALL 0009 TESTS PASSED');
  await runTestFile(db, L + '0012_tests.sql (after 0009 re-run)', '0012_tests.sql', 'ALL 0012 TESTS PASSED');

  const prospectsSnapshotSql = `select md5(coalesce((select string_agg(to_jsonb(s)::text, ',' order by s.id) from public.prospect_statuses s), '')
                          || coalesce((select string_agg(to_jsonb(p)::text, ',' order by p.id) from public.prospects p), '')
                          || coalesce((select string_agg(to_jsonb(a)::text, ',' order by a.id) from public.prospect_activity a), '')
                          || (select count(*) from public.change_log)::text)`;
  const prospectsBefore = await one(db, prospectsSnapshotSql);
  const before12 = await fingerprints(db, '0012_fingerprints.sql');
  await run(db, L + 'apply 0012 a SECOND time (re-run safety)', read('migrations', '0012_prospects.sql'));
  record(L + '0012 re-run kept every status, prospect, timeline line and the history unchanged', prospectsBefore === (await one(db, prospectsSnapshotSql)));
  const after12 = await fingerprints(db, '0012_fingerprints.sql');
  record(L + '0012 fingerprints identical before/after re-run', JSON.stringify(before12) === JSON.stringify(after12), `${after12.length} rows`);
  record(L + '0012 seeded 7 statuses per school, once',
    (await one(db, "select count(*)::int from public.prospect_statuses where builtin is not null or name = 'Contacted'")) === 14);
  await runTestFile(db, L + '0012_tests.sql (after re-run)', '0012_tests.sql', 'ALL 0012 TESTS PASSED');
  await runTestFile(db, L + '0009_tests.sql (after 0012 re-run)', '0009_tests.sql', 'ALL 0009 TESTS PASSED');
  await runTestFile(db, L + '0010_tests.sql (grading, after everything)', '0010_tests.sql', 'ALL 0010 TESTS PASSED');
  await runTestFile(db, L + '0006_tests.sql (after everything)', '0006_tests.sql', 'ALL 0006 TESTS PASSED');

  // e. a minimal database: our four files without 0005 / 0006 / 0010
  const M = '[minimal] ';
  const mini = await buildBase(M);
  if (mini && (await run(mini, M + 'apply 0003', read('migrations', '0003_testing_classes_ranks.sql')))
      && (await run(mini, M + 'apply 0004', read('migrations', '0004_staff_accounts.sql')))) {
    await run(mini, M + 'apply built-in seed', builtInSeedSql());
    let ok = true;
    for (const f of ['0007_schedule.sql', '0008_calendar.sql', '0009_forms.sql', '0012_prospects.sql']) {
      ok = ok && (await run(mini, M + 'apply ' + f, read('migrations', f)));
    }
    if (ok) {
      for (const [file, mine] of [['0007_fingerprints.sql', after7], ['0008_fingerprints.sql', after8], ['0009_fingerprints.sql', after9], ['0012_fingerprints.sql', after12]]) {
        const p = await fingerprints(mini, file);
        record(`${M}${file.slice(0, 4)} fingerprints identical to the live-order database`, JSON.stringify(p) === JSON.stringify(mine), `${p.length} rows`);
      }
      await runTestFile(mini, M + '0012_tests.sql', '0012_tests.sql', 'ALL 0012 TESTS PASSED');
    }
  }
  return { after7, after8, after9, after12, db };
}

// =====================================================================
// Step 17: 0015 (family history) on top of everything, in the live order.
//   a. a database built like production on 2026-10-19: steps 1-5, 0003,
//      0004, the seed, 0005 (+ its test event), 0006, 0010, 0007, 0008,
//      0009, 0012 - with no family record in change_log (as on production)
//   b. 0015; the earlier migrations' fingerprints don't move (0003's
//      above all: change_log is untouched); 0015_tests.sql passes
//   c. every earlier test file still passes on top of 0015
//   d. 0015 applied twice (and a third time): fingerprints and rows
//      unchanged, the tests still pass
//   e. fresh = live order: a minimal database (steps 1-5, 0003, 0004,
//      0007, 0008, 0009, 0012, 0015) gives the same 0015 fingerprints
//   f. R5: on step 16's database, where a sign-up was saved before 0012
//      (so change_log holds family rows), 0015 must REFUSE to apply
// "refuseDb" = step 16's database (or null). Returns 0015's fingerprints.
// =====================================================================
async function step17(refuseDb) {
  const L = '[0015] ';
  const db = await buildBase(L);
  if (!db) return null;
  for (const [label, file] of [['0003', '0003_testing_classes_ranks.sql'], ['0004', '0004_staff_accounts.sql']]) {
    if (!(await run(db, `${L}apply ${label}`, read('migrations', file)))) return null;
  }
  await run(db, L + 'apply built-in seed', builtInSeedSql());
  if (!(await run(db, L + 'apply 0005', read('migrations', '0005_testing_events.sql')))) return null;
  await seedTestEvent(db);
  for (const [label, file] of [['0006', '0006_star_testing.sql'], ['0010 (grading results)', '0010_testing_results.sql'],
    ['0007', '0007_schedule.sql'], ['0008', '0008_calendar.sql'], ['0009', '0009_forms.sql'], ['0012', '0012_prospects.sql']]) {
    if (!(await run(db, `${L}apply ${label}`, read('migrations', file)))) return null;
  }
  record(L + 'no family record in change_log before 0015 (as on production)',
    (await one(db, "select count(*)::int from public.change_log where table_name in ('form_submissions', 'class_bookings', 'prospects', 'prospect_notes')")) === 0);

  // b. apply 0015; nothing earlier moves
  const prints = ['0003_fingerprints.sql', '0004_fingerprints.sql', '0005_fingerprints.sql', '0006_fingerprints.sql', '0010_fingerprints.sql',
    '0007_fingerprints.sql', '0008_fingerprints.sql'];
  const before = {};
  for (const f of prints) before[f] = await fingerprints(db, f);
  if (!(await run(db, L + 'apply 0015_family_history.sql', read('migrations', '0015_family_history.sql')))) return null;
  for (const f of prints) {
    const after = await fingerprints(db, f);
    record(`${L}${f.slice(0, 4)} fingerprints unchanged by 0015${f.startsWith('0003') ? ' (change_log untouched)' : ''}`,
      JSON.stringify(before[f]) === JSON.stringify(after), `${after.length} rows`);
  }
  await runTestFile(db, L + '0015_tests.sql', '0015_tests.sql', 'ALL 0015 TESTS PASSED');

  // c. every earlier test file on top of 0015
  for (const [file, ok] of [['verify_pin_tests.sql', 'ALL PIN TESTS PASSED'], ['0002_tests.sql', 'ALL 0002 TESTS PASSED'], ['0003_tests.sql', 'ALL 0003 TESTS PASSED'],
    ['0004_tests.sql', 'ALL 0004 TESTS PASSED'], ['0005_tests.sql', 'ALL 0005 TESTS PASSED'], ['0006_tests.sql', 'ALL 0006 TESTS PASSED'], ['0010_tests.sql', 'ALL 0010 TESTS PASSED'],
    ['0007_tests.sql', 'ALL 0007 TESTS PASSED'], ['0008_tests.sql', 'ALL 0008 TESTS PASSED'], ['0009_tests.sql', 'ALL 0009 TESTS PASSED'], ['0012_tests.sql', 'ALL 0012 TESTS PASSED']]) {
    await runTestFile(db, `${L}${file} (after 0015)`, file, ok);
  }

  // d. re-run safety (twice)
  const snapshotSql = `select md5(coalesce((select string_agg(to_jsonb(h)::text, ',' order by h.id) from public.family_history h), '')
                          || (select count(*) from public.change_log)::text)`;
  const before15 = await fingerprints(db, '0015_fingerprints.sql');
  const rowsBefore = await one(db, snapshotSql);
  for (const n of ['SECOND', 'THIRD']) {
    await run(db, `${L}apply 0015 a ${n} time (re-run safety)`, read('migrations', '0015_family_history.sql'));
  }
  record(L + '0015 re-runs kept every family_history row and the change_log count unchanged', rowsBefore === (await one(db, snapshotSql)));
  const after15 = await fingerprints(db, '0015_fingerprints.sql');
  record(L + '0015 fingerprints identical before/after the re-runs', JSON.stringify(before15) === JSON.stringify(after15), `${after15.length} rows`);
  await runTestFile(db, L + '0015_tests.sql (after re-runs)', '0015_tests.sql', 'ALL 0015 TESTS PASSED');
  await runTestFile(db, L + '0012_tests.sql (after re-runs)', '0012_tests.sql', 'ALL 0012 TESTS PASSED');
  await runTestFile(db, L + '0009_tests.sql (after re-runs)', '0009_tests.sql', 'ALL 0009 TESTS PASSED');

  // e. a minimal database gives the same fingerprints
  const M = '[0015 minimal] ';
  const mini = await buildBase(M);
  if (mini) {
    let ok = true;
    for (const f of ['0003_testing_classes_ranks.sql', '0004_staff_accounts.sql']) ok = ok && (await run(mini, M + 'apply ' + f, read('migrations', f)));
    if (ok) await run(mini, M + 'apply built-in seed', builtInSeedSql());
    for (const f of ['0007_schedule.sql', '0008_calendar.sql', '0009_forms.sql', '0012_prospects.sql', '0015_family_history.sql']) {
      ok = ok && (await run(mini, M + 'apply ' + f, read('migrations', f)));
    }
    if (ok) {
      const p = await fingerprints(mini, '0015_fingerprints.sql');
      record(M + '0015 fingerprints identical to the live-order database', JSON.stringify(p) === JSON.stringify(after15), `${p.length} rows`);
      await runTestFile(mini, M + '0015_tests.sql', '0015_tests.sql', 'ALL 0015 TESTS PASSED');
      await runTestFile(mini, M + '0009_tests.sql', '0009_tests.sql', 'ALL 0009 TESTS PASSED');
    }
  }

  // f. R5: refused where change_log already holds a family row
  if (refuseDb) {
    const famRows = await one(refuseDb, "select count(*)::int from public.change_log where table_name in ('form_submissions', 'class_bookings', 'prospects', 'prospect_notes')");
    let refused = false;
    let message = '';
    try {
      await refuseDb.exec(read('migrations', '0015_family_history.sql'));
    } catch (error) {
      refused = /already holds family rows/.test(error.message);
      message = error.message.slice(0, 120);
      await refuseDb.exec('rollback;').catch(() => {});
    }
    record('[0015 refuse] 0015 refuses to apply when change_log holds family rows (R5)', famRows > 0 && refused, `${famRows} family rows; ${message || 'it applied!'}`);
    record('[0015 refuse] nothing of 0015 was kept', (await one(refuseDb, "select to_regclass('public.family_history') is null")) === true);
  } else {
    record('[0015 refuse] the step-16 database exists for the R5 check', false);
  }
  return after15;
}

// =====================================================================
// Step 18: 0019 (school phone), in the live order.
//   a. a database built like production on 2026-10-19 (as step 17) plus
//      0015 and 0011
//   b. 0019; the other fingerprints don't move, except 0005's "table
//      locations" line, which may only gain "phone:" read rights
//   c. 0019_tests.sql, then every earlier test file
//   d. 0019 twice more: fingerprints and the saved phone unchanged
//   e. 0005 re-run: the phone can't be read any more; 0019 re-run: it
//      can again and the number is still there (SETUP section 17)
//   f. a minimal database gives the same 0019 fingerprints
// Returns 0019's fingerprints.
// =====================================================================
async function step18() {
  const L = '[0019] ';
  const db = await buildBase(L);
  if (!db) return null;
  for (const [label, file] of [['0003', '0003_testing_classes_ranks.sql'], ['0004', '0004_staff_accounts.sql']]) {
    if (!(await run(db, `${L}apply ${label}`, read('migrations', file)))) return null;
  }
  await run(db, L + 'apply built-in seed', builtInSeedSql());
  if (!(await run(db, L + 'apply 0005', read('migrations', '0005_testing_events.sql')))) return null;
  await seedTestEvent(db);
  for (const [label, file] of [['0006', '0006_star_testing.sql'], ['0010 (grading results)', '0010_testing_results.sql'],
    ['0007', '0007_schedule.sql'], ['0008', '0008_calendar.sql'], ['0009', '0009_forms.sql'], ['0012', '0012_prospects.sql'],
    ['0015', '0015_family_history.sql'], ['0011 (Finance)', '0011_finance.sql']]) {
    if (!(await run(db, `${L}apply ${label}`, read('migrations', file)))) return null;
  }

  // b. apply 0019; nothing else moves (0005's locations line: only the phone right)
  const prints = ['0003_fingerprints.sql', '0004_fingerprints.sql', '0005_fingerprints.sql', '0006_fingerprints.sql', '0010_fingerprints.sql',
    '0007_fingerprints.sql', '0008_fingerprints.sql', '0009_fingerprints.sql', '0012_fingerprints.sql', '0015_fingerprints.sql', '0011_fingerprints.sql'];
  const before = {};
  for (const f of prints) before[f] = await fingerprints(db, f);
  if (!(await run(db, L + 'apply 0019_school_phone.sql', read('migrations', '0019_school_phone.sql')))) return null;
  for (const f of prints) {
    const after = await fingerprints(db, f);
    if (f.startsWith('0005')) {
      const gone = before[f].filter((line) => !after.includes(line));
      const added = after.filter((line) => !before[f].includes(line));
      // 0005's "table locations" line gains "phone>authenticated:SELECT"; its trigger list gains
      // 0019's locations_phone_before_write. Nothing else may move.
      const table = added.filter((line) => /^table {2}locations /.test(line));
      const others = added.filter((line) => !table.includes(line));
      const onlyPhone = gone.length === 1 && /^table {2}locations /.test(gone[0]) && table.length === 1
        && table[0].includes('phone>authenticated:SELECT') && table[0].replace(/,?phone>authenticated:SELECT/, '') === gone[0]
        && others.every((line) => /^trigger {2}locations\.locations_phone_before_write /.test(line));
      record(L + '0005 fingerprints: only the locations line moved, by the phone read right', gone.length + added.length === 0 || onlyPhone,
        gone.length + added.length === 0 ? 'unchanged' : `${gone.length} line(s) -> ${added.length}: ${added.map((l) => l.slice(0, 50)).join(' | ')}`);
    } else {
      record(`${L}${f.slice(0, 4)} fingerprints unchanged by 0019`, JSON.stringify(before[f]) === JSON.stringify(after), `${after.length} rows`);
    }
  }

  // c. its own tests, then every earlier test file
  await runTestFile(db, L + '0019_tests.sql', '0019_tests.sql', 'ALL 0019 TESTS PASSED');
  for (const [file, ok] of [['verify_pin_tests.sql', 'ALL PIN TESTS PASSED'], ['0002_tests.sql', 'ALL 0002 TESTS PASSED'], ['0003_tests.sql', 'ALL 0003 TESTS PASSED'],
    ['0004_tests.sql', 'ALL 0004 TESTS PASSED'], ['0005_tests.sql', 'ALL 0005 TESTS PASSED'], ['0006_tests.sql', 'ALL 0006 TESTS PASSED'], ['0010_tests.sql', 'ALL 0010 TESTS PASSED'],
    ['0007_tests.sql', 'ALL 0007 TESTS PASSED'], ['0008_tests.sql', 'ALL 0008 TESTS PASSED'], ['0009_tests.sql', 'ALL 0009 TESTS PASSED'], ['0012_tests.sql', 'ALL 0012 TESTS PASSED'],
    ['0015_tests.sql', 'ALL 0015 TESTS PASSED'], ['0011_tests.sql', 'ALL 0011 TESTS PASSED']]) {
    await runTestFile(db, `${L}${file} (after 0019)`, file, ok);
  }

  // d. re-run safety (twice), with a real phone saved
  await db.exec("select set_config('tkd.action', 'manual', false); update public.locations set phone = '(508) 555-0100' where code = 'worcester'; select set_config('tkd.action', '', false);");
  const phoneSql = "select coalesce(phone, '') || '/' || version from public.locations where code = 'worcester'";
  const before19 = await fingerprints(db, '0019_fingerprints.sql');
  const phoneBefore = await one(db, phoneSql);
  for (const n of ['SECOND', 'THIRD']) {
    await run(db, `${L}apply 0019 a ${n} time (re-run safety)`, read('migrations', '0019_school_phone.sql'));
  }
  record(L + '0019 re-runs kept the saved phone and the version', phoneBefore === (await one(db, phoneSql)), phoneBefore);
  const after19 = await fingerprints(db, '0019_fingerprints.sql');
  record(L + '0019 fingerprints identical before/after the re-runs', JSON.stringify(before19) === JSON.stringify(after19), `${after19.length} rows`);
  await runTestFile(db, L + '0019_tests.sql (after re-runs)', '0019_tests.sql', 'ALL 0019 TESTS PASSED');

  // e. a 0005 re-run takes the read right; a 0019 re-run brings it back
  const canRead = "select has_column_privilege('authenticated', 'public.locations', 'phone', 'select')";
  if (await run(db, L + 're-run 0005 (as the 0010 undo does)', read('migrations', '0005_testing_events.sql'))) {
    record(L + 'after a 0005 re-run the phone is not readable (expected; SETUP says re-run 0019)', (await one(db, canRead)) === false);
    await run(db, L + 're-run 0019 after 0005', read('migrations', '0019_school_phone.sql'));
    record(L + 'after the 0019 re-run the phone is readable again and kept', (await one(db, canRead)) === true && phoneBefore === (await one(db, phoneSql)));
    const again = await fingerprints(db, '0019_fingerprints.sql');
    record(L + '0019 fingerprints back to the same after 0005 + 0019 re-runs', JSON.stringify(again) === JSON.stringify(after19), `${again.length} rows`);
  }

  // f. a minimal database gives the same fingerprints
  const M = '[0019 minimal] ';
  const mini = await buildBase(M);
  if (mini) {
    let ok = true;
    for (const f of ['0003_testing_classes_ranks.sql', '0004_staff_accounts.sql']) ok = ok && (await run(mini, M + 'apply ' + f, read('migrations', f)));
    if (ok) await run(mini, M + 'apply built-in seed', builtInSeedSql());
    for (const f of ['0005_testing_events.sql', '0007_schedule.sql', '0008_calendar.sql', '0009_forms.sql', '0019_school_phone.sql']) {
      ok = ok && (await run(mini, M + 'apply ' + f, read('migrations', f)));
    }
    if (ok) {
      const p = await fingerprints(mini, '0019_fingerprints.sql');
      record(M + '0019 fingerprints identical to the live-order database', JSON.stringify(p) === JSON.stringify(after19), `${p.length} rows`);
      await runTestFile(mini, M + '0019_tests.sql', '0019_tests.sql', 'ALL 0019 TESTS PASSED');
    }
  }
  return after19;
}


// =====================================================================
// step0021: 0021 (Not interested families deleted after 6 months,
// rulebook v0.611), on its own database built in the live order.
//   a. steps 1-5, 0003, 0004, the seed, 0005 (+ its test event), 0006,
//      0010, 0007, 0008, 0009, 0012, 0015, 0011, 0019, 0020
//   b. 0021; every other migration's fingerprints stay the same, except
//      the ONE line of prospects_purge_old (it is listed by 0012's and
//      0015's fingerprints too)
//   c. 0021_tests.sql, then 0015_tests.sql and 0012_tests.sql (their
//      2-year clean-up tests must still pass) and the other new-students
//      test files
//   d. 0021 twice more: fingerprints identical, tests still pass
//   e. a minimal database (steps 1-5, 0003, 0004, the seed, 0007, 0008,
//      0009, 0012, 0015, 0021) gives the same 0021 fingerprints
// Returns 0021's fingerprints.
// =====================================================================
async function step0021() {
  const L = '[0021] ';
  const db = await buildBase(L);
  if (!db) return null;
  for (const [label, file] of [['0003', '0003_testing_classes_ranks.sql'], ['0004', '0004_staff_accounts.sql']]) {
    if (!(await run(db, `${L}apply ${label}`, read('migrations', file)))) return null;
  }
  await run(db, L + 'apply built-in seed', builtInSeedSql());
  if (!(await run(db, L + 'apply 0005', read('migrations', '0005_testing_events.sql')))) return null;
  await seedTestEvent(db);
  for (const [label, file] of [['0006', '0006_star_testing.sql'], ['0010 (grading results)', '0010_testing_results.sql'],
    ['0007', '0007_schedule.sql'], ['0008', '0008_calendar.sql'], ['0009', '0009_forms.sql'], ['0012', '0012_prospects.sql'],
    ['0015', '0015_family_history.sql'], ['0011 (Finance)', '0011_finance.sql'], ['0019', '0019_school_phone.sql'],
    ['0020', '0020_session_id_claims.sql']]) {
    if (!(await run(db, `${L}apply ${label}`, read('migrations', file)))) return null;
  }

  // b. apply 0021; only the clean-up's own fingerprint line may move
  const prints = ['0003_fingerprints.sql', '0004_fingerprints.sql', '0005_fingerprints.sql', '0006_fingerprints.sql', '0010_fingerprints.sql',
    '0007_fingerprints.sql', '0008_fingerprints.sql', '0009_fingerprints.sql', '0012_fingerprints.sql', '0015_fingerprints.sql',
    '0011_fingerprints.sql', '0019_fingerprints.sql'];
  const before = {};
  for (const f of prints) before[f] = await fingerprints(db, f);
  const purgeBefore = await fingerprints(db, '0021_fingerprints.sql');
  if (!(await run(db, L + 'apply 0021_prospects_not_interested_sooner.sql', read('migrations', '0021_prospects_not_interested_sooner.sql')))) return null;
  const after21 = await fingerprints(db, '0021_fingerprints.sql');
  record(L + 'prospects_purge_old really changed (its code fingerprint is new)', JSON.stringify(purgeBefore) !== JSON.stringify(after21), `${after21.length} rows`);
  for (const f of prints) {
    const after = await fingerprints(db, f);
    const gone = before[f].filter((line) => !after.includes(line));
    const added = after.filter((line) => !before[f].includes(line));
    const onlyPurge = [...gone, ...added].every((line) => /prospects_purge_old\(\)/.test(line)) && gone.length === added.length;
    record(`${L}${f.slice(0, 4)} fingerprints: nothing moved except prospects_purge_old`, onlyPurge,
      gone.length + added.length === 0 ? `${after.length} rows, unchanged` : `${gone.length} line(s) changed: ${added.map((l) => l.slice(0, 60)).join(' | ')}`);
  }

  // c. its own tests, then the files that test the clean-up and the rest of new students
  await runTestFile(db, L + '0021_tests.sql', '0021_tests.sql', 'ALL 0021 TESTS PASSED');
  for (const [file, ok] of [['0015_tests.sql', 'ALL 0015 TESTS PASSED'], ['0012_tests.sql', 'ALL 0012 TESTS PASSED'],
    ['0009_tests.sql', 'ALL 0009 TESTS PASSED'], ['0008_tests.sql', 'ALL 0008 TESTS PASSED'], ['0007_tests.sql', 'ALL 0007 TESTS PASSED'],
    ['0019_tests.sql', 'ALL 0019 TESTS PASSED'], ['0003_tests.sql', 'ALL 0003 TESTS PASSED']]) {
    await runTestFile(db, `${L}${file} (after 0021)`, file, ok);
  }

  // d. re-run safety (twice)
  for (const n of ['SECOND', 'THIRD']) {
    await run(db, `${L}apply 0021 a ${n} time (re-run safety)`, read('migrations', '0021_prospects_not_interested_sooner.sql'));
  }
  const again = await fingerprints(db, '0021_fingerprints.sql');
  record(L + '0021 fingerprints identical before/after the re-runs', JSON.stringify(again) === JSON.stringify(after21), `${again.length} rows`);
  await runTestFile(db, L + '0021_tests.sql (after re-runs)', '0021_tests.sql', 'ALL 0021 TESTS PASSED');

  // e. a minimal database gives the same fingerprints
  const M = '[0021 minimal] ';
  const mini = await buildBase(M);
  if (mini) {
    let ok = true;
    for (const f of ['0003_testing_classes_ranks.sql', '0004_staff_accounts.sql']) ok = ok && (await run(mini, M + 'apply ' + f, read('migrations', f)));
    if (ok) await run(mini, M + 'apply built-in seed', builtInSeedSql());
    for (const f of ['0007_schedule.sql', '0008_calendar.sql', '0009_forms.sql', '0012_prospects.sql', '0015_family_history.sql',
      '0021_prospects_not_interested_sooner.sql']) {
      ok = ok && (await run(mini, M + 'apply ' + f, read('migrations', f)));
    }
    if (ok) {
      const p = await fingerprints(mini, '0021_fingerprints.sql');
      record(M + '0021 fingerprints identical to the live-order database', JSON.stringify(p) === JSON.stringify(after21), `${p.length} rows`);
      await runTestFile(mini, M + '0021_tests.sql', '0021_tests.sql', 'ALL 0021 TESTS PASSED');
    }
  }
  return after21;
}

// ---------------------------------------------------------------------
// Step 14: Finance (0011)
// ---------------------------------------------------------------------

// The 5 Finance tables + the history's row count, as one md5 ("re-running
// 0011 changed nothing").
const FINANCE_TABLES = ['finance_day_closings', 'finance_day_closing_items', 'finance_settings',
  'finance_reminder_times', 'finance_exports'];
const snapshot11Sql = `select md5(${FINANCE_TABLES.map((t) =>
  `coalesce((select string_agg(to_jsonb(x)::text, ',' order by x.id) from public.${t} x), '')`).join(' || ')}
  || (select count(*) from public.change_log)::text)`;

// Every earlier migration's fingerprints together (14c: 0011 must not
// change them).
async function before11Fingerprints(db) {
  return [
    ...(await fingerprints(db, '0003_fingerprints.sql')),
    ...(await fingerprints(db, '0004_fingerprints.sql')),
    ...(await fingerprints(db, '0005_fingerprints.sql')),
    ...(await fingerprints(db, '0006_fingerprints.sql')),
    ...(await fingerprints(db, '0010_fingerprints.sql')),
  ];
}

// 14d. More sample payments on BOTH sources (written as the SQL Editor
// would, labelled): Pat Lee (Color Belt, Worcester) paid cash yesterday;
// Kim Ray (Star, Shrewsbury) paid cash yesterday and got a cash refund
// today. Together with 11c / 12e the two schools now have payments today
// and yesterday, and a refund.
async function seedFinanceSamples(db) {
  await run(db, '[0011] sample payments on both sources (yesterday + a refund today)', `
    begin;
    select set_config('request.jwt.claims', '', true);
    select set_config('tkd.actor_label', 'PGlite test event', true);
    select set_config('tkd.action', 'pglite_seed', true);
    insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by_name)
    select r.id, 'payment', 6500, 'cash', public.testing_today() - 1, now() - interval '1 day', 'PGlite test event'
      from public.testing_registrations r where r.first_name = 'Pat' and r.last_name = 'Lee';
    insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by_name)
    select c.id, 'payment', 14000, 'cash', public.testing_today() - 1, now() - interval '1 day', 'PGlite test event'
      from public.star_candidates c where c.first_name = 'Kim' and c.last_name = 'Ray';
    insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by_name)
    select c.id, 'refund', -1000, 'cash', public.testing_today(), now() - interval '1 hour', 'PGlite test event'
      from public.star_candidates c where c.first_name = 'Kim' and c.last_name = 'Ray';
    select set_config('tkd.actor_label', '', true);
    select set_config('tkd.action', '', true);
    commit;`);
  const counts = await db.query(`select
      (select count(*)::int from public.testing_payments) as color_belt,
      (select count(*)::int from public.star_payments) as star,
      (select count(*)::int from public.finance_money_rows(null, public.testing_today() - 1, public.testing_today())) as items`);
  const c = counts.rows[0];
  record('[0011] samples: 2 Color Belt + 3 Star payment rows, 5 report items', c.color_belt === 2 && c.star === 3 && c.items === 5,
    JSON.stringify(c));
}

async function step14(db, upgradeDb) {
  // 14a. the fingerprints file must stay runnable through the connector
  const printsText = read('tests', '0011_fingerprints.sql');
  record('0011_fingerprints.sql contains neither "delete" nor "drop" (connector-safe)', !/delete|drop/i.test(printsText));

  // 14b. BEFORE sample data, on the upgrade database (no payments there):
  // the production copy of 0011 first, then today's over it
  let upPrints = null;
  if (upgradeDb) {
    const pays = await one(upgradeDb, 'select (select count(*) from public.testing_payments) + (select count(*) from public.star_payments)');
    record('[upgrade] no payment exists yet (0011 tests "before sample data")', Number(pays) === 0, `${pays} rows`);
    const old11 = readFileSync(path.join(here, 'fixtures', '0011_as_applied_2026-10-19.sql'), 'utf8');
    if (await run(upgradeDb, '[upgrade] apply the PRODUCTION copy of 0011 (fixtures/0011_as_applied_2026-10-19.sql)', old11)) {
      // as an admin would have done meanwhile: reminder On, a Sunday time
      await run(upgradeDb, '[upgrade] change the settings like an admin would (reminder On, Worcester Sunday 7 PM)', `
        begin;
        select set_config('tkd.actor_label', 'PGlite admin', true);
        update public.finance_settings set reminder_on = true, version = version + 1;
        update public.finance_reminder_times set remind_at = '19:00' where location_code = 'worcester' and weekday = 7;
        select set_config('tkd.actor_label', '', true);
        commit;`);
      const settingsSql = `select md5(coalesce((select string_agg(to_jsonb(x)::text, ',' order by x.id) from public.finance_settings x), '')
          || coalesce((select string_agg(to_jsonb(x)::text, ',' order by x.id) from public.finance_reminder_times x), ''))`;
      const settingsBefore = await one(upgradeDb, settingsSql);
      if (await run(upgradeDb, '[upgrade] apply today\'s 0011_finance.sql OVER the production copy', read('migrations', '0011_finance.sql'))) {
        record('[upgrade] the settings row and the 14 reminder times are untouched by the re-apply',
          settingsBefore === (await one(upgradeDb, settingsSql))
            && (await one(upgradeDb, 'select count(*)::int from public.finance_reminder_times')) === 14);
        record('[upgrade] the old chain function finance_chain_steps(date, date) is gone',
          (await one(upgradeDb, "select to_regprocedure('public.finance_chain_steps(date, date)') is null")) === true);
        const t0 = Date.now();
        await runTestFile(upgradeDb, '[upgrade] 0011_tests.sql (before sample data)', '0011_tests.sql', 'ALL 0011 TESTS PASSED');
        const secs = (Date.now() - t0) / 1000;
        record('[speed] 0011_tests.sql finished in under 60 seconds', secs < 60, `${secs.toFixed(1)} s`);
        upPrints = await fingerprints(upgradeDb, '0011_fingerprints.sql');
      }
    }
  } else {
    record('[upgrade] 0011 before sample data', false, 'the upgrade database has no 0005 (see the lines above)');
  }

  // 14c. the main database: earlier fingerprints don't move
  const earlierBefore = await before11Fingerprints(db);
  if (!(await run(db, 'apply 0011_finance.sql', read('migrations', '0011_finance.sql')))) return null;
  record('0003 / 0004 / 0005 / 0006 / 0010 fingerprints identical before/after 0011',
    JSON.stringify(earlierBefore) === JSON.stringify(await before11Fingerprints(db)), `${earlierBefore.length} rows`);
  const seeded = await db.query(`select (select count(*)::int from public.finance_settings) as settings,
      (select count(*)::int from public.finance_reminder_times where remind_at is null) as times_off,
      (select count(*)::int from public.change_log where action = 'finance_seed') as seed_rows`);
  record('[0011] seed: 1 settings row, 14 reminder times all Off, 15 history rows',
    JSON.stringify(seeded.rows[0]) === JSON.stringify({ settings: 1, times_off: 14, seed_rows: 15 }), JSON.stringify(seeded.rows[0]));

  // 14d. AFTER sample data (steps 11c / 12e + more here)
  await seedFinanceSamples(db);
  await runTestFile(db, '0011_tests.sql (after sample data)', '0011_tests.sql', 'ALL 0011 TESTS PASSED');
  await runTestFile(db, '0010_tests.sql (after 0011)', '0010_tests.sql', 'ALL 0010 TESTS PASSED');
  await allTestFiles(db, 'after 0011');

  // 14e. re-run safety
  const before11 = await fingerprints(db, '0011_fingerprints.sql');
  const data11Before = await one(db, snapshot11Sql);
  await run(db, 'apply 0011 a SECOND time (re-run safety)', read('migrations', '0011_finance.sql'));
  const data11After = await one(db, snapshot11Sql);
  record('0011 re-run kept every row unchanged (5 finance tables, change_log)', data11Before === data11After);
  const after11 = await fingerprints(db, '0011_fingerprints.sql');
  record('0011 fingerprints identical before/after re-run', JSON.stringify(before11) === JSON.stringify(after11), `${after11.length} rows`);
  await runTestFile(db, '0011_tests.sql (after re-run)', '0011_tests.sql', 'ALL 0011 TESTS PASSED');

  // 14f. fresh = upgrade
  if (upPrints) {
    record('[upgrade] 0011 fingerprints identical to the main database', JSON.stringify(upPrints) === JSON.stringify(after11),
      `${upPrints.length} rows`);
  }

  // 14g. speed with realistic volume (on the upgrade database)
  if (upPrints) await financeSpeedCheck(upgradeDb);
  return after11;
}

// 14g. The big seed, then every app function timed as an unlocked admin
// (a session + a fresh password sign-in, like the test files do). Each
// call must answer "ok" in under 2 seconds.
async function financeSpeedCheck(db, tag = '[speed]', seed = true) {
  const t0 = Date.now();
  if (seed && !(await run(db, `${tag} big seed (finance_perf_seed.sql)`, readFileSync(path.join(here, 'finance_perf_seed.sql'), 'utf8')))) return;
  const rows = await one(db, 'select (select count(*) from public.testing_payments) + (select count(*) from public.star_payments)');
  record(`${tag} the big seed has about 11,000 payment rows`, Number(rows) > 10000, `${rows} rows in ${Date.now() - t0} ms`);
  const sid = '33333333-3333-4333-8333-333333333333';
  const claims = JSON.stringify({ sub: ADMIN_UID, role: 'authenticated', session_id: sid,
    amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) - 60 }] });
  await db.exec(`insert into auth.sessions (id, user_id) values ('${sid}', '${ADMIN_UID}');
    insert into public.session_unlock (session_id, staff_id, unlocked_until) values ('${sid}', '${ADMIN_UID}', now() + interval '1 hour');`);
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [claims]);
  const today = await one(db, 'select public.testing_today()::text');
  const chain = await one(db, `select p.id::text from public.testing_payments p join public.testing_registrations r on r.id = p.registration_id
     where r.first_name = 'Perf' and r.last_name = 'Cb 14' and p.kind = 'payment' and p.amount_cents = 6500`);
  const busy = await one(db, `select paid_on::text from public.testing_payments group by paid_on order by count(*) desc, paid_on limit 1`);
  const calls = [
    ['finance_day (today)', `select public.finance_day('worcester', '${today}') as r`],
    ['finance_day (a busy day)', `select public.finance_day('worcester', '${busy}') as r`],
    ['finance_day_both', `select public.finance_day_both('${today}') as r`],
    ['finance_history (both schools, this month)', `select public.finance_history(null, '${today}') as r`],
    ['finance_history (Worcester, 400 days ago)', `select public.finance_history('worcester', date '${today}' - 400) as r`],
    ['finance_payment_detail', `select public.finance_payment_detail('color_belt', '${chain}') as r`],
    ['finance_home', 'select public.finance_home() as r'],
    ['finance_export (366 days)', `select public.finance_export('worcester', date '${today}' - 365, '${today}') as r`],
    ['finance_export_preview (366 days)', `select public.finance_export_preview('shrewsbury', date '${today}' - 365, '${today}') as r`],
    ['finance_settings_get', 'select public.finance_settings_get() as r'],
  ];
  const timed = async (label, sql, params = []) => {
    try {
      await db.exec('set role authenticated;');
      const t = performance.now();
      const r = await db.query(sql, params);
      const ms = Math.round(performance.now() - t);
      const status = r.rows[0].r?.status;
      record(`${tag} ${label} under 2 s`, status === 'ok' && ms < 2000, `${ms} ms, ${status}`);
      return r.rows[0].r;
    } catch (error) {
      record(`${tag} ${label} under 2 s`, false, error.message);
      return null;
    } finally {
      await db.exec('reset role;').catch(() => {});
    }
  };
  const answers = {};
  for (const [label, sql] of calls) answers[label] = await timed(label, sql);
  // ... and the answers must be RIGHT, not just fast
  const day = answers['finance_day (a busy day)'];
  const items = day?.items ?? [];
  const counting = items.filter((i) => ['counted', 'edited', 'moved_in'].includes(i.state));
  const paySum = counting.filter((i) => i.kind === 'payment').reduce((n, i) => n + i.amount_cents, 0);
  const allSum = counting.reduce((n, i) => n + i.amount_cents, 0);
  // (0018: private testing payments of that school and day too, when 0014 is there)
  const hasPrivate = await one(db, `select to_regclass('public.testing_private_payments') is not null`);
  const privateRows = hasPrivate ? Number(await one(db, `select count(*) from public.testing_private_payments p
      join public.testing_private t on t.id = p.private_id
     where t.location_code = 'worcester' and p.kind = 'payment' and p.moved_from_payment_id is null and p.paid_on = '${busy}'`)) : 0;
  const expectedRows = privateRows + Number(await one(db, `select count(*) from public.testing_payments p
      join public.testing_registrations r on r.id = p.registration_id join public.testing_events e on e.id = r.event_id
     where e.location_code = 'worcester' and p.kind = 'payment' and p.paid_on = '${busy}'`))
    + Number(await one(db, `select count(*) from public.star_payments p join public.star_candidates c on c.id = p.candidate_id
     where c.location_code = 'worcester' and p.kind in ('payment', 'refund') and p.paid_on = '${busy}'`));
  record(`${tag} the answer for the busy day is right (items, totals add up)`,
    items.length > 0 && day.totals.count === counting.filter((i) => i.kind === 'payment').length
      && day.totals.in_cents === paySum && day.totals.total_cents === allSum && items.length <= expectedRows,
    `${items.length} items (${expectedRows} payment / refund rows that day), count ${day?.totals?.count}, total ${day?.totals?.total_cents}`);
  const exportRows = answers['finance_export (366 days)']?.rows ?? [];
  record(`${tag} the year export has rows from both sources`,
    exportRows.some((r) => r.what === 'color_belt') && exportRows.some((r) => r.what === 'star'), `${exportRows.length} rows`);
  const preview = answers['finance_export_preview (366 days)'];
  record(`${tag} the year preview counts something`, (preview?.count ?? 0) > 100, JSON.stringify(preview));
  // Close the busy day with what it expects
  await db.exec('set role authenticated;');
  const d = (await db.query(`select public.finance_day('worcester', '${busy}') as r`)).rows[0].r;
  await db.exec('reset role;');
  await timed('finance_close_day (a busy day)', `select public.finance_close_day('worcester', '${busy}', $1, $2, $3, $4, $5, 'speed check') as r`,
    [d.fingerprint, d.totals.cash.cents + d.refunds.cash_cents, d.totals.check.count, d.totals.check.cents, d.totals.card.cents]);
  await db.query(`select set_config('request.jwt.claims', '', false)`);
}


// 14h. Old vs new: the same data through the production copy of 0011 and
// then through today's 0011 must give the same answers. Items are written
// as text, sorted byte by byte (collate "C").
const ITEM_TEXT = `concat_ws('|', m.school, m.source, m.payment_id, m.row_id, m.day, m."time", m.state, m.kind,
                    m.method, m.amount_cents, m.was_amount_cents, m.was_method, m.moved_to, m.moved_from, m.changed_by_name,
                    m.changed_on, m.recorded_by_name, m.first_name, m.last_name, m.what, m.event_date, m.is_private, m.counts,
                    m.first_recorded_at, m.event_id)`;
const ITEM_ORDER = `concat_ws('|', m.school, m.payment_id, m.row_id, m.state, m.day) collate "C"`;

// One line per day: every 7th day of 5 years, plus every day on which a
// chain-seed payment or refund is dated.
const DAY_SIGNATURE_SQL = `
  with days as (
    select d.d::date as day
      from generate_series(public.testing_today() - 1825, public.testing_today(), interval '7 days') as d(d)
    union
    select p.paid_on from public.testing_payments p join public.testing_registrations r on r.id = p.registration_id
     where r.first_name = 'Chain' and p.kind <> 'reversal'
    union
    select p.paid_on from public.star_payments p join public.star_candidates c on c.id = p.candidate_id
     where c.first_name = 'Chain' and p.kind <> 'reversal'
  )
  select x.day::text as day,
         (select coalesce(string_agg(${ITEM_TEXT}, ',' order by ${ITEM_ORDER}), '')
            from public.finance_money_rows(null, x.day, x.day) m) as items,
         (select count(*)::int from public.finance_money_rows(null, x.day, x.day) m) as n,
         (select string_agg(to_jsonb(f)::text, ',' order by f.school collate "C")
            from public.finance_figures(null, x.day, x.day) f) as figures
    from days x
   order by x.day`;

// One 366-day range: every item, and the figures of every school day.
const RANGE_SIGNATURE_SQL = `
  with m as materialized (
    select * from public.finance_money_rows(null, public.testing_today() - 365, public.testing_today())
  )
  select (select coalesce(string_agg(${ITEM_TEXT}, ',' order by ${ITEM_ORDER}), '') from m) as items,
         (select count(*)::int from m) as n,
         (select string_agg(to_jsonb(f)::text, ',' order by f.day, f.school collate "C")
            from public.finance_figures(null, public.testing_today() - 365, public.testing_today()) f) as figures`;

// About 50 chain starts of both sources, mostly the long chains (and the
// hidden mis-click, which must be not_found both times).
const DETAIL_IDS_SQL = `
  (select 'color_belt' as src, p.id::text as id
     from public.testing_payments p join public.testing_registrations r on r.id = p.registration_id
    where r.first_name = 'Chain' and p.kind = 'payment' and p.recorded_by_name = 'Staff'
      and (split_part(r.last_name, ' ', 2)::integer % 17 = 0 or split_part(r.last_name, ' ', 2)::integer % 19 = 0
           or split_part(r.last_name, ' ', 2)::integer % 23 = 0)
    order by p.id limit 26)
  union all
  (select 'star', p.id::text
     from public.star_payments p join public.star_candidates c on c.id = p.candidate_id
    where c.first_name = 'Chain'
      and ((p.kind = 'payment' and p.recorded_by_name = 'Staff'
            and (split_part(c.last_name, ' ', 2)::integer % 17 = 0 or split_part(c.last_name, ' ', 2)::integer % 19 = 0
                 or split_part(c.last_name, ' ', 2)::integer % 23 = 0 or split_part(c.last_name, ' ', 2)::integer % 29 = 0))
           or p.kind = 'refund')
    order by p.id limit 26)`;

// Sign in as the pretend admin on this database: a session, unlocked, with
// a fresh password sign-in (the same as the test files do).
async function adminSession(db) {
  const sid = '44444444-4444-4444-8444-444444444444';
  await db.exec(`insert into auth.sessions (id, user_id) values ('${sid}', '${ADMIN_UID}');
    insert into public.session_unlock (session_id, staff_id, unlocked_until) values ('${sid}', '${ADMIN_UID}', now() + interval '1 hour');`);
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: ADMIN_UID, role: 'authenticated',
    session_id: sid, amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) - 60 }] })]);
}

// One function call as the signed-in admin (role authenticated).
async function asAdmin(db, sql, params = []) {
  await db.exec('set role authenticated;');
  try {
    return (await db.query(sql, params)).rows[0].r;
  } finally {
    await db.exec('reset role;').catch(() => {});
  }
}

const SETUP_TO_0010 = () => read('migrations', '0003_testing_classes_ranks.sql') + '\n' + builtInSeedSql() + '\n'
  + read('migrations', '0004_staff_accounts.sql') + '\n' + read('migrations', '0005_testing_events.sql') + '\n'
  + read('migrations', '0006_star_testing.sql') + '\n' + read('migrations', '0010_testing_results.sql') + '\n';
const OLD_0011 = () => readFileSync(path.join(here, 'fixtures', '0011_as_applied_2026-10-19.sql'), 'utf8');
const PERF_SEED = () => readFileSync(path.join(here, 'finance_perf_seed.sql'), 'utf8');
const CHAIN_SEED = () => readFileSync(path.join(here, 'finance_chain_seed.sql'), 'utf8');

async function financeOldVsNew() {
  // --- the big database: days + payment details
  const db = await buildBase('[old vs new] ');
  if (!db) return;
  if (!(await run(db, '[old vs new] 0003 - 0010 + the PRODUCTION copy of 0011 + the big seed + the chain seed',
    SETUP_TO_0010() + OLD_0011() + '\n' + PERF_SEED() + '\n' + CHAIN_SEED()))) return;
  const chainRows = await one(db, `select (select count(*) from public.testing_payments p join public.testing_registrations r
      on r.id = p.registration_id where r.first_name = 'Chain') + (select count(*) from public.star_payments p
      join public.star_candidates c on c.id = p.candidate_id where c.first_name = 'Chain')`);
  await adminSession(db);
  const ids = (await db.query(DETAIL_IDS_SQL)).rows;
  const detail = async () => {
    const out = [];
    for (const { src, id } of ids) {
      out.push(JSON.stringify(await asAdmin(db, 'select public.finance_payment_detail($1, $2::uuid) as r', [src, id])));
    }
    return out;
  };
  const t0 = Date.now();
  const daysBefore = (await db.query(DAY_SIGNATURE_SQL)).rows;
  const detailsBefore = await detail();
  const oldMs = Date.now() - t0;
  if (!(await run(db, '[old vs new] apply today\'s 0011 over it', read('migrations', '0011_finance.sql')))) return;
  const t1 = Date.now();
  const daysAfter = (await db.query(DAY_SIGNATURE_SQL)).rows;
  const detailsAfter = await detail();
  const newMs = Date.now() - t1;
  const items = daysBefore.reduce((n, r) => n + r.n, 0);
  const differ = daysBefore.filter((r, i) => JSON.stringify(r) !== JSON.stringify(daysAfter[i])).map((r) => r.day);
  record('[old vs new] the same items and figures on every 7th day of 5 years + every chain-seed day (both schools)',
    daysBefore.length > 300 && items > 1200 && daysAfter.length === daysBefore.length && differ.length === 0,
    `${daysBefore.length} days, ${items} items (chain seed: ${chainRows} payment rows); old ${oldMs} ms, new ${newMs} ms (incl. details)`
      + (differ.length ? `; DIFFER on ${differ.slice(0, 5).join(', ')}` : ''));
  const statuses = {};
  for (const d of detailsBefore) { const st = JSON.parse(d).status; statuses[st] = (statuses[st] ?? 0) + 1; }
  const detailDiffer = ids.filter((x, i) => detailsBefore[i] !== detailsAfter[i]).map((x) => `${x.src} ${x.id}`);
  const steps = detailsBefore.reduce((n, d) => n + (JSON.parse(d).history?.length ?? 0), 0);
  record('[old vs new] the same finance_payment_detail answers for about 50 chain starts (both sources)',
    ids.length >= 45 && (statuses.ok ?? 0) >= 40 && detailDiffer.length === 0,
    `${ids.length} ids (${ids.filter((x) => x.src === 'star').length} Star), statuses ${JSON.stringify(statuses)}, ${steps} history lines`
      + (detailDiffer.length ? `; DIFFER: ${detailDiffer.slice(0, 5).join(', ')}` : ''));
  await db.close();

  // --- the small database: the long chains only, Worcester, within a year
  const smallSeed = CHAIN_SEED().replace(/\r\n/g, '\n')
    .replaceAll('generate_series(1, 120) as g', 'unnest(array[17, 19, 23]) as g')
    .replaceAll('* 1820 / 120)', '* 10)')
    .replace("public.testing_new_public_code()\n  from public.locations l;",
             "public.testing_new_public_code()\n  from public.locations l where l.code = 'worcester';")
    .replace("as g\n where e.name = 'PGlite chain Star';", "as g\n where e.name = 'PGlite chain Star' and l.code = 'worcester';");
  const sp = await buildBase('[old vs new, small] ');
  if (!sp) return;
  if (!(await run(sp, '[old vs new, small] 0003 - 0010 + the PRODUCTION copy of 0011 + the long chains only (Worcester)',
    SETUP_TO_0010() + OLD_0011() + '\n' + smallSeed))) return;
  const smallRows = await one(sp, 'select (select count(*) from public.testing_payments) + (select count(*) from public.star_payments)');
  record('[old vs new, small] the small seed is small (the old builder can only handle a few dozen rows)',
    Number(smallRows) >= 20 && Number(smallRows) <= 40, `${smallRows} payment rows`);
  await adminSession(sp);
  // (the app's role may not call testing_today(), so the dates are looked up first)
  const spToday = await one(sp, 'select public.testing_today()::text');
  const exportSql = `select public.finance_export('worcester', date '${spToday}' - 365, '${spToday}') as r`;
  const t2 = Date.now();
  const rangeBefore = (await sp.query(RANGE_SIGNATURE_SQL)).rows[0];
  const exportBefore = await asAdmin(sp, exportSql);
  const oldRangeMs = Date.now() - t2;
  if (!(await run(sp, '[old vs new, small] apply today\'s 0011 over it', read('migrations', '0011_finance.sql')))) return;
  const t3 = Date.now();
  const rangeAfter = (await sp.query(RANGE_SIGNATURE_SQL)).rows[0];
  const exportAfter = await asAdmin(sp, exportSql);
  const newRangeMs = Date.now() - t3;
  const states = {};
  for (const r of exportBefore?.rows ?? []) states[r.state] = (states[r.state] ?? 0) + 1;
  record('[old vs new] the same items and figures for one 366-day range (both schools)',
    rangeBefore.n >= 10 && JSON.stringify(rangeBefore) === JSON.stringify(rangeAfter),
    `${smallRows} payment rows, ${rangeBefore.n} items before, ${rangeAfter.n} after`);
  record('[old vs new] the same 366-day Worcester export rows',
    exportBefore?.status === 'ok' && (exportBefore.rows?.length ?? 0) >= 10
      && JSON.stringify(exportBefore.rows) === JSON.stringify(exportAfter?.rows),
    `${exportBefore?.rows?.length} rows, states ${JSON.stringify(states)}; old ${oldRangeMs} ms, new ${newRangeMs} ms`);
  await sp.close();
}

// 14i. A database that sorts text like production (ICU "en-US").
// PGlite's own database sorts byte by byte ("C"); a second database in the
// same PGlite folder can be made with ICU sorting and opened instead.
async function financeIcuCheck() {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const os = await import('node:os');
  const dir = mkdtempSync(path.join(os.tmpdir(), 'tkd-pglite-icu-'));
  let db = null;
  try {
    const maker = new PGlite({ dataDir: dir, extensions: { pgcrypto } });
    await maker.exec(`create database tkd_icu template template0 encoding 'UTF8' locale_provider icu icu_locale 'en-US' locale 'C'`);
    await maker.close();
    db = new PGlite({ dataDir: dir, database: 'tkd_icu', extensions: { pgcrypto } });
    const order = await db.query(`select string_agg(x, ' ' order by x) as o from (values ('color_belt'), ('star'), ('~end')) as v(x)`);
    record('[icu] the database sorts text like production (~end first)', order.rows[0].o === '~end color_belt star', order.rows[0].o);
    if (!(await buildBase('[icu] ', db))) return;
    const ok = await run(db, '[icu] 0003 + seed + 0004 + 0005 + 0006 + 0010 + 0011',
      read('migrations', '0003_testing_classes_ranks.sql') + '\n' + builtInSeedSql() + '\n'
      + read('migrations', '0004_staff_accounts.sql') + '\n' + read('migrations', '0005_testing_events.sql') + '\n'
      + read('migrations', '0006_star_testing.sql') + '\n' + read('migrations', '0010_testing_results.sql') + '\n'
      + read('migrations', '0011_finance.sql'));
    if (!ok) return;
    await runTestFile(db, '[icu] 0011_tests.sql', '0011_tests.sql', 'ALL 0011 TESTS PASSED');
    if (await run(db, '[icu] 0013 + 0017 + 0014 + 0018', CAMPS_SQL() + MIGRATION_0014() + '\n' + MIGRATION_0018())) {
      await runTestFile(db, '[icu] 0018_tests.sql', '0018_tests.sql', 'ALL 0018 TESTS PASSED');
      await runTestFile(db, '[icu] 0011_tests.sql (after 0018)', '0011_tests.sql', 'ALL 0011 TESTS PASSED');
      await runTestFile(db, '[icu] camps\' 0017_tests.sql (after 0018)', CAMPS_TESTS, 'ALL 0017 TESTS PASSED');
    }
    await financeSpeedCheck(db, '[icu speed]');
  } catch (error) {
    record('[icu] the ICU-collation database', false, error.message);
  } finally {
    if (db) await db.close().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  }
}

// =====================================================================
// Step step0020: 0020 - current_session_id() reads only request.jwt.claims
// (rulebook v0.408)
// =====================================================================
const PLANTED_SESSION = '99999999-9999-4999-8999-999999999999';

// 19b / 19d. The attack: AS the family form's login, fill the legacy
// request.jwt.claim with a made-up token, then register through the
// public function (which empties request.jwt.claims and
// request.jwt.claim.sub, but not request.jwt.claim). Returns the
// session_id values of the history rows that registration wrote.
async function plantedSessionAttack(db, first) {
  const mark = await one(db, 'select coalesce(max(id), 0)::bigint from public.change_log');
  const rank = await db.query(`select k.id from public.testing_event_ranks k
      join public.testing_event_classes c on c.id = k.event_class_id
      join public.testing_events e on e.id = c.event_id
     where e.public_code = '${TEST_EVENT_CODE}' order by c.position, k.position limit 1`);
  if (rank.rows.length !== 1) throw new Error('the test event (step 11c) has no rank');
  let status;
  try {
    await db.exec('set role testing_registrar;');
    await db.query(`select set_config('request.jwt.claim', $1, false)`,
      [JSON.stringify({ sub: ADMIN_UID, role: 'authenticated', session_id: PLANTED_SESSION })]);
    const r = await db.query(
      'select public.testing_public_register($1, $2, gen_random_uuid(), $3, $4, $5::uuid, $6, true, $7, $8) as r',
      [TEST_EVENT_CODE, 'pglite-attack-' + first, first, 'Planted', rank.rows[0].id, 'cash', TEST_SIGNATURE, ACK_VERSION]);
    status = r.rows[0].r?.status;
  } finally {
    await db.exec('reset role;').catch(() => {});
    await db.exec(`select set_config('request.jwt.claim', '', false);`).catch(() => {});
  }
  if (status !== 'ok') throw new Error(`testing_public_register said ${status}`);
  const rows = await db.query(`select session_id::text as s from public.change_log where id > ${mark}`);
  return rows.rows.map((r) => r.s);
}

// step0020 on the main database (after 13g) and 0020 on top of the upgrade
// database. Returns 0020's fingerprints (null if 0020 could not be applied).
async function step0020(db, upgradeDb) {
  const migration = read('migrations', '0020_session_id_claims.sql');
  const printsText = read('tests', '0020_fingerprints.sql');
  // a. connector-safe files, and the fingerprint before 0020
  record('[0020] 0020_fingerprints.sql contains neither "delete" nor "drop" (connector-safe)', !/delete|drop/i.test(printsText));
  record('[0020] the migration contains neither "delete" nor "drop"', !/delete|drop/i.test(migration));
  const before = await fingerprints(db, '0020_fingerprints.sql');
  record("[0020] fingerprint before 0020 (0001's version) taken", before.length === 1, before.join(' | '));

  // b. the attack before the fix
  try {
    const s = await plantedSessionAttack(db, 'Before');
    record('[0020] BEFORE the fix the planted session id reaches change_log (finding reproduced)',
      s.length > 0 && s.every((x) => x === PLANTED_SESSION), `${s.length} rows: ${[...new Set(s)].join(',')}`);
  } catch (error) {
    record('[0020] BEFORE the fix the planted session id reaches change_log (finding reproduced)', false, error.message);
  }

  // c. apply + tests
  if (!(await run(db, 'apply 0020_session_id_claims.sql', migration))) return null;
  await runTestFile(db, '0020_tests.sql', '0020_tests.sql', 'ALL 0020 TESTS PASSED');
  await runTestFile(db, 'verify_pin_tests.sql (after 0020)', 'verify_pin_tests.sql', 'ALL PIN TESTS PASSED');
  await runTestFile(db, '0002_tests.sql (after 0020)', '0002_tests.sql', 'ALL 0002 TESTS PASSED');
  await runTestFile(db, '0003_tests.sql (after 0020)', '0003_tests.sql', 'ALL 0003 TESTS PASSED');
  await runTestFile(db, '0004_tests.sql (after 0020)', '0004_tests.sql', 'ALL 0004 TESTS PASSED');
  await runTestFile(db, '0005_tests.sql (after 0020)', '0005_tests.sql', 'ALL 0005 TESTS PASSED');
  await runTestFile(db, '0011_tests.sql (after 0020)', '0011_tests.sql', 'ALL 0011 TESTS PASSED');
  const after = await fingerprints(db, '0020_fingerprints.sql');
  const tail = (line, key) => line.slice(line.indexOf(key));
  record('[0020] the body changed; owner and rights unchanged',
    after.length === 1 && after[0] !== before[0] && tail(after[0], ' owner=') === tail(before[0], ' owner='),
    after.join(' | '));

  // d. the attack after the fix
  try {
    const s = await plantedSessionAttack(db, 'After');
    record('[0020] AFTER the fix the planted session id is ignored (history rows have session_id NULL)',
      s.length > 0 && s.every((x) => x === null), `${s.length} rows: ${[...new Set(s)].join(',')}`);
  } catch (error) {
    record('[0020] AFTER the fix the planted session id is ignored (history rows have session_id NULL)', false, error.message);
  }

  // e. re-run safety
  const count1 = await one(db, 'select count(*)::int from public.change_log');
  await run(db, 'apply 0020 a SECOND time (re-run safety)', migration);
  const count2 = await one(db, 'select count(*)::int from public.change_log');
  record('[0020] re-run left the history count unchanged', count1 === count2, `${count1} -> ${count2}`);
  const again = await fingerprints(db, '0020_fingerprints.sql');
  record('[0020] fingerprint identical before/after re-run', JSON.stringify(again) === JSON.stringify(after));
  await runTestFile(db, '0020_tests.sql (after re-run)', '0020_tests.sql', 'ALL 0020 TESTS PASSED');

  // f. the undo (SETUP section 0020e), exactly as written there, then redo
  const setup = read('SETUP.md').replace(/\r\n/g, '\n');
  const block = setup.slice(setup.indexOf('### 0020e.')).match(/```sql\n([\s\S]*?)```/);
  if (!block) {
    record('[undo 0020] find the undo script in SETUP section 0020e', false, 'no sql block after "### 0020e."');
  } else if (await run(db, '[undo 0020] the SQL block of SETUP 0020e', block[1])) {
    const undone = await fingerprints(db, '0020_fingerprints.sql');
    record("[undo 0020] fingerprint equals 0001's version (before 0020)", JSON.stringify(undone) === JSON.stringify(before), undone.join(' | '));
    await runTestFile(db, '[undo 0020] verify_pin_tests.sql', 'verify_pin_tests.sql', 'ALL PIN TESTS PASSED');
    await runTestFile(db, '[undo 0020] 0002_tests.sql', '0002_tests.sql', 'ALL 0002 TESTS PASSED');
    if (await run(db, '[undo 0020] apply 0020 again (redo)', migration)) {
      const redone = await fingerprints(db, '0020_fingerprints.sql');
      record('[undo 0020] after redo the fingerprint equals the first apply', JSON.stringify(redone) === JSON.stringify(after));
      await runTestFile(db, '[undo 0020] 0020_tests.sql (after redo)', '0020_tests.sql', 'ALL 0020 TESTS PASSED');
    }
  }

  // g. the upgrade database (still has every migration up to 0014)
  const has0014 = upgradeDb ? await one(upgradeDb, `select to_regclass('public.testing_private') is not null`) : false;
  if (!upgradeDb || !has0014) {
    record('[upgrade] 0020 on top of the upgrade database', false, 'the upgrade database has no 0014 (see the lines above)');
  } else {
    await runTestFile(upgradeDb, '[upgrade] 0006_tests.sql (before 0020)', '0006_tests.sql', 'ALL 0006 TESTS PASSED');
    if (await run(upgradeDb, '[upgrade] apply 0020 on top', migration)) {
      const up = await fingerprints(upgradeDb, '0020_fingerprints.sql');
      record('[upgrade] 0020 fingerprint identical to the main database', JSON.stringify(up) === JSON.stringify(after), up.join(' | '));
      for (const [file, passed] of [
        ['0020_tests.sql', 'ALL 0020 TESTS PASSED'], ['0014_tests.sql', 'ALL 0014 TESTS PASSED'],
        ['0010_tests.sql', 'ALL 0010 TESTS PASSED'], ['0006_tests.sql', 'ALL 0006 TESTS PASSED'],
        ['0005_tests.sql', 'ALL 0005 TESTS PASSED'], ['0004_tests.sql', 'ALL 0004 TESTS PASSED'],
        ['0003_tests.sql', 'ALL 0003 TESTS PASSED'], ['0002_tests.sql', 'ALL 0002 TESTS PASSED'],
        ['verify_pin_tests.sql', 'ALL PIN TESTS PASSED'],
      ]) {
        await runTestFile(upgradeDb, `[upgrade] ${file} (after 0020)`, file, passed);
      }
    }
  }
  return after;
}

// ---------------------------------------------------------------------
// Step 16: Finance + Color Belt private testing (0018)
// ---------------------------------------------------------------------

// 0014: the real file once it is on this branch, else the live copy.
const MIGRATION_0014 = () => existsSync(path.join(supabaseDir, 'migrations', '0014_testing_private.sql'))
  ? read('migrations', '0014_testing_private.sql')
  : readFileSync(path.join(here, 'fixtures', '0014_testing_private_as_live.sql'), 'utf8');

// Camps' 0013 + 0017 (camp payments in Finance): on production they come
// between 0011 and 0014. The real files once they are on this branch, else
// the exact copies from git fb4ec24.
const CAMPS_FILES = () => [
  ['0013_camps.sql', '0013_camps_at_fb4ec24.sql'],
  ['0017_finance_camps.sql', '0017_finance_camps_at_fb4ec24.sql'],
].map(([real, copy]) => (existsSync(path.join(supabaseDir, 'migrations', real))
  ? path.join(supabaseDir, 'migrations', real) : path.join(here, 'fixtures', copy)));
const CAMPS_SQL = () => CAMPS_FILES().map((f) => readFileSync(f, 'utf8') + '\n').join('');
const CAMPS_0013 = () => readFileSync(CAMPS_FILES()[0], 'utf8');
const CAMPS_0017 = () => readFileSync(CAMPS_FILES()[1], 'utf8');
// camps' 0017_tests.sql (relative to supabase/tests, as runTestFile wants)
const CAMPS_TESTS = existsSync(path.join(supabaseDir, 'tests', '0017_tests.sql'))
  ? '0017_tests.sql' : path.join('pglite', 'fixtures', '0017_tests_at_fb4ec24.sql');
const CAMPS_PERF_SEED = () => readFileSync(existsSync(path.join(here, 'finance_camps_perf_seed.sql'))
  ? path.join(here, 'finance_camps_perf_seed.sql') : path.join(here, 'fixtures', 'finance_camps_perf_seed_at_fb4ec24.sql'), 'utf8');

// 0018 (it refuses to run before camps' 0017 - its guard)
const MIGRATION_0018 = () => read('migrations', '0018_finance_private.sql');

// The 0014 + 0018 tables, plus the history's row count, as one md5.
const snapshot18Sql = `select md5(${['testing_private', 'testing_private_payments', ...FINANCE_TABLES].map((t) =>
  `coalesce((select string_agg(to_jsonb(x)::text, ',' order by x.id) from public.${t} x), '')`).join(' || ')}
  || (select count(*) from public.change_log)::text)`;

async function step0018() {
  // 0018a.
  record('0018_fingerprints.sql contains neither "delete" nor "drop" (connector-safe)',
    !/delete|drop/i.test(read('tests', '0018_fingerprints.sql')));
  record('[0018] camps 0013 + 0017 from ' + CAMPS_FILES().map((f) => path.basename(f)).join(', '), true);

  // 0018b. database 1, no payments
  const db = await buildBase('[0018] ');
  if (!db) return null;
  if (!(await run(db, '[0018] 0003 - 0010 + 0011 + 0014', SETUP_TO_0010() + read('migrations', '0011_finance.sql') + '\n'
    + MIGRATION_0014()))) return null;
  // the guard: without camps' 0017, 0018 stops and changes nothing
  let refused = '';
  try {
    await db.exec(MIGRATION_0018());
  } catch (error) {
    refused = error.message;
    await db.exec('rollback;').catch(() => {});
  }
  record('[0018] the guard refuses 0018 before camps\' 0017 (it stops, nothing changes)',
    refused.includes("must be applied after camps' 0017")
      && (await one(db, `select to_regclass('public.finance_testing_private_payments_paid_on_idx') is null`)) === true,
    refused || 'it ran');
  if (!(await run(db, '[0018] camps\' 0013 + 0017', CAMPS_SQL()))) return null;
  await runTestFile(db, '[0018] camps\' 0017_tests.sql (before 0018)', CAMPS_TESTS, 'ALL 0017 TESTS PASSED');
  // the guard's other branches, each inside a transaction that is rolled
  // back: (1) 0011 without its speed fix (its paid_on index missing);
  // (2) one of the three shared functions not what camps' 0017 at fb4ec24
  // made (here finance_payment_detail with one word changed)
  const guardTry = async (label, before, wanted) => {
    const detailBefore = await one(db, `select md5(p.prosrc) from pg_proc p where p.proname = 'finance_payment_detail'`);
    let message = '';
    try {
      await db.exec('begin;\n' + before + '\n' + MIGRATION_0018());
    } catch (error) {
      message = error.message;
    }
    await db.exec('rollback;').catch(() => {});
    record(`[0018] the guard refuses 0018 when ${label} (it stops, nothing changes)`,
      message.includes(wanted)
        && (await one(db, `select to_regclass('public.finance_testing_private_payments_paid_on_idx') is null`)) === true
        && (await one(db, `select to_regclass('public.finance_testing_payments_paid_on_idx') is not null`)) === true
        && (await one(db, `select md5(p.prosrc) from pg_proc p where p.proname = 'finance_payment_detail'`)) === detailBefore,
      message || 'it ran');
  };
  await guardTry('0011 has no speed fix', 'drop index public.finance_testing_payments_paid_on_idx;', 'speed fix');
  const t17 = CAMPS_0017().replace(/\r\n/g, '\n');
  const at = t17.indexOf('create or replace function public.finance_payment_detail(');
  const changedDetail = t17.slice(at, t17.indexOf('$$;', t17.indexOf('as $$', at)) + 3)
    .replace("'status', 'no_access'", "'status', 'no_access_changed'");
  await guardTry('the live 0017 differs from fb4ec24 (finance_payment_detail changed)', changedDetail, 'rebuild 0018 first');
  const earlier = async () => [
    ...(await fingerprints(db, '0003_fingerprints.sql')), ...(await fingerprints(db, '0004_fingerprints.sql')),
    ...(await fingerprints(db, '0005_fingerprints.sql')), ...(await fingerprints(db, '0006_fingerprints.sql')),
    ...(await fingerprints(db, '0010_fingerprints.sql'))];
  const earlierBefore = await earlier();
  if (!(await run(db, '[0018] apply 0018_finance_private.sql', MIGRATION_0018()))) return null;
  record('[0018] 0003 / 0004 / 0005 / 0006 / 0010 fingerprints identical before/after 0018',
    JSON.stringify(earlierBefore) === JSON.stringify(await earlier()), `${earlierBefore.length} rows`);
  const t0 = Date.now();
  await runTestFile(db, '[0018] 0018_tests.sql (no payments)', '0018_tests.sql', 'ALL 0018 TESTS PASSED');
  record('[0018] 0018_tests.sql finished in under 60 seconds', Date.now() - t0 < 60000, `${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await runTestFile(db, '[0018] 0011_tests.sql (after 0018)', '0011_tests.sql', 'ALL 0011 TESTS PASSED');
  await runTestFile(db, '[0018] camps\' 0017_tests.sql (after 0018)', CAMPS_TESTS, 'ALL 0017 TESTS PASSED');
  // 0018's camp blocks = 0017's, byte for byte (also checked by build_0018.py)
  const campBlocks = (text) => (text.replace(/\r\n/g, '\n').match(/-- ===== source: camp \(0017\) =====[\s\S]*?-- ===== end camp =====/g) ?? []);
  const in17 = campBlocks(CAMPS_0017());
  const in18 = campBlocks(MIGRATION_0018());
  record('[0018] every camp block of 0018 is one of 0017\'s, byte for byte',
    in18.length > 0 && in18.every((b) => in17.includes(b)), `${in18.length} camp blocks in 0018, ${in17.length} in 0017`);
  const before18 = await fingerprints(db, '0018_fingerprints.sql');
  const dataBefore = await one(db, snapshot18Sql);
  await run(db, '[0018] apply 0018 a SECOND time (re-run safety)', MIGRATION_0018());
  record('[0018] re-run kept every row unchanged (private testings + payments, finance tables, change_log)',
    dataBefore === (await one(db, snapshot18Sql)));
  const after18 = await fingerprints(db, '0018_fingerprints.sql');
  record('[0018] 0018 fingerprints identical before/after re-run', JSON.stringify(before18) === JSON.stringify(after18),
    `${after18.length} rows`);
  await runTestFile(db, '[0018] 0018_tests.sql (after re-run)', '0018_tests.sql', 'ALL 0018 TESTS PASSED');
  await db.close();

  // 0018c. database 2: 0017 vs 0018 on the big seed + chain seed + camps (no private rows)
  const db2 = await buildBase('[0018 vs 0017] ');
  if (!db2) return after18;
  if (!(await run(db2, '[0018 vs 0017] 0003 - 0010 + 0011 + 0013 + 0017 + 0014 + the big seed + the chain seed + camps\' big seed',
    SETUP_TO_0010() + read('migrations', '0011_finance.sql') + '\n' + CAMPS_SQL() + MIGRATION_0014() + '\n'
    + PERF_SEED() + '\n' + CHAIN_SEED() + '\n' + CAMPS_PERF_SEED()))) return after18;
  await adminSession(db2);
  const signatureSql = DAY_SIGNATURE_SQL.replace('to_jsonb(f)::text', `(to_jsonb(f) - 'fingerprint')::text`);
  const ids = (await db2.query(DETAIL_IDS_SQL + `
  union all
  (select 'camp', p.id::text from public.camp_payments p where p.kind = 'payment' order by p.id limit 12)`)).rows;
  const campDays = await one(db2, `select count(distinct p.paid_on) from public.camp_payments p`);
  const details = async () => {
    const out = [];
    for (const { src, id } of ids) out.push(JSON.stringify(await asAdmin(db2, 'select public.finance_payment_detail($1, $2::uuid) as r', [src, id])));
    return out;
  };
  const daysBefore = (await db2.query(signatureSql)).rows;
  const detailsBefore = await details();
  if (!(await run(db2, '[0018 vs 0017] apply 0018 over it', MIGRATION_0018()))) return after18;
  const daysAfter = (await db2.query(signatureSql)).rows;
  const detailsAfter = await details();
  const items = daysBefore.reduce((n, r) => n + r.n, 0);
  const differ = daysBefore.filter((r, i) => JSON.stringify(r) !== JSON.stringify(daysAfter[i])).map((r) => r.day);
  const campItems = daysBefore.reduce((n, r) => n + (r.items.match(/\|camp\|/g) ?? []).length, 0);
  record('[0018 vs 0017] the same items and figures (without the fingerprint) on 5 years of days, camps included, no private rows',
    daysBefore.length > 300 && items > 1200 && campItems > 100 && differ.length === 0,
    `${daysBefore.length} days, ${items} items (${campItems} camp items; camp payments on ${campDays} days)`
      + (differ.length ? `; DIFFER on ${differ.slice(0, 5).join(', ')}` : ''));
  const detailDiffer = ids.filter((x, i) => detailsBefore[i] !== detailsAfter[i]).map((x) => `${x.src} ${x.id}`);
  record('[0018 vs 0017] the same payment details for about 60 chain starts (Color Belt, Star, camp)',
    ids.length >= 55 && ids.some((x) => x.src === 'camp') && detailDiffer.length === 0,
    `${ids.length} ids (${ids.filter((x) => x.src === 'camp').length} camp)` + (detailDiffer.length ? `; DIFFER: ${detailDiffer.slice(0, 5).join(', ')}` : ''));

  // 0018d. private rows on database 2: the tests, then speed
  if (!(await run(db2, '[0018 speed] private seed (finance_private_perf_seed.sql)',
    readFileSync(path.join(here, 'finance_private_perf_seed.sql'), 'utf8')))) return after18;
  const counts = (await db2.query(`select (select count(*)::int from public.testing_private_payments) as private_rows,
      (select count(*)::int from public.testing_private_payments where moved_from_payment_id is not null) as moved`)).rows[0];
  record('[0018 speed] the private seed: ~3,000 private payment rows, ~400 of them moves',
    counts.private_rows > 2000 && counts.moved > 300, JSON.stringify(counts));
  await db2.query(`select set_config('request.jwt.claims', '', false)`);
  await runTestFile(db2, '[0018] 0018_tests.sql (with the big seed and private rows)', '0018_tests.sql', 'ALL 0018 TESTS PASSED');
  await financeSpeedCheck(db2, '[0018 speed]', false);
  await db2.close();

  // 0018f. days closed BEFORE 0018 (under 0011's rules), then 0018
  await closesUnder0011();
  return after18;
}

// 0018f. Days closed while 0011 / 0017 (without private payments) were in force,
// then 0018 applied: which of them must show "changed after closing"?
//   A  a move BEFORE the close: under 0011 the money had left the event
//      and private money wasn't counted, so the close left it out; 0018
//      counts it -> a real difference -> changed
//   B  move + undo move BEFORE the close: under 0011 the payment showed
//      undone and the recreated row counted; 0018 joins them into one
//      chain, paired by the row id -> NOT changed
//   C  a private payment (no move) on a day closed under 0011 -> changed
//   D  (under 0018) a move, a close, then the EVENT deleted: the private
//      copy carries on as its own chain, paired by the row id -> NOT changed
async function closesUnder0011() {
  const db = await buildBase('[0018 closes] ');
  if (!db) return;
  if (!(await run(db, '[0018 closes] 0003 - 0010 + 0011 + (0013 + 0017) + 0014',
    SETUP_TO_0010() + read('migrations', '0011_finance.sql') + '\n' + CAMPS_SQL() + MIGRATION_0014()))) return;
  // test data written as the SQL Editor would: two Worcester events copied
  // from the seed's first class, five students, payments on past days
  const ok = await run(db, '[0018 closes] events, students, payments on four past days', `
    begin;
    select set_config('request.jwt.claims', '', true);
    select set_config('tkd.actor_label', 'PGlite closes', true);
    insert into public.testing_events (location_code, name, testing_date, registration_open, public_code)
    select 'worcester', 'PGlite closes ' || n, public.testing_today() + 30, false, public.testing_new_public_code()
      from generate_series(1, 2) as n;
    select public.testing_copy_class_into_event(e.id,
             (select c.id from public.testing_classes c where c.location_code = 'worcester'
                and (c.final_award_none or c.final_award_rank_id is not null) order by c.position limit 1),
             time '16:00', time '17:00')
      from public.testing_events e where e.name like 'PGlite closes %';
    insert into public.testing_registrations (event_id, event_rank_id, first_name, last_name, paying_by, stripes_confirmed, source)
    select e.id, (select k.id from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
                   where c.event_id = e.id order by k.position limit 1),
           'Close', v.last, 'cash', true, 'staff'
      from (values ('A', 1), ('B', 1), ('Q', 1), ('D', 2)) as v(last, ev)
      join public.testing_events e on e.name = 'PGlite closes ' || v.ev;
    insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
    select r.id, 'payment', v.amount, 'cash', public.testing_today() - v.ago,
           ((public.testing_today() - v.ago) + time '15:00') at time zone 'America/New_York',
           '22222222-2222-4222-8222-222222222222', 'Staff'
      from (values ('A', 7000, 40), ('Q', 5000, 40), ('B', 6000, 41), ('Q', 5000, 42), ('D', 6600, 43)) as v(last, amount, ago)
      join public.testing_registrations r on r.first_name = 'Close' and r.last_name = v.last;
    -- C: a private testing added by hand with a payment on day 42
    insert into public.testing_private (location_code, first_name, last_name, class_name, rank_name, belt_pattern, belt_color,
                                        belt_end_stripes, belt_end_stripe_color, to_kind, private_cents, paying_by,
                                        stripes_confirmed, private_date, private_time, created_by_name, updated_by_name)
    values ('worcester', 'Close', 'C', 'Perf class', 'White', 'solid', 'white', 0, 'yellow', 'none', 8500, 'cash', true,
            public.testing_today() + 3, time '10:00', '', '');
    insert into public.testing_private_payments (private_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
    select t.id, 'payment', 8500, 'cash', public.testing_today() - 42,
           ((public.testing_today() - 42) + time '12:00') at time zone 'America/New_York',
           '22222222-2222-4222-8222-222222222222', 'Staff'
      from public.testing_private t where t.first_name = 'Close' and t.last_name = 'C';
    select set_config('tkd.actor_label', '', true);
    commit;`);
  if (!ok) return;
  await adminSession(db);
  const today = await one(db, 'select public.testing_today()::text');
  const reg = async (last) => (await db.query(`select id::text, version from public.testing_registrations
      where first_name = 'Close' and last_name = $1`, [last])).rows[0];
  const day = (ago) => `date '${today}' - ${ago}`;
  const closeDay = async (ago) => {
    const d = await asAdmin(db, `select public.finance_day('worcester', ${day(ago)}) as r`);
    return asAdmin(db, `select public.finance_close_day('worcester', ${day(ago)}, $1, $2, $3, $4, $5, null) as r`,
      [d.fingerprint, d.totals.cash.cents + d.refunds.cash_cents, d.totals.check.count, d.totals.check.cents, d.totals.card.cents]);
  };
  const changed = async (ago) => {
    const d = await asAdmin(db, `select public.finance_day('worcester', ${day(ago)}) as r`);
    return `${d.closing?.changed_after}:${d.closing?.changed_count}`;
  };
  // A: move, then close (0011)
  let r = await reg('A');
  const movedA = await asAdmin(db, `select public.testing_move_to_private($1::uuid, $2, date '${today}' + 7, '17:00') as r`, [r.id, r.version]);
  // B: move + undo move, then close (0011)
  r = await reg('B');
  const movedB = await asAdmin(db, `select public.testing_move_to_private($1::uuid, $2, date '${today}' + 7, '17:00') as r`, [r.id, r.version]);
  const undoneB = await asAdmin(db, `select public.testing_private_undo_move($1::uuid, 1) as r`, [movedB?.private_id]);
  const closes = [await closeDay(40), await closeDay(41), await closeDay(42)];
  record('[0018 closes] moves and closes under 0011',
    movedA?.status === 'ok' && movedB?.status === 'ok' && undoneB?.status === 'ok' && closes.every((c) => c?.status === 'ok'),
    JSON.stringify([movedA?.status, movedB?.status, undoneB?.status, ...closes.map((c) => c?.status)]));
  // the pre-apply check (read-only) lists exactly those closed days,
  // oldest first: C (42 days ago, a private payment), B (41, an undone
  // move - no change), A (40, a move before the close)
  record('0018_preapply_check.sql contains neither "delete" nor "drop" (connector-safe)',
    !/delete|drop/i.test(read('tests', '0018_preapply_check.sql')));
  const pre = (await db.query(read('tests', '0018_preapply_check.sql'))).rows
    .map((x) => `${x.private_payments}/${x.moved_before_close}/${x.undone_moves}`);
  record('[0018 closes] the pre-apply check lists the three closed days (private / moved before close / undone moves)',
    JSON.stringify(pre) === JSON.stringify(['1/0/0', '0/0/1', '0/1/0']), JSON.stringify(pre));
  if (!(await run(db, '[0018 closes] apply 0018', MIGRATION_0018()))) return;
  record('[0018 closes] A: a move before a close of 0011\'s time -> changed (that close left the money out)',
    (await changed(40)) === 'true:1', await changed(40));
  record('[0018 closes] B: move + undo move before a close of 0011\'s time -> NOT changed', (await changed(41)) === 'false:0', await changed(41));
  record('[0018 closes] C: a private payment on a day closed under 0011 -> changed', (await changed(42)) === 'true:1', await changed(42));
  // D: under 0018 - move, close, then the event is deleted
  r = await reg('D');
  const movedD = await asAdmin(db, `select public.testing_move_to_private($1::uuid, $2, date '${today}' + 7, '17:00') as r`, [r.id, r.version]);
  const closeD = await closeDay(43);
  await run(db, '[0018 closes] D: the event is deleted after the move', `
    begin;
    select set_config('tkd.action', 'delete_event', true);
    delete from public.testing_events where name = 'PGlite closes 2';
    select set_config('tkd.action', '', true);
    commit;`);
  record('[0018 closes] D: an event deleted after a move (closed under 0018) -> NOT changed',
    movedD?.status === 'ok' && closeD?.status === 'ok' && (await changed(43)) === 'false:0', await changed(43));
  await db.close();
}

function finish() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed.`);
  if (failed.length) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
  }
  process.exitCode = failed.length ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
