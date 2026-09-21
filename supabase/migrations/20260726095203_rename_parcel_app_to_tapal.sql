-- Rename the parcel label app's objects from parcel_app_* to tapal_*
-- Applied to project wylxvmkcrexwfpjpbhyy (General_apps) on 2026-07-26.
-- Renames only: no data was moved, copied or dropped.

alter table public.parcel_app_addresses rename to tapal_addresses;
alter table public.parcel_app_settings  rename to tapal_settings;
alter table public.parcel_app_shipments rename to tapal_shipments;

alter index public.parcel_app_addresses_name_idx rename to tapal_addresses_name_idx;
alter index public.parcel_app_shipments_addr_idx rename to tapal_shipments_addr_idx;
alter index public.parcel_app_shipments_date_idx rename to tapal_shipments_date_idx;

alter policy parcel_app_addresses_all on public.tapal_addresses rename to tapal_addresses_all;
alter policy parcel_app_settings_all  on public.tapal_settings  rename to tapal_settings_all;
alter policy parcel_app_shipments_all on public.tapal_shipments rename to tapal_shipments_all;

alter function public.parcel_app_touch() rename to tapal_touch;

alter trigger parcel_app_addresses_touch on public.tapal_addresses rename to tapal_addresses_touch;
alter trigger parcel_app_settings_touch  on public.tapal_settings  rename to tapal_settings_touch;
