import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Barber, Client, ProfileRole, QueueEntry, Shop } from '../types'

interface ProfileRow {
  id: string
  role: ProfileRole
  created_at: string
  full_name: string | null
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
  const [clients, setClients] = useState<Client[]>([])
  const [serviceCounts, setServiceCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState<string | null>(null)

  async function loadAll() {
    setLoading(true)
    setError(null)
    try {
      const [{ data: profileData, error: profileErr }, { data: shopData, error: shopErr }, { data: barberData, error: barberErr }, { data: staffData, error: staffErr }, { data: queueData, error: queueErr }, { data: clientData, error: clientErr }, { data: serviceData, error: serviceErr }] =
        await Promise.all([
          supabase.from('profiles').select('id, role, created_at, full_name').order('created_at', { ascending: false }),
          supabase.from('shops').select('*').order('created_at', { ascending: false }),
          supabase.from('barbers').select('*'),
          supabase.from('shop_staff').select('shop_id'),
          supabase.from('queue').select('*').in('status', ['waiting', 'called', 'in_chair']).order('checked_in_at'),
          supabase.from('clients').select('id, shop_id, name, phone, visit_count, last_visit, created_at').order('created_at', { ascending: false }).limit(50),
          supabase.from('shop_services').select('shop_id'),
        ])

      const firstError = profileErr || shopErr || barberErr || staffErr || queueErr || clientErr || serviceErr
      if (firstError) throw firstError

      setProfiles((profileData as ProfileRow[]) ?? [])
      setShops((shopData as Shop[]) ?? [])
      setBarbers((barberData as Barber[]) ?? [])
      setClients((clientData as Client[]) ?? [])

      const svcCounts: Record<string, number> = {}
      for (const row of (serviceData as { shop_id: string }[]) ?? []) {
        svcCounts[row.shop_id] = (svcCounts[row.shop_id] ?? 0) + 1
      }
      setServiceCounts(svcCounts)

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

  /** Beta reality: there's no "I want a shop" flag on signup — every new
   * account starts as a client, so approvals are the recent client signups
   * and the owner approves the ones who told him they want a shop. */
  const pendingApprovals = useMemo(() => profiles.filter((p) => p.role === 'client'), [profiles])

  const shopsWithNoServices = useMemo(
    () => shops.filter((s) => (serviceCounts[s.id] ?? 0) === 0),
    [shops, serviceCounts],
  )

  /** One tap: a client becomes a shop owner and can open /owner to list
   * their shop. This replaces the old manual role flip in the dashboard. */
  async function handleApprove(profileId: string) {
    setActionBusy(profileId)
    setNotice(null)
    setActionError(null)
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ role: 'shop_owner' })
      .eq('id', profileId)
    setActionBusy(null)
    if (updateErr) {
      setActionError(updateErr.message)
      return
    }
    setProfiles((prev) => prev.map((p) => (p.id === profileId ? { ...p, role: 'shop_owner' } : p)))
    setNotice('Approved — they can now open My shop and list their shop.')
  }

  /** Pause hides a shop from the public directory (is_active off); the
   * owner keeps their data and can be reactivated the same way. */
  async function handleToggleActive(shop: Shop) {
    setActionBusy(shop.id)
    setNotice(null)
    setActionError(null)
    const { error: updateErr } = await supabase
      .from('shops')
      .update({ is_active: !shop.is_active })
      .eq('id', shop.id)
    setActionBusy(null)
    if (updateErr) {
      setActionError(updateErr.message)
      return
    }
    setShops((prev) => prev.map((s) => (s.id === shop.id ? { ...s, is_active: !shop.is_active } : s)))
    setNotice(shop.is_active ? `${shop.name} paused — hidden from the directory.` : `${shop.name} is live again.`)
  }

  if (loading) {
    return <div className="mx-auto max-w-6xl px-5 py-10 text-mute">Loading command center…</div>
  }

  if (error) {
    return <div className="mx-auto max-w-6xl px-5 py-10 text-crimsonBright">{error}</div>
  }

  const issueCount = shopsWithNoBarbers.length + stuckQueueEntries.length + shopsWithNoServices.length

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

      {notice && (
        <div className="mb-6 rounded-xl border border-volt/30 bg-volt/10 p-4 text-sm font-medium text-volt">
          {notice}
        </div>
      )}
      {actionError && (
        <div className="mb-6 rounded-xl border border-crimson/30 bg-crimson/10 p-4 text-sm font-medium text-crimsonBright">
          {actionError}
        </div>
      )}

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
          <StatCard label="New (7 days)" value={signupsLast7Days} accent="text-volt" />
        </div>
      </section>

      {/* Approvals — one tap replaces the old dashboard role flip */}
      <section className="mb-10">
        <h2 className="mb-3 font-display text-sm uppercase tracking-wider text-mute">
          Shops waiting for approval ({pendingApprovals.length})
        </h2>
        <p className="mb-3 text-sm text-mute">
          New signups start as clients. Approve the ones who told you they want a shop — they can then
          open My shop and list it.
        </p>
        <div className="overflow-x-auto rounded-xl border border-line bg-panel">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-mute">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Signed up</th>
                <th className="px-5 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {pendingApprovals.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-5 py-8 text-center text-mute">
                    No signups waiting.
                  </td>
                </tr>
              )}
              {pendingApprovals.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-3 text-bone">{p.full_name ?? 'Unnamed signup'}</td>
                  <td className="px-5 py-3 text-mute">{new Date(p.created_at).toLocaleDateString()}</td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => handleApprove(p.id)}
                      disabled={actionBusy === p.id}
                      className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brandBright disabled:opacity-40"
                    >
                      {actionBusy === p.id ? 'Approving…' : 'Approve as shop owner'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
                <th className="px-5 py-3 font-medium">Menu</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {shops.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-mute">
                    No shops yet.
                  </td>
                </tr>
              )}
              {shops.map((shop) => {
                const shopBarbers = barbersByShop[shop.id] ?? []
                const activeBarbers = shopBarbers.filter((b) => b.active).length
                const menuCount = serviceCounts[shop.id] ?? 0
                return (
                  <tr key={shop.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-3 text-bone">{shop.name}</td>
                    <td className="px-5 py-3 text-mute">{shop.city ?? '—'}</td>
                    <td className="px-5 py-3 text-mute">{staffCounts[shop.id] ?? 0}</td>
                    <td className={`px-5 py-3 ${activeBarbers === 0 ? 'text-amber' : 'text-mute'}`}>
                      {activeBarbers === 0 ? 'None configured' : activeBarbers}
                    </td>
                    <td className={`px-5 py-3 ${menuCount === 0 ? 'text-amber' : 'text-mute'}`}>
                      {menuCount === 0 ? 'No menu' : `${menuCount} services`}
                    </td>
                    <td className="px-5 py-3">
                      <span className={shop.is_active ? 'text-volt' : 'text-mute'}>
                        {shop.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => handleToggleActive(shop)}
                        disabled={actionBusy === shop.id}
                        className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-mute hover:bg-panel2 hover:text-bone disabled:opacity-40"
                      >
                        {actionBusy === shop.id ? 'Saving…' : shop.is_active ? 'Pause' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Clients — every shop's client records, admin only */}
      <section className="mb-10">
        <h2 className="mb-3 font-display text-sm uppercase tracking-wider text-mute">
          Clients across all shops ({clients.length} most recent)
        </h2>
        <div className="overflow-x-auto rounded-xl border border-line bg-panel">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-mute">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Shop</th>
                <th className="px-5 py-3 font-medium">Visits</th>
                <th className="px-5 py-3 font-medium">Last visit</th>
              </tr>
            </thead>
            <tbody>
              {clients.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-mute">
                    No client records yet.
                  </td>
                </tr>
              )}
              {clients.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-3 text-bone">{c.name}</td>
                  <td className="px-5 py-3 text-mute">{shops.find((s) => s.id === c.shop_id)?.name ?? '—'}</td>
                  <td className="px-5 py-3 text-mute">{c.visit_count}</td>
                  <td className="px-5 py-3 text-mute">
                    {c.last_visit ? new Date(c.last_visit).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
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
