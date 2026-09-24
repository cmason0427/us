-- Vibe answers (asked for or not) also land in the feed, for keeps. Home only
-- shows them for an hour. An unasked update is a vibe_checks row addressed to
-- yourself and answered straight away.
alter table public.posts drop constraint posts_kind_check;
alter table public.posts add constraint posts_kind_check check (kind in ('post', 'star', 'lunch_you', 'plan', 'vibe'));
alter table public.posts add column vibe_id uuid references public.vibe_checks (id) on delete set null;

-- Past answers go into the feed too, at the time they were answered.
insert into public.posts (author, kind, vibe_id, text, created_at)
select v.to_user, 'vibe', v.id,
       '💭 ' || coalesce(nullif((
         select string_agg(case c when 'great' then '✨ Great' when 'good' then '🙂 Good' when 'meh' then '😐 Meh'
           when 'tired' then '😮‍💨 Tired' when 'low' then '😔 Low' when 'stressed' then '😣 Stressed'
           when 'hug' then '🫂 Need a hug' when 'space' then '🔇 Need space' else c end, ', ' order by o)
         from unnest(case when cardinality(v.choices) > 0 then v.choices else array_remove(array[v.choice], null) end) with ordinality as t(c, o)
       ), ''), 'Vibe') || coalesce(' — “' || v.answer || '”', ''),
       v.answered_at
from public.vibe_checks v
where v.answered_at is not null
  and not exists (select 1 from public.posts p where p.vibe_id = v.id);

-- An unasked update is addressed to yourself (see above), so allow that.
alter table public.vibe_checks drop constraint if exists vibe_checks_check;
