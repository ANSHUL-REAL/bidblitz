-- BidBlitz — per-lot bid cap, and a prepared item queue
-- =========================================================================
-- Two changes, both about the same thing: making a free room feel like a game
-- rather than a form.
--
-- THE CAP. Point packs let someone buy a much bigger purse, and an auction is
-- winner-take-all per lot — so a player holding 1300 points against everyone
-- else's 50 wins every single lot, and the other nineteen people stop bidding.
-- That monetises one player and kills the room they were playing in.
--
-- A per-lot cap fixes the shape without nerfing the packs: no single bid may
-- exceed max_bid, so a whale wins MORE OFTEN (they can keep contesting lot
-- after lot while others run dry) but can never be unbeatable on any one lot.
-- Someone on the base purse can always match the cap and race them for it.
-- Default is exactly the starting purse, so an unbought player can always bid
-- the maximum at least once.
--
-- THE QUEUE. Hosts previously typed each item as they went, mid-narration.
-- A prepared list turns the room into a catalogue you run through: set it up,
-- start, sell, continue to the next. free_items holds that list.
--
-- Run after 007_free_history.sql. Safe to re-run.
-- =========================================================================

alter table public.free_rooms
  add column if not exists max_bid bigint not null default 50000;  -- milli-points

comment on column public.free_rooms.max_bid is
  'Most a single bid may be, in milli-points. Caps pay-to-win: buying points '
  'lets you contest more lots, never outbid someone infinitely on one.';

create table if not exists public.free_items (
  id         uuid primary key default gen_random_uuid(),
  room_code  text not null references public.free_rooms(code) on delete cascade,
  name       text not null,
  image_url  text,
  sort_order int  not null default 0,
  -- Set when this item is actually put on the block, so a queue can show what
  -- has already run without deleting the history of it.
  lot_id     int,
  created_at timestamptz not null default now()
);

create index if not exists free_items_room_idx
  on public.free_items (room_code, sort_order, created_at);

alter table public.free_items enable row level security;
revoke all on public.free_items from anon, authenticated;

-- ---------------------------------------------------------------- the queue

create or replace function public.free_add_item(
  p_code text, p_token_hash text, p_name text, p_image text
) returns public.free_items
language plpgsql security definer set search_path = public as $$
declare
  v_room public.free_rooms;
  v_row  public.free_items;
  v_next int;
begin
  select * into v_room from public.free_rooms where code = p_code;
  if not found then raise exception 'no_room'; end if;
  if v_room.host_token_hash is distinct from p_token_hash then raise exception 'not_host'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'bad_name'; end if;

  select coalesce(max(sort_order), 0) + 1 into v_next
    from public.free_items where room_code = p_code;

  insert into public.free_items (room_code, name, image_url, sort_order)
  values (p_code, btrim(p_name), nullif(p_image, ''), v_next)
  returning * into v_row;
  return v_row;
end $$;

create or replace function public.free_remove_item(
  p_code text, p_token_hash text, p_item uuid
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_room public.free_rooms;
begin
  select * into v_room from public.free_rooms where code = p_code;
  if not found then raise exception 'no_room'; end if;
  if v_room.host_token_hash is distinct from p_token_hash then raise exception 'not_host'; end if;

  -- An item that already ran is history, not a queue entry; leave it alone.
  delete from public.free_items
   where room_code = p_code and id = p_item and lot_id is null;
  return found;
end $$;

/*
 * Put the next queued item on the block.
 *
 * One statement so "pick the next item" and "open the lot" cannot interleave —
 * two taps on Continue would otherwise both grab the same item, or grab two
 * different ones and leave a lot orphaned.
 */
create or replace function public.free_start_next(
  p_code text, p_token_hash text, p_seconds int
) returns public.free_lots
language plpgsql security definer set search_path = public as $$
declare
  v_room public.free_rooms;
  v_item public.free_items;
  v_lot  public.free_lots;
begin
  select * into v_room from public.free_rooms where code = p_code for update;
  if not found then raise exception 'no_room'; end if;
  if v_room.host_token_hash is distinct from p_token_hash then raise exception 'not_host'; end if;
  if v_room.closed then raise exception 'room_closed'; end if;
  if v_room.open_lot <> 0 then raise exception 'lot_open'; end if;
  if p_seconds < 5 or p_seconds > 300 then raise exception 'bad_duration'; end if;

  select * into v_item from public.free_items
   where room_code = p_code and lot_id is null
   order by sort_order, created_at
   limit 1
   for update skip locked;
  if not found then raise exception 'queue_empty'; end if;

  update public.free_rooms
     set lot_count = lot_count + 1, open_lot = lot_count + 1, updated_at = now()
   where code = p_code
  returning * into v_room;

  insert into public.free_lots (room_code, lot_id, name, image_url, ends_at)
  values (p_code, v_room.lot_count, v_item.name, v_item.image_url,
          now() + make_interval(secs => p_seconds))
  returning * into v_lot;

  update public.free_items set lot_id = v_room.lot_count where id = v_item.id;
  return v_lot;
end $$;

-- ------------------------------------------------------------------ the cap

/*
 * Bidding, now refusing anything over the room's per-lot cap.
 * Replaces the 006 definition; the contested UPDATE is unchanged.
 */
create or replace function public.free_place_bid(
  p_code text, p_player text, p_lot int, p_amount bigint
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

revoke all on function
  public.free_add_item(text, text, text, text),
  public.free_remove_item(text, text, uuid),
  public.free_start_next(text, text, int)
from public, anon, authenticated;

grant execute on function
  public.free_add_item(text, text, text, text),
  public.free_remove_item(text, text, uuid),
  public.free_start_next(text, text, int),
  public.free_place_bid(text, text, int, bigint)
to service_role;
