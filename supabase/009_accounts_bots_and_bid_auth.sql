-- BidBlitz — account-owned rooms, opt-in bots, and authenticated bids
-- =========================================================================
-- Run after 008_free_queue_and_cap.sql. Safe to re-run.
--
-- 1. BID AUTHENTICATION (a real hole, not a hardening nicety)
--
--    /api/free/state publishes every player's id so the leaderboard, race track
--    and avatars can render. /api/free/bid then accepted that same id as PROOF
--    of who was bidding. Both halves are individually reasonable and together
--    they mean anyone in the room can read a rival's id off the wire and bid as
--    them — burning their purse, or handing themselves a lot.
--
--    Fixed the same way the host is: the browser keeps a secret, only its hash
--    is stored, and a bid must carry the secret. Legacy rows with a NULL hash
--    are still accepted so a room that is live right now does not break
--    mid-auction; everyone who joins from now on is protected.
--
-- 2. ACCOUNT-OWNED ROOMS
--
--    free_players.user_id already recorded rooms someone PLAYED. A host is not
--    a player, so rooms they RAN were missing from their history entirely.
--
-- 3. OPT-IN BOTS
--
--    Nothing ever added bots by itself and nothing will. This just gives a host
--    the option, and marks the players it creates so the room can be honest
--    about which bidders are not people.
-- =========================================================================

alter table public.free_rooms
  add column if not exists host_user_id uuid references auth.users(id) on delete set null;

create index if not exists free_rooms_host_idx
  on public.free_rooms (host_user_id, created_at desc) where host_user_id is not null;

alter table public.free_players
  add column if not exists is_bot      boolean not null default false,
  add column if not exists secret_hash text;

-- ------------------------------------------------------- joining, with a secret

create or replace function public.free_join(
  p_code text, p_player text, p_name text, p_avatar text, p_squad smallint,
  p_purse bigint, p_user uuid default null, p_secret text default null
) returns public.free_players
language plpgsql security definer set search_path = public as $$
declare
  v_row    public.free_players;
  v_room   public.free_rooms;
  v_entity int;
begin
  select * into v_room from public.free_rooms where code = p_code;
  if not found then raise exception 'no_room'; end if;
  if v_room.closed then raise exception 'room_closed'; end if;

  select * into v_row from public.free_players
   where room_code = p_code and player_id = p_player;
  if found then
    if v_row.kicked then raise exception 'kicked'; end if;
    -- Rejoining proves nothing on its own, so the secret is only accepted while
    -- the row still has none. Otherwise anyone who read this id off the state
    -- payload could re-register it with a secret of their own and take it over.
    update public.free_players
       set name        = coalesce(p_name, name),
           avatar_seed = coalesce(p_avatar, avatar_seed),
           user_id     = coalesce(user_id, p_user),
           secret_hash = coalesce(secret_hash, p_secret)
     where room_code = p_code and player_id = p_player
    returning * into v_row;
    return v_row;
  end if;

  perform 1 from public.free_rooms where code = p_code for update;

  select coalesce(max(entity_id), 0) + 1 into v_entity
    from public.free_players where room_code = p_code;

  insert into public.free_players
    (room_code, player_id, entity_id, name, avatar_seed, squad, purse, user_id, secret_hash)
  values (p_code, p_player, v_entity, p_name, p_avatar, p_squad, p_purse, p_user, p_secret)
  returning * into v_row;
  return v_row;
end $$;

-- --------------------------------------------------------- bidding, authenticated

create or replace function public.free_place_bid(
  p_code text, p_player text, p_lot int, p_amount bigint, p_secret text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_player public.free_players;
  v_room   public.free_rooms;
  v_lot    public.free_lots;
begin
  if p_amount <= 0 then raise exception 'bad_amount'; end if;

  select * into v_room from public.free_rooms where code = p_code;
  if not found then raise exception 'no_room'; end if;
  if v_room.closed then raise exception 'room_closed'; end if;
  if p_amount > v_room.max_bid then raise exception 'over_cap'; end if;

  select * into v_player from public.free_players
   where room_code = p_code and player_id = p_player;
  if not found then raise exception 'not_joined'; end if;
  if v_player.kicked then raise exception 'kicked'; end if;

  -- NULL hash = joined before this migration. Those stay playable rather than
  -- being locked out of a room that is running right now.
  if v_player.secret_hash is not null
     and v_player.secret_hash is distinct from p_secret then
    raise exception 'bad_secret';
  end if;

  if p_amount > v_player.purse then raise exception 'exceeds_purse'; end if;

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

-- ------------------------------------------------------------------- bots

/*
 * Add bots, only because the host asked.
 *
 * They are ordinary players with is_bot set — same purse, same cap, same rules
 * — so nothing downstream needs a special case, and the room can label them
 * honestly rather than passing them off as people.
 */
create or replace function public.free_add_bots(
  p_code text, p_token_hash text, p_count int, p_purse bigint
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_room  public.free_rooms;
  v_names text[] := array['Ravi','Meena','Arjun','Kavya','Dev','Riya','Sameer','Tara'];
  v_made  int := 0;
  v_entity int;
  v_id    text;
  i       int;
begin
  select * into v_room from public.free_rooms where code = p_code for update;
  if not found then raise exception 'no_room'; end if;
  if v_room.host_token_hash is distinct from p_token_hash then raise exception 'not_host'; end if;
  if v_room.closed then raise exception 'room_closed'; end if;
  if p_count < 1 or p_count > 8 then raise exception 'bad_count'; end if;

  select coalesce(max(entity_id), 0) into v_entity
    from public.free_players where room_code = p_code;

  for i in 1..p_count loop
    -- Address-SHAPED like every other player id, so avatars and the race track
    -- need no special case. Not a wallet; nothing here touches a chain.
    v_id := '0x' || encode(gen_random_bytes(20), 'hex');
    v_entity := v_entity + 1;
    -- A bot's credential IS the host's token hash, so only the host console can
    -- make one bid. Left NULL, a bot would be drivable by any player who read
    -- its id out of the state payload — the same hole this migration closes for
    -- real players.
    insert into public.free_players
      (room_code, player_id, entity_id, name, avatar_seed, purse, is_bot, secret_hash)
    values (
      p_code, v_id, v_entity,
      v_names[1 + ((v_entity - 1) % array_length(v_names, 1))],
      v_id, p_purse, true, p_token_hash
    );
    v_made := v_made + 1;
  end loop;

  return v_made;
end $$;

/* Remove every bot in one go, for a host who changes their mind. */
create or replace function public.free_clear_bots(p_code text, p_token_hash text)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_room public.free_rooms;
  v_n    int;
begin
  select * into v_room from public.free_rooms where code = p_code for update;
  if not found then raise exception 'no_room'; end if;
  if v_room.host_token_hash is distinct from p_token_hash then raise exception 'not_host'; end if;

  -- Marked rather than deleted, same as a kicked player: their bids stay in the
  -- ledger so the history the room already watched does not rewrite itself.
  update public.free_players set kicked = true
   where room_code = p_code and is_bot and not kicked;
  get diagnostics v_n = row_count;

  -- A bot that was leading the open lot cannot keep that lot hostage.
  if v_room.open_lot <> 0 then
    update public.free_lots l
       set high_player = null, high_bid = 0
     where l.room_code = p_code and l.lot_id = v_room.open_lot and l.sold = false
       and exists (
         select 1 from public.free_players p
          where p.room_code = p_code and p.player_id = l.high_player and p.is_bot
       );
  end if;

  return v_n;
end $$;

-- ------------------------------------------------- history, per ACCOUNT not room

/*
 * Everything one account has to do with, played OR hosted.
 *
 * Hosting was invisible here before: user_id lives on free_players and a host
 * is not a player, so the rooms someone actually RAN never appeared in their
 * own history.
 */
create or replace function public.free_history(p_user uuid, p_limit int default 50)
returns table (
  code text, title text, played_at timestamptz, closed boolean,
  wins int, spent bigint, purse bigint, bought bigint,
  lots int, players int, hosted boolean
)
language sql security definer set search_path = public as $$
  with mine as (
    select r.code, r.title, p.joined_at as at, r.closed,
           p.wins, p.spent, p.purse, p.bought, r.lot_count, false as hosted
      from public.free_players p
      join public.free_rooms   r on r.code = p.room_code
     where p.user_id = p_user and not p.kicked
    union all
    select r.code, r.title, r.created_at, r.closed,
           0, 0::bigint, 0::bigint, 0::bigint, r.lot_count, true
      from public.free_rooms r
     where r.host_user_id = p_user
       -- A host who also joined their own room appears once, as the host.
       and not exists (
         select 1 from public.free_players p
          where p.room_code = r.code and p.user_id = p_user and not p.kicked
       )
  )
  select m.code, m.title, m.at, m.closed, m.wins, m.spent, m.purse, m.bought,
         m.lot_count,
         (select count(*)::int from public.free_players q
           where q.room_code = m.code and not q.kicked),
         m.hosted
    from mine m
   order by m.at desc
   limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

revoke all on function
  public.free_join(text, text, text, text, smallint, bigint, uuid, text),
  public.free_place_bid(text, text, int, bigint, text),
  public.free_add_bots(text, text, int, bigint),
  public.free_clear_bots(text, text),
  public.free_history(uuid, int)
from public, anon, authenticated;

grant execute on function
  public.free_join(text, text, text, text, smallint, bigint, uuid, text),
  public.free_place_bid(text, text, int, bigint, text),
  public.free_add_bots(text, text, int, bigint),
  public.free_clear_bots(text, text),
  public.free_history(uuid, int)
to service_role;

-- PostgREST refuses to choose between two candidate overloads (PGRST203), so
-- the previous signatures must go or every join and bid starts failing.
drop function if exists public.free_join(text, text, text, text, smallint, bigint, uuid);
drop function if exists public.free_place_bid(text, text, int, bigint);
