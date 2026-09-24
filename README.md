# Us 🍄

A private two-person app for Charlie and Parker: a shared calendar, a no-pressure
update feed, a mood → activity matcher, to-dos, and dog notes (Kodo and Wiley; the list is `src/lib/dogs.ts`).
Dog notes are feed posts tagged with dogs, so they show in the feed and the Dogs tab. It's a
Next.js PWA hosted on Netlify (https://us-little-corner.netlify.app), with Supabase for the database, auth, realtime updates
and photo storage, and Web Push for notifications.

## What's where

| Path | What |
| --- | --- |
| `src/app/(app)/page.tsx` | Home feed: updates and dog notes, photos |
| `src/app/(app)/calendar` | Day / Week / Month / List views, the four event types, Ask accept/decline (note + suggested time); each ask step posts to the feed |
| `src/app/(app)/do` | Energy check-in + the activity library and matcher (optional filters: in/out, cost, length) |
| `src/app/(app)/lists` | To-dos with deadlines (overdue → top + high), Ours collects shared/household/dog items, dog notes + dog to-dos |
| `src/app/(app)/settings` | Display name, push on/off, per-kind notification toggles, change PIN, sign out |
| `src/components/AddSheet.tsx` | The fast-entry sheet behind the + button |
| `src/app/api/notify` | Event-triggered pushes (asks, answers, posts, energy pings) |
| `src/app/api/cron/reminders` | Scheduled reminder sweep (called by `netlify/functions/reminders.mts`) |
| `src/app/api/auth/pin` | PIN sign-in (with a global lockout) and PIN change |
| `scripts/set-pin.mjs` | Set or reset someone's PIN from the command line |
| `src/lib/useLive.ts` | Fetch + Supabase Realtime + refetch on foreground |
| `public/sw.js` | Service worker: push + notification taps |
| `supabase/migrations/` | The schema: tables, RLS, realtime, storage bucket, PIN logins, notification prefs |
| `src/app/globals.css` | The design system. All colors are CSS variables on `:root` |

Names are never hardcoded. Each person's display name lives in `profiles` and can be edited in Settings.

## Deployment

- **Hosting:** Netlify site `us-little-corner`. Site env vars: the VAPID keys, `CRON_SECRET`, `VAPID_SUBJECT`, `PIN_PEPPER`,
  and the Supabase vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).
  Secret vars (`SUPABASE_SERVICE_ROLE_KEY`, `PIN_PEPPER`, `CRON_SECRET`, `VAPID_PRIVATE_KEY`) must be scoped to the
  **production** context: Netlify silently drops secret values set for "all contexts" while reporting success.
  Env var changes only reach the site on the next deploy.
- **Deploys:** Netlify builds the `claude/festive-pasteur-p3rnc7` branch on every push.
- **Reminders:** `netlify/functions/reminders.mts` is a Netlify scheduled function. Every 5 minutes it calls `/api/cron/reminders` with `CRON_SECRET`.
  (`supabase/optional/reminder_cron.sql` is an alternative if the app ever moves to a host without cron.)
- **Supabase:** run the files in `supabase/migrations/` in order, turn off sign-ups, and set the Site URL to the Netlify URL.
- **Accounts:** create each user (admin API, `email_confirm: true`, `user_metadata.display_name`), then give them a PIN with
  `scripts/set-pin.mjs`. Sign-in is PIN only: the server HMACs the PIN with `PIN_PEPPER`, which both finds the account and is
  its real Supabase password, so a PIN can't be guessed against Supabase directly. Wrong guesses are capped at 5 per 15 minutes
  and 20 per day across the whole app. The app asks for the PIN on every entry (cold start, or back after a
  minute away; `src/lib/lock.ts`), and each unlock is a fresh sign-in.

### On each phone
- **iPhone:** open the site in Safari → Share → **Add to Home Screen** → open Us from the home screen → sign in → Settings → turn on notifications (needs iOS 16.4 or later).
- **Android:** Chrome → menu → Install app → Settings → turn on notifications.

## Local dev
```bash
npm install
npx supabase start          # needs Docker; applies the migration automatically
# create the two users (Studio at http://127.0.0.1:54323, or the admin API), then scripts/set-pin.mjs
npm run dev
```

## Design notes
- There are six palette colors: cream, terracotta, butter, sage, dusty rose, and plum. Every other color is mixed from these with `color-mix()`.
- Each event type has its own look: **plum** means both of you are going, **sage** is a solo FYI, **butter** is a pending Ask, and **dusty rose with a dashed border** is on the radar. An accepted Ask turns plum. A declined Ask turns into the creator's sage solo plan.
- Dark mode can be added later by redefining the token block in `globals.css` under `prefers-color-scheme: dark`.
- There are no animation libraries. The sticker pop in `lib/celebrate.ts` is about 60 lines of the Web Animations API, and it respects reduced-motion settings.
