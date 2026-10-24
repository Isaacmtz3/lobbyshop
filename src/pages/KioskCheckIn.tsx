import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ETA_OPTIONS, type Barber, type Shop, type ShopQueueBoardEntry } from '../types'

const DEFAULT_SERVICES = ['Haircut', 'Haircut + Beard', 'Beard trim', 'Kids cut']

export function KioskCheckIn() {
  const { slug } = useParams<{ slug: string }>()
  const [shop, setShop] = useState<Shop | null>(null)
  const [barbers, setBarbers] = useState<Barber[]>([])
  const [waitingCounts, setWaitingCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  const [clientName, setClientName] = useState('')
  const [phone, setPhone] = useState('')
  const [service, setService] = useState(DEFAULT_SERVICES[0])
  const [barberId, setBarberId] = useState('')
  const [etaMinutes, setEtaMinutes] = useState<number>(ETA_OPTIONS[1])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function loadWaitingCounts(shopId: string) {
    const { data } = await supabase
      .from('shop_queue_board')
      .select('barber_id')
      .eq('shop_id', shopId)
      .eq('status', 'waiting')
    const counts: Record<string, number> = {}
    for (const row of (data as Pick<ShopQueueBoardEntry, 'barber_id'>[]) ?? []) {
      if (row.barber_id) counts[row.barber_id] = (counts[row.barber_id] ?? 0) + 1
    }
    setWaitingCounts(counts)
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
    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shop?.id])

  async function handleCheckIn() {
    if (!shop || !clientName.trim()) return
    setSubmitting(true)
    setError(null)
    const { error: insertError } = await supabase.from('queue').insert({
      shop_id: shop.id,
      client_name: clientName.trim(),
      phone: phone.trim() || null,
      service,
      barber_id: barberId || null,
      eta_minutes: etaMinutes,
    })
    setSubmitting(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setSuccess(true)
    loadWaitingCounts(shop.id)
  }

  function startOver() {
    setClientName('')
    setPhone('')
    setService(DEFAULT_SERVICES[0])
    setBarberId('')
    setEtaMinutes(ETA_OPTIONS[1])
    setSuccess(false)
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-void text-mute">Loading…</div>
    )
  }

  if (!shop) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-void px-5 text-center text-mute">
        We couldn't find a shop at this link.
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-void px-5 py-10">
      <div className="mb-8 flex flex-col items-center">
        <div className="mb-4 flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl bg-panel2">
          {shop.logo_url ? (
            <img src={shop.logo_url} alt={shop.name} className="h-full w-full object-cover" />
          ) : (
            <span className="font-display text-3xl font-bold text-mute">{shop.name.slice(0, 1)}</span>
          )}
        </div>
        <h1 className="font-display text-2xl font-bold text-bone">{shop.name}</h1>
        <p className="text-sm text-mute">Check in below to join the queue</p>
      </div>

      <div className="w-full max-w-md">
        {success ? (
          <div className="rounded-md border p-8 text-center" style={{ borderColor: shop.accent_color }}>
            <p className="mb-1 font-display text-xl font-bold text-bone">You're checked in!</p>
            <p className="mb-6 text-sm text-mute">Have a seat — we'll call you when it's your turn.</p>
            <button
              onClick={startOver}
              className="w-full rounded px-4 py-3 text-base font-medium text-bone transition-colors"
              style={{ backgroundColor: shop.accent_color }}
            >
              Check in another client
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">Full name</label>
              <input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="w-full rounded border border-line bg-panel2 px-3 py-3 text-base text-bone"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">Phone (optional)</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded border border-line bg-panel2 px-3 py-3 text-base text-bone"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">Service</label>
              <select
                value={service}
                onChange={(e) => setService(e.target.value)}
                className="w-full rounded border border-line bg-panel2 px-3 py-3 text-base text-bone"
              >
                {DEFAULT_SERVICES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            {barbers.length > 0 && (
              <div>
                <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">
                  Pick a barber (optional)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setBarberId('')}
                    className={`rounded border px-3 py-3 text-left transition-colors ${
                      barberId === '' ? 'border-brand bg-brand/10' : 'border-line bg-panel2'
                    }`}
                  >
                    <p className="text-sm font-medium text-bone">First available</p>
                    <p className="text-xs text-mute">No preference</p>
                  </button>
                  {barbers.map((b) => {
                    const count = waitingCounts[b.id] ?? 0
                    return (
                      <button
                        type="button"
                        key={b.id}
                        onClick={() => setBarberId(b.id)}
                        className={`rounded border px-3 py-3 text-left transition-colors ${
                          barberId === b.id ? 'border-brand bg-brand/10' : 'border-line bg-panel2'
                        }`}
                      >
                        <p className="text-sm font-medium text-bone">{b.name}</p>
                        <p className="text-xs text-mute">{count > 0 ? `${count} waiting` : 'No wait'}</p>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">
                When will you arrive?
              </label>
              <div className="grid grid-cols-3 gap-2">
                {ETA_OPTIONS.map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setEtaMinutes(mins)}
                    className={`rounded border px-3 py-3 text-base font-medium transition-colors ${
                      etaMinutes === mins ? 'border-brand bg-brand/10 text-bone' : 'border-line bg-panel2 text-mute'
                    }`}
                  >
                    {mins} min
                  </button>
                ))}
              </div>
            </div>
            {error && <p className="text-sm text-crimsonBright">{error}</p>}
            <button
              onClick={handleCheckIn}
              disabled={submitting || !clientName.trim()}
              className="w-full rounded px-4 py-3 text-base font-medium text-bone transition-colors disabled:opacity-40"
              style={{ backgroundColor: shop.accent_color }}
            >
              {submitting ? 'Checking in…' : 'Check in'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
