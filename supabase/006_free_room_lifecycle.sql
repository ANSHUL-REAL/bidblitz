-- BidBlitz — free room lifecycle: ending a room, removing a player, tracking wins
-- =========================================================================
-- A room was previously an open-ended stream of lots with no way to finish it
-- and no way to deal with someone spoiling it. This adds the missing half of
-- "multiplayer session": a room that ends with a result, and a host who can
-- remove a player.
--
-- Run after 004_free_rooms.sql and 005_free_topups.sql. Safe to re-run.
-- =========================================================================

alter table public.free_players
  add column if not exists wins   int     not null default 0,
  add column if not exists kicked boolean not null default false;

create index if not exists free_players_active_idx
  on public.free_players (room_code) where not kicked;

/*
 * End the room.
 *
 * Closes any live lot WITHOUT selling it — ending an auction must never
 * silently charge whoever happened to be leading when the host pressed stop.
 * Once closed, joins and bids are refused and the standings are final.
 */
create or replace function public.free_end_room(p_code text, p_token_hash text)
returns public.free_rooms
language plpgsql security definer set search_path = public as $$
declare
  v_room public.free_rooms;
begin
  select * into v_room from public.free_rooms where code = p_code for update;
  if not found then raise exception 'no_room'; end if;
  if v_room.host_token_hash is distinct from p_token_hash then raise exception 'not_host'; end if;

  if v_room.open_lot <> 0 then
    update public.free_lots
       set sold = true, high_bid = 0, high_player = null
     where room_code = p_code and lot_id = v_room.open_lot and sold = false;
  end if;

  update public.free_rooms
     set closed = true, open_lot = 0, updated_at = now()
   where code = p_code
  returning * into v_room;
  return v_room;
end $$;

/*
 * Remove a player.
 *
 * Marks rather than deletes: their bids stay in free_bids, so the lot history
 * a room already saw on the big screen does not silently rewrite itself.
 *
 * The subtle part is the live lot. If the removed player was leading it, the
 * lot cannot just keep their bid standing — so the leader is recomputed from
 * the best remaining bid by a player who is still in the room, and falls back
 * to no-bid if there isn't one.
 */
create or replace function public.free_kick_player(p_code text, p_token_hash text, p_player text)
returns public.free_players
language plpgsql security definer set search_path = public as $$
declare
  v_room public.free_rooms;
  v_row  public.free_players;
  v_best record;
begin
  select * into v_room from public.free_rooms where code = p_code for update;
  if not found then raise exception 'no_room'; end if;
  if v_room.host_token_hash is distinct from p_token_hash then raise exception 'not_host'; end if;

  update public.free_players
     set kicked = true
   where room_code = p_code and player_id = lower(p_player)
  returning * into v_row;
  if not found then raise exception 'no_player'; end if;

  -- Recompute the open lot's leader if it was the removed player.
  if v_room.open_lot <> 0 then
    select b.player_id, b.amount into v_best
      from public.free_bids b
      join public.free_players p
        on p.room_code = b.room_code and p.player_id = b.player_id
     where b.room_code = p_code
       and b.lot_id = v_room.open_lot
       and not p.kicked
     order by b.amount desc
     limit 1;

    update public.free_lots
       set high_player = v_best.player_id,
           high_bid    = coalesce(v_best.amount, 0)
     where room_code = p_code
       and lot_id = v_room.open_lot
       and sold = false
       and high_player = lower(p_player);
  end if;

  return v_row;
end $$;

/*
 * Settling a lot, now crediting the winner a win.
 *
 * Replaces the 004 definition. Same never-fail contract: re-selling an already
 * sold lot is a no-op, because this button gets pressed on stage, sometimes
 * twice, and it must always advance the auction.
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
      -- Every SET expression sees the OLD row, so both reads of purse are the
      -- pre-debit value. Clamped rather than allowed to go negative.
      update public.free_players
         set purse  = greatest(purse - v_lot.high_bid, 0),
             spent  = spent + least(v_lot.high_bid, purse),
             wins   = wins + 1
       where room_code = p_code and player_id = v_lot.high_player;
    end if;
  end if;

  update public.free_rooms set open_lot = 0, updated_at = now()
   where code = p_code and open_lot = p_lot;
  return v_lot;
end $$;

/*
 * Bidding, now refusing removed players and closed rooms.
 *
 * Replaces the 004 definition. The contested UPDATE is unchanged and is still
 * where the race is decided.
 */
create or replace function public.free_place_bid(
  p_code text, p_player text, p_lot int, p_amount bigint
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_player public.free_players;
  v_closed boolean;
  v_lot    public.free_lots;
begin
  if p_amount <= 0 then raise exception 'bad_amount'; end if;

  select closed into v_closed from public.free_rooms where code = p_code;
  if not found then raise exception 'no_room'; end if;
  if v_closed then raise exception 'room_closed'; end if;

  select * into v_player from public.free_players
   where room_code = p_code and player_id = p_player;
  if not found then raise exception 'not_joined'; end if;
  if v_player.kicked then raise exception 'kicked'; end if;
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

/*
 * Joining, now refusing a removed player and a closed room.
 * Replaces the 004 definition.
 */
create or replace function public.free_join(
  p_code text, p_player text, p_name text, p_avatar text, p_squad smallint, p_purse bigint
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

  -- Rejoining (a reload, a second tab) must be idempotent, never a new player.
  select * into v_row from public.free_players
   where room_code = p_code and player_id = p_player;
  if found then
    -- A removed player does not get back in by refreshing the page.
    if v_row.kicked then raise exception 'kicked'; end if;
    update public.free_players
       set name = coalesce(p_name, name), avatar_seed = coalesce(p_avatar, avatar_seed)
     where room_code = p_code and player_id = p_player
    returning * into v_row;
    return v_row;
  end if;

  -- Lock the room so two simultaneous joins cannot take the same paddle number.
  perform 1 from public.free_rooms where code = p_code for update;

  select coalesce(max(entity_id), 0) + 1 into v_entity
    from public.free_players where room_code = p_code;

  insert into public.free_players (room_code, player_id, entity_id, name, avatar_seed, squad, purse)
  values (p_code, p_player, v_entity, p_name, p_avatar, p_squad, p_purse)
  returning * into v_row;
  return v_row;
end $$;

revoke all on function
  public.free_end_room(text, text),
  public.free_kick_player(text, text, text)
from public, anon, authenticated;

grant execute on function
  public.free_end_room(text, text),
  public.free_kick_player(text, text, text)
to service_role;
