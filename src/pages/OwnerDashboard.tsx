import { useEffect, useState, type ChangeEvent } from 'react'
import { supabase } from '../lib/supabase'
import {
  DAY_KEYS,
  DAY_LABELS,
  defaultShopHours,
  parseShopHours,
} from '../lib/hours'
import { fetchShopServices, toServiceOptions } from '../lib/services'
import { creditVisit } from '../lib/loyalty'
import type { Barber, Client, QueueEntry, Shop, ShopHours, ShopService } from '../types'
import { LoyaltyPanel } from './LoyaltyPanel'

type Tab = 'overview' | 'queue' | 'clients' | 'barbers' | 'services' | 'settings' | 'loyalty'

export function OwnerDashboard({
  shop,
  onShopUpdated,
}: {
  shop: Shop
  onShopUpdated: (shop: Shop) => void
}) {
  const [tab, setTab] = useState<Tab>('overview')
  const [queue, setQueue] = useState<QueueEntry[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [barbers, setBarbers] = useState<Barber[]>([])
  const [services, setServices] = useState<ShopService[]>([])
  const [completedToday, setCompletedToday] = useState(0)
  const [loyaltyNotice, setLoyaltyNotice] = useState<string | null>(null)
  const [loyaltyRetryId, setLoyaltyRetryId] = useState<string | null>(null)

  async function loadQueue() {
    const { data } = await supabase
      .from('queue')
      .select('*')
      .eq('shop_id', shop.id)
      .in('status', ['waiting', 'called', 'in_chair'])
      .order('checked_in_at')
    setQueue((data as QueueEntry[]) ?? [])
  }

  async function loadClients() {
    const { data } = await supabase.from('clients').select('*').eq('shop_id', shop.id).order('last_visit', { ascending: false })
    setClients((data as Client[]) ?? [])
  }

  async function loadBarbers() {
    const { data } = await supabase.from('barbers').select('*').eq('shop_id', shop.id).order('name')
    setBarbers((data as Barber[]) ?? [])
  }

  // All services, including inactive ones, so the editor can reactivate them.
  async function loadServices() {
    setServices(await fetchShopServices(shop.id, false))
  }

  async function loadStats() {
    const { data } = await supabase.rpc('shop_stats', { p_shop_id: shop.id })
    const row = (data as { completed_today: number }[] | null)?.[0]
    setCompletedToday(row?.completed_today ?? 0)
  }

  useEffect(() => {
    loadQueue()
    loadClients()
    loadBarbers()
    loadServices()
    loadStats()

    const channel = supabase
      .channel(`owner-${shop.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'queue', filter: `shop_id=eq.${shop.id}` }, () => {
        loadQueue()
        loadStats()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shop.id])

  const waiting = queue.filter((q) => q.status === 'waiting')
  const called = queue.filter((q) => q.status === 'called')
  const inChair = queue.filter((q) => q.status === 'in_chair')

  // NOTE (2026-10-30): the old waiting -> called -> in_chair pipeline is gone.
  // Isaac's call: one tap finishes the job. Tapping a client offers exactly
  // two choices — "In chair" (served: completed visit, Clients section,
  // loyalty points) or "Walked out" (removed, no visit recorded). Both
  // remove the client from the live queue immediately, from any position.
  // The send-called-email Edge Function is still deployed but no longer
  // invoked — there is no "call" step left to trigger it.
  // Completing a visit also records the client in the shop's Clients list —
  // this is what makes the Clients tab real. Matched by profile first, then
  // phone, so repeat visits bump the same record. "Walked out" intentionally
  // leaves no record (no visit happened).
  async function upsertClientFromVisit(entry: QueueEntry) {
    const now = new Date().toISOString()
    let existing: { id: string; visit_count: number } | null = null
    if (entry.client_profile_id) {
      const { data } = await supabase
        .from('clients')
        .select('id, visit_count')
        .eq('shop_id', entry.shop_id)
        .eq('profile_id', entry.client_profile_id)
        .maybeSingle()
      if (data) existing = data
    }
    if (!existing && entry.phone) {
      const { data } = await supabase
        .from('clients')
        .select('id, visit_count')
        .eq('shop_id', entry.shop_id)
        .eq('phone', entry.phone)
        .maybeSingle()
      if (data) existing = data
    }
    if (existing) {
      const { error } = await supabase
        .from('clients')
        .update({
          name: entry.client_name,
          phone: entry.phone,
          last_visit: now,
          visit_count: (existing.visit_count ?? 0) + 1,
        })
        .eq('id', existing.id)
      if (error) throw error
    } else {
      const row: Record<string, unknown> = {
        shop_id: entry.shop_id,
        profile_id: entry.client_profile_id,
        name: entry.client_name,
        phone: entry.phone,
        visit_count: 1,
        last_visit: now,
      }
      let { error } = await supabase.from('clients').insert(row)
      if (error && /tier/i.test(error.message)) {
        // No DB default on tier — fall back to a plain value.
        row.tier = 'regular'
        ;({ error } = await supabase.from('clients').insert(row))
      }
      if (error) throw error
    }
  }
  async function completeEntry(entry: QueueEntry) {
    const id = entry.id
    await supabase.from('queue').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', id)
    try {
      await upsertClientFromVisit(entry)
      loadClients()
    } catch (e) {
      setLoyaltyNotice(
        `Visit completed, but the client record was not saved: ${e instanceof Error ? e.message : 'unknown error'}.`,
      )
    }
    // Loyalty credit is deliberately best-effort and separate: the visit
    // is completed whether or not points land. The RPC itself re-checks
    // that the row is completed and that the caller is shop staff, and it
    // credits at most once per queue entry (unique index), so a retry
    // can never double-credit. A failure here (e.g. the loyalty
    // migration has not been applied yet) is shown with a Retry button,
    // not hidden — and "no credit" is also the correct outcome when
    // loyalty is off, in which case the RPC simply returns [].
    try {
      const credited = await creditVisit(id)
      setLoyaltyRetryId(null)
      if (credited.length > 0) {
        setLoyaltyNotice(
          `Loyalty: ${credited.map((c) => `${c.kind === 'welcome_bonus' ? 'welcome bonus' : 'visit'} +${c.points}`).join(', ')} pts credited.`,
        )
      } else {
        setLoyaltyNotice(null)
      }
    } catch (e) {
      setLoyaltyNotice(
        `Visit completed, but loyalty points were not recorded: ${e instanceof Error ? e.message : 'loyalty unavailable'}.`,
      )
      setLoyaltyRetryId(id)
    }
  }
  async function retryLoyaltyCredit() {
    if (!loyaltyRetryId) return
    try {
      const credited = await creditVisit(loyaltyRetryId)
      setLoyaltyRetryId(null)
      setLoyaltyNotice(
        credited.length > 0
          ? `Loyalty: ${credited.map((c) => `${c.kind === 'welcome_bonus' ? 'welcome bonus' : 'visit'} +${c.points}`).join(', ')} pts credited.`
          : 'Loyalty: no points were due for that visit.',
      )
    } catch (e) {
      setLoyaltyNotice(
        `Loyalty credit still failed: ${e instanceof Error ? e.message : 'loyalty unavailable'}.`,
      )
    }
  }
  async function removeEntry(id: string) {
    await supabase.from('queue').delete().eq('id', id)
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-8 lg:flex-row">
      <aside className="lg:w-48 lg:shrink-0">
        <h2 className="mb-3 truncate font-display text-sm font-semibold text-bone">{shop.name}</h2>
        <div className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {(
            [
              ['overview', 'Overview'],
              ['queue', 'Live queue'],
              ['clients', 'Clients'],
              ['barbers', 'Barbers'],
              ['services', 'Services'],
              ['settings', 'Settings'],
              ['loyalty', 'Loyalty'],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`shrink-0 whitespace-nowrap rounded px-3 py-2 text-left text-sm font-medium transition-colors lg:w-full ${
                tab === key ? 'text-crimsonBright' : 'text-mute hover:bg-panel2 hover:text-bone'
              }`}
              style={tab === key ? { backgroundColor: `${shop.accent_color}26`, color: shop.accent_color } : undefined}
            >
              {label}
            </button>
          ))}
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        {loyaltyNotice && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-panel px-4 py-3 text-sm text-mute">
            <span>{loyaltyNotice}</span>
            {loyaltyRetryId && (
              <button onClick={retryLoyaltyCredit} className="text-sm text-brandBright hover:underline">
                Retry loyalty credit
              </button>
            )}
          </div>
        )}
        {tab === 'loyalty' && <LoyaltyPanel shop={shop} />}
        {tab === 'overview' && (
          <OverviewTab
            waiting={waiting.length}
            completedToday={completedToday}
            accent={shop.accent_color}
          />
        )}
        {tab === 'queue' && (
          <QueueTab
            shopId={shop.id}
            waiting={waiting}
            called={called}
            inChair={inChair}
            barbers={barbers}
            services={services}
            onComplete={completeEntry}
            onRemove={removeEntry}
            onQueueChanged={loadQueue}
          />
        )}
        {tab === 'clients' && <ClientsTab clients={clients} onChange={loadClients} />}
        {tab === 'barbers' && <BarbersTab shopId={shop.id} barbers={barbers} onChange={loadBarbers} />}
        {tab === 'services' && <ServicesTab shopId={shop.id} services={services} onChange={loadServices} />}
        {tab === 'settings' && <SettingsTab shop={shop} onShopUpdated={onShopUpdated} />}
      </main>
    </div>
  )
}

function OverviewTab({
  waiting,
  completedToday,
  accent,
}: {
  waiting: number
  completedToday: number
  accent: string
}) {
  return (
    <div>
      <h1 className="mb-6 font-display text-2xl font-semibold text-bone">Overview</h1>
      <div className="mb-8 grid grid-cols-2 gap-4">
        <div className="rounded-md border border-line bg-panel p-5">
          <p className="mb-2 text-xs uppercase tracking-wider text-mute">Waiting</p>
          <p className="font-display text-3xl font-bold" style={{ color: accent }}>
            {waiting}
          </p>
        </div>
        <div className="rounded-md border border-line bg-panel p-5">
          <p className="mb-2 text-xs uppercase tracking-wider text-mute">Completed today</p>
          <p className="font-display text-3xl font-bold text-bone">{completedToday}</p>
        </div>
      </div>
      <div className="rounded-md border border-line bg-panel p-5">
        <h2 className="mb-4 font-display text-sm uppercase tracking-wider text-mute">Right now</h2>
        <p className="text-sm text-mute">
          {waiting === 0
            ? "Shop's quiet — no one checked in."
            : `${waiting} in line.`}
        </p>
      </div>
    </div>
  )
}

const CALLED_GRACE_MINUTES = 10

// Generic fallback when a shop hasn't set up its live menu yet. The add-client
// picker prefers the shop's own services (see QueueTab's addOptions).
const WALK_IN_SERVICES = ['Haircut', 'Haircut + Beard', 'Beard trim', 'Kids cut']

function arrivalTime(entry: QueueEntry): string {
  if (entry.eta_minutes == null) return '—'
  const base = new Date(entry.checked_in_at).getTime() + entry.eta_minutes * 60_000
  return new Date(base).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function QueueTab({
  shopId,
  waiting,
  called,
  inChair,
  barbers,
  services,
  onComplete,
  onRemove,
  onQueueChanged,
}: {
  shopId: string
  waiting: QueueEntry[]
  called: QueueEntry[]
  inChair: QueueEntry[]
  barbers: Barber[]
  services: ShopService[]
  onComplete: (entry: QueueEntry) => void
  onRemove: (id: string) => void
  onQueueChanged: () => void
}) {
  const barberName = (id: string | null) => barbers.find((b) => b.id === id)?.name ?? '—'

  // Re-render periodically so "called Xm ago" and the grace-period flag
  // stay accurate without needing a new Supabase event to trigger it.
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  const [addOpen, setAddOpen] = useState(false)
  const [popupEntry, setPopupEntry] = useState<QueueEntry | null>(null)
  const [addName, setAddName] = useState('')
  const [addPhone, setAddPhone] = useState('')
  const [addService, setAddService] = useState(WALK_IN_SERVICES[0])
  const [addBarberId, setAddBarberId] = useState('')
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  // Live menu from the shop's services table (generic fallback until set).
  const addOptions = toServiceOptions(
    services.filter((s) => s.active),
    WALK_IN_SERVICES,
  )
  useEffect(() => {
    if (addOptions.length > 0 && !addOptions.some((o) => o.name === addService)) {
      setAddService(addOptions[0].name)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services])

  // Close the client popup with Escape.
  useEffect(() => {
    if (!popupEntry) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPopupEntry(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [popupEntry])

  // A client at the desk: same queue row the kiosk creates, but entered by
  // the owner so a dead iPad never blocks the line.
  async function handleAddClient() {
    if (!addName.trim()) return
    setAddSaving(true)
    setAddError(null)
    const { error: insertError } = await supabase.from('queue').insert({
      shop_id: shopId,
      client_name: addName.trim(),
      phone: addPhone.trim() || null,
      service: addService,
      barber_id: addBarberId || null,
    })
    setAddSaving(false)
    if (insertError) {
      setAddError(insertError.message)
      return
    }
    setAddName('')
    setAddPhone('')
    setAddService(addOptions[0]?.name ?? WALK_IN_SERVICES[0])
    setAddBarberId('')
    setAddOpen(false)
    onQueueChanged()
  }

  const allEntries = [...inChair, ...called, ...waiting]
  // The first person on the list is always Up Next until the owner taps
  // "In chair" or "Walked out" — then the next in line moves up.
  const nextId = allEntries[0]?.id ?? null

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-bone">Live queue</h1>
        <button
          onClick={() => setAddOpen((o) => !o)}
          className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brandBright"
        >
          Add client
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`h-4 w-4 transition-transform ${addOpen ? 'rotate-180' : ''}`}
            aria-hidden="true"
          >
            <path d="m4 6 4 4 4-4" />
          </svg>
        </button>
      </div>

      {addOpen && (
        <div className="mb-6 rounded-md border border-line bg-panel p-5">
          <h2 className="mb-4 font-display text-sm uppercase tracking-wider text-mute">Add client</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">Client name</label>
              <input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="Client name"
                className="w-full rounded border border-line bg-panel2 px-3 py-2.5 text-sm text-bone"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">Phone (optional)</label>
              <input
                type="tel"
                value={addPhone}
                onChange={(e) => setAddPhone(e.target.value)}
                className="w-full rounded border border-line bg-panel2 px-3 py-2.5 text-sm text-bone"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">Service</label>
              <select
                value={addService}
                onChange={(e) => setAddService(e.target.value)}
                className="w-full rounded border border-line bg-panel2 px-3 py-2.5 text-sm text-bone"
              >
                {addOptions.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">Barber (optional)</label>
              <select
                value={addBarberId}
                onChange={(e) => setAddBarberId(e.target.value)}
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
          </div>
          {addError && <p className="mt-3 text-sm text-crimsonBright">{addError}</p>}
          <button
            onClick={handleAddClient}
            disabled={addSaving || !addName.trim()}
            className="mt-4 rounded bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brandBright disabled:opacity-40"
          >
            {addSaving ? 'Adding…' : 'Add to queue'}
          </button>
        </div>
      )}

      {allEntries.length === 0 ? (
        <p className="rounded-md border border-line bg-panel px-5 py-8 text-center text-mute">
          No one in the queue.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {allEntries.map((entry, i) => {
            const minutesAgo = entry.called_at ? (Date.now() - new Date(entry.called_at).getTime()) / 60_000 : 0
            const stuck = entry.status === 'called' && minutesAgo >= CALLED_GRACE_MINUTES
            const isNext = entry.id === nextId
            const statusText =
              entry.status === 'in_chair'
                ? 'In chair'
                : entry.status === 'called'
                  ? `Called ${Math.round(minutesAgo)}m ago`
                  : 'Waiting'
            return (
              <div
                key={entry.id}
                role="button"
                tabIndex={0}
                onClick={() => setPopupEntry(entry)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setPopupEntry(entry)
                  }
                }}
                className={`flex cursor-pointer items-center gap-4 rounded-xl border bg-panel px-4 py-4 shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl ${
                  isNext ? 'border-brand/70' : stuck ? 'border-amber/50' : 'border-line'
                }`}
              >
                <span
                  className={`shrink-0 font-display text-2xl font-bold ${isNext ? 'text-brand' : 'text-mute'}`}
                >
                  #{entry.position ?? i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-lg font-bold text-bone">{entry.client_name}</p>
                  <p className="truncate text-xs text-mute">
                    {entry.service}
                    {entry.barber_id ? ` · with ${barberName(entry.barber_id)}` : ''}
                  </p>
                  {entry.status === 'waiting' ? (
                    entry.eta_minutes != null ? (
                      <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-brand/15 px-3 py-1 text-xs font-semibold text-bone">
                        ⏱ Arriving in ~{entry.eta_minutes} min · by {arrivalTime(entry)}
                      </span>
                    ) : (
                      <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-volt/15 px-3 py-1 text-xs font-semibold text-volt">
                        📍 In the shop
                      </span>
                    )
                  ) : (
                    <p
                      className={`mt-1 text-xs ${
                        entry.status === 'in_chair' ? 'text-volt' : stuck ? 'text-amber' : 'text-mute'
                      }`}
                    >
                      {statusText}
                      {stuck && ' ⚠'}
                    </p>
                  )}
                </div>
                {isNext ? (
                  // Label only — tapping it opens the same popup as the rest
                  // of the card, where "In chair" / "Walked out" finishes it.
                  <span className="shrink-0 rounded-md bg-brand px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white">
                    Up Next
                  </span>
                ) : (
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-5 w-5 shrink-0 text-mute"
                    aria-hidden="true"
                  >
                    <path d="m6 4 4 4-4 4" />
                  </svg>
                )}
              </div>
            )
          })}
        </div>
      )}

      {popupEntry && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setPopupEntry(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-line bg-panel p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-start justify-between gap-3">
              <h2 className="font-display text-xl font-bold text-bone">{popupEntry.client_name}</h2>
              <button
                onClick={() => setPopupEntry(null)}
                className="text-xl leading-none text-mute hover:text-bone"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            {popupEntry.barber_id && (
              <p className="mb-5 text-sm text-mute">with {barberName(popupEntry.barber_id)}</p>
            )}
            <div className="flex flex-col gap-2">
              {/* One tap finishes the job: "In chair" records the served
                  visit (Clients section + loyalty points); "Walked out"
                  removes them with no visit recorded. Either way the client
                  leaves the live queue immediately, from any spot in line. */}
              <button
                onClick={() => {
                  onComplete(popupEntry)
                  onQueueChanged()
                  setPopupEntry(null)
                }}
                className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brandBright"
              >
                In chair
              </button>
              <button
                onClick={() => {
                  onRemove(popupEntry.id)
                  onQueueChanged()
                  setPopupEntry(null)
                }}
                className="rounded-lg border border-crimson/50 px-4 py-2.5 text-sm font-medium text-crimsonBright transition-colors hover:bg-crimson/10"
              >
                Walked out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ClientsTab({ clients, onChange }: { clients: Client[]; onChange: () => void }) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [saving, setSaving] = useState(false)

  function startEdit(c: Client) {
    setEditingId(c.id)
    setEditName(c.name)
    setEditPhone(c.phone ?? '')
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) return
    setSaving(true)
    await supabase
      .from('clients')
      .update({ name: editName.trim(), phone: editPhone.trim() || null })
      .eq('id', id)
    setSaving(false)
    setEditingId(null)
    onChange()
  }

  async function deleteClient(id: string, name: string) {
    if (!window.confirm(`Delete ${name} from your clients? This can't be undone.`)) return
    await supabase.from('clients').delete().eq('id', id)
    onChange()
  }

  return (
    <div>
      <h1 className="mb-6 font-display text-2xl font-semibold text-bone">Clients</h1>
      {clients.length === 0 ? (
        <p className="rounded-md border border-line bg-panel px-5 py-8 text-center text-mute">
          No client records yet.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {clients.map((c) => (
            <div key={c.id} className="rounded-md border border-line bg-panel px-4 py-3">
              {editingId === c.id ? (
                <div className="flex flex-col gap-2">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Name"
                    className="w-full rounded border border-line bg-panel2 px-3 py-2.5 text-sm text-bone"
                  />
                  <input
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="Phone (optional)"
                    inputMode="tel"
                    className="w-full rounded border border-line bg-panel2 px-3 py-2.5 text-sm text-bone"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveEdit(c.id)}
                      disabled={saving || !editName.trim()}
                      className="rounded bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brandBright disabled:opacity-40"
                    >
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="rounded border border-line px-4 py-2 text-sm text-mute transition-colors hover:text-bone"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-base font-semibold text-bone">{c.name}</p>
                    <p className="truncate text-xs text-mute">
                      {c.phone ?? 'No phone'} · {c.visit_count} {c.visit_count === 1 ? 'visit' : 'visits'} ·{' '}
                      {c.tier}
                      {c.last_visit ? ` · Last: ${new Date(c.last_visit).toLocaleDateString()}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => startEdit(c)}
                    className="shrink-0 rounded border border-line px-3 py-1.5 text-xs font-medium text-mute transition-colors hover:text-bone"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteClient(c.id, c.name)}
                    className="shrink-0 rounded px-3 py-1.5 text-xs font-medium text-crimsonBright transition-colors hover:bg-crimson/10"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function BarbersTab({ shopId, barbers, onChange }: { shopId: string; barbers: Barber[]; onChange: () => void }) {
  const [name, setName] = useState('')
  const [adding, setAdding] = useState(false)

  async function addBarber() {
    if (!name.trim()) return
    setAdding(true)
    await supabase.from('barbers').insert({ shop_id: shopId, name: name.trim() })
    setName('')
    setAdding(false)
    onChange()
  }

  async function toggleActive(barber: Barber) {
    await supabase.from('barbers').update({ active: !barber.active }).eq('id', barber.id)
    onChange()
  }

  async function removeBarber(id: string) {
    await supabase.from('barbers').delete().eq('id', id)
    onChange()
  }

  return (
    <div>
      <h1 className="mb-6 font-display text-2xl font-semibold text-bone">Barbers</h1>
      <div className="mb-4 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Barber name"
          className="flex-1 rounded border border-line bg-panel2 px-3 py-2.5 text-sm text-bone"
        />
        <button
          onClick={addBarber}
          disabled={adding}
          className="rounded bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brandBright disabled:opacity-40"
        >
          Add
        </button>
      </div>
      <div className="divide-y divide-line rounded-md border border-line bg-panel">
        {barbers.length === 0 && <p className="px-5 py-8 text-center text-mute">No barbers added yet.</p>}
        {barbers.map((b) => (
          <div key={b.id} className="flex items-center justify-between px-5 py-3">
            <span className={b.active ? 'text-bone' : 'text-mute line-through'}>{b.name}</span>
            <div className="flex gap-3 text-xs">
              <button onClick={() => toggleActive(b)} className="text-brandBright hover:underline">
                {b.active ? 'Deactivate' : 'Activate'}
              </button>
              <button onClick={() => removeBarber(b.id)} className="text-crimsonBright hover:underline">
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ServicesTab({
  shopId,
  services,
  onChange,
}: {
  shopId: string
  services: ShopService[]
  onChange: () => void
}) {
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [duration, setDuration] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Per-row draft edits (price dollars + duration minutes), saved on demand.
  const [drafts, setDrafts] = useState<Record<string, { price: string; duration: string }>>({})

  function draftFor(s: ShopService) {
    return (
      drafts[s.id] ?? {
        price: s.price_cents % 100 === 0 ? String(s.price_cents / 100) : (s.price_cents / 100).toFixed(2),
        duration: s.duration_min != null ? String(s.duration_min) : '',
      }
    )
  }

  async function addService() {
    const priceCents = Math.round(parseFloat(price) * 100)
    if (!name.trim() || Number.isNaN(priceCents) || priceCents < 0) {
      setError('Enter a service name and a price of $0 or more.')
      return
    }
    const durationMin = duration.trim() === '' ? null : parseInt(duration, 10)
    if (durationMin !== null && (Number.isNaN(durationMin) || durationMin <= 0)) {
      setError('Duration must be a positive number of minutes, or blank.')
      return
    }
    setAdding(true)
    setError(null)
    const { error: insertError } = await supabase.from('shop_services').insert({
      shop_id: shopId,
      name: name.trim(),
      price_cents: priceCents,
      duration_min: durationMin,
      sort_order: services.length,
    })
    setAdding(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setName('')
    setPrice('')
    setDuration('')
    onChange()
  }

  async function saveService(s: ShopService) {
    const d = draftFor(s)
    const priceCents = Math.round(parseFloat(d.price) * 100)
    if (Number.isNaN(priceCents) || priceCents < 0) {
      setError('Price must be $0 or more.')
      return
    }
    const durationMin = d.duration.trim() === '' ? null : parseInt(d.duration, 10)
    if (durationMin !== null && (Number.isNaN(durationMin) || durationMin <= 0)) {
      setError('Duration must be a positive number of minutes, or blank.')
      return
    }
    setError(null)
    const { error: updateError } = await supabase
      .from('shop_services')
      .update({ price_cents: priceCents, duration_min: durationMin })
      .eq('id', s.id)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setDrafts((prev) => {
      const next = { ...prev }
      delete next[s.id]
      return next
    })
    onChange()
  }

  async function toggleActive(s: ShopService) {
    await supabase.from('shop_services').update({ active: !s.active }).eq('id', s.id)
    onChange()
  }

  async function removeService(id: string) {
    await supabase.from('shop_services').delete().eq('id', id)
    onChange()
  }

  return (
    <div>
      <h1 className="mb-6 font-display text-2xl font-semibold text-bone">Services &amp; prices</h1>
      <p className="mb-4 text-sm text-mute">
        This is your shop's live menu — it shows on your shop page and in every check-in picker. Changes take
        effect right away, no redeploy needed.
      </p>
      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_120px_140px_auto]">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Service name"
          className="rounded border border-line bg-panel2 px-3 py-2.5 text-sm text-bone"
        />
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Price ($)"
          inputMode="decimal"
          className="rounded border border-line bg-panel2 px-3 py-2.5 text-sm text-bone"
        />
        <input
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          placeholder="Minutes (optional)"
          inputMode="numeric"
          className="rounded border border-line bg-panel2 px-3 py-2.5 text-sm text-bone"
        />
        <button
          onClick={addService}
          disabled={adding}
          className="rounded bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brandBright disabled:opacity-40"
        >
          Add
        </button>
      </div>
      {error && <p className="mb-4 text-sm text-crimsonBright">{error}</p>}
      <div className="divide-y divide-line rounded-md border border-line bg-panel">
        {services.length === 0 && (
          <p className="px-5 py-8 text-center text-mute">No services yet — add your first one above.</p>
        )}
        {services.map((s) => {
          const d = draftFor(s)
          const dirty =
            Math.round(parseFloat(d.price) * 100) !== s.price_cents ||
            (d.duration.trim() === '' ? null : parseInt(d.duration, 10)) !== s.duration_min
          return (
            <div key={s.id} className="flex flex-wrap items-center gap-2 px-5 py-3">
              <span className={`min-w-0 flex-1 text-sm ${s.active ? 'text-bone' : 'text-mute line-through'}`}>
                {s.name}
              </span>
              <span className="text-sm text-mute">$</span>
              <input
                value={d.price}
                onChange={(e) =>
                  setDrafts((prev) => ({ ...prev, [s.id]: { ...draftFor(s), price: e.target.value } }))
                }
                inputMode="decimal"
                aria-label={`Price for ${s.name}`}
                className="w-20 rounded border border-line bg-panel2 px-2 py-1.5 text-sm text-bone"
              />
              <input
                value={d.duration}
                onChange={(e) =>
                  setDrafts((prev) => ({ ...prev, [s.id]: { ...draftFor(s), duration: e.target.value } }))
                }
                inputMode="numeric"
                placeholder="min"
                aria-label={`Duration for ${s.name}`}
                className="w-16 rounded border border-line bg-panel2 px-2 py-1.5 text-sm text-bone"
              />
              {dirty && (
                <button onClick={() => saveService(s)} className="text-sm text-brandBright hover:underline">
                  Save
                </button>
              )}
              <button onClick={() => toggleActive(s)} className="text-xs text-brandBright hover:underline">
                {s.active ? 'Deactivate' : 'Activate'}
              </button>
              <button onClick={() => removeService(s.id)} className="text-xs text-crimsonBright hover:underline">
                Remove
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SettingsTab({ shop, onShopUpdated }: { shop: Shop; onShopUpdated: (shop: Shop) => void }) {
  const [name, setName] = useState(shop.name)
  const [city, setCity] = useState(shop.city ?? '')
  const [address, setAddress] = useState(shop.address ?? '')
  const [phone, setPhone] = useState(shop.phone ?? '')
  const [accentColor, setAccentColor] = useState(shop.accent_color)
  const [lat, setLat] = useState(shop.lat)
  const [lng, setLng] = useState(shop.lng)
  const [hours, setHours] = useState<ShopHours>(() => parseShopHours(shop.hours) ?? defaultShopHours())
  const [hoursEdited, setHoursEdited] = useState(false)
  const [locating, setLocating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  function updateDay(key: string, patch: Partial<{ closed: boolean; open: string; close: string }>) {
    setHours((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }))
    setHoursEdited(true)
  }

  async function save() {
    for (const key of DAY_KEYS) {
      const d = hours[key]
      if (!d.closed && d.open >= d.close) {
        setMessage(`Opening time must be before closing time for ${DAY_LABELS[key as keyof typeof DAY_LABELS]}.`)
        return
      }
    }
    setSaving(true)
    setMessage(null)
    const { data, error } = await supabase
      .from('shops')
      .update({
        name,
        city,
        address,
        phone,
        accent_color: accentColor,
        lat,
        lng,
        ...(hoursEdited ? { hours } : {}),
      })
      .eq('id', shop.id)
      .select()
      .single()
    setSaving(false)
    if (error) {
      setMessage(error.message)
      return
    }
    if (data) {
      onShopUpdated(data as Shop)
      setMessage('Saved.')
    }
  }

  function captureLocation() {
    if (!navigator.geolocation) {
      setMessage('Location is not available in this browser.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude)
        setLng(pos.coords.longitude)
        setLocating(false)
      },
      () => {
        setMessage("Couldn't get your location — check your browser's location permission.")
        setLocating(false)
      },
      { enableHighAccuracy: false, timeout: 10000 },
    )
  }

  async function handleLogoUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `${shop.id}/logo-${Date.now()}.${ext}`
    const { error: uploadError } = await supabase.storage.from('shop-logos').upload(path, file, { upsert: true })
    if (uploadError) {
      setMessage(uploadError.message)
      setUploading(false)
      return
    }
    const { data: publicUrlData } = supabase.storage.from('shop-logos').getPublicUrl(path)
    const { data, error } = await supabase
      .from('shops')
      .update({ logo_url: publicUrlData.publicUrl })
      .eq('id', shop.id)
      .select()
      .single()
    setUploading(false)
    if (!error && data) onShopUpdated(data as Shop)
  }

  return (
    <div>
      <h1 className="mb-6 font-display text-2xl font-semibold text-bone">Settings</h1>

      <div className="mb-6 flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-md bg-panel2">
          {shop.logo_url ? (
            <img src={shop.logo_url} alt={shop.name} className="h-full w-full object-cover" />
          ) : (
            <span className="font-display text-xl font-bold text-mute">{shop.name.slice(0, 1)}</span>
          )}
        </div>
        <div>
          <label className="inline-block cursor-pointer rounded border border-line px-3 py-2 text-sm text-bone hover:bg-panel2">
            {uploading ? 'Uploading…' : 'Change logo'}
            <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={uploading} />
          </label>
        </div>
      </div>

      <div className="mb-8 max-w-md rounded-xl border border-line bg-panel p-5">
        <h2 className="mb-1 font-display text-sm font-semibold text-bone">Check-in kiosk &amp; TV display</h2>
        <p className="mb-4 text-xs text-mute">
          Branded, dedicated screens for {shop.name} — no login needed on the device. Open each link on the
          iPad or TV you'll use, then bookmark it (or add to the home screen) so it launches with one tap.
        </p>
        <LaunchLink
          label="Check-in kiosk"
          description="A walk-in client checks themselves in here."
          path={`/kiosk/${shop.slug}`}
        />
        <LaunchLink
          label="TV queue display"
          description="A read-only live board for the waiting room TV."
          path={`/display/${shop.slug}`}
        />
      </div>

      <div className="max-w-md space-y-4">
        <div>
          <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">Shop name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-line bg-panel2 px-3 py-2.5 text-sm text-bone"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">City</label>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full rounded border border-line bg-panel2 px-3 py-2.5 text-sm text-bone"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">Phone</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded border border-line bg-panel2 px-3 py-2.5 text-sm text-bone"
            />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">Address</label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full rounded border border-line bg-panel2 px-3 py-2.5 text-sm text-bone"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">Location</label>
          <p className="mb-2 text-xs text-mute">
            {lat != null && lng != null
              ? 'Pinned — clients browsing "near me" can find you.'
              : "Not set yet — you won't show up in nearby searches."}
          </p>
          <button
            type="button"
            onClick={captureLocation}
            disabled={locating}
            className="rounded border border-line px-3 py-2 text-sm text-bone hover:bg-panel2 disabled:opacity-50"
          >
            {locating ? 'Locating…' : lat != null ? '📍 Update to my current location' : '📍 Use my current location'}
          </button>
        </div>
        <div>
          <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">Accent color</label>
          <input
            type="color"
            value={accentColor}
            onChange={(e) => setAccentColor(e.target.value)}
            className="h-10 w-20 rounded border border-line bg-panel2"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">Opening hours</label>
          <p className="mb-2 text-xs text-mute">
            Shown on your shop page. While you're closed, clients can't check in — they see your
            next opening time instead.
          </p>
          <div className="space-y-2">
            {DAY_KEYS.map((key) => {
              const d = hours[key]
              return (
                <div key={key} className="flex items-center gap-2">
                  <span className="w-24 shrink-0 text-sm text-bone">{DAY_LABELS[key]}</span>
                  <label className="flex shrink-0 items-center gap-1.5 text-xs text-mute">
                    <input
                      type="checkbox"
                      checked={d.closed}
                      onChange={(e) => updateDay(key, { closed: e.target.checked })}
                    />
                    Closed
                  </label>
                  <input
                    type="time"
                    value={d.open}
                    disabled={d.closed}
                    onChange={(e) => updateDay(key, { open: e.target.value })}
                    className="rounded border border-line bg-panel2 px-2 py-1.5 text-sm text-bone disabled:opacity-40"
                  />
                  <span className="text-xs text-mute">to</span>
                  <input
                    type="time"
                    value={d.close}
                    disabled={d.closed}
                    onChange={(e) => updateDay(key, { close: e.target.value })}
                    className="rounded border border-line bg-panel2 px-2 py-1.5 text-sm text-bone disabled:opacity-40"
                  />
                </div>
              )
            })}
          </div>
          <p className="mt-2 text-xs text-mute">
            Hours are stored per day in local time. If saving fails with a "column does not exist" error, the
            shops.hours column hasn't been added yet — see the migration file in the repo (draft, not applied).
          </p>
        </div>
        {message && <p className="text-sm text-mute">{message}</p>}
        <button
          onClick={save}
          disabled={saving}
          className="rounded bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brandBright disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}

function LaunchLink({ label, description, path }: { label: string; description: string; path: string }) {
  const [copied, setCopied] = useState(false)

  async function copyLink() {
    await navigator.clipboard.writeText(`${window.location.origin}${path}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-line bg-panel2 px-4 py-3 last:mb-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-bone">{label}</p>
        <p className="truncate text-xs text-mute">{description}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          onClick={copyLink}
          className="rounded border border-line px-3 py-1.5 text-xs text-mute hover:bg-panel hover:text-bone"
        >
          {copied ? 'Copied!' : 'Copy link'}
        </button>
        <a
          href={path}
          target="_blank"
          rel="noreferrer"
          className="rounded bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brandBright"
        >
          Open
        </a>
      </div>
    </div>
  )
}
