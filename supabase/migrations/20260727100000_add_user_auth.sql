-- Lock the tables to their owner. Before this, RLS granted anon full
-- read/write, which is unsafe now that the site is on public GitHub Pages.
-- After applying: enable Email (magic link) auth in the dashboard
-- (Authentication → Providers → Email) and add the site URL to
-- Authentication → URL Configuration → Redirect URLs.

-- 1. Ownership column. auth.uid() fills it automatically on insert.
alter table public.tapal_addresses add column if not exists user_id uuid default auth.uid();
alter table public.tapal_settings  add column if not exists user_id uuid default auth.uid();
alter table public.tapal_shipments add column if not exists user_id uuid default auth.uid();

-- 2. Replace the open policies with owner-only ones. No anon access at all.
--    (tapal_settings keeps id text as its key; the app now writes one row per
--    user with id = the user's uid, so users never collide on 'default'.)
drop policy if exists tapal_addresses_all on public.tapal_addresses;
create policy tapal_addresses_owner on public.tapal_addresses
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists tapal_settings_all on public.tapal_settings;
create policy tapal_settings_owner on public.tapal_settings
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists tapal_shipments_all on public.tapal_shipments;
create policy tapal_shipments_owner on public.tapal_shipments
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists tapal_addresses_user_idx on public.tapal_addresses (user_id);
create index if not exists tapal_shipments_user_idx on public.tapal_shipments (user_id);

-- 3. CLAIM EXISTING ROWS (run once, by hand, in the SQL editor).
--    Existing rows have user_id = null and are invisible to everyone until
--    claimed. Sign in to the app once, find your UUID under
--    Authentication → Users, then run:
--
--      update public.tapal_addresses set user_id = 'YOUR-UUID' where user_id is null;
--      update public.tapal_shipments set user_id = 'YOUR-UUID' where user_id is null;
--      update public.tapal_settings  set id = 'YOUR-UUID', user_id = 'YOUR-UUID' where id = 'default';
