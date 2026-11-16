-- MIN-226: enforce current Week 1/2 prerequisites below the mobile helper.
-- No new storage, copied draft schema, curriculum seed or completion predicate.
create function public.can_write_week_three_progress(p_activity_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); target_week integer; target_published boolean;
begin
  if owner_id is null then return false; end if;
  select w.week_number, (a.is_published and w.is_published)
    into target_week, target_published
    from public.activities a join public.weeks w on w.id = a.week_id
    where a.id = p_activity_id;
  -- Missing IDs cannot establish a canonical target. Other weeks retain existing behavior.
  if not found then return false; end if;
  if target_week <> 3 then return true; end if;
  if target_published is distinct from true then return false; end if;
  -- Match current main's getWeekAccess and week-three-audit saved-state rule.
  for required_week in 1..2 loop
    if not exists (select 1 from public.weeks w join public.activities a on a.week_id=w.id
      where w.week_number=required_week and w.is_published and a.is_published) then return false; end if;
    if exists (
      select 1 from public.weeks w join public.activities a on a.week_id=w.id
      where w.week_number=required_week and w.is_published and a.is_published
        and not exists (select 1 from public.progress p
          where p.user_id=owner_id and p.activity_id=a.id
            and p.status='completed' and p.completed_at is not null)
    ) then return false; end if;
  end loop;
  return true;
end $$;
revoke all on function public.can_write_week_three_progress(uuid) from public, anon;
grant execute on function public.can_write_week_three_progress(uuid) to authenticated;

-- Restrictive policies AND with the existing permissive owner policies.
-- A new permissive policy alone would not constrain the existing owner grant.
create policy "Week 3 inserts require required_week completion"
on public.progress as restrictive for insert to authenticated
with check (user_id=(select auth.uid()) and public.can_write_week_three_progress(activity_id));
create policy "Week 3 updates require required_week completion"
on public.progress as restrictive for update to authenticated
with check (user_id=(select auth.uid()) and public.can_write_week_three_progress(activity_id));

create function public.guard_week_three_progress_identity()
returns trigger language plpgsql security definer set search_path='' as $$
declare old_week integer; new_week integer;
begin
  select w.week_number into old_week from public.activities a join public.weeks w on w.id=a.week_id where a.id=old.activity_id;
  select w.week_number into new_week from public.activities a join public.weeks w on w.id=a.week_id where a.id=new.activity_id;
  if old_week=3 or new_week=3 then
    if (new.user_id,new.activity_id) is distinct from (old.user_id,old.activity_id) then
      raise exception using message='WEEK_THREE_IDENTITY_IMMUTABLE',errcode='23514';
    end if;
    -- Completed records are read-only. Skip every update before timestamp triggers.
    if old.status='completed' then return null; end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_week_three_progress_identity() from public,anon,authenticated;
create trigger progress_00_week_three_identity before update on public.progress
for each row execute function public.guard_week_three_progress_identity();

-- Prevent deleting/recreating a terminal Week 3 row through the student API.
-- Owner reads and draft deletion retain their existing policies.
create function public.is_own_completed_week_three_progress(p_activity_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.progress p join public.activities a on a.id=p.activity_id
    join public.weeks w on w.id=a.week_id
    where p.user_id=auth.uid() and p.activity_id=p_activity_id
      and p.status='completed' and w.week_number=3
  );
$$;
revoke all on function public.is_own_completed_week_three_progress(uuid) from public,anon;
grant execute on function public.is_own_completed_week_three_progress(uuid) to authenticated;
create policy "Completed Week 3 progress cannot be deleted by students"
on public.progress as restrictive for delete to authenticated
using (not public.is_own_completed_week_three_progress(activity_id));
