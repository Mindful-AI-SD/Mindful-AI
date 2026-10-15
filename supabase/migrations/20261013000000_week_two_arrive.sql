-- Minimal published entry for the Week 2 body-map check-in.
-- Selection is stored in progress.reflection_answers.arrive_body_region;
-- the existing per-user progress policies apply without new tables.
insert into public.weeks (week_number, title, theme, description, is_published)
values (2, 'Body Awareness', 'Noticing bodily sensations', 'Begin with a body-map check-in.', true)
on conflict (week_number) do nothing;

insert into public.activities (week_id, activity_type, title, content, sequence_number, is_published)
select id, 'reflection', 'Body-map check-in', 'Choose where you notice a sensation before continuing to Practice.', 1, true
from public.weeks where week_number = 2
on conflict (week_id, sequence_number) do nothing;
