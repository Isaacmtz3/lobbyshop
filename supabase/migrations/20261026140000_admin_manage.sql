-- Command Center v1: the platform admin (Isaac) approves shop owners and
-- pauses/activates shops from the app instead of flipping rows by hand.
-- Admins are the only exception to shop isolation: shops never see each
-- other, and no shop role can do either of these.
drop policy if exists "admin update profiles" on public.profiles;
create policy "admin update profiles" on public.profiles
  for update using (private.is_admin()) with check (private.is_admin());

drop policy if exists "admin update shops" on public.shops;
create policy "admin update shops" on public.shops
  for update using (private.is_admin()) with check (private.is_admin());
