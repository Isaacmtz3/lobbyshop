-- Accounts required for check-in: guest self-service inserts are gone, so
-- the anonymous insert path goes with them. Staff walk-ins still pass via
-- is_shop_staff (the owner has a shop_staff row); signed-in check-ins pass
-- via client_profile_id = auth.uid(). The old guest clause
-- (client_profile_id IS NULL AND checked_in_by IS NULL) is what let anyone
-- with the publishable key fill a shop's queue — it is deliberately gone.
drop policy if exists "public insert queue" on public.queue;
create policy "authenticated insert queue" on public.queue
  for insert to authenticated
  with check (
    shop_id is not null
    and (private.is_shop_staff(shop_id) or client_profile_id = auth.uid())
  );
