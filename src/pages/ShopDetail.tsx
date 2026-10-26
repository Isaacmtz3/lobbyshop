import { useEffect, useRef, useState } from 'react'
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
  ETA_OPTIONS,
  type Barber,
  type MyQueuePosition,
  type Shop,
  type ShopQueueBoardEntry,
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

  // Guest check-in: tracked by the inserted walk-in row's id, held in page
  // state only (a refresh loses it — guests can simply check in again).
  const [guestName, setGuestName] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [guestCheckingIn, setGuestCheckingIn] = useState(false)
  const [guestError, setGuestError] = useState<string | null>(null)
  const [guestNotice, setGuestNotice] = useState<string | null>(null)
  const [guestEntry, setGuestEntry] = useState<{ id: string; name: string; service: string } | null>(null)
  const [guestBoard, setGuestBoard] = useState<ShopQueueBoardEntry | null>(null)
  const guestEntryIdRef = useRef<string | null>(null)

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

  // Guest position comes from the per-shop board function (masked names,
  // this shop only), matched by the guest's own row id. Raw queue rows are
  // not readable anonymously, so the board function is the guest-safe source.
  // A guest's spot only resolves on their own shop's page — never another
  // shop's board.
  async function loadGuestPosition(entryId: string) {
    if (!shop) return
    const { data } = await supabase.rpc('shop_board', { p_shop_id: shop.id })
    const row = ((data as ShopQueueBoardEntry[] | null) ?? []).find((r) => r.id === entryId) ?? null
    if (!row || (row.status !== 'waiting' && row.status !== 'called' && row.status !== 'in_chair')) {
      setGuestBoard(null)
      setGuestEntry(null)
      guestEntryIdRef.current = null
      setGuestNotice('Your check-in is no longer in line.')
      return
    }
    setGuestBoard(row)
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
      if (guestEntryIdRef.current) loadGuestPosition(guestEntryIdRef.current)
    }, 15_000)

    return () => {
      clearInterval(poll)
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shop?.id, user?.id])

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
    await loadMyPosition(shop.id)
    await loadStats(shop.id)
  }

  async function handleGuestCheckIn() {
    if (!shop) return
    if (getOpenState(parseShopHours(shop.hours), new Date()).state === 'closed') {
      setGuestError('This shop is closed right now — check-in opens again at its next opening time.')
      return
    }
    if (!guestName.trim() || !guestPhone.trim()) {
      setGuestError('Please enter your name and phone number so the shop can reach you.')
      return
    }
    setGuestCheckingIn(true)
    setGuestError(null)
    setGuestNotice(null)
    // Walk-in row: exactly the shape the kiosk creates — shop set, no profile,
    // no checked_in_by. That branch is what the queue INSERT policy allows
    // for anonymous users, so no auth is needed here.
    const { data, error: insertError } = await supabase
      .from('queue')
      .insert({
        shop_id: shop.id,
        client_name: guestName.trim(),
        phone: guestPhone.trim(),
        email: guestEmail.trim() || null,
        service,
        barber_id: barberId || null,
        eta_minutes: etaMinutes,
      })
      .select('id')
      .single()
    setGuestCheckingIn(false)
    if (insertError || !data) {
      setGuestError(insertError?.message ?? 'Could not check in — please try again.')
      return
    }
    const entry = { id: data.id as string, name: guestName.trim(), service }
    setGuestEntry(entry)
    guestEntryIdRef.current = entry.id
    await loadGuestPosition(entry.id)
    await loadStats(shop.id)
  }

  async function handleGuestCancel() {
    if (!shop || !guestEntry) return
    setGuestCheckingIn(true)
    const { error: deleteError } = await supabase.from('queue').delete().eq('id', guestEntry.id)
    setGuestCheckingIn(false)
    if (deleteError) {
      setGuestError(deleteError.message)
      return
    }
    setGuestEntry(null)
    setGuestBoard(null)
    guestEntryIdRef.current = null
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

  const hours = parseShopHours(shop.hours)
  const openState = getOpenState(hours, new Date())
  const isClosed = openState.state === 'closed'
  const nextOpening = openState.state === 'closed' ? openState.nextOpening : null
  const isCalled = myPosition?.status === 'called' || guestBoard?.status === 'called'

  // Live menu from the database (generic fallback until the shop sets one).
  const serviceOptions = toServiceOptions(services, DEFAULT_SERVICES)

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
          {shop.city && <p className="text-sm text-mute">{shop.city}</p>}
          {shop.phone && (
            <p className="text-sm">
              <a href={`tel:${shop.phone}`} className="text-brandBright hover:underline">
                {shop.phone}
              </a>
            </p>
          )}
        </div>
      </div>

      {shop.description && <p className="mb-8 text-sm leading-relaxed text-mute">{shop.description}</p>}

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

      {isCalled && (
        <div className="mb-8 rounded-md px-6 py-5 text-center" style={{ backgroundColor: shop.accent_color }}>
          <p className="font-display text-3xl font-bold text-bone">🔔 You're called — head to the chair!</p>
          <p className="mt-1 text-sm text-bone">
            Your barber is ready for you. This stays up until your spot changes.
          </p>
        </div>
      )}

      {hours && (
        <div className="mb-8 rounded-md border border-line bg-panel p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-sm uppercase tracking-wider text-mute">Hours</h2>
            {openState.state === 'open' && <span className="text-sm font-medium text-volt">Open now</span>}
            {openState.state === 'closed' && (
              <span className="text-sm font-medium text-crimsonBright">
                Closed · opens {formatNextOpening(nextOpening, new Date())}
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {DAY_KEYS.map((key) => {
              const d = hours[key]
              return (
                <p key={key} className="text-sm text-mute">
                  <span className="text-bone">{DAY_LABELS[key]}: </span>
                  {d.closed ? 'Closed' : `${formatTime(d.open)} – ${formatTime(d.close)}`}
                </p>
              )
            })}
          </div>
        </div>
      )}

      {services.length > 0 && (
        <div className="mb-8 rounded-md border border-line bg-panel p-6">
          <h2 className="mb-3 font-display text-sm uppercase tracking-wider text-mute">Services &amp; prices</h2>
          <div className="divide-y divide-line">
            {services.map((s) => (
              <div key={s.id} className="flex items-baseline justify-between gap-3 py-2">
                <span className="text-sm text-bone">{s.name}</span>
                <span className="shrink-0 text-sm text-mute">
                  {s.duration_min ? `${s.duration_min} min · ` : ''}
                  <span className="font-medium text-bone">{formatPriceCents(s.price_cents)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

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
      ) : guestBoard && guestEntry ? (
        <div
          className="mb-8 rounded-md border p-6 text-center"
          style={{ borderColor: shop.accent_color, backgroundColor: `${shop.accent_color}1a` }}
        >
          {guestBoard.status === 'called' ? (
            <>
              <p className="text-xs uppercase tracking-wider text-mute">You're up!</p>
              <p className="font-display text-3xl font-bold text-bone">Head to the shop now</p>
            </>
          ) : guestBoard.status === 'in_chair' ? (
            <>
              <p className="text-xs uppercase tracking-wider text-mute">You're in the chair</p>
              <p className="font-display text-3xl font-bold text-bone">Enjoy your cut</p>
            </>
          ) : (
            <>
              <p className="text-xs uppercase tracking-wider text-mute">
                You're checked in as {guestEntry.name}
              </p>
              <p className="font-display text-5xl font-bold text-bone">#{guestBoard.position}</p>
            </>
          )}
          <p className="mt-1 text-sm text-mute">{guestBoard.service}</p>
          <button
            onClick={handleGuestCancel}
            disabled={guestCheckingIn}
            className="mt-4 text-sm text-mute underline-offset-2 hover:text-crimsonBright hover:underline disabled:opacity-50"
          >
            Cancel check-in
          </button>
        </div>
      ) : (
        <div className="mb-8 rounded-md border border-line bg-panel p-6">
          <h2 className="mb-4 font-display text-sm uppercase tracking-wider text-mute">Check in</h2>

          {guestNotice && <p className="mb-4 text-sm text-mute">{guestNotice}</p>}

          {isClosed ? (
            <div>
              <p className="text-sm text-mute">This shop is closed right now.</p>
              <p className="mt-1 text-sm text-bone">
                Check-in opens {formatNextOpening(nextOpening, new Date())}.
              </p>
            </div>
          ) : (
            <>
          {!user && (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">Full name</label>
                <input
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  className="w-full rounded border border-line bg-panel2 px-3 py-2.5 text-sm text-bone"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">Phone</label>
                <input
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                  className="w-full rounded border border-line bg-panel2 px-3 py-2.5 text-sm text-bone"
                />
                <p className="mt-1 text-xs text-mute">So the shop can reach you about your spot.</p>
              </div>

              <div>
                <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">
                  Email (optional)
                </label>
                <input
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  className="w-full rounded border border-line bg-panel2 px-3 py-2.5 text-sm text-bone"
                />
                <p className="mt-1 text-xs text-mute">So we can email you when you're called.</p>
              </div>

              <div>
                <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">Service</label>
                <select
                  value={service}
                  onChange={(e) => setService(e.target.value)}
                  className="w-full rounded border border-line bg-panel2 px-3 py-2.5 text-sm text-bone"
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

              {guestError && <p className="text-sm text-crimsonBright">{guestError}</p>}

              <button
                onClick={handleGuestCheckIn}
                disabled={guestCheckingIn || !guestName.trim() || !guestPhone.trim()}
                className="w-full rounded px-4 py-2.5 font-medium text-bone transition-colors disabled:opacity-40"
                style={{ backgroundColor: shop.accent_color }}
              >
                {guestCheckingIn ? 'Checking in…' : 'Check in as guest'}
              </button>

              <p className="text-sm text-mute">
                No account needed — your spot is tracked on this page. Want it on your account instead?{' '}
                <Link to="/login" className="text-brandBright hover:underline">
                  Sign in
                </Link>{' '}
                or{' '}
                <Link to="/signup" className="text-brandBright hover:underline">
                  sign up
                </Link>
                .
              </p>
            </div>
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
                  {serviceOptions.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.label}
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
            </>
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
