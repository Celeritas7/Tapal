-- Apply to General_apps before deploying the Phase 3 client.
-- Older clients can still write rows without specifying a currency.
alter table public.tapal_shipments
  add column if not exists cost_currency text
  check (cost_currency ~ '^[A-Z]{3}$');
