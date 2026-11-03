-- Power Booster GP: purchase records. Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run.
-- Rows are written only by the game server (service role key, from the Stripe webhook / confirm call).
create table if not exists public.purchases (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  product text not null,
  stripe_session text not null unique,   -- one row per Stripe Checkout Session, so retries never double-grant
  amount integer not null,               -- in satang (3500 = 35.00 baht)
  currency text not null,
  created_at timestamptz not null default now()
);

-- the Starter Pack and each season's premium Pass can be bought once per account
create unique index if not exists purchases_one_starter on public.purchases (user_id) where product = 'starter';
create unique index if not exists purchases_one_pass on public.purchases (user_id, product) where product like 'pass\_s%';

-- players can read their own purchases; nobody but the server can write
alter table public.purchases enable row level security;
drop policy if exists "read own purchases" on public.purchases;
create policy "read own purchases" on public.purchases for select using (auth.uid() = user_id);

-- Ranked: one row per player per season, written only by the game server (ranked.js)
create table if not exists public.ranked (
  user_id uuid not null references auth.users (id) on delete cascade,
  season integer not null,
  name text not null,
  rp integer not null default 0,
  wins integer not null default 0,
  races integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, season)
);
create index if not exists ranked_leaderboard on public.ranked (season, rp desc);

-- every ranked race result, for checking disputes and cheating reports
create table if not exists public.ranked_results (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  season integer not null,
  place integer not null,
  humans integer not null,
  rp_delta integer not null,
  reason text,                            -- null, 'left', 'timeout' or 'invalid' (lap times the server rejected)
  created_at timestamptz not null default now()
);

-- the leaderboard is served by the game server; players never touch these tables directly
alter table public.ranked enable row level security;
alter table public.ranked_results enable row level security;
