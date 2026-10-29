-- MIN-226 read-only canonical lookup foundation. No curriculum seed or unlock rule.
create table public.activity_aliases (
  slug text primary key check (length(slug) between 1 and 100 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  activity_id uuid not null references public.activities(id) on delete restrict
);
alter table public.activity_aliases enable row level security;
revoke all on public.activity_aliases from public, anon, authenticated;
grant select on public.activity_aliases to authenticated;
create policy "Published activity aliases are readable"
on public.activity_aliases for select to authenticated
using (exists (select 1 from public.activities a join public.weeks w on w.id=a.week_id
  where a.id=activity_id and a.is_published and w.is_published));

create function public.prevent_activity_alias_retarget() returns trigger
language plpgsql set search_path='' as $$
begin
  if new is distinct from old then
    raise exception using errcode='PT409', message='ACTIVITY_ALIAS_IMMUTABLE';
  end if;
  return new;
end;
$$;
revoke all on function public.prevent_activity_alias_retarget() from public, anon, authenticated;
create trigger activity_alias_identity before update on public.activity_aliases
for each row execute function public.prevent_activity_alias_retarget();

create function public.resolve_curriculum_activity(p_request jsonb) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare matches jsonb; n integer;
begin
  if auth.uid() is null then
    raise exception using errcode='PT401', message='AUTH_REQUIRED';
  end if;
  if jsonb_typeof(p_request) is distinct from 'object' then
    raise exception using errcode='PT400', message='INVALID_INPUT';
  end if;
  if (select count(*) from jsonb_object_keys(p_request)) <> 2
    or not (p_request ?& array['slug','expectedWeek'])
    or jsonb_typeof(p_request->'slug') is distinct from 'string'
    or length(p_request->>'slug') not between 1 and 100
    or (p_request->>'slug') !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or jsonb_typeof(p_request->'expectedWeek') is distinct from 'number'
    or (p_request->>'expectedWeek') !~ '^[1-8]$' then
    raise exception using errcode='PT400', message='INVALID_INPUT';
  end if;
  select count(*), jsonb_agg(jsonb_build_object('slug',x.slug,'activityId',a.id,
      'weekId',w.id,'weekNumber',w.week_number)) into n,matches
  from public.activity_aliases x join public.activities a on a.id=x.activity_id
  join public.weeks w on w.id=a.week_id
  where x.slug=p_request->>'slug' and w.week_number=(p_request->>'expectedWeek')::integer
    and a.is_published and w.is_published;
  if n=0 then raise exception using errcode='PT404', message='ACTIVITY_NOT_AVAILABLE'; end if;
  if n<>1 then raise exception using errcode='PT503', message='ACTIVITY_LOOKUP_UNAVAILABLE'; end if;
  return matches->0;
exception when sqlstate 'PT400' or sqlstate 'PT401' or sqlstate 'PT404' or sqlstate 'PT503' then raise;
  when others then raise exception using errcode='PT503', message='ACTIVITY_LOOKUP_UNAVAILABLE';
end;
$$;
revoke all on function public.resolve_curriculum_activity(jsonb) from public, anon;
grant execute on function public.resolve_curriculum_activity(jsonb) to authenticated;
