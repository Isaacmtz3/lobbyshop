export type ProfileRole = 'client' | 'shop_owner' | 'staff' | 'agent' | 'admin'

export interface Profile {
  id: string
  role: ProfileRole
  full_name: string | null
  phone: string | null
  avatar_url: string | null
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
