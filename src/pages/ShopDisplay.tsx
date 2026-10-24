import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Barber, Shop, ShopQueueBoardEntry } from '../types'

function useClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(id)
  }, [])
  return now
}

export function ShopDisplay() {
  const { slug } = useParams<{ slug: string }>()
  const [shop, setShop] = useState<Shop | null>(null)
  const [board, setBoard] = useState<ShopQueueBoardEntry[]>([])
  const [barbers, setBarbers] = useState<Barber[]>([])
  const [loading, setLoading] = useState(true)
  const now = useClock()

  async function loadBoard(shopId: string) {
    const { data } = await supabase
      .from('shop_queue_board')
      .select('*')
      .eq('shop_id', shopId)
      .order('checked_in_at')
    setBoard((data as ShopQueueBoardEntry[]) ?? [])
  }

  useEffect(() => {
    if (!slug) return
    let active = true
    async function load() {
      setLoading(true)
      const { data: shopData } = await supabase.from('shops').select('*').eq('slug', slug).maybeSingle()
      if (!active) return
      setShop((shopData as Shop) ?? null)
      if (shopData) {
        await loadBoard(shopData.id)
        const { data: barberData } = await supabase.from('barbers').select('*').eq('shop_id', shopData.id)
        setBarbers((barberData as Barber[]) ?? [])
      }
      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
  }, [slug])

  useEffect(() => {
    if (!shop) return
    const channel = supabase
      .channel(`display-${shop.id}-queue`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'queue', filter: `shop_id=eq.${shop.id}` },
        () => loadBoard(shop.id),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shop?.id])

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-void text-mute">Loading…</div>
  }

  if (!shop) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-void px-5 text-center text-mute">
        We couldn't find a shop at this link.
      </div>
    )
  }

  const called = board.filter((e) => e.status === 'called' || e.status === 'in_chair')
  const waiting = board.filter((e) => e.status === 'waiting').sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const barberName = (id: string | null) => barbers.find((b) => b.id === id)?.name ?? null

  return (
    <div className="min-h-screen bg-void px-10 py-8">
      <div className="mb-10 flex items-center justify-between gap-5">
        <div className="flex items-center gap-5">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl bg-panel2">
            {shop.logo_url ? (
              <img src={shop.logo_url} alt={shop.name} className="h-full w-full object-cover" />
            ) : (
              <span className="font-display text-2xl font-bold text-mute">{shop.name.slice(0, 1)}</span>
            )}
          </div>
          <h1 className="font-display text-4xl font-bold text-bone">{shop.name}</h1>
        </div>
        <p className="font-display text-3xl font-semibold text-mute">
          {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </p>
      </div>

      {called.length > 0 && (
        <div className="mb-10">
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-mute">Now serving</p>
          <div className="flex flex-wrap gap-4">
            {called.map((entry) => (
              <div
                key={entry.id}
                className="rounded-xl border-2 px-8 py-5"
                style={{ borderColor: shop.accent_color, backgroundColor: `${shop.accent_color}1a` }}
              >
                <p className="font-display text-3xl font-bold text-bone">
                  {entry.display_name}
                  {barberName(entry.barber_id) && (
                    <span className="ml-2 align-middle text-sm font-normal text-mute">
                      with {barberName(entry.barber_id)}
                    </span>
                  )}
                </p>
                <p className="text-sm text-mute">{entry.service}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-mute">Waiting</p>
        {waiting.length === 0 ? (
          <p className="text-lg text-mute">No one's waiting right now.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {waiting.map((entry) => (
              <div key={entry.id} className="flex items-center gap-4 rounded-lg border border-line bg-panel px-5 py-4">
                <span className="font-display text-2xl font-bold" style={{ color: shop.accent_color }}>
                  #{entry.position}
                </span>
                <div>
                  <p className="font-display text-lg font-semibold text-bone">
                    {entry.display_name}
                    {barberName(entry.barber_id) && (
                      <span className="ml-1.5 text-xs font-normal text-mute">w/ {barberName(entry.barber_id)}</span>
                    )}
                  </p>
                  <p className="text-xs text-mute">{entry.service}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
