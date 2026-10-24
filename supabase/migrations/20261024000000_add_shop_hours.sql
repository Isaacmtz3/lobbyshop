-- DRAFT ONLY — DO NOT RUN against production until reviewed and approved.
--
-- Adds an optional per-day opening-hours object to public.shops.
-- Shape: {"mon": {"closed": false, "open": "10:00", "close": "19:00"}, ...}
-- Times are local "HH:MM" (24-hour) strings; close must be after open on the
-- same day (no overnight hours).
--
-- Behavior for existing rows: the column is NULLABLE with no default, so
-- existing shops keep NULL, which the app treats as "hours not set":
-- check-in is NOT blocked and no hours are shown until the owner sets them
-- in Settings. No backfill is included on purpose.
--
-- RLS: no policy change is needed. The existing owner-update policy already
-- permits a shop owner to update their own shop row, including this column.

alter table public.shops
  add column if not exists hours jsonb;

comment on column public.shops.hours is
  'Per-day opening hours: {"mon": {"closed": false, "open": "10:00", "close": "19:00"}, ...}. NULL = hours not set (shop treated as open).';
