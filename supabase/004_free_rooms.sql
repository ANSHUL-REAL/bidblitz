-- BidBlitz — FREE rooms (off-chain, for fun)
-- =========================================================================
-- A free room is a real multiplayer auction that touches no chain and costs
-- nobody anything. That is the whole point: on Monad even a play-money bid is
-- a transaction, so "free" and "on-chain" cannot both be true. Someone would
-- have to pay the gas, and BidBlitz no longer pays for anyone.
--
-- So this is the authoritative store for a free room the way the contract is
-- for a paid one: purses, bids, who is leading, what sold. It holds no value
-- and can be dropped without anybody losing money.
--
-- SECURITY, and the difference from the older tables in schema.sql: nothing
-- here is writable by anon. RLS is on with NO policies, which denies everything
-- by default; every read and write goes through /api/free/* using the service
-- role key, which bypasses RLS. The browser gets an anon key that can do
-- literally nothing to these tables.
--
-- That matters more here than it looks. There is no wallet in a free room, so
-- there is no signature to check — if the browser could write directly, any
-- player could set their own purse, sell a lot to themselves, or bid as
-- somebody else.
--
-- Run once: Supabase Dashboard -> SQL Editor -> paste -> Run.
-- =========================================================================

-- Amounts ------------------------------------------------------------------
-- Stored as bigint MILLI-units: 1 point = 1000. Bids step in halves, so three
-- decimal places is ample, and every value stays far inside a JS safe integer
-- (PostgREST renders numeric as a JSON number, which would silently lose
-- precision at wei scale). The API converts to 18-decimal wei on the way out
-- purely so the existing bidding UI can render free and paid rooms with the
-- same components.

create table if not exists public.free_rooms (
  code            text primary key,             -- 4 chars, own namespace (/f/<code>)
  title           text not null,
  mode            smallint not null default 0,  -- 0 = solo auction, 1 = fantasy squads
  categories      jsonb   not null default '[]'::jsonb,
  -- sha-256 of a token the host's browser generated and kept. A free room has
  -- no wallet to prove ownership with, so this is the credential; only the hash
  -- is stored, so a database leak does not hand anyone a room.
  host_token_hash text not null,
  host_name       text,
  lot_count       int  not null default 0,
  open_lot        int  not null default 0,      -- 0 = nothing live
  closed          boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.free_lots (
  room_code   text not null references public.free_rooms(code) on delete cascade,
  lot_id      int  not null,
  name        text not null,
  image_url   text,
  ends_at     timestamptz not null,
  high_bid    bigint not null default 0,
  high_player text,
  sold        boolean not null default false,
  created_at  timestamptz not null default now(),
  primary key (room_code, lot_id)
);

create table if not exists public.free_players (
  room_code   text not null references public.free_rooms(code) on delete cascade,
  -- Address-SHAPED (0x + 40 hex) but emphatically not a wallet: no key exists
  -- and it never touches a chain. It looks like an address so the leaderboard,
  -- race track and avatars — all written against addresses — work unchanged.
  player_id   text not null,
  entity_id   int  not null,
  name        text,
  avatar_seed text,
  squad       smallint,
  purse       bigint not null,
  spent       bigint not null default 0,
  joined_at   timestamptz not null default now(),
  primary key (room_code, player_id)
);

create table if not exists public.free_bids (
  id         bigserial primary key,
  room_code  text   not null,
  lot_id     int    not null,
  player_id  text   not null,
  amount     bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists free_bids_lot_idx     on public.free_bids (room_code, lot_id, amount desc);
create index if not exists free_players_room_idx on public.free_players (room_code);
create index if not exists free_rooms_recent_idx on public.free_rooms (created_at desc);

-- Row-Level Security -------------------------------------------------------
-- Enabled with NO policies: anon and authenticated can do nothing at all. The
-- service role bypasses RLS, so /api/free/* is the only way in. This is the
-- pattern the older tables in schema.sql should move to as well — they
-- currently allow anon INSERT/UPDATE with `using (true)`.
alter table public.free_rooms   enable row level security;
alter table public.free_lots    enable row level security;
alter table public.free_players enable row level security;
alter table public.free_bids    enable row level security;

revoke all on public.free_rooms, public.free_lots, public.free_players, public.free_bids from anon, authenticated;

-- Atomic operations ---------------------------------------------------------
-- These are functions rather than client-side read-then-write because a free
-- room is a race by design: twenty phones tap BID inside the same second. Each
-- one below either serializes on a row lock or leans on a single conditional
-- UPDATE, so "highest bid wins" is decided by Postgres, not by whichever
-- lambda happened to read first.
--
-- SECURITY DEFINER because the free_* tables deny everyone; EXECUTE is revoked
-- from anon/authenticated so only the service role (i.e. /api/free/*) can call
-- them. search_path is pinned so a definer function can't be hijacked by a
-- caller-controlled schema.

create or replace function public.free_join(
  p_code text, p_player text, p_name text, p_avatar text, p_squad smallint, p_purse bigint
) returns public.free_players
language plpgsql security definer set search_path = public as $$
declare
  v_row public.free_players;
  v_entity int;
begin
  -- Rejoining (a reload, a second tab) must be idempotent, never a new player.
  select * into v_row from public.free_players
   where room_code = p_code and player_id = p_player;
  if found then
    update public.free_players
       set name = coalesce(p_name, name), avatar_seed = coalesce(p_avatar, avatar_seed)
     where room_code = p_code and player_id = p_player
    returning * into v_row;
    return v_row;
  end if;

  -- Lock the room so two simultaneous joins cannot take the same paddle number.
  perform 1 from public.free_rooms where code = p_code for update;
  if not found then raise exception 'no_room'; end if;

  select coalesce(max(entity_id), 0) + 1 into v_entity
    from public.free_players where room_code = p_code;

  insert into public.free_players (room_code, player_id, entity_id, name, avatar_seed, squad, purse)
  values (p_code, p_player, v_entity, p_name, p_avatar, p_squad, p_purse)
  returning * into v_row;
  return v_row;
end $$;

create or replace function public.free_start_lot(
  p_code text, p_token_hash text, p_name text, p_image text, p_seconds int
) returns public.free_lots
language plpgsql security definer set search_path = public as $$
declare
  v_room public.free_rooms;
  v_lot  public.free_lots;
begin
  select * into v_room from public.free_rooms where code = p_code for update;
  if not found then raise exception 'no_room'; end if;
  if v_room.host_token_hash is distinct from p_token_hash then raise exception 'not_host'; end if;
  if v_room.closed then raise exception 'room_closed'; end if;
  if v_room.open_lot <> 0 then raise exception 'lot_open'; end if;
  if p_seconds < 5 or p_seconds > 300 then raise exception 'bad_duration'; end if;

  update public.free_rooms
     set lot_count = lot_count + 1, open_lot = lot_count + 1, updated_at = now()
   where code = p_code
  returning * into v_room;

  insert into public.free_lots (room_code, lot_id, name, image_url, ends_at)
  values (p_code, v_room.lot_count, p_name, nullif(p_image, ''),
          now() + make_interval(secs => p_seconds))
  returning * into v_lot;
  return v_lot;
end $$;

/*
 * Settling a lot. Mirrors the contract's sellLot: it must always advance the
 * auction, so re-selling an already-sold lot is a no-op rather than an error —
 * this button gets pressed on stage, sometimes twice.
 */
create or replace function public.free_sell_lot(p_code text, p_token_hash text, p_lot int)
returns public.free_lots
language plpgsql security definer set search_path = public as $$
declare
  v_room public.free_rooms;
  v_lot  public.free_lots;
begin
  select * into v_room from public.free_rooms where code = p_code for update;
  if not found then raise exception 'no_room'; end if;
  if v_room.host_token_hash is distinct from p_token_hash then raise exception 'not_host'; end if;

  select * into v_lot from public.free_lots
   where room_code = p_code and lot_id = p_lot for update;
  if not found then raise exception 'no_lot'; end if;

  if not v_lot.sold then
    update public.free_lots set sold = true
     where room_code = p_code and lot_id = p_lot
    returning * into v_lot;

    if v_lot.high_player is not null then
      -- Every SET expression sees the OLD row, so both reads of purse below are
      -- the pre-debit value. Clamped rather than allowed to go negative.
      update public.free_players
         set purse = greatest(purse - v_lot.high_bid, 0),
             spent = spent + least(v_lot.high_bid, purse)
       where room_code = p_code and player_id = v_lot.high_player;
    end if;
  end if;

  update public.free_rooms set open_lot = 0, updated_at = now()
   where code = p_code and open_lot = p_lot;
  return v_lot;
end $$;

/* Abandon the open lot without a sale. Nobody is charged. */
create or replace function public.free_close_lot(p_code text, p_token_hash text)
returns public.free_rooms
language plpgsql security definer set search_path = public as $$
declare
  v_room public.free_rooms;
begin
  select * into v_room from public.free_rooms where code = p_code for update;
  if not found then raise exception 'no_room'; end if;
  if v_room.host_token_hash is distinct from p_token_hash then raise exception 'not_host'; end if;

  if v_room.open_lot <> 0 then
    -- Clear the leader as well as marking it done. Leaving the high bid on a
    -- cancelled lot would render as "SOLD FOR 12.00" on the big screen when in
    -- fact nobody won it and nobody was charged.
    update public.free_lots
       set sold = true, high_bid = 0, high_player = null
     where room_code = p_code and lot_id = v_room.open_lot and sold = false;
    update public.free_rooms set open_lot = 0, updated_at = now()
     where code = p_code
    returning * into v_room;
  end if;
  return v_room;
end $$;

/*
 * One bid.
 *
 * The whole contest lives in the single conditional UPDATE: concurrent bidders
 * serialize on the lot's row lock, and the loser's `high_bid < p_amount` is
 * false by the time it runs, so it updates nothing and is rejected. There is no
 * read-then-write window for two phones to both win.
 */
create or replace function public.free_place_bid(
  p_code text, p_player text, p_lot int, p_amount bigint
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_purse bigint;
  v_lot   public.free_lots;
begin
  if p_amount <= 0 then raise exception 'bad_amount'; end if;

  select purse into v_purse from public.free_players
   where room_code = p_code and player_id = p_player;
  if not found then raise exception 'not_joined'; end if;
  if p_amount > v_purse then raise exception 'exceeds_purse'; end if;

  update public.free_lots
     set high_bid = p_amount, high_player = p_player
   where room_code = p_code
     and lot_id = p_lot
     and sold = false
     and ends_at > now()
     and high_bid < p_amount
  returning * into v_lot;
  if not found then raise exception 'bid_rejected'; end if;

  insert into public.free_bids (room_code, lot_id, player_id, amount)
  values (p_code, p_lot, p_player, p_amount);

  return jsonb_build_object(
    'lotId', v_lot.lot_id, 'highBid', v_lot.high_bid, 'leader', v_lot.high_player
  );
end $$;

-- Postgres grants EXECUTE on a new function to PUBLIC and nothing else, so
-- revoking PUBLIC takes it away from service_role too. Grant it back explicitly
-- or every /api/free/* call fails with "permission denied for function".
revoke all on function
  public.free_join(text, text, text, text, smallint, bigint),
  public.free_start_lot(text, text, text, text, int),
  public.free_sell_lot(text, text, int),
  public.free_close_lot(text, text),
  public.free_place_bid(text, text, int, bigint)
from public, anon, authenticated;

grant execute on function
  public.free_join(text, text, text, text, smallint, bigint),
  public.free_start_lot(text, text, text, text, int),
  public.free_sell_lot(text, text, int),
  public.free_close_lot(text, text),
  public.free_place_bid(text, text, int, bigint)
to service_role;
