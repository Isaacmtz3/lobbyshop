import { useEffect, useState, type ChangeEvent } from 'react'
import { supabase } from '../lib/supabase'
import {
  DAY_KEYS,
  DAY_LABELS,
  defaultShopHours,
  parseShopHours,
} from '../lib/hours'
import type { Barber, Client, QueueEntry, Shop, ShopHours } from '../types'

type Tab = 'overview' | 'queue' | 'clients' | 'barbers' | 'settings'

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
  const [completedToday, setCompletedToday] = useState(0)

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

  async function loadStats() {
    const { data } = await supabase.from('shop_queue_stats').select('*').eq('shop_id', shop.id).maybeSingle()
    setCompletedToday(data?.completed_today ?? 0)
  }

  useEffect(() => {
    loadQueue()
    loadClients()
    loadBarbers()
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

  async function callEntry(id: string) {
    await supabase.from('queue').update({ status: 'called', called_at: new Date().toISOString() }).eq('id', id)
  }
  async function callNext() {
    const next = waiting[0]
    if (next) await callEntry(next.id)
  }
  async function confirmArrived(id: string) {
    await supabase.from('queue').update({ status: 'in_chair' }).eq('id', id)
  }
  async function markNoShow(id: string) {
    await supabase.from('queue').update({ status: 'no_show' }).eq('id', id)
  }
  async function completeEntry(id: string) {
    await supabase.from('queue').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', id)
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
              ['settings', 'Settings'],
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
        {tab === 'overview' && (
          <OverviewTab
            waiting={waiting.length}
            called={called.length}
            inChair={inChair.length}
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
            onCallNext={callNext}
            onCall={callEntry}
            onConfirmArrived={confirmArrived}
            onNoShow={markNoShow}
            onComplete={completeEntry}
            onRemove={removeEntry}
            onQueueChanged={loadQueue}
          />
        )}
        {tab === 'clients' && <ClientsTab clients={clients} />}
        {tab === 'barbers' && <BarbersTab shopId={shop.id} barbers={barbers} onChange={loadBarbers} />}
        {tab === 'settings' && <SettingsTab shop={shop} onShopUpdated={onShopUpdated} />}
      </main>
    </div>
  )
}

function OverviewTab({
  waiting,
  called,
  inChair,
  completedToday,
  accent,
}: {
  waiting: number
  called: number
  inChair: number
  completedToday: number
  accent: string
}) {
  return (
    <div>
      <h1 className="mb-6 font-display text-2xl font-semibold text-bone">Overview</h1>
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-md border border-line bg-panel p-5">
          <p className="mb-2 text-xs uppercase tracking-wider text-mute">Waiting</p>
          <p className="font-display text-3xl font-bold" style={{ color: accent }}>
            {waiting}
          </p>
        </div>
        <div className="rounded-md border border-line bg-panel p-5">
          <p className="mb-2 text-xs uppercase tracking-wider text-mute">Called</p>
          <p className="font-display text-3xl font-bold text-amber">{called}</p>
        </div>
        <div className="rounded-md border border-line bg-panel p-5">
          <p className="mb-2 text-xs uppercase tracking-wider text-mute">In chair</p>
          <p className="font-display text-3xl font-bold text-volt">{inChair}</p>
        </div>
        <div className="rounded-md border border-line bg-panel p-5">
          <p className="mb-2 text-xs uppercase tracking-wider text-mute">Completed today</p>
          <p className="font-display text-3xl font-bold text-bone">{completedToday}</p>
        </div>
      </div>
      <div className="rounded-md border border-line bg-panel p-5">
        <h2 className="mb-4 font-display text-sm uppercase tracking-wider text-mute">Right now</h2>
        <p className="text-sm text-mute">
          {waiting + called + inChair === 0
            ? "Shop's quiet — no one checked in."
            : `${waiting} waiting, ${called} called, ${inChair} in the chair.`}
        </p>
      </div>
    </div>
  )
}

const CALLED_GRACE_MINUTES = 10

// Same service list the client check-in forms use — there is no per-shop
// services table yet, so the owner adds walk-ins from this shared list.
const WALK_IN_SERVICES = ['Haircut', 'Haircut + Beard', 'Beard trim', 'Kids cut']

function expectedArrival(entry: QueueEntry): string {
  if (entry.eta_minutes == null) return '—'
  const base = new Date(entry.checked_in_at).getTime() + entry.eta_minutes * 60_000
  return `${entry.eta_minutes} min (by ${new Date(base).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })})`
}

function QueueTab({
  shopId,
  waiting,
  called,
  inChair,
  barbers,
  onCallNext,
  onCall,
  onConfirmArrived,
  onNoShow,
  onComplete,
  onRemove,
  onQueueChanged,
}: {
  shopId: string
  waiting: QueueEntry[]
  called: QueueEntry[]
  inChair: QueueEntry[]
  barbers: Barber[]
  onCallNext: () => void
  onCall: (id: string) => void
  onConfirmArrived: (id: string) => void
  onNoShow: (id: string) => void
  onComplete: (id: string) => void
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

  const [walkInName, setWalkInName] = useState('')
  const [walkInPhone, setWalkInPhone] = useState('')
  const [walkInService, setWalkInService] = useState(WALK_IN_SERVICES[0])
  const [walkInBarberId, setWalkInBarberId] = useState('')
  const [walkInSaving, setWalkInSaving] = useState(false)
  const [walkInError, setWalkInError] = useState<string | null>(null)

  // A walk-in standing at the desk: same queue row the kiosk creates, but
  // entered by the owner so a dead iPad never blocks the line.
  async function handleAddWalkIn() {
    if (!walkInName.trim()) return
    setWalkInSaving(true)
    setWalkInError(null)
    const { error: insertError } = await supabase.from('queue').insert({
      shop_id: shopId,
      client_name: walkInName.trim(),
      phone: walkInPhone.trim() || null,
      service: walkInService,
      barber_id: walkInBarberId || null,
    })
    setWalkInSaving(false)
    if (insertError) {
      setWalkInError(insertError.message)
      return
    }
    setWalkInName('')
    setWalkInPhone('')
    setWalkInService(WALK_IN_SERVICES[0])
    setWalkInBarberId('')
    onQueueChanged()
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-bone">Live queue</h1>
        <button
          onClick={onCallNext}
          disabled={waiting.length === 0}
          className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brandBright disabled:opacity-40"
        >
          Call next client {waiting.length > 0 && `(${waiting.length} waiting)`}
        </button>
      </div>

      <div className="mb-6 rounded-md border border-line bg-panel p-5">
        <h2 className="mb-4 font-display text-sm uppercase tracking-wider text-mute">Add a walk-in</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">Client name</label>
            <input
              value={walkInName}
              onChange={(e) => setWalkInName(e.target.value)}
              placeholder="Walk-in client"
              className="w-full rounded border border-line bg-panel2 px-3 py-2.5 text-sm text-bone"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">Phone (optional)</label>
            <input
              type="tel"
              value={walkInPhone}
              onChange={(e) => setWalkInPhone(e.target.value)}
              className="w-full rounded border border-line bg-panel2 px-3 py-2.5 text-sm text-bone"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">Service</label>
            <select
              value={walkInService}
              onChange={(e) => setWalkInService(e.target.value)}
              className="w-full rounded border border-line bg-panel2 px-3 py-2.5 text-sm text-bone"
            >
              {WALK_IN_SERVICES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-mute">Barber (optional)</label>
            <select
              value={walkInBarberId}
              onChange={(e) => setWalkInBarberId(e.target.value)}
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
        {walkInError && <p className="mt-3 text-sm text-crimsonBright">{walkInError}</p>}
        <button
          onClick={handleAddWalkIn}
          disabled={walkInSaving || !walkInName.trim()}
          className="mt-4 rounded bg-brand px-4 py-2.5 text-sm font-medium text-bone transition-colors hover:bg-brandBright disabled:opacity-40"
        >
          {walkInSaving ? 'Adding…' : 'Add to queue'}
        </button>
      </div>

      <div className="overflow-x-auto rounded-md border border-line bg-panel">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-mute">
              <th className="px-5 py-3 font-medium">Client</th>
              <th className="px-5 py-3 font-medium">Service</th>
              <th className="px-5 py-3 font-medium">Barber</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Expected arrival</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {[...inChair, ...called, ...waiting].length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-mute">
                  No one in the queue.
                </td>
              </tr>
            )}
            {inChair.map((entry) => (
              <tr key={entry.id} className="border-b border-line last:border-0">
                <td className="px-5 py-3 text-bone">{entry.client_name}</td>
                <td className="px-5 py-3 text-mute">{entry.service}</td>
                <td className="px-5 py-3 text-mute">{barberName(entry.barber_id)}</td>
                <td className="px-5 py-3 text-volt">In chair</td>
                <td className="px-5 py-3 text-mute">—</td>
                <td className="px-5 py-3 text-right">
                  <button onClick={() => onComplete(entry.id)} className="text-xs text-brandBright hover:underline">
                    Complete
                  </button>
                </td>
              </tr>
            ))}
            {called.map((entry) => {
              const minutesAgo = entry.called_at ? (Date.now() - new Date(entry.called_at).getTime()) / 60_000 : 0
              const stuck = minutesAgo >= CALLED_GRACE_MINUTES
              return (
                <tr key={entry.id} className={`border-b border-line last:border-0 ${stuck ? 'bg-amber/5' : ''}`}>
                  <td className="px-5 py-3 text-bone">{entry.client_name}</td>
                  <td className="px-5 py-3 text-mute">{entry.service}</td>
                  <td className="px-5 py-3 text-mute">{barberName(entry.barber_id)}</td>
                  <td className={`px-5 py-3 ${stuck ? 'text-amber' : 'text-mute'}`}>
                    Called {Math.round(minutesAgo)}m ago
                    {stuck && <span className="ml-1">⚠</span>}
                  </td>
                  <td className="px-5 py-3 text-mute">{expectedArrival(entry)}</td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => onConfirmArrived(entry.id)}
                      className="mr-3 text-xs text-brandBright hover:underline"
                    >
                      They arrived
                    </button>
                    <button onClick={() => onNoShow(entry.id)} className="text-xs text-crimsonBright hover:underline">
                      No-show
                    </button>
                  </td>
                </tr>
              )
            })}
            {waiting.map((entry) => (
              <tr key={entry.id} className="border-b border-line last:border-0">
                <td className="px-5 py-3 text-bone">{entry.client_name}</td>
                <td className="px-5 py-3 text-mute">{entry.service}</td>
                <td className="px-5 py-3 text-mute">{barberName(entry.barber_id)}</td>
                <td className="px-5 py-3 text-mute">Waiting</td>
                <td className="px-5 py-3 text-mute">{expectedArrival(entry)}</td>
                <td className="px-5 py-3 text-right">
                  <button onClick={() => onCall(entry.id)} className="mr-3 text-xs text-brandBright hover:underline">
                    Call
                  </button>
                  <button onClick={() => onRemove(entry.id)} className="text-xs text-crimsonBright hover:underline">
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ClientsTab({ clients }: { clients: Client[] }) {
  return (
    <div>
      <h1 className="mb-6 font-display text-2xl font-semibold text-bone">Clients</h1>
      <div className="overflow-x-auto rounded-md border border-line bg-panel">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-mute">
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Phone</th>
              <th className="px-5 py-3 font-medium">Visits</th>
              <th className="px-5 py-3 font-medium">Tier</th>
              <th className="px-5 py-3 font-medium">Last visit</th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-mute">
                  No client records yet.
                </td>
              </tr>
            )}
            {clients.map((c) => (
              <tr key={c.id} className="border-b border-line last:border-0">
                <td className="px-5 py-3 text-bone">{c.name}</td>
                <td className="px-5 py-3 text-mute">{c.phone ?? '—'}</td>
                <td className="px-5 py-3 text-mute">{c.visit_count}</td>
                <td className="px-5 py-3 text-mute">{c.tier}</td>
                <td className="px-5 py-3 text-mute">{c.last_visit ? new Date(c.last_visit).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
          className="rounded bg-brand px-4 py-2.5 text-sm font-medium text-bone transition-colors hover:bg-brandBright disabled:opacity-40"
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
            Shown on your shop page. While you're closed, guests and clients can't check in — they see your
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
          className="rounded bg-brand px-4 py-2.5 text-sm font-medium text-bone transition-colors hover:bg-brandBright disabled:opacity-40"
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
          className="rounded bg-brand px-3 py-1.5 text-xs font-medium text-bone hover:bg-brandBright"
        >
          Open
        </a>
      </div>
    </div>
  )
}
