import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { cancelRedemption, confirmRedemption } from '../lib/loyalty'
import type {
  Client,
  LoyaltyLedgerEntry,
  LoyaltyRedemption,
  LoyaltyReward,
  LoyaltySettings,
  Shop,
} from '../types'

function Stepper({
  value,
  onChange,
  label,
}: {
  value: number
  onChange: (next: number) => void
  label: string
}) {
  return (
    <div>
      <span className="mb-1.5 block text-xs uppercase tracking-wider text-mute">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(1, value - 1))}
          disabled={value <= 1}
          aria-label={`Decrease ${label}`}
          className="h-10 w-10 rounded border border-line bg-panel2 text-lg text-bone hover:bg-panel disabled:opacity-40"
        >
          −
        </button>
        <span className="w-16 text-center font-display text-lg font-bold text-bone">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(100, value + 1))}
          disabled={value >= 100}
          aria-label={`Increase ${label}`}
          className="h-10 w-10 rounded border border-line bg-panel2 text-lg text-bone hover:bg-panel disabled:opacity-40"
        >
          +
        </button>
        <span className="text-xs text-mute">pts (1–100)</span>
      </div>
    </div>
  )
}

const EMPTY_SETTINGS: Omit<LoyaltySettings, 'shop_id' | 'created_at' | 'updated_at'> = {
  enabled: false,
  points_per_visit: 10,
  welcome_bonus_enabled: false,
  welcome_bonus_points: 10,
}

/** Owner loyalty panel: one shop, shop-wide. Default OFF, and turning it
 * off stops new credits and new redemption requests — it never wipes
 * points clients already earned. */
export function LoyaltyPanel({ shop }: { shop: Shop }) {
  const [settings, setSettings] = useState(EMPTY_SETTINGS)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [rewards, setRewards] = useState<LoyaltyReward[]>([])
  const [ledger, setLedger] = useState<LoyaltyLedgerEntry[]>([])
  const [pending, setPending] = useState<LoyaltyRedemption[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [newRewardName, setNewRewardName] = useState('')
  const [newRewardCost, setNewRewardCost] = useState('100')
  const [addingReward, setAddingReward] = useState(false)

  async function loadSettings() {
    const { data } = await supabase
      .from('loyalty_settings')
      .select('*')
      .eq('shop_id', shop.id)
      .maybeSingle()
    if (data) {
      const s = data as LoyaltySettings
      setSettings({
        enabled: s.enabled,
        points_per_visit: s.points_per_visit,
        welcome_bonus_enabled: s.welcome_bonus_enabled,
        welcome_bonus_points: s.welcome_bonus_points,
      })
    }
    setSettingsLoaded(true)
  }

  async function loadRewards() {
    const { data } = await supabase
      .from('loyalty_rewards')
      .select('*')
      .eq('shop_id', shop.id)
      .order('sort_order')
      .order('points_cost')
    setRewards((data as LoyaltyReward[] | null) ?? [])
  }

  async function loadLedgerAndPending() {
    const [{ data: ledgerData }, { data: pendingData }, { data: clientData }] = await Promise.all([
      supabase.from('loyalty_ledger').select('*').eq('shop_id', shop.id).order('created_at', { ascending: false }).limit(200),
      supabase.from('loyalty_redemptions').select('*').eq('shop_id', shop.id).eq('status', 'pending').order('created_at'),
      supabase.from('clients').select('*').eq('shop_id', shop.id),
    ])
    setLedger((ledgerData as LoyaltyLedgerEntry[] | null) ?? [])
    setPending((pendingData as LoyaltyRedemption[] | null) ?? [])
    setClients((clientData as Client[] | null) ?? [])
  }

  useEffect(() => {
    loadSettings()
    loadRewards()
    loadLedgerAndPending()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shop.id])

  async function saveSettings(next: typeof settings) {
    setSettings(next)
    setSaving(true)
    setError(null)
    setMessage(null)
    const { error: upsertError } = await supabase.from('loyalty_settings').upsert(
      {
        shop_id: shop.id,
        enabled: next.enabled,
        points_per_visit: next.points_per_visit,
        welcome_bonus_enabled: next.welcome_bonus_enabled,
        welcome_bonus_points: next.welcome_bonus_points,
      },
      { onConflict: 'shop_id' },
    )
    setSaving(false)
    if (upsertError) {
      setError(upsertError.message)
      return
    }
    setMessage('Loyalty settings saved.')
  }

  async function addReward() {
    const cost = parseInt(newRewardCost, 10)
    if (!newRewardName.trim() || Number.isNaN(cost) || cost < 1) {
      setError('Enter a reward name and a points cost of 1 or more.')
      return
    }
    setAddingReward(true)
    setError(null)
    const { error: insertError } = await supabase.from('loyalty_rewards').insert({
      shop_id: shop.id,
      name: newRewardName.trim(),
      points_cost: cost,
      sort_order: rewards.length,
    })
    setAddingReward(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setNewRewardName('')
    setNewRewardCost('100')
    await loadRewards()
  }

  async function toggleRewardActive(reward: LoyaltyReward) {
    await supabase.from('loyalty_rewards').update({ active: !reward.active }).eq('id', reward.id)
    await loadRewards()
  }

  async function deleteReward(id: string) {
    await supabase.from('loyalty_rewards').delete().eq('id', id)
    await loadRewards()
  }

  async function handleConfirm(redemptionId: string) {
    setError(null)
    try {
      await confirmRedemption(redemptionId)
      setMessage('Reward confirmed — points deducted.')
      await loadLedgerAndPending()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not confirm that reward.')
    }
  }

  async function handleCancel(redemptionId: string) {
    setError(null)
    try {
      await cancelRedemption(redemptionId)
      await loadLedgerAndPending()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not cancel that request.')
    }
  }

  const pointsByClient = new Map<string, number>()
  for (const entry of ledger) {
    pointsByClient.set(entry.client_profile_id, (pointsByClient.get(entry.client_profile_id) ?? 0) + entry.points)
  }
  const nameFor = (profileId: string) =>
    clients.find((c) => c.profile_id === profileId)?.name ?? `Client ${profileId.slice(0, 8)}`

  return (
    <div>
      <h1 className="mb-2 font-display text-2xl font-semibold text-bone">Loyalty</h1>
      <p className="mb-6 max-w-2xl text-sm text-mute">
        One program for the whole shop. Clients earn points only on completed cuts — never for
        checking in, cancelling, or no-showing — and points never expire. Turning loyalty off
        stops new points and new requests, but never wipes points clients already earned.
      </p>

      {error && <p className="mb-4 text-sm text-crimsonBright">{error}</p>}
      {message && <p className="mb-4 text-sm text-volt">{message}</p>}

      {!settingsLoaded ? (
        <p className="text-mute">Loading loyalty settings…</p>
      ) : (
        <div className="mb-8 space-y-5 rounded-md border border-line bg-panel p-5">
          <label className="flex items-center justify-between gap-3">
            <span>
              <span className="block font-medium text-bone">Loyalty program</span>
              <span className="text-xs text-mute">Shop-wide. Off by default.</span>
            </span>
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) => saveSettings({ ...settings, enabled: e.target.checked })}
              className="h-6 w-12 shrink-0 appearance-none rounded-full bg-panel2 transition-colors checked:bg-brand"
              aria-label="Toggle loyalty program"
            />
          </label>

          <Stepper
            label="Points per completed visit"
            value={settings.points_per_visit}
            onChange={(v) => saveSettings({ ...settings, points_per_visit: v })}
          />

          <div>
            <label className="flex items-center justify-between gap-3">
              <span>
                <span className="block font-medium text-bone">Welcome bonus</span>
                <span className="text-xs text-mute">
                  New clients only — credited on their first completed visit here while this is on,
                  never on bare signup and never retroactively.
                </span>
              </span>
              <input
                type="checkbox"
                checked={settings.welcome_bonus_enabled}
                onChange={(e) => saveSettings({ ...settings, welcome_bonus_enabled: e.target.checked })}
                className="h-6 w-12 shrink-0 appearance-none rounded-full bg-panel2 transition-colors checked:bg-brand"
                aria-label="Toggle welcome bonus"
              />
            </label>
            {settings.welcome_bonus_enabled && (
              <div className="mt-3">
                <Stepper
                  label="Welcome bonus amount"
                  value={Math.max(1, settings.welcome_bonus_points)}
                  onChange={(v) => saveSettings({ ...settings, welcome_bonus_points: v })}
                />
              </div>
            )}
          </div>
          {saving && <p className="text-xs text-mute">Saving…</p>}
        </div>
      )}

      <h2 className="mb-4 font-display text-lg font-semibold text-bone">Rewards</h2>
      <p className="mb-4 text-sm text-mute">
        What clients see on their board for {shop.name}, with their progress toward each one.
        Example: Free beard trim at 50 pts, Free Haircut at 100 pts.
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        <input
          value={newRewardName}
          onChange={(e) => setNewRewardName(e.target.value)}
          placeholder="Reward name, e.g. Free Haircut"
          className="min-w-[200px] flex-1 rounded border border-line bg-panel2 px-3 py-2.5 text-sm text-bone"
        />
        <input
          value={newRewardCost}
          onChange={(e) => setNewRewardCost(e.target.value)}
          inputMode="numeric"
          placeholder="Points"
          aria-label="Points cost"
          className="w-28 rounded border border-line bg-panel2 px-3 py-2.5 text-sm text-bone"
        />
        <button
          onClick={addReward}
          disabled={addingReward}
          className="rounded bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brandBright disabled:opacity-40"
        >
          Add reward
        </button>
      </div>
      <div className="mb-10 divide-y divide-line rounded-md border border-line bg-panel">
        {rewards.length === 0 && <p className="px-5 py-8 text-center text-mute">No rewards yet.</p>}
        {rewards.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
            <span className={r.active ? 'text-bone' : 'text-mute line-through'}>
              {r.name} <span className="text-sm text-mute">· {r.points_cost} pts</span>
            </span>
            <div className="flex gap-3 text-xs">
              <button onClick={() => toggleRewardActive(r)} className="text-brandBright hover:underline">
                {r.active ? 'Deactivate' : 'Activate'}
              </button>
              <button onClick={() => deleteReward(r.id)} className="text-crimsonBright hover:underline">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      <h2 className="mb-4 font-display text-lg font-semibold text-bone">Redemptions waiting at the desk</h2>
      <div className="mb-10 divide-y divide-line rounded-md border border-line bg-panel">
        {pending.length === 0 && (
          <p className="px-5 py-8 text-center text-mute">
            No pending redemptions. When a client taps Redeem, it shows up here — confirm it at
            the desk and only then are their points deducted.
          </p>
        )}
        {pending.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
            <span className="text-sm text-bone">
              {nameFor(r.client_profile_id)} — {r.reward_name} ({r.points_cost} pts)
            </span>
            <div className="flex gap-3 text-xs">
              <button onClick={() => handleConfirm(r.id)} className="text-volt hover:underline">
                Confirm at desk
              </button>
              <button onClick={() => handleCancel(r.id)} className="text-crimsonBright hover:underline">
                Cancel
              </button>
            </div>
          </div>
        ))}
      </div>

      <h2 className="mb-4 font-display text-lg font-semibold text-bone">Client points at this shop</h2>
      <div className="divide-y divide-line rounded-md border border-line bg-panel">
        {pointsByClient.size === 0 && (
          <p className="px-5 py-8 text-center text-mute">No loyalty points earned here yet.</p>
        )}
        {[...pointsByClient.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([profileId, points]) => (
            <div key={profileId} className="flex items-center justify-between px-5 py-3 text-sm">
              <span className="text-bone">{nameFor(profileId)}</span>
              <span className="font-display font-bold text-bone">{points} pts</span>
            </div>
          ))}
      </div>
    </div>
  )
}
