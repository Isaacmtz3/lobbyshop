import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ETA_OPTIONS, type Barber, type Shop } from '../types'

const DEFAULT_SERVICES = ['Haircut', 'Haircut + Beard', 'Beard trim', 'Kids cut']

export function AgentShopCheckIn() {
  const { slug } = useParams<{ slug: string }>()

  const [shop, setShop] = useState<Shop | null>(null)
  const [barbers, setBarbers] = useState<Barber[]>([])
  const [loading, setLoading] = useState(true)

  const [clientName, setClientName] = useState('')
  const [phone, setPhone] = useState('')
  const [service, setService] = useState(DEFAULT_SERVICES[0])
  const [barberId, setBarberId] = useState('')
  const [etaMinutes, setEtaMinutes] = useState<number>(ETA_OPTIONS[1])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

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
      }
      setLoading(false)
    }
    load()
  }, [slug])

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
    setClientName('')
    setPhone('')
  }

  if (loading) return <div className="mx-auto max-w-lg px-5 py-10 text-mute">Loading…</div>
  if (!shop) {
    return (
      <div className="mx-auto max-w-lg px-5 py-10 text-mute">
        Couldn't find that shop.{' '}
        <Link to="/agent" className="text-brandBright hover:underline">
          Back to agent tools
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg px-5 py-10">
      <Link to="/agent" className="mb-4 inline-block text-sm text-mute hover:text-bone">
        ← All shops
      </Link>
      <h1 className="mb-1 font-display text-2xl font-bold text-bone">Check in at {shop.name}</h1>
      <p className="mb-6 text-sm text-mute">You're checking in a client on their behalf.</p>

      {success && (
        <div className="mb-4 rounded-md border border-volt/40 bg-volt/10 px-4 py-3 text-sm text-volt">
          Checked in. You can add another client below.
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">Client name</label>
          <input
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            className="w-full rounded border border-line bg-panel2 px-3 py-2.5 text-sm text-bone"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">Phone (optional)</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded border border-line bg-panel2 px-3 py-2.5 text-sm text-bone"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">Service</label>
          <select
            value={service}
            onChange={(e) => setService(e.target.value)}
            className="w-full rounded border border-line bg-panel2 px-3 py-2.5 text-sm text-bone"
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
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">Barber (optional)</label>
            <select
              value={barberId}
              onChange={(e) => setBarberId(e.target.value)}
              className="w-full rounded border border-line bg-panel2 px-3 py-2.5 text-sm text-bone"
            >
              <option value="">No preference</option>
              {barbers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">When will they arrive?</label>
          <div className="grid grid-cols-3 gap-2">
            {ETA_OPTIONS.map((mins) => (
              <button
                key={mins}
                type="button"
                onClick={() => setEtaMinutes(mins)}
                className={`rounded border px-3 py-2.5 text-sm font-medium transition-colors ${
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
          className="w-full rounded px-4 py-2.5 font-medium text-bone transition-colors disabled:opacity-40"
          style={{ backgroundColor: shop.accent_color }}
        >
          {submitting ? 'Checking in…' : 'Check in client'}
        </button>
      </div>
    </div>
  )
}
