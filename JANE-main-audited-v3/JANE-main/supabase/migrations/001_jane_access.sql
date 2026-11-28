-- Jane: let ONE signed-in owner read and write the Robin Expenses tables from the app.
-- Run once in Supabase SQL Editor (project: Robin Expenses). Change the email if needed.
-- Everyone else (not signed in, or any other login) still gets nothing.

create or replace function public.jane_is_owner() returns boolean
language sql stable as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) = 'augustine.worky@gmail.com' $$;

do $$
declare t text;
begin
  foreach t in array array['expenses','categories','accounts','routine_plan','routine_checks',
                           'diet_logs','workout_logs','workout_plan','exercises','body_metrics','expense_screenshots']
  loop
    execute format('drop policy if exists jane_owner_all on public.%I', t);
    execute format('create policy jane_owner_all on public.%I for all to authenticated using (public.jane_is_owner()) with check (public.jane_is_owner())', t);
  end loop;
end $$;

-- diet macros: carbs and fat next to protein
alter table public.diet_logs add column if not exists carbs_g numeric;
alter table public.diet_logs add column if not exists fat_g numeric;
