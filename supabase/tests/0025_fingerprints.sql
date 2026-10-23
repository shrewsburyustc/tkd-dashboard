-- =====================================================================
-- 0025_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query with several kinds of rows about migration 0025 (Black Belt
--   grading and results), in 0016_fingerprints.sql's format (kind, item,
--   detail):
--     function   - every function 0025 creates or replaces (the 15 staff
--                  functions, the 15 replaced 0016 / 0024 functions and
--                  trigger functions, the internal helpers and trigger
--                  functions), with: body_md5 (an md5 of its code without
--                  comments and spaces), security definer, volatility,
--                  settings (must say search_path=""), owner, and who may
--                  call it
--     table      - the seven new tables: RLS on/off, owner, the exact
--                  rights (table-wide and per column)
--     policy     - their read rules
--     trigger    - every trigger on the seven tables, and the 0025
--                  triggers on old tables (bb_candidates_before_write,
--                  bb_candidates_keep_age, bb_payments_makeup_guard,
--                  bb_cycle_days_grading, bb_cycle_day_parts_grading)
--     constraint - the seven tables' rules, and bb_candidates' new and
--                  changed ones
--     index      - the seven tables' indexes and bb_candidates' three new
--                  ones
--     column     - bb_candidates.cycle_plan_id: "attnotnull=false" (a
--                  re-run of 0016 can't put "not null" back unseen)
--     text       - the three seeded result email texts (kind, md5 of the
--                  text as it is now)
--     check      - one row "rerun": "ok" while 0025's replacements are in
--                  place; "0016 OR 0024 RE-RUN OVER 0025 (<what>)" if 0016
--                  or 0024 was pasted again after 0025 (which silently
--                  puts back their functions - SETUP "Migration 0025",
--                  0025g)
-- The rows are sorted byte by byte (collate "C"), so the list comes out in
-- the same order in PGlite and on production.
--
-- WHY
--   supabase/tests/pglite/run.mjs (step0025) prints this list for the
--   tested copy. After Jeffrey pastes 0025 into the SQL Editor, Claude runs
--   this on production through the read-only connection and every line
--   must match: production then has exactly the code, rights and rules
--   that passed the tests.
--
-- CONNECTOR-SAFE: a single read-only SELECT, and none of its text uses
-- the words the Supabase connection refuses (two function names that
-- contain such a word are written in two pieces). run.mjs checks that.
-- =====================================================================

with fns(name) as (
  values
    -- the 9 staff writes and 6 staff reads
    ('bb_set_grade'), ('bb_set_measured'), ('bb_set_extra_count'), ('bb_set_makeup_subjects'), ('bb_add_makeup'),
    ('bb_mark_result_sent'), ('bb_undo_result_sent'), ('bb_set_result_text'), ('bb_update_candidate_clear'),
    ('bb_grading_grid'), ('bb_cycle_results'), ('bb_makeup_list'), ('bb_result_email'), ('bb_results_csv'),
    ('bb_cycle_grading_state'),
    -- the replaced 0016 / 0024 functions and trigger functions
    ('bb_purge_due_on'), ('bb_purge_due'), ('bb_update_cycle'), ('bb_' || 'del' || 'ete_cycle'), ('bb_update_candidate'),
    ('bb_change_plan'), ('bb_restore_candidate'), ('bb_' || 'del' || 'ete_candidate'), ('bb_cycle_roster'),
    ('bb_candidate_detail'), ('bb_candidates_rules'), ('bb_candidates_log'), ('bb_save_cycle_dan'), ('bb_undo_cycle_dan'),
    ('bb_cycles_rules'),
    -- the internal helpers
    ('bb_grade_result'), ('bb_age_groups'), ('bb_measured_letter'), ('bb_extra_points'), ('bb_kept_match'),
    ('bb_result_text_problem'), ('bb_candidate_age'), ('bb_candidate_grading_input'), ('bb_candidate_result'),
    ('bb_candidate_result_with'), ('bb_cycle_has_grading'), ('bb_cycle_grading_started_at'), ('bb_candidate_has_grades'),
    ('bb_sent_state'), ('bb_lock_candidate_shared'), ('bb_update_candidate_core'),
    -- the trigger functions
    ('bb_note_grading_started'), ('bb_cycle_grading_started_guard'), ('bb_candidates_keep_age'), ('bb_grades_rules'),
    ('bb_extra_counts_rules'), ('bb_makeup_subjects_rules'), ('bb_result_sends_guard'), ('bb_downloads_guard'),
    ('bb_payments_makeup_guard'), ('bb_cycle_days_grading'), ('bb_cycle_day_parts_grading')
),
replaced(name) as (
  values ('bb_purge_due_on'), ('bb_purge_due'), ('bb_update_cycle'), ('bb_' || 'del' || 'ete_cycle'), ('bb_update_candidate'),
         ('bb_change_plan'), ('bb_restore_candidate'), ('bb_' || 'del' || 'ete_candidate'), ('bb_cycle_roster'),
         ('bb_candidate_detail'), ('bb_candidates_rules'), ('bb_candidates_log'), ('bb_save_cycle_dan'),
         ('bb_undo_cycle_dan'), ('bb_cycles_rules')
),
tbls(name) as (
  values ('bb_grades'), ('bb_extra_counts'), ('bb_makeup_subjects'), ('bb_result_texts'), ('bb_result_sends'),
         ('bb_downloads'), ('bb_cycle_grading_started')
),
old_triggers(tbl, name) as (
  values ('bb_candidates', 'bb_candidates_before_write'), ('bb_candidates', 'bb_candidates_keep_age'),
         ('bb_payments', 'bb_payments_makeup_guard'), ('bb_cycle_days', 'bb_cycle_days_grading'),
         ('bb_cycle_day_parts', 'bb_cycle_day_parts_grading')
),
cand_constraints(name) as (
  values ('bb_candidates_source_check'), ('bb_candidates_makeup_of_fk'), ('bb_candidates_makeup_of_self_check'),
         ('bb_candidates_makeup_of_check'), ('bb_candidates_makeup_name_check'), ('bb_candidates_makeup_plan_check'),
         ('bb_candidates_makeup_kukkiwon_check'), ('bb_candidates_age_kept_check')
),
cand_indexes(name) as (
  values ('bb_candidates_reference_idx'), ('bb_candidates_one_active_makeup_idx'), ('bb_candidates_makeup_of_idx')
),
-- the re-run detector: the first item that is not as 0025 left it (null = all fine)
rerun(item) as (
  select coalesce(
    (select 'function ' || r.name
       from replaced r
      where not coalesce((select bool_and(p.prosrc like '%-- 0025: replaced%')
                            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                           where n.nspname = 'public' and p.proname = r.name), false)
      order by r.name collate "C"
      limit 1),
    case when not coalesce((select pg_get_constraintdef(c.oid) like '%makeup%'
                              from pg_constraint c
                             where c.conrelid = to_regclass('public.bb_candidates') and c.conname = 'bb_candidates_source_check'), false)
         then 'bb_candidates_source_check' end,
    case when not coalesce((select pg_get_triggerdef(t.oid) like '%age_kept%'
                              from pg_trigger t
                             where t.tgrelid = to_regclass('public.bb_candidates') and t.tgname = 'bb_candidates_before_write'), false)
         then 'bb_candidates_before_write' end,
    case when not coalesce((select not a.attnotnull
                              from pg_attribute a
                             where a.attrelid = to_regclass('public.bb_candidates') and a.attname = 'cycle_plan_id'), false)
         then 'bb_candidates.cycle_plan_id' end,
    case when not coalesce((select t.tgenabled <> 'D'
                              from pg_trigger t
                             where t.tgrelid = to_regclass('public.bb_candidates') and t.tgname = 'bb_candidates_keep_age'), false)
         then 'bb_candidates_keep_age' end)
)
select fp.* from (
select 'function' as kind,
       p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as item,
       md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g'))
         || ' definer=' || p.prosecdef::text
         || ' volatile=' || p.provolatile::text
         || ' settings=' || coalesce(array_to_string(p.proconfig, ','), '')
         || ' owner=' || p.proowner::regrole::text
         || ' rights=' || coalesce((select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ','
                                                      order by a.grantee::regrole::text collate "C", a.privilege_type collate "C")
                                      from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as a), '') as detail
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in (select name from fns)
union all
select 'table',
       c.relname,
       'rls=' || c.relrowsecurity
         || ' owner=' || c.relowner::regrole::text
         || ' rights=' || coalesce((select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ','
                                                      order by a.grantee::regrole::text collate "C", a.privilege_type collate "C")
                                      from aclexplode(c.relacl) as a
                                     where a.grantee <> c.relowner), '')
         || ' columns=' || coalesce((select string_agg(t.attname || '>' || a.grantee::regrole::text || ':' || a.privilege_type, ','
                                                       order by t.attname collate "C", a.grantee::regrole::text collate "C",
                                                                a.privilege_type collate "C")
                                       from pg_attribute t, aclexplode(t.attacl) as a
                                      where t.attrelid = c.oid and t.attnum > 0 and t.atttypid <> 0), '')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname in (select name from tbls)
union all
select 'policy',
       pp.tablename || '.' || pp.policyname,
       pp.cmd || ' ' || pp.permissive || ' to=' || array_to_string(pp.roles, '+') || ' using=' || coalesce(pp.qual, '')
         || ' check=' || coalesce(pp.with_check, '')
  from pg_policies pp
 where pp.schemaname = 'public' and pp.tablename in (select name from tbls)
union all
select 'trigger',
       t.tgrelid::regclass::text || '.' || t.tgname,
       pg_get_triggerdef(t.oid) || ' enabled=' || t.tgenabled::text
  from pg_trigger t
 where not t.tgisinternal
   and (t.tgrelid in (select to_regclass('public.' || name) from tbls)
        or exists (select 1 from old_triggers o where t.tgrelid = to_regclass('public.' || o.tbl) and t.tgname = o.name))
union all
select 'constraint',
       c.conrelid::regclass::text || '.' || c.conname,
       pg_get_constraintdef(c.oid)
  from pg_constraint c
 where c.conrelid in (select to_regclass('public.' || name) from tbls)
    or (c.conrelid = to_regclass('public.bb_candidates') and c.conname in (select name from cand_constraints))
union all
select 'index',
       i.tablename || '.' || i.indexname,
       i.indexdef
  from pg_indexes i
 where i.schemaname = 'public'
   and (i.tablename in (select name from tbls)
        or (i.tablename = 'bb_candidates' and i.indexname in (select name from cand_indexes)))
union all
select 'column',
       'bb_candidates.cycle_plan_id',
       'attnotnull=' || a.attnotnull::text
  from pg_attribute a
 where a.attrelid = to_regclass('public.bb_candidates') and a.attname = 'cycle_plan_id'
union all
select 'text',
       t.kind,
       md5(t.body)
  from public.bb_result_texts t
union all
select 'check',
       'rerun',
       case when r.item is null then 'ok'
            else '0016 OR 0024 RE-RUN OVER 0025 (' || r.item || ') — run SETUP §0025g or re-apply 0025' end
  from rerun r
) as fp
 order by fp.kind collate "C", fp.item collate "C";
