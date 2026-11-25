begin;
alter table public.tapal_senders add column if not exists address_romaji text;
alter table public.tapal_addresses add column if not exists address_romaji text;
commit;
