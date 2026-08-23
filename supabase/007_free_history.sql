-- BidBlitz — saved history for players who log in
-- =========================================================================
-- Joining stays anonymous. A free room asks for a name and a face, and that
-- has to keep working — the whole format exists to avoid friction at the door.
--
-- But an anonymous player is an id in localStorage, which means clearing the
-- browser, switching to a laptop, or joining from a different phone all lose
-- everything they ever won. Logging in attaches the same player rows to an
-- account so the history survives the device.
--
-- Deliberately OPTIONAL and retroactive-per-room: user_id is stamped at join
-- time when the client sends a session, and stays NULL otherwise. Nothing about
-- the room's rules changes either way.
--
-- Run after 006_free_room_lifecycle.sql. Safe to re-run.
-- =========================================================================

alter table public.free_players
  add column if not exists user_id uuid references auth.users(id) on delete set null;

-- The history query is "everything this account played", so it is the lookup
-- that needs to be fast, not room_code.
create index if not exists free_players_user_idx
  on public.free_players (user_id, joined_at desc) where user_id is not null;

/*
 * Join, now optionally attaching an account.
 *
 * Replaces the 006 definition. p_user is the caller's verified auth.users id or
 * NULL — the API resolves it from a session token and never accepts a raw id
 * from the browser, because a client-supplied user id is just a claim.
 *
 * On rejoin the account is attached if it was not already, so someone who plays
 * a few lots and THEN logs in keeps that room in their history rather than
 * starting from the next one.
 */
create or replace function public.free_join(
  p_code text, p_player text, p_name text, p_avatar text, p_squad smallint,
  p_purse bigint, p_user uuid default null
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
       set name        = coalesce(p_name, name),
           avatar_seed = coalesce(p_avatar, avatar_seed),
           user_id     = coalesce(user_id, p_user)
     where room_code = p_code and player_id = p_player
    returning * into v_row;
    return v_row;
  end if;

  -- Lock the room so two simultaneous joins cannot take the same paddle number.
  perform 1 from public.free_rooms where code = p_code for update;

  select coalesce(max(entity_id), 0) + 1 into v_entity
    from public.free_players where room_code = p_code;

  insert into public.free_players
    (room_code, player_id, entity_id, name, avatar_seed, squad, purse, user_id)
  values (p_code, p_player, v_entity, p_name, p_avatar, p_squad, p_purse, p_user)
  returning * into v_row;
  return v_row;
end $$;

/*
 * Everything one account has played, newest first.
 *
 * A function rather than a view so the account id is a parameter the API
 * supplies from a verified session — there is no path where a caller names
 * somebody else's user_id and reads their history.
 */
create or replace function public.free_history(p_user uuid, p_limit int default 50)
returns table (
  code       text,
  title      text,
  played_at  timestamptz,
  closed     boolean,
  wins       int,
  spent      bigint,
  purse      bigint,
  bought     bigint,
  lots       int,
  players    int
)
language sql security definer set search_path = public as $$
  select r.code,
         r.title,
         p.joined_at,
         r.closed,
         p.wins,
         p.spent,
         p.purse,
         p.bought,
         r.lot_count,
         (select count(*)::int from public.free_players q
           where q.room_code = r.code and not q.kicked)
    from public.free_players p
    join public.free_rooms   r on r.code = p.room_code
   where p.user_id = p_user
     and not p.kicked
   order by p.joined_at desc
   limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

revoke all on function
  public.free_join(text, text, text, text, smallint, bigint, uuid),
  public.free_history(uuid, int)
from public, anon, authenticated;

grant execute on function
  public.free_join(text, text, text, text, smallint, bigint, uuid),
  public.free_history(uuid, int)
to service_role;

-- The 6-argument overload from 006 would otherwise sit alongside the new
-- 7-argument one, and PostgREST refuses to choose between two candidates
-- (PGRST203) — every join would start failing.
drop function if exists public.free_join(text, text, text, text, smallint, bigint);
