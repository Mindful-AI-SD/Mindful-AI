-- Create a profile automatically whenever a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Create profiles for users who signed up before this trigger existed.
insert into public.profiles (id, display_name)
select
  id,
  coalesce(
    raw_user_meta_data ->> 'display_name',
    split_part(email, '@', 1)
  )
from auth.users
on conflict (id) do nothing;

-- Seed the first published curriculum week.
insert into public.weeks (
  week_number,
  title,
  theme,
  description,
  is_published
)
values (
  1,
  'Mindful Attention',
  'Awareness and attention',
  'Practice noticing your thoughts and surroundings without immediately judging them.',
  true
)
on conflict (week_number) do update
set
  title = excluded.title,
  theme = excluded.theme,
  description = excluded.description,
  is_published = excluded.is_published,
  updated_at = now();

-- Seed the first activity for Week 1.
insert into public.activities (
  week_id,
  activity_type,
  title,
  content,
  sequence_number,
  duration_minutes,
  is_published
)
select
  id,
  'reflection',
  'Notice and Reflect',
  'Pause for a moment and notice what currently has your attention. Describe what you noticed and how it affected your thoughts or feelings.',
  1,
  10,
  true
from public.weeks
where week_number = 1
on conflict (week_id, sequence_number) do update
set
  activity_type = excluded.activity_type,
  title = excluded.title,
  content = excluded.content,
  duration_minutes = excluded.duration_minutes,
  is_published = excluded.is_published,
  updated_at = now();