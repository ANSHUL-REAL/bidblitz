-- Delta: host-configurable MON distribution per joiner.
-- Run in Supabase SQL Editor if you set up the DB before this column existed.
alter table public.rooms add column if not exists fund_amount numeric;
