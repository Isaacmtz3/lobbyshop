-- Tenant isolation, part 1: per-shop functions.
-- APPLY FIRST, before the app deploy that switches to them.
--
-- Why: the shop_queue_board and shop_queue_stats views return EVERY shop's
-- rows to anyone who queries them directly (no per-user or per-shop filter
-- in their definitions). The app filtered by shop_id, but the database did
-- not enforce it. These functions enforce it by construction: each takes
-- exactly one shop id (or, for the directory, returns counts only) and can
-- never return another shop's rows.
--
-- What is NOT returned here, on purpose: full client names, phones, and
-- emails never leave the database through these functions. The public board
-- shows masked names only (first name + last initial). Owners still read
-- full queue rows through the queue table itself, under the staff policies.
-- my_queue_position is unchanged: its definition already restricts rows to
-- the signed-in client or that shop's staff.

-- Masked public board for ONE shop. Active shops only, active statuses only.
-- Also fixes a masking bug in the old view: a single-word name (no last
-- name) was shown doubled ("MadonnaMadonna"); here it shows once.
create or replace function public.shop_board(p_shop_id uuid)
returns table (
  id uuid,
  shop_id uuid,
  display_name text,
  status text,
  barber_id uuid,
  service text,
  checked_in_at timestamptz,
  called_at timestamptz,
  "position" integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    q.id,
    q.shop_id,
    case
      when position(' ' in trim(q.client_name)) > 0
        then trim(split_part(trim(q.client_name), ' ', 1))
          || ' ' || left(split_part(trim(q.client_name), ' ', 2), 1) || '.'
      else trim(q.client_name)
    end,
    q.status::text,
    q.barber_id,
    q.service,
    q.checked_in_at,
    q.called_at,
    case
      when q.status = 'waiting' then
        row_number() over (
          partition by q.shop_id, case when q.status = 'waiting' then 1 else 0 end
          order by q.checked_in_at
        )
      else null
    end as "position"
  from public.queue q
  join public.shops s on s.id = q.shop_id
  where q.shop_id = p_shop_id
    and s.is_active = true
    and q.status in ('waiting', 'called', 'in_chair')
  order by q.checked_in_at;
$$;

comment on function public.shop_board(uuid) is
  'Tenant-isolated public board: masked names for ONE shop only. Replaces direct reads of the shop_queue_board view.';

-- Per-shop counts for ONE shop. Always returns a row for an active shop
-- (zeros when the queue is empty), so callers never need a fallback row.
create or replace function public.shop_stats(p_shop_id uuid)
returns table (
  shop_id uuid,
  waiting_count bigint,
  in_chair_count bigint,
  completed_today bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    count(q.id) filter (where q.status = 'waiting'),
    count(q.id) filter (where q.status = 'in_chair'),
    count(q.id) filter (where q.status = 'completed' and q.completed_at >= current_date)
  from public.shops s
  left join public.queue q on q.shop_id = s.id
  where s.id = p_shop_id
    and s.is_active = true
  group by s.id;
$$;

comment on function public.shop_stats(uuid) is
  'Tenant-isolated per-shop counts for ONE shop only. Replaces direct reads of the shop_queue_stats view.';

-- Directory aggregate: counts ONLY, no client data of any kind, for every
-- active shop. This is what the browse page shows (how busy each shop is);
-- it is the single shared aggregate, and it contains no names, services,
-- or times.
create or replace function public.directory_shop_counts()
returns table (
  shop_id uuid,
  waiting_count bigint,
  in_chair_count bigint,
  completed_today bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    count(q.id) filter (where q.status = 'waiting'),
    count(q.id) filter (where q.status = 'in_chair'),
    count(q.id) filter (where q.status = 'completed' and q.completed_at >= current_date)
  from public.shops s
  left join public.queue q on q.shop_id = s.id
  where s.is_active = true
  group by s.id
  order by s.id;
$$;

comment on function public.directory_shop_counts() is
  'Directory aggregate: per-shop wait counts only, no client data. The one shared aggregate the browse page needs.';

grant execute on function public.shop_board(uuid) to anon, authenticated;
grant execute on function public.shop_stats(uuid) to anon, authenticated;
grant execute on function public.directory_shop_counts() to anon, authenticated;
