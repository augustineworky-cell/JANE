-- Jane: save the Gemini API key from the app (Settings -> AI key). Already applied on Robin Expenses.
-- The key sits in a private schema the app cannot read; only the jane-ai Edge Function (service role) reads it.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.jane_secrets (name text primary key, value text not null, updated_at timestamptz not null default now());
revoke all on private.jane_secrets from public, anon, authenticated;
create or replace function public.jane_set_ai_key(k text) returns text language plpgsql security definer set search_path = '' as $$
begin
  if not public.jane_is_owner() then raise exception 'Not allowed'; end if;
  k := btrim(coalesce(k, ''));
  if length(k) < 20 then raise exception 'That does not look like an API key'; end if;
  insert into private.jane_secrets(name, value, updated_at) values ('GEMINI_API_KEY', k, now())
  on conflict (name) do update set value = excluded.value, updated_at = now();
  return '••••' || right(k, 4);
end $$;
create or replace function public.jane_ai_key_status() returns text language sql security definer stable set search_path = '' as $$
  select case when public.jane_is_owner() then (select '••••' || right(value, 4) from private.jane_secrets where name = 'GEMINI_API_KEY') end $$;
create or replace function public.jane_get_ai_key() returns text language sql security definer stable set search_path = '' as $$
  select value from private.jane_secrets where name = 'GEMINI_API_KEY' $$;
revoke all on function public.jane_set_ai_key(text), public.jane_ai_key_status(), public.jane_get_ai_key() from public, anon;
grant execute on function public.jane_set_ai_key(text), public.jane_ai_key_status() to authenticated;
revoke execute on function public.jane_get_ai_key() from authenticated;
grant execute on function public.jane_get_ai_key() to service_role;
