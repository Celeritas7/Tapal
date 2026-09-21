-- Multiple sender ("From") profiles per user. Replaces the single sender
-- block on tapal_settings with a tapal_senders table — one row per saved
-- return address. tapal_settings itself stays (the app still pings it as a
-- connectivity check, and its sender_* columns remain as a fossil record).

create table if not exists public.tapal_senders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text,
  phone      text,
  line       text,
  city       text,
  pin        text,
  country    text not null default 'India',
  created_at timestamptz not null default now()
);

alter table public.tapal_senders enable row level security;

-- Same model as the other tapal_ tables: listed members read, admin/operator
-- write — but sender profiles are personal, so writes only touch your own rows.
create policy tapal_senders_read on public.tapal_senders
  for select to authenticated using (public.tapal_my_role() is not null);
create policy tapal_senders_insert on public.tapal_senders
  for insert to authenticated
  with check (public.tapal_my_role() in ('admin','operator') and user_id = auth.uid());
create policy tapal_senders_update on public.tapal_senders
  for update to authenticated
  using (public.tapal_my_role() in ('admin','operator') and user_id = auth.uid())
  with check (public.tapal_my_role() in ('admin','operator') and user_id = auth.uid());
create policy tapal_senders_delete on public.tapal_senders
  for delete to authenticated
  using (public.tapal_my_role() in ('admin','operator') and user_id = auth.uid());

-- Carry over each user's existing sender block as their first profile.
-- tapal_settings.id is text; join through auth.users to cast it safely.
insert into public.tapal_senders (user_id, name, phone, line, city, pin)
select u.id, s.sender_name, s.sender_phone, s.sender_line, s.sender_city, s.sender_pin
from public.tapal_settings s
join auth.users u on u.id::text = s.id
where coalesce(s.sender_name, '') <> '' or coalesce(s.sender_line, '') <> '';

-- Safe to re-run if an earlier version of this file was already applied.
alter table public.tapal_senders add column if not exists country text not null default 'India';
