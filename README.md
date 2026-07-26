# Parcel labels

Printable address labels for Indian parcels, plus a shipment log. Single static
HTML file, no build step, backed by Supabase.

- Address book, saved once and reused
- A4 label sheets — 2-up for cartons, 4-up for small boxes
- Boxed PIN digits in the format postal sorters read fastest
- Optional FRAGILE band and a duplicate slip for inside the box
- Shipment log for consignment numbers, service, cost and status

## Layout

```
index.html                                   the whole app
supabase/migrations/
  20260726062116_create_parcel_app_tables.sql
```

## Running it

There is no build. Open `index.html` in a browser, or serve it:

```bash
python3 -m http.server 8000
```

The badge at the top of the page reports connection state. Green means Supabase
is reachable; amber means it fell back to device-only storage and nothing is
syncing.

## Supabase

Already applied to project `wylxvmkcrexwfpjpbhyy` (**General_apps**,
ap-south-1). The tables are live — the migration file exists so the schema is
version-controlled, not because anything needs running.

Config lives at the top of the `<script type="module">` block in `index.html`:

```js
const SUPABASE_URL = "https://wylxvmkcrexwfpjpbhyy.supabase.co";
const SUPABASE_KEY = "sb_publishable_...";
```

### Tables

| Table | Holds |
| --- | --- |
| `parcel_app_addresses` | Address book. Deletes are soft (`archived = true`). |
| `parcel_app_settings` | Sender details, single row keyed `default`. |
| `parcel_app_shipments` | One row per parcel sent. FK to addresses, `on delete set null`. |

### Working with the CLI

```bash
supabase link --project-ref wylxvmkcrexwfpjpbhyy
```

**Do not run `supabase db pull` from this repo.** The project is shared with
around twenty other apps — a pull would dump all ~115 tables into this repo's
migration folder. Write migrations by hand and apply them with `db push`, or
apply them from the dashboard and mirror the SQL here afterwards.

`supabase db reset` only touches the local dev database, never the remote.

## Security

RLS is enabled but the policies grant `anon` full read and write, matching the
convention used by the other apps in this project. **Anyone with the project URL
and the publishable key can read and modify every stored address.**

The key is in `index.html` and is meant to be public — that is what publishable
keys are for. The exposure comes from the open policies behind it, not the key
itself.

This holds home addresses and phone numbers of family and friends. Two options:

1. **Keep the repo private and don't share the deployed URL.** Fine for personal
   use.
2. **Add auth.** Turn on Supabase magic-link email auth, add a `user_id uuid
   default auth.uid()` column to each table, and replace the policies with
   `using (auth.uid() = user_id)`. Roughly a twenty-line change plus a sign-in
   screen.

Do option 1 or 2 before the repo goes public.

## Deploying

Any static host works. Netlify, the shortest path:

```bash
npx netlify-cli deploy --prod --dir .
```

Or drag the folder onto https://app.netlify.com/drop for a URL in seconds with
no account.

GitHub Pages works too — Settings → Pages → deploy from branch root. Note that a
Pages site is public, so read the Security section first.

## Printing

Desktop or mobile, the button is the same. On a phone, **Print / Save as PDF**
opens the share sheet where "Save as PDF" is one of the destinations. The `@page`
rule pins A4, so output is correctly sized regardless of the device that made it.

Print at 100% scale — "fit to page" will shrink the labels and throw off the
physical dimensions.
