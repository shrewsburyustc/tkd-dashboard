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
//   15. 0016 (Black Belt testing) on the main database, after step 14 and
//       before 13g (contract CONTRACT-0016.md section 11.4):
//         a. 0016_fingerprints.sql must not contain the words the Supabase
//            connection refuses
//         b. the fingerprints of every migration already on main (0003,
//            0004, 0005, 0006, 0010, 0011) are taken, 0016 is applied, and
//            they must be IDENTICAL afterwards (0016 changed none of them)
//         c. 0016_tests.sql, then every earlier test file again - all must
//            print their PASSED row unchanged
//         d. live checks AS bb_registrar: every table, the counter, writes,
//            staff functions, helpers, the register core, Color Belt's and
//            Star's public functions and CREATE are refused - also with an
//            admin's login token set in the session (no impersonation:
//            has_data_access() and every staff function stay refused); and
//            testing_registrar / star_registrar can't run Black Belt's two
//            public functions
//         e. a seeded Black Belt TEST cycle (made through the staff
//            functions as an unlocked admin), one family registration AS
//            bb_registrar with an admin's token set (still "Family form",
//            no login id); then 0016_tests.sql again (it must pass with
//            real-looking data too)
//         f. 0016 applied a SECOND time: nothing changed or lost, the 0016
//            fingerprints identical, 0016_tests.sql passes again
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
//   step0023. 0023 (Star result email texts + M5: star_update_event keeps
//       registration closed, rulebook v0.514 / v0.504) on its own
//       live-order database: 0023_fingerprints.sql is connector-safe;
//       only the star_update_event and star_results_csv lines of 0006's
//       fingerprints moves; 0023_tests + 0006_tests (+ 0003/0005) pass;
//       re-runs keep an admin's changed text and change no fingerprint;
//       the undo file (manual/0023u) gives back 0006's star_update_event
//       fingerprint, 0023 again restores it; a 0006 re-run then 0023
//       again gives the same fingerprints; a
//       minimal database (0003-0006 + 0023) gives the same fingerprints.
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
//   stepCamps. 0013 (Camps), on its OWN fresh database (the main one
//       ends with the 0010 down-script, so it no longer looks like
//       production): the live order of step0016_after_new_students up to
//       2026-10-20 (0001-0006, 0010, 0007, 0008, 0009, 0012, 0015, 0011 as
//       production got it, 0019, 0014, 0020), then 0013, its tests and
//       every earlier test file (0011's, the new-students', 0014's and
//       0020's included), live checks AS camps_registrar, a seeded TEST
//       camp, a second apply (re-run safety), 0017 on top (19b), and last
//       the "Undo 0013" script of SETUP.md - see stepCamps below.
//   stepFinanceCamps. 0017 (camp payments in Finance, v0.707): on the
//       MAIN database (after 0016, before 13g; 0013 put on first) every
//       Finance answer must be identical before and after 0017, its tests
//       + 0011's + 0013's pass, re-run safety, the "Undo 0017" of
//       SETUP.md; then two fresh databases with 0011's big seed + a big
//       camp seed for speed and right answers (one sorting text like
//       production) - see stepFinanceCamps below.
//   step0022. 0022 (camps weekly pricing and longer camps, v0.717) on its
//       own database in the production order with every live migration
//       and live-like camps made under the old rules: the data tidy-up,
//       which fingerprints may move, 0022's tests and the camps / Finance
//       tests after it, the camp form's login, re-run safety and the Undo
//       of SETUP.md 0022e - see step0022 below. Run only this step with
//       node run.mjs --only-step0022
//   step0016_after_new_students. 0016 on a database built in the
//       PRODUCTION order with EVERY live migration: 0001-0006, 0010, 0007,
//       0008, 0009, 0012, 0015, 0011 as production got it, 0019, 0014,
//       0020, camps' 0013 + 0017 (exact copies in fixtures/ until the real
//       files are on this branch), 0018: the other migrations'
//       fingerprints don't move, 0016_tests.sql and every earlier test
//       file pass (0014, camps' 0017, 0018 and 0020 included), the
//       bb_registrar live checks and a test cycle + registration work,
//       and 0016's fingerprints equal step 15's.
//   step0024. 0024 (Black Belt rubric editor, CONTRACT-0024 11.4) on the
//       MAIN database right after step 15: the earlier fingerprints, the
//       version-aware 0016_tests.sql before 0024, two cycles with version 1
//       sheets (one opened), 0024; every earlier fingerprint file
//       byte-identical except 0016's, which differs by exactly 11.3's list;
//       every cycle converted with no number changed; 0024_tests.sql and
//       every earlier test file; re-run safety; the default = the app's
//       rubricDefault.js; every case of 0024_rubric_cases.json; the
//       bb_registrar checks; time limits; on copies of the database the
//       "Undo 0024" block of SETUP 0024f (then 0016 and 0024 again) and the
//       "0016 re-run over 0024" detector - see step0024 below.
//   step0024_production_order. 0024 on a fresh database built in the
//       production order with every live migration (step0016_after_new_
//       students' order, then 0016 and 0021): every other fingerprint file
//       unchanged (0016's by exactly 11.3), every test file passes, 0024's
//       fingerprints equal step0024's.
//   step0025. 0025 (Black Belt grading and results, CONTRACT-0025 12.5)
//       on the MAIN database right after step0024: the earlier
//       fingerprints, the version-aware 0016_tests.sql / 0024_tests.sql
//       before 0025, 0025; every earlier fingerprint file byte-identical
//       except 0016's and 0024's, which differ by exactly 12.3's rows;
//       0025_tests.sql and every earlier test file; re-run safety; every
//       case of 0025_grading_cases.json through the SQL functions (each
//       full answer saved for src/lib/blackBelt/checks.mjs: the file named
//       by $BB_0025_SQL_ANSWERS, else <temp>/bb0025-sql-answers.json); on
//       copies: the undo script supabase/manual/0025u_undo.sql (refused
//       while real records exist; then 0016 / 0024 fingerprints back, their
//       tests pass, 0025 again) and the "0016 / 0024 re-run over 0025"
//       detector; the time limits on a big seed (12 cycles x 60) - see
//       step0025 below.
//   step0025_production_order. 0025 on a fresh database in the production
//       order with every live migration (0024's order, then 0024 and
//       0023): every other fingerprint file unchanged (0016's and 0024's
//       by exactly 12.3), every test file passes, 0025's fingerprints
//       equal step0025's.
//   step0027. 0027 (Edit camp refuses changes that break campers'
//       extras, v0.720) on its own database in the production order with
//       every live migration (0025's order, then 0025): only
//       camp_update_camp's fingerprint moves, 0027's tests and the camps
//       tests (0013, 0017, 0022) after it, re-run safety, and the Undo of
//       SETUP.md 0027e (manual/0027u) - see step0027 below. Run only this
//       step with   node run.mjs --only-step0027
//   step0029. 0029 (Finance: close-the-day reminder in 5-minute steps,
//       design-review F2 / M8) on its own database in the production
//       order with every live migration (0025's order, then 0027, then
//       0026): the guard refuses a changed function; only the
//       finance_reminder_time_is_valid line moves (body md5 only) in every
//       fingerprints file; a stored 15-minute time stays valid; 0029's
//       tests and the Finance tests after it; re-run safety - see step0029
//       below. Run only this step with   node run.mjs --only-step0029
//   step0037. 0037 (Finance: Export keeps "private" - finance_export's
//       rows carry is_private, design review pass 1) on its own database in
//       the production order (0025's order, then 0027, 0026, 0028, 0029,
//       0031, 0030, 0032, 0033, 0034, 0036, 0041, 0042, 0043, 0039): the
//       guard refuses a changed function; only the finance_export line
//       moves (code md5 only, 0026's -> 0037's) in every fingerprints
//       file; 0037's tests and the Finance tests after it; re-run safety -
//       see step0037 below. Run only this step with
//       node run.mjs --only-step0037
//   step0047. 0047 (Finance Batch A: payment lines count at the school
//       STORED ON THE PAYMENT, and was_school - design review pass 1 R1-01)
//       on its own database in the production order (0025's order, then
//       0027, 0026, 0028, 0029, 0031, 0030, 0032, 0033, 0034, 0036, 0041,
//       0042, 0043, 0039, 0037, then Color Belt's 0035 and 0044 and Star's
//       0038 - the real files when they are on this branch, else (for
//       0038 only) the stand-in fixtures/0047_standin_star_school.sql): the five functions are
//       the live text before; the guard refuses a changed function; only
//       those five functions' fingerprint lines move in every fingerprints
//       file; 0047's tests and the Finance / camps tests after it; re-run
//       safety - see step0047 below. Run only this step with
//       node run.mjs --only-step0047
//   step0028. 0028 (Star start times 6:00 AM - 10:00 PM every 5 minutes,
//       v1.019 / S12) on its own database in the production order with
//       every live migration (0025's order, then 0027 and 0026): the
//       pre-apply check, only star_start_time_is_valid's fingerprint
//       moves, 0028's tests and 0006's / 0023's after it, re-run safety,
//       and the Undo of SETUP.md 0028e (manual/0028u: refused with a
//       6:05 AM event, then back to 0006's rule) - see step0028 below.
//       Run only this step with   node run.mjs --only-step0028
//   step0031. 0031 (class ages on the booking forms, v0.619; classes
//       taught together as one time, v0.620) on its own database in the
//       production order with every live migration (step0027's order,
//       then 0027): the pre-apply check, only the ten replaced functions
//       move as planned and only 0031's new functions are added, 0031's
//       tests and the Schedule / Forms / Prospects tests,
//       re-run safety, and the Undo of SETUP.md 0031e (manual/0031u) - see
//       step0031 below. Run only this step with   node run.mjs --only-step0031
//   step0030. 0030 (Color Belt design review, database half, v0.418:
//       Mark paid with a way to pay, History, results CSV) on its own
//       database in the production order with every live migration
//       (step0031's order with 0026, then 0031): only the six replaced
//       bodies move (Undo payment, Edit payment, Move to private, Undo
//       move - v0.418 / v0.419) and only 0030's new functions / rule are
//       added, 0030's tests and the Color Belt + Finance tests (0005,
//       0010, 0014, 0018, 0026) before and after, re-run safety, and the
//       Undo of SETUP.md 0030e (manual/0030u) - see step0030 below. Run
//       only this step with   node run.mjs --only-step0030
//   step0032. 0032 (Black Belt: testing times every 5 minutes, BB13 /
//       v1.019; the candidate History reader, BB8; Edit cycle's Undo in
//       one call, refused when a family registered after the save) on its
//       own database in the production order with every live migration
//       (0025's order, then 0027, 0026, 0028, 0029, 0031): the pre-apply
//       check, only bb_time_is_valid's fingerprint moves and only the 3
//       new functions are added, 0032's tests and the Black Belt tests
//       (0016, 0024, 0025, 0026) after it, re-run safety, and the Undo of
//       SETUP.md 0032e (manual/0032u: refused with a 12:05 testing day,
//       then back to 0016's rule) - see step0032 below. Run only this
//       step with   node run.mjs --only-step0032
//   step0033. 0033 (Camps design review: Mark paid with a way to pay and
//       the Camper history line, v0.735 / v0.736) on its own database in
//       the production order with every live migration on this branch
//       (liveOrderTo0025, then 0027, 0026, 0028, 0029, 0031): the
//       pre-apply check, the backfill (no history row, no version moved),
//       only the planned 0013 / 0022 items move, the old app's 3-input
//       Mark paid as role authenticated (named and positional), 0033's
//       tests and the camps and Finance tests, the reader's speed on a
//       big history, re-run safety, and the Undo of SETUP.md 0033f
//       (manual/0033u) - see step0033 below. Run only this step with
//       node run.mjs --only-step0033
//   step0034. 0034 (Black Belt: every History row also carries record_id,
//       the logged row's own id, so a grade's correction joins to its
//       insert row; v0.971 / v0.972, BB8) on its own database in the
//       production order (liveOrderTo0025, then 0027, 0026, 0028, 0029,
//       0031, 0032, 0033): the pre-apply check, only bb_candidate_history's
//       body md5 moves (0016's and 0032's files), 0034's tests and the
//       Black Belt tests (0032, 0016, 0024, 0025, 0026) after it, re-run
//       safety, and the Undo of SETUP.md 0034e (manual/0034u, back to
//       0032's reader) - see step0034 below. Run only this step with
//       node run.mjs --only-step0034
//   step0035. 0035 (Color Belt clean-up: the old one-click Mark paid
//       functions testing_mark_paid / testing_private_mark_paid removed;
//       the app uses 0030's *_by) on its own database in the production
//       order (liveOrderTo0025, then 0027, 0026, 0028, 0029, 0031, 0030,
//       0032, 0033, 0034): the pre-apply check, the guard (refused without
//       0030, refused while something still calls an old one), only the
//       two old lines leave the fingerprint files, 0035's tests and the
//       Color Belt + Finance tests before / after, re-run safety, and the
//       Undo of SETUP.md 0035e (manual/0035u: both back byte for byte) -
//       see step0035 below. Run only this step with
//       node run.mjs --only-step0035
//   step0036. 0036 (New students: each child's last name and date of
//       birth, the Address question; v0.634 - v0.639) on its own database
//       in the production order (liveOrderTo0025, then 0027, 0026, 0028,
//       0029, 0031, 0030, 0032, 0033, 0034) with a form and a sign-up made
//       before it: the pre-apply check, exactly the planned fingerprint
//       lines move (8 bodies, the size rule, 2 new rules), nothing is
//       written, 0036's tests and the Forms / Prospects tests before and
//       after, re-run safety, and the Undo of SETUP.md 0036e
//       (manual/0036u: refused while something uses 0036, then back to
//       the earlier functions and rules) - see step0036 below. Run only
//       this step with   node run.mjs --only-step0036
//   step0041. 0041 (Star event end time, v0.520) on its own database in
//       the production order (liveOrderTo0025, then 0027, 0026, 0028,
//       0029, 0031, 0030, 0032, 0033, 0034, 0036) with a Star event made
//       before it: the pre-apply check, exactly the planned fingerprint
//       lines move (the five functions in 0006's / 0023's files, the
//       star_events column rights), nothing is written, 0041's tests and
//       the Star tests (0006, 0023, 0028) before and after, the old app's
//       calls without p_end_time, re-run safety, and the Undo of SETUP.md
//       0041f (manual/0041u: refused while an end time is saved, then
//       back to the earlier functions, no column) - see step0041 below.
//       Run only this step with   node run.mjs --only-step0041
//   step0042. 0042 (New students: "Copy to Worcester / Shrewsbury" -
//       forms_copy_to_school, a Draft copy at the other school; v0.642,
//       v0.644) on its own database in the production order
//       (liveOrderTo0025, then 0027, 0026, 0028, 0029, 0031, 0030, 0032,
//       0033, 0034, 0036, 0041)
//       with a form with booking times made before it: the pre-apply
//       check, only 0009's file gains the new function's two lines, 0042
//       writes nothing, 0042's tests and the Forms / Prospects tests
//       before and after, a copy made and kept, re-run safety, and the
//       Undo of SETUP.md 0042e (manual/0042u: the kept copy stays, every
//       fingerprint back to before 0042) - see step0042 below. Run only
//       this step with   node run.mjs --only-step0042
//   step0043. 0043 (Camps Fill in: staff sign up a walk-in family at the
//       desk, v0.740 / v0.741) on its own database in the production
//       order (liveOrderTo0025, then 0027, 0026, 0028, 0029, 0031, 0030,
//       0032, 0033, 0034, 0036, 0041) with a family sign-up made before
//       it: the pre-apply check, exactly the planned fingerprint lines
//       move (the core with two more inputs, the family form's function
//       and Camper detail in 0013's / 0022's files), nothing is written,
//       0043's tests and the camps tests (0013, 0017, 0018, 0022, 0026,
//       0027, 0033) before and after, the new functions as role
//       authenticated by name (anon and camps_registrar refused), and
//       re-run safety - see step0043 below. Run only this step with
//       node run.mjs --only-step0043
//   step0039. 0039 (Camps Record refund: money handed back is its own
//       refund row, at the desk that hands it back, v1.039 / v1.040 /
//       v0.743) on its own database in the production order
//       (liveOrderTo0025, then 0027, 0026, 0028, 0029, 0031, 0030, 0032,
//       0033, 0034, 0036, 0041, 0042, 0043) with a camper paid, then
//       overpaid, made before it: the pre-apply check, exactly the planned
//       fingerprint lines move (0013's guard, Undo / Edit payment and
//       roster; 0022's Edit payment and kind rule; 0033's Undo / Edit
//       payment and roster), nothing is written, 0039's tests and the
//       camps tests (0013, 0017, 0018, 0022, 0026, 0027, 0033, 0043)
//       before and after, the new functions as role authenticated by
//       name (anon and camps_registrar refused), and re-run safety - see
//       step0039 below. Run only this step with
//       node run.mjs --only-step0039
//   stepFinanceCampRefunds. Finance's R1-05 (design review pass 1): the
//       live Finance functions (0026) already handle a camp refund (Camps'
//       0039, kind 'refund'). On its own database in the production order
//       (liveOrderTo0025, then 0027, 0026, 0028, 0029, 0031, 0030, 0032,
//       0033, 0034, 0036, 0041, 0042, 0043, and Finance's 0037 - each only
//       if its file is on this branch), then 0039, then
//       finance_camp_refunds_tests.sql.
//       0039 is read from supabase/migrations/ when it is on this branch,
//       else from the file named by the environment variable
//       TKD_MIGRATION_0039 (a copy taken from the camps branch with
//       git show); with neither, the step is skipped (a line says so).
//       Run only this step with   node run.mjs --only-stepFinanceCampRefunds
//   step0044. 0044 (Color Belt rolling check, step A: the family form's
//       own Paying by - M-01; Edit event's Undo in one call - R2-02; each
//       payment's school - R1-01, v1.035) on its own database in the
//       production order (liveOrderTo0025, then 0027, 0026, 0028, 0029,
//       0031, 0030, 0032, 0033, 0034, 0036, 0041, 0042, 0043, 0039) with Color Belt
//       rows made before it: 0035 then 0044 both go in; the fill (form
//       rows from their history insert row, none without one), no history
//       row or version moved; only Color Belt fingerprint lines move
//       (0003, 0005, 0014, 0030 files); 0044's tests and the Color Belt +
//       Finance tests before and after; re-run safety; 0035 after 0044 is
//       refused by 0035's guard (known) - see step0044 below. Run only
//       this step with   node run.mjs --only-step0044
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
const onlyStep0022 = process.argv.includes('--only-step0022');
const onlyStep0026 = process.argv.includes('--only-step0026');
const onlyStep0027 = process.argv.includes('--only-step0027');
const onlyStep0029 = process.argv.includes('--only-step0029');
const onlyStep0028 = process.argv.includes('--only-step0028');
const onlyStep0031 = process.argv.includes('--only-step0031');
const onlyStep0030 = process.argv.includes('--only-step0030');
const onlyStep0032 = process.argv.includes('--only-step0032');
const onlyStep0033 = process.argv.includes('--only-step0033');
const onlyStep0034 = process.argv.includes('--only-step0034');
const onlyStep0035 = process.argv.includes('--only-step0035');
const onlyStep0036 = process.argv.includes('--only-step0036');
const onlyStep0041 = process.argv.includes('--only-step0041');
const onlyStep0042 = process.argv.includes('--only-step0042');
const onlyStep0043 = process.argv.includes('--only-step0043');
const onlyStep0039 = process.argv.includes('--only-step0039');
const onlyStep0044 = process.argv.includes('--only-step0044');
const onlyStepFinanceCampRefunds = process.argv.includes('--only-stepFinanceCampRefunds');
const onlyStep0037 = process.argv.includes('--only-step0037');
const onlyStep0047 = process.argv.includes('--only-step0047');

// Fixed ids for the two pretend logins (any uuid works).
const ADMIN_UID = '11111111-1111-4111-8111-111111111111';
const DESK_UID = '22222222-2222-4222-8222-222222222222';

// Collected results, printed as a summary at the end.
const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -  ' + detail : ''}`);
}

// Warnings: a check that is over its target but under its hard limit, where
// Jeffrey accepted the miss. It counts as passed, but is printed again in the
// summary so the number is seen on every run.
const warnings = [];
function warn(name, detail) {
  warnings.push({ name, detail });
  console.log(`WARN  ${name}  -  ${detail}`);
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

// Like runTestFile, but under the REAL project's rule for new functions. This runner's "hostile defaults"
// (buildBase) give everybody EXECUTE on every new function; production does not: its default rights for
// functions made by postgres, in any schema, are postgres only (pg_default_acl on tkd-dashboard,
// {postgres=X/postgres}, checked 2026-11-07). So a test helper made in the temp schema (t_eq ...) can only be
// called as postgres, never under "set local role authenticated". The first 0044_tests.sql called one there
// (F1, F2, P2) and failed on production with "permission denied for function t_eq" while PGlite let it pass.
// The 0035 and 0044 steps run their test files through this; other sections' steps still use runTestFile.
async function runTestFileLive(db, label, file, passedText) {
  await db.exec('alter default privileges for role postgres revoke execute on functions from public;');
  try {
    await runTestFile(db, label, file, passedText);
  } finally {
    await db.exec('alter default privileges for role postgres grant execute on functions to public;').catch(() => {});
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
  // --only-step0022: just the camps weekly-pricing step (a quick check while
  // working on 0022); a normal run does everything below, step0022 included
  if (onlyStep0022) {
    await step0022();
    return finish();
  }
  // --only-step0026: just Finance's Black Belt step (a quick check while
  // working on 0026); a normal run does everything below, step0026 included
  if (onlyStep0026) {
    await step0026();
    return finish();
  }
  // --only-step0027: just the Edit camp guard step (0027)
  if (onlyStep0027) {
    const prints27 = await step0027();
    if (prints27) {
      console.log('\n0027 fingerprints (kind  item  detail):');
      for (const line of prints27) console.log('  ' + line);
    }
    return finish();
  }
  // --only-step0029: just the Finance reminder 5-minute step (0029)
  if (onlyStep0029) {
    const prints29 = await step0029();
    if (prints29) {
      console.log('\n0029 fingerprints (kind  item  detail):');
      for (const line of prints29) console.log('  ' + line);
    }
    return finish();
  }
  // --only-step0028: just the Star start times step (0028)
  if (onlyStep0028) {
    const prints28 = await step0028();
    if (prints28) {
      console.log('\n0028 fingerprints (kind  item  detail):');
      for (const line of prints28) console.log('  ' + line);
    }
    return finish();
  }
  // --only-step0031: just the class ages step (0031)
  if (onlyStep0031) {
    const prints31 = await step0031();
    if (prints31) {
      console.log('\n0031 fingerprints (kind  item  detail):');
      for (const line of prints31) console.log('  ' + line);
    }
    return finish();
  }
  // --only-step0030: just the Color Belt review step (0030)
  if (onlyStep0030) {
    const prints30 = await step0030();
    if (prints30) {
      console.log('\n0030 fingerprints (kind  item  detail):');
      for (const line of prints30) console.log('  ' + line);
    }
    return finish();
  }
  // --only-step0032: just Black Belt's design-review database step (0032)
  if (onlyStep0032) {
    const prints32 = await step0032();
    if (prints32) {
      console.log('\n0032 fingerprints (kind  item  detail):');
      for (const line of prints32) console.log('  ' + line);
    }
    return finish();
  }
  // --only-step0034: just Black Belt's History record_id step (0034)
  if (onlyStep0034) {
    const prints34 = await step0034();
    if (prints34) {
      console.log('\n0034 fingerprints (kind  item  detail):');
      for (const line of prints34) console.log('  ' + line);
    }
    return finish();
  }
  // --only-step0033: just the Camps design review step (0033)
  if (onlyStep0033) {
    const prints33 = await step0033();
    if (prints33) {
      console.log('\n0033 fingerprints (kind  item  detail):');
      for (const line of prints33) console.log('  ' + line);
    }
    return finish();
  }
  // --only-step0035: just the Color Belt clean-up step (0035; it has no fingerprint file of its own)
  if (onlyStep0035) {
    await step0035();
    return finish();
  }
  // --only-step0036: just New students' last name, date of birth and Address step (0036)
  if (onlyStep0036) {
    const prints36 = await step0036();
    if (prints36) {
      console.log('\n0036 fingerprints (kind  item  detail):');
      for (const line of prints36) console.log('  ' + line);
    }
    return finish();
  }
  // --only-step0041: just the Star event end time step (0041)
  if (onlyStep0041) {
    const prints41 = await step0041();
    if (prints41) {
      console.log('\n0041 fingerprints (kind  item  detail):');
      for (const line of prints41) console.log('  ' + line);
    }
    return finish();
  }
  // --only-step0042: just New students' "Copy to the other school" step (0042)
  if (onlyStep0042) {
    const prints42 = await step0042();
    if (prints42) {
      console.log('\n0042 fingerprints (kind  item  detail):');
      for (const line of prints42) console.log('  ' + line);
    }
    return finish();
  }
  // --only-step0043: just the Camps Fill in step (0043)
  if (onlyStep0043) {
    const prints43 = await step0043();
    if (prints43) {
      console.log('\n0043 fingerprints (kind  item  detail):');
      for (const line of prints43) console.log('  ' + line);
    }
    return finish();
  }
  // --only-step0039: just the Camps Record refund step (0039)
  if (onlyStep0039) {
    const prints39 = await step0039();
    if (prints39) {
      console.log('\n0039 fingerprints (kind  item  detail):');
      for (const line of prints39) console.log('  ' + line);
    }
    return finish();
  }
  // --only-step0044: just Color Belt's rolling-check step A (0044)
  if (onlyStep0044) {
    const prints44 = await step0044();
    if (prints44) {
      console.log('\n0044 fingerprints (kind  item  detail):');
      for (const line of prints44) console.log('  ' + line);
    }
    return finish();
  }
  // --only-step0047: just Finance's Batch A step (0047, the stored payment school)
  if (onlyStep0047) {
    const prints47 = await step0047();
    if (prints47) {
      console.log('\n0047 fingerprints (kind  item  detail):');
      for (const line of prints47) console.log('  ' + line);
    }
    return finish();
  }
  // --only-step0037: just Finance's Export keeps "private" step (0037)
  if (onlyStep0037) {
    const prints37 = await step0037();
    if (prints37) {
      console.log('\n0037 fingerprints (kind  item  detail):');
      for (const line of prints37) console.log('  ' + line);
    }
    return finish();
  }
  // --only-stepFinanceCampRefunds: just Finance's camp refund check (R1-05)
  if (onlyStepFinanceCampRefunds) {
    await stepFinanceCampRefunds();
    return finish();
  }
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

  // 15b. Black Belt testing (0016), on the main database after 0011 and
  // before 13g (the 0010 down-script must stay the last thing there)
  let after16 = null;
  let after24 = null;   // step0024's 0024 fingerprints
  let after25 = null;   // step0025's 0025 fingerprints
  if (after11) {
    console.log('\nMigration 0016 (Black Belt testing):');
    after16 = await stepBlackBelt(db);
    // step0024: the rubric editor (0024), right after 0016 on the main database
    console.log('\nMigration 0024 (Black Belt rubric editor):');
    after24 = after16 ? await step0024(db) : null;
    if (!after16) record('0024 (Black Belt rubric editor)', false, 'skipped: 0016 could not be applied');
    // step0025: grading and results (0025), right after 0024 on the main database
    console.log('\nMigration 0025 (Black Belt grading and results):');
    after25 = after24 ? await step0025(db) : null;
    if (!after24) record('0025 (Black Belt grading and results)', false, 'skipped: 0024 could not be applied');
  } else {
    record('0016 (Black Belt testing)', false, 'skipped: 0011 could not be applied (see the lines above)');
  }

  // stepFinanceCamps (19a): camp payments in Finance (0017) on the main
  // database (0013 put on first; 0017 ends with its Undo), then the
  // speed / ICU databases. Before 13g, which must stay the last thing on
  // the main database.
  let after17 = null;
  if (after11) {
    console.log('\nMigration 0017 (camp payments in Finance), on the main database:');
    if (await run(db, '[0017 main] apply 0013_camps.sql (0017 needs it)', read('migrations', '0013_camps.sql'))) {
      after17 = await stepFinanceCamps(db, '[0017 main] ');
    }
    console.log('\n0017 speed with a big camp seed, and on a database that sorts text like production:');
    await campsFinanceSpeed(false);
    await campsFinanceSpeed(true);
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

  // stepCamps: Camps (0013) on its own fresh database, built in the live order
  const after13 = await stepCamps();

  // 16. the new-students migrations (0007, 0008, 0009, 0012) in the live order
  console.log('\nMigrations 0007-0012 (Schedule, Calendar, Forms, Prospects) in the live order:');
  const newStudents = after5 ? await step16() : null;

  // 17. 0015 (family history) in the live order, and its refusal on step 16's database
  console.log('\nMigration 0015 (family history):');
  const after15 = after5 ? await step17(newStudents?.db ?? null) : null;

  // 18. 0019 (school phone)
  console.log('\nMigration 0019 (school phone):');
  const after19 = after5 ? await step18() : null;

  // 0016 on top of everything, in the production order (its own database)
  console.log('\nMigration 0016 on top of every live migration (production order):');
  await step0016_after_new_students(after16);

  // step0021: Not interested families deleted after 6 months (its own database)
  console.log('\nMigration 0021 (Not interested families deleted after 6 months):');
  const after21 = after5 ? await step0021() : null;

  // step0024_production_order: 0024 on top of every live migration (its own database)
  console.log('\nMigration 0024 on top of every live migration (production order):');
  await step0024_production_order(after24);

  // step0025_production_order: 0025 on top of every live migration (its own database)
  console.log('\nMigration 0025 on top of every live migration (production order):');
  await step0025_production_order(after25);

  // step0026: Finance - Black Belt payments in the Daily report (its own databases)
  console.log('\nMigration 0026 (Finance: Black Belt payments in the Daily report):');
  const after26 = after5 ? await step0026() : null;

  // step0022: camps weekly pricing and longer camps (its own database, production order)
  console.log('\nMigration 0022 (camps weekly pricing and longer camps):');
  const after22 = after5 ? await step0022() : null;
  // step0023: Star result email texts + M5 (its own database)
  console.log('\nMigration 0023 (Star result email texts + registration stays closed on edit):');
  const after23 = after5 ? await step0023() : null;
  // step0027: Edit camp refuses changes that break campers' extras (its own database, production order)
  console.log('\nMigration 0027 (Edit camp refuses changes that break campers\' extras):');
  const after27 = after5 ? await step0027() : null;
  // step0029: Finance reminder in 5-minute steps (its own database, production order)
  console.log('\nMigration 0029 (Finance: close-the-day reminder in 5-minute steps):');
  const after29 = after5 ? await step0029() : null;
  // step0028: Star start times 6:00 AM - 10:00 PM every 5 minutes (its own database, production order)
  console.log('\nMigration 0028 (Star start times 6:00 AM - 10:00 PM every 5 minutes):');
  const after28 = after5 ? await step0028() : null;
  // step0031: class ages on the booking forms (its own database, production order)
  console.log('\nMigration 0031 (class ages on the booking forms):');
  const after31 = after5 ? await step0031() : null;
  // step0030: Color Belt review - Mark paid with a way to pay, History, results CSV (its own database, production order)
  console.log('\nMigration 0030 (Color Belt: Mark paid with a way to pay, History, results CSV):');
  const after30 = after5 ? await step0030() : null;
  // step0032: Black Belt's design-review database half (its own database, production order)
  console.log('\nMigration 0032 (Black Belt: 5-minute times, candidate history, Edit cycle Undo in one call):');
  const after32 = after5 ? await step0032() : null;
  // step0034: Black Belt's History line names the logged row's id (its own database, production order)
  console.log('\nMigration 0034 (Black Belt: History rows carry record_id):');
  const after34 = after5 ? await step0034() : null;
  // step0033: Camps design review - Mark paid with a way, Camper history (its own database, production order)
  console.log('\nMigration 0033 (Camps design review: Mark paid with a way to pay, Camper history):');
  const after33 = after5 ? await step0033() : null;
  // step0035: Color Belt clean-up - the old one-click Mark paid functions removed (its own database, production order)
  console.log('\nMigration 0035 (Color Belt: the old 2-argument Mark paid functions removed):');
  if (after5) await step0035();
  // step0036: New students - each child's last name and date of birth, the Address question (its own database, production order)
  console.log('\nMigration 0036 (New students: each child\'s last name and date of birth, the Address question):');
  const after36 = after5 ? await step0036() : null;
  // step0041: Star event end time (its own database, production order)
  console.log('\nMigration 0041 (Star event end time):');
  const after41 = after5 ? await step0041() : null;

  // step0042: New students - Copy a form to the other school (its own database, production order)
  console.log('\nMigration 0042 (New students: Copy a form to the other school):');
  const after42 = after5 ? await step0042() : null;
  // step0043: Camps Fill in (its own database, production order)
  console.log('\nMigration 0043 (Camps Fill in):');
  const after43 = after5 ? await step0043() : null;
  // step0039: Camps Record refund (its own database, production order: it is pasted after 0043)
  console.log('\nMigration 0039 (Camps Record refund):');
  const after39 = after5 ? await step0039() : null;

  // step0044: Color Belt rolling check, step A - the family form's own Paying by, Edit event Undo in one call, each payment's school
  console.log('\nMigration 0044 (Color Belt: the form\'s own Paying by, Edit event Undo in one call, each payment\'s school):');
  const after44 = after5 ? await step0044() : null;
  // stepFinanceCampRefunds: Finance R1-05, camp refunds (Camps' 0039) in the live Finance functions
  console.log('\nFinance R1-05 (camp refunds in the Daily report, after Camps\' 0039):');
  if (after5) await stepFinanceCampRefunds();
  // step0037: Finance - Export keeps "private" (its own database, production order: pasted after 0039)
  console.log('\nMigration 0037 (Finance: Export keeps "private"):');
  const after37 = after5 ? await step0037() : null;
  if (after37) {
    console.log('\n0037 fingerprints (kind  item  detail):');
    for (const line of after37) console.log('  ' + line);
  }
  // step0047: Finance Batch A - the stored payment school + was_school (its own database, production order: pasted after 0038 and 0044)
  console.log('\nMigration 0047 (Finance: payment lines count at the school stored on the payment, was_school):');
  const after47 = after5 ? await step0047() : null;
  if (after47) {
    console.log('\n0047 fingerprints (kind  item  detail):');
    for (const line of after47) console.log('  ' + line);
  }

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
  if (after23) {
    console.log('\n0023 fingerprints (kind  item  detail):');
    for (const line of after23) console.log('  ' + line);
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
  if (after16) {
    console.log('\n0016 fingerprints (kind  item  detail):');
    for (const line of after16) console.log('  ' + line);
  }
  if (after25) {
    console.log('\n0025 fingerprints (kind  item  detail):');
    for (const line of after25) console.log('  ' + line);
  }
  if (after18) {
    console.log('\n0018 fingerprints (kind  item  detail):');
    for (const line of after18) console.log('  ' + line);
  }
  if (after26) {
    console.log('\n0026 fingerprints (kind  item  detail):');
    for (const line of after26) console.log('  ' + line);
  }
  if (after13) {
    console.log('\n0013 fingerprints (kind  item  detail):');
    for (const line of after13) console.log('  ' + line);
  }
  if (after22) {
    console.log('\n0022 fingerprints (kind  item  detail):');
    for (const line of after22) console.log('  ' + line);
  }
  if (after27) {
    console.log('\n0027 fingerprints (kind  item  detail):');
    for (const line of after27) console.log('  ' + line);
  }
  if (after29) {
    console.log('\n0029 fingerprints (kind  item  detail):');
    for (const line of after29) console.log('  ' + line);
  }
  if (after28) {
    console.log('\n0028 fingerprints (kind  item  detail):');
    for (const line of after28) console.log('  ' + line);
  }
  if (after31) {
    console.log('\n0031 fingerprints (kind  item  detail):');
    for (const line of after31) console.log('  ' + line);
  }
  if (after30) {
    console.log('\n0030 fingerprints (kind  item  detail):');
    for (const line of after30) console.log('  ' + line);
  }
  if (after32) {
    console.log('\n0032 fingerprints (kind  item  detail):');
    for (const line of after32) console.log('  ' + line);
  }
  if (after34) {
    console.log('\n0034 fingerprints (kind  item  detail):');
    for (const line of after34) console.log('  ' + line);
  }
  if (after33) {
    console.log('\n0033 fingerprints (kind  item  detail):');
    for (const line of after33) console.log('  ' + line);
  }
  if (after36) {
    console.log('\n0036 fingerprints (kind  item  detail):');
    for (const line of after36) console.log('  ' + line);
  }
  if (after41) {
    console.log('\n0041 fingerprints (kind  item  detail):');
    for (const line of after41) console.log('  ' + line);
  }
  if (after42) {
    console.log('\n0042 fingerprints (kind  item  detail):');
    for (const line of after42) console.log('  ' + line);
  }
  if (after43) {
    console.log('\n0043 fingerprints (kind  item  detail):');
    for (const line of after43) console.log('  ' + line);
  }
  if (after39) {
    console.log('\n0039 fingerprints (kind  item  detail):');
    for (const line of after39) console.log('  ' + line);
  }
  if (after44) {
    console.log('\n0044 fingerprints (kind  item  detail):');
    for (const line of after44) console.log('  ' + line);
  }
  if (after17) {
    console.log('\n0017 fingerprints (Finance after 0017; kind  item  detail):');
    for (const line of after17) console.log('  ' + line);
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


// =====================================================================
// step0023: 0023 (Star result email texts, rulebook v0.514 R11; M5,
// v0.504: star_update_event keeps registration closed in the same save),
// on its own database built in the live order.
//   a. steps 1-5, 0003, 0004, the seed, 0005 (+ its test event), 0006,
//      0010, 0007, 0008, 0009, 0012, 0015, 0011, 0014, 0019, 0020, 0021;
//      0023_fingerprints.sql contains neither "delete" nor "drop" (it
//      goes through the connector; the migration is pasted by hand)
//   b. 0023; every other migration's fingerprints stay the same, except
//      the TWO lines of star_update_event (M5) and star_results_csv (the
//      CSV keys) in 0006's, on purpose
//   c. 0023_tests.sql, then 0006_tests.sql (every old star_update_event
//      test must still pass), 0005_tests.sql and 0003_tests.sql
//   d. an admin's changed text survives 0023 applied twice more; the
//      function / table / rule / trigger fingerprints stay identical;
//      0023_tests.sql again
//   e. the undo file supabase/manual/0023u_undo_star_update_event.sql:
//      star_update_event's and star_results_csv's fingerprints equal the
//      ones before 0023, every other 0006 line unchanged; the table and its function stay;
//      0006_tests pass; 0023 again restores the tested fingerprints
//   e2. 0006 re-run (puts 0006's star_update_event back), then 0023 again:
//      the fingerprints are 0023's again; 0023 + 0006 tests pass
//   f. a minimal database (steps 1-5, 0003, 0004, 0005, 0006, 0023) gives
//      the same 0023 fingerprints
// Returns 0023's fingerprints.
// =====================================================================
async function step0023() {
  const L = '[0023] ';
  const migration = read('migrations', '0023_star_result_texts.sql');
  record(L + '0023_fingerprints.sql contains neither "delete" nor "drop" (connector-safe)',
    !/delete|drop/i.test(read('tests', '0023_fingerprints.sql')));

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
    ['0015', '0015_family_history.sql'], ['0011 (Finance)', '0011_finance.sql'], ['0014', '0014_testing_private.sql'],
    ['0019', '0019_school_phone.sql'], ['0020', '0020_session_id_claims.sql'],
    ['0021', '0021_prospects_not_interested_sooner.sql']]) {
    if (!(await run(db, `${L}apply ${label}`, read('migrations', file)))) return null;
  }

  // b. apply 0023; only star_update_event's line of 0006's fingerprints may move
  const prints = ['0003_fingerprints.sql', '0004_fingerprints.sql', '0005_fingerprints.sql', '0006_fingerprints.sql', '0010_fingerprints.sql',
    '0007_fingerprints.sql', '0008_fingerprints.sql', '0009_fingerprints.sql', '0012_fingerprints.sql', '0015_fingerprints.sql',
    '0011_fingerprints.sql', '0014_fingerprints.sql', '0019_fingerprints.sql', '0020_fingerprints.sql', '0021_fingerprints.sql'];
  const before = {};
  for (const f of prints) before[f] = await fingerprints(db, f);
  if (!(await run(db, L + 'apply 0023_star_result_texts.sql', migration))) return null;
  const after23 = await fingerprints(db, '0023_fingerprints.sql');
  for (const f of prints) {
    const after = await fingerprints(db, f);
    const gone = before[f].filter((line) => !after.includes(line));
    const added = after.filter((line) => !before[f].includes(line));
    const moved = [...gone, ...added];
    const ok = f === '0006_fingerprints.sql'
      ? gone.length === 2 && added.length === 2 && moved.every((line) => /^function {2}star_(update_event|results_csv)\(/.test(line))
      : moved.length === 0;
    record(`${L}${f.slice(0, 4)} fingerprints: ${f === '0006_fingerprints.sql' ? 'only star_update_event (M5) and star_results_csv moved' : 'unchanged'}`, ok,
      moved.length === 0 ? `${after.length} rows, unchanged` : `${gone.length} line(s) changed: ${added.map((l) => l.slice(0, 60)).join(' | ')}`);
  }
  const updateEventLine = after23.find((line) => /^function {2}star_update_event\(/.test(line));
  record(L + 'star_update_event: 0023_fingerprints.sql and 0006_fingerprints.sql agree on the new code',
    !!updateEventLine && (await fingerprints(db, '0006_fingerprints.sql')).some((line) => line.split('  ')[2]?.split(' ')[0] === updateEventLine.split('  ')[2].split(' ')[0]));

  // c. its own tests, then Star's and the files 0006's tests sit on
  await runTestFile(db, L + '0023_tests.sql', '0023_tests.sql', 'ALL 0023 TESTS PASSED');
  for (const [file, ok] of [['0006_tests.sql', 'ALL 0006 TESTS PASSED'], ['0005_tests.sql', 'ALL 0005 TESTS PASSED'],
    ['0003_tests.sql', 'ALL 0003 TESTS PASSED']]) {
    await runTestFile(db, `${L}${file} (after 0023)`, file, ok);
  }

  // d. an admin's changed text survives re-runs; nothing else moves
  const structural = (lines) => lines.filter((line) => !line.startsWith('seed  '));
  const changed = 'Hello, changed by an admin: {total} of {pass mark}. {first name}';
  await run(db, L + 'an admin changes the Passed text (as the SQL Editor, tagged)', `
    begin;
    select set_config('tkd.action', 'star_set_result_text', true);
    update public.star_result_texts set body = '${changed}' where kind = 'passed';
    commit;`);
  const changedVersion = await one(db, `select version from public.star_result_texts where kind = 'passed'`);
  for (const n of ['SECOND', 'THIRD']) {
    await run(db, `${L}apply 0023 a ${n} time (re-run safety)`, migration);
  }
  const again = await fingerprints(db, '0023_fingerprints.sql');
  record(L + '0023 function / table / rule / trigger fingerprints identical before/after the re-runs',
    JSON.stringify(structural(again)) === JSON.stringify(structural(after23)), `${again.length} rows`);
  record(L + 'the re-runs kept the admin\'s text and its version (the seed never overwrites)',
    (await one(db, `select body from public.star_result_texts where kind = 'passed'`)) === changed
      && (await one(db, `select version from public.star_result_texts where kind = 'passed'`)) === changedVersion
      && (await one(db, `select count(*)::int from public.star_result_texts`)) === 3);
  await runTestFile(db, L + '0023_tests.sql (after re-runs)', '0023_tests.sql', 'ALL 0023 TESTS PASSED');

  // e. the undo file gives back 0006's star_update_event exactly
  const ueRe = /^function {2}star_(update_event|results_csv)\(/;
  const before6 = before['0006_fingerprints.sql'];
  const before6Lines = before6.filter((line) => ueRe.test(line));
  const undoSql = readFileSync(path.join(supabaseDir, 'manual', '0023u_undo_star_update_event.sql'), 'utf8');
  if (await run(db, L + 'apply the undo file manual/0023u_undo_star_update_event.sql', undoSql)) {
    const undone = await fingerprints(db, '0006_fingerprints.sql');
    record(L + 'after the undo star_update_event and star_results_csv have 0006\'s fingerprints again',
      before6Lines.length === 2 && JSON.stringify(undone.filter((line) => ueRe.test(line))) === JSON.stringify(before6Lines));
    record(L + 'after the undo every other 0006 line is unchanged',
      JSON.stringify(undone.filter((line) => !ueRe.test(line))) === JSON.stringify(before6.filter((line) => !ueRe.test(line))));
    record(L + 'after the undo the texts table and its function stay',
      (await one(db, 'select count(*)::int from public.star_result_texts')) === 3
        && (await one(db, "select to_regprocedure('public.star_set_result_text(text, integer, text)') is not null")) === true);
    await runTestFile(db, L + '0006_tests.sql (after the undo)', '0006_tests.sql', 'ALL 0006 TESTS PASSED');
    if (await run(db, L + 'apply 0023 again after the undo', migration)) {
      const redo = await fingerprints(db, '0023_fingerprints.sql');
      record(L + '0023 fingerprints back to the tested ones after undo + 0023',
        JSON.stringify(structural(redo)) === JSON.stringify(structural(after23)), `${redo.length} rows`);
    }
  }

  // e2. 0006 re-run (old star_update_event back), then 0023 again
  if (await run(db, L + 're-run 0006 (puts 0006\'s star_update_event back)', read('migrations', '0006_star_testing.sql'))) {
    const old = await fingerprints(db, '0023_fingerprints.sql');
    record(L + 'after the 0006 re-run star_update_event is 0006\'s again (fingerprint differs)',
      JSON.stringify(structural(old)) !== JSON.stringify(structural(after23)));
    if (await run(db, L + 'apply 0023 again after the 0006 re-run', migration)) {
      const back = await fingerprints(db, '0023_fingerprints.sql');
      record(L + '0023 fingerprints back to the tested ones', JSON.stringify(structural(back)) === JSON.stringify(structural(after23)), `${back.length} rows`);
      await runTestFile(db, L + '0023_tests.sql (after 0006 re-run + 0023)', '0023_tests.sql', 'ALL 0023 TESTS PASSED');
      await runTestFile(db, L + '0006_tests.sql (after 0006 re-run + 0023)', '0006_tests.sql', 'ALL 0006 TESTS PASSED');
    }
  }

  // f. a minimal database gives the same fingerprints (seed lines included)
  const M = '[0023 minimal] ';
  const mini = await buildBase(M);
  if (mini) {
    let ok = true;
    for (const f of ['0003_testing_classes_ranks.sql', '0004_staff_accounts.sql', '0005_testing_events.sql', '0006_star_testing.sql',
      '0023_star_result_texts.sql']) {
      ok = ok && (await run(mini, M + 'apply ' + f, read('migrations', f)));
    }
    if (ok) {
      const p = await fingerprints(mini, '0023_fingerprints.sql');
      record(M + '0023 fingerprints identical to the live-order database', JSON.stringify(p) === JSON.stringify(after23), `${p.length} rows`);
      await runTestFile(mini, M + '0023_tests.sql', '0023_tests.sql', 'ALL 0023 TESTS PASSED');
    }
  }
  return after23;
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
     where c.location_code = 'worcester' and p.kind in ('payment', 'refund') and p.paid_on = '${busy}'`))
    // (0026: Black Belt payments, refunds and returned checks of that school and day too, when 0016 is there)
    + ((await one(db, `select to_regclass('public.bb_payments') is not null`)) ? Number(await one(db, `select count(*) from public.bb_payments p
     where p.location_code = 'worcester' and p.kind in ('payment', 'refund', 'returned') and p.paid_on = '${busy}'`)) : 0);
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

// ---------------------------------------------------------------------
// Step 15: Black Belt testing (0016)
// ---------------------------------------------------------------------

// The 13 Black Belt tables - used for the "re-running changed nothing" md5.
const BB_TABLES = [
  'bb_settings', 'bb_waiver_versions', 'bb_starting_point', 'bb_cycles', 'bb_cycle_days', 'bb_cycle_day_parts',
  'bb_cycle_plans', 'bb_cycle_plan_amounts', 'bb_cycle_kukkiwon_fees', 'bb_cycle_plan_payments',
  'bb_candidates', 'bb_candidate_waivers', 'bb_payments'];

// Everything 0016 stores, plus the history's row count, as one md5.
const snapshot16Sql = `select md5(${BB_TABLES.map((t) =>
  `coalesce((select string_agg(to_jsonb(x)::text, ',' order by x.id) from public.${t} x), '')`).join(' || ')}
  || (select count(*) from public.change_log)::text)`;

// The fingerprints of every migration on main before 0016 (15b: 0016 must
// not change them).
async function before16Fingerprints(db) {
  return [
    ...(await fingerprints(db, '0003_fingerprints.sql')),
    ...(await fingerprints(db, '0004_fingerprints.sql')),
    ...(await fingerprints(db, '0005_fingerprints.sql')),
    ...(await fingerprints(db, '0006_fingerprints.sql')),
    ...(await fingerprints(db, '0010_fingerprints.sql')),
    ...(await fingerprints(db, '0011_fingerprints.sql')),
  ];
}

// Every test file, 0016's first (15c).
async function allTestFiles16(db, label) {
  await runTestFile(db, `0016_tests.sql (${label})`, '0016_tests.sql', 'ALL 0016 TESTS PASSED');
  await runTestFile(db, `verify_pin_tests.sql (${label})`, 'verify_pin_tests.sql', 'ALL PIN TESTS PASSED');
  await runTestFile(db, `0002_tests.sql (${label})`, '0002_tests.sql', 'ALL 0002 TESTS PASSED');
  await runTestFile(db, `0003_tests.sql (${label})`, '0003_tests.sql', 'ALL 0003 TESTS PASSED');
  await runTestFile(db, `0004_tests.sql (${label})`, '0004_tests.sql', 'ALL 0004 TESTS PASSED');
  await runTestFile(db, `0005_tests.sql (${label})`, '0005_tests.sql', 'ALL 0005 TESTS PASSED');
  await runTestFile(db, `0006_tests.sql (${label})`, '0006_tests.sql', 'ALL 0006 TESTS PASSED');
  await runTestFile(db, `0010_tests.sql (${label})`, '0010_tests.sql', 'ALL 0010 TESTS PASSED');
  await runTestFile(db, `0011_tests.sql (${label})`, '0011_tests.sql', 'ALL 0011 TESTS PASSED');
}

// An unlocked admin session with a fresh password sign-in, like the test
// files make (15d / 15e). Its login token as text.
const BB_ADMIN_SESSION = '44444444-4444-4444-8444-444444444444';
async function bbAdminClaims(db) {
  await db.exec(`insert into auth.sessions (id, user_id) values ('${BB_ADMIN_SESSION}', '${ADMIN_UID}') on conflict do nothing;
    insert into public.session_unlock (session_id, staff_id, unlocked_until)
    values ('${BB_ADMIN_SESSION}', '${ADMIN_UID}', now() + interval '1 hour')
    on conflict (session_id) do update set unlocked_until = excluded.unlocked_until;`);
  return JSON.stringify({ sub: ADMIN_UID, role: 'authenticated', session_id: BB_ADMIN_SESSION,
    amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) - 60 }] });
}

// 15d. Acting AS the Black Belt family form's login. Each statement must
// be refused (permission denied) - first without, then WITH an admin's
// login token in the session (no impersonation). Then bb_public_cycle
// must work, and the other two forms' logins can't run Black Belt's.
async function bbRegistrarLiveChecks(db) {
  // every bb_ function the form's login must NOT run (staff functions,
  // helpers, the register core), called with typed empty arguments; trigger
  // functions can't be called directly by anyone, so they are left out
  const fns = (await db.query(`select p.proname, oidvectortypes(p.proargtypes) as types
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'bb\\_%'
       and p.proname not in ('bb_public_cycle', 'bb_public_register')
       and p.prorettype <> 'trigger'::regtype
     order by p.proname`)).rows;
  const fnCalls = fns.map((f) => [`call ${f.proname}`,
    `select public.${f.proname}(${f.types ? f.types.split(', ').map((t) => `null::${t}`).join(', ') : ''})`]);
  const refused = [
    ...BB_TABLES.map((t) => [`read ${t}`, `select 1 from public.${t} limit 1`]),
    ['read testing_public_attempts', 'select 1 from public.testing_public_attempts limit 1'],
    ['read change_log', 'select 1 from public.change_log limit 1'],
    ['read staff', 'select 1 from public.staff limit 1'],
    ['read locations', 'select 1 from public.locations limit 1'],
    ['read auth.users', 'select 1 from auth.users limit 1'],
    ['use the reference counter', "select nextval('public.bb_candidate_ref_seq')"],
    ['write bb_candidates', 'update public.bb_candidates set first_name = first_name'],
    ['write bb_payments', "insert into public.bb_payments (candidate_id, cycle_id, kind, amount_cents, method, paid_on, location_code, cycle_name, recorded_by_name) values (gen_random_uuid(), gen_random_uuid(), 'refund', -1, 'cash', current_date, 'worcester', 'x', 'x')"],
    ['call has_data_access', 'select public.has_data_access()'],
    ...fnCalls,
    ['call testing_public_event', "select public.testing_public_event('abcdefgh')"],
    ['call testing_public_register', `select public.testing_public_register('abcdefgh', 'k', gen_random_uuid(), 'a', 'b', gen_random_uuid(), 'cash', true, '${TEST_SIGNATURE}', '${ACK_VERSION}')`],
    ['call star_public_event', "select public.star_public_event('abcdefgh')"],
    ['call star_public_register', `select public.star_public_register('abcdefgh', 'k', gen_random_uuid(), 'a', 'b', current_date - 4000, 'a@b.co', 1, 0, 'cash', true, '${TEST_SIGNATURE}', '${STAR_ACK_VERSION}')`],
    ['create a table in public', 'create table public.zz_bb_registrar_probe (x integer)'],
    ['create a schema', 'create schema zz_bb_registrar_probe'],
  ];
  const claims = await bbAdminClaims(db);
  for (const withToken of [false, true]) {
    let allRefused = true;
    const leaks = [];
    for (const [label, sql] of refused) {
      try {
        await db.exec('set role bb_registrar;');
        if (withToken) await db.query(`select set_config('request.jwt.claims', $1, false)`, [claims]);
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
        await db.query(`select set_config('request.jwt.claims', '', false)`).catch(() => {});
      }
    }
    record(`[bb registrar] every table, the counter, writes, ${fnCalls.length} bb_ functions, has_data_access, the other forms and CREATE refused`
      + (withToken ? ' - WITH an admin\'s login token set' : ''), allRefused, leaks.join('; '));
  }
  try {
    await db.exec('set role bb_registrar;');
    const r = await db.query("select public.bb_public_cycle('zzzzzzzz') as r");
    record('[bb registrar] can call bb_public_cycle', r.rows[0].r?.status === 'not_found', JSON.stringify(r.rows[0].r));
  } catch (error) {
    record('[bb registrar] can call bb_public_cycle', false, error.message);
  } finally {
    await db.exec('reset role;').catch(() => {});
  }
  const crossed = [];
  for (const role of ['testing_registrar', 'star_registrar']) {
    for (const sql of ["select public.bb_public_cycle('zzzzzzzz')",
      `select public.bb_public_register('zzzzzzzz', 'k', gen_random_uuid(), 'a', 'b', current_date - 4000, 'a@b.co', 1, gen_random_uuid(), false, true, '2026-1', 'x', '${TEST_SIGNATURE}')`]) {
      try {
        await db.exec(`set role ${role};`);
        await db.exec(sql);
        crossed.push(`${role}: ${sql.slice(7, 40)}`);
      } catch (error) {
        if (!/permission denied/i.test(error.message)) crossed.push(`${role}: ${sql.slice(7, 40)} (${error.message})`);
      } finally {
        await db.exec('reset role;').catch(() => {});
      }
    }
  }
  record('[bb registrar] testing_registrar and star_registrar can\'t run Black Belt\'s public functions', crossed.length === 0,
    crossed.join('; '));
}

// 15e. A Black Belt TEST cycle made through the staff functions as an
// unlocked admin (the school's waiver saved, a cycle added and opened),
// then one family registers AS bb_registrar - with an admin's login token
// set in the session on purpose: the row must still be by "Family form"
// with no login id.
async function seedBbTestCycle(db) {
  const claims = await bbAdminClaims(db);
  let code = null;
  try {
    await db.exec('begin;');
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
    const w = await db.query(`select public.bb_save_waiver((select v.id from public.bb_waiver_versions v where v.superseded_at is null),
      'PGlite test waiver: every subject must be passed; fees are applied to the next test.') as r`);
    const c = await db.query(`select public.bb_add_cycle(jsonb_build_object(
        'name', 'PGlite Black Belt Testing', 'application_due', public.testing_today() + 20,
        'submissions_due', public.testing_today() + 40, 'auto_close', true,
        'days', jsonb_build_array(
          jsonb_build_object('name', 'Physical', 'day_date', public.testing_today() + 30, 'start_time', '12:30', 'end_time', '14:30',
                             'place', jsonb_build_object('code', 'worcester'),
                             'second', jsonb_build_object('start', '14:30', 'end', '15:30', 'place', jsonb_build_object('other', 'Horgan Arena')),
                             'parts', jsonb_build_array('physical')),
          jsonb_build_object('name', 'Technical and Curriculum', 'day_date', public.testing_today() + 44, 'start_time', '12:30',
                             'end_time', '17:00', 'place', jsonb_build_object('code', 'shrewsbury'), 'second', null,
                             'parts', jsonb_build_array('technical', 'curriculum'))),
        'plans', jsonb_build_array(jsonb_build_object('name', 'In full',
          'payments', jsonb_build_array(jsonb_build_object('due_on', public.testing_today() + 20, 'follows_application_due', true)),
          'amounts', jsonb_build_object('1', jsonb_build_array(87000), '2', jsonb_build_array(99000),
                                        '3', jsonb_build_array(150000), '4', jsonb_build_array(270000)))),
        'kukkiwon', jsonb_build_object('1', 10000, '2', 11000, '3', 14000, '4', 17000),
        'prices_from', 'Fall 2026 starting point'), null) as r`);
    const cycle = c.rows[0].r;
    const o = await db.query(`select public.bb_set_registration($1::uuid, 1, true) as r`, [cycle?.id]);
    await db.query(`select set_config('request.jwt.claims', '', true)`);
    await db.exec('commit;');
    const ok = w.rows[0].r?.status === 'ok' && cycle?.status === 'ok' && o.rows[0].r?.status === 'ok';
    record('[bb cycle] the school\'s waiver saved, a test cycle added and opened (as an unlocked admin)', ok,
      JSON.stringify([w.rows[0].r, cycle?.status, o.rows[0].r?.status]));
    if (!ok) return false;
    code = cycle.public_code_shrewsbury;
  } catch (error) {
    record('[bb cycle] seed a Black Belt test cycle', false, error.message);
    await db.exec('rollback;').catch(() => {});
    return false;
  }
  const before = await one(db, 'select coalesce(max(id), 0)::bigint from public.change_log');
  try {
    await db.exec('set role bb_registrar;');
    await db.query(`select set_config('request.jwt.claims', $1, false)`, [claims]);
    const plan = await (async () => {
      const r = await db.query('select public.bb_public_cycle($1) as r', [code]);
      return r.rows[0].r?.cycle?.plans?.[0]?.id;
    })();
    const version = (await db.query('select public.bb_public_cycle($1) as r', [code])).rows[0].r?.waiver?.version_name;
    const r = await db.query(
      `select public.bb_public_register($1, $2, gen_random_uuid(), $3, $4, current_date - 5000, $5, 1, $6::uuid, true, true, $7, $8, $9) as r`,
      [code, 'pglite-bb-client-key', 'Pat', 'Lee', 'pat.bb@example.com', plan, version, 'Jordan Parent', TEST_SIGNATURE]);
    record('[bb cycle] a family registration AS bb_registrar (with an admin\'s token in the session)',
      r.rows[0].r?.status === 'ok' && r.rows[0].r?.school?.code === 'shrewsbury', JSON.stringify(r.rows[0].r));
  } catch (error) {
    record('[bb cycle] a family registration AS bb_registrar', false, error.message);
  } finally {
    await db.exec('reset role;').catch(() => {});
    await db.query(`select set_config('request.jwt.claims', '', false)`).catch(() => {});
  }
  const rows = (await db.query(`select count(*)::int as n,
      count(*) filter (where actor_name = 'Family form' and actor_id is null and session_id is null)::int as form,
      count(*) filter (where coalesce(before::text, '') || coalesce(after::text, '') ~ 'data:image|Jordan Parent|pat\\.bb@example')::int as leaked
      from public.change_log where id > ${before}`)).rows[0];
  record('[bb cycle] the registration\'s history rows are by "Family form" (no login id) and hold no signature, signer or email',
    rows.n === 2 && rows.form === 2 && rows.leaked === 0, JSON.stringify(rows));
  return true;
}

// Step 15 on the main database. Returns 0016's fingerprints (or null if
// 0016 could not be applied).
async function stepBlackBelt(db) {
  // 15a. the fingerprints file must stay runnable through the connector
  const printsText = read('tests', '0016_fingerprints.sql');
  record('0016_fingerprints.sql contains neither "delete" nor "drop" (connector-safe)', !/delete|drop/i.test(printsText));
  record('0016_cp3_snapshot.sql contains neither "delete" nor "drop" (connector-safe)', !/delete|drop/i.test(read('tests', '0016_cp3_snapshot.sql')));

  // 15b. apply 0016; the earlier migrations' fingerprints don't move
  const earlierBefore = await before16Fingerprints(db);
  if (!(await run(db, 'apply 0016_black_belt.sql', read('migrations', '0016_black_belt.sql')))) return null;
  record('0003 / 0004 / 0005 / 0006 / 0010 / 0011 fingerprints identical before/after 0016',
    JSON.stringify(earlierBefore) === JSON.stringify(await before16Fingerprints(db)), `${earlierBefore.length} rows`);
  const seeded = (await db.query(`select (select count(*)::int from public.bb_settings) as settings,
      (select count(*)::int from public.bb_waiver_versions where is_placeholder) as placeholder,
      (select count(*)::int from public.bb_starting_point) as starting_point,
      (select count(*)::int from public.bb_cycles) as cycles,
      (select count(*)::int from public.change_log where action = 'bb_seed') as seed_rows`)).rows[0];
  record('[0016] seed: 1 settings row, 1 placeholder waiver, 1 starting point, no cycle, 3 history rows',
    JSON.stringify(seeded) === JSON.stringify({ settings: 1, placeholder: 1, starting_point: 1, cycles: 0, seed_rows: 3 }),
    JSON.stringify(seeded));

  // 15c. every test file
  await allTestFiles16(db, 'after 0016');

  // 15d. live checks as the Black Belt form's login
  await bbRegistrarLiveChecks(db);

  // 15e. a seeded test cycle and a form registration, then the tests again
  if (await seedBbTestCycle(db)) {
    await runTestFile(db, '0016_tests.sql (with the Black Belt test cycle)', '0016_tests.sql', 'ALL 0016 TESTS PASSED');
    await runTestFile(db, '0011_tests.sql (with the Black Belt test cycle)', '0011_tests.sql', 'ALL 0011 TESTS PASSED');
    await runTestFile(db, '0006_tests.sql (with the Black Belt test cycle)', '0006_tests.sql', 'ALL 0006 TESTS PASSED');
  }

  // 15f. re-run safety
  const before16 = await fingerprints(db, '0016_fingerprints.sql');
  const data16Before = await one(db, snapshot16Sql);
  await run(db, 'apply 0016 a SECOND time (re-run safety)', read('migrations', '0016_black_belt.sql'));
  record('0016 re-run kept every row unchanged (13 Black Belt tables, change_log)', data16Before === (await one(db, snapshot16Sql)));
  const after16 = await fingerprints(db, '0016_fingerprints.sql');
  record('0016 fingerprints identical before/after re-run', JSON.stringify(before16) === JSON.stringify(after16), `${after16.length} rows`);
  record('earlier fingerprints still identical after the 0016 re-run',
    JSON.stringify(earlierBefore) === JSON.stringify(await before16Fingerprints(db)));
  await runTestFile(db, '0016_tests.sql (after re-run)', '0016_tests.sql', 'ALL 0016 TESTS PASSED');
  await bbRegistrarLiveChecks(db);
  return after16;
}

// =====================================================================
// step0016_after_new_students: 0016 (Black Belt) on a database built in
// the PRODUCTION order. Step 15 tests 0016 on the main database, which
// has 0001-0006, 0010 and 0011 but none of the new-students files. On
// production 0016 will be pasted AFTER everything that is live, so this
// step builds that database and proves 0016 applies and passes on top of
// it:
//   a. a database built like production, in the order the migrations
//      were pasted there (status files: Finance, Color Belt, camps'
//      go-live page):
//        2026-10-17/19: steps 1-5, 0003, 0004, the seed, 0005 (+ its test
//          event), 0006, 0010, 0007, 0008, 0009, 0012, 0015, then 0011
//          the way production got it (first the copy pasted on
//          2026-10-19, fixtures/0011_as_applied_2026-10-19.sql, then
//          today's 0011 - the speed fix - over it), then 0019 and 0014
//          (Color Belt private testing, the real file = the live copy)
//        2026-10-20: 0020 (the current_session_id() fix), then camps'
//          0013 + 0017 (camp payments in Finance; the exact copies in
//          fixtures/ that step0018 uses, until the real files are on
//          this branch), then 0018 (private testing money in Finance,
//          which refuses to run before camps' 0017)
//   b. the fingerprints of every migration already there are taken,
//      0016 is applied, and they must be IDENTICAL afterwards (camps'
//      0013 / 0017 have no fingerprints file on this branch)
//   c. 0016_tests.sql, then the test files of every migration 0016 sits
//      on top of (all must still pass; camps' 0017_tests.sql from the
//      same place as step0018's)
//   d. the bb_registrar live checks (15d) and a seeded Black Belt test
//      cycle with a family registration (15e), then 0016's, 0015's,
//      0011's and 0018's tests again
//   e. 0016's fingerprints must be IDENTICAL to step 15's (the main
//      database's): the new-students files change nothing of 0016's
// "main16" = step 15's 0016 fingerprints (or null if step 15 failed).
// =====================================================================
async function step0016_after_new_students(main16) {
  const L = '[0016 live order] ';
  const db = await buildBase(L);
  if (!db) return;
  // a. what production will have when 0016 is pasted
  for (const [label, file] of [['0003', '0003_testing_classes_ranks.sql'], ['0004', '0004_staff_accounts.sql']]) {
    if (!(await run(db, `${L}apply ${label}`, read('migrations', file)))) return;
  }
  await run(db, L + 'apply built-in seed', builtInSeedSql());
  if (!(await run(db, L + 'apply 0005', read('migrations', '0005_testing_events.sql')))) return;
  await seedTestEvent(db);
  for (const [label, file] of [['0006', '0006_star_testing.sql'], ['0010 (grading results)', '0010_testing_results.sql'],
    ['0007', '0007_schedule.sql'], ['0008', '0008_calendar.sql'], ['0009', '0009_forms.sql'], ['0012', '0012_prospects.sql'],
    ['0015', '0015_family_history.sql']]) {
    if (!(await run(db, `${L}apply ${label}`, read('migrations', file)))) return;
  }
  // 0011 as production got it: the 2026-10-19 copy first, today's over it
  const old11 = readFileSync(path.join(here, 'fixtures', '0011_as_applied_2026-10-19.sql'), 'utf8');
  if (!(await run(db, L + 'apply 0011 as pasted on production 2026-10-19 (fixture)', old11))) return;
  if (!(await run(db, L + 'apply today\'s 0011 over it', read('migrations', '0011_finance.sql')))) return;
  if (!(await run(db, L + 'apply 0019', read('migrations', '0019_school_phone.sql')))) return;
  // 0014 (Color Belt private testing), live since 2026-10-19
  if (!(await run(db, L + 'apply 0014 (private testing)', MIGRATION_0014()))) return;
  // 2026-10-20: 0020, then camps' 0013 + 0017, then 0018 (in that order)
  if (!(await run(db, L + 'apply 0020 (current_session_id fix)', read('migrations', '0020_session_id_claims.sql')))) return;
  const [camps13, camps17] = CAMPS_FILES();
  if (!(await run(db, `${L}apply camps' 0013 (${path.basename(camps13)})`, CAMPS_0013()))) return;
  if (!(await run(db, `${L}apply camps' 0017 (${path.basename(camps17)})`, CAMPS_0017()))) return;
  if (!(await run(db, L + 'apply 0018 (private testing money in Finance)', MIGRATION_0018()))) return;

  // b. apply 0016; nothing earlier moves (every fingerprints file this
  // branch has for a live migration)
  const prints = ['0003', '0004', '0005', '0006', '0010', '0007', '0008', '0009', '0012', '0015', '0011', '0019', '0014', '0020', '0018']
    .map((n) => `${n}_fingerprints.sql`);
  const before = {};
  for (const f of prints) before[f] = await fingerprints(db, f);
  if (!(await run(db, L + 'apply 0016_black_belt.sql', read('migrations', '0016_black_belt.sql')))) return;
  const moved = [];
  for (const f of prints) {
    if (JSON.stringify(before[f]) !== JSON.stringify(await fingerprints(db, f))) moved.push(f.slice(0, 4));
  }
  record(`${L}${prints.map((f) => f.slice(0, 4)).join(' / ')} fingerprints identical before/after 0016`, moved.length === 0,
    moved.length ? `moved: ${moved.join(', ')}` : `${prints.length} files`);

  // c. 0016's tests, then every file it sits on top of
  const testFiles = [['0016_tests.sql', 'ALL 0016 TESTS PASSED'], ['verify_pin_tests.sql', 'ALL PIN TESTS PASSED'],
    ['0002_tests.sql', 'ALL 0002 TESTS PASSED'], ['0003_tests.sql', 'ALL 0003 TESTS PASSED'], ['0004_tests.sql', 'ALL 0004 TESTS PASSED'],
    ['0005_tests.sql', 'ALL 0005 TESTS PASSED'], ['0006_tests.sql', 'ALL 0006 TESTS PASSED'], ['0010_tests.sql', 'ALL 0010 TESTS PASSED'],
    ['0007_tests.sql', 'ALL 0007 TESTS PASSED'], ['0008_tests.sql', 'ALL 0008 TESTS PASSED'], ['0009_tests.sql', 'ALL 0009 TESTS PASSED'],
    ['0012_tests.sql', 'ALL 0012 TESTS PASSED'], ['0015_tests.sql', 'ALL 0015 TESTS PASSED'], ['0011_tests.sql', 'ALL 0011 TESTS PASSED'],
    ['0019_tests.sql', 'ALL 0019 TESTS PASSED'], ['0014_tests.sql', 'ALL 0014 TESTS PASSED'], ['0020_tests.sql', 'ALL 0020 TESTS PASSED'],
    [CAMPS_TESTS, 'ALL 0017 TESTS PASSED'], ['0018_tests.sql', 'ALL 0018 TESTS PASSED']];
  for (const [file, ok] of testFiles) {
    await runTestFile(db, `${L}${file} (after 0016)`, file, ok);
  }

  // d. the form's login, and a real-looking cycle + registration
  await bbRegistrarLiveChecks(db);
  if (await seedBbTestCycle(db)) {
    await runTestFile(db, L + '0016_tests.sql (with the Black Belt test cycle)', '0016_tests.sql', 'ALL 0016 TESTS PASSED');
    await runTestFile(db, L + '0015_tests.sql (with the Black Belt test cycle)', '0015_tests.sql', 'ALL 0015 TESTS PASSED');
    await runTestFile(db, L + '0011_tests.sql (with the Black Belt test cycle)', '0011_tests.sql', 'ALL 0011 TESTS PASSED');
    await runTestFile(db, L + '0018_tests.sql (with the Black Belt test cycle)', '0018_tests.sql', 'ALL 0018 TESTS PASSED');
  }

  // e. the same 0016 as on the main database (step 15)
  const mine = await fingerprints(db, '0016_fingerprints.sql');
  record(L + '0016 fingerprints identical to step 15 (main database)', !!main16 && JSON.stringify(mine) === JSON.stringify(main16),
    main16 ? `${mine.length} rows` : 'step 15 gave no fingerprints');
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

// ---------------------------------------------------------------------
// stepCamps: Camps (0013) - contract CONTRACT-0013.md section 2.2
// ---------------------------------------------------------------------
// The main database can't be used for this step: step 13g ends with the
// 0010 down-script, so it no longer looks like production. stepCamps
// therefore builds its OWN fresh database in production's (live) order,
// as step0016_after_new_students does up to the day camps went live
// (0001-0006, 0010, 0007, 0008, 0009, 0012, 0015, 0011 as production got
// it, 0019, 0014, 0020), and puts 0013 on top (0017 follows in f2):
//   a. 0013_fingerprints.sql must not contain the words the Supabase
//      connection refuses
//   b. the 0003 / 0004 / 0005 / 0006 / 0010 / 0011 fingerprints (and the
//      new students' 0007 / 0008 / 0009 / 0012 / 0015 / 0019, Color Belt's
//      0014 and 0020) are taken,
//      0013 is applied, and they must be IDENTICAL afterwards (0013 changed
//      none of their objects)
//   c. 0013_tests.sql, then every earlier test file again
//   d. "live" checks AS camps_registrar: every table, the counter, a
//      write, staff functions, helpers, the other forms' functions and
//      CREATE refused; camp_public_camp works; testing_registrar and
//      star_registrar can't run the camp functions
//   e. a TEST camp seeded here, two family sign-ups made AS
//      camps_registrar, one check-in and one payment; then 0013_tests.sql
//      again (before AND after a camp exists)
//   f. 0013 applied a SECOND time: no row changed, the fingerprints
//      identical, 0013_tests.sql and the 0005 / 0006 / 0010 / 0011 tests pass
//   f2. 0017 (camp payments in Finance) on top, and its Undo -
//      stepFinanceCamps (19b)
//   g. LAST: the "Undo 0013" script of SETUP.md (read from SETUP.md, so
//      the tested text is the documented text): afterwards no camp object
//      or camps_registrar is left, the earlier fingerprints equal step b's
//      (a database that never had 0013), and the earlier tests pass
// Returns 0013's fingerprints (printed at the end), or null.
async function stepCamps() {
  const L = '[camps] ';
  const CAMP_ACK_VERSION = 'camp-2026-10-18';
  const CAMP_CODE = 'pgcp2345';   // 8 characters from the public-code alphabet
  const CAMP_TABLES = ['camps', 'camp_days', 'camp_prices', 'camp_extras', 'camp_templates', 'camp_signups',
    'camp_campers', 'camp_camper_days', 'camp_camper_extras', 'camp_payments', 'camp_public_attempts'];
  // everything 0013 stores, plus the history's row count, as one md5
  const snapshotSql = `select md5(${CAMP_TABLES.map((t) =>
    `coalesce((select string_agg(to_jsonb(x)::text, ',' order by x.id) from public.${t} x), '')`).join(' || ')}
    || (select count(*) from public.change_log)::text)`;
  const earlier = async (cdb) => [
    ...(await fingerprints(cdb, '0003_fingerprints.sql')),
    ...(await fingerprints(cdb, '0004_fingerprints.sql')),
    ...(await fingerprints(cdb, '0005_fingerprints.sql')),
    ...(await fingerprints(cdb, '0006_fingerprints.sql')),
    ...(await fingerprints(cdb, '0010_fingerprints.sql')),
    ...(await fingerprints(cdb, '0011_fingerprints.sql')),
    ...(await fingerprints(cdb, '0007_fingerprints.sql')),
    ...(await fingerprints(cdb, '0008_fingerprints.sql')),
    ...(await fingerprints(cdb, '0009_fingerprints.sql')),
    ...(await fingerprints(cdb, '0012_fingerprints.sql')),
    ...(await fingerprints(cdb, '0015_fingerprints.sql')),
    ...(await fingerprints(cdb, '0019_fingerprints.sql')),
    ...(await fingerprints(cdb, '0014_fingerprints.sql')),
    ...(await fingerprints(cdb, '0020_fingerprints.sql')),
  ];
  const earlierTests = async (cdb, label) => {
    for (const n of ['0020', '0014', '0019', '0015', '0012', '0009', '0008', '0007']) {
      await runTestFile(cdb, `${L}${n}_tests.sql (${label})`, `${n}_tests.sql`, `ALL ${n} TESTS PASSED`);
    }
    await runTestFile(cdb, `${L}0011_tests.sql (${label})`, '0011_tests.sql', 'ALL 0011 TESTS PASSED');
    await runTestFile(cdb, `${L}0010_tests.sql (${label})`, '0010_tests.sql', 'ALL 0010 TESTS PASSED');
    await runTestFile(cdb, `${L}0006_tests.sql (${label})`, '0006_tests.sql', 'ALL 0006 TESTS PASSED');
    await runTestFile(cdb, `${L}0005_tests.sql (${label})`, '0005_tests.sql', 'ALL 0005 TESTS PASSED');
  };
  const campTests = (cdb, label) => runTestFile(cdb, `${L}0013_tests.sql (${label})`, '0013_tests.sql', 'ALL 0013 TESTS PASSED');

  // d. acting AS the camp form's login. Each statement must be refused
  // (permission denied), then camp_public_camp must work.
  const liveChecks = async (cdb) => {
    const refused = [
      ...CAMP_TABLES.map((t) => [`read ${t}`, `select 1 from public.${t} limit 1`]),
      ['read camp_roster', 'select 1 from public.camp_roster limit 1'],
      ['read testing_public_attempts', 'select 1 from public.testing_public_attempts limit 1'],
      ['read change_log', 'select 1 from public.change_log limit 1'],
      ['read staff', 'select 1 from public.staff limit 1'],
      ['read locations', 'select 1 from public.locations limit 1'],
      ['read auth.users', 'select 1 from auth.users limit 1'],
      ['use the reference counter', "select nextval('public.camp_signup_ref_seq')"],
      ['write camp_campers', 'update public.camp_campers set first_name = first_name'],
      ['write camp_payments', "insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_by_name) values (gen_random_uuid(), 'payment', 1, 'cash', current_date, 'worcester', 'x')"],
      ['write camp_public_attempts', "insert into public.camp_public_attempts (client_key, outcome) values ('k', 'ok')"],
      ['call a staff function', "select public.camp_mark_paid(gen_random_uuid(), 1, 'worcester')"],
      ['call the detail function', 'select public.camp_camper_detail(gen_random_uuid())'],
      ['call has_data_access', 'select public.has_data_access()'],
      ['call a helper', 'select public.camp_purge_old_signatures()'],
      ['call the sign-up core directly', `select public.camp_public_signup_core('${CAMP_CODE}', 'k', gen_random_uuid(), '[]'::jsonb, 'a', '5085550100', 'b', 'c', '5085550101', 'd', 'cash', true, '${TEST_SIGNATURE}', '${CAMP_ACK_VERSION}', 'x', 0)`],
      ['call testing_public_event', "select public.testing_public_event('abcdefgh')"],
      ['call star_public_event', "select public.star_public_event('abcdefgh')"],
      ['create a table in public', 'create table public.zz_camps_registrar_probe (x integer)'],
      ['create a schema', 'create schema zz_camps_registrar_probe'],
    ];
    let allRefused = true;
    const leaks = [];
    for (const [label, sql] of refused) {
      try {
        await cdb.exec('set role camps_registrar;');
        await cdb.exec(sql);
        allRefused = false;
        leaks.push(label);
      } catch (error) {
        if (!/permission denied|must be a member|not allowed/i.test(error.message)) {
          allRefused = false;
          leaks.push(`${label} (unexpected error: ${error.message})`);
        }
      } finally {
        await cdb.exec('reset role;').catch(() => {});
      }
    }
    record(`${L}[camps registrar] every table, the counter, writes, staff functions, helpers, the other forms and CREATE refused`,
      allRefused, leaks.join('; '));
    try {
      await cdb.exec('set role camps_registrar;');
      const r = await cdb.query("select public.camp_public_camp('zzzzzzzz') as r");
      record(`${L}[camps registrar] can call camp_public_camp`, r.rows[0].r?.status === 'not_found', JSON.stringify(r.rows[0].r));
    } catch (error) {
      record(`${L}[camps registrar] can call camp_public_camp`, false, error.message);
    } finally {
      await cdb.exec('reset role;').catch(() => {});
    }
    const crossed = [];
    for (const role of ['testing_registrar', 'star_registrar']) {
      for (const sql of ["select public.camp_public_camp('zzzzzzzz')",
        `select public.camp_public_signup('zzzzzzzz', 'k', gen_random_uuid(), '[]'::jsonb, 'a', '5085550100', 'b', 'c', '5085550101', 'd', 'cash', true, '${TEST_SIGNATURE}', '${CAMP_ACK_VERSION}', 'x', 0)`]) {
        try {
          await cdb.exec(`set role ${role};`);
          await cdb.exec(sql);
          crossed.push(`${role}: ${sql.slice(7, 40)}`);
        } catch (error) {
          if (!/permission denied/i.test(error.message)) crossed.push(`${role}: ${sql.slice(7, 40)} (${error.message})`);
        } finally {
          await cdb.exec('reset role;').catch(() => {});
        }
      }
    }
    record(`${L}[camps registrar] testing_registrar and star_registrar can't run the camp functions`, crossed.length === 0, crossed.join('; '));
  };

  // e. the seeded TEST camp: written as the SQL Editor would (postgres,
  // labelled), then two families sign up AS camps_registrar, then one
  // check-in and one payment (written directly, labelled)
  const seedCamp = async (cdb) => {
    const ok = await run(cdb, `${L}seed a TEST camp (Worcester, 2 days, open)`, `
      begin;
      select set_config('request.jwt.claims', '', true);
      select set_config('tkd.actor_label', 'PGlite test camp', true);
      select set_config('tkd.action', 'seed', true);
      select set_config('tkd.batch_id', gen_random_uuid()::text, true);
      insert into public.camps (location_code, both_schools, name, start_time, end_time, signup_opens_on, signup_closes_on,
                                early_until, min_age, max_age, description, waiver_text, public_code, created_by_name, updated_by_name)
      values ('worcester', false, 'PGlite Vacation Camp', '09:00', '15:00', public.testing_today() - 1, public.testing_today() + 1,
              public.testing_today() + 1, 5, 12, 'Bring a lunch.', 'I agree to the camp rules.', '${CAMP_CODE}', '', '');
      insert into public.camp_days (camp_id, day)
      select c.id, public.testing_today() + x from public.camps c, generate_series(0, 1) as x where c.public_code = '${CAMP_CODE}';
      insert into public.camp_prices (camp_id, day_count, member_early_cents, member_regular_cents, nonmember_early_cents, nonmember_regular_cents)
      select c.id, k, 7500 * k, 8000 * k, 8500 * k, 9000 * k from public.camps c, generate_series(1, 2) as k where c.public_code = '${CAMP_CODE}';
      insert into public.camp_extras (camp_id, name, price_cents, per, not_for_all_days, sort)
      select c.id, 'Early drop-off', 1500, 'day', false, 0 from public.camps c where c.public_code = '${CAMP_CODE}';
      select set_config('tkd.actor_label', '', true);
      select set_config('tkd.action', '', true);
      select set_config('tkd.batch_id', '', true);
      commit;`);
    if (!ok) return false;
    const ids = (await cdb.query(`select (select array_agg(d.id::text order by d.day) from public.camp_days d where d.camp_id = c.id) as days,
        (select e.id::text from public.camp_extras e where e.camp_id = c.id) as extra,
        md5(c.waiver_text) as waiver from public.camps c where c.public_code = '${CAMP_CODE}'`)).rows[0];
    let signedUp = 0;
    // Pat: 2 days member early $150 + drop-off on day 1 $15; Kim and Sam
    // Ray: 1 day non-member early $85 each
    const families = [
      [[{ first_name: 'Pat', last_name: 'Lee', age: 8, member: true, day_ids: ids.days, extras: [{ extra_id: ids.extra, day_ids: [ids.days[0]] }] }], 16500],
      [[{ first_name: 'Kim', last_name: 'Ray', age: 9, member: false, day_ids: [ids.days[0]], extras: [] },
        { first_name: 'Sam', last_name: 'Ray', age: 6, member: false, day_ids: [ids.days[1]], extras: [] }], 17000],
    ];
    for (const [children, total] of families) {
      try {
        await cdb.exec('set role camps_registrar;');
        const r = await cdb.query(
          `select public.camp_public_signup($1, $2, gen_random_uuid(), $3::jsonb, 'Test Parent', '5085550100', 'Parent',
                  'Test Contact', '5085550101', 'Friend', 'cash', true, $4, $5, $6, $7) as r`,
          [CAMP_CODE, 'pglite-camp-client-key', JSON.stringify(children), TEST_SIGNATURE, CAMP_ACK_VERSION, ids.waiver, total]);
        if (r.rows[0].r?.status === 'ok') signedUp += 1;
        else record(`${L}sign up ${children[0].first_name} as camps_registrar`, false, JSON.stringify(r.rows[0].r));
      } catch (error) {
        record(`${L}sign up ${children[0].first_name} as camps_registrar`, false, error.message);
      } finally {
        await cdb.exec('reset role;').catch(() => {});
      }
    }
    record(`${L}two family sign-ups (3 children) made AS camps_registrar`, signedUp === 2, `${signedUp} ok`);
    await run(cdb, `${L}one check-in and one payment for the TEST camp`, `
      begin;
      select set_config('tkd.actor_label', 'PGlite test camp', true);
      select set_config('tkd.action', 'seed', true);
      update public.camp_camper_days cd set checked_in_at = now(), checked_in_by_name = 'PGlite test camp'
        from public.camp_campers c, public.camp_days d
       where c.id = cd.camper_id and d.id = cd.day_id and c.first_name = 'Pat' and d.day = public.testing_today();
      insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_by_name)
      select c.id, 'payment', 16500, 'cash', public.testing_today(), 'worcester', 'PGlite test camp' from public.camp_campers c where c.first_name = 'Pat';
      select set_config('tkd.actor_label', '', true);
      select set_config('tkd.action', '', true);
      commit;`);
    const c = (await cdb.query(`select (select count(*)::int from public.camp_campers) as campers,
        (select count(*)::int from public.camp_signups where signature is not null) as signatures,
        (select count(*)::int from public.camp_camper_days where checked_in_at is not null) as checked_in,
        (select count(*)::int from public.camp_payments) as payments,
        (select count(*)::int from public.camp_public_attempts) as attempts,
        (select count(*)::int from public.change_log where coalesce(before::text, '') || coalesce(after::text, '') like '%data:image%') as pictures`)).rows[0];
    record(`${L}3 campers, 2 signatures, 1 check-in, 1 payment, 2 attempt rows, no picture in change_log`,
      c.campers === 3 && c.signatures === 2 && c.checked_in === 1 && c.payments === 1 && c.attempts === 2 && c.pictures === 0,
      JSON.stringify(c));
    return true;
  };

  // the fresh database, in production's order
  console.log('\nMigration 0013 (Camps), on its own fresh database:');
  const cdb = await buildBase(L);
  if (!cdb) return null;
  // the live order (as step0016_after_new_students): 0003-0006, 0010, the
  // new-students files, 0015, 0011 as production got it (the 2026-10-19
  // copy, then today's over it), 0019, 0014, 0020 - what production had
  // when 0013 + 0017 were pasted on 2026-10-20 (0018 came after them)
  for (const file of ['0003_testing_classes_ranks.sql', '0004_staff_accounts.sql', '0005_testing_events.sql',
    '0006_star_testing.sql', '0010_testing_results.sql', '0007_schedule.sql', '0008_calendar.sql', '0009_forms.sql',
    '0012_prospects.sql', '0015_family_history.sql']) {
    if (!(await run(cdb, `${L}apply ${file}`, read('migrations', file)))) return null;
  }
  if (!(await run(cdb, `${L}apply 0011 as pasted on production 2026-10-19 (fixture)`,
    readFileSync(path.join(here, 'fixtures', '0011_as_applied_2026-10-19.sql'), 'utf8')))) return null;
  for (const file of ['0011_finance.sql', '0019_school_phone.sql', '0014_testing_private.sql', '0020_session_id_claims.sql']) {
    if (!(await run(cdb, `${L}apply ${file}`, read('migrations', file)))) return null;
  }

  // a. connector-safe fingerprints file
  record(`${L}0013_fingerprints.sql contains neither "delete" nor "drop" (connector-safe)`,
    !/delete|drop/i.test(read('tests', '0013_fingerprints.sql')));

  // b. apply 0013; the earlier fingerprints don't move
  const earlierBefore = await earlier(cdb);
  if (!(await run(cdb, `${L}apply 0013_camps.sql`, read('migrations', '0013_camps.sql')))) return null;
  record(`${L}0003-0012 / 0014 / 0015 / 0019 / 0020 fingerprints identical before/after 0013`,
    JSON.stringify(earlierBefore) === JSON.stringify(await earlier(cdb)), `${earlierBefore.length} rows`);

  // c. the tests
  await campTests(cdb, 'no camp yet');
  await earlierTests(cdb, 'after 0013');
  await runTestFile(cdb, `${L}0004_tests.sql (after 0013)`, '0004_tests.sql', 'ALL 0004 TESTS PASSED');
  await runTestFile(cdb, `${L}0003_tests.sql (after 0013)`, '0003_tests.sql', 'ALL 0003 TESTS PASSED');
  await runTestFile(cdb, `${L}0002_tests.sql (after 0013)`, '0002_tests.sql', 'ALL 0002 TESTS PASSED');
  await runTestFile(cdb, `${L}verify_pin_tests.sql (after 0013)`, 'verify_pin_tests.sql', 'ALL PIN TESTS PASSED');

  // d. live checks as the camp form's login
  await liveChecks(cdb);

  // e. a seeded TEST camp, then the tests again
  if (await seedCamp(cdb)) await campTests(cdb, 'with the TEST camp');

  // f. re-run safety
  const before13 = await fingerprints(cdb, '0013_fingerprints.sql');
  const dataBefore = await one(cdb, snapshotSql);
  await run(cdb, `${L}apply 0013 a SECOND time (re-run safety)`, read('migrations', '0013_camps.sql'));
  record(`${L}0013 re-run kept every row unchanged (11 camp tables, change_log)`, dataBefore === (await one(cdb, snapshotSql)));
  const after13 = await fingerprints(cdb, '0013_fingerprints.sql');
  record(`${L}0013 fingerprints identical before/after re-run`, JSON.stringify(before13) === JSON.stringify(after13), `${after13.length} rows`);
  record(`${L}earlier fingerprints still identical after the 0013 re-run`,
    JSON.stringify(earlierBefore) === JSON.stringify(await earlier(cdb)));
  await campTests(cdb, 'after re-run');
  await earlierTests(cdb, 'after the 0013 re-run');
  await liveChecks(cdb);

  // 19b. 0017 (camp payments in Finance) on this production-order
  // database: Color Belt / Star lines identical, tests, re-run, and its
  // Undo (which must come BEFORE the Undo 0013)
  await stepFinanceCamps(cdb, `${L}[0017] `, true);

  // g. the Undo 0013 script, exactly as SETUP.md has it (the first sql
  // block after its "### ... Undo 0013" heading)
  const setup = read('SETUP.md').replace(/\r\n/g, '\n');
  const at = setup.search(/^### [0-9]+[a-z]?\. Undo 0013/m);
  const block = at < 0 ? null : setup.slice(at).match(/```sql\n([\s\S]*?)```/);
  if (!block) {
    record(`${L}[undo 0013] find the script in SETUP.md`, false, 'no sql block after a "### .. Undo 0013" heading');
  } else if (await run(cdb, `${L}[undo 0013] the SQL block of SETUP.md`, block[1])) {
    const left = (await cdb.query(`select string_agg(x, ', ') as left from (
        select 'relation ' || c.relname as x from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and (c.relname = 'camps' or c.relname like 'camp\\_%')
        union all
        select 'function ' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and (p.proname like 'camp\\_%' or p.proname like 'camps\\_%')
        union all
        select 'type ' || t.typname from pg_type t join pg_namespace n on n.oid = t.typnamespace
         where n.nspname = 'public' and (t.typname = 'camps' or t.typname like 'camp\\_%')
        union all
        select 'role ' || r.rolname from pg_roles r where r.rolname = 'camps_registrar') as q`)).rows[0].left;
    record(`${L}[undo 0013] no camp object and no camps_registrar left`, left === null, left ?? '');
    record(`${L}[undo 0013] earlier fingerprints equal a database that never had 0013`,
      JSON.stringify(earlierBefore) === JSON.stringify(await earlier(cdb)));
    await earlierTests(cdb, 'after Undo 0013');
    await runTestFile(cdb, `${L}0003_tests.sql (after Undo 0013)`, '0003_tests.sql', 'ALL 0003 TESTS PASSED');
  }
  return after13;
}

// ---------------------------------------------------------------------
// stepFinanceCamps: camp payments in Finance (0017) - rulebook v0.707
// ---------------------------------------------------------------------
// 0017 runs after 0011 and 0013 and replaces five Finance functions so
// camp payments count as a third source. Checked here:
//   19a. on the MAIN database (it has the Color Belt and Star sample
//        payments of steps 11c / 12e / 14d): 0013 is put on, then every
//        Finance answer the app uses (the Daily report of both schools for
//        today and yesterday, Both, History, Export + preview, the detail
//        of every payment) is taken as an admin, 0017 is applied, and the
//        answers must be IDENTICAL (no camp payment exists yet); then
//        0017_tests.sql, 0011_tests.sql and 0013_tests.sql; 0017 applied a
//        second time (no row, no fingerprint changes); last the "Undo
//        0017" of SETUP.md: the 0011 fingerprints equal a database that
//        never had 0017, and 0011_tests.sql passes
//   19b. (in stepCamps, f2) the same on the production-order database
//   19c. SPEED: a fresh database with 0011's big seed + a big camp seed
//        (finance_camps_perf_seed.sql); every Finance function timed, the
//        export's camp total must equal the money in camp_payments, a busy
//        camp day can be closed; once sorting text byte by byte (PGlite)
//        and once like production (ICU en-US), with 0017_tests.sql and
//        0011_tests.sql there too
const CAMPS_ADMIN_SID = '44444444-4444-4444-8444-444444444444';

// An unlocked admin session for the rest of this connection (like the
// speed check's). Returns a function that ends it again.
async function campsAdminSession(db) {
  await db.exec(`insert into auth.sessions (id, user_id) values ('${CAMPS_ADMIN_SID}', '${ADMIN_UID}') on conflict do nothing;
    delete from public.session_unlock where session_id = '${CAMPS_ADMIN_SID}';
    insert into public.session_unlock (session_id, staff_id, unlocked_until) values ('${CAMPS_ADMIN_SID}', '${ADMIN_UID}', now() + interval '1 hour');`);
  const claims = JSON.stringify({ sub: ADMIN_UID, role: 'authenticated', session_id: CAMPS_ADMIN_SID,
    amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) - 60 }] });
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [claims]);
  return async () => { await db.query(`select set_config('request.jwt.claims', '', false)`); };
}

// Every Finance answer the app uses, for today and yesterday, as one text
// (payment details: every chain of those two days, in a fixed order).
// "onlyOld" = the database already has camp payments (step 19b), so a
// school's day that HAS camp money differs on purpose after 0017. Then:
//   * a Daily report of such a (school, day) is compared by its Color Belt
//     / Star lines only; every other Daily report is compared whole
//   * Both: the boxes of schools without camp money that day, whole
//   * History: the days (rows) of schools / days without camp money, whole
//     (unclosed_count is left out only when such a row was left out)
//   * the export preview: whole for a school with no camp money in the
//     range, else left out (a marker says so)
async function campsFinanceAnswers(db, onlyOld = false) {
  const end = await campsAdminSession(db);
  try {
    const q = async (sql) => (await db.query(sql)).rows[0].r;
    const campDays = new Set((await db.query(`select distinct p.school || '|' || p.paid_on::text as k
        from public.camp_payments p`)).rows.map((r) => r.k));
    const hasCamp = (school, day) => onlyOld && campDays.has(`${school}|${day}`);
    const campSchool = (school) => onlyOld && [...campDays].some((k) => k.startsWith(`${school}|`));
    const out = [];
    for (const day of ['public.testing_today() - 1', 'public.testing_today()']) {
      for (const school of ['worcester', 'shrewsbury']) {
        const a = await q(`select public.finance_day('${school}', ${day}) as r`);
        out.push(hasCamp(school, a.day) ? { cb_star_items: a.items.filter((x) => x.source !== 'camp') } : a);
      }
      const both = await q(`select public.finance_day_both(${day}) as r`);
      const kept = both.schools.filter((x) => !hasCamp(x.code, both.day));
      out.push(kept.length === both.schools.length ? both : { day: both.day, schools: kept });
    }
    for (const school of [null, 'worcester', 'shrewsbury']) {
      const h = await q(`select public.finance_history(${school ? `'${school}'` : 'null'}, public.testing_today()) as r`);
      const kept = h.days.filter((x) => !hasCamp(x.school, x.day));
      out.push(kept.length === h.days.length ? h : { month: h.month, days: kept });
    }
    for (const school of ['worcester', 'shrewsbury']) {
      out.push(campSchool(school) ? `preview ${school}: has camp money, left out`
        : await q(`select public.finance_export_preview('${school}', public.testing_today() - 30, public.testing_today()) as r`));
    }
    const chains = (await db.query(`select distinct m.source, m.payment_id::text as id
        from public.finance_money_rows(null, public.testing_today() - 1, public.testing_today()) m
       where m.source in ('color_belt', 'star') order by 1, 2`)).rows;
    for (const c of chains) out.push(await q(`select public.finance_payment_detail('${c.source}', '${c.id}') as r`));
    return JSON.stringify({ out, chains: chains.length });
  } finally {
    await end();
  }
}

// Export rows (a write: it logs one finance_exports row) are compared on
// their own, inside a transaction that is rolled back.
async function campsExportRows(db, onlyOld = false) {
  const end = await campsAdminSession(db);
  try {
    await db.exec('begin;');
    const rows = [];
    for (const school of ['worcester', 'shrewsbury']) {
      const r = (await db.query(`select public.finance_export('${school}', public.testing_today() - 30, public.testing_today()) as r`)).rows[0].r;
      rows.push(onlyOld ? { ...r, rows: (r.rows ?? []).filter((x) => x.what !== 'camp') } : r);
    }
    return JSON.stringify(rows);
  } finally {
    await db.exec('rollback;').catch(() => {});
    await end();
  }
}

// The "Undo 0017" of SETUP.md: step 1 re-run 0011, step 2 its SQL block
// (the first sql block after the "### ... Undo 0017" heading).
async function campsUndo0017(db, tag) {
  const setup = read('SETUP.md').replace(/\r\n/g, '\n');
  const at = setup.search(/^### [0-9]+[a-z]?\. Undo 0017/m);
  const block = at < 0 ? null : setup.slice(at).match(/```sql\n([\s\S]*?)```/);
  if (!block) {
    record(`${tag}[undo 0017] find the script in SETUP.md`, false, 'no sql block after a "### .. Undo 0017" heading');
    return false;
  }
  if (!(await run(db, `${tag}[undo 0017] step 1: re-run 0011_finance.sql`, read('migrations', '0011_finance.sql')))) return false;
  return run(db, `${tag}[undo 0017] step 2: the SQL block of SETUP.md`, block[1]);
}

// 19a / 19b on a database that has 0011 + 0013 (and Color Belt / Star
// payments). onlyOld: that database already has camp payments.
async function stepFinanceCamps(db, tag, onlyOld = false) {
  record(`${tag}0017_fingerprints.sql contains neither "delete" nor "drop" (connector-safe)`,
    !/delete|drop/i.test(read('tests', '0017_fingerprints.sql')));
  const prints11 = await fingerprints(db, '0011_fingerprints.sql');
  const before = await campsFinanceAnswers(db, onlyOld);
  const exportBefore = await campsExportRows(db, onlyOld);
  if (!(await run(db, `${tag}apply 0017_finance_camps.sql`, read('migrations', '0017_finance_camps.sql')))) return null;
  const after = await campsFinanceAnswers(db, onlyOld);
  const exportAfter = await campsExportRows(db, onlyOld);
  record(`${tag}Color Belt and Star answers identical before/after 0017 (Daily report, Both, History, Export, preview, details)`,
    before === after && exportBefore === exportAfter, `${JSON.parse(before).chains} payment chains, ${before.length} characters`);
  await runTestFile(db, `${tag}0017_tests.sql`, '0017_tests.sql', 'ALL 0017 TESTS PASSED');
  await runTestFile(db, `${tag}0011_tests.sql (after 0017)`, '0011_tests.sql', 'ALL 0011 TESTS PASSED');
  await runTestFile(db, `${tag}0013_tests.sql (after 0017)`, '0013_tests.sql', 'ALL 0013 TESTS PASSED');
  // re-run safety
  const prints17 = await fingerprints(db, '0017_fingerprints.sql');
  const rowsSql = `select md5(coalesce((select string_agg(to_jsonb(x)::text, ',' order by x.id) from public.finance_day_closing_items x), '')
      || coalesce((select string_agg(to_jsonb(x)::text, ',' order by x.id) from public.camp_payments x), '')
      || (select count(*) from public.change_log)::text)`;
  const rowsBefore = await one(db, rowsSql);
  await run(db, `${tag}apply 0017 a SECOND time (re-run safety)`, read('migrations', '0017_finance_camps.sql'));
  record(`${tag}0017 re-run: no row changed, fingerprints identical`,
    rowsBefore === (await one(db, rowsSql)) && JSON.stringify(prints17) === JSON.stringify(await fingerprints(db, '0017_fingerprints.sql')),
    `${prints17.length} rows`);
  await runTestFile(db, `${tag}0017_tests.sql (after re-run)`, '0017_tests.sql', 'ALL 0017 TESTS PASSED');
  // Undo 0017 (SETUP.md)
  if (await campsUndo0017(db, tag)) {
    record(`${tag}[undo 0017] the 0011 fingerprints equal a database that never had 0017`,
      JSON.stringify(prints11) === JSON.stringify(await fingerprints(db, '0011_fingerprints.sql')));
    await runTestFile(db, `${tag}[undo 0017] 0011_tests.sql`, '0011_tests.sql', 'ALL 0011 TESTS PASSED');
  }
  return prints17;
}

// 19c. Speed and right answers with realistic volume, on a fresh database
// (icu = sort text like production).
async function campsFinanceSpeed(icu) {
  const tag = icu ? '[camps icu] ' : '[camps speed] ';
  const { mkdtempSync, rmSync } = await import('node:fs');
  const os = await import('node:os');
  const dir = icu ? mkdtempSync(path.join(os.tmpdir(), 'tkd-pglite-icu-camps-')) : null;
  let db = null;
  try {
    if (icu) {
      const maker = new PGlite({ dataDir: dir, extensions: { pgcrypto } });
      await maker.exec(`create database tkd_icu template template0 encoding 'UTF8' locale_provider icu icu_locale 'en-US' locale 'C'`);
      await maker.close();
      db = new PGlite({ dataDir: dir, database: 'tkd_icu', extensions: { pgcrypto } });
      const order = await db.query(`select string_agg(x, ' ' order by x) as o from (values ('camp'), ('color_belt'), ('star'), ('~end')) as v(x)`);
      record(`${tag}the database sorts text like production (~end first)`, order.rows[0].o === '~end camp color_belt star', order.rows[0].o);
      if (!(await buildBase(tag, db))) return;
    } else {
      db = await buildBase(tag);
      if (!db) return;
    }
    if (!(await run(db, `${tag}0003 + seed + 0004 + 0005 + 0006 + 0010 + 0011 + 0013 + 0017`,
      read('migrations', '0003_testing_classes_ranks.sql') + '\n' + builtInSeedSql() + '\n'
      + read('migrations', '0004_staff_accounts.sql') + '\n' + read('migrations', '0005_testing_events.sql') + '\n'
      + read('migrations', '0006_star_testing.sql') + '\n' + read('migrations', '0010_testing_results.sql') + '\n'
      + read('migrations', '0011_finance.sql') + '\n' + read('migrations', '0013_camps.sql') + '\n'
      + read('migrations', '0017_finance_camps.sql')))) return;
    await runTestFile(db, `${tag}0017_tests.sql (empty database)`, '0017_tests.sql', 'ALL 0017 TESTS PASSED');
    await runTestFile(db, `${tag}0011_tests.sql (empty database)`, '0011_tests.sql', 'ALL 0011 TESTS PASSED');
    const t0 = Date.now();
    if (!(await run(db, `${tag}big seeds (finance_perf_seed.sql + finance_camps_perf_seed.sql)`,
      readFileSync(path.join(here, 'finance_perf_seed.sql'), 'utf8') + '\n'
      + readFileSync(path.join(here, 'finance_camps_perf_seed.sql'), 'utf8')))) return;
    const counts = (await db.query(`select (select count(*) from public.testing_payments) + (select count(*) from public.star_payments) as old,
        (select count(*) from public.camp_payments) as camp`)).rows[0];
    record(`${tag}about 11,000 Color Belt / Star rows and 4,000 camp rows`, Number(counts.old) > 10000 && Number(counts.camp) > 3500,
      `${counts.old} + ${counts.camp} rows in ${Date.now() - t0} ms`);
    const end = await campsAdminSession(db);
    const today = await one(db, 'select public.testing_today()::text');
    const busy = await one(db, `select paid_on::text from public.camp_payments group by paid_on order by count(*) desc, paid_on limit 1`);
    const chain = await one(db, `select p.id::text from public.camp_payments p join public.camp_campers c on c.id = p.camper_id
       where c.last_name = 'Camp 14' and p.kind = 'payment' and p.amount_cents = 7500`);
    const answers = {};
    const timed = async (label, sql, params = []) => {
      try {
        await db.exec('set role authenticated;');
        const t = performance.now();
        const r = await db.query(sql, params);
        const ms = Math.round(performance.now() - t);
        const status = r.rows[0].r?.status;
        record(`${tag}${label} under 2 s`, status === 'ok' && ms < 2000, `${ms} ms, ${status}`);
        return r.rows[0].r;
      } catch (error) {
        record(`${tag}${label} under 2 s`, false, error.message);
        return null;
      } finally {
        await db.exec('reset role;').catch(() => {});
      }
    };
    for (const [label, sql] of [
      ['finance_day (Worcester, today)', `select public.finance_day('worcester', '${today}') as r`],
      ['finance_day (Shrewsbury, the busiest camp day)', `select public.finance_day('shrewsbury', '${busy}') as r`],
      ['finance_day_both (the busiest camp day)', `select public.finance_day_both('${busy}') as r`],
      ['finance_history (both schools, this month)', `select public.finance_history(null, '${today}') as r`],
      ['finance_payment_detail (a camp payment: edited and moved to the other school)', `select public.finance_payment_detail('camp', '${chain}') as r`],
      ['finance_home', 'select public.finance_home() as r'],
      ['finance_export (Worcester, 366 days)', `select public.finance_export('worcester', date '${today}' - 365, '${today}') as r`],
      ['finance_export (Shrewsbury, 366 days)', `select public.finance_export('shrewsbury', date '${today}' - 365, '${today}') as r`],
      ['finance_export_preview (Shrewsbury, 366 days)', `select public.finance_export_preview('shrewsbury', date '${today}' - 365, '${today}') as r`],
    ]) answers[label] = await timed(label, sql);
    // right answers: the export's counted camp money = the money in camp_payments at that school
    for (const school of ['worcester', 'shrewsbury']) {
      const label = `finance_export (${school === 'worcester' ? 'Worcester' : 'Shrewsbury'}, 366 days)`;
      const rows = answers[label]?.rows ?? [];
      const exported = rows.filter((r) => r.what === 'camp').reduce((n, r) => n + r.counted_cents, 0);
      const money = Number(await one(db, `select coalesce(sum(amount_cents), 0) from public.camp_payments where school = '${school}'`));
      record(`${tag}${school}: the export's camp total equals the camp money taken there; rows of all three sources`,
        exported === money && money > 0 && ['camp', 'color_belt', 'star'].every((w) => rows.some((r) => r.what === w)),
        `export ${exported}, camp_payments ${money}, ${rows.length} rows`);
    }
    const detail = answers['finance_payment_detail (a camp payment: edited and moved to the other school)'];
    record(`${tag}the camp payment's detail: edited to $80 cash at the other school`,
      detail?.item?.source === 'camp' && detail?.item?.amount_cents === 8000 && detail?.item?.school === 'shrewsbury'
        && detail?.history?.length === 2, JSON.stringify(detail?.item ?? detail));
    // Close the busiest camp day at Shrewsbury with what it expects
    await db.exec('set role authenticated;');
    const d = (await db.query(`select public.finance_day('shrewsbury', '${busy}') as r`)).rows[0].r;
    await db.exec('reset role;');
    const campItems = (d.items ?? []).filter((i) => i.source === 'camp' && ['counted', 'edited', 'moved_in'].includes(i.state));
    record(`${tag}the busiest camp day has camp lines with event_name`, campItems.length > 0
      && campItems.every((i) => i.event_name === 'PGlite Perf Camp'), `${campItems.length} counting camp lines`);
    const closed = await timed('finance_close_day (the busiest camp day)', `select public.finance_close_day('shrewsbury', '${busy}', $1, $2, $3, $4, $5, 'speed check') as r`,
      [d.fingerprint, d.totals.cash.cents + d.refunds.cash_cents, d.totals.check.count, d.totals.check.cents, d.totals.card.cents]);
    record(`${tag}the close expected exactly the day's money`, closed?.results?.cash?.result === 'matches'
      && closed?.results?.card?.result === 'matches', JSON.stringify(closed?.results));
    await end();
    await runTestFile(db, `${tag}0017_tests.sql (with the big seeds)`, '0017_tests.sql', 'ALL 0017 TESTS PASSED');
  } catch (error) {
    record(`${tag}the camp finance speed database`, false, error.message);
  } finally {
    if (db) await db.close().catch(() => {});
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
}

// =====================================================================
// step0024 / step0024_production_order: 0024 (the Black Belt rubric
// editor, rulebook v0.921-v0.934; CONTRACT-0024.md section 11.4)
// =====================================================================
const MIGRATION_0024 = () => read('migrations', '0024_black_belt_rubric.sql');

// Everything 0024 keeps or changes, plus the history's row count, as one
// md5 ("re-running 0024 changed nothing").
const snapshot24Sql = `select md5(
     coalesce((select string_agg(to_jsonb(x)::text, ',' order by x.id) from public.bb_default_rubric x), '')
  || coalesce((select string_agg(to_jsonb(x)::text, ',' order by x.id) from public.bb_rubric_undo x), '')
  || coalesce((select string_agg(to_jsonb(x)::text, ',' order by x.id) from public.bb_cycles x), '')
  || (select count(*) from public.change_log)::text)`;

// The 19 functions 0024 adds (contract section 15) and the 4 it replaces.
const FNS_0024_NEW = ['bb_save_default_dan', 'bb_undo_default_dan', 'bb_save_cycle_dan', 'bb_undo_cycle_dan', 'bb_undo_first_open',
  'bb_rubric_num_ok', 'bb_rubric_int_ok', 'bb_rubric_letters', 'bb_rubric_brackets_problems', 'bb_rubric_dan_problems',
  'bb_rubric_is_valid', 'bb_rubric_part_max', 'bb_rubric_most_points', 'bb_rubric_from_v1', 'bb_rubric_fresh_copy',
  'bb_rubric_public', 'bb_rubric_put_dan', 'bb_default_rubric_guard', 'bb_rubric_undo_guard'];
const FNS_0024_REPLACED = ['bb_add_cycle', 'bb_set_registration', 'bb_public_cycle', 'bb_cycles_rules'];

// 11.3: what 0016_fingerprints.sql may print differently after 0024 -
// exactly this, nothing looser. "before" / "after" are the printed lines
// ("kind  item  detail"). Answers [] when the difference is exactly that,
// else a list of what is wrong.
function diff0016(before, after) {
  const split = (line) => { const [kind, item, ...rest] = line.split('  '); return { kind, item, detail: rest.join('  '), line }; };
  const b = before.map(split);
  const a = after.map(split);
  const key = (r) => r.kind + '  ' + r.item;
  const bMap = new Map(b.map((r) => [key(r), r]));
  const aMap = new Map(a.map((r) => [key(r), r]));
  const wrong = [];
  for (const r of b) {
    const x = aMap.get(key(r));
    if (!x) { wrong.push(`row gone: ${r.line.slice(0, 80)}`); continue; }
    if (x.detail === r.detail) continue;
    const name = r.item.split('(')[0];
    if (r.kind === 'function' && FNS_0024_REPLACED.includes(name)) {
      // only the md5 may change
      const tail = (d) => d.slice(d.indexOf(' definer='));
      if (tail(x.detail) !== tail(r.detail) || x.detail.split(' ')[0] === r.detail.split(' ')[0]) wrong.push(`${r.item}: more than the md5 changed (or not the md5)`);
    } else if (r.kind === 'trigger' && r.item === 'bb_cycles.bb_cycles_before_write') {
      const want = r.detail.replace("prices_from', '')", "prices_from', 'requirements')");
      if (want === r.detail || x.detail !== want) wrong.push(`bb_cycles_before_write: not exactly the new no-bump argument (${x.detail.slice(0, 160)})`);
    } else if (r.kind === 'constraint' && r.item === 'bb_cycles.bb_cycles_requirements_check') {
      if (r.detail !== 'CHECK (bb_requirements_is_valid(requirements))' || x.detail !== 'CHECK (bb_rubric_is_valid(requirements))') {
        wrong.push(`bb_cycles_requirements_check: ${r.detail} -> ${x.detail}`);
      }
    } else {
      wrong.push(`changed: ${r.line.slice(0, 100)}`);
    }
  }
  // the four functions must really have changed
  for (const n of FNS_0024_REPLACED) {
    const r = b.find((x) => x.kind === 'function' && x.item.startsWith(n + '('));
    const x = r && aMap.get(key(r));
    if (!r || !x || r.detail === x.detail) wrong.push(`${n}: its md5 should have changed`);
  }
  const added = a.filter((r) => !bMap.has(key(r)));
  const addedNames = added.map((r) => (r.kind === 'function' ? r.item.split('(')[0] : `${r.kind} ${r.item}`)).sort();
  if (JSON.stringify(addedNames) !== JSON.stringify([...FNS_0024_NEW].sort())) {
    wrong.push(`added rows: ${addedNames.join(', ')} (expected exactly the 19 new functions)`);
  }
  return wrong;
}

// Every fingerprint file of these migrations, as {file: lines}.
async function printsOf(db, numbers) {
  const out = {};
  for (const n of numbers) out[`${n}_fingerprints.sql`] = await fingerprints(db, `${n}_fingerprints.sql`);
  return out;
}

// 4.3's comparison for one cycle: its version 1 sheet (from before 0024)
// against what is stored now, flattened into rows by the SAME two
// functions as 0024_tests.sql U3 (taken from that file), both "except"
// directions empty. Answers the differing rows (empty = no number changed).
async function flatDiff(db, v1, v2) {
  const text = read('tests', '0024_tests.sql').replace(/\r\n/g, '\n');
  const f1 = text.match(/create function pg_temp\.bbr_flat_v1[\s\S]*?\n {4}\$b\$;/);
  const f2 = text.match(/create function pg_temp\.bbr_flat_v2[\s\S]*?\n {4}\$b\$;/);
  if (!f1 || !f2) throw new Error('could not find bbr_flat_v1 / bbr_flat_v2 in 0024_tests.sql');
  await db.exec('begin;');
  try {
    await db.exec(f1[0] + '\n' + f2[0]);
    const r = await db.query(`select x from ((select pg_temp.bbr_flat_v1($1::jsonb) except select pg_temp.bbr_flat_v2($2::jsonb))
        union all (select pg_temp.bbr_flat_v2($2::jsonb) except select pg_temp.bbr_flat_v1($1::jsonb))) as q(x)`,
      [JSON.stringify(v1), JSON.stringify(v2)]);
    return r.rows.map((row) => row.x);
  } finally {
    await db.exec('rollback;');
  }
}

// (i) one case of 0024_rubric_cases.json through the SQL validator: the
// changes applied to Dan <dan_no> of the stored default (or to the whole
// document), then the sorted, de-duplicated codes / bb_rubric_is_valid.
// (A "value_json" op is cast from its text straight to jsonb, so 18.0 stays
// 18.0 - JSON.stringify would have written it as 18.)
async function rubricCase(db, c) {
  const sql = `with recursive o as (select e, n from jsonb_array_elements($1::jsonb) with ordinality as t(e, n)),
    w(i, d) as (select 0::bigint, ${c.dan_no ? `r.sheet -> 'dans' -> ($2::int - 1)` : `r.sheet || jsonb_build_object('zz', $2::int) - 'zz'`}
                  from public.bb_default_rubric r
      union all select w.i + 1,
             case when o.e ->> 'op' = 'set' then jsonb_set(w.d, array(select jsonb_array_elements_text(o.e -> 'path')),
                    case when o.e ? 'value_json' then (o.e ->> 'value_json')::jsonb else o.e -> 'value' end, true)
                  else w.d #- array(select jsonb_array_elements_text(o.e -> 'path')) end
        from w join o on o.n = w.i + 1)
    select ${c.dan_no ? `(select coalesce(jsonb_agg(distinct p ->> 'code' order by p ->> 'code'), '[]')
                            from jsonb_array_elements(public.bb_rubric_dan_problems(d, $2::int)) p)`
                      : 'public.bb_rubric_is_valid(d)'} as r
      from w order by i desc limit 1`;
  return (await db.query(sql, [JSON.stringify(c.ops), c.dan_no ?? 0])).rows[0].r;
}

// keys sorted at every level, so two JSON values compare as text
const canon = (v) => (Array.isArray(v) ? v.map(canon)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);

// An admin's call in its own transaction (rolled back unless keep = true).
async function asBbAdmin(db, fn, keep = false) {
  const claims = await bbAdminClaims(db);
  await db.exec('begin;');
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
    const out = await fn();
    await db.exec(keep ? 'commit;' : 'rollback;');
    return out;
  } catch (error) {
    await db.exec('rollback;').catch(() => {});
    throw error;
  }
}

// A valid Add cycle payload (days in the future), as seedBbTestCycle's.
const bb24Payload = (name, first) => `jsonb_build_object(
    'name', '${name}', 'application_due', public.testing_today() + ${first - 10},
    'submissions_due', public.testing_today() + ${first}, 'auto_close', true,
    'days', jsonb_build_array(
      jsonb_build_object('name', 'Physical', 'day_date', public.testing_today() + ${first}, 'start_time', '12:30', 'end_time', '14:30',
                         'place', jsonb_build_object('code', 'worcester'), 'second', null, 'parts', jsonb_build_array('physical')),
      jsonb_build_object('name', 'Technical and Curriculum', 'day_date', public.testing_today() + ${first + 7}, 'start_time', '12:30',
                         'end_time', '17:00', 'place', jsonb_build_object('code', 'shrewsbury'), 'second', null,
                         'parts', jsonb_build_array('technical', 'curriculum'))),
    'plans', jsonb_build_array(jsonb_build_object('name', 'In full',
      'payments', jsonb_build_array(jsonb_build_object('due_on', public.testing_today() + ${first - 10}, 'follows_application_due', true)),
      'amounts', jsonb_build_object('1', jsonb_build_array(87000), '2', jsonb_build_array(99000),
                                    '3', jsonb_build_array(150000), '4', jsonb_build_array(270000)))),
    'kukkiwon', jsonb_build_object('1', 10000, '2', 11000, '3', 14000, '4', 17000),
    'prices_from', null)`;

// =====================================================================
// step0024 on the MAIN database, right after stepBlackBelt (contract
// 11.4):
//   a.  the fingerprints of every migration already there (printed)
//   a'. the version-aware 0016_tests.sql BEFORE 0024 (its pre-0024 arms)
//   b.  two test cycles through 0016's bb_add_cycle (version 1 sheets),
//       one opened; every cycle's sheet and version kept as a snapshot
//   c.  0024 applied
//   d.  every earlier fingerprint file byte-identical, except
//       0016_fingerprints.sql, which differs by EXACTLY 11.3's list
//   e.  every cycle (the opened ones too): no number changed (4.3), the
//       version unchanged, one bb_rubric_upgrade history row each
//   f.  0024_tests.sql, then every earlier test file
//   g.  0024 a SECOND time: no second seed or conversion, nothing logged,
//       fingerprints identical, 0024_tests.sql again
//   h.  the stored default = Builder B's src/lib/blackBelt/rubricDefault.js
//   i.  every case of 0024_rubric_cases.json through the SQL validator
//   j.  AS bb_registrar: the two new tables and the five functions
//       refused; bb_public_cycle answers the public view
//   m.  time limits (the rubric rule runs on every cycle update)
//   k.  on a COPY: the "Undo 0024" block of SETUP 0024f exactly as
//       written (refused while a cycle exists; then, without cycles, it
//       works), 0016 again: 0016's fingerprints back to (a), its tests
//       pass; then 0024 again
//   l.  on a COPY: 0016 re-run over 0024 -> 0024_fingerprints' check row
//       says RE-RUN; 0024 again -> ok
// Returns 0024's fingerprints (or null if 0024 could not be applied).
// =====================================================================
async function step0024(db) {
  const L = '[0024] ';
  const printsText = read('tests', '0024_fingerprints.sql');
  record(L + '0024_fingerprints.sql contains neither "delete" nor "drop" (connector-safe)', !/delete|drop/i.test(printsText));

  // a. the fingerprints of every migration on the main database now
  const has14 = await one(db, `select to_regclass('public.testing_private') is not null`);
  const numbers = ['0003', '0004', '0005', '0006', '0010', '0011', ...(has14 ? ['0014'] : []), '0016'];
  const before = await printsOf(db, numbers);
  console.log(`${L}fingerprints before 0024 (${numbers.join(', ')}):`);
  for (const [f, lines] of Object.entries(before)) for (const line of lines) console.log(`  ${f.slice(0, 4)}  ${line}`);

  // a'. the edited 0016 tests, before 0024
  await runTestFile(db, L + "0016_tests.sql BEFORE 0024 (its pre-0024 arms)", '0016_tests.sql', 'ALL 0016 TESTS PASSED');

  // b. two cycles with version 1 sheets (one opened), then the snapshot
  try {
    const made = await asBbAdmin(db, async () => {
      const x = (await db.query(`select public.bb_add_cycle(${bb24Payload('PGlite 0024 closed', 60)}, null) as r`)).rows[0].r;
      const y = (await db.query(`select public.bb_add_cycle(${bb24Payload('PGlite 0024 opened', 70)}, null) as r`)).rows[0].r;
      const o = (await db.query(`select public.bb_set_registration($1::uuid, 1, true) as r`, [y?.id])).rows[0].r;
      return [x, y, o];
    }, true);
    record(L + 'b. two cycles added through 0016 (version 1 sheets), one opened',
      made[0]?.status === 'ok' && made[1]?.status === 'ok' && made[2]?.status === 'ok', JSON.stringify(made.map((m) => m?.status)));
  } catch (error) {
    record(L + 'b. two cycles added through 0016', false, error.message);
  }
  const snap = (await db.query(`select id, name, requirements, version, first_opened_at is not null as opened from public.bb_cycles order by id`)).rows;
  record(L + 'b. every cycle holds a version 1 sheet before 0024', snap.length >= 2 && snap.every((c) => c.requirements?.schema_version === 1),
    `${snap.length} cycles, ${snap.filter((c) => c.opened).length} opened`);
  const logMark = await one(db, 'select coalesce(max(id), 0)::bigint from public.change_log');

  // c. apply 0024
  if (!(await run(db, 'apply 0024_black_belt_rubric.sql', MIGRATION_0024()))) return null;
  const after24 = await fingerprints(db, '0024_fingerprints.sql');

  // d. nothing earlier moved, except exactly 11.3 in 0016's file
  const afterPrints = await printsOf(db, numbers);
  const moved = numbers.filter((n) => n !== '0016' && JSON.stringify(before[`${n}_fingerprints.sql`]) !== JSON.stringify(afterPrints[`${n}_fingerprints.sql`]));
  record(`${L}d. ${numbers.filter((n) => n !== '0016').join(' / ')} fingerprints byte-identical before/after 0024`, moved.length === 0,
    moved.length ? `moved: ${moved.join(', ')}` : `${numbers.length - 1} files`);
  const wrong = diff0016(before['0016_fingerprints.sql'], afterPrints['0016_fingerprints.sql']);
  record(L + 'd. 0016_fingerprints.sql differs by EXACTLY contract 11.3 (4 md5s, the trigger arguments, the rule, 19 new functions)',
    wrong.length === 0, wrong.join(' | '));
  record(L + "d. 0024_fingerprints.sql: check | 0016_rerun | ok", after24.includes('check  0016_rerun  ok'),
    after24.filter((l) => l.startsWith('check')).join(' | '));
  console.log(`${L}0016_fingerprints.sql lines that changed:`);
  for (const line of afterPrints['0016_fingerprints.sql'].filter((l) => !before['0016_fingerprints.sql'].includes(l))) console.log('  + ' + line);
  for (const line of before['0016_fingerprints.sql'].filter((l) => !afterPrints['0016_fingerprints.sql'].includes(l))) console.log('  - ' + line);

  // e. every cycle: no number changed, version unchanged, logged once
  const now = new Map((await db.query(`select id, requirements, version from public.bb_cycles`)).rows.map((r) => [r.id, r]));
  const bad = [];
  for (const c of snap) {
    const x = now.get(c.id);
    if (!x || x.requirements?.schema_version !== 2) { bad.push(`${c.name}: not version 2`); continue; }
    if (x.version !== c.version) bad.push(`${c.name}: version ${c.version} -> ${x.version}`);
    const d = await flatDiff(db, c.requirements, x.requirements);
    if (d.length) bad.push(`${c.name}: ${d.slice(0, 3).join(' ; ')}`);
  }
  record(L + 'e. every cycle (opened ones too): converted to version 2, no number changed (4.3), version unchanged', bad.length === 0,
    bad.length ? bad.join(' | ') : `${snap.length} cycles`);
  const up = (await db.query(`select count(*)::int as n, count(distinct record_id)::int as cycles, count(*) filter (where actor_name = 'Database admin')::int as admin
      from public.change_log where id > ${logMark} and action = 'bb_rubric_upgrade'`)).rows[0];
  record(L + 'e. one bb_rubric_upgrade history row per converted cycle, by "Database admin"',
    up.n === snap.length && up.cycles === snap.length && up.admin === snap.length, JSON.stringify(up));
  const seeded = (await db.query(`select (select count(*)::int from public.bb_default_rubric) as rows,
      (select count(*)::int from public.change_log where id > ${logMark} and action = 'bb_seed' and table_name = 'bb_default_rubric') as seed`)).rows[0];
  record(L + 'c. the default rubric seeded once (bb_seed)', seeded.rows === 1 && seeded.seed === 1, JSON.stringify(seeded));

  // f. 0024's tests, then every earlier test file (0016's version-aware one included)
  await runTestFile(db, L + '0024_tests.sql', '0024_tests.sql', 'ALL 0024 TESTS PASSED');
  await allTestFiles16(db, 'after 0024');
  if (has14) await runTestFile(db, L + '0014_tests.sql (after 0024)', '0014_tests.sql', 'ALL 0014 TESTS PASSED');

  // g. re-run safety
  const data24 = await one(db, snapshot24Sql);
  await run(db, 'apply 0024 a SECOND time (re-run safety)', MIGRATION_0024());
  record(L + 'g. the re-run changed nothing (no second seed or conversion, nothing logged)', data24 === (await one(db, snapshot24Sql)));
  const again = await fingerprints(db, '0024_fingerprints.sql');
  record(L + 'g. 0024 fingerprints identical before/after the re-run', JSON.stringify(again) === JSON.stringify(after24), `${again.length} rows`);
  const again16 = await fingerprints(db, '0016_fingerprints.sql');
  record(L + 'g. 0016 fingerprints identical before/after the 0024 re-run', JSON.stringify(again16) === JSON.stringify(afterPrints['0016_fingerprints.sql']));
  await runTestFile(db, L + '0024_tests.sql (after re-run)', '0024_tests.sql', 'ALL 0024 TESTS PASSED');

  // h. the stored default = the app's copy (Builder B's rubricDefault.js)
  const sheet = await one(db, 'select sheet from public.bb_default_rubric');
  const jsFile = path.resolve(supabaseDir, '..', 'src', 'lib', 'blackBelt', 'rubricDefault.js');
  if (!existsSync(jsFile)) {
    record(L + 'h. bb_default_rubric.sheet deep-equals src/lib/blackBelt/rubricDefault.js', false, 'rubricDefault.js not found');
  } else {
    try {
      const mod = await import(new URL('file:///' + jsFile.replace(/\\/g, '/')).href);
      const js = Object.values(mod).find((v) => v && typeof v === 'object' && v.schema_version === 2);
      record(L + 'h. bb_default_rubric.sheet deep-equals src/lib/blackBelt/rubricDefault.js',
        !!js && JSON.stringify(canon(js)) === JSON.stringify(canon(sheet)), js ? '' : 'no exported rubric (schema_version 2) found');
    } catch (error) {
      record(L + 'h. bb_default_rubric.sheet deep-equals src/lib/blackBelt/rubricDefault.js', false, error.message);
    }
  }

  // i. the shared validator cases
  const { cases } = JSON.parse(read('tests', '0024_rubric_cases.json'));
  const caseBad = [];
  for (const c of cases) {
    try {
      const got = await rubricCase(db, c);
      const want = c.dan_no ? c.expect : c.expect_valid;
      if (JSON.stringify(got) !== JSON.stringify(want)) caseBad.push(`${c.name}: ${JSON.stringify(got)} (expected ${JSON.stringify(want)})`);
    } catch (error) {
      caseBad.push(`${c.name}: ${error.message}`);
    }
  }
  record(L + `i. every case of 0024_rubric_cases.json gives exactly its codes in SQL`, caseBad.length === 0,
    caseBad.length ? caseBad.slice(0, 5).join(' | ') : `${cases.length} cases`);

  // j. the family form's login
  const refused = [
    ['read bb_default_rubric', 'select 1 from public.bb_default_rubric limit 1'],
    ['read bb_rubric_undo', 'select 1 from public.bb_rubric_undo limit 1'],
    ['write bb_rubric_undo', "insert into public.bb_rubric_undo (kind, previous, after_version) values ('default_dan', '{}', 1)"],
    ['call bb_save_default_dan', 'select public.bb_save_default_dan(null::integer, null::integer, null::jsonb)'],
    ['call bb_undo_default_dan', 'select public.bb_undo_default_dan(null::integer, null::integer)'],
    ['call bb_save_cycle_dan', 'select public.bb_save_cycle_dan(null::uuid, null::integer, null::integer, null::jsonb)'],
    ['call bb_undo_cycle_dan', 'select public.bb_undo_cycle_dan(null::uuid, null::integer, null::integer)'],
    ['call bb_undo_first_open', 'select public.bb_undo_first_open(null::uuid, null::integer)'],
    ['call bb_rubric_public', "select public.bb_rubric_public('{}'::jsonb)"]];
  const leaks = [];
  for (const [label, sql] of refused) {
    try {
      await db.exec('set role bb_registrar;');
      await db.exec(sql);
      leaks.push(label);
    } catch (error) {
      if (!/permission denied/i.test(error.message)) leaks.push(`${label} (${error.message})`);
    } finally {
      await db.exec('reset role;').catch(() => {});
    }
  }
  record(L + 'j. AS bb_registrar: both new tables and the five new functions refused', leaks.length === 0, leaks.join('; '));
  const opened = (await db.query(`select public_code_worcester as code, requirements from public.bb_cycles
      where first_opened_at is not null order by created_at desc limit 1`)).rows[0];
  try {
    await db.exec('set role bb_registrar;');
    const r = (await db.query('select public.bb_public_cycle($1) as r', [opened?.code])).rows[0].r;
    await db.exec('reset role;');
    const pub = await one(db, `select public.bb_rubric_public('${JSON.stringify(opened.requirements).replaceAll("'", "''")}'::jsonb)`);
    const text = JSON.stringify(r?.cycle?.requirements ?? null);
    record(L + 'j. AS bb_registrar: bb_public_cycle answers the public view (no rev, stamps or source)',
      r?.status === 'ok' && JSON.stringify(canon(r.cycle.requirements)) === JSON.stringify(canon(pub))
        && !/"(rev|saved_at|saved_by_name|source)":/.test(text), text.slice(0, 120));
  } catch (error) {
    record(L + 'j. AS bb_registrar: bb_public_cycle answers the public view', false, error.message);
  } finally {
    await db.exec('reset role;').catch(() => {});
  }

  // m. time limits
  const times = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    await db.query('select public.bb_rubric_is_valid(sheet) from public.bb_default_rubric');
    times.push(performance.now() - t0);
  }
  const median = times.sort((x, y) => x - y)[2];
  record(L + 'm. bb_rubric_is_valid on the default rubric <= 50 ms', median <= 50, `${median.toFixed(1)} ms (median of 5)`);
  // the same on a NEAR-LIMIT rubric: every Dan grown to about 37 KB (20 more
  // graded subjects with a 200-character note in each of Technical,
  // Curriculum and Other; the Dan limit is 50 KB, the rubric's 240 KB)
  try {
    const sheet = (await db.query('select sheet from public.bb_default_rubric')).rows[0].sheet;
    const big = JSON.parse(JSON.stringify(sheet));
    for (const d of big.dans) {
      for (let pi = 1; pi <= 3; pi++) {
        // a copy of the part's own first graded subject with worked-out points
        const model = d.parts[pi].subjects.find((x) => x.scoring === 'graded' && x.points_mode === 'worked' && !x.limited_to);
        for (let k = 0; k < 20; k++) {
          d.parts[pi].subjects.push({ ...JSON.parse(JSON.stringify(model)), id: `z${d.dan}${pi}${String(k).padStart(5, '0')}`,
            name: `Added subject number ${k + 1}`, note: 'x'.repeat(200) });
        }
      }
    }
    const sizes = big.dans.map((d) => Buffer.byteLength(JSON.stringify(d)));
    const valid = (await db.query('select public.bb_rubric_is_valid($1::jsonb) as v', [JSON.stringify(big)])).rows[0].v;
    const bigTimes = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      await db.query('select public.bb_rubric_is_valid($1::jsonb)', [JSON.stringify(big)]);
      bigTimes.push(performance.now() - t0);
    }
    const bigMedian = bigTimes.sort((x, y) => x - y)[2];
    record(L + 'm. bb_rubric_is_valid on a near-limit rubric (about 37 KB per Dan, valid) <= 250 ms', valid === true && bigMedian <= 250,
      `${valid ? 'valid' : 'NOT valid'}, Dans ${sizes.map((n) => `${(n / 1000).toFixed(1)} KB`).join(' / ')}, ${bigMedian.toFixed(1)} ms (median of 5)`);
  } catch (error) {
    record(L + 'm. bb_rubric_is_valid on a near-limit rubric <= 250 ms', false, error.message);
  }
  try {
    const ms = await asBbAdmin(db, async () => {
      let v = (await db.query(`select version from public.bb_cycles where public_code_worcester = $1`, [opened.code])).rows[0].version;
      const t0 = performance.now();
      for (let i = 0; i < 200; i++) {
        const r = (await db.query(`select public.bb_set_registration(id, $2, $3) as r from public.bb_cycles where public_code_worcester = $1`,
          [opened.code, v, i % 2 === 1])).rows[0].r;
        if (r?.status !== 'ok') throw new Error(`call ${i + 1} answered ${JSON.stringify(r)}`);
        v = r.version;
      }
      return performance.now() - t0;
    });
    record(L + 'm. 200 open / close bb_set_registration calls <= 10 s (the rubric rule runs each time)', ms <= 10000, `${(ms / 1000).toFixed(2)} s`);
  } catch (error) {
    record(L + 'm. 200 open / close bb_set_registration calls <= 10 s', false, error.message);
  }
  try {
    // the largest valid Dan of the fixture cases
    let best = null;
    for (const c of cases.filter((x) => x.dan_no && x.expect.length === 0)) {
      const d = (await db.query(`with recursive o as (select e, n from jsonb_array_elements($1::jsonb) with ordinality as t(e, n)),
          w(i, d) as (select 0::bigint, r.sheet -> 'dans' -> ($2::int - 1) from public.bb_default_rubric r
            union all select w.i + 1, case when o.e ->> 'op' = 'set' then jsonb_set(w.d, array(select jsonb_array_elements_text(o.e -> 'path')),
                                             case when o.e ? 'value_json' then (o.e ->> 'value_json')::jsonb else o.e -> 'value' end, true)
                                           else w.d #- array(select jsonb_array_elements_text(o.e -> 'path')) end
              from w join o on o.n = w.i + 1)
          select d, octet_length(d::text) as n from w order by i desc limit 1`, [JSON.stringify(c.ops), c.dan_no])).rows[0];
      if (!best || d.n > best.n) best = { ...d, dan: c.dan_no, name: c.name };
    }
    const ms = await asBbAdmin(db, async () => {
      const rev = await one(db, `select (sheet -> 'dans' -> ${best.dan - 1} ->> 'rev')::int from public.bb_default_rubric`);
      const t0 = performance.now();
      const r = (await db.query('select public.bb_save_default_dan($1, $2, $3::jsonb) as r', [best.dan, rev, JSON.stringify(best.d)])).rows[0].r;
      const t = performance.now() - t0;
      if (r?.status !== 'ok') throw new Error(`the save answered ${JSON.stringify(r)}`);
      return t;
    });
    record(L + 'm. a save of the largest valid fixture Dan <= 200 ms', ms <= 200, `${ms.toFixed(1)} ms ("${best.name}", ${best.n} bytes)`);
  } catch (error) {
    record(L + 'm. a save of the largest valid fixture Dan <= 200 ms', false, error.message);
  }

  // k. the "Undo 0024" block of SETUP 0024f, on a copy of this database
  const setup = read('SETUP.md').replace(/\r\n/g, '\n');
  const block = setup.slice(setup.indexOf('### 0024f.')).match(/```sql\n([\s\S]*?)```/);
  if (!block) {
    record('[undo 0024] find the undo script in SETUP section 0024f', false, 'no sql block after "### 0024f."');
  } else {
    const K = '[undo 0024] ';
    const copy = await db.clone();
    try {
      const before24 = await one(copy, snapshot24Sql);
      let refusedOk = false;
      try {
        await copy.exec(block[1]);
      } catch (error) {
        await copy.exec('rollback;').catch(() => {});
        refusedOk = /Undo 0024 refused/.test(error.message);
      }
      record(K + 'with a cycle in the database the block refuses and changes nothing',
        refusedOk && before24 === (await one(copy, snapshot24Sql)));
      await run(copy, K + 'remove every cycle by hand (copy only)', 'delete from public.bb_cycles;');
      if (await run(copy, K + 'the SQL block of SETUP 0024f', block[1])) {
        if (await run(copy, K + 'paste 0016_black_belt.sql again', read('migrations', '0016_black_belt.sql'))) {
          const p16 = await fingerprints(copy, '0016_fingerprints.sql');
          record(K + "0016's fingerprints are back to (a) - before 0024", JSON.stringify(p16) === JSON.stringify(before['0016_fingerprints.sql']),
            `${p16.length} rows`);
          record(K + 'no 0024 table is left', !(await one(copy, `select to_regclass('public.bb_default_rubric') is not null or to_regclass('public.bb_rubric_undo') is not null`)));
          await runTestFile(copy, K + '0016_tests.sql (0016 only again)', '0016_tests.sql', 'ALL 0016 TESTS PASSED');
          if (await run(copy, K + 'apply 0024 again (redo)', MIGRATION_0024())) {
            const p24 = await fingerprints(copy, '0024_fingerprints.sql');
            record(K + 'after the redo 0024 fingerprints equal the first apply', JSON.stringify(p24) === JSON.stringify(after24));
            await runTestFile(copy, K + '0024_tests.sql (after the redo)', '0024_tests.sql', 'ALL 0024 TESTS PASSED');
          }
        }
      }
    } finally {
      await copy.close().catch(() => {});
    }
  }

  // l. re-running 0016 over 0024 is detected, and 0024 again repairs it
  const copy2 = await db.clone();
  try {
    const R = '[0016 re-run over 0024] ';
    if (await run(copy2, R + 'paste 0016_black_belt.sql over 0024 (copy only)', read('migrations', '0016_black_belt.sql'))) {
      const p = await fingerprints(copy2, '0024_fingerprints.sql');
      const row = p.find((l) => l.startsWith('check  0016_rerun'));
      record(R + "0024_fingerprints.sql's check row says RE-RUN", !!row && row.includes('0016 RE-RUN OVER 0024'), row ?? 'no check row');
      if (await run(copy2, R + 'apply 0024 again', MIGRATION_0024())) {
        const q = await fingerprints(copy2, '0024_fingerprints.sql');
        record(R + 'after 0024 again: check row ok and every 0024 fingerprint as before', JSON.stringify(q) === JSON.stringify(after24),
          q.find((l) => l.startsWith('check')) ?? '');
      }
    }
  } finally {
    await copy2.close().catch(() => {});
  }

  console.log(`${L}0024 fingerprints (kind  item  detail):`);
  for (const line of after24) console.log('  ' + line);
  return after24;
}

// =====================================================================
// step0024_production_order: 0024 on a fresh database built in the
// PRODUCTION order with every migration live at build time (the status
// files and SETUP, 2026-10-21): 0001-0006, 0010, 0007, 0008, 0009, 0012,
// 0015, 0011 as production got it, 0019, 0014, 0020, camps' 0013 + 0017,
// 0018, 0016 (CP3), 0021, 0022 (camps weekly pricing, live 2026-10-21).
// (0023 is not live yet; when it is, add it here.) Then 0024: every other
// fingerprint file unchanged (0016's by exactly 11.3), every test file
// passes, 0024's fingerprints equal step0024's.
// "main24" = step0024's 0024 fingerprints (or null if it failed).
// =====================================================================
async function step0024_production_order(main24) {
  const L = '[0024 production order] ';
  const db = await buildBase(L);
  if (!db) return;
  for (const [label, file] of [['0003', '0003_testing_classes_ranks.sql'], ['0004', '0004_staff_accounts.sql']]) {
    if (!(await run(db, `${L}apply ${label}`, read('migrations', file)))) return;
  }
  await run(db, L + 'apply built-in seed', builtInSeedSql());
  if (!(await run(db, L + 'apply 0005', read('migrations', '0005_testing_events.sql')))) return;
  await seedTestEvent(db);
  for (const [label, file] of [['0006', '0006_star_testing.sql'], ['0010 (grading results)', '0010_testing_results.sql'],
    ['0007', '0007_schedule.sql'], ['0008', '0008_calendar.sql'], ['0009', '0009_forms.sql'], ['0012', '0012_prospects.sql'],
    ['0015', '0015_family_history.sql']]) {
    if (!(await run(db, `${L}apply ${label}`, read('migrations', file)))) return;
  }
  const old11 = readFileSync(path.join(here, 'fixtures', '0011_as_applied_2026-10-19.sql'), 'utf8');
  if (!(await run(db, L + 'apply 0011 as pasted on production 2026-10-19 (fixture)', old11))) return;
  if (!(await run(db, L + 'apply today\'s 0011 over it', read('migrations', '0011_finance.sql')))) return;
  if (!(await run(db, L + 'apply 0019', read('migrations', '0019_school_phone.sql')))) return;
  if (!(await run(db, L + 'apply 0014 (private testing)', MIGRATION_0014()))) return;
  if (!(await run(db, L + 'apply 0020 (current_session_id fix)', read('migrations', '0020_session_id_claims.sql')))) return;
  const [camps13, camps17] = CAMPS_FILES();
  if (!(await run(db, `${L}apply camps' 0013 (${path.basename(camps13)})`, CAMPS_0013()))) return;
  if (!(await run(db, `${L}apply camps' 0017 (${path.basename(camps17)})`, CAMPS_0017()))) return;
  if (!(await run(db, L + 'apply 0018 (private testing money in Finance)', MIGRATION_0018()))) return;
  if (!(await run(db, L + 'apply 0016 (Black Belt testing, live since CP3)', read('migrations', '0016_black_belt.sql')))) return;
  if (!(await run(db, L + 'apply 0021', read('migrations', '0021_prospects_not_interested_sooner.sql')))) return;
  if (!(await run(db, L + 'apply 0022 (camps weekly pricing)', read('migrations', '0022_camps_weekly_pricing.sql')))) return;

  // every fingerprint file of a live migration, before and after 0024
  const numbers = ['0003', '0004', '0005', '0006', '0010', '0007', '0008', '0009', '0012', '0015', '0011', '0019', '0014', '0020',
    '0013', '0017', '0018', '0016', '0021', '0022'].filter((n) => existsSync(path.join(supabaseDir, 'tests', `${n}_fingerprints.sql`)));
  const before = await printsOf(db, numbers);
  if (!(await run(db, L + 'apply 0024_black_belt_rubric.sql', MIGRATION_0024()))) return;
  const after = await printsOf(db, numbers);
  const moved = numbers.filter((n) => n !== '0016' && JSON.stringify(before[`${n}_fingerprints.sql`]) !== JSON.stringify(after[`${n}_fingerprints.sql`]));
  record(`${L}${numbers.filter((n) => n !== '0016').join(' / ')} fingerprints byte-identical before/after 0024`, moved.length === 0,
    moved.length ? `moved: ${moved.join(', ')}` : `${numbers.length - 1} files`);
  const wrong = diff0016(before['0016_fingerprints.sql'], after['0016_fingerprints.sql']);
  record(L + '0016_fingerprints.sql differs by EXACTLY contract 11.3', wrong.length === 0, wrong.join(' | '));

  // every test file
  const testFiles = [['0024_tests.sql', 'ALL 0024 TESTS PASSED'], ['0016_tests.sql', 'ALL 0016 TESTS PASSED'],
    ['verify_pin_tests.sql', 'ALL PIN TESTS PASSED'], ['0002_tests.sql', 'ALL 0002 TESTS PASSED'], ['0003_tests.sql', 'ALL 0003 TESTS PASSED'],
    ['0004_tests.sql', 'ALL 0004 TESTS PASSED'], ['0005_tests.sql', 'ALL 0005 TESTS PASSED'], ['0006_tests.sql', 'ALL 0006 TESTS PASSED'],
    ['0010_tests.sql', 'ALL 0010 TESTS PASSED'], ['0007_tests.sql', 'ALL 0007 TESTS PASSED'], ['0008_tests.sql', 'ALL 0008 TESTS PASSED'],
    ['0009_tests.sql', 'ALL 0009 TESTS PASSED'], ['0012_tests.sql', 'ALL 0012 TESTS PASSED'], ['0015_tests.sql', 'ALL 0015 TESTS PASSED'],
    ['0011_tests.sql', 'ALL 0011 TESTS PASSED'], ['0019_tests.sql', 'ALL 0019 TESTS PASSED'], ['0014_tests.sql', 'ALL 0014 TESTS PASSED'],
    ['0020_tests.sql', 'ALL 0020 TESTS PASSED'], [CAMPS_TESTS, 'ALL 0017 TESTS PASSED'], ['0018_tests.sql', 'ALL 0018 TESTS PASSED'],
    ['0021_tests.sql', 'ALL 0021 TESTS PASSED'], ['0022_tests.sql', 'ALL 0022 TESTS PASSED']];
  for (const [file, ok] of testFiles) {
    await runTestFile(db, `${L}${file} (after 0024)`, file, ok);
  }
  if (existsSync(path.join(supabaseDir, 'tests', '0013_tests.sql'))) {
    await runTestFile(db, `${L}0013_tests.sql (after 0024)`, '0013_tests.sql', 'ALL 0013 TESTS PASSED');
  }
  await bbRegistrarLiveChecks(db);

  // the same 0024 as on the main database
  const mine = await fingerprints(db, '0024_fingerprints.sql');
  record(L + '0024 fingerprints identical to step0024 (main database)', !!main24 && JSON.stringify(mine) === JSON.stringify(main24),
    main24 ? `${mine.length} rows` : 'step0024 gave no fingerprints');
}

// =====================================================================
// step0025 / step0025_production_order: 0025 (Black Belt grading and
// results, rulebook v0.938-v0.958; CONTRACT-0025.md section 12.5)
// =====================================================================
const MIGRATION_0025 = () => read('migrations', '0025_black_belt_grading.sql');
const UNDO_0025 = () => read('manual', '0025u_undo.sql');

// Everything 0025 keeps, plus the candidates and the history's row count,
// as one md5 ("re-running 0025 changed nothing").
const snapshot25Sql = `select md5(${['bb_grades', 'bb_extra_counts', 'bb_makeup_subjects', 'bb_result_texts', 'bb_result_sends',
  'bb_downloads', 'bb_cycle_grading_started', 'bb_candidates', 'bb_cycles'].map((t) =>
  `coalesce((select string_agg(to_jsonb(x)::text, ',' order by x.id) from public.${t} x), '')`).join(' || ')}
  || (select count(*) from public.change_log)::text)`;

// Contract 17: the 42 functions 0025 adds, and the 0016 / 0024 functions it replaces.
const FNS_0025_NEW = ['bb_set_grade', 'bb_set_measured', 'bb_set_extra_count', 'bb_set_makeup_subjects', 'bb_add_makeup',
  'bb_mark_result_sent', 'bb_undo_result_sent', 'bb_set_result_text', 'bb_update_candidate_clear', 'bb_grading_grid',
  'bb_cycle_results', 'bb_makeup_list', 'bb_result_email', 'bb_results_csv', 'bb_cycle_grading_state', 'bb_grade_result',
  'bb_age_groups', 'bb_measured_letter', 'bb_extra_points', 'bb_kept_match', 'bb_result_text_problem', 'bb_candidate_age',
  'bb_candidate_grading_input', 'bb_candidate_result', 'bb_candidate_result_with', 'bb_cycle_has_grading',
  'bb_cycle_grading_started_at', 'bb_candidate_has_grades', 'bb_sent_state', 'bb_lock_candidate_shared', 'bb_update_candidate_core',
  'bb_note_grading_started', 'bb_cycle_grading_started_guard', 'bb_candidates_keep_age', 'bb_grades_rules', 'bb_extra_counts_rules',
  'bb_makeup_subjects_rules', 'bb_result_sends_guard', 'bb_downloads_guard', 'bb_payments_makeup_guard', 'bb_cycle_days_grading',
  'bb_cycle_day_parts_grading'];
const FNS_0025_REPLACED_16 = ['bb_purge_due_on', 'bb_purge_due', 'bb_candidates_rules', 'bb_candidates_log', 'bb_update_cycle',
  'bb_delete_cycle', 'bb_update_candidate', 'bb_change_plan', 'bb_restore_candidate', 'bb_delete_candidate', 'bb_cycle_roster',
  'bb_candidate_detail'];
const FNS_0025_REPLACED_24 = ['bb_cycles_rules', 'bb_save_cycle_dan', 'bb_undo_cycle_dan'];

// 12.3: what 0016_fingerprints.sql may print differently after 0025 -
// exactly this, nothing looser. Answers [] when the difference is exactly
// that, else a list of what is wrong.
function diff0016for25(before, after) {
  const split = (line) => { const [kind, item, ...rest] = line.split('  '); return { kind, item, detail: rest.join('  '), line }; };
  const b = before.map(split);
  const a = after.map(split);
  const key = (r) => r.kind + '  ' + r.item;
  const bMap = new Map(b.map((r) => [key(r), r]));
  const aMap = new Map(a.map((r) => [key(r), r]));
  const tail = (d) => d.slice(d.indexOf(' definer='));
  const wrong = [];
  const replaced = [...FNS_0025_REPLACED_16, ...FNS_0025_REPLACED_24];
  for (const r of b) {
    const x = aMap.get(key(r));
    if (!x) {
      if (!['constraint  bb_candidates.bb_candidates_reference_key', 'index  bb_candidates.bb_candidates_reference_key'].includes(key(r))) {
        wrong.push(`row gone: ${r.line.slice(0, 80)}`);
      }
      continue;
    }
    if (x.detail === r.detail) continue;
    const name = r.item.split('(')[0];
    if (r.kind === 'function' && replaced.includes(name)) {
      if (tail(x.detail) !== tail(r.detail)) wrong.push(`${r.item}: more than the md5 changed`);
    } else if (r.kind === 'trigger' && r.item === 'bb_candidates.bb_candidates_before_write') {
      const want = r.detail.replace("'id,cycle_id,source,reference,registered_at', 'date_of_birth,email_for_results,personal_removed_at'",
        "'id,cycle_id,source,reference,registered_at,makeup_of_cycle_name', 'date_of_birth,email_for_results,personal_removed_at,makeup_of_candidate_id,age_kept'");
      if (want === r.detail || x.detail !== want) wrong.push(`bb_candidates_before_write: not exactly the new arguments (${x.detail.slice(0, 200)})`);
    } else if (r.kind === 'constraint' && r.item === 'bb_candidates.bb_candidates_source_check') {
      if (x.detail !== "CHECK ((source = ANY (ARRAY['form'::text, 'desk'::text, 'makeup'::text])))") wrong.push(`source check: ${x.detail}`);
    } else {
      wrong.push(`changed: ${r.line.slice(0, 100)}`);
    }
  }
  for (const n of replaced) {
    const r = b.find((x) => x.kind === 'function' && x.item.startsWith(n + '('));
    const x = r && aMap.get(key(r));
    if (!r || !x || r.detail === x.detail) wrong.push(`${n}: its md5 should have changed`);
  }
  for (const k of ['constraint  bb_candidates.bb_candidates_reference_key', 'index  bb_candidates.bb_candidates_reference_key']) {
    if (!bMap.has(k) || aMap.has(k)) wrong.push(`${k}: should be gone after 0025`);
  }
  const added = a.filter((r) => !bMap.has(key(r)));
  const addedNames = added.map((r) => (r.kind === 'function' ? r.item.split('(')[0] : `${r.kind} ${r.item}`)).sort();
  const want = [...FNS_0025_NEW,
    'trigger bb_payments.bb_payments_makeup_guard', 'trigger bb_cycle_days.bb_cycle_days_grading',
    'trigger bb_cycle_day_parts.bb_cycle_day_parts_grading', 'trigger bb_candidates.bb_candidates_keep_age',
    ...['makeup_of_fk', 'makeup_of_self_check', 'makeup_of_check', 'makeup_name_check', 'makeup_plan_check', 'makeup_kukkiwon_check',
      'age_kept_check'].map((c) => `constraint bb_candidates.bb_candidates_${c}`),
    'index bb_candidates.bb_candidates_reference_idx', 'index bb_candidates.bb_candidates_one_active_makeup_idx',
    'index bb_candidates.bb_candidates_makeup_of_idx'].sort();
  if (JSON.stringify(addedNames) !== JSON.stringify(want)) {
    wrong.push(`added rows: ${addedNames.filter((n) => !want.includes(n)).join(', ')} | missing: ${want.filter((n) => !addedNames.includes(n)).join(', ')}`);
  }
  return wrong;
}

// 12.3: 0024_fingerprints.sql after 0025 - only the md5 of its three
// replaced functions; its check row stays ok.
function diff0024for25(before, after) {
  const wrong = [];
  if (before.length !== after.length) wrong.push(`${before.length} -> ${after.length} rows`);
  const tail = (d) => d.slice(d.indexOf(' definer='));
  for (let i = 0; i < Math.min(before.length, after.length); i++) {
    if (before[i] === after[i]) continue;
    const [kind, item] = before[i].split('  ');
    const [kind2, item2] = after[i].split('  ');
    if (kind !== 'function' || kind2 !== kind || item2 !== item || !FNS_0025_REPLACED_24.includes(item.split('(')[0])
        || tail(before[i]) !== tail(after[i])) wrong.push(`changed: ${before[i].slice(0, 90)}`);
  }
  for (const n of FNS_0025_REPLACED_24) {
    const i = before.findIndex((l) => l.startsWith(`function  ${n}(`));
    if (i < 0 || before[i] === after[i]) wrong.push(`${n}: its md5 should have changed`);
  }
  if (!after.includes('check  0016_rerun  ok')) wrong.push('check | 0016_rerun is not ok');
  return wrong;
}

// (f) one case of 0025_grading_cases.json: the base Dan of the stored
// default with the case's changes ("value_json" cast straight to jsonb, so
// 20.00 stays 20.00), as rubricCase does.
async function dan25(db, base, ops) {
  const n = Number(base.split(':')[1]);
  return (await db.query(`with recursive o as (select e, n from jsonb_array_elements($1::jsonb) with ordinality as t(e, n)),
      w(i, d) as (select 0::bigint, r.sheet -> 'dans' -> ($2::int - 1) from public.bb_default_rubric r
        union all select w.i + 1,
               case when o.e ->> 'op' = 'set' then jsonb_set(w.d, array(select jsonb_array_elements_text(o.e -> 'path')),
                      case when o.e ? 'value_json' then (o.e ->> 'value_json')::jsonb else o.e -> 'value' end, true)
                    else w.d #- array(select jsonb_array_elements_text(o.e -> 'path')) end
          from w join o on o.n = w.i + 1)
      select d::text as d from w order by i desc limit 1`, [JSON.stringify(ops), n])).rows[0].d;
}
function subjectsOf(dan) {
  const out = [];
  for (const p of dan.parts) for (const s of p.subjects) out.push({ id: s.id, name: s.name, part: p.code });
  return out;
}
const idOf = (subs, name, part) => (subs.find((s) => s.name === name && (!part || s.part === part)) ?? {}).id;
function caseInputs(danJson, c) {
  const subs = subjectsOf(JSON.parse(danJson));
  const grades = c.grades.map((g) => ({ subject_id: idOf(subs, g.subject, g.part), letter: g.letter ?? null, measured: g.measured ?? null,
    way: g.way ?? null, kept: !!g.kept, kept_from_cycle_name: g.kept_from_cycle_name ?? null }));
  const counts = c.counts.map((x) => ({ item_name: x.item, count: x.count, kept: !!x.kept }));
  return { subs, grades, counts, retest: c.retest.map((n) => idOf(subs, n)), chosen: c.chosen.map((n) => idOf(subs, n)) };
}
async function gradeResult25(db, danJson, c, i) {
  return (await db.query(`select public.bb_grade_result($1::jsonb, $2::integer, $3::jsonb, $4::jsonb, $5::text[], $6::text[], $7::date, $8::date) as r`,
    [danJson, c.age, JSON.stringify(i.grades), JSON.stringify(i.counts), i.retest, i.chosen, c.today, c.submissions_due])).rows[0].r;
}
// compares a SQL answer with a result case's expect; answers the differences
async function resultCaseBad(c, r, subs) {
  const { createHash } = await import('node:crypto');
  const e = c.expect;
  const bad = [];
  const nm = (ids) => (ids ?? []).map((id) => (subs.find((s) => s.id === id) ?? {}).name);
  const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
  const num = (a, b) => (a === null || a === undefined ? b === null : b !== null && Number(a) === Number(b));
  for (const k of ['status', 'reasons', 'complete', 'pass_bracket', 'age_group', 'choice_needed', 'counts']) if (!same(r[k] ?? null, e[k])) bad.push(`${k}=${JSON.stringify(r[k])}`);
  for (const k of ['total', 'maximum', 'pass_mark']) if (!num(r[k], e[k])) bad.push(`${k}=${r[k]}`);
  if (!num(r.extra ? r.extra.total : null, e.extra_total)) bad.push(`extra_total=${r.extra?.total}`);
  for (const k of ['d_subjects', 'needs', 'late', 'missing']) if (!same(nm(r[k]), e[k])) bad.push(`${k}=${JSON.stringify(nm(r[k]))}`);
  const parts = Object.fromEntries((r.parts ?? []).map((p) => [p.code, Number(p.points)]));
  if (!same(Object.keys(parts).sort(), Object.keys(e.parts).sort()) || Object.keys(e.parts).some((k) => parts[k] !== Number(e.parts[k]))) bad.push(`parts=${JSON.stringify(parts)}`);
  for (const [name, v] of Object.entries(e.subjects)) {
    const s = (r.subjects ?? []).find((x) => x.id === idOf(subs, name));
    if (!s || s.applies !== v.applies || s.gradable !== v.gradable || !num(s.points, v.points) || s.kept !== v.kept || s.retest !== v.retest) {
      bad.push(`subject ${name}=${JSON.stringify(s)}`);
    }
  }
  if (Object.keys(e.subjects).length !== (r.subjects ?? []).length) bad.push(`${(r.subjects ?? []).length} subjects in the answer`);
  const keyIn = e.result_key_input.split('|');
  if (keyIn.length === 4 && keyIn[3] !== '') keyIn[3] = e.needs.map((n) => idOf(subs, n)).join(',');
  if (createHash('md5').update(keyIn.join('|')).digest('hex') !== r.result_key) bad.push('result_key');
  return bad;
}

// (g) a desk candidate written directly (a hand fix), for the undo checks
const handCandidate = (cycleId, reference) => `insert into public.bb_candidates (cycle_id, first_name, last_name, date_of_birth,
    email_for_results, location_code, dan, cycle_plan_id, kukkiwon, source, reference, created_by_name, updated_by_name)
  select '${cycleId}', 'Undo', 'Test', date '1990-01-01', 'undo@example.com', 'worcester', 1, pl.id, false, 'desk', '${reference}', '', ''
    from public.bb_cycle_plans pl where pl.cycle_id = '${cycleId}' limit 1;`;

// The "check | rerun" row of 0025_fingerprints.sql
const rerunRow = (prints) => prints.find((l) => l.startsWith('check  rerun')) ?? 'no check row';

// =====================================================================
// step0025 on the MAIN database, right after step0024 (contract 12.5):
//   a.  the fingerprints of every migration already there (printed)
//   a'. the version-aware 0016_tests.sql and 0024_tests.sql BEFORE 0025
//   b.  0025 applied
//   c.  every earlier fingerprint file byte-identical, except 0016's and
//       0024's, which differ by EXACTLY contract 12.3's rows
//   d.  0025_tests.sql, then every earlier test file
//   e.  0025 a SECOND time: no second seed, nothing logged, fingerprints
//       identical, 0025_tests.sql again
//   f.  every case of 0025_grading_cases.json through the SQL functions;
//       each case's full answer is saved for src/lib/blackBelt/checks.mjs
//       (file: $BB_0025_SQL_ANSWERS, else <temp folder>/bb0025-sql-answers.json)
//   g.  on COPIES: supabase/manual/0025u_undo.sql exactly as written -
//       refused while a grading row, a "grading started" mark, a make-up,
//       a send, a download row, a changed text or a kept age exists; on a
//       clean copy it works: 0016's and 0024's fingerprints back to (a),
//       their tests pass; then 0025 again
//   h.  on COPIES: 0016 (and, separately, 0024) pasted again over 0025 ->
//       0025_fingerprints' check row says RE-RUN; 0025 again -> ok
//   i.  on a COPY, speed with seeded volume: 12 cycles x 60 candidates (a
//       third make-ups), every subject graded
// Returns 0025's fingerprints (or null if 0025 could not be applied).
// =====================================================================
async function step0025(db) {
  const L = '[0025] ';
  const printsText = read('tests', '0025_fingerprints.sql');
  record(L + '0025_fingerprints.sql contains neither "delete" nor "drop" (connector-safe)', !/delete|drop/i.test(printsText));
  const src = MIGRATION_0025();
  const bodies = [...src.split('\r\n').join('\n').matchAll(/\nas \$\$\n([\s\S]*?)\n\$\$;/g)].map((m) => m[1]);
  record(L + 'no dynamic SQL in the migration\'s functions (no execute, no format(), no clock_timestamp)',
    bodies.length > 50 && !bodies.some((b) => /\bexecute\b|format\s*\(|clock_timestamp/i.test(b)), `${bodies.length} function bodies`);

  // a. the fingerprints of every migration on the main database now
  const has14 = await one(db, `select to_regclass('public.testing_private') is not null`);
  const numbers = ['0003', '0004', '0005', '0006', '0010', '0011', ...(has14 ? ['0014'] : []), '0016', '0024'];
  const before = await printsOf(db, numbers);

  // a'. the edited 0016 / 0024 tests, before 0025
  await runTestFile(db, L + '0016_tests.sql BEFORE 0025 (its pre-0025 arms)', '0016_tests.sql', 'ALL 0016 TESTS PASSED');
  await runTestFile(db, L + '0024_tests.sql BEFORE 0025', '0024_tests.sql', 'ALL 0024 TESTS PASSED');

  // b. apply 0025
  const logMark = await one(db, 'select coalesce(max(id), 0)::bigint from public.change_log');
  if (!(await run(db, 'apply 0025_black_belt_grading.sql', src))) return null;
  const after25 = await fingerprints(db, '0025_fingerprints.sql');
  record(L + 'b. 0025_fingerprints.sql: check | rerun | ok', rerunRow(after25) === 'check  rerun  ok', rerunRow(after25));
  const seeded = (await db.query(`select (select count(*)::int from public.bb_result_texts) as texts,
      (select count(*)::int from public.change_log where id > ${logMark} and action = 'bb_seed' and table_name = 'bb_result_texts') as seed`)).rows[0];
  record(L + 'b. the three result texts seeded once (bb_seed)', seeded.texts === 3 && seeded.seed === 3, JSON.stringify(seeded));

  // c. nothing earlier moved, except exactly 12.3 in 0016's and 0024's files
  const afterPrints = await printsOf(db, numbers);
  const moved = numbers.filter((n) => !['0016', '0024'].includes(n)
    && JSON.stringify(before[`${n}_fingerprints.sql`]) !== JSON.stringify(afterPrints[`${n}_fingerprints.sql`]));
  record(`${L}c. ${numbers.filter((n) => !['0016', '0024'].includes(n)).join(' / ')} fingerprints byte-identical before/after 0025`,
    moved.length === 0, moved.length ? `moved: ${moved.join(', ')}` : `${numbers.length - 2} files`);
  const w16 = diff0016for25(before['0016_fingerprints.sql'], afterPrints['0016_fingerprints.sql']);
  record(L + 'c. 0016_fingerprints.sql differs by EXACTLY contract 12.3 (15 md5s, the trigger arguments, the source rule, the reference rule, 42 functions, 4 triggers, 7 rules, 3 indexes)',
    w16.length === 0, w16.join(' | '));
  const w24 = diff0024for25(before['0024_fingerprints.sql'], afterPrints['0024_fingerprints.sql']);
  record(L + 'c. 0024_fingerprints.sql differs by EXACTLY the md5 of its 3 replaced functions; its 0016_rerun row stays ok', w24.length === 0, w24.join(' | '));
  console.log(`${L}0016_fingerprints.sql lines that changed:`);
  for (const line of afterPrints['0016_fingerprints.sql'].filter((l) => !before['0016_fingerprints.sql'].includes(l))) console.log('  + ' + line);
  for (const line of before['0016_fingerprints.sql'].filter((l) => !afterPrints['0016_fingerprints.sql'].includes(l))) console.log('  - ' + line);

  // d. 0025's tests, then every earlier test file
  await runTestFile(db, L + '0025_tests.sql', '0025_tests.sql', 'ALL 0025 TESTS PASSED');
  await allTestFiles16(db, 'after 0025');
  await runTestFile(db, L + '0024_tests.sql (after 0025)', '0024_tests.sql', 'ALL 0024 TESTS PASSED');
  if (has14) await runTestFile(db, L + '0014_tests.sql (after 0025)', '0014_tests.sql', 'ALL 0014 TESTS PASSED');

  // e. re-run safety
  const data25 = await one(db, snapshot25Sql);
  await run(db, 'apply 0025 a SECOND time (re-run safety)', src);
  record(L + 'e. the re-run changed nothing (no second seed, nothing logged)', data25 === (await one(db, snapshot25Sql)));
  const again = await fingerprints(db, '0025_fingerprints.sql');
  record(L + 'e. 0025 fingerprints identical before/after the re-run', JSON.stringify(again) === JSON.stringify(after25), `${again.length} rows`);
  const again16 = await fingerprints(db, '0016_fingerprints.sql');
  record(L + 'e. 0016 fingerprints identical before/after the 0025 re-run', JSON.stringify(again16) === JSON.stringify(afterPrints['0016_fingerprints.sql']));
  await runTestFile(db, L + '0025_tests.sql (after re-run)', '0025_tests.sql', 'ALL 0025 TESTS PASSED');

  // f. the shared cases through the SQL functions; every answer saved
  const fixture = JSON.parse(read('tests', '0025_grading_cases.json'));
  const answers = { about: 'Generated by supabase/tests/pglite/run.mjs step0025 f: the full SQL answer of each case of 0025_grading_cases.json. Never committed.',
    result_cases: [], kept_cases: [] };
  const resBad = [];
  for (const c of fixture.result_cases) {
    try {
      const danJson = await dan25(db, c.base, c.ops);
      const i = caseInputs(danJson, c);
      const r = await gradeResult25(db, danJson, c, i);
      answers.result_cases.push({ name: c.name, answer: r });
      const bad = await resultCaseBad(c, r, i.subs);
      if (bad.length) resBad.push(`${c.name}: ${bad.slice(0, 4).join('; ')}`);
    } catch (error) {
      resBad.push(`${c.name}: ${error.message}`);
    }
  }
  record(L + 'f. every result case of 0025_grading_cases.json gives exactly its expect in SQL', resBad.length === 0,
    resBad.length ? resBad.slice(0, 4).join(' | ') : `${fixture.result_cases.length} cases`);
  const keptBad = [];
  for (const k of fixture.kept_cases) {
    try {
      const eDan = await dan25(db, k.earlier.base, k.earlier.ops);
      const ei = caseInputs(eDan, k.earlier);
      const er = await gradeResult25(db, eDan, k.earlier, ei);
      const lDan = await dan25(db, k.later.base, k.later.ops);
      const m = (await db.query('select public.bb_kept_match($1::jsonb, $2::jsonb, $3::jsonb, $4::jsonb, $5::integer) as m',
        [JSON.stringify(er), eDan, JSON.stringify(ei.counts), lDan, k.later.age])).rows[0].m;
      answers.kept_cases.push({ name: k.name, answer: m });
      const ls = subjectsOf(JSON.parse(lDan));
      const ln = (id) => (ls.find((s) => s.id === id) ?? {}).name;
      const got = { kept: m.kept.map((x) => ({ subject: ln(x.subject_id), part: x.part, letter: x.letter })), retest: m.retest.map(ln),
        new: m.new.map(ln), dropped: m.dropped, kept_counts: m.kept_counts, dropped_extra: m.dropped_extra };
      if (JSON.stringify(canon(got)) !== JSON.stringify(canon(k.expect))) keptBad.push(`${k.name}: ${JSON.stringify(got).slice(0, 200)}`);
    } catch (error) {
      keptBad.push(`${k.name}: ${error.message}`);
    }
  }
  record(L + 'f. every kept case of 0025_grading_cases.json gives exactly its expect in SQL', keptBad.length === 0,
    keptBad.length ? keptBad.slice(0, 3).join(' | ') : `${fixture.kept_cases.length} cases`);
  try {
    const { writeFileSync } = await import('node:fs');
    const os = await import('node:os');
    const file = process.env.BB_0025_SQL_ANSWERS || path.join(os.tmpdir(), 'bb0025-sql-answers.json');
    writeFileSync(file, JSON.stringify(answers, null, 1));
    record(L + 'f. the SQL answers saved for checks.mjs', true, file);
  } catch (error) {
    record(L + 'f. the SQL answers saved for checks.mjs', false, error.message);
  }

  // g. the undo script, on copies of this database
  const U = '[undo 0025] ';
  const undo = UNDO_0025();
  const claims = await bbAdminClaims(db);
  const cycleId = await one(db, 'select id::text from public.bb_cycles order by created_at limit 1');
  const conditions = [
    ['a changed result text', `update public.bb_result_texts set body = body || ' ' where kind = 'passed';`],
    ['a CSV download row', `select set_config('tkd.action', 'bb_results_csv', false);
       insert into public.bb_downloads (cycle_id, cycle_name, row_count, downloaded_by_name) values ('${cycleId}', 'x', 0, '');
       select set_config('tkd.action', '', false);`],
    ['a "grading started" mark', `insert into public.bb_cycle_grading_started (cycle_id) values ('${cycleId}');`],
    ['a grading row', `insert into public.bb_candidates (cycle_id, first_name, last_name, date_of_birth, email_for_results, location_code, dan,
         cycle_plan_id, kukkiwon, source, reference, created_by_name, updated_by_name)
       select '${cycleId}', 'Undo', 'Test', date '1990-01-01', 'undo@example.com', 'worcester', 1, pl.id, false, 'desk', 'BB-99001', '', ''
         from public.bb_cycle_plans pl where pl.cycle_id = '${cycleId}' limit 1;
       insert into public.bb_extra_counts (candidate_id, dan, item_name, count, created_by_name, updated_by_name)
       select c.id, 1, 'Extra stripes', 1, '', '' from public.bb_candidates c where c.reference = 'BB-99001';`],
    ['a "sent" mark', `${handCandidate(cycleId, 'BB-99002')}
       select set_config('tkd.action', 'bb_mark_result_sent', false);
       insert into public.bb_result_sends (candidate_id, marked_by_name, result_status, result_total, result_needs, result_key)
       select c.id, '', 'passed', 1, '[]', md5('x') from public.bb_candidates c where c.reference = 'BB-99002';
       select set_config('tkd.action', '', false);`],
    ['a kept age', `${handCandidate(cycleId, 'BB-99003')}
       select set_config('tkd.action', 'bb_purge_due', false);
       update public.bb_candidates c set date_of_birth = null, email_for_results = null, personal_removed_at = now(),
              age_kept = public.bb_age_on(c.date_of_birth, (select min(d.day_date) from public.bb_cycle_days d where d.cycle_id = c.cycle_id))
        where c.reference = 'BB-99003';
       select set_config('tkd.action', '', false);`],
    ['a make-up candidate', `${handCandidate(cycleId, 'BB-99004')}
       insert into public.bb_candidates (cycle_id, first_name, last_name, date_of_birth, email_for_results, location_code, dan,
         cycle_plan_id, kukkiwon, source, reference, makeup_of_candidate_id, makeup_of_cycle_name, created_by_name, updated_by_name)
       select y.id, 'Undo', 'Test', date '1990-01-01', 'undo@example.com', 'worcester', 1, null, false, 'makeup', 'BB-99004', c.id, 'Earlier', '', ''
         from public.bb_candidates c, public.bb_cycles y where c.reference = 'BB-99004' and y.id <> c.cycle_id limit 1;`]];
  for (const [label, sql] of conditions) {
    const copy = await db.clone();
    try {
      await copy.exec(sql);
      const snap = await one(copy, snapshot25Sql);
      let refused = false;
      try {
        await copy.exec(undo);
      } catch (error) {
        await copy.exec('rollback;').catch(() => {});
        refused = /Undo 0025 refused/.test(error.message);
      }
      record(`${U}refused with ${label}, and nothing changed`, refused && snap === (await one(copy, snapshot25Sql)));
    } catch (error) {
      record(`${U}refused with ${label}`, false, error.message);
    } finally {
      await copy.close().catch(() => {});
    }
  }
  {
    const copy = await db.clone();
    try {
      if (await run(copy, U + 'supabase/manual/0025u_undo.sql on a clean copy', undo)) {
        const p16 = await fingerprints(copy, '0016_fingerprints.sql');
        const p24 = await fingerprints(copy, '0024_fingerprints.sql');
        record(U + "0016's and 0024's fingerprints are back to (a) - before 0025",
          JSON.stringify(p16) === JSON.stringify(before['0016_fingerprints.sql']) && JSON.stringify(p24) === JSON.stringify(before['0024_fingerprints.sql']),
          `${p16.length} + ${p24.length} rows`);
        record(U + 'no 0025 table or column is left', !(await one(copy, `select to_regclass('public.bb_grades') is not null
            or to_regclass('public.bb_cycle_grading_started') is not null
            or exists (select 1 from pg_attribute where attrelid = 'public.bb_candidates'::regclass and attname = 'age_kept' and not attisdropped)`)));
        await runTestFile(copy, U + '0016_tests.sql (without 0025)', '0016_tests.sql', 'ALL 0016 TESTS PASSED');
        await runTestFile(copy, U + '0024_tests.sql (without 0025)', '0024_tests.sql', 'ALL 0024 TESTS PASSED');
        if (await run(copy, U + 'apply 0025 again (redo)', src)) {
          record(U + 'after the redo 0025 fingerprints equal the first apply',
            JSON.stringify(await fingerprints(copy, '0025_fingerprints.sql')) === JSON.stringify(after25));
          await runTestFile(copy, U + '0025_tests.sql (after the redo)', '0025_tests.sql', 'ALL 0025 TESTS PASSED');
        }
      }
    } finally {
      await copy.close().catch(() => {});
    }
  }

  // h. 0016 / 0024 pasted again over 0025 is detected; 0025 again repairs it
  for (const [n, file] of [['0016', '0016_black_belt.sql'], ['0024', '0024_black_belt_rubric.sql']]) {
    const copy = await db.clone();
    const R = `[${n} re-run over 0025] `;
    try {
      if (await run(copy, `${R}paste ${file} over 0025 (copy only)`, read('migrations', file))) {
        const row = rerunRow(await fingerprints(copy, '0025_fingerprints.sql'));
        record(R + "0025_fingerprints.sql's check row says RE-RUN", row.includes('0016 OR 0024 RE-RUN OVER 0025'), row);
        if (await run(copy, R + 'apply 0025 again', src)) {
          const q = await fingerprints(copy, '0025_fingerprints.sql');
          record(R + 'after 0025 again: check row ok and every 0025 fingerprint as before', JSON.stringify(q) === JSON.stringify(after25), rerunRow(q));
        }
      }
    } finally {
      await copy.close().catch(() => {});
    }
  }

  // i. speed with seeded volume (on a copy)
  await speed0025(db, claims);

  console.log(`${L}0025 fingerprints (kind  item  detail):`);
  for (const line of after25) console.log('  ' + line);
  return after25;
}

// (i) 12 cycles, 182 days apart (the newest one in the future), 60
// candidates each: 40 of its own (every subject of 1st Dan graded, half
// with a D in Free sparring) and, from the second cycle on, 20 make-ups of
// the previous cycle's D candidates (25 kept grades, kept counts, Free
// sparring to retest). Written directly as the SQL Editor's role (a hand
// fix; every guard still checks every row). Then the time limits of
// contract 12.5 (i) on the newest cycle.
async function speed0025(main, claims) {
  const S = '[0025 speed] ';
  const db = await main.clone();
  try {
    const ids = await (async () => {
      const out = [];
      await db.exec('begin;');
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
      for (let k = 0; k < 12; k++) {
        const r = (await db.query(`select public.bb_add_cycle(${bb24Payload(`PGlite speed ${k + 1}`, 30)}, null) as r`)).rows[0].r;
        if (r?.status !== 'ok') throw new Error(`add cycle ${k}: ${JSON.stringify(r)}`);
        out.push(r.id);
      }
      await db.exec('commit;');
      return out;
    })();
    const t0 = performance.now();
    await db.exec(`select set_config('request.jwt.claims', '', false);`);
    for (let k = 0; k < 12; k++) {
      const shift = -182 * (11 - k);
      await db.exec(`
        update public.bb_cycle_days set day_date = day_date + ${shift} where cycle_id = '${ids[k]}';
        update public.bb_cycles set application_due = application_due + ${shift}, submissions_due = submissions_due + ${shift} where id = '${ids[k]}';
        update public.bb_cycle_plan_payments pp set due_on = pp.due_on + ${shift} from public.bb_cycle_plans pl
         where pl.id = pp.cycle_plan_id and pl.cycle_id = '${ids[k]}';
        insert into public.bb_candidates (cycle_id, first_name, last_name, date_of_birth, email_for_results, location_code, dan,
                                          cycle_plan_id, kukkiwon, source, reference, created_by_name, updated_by_name)
        select '${ids[k]}', 'Speed', 'Own ' || ${k} || ' ' || i, date '1980-01-01' + i, 'speed' || ${k} || '.' || i || '@example.com',
               case when i % 2 = 0 then 'worcester' else 'shrewsbury' end, 1, pl.id, false, 'desk',
               'BB-' || nextval('public.bb_candidate_ref_seq'::regclass)::text, '', ''
          from generate_series(1, 40) as i, (select id from public.bb_cycle_plans where cycle_id = '${ids[k]}' limit 1) as pl;
        insert into public.bb_grades (candidate_id, dan, part_code, subject_id, letter, measured, way, created_by_name, updated_by_name)
        select c.id, 1, p.e ->> 'code', s.e ->> 'id',
               case when s.e ->> 'scoring' = 'graded'
                    then case when s.e ->> 'name' = 'Free sparring' and split_part(c.last_name, ' ', 3)::int % 2 = 0 then 'D' else 'A' end end,
               case when s.e ->> 'scoring' = 'measured' then 5 end, case when s.e ->> 'scoring' = 'measured' then 0 end, '', ''
          from public.bb_candidates c join public.bb_cycles y on y.id = c.cycle_id
          cross join lateral jsonb_array_elements(y.requirements -> 'dans' -> 0 -> 'parts') as p(e)
          cross join lateral jsonb_array_elements(p.e -> 'subjects') as s(e)
         where c.cycle_id = '${ids[k]}' and c.source = 'desk';
        insert into public.bb_extra_counts (candidate_id, dan, item_name, count, created_by_name, updated_by_name)
        select c.id, 1, x.item, x.n, '', ''
          from public.bb_candidates c, (values ('Extra stripes', 2), ('Attendance (classes)', 330)) as x(item, n)
         where c.cycle_id = '${ids[k]}' and c.source = 'desk';`);
      if (k > 0) {
        await db.exec(`
          insert into public.bb_candidates (cycle_id, first_name, last_name, date_of_birth, email_for_results, location_code, dan,
                                            cycle_plan_id, kukkiwon, source, reference, makeup_of_candidate_id, makeup_of_cycle_name,
                                            created_by_name, updated_by_name)
          select '${ids[k]}', c.first_name, c.last_name, c.date_of_birth, c.email_for_results, c.location_code, 1, null, false, 'makeup',
                 c.reference, c.id, y.name, '', ''
            from public.bb_candidates c join public.bb_cycles y on y.id = c.cycle_id
           where c.cycle_id = '${ids[k - 1]}' and c.source = 'desk' and split_part(c.last_name, ' ', 3)::int % 2 = 0;
          insert into public.bb_grades (candidate_id, dan, part_code, subject_id, letter, kept, kept_from_cycle_id, kept_from_cycle_name,
                                        created_by_name, updated_by_name)
          select m.id, 1, p.e ->> 'code', s.e ->> 'id', 'A', true, '${ids[k - 1]}', m.makeup_of_cycle_name, '', ''
            from public.bb_candidates m join public.bb_cycles y on y.id = m.cycle_id
            cross join lateral jsonb_array_elements(y.requirements -> 'dans' -> 0 -> 'parts') as p(e)
            cross join lateral jsonb_array_elements(p.e -> 'subjects') as s(e)
           where m.cycle_id = '${ids[k]}' and m.source = 'makeup' and s.e ->> 'name' <> 'Free sparring';
          insert into public.bb_makeup_subjects (candidate_id, dan, subject_id, kind, created_by_name, updated_by_name)
          select m.id, 1, 'f2630888', 'retest', '', '' from public.bb_candidates m where m.cycle_id = '${ids[k]}' and m.source = 'makeup';`);
      }
    }
    const counts = (await db.query(`select count(*)::int as c, count(*) filter (where source = 'makeup')::int as m,
        (select count(*)::int from public.bb_grades) as g from public.bb_candidates where cycle_id = any ($1::uuid[])`, [ids])).rows[0];
    record(S + 'seeded 12 cycles x 60 candidates (a third make-ups), every subject graded', counts.c === 12 * 40 + 11 * 20 && counts.g > 15000,
      `${counts.c} candidates, ${counts.m} make-ups, ${counts.g} grade rows in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
    const newest = ids[11];
    const time = async (sql, params = []) => {
      const t = [];
      for (let i = 0; i < 3; i++) {
        await db.exec('begin;');
        await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
        const s0 = performance.now();
        const r = (await db.query(sql, params)).rows[0].r;
        t.push(performance.now() - s0);
        await db.exec('rollback;');
        if (r?.status !== 'ok') throw new Error(`${sql.slice(0, 40)} answered ${JSON.stringify(r).slice(0, 120)}`);
      }
      return t.sort((a, b) => a - b)[1];
    };
    for (const [label, sql, limit, hardLimit] of [
      ['bb_grading_grid (one Dan, 60 rows)', `select public.bb_grading_grid('${newest}', 1) as r`, 200],
      ['bb_cycle_results (one Dan)', `select public.bb_cycle_results('${newest}', 1) as r`, 200],
      ['bb_cycle_results (every Dan)', `select public.bb_cycle_results('${newest}', null) as r`, 200],
      // Target 300 ms; this huge seed takes ~1.2-1.4 s. Jeffrey accepted that
      // (rulebook v0.962): over 300 ms is a warning, over 3 s still fails.
      ['bb_makeup_list (11 earlier cycles)', `select public.bb_makeup_list('${newest}') as r`, 300, 3000],
      ['one bb_set_grade', `select public.bb_set_grade((select id from public.bb_candidates where cycle_id = '${newest}' and source = 'desk' limit 1), 1, '88de8004', 'B') as r`, 50]]) {
      try {
        const ms = await time(sql);
        // Only rows with a hard limit can warn; the others pass or fail at their limit.
        if (hardLimit && ms > limit && ms <= hardLimit) {
          warn(`${S}${label} <= ${limit} ms`, `${ms.toFixed(1)} ms (median of 3); accepted miss, fails above ${hardLimit} ms (v0.962), re-time with real data`);
        }
        const max = hardLimit ?? limit;
        record(`${S}${label} <= ${max} ms`, ms <= max, `${ms.toFixed(1)} ms (median of 3)`);
      } catch (error) {
        record(`${S}${label} <= ${limit} ms`, false, error.message);
      }
    }
    try {
      await db.exec(`update public.bb_settings set keep_years_after_last_day = 3, keep_years_after_18 = 3;`);
      const s0 = performance.now();
      const n = await one(db, 'select public.bb_purge_due()');
      const ms = performance.now() - s0;
      record(`${S}one bb_purge_due() over the whole seed <= 2 s`, ms <= 2000 && n > 0, `${n} purged in ${(ms / 1000).toFixed(2)} s`);
    } catch (error) {
      record(`${S}one bb_purge_due() over the whole seed <= 2 s`, false, error.message);
    }
  } catch (error) {
    record(S + 'seed and time limits', false, error.message);
  } finally {
    await db.close().catch(() => {});
  }
}

// =====================================================================
// step0025_production_order: 0025 on a fresh database built in the
// PRODUCTION order with every live migration (the status files, SETUP and
// the rulebook, 2026-10-23): 0001-0006, 0010, 0007, 0008, 0009, 0012, 0015,
// 0011 as production got it, 0019, 0014, 0020, camps' 0013 + 0017, 0018,
// 0016, 0021, 0022, then 0024 and 0023 (both pasted on 2026-10-22; 0024's
// run sheet lists 0003-0022 as "every other migration", so 0024 went
// first - their objects don't overlap, so the order changes nothing).
// Then 0025: every other fingerprint file unchanged (0016's and 0024's by
// exactly 12.3), every test file passes, 0025's fingerprints equal
// step0025's. "main25" = step0025's 0025 fingerprints (or null).
// =====================================================================
async function step0025_production_order(main25) {
  const L = '[0025 production order] ';
  const db = await buildBase(L);
  if (!db) return;
  for (const [label, file] of [['0003', '0003_testing_classes_ranks.sql'], ['0004', '0004_staff_accounts.sql']]) {
    if (!(await run(db, `${L}apply ${label}`, read('migrations', file)))) return;
  }
  await run(db, L + 'apply built-in seed', builtInSeedSql());
  if (!(await run(db, L + 'apply 0005', read('migrations', '0005_testing_events.sql')))) return;
  await seedTestEvent(db);
  for (const [label, file] of [['0006', '0006_star_testing.sql'], ['0010 (grading results)', '0010_testing_results.sql'],
    ['0007', '0007_schedule.sql'], ['0008', '0008_calendar.sql'], ['0009', '0009_forms.sql'], ['0012', '0012_prospects.sql'],
    ['0015', '0015_family_history.sql']]) {
    if (!(await run(db, `${L}apply ${label}`, read('migrations', file)))) return;
  }
  if (!(await run(db, L + 'apply 0011 as pasted on production 2026-10-19 (fixture)',
    readFileSync(path.join(here, 'fixtures', '0011_as_applied_2026-10-19.sql'), 'utf8')))) return;
  for (const [label, file] of [['today\'s 0011 over it', '0011_finance.sql'], ['0019', '0019_school_phone.sql'],
    ['0014 (private testing)', '0014_testing_private.sql'], ['0020 (current_session_id fix)', '0020_session_id_claims.sql'],
    ['0013 (camps)', '0013_camps.sql'], ['0017 (camps in Finance)', '0017_finance_camps.sql'],
    ['0018 (private testing money in Finance)', '0018_finance_private.sql'], ['0016 (Black Belt testing)', '0016_black_belt.sql'],
    ['0021', '0021_prospects_not_interested_sooner.sql'], ['0022 (camps weekly pricing)', '0022_camps_weekly_pricing.sql'],
    ['0024 (Black Belt rubric editor)', '0024_black_belt_rubric.sql'], ['0023 (Star result texts)', '0023_star_result_texts.sql']]) {
    if (!(await run(db, `${L}apply ${label}`, read('migrations', file)))) return;
  }

  const numbers = ['0003', '0004', '0005', '0006', '0010', '0007', '0008', '0009', '0012', '0015', '0011', '0019', '0014', '0020',
    '0013', '0017', '0018', '0016', '0021', '0022', '0024', '0023'].filter((n) => existsSync(path.join(supabaseDir, 'tests', `${n}_fingerprints.sql`)));
  const before = await printsOf(db, numbers);
  if (!(await run(db, L + 'apply 0025_black_belt_grading.sql', MIGRATION_0025()))) return;
  const after = await printsOf(db, numbers);
  const moved = numbers.filter((n) => !['0016', '0024'].includes(n)
    && JSON.stringify(before[`${n}_fingerprints.sql`]) !== JSON.stringify(after[`${n}_fingerprints.sql`]));
  record(`${L}${numbers.filter((n) => !['0016', '0024'].includes(n)).join(' / ')} fingerprints byte-identical before/after 0025`,
    moved.length === 0, moved.length ? `moved: ${moved.join(', ')}` : `${numbers.length - 2} files`);
  const w16 = diff0016for25(before['0016_fingerprints.sql'], after['0016_fingerprints.sql']);
  record(L + '0016_fingerprints.sql differs by EXACTLY contract 12.3', w16.length === 0, w16.join(' | '));
  const w24 = diff0024for25(before['0024_fingerprints.sql'], after['0024_fingerprints.sql']);
  record(L + '0024_fingerprints.sql differs by EXACTLY contract 12.3', w24.length === 0, w24.join(' | '));

  const testFiles = [['0025_tests.sql', 'ALL 0025 TESTS PASSED'], ['0024_tests.sql', 'ALL 0024 TESTS PASSED'],
    ['0016_tests.sql', 'ALL 0016 TESTS PASSED'], ['0023_tests.sql', 'ALL 0023 TESTS PASSED'],
    ['verify_pin_tests.sql', 'ALL PIN TESTS PASSED'], ['0002_tests.sql', 'ALL 0002 TESTS PASSED'], ['0003_tests.sql', 'ALL 0003 TESTS PASSED'],
    ['0004_tests.sql', 'ALL 0004 TESTS PASSED'], ['0005_tests.sql', 'ALL 0005 TESTS PASSED'], ['0006_tests.sql', 'ALL 0006 TESTS PASSED'],
    ['0010_tests.sql', 'ALL 0010 TESTS PASSED'], ['0007_tests.sql', 'ALL 0007 TESTS PASSED'], ['0008_tests.sql', 'ALL 0008 TESTS PASSED'],
    ['0009_tests.sql', 'ALL 0009 TESTS PASSED'], ['0012_tests.sql', 'ALL 0012 TESTS PASSED'], ['0015_tests.sql', 'ALL 0015 TESTS PASSED'],
    ['0011_tests.sql', 'ALL 0011 TESTS PASSED'], ['0019_tests.sql', 'ALL 0019 TESTS PASSED'], ['0014_tests.sql', 'ALL 0014 TESTS PASSED'],
    ['0020_tests.sql', 'ALL 0020 TESTS PASSED'], [CAMPS_TESTS, 'ALL 0017 TESTS PASSED'], ['0018_tests.sql', 'ALL 0018 TESTS PASSED'],
    ['0021_tests.sql', 'ALL 0021 TESTS PASSED'], ['0022_tests.sql', 'ALL 0022 TESTS PASSED'], ['0013_tests.sql', 'ALL 0013 TESTS PASSED']];
  for (const [file, ok] of testFiles) {
    if (existsSync(path.join(supabaseDir, 'tests', file))) await runTestFile(db, `${L}${file} (after 0025)`, file, ok);
  }
  await bbRegistrarLiveChecks(db);

  const mine = await fingerprints(db, '0025_fingerprints.sql');
  record(L + '0025 fingerprints identical to step0025 (main database)', !!main25 && JSON.stringify(mine) === JSON.stringify(main25),
    main25 ? `${mine.length} rows` : 'step0025 gave no fingerprints');
  await db.close().catch(() => {});
}

// =====================================================================
// step0022: camps weekly pricing and longer camps (0022, rulebook v0.717)
// ---------------------------------------------------------------------
// On its OWN fresh database built in the production order (every live
// migration: 0001-0006, 0010, 0007, 0008, 0009, 0012, 0015, 0011 as
// production got it, 0019, 0014, 0020, 0013, 0017, 0018, 0016, 0021):
//   a. live-like camp data made under the OLD rules: camp "Test" (1 day)
//      and camp "Test 2" (10 days in 3 weeks: 5 + 3 + 2, a 10-row grid),
//      three campers signed up AS camps_registrar, one payment, and two
//      templates (10 days and 3 days)
//   b. apply 0022: the data is tidied exactly as its section 6 says (Test
//      2's grid rows 6-10 go, its version +1; the 10-day template becomes
//      7 days a week (rows 1-7); nothing else - campers' prices, payments, Test,
//      the 3-day template - changes; 7 history rows, one batch, "Migration
//      0022"); the other migrations' fingerprints move ONLY where 0022
//      says (0013: exactly the 18 replaced functions; 0011 / 0017: only
//      the finance_day_closing_items amount rule; the rest: nothing)
//   c. 0022_tests.sql, then camps' and Finance's tests again (0013, 0017,
//      0011, 0018) plus 0014 / 0016 / 0020 / 0021
//   d. AS camps_registrar: the 4 new helpers are refused, camp_public_camp
//      works, a new sign-up on Test 2 is priced per week (5 + 3), and the
//      old rule's total is answered price_changed
//   e. 0022 applied a SECOND time: no row, history or fingerprint change
//   f. the Undo of SETUP.md 0022e exactly as written (check, re-run 0013,
//      the block): the 0013 / 0011 / 0017 / 0018 fingerprints equal the
//      ones before 0022, the helpers are gone, 0013 / 0017 tests pass
// =====================================================================
async function step0022() {
  const L = '[0022] ';
  record(`${L}0022_fingerprints.sql contains neither "delete" nor "drop" (connector-safe)`,
    !/delete|drop/i.test(read('tests', '0022_fingerprints.sql')));
  const db = await buildBase(L);
  if (!db) return null;
  for (const [label, file] of [['0003', '0003_testing_classes_ranks.sql'], ['0004', '0004_staff_accounts.sql']]) {
    if (!(await run(db, `${L}apply ${label}`, read('migrations', file)))) return null;
  }
  await run(db, L + 'apply built-in seed', builtInSeedSql());
  for (const [label, file] of [['0005', '0005_testing_events.sql'], ['0006', '0006_star_testing.sql'],
    ['0010 (grading results)', '0010_testing_results.sql'], ['0007', '0007_schedule.sql'], ['0008', '0008_calendar.sql'],
    ['0009', '0009_forms.sql'], ['0012', '0012_prospects.sql'], ['0015', '0015_family_history.sql']]) {
    if (!(await run(db, `${L}apply ${label}`, read('migrations', file)))) return null;
  }
  if (!(await run(db, L + 'apply 0011 as pasted on production 2026-10-19 (fixture)',
    readFileSync(path.join(here, 'fixtures', '0011_as_applied_2026-10-19.sql'), 'utf8')))) return null;
  for (const [label, file] of [['today\'s 0011 over it', '0011_finance.sql'], ['0019', '0019_school_phone.sql'],
    ['0014', '0014_testing_private.sql'], ['0020', '0020_session_id_claims.sql'], ['0013 (camps)', '0013_camps.sql'],
    ['0017 (camps in Finance)', '0017_finance_camps.sql'], ['0018 (private testing in Finance)', '0018_finance_private.sql'],
    ['0016 (Black Belt)', '0016_black_belt.sql'], ['0021', '0021_prospects_not_interested_sooner.sql']]) {
    if (!(await run(db, `${L}apply ${label}`, read('migrations', file)))) return null;
  }

  // a. live-like data under the old rules. Grid row k: member early
  // 7000k + 500 cents (not straight-line, so the old and new totals differ)
  const m = await one(db, `select (date_trunc('week', (public.testing_today() + 7)::timestamp)::date + 7)::text`);
  const seeded = await run(db, `${L}seed live-like camps "Test" and "Test 2", two templates (old rules)`, `
    begin;
    select set_config('request.jwt.claims', '', true);
    select set_config('tkd.actor_label', 'PGlite live-like camps', true);
    select set_config('tkd.action', 'seed', true);
    select set_config('tkd.batch_id', gen_random_uuid()::text, true);
    insert into public.camps (location_code, both_schools, name, start_time, end_time, signup_opens_on, signup_closes_on,
                              early_until, min_age, max_age, description, waiver_text, public_code, created_by_name, updated_by_name)
    values ('worcester', false, 'Test', '09:00', '15:00', public.testing_today() - 1, public.testing_today() + 3,
            public.testing_today() + 3, 5, 12, null, 'I agree.', 'pgte2345', '', ''),
           ('shrewsbury', true, 'Test 2', '09:00', '15:00', public.testing_today() - 1, public.testing_today() + 3,
            public.testing_today() + 3, 5, 12, null, 'I agree.', 'pgtt2345', '', '');
    insert into public.camp_days (camp_id, day)
    select c.id, date '${m}' + 2 from public.camps c where c.public_code = 'pgte2345'
    union all
    select c.id, date '${m}' + x from public.camps c, unnest(array[0, 1, 2, 3, 4, 14, 15, 16, 21, 22]) as x
     where c.public_code = 'pgtt2345';
    insert into public.camp_prices (camp_id, day_count, member_early_cents, member_regular_cents, nonmember_early_cents, nonmember_regular_cents)
    select c.id, k, 7000 * k + 500, 7500 * k + 500, 8000 * k + 500, 8500 * k + 500
      from public.camps c, generate_series(1, 10) as k
     where (c.public_code = 'pgte2345' and k = 1) or c.public_code = 'pgtt2345';
    insert into public.camp_templates (name, location_code, both_schools, day_count, start_time, end_time, opens_days_before,
                                       closes_days_before, early_days_before, min_age, max_age, description, waiver_text,
                                       prices, extras, created_by_name, updated_by_name)
    select n, 'worcester', false, d, '09:00', '15:00', 30, 1, 10, 5, 12, null, 'I agree.',
           (select jsonb_agg(jsonb_build_object('day_count', k, 'member_early_cents', 7000 * k + 500,
                                                'member_regular_cents', 7500 * k + 500, 'nonmember_early_cents', 8000 * k + 500,
                                                'nonmember_regular_cents', 8500 * k + 500) order by k)
              from generate_series(1, d) as k), '[]'::jsonb, '', ''
      from (values ('Old ten days', 10), ('Old three days', 3)) as t(n, d);
    select set_config('tkd.actor_label', '', true);
    select set_config('tkd.action', '', true);
    select set_config('tkd.batch_id', '', true);
    commit;`);
  if (!seeded) return null;
  const days = async (code) => (await db.query(`select array_agg(d.id::text order by d.day) as a from public.camp_days d
      join public.camps c on c.id = d.camp_id where c.public_code = $1`, [code])).rows[0].a;
  const waiver = await one(db, `select md5('I agree.')`);
  const signUp = async (code, children, total) => {
    try {
      await db.exec('set role camps_registrar;');
      const r = await db.query(
        `select public.camp_public_signup($1, $2, gen_random_uuid(), $3::jsonb, 'Test Parent', '5085550100', 'Parent',
                'Test Contact', '5085550101', 'Friend', 'cash', true, $4, 'camp-2026-10-18', $5, $6) as r`,
        [code, 'pglite-0022-client', JSON.stringify(children), TEST_SIGNATURE, waiver, total]);
      return r.rows[0].r;
    } catch (error) {
      return { status: 'error', message: error.message };
    } finally {
      await db.exec('reset role;').catch(() => {});
    }
  };
  const t2 = await days('pgtt2345');
  const t1 = await days('pgte2345');
  const child = (first, member, dayIds) => ({ first_name: first, last_name: 'Live', age: 8, member, day_ids: dayIds, extras: [] });
  // old rules: all 10 days = row 10 (70500); 2 days = row 2 (14500); Test 1 day = 7500
  const old1 = await signUp('pgtt2345', [child('Ten', true, t2), child('Two', true, t2.slice(0, 2))], 70500 + 14500);
  const old2 = await signUp('pgte2345', [child('One', true, t1)], 7500);
  record(`${L}three campers signed up under the OLD rules AS camps_registrar`, old1?.status === 'ok' && old2?.status === 'ok',
    `${old1?.status} ${old2?.status}`);
  await run(db, `${L}one payment for the 10-day camper`, `
    begin;
    select set_config('tkd.actor_label', 'PGlite live-like camps', true);
    insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_by_name)
    select c.id, 'payment', 70500, 'cash', public.testing_today(), 'shrewsbury', 'PGlite' from public.camp_campers c where c.first_name = 'Ten';
    select set_config('tkd.actor_label', '', true);
    commit;`);

  // b. apply 0022
  const CAMP_DATA = `select md5(coalesce((select string_agg(to_jsonb(x)::text, ',' order by x.id) from public.camp_campers x), '')
      || coalesce((select string_agg(to_jsonb(x)::text, ',' order by x.id) from public.camp_payments x), '')
      || coalesce((select string_agg(to_jsonb(x)::text, ',' order by x.id) from public.camp_camper_days x), '')
      || coalesce((select string_agg(to_jsonb(x)::text, ',' order by x.id) from public.camp_signups x), ''))`;
  const ALL_DATA = `select md5((${CAMP_DATA}) || coalesce((select string_agg(to_jsonb(x)::text, ',' order by x.id) from public.camp_prices x), '')
      || coalesce((select string_agg(to_jsonb(x)::text, ',' order by x.id) from public.camps x), '')
      || coalesce((select string_agg(to_jsonb(x)::text, ',' order by x.id) from public.camp_templates x), '')
      || coalesce((select string_agg(to_jsonb(x)::text, ',' order by x.id) from public.finance_day_closing_items x), '')
      || (select count(*) from public.change_log)::text)`;
  const campersBefore = await one(db, CAMP_DATA);
  const state = async () => (await db.query(`select
      (select array_agg(p.day_count::int || ':' || p.member_early_cents order by p.day_count) from public.camp_prices p
         join public.camps c on c.id = p.camp_id where c.public_code = 'pgtt2345') as t2_grid,
      (select array_agg(p.day_count::int order by p.day_count) from public.camp_prices p
         join public.camps c on c.id = p.camp_id where c.public_code = 'pgte2345') as t1_grid,
      (select c.version from public.camps c where c.public_code = 'pgtt2345') as t2_version,
      (select c.version from public.camps c where c.public_code = 'pgte2345') as t1_version,
      (select t.day_count || '/' || jsonb_array_length(t.prices) || '/' || t.version from public.camp_templates t where t.name = 'Old ten days') as tpl10,
      (select t.day_count || '/' || jsonb_array_length(t.prices) || '/' || t.version from public.camp_templates t where t.name = 'Old three days') as tpl3,
      (select (t.prices -> 4)::text from public.camp_templates t where t.name = 'Old ten days') as tpl10_row5`)).rows[0];
  const sBefore = await state();
  const printFiles = ['0003', '0004', '0005', '0006', '0010', '0007', '0008', '0009', '0012', '0015', '0011', '0019', '0014', '0020',
    '0013', '0017', '0018', '0016', '0021'].map((n) => `${n}_fingerprints.sql`);
  const before = {};
  for (const f of printFiles) before[f] = await fingerprints(db, f);
  const markBefore = await one(db, 'select coalesce(max(id), 0)::bigint from public.change_log');
  if (!(await run(db, `${L}apply 0022_camps_weekly_pricing.sql`, read('migrations', '0022_camps_weekly_pricing.sql')))) return null;
  const sAfter = await state();
  record(`${L}Test 2 keeps grid rows 1-5 with their prices, its version +1; camp Test unchanged`,
    JSON.stringify(sAfter.t2_grid) === JSON.stringify(sBefore.t2_grid.slice(0, 5)) && sAfter.t2_version === sBefore.t2_version + 1
      && JSON.stringify(sAfter.t1_grid) === JSON.stringify([1]) && sAfter.t1_version === sBefore.t1_version,
    JSON.stringify({ before: sBefore.t2_grid, after: sAfter.t2_grid, v: [sBefore.t2_version, sAfter.t2_version] }));
  const [d10, , v10] = sBefore.tpl10.split('/').map(Number);
  record(`${L}the 10-day template becomes 7 days a week (rows 1-7 kept), the 3-day template is untouched`,
    d10 === 10 && sAfter.tpl10 === `7/7/${v10 + 1}` && sAfter.tpl3 === sBefore.tpl3 && sAfter.tpl10_row5 === sBefore.tpl10_row5,
    JSON.stringify({ before: [sBefore.tpl10, sBefore.tpl3], after: [sAfter.tpl10, sAfter.tpl3] }));
  record(`${L}campers, their days, sign-ups and payments unchanged (prices are snapshots)`, campersBefore === (await one(db, CAMP_DATA)));
  const hist = (await db.query(`select count(*)::int as n, count(distinct batch_id)::int as batches,
      string_agg(distinct action, ',') as actions, string_agg(distinct actor_name, ',') as actors,
      string_agg(table_name || ':' || op, ',' order by table_name, op) as what
      from public.change_log where id > $1`, [markBefore])).rows[0];
  record(`${L}history: 5 grid rows removed + 1 camp + 1 template, one batch, "Migration 0022"`,
    hist.n === 7 && hist.batches === 1 && hist.actions === '0022_weekly_pricing' && hist.actors === 'Migration 0022',
    JSON.stringify(hist));
  // the other migrations' fingerprints: only what 0022 says may move
  const replaced = ['camp_days_arg_is_valid', 'camp_prices_arg_is_valid', 'camp_dates_are_sorted_set', 'camp_camper_extras_arg_is_valid',
    'camp_children_arg_is_valid', 'camp_template_setup_is_valid', 'camp_setup_args_are_valid', 'camp_camper_extras_are_ok',
    'camp_extras_only_on_ok', 'camp_camper_extras_before_write', 'camp_public_signup_answer', 'camp_camper_detail', 'camp_update_camp',
    'camp_save_template', 'camp_update_template', 'camp_update_details', 'camp_edit_payment', 'camp_public_signup_core'];
  const after = {};
  const wrong = [];
  let moved13 = [];
  for (const f of printFiles) {
    after[f] = await fingerprints(db, f);
    const gone = before[f].filter((line) => !after[f].includes(line));
    const added = after[f].filter((line) => !before[f].includes(line));
    if (f === '0013_fingerprints.sql') {
      moved13 = gone.map((line) => line.split('  ')[1].split('(')[0]).sort();
      const addedNames = added.map((line) => line.split('  ')[1].split('(')[0]).sort();
      if (JSON.stringify(moved13) !== JSON.stringify([...replaced].sort()) || JSON.stringify(addedNames) !== JSON.stringify(moved13)
        || gone.some((line) => !line.startsWith('function'))) wrong.push(`0013: ${moved13.join(',')}`);
    } else if (['0011_fingerprints.sql', '0017_fingerprints.sql'].includes(f)) {
      if (gone.length !== 1 || added.length !== 1 || !gone[0].includes('finance_day_closing_items_amount_check')
        || !added[0].includes('1000000')) wrong.push(`${f.slice(0, 4)}: ${JSON.stringify({ gone, added })}`);
    } else if (gone.length || added.length) {
      wrong.push(`${f.slice(0, 4)} moved`);
    }
  }
  record(`${L}fingerprints: 0013 moved exactly the 18 replaced functions, 0011 / 0017 only the amount rule, the rest nothing`,
    wrong.length === 0, wrong.join('; ') || `${printFiles.length} files`);
  const prints22 = await fingerprints(db, '0022_fingerprints.sql');
  record(`${L}0022 fingerprints: 22 functions + camp_public_camp / camp_public_signup, camps_registrar runs exactly those two`,
    prints22.filter((l) => l.startsWith('function')).length === 24
      && prints22.some((l) => l.startsWith('role  camps_registrar') && l.endsWith('runs=camp_public_camp,camp_public_signup'))
      && prints22.filter((l) => l.startsWith('function')).every((l) => l.includes('settings=search_path=""')),
    `${prints22.length} rows`);

  // c. the tests
  const tests = async (label) => {
    for (const [file, ok] of [['0022_tests.sql', 'ALL 0022 TESTS PASSED'], ['0013_tests.sql', 'ALL 0013 TESTS PASSED'],
      ['0017_tests.sql', 'ALL 0017 TESTS PASSED'], ['0011_tests.sql', 'ALL 0011 TESTS PASSED'], ['0018_tests.sql', 'ALL 0018 TESTS PASSED'],
      ['0014_tests.sql', 'ALL 0014 TESTS PASSED'], ['0016_tests.sql', 'ALL 0016 TESTS PASSED'], ['0020_tests.sql', 'ALL 0020 TESTS PASSED'],
      ['0021_tests.sql', 'ALL 0021 TESTS PASSED']]) {
      await runTestFile(db, `${L}${file} (${label})`, file, ok);
    }
  };
  await tests('after 0022');

  // d. AS camps_registrar
  const refused = [];
  for (const sql of ["select public.camp_week_size(array[current_date])",
    'select public.camp_weekly_base_cents(gen_random_uuid(), array[gen_random_uuid()], true, \'early\')',
    'select public.camp_comes_whole_week(gen_random_uuid(), array[gen_random_uuid()], gen_random_uuid())',
    'select public.camp_weeks_breakdown(gen_random_uuid(), array[gen_random_uuid()], true, \'early\')']) {
    try {
      await db.exec('set role camps_registrar;');
      await db.exec(sql);
      refused.push(sql.slice(14, 40));
    } catch (error) {
      if (!/permission denied/i.test(error.message)) refused.push(`${sql.slice(14, 40)} (${error.message})`);
    } finally {
      await db.exec('reset role;').catch(() => {});
    }
  }
  record(`${L}[camps registrar] the 4 new helpers are refused`, refused.length === 0, refused.join('; '));
  let pub = null;
  try {
    await db.exec('set role camps_registrar;');
    pub = (await db.query("select public.camp_public_camp('pgtt2345') as r")).rows[0].r;
  } catch (error) {
    pub = { status: error.message };
  } finally {
    await db.exec('reset role;').catch(() => {});
  }
  record(`${L}[camps registrar] camp_public_camp shows Test 2 with grid rows 1-5`,
    pub?.status === 'ok' && pub.camp.prices.length === 5 && pub.camp.days.length === 10, JSON.stringify(pub?.camp?.prices?.length ?? pub));
  // 5 + 3 days on Test 2, member early: row 5 (35500) + row 3 (21500) = 57000; the old rule's 8-day row would be 56500
  const t2days = [...t2.slice(0, 5), ...t2.slice(5, 8)];
  const stale = await signUp('pgtt2345', [child('Eight', true, t2days)], 56500);
  const fresh = await signUp('pgtt2345', [child('Eight', true, t2days)], 57000);
  record(`${L}[camps registrar] a 5 + 3 sign-up on Test 2: the old total -> price_changed (57000), the new one -> ok with two week lines`,
    stale?.status === 'price_changed' && stale.new_total_cents === 57000 && fresh?.status === 'ok'
      && fresh.children[0].base_cents === 57000 && fresh.children[0].weeks.length === 2
      && fresh.children[0].weeks[0].cents === 35500 && fresh.children[0].weeks[1].cents === 21500,
    JSON.stringify({ stale: stale?.status, fresh: fresh?.children?.[0] ?? fresh }));

  // e. re-run safety
  const dataBefore = await one(db, ALL_DATA);
  const p13 = await fingerprints(db, '0013_fingerprints.sql');
  await run(db, `${L}apply 0022 a SECOND time (re-run safety)`, read('migrations', '0022_camps_weekly_pricing.sql'));
  record(`${L}0022 re-run: no row, history or fingerprint change`,
    dataBefore === (await one(db, ALL_DATA)) && JSON.stringify(prints22) === JSON.stringify(await fingerprints(db, '0022_fingerprints.sql'))
      && JSON.stringify(p13) === JSON.stringify(await fingerprints(db, '0013_fingerprints.sql')));
  await tests('after the re-run');

  // f. Undo 0022, exactly as SETUP.md has it: its first sql block (the
  // check), re-run 0013, its second sql block
  const setup = read('SETUP.md').replace(/\r\n/g, '\n');
  const at = setup.search(/^### 0022e\. Undo 0022/m);
  const blocks = at < 0 ? [] : [...setup.slice(at).matchAll(/```sql\n([\s\S]*?)```/g)].map((x) => x[1]).slice(0, 2);
  if (blocks.length !== 2) {
    record(`${L}[undo 0022] find the two sql blocks in SETUP.md`, false, 'no "### 0022e. Undo 0022" heading with two sql blocks');
  } else if (await run(db, `${L}[undo 0022] step 1: the check`, blocks[0])
    && await run(db, `${L}[undo 0022] step 2: re-run 0013_camps.sql`, read('migrations', '0013_camps.sql'))
    && await run(db, `${L}[undo 0022] step 3: the SQL block`, blocks[1])) {
    const back = [];
    for (const f of ['0013_fingerprints.sql', '0011_fingerprints.sql', '0017_fingerprints.sql', '0018_fingerprints.sql']) {
      if (JSON.stringify(before[f]) !== JSON.stringify(await fingerprints(db, f))) back.push(f.slice(0, 4));
    }
    const left = await one(db, `select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('camp_week_size', 'camp_weekly_base_cents', 'camp_comes_whole_week', 'camp_weeks_breakdown')`);
    record(`${L}[undo 0022] 0013 / 0011 / 0017 / 0018 fingerprints equal the ones before 0022; no 0022 helper left`,
      back.length === 0 && left === 0, back.length ? `differ: ${back.join(', ')}` : `${left} helpers left`);
    for (const [file, ok] of [['0013_tests.sql', 'ALL 0013 TESTS PASSED'], ['0017_tests.sql', 'ALL 0017 TESTS PASSED'],
      ['0011_tests.sql', 'ALL 0011 TESTS PASSED']]) {
      await runTestFile(db, `${L}[undo 0022] ${file}`, file, ok);
    }
  }
  await db.close().catch(() => {});
  return prints22;
}

// =====================================================================
// step0026: Finance - Black Belt payments in the Daily report (0026,
// CONTRACT-0026; rulebook v0.808, v0.809, v0.814, v0.815)
// ---------------------------------------------------------------------
// Production order: ... 0018 -> 0016 -> 0021 -> 0022 -> 0024 -> 0023 ->
// 0025 -> 0026. Three databases of its own:
//   a. 0026_fingerprints.sql and 0026_preapply_check.sql are
//      connector-safe; every camp block of 0026 is one of 0017's and every
//      private block one of 0018's, byte for byte
//   b. database 1, built in the production order with every live migration
//      (no payments): the GUARD refuses 0026 when 0016 is missing, when
//      0018 isn't applied, when a replaced function isn't its live version
//      and when one of the two table rules it rebuilds is changed or
//      missing (each inside a transaction that is rolled back; nothing
//      changes); the pre-apply check says "ok" for all nine functions and
//      both rules;
//      0026 applied; every other migration's fingerprints byte-identical -
//      0011's and 0017's move in exactly the nine functions and the two
//      rules, 0018's in exactly its five replaced functions, 0022's in the
//      closing items' source rule only;
//      0026_tests.sql and EVERY earlier test file pass; 0026 a second time
//      changes no row and no fingerprint; 0018 re-run afterwards is refused
//      by 0018's own guard
//   c. on a COPY of database 1 before 0026: a Black Belt payment on a day
//      closed before 0026 -> the pre-apply check lists that day, and after
//      0026 it shows "changed after closing"; a past day whose only item
//      is a returned check -> History "no_payments" (total below 0), not in
//      the Home reminder, nothing to close
//   d. database 2, production order with the big seeds (Color Belt, Star,
//      the chain seed, camps, private testing; no Black Belt rows): the
//      Finance answers BEFORE and AFTER 0026 are identical (every 7th day
//      of 5 years + every chain-seed day: items and figures with the
//      fingerprint; ~70 payment details; finance_day both schools, the Both
//      summary every 61st day; History for 6 months; the year's exports;
//      Home) - 0026's new keys (refunds.card_cents, returned) taken out
//   e. then the Black Belt seed (finance_black_belt_perf_seed.sql: 2,000
//      candidates, ~4,000 rows with edits, card refunds, returned checks
//      and undone marks) on database 2: no other source's item changes;
//      0026_tests.sql passes there; every app function answers in < 2 s
//      and the Black Belt answers are right (the busiest returned-check
//      day closes with exactly what it expects - card after card refunds)
//   f. a database that sorts text like production (ICU en-US): the same
//      production order, 0026, its tests and 0011 / 0017 / 0018's, then
//      the big seed + the Black Belt seed and the same speed checks
// Returns 0026's fingerprints (printed at the end), or null.
// =====================================================================
const MIGRATION_0026 = () => read('migrations', '0026_finance_black_belt.sql');
const BB_FINANCE_SEED = () => readFileSync(path.join(here, 'finance_black_belt_perf_seed.sql'), 'utf8');
const PRIVATE_SEED = () => readFileSync(path.join(here, 'finance_private_perf_seed.sql'), 'utf8');
const REPLACED_0026 = ['finance_chain_steps_core', 'finance_money_rows_core', 'finance_figures_from',
  'finance_closing_changes_from', 'finance_payment_detail', 'finance_day', 'finance_export', 'finance_close_day', 'finance_day_both'];
const RULES_0026 = ['finance_day_closing_items_source_check', 'finance_day_closings_counts_check'];
const NUMBERS_0025 = ['0003', '0004', '0005', '0006', '0010', '0007', '0008', '0009', '0012', '0015', '0011', '0019', '0014', '0020',
  '0013', '0017', '0018', '0016', '0021', '0022', '0024', '0023', '0025'];

// Every migration in the production order up to 0025 (as
// step0025_production_order), on a database made by buildBase; `seeds`
// (SQL) goes in after 0021, before camps' 0022 (whose rules the camps
// speed seed predates - as on production, where those camps came first).
async function liveOrderTo0025(db, L, seeds = '') {
  for (const [label, file] of [['0003', '0003_testing_classes_ranks.sql'], ['0004', '0004_staff_accounts.sql']]) {
    if (!(await run(db, `${L}apply ${label}`, read('migrations', file)))) return false;
  }
  await run(db, L + 'apply built-in seed', builtInSeedSql());
  if (!(await run(db, L + 'apply 0005', read('migrations', '0005_testing_events.sql')))) return false;
  await seedTestEvent(db);
  for (const [label, file] of [['0006', '0006_star_testing.sql'], ['0010', '0010_testing_results.sql'],
    ['0007', '0007_schedule.sql'], ['0008', '0008_calendar.sql'], ['0009', '0009_forms.sql'], ['0012', '0012_prospects.sql'],
    ['0015', '0015_family_history.sql']]) {
    if (!(await run(db, `${L}apply ${label}`, read('migrations', file)))) return false;
  }
  if (!(await run(db, L + 'apply 0011 as pasted on production 2026-10-19 (fixture)', OLD_0011()))) return false;
  for (const [label, file] of [['today\'s 0011 over it', '0011_finance.sql'], ['0019', '0019_school_phone.sql'],
    ['0014', '0014_testing_private.sql'], ['0020', '0020_session_id_claims.sql'], ['0013', '0013_camps.sql'],
    ['0017', '0017_finance_camps.sql'], ['0018', '0018_finance_private.sql'], ['0016', '0016_black_belt.sql'],
    ['0021', '0021_prospects_not_interested_sooner.sql']]) {
    if (!(await run(db, `${L}apply ${label}`, read('migrations', file)))) return false;
  }
  if (seeds && !(await run(db, L + 'the big seeds', seeds))) return false;
  for (const [label, file] of [['0022', '0022_camps_weekly_pricing.sql'], ['0024', '0024_black_belt_rubric.sql'],
    ['0023', '0023_star_result_texts.sql'], ['0025', '0025_black_belt_grading.sql']]) {
    if (!(await run(db, `${L}apply ${label}`, read('migrations', file)))) return false;
  }
  return true;
}

// The pretend admin's login token for a session made by adminSession
const ADMIN_CLAIMS_0026 = () => JSON.stringify({ sub: ADMIN_UID, role: 'authenticated', session_id: '44444444-4444-4444-8444-444444444444',
  amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) - 60 }] });

// Four Black Belt cycles for the seed ("PGlite fin26 1" .. "4"), made
// through bb_add_cycle with the admin's token (adminSession first)
async function bbSeedCycles(db, L) {
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [ADMIN_CLAIMS_0026()]);
  const out = [];
  for (let k = 1; k <= 4; k++) {
    const r = (await db.query(`select public.bb_add_cycle(${bb24Payload(`PGlite fin26 ${k}`, 30 + 30 * k)}, null) as r`)).rows[0].r;
    out.push(r?.status);
  }
  record(`${L}four Black Belt cycles for the seed (bb_add_cycle)`, out.every((x) => x === 'ok'), out.join(','));
  return run(db, `${L}the Black Belt seed (finance_black_belt_perf_seed.sql)`, BB_FINANCE_SEED());
}

// 0026's new keys taken out of an answer (for "the same as before")
function strip0026(answer) {
  const c = structuredClone(answer);
  const walk = (o) => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === 'object') {
      delete o.returned;
      if (o.refunds && typeof o.refunds === 'object') delete o.refunds.card_cents;
      Object.values(o).forEach(walk);
    }
  };
  walk(c);
  return c;
}

// One timed app-function call as the signed-in admin (role authenticated)
async function timed0026(db, tag, label, sql, params = []) {
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
}

// e / f. Speed and right answers with the Black Belt seed
async function bbFinanceSpeed(db, tag) {
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [ADMIN_CLAIMS_0026()]);
  const rows = await one(db, `select count(*)::int from public.bb_payments`);
  const kinds = (await db.query(`select count(*) filter (where kind = 'returned')::int as returned,
      count(*) filter (where kind = 'reversal' and exists (select 1 from public.bb_payments t where t.id = p.reverses_payment_id and t.kind = 'returned'))::int as undone_marks,
      count(*) filter (where kind = 'refund' and method = 'card')::int as card_refunds from public.bb_payments p`)).rows[0];
  record(`${tag} the Black Belt seed: thousands of rows, returned checks, undone marks, card refunds`,
    rows > 3500 && kinds.returned > 100 && kinds.undone_marks > 40 && kinds.card_refunds > 100, `${rows} rows ${JSON.stringify(kinds)}`);
  const today = await one(db, 'select public.testing_today()::text');
  // the Worcester day with the most counted returned checks that isn't closed yet
  const busy = await one(db, `select p.paid_on::text from public.bb_payments p
     where p.location_code = 'worcester' and p.kind = 'returned' and p.paid_on < public.testing_today()
       and not exists (select 1 from public.bb_payments x where x.reverses_payment_id = p.id)
       and not exists (select 1 from public.finance_day_closings c where c.location_code = 'worcester' and c.day = p.paid_on)
     group by p.paid_on order by count(*) desc, p.paid_on limit 1`);
  const ret = (await db.query(`select count(*)::int as n, coalesce(sum(p.amount_cents), 0)::int as cents from public.bb_payments p
     where p.location_code = 'worcester' and p.kind = 'returned' and p.paid_on = $1::date
       and not exists (select 1 from public.bb_payments x where x.reverses_payment_id = p.id)`, [busy])).rows[0];
  const undoneRet = await one(db, `select p.id::text from public.bb_payments p where p.kind = 'returned'
     and exists (select 1 from public.bb_payments x where x.reverses_payment_id = p.id) order by p.id limit 1`);
  const liveRet = await one(db, `select p.id::text from public.bb_payments p where p.kind = 'returned'
     and not exists (select 1 from public.bb_payments x where x.reverses_payment_id = p.id) order by p.id limit 1`);
  const edited = await one(db, `select p.id::text from public.bb_payments p join public.bb_candidates c on c.id = p.candidate_id
     where c.first_name = 'Bbperf' and c.last_name = 'Bp 14' and p.kind = 'payment' and p.recorded_by_name = 'Staff' and p.for_items = '{p1}'`);
  const day = await timed0026(db, tag, 'finance_day (the busiest returned-check day)', `select public.finance_day('worcester', '${busy}') as r`);
  const items = day?.items ?? [];
  const counting = items.filter((i) => ['counted', 'edited', 'moved_in'].includes(i.state));
  const bbItems = items.filter((i) => i.source === 'black_belt');
  record(`${tag} that day: returned {count, cents} right, the Total adds up, every Black Belt line has its keys`,
    !!day && day.returned.count === ret.n && day.returned.cents === ret.cents && ret.n > 0
      && day.totals.total_cents === counting.reduce((n, i) => n + i.amount_cents, 0)
      && bbItems.length > 0 && bbItems.every((i) => 'for_items' in i && 'one_payment_plan' in i && 'handed_in_on' in i && i.event_name)
      && items.filter((i) => i.kind === 'returned').every((i) => i.handed_in_on && i.method === 'check' && i.amount_cents < 0),
    `${busy}: ${items.length} items, returned ${JSON.stringify(day?.returned)} (expected ${ret.n} / ${ret.cents})`);
  const d1 = await timed0026(db, tag, 'finance_payment_detail (an undone returned mark)', `select public.finance_payment_detail('black_belt', '${undoneRet}') as r`);
  const d2 = await timed0026(db, tag, 'finance_payment_detail (a returned check)', `select public.finance_payment_detail('black_belt', '${liveRet}') as r`);
  const d3 = await timed0026(db, tag, 'finance_payment_detail (an edited payment)', `select public.finance_payment_detail('black_belt', '${edited}') as r`);
  const whats = (d) => (d?.history ?? []).map((h) => h.what).join(',');
  record(`${tag} the histories: undone mark, returned check, edited payment`,
    whats(d1) === 'returned_undone,returned,recorded' && d1?.item?.state === 'undone' && whats(d2) === 'returned,recorded'
      && whats(d3) === 'edited,recorded' && d3?.item?.state === 'edited',
    `${whats(d1)} | ${whats(d2)} | ${whats(d3)}`);
  await timed0026(db, tag, 'finance_day_both (that day)', `select public.finance_day_both('${busy}') as r`);
  await timed0026(db, tag, 'finance_history (both schools, that month)', `select public.finance_history(null, '${busy}') as r`);
  await timed0026(db, tag, 'finance_home', 'select public.finance_home() as r');
  const ex = await timed0026(db, tag, 'finance_export (366 days, Worcester)', `select public.finance_export('worcester', date '${today}' - 365, '${today}') as r`);
  const exRows = ex?.rows ?? [];
  record(`${tag} the year export has Black Belt rows (returned checks with handed_in_on) and only they carry the extra keys`,
    exRows.some((r) => r.kind === 'returned' && r.handed_in_on && r.counted_cents <= 0)
      && exRows.filter((r) => r.what === 'black_belt').every((r) => 'for_items' in r)
      && exRows.filter((r) => r.what !== 'black_belt').every((r) => !('for_items' in r)),
    `${exRows.length} rows, ${exRows.filter((r) => r.what === 'black_belt').length} Black Belt`);
  // Close that day with exactly what it expects: the card total after card refunds (v0.814)
  const c = await timed0026(db, tag, 'finance_close_day (that day, as expected)',
    `select public.finance_close_day('worcester', '${busy}', $1, $2, $3, $4, $5, null) as r`,
    [day?.fingerprint, day?.totals.cash.cents + day?.refunds.cash_cents, day?.totals.check.count, day?.totals.check.cents,
      day?.totals.card.cents + day?.refunds.card_cents]);
  record(`${tag} ... and every part matches (cash, checks, card after card refunds; returned checks left out)`,
    c?.results?.cash?.result === 'matches' && c?.results?.checks?.result === 'matches' && c?.results?.card?.result === 'matches',
    JSON.stringify(c?.results));
  const after = await timed0026(db, tag, 'finance_day (that day, closed)', `select public.finance_day('worcester', '${busy}') as r`);
  record(`${tag} ... not changed after closing`, after?.closing?.changed_after === false, JSON.stringify(after?.closing?.changed_count));
  await db.query(`select set_config('request.jwt.claims', '', false)`);
}

async function step0026() {
  const L = '[0026] ';
  // a.
  record(`${L}0026_fingerprints.sql and 0026_preapply_check.sql contain neither "delete" nor "drop" (connector-safe)`,
    !/delete|drop/i.test(read('tests', '0026_fingerprints.sql')) && !/delete|drop/i.test(read('tests', '0026_preapply_check.sql')));
  const blocksOf = (text, b, e) => text.replace(/\r\n/g, '\n').match(new RegExp(`${b}[\\s\\S]*?${e}`, 'g')) ?? [];
  const m26 = MIGRATION_0026();
  const camp26 = blocksOf(m26, '-- ===== source: camp \\(0017\\) =====', '-- ===== end camp =====');
  const priv26 = blocksOf(m26, '-- ===== source: color belt private \\(0018\\) =====', '-- ===== end color belt private =====');
  const camp17 = blocksOf(CAMPS_0017(), '-- ===== source: camp \\(0017\\) =====', '-- ===== end camp =====');
  const priv18 = blocksOf(MIGRATION_0018(), '-- ===== source: color belt private \\(0018\\) =====', '-- ===== end color belt private =====');
  record(`${L}every camp block of 0026 is one of 0017's and every private block one of 0018's, byte for byte`,
    camp26.length > 0 && priv26.length > 0 && camp26.every((x) => camp17.includes(x)) && priv26.every((x) => priv18.includes(x))
      && (m26.match(/-- ===== source: black belt \(0026\) =====/g) ?? []).length === (m26.match(/-- ===== end black belt =====/g) ?? []).length,
    `${camp26.length} camp + ${priv26.length} private blocks`);

  // b. database 1
  const db = await buildBase(L);
  if (!db) return null;
  if (!(await liveOrderTo0025(db, L))) return null;
  const dayMd5 = `select md5(p.prosrc) from pg_proc p where p.proname = 'finance_day'`;
  const guardTry = async (label, before, wanted) => {
    const md5Before = await one(db, dayMd5);
    let message = '';
    try {
      await db.exec('begin;\n' + before + '\n' + m26);
    } catch (error) {
      message = error.message;
    }
    await db.exec('rollback;').catch(() => {});
    record(`${L}the guard refuses 0026 when ${label} (it stops, nothing changes)`,
      message.includes(wanted) && (await one(db, dayMd5)) === md5Before
        && (await one(db, `select to_regclass('public.bb_payments') is not null`)) === true, message || 'it ran');
  };
  await guardTry('0016 is missing', 'alter table public.bb_payments rename to bb_payments_gone;', 'needs migration 0016');
  const t17 = CAMPS_0017().replace(/\r\n/g, '\n');
  const at17 = t17.indexOf('drop function if exists public.finance_chain_steps_core(date, date, text, uuid);');
  await guardTry('0018 is not applied (0017\'s chain helper)', t17.slice(at17, t17.indexOf('$$;', t17.indexOf('as $$', at17)) + 3),
    "must be applied after Finance's 0018");
  const atDay = t17.indexOf('create or replace function public.finance_day(');
  await guardTry('a replaced function differs from its live version (finance_day)',
    t17.slice(atDay, t17.indexOf('$$;', t17.indexOf('as $$', atDay)) + 3).replace("'status', 'no_access'", "'status', 'no_access_changed'"),
    'rebuild 0026 first');
  await guardTry('a table rule it rebuilds differs from the live one (finance_day_closings_counts_check)',
    `alter table public.finance_day_closings drop constraint finance_day_closings_counts_check;
     alter table public.finance_day_closings add constraint finance_day_closings_counts_check
       check (cash_counted_cents is null or cash_counted_cents between -10000000 and 10000000);`,
    'other Finance table rules than the live ones');
  await guardTry('a table rule it rebuilds is missing (finance_day_closing_items_source_check)',
    'alter table public.finance_day_closing_items drop constraint finance_day_closing_items_source_check;',
    'other Finance table rules than the live ones');
  const pre = (await db.query(read('tests', '0026_preapply_check.sql'))).rows;
  record(`${L}the pre-apply check: all nine functions and both rules "ok: the live ...", no closed day`,
    pre.length === 11 && pre.filter((r) => r.kind === 'function').length === 9 && pre.filter((r) => r.kind === 'rule').length === 2
      && pre.every((r) => r.detail.startsWith('ok: the live')), JSON.stringify(pre.map((r) => r.detail.slice(0, 20))));

  // c. on a copy: a Black Belt payment on a day closed before 0026; a returned-only past day
  const copy = await db.clone();
  try {
    await adminSession(copy);
    const r = (await copy.query(`select public.bb_add_cycle(${bb24Payload('PGlite fin26 closed', 60)}, null) as r`)).rows[0].r;
    const made = await run(copy, `${L}[closed before 0026] a candidate, a check on a day closed before 0026, an empty close`, `
      begin;
      select set_config('request.jwt.claims', '', true);
      select set_config('tkd.actor_label', 'PGlite fin26', true);
      insert into public.bb_candidates (cycle_id, first_name, last_name, date_of_birth, email_for_results, location_code, dan,
                                        cycle_plan_id, kukkiwon, source, reference, created_by_name, updated_by_name)
      select '${r?.id}', 'Closed', 'Before', date '1980-01-01', 'closed.before@example.com', 'worcester', 1, pl.id, false, 'desk',
             'BB-' || nextval('public.bb_candidate_ref_seq'::regclass)::text, '', ''
        from public.bb_cycle_plans pl where pl.cycle_id = '${r?.id}' limit 1;
      insert into public.bb_payments (candidate_id, cycle_id, kind, amount_cents, method, paid_on, for_items, location_code, cycle_name,
                                      recorded_at, recorded_by, recorded_by_name)
      select c.id, c.cycle_id, 'payment', 87000, 'check', public.testing_today() - 20, '{p1}', 'worcester', 'PGlite fin26 closed',
             ((public.testing_today() - 20) + time '15:00') at time zone 'America/New_York', '${DESK_UID}', 'Staff'
        from public.bb_candidates c where c.first_name = 'Closed';
      insert into public.finance_day_closings (location_code, day, kind, cash_counted_cents, checks_counted, checks_counted_cents,
        card_counted_cents, expected_count, expected_cash_cents, expected_checks, expected_checks_cents, expected_card_cents, recorded_by_name)
      values ('worcester', public.testing_today() - 20, 'close', 0, 0, 0, 0, 0, 0, 0, 0, 0, 'Main Admin');
      commit;`);
    if (made) {
      const pre2 = (await copy.query(read('tests', '0026_preapply_check.sql'))).rows.filter((x) => x.kind === 'closed day');
      record(`${L}[closed before 0026] the pre-apply check lists that day (1 Black Belt line)`,
        pre2.length === 1 && pre2[0].detail.includes(': 1 Black Belt payment'), JSON.stringify(pre2));
      if (await run(copy, `${L}[closed before 0026] apply 0026`, m26)) {
        const today = await one(copy, 'select public.testing_today()::text');
        const d = await asAdmin(copy, `select public.finance_day('worcester', date '${today}' - 20) as r`);
        record(`${L}[closed before 0026] that day now shows "changed after closing"`,
          d?.closing?.changed_after === true && d?.closing?.changed_count === 1, JSON.stringify(d?.closing?.changed_count));
        // a returned check on the next (empty) day - written as on production it never could be
        // (the guard dates returned rows today), so with the table's triggers off
        await run(copy, `${L}[returned-only day] a returned check alone on a past day`, `
          begin;
          set local session_replication_role = replica;
          insert into public.bb_payments (candidate_id, cycle_id, kind, amount_cents, method, paid_on, location_code, cycle_name,
                                          recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
          select p.candidate_id, p.cycle_id, 'returned', -p.amount_cents, 'check', public.testing_today() - 19, p.location_code, p.cycle_name,
                 ((public.testing_today() - 19) + time '10:00') at time zone 'America/New_York', '${ADMIN_UID}', 'Main Admin', p.id
            from public.bb_payments p join public.bb_candidates c on c.id = p.candidate_id where c.first_name = 'Closed';
          commit;`);
        const h = await asAdmin(copy, `select public.finance_history('worcester', date '${today}' - 19) as r`);
        const day19 = await one(copy, `select (date '${today}' - 19)::text`);
        const hd = (h?.days ?? []).find((x) => x.day === day19);
        const d19 = await asAdmin(copy, `select public.finance_day('worcester', date '${today}' - 19) as r`);
        const home = await one(copy, `select public.finance_home_at(now(), true) as r`);
        record(`${L}[returned-only day] History "no_payments" with a negative total; nothing to close; not in the Home reminder`,
          hd?.tag === 'no_payments' && hd?.total_cents === -87000 && d19?.can_close === false
            && d19?.returned?.count === 1 && (home?.earlier?.by_school?.worcester?.count ?? 0) === 0,
          JSON.stringify({ tag: hd?.tag, total: hd?.total_cents, can_close: d19?.can_close, earlier: home?.earlier }));
        const c19 = await asAdmin(copy, `select public.finance_close_day('worcester', date '${today}' - 19, $1, 0, 0, 0, 0, null) as r`, [d19?.fingerprint]);
        record(`${L}[returned-only day] Close the day: nothing_to_close`, c19?.status === 'nothing_to_close', c19?.status);
      }
    }
  } catch (error) {
    record(`${L}[closed before 0026] the copy`, false, error.message);
  } finally {
    await copy.close().catch(() => {});
  }

  // b (continued). apply 0026 on database 1
  const numbers = NUMBERS_0025.filter((n) => existsSync(path.join(supabaseDir, 'tests', `${n}_fingerprints.sql`)));
  const before = await printsOf(db, numbers);
  if (!(await run(db, L + 'apply 0026_finance_black_belt.sql', m26))) return null;
  const after = await printsOf(db, numbers);
  const nameOf = (line) => {
    const item = line.split('  ')[1] ?? '';
    return item.includes('(') ? item.split('(')[0] : item.split('.').pop();
  };
  const moved = {};
  for (const n of numbers) {
    const f = `${n}_fingerprints.sql`;
    const gone = before[f].filter((x) => !after[f].includes(x));
    const added = after[f].filter((x) => !before[f].includes(x));
    if (gone.length || added.length) {
      moved[n] = { gone: [...new Set(gone.map(nameOf))].sort(), added: [...new Set(added.map(nameOf))].sort() };
    }
  }
  const all11 = [...REPLACED_0026, ...RULES_0026].sort();
  const five18 = REPLACED_0026.filter((x) => ['finance_chain_steps_core', 'finance_money_rows_core', 'finance_figures_from',
    'finance_closing_changes_from', 'finance_payment_detail'].includes(x)).sort();
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  record(`${L}fingerprints: 0011 / 0017 move in exactly the nine functions + two rules, 0018 in its five, 0022 in the source rule, every other file byte-identical`,
    same(Object.keys(moved).sort(), ['0011', '0017', '0018', '0022'])
      && same(moved['0022']?.gone, ['finance_day_closing_items_source_check']) && same(moved['0022']?.added, ['finance_day_closing_items_source_check'])
      && same(moved['0011']?.gone, all11) && same(moved['0011']?.added, all11)
      && same(moved['0017']?.gone, all11) && same(moved['0017']?.added, all11)
      && same(moved['0018']?.gone, five18) && same(moved['0018']?.added, five18),
    JSON.stringify(moved));
  const prints26 = await fingerprints(db, '0026_fingerprints.sql');
  const fn26 = prints26.filter((l) => l.startsWith('function'));
  record(`${L}0026 fingerprints: nine functions (search_path "", definer + authenticated only on the five app functions) and two rules`,
    fn26.length === 9 && prints26.length === 11 && fn26.every((l) => l.includes('settings=search_path=""'))
      && fn26.every((l) => {
        const app = ['finance_payment_detail', 'finance_day(', 'finance_export', 'finance_close_day', 'finance_day_both'].some((x) => l.split('  ')[1].startsWith(x));
        return app ? l.includes('definer=true') && /rights=authenticated:EXECUTE,postgres:EXECUTE$/.test(l)
          : l.includes('definer=false') && /rights=postgres:EXECUTE$/.test(l);
      }),
    `${prints26.length} rows`);
  const testFiles = [['0026_tests.sql', 'ALL 0026 TESTS PASSED'], ['0025_tests.sql', 'ALL 0025 TESTS PASSED'],
    ['0024_tests.sql', 'ALL 0024 TESTS PASSED'], ['0016_tests.sql', 'ALL 0016 TESTS PASSED'], ['0023_tests.sql', 'ALL 0023 TESTS PASSED'],
    ['verify_pin_tests.sql', 'ALL PIN TESTS PASSED'], ['0002_tests.sql', 'ALL 0002 TESTS PASSED'], ['0003_tests.sql', 'ALL 0003 TESTS PASSED'],
    ['0004_tests.sql', 'ALL 0004 TESTS PASSED'], ['0005_tests.sql', 'ALL 0005 TESTS PASSED'], ['0006_tests.sql', 'ALL 0006 TESTS PASSED'],
    ['0010_tests.sql', 'ALL 0010 TESTS PASSED'], ['0007_tests.sql', 'ALL 0007 TESTS PASSED'], ['0008_tests.sql', 'ALL 0008 TESTS PASSED'],
    ['0009_tests.sql', 'ALL 0009 TESTS PASSED'], ['0012_tests.sql', 'ALL 0012 TESTS PASSED'], ['0015_tests.sql', 'ALL 0015 TESTS PASSED'],
    ['0011_tests.sql', 'ALL 0011 TESTS PASSED'], ['0019_tests.sql', 'ALL 0019 TESTS PASSED'], ['0014_tests.sql', 'ALL 0014 TESTS PASSED'],
    ['0020_tests.sql', 'ALL 0020 TESTS PASSED'], [CAMPS_TESTS, 'ALL 0017 TESTS PASSED'], ['0018_tests.sql', 'ALL 0018 TESTS PASSED'],
    ['0021_tests.sql', 'ALL 0021 TESTS PASSED'], ['0022_tests.sql', 'ALL 0022 TESTS PASSED'], ['0013_tests.sql', 'ALL 0013 TESTS PASSED']];
  const t0 = Date.now();
  for (const [file, ok] of testFiles) {
    if (existsSync(path.join(supabaseDir, 'tests', file))) await runTestFile(db, `${L}${file} (after 0026)`, file, ok);
  }
  record(`${L}all test files finished in under 10 minutes`, Date.now() - t0 < 600000, `${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const snap = `select md5(${[...FINANCE_TABLES, 'bb_payments'].map((t) =>
    `coalesce((select string_agg(to_jsonb(x)::text, ',' order by x.id) from public.${t} x), '')`).join(' || ')}
    || (select count(*) from public.change_log)::text)`;
  const dataBefore = await one(db, snap);
  await run(db, L + 'apply 0026 a SECOND time (re-run safety)', m26);
  record(`${L}re-run: no row and no fingerprint changed`, dataBefore === (await one(db, snap))
    && same(prints26, await fingerprints(db, '0026_fingerprints.sql')));
  await runTestFile(db, `${L}0026_tests.sql (after the re-run)`, '0026_tests.sql', 'ALL 0026 TESTS PASSED');
  let refused18 = '';
  try {
    await db.exec(MIGRATION_0018());
  } catch (error) {
    refused18 = error.message;
    await db.exec('rollback;').catch(() => {});
  }
  record(`${L}0018 run again after 0026 is refused by its own guard (nothing changes)`,
    refused18.includes('rebuild 0018 first') && same(prints26, await fingerprints(db, '0026_fingerprints.sql')), refused18 || 'it ran');
  await db.close().catch(() => {});

  // d. database 2: old vs new on the big seeds (no Black Belt rows)
  const L2 = '[0026 vs 0025] ';
  const db2 = await buildBase(L2);
  if (!db2) return prints26;
  if (!(await liveOrderTo0025(db2, L2, PERF_SEED() + '\n' + CHAIN_SEED() + '\n' + CAMPS_PERF_SEED() + '\n' + PRIVATE_SEED()))) return prints26;
  await adminSession(db2);
  const ids = (await db2.query(DETAIL_IDS_SQL + `
    union all
    (select 'camp', p.id::text from public.camp_payments p where p.kind = 'payment' order by p.id limit 12)
    union all
    (select 'color_belt', p.id::text from public.testing_private_payments p where p.kind = 'payment' order by p.id limit 12)`)).rows;
  const today2 = await one(db2, 'select public.testing_today()::text');
  const days2 = (await db2.query(`select (date '${today2}' - 61 * k)::text as d from generate_series(0, 29) as k`)).rows.map((x) => x.d);
  const answers = async () => {
    const out = [];
    for (const { src, id } of ids) out.push(await asAdmin(db2, 'select public.finance_payment_detail($1, $2::uuid) as r', [src, id]));
    for (const d of days2) {
      for (const s of ['worcester', 'shrewsbury']) out.push(await asAdmin(db2, `select public.finance_day('${s}', '${d}') as r`));
      out.push(await asAdmin(db2, `select public.finance_day_both('${d}') as r`));
    }
    for (let k = 0; k < 6; k++) out.push(await asAdmin(db2, `select public.finance_history(null, date '${today2}' - ${31 * k}) as r`));
    for (const s of ['worcester', 'shrewsbury']) {
      out.push((await asAdmin(db2, `select public.finance_export('${s}', date '${today2}' - 365, '${today2}') as r`))?.rows);
    }
    out.push(await asAdmin(db2, 'select public.finance_home() as r'));
    return out.map((x) => JSON.stringify(strip0026(x)));
  };
  const sigBefore = (await db2.query(DAY_SIGNATURE_SQL)).rows;
  const ansBefore = await answers();
  if (!(await run(db2, L2 + 'apply 0026 over it', m26))) return prints26;
  const sigAfter = (await db2.query(DAY_SIGNATURE_SQL)).rows;
  const ansAfter = await answers();
  const differ = sigBefore.filter((r, i) => JSON.stringify(r) !== JSON.stringify(sigAfter[i])).map((r) => r.day);
  const items = sigBefore.reduce((n, r) => n + r.n, 0);
  record(`${L2}the same items and figures (fingerprint included) on 5 years of days - Color Belt, Star, camps, private testing`,
    sigBefore.length > 300 && items > 1200 && differ.length === 0,
    `${sigBefore.length} days, ${items} items` + (differ.length ? `; DIFFER on ${differ.slice(0, 5).join(', ')}` : ''));
  const ansDiffer = ansBefore.map((a, i) => (a === ansAfter[i] ? null : i)).filter((i) => i !== null);
  record(`${L2}the same app answers (0026's new keys taken out): details, days, Both, History, exports, Home`,
    ansBefore.length > 150 && ansDiffer.length === 0 && ansBefore.every((a) => a !== 'null' && a !== undefined),
    `${ansBefore.length} answers` + (ansDiffer.length ? `; DIFFER at ${ansDiffer.slice(0, 5).join(', ')}: ${ansAfter[ansDiffer[0]].slice(0, 300)}` : ''));
  const newKeys = await asAdmin(db2, `select public.finance_day('worcester', '${today2}') as r`);
  record(`${L2}the new keys: refunds.card_cents 0 and returned {0, 0} without Black Belt`,
    newKeys?.refunds?.card_cents === 0 && newKeys?.returned?.count === 0 && newKeys?.returned?.cents === 0, JSON.stringify(newKeys?.returned));

  // e. the Black Belt seed on database 2
  const L3 = '[0026 speed] ';
  if (await bbSeedCycles(db2, L3)) {
    const nonBb = DAY_SIGNATURE_SQL.replaceAll('from public.finance_money_rows(null, x.day, x.day) m)',
      "from public.finance_money_rows(null, x.day, x.day) m where m.source <> 'black_belt')");
    const sigBb = (await db2.query(nonBb)).rows;
    const differBb = sigBefore.filter((r, i) => r.items !== sigBb[i]?.items || r.n !== sigBb[i]?.n).map((r) => r.day);
    record(`${L3}with thousands of Black Belt rows, no other source's item moves`, differBb.length === 0,
      differBb.length ? `DIFFER on ${differBb.slice(0, 5).join(', ')}` : `${sigBb.length} days`);
    await db2.query(`select set_config('request.jwt.claims', '', false)`);
    await runTestFile(db2, `${L3}0026_tests.sql (with the big seeds and Black Belt rows)`, '0026_tests.sql', 'ALL 0026 TESTS PASSED');
    await runTestFile(db2, `${L3}0018_tests.sql (with Black Belt rows)`, '0018_tests.sql', 'ALL 0018 TESTS PASSED');
    await financeSpeedCheck(db2, L3.trim(), false);
    await bbFinanceSpeed(db2, L3.trim());
  }
  await db2.close().catch(() => {});

  // f. the ICU database
  const { mkdtempSync, rmSync } = await import('node:fs');
  const os = await import('node:os');
  const dir = mkdtempSync(path.join(os.tmpdir(), 'tkd-pglite-icu-0026-'));
  const LI = '[0026 icu] ';
  let idb = null;
  try {
    const maker = new PGlite({ dataDir: dir, extensions: { pgcrypto } });
    await maker.exec(`create database tkd_icu template template0 encoding 'UTF8' locale_provider icu icu_locale 'en-US' locale 'C'`);
    await maker.close();
    idb = new PGlite({ dataDir: dir, database: 'tkd_icu', extensions: { pgcrypto } });
    const order = await idb.query(`select string_agg(x, ' ' order by x) as o from (values ('color_belt'), ('black_belt'), ('~end')) as v(x)`);
    record(`${LI}the database sorts text like production (~end first)`, order.rows[0].o === '~end black_belt color_belt', order.rows[0].o);
    if ((await buildBase(LI, idb)) && (await liveOrderTo0025(idb, LI)) && (await run(idb, LI + 'apply 0026', m26))) {
      for (const [file, ok] of [['0026_tests.sql', 'ALL 0026 TESTS PASSED'], ['0018_tests.sql', 'ALL 0018 TESTS PASSED'],
        ['0011_tests.sql', 'ALL 0011 TESTS PASSED'], [CAMPS_TESTS, 'ALL 0017 TESTS PASSED']]) {
        await runTestFile(idb, `${LI}${file}`, file, ok);
      }
      if (await run(idb, LI + 'big seed (finance_perf_seed.sql)', PERF_SEED())) {
        await adminSession(idb);
        if (await bbSeedCycles(idb, LI)) {
          await idb.query(`select set_config('request.jwt.claims', '', false)`);
          await runTestFile(idb, `${LI}0026_tests.sql (with the seeds)`, '0026_tests.sql', 'ALL 0026 TESTS PASSED');
          await financeSpeedCheck(idb, LI.trim(), false);
          await bbFinanceSpeed(idb, LI.trim());
        }
      }
    }
  } catch (error) {
    record(`${LI}the ICU-collation database`, false, error.message);
  } finally {
    if (idb) await idb.close().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  }
  return prints26;
}

// =====================================================================
// step0027: Edit camp refuses changes that break campers' extras (0027,
// rulebook v0.720)
// ---------------------------------------------------------------------
// On its OWN fresh database built in the production order with every
// live migration (step0025_production_order's order, then 0025):
//   a. 0027_fingerprints.sql is connector-safe (no "delete" / "drop")
//   a2. 0027_preapply_check.sql (SETUP 0027a) is connector-safe, answers
//      0 on the clean database and 1 camper / 1 camp / 1 row with a broken
//      row planted through 0022's Edit camp (rolled back afterwards)
//   b. apply 0027: every other fingerprint file is byte-identical, except
//      0013's and 0022's, where ONLY the camp_update_camp line differs
//      (its rights, owner, definer and settings stay); 0027's own row
//      keeps everything but the body md5
//   c. 0027_tests.sql, then 0013's, 0017's and 0022's tests again
//   d. 0027 applied a SECOND time: no fingerprint changes
//   e. the Undo of SETUP.md 0027e (the file it names,
//      supabase/manual/0027u_undo_camp_update_camp.sql): every fingerprint
//      file equals the one before 0027; 0013 / 0017 / 0022 tests pass;
//      then 0027 again -> the tested fingerprints, 0027_tests.sql passes
// Run only this step with   node run.mjs --only-step0027
// =====================================================================
async function step0027() {
  const L = '[0027] ';
  record(`${L}0027_fingerprints.sql contains neither "delete" nor "drop" (connector-safe)`,
    !/delete|drop/i.test(read('tests', '0027_fingerprints.sql')));
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
    ['0015', '0015_family_history.sql']]) {
    if (!(await run(db, `${L}apply ${label}`, read('migrations', file)))) return null;
  }
  if (!(await run(db, L + 'apply 0011 as pasted on production 2026-10-19 (fixture)',
    readFileSync(path.join(here, 'fixtures', '0011_as_applied_2026-10-19.sql'), 'utf8')))) return null;
  for (const [label, file] of [['today\'s 0011 over it', '0011_finance.sql'], ['0019', '0019_school_phone.sql'],
    ['0014 (private testing)', '0014_testing_private.sql'], ['0020 (current_session_id fix)', '0020_session_id_claims.sql'],
    ['0013 (camps)', '0013_camps.sql'], ['0017 (camps in Finance)', '0017_finance_camps.sql'],
    ['0018 (private testing money in Finance)', '0018_finance_private.sql'], ['0016 (Black Belt testing)', '0016_black_belt.sql'],
    ['0021', '0021_prospects_not_interested_sooner.sql'], ['0022 (camps weekly pricing)', '0022_camps_weekly_pricing.sql'],
    ['0024 (Black Belt rubric editor)', '0024_black_belt_rubric.sql'], ['0023 (Star result texts)', '0023_star_result_texts.sql'],
    ['0025 (Black Belt grading and results)', '0025_black_belt_grading.sql']]) {
    if (!(await run(db, `${L}apply ${label}`, read('migrations', file)))) return null;
  }

  // b. apply 0027: only camp_update_camp may move
  const numbers = ['0003', '0004', '0005', '0006', '0010', '0007', '0008', '0009', '0012', '0015', '0011', '0019', '0014', '0020',
    '0013', '0017', '0018', '0016', '0021', '0022', '0024', '0023', '0025', '0027']
    .filter((n) => existsSync(path.join(supabaseDir, 'tests', `${n}_fingerprints.sql`)));
  const before = await printsOf(db, numbers);

  // a2. the pre-apply check (SETUP 0027a): connector-safe; 0 on this clean
  // database; above 0 with a broken row planted the way the bug made them
  // (0022's Edit camp switches "not for all-days campers" on for an extra
  // an every-day camper has), inside a transaction that is rolled back
  const preSql = read('tests', '0027_preapply_check.sql');
  record(`${L}0027_preapply_check.sql contains neither "delete" nor "drop" (connector-safe)`, !/delete|drop/i.test(preSql));
  const pre = async () => (await db.query(preSql)).rows[0];
  const clean = await pre();
  record(`${L}[pre-apply check] 0 on a clean database`,
    clean.active_campers === 0 && clean.camps === 0 && clean.extra_rows === 0, JSON.stringify(clean));
  const grid = JSON.stringify([1, 2, 3].map((k) => ({ day_count: k, member_early_cents: 7500 * k, member_regular_cents: 8000 * k,
    nonmember_early_cents: 8500 * k, nonmember_regular_cents: 9000 * k })));
  let planted = null;
  try {
    await db.exec('begin;');
    await db.exec(`
      do $$
      declare
        v_s     uuid := gen_random_uuid();
        v_mon   date := date_trunc('week', (public.testing_today() + 14)::timestamp)::date + 7;
        v_days  date[];
        v_claim text;
        v_r     jsonb;
        v_camp  uuid;
        v_total integer := 0;
        v_try   integer;
        v_child jsonb;
      begin
        insert into auth.sessions (id, user_id) values (v_s, '${ADMIN_UID}');
        insert into public.session_unlock (session_id, staff_id, unlocked_until) values (v_s, '${ADMIN_UID}', now() + interval '30 minutes');
        v_claim := jsonb_build_object('sub', '${ADMIN_UID}', 'role', 'authenticated', 'session_id', v_s,
                     'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint - 60)))::text;
        v_days := array[v_mon, v_mon + 1, v_mon + 2];
        perform set_config('request.jwt.claims', v_claim, true);
        v_r := public.camp_add_camp('worcester', false, 'PGlite 0027 broken row', v_days, '09:00', '15:00', public.testing_today() - 3,
                 public.testing_today() + 5, public.testing_today() + 5, 5, 12, '${grid}'::jsonb,
                 '[{"name": "Lunch", "price_cents": 700, "per": "day", "not_for_all_days": false}]'::jsonb, null, 'I agree.');
        if v_r ->> 'status' is distinct from 'ok' then raise exception 'plant: camp_add_camp %', v_r; end if;
        v_camp := (v_r ->> 'id')::uuid;
        -- a child on all 3 days with lunch on day 1 (the family form, as its owner)
        perform set_config('request.jwt.claims', '', true);
        v_child := jsonb_build_array(jsonb_build_object('first_name', 'Broken', 'last_name', 'Row', 'age', 8, 'member', true,
                     'day_ids', (select jsonb_agg(d.id order by d.day) from public.camp_days d where d.camp_id = v_camp),
                     'extras', jsonb_build_array(jsonb_build_object('extra_id', (select e.id from public.camp_extras e where e.camp_id = v_camp),
                       'day_ids', (select jsonb_agg(d.id) from public.camp_days d where d.camp_id = v_camp and d.day = v_mon)))));
        for v_try in 1 .. 2 loop
          select public.camp_public_signup(c.public_code, 'pglite-0027-plant', gen_random_uuid(), v_child, 'Test Parent', '5085550100',
                   'Parent', 'Test Contact', '5085550101', 'Friend', 'cash', true, '${TEST_SIGNATURE}', 'camp-2026-10-18',
                   md5(c.waiver_text), v_total) into v_r
            from public.camps c where c.id = v_camp;
          exit when v_r ->> 'status' = 'ok';
          v_total := (v_r ->> 'new_total_cents')::integer;
        end loop;
        if v_r ->> 'status' is distinct from 'ok' then raise exception 'plant: sign-up %', v_r; end if;
        -- 0022's Edit camp: lunch becomes "not for all-days campers" (the bug: allowed)
        perform set_config('request.jwt.claims', v_claim, true);
        select public.camp_update_camp(c.id, c.version, c.location_code, c.both_schools, c.name, v_days, c.start_time, c.end_time,
                 c.signup_opens_on, c.signup_closes_on, c.early_until, c.min_age, c.max_age, '${grid}'::jsonb,
                 (select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'price_cents', e.price_cents, 'per', e.per,
                                                      'not_for_all_days', true))
                    from public.camp_extras e where e.camp_id = v_camp),
                 c.description, c.waiver_text) into v_r
          from public.camps c where c.id = v_camp;
        if v_r ->> 'status' is distinct from 'ok' then raise exception 'plant: 0022 Edit camp %', v_r; end if;
        perform set_config('request.jwt.claims', '', true);
      end
      $$;`);
    planted = await pre();
  } catch (error) {
    planted = { error: error.message };
  } finally {
    await db.exec('rollback;').catch(() => {});
  }
  record(`${L}[pre-apply check] above 0 with a planted broken row (1 camper, 1 camp, 1 row)`,
    planted?.active_campers === 1 && planted?.camps === 1 && planted?.extra_rows === 1, JSON.stringify(planted));
  const cleanAgain = await pre();
  record(`${L}[pre-apply check] the planted row was rolled back (0 again)`, cleanAgain.active_campers === 0, JSON.stringify(cleanAgain));

  const migration = read('migrations', '0027_camps_edit_guard.sql');
  if (!(await run(db, `${L}apply 0027_camps_edit_guard.sql`, migration))) return null;
  const after = await printsOf(db, numbers);
  const isUpdateCamp = (line) => /^function {2}camp_update_camp\(/.test(line);
  const wrong = [];
  for (const n of numbers) {
    const f = `${n}_fingerprints.sql`;
    const gone = before[f].filter((line) => !after[f].includes(line));
    const added = after[f].filter((line) => !before[f].includes(line));
    if (['0013', '0022', '0027'].includes(n)) {
      if (gone.length !== 1 || added.length !== 1 || !isUpdateCamp(gone[0]) || !isUpdateCamp(added[0])) {
        wrong.push(`${n}: ${JSON.stringify({ gone, added })}`);
      } else {
        // same item, same definer / settings / owner / rights - only the body md5 (first 32 characters) differs
        const [g, a] = [gone[0].split('  '), added[0].split('  ')];
        if (g[1] !== a[1] || g[2].slice(32) !== a[2].slice(32)) wrong.push(`${n}: more than the body changed`);
      }
    } else if (gone.length || added.length) {
      wrong.push(`${n} moved`);
    }
  }
  record(`${L}fingerprints: only camp_update_camp's body moved (0013 / 0022 / 0027 files), every other file byte-identical`,
    wrong.length === 0, wrong.join('; ') || `${numbers.length} files`);
  const prints27 = after['0027_fingerprints.sql'];
  record(`${L}0027 fingerprints: one function, security definer, search_path="", only postgres and authenticated may run it`,
    prints27.length === 1 && prints27[0].includes('definer=true') && prints27[0].includes('settings=search_path=""')
      && prints27[0].endsWith('rights=authenticated:EXECUTE,postgres:EXECUTE'), prints27.join(' | '));

  // c. the tests
  const tests = async (label, files) => {
    for (const [file, ok] of files) await runTestFile(db, `${L}${file} (${label})`, file, ok);
  };
  const campTests = [['0013_tests.sql', 'ALL 0013 TESTS PASSED'], [CAMPS_TESTS, 'ALL 0017 TESTS PASSED'],
    ['0022_tests.sql', 'ALL 0022 TESTS PASSED']];
  await tests('after 0027', [['0027_tests.sql', 'ALL 0027 TESTS PASSED'], ...campTests]);

  // d. re-run safety
  await run(db, `${L}apply 0027 a SECOND time (re-run safety)`, migration);
  const again = await printsOf(db, numbers);
  const movedAgain = numbers.filter((n) => JSON.stringify(after[`${n}_fingerprints.sql`]) !== JSON.stringify(again[`${n}_fingerprints.sql`]));
  record(`${L}0027 re-run: no fingerprint change`, movedAgain.length === 0, movedAgain.join(', '));

  // e. Undo 0027, as SETUP.md 0027e has it: paste the undo file it names
  const setup = read('SETUP.md').replace(/\r\n/g, '\n');
  const at = setup.search(/^### 0027e\. Undo 0027/m);
  const undoFile = 'manual/0027u_undo_camp_update_camp.sql';
  if (at < 0 || !setup.slice(at, at + 2000).includes(`supabase/${undoFile}`)) {
    record(`${L}[undo 0027] SETUP.md has "### 0027e. Undo 0027" naming supabase/${undoFile}`, false, 'heading or file name missing');
  } else if (await run(db, `${L}[undo 0027] paste ${undoFile}`, read('manual', '0027u_undo_camp_update_camp.sql'))) {
    const undone = await printsOf(db, numbers);
    const back = numbers.filter((n) => JSON.stringify(before[`${n}_fingerprints.sql`]) !== JSON.stringify(undone[`${n}_fingerprints.sql`]));
    record(`${L}[undo 0027] every fingerprint file equals the one before 0027 (0022's camp_update_camp is back)`,
      back.length === 0, back.length ? `differ: ${back.join(', ')}` : `${numbers.length} files`);
    await tests('after the undo', campTests);
    if (await run(db, `${L}[undo 0027] apply 0027 again (redo)`, migration)) {
      const redo = await fingerprints(db, '0027_fingerprints.sql');
      record(`${L}[undo 0027] after the redo the 0027 fingerprints equal the tested ones`, JSON.stringify(redo) === JSON.stringify(prints27));
      await tests('after the redo', [['0027_tests.sql', 'ALL 0027 TESTS PASSED']]);
    }
  }
  await db.close().catch(() => {});
  return prints27;
}

// =====================================================================
// step0029: Finance - close-the-day reminder in 5-minute steps (0029,
// design-review F2 / M8)
// ---------------------------------------------------------------------
// On its OWN fresh database built in the production order with every
// live migration (liveOrderTo0025, then 0027, then 0026 - the order they
// were pasted):
//   a. 0029_fingerprints.sql is connector-safe (no "delete" / "drop")
//   b. the guard: 0029 stops - and changes nothing - when the live
//      function is not 0011's (a changed copy is planted, rolled back)
//   c. a 15-minute time (Worcester Wednesday 19:45) is stored before 0029
//   d. apply 0029: in every fingerprints file only the
//      finance_reminder_time_is_valid(...) line moves, and only its body
//      md5 (definer, settings, owner, rights stay); the md5 goes from
//      0011's to 0029's (the two the guard names); the stored 19:45 and
//      every other stored time still pass the new rule
//   e. 0029_tests.sql, then 0011's, camps' 0017's, 0018's and 0026's
//      tests again
//   f. 0029 applied a SECOND time: no fingerprint and no row changes
// Run only this step with   node run.mjs --only-step0029
// =====================================================================
const MD5_0011_REMINDER = '893a4a82cd923c9e81c0a35f48de403f';
const MD5_0029_REMINDER = '956cf7ae3a12ff432ead67bafd2631c0';

async function step0029() {
  const L = '[0029] ';
  record(`${L}0029_fingerprints.sql contains neither "delete" nor "drop" (connector-safe)`,
    !/delete|drop/i.test(read('tests', '0029_fingerprints.sql')));
  const db = await buildBase(L);
  if (!db) return null;
  if (!(await liveOrderTo0025(db, L))) return null;
  for (const [label, file] of [['0027 (Edit camp guard)', '0027_camps_edit_guard.sql'],
    ['0026 (Black Belt in Finance)', '0026_finance_black_belt.sql']]) {
    if (!(await run(db, `${L}apply ${label}`, read('migrations', file)))) return null;
  }
  const migration = read('migrations', '0029_finance_reminder_5min.sql');
  const fnMd5 = `select md5(regexp_replace(regexp_replace(p.prosrc, '--[^\\n]*', '', 'g'), '\\s+', '', 'g'))
                   from pg_proc p where p.oid = to_regprocedure('public.finance_reminder_time_is_valid(time)')`;
  record(`${L}before 0029 the function is 0011's (md5 ${MD5_0011_REMINDER})`, (await one(db, fnMd5)) === MD5_0011_REMINDER);

  // b. the guard refuses a function that isn't 0011's (planted in a transaction, rolled back)
  {
    let message = '';
    try {
      await db.exec(`begin;
        create or replace function public.finance_reminder_time_is_valid(p_time time)
        returns boolean language sql immutable set search_path = '' as $$ select p_time is not null; $$;
        ${migration}`);
    } catch (error) {
      message = error.message;
    }
    await db.exec('rollback;').catch(() => {});
    record(`${L}the guard refuses 0029 over a changed function (it stops, nothing changes)`,
      message.includes('rebuild 0029 first') && (await one(db, fnMd5)) === MD5_0011_REMINDER, message || 'it ran');
  }

  // c. a 15-minute time stored before 0029 (as an admin would have saved it)
  await run(db, `${L}store a 15-minute time before 0029 (Worcester Wednesday 19:45)`,
    `update public.finance_reminder_times set remind_at = time '19:45' where location_code = 'worcester' and weekday = 3;`);

  // d. apply: only finance_reminder_time_is_valid's body moves
  const numbers = [...NUMBERS_0025, '0027', '0026', '0029']
    .filter((n) => existsSync(path.join(supabaseDir, 'tests', `${n}_fingerprints.sql`)));
  const before = await printsOf(db, numbers);
  const rowsSql = `select coalesce(string_agg(location_code || ':' || weekday || ':' || coalesce(remind_at::text, 'off'), ','
                     order by location_code, weekday), '') from public.finance_reminder_times`;
  const rowsBefore = await one(db, rowsSql);
  if (!(await run(db, `${L}apply 0029_finance_reminder_5min.sql`, migration))) return null;
  const after = await printsOf(db, numbers);
  const isFn = (line) => /^function {2}finance_reminder_time_is_valid\(/.test(line);
  const wrong = [];
  const movedIn = [];
  for (const n of numbers) {
    const f = `${n}_fingerprints.sql`;
    const gone = before[f].filter((line) => !after[f].includes(line));
    const added = after[f].filter((line) => !before[f].includes(line));
    if (!gone.length && !added.length) continue;
    if (gone.length !== 1 || added.length !== 1 || !isFn(gone[0]) || !isFn(added[0])) {
      wrong.push(`${n}: ${JSON.stringify({ gone, added })}`);
      continue;
    }
    movedIn.push(n);
    // only the 32-character body md5 may differ; it must go from 0011's to 0029's
    const g = gone[0].replace(MD5_0011_REMINDER, '<md5>');
    const a = added[0].replace(MD5_0029_REMINDER, '<md5>');
    if (g === gone[0] || a === added[0] || g !== a) {
      wrong.push(`${n}: more than the body md5 changed, or not 0011's -> 0029's: ${gone[0]} => ${added[0]}`);
    }
  }
  record(`${L}fingerprints: only finance_reminder_time_is_valid's body md5 moved (0011's -> 0029's), every other line of every file byte-identical`,
    wrong.length === 0 && movedIn.includes('0029') && movedIn.includes('0011'),
    wrong.join('; ') || `moved in ${movedIn.join(', ')}; ${numbers.length} files checked`);
  const prints29 = after['0029_fingerprints.sql'];
  record(`${L}0029 fingerprints: the function (not definer, search_path="", only postgres may run it, immutable sql boolean) + the unchanged table rule`,
    prints29.length === 3
      && prints29.some((l) => isFn(l) && l.includes('definer=false') && l.includes('settings=search_path=""') && l.endsWith('rights=postgres:EXECUTE'))
      && prints29.some((l) => l.startsWith('function-kind') && l.endsWith('volatility=i language=sql returns=boolean'))
      && prints29.some((l) => l.startsWith('rule') && l.includes('finance_reminder_time_is_valid(remind_at)')),
    prints29.join(' | '));
  record(`${L}the stored times are unchanged and all still pass the new rule (19:45 kept)`,
    (await one(db, rowsSql)) === rowsBefore && rowsBefore.includes('worcester:3:19:45:00')
      && (await one(db, `select count(*)::integer from public.finance_reminder_times
                          where remind_at is not null and not public.finance_reminder_time_is_valid(remind_at)`)) === 0,
    rowsBefore);

  // e. the tests
  const testFiles = [['0029_tests.sql', 'ALL 0029 TESTS PASSED'], ['0011_tests.sql', 'ALL 0011 TESTS PASSED'],
    [CAMPS_TESTS, 'ALL 0017 TESTS PASSED'], ['0018_tests.sql', 'ALL 0018 TESTS PASSED'], ['0026_tests.sql', 'ALL 0026 TESTS PASSED']];
  for (const [file, ok] of testFiles) {
    if (existsSync(path.join(supabaseDir, 'tests', file))) await runTestFile(db, `${L}${file} (after 0029)`, file, ok);
  }

  // f. re-run safety
  await run(db, `${L}apply 0029 a SECOND time (re-run safety)`, migration);
  const again = await printsOf(db, numbers);
  const movedAgain = numbers.filter((n) => JSON.stringify(after[`${n}_fingerprints.sql`]) !== JSON.stringify(again[`${n}_fingerprints.sql`]));
  record(`${L}0029 re-run: no fingerprint and no stored time changed`,
    movedAgain.length === 0 && (await one(db, rowsSql)) === rowsBefore, movedAgain.join(', '));
  await runTestFile(db, `${L}0029_tests.sql (after the re-run)`, '0029_tests.sql', 'ALL 0029 TESTS PASSED');
  await db.close().catch(() => {});
  return prints29;
}

// =====================================================================
// step0028: Star start times 6:00 AM - 10:00 PM every 5 minutes (0028,
// rulebook v1.019, design-review S12)
// ---------------------------------------------------------------------
// On its OWN fresh database built in the production order with every
// live migration (liveOrderTo0025, then 0027 and 0026 as applied):
//   a. 0028_fingerprints.sql and 0028_preapply_check.sql are
//      connector-safe (no "delete" / "drop")
//   a2. the pre-apply check (SETUP 0028a) on the clean database:
//      body_is_0006 true, body_is_0028 false, every count 0
//   b. apply 0028: every other fingerprint file is byte-identical, except
//      0006's, where ONLY the star_start_time_is_valid line differs (and
//      only in its body md5); 0028's own row: sql, immutable, boolean,
//      not definer, search_path="", only postgres may run it
//   c. 0028_tests.sql, then 0006_tests.sql and 0023_tests.sql again; the
//      pre-apply check now says body_is_0028 true, counts still 0
//   d. 0028 applied a SECOND time: no fingerprint changes
//   e. the Undo of SETUP.md 0028e (the file it names,
//      supabase/manual/0028u_undo_star_start_time.sql):
//        - with a 6:05 AM event planted (in a transaction rolled back
//          afterwards) the pre-apply check counts it and the undo
//          refuses with its message, changing nothing
//        - on the clean database: every fingerprint file equals the one
//          before 0028; 0006 / 0023 tests pass; then 0028 again -> the
//          tested fingerprints, 0028_tests.sql passes
// Run only this step with   node run.mjs --only-step0028
// =====================================================================
async function step0028() {
  const L = '[0028] ';
  const preSql = read('tests', '0028_preapply_check.sql');
  record(`${L}0028_fingerprints.sql and 0028_preapply_check.sql contain neither "delete" nor "drop" (connector-safe)`,
    !/delete|drop/i.test(read('tests', '0028_fingerprints.sql')) && !/delete|drop/i.test(preSql));
  const db = await buildBase(L);
  if (!db) return null;
  if (!(await liveOrderTo0025(db, L))) return null;
  for (const [label, file] of [['0027 (camps edit guard)', '0027_camps_edit_guard.sql'],
    ['0026 (Finance: Black Belt payments)', '0026_finance_black_belt.sql']]) {
    if (!(await run(db, `${L}apply ${label}`, read('migrations', file)))) return null;
  }

  // a2. the pre-apply check on the clean database
  const pre = async () => (await db.query(preSql)).rows[0];
  const zero = (r) => r && r.events_bad_new === 0 && r.privates_bad_new === 0 && r.events_bad_old === 0 && r.privates_bad_old === 0;
  const clean = await pre();
  record(`${L}[pre-apply check] before 0028: body_is_0006, every count 0`,
    clean.body_is_0006 === true && clean.body_is_0028 === false && zero(clean), JSON.stringify(clean));

  // b. apply 0028: only star_start_time_is_valid's body may move
  const numbers = ['0003', '0004', '0005', '0006', '0010', '0007', '0008', '0009', '0012', '0015', '0011', '0019', '0014', '0020',
    '0013', '0017', '0018', '0016', '0021', '0022', '0024', '0023', '0025', '0027', '0026', '0028']
    .filter((n) => existsSync(path.join(supabaseDir, 'tests', `${n}_fingerprints.sql`)));
  const before = await printsOf(db, numbers);
  const migration = read('migrations', '0028_star_start_times.sql');
  if (!(await run(db, `${L}apply 0028_star_start_times.sql`, migration))) return null;
  const after = await printsOf(db, numbers);
  const isRule = (line) => /star_start_time_is_valid\(/.test(line);
  const wrong = [];
  for (const n of numbers) {
    const f = `${n}_fingerprints.sql`;
    const gone = before[f].filter((line) => !after[f].includes(line));
    const added = after[f].filter((line) => !before[f].includes(line));
    if (['0006', '0028'].includes(n)) {
      if (gone.length !== 1 || added.length !== 1 || !isRule(gone[0]) || !isRule(added[0])) {
        wrong.push(`${n}: ${JSON.stringify({ gone, added })}`);
      } else {
        // same line apart from the 32-character body md5 (whatever the file's layout)
        const strip = (line) => line.replace(/[0-9a-f]{32}/, '<md5>');
        if (strip(gone[0]) !== strip(added[0])) wrong.push(`${n}: more than the body changed`);
      }
    } else if (gone.length || added.length) {
      wrong.push(`${n} moved`);
    }
  }
  record(`${L}fingerprints: only star_start_time_is_valid's body moved (0006 / 0028 files), every other file byte-identical`,
    wrong.length === 0, wrong.join('; ') || `${numbers.length} files`);
  const prints28 = after['0028_fingerprints.sql'];
  record(`${L}0028 fingerprints: one function, sql, immutable, boolean, not definer, search_path="", only postgres may run it`,
    prints28.length === 1 && prints28[0].includes(' lang=sql volatility=i returns=boolean definer=false settings=search_path="" owner=postgres')
      && prints28[0].endsWith('rights=postgres:EXECUTE'), prints28.join(' | '));

  // c. the tests
  const tests = async (label, files) => {
    for (const [file, ok] of files) await runTestFile(db, `${L}${file} (${label})`, file, ok);
  };
  const starTests = [['0006_tests.sql', 'ALL 0006 TESTS PASSED'], ['0023_tests.sql', 'ALL 0023 TESTS PASSED']];
  await tests('after 0028', [['0028_tests.sql', 'ALL 0028 TESTS PASSED'], ...starTests]);
  const applied = await pre();
  record(`${L}[pre-apply check] after 0028: body_is_0028, every count still 0`,
    applied.body_is_0006 === false && applied.body_is_0028 === true && zero(applied), JSON.stringify(applied));

  // d. re-run safety
  await run(db, `${L}apply 0028 a SECOND time (re-run safety)`, migration);
  const again = await printsOf(db, numbers);
  const movedAgain = numbers.filter((n) => JSON.stringify(after[`${n}_fingerprints.sql`]) !== JSON.stringify(again[`${n}_fingerprints.sql`]));
  record(`${L}0028 re-run: no fingerprint change`, movedAgain.length === 0, movedAgain.join(', '));

  // e. Undo 0028, as SETUP.md 0028e has it: paste the undo file it names
  const setup = read('SETUP.md').replace(/\r\n/g, '\n');
  const at = setup.search(/^### 0028e\. Undo 0028/m);
  const undoFile = 'manual/0028u_undo_star_start_time.sql';
  const undoSql = read('manual', '0028u_undo_star_start_time.sql');
  if (at < 0 || !setup.slice(at, at + 2000).includes(`supabase/${undoFile}`)) {
    record(`${L}[undo 0028] SETUP.md has "### 0028e. Undo 0028" naming supabase/${undoFile}`, false, 'heading or file name missing');
  } else {
    // e1. a 6:05 AM event (made through star_add_event as the admin) blocks the undo;
    // the undo file runs without its own begin / commit inside a transaction that is rolled back
    const inner = undoSql.replace(/\r\n/g, '\n').replace(/^begin;$/m, '').replace(/^commit;$/m, '');
    let planted = null;
    let refusal = '';
    try {
      await db.exec('begin;');
      await db.exec(`
        do $$
        declare
          v_s uuid := gen_random_uuid();
          v_r jsonb;
        begin
          insert into auth.sessions (id, user_id) values (v_s, '${ADMIN_UID}');
          insert into public.session_unlock (session_id, staff_id, unlocked_until) values (v_s, '${ADMIN_UID}', now() + interval '30 minutes');
          perform set_config('request.jwt.claims', jsonb_build_object('sub', '${ADMIN_UID}', 'role', 'authenticated', 'session_id', v_s,
            'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint - 60)))::text, true);
          v_r := public.star_add_event('PGlite 0028 early event', public.testing_today() + 9, '06:05', 'worcester', false, null, null);
          if v_r ->> 'status' is distinct from 'ok' then raise exception 'plant: star_add_event %', v_r; end if;
          perform set_config('request.jwt.claims', '', true);
        end
        $$;`);
      planted = await pre();
      try {
        await db.exec(inner);
      } catch (error) {
        refusal = error.message;
      }
    } catch (error) {
      planted = { error: error.message };
    } finally {
      await db.exec('rollback;').catch(() => {});
    }
    record(`${L}[undo 0028] a planted 6:05 AM event: the pre-apply check counts it (events_bad_old = 1, events_bad_new = 0)`,
      planted?.events_bad_old === 1 && planted?.events_bad_new === 0 && planted?.privates_bad_old === 0, JSON.stringify(planted));
    record(`${L}[undo 0028] ... and the undo file refuses ("0028 undo refused")`, refusal.includes('0028 undo refused'), refusal || 'no error');
    const rolledBack = await pre();
    record(`${L}[undo 0028] the planted event was rolled back, the rule is still 0028's`,
      rolledBack.body_is_0028 === true && zero(rolledBack), JSON.stringify(rolledBack));

    // e2. the undo on the clean database
    if (await run(db, `${L}[undo 0028] paste ${undoFile}`, undoSql)) {
      const undone = await printsOf(db, numbers);
      const back = numbers.filter((n) => JSON.stringify(before[`${n}_fingerprints.sql`]) !== JSON.stringify(undone[`${n}_fingerprints.sql`]));
      record(`${L}[undo 0028] every fingerprint file equals the one before 0028 (0006's star_start_time_is_valid is back)`,
        back.length === 0, back.length ? `differ: ${back.join(', ')}` : `${numbers.length} files`);
      const undonePre = await pre();
      record(`${L}[undo 0028] the pre-apply check says body_is_0006 again`, undonePre.body_is_0006 === true && zero(undonePre), JSON.stringify(undonePre));
      await tests('after the undo', starTests);
      if (await run(db, `${L}[undo 0028] apply 0028 again (redo)`, migration)) {
        const redo = await fingerprints(db, '0028_fingerprints.sql');
        record(`${L}[undo 0028] after the redo the 0028 fingerprints equal the tested ones`, JSON.stringify(redo) === JSON.stringify(prints28));
        await tests('after the redo', [['0028_tests.sql', 'ALL 0028 TESTS PASSED']]);
      }
    }
  }
  await db.close().catch(() => {});
  return prints28;
}

// =====================================================================
// step0031: class ages on the booking forms (0031, rulebook v0.619) and
// classes taught together as one time (v0.620)
// ---------------------------------------------------------------------
// On its OWN fresh database built in the production order with every
// live migration (step0027's order, then 0027):
//   a. 0031_fingerprints.sql and 0031_preapply_check.sql are
//      connector-safe (no "delete" / "drop"); the pre-apply check (SETUP
//      0031a) answers "not applied, the ten functions as tested" before
//      0031 and "applied" after it
//   b. the Schedule / Forms / Prospects tests (0007, 0009, 0012, 0015,
//      0019) pass BEFORE 0031 (the baseline)
//   c. apply 0031: in every other fingerprint file ONLY these lines move:
//      the "function" lines of the nine functions replaced in place (body
//      md5 only - rights, owner, definer and settings stay); forms_times'
//      "function-kind" line (its three new columns); forms_set_booking's
//      4-argument lines become 5-argument ones with the same rights and
//      kind; and only schedule_set_class_ages, forms_booking_lock_class
//      and forms_group_class_ids_ok are added
//   d. 0031_tests.sql, then the baseline tests again
//   e. 0031 applied a SECOND time: no fingerprint changes
//   f. the Undo of SETUP.md 0031e (the file it names,
//      supabase/manual/0031u_undo_class_ages.sql): every fingerprint file
//      equals the one before 0031; the baseline tests pass; then 0031
//      again -> the tested fingerprints, 0031_tests.sql passes
// Run only this step with   node run.mjs --only-step0031
// =====================================================================
async function step0031() {
  const L = '[0031] ';
  record(`${L}0031_fingerprints.sql contains neither "delete" nor "drop" (connector-safe)`,
    !/delete|drop/i.test(read('tests', '0031_fingerprints.sql')));
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
    ['0015', '0015_family_history.sql']]) {
    if (!(await run(db, `${L}apply ${label}`, read('migrations', file)))) return null;
  }
  if (!(await run(db, L + 'apply 0011 as pasted on production 2026-10-19 (fixture)',
    readFileSync(path.join(here, 'fixtures', '0011_as_applied_2026-10-19.sql'), 'utf8')))) return null;
  for (const [label, file] of [['today\'s 0011 over it', '0011_finance.sql'], ['0019', '0019_school_phone.sql'],
    ['0014 (private testing)', '0014_testing_private.sql'], ['0020 (current_session_id fix)', '0020_session_id_claims.sql'],
    ['0013 (camps)', '0013_camps.sql'], ['0017 (camps in Finance)', '0017_finance_camps.sql'],
    ['0018 (private testing money in Finance)', '0018_finance_private.sql'], ['0016 (Black Belt testing)', '0016_black_belt.sql'],
    ['0021', '0021_prospects_not_interested_sooner.sql'], ['0022 (camps weekly pricing)', '0022_camps_weekly_pricing.sql'],
    ['0024 (Black Belt rubric editor)', '0024_black_belt_rubric.sql'], ['0023 (Star result texts)', '0023_star_result_texts.sql'],
    ['0025 (Black Belt grading and results)', '0025_black_belt_grading.sql'], ['0027 (Edit camp guard)', '0027_camps_edit_guard.sql']]) {
    if (!(await run(db, `${L}apply ${label}`, read('migrations', file)))) return null;
  }

  // a. the pre-apply check (SETUP 0031a)
  const preSql = read('tests', '0031_preapply_check.sql');
  record(`${L}0031_preapply_check.sql contains neither "delete" nor "drop" (connector-safe)`, !/delete|drop/i.test(preSql));
  const pre = async () => (await db.query(preSql)).rows[0];
  const ready = await pre();
  record(`${L}[pre-apply check] before 0031: no tables, no function, the 10 functions found and as tested`,
    ready.ages_table === false && ready.set_function === false && ready.groups_table === false
      && ready.replaced_found === 10 && ready.replaced_as_tested === 10,
    JSON.stringify(ready));

  // b. the baseline tests
  const baseline = [['0007_tests.sql', 'ALL 0007 TESTS PASSED'], ['0009_tests.sql', 'ALL 0009 TESTS PASSED'],
    ['0012_tests.sql', 'ALL 0012 TESTS PASSED'], ['0015_tests.sql', 'ALL 0015 TESTS PASSED'], ['0019_tests.sql', 'ALL 0019 TESTS PASSED']];
  const tests = async (label, files) => {
    for (const [file, ok] of files) await runTestFile(db, `${L}${file} (${label})`, file, ok);
  };
  await tests('before 0031', baseline);

  // c. apply 0031
  const numbers = ['0003', '0004', '0005', '0006', '0010', '0007', '0008', '0009', '0012', '0015', '0011', '0019', '0014', '0020',
    '0013', '0017', '0018', '0016', '0021', '0022', '0024', '0023', '0025', '0027', '0031']
    .filter((n) => existsSync(path.join(supabaseDir, 'tests', `${n}_fingerprints.sql`)));
  const before = await printsOf(db, numbers);
  const migration = read('migrations', '0031_class_ages.sql');
  if (!(await run(db, `${L}apply 0031_class_ages.sql`, migration))) return null;
  const after = await printsOf(db, numbers);
  // replaced in place (same arguments): only the body md5 may move
  const replaced = ['schedule_before_write(', 'forms_open_times(', 'forms_public_get(', 'forms_public_submit(', 'prospects_open_times(',
    'forms_times(', 'forms_submit_core(', 'forms_duplicate(', 'prospects_book_time('];
  const newFns = ['schedule_set_class_ages(', 'forms_booking_lock_class(', 'forms_group_class_ids_ok('];
  const isSetBooking5 = (item) => item.startsWith('forms_set_booking(') && item.includes('p_groups jsonb');
  const parts = (line) => line.split('  ');
  const wrong = [];
  for (const n of numbers.filter((x) => x !== '0031')) {
    const f = `${n}_fingerprints.sql`;
    const gone = before[f].filter((line) => !after[f].includes(line));
    const added = after[f].filter((line) => !before[f].includes(line));
    for (const g of gone) {
      const [kind, item, detail] = parts(g);
      const twin = added.find((a) => parts(a)[0] === kind && parts(a)[1] === item);
      if (item.startsWith('forms_set_booking(') && !isSetBooking5(item)) {
        // 0009's 4-argument version -> 0031's 5-argument one: same rights, owner, definer, settings and kind
        const five = added.find((a) => parts(a)[0] === kind && isSetBooking5(parts(a)[1]));
        if (!five) wrong.push(`${n}: ${g} (no 5-argument forms_set_booking)`);
        else if (kind === 'function' && parts(five)[2].slice(32) !== detail.slice(32)) wrong.push(`${n}: forms_set_booking rights or settings changed`);
        else if (kind === 'function-kind' && parts(five)[2] !== detail) wrong.push(`${n}: forms_set_booking kind changed`);
        else if (kind !== 'function' && kind !== 'function-kind') wrong.push(`${n}: ${g}`);
        continue;
      }
      if (kind === 'function-kind' && item.startsWith('forms_times(') && twin) {
        // forms_times: same volatility, three more columns
        if (!parts(twin)[2].startsWith(detail.slice(0, detail.length - 1))
            || !parts(twin)[2].endsWith(', class_ids uuid[], age_from integer, age_to integer)')) wrong.push(`${n}: forms_times kind: ${parts(twin)[2]}`);
        continue;
      }
      if (kind !== 'function' || !replaced.some((r) => item.startsWith(r)) || !twin) wrong.push(`${n}: ${g}`);
      else if (parts(twin)[2].slice(32) !== detail.slice(32)) wrong.push(`${n}: more than the body changed: ${item}`);
    }
    for (const a of added) {
      const [kind, item] = parts(a);
      const isTwin = gone.some((g) => parts(g)[0] === kind && parts(g)[1] === item);
      if (!isTwin && !newFns.some((x) => item.startsWith(x)) && !isSetBooking5(item)) wrong.push(`${n}: added ${a}`);
    }
  }
  record(`${L}fingerprints: only the 10 replaced functions moved as planned and only 0031's 3 new functions were added; everything else byte-identical`,
    wrong.length === 0, wrong.join('; ') || `${numbers.length} files`);
  const prints31 = after['0031_fingerprints.sql'];
  const fn = (name) => prints31.find((l) => l.startsWith(`function  ${name}(`)) || '';
  record(`${L}0031 fingerprints: schedule_set_class_ages is security definer, search_path="", only postgres and authenticated may run it`,
    fn('schedule_set_class_ages').includes('definer=true') && fn('schedule_set_class_ages').includes('settings=search_path=""')
      && fn('schedule_set_class_ages').endsWith('rights=authenticated:EXECUTE,postgres:EXECUTE'), fn('schedule_set_class_ages'));
  record(`${L}0031 fingerprints: the public form functions stay forms_registrar-only, the staff ones authenticated-only`,
    fn('forms_public_get').endsWith('rights=forms_registrar:EXECUTE,postgres:EXECUTE')
      && fn('forms_public_submit').endsWith('rights=forms_registrar:EXECUTE,postgres:EXECUTE')
      && fn('forms_open_times').endsWith('rights=authenticated:EXECUTE,postgres:EXECUTE')
      && fn('prospects_open_times').endsWith('rights=authenticated:EXECUTE,postgres:EXECUTE'),
    ['forms_public_get', 'forms_public_submit', 'forms_open_times', 'prospects_open_times'].map(fn).join(' | '));
  record(`${L}0031 fingerprints: forms_set_booking (5 arguments), forms_duplicate, prospects_book_time are security definer, authenticated-only; forms_times, forms_submit_core and the 2 helpers are for nobody`,
    fn('forms_set_booking').includes('p_groups jsonb') && fn('forms_set_booking').includes('definer=true')
      && fn('forms_set_booking').endsWith('rights=authenticated:EXECUTE,postgres:EXECUTE')
      && fn('forms_duplicate').includes('definer=true') && fn('forms_duplicate').endsWith('rights=authenticated:EXECUTE,postgres:EXECUTE')
      && fn('prospects_book_time').includes('definer=true') && fn('prospects_book_time').endsWith('rights=authenticated:EXECUTE,postgres:EXECUTE')
      && ['forms_times', 'forms_submit_core', 'forms_booking_lock_class', 'forms_group_class_ids_ok']
        .every((x) => fn(x).includes('definer=false') && fn(x).includes('settings=search_path=""') && fn(x).endsWith('rights=postgres:EXECUTE')),
    ['forms_set_booking', 'forms_duplicate', 'prospects_book_time', 'forms_times', 'forms_submit_core', 'forms_booking_lock_class',
      'forms_group_class_ids_ok'].map(fn).join(' | '));
  const applied = await pre();
  record(`${L}[pre-apply check] after 0031: tables and function there, the 10 functions found, none as before`,
    applied.ages_table === true && applied.set_function === true && applied.groups_table === true
      && applied.replaced_found === 10 && applied.replaced_as_tested === 0,
    JSON.stringify(applied));

  // d. the tests
  await tests('after 0031', [['0031_tests.sql', 'ALL 0031 TESTS PASSED'], ...baseline]);

  // e. re-run safety
  await run(db, `${L}apply 0031 a SECOND time (re-run safety)`, migration);
  const again = await printsOf(db, numbers);
  const movedAgain = numbers.filter((n) => JSON.stringify(after[`${n}_fingerprints.sql`]) !== JSON.stringify(again[`${n}_fingerprints.sql`]));
  record(`${L}0031 re-run: no fingerprint change`, movedAgain.length === 0, movedAgain.join(', '));

  // f. Undo 0031, as SETUP.md 0031e has it: paste the undo file it names
  const setup = read('SETUP.md').replace(/\r\n/g, '\n');
  const at = setup.search(/^### 0031e\. Undo 0031/m);
  const undoFile = 'manual/0031u_undo_class_ages.sql';
  if (at < 0 || !setup.slice(at, at + 2000).includes(`supabase/${undoFile}`)) {
    record(`${L}[undo 0031] SETUP.md has "### 0031e. Undo 0031" naming supabase/${undoFile}`, false, 'heading or file name missing');
  } else if (await run(db, `${L}[undo 0031] paste ${undoFile}`, read('manual', '0031u_undo_class_ages.sql'))) {
    const undone = await printsOf(db, numbers);
    const back = numbers.filter((n) => JSON.stringify(before[`${n}_fingerprints.sql`]) !== JSON.stringify(undone[`${n}_fingerprints.sql`]));
    record(`${L}[undo 0031] every fingerprint file equals the one before 0031`,
      back.length === 0, back.length ? `differ: ${back.join(', ')}` : `${numbers.length} files`);
    const undonePre = await pre();
    record(`${L}[undo 0031] the pre-apply check answers as before 0031`, JSON.stringify(undonePre) === JSON.stringify(ready),
      JSON.stringify(undonePre));
    await tests('after the undo', baseline);
    if (await run(db, `${L}[undo 0031] apply 0031 again (redo)`, migration)) {
      const redo = await fingerprints(db, '0031_fingerprints.sql');
      record(`${L}[undo 0031] after the redo the 0031 fingerprints equal the tested ones`, JSON.stringify(redo) === JSON.stringify(prints31));
      await tests('after the redo', [['0031_tests.sql', 'ALL 0031 TESTS PASSED']]);
    }
  }
  await db.close().catch(() => {});
  return prints31;
}

// =====================================================================
// step0030: Color Belt design review, database half (0030, rulebook
// v0.418) - Mark paid with a way to pay, History, results CSV
// ---------------------------------------------------------------------
// On its OWN fresh database built in the production order with every
// live migration (step0031's order, then 0031):
//   a. 0030_fingerprints.sql is connector-safe (no "delete" / "drop")
//   b. the Color Belt and Finance tests pass BEFORE 0030 (the baseline:
//      0005, 0010, 0014, 0018, 0026)
//   c. apply 0030: in every other fingerprint file ONLY these lines move:
//      testing_undo_payment, testing_private_undo_payment,
//      testing_edit_payment, testing_private_edit_payment,
//      testing_move_to_private and testing_private_undo_move (body md5
//      only - rights, owner, definer and settings stay) in 0003's and
//      0005's / 0014's files; 0003's list gains exactly the 7 new
//      testing_* functions; 0014's file gains exactly the new
//      testing_private_payments_paying_by_before_check rule line
//   d. 0030_tests.sql, then the baseline tests again
//   e. 0030 applied a SECOND time: no fingerprint changes
//   f. the Undo of SETUP.md 0030e (the file it names,
//      supabase/manual/0030u_undo_color_belt_review.sql): every
//      fingerprint file equals the one before 0030; the baseline tests
//      pass; then 0030 again -> the tested fingerprints, 0030_tests.sql
//      passes
// Run only this step with   node run.mjs --only-step0030
// =====================================================================
async function step0030() {
  const L = '[0030] ';
  record(`${L}0030_fingerprints.sql contains neither "delete" nor "drop" (connector-safe)`,
    !/delete|drop/i.test(read('tests', '0030_fingerprints.sql')));
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
    ['0015', '0015_family_history.sql']]) {
    if (!(await run(db, `${L}apply ${label}`, read('migrations', file)))) return null;
  }
  if (!(await run(db, L + 'apply 0011 as pasted on production 2026-10-19 (fixture)',
    readFileSync(path.join(here, 'fixtures', '0011_as_applied_2026-10-19.sql'), 'utf8')))) return null;
  for (const [label, file] of [['today\'s 0011 over it', '0011_finance.sql'], ['0019', '0019_school_phone.sql'],
    ['0014 (private testing)', '0014_testing_private.sql'], ['0020 (current_session_id fix)', '0020_session_id_claims.sql'],
    ['0013 (camps)', '0013_camps.sql'], ['0017 (camps in Finance)', '0017_finance_camps.sql'],
    ['0018 (private testing money in Finance)', '0018_finance_private.sql'], ['0016 (Black Belt testing)', '0016_black_belt.sql'],
    ['0021', '0021_prospects_not_interested_sooner.sql'], ['0022 (camps weekly pricing)', '0022_camps_weekly_pricing.sql'],
    ['0024 (Black Belt rubric editor)', '0024_black_belt_rubric.sql'], ['0023 (Star result texts)', '0023_star_result_texts.sql'],
    ['0025 (Black Belt grading and results)', '0025_black_belt_grading.sql'], ['0026 (Black Belt in Finance)', '0026_finance_black_belt.sql'],
    ['0027 (Edit camp guard)', '0027_camps_edit_guard.sql'], ['0031 (class ages)', '0031_class_ages.sql']]) {
    if (!(await run(db, `${L}apply ${label}`, read('migrations', file)))) return null;
  }

  // b. the baseline tests
  const baseline = [['0005_tests.sql', 'ALL 0005 TESTS PASSED'], ['0010_tests.sql', 'ALL 0010 TESTS PASSED'],
    ['0014_tests.sql', 'ALL 0014 TESTS PASSED'], ['0018_tests.sql', 'ALL 0018 TESTS PASSED'],
    ['0026_tests.sql', 'ALL 0026 TESTS PASSED']];
  const tests = async (label, files) => {
    for (const [file, ok] of files) await runTestFile(db, `${L}${file} (${label})`, file, ok);
  };
  await tests('before 0030', baseline);

  // c. apply 0030
  const numbers = ['0003', '0004', '0005', '0006', '0010', '0007', '0008', '0009', '0012', '0015', '0011', '0019', '0014', '0020',
    '0013', '0017', '0018', '0016', '0021', '0022', '0024', '0023', '0025', '0026', '0027', '0031', '0030']
    .filter((n) => existsSync(path.join(supabaseDir, 'tests', `${n}_fingerprints.sql`)));
  const before = await printsOf(db, numbers);
  const migration = read('migrations', '0030_color_belt_review.sql');
  if (!(await run(db, `${L}apply 0030_color_belt_review.sql`, migration))) return null;
  const after = await printsOf(db, numbers);
  // the six live functions 0030 replaces in place (v0.418: Undo payment; v0.419: Edit payment, Move, Undo move)
  const undoFns = ['testing_undo_payment', 'testing_private_undo_payment', 'testing_edit_payment', 'testing_private_edit_payment',
    'testing_move_to_private', 'testing_private_undo_move'];
  const replacedIn = { '0005': ['testing_undo_payment', 'testing_edit_payment'],
    '0014': ['testing_private_undo_payment', 'testing_private_edit_payment', 'testing_move_to_private', 'testing_private_undo_move'] };
  const newFns = ['testing_mark_paid_by', 'testing_private_mark_paid_by', 'testing_history_strip', 'testing_registration_history',
    'testing_private_history', 'testing_downloads_guard', 'testing_results_csv'];
  const parts = (line) => line.split('  ');
  const wrong = [];
  for (const n of numbers.filter((x) => x !== '0030')) {
    const f = `${n}_fingerprints.sql`;
    const gone = before[f].filter((line) => !after[f].includes(line));
    const added = after[f].filter((line) => !before[f].includes(line));
    if (n === '0003') {
      // 0003's list: proname  arguments  body_md5  definer  settings  owner  rights
      for (const g of gone) {
        const twin = added.find((a) => parts(a)[0] === parts(g)[0] && parts(a)[1] === parts(g)[1]);
        if (!undoFns.includes(parts(g)[0]) || !twin || parts(twin).slice(3).join('|') !== parts(g).slice(3).join('|')) wrong.push(`0003: ${g}`);
      }
      for (const a of added) {
        const isTwin = gone.some((g) => parts(g)[0] === parts(a)[0] && parts(g)[1] === parts(a)[1]);
        if (!isTwin && !newFns.includes(parts(a)[0])) wrong.push(`0003: added ${a}`);
      }
      const addedNew = added.filter((a) => newFns.includes(parts(a)[0])).length;
      if (addedNew !== newFns.length) wrong.push(`0003: ${addedNew} new functions instead of ${newFns.length}`);
      continue;
    }
    // the other files: kind  item  detail
    for (const g of gone) {
      const [kind, item, detail] = parts(g);
      const twin = added.find((a) => parts(a)[0] === kind && parts(a)[1] === item);
      const replacedHere = (replacedIn[n] || []).includes(item.split('(')[0]);
      // 0014's table line for testing_private_payments: only the one new column right
      // (0014's rule: every column but the login ids is readable by authenticated)
      const privateTable = n === '0014' && kind === 'table' && item === 'testing_private_payments';
      if (privateTable && twin) {
        const want = detail.replace('paid_on>authenticated:SELECT,', 'paid_on>authenticated:SELECT,paying_by_before>authenticated:SELECT,');
        if (want === detail || parts(twin)[2] !== want) wrong.push(`${n}: testing_private_payments table line: ${parts(twin)[2]}`);
        continue;
      }
      if (kind !== 'function' || !replacedHere || !twin) wrong.push(`${n}: ${g}`);
      else if (parts(twin)[2].slice(32) !== detail.slice(32)) wrong.push(`${n}: more than the body changed: ${item}`);
    }
    for (const a of added) {
      const [kind, item] = parts(a);
      const isTwin = gone.some((g) => parts(g)[0] === kind && parts(g)[1] === item);
      const newRule = n === '0014' && kind === 'constraint'
        && item === 'testing_private_payments.testing_private_payments_paying_by_before_check';
      if (!isTwin && !newRule) wrong.push(`${n}: added ${a}`);
    }
  }
  record(`${L}fingerprints: only the 6 replaced bodies (Undo payment, Edit payment, Move, Undo move) and the private payments' column rights (+ paying_by_before) moved, only 0030's 7 functions (0003's list) and 1 private payment rule (0014's file) were added; everything else byte-identical`,
    wrong.length === 0, wrong.join('; ') || `${numbers.length - 1} files`);
  const prints30 = after['0030_fingerprints.sql'];
  const fn = (name) => prints30.find((l) => l.startsWith(`function  ${name}(`)) || '';
  const appFns = ['testing_mark_paid_by', 'testing_private_mark_paid_by', 'testing_undo_payment', 'testing_private_undo_payment',
    'testing_edit_payment', 'testing_private_edit_payment', 'testing_move_to_private', 'testing_private_undo_move',
    'testing_registration_history', 'testing_private_history', 'testing_results_csv'];
  record(`${L}0030 fingerprints: the 11 app functions are security definer, search_path="", only postgres and authenticated may run them`,
    appFns.every((x) => fn(x).includes('definer=true') && fn(x).includes('settings=search_path=""')
      && fn(x).endsWith('rights=authenticated:EXECUTE,postgres:EXECUTE')), appFns.map(fn).join(' | '));
  record(`${L}0030 fingerprints: testing_history_strip and testing_downloads_guard are for nobody`,
    ['testing_history_strip', 'testing_downloads_guard'].every((x) => fn(x).includes('definer=false')
      && fn(x).includes('settings=search_path=""') && fn(x).endsWith('rights=postgres:EXECUTE')),
    ['testing_history_strip', 'testing_downloads_guard'].map(fn).join(' | '));
  const tbl = prints30.find((l) => l.startsWith('table  testing_downloads  ')) || '';
  record(`${L}0030 fingerprints: testing_downloads has RLS on, no rights, no column rights, no read rules`,
    tbl.endsWith('rls=true owner=postgres rights= columns= policies='), tbl);
  const cols = prints30.filter((l) => l.startsWith('column  '));
  record(`${L}0030 fingerprints: the two paying_by_before columns are text, nullable; readable by nobody on testing_payments, by authenticated on testing_private_payments`,
    cols.length === 2 && cols.some((l) => l === 'column  testing_payments.paying_by_before  text notnull=false rights=')
      && cols.some((l) => l === 'column  testing_private_payments.paying_by_before  text notnull=false rights=authenticated:SELECT'),
    cols.join(' | '));
  record(`${L}0030 fingerprints: ${prints30.length} lines (13 functions, 1 table, 2 columns, 2 triggers, 4 rules)`,
    prints30.length === 22, String(prints30.length));

  // d. the tests
  await tests('after 0030', [['0030_tests.sql', 'ALL 0030 TESTS PASSED'], ...baseline]);

  // e. re-run safety
  await run(db, `${L}apply 0030 a SECOND time (re-run safety)`, migration);
  const again = await printsOf(db, numbers);
  const movedAgain = numbers.filter((n) => JSON.stringify(after[`${n}_fingerprints.sql`]) !== JSON.stringify(again[`${n}_fingerprints.sql`]));
  record(`${L}0030 re-run: no fingerprint change`, movedAgain.length === 0, movedAgain.join(', '));

  // f. Undo 0030, as SETUP.md 0030e has it: paste the undo file it names
  const setup = read('SETUP.md').replace(/\r\n/g, '\n');
  const at = setup.search(/^### 0030e\. Undo 0030/m);
  const undoFile = 'manual/0030u_undo_color_belt_review.sql';
  if (at < 0 || !setup.slice(at, at + 2500).includes(`supabase/${undoFile}`)) {
    record(`${L}[undo 0030] SETUP.md has "### 0030e. Undo 0030" naming supabase/${undoFile}`, false, 'heading or file name missing');
  } else if (await run(db, `${L}[undo 0030] paste ${undoFile}`, read('manual', '0030u_undo_color_belt_review.sql'))) {
    const undone = await printsOf(db, numbers);
    const back = numbers.filter((n) => n !== '0030'
      && JSON.stringify(before[`${n}_fingerprints.sql`]) !== JSON.stringify(undone[`${n}_fingerprints.sql`]));
    record(`${L}[undo 0030] every fingerprint file equals the one before 0030`,
      back.length === 0, back.length ? `differ: ${back.join(', ')}` : `${numbers.length - 1} files`);
    record(`${L}[undo 0030] 0030's own fingerprints are back to "before" (only the 6 old replaced functions)`,
      JSON.stringify(undone['0030_fingerprints.sql']) === JSON.stringify(before['0030_fingerprints.sql']),
      undone['0030_fingerprints.sql'].join(' | '));
    await tests('after the undo', baseline);
    if (await run(db, `${L}[undo 0030] apply 0030 again (redo)`, migration)) {
      const redo = await fingerprints(db, '0030_fingerprints.sql');
      record(`${L}[undo 0030] after the redo the 0030 fingerprints equal the tested ones`, JSON.stringify(redo) === JSON.stringify(prints30));
      await tests('after the redo', [['0030_tests.sql', 'ALL 0030 TESTS PASSED']]);
    }
  }
  // the undo keeps a log that has rows (a record of who downloaded) - checked on a copy of the state, rolled back
  try {
    await db.exec('begin;');
    await db.exec(`select set_config('tkd.action', 'testing_results_csv', true);
      insert into public.testing_downloads (event_id, event_name, row_count, downloaded_by_name) values (gen_random_uuid(), 'kept', 0, '');
      select set_config('tkd.action', '', true);`);
    const undo = read('manual', '0030u_undo_color_belt_review.sql').replace(/^begin;\s*$/m, '').replace(/^commit;\s*$/m, '');
    await db.exec(undo);
    const kept = await one(db, `select count(*)::integer from public.testing_downloads`);
    const guard = await one(db, `select count(*)::integer from pg_proc where proname = 'testing_downloads_guard'`);
    const gone = await one(db, `select count(*)::integer from pg_proc where proname = 'testing_mark_paid_by'`);
    record(`${L}[undo 0030] a download log with rows is KEPT (with its guard); the rest is undone`,
      kept === 1 && guard === 1 && gone === 0, JSON.stringify({ kept, guard, gone }));
  } catch (error) {
    record(`${L}[undo 0030] a download log with rows is KEPT`, false, error.message);
  } finally {
    await db.exec('rollback;').catch(() => {});
  }
  await db.close().catch(() => {});
  return prints30;
}

// step0032's speed check (security review should-fix): the History line on a big shared
// change_log. Inside one transaction that is rolled back afterwards: a test cycle and candidate
// ("Speedy") made through the functions, then rows written straight into change_log —
//   20 000 rows of other sections (some with a "candidate_id" of their own),
//   27 000 rows of 300 other Black Belt candidates (30 grades each: an insert and two changes),
//   Speedy's own: 30 grades x 20 rows (an insert and 19 changes) and 5 payments,
// then ANALYZE. Checks: the reader's answer is exactly the first draft's query (newest first, at
// most 500, stripped) — so the rewrite changed nothing but the speed; it answers in <= 300 ms
// (median of 3; WARN above, FAIL above 3 s, as the bb_makeup_list check); and the plan of the
// same query uses change_log_table_record_idx and change_log_bb_candidate_child_idx. The first
// draft's "own rows OR in a list" query is timed too, for the comparison.
const HISTORY_CHILDREN_0032 = `('bb_payments', 'bb_candidate_waivers', 'bb_grades', 'bb_extra_counts', 'bb_makeup_subjects', 'bb_result_sends')`;
const HISTORY_ROW_0032 = `jsonb_build_object('occurred_at', h.occurred_at, 'actor_name', h.actor_name, 'action', h.action,
    'table_name', h.table_name, 'op', h.op, 'before', public.bb_history_strip(h.before), 'after', public.bb_history_strip(h.after))`;
// the reader's query, word for word as 0032's bb_candidate_history runs it ($1 = the candidate)
const HISTORY_NEW_0032 = `select coalesce(jsonb_agg(${HISTORY_ROW_0032} order by h.occurred_at desc, h.id desc), '[]'::jsonb) as r
  from (select x.id, x.occurred_at, x.actor_name, x.action, x.table_name, x.op, x.before, x.after
          from (select l.id, l.occurred_at, l.actor_name, l.action, l.table_name, l.op, l.before, l.after
                  from public.change_log l
                 where l.table_name = 'bb_candidates' and l.record_id = $1::uuid
                union all
                select l.id, l.occurred_at, l.actor_name, l.action, l.table_name, l.op, l.before, l.after
                  from (select distinct i.table_name, i.record_id from public.change_log i
                         where (i.after ->> 'candidate_id') = $1::uuid::text
                           and i.table_name in ${HISTORY_CHILDREN_0032} and i.op = 'insert') as k
                  join public.change_log l on l.table_name = k.table_name and l.record_id = k.record_id) as x
         order by x.occurred_at desc, x.id desc limit 500) as h`;
// the first draft's query (one "own rows OR in a list" filter), for the comparison
const HISTORY_OLD_0032 = `select coalesce(jsonb_agg(${HISTORY_ROW_0032} order by h.occurred_at desc, h.id desc), '[]'::jsonb) as r
  from (select l.id, l.occurred_at, l.actor_name, l.action, l.table_name, l.op, l.before, l.after
          from public.change_log l
         where (l.table_name = 'bb_candidates' and l.record_id = $1::uuid)
            or (l.table_name, l.record_id) in
               (select i.table_name, i.record_id from public.change_log i
                 where i.table_name in ${HISTORY_CHILDREN_0032} and i.op = 'insert' and i.after ->> 'candidate_id' = $1::uuid::text)
         order by l.occurred_at desc, l.id desc limit 500) as h`;

async function historySpeed0032(db, L) {
  const S = `${L}[speed] `;
  const claims = await bbAdminClaims(db);
  await db.exec('begin;');
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
    const cycle = (await db.query(`select public.bb_add_cycle(${bb24Payload('PGlite 0032 speed', 90)}, null) as r`)).rows[0].r;
    const plan = (await db.query('select id from public.bb_cycle_plans where cycle_id = $1 limit 1', [cycle?.id])).rows[0]?.id;
    const added = (await db.query(`select public.bb_add_candidate($1, 'Speedy', 'Zzhistory', current_date - 9000, 'speedy@example.com',
        'worcester', 1, $2, false, true) as r`, [cycle?.id, plan])).rows[0].r;
    const kim = added?.id;
    if (!kim) throw new Error(`no test candidate: ${JSON.stringify([cycle, added])}`);
    const t0 = performance.now();
    await db.query(`
      insert into public.change_log (actor_name, action, table_name, record_id, op, before, after)
      select 'Seed', 'seed', (array['testing_registrations', 'star_candidates', 'camp_campers', 'prospects', 'star_payments'])[1 + g % 5],
             gen_random_uuid(), case when g % 3 = 0 then 'insert' else 'update' end, null,
             jsonb_build_object('candidate_id', gen_random_uuid(), 'note', 'seed ' || g)
        from generate_series(1, 20000) as g`);
    await db.query(`
      insert into public.change_log (actor_name, action, table_name, record_id, op, before, after)
      select 'Seed', 'bb_set_grade', 'bb_grades', md5('grade ' || c || ' ' || s)::uuid, case when e = 1 then 'insert' else 'update' end,
             case when e = 1 then null else jsonb_build_object('letter', 'B') end,
             case when e = 1 then jsonb_build_object('candidate_id', md5('cand ' || c)::uuid, 'letter', 'A', 'created_by', gen_random_uuid())
                  else jsonb_build_object('letter', 'A') end
        from generate_series(1, 300) as c, generate_series(1, 30) as s, generate_series(1, 3) as e`);
    await db.query(`
      insert into public.change_log (actor_name, action, table_name, record_id, op, before, after)
      select 'Seed', 'bb_set_grade', 'bb_grades', md5('speedy ' || s)::uuid, case when e = 1 then 'insert' else 'update' end,
             case when e = 1 then null else jsonb_build_object('letter', 'B') end,
             case when e = 1 then jsonb_build_object('candidate_id', $1::uuid, 'letter', 'A', 'updated_by', gen_random_uuid())
                  else jsonb_build_object('letter', 'A', 'updated_by', gen_random_uuid()) end
        from generate_series(1, 30) as s, generate_series(1, 20) as e
      union all
      select 'Seed', 'bb_record_payment', 'bb_payments', md5('speedy pay ' || p)::uuid, 'insert', null,
             jsonb_build_object('candidate_id', $1::uuid, 'amount_cents', 1000 * p, 'recorded_by', gen_random_uuid())
        from generate_series(1, 5) as p`, [kim]);
    await db.exec('analyze public.change_log;');
    const total = await one(db, 'select count(*)::int from public.change_log');
    record(`${S}seeded change_log: other sections, 300 other Black Belt candidates, and Speedy (30 grades x 20 rows, 5 payments)`,
      total > 47000, `${total} rows in ${((performance.now() - t0) / 1000).toFixed(1)} s`);

    // the answer: the reader = its query written out = the first draft's query; 500 rows, newest first
    const fn = (await db.query('select public.bb_candidate_history($1) as r', [kim])).rows[0].r;
    const inline = (await db.query(HISTORY_NEW_0032, [kim])).rows[0].r;
    const old = (await db.query(HISTORY_OLD_0032, [kim])).rows[0].r;
    const own = await one(db, `select count(*)::int from public.change_log l
       where (l.table_name = 'bb_candidates' and l.record_id = '${kim}')
          or (l.table_name in ('bb_grades', 'bb_payments', 'bb_candidate_waivers') and l.record_id in
              (select i.record_id from public.change_log i where i.op = 'insert' and i.after ->> 'candidate_id' = '${kim}'))`);
    const text = JSON.stringify(fn);
    record(`${S}the reader's answer equals the first draft's query (500 of Speedy's ${own} rows, newest first, stripped)`,
      fn?.status === 'ok' && JSON.stringify(fn.rows) === JSON.stringify(inline) && JSON.stringify(inline) === JSON.stringify(old)
        && fn.rows.length === 500 && own > 500 && !/"(updated_by|recorded_by|created_by)"/.test(text)
        && fn.rows.every((r, i) => i === 0 || r.occurred_at <= fn.rows[i - 1].occurred_at),
      `${fn?.rows?.length} rows; own ${own}`);

    // the time (median of 3), and the first draft's for the comparison
    const median = async (sql, params) => {
      const t = [];
      for (let i = 0; i < 3; i++) {
        const s0 = performance.now();
        await db.query(sql, params);
        t.push(performance.now() - s0);
      }
      return t.sort((a, b) => a - b)[1];
    };
    const msNew = await median('select public.bb_candidate_history($1) as r', [kim]);
    const msOld = await median(HISTORY_OLD_0032, [kim]);
    // ... and both again without the new index (as the first draft ran: its only index was 0003's)
    await db.exec('savepoint no_index; drop index public.change_log_bb_candidate_child_idx;');
    const msOldBare = await median(HISTORY_OLD_0032, [kim]);
    const msNewBare = await median('select public.bb_candidate_history($1) as r', [kim]);
    await db.exec('rollback to savepoint no_index;');
    const detail = `${msNew.toFixed(1)} ms (median of 3); the first draft's query: ${msOld.toFixed(1)} ms with the new index, `
      + `${msOldBare.toFixed(1)} ms without it (the reader without it: ${msNewBare.toFixed(1)} ms)`;
    if (msNew <= 300) record(`${S}bb_candidate_history on the big change_log <= 300 ms`, true, detail);
    else if (msNew <= 3000) warn(`${S}bb_candidate_history on the big change_log <= 300 ms`, `${detail}; fails above 3000 ms`);
    else record(`${S}bb_candidate_history on the big change_log <= 3000 ms`, false, detail);

    // the plan of the reader's query uses both indexes
    const planText = (await db.query(`explain ${HISTORY_NEW_0032.replaceAll('$1::uuid', `'${kim}'::uuid`)}`)).rows
      .map((r) => Object.values(r)[0]).join('\n');
    record(`${S}the plan uses change_log_table_record_idx and change_log_bb_candidate_child_idx (no full read of change_log)`,
      planText.includes('change_log_table_record_idx') && planText.includes('change_log_bb_candidate_child_idx')
        && !/Seq Scan on change_log/.test(planText), planText.split('\n').filter((l) => /Scan/.test(l)).map((l) => l.trim()).join(' | '));
  } catch (error) {
    record(`${S}the History line speed check`, false, error.message);
  } finally {
    await db.exec('rollback;').catch(() => {});
  }
}

// =====================================================================
// step0032: Black Belt's design-review database half (0032): testing
// times every 5 minutes (BB13, v1.019), the candidate History reader
// (BB8, v1.010) and Edit cycle's Undo in one call (the Undo race)
// ---------------------------------------------------------------------
// On its OWN fresh database built in the production order with every
// live migration (liveOrderTo0025, then 0027, 0026, 0028, 0029 and 0031):
//   a. 0032's migration, tests, fingerprints and pre-apply check are
//      connector-safe (no "delete" / "drop"); the pre-apply check (SETUP
//      0032a) on the clean database: body_is_0016 true, no new function,
//      every count 0
//   b. apply 0032: every other fingerprint file is byte-identical, except
//      0016's (which lists every bb_ function), where ONLY the
//      bb_time_is_valid line differs (and only in its body md5) and
//      exactly the 3 new functions' lines are added (the new index on
//      change_log is in no other file); 0032's own rows:
//      language, volatility, return type, definer, search_path="", owner
//      and rights as designed (the two helpers: nobody; the two staff
//      functions: authenticated only)
//   c. 0032_tests.sql, then 0016's, 0024's, 0025's and 0026's tests; the
//      History line's speed on a big change_log (historySpeed0032 above);
//      the pre-apply check now says body_is_0032, 3 new functions, the
//      index, counts 0
//   d. 0032 applied a SECOND time: no fingerprint changes
//   e. the Undo of SETUP.md 0032e (the file it names,
//      supabase/manual/0032u_undo.sql):
//        - with a 12:05 testing day planted (in a transaction rolled back
//          afterwards) the pre-apply check counts it and the undo refuses
//          with its message, changing nothing
//        - on the clean database: every fingerprint file equals the one
//          before 0032; the pre-apply check answers as before 0032; the
//          Black Belt tests pass; then 0032 again -> the tested
//          fingerprints, 0032_tests.sql passes
// Run only this step with   node run.mjs --only-step0032
// =====================================================================
async function step0032() {
  const L = '[0032] ';
  const preSql = read('tests', '0032_preapply_check.sql');
  const migration = read('migrations', '0032_black_belt_review.sql');
  const unsafe = [['migrations', '0032_black_belt_review.sql'], ['tests', '0032_tests.sql'], ['tests', '0032_fingerprints.sql'],
    ['tests', '0032_preapply_check.sql']].filter(([dir, file]) => /delete|drop/i.test(read(dir, file))).map(([, file]) => file);
  record(`${L}0032's migration, tests, fingerprints and pre-apply check contain neither "delete" nor "drop" (connector-safe)`,
    unsafe.length === 0, unsafe.join(', '));
  const db = await buildBase(L);
  if (!db) return null;
  if (!(await liveOrderTo0025(db, L))) return null;
  for (const [label, file] of [['0027 (camps edit guard)', '0027_camps_edit_guard.sql'],
    ['0026 (Finance: Black Belt payments)', '0026_finance_black_belt.sql'], ['0028 (Star start times)', '0028_star_start_times.sql'],
    ['0029 (Finance reminder every 5 minutes)', '0029_finance_reminder_5min.sql'], ['0031 (class ages)', '0031_class_ages.sql']]) {
    if (!existsSync(path.join(supabaseDir, 'migrations', file))) continue;
    if (!(await run(db, `${L}apply ${label}`, read('migrations', file)))) return null;
  }

  // a. the pre-apply check on the clean database
  const pre = async () => (await db.query(preSql)).rows[0];
  const zero = (r) => r && r.times_bad_new === 0 && r.times_bad_old === 0;
  const clean = await pre();
  record(`${L}[pre-apply check] before 0032: body_is_0016, no new function, no index, every count 0`,
    clean.body_is_0016 === true && clean.body_is_0032 === false && clean.new_functions === 0 && clean.history_index === false && zero(clean),
    JSON.stringify(clean));

  // b. apply 0032: only bb_time_is_valid's body moves; 0016's file gains the 3 new functions
  const numbers = [...NUMBERS_0025, '0027', '0026', '0028', '0029', '0031', '0032']
    .filter((n) => existsSync(path.join(supabaseDir, 'tests', `${n}_fingerprints.sql`)));
  const others = numbers.filter((n) => n !== '0032');
  const before = await printsOf(db, others);
  if (!(await run(db, `${L}apply 0032_black_belt_review.sql`, migration))) return null;
  const after = await printsOf(db, numbers);
  const isRule = (line) => /^function {2}bb_time_is_valid\(/.test(line);
  const NEW = ['bb_history_strip(', 'bb_candidate_history(', 'bb_undo_cycle_edit('];
  const md5Out = (line) => line.replace(/[0-9a-f]{32}/, '<md5>');
  const wrong = [];
  for (const n of others) {
    const f = `${n}_fingerprints.sql`;
    const gone = before[f].filter((line) => !after[f].includes(line));
    const added = after[f].filter((line) => !before[f].includes(line));
    if (n === '0016') {
      const twin = added.filter(isRule);
      const extra = added.filter((line) => !isRule(line));
      if (gone.length !== 1 || !isRule(gone[0]) || twin.length !== 1 || md5Out(gone[0]) !== md5Out(twin[0]) || gone[0] === twin[0]) {
        wrong.push(`0016: bb_time_is_valid ${JSON.stringify({ gone, twin })}`);
      }
      if (extra.length !== 3 || !NEW.every((name) => extra.some((line) => line.startsWith(`function  ${name}`)))) {
        wrong.push(`0016: added ${JSON.stringify(extra)}`);
      }
    } else if (gone.length || added.length) {
      wrong.push(`${n} moved: ${JSON.stringify({ gone, added })}`);
    }
  }
  record(`${L}fingerprints: only bb_time_is_valid's body moved and only the 3 new functions were added (0016's file), every other file byte-identical`,
    wrong.length === 0, wrong.join('; ') || `${others.length} files`);
  const prints32 = after['0032_fingerprints.sql'];
  const fn = (name) => prints32.find((l) => l.startsWith(`function  ${name}(`)) || '';
  const tail = (lang, vol, ret, definer, rights) =>
    ` lang=${lang} volatility=${vol} returns=${ret} definer=${definer} settings=search_path="" owner=postgres rights=${rights}`;
  const indexLine = prints32.find((l) => l.startsWith('index  change_log.change_log_bb_candidate_child_idx')) || '';
  record(`${L}0032 fingerprints: 4 functions; the 2 helpers sql immutable for nobody, the 2 staff functions security definer for authenticated only; the partial index on change_log`,
    prints32.length === 5
      && indexLine.includes("ON public.change_log USING btree (((after ->> 'candidate_id'::text)))")
      && indexLine.includes("WHERE ((table_name = ANY (ARRAY['bb_payments'::text, 'bb_candidate_waivers'::text, 'bb_grades'::text, 'bb_extra_counts'::text, 'bb_makeup_subjects'::text, 'bb_result_sends'::text])) AND (op = 'insert'::text))")
      && fn('bb_time_is_valid').endsWith(tail('sql', 'i', 'boolean', false, 'postgres:EXECUTE'))
      && fn('bb_history_strip').endsWith(tail('sql', 'i', 'jsonb', false, 'postgres:EXECUTE'))
      && fn('bb_candidate_history').endsWith(tail('plpgsql', 's', 'jsonb', true, 'authenticated:EXECUTE,postgres:EXECUTE'))
      && fn('bb_undo_cycle_edit').endsWith(tail('plpgsql', 'v', 'jsonb', true, 'authenticated:EXECUTE,postgres:EXECUTE')),
    prints32.join(' | '));

  // c. the tests
  const tests = async (label, files) => {
    for (const [file, ok] of files) await runTestFile(db, `${L}${file} (${label})`, file, ok);
  };
  const bbTests = [['0016_tests.sql', 'ALL 0016 TESTS PASSED'], ['0024_tests.sql', 'ALL 0024 TESTS PASSED'],
    ['0025_tests.sql', 'ALL 0025 TESTS PASSED'], ['0026_tests.sql', 'ALL 0026 TESTS PASSED']];
  await tests('after 0032', [['0032_tests.sql', 'ALL 0032 TESTS PASSED'], ...bbTests]);
  // c2. the History line on a big change_log (rolled back afterwards)
  await historySpeed0032(db, L);
  const applied = await pre();
  record(`${L}[pre-apply check] after 0032: body_is_0032, the 3 new functions, every count still 0`,
    applied.body_is_0016 === false && applied.body_is_0032 === true && applied.new_functions === 3 && applied.history_index === true && zero(applied),
    JSON.stringify(applied));

  // d. re-run safety
  await run(db, `${L}apply 0032 a SECOND time (re-run safety)`, migration);
  const again = await printsOf(db, numbers);
  const movedAgain = numbers.filter((n) => JSON.stringify(after[`${n}_fingerprints.sql`]) !== JSON.stringify(again[`${n}_fingerprints.sql`]));
  record(`${L}0032 re-run: no fingerprint change`, movedAgain.length === 0, movedAgain.join(', '));

  // e. Undo 0032, as SETUP.md 0032e has it: paste the undo file it names
  const setup = read('SETUP.md').replace(/\r\n/g, '\n');
  const at = setup.search(/^### 0032e\. Undo 0032/m);
  const undoFile = 'manual/0032u_undo.sql';
  const undoSql = read('manual', '0032u_undo.sql');
  if (at < 0 || !setup.slice(at, at + 2000).includes(`supabase/${undoFile}`)) {
    record(`${L}[undo 0032] SETUP.md has "### 0032e. Undo 0032" naming supabase/${undoFile}`, false, 'heading or file name missing');
  } else {
    // e1. a 12:05 testing day (made through bb_add_cycle as the admin) blocks the undo;
    // the undo file runs without its own begin / commit inside a transaction that is rolled back
    const inner = undoSql.replace(/\r\n/g, '\n').replace(/^begin;$/m, '').replace(/^commit;$/m, '');
    const early = bb24Payload('PGlite 0032 early day', 60)
      .replace("'start_time', '12:30', 'end_time', '14:30'", "'start_time', '12:05', 'end_time', '14:30'");
    let planted = null;
    let refusal = '';
    try {
      await db.exec('begin;');
      await db.exec(`
        do $$
        declare
          v_s uuid := gen_random_uuid();
          v_r jsonb;
        begin
          insert into auth.sessions (id, user_id) values (v_s, '${ADMIN_UID}');
          insert into public.session_unlock (session_id, staff_id, unlocked_until) values (v_s, '${ADMIN_UID}', now() + interval '30 minutes');
          perform set_config('request.jwt.claims', jsonb_build_object('sub', '${ADMIN_UID}', 'role', 'authenticated', 'session_id', v_s,
            'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint - 60)))::text, true);
          v_r := public.bb_add_cycle(${early}, null);
          if v_r ->> 'status' is distinct from 'ok' then raise exception 'plant: bb_add_cycle %', v_r; end if;
          perform set_config('request.jwt.claims', '', true);
        end
        $$;`);
      planted = await pre();
      try {
        await db.exec(inner);
      } catch (error) {
        refusal = error.message;
      }
    } catch (error) {
      planted = { error: error.message };
    } finally {
      await db.exec('rollback;').catch(() => {});
    }
    record(`${L}[undo 0032] a planted 12:05 testing day: the pre-apply check counts it (times_bad_old = 1, times_bad_new = 0)`,
      planted?.times_bad_old === 1 && planted?.times_bad_new === 0, JSON.stringify(planted));
    record(`${L}[undo 0032] ... and the undo file refuses ("0032 undo refused")`, refusal.includes('0032 undo refused'), refusal || 'no error');
    const rolledBack = await pre();
    record(`${L}[undo 0032] the planted day was rolled back, the rule is still 0032's`,
      rolledBack.body_is_0032 === true && rolledBack.new_functions === 3 && zero(rolledBack), JSON.stringify(rolledBack));

    // e2. the undo on the clean database
    if (await run(db, `${L}[undo 0032] paste ${undoFile}`, undoSql)) {
      const undone = await printsOf(db, others);
      const back = others.filter((n) => JSON.stringify(before[`${n}_fingerprints.sql`]) !== JSON.stringify(undone[`${n}_fingerprints.sql`]));
      record(`${L}[undo 0032] every fingerprint file equals the one before 0032 (0016's bb_time_is_valid is back, the 3 functions gone)`,
        back.length === 0, back.length ? `differ: ${back.join(', ')}` : `${others.length} files`);
      const undonePre = await pre();
      record(`${L}[undo 0032] the pre-apply check answers as before 0032`, JSON.stringify(undonePre) === JSON.stringify(clean),
        JSON.stringify(undonePre));
      await tests('after the undo', bbTests);
      if (await run(db, `${L}[undo 0032] apply 0032 again (redo)`, migration)) {
        const redo = await fingerprints(db, '0032_fingerprints.sql');
        record(`${L}[undo 0032] after the redo the 0032 fingerprints equal the tested ones`, JSON.stringify(redo) === JSON.stringify(prints32));
        await tests('after the redo', [['0032_tests.sql', 'ALL 0032 TESTS PASSED']]);
      }
    }
  }
  await db.close().catch(() => {});
  return prints32;
}

// =====================================================================
// step0034: Black Belt's History line names the logged row's id
// (0034: bb_candidate_history answers record_id too; rulebook v0.971 /
// v0.972, design-review BB8)
// ---------------------------------------------------------------------
// On its OWN fresh database built in the production order with every
// live migration (liveOrderTo0025, then 0027, 0026, 0028, 0029, 0031,
// 0032 and 0033 - each only if its file is on this branch):
//   a. 0034's migration, tests, fingerprints and pre-apply check are
//      connector-safe (no "delete" / "drop"); the pre-apply check (SETUP
//      0034a) before 0034: body_is_0032 true, one version, the helper there
//   b. apply 0034: in 0016's and 0032's fingerprint files (both list
//      bb_candidate_history) ONLY that line differs, and only in its body
//      md5 (0032's md5 -> 0034's, the two the pre-apply check names);
//      every other fingerprint file is byte-identical; 0034's own row:
//      plpgsql, stable, security definer, search_path="", postgres,
//      authenticated + postgres only
//   c. 0034_tests.sql, then 0032's, 0016's, 0024's, 0025's and 0026's
//      tests; the pre-apply check now says body_is_0034
//   d. 0034 applied a SECOND time: no fingerprint changes
//   e. the Undo of SETUP.md 0034e (the file it names,
//      supabase/manual/0034u_undo.sql): every fingerprint file equals the
//      one before 0034, the pre-apply check answers as before, 0032's
//      tests pass; then 0034 again -> the tested fingerprints,
//      0034_tests.sql passes
// Run only this step with   node run.mjs --only-step0034
// =====================================================================
const MD5_0032_HISTORY = '1cc24c95127dd0151933efade802e46a';
const MD5_0034_HISTORY = '5f41c349f9eae85e8651d9f02d336d70';

async function step0034() {
  const L = '[0034] ';
  const preSql = read('tests', '0034_preapply_check.sql');
  const migration = read('migrations', '0034_black_belt_history_ids.sql');
  const unsafe = [['migrations', '0034_black_belt_history_ids.sql'], ['tests', '0034_tests.sql'], ['tests', '0034_fingerprints.sql'],
    ['tests', '0034_preapply_check.sql']].filter(([dir, file]) => /delete|drop/i.test(read(dir, file))).map(([, file]) => file);
  record(`${L}0034's migration, tests, fingerprints and pre-apply check contain neither "delete" nor "drop" (connector-safe)`,
    unsafe.length === 0, unsafe.join(', '));
  const db = await buildBase(L);
  if (!db) return null;
  if (!(await liveOrderTo0025(db, L))) return null;
  for (const [label, file] of [['0027 (camps edit guard)', '0027_camps_edit_guard.sql'],
    ['0026 (Finance: Black Belt payments)', '0026_finance_black_belt.sql'], ['0028 (Star start times)', '0028_star_start_times.sql'],
    ['0029 (Finance reminder every 5 minutes)', '0029_finance_reminder_5min.sql'], ['0031 (class ages)', '0031_class_ages.sql'],
    ['0032 (Black Belt design review)', '0032_black_belt_review.sql'], ['0033 (Camps design review)', '0033_camps_design_review.sql']]) {
    if (!existsSync(path.join(supabaseDir, 'migrations', file))) continue;
    if (!(await run(db, `${L}apply ${label}`, read('migrations', file)))) return null;
  }

  // a. the pre-apply check before 0034
  const pre = async () => (await db.query(preSql)).rows[0];
  const clean = await pre();
  record(`${L}[pre-apply check] before 0034: body_is_0032, not 0034, one version, bb_history_strip there`,
    clean.body_is_0032 === true && clean.body_is_0034 === false && clean.versions === 1 && clean.strip_helper === true,
    JSON.stringify(clean));

  // b. apply 0034: only bb_candidate_history's body md5 moves (0016's and 0032's files)
  const numbers = [...NUMBERS_0025, '0027', '0026', '0028', '0029', '0031', '0032', '0033', '0034']
    .filter((n) => existsSync(path.join(supabaseDir, 'tests', `${n}_fingerprints.sql`)));
  const others = numbers.filter((n) => n !== '0034');
  const before = await printsOf(db, others);
  if (!(await run(db, `${L}apply 0034_black_belt_history_ids.sql`, migration))) return null;
  const after = await printsOf(db, numbers);
  const isReader = (line) => line.startsWith('function  bb_candidate_history(');
  const md5Out = (line) => line.replace(/[0-9a-f]{32}/, '<md5>');
  const wrong = [];
  for (const n of others) {
    const f = `${n}_fingerprints.sql`;
    const gone = before[f].filter((line) => !after[f].includes(line));
    const added = after[f].filter((line) => !before[f].includes(line));
    if (n === '0016' || n === '0032') {
      if (gone.length !== 1 || added.length !== 1 || !isReader(gone[0]) || !isReader(added[0])
          || md5Out(gone[0]) !== md5Out(added[0]) || !gone[0].includes(MD5_0032_HISTORY) || !added[0].includes(MD5_0034_HISTORY)) {
        wrong.push(`${n}: ${JSON.stringify({ gone, added })}`);
      }
    } else if (gone.length || added.length) {
      wrong.push(`${n} moved: ${JSON.stringify({ gone, added })}`);
    }
  }
  record(`${L}fingerprints: only bb_candidate_history's body md5 moved (0016's and 0032's files, ${MD5_0032_HISTORY.slice(0, 8)} -> ${MD5_0034_HISTORY.slice(0, 8)}), every other file byte-identical`,
    wrong.length === 0, wrong.join('; ') || `${others.length} files`);
  const prints34 = after['0034_fingerprints.sql'];
  record(`${L}0034 fingerprints: bb_candidate_history plpgsql, stable, security definer, search_path="", authenticated + postgres only`,
    prints34.length === 1 && isReader(prints34[0]) && prints34[0].includes(MD5_0034_HISTORY)
      && prints34[0].endsWith(' lang=plpgsql volatility=s returns=jsonb definer=true settings=search_path="" owner=postgres rights=authenticated:EXECUTE,postgres:EXECUTE'),
    prints34.join(' | '));

  // c. the tests
  const tests = async (label, files) => {
    for (const [file, ok] of files) await runTestFile(db, `${L}${file} (${label})`, file, ok);
  };
  const bbTests = [['0032_tests.sql', 'ALL 0032 TESTS PASSED'], ['0016_tests.sql', 'ALL 0016 TESTS PASSED'],
    ['0024_tests.sql', 'ALL 0024 TESTS PASSED'], ['0025_tests.sql', 'ALL 0025 TESTS PASSED'], ['0026_tests.sql', 'ALL 0026 TESTS PASSED']];
  await tests('after 0034', [['0034_tests.sql', 'ALL 0034 TESTS PASSED'], ...bbTests]);
  const applied = await pre();
  record(`${L}[pre-apply check] after 0034: body_is_0034, one version`,
    applied.body_is_0032 === false && applied.body_is_0034 === true && applied.versions === 1 && applied.strip_helper === true,
    JSON.stringify(applied));

  // d. re-run safety
  await run(db, `${L}apply 0034 a SECOND time (re-run safety)`, migration);
  const again = await printsOf(db, numbers);
  const movedAgain = numbers.filter((n) => JSON.stringify(after[`${n}_fingerprints.sql`]) !== JSON.stringify(again[`${n}_fingerprints.sql`]));
  record(`${L}0034 re-run: no fingerprint change`, movedAgain.length === 0, movedAgain.join(', '));

  // e. Undo 0034, as SETUP.md 0034e has it: paste the undo file it names
  const setup = read('SETUP.md').replace(/\r\n/g, '\n');
  const at = setup.search(/^### 0034e\. Undo 0034/m);
  const undoFile = 'manual/0034u_undo.sql';
  if (at < 0 || !setup.slice(at, at + 2000).includes(`supabase/${undoFile}`)) {
    record(`${L}[undo 0034] SETUP.md has "### 0034e. Undo 0034" naming supabase/${undoFile}`, false, 'heading or file name missing');
  } else if (await run(db, `${L}[undo 0034] paste ${undoFile}`, read('manual', '0034u_undo.sql'))) {
    const undone = await printsOf(db, others);
    const back = others.filter((n) => JSON.stringify(before[`${n}_fingerprints.sql`]) !== JSON.stringify(undone[`${n}_fingerprints.sql`]));
    record(`${L}[undo 0034] every fingerprint file equals the one before 0034 (0032's bb_candidate_history is back)`,
      back.length === 0, back.length ? `differ: ${back.join(', ')}` : `${others.length} files`);
    const undonePre = await pre();
    record(`${L}[undo 0034] the pre-apply check answers as before 0034`, JSON.stringify(undonePre) === JSON.stringify(clean),
      JSON.stringify(undonePre));
    await tests('after the undo', [['0032_tests.sql', 'ALL 0032 TESTS PASSED']]);
    if (await run(db, `${L}[undo 0034] apply 0034 again (redo)`, migration)) {
      const redo = await fingerprints(db, '0034_fingerprints.sql');
      record(`${L}[undo 0034] after the redo the 0034 fingerprints equal the tested ones`, JSON.stringify(redo) === JSON.stringify(prints34));
      await tests('after the redo', [['0034_tests.sql', 'ALL 0034 TESTS PASSED']]);
    }
  }
  await db.close().catch(() => {});
  return prints34;
}

// =====================================================================
// step0033: Camps design review - Mark paid with a way to pay, Camper
// history (0033, rulebook v0.735 / v0.736)
// ---------------------------------------------------------------------
// On its OWN fresh database built in the production order with every
// live migration on this branch (liveOrderTo0025, then 0027, 0026, 0028,
// 0029 and 0031; Color Belt's 0030 is live too but not on this branch -
// it touches only Color Belt's testing_* objects):
//   a. 0033_fingerprints.sql and 0033_preapply_check.sql are
//      connector-safe (no "delete" / "drop")
//   b. three campers BEFORE 0033: two signed up through the family form
//      (Bo's Paying by then changed at the desk) and one added with no
//      history insert row: the pre-apply check answers
//      true / false / 3 / 0 / false / 3 / 1 / 1 - the 3 functions are the
//      exact code 0033 was built on (body md5)
//   c. apply 0033: the backfill takes each camper's form choice from its
//      history insert row (Bo: cash), else its Paying by (the third),
//      writes no history row and moves no version; in every other
//      fingerprints file only the planned items move (0013's
//      camp_mark_paid 3 -> 4 inputs, camp_undo_payment, camp_edit_payment,
//      the roster view, camp_campers' column rights, the new trigger;
//      0022's camp_edit_payment and the two new rules) with the same
//      rights, owner, definer and settings; 0033's own lines as planned;
//      the pre-apply check answers "already applied"
//   d. AS THE APP: SET ROLE authenticated with an unlocked admin's token,
//      camp_mark_paid called with 3 NAMED inputs (as supabase-js sends
//      it) and with 3 positional inputs: both reach the one 4-input
//      function and pay by Paying by; only one camp_mark_paid exists; anon
//      and camps_registrar can't run the new reader (rolled back)
//   e. 0033_tests.sql, then 0013's, 0017's, 0018's, 0022's, 0026's and
//      0027's tests
//   f. SPEED: 30,000 more history rows (other campers' days with their
//      check-ins, other campers' updates, this camper's rows):
//      camp_camper_history must answer "ok" in under 1 second (timed with
//      and without the new index); EXPLAIN of its query (generic and
//      custom plan) uses the partial index and never scans change_log
//   g. 0033 applied a SECOND time: no fingerprint, row or history change
//   h. the Undo of SETUP.md 0033f (manual/0033u): every fingerprint file
//      equals the one before 0033, the pre-apply check answers as before,
//      the camps tests pass; then 0033 again -> the tested fingerprints,
//      0033_tests.sql passes
// Run only this step with   node run.mjs --only-step0033
// =====================================================================
async function step0033() {
  const L = '[0033] ';
  const preSql = read('tests', '0033_preapply_check.sql');
  record(`${L}0033_fingerprints.sql and 0033_preapply_check.sql contain neither "delete" nor "drop" (connector-safe)`,
    !/delete|drop/i.test(read('tests', '0033_fingerprints.sql')) && !/delete|drop/i.test(preSql));
  const db = await buildBase(L);
  if (!db) return null;
  if (!(await liveOrderTo0025(db, L))) return null;
  for (const [label, file] of [['0027 (Edit camp guard)', '0027_camps_edit_guard.sql'],
    ['0026 (Finance: Black Belt payments)', '0026_finance_black_belt.sql'], ['0028 (Star start times)', '0028_star_start_times.sql'],
    ['0029 (Finance reminder 5 minutes)', '0029_finance_reminder_5min.sql'], ['0031 (class ages)', '0031_class_ages.sql']]) {
    if (!(await run(db, `${L}apply ${label}`, read('migrations', file)))) return null;
  }

  // b. two campers before 0033 (a family sign-up of Amy, Paying by cash,
  // and Bo, whose Paying by the desk then changes to check)
  const claims = JSON.stringify({ sub: ADMIN_UID, role: 'authenticated', session_id: CAMPS_ADMIN_SID,
    amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) - 60 }] });
  const setClaims = (c) => db.query(`select set_config('request.jwt.claims', $1, false)`, [c]);
  await campsAdminSession(db);
  const seeded = await run(db, `${L}a camp with two campers signed up before 0033`, `
    do $$
    declare
      v_mon   date := date_trunc('week', (public.testing_today() + 14)::timestamp)::date + 7;
      v_r     jsonb;
      v_camp  uuid;
      v_total integer := 0;
      v_try   integer;
      v_kids  jsonb;
    begin
      perform set_config('request.jwt.claims', '${claims}', true);
      v_r := public.camp_add_camp('worcester', false, 'PGlite 0033 camp', array[v_mon, v_mon + 1, v_mon + 2], '09:00', '15:00',
               public.testing_today() - 3, public.testing_today() + 5, public.testing_today() + 5, 5, 12,
               '${JSON.stringify([1, 2, 3].map((k) => ({ day_count: k, member_early_cents: 7500 * k, member_regular_cents: 8000 * k,
                 nonmember_early_cents: 8500 * k, nonmember_regular_cents: 9000 * k })))}'::jsonb,
               '[{"name": "Lunch", "price_cents": 700, "per": "day", "not_for_all_days": false}]'::jsonb, null, 'I agree.');
      if v_r ->> 'status' is distinct from 'ok' then raise exception 'camp_add_camp %', v_r; end if;
      v_camp := (v_r ->> 'id')::uuid;
      perform set_config('request.jwt.claims', '', true);
      select jsonb_agg(jsonb_build_object('first_name', n, 'last_name', 'Before', 'age', 8, 'member', true,
               'day_ids', (select jsonb_agg(d.id order by d.day) from public.camp_days d where d.camp_id = v_camp),
               'extras', '[]'::jsonb) order by n) into v_kids
        from unnest(array['Amy', 'Bo']) as n;
      for v_try in 1 .. 2 loop
        select public.camp_public_signup(c.public_code, 'pglite-0033', gen_random_uuid(), v_kids, 'Test Parent', '5085550100',
                 'Parent', 'Test Contact', '5085550101', 'Friend', 'cash', true, '${TEST_SIGNATURE}', 'camp-2026-10-18',
                 md5(c.waiver_text), v_total) into v_r
          from public.camps c where c.id = v_camp;
        exit when v_r ->> 'status' = 'ok';
        v_total := (v_r ->> 'new_total_cents')::integer;
      end loop;
      if v_r ->> 'status' is distinct from 'ok' then raise exception 'sign-up %', v_r; end if;
      perform set_config('request.jwt.claims', '${claims}', true);
      select public.camp_change_paying_by(c.id, c.version, 'check') into v_r from public.camp_campers c where c.first_name = 'Bo';
      if v_r ->> 'status' is distinct from 'ok' then raise exception 'change paying by %', v_r; end if;
      perform set_config('request.jwt.claims', '', true);
      -- Cy (card): a camper with NO history insert row (added by hand with
      -- the history trigger off), so the backfill must fall back to Paying by
      alter table public.camp_campers disable trigger camp_campers_log;
      insert into public.camp_campers (signup_id, camp_id, position, first_name, last_name, age, member, paying_by, base_cents)
      select c.signup_id, c.camp_id, 3, 'Cy', 'Before', 8, true, 'card', c.base_cents
        from public.camp_campers c where c.first_name = 'Amy';
      alter table public.camp_campers enable trigger camp_campers_log;
    end
    $$;`);
  if (!seeded) return null;
  const pre = async () => (await db.query(preSql)).rows[0];
  const fnMd5 = (sig) => one(db, `select md5(regexp_replace(regexp_replace(p.prosrc, '--[^\\n]*', '', 'g'), '\\s+', '', 'g'))
                                    from pg_proc p where p.oid = to_regprocedure('public.${sig}')`);
  const md5s = [await fnMd5('camp_mark_paid(uuid, integer, text)'), await fnMd5('camp_undo_payment(uuid)'),
    await fnMd5('camp_edit_payment(uuid, text, integer, date, text)')];
  record(`${L}the pre-apply check names the md5s of the code 0033 was built on (0013 mark paid, 0013 undo, 0022 edit)`,
    preSql.includes(md5s[0]) && preSql.includes(md5s[1]) && preSql.includes(md5s[2]), md5s.join(' / '));
  const ready = await pre();
  record(`${L}[pre-apply check] before 0033: true / false / 3 / 0 / false, 3 campers, 1 changed at the desk, 1 without an insert row`,
    ready.mark_paid_3_inputs === true && ready.mark_paid_4_inputs === false && ready.replaced_as_tested === 3
      && ready.new_columns === 0 && ready.history_function === false && ready.campers === 3 && ready.campers_desk_changed === 1
      && ready.campers_without_insert_row === 1,
    JSON.stringify(ready));

  // c. apply 0033
  const numbers = ['0003', '0004', '0005', '0006', '0010', '0007', '0008', '0009', '0012', '0015', '0011', '0019', '0014', '0020',
    '0013', '0017', '0018', '0016', '0021', '0022', '0024', '0023', '0025', '0027', '0026', '0028', '0029', '0031', '0033']
    .filter((n) => existsSync(path.join(supabaseDir, 'tests', `${n}_fingerprints.sql`)));
  const before = await printsOf(db, numbers);
  const campers = `select string_agg(c.first_name || ':' || c.paying_by || ':' || c.version, ',' order by c.first_name) from public.camp_campers c`;
  const campersBefore = await one(db, campers);
  const logBefore = await one(db, 'select count(*)::integer from public.change_log');
  const migration = read('migrations', '0033_camps_design_review.sql');
  if (!(await run(db, `${L}apply 0033_camps_design_review.sql`, migration))) return null;
  record(`${L}the backfill: paying_by_on_form = the form's choice from the insert row (Bo: cash, though the desk made it check), else Paying by (Cy: card); no version moved; no history row`,
    (await one(db, `select string_agg(c.first_name || ':' || c.paying_by_on_form, ',' order by c.first_name) from public.camp_campers c`))
      === 'Amy:cash,Bo:cash,Cy:card'
      && (await one(db, campers)) === campersBefore
      && (await one(db, 'select count(*)::integer from public.change_log')) === logBefore,
    `${await one(db, campers)}; history ${logBefore} -> ${await one(db, 'select count(*)::integer from public.change_log')}`);
  record(`${L}the two camper triggers are on again after the backfill`,
    (await one(db, `select count(*)::integer from pg_trigger t where t.tgrelid = 'public.camp_campers'::regclass
                      and t.tgname in ('camp_campers_before_write', 'camp_campers_log', 'camp_campers_before_form_choice')
                      and t.tgenabled = 'O'`)) === 3);
  const after = await printsOf(db, numbers);
  const parts = (line) => line.split('  ');
  const key = (line) => parts(line).slice(0, 2).join('  ');
  // what may move, per file: "kind  item" (a changed line: same key gone + added)
  const allowed = {
    '0013': ['function  camp_mark_paid(p_camper_id uuid, p_expected_version integer, p_school text)',
      'function  camp_mark_paid(p_camper_id uuid, p_expected_version integer, p_school text, p_method text)',
      'function  camp_undo_payment(p_payment_id uuid)',
      'function  camp_edit_payment(p_payment_id uuid, p_method text, p_amount_cents integer, p_paid_on date, p_school text)',
      'view  camp_roster', 'table  camp_campers', 'trigger  camp_campers.camp_campers_before_form_choice'],
    '0022': ['function  camp_edit_payment(p_payment_id uuid, p_method text, p_amount_cents integer, p_paid_on date, p_school text)',
      'constraint  camp_campers.camp_campers_paying_by_on_form_check', 'constraint  camp_payments.camp_payments_paying_by_before_check'],
  };
  const wrong = [];
  for (const n of numbers.filter((x) => x !== '0033')) {
    const f = `${n}_fingerprints.sql`;
    const gone = before[f].filter((line) => !after[f].includes(line));
    const added = after[f].filter((line) => !before[f].includes(line));
    for (const line of [...gone, ...added]) {
      if (!(allowed[n] || []).includes(key(line))) wrong.push(`${n}: ${line}`);
    }
    // a function that moved in place: only its body md5 (the first 32 characters of the detail)
    for (const g of gone.filter((x) => parts(x)[0] === 'function')) {
      const twin = added.find((a) => key(a) === key(g));
      if (twin && parts(twin)[2].slice(32) !== parts(g)[2].slice(32)) wrong.push(`${n}: more than the body changed: ${key(g)}`);
    }
    if (n === '0013') {
      const mp3 = gone.find((x) => key(x).includes('p_school text)') && key(x).startsWith('function  camp_mark_paid('));
      const mp4 = added.find((x) => key(x).includes('p_method text)') && key(x).startsWith('function  camp_mark_paid('));
      if (!mp3 || !mp4 || parts(mp3)[2].slice(32) !== parts(mp4)[2].slice(32)) wrong.push('0013: camp_mark_paid 3 -> 4 inputs with other rights or settings');
      const roster = after[f].find((x) => key(x) === 'view  camp_roster') || '';
      if (!roster.endsWith('options=security_invoker=true')) wrong.push(`0013: ${roster}`);
      const campersLine = after[f].find((x) => key(x) === 'table  camp_campers') || '';
      const campersOld = before[f].find((x) => key(x) === 'table  camp_campers') || '';
      if (campersLine.replace(',paying_by_on_form>authenticated:SELECT', '') !== campersOld) wrong.push(`0013: camp_campers rights: ${campersLine}`);
    }
  }
  record(`${L}fingerprints: only the planned 0013 / 0022 items moved (same rights, owner, definer, settings); every other file byte-identical`,
    wrong.length === 0, wrong.join('; ') || `${numbers.length} files`);
  const prints33 = after['0033_fingerprints.sql'];
  const fp = (k) => prints33.find((l) => key(l) === k) || '';
  const appFns = ['camp_mark_paid(p_camper_id uuid, p_expected_version integer, p_school text, p_method text)',
    'camp_undo_payment(p_payment_id uuid)', 'camp_camper_history(p_camper_id uuid)',
    'camp_edit_payment(p_payment_id uuid, p_method text, p_amount_cents integer, p_paid_on date, p_school text)'];
  record(`${L}0033 fingerprints: 4 app functions security definer, search_path="", only postgres and authenticated; the 2 helpers for nobody`,
    prints33.filter((l) => l.startsWith('function  ')).length === 6
      && appFns.every((x) => fp(`function  ${x}`).includes('definer=true') && fp(`function  ${x}`).includes('settings=search_path=""')
        && fp(`function  ${x}`).endsWith('rights=authenticated:EXECUTE,postgres:EXECUTE'))
      && ['camp_history_strip(p_row jsonb)', 'camp_campers_keep_form_choice()'].every((x) => fp(`function  ${x}`).includes('definer=false')
        && fp(`function  ${x}`).includes('settings=search_path=""') && fp(`function  ${x}`).endsWith('rights=postgres:EXECUTE')),
    prints33.filter((l) => l.startsWith('function  ')).join(' | '));
  record(`${L}0033 fingerprints: paying_by_on_form text not null readable by authenticated only; paying_by_before by nobody; the view invoker, select for authenticated only`,
    fp('column  camp_campers.paying_by_on_form') === 'column  camp_campers.paying_by_on_form  text notnull=true rights=authenticated:SELECT'
      && fp('column  camp_payments.paying_by_before') === 'column  camp_payments.paying_by_before  text notnull=false rights='
      && fp('view  camp_roster').endsWith('options=security_invoker=true rights=authenticated:SELECT')
      && prints33.length === 13,
    prints33.filter((l) => !l.startsWith('function  ')).join(' | '));
  const applied = await pre();
  record(`${L}[pre-apply check] after 0033: false / true / 0 / 2 / true`,
    applied.mark_paid_3_inputs === false && applied.mark_paid_4_inputs === true && applied.replaced_as_tested === 0
      && applied.new_columns === 2 && applied.history_function === true, JSON.stringify(applied));

  // d. as the app (SET ROLE authenticated, the admin's token): the old
  // app's 3-input calls reach the one 4-input function. Each statement
  // runs on its own (a later one sees what the call wrote); their
  // answers are merged into one object for the check.
  const asApp = async (label, sql, check) => {
    let out;
    try {
      await db.exec('begin;');
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
      await db.exec('set local role authenticated;');
      const answers = [];
      for (const q of [].concat(sql)) answers.push((await db.query(q)).rows[0]);
      out = Object.assign({}, ...answers);
    } catch (error) {
      out = { error: error.message };
    } finally {
      await db.exec('rollback;').catch(() => {});
    }
    record(`${L}[as the app] ${label}`, check(out), JSON.stringify(out));
  };
  const amy = await one(db, `select c.id::text from public.camp_campers c where c.first_name = 'Amy'`);
  const amyV = await one(db, `select c.version from public.camp_campers c where c.first_name = 'Amy'`);
  // what the call left behind: Paying by, and the payment's method (as the app may read it)
  const afterPay = `select c.paying_by as pb, (select p.method from public.camp_payments p where p.camper_id = c.id) as paid_by
                      from public.camp_campers c where c.id = '${amy}'`;
  const paidOk = (o) => o?.r?.status === 'ok' && o.r.method === 'cash' && o.r.paying_by === 'cash' && o.pb === 'cash'
    && o.paid_by === 'cash';
  await asApp('3 NAMED inputs (p_camper_id, p_expected_version, p_school) -> ok, paid by Paying by (cash)',
    [`select public.camp_mark_paid(p_camper_id => '${amy}', p_expected_version => ${amyV}, p_school => 'worcester') as r`, afterPay],
    paidOk);
  await asApp('3 positional inputs -> ok, paid by Paying by (cash)',
    [`select public.camp_mark_paid('${amy}'::uuid, ${amyV}, 'worcester') as r`, afterPay], paidOk);
  await asApp('4 NAMED inputs with p_method card -> Paying by card',
    [`select public.camp_mark_paid(p_camper_id => '${amy}', p_expected_version => ${amyV}, p_school => 'worcester', p_method => 'card') as r`,
      afterPay],
    (o) => o?.r?.status === 'ok' && o.r.method === 'card' && o.pb === 'card' && o.paid_by === 'card');
  await asApp('camp_camper_history -> ok with rows',
    `select public.camp_camper_history('${amy}') as r`, (o) => o?.r?.status === 'ok' && o.r.rows.length > 0);
  record(`${L}exactly one camp_mark_paid, with 4 inputs`,
    (await one(db, `select string_agg(pg_get_function_identity_arguments(p.oid), ' | ') from pg_proc p
                     join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'camp_mark_paid'`))
      === 'p_camper_id uuid, p_expected_version integer, p_school text, p_method text');
  for (const role of ['anon', 'camps_registrar']) {
    let message = '';
    try {
      await db.exec('begin;');
      await db.exec(`set local role ${role};`);
      await db.query(`select public.camp_camper_history('${amy}')`);
    } catch (error) {
      message = error.message;
    } finally {
      await db.exec('rollback;').catch(() => {});
    }
    record(`${L}${role} can't run camp_camper_history`, /permission denied/.test(message), message || 'it ran');
  }

  // e. the tests
  const tests = async (label, files) => {
    for (const [file, ok] of files) await runTestFile(db, `${L}${file} (${label})`, file, ok);
  };
  const campTests = [['0013_tests.sql', 'ALL 0013 TESTS PASSED'], [CAMPS_TESTS, 'ALL 0017 TESTS PASSED'],
    ['0018_tests.sql', 'ALL 0018 TESTS PASSED'], ['0022_tests.sql', 'ALL 0022 TESTS PASSED'],
    ['0026_tests.sql', 'ALL 0026 TESTS PASSED'], ['0027_tests.sql', 'ALL 0027 TESTS PASSED']];
  await tests('after 0033', [['0033_tests.sql', 'ALL 0033 TESTS PASSED'], ...campTests]);

  // f. speed: 30,000 more history rows, then time the reader as the admin
  await setClaims('');
  await run(db, `${L}[speed] 30,000 more history rows`, `
    insert into public.change_log (actor_name, action, table_name, record_id, op, before, after)
    select 'PGlite seed', 'pglite_seed', 'camp_camper_days', gen_random_uuid(), 'insert', null,
           jsonb_build_object('camper_id', gen_random_uuid(), 'day_id', gen_random_uuid())
      from generate_series(1, 10000);
    insert into public.change_log (actor_name, action, table_name, record_id, op, before, after)
    select 'PGlite seed', 'camp_check_in', 'camp_camper_days', l.record_id, 'update',
           '{"checked_in_at": null}'::jsonb, jsonb_build_object('checked_in_at', now(), 'checked_in_by_name', 'Staff')
      from public.change_log l where l.action = 'pglite_seed' and l.table_name = 'camp_camper_days';
    insert into public.change_log (actor_name, action, table_name, record_id, op, before, after)
    select 'PGlite seed', 'pglite_seed', 'camp_campers', gen_random_uuid(), 'update', '{"age": 8}'::jsonb, '{"age": 9}'::jsonb
      from generate_series(1, 9000);
    insert into public.change_log (actor_name, action, table_name, record_id, op, before, after)
    select 'PGlite seed', 'pglite_seed', 'camp_payments', gen_random_uuid(), 'insert', null,
           jsonb_build_object('camper_id', c.id, 'method', 'cash', 'amount_cents', 100)
      from public.camp_campers c, generate_series(1, 500) where c.first_name = 'Amy';
    analyze public.change_log;`);
  await campsAdminSession(db);
  await setClaims(claims);
  const timeIt = async () => {
    const t0 = performance.now();
    const r = (await db.query(`select public.camp_camper_history('${amy}') as r`)).rows[0].r;
    return { ms: Math.round(performance.now() - t0), status: r.status, rows: r.rows?.length };
  };
  await timeIt();   // warm-up
  const withIndex = await timeIt();
  let withoutIndex = null;
  try {
    await db.exec('begin; drop index public.change_log_camp_camper_idx;');
    await timeIt();
    withoutIndex = await timeIt();
  } finally {
    await db.exec('rollback;').catch(() => {});
  }
  await setClaims('');
  const total = await one(db, 'select count(*)::integer from public.change_log');
  record(`${L}[speed] camp_camper_history with ${total} history rows: ok, 500 rows, under 1 second`,
    withIndex.status === 'ok' && withIndex.rows === 500 && withIndex.ms < 1000,
    `with the new index ${withIndex.ms} ms; without it ${withoutIndex?.ms} ms`);
  // EXPLAIN of the reader's own query (cut out of the migration, with the
  // two variables as parameters), both as a "generic" plan (what plpgsql
  // settles on after a few calls) and a "custom" one: every part must use
  // an index - the partial index for the days / extras / payments, never a
  // full scan of change_log
  {
    const mig = migration.replace(/\r\n/g, '\n');
    const s0 = mig.indexOf('from (select u.id');
    const s1 = mig.indexOf('limit 500) as h', s0);
    const q = ('select u.id' + mig.slice(s0 + 'from (select u.id'.length, s1) + 'limit 500')
      .replaceAll('p_camper_id', '$1::uuid').replaceAll('v_signup_id', '$2::uuid');
    const signup = await one(db, `select c.signup_id::text from public.camp_campers c where c.id = '${amy}'`);
    const plans = {};
    try {
      await db.exec(`prepare h33(uuid, uuid) as ${q};`);
      for (const mode of ['force_generic_plan', 'force_custom_plan']) {
        await db.exec(`set plan_cache_mode = ${mode};`);
        plans[mode] = (await db.query(`explain execute h33('${amy}', '${signup}')`)).rows.map((r) => r['QUERY PLAN']).join('\n');
      }
    } catch (error) {
      plans.error = error.message;
    } finally {
      await db.exec('reset plan_cache_mode; deallocate all;').catch(() => {});
    }
    for (const [mode, plan] of Object.entries(plans)) console.log(`${L}[speed] EXPLAIN (${mode}):\n${plan}`);
    const good = (p) => typeof p === 'string' && p.includes('change_log_camp_camper_idx') && !/Seq Scan on change_log/.test(p);
    record(`${L}[speed] EXPLAIN: the partial index is used and change_log is never scanned in full (generic and custom plan)`,
      !plans.error && good(plans.force_generic_plan) && good(plans.force_custom_plan), plans.error || '');
  }

  // g. re-run safety (the history count as well: the backfill finds nothing to fill)
  const snapshot = `select md5(coalesce((select string_agg(to_jsonb(c)::text, ',' order by c.id) from public.camp_campers c), '')
                      || coalesce((select string_agg(to_jsonb(p)::text, ',' order by p.id) from public.camp_payments p), '')
                      || (select count(*) from public.change_log)::text)`;
  const snapBefore = await one(db, snapshot);
  await run(db, `${L}apply 0033 a SECOND time (re-run safety)`, migration);
  const again = await printsOf(db, numbers);
  const movedAgain = numbers.filter((n) => JSON.stringify(after[`${n}_fingerprints.sql`]) !== JSON.stringify(again[`${n}_fingerprints.sql`]));
  record(`${L}0033 re-run: no fingerprint change, no row or history change`,
    movedAgain.length === 0 && (await one(db, snapshot)) === snapBefore, movedAgain.join(', '));

  // h. Undo 0033, as SETUP.md 0033f has it: paste the undo file it names
  const setup = read('SETUP.md').replace(/\r\n/g, '\n');
  const at = setup.search(/^### 0033f\. Undo 0033/m);
  const undoFile = 'manual/0033u_undo_camps_design_review.sql';
  if (at < 0 || !setup.slice(at, at + 2000).includes(`supabase/${undoFile}`)) {
    record(`${L}[undo 0033] SETUP.md has "### 0033f. Undo 0033" naming supabase/${undoFile}`, false, 'heading or file name missing');
  } else if (await run(db, `${L}[undo 0033] paste ${undoFile}`, read('manual', '0033u_undo_camps_design_review.sql'))) {
    const undone = await printsOf(db, numbers);
    const back = numbers.filter((n) => JSON.stringify(before[`${n}_fingerprints.sql`]) !== JSON.stringify(undone[`${n}_fingerprints.sql`]));
    record(`${L}[undo 0033] every fingerprint file equals the one before 0033`,
      back.length === 0, back.length ? `differ: ${back.join(', ')}` : `${numbers.length} files`);
    const undonePre = await pre();
    record(`${L}[undo 0033] the pre-apply check answers as before 0033 (functions and columns)`,
      undonePre.mark_paid_3_inputs === true && undonePre.mark_paid_4_inputs === false && undonePre.replaced_as_tested === 3
        && undonePre.new_columns === 0 && undonePre.history_function === false, JSON.stringify(undonePre));
    await tests('after the undo', campTests);
    if (await run(db, `${L}[undo 0033] apply 0033 again (redo)`, migration)) {
      const redo = await fingerprints(db, '0033_fingerprints.sql');
      record(`${L}[undo 0033] after the redo the 0033 fingerprints equal the tested ones`, JSON.stringify(redo) === JSON.stringify(prints33));
      await tests('after the redo', [['0033_tests.sql', 'ALL 0033 TESTS PASSED']]);
    }
  }
  await db.close().catch(() => {});
  return prints33;
}

// =====================================================================
// step0035: Color Belt clean-up after 0030 (0035) - the old one-click
// Mark paid functions testing_mark_paid(uuid, integer) (0005) and
// testing_private_mark_paid(uuid, integer) (0014) are removed
// ---------------------------------------------------------------------
// On its OWN fresh database in the production order with every live
// migration (liveOrderTo0025, then 0027, 0026, 0028, 0029, 0031, 0030,
// 0032, 0033, 0034):
//   a. connector-safe files (pre-apply check, tests, the 0005 / 0014
//      fingerprints); the migration's only "drop" lines are its two
//      "drop function if exists" lines (and comments)
//   b. the pre-apply check before 0035: both old bodies as tested, 2
//      versions, 0030's two *_by there and as tested, nobody else
//   c. the Color Belt and Finance tests BEFORE 0035 (0005, 0010, 0011,
//      0014, 0018, 0026, 0030 - their test payments use the old ones)
//   d. the guard (each in a transaction that is rolled back): refused
//      without 0030's testing_mark_paid_by; refused when another function
//      still calls an old one (and the pre-apply check names it)
//   e. apply 0035: in every fingerprint file ONLY the two old function
//      lines go (0003's list, 0005's and 0014's files); nothing is added;
//      every other line and file byte-identical
//   f. 0035_tests.sql and every baseline file again after it (0005, 0010,
//      0011, 0014, 0018, 0026, 0030: their test payments go through each
//      file's pg_temp Mark paid helper, which uses 0030's *_by after 0035)
//   g. the pre-apply check after 0035; 0035 a SECOND time changes nothing;
//      0030 re-run after 0035 is accepted by its guard and moves no
//      fingerprint
//   h. the Undo of SETUP.md 0035e (manual/0035u): both functions back
//      byte for byte (raw body md5 = production's before 0035), every
//      fingerprint file equals the one before 0035, the pre-apply check
//      as before, the baseline tests pass; then 0035 again (redo) and
//      0035_tests.sql passes
// Run only this step with   node run.mjs --only-step0035
// =====================================================================
async function step0035() {
  const L = '[0035] ';
  const preSql = read('tests', '0035_preapply_check.sql');
  const migration = read('migrations', '0035_color_belt_cleanup.sql');
  const undoFile = 'manual/0035u_undo_color_belt_cleanup.sql';
  // a. connector-safe files; the migration's "drop" words
  const unsafe = [['tests', '0035_tests.sql'], ['tests', '0035_preapply_check.sql'], ['tests', '0005_fingerprints.sql'],
    ['tests', '0014_fingerprints.sql']].filter(([dir, file]) => /delete|drop/i.test(read(dir, file))).map(([, file]) => file);
  record(`${L}0035's tests, pre-apply check and the 0005 / 0014 fingerprints contain neither "delete" nor "drop" (connector-safe)`,
    unsafe.length === 0, unsafe.join(', '));
  const dropLines = migration.replace(/\r\n/g, '\n').split('\n').filter((l) => /drop|delete/i.test(l) && !/^\s*--/.test(l));
  record(`${L}the migration's only removals are its two "drop function if exists" lines (no cascade)`,
    JSON.stringify(dropLines) === JSON.stringify(['drop function if exists public.testing_mark_paid(uuid, integer);',
      'drop function if exists public.testing_private_mark_paid(uuid, integer);']), dropLines.join(' | '));
  const body = (sql) => sql.replace(/^begin;\s*$/m, '').replace(/^commit;\s*$/m, '');

  const db = await buildBase(L);
  if (!db) return null;
  if (!(await liveOrderTo0025(db, L))) return null;
  for (const [label, file] of [['0027 (camps edit guard)', '0027_camps_edit_guard.sql'],
    ['0026 (Finance: Black Belt payments)', '0026_finance_black_belt.sql'], ['0028 (Star start times)', '0028_star_start_times.sql'],
    ['0029 (Finance reminder every 5 minutes)', '0029_finance_reminder_5min.sql'], ['0031 (class ages)', '0031_class_ages.sql'],
    ['0030 (Color Belt design review)', '0030_color_belt_review.sql'], ['0032 (Black Belt design review)', '0032_black_belt_review.sql'],
    ['0033 (Camps design review)', '0033_camps_design_review.sql'], ['0034 (Black Belt History record_id)', '0034_black_belt_history_ids.sql']]) {
    if (!(await run(db, `${L}apply ${label}`, read('migrations', file)))) return null;
  }

  // b. the pre-apply check before 0035
  const pre = async () => (await db.query(preSql)).rows[0];
  const clean = await pre();
  record(`${L}[pre-apply check] before 0035: both old bodies as 0005 / 0014, 2 versions, 0030's *_by there and as tested, nobody else uses them`,
    clean.old_event_is_0005 === true && clean.old_private_is_0014 === true && clean.old_versions === 2
      && clean.by_functions === true && clean.by_bodies_are_0030 === true && clean.other_users === null, JSON.stringify(clean));
  const rawMd5 = async () => (await db.query(`select p.proname::text as name, md5(p.prosrc) as md5 from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('testing_mark_paid', 'testing_private_mark_paid') order by 1`)).rows
    .map((r) => `${r.name}=${r.md5}`).join(',');
  // production's raw prosrc md5s before 0035 (read-only check, 2026-11-04)
  const liveRaw = 'testing_mark_paid=6b4346eb5d04f2866170f54724f8988d,testing_private_mark_paid=a8dfaf7f8166a45d3eb7f8cc15f0d0cd';
  const rawBefore = await rawMd5();
  record(`${L}before 0035 the two old functions are byte for byte production's (raw body md5)`, rawBefore === liveRaw, rawBefore);

  // c. the baseline tests
  const tests = async (label, files) => {
    for (const [file, ok] of files) await runTestFileLive(db, `${L}${file} (${label})`, file, ok);
  };
  const baseline = [['0005_tests.sql', 'ALL 0005 TESTS PASSED'], ['0010_tests.sql', 'ALL 0010 TESTS PASSED'],
    ['0011_tests.sql', 'ALL 0011 TESTS PASSED'], ['0014_tests.sql', 'ALL 0014 TESTS PASSED'],
    ['0018_tests.sql', 'ALL 0018 TESTS PASSED'], ['0026_tests.sql', 'ALL 0026 TESTS PASSED'],
    ['0030_tests.sql', 'ALL 0030 TESTS PASSED']];
  await tests('before 0035', baseline);

  // d. the guard, on copies of the state that are rolled back
  const refused = async (label, setupSql, want) => {
    let message = '';
    try {
      await db.exec('begin;');
      await db.exec(setupSql);
      await db.exec(body(migration));
    } catch (error) {
      message = error.message;
    } finally {
      await db.exec('rollback;').catch(() => {});
    }
    const still = await one(db, `select count(*)::integer from pg_proc where proname in ('testing_mark_paid', 'testing_private_mark_paid')`);
    record(`${L}[guard] ${label}`, message.includes(want) && still === 2, message || 'not refused');
  };
  await refused('refused without 0030\'s testing_mark_paid_by (nothing removed)',
    'drop function public.testing_mark_paid_by(uuid, integer, text, integer);', '0035 needs migration 0030');
  await refused('refused when another function still calls testing_private_mark_paid (names it; nothing removed)',
    `create function public.zz_uses_old(p uuid) returns jsonb language sql as $f$ select public.testing_private_mark_paid(p, 1) $f$;`,
    'function public.zz_uses_old(p uuid)');
  try {
    await db.exec('begin;');
    await db.exec(`create view public.zz_old_view as select 'testing_mark_paid(x)'::text as t;`);
    const named = (await db.query(preSql)).rows[0].other_users;
    record(`${L}[pre-apply check] other_users names a view that mentions an old function`, named === 'view public.zz_old_view', String(named));
  } catch (error) {
    record(`${L}[pre-apply check] other_users names a view`, false, error.message);
  } finally {
    await db.exec('rollback;').catch(() => {});
  }

  // e. apply 0035
  const numbers = [...NUMBERS_0025, '0027', '0026', '0028', '0029', '0031', '0030', '0032', '0033', '0034']
    .filter((n) => existsSync(path.join(supabaseDir, 'tests', `${n}_fingerprints.sql`)));
  const before = await printsOf(db, numbers);
  if (!(await run(db, `${L}apply 0035_color_belt_cleanup.sql`, migration))) return null;
  const after = await printsOf(db, numbers);
  const goneWanted = {
    '0003': [/^testing_mark_paid {2}p_registration_id uuid, p_expected_version integer {2}/, /^testing_private_mark_paid {2}p_private_id uuid, p_expected_version integer {2}/],
    '0005': [/^function {2}testing_mark_paid\(p_registration_id uuid, p_expected_version integer\) {2}/],
    '0014': [/^function {2}testing_private_mark_paid\(p_private_id uuid, p_expected_version integer\) {2}/],
  };
  const wrong = [];
  for (const n of numbers) {
    const f = `${n}_fingerprints.sql`;
    const gone = before[f].filter((line) => !after[f].includes(line));
    const added = after[f].filter((line) => !before[f].includes(line));
    const want = goneWanted[n] || [];
    if (added.length) wrong.push(`${n} added: ${added.join(' | ')}`);
    if (gone.length !== want.length || !want.every((re) => gone.some((line) => re.test(line)))) wrong.push(`${n} gone: ${gone.join(' | ') || '(none)'}`);
  }
  record(`${L}fingerprints: only the two old Mark paid lines went (0003's list, 0005's and 0014's files), nothing added, every other line and file byte-identical`,
    wrong.length === 0, wrong.join('; ') || `${numbers.length} files`);

  // f. the tests after 0035: 0035's own, then every baseline file again (their test
  //    payments now go through the *_by functions - pg_temp.t_mark_paid /
  //    t_private_mark_paid in each file)
  await tests('after 0035', [['0035_tests.sql', 'ALL 0035 TESTS PASSED'], ...baseline]);

  // g. the pre-apply check after 0035, re-run safety
  const applied = await pre();
  record(`${L}[pre-apply check] after 0035: no old versions, 0030's *_by there and as tested, nobody else`,
    applied.old_event_is_0005 === false && applied.old_private_is_0014 === false && applied.old_versions === 0
      && applied.by_functions === true && applied.by_bodies_are_0030 === true && applied.other_users === null, JSON.stringify(applied));
  await run(db, `${L}apply 0035 a SECOND time (re-run safety)`, migration);
  const again = await printsOf(db, numbers);
  const movedAgain = numbers.filter((n) => JSON.stringify(after[`${n}_fingerprints.sql`]) !== JSON.stringify(again[`${n}_fingerprints.sql`]));
  record(`${L}0035 re-run: no fingerprint change`, movedAgain.length === 0, movedAgain.join(', '));
  // 0030 re-run AFTER 0035: its guard accepts the *_by functions in place of the old ones
  // (the guard is a DO block, so no function body moves)
  if (await run(db, `${L}re-run 0030 after 0035 (its guard accepts the state after 0035)`, read('migrations', '0030_color_belt_review.sql'))) {
    const after30 = await printsOf(db, numbers);
    const moved30 = numbers.filter((n) => JSON.stringify(after[`${n}_fingerprints.sql`]) !== JSON.stringify(after30[`${n}_fingerprints.sql`]));
    record(`${L}0030 re-run after 0035: no fingerprint change (0030's included), the old functions stay gone`,
      moved30.length === 0 && (await one(db, `select count(*)::integer from pg_proc where proname in ('testing_mark_paid', 'testing_private_mark_paid')`)) === 0,
      moved30.join(', '));
  }

  // h. Undo 0035, as SETUP.md 0035e has it: paste the undo file it names
  const setup = read('SETUP.md').replace(/\r\n/g, '\n');
  const at = setup.search(/^### 0035e\. Undo 0035/m);
  if (at < 0 || !setup.slice(at, at + 2000).includes(`supabase/${undoFile}`)) {
    record(`${L}[undo 0035] SETUP.md has "### 0035e. Undo 0035" naming supabase/${undoFile}`, false, 'heading or file name missing');
  } else if (await run(db, `${L}[undo 0035] paste ${undoFile}`, read('manual', '0035u_undo_color_belt_cleanup.sql'))) {
    const rawUndone = await rawMd5();
    record(`${L}[undo 0035] both functions are back byte for byte (raw body md5 = production's before 0035)`, rawUndone === liveRaw, rawUndone);
    const undone = await printsOf(db, numbers);
    const back = numbers.filter((n) => JSON.stringify(before[`${n}_fingerprints.sql`]) !== JSON.stringify(undone[`${n}_fingerprints.sql`]));
    record(`${L}[undo 0035] every fingerprint file equals the one before 0035 (rights included)`,
      back.length === 0, back.length ? `differ: ${back.join(', ')}` : `${numbers.length} files`);
    const undonePre = await pre();
    record(`${L}[undo 0035] the pre-apply check answers as before 0035`, JSON.stringify(undonePre) === JSON.stringify(clean),
      JSON.stringify(undonePre));
    await tests('after the undo', baseline);
    if (await run(db, `${L}[undo 0035] apply 0035 again (redo)`, migration)) {
      const redo = await printsOf(db, numbers);
      const differ = numbers.filter((n) => JSON.stringify(after[`${n}_fingerprints.sql`]) !== JSON.stringify(redo[`${n}_fingerprints.sql`]));
      record(`${L}[undo 0035] after the redo every fingerprint file equals the tested one`, differ.length === 0, differ.join(', '));
      await tests('after the redo', [['0035_tests.sql', 'ALL 0035 TESTS PASSED']]);
    }
  }
  await db.close().catch(() => {});
  return true;
}

// =====================================================================
// step0036: New students - each child's last name and date of birth, the
// Address question (0036, rulebook v0.634 - v0.639)
// ---------------------------------------------------------------------
// On its OWN fresh database built in the production order with every
// live migration (liveOrderTo0025, then 0027, 0026, 0028, 0029, 0031,
// 0030, 0032, 0033 and 0034 - each only if its file is on this branch):
//   a. 0036_fingerprints.sql and 0036_preapply_check.sql are
//      connector-safe (no "delete" / "drop"); a Free class form made from
//      the template BEFORE 0036 and a sign-up through it (two children
//      sent the old way) are kept; the pre-apply check (SETUP 0036a)
//      answers 0 / false / 15 / 8 / 8 / 0 / 0 / 0
//   b. the Forms / Prospects tests (0007, 0009, 0012, 0015, 0019, 0021,
//      0031) pass BEFORE 0036 (the baseline)
//   c. apply 0036: in every other fingerprint file ONLY these lines move -
//      and each of them does: the "function" lines of the eight replaced
//      functions (body md5 only - rights, owner, definer and settings
//      stay) in 0009's, 0012's and 0031's files; 0009's
//      form_submissions_size_check line (2000 -> 4000) and its
//      form_submissions table line (the app's readable columns: 0009's
//      15 -> id, form_id, location_code, created_at - security review);
//      0012's two new prospects rules (added). No policy, view or
//      app-callable security-invoker function reads form_submissions.
//      0036's own rows as designed. 0036 writes nothing: the earlier
//      sign-up, its prospects (version 1, no last name or date of birth),
//      the forms and both histories are unchanged. The pre-apply check
//      answers 2 / true / 4 / 8 / 0 / 0 / 0 / 0
//   d. 0036_tests.sql, then the baseline tests again; the form made
//      before 0036 (no Address question) takes both child shapes (rolled
//      back)
//   e. 0036 applied a SECOND time: no fingerprint, row or history change
//   f. the Undo of SETUP.md 0036e (the file it names,
//      supabase/manual/0036u_undo_new_students_profile.sql):
//        - with a Walk-in form (it has the Address question) and two
//          new-shape families through it planted - one of them six
//          children with 40-letter names in a 4-byte alphabet - in a
//          transaction rolled back afterwards, the pre-apply check counts
//          them and the undo refuses with its message, changing nothing
//        - on the clean database: every fingerprint file equals the one
//          before 0036; the pre-apply check answers as before; the
//          earlier sign-up is as it was; the baseline tests pass; a
//          second undo changes nothing; then 0036 again -> the tested
//          fingerprints, 0036_tests.sql passes
// Run only this step with   node run.mjs --only-step0036
// =====================================================================
async function step0036() {
  const L = '[0036] ';
  const preSql = read('tests', '0036_preapply_check.sql');
  const migration = read('migrations', '0036_new_students_profile.sql');
  const unsafe = [['tests', '0036_fingerprints.sql'], ['tests', '0036_preapply_check.sql']]
    .filter(([dir, file]) => /delete|drop/i.test(read(dir, file))).map(([, file]) => file);
  record(`${L}0036_fingerprints.sql and 0036_preapply_check.sql contain neither "delete" nor "drop" (connector-safe)`,
    unsafe.length === 0, unsafe.join(', '));
  const db = await buildBase(L);
  if (!db) return null;
  if (!(await liveOrderTo0025(db, L))) return null;
  for (const [label, file] of [['0027 (camps edit guard)', '0027_camps_edit_guard.sql'],
    ['0026 (Finance: Black Belt payments)', '0026_finance_black_belt.sql'], ['0028 (Star start times)', '0028_star_start_times.sql'],
    ['0029 (Finance reminder every 5 minutes)', '0029_finance_reminder_5min.sql'], ['0031 (class ages)', '0031_class_ages.sql'],
    ['0030 (Color Belt design review)', '0030_color_belt_review.sql'], ['0032 (Black Belt design review)', '0032_black_belt_review.sql'],
    ['0033 (Camps design review)', '0033_camps_design_review.sql'], ['0034 (Black Belt history ids)', '0034_black_belt_history_ids.sql']]) {
    if (!existsSync(path.join(supabaseDir, 'migrations', file))) continue;
    if (!(await run(db, `${L}apply ${label}`, read('migrations', file)))) return null;
  }

  // a. a Free class form made BEFORE 0036 (from the template of that time)
  // and a family sent through it the live page's way, as on production
  const SIG = "'data:image/png;base64,' || repeat('A', 300)";
  const SETTINGS = `'{"thank_you":"","alert_email":null,"confirm_email":false,"add_to_calendar":false}'`;
  if (!(await run(db, `${L}a form and a sign-up (two children, the old way) from before 0036`, `
    do $$
    declare
      v_f uuid;
      v_r jsonb;
      v_fields jsonb;
    begin
      select jsonb_agg(case when e ->> 'id' = 'waiver' then jsonb_set(e, '{text}', '"Our wording."') else e end order by n)
        into v_fields from jsonb_array_elements(public.forms_template('free_class')) with ordinality as t(e, n);
      insert into public.forms (location_code, name, slug, kind, status, draft, published, published_version, settings)
      values ('worcester', 'zz before 0036', 'zz-before-0036', 'free_class', 'live', v_fields, v_fields, 1, ${SETTINGS})
      returning id into v_f;
      v_r := public.forms_submit_core(v_f, gen_random_uuid(), 1,
               '{"parent_name": "Pat Zzbefore", "parent_phone": "(508) 555-0177", "parent_email": "pat.zz@example.com", "waiver": true}',
               '[{"first_name": "Una", "age": 6}, {"first_name": "Ned", "age": 8}]', '[]', ${SIG}, 'staff', 'PGlite before 0036');
      if v_r ->> 'status' is distinct from 'ok' then raise exception 'sign-up before 0036: %', v_r; end if;
    end
    $$;`))) return null;
  // everything 0036 could touch, as one md5 (the two new prospects columns left out, so it compares across 0036 and its undo)
  const snapSql = `select md5(
       coalesce((select string_agg(to_jsonb(f)::text, ',' order by f.id) from public.forms f), '')
    || coalesce((select string_agg(to_jsonb(s)::text, ',' order by s.id) from public.form_submissions s), '')
    || coalesce((select string_agg((to_jsonb(p) - 'child_last_name' - 'child_dob')::text, ',' order by p.id) from public.prospects p), '')
    || (select count(*) from public.change_log)::text || '/' || (select count(*) from public.family_history)::text)`;
  const pre = async () => (await db.query(preSql)).rows[0];
  const ready = await pre();
  record(`${L}[pre-apply check] before 0036: 0 / false / 15 / 8 / 8 / 0 / 0 / 0 (nothing of 0036, 0009's 15 readable columns, the 8 functions as tested)`,
    ready.new_columns === 0 && ready.size_rule_4000 === false && ready.staff_submission_columns === 15
      && ready.replaced_found === 8 && ready.replaced_as_tested === 8
      && ready.forms_with_address === 0 && ready.signups_over_2000 === 0 && ready.prospects_with_new_details === 0,
    JSON.stringify(ready));

  // b. the baseline tests
  const baseline = [['0007_tests.sql', 'ALL 0007 TESTS PASSED'], ['0009_tests.sql', 'ALL 0009 TESTS PASSED'],
    ['0012_tests.sql', 'ALL 0012 TESTS PASSED'], ['0015_tests.sql', 'ALL 0015 TESTS PASSED'], ['0019_tests.sql', 'ALL 0019 TESTS PASSED'],
    ['0021_tests.sql', 'ALL 0021 TESTS PASSED'], ['0031_tests.sql', 'ALL 0031 TESTS PASSED']];
  const tests = async (label, files) => {
    for (const [file, ok] of files) await runTestFile(db, `${L}${file} (${label})`, file, ok);
  };
  await tests('before 0036', baseline);

  // c. apply 0036: only the planned lines move
  const numbers = [...NUMBERS_0025, '0027', '0026', '0028', '0029', '0031', '0030', '0032', '0033', '0034', '0036']
    .filter((n) => existsSync(path.join(supabaseDir, 'tests', `${n}_fingerprints.sql`)));
  const others = numbers.filter((n) => n !== '0036');
  const before = await printsOf(db, numbers);
  const dataBefore = await one(db, snapSql);
  if (!(await run(db, `${L}apply 0036_new_students_profile.sql`, migration))) return null;
  const after = await printsOf(db, numbers);
  const replaced = ['forms_fields_are_valid(', 'forms_template(', 'forms_check_answers(', 'forms_submit_core(',
    'prospects_from_submission(', 'prospects_list(', 'prospects_search(', 'prospects_get('];
  const sizeRule = 'form_submissions.form_submissions_size_check';
  const newRules = ['prospects.prospects_child_last_name_check', 'prospects.prospects_child_dob_check'];
  // 0009's "table" line of form_submissions with only the four columns 0036 leaves readable
  const staffColumns = ['created_at', 'form_id', 'id', 'location_code'];
  const onlyStaffColumns = (detail) => detail.replace(/ columns=(.*)$/, (whole, cols) =>
    ' columns=' + cols.split(',').filter((c) => staffColumns.includes(c.split(':')[0])).join(','));
  const parts = (line) => line.split('  ');
  const wrong = [];
  const moved = {};   // fingerprint file number -> the planned items that moved
  for (const n of others) {
    const f = `${n}_fingerprints.sql`;
    const gone = before[f].filter((line) => !after[f].includes(line));
    const added = after[f].filter((line) => !before[f].includes(line));
    for (const g of gone) {
      const [kind, item, detail] = parts(g);
      const twin = added.find((a) => parts(a)[0] === kind && parts(a)[1] === item);
      if (kind === 'function' && replaced.some((r) => item.startsWith(r)) && twin && parts(twin)[2].slice(32) === detail.slice(32)) {
        (moved[n] ??= []).push(item);   // the body md5 moved, nothing else
      } else if (kind === 'constraint' && item === sizeRule && twin && detail.includes('<= 2000)')
                 && parts(twin)[2] === detail.replace('<= 2000)', '<= 4000)')) {
        (moved[n] ??= []).push(item);   // 2000 -> 4000, nothing else
      } else if (kind === 'table' && item === 'form_submissions' && twin && detail.includes(' columns=answers:')
                 && parts(twin)[2] === onlyStaffColumns(detail) && parts(twin)[2].split(' columns=')[1].split(',').length === 4) {
        (moved[n] ??= []).push(item);   // the readable columns: 0009's 15 -> the 4, the rest of the line the same
      } else {
        wrong.push(`${n}: ${g}${twin ? ` -> ${twin}` : ' (gone)'}`);
      }
    }
    for (const a of added) {
      const [kind, item] = parts(a);
      if (gone.some((g) => parts(g)[0] === kind && parts(g)[1] === item)) continue;   // a twin, judged above
      if (kind === 'constraint' && newRules.includes(item)) (moved[n] ??= []).push(item);
      else wrong.push(`${n}: added ${a}`);
    }
  }
  const expected = {
    '0009': ['forms_fields_are_valid(', 'forms_template(', 'forms_check_answers(', 'forms_submit_core(', sizeRule, 'form_submissions'],
    '0012': ['prospects_from_submission(', 'prospects_list(', 'prospects_search(', 'prospects_get(', ...newRules],
    '0031': ['forms_submit_core('],
  };
  for (const [n, items] of Object.entries(expected)) {
    const got = moved[n] ?? [];
    if (got.length !== items.length || !items.every((x) => got.some((g) => g.startsWith(x)))) {
      wrong.push(`${n}: planned ${items.join(', ')} - moved ${got.join(', ') || 'nothing'}`);
    }
  }
  for (const n of Object.keys(moved)) if (!expected[n]) wrong.push(`${n}: moved ${moved[n].join(', ')}`);
  record(`${L}fingerprints: exactly the planned lines moved (the 8 functions' body md5 in 0009 / 0012 / 0031, 0009's size rule 2000 -> 4000 and form_submissions' readable columns 15 -> 4, 0012's 2 new prospects rules); everything else byte-identical`,
    wrong.length === 0, wrong.join('; ') || `${others.length} files`);
  // nothing the app runs reads form_submissions with the app's own rights: no table rule (policy) or
  // view mentions it, and no security-invoker function the app may call does (definer functions run
  // as their owner, so the narrower read rights don't touch them)
  const relies = (await db.query(`
    select 'policy ' || p.tablename || '.' || p.policyname as what from pg_policies p
     where coalesce(p.qual, '') || coalesce(p.with_check, '') like '%form_submissions%'
    union all
    select 'view ' || v.schemaname || '.' || v.viewname from pg_views v
     where v.schemaname not in ('pg_catalog', 'information_schema') and v.definition like '%form_submissions%'
    union all
    select 'view ' || m.schemaname || '.' || m.matviewname from pg_matviews m where m.definition like '%form_submissions%'
    union all
    select 'security-invoker function ' || p.oid::regprocedure::text
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname not in ('pg_catalog', 'information_schema') and not p.prosecdef
       and p.prosrc like '%form_submissions%' and has_function_privilege('authenticated', p.oid, 'EXECUTE')`)).rows.map((r) => r.what);
  record(`${L}nothing the app runs reads form_submissions with its own rights (no policy, view or app-callable security-invoker function mentions it)`,
    relies.length === 0, relies.join(', '));
  const prints36 = after['0036_fingerprints.sql'];
  const fn = (name) => prints36.find((l) => l.startsWith(`function  ${name}(`)) || '';
  const tail = (definer, rights) => ` definer=${definer} settings=search_path="" owner=postgres rights=${rights}`;
  record(`${L}0036 fingerprints: forms_fields_are_valid, forms_template, forms_check_answers, forms_submit_core are security invoker, search_path="", for nobody`,
    ['forms_fields_are_valid', 'forms_template', 'forms_check_answers', 'forms_submit_core']
      .every((x) => fn(x).endsWith(tail('false', 'postgres:EXECUTE'))),
    ['forms_fields_are_valid', 'forms_template', 'forms_check_answers', 'forms_submit_core'].map(fn).join(' | '));
  record(`${L}0036 fingerprints: the trigger prospects_from_submission is security definer for nobody; prospects_list / search / get security definer for authenticated only`,
    fn('prospects_from_submission').endsWith(tail('true', 'postgres:EXECUTE'))
      && ['prospects_list', 'prospects_search', 'prospects_get'].every((x) => fn(x).endsWith(tail('true', 'authenticated:EXECUTE,postgres:EXECUTE'))),
    ['prospects_from_submission', 'prospects_list', 'prospects_search', 'prospects_get'].map(fn).join(' | '));
  const rowOf = (kind, item) => prints36.find((l) => l.startsWith(`${kind}  ${item}  `)) || '';
  record(`${L}0036 fingerprints: the two columns (nullable, readable by nobody) and the three rules`,
    rowOf('column', 'prospects.child_last_name') === 'column  prospects.child_last_name  text notnull=false rights='
      && rowOf('column', 'prospects.child_dob') === 'column  prospects.child_dob  date notnull=false rights='
      && rowOf('constraint', sizeRule).includes('(answers)::text) <= 20000)') && rowOf('constraint', sizeRule).includes('(children)::text) <= 4000)')
      && rowOf('constraint', newRules[0]).includes('child_last_name IS NULL') && rowOf('constraint', newRules[0]).includes('calendar_text_is_valid(child_last_name, 40)')
      && rowOf('constraint', newRules[1]).includes('child_dob IS NULL') && rowOf('constraint', newRules[1]).includes("'1900-01-01'::date")
      && rowOf('constraint', newRules[1]).includes("'2100-01-01'::date") && prints36.length === 8 * 2 + 2 + 3 + 1,
    prints36.filter((l) => !l.startsWith('function')).join(' | '));
  record(`${L}0036 fingerprints: form_submissions keeps RLS and its owner-only table rights; the app may read only id, form_id, location_code, created_at`,
    rowOf('table', 'form_submissions').startsWith('table  form_submissions  rls=true grants=postgres:')
      && !rowOf('table', 'form_submissions').includes('authenticated:SELECT')
      && rowOf('table', 'form_submissions').endsWith(' columns=' + staffColumns.map((c) => `${c}:authenticated=r/postgres`).join(',')),
    rowOf('table', 'form_submissions'));
  const applied = await pre();
  record(`${L}[pre-apply check] after 0036: 2 / true / 4 / 8 / 0 / 0 / 0 / 0`,
    applied.new_columns === 2 && applied.size_rule_4000 === true && applied.staff_submission_columns === 4
      && applied.replaced_found === 8 && applied.replaced_as_tested === 0
      && applied.forms_with_address === 0 && applied.signups_over_2000 === 0 && applied.prospects_with_new_details === 0,
    JSON.stringify(applied));
  record(`${L}0036 wrote nothing: the forms, the sign-up from before 0036, its prospects and both histories are unchanged`,
    dataBefore === (await one(db, snapSql)));
  record(`${L}the sign-up from before 0036: both prospects with no last name or date of birth, still version 1`,
    (await one(db, `select count(*)::int from public.prospects p join public.form_submissions s on s.id = p.submission_id
                      where s.parent_name = 'Pat Zzbefore' and p.child_last_name is null and p.child_dob is null and p.version = 1`)) === 2);

  // d. the tests; the form made before 0036 takes both child shapes (rolled back)
  await tests('after 0036', [['0036_tests.sql', 'ALL 0036 TESTS PASSED'], ...baseline]);
  let shapes = null;
  try {
    await db.exec('begin;');
    shapes = (await db.query(`
      select public.forms_submit_core(f.id, gen_random_uuid(), 1,
               '{"parent_name": "Pat Zzbefore", "parent_phone": "(508) 555-0177", "parent_email": "pat.zz@example.com", "waiver": true}',
               '[{"first_name": "Una", "age": 6}]', '[]', ${SIG}, 'staff', 'PGlite') ->> 'status' as old_shape,
             public.forms_submit_core(f.id, gen_random_uuid(), 1,
               '{"parent_name": "Pat Zzbefore", "parent_phone": "(508) 555-0177", "parent_email": "pat.zz@example.com", "waiver": true}',
               jsonb_build_array(jsonb_build_object('first_name', 'Una', 'last_name', 'Zzbefore',
                                                    'dob', to_char(public.schedule_today() - interval '6 years', 'YYYY-MM-DD'))),
               '[]', ${SIG}, 'staff', 'PGlite') ->> 'status' as new_shape
        from public.forms f where f.slug = 'zz-before-0036'`)).rows[0];
  } catch (error) {
    shapes = { error: error.message };
  } finally {
    await db.exec('rollback;').catch(() => {});
  }
  record(`${L}the form made before 0036 (no Address question) takes both child shapes`,
    shapes?.old_shape === 'ok' && shapes?.new_shape === 'ok', JSON.stringify(shapes));

  // e. re-run safety
  const dataAfter = await one(db, snapSql);
  await run(db, `${L}apply 0036 a SECOND time (re-run safety)`, migration);
  const again = await printsOf(db, numbers);
  const movedAgain = numbers.filter((n) => JSON.stringify(after[`${n}_fingerprints.sql`]) !== JSON.stringify(again[`${n}_fingerprints.sql`]));
  record(`${L}0036 re-run: no fingerprint change, no row or history change`,
    movedAgain.length === 0 && (await one(db, snapSql)) === dataAfter, movedAgain.join(', '));

  // f. Undo 0036, as SETUP.md 0036e has it: paste the undo file it names
  const setup = read('SETUP.md').replace(/\r\n/g, '\n');
  const at = setup.search(/^### 0036e\. Undo 0036/m);
  const undoFile = 'manual/0036u_undo_new_students_profile.sql';
  const undoSql = read('manual', '0036u_undo_new_students_profile.sql');
  if (at < 0 || !setup.slice(at, at + 2000).includes(`supabase/${undoFile}`)) {
    record(`${L}[undo 0036] SETUP.md has "### 0036e. Undo 0036" naming supabase/${undoFile}`, false, 'heading or file name missing');
  } else {
    // f1. planted (and rolled back): a Walk-in form - it has the Address question - and two new-shape
    // families through it, one of them six children with 40-letter names in a 4-byte alphabet.
    // The undo file runs without its own begin / commit inside that transaction.
    const inner = undoSql.replace(/\r\n/g, '\n').replace(/^begin;$/m, '').replace(/^commit;$/m, '');
    let planted = null;
    let refusal = '';
    try {
      await db.exec('begin;');
      await db.exec(`
        do $$
        declare
          v_f uuid;
          v_r jsonb;
          v_fields jsonb;
          v_ans jsonb := jsonb_build_object('parent_name', 'Plant Zzfamily', 'parent_phone', '(508) 555-0188',
                           'parent_email', 'plant.zz@example.com', 'waiver', true,
                           'address', jsonb_build_object('street', '1 Elm St', 'city', 'Shrewsbury', 'state', 'MA', 'zip', '01545'));
          v_dob text := to_char(public.schedule_today() - interval '7 years', 'YYYY-MM-DD');
        begin
          select jsonb_agg(case when e ->> 'id' = 'waiver' then jsonb_set(e, '{text}', '"Our wording."') else e end order by n)
            into v_fields from jsonb_array_elements(public.forms_template('walk_in')) with ordinality as t(e, n);
          insert into public.forms (location_code, name, slug, kind, status, draft, published, published_version, settings)
          values ('shrewsbury', 'zz plant 0036', 'zz-plant-0036', 'walk_in', 'live', v_fields, v_fields, 1, ${SETTINGS})
          returning id into v_f;
          v_r := public.forms_submit_core(v_f, gen_random_uuid(), 1, v_ans,
                   jsonb_build_array(jsonb_build_object('first_name', 'Pia', 'last_name', 'Zzplant', 'dob', v_dob),
                                     jsonb_build_object('first_name', 'Rex', 'last_name', 'Zzplant', 'dob', v_dob)),
                   '[]', ${SIG}, 'staff', 'PGlite plant');
          if v_r ->> 'status' is distinct from 'ok' then raise exception 'plant 1: %', v_r; end if;
          v_r := public.forms_submit_core(v_f, gen_random_uuid(), 1, v_ans,
                   (select jsonb_agg(jsonb_build_object('first_name', repeat(chr(131072), 40), 'last_name', repeat(chr(131072), 40), 'dob', v_dob))
                      from generate_series(1, 6)),
                   '[]', ${SIG}, 'staff', 'PGlite plant');
          if v_r ->> 'status' is distinct from 'ok' then raise exception 'plant 2: %', v_r; end if;
        end
        $$;`);
      planted = await pre();
      try {
        await db.exec(inner);
      } catch (error) {
        refusal = error.message;
      }
    } catch (error) {
      planted = { error: error.message };
    } finally {
      await db.exec('rollback;').catch(() => {});
    }
    record(`${L}[undo 0036] planted: the pre-apply check counts 1 form with an Address question, 1 sign-up over 2000 bytes, 8 prospects with new details`,
      planted?.forms_with_address === 1 && planted?.signups_over_2000 === 1 && planted?.prospects_with_new_details === 8, JSON.stringify(planted));
    record(`${L}[undo 0036] ... and the undo file refuses with the three counts ("0036 undo refused")`,
      refusal.includes('0036 undo refused: 1 form(s)') && refusal.includes('1 sign-up(s)') && refusal.includes('8 prospect(s)'), refusal || 'no error');
    const rolledBack = await pre();
    record(`${L}[undo 0036] the planted rows were rolled back, 0036 is still applied`,
      JSON.stringify(rolledBack) === JSON.stringify(applied), JSON.stringify(rolledBack));

    // f2. the undo on the clean database
    if (await run(db, `${L}[undo 0036] paste ${undoFile}`, undoSql)) {
      const undone = await printsOf(db, others);
      const back = others.filter((n) => JSON.stringify(before[`${n}_fingerprints.sql`]) !== JSON.stringify(undone[`${n}_fingerprints.sql`]));
      record(`${L}[undo 0036] every fingerprint file equals the one before 0036`,
        back.length === 0, back.length ? `differ: ${back.join(', ')}` : `${others.length} files`);
      const undonePre = await pre();
      record(`${L}[undo 0036] the pre-apply check answers as before 0036`, JSON.stringify(undonePre) === JSON.stringify(ready),
        JSON.stringify(undonePre));
      record(`${L}[undo 0036] the forms, the sign-up from before 0036, its prospects and both histories are as before 0036`,
        dataBefore === (await one(db, snapSql)));
      await tests('after the undo', baseline);
      await run(db, `${L}[undo 0036] paste ${undoFile} a SECOND time`, undoSql);
      const undoneAgain = await printsOf(db, others);
      record(`${L}[undo 0036] a second undo changes nothing`,
        others.every((n) => JSON.stringify(undone[`${n}_fingerprints.sql`]) === JSON.stringify(undoneAgain[`${n}_fingerprints.sql`])));
      if (await run(db, `${L}[undo 0036] apply 0036 again (redo)`, migration)) {
        const redo = await fingerprints(db, '0036_fingerprints.sql');
        record(`${L}[undo 0036] after the redo the 0036 fingerprints equal the tested ones`, JSON.stringify(redo) === JSON.stringify(prints36));
        await tests('after the redo', [['0036_tests.sql', 'ALL 0036 TESTS PASSED']]);
      }
    }
  }
  await db.close().catch(() => {});
  return prints36;
}

// =====================================================================
// step0041: Star event end time (0041, rulebook v0.520)
// ---------------------------------------------------------------------
// On its OWN fresh database built in the production order with every
// live migration (liveOrderTo0025, then 0027, 0026, 0028, 0029, 0031,
// 0030, 0032, 0033, 0034 and 0036 - each only if its file is on this
// branch):
//   a. 0041_fingerprints.sql and 0041_preapply_check.sql are
//      connector-safe (no "delete" / "drop"); a Star event made through
//      star_add_event BEFORE 0041 is kept; the pre-apply check (SETUP
//      0041a) answers 0 / 2 / 0 / 5 / 5 / 0 / 0
//   b. the Star tests (0006, 0023, 0028) pass BEFORE 0041 (the baseline)
//   c. apply 0041: in every other fingerprint file ONLY these lines move -
//      and each of them does: in 0006's file star_add_event and
//      star_update_event (one more input, p_end_time; the rest of the
//      line apart from the body md5 the same), star_public_answer,
//      star_home_today and star_public_event (body md5 only) and the
//      star_events table line (its column rights gain
//      end_time>authenticated:SELECT, nothing else); in 0023's file
//      star_update_event (one more input, body md5). 0041's own rows as
//      designed. 0041 writes nothing: the event from before keeps its
//      version, an empty end time, and no history row is added. The
//      pre-apply check answers 1 / 0 / 2 / 5 / 0 / 5 / 0
//   d. 0041_tests.sql, then the baseline tests again; the live app's
//      calls (by NAME, without p_end_time) as a signed-in admin still work
//   e. 0041 applied a SECOND time: no fingerprint, row or history change
//   f. the Undo of SETUP.md 0041f (the file it names,
//      supabase/manual/0041u_undo_star_end_time.sql):
//        - with an event with an end time planted (in a transaction rolled
//          back afterwards) the pre-apply check counts it and the undo
//          refuses with its message, changing nothing
//        - on the clean database: every fingerprint file equals the one
//          before 0041; the pre-apply check answers as before; the event
//          from before is as it was; the baseline tests pass; a second
//          undo changes nothing; then 0041 again -> the tested
//          fingerprints, 0041_tests.sql passes
// Run only this step with   node run.mjs --only-step0041
// =====================================================================
async function step0041() {
  const L = '[0041] ';
  const preSql = read('tests', '0041_preapply_check.sql');
  const migration = read('migrations', '0041_star_end_time.sql');
  const unsafe = [['tests', '0041_fingerprints.sql'], ['tests', '0041_preapply_check.sql']]
    .filter(([dir, file]) => /delete|drop/i.test(read(dir, file))).map(([, file]) => file);
  record(`${L}0041_fingerprints.sql and 0041_preapply_check.sql contain neither "delete" nor "drop" (connector-safe)`,
    unsafe.length === 0, unsafe.join(', '));
  const db = await buildBase(L);
  if (!db) return null;
  if (!(await liveOrderTo0025(db, L))) return null;
  for (const [label, file] of [['0027 (camps edit guard)', '0027_camps_edit_guard.sql'],
    ['0026 (Finance: Black Belt payments)', '0026_finance_black_belt.sql'], ['0028 (Star start times)', '0028_star_start_times.sql'],
    ['0029 (Finance reminder every 5 minutes)', '0029_finance_reminder_5min.sql'], ['0031 (class ages)', '0031_class_ages.sql'],
    ['0030 (Color Belt design review)', '0030_color_belt_review.sql'], ['0032 (Black Belt design review)', '0032_black_belt_review.sql'],
    ['0033 (Camps design review)', '0033_camps_design_review.sql'], ['0034 (Black Belt history ids)', '0034_black_belt_history_ids.sql'],
    ['0036 (New students profile)', '0036_new_students_profile.sql']]) {
    if (!existsSync(path.join(supabaseDir, 'migrations', file))) continue;
    if (!(await run(db, `${L}apply ${label}`, read('migrations', file)))) return null;
  }

  // As the pretend admin (a fresh unlocked session), inside one statement: `body` is plpgsql
  const asAdmin41 = (body) => `
    do $$
    declare
      v_s uuid := gen_random_uuid();
      v_r jsonb;
      v_today date := public.testing_today();   -- read as postgres, before the role switch
    begin
      insert into auth.sessions (id, user_id) values (v_s, '${ADMIN_UID}');
      insert into public.session_unlock (session_id, staff_id, unlocked_until) values (v_s, '${ADMIN_UID}', now() + interval '30 minutes');
      perform set_config('request.jwt.claims', jsonb_build_object('sub', '${ADMIN_UID}', 'role', 'authenticated', 'session_id', v_s,
        'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint - 60)))::text, true);
      set local role authenticated;
      ${body}
      reset role;
      perform set_config('request.jwt.claims', '', true);
    end
    $$;`;

  // a. a Star event made BEFORE 0041, the live app's way (by name, 7 inputs)
  if (!(await run(db, `${L}a Star event made before 0041 (star_add_event by name, as the live app)`, asAdmin41(`
      v_r := public.star_add_event(p_name => 'zz before 0041', p_testing_date => v_today + 20, p_start_time => '10:00',
                                   p_where_code => 'worcester', p_registration_open => true, p_auto_close_on => null, p_note => null);
      if v_r ->> 'status' is distinct from 'ok' then raise exception 'event before 0041: %', v_r; end if;`)))) return null;
  // the Star events (without end_time, so it compares across 0041 and its undo) and the history size, as one md5
  const snapSql = `select md5(
       coalesce((select string_agg((to_jsonb(e) - 'end_time')::text, ',' order by e.id) from public.star_events e), '')
    || (select count(*) from public.change_log)::text)`;
  const pre = async () => (await db.query(preSql)).rows[0];
  const answer = (r) => r ? [r.end_time_column, r.old_signatures, r.new_signatures, r.replaced_found, r.replaced_as_tested,
    r.applied_as_tested, r.events_with_end_time].join(' / ') : 'none';
  const ready = await pre();
  record(`${L}[pre-apply check] before 0041: 0 / 2 / 0 / 5 / 5 / 0 / 0 (nothing of 0041, the five functions as tested)`,
    answer(ready) === '0 / 2 / 0 / 5 / 5 / 0 / 0', answer(ready));

  // b. the baseline tests
  const baseline = [['0006_tests.sql', 'ALL 0006 TESTS PASSED'], ['0023_tests.sql', 'ALL 0023 TESTS PASSED'],
    ['0028_tests.sql', 'ALL 0028 TESTS PASSED']];
  const tests = async (label, files) => {
    for (const [file, ok] of files) await runTestFile(db, `${L}${file} (${label})`, file, ok);
  };
  await tests('before 0041', baseline);

  // c. apply 0041: only the planned lines move
  const numbers = [...NUMBERS_0025, '0027', '0026', '0028', '0029', '0031', '0030', '0032', '0033', '0034', '0036', '0041']
    .filter((n) => existsSync(path.join(supabaseDir, 'tests', `${n}_fingerprints.sql`)));
  const others = numbers.filter((n) => n !== '0041');
  const before = await printsOf(db, numbers);
  const dataBefore = await one(db, snapSql);
  if (!(await run(db, `${L}apply 0041_star_end_time.sql`, migration))) return null;
  const after = await printsOf(db, numbers);
  const parts = (line) => line.split('  ');
  const fnName = (item) => item.slice(0, item.indexOf('('));
  const bodyOnly = ['star_public_answer', 'star_home_today', 'star_public_event'];
  const newInput = ['star_add_event', 'star_update_event'];
  const END = 'end_time>authenticated:SELECT';
  // 0006's table line of star_events without the end_time column right
  const withoutEnd = (detail) => detail.replace(/ columns=(.*)$/, (whole, cols) =>
    ' columns=' + cols.split(',').filter((c) => c !== END).join(','));
  const wrong = [];
  const moved = {};   // fingerprint file number -> the planned items that moved
  for (const n of others) {
    const f = `${n}_fingerprints.sql`;
    const gone = before[f].filter((line) => !after[f].includes(line));
    const added = after[f].filter((line) => !before[f].includes(line));
    for (const g of gone) {
      const [kind, item, detail] = parts(g);
      if (kind === 'function' && bodyOnly.includes(fnName(item))) {
        const twin = added.find((a) => parts(a)[0] === kind && parts(a)[1] === item);
        if (twin && parts(twin)[2].slice(32) === detail.slice(32)) { (moved[n] ??= []).push(fnName(item)); continue; }
        wrong.push(`${n}: ${g}${twin ? ` -> ${twin}` : ' (gone)'}`);
      } else if (kind === 'function' && newInput.includes(fnName(item))) {
        // the same function with p_end_time added as its last input; apart from the body md5 the same line
        const twin = added.find((a) => parts(a)[0] === kind && parts(a)[1] === item.replace(/\)$/, ', p_end_time time without time zone)'));
        if (twin && parts(twin)[2].slice(32) === detail.slice(32)) { (moved[n] ??= []).push(fnName(item)); continue; }
        wrong.push(`${n}: ${g}${twin ? ` -> ${twin}` : ' (gone, no twin with p_end_time)'}`);
      } else if (kind === 'table' && item === 'star_events') {
        const twin = added.find((a) => parts(a)[0] === kind && parts(a)[1] === item);
        if (twin && parts(twin)[2].includes(END) && withoutEnd(parts(twin)[2]) === detail && !detail.includes(END)) {
          (moved[n] ??= []).push('star_events'); continue;
        }
        wrong.push(`${n}: ${g}${twin ? ` -> ${twin}` : ' (gone)'}`);
      } else {
        wrong.push(`${n}: ${g} (moved)`);
      }
    }
    for (const a of added) {
      const [kind, item] = parts(a);
      const twinned = gone.some((g) => parts(g)[0] === kind
        && (parts(g)[1] === item || parts(g)[1].replace(/\)$/, ', p_end_time time without time zone)') === item));
      if (!twinned) wrong.push(`${n}: added ${a}`);
    }
  }
  const expected = { '0006': [...newInput, ...bodyOnly, 'star_events'], '0023': ['star_update_event'] };
  for (const [n, items] of Object.entries(expected)) {
    const got = moved[n] ?? [];
    if (got.length !== items.length || !items.every((x) => got.includes(x))) {
      wrong.push(`${n}: planned ${items.join(', ')} - moved ${got.join(', ') || 'nothing'}`);
    }
  }
  for (const n of Object.keys(moved)) if (!expected[n]) wrong.push(`${n}: moved ${moved[n].join(', ')}`);
  record(`${L}fingerprints: exactly the planned lines moved (0006: star_add_event / star_update_event + p_end_time, star_public_answer / star_home_today / star_public_event body md5, star_events + end_time read right; 0023: star_update_event + p_end_time); everything else byte-identical`,
    wrong.length === 0, wrong.join('; ') || `${others.length} files`);
  const prints41 = after['0041_fingerprints.sql'];
  const fn = (name) => prints41.find((l) => l.startsWith(`function  ${name}(`)) || '';
  const tail = (lang, vol, definer, rights) =>
    ` lang=${lang} volatility=${vol} returns=jsonb definer=${definer} settings=search_path="" owner=postgres rights=${rights}`;
  record(`${L}0041 fingerprints: star_add_event / star_update_event end with p_end_time, security definer, signed-in staff only; star_home_today the same`,
    fn('star_add_event').includes(', p_note text, p_end_time time without time zone)  ')
      && fn('star_update_event').includes(', p_note text, p_end_time time without time zone)  ')
      && ['star_add_event', 'star_update_event', 'star_home_today']
        .every((x) => fn(x).endsWith(tail('plpgsql', 'v', 'true', 'authenticated:EXECUTE,postgres:EXECUTE'))),
    ['star_add_event', 'star_update_event', 'star_home_today'].map(fn).join(' | '));
  record(`${L}0041 fingerprints: star_public_event for star_registrar only (definer, stable); star_public_answer for nobody (sql, stable, not definer)`,
    fn('star_public_event').endsWith(tail('plpgsql', 's', 'true', 'postgres:EXECUTE,star_registrar:EXECUTE'))
      && fn('star_public_answer').endsWith(tail('sql', 's', 'false', 'postgres:EXECUTE')),
    ['star_public_event', 'star_public_answer'].map(fn).join(' | '));
  const rowOf = (kind, item) => prints41.find((l) => l.startsWith(`${kind}  ${item}  `)) || '';
  record(`${L}0041 fingerprints: the column (time, may be empty, signed-in staff read it) and its table rule; 7 rows`,
    rowOf('column', 'star_events.end_time') === 'column  star_events.end_time  time without time zone notnull=false rights=authenticated:SELECT'
      && rowOf('constraint', 'star_events.star_events_end_time_check').includes('end_time IS NULL')
      && rowOf('constraint', 'star_events.star_events_end_time_check').includes('star_start_time_is_valid(end_time)')
      && rowOf('constraint', 'star_events.star_events_end_time_check').includes('end_time > start_time')
      && prints41.length === 7,
    prints41.filter((l) => !l.startsWith('function')).join(' | '));
  const applied = await pre();
  record(`${L}[pre-apply check] after 0041: 1 / 0 / 2 / 5 / 0 / 5 / 0`, answer(applied) === '1 / 0 / 2 / 5 / 0 / 5 / 0', answer(applied));
  record(`${L}0041 wrote nothing: the event from before 0041 is unchanged (end time empty, same version) and no history row was added`,
    dataBefore === (await one(db, snapSql))
      && (await one(db, `select count(*)::int from public.star_events e where e.name = 'zz before 0041' and e.end_time is null and e.version = 1`)) === 1);

  // d. the tests; the live app's calls (by name, without p_end_time) still work
  await tests('after 0041', [['0041_tests.sql', 'ALL 0041 TESTS PASSED'], ...baseline]);
  let oldApp = '';
  try {
    await db.exec('begin;');
    await db.exec(asAdmin41(`
      v_r := public.star_add_event(p_name => 'zz old app 0041', p_testing_date => v_today + 21, p_start_time => '09:00',
                                   p_where_code => 'shrewsbury', p_registration_open => false, p_auto_close_on => null, p_note => null);
      if v_r ->> 'status' is distinct from 'ok' then raise exception 'old app add: %', v_r; end if;
      v_r := public.star_update_event(p_event_id => (v_r ->> 'id')::uuid, p_expected_version => 1, p_name => 'zz old app 0041 b',
                                      p_testing_date => v_today + 21, p_start_time => '09:15', p_where_code => 'shrewsbury',
                                      p_auto_close_on => null, p_note => null);
      if v_r is distinct from '{"status": "ok", "version": 2}'::jsonb then raise exception 'old app update: %', v_r; end if;`));
    oldApp = await one(db, `select coalesce(left(e.start_time::text, 5), '') || ' ' || coalesce(e.end_time::text, 'no end')
                              from public.star_events e where e.name = 'zz old app 0041 b'`);
  } catch (error) {
    oldApp = error.message;
  } finally {
    await db.exec('rollback;').catch(() => {});
  }
  record(`${L}the live app's Add event and Edit event (by name, no p_end_time) still work and save no end time`,
    oldApp === '09:15 no end', oldApp);

  // e. re-run safety
  const dataAfter = await one(db, snapSql);
  await run(db, `${L}apply 0041 a SECOND time (re-run safety)`, migration);
  const again = await printsOf(db, numbers);
  const movedAgain = numbers.filter((n) => JSON.stringify(after[`${n}_fingerprints.sql`]) !== JSON.stringify(again[`${n}_fingerprints.sql`]));
  record(`${L}0041 re-run: no fingerprint change, no row or history change`,
    movedAgain.length === 0 && (await one(db, snapSql)) === dataAfter, movedAgain.join(', '));

  // f. Undo 0041, as SETUP.md 0041f has it: paste the undo file it names
  const setup = read('SETUP.md').replace(/\r\n/g, '\n');
  const at = setup.search(/^### 0041f\. Undo 0041/m);
  const undoFile = 'manual/0041u_undo_star_end_time.sql';
  const undoSql = read('manual', '0041u_undo_star_end_time.sql');
  if (at < 0 || !setup.slice(at, at + 2000).includes(`supabase/${undoFile}`)) {
    record(`${L}[undo 0041] SETUP.md has "### 0041f. Undo 0041" naming supabase/${undoFile}`, false, 'heading or file name missing');
  } else {
    // f1. an event WITH an end time (made through star_add_event as the admin) blocks the undo;
    // the undo file runs without its own begin / commit inside a transaction that is rolled back
    const inner = undoSql.replace(/\r\n/g, '\n').replace(/^begin;$/m, '').replace(/^commit;$/m, '');
    let planted = null;
    let refusal = '';
    try {
      await db.exec('begin;');
      await db.exec(asAdmin41(`
        v_r := public.star_add_event('zz plant 0041', v_today + 9, '10:00', 'worcester', false, null, null, '12:00');
        if v_r ->> 'status' is distinct from 'ok' then raise exception 'plant: star_add_event %', v_r; end if;`));
      planted = await pre();
      try {
        await db.exec(inner);
      } catch (error) {
        refusal = error.message;
      }
    } catch (error) {
      planted = { error: error.message };
    } finally {
      await db.exec('rollback;').catch(() => {});
    }
    record(`${L}[undo 0041] a planted event with an end time: the pre-apply check counts it (events_with_end_time = 1)`,
      planted?.events_with_end_time === 1, JSON.stringify(planted));
    record(`${L}[undo 0041] ... and the undo file refuses ("0041 undo refused: 1 Star event(s)")`,
      refusal.includes('0041 undo refused: 1 Star event(s)'), refusal || 'no error');
    const rolledBack = await pre();
    record(`${L}[undo 0041] the planted event was rolled back, 0041 is still applied`,
      answer(rolledBack) === answer(applied), answer(rolledBack));

    // f2. the undo on the clean database
    if (await run(db, `${L}[undo 0041] paste ${undoFile}`, undoSql)) {
      const undone = await printsOf(db, numbers);
      const back = numbers.filter((n) => JSON.stringify(before[`${n}_fingerprints.sql`]) !== JSON.stringify(undone[`${n}_fingerprints.sql`]));
      record(`${L}[undo 0041] every fingerprint file equals the one before 0041 (0041's own file lists the five older functions again)`,
        back.length === 0, back.length ? `differ: ${back.join(', ')}` : `${numbers.length} files`);
      const undonePre = await pre();
      record(`${L}[undo 0041] the pre-apply check answers as before 0041 (0 / 2 / 0 / 5 / 5 / 0 / 0)`,
        answer(undonePre) === answer(ready), answer(undonePre));
      record(`${L}[undo 0041] no end_time column, no table rule left; the event from before 0041 and the history are as before 0041`,
        (await one(db, `select count(*)::int from pg_attribute a where a.attrelid = 'public.star_events'::regclass and a.attname = 'end_time'`)) === 0
          && (await one(db, `select count(*)::int from pg_constraint c where c.conname = 'star_events_end_time_check'`)) === 0
          && dataBefore === (await one(db, snapSql)));
      await tests('after the undo', baseline);
      await run(db, `${L}[undo 0041] paste ${undoFile} a SECOND time`, undoSql);
      const undoneAgain = await printsOf(db, numbers);
      record(`${L}[undo 0041] a second undo changes nothing`,
        numbers.every((n) => JSON.stringify(undone[`${n}_fingerprints.sql`]) === JSON.stringify(undoneAgain[`${n}_fingerprints.sql`])));
      if (await run(db, `${L}[undo 0041] apply 0041 again (redo)`, migration)) {
        const redo = await fingerprints(db, '0041_fingerprints.sql');
        record(`${L}[undo 0041] after the redo the 0041 fingerprints equal the tested ones`, JSON.stringify(redo) === JSON.stringify(prints41));
        await tests('after the redo', [['0041_tests.sql', 'ALL 0041 TESTS PASSED']]);
      }
    }
  }
  await db.close().catch(() => {});
  return prints41;
}

// =====================================================================
const MD5_0031_DUPLICATE = '0643ad3576c681daed5e3175f41284bb';   // forms_duplicate, 0031 section 11 (the pre-apply check names it)
const MD5_0042_COPY = '72c5c12845b75462313c8364237a403b';        // forms_copy_to_school, 0042

async function step0042() {
  const L = '[0042] ';
  const preSql = read('tests', '0042_preapply_check.sql');
  const migration = read('migrations', '0042_forms_copy_to_school.sql');
  const unsafe = [['migrations', '0042_forms_copy_to_school.sql'], ['tests', '0042_fingerprints.sql'], ['tests', '0042_preapply_check.sql']]
    .filter(([dir, file]) => /delete|drop/i.test(read(dir, file))).map(([, file]) => file);
  record(`${L}0042's migration, fingerprints and pre-apply check contain neither "delete" nor "drop" (connector-safe)`,
    unsafe.length === 0, unsafe.join(', '));
  record(`${L}the pre-apply check names the md5s run.mjs checks (0031's forms_duplicate, 0042's forms_copy_to_school)`,
    preSql.includes(`'${MD5_0031_DUPLICATE}'`) && preSql.includes(`'${MD5_0042_COPY}'`));
  const db = await buildBase(L);
  if (!db) return null;
  if (!(await liveOrderTo0025(db, L))) return null;
  for (const [label, file] of [['0027 (camps edit guard)', '0027_camps_edit_guard.sql'],
    ['0026 (Finance: Black Belt payments)', '0026_finance_black_belt.sql'], ['0028 (Star start times)', '0028_star_start_times.sql'],
    ['0029 (Finance reminder every 5 minutes)', '0029_finance_reminder_5min.sql'], ['0031 (class ages)', '0031_class_ages.sql'],
    ['0030 (Color Belt design review)', '0030_color_belt_review.sql'], ['0032 (Black Belt design review)', '0032_black_belt_review.sql'],
    ['0033 (Camps design review)', '0033_camps_design_review.sql'], ['0034 (Black Belt history ids)', '0034_black_belt_history_ids.sql'],
    ['0036 (New students: last name, date of birth, Address)', '0036_new_students_profile.sql'],
    // live since 2026-11-05, before 0042: production's order (it touches only Star)
    ['0041 (Star event end time)', '0041_star_end_time.sql']]) {
    if (!existsSync(path.join(supabaseDir, 'migrations', file))) continue;
    if (!(await run(db, `${L}apply ${label}`, read('migrations', file)))) return null;
  }

  // One call as the signed-in admin (the session adminSession made); the login token is
  // set only for that call, so the test files never inherit it
  const asAdmin42 = async (sql, params = []) => {
    await db.query(`select set_config('request.jwt.claims', $1, false)`, [ADMIN_CLAIMS_0026()]);
    try {
      return await asAdmin(db, sql, params);
    } finally {
      await db.query(`select set_config('request.jwt.claims', '', false)`);
    }
  };

  // a. a Worcester Free class form made BEFORE 0042, with booking times, the app's way
  await adminSession(db);
  await db.query(`select set_config('request.jwt.claims', '', false)`);
  const classes = (await db.query(`select c.id from public.testing_classes c
      where c.location_code = 'worcester' and c.name in ('Little Tiger', 'White') order by c.name collate "C"`)).rows.map((r) => r.id);
  let made = null;
  let booked = null;
  try {
    made = await asAdmin42(`select public.forms_create('worcester', 'free_class', 'zz before 0042', 'zz-before-0042') as r`);
    booked = await asAdmin42(`select public.forms_set_booking($1::uuid, $2::integer, $3::jsonb, $4::jsonb, $5::jsonb) as r`, [
      made?.id, made?.version,
      JSON.stringify(classes.map((id) => ({ class_id: id, default_limit: 3, days_ahead: 14, min_hours_ahead: 3 }))),
      JSON.stringify([{ class_id: classes[1], weekday: 1, starts_at: '16:00', spot_limit: 2 }]),
      JSON.stringify([{ class_ids: classes, weekday: 3, starts_at: '17:00', spot_limit: 5 }])]);
  } catch (error) {
    booked = { error: error.message };
  }
  record(`${L}a form made before 0042 (Worcester, Free class) with booking times: Little Tiger and White offered, a time limit, the two taught together`,
    classes.length === 2 && made?.status === 'ok' && booked?.status === 'ok', JSON.stringify({ made, booked }));
  if (booked?.status !== 'ok') return null;
  const srcId = made.id;
  const pre = async () => (await db.query(preSql)).rows[0];
  const ready = await pre();
  record(`${L}[pre-apply check] before 0042: 0 / false / true / 2 (no copy function yet, forms_duplicate is 0031's, both schools)`,
    ready.copy_versions === 0 && ready.copy_is_0042 === false && ready.duplicate_is_0031 === true && ready.schools === 2,
    JSON.stringify(ready));

  // b. the baseline tests
  const baseline = [['0007_tests.sql', 'ALL 0007 TESTS PASSED'], ['0009_tests.sql', 'ALL 0009 TESTS PASSED'],
    ['0012_tests.sql', 'ALL 0012 TESTS PASSED'], ['0015_tests.sql', 'ALL 0015 TESTS PASSED'], ['0019_tests.sql', 'ALL 0019 TESTS PASSED'],
    ['0021_tests.sql', 'ALL 0021 TESTS PASSED'], ['0031_tests.sql', 'ALL 0031 TESTS PASSED'], ['0036_tests.sql', 'ALL 0036 TESTS PASSED']];
  const tests = async (label, files) => {
    for (const [file, ok] of files) await runTestFile(db, `${L}${file} (${label})`, file, ok);
  };
  await tests('before 0042', baseline);

  // c. apply 0042: only 0009's file gains the new function's two lines
  const numbers = [...NUMBERS_0025, '0027', '0026', '0028', '0029', '0031', '0030', '0032', '0033', '0034', '0036', '0042']
    .filter((n) => existsSync(path.join(supabaseDir, 'tests', `${n}_fingerprints.sql`)));
  const others = numbers.filter((n) => n !== '0042');
  const before = await printsOf(db, others);
  // everything 0042 could write, as one md5
  const snapSql = `select md5(
       coalesce((select string_agg(to_jsonb(f)::text, ',' order by f.id) from public.forms f), '')
    || coalesce((select string_agg(to_jsonb(o)::text, ',' order by o.id) from public.form_booking_offers o), '')
    || coalesce((select string_agg(to_jsonb(l)::text, ',' order by l.id) from public.form_booking_limits l), '')
    || coalesce((select string_agg(to_jsonb(g)::text, ',' order by g.id) from public.form_booking_group_limits g), '')
    || coalesce((select string_agg(to_jsonb(s)::text, ',' order by s.id) from public.form_submissions s), '')
    || (select count(*) from public.change_log)::text)`;
  const dataBefore = await one(db, snapSql);
  if (!(await run(db, `${L}apply 0042_forms_copy_to_school.sql`, migration))) return null;
  const after = await printsOf(db, numbers);
  const parts = (line) => line.split('  ');
  const ITEM = 'forms_copy_to_school(p_form_id uuid, p_location_code text)';
  const TAIL = ' definer=true settings=search_path="" owner=postgres rights=authenticated:EXECUTE,postgres:EXECUTE';
  const wrong = [];
  for (const n of others) {
    const f = `${n}_fingerprints.sql`;
    const gone = before[f].filter((line) => !after[f].includes(line));
    const added = after[f].filter((line) => !before[f].includes(line));
    if (gone.length) wrong.push(`${n}: moved or gone ${JSON.stringify(gone)}`);
    if (n === '0009') {
      const fnLine = added.find((a) => parts(a)[0] === 'function' && parts(a)[1] === ITEM);
      const kindLine = added.find((a) => parts(a)[0] === 'function-kind' && parts(a)[1] === ITEM);
      if (added.length !== 2 || !fnLine || !kindLine || parts(fnLine)[2] !== MD5_0042_COPY + TAIL
          || parts(kindLine)[2] !== 'volatility=v returns=jsonb') {
        wrong.push(`0009: added ${JSON.stringify(added)}`);
      }
    } else if (added.length) {
      wrong.push(`${n}: added ${JSON.stringify(added)}`);
    }
  }
  record(`${L}fingerprints: nothing moved; the only new lines are 0009's two for forms_copy_to_school (function: ${MD5_0042_COPY.slice(0, 8)}, definer, search_path="", postgres, authenticated + postgres; function-kind: volatile, jsonb); every other file byte-identical`,
    wrong.length === 0, wrong.join('; ') || `${others.length} files`);
  const prints42 = after['0042_fingerprints.sql'];
  record(`${L}0042 fingerprints: forms_copy_to_school plpgsql, volatile, security definer, search_path="", authenticated + postgres only`,
    prints42.length === 1 && prints42[0] === `function  ${ITEM}  ${MD5_0042_COPY} lang=plpgsql volatility=v returns=jsonb${TAIL}`,
    prints42.join(' | '));
  record(`${L}0042 wrote nothing (forms, booking rows, sign-ups, history unchanged)`, dataBefore === (await one(db, snapSql)));
  const applied = await pre();
  record(`${L}[pre-apply check] after 0042: 1 / true / true / 2`,
    applied.copy_versions === 1 && applied.copy_is_0042 === true && applied.duplicate_is_0031 === true && applied.schools === 2,
    JSON.stringify(applied));

  // d. the tests; then a copy of the form from a., made as the admin and KEPT (for the undo in f.)
  await tests('after 0042', [['0042_tests.sql', 'ALL 0042 TESTS PASSED'], ...baseline]);
  let kept = null;
  let keptRow = null;
  try {
    kept = await asAdmin42(`select public.forms_copy_to_school($1::uuid, 'shrewsbury') as r`, [srcId]);
    keptRow = (await db.query(`select k.location_code, k.status, k.name, k.slug, k.booking_key, k.kind,
        (select count(*)::int from public.form_booking_offers o where o.form_id = k.id) as offers,
        (select count(*)::int from public.form_booking_limits l where l.form_id = k.id) as limits,
        (select count(*)::int from public.form_booking_group_limits g where g.form_id = k.id) as groups,
        (select count(*)::int from public.form_booking_offers o where o.form_id = $2::uuid) as src_offers,
        (select count(*)::int from public.form_booking_limits l where l.form_id = $2::uuid) as src_limits,
        (select count(*)::int from public.form_booking_group_limits g where g.form_id = $2::uuid) as src_groups
      from public.forms k where k.id = $1::uuid`, [kept?.id ?? null, srcId])).rows[0] ?? null;
  } catch (error) {
    kept = { error: error.message };
  }
  record(`${L}a copy of the form from before 0042, made as the admin and kept: a Draft Free class at Shrewsbury, the same name, "zz-before-0042-shrewsbury", no booking rows (the original keeps its 2 / 1 / 1)`,
    kept?.status === 'ok' && kept?.name === 'zz before 0042' && kept?.slug === 'zz-before-0042-shrewsbury'
      && keptRow?.location_code === 'shrewsbury' && keptRow?.status === 'draft' && keptRow?.kind === 'free_class'
      && keptRow?.name === kept?.name && keptRow?.slug === kept?.slug && keptRow?.booking_key === ''
      && keptRow?.offers === 0 && keptRow?.limits === 0 && keptRow?.groups === 0
      && keptRow?.src_offers === 2 && keptRow?.src_limits === 1 && keptRow?.src_groups === 1,
    JSON.stringify({ kept, keptRow }));

  // e. re-run safety
  const dataAfter = await one(db, snapSql);
  await run(db, `${L}apply 0042 a SECOND time (re-run safety)`, migration);
  const again = await printsOf(db, numbers);
  const movedAgain = numbers.filter((n) => JSON.stringify(after[`${n}_fingerprints.sql`]) !== JSON.stringify(again[`${n}_fingerprints.sql`]));
  record(`${L}0042 re-run: no fingerprint change, no row or history change`,
    movedAgain.length === 0 && (await one(db, snapSql)) === dataAfter, movedAgain.join(', '));

  // f. Undo 0042, as SETUP.md 0042e has it: paste the undo file it names
  const setup = read('SETUP.md').replace(/\r\n/g, '\n');
  const at = setup.search(/^### 0042e\. Undo 0042/m);
  const undoFile = 'manual/0042u_undo.sql';
  const undoSql = read('manual', '0042u_undo.sql');
  if (at < 0 || !setup.slice(at, at + 2000).includes(`supabase/${undoFile}`)) {
    record(`${L}[undo 0042] SETUP.md has "### 0042e. Undo 0042" naming supabase/${undoFile}`, false, 'heading or file name missing');
  } else if (await run(db, `${L}[undo 0042] paste ${undoFile}`, undoSql)) {
    const undone = await printsOf(db, others);
    const back = others.filter((n) => JSON.stringify(before[`${n}_fingerprints.sql`]) !== JSON.stringify(undone[`${n}_fingerprints.sql`]));
    record(`${L}[undo 0042] every fingerprint file equals the one before 0042 (0009's two lines gone again)`,
      back.length === 0, back.length ? `differ: ${back.join(', ')}` : `${others.length} files`);
    const gone42 = await fingerprints(db, '0042_fingerprints.sql');
    record(`${L}[undo 0042] 0042_fingerprints.sql answers no row`, gone42.length === 0, gone42.join(' | '));
    const undonePre = await pre();
    record(`${L}[undo 0042] the pre-apply check answers as before 0042`, JSON.stringify(undonePre) === JSON.stringify(ready),
      JSON.stringify(undonePre));
    record(`${L}[undo 0042] no row or history changed: the copy made with 0042 is still there, an ordinary Draft`,
      dataAfter === (await one(db, snapSql))
        && (await one(db, `select count(*)::int from public.forms f where f.slug = 'zz-before-0042-shrewsbury' and f.status = 'draft'`)) === 1);
    await tests('after the undo', baseline);
    await run(db, `${L}[undo 0042] paste ${undoFile} a SECOND time`, undoSql);
    const undoneAgain = await printsOf(db, others);
    record(`${L}[undo 0042] a second undo changes nothing`,
      others.every((n) => JSON.stringify(undone[`${n}_fingerprints.sql`]) === JSON.stringify(undoneAgain[`${n}_fingerprints.sql`])));
    if (await run(db, `${L}[undo 0042] apply 0042 again (redo)`, migration)) {
      const redo = await fingerprints(db, '0042_fingerprints.sql');
      record(`${L}[undo 0042] after the redo the 0042 fingerprints equal the tested ones`, JSON.stringify(redo) === JSON.stringify(prints42));
      await tests('after the redo', [['0042_tests.sql', 'ALL 0042 TESTS PASSED']]);
    }
  }
  await db.close().catch(() => {});
  return prints42;
}

// =====================================================================
// step0043: Camps Fill in (0043, rulebook v0.740 / v0.741,
// docs/Camps/CONTRACT-0043.md)
// ---------------------------------------------------------------------
// On its OWN fresh database built in the production order with every
// live migration (liveOrderTo0025, then 0027, 0026, 0028, 0029, 0031,
// 0030, 0032, 0033, 0034, 0036 and 0041 - each only if its file is on
// this branch):
//   a. 0043_fingerprints.sql and 0043_preapply_check.sql are
//      connector-safe (no "delete" / "drop"); a camp with a family
//      sign-up made through the family form BEFORE 0043; the pre-apply
//      check names the md5s of the code 0043 was built on and answers
//      1 / 0 / 3 / 3 / 0 / 0 / 0 / 1
//   b. the camps tests (0013, 0017, 0018, 0022, 0026, 0027, 0033) pass
//      BEFORE 0043 (the baseline)
//   c. apply 0043: in every other fingerprint file ONLY these lines move -
//      and each of them does: in 0013's and 0022's files
//      camp_public_signup_core (two more inputs, p_source and
//      p_entered_by; the rest of the line apart from the body md5 the
//      same), camp_public_signup and camp_camper_detail (body md5 only).
//      0043's own rows as designed. 0043 writes nothing: the sign-up from
//      before keeps every value and its version, gets source 'form' and
//      no entered_by, and no history row is added. The pre-apply check
//      answers 0 / 1 / 3 / 0 / 3 / 2 / 2 / 1
//   d. 0043_tests.sql, then the baseline tests again; AS THE APP (SET ROLE
//      authenticated with an unlocked admin's token, inputs by NAME as
//      supabase-js sends them) camp_staff_form answers ok and
//      camp_staff_signup reaches the core (price_changed for a 0 total);
//      anon and camps_registrar can run neither (rolled back)
//   e. 0043 applied a SECOND time: no fingerprint, row or history change
// (No undo file: 0043 only adds two columns and two functions and changes
// three functions; to go back, ask Claude - see SETUP.md 0043.)
// Run only this step with   node run.mjs --only-step0043
// =====================================================================
async function step0043() {
  const L = '[0043] ';
  const preSql = read('tests', '0043_preapply_check.sql');
  const migration = read('migrations', '0043_camps_fill_in.sql');
  const unsafe = [['tests', '0043_fingerprints.sql'], ['tests', '0043_preapply_check.sql']]
    .filter(([dir, file]) => /delete|drop/i.test(read(dir, file))).map(([, file]) => file);
  record(`${L}0043_fingerprints.sql and 0043_preapply_check.sql contain neither "delete" nor "drop" (connector-safe)`,
    unsafe.length === 0, unsafe.join(', '));
  const db = await buildBase(L);
  if (!db) return null;
  if (!(await liveOrderTo0025(db, L))) return null;
  for (const [label, file] of [['0027 (camps edit guard)', '0027_camps_edit_guard.sql'],
    ['0026 (Finance: Black Belt payments)', '0026_finance_black_belt.sql'], ['0028 (Star start times)', '0028_star_start_times.sql'],
    ['0029 (Finance reminder every 5 minutes)', '0029_finance_reminder_5min.sql'], ['0031 (class ages)', '0031_class_ages.sql'],
    ['0030 (Color Belt design review)', '0030_color_belt_review.sql'], ['0032 (Black Belt design review)', '0032_black_belt_review.sql'],
    ['0033 (Camps design review)', '0033_camps_design_review.sql'], ['0034 (Black Belt history ids)', '0034_black_belt_history_ids.sql'],
    ['0036 (New students profile)', '0036_new_students_profile.sql'], ['0041 (Star end time)', '0041_star_end_time.sql']]) {
    if (!existsSync(path.join(supabaseDir, 'migrations', file))) continue;
    if (!(await run(db, `${L}apply ${label}`, read('migrations', file)))) return null;
  }

  // a. a camp with one family sign-up (Amy and Bo) before 0043
  const claims = JSON.stringify({ sub: ADMIN_UID, role: 'authenticated', session_id: CAMPS_ADMIN_SID,
    amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) - 60 }] });
  await campsAdminSession(db);
  await db.query(`select set_config('request.jwt.claims', '', false)`);
  const seeded = await run(db, `${L}a camp with a family sign-up made before 0043`, `
    do $$
    declare
      v_mon   date := date_trunc('week', (public.testing_today() + 14)::timestamp)::date + 7;
      v_r     jsonb;
      v_camp  uuid;
      v_total integer := 0;
      v_try   integer;
      v_kids  jsonb;
    begin
      perform set_config('request.jwt.claims', '${claims}', true);
      v_r := public.camp_add_camp('worcester', false, 'PGlite 0043 camp', array[v_mon, v_mon + 1, v_mon + 2], '09:00', '15:00',
               public.testing_today() - 3, public.testing_today() + 5, public.testing_today() + 5, 5, 12,
               '${JSON.stringify([1, 2, 3].map((k) => ({ day_count: k, member_early_cents: 7500 * k, member_regular_cents: 8000 * k,
                 nonmember_early_cents: 8500 * k, nonmember_regular_cents: 9000 * k })))}'::jsonb,
               '[]'::jsonb, null, 'I agree.');
      if v_r ->> 'status' is distinct from 'ok' then raise exception 'camp_add_camp %', v_r; end if;
      v_camp := (v_r ->> 'id')::uuid;
      perform set_config('request.jwt.claims', '', true);
      select jsonb_agg(jsonb_build_object('first_name', n, 'last_name', 'Before', 'age', 8, 'member', true,
               'day_ids', (select jsonb_agg(d.id order by d.day) from public.camp_days d where d.camp_id = v_camp),
               'extras', '[]'::jsonb) order by n) into v_kids
        from unnest(array['Amy', 'Bo']) as n;
      for v_try in 1 .. 2 loop
        select public.camp_public_signup(c.public_code, 'pglite-0043', gen_random_uuid(), v_kids, 'Test Parent', '5085550100',
                 'Parent', 'Test Contact', '5085550101', 'Friend', 'cash', true, '${TEST_SIGNATURE}', 'camp-2026-10-18',
                 md5(c.waiver_text), v_total) into v_r
          from public.camps c where c.id = v_camp;
        exit when v_r ->> 'status' = 'ok';
        v_total := (v_r ->> 'new_total_cents')::integer;
      end loop;
      if v_r ->> 'status' is distinct from 'ok' then raise exception 'sign-up %', v_r; end if;
    end
    $$;`);
  if (!seeded) return null;
  const campId = await one(db, `select c.id::text from public.camps c where c.name = 'PGlite 0043 camp'`);

  const pre = async () => (await db.query(preSql)).rows[0];
  const answer = (r) => r ? [r.old_core, r.new_core, r.replaced_found, r.replaced_as_tested, r.applied_as_tested,
    r.new_functions, r.new_columns, r.signups].join(' / ') : 'none';
  const fnMd5 = (sig) => one(db, `select md5(regexp_replace(regexp_replace(p.prosrc, '--[^\\n]*', '', 'g'), '\\s+', '', 'g'))
                                    from pg_proc p where p.oid = to_regprocedure('public.${sig}')`);
  const CORE16 = 'camp_public_signup_core(text, text, uuid, jsonb, text, text, text, text, text, text, text, boolean, text, text, text, integer)';
  const CORE18 = 'camp_public_signup_core(text, text, uuid, jsonb, text, text, text, text, text, text, text, boolean, text, text, text, integer, text, text)';
  const SIGNUP = 'camp_public_signup(text, text, uuid, jsonb, text, text, text, text, text, text, text, boolean, text, text, text, integer)';
  const DETAIL = 'camp_camper_detail(uuid)';
  const builtOn = [await fnMd5(CORE16), await fnMd5(SIGNUP), await fnMd5(DETAIL)];
  record(`${L}the pre-apply check names the md5s of the code 0043 was built on (0022 core, 0013 family form, 0022 Camper detail)`,
    builtOn.every((m) => m && preSql.includes(m)), builtOn.join(' / '));
  const ready = await pre();
  record(`${L}[pre-apply check] before 0043: 1 / 0 / 3 / 3 / 0 / 0 / 0 / 1`, answer(ready) === '1 / 0 / 3 / 3 / 0 / 0 / 0 / 1', answer(ready));

  // b. the baseline tests
  const baseline = [['0013_tests.sql', 'ALL 0013 TESTS PASSED'], [CAMPS_TESTS, 'ALL 0017 TESTS PASSED'],
    ['0018_tests.sql', 'ALL 0018 TESTS PASSED'], ['0022_tests.sql', 'ALL 0022 TESTS PASSED'],
    ['0026_tests.sql', 'ALL 0026 TESTS PASSED'], ['0027_tests.sql', 'ALL 0027 TESTS PASSED'],
    ['0033_tests.sql', 'ALL 0033 TESTS PASSED']];
  const tests = async (label, files) => {
    for (const [file, ok] of files) await runTestFile(db, `${L}${file} (${label})`, file, ok);
  };
  await tests('before 0043', baseline);

  // c. apply 0043: only the planned lines move
  const numbers = [...NUMBERS_0025, '0027', '0026', '0028', '0029', '0031', '0030', '0032', '0033', '0034', '0036', '0041', '0043']
    .filter((n) => existsSync(path.join(supabaseDir, 'tests', `${n}_fingerprints.sql`)));
  const others = numbers.filter((n) => n !== '0043');
  const before = await printsOf(db, numbers);
  // every sign-up (without the two new columns), camper and the history size, as one md5
  const snapSql = `select md5(
       coalesce((select string_agg((to_jsonb(s) - array['source', 'entered_by'])::text, ',' order by s.id) from public.camp_signups s), '')
    || coalesce((select string_agg(to_jsonb(c)::text, ',' order by c.id) from public.camp_campers c), '')
    || (select count(*) from public.change_log)::text)`;
  const dataBefore = await one(db, snapSql);
  if (!(await run(db, `${L}apply 0043_camps_fill_in.sql`, migration))) return null;
  const after = await printsOf(db, numbers);
  const parts = (line) => line.split('  ');
  const fnName = (item) => item.slice(0, item.indexOf('('));
  const bodyOnly = ['camp_public_signup', 'camp_camper_detail'];
  const twoMore = (item) => item.replace(/\)$/, ', p_source text, p_entered_by text)');
  const wrong = [];
  const moved = {};   // fingerprint file number -> the planned items that moved
  for (const n of others) {
    const f = `${n}_fingerprints.sql`;
    const gone = before[f].filter((line) => !after[f].includes(line));
    const added = after[f].filter((line) => !before[f].includes(line));
    for (const g of gone) {
      const [kind, item, detail] = parts(g);
      const twinOf = (want) => added.find((a) => parts(a)[0] === kind && parts(a)[1] === want);
      if (kind === 'function' && bodyOnly.includes(fnName(item))) {
        const twin = twinOf(item);
        if (twin && parts(twin)[2].slice(32) === detail.slice(32)) { (moved[n] ??= []).push(fnName(item)); continue; }
        wrong.push(`${n}: ${g}${twin ? ` -> ${twin}` : ' (gone)'}`);
      } else if (kind === 'function' && fnName(item) === 'camp_public_signup_core') {
        const twin = twinOf(twoMore(item));
        if (twin && parts(twin)[2].slice(32) === detail.slice(32)) { (moved[n] ??= []).push(fnName(item)); continue; }
        wrong.push(`${n}: ${g}${twin ? ` -> ${twin}` : ' (gone, no twin with p_source / p_entered_by)'}`);
      } else {
        wrong.push(`${n}: ${g} (moved)`);
      }
    }
    for (const a of added) {
      const [kind, item] = parts(a);
      const twinned = gone.some((g) => parts(g)[0] === kind && (parts(g)[1] === item || twoMore(parts(g)[1]) === item));
      if (!twinned) wrong.push(`${n}: added ${a}`);
    }
  }
  const expected = { '0013': ['camp_public_signup_core', ...bodyOnly], '0022': ['camp_public_signup_core', ...bodyOnly] };
  for (const [n, items] of Object.entries(expected)) {
    const got = moved[n] ?? [];
    if (got.length !== items.length || !items.every((x) => got.includes(x))) {
      wrong.push(`${n}: planned ${items.join(', ')} - moved ${got.join(', ') || 'nothing'}`);
    }
  }
  for (const n of Object.keys(moved)) if (!expected[n]) wrong.push(`${n}: moved ${moved[n].join(', ')}`);
  record(`${L}fingerprints: exactly the planned lines moved (0013 and 0022: camp_public_signup_core + p_source / p_entered_by, camp_public_signup and camp_camper_detail body md5); everything else byte-identical`,
    wrong.length === 0, wrong.join('; ') || `${others.length} files`);
  const prints43 = after['0043_fingerprints.sql'];
  const fn = (name) => prints43.find((l) => l.startsWith(`function  ${name}(`)) || '';
  const tail = (vol, definer, rights) =>
    ` lang=plpgsql volatility=${vol} returns=jsonb definer=${definer} settings=search_path="" owner=postgres rights=${rights}`;
  const STAFF = 'authenticated:EXECUTE,postgres:EXECUTE';
  record(`${L}0043 fingerprints: camp_staff_form (stable), camp_staff_signup and camp_camper_detail security definer, signed-in staff only`,
    fn('camp_staff_form').endsWith(tail('s', 'true', STAFF)) && fn('camp_staff_signup').endsWith(tail('v', 'true', STAFF))
      && fn('camp_camper_detail').endsWith(tail('s', 'true', STAFF)),
    ['camp_staff_form', 'camp_staff_signup', 'camp_camper_detail'].map(fn).join(' | '));
  record(`${L}0043 fingerprints: the core has 18 inputs (… p_source text, p_entered_by text), not definer, nobody may run it; the family form's function camps_registrar only`,
    fn('camp_public_signup_core').includes(', p_expected_total_cents integer, p_source text, p_entered_by text)  ')
      && fn('camp_public_signup_core').endsWith(tail('v', 'false', 'postgres:EXECUTE'))
      && fn('camp_public_signup').endsWith(tail('v', 'true', 'camps_registrar:EXECUTE,postgres:EXECUTE'))
      && prints43.filter((l) => l.startsWith('function  camp_public_signup_core(')).length === 1,
    ['camp_public_signup_core', 'camp_public_signup'].map(fn).join(' | '));
  const rowOf = (kind, item) => prints43.find((l) => l.startsWith(`${kind}  ${item}  `)) || '';
  record(`${L}0043 fingerprints: the two columns (nobody reads them directly) and their two rules; 9 rows`,
    rowOf('column', 'camp_signups.source') === `column  camp_signups.source  text notnull=true default='form'::text rights=`
      && rowOf('column', 'camp_signups.entered_by') === 'column  camp_signups.entered_by  text notnull=false default= rights='
      && rowOf('constraint', 'camp_signups.camp_signups_source_check').includes("'form'::text")
      && rowOf('constraint', 'camp_signups.camp_signups_source_check').includes("'desk'::text")
      && rowOf('constraint', 'camp_signups.camp_signups_entered_by_check').includes('(entered_by IS NOT NULL)')
      && prints43.length === 9,
    prints43.filter((l) => !l.startsWith('function')).join(' | '));
  const applied = await pre();
  record(`${L}[pre-apply check] after 0043: 0 / 1 / 3 / 0 / 3 / 2 / 2 / 1`, answer(applied) === '0 / 1 / 3 / 0 / 3 / 2 / 2 / 1', answer(applied));
  record(`${L}0043 wrote nothing: the sign-up from before is unchanged (same values and version), now source 'form' with no entered_by, and no history row was added`,
    dataBefore === (await one(db, snapSql))
      && (await one(db, `select string_agg(s.source || ':' || coalesce(s.entered_by, '-') || ':' || s.version, ',') from public.camp_signups s`)) === 'form:-:1');

  // d. the tests; the app's calls (by name) as role authenticated
  await tests('after 0043', [['0043_tests.sql', 'ALL 0043 TESTS PASSED'], ...baseline]);
  const asApp = async (label, sql, check) => {
    let out;
    try {
      await db.exec('begin;');
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
      await db.exec('set local role authenticated;');
      out = (await db.query(sql)).rows[0];
    } catch (error) {
      out = { error: error.message };
    } finally {
      await db.exec('rollback;').catch(() => {});
    }
    record(`${L}[as the app] ${label}`, check(out),
      JSON.stringify(out?.r ? { status: out.r.status, fill_in: out.r.fill_in, new_total_cents: out.r.new_total_cents } : out));
  };
  await campsAdminSession(db);
  await db.query(`select set_config('request.jwt.claims', '', false)`);
  await asApp('camp_staff_form(p_camp_id => …) -> ok, fill_in open',
    `select public.camp_staff_form(p_camp_id => '${campId}') as r`, (o) => o?.r?.status === 'ok' && o.r.fill_in === 'open');
  await asApp('camp_staff_signup with every input by name and a 0 total -> price_changed (it reached the core)',
    `select public.camp_staff_signup(p_camp_id => '${campId}', p_submission_id => gen_random_uuid(),
       p_children => (select jsonb_build_array(jsonb_build_object('first_name', 'Cy', 'last_name', 'App', 'age', 8, 'member', true,
                        'day_ids', jsonb_agg(d.id order by d.day), 'extras', '[]'::jsonb))
                        from public.camp_days d where d.camp_id = '${campId}'),
       p_parent_name => 'Test Parent', p_parent_phone => '5085550100', p_parent_relation => 'Parent',
       p_emergency_name => 'Test Contact', p_emergency_phone => '5085550101', p_emergency_relation => 'Friend',
       p_paying_by => 'cash', p_acknowledged => true, p_signature => '${TEST_SIGNATURE}', p_ack_version => 'camp-2026-10-18',
       p_waiver_version => (select md5(c.waiver_text) from public.camps c where c.id = '${campId}'),
       p_expected_total_cents => 0) as r`,
    (o) => o?.r?.status === 'price_changed' && o.r.new_total_cents === 22500);   // 3 days, member, early: 3 x 7500
  for (const role of ['anon', 'camps_registrar']) {
    const refused = [];
    for (const sql of [`select public.camp_staff_form('${campId}')`,
      `select public.camp_staff_signup('${campId}', gen_random_uuid(), '[]'::jsonb, 'a', 'b', 'c', 'd', 'e', 'f', 'cash', true, 's', 'v', 'w', 0)`]) {
      try {
        await db.exec('begin;');
        await db.exec(`set local role ${role};`);
        await db.query(sql);
      } catch (error) {
        if (/permission denied/.test(error.message)) refused.push(sql.slice(14, 31));
      } finally {
        await db.exec('rollback;').catch(() => {});
      }
    }
    record(`${L}${role} can run neither camp_staff_form nor camp_staff_signup`, refused.length === 2, refused.join(', '));
  }

  // e. re-run safety
  const dataAfter = await one(db, snapSql);
  await run(db, `${L}apply 0043 a SECOND time (re-run safety)`, migration);
  const again = await printsOf(db, numbers);
  const movedAgain = numbers.filter((n) => JSON.stringify(after[`${n}_fingerprints.sql`]) !== JSON.stringify(again[`${n}_fingerprints.sql`]));
  record(`${L}0043 re-run: no fingerprint change, no row or history change`,
    movedAgain.length === 0 && (await one(db, snapSql)) === dataAfter, movedAgain.join(', '));
  await tests('after the re-run', [['0043_tests.sql', 'ALL 0043 TESTS PASSED']]);
  await db.close().catch(() => {});
  return prints43;
}

// =====================================================================
// step0039: Camps Record refund (0039, rulebook v1.039 / v1.040 / v0.743,
// docs/Camps/CONTRACT-0039.md)
// ---------------------------------------------------------------------
// On its OWN fresh database built in the production order with every
// live migration (liveOrderTo0025, then 0027, 0026, 0028, 0029, 0031,
// 0030, 0032, 0033, 0034, 0036, 0041, 0042 and 0043 - each only if its
// file is on this branch; 0039 is pasted after 0043):
//   a. 0039_fingerprints.sql and 0039_preapply_check.sql are
//      connector-safe (no "delete" / "drop"); a camp made BEFORE 0039 with
//      Amy - paid, then overpaid (Mark paid $225, then Edit payment up to
//      $300) - and Bo, paid exactly; the pre-apply check names the md5s of
//      what 0039 was built on (0013's guard, 0033's Undo / Edit payment
//      and roster, 0022's kind rule) and answers 3 / 5 / 0 / 0 / 0 / 4
//   b. the camps tests (0013, 0017, 0018, 0022, 0026, 0027, 0033, 0043)
//      pass BEFORE 0039 (the baseline); 0039_tests.sql stops at its setup
//      check ("is 0039 applied?")
//   c. apply 0039: in every other fingerprint file ONLY these lines move -
//      and each of them does: in 0013's file camp_payments_guard,
//      camp_undo_payment and camp_edit_payment (body md5 only) and the
//      camp_roster view (md5 only); in 0022's camp_edit_payment (body md5
//      only) and camp_payments_kind_check (exactly 0039's rule); in 0033's
//      camp_undo_payment, camp_edit_payment (body md5 only) and the view
//      (md5 only - options and rights the same). 0039's own 7 rows as
//      designed. 0039 writes nothing: every payment, camper and sign-up
//      the same, no history row. The pre-apply check names 0039's md5s and
//      answers 3 / 0 / 5 / 2 / 0 / 4
//   d. 0039_tests.sql, then the baseline tests again; AS THE APP (SET ROLE
//      authenticated with an unlocked admin's token, inputs by NAME as
//      supabase-js sends them): camp_record_refund on Amy (overpaid before
//      0039) -> ok, the roster read as authenticated shows refunded_cents,
//      Undo payment -> refund_stands, camp_undo_refund -> ok and
//      refunded_cents back to 0 (all rolled back); anon and
//      camps_registrar can run neither new function
//   e. 0039 applied a SECOND time: no fingerprint, row or history change;
//      0039_tests.sql passes again
// (No undo file: 0039 only widens a rule, adds two functions and changes
// three functions and the roster; to go back, ask Claude - see SETUP.md
// 0039.)
// Run only this step with   node run.mjs --only-step0039
// =====================================================================
// 0039's kind rule exactly as pg_get_constraintdef prints it (the 0022 file
// line and 0039's own "constraint" line must show this)
const RULE_0039 = "CHECK ((((kind = 'payment'::text) AND ((amount_cents >= 1) AND (amount_cents <= 1000000)) AND (reverses_payment_id IS NULL)) OR ((kind = 'refund'::text) AND ((amount_cents >= '-1000000'::integer) AND (amount_cents <= '-1'::integer)) AND (reverses_payment_id IS NULL) AND (method = ANY (ARRAY['cash'::text, 'check'::text]))) OR ((kind = 'reversal'::text) AND ((amount_cents >= '-1000000'::integer) AND (amount_cents <= 1000000)) AND (amount_cents <> 0) AND (reverses_payment_id IS NOT NULL))))";

async function step0039() {
  const L = '[0039] ';
  const preSql = read('tests', '0039_preapply_check.sql');
  const migration = read('migrations', '0039_camps_record_refund.sql');
  const unsafe = [['tests', '0039_fingerprints.sql'], ['tests', '0039_preapply_check.sql']]
    .filter(([dir, file]) => /delete|drop/i.test(read(dir, file))).map(([, file]) => file);
  record(`${L}0039_fingerprints.sql and 0039_preapply_check.sql contain neither "delete" nor "drop" (connector-safe)`,
    unsafe.length === 0, unsafe.join(', '));
  const db = await buildBase(L);
  if (!db) return null;
  if (!(await liveOrderTo0025(db, L))) return null;
  for (const [label, file] of [['0027 (camps edit guard)', '0027_camps_edit_guard.sql'],
    ['0026 (Finance: Black Belt payments)', '0026_finance_black_belt.sql'], ['0028 (Star start times)', '0028_star_start_times.sql'],
    ['0029 (Finance reminder every 5 minutes)', '0029_finance_reminder_5min.sql'], ['0031 (class ages)', '0031_class_ages.sql'],
    ['0030 (Color Belt design review)', '0030_color_belt_review.sql'], ['0032 (Black Belt design review)', '0032_black_belt_review.sql'],
    ['0033 (Camps design review)', '0033_camps_design_review.sql'], ['0034 (Black Belt history ids)', '0034_black_belt_history_ids.sql'],
    ['0036 (New students profile)', '0036_new_students_profile.sql'], ['0041 (Star end time)', '0041_star_end_time.sql'],
    ['0042 (copy a form to the other school)', '0042_forms_copy_to_school.sql'], ['0043 (Camps Fill in)', '0043_camps_fill_in.sql']]) {
    if (!existsSync(path.join(supabaseDir, 'migrations', file))) continue;
    if (!(await run(db, `${L}apply ${label}`, read('migrations', file)))) return null;
  }

  // a. a camp with Amy (paid, then overpaid $75) and Bo (paid exactly), before 0039
  const claims = JSON.stringify({ sub: ADMIN_UID, role: 'authenticated', session_id: CAMPS_ADMIN_SID,
    amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) - 60 }] });
  await campsAdminSession(db);
  await db.query(`select set_config('request.jwt.claims', '', false)`);
  const seeded = await run(db, `${L}a camp with a paid-then-overpaid camper and a camper paid exactly, made before 0039`, `
    do $$
    declare
      v_mon   date := date_trunc('week', (public.testing_today() + 14)::timestamp)::date + 7;
      v_r     jsonb;
      v_camp  uuid;
      v_total integer := 0;
      v_try   integer;
      v_kids  jsonb;
      v_c     record;
    begin
      perform set_config('request.jwt.claims', '${claims}', true);
      v_r := public.camp_add_camp('worcester', false, 'PGlite 0039 camp', array[v_mon, v_mon + 1, v_mon + 2], '09:00', '15:00',
               public.testing_today() - 3, public.testing_today() + 5, public.testing_today() + 5, 5, 12,
               '${JSON.stringify([1, 2, 3].map((k) => ({ day_count: k, member_early_cents: 7500 * k, member_regular_cents: 8000 * k,
                 nonmember_early_cents: 8500 * k, nonmember_regular_cents: 9000 * k })))}'::jsonb,
               '[]'::jsonb, null, 'I agree.');
      if v_r ->> 'status' is distinct from 'ok' then raise exception 'camp_add_camp %', v_r; end if;
      v_camp := (v_r ->> 'id')::uuid;
      perform set_config('request.jwt.claims', '', true);
      select jsonb_agg(jsonb_build_object('first_name', n, 'last_name', 'Before', 'age', 8, 'member', true,
               'day_ids', (select jsonb_agg(d.id order by d.day) from public.camp_days d where d.camp_id = v_camp),
               'extras', '[]'::jsonb) order by n) into v_kids
        from unnest(array['Amy', 'Bo']) as n;
      for v_try in 1 .. 2 loop
        select public.camp_public_signup(c.public_code, 'pglite-0039', gen_random_uuid(), v_kids, 'Test Parent', '5085550100',
                 'Parent', 'Test Contact', '5085550101', 'Friend', 'cash', true, '${TEST_SIGNATURE}', 'camp-2026-10-18',
                 md5(c.waiver_text), v_total) into v_r
          from public.camps c where c.id = v_camp;
        exit when v_r ->> 'status' = 'ok';
        v_total := (v_r ->> 'new_total_cents')::integer;
      end loop;
      if v_r ->> 'status' is distinct from 'ok' then raise exception 'sign-up %', v_r; end if;
      -- the admin: both paid ($225 each), then Amy's payment edited up to $300
      perform set_config('request.jwt.claims', '${claims}', true);
      for v_c in select c.id, c.first_name, c.version from public.camp_campers c where c.camp_id = v_camp order by c.first_name loop
        v_r := public.camp_mark_paid(v_c.id, v_c.version, 'worcester');
        if v_r ->> 'status' is distinct from 'ok' then raise exception 'mark paid %', v_r; end if;
        if v_c.first_name = 'Amy' then
          v_r := public.camp_edit_payment((v_r ->> 'payment_id')::uuid, 'cash', 30000, public.testing_today(), 'worcester');
          if v_r ->> 'status' is distinct from 'ok' then raise exception 'edit payment %', v_r; end if;
        end if;
      end loop;
      perform set_config('request.jwt.claims', '', true);
    end
    $$;`);
  if (!seeded) return null;
  const amyId = await one(db, `select c.id::text from public.camp_campers c where c.first_name = 'Amy' and c.last_name = 'Before'`);

  const pre = async () => (await db.query(preSql)).rows[0];
  const answer = (r) => r ? [r.replaced_found, r.replaced_as_tested, r.applied_as_tested, r.new_functions, r.refunds, r.payments]
    .join(' / ') : 'none';
  const fnMd5 = (sig) => one(db, `select md5(regexp_replace(regexp_replace(p.prosrc, '--[^\\n]*', '', 'g'), '\\s+', '', 'g'))
                                    from pg_proc p where p.oid = to_regprocedure('public.${sig}')`);
  // the five things 0039 replaces: the guard, Undo payment, Edit payment, the roster view, the kind rule
  const md5s = async () => [await fnMd5('camp_payments_guard()'), await fnMd5('camp_undo_payment(uuid)'),
    await fnMd5('camp_edit_payment(uuid, text, integer, date, text)'),
    await one(db, `select md5(pg_get_viewdef('public.camp_roster'::regclass))`),
    await one(db, `select md5(pg_get_constraintdef(k.oid)) from pg_constraint k
                    where k.conrelid = 'public.camp_payments'::regclass and k.conname = 'camp_payments_kind_check'`)];
  const builtOn = await md5s();
  record(`${L}the pre-apply check names the md5s of what 0039 was built on (0013 guard, 0033 Undo / Edit payment and roster, 0022 kind rule)`,
    builtOn.every((m) => m && preSql.includes(m)), builtOn.join(' / '));
  const ready = await pre();
  record(`${L}[pre-apply check] before 0039: 3 / 5 / 0 / 0 / 0 / 4`, answer(ready) === '3 / 5 / 0 / 0 / 0 / 4', answer(ready));

  // b. the baseline tests
  const baseline = [['0013_tests.sql', 'ALL 0013 TESTS PASSED'], [CAMPS_TESTS, 'ALL 0017 TESTS PASSED'],
    ['0018_tests.sql', 'ALL 0018 TESTS PASSED'], ['0022_tests.sql', 'ALL 0022 TESTS PASSED'],
    ['0026_tests.sql', 'ALL 0026 TESTS PASSED'], ['0027_tests.sql', 'ALL 0027 TESTS PASSED'],
    ['0033_tests.sql', 'ALL 0033 TESTS PASSED'], ['0043_tests.sql', 'ALL 0043 TESTS PASSED']]
    .filter(([file]) => existsSync(path.join(supabaseDir, 'tests', file)));
  const tests = async (label, files) => {
    for (const [file, ok] of files) await runTestFile(db, `${L}${file} (${label})`, file, ok);
  };
  await tests('before 0039', baseline);
  // ... and 0039's own tests before 0039: they stop at once at their setup
  // check with a clear message (nothing else runs; rolled back)
  let early = '';
  try {
    await db.exec(read('tests', '0039_tests.sql').replaceAll('<paste-admin-UID-here>', ADMIN_UID)
      .replaceAll('<paste-desk-UID-here>', DESK_UID));
  } catch (error) {
    early = error.message;
  } finally {
    await db.exec('rollback;').catch(() => {});
  }
  record(`${L}0039_tests.sql BEFORE 0039 stops at its setup check ("is 0039 applied?")`,
    /TEST SETUP: camp_record_refund \/ camp_undo_refund are missing/.test(early), early || 'it ran');

  // c. apply 0039: only the planned lines move
  const numbers = [...NUMBERS_0025, '0027', '0026', '0028', '0029', '0031', '0030', '0032', '0033', '0034', '0036', '0041', '0042',
    '0043', '0039'].filter((n) => existsSync(path.join(supabaseDir, 'tests', `${n}_fingerprints.sql`)));
  const others = numbers.filter((n) => n !== '0039');
  const before = await printsOf(db, numbers);
  // every payment, camper and sign-up, and the history's size and last row, as one md5
  const snapSql = `select md5(
       coalesce((select string_agg(to_jsonb(p)::text, ',' order by p.id) from public.camp_payments p), '')
    || coalesce((select string_agg(to_jsonb(c)::text, ',' order by c.id) from public.camp_campers c), '')
    || coalesce((select string_agg(to_jsonb(s)::text, ',' order by s.id) from public.camp_signups s), '')
    || (select count(*) from public.change_log)::text || '/' || coalesce((select max(l.id) from public.change_log l), 0)::text)`;
  const dataBefore = await one(db, snapSql);
  if (!(await run(db, `${L}apply 0039_camps_record_refund.sql`, migration))) return null;
  const after = await printsOf(db, numbers);
  const parts = (line) => line.split('  ');
  const keyOf = (kind, item) => (kind === 'function' ? `function ${item.slice(0, item.indexOf('('))}` : `${kind} ${item}`);
  // lines whose detail may change only in its first 32 characters (the md5)
  const md5Only = ['function camp_payments_guard', 'function camp_undo_payment', 'function camp_edit_payment', 'view camp_roster'];
  const KIND_RULE = 'constraint camp_payments.camp_payments_kind_check';
  const wrong = [];
  const moved = {};   // fingerprint file number -> the planned lines that moved
  for (const n of others) {
    const f = `${n}_fingerprints.sql`;
    const gone = before[f].filter((line) => !after[f].includes(line));
    const added = after[f].filter((line) => !before[f].includes(line));
    for (const g of gone) {
      const [kind, item, detail] = parts(g);
      const key = keyOf(kind, item);
      const twin = added.find((a) => parts(a)[0] === kind && parts(a)[1] === item);
      if (twin && md5Only.includes(key) && parts(twin)[2].slice(32) === detail.slice(32)) { (moved[n] ??= []).push(key); continue; }
      if (twin && key === KIND_RULE && parts(twin)[2] === RULE_0039) { (moved[n] ??= []).push(key); continue; }
      wrong.push(`${n}: ${g}${twin ? ` -> ${twin}` : ' (gone)'}`);
    }
    for (const a of added) {
      const [kind, item] = parts(a);
      if (!gone.some((g) => parts(g)[0] === kind && parts(g)[1] === item)) wrong.push(`${n}: added ${a}`);
    }
  }
  const expected = {
    '0013': ['function camp_payments_guard', 'function camp_undo_payment', 'function camp_edit_payment', 'view camp_roster'],
    '0022': ['function camp_edit_payment', KIND_RULE],
    '0033': ['function camp_undo_payment', 'function camp_edit_payment', 'view camp_roster'],
  };
  for (const [n, items] of Object.entries(expected)) {
    const got = moved[n] ?? [];
    if (got.length !== items.length || !items.every((x) => got.includes(x))) {
      wrong.push(`${n}: planned ${items.join(', ')} - moved ${got.join(', ') || 'nothing'}`);
    }
  }
  for (const n of Object.keys(moved)) if (!expected[n]) wrong.push(`${n}: moved ${moved[n].join(', ')}`);
  record(`${L}fingerprints: exactly the planned lines moved (0013: guard, Undo / Edit payment body md5, roster md5; 0022: Edit payment body md5, the kind rule = 0039's; 0033: Undo / Edit payment body md5, roster md5); everything else byte-identical`,
    wrong.length === 0, wrong.join('; ') || `${others.length} files`);
  const prints39 = after['0039_fingerprints.sql'];
  const fn = (name) => prints39.find((l) => l.startsWith(`function  ${name}(`)) || '';
  const tail = (definer, rights, returns = 'jsonb') =>
    ` lang=plpgsql volatility=v returns=${returns} definer=${definer} settings=search_path="" owner=postgres rights=${rights}`;
  const STAFF = 'authenticated:EXECUTE,postgres:EXECUTE';
  const appFns = ['camp_record_refund', 'camp_undo_refund', 'camp_undo_payment', 'camp_edit_payment'];
  record(`${L}0039 fingerprints: camp_record_refund (6 inputs), camp_undo_refund, camp_undo_payment and camp_edit_payment security definer, signed-in staff only; camp_payments_guard internal`,
    appFns.every((f) => fn(f).endsWith(tail('true', STAFF)))
      && fn('camp_record_refund').startsWith('function  camp_record_refund(p_camper_id uuid, p_expected_version integer, p_method text, p_amount_cents integer, p_refunded_on date, p_school text)  ')
      && fn('camp_payments_guard').endsWith(tail('false', 'postgres:EXECUTE', 'trigger')),
    [...appFns, 'camp_payments_guard'].map(fn).join(' | '));
  const rowOf = (kind, item) => prints39.find((l) => l.startsWith(`${kind}  ${item}  `)) || '';
  record(`${L}0039 fingerprints: the kind rule (0022's $10,000 for each kind: payment, refund -$10,000 ... -1 cent by cash or check, reversal either way, not 0) and the view (security_invoker, read by authenticated); 7 rows`,
    rowOf('constraint', 'camp_payments.camp_payments_kind_check') === `constraint  camp_payments.camp_payments_kind_check  c ${RULE_0039}`
      && /^view {2}camp_roster {2}[0-9a-f]{32} options=security_invoker=true rights=authenticated:SELECT$/.test(rowOf('view', 'camp_roster'))
      && prints39.length === 7,
    prints39.filter((l) => !l.startsWith('function')).join(' | '));
  const appliedMd5 = await md5s();
  record(`${L}the pre-apply check names 0039's md5s (guard, Undo / Edit payment, roster, kind rule)`,
    appliedMd5.every((m) => m && preSql.includes(m)), appliedMd5.join(' / '));
  const done = await pre();
  record(`${L}[pre-apply check] after 0039: 3 / 0 / 5 / 2 / 0 / 4`, answer(done) === '3 / 0 / 5 / 2 / 0 / 4', answer(done));
  record(`${L}0039 wrote nothing: every payment, camper and sign-up the same, no history row`, dataBefore === (await one(db, snapSql)));

  // d. the tests; the app's calls (by name) as role authenticated
  await tests('after 0039', [['0039_tests.sql', 'ALL 0039 TESTS PASSED'], ...baseline]);
  await campsAdminSession(db);
  await db.query(`select set_config('request.jwt.claims', '', false)`);
  // the app sends the date itself (the device's today; the app can't call testing_today)
  const today = await one(db, `select public.testing_today()::text`);
  let app;
  try {
    await db.exec('begin;');
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
    await db.exec('set local role authenticated;');
    const rowSql = `select r.version, r.owes_cents, r.refunded_cents, r.last_payment_id from public.camp_roster r where r.id = $1::uuid`;
    const amy = (await db.query(rowSql, [amyId])).rows[0];
    const rec = (await db.query(`select public.camp_record_refund(p_camper_id => $1::uuid, p_expected_version => $2::integer,
        p_method => 'cash', p_amount_cents => 7500, p_refunded_on => $3::date, p_school => 'shrewsbury') as r`,
    [amyId, amy.version, today])).rows[0].r;
    const mid = (await db.query(rowSql, [amyId])).rows[0];
    const stands = (await db.query(`select public.camp_undo_payment(p_payment_id => $1::uuid) as r`, [amy.last_payment_id])).rows[0].r;
    const undo = (await db.query(`select public.camp_undo_refund(p_payment_id => $1::uuid) as r`, [rec?.payment_id ?? null])).rows[0].r;
    const end = (await db.query(rowSql, [amyId])).rows[0];
    app = { before: amy, rec, mid, stands, undo, end };
  } catch (error) {
    app = { error: error.message };
  } finally {
    await db.exec('rollback;').catch(() => {});
  }
  record(`${L}[as the app] camp_record_refund by name on Amy (overpaid before 0039) -> ok; the roster as authenticated: refunded_cents 7500, owes 0; Undo payment -> refund_stands; camp_undo_refund by name -> ok, refunded_cents 0 again (rolled back)`,
    app.before?.owes_cents === -7500 && app.before?.refunded_cents === 0 && app.rec?.status === 'ok'
      && app.mid?.refunded_cents === 7500 && app.mid?.owes_cents === 0 && app.mid?.version === app.before.version + 1
      && app.stands?.status === 'refund_stands' && app.undo?.status === 'ok'
      && app.end?.refunded_cents === 0 && app.end?.owes_cents === -7500,
    JSON.stringify(app));
  for (const role of ['anon', 'camps_registrar']) {
    const refused = [];
    for (const sql of [`select public.camp_record_refund('${amyId}', 1, 'cash', 100, '2026-01-01'::date, 'worcester')`,
      `select public.camp_undo_refund(gen_random_uuid())`]) {
      try {
        await db.exec('begin;');
        await db.exec(`set local role ${role};`);
        await db.query(sql);
      } catch (error) {
        const m = /permission denied for function (camp_record_refund|camp_undo_refund)/.exec(error.message);
        if (m) refused.push(m[1]);
      } finally {
        await db.exec('rollback;').catch(() => {});
      }
    }
    record(`${L}${role} can run neither camp_record_refund nor camp_undo_refund`, refused.length === 2, refused.join(', '));
  }

  // e. re-run safety
  const dataAfter = await one(db, snapSql);
  await run(db, `${L}apply 0039 a SECOND time (re-run safety)`, migration);
  const again = await printsOf(db, numbers);
  const movedAgain = numbers.filter((n) => JSON.stringify(after[`${n}_fingerprints.sql`]) !== JSON.stringify(again[`${n}_fingerprints.sql`]));
  record(`${L}0039 re-run: no fingerprint change, no row or history change`,
    movedAgain.length === 0 && (await one(db, snapSql)) === dataAfter, movedAgain.join(', '));
  await tests('after the re-run', [['0039_tests.sql', 'ALL 0039 TESTS PASSED']]);
  await db.close().catch(() => {});
  return prints39;
}

// =====================================================================
// step0044: Color Belt rolling check, step A (0044) - the family form's
// own Paying by (M-01), Edit event's Undo in one call (R2-02), each
// payment's school (R1-01, v1.035)
// ---------------------------------------------------------------------
// On its OWN fresh database in the production order with every live
// migration (liveOrderTo0025, then 0027, 0026, 0028, 0029, 0031, 0030,
// 0032, 0033, 0034, 0036, 0041, 0042, 0043, 0039 - each only if its file is on this
// branch), with Color Belt rows made BEFORE 0044:
//   a. connector-safe files (tests, fingerprints); the migration's only
//      removals are its two "drop function if exists" lines and its four
//      "drop trigger if exists" lines
//   b. rows before 0044 (as the app makes them): Kim Ray (family form,
//      cash) changed to check at the desk; Pat Lee (family form, cash)
//      paid and moved to a private testing; a private testing added at
//      the desk; a family-form row WITHOUT its history insert row; Sam
//      Ortiz (desk, paid)
//   c. the Color Belt and Finance tests before 0044 (0005, 0010, 0011,
//      0014, 0018, 0026, 0030)
//   d. 0035 then 0044 in one rolled-back transaction: both go in (0044
//      doesn't need 0035)
//   e. apply 0044: the fill (form rows from their insert row, none
//      without one; desk rows none; the moved private testing from its
//      registration; every payment at the event's / private testing's
//      school), no history row, no version moved; in every other
//      fingerprint file only Color Belt items move (listed)
//   f. 0044_tests.sql, then every baseline file again
//   g. 0044 a SECOND time: no fingerprint, row or history change
//   h. 0035 AFTER 0044 is refused by 0035's guard (known; SETUP 0044b)
// Run only this step with   node run.mjs --only-step0044
// =====================================================================
async function step0044() {
  const L = '[0044] ';
  const migration = read('migrations', '0044_color_belt_rolling_check.sql');
  const preSql = read('tests', '0044_preapply_check.sql');
  const unsafe = [['tests', '0044_fingerprints.sql'], ['tests', '0044_preapply_check.sql']]
    .filter(([dir, file]) => /delete|drop/i.test(read(dir, file))).map(([, file]) => file);
  record(`${L}0044_fingerprints.sql and 0044_preapply_check.sql contain neither "delete" nor "drop" (connector-safe)`,
    unsafe.length === 0, unsafe.join(', '));
  const answer = (r) => ['new_columns', 'old_signatures', 'new_signatures', 'undo_event_edit', 'replaced_found', 'replaced_as_tested',
    'applied_as_tested', 'form_rows_no_history', 'payments_off_school'].map((k) => r?.[k]).join(' / ');
  const dropLines = migration.replace(/\r\n/g, '\n').split('\n').filter((l) => /^\s*drop\s/i.test(l));
  const wantDrops = ['drop trigger if exists testing_registrations_before_form_choice on public.testing_registrations;',
    'drop trigger if exists testing_private_before_form_choice on public.testing_private;',
    'drop trigger if exists testing_payments_school on public.testing_payments;',
    'drop trigger if exists testing_private_payments_school on public.testing_private_payments;',
    'drop function if exists public.testing_mark_paid_by(uuid, integer, text, integer);',
    'drop function if exists public.testing_private_mark_paid_by(uuid, integer, text, integer);'];
  record(`${L}the migration's only removals are the two old 4-input Mark paid versions and four "drop trigger if exists" (re-run safety)`,
    JSON.stringify(dropLines.map((l) => l.trim())) === JSON.stringify(wantDrops), dropLines.join(' | '));
  const body = (sql) => sql.replace(/^begin;\s*$/m, '').replace(/^commit;\s*$/m, '');

  const db = await buildBase(L);
  if (!db) return null;
  if (!(await liveOrderTo0025(db, L))) return null;
  for (const [label, file] of [['0027 (camps edit guard)', '0027_camps_edit_guard.sql'],
    ['0026 (Finance: Black Belt payments)', '0026_finance_black_belt.sql'], ['0028 (Star start times)', '0028_star_start_times.sql'],
    ['0029 (Finance reminder every 5 minutes)', '0029_finance_reminder_5min.sql'], ['0031 (class ages)', '0031_class_ages.sql'],
    ['0030 (Color Belt design review)', '0030_color_belt_review.sql'], ['0032 (Black Belt design review)', '0032_black_belt_review.sql'],
    ['0033 (Camps design review)', '0033_camps_design_review.sql'], ['0034 (Black Belt history ids)', '0034_black_belt_history_ids.sql'],
    ['0036 (New students: last name, date of birth, Address)', '0036_new_students_profile.sql'],
    ['0041 (Star event end time)', '0041_star_end_time.sql'], ['0042 (New students: copy a form)', '0042_forms_copy_to_school.sql'],
    ['0043 (Camps Fill in)', '0043_camps_fill_in.sql'], ['0039 (Camps Record refund)', '0039_camps_record_refund.sql']]) {
    if (!existsSync(path.join(supabaseDir, 'migrations', file))) continue;
    if (!(await run(db, `${L}apply ${label}`, read('migrations', file)))) return null;
  }

  // b. rows before 0044, made the app's way (as the signed-in admin) where the app can
  await adminSession(db);
  await db.query(`select set_config('request.jwt.claims', '', false)`);
  const asAdmin44 = async (sql, params = []) => {
    await db.query(`select set_config('request.jwt.claims', $1, false)`, [ADMIN_CLAIMS_0026()]);
    try {
      return await asAdmin(db, sql, params);
    } finally {
      await db.query(`select set_config('request.jwt.claims', '', false)`);
    }
  };
  const reg = async (first, last) => (await db.query(`select r.id, r.version from public.testing_registrations r
      join public.testing_events e on e.id = r.event_id
     where e.public_code = '${TEST_EVENT_CODE}' and r.first_name = $1 and r.last_name = $2`, [first, last])).rows[0];
  let seeded = {};
  try {
    const day = await one(db, `select (public.testing_today() + 3)::text`);
    const kim = await reg('Kim', 'Ray');
    seeded.kim = await asAdmin44(`select public.testing_change_paying_by($1::uuid, $2::integer, 'check') as r`, [kim.id, kim.version]);
    let pat = await reg('Pat', 'Lee');
    const price = await asAdmin44(`select public.testing_mark_paid_by($1::uuid, $2::integer, 'cash', 0) as r`, [pat.id, pat.version]);
    seeded.patPaid = await asAdmin44(`select public.testing_mark_paid_by($1::uuid, $2::integer, 'cash', $3::integer) as r`,
      [pat.id, pat.version, price?.amount_cents ?? 0]);
    pat = await reg('Pat', 'Lee');
    seeded.patMoved = await asAdmin44(`select public.testing_move_to_private($1::uuid, $2::integer, $3::date, '17:00') as r`,
      [pat.id, pat.version, day]);
    const rank = (await db.query(`select r.id from public.testing_ranks r where r.location_code = 'worcester' order by r.position limit 1`)).rows[0].id;
    seeded.deskPrivate = await asAdmin44(`select public.testing_private_add('worcester', 'Desk', 'Private', $1::uuid, true, 'card',
      $2::date, '17:00') as r`, [rank, day]);
  } catch (error) {
    seeded.error = error.message;
  }
  await run(db, `${L}a family-form registration WITHOUT its history insert row (log trigger off while it is written)`, `
    begin;
    alter table public.testing_registrations disable trigger testing_registrations_log;
    insert into public.testing_registrations (event_id, event_rank_id, first_name, last_name, paying_by, stripes_confirmed, source,
                                              submission_id, signature, signed_at, signature_deleted_at, ack_version)
    select e.id, k.id, 'Nolog', 'Form', 'card', true, 'form', gen_random_uuid(), null, now(), now(), 'pglite'
      from public.testing_events e
      join public.testing_event_classes c on c.event_id = e.id
      join public.testing_event_ranks k on k.event_class_id = c.id
     where e.public_code = '${TEST_EVENT_CODE}'
     order by c.position, k.position limit 1;
    alter table public.testing_registrations enable trigger testing_registrations_log;
    commit;`);
  record(`${L}rows before 0044: Kim Ray changed to check at the desk, Pat Lee paid and moved, a desk private testing`,
    seeded.kim?.status === 'ok' && seeded.patPaid?.status === 'ok' && seeded.patMoved?.status === 'ok' && seeded.deskPrivate?.status === 'ok',
    JSON.stringify(seeded));

  // the pre-apply check before 0044 (the form row without history counts 1)
  const pre = async () => (await db.query(preSql)).rows[0];
  const ready = await pre();
  record(`${L}[pre-apply check] before 0044: 0 / 2 / 0 / 0 / 8 / 8 / 0 / 1 / 0 (nothing of 0044, the 8 functions as 0030, the planted form row without history)`,
    answer(ready) === '0 / 2 / 0 / 0 / 8 / 8 / 0 / 1 / 0', answer(ready));

  // c. the baseline tests
  const baseline = [['0005_tests.sql', 'ALL 0005 TESTS PASSED'], ['0010_tests.sql', 'ALL 0010 TESTS PASSED'],
    ['0011_tests.sql', 'ALL 0011 TESTS PASSED'], ['0014_tests.sql', 'ALL 0014 TESTS PASSED'],
    ['0018_tests.sql', 'ALL 0018 TESTS PASSED'], ['0026_tests.sql', 'ALL 0026 TESTS PASSED'],
    ['0030_tests.sql', 'ALL 0030 TESTS PASSED']];
  const tests = async (label, files) => {
    for (const [file, ok] of files) await runTestFileLive(db, `${L}${file} (${label})`, file, ok);
  };
  await tests('before 0044', baseline);

  // d. 0035 first, then 0044 (rolled back): 0044 doesn't need 0035
  if (existsSync(path.join(supabaseDir, 'migrations', '0035_color_belt_cleanup.sql'))) {
    let message = '';
    let both = null;
    try {
      await db.exec('begin;');
      await db.exec(body(read('migrations', '0035_color_belt_cleanup.sql')));
      await db.exec(body(migration));
      both = await one(db, `select string_agg(p.proname || ':' || p.pronargs, ',' order by p.proname collate "C") from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname in ('testing_mark_paid', 'testing_private_mark_paid', 'testing_mark_paid_by', 'testing_private_mark_paid_by')`);
    } catch (error) {
      message = error.message;
    } finally {
      await db.exec('rollback;').catch(() => {});
    }
    record(`${L}0035 then 0044 (rolled back): both go in, only the 5-input Mark paid functions are left`,
      both === 'testing_mark_paid_by:5,testing_private_mark_paid_by:5', message || String(both));
    // the same pair again, each time with one test file run inside it (the file's own final
    // "rollback;" ends the pair's transaction, so nothing of it is kept)
    for (const [file, ok] of [['0035_tests.sql', 'ALL 0035 TESTS PASSED'], ['0044_tests.sql', 'ALL 0044 TESTS PASSED']]) {
      try {
        await db.exec('begin;');
        await db.exec(body(read('migrations', '0035_color_belt_cleanup.sql')));
        await db.exec(body(migration));
      } catch (error) {
        record(`${L}0035 then 0044, then ${file}`, false, error.message);
        await db.exec('rollback;').catch(() => {});
        continue;
      }
      await runTestFileLive(db, `${L}${file} (with 0035 then 0044, rolled back)`, file, ok);
      await db.exec('rollback;').catch(() => {});
    }
    record(`${L}after the 0035 + 0044 tries nothing of them is kept (the 4-input Mark paid and the old 2-input one are still there)`,
      (await one(db, `select count(*)::int from pg_proc p where p.proname in ('testing_mark_paid', 'testing_private_mark_paid')
         or (p.proname in ('testing_mark_paid_by', 'testing_private_mark_paid_by') and p.pronargs = 4)`)) === 4);
  }

  // e. apply 0044
  const numbers = [...NUMBERS_0025, '0027', '0026', '0028', '0029', '0031', '0030', '0032', '0033', '0034', '0036', '0041', '0042']
    .filter((n) => existsSync(path.join(supabaseDir, 'tests', `${n}_fingerprints.sql`)));
  const before = await printsOf(db, numbers);
  const before44 = await fingerprints(db, '0044_fingerprints.sql');
  const snapSql = `select md5(
       coalesce((select string_agg(r.id::text || ':' || r.version || ':' || r.paying_by || ':' || r.updated_at, ',' order by r.id)
                   from public.testing_registrations r), '')
    || coalesce((select string_agg(p.id::text || ':' || p.version || ':' || p.paying_by || ':' || p.updated_at, ',' order by p.id)
                   from public.testing_private p), '')
    || (select count(*) from public.testing_payments)::text || '/' || (select count(*) from public.testing_private_payments)::text
    || '/' || (select count(*) from public.change_log)::text)`;
  const dataBefore = await one(db, snapSql);
  if (!(await run(db, `${L}apply 0044_color_belt_rolling_check.sql`, migration))) return null;
  record(`${L}0044 wrote no history row and moved no version (registrations, private testings, payment counts)`,
    dataBefore === (await one(db, snapSql)));
  const applied = await pre();
  record(`${L}[pre-apply check] after 0044: 4 / 0 / 2 / 1 / 8 / 0 / 8 / 1 / 0`,
    answer(applied) === '4 / 0 / 2 / 1 / 8 / 0 / 8 / 1 / 0', answer(applied));
  const fill = (await db.query(`select
      (select string_agg(r.first_name || ' ' || r.last_name || '=' || coalesce(r.paying_by || '/' || r.paying_by_on_form, r.paying_by || '/-'), ','
                         order by r.last_name collate "C")
         from public.testing_registrations r join public.testing_events e on e.id = r.event_id
        where e.public_code = '${TEST_EVENT_CODE}') as regs,
      (select string_agg(p.first_name || ' ' || p.last_name || '=' || coalesce(p.paying_by_on_form, '-'), ',' order by p.last_name collate "C")
         from public.testing_private p where p.first_name in ('Pat', 'Desk')) as privs,
      (select count(*)::int from public.testing_payments p where p.school is distinct from
         (select e.location_code from public.testing_registrations r join public.testing_events e on e.id = r.event_id where r.id = p.registration_id)) as pay_off,
      (select count(*)::int from public.testing_private_payments x where x.school is distinct from
         (select p.location_code from public.testing_private p where p.id = x.private_id)) as ppay_off,
      (select count(*)::int from public.testing_private_payments x join public.testing_private p on p.id = x.private_id
        where p.first_name = 'Pat') as pat_pays`)).rows[0];
  record(`${L}the fill: form rows from their insert row (Kim Ray cash although Paying by is check; Pat Lee cash), none without one (Nolog) or at the desk (Sam Ortiz)`,
    fill.regs === 'Nolog Form=card/-,Pat Lee=cash/cash,Sam Ortiz=card/-,Kim Ray=check/cash', fill.regs);
  record(`${L}the fill: the moved private testing has its registration's form choice, the desk one none`,
    fill.privs === 'Pat Lee=cash,Desk Private=-', fill.privs);
  record(`${L}the fill: every existing payment at the event's / private testing's school (the moved one included)`,
    fill.pay_off === 0 && fill.ppay_off === 0 && fill.pat_pays === 1, JSON.stringify(fill));

  const after = await printsOf(db, [...numbers, '0044']);
  const parts = (line) => line.split('  ');
  const CB = /^(testing_mark_paid_by|testing_private_mark_paid_by|testing_undo_payment|testing_private_undo_payment|testing_edit_payment|testing_private_edit_payment|testing_move_to_private|testing_private_undo_move|testing_undo_event_edit|testing_registrations_keep_form_choice|testing_private_keep_form_choice|testing_payments_set_school|testing_private_payments_set_school|testing_roster|testing_private_list|testing_registrations|testing_payments|testing_private|testing_private_payments)([.( ]|$)/;
  const moved = [];
  const wrong = [];
  for (const n of numbers) {
    const f = `${n}_fingerprints.sql`;
    const gone = before[f].filter((line) => !after[f].includes(line));
    const added = after[f].filter((line) => !before[f].includes(line));
    for (const line of [...gone.map((g) => `- ${g}`), ...added.map((a) => `+ ${a}`)]) {
      const item = n === '0003' ? parts(line.slice(2))[0] : parts(line.slice(2))[1];
      if (CB.test(item || '')) moved.push(`${n} ${line.slice(0, 1)} ${item}`);
      else wrong.push(`${n}: ${line}`);
    }
  }
  record(`${L}fingerprints: only Color Belt items moved (the replaced / new testing_* functions, the 4 tables, the 2 views); every Finance, Star, Camps, Black Belt and New students line byte-identical`,
    wrong.length === 0, wrong.join('; ') || `${numbers.length} files; moved: ${moved.join(' | ')}`);
  const movedFiles = [...new Set(moved.map((m) => m.slice(0, 4)))].sort();
  record(`${L}fingerprints: the files that moved are 0003, 0005, 0014 and 0030 only`,
    JSON.stringify(movedFiles) === JSON.stringify(['0003', '0005', '0014', '0030']), movedFiles.join(','));
  const prints44 = after['0044_fingerprints.sql'];
  const fn = (name) => prints44.find((l) => l.startsWith(`function  ${name}(`)) || '';
  const appFns = ['testing_mark_paid_by', 'testing_private_mark_paid_by', 'testing_undo_payment', 'testing_private_undo_payment',
    'testing_edit_payment', 'testing_private_edit_payment', 'testing_move_to_private', 'testing_private_undo_move', 'testing_undo_event_edit'];
  const trgFns = ['testing_registrations_keep_form_choice', 'testing_private_keep_form_choice', 'testing_payments_set_school',
    'testing_private_payments_set_school'];
  record(`${L}0044 fingerprints: the 9 app functions are security definer, search_path="", only postgres and authenticated may run them`,
    appFns.every((x) => fn(x).includes('definer=true') && fn(x).includes('settings=search_path=""')
      && fn(x).endsWith('rights=authenticated:EXECUTE,postgres:EXECUTE')), appFns.map(fn).join(' | '));
  record(`${L}0044 fingerprints: the 4 trigger functions are for nobody`,
    trgFns.every((x) => fn(x).includes('definer=false') && fn(x).includes('settings=search_path=""') && fn(x).endsWith('rights=postgres:EXECUTE')),
    trgFns.map(fn).join(' | '));
  record(`${L}0044 fingerprints: 13 functions, 4 columns, 2 views, 4 triggers, 4 rules`,
    prints44.length === 27 && prints44.filter((l) => l.startsWith('function  ')).length === 13, `${prints44.length} lines`);

  // f. the tests after 0044
  await tests('after 0044', [['0044_tests.sql', 'ALL 0044 TESTS PASSED'], ...baseline]);

  // g. re-run safety
  const dataAfter = await one(db, snapSql);
  await run(db, `${L}apply 0044 a SECOND time (re-run safety)`, migration);
  const again = await printsOf(db, [...numbers, '0044']);
  const movedAgain = [...numbers, '0044'].filter((n) => JSON.stringify(after[`${n}_fingerprints.sql`]) !== JSON.stringify(again[`${n}_fingerprints.sql`]));
  record(`${L}0044 re-run: no fingerprint change, no row or history change`,
    movedAgain.length === 0 && (await one(db, snapSql)) === dataAfter, movedAgain.join(', '));

  // h. 0035 AFTER 0044 (rolled back): its guard accepts the 5-input version, and 0035's tests pass
  if (existsSync(path.join(supabaseDir, 'migrations', '0035_color_belt_cleanup.sql'))) {
    let applied35 = false;
    try {
      await db.exec('begin;');
      await db.exec(body(read('migrations', '0035_color_belt_cleanup.sql')));
      applied35 = (await one(db, `select count(*)::int from pg_proc where proname in ('testing_mark_paid', 'testing_private_mark_paid')`)) === 0;
    } catch (error) {
      record(`${L}0035 after 0044 (rolled back) goes in`, false, error.message);
      await db.exec('rollback;').catch(() => {});
    }
    if (applied35) {
      record(`${L}0035 after 0044 (rolled back) goes in: the old 2-input Mark paid functions are gone`, true);
      await runTestFileLive(db, `${L}0035_tests.sql (with 0044 then 0035, rolled back)`, '0035_tests.sql', 'ALL 0035 TESTS PASSED');
      await db.exec('rollback;').catch(() => {});
    }
    record(`${L}after the 0044 + 0035 try nothing of 0035 is kept`,
      (await one(db, `select count(*)::int from pg_proc where proname in ('testing_mark_paid', 'testing_private_mark_paid')`)) === 2);
  }

  // i. Undo 0044, as SETUP.md 0044e has it: paste the undo file it names
  const setup = read('SETUP.md').replace(/\r\n/g, '\n');
  const at = setup.search(/^### 0044e\. Undo 0044/m);
  const undoFile = 'manual/0044u_undo_color_belt_rolling_check.sql';
  const undoSql = read('manual', '0044u_undo_color_belt_rolling_check.sql');
  if (at < 0 || !setup.slice(at, at + 2000).includes(`supabase/${undoFile}`)) {
    record(`${L}[undo 0044] SETUP.md has "### 0044e. Undo 0044" naming supabase/${undoFile}`, false, 'heading or file name missing');
  } else {
    // i1. refused while a payment was taken at the other school's desk (planted, rolled back)
    let refusal = '';
    try {
      await db.exec('begin;');
      await db.exec(`insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, recorded_by_name, school)
        select r.id, 'payment', 100, 'cash', public.testing_today(), 'PGlite 0044u', 'shrewsbury'
          from public.testing_registrations r where r.first_name = 'Sam' and r.last_name = 'Ortiz';`);
      const planted = await pre();
      record(`${L}[undo 0044] the pre-apply check counts the planted Shrewsbury payment (payments_off_school 1)`,
        planted.payments_off_school === 1, JSON.stringify(planted));
      await db.exec(body(undoSql));
    } catch (error) {
      refusal = error.message;
    } finally {
      await db.exec('rollback;').catch(() => {});
    }
    record(`${L}[undo 0044] refused while a payment was taken at the other school's desk ("0044 undo refused: 1 payment row(s)")`,
      refusal.includes('0044 undo refused: 1 payment row(s)'), refusal || 'not refused');
    // i2. the undo on the clean database
    if (await run(db, `${L}[undo 0044] paste ${undoFile}`, undoSql)) {
      const undone = await printsOf(db, numbers);
      const back = numbers.filter((n) => JSON.stringify(before[`${n}_fingerprints.sql`]) !== JSON.stringify(undone[`${n}_fingerprints.sql`]));
      record(`${L}[undo 0044] every fingerprint file equals the one before 0044 (rights included)`,
        back.length === 0, back.length ? `differ: ${back.join(', ')}` : `${numbers.length} files`);
      const undone44 = await fingerprints(db, '0044_fingerprints.sql');
      record(`${L}[undo 0044] 0044_fingerprints.sql answers as before 0044 (0030's eight functions, nothing of 0044)`,
        JSON.stringify(undone44) === JSON.stringify(before44), undone44.join(' | '));
      const undonePre = await pre();
      record(`${L}[undo 0044] the pre-apply check answers as before 0044`, answer(undonePre) === answer(ready), answer(undonePre));
      await tests('after the undo', baseline);
      await run(db, `${L}[undo 0044] paste ${undoFile} a SECOND time`, undoSql);
      const undoneAgain = await printsOf(db, numbers);
      record(`${L}[undo 0044] a second undo changes nothing`,
        numbers.every((n) => JSON.stringify(undone[`${n}_fingerprints.sql`]) === JSON.stringify(undoneAgain[`${n}_fingerprints.sql`])));
      if (await run(db, `${L}[undo 0044] apply 0044 again (redo)`, migration)) {
        const redo = await fingerprints(db, '0044_fingerprints.sql');
        record(`${L}[undo 0044] after the redo the 0044 fingerprints equal the tested ones`, JSON.stringify(redo) === JSON.stringify(prints44));
        const redoFill = (await db.query(`select string_agg(r.first_name || '=' || coalesce(r.paying_by_on_form, '-'), ',' order by r.first_name collate "C")
            from public.testing_registrations r join public.testing_events e on e.id = r.event_id
           where e.public_code = '${TEST_EVENT_CODE}'`)).rows[0].string_agg;
        record(`${L}[undo 0044] the redo fills paying_by_on_form the same way again`, redoFill === 'Kim=cash,Nolog=-,Pat=cash,Sam=-', redoFill);
        await tests('after the redo', [['0044_tests.sql', 'ALL 0044 TESTS PASSED']]);
      }
    }
  }
  await db.close().catch(() => {});
  return prints44;
}

function finish() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed, ${warnings.length} warning(s).`);
  if (warnings.length) {
    console.log('WARNINGS (accepted, not failures):');
    for (const w of warnings) console.log(`  - ${w.name}: ${w.detail}`);
  }
  if (failed.length) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
  }
  process.exitCode = failed.length ? 1 : 0;
}

// =====================================================================
// step0037: Finance - Export keeps "private" (0037, design review pass 1,
// Fix-Finance.md "Smaller")
// ---------------------------------------------------------------------
// On its OWN fresh database built in the production order with every
// live migration (liveOrderTo0025, then 0027, 0026, 0028, 0029, 0031,
// 0030, 0032, 0033, 0034, 0036, 0041, 0042, 0043 and 0039 - the order
// they were pasted; each only if its file is on this branch):
//   a. 0037_fingerprints.sql is connector-safe (no "delete" / "drop")
//   b. before 0037, finance_export is 0026's (the md5 the guard names)
//   c. the guard: 0037 stops - and changes nothing - when the live
//      function is not 0026's (a changed copy is planted, rolled back)
//   d. apply 0037: in every fingerprints file only the finance_export
//      line moves, and only its code md5 (0026's -> 0037's; definer,
//      settings, owner and rights stay)
//   e. 0037_tests.sql, then 0011's, camps' 0017's, 0018's, 0026's tests
//      and finance_camp_refunds_tests.sql again
//   f. 0037 applied a SECOND time: no fingerprint changes
// Run only this step with   node run.mjs --only-step0037
// =====================================================================
const MD5_0026_EXPORT = '21eedfa15256ea81d56dd2dc8e7a5706';
const MD5_0037_EXPORT = 'f812a5b147fda8d8603afe907abd2137';

async function step0037() {
  const L = '[0037] ';
  record(`${L}0037_fingerprints.sql contains neither "delete" nor "drop" (connector-safe)`,
    !/delete|drop/i.test(read('tests', '0037_fingerprints.sql')));
  const db = await buildBase(L);
  if (!db) return null;
  if (!(await liveOrderTo0025(db, L))) return null;
  const order = [['0027', '0027_camps_edit_guard.sql'], ['0026', '0026_finance_black_belt.sql'], ['0028', '0028_star_start_times.sql'],
    ['0029', '0029_finance_reminder_5min.sql'], ['0031', '0031_class_ages.sql'], ['0030', '0030_color_belt_review.sql'],
    ['0032', '0032_black_belt_review.sql'], ['0033', '0033_camps_design_review.sql'], ['0034', '0034_black_belt_history_ids.sql'],
    ['0036', '0036_new_students_profile.sql'], ['0041', '0041_star_end_time.sql'], ['0042', '0042_forms_copy_to_school.sql'],
    ['0043', '0043_camps_fill_in.sql'], ['0039', '0039_camps_record_refund.sql']];
  const applied = [];
  for (const [n, file] of order) {
    if (!existsSync(path.join(supabaseDir, 'migrations', file))) continue;
    if (!(await run(db, `${L}apply ${n}`, read('migrations', file)))) return null;
    applied.push(n);
  }
  const migration = read('migrations', '0037_finance_export_private.sql');
  const fnMd5 = `select md5(regexp_replace(regexp_replace(p.prosrc, '--[^\\n]*', '', 'g'), '\\s+', '', 'g'))
                   from pg_proc p where p.oid = to_regprocedure('public.finance_export(text, date, date)')`;
  record(`${L}before 0037 finance_export is 0026's (md5 ${MD5_0026_EXPORT})`, (await one(db, fnMd5)) === MD5_0026_EXPORT);

  // c. the guard refuses a function that isn't 0026's (planted in a transaction, rolled back)
  {
    let message = '';
    try {
      await db.exec(`begin;
        create or replace function public.finance_export(p_location_code text, p_from date, p_to date)
        returns jsonb language plpgsql volatile security definer set search_path = '' as $$ begin return '{}'::jsonb; end; $$;
        ${migration}`);
    } catch (error) {
      message = error.message;
    }
    await db.exec('rollback;').catch(() => {});
    record(`${L}the guard refuses 0037 over a changed finance_export (it stops, nothing changes)`,
      message.includes('rebuild 0037 first') && (await one(db, fnMd5)) === MD5_0026_EXPORT, message || 'it ran');
  }

  // d. apply: only finance_export's code md5 moves
  const numbers = [...NUMBERS_0025, ...applied, '0037']
    .filter((n, i, all) => all.indexOf(n) === i && existsSync(path.join(supabaseDir, 'tests', `${n}_fingerprints.sql`)));
  const before = await printsOf(db, numbers);
  const exportsBefore = await one(db, 'select count(*)::integer from public.finance_exports');
  if (!(await run(db, `${L}apply 0037_finance_export_private.sql`, migration))) return null;
  const after = await printsOf(db, numbers);
  const isFn = (line) => /^function {2}finance_export\(/.test(line);
  const wrong = [];
  const movedIn = [];
  for (const n of numbers) {
    const f = `${n}_fingerprints.sql`;
    const gone = before[f].filter((line) => !after[f].includes(line));
    const added = after[f].filter((line) => !before[f].includes(line));
    if (!gone.length && !added.length) continue;
    if (gone.length !== 1 || added.length !== 1 || !isFn(gone[0]) || !isFn(added[0])) {
      wrong.push(`${n}: ${JSON.stringify({ gone, added })}`);
      continue;
    }
    movedIn.push(n);
    // only the 32-character code md5 may differ; it must go from 0026's to 0037's
    const g = gone[0].replace(MD5_0026_EXPORT, '<md5>');
    const a = added[0].replace(MD5_0037_EXPORT, '<md5>');
    if (g === gone[0] || a === added[0] || g !== a) {
      wrong.push(`${n}: more than the code md5 changed, or not 0026's -> 0037's: ${gone[0]} => ${added[0]}`);
    }
  }
  record(`${L}fingerprints: only finance_export's code md5 moved (0026's -> 0037's), every other line of every file byte-identical`,
    wrong.length === 0 && movedIn.includes('0037') && movedIn.includes('0026'),
    wrong.join('; ') || `moved in ${movedIn.join(', ')}; ${numbers.length} files checked`);
  const prints37 = after['0037_fingerprints.sql'];
  record(`${L}0037 fingerprints: definer, search_path="", only authenticated (+ owner) may run it, volatile plpgsql jsonb`,
    prints37.length === 2
      && prints37.some((l) => isFn(l) && l.includes(MD5_0037_EXPORT) && l.includes('definer=true') && l.includes('settings=search_path=""')
        && /rights=authenticated:EXECUTE,postgres:EXECUTE$/.test(l))
      && prints37.some((l) => l.startsWith('function-kind') && l.endsWith('volatility=v language=plpgsql returns=jsonb')),
    prints37.join(' | '));
  record(`${L}applying 0037 wrote nothing (no export log row)`,
    (await one(db, 'select count(*)::integer from public.finance_exports')) === exportsBefore);

  // e. the tests
  const testFiles = [['0037_tests.sql', 'ALL 0037 TESTS PASSED'], ['0011_tests.sql', 'ALL 0011 TESTS PASSED'],
    [CAMPS_TESTS, 'ALL 0017 TESTS PASSED'], ['0018_tests.sql', 'ALL 0018 TESTS PASSED'], ['0026_tests.sql', 'ALL 0026 TESTS PASSED'],
    ['finance_camp_refunds_tests.sql', 'ALL FINANCE CAMP REFUND TESTS PASSED']];
  for (const [file, ok] of testFiles) {
    if (file === 'finance_camp_refunds_tests.sql' && !applied.includes('0039')) continue;
    if (existsSync(path.join(supabaseDir, 'tests', file))) await runTestFile(db, `${L}${file} (after 0037)`, file, ok);
  }

  // f. re-run safety
  await run(db, `${L}apply 0037 a SECOND time (re-run safety)`, migration);
  const again = await printsOf(db, numbers);
  const movedAgain = numbers.filter((n) => JSON.stringify(after[`${n}_fingerprints.sql`]) !== JSON.stringify(again[`${n}_fingerprints.sql`]));
  record(`${L}0037 re-run: no fingerprint changed`, movedAgain.length === 0, movedAgain.join(', '));
  await runTestFile(db, `${L}0037_tests.sql (after the re-run)`, '0037_tests.sql', 'ALL 0037 TESTS PASSED');
  await db.close().catch(() => {});
  return prints37;
}

// =====================================================================
// step0047: Finance Batch A - payment lines count at the school stored on
// the payment, and was_school (0047, design review pass 1 R1-01)
// ---------------------------------------------------------------------
// On its OWN fresh database built in the production order (liveOrderTo0025,
// then 0027, 0026, 0028, 0029, 0031, 0030, 0032, 0033, 0034, 0036, 0041,
// 0042, 0043, 0039 and 0037 - each only if its file is on this branch),
// then the school column on each payment table: Color Belt's 0035 and
// 0044 (on main) and Star's 0038 when its file is in supabase/migrations/
// (after that branch merges), else the stand-in fixtures/0047_standin_star_school.sql:
//   a. 0047_fingerprints.sql is connector-safe (no "delete" / "drop")
//   b. before 0047 the five functions are the live text (the md5s the
//      migration's guard names)
//   c. the guard: 0047 stops - and changes nothing - when a live function
//      is not the live text (a changed copy is planted, rolled back)
//   d. apply 0047: in every fingerprints file only the five functions'
//      lines move (code md5 from the live text to 0047's; result tables of
//      the two internal helpers); 0047's own fingerprints are as planned
//   e. 0047_tests.sql, then 0037's, 0011's, camps' 0017's, 0018's, 0026's
//      tests and finance_camp_refunds_tests.sql again
//   f. 0047 applied a SECOND time: no fingerprint changes
// Run only this step with   node run.mjs --only-step0047
// =====================================================================
const MD5_0047 = {
  "old": {
    "finance_money_rows_core": "77bc764dfe331a09919ac7c72962b76c",
    "finance_money_rows": "6882b0a0f80407ba97864f47feae0e7f",
    "finance_day": "3f6831f61735e1447c5974cc1dcba2ff",
    "finance_payment_detail": "31e25e5951b33aeac8ee4900271f885a",
    "finance_export": "f812a5b147fda8d8603afe907abd2137"
  },
  "new": {
    "finance_money_rows_core": "11479fb6451a956b5f8bb5bc6b5c0366",
    "finance_money_rows": "6882b0a0f80407ba97864f47feae0e7f",
    "finance_day": "8cb806284e54443fb73bd4a8f679b617",
    "finance_payment_detail": "cc90ec717325831a58a3063c9cb73c12",
    "finance_export": "0f4b678f757bca72fec14bb78aacd37d"
  }
};
const FIVE_0047 = ['finance_money_rows_core', 'finance_money_rows', 'finance_day', 'finance_payment_detail', 'finance_export'];

async function step0047() {
  const L = '[0047] ';
  record(`${L}0047_fingerprints.sql contains neither "delete" nor "drop" (connector-safe)`,
    !/delete|drop/i.test(read('tests', '0047_fingerprints.sql')));
  const db = await buildBase(L);
  if (!db) return null;
  if (!(await liveOrderTo0025(db, L))) return null;
  const order = [['0027', '0027_camps_edit_guard.sql'], ['0026', '0026_finance_black_belt.sql'], ['0028', '0028_star_start_times.sql'],
    ['0029', '0029_finance_reminder_5min.sql'], ['0031', '0031_class_ages.sql'], ['0030', '0030_color_belt_review.sql'],
    ['0032', '0032_black_belt_review.sql'], ['0033', '0033_camps_design_review.sql'], ['0034', '0034_black_belt_history_ids.sql'],
    ['0036', '0036_new_students_profile.sql'], ['0041', '0041_star_end_time.sql'], ['0042', '0042_forms_copy_to_school.sql'],
    ['0043', '0043_camps_fill_in.sql'], ['0039', '0039_camps_record_refund.sql'], ['0037', '0037_finance_export_private.sql']];
  const applied = [];
  for (const [n, file] of order) {
    if (!existsSync(path.join(supabaseDir, 'migrations', file))) continue;
    if (!(await run(db, `${L}apply ${n}`, read('migrations', file)))) return null;
    applied.push(n);
  }
  // the school column on each payment table: Color Belt's real 0035 + 0044 (on main since 2026-11-07), then Star's
  // real 0038 when it is on this branch, else the stand-in that adds star_payments.school
  const real = (n) => readdirSync(path.join(supabaseDir, 'migrations')).find((f) => f.startsWith(`${n}_`) && f.endsWith('.sql'));
  for (const n of ['0035', '0044', '0038']) {
    if (!real(n)) continue;
    if (!(await run(db, `${L}apply ${n} (the real file)`, read('migrations', real(n))))) return null;
    applied.push(n);
  }
  if (!real('0038')) {
    console.log(`${L}0038 is not on this branch yet: the stand-in fixture adds star_payments.school`);
    if (!(await run(db, `${L}apply the stand-in for 0038 (school column on star_payments)`,
      read('tests', 'pglite', 'fixtures', '0047_standin_star_school.sql')))) return null;
  }
  const migration = read('migrations', '0047_finance_stored_school.sql');
  const sigs = {
    finance_money_rows_core: 'public.finance_money_rows_core(text, date, date, text, uuid)',
    finance_money_rows: 'public.finance_money_rows(text, date, date)',
    finance_day: 'public.finance_day(text, date)',
    finance_payment_detail: 'public.finance_payment_detail(text, uuid)',
    finance_export: 'public.finance_export(text, date, date)',
  };
  const md5Of = async (name) => one(db, `select md5(regexp_replace(regexp_replace(p.prosrc, '--[^\\n]*', '', 'g'), '\\s+', '', 'g'))
                                           from pg_proc p where p.oid = to_regprocedure('${sigs[name]}')`);
  for (const name of FIVE_0047) {
    record(`${L}before 0047 ${name} is the live text (md5 ${MD5_0047.old[name]})`, (await md5Of(name)) === MD5_0047.old[name]);
  }

  // c. the guard refuses a changed function (planted in a transaction, rolled back)
  {
    let message = '';
    try {
      await db.exec(`begin;
        create or replace function public.finance_day(p_location_code text, p_day date)
        returns jsonb language plpgsql stable security definer set search_path = '' as $$ begin return '{}'::jsonb; end; $$;
        ${migration}`);
    } catch (error) {
      message = error.message;
    }
    await db.exec('rollback;').catch(() => {});
    record(`${L}the guard refuses 0047 over a changed finance_day (it stops, nothing changes)`,
      message.includes('rebuild 0047 first') && (await md5Of('finance_day')) === MD5_0047.old.finance_day, message || 'it ran');
  }

  // d. apply: only the five functions' lines move
  const numbers = [...NUMBERS_0025, ...applied, '0047']
    .filter((n, i, all) => all.indexOf(n) === i && existsSync(path.join(supabaseDir, 'tests', `${n}_fingerprints.sql`)));
  const before = await printsOf(db, numbers);
  if (!(await run(db, `${L}apply 0047_finance_stored_school.sql`, migration))) return null;
  const after = await printsOf(db, numbers);
  const nameOf = (line) => (/^function(?:-kind)? {1,2}([a-z_0-9]+)\(/.exec(line) ?? [])[1];
  const wrong = [];
  const movedIn = [];
  for (const n of numbers) {
    const f = `${n}_fingerprints.sql`;
    const gone = before[f].filter((line) => !after[f].includes(line));
    const added = after[f].filter((line) => !before[f].includes(line));
    if (!gone.length && !added.length) continue;
    if (gone.length !== added.length || ![...gone, ...added].every((line) => FIVE_0047.includes(nameOf(line)))) {
      wrong.push(`${n}: ${JSON.stringify({ gone, added })}`);
      continue;
    }
    for (const g of gone) {
      const a = added.find((line) => nameOf(line) === nameOf(g) && line.startsWith(g.split(/ {1,2}/)[0] + ' '));
      if (!a) { wrong.push(`${n}: no matching new line for ${g}`); continue; }
      if (g.startsWith('function-kind')) {
        // an internal helper's result table gained was_school; nothing else of the kind line moved
        if (!a.includes('was_school') || g.includes('was_school')) wrong.push(`${n}: ${g} => ${a}`);
      } else {
        const name = nameOf(g);
        if (g.replace(MD5_0047.old[name], '<md5>') !== a.replace(MD5_0047.new[name], '<md5>') || !g.includes(MD5_0047.old[name]) || !a.includes(MD5_0047.new[name])) {
          wrong.push(`${n}: more than the code md5 changed: ${g} => ${a}`);
        }
      }
    }
    movedIn.push(n);
  }
  record(`${L}fingerprints: only the five functions' lines moved (code md5 live text -> 0047's; the helpers' result tables gained was_school), every other line of every file byte-identical`,
    wrong.length === 0 && movedIn.includes('0047') && movedIn.includes('0026') && movedIn.includes('0037'),
    wrong.join('; ') || `moved in ${movedIn.join(', ')}; ${numbers.length} files checked`);
  const prints47 = after['0047_fingerprints.sql'];
  const fnLine = (name) => prints47.find((l) => /^function {2}/.test(l) && nameOf(l) === name) ?? '';
  const kindLine = (name) => prints47.find((l) => l.startsWith('function-kind') && nameOf(l) === name) ?? '';
  const planned = FIVE_0047.every((name) => {
    const l = fnLine(name);
    const appFn = ['finance_day', 'finance_payment_detail', 'finance_export'].includes(name);
    return l.includes(MD5_0047.new[name]) && l.includes('settings=search_path=""') && l.includes(`definer=${appFn}`)
      && (appFn ? /rights=authenticated:EXECUTE,postgres:EXECUTE$/.test(l) : l.endsWith('rights=postgres:EXECUTE'));
  });
  record(`${L}0047 fingerprints: ten lines; the five functions' md5, definer, search_path="" and rights as planned (app functions: authenticated only; helpers: owner only); both helpers' tables end with was_school`,
    prints47.length === 10 && planned
      && kindLine('finance_money_rows_core').includes('was_school text)') && kindLine('finance_money_rows').includes('was_school text)'),
    prints47.join(' | '));

  // e. the tests
  const testFiles = [['0047_tests.sql', 'ALL 0047 TESTS PASSED'], ['0037_tests.sql', 'ALL 0037 TESTS PASSED'], ['0011_tests.sql', 'ALL 0011 TESTS PASSED'],
    [CAMPS_TESTS, 'ALL 0017 TESTS PASSED'], ['0018_tests.sql', 'ALL 0018 TESTS PASSED'], ['0026_tests.sql', 'ALL 0026 TESTS PASSED'],
    ['finance_camp_refunds_tests.sql', 'ALL FINANCE CAMP REFUND TESTS PASSED']];
  for (const [file, ok] of testFiles) {
    if (file === 'finance_camp_refunds_tests.sql' && !applied.includes('0039')) continue;
    if (existsSync(path.join(supabaseDir, 'tests', file))) await runTestFile(db, `${L}${file} (after 0047)`, file, ok);
  }

  // f. re-run safety
  await run(db, `${L}apply 0047 a SECOND time (re-run safety)`, migration);
  const again = await printsOf(db, numbers);
  const movedAgain = numbers.filter((n) => JSON.stringify(after[`${n}_fingerprints.sql`]) !== JSON.stringify(again[`${n}_fingerprints.sql`]));
  record(`${L}0047 re-run: no fingerprint changed`, movedAgain.length === 0, movedAgain.join(', '));
  await runTestFile(db, `${L}0047_tests.sql (after the re-run)`, '0047_tests.sql', 'ALL 0047 TESTS PASSED');
  await db.close().catch(() => {});
  return prints47;
}

// =====================================================================
// stepFinanceCampRefunds: Finance's R1-05 (design review, rolling check
// pass 1) - camp refunds in the live Finance functions
// ---------------------------------------------------------------------
// Camps' migration 0039 adds kind 'refund' to camp_payments. Finance's
// functions (0026's versions) already read camp_payments by kind, so this
// step proves they need no change: on its OWN fresh database built in the
// production order with every live migration (liveOrderTo0025, then 0027,
// 0026, 0028, 0029, 0031, 0030, 0032, 0033, 0034, 0036, 0041, 0042, 0043
// and Finance's 0037 - each only if its file is on this branch; 0037 so
// the Export check runs on the newest finance_export), 0039 is applied and
// finance_camp_refunds_tests.sql runs (Daily report, Close the day,
// History, Export, payment detail, an Undo after the close, the real
// 0039 writer, privacy keys).
// Where 0039 comes from: supabase/migrations/0039_camps_record_refund.sql
// when this branch has it (after Camps merges into main); before that, the
// file named by the environment variable TKD_MIGRATION_0039, e.g. a copy
// made with   git show 19e727b:supabase/migrations/0039_camps_record_refund.sql
// With neither, the step is skipped and says so (not a failure); a
// TKD_MIGRATION_0039 that names no file IS a failure.
// Run only this step with   node run.mjs --only-stepFinanceCampRefunds
// =====================================================================
async function stepFinanceCampRefunds() {
  const L = '[Finance R1-05] ';
  const inRepo = path.join(supabaseDir, 'migrations', '0039_camps_record_refund.sql');
  const fromEnv = process.env.TKD_MIGRATION_0039 || '';
  const source = existsSync(inRepo) ? inRepo : (fromEnv && existsSync(fromEnv) ? fromEnv : null);
  if (!source) {
    // a name given but no file there is a mistake, not a skip
    if (fromEnv) record(`${L}TKD_MIGRATION_0039 names a file that exists`, false, fromEnv);
    else console.log(`${L}skipped: 0039 is not on this branch and TKD_MIGRATION_0039 is not set`);
    return;
  }
  console.log(`${L}0039 read from ${source === inRepo ? 'this branch' : source}`);
  const db = await buildBase(L);
  if (!db) return;
  if (!(await liveOrderTo0025(db, L))) return;
  for (const [label, file] of [['0027 (camps edit guard)', '0027_camps_edit_guard.sql'],
    ['0026 (Finance: Black Belt payments)', '0026_finance_black_belt.sql'], ['0028 (Star start times)', '0028_star_start_times.sql'],
    ['0029 (Finance reminder every 5 minutes)', '0029_finance_reminder_5min.sql'], ['0031 (class ages)', '0031_class_ages.sql'],
    ['0030 (Color Belt design review)', '0030_color_belt_review.sql'], ['0032 (Black Belt design review)', '0032_black_belt_review.sql'],
    ['0033 (Camps design review)', '0033_camps_design_review.sql'], ['0034 (Black Belt history ids)', '0034_black_belt_history_ids.sql'],
    ['0036 (New students profile)', '0036_new_students_profile.sql'], ['0041 (Star end time)', '0041_star_end_time.sql'],
    ['0042 (copy a form to the other school)', '0042_forms_copy_to_school.sql'], ['0043 (Camps Fill in)', '0043_camps_fill_in.sql'],
    ['0037 (Finance: Export keeps "private")', '0037_finance_export_private.sql']]) {
    if (!existsSync(path.join(supabaseDir, 'migrations', file))) continue;
    if (!(await run(db, `${L}apply ${label}`, read('migrations', file)))) return;
  }
  if (!(await run(db, `${L}apply 0039 (Camps Record refund)`, readFileSync(source, 'utf8')))) return;
  await runTestFile(db, `${L}finance_camp_refunds_tests.sql`, 'finance_camp_refunds_tests.sql', 'ALL FINANCE CAMP REFUND TESTS PASSED');
  // the Finance and camps tests that were there before still pass with 0039
  for (const [file, ok] of [[CAMPS_TESTS, 'ALL 0017 TESTS PASSED'], ['0018_tests.sql', 'ALL 0018 TESTS PASSED'],
    ['0026_tests.sql', 'ALL 0026 TESTS PASSED']]) {
    await runTestFile(db, `${L}${file} (after 0039)`, file, ok);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
