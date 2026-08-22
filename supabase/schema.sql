-- BidBlitz — Supabase schema
-- =========================================================================
-- The chain (Monad testnet) is the source of truth for money: purses, bids,
-- sales, and winner badges all live in the BidBlitz contract. Supabase holds
-- only the *presentation* state that the contract intentionally does not:
--
--   • which categories a host picked for a room   (was localStorage, host-only)
--   • the roster of items to auction, with images (so every phone sees them)
--   • each participant's display name + avatar     (so the big screen shows them)
--
-- Nothing here can move funds. Losing this DB degrades the app to "generic
-- avatars + no preset roster"; it never corrupts an auction.
--
-- Run once: Supabase Dashboard -> SQL Editor -> paste -> Run.
-- =========================================================================

-- Rooms -------------------------------------------------------------------
-- Keyed by the human room code (base36 of the on-chain roomId, e.g. '0001'),
-- because that is what every URL and QR carries.
create table if not exists public.rooms (
  code        text primary key,
  room_id     bigint,                       -- on-chain roomId
  mode        smallint not null default 0,  -- 0 = auction/solo, 1 = fantasy/squads
  title       text,
  host_name   text,
  host_addr   text,
  categories  jsonb not null default '[]'::jsonb,
  fund_amount numeric,                          -- host-set MON to airdrop each joiner (randomised); null = default
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- For projects created before fund_amount existed:
alter table public.rooms add column if not exists fund_amount numeric;

-- Item roster -------------------------------------------------------------
-- The lots a host plans to run. A row becomes a live lot when it is started
-- on-chain, at which point chain_lot_id is filled in.
create table if not exists public.room_items (
  id           uuid primary key default gen_random_uuid(),
  room_code    text not null references public.rooms(code) on delete cascade,
  name         text not null,
  image_url    text,
  category     text,
  sort_order   int  not null default 0,
  chain_lot_id bigint,
  created_at   timestamptz not null default now()
);
create index if not exists room_items_room_idx on public.room_items (room_code, sort_order);

-- Participants ------------------------------------------------------------
-- Who joined a room and how they want to be shown. addr is the wallet address
-- (burner or injected); one row per (room, wallet).
create table if not exists public.participants (
  room_code   text not null references public.rooms(code) on delete cascade,
  addr        text not null,
  name        text,
  avatar_seed text,
  squad       smallint,
  joined_at   timestamptz not null default now(),
  primary key (room_code, addr)
);
create index if not exists participants_room_idx on public.participants (room_code);

-- Row-Level Security ------------------------------------------------------
-- This is a public party game: the anon key ships to every phone, so anyone in
-- a room can read it and add themselves / items. We allow SELECT + INSERT +
-- UPDATE from anon, but never DELETE (no anon can wipe a room). Money is on the
-- chain and unaffected by any of these writes.
alter table public.rooms        enable row level security;
alter table public.room_items   enable row level security;
alter table public.participants enable row level security;

do $$
begin
  -- rooms
  if not exists (select 1 from pg_policies where policyname = 'rooms_read')   then
    create policy rooms_read   on public.rooms        for select using (true); end if;
  if not exists (select 1 from pg_policies where policyname = 'rooms_insert') then
    create policy rooms_insert on public.rooms        for insert with check (true); end if;
  if not exists (select 1 from pg_policies where policyname = 'rooms_update') then
    create policy rooms_update on public.rooms        for update using (true) with check (true); end if;
  -- room_items
  if not exists (select 1 from pg_policies where policyname = 'items_read')   then
    create policy items_read   on public.room_items   for select using (true); end if;
  if not exists (select 1 from pg_policies where policyname = 'items_insert') then
    create policy items_insert on public.room_items   for insert with check (true); end if;
  if not exists (select 1 from pg_policies where policyname = 'items_update') then
    create policy items_update on public.room_items   for update using (true) with check (true); end if;
  -- participants
  if not exists (select 1 from pg_policies where policyname = 'parts_read')   then
    create policy parts_read   on public.participants for select using (true); end if;
  if not exists (select 1 from pg_policies where policyname = 'parts_insert') then
    create policy parts_insert on public.participants for insert with check (true); end if;
  if not exists (select 1 from pg_policies where policyname = 'parts_update') then
    create policy parts_update on public.participants for update using (true) with check (true); end if;
end $$;
