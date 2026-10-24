import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Shop, ShopQueueStats } from '../types'

export function AgentExplore() {
  const [shops, setShops] = useState<Shop[]>([])
  const [stats, setStats] = useState<Record<string, ShopQueueStats>>({})
  const [loading, setLoading] = useState(true)

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
      const { data } = await supabase.from('shops').select('*').eq('is_active', true).order('name')
      setShops((data as Shop[]) ?? [])
      await loadStats()
      setLoading(false)
    }
    load()

    const channel = supabase
      .channel('agent-queue-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'queue' }, () => loadStats())
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <h1 className="mb-1 font-display text-2xl font-bold text-bone">Agent tools</h1>
      <p className="mb-8 text-sm text-mute">
        Browse every shop's live wait time, then check a client in on their behalf.
      </p>

      {loading && <p className="text-mute">Loading shops…</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shops.map((shop) => {
          const stat = stats[shop.id]
          return (
            <Link
              key={shop.id}
              to={`/agent/shop/${shop.slug}`}
              className="flex items-center gap-3 rounded-md border border-line bg-panel p-4 transition-colors hover:border-brand"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-panel2">
                {shop.logo_url ? (
                  <img src={shop.logo_url} alt={shop.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="font-display font-bold text-mute">{shop.name.slice(0, 1)}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-bone">{shop.name}</p>
                <p className="text-xs text-mute">{shop.city ?? 'Location not set'}</p>
              </div>
              <div className="text-right">
                <p className="font-display text-lg font-bold" style={{ color: shop.accent_color }}>
                  {stat?.waiting_count ?? 0}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-mute">waiting</p>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
