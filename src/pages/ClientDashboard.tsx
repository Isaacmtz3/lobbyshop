import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  balanceFor,
  cancelRedemption,
  fetchActiveRewards,
  fetchFavorites,
  fetchLoyaltySettings,
  fetchMyLedger,
  fetchMyRedemptions,
  fetchRecentShops,
  fetchShopsByIds,
  ledgerLabel,
  requestRedemption,
  toggleFavorite,
} from '../lib/loyalty'
import type {
  LoyaltyLedgerEntry,
  LoyaltyRedemption,
  LoyaltyReward,
  LoyaltySettings,
  Shop,
} from '../types'

function StarButton({
  isFavorite,
  onToggle,
  label,
}: {
  isFavorite: boolean
  onToggle: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      title={label}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-lg transition-colors ${
        isFavorite
          ? 'border-amber bg-amber/10 text-amber'
          : 'border-line bg-panel text-mute hover:text-amber'
      }`}
    >
      {isFavorite ? '★' : '☆'}
    </button>
  )
}

export function ClientDashboard() {
  const { user } = useAuth()
  const [shops, setShops] = useState<Shop[]>([])
  const [favorites, setFavorites] = useState<string[]>([])
  const [recent, setRecent] = useState<{ shop_id: string; last_completed_at: string }[]>([])
  const [settings, setSettings] = useState<LoyaltySettings[]>([])
  const [rewards, setRewards] = useState<LoyaltyReward[]>([])
  const [ledger, setLedger] = useState<LoyaltyLedgerEntry[]>([])
  const [redemptions, setRedemptions] = useState<LoyaltyRedemption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function load() {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const [favIds, recentRows, myLedger, myRedemptions] = await Promise.all([
        fetchFavorites(user.id),
        fetchRecentShops(),
        fetchMyLedger(user.id),
        fetchMyRedemptions(user.id),
      ])
      // Loyalty shops = anywhere this client actually has points, plus
      // favorites and recents (so their program shows even at 0 points).
      const ledgerShopIds = [...new Set(myLedger.map((e) => e.shop_id))]
      const shopIds = [...new Set([...favIds, ...recentRows.map((r) => r.shop_id), ...ledgerShopIds])]
      const [shopRows, settingsRows, rewardRows] = await Promise.all([
        fetchShopsByIds(shopIds),
        fetchLoyaltySettings(shopIds),
        fetchActiveRewards(shopIds),
      ])
      setFavorites(favIds)
      setRecent(recentRows)
      setLedger(myLedger)
      setRedemptions(myRedemptions)
      setShops(shopRows)
      setSettings(settingsRows)
      setRewards(rewardRows)
    } catch (e) {
      // Before the loyalty migration is applied, these tables/RPCs do not
      // exist yet. The dashboard must still load — it just shows the
      // pre-loyalty state (favorites/recent unavailable, browse link).
      setError(
        e instanceof Error
          ? e.message
          : 'Loyalty data is not available yet — the loyalty migration has not been applied.',
      )
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const shopById = useMemo(() => new Map(shops.map((s) => [s.id, s])), [shops])
  const settingsByShop = useMemo(() => new Map(settings.map((s) => [s.shop_id, s])), [settings])

  // Loyalty cards: recent shops first, then favorites, then any other shop
  // where the client holds points — each shop exactly once.
  const loyaltyShopIds = useMemo(() => {
    const ordered: string[] = []
    const push = (id: string) => {
      if (!ordered.includes(id)) ordered.push(id)
    }
    recent.forEach((r) => push(r.shop_id))
    favorites.forEach(push)
    ledger.forEach((e) => push(e.shop_id))
    return ordered
  }, [recent, favorites, ledger])

  async function handleToggleFavorite(shopId: string) {
    if (!user) return
    const isFav = favorites.includes(shopId)
    await toggleFavorite(user.id, shopId, isFav)
    setFavorites((prev) => (isFav ? prev.filter((id) => id !== shopId) : [...prev, shopId]))
  }

  async function handleRedeem(shopId: string, reward: LoyaltyReward) {
    setError(null)
    setNotice(null)
    try {
      await requestRedemption(shopId, reward.id)
      setNotice(`Redeem requested: ${reward.name}. Show this at the desk and the barber will confirm it.`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not request that reward.')
    }
  }

  async function handleCancelRedemption(redemptionId: string) {
    setError(null)
    try {
      await cancelRedemption(redemptionId)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not cancel that request.')
    }
  }

  if (loading) {
    return <div className="mx-auto max-w-6xl px-5 py-10 text-mute">Loading your dashboard…</div>
  }

  const favoriteShops = favorites.map((id) => shopById.get(id)).filter((s): s is Shop => !!s)
  const recentShops = recent
    .map((r) => ({ shop: shopById.get(r.shop_id), last: r.last_completed_at }))
    .filter((x): x is { shop: Shop; last: string } => !!x.shop)

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-brandBright">My dashboard</p>
          <h1 className="font-display text-3xl font-bold text-bone">Your shops &amp; points</h1>
          <p className="mt-2 max-w-lg text-sm text-mute">
            Your favorites, the shops you have actually visited, and the loyalty points you have
            earned at each one. Points stay at the shop where you earned them — they never expire.
          </p>
        </div>
        <Link
          to="/browse"
          className="rounded bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brandBright"
        >
          Browse shops
        </Link>
      </div>

      {error && <p className="mb-6 rounded-md border border-line bg-panel p-4 text-sm text-crimsonBright">{error}</p>}
      {notice && <p className="mb-6 rounded-md border border-line bg-panel p-4 text-sm text-volt">{notice}</p>}

      {/* Favorites */}
      <section className="mb-10">
        <h2 className="mb-4 font-display text-lg font-semibold text-bone">★ Favorite shops</h2>
        {favoriteShops.length === 0 ? (
          <p className="rounded-md border border-line bg-panel p-5 text-sm text-mute">
            No favorites yet. Tap the ☆ on any shop card or shop page to pin it here.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {favoriteShops.map((shop) => (
              <div key={shop.id} className="relative rounded-md border border-line bg-panel p-4">
                <div className="absolute right-3 top-3">
                  <StarButton
                    isFavorite
                    onToggle={() => handleToggleFavorite(shop.id)}
                    label={`Remove ${shop.name} from favorites`}
                  />
                </div>
                <Link to={`/shop/${shop.slug}`} className="block pr-10">
                  <div className="mb-3 flex h-16 w-16 items-center justify-center overflow-hidden rounded-md bg-panel2">
                    {shop.logo_url ? (
                      <img src={shop.logo_url} alt={shop.name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="font-display text-xl font-bold text-mute">{shop.name.slice(0, 1)}</span>
                    )}
                  </div>
                  <h3 className="font-display font-semibold text-bone">{shop.name}</h3>
                  <p className="text-xs text-mute">{shop.city || ' '}</p>
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent shops */}
      <section className="mb-10">
        <h2 className="mb-4 font-display text-lg font-semibold text-bone">Recent shops</h2>
        {recentShops.length === 0 ? (
          <p className="rounded-md border border-line bg-panel p-5 text-sm text-mute">
            No completed visits yet. Check in at a shop and, once the barber marks your cut complete,
            it will show up here.
          </p>
        ) : (
          <div className="divide-y divide-line rounded-md border border-line bg-panel">
            {recentShops.map(({ shop, last }) => (
              <div key={shop.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <Link to={`/shop/${shop.slug}`} className="min-w-0 flex-1">
                  <p className="truncate font-medium text-bone">{shop.name}</p>
                  <p className="text-xs text-mute">
                    Last visit {new Date(last).toLocaleDateString()}
                    {shop.city ? ` · ${shop.city}` : ''}
                  </p>
                </Link>
                <StarButton
                  isFavorite={favorites.includes(shop.id)}
                  onToggle={() => handleToggleFavorite(shop.id)}
                  label={favorites.includes(shop.id) ? `Remove ${shop.name} from favorites` : `Favorite ${shop.name}`}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Per-shop loyalty cards */}
      <section>
        <h2 className="mb-4 font-display text-lg font-semibold text-bone">Loyalty</h2>
        {loyaltyShopIds.length === 0 ? (
          <p className="rounded-md border border-line bg-panel p-5 text-sm text-mute">
            You have 0 points so far. Visit a shop that has loyalty turned on and finish a cut to
            start earning.
          </p>
        ) : (
          <div className="space-y-6">
            {loyaltyShopIds.map((shopId) => {
              const shop = shopById.get(shopId)
              if (!shop) return null
              const setting = settingsByShop.get(shopId)
              const points = balanceFor(ledger, shopId)
              const shopRewards = rewards.filter((r) => r.shop_id === shopId)
              const pending = redemptions.filter((r) => r.shop_id === shopId && r.status === 'pending')
              const history = ledger.filter((e) => e.shop_id === shopId).slice(0, 10)
              return (
                <div key={shopId} className="rounded-md border border-line bg-panel p-5">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <Link to={`/shop/${shop.slug}`} className="font-display text-lg font-semibold text-bone hover:underline">
                      {shop.name}
                    </Link>
                    <span className="shrink-0 font-display text-2xl font-bold" style={{ color: shop.accent_color }}>
                      {points} pts
                    </span>
                  </div>
                  {!setting || !setting.enabled ? (
                    <p className="text-sm text-mute">
                      Loyalty is not turned on at this shop right now.
                      {points > 0 && ' Your existing points are kept and still show here.'}
                    </p>
                  ) : (
                    <>
                      <p className="mb-4 text-xs text-mute">
                        {setting.points_per_visit} pts per completed visit
                        {setting.welcome_bonus_enabled && setting.welcome_bonus_points > 0
                          ? ` · ${setting.welcome_bonus_points} pt welcome bonus on your first completed visit`
                          : ''}
                      </p>
                      {shopRewards.length === 0 ? (
                        <p className="text-sm text-mute">
                          This shop has loyalty on but has not added any rewards yet.
                        </p>
                      ) : (
                        <ul className="space-y-3">
                          {shopRewards.map((reward) => {
                            const remaining = Math.max(0, reward.points_cost - points)
                            const pct = Math.min(100, Math.round((points / reward.points_cost) * 100))
                            const pendingForReward = pending.find((p) => p.reward_id === reward.id)
                            return (
                              <li key={reward.id} className="rounded-md border border-line bg-panel2 p-4">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="font-medium text-bone">{reward.name}</span>
                                  <span className="text-sm text-mute">{reward.points_cost} pts</span>
                                </div>
                                <div className="mt-2 h-2 overflow-hidden rounded-full bg-panel">
                                  <div
                                    className="h-full rounded-full"
                                    style={{ width: `${pct}%`, backgroundColor: shop.accent_color }}
                                  />
                                </div>
                                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-xs text-mute">
                                    {remaining === 0 ? 'Ready to redeem' : `${remaining} pts to go · ${pct}%`}
                                  </span>
                                  {pendingForReward ? (
                                    <span className="flex items-center gap-2 text-xs">
                                      <span className="text-amber">Pending — show at the desk</span>
                                      <button
                                        onClick={() => handleCancelRedemption(pendingForReward.id)}
                                        className="text-crimsonBright hover:underline"
                                      >
                                        Cancel
                                      </button>
                                    </span>
                                  ) : (
                                    <button
                                      onClick={() => handleRedeem(shopId, reward)}
                                      disabled={remaining > 0}
                                      className="rounded bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brandBright disabled:opacity-40"
                                    >
                                      Redeem
                                    </button>
                                  )}
                                </div>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </>
                  )}
                  {history.length > 0 && (
                    <div className="mt-5 border-t border-line pt-4">
                      <p className="mb-2 text-xs uppercase tracking-wider text-mute">Points history</p>
                      <ul className="space-y-1 text-sm">
                        {history.map((e) => (
                          <li key={e.id} className="flex justify-between gap-3 text-mute">
                            <span>
                              {ledgerLabel(e.kind)}
                              {e.note && e.kind !== 'visit' && e.kind !== 'welcome_bonus' ? ` — ${e.note}` : ''}
                              <span className="text-xs"> · {new Date(e.created_at).toLocaleDateString()}</span>
                            </span>
                            <span className={e.points > 0 ? 'text-volt' : 'text-crimsonBright'}>
                              {e.points > 0 ? `+${e.points}` : e.points}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
