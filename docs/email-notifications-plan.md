# Email notification plan — "you're called" (second channel)

Status: PLAN ONLY. No sending code is wired in, and nothing here needs a
provider key to build. The in-app "You're called" banner (ShopDetail) is the
primary channel and works today; email is the backup for clients who left the
page.

## When it fires

When a barber calls a client from the owner dashboard, the client's in-app
banner appears via polling. The email must go out at that same moment.

## Exact call-site hook (for later implementation)

- File: `src/pages/OwnerDashboard.tsx`
- Function: `callEntry(id)` — the function that runs
  `supabase.from('queue').update({ status: 'called', called_at: ... }).eq('id', id)`.
- Later change: after that update succeeds, invoke the Edge Function below
  with the queue entry id (and shop id). Do NOT send from the browser with a
  client key — see below. Dedupe on `called_at`: only send when the status
  transitions to `called`, not on every dashboard refresh.

## Recommended architecture

Supabase Edge Function (suggested name: `send-called-email`) + Resend.

Why an Edge Function and not browser code:

- Sending email needs a secret API key. A browser key would ship to every
  visitor, so the key must live server-side as a Supabase secret.
- The function runs with the service role, which is also what recipient
  lookup needs (see below).

## Recipient problem (must be solved before sending works)

Queue rows carry a phone number, not an email address. Signed-in clients'
emails live in `auth.users`, which only the service role can read. So:

- Signed-in clients: the Edge Function looks up the client's auth email by
  `client_profile_id` (service role) and sends there.
- Guests: there is no email on file (guest check-in collects name + phone
  only), so guests get the in-app banner only — unless guest check-in is
  later extended to optionally collect an email address. That is a separate
  product decision; do not invent guest emails.

## Exactly what is still needed (owner to provide)

1. Provider choice: Resend is recommended (simple API, generous free tier).
   Any transactional provider works, but the choice must be made first.
2. API key, stored as a Supabase secret (suggested name: `RESEND_API_KEY`).
   Never in the repo, never in a `VITE_*` variable, never in chat.
3. A verified sender address/domain (e.g. a domain the owner controls,
   verified in Resend). NOT invented here — the owner must supply it, because
   sending from an unverified address will be rejected or land in spam.
4. The Edge Function itself (`supabase/functions/send-called-email/`), to be
   written once 1–3 exist, invoked from `callEntry` as described above.

## What NOT to do

- Do not add a browser-side email client or SDK that would break the build
  without credentials.
- Do not store any provider key in the repo or in client-side env vars.
- Do not send email on every queue poll — only on the `waiting` → `called`
  transition, keyed by the entry id + `called_at`.

## SMS later (separate track)

SMS is the owner's eventual goal and reuses the same hook point
(`callEntry` in `OwnerDashboard.tsx`): after the email step, add an SMS call
there. It needs its own provider (e.g. Twilio) and its own secret, plus a
sending phone number. Note: Supabase's Phone auth provider being disabled is
unrelated to sending SMS notifications — that setting only controls
sign-in by phone, not outbound texts.
