# Setup handoff: finish going live

These are instructions for the Claude session that finishes deployment. The
people's emails and the invite timing are in the user's message, not here,
because this is a repo.

## Already done
- Netlify site `us-little-corner` (id `4f619562-f097-4a28-bd63-1dfc59391606`), https://us-little-corner.netlify.app
  - Team-login protection is OFF for this site, so Parker can open it.
  - Env vars already set: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (secret), `CRON_SECRET` (secret), `VAPID_SUBJECT`.
- Reminders run from `netlify/functions/reminders.mts` every 5 minutes. No pg_cron is needed.
- The environment should have `SUPABASE_ACCESS_TOKEN` set, plus network access to `api.supabase.com` and `*.supabase.co`.

## To do (in order)
1. **Create a Supabase project** with the Management API (`https://api.supabase.com/v1`, `Authorization: Bearer $SUPABASE_ACCESS_TOKEN`).
   - `GET /organizations` → use the org id to call `POST /projects` with `{name:"us", organization_id, region:"us-west-1", db_pass:<random 32 hex>}`.
   - Poll `GET /projects/{ref}` until `status` is `ACTIVE_HEALTHY`.
2. **Run the schema:** `POST /projects/{ref}/database/query` with `{query: <contents of supabase/migrations/0001_init.sql>}`.
   Then verify that `public.profiles`, the RLS policies, and the `photos` bucket exist.
3. **Configure auth:** `PATCH /projects/{ref}/config/auth` with
   `{disable_signup:true, site_url:"https://us-little-corner.netlify.app", uri_allow_list:"https://us-little-corner.netlify.app/welcome,https://us-little-corner.netlify.app/auth/callback"}`.
4. **Keys:** `GET /projects/{ref}/api-keys?reveal=true` returns the anon and service_role keys.
   Set them on the Netlify site with the Netlify MCP `manage-env-vars`:
   `NEXT_PUBLIC_SUPABASE_URL=https://{ref}.supabase.co`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (not secret), `SUPABASE_SERVICE_ROLE_KEY` (secret).
   Never print the keys into chat or commit them.
5. **Deploy** to the Netlify site (Netlify MCP `deploy-site` with the site id above).
6. **Smoke test the live site:**
   - `/login` renders.
   - `GET /api/cron/reminders` without auth returns 401.
   - `/manifest.webmanifest` loads.
7. **Accounts.** Use the auth admin API on the project (`https://{ref}.supabase.co/auth/v1/admin/...`, service role key).
   Create both users with `POST /auth/v1/admin/users` using `{email, email_confirm:true, user_metadata:{display_name}}` and no password. This sends no email.
   - Supabase's built-in email only delivers to members of the org team. So the owner's own email works, and the partner's will not.
   - **Owner:** `POST /auth/v1/recover` with `redirect_to` set to `/welcome`. That emails them a pick-a-password link.
   - **Partner:** do NOT email them. It's a surprise, and the email wouldn't arrive anyway.
     When the user says they're ready, call `POST /auth/v1/admin/generate_link` with `{type:"recovery", email, redirect_to:"https://us-little-corner.netlify.app/welcome"}`.
     Give the `action_link` to the user to pass along themselves. It expires in about an hour, so generate it only on request.
8. **Report back** with the live URL, what was sent, and what's pending. Do not ask the user to paste any keys.
