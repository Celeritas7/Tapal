-- Access control via the shared authentication_mode_user_roles table
-- (admin / operator / viewer). Replaces the owner-only policies from
-- 20260727100000: the address book, settings and log become SHARED among
-- everyone on the list. Emails not in the table get no access at all.
-- The pre-auth rows (user_id null) need no claiming under this model.

-- Role lookup for the signed-in user. SECURITY DEFINER so it can read the
-- roles table regardless of that table's own RLS (which other apps rely on
-- and which this migration deliberately does not touch).
create or replace function public.tapal_my_role()
returns text
language sql stable security definer
set search_path = public
as $$
  select role from public.authentication_mode_user_roles
  where lower(email) = lower(coalesce(auth.jwt()->>'email',''))
  limit 1;
$$;

grant execute on function public.tapal_my_role() to authenticated;
revoke execute on function public.tapal_my_role() from anon;

-- tapal_addresses: listed members read; admin/operator write.
drop policy if exists tapal_addresses_owner on public.tapal_addresses;
drop policy if exists tapal_addresses_read   on public.tapal_addresses;
drop policy if exists tapal_addresses_insert on public.tapal_addresses;
drop policy if exists tapal_addresses_update on public.tapal_addresses;
drop policy if exists tapal_addresses_delete on public.tapal_addresses;
create policy tapal_addresses_read on public.tapal_addresses
  for select to authenticated using (public.tapal_my_role() is not null);
create policy tapal_addresses_insert on public.tapal_addresses
  for insert to authenticated with check (public.tapal_my_role() in ('admin','operator'));
create policy tapal_addresses_update on public.tapal_addresses
  for update to authenticated using (public.tapal_my_role() in ('admin','operator'))
  with check (public.tapal_my_role() in ('admin','operator'));
create policy tapal_addresses_delete on public.tapal_addresses
  for delete to authenticated using (public.tapal_my_role() in ('admin','operator'));

-- tapal_settings: same. One row per user (id = uid), but visible to members
-- so nothing breaks if an admin inspects another sender block.
drop policy if exists tapal_settings_owner on public.tapal_settings;
drop policy if exists tapal_settings_read   on public.tapal_settings;
drop policy if exists tapal_settings_insert on public.tapal_settings;
drop policy if exists tapal_settings_update on public.tapal_settings;
drop policy if exists tapal_settings_delete on public.tapal_settings;
create policy tapal_settings_read on public.tapal_settings
  for select to authenticated using (public.tapal_my_role() is not null);
create policy tapal_settings_insert on public.tapal_settings
  for insert to authenticated with check (public.tapal_my_role() in ('admin','operator'));
create policy tapal_settings_update on public.tapal_settings
  for update to authenticated using (public.tapal_my_role() in ('admin','operator'))
  with check (public.tapal_my_role() in ('admin','operator'));
create policy tapal_settings_delete on public.tapal_settings
  for delete to authenticated using (public.tapal_my_role() in ('admin','operator'));

-- tapal_shipments: same.
drop policy if exists tapal_shipments_owner on public.tapal_shipments;
drop policy if exists tapal_shipments_read   on public.tapal_shipments;
drop policy if exists tapal_shipments_insert on public.tapal_shipments;
drop policy if exists tapal_shipments_update on public.tapal_shipments;
drop policy if exists tapal_shipments_delete on public.tapal_shipments;
create policy tapal_shipments_read on public.tapal_shipments
  for select to authenticated using (public.tapal_my_role() is not null);
create policy tapal_shipments_insert on public.tapal_shipments
  for insert to authenticated with check (public.tapal_my_role() in ('admin','operator'));
create policy tapal_shipments_update on public.tapal_shipments
  for update to authenticated using (public.tapal_my_role() in ('admin','operator'))
  with check (public.tapal_my_role() in ('admin','operator'));
create policy tapal_shipments_delete on public.tapal_shipments
  for delete to authenticated using (public.tapal_my_role() in ('admin','operator'));
