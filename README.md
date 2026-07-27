# Tapal — parcel labels

Printable address labels for Indian parcels, plus a shipment log. Single static
HTML file, no build step, backed by Supabase.

- Address book, saved once and reused
- A4 label sheets — 2-up for cartons, 4-up for small boxes, and a full-page
  label when printing for a single recipient
- Boxed PIN digits in the format postal sorters read fastest
- Per-recipient FRAGILE band with a broken-glass mark, handling instructions
  and precaution tags (GLASS · काँच / THIS SIDE UP ↑ / KEEP DRY)
- Optional duplicate slip for inside the box
- Shipment log for consignment numbers, service, cost and status
- Magic-link email sign-in; access controlled by the shared
  `authentication_mode_user_roles` table — admin and operator can edit,
  viewer is read-only (browsing, selecting and printing still work), and
  emails not on the list are refused

## Layout

```
index.html                the whole app
netlify.toml              static deploy config
supabase/migrations/
  20260726062116_create_parcel_app_tables.sql
  20260726095203_rename_parcel_app_to_tapal.sql
  20260727100000_add_user_auth.sql
  20260727110000_role_based_access.sql
Temp/                     local scratch — gitignored, never deployed
```

## Running it

There is no build. Serve the folder:

```bash
python3 -m http.server 8000
```

Opening `index.html` as a `file://` URL blocks Supabase; the badge falls back to
device-only storage.

## Supabase

Project `wylxvmkcrexwfpjpbhyy` (**General_apps**, ap-south-1). Tables:

| Table | Holds |
| --- | --- |
| `tapal_addresses` | Address book, shared among listed members. Deletes are soft (`archived = true`). |
| `tapal_settings` | Sender details, one row per user (`id` = the user's uid). |
| `tapal_shipments` | One row per parcel sent. FK to addresses, `on delete set null`. |
| `authentication_mode_user_roles` | Shared access list (admin / operator / viewer), also used by the other apps in this project. Not touched by Tapal's migrations except a read-only `tapal_my_role()` helper. |

Config lives at the top of the `<script>` block in `index.html`.

### Enabling auth (one-time dashboard setup)

1. Apply `20260727100000_add_user_auth.sql`, then
   `20260727110000_role_based_access.sql` (`supabase db push`, or paste them in
   the SQL editor in order).
2. Authentication → Providers → **Email**: on, "Confirm email" can stay on —
   the magic link is the confirmation.
3. Authentication → URL Configuration → **Redirect URLs**: add the site URL
   (e.g. `https://<user>.github.io/Tapal/`) and `http://localhost:8000` for
   local use.
4. Open the app, send yourself a sign-in link, tap it. Access requires your
   email to be in `authentication_mode_user_roles`; rows that predate auth
   need no claiming — they are shared with every listed member.

**Do not run `supabase db pull` from this repo** — the project is shared with
~20 other apps. Write migrations by hand and `db push`, or apply from the
dashboard and mirror the SQL here.

## Security

RLS is role-based: signed-in users found in `authentication_mode_user_roles`
can read; only `admin` and `operator` can write; `viewer` is read-only; every
other email — signed in or not — gets nothing. `anon` has no table access at
all. The publishable key in `index.html` is meant to be public — it can now
only be used to request a sign-in link.

The repo and the deployed URL are safe to be public. What the magic link
protects is your mailbox: anyone who can read your email can sign in as you.

## Deploying

Any static host. GitHub Pages: Settings → Pages → deploy from branch root.
Netlify: `npx netlify-cli deploy --prod --dir .` or drag the folder onto
https://app.netlify.com/drop. After moving hosts, add the new URL to the
Supabase redirect list (auth setup step 3).

## Printing

Desktop or mobile, the button is the same. On a phone, **Print / Save as PDF**
opens the share sheet where "Save as PDF" is one of the destinations. The `@page`
rule pins A4, so output is correctly sized regardless of the device that made it.

Print at 100% scale — "fit to page" will shrink the labels and throw off the
physical dimensions.

Fragile is per recipient: tick **Fragile** on an address row, or use the
checkbox in Print options to set every row at once. The Hindi line on the band
renders from system fonts; on the rare machine without a Devanagari font it
prints as boxes — the English instructions still carry the meaning.
