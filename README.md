# Us 🍄

A private two-person app for Charlie and Parker: a shared calendar, a no-pressure
update feed, a mood → activity matcher, to-dos, and dog notes (Kodo and Wiley; the list is `src/lib/dogs.ts`).
Dog notes are feed posts tagged with dogs (`as_dog`), shown as from the dog, or "The boys" for both; dog
profile photos live in the `dogs` table and are set on the Dogs tab. It's a
Next.js PWA hosted on Netlify (https://us-little-corner.netlify.app), with Supabase for the database, auth, realtime updates
and photo storage, and Web Push for notifications.

## What's where

| Path | What |
| --- | --- |
| `src/app/(app)/page.tsx` | Home: a view-only "today" dashboard (`src/components/Dashboard.tsx`: sleep, meals, plans, vibe, dog to-dos; tap a row to act), then the feed |
| `src/components/MealThread.tsx` | Breakfast / lunch / dinner back-and-forth (`lunch_msgs.meal`); lunch also has a "where"; the others only exist once started from ＋ |
| `src/app/(app)/calendar` | Day / Week / Month / List views, the four event types, Ask accept/decline (note + suggested time); each ask step posts to the feed |
| `src/components/Plans.tsx` | Time-block plans: a slot on a day, activities in order (drag), notes; both edit; "Send" leaves one feed note. Shown faded behind events in every calendar view |
| `src/app/(app)/do` | Energy check-in + the activity library and matcher (optional filters: in/out, cost, length) |
| `src/components/SideMenu.tsx` | The ☰ drawer; add new sections to `SECTIONS` |
| `src/app/(app)/eat` | Places to eat (filters, search, batch add, pick for us, each person's usual order) and home meals with a shared pantry and the grocery list |
| `src/app/(app)/shopping` | Everything to buy; `shop_items.grocery` items also show in Eat → Groceries. Drag items between categories |
| `src/app/(app)/dogs` | Dog profiles (`dogs` table: breed, weight, vet, meds, feeding…; `DogProfiles.tsx`), dog to-dos (which dog(s)), and a dog-only feed |
| `src/app/(app)/goals` | Savings goals (`goals`, `goal_items`, `goal_logs`; math in `src/lib/goals.ts`). Private ones are owner-only in RLS; shared ones only log money when `track` is on. Archive first; delete only from Archived, typed-name confirm |
| `src/app/(app)/presets` | Every preset in one place. Calendar presets (`event_templates`) link to the events they made (`events.template_id`); editing one can update upcoming / all / only new events. Calendar color markers (`events.color`, names in `calendar_colors`) are a stripe, separate from the kind of plan |
| `src/lib/series.ts` | Repeating events: every occurrence is its own `events` row sharing `series_id`; edit or delete one, or it and all later |
| `src/components/DailyRoutines.tsx` | To-do presets marked daily add themselves each day (unique `template_id`+`for_day`); yesterday's unchecked ones clear |
| `src/components/Status.tsx` | "On my way": one line per person (`statuses`), a quiet push, shown on Home for 3 hours |
| `src/app/(app)/little` | A cute profile per person (sizes, favorites, preferences as `little_things` rows labelled `field:<key>`, plus misc) and gift ideas (author-only in RLS). Linked quietly from the drawer |
| `src/app/(app)/nerd` + `src/components/Decks.tsx` | Nerd dungeon: MTG decks (owner, 1–10 evil, color, cover, tags, chase list) on draggable shelves; "Game night" deck calls (`deck_calls`). D&D can move in later |
| `src/app/(app)/garden` | Garden: products bought (`garden_items`) and each person's own rating (`garden_reviews`: high, worth it, effects) |
| `src/components/WhenPicker.tsx` | The one day-and-time picker: a line until tapped, then a small calendar + times |
| `src/components/TaskForm.tsx` | To-do add/edit sheet and one-tap presets (`task_templates`) |
| `src/app/(app)/saved` | Private folders of saved photos |
| `src/app/(app)/spicy` | PIN-gated: shared pics & videos tagged by who's in them, private fantasies, shared want-to-try list, notes, mood asks (presets or your own words; "not right now" hides it; a nudge if you asked < 3h ago) |
| `src/app/(app)/lists` | To-dos with deadlines (overdue → top + high): Ours (shared, incl. dog to-dos) and Just mine |
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
- One serif for everything: Fraunces (variable), with the SOFT axis at ~50 and WONK off. No sans-serif anywhere.
- Two themes, per device (Settings → Look): **Peach** (peach/pink base, green accents) and **Sage** (green base,
  pink accents). Colors are role tokens in `globals.css` redefined under `:root[data-theme=…]`; a boot script in
  `app/layout.tsx` applies the saved theme before first paint. Errors and overdue use `--danger` in both.
- Flat and quiet: no textures, hairline dividers, soft shadows only.
- Charlie's Kodo & Wiley illustrations live in `public/art` (cleaned of neighbor slivers, trimmed, square) and render
  through `components/DogPic.tsx`. The app icons in `public/icons` are generated from `kodo_wiley_face.png`.
- There are no animation libraries. The sticker pop in `lib/celebrate.ts` is about 60 lines of the Web Animations API, and it respects reduced-motion settings.
