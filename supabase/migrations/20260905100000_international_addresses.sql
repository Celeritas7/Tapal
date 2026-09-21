-- Address book goes international: a country column, and postal codes that
-- aren't forced into India's 6-digit PIN shape (Japan 272-0001, UK SW1A 1AA…).
-- The check constraint kept its pre-rename name; drop both spellings to be safe.
alter table public.tapal_addresses drop constraint if exists parcel_app_addresses_pin_check;
alter table public.tapal_addresses drop constraint if exists tapal_addresses_pin_check;
alter table public.tapal_addresses alter column pin type text using nullif(trim(pin), '');
alter table public.tapal_addresses add column if not exists country text not null default 'India';
