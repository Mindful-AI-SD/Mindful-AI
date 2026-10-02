-- Development reset uses the signed-in session and may delete only that
-- account's progress. The app action itself is excluded from production.
drop policy if exists "Users can delete their own progress" on public.progress;

create policy "Users can delete their own progress"
on public.progress
for delete
to authenticated
using ((select auth.uid()) = user_id);
