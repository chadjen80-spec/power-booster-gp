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

-- the Starter Pack can be bought once per account
create unique index if not exists purchases_one_starter on public.purchases (user_id) where product = 'starter';

-- players can read their own purchases; nobody but the server can write
alter table public.purchases enable row level security;
drop policy if exists "read own purchases" on public.purchases;
create policy "read own purchases" on public.purchases for select using (auth.uid() = user_id);
