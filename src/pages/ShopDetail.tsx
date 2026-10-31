import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import {
  DAY_KEYS,
  DAY_LABELS,
  formatNextOpening,
  formatTime,
  getOpenState,
  parseShopHours,
} from '../lib/hours'
import { fetchShopServices, formatPriceCents, toServiceOptions } from '../lib/services'
import {
  balanceFor,
  fetchFavorites,
  fetchMyLedger,
  fetchShopLoyalty,
  toggleFavorite,
} from '../lib/loyalty'
import {
  ETA_OPTIONS,
  type Barber,
  type LoyaltyReward,
  type LoyaltySettings,
  type MyQueuePosition,
  type Shop,
  type ShopQueueStats,
  type ShopService,
} from '../types'

const DEFAULT_SERVICES = ['Haircut', 'Haircut + Beard', 'Beard trim', 'Kids cut']
const ALREADY_IN_QUEUE_MESSAGE =
  "You're already checked in somewhere else — leave that queue first before joining a new one."

export function ShopDetail() {
  const { slug } = useParams<{ slug: string }>()
  const { user, profile } = useAuth()

  const [shop, setShop] = useState<Shop | null>(null)
  const [barbers, setBarbers] = useState<Barber[]>([])
  const [services, setServices] = useState<ShopService[]>([])
  const [stats, setStats] = useState<ShopQueueStats | null>(null)
  const [myPosition, setMyPosition] = useState<MyQueuePosition | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [service, setService] = useState(DEFAULT_SERVICES[0])
  const [barberId, setBarberId] = useState<string>('')
  const [etaMinutes, setEtaMinutes] = useState<number>(ETA_OPTIONS[1])
  const [checkingIn, setCheckingIn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [servicesOpen, setServicesOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  const [isFavorite, setIsFavorite] = useState(false)
  const [loyaltySettings, setLoyaltySettings] = useState<LoyaltySettings | null>(null)
  const [loyaltyRewards, setLoyaltyRewards] = useState<LoyaltyReward[]>([])
  const [myPoints, setMyPoints] = useState<number | null>(null)


  async function loadStats(shopId: string) {
    const { data } = await supabase.rpc('shop_stats', { p_shop_id: shopId })
    const row = (data as ShopQueueStats[] | null)?.[0]
    setStats(row ?? { shop_id: shopId, waiting_count: 0, in_chair_count: 0, completed_today: 0 })
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

      const [{ data: barberData }, liveServices] = await Promise.all([
        supabase.from('barbers').select('*').eq('shop_id', shopData.id).eq('active', true).order('name'),
        fetchShopServices(shopData.id),
        loadStats(shopData.id),
        loadMyPosition(shopData.id),
      ])
      if (!active) return
      setBarbers((barberData as Barber[]) ?? [])
      setServices(liveServices)
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
    // Realtime only delivers this viewer's own queue rows, so other people moving through the line needs polling.
    // Services ride along so a price/menu edit in the dashboard shows up on
    // an already-open shop page without a refresh or redeploy.
    const poll = setInterval(() => {
      loadStats(shop.id)
      loadMyPosition(shop.id)
      fetchShopServices(shop.id).then(setServices)
    }, 15_000)

    return () => {
      clearInterval(poll)
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shop?.id, user?.id])

  // Favorites + this shop's loyalty program. Kept separate from the main
  // load so a missing loyalty migration never breaks the shop page.
  useEffect(() => {
    if (!shop) return
    fetchShopLoyalty(shop.id)
      .then(({ settings, rewards }) => {
        setLoyaltySettings(settings)
        setLoyaltyRewards(rewards)
      })
      .catch(() => {})
    if (!user) {
      setIsFavorite(false)
      setMyPoints(null)
      return
    }
    fetchFavorites(user.id)
      .then((ids) => setIsFavorite(ids.includes(shop.id)))
      .catch(() => {})
    fetchMyLedger(user.id)
      .then((ledger) => setMyPoints(balanceFor(ledger, shop.id)))
      .catch(() => {})
  }, [shop?.id, user?.id])

  async function handleToggleFavorite() {
    if (!shop || !user) return
    await toggleFavorite(user.id, shop.id, isFavorite)
    setIsFavorite(!isFavorite)
  }

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
    setSheetOpen(false)
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

  // Lock body scroll while the check-in sheet is open.
  useEffect(() => {
    if (!sheetOpen) return
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [sheetOpen])

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

  const hours = parseShopHours(shop.hours)
  const openState = getOpenState(hours, new Date())
  const isClosed = openState.state === 'closed'
  const nextOpening = openState.state === 'closed' ? openState.nextOpening : null
  const isCalled = myPosition?.status === 'called'

  // Live menu from the database (generic fallback until the shop sets one).
  const serviceOptions = toServiceOptions(services, DEFAULT_SERVICES)

  return (
    <div className="pb-12">
      {/* Cover banner */}
      <div
        className="h-44 w-full sm:h-56"
        style={{ background: `linear-gradient(135deg, ${shop.accent_color}b3 0%, #101014 75%)` }}
      />

      <div className="mx-auto max-w-3xl px-5">
        {/* Profile card overlapping the cover */}
        <div className="-mt-16 rounded-2xl border border-line bg-panel p-5 shadow-xl">
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-panel2">
              {shop.logo_url ? (
                <img src={shop.logo_url} alt={shop.name} className="h-full w-full object-cover" />
              ) : (
                <span className="font-display text-3xl font-black text-mute">
                  {shop.name.slice(0, 1)}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="truncate font-display text-2xl font-black text-bone">{shop.name}</h1>
                {user ? (
                  <button
                    type="button"
                    onClick={handleToggleFavorite}
                    aria-label={isFavorite ? `Remove ${shop.name} from favorites` : `Favorite ${shop.name}`}
                    title={isFavorite ? 'Favorited' : 'Add to favorites'}
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-lg ${
                      isFavorite
                        ? 'border-amber bg-amber/10 text-amber'
                        : 'border-line bg-panel text-mute hover:text-amber'
                    }`}
                  >
                    {isFavorite ? '★' : '☆'}
                  </button>
                ) : (
                  <Link
                    to={`/login?next=/shop/${shop.slug}`}
                    aria-label={`Favorite ${shop.name} (sign in first)`}
                    title="Sign in to favorite this shop"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-panel text-lg text-mute hover:text-amber"
                  >
                    ☆
                  </Link>
                )}
              </div>
              {shop.address && <p className="mt-1 text-sm text-mute">📍 {shop.address}</p>}
              {shop.city && <p className="text-sm text-mute">{shop.city}</p>}
              {shop.phone && (
                <p className="text-sm">
                  📞{' '}
                  <a href={`tel:${shop.phone}`} className="font-medium text-brandBright hover:underline">
                    {shop.phone}
                  </a>
                </p>
              )}
            </div>
          </div>
        </div>

        {shop.description && (
          <p className="mt-4 text-sm leading-relaxed text-mute">{shop.description}</p>
        )}

        {/* Stat cards with icons */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-line bg-panel p-4 text-center shadow-lg">
            <p className="font-display text-3xl font-black" style={{ color: shop.accent_color }}>
              {stats?.waiting_count ?? 0}
            </p>
            <p className="mt-1 text-xs font-bold uppercase tracking-wider text-mute">Waiting</p>
            <p className="mt-1 text-xl">👥</p>
          </div>
          <div className="rounded-2xl border border-line bg-panel p-4 text-center shadow-lg">
            <p className="font-display text-3xl font-black text-volt">{stats?.in_chair_count ?? 0}</p>
            <p className="mt-1 text-xs font-bold uppercase tracking-wider text-mute">In chair</p>
            <p className="mt-1 text-xl">🪑</p>
          </div>
          <div className="rounded-2xl border border-line bg-panel p-4 text-center shadow-lg">
            <p className="font-display text-3xl font-black text-bone">{barbers.length}</p>
            <p className="mt-1 text-xs font-bold uppercase tracking-wider text-mute">Barbers</p>
            <p className="mt-1 text-xl">👥</p>
          </div>
        </div>

        {loyaltySettings?.enabled && (
          <div className="mt-4 rounded-2xl border border-line bg-panel p-6 shadow-lg">
            <div className="mb-1 flex items-center justify-between gap-3">
              <h2 className="font-display text-sm font-bold uppercase tracking-wider text-mute">
                Loyalty at {shop.name}
              </h2>
              {myPoints != null && (
                <span className="font-display text-xl font-black" style={{ color: shop.accent_color }}>
                  {myPoints} pts
                </span>
              )}
            </div>
            <p className="mb-4 text-xs text-mute">
              {loyaltySettings.points_per_visit} pts per completed visit · points never expire
              {user ? '' : ' · sign in to earn points here'}
            </p>
            {loyaltyRewards.length === 0 ? (
              <p className="text-sm text-mute">Loyalty is on, but this shop has not added rewards yet.</p>
            ) : (
              <ul className="space-y-3">
                {loyaltyRewards.map((reward) => {
                  const remaining = myPoints == null ? null : Math.max(0, reward.points_cost - myPoints)
                  const pct =
                    myPoints == null
                      ? 0
                      : Math.min(100, Math.round((myPoints / reward.points_cost) * 100))
                  return (
                    <li key={reward.id}>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-bone">{reward.name}</span>
                        <span className="shrink-0 text-mute">{reward.points_cost} pts</span>
                      </div>
                      {myPoints != null && (
                        <>
                          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-panel2">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${pct}%`, backgroundColor: shop.accent_color }}
                            />
                          </div>
                          <p className="mt-1 text-xs text-mute">
                            {remaining === 0
                              ? 'Ready to redeem — see your dashboard'
                              : `${remaining} pts to go`}
                          </p>
                        </>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
            {user && (
              <p className="mt-4 text-xs text-mute">
                Redeem from your{' '}
                <Link to="/dashboard" className="text-brandBright hover:underline">
                  dashboard
                </Link>{' '}
                — the barber confirms it at the desk.
              </p>
            )}
          </div>
        )}

        {isCalled && (
          <div
            className="mt-4 rounded-2xl px-6 py-5 text-center shadow-lg"
            style={{ backgroundColor: shop.accent_color }}
          >
            <p className="font-display text-3xl font-black text-bone">🔔 You're called — head to the chair!</p>
            <p className="mt-1 text-sm text-bone">
              Your barber is ready for you. This stays up until your spot changes.
            </p>
          </div>
        )}

        {/* Hours */}
        {hours && (
          <div className="mt-4 rounded-2xl border border-line bg-panel p-5 shadow-lg">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-base font-black uppercase tracking-wider text-bone">
                🕐 Hours
              </h2>
              {openState.state === 'open' ? (
                <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">
                  Open now
                </span>
              ) : (
                <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-600">
                  Closed · opens {formatNextOpening(nextOpening, new Date())}
                </span>
              )}
            </div>
            <div className="my-3 border-t border-line" />
            <div className="space-y-1.5">
              {DAY_KEYS.map((key) => {
                const d = hours[key]
                return (
                  <div key={key} className="flex items-center justify-between text-sm">
                    <span className="font-bold text-bone">{DAY_LABELS[key]}</span>
                    <span className="text-mute">
                      {d.closed ? 'Closed' : `${formatTime(d.open)} – ${formatTime(d.close)}`}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Services & prices dropdown */}
        {services.length > 0 && (
          <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-panel shadow-lg">
            <button
              type="button"
              onClick={() => setServicesOpen((o) => !o)}
              aria-expanded={servicesOpen}
              className="flex w-full items-center justify-between px-5 py-4 text-left"
            >
              <span className="font-display text-base font-black uppercase tracking-wider text-bone">
                ✂️ Services &amp; prices
              </span>
              <span className="flex items-center gap-2 text-sm text-mute">
                {services.length} services
                <span className="text-base text-bone">{servicesOpen ? '▴' : '▾'}</span>
              </span>
            </button>
            {servicesOpen && (
              <div className="divide-y divide-line border-t border-line px-5 py-2">
                {services.map((s) => (
                  <div key={s.id} className="flex items-baseline justify-between gap-3 py-2.5">
                    <span className="text-sm font-medium text-bone">{s.name}</span>
                    <span className="shrink-0 text-sm text-mute">
                      {s.duration_min ? `${s.duration_min} min · ` : ''}
                      <span className="font-bold text-bone">{formatPriceCents(s.price_cents)}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Barbers */}
        {barbers.length > 0 && (
          <div className="mt-4 rounded-2xl border border-line bg-panel p-5 shadow-lg">
            <h2 className="mb-3 font-display text-base font-black uppercase tracking-wider text-bone">
              👥 Barbers
            </h2>
            <div className="flex flex-wrap gap-2">
              {barbers.map((b) => (
                <span
                  key={b.id}
                  className="rounded-full border border-line bg-panel2 px-4 py-1.5 text-sm font-medium text-bone"
                >
                  {b.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Check in — bottom section */}
        <div className="mt-4 rounded-2xl border border-line bg-panel p-5 shadow-lg">
          <h2 className="mb-3 font-display text-base font-black uppercase tracking-wider text-bone">
            📅 Check in
          </h2>
          {myPosition ? (
            <div
              className="rounded-xl border-2 p-6 text-center"
              style={{ borderColor: shop.accent_color, backgroundColor: `${shop.accent_color}1a` }}
            >
              {myPosition.status === 'called' ? (
                <>
                  <p className="text-xs font-bold uppercase tracking-wider text-mute">You're up!</p>
                  <p className="font-display text-3xl font-black text-bone">Head to the shop now</p>
                </>
              ) : (
                <>
                  <p className="text-xs font-bold uppercase tracking-wider text-mute">
                    You're checked in
                  </p>
                  <p className="font-display text-5xl font-black text-bone">#{myPosition.position}</p>
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
          ) : isClosed ? (
            <div className="flex items-center gap-4 rounded-xl bg-red-50 p-4">
              <span className="text-3xl">🏪</span>
              <div>
                <p className="text-sm font-bold text-red-600">This shop is closed right now.</p>
                <p className="text-sm text-bone">
                  Check-in opens {formatNextOpening(nextOpening, new Date())}.
                </p>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setError(null)
                setSheetOpen(true)
              }}
              className="w-full rounded-xl px-4 py-4 text-lg font-black text-white shadow-lg transition-transform active:scale-[0.99]"
              style={{ backgroundColor: shop.accent_color }}
            >
              Check in
            </button>
          )}
        </div>
      </div>

      {/* Bottom-sheet check-in */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Check in">
          <div
            className="animate-sheet-fade absolute inset-0 bg-black/55"
            onClick={() => setSheetOpen(false)}
          />
          <div className="animate-sheet-up absolute inset-x-0 bottom-0">
            <div
              className="mx-auto max-w-lg rounded-t-3xl border-t-2 bg-panel px-6 pb-10 pt-3 shadow-2xl"
              style={{ borderColor: shop.accent_color }}
            >
              <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-line" />
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-display text-xl font-black text-bone">
                  Check in at {shop.name}
                </h3>
                <button
                  type="button"
                  onClick={() => setSheetOpen(false)}
                  aria-label="Close check-in"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-mute hover:bg-panel2 hover:text-bone"
                >
                  ✕
                </button>
              </div>

              {!user ? (
                <div className="space-y-4">
                  <p className="text-sm text-mute">
                    Check-in needs a free account — that's how the shop knows your spot is really
                    yours.
                  </p>
                  <Link
                    to={`/login?next=/shop/${shop.slug}`}
                    className="block w-full rounded-xl bg-brand px-4 py-3 text-center font-bold text-white transition-colors hover:bg-brandBright"
                  >
                    Sign in to check in
                  </Link>
                  <Link
                    to={`/signup?next=/shop/${shop.slug}`}
                    className="block w-full rounded-xl border-2 border-brand bg-panel px-4 py-3 text-center font-bold text-brand transition-colors hover:bg-brand/5"
                  >
                    Create a free account
                  </Link>
                  <p className="text-sm text-mute">
                    No account? Walk in and the barber can add you at the desk.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-mute">
                      Service
                    </label>
                    <select
                      value={service}
                      onChange={(e) => setService(e.target.value)}
                      className="w-full rounded-xl border border-line bg-panel2 px-3 py-3 text-base text-bone"
                    >
                      {serviceOptions.map((s) => (
                        <option key={s.name} value={s.name}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {barbers.length > 0 && (
                    <div>
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-mute">
                        Barber (optional)
                      </label>
                      <select
                        value={barberId}
                        onChange={(e) => setBarberId(e.target.value)}
                        className="w-full rounded-xl border border-line bg-panel2 px-3 py-3 text-base text-bone"
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
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-mute">
                      When will you arrive?
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {ETA_OPTIONS.map((mins) => (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => setEtaMinutes(mins)}
                          className={`rounded-xl border-2 px-3 py-3 text-base font-bold transition-colors ${
                            etaMinutes === mins
                              ? 'border-brand bg-brand/10 text-bone'
                              : 'border-line bg-panel2 text-mute'
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
                    className="w-full rounded-xl px-4 py-4 text-lg font-black text-white shadow-lg transition-transform active:scale-[0.99] disabled:opacity-40"
                    style={{ backgroundColor: shop.accent_color }}
                  >
                    {checkingIn ? 'Checking in…' : 'Check in'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
