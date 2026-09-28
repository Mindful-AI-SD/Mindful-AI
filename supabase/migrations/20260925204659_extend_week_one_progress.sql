-- Expand the existing progress table for the Week 1 vertical slice.
alter table public.progress
  add column status text not null default 'not_started',
  add column current_step text not null default 'breathing',
  add column writing text,
  add column generated_intentions jsonb not null default '[]'::jsonb,
  add column reflection_answers jsonb not null default '{}'::jsonb,
  add column started_at timestamptz,
  add column updated_at timestamptz not null default now(),
  alter column completed_at drop not null,
  alter column completed_at drop default;

-- Existing rows represented completed activities in the original schema.
update public.progress
set
  status = 'completed',
  current_step = 'completed',
  started_at = completed_at
where completed_at is not null;

alter table public.progress
  add constraint progress_status_check
    check (
      status in (
        'not_started',
        'in_progress',
        'completed'
      )
    ),
  add constraint progress_current_step_not_blank
    check (char_length(btrim(current_step)) > 0),
  add constraint progress_generated_intentions_is_array
    check (jsonb_typeof(generated_intentions) = 'array'),
  add constraint progress_reflection_answers_is_object
    check (jsonb_typeof(reflection_answers) = 'object'),
  add constraint progress_completion_state_check
    check (
      (
        status = 'completed'
        and completed_at is not null
      )
      or
      (
        status in ('not_started', 'in_progress')
        and completed_at is null
      )
    );

create trigger progress_set_updated_at
before update on public.progress
for each row execute function public.set_updated_at();