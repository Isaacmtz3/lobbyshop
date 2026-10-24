-- Round 3: live per-shop services & prices + guest email for notifications.
--
-- The shop menu used to be a hardcoded list in the app. Now it lives in
-- this table: the owner edits it in Dashboard -> Services, and the shop
-- page, kiosk, and check-in pickers all read it from the database, so a
-- price change shows up immediately with no redeploy.

create table if not exists public.shop_services (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null,
  price_cents integer not null check (price_cents >= 0),
  duration_min integer check (duration_min is null or duration_min > 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.shop_services enable row level security;

-- Public read, same pattern as shops/barbers: clients see the live menu.
drop policy if exists "shop_services public read" on public.shop_services;
create policy "shop_services public read" on public.shop_services
  for select using (true);

-- Owner or shop staff manage the menu. The owner check goes through shops
-- directly because older shops may not have a shop_staff row for the owner.
drop policy if exists "shop_services staff manage" on public.shop_services;
create policy "shop_services staff manage" on public.shop_services
  for all
  using (
    private.is_shop_staff(shop_id)
    or exists (
      select 1 from public.shops s
      where s.id = shop_services.shop_id and s.owner_id = auth.uid()
    )
  )
  with check (
    private.is_shop_staff(shop_id)
    or exists (
      select 1 from public.shops s
      where s.id = shop_services.shop_id and s.owner_id = auth.uid()
    )
  );

-- Optional email on walk-in rows so "you're called" emails can reach guests
-- who share one. Signed-in clients resolve through auth.users instead, so
-- this column stays null for them. (The anonymous walk-in INSERT policy
-- keys on client_profile_id / checked_in_by only, so this column is safe.)
alter table public.queue add column if not exists email text;

-- Seed Platinum Kutz's real menu. Idempotent: only runs when the shop has
-- no services yet, so re-applying this file never duplicates rows.
insert into public.shop_services (shop_id, name, price_cents, duration_min, sort_order)
select s.id, v.name, v.price_cents, v.duration_min, v.sort_order
from public.shops s
cross join (values
  ('Regular Haircut', 3000, 30, 1),
  ('Kids Kutz', 2500, 30, 2),
  ('To The Skin Haircut', 3500, 40, 3),
  ('Haircut & Beard Work', 3500, 45, 4),
  ('Hot Towel Shave', 3000, 30, 5),
  ('Premium Hair Cut Experience', 5000, 60, 6)
) as v(name, price_cents, duration_min, sort_order)
where s.slug = 'platinum-kutz'
  and not exists (select 1 from public.shop_services ss where ss.shop_id = s.id);

-- Seed Isaac as a barber for Platinum Kutz (same guard; removable in
-- Dashboard -> Barbers). This is what flips the shop card off "0 barbers".
insert into public.barbers (shop_id, name)
select s.id, 'Isaac'
from public.shops s
where s.slug = 'platinum-kutz'
  and not exists (select 1 from public.barbers b where b.shop_id = s.id);
