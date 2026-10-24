import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Barber, ProfileRole, QueueEntry, Shop } from '../types'

interface ProfileRow {
  id: string
  role: ProfileRole
  created_at: string
}

const STUCK_THRESHOLD_HOURS = 2

function hoursSince(iso: string) {
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60)
}

export function CommandCenter() {
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [shops, setShops] = useState<Shop[]>([])
  const [barbers, setBarbers] = useState<Barber[]>([])
  const [staffCounts, setStaffCounts] = useState<Record<string, number>>({})
  const [activeQueue, setActiveQueue] = useState<(QueueEntry & { shop_name?: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function loadAll() {
    setLoading(true)
    setError(null)
    try {
      const [{ data: profileData, error: profileErr }, { data: shopData, error: shopErr }, { data: barberData, error: barberErr }, { data: staffData, error: staffErr }, { data: queueData, error: queueErr }] =
        await Promise.all([
          supabase.from('profiles').select('id, role, created_at'),
          supabase.from('shops').select('*').order('created_at', { ascending: false }),
          supabase.from('barbers').select('*'),
          supabase.from('shop_staff').select('shop_id'),
          supabase.from('queue').select('*').in('status', ['waiting', 'called', 'in_chair']).order('checked_in_at'),
        ])

      const firstError = profileErr || shopErr || barberErr || staffErr || queueErr
      if (firstError) throw firstError

      setProfiles((profileData as ProfileRow[]) ?? [])
      setShops((shopData as Shop[]) ?? [])
      setBarbers((barberData as Barber[]) ?? [])

      const counts: Record<string, number> = {}
      for (const row of (staffData as { shop_id: string }[]) ?? []) {
        counts[row.shop_id] = (counts[row.shop_id] ?? 0) + 1
      }
      setStaffCounts(counts)

      const shopNameById = new Map(((shopData as Shop[]) ?? []).map((s) => [s.id, s.name]))
      setActiveQueue(
        ((queueData as QueueEntry[]) ?? []).map((q) => ({ ...q, shop_name: shopNameById.get(q.shop_id) })),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load command center data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  const roleCounts = useMemo(() => {
    const counts: Record<ProfileRole, number> = { client: 0, shop_owner: 0, agent: 0, staff: 0, admin: 0 }
    for (const p of profiles) counts[p.role] = (counts[p.role] ?? 0) + 1
    return counts
  }, [profiles])

  const signupsLast7Days = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
    return profiles.filter((p) => new Date(p.created_at).getTime() >= cutoff).length
  }, [profiles])

  const barbersByShop = useMemo(() => {
    const map: Record<string, Barber[]> = {}
    for (const b of barbers) {
      if (!map[b.shop_id]) map[b.shop_id] = []
      map[b.shop_id].push(b)
    }
    return map
  }, [barbers])

  const shopsWithNoBarbers = useMemo(
    () => shops.filter((s) => !(barbersByShop[s.id] ?? []).some((b) => b.active)),
    [shops, barbersByShop],
  )

  const stuckQueueEntries = useMemo(
    () => activeQueue.filter((q) => hoursSince(q.checked_in_at) >= STUCK_THRESHOLD_HOURS),
    [activeQueue],
  )

  if (loading) {
    return <div className="mx-auto max-w-6xl px-5 py-10 text-mute">Loading command center…</div>
  }

  if (error) {
    return <div className="mx-auto max-w-6xl px-5 py-10 text-crimsonBright">{error}</div>
  }

  const issueCount = shopsWithNoBarbers.length + stuckQueueEntries.length

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-bone">Command Center</h1>
          <p className="text-sm text-mute">Platform-wide accounts, shops, and queue health — admin only.</p>
        </div>
        <button
          onClick={loadAll}
          className="rounded-lg border border-line px-3 py-2 text-sm text-mute hover:bg-panel2 hover:text-bone"
        >
          Refresh
        </button>
      </div>

      {/* Health banner */}
      <div
        className={`mb-8 rounded-xl border p-4 ${
          issueCount === 0 ? 'border-volt/30 bg-volt/10' : 'border-amber/30 bg-amber/10'
        }`}
      >
        <p className={`font-semibold ${issueCount === 0 ? 'text-volt' : 'text-amber'}`}>
          {issueCount === 0 ? 'All systems normal' : `${issueCount} item${issueCount === 1 ? '' : 's'} need attention`}
        </p>
      </div>

      {/* Accounts */}
      <section className="mb-10">
        <h2 className="mb-3 font-display text-sm uppercase tracking-wider text-mute">Accounts</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Clients" value={roleCounts.client} />
          <StatCard label="Shop owners" value={roleCounts.shop_owner} />
          <StatCard label="Agents" value={roleCounts.agent} />
          <StatCard label="New (7 days)" value={signupsLast7Days} accent="text-volt" />
        </div>
      </section>

      {/* Shops */}
      <section className="mb-10">
        <h2 className="mb-3 font-display text-sm uppercase tracking-wider text-mute">
          Shops ({shops.length})
        </h2>
        <div className="overflow-x-auto rounded-xl border border-line bg-panel">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-mute">
                <th className="px-5 py-3 font-medium">Shop</th>
                <th className="px-5 py-3 font-medium">City</th>
                <th className="px-5 py-3 font-medium">Staff</th>
                <th className="px-5 py-3 font-medium">Barbers</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {shops.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-mute">
                    No shops yet.
                  </td>
                </tr>
              )}
              {shops.map((shop) => {
                const shopBarbers = barbersByShop[shop.id] ?? []
                const activeBarbers = shopBarbers.filter((b) => b.active).length
                return (
                  <tr key={shop.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-3 text-bone">{shop.name}</td>
                    <td className="px-5 py-3 text-mute">{shop.city ?? '—'}</td>
                    <td className="px-5 py-3 text-mute">{staffCounts[shop.id] ?? 0}</td>
                    <td className={`px-5 py-3 ${activeBarbers === 0 ? 'text-amber' : 'text-mute'}`}>
                      {activeBarbers === 0 ? 'None configured' : activeBarbers}
                    </td>
                    <td className="px-5 py-3">
                      <span className={shop.is_active ? 'text-volt' : 'text-mute'}>
                        {shop.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Queue health */}
      <section className="mb-10">
        <h2 className="mb-3 font-display text-sm uppercase tracking-wider text-mute">
          Live queue across all shops ({activeQueue.length} active)
        </h2>
        <div className="overflow-x-auto rounded-xl border border-line bg-panel">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-mute">
                <th className="px-5 py-3 font-medium">Shop</th>
                <th className="px-5 py-3 font-medium">Client</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Waiting since</th>
              </tr>
            </thead>
            <tbody>
              {activeQueue.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-mute">
                    No one is currently checked in anywhere.
                  </td>
                </tr>
              )}
              {activeQueue.map((entry) => {
                const stuck = hoursSince(entry.checked_in_at) >= STUCK_THRESHOLD_HOURS
                return (
                  <tr key={entry.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-3 text-bone">{entry.shop_name ?? '—'}</td>
                    <td className="px-5 py-3 text-mute">{entry.client_name}</td>
                    <td className="px-5 py-3 text-mute">{entry.status === 'in_chair' ? 'In chair' : entry.status === 'called' ? 'Called' : 'Waiting'}</td>
                    <td className={`px-5 py-3 ${stuck ? 'text-amber' : 'text-mute'}`}>
                      {new Date(entry.checked_in_at).toLocaleString()}
                      {stuck && <span className="ml-2 text-xs">⚠ over {STUCK_THRESHOLD_HOURS}h</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function StatCard({ label, value, accent = 'text-bone' }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-5">
      <p className="mb-2 text-xs uppercase tracking-wider text-mute">{label}</p>
      <p className={`font-display text-3xl font-bold ${accent}`}>{value}</p>
    </div>
  )
}
