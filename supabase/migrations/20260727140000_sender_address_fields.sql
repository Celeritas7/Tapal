-- Senders get the same structured address fields as the address book.
alter table public.tapal_senders add column if not exists district text;
alter table public.tapal_senders add column if not exists state    text;
