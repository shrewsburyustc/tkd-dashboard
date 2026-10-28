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

import { readFileSync, existsSync } from 'node:fs';
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
    for (const [label, sql, limit] of [
      ['bb_grading_grid (one Dan, 60 rows)', `select public.bb_grading_grid('${newest}', 1) as r`, 200],
      ['bb_cycle_results (one Dan)', `select public.bb_cycle_results('${newest}', 1) as r`, 200],
      ['bb_cycle_results (every Dan)', `select public.bb_cycle_results('${newest}', null) as r`, 200],
      ['bb_makeup_list (11 earlier cycles)', `select public.bb_makeup_list('${newest}') as r`, 300],
      ['one bb_set_grade', `select public.bb_set_grade((select id from public.bb_candidates where cycle_id = '${newest}' and source = 'desk' limit 1), 1, '88de8004', 'B') as r`, 50]]) {
      try {
        const ms = await time(sql);
        record(`${S}${label} <= ${limit} ms`, ms <= limit, `${ms.toFixed(1)} ms (median of 3)`);
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
