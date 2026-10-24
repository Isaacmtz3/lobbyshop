# Email notification plan — "you're called" (second channel)

Status (round 3): CODE WRITTEN, NOT YET DEPLOYED. The dashboard hook is
wired (`callEntry` in `src/pages/OwnerDashboard.tsx` now invokes the
function after a successful waiting → called transition, best-effort so a
missing function never breaks the call), the Edge Function lives at
`supabase/functions/send-called-email/`, and guest check-in optionally
collects an email (`queue.email`) so walk-ins can get the email too. The
in-app "You're called" banner (ShopDetail) is the primary channel and works
today; email is the backup for clients who left the page. Deployment is
blocked only on the owner's Resend secret + verified sender (see "Exactly
what is still needed" below and the function's README).

## When it fires

When a barber calls a client from the owner dashboard, the client's in-app
banner appears via polling. The email must go out at that same moment.

## Exact call-site hook (implemented in round 3)

- File: `src/pages/OwnerDashboard.tsx`
- Function: `callEntry(id)` — after the
  `supabase.from('queue').update({ status: 'called', called_at: ... })`
  succeeds, it invokes `send-called-email` with the queue entry id.
  Best-effort: a failed invoke is swallowed so the call itself never breaks.
  Dedupe: the function itself only sends when the row's status is `called`
  at send time, and the Call button only exists for waiting entries, so one
  click = at most one email.

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
- Guests: since round 3, guest check-in optionally collects an email address
  (stored on `queue.email`); the function uses it when present. Guests who
  don't share one still get the in-app banner only — never an invented
  address.

## Exactly what is still needed (owner to provide)

1. Provider choice: Resend is recommended (simple API, generous free tier).
   Any transactional provider works, but the choice must be made first.
2. API key, stored as a Supabase secret (suggested name: `RESEND_API_KEY`).
   Never in the repo, never in a `VITE_*` variable, never in chat.
3. A verified sender address/domain (e.g. a domain the owner controls,
   verified in Resend). NOT invented here — the owner must supply it, because
   sending from an unverified address will be rejected or land in spam.
4. Deploy the Edge Function (`supabase/functions/send-called-email/`,
   written in round 3) once 1–3 exist — see its README. The dashboard
   invoke is already wired and fails silently until then.

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
