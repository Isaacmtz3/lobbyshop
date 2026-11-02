import { supabase } from './supabase'
import type {
  LoyaltyLedgerEntry,
  LoyaltyRedemption,
  LoyaltyReward,
  LoyaltySettings,
  RecentShop,
  Shop,
} from '../types'

/** Client-safe loyalty helpers.
 *
 * Reads follow the same tenant rules as the rest of the app: a client only
 * ever sees their own ledger/redemptions, and a shop's program (settings +
 * active rewards) is the shop's public offer, not client data. Writes that
 * move points (credits, redemption requests/confirms) go through
 * security-definer RPCs in the loyalty migration so a client can never
 * mint their own points or deduct points they do not have. */

export async function fetchFavorites(userId: string): Promise<string[]> {
  const { data } = await supabase.from('loyalty_favorites').select('shop_id').eq('user_id', userId)
  return ((data as { shop_id: string }[] | null) ?? []).map((r) => r.shop_id)
}

export async function toggleFavorite(userId: string, shopId: string, isFavorite: boolean): Promise<void> {
  if (isFavorite) {
    await supabase.from('loyalty_favorites').delete().eq('user_id', userId).eq('shop_id', shopId)
  } else {
    await supabase.from('loyalty_favorites').insert({ user_id: userId, shop_id: shopId })
  }
}

export async function fetchRecentShops(): Promise<RecentShop[]> {
  const { data, error } = await supabase.rpc('my_recent_shops')
  if (error) throw error
  return (data as RecentShop[] | null) ?? []
}

export async function fetchShopsByIds(ids: string[]): Promise<Shop[]> {
  if (ids.length === 0) return []
  const { data } = await supabase.from('shops').select('*').in('id', ids).eq('is_active', true)
  return (data as Shop[] | null) ?? []
}

export async function fetchLoyaltySettings(shopIds: string[]): Promise<LoyaltySettings[]> {
  if (shopIds.length === 0) return []
  const { data } = await supabase.from('loyalty_settings').select('*').in('shop_id', shopIds)
  return (data as LoyaltySettings[] | null) ?? []
}

export async function fetchActiveRewards(shopIds: string[]): Promise<LoyaltyReward[]> {
  if (shopIds.length === 0) return []
  const { data } = await supabase
    .from('loyalty_rewards')
    .select('*')
    .in('shop_id', shopIds)
    .eq('active', true)
    .order('points_cost')
  return (data as LoyaltyReward[] | null) ?? []
}

export async function fetchMyLedger(userId: string): Promise<LoyaltyLedgerEntry[]> {
  const { data } = await supabase
    .from('loyalty_ledger')
    .select('*')
    .eq('client_profile_id', userId)
    .order('created_at', { ascending: false })
  return (data as LoyaltyLedgerEntry[] | null) ?? []
}

export async function fetchMyRedemptions(userId: string): Promise<LoyaltyRedemption[]> {
  const { data } = await supabase
    .from('loyalty_redemptions')
    .select('*')
    .eq('client_profile_id', userId)
    .order('created_at', { ascending: false })
  return (data as LoyaltyRedemption[] | null) ?? []
}

/** Public program for ONE shop (used on the shop profile page): its
 * settings plus its active rewards. Returns null settings when the shop
 * has never configured loyalty. */
export async function fetchShopLoyalty(shopId: string): Promise<{
  settings: LoyaltySettings | null
  rewards: LoyaltyReward[]
}> {
  const [{ data: settingsData }, { data: rewardsData }] = await Promise.all([
    supabase.from('loyalty_settings').select('*').eq('shop_id', shopId).maybeSingle(),
    supabase.from('loyalty_rewards').select('*').eq('shop_id', shopId).eq('active', true).order('points_cost'),
  ])
  return {
    settings: (settingsData as LoyaltySettings | null) ?? null,
    rewards: (rewardsData as LoyaltyReward[] | null) ?? [],
  }
}

/** Credit points for one completed queue entry. Best-effort by design:
 * the visit itself is already completed; a loyalty failure (e.g. the
 * migration has not been applied yet, or loyalty is off) must never
 * un-complete it. Returns the credited rows, or [] when nothing was due. */
export async function creditVisit(queueEntryId: string): Promise<{ kind: string; points: number }[]> {
  const { data, error } = await supabase.rpc('credit_loyalty_for_visit', {
    p_queue_entry_id: queueEntryId,
  })
  if (error) throw error
  return (data as { kind: string; points: number }[] | null) ?? []
}

export async function requestRedemption(shopId: string, rewardId: string): Promise<void> {
  const { error } = await supabase.rpc('request_loyalty_redemption', {
    p_shop_id: shopId,
    p_reward_id: rewardId,
  })
  if (error) throw error
}

export async function confirmRedemption(redemptionId: string): Promise<void> {
  const { error } = await supabase.rpc('confirm_loyalty_redemption', {
    p_redemption_id: redemptionId,
  })
  if (error) throw error
}

export async function cancelRedemption(redemptionId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_loyalty_redemption', {
    p_redemption_id: redemptionId,
  })
  if (error) throw error
}

export function balanceFor(ledger: LoyaltyLedgerEntry[], shopId: string): number {
  return ledger.filter((e) => e.shop_id === shopId).reduce((sum, e) => sum + e.points, 0)
}

export function ledgerLabel(kind: string): string {
  switch (kind) {
    case 'visit':
      return 'Completed visit'
    case 'welcome_bonus':
      return 'Welcome bonus'
    case 'redeem':
      return 'Reward redeemed'
    default:
      return kind
  }
}
