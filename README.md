# Trackit

Baladiya health card renewal tracker for Half Million area managers.

- **Area managers** sign in and see only their own employees: add, edit, import from the template, alerts, and an AI assistant.
- **Admin** sees every area and store, filters by area manager, and creates area-manager logins.

Status: **Expired** (date passed), **Due ≤ 30 days**, **OK**.

## How it works

- Single page: `index.html` (no build step), hosted on GitHub Pages.
- Data, logins and live updates: Supabase project `hm-fieldnote` (tables `trackit_profiles`, `trackit_employees`; row-level security keeps each manager to their own staff).
- Bulk import: `trackit_import` database function matches rows on **Employee ID** (new → added, changed → updated, same → skipped).
- AI assistant: Supabase Edge Function `trackit-ask` calls Google Gemini (free tier). It never receives Iqama or mobile numbers. The key is stored as the `GEMINI_API_KEY` secret in Supabase, never in this code.
- Admin user management: Edge Function `trackit-admin-users`.

No employee data is stored in this repository.
