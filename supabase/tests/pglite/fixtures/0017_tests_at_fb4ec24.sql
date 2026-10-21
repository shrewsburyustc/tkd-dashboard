-- =====================================================================
-- 0017_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A manual test script for migrations/0017_finance_camps.sql (camp
--   payments in Finance, rulebook v0.707). It checks:
--     G1  a camp payment is an item of ITS school's day (the desk that
--         took it - also the OTHER school for a both-schools camp), with
--         the camper's name, what = 'camp', event_name = the camp's name
--         (Daily report, Export, detail), its first day, never private;
--         the totals count it
--     G2  the chain rules on camp payments: a mis-click undo within 10
--         seconds hides it; an undo a day later shows "undone"; an edit
--         that moves it to another day AND school shows "Moved to" at the
--         old one and the edited line at the new one
--     G3  Close the day expects the camp cash (incl. a $1,500 payment,
--         over 0011's old $1,000 snapshot limit); a later camp payment
--         shows as Changed after closing
--     G4  Export rows and the export preview count camp payments
--     G5  finance_payment_detail for a camp payment (+ camp_days); a hidden
--         one is not_found; bad sources invalid; staff only today
--     G6  Mark paid today (the real writer) lands on today's report of the
--         school it was taken at; Both and History count camp payments
--     G7  catalog: the five replaced functions keep 0011's rights, owner
--         (the same as 0011's untouched finance_day_both),
--         security definer and search_path; the two widened rules; the
--         index
--   Color Belt and Star answers staying IDENTICAL is proven by run.mjs
--   (it compares every answer before and after 0017), and by running
--   0011_tests.sql again after 0017.
--   Its payments are on days in June 2021 (no real data there; Finance
--   refuses days before 2020), on its own "zz fin camp ..." camp, so it
--   works before AND after real camp payments exist.
--
-- IS IT SAFE?
--   Yes. One transaction ending with ROLLBACK. NEVER change the final
--   "rollback;" to "commit;".
--
-- BEFORE YOU RUN IT
--   0011, 0013 and 0017 are applied. Replace <paste-admin-UID-here> and
--   <paste-desk-UID-here> (Authentication -> Users), paste the whole file
--   into a new SQL Editor query and Run.
--   Passed: one row "ALL 0017 TESTS PASSED". Failed: "TEST FAILED: ...";
--   nothing was saved. If it failed, run   rollback;   on its own once.
-- =====================================================================

begin;

do $$
declare
  -- >>> EDIT THESE TWO LINES <<<
  v_admin uuid := '<paste-admin-UID-here>';
  v_desk  uuid := '<paste-desk-UID-here>';

  v_a1 uuid := gen_random_uuid();  v_a2 uuid := gen_random_uuid();  v_d1 uuid := gen_random_uuid();
  v_now_s   bigint := extract(epoch from now())::bigint;
  v_amr_1m  jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s - 60));
  v_c_a1 text; v_c_a2 text; v_c_d1 text;

  v_tag   text := 'zz fin camp ' || left(gen_random_uuid()::text, 8);
  v_today date := public.testing_today();
  v_d     date := date '2021-06-07';
  v_d2    date := date '2021-06-08';
  v_sig   text := 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  v_an    text;
  v_dn    text;

  v_r     jsonb;
  v_r2    jsonb;
  v_n     integer;
  v_txt   text;
  v_camp  uuid;
  v_code  text;
  v_day   uuid;
  v_ann uuid; v_bob uuid; v_cy uuid; v_dee uuid; v_eve uuid; v_fay uuid;
  v_p_ann uuid; v_p_bob uuid; v_p_cy uuid; v_p_cy2 uuid; v_p_dee uuid; v_p_eve uuid; v_p_late uuid;
  v_t     timestamptz;
  v_fn    record;
begin
  -- -------------------------------------------------------------------
  -- Setup
  -- -------------------------------------------------------------------
  if (select s.role from public.staff s where s.id = v_admin and s.active) is distinct from 'admin'
     or (select s.role from public.staff s where s.id = v_desk and s.active) is distinct from 'staff' then
    raise exception 'TEST SETUP: paste an ACTIVE admin UID into v_admin and the front desk''s into v_desk';
  end if;
  if to_regprocedure('public.finance_money_rows_core(text, date, date, text, uuid)') is null
     or to_regclass('public.camp_payments') is null
     or to_regclass('public.camp_payments_paid_on_idx') is null then
    raise exception 'TEST SETUP: 0011, 0013 and 0017 must be applied';
  end if;
  select s.full_name into v_an from public.staff s where s.id = v_admin;
  select s.full_name into v_dn from public.staff s where s.id = v_desk;

  perform set_config('request.jwt.claims', '', true);
  insert into auth.sessions (id, user_id) values (v_a1, v_admin), (v_a2, v_admin), (v_d1, v_desk);
  insert into public.session_unlock (session_id, staff_id, unlocked_until) values
    (v_a1, v_admin, now() + interval '30 minutes'),
    (v_a2, v_admin, now() - interval '1 minute'),
    (v_d1, v_desk,  now() + interval '30 minutes');
  v_c_a1 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a1, 'amr', v_amr_1m)::text;
  v_c_a2 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a2, 'amr', v_amr_1m)::text;
  v_c_d1 := jsonb_build_object('sub', v_desk,  'role', 'authenticated', 'session_id', v_d1, 'amr', v_amr_1m)::text;

  -- a both-schools camp HELD AT Worcester (one day, 10 days from now)
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.camp_add_camp('worcester', true, v_tag, array[v_today + 10], '09:00', '15:00', v_today - 1, v_today + 5,
           v_today + 5, 5, 12,
           '[{"day_count": 1, "member_early_cents": 7500, "member_regular_cents": 8000, "nonmember_early_cents": 8500, "nonmember_regular_cents": 9000}]',
           '[]', null, 'I agree to the camp rules.');
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: camp_add_camp answered %', v_r; end if;
  v_camp := (v_r ->> 'id')::uuid;
  v_code := v_r ->> 'public_code';
  select d.id into v_day from public.camp_days d where d.camp_id = v_camp;
  -- six campers in two family sign-ups (as the family form; it runs as its owner)
  perform set_config('request.jwt.claims', '', true);
  foreach v_txt in array array['Ann,Bob,Cy', 'Dee,Eve,Fay'] loop
    v_r := public.camp_public_signup(v_code, v_tag || ' key', gen_random_uuid(),
             (select jsonb_agg(jsonb_build_object('first_name', x, 'last_name', 'Finance', 'age', 8, 'member', true,
                                                  'day_ids', jsonb_build_array(v_day), 'extras', '[]'::jsonb) order by n)
                from unnest(string_to_array(v_txt, ',')) with ordinality as u(x, n)),
             'Pat Parent', '5085550100', 'Mother', 'Sam Contact', '5085550101', 'Aunt', 'cash', true, v_sig,
             'camp-2026-10-18', md5('I agree to the camp rules.'), 22500);
    if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: camp_public_signup answered %', v_r; end if;
  end loop;
  select c.id into v_ann from public.camp_campers c where c.camp_id = v_camp and c.first_name = 'Ann';
  select c.id into v_bob from public.camp_campers c where c.camp_id = v_camp and c.first_name = 'Bob';
  select c.id into v_cy  from public.camp_campers c where c.camp_id = v_camp and c.first_name = 'Cy';
  select c.id into v_dee from public.camp_campers c where c.camp_id = v_camp and c.first_name = 'Dee';
  select c.id into v_eve from public.camp_campers c where c.camp_id = v_camp and c.first_name = 'Eve';
  select c.id into v_fay from public.camp_campers c where c.camp_id = v_camp and c.first_name = 'Fay';

  -- Payments on June 7 / 8 2021, written as the camp functions write them
  -- (the SQL Editor's role; times and logins given):
  --   Ann  $100 cash, taken at SHREWSBURY (the camp is held at Worcester)
  --   Bob  $200 check at Worcester, undone by the same desk 5 s later (mis-click)
  --   Cy   $150 card at Worcester; edited by the admin the next day to $155
  --        cash, dated June 8, taken at Shrewsbury
  --   Dee  $120 cash at Worcester; undone by the admin the next day
  --   Eve  $1,500 cash at Shrewsbury (over 0011's old $1,000 snapshot limit)
  perform set_config('tkd.actor_label', 'PGlite camp finance test', true);
  v_t := (v_d + time '10:00') at time zone 'America/New_York';
  insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
  values (v_ann, 'payment', 10000, 'cash', v_d, 'shrewsbury', v_t, v_desk, v_dn) returning id into v_p_ann;
  insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
  values (v_bob, 'payment', 20000, 'check', v_d, 'worcester', v_t + interval '5 minutes', v_desk, v_dn) returning id into v_p_bob;
  insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
  values (v_bob, 'reversal', -20000, 'check', v_d, 'worcester', v_t + interval '5 minutes 5 seconds', v_desk, v_dn, v_p_bob);
  insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
  values (v_cy, 'payment', 15000, 'card', v_d, 'worcester', v_t + interval '1 hour', v_desk, v_dn) returning id into v_p_cy;
  insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
  values (v_cy, 'reversal', -15000, 'card', v_d2, 'worcester', v_t + interval '1 day', v_admin, v_an, v_p_cy);
  insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
  values (v_cy, 'payment', 15500, 'cash', v_d2, 'shrewsbury', v_t + interval '1 day', v_admin, v_an) returning id into v_p_cy2;
  insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
  values (v_dee, 'payment', 12000, 'cash', v_d, 'worcester', v_t + interval '2 hours', v_desk, v_dn) returning id into v_p_dee;
  insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
  values (v_dee, 'reversal', -12000, 'cash', v_d2, 'worcester', v_t + interval '1 day 2 hours', v_admin, v_an, v_p_dee);
  insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
  values (v_eve, 'payment', 150000, 'cash', v_d, 'shrewsbury', v_t + interval '3 hours', v_desk, v_dn) returning id into v_p_eve;
  perform set_config('tkd.actor_label', '', true);

  -- ===================================================================
  -- G1 + G2. The Daily reports (as the admin: any day)
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.finance_day('shrewsbury', v_d);
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST FAILED: G1 finance_day answered %', v_r; end if;
  -- Ann, Eve: counted at Shrewsbury, with the camp facts
  select x into v_r2 from jsonb_array_elements(v_r -> 'items') as x where (x ->> 'payment_id')::uuid = v_p_ann;
  if v_r2 is null or v_r2 ->> 'source' <> 'camp' or v_r2 ->> 'what' <> 'camp' or v_r2 ->> 'state' <> 'counted'
     or v_r2 ->> 'first_name' <> 'Ann' or v_r2 ->> 'last_name' <> 'Finance'
     or (v_r2 ->> 'event_date')::date <> v_today + 10 or (v_r2 ->> 'is_private')::boolean
     or (v_r2 ->> 'amount_cents')::integer <> 10000 or v_r2 ->> 'method' <> 'cash' or v_r2 ->> 'recorded_by_name' <> v_dn
     or v_r2 ->> 'event_name' <> v_tag then
    raise exception 'TEST FAILED: G1 Ann''s line at Shrewsbury: %', v_r2;
  end if;
  if (select count(*) from jsonb_array_elements(v_r -> 'items') as x where x ->> 'source' = 'camp') <> 2
     or (v_r #>> '{totals,count}')::integer <> 2 or (v_r #>> '{totals,cash,cents}')::integer <> 160000
     or (v_r #>> '{totals,total_cents}')::integer <> 160000 then
    raise exception 'TEST FAILED: G1 Shrewsbury June 7 totals / items: % %', v_r -> 'totals', v_r -> 'items';
  end if;
  -- Worcester June 7: Bob hidden (mis-click), Cy "Moved to June 8", Dee undone - nothing counts
  v_r := public.finance_day('worcester', v_d);
  if exists (select 1 from jsonb_array_elements(v_r -> 'items') as x where (x ->> 'payment_id')::uuid = v_p_bob)
     or not exists (select 1 from jsonb_array_elements(v_r -> 'items') as x
                     where (x ->> 'payment_id')::uuid = v_p_cy and x ->> 'state' = 'moved_out' and (x ->> 'moved_to')::date = v_d2)
     or not exists (select 1 from jsonb_array_elements(v_r -> 'items') as x
                     where (x ->> 'payment_id')::uuid = v_p_dee and x ->> 'state' = 'undone' and x ->> 'changed_by_name' = v_an)
     or (v_r #>> '{totals,count}')::integer <> 0 or (v_r #>> '{totals,total_cents}')::integer <> 0
     or (v_r ->> 'can_close')::boolean then
    raise exception 'TEST FAILED: G2 Worcester June 7: %', v_r;
  end if;
  -- Shrewsbury June 8: Cy's edited line (moved in, was $150 card)
  v_r := public.finance_day('shrewsbury', v_d2);
  select x into v_r2 from jsonb_array_elements(v_r -> 'items') as x where (x ->> 'payment_id')::uuid = v_p_cy;
  if v_r2 is null or v_r2 ->> 'state' <> 'moved_in' or (v_r2 ->> 'amount_cents')::integer <> 15500
     or (v_r2 ->> 'was_amount_cents')::integer <> 15000 or v_r2 ->> 'was_method' <> 'card'
     or (v_r2 ->> 'moved_from')::date <> v_d or v_r2 ->> 'changed_by_name' <> v_an
     or (v_r #>> '{totals,cash,cents}')::integer <> 15500 then
    raise exception 'TEST FAILED: G2 Cy''s edited line at Shrewsbury June 8: % / %', v_r2, v_r -> 'totals';
  end if;
  if (public.finance_day('worcester', v_d2) #>> '{totals,count}')::integer <> 0 then
    raise exception 'TEST FAILED: G2 nothing counts at Worcester on June 8';
  end if;
  -- every item's source is one of the three
  if exists (select 1 from public.finance_money_rows(null, v_d, v_d2) m where m.source not in ('color_belt', 'star', 'camp')) then
    raise exception 'TEST FAILED: G1 an unknown source';
  end if;

  -- ===================================================================
  -- G3. Close the day expects the camp cash; a later camp payment shows
  --     as Changed after closing
  -- ===================================================================
  v_r := public.finance_day('shrewsbury', v_d);
  v_r2 := public.finance_close_day('shrewsbury', v_d, v_r ->> 'fingerprint', 160000, 0, 0, 0, null);
  if v_r2 ->> 'status' <> 'ok' or v_r2 #>> '{results,cash,result}' <> 'matches' then
    raise exception 'TEST FAILED: G3 close answered %', v_r2;
  end if;
  if (select count(*) from public.finance_day_closing_items i
       where i.closing_id = (v_r2 ->> 'closing_id')::uuid and i.source = 'camp') <> 2
     or not exists (select 1 from public.finance_day_closing_items i
                     where i.closing_id = (v_r2 ->> 'closing_id')::uuid and i.amount_cents = 150000) then
    raise exception 'TEST FAILED: G3 the close''s snapshot must hold both camp payments (incl. $1,500)';
  end if;
  if (select c.expected_cash_cents from public.finance_day_closings c where c.id = (v_r2 ->> 'closing_id')::uuid) <> 160000 then
    raise exception 'TEST FAILED: G3 expected cash';
  end if;
  perform set_config('tkd.actor_label', 'PGlite camp finance test', true);
  insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
  values (v_fay, 'payment', 5000, 'cash', v_d, 'shrewsbury', now() + interval '1 second', v_desk, v_dn) returning id into v_p_late;
  perform set_config('tkd.actor_label', '', true);
  v_r := public.finance_day('shrewsbury', v_d);
  if not (v_r #>> '{closing,changed_after}')::boolean
     or not exists (select 1 from jsonb_array_elements(v_r -> 'items') as x
                     where (x ->> 'payment_id')::uuid = v_p_late and (x ->> 'added_after_closing')::boolean) then
    raise exception 'TEST FAILED: G3 a later camp payment must show as changed / added after closing: %', v_r -> 'closing';
  end if;
  v_r := public.finance_history('shrewsbury', v_d);
  if (select x ->> 'tag' from jsonb_array_elements(v_r -> 'days') as x where (x ->> 'day')::date = v_d) <> 'changed_after_closing' then
    raise exception 'TEST FAILED: G3 History tag for the changed day: %', v_r;
  end if;

  -- ===================================================================
  -- G4. Export and its preview
  -- ===================================================================
  v_r := public.finance_export('shrewsbury', v_d, v_d2);
  if v_r ->> 'status' <> 'ok'
     or (select count(*) from jsonb_array_elements(v_r -> 'rows') as x where x ->> 'what' = 'camp') <> 4
     or (select sum((x ->> 'counted_cents')::integer) from jsonb_array_elements(v_r -> 'rows') as x) <> 10000 + 150000 + 5000 + 15500
     or not exists (select 1 from jsonb_array_elements(v_r -> 'rows') as x
                     where x ->> 'first_name' = 'Cy' and x ->> 'state' = 'moved_in' and x ->> 'note' = 'was $150.00 card')
     or exists (select 1 from jsonb_array_elements(v_r -> 'rows') as x
                 where x ->> 'what' = 'camp' and x ->> 'event_name' is distinct from v_tag) then
    raise exception 'TEST FAILED: G4 export rows %', v_r -> 'rows';
  end if;
  v_r := public.finance_export_preview('shrewsbury', v_d, v_d2);
  if (v_r ->> 'count')::integer <> 4 or (v_r ->> 'total_cents')::integer <> 180500 then
    raise exception 'TEST FAILED: G4 export preview %', v_r;
  end if;

  -- ===================================================================
  -- G5. The payment detail
  -- ===================================================================
  v_r := public.finance_payment_detail('camp', v_p_cy);
  if v_r ->> 'status' <> 'ok' or v_r #>> '{item,source}' <> 'camp' or v_r #>> '{item,school}' <> 'shrewsbury'
     or v_r ->> 'event_name' <> v_tag or v_r #>> '{item,event_name}' <> v_tag or (v_r ->> 'event_id')::uuid <> v_camp
     or v_r -> 'camp_days' <> to_jsonb(array[v_today + 10])
     or jsonb_array_length(v_r -> 'history') <> 2
     or v_r -> 'history' -> 0 ->> 'what' <> 'edited' or v_r -> 'history' -> 1 ->> 'what' <> 'recorded' then
    raise exception 'TEST FAILED: G5 detail of Cy''s payment %', v_r;
  end if;
  v_r := public.finance_payment_detail('camp', v_p_dee);
  if v_r ->> 'status' <> 'ok' or v_r -> 'history' -> 0 ->> 'what' <> 'undone' then
    raise exception 'TEST FAILED: G5 detail of Dee''s undone payment %', v_r;
  end if;
  if public.finance_payment_detail('camp', v_p_bob) ->> 'status' <> 'not_found'
     or public.finance_payment_detail('camp', gen_random_uuid()) ->> 'status' <> 'not_found'
     or public.finance_payment_detail('camp', v_p_ann) ->> 'status' <> 'ok'
     or public.finance_payment_detail('star', v_p_ann) ->> 'status' <> 'not_found'
     or public.finance_payment_detail('camps', v_p_ann) ->> 'status' <> 'invalid' then
    raise exception 'TEST FAILED: G5 hidden / unknown / wrong-source / bad-source details';
  end if;
  if public.finance_payment_detail('color_belt', gen_random_uuid()) ? 'camp_days' then
    raise exception 'TEST FAILED: G5 only a camp payment''s detail has camp_days';
  end if;
  perform set_config('request.jwt.claims', v_c_d1, true);
  if public.finance_payment_detail('camp', v_p_ann) ->> 'status' <> 'not_allowed' then
    raise exception 'TEST FAILED: G5 staff may only see today''s payments';
  end if;
  perform set_config('request.jwt.claims', v_c_a2, true);
  if public.finance_payment_detail('camp', v_p_ann) is distinct from '{"status": "no_access"}'::jsonb then
    raise exception 'TEST FAILED: G5 a locked session must get no_access';
  end if;

  -- ===================================================================
  -- G6. The real writer: Mark paid today at Shrewsbury (the desk), then
  --     today's reports (staff: today only), Both and History
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_d1, true);
  v_r := public.camp_mark_paid(v_fay, (select c.version from public.camp_campers c where c.id = v_fay), 'shrewsbury');
  if v_r ->> 'status' <> 'ok' or v_r ->> 'school' <> 'shrewsbury' then raise exception 'TEST FAILED: G6 Mark paid answered %', v_r; end if;
  v_r2 := public.finance_day('shrewsbury', v_today);
  if not exists (select 1 from jsonb_array_elements(v_r2 -> 'items') as x
                  where (x ->> 'payment_id')::uuid = (v_r ->> 'payment_id')::uuid and x ->> 'state' = 'counted'
                    and (x ->> 'amount_cents')::integer = (v_r ->> 'amount_cents')::integer) then
    raise exception 'TEST FAILED: G6 today''s Shrewsbury report must show Fay''s payment';
  end if;
  if exists (select 1 from jsonb_array_elements(public.finance_day('worcester', v_today) -> 'items') as x
              where (x ->> 'payment_id')::uuid = (v_r ->> 'payment_id')::uuid) then
    raise exception 'TEST FAILED: G6 Fay''s payment must not show at Worcester';
  end if;
  if public.finance_payment_detail('camp', (v_r ->> 'payment_id')::uuid) ->> 'status' <> 'ok' then
    raise exception 'TEST FAILED: G6 staff can open today''s camp payment';
  end if;
  -- the toast's Undo within 10 seconds (same login): a mis-click, hidden
  perform public.camp_undo_payment((v_r ->> 'payment_id')::uuid);
  if exists (select 1 from jsonb_array_elements(public.finance_day('shrewsbury', v_today) -> 'items') as x
              where (x ->> 'payment_id')::uuid = (v_r ->> 'payment_id')::uuid) then
    raise exception 'TEST FAILED: G6 an Undo within 10 seconds must hide the payment';
  end if;
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.finance_day_both(v_d);
  if (select (x ->> 'total_cents')::integer from jsonb_array_elements(v_r -> 'schools') as x where x ->> 'code' = 'shrewsbury')
       <> 165000 then
    raise exception 'TEST FAILED: G6 Both must count the camp payments: %', v_r;
  end if;

  -- ===================================================================
  -- G7. Catalog: rights, owners, definer, search_path as 0011; the rules
  --     and the index
  -- ===================================================================
  for v_fn in
    select p.oid, p.proname::text as name, p.prosecdef, p.proconfig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('finance_chain_steps_core', 'finance_money_rows_core', 'finance_day', 'finance_payment_detail', 'finance_export')
  loop
    -- the owner: the same as a 0011 function 0017 did NOT replace
    -- (finance_day_both), so this holds on production and in PGlite alike
    if (select p.proowner from pg_proc p where p.oid = v_fn.oid)
         is distinct from (select p.proowner from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                            where n.nspname = 'public' and p.proname = 'finance_day_both')
       or (select p.proowner from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'finance_day_both') is null then
      raise exception 'TEST FAILED: G7 % is not owned by the owner of 0011''s other functions', v_fn.oid::regprocedure;
    end if;
    if v_fn.prosecdef is distinct from (v_fn.name in ('finance_day', 'finance_payment_detail', 'finance_export'))
       or not ('search_path=""' = any (v_fn.proconfig))
       or has_function_privilege('anon', v_fn.oid, 'EXECUTE')
       or has_function_privilege('service_role', v_fn.oid, 'EXECUTE')
       or has_function_privilege('authenticated', v_fn.oid, 'EXECUTE') is distinct from (v_fn.name in ('finance_day', 'finance_payment_detail', 'finance_export'))
       or exists (select 1 from aclexplode(coalesce((select p.proacl from pg_proc p where p.oid = v_fn.oid),
                                                    acldefault('f', (select p.proowner from pg_proc p where p.oid = v_fn.oid)))) as a
                   where a.grantee = 0) then
      raise exception 'TEST FAILED: G7 % rights / definer / search_path', v_fn.oid::regprocedure;
    end if;
  end loop;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('finance_chain_steps_core', 'finance_money_rows_core', 'finance_day', 'finance_payment_detail', 'finance_export')) <> 5 then
    raise exception 'TEST FAILED: G7 one version of each replaced function';
  end if;
  if not exists (select 1 from pg_constraint c where c.conname = 'finance_day_closing_items_source_check'
                  and pg_get_constraintdef(c.oid) like '%camp%')
     or not exists (select 1 from pg_constraint c where c.conname = 'finance_day_closing_items_amount_check'
                     and pg_get_constraintdef(c.oid) like '%200000%') then
    raise exception 'TEST FAILED: G7 the widened snapshot rules';
  end if;
  if not exists (select 1 from pg_indexes i where i.schemaname = 'public' and i.tablename = 'camp_payments'
                  and i.indexname = 'camp_payments_paid_on_idx') then
    raise exception 'TEST FAILED: G7 the camp_payments (paid_on) index';
  end if;
end;
$$;

select 'ALL 0017 TESTS PASSED' as result;

-- Undo EVERYTHING the tests changed. NEVER change this to commit.
rollback;
