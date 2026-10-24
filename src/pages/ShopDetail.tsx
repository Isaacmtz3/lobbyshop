import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { ETA_OPTIONS, type Barber, type MyQueuePosition, type Shop, type ShopQueueStats } from '../types'

const DEFAULT_SERVICES = ['Haircut', 'Haircut + Beard', 'Beard trim', 'Kids cut']
const ALREADY_IN_QUEUE_MESSAGE =
  "You're already checked in somewhere else — leave that queue first before joining a new one."

export function ShopDetail() {
  const { slug } = useParams<{ slug: string }>()
  const { user, profile } = useAuth()

  const [shop, setShop] = useState<Shop | null>(null)
  const [barbers, setBarbers] = useState<Barber[]>([])
  const [stats, setStats] = useState<ShopQueueStats | null>(null)
  const [myPosition, setMyPosition] = useState<MyQueuePosition | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [service, setService] = useState(DEFAULT_SERVICES[0])
  const [barberId, setBarberId] = useState<string>('')
  const [etaMinutes, setEtaMinutes] = useState<number>(ETA_OPTIONS[1])
  const [checkingIn, setCheckingIn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadStats(shopId: string) {
    const { data } = await supabase.from('shop_queue_stats').select('*').eq('shop_id', shopId).maybeSingle()
    setStats((data as ShopQueueStats) ?? { shop_id: shopId, waiting_count: 0, in_chair_count: 0, completed_today: 0 })
  }

  async function loadMyPosition(shopId: string) {
    if (!user) {
      setMyPosition(null)
      return
    }
    const { data } = await supabase
      .from('my_queue_position')
      .select('*')
      .eq('shop_id', shopId)
      .in('status', ['waiting', 'called'])
      .order('checked_in_at')
      .limit(1)
      .maybeSingle()
    setMyPosition(data as MyQueuePosition | null)
  }

  useEffect(() => {
    if (!slug) return
    let active = true

    async function load() {
      setLoading(true)
      const { data: shopData } = await supabase.from('shops').select('*').eq('slug', slug).maybeSingle()
      if (!active) return
      if (!shopData) {
        setNotFound(true)
        setLoading(false)
        return
      }
      setShop(shopData as Shop)

      const [{ data: barberData }] = await Promise.all([
        supabase.from('barbers').select('*').eq('shop_id', shopData.id).eq('active', true).order('name'),
        loadStats(shopData.id),
        loadMyPosition(shopData.id),
      ])
      if (!active) return
      setBarbers((barberData as Barber[]) ?? [])
      setLoading(false)
    }
    load()

    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, user?.id])

  useEffect(() => {
    if (!shop) return
    const channel = supabase
      .channel(`shop-${shop.id}-queue`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'queue', filter: `shop_id=eq.${shop.id}` },
        () => {
          loadStats(shop.id)
          loadMyPosition(shop.id)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shop?.id, user?.id])

  async function handleCheckIn() {
    if (!shop || !user) return
    setCheckingIn(true)
    setError(null)
    const { error: insertError } = await supabase.from('queue').insert({
      shop_id: shop.id,
      client_profile_id: user.id,
      client_name: profile?.full_name ?? user.email ?? 'Guest',
      phone: profile?.phone ?? null,
      service,
      barber_id: barberId || null,
      eta_minutes: etaMinutes,
    })
    setCheckingIn(false)
    if (insertError) {
      setError(insertError.code === '23505' ? ALREADY_IN_QUEUE_MESSAGE : insertError.message)
      return
    }
    await loadMyPosition(shop.id)
    await loadStats(shop.id)
  }

  async function handleCancel() {
    if (!shop || !myPosition) return
    setCheckingIn(true)
    await supabase.from('queue').delete().eq('id', myPosition.id)
    setCheckingIn(false)
    await loadMyPosition(shop.id)
    await loadStats(shop.id)
  }

  if (loading) {
    return <div className="mx-auto max-w-3xl px-5 py-10 text-mute">Loading…</div>
  }

  if (notFound || !shop) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-10">
        <p className="text-mute">
          Couldn't find that shop.{' '}
          <Link to="/" className="text-brandBright hover:underline">
            Back to directory
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <div className="mb-8 flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-panel2">
          {shop.logo_url ? (
            <img src={shop.logo_url} alt={shop.name} className="h-full w-full object-cover" />
          ) : (
            <span className="font-display text-2xl font-bold text-mute">{shop.name.slice(0, 1)}</span>
          )}
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold text-bone">{shop.name}</h1>
          {shop.address && <p className="text-sm text-mute">{shop.address}</p>}
        </div>
      </div>

      <div className="mb-8 grid grid-cols-3 gap-3">
        <div className="rounded-md border border-line bg-panel p-4 text-center">
          <p className="font-display text-2xl font-bold" style={{ color: shop.accent_color }}>
            {stats?.waiting_count ?? 0}
          </p>
          <p className="text-xs uppercase tracking-wider text-mute">Waiting</p>
        </div>
        <div className="rounded-md border border-line bg-panel p-4 text-center">
          <p className="font-display text-2xl font-bold text-volt">{stats?.in_chair_count ?? 0}</p>
          <p className="text-xs uppercase tracking-wider text-mute">In chair</p>
        </div>
        <div className="rounded-md border border-line bg-panel p-4 text-center">
          <p className="font-display text-2xl font-bold text-bone">{barbers.length}</p>
          <p className="text-xs uppercase tracking-wider text-mute">Barbers</p>
        </div>
      </div>

      {myPosition ? (
        <div
          className="mb-8 rounded-md border p-6 text-center"
          style={{ borderColor: shop.accent_color, backgroundColor: `${shop.accent_color}1a` }}
        >
          {myPosition.status === 'called' ? (
            <>
              <p className="text-xs uppercase tracking-wider text-mute">You're up!</p>
              <p className="font-display text-3xl font-bold text-bone">Head to the shop now</p>
            </>
          ) : (
            <>
              <p className="text-xs uppercase tracking-wider text-mute">You're checked in</p>
              <p className="font-display text-5xl font-bold text-bone">#{myPosition.position}</p>
            </>
          )}
          <p className="mt-1 text-sm text-mute">{myPosition.service}</p>
          <button
            onClick={handleCancel}
            disabled={checkingIn}
            className="mt-4 text-sm text-mute underline-offset-2 hover:text-crimsonBright hover:underline disabled:opacity-50"
          >
            Cancel check-in
          </button>
        </div>
      ) : (
        <div className="mb-8 rounded-md border border-line bg-panel p-6">
          <h2 className="mb-4 font-display text-sm uppercase tracking-wider text-mute">Check in</h2>

          {!user && (
            <p className="text-sm text-mute">
              <Link to="/login" className="text-brandBright hover:underline">
                Sign in
              </Link>{' '}
              to check in and track your spot live.
            </p>
          )}

          {user && (
            <div className="space-y-4">
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
                  <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">
                    Barber (optional)
                  </label>
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
                <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">
                  When will you arrive?
                </label>
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
                disabled={checkingIn}
                className="w-full rounded px-4 py-2.5 font-medium text-bone transition-colors disabled:opacity-40"
                style={{ backgroundColor: shop.accent_color }}
              >
                {checkingIn ? 'Checking in…' : 'Check in'}
              </button>
            </div>
          )}
        </div>
      )}

      {barbers.length > 0 && (
        <div>
          <h2 className="mb-3 font-display text-sm uppercase tracking-wider text-mute">Barbers</h2>
          <div className="flex flex-wrap gap-2">
            {barbers.map((b) => (
              <span key={b.id} className="rounded-full border border-line bg-panel px-3 py-1.5 text-sm text-bone">
                {b.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
