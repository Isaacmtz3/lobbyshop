export type ProfileRole = 'client' | 'shop_owner' | 'staff' | 'agent' | 'admin'

export interface Profile {
  id: string
  role: ProfileRole
  full_name: string | null
  phone: string | null
  avatar_url: string | null
  city: string | null
  state: string | null
  created_at: string
}

export interface Shop {
  id: string
  owner_id: string
  name: string
  slug: string
  city: string | null
  address: string | null
  phone: string | null
  description: string | null
  logo_url: string | null
  accent_color: string
  is_active: boolean
  lat: number | null
  lng: number | null
  // "Walk-ins starting at" price shown on the browse card (cents). NULL =
  // not set: the card hides the badge.
  walkin_price_cents: number | null
  // Per-day opening hours (jsonb). NULL = hours not set: the app treats the
  // shop as open and does not block check-in. See src/lib/hours.ts.
  hours: ShopHours | null
  created_at: string
}

// One day's opening hours. Times are local "HH:MM" (24-hour) strings;
// close must be after open on the same day (no overnight hours).
export interface DayHours {
  closed: boolean
  open: string
  close: string
}

export type ShopHours = Record<string, DayHours>

export interface ShopService {
  id: string
  shop_id: string
  name: string
  price_cents: number
  duration_min: number | null
  active: boolean
  sort_order: number
  created_at: string
}

export interface ShopQueueStats {
  shop_id: string
  waiting_count: number
  in_chair_count: number
  completed_today: number
}

export interface Barber {
  id: string
  shop_id: string
  name: string
  active: boolean
  created_at: string
}

export type QueueStatus = 'waiting' | 'called' | 'in_chair' | 'completed' | 'cancelled' | 'no_show'

export const ETA_OPTIONS = [5, 10, 15] as const
export type EtaMinutes = (typeof ETA_OPTIONS)[number]

export interface QueueEntry {
  id: string
  shop_id: string
  client_name: string
  phone: string | null
  email: string | null
  service: string
  barber_id: string | null
  status: QueueStatus
  position: number | null
  eta_minutes: number | null
  client_profile_id: string | null
  checked_in_by: string | null
  checked_in_at: string
  called_at: string | null
  completed_at: string | null
}

export interface MyQueuePosition {
  id: string
  shop_id: string
  barber_id: string | null
  service: string
  status: QueueStatus
  eta_minutes: number | null
  checked_in_at: string
  called_at: string | null
  position: number | null
}

export interface ShopQueueBoardEntry {
  id: string
  shop_id: string
  display_name: string
  status: QueueStatus
  barber_id: string | null
  service: string
  checked_in_at: string
  called_at: string | null
  position: number | null
}

export interface Client {
  id: string
  shop_id: string
  profile_id: string | null
  name: string
  phone: string | null
  visit_count: number
  last_visit: string | null
  tier: string
  created_at: string
}

// --- Loyalty (v1, 2026-10-28 spec) ---------------------------------------
// All loyalty rows are shop-scoped by shop_id. Points are per shop, never
// pooled across shops, and never expire. A client only ever reads their own
// ledger/redemptions; a shop only ever reads its own clients' rows (plus
// the platform admin, the existing Command Center exception).

export interface LoyaltySettings {
  shop_id: string
  enabled: boolean
  /** Points awarded per completed/served visit. Owner stepper: 1-100. */
  points_per_visit: number
  welcome_bonus_enabled: boolean
  /** Bonus points for a new client, credited on their first completed
   * visit at this shop while the bonus toggle is on. Owner stepper: 1-100. */
  welcome_bonus_points: number
  created_at: string
  updated_at: string
}

export interface LoyaltyReward {
  id: string
  shop_id: string
  name: string
  points_cost: number
  active: boolean
  sort_order: number
  created_at: string
}

export type LoyaltyLedgerKind = 'visit' | 'welcome_bonus' | 'redeem'

export interface LoyaltyLedgerEntry {
  id: string
  shop_id: string
  client_profile_id: string
  /** The queue entry this credit came from. Visit rows always carry it,
   * which is what makes visit credits idempotent (one credit per queue
   * entry). Welcome-bonus rows carry NULL here and are instead made
   * one-per-client-per-shop by a partial unique index. */
  queue_entry_id: string | null
  reward_id: string | null
  redemption_id: string | null
  kind: LoyaltyLedgerKind
  /** Positive for credits, negative for a confirmed redemption. */
  points: number
  note: string | null
  created_at: string
}

export type LoyaltyRedemptionStatus = 'pending' | 'confirmed' | 'cancelled'

export interface LoyaltyRedemption {
  id: string
  shop_id: string
  client_profile_id: string
  reward_id: string | null
  /** Snapshot at request time, so a later reward edit/delete never
   * rewrites what the client asked to redeem. */
  reward_name: string
  points_cost: number
  status: LoyaltyRedemptionStatus
  created_at: string
  confirmed_at: string | null
  cancelled_at: string | null
}

/** One distinct shop from the signed-in client's own completed visits,
 * most recent first. Returned by the my_recent_shops RPC. */
export interface RecentShop {
  shop_id: string
  last_completed_at: string
}
