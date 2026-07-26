-- Parcel label + shipment tracking app
-- Applied to project wylxvmkcrexwfpjpbhyy (General_apps) on 2026-07-26.
-- The version prefix matches the remote migration history, so the CLI treats
-- this as already applied and will not re-run it.

create table if not exists public.parcel_app_addresses (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text,
  line        text,
  city        text,
  district    text,
  state       text,
  pin         char(6) check (pin ~ '^[0-9]{6}$'),
  notes       text,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.parcel_app_settings (
  id            text primary key default 'default',
  sender_name   text,
  sender_phone  text,
  sender_line   text,
  sender_city   text,
  sender_pin    char(6),
  updated_at    timestamptz not null default now()
);

create table if not exists public.parcel_app_shipments (
  id              uuid primary key default gen_random_uuid(),
  address_id      uuid references public.parcel_app_addresses(id) on delete set null,
  recipient       text,
  contents        text,
  service         text,
  consignment_no  text,
  booked_on       date default current_date,
  delivered_on    date,
  status          text not null default 'packed',
  cost            numeric(10,2),
  notes           text,
  created_at      timestamptz not null default now()
);

create index if not exists parcel_app_addresses_name_idx  on public.parcel_app_addresses (name);
create index if not exists parcel_app_shipments_addr_idx  on public.parcel_app_shipments (address_id);
create index if not exists parcel_app_shipments_date_idx  on public.parcel_app_shipments (booked_on desc);

create or replace function public.parcel_app_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists parcel_app_addresses_touch on public.parcel_app_addresses;
create trigger parcel_app_addresses_touch
  before update on public.parcel_app_addresses
  for each row execute function public.parcel_app_touch();

drop trigger if exists parcel_app_settings_touch on public.parcel_app_settings;
create trigger parcel_app_settings_touch
  before update on public.parcel_app_settings
  for each row execute function public.parcel_app_touch();

alter table public.parcel_app_addresses enable row level security;
alter table public.parcel_app_settings  enable row level security;
alter table public.parcel_app_shipments enable row level security;

-- NOTE: open anon access, matching the pattern used by the other apps in this
-- project. Anyone holding the project URL + publishable key can read and write
-- these rows. See README before making the repo public.
drop policy if exists parcel_app_addresses_all on public.parcel_app_addresses;
create policy parcel_app_addresses_all on public.parcel_app_addresses
  for all to anon, authenticated using (true) with check (true);

drop policy if exists parcel_app_settings_all on public.parcel_app_settings;
create policy parcel_app_settings_all on public.parcel_app_settings
  for all to anon, authenticated using (true) with check (true);

drop policy if exists parcel_app_shipments_all on public.parcel_app_shipments;
create policy parcel_app_shipments_all on public.parcel_app_shipments
  for all to anon, authenticated using (true) with check (true);

insert into public.parcel_app_settings (id) values ('default')
  on conflict (id) do nothing;
