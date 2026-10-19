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
//       itself is applied again only as part of a down-script: 14i re-runs
//       0005 and 0010 as steps 1-2 of the 0014 down-script, and 13g re-runs
//       0005 again):
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
//            AFTER step 14i - the real removal order is 0014 down, then
//            0010 down: the down-script of SETUP section 14e, both steps
//            exactly as written there (re-run 0005, then the SQL block).
//            Afterwards the 0005 fingerprints must equal step 11's (= a
//            database that never had 0010), change_log must have one
//            undo_0010 row per removed result, and 0005_tests.sql /
//            0003_tests.sql pass. It runs only if 14i passed (otherwise a
//            failure "skipped: the 0014 down-script failed" is recorded).
//   14. 0014 (Color Belt phase 4: private testing) on the main database,
//       after 13a-13f (only if 0010 is in place; contract CONTRACT-0014.md
//       section 3.3):
//         a. the 0003 / 0004 / 0005 / 0006 / 0010 fingerprints are taken,
//            0014 is applied, and 0014_tests.sql must pass
//         b. 0004 and 0006 fingerprints IDENTICAL; 0003 identical except the
//            rows of the 5 new and the 9 replaced testing_* functions; 0005
//            differs only in its 7 replaced functions' rows and the
//            testing_registrations table row; 0010 only in its 6 replaced
//            functions' rows (and each of those rows really changed)
//         c. every earlier test file again (0010, 0005 with the new C3,
//            0006, 0003, 0004, 0002, PIN) - all must pass
//         d. the registrar live checks (11b) again, plus: it can't read
//            private_date and can't call the four private functions
//         e. one private day for a seeded family registration of the test
//            event (as postgres, labelled like 11c), so the re-run and the
//            down-script have data
//         f. 0014 applied a SECOND time: every registration's id / private
//            day / time / version and the history count unchanged, the
//            fingerprints (0014_fingerprints.sql) identical; 0014_tests.sql
//            and 0005_tests.sql pass again
//         g. the upgrade database: 0014 on top of its 0010; its 0014
//            fingerprints must equal the main database's (fresh = upgrade);
//            0014_tests.sql, 0010_tests.sql and 0005_tests.sql pass there
//         h. 0014_fingerprints.sql contains neither "delete" nor "drop"
//            (connector-safe); its rows are printed at the end
//         i. the 0014 down-script of SETUP section 15e, all three steps
//            exactly as written there (re-run 0005, re-run 0010, then the SQL
//            block). Afterwards both columns and the five 0014-only
//            functions are gone, the 0010 fingerprints equal 13e's, the 0005
//            and 0003 fingerprints equal 14a's, change_log has one undo_0014
//            row per cleared private day, and 0010_tests.sql /
//            0005_tests.sql pass. Then 13g runs.
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
async function buildBase(label = '') {
  const db = new PGlite({ extensions: { pgcrypto } });
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

  // 13. Color Belt phase 3 (0010), only if 0005 is in place (13a-13f).
  let after10 = null;
  let upgradeHas0010 = false;
  if (after5) {
    console.log('\nMigration 0010 (grading results):');
    ({ prints: after10, upgradeHas0010 } = await step13(db, upgradeHas0005 ? upgradeDb : null));
  }

  // 14. Color Belt phase 4 (0014), only if 0010 is in place. It ends with
  // the 0014 down-script (14i); then 13g - the 0010 down-script - runs
  // LAST on the main database (the real removal order: 0014, then 0010).
  let after14 = null;
  if (after10) {
    console.log('\nMigration 0014 (private testing):');
    const { prints, downOk } = await step14(db, upgradeHas0010 ? upgradeDb : null, after10);
    after14 = prints;
    console.log('\n0010 down-script (13g, after the 0014 down-script):');
    if (downOk) {
      await downScriptCheck(db, after5);
    } else {
      record('[undo 0010] 13g the 0010 down-script', false, 'skipped: the 0014 down-script failed');
    }
  }

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
  if (after14) {
    console.log('\n0014 fingerprints (kind  item  detail):');
    for (const line of after14) console.log('  ' + line);
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

// Step 13 on the main database (and 0010 on top of the upgrade database).
// Returns { prints: 0010's fingerprints (null if 0010 could not be
// applied), upgradeHas0010: true if 0010 is on the upgrade database too }.
// (13g, the 0010 down-script, is run by main() after step 14.)
async function step13(db, upgradeDb) {
  let upgradeHas0010 = false;
  // a. apply 0010 + its tests
  if (!(await run(db, 'apply 0010_testing_results.sql', read('migrations', '0010_testing_results.sql')))) return { prints: null, upgradeHas0010 };
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

  return { prints: after10, upgradeHas0010 };
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
// Step 14: Color Belt private testing (0014)
// ---------------------------------------------------------------------

// The functions 0014 adds and replaces (contract §2.3-§2.5), by name.
const NEW_0014_FNS = ['testing_private_time_is_valid', 'testing_amount_due',
  'testing_set_private', 'testing_clear_private', 'testing_add_private_student'];
const REPLACED_0005_FNS = ['testing_mark_paid', 'testing_change_paying_by', 'testing_purge_old_signatures'];
const REPLACED_0010_FNS = ['testing_set_result', 'testing_set_result_note', 'testing_update_student',
  'testing_resolve_duplicate', 'testing_restore_student', 'testing_update_event'];

// Every registration's id, private day, time and version, plus the
// history's row count, as one md5 (14f: "re-running changed nothing").
const snapshot14Sql = `select md5(
     coalesce((select string_agg(concat_ws('|', x.id, x.private_date, x.private_time, x.version), ',' order by x.id)
                 from public.testing_registrations x), '')
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
// "name(arguments)", a table's item its name.
const keyKind = (line) => line.split('  ').slice(0, 2).join(' ');
const nameKind = (line) => {
  const [kind, item] = line.split('  ');
  return kind === 'function' ? item.split('(')[0] : `${kind} ${item}`;
};

// Step 14 on the main database (and 0014 on top of the upgrade database).
// after10 = step 13e's 0010 fingerprints. Returns { prints: 0014's
// fingerprints (null if 0014 could not be applied), downOk: true if the
// 0014 down-script (14i) passed every check - main() runs 13g only then }.
async function step14(db, upgradeDb, after10) {
  // h (first). the fingerprints file must stay runnable through the connector
  const printsText = read('tests', '0014_fingerprints.sql');
  record('0014_fingerprints.sql contains neither "delete" nor "drop" (connector-safe)', !/delete|drop/i.test(printsText));

  // a. the earlier fingerprints, apply 0014, its tests
  const p3 = await fingerprints(db, '0003_fingerprints.sql');
  const p4 = await fingerprints(db, '0004_fingerprints.sql');
  const p5 = await fingerprints(db, '0005_fingerprints.sql');
  const p6 = await fingerprints(db, '0006_fingerprints.sql');
  const p10 = await fingerprints(db, '0010_fingerprints.sql');
  if (!(await run(db, 'apply 0014_testing_private.sql', read('migrations', '0014_testing_private.sql')))) {
    return { prints: null, downOk: false };
  }
  await runTestFile(db, '0014_tests.sql', '0014_tests.sql', 'ALL 0014 TESTS PASSED');

  // b. what 0014 may (and must) change in the earlier fingerprints
  record('[0014] 0004 fingerprints identical before/after 0014',
    JSON.stringify(p4) === JSON.stringify(await fingerprints(db, '0004_fingerprints.sql')));
  record('[0014] 0006 fingerprints identical before/after 0014',
    JSON.stringify(p6) === JSON.stringify(await fingerprints(db, '0006_fingerprints.sql')));
  const c3 = onlyTheseChanged(p3, await fingerprints(db, '0003_fingerprints.sql'), key3, name3,
    [...NEW_0014_FNS, ...REPLACED_0005_FNS, ...REPLACED_0010_FNS]);
  record('[0014] 0003 fingerprints differ only in the 5 new and the 9 replaced testing_* functions', c3.ok, c3.detail);
  const c5 = onlyTheseChanged(p5, await fingerprints(db, '0005_fingerprints.sql'), keyKind, nameKind,
    [...REPLACED_0005_FNS, 'testing_update_student', 'testing_resolve_duplicate', 'testing_restore_student',
      'testing_update_event', 'table testing_registrations']);
  record('[0014] 0005 fingerprints differ only in the 7 replaced functions and the testing_registrations table row', c5.ok, c5.detail);
  const c10 = onlyTheseChanged(p10, await fingerprints(db, '0010_fingerprints.sql'), keyKind, nameKind, REPLACED_0010_FNS);
  record('[0014] 0010 fingerprints differ only in the 6 replaced functions', c10.ok, c10.detail);

  // c. every earlier test file again
  await runTestFile(db, '0010_tests.sql (after 0014)', '0010_tests.sql', 'ALL 0010 TESTS PASSED');
  await runTestFile(db, '0005_tests.sql (after 0014, new C3)', '0005_tests.sql', 'ALL 0005 TESTS PASSED');
  await runTestFile(db, '0006_tests.sql (after 0014)', '0006_tests.sql', 'ALL 0006 TESTS PASSED');
  await runTestFile(db, '0003_tests.sql (after 0014)', '0003_tests.sql', 'ALL 0003 TESTS PASSED');
  await runTestFile(db, '0004_tests.sql (after 0014)', '0004_tests.sql', 'ALL 0004 TESTS PASSED');
  await runTestFile(db, '0002_tests.sql (after 0014)', '0002_tests.sql', 'ALL 0002 TESTS PASSED');
  await runTestFile(db, 'verify_pin_tests.sql (after 0014)', 'verify_pin_tests.sql', 'ALL PIN TESTS PASSED');

  // d. the family form's login can't reach the private columns or functions
  await registrarLiveChecks(db, [
    ['read testing_results', 'select 1 from public.testing_results limit 1'],
    ['call testing_set_result', 'select public.testing_set_result(gen_random_uuid(), null)'],
    ['read testing_registrations.private_date', 'select private_date from public.testing_registrations limit 1'],
    ['call testing_set_private', "select public.testing_set_private(gen_random_uuid(), 1, current_date, time '16:00')"],
    ['call testing_clear_private', 'select public.testing_clear_private(gen_random_uuid(), 1)'],
    ['call testing_add_private_student', "select public.testing_add_private_student(gen_random_uuid(), 'a', 'b', gen_random_uuid(), true, 'cash', current_date, time '16:00')"],
    ['call testing_amount_due', 'select public.testing_amount_due(gen_random_uuid())'],
  ]);

  // e. one private day for a family registration of the test event (11c)
  await run(db, "[0014] a private day for the test event's family registration Pat Lee", `
    begin;
    select set_config('request.jwt.claims', '', true);
    select set_config('tkd.actor_label', 'PGlite test event', true);
    select set_config('tkd.action', 'seed', true);
    select set_config('tkd.batch_id', gen_random_uuid()::text, true);
    update public.testing_registrations r
       set private_date = public.testing_today() + 10, private_time = time '16:00'
     where r.first_name = 'Pat' and r.last_name = 'Lee' and r.source = 'form';
    select set_config('tkd.actor_label', '', true);
    select set_config('tkd.action', '', true);
    select set_config('tkd.batch_id', '', true);
    commit;`);
  const privateCount = await one(db, 'select count(*)::int from public.testing_registrations where private_date is not null');
  record('[0014] the test event has one private registration', privateCount === 1, `${privateCount} private`);

  // f. re-run safety
  const before14 = await fingerprints(db, '0014_fingerprints.sql');
  const data14Before = await one(db, snapshot14Sql);
  await run(db, 'apply 0014 a SECOND time (re-run safety)', read('migrations', '0014_testing_private.sql'));
  const data14After = await one(db, snapshot14Sql);
  record('0014 re-run kept every registration (id, private day, time, version) and the history count unchanged', data14Before === data14After);
  const after14 = await fingerprints(db, '0014_fingerprints.sql');
  record('0014 fingerprints identical before/after re-run (18 rows)',
    JSON.stringify(before14) === JSON.stringify(after14) && after14.length === 18, `${after14.length} rows`);
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

  // i. the 0014 down-script (SETUP section 15e)
  const downOk = await downScript14Check(db, { p3, p5, after10, privateCount });
  return { prints: after14, downOk };
}

// 14i. SETUP section 15e: step 1 (re-run 0005), step 2 (re-run 0010),
// step 3 (the SQL block, read from SETUP.md so the tested text is the
// documented text). Returns true only if every step and check passed.
async function downScript14Check(db, { p3, p5, after10, privateCount }) {
  const failuresBefore = results.filter((r) => !r.ok).length;
  const setup = read('SETUP.md').replace(/\r\n/g, '\n');
  const start = setup.indexOf('### 15e.');
  const block = start < 0 ? null : setup.slice(start).match(/```sql\n([\s\S]*?)```/);
  if (!block) {
    record('[undo 0014] find the down-script in SETUP section 15e', false, 'no sql block after "### 15e."');
    return false;
  }
  const logBefore = await one(db, 'select count(*)::int from public.change_log');
  if (!(await run(db, '[undo 0014] step 1: re-run 0005', read('migrations', '0005_testing_events.sql')))) return false;
  if (!(await run(db, '[undo 0014] step 2: re-run 0010', read('migrations', '0010_testing_results.sql')))) return false;
  if (!(await run(db, '[undo 0014] step 3: the SQL block of SETUP 15e', block[1]))) return false;
  const gone = await one(db, `select not exists (select 1 from pg_attribute a
                                     where a.attrelid = 'public.testing_registrations'::regclass
                                       and a.attname in ('private_date', 'private_time') and not a.attisdropped)
      and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname = 'public'
                         and p.proname in (${NEW_0014_FNS.map((n) => `'${n}'`).join(', ')}))`);
  record('[undo 0014] both columns and the five 0014-only functions are gone', gone === true);
  const undoRows = await one(db, `select count(*)::int from public.change_log
      where table_name = 'testing_registrations' and action = 'undo_0014' and op = 'update' and batch_id is not null`);
  const logAfter = await one(db, 'select count(*)::int from public.change_log');
  record('[undo 0014] one undo_0014 history row per cleared private day, nothing else lost',
    privateCount > 0 && undoRows === privateCount && logAfter === logBefore + privateCount,
    `${privateCount} private days, ${undoRows} undo rows`);
  const prints10 = await fingerprints(db, '0010_fingerprints.sql');
  record('[undo 0014] 0010 fingerprints equal step 13e (a database that never had 0014)',
    JSON.stringify(prints10) === JSON.stringify(after10), `${prints10.length} rows`);
  const prints5 = await fingerprints(db, '0005_fingerprints.sql');
  record('[undo 0014] 0005 fingerprints equal the ones taken before 0014 (14a)',
    JSON.stringify(prints5) === JSON.stringify(p5), `${prints5.length} rows`);
  const prints3 = await fingerprints(db, '0003_fingerprints.sql');
  record('[undo 0014] 0003 fingerprints equal the ones taken before 0014 (14a)',
    JSON.stringify(prints3) === JSON.stringify(p3), `${prints3.length} rows`);
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
