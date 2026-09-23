-- PIN sign-in + per-kind notification preferences.

-- ─── PIN sign-in ─────────────────────────────────────────────────────────────
-- Each person signs in with a 4-digit PIN. The server HMACs the PIN with a
-- secret pepper (PIN_PEPPER env var); that digest finds the user here and also
-- IS their Supabase password, so the PIN alone is useless against Supabase
-- directly. RLS on with no policies: only the service role can touch these.
create table public.pin_logins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  pin_hmac text not null unique
);
alter table public.pin_logins enable row level security;

-- Failed PIN attempts, for the global lockout in /api/auth/pin.
create table public.pin_attempts (
  id bigint generated always as identity primary key,
  ok boolean not null,
  created_at timestamptz not null default now()
);
create index pin_attempts_created_idx on public.pin_attempts (created_at desc);
alter table public.pin_attempts enable row level security;

-- ─── Notification preferences ────────────────────────────────────────────────
alter table public.profiles
  add column notify_reminders boolean not null default true,
  add column notify_asks boolean not null default true,
  add column notify_energy boolean not null default true;
