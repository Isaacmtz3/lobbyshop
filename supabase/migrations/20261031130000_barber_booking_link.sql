-- Barber booking links (APPLIED to live 2026-11-01)
-- Adds an optional booking/website link per barber. Owners set it in the
-- dashboard; clients can tap a barber on the public shop page to open it.
-- Additive only: no existing data or policies change.
ALTER TABLE public.barbers ADD COLUMN IF NOT EXISTS booking_link text;
