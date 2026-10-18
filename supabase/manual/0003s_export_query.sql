-- READ-ONLY export from the old Color Belt project (mfqcchrapunngwwvxzwu), run 2026-10-16 by Claude via the
-- Supabase connector with Jeffrey's OK (rulebook v0.55). Names, order, prices, sparring flag, next_rank only - no student data.
select jsonb_agg(jsonb_build_object(
  'old_class_id', c.id, 'class', c.name, 'position', c.position,
  'ranks', (select jsonb_agg(jsonb_build_object(
      'old_rank_id', r.id, 'name', r.name, 'position', r.position,
      'early_cents', r.early_cents, 'day_cents', r.day_cents, 'private_cents', r.private_cents,
      'sparring', r.sparring, 'next_rank', r.next_rank) order by r.position, r.name, r.id)
    from belt.ranks r where r.class_id = c.id and not r.archived))
  order by c.position, c.name, c.id) as export
from belt.classes c where not c.archived;
