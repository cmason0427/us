# Us 🍄

A private two-person app for Charlie and Parker: a shared calendar, a no-pressure
update feed, a mood → activity matcher, to-dos, and Kodo's log. It's a
Next.js PWA on Vercel, with Supabase for the database, auth, realtime updates
and photo storage, and Web Push for notifications.

## What's where

| Path | What |
| --- | --- |
| `src/app/(app)/page.tsx` | Home feed: posts, photos, reactions |
| `src/app/(app)/calendar` | Day / Week / Month / List views, the four event types, Ask accept/decline |
| `src/app/(app)/do` | Energy check-in + the activity library and matcher |
| `src/app/(app)/lists` | Shared and personal to-dos, the Kodo log, household items |
| `src/app/(app)/settings` | Display name, push on/off, the post-nudge toggle, sign out |
| `src/components/AddSheet.tsx` | The fast-entry sheet behind the + button |
| `src/app/api/notify` | Event-triggered pushes (asks, answers, posts, energy pings) |
| `src/app/api/cron/reminders` | Scheduled reminder sweep |
| `src/lib/useLive.ts` | Fetch + Supabase Realtime + refetch on foreground |
| `public/sw.js` | Service worker: push + notification taps |
| `supabase/migrations/0001_init.sql` | The full schema: tables, RLS, realtime, storage bucket |
| `src/app/globals.css` | The design system. All colors are CSS variables on `:root` |

Names are never hardcoded. Each person's display name lives in `profiles` and can be edited in Settings.

## Setup (about 20 minutes, one time)

### 1. Supabase
1. Create a project at supabase.com.
2. **SQL Editor** → paste all of `supabase/migrations/0001_init.sql` → Run.
3. **Authentication → Sign In / Providers**: turn **off** "Allow new users to sign up". This is what keeps the app to two people.
4. **Authentication → Users → Add user** (twice): enter each person's email and a password, and tick "Auto confirm". Each profile's display name defaults to the capitalized part of the email before the `@`, and you can change it in Settings.
5. **Authentication → URL Configuration**: set Site URL to your Vercel URL and add `https://YOUR-APP.vercel.app/auth/callback` to the redirect URLs. Magic links need this.

### 2. Keys
```bash
npx web-push generate-vapid-keys   # gives the public + private VAPID keys
openssl rand -hex 32               # CRON_SECRET
```
Copy `.env.example` to `.env.local` and fill it in. The Supabase values are under Project Settings → API.

### 3. Vercel
1. Import the GitHub repo into Vercel.
2. Add every variable from `.env.example` under Project → Settings → Environment Variables.
3. Deploy. After that, every push to the main branch redeploys automatically.

### 4. Reminders (important)
Vercel's **Hobby plan only runs cron jobs once a day**. `vercel.json` schedules one run at 13:00 UTC, which covers "morning of" reminders but not "1 hour before".
For accurate reminders, open `supabase/optional/reminder_cron.sql`, fill in your app URL and `CRON_SECRET`, and run it in the SQL editor. It uses Supabase's free pg_cron to call the endpoint every 5 minutes. The endpoint is idempotent, so both schedulers can run side by side.

### 5. On each phone
- **iPhone:** open the site in Safari → Share → **Add to Home Screen** → open Us from the home screen → Settings → turn on notifications. iOS only allows push from the home-screen app (iOS 16.4+).
- **Android:** Chrome → menu → Install app → Settings → turn on notifications.

## Local dev
```bash
npm install
npx supabase start          # needs Docker; applies the migration automatically
# create the two users (Studio at http://127.0.0.1:54323, or the admin API)
npm run dev
```

## Design notes
- There are six palette colors: cream, terracotta, butter, sage, dusty rose, and plum. Every other color is mixed from these with `color-mix()`.
- Each event type has its own look: **plum** means both of you are going, **sage** is a solo FYI, **butter** is a pending Ask, and **dusty rose with a dashed border** is on the radar. An accepted Ask turns plum. A declined Ask turns into the creator's sage solo plan.
- Dark mode can be added later by redefining the token block in `globals.css` under `prefers-color-scheme: dark`.
- There are no animation libraries. The sticker pop in `lib/celebrate.ts` is about 60 lines of the Web Animations API, and it respects reduced-motion settings.
