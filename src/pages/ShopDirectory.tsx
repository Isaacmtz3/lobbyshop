import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { distanceMiles, formatDistance } from '../lib/geo'
import { DAY_KEYS, formatTime, parseShopHours } from '../lib/hours'
import { fetchFavorites, toggleFavorite } from '../lib/loyalty'
import { supabase } from '../lib/supabase'
import type { Shop, ShopQueueStats } from '../types'

type LocationState = 'idle' | 'locating' | 'granted' | 'denied'

function formatPrice(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`
}

/** One-line hours summary for the browse card, from the shop's real hours. */
function todayHoursLine(shop: Shop): string {
  const hours = parseShopHours(shop.hours)
  if (!hours) return 'Hours not set'
  const dayIdx = (new Date().getDay() + 6) % 7 // Monday = 0
  const today = hours[DAY_KEYS[dayIdx]]
  if (!today || today.closed) return 'Closed today'
  return `Today ${formatTime(today.open)} – ${formatTime(today.close)}`
}

export function ShopDirectory() {
  const { user, profile } = useAuth()
  const [shops, setShops] = useState<Shop[]>([])
  const [stats, setStats] = useState<Record<string, ShopQueueStats>>({})
  const [favorites, setFavorites] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const [query, setQuery] = useState('')
  const [cityFilter, setCityFilter] = useState<string | null>(null)
  const [searchNote, setSearchNote] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)

  const [locationState, setLocationState] = useState<LocationState>('idle')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const userCityApplied = useRef(false)

  // Directory aggregate: counts only, no client data. The per-shop board
  // and stats reads elsewhere are scoped to one shop each.
  async function loadStats() {
    const { data } = await supabase.rpc('directory_shop_counts')
    if (data) {
      const byShop: Record<string, ShopQueueStats> = {}
      for (const row of data as ShopQueueStats[]) byShop[row.shop_id] = row
      setStats(byShop)
    }
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('shops')
        .select('*')
        .eq('is_active', true)
        .order('name')
      setShops((data as Shop[]) ?? [])
      await loadStats()
      setLoading(false)
    }
    load()

    const channel = supabase
      .channel('directory-queue-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'queue' }, () => {
        loadStats()
      })
      .subscribe()
    // Realtime only delivers queue rows this viewer can read (their own), so other shops' changes need polling.
    const poll = setInterval(loadStats, 20_000)

    return () => {
      clearInterval(poll)
      supabase.removeChannel(channel)
    }
  }, [])

  // Favorites load separately from the directory itself: auth may still
  // be resolving on first mount, and a failure here (e.g. the loyalty
  // migration has not been applied yet) must not break the directory.
  useEffect(() => {
    if (!user) {
      setFavorites([])
      return
    }
    fetchFavorites(user.id).then(setFavorites).catch(() => {})
  }, [user?.id])

  // Default the directory to the signed-in user's city.
  useEffect(() => {
    if (profile?.city && !userCityApplied.current && query === '') {
      userCityApplied.current = true
      setQuery(profile.city)
    }
  }, [profile?.city, query])

  // Live search: plain text filters by city; a 5-digit ZIP is resolved to
  // its city first (free, no key) so the search stays real.
  useEffect(() => {
    const term = query.trim()
    if (!term) {
      setCityFilter(null)
      setSearchNote(null)
      setSearching(false)
      return
    }
    if (/^\d{5}(-\d{4})?$/.test(term)) {
      setSearching(true)
      const t = setTimeout(async () => {
        try {
          const res = await fetch(`https://api.zippopotam.us/us/${term.slice(0, 5)}`)
          if (!res.ok) throw new Error('zip not found')
          const data = await res.json()
          const city = data.places?.[0]?.['place name'] as string | undefined
          if (city) {
            setCityFilter(city)
            setSearchNote(`Showing shops in ${city}`)
          } else {
            setCityFilter('__none__')
            setSearchNote('No shops found for that ZIP code.')
          }
        } catch {
          setCityFilter('__none__')
          setSearchNote("Couldn't look up that ZIP code — try a city name.")
        } finally {
          setSearching(false)
        }
      }, 500)
      return () => clearTimeout(t)
    }
    setCityFilter(term)
    setSearchNote(null)
    setSearching(false)
    return undefined
  }, [query])

  async function handleToggleFavorite(shopId: string) {
    if (!user) return
    const isFav = favorites.includes(shopId)
    await toggleFavorite(user.id, shopId, isFav)
    setFavorites((prev) => (isFav ? prev.filter((id) => id !== shopId) : [...prev, shopId]))
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setLocationState('denied')
      return
    }
    setLocationState('locating')
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords
        setCoords({ lat: latitude, lng: longitude })
        setLocationState('granted')
        // Reverse-geocode to a city so "near me" matches shop cities for real.
        try {
          const res = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`,
          )
          const data = await res.json()
          const city = (data.city || data.locality) as string | undefined
          if (city) {
            setQuery(city)
            setSearchNote(`Showing shops near ${city}`)
          }
        } catch {
          // Coords still sort by distance for shops that set their map pin.
        }
      },
      () => setLocationState('denied'),
      { enableHighAccuracy: false, timeout: 10000 },
    )
  }

  const shopsWithDistance = useMemo(() => {
    const withDistance = shops.map((shop) => ({
      shop,
      distance:
        coords && shop.lat != null && shop.lng != null
          ? distanceMiles(coords.lat, coords.lng, shop.lat, shop.lng)
          : null,
    }))
    if (coords) {
      withDistance.sort((a, b) => {
        if (a.distance == null) return 1
        if (b.distance == null) return -1
        return a.distance - b.distance
      })
    }
    return withDistance
  }, [shops, coords])

  const visibleShops = useMemo(() => {
    if (!cityFilter) return shopsWithDistance
    if (cityFilter === '__none__') return []
    const term = cityFilter.toLowerCase()
    return shopsWithDistance.filter(({ shop }) => shop.city?.toLowerCase().includes(term))
  }, [shopsWithDistance, cityFilter])

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      {/* Bold hero */}
      <div className="mb-8">
        <p className="mb-3 text-sm font-bold uppercase tracking-[0.25em] text-brandBright">
          Lobbyshop
        </p>
        <h1 className="font-display text-5xl font-black leading-[1.02] tracking-tight text-bone sm:text-6xl">
          Find your shop,
          <br />
          <span className="text-brandBright">skip the wait.</span>
        </h1>
        <p className="mt-4 max-w-xl text-lg text-mute">
          Every barbershop on Lobbyshop, real wait times, and a check-in before you even walk in
          the door.
        </p>

        {/* Real search: city or ZIP */}
        <div className="relative mt-6 max-w-xl">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-mute">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search city or ZIP code"
            aria-label="Search by city or ZIP code"
            className="w-full rounded-2xl border-2 border-line bg-panel py-4 pl-12 pr-11 text-base text-bone shadow-lg placeholder:text-mute/60 focus:border-brand focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-mute hover:bg-panel2 hover:text-bone"
            >
              ✕
            </button>
          )}
        </div>
        {searching && <p className="mt-2 text-sm text-mute">Looking up that ZIP…</p>}
        {searchNote && !searching && <p className="mt-2 text-sm font-medium text-volt">{searchNote}</p>}

        {/* Near me */}
        <button
          onClick={useMyLocation}
          disabled={locationState === 'locating'}
          className="mt-3 flex w-full max-w-xl items-center justify-center gap-3 rounded-2xl bg-brand px-4 py-4 text-lg font-bold text-white shadow-lg transition-colors hover:bg-brandBright disabled:opacity-50"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M3.4 20.4 21.8 12 3.4 3.6l2.6 7.1 2.1 1.3-2.1 1.3-2.6 7.1Z" />
          </svg>
          {locationState === 'locating' ? 'Finding you…' : 'Show shops near me'}
        </button>
        {locationState === 'granted' && !searchNote && (
          <p className="mt-2 text-sm font-medium text-volt">Showing shops nearest you first.</p>
        )}
        {locationState === 'denied' && (
          <p className="mt-2 text-sm text-mute">
            Couldn't get your location — showing all shops instead.
          </p>
        )}
      </div>

      {loading && <p className="text-mute">Loading shops…</p>}

      {!loading && visibleShops.length === 0 && (
        <div className="rounded-2xl border-2 border-line bg-panel p-8 text-center shadow-lg">
          <p className="font-display text-xl font-bold text-bone">
            {cityFilter && cityFilter !== '__none__'
              ? `No shops in ${cityFilter} yet`
              : 'No shops found'}
          </p>
          <p className="mt-2 text-sm text-mute">
            Own a barbershop here?{' '}
            <Link to="/signup" className="text-brandBright hover:underline">
              Sign up your shop
            </Link>{' '}
            to be the first.
          </p>
          {cityFilter && (
            <button
              onClick={() => setQuery('')}
              className="mt-4 rounded-xl border border-line px-4 py-2 text-sm font-medium text-mute hover:text-bone"
            >
              Show all shops
            </button>
          )}
        </div>
      )}

      {/* Shop cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {visibleShops.map(({ shop, distance }) => {
          const stat = stats[shop.id]
          const waiting = stat?.waiting_count ?? 0
          const isFav = favorites.includes(shop.id)
          return (
            <div
              key={shop.id}
              className="group relative flex flex-col overflow-hidden rounded-2xl border-2 border-line bg-panel shadow-lg transition-all hover:-translate-y-1 hover:shadow-xl hover:border-[var(--shop-accent)]"
              style={{ ['--shop-accent' as string]: shop.accent_color }}
            >
              <Link to={`/shop/${shop.slug}`} className="block">
                <div className="relative h-44 overflow-hidden bg-panel2">
                  {shop.logo_url ? (
                    <img
                      src={shop.logo_url}
                      alt={shop.name}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <span className="font-display text-5xl font-black text-mute">
                        {shop.name.slice(0, 1)}
                      </span>
                    </div>
                  )}
                  {shop.walkin_price_cents != null && (
                    <span className="absolute right-3 top-3 rounded-full bg-black/70 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-sm">
                      Walk-ins from {formatPrice(shop.walkin_price_cents)}
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-display text-xl font-bold text-bone">{shop.name}</h3>
                    {user && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault()
                          handleToggleFavorite(shop.id)
                        }}
                        aria-label={isFav ? `Remove ${shop.name} from favorites` : `Favorite ${shop.name}`}
                        title={isFav ? 'Favorited' : 'Add to favorites'}
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-lg transition-colors ${
                          isFav
                            ? 'border-amber bg-amber/10 text-amber'
                            : 'border-line bg-panel text-mute hover:text-amber'
                        }`}
                      >
                        {isFav ? '★' : '☆'}
                      </button>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm font-medium text-mute">{shop.city || ' '}</p>
                  <p className="mt-1.5 text-xs text-mute">🕐 {todayHoursLine(shop)}</p>
                  <div className="mt-3 flex items-center gap-1.5 text-sm">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: waiting > 0 ? shop.accent_color : '#35d07f' }}
                    />
                    <span className="font-bold text-bone">
                      {waiting > 0 ? `${waiting} in line` : 'No wait'}
                    </span>
                    {distance != null && (
                      <span className="text-mute">· {formatDistance(distance)}</span>
                    )}
                  </div>
                </div>
              </Link>
            </div>
          )
        })}
      </div>
    </div>
  )
}
