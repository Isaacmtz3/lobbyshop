import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { distanceMiles, formatDistance } from '../lib/geo'
import { supabase } from '../lib/supabase'
import type { Shop, ShopQueueStats } from '../types'

type LocationState = 'idle' | 'locating' | 'granted' | 'denied'

export function ShopDirectory() {
  const [shops, setShops] = useState<Shop[]>([])
  const [stats, setStats] = useState<Record<string, ShopQueueStats>>({})
  const [loading, setLoading] = useState(true)

  const [locationState, setLocationState] = useState<LocationState>('idle')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)

  async function loadStats() {
    const { data } = await supabase.from('shop_queue_stats').select('*')
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

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  function useMyLocation() {
    if (!navigator.geolocation) {
      setLocationState('denied')
      return
    }
    setLocationState('locating')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocationState('granted')
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

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <div className="mb-10">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-brandBright">The Lobby</p>
        <h1 className="font-display text-3xl font-bold text-bone sm:text-4xl">
          Find your shop,
          <br />
          <span className="text-brandBright">skip the wait.</span>
        </h1>
        <p className="mt-3 max-w-lg text-mute">
          Every barbershop on Lobby, real wait times, and a check-in before you even walk in the
          door.
        </p>

        <div className="mt-5">
          {locationState !== 'granted' && (
            <button
              onClick={useMyLocation}
              disabled={locationState === 'locating'}
              className="rounded border border-line bg-panel px-3 py-2 text-sm text-mute transition-colors hover:text-bone disabled:opacity-50"
            >
              {locationState === 'locating' ? 'Finding you…' : '📍 Show shops near me'}
            </button>
          )}
          {locationState === 'granted' && (
            <p className="text-sm text-volt">Showing shops nearest you first.</p>
          )}
          {locationState === 'denied' && (
            <p className="text-sm text-mute">
              Couldn't get your location — showing all shops instead.
            </p>
          )}
        </div>
      </div>

      {loading && <p className="text-mute">Loading shops…</p>}

      {!loading && shops.length === 0 && (
        <div className="rounded-md border border-line bg-panel p-8 text-center text-mute">
          No shops have joined Lobby yet.{' '}
          <Link to="/signup" className="text-brandBright hover:underline">
            Sign up your shop
          </Link>{' '}
          to be the first.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {shopsWithDistance.map(({ shop, distance }) => {
          const stat = stats[shop.id]
          const waiting = stat?.waiting_count ?? 0
          return (
            <Link
              key={shop.id}
              to={`/shop/${shop.slug}`}
              className="group rounded-md border border-line bg-panel p-4 transition-colors hover:border-[var(--shop-accent)]"
              style={{ ['--shop-accent' as string]: shop.accent_color }}
            >
              <div className="mb-3 flex h-16 w-16 items-center justify-center overflow-hidden rounded-md bg-panel2">
                {shop.logo_url ? (
                  <img src={shop.logo_url} alt={shop.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="font-display text-xl font-bold text-mute">
                    {shop.name.slice(0, 1)}
                  </span>
                )}
              </div>
              <h3 className="font-display font-semibold text-bone">{shop.name}</h3>
              <p className="text-xs text-mute">
                {distance != null ? formatDistance(distance) : shop.city || ' '}
              </p>
              <div className="mt-3 flex items-center gap-1.5 text-xs">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: waiting > 0 ? shop.accent_color : '#35d07f' }}
                />
                <span className="text-mute">
                  {waiting > 0 ? `${waiting} waiting` : 'No wait'}
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
