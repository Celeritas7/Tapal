-- Address titles: a person can have several addresses ("Tokyo flat",
-- "Madurai home", "Meena — office"). The title names the saved block in the
-- app; the label on the parcel still prints the person's name.
alter table public.tapal_senders   add column if not exists label text;
alter table public.tapal_addresses add column if not exists label text;
