-- BidBlitz — buying points in a FREE room
-- =========================================================================
-- Players start a free room on an equal purse. This lets them buy more of it
-- with real MON, paid to the platform treasury. It is free-to-play
-- monetisation: points are a score, never a currency.
--
-- The two rules that keep it a game rather than a financial product are
-- enforced above this layer (see src/lib/topups.mjs and /api/free/topup):
--   1. points are ONE WAY and can never be converted back to MON
--   2. packs exist only in FREE rooms, which award nothing of real value
--
-- What THIS file guarantees is that a payment is credited exactly once.
--
-- Run after 004_free_rooms.sql.
-- =========================================================================

-- What a player bought, for transparency on the leaderboard. Purely additive:
-- `purse` still holds the spendable total.
alter table public.free_players
  add column if not exists bought bigint not null default 0;

/*
 * One row per settled payment.
 *
 * tx_hash is the PRIMARY KEY, and that single fact is the entire
 * anti-double-spend mechanism: replaying a hash raises a unique violation
 * inside the same transaction that would have credited the purse, so the
 * credit rolls back with it. No "have I seen this before?" read, and therefore
 * no window between the check and the write for two concurrent claims of the
 * same payment to both succeed.
 */
create table if not exists public.free_topups (
  tx_hash    text primary key,
  room_code  text   not null references public.free_rooms(code) on delete cascade,
  player_id  text   not null,
  payer      text,                      -- the wallet that actually paid
  amount_wei numeric(78,0) not null,    -- real MON, kept for reconciliation
  points     bigint not null,           -- milli-points credited
  created_at timestamptz not null default now()
);

create index if not exists free_topups_room_idx   on public.free_topups (room_code, created_at desc);
create index if not exists free_topups_player_idx on public.free_topups (room_code, player_id);

alter table public.free_topups enable row level security;
revoke all on public.free_topups from anon, authenticated;

/*
 * Credit a verified payment.
 *
 * By the time this is called the API has already checked the chain: the
 * transaction is mined, succeeded, went to the treasury, carries the memo
 * binding it to this exact (room, player), and paid a pack price exactly. This
 * function's only job is to make "record it" and "credit it" one atomic step.
 */
create or replace function public.free_credit_topup(
  p_code text, p_player text, p_tx text, p_payer text, p_wei numeric, p_points bigint
) returns public.free_players
language plpgsql security definer set search_path = public as $$
declare
  v_row public.free_players;
begin
  if p_points <= 0 then raise exception 'bad_points'; end if;

  -- Raises unique_violation on a replay, which aborts the whole function and
  -- leaves the purse untouched. Deliberately not guarded by an IF NOT EXISTS.
  insert into public.free_topups (tx_hash, room_code, player_id, payer, amount_wei, points)
  values (lower(p_tx), p_code, p_player, lower(p_payer), p_wei, p_points);

  update public.free_players
     set purse  = purse  + p_points,
         bought = bought + p_points
   where room_code = p_code and player_id = p_player
  returning * into v_row;
  if not found then raise exception 'not_joined'; end if;

  return v_row;
end $$;

revoke all on function public.free_credit_topup(text, text, text, text, numeric, bigint)
  from public, anon, authenticated;

-- Postgres grants EXECUTE on a new function to PUBLIC and nothing else, so the
-- revoke above takes it from service_role too. Give it back explicitly.
grant execute on function public.free_credit_topup(text, text, text, text, numeric, bigint)
  to service_role;
