-- Browse-scale: client city/state on profiles, shop walk-in starting price.
-- Applied to live Supabase only with Isaac's explicit approval (preview branch).

-- 1) Clients can save their city + state at signup so the directory can
--    default to shops in their city as the app scales to new cities.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS state text;

-- 2) Shops set one "walk-ins starting at" price shown on their browse card.
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS walkin_price_cents integer;

-- 3) New signups: copy city/state from the auth metadata into the profile.
CREATE OR REPLACE FUNCTION private.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
begin
  insert into public.profiles (id, full_name, phone, role, city, state)
    values (
      new.id,
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'phone',
      'client',
      nullif(new.raw_user_meta_data ->> 'city', ''),
      nullif(new.raw_user_meta_data ->> 'state', '')
    );
  return new;
end;
$function$;
