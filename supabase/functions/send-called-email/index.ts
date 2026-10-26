// "You're called" email — second channel behind the in-app banner.
//
// Called from the owner dashboard's callEntry() the moment a waiting entry
// becomes "called". This function runs server-side (Supabase Edge Function)
// because sending email needs a secret key, and because only the service
// role can read a signed-in client's email from auth.users.
//
// Secrets (set in the Supabase dashboard, never in the repo or chat):
//   RESEND_API_KEY   — Resend API key
//   CALLED_EMAIL_FROM — verified sender, e.g. "Lobbyshop <hello@yourdomain.com>"
// Supabase provides SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY automatically.
//
// Recipient resolution:
//   - Guest with an email on the queue row -> that email.
//   - Signed-in client -> their auth.users email (service role lookup).
//   - Nobody on file -> skip quietly (the in-app banner still fires).
//
// Safety: only sends when the row's status is actually "called" right now,
// so a stale or duplicate invoke can't spam anyone.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { queue_id } = await req.json()
    if (!queue_id) {
      return new Response(JSON.stringify({ error: 'queue_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: entry } = await supabase.from('queue').select('*').eq('id', queue_id).maybeSingle()
    if (!entry || entry.status !== 'called') {
      return new Response(JSON.stringify({ skipped: 'entry not called' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let recipient: string | null = entry.email ?? null
    if (!recipient && entry.client_profile_id) {
      const { data: userData } = await supabase.auth.admin.getUserById(entry.client_profile_id)
      recipient = userData?.user?.email ?? null
    }
    if (!recipient) {
      return new Response(JSON.stringify({ skipped: 'no email on file' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let shopName = 'your barbershop'
    const { data: shop } = await supabase.from('shops').select('name').eq('id', entry.shop_id).maybeSingle()
    if (shop?.name) shopName = shop.name

    const resendKey = Deno.env.get('RESEND_API_KEY')
    const from = Deno.env.get('CALLED_EMAIL_FROM')
    if (!resendKey || !from) {
      return new Response(JSON.stringify({ skipped: 'email not configured' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const subject = `You're up at ${shopName}`
    const text = `Good news, ${entry.client_name} — you're called at ${shopName}. Head to the shop now, your barber is ready for you.`
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [recipient],
        subject,
        text,
        html: `<p>${text}</p>`,
      }),
    })
    if (!res.ok) {
      const detail = await res.text()
      return new Response(JSON.stringify({ error: 'resend rejected the send', detail }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
