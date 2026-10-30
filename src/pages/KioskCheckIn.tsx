import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { formatNextOpening, getOpenState, parseShopHours } from '../lib/hours'
import { fetchShopServices, toServiceOptions } from '../lib/services'
import { ETA_OPTIONS, type Barber, type Shop, type ShopQueueBoardEntry, type ShopService } from '../types'

const DEFAULT_SERVICES = ['Haircut', 'Haircut + Beard', 'Beard trim', 'Kids cut']
const ALREADY_IN_QUEUE_MESSAGE =
  "You're already checked in somewhere else — leave that queue first before joining a new one."

export function KioskCheckIn() {
  const { slug } = useParams<{ slug: string }>()
  const { user, profile, signOut } = useAuth()
  const [shop, setShop] = useState<Shop | null>(null)
  const [barbers, setBarbers] = useState<Barber[]>([])
  const [services, setServices] = useState<ShopService[]>([])
  const [waitingCounts, setWaitingCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  const [service, setService] = useState(DEFAULT_SERVICES[0])
  const [barberId, setBarberId] = useState('')
  const [etaMinutes, setEtaMinutes] = useState<number>(ETA_OPTIONS[1])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [totalWaiting, setTotalWaiting] = useState(0)

  async function loadWaitingCounts(shopId: string) {
    const { data } = await supabase.rpc('shop_board', { p_shop_id: shopId })
    const rows = (data as ShopQueueBoardEntry[]) ?? []
    const counts: Record<string, number> = {}
    let total = 0
    for (const row of rows) {
      if (row.status === 'waiting') {
        total++
        if (row.barber_id) counts[row.barber_id] = (counts[row.barber_id] ?? 0) + 1
      }
    }
    setWaitingCounts(counts)
    setTotalWaiting(total)
  }

  useEffect(() => {
    if (!slug) return
    async function load() {
      const { data: shopData } = await supabase.from('shops').select('*').eq('slug', slug).maybeSingle()
      setShop((shopData as Shop) ?? null)
      if (shopData) {
        const { data: barberData } = await supabase
          .from('barbers')
          .select('*')
          .eq('shop_id', shopData.id)
          .eq('active', true)
          .order('name')
        setBarbers((barberData as Barber[]) ?? [])
        setServices(await fetchShopServices(shopData.id))
        await loadWaitingCounts(shopData.id)
      }
      setLoading(false)
    }
    load()
  }, [slug])

  useEffect(() => {
    if (!shop) return
    const channel = supabase
      .channel(`kiosk-${shop.id}-queue`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'queue', filter: `shop_id=eq.${shop.id}` },
        () => loadWaitingCounts(shop.id),
      )
      .subscribe()
    // Realtime delivers the signed-in kiosk user's own rows; polling stays as backup.
    const poll = setInterval(() => loadWaitingCounts(shop.id), 15_000)
    return () => {
      clearInterval(poll)
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shop?.id])

  // When the live menu arrives, point the picker at a real service instead
  // of the generic fallback default.
  useEffect(() => {
    if (services.length > 0 && !services.some((s) => s.name === service)) {
      setService(services[0].name)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services])

  async function handleCheckIn() {
    if (!shop || !user) return
    if (getOpenState(parseShopHours(shop.hours), new Date()).state === 'closed') {
      setError('This shop is closed right now — check-in opens again at its next opening time.')
      return
    }
    setSubmitting(true)
    setError(null)
    const { error: insertError } = await supabase.from('queue').insert({
      shop_id: shop.id,
      client_profile_id: user.id,
      checked_in_by: user.id,
      client_name: profile?.full_name ?? user.email ?? 'Client',
      phone: profile?.phone ?? null,
      service,
      barber_id: barberId || null,
      eta_minutes: etaMinutes,
    })
    setSubmitting(false)
    if (insertError) {
      setError(insertError.code === '23505' ? ALREADY_IN_QUEUE_MESSAGE : insertError.message)
      return
    }
    setSuccess(true)
    loadWaitingCounts(shop.id)
  }



  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#07070c] text-white/60">Loading…</div>
    )
  }

  if (!shop) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#07070c] px-5 text-center text-white/60">
        We couldn't find a shop at this link.
      </div>
    )
  }

  const openState = getOpenState(parseShopHours(shop.hours), new Date())
  const isClosed = openState.state === 'closed'
  const nextOpening = openState.state === 'closed' ? openState.nextOpening : null
  const serviceOptions = toServiceOptions(services, DEFAULT_SERVICES)

  // Dark neon kiosk theme (barbershop neon-sign look)
  const accent = shop.accent_color
  const neonCardShadow = `0 0 22px ${accent}59, 0 0 70px ${accent}26, inset 0 1px 0 rgba(255,255,255,.08)`
  const poleStrip =
    'repeating-linear-gradient(-45deg, #e63946 0 14px, #f5f5f5 14px 28px, #1d4ed8 28px 42px)'
  const darkInputShadow = 'inset 0 2px 8px rgba(0,0,0,.65), 0 1px 0 rgba(255,255,255,.07)'
  const labelCls =
    'mb-2 block font-display text-sm font-bold uppercase tracking-wider text-white'

  return (
    <div className="relative flex min-h-screen flex-col items-center overflow-hidden bg-[#07070c] px-5 py-10">
      {/* Neon background glows */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -left-24 top-0 h-96 w-96 rounded-full bg-red-600/25 blur-[120px]" />
        <div className="absolute -right-24 top-1/3 h-96 w-96 rounded-full bg-blue-600/20 blur-[120px]" />
        <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-red-600/15 blur-[100px]" />
      </div>
      {/* Barber poles */}
      <div
        className="pointer-events-none absolute bottom-20 left-2 top-24 w-5 rounded-full sm:left-4 sm:w-8"
        style={{ background: poleStrip, boxShadow: '0 0 22px rgba(230,57,70,.45), 0 0 60px rgba(29,78,216,.25)' }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute bottom-20 right-2 top-24 w-5 rounded-full sm:right-4 sm:w-8"
        style={{ background: poleStrip, boxShadow: '0 0 22px rgba(230,57,70,.45), 0 0 60px rgba(29,78,216,.25)' }}
        aria-hidden="true"
      />

      <div className="relative mb-8 flex flex-col items-center px-8 text-center">
        <div
          className="mb-4 flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-[#14141b]"
          style={{ boxShadow: `0 0 18px ${accent}66` }}
        >
          {shop.logo_url ? (
            <img src={shop.logo_url} alt={shop.name} className="h-full w-full object-cover" />
          ) : (
            <span className="font-display text-3xl font-bold text-white">{shop.name.slice(0, 1)}</span>
          )}
        </div>
        <h1
          className="font-display text-4xl font-black tracking-tight"
          style={{
            background: 'linear-gradient(180deg, #ffffff 0%, #c9ccd6 45%, #7a7e8c 55%, #eef0f6 100%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            filter: `drop-shadow(0 0 16px ${accent}88)`,
          }}
        >
          {shop.name}
        </h1>
        <p className="mt-1 text-sm text-white/60">Check in below to join the queue</p>
      </div>

      {isClosed ? (
        <div
          className="relative w-full max-w-md rounded-2xl border-2 bg-[#101016]/95 p-8 text-center"
          style={{ borderColor: accent, boxShadow: neonCardShadow }}
        >
          <p className="font-display text-xl font-bold text-white">Closed right now</p>
          <p className="mt-2 text-sm text-white/60">
            Check-in opens {formatNextOpening(nextOpening, new Date())}.
          </p>
        </div>
      ) : !user ? (
        <div
          className="relative w-full max-w-md rounded-2xl border-2 bg-[#101016]/95 p-8 text-center"
          style={{ borderColor: accent, boxShadow: neonCardShadow }}
        >
          <p className="mb-1 font-display text-xl font-bold text-white">Sign in to check in</p>
          <p className="mb-6 text-sm text-white/60">
            Check-in needs a free account — that's how the shop knows your spot is really yours.
          </p>
          <Link
            to={`/login?next=/kiosk/${slug}`}
            className="mb-3 block w-full rounded-xl px-4 py-3.5 text-center text-base font-bold text-black transition-transform active:scale-[0.99]"
            style={{
              background: `linear-gradient(180deg, #ff7a7a, ${accent} 60%, #b91c1c)`,
              boxShadow: `0 0 20px ${accent}88`,
            }}
          >
            Sign in
          </Link>
          <Link
            to={`/signup?next=/kiosk/${slug}`}
            className="block w-full rounded-xl border-2 px-4 py-3.5 text-center text-base font-bold text-white transition-colors hover:bg-white/5"
            style={{ borderColor: accent }}
          >
            Create a free account
          </Link>
          <p className="mt-6 text-sm text-white/60">No account? Ask the barber to add you at the desk.</p>
        </div>
      ) : (
      <div className="relative w-full max-w-md">
        {success ? (
          <div
            className="rounded-2xl border-2 bg-[#101016]/95 p-8 text-center"
            style={{ borderColor: accent, boxShadow: neonCardShadow }}
          >
            <p className="mb-1 font-display text-xl font-bold text-white">You're checked in!</p>
            <p
              className="font-display text-3xl font-black"
              style={{
                background: 'linear-gradient(180deg, #ffffff 0%, #c9ccd6 50%, #eef0f6 100%)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
                filter: `drop-shadow(0 0 12px ${accent}88)`,
              }}
            >
              See you in ~{etaMinutes} mins
            </p>
            <p className="mb-6 mt-3 text-sm text-white/60">
              {shop.name} got your check-in and is holding your spot.
              <br />
              Drive safe — we'll see you soon.
            </p>
            <button
              onClick={async () => {
                await signOut()
                setSuccess(false)
              }}
              className="w-full rounded-xl px-4 py-3 text-base font-bold text-black transition-transform active:scale-[0.99]"
              style={{
                background: `linear-gradient(180deg, #ff7a7a, ${accent} 60%, #b91c1c)`,
                boxShadow: `0 0 20px ${accent}88`,
              }}
            >
              Sign out
            </button>
          </div>
        ) : (
          <div
            className="overflow-hidden rounded-2xl border-2 bg-[#101016]/95"
            style={{ borderColor: accent, boxShadow: neonCardShadow }}
          >
            {/* Barber-pole brand strip */}
            <div className="h-2" style={{ background: poleStrip }} />
            <div className="space-y-5 p-6 sm:p-8">
              {totalWaiting > 0 && (
                <div
                  className="rounded-xl border px-4 py-3 text-center text-sm font-bold text-white"
                  style={{
                    backgroundColor: '#3d0a0e',
                    borderColor: '#e63946',
                    boxShadow:
                      '0 0 16px rgba(230,57,70,.5), inset 0 0 12px rgba(230,57,70,.25)',
                  }}
                >
                  🔥 {totalWaiting} in line right now — grab your spot
                </div>
              )}
            <div>
              <label className={labelCls}>Service</label>
              <div className="relative">
                <select
                  value={service}
                  onChange={(e) => setService(e.target.value)}
                  className="w-full appearance-none rounded-xl border border-white/25 bg-[#1b1b22] py-4 pl-4 pr-10 text-lg font-medium text-white"
                  style={{ boxShadow: darkInputShadow }}
                >
                  {serviceOptions.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white/70">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="m7 15 5 5 5-5M7 9l5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </div>
            </div>
            {barbers.length > 0 && (
              <div>
                <label className={labelCls}>
                  Pick a barber <span className="font-medium normal-case text-white/50">(optional)</span>
                </label>
                <div className="relative">
                  <select
                    value={barberId}
                    onChange={(e) => setBarberId(e.target.value)}
                    className="w-full appearance-none rounded-xl border border-white/25 bg-[#1b1b22] py-4 pl-4 pr-10 text-lg font-medium text-white"
                    style={{ boxShadow: darkInputShadow }}
                  >
                    <option value="">First available — No preference</option>
                    {barbers.map((b) => {
                      const count = waitingCounts[b.id] ?? 0
                      return (
                        <option key={b.id} value={b.id}>
                          {b.name} — {count > 0 ? `${count} waiting` : 'No wait'}
                        </option>
                      )
                    })}
                  </select>
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white/70">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="m7 15 5 5 5-5M7 9l5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </div>
              </div>
            )}
            <div>
              <label className={labelCls}>When will you arrive?</label>
              <div className="grid grid-cols-3 gap-2">
                {ETA_OPTIONS.map((mins) => {
                  const selected = etaMinutes === mins
                  return (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setEtaMinutes(mins)}
                      className={`rounded-xl border-2 px-3 py-4 text-lg font-bold transition-all ${
                        selected ? 'text-white' : 'border-white/15 bg-[#1b1b22] text-white/60'
                      }`}
                      style={
                        selected
                          ? {
                              borderColor: '#3b82f6',
                              backgroundColor: '#12233f',
                              boxShadow:
                                '0 0 18px rgba(59,130,246,.7), inset 0 0 12px rgba(59,130,246,.3)',
                            }
                          : { boxShadow: darkInputShadow }
                      }
                    >
                      {mins} min
                    </button>
                  )
                })}
              </div>
            </div>
            {error && <p className="text-sm font-medium text-red-400">{error}</p>}
            <button
              onClick={handleCheckIn}
              disabled={submitting}
              className="w-full rounded-xl px-4 py-4 text-xl font-black uppercase tracking-wide text-black transition-transform active:scale-[0.99] disabled:opacity-40"
              style={{
                background: `linear-gradient(180deg, #ff7a7a, ${accent} 55%, #b91c1c)`,
                boxShadow: `0 0 26px ${accent}aa, 0 4px 18px rgba(0,0,0,.5)`,
              }}
            >
              {submitting ? 'Checking in…' : 'Check in'}
            </button>
            </div>
          </div>
        )}
      </div>
      )}
      <p className="relative mt-8 text-center text-xs font-medium tracking-wide text-white/40">
        Powered by <span className="font-bold text-white/60">Lobbyshop LLC</span>
      </p>
    </div>
  )
}
