-- Lobbyshop loyalty v1 (2026-10-28 spec). DRAFT — NOT APPLIED TO LIVE.
-- Apply only with Isaac's approval, after the Oct 26 isolation migrations.
--
-- Rules this schema enforces:
--   * Shop-wide toggle, default OFF. Points are per shop, never pooled,
--     and never expire (there is no expiry column on purpose).
--   * Earning is per COMPLETED/served visit only. No points for check-in,
--     cancel, or no-show. Owner-added walk-ins count only when the queue
--     row carries a client_profile_id — a name-only walk-in has no account
--     to credit, so there is nothing to attach points to.
--   * One visit credit per queue entry (unique index on queue_entry_id),
--     so re-marking a visit complete cannot double-credit.
--   * Welcome bonus: separate toggle + owner-set amount, only for clients
--     whose FIRST completed visit at that shop happens while the toggle
--     is on (checked against queue history, not just the ledger, so it
--     is never retroactive). Credited on that first completed visit,
--     never on bare signup, so fake accounts cannot farm it.
--   * Redemption v1: client taps Redeem -> PENDING row, no points move.
--     The barber/owner confirms at the desk -> the RPC checks the balance
--     and deducts points in the same transaction, writing a ledger row.
--     No automatic discounts or payments anywhere.
--   * Tenant isolation follows the Oct 26 pattern: every row is scoped by
--     shop_id, clients read only their own ledger/redemptions, shops read
--     only their own clients' rows (private.is_shop_staff), and the
--     platform admin (private.is_admin) keeps the Command Center
--     exception. Point-moving writes go through security-definer RPCs
--     below, not through open insert/update policies.
--
-- Assumes the base schema already defines private.is_shop_staff(uuid)
-- and private.is_admin() (used by the Oct 24/26 migrations).

-- ---------------------------------------------------------------- settings
create table if not exists public.loyalty_settings (
  shop_id uuid primary key references public.shops(id) on delete cascade,
  enabled boolean not null default false,
  points_per_visit integer not null default 10 check (points_per_visit between 1 and 100),
  welcome_bonus_enabled boolean not null default false,
  welcome_bonus_points integer not null default 0 check (welcome_bonus_points between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- rewards
create table if not exists public.loyalty_rewards (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  points_cost integer not null check (points_cost >= 1),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists loyalty_rewards_shop_idx on public.loyalty_rewards (shop_id, sort_order, points_cost);

-- -------------------------------------------------------------- favorites
create table if not exists public.loyalty_favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, shop_id)
);
create index if not exists loyalty_favorites_shop_idx on public.loyalty_favorites (shop_id);

-- ----------------------------------------------------------------- ledger
create table if not exists public.loyalty_ledger (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  client_profile_id uuid not null references public.profiles(id) on delete cascade,
  queue_entry_id uuid references public.queue(id) on delete set null,
  reward_id uuid references public.loyalty_rewards(id) on delete set null,
  redemption_id uuid references public.loyalty_redemptions(id) on delete set null,
  kind text not null check (kind in ('visit', 'welcome_bonus', 'redeem')),
  points integer not null check (points <> 0),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists loyalty_ledger_client_idx on public.loyalty_ledger (shop_id, client_profile_id, created_at desc);
-- Idempotency: one visit credit per queue entry, full stop.
create unique index if not exists loyalty_ledger_queue_entry_uidx
  on public.loyalty_ledger (queue_entry_id) where queue_entry_id is not null;
-- Idempotency: one welcome bonus per client per shop, full stop.
create unique index if not exists loyalty_ledger_welcome_uidx
  on public.loyalty_ledger (shop_id, client_profile_id) where kind = 'welcome_bonus';
-- A redemption may only ever deduct once.
create unique index if not exists loyalty_ledger_redemption_uidx
  on public.loyalty_ledger (redemption_id) where redemption_id is not null;

-- ------------------------------------------------------------- redemptions
create table if not exists public.loyalty_redemptions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  client_profile_id uuid not null references public.profiles(id) on delete cascade,
  reward_id uuid references public.loyalty_rewards(id) on delete set null,
  reward_name text not null,
  points_cost integer not null check (points_cost >= 1),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  cancelled_at timestamptz
);
create index if not exists loyalty_redemptions_shop_idx
  on public.loyalty_redemptions (shop_id, status, created_at desc);
create index if not exists loyalty_redemptions_client_idx
  on public.loyalty_redemptions (client_profile_id, created_at desc);
-- One pending request per client per reward: double-tapping Redeem cannot
-- queue the same reward twice.
create unique index if not exists loyalty_redemptions_pending_uidx
  on public.loyalty_redemptions (shop_id, client_profile_id, reward_id)
  where status = 'pending' and reward_id is not null;

-- --------------------------------------------------------------------- RLS
alter table public.loyalty_settings enable row level security;
alter table public.loyalty_rewards enable row level security;
alter table public.loyalty_favorites enable row level security;
alter table public.loyalty_ledger enable row level security;
alter table public.loyalty_redemptions enable row level security;

-- Settings + rewards are the shop's public program: anyone may read them
-- (the client board shows a shop's reward list), only that shop's staff
-- or the platform admin may change them.
drop policy if exists "loyalty settings read" on public.loyalty_settings;
create policy "loyalty settings read" on public.loyalty_settings
  for select to anon, authenticated using (true);
drop policy if exists "loyalty settings staff manage" on public.loyalty_settings;
create policy "loyalty settings staff manage" on public.loyalty_settings
  for all to authenticated
  using (private.is_shop_staff(shop_id) or private.is_admin())
  with check (private.is_shop_staff(shop_id) or private.is_admin());

drop policy if exists "loyalty rewards read" on public.loyalty_rewards;
create policy "loyalty rewards read" on public.loyalty_rewards
  for select to anon, authenticated
  using (active = true or private.is_shop_staff(shop_id) or private.is_admin());
drop policy if exists "loyalty rewards staff manage" on public.loyalty_rewards;
create policy "loyalty rewards staff manage" on public.loyalty_rewards
  for all to authenticated
  using (private.is_shop_staff(shop_id) or private.is_admin())
  with check (private.is_shop_staff(shop_id) or private.is_admin());

-- Favorites are per-user private: only the owner of the favorite (and the
-- platform admin) may even read them. Shops never see who favorited them.
drop policy if exists "loyalty favorites own" on public.loyalty_favorites;
create policy "loyalty favorites own" on public.loyalty_favorites
  for all to authenticated
  using (user_id = auth.uid() or private.is_admin())
  with check (user_id = auth.uid());

-- Ledger / redemptions: a client reads only their own rows; a shop reads
-- only its own clients' rows; the platform admin reads all. There is NO
-- direct insert/update policy on either table — points only move through
-- the RPCs below, which run as security definer and re-check everything.
drop policy if exists "loyalty ledger read" on public.loyalty_ledger;
create policy "loyalty ledger read" on public.loyalty_ledger
  for select to authenticated
  using (
    client_profile_id = auth.uid()
    or private.is_shop_staff(shop_id)
    or private.is_admin()
  );
drop policy if exists "loyalty redemptions read" on public.loyalty_redemptions;
create policy "loyalty redemptions read" on public.loyalty_redemptions
  for select to authenticated
  using (
    client_profile_id = auth.uid()
    or private.is_shop_staff(shop_id)
    or private.is_admin()
  );

-- ------------------------------------------------- recent shops (client RPC)
-- Distinct shops from the caller's OWN completed visits, most recent
-- first. Security definer so it does not depend on the queue table's
-- select policy, and it can never return another client's visits because
-- the filter is auth.uid() by construction.
create or replace function public.my_recent_shops()
returns table (shop_id uuid, last_completed_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select q.shop_id, max(q.completed_at)
  from public.queue q
  where q.client_profile_id = auth.uid()
    and q.status = 'completed'
    and q.completed_at is not null
  group by q.shop_id
  order by max(q.completed_at) desc;
$$;

-- ------------------------------------------- credit a completed visit
-- Called by the owner dashboard right after it marks a queue entry
-- completed. Staff-only (or platform admin); a client calling this
-- directly gets nothing, because the staff check fails first.
-- Returns one row per credit actually written (visit, then welcome bonus
-- when due), and [] when nothing was due — including when loyalty is
-- off, when the visit has no account attached, or when this queue entry
-- was already credited (the unique index + ON CONFLICT guard).
create or replace function public.credit_loyalty_for_visit(p_queue_entry_id uuid)
returns table (kind text, points integer)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_queue record;
  v_settings record;
  v_is_first boolean;
begin
  select * into v_queue from public.queue where id = p_queue_entry_id;
  if not found or v_queue.status <> 'completed' then
    return;
  end if;
  if not (private.is_shop_staff(v_queue.shop_id) or private.is_admin()) then
    raise exception 'not shop staff';
  end if;
  -- No account on the row (name-only walk-in): nothing to credit.
  if v_queue.client_profile_id is null then
    return;
  end if;
  select * into v_settings from public.loyalty_settings where shop_id = v_queue.shop_id;
  if not found or not v_settings.enabled then
    return;
  end if;

  -- Visit credit, idempotent by queue_entry_id.
  insert into public.loyalty_ledger
    (shop_id, client_profile_id, queue_entry_id, kind, points, note)
  values
    (v_queue.shop_id, v_queue.client_profile_id, v_queue.id, 'visit',
     v_settings.points_per_visit, 'Completed visit')
  on conflict (queue_entry_id) where queue_entry_id is not null do nothing
  returning 'visit', v_settings.points_per_visit into kind, points;
  if not found then
    -- Already credited: never re-credit, and never re-grant the bonus either.
    return;
  end if;
  return next;

  -- Welcome bonus, only for a client whose FIRST completed visit at this
  -- shop is this one, and only while the bonus toggle is on. Queue
  -- history (not just the ledger) is what makes it non-retroactive: a
  -- client who completed visits here before the toggle went on has an
  -- earlier completed row and gets no bonus.
  if v_settings.welcome_bonus_enabled and v_settings.welcome_bonus_points > 0 then
    select not exists (
      select 1 from public.queue q2
      where q2.shop_id = v_queue.shop_id
        and q2.client_profile_id = v_queue.client_profile_id
        and q2.status = 'completed'
        and (q2.completed_at, q2.id) < (v_queue.completed_at, v_queue.id)
    ) into v_is_first;
    if v_is_first then
      insert into public.loyalty_ledger
        (shop_id, client_profile_id, queue_entry_id, kind, points, note)
      values
        (v_queue.shop_id, v_queue.client_profile_id, null, 'welcome_bonus',
         v_settings.welcome_bonus_points, 'Welcome bonus')
      on conflict (shop_id, client_profile_id) where kind = 'welcome_bonus' do nothing
      returning 'welcome_bonus', v_settings.welcome_bonus_points into kind, points;
      if found then
        return next;
      end if;
    end if;
  end if;
  return;
end;
$$;

-- ------------------------------------------------- request a redemption
-- Client-only in effect: the row is always created for auth.uid(), never
-- for someone else. Fails unless loyalty is on, the reward is active and
-- belongs to this shop, the client has enough points, and they do not
-- already have a pending request for this reward. Points do NOT move here.
create or replace function public.request_loyalty_redemption(p_shop_id uuid, p_reward_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_settings record;
  v_reward record;
  v_balance integer;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  select * into v_settings from public.loyalty_settings where shop_id = p_shop_id;
  if not found or not v_settings.enabled then
    raise exception 'loyalty is not turned on at this shop';
  end if;
  select * into v_reward from public.loyalty_rewards where id = p_reward_id and shop_id = p_shop_id;
  if not found or not v_reward.active then
    raise exception 'reward is not available';
  end if;
  select coalesce(sum(points), 0) into v_balance
  from public.loyalty_ledger
  where shop_id = p_shop_id and client_profile_id = auth.uid();
  if v_balance < v_reward.points_cost then
    raise exception 'not enough points';
  end if;
  insert into public.loyalty_redemptions
    (shop_id, client_profile_id, reward_id, reward_name, points_cost, status)
  values
    (p_shop_id, auth.uid(), v_reward.id, v_reward.name, v_reward.points_cost, 'pending')
  returning id into v_id;
  return v_id;
exception
  when unique_violation then
    raise exception 'you already have a pending request for this reward';
end;
$$;

-- ------------------------------------------------- confirm a redemption
-- Desk confirmation, staff-only (or platform admin). Deducts points and
-- writes the ledger row in the same transaction, so a confirm can never
-- deduct without a record, and re-confirming an already-confirmed row
-- returns without deducting again (idempotent).
create or replace function public.confirm_loyalty_redemption(p_redemption_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_red record;
  v_balance integer;
begin
  select * into v_red from public.loyalty_redemptions where id = p_redemption_id for update;
  if not found then
    raise exception 'redemption not found';
  end if;
  if v_red.status = 'confirmed' then
    return;
  end if;
  if v_red.status <> 'pending' then
    raise exception 'redemption is not pending';
  end if;
  if not (private.is_shop_staff(v_red.shop_id) or private.is_admin()) then
    raise exception 'not shop staff';
  end if;
  select coalesce(sum(points), 0) into v_balance
  from public.loyalty_ledger
  where shop_id = v_red.shop_id and client_profile_id = v_red.client_profile_id;
  if v_balance < v_red.points_cost then
    raise exception 'client no longer has enough points';
  end if;
  insert into public.loyalty_ledger
    (shop_id, client_profile_id, reward_id, redemption_id, kind, points, note)
  values
    (v_red.shop_id, v_red.client_profile_id, v_red.reward_id, v_red.id, 'redeem',
     -v_red.points_cost, 'Reward redeemed: ' || v_red.reward_name);
  update public.loyalty_redemptions
  set status = 'confirmed', confirmed_at = now()
  where id = p_redemption_id;
end;
$$;

-- -------------------------------------------------- cancel a redemption
-- Either the client who requested it, or that shop's staff, may cancel a
-- PENDING request. No points move (none moved at request time).
create or replace function public.cancel_loyalty_redemption(p_redemption_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_red record;
begin
  select * into v_red from public.loyalty_redemptions where id = p_redemption_id for update;
  if not found then
    raise exception 'redemption not found';
  end if;
  if v_red.status <> 'pending' then
    raise exception 'redemption is not pending';
  end if;
  if not (
    v_red.client_profile_id = auth.uid()
    or private.is_shop_staff(v_red.shop_id)
    or private.is_admin()
  ) then
    raise exception 'not allowed';
  end if;
  update public.loyalty_redemptions
  set status = 'cancelled', cancelled_at = now()
  where id = p_redemption_id;
end;
$$;

grant execute on function public.my_recent_shops() to authenticated;
grant execute on function public.credit_loyalty_for_visit(uuid) to authenticated;
grant execute on function public.request_loyalty_redemption(uuid, uuid) to authenticated;
grant execute on function public.confirm_loyalty_redemption(uuid) to authenticated;
grant execute on function public.cancel_loyalty_redemption(uuid) to authenticated;
