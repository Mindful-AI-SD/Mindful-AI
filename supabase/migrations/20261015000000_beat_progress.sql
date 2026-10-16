-- MIN-110: additive weekly beat storage; legacy public.progress is untouched.
create table public.beat_progress (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  week_id bigint not null references public.weeks(id) on delete cascade,
  beat_id text not null check (beat_id in ('arrive', 'practice', 'explore', 'notice')),
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed')),
  answers jsonb not null default '{}'::jsonb
    check (jsonb_typeof(answers) = 'object')
    check (not jsonb_path_exists(answers, '$.* ? (@.type() != "string")')),
  saved_data jsonb not null default '{}'::jsonb check (jsonb_typeof(saved_data) = 'object'),
  resume_state jsonb not null default '{}'::jsonb check (jsonb_typeof(resume_state) = 'object'),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, week_id, beat_id),
  constraint beat_progress_lifecycle check (
    (status = 'not_started' and started_at is null and completed_at is null)
    or (status = 'in_progress' and started_at is not null and completed_at is null)
    or (status = 'completed' and started_at is not null and completed_at >= started_at)
  ),
  constraint beat_progress_completion_required check ((status = 'completed') = (completed_at is not null))
);

-- Timestamps are database-owned, including for direct public-client writes.
create function public.stamp_beat_progress()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if (new.user_id, new.week_id, new.beat_id) is distinct from (old.user_id, old.week_id, old.beat_id) then
      raise exception 'Beat progress identity cannot change';
    end if;
    new.started_at := old.started_at;
    if old.status = 'completed' and new.status = 'completed' then
      new.completed_at := old.completed_at;
    else
      new.completed_at := null;
    end if;
  else
    new.started_at := null;
    new.completed_at := null;
  end if;
  if new.status = 'not_started' then
    new.started_at := null;
    new.completed_at := null;
  else
    new.started_at := coalesce(new.started_at, now());
    if new.status = 'completed' then
      new.completed_at := coalesce(new.completed_at, now());
    else
      new.completed_at := null;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger beat_progress_timestamps
before insert or update on public.beat_progress
for each row execute function public.stamp_beat_progress();

alter table public.beat_progress enable row level security;

create policy "Students read their own beat progress"
on public.beat_progress for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Students create their own published-week beat progress"
on public.beat_progress for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (select 1 from public.weeks where id = week_id and is_published)
);

create policy "Students update their own published-week beat progress"
on public.beat_progress for update to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (select 1 from public.weeks where id = week_id and is_published)
);

create policy "Students delete their own beat progress"
on public.beat_progress for delete to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.beat_progress from anon;
grant select, insert, update, delete on public.beat_progress to authenticated;
