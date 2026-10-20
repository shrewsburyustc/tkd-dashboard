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
//       AFTER steps 11 and 12 (it replaces five 0005 functions, so 0005 itself is
//       never applied again after this - only its TEST files run):
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
//         g. LAST, on the main database (nothing runs on it afterwards;
//            it runs after step 14): the down-script of SETUP section
//            14e, both steps exactly as written there (re-run 0005, then
//            the SQL block). Afterwards the 0005 fingerprints must equal
//            step 11's (= a database that never had 0010), change_log must
//            have one undo_0010 row per removed result, and 0005_tests.sql
//            / 0003_tests.sql pass.
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
//         h. OLD vs NEW, on a third database: the big seed with the
//            PRODUCTION copy of 0011 (whose chain builder is the slow but
//            proven one): every 7th day of the 5 years, both schools, the
//            items and figures are written down; today's 0011 is applied
//            over it and every one of those days must give exactly the
//            same items and figures
//         i. COLLATION, on a fourth database whose text sorting is ICU
//            "en-US" like production's (punctuation is ignored, so e.g.
//            '~end' sorts BEFORE 'color_belt'; PGlite's normal databases
//            sort byte by byte, "C"): all migrations, 0011_tests.sql and the
//            speed + correctness check of g again. A Finance function that
//            relied on text order would give wrong answers there.
//
//   15. 0013 (Camps), on its OWN fresh database (stepCamps; the main one
//       ends step 13 with the 0010 down-script, so it no longer looks like
//       production): the live order of step 18 (0001-0006, 0010, 0007,
//       0008, 0009, 0012, 0015, 0011, 0019), then 0013, its tests and
//       every earlier test file (0011's and the new-students' included), live
//       checks AS camps_registrar, a seeded TEST camp, a second apply
//       (re-run safety), 0017 on top (step 19b), and last the "Undo 0013"
//       script of SETUP.md - see stepCamps below.
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
//   19. 0017 (camp payments in Finance, v0.707): on the MAIN database
//       (0013 put on first) every Finance answer must be identical before
//       and after 0017, its tests + 0011's + 0013's pass, re-run safety, the
//       "Undo 0017" of SETUP.md; then two fresh databases with 0011's big
//       seed + a big camp seed for speed and right answers (one sorting
//       text like production) - see stepFinanceCamps below.
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

  // 13. Color Belt phase 3 (0010), only if 0005 is in place. Runs LAST: it ends
  // with the 0010 down-script check (13g) on the main database.
  let after10 = null;
  if (after5) {
    console.log('\nMigration 0010 (grading results):');
    after10 = await step13(db, upgradeHas0005 ? upgradeDb : null, after5);
  }

  // 14. Finance (0011), after 0010 and before 13g (the 0010 down-script,
  // which must stay the last thing on the main database).
  let after11 = null;
  if (after6 && after10) {
    console.log('\nMigration 0011 (Finance):');
    after11 = await step14(db, upgradeHas0005 ? upgradeDb : null);
  } else {
    record('0011 (Finance)', false, 'skipped: 0006 or 0010 could not be applied (see the lines above)');
  }

  // 14h + 14i. old vs new chain builder; the ICU-collation database
  if (after11) {
    console.log('\n0011 old vs new chain builder (big seed):');
    await financeOldVsNew();
    console.log('\n0011 on a database that sorts text like production (ICU en-US):');
    await financeIcuCheck();
  }

  // 19. camp payments in Finance (0017): on the main database (with 0013
  // put on first), then the speed / ICU databases
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

  // 13g. the down-script (SETUP section 14e), LAST
  if (after5 && after10) {
    console.log('\nUndo 0010 (SETUP section 14e), last:');
    await downScriptCheck(db, after5);
  }

  // 15. Camps (0013), on its own fresh database
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
  if (after11) {
    console.log('\n0011 fingerprints (kind  item  detail):');
    for (const line of after11) console.log('  ' + line);
  }
  if (after13) {
    console.log('\n0013 fingerprints (kind  item  detail):');
    for (const line of after13) console.log('  ' + line);
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

// Step 12 on the main database (and 0010 on top of the upgrade database).
// Returns 0010's fingerprints (or null if 0010 could not be applied).
// after5 = step 11's 0005 fingerprints (a database without 0010), for g.
async function step13(db, upgradeDb, after5) {
  // a. apply 0010 + its tests
  if (!(await run(db, 'apply 0010_testing_results.sql', read('migrations', '0010_testing_results.sql')))) return null;
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
      const up10 = await fingerprints(upgradeDb, '0010_fingerprints.sql');
      record('[upgrade] 0010 fingerprints identical to the main database', JSON.stringify(up10) === JSON.stringify(after10), `${up10.length} rows`);
      await runTestFile(upgradeDb, '[upgrade] 0010_tests.sql', '0010_tests.sql', 'ALL 0010 TESTS PASSED');
      await runTestFile(upgradeDb, '[upgrade] 0005_tests.sql (after 0010)', '0005_tests.sql', 'ALL 0005 TESTS PASSED');
    }
  } else {
    record('[upgrade] 0010 on top of the upgrade database', false, 'the upgrade database has no 0005 (see the lines above)');
  }

  // g. the down-script (SETUP section 14e) runs from main(), after step 14
  return after10;
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
async function financeSpeedCheck(db, tag = '[speed]') {
  const t0 = Date.now();
  if (!(await run(db, `${tag} big seed (finance_perf_seed.sql)`, readFileSync(path.join(here, 'finance_perf_seed.sql'), 'utf8')))) return;
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
  const expectedRows = Number(await one(db, `select count(*) from public.testing_payments p
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


// 14h. Old vs new: the same big seed through the production copy of 0011
// and then through today's 0011 must give the same items and figures.
// One line per (day, both schools); the items and the figures of the day
// written as text (sorted byte by byte, collate "C").
const DAY_SIGNATURE_SQL = `
  select d.d::date::text as day,
         (select coalesce(string_agg(concat_ws('|', m.school, m.source, m.payment_id, m.row_id, m.day, m."time", m.state, m.kind,
                    m.method, m.amount_cents, m.was_amount_cents, m.was_method, m.moved_to, m.moved_from, m.changed_by_name,
                    m.changed_on, m.recorded_by_name, m.first_name, m.last_name, m.what, m.event_date, m.is_private, m.counts,
                    m.first_recorded_at, m.event_id),
                    ',' order by concat_ws('|', m.school, m.payment_id, m.row_id, m.state) collate "C"), '')
            from public.finance_money_rows(null, d.d::date, d.d::date) m) as items,
         (select string_agg(to_jsonb(f)::text, ',' order by f.school collate "C")
            from public.finance_figures(null, d.d::date, d.d::date) f) as figures
    from generate_series(public.testing_today() - 1825, public.testing_today(), interval '7 days') as d(d)
   order by 1`;

async function financeOldVsNew() {
  const db = await buildBase('[old vs new] ');
  if (!db) return;
  const ok = await run(db, '[old vs new] 0003 + seed + 0004 + 0005 + 0006 + 0010 + the PRODUCTION copy of 0011 + the big seed',
    read('migrations', '0003_testing_classes_ranks.sql') + '\n' + builtInSeedSql() + '\n'
    + read('migrations', '0004_staff_accounts.sql') + '\n' + read('migrations', '0005_testing_events.sql') + '\n'
    + read('migrations', '0006_star_testing.sql') + '\n' + read('migrations', '0010_testing_results.sql') + '\n'
    + readFileSync(path.join(here, 'fixtures', '0011_as_applied_2026-10-19.sql'), 'utf8') + '\n'
    + readFileSync(path.join(here, 'finance_perf_seed.sql'), 'utf8'));
  if (!ok) return;
  const t0 = Date.now();
  const before = (await db.query(DAY_SIGNATURE_SQL)).rows;
  const oldMs = Date.now() - t0;
  if (!(await run(db, '[old vs new] apply today\'s 0011 over it', read('migrations', '0011_finance.sql')))) return;
  const t1 = Date.now();
  const after = (await db.query(DAY_SIGNATURE_SQL)).rows;
  const newMs = Date.now() - t1;
  const items = before.reduce((n, r) => n + (r.items ? r.items.split(',').length : 0), 0);
  const differ = before.filter((r, i) => JSON.stringify(r) !== JSON.stringify(after[i])).map((r) => r.day);
  record('[old vs new] the same items and figures on every 7th day of 5 years (both schools)',
    before.length > 250 && items > 1000 && after.length === before.length && differ.length === 0,
    `${before.length} days, ${items} items; old builder ${oldMs} ms, new ${newMs} ms`
      + (differ.length ? `; differ on ${differ.slice(0, 5).join(', ')}` : ''));
  await db.close();
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
    await financeSpeedCheck(db, '[icu speed]');
  } catch (error) {
    record('[icu] the ICU-collation database', false, error.message);
  } finally {
    if (db) await db.close().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------
// Step 15: Camps (0013) - contract CONTRACT-0013.md section 2.2
// ---------------------------------------------------------------------
// The main database can't be used for this step: step 13g ends with the
// 0010 down-script, so it no longer looks like production. stepCamps
// therefore builds its OWN fresh database in production's (live) order,
// as step 18 does (0001-0006, 0010, 0007, 0008, 0009, 0012, 0015, 0011,
// 0019), and puts 0013 on top:
//   a. 0013_fingerprints.sql must not contain the words the Supabase
//      connection refuses
//   b. the 0003 / 0004 / 0005 / 0006 / 0010 / 0011 fingerprints (and the
//      new students' 0007 / 0008 / 0009 / 0012 / 0015 / 0019) are taken,
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
//   f2. 0017 (camp payments in Finance) on top, and its Undo - step 19b
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
  ];
  const earlierTests = async (cdb, label) => {
    for (const n of ['0019', '0015', '0012', '0009', '0008', '0007']) {
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
  // the live order (as step 18): 0003-0006, 0010, the new-students files, 0015, 0011, 0019
  for (const file of ['0003_testing_classes_ranks.sql', '0004_staff_accounts.sql', '0005_testing_events.sql',
    '0006_star_testing.sql', '0010_testing_results.sql', '0007_schedule.sql', '0008_calendar.sql', '0009_forms.sql',
    '0012_prospects.sql', '0015_family_history.sql', '0011_finance.sql', '0019_school_phone.sql']) {
    if (!(await run(cdb, `${L}apply ${file}`, read('migrations', file)))) return null;
  }

  // a. connector-safe fingerprints file
  record(`${L}0013_fingerprints.sql contains neither "delete" nor "drop" (connector-safe)`,
    !/delete|drop/i.test(read('tests', '0013_fingerprints.sql')));

  // b. apply 0013; the earlier fingerprints don't move
  const earlierBefore = await earlier(cdb);
  if (!(await run(cdb, `${L}apply 0013_camps.sql`, read('migrations', '0013_camps.sql')))) return null;
  record(`${L}0003-0012 / 0015 / 0019 fingerprints identical before/after 0013`,
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
// Step 19: camp payments in Finance (0017) - rulebook v0.707
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
//   19b. (in stepCamps) the same on the production-order database
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
