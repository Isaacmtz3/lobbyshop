# send-called-email — deploy steps

The dashboard already calls this function when a barber calls a client
(`callEntry` in `src/pages/OwnerDashboard.tsx`). Until it is deployed, the
call still works and the in-app banner still fires — email just doesn't go
out yet.

## 1. Resend account (owner's step)

- Create a free account at resend.com.
- Verify a sender domain (or a single sender address on the free tier).
- Create an API key. **Never paste the key in chat or in the repo.**

## 2. Secrets (owner's step, Supabase dashboard)

Project faderz-queue → Edge Functions → Secrets (or `supabase secrets set`):

- `RESEND_API_KEY` — the key from step 1.
- `CALLED_EMAIL_FROM` — the verified sender, e.g. `Lobby <hello@yourdomain.com>`.

## 3. Deploy (from a checkout of this repo with the Supabase CLI)

```sh
supabase link --project-ref ovvfifuoabbzhxoedyra
supabase functions deploy send-called-email
```

## 4. Test

From the owner dashboard, call a test client who has an email on file
(signed-in client, or a guest who shared an email at check-in). The client
should get "You're up at <shop name>" within seconds. If nothing arrives,
check the function's logs in the Supabase dashboard — the function skips
quietly when there is no email on file or when the entry isn't "called".
